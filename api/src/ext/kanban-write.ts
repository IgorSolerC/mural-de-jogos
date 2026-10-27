import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import { COLUNAS_MAX, type QuadroV1 } from '../../../contrato/api-v1/kanban';
import { idDeFicha, type CriarNotaV1 } from '../../../contrato/api-v1/operacoes';
import {
  ESCOPO_DA_OP_KANBAN,
  acharColuna,
  aplicarNoQuadroV1,
  conferirOpKanban,
  type ApagarColunaV1,
  type CriarColunaV1,
  type EditarColunaV1,
  type MoverCartaoV1,
  type OpKanban,
} from '../../../contrato/api-v1/operacoes-kanban';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { createRequest, openRequests, randomBase36, readIdem, requestOut } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from '../routes/http';
import { boardNotFound, findBoard, type QuadroComPedidos } from './kanban-read';

/**
 * Escrever no Kanban (PLANO-API.md, 7.4; rodada 8): pôr e mover cartões, tirar do quadro, e criar,
 * mudar e apagar colunas. Cada rota confere a forma (contrato/api-v1/operacoes-kanban.ts), a
 * permissão, os grupos da chave e o que dá para conferir no quadro como vai ficar (a coluna existe? a
 * nota é do grupo do quadro?), e guarda um pedido. Responde 202 com o pedido e o cartão (ou a coluna)
 * como vai ficar; quem aplica é o Murall aberto.
 */

const unprocessable = (code: string, message: string) => new HttpError(422, code, message);
const columnNames = (q: Pick<QuadroV1, 'colunas'>) => q.colunas.map((c) => c.nome).join(', ');

/** A coluna que não existe no quadro, com as que existem. */
export function unknownColumn(q: Pick<QuadroV1, 'colunas' | 'grupo'>, ref: string): HttpError {
  return unprocessable('coluna-desconhecida', `O quadro ${q.grupo} não tem a coluna "${ref.slice(0, 64)}". As colunas são: ${columnNames(q)}.`);
}

