import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import type { ContextoGastosV1, LancamentoV1 } from '../../../contrato/api-v1/gastos';
import { idDeFicha } from '../../../contrato/api-v1/operacoes';
import {
  ESCOPO_DA_OP_GASTO,
  LOTE_MAX,
  acharEnvelope,
  acharPessoa,
  conferirOpGasto,
  editarLancamentoV1,
  lancamentoDoPedido,
  type CamposDoLancamento,
  type EditarLancamentoV1,
  type LancarV1,
  type OpGasto,
} from '../../../contrato/api-v1/operacoes-gastos';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { todayIn } from '../domain/mirror';
import { createRequest, randomBase36, readIdem, requestOut } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from '../routes/http';
import { mirrorState } from './routes';
import { currentEntry, spendingContext } from './spending-read';

/**
 * Escrever nos Gastos (PLANO-API.md, 7.4; rodada 6): cada rota confere a forma (contrato/api-v1/
 * operacoes-gastos.ts), a permissão e o que dá para conferir sem abrir o mural (o envelope e as
 * pessoas existem? o lançamento existe e a versão é a de agora?), e guarda um pedido por lançamento.
 * Responde 202 com o pedido e o lançamento como vai ficar; quem aplica é o Murall aberto.
 */

const names = (list: readonly { nome: string }[]) => list.map((x) => x.nome).join(', ');
const unprocessable = (code: string, message: string) => new HttpError(422, code, message);

