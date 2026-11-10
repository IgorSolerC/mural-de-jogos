import {
  conferirOpQuadro,
  ehOpQuadro,
  type AcrescentarNoQuadroV1,
  type CriarQuadroV1,
  type QuadroLivreV1,
} from '../../../contrato/api-v1/quadros-livres';
import { dobra } from '../../../contrato/api-v1/escopos';
import { quadroLivreV1 } from './api-mirror';
import { FbEdge, FbNode, FreeBoard, connect, idsOf, newNodeId, removePieces, shownNodes } from './free-board';
import { HOLE, Rect, boundsOf, intersects, snap } from './free-board-geometry';
import { FreeBoardProblem, FreeBoardStore } from './free-board-store';

/**
 * Os pedidos da API das AIs para o Quadro livre (PLANO-QUADRO-LIVRE.md, 7.8), aplicados quando o Murall abre:
 * criar um quadro (vazio, num grupo) e acrescentar peças (bilhetes e anotações, cada uma ao lado de uma peça ou à
 * direita de tudo), setas e uma moldura. Nada move nem apaga o que já está no quadro.
 */

export interface BoardResult {
  quadro: QuadroLivreV1 | null;
  /** As peças novas do pedido pelo nome que ele usou (nova1 → id). */
  novas?: Record<string, string>;
  erro?: string;
}

export type BoardApplied = { estado: 'aplicado' | 'falhou'; resultado: BoardResult; antes: FreeBoard | null };

export interface BoardApplyContext {
  /** O título da anotação do id (só as suas), ou undefined. */
  noteTitle(id: string): string | undefined;
  /** Os grupos das Anotações, como o mural os escreve (o quadro novo entra num deles, nunca num grupo novo). */
  groups?(): readonly string[];
}

export const isBoardOp = ehOpQuadro;

const failed = (erro: string): BoardApplied => ({ estado: 'falhou', resultado: { quadro: null, erro }, antes: null });

/** Aplica o pedido. Nunca joga erro: o que não deu vira "falhou", com o porquê. */
export async function applyBoardRequest(store: FreeBoardStore, req: { op: string; alvo: string; dados: unknown }, ctx: BoardApplyContext): Promise<BoardApplied> {
  if (!ehOpQuadro(req.op)) return failed('Um pedido que este site ainda não conhece.');
  const checked = conferirOpQuadro(req.op, req.dados);
  if (!checked.ok) return failed(`${checked.erro} (campo ${checked.campo})`);
  await store.ready;
  try {
    if (req.op === 'quadro-livre.criar') {
      const d = checked.dados as CriarQuadroV1;
      // já entrou (aplicado aqui antes, numa aba que fechou sem concluir): o mesmo quadro
      const here = store.get(req.alvo);
      if (here) return { estado: 'aplicado', resultado: { quadro: quadroLivreV1(here) }, antes: null };
      const groups = ctx.groups?.() ?? [];
      const group = groups.find((g) => dobra(g) === dobra(d.grupo));
      if (groups.length && !group) return failed(`Não há o grupo "${d.grupo}" nas Anotações. Os grupos: ${groups.join(', ')}.`);
      const made = await store.create(d.nome, group ?? d.grupo, req.alvo);
      return { estado: 'aplicado', resultado: { quadro: quadroLivreV1(made) }, antes: null };
    }
    const board = store.get(req.alvo);
    if (!board) return failed('O quadro não está neste Murall (foi apagado, ou ainda não chegou neste aparelho).');
    const out = addToBoard(board, checked.dados as AcrescentarNoQuadroV1, ctx, new Date().toISOString());
    if ('erro' in out) return failed(out.erro);
    const saved = await store.save(out.board, board);
    return { estado: 'aplicado', resultado: { quadro: quadroLivreV1(saved), novas: out.novas }, antes: board };
  } catch (e) {
    return failed(e instanceof FreeBoardProblem ? e.message : 'O quadro não pôde ser guardado.');
  }
}

/** Desfaz um pedido aplicado: o quadro criado sai; o acrescentado volta ao de antes (só as peças novas saem). */
export async function undoBoard(store: FreeBoardStore, t: { op: string; alvo: string; resultado?: unknown }): Promise<void> {
  if (t.op === 'quadro-livre.criar') {
    await store.remove(t.alvo);
    return;
  }
  const novas = Object.values(((t.resultado ?? {}) as BoardResult).novas ?? {});
  const board = store.get(t.alvo);
  if (!board || !novas.length) return;
  const ids = new Set<string>(novas);
  // as setas e a moldura do pedido também (as que ligam as peças novas, ou a moldura nova)
  await store.save(removePieces(board, ids, new Date().toISOString()), board);
}

/**
 * As peças, as setas e a moldura do pedido, num quadro novo. As referências: o id de uma peça do quadro, ou
 * `novaN` (a N-ésima peça nova, contando de 1).
 */
