import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import { BARALHOS_MAX, CARTAS_MAX, CONTEXTO_ESTUDOS, type BaralhoV1, type CartaV1, type ContextoEstudosV1 } from '../../../contrato/api-v1/estudos';
import { idDeFicha } from '../../../contrato/api-v1/operacoes';
import {
  ESCOPO_DA_OP_ESTUDO,
  acharBaralho,
  baralhoDoPedido,
  cartaDoPedido,
  conferirOpEstudo,
  editarBaralhoV1,
  editarCartaV1,
  type CriarBaralhoV1,
  type EditarBaralhoV1,
  type EditarCartaV1,
  type OpEstudo,
  type PorCartaV1,
  type ResponderV1,
} from '../../../contrato/api-v1/operacoes-estudos';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { assertRoom, createRequest, randomBase36, readIdem, requestOut } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from '../routes/http';
import { cardNotFound, deckNotFound, findCard, inKeyGroups, leaving, notesInfo, resolveDecks, studyNow, wallOf, type ComPedidos, type StudyNow } from './study-read';

/**
 * Escrever nos Estudos (PLANO-API.md, seção 23, rodada 12): criar, mudar e apagar baralhos; virar carta
 * (uma anotação, ou um lote, com um pedido por anotação), mudar a frente, os baralhos e o "no mural",
 * tirar dos Estudos, responder e recomeçar. Cada rota confere a forma (contrato/api-v1/
 * operacoes-estudos.ts), a permissão, os grupos da chave e o que dá para conferir no espelho (o baralho
 * existe? a anotação existe? o nome do baralho é repetido?), troca os nomes dos baralhos pelos ids e
 * guarda o pedido. Responde 202 com o pedido e o baralho (ou a carta) como vai ficar; quem aplica (e faz
 * a conta do FSRS) é o Murall aberto.
 */

/** Quantas anotações viram carta num pedido de lote. */
export const LOTE_DE_CARTAS_MAX = 50;

const invalid = (r: { erro: string; campo: string }, where = '') => new HttpError(400, 'pedido-invalido', `${where}${r.erro} (campo ${r.campo})`);

