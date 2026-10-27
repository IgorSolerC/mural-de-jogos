import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import type { ColunaV1, QuadroV1 } from '../../../contrato/api-v1/kanban';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { groupLimit, mirrorState } from './routes';

/**
 * Ler o Kanban com a chave (PLANO-API.md, 7.4; rodada 8): os quadros (um por grupo das Anotações, com
 * as colunas) e um quadro inteiro, com os cartões na ordem da tela. Tudo do espelho; a chave limitada a
 * alguns grupos só vê os quadros deles.
 */

/** As permissões do Kanban: qualquer uma deixa ver as colunas no contexto (quem move precisa dos nomes). */
export const KANBAN_SCOPES = ['kanban:ler', 'kanban:mover', 'kanban:colunas'] as const;

/** O quadro como a lista e o contexto mostram: sem os cartões. */
export type QuadroResumoV1 = Omit<QuadroV1, 'cartoes'>;

/** Os quadros que a chave alcança, de A a Z, sem os cartões (o banco tira, sem a API abrir cada um). */
export async function boardSummaries(deps: Deps, me: KeyCaller): Promise<QuadroResumoV1[]> {
  const limit = groupLimit(me);
  const rows = await deps.db.all<{ dados: string }>(
    `SELECT json_remove(dados, '$.cartoes') AS dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'quadro'${limit.sql} ORDER BY grupo`,
    [me.key.userId, ...limit.params],
  );
  return rows.map((r) => JSON.parse(r.dados) as QuadroResumoV1);
}

/** As colunas de cada quadro, para o contexto (o vocabulário: os nomes a usar ao mover). */
export async function kanbanContext(deps: Deps, me: KeyCaller) {
  const boards = await boardSummaries(deps, me);
  return boards.map((q) => ({
    id: q.id,
    grupo: q.grupo,
    so_no_kanban: q.so_no_kanban,
    colunas: q.colunas.map((c: ColunaV1) => ({ id: c.id, nome: c.nome, finaliza: c.finaliza, pula: c.pula })),
  }));
}

/** O quadro de um grupo (pelo nome, sem ligar para acento e caixa, ou pelo id), se a chave alcança; ou null. */
export async function findBoard(deps: Deps, me: KeyCaller, ref: string): Promise<QuadroV1 | null> {
  if (!ref || ref.length > 64) return null;
  const limit = groupLimit(me);
  const row = await deps.db.first<{ dados: string }>(
    `SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'quadro' AND (id = ? OR grupo = ?)${limit.sql}`,
    [me.key.userId, ref, dobra(ref.trim()), ...limit.params],
  );
  return row ? (JSON.parse(row.dados) as QuadroV1) : null;
}

/** O 404 de um quadro que não existe (ou que a chave não alcança), com os que ela alcança. */
export async function boardNotFound(deps: Deps, me: KeyCaller, ref: string): Promise<HttpError> {
  const names = (await boardSummaries(deps, me)).map((q) => q.grupo);
  return new HttpError(
    404,
    'quadro-nao-encontrado',
    `Não achei o quadro "${ref.slice(0, 64)}". Cada grupo das Anotações tem o seu quadro; ${names.length ? `os que esta chave alcança: ${names.join(', ')}.` : 'esta chave ainda não alcança nenhum (abra o Murall para o espelho chegar).'}`,
  );
}

export function kanbanReadRoutes(app: Hono, deps: Deps): void {
  const caller = async (c: Context) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, 'kanban:ler');
    return me;
  };

  // Os quadros, com as colunas (sem os cartões).
  app.get('/ext/v1/kanban', async (c) => {
    const me = await caller(c);
    return c.json({ quadros: await boardSummaries(deps, me), espelho: await mirrorState(deps, me.key.userId) });
  });

  // Um quadro inteiro: as colunas e os cartões, na ordem da tela.
  app.get('/ext/v1/kanban/:grupo', async (c) => {
    const me = await caller(c);
    const ref = c.req.param('grupo');
    const q = await findBoard(deps, me, ref);
    const espelho = await mirrorState(deps, me.key.userId);
    if (!q) {
      if (espelho.estado === 'vazio') return c.json({ quadro: null, espelho });
      throw await boardNotFound(deps, me, ref);
    }
    return c.json({ quadro: q, espelho });
  });
}
