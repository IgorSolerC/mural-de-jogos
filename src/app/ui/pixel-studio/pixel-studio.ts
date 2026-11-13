import { NgTemplateOutlet } from '@angular/common';
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
import { Anchor, BRUSH_MAX, BrushShape, Symmetry, ZOOMS, ZOOM_KEYS, convertRows, medianCut, moveInk, removeInk, sortInks, ellipseCells, fitZoom, mirrored, perfectCorner, rectCells, replaceInk, resizeCanvas, shapeBox, snapLine, stampCells, stepZoom, zoomLabel } from '../../core/pixel-tools';
import { Float, Mask, combineMask, composite, flipMask, flipRows, invertMask, lift, maskAny, maskBounds, maskOutline, outline, placedMask, rectMask, rotateMask, rotateRows, wandMask } from '../../core/pixel-selection';
import { WidgetValues } from '../../core/widgets';
import { imageFileOf } from '../../core/images';
import { ContextMenu, MenuSections } from '../context-menu';
import { PaletteSheet } from './palette-sheet';
import { ICON, IconModule } from '../icons';

/** As ferramentas do ateliê (as que pintam e a mão). */
export type StudioTool = 'selecao' | 'varinha' | 'mover' | 'lapis' | 'borracha' | 'balde' | 'conta-gotas' | 'linha' | 'retangulo' | 'elipse' | 'mao';

