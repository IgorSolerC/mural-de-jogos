import { Deps, Statement } from '../ports';
import { DAY_MS } from './quota';

/**
 * Os freios por conta: as ações com limite por dia ficam anotadas na tabela `freios` (migração 0006)
 * e continuam contando mesmo quando o que elas criaram some. Assim, tirar a reação ou sair da sessão
 * não devolve a vaga.
 */
export type BrakeAction = 'reagir' | 'entrar';

/** Quantas vezes a conta fez `action` nas últimas 24 horas. */
export async function usedToday(deps: Deps, userId: string, action: BrakeAction, now: Date): Promise<number> {
  const row = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM freios WHERE usuario_id = ? AND acao = ? AND criado_em > ?', [
    userId,
    action,
    new Date(now.getTime() - DAY_MS).toISOString(),
  ]);
  return row?.n ?? 0;
}

/** A anotação de mais uma vez, para ir no mesmo lote da gravação (conta 2 linhas na cota: a linha e o índice). */
export function brakeStatement(userId: string, action: BrakeAction, now: Date): Statement {
  return { sql: 'INSERT INTO freios (usuario_id, acao, criado_em) VALUES (?, ?, ?)', params: [userId, action, now.toISOString()] };
}
