import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import { CONTEXTO_NOTAS, type ContextoNotasV1, type NotaV1 } from '../../../contrato/api-v1/notas';
import { ESCOPO_DA_OP, TEXTO_MAX, acrescentar, conferirOp, idDeFicha, mexerNasTarefas, type AcrescentarV1, type CamposDaNota, type CriarNotaV1, type EditarNotaV1, type OpNota, type TarefasV1 } from '../../../contrato/api-v1/operacoes';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { REQUEST_COLUMNS, REQUEST_ID_RE, createRequest, randomBase36, readIdem, requestOut, type RequestRow } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { createdNote, overlay, pendingOf } from './overlay';
import { acharColuna } from '../../../contrato/api-v1/operacoes-kanban';
import { findBoard } from './kanban-read';
import { unknownColumn } from './kanban-write';
import { readJson } from '../routes/http';

/**
 * Escrever nas Anotações (PLANO-API.md, 7.3 e 7.4): cada rota confere a forma (contrato/api-v1/
 * operacoes.ts), a permissão, os grupos da chave e o que dá para conferir sem abrir o mural (a nota
 * existe no espelho? a versão é a de agora? o grupo existe?), e guarda um pedido. Responde 202 com o
 * pedido e a nota como vai ficar; quem aplica é o Murall aberto.
 */

const notFound = () => new HttpError(404, 'nota-nao-encontrada', 'Não achei essa nota (ou ela está num grupo que esta chave não alcança).');
const outsideGroups = () => new HttpError(403, 'fora-dos-grupos', 'Esta chave só alcança alguns grupos das Anotações, e este não é um deles.');

/** O grupo cabe na chave? (Chave limitada: a nota sem grupo também fica de fora.) */
function inKeyGroups(caller: KeyCaller, grupo: string | null): boolean {
  const groups = caller.key.groups;
  return !groups?.length || (grupo !== null && groups.some((g) => dobra(g) === dobra(grupo)));
}

