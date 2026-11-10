import { FbColor, FbNode, FbSide, FreeBoard, connect, groupPieces, patchNodes, removePieces, restack, shownNodes, ungroupPieces } from '../../core/free-board';
import { LIGHT_STOCKS } from '../../core/review';
import { Camera, Point, center, insideFrame, toWorld } from '../../core/free-board-geometry';
import { parseWidgetLine, widgetCycles, widgetDef, widgetLines, withChoice } from '../../core/widgets';
import { ICON } from '../icons';
import { MenuItem, MenuSections } from '../context-menu';
import { BoardEditor } from './board-editor';
import { CLIP_TYPE, Clip, classifyPaste, copyPieces, fitFrame, hitEdge, hitPiece, newNode, noteLine, pasteClip, placeGrid, readClip, sizeForLine } from './edit-ops';
import { SelectionAction } from './edit-overlay';
import { FreeBoardOwner } from './owner-tools';
import { RulerAsk } from './tool-ruler';

/** O que a cola da edição precisa da peça do quadro. */
export interface EditingHost {
  editor: BoardEditor;
  editing(): boolean;
  owner(): FreeBoardOwner | null;
  board(): FreeBoard;
  camera(): Camera;
  visor(): HTMLElement;
  /** O meio da tela, no mundo (onde entra o que não tem lugar). */
  middle(): Point;
  /** Abre o menu no ponto da tela. */
  menu(key: string, caption: string, sections: MenuSections, x: number, y: number, by: 'mouse' | 'toque' | 'teclado'): void;
  say(text: string): void;
  /** Liga ou desliga o editar (o E, o "Editar o quadro" do menu, o Esc sem seleção). */
  toggleEdit(on: boolean): void;
  showHelp(): void;
  fitAll(): void;
  /** Leva a câmera até o ponto (o "Ir até aqui"). */
  goTo(p: Point): void;
}

/** As cores das cartolinas, na ordem das escolhas do site. */
const COLOR_NAMES: Readonly<Record<FbColor, string>> = {
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
  lilas: 'Lilás',
  rosa: 'Rosa',
  cinza: 'Cinza',
  branco: 'Branco',
};

const now = () => new Date().toISOString();

/**
 * Os eventos do editar do Quadro livre (PLANO-QUADRO-LIVRE.md, 4.4), ligados à peça do quadro: o ponteiro (com a
 * câmera, que fica com Ctrl, o espaço e o botão do meio), o duplo clique, os menus do botão direito (da peça, da
 * moldura, da seta e do fundo, no ver e no editar), colar e soltar (as peças, as imagens, os links, o texto) e os
 * atalhos. O que muda o quadro passa pelo editor (board-editor.ts); o que só o dono faz, pelo `owner`.
 */
export class BoardEditing {
  private space = false;
  /** O último ponto do ponteiro no mundo (onde o colar põe as peças). */
  private lastPoint: Point | null = null;
  /** O recorte desta aba (o navegador pode não guardar o tipo próprio na área de transferência). */
  private clip: Clip | null = null;
  private hold: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;

  constructor(private readonly h: EditingHost) {}

  private get ed(): BoardEditor {
    return this.h.editor;
  }

