import { computed, signal } from '@angular/core';
import { FB_MAX_NODES, FbColor, FbEdge, FbEnds, FbNode, FbSide, FreeBoard, connect, moveNodes, patchEdge, patchNodes, removePieces, shownNodes, withGroups } from '../../core/free-board';
import { Point, Rect, boundsOf, nearestSide, rectBetween } from '../../core/free-board-geometry';
import { DRAG_SLOP } from './camera-rig';
import { Handle, History, boxSelect, dragSet, hitEdge, hitPiece, newNode, resized, sizeRule, snappedDelta } from './edit-ops';

/** As ferramentas da régua (seção 4.4): a seta não é ferramenta, sai das bolinhas da peça. */
export type Tool = 'selecionar' | 'moldura' | 'texto';

/** O que se escreve no lugar: o texto do bilhete, o título da moldura ou o rótulo da seta. */
export type Writing = { kind: 'bilhete' | 'moldura'; id: string } | { kind: 'seta'; id: string };

/** O gesto em andamento (depois de passar dos 4 px, ele vale). */
type Gesture =
  | { kind: 'mover'; start: Point; ids: Set<string>; lead: Point; base: FreeBoard }
  | { kind: 'tamanho'; start: Point; id: string; handle: Handle; box: Rect; base: FreeBoard }
  | { kind: 'caixa'; start: Point; keep: Set<string> }
  | { kind: 'moldura'; start: Point }
  | { kind: 'ligar'; from: string; side: FbSide; start: Point }
  | { kind: 'clique'; start: Point; id: string | null; toggle: boolean };

/** O que o editor precisa de quem o monta (a peça do quadro). */
export interface EditorHost {
  /** O quadro como está (o de agora, sem a prévia). */
  board(): FreeBoard;
  /** O zoom de agora (a borda da moldura e a tolerância da seta são de tela). */
  zoom(): number;
  /** A mudança feita: o quadro novo e o de antes (a página guarda; o desfazer guarda o de antes). */
  commit(next: FreeBoard, before: FreeBoard): void;
  /** Um aviso curto (o quadro cheio, por exemplo). */
  say(text: string): void;
  /** Soltou a seta no vazio: o menu "Texto aqui", "Anotação aqui"... (a seta liga na peça nova). */
  dropArrow(from: string, side: FbSide, at: Point, screen: Point): void;
}

/**
 * A edição de um quadro (PLANO-QUADRO-LIVRE.md, 4.4): a ferramenta, a seleção, a prévia do que está sendo
 * arrastado e o desfazer. Os gestos chegam em pontos do mundo; o que muda vira um quadro novo, entregue em
 * `commit` uma vez por gesto (um arrasto é um passo do desfazer e uma gravação). Sem Angular por dentro além
 * dos signals: quem desenha (edit-overlay.ts) só lê.
 */
export class BoardEditor {
  readonly tool = signal<Tool>('selecionar');
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly selectedEdge = signal<string | null>(null);
  /** O quadro com o arrasto no meio (só para mostrar; vira mudança ao soltar). */
  readonly preview = signal<FreeBoard | null>(null);
  readonly box = signal<Rect | null>(null);
  readonly drawing = signal<Rect | null>(null);
  readonly linking = signal<{ from: string; side: FbSide; to: Point; target: string | null } | null>(null);
  readonly hover = signal<string | null>(null);
  readonly writing = signal<Writing | null>(null);
  /** "Selecionar vários" (no celular, arrastar no fundo passa a fazer a caixa). */
  readonly multi = signal(false);
  readonly history = new History();
  /** O desfazer mudou (os botões da régua acendem e apagam). */
  readonly historyTick = signal(0);
  readonly canUndo = computed(() => (this.historyTick(), this.history.canUndo));
  readonly canRedo = computed(() => (this.historyTick(), this.history.canRedo));

  private gesture: Gesture | null = null;

  constructor(private readonly host: EditorHost) {}

  /** O zoom de agora (a etiqueta da seleção mede o que ela cobre). */
  zoom(): number {
    return this.host.zoom();
  }

  /** O quadro como aparece (com o arrasto no meio). */
  shown(): FreeBoard {
    return this.preview() ?? this.host.board();
  }

  /** As peças selecionadas que ainda existem. */
  selectedNodes(): FbNode[] {
    const sel = this.selected();
    return shownNodes(this.host.board()).filter((n) => sel.has(n.i));
  }

  // ===== mudar =====

