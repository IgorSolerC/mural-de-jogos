import type { Aprovacao } from '../../../contrato/api-v1/escopos';
import { ESCOPO_DA_OP, opMuda, type EstadoDoPedido } from '../../../contrato/api-v1/operacoes';
import { ESCOPO_DA_OP_LEMBRETE } from '../../../contrato/api-v1/operacoes-calendario';
import { ESCOPO_DA_OP_GASTO } from '../../../contrato/api-v1/operacoes-gastos';
import { ESCOPO_DA_OP_KANBAN } from '../../../contrato/api-v1/operacoes-kanban';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { KeyCaller } from './api-key';
import { base64url } from './bytes';
import { DAY_MS, usageToday, write } from './quota';

/**
 * Os pedidos (PLANO-API.md, 7.3 e 9): toda escrita da API das AIs vira uma linha em `api_pedidos`, que
 * o Murall aberto em algum aparelho pega, aplica pelas funções da tela e conclui. A nuvem nunca abre o
 * mural; aqui só se guarda, se conta e se responde em que pé está.
 */

/** Quanto tempo um pedido espera um aparelho aberto (ou a aprovação) antes de expirar. */
export const REQUEST_DAYS = 30;
/** Quanto tempo um aparelho segura um pedido que pegou para aplicar. */
export const LEASE_MS = 2 * 60 * 1000;
/** Pedidos por chave e por conta em 24 horas. */
export const PER_KEY_DAY = 300;
export const PER_ACCOUNT_DAY = 1000;
/** A API das AIs para de gravar quando o dia passa desta fração da cota (o resto é da sincronização). */
export const API_SHARE = 0.85;
/** O tamanho do que o site guarda num pedido concluído (a nota como ficou, a de antes). */
export const RESULT_MAX_CHARS = 64_000;
export const REQUEST_ID_RE = /^pd_[A-Za-z0-9_-]{16}$/;

export interface RequestRow {
  id: string;
  usuario_id: string;
  chave_id: string;
  chave_nome: string;
  op: string;
  alvo: string;
  dados: string;
  estado: string;
  chave_idem: string | null;
  pego_por: string | null;
  pego_ate: string | null;
  resultado: string | null;
  antes: string | null;
  criado_em: string;
  expira_em: string;
  resolvido_em: string | null;
}

export const REQUEST_COLUMNS =
  'id, usuario_id, chave_id, chave_nome, op, alvo, dados, estado, chave_idem, pego_por, pego_ate, resultado, antes, criado_em, expira_em, resolvido_em';

export function newRequestId(): string {
  return `pd_${base64url(crypto.getRandomValues(new Uint8Array(12)))}`;
}

/** 12 letras aleatórias em base 36 minúscula (o miolo do id de uma ficha). */
export function randomBase36(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
}

/** O estado como a pessoa vê: um pedido aberto cujo prazo passou já é "expirado" (a limpeza grava depois). */
export function stateOf(row: Pick<RequestRow, 'estado' | 'expira_em'>, now: Date): EstadoDoPedido {
  const open = row.estado === 'pendente' || row.estado === 'aguardando-aprovacao';
  return (open && Date.parse(row.expira_em) <= now.getTime() ? 'expirado' : row.estado) as EstadoDoPedido;
}

