import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { base64url, hex, sha256, utf8 } from './bytes';

/**
 * As sessões do cofre (8.1). O token (32 bytes sorteados) vive só na memória da página; aqui fica só o
 * hash dele.
 *
 * - `entrada`: depois do Google, 5 minutos para abrir o cofre (ou criá-lo). Não lê nada do cofre.
 * - `cofre`: com o cofre aberto (parte 4).
 */
export type SessionKind = 'entrada' | 'cofre';

export const ENTRY_MS = 5 * 60_000;

export interface Session {
  hash: string;
  userId: string;
  /** O código da conta do Murall, sem o traço. */
  code: string;
  kind: SessionKind;
  device: string | null;
}

export function newToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  return hex(await sha256(utf8(token)));
}

/** Cria a sessão de entrada e apaga as vencidas da mesma conta (contam 4 linhas: a linha e 3 índices). */
export function entrySessionStatements(hash: string, userId: string, code: string, device: string | null, now: Date): Statement[] {
  const at = now.toISOString();
  return [
    { sql: "DELETE FROM cofre_sessoes WHERE usuario_id = ? AND tipo = 'entrada' AND expira_em <= ?", params: [userId, at] },
    {
      sql: "INSERT INTO cofre_sessoes (hash, usuario_id, tipo, codigo, criada_em, usada_em, expira_em, aparelho) VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?)",
      params: [hash, userId, code, at, at, new Date(now.getTime() + ENTRY_MS).toISOString(), device],
    },
  ];
}

export const invalidSession = () => new HttpError(401, 'sessao-invalida', 'Sua sessão acabou. Entre de novo.');

/** Quem está chamando, pelo `Authorization: Bearer <token>`, com uma sessão de um dos tipos aceitos. */
export async function authenticate(deps: Deps, header: string | undefined, kinds: readonly SessionKind[]): Promise<Session> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
  if (!match) throw invalidSession();
  const hash = await hashToken(match[1]!);
  const row = await deps.db.first<{ usuario_id: string; codigo: string; tipo: SessionKind; expira_em: string; aparelho: string | null }>(
    'SELECT usuario_id, codigo, tipo, expira_em, aparelho FROM cofre_sessoes WHERE hash = ?',
    [hash],
  );
  if (!row || !kinds.includes(row.tipo) || Date.parse(row.expira_em) <= deps.now().getTime()) throw invalidSession();
  return { hash, userId: row.usuario_id, code: row.codigo, kind: row.tipo, device: row.aparelho };
}
