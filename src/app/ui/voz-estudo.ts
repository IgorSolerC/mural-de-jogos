import { LACO } from './rabisco';
import { Piece, rangesOf, wordsOf } from './voz-frases';
import { reducedMotion } from '../core/motion';

/** O nome do realce que deixa as letras escondidas transparentes (styles.scss). */
export const STUDY_HIGHLIGHT = 'voz-estudo';
/** A camada dos rabiscos, dentro de cada raiz (o CSS dela mora em styles.scss: ela é criada aqui, fora de um componente). */
export const STUDY_LAYER = 'voz-rabiscos';
/** Quanto o rabisco leva para sumir quando a palavra é revelada (ms). */
const FADE_MS = 160;
/** A largura mínima de onde o dedo pega uma palavra ("o", "e", の são um laço só): o rabisco continua do tamanho dela. */
const MIN_TAP = 24;

/** Como cada letra é pintada (a cor e o tamanho), por elemento: o rabisco sai da mesma tinta e do mesmo corpo. */
interface Look {
  color: string;
  size: string;
}

/**
 * O modo estudo da voz (PLANO-VOZ-ESTUDO.md): o que a voz lê vira rabisco, cada palavra (letra, kana, kanji,
 * número) um laço cursivo do tamanho dela, como o texto das descrições secretas (ui/rabisco.ts); a pontuação,
 * os espaços e os símbolos ficam. Tocar numa palavra a revela.
 *
 * O HTML que o Angular desenha não é tocado: as letras ficam onde estão, transparentes por um realce
 * (`::highlight(voz-estudo)`, acima do marca-texto da voz), e os rabiscos vão numa camada por cima, um por
 * pedaço de linha de cada palavra (`Range.getClientRects`). Por isso nada se mexe ao revelar: só o realce e o
 * rabisco daquela palavra saem. A camada se redesenha quando a folha muda de largura, a fonte chega, um bloco
 * rola de lado ou o texto muda (`refresh`, chamado por quem observa o texto).
 */
export class VozEstudo {
  private roots: HTMLElement[] = [];
  private lang = 'pt-BR';
  private words: Piece[][] = [];
  private ranges: Range[][] = [];
  private boxes: HTMLElement[][] = [];
  /** As palavras reveladas, pelo nó e pela letra onde começam (a mesma palavra desenhada de novo continua revelada). */
  private revealed = new WeakMap<Text, Set<number>>();
  private readonly layers = new Map<HTMLElement, HTMLElement>();
  private hovered = -1;
  /** O realce desta camada (o nome é um só na página: outra fita que para não apaga o desta). */
  private highlight: Highlight | null = null;
  /** O tamanho de cada raiz no último desenho ("largura×altura"). */
  private readonly drawnAt = new Map<HTMLElement, string>();
  /** Onde o mouse está (para a palavra debaixo dele continuar acesa depois de os rabiscos se redesenharem). */
  private pointer: { x: number; y: number } | null = null;
  private frame = 0;
  /** O próximo quadro parte as palavras de novo (o texto mudou), e não só as mede. */
  private again = false;
  private resize: ResizeObserver | null = null;
  private undo: (() => void)[] = [];

  /** Ligado (há raízes com rabisco)? */
  get on(): boolean {
    return this.roots.length > 0;
  }

  /** O navegador sabe esconder letras por um realce? Sem isso, o modo estudo não aparece. */
  static supported(): boolean {
    return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
  }