export function notesWriteRoutes(app: Hono, deps: Deps): void {
  /** A nota de agora: a do espelho, ou a de um pedido de criar ainda não aplicado; com os pedidos por cima. */
  async function current(userId: string, id: string) {
    const pending = await pendingOf(deps, userId);
    const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'nota' AND id = ?", [userId, id]);
    const now = deps.now();
    if (row) {
      const mirrored = JSON.parse(row.dados) as NotaV1;
      return { mirrored, shown: overlay(mirrored, pending.byNote.get(id), now) };
    }
    const created = pending.created.find((r) => r.alvo === id);
    return created ? { mirrored: null, shown: createdNote(created, pending, now) } : null;
  }

  /** O grupo existe nas Anotações? Sem o contexto no espelho ainda, não dá para saber: passa. */
  async function checkNewGroup(userId: string, grupo: string | null | undefined, allowNew: boolean): Promise<void> {
    if (!grupo || allowNew) return;
    const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto' AND id = ?", [userId, CONTEXTO_NOTAS]);
    if (!row) return;
    const ctx = JSON.parse(row.dados) as ContextoNotasV1;
    if (ctx.grupos.some((g) => dobra(g.nome) === dobra(grupo))) return;
    const names = ctx.grupos.map((g) => g.nome);
    throw new HttpError(
      422,
      'grupo-novo',
      `O grupo "${grupo}" não existe. ${names.length ? `Os grupos são: ${names.join(', ')}.` : 'Ainda não há grupos.'} Para criar um grupo novo mesmo, mande "criar_grupo": true.`,
    );
  }

  async function handle(c: Context, op: OpNota, id: string | null): Promise<Response> {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, ESCOPO_DA_OP[op]);
    const idem = readIdem(c.req.header('Idempotency-Key'));
    const raw = op === 'nota.criar' || op === 'nota.editar' || op === 'nota.acrescentar' || op === 'nota.tarefas' ? await readJson(c, 64_000) : {};
    const checked = conferirOp(op, raw);
    if (!checked.ok) throw new HttpError(400, 'pedido-invalido', `${checked.erro} (campo ${checked.campo})`);
    const fields = checked.dados as CamposDaNota;
    if (fields.visibilidade !== undefined) requireScope(me, 'publicar');
    const allowNew = raw['criar_grupo'] === true;
    const userId = me.key.userId;
    const now = deps.now();
    let alvo: string;

    if (op === 'nota.criar') {
      alvo = idDeFicha(now.getTime(), randomBase36());
      if (!inKeyGroups(me, fields.grupo ?? null)) throw outsideGroups();
      await checkNewGroup(userId, fields.grupo, allowNew);
      // a nota que já nasce no quadro do grupo (como o "Nova nota" de dentro de uma coluna)
      const k = (checked.dados as CriarNotaV1).kanban;
      if (k) {
        requireScope(me, 'kanban:mover');
        if (!fields.grupo) throw new HttpError(422, 'kanban-sem-grupo', 'Uma nota sem grupo não tem quadro: mande o grupo junto com o kanban.');
        // o quadro de um grupo novo ainda não existe (nasce com A fazer, Fazendo e Feito): o site confere
        const q = await findBoard(deps, me, fields.grupo);
        if (q && k.coluna) {
          const col = acharColuna(q, k.coluna);
          if (!col) throw unknownColumn(q, k.coluna);
          k.coluna = col.id;
        }
      }
    } else {
      if (!id || !/^[\w-]{1,64}$/.test(id)) throw notFound();
      alvo = id;
      const cur = await current(userId, id);
      if (!cur || !inKeyGroups(me, cur.shown.grupo)) throw notFound();
      if (op === 'nota.editar') {
        const e = checked.dados as EditarNotaV1;
        if (e.grupo !== undefined && !inKeyGroups(me, e.grupo)) throw outsideGroups();
        if (e.grupo !== undefined && (!cur.shown.grupo || dobra(e.grupo ?? '') !== dobra(cur.shown.grupo))) await checkNewGroup(userId, e.grupo, allowNew);
        // a versão que a AI leu não é a de agora: outra mudança passou na frente (ela relê e tenta de novo)
        if (cur.mirrored && cur.mirrored.versao !== e.versao) {
          return c.json(
            { erro: 'versao-velha', mensagem: 'A nota mudou depois que você a leu. Leia de novo (a nota de agora vai aqui) e mande a versao nova.', nota: cur.shown },
            409,
          );
        }
      }
      // o que dá para conferir no texto de agora, confere já: a AI corrige na hora, sem esperar o site
      if (op === 'nota.tarefas') {
        const r = mexerNasTarefas(cur.shown.texto, checked.dados as TarefasV1);
        if (!r.ok) throw new HttpError(422, 'tarefa-nao-encontrada', r.erro);
      }
      if (op === 'nota.acrescentar') {
        const a = checked.dados as AcrescentarV1;
        if (acrescentar(cur.shown.texto, a.texto, a.onde).length > TEXTO_MAX) throw new HttpError(422, 'texto-grande-demais', `A nota passaria de ${TEXTO_MAX} letras.`);
      }
    }

    const { row, repeated } = await createRequest(deps, me, op, alvo, checked.dados, idem);
    const after = await current(userId, row.alvo);
    return c.json({ pedido: requestOut(row, deps.now()), nota: op === 'nota.apagar' ? null : (after?.shown ?? null), ...(repeated ? { repetido: true } : {}) }, 202);
  }

  app.post('/ext/v1/notas', (c) => handle(c, 'nota.criar', null));
  app.patch('/ext/v1/notas/:id', (c) => handle(c, 'nota.editar', c.req.param('id')));
  app.post('/ext/v1/notas/:id/acrescentar', (c) => handle(c, 'nota.acrescentar', c.req.param('id')));
  app.post('/ext/v1/notas/:id/tarefas', (c) => handle(c, 'nota.tarefas', c.req.param('id')));
  app.post('/ext/v1/notas/:id/finalizar', (c) => handle(c, 'nota.finalizar', c.req.param('id')));
  app.post('/ext/v1/notas/:id/reabrir', (c) => handle(c, 'nota.reabrir', c.req.param('id')));
  app.post('/ext/v1/notas/:id/fixar', (c) => handle(c, 'nota.fixar', c.req.param('id')));
  app.post('/ext/v1/notas/:id/desafixar', (c) => handle(c, 'nota.desafixar', c.req.param('id')));
  app.delete('/ext/v1/notas/:id', (c) => handle(c, 'nota.apagar', c.req.param('id')));

  // ===== Os pedidos desta chave: em que pé estão =====

  app.get('/ext/v1/pedidos', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limite') ?? 30) || 30));
    const rows = await deps.db.all<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM api_pedidos WHERE usuario_id = ? AND chave_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT ?`,
      [me.key.userId, me.key.id, limit],
    );
    const now = deps.now();
    const estado = c.req.query('estado');
    const itens = rows.map((r) => requestOut(r, now)).filter((r) => !estado || r.estado === estado);
    return c.json({ itens });
  });

  app.get('/ext/v1/pedidos/:id', async (c) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    const id = c.req.param('id');
    const row = REQUEST_ID_RE.test(id)
      ? await deps.db.first<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM api_pedidos WHERE id = ? AND usuario_id = ? AND chave_id = ?`, [id, me.key.userId, me.key.id])
      : null;
    if (!row) throw new HttpError(404, 'pedido-nao-encontrado', 'Não achei esse pedido entre os desta chave.');
    return c.json({ pedido: requestOut(row, deps.now()) });
  });
}
