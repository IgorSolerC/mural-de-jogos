import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import type { DesejoV1, PraDepoisV1 } from '../../../contrato/api-v1/murais';
import { idDeFicha } from '../../../contrato/api-v1/operacoes';
import {
  ESCOPO_DA_OP_MURAL,
  LOTE_DOS_MURAIS_MAX,
  conferirOpMural,
  desejoDoPedido,
  editarDesejoV1,
  itemDoPedido,
  type EditarDesejoV1,
  type OpMural,
  type PorItemV1,
  type TirarV1,
} from '../../../contrato/api-v1/operacoes-murais';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { assertRoom, createRequest, randomBase36, readIdem, requestOut } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from '../routes/http';
import { arrivingItems, currentItem } from './murals-read';

/**
 * Escrever na Wishlist e no Pra depois (PLANO-API.md, 7.4; rodada 9): pôr (um, ou um lote com um pedido
 * por item), mudar o desejo (a relevância, o nome, o ano, o por, a capa) e tirar. Cada rota confere a
 * forma (contrato/api-v1/operacoes-murais.ts), a permissão, o nome repetido no mesmo mural e a versão,
 * e guarda o pedido; quem aplica (e procura a capa) é o Murall aberto.
 */

type ListKind = 'desejo' | 'pra-depois';
const WHAT: Record<ListKind, { one: string; where: string; exists: string; missing: string; plural: string }> = {
  desejo: { one: 'o desejo', where: 'na wishlist', exists: 'desejo-existe', missing: 'desejo-nao-encontrado', plural: 'desejos' },
  'pra-depois': { one: 'o item', where: 'no Pra depois', exists: 'pra-depois-existe', missing: 'pra-depois-nao-encontrado', plural: 'pra_depois' },
};