export function addToBoard(board: FreeBoard, d: AcrescentarNoQuadroV1, ctx: BoardApplyContext, at: string): { board: FreeBoard; novas: Record<string, string> } | { erro: string } {
  const nodes: FbNode[] = [...shownNodes(board)];
  const taken = idsOf(board);
  const novas: Record<string, string> = {};
  const byId = new Map(nodes.map((n) => [n.i, n]));
  const resolve = (ref: string): FbNode | undefined => byId.get(novas[ref] ?? ref);
  const free = (r: Rect) => !nodes.some((n) => n.t !== 'm' && intersects(n, r));
  /** Um lugar livre: à direita da peça `near`, descendo até achar vão; sem ela, à direita de tudo. */
  const place = (w: number, h: number, near: FbNode | undefined): Rect => {
    const all = boundsOf(nodes.filter((n) => n.t !== 'm'));
    let x = near ? snap(near.x + near.w + HOLE * 2) : snap((all ? all.x + all.w : 0) + HOLE * 4);
    let y = near ? snap(near.y) : snap(all?.y ?? 0);
    for (let tries = 0; tries < 200 && !free({ x, y, w, h }); tries++) y = snap(y + h + HOLE);
    if (!free({ x, y, w, h })) x = snap(x + w + HOLE * 2);
    return { x, y, w, h };
  };

  for (const [k, p] of (d.pecas ?? []).entries()) {
    const name = `nova${k + 1}`;
    const near = p.perto ? resolve(p.perto) : undefined;
    if (p.perto && !near) return { erro: `A peça ${p.perto} não está no quadro (pecas[${k}].perto).` };
    const i = newNodeId(taken);
    taken.add(i);
    let node: FbNode;
    if (p.nota) {
      const title = ctx.noteTitle(p.nota);
      if (title === undefined) return { erro: `A anotação ${p.nota} não está no seu Murall (pecas[${k}].nota).` };
      const clean = title.replace(/[|{}]/g, ' ').replace(/\s+/g, ' ').trim();
      node = { i, t: 'w', ...place(HOLE * 12, HOLE * 7, near), src: `{{nota: #${p.nota}${clean ? ` | ${clean}` : ''}}}` };
    } else {
      const lines = (p.bilhete ?? '').split('\n').length;
      node = { i, t: 'x', ...place(HOLE * 8, snap(Math.max(HOLE * 4, Math.min(HOLE * 20, HOLE * (2 + lines)))), near), txt: p.bilhete ?? '' };
    }
    nodes.push(node);
    byId.set(i, node);
    novas[name] = i;
  }

  let next: FreeBoard = { ...board, em: at, n: [...board.n, ...nodes.slice(shownNodes(board).length)] };

  for (const [k, s] of (d.setas ?? []).entries()) {
    const a = resolve(s.de);
    const b = resolve(s.para);
    if (!a || !b) return { erro: `A seta ${k + 1} liga uma peça que não está no quadro (${!a ? s.de : s.para}).` };
    const made = connect(next, a.i, b.i, at);
    if (!made) return { erro: 'O quadro chegou ao limite de setas.' };
    novas[`seta${k + 1}`] = made.edge.i;
    next = s.rotulo ? { ...made.board, e: made.board.e.map((e): FbEdge => (e.i === made.edge.i ? { ...e, txt: s.rotulo } : e)) } : made.board;
  }

  if (d.moldura) {
    const inside = d.moldura.pecas.map(resolve);
    const missing = d.moldura.pecas.find((_, k) => !inside[k]);
    if (missing) return { erro: `A moldura cerca uma peça que não está no quadro (${missing}).` };
    const box = boundsOf(inside as FbNode[])!;
    const pad = HOLE * 2;
    const i = newNodeId(idsOf(next));
    const frame: FbNode = {
      i,
      t: 'm',
      x: snap(box.x - pad),
      y: snap(box.y - pad - HOLE * 2),
      w: snap(box.w + 2 * pad),
      h: snap(box.h + 2 * pad + HOLE * 2),
      ...(d.moldura.titulo ? { nome: d.moldura.titulo } : {}),
    };
    // a moldura fica atrás (a ordem de desenhar põe as molduras atrás de tudo)
    next = { ...next, n: [frame, ...next.n] };
    novas['moldura'] = i;
  }
  return { board: next, novas };
}

/** O pedido em palavras ("Acrescentar 3 peças e 2 setas em “Mansão”"). */
export function boardWords(op: string, dados: unknown, title: string, past: boolean): string | null {
  if (!ehOpQuadro(op)) return null;
  const v = (now: string, then: string) => (past ? then : now);
  const t = `“${title}”`;
  if (op === 'quadro-livre.criar') return `${v('Criar', 'criou')} o quadro livre ${t}`;
  const d = (dados ?? {}) as AcrescentarNoQuadroV1;
  const parts = [
    d.pecas?.length ? `${d.pecas.length} ${d.pecas.length === 1 ? 'peça' : 'peças'}` : '',
    d.setas?.length ? `${d.setas.length} ${d.setas.length === 1 ? 'seta' : 'setas'}` : '',
    d.moldura ? 'uma moldura' : '',
  ].filter(Boolean);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : (parts[0] ?? 'peças');
  return `${v('Acrescentar', 'acrescentou')} ${what} no quadro ${t}`;
}

/** O nome do quadro que a pessoa reconhece. */
export function boardTitle(store: FreeBoardStore, t: { op: string; alvo: string; dados: unknown; resultado?: unknown }): string {
  if (t.op === 'quadro-livre.criar') return (t.dados as { nome?: string } | null)?.nome ?? 'um quadro';
  return store.get(t.alvo)?.nome ?? ((t.resultado ?? {}) as BoardResult).quadro?.nome ?? 'um quadro que não existe mais';
}
