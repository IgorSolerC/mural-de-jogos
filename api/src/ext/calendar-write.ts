import { Context, Hono } from 'hono';
import { regrasDoLembrete } from '../../../contrato/api-v1/calendario';
import { idDeFicha } from '../../../contrato/api-v1/operacoes';
import {
  ESCOPO_DA_OP_LEMBRETE,
  camposDoGoogle,
  conferirOpLembrete,
  editarLembreteV1,
  lembreteDoPedido,
  tirarDiaV1,
  type ApagarLembreteV1,
  type CriarLembreteV1,
  type EditarLembreteV1,
} from '../../../contrato/api-v1/operacoes-calendario';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { createRequest, randomBase36, readIdem, requestOut } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from '../routes/http';
import { currentReminder } from './calendar-read';

/**
 * Escrever no Calendário (PLANO-API.md, 7.4; rodada 7): cada rota confere a forma (contrato/api-v1/
 * operacoes-calendario.ts), a permissão e o que dá para conferir sem abrir o mural (o lembrete existe,
 * a versão é a de agora, o lembrete do Google travado só muda a cor e as notas, os campos combinam), e
 * guarda um pedido. Responde 202 com o pedido e o lembrete como vai ficar; quem aplica é o Murall
 * aberto (e o Google Agenda vai depois, como numa edição da folha).
 */

const notFound = () => new HttpError(404, 'lembrete-nao-encontrado', 'Não achei esse lembrete.');
const invalid = (campo: string, erro: string) => new HttpError(422, 'lembrete-invalido', `${erro} (campo ${campo})`);

export function calendarWriteRoutes(app: Hono, deps: Deps): void {
  app.post('/ext/v1/lembretes', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_LEMBRETE['lembrete.criar']);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const r = conferirOpLembrete('lembrete.criar', await readJson(c));
    if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} (campo ${r.campo})`);
    const d = r.dados as CriarLembreteV1;
    const now = deps.now();
    const broken = regrasDoLembrete(lembreteDoPedido('x', d, now.toISOString()));
    if (broken) throw invalid(broken.campo, broken.erro);
    const { row, repeated } = await createRequest(deps, me, 'lembrete.criar', idDeFicha(now.getTime(), randomBase36()), d, idem);
    const lembrete = lembreteDoPedido(row.alvo, JSON.parse(row.dados) as CriarLembreteV1, row.criado_em);
    return c.json({ pedido: requestOut(row, deps.now()), lembrete, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  /** O lembrete de agora e a versão dele (409 com ele, se a AI leu uma velha). */
  async function editable(c: Context, me: KeyCaller, id: string, versao: string) {
    const cur = await currentReminder(deps, me.key.userId, id);
    if (!cur) throw notFound();
    if (cur.versao !== versao) {
      return {
        conflict: c.json({ erro: 'versao-velha', mensagem: 'O lembrete mudou depois que você o leu. Leia de novo (o de agora vai aqui) e mande a versao nova.', lembrete: cur }, 409),
        cur,
      };
    }
    return { conflict: null, cur };
  }

  app.patch('/ext/v1/lembretes/:id', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_LEMBRETE['lembrete.editar']);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const r = conferirOpLembrete('lembrete.editar', await readJson(c));
    if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} (campo ${r.campo})`);
    const d = r.dados as EditarLembreteV1;
    const { conflict, cur } = await editable(c, me, c.req.param('id'), d.versao);
    if (conflict) return conflict;
    const google = camposDoGoogle(d);
    if (cur.google?.travado && google.length) {
      throw new HttpError(
        422,
        'lembrete-do-google',
        `"${cur.titulo}" ${cur.google.travado === 'convite' ? 'é um convite de outra pessoa no Google Agenda' : 'é um evento do próprio Google (como um aniversário)'}: por aqui só mudam a cor e as notas, não ${google.join(', ')}.`,
      );
    }
    const shown = editarLembreteV1(cur, d, deps.now().toISOString());
    const broken = regrasDoLembrete(shown);
    if (broken) throw invalid(broken.campo, broken.erro);
    const { row, repeated } = await createRequest(deps, me, 'lembrete.editar', cur.id, d, idem);
    const { pedidos: _p, ...after } = editarLembreteV1(cur, d, row.criado_em) as typeof cur;
    return c.json({ pedido: requestOut(row, deps.now()), lembrete: after, ...(repeated ? { repetido: true } : {}) }, 202);
  });

  // Apagar o lembrete, ou só uma vez dele (?dia=), com a versão em ?versao=.
  app.delete('/ext/v1/lembretes/:id', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP_LEMBRETE['lembrete.apagar']);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const body = c.req.query('versao') === undefined ? await readJson(c) : {};
    const r = conferirOpLembrete('lembrete.apagar', { versao: c.req.query('versao') ?? body['versao'], dia: c.req.query('dia') ?? body['dia'] });
    if (!r.ok) throw new HttpError(400, 'pedido-invalido', `${r.erro} Ela vai em ?versao= (campo ${r.campo})`);
    const d = r.dados as ApagarLembreteV1;
    const { conflict, cur } = await editable(c, me, c.req.param('id'), d.versao);
    if (conflict) return conflict;
    if (d.dia) {
      if (!cur.repete) throw new HttpError(422, 'nao-repete', `"${cur.titulo}" não se repete: para tirá-lo, apague sem o dia.`);
      if (d.dia < cur.dia || (cur.repete.ate && d.dia > cur.repete.ate)) {
        throw new HttpError(422, 'dia-fora', `"${cur.titulo}" vai de ${cur.dia}${cur.repete.ate ? ` a ${cur.repete.ate}` : ' em diante'}: ${d.dia} não é uma vez dele. Veja os dias na agenda.`);
      }
    }
    const { row, repeated } = await createRequest(deps, me, 'lembrete.apagar', cur.id, d, idem);
    let lembrete = null;
    if (d.dia) {
      const { pedidos: _p, ...rest } = tirarDiaV1(cur, d.dia, row.criado_em) as typeof cur;
      lembrete = rest;
    }
    return c.json({ pedido: requestOut(row, deps.now()), lembrete, ...(repeated ? { repetido: true } : {}) }, 202);
  });
}