export function kanbanWriteRoutes(app: Hono, deps: Deps): void {
  /** A chave, a permissão da operação e o quadro do caminho (como vai ficar, com os pedidos abertos). */
  async function start(c: Context, op: OpKanban): Promise<{ me: KeyCaller; q: QuadroComPedidos; idem: string | null }> {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_KANBAN[op]);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const ref = c.req.param('grupo') ?? '';
    const q = await findBoard(deps, me, ref);
    if (!q) throw await boardNotFound(deps, me, ref);
    return { me, q, idem };
  }

  const check = (op: OpKanban, raw: Record<string, unknown>, q: QuadroV1) => {
    const r = conferirOpKanban(op, { ...raw, quadro: q.id });
    if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} (campo ${r.campo})`);
    return r.dados;
  };

  /** A nota que chega ao quadro: do espelho, ou de um pedido de criar (o grupo dela tem de ser o do quadro). */
  async function arrivingNote(me: KeyCaller, q: QuadroV1, id: string): Promise<{ titulo: string; finalizada: boolean; tags: string[] }> {
    const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'nota' AND id = ?", [me.key.userId, id]);
    let found: { titulo: string; grupo: string | null; finalizada: boolean; tags: string[] } | null = null;
    if (row) {
      const n = JSON.parse(row.dados) as { titulo: string; grupo: string | null; finalizada_em: string | null; tags: string[] };
      found = { titulo: n.titulo, grupo: n.grupo, finalizada: !!n.finalizada_em, tags: n.tags };
    } else {
      const created = (await openRequests(deps, me.key.userId)).find((r) => r.op === 'nota.criar' && r.alvo === id);
      const d = created ? (JSON.parse(created.dados) as CriarNotaV1) : null;
      if (d) found = { titulo: d.titulo, grupo: d.grupo ?? null, finalizada: false, tags: d.tags ?? [] };
    }
    if (!found) {
      throw new HttpError(404, 'nota-nao-encontrada', `Não achei a nota ${id.slice(0, 64)}. Para pôr uma nota no quadro, ela tem de ser do grupo ${q.grupo} (veja listar_notas).`);
    }
    if (!found.grupo || dobra(found.grupo) !== dobra(q.grupo)) {
      throw unprocessable(
        'nota-de-outro-grupo',
        `A nota "${found.titulo}" é ${found.grupo ? `do grupo ${found.grupo}` : 'sem grupo'}, e cada grupo tem o seu quadro: ela só entra no quadro ${found.grupo ?? 'de um grupo'}. Para mudar o grupo, use editar_nota.`,
      );
    }
    return found;
  }

  // Pôr ou mover um cartão: a coluna, o lugar, a importância, o status, as dependências, o "no mural".
  app.put('/ext/v1/kanban/:grupo/cartoes/:nota', async (c) => {
    const { me, q, idem } = await start(c, 'cartao.mover');
    const note = c.req.param('nota');
    const d = check('cartao.mover', await readJson(c), q) as MoverCartaoV1;
    if (!/^[\w-]{1,64}$/.test(note)) throw new HttpError(404, 'nota-nao-encontrada', 'Não achei essa nota.');
    const onBoard = q.cartoes.some((x) => x.nota === note);
    const info = onBoard ? null : await arrivingNote(me, q, note);
    if (d.coluna) {
      const col = acharColuna(q, d.coluna);
      if (!col) throw unknownColumn(q, d.coluna);
      // o pedido guarda o id: um nome que muda depois não desvia o cartão
      d.coluna = col.id;
    }
    if (d.depende_de?.includes(note)) throw new HttpError(400, 'pedido-invalido', 'Uma nota não depende dela mesma (campo depende_de).');
    const keys = Object.keys(d).filter((k) => k !== 'quadro');
    if (onBoard && !keys.length) throw new HttpError(400, 'pedido-invalido', 'Nada para mudar: mande a coluna, a posicao, a importancia, o status, depende_de ou no_mural.');
    const { row, repeated } = await createRequest(deps, me, 'cartao.mover', note, d, idem);
    const after = aplicarNoQuadroV1(q, 'cartao.mover', note, d, info);
    return c.json({ pedido: requestOut(row, deps.now()), cartao: after.cartoes.find((x) => x.nota === note) ?? null, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Tirar do quadro (a nota continua nas Anotações e volta para o mural).
  app.delete('/ext/v1/kanban/:grupo/cartoes/:nota', async (c) => {
    const { me, q, idem } = await start(c, 'cartao.tirar');
    const note = c.req.param('nota');
    if (!q.cartoes.some((x) => x.nota === note)) throw new HttpError(404, 'cartao-nao-encontrado', `A nota ${note.slice(0, 64)} não está no quadro ${q.grupo}.`);
    const d = check('cartao.tirar', {}, q);
    const { row, repeated } = await createRequest(deps, me, 'cartao.tirar', note, d, idem);
    return c.json({ pedido: requestOut(row, deps.now()), cartao: null, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Criar uma coluna (no fim, ou depois de outra).
  app.post('/ext/v1/kanban/:grupo/colunas', async (c) => {
    const { me, q, idem } = await start(c, 'coluna.criar');
    const d = check('coluna.criar', await readJson(c), q) as CriarColunaV1;
    const taken = q.colunas.find((x) => dobra(x.nome.trim()) === dobra(d.nome));
    if (taken) throw new HttpError(409, 'coluna-existe', `O quadro ${q.grupo} já tem a coluna "${taken.nome}" (id ${taken.id}).`);
    if (q.colunas.length >= COLUNAS_MAX) throw unprocessable('colunas-demais', `Um quadro tem até ${COLUNAS_MAX} colunas.`);
    if (d.depois_de) {
      const after = acharColuna(q, d.depois_de);
      if (!after) throw unknownColumn(q, d.depois_de);
      d.depois_de = after.id;
    }
    const alvo = idDeFicha(deps.now().getTime(), randomBase36());
    const { row, repeated } = await createRequest(deps, me, 'coluna.criar', alvo, d, idem);
    const after = aplicarNoQuadroV1(q, 'coluna.criar', row.alvo, JSON.parse(row.dados) as CriarColunaV1);
    return c.json({ pedido: requestOut(row, deps.now()), coluna: after.colunas.find((x) => x.id === row.alvo) ?? null, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  /** A coluna do caminho (pelo id ou pelo nome), ou 404 com as que existem. */
  const columnOf = (q: QuadroV1, ref: string) => {
    const col = acharColuna(q, ref);
    if (!col) throw new HttpError(404, 'coluna-nao-encontrada', `O quadro ${q.grupo} não tem a coluna "${ref.slice(0, 64)}". As colunas são: ${columnNames(q)}.`);
    return col;
  };

  // Mudar uma coluna: o nome, se finaliza, se a seta pula, o lugar.
  app.patch('/ext/v1/kanban/:grupo/colunas/:coluna', async (c) => {
    const { me, q, idem } = await start(c, 'coluna.editar');
    const col = columnOf(q, c.req.param('coluna'));
    const d = check('coluna.editar', await readJson(c), q) as EditarColunaV1;
    const taken = d.nome !== undefined ? q.colunas.find((x) => x.id !== col.id && dobra(x.nome.trim()) === dobra(d.nome!)) : undefined;
    if (taken) throw new HttpError(409, 'coluna-existe', `O quadro ${q.grupo} já tem a coluna "${taken.nome}" (id ${taken.id}).`);
    const { row, repeated } = await createRequest(deps, me, 'coluna.editar', col.id, d, idem);
    const after = aplicarNoQuadroV1(q, 'coluna.editar', col.id, d);
    return c.json({ pedido: requestOut(row, deps.now()), coluna: after.colunas.find((x) => x.id === col.id) ?? null, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Apagar uma coluna: os cartões vão para `para` (a vizinha, sem dizer; "-" tira do quadro).
  app.delete('/ext/v1/kanban/:grupo/colunas/:coluna', async (c) => {
    const { me, q, idem } = await start(c, 'coluna.apagar');
    const col = columnOf(q, c.req.param('coluna'));
    if (q.colunas.length <= 1) throw unprocessable('ultima-coluna', 'Esta é a única coluna do quadro: um quadro nunca fica sem coluna.');
    const para = c.req.query('para');
    const d = check('coluna.apagar', para === undefined ? {} : { para: para === '-' ? null : para }, q) as ApagarColunaV1;
    if (d.para) {
      const to = acharColuna(q, d.para);
      if (!to) throw unknownColumn(q, d.para);
      if (to.id === col.id) throw new HttpError(400, 'pedido-invalido', 'Os cartões não vão para a própria coluna apagada (campo para).');
      d.para = to.id;
    }
    const { row, repeated } = await createRequest(deps, me, 'coluna.apagar', col.id, d, idem);
    return c.json({ pedido: requestOut(row, deps.now()), coluna: null, ...(repeated ? { repetido: true } : {}) }, 202);
  });
}