export function muralsWriteRoutes(app: Hono, deps: Deps): void {
  /** O item com o mesmo nome no mesmo mural (no espelho, ou num pedido de pôr ainda aberto), ou null. */
  async function sameName(me: KeyCaller, tipo: ListKind, d: PorItemV1): Promise<DesejoV1 | PraDepoisV1 | null> {
    const name = dobra(d.nome);
    const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = ? AND grupo = ? AND busca LIKE ? ESCAPE '\\'", [
      me.key.userId,
      tipo,
      d.mural,
      `${name.replace(/[%_\\]/g, (m) => `\\${m}`)}\n%`,
    ]);
    if (row) return JSON.parse(row.dados) as DesejoV1;
    return (await arrivingItems(deps, me.key.userId, tipo)).find((x) => x.mural === d.mural && dobra(x.nome) === name) ?? null;
  }

  /** Pôr: um, ou um lote em `itens` (até 50), um pedido por item; o lote confere todos antes de guardar um. */
  function putRoute(path: string, tipo: ListKind, op: OpMural) {
    app.post(path, async (c) => {
      const me = await authenticateKey(deps, c.req.header('Authorization'));
      requireScope(me, ESCOPO_DA_OP_MURAL[op]);
      const idem = readIdem(c.req.header('Idempotency-Key'));
      const raw = await readJson(c, 256_000);
      const batch = Array.isArray(raw['itens']) ? (raw['itens'] as unknown[]) : null;
      const list = batch ?? [raw];
      if (!list.length || list.length > LOTE_DOS_MURAIS_MAX) throw new HttpError(400, 'pedido-invalido', `Um lote tem de 1 a ${LOTE_DOS_MURAIS_MAX} itens.`);
      const checked: PorItemV1[] = [];
      const seen = new Set<string>();
      for (const [i, item] of list.entries()) {
        const where = batch ? `Item ${i + 1}: ` : '';
        const r = conferirOpMural(op, item);
        if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${where}${r.erro} (campo ${r.campo})`);
        const d = r.dados as PorItemV1;
        const key = `${d.mural} ${dobra(d.nome)}`;
        const there = seen.has(key) ? null : await sameName(me, tipo, d);
        if (seen.has(key) || there) {
          // o que já está lá não vira outro: a AI vê o de agora (e o muda, se quiser)
          return c.json(
            {
              erro: WHAT[tipo].exists,
              mensagem: `${where}"${d.nome}" já está ${WHAT[tipo].where} (${d.mural})${there ? `, com o id ${there.id}` : ', duas vezes neste lote'}. Nada deste pedido foi guardado.`,
              ...(there ? { [tipo === 'desejo' ? 'desejo' : 'pra_depois']: there } : {}),
            },
            409,
          );
        }
        seen.add(key);
        checked.push(d);
      }
      const idems = idem ? checked.map((_, i) => (batch ? `${idem}:${i}` : idem)) : [];
      const stored = idems.length
        ? ((await deps.db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM api_pedidos WHERE chave_id = ? AND chave_idem IN (${idems.map(() => '?').join(', ')})`, [me.key.id, ...idems]))?.n ?? 0)
        : 0;
      await assertRoom(deps, me, checked.length - stored);
      const now = deps.now();
      const out: { pedido: ReturnType<typeof requestOut>; item: DesejoV1 | PraDepoisV1; repetido?: true }[] = [];
      for (const [i, d] of checked.entries()) {
        const { row, repeated } = await createRequest(deps, me, op, idDeFicha(now.getTime(), randomBase36()), d, idem ? (batch ? `${idem}:${i}` : idem) : null);
        const shown = JSON.parse(row.dados) as PorItemV1;
        const item = tipo === 'desejo' ? desejoDoPedido(row.alvo, shown, row.criado_em) : itemDoPedido(row.alvo, shown, row.criado_em);
        out.push({ pedido: requestOut(row, deps.now()), item, ...(repeated ? { repetido: true as const } : {}) });
      }
      const name = tipo === 'desejo' ? 'desejo' : 'pra_depois';
      if (batch) return c.json({ pedidos: out.map((o) => o.pedido), [WHAT[tipo].plural]: out.map((o) => o.item) }, 202);
      return c.json({ pedido: out[0]!.pedido, [name]: out[0]!.item, ...(out[0]!.repetido ? { repetido: true } : {}) }, 202);
    });
  }

  /** O item de agora e a versão dele (409 com ele, se a AI leu uma velha). */
  async function editable(c: Context, me: KeyCaller, tipo: ListKind, id: string, versao: string) {
    const cur = await currentItem(deps, me.key.userId, tipo, id);
    if (!cur) throw new HttpError(404, WHAT[tipo].missing, `Não achei ${WHAT[tipo].one} ${WHAT[tipo].where}.`);
    if (cur.versao !== versao) {
      return {
        conflict: c.json(
          { erro: 'versao-velha', mensagem: `${WHAT[tipo].one[0]!.toUpperCase()}${WHAT[tipo].one.slice(1)} mudou depois que você leu. Leia de novo (o de agora vai aqui) e mande a versao nova.`, [tipo === 'desejo' ? 'desejo' : 'pra_depois']: cur },
          409,
        ),
        cur,
      };
    }
    return { conflict: null, cur };
  }

  /** Tirar, com a versão em ?versao=. */
  function dropRoute(path: string, tipo: ListKind, op: OpMural) {
    app.delete(`${path}/:id`, async (c) => {
      const me = await authenticateKey(deps, c.req.header('Authorization'));
      requireScope(me, ESCOPO_DA_OP_MURAL[op]);
      const idem = readIdem(c.req.header('Idempotency-Key'));
      const r = conferirOpMural(op, { versao: c.req.query('versao') ?? (await readJson(c))['versao'] });
      if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} Ela vai em ?versao= (campo ${r.campo})`);
      const { conflict, cur } = await editable(c, me, tipo, c.req.param('id'), (r.dados as TirarV1).versao);
      if (conflict) return conflict;
      const { row, repeated } = await createRequest(deps, me, op, cur.id, r.dados, idem);
      return c.json({ pedido: requestOut(row, deps.now()), [tipo === 'desejo' ? 'desejo' : 'pra_depois']: null, ...(repeated ? { repetido: true } : {}) }, 202);
    });
  }

  putRoute('/ext/v1/desejos', 'desejo', 'desejo.por');
  putRoute('/ext/v1/pra-depois', 'pra-depois', 'pra-depois.por');
  dropRoute('/ext/v1/desejos', 'desejo', 'desejo.tirar');
  dropRoute('/ext/v1/pra-depois', 'pra-depois', 'pra-depois.tirar');

  app.patch('/ext/v1/desejos/:id', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_MURAL['desejo.editar']);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const r = conferirOpMural('desejo.editar', await readJson(c));
    if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} (campo ${r.campo})`);
    const d = r.dados as EditarDesejoV1;
    const { conflict, cur } = await editable(c, me, 'desejo', c.req.param('id'), d.versao);
    if (conflict) return conflict;
    const { row, repeated } = await createRequest(deps, me, 'desejo.editar', cur.id, d, idem);
    const { pedidos: _p, ...after } = editarDesejoV1(cur as DesejoV1, d, row.criado_em) as DesejoV1 & { pedidos?: unknown };
    return c.json({ pedido: requestOut(row, deps.now()), desejo: after, ...(repeated ? { repetido: true } : {}) }, 202);
  });
}
