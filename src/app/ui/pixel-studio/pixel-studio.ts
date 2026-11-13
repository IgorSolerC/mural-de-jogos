import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import {
  Cell,
  DEFAULT_PALETTE,
  INK_MAX,
  PALETTES,
  PIXEL_MAX,
  PaletteName,
  blankGrid,
  clampSide,
  drawingInks,
  fitInGrid,
  flipH,
  flipV,
  floodFill,
  gridOf,
  hasInk,
  inkChar,
  inkCount,
  inkIndex,
  inkOf,
  inkPaths,
  lineCells,
  normalHex,
  paintCells,
  paletteColors,
  paletteWord,
  parseColors,
  quantize,
  shiftGrid,
  writeColors,
  writeGrid,
} from '../../core/pixel-art';
import { Anchor, BRUSH_MAX, BrushShape, Symmetry, ZOOMS, ZOOM_KEYS, brushCells, fitZoom, mirrored, perfectCorner, replaceInk, resizeCanvas, stampCells, stepZoom, zoomLabel } from '../../core/pixel-tools';
import { WidgetValues } from '../../core/widgets';
import { imageFileOf } from '../../core/images';
import { ContextMenu, MenuSections } from '../context-menu';
import { ICON, IconModule } from '../icons';

/** As ferramentas do ateliê (as que pintam e a mão). */
export type StudioTool = 'lapis' | 'borracha' | 'balde' | 'conta-gotas' | 'mao';

/** Quantos passos o desfazer guarda. */
const UNDO_MAX = 120;

/** Um passo do desfazer: o desenho inteiro (os pontos, a tela, a paleta e as cores). */
interface Snap {
  rows: string[];
  w: number;
  h: number;
  palette: PaletteName;
  colors: Record<number, string>;
}

/** O arrasto de agora: pintando, arrastando a vista ou aproximando com dois dedos. */
type Drag =
  | { kind: 'pinta'; ink: number; erase: boolean; last: Cell; before: string[]; path: Cell[] }
  | { kind: 'vista'; x: number; y: number; panX: number; panY: number }
  | { kind: 'pinca'; dist: number; mid: { x: number; y: number }; zoom: number; panX: number; panY: number };

let uid = 0;

/**
 * O ateliê da pixel art (PLANO-ATELIE.md, seção 3): a folha de tela inteira por cima da folha do widget,
 * com o Aseprite como base. A mesa é a base de corte grafite, com a folha do desenho no meio (o xadrez do
 * transparente, os fios de cada ponto quando cabem, a grade de 8 em 8) e as réguas contando os pontos. Em
 * volta, as tiras de cartolina: a de cima com as opções da ferramenta de agora, a da esquerda com as
 * ferramentas e a da direita com a prévia e as cores. Embaixo, a barra de estado.
 *
 * Os pontos, a tela, a paleta e as cores moram aqui enquanto ele está aberto; cada mudança vai para a
 * folha na hora (`changed`, os valores do widget), e o desfazer guarda o desenho inteiro.
 *
 * O mouse: o botão esquerdo pinta com a cor da frente, o direito com a do fundo (o transparente, no
 * começo: apaga), o do meio arrasta a vista; a roda aproxima no ponto do mouse. O dedo: um pinta, dois
 * aproximam e arrastam. As teclas são as do Aseprite (ver `onKey`).
 */
