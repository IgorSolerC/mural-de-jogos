import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { base64url, hex, sha256, utf8 } from './bytes';
import { write } from './quota';

/**
 * As sessões do cofre (8.1). O token (32 bytes sorteados) vive só na memória da página; aqui fica só o
 * hash dele.
 *
 * - `entrada`: depois do Google, 5 minutos para abrir o cofre (ou criá-lo). Não lê nada do cofre.
 * - `cofre`: com o cofre aberto. Acaba com 10 minutos parada ou 8 horas no total, o que vier antes.
 */
export type SessionKind = 'entrada' | 'cofre';

export const ENTRY_MS = 5 * 60_000;
/**
 * Para quem ainda não tem cofre, a entrada vale mais: criar leva tempo (copiar a frase sorteada no papel,
 * registrar os aparelhos), e ainda não há nada a proteger. Ela some quando o cofre é criado.
 */
export const ENTRY_CREATE_MS = 20 * 60_000;
export const VAULT_IDLE_MS = 10 * 60_000;
export const VAULT_MAX_MS = 8 * 3_600_000;
/** Quanto tempo a passkey (ou o código) conferida vale para a tentativa de senha que vem logo depois. */
export const FACTOR_MS = 2 * 60_000;
/** A sessão do cofre só anota o "usada agora" de minuto em minuto (cada anotação é uma gravação). */
const TOUCH_MS = 60_000;

export type Factor = 'passkey' | 'recuperacao';

export interface Session {
  hash: string;
  userId: string;
  /** O código da conta do Murall, sem o traço. */
  code: string;
  kind: SessionKind;
  device: string | null;
  /** Só na de entrada: o segundo fator conferido, se ainda vale. */
  factor: Factor | null;
  /** Só na do cofre: aberta com o código de recuperação. */
  recovered: boolean;
  /** Só na de entrada aberta pela carência do aparelho (17.23): o id dela. A marca do fator vem junto. */
  grace: string | null;
}

export function newToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  return hex(await sha256(utf8(token)));
}

/**
 * Cria a sessão de entrada e apaga as vencidas da mesma conta (contam 4 linhas: a linha e 3 índices). Pela
 * carência do aparelho (`grace`, 17.23), no lugar do Google e da passkey, ela já nasce com a marca do
 * segundo fator (vale `FACTOR_MS`, para uma tentativa de senha) e o id da carência.
 */
export function entrySessionStatements(hash: string, userId: string, code: string, device: string | null, now: Date, ttlMs = ENTRY_MS, grace: string | null = null): Statement[] {
  const at = now.toISOString();
  return [
    { sql: 'DELETE FROM cofre_sessoes WHERE usuario_id = ? AND expira_em <= ?', params: [userId, at] },
    {
      sql: "INSERT INTO cofre_sessoes (hash, usuario_id, tipo, codigo, criada_em, usada_em, expira_em, aparelho, fator, fator_ate, carencia) VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        hash,
        userId,
        code,
        at,
        at,
        new Date(now.getTime() + ttlMs).toISOString(),
        device,
        grace ? 'passkey' : null,
        grace ? new Date(now.getTime() + FACTOR_MS).toISOString() : null,
        grace,
      ],
    },
  ];
}

/**
 * Troca a sessão de entrada pela do cofre aberto: a de entrada some (vale para uma abertura só) e a nova
 * nasce com o prazo máximo de 8 horas.
 */
export function vaultSessionStatements(entry: Session, hash: string, recovered: boolean, now: Date): Statement[] {
  const at = now.toISOString();
  return [
    { sql: 'DELETE FROM cofre_sessoes WHERE hash = ?', params: [entry.hash] },
    {
      sql: "INSERT INTO cofre_sessoes (hash, usuario_id, tipo, codigo, criada_em, usada_em, expira_em, aparelho, recuperada) VALUES (?, ?, 'cofre', ?, ?, ?, ?, ?, ?)",
      params: [hash, entry.userId, entry.code, at, at, new Date(now.getTime() + VAULT_MAX_MS).toISOString(), entry.device, recovered ? 1 : 0],
    },
  ];
}

/**
 * Marca, na sessão de entrada, que o segundo fator acabou de ser conferido (vale `FACTOR_MS`). A passkey ou
 * o código conferidos agora valem por si: a sessão deixa de ser da carência (17.23), e a tentativa de senha
 * que vem não conta nos erros dela.
 */
export function factorStatement(session: Session, factor: Factor, now: Date): Statement {
  return {
    sql: 'UPDATE cofre_sessoes SET fator = ?, fator_ate = ?, carencia = NULL WHERE hash = ?',
    params: [factor, new Date(now.getTime() + FACTOR_MS).toISOString(), session.hash],
  };
}

export const invalidSession = () => new HttpError(401, 'sessao-invalida', 'Sua sessão acabou. Entre de novo.');

interface SessionRow {
  usuario_id: string;
  codigo: string;
  tipo: SessionKind;
  usada_em: string;
  expira_em: string;
  aparelho: string | null;
  fator: Factor | null;
  fator_ate: string | null;
  recuperada: number;
  carencia: string | null;
}

/**
 * Quem está chamando, pelo `Authorization: Bearer <token>`, com uma sessão de um dos tipos aceitos. A do
 * cofre também acaba com 10 minutos parada; usar renova esse prazo (sem passar das 8 horas).
 */
export async function authenticate(deps: Deps, header: string | undefined, kinds: readonly SessionKind[]): Promise<Session> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
  if (!match) throw invalidSession();
  return sessionOfToken(deps, match[1]!, kinds);
}

export async function sessionOfToken(deps: Deps, token: string, kinds: readonly SessionKind[]): Promise<Session> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalidSession();
  const hash = await hashToken(token);
  const row = await deps.db.first<SessionRow>(
    'SELECT usuario_id, codigo, tipo, usada_em, expira_em, aparelho, fator, fator_ate, recuperada, carencia FROM cofre_sessoes WHERE hash = ?',
    [hash],
  );
  const now = deps.now().getTime();
  if (!row || !kinds.includes(row.tipo) || Date.parse(row.expira_em) <= now) throw invalidSession();
  if (row.tipo === 'cofre') {
    const idle = now - Date.parse(row.usada_em);
    if (idle >= VAULT_IDLE_MS) throw invalidSession();
    if (idle >= TOUCH_MS && deps.config.mode !== 'desligado') {
      try {
        await write(deps, [{ sql: 'UPDATE cofre_sessoes SET usada_em = ? WHERE hash = ?', params: [new Date(now).toISOString(), hash] }], 2, { session: true });
      } catch (error) {
        // sem cota: a sessão continua até o prazo que já tinha (e tranca mais cedo, o lado seguro)
        if (!(error instanceof HttpError)) throw error;
      }
    }
  }
  const factorValid = row.fator !== null && row.fator_ate !== null && Date.parse(row.fator_ate) > now;
  return {
    hash,
    userId: row.usuario_id,
    code: row.codigo,
    kind: row.tipo,
    device: row.aparelho,
    factor: factorValid ? row.fator : null,
    recovered: row.recuperada === 1,
    grace: row.carencia,
  };
}