export function studyWriteRoutes(app: Hono, deps: Deps): void {
  async function start(c: Context, op: OpEstudo) {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_ESTUDO[op]);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const ctx = await studyNow(deps, me.key.userId);
    return { me, idem, decks: ctx.decks, ctx };
  }

  /** O baralho do caminho (pelo id ou pelo nome), ou 404 com os que existem. */
  async function deckOf(me: KeyCaller, decks: readonly BaralhoV1[], ref: string) {
    const d = acharBaralho(decks, ref);
    if (!d) throw await deckNotFound(deps, me, ref);
    return d;
  }

  /** Outro baralho com este nome (o que um pedido aberto vai apagar não conta: o nome fica livre). */
  const taken = (decks: readonly ComPedidos<BaralhoV1>[], nome: string, except?: string) =>
    decks.find((d) => d.id !== except && !leaving(d) && dobra(d.nome.trim()) === dobra(nome));

  // Criar um baralho (no fim da fileira).
  app.post('/ext/v1/estudos/baralhos', async (c) => {
    const { me, idem, decks } = await start(c, 'baralho.criar');
    const r = conferirOpEstudo('baralho.criar', await readJson(c));
    if (!r.ok) throw invalid(r);
    const d = r.dados as CriarBaralhoV1;
    const same = taken(decks, d.nome);
    if (same) return c.json({ erro: 'baralho-existe', mensagem: `Já existe o baralho "${same.nome}" (id ${same.id}).`, baralho: same }, 409);
    if (decks.filter((x) => !leaving(x)).length >= BARALHOS_MAX) throw new HttpError(422, 'baralhos-demais', `Os Estudos têm até ${BARALHOS_MAX} baralhos.`);
    const { row, repeated } = await createRequest(deps, me, 'baralho.criar', idDeFicha(deps.now().getTime(), randomBase36()), d, idem);
    const next = decks.reduce((m, b) => Math.max(m, b.posicao + 1), 0);
    const { filas: _f, ...shown } = baralhoDoPedido(row.alvo, JSON.parse(row.dados) as CriarBaralhoV1, next, row.criado_em);
    return c.json({ pedido: requestOut(row, deps.now()), baralho: shown, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Mudar um baralho: o nome, a cor, as novas por dia, o "no mural", o estilo, o lugar.
  app.patch('/ext/v1/estudos/baralhos/:baralho', async (c) => {
    const { me, idem, decks } = await start(c, 'baralho.editar');
    const deck = await deckOf(me, decks, c.req.param('baralho'));
    const r = conferirOpEstudo('baralho.editar', await readJson(c));
    if (!r.ok) throw invalid(r);
    const d = r.dados as EditarBaralhoV1;
    const same = d.nome !== undefined ? taken(decks, d.nome, deck.id) : undefined;
    if (same) return c.json({ erro: 'baralho-existe', mensagem: `Já existe o baralho "${same.nome}" (id ${same.id}).`, baralho: same }, 409);
    const { row, repeated } = await createRequest(deps, me, 'baralho.editar', deck.id, d, idem);
    const { filas: _f, ...shown } = editarBaralhoV1(deck, d, row.criado_em);
    return c.json({ pedido: requestOut(row, deps.now()), baralho: { ...shown, ...(d.posicao !== undefined ? { posicao: d.posicao } : {}) }, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Apagar um baralho: as cartas saem dele; a que só estava nele sai dos Estudos (e volta ao mural).
  app.delete('/ext/v1/estudos/baralhos/:baralho', async (c) => {
    const { me, idem, decks } = await start(c, 'baralho.apagar');
    const deck = await deckOf(me, decks, c.req.param('baralho'));
    const { row, repeated } = await createRequest(deps, me, 'baralho.apagar', deck.id, {}, idem);
    return c.json({ pedido: requestOut(row, deps.now()), baralho: null, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  /**
   * As anotações que viram carta: a carta de agora de cada uma, ou o que se sabe da nota (do espelho, ou de
   * um pedido de criar), com os pedidos e os baralhos lidos uma vez só. A que não existe (ou está fora dos
   * grupos da chave) é 404, com a posição dela no lote.
   */
  async function arriving(me: KeyCaller, ids: readonly string[], ctx: StudyNow, many: boolean) {
    const cards = new Map<string, ComPedidos<CartaV1>>();
    for (const nota of ids) {
      const k = await findCard(deps, me, nota, ctx);
      if (k) cards.set(nota, k);
    }
    const infos = await notesInfo(deps, me.key.userId, ids.filter((n) => !cards.has(n)), ctx.pending.all);
    return ids.map((nota, i) => {
      const card = cards.get(nota) ?? null;
      const note = card ? null : (infos.get(nota) ?? null);
      if (!card && (!note || !inKeyGroups(me, note.grupo))) {
        const msg = `Não achei a anotação ${nota.slice(0, 64)} (veja listar_notas; as compartilhadas não viram carta pela API).`;
        throw new HttpError(404, 'nota-nao-encontrada', many ? `Nota ${i + 1}: ${msg} Nada deste pedido foi guardado.` : msg);
      }
      return { nota, card, note };
    });
  }

  // Virar carta: uma anotação (`nota`, com a frente) ou várias (`notas`, até 50, um pedido por anotação) em baralhos.
  app.post('/ext/v1/estudos/cartas', async (c) => {
    const { me, idem, decks, ctx } = await start(c, 'carta.por');
    const raw = await readJson(c);
    const many = Array.isArray(raw['notas']) ? (raw['notas'] as unknown[]) : null;
    if (many && (raw['titulo'] !== undefined || raw['subtitulo'] !== undefined || raw['imagem'] !== undefined)) {
      throw new HttpError(400, 'pedido-invalido', 'A frente (titulo, subtitulo, imagem) é de uma carta só: mande nota, não notas (campo notas).');
    }
    const notes = many ?? [raw['nota']];
    if (!notes.length || notes.length > LOTE_DE_CARTAS_MAX || !notes.every((n) => typeof n === 'string' && /^[\w-]{1,64}$/.test(n))) {
      throw new HttpError(400, 'pedido-invalido', `Mande nota (o id da anotação) ou notas (de 1 a ${LOTE_DE_CARTAS_MAX} ids).`);
    }
    const { nota: _n, notas: _ns, ...rest } = raw;
    const r = conferirOpEstudo('carta.por', rest);
    if (!r.ok) throw invalid(r);
    const d = { ...(r.dados as PorCartaV1) };
    d.baralhos = resolveDecks(decks, d.baralhos);
    const found = await arriving(me, [...new Set(notes as string[])], ctx, !!many);
    // a que já é carta só ganha os baralhos: a frente e o mural se mudam com editar_carta (que espera a aprovação)
    const changes = d.titulo !== undefined || d.subtitulo !== undefined || d.imagem !== undefined || d.no_mural !== undefined;
    const already = found.find((f) => f.card);
    if (changes && already) {
      throw new HttpError(
        422,
        'ja-e-carta',
        `A anotação ${already.nota} já é carta ("${already.card!.titulo}"): aqui ela só entra em mais baralhos. Para mudar a frente ou o mural, use editar_carta.`,
      );
    }
    const ctxRow = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto-estudos' AND id = ?", [me.key.userId, CONTEXTO_ESTUDOS]);
    // as que já vão virar carta por um pedido aberto também contam no limite
    const coming = new Set(ctx.pending.rows.filter((x) => x.op === 'carta.por' || x.op === 'nota.criar').map((x) => x.alvo));
    const cards = (ctxRow ? (JSON.parse(ctxRow.dados) as ContextoEstudosV1).cartas : 0) + coming.size;
    if (cards + found.filter((f) => !f.card && !coming.has(f.nota)).length > CARTAS_MAX) throw new HttpError(422, 'cartas-demais', `Os Estudos têm até ${CARTAS_MAX} cartas.`);
    const idems = idem ? found.map((_, i) => (many ? `${idem}:${i}` : idem)) : [];
    const stored = idems.length
      ? ((await deps.db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM api_pedidos WHERE chave_id = ? AND chave_idem IN (${idems.map(() => '?').join(', ')})`, [me.key.id, ...idems]))?.n ?? 0)
      : 0;
    await assertRoom(deps, me, found.length - stored);
    const wall = wallOf(decks);
    const out: { pedido: ReturnType<typeof requestOut>; carta: CartaV1; repetido?: true }[] = [];
    for (const [i, f] of found.entries()) {
      const { row, repeated } = await createRequest(deps, me, 'carta.por', f.nota, d, idem ? (many ? `${idem}:${i}` : idem) : null);
      const carta = cartaDoPedido(f.note ?? { id: f.nota, titulo: f.card!.nota_titulo, texto: f.card!.verso, grupo: f.card!.grupo }, f.card, d, row.criado_em, wall, f.note?.noMural ?? true);
      out.push({ pedido: requestOut(row, deps.now()), carta, ...(repeated ? { repetido: true as const } : {}) });
    }
    if (many) return c.json({ pedidos: out.map((o) => o.pedido), cartas: out.map((o) => o.carta) }, 202);
    return c.json({ pedido: out[0]!.pedido, carta: out[0]!.carta, ...(out[0]!.repetido ? { repetido: true } : {}) }, 202);
  });

  /** A carta do caminho (ou 404). */
  async function cardOf(me: KeyCaller, nota: string, ctx: StudyNow) {
    const k = await findCard(deps, me, nota, ctx);
    if (!k) throw cardNotFound();
    return k;
  }

  // Mudar a carta: a frente, a lista dos baralhos, o "no mural".
  app.patch('/ext/v1/estudos/cartas/:nota', async (c) => {
    const { me, idem, decks, ctx } = await start(c, 'carta.editar');
    const k = await cardOf(me, c.req.param('nota'), ctx);
    const r = conferirOpEstudo('carta.editar', await readJson(c));
    if (!r.ok) throw invalid(r);
    const d = { ...(r.dados as EditarCartaV1) };
    if (d.baralhos) d.baralhos = resolveDecks(decks, d.baralhos);
    const { row, repeated } = await createRequest(deps, me, 'carta.editar', k.nota, d, idem);
    const { pedidos: _p, ...base } = k;
    return c.json({ pedido: requestOut(row, deps.now()), carta: editarCartaV1(base, d, row.criado_em, wallOf(decks)), ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Tirar dos Estudos (a anotação continua nas Anotações e volta ao mural; o progresso vai junto, com Desfazer).
  app.delete('/ext/v1/estudos/cartas/:nota', async (c) => {
    const { me, idem, ctx } = await start(c, 'carta.tirar');
    const k = await cardOf(me, c.req.param('nota'), ctx);
    const { row, repeated } = await createRequest(deps, me, 'carta.tirar', k.nota, {}, idem);
    return c.json({ pedido: requestOut(row, deps.now()), carta: null, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Responder: Errei (acertou: false) ou Acertei (true). Quando a carta volta, o Murall calcula ao aplicar.
  app.post('/ext/v1/estudos/cartas/:nota/responder', async (c) => {
    const { me, idem, decks, ctx } = await start(c, 'carta.responder');
    const k = await cardOf(me, c.req.param('nota'), ctx);
    const r = conferirOpEstudo('carta.responder', await readJson(c));
    if (!r.ok) throw invalid(r);
    const d = { ...(r.dados as ResponderV1) };
    if (d.baralho) {
      const [id] = resolveDecks(decks, [d.baralho], 'baralho');
      if (!k.baralhos.includes(id!)) {
        const names = decks.filter((x) => k.baralhos.includes(x.id)).map((x) => x.nome);
        throw new HttpError(422, 'baralho-de-fora', `A carta "${k.titulo}" não está nesse baralho. Os dela: ${names.join(', ')}.`);
      }
      d.baralho = id;
    }
    const { row, repeated } = await createRequest(deps, me, 'carta.responder', k.nota, d, idem);
    const { pedidos: _p, ...carta } = k;
    return c.json({ pedido: requestOut(row, deps.now()), carta, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Recomeçar o progresso: a carta volta a Desconhecida, sem respostas.
  app.post('/ext/v1/estudos/cartas/:nota/recomecar', async (c) => {
    const { me, idem, ctx } = await start(c, 'carta.recomecar');
    const k = await cardOf(me, c.req.param('nota'), ctx);
    const { row, repeated } = await createRequest(deps, me, 'carta.recomecar', k.nota, {}, idem);
    const { pedidos: _p, ...base } = k;
    const carta: CartaV1 = { ...base, nivel: 'desconhecida', estado: 'nova', volta_em: null, vistas: 0, acertos: 0, erros: 0, ultimas: '' };
    return c.json({ pedido: requestOut(row, deps.now()), carta, ...(repeated ? { repetido: true } : {}) }, 202);
  });
}

/** Os baralhos de uma nota nova (`estudos` de criar_nota): os nomes trocados pelos ids, ou o erro. */
export async function deckIdsForNewNote(deps: Deps, me: KeyCaller, refs: readonly string[]): Promise<string[]> {
  requireScope(me, 'estudos:escrever');
  return resolveDecks((await studyNow(deps, me.key.userId)).decks, refs, 'estudos.baralhos');
}