@Component({
  selector: 'app-pixel-studio',
  imports: [ContextMenu, IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pixel-studio.html',
  styleUrl: './pixel-studio.scss',
})
export class PixelStudio {
  /** Os valores da folha quando o ateliê abriu (os pontos, a grade, a paleta, as cores trocadas). */
  readonly values = input.required<WidgetValues>();
  /** O desenho mudou: os valores novos do widget (`pixels`, `width`, `height`, `palette`, `colors`). */
  readonly changed = output<WidgetValues>();
  readonly closed = output<void>();

  private readonly injector = inject(Injector);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly mesa = viewChild.required<ElementRef<HTMLElement>>('mesa');
  private readonly board = viewChild.required<ElementRef<SVGSVGElement>>('folha');
  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('cor');
  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('arquivo');
  private readonly sizeSheet = viewChild<ElementRef<HTMLDialogElement>>('tamanho');
  private readonly imageMenu = viewChild.required<ContextMenu>('menuImagem');

  protected readonly ids = 'at-' + ++uid;
  protected readonly I = ICON;
  protected readonly inkChar = inkChar;
  protected readonly zoomLabel = zoomLabel;
  protected readonly TOOLS: readonly { value: StudioTool; label: string; key: string; icon: typeof ICON.editar }[] = [
    { value: 'lapis', label: 'Lápis', key: 'B', icon: ICON.editar },
    { value: 'borracha', label: 'Borracha', key: 'E', icon: ICON.borracha },
    { value: 'balde', label: 'Balde', key: 'G', icon: ICON.balde },
    { value: 'conta-gotas', label: 'Conta-gotas', key: 'I', icon: ICON.contaGotas },
    { value: 'mao', label: 'Mão', key: 'H', icon: ICON.aMao },
  ];
  protected readonly SYMMETRIES: readonly { value: Symmetry; label: string }[] = [
    { value: 'nenhuma', label: 'Nenhuma' },
    { value: 'lado', label: 'De lado' },
    { value: 'cima', label: 'De cima' },
    { value: 'ambas', label: 'As duas' },
  ];
  /** As paletas da escolha (a própria só aparece quando é a de agora: ela nasce de mexer nas cores). */
  protected readonly palettes = computed(() => PALETTES.filter((p) => p.value !== 'propria' || this.palette() === 'propria'));
  protected readonly SIZES = [8, 16, 24, 32, 48, 64];
  protected readonly ANCHORS: readonly Anchor[] = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => ({ x, y }) as Anchor));
  protected readonly PIXEL_MAX = PIXEL_MAX;
  protected readonly BRUSH_MAX = BRUSH_MAX;
  protected readonly INK_MAX = INK_MAX;

  // ===== o desenho =====

  protected readonly w = signal(16);
  protected readonly h = signal(16);
  protected readonly rows = signal<string[]>(blankGrid(16, 16));
  protected readonly palette = signal<PaletteName>(DEFAULT_PALETTE);
  protected readonly colors = signal<Record<number, string>>({});

  protected readonly inks = computed(() => inkOf(this.palette(), this.colors()));
  /** Quantas cores o desenho tem (as pastilhas, fora o transparente). */
  protected readonly count = computed(() => inkCount(this.palette(), this.colors()));
  protected readonly swatches = computed(() => drawingInks(this.palette(), this.colors()).map((_, i) => i));
  protected readonly paths = computed(() => inkPaths(this.rows(), 'pixel'));
  protected readonly inked = computed(() => hasInk(this.rows()));
  protected readonly paletteLabel = computed(() => PALETTES.find((p) => p.value === this.palette())?.label ?? '');

  // ===== as ferramentas =====

  protected readonly tool = signal<StudioTool>('lapis');
  /** A ferramenta de enquanto se segura uma tecla (Espaço: a mão; Alt: o conta-gotas). */
  protected readonly held = signal<StudioTool | null>(null);
  protected readonly active = computed(() => this.held() ?? this.tool());
  /** A cor da frente (o botão esquerdo) e a do fundo (o direito; o transparente no começo). */
  protected readonly fg = signal(1);
  protected readonly bg = signal(0);
  protected readonly brush = signal(1);
  protected readonly shape = signal<BrushShape>('quadrado');
  /** O lápis de um ponto sem os cantos do L (o "pixel perfect" do Aseprite). */
  protected readonly perfect = signal(false);
  /** O balde só na mancha (contíguo) ou na cor inteira. */
  protected readonly contiguous = signal(true);
  protected readonly symmetry = signal<Symmetry>('nenhuma');

  // ===== a vista =====

  /** Pixels da tela por ponto (1 é o 100%). */
  protected readonly zoom = signal(16);
  /** Quanto o meio da folha está fora do meio da mesa, em pixels da tela. */
  protected readonly panX = signal(0);
  protected readonly panY = signal(0);
  /** O tamanho da mesa (para caber, as réguas e onde a folha fica). */
  protected readonly view = signal({ w: 0, h: 0 });
  /** A grade de 8 em 8 (Ctrl+') e os fios de cada ponto (Ctrl+Shift+'). */
  protected readonly grid8 = signal(true);
  protected readonly gridDots = signal(true);
  /** Os fios só aparecem quando cada ponto tem tamanho para eles (senão a folha vira um borrão cinza). */
  protected readonly showDots = computed(() => this.gridDots() && this.zoom() >= 6);
  /** O canto de cima da folha, na mesa. */
  protected readonly boardLeft = computed(() => Math.round(this.view().w / 2 + this.panX() - (this.w() * this.zoom()) / 2));
  protected readonly boardTop = computed(() => Math.round(this.view().h / 2 + this.panY() - (this.h() * this.zoom()) / 2));

  protected readonly hover = signal<Cell | null>(null);
  /** O ponto do teclado e se ele aparece (só depois de andar pelas setas). */
  protected readonly cursor = signal<Cell>({ x: 0, y: 0 });
  protected readonly keyboard = signal(false);
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  /** O que o ateliê acabou de fazer, para quem lê a tela. */
  protected readonly said = signal('');
  /** O celular: as cores numa folha que sobe. */
  protected readonly colorsOpen = signal(false);
  /** A cor da frente sendo editada (o painel embaixo das pastilhas). */
  protected readonly editing = signal(false);
  protected readonly importing = signal(false);
  protected readonly importError = signal<string | null>(null);
  /** O Tamanho da tela (C): os campos e a âncora, enquanto a folha dele está aberta. */
  protected readonly sizing = signal<{ w: number; h: number; anchor: Anchor } | null>(null);

  private undos: Snap[] = [];
  private redos: Snap[] = [];
  private drag: Drag | null = null;
  /** Os ponteiros na mesa agora (dois dedos aproximam). */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  /** O ponteiro do traço de agora (outro não continua o traço dele). */
  private strokePointer: number | null = null;
  /** O último ponto pintado (o Shift risca a reta desde ele). */
  private lastPainted: Cell | null = null;
  /** As cores de antes de a cor da frente começar a ser editada: a troca inteira é um passo do desfazer. */
  private colorsBefore: Snap | null = null;
  /** A roda do mouse, somada até dar um passo de zoom (o trackpad manda pedacinhos). */
  private wheelSum = 0;
  /** A mesa já teve tamanho: o desenho foi posto para caber nela. */
  private fitted = false;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      this.load(this.values());
      const el = this.dialog().nativeElement;
      if (!el.open) el.showModal();
      const mesa = this.mesa().nativeElement;
      const measure = () => {
        const r = mesa.getBoundingClientRect();
        this.view.set({ w: r.width, h: r.height });
        if (!this.fitted && r.width > 0) {
          this.fitted = true;
          this.fit();
        }
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(mesa);
      destroy.onDestroy(() => ro.disconnect());
      // (o foco vai para a folha, sem o contorno de teclado: ninguém usou o teclado ainda)
      this.board().nativeElement.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    });
  }

  /** Os valores da folha viram o desenho do ateliê. */
  private load(v: WidgetValues): void {
    const w = clampSide(v['width']);
    const h = clampSide(v['height']);
    this.w.set(w);
    this.h.set(h);
    this.rows.set(gridOf(v['pixels'] ?? '', w, h));
    this.palette.set(paletteWord(v['palette'] ?? '') ?? DEFAULT_PALETTE);
    this.colors.set(parseColors(v['colors'] ?? '') ?? {});
    if (this.fg() > this.count()) this.fg.set(Math.min(1, this.count()));
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
    else this.closed.emit();
  }

  // ===== o desenho e o desfazer =====

  private snap(): Snap {
    return { rows: this.rows(), w: this.w(), h: this.h(), palette: this.palette(), colors: this.colors() };
  }

  /** Manda o desenho de agora para a folha. */
  private emit(): void {
    this.changed.emit({
      pixels: writeGrid(this.rows()),
      width: String(this.w()),
      height: String(this.h()),
      palette: this.palette(),
      colors: writeColors(this.colors(), this.palette()),
    });
  }

  /** Guarda no desfazer o desenho de antes de uma mudança. */
  private remember(before: Snap): void {
    this.undos.push(before);
    if (this.undos.length > UNDO_MAX) this.undos.shift();
    this.redos = [];
    this.syncHistory();
  }

  private syncHistory(): void {
    this.canUndo.set(this.undos.length > 0);
    this.canRedo.set(this.redos.length > 0);
  }

  private restore(s: Snap): void {
    this.w.set(s.w);
    this.h.set(s.h);
    this.rows.set(s.rows);
    this.palette.set(s.palette);
    this.colors.set(s.colors);
    this.clampInks();
    this.emit();
    this.syncHistory();
  }

  /** Uma mudança de uma vez só (o balde, virar, limpar, a tela): um passo no desfazer. */
  private change(next: Partial<Snap>, said: string): void {
    const before = this.snap();
    const after = { ...before, ...next };
    if (sameSnap(before, after)) return;
    this.remember(before);
    this.restore(after);
    this.said.set(said);
  }

  protected undo(): void {
    // (no meio de um traço, ele termina antes: o desfazer volta o traço inteiro)
    this.endStroke();
    const prev = this.undos.pop();
    if (!prev) return;
    this.redos.push(this.snap());
    this.restore(prev);
    this.said.set('Desfeito');
  }

  protected redo(): void {
    this.endStroke();
    const next = this.redos.pop();
    if (!next) return;
    this.undos.push(this.snap());
    this.restore(next);
    this.said.set('Refeito');
  }

  /** As cores escolhidas dentro da paleta de agora (ela pode ter diminuído). */
  private clampInks(): void {
    const n = this.count();
    if (this.fg() > n) this.fg.set(Math.min(1, n));
    if (this.bg() > n) this.bg.set(0);
  }

  // ===== pintar =====

  /** Os pontos que o pincel cobre num caminho, com a simetria, dentro da tela. */
  private cover(path: readonly Cell[]): Cell[] {
    const size = this.active() === 'lapis' || this.active() === 'borracha' ? this.brush() : 1;
    return mirrored(stampCells(path, size, this.shape()), this.symmetry(), this.w(), this.h()).filter((c) => c.x >= 0 && c.y >= 0 && c.x < this.w() && c.y < this.h());
  }

  /** O nome de uma cor, como se fala: "transparente", "cor b". */
  protected inkName(n: number): string {
    return n === 0 ? 'transparente' : `cor ${inkChar(n)}`;
  }

  /** O ponto debaixo do toque, com a ferramenta dada; `alt`: o botão direito (a cor do fundo). */
  private press(c: Cell, tool: StudioTool, alt: boolean, shift: boolean): void {
    const ink = alt ? this.bg() : this.fg();
    if (tool === 'conta-gotas') {
      if (!this.inside(c)) return;
      const n = Math.max(0, inkIndex(this.rows()[c.y][c.x]));
      const pick = n <= this.count() ? n : 0;
      if (alt) this.bg.set(pick);
      else this.fg.set(pick);
      this.said.set(`${alt ? 'Fundo' : 'Frente'}: ${this.inkName(pick)}`);
      return;
    }
    if (tool === 'balde') {
      if (!this.inside(c)) return;
      let rows = this.rows();
      for (const at of mirrored([c], this.symmetry(), this.w(), this.h())) rows = this.contiguous() ? floodFill(rows, at, ink, this.w(), this.h()) : replaceInk(rows, at, ink, this.w(), this.h());
      this.change({ rows }, `Balde de ${this.inkName(ink)}`);
      return;
    }
    const erase = tool === 'borracha';
    const paintInk = erase ? 0 : ink;
    const before = this.rows();
    const from = shift && this.lastPainted ? this.lastPainted : c;
    const path = lineCells(from, c);
    this.drag = { kind: 'pinta', ink: paintInk, erase, last: c, before, path: [] };
    this.stroke(path);
  }

  /** Pinta um pedaço do arrasto (a reta do último ponto ao de agora), com o pixel perfeito no lápis de um ponto. */
  private stroke(path: readonly Cell[]): void {
    const d = this.drag;
    if (d?.kind !== 'pinta') return;
    let rows = this.rows();
    const perfect = this.perfect() && !d.erase && this.brush() === 1 && this.active() === 'lapis';
    for (const p of path) {
      const last = d.path.at(-1);
      if (last && last.x === p.x && last.y === p.y) continue;
      d.path.push(p);
      rows = paintCells(rows, this.cover([p]), d.ink);
      if (!perfect) continue;
      const corner = perfectCorner(d.path);
      if (!corner) continue;
      // o canto do L volta a ser o que era antes do traço
      for (const m of this.cover([corner])) rows = paintCells(rows, [m], Math.max(0, inkIndex(d.before[m.y]?.[m.x] ?? '0')));
      d.path.splice(d.path.length - 2, 1);
    }
    if (!sameRows(rows, this.rows())) {
      this.rows.set(rows);
      this.emit();
    }
    this.lastPainted = path.at(-1) ?? this.lastPainted;
  }

  /** Termina o arrasto: um passo só no desfazer (se mudou alguma coisa). */
  private endStroke(): void {
    const d = this.drag;
    this.drag = null;
    if (d?.kind === 'pinta' && !sameRows(d.before, this.rows())) this.remember({ ...this.snap(), rows: d.before });
  }

  /** Desfaz o arrasto de agora sem guardar nada (o segundo dedo chegou: era um gesto, não um traço). */
  private cancelStroke(): void {
    const d = this.drag;
    this.drag = null;
    if (d?.kind === 'pinta' && !sameRows(d.before, this.rows())) {
      this.rows.set(d.before);
      this.emit();
    }
  }

  private inside(c: Cell): boolean {
    return c.x >= 0 && c.y >= 0 && c.x < this.w() && c.y < this.h();
  }

  // ===== o mouse, a caneta e os dedos =====

  /** O ponto da folha debaixo do ponteiro (fora dela também: o traço continua pela beirada). */
  private cellAt(e: { clientX: number; clientY: number }): Cell {
    const r = this.board().nativeElement.getBoundingClientRect();
    const z = r.width / this.w() || this.zoom();
    return { x: Math.floor((e.clientX - r.left) / z), y: Math.floor((e.clientY - r.top) / z) };
  }

  protected down(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    const mesa = this.mesa().nativeElement;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      mesa.setPointerCapture?.(e.pointerId);
    } catch {
      // (o ponteiro que o navegador já soltou: o arrasto segue sem a captura)
    }
    e.preventDefault();
    this.board().nativeElement.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    this.keyboard.set(false);
    // (a folha das cores do celular desce quando se volta a desenhar)
    this.colorsOpen.set(false);
    // o segundo dedo: o traço do primeiro era o começo do gesto
    if (this.pointers.size === 2) {
      this.cancelStroke();
      const [a, b] = [...this.pointers.values()];
      this.drag = { kind: 'pinca', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: this.zoom(), panX: this.panX(), panY: this.panY() };
      return;
    }
    if (this.pointers.size > 2 || this.drag) return;
    if (e.button === 1 || this.active() === 'mao') {
      this.drag = { kind: 'vista', x: e.clientX, y: e.clientY, panX: this.panX(), panY: this.panY() };
      return;
    }
    const c = this.cellAt(e);
    this.cursor.set({ x: Math.max(0, Math.min(this.w() - 1, c.x)), y: Math.max(0, Math.min(this.h() - 1, c.y)) });
    this.strokePointer = e.pointerId;
    this.press(c, this.active(), e.button === 2, e.shiftKey);
  }

  protected move(e: PointerEvent): void {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = this.cellAt(e);
    const was = this.hover();
    const now = e.pointerType === 'mouse' && this.inside(c) ? c : null;
    if (was?.x !== now?.x || was?.y !== now?.y) this.hover.set(now);
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'vista') {
      this.panX.set(d.panX + e.clientX - d.x);
      this.panY.set(d.panY + e.clientY - d.y);
    } else if (d.kind === 'pinca' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const want = d.zoom * (dist / d.dist);
      const z = ZOOMS.reduce((best, v) => (Math.abs(v - want) < Math.abs(best - want) ? v : best), ZOOMS[0]);
      // o ponto debaixo do meio dos dedos fica debaixo deles
      const r = this.mesa().nativeElement.getBoundingClientRect();
      const ox = d.mid.x - r.left - this.view().w / 2 - d.panX;
      const oy = d.mid.y - r.top - this.view().h / 2 - d.panY;
      this.zoom.set(z);
      this.panX.set(d.panX + (mid.x - d.mid.x) + ox - (ox * z) / d.zoom);
      this.panY.set(d.panY + (mid.y - d.mid.y) + oy - (oy * z) / d.zoom);
    } else if (d.kind === 'pinta' && e.pointerId === this.strokePointer) {
      // o botão solto onde a mesa não ouviu (fora da janela): o traço acaba aqui
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        this.pointers.delete(e.pointerId);
        this.endStroke();
        return;
      }
      if (c.x === d.last.x && c.y === d.last.y) return;
      this.stroke(lineCells(d.last, c).slice(1));
      d.last = c;
    }
  }

  protected up(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.drag?.kind === 'pinca') {
      // o primeiro dedo que sai acaba o gesto; o outro não começa um traço
      if (this.pointers.size === 0) this.drag = null;
      return;
    }
    if (this.pointers.size === 0) this.endStroke();
    if (this.drag?.kind === 'vista' && this.pointers.size === 0) this.drag = null;
  }

  protected leave(): void {
    this.hover.set(null);
  }

  /** A roda: aproxima e afasta no ponto do mouse; com o Shift, anda de lado. */
  protected wheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.shiftKey && !e.ctrlKey) {
      this.panX.update((x) => x - (e.deltaY || e.deltaX));
      return;
    }
    // (a pinça do trackpad chega com o Ctrl e passos pequenos; a roda, com passos grandes)
    this.wheelSum += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const step = e.ctrlKey ? 30 : 60;
    if (Math.abs(this.wheelSum) < step) return;
    const dir = this.wheelSum < 0 ? 1 : -1;
    this.wheelSum = 0;
    this.zoomAt(stepZoom(this.zoom(), dir), e.clientX, e.clientY);
  }

  /** Muda o zoom deixando parado o ponto da tela dado (o mouse); sem ponto, o meio da mesa. */
  protected zoomAt(z: number, clientX?: number, clientY?: number): void {
    const before = this.zoom();
    if (z === before) return;
    const r = this.mesa().nativeElement.getBoundingClientRect();
    const ox = clientX === undefined ? 0 : clientX - r.left - this.view().w / 2 - this.panX();
    const oy = clientY === undefined ? 0 : clientY - r.top - this.view().h / 2 - this.panY();
    this.zoom.set(z);
    this.panX.update((x) => Math.round(x + ox - (ox * z) / before));
    this.panY.update((y) => Math.round(y + oy - (oy * z) / before));
    this.said.set(`Zoom ${zoomLabel(z)}`);
  }

  /** O zoom vizinho do de agora (os botões − e +). */
  protected zoomStep(dir: 1 | -1): number {
    return stepZoom(this.zoom(), dir);
  }

  /** O desenho inteiro no meio da mesa, no maior zoom em que cabe (Ctrl+0). */
  protected fit(): void {
    const v = this.view();
    // (no celular a folga em volta é menor: a folha é o que importa)
    this.zoom.set(fitZoom(this.w(), this.h(), v.w, v.h, v.w < 560 ? 16 : 48));
    this.panX.set(0);
    this.panY.set(0);
  }

  // ===== o teclado (os atalhos do Aseprite) =====

  protected onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, select, textarea, [role="menu"]') || this.sizing()) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey) {
      if (k === 'z' || k === 'y') {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) this.redo();
        else this.undo();
      } else if (k === '0') {
        e.preventDefault();
        this.fit();
      } else if (k === '=' || k === '+') {
        e.preventDefault();
        this.zoomAt(stepZoom(this.zoom(), 1));
      } else if (k === '-') {
        e.preventDefault();
        this.zoomAt(stepZoom(this.zoom(), -1));
      } else if (k === "'" || k === '"' || e.code === 'Quote') {
        e.preventDefault();
        if (e.shiftKey) this.toggleDots();
        else this.toggleGrid();
      }
      return;
    }
    if (e.key === 'Alt') {
      // o conta-gotas enquanto segura (e o menu do navegador não abre)
      e.preventDefault();
      if (!e.repeat && !this.drag) this.held.set('conta-gotas');
      return;
    }
    if (e.key === ' ' && this.onBoard(e)) {
      e.preventDefault();
      if (!e.repeat && !this.drag) this.held.set('mao');
      return;
    }
    if (e.altKey) {
      if (this.onBoard(e)) this.nudge(e);
      return;
    }
    if (e.shiftKey && (k === 'h' || k === 'v')) {
      e.preventDefault();
      if (k === 'h') this.flipSide();
      else this.flipUpside();
      return;
    }
    const tool = ({ b: 'lapis', p: 'lapis', e: 'borracha', g: 'balde', i: 'conta-gotas', h: 'mao' } as Record<string, StudioTool>)[k];
    if (tool && !e.shiftKey) {
      e.preventDefault();
      this.pickTool(tool);
      return;
    }
    if (/^[1-6]$/.test(e.key)) {
      e.preventDefault();
      this.zoomAt(ZOOM_KEYS[Number(e.key) - 1]);
      return;
    }
    if (k === 'x') {
      e.preventDefault();
      this.swapInks();
      return;
    }
    if (k === '[' || k === '9' || k === ']' || k === '0') {
      e.preventDefault();
      this.stepInk(k === '[' || k === '9' ? -1 : 1);
      return;
    }
    if (k === '-' || k === '+' || k === '=') {
      e.preventDefault();
      this.setBrush(this.brush() + (k === '-' ? -1 : 1));
      return;
    }
    if (k === 'c') {
      e.preventDefault();
      this.openSize();
      return;
    }
    if (k === 'a' || k === 'f4') {
      e.preventDefault();
      this.editInk();
      return;
    }
    if (!this.onBoard(e)) return;
    const step = ({ arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] } as Record<string, [number, number]>)[k];
    if (step) {
      e.preventDefault();
      const c = this.cursor();
      const n = e.shiftKey ? 8 : 1;
      const next = { x: Math.min(this.w() - 1, Math.max(0, c.x + step[0] * n)), y: Math.min(this.h() - 1, Math.max(0, c.y + step[1] * n)) };
      this.cursor.set(next);
      this.keyboard.set(true);
      this.sayCell(next);
      return;
    }
    if (k === 'enter' || k === 'delete' || k === 'backspace') {
      e.preventDefault();
      const c = this.clampCursor();
      this.keyboard.set(true);
      const tool = k === 'enter' ? this.tool() : 'borracha';
      this.press(c, tool === 'mao' ? 'lapis' : tool, false, e.shiftKey);
      this.endStroke();
      this.sayCell(c);
    }
  }

  protected onKeyUp(e: KeyboardEvent): void {
    if ((e.key === 'Alt' && this.held() === 'conta-gotas') || (e.key === ' ' && this.held() === 'mao')) {
      e.preventDefault();
      this.held.set(null);
    }
  }

  private onBoard(e: KeyboardEvent): boolean {
    return e.target === this.board().nativeElement;
  }

  /** Alt e as setas: o desenho todo anda um ponto (o que sai de um lado volta pelo outro). */
  private nudge(e: KeyboardEvent): void {
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!step) return;
    e.preventDefault();
    this.change({ rows: shiftGrid(this.rows(), step[0], step[1], this.w(), this.h()) }, 'Desenho empurrado');
  }

  private clampCursor(): Cell {
    const c = this.cursor();
    const next = { x: Math.min(c.x, this.w() - 1), y: Math.min(c.y, this.h() - 1) };
    this.cursor.set(next);
    return next;
  }

  private sayCell(c: Cell): void {
    this.said.set(`Linha ${c.y + 1}, coluna ${c.x + 1}: ${this.inkName(Math.max(0, inkIndex(this.rows()[c.y]?.[c.x] ?? '0')))}`);
  }

  // ===== a régua de cima =====

  protected pickTool(t: StudioTool): void {
    this.tool.set(t);
    this.said.set(this.TOOLS.find((o) => o.value === t)?.label ?? '');
  }

  protected setBrush(n: number): void {
    this.brush.set(Math.max(1, Math.min(BRUSH_MAX, n)));
    this.said.set(`Pincel de ${this.brush()}`);
  }

  protected toggleGrid(): void {
    this.grid8.update((v) => !v);
    this.said.set(this.grid8() ? 'Grade de 8 ligada' : 'Grade de 8 desligada');
  }

  protected toggleDots(): void {
    this.gridDots.update((v) => !v);
    this.said.set(this.gridDots() ? 'Fios dos pontos ligados' : 'Fios dos pontos desligados');
  }

  protected flipSide(): void {
    this.change({ rows: flipH(this.rows(), this.w(), this.h()) }, 'Desenho virado de lado');
  }

  protected flipUpside(): void {
    this.change({ rows: flipV(this.rows(), this.w(), this.h()) }, 'Desenho de cabeça para baixo');
  }

  protected clear(): void {
    this.change({ rows: blankGrid(this.w(), this.h()) }, 'Folha limpa');
  }

  /** O menu Imagem (o que mexe no desenho todo), no botão dele. */
  protected openImageMenu(e: MouseEvent): void {
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    this.imageMenu().show({ key: 'imagem', x: r.left, y: r.bottom + 4, back: btn, by: e.detail === 0 ? 'teclado' : 'mouse' });
  }

  protected readonly imageItems = computed<MenuSections>(() => [
    [
      { id: 'tamanho', label: 'Tamanho da tela…', icon: ICON.tamanhoDaTela, keys: 'C', dialog: true, run: () => this.openSize() },
      { id: 'lado', label: 'Virar de lado', icon: ICON.virarDeLado, keys: 'Shift+H', run: () => this.flipSide() },
      { id: 'cabeca', label: 'Virar de cabeça para baixo', icon: ICON.virarDeCabeca, keys: 'Shift+V', run: () => this.flipUpside() },
    ],
    [{ id: 'imagem', label: 'Trazer de uma imagem…', icon: ICON.imagem, run: () => this.chooseImage() }],
    [{ id: 'limpar', label: 'Limpar a folha', icon: ICON.apagar, danger: true, run: () => this.clear() }],
  ]);

  // ===== as cores =====

  /** Escolhe a cor da frente (ou a do fundo, `alt`); a borracha e o conta-gotas voltam para o lápis. */
  protected chooseInk(n: number, alt = false): void {
    if (alt) {
      this.bg.set(n);
      this.said.set(`Fundo: ${this.inkName(n)}`);
      return;
    }
    this.fg.set(n);
    if (this.tool() === 'borracha' || this.tool() === 'conta-gotas') this.tool.set('lapis');
    this.said.set(`Frente: ${this.inkName(n)}`);
  }

  protected swatchMenu(e: MouseEvent, n: number): void {
    e.preventDefault();
    this.chooseInk(n, true);
  }

  /** X: a cor da frente troca com a do fundo. */
  protected swapInks(): void {
    const f = this.fg();
    this.fg.set(this.bg());
    this.bg.set(f);
    this.said.set(`Frente: ${this.inkName(this.fg())}; fundo: ${this.inkName(this.bg())}`);
  }

  /** [ e ]: a cor anterior e a próxima da paleta (dando a volta). */
  protected stepInk(dir: 1 | -1): void {
    const n = this.count() + 1;
    this.chooseInk((((this.fg() + dir) % n) + n) % n);
  }

  /** A paleta escolhida: os números ficam (o desenho troca de cor junto, como no Aseprite). */
  protected setPalette(value: string): void {
    const p = paletteWord(value);
    if (!p || p === this.palette()) return;
    // as cores acrescentadas (as que passam da paleta de antes) continuam as mesmas; as trocadas, não
    const old = paletteColors(this.palette()).length;
    const kept: Record<number, string> = {};
    for (const [k, c] of Object.entries(this.colors())) if (Number(k) > old) kept[Number(k)] = c;
    this.change({ palette: p, colors: kept }, `Paleta ${PALETTES.find((x) => x.value === p)?.label ?? ''}`);
  }

  /** "+": uma cor nova no fim da paleta (a cópia da da frente), já escolhida e aberta para editar. */
  protected addInk(): void {
    const n = this.count() + 1;
    if (n > INK_MAX) return;
    const color = this.inks()[this.fg()] ?? '#808080';
    this.change({ colors: { ...this.colors(), [n]: color } }, `Cor ${inkChar(n)} acrescentada`);
    this.fg.set(n);
    this.editInk();
  }

  /** Abre o painel de editar a cor da frente (A, F4 ou dois toques na pastilha). */
  protected editInk(): void {
    if (this.fg() < 1) return;
    this.editing.set(true);
    this.colorsOpen.set(true);
  }

  /**
   * A cor escolhida no seletor (ou escrita no campo) vira a da frente: um passo do desfazer por edição. No
   * meio da escrita (`typing`), só a de seis letras vale: "#abc" viraria "#aabbcc" embaixo do dedo.
   */
  protected setInkColor(value: string, typing = false): void {
    const n = this.fg();
    const t = value.trim();
    if (typing && !/^#?[0-9a-f]{6}$/i.test(t)) return;
    const hex = normalHex(t.startsWith('#') ? t : '#' + t);
    if (n < 1 || !hex || hex === this.inks()[n]) return;
    if (!this.colorsBefore) this.colorsBefore = this.snap();
    this.colors.set({ ...this.colors(), [n]: hex });
    this.emit();
  }

  /** Terminou de editar (o seletor fechou, o campo perdeu o foco): o passo do desfazer entra. */
  protected inkEdited(): void {
    const before = this.colorsBefore;
    this.colorsBefore = null;
    if (before && !sameSnap(before, this.snap())) this.remember(before);
  }

  /** A cor trocada volta a ser a da paleta. */
  protected resetInk(): void {
    const n = this.fg();
    const { [n]: _, ...rest } = this.colors();
    this.change({ colors: rest }, `A ${this.inkName(n)} voltou à da paleta`);
  }

  protected openPicker(): void {
    const el = this.picker().nativeElement;
    el.value = this.inks()[this.fg()] ?? '#000000';
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // (sem o gesto que o navegador espera: o clique de sempre)
      }
    }
    el.click();
  }

  /** A cor da frente é trocada (diferente da paleta) e dá para voltar. */
  protected readonly fgSwapped = computed(() => {
    const n = this.fg();
    return n >= 1 && n <= paletteColors(this.palette()).length && !!this.colors()[n];
  });

  protected swatchTitle(n: number): string {
    return n === 0 ? 'Transparente (0)' : `Cor ${inkChar(n)} · ${this.inks()[n]}`;
  }

  // ===== o tamanho da tela (C) =====

  protected openSize(): void {
    this.sizing.set({ w: this.w(), h: this.h(), anchor: { x: 1, y: 1 } });
    afterNextRender(() => this.sizeSheet()?.nativeElement.showModal(), { injector: this.injector });
  }

  protected setSizing(p: Partial<{ w: number; h: number; anchor: Anchor }>): void {
    this.sizing.update((s) => (s ? { ...s, ...p } : s));
  }

  protected closeSize(): void {
    const el = this.sizeSheet()?.nativeElement;
    if (el?.open) el.close();
    this.sizing.set(null);
    this.board().nativeElement.focus({ preventScroll: true });
  }

  protected applySize(): void {
    const s = this.sizing();
    if (!s) return;
    const w = clampSide(s.w, this.w());
    const h = clampSide(s.h, this.h());
    const rows = resizeCanvas(this.rows(), this.w(), this.h(), w, h, s.anchor);
    this.change({ rows, w, h }, `Tela de ${w} por ${h} pontos`);
    this.closeSize();
    this.fit();
  }

  // ===== trazer de uma imagem =====

  protected chooseImage(): void {
    this.file().nativeElement.click();
  }

  protected fromFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.importImage(file);
  }

  /** Colar (Ctrl+V) ou soltar uma imagem na mesa: ela vira os pontos. */
  protected takeImage(e: ClipboardEvent | DragEvent): void {
    const file = imageFileOf(e instanceof ClipboardEvent ? e.clipboardData : e.dataTransfer);
    if (!file) return;
    e.preventDefault();
    void this.importImage(file);
  }

  protected dragOver(e: DragEvent): void {
    if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) e.preventDefault();
  }

  /**
   * A imagem encolhida até a tela de agora (inteira, no meio, sem deformar) e cada ponto na cor mais perto
   * das do desenho; o quase transparente fica transparente. Um passo no desfazer.
   */
  private async importImage(file: Blob): Promise<void> {
    if (this.importing()) return;
    this.importing.set(true);
    this.importError.set(null);
    try {
      const bitmap = await createImageBitmap(file);
      const w = this.w();
      const h = this.h();
      const fit = fitInGrid(bitmap.width, bitmap.height, w, h);
      const data = shrink(bitmap, fit.w, fit.h);
      bitmap.close();
      const part = quantize(data, fit.w, fit.h, drawingInks(this.palette(), this.colors()));
      const rows = blankGrid(w, h).map((row, y) => {
        const line = part[y - fit.y];
        return line === undefined ? row : row.slice(0, fit.x) + line + row.slice(fit.x + line.length);
      });
      this.change({ rows }, `Imagem trazida para ${w} por ${h} pontos, nas cores de agora`);
    } catch {
      this.importError.set('Essa imagem não abriu. Tente outra (PNG, JPG, WebP, GIF).');
      this.said.set('Essa imagem não abriu.');
    } finally {
      this.importing.set(false);
    }
  }

  // ===== o que a mesa desenha =====

  /** Os fios entre os pontos (os de dentro, sem a beirada), os que `keep` aceita pelo número deles. */
  protected readonly dotLines = computed(() => gridLines(this.w(), this.h(), (i) => i % 8 !== 0 || !this.grid8()));
  protected readonly majorLines = computed(() => (this.grid8() ? gridLines(this.w(), this.h(), (i) => i % 8 === 0) : ''));
  /** A mira: os pontos que o toque pinta (o pincel, com a simetria). */
  protected readonly aim = computed(() => {
    const c = this.hover();
    const t = this.active();
    if (!c || t === 'mao') return [];
    if (t === 'conta-gotas' || t === 'balde') return [c];
    return this.cover([c]);
  });
  /** O eixo da simetria, nas contas da folha. */
  protected readonly axes = computed(() => {
    const s = this.symmetry();
    return { v: s === 'lado' || s === 'ambas', h: s === 'cima' || s === 'ambas' };
  });

  /** Os números das réguas: a cada passo que cabe (1, 2, 4, 8 ou 16 pontos), conforme o zoom. */
  protected readonly rulerStep = computed(() => [1, 2, 4, 8, 16].find((s) => s * this.zoom() >= 28) ?? 16);
  protected readonly rulerX = computed(() => ticks(this.w(), this.rulerStep()));
  protected readonly rulerY = computed(() => ticks(this.h(), this.rulerStep()));

  /** A cor debaixo do mouse, para a barra de estado. */
  protected readonly under = computed(() => {
    const c = this.hover();
    if (!c) return null;
    const n = Math.max(0, inkIndex(this.rows()[c.y]?.[c.x] ?? '0'));
    return { n, color: this.inks()[n] };
  });

  /** O que os modificadores fazem na ferramenta de agora, na barra de estado. */
  protected readonly hint = computed(() => {
    switch (this.active()) {
      case 'lapis':
        return 'Shift: reta desde o último ponto · Alt: conta-gotas · Espaço: arrastar a vista';
      case 'borracha':
        return 'Apaga para o transparente · Shift: reta desde o último ponto · Espaço: arrastar a vista';
      case 'balde':
        return this.contiguous() ? 'Pinta a mancha da mesma cor · o direito, com a cor do fundo' : 'Pinta toda a cor, em qualquer lugar · o direito, com a do fundo';
      case 'conta-gotas':
        return 'Esquerdo: a cor da frente · direito: a do fundo';
      default:
        return 'Arraste para mover a vista · a roda aproxima';
    }
  });

  /** A prévia: o desenho no maior tamanho inteiro (1×, 2×, 3×…) que cabe em 112 pontos de tela. */
  protected readonly previewScale = computed(() => Math.max(1, Math.floor(112 / Math.max(this.w(), this.h()))));

  /** O nome de um ponto da âncora, para quem não vê: "em cima, à esquerda", "no meio". */
  protected anchorName(a: Anchor): string {
    const v = ['em cima', 'no meio', 'embaixo'][a.y];
    const h = ['à esquerda', 'no meio', 'à direita'][a.x];
    return a.x === 1 && a.y === 1 ? 'No meio' : a.x === 1 ? cap(v) + ', no meio' : a.y === 1 ? 'No meio, ' + h : cap(v) + ', ' + h;
  }

  protected readonly label = computed(() => `Folha de ${this.w()} por ${this.h()} pontos. Setas andam; Enter pinta com a ${this.inkName(this.fg())}.`);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Os bytes RGBA da imagem encolhida para `w` × `h`, pela metade a cada passo até chegar. */
function shrink(image: ImageBitmap, w: number, h: number): Uint8ClampedArray {
  let src: CanvasImageSource = image;
  let sw = image.width;
  let sh = image.height;
  while (sw / 2 >= w * 2 && sh / 2 >= h * 2) {
    const half = document.createElement('canvas');
    half.width = Math.round(sw / 2);
    half.height = Math.round(sh / 2);
    const ctx = half.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, half.width, half.height);
    [src, sw, sh] = [half, half.width, half.height];
  }
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function sameRows(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((r, i) => r === b[i]));
}

function sameSnap(a: Snap, b: Snap): boolean {
  return a.w === b.w && a.h === b.h && a.palette === b.palette && sameRows(a.rows, b.rows) && JSON.stringify(a.colors) === JSON.stringify(b.colors);
}

function gridLines(w: number, h: number, keep: (i: number) => boolean): string {
  let d = '';
  for (let x = 1; x < w; x++) if (keep(x)) d += `M${x} 0V${h}`;
  for (let y = 1; y < h; y++) if (keep(y)) d += `M0 ${y}H${w}`;
  return d;
}

/** Os números de uma régua: 0, passo, 2 × passo… até o fim. */
function ticks(n: number, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i += step) out.push(i);
  return out;
}
