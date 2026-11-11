import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, input, output, signal, untracked, viewChild } from '@angular/core';
import {
  Cell,
  DEFAULT_PALETTE,
  PIXEL_MAX,
  blankGrid,
  clampSide,
  fitInGrid,
  floodFill,
  flipH,
  flipV,
  gridOf,
  hasInk,
  inkOf,
  inkPaths,
  lineCells,
  paintCells,
  paletteWord,
  parseColors,
  quantize,
  shiftGrid,
  writeColors,
  writeGrid,
} from '../core/pixel-art';
import { WidgetValues } from '../core/widgets';
import { imageFileOf } from '../core/images';
import { ICON, IconModule } from './icons';

type Tool = 'lapis' | 'borracha' | 'balde' | 'conta-gotas';

/** Quantos passos o desfazer guarda. */
const UNDO_MAX = 100;

/**
 * A prancheta da pixel art, na folha do widget (ui/widget-sheet.ts, o campo `pixels`): a grade com o
 * xadrez do transparente, a régua das ferramentas em cima e as dez cores ao lado. A paleta, a largura
 * e a altura são campos de sempre da folha; a prancheta lê e devolve os valores dela (`changed` manda só
 * o que mudou: `pixels`, as cores trocadas em `colors`).
 *
 * - Pintar arrastando (a reta entre um ponto e o outro: o arrasto rápido não pula); o botão direito
 *   apaga; com o Shift, a reta desde o último ponto pintado.
 * - O Lápis (B), a Borracha (E), o Balde (G) e o Conta-gotas (I); o Espelho (M) pinta também o ponto
 *   do lado de lá. Desfazer e Refazer (Ctrl+Z, Ctrl+Y), virar o desenho, limpar.
 * - Os números 0–9 escolhem a cor. Um segundo toque na cor escolhida abre o seletor de cor do aparelho.
 * - No teclado, a prancheta é um lugar só no Tab: as setas andam, Espaço ou Enter pintam, Alt e as setas
 *   empurram o desenho; quem usa leitor de tela ouve onde está e de que cor é o ponto.
 *
 * Os pontos guardados são sempre 32 × 32: diminuir a grade só esconde a beirada (ela volta ao crescer
 * de novo, enquanto a folha está aberta); a marca escrita é cortada na grade (core/pixel-art.ts).
 */
@Component({
  selector: 'app-pixel-canvas',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pixel-canvas.html',
  styleUrl: './pixel-canvas.scss',
  host: { '(keydown)': 'onKey($event)' },
})
export class PixelCanvas {
  /** Os valores da folha (os pontos, a grade, a paleta, as cores trocadas). */
  readonly values = input.required<WidgetValues>();
  /** Tentou pôr sem desenho: a prancheta fica na tinta de erro. */
  readonly missing = input(false);
  /** Para os ids. */
  readonly ids = input('pc');
  readonly changed = output<WidgetValues>();

  private readonly board = viewChild.required<ElementRef<SVGSVGElement>>('prancheta');
  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('cor');
  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('arquivo');

  protected readonly TOOLS: readonly { value: Tool; label: string; key: string; icon: typeof ICON.editar }[] = [
    { value: 'lapis', label: 'Lápis', key: 'B', icon: ICON.editar },
    { value: 'borracha', label: 'Borracha', key: 'E', icon: ICON.borracha },
    { value: 'balde', label: 'Balde', key: 'G', icon: ICON.balde },
    { value: 'conta-gotas', label: 'Conta-gotas', key: 'I', icon: ICON.contaGotas },
  ];
  protected readonly DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  protected readonly MirrorIcon = ICON.espelho;
  protected readonly UndoIcon = ICON.desfazer;
  protected readonly RedoIcon = ICON.refazer;
  protected readonly FlipHIcon = ICON.virarDeLado;
  protected readonly FlipVIcon = ICON.virarDeCabeca;
  protected readonly ClearIcon = ICON.apagar;
  protected readonly ImageIcon = ICON.imagem;
  protected readonly PenIcon = ICON.editar;
  /** Os tamanhos de grade de sempre, quadrados. */
  protected readonly GRIDS = [8, 16, 24, 32];
  /** Uma imagem sendo trazida para a prancheta; e o que deu errado na última. */
  protected readonly importing = signal(false);
  protected readonly importError = signal<string | null>(null);