  /** Liga nas raízes (o nome da ficha e o texto), partindo as palavras na língua da leitura (BCP 47). */
  start(roots: readonly HTMLElement[], lang: string): void {
    this.stop();
    if (!VozEstudo.supported()) return;
    this.roots = [...roots];
    this.lang = lang;
    const schedule = () => this.schedule();
    for (const root of this.roots) {
      root.setAttribute('data-voz-estudo', '');
      const layer = root.ownerDocument.createElement('span');
      layer.className = STUDY_LAYER;
      layer.setAttribute('aria-hidden', 'true');
      layer.style.setProperty('--laco', LACO);
      const over = (e: PointerEvent) => {
        this.pointer = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
        this.hover(indexOf(e.target));
      };
      const out = (e: PointerEvent) => {
        if (indexOf(e.relatedTarget) === this.hovered) return;
        this.pointer = null;
        this.hover(-1);
      };
      const click = (e: MouseEvent) => {
        const i = indexOf(e.target);
        if (i < 0) return;
        // a palavra escondida é só para revelar: não abre o link, o card ou a frase que está embaixo
        e.preventDefault();
        e.stopPropagation();
        this.reveal(i);
      };
      layer.addEventListener('pointerover', over);
      layer.addEventListener('pointerout', out);
      layer.addEventListener('click', click);
      root.append(layer);
      this.layers.set(root, layer);
      // um bloco de código ou uma tabela que rola de lado leva as palavras junto
      root.addEventListener('scroll', schedule, { capture: true, passive: true });
      this.undo.push(() => root.removeEventListener('scroll', schedule, { capture: true }));
    }
    if (typeof ResizeObserver === 'function') {
      // (a primeira chamada, logo ao observar, costuma trazer o tamanho já desenhado: só redesenha se mudou)
      this.resize = new ResizeObserver((entries) => {
        if (entries.some((e) => this.drawnAt.get(e.target as HTMLElement) !== sizeOf(e.target as HTMLElement))) schedule();
      });
      for (const root of this.roots) this.resize.observe(root);
    }
    const fonts = this.roots[0]?.ownerDocument.fonts;
    if (fonts?.addEventListener) {
      fonts.addEventListener('loadingdone', schedule);
      this.undo.push(() => fonts.removeEventListener('loadingdone', schedule));
    }
    this.refresh();
  }

