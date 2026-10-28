import { Deps, SqlValue, Statement } from '../ports';
import { DAY_MS } from './quota';

/**
 * Os freios por conta: as ações com limite por dia ficam anotadas na tabela `freios` (migração 0006)
 * e continuam contando mesmo quando o que elas criaram some. Assim, tirar a reação ou sair da sessão
 * não devolve a vaga.
 */
export type BrakeAction = 'reagir' | 'entrar' | 'comentar' | 'codigo' | 'compartilhar' | 'agenda' | 'chave' | 'oauth-registro' | 'oauth-pedido' | 'oauth-documento' | 'imagem';

/** Quantas vezes a conta fez `action` nas últimas 24 horas. */
export async function usedToday(deps: Deps, userId: string, action: BrakeAction, now: Date): Promise<number> {
  const row = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM freios WHERE usuario_id = ? AND acao = ? AND criado_em > ?', [
    userId,
    action,
    new Date(now.getTime() - DAY_MS).toISOString(),
  ]);
  return row?.n ?? 0;
}

/**
 * A condição de a conta ainda ter vaga (menos de `max` vezes nas últimas 24 horas), para o WHERE das
 * gravações do lote. O `usedToday` lido antes não basta: pedidos ao mesmo tempo leem todos a mesma
 * contagem velha e passam juntos; dentro do lote (uma transação) a contagem é a do banco na hora.
 * Num lote que grava a anotação (`brakeStatement` com `max`), ela vai por último: até ali, a contagem
 * é a mesma para todas as gravações do lote.
 */
export function brakeRoom(userId: string, action: BrakeAction, now: Date, max: number): { sql: string; params: SqlValue[] } {
  return {
    sql: '(SELECT COUNT(*) FROM freios WHERE usuario_id = ? AND acao = ? AND criado_em > ?) < ?',
    params: [userId, action, new Date(now.getTime() - DAY_MS).toISOString(), max],
  };
}

/**
 * A anotação de mais uma vez, para ir no mesmo lote da gravação (conta 2 linhas na cota: a linha e o
 * índice). Com `max`, só anota se ainda havia vaga (ver `brakeRoom`).
 */
export function brakeStatement(userId: string, action: BrakeAction, now: Date, max?: number): Statement {
  if (max === undefined) return { sql: 'INSERT INTO freios (usuario_id, acao, criado_em) VALUES (?, ?, ?)', params: [userId, action, now.toISOString()] };
  const room = brakeRoom(userId, action, now, max);
  return { sql: `INSERT INTO freios (usuario_id, acao, criado_em) SELECT ?, ?, ? WHERE ${room.sql}`, params: [userId, action, now.toISOString(), ...room.params] };
}