export function spendingWriteRoutes(app: Hono, deps: Deps): void {
  /** Confere o envelope, as pessoas e o reembolso contra o que existe (sem o contexto ainda, passa). */
  async function checkRefs(me: KeyCaller, ctx: ContextoGastosV1 | null, d: CamposDoLancamento & { criar_envelope?: true; criar_pessoas?: true }, tipo: 'saida' | 'entrada', where: string) {
    if (d.criar_envelope || d.criar_pessoas) requireScope(me, 'gastos:editar');
    if (!ctx) return;
    if (d.envelope) {
      const env = acharEnvelope(ctx, d.envelope);
      if (!env && !d.criar_envelope) {
        const same = ctx.envelopes.filter((e) => e.tipo === tipo);
        throw unprocessable(
          'envelope-desconhecido',
          `${where}O envelope "${d.envelope}" não existe. Os de ${tipo === 'saida' ? 'saída' : 'entrada'} são: ${names(same)}. Para criar um novo, mande "criar_envelope": true.`,
        );
      }
      if (env && env.tipo !== tipo) {
        throw unprocessable('envelope-de-outro-tipo', `${where}O envelope "${env.nome}" é de ${env.tipo === 'saida' ? 'saída' : 'entrada'}, e o lançamento é de ${tipo === 'saida' ? 'saída' : 'entrada'}.`);
      }
    }
    const unknown = (d.pessoas ?? []).filter((p) => !acharPessoa(ctx, p));
    if (unknown.length && !d.criar_pessoas) {
      throw unprocessable(
        'pessoa-desconhecida',
        `${where}Não há ${unknown.map((p) => `"${p}"`).join(', ')} nos Gastos. As pessoas são: ${names(ctx.pessoas)} ("eu" é você). Para criar, mande "criar_pessoas": true.`,
      );
    }
    if (d.reembolso_de) {
      const of = await currentEntry(deps, me.key.userId, d.reembolso_de);
      if (!of || of.tipo !== 'saida') throw unprocessable('gasto-nao-encontrado', `${where}Não achei o gasto ${d.reembolso_de} para o reembolso.`);
    }
  }

  // Lançar: um, um lote (`itens`), uma frase ou várias (`frases`). Um pedido por lançamento.
  app.post('/ext/v1/gastos/lancamentos', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_GASTO['gasto.lancar']);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const raw = await readJson(c, 256_000);
    const batch = Array.isArray(raw['itens']) ? raw['itens'] : Array.isArray(raw['frases']) ? (raw['frases'] as unknown[]).map((frase) => ({ frase, criar_pessoas: raw['criar_pessoas'] })) : null;
    const list = batch ?? [raw];
    if (!list.length || list.length > LOTE_MAX) throw new HttpError(400, 'pedido-invalido', `Um lote tem de 1 a ${LOTE_MAX} lançamentos.`);
    const ctx = await spendingContext(deps, me.key.userId);
    const userId = me.key.userId;
    // confere tudo antes de guardar qualquer um: o lote entra inteiro ou nada
    const checked: LancarV1[] = [];
    for (const [i, item] of list.entries()) {
      const where = batch ? `Item ${i + 1}: ` : '';
      const r = conferirOpGasto('gasto.lancar', item);
      if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${where}${r.erro} (campo ${r.campo})`);
      const d = r.dados as LancarV1;
      if (d.criar_pessoas) requireScope(me, 'gastos:editar');
      if (!('frase' in d)) await checkRefs(me, ctx, d, d.tipo ?? 'saida', where);
      checked.push(d);
    }
    const now = deps.now();
    const state = await mirrorState(deps, userId);
    const hoje = todayIn(state.fuso, now);
    const out: { pedido: ReturnType<typeof requestOut>; lancamento: LancamentoV1 | null; repetido?: true }[] = [];
    for (const [i, d] of checked.entries()) {
      const alvo = idDeFicha(now.getTime(), randomBase36());
      const { row, repeated } = await createRequest(deps, me, 'gasto.lancar', alvo, d, idem ? (batch ? `${idem}:${i}` : idem) : null);
      const shown = lancamentoDoPedido(row.alvo, JSON.parse(row.dados) as LancarV1, ctx, hoje, row.criado_em);
      out.push({ pedido: requestOut(row, deps.now()), lancamento: shown, ...(repeated ? { repetido: true as const } : {}) });
    }
    if (batch) return c.json({ pedidos: out.map((o) => o.pedido), lancamentos: out.map((o) => o.lancamento) }, 202);
    return c.json(out[0], 202);
  });

  /** O lançamento de agora e a versão dele (409 com ele, se a AI leu uma velha). */
  async function editable(c: Context, me: KeyCaller, id: string, versao: string) {
    if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(404, 'lancamento-nao-encontrado', 'Não achei esse lançamento.');
    const cur = await currentEntry(deps, me.key.userId, id);
    if (!cur) throw new HttpError(404, 'lancamento-nao-encontrado', 'Não achei esse lançamento.');
    if (cur.versao !== versao) {
      return {
        conflict: c.json(
          { erro: 'versao-velha', mensagem: 'O lançamento mudou depois que você o leu. Leia de novo (o de agora vai aqui) e mande a versao nova.', lancamento: cur },
          409,
        ),
        cur,
      };
    }
    return { conflict: null, cur };
  }

  app.patch('/ext/v1/gastos/lancamentos/:id', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_GASTO['gasto.editar']);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const r = conferirOpGasto('gasto.editar', await readJson(c, 64_000));
    if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} (campo ${r.campo})`);
    const d = r.dados as EditarLancamentoV1;
    const { conflict, cur } = await editable(c, me, c.req.param('id'), d.versao);
    if (conflict) return conflict;
    const ctx = await spendingContext(deps, me.key.userId);
    await checkRefs(me, ctx, d, d.tipo ?? cur.tipo, '');
    const { row, repeated } = await createRequest(deps, me, 'gasto.editar', cur.id, d, idem);
    return c.json({ pedido: requestOut(row, deps.now()), lancamento: editarLancamentoV1(cur, d, ctx, row.criado_em), ...(repeated ? { repetido: true } : {}) }, 202);
  });

  app.delete('/ext/v1/gastos/lancamentos/:id', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_GASTO['gasto.apagar']);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const r = conferirOpGasto('gasto.apagar', { versao: c.req.query('versao') ?? (await readJson(c))['versao'] });
    if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} Ela vai em ?versao= (campo ${r.campo})`);
    const { conflict, cur } = await editable(c, me, c.req.param('id'), (r.dados as { versao: string }).versao);
    if (conflict) return conflict;
    const { row, repeated } = await createRequest(deps, me, 'gasto.apagar', cur.id, r.dados, idem);
    return c.json({ pedido: requestOut(row, deps.now()), lancamento: null, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Envelopes e pessoas: criar e mudar (o vocabulário; apagar fica na tela).
  async function vocab(c: Context, op: OpGasto, ref: string | null) {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_GASTO[op]);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const r = conferirOpGasto(op, await readJson(c));
    if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} (campo ${r.campo})`);
    const d = r.dados as { nome?: string };
    const ctx = await spendingContext(deps, me.key.userId);
    const envelope = op.startsWith('envelope.');
    let alvo: string;
    if (ref === null) {
      const taken = envelope ? acharEnvelope(ctx, d.nome!) : ctx?.pessoas.find((p) => dobra(p.nome) === dobra(d.nome!));
      if (taken) throw new HttpError(409, envelope ? 'envelope-existe' : 'pessoa-existe', `Já existe ${envelope ? 'o envelope' : 'a pessoa'} "${taken.nome}" (id ${taken.id}).`);
      alvo = idDeFicha(deps.now().getTime(), randomBase36());
    } else {
      const found = envelope ? acharEnvelope(ctx, ref) : acharPessoa(ctx, ref);
      if (!found) {
        throw new HttpError(404, envelope ? 'envelope-nao-encontrado' : 'pessoa-nao-encontrada', `Não achei ${envelope ? 'o envelope' : 'a pessoa'} "${ref.slice(0, 40)}". ${envelope ? 'Os envelopes' : 'As pessoas'}: ${names(envelope ? (ctx?.envelopes ?? []) : (ctx?.pessoas ?? []))}.`);
      }
      if (envelope && 'tipo' in found && found.tipo === 'entrada' && (r.dados as { limite_centavos?: unknown }).limite_centavos != null) {
        throw unprocessable('limite-so-na-saida', 'O limite do mês só vale num envelope de saída.');
      }
      alvo = found.id;
    }
    const { row, repeated } = await createRequest(deps, me, op, alvo, r.dados, idem);
    return c.json({ pedido: requestOut(row, deps.now()), ...(repeated ? { repetido: true } : {}) }, 202);
  }

  app.post('/ext/v1/gastos/envelopes', (c) => vocab(c, 'envelope.criar', null));
  app.patch('/ext/v1/gastos/envelopes/:id', (c) => vocab(c, 'envelope.editar', decodeURIComponent(c.req.param('id'))));
  app.post('/ext/v1/gastos/pessoas', (c) => vocab(c, 'pessoa.criar', null));
  app.patch('/ext/v1/gastos/pessoas/:id', (c) => vocab(c, 'pessoa.editar', decodeURIComponent(c.req.param('id'))));
}