  /** Aplica uma mudança ao quadro de agora, com um passo do desfazer. */
  change(fn: (b: FreeBoard) => FreeBoard): FreeBoard | null {
    const before = this.host.board();
    const next = fn(before);
    if (next === before) return null;
    this.history.push(before);
    this.historyTick.update((v) => v + 1);
    this.host.commit(next, before);
    return next;
  }

  undo(): void {
    const prev = this.history.undo(this.host.board());
    if (!prev) return;
    this.historyTick.update((v) => v + 1);
    this.host.commit({ ...prev, em: new Date().toISOString() }, this.host.board());
    this.dropMissing(prev);
  }

  redo(): void {
    const next = this.history.redo(this.host.board());
    if (!next) return;
    this.historyTick.update((v) => v + 1);
    this.host.commit({ ...next, em: new Date().toISOString() }, this.host.board());
    this.dropMissing(next);
  }

  /** Tira da seleção o que não existe mais. */
  private dropMissing(board: FreeBoard): void {
    const ids = new Set(board.n.map((n) => n.i));
    const sel = [...this.selected()].filter((id) => ids.has(id));
    if (sel.length !== this.selected().size) this.selected.set(new Set(sel));
    const e = this.selectedEdge();
    if (e && !board.e.some((x) => x.i === e)) this.selectedEdge.set(null);
  }

  select(ids: Iterable<string>): void {
    this.selected.set(withGroups(this.host.board(), new Set(ids)));
    this.selectedEdge.set(null);
  }

  clearSelection(): void {
    if (this.selected().size) this.selected.set(new Set());
    this.selectedEdge.set(null);
  }

  selectAll(): void {
    this.selected.set(new Set(shownNodes(this.host.board()).map((n) => n.i)));
    this.selectedEdge.set(null);
  }

  /** Tira a seleção (as peças e as setas delas), ou a seta selecionada. */
  removeSelected(): void {
    const edge = this.selectedEdge();
    const ids = new Set<string>(this.selected());
    if (edge) ids.add(edge);
    if (!ids.size) return;
    this.change((b) => removePieces(b, ids, now()));
    this.clearSelection();
  }

  /** Anda a seleção (as setas do teclado: um furo; com Shift, 1 px). */
  nudge(dx: number, dy: number): void {
    const ids = dragSet(this.host.board(), this.selected());
    if (!ids.size) return;
    this.change((b) => moveNodes(b, ids, dx, dy, now()));
  }

  /** Muda a cor das selecionadas (e da seta selecionada). */
  paint(c: FbColor | null): void {
    const sel = this.selected();
    const edge = this.selectedEdge();
    this.change((b) => {
      let out = b;
      if (sel.size) out = patchNodes(out, sel, (n) => withColor(n, c), now());
      if (edge) out = patchEdge(out, edge, (e) => withColor(e, c), now());
      return out;
    });
  }

  /** As pontas da seta selecionada. */
  ends(p: FbEnds | null, id = this.selectedEdge()): void {
    if (!id) return;
    this.change((b) =>
      patchEdge(
        b,
        id,
        (e) => {
          const { p: _, ...rest } = e;
          return p ? { ...rest, p } : (rest as FbEdge);
        },
        now(),
      ),
    );
  }

  /** Põe uma peça nova (o quadro cheio avisa e não põe). */
  add(node: FbNode, select = true): FbNode | null {
    const b = this.host.board();
    if (b.n.length >= FB_MAX_NODES) {
      this.host.say(`Este quadro chegou a ${FB_MAX_NODES.toLocaleString('pt-BR')} peças.`);
      return null;
    }
    this.change((x) => ({ ...x, em: now(), n: [...x.n, node] }));
    if (select) this.select([node.i]);
    return node;
  }

  // ===== os gestos (pontos no mundo) =====