  /** Desliga: as letras voltam, a camada sai. */
  stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.again = false;
    this.resize?.disconnect();
    this.resize = null;
    for (const fn of this.undo) fn();
    this.undo = [];
    for (const [root, layer] of this.layers) {
      layer.remove();
      root.removeAttribute('data-voz-estudo');
    }
    this.layers.clear();
    this.drawnAt.clear();
    this.roots = [];
    this.words = [];
    this.ranges = [];
    this.boxes = [];
    this.hovered = -1;
    this.pointer = null;
    this.revealed = new WeakMap();
    if (this.highlight && CSS.highlights.get(STUDY_HIGHLIGHT) === this.highlight) CSS.highlights.delete(STUDY_HIGHLIGHT);
    this.highlight = null;
  }

  /** Já ligado nestas raízes? (A mesma folha: as palavras reveladas continuam.) */
  has(roots: readonly HTMLElement[]): boolean {
    return roots.length === this.roots.length && roots.every((r, i) => r === this.roots[i]);
  }

  /** O texto mudou: as palavras de novo no próximo quadro (o card que abre mostra o texto já em rabisco). */
  refreshSoon(): void {
    this.again = true;
    this.schedule();
  }

  /** A mudança é da própria camada (os rabiscos desenhados de novo)? Quem observa o texto a ignora. */
  owns(node: Node | null): boolean {
    if (node instanceof HTMLElement && node.classList.contains(STUDY_LAYER)) return true;
    for (const layer of this.layers.values()) if (node && layer.contains(node)) return true;
    return false;
  }

  /** O texto mudou (ou a língua): as palavras de novo, e os rabiscos. */
  refresh(lang = this.lang): void {
    if (!this.on) return;
    this.lang = lang;
    this.again = false;
    this.words = wordsOf(this.roots, lang);
    this.ranges = this.words.map((pieces) => rangesOf({ pieces }));
    this.draw();
  }

  /** Só os lugares (a folha mudou de largura, a fonte chegou): no próximo quadro, uma vez. */
  private schedule(): void {
    if (this.frame || !this.on) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.again) this.refresh();
      else this.draw();
    });
  }

  private isRevealed(pieces: readonly Piece[]): boolean {
    const first = pieces[0];
    return !!first && !!this.revealed.get(first.node)?.has(first.from);
  }

  /** O realce que esconde as letras e um rabisco por pedaço de linha de cada palavra ainda escondida. */
  private draw(): void {
    const hidden: Range[] = [];
    const looks = new Map<Element, Look>();
    const clips = new Map<Element, DOMRect | null>();
    const origins = new Map<HTMLElement, { x: number; y: number }>();
    for (const [root, layer] of this.layers) {
      layer.replaceChildren();
      const box = root.getBoundingClientRect();
      origins.set(root, { x: box.left + root.clientLeft, y: box.top + root.clientTop });
      this.drawnAt.set(root, sizeOf(root));
    }
    this.boxes = this.words.map(() => []);
    this.hovered = -1;
    // primeiro mede tudo, depois desenha: pôr um rabisco na página no meio das medidas faria o navegador
    // refazer a página inteira a cada palavra
    const marks: Mark[] = [];
    this.words.forEach((pieces, i) => {
      if (this.isRevealed(pieces)) return;
      for (const range of this.ranges[i]) {
        const parent = range.startContainer.parentElement;
        const root = parent && this.roots.find((r) => r.contains(parent));
        const layer = root && this.layers.get(root);
        if (!parent || !root || !layer) continue;
        hidden.push(range);
        const look = lookOf(parent, looks);
        const origin = origins.get(root)!;
        for (const rect of range.getClientRects()) {
          const r = clipped(rect, parent, root, clips);
          if (!r) continue;
          // o alvo do toque cresce para os lados até MIN_TAP; o desenho (o filho) fica do tamanho da palavra
          const pad = Math.max(0, (MIN_TAP - r.width) / 2);
          marks.push({ i, layer, x: r.left - origin.x, y: r.top - origin.y, w: r.width, h: r.height, left: pad, right: pad, look });
        }
      }
    });
    trimPads(marks);
    for (const { i, layer, x, y, w, h, left, right, look } of marks) {
      const box = layer.ownerDocument.createElement('span');
      box.dataset['p'] = String(i);
      // uma palavra um pouco mais alta que a outra, como no app-rabisco (a mão que rabisca depressa)
      if (i % 3 === 1) box.className = 'alto';
      box.style.cssText = `left:${x - left}px;top:${y}px;width:${w + left + right}px;height:${h}px;--pad-l:${left}px;--pad-r:${right}px;color:${look.color};font-size:${look.size}`;
      // o desenho num filho: a máscara do rabisco também recorta onde o toque pega, e o alvo é maior que ele
      box.append(layer.ownerDocument.createElement('i'));
      layer.append(box);
      this.boxes[i].push(box);
    }
    const hl = new Highlight(...hidden);
    // acima do marca-texto da frase e da palavra lidas (que pintam a letra de preto): a letra escondida continua escondida
    hl.priority = 2;
    CSS.highlights.set(STUDY_HIGHLIGHT, hl);
    this.highlight = hl;
    // o mouse parado em cima de uma palavra: ela continua acesa nos rabiscos novos
    if (this.pointer) this.hover(indexOf(this.roots[0].ownerDocument.elementFromPoint(this.pointer.x, this.pointer.y)));
  }

  /** O mouse em cima de uma palavra: todos os pedaços dela acendem, e a mãozinha diz que dá para tocar. */
  private hover(i: number): void {
    if (i === this.hovered) return;
    for (const box of this.boxes[this.hovered] ?? []) box.classList.remove('mao');
    this.hovered = i;
    for (const box of this.boxes[i] ?? []) box.classList.add('mao');
  }

  /** Revela a palavra: o realce sai dela, e o rabisco some (num instante). Nada muda de tamanho. */
  reveal(i: number): void {
    const pieces = this.words[i];
    if (!pieces?.length || this.isRevealed(pieces)) return;
    const first = pieces[0];
    let set = this.revealed.get(first.node);
    if (!set) this.revealed.set(first.node, (set = new Set()));
    set.add(first.from);
    const hl = CSS.highlights.get(STUDY_HIGHLIGHT);
    for (const range of this.ranges[i]) hl?.delete(range);
    if (this.hovered === i) this.hovered = -1;
    const boxes = this.boxes[i];
    this.boxes[i] = [];
    if (reducedMotion()) {
      boxes.forEach((b) => b.remove());
      return;
    }
    for (const box of boxes) box.classList.add('saindo');
    setTimeout(() => boxes.forEach((b) => b.remove()), FADE_MS);
  }
}