  /** Liga os eventos no visor; devolve o que desliga. */
  attach(el: HTMLElement): () => void {
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, o);
      return () => el.removeEventListener(type, fn as EventListener, o);
    };
    const keyUp = (e: KeyboardEvent) => e.key === ' ' && (this.space = false);
    window.addEventListener('keyup', keyUp);
    const offs = [
      on('pointerdown', (e) => this.down(e)),
      on('pointermove', (e) => this.move(e)),
      on('pointerup', (e) => this.up(e)),
      on('pointercancel', () => this.cancelHold()),
      on('dblclick', (e) => this.dbl(e)),
      on('contextmenu', (e) => this.contextMenu(e)),
      on('click', (e) => this.tap(e)),
      on('copy', (e) => this.copy(e, false)),
      on('cut', (e) => this.copy(e, true)),
      on('paste', (e) => void this.paste(e)),
      on('dragover', (e) => this.dragOver(e)),
      on('drop', (e) => void this.drop(e)),
    ];
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener('keyup', keyUp);
      this.cancelHold();
    };
  }

  private world(e: { clientX: number; clientY: number }): Point {
    const r = this.h.visor().getBoundingClientRect();
    return toWorld(this.h.camera(), { x: e.clientX - r.left, y: e.clientY - r.top });
  }

  private nodes(): FbNode[] {
    return shownNodes(this.h.board());
  }

  /** O que está debaixo do ponteiro e não é da câmera: os campos e a etiqueta são deles mesmos. */
  private own(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('.escrever, .acoes, app-free-board-tools, .regua, app-context-menu');
  }

  /** A câmera fica com este ponteiro? (camera-rig.ts pergunta) */
  shouldPan(e: PointerEvent): boolean {
    if (!this.h.editing()) return true;
    if (this.own(e.target)) return false;
    if (this.space) return true;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('[data-alca], [data-bolinha]')) return false;
    const hit = hitPiece(this.nodes(), this.world(e), this.h.camera().z);
    if (e.ctrlKey || e.metaKey) return !hit;
    if (e.pointerType === 'touch') {
      if (this.ed.tool() !== 'selecionar') return false;
      if (hit && this.ed.selected().has(hit.i)) return false;
      if (!hit && this.ed.multi()) return false;
      return true;
    }
    return false;
  }

  // ===== o ponteiro =====

  private down(e: PointerEvent): void {
    this.lastPoint = this.world(e);
    if (e.pointerType === 'touch') this.startHold(e);
    if (!this.h.editing() || e.button !== 0 || this.own(e.target) || this.shouldPan(e)) return;
    const t = e.target instanceof Element ? e.target : null;
    const alca = t?.closest<HTMLElement>('[data-alca]')?.dataset['alca'];
    const bolinha = t?.closest<HTMLElement>('[data-bolinha]')?.dataset['bolinha'];
    const split = (v: string) => [v.slice(0, v.lastIndexOf(':')), v.slice(v.lastIndexOf(':') + 1)] as const;
    this.ed.down(
      this.world(e),
      { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey },
      {
        ...(alca ? { handle: { id: split(alca)[0], handle: split(alca)[1] as never } } : {}),
        ...(bolinha ? { dot: { id: split(bolinha)[0], side: split(bolinha)[1] as FbSide } } : {}),
      },
    );
    try {
      this.h.visor().setPointerCapture(e.pointerId);
    } catch {
      // o ponteiro sintético dos testes não captura
    }
    this.h.visor().focus({ preventScroll: true });
  }

  private move(e: PointerEvent): void {
    this.lastPoint = this.world(e);
    if (this.hold && Math.hypot(e.clientX - this.hold.x, e.clientY - this.hold.y) > 10) this.cancelHold();
    if (!this.h.editing()) return;
    this.ed.move(this.lastPoint, { alt: e.altKey, shift: e.shiftKey });
  }

  private up(e: PointerEvent): void {
    this.cancelHold();
    if (!this.h.editing()) return;
    const r = this.h.visor().getBoundingClientRect();
    this.ed.up(this.world(e), { x: e.clientX - r.left, y: e.clientY - r.top });
  }

  /** O toque curto no editar (a câmera ficou com ele, porque podia virar arrasto): seleciona o que tocou. */
  private tap(e: MouseEvent): void {
    if (!this.h.editing() || this.own(e.target) || (e as PointerEvent).pointerType !== 'touch') return;
    const hit = hitPiece(this.nodes(), this.world(e), this.h.camera().z);
    if (hit) this.ed.select([hit.i]);
    else if (!this.ed.multi()) this.ed.clearSelection();
  }

  private startHold(e: PointerEvent): void {
    this.cancelHold();
    const x = e.clientX;
    const y = e.clientY;
    const target = e.target;
    this.hold = {
      x,
      y,
      timer: setTimeout(() => {
        this.hold = null;
        if (this.ed.preview()) return;
        this.openMenuAt(this.world({ clientX: x, clientY: y }), x, y, 'toque', target);
      }, 500),
    };
  }

  private cancelHold(): void {
    if (this.hold) clearTimeout(this.hold.timer);
    this.hold = null;
  }

  // ===== o duplo clique =====

  private dbl(e: MouseEvent): void {
    if (!this.h.editing() || this.own(e.target)) return;
    e.preventDefault();
    const p = this.world(e);
    const hit = hitPiece(this.nodes(), p, this.h.camera().z);
    if (!hit) {
      const edge = hitEdge(this.h.board(), p, 10 / this.h.camera().z);
      if (edge) {
        this.ed.selectedEdge.set(edge.i);
        this.ed.writing.set({ kind: 'seta', id: edge.i });
        return;
      }
      this.ed.newNote(p);
      return;
    }
    this.edit(hit);
  }

  /** Mexer na peça: escrever no bilhete, o título da moldura, a folha do widget, a nota aberta. */
  edit(node: FbNode): void {
    if (node.t === 'x') return this.ed.writing.set({ kind: 'bilhete', id: node.i });
    if (node.t === 'm') return this.ed.writing.set({ kind: 'moldura', id: node.i });
    const parsed = parseWidgetLine(node.src.split('\n')[0]);
    if (parsed?.name === 'nota') {
      const id = /#([A-Za-z0-9_-]+)/.exec(node.src)?.[1];
      if (id) this.h.owner()?.openNote(id);
      return;
    }
    void this.editWidget(node);
  }

  private async editWidget(node: FbNode & { t: 'w' }): Promise<void> {
    const owner = this.h.owner();
    if (!owner) return;
    const line = await owner.editWidget(node.src);
    if (line === null || line === node.src) return;
    if (!line.trim()) {
      this.ed.change((b) => removePieces(b, new Set([node.i]), now()));
      return;
    }
    this.ed.change((b) => patchNodes(b, new Set([node.i]), (n) => (n.t === 'w' ? { ...n, src: line } : n), now()));
  }

  // ===== a régua e a etiqueta =====

  async ask(what: RulerAsk, at = this.h.middle()): Promise<FbNode[]> {
    switch (what) {
      case 'atalhos':
        this.h.showHelp();
        return [];
      case 'anotacao':
        return this.addNote(at);
      case 'imagem':
        return this.addImages(await chooseFiles(), at);
      case 'widget':
        return this.addWidget(at);
    }
  }

  private async addNote(at: Point): Promise<FbNode[]> {
    const owner = this.h.owner();
    if (!owner) return [];
    const note = await owner.pickNote(this.h.board().grupo);
    if (!note) return [];
    return this.addLines([{ line: noteLine(note.id, note.title) }], at);
  }

  /** O Widget: primeiro qual (o contador, o vídeo, o som, a tabela, a imagem por link), depois a folha dele. */
  private addWidget(at: Point): Promise<FbNode[]> {
    const owner = this.h.owner();
    if (!owner) return Promise.resolve([]);
    return new Promise((resolve) => {
      const kinds: [string, string, MenuItem['icon']][] = [
        ['contador', 'Contador', ICON.ampulheta],
        ['video', 'Vídeo', ICON.video],
        ['audio', 'Áudio', ICON.som],
        ['tabela', 'Tabela', ICON.tabela],
        ['imagem', 'Imagem por link', ICON.imagem],
      ];
      const items = kinds.map(
        ([name, label, icon]): MenuItem => ({
          id: `widget-${name}`,
          label,
          icon,
          dialog: true,
          run: () =>
            void owner.editWidget(`{{${name}}}`).then((line) => resolve(line?.trim() ? this.addLines([{ line }], at) : [])),
        }),
      );
      const r = this.h.visor().getBoundingClientRect();
      this.h.menu('widget-novo', 'Qual widget?', [items], r.left + r.width / 2, r.top + r.height - 120, 'teclado');
    });
  }

  async addImages(files: readonly Blob[], at: Point): Promise<FbNode[]> {
    const owner = this.h.owner();
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!owner || !images.length) return [];
    const stored = await owner.storeImages(images);
    return this.addLines(
      stored.map((s) => ({ line: `{{imagem: murall://imagem/${s.id}}}`, image: { w: s.w, h: s.h } })),
      at,
    );
  }

  /** Põe widgets novos em grade a partir do ponto, num passo só, e os seleciona. */
  addLines(items: readonly { line: string; image?: { w: number; h: number } }[], at: Point): FbNode[] {
    if (!items.length) return [];
    const sizes = items.map((it) => sizeForLine(it.line, it.image));
    const boxes = placeGrid(at, sizes);
    const board = this.h.board();
    const nodes: FbNode[] = [];
    for (let k = 0; k < items.length; k++) {
      const n = newNode({ n: [...board.n, ...nodes], e: board.e }, 'w', boxes[k], { src: items[k].line });
      nodes.push(n);
    }
    const room = Math.max(0, 2000 - board.n.length);
    const added = nodes.slice(0, room);
    if (added.length < nodes.length) this.h.say('Este quadro chegou a 2.000 peças.');
    if (!added.length) return [];
    this.ed.change((b) => ({ ...b, em: now(), n: [...b.n, ...added] }));
    this.ed.select(added.map((n) => n.i));
    return added;
  }

  /** A etiqueta da seleção. */
  act(a: SelectionAction, anchor: { x: number; y: number }): void {
    const sel = this.ed.selected();
    switch (a) {
      case 'apagar':
        return this.ed.removeSelected();
      case 'duplicar':
        return this.duplicate();
      case 'frente':
      case 'tras':
        this.ed.change((b) => restack(b, sel, a === 'frente', now()));
        return;
      case 'rotulo': {
        const id = this.ed.selectedEdge();
        if (id) this.ed.writing.set({ kind: 'seta', id });
        return;
      }
      case 'jeito':
        return this.cycleLook();
      case 'cor':
        return this.h.menu('cor', 'Cor', [this.colorItems()], anchor.x, anchor.y, 'mouse');
    }
  }

  private colorItems(): MenuItem[] {
    return [
      { id: 'cor-nenhuma', label: 'A de sempre', icon: ICON.paleta, run: () => this.ed.paint(null) },
      ...LIGHT_STOCKS.map((c): MenuItem => ({ id: `cor-${c}`, label: COLOR_NAMES[c], icon: ICON.paleta, run: () => this.ed.paint(c) })),
    ];
  }

  /** O "Jeito da peça": a próxima escolha de aparência do widget (a moldura da foto, o jeito da nota, do contador). */
  cycleLook(): void {
    const [node] = this.ed.selectedNodes();
    if (!node || node.t !== 'w') return;
    const parsed = parseWidgetLine(node.src.split('\n')[0]);
    if (!parsed) return;
    const cycle = widgetCycles(parsed.name, parsed.args)[0];
    if (!cycle) return;
    const next = cycle.options[(cycle.at + 1) % cycle.options.length];
    const args = withChoice(parsed.name, parsed.args, cycle.key, next.value);
    if (!args) return;
    const src = widgetLines(parsed.name, args, parsed.size).join('\n');
    this.ed.change((b) => patchNodes(b, new Set([node.i]), (n) => (n.t === 'w' ? { ...n, src } : n), now()));
  }

  /** O nome do "Jeito da peça" da seleção, ou null. Na foto, "Jeito da foto" (Q1: "Moldura" é a do quadro). */
  lookLabel(node: FbNode | undefined): string | null {
    if (!node || node.t !== 'w') return null;
    const parsed = parseWidgetLine(node.src.split('\n')[0]);
    if (!parsed) return null;
    const cycle = widgetCycles(parsed.name, parsed.args)[0];
    if (!cycle) return null;
    const label = parsed.name === 'imagem' ? 'Jeito da foto' : 'Jeito';
    return `${label}: ${cycle.options[cycle.at]?.label ?? ''}`.trim();
  }

  duplicate(): void {
    const ids = this.ed.selected();
    if (!ids.size) return;
    const { clip } = copyPieces(this.h.board(), ids);
    const box = clip.n.reduce((a, n) => ({ x: Math.min(a.x, n.x), y: Math.min(a.y, n.y) }), { x: Infinity, y: Infinity });
    this.pasteClipAt(clip, { x: box.x + 52, y: box.y + 52 });
  }

  private pasteClipAt(clip: Clip, at: Point): void {
    let added: FbNode[] = [];
    let left = 0;
    this.ed.change((b) => {
      const r = pasteClip(b, clip, at, now());
      added = r.added;
      left = r.left;
      return r.board;
    });
    if (left) this.h.say('Este quadro chegou a 2.000 peças.');
    if (added.length) this.ed.select(added.map((n) => n.i));
  }

  group(on: boolean): void {
    const ids = this.ed.selected();
    if (!ids.size) return;
    if (on) this.ed.change((b) => groupPieces(b, ids, now()).board);
    else this.ed.change((b) => ungroupPieces(b, ids, now()));
  }

  // ===== copiar e colar =====

  private copy(e: ClipboardEvent, cut: boolean): void {
    const ids = this.ed.selected();
    if (!ids.size || (e.target instanceof Element && e.target.closest('.escrever, input, textarea'))) return;
    const { clip, text } = copyPieces(this.h.board(), ids);
    this.clip = clip;
    e.preventDefault();
    e.clipboardData?.setData(CLIP_TYPE, JSON.stringify(clip));
    e.clipboardData?.setData('text/plain', text);
    if (cut && this.h.editing()) this.ed.removeSelected();
  }

  private async paste(e: ClipboardEvent): Promise<void> {
    if (!this.h.editing() || (e.target instanceof Element && e.target.closest('.escrever, input, textarea'))) return;
    const data = e.clipboardData;
    if (!data) return;
    e.preventDefault();
    const at = this.lastPoint ?? this.h.middle();
    const own = data.getData(CLIP_TYPE);
    const clip = own ? readClip(own) : null;
    if (clip) return this.pasteClipAt(clip, at);
    const files = [...data.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      await this.addImages(files, at);
      return;
    }
    const text = data.getData('text/plain');
    if (!text && this.clip) return this.pasteClipAt(this.clip, at);
    this.pasteText(text, at);
  }

  pasteText(text: string, at: Point): void {
    const kind = classifyPaste(text);
    if (!kind) return;
    if (kind.kind === 'widget') {
      this.addLines([{ line: kind.src }], at);
      return;
    }
    if (kind.kind === 'nota') {
      const note = this.h.owner()?.findNote(kind.title);
      if (note) {
        this.addLines([{ line: noteLine(note.id, note.title) }], at);
        return;
      }
    }
    const txt = kind.kind === 'bilhete' ? kind.txt : `[[${kind.title}]]`;
    const node = newNode(this.h.board(), 'x', { x: Math.round(at.x / 26) * 26, y: Math.round(at.y / 26) * 26, w: 208, h: Math.max(104, Math.min(520, Math.ceil(txt.split('\n').length * 1.6) * 26)) }, { txt });
    this.ed.add(node);
  }

  private dragOver(e: DragEvent): void {
    if (!this.h.editing() || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  private async drop(e: DragEvent): Promise<void> {
    if (!this.h.editing()) return;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) {
      const text = e.dataTransfer?.getData('text/plain');
      if (text) {
        e.preventDefault();
        this.pasteText(text, this.world(e));
      }
      return;
    }
    e.preventDefault();
    await this.addImages(files, this.world(e));
  }

  // ===== os menus =====

  private contextMenu(e: MouseEvent): void {
    if (this.own(e.target)) return;
    e.preventDefault();
    this.cancelHold();
    this.openMenuAt(this.world(e), e.clientX, e.clientY, 'mouse', e.target);
  }

  /** O menu do que está no ponto: a peça, a seta ou o fundo; no ver, o de ver. */
  openMenuAt(p: Point, x: number, y: number, by: 'mouse' | 'toque' | 'teclado', target: EventTarget | null = null): void {
    if (target instanceof Element && target.closest('.acoes, .escrever')) return;
    const board = this.h.board();
    const hit = hitPiece(this.nodes(), p, this.h.camera().z);
    if (!this.h.editing()) return this.viewMenu(hit, p, x, y, by);
    if (hit) {
      if (!this.ed.selected().has(hit.i)) this.ed.select([hit.i]);
      return this.h.menu(`peca:${hit.i}`, this.captionOf(hit), this.pieceMenu(hit), x, y, by);
    }
    const edge = hitEdge(board, p, 10 / this.h.camera().z);
    if (edge) {
      this.ed.selected.set(new Set());
      this.ed.selectedEdge.set(edge.i);
      return this.h.menu(`seta:${edge.i}`, edge.txt ? `Seta: ${edge.txt}` : 'Seta', this.edgeMenu(edge.i), x, y, by);
    }
    this.h.menu('fundo', 'O quadro', this.backgroundMenu(p), x, y, by);
  }

  private captionOf(n: FbNode): string {
    if (n.t === 'm') return `Moldura ${n.nome || 'sem título'}`;
    if (n.t === 'x') return `Bilhete: ${n.txt.split('\n')[0].slice(0, 40)}`;
    const parsed = parseWidgetLine(n.src.split('\n')[0]);
    return widgetDef(parsed?.name ?? 'tabela')?.label ?? 'Widget';
  }

  private viewMenu(hit: FbNode | null, p: Point, x: number, y: number, by: 'mouse' | 'toque' | 'teclado'): void {
    const sections: MenuItem[][] = [];
    if (hit) {
      const first: MenuItem[] = [];
      const parsed = hit.t === 'w' ? parseWidgetLine(hit.src.split('\n')[0]) : null;
      if (parsed?.name === 'nota') {
        const id = /#([A-Za-z0-9_-]+)/.exec((hit as FbNode & { src: string }).src)?.[1];
        const owner = this.h.owner();
        if (id && owner) first.push({ id: 'abrir', label: 'Abrir', icon: ICON.anotacoes, run: () => owner.openNote(id) });
      }
      if (parsed?.name === 'imagem') first.push({ id: 'ampliar', label: 'Ampliar', icon: ICON.aumentar, run: () => this.enlarge(hit.i) });
      const text = copyPieces(this.h.board(), new Set([hit.i])).text;
      first.push({ id: 'copiar', label: 'Copiar', icon: ICON.copiar, run: () => void navigator.clipboard?.writeText(text).catch(() => undefined) });
      first.push({ id: 'ir', label: 'Ir até aqui', icon: ICON.alvo, run: () => this.h.goTo(center(hit)) });
      sections.push(first);
    } else {
      sections.push([{ id: 'ver-tudo', label: 'Ver tudo', icon: ICON.aumentar, keys: '0', run: () => this.h.fitAll() }]);
    }
    if (this.h.owner()) sections.push([{ id: 'editar', label: 'Editar o quadro', icon: ICON.editar, keys: 'E', run: () => this.h.toggleEdit(true) }]);
    this.h.menu(hit ? `ver:${hit.i}` : 'ver:fundo', hit ? this.captionOf(hit) : 'O quadro', sections, x, y, by);
    void p;
  }

  /** Amplia a foto: o mesmo toque da foto colada (ela abre o visor dela). */
  private enlarge(id: string): void {
    const el = this.h.visor().querySelector<HTMLElement>(`[data-peca="${id}"] app-glued-media img, [data-peca="${id}"] .miniatura`);
    el?.click();
  }

  private pieceMenu(n: FbNode): MenuSections {
    const ids = this.ed.selected();
    const grouped = this.nodes().some((x) => ids.has(x.i) && x.g);
    const many = ids.size > 1;
    const first: MenuItem[] = [];
    if (n.t === 'm' && !many) {
      first.push({ id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.ed.writing.set({ kind: 'moldura', id: n.i }) });
      first.push({
        id: 'dentro',
        label: 'Selecionar o que está dentro',
        icon: ICON.semDesenho,
        run: () => this.ed.select(insideFrame(this.nodes(), n.i)),
      });
      first.push({
        id: 'ajustar',
        label: 'Ajustar ao conteúdo',
        icon: ICON.moldura,
        run: () => {
          const r = fitFrame(this.h.board(), n.i);
          if (r) this.ed.change((b) => patchNodes(b, new Set([n.i]), (x) => ({ ...x, ...r }), now()));
        },
      });
    } else if (!many) {
      first.push({ id: 'mexer', label: n.t === 'x' ? 'Escrever' : 'Editar', icon: ICON.editar, run: () => this.edit(n) });
    }
    if (n.t !== 'w' || many) first.push({ id: 'cor', label: 'Cor…', icon: ICON.paleta, dialog: true, run: () => this.reopenColors() });
    const look = !many ? this.lookLabel(n) : null;
    if (look) first.push({ id: 'jeito', label: look, icon: ICON.moldura, run: () => this.cycleLook() });
    const order: MenuItem[] = [
      { id: 'copiar', label: 'Copiar', icon: ICON.copiar, keys: 'Ctrl+C', run: () => this.copyToClipboard() },
      { id: 'duplicar', label: 'Duplicar', icon: ICON.copiar, keys: 'Ctrl+D', run: () => this.duplicate() },
      { id: 'frente', label: 'Trazer para frente', icon: ICON.frente, keys: ']', run: () => this.act('frente', { x: 0, y: 0 }) },
      { id: 'tras', label: 'Mandar para trás', icon: ICON.tras, keys: '[', run: () => this.act('tras', { x: 0, y: 0 }) },
    ];
    if (many) order.push({ id: 'juntar', label: 'Juntar', icon: ICON.camadas, keys: 'Ctrl+G', run: () => this.group(true) });
    if (grouped) order.push({ id: 'separar', label: 'Separar', icon: ICON.camadas, keys: 'Ctrl+Shift+G', run: () => this.group(false) });
    const gone: MenuItem[] =
      n.t === 'm' && !many
        ? [
            { id: 'apagar-moldura', label: 'Apagar só a moldura', icon: ICON.apagar, danger: true, run: () => this.ed.change((b) => removePieces(b, new Set([n.i]), now())) },
            {
              id: 'apagar-tudo',
              label: 'Apagar a moldura e o que está dentro',
              icon: ICON.apagar,
              danger: true,
              run: () => this.ed.change((b) => removePieces(b, new Set([n.i, ...insideFrame(this.nodes(), n.i)]), now())),
            },
          ]
        : [{ id: 'apagar', label: many ? `Apagar as ${ids.size}` : 'Apagar', icon: ICON.apagar, danger: true, keys: 'Delete', run: () => this.ed.removeSelected() }];
    return [first, order, gone];
  }

  private reopenColors(): void {
    const r = this.h.visor().getBoundingClientRect();
    setTimeout(() => this.h.menu('cor', 'Cor', [this.colorItems()], r.left + r.width / 2, r.top + r.height / 2, 'teclado'));
  }

  private edgeMenu(id: string): MenuSections {
    const ends: [string, string, '-' | '<' | '<>' | null][] = [
      ['seta-fim', 'Ponta no fim (→)', null],
      ['seta-comeco', 'Ponta no começo (←)', '<'],
      ['seta-duas', 'Pontas nas duas (↔)', '<>'],
      ['seta-sem', 'Sem ponta', '-'],
    ];
    return [
      [
        { id: 'rotulo', label: 'Rótulo', icon: ICON.etiqueta, run: () => this.ed.writing.set({ kind: 'seta', id }) },
        { id: 'cor', label: 'Cor…', icon: ICON.paleta, dialog: true, run: () => this.reopenColors() },
      ],
      ends.map(([k, label, p]): MenuItem => ({ id: k, label, icon: ICON.ponteiro, run: () => this.ed.ends(p, id) })),
      [{ id: 'apagar', label: 'Apagar a seta', icon: ICON.apagar, danger: true, keys: 'Delete', run: () => this.ed.removeSelected() }],
    ];
  }

  private backgroundMenu(p: Point): MenuSections {
    const owner = this.h.owner();
    const here: MenuItem[] = [{ id: 'texto', label: 'Texto aqui', icon: ICON.letra, run: () => void this.ed.newNote(p) }];
    if (owner) {
      here.push({ id: 'anotacao', label: 'Anotação aqui', icon: ICON.anotacoes, dialog: true, run: () => void this.ask('anotacao', p) });
      here.push({ id: 'imagem', label: 'Imagem aqui', icon: ICON.imagem, dialog: true, run: () => void this.ask('imagem', p) });
      here.push({ id: 'widget', label: 'Widget aqui', icon: ICON.widgets, dialog: true, run: () => void this.ask('widget', p) });
    }
    const first: MenuItem[] = [];
    if (this.clip) first.push({ id: 'colar', label: 'Colar', icon: ICON.copiar, keys: 'Ctrl+V', run: () => this.pasteClipAt(this.clip!, p) });
    return [
      first,
      here,
      [
        { id: 'tudo', label: 'Selecionar tudo', icon: ICON.semDesenho, keys: 'Ctrl+A', run: () => this.ed.selectAll() },
        { id: 'ver-tudo', label: 'Ver tudo', icon: ICON.aumentar, keys: '0', run: () => this.h.fitAll() },
      ],
    ];
  }

  /** A seta solta no vazio: o menu do que nasce ali, já ligado a ela. */
  dropArrow(from: string, side: FbSide, at: Point, screen: Point): void {
    const r = this.h.visor().getBoundingClientRect();
    const link = (made: FbNode[]) => {
      const to = made[0];
      if (!to) return;
      const c = connect(this.h.board(), from, to.i, now(), { as: side });
      if (c) this.ed.change(() => c.board);
    };
    const owner = this.h.owner();
    const items: MenuItem[] = [
      {
        id: 'texto',
        label: 'Texto aqui',
        icon: ICON.letra,
        run: () => {
          const n = this.ed.newNote(at);
          if (n) link([n]);
        },
      },
    ];
    if (owner) {
      items.push({ id: 'anotacao', label: 'Anotação aqui', icon: ICON.anotacoes, dialog: true, run: () => void this.ask('anotacao', at).then(link) });
      items.push({ id: 'imagem', label: 'Imagem aqui', icon: ICON.imagem, dialog: true, run: () => void this.ask('imagem', at).then(link) });
      items.push({ id: 'widget', label: 'Widget aqui', icon: ICON.widgets, dialog: true, run: () => void this.ask('widget', at).then(link) });
    }
    this.h.menu('seta-solta', 'Ligar em', [items], r.left + screen.x, r.top + screen.y, 'mouse');
  }

  private copyToClipboard(): void {
    const { clip, text } = copyPieces(this.h.board(), this.ed.selected());
    this.clip = clip;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  // ===== o teclado do editar =====

  /** Os atalhos do editar; devolve se a tecla foi usada. */
  key(e: KeyboardEvent): boolean {
    if (e.key === ' ' && !e.repeat) this.space = true;
    if (!this.h.editing()) {
      if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey && this.h.owner()) {
        this.h.toggleEdit(true);
        return true;
      }
      return false;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl) {
      switch (k) {
        case 'a':
          this.ed.selectAll();
          return true;
        case 'z':
          e.shiftKey ? this.ed.redo() : this.ed.undo();
          return true;
        case 'y':
          this.ed.redo();
          return true;
        case 'd':
          this.duplicate();
          return true;
        case 'g':
          this.group(!e.shiftKey);
          return true;
      }
      return false;
    }
    if (e.altKey) return false;
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        this.ed.removeSelected();
        return true;
      case 'Escape':
        if (this.ed.preview() || this.ed.box() || this.ed.linking() || this.ed.drawing()) this.ed.cancel();
        else if (this.ed.selected().size || this.ed.selectedEdge()) this.ed.clearSelection();
        else if (this.ed.tool() !== 'selecionar') this.ed.tool.set('selecionar');
        else this.h.toggleEdit(false);
        return true;
      case ']':
      case '[':
        this.act(e.key === ']' ? 'frente' : 'tras', { x: 0, y: 0 });
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!this.ed.selected().size) return false;
        const step = e.shiftKey ? 1 : 26;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        this.ed.nudge(dx, dy);
        return true;
      }
      case 'Enter': {
        const [n] = this.ed.selectedNodes();
        if (this.ed.selected().size === 1 && n) {
          this.edit(n);
          return true;
        }
        return false;
      }
      case '?':
        this.h.showHelp();
        return true;
    }
    switch (k) {
      case 'v':
        this.ed.tool.set('selecionar');
        return true;
      case 'm':
        this.ed.tool.set('moldura');
        return true;
      case 't':
        this.ed.tool.set('texto');
        return true;
      case 'n':
        void this.ask('anotacao');
        return true;
      case 'i':
        void this.ask('imagem');
        return true;
      case 'w':
        void this.ask('widget');
        return true;
      case 'e':
        this.h.toggleEdit(false);
        return true;
    }
    return false;
  }
}

/** Escolher imagens do aparelho (várias de uma vez). */
function chooseFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}