  /**
   * O ponteiro desceu (o botão esquerdo, ou um dedo, já sabendo que não é para andar). `handle`/`dot`: a alça de
   * tamanho ou a bolinha de seta debaixo do ponteiro (o desenho delas está no overlay).
   */
  down(p: Point, mods: { shift: boolean; ctrl: boolean }, target: { handle?: { id: string; handle: Handle }; dot?: { id: string; side: FbSide } } = {}): void {
    this.writing.set(null);
    const board = this.host.board();
    if (target.dot) {
      this.gesture = { kind: 'ligar', from: target.dot.id, side: target.dot.side, start: p };
      return;
    }
    if (target.handle) {
      const n = board.n.find((x) => x.i === target.handle!.id);
      if (n) this.gesture = { kind: 'tamanho', start: p, id: n.i, handle: target.handle.handle, box: { x: n.x, y: n.y, w: n.w, h: n.h }, base: board };
      return;
    }
    if (this.tool() === 'moldura') {
      this.gesture = { kind: 'moldura', start: p };
      return;
    }
    const hit = hitPiece(shownNodes(board), p, this.host.zoom());
    if (this.tool() === 'texto' && !hit) {
      this.gesture = { kind: 'clique', start: p, id: null, toggle: false };
      return;
    }
    if (hit) {
      const toggle = mods.shift || mods.ctrl;
      if (toggle) {
        this.gesture = { kind: 'clique', start: p, id: hit.i, toggle: true };
        return;
      }
      if (!this.selected().has(hit.i)) this.select([hit.i]);
      const ids = dragSet(board, this.selected());
      const lead = boundsOf(shownNodes(board).filter((n) => ids.has(n.i))) ?? { x: hit.x, y: hit.y };
      this.gesture = { kind: 'mover', start: p, ids, lead: { x: lead.x, y: lead.y }, base: board };
      this.gestureClick = hit.i;
      return;
    }
    const edge = hitEdge(board, p, 10 / this.host.zoom());
    if (edge) {
      this.selected.set(new Set());
      this.selectedEdge.set(edge.i);
      this.gesture = null;
      return;
    }
    // o fundo: a caixa de seleção (com Shift, soma à que já está)
    const keep = mods.shift ? new Set(this.selected()) : new Set<string>();
    if (!mods.shift) this.clearSelection();
    this.gesture = { kind: 'caixa', start: p, keep };
  }

  /** O clique numa peça já selecionada, sem arrasto: fica só ela (se havia mais). */
  private gestureClick: string | null = null;
  private moved = false;

  move(p: Point, mods: { alt: boolean; shift: boolean }): void {
    const g = this.gesture;
    if (!g) {
      this.hoverAt(p);
      return;
    }
    const z = this.host.zoom();
    const far = Math.hypot(p.x - ('start' in g ? g.start.x : p.x), p.y - ('start' in g ? g.start.y : p.y)) * z >= DRAG_SLOP;
    if (!this.moved && !far) return;
    this.moved = true;
    switch (g.kind) {
      case 'mover': {
        const d = snappedDelta(g.lead, p.x - g.start.x, p.y - g.start.y, !mods.alt);
        this.preview.set(moveNodes(g.base, g.ids, d.x, d.y, now()));
        return;
      }
      case 'tamanho': {
        const n = g.base.n.find((x) => x.i === g.id) as FbNode | undefined;
        if (!n) return;
        const r = resized(g.box, g.handle, p.x - g.start.x, p.y - g.start.y, sizeRule(n), { free: mods.shift, snapOn: !mods.alt });
        this.preview.set(patchNodes(g.base, new Set([g.id]), (x) => ({ ...x, ...r }), now()));
        return;
      }
      case 'caixa': {
        const box = rectBetween(g.start, p);
        this.box.set(box);
        const hit = boxSelect(shownNodes(this.host.board()), box, mods.alt);
        this.selected.set(withGroups(this.host.board(), new Set([...g.keep, ...hit])));
        return;
      }
      case 'moldura':
        this.drawing.set(rectBetween(g.start, p));
        return;
      case 'ligar': {
        const target = hitPiece(shownNodes(this.host.board()), p, z);
        this.linking.set({ from: g.from, side: g.side, to: p, target: target && target.i !== g.from ? target.i : null });
        return;
      }
      case 'clique':
        return;
    }
  }