/** O tamanho da raiz como o observador de tamanho a vê (a caixa do conteúdo). */
function sizeOf(el: HTMLElement): string {
  return `${el.clientWidth}x${el.clientHeight}`;
}

/** Um pedaço de linha de uma palavra a rabiscar: o lugar na camada, a folga do toque de cada lado e a tinta. */
interface Mark {
  i: number;
  layer: HTMLElement;
  x: number;
  y: number;
  w: number;
  h: number;
  left: number;
  right: number;
  look: Look;
}

/**
 * A folga do toque de duas palavras curtas vizinhas ("e o") não passa do meio do vão entre elas: tocar perto de
 * uma nunca revela a outra.
 */
function trimPads(marks: Mark[]): void {
  const lines = new Map<HTMLElement, Map<number, Mark[]>>();
  for (const m of marks) {
    let byY = lines.get(m.layer);
    if (!byY) lines.set(m.layer, (byY = new Map()));
    const y = Math.round(m.y);
    let line = byY.get(y);
    if (!line) byY.set(y, (line = []));
    line.push(m);
  }
  for (const line of [...lines.values()].flatMap((byY) => [...byY.values()])) {
    line.sort((a, b) => a.x - b.x);
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1];
      const b = line[k];
      const half = Math.max(0, (b.x - (a.x + a.w)) / 2);
      a.right = Math.min(a.right, half);
      b.left = Math.min(b.left, half);
    }
  }
}

/** O número da palavra do rabisco tocado (-1 fora de um). */
function indexOf(target: EventTarget | null): number {
  const box = target instanceof HTMLElement && target.tagName === 'I' ? target.parentElement : target;
  const p = box instanceof HTMLElement ? box.dataset['p'] : undefined;
  return p === undefined ? -1 : Number(p);
}

function lookOf(el: Element, memo: Map<Element, Look>): Look {
  let look = memo.get(el);
  if (!look) {
    const css = getComputedStyle(el);
    look = { color: css.color, size: css.fontSize };
    memo.set(el, look);
  }
  return look;
}

/**
 * O pedaço de linha recortado pelo que o esconde entre ele e a raiz (o bloco de código e a tabela que rolam de
 * lado, o card de altura contada): só o que está à mostra ganha rabisco. Null se nada fica à mostra.
 */
function clipped(rect: DOMRect, from: Element, root: Element, memo: Map<Element, DOMRect | null>): DOMRect | null {
  let left = rect.left;
  let top = rect.top;
  let right = rect.right;
  let bottom = rect.bottom;
  for (let el: Element | null = from; el; el = el === root ? null : el.parentElement) {
    let clip = memo.get(el);
    if (clip === undefined) {
      const css = getComputedStyle(el);
      clip = css.overflowX !== 'visible' || css.overflowY !== 'visible' ? el.getBoundingClientRect() : null;
      memo.set(el, clip);
    }
    if (!clip) continue;
    left = Math.max(left, clip.left);
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
  }
  return right - left >= 1 && bottom - top >= 1 ? new DOMRect(left, top, right - left, bottom - top) : null;
}