  protected readonly w = computed(() => clampSide(this.values()['width']));
  protected readonly h = computed(() => clampSide(this.values()['height']));
  protected readonly palette = computed(() => paletteWord(this.values()['palette'] ?? '') ?? DEFAULT_PALETTE);
  protected readonly colors = computed(() => parseColors(this.values()['colors'] ?? '') ?? {});
  protected readonly inks = computed(() => inkOf(this.palette(), this.colors()));

  /** Os pontos, sempre 32 × 32 (a grade mostra o canto de cima dele). */
  protected readonly buffer = signal<string[]>(blankGrid(PIXEL_MAX, PIXEL_MAX));
  protected readonly rows = computed(() => this.buffer().slice(0, this.h()).map((r) => r.slice(0, this.w())));
  protected readonly paths = computed(() => inkPaths(this.rows(), 'pixel'));
  protected readonly inked = computed(() => hasInk(this.rows()));
  /** Quantos pontos pintados ficaram fora da grade (ela diminuiu por cima do desenho): esses não vão no texto. */
  protected readonly hiddenInk = computed(() => {
    const w = this.w();
    const h = this.h();
    let n = 0;
    this.buffer().forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== '0' && (x >= w || y >= h)) n++;
    });
    return n;
  });
  /** Os fios entre os pontos; os de 8 em 8, mais fortes (para contar). */
  protected readonly lines = computed(() => gridLines(this.w(), this.h(), (i) => i % 8 !== 0));
  protected readonly majors = computed(() => gridLines(this.w(), this.h(), (i) => i % 8 === 0));

  protected readonly tool = signal<Tool>('lapis');
  protected readonly ink = signal(1);
  protected readonly mirror = signal(false);
  /** O ponto debaixo do mouse (a prévia do que o toque faz). */
  protected readonly hover = signal<Cell | null>(null);
  /** O ponto do teclado, e se ele aparece (só depois de andar pelas setas). */
  protected readonly cursor = signal<Cell>({ x: 0, y: 0 });
  protected readonly keyboard = signal(false);
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  /** O que a prancheta acabou de fazer, para quem lê a tela. */
  protected readonly said = signal('');

  /** Os pontos que esta prancheta mandou por último: o mesmo texto voltando não refaz o desenho. */
  private sent: string | null = null;
  private undos: Snap[] = [];
  private redos: Snap[] = [];
  /** As cores trocadas de antes de o seletor do aparelho abrir: a troca inteira é um passo do desfazer. */
  private colorsBefore: string | null = null;
  /** O arrasto de agora: apagando ou não, e o último ponto (a reta vai dele ao próximo). */
  private stroke: { erase: boolean; last: Cell; before: string[] } | null = null;
  /** O dedo, a caneta ou o mouse do arrasto de agora: o segundo dedo não começa outro por cima. */
  private pointer: number | null = null;
  /** O último ponto pintado (o Shift risca a reta desde ele). */
  private lastPainted: Cell | null = null;

  constructor() {
    effect(() => {
      const raw = this.values()['pixels'] ?? '';
      if (raw === this.sent) return;
      untracked(() => {
        this.buffer.set(gridOf(raw, PIXEL_MAX, PIXEL_MAX));
        this.sent = raw;
        this.undos = [];
        this.redos = [];
        this.syncHistory();
      });
    });
    // a grade escrita maior que 32 volta para 32 no campo (a prancheta e a marca já param nele)
    effect(() => {
      const v = this.values();
      const patch: WidgetValues = {};
      for (const k of ['width', 'height'])
        if (Number(v[k]) > PIXEL_MAX) patch[k] = String(PIXEL_MAX);
      if (Object.keys(patch).length) untracked(() => this.changed.emit(patch));
    });
    // o desenho novo: a grade de sempre escrita nos campos de Largura e Altura (eles começam com ela)
    afterNextRender(() => {
      const v = this.values();
      const patch: WidgetValues = {};
      if (!v['width']?.trim()) patch['width'] = String(this.w());
      if (!v['height']?.trim()) patch['height'] = String(this.h());
      if (Object.keys(patch).length) this.changed.emit(patch);
    });
  }

  // ===== os pontos =====

  private commit(next: string[]): void {
    // o desenho andou: o aviso da imagem que não abriu já não diz respeito a ele
    this.importError.set(null);
    this.buffer.set(next);
    const raw = writeGrid(next);
    this.sent = raw;
    this.changed.emit({ pixels: raw });
  }

  /** As cores trocadas como estão escritas agora. */
  private colorsText(): string {
    return this.values()['colors'] ?? '';
  }

  /** Guarda no desfazer o desenho de antes de mudar (as cores, sem dizer, são as de agora). */
  private remember(before: string[], colors = this.colorsText()): void {
    this.undos.push({ rows: before, colors });
    if (this.undos.length > UNDO_MAX) this.undos.shift();
    this.redos = [];
    this.syncHistory();
  }

  private syncHistory(): void {
    this.canUndo.set(this.undos.length > 0);
    this.canRedo.set(this.redos.length > 0);
  }

  /** Uma mudança de uma vez só (o balde, virar, limpar): um passo no desfazer. */
  private change(next: string[], said: string): void {
    const before = this.buffer();
    if (sameRows(before, next)) return;
    this.remember(before);
    this.commit(next);
    this.said.set(said);
  }

  protected undo(): void {
    const prev = this.undos.pop();
    if (!prev) return;
    this.redos.push({ rows: this.buffer(), colors: this.colorsText() });
    this.restore(prev);
    this.said.set('Desfeito');
  }

  protected redo(): void {
    const next = this.redos.pop();
    if (!next) return;
    this.undos.push({ rows: this.buffer(), colors: this.colorsText() });
    this.restore(next);
    this.said.set('Refeito');
  }

  /** Volta os pontos e as cores trocadas de um passo do desfazer. */
  private restore(s: Snap): void {
    if (!sameRows(s.rows, this.buffer())) this.commit(s.rows);
    if (s.colors !== this.colorsText()) this.changed.emit({ colors: s.colors });
    this.syncHistory();
  }

  /** Os pontos que um toque em `c` pinta: ele e, com o espelho, o do lado de lá. */
  private withMirror(cells: readonly Cell[]): Cell[] {
    if (!this.mirror()) return [...cells];
    const w = this.w();
    return cells.flatMap((c) => [c, { x: w - 1 - c.x, y: c.y }]);
  }

  private paint(cells: readonly Cell[], erase: boolean): void {
    const next = paintCells(this.buffer(), this.withMirror(cells), erase ? 0 : this.ink());
    if (!sameRows(next, this.buffer())) this.commit(next);
    this.lastPainted = cells.at(-1) ?? this.lastPainted;
  }

  /** O ponto de uma cor, como se fala: "transparente", "cor 4". */
  protected inkName(n: number): string {
    return n === 0 ? 'transparente' : `cor ${n}`;
  }

  /** O que um toque (ou o Espaço) faz no ponto `c`, com a ferramenta de agora (a borracha, no botão direito). */
  private apply(c: Cell, tool: Tool, shift: boolean): void {
    if (tool === 'conta-gotas') {
      const n = Number(this.buffer()[c.y][c.x]);
      this.ink.set(n);
      this.tool.set('lapis');
      this.said.set(`Cor escolhida: ${this.inkName(n)}`);
      return;
    }
    if (tool === 'balde') {
      this.change(floodFill(this.buffer(), c, this.ink(), this.w(), this.h()), `Balde de ${this.inkName(this.ink())}`);
      return;
    }
    const erase = tool === 'borracha';
    const before = this.buffer();
    this.paint(shift && this.lastPainted ? lineCells(this.lastPainted, c) : [c], erase);
    this.stroke = { erase, last: c, before };
  }

  /** Termina o arrasto: um passo só no desfazer (se mudou alguma coisa). */
  private endStroke(): void {
    const s = this.stroke;
    this.stroke = null;
    if (s && !sameRows(s.before, this.buffer())) this.remember(s.before);
  }

  // ===== o mouse, a caneta e o dedo =====

  private cellAt(e: PointerEvent): Cell | null {
    const r = this.board().nativeElement.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = Math.floor(((e.clientX - r.left) / r.width) * this.w());
    const y = Math.floor(((e.clientY - r.top) / r.height) * this.h());
    return x < 0 || y < 0 || x >= this.w() || y >= this.h() ? null : { x, y };
  }

  protected down(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    if (this.pointer !== null && this.pointer !== e.pointerId) return;
    const c = this.cellAt(e);
    if (!c) return;
    e.preventDefault();
    this.board().nativeElement.focus({ preventScroll: true });
    this.board().nativeElement.setPointerCapture?.(e.pointerId);
    this.pointer = e.pointerId;
    this.keyboard.set(false);
    this.cursor.set(c);
    this.apply(c, e.button === 2 ? 'borracha' : this.tool(), e.shiftKey);
  }

  protected move(e: PointerEvent): void {
    const c = this.cellAt(e);
    // (só quando muda de ponto: cada movimento do mouse redesenharia a prancheta inteira)
    const was = this.hover();
    const now = e.pointerType === 'mouse' ? c : null;
    if (was?.x !== now?.x || was?.y !== now?.y) this.hover.set(now);
    const s = this.stroke;
    if (!s || !c || e.pointerId !== this.pointer || (c.x === s.last.x && c.y === s.last.y)) return;
    this.paint(lineCells(s.last, c).slice(1), s.erase);
    s.last = c;
  }

  protected up(e: PointerEvent): void {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.endStroke();
  }

  // ===== o teclado =====

  protected onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement | null)?.closest?.('input')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod || e.altKey) {
      if (e.altKey && !mod && this.onBoard(e)) this.shiftKey(e);
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      this.chooseInk(Number(e.key));
      return;
    }
    const tool = ({ b: 'lapis', p: 'lapis', e: 'borracha', g: 'balde', f: 'balde', i: 'conta-gotas' } as Record<string, Tool>)[k];
    if (tool) {
      e.preventDefault();
      this.pickTool(tool);
      return;
    }
    if (k === 'm') {
      e.preventDefault();
      this.toggleMirror();
      return;
    }
    if (!this.onBoard(e)) return;
    const step = ({ arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] } as Record<string, [number, number]>)[k];
    if (step) {
      e.preventDefault();
      const c = this.cursor();
      const next = { x: Math.min(this.w() - 1, Math.max(0, c.x + step[0])), y: Math.min(this.h() - 1, Math.max(0, c.y + step[1])) };
      this.cursor.set(next);
      this.keyboard.set(true);
      this.sayCell(next);
      return;
    }
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      const c = this.clampCursor();
      this.keyboard.set(true);
      this.apply(c, this.tool(), e.shiftKey);
      this.endStroke();
      this.sayCell(c);
      return;
    }
    if (k === 'delete' || k === 'backspace') {
      e.preventDefault();
      const c = this.clampCursor();
      this.keyboard.set(true);
      this.apply(c, 'borracha', false);
      this.endStroke();
      this.sayCell(c);
    }
  }

  private onBoard(e: KeyboardEvent): boolean {
    return e.target === this.board().nativeElement;
  }

  /** Alt e as setas: o desenho todo anda um ponto. */
  private shiftKey(e: KeyboardEvent): void {
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!step) return;
    e.preventDefault();
    this.change(shiftGrid(this.buffer(), step[0], step[1], this.w(), this.h()), 'Desenho empurrado');
  }

  /** O cursor dentro da grade (ela pode ter diminuído). */
  private clampCursor(): Cell {
    const c = this.cursor();
    const next = { x: Math.min(c.x, this.w() - 1), y: Math.min(c.y, this.h() - 1) };
    this.cursor.set(next);
    return next;
  }

  private sayCell(c: Cell): void {
    this.said.set(`Linha ${c.y + 1}, coluna ${c.x + 1}: ${this.inkName(Number(this.buffer()[c.y][c.x]))}`);
  }

  // ===== a régua e as cores =====

  protected pickTool(t: Tool): void {
    this.tool.set(t);
    this.said.set(this.TOOLS.find((o) => o.value === t)?.label ?? '');
  }

  protected toggleMirror(): void {
    this.mirror.update((m) => !m);
    this.said.set(this.mirror() ? 'Espelho ligado' : 'Espelho desligado');
  }

  /** Um dos tamanhos de sempre (quadrado): os campos de Largura e Altura vão junto. */
  protected setGrid(n: number): void {
    this.changed.emit({ width: String(n), height: String(n) });
    this.said.set(`Grade de ${n} por ${n} pontos`);
  }

  protected flipSide(): void {
    this.change(flipH(this.buffer(), this.w(), this.h()), 'Desenho virado de lado');
  }

  protected flipUpside(): void {
    this.change(flipV(this.buffer(), this.w(), this.h()), 'Desenho de cabeça para baixo');
  }

  protected clear(): void {
    this.change(blankGrid(PIXEL_MAX, PIXEL_MAX), 'Prancheta limpa');
  }

  /** Escolhe a cor (a borracha e o conta-gotas voltam para o lápis: quem escolhe uma cor quer pintar com ela). */
  protected chooseInk(n: number): void {
    this.ink.set(n);
    if (this.tool() === 'borracha' || this.tool() === 'conta-gotas') this.tool.set('lapis');
    this.said.set(`Cor escolhida: ${this.inkName(n)}`);
  }

  /** O toque numa pastilha: escolhe; na já escolhida (de 1 a 9), abre o seletor de cor do aparelho. */
  protected swatch(n: number): void {
    if (n === this.ink() && n > 0) {
      const el = this.picker().nativeElement;
      el.value = this.inks()[n] ?? '#000000';
      this.colorsBefore = this.colorsText();
      if (typeof el.showPicker === 'function') {
        try {
          el.showPicker();
          return;
        } catch {
          // (sem o gesto que o navegador espera: o clique de sempre)
        }
      }
      el.click();
      return;
    }
    this.chooseInk(n);
  }

  /** A cor escolhida no seletor do aparelho vira a cor trocada do número de agora. */
  protected setColor(value: string): void {
    const n = this.ink();
    if (n < 1) return;
    const next = writeColors({ ...this.colors(), [n]: value }, this.palette());
    if (next === this.colorsText()) return;
    // o seletor manda a cor a cada passo do arrasto: só o primeiro guarda o desfazer
    if (this.colorsBefore !== null) {
      this.remember(this.buffer(), this.colorsBefore);
      this.colorsBefore = null;
    }
    this.changed.emit({ colors: next });
  }

  /** A cor trocada volta a ser a da paleta. */
  protected resetColor(n: number): void {
    const { [n]: _, ...rest } = this.colors();
    this.remember(this.buffer());
    this.changed.emit({ colors: writeColors(rest, this.palette()) });
    this.said.set(`A ${this.inkName(n)} voltou à da paleta`);
  }

  // ===== trazer de uma imagem =====

  /** Abre a escolha de arquivo do aparelho (no celular, a galeria e a câmera). */
  protected chooseImage(): void {
    this.file().nativeElement.click();
  }

  protected fromFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    // a mesma imagem escolhida de novo também chega
    input.value = '';
    if (file) void this.importImage(file);
  }

  /** Colar (Ctrl+V) ou soltar uma imagem na prancheta: ela vira os pontos. */
  protected takeImage(e: ClipboardEvent | DragEvent): void {
    const file = imageFileOf(e instanceof ClipboardEvent ? e.clipboardData : e.dataTransfer);
    if (!file) return;
    e.preventDefault();
    void this.importImage(file);
  }

  /** Deixa soltar só imagem na prancheta. */
  protected dragOver(e: DragEvent): void {
    if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) e.preventDefault();
  }

  /**
   * A imagem encolhida até a grade de agora (inteira, no meio, sem deformar) e cada ponto na cor mais perto
   * das nove de agora; o quase transparente fica transparente. Um passo no desfazer.
   */
  private async importImage(file: Blob): Promise<void> {
    // uma de cada vez: a segunda, colada enquanto a primeira chega, seria apagada por ela
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
      const part = quantize(data, fit.w, fit.h, this.inks());
      const next = blankGrid(PIXEL_MAX, PIXEL_MAX).map((row, y) => {
        const line = part[y - fit.y];
        return line === undefined ? row : row.slice(0, fit.x) + line + row.slice(fit.x + line.length);
      });
      this.change(next, `Imagem trazida para ${w} por ${h} pontos, na paleta de agora`);
    } catch {
      this.importError.set('Essa imagem não abriu. Tente outra (PNG, JPG, WebP, GIF).');
      this.said.set('Essa imagem não abriu.');
    } finally {
      this.importing.set(false);
    }
  }

  /** O nome da pastilha para quem não vê: "Cor 4, trocada", "Transparente: apaga". */
  protected swatchLabel(n: number): string {
    if (n === 0) return 'Transparente (apaga)';
    return `Cor ${n}${this.colors()[n] ? ', trocada' : ''}`;
  }

  /** A prancheta para quem não vê. */
  protected readonly label = computed(() => `Prancheta de ${this.w()} por ${this.h()} pontos. Setas andam; Espaço pinta com a ${this.inkName(this.ink())}.`);
}

/**
 * Os bytes RGBA da imagem encolhida para `w` × `h`, pela metade a cada passo até chegar (direto de uma foto
 * grande para 16 pontos, o navegador pega uns poucos pixels e o desenho sai picado).
 */
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

/** Um passo do desfazer: os pontos e as cores trocadas (como escritas). */
interface Snap {
  rows: string[];
  colors: string;
}

/** As duas fileiras de pontos são iguais? */
function sameRows(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((r, i) => r === b[i]);
}

/** Os fios da grade (os de dentro, sem a beirada), os que `keep` aceita pelo número deles. */
function gridLines(w: number, h: number, keep: (i: number) => boolean): string {
  let d = '';
  for (let x = 1; x < w; x++) if (keep(x)) d += `M${x} 0V${h}`;
  for (let y = 1; y < h; y++) if (keep(y)) d += `M0 ${y}H${w}`;
  return d;
}