  /** O ponteiro subiu: o gesto vira mudança. `screen`: o ponto na tela (para o menu da seta solta no vazio). */
  up(p: Point, screen: Point): void {
    const g = this.gesture;
    const moved = this.moved;
    this.gesture = null;
    this.moved = false;
    if (!g) return;
    switch (g.kind) {
      case 'mover':
      case 'tamanho': {
        const next = this.preview();
        this.preview.set(null);
        if (moved && next) this.change(() => next);
        else if (g.kind === 'mover' && this.gestureClick && this.selected().size > 1 && !moved) this.select([this.gestureClick]);
        this.gestureClick = null;
        return;
      }
      case 'caixa':
        this.box.set(null);
        return;
      case 'moldura': {
        const r = this.drawing();
        this.drawing.set(null);
        this.tool.set('selecionar');
        if (!r || r.w * this.host.zoom() < 24 || r.h * this.host.zoom() < 24) return;
        const node = this.add(newNode(this.host.board(), 'm', snapRect(r)));
        if (node) this.writing.set({ kind: 'moldura', id: node.i });
        return;
      }
      case 'ligar': {
        const link = this.linking();
        this.linking.set(null);
        if (!moved || !link) return;
        if (link.target) {
          const target = this.host.board().n.find((n) => n.i === link.target);
          if (!target) return;
          // soltou perto da borda: o lado mais perto do ponteiro; no meio da peça, o lado se escolhe sozinho
          const inner = { x: target.x + target.w * 0.25, y: target.y + target.h * 0.25, w: target.w * 0.5, h: target.h * 0.5 };
          const inMiddle = p.x > inner.x && p.x < inner.x + inner.w && p.y > inner.y && p.y < inner.y + inner.h;
          const sides = inMiddle ? {} : { as: link.side, bs: nearestSide(target, p) };
          const made = connect(this.host.board(), link.from, link.target, now(), sides);
          if (made) {
            this.change(() => made.board);
            this.selected.set(new Set());
            this.selectedEdge.set(made.edge.i);
          }
        } else {
          this.host.dropArrow(link.from, link.side, p, screen);
        }
        return;
      }
      case 'clique': {
        if (moved) return;
        if (g.id && g.toggle) {
          const group = withGroups(this.host.board(), new Set([g.id]));
          const next = new Set(this.selected());
          const on = next.has(g.id);
          for (const id of group) on ? next.delete(id) : next.add(id);
          this.selected.set(next);
          this.selectedEdge.set(null);
        } else if (!g.id && this.tool() === 'texto') {
          this.newNote(p);
          this.tool.set('selecionar');
        }
        return;
      }
    }
  }

  /** Cancela o gesto (o Esc no meio, o ponteiro que sumiu). */
  cancel(): void {
    this.gesture = null;
    this.moved = false;
    this.preview.set(null);
    this.box.set(null);
    this.drawing.set(null);
    this.linking.set(null);
  }

  /** Um bilhete novo no ponto, já escrevendo (o T, ou o duplo clique no fundo). */
  newNote(p: Point): FbNode | null {
    const node = this.add(newNode(this.host.board(), 'x', snapRect({ x: p.x - 13, y: p.y - 13, w: 208, h: 104 })));
    if (node) this.writing.set({ kind: 'bilhete', id: node.i });
    return node;
  }

  /** Guarda o texto escrito no lugar (o bilhete, o título, o rótulo); vazio, o bilhete novo sai. */
  write(w: Writing, text: string): void {
    this.writing.set(null);
    const b = this.host.board();
    if (w.kind === 'seta') {
      this.change((x) => patchEdge(x, w.id, (e) => withText(e, text), now()));
      return;
    }
    const n = b.n.find((x) => x.i === w.id) as FbNode | undefined;
    if (!n) return;
    if (w.kind === 'bilhete') {
      if (!text.trim() && n.t === 'x' && !n.txt.trim()) {
        // o bilhete que nasceu e ficou vazio não fica (sem passo a mais no desfazer: some o de criar)
        const gone = removePieces(b, new Set([n.i]), now());
        const last = this.history.last();
        if (last && !last.n.some((x) => x.i === n.i)) {
          this.history.dropLast();
          this.historyTick.update((v) => v + 1);
          this.host.commit(gone, b);
        } else this.change(() => gone);
        this.clearSelection();
        return;
      }
      this.change((x) => patchNodes(x, new Set([n.i]), (y) => (y.t === 'x' ? { ...y, txt: text.slice(0, 4000) } : y), now()));
      return;
    }
    this.change((x) =>
      patchNodes(
        x,
        new Set([n.i]),
        (y) => {
          if (y.t !== 'm') return y;
          const { nome: _, ...rest } = y;
          return text.trim() ? { ...rest, nome: text.trim() } : (rest as FbNode);
        },
        now(),
      ),
    );
  }

  private hoverAt(p: Point): void {
    if (this.tool() !== 'selecionar') return this.hover.set(null);
    const hit = hitPiece(shownNodes(this.host.board()), p, this.host.zoom());
    const id = hit?.i ?? null;
    if (id !== this.hover()) this.hover.set(id);
  }
}

const now = () => new Date().toISOString();

function snapRect(r: Rect): Rect {
  const s = (v: number) => Math.round(v / 26) * 26;
  const x = s(r.x);
  const y = s(r.y);
  return { x, y, w: Math.max(26, s(r.x + r.w) - x), h: Math.max(26, s(r.y + r.h) - y) };
}

function withColor<T extends { c?: FbColor }>(x: T, c: FbColor | null): T {
  const { c: _, ...rest } = x;
  return (c ? { ...rest, c } : rest) as T;
}

function withText(e: FbEdge, text: string): FbEdge {
  const { txt: _, ...rest } = e;
  const t = text.replace(/\s+/g, ' ').trim();
  return t ? { ...rest, txt: t } : (rest as FbEdge);
}
