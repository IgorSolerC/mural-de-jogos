import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import {
  ESCOPO_DA_OP_QUADRO,
  conferirOpQuadro,
  type AcrescentarNoQuadroV1,
  type CriarQuadroV1,
  type OpQuadro,
  type QuadroLivreV1,
} from '../../../contrato/api-v1/quadros-livres';
import { CONTEXTO_NOTAS, type ContextoNotasV1 } from '../../../contrato/api-v1/notas';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { createRequest, openRequests, readIdem, requestOut } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from '../routes/http';
import { groupLimit } from './routes';
import { inKeyGroups } from './study-read';

/**
 * O Quadro livre na API das AIs (PLANO-QUADRO-LIVRE.md, 7.8): ler os quadros (do espelho, em texto: o site manda
 * o "Ver em lista" de cada um) e pedir quadros novos e peças novas (o site aplica quando abre). Mover e apagar
 * peças ficam fora. As permissões são as das Anotações, e a chave limitada a alguns grupos só alcança os quadros
 * deles.
 */

const invalid = (r: { erro: string; campo: string }) => new HttpError(400, 'pedido-invalido', `${r.erro} (campo ${r.campo})`);
const ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** Um id de quadro novo, como o site sorteia (22 letras). */
function newBoardId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function boardsExtRoutes(app: Hono, deps: Deps): void {
  const caller = (c: Context) => authenticateKey(deps, c.req.header('Authorization'));

  /** Os quadros do espelho que a chave alcança. */
  async function boardsOf(me: KeyCaller): Promise<QuadroLivreV1[]> {
    const limit = groupLimit(me);
    const rows = await deps.db.all<{ dados: string }>(`SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'quadro-livre'${limit.sql}`, [me.key.userId, ...limit.params]);
    return rows.map((r) => JSON.parse(r.dados) as QuadroLivreV1).sort((a, b) => b.em.localeCompare(a.em));
  }

  /** O quadro pelo id ou pelo nome (com o grupo, se o nome se repete), ou 404 com os que existem. */
  async function boardOf(me: KeyCaller, ref: string): Promise<QuadroLivreV1> {
    const all = await boardsOf(me);
    const found = ID_RE.test(ref) ? all.find((q) => q.id === ref) : all.find((q) => dobra(q.nome) === dobra(ref));
    if (found) return found;
    const names = all.slice(0, 20).map((q) => `${q.nome} (${q.grupo}, id ${q.id})`);
    throw new HttpError(404, 'quadro-nao-encontrado', `Não há esse quadro. ${names.length ? `Os quadros: ${names.join('; ')}.` : 'Ainda não há quadros (ou o Murall ainda não mandou: abra o site).'}`);
  }

  // Os quadros: nome, grupo, quantas peças e setas, quando mudou (com grupo, só os dele).
  app.get('/ext/v1/quadros', async (c) => {
    const me = await caller(c);
    requireScope(me, 'notas:ler');
    const grupo = c.req.query('grupo');
    const list = (await boardsOf(me)).filter((q) => !grupo || dobra(q.grupo) === dobra(grupo));
    const open = (await openRequests(deps, me.key.userId)).filter((r) => r.op === 'quadro-livre.criar');
    const novos = open.map((r) => ({ id: r.alvo, ...(JSON.parse(r.dados) as CriarQuadroV1), pedido: r.id }));
    return c.json({ quadros: list.map(({ texto: _, ...q }) => q), ...(novos.length ? { chegando: novos } : {}) });
  });

  // Um quadro em texto: as molduras como títulos, as peças com o id de cada uma, as setas.
  app.get('/ext/v1/quadros/:id', async (c) => {
    const me = await caller(c);
    requireScope(me, 'notas:ler');
    return c.json({ quadro: await boardOf(me, c.req.param('id')) });
  });

  async function start(c: Context, op: OpQuadro) {
    const me = await caller(c);
    requireScope(me, ESCOPO_DA_OP_QUADRO[op]);
    return { me, idem: readIdem(c.req.header('Idempotency-Key')) };
  }

  // Criar um quadro num grupo das Anotações.
  app.post('/ext/v1/quadros', async (c) => {
    const { me, idem } = await start(c, 'quadro-livre.criar');
    const r = conferirOpQuadro('quadro-livre.criar', await readJson(c));
    if (!r.ok) throw invalid(r);
    const d = r.dados as CriarQuadroV1;
    // o grupo é um dos das Anotações (um nome escrito errado não vira grupo novo)
    const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto' AND id = ?", [me.key.userId, CONTEXTO_NOTAS]);
    const groups = row ? (JSON.parse(row.dados) as ContextoNotasV1).grupos.map((g) => g.nome) : [];
    const found = groups.find((g) => dobra(g) === dobra(d.grupo));
    if (groups.length && !found) throw new HttpError(422, 'grupo-desconhecido', `Não há o grupo "${d.grupo}" nas Anotações. Os grupos: ${groups.filter((g) => inKeyGroups(me, g)).join(', ')}.`);
    if (!inKeyGroups(me, found ?? d.grupo)) throw new HttpError(403, 'fora-dos-grupos', 'Esta chave só alcança alguns grupos das Anotações, e este não é um deles.');
    const { row: req, repeated } = await createRequest(deps, me, 'quadro-livre.criar', newBoardId(), { ...d, grupo: found ?? d.grupo }, idem);
    return c.json({ pedido: requestOut(req, deps.now()), quadro: { id: req.alvo, nome: d.nome, grupo: found ?? d.grupo }, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  /** Acrescentar (peças, setas, uma moldura) num quadro que existe, ou num que um pedido aberto vai criar. */
  async function add(c: Context, only?: 'setas') {
    const { me, idem } = await start(c, 'quadro-livre.acrescentar');
    const ref = c.req.param('id') ?? '';
    const body = await readJson(c);
    const r = conferirOpQuadro('quadro-livre.acrescentar', only ? { setas: (body as { setas?: unknown }).setas } : body);
    if (!r.ok) throw invalid(r);
    let id = ref;
    if (me.key.scopes.includes('notas:ler')) {
      const open = (await openRequests(deps, me.key.userId)).filter((x) => x.op === 'quadro-livre.criar');
      const coming = open.find((x) => x.alvo === ref);
      if (!coming) id = (await boardOf(me, ref)).id;
    } else if (!ID_RE.test(ref)) {
      throw new HttpError(400, 'quadro-invalido', 'Diga o id do quadro (22 letras).');
    }
    const { row, repeated } = await createRequest(deps, me, 'quadro-livre.acrescentar', id, r.dados as AcrescentarNoQuadroV1, idem);
    return c.json({ pedido: requestOut(row, deps.now()), ...(repeated ? { repetido: true } : {}) }, 202);
  }

  app.post('/ext/v1/quadros/:id/pecas', (c) => add(c));
  app.post('/ext/v1/quadros/:id/setas', (c) => add(c, 'setas'));
}
