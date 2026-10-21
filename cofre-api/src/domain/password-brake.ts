import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { accountKey, brakeStatement } from './brake';
import { DAY_MS } from './quota';

/**
 * O freio da senha (9.3): a cada 5 erros seguidos, uma espera de 1 minuto, que dobra a cada nova
 * sequência (1, 2, 4, 8… minutos, no máximo 1 dia); e no máximo 20 erros por dia. O freio nunca tranca
 * para sempre: senão, quem quisesse te prejudicar te deixava do lado de fora só errando a senha.
 *
 * Cada tentativa já custa uma passkey (ou o código de recuperação): o freio é a segunda trava.
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

/** Recusa (429) se é hora de esperar, ou se o dia já teve erros demais. */
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

/** O que anotar depois de um erro: a contagem, a espera (se fechou uma sequência) e o freio do dia. */
export async function errorStatements(deps: Deps, userId: string): Promise<{ statements: Statement[]; waitUntil: string | null }> {
  const now = deps.now();
  const s = await state(deps, userId);
  let errors = s.erros_seguidos + 1;
  let streaks = s.sequencias;
  let waitUntil: string | null = null;
  if (errors >= ERRORS_PER_STREAK) {
    streaks += 1;
    errors = 0;
    waitUntil = new Date(now.getTime() + Math.min(DAY_MS, FIRST_WAIT_MS * 2 ** (streaks - 1))).toISOString();
  }
  return {
    waitUntil,
    statements: [
      {
        sql:
          'INSERT INTO cofre_freio_senha (usuario_id, erros_seguidos, sequencias, espera_ate) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT (usuario_id) DO UPDATE SET erros_seguidos = excluded.erros_seguidos, sequencias = excluded.sequencias, espera_ate = COALESCE(excluded.espera_ate, cofre_freio_senha.espera_ate)',
        params: [userId, errors, streaks, waitUntil],
      },
      brakeStatement(accountKey(userId), 'erro-senha', now),
    ],
  };
}

/** Acertou: o freio volta ao começo. */
export function resetStatement(userId: string): Statement {
  return { sql: 'DELETE FROM cofre_freio_senha WHERE usuario_id = ?', params: [userId] };
}