/** As ferramentas que puxam uma forma (a reta, o retângulo, a elipse). */
const SHAPES: readonly StudioTool[] = ['linha', 'retangulo', 'elipse'];

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
  | { kind: 'forma'; tool: StudioTool; ink: number; from: Cell; to: Cell; square: boolean; center: boolean; before: string[] }
  | { kind: 'sel'; from: Cell; to: Cell; mode: 'trocar' | 'somar' | 'tirar'; base: Mask | null }
  | { kind: 'mov'; from: Cell; x: number; y: number }
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
  imports: [ContextMenu, IconModule, NgTemplateOutlet, PaletteSheet],
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
  private readonly colorsMenu = viewChild.required<ContextMenu>('menuCores');

  protected readonly ids = 'at-' + ++uid;
  protected readonly I = ICON;
  protected readonly inkChar = inkChar;
  protected readonly zoomLabel = zoomLabel;
  protected readonly TOOLS: readonly { value: StudioTool; label: string; key: string; icon: typeof ICON.editar }[] = [
    { value: 'selecao', label: 'Seleção', key: 'M', icon: ICON.semDesenho },
    { value: 'varinha', label: 'Varinha', key: 'W', icon: ICON.varinha },
    { value: 'mover', label: 'Mover', key: 'V', icon: ICON.mover },
    { value: 'lapis', label: 'Lápis', key: 'B', icon: ICON.editar },
    { value: 'borracha', label: 'Borracha', key: 'E', icon: ICON.borracha },
    { value: 'balde', label: 'Balde', key: 'G', icon: ICON.balde },
    { value: 'conta-gotas', label: 'Conta-gotas', key: 'I', icon: ICON.contaGotas },
    { value: 'linha', label: 'Linha', key: 'L', icon: ICON.reta },
    { value: 'retangulo', label: 'Retângulo', key: 'U', icon: ICON.desmarcado },
    { value: 'elipse', label: 'Elipse', key: 'Shift+U', icon: ICON.circulo },
    { value: 'mao', label: 'Mão', key: 'H', icon: ICON.aMao },
  ];
  protected readonly SYMMETRIES: readonly { value: Symmetry; label: string }[] = [
    { value: 'nenhuma', label: 'Nenhuma' },
    { value: 'lado', label: 'De lado' },
    { value: 'cima', label: 'De cima' },
    { value: 'ambas', label: 'As duas' },
  ];
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
  /** O retângulo e a elipse cheios (U e Shift+U de novo alternam, como no Aseprite). */
  protected readonly filled = signal(false);
  /** Os pontos escolhidos (a seleção); null, nenhum. */
  protected readonly sel = signal<Mask | null>(null);
  /** O pedaço solto (movido, colado, virado): os pontos de baixo ficam em `base` até ele assentar. */
  protected readonly float = signal<Float | null>(null);
  /** As formigas: a beirada da seleção (ou do pedaço, onde ele está). */
  protected readonly ants = computed(() => {
    const f = this.float();
    if (f) return maskOutline(f.mask, f.x, f.y);
    const s = this.sel();
    return s ? maskOutline(s) : '';
  });
  /** O tamanho da seleção, para a barra de estado. */
  protected readonly selSize = computed(() => {
    const f = this.float();
    if (f) return `${f.mask.w} × ${f.mask.h}`;
    const s = this.sel();
    const b = s && maskBounds(s);
    return b ? `${b.w} × ${b.h}` : null;
  });
  protected readonly hasSel = computed(() => !!this.float() || this.selActive());
  /** A seleção tem algum ponto (contado uma vez, não a cada ponto pintado). */
  private readonly selActive = computed(() => maskAny(this.sel()));
  /** O tamanho da forma sendo puxada, para a barra de estado ("8 × 4"). */
  protected readonly shapeSize = signal<string | null>(null);

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
  /** A folha das paletas aberta. */
  protected readonly paletteOpen = signal(false);
  /** A pastilha sendo arrastada para outro lugar (o número dela). */
  protected readonly dragging = signal<number | null>(null);
  /** O Tamanho da tela (C): os campos e a âncora, enquanto a folha dele está aberta. */
  protected readonly sizing = signal<{ w: number; h: number; anchor: Anchor } | null>(null);

  /** A tela debaixo do pedaço solto, e o desenho de antes de ele soltar (o passo do desfazer). */
  private base: string[] | null = null;
  private floatBefore: Snap | null = null;
  /** A última seleção tirada (Ctrl+Shift+D a traz de volta). */
  private lastSel: Mask | null = null;
  /** O que o Ctrl+C e o Ctrl+X guardaram (o pedaço, onde ele estava). */
  private clip: Float | null = null;
  protected readonly hasClip = signal(false);
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
    this.float.set(null);
    this.base = null;
    this.floatBefore = null;
    if (s.w !== this.w() || s.h !== this.h()) this.sel.set(null);
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
    this.anchor();
    const before = this.snap();
    const after = { ...before, ...next };
    if (sameSnap(before, after)) return;
    this.remember(before);
    this.restore(after);
    this.said.set(said);
  }

  protected undo(): void {
    // (no meio de um traço, ele termina antes: o desfazer volta o traço inteiro; o pedaço solto assenta)
    this.endStroke();
    this.anchor();
    const prev = this.undos.pop();
    if (!prev) return;
    this.redos.push(this.snap());
    this.restore(prev);
    this.said.set('Desfeito');
  }

  protected redo(): void {
    this.endStroke();
    this.anchor();
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
    const t = this.active();
    const size = t === 'lapis' || t === 'borracha' || SHAPES.includes(t) ? this.brush() : 1;
    return mirrored(stampCells(path, size, this.shape()), this.symmetry(), this.w(), this.h()).filter((c) => this.paintable(c));
  }

  /** O ponto pode ser pintado: dentro da tela e, com uma seleção, dentro dela (como no Aseprite). */
  private paintable(c: Cell): boolean {
    if (c.x < 0 || c.y < 0 || c.x >= this.w() || c.y >= this.h()) return false;
    const s = this.sel();
    return !s || !this.selActive() || s.bits[c.y * s.w + c.x] === 1;
  }

  /** O nome de uma cor, como se fala: "transparente", "cor b". */
  protected inkName(n: number): string {
    return n === 0 ? 'transparente' : `cor ${inkChar(n)}`;
  }

  /** O ponto debaixo do toque, com a ferramenta dada; `alt`: o botão direito (a cor do fundo). */
  private press(c: Cell, tool: StudioTool, alt: boolean, shift: boolean, mod = false, shiftAlt = false): void {
    const ink = alt ? this.bg() : this.fg();
    if (tool === 'selecao' || tool === 'varinha' || tool === 'mover') {
      this.pressSelection(c, tool, shift, shiftAlt, mod);
      return;
    }
    // pintar assenta o pedaço solto (a seleção continua, no lugar dele)
    this.anchor();
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
      if (!this.paintable(c)) return;
      const before = this.rows();
      let rows = before;
      for (const at of mirrored([c], this.symmetry(), this.w(), this.h())) rows = this.contiguous() ? floodFill(rows, at, ink, this.w(), this.h()) : replaceInk(rows, at, ink, this.w(), this.h());
      // com uma seleção, o balde não passa dela
      rows = rows.map((r, y) => [...r].map((ch, x) => (this.paintable({ x, y }) ? ch : before[y][x])).join(''));
      this.change({ rows }, `Balde de ${this.inkName(ink)}`);
      return;
    }
    if (SHAPES.includes(tool)) {
      this.drag = { kind: 'forma', tool, ink, from: c, to: c, square: shift, center: false, before: this.rows() };
      this.shapeAt(c, shift, false);
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

  /** A forma puxada até `to`: desenhada por cima dos pontos de antes dela (a prévia é o resultado). */
  private shapeAt(to: Cell, square: boolean, center: boolean): void {
    const d = this.drag;
    if (d?.kind !== 'forma') return;
    Object.assign(d, { to, square, center });
    let path: Cell[];
    if (d.tool === 'linha') {
      const end = square ? snapLine(d.from, to) : to;
      const from = center ? { x: 2 * d.from.x - end.x, y: 2 * d.from.y - end.y } : d.from;
      path = lineCells(from, end);
      this.shapeSize.set(`${Math.abs(end.x - from.x) + 1} × ${Math.abs(end.y - from.y) + 1}`);
    } else {
      const b = shapeBox(d.from, to, square, center);
      const fill = this.filled();
      path = d.tool === 'retangulo' ? rectCells(b.x0, b.y0, b.x1, b.y1, fill) : ellipseCells(b.x0, b.y0, b.x1, b.y1, fill);
      this.shapeSize.set(`${b.x1 - b.x0 + 1} × ${b.y1 - b.y0 + 1}`);
    }
    // (cheia, a forma é a caixa: o pincel engrossaria a beirada para fora dela)
    const cells = d.tool !== 'linha' && this.filled() ? mirrored(path, this.symmetry(), this.w(), this.h()).filter((c) => this.inside(c)) : this.cover(path);
    const rows = paintCells(d.before, cells, d.ink);
    if (!sameRows(rows, this.rows())) {
      this.rows.set(rows);
      this.emit();
    }
  }

  /** O Shift ou o Ctrl apertado (ou solto) com a forma na mão: ela muda na hora, sem esperar o mouse andar. */
  private shapeKeys(e: KeyboardEvent): boolean {
    const d = this.drag;
    if (d?.kind !== 'forma' || (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Meta')) return false;
    this.shapeAt(d.to, e.shiftKey, e.ctrlKey || e.metaKey);
    return true;
  }

  /** Termina o arrasto: um passo só no desfazer (se mudou alguma coisa). */
  private endStroke(): void {
    const d = this.drag;
    this.drag = null;
    this.shapeSize.set(null);
    // um clique sem arrastar, com a Seleção, tira a seleção (como no Aseprite)
    if (d?.kind === 'sel' && d.mode === 'trocar' && d.from.x === d.to.x && d.from.y === d.to.y) this.deselect();
    if ((d?.kind === 'pinta' || d?.kind === 'forma') && !sameRows(d.before, this.rows())) this.remember({ ...this.snap(), rows: d.before });
  }

  /** Desfaz o arrasto de agora sem guardar nada (o segundo dedo chegou: era um gesto, não um traço). */
  private cancelStroke(): void {
    const d = this.drag;
    this.drag = null;
    // a seleção puxada pela metade volta a ser a de antes; o pedaço que andava volta ao lugar
    if (d?.kind === 'sel') this.sel.set(d.base);
    if (d?.kind === 'mov') {
      const f = this.float();
      if (f) this.placeFloat({ ...f, x: d.x, y: d.y });
    }
    this.shapeSize.set(null);
    if ((d?.kind === 'pinta' || d?.kind === 'forma') && !sameRows(d.before, this.rows())) {
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
    this.press(c, this.active(), e.button === 2, e.shiftKey, e.ctrlKey || e.metaKey, e.shiftKey && e.altKey);
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
    } else if ((d.kind === 'sel' || d.kind === 'mov') && e.pointerId === this.strokePointer) {
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        this.pointers.delete(e.pointerId);
        this.endStroke();
        return;
      }
      if (d.kind === 'sel') {
        if (c.x === d.to.x && c.y === d.to.y) return;
        d.to = c;
        this.sel.set(combineMask(d.base, rectMask(this.w(), this.h(), d.from, c), d.mode));
      } else {
        const f = this.float();
        if (!f) return;
        const x = d.x + c.x - d.from.x;
        const y = d.y + c.y - d.from.y;
        if (x !== f.x || y !== f.y) this.placeFloat({ ...f, x, y });
      }
    } else if (d.kind === 'forma' && e.pointerId === this.strokePointer) {
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        this.pointers.delete(e.pointerId);
        this.endStroke();
        return;
      }
      const center = e.ctrlKey || e.metaKey;
      if (c.x !== d.to.x || c.y !== d.to.y || e.shiftKey !== d.square || center !== d.center) this.shapeAt(c, e.shiftKey, center);
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
    if (this.shapeKeys(e)) return;
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
      } else if (k === 'a') {
        e.preventDefault();
        this.selectAll();
      } else if (k === 'd') {
        e.preventDefault();
        if (e.shiftKey) this.reselect();
        else this.deselect();
      } else if (k === 'i' && e.shiftKey) {
        e.preventDefault();
        this.invertSel();
      } else if (k === 'c' || k === 'x') {
        if (!this.hasSel()) return;
        e.preventDefault();
        this.copySel(k === 'x');
      } else if (k === "'" || k === '"' || e.code === 'Quote') {
        e.preventDefault();
        if (e.shiftKey) this.toggleDots();
        else this.toggleGrid();
      }
      return;
    }
    if (e.key === 'Alt') {
      // o conta-gotas enquanto segura (e o menu do navegador não abre); com o Shift, na seleção, é o "tirar"
      e.preventDefault();
      const selecting = this.tool() === 'selecao' || this.tool() === 'varinha';
      if (!e.repeat && !this.drag && !(selecting && e.shiftKey)) this.held.set('conta-gotas');
      return;
    }
    if (e.key === 'Escape' && (this.float() || maskAny(this.sel()))) {
      // o Esc solta a seleção antes de fechar o ateliê
      e.preventDefault();
      this.deselect();
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
    // U: o retângulo (de novo, cheio ou não); Shift+U: a elipse; L: a linha
    if (k === 'u') {
      e.preventDefault();
      const t: StudioTool = e.shiftKey ? 'elipse' : 'retangulo';
      if (this.tool() === t) this.toggleFilled();
      else this.pickTool(t);
      return;
    }
    if (k === 'l' && !e.shiftKey) {
      e.preventDefault();
      this.pickTool('linha');
      return;
    }
    if (e.shiftKey && (k === 'h' || k === 'v')) {
      e.preventDefault();
      if (k === 'h') this.flipSide();
      else this.flipUpside();
      return;
    }
    if (e.shiftKey && k === 'o') {
      e.preventDefault();
      this.outlineInk();
      return;
    }
    const tool = ({ m: 'selecao', w: 'varinha', v: 'mover', b: 'lapis', p: 'lapis', e: 'borracha', g: 'balde', i: 'conta-gotas', h: 'mao' } as Record<string, StudioTool>)[k];
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
    if ((k === 'delete' || k === 'backspace') && this.hasSel()) {
      e.preventDefault();
      this.clearSel();
      return;
    }
    if (k === 'enter' && this.float()) {
      e.preventDefault();
      this.anchor();
      this.said.set('Pedaço assentado');
      return;
    }
    if (!this.onBoard(e)) return;
    const step = ({ arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] } as Record<string, [number, number]>)[k];
    if (step && this.hasSel()) {
      // as setas movem o que está escolhido (Shift: de 8 em 8)
      e.preventDefault();
      this.nudgeSel(step[0] * (e.shiftKey ? 8 : 1), step[1] * (e.shiftKey ? 8 : 1));
      return;
    }
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
      this.press(c, tool === 'mao' || tool === 'mover' ? 'lapis' : tool, false, e.shiftKey);
      this.endStroke();
      this.sayCell(c);
    }
  }

  protected onKeyUp(e: KeyboardEvent): void {
    if (this.shapeKeys(e)) return;
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

  protected toggleFilled(): void {
    this.filled.update((v) => !v);
    this.said.set(this.filled() ? 'Forma cheia' : 'Só a beirada da forma');
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
    if (this.transformSel((f) => ({ ...f, rows: flipRows(f.rows, 'h'), mask: flipMask(f.mask, 'h') }), 'Seleção virada de lado')) return;
    this.change({ rows: flipH(this.rows(), this.w(), this.h()) }, 'Desenho virado de lado');
  }

  protected flipUpside(): void {
    if (this.transformSel((f) => ({ ...f, rows: flipRows(f.rows, 'v'), mask: flipMask(f.mask, 'v') }), 'Seleção de cabeça para baixo')) return;
    this.change({ rows: flipV(this.rows(), this.w(), this.h()) }, 'Desenho de cabeça para baixo');
  }

  /** Girar: a seleção (no meio de onde estava) ou a tela inteira (a largura troca com a altura). */
  protected rotate(dir: 'cw' | 'ccw' | '180'): void {
    const said = dir === 'cw' ? 'girado 90° para a direita' : dir === 'ccw' ? 'girado 90° para a esquerda' : 'girado 180°';
    const moved = this.transformSel((f) => {
      const mask = rotateMask(f.mask, dir);
      return { x: f.x + Math.floor((f.mask.w - mask.w) / 2), y: f.y + Math.floor((f.mask.h - mask.h) / 2), rows: rotateRows(f.rows, dir), mask };
    }, `Seleção ${said}`);
    if (moved) return;
    const rows = rotateRows(this.rows(), dir);
    this.change({ rows, w: rows[0]?.length ?? this.w(), h: rows.length }, `Desenho ${said}`);
    if (dir !== '180') this.fit();
  }

  /** Shift+O: o contorno com a cor da frente em volta do que está pintado (só na seleção, se tiver). */
  protected outlineInk(): void {
    if (this.fg() === 0) {
      this.said.set('Escolha uma cor para o contorno');
      return;
    }
    this.anchor();
    this.change({ rows: outline(this.rows(), this.w(), this.h(), this.fg(), maskAny(this.sel()) ? this.sel() : null) }, `Contorno de ${this.inkName(this.fg())}`);
  }

  /** A tela do tamanho da seleção (Recortar na seleção). */
  protected cropToSel(): void {
    this.anchor();
    const s = this.sel();
    const b = s && maskBounds(s);
    if (!b) return;
    const rows = this.rows()
      .slice(b.y, b.y + b.h)
      .map((r) => r.slice(b.x, b.x + b.w));
    this.change({ rows, w: b.w, h: b.h }, `Tela recortada em ${b.w} por ${b.h}`);
    this.sel.set(null);
    this.fit();
  }

  // ===== a seleção =====

  /** O toque com a Seleção, a Varinha ou o Mover. */
  private pressSelection(c: Cell, tool: StudioTool, shift: boolean, shiftAlt: boolean, copy: boolean): void {
    const mode = shiftAlt ? 'tirar' : shift ? 'somar' : 'trocar';
    const s = this.sel();
    const insideSel = (m: Mask | null) => !!m && this.inside(c) && m.bits[c.y * m.w + c.x] === 1;
    const f = this.float();
    const onFloat = !!f && c.x >= f.x && c.y >= f.y && c.x < f.x + f.mask.w && c.y < f.y + f.mask.h && f.mask.bits[(c.y - f.y) * f.mask.w + c.x - f.x] === 1;
    // o Mover (em qualquer lugar: o que está escolhido anda), ou a Seleção puxada de dentro dela; com o Ctrl, uma cópia
    if (tool === 'mover' || (tool === 'selecao' && mode === 'trocar' && (onFloat || (!f && insideSel(s))))) {
      if (!this.liftSel(copy)) return;
      const lifted = this.float()!;
      this.drag = { kind: 'mov', from: c, x: lifted.x, y: lifted.y };
      return;
    }
    this.anchor();
    if (tool === 'varinha') {
      if (!this.inside(c)) return;
      this.sel.set(combineMask(s, wandMask(this.rows(), this.w(), this.h(), c, this.contiguous()), mode));
      this.said.set('Mancha escolhida');
      return;
    }
    this.drag = { kind: 'sel', from: c, to: c, mode, base: s };
    this.sel.set(combineMask(s, rectMask(this.w(), this.h(), c, c), mode));
  }

  /**
   * Solta o que está escolhido (ou a tela inteira, sem seleção) num pedaço que flutua por cima: a tela fica
   * com o buraco (ou sem ele, `copy`). Já solto, continua o mesmo. False: não há nada para soltar.
   */
  private liftSel(copy: boolean): boolean {
    if (this.float()) return true;
    const s = this.sel();
    const all = rectMask(this.w(), this.h(), { x: 0, y: 0 }, { x: this.w() - 1, y: this.h() - 1 });
    const m = maskAny(s) ? s : all;
    const out = lift(this.rows(), m, copy);
    if (!out) return false;
    this.floatBefore = this.snap();
    this.base = out.base;
    this.placeFloat(out.float);
    return true;
  }

  /** O pedaço solto num lugar novo (ou virado): a folha mostra a tela com ele por cima. */
  private placeFloat(f: Float): void {
    this.float.set(f);
    this.rows.set(composite(this.base ?? this.rows(), f));
    this.emit();
  }

  /** Vira, gira… o pedaço solto (soltando a seleção antes, se precisa). False: não há seleção. */
  private transformSel(fn: (f: Float) => Float, said: string): boolean {
    if (!this.hasSel()) return false;
    if (!this.liftSel(false)) return false;
    this.placeFloat(fn(this.float()!));
    this.said.set(said);
    return true;
  }

  /** O pedaço solto assenta na tela (um passo do desfazer, se mudou algo); a seleção fica onde ele ficou. */
  protected anchor(): void {
    const f = this.float();
    if (!f) return;
    this.sel.set(placedMask(f, this.w(), this.h()));
    this.float.set(null);
    this.base = null;
    const before = this.floatBefore;
    this.floatBefore = null;
    if (before && !sameSnap(before, this.snap())) this.remember(before);
  }

  protected selectAll(): void {
    this.anchor();
    this.sel.set(rectMask(this.w(), this.h(), { x: 0, y: 0 }, { x: this.w() - 1, y: this.h() - 1 }));
    this.said.set('Tudo escolhido');
  }

  protected deselect(): void {
    this.anchor();
    if (maskAny(this.sel())) this.lastSel = this.sel();
    this.sel.set(null);
    this.said.set('Seleção tirada');
  }

  protected reselect(): void {
    const m = this.lastSel;
    if (!m || m.w !== this.w() || m.h !== this.h()) return;
    this.anchor();
    this.sel.set(m);
    this.said.set('Seleção de volta');
  }

  protected invertSel(): void {
    this.anchor();
    const s = this.sel();
    this.sel.set(maskAny(s) ? invertMask(s) : rectMask(this.w(), this.h(), { x: 0, y: 0 }, { x: this.w() - 1, y: this.h() - 1 }));
    this.said.set('Seleção invertida');
  }

  /** Delete: o que está escolhido vira transparente (o pedaço solto some). */
  protected clearSel(): void {
    const f = this.float();
    if (f) {
      const before = this.floatBefore;
      this.rows.set(this.base ?? this.rows());
      this.float.set(null);
      this.base = null;
      this.floatBefore = null;
      this.emit();
      if (before && !sameSnap(before, this.snap())) this.remember(before);
      this.said.set('Pedaço apagado');
      return;
    }
    const s = this.sel();
    if (!maskAny(s)) return;
    this.change({ rows: this.rows().map((r, y) => [...r].map((ch, x) => (s.bits[y * s.w + x] ? '0' : ch)).join('')) }, 'Seleção apagada');
  }

  /** As setas com a seleção: o pedaço anda (soltando antes, se precisa). */
  private nudgeSel(dx: number, dy: number): void {
    if (!this.liftSel(false)) return;
    const f = this.float()!;
    this.placeFloat({ ...f, x: f.x + dx, y: f.y + dy });
    this.said.set(`Seleção em ${f.x + dx}, ${f.y + dy}`);
  }

  /** Ctrl+C e Ctrl+X: o pedaço escolhido guardado para colar (recortar deixa o buraco). */
  protected copySel(cut: boolean): void {
    const f = this.float();
    if (f) this.clip = { ...f, rows: [...f.rows] };
    else {
      const s = this.sel();
      const all = rectMask(this.w(), this.h(), { x: 0, y: 0 }, { x: this.w() - 1, y: this.h() - 1 });
      this.clip = lift(this.rows(), maskAny(s) ? s : all, true)?.float ?? null;
    }
    this.hasClip.set(!!this.clip);
    if (cut) this.clearSel();
    this.said.set(cut ? 'Recortado' : 'Copiado');
  }

  /** Ctrl+V: o pedaço guardado solto no lugar de onde veio (dentro da tela), pronto para mover. */
  protected pasteClip(): void {
    const c = this.clip;
    if (!c) return;
    this.anchor();
    this.sel.set(null);
    const x = Math.max(0, Math.min(c.x, this.w() - c.mask.w));
    const y = Math.max(0, Math.min(c.y, this.h() - c.mask.h));
    this.floatBefore = this.snap();
    this.base = this.rows();
    this.placeFloat({ ...c, x, y });
    this.tool.set('mover');
    this.said.set('Colado: arraste ou use as setas, e Enter para assentar');
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

  protected readonly imageItems = computed<MenuSections>(() => {
    const sel = this.hasSel();
    const what = sel ? 'a seleção' : 'o desenho';
    return [
      [
        { id: 'tamanho', label: 'Tamanho da tela…', icon: ICON.tamanhoDaTela, keys: 'C', dialog: true, run: () => this.openSize() },
        ...(sel ? [{ id: 'recortar-tela', label: 'Recortar na seleção', icon: ICON.recortarTela, run: () => this.cropToSel() }] : []),
      ],
      [
        { id: 'lado', label: 'Virar de lado', hint: `Vira ${what}`, icon: ICON.virarDeLado, keys: 'Shift+H', run: () => this.flipSide() },
        { id: 'cabeca', label: 'Virar de cabeça para baixo', hint: `Vira ${what}`, icon: ICON.virarDeCabeca, keys: 'Shift+V', run: () => this.flipUpside() },
        { id: 'direita', label: 'Girar 90° para a direita', hint: `Gira ${what}`, icon: ICON.girarDireita, run: () => this.rotate('cw') },
        { id: 'esquerda', label: 'Girar 90° para a esquerda', hint: `Gira ${what}`, icon: ICON.girarEsquerda, run: () => this.rotate('ccw') },
        { id: 'meia-volta', label: 'Girar 180°', hint: `Gira ${what}`, icon: ICON.girarMeiaVolta, run: () => this.rotate('180') },
        { id: 'contorno', label: 'Contorno com a cor da frente', icon: ICON.moldura, keys: 'Shift+O', run: () => this.outlineInk() },
      ],
      [
        { id: 'tudo', label: 'Selecionar tudo', icon: ICON.semDesenho, keys: 'Ctrl+A', run: () => this.selectAll() },
        ...(sel
          ? [
              { id: 'copiar', label: 'Copiar', icon: ICON.copiar, keys: 'Ctrl+C', run: () => this.copySel(false) },
              { id: 'recortar', label: 'Recortar', icon: ICON.tesoura, keys: 'Ctrl+X', run: () => this.copySel(true) },
              { id: 'inverter', label: 'Inverter a seleção', icon: ICON.trocarCores, keys: 'Ctrl+Shift+I', run: () => this.invertSel() },
              { id: 'tirar', label: 'Tirar a seleção', icon: ICON.fechar, keys: 'Ctrl+D', run: () => this.deselect() },
            ]
          : []),
        ...(this.hasClip() ? [{ id: 'colar', label: 'Colar', icon: ICON.colar, keys: 'Ctrl+V', run: () => this.pasteClip() }] : []),
      ],
      [
        { id: 'imagem', label: 'Trazer de uma imagem…', hint: 'Nas cores de agora', icon: ICON.imagem, run: () => this.chooseImage() },
        { id: 'imagem-cores', label: 'Trazer, com as cores dela…', hint: 'Cria a paleta com as cores da imagem', icon: ICON.paleta, run: () => this.chooseImage(true) },
      ],
      [{ id: 'limpar', label: 'Limpar a folha', icon: ICON.apagar, danger: true, run: () => this.clear() }],
    ];
  });

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

  /** A paleta escolhida na folha: mantendo os números (`setPalette`) ou as cores (cada uma na mais perto). */
  protected applyPalette(p: { palette: PaletteName; convert: boolean }): void {
    if (!p.convert) {
      this.setPalette(p.palette);
      return;
    }
    if (p.palette === this.palette() && !Object.keys(this.colors()).length) return;
    const rows = convertRows(this.rows(), drawingInks(this.palette(), this.colors()), drawingInks(p.palette, {}));
    this.change({ rows, palette: p.palette, colors: {} }, `Paleta ${PALETTES.find((x) => x.value === p.palette)?.label ?? ''}, com as cores mais perto`);
  }

  /**
   * Uma mudança na ordem ou no tamanho da paleta: ela vira a própria (todas as cores escritas). A cor do fundo
   * segue a dela para o número novo (a que saiu vira o transparente).
   */
  private ownPalette(out: { rows: string[]; colors: Record<number, string> }, said: string): void {
    const bgColor = this.bg() > 0 ? this.inks()[this.bg()] : null;
    this.change({ rows: out.rows, palette: 'propria', colors: out.colors }, said);
    if (bgColor) {
      const at = Object.entries(out.colors).find(([, c]) => c === bgColor)?.[0];
      this.bg.set(at ? Number(at) : 0);
    }
  }

  /** Tira a cor da frente: os pontos dela ficam transparentes e as de depois descem um número. */
  protected removeFg(): void {
    const n = this.fg();
    if (n < 1 || this.count() <= 1) return;
    this.ownPalette(removeInk(this.rows(), drawingInks(this.palette(), this.colors()), n), `A ${this.inkName(n)} saiu da paleta`);
    this.fg.set(Math.min(n, this.count()));
    this.editing.set(false);
  }

  /** Leva a cor da frente um lugar para trás ou para a frente (o desenho não muda). */
  protected moveFg(dir: 1 | -1): void {
    const n = this.fg();
    const to = n + dir;
    if (n < 1 || to < 1 || to > this.count()) return;
    this.moveSwatch(n, to);
  }

  private moveSwatch(from: number, to: number): void {
    if (from === to) return;
    this.ownPalette(moveInk(this.rows(), drawingInks(this.palette(), this.colors()), from, to), `A cor ${inkChar(from)} agora é a ${inkChar(to)}`);
    if (this.fg() === from) this.fg.set(to);
  }

  /** Ordena a paleta pela luz ou pelo tom (o desenho não muda). */
  protected sortPalette(by: 'luz' | 'tom'): void {
    const fgColor = this.inks()[this.fg()];
    this.ownPalette(sortInks(this.rows(), drawingInks(this.palette(), this.colors()), by), by === 'luz' ? 'Paleta pela luz' : 'Paleta pelo tom');
    const at = this.inks().indexOf(fgColor ?? null, 1);
    if (at > 0) this.fg.set(at);
  }

  // arrastar uma pastilha para outro lugar
  protected swatchDragStart(e: DragEvent, n: number): void {
    if (n < 1) return;
    this.dragging.set(n);
    e.dataTransfer?.setData('text/plain', inkChar(n));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  protected swatchDragOver(e: DragEvent, n: number): void {
    if (this.dragging() !== null && n > 0) e.preventDefault();
  }

  protected swatchDrop(e: DragEvent, n: number): void {
    const from = this.dragging();
    this.dragging.set(null);
    if (from === null || n < 1) return;
    e.preventDefault();
    this.moveSwatch(from, n);
  }

  /** O menu das cores (o "…" ao lado da paleta). */
  protected openColorsMenu(e: MouseEvent): void {
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    this.colorsMenu().show({ key: 'cores', x: r.left, y: r.bottom + 4, back: btn, by: e.detail === 0 ? 'teclado' : 'mouse' });
  }

  protected readonly colorItems = computed<MenuSections>(() => [
    [
      { id: 'paletas', label: 'Trocar a paleta…', icon: ICON.paleta, dialog: true, run: () => this.paletteOpen.set(true) },
      { id: 'luz', label: 'Ordenar pela luz', icon: ICON.ordenarCrescente, run: () => this.sortPalette('luz') },
      { id: 'tom', label: 'Ordenar pelo tom', icon: ICON.brilho, run: () => this.sortPalette('tom') },
    ],
    [{ id: 'imagem-cores', label: 'Trazer de uma imagem, com as cores dela…', icon: ICON.imagem, run: () => this.chooseImage(true) }],
    ...(this.fg() > 0 && this.count() > 1 ? [[{ id: 'tirar-cor', label: `Tirar a cor ${inkChar(this.fg())}`, icon: ICON.apagar, danger: true, run: () => this.removeFg() }]] : []),
  ]);

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

  /** Trazer de uma imagem: nas cores de agora, ou (`own`) criando a paleta com as cores dela. */
  private importOwn = false;

  protected chooseImage(own = false): void {
    this.importOwn = own;
    this.file().nativeElement.click();
  }

  protected fromFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.importImage(file, this.importOwn);
    this.importOwn = false;
  }

  /** Colar (Ctrl+V) ou soltar uma imagem na mesa: ela vira os pontos. */
  protected takeImage(e: ClipboardEvent | DragEvent): void {
    const file = imageFileOf(e instanceof ClipboardEvent ? e.clipboardData : e.dataTransfer);
    if (!file) {
      if (e instanceof ClipboardEvent && this.clip) {
        e.preventDefault();
        this.pasteClip();
      }
      return;
    }
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
  private async importImage(file: Blob, own = false): Promise<void> {
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
      // com as cores dela: a paleta própria, pelo corte na mediana (16 numa tela de 16, 32 numa de 32, até 61)
      const ownInks = own ? [null, ...medianCut(data, Math.min(INK_MAX, Math.max(8, Math.round(Math.sqrt(w * h)))))] : null;
      const part = quantize(data, fit.w, fit.h, ownInks ?? drawingInks(this.palette(), this.colors()));
      const rows = blankGrid(w, h).map((row, y) => {
        const line = part[y - fit.y];
        return line === undefined ? row : row.slice(0, fit.x) + line + row.slice(fit.x + line.length);
      });
      if (ownInks && ownInks.length > 1) {
        const colors: Record<number, string> = {};
        ownInks.forEach((c, i) => c && (colors[i] = c));
        this.change({ rows, palette: 'propria', colors }, `Imagem trazida para ${w} por ${h} pontos, com ${ownInks.length - 1} cores dela`);
      } else this.change({ rows }, `Imagem trazida para ${w} por ${h} pontos, nas cores de agora`);
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
    if (!c || t === 'mao' || t === 'selecao' || t === 'varinha' || t === 'mover') return [];
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
      case 'selecao':
        return 'Puxe para escolher · Shift: soma · Shift+Alt: tira · arraste de dentro para mover · Esc: tira';
      case 'varinha':
        return 'Escolhe a mancha da cor · Shift: soma · Shift+Alt: tira';
      case 'mover':
        return 'Arraste o que está escolhido (ou tudo) · Ctrl ao começar: uma cópia · setas: um ponto · Enter: assenta';
      case 'lapis':
        return 'Shift: reta desde o último ponto · Alt: conta-gotas · Espaço: arrastar a vista';
      case 'borracha':
        return 'Apaga para o transparente · Shift: reta desde o último ponto · Espaço: arrastar a vista';
      case 'balde':
        return this.contiguous() ? 'Pinta a mancha da mesma cor · o direito, com a cor do fundo' : 'Pinta toda a cor, em qualquer lugar · o direito, com a do fundo';
      case 'conta-gotas':
        return 'Esquerdo: a cor da frente · direito: a do fundo';
      case 'linha':
        return 'Shift: deitada, em pé ou a 45° · Ctrl: do meio para fora · o direito, com a cor do fundo';
      case 'retangulo':
      case 'elipse':
        return 'Shift: quadrado e círculo · Ctrl: do meio para fora · U de novo: cheia ou só a beirada';
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