const parse = (text: string | null): unknown => {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** O pedido como a AI vê (sem o `antes`, que é da pessoa). */
export function requestOut(row: RequestRow, now: Date) {
  return {
    id: row.id,
    op: row.op,
    alvo: row.alvo,
    estado: stateOf(row, now),
    criado_em: row.criado_em,
    expira_em: row.expira_em,
    resolvido_em: row.resolvido_em,
    ...(row.resultado ? { resultado: parse(row.resultado) } : {}),
  };
}

/** O pedido como o site vê: com os dados (para aplicar), a chave e o `antes` (para o Desfazer). */
export function requestForSite(row: RequestRow, now: Date) {
  return {
    ...requestOut(row, now),
    dados: parse(row.dados),
    chave: { id: row.chave_id, nome: row.chave_nome },
    ...(row.antes ? { antes: parse(row.antes) } : {}),
  };
}

/**
 * Os pedidos abertos da conta (pendentes e esperando aprovação, ainda no prazo), na ordem em que
 * chegaram: pela hora e, no mesmo milissegundo (uma AI rápida), pela ordem de gravação (`rowid`), para
 * "acrescentar a tarefa" vir sempre antes de "marcar a tarefa".
 */
export function openRequests(deps: Deps, userId: string, limit = 200): Promise<RequestRow[]> {
  return deps.db.all<RequestRow>(
    `SELECT ${REQUEST_COLUMNS} FROM api_pedidos WHERE usuario_id = ? AND estado IN ('pendente', 'aguardando-aprovacao') AND expira_em > ? ORDER BY criado_em, rowid LIMIT ?`,
    [userId, deps.now().toISOString(), limit],
  );
}

/**
 * Cabem mais `n` pedidos? Confere os freios (por chave e por conta, nas últimas 24 horas) e a fatia da
 * cota do dia que a API das AIs pode usar. Um lote confere a vaga de todos antes de guardar o primeiro:
 * sem isso, o freio cortava o lote no meio (uns guardados, os outros não) e a AI, ao repetir, dobrava os
 * que já tinham entrado.
 */
export async function assertRoom(deps: Deps, caller: KeyCaller, n: number): Promise<void> {
  if (n <= 0) return;
  const key = caller.key;
  const since = new Date(deps.now().getTime() - DAY_MS).toISOString();
  const counts = await deps.db.first<{ chave: number; conta: number }>(
    'SELECT (SELECT COUNT(*) FROM api_pedidos WHERE usuario_id = ? AND chave_id = ? AND criado_em > ?) AS chave, ' +
      '(SELECT COUNT(*) FROM api_pedidos WHERE usuario_id = ? AND criado_em > ?) AS conta',
    [key.userId, key.id, since, key.userId, since],
  );
  if ((counts?.chave ?? 0) + n > PER_KEY_DAY) throw new HttpError(429, 'pedidos-demais', `Esta chave já fez ${counts?.chave ?? 0} de ${PER_KEY_DAY} pedidos nas últimas 24 horas.`);
  if ((counts?.conta ?? 0) + n > PER_ACCOUNT_DAY) throw new HttpError(429, 'pedidos-demais', `Esta conta já recebeu ${counts?.conta ?? 0} de ${PER_ACCOUNT_DAY} pedidos nas últimas 24 horas.`);
  const usage = await usageToday(deps);
  if (usage.rowsWritten >= deps.config.dailyRowBudget * API_SHARE) {
    throw new HttpError(503, 'cota-api', 'A API das AIs chegou ao limite de hoje (o resto da cota fica para a sincronização). Tente depois das 21h.');
  }
}

/**
 * O pedido espera a pessoa aprovar? Com "mudancas", espera o que muda ou apaga, e também o que usa a
 * permissão "Mudar quem vê" (marcada como mudança e cuidado): uma nota que já nasce pública não entra
 * sem a pessoa ver.
 */
export function waitsForApproval(approval: Aprovacao, op: string, dados: unknown): boolean {
  if (approval === 'tudo') return true;
  if (approval !== 'mudancas') return false;
  const publishes = op === 'nota.criar' && (dados as { visibilidade?: unknown } | null)?.visibilidade === 'publica';
  return opMuda(op) || publishes;
}

/**
 * As permissões que um pedido usou (a da operação e as que os dados pedem a mais): quando a pessoa tira
 * uma delas da chave, o pedido aberto não entra mais.
 */
export function scopesOfRequest(op: string, dados: unknown): string[] {
  const d = (dados && typeof dados === 'object' ? dados : {}) as Record<string, unknown>;
  const base =
    (ESCOPO_DA_OP as Record<string, string>)[op] ??
    (ESCOPO_DA_OP_KANBAN as Record<string, string>)[op] ??
    (ESCOPO_DA_OP_GASTO as Record<string, string>)[op] ??
    (ESCOPO_DA_OP_LEMBRETE as Record<string, string>)[op];
  const out = new Set<string>(base ? [base] : []);
  if (d['visibilidade'] !== undefined) out.add('publicar');
  if (op === 'nota.criar' && d['kanban']) out.add('kanban:mover');
  if (d['criar_envelope'] || d['criar_pessoas']) out.add('gastos:editar');
  return [...out];
}

/**
 * Guarda um pedido. Com o mesmo `Idempotency-Key` da mesma chave, devolve o que já existia (sem criar
 * outro). Confere os freios (por chave e por conta, nas últimas 24 horas) e a fatia da cota do dia que
 * a API das AIs pode usar. O estado sai da aprovação da chave.
 */
export async function createRequest(
  deps: Deps,
  caller: KeyCaller,
  op: string,
  alvo: string,
  dados: unknown,
  idem: string | null,
): Promise<{ row: RequestRow; repeated: boolean }> {
  const now = deps.now();
  const key = caller.key;
  if (idem) {
    const same = await deps.db.first<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM api_pedidos WHERE chave_id = ? AND chave_idem = ?`, [key.id, idem]);
    if (same) {
      if (same.op !== op || (same.alvo !== alvo && !op.endsWith('.criar') && op !== 'gasto.lancar')) {
        throw new HttpError(409, 'idempotencia', 'Esse Idempotency-Key já foi usado num pedido diferente desta chave.');
      }
      return { row: same, repeated: true };
    }
  }
  await assertRoom(deps, caller, 1);
  const waits = waitsForApproval(key.approval, op, dados);
  const row: RequestRow = {
    id: newRequestId(),
    usuario_id: key.userId,
    chave_id: key.id,
    chave_nome: key.name,
    op,
    alvo,
    dados: JSON.stringify(dados),
    estado: waits ? 'aguardando-aprovacao' : 'pendente',
    chave_idem: idem,
    pego_por: null,
    pego_ate: null,
    resultado: null,
    antes: null,
    criado_em: now.toISOString(),
    expira_em: new Date(now.getTime() + REQUEST_DAYS * DAY_MS).toISOString(),
    resolvido_em: null,
  };
  try {
    await write(
      deps,
      [
        {
          sql: `INSERT INTO api_pedidos (${REQUEST_COLUMNS}) VALUES (${REQUEST_COLUMNS.split(', ').map(() => '?').join(', ')})`,
          params: [row.id, row.usuario_id, row.chave_id, row.chave_nome, row.op, row.alvo, row.dados, row.estado, row.chave_idem, null, null, null, null, row.criado_em, row.expira_em, null],
        },
      ],
      idem ? 5 : 4,
    );
  } catch (error) {
    // o mesmo Idempotency-Key ao mesmo tempo: o outro gravou; devolve o dele
    if (idem && !(error instanceof HttpError)) {
      const same = await deps.db.first<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM api_pedidos WHERE chave_id = ? AND chave_idem = ?`, [key.id, idem]);
      if (same) return { row: same, repeated: true };
    }
    throw error;
  }
  return { row, repeated: false };
}

/** Lê o `Idempotency-Key` (opcional): até 100 letras visíveis. */
export function readIdem(header: string | undefined): string | null {
  if (header === undefined) return null;
  const v = header.trim();
  if (!/^[\x21-\x7e]{1,100}$/.test(v)) throw new HttpError(400, 'idempotencia', 'O Idempotency-Key tem de 1 a 100 letras visíveis (sem espaço).');
  return v;
}
