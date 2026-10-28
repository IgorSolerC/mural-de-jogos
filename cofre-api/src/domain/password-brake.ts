import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { accountKey } from './brake';
import { DAY_MS } from './quota';

/**
 * O freio da senha (9.3): a cada 5 erros seguidos, uma espera de 1 minuto, que dobra a cada nova
 * sequência (1, 2, 4, 8… minutos, no máximo 1 dia); e no máximo 20 erros por dia. O freio nunca tranca
 * para sempre: senão, quem quisesse te prejudicar te deixava do lado de fora só errando a senha.
 *
 * Cada tentativa já custa uma passkey (ou o código de recuperação): o freio é a segunda trava.
 *
 * A tentativa conta como erro **antes** de a senha ser conferida (`attemptStatements`), na mesma gravação
 * que gasta a marca da passkey e com a condição do freio no banco; quem acerta desfaz a conta
 * (`successStatements`). Conferir antes e anotar o erro depois deixava passar o freio: várias tentativas
 * ao mesmo tempo (uma por sessão de entrada, cada uma com a sua passkey) liam o mesmo "0 erros", e cada
 * uma gravava "1"; nem a espera nem o limite do dia chegavam.
 */
export const ERRORS_PER_STREAK = 5;
export const FIRST_WAIT_MS = 60_000;
export const MAX_ERRORS_PER_DAY = 20;

interface BrakeRow {
  erros_seguidos: number;
  sequencias: number;
  espera_ate: string | null;
}

async function state(deps: Deps, userId: string): Promise<BrakeRow> {
  return (
    (await deps.db.first<BrakeRow>('SELECT erros_seguidos, sequencias, espera_ate FROM cofre_freio_senha WHERE usuario_id = ?', [userId])) ?? {
      erros_seguidos: 0,
      sequencias: 0,
      espera_ate: null,
    }
  );
}

/**
 * Recusa (429) se é hora de esperar, ou se o dia já teve erros demais. É a conferida de antes, sem
 * gravar nada, com a mensagem certa; quem decide de verdade é a condição de `attemptStatements`.
 */
export async function assertCanTry(deps: Deps, userId: string): Promise<void> {
  const now = deps.now();
  const s = await state(deps, userId);
  if (s.espera_ate && Date.parse(s.espera_ate) > now.getTime()) {
    throw new HttpError(429, 'senha-espera', `Muitos erros seguidos. Tente de novo depois de ${s.espera_ate}.`);
  }
  const row = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM freios WHERE chave = ? AND acao = ? AND criado_em > ?', [
    accountKey(userId),
    'erro-senha',
    new Date(now.getTime() - DAY_MS).toISOString(),
  ]);
  if ((row?.n ?? 0) >= MAX_ERRORS_PER_DAY) {
    throw new HttpError(429, 'senha-limite-dia', 'Erros de senha demais hoje. Tente de novo amanhã.');
  }
}

/** A espera de quem fecha uma sequência, em segundos: 60 × 2^(sequências de antes), no máximo 1 dia. */
const WAIT_SECONDS = `CASE WHEN sequencias >= 11 THEN ${DAY_MS / 1000} ELSE min(${DAY_MS / 1000}, ${FIRST_WAIT_MS / 1000} << sequencias) END`;
const CLOSES_STREAK = `erros_seguidos + 1 >= ${ERRORS_PER_STREAK}`;

/**
 * Uma tentativa de senha, numa gravação só (conta 6 linhas na cota):
 *
 * 1. gasta a marca do segundo fator da sessão, só se ela ainda vale **e** o freio deixa (sem espera, e
 *    menos de 20 erros nas últimas 24 horas). No lugar da marca fica um carimbo desta tentativa;
 * 2. com o carimbo lá (o 1 passou), soma um erro seguido (fechando a sequência no 5º, com a espera);
 * 3. e anota o erro do dia.
 *
 * Quem chama confere que o 1 mudou exatamente uma linha. O lote é atômico e as condições são lidas no
 * banco, então duas tentativas ao mesmo tempo contam as duas, e a 6ª encontra a espera.
 */
export function attemptStatements(hash: string, userId: string, now: Date): Statement[] {
  const at = now.toISOString();
  const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
  const stamp = `tentativa ${crypto.randomUUID()}`;
  const stamped = 'EXISTS (SELECT 1 FROM cofre_sessoes WHERE hash = ? AND fator IS NULL AND fator_ate = ?)';
  return [
    {
      sql:
        'UPDATE cofre_sessoes SET fator = NULL, fator_ate = ? WHERE hash = ? AND fator IS NOT NULL AND fator_ate > ? ' +
        'AND NOT EXISTS (SELECT 1 FROM cofre_freio_senha WHERE usuario_id = ? AND espera_ate > ?) ' +
        "AND (SELECT COUNT(*) FROM freios WHERE chave = ? AND acao = 'erro-senha' AND criado_em > ?) < ?",
      params: [stamp, hash, at, userId, at, accountKey(userId), dayAgo, MAX_ERRORS_PER_DAY],
    },
    {
      sql:
        `INSERT INTO cofre_freio_senha (usuario_id, erros_seguidos, sequencias, espera_ate) SELECT ?, 1, 0, NULL WHERE ${stamped} ` +
        'ON CONFLICT (usuario_id) DO UPDATE SET ' +
        `erros_seguidos = CASE WHEN ${CLOSES_STREAK} THEN 0 ELSE erros_seguidos + 1 END, ` +
        `sequencias = CASE WHEN ${CLOSES_STREAK} THEN sequencias + 1 ELSE sequencias END, ` +
        `espera_ate = CASE WHEN ${CLOSES_STREAK} THEN strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+' || (${WAIT_SECONDS}) || ' seconds') ELSE espera_ate END`,
      params: [userId, hash, stamp, at],
    },
    {
      sql: `INSERT INTO freios (chave, acao, criado_em) SELECT ?, 'erro-senha', ? WHERE ${stamped}`,
      params: [accountKey(userId), at, hash, stamp],
    },
  ];
}

/**
 * Errou: até quando esperar, se o erro (este ou um ao mesmo tempo) fechou a sequência agora; senão, null.
 */
export async function waitAfterError(deps: Deps, userId: string): Promise<string | null> {
  const s = await state(deps, userId);
  return s.erros_seguidos === 0 && s.espera_ate && Date.parse(s.espera_ate) > deps.now().getTime() ? s.espera_ate : null;
}

/**
 * Acertou: o freio volta ao começo, e o erro do dia anotado pela tentativa (`attemptStatements`, com a
 * hora `at`) sai. Os erros anotados na mesma hora são iguais: sai um deles.
 */
export function successStatements(userId: string, at: string): Statement[] {
  return [
    resetStatement(userId),
    {
      sql: "DELETE FROM freios WHERE rowid = (SELECT rowid FROM freios WHERE chave = ? AND acao = 'erro-senha' AND criado_em = ? LIMIT 1)",
      params: [accountKey(userId), at],
    },
  ];
}

/** O freio volta ao começo (acertar a senha, ou trocá-la). */
export function resetStatement(userId: string): Statement {
  return { sql: 'DELETE FROM cofre_freio_senha WHERE usuario_id = ?', params: [userId] };
}
