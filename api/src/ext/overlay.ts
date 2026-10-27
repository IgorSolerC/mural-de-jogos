import { aplicarNaNotaV1, conferirOp, notaDoPedido, type CriarNotaV1, type EstadoDoPedido, type OpNota } from '../../../contrato/api-v1/operacoes';
import type { NotaV1 } from '../../../contrato/api-v1/notas';
import { openRequests, stateOf, type RequestRow } from '../domain/requests';
import { Deps } from '../ports';

/**
 * Os pedidos por cima (PLANO-API.md, 8.5): a AI vê o mundo como vai ficar. Toda leitura junta os
 * pedidos abertos da conta (pendentes e esperando aprovação): a nota criada aparece, a editada aparece
 * mudada, e cada uma traz a lista `pedidos` com o que ainda não entrou.
 */

export interface PedidoNaNota {
  id: string;
  op: OpNota;
  estado: EstadoDoPedido;
}

export type NotaComPedidos = NotaV1 & { pedidos?: PedidoNaNota[] };

export interface Pending {
  /** Por nota: os pedidos dela, na ordem em que chegaram. */
  byNote: Map<string, RequestRow[]>;
  /** As notas que só existem num pedido de criar (ainda não aplicado). */
  created: RequestRow[];
}

export async function pendingOf(deps: Deps, userId: string): Promise<Pending> {
  const rows = await openRequests(deps, userId);
  const byNote = new Map<string, RequestRow[]>();
  const created: RequestRow[] = [];
  for (const r of rows) {
    // só os das Anotações (os dos Gastos têm a prévia deles, em ext/spending-read.ts)
    if (!r.op.startsWith('nota.')) continue;
    if (r.op === 'nota.criar') created.push(r);
    else byNote.set(r.alvo, [...(byNote.get(r.alvo) ?? []), r]);
  }
  return { byNote, created };
}

const marker = (r: RequestRow, now: Date): PedidoNaNota => ({ id: r.id, op: r.op as OpNota, estado: stateOf(r, now) });

/** A nota com os pedidos abertos dela aplicados por cima (a de apagar fica, com o pedido na lista). */
export function overlay(nota: NotaV1, rows: readonly RequestRow[] | undefined, now: Date): NotaComPedidos {
  if (!rows?.length) return nota;
  let n = nota;
  for (const r of rows) {
    const checked = conferirOp(r.op as OpNota, JSON.parse(r.dados));
    if (!checked.ok) continue;
    n = aplicarNaNotaV1(n, r.op as OpNota, checked.dados, r.criado_em) ?? n;
  }
  return { ...n, pedidos: rows.map((r) => marker(r, now)) };
}

/** A nota de um pedido de criar, ainda não aplicado, com as mudanças que vieram depois por cima. */
export function createdNote(row: RequestRow, pending: Pending, now: Date): NotaComPedidos {
  const base = notaDoPedido(row.alvo, JSON.parse(row.dados) as CriarNotaV1, row.criado_em);
  const later = pending.byNote.get(row.alvo) ?? [];
  const n = overlay(base, later, now);
  return { ...n, pedidos: [marker(row, now), ...(n.pedidos ?? [])] };
}
