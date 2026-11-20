import { LACO } from './rabisco';
import { Piece, SPEAKS, rangesOf, wordsBySentence } from './voz-frases';

/** O nome do realce que deixa as letras escondidas transparentes (styles.scss). */
export const STUDY_HIGHLIGHT = 'voz-estudo';
/** A camada dos rabiscos, dentro de cada raiz (o CSS dela mora em styles.scss: ela é criada aqui, fora de um componente). */
export const STUDY_LAYER = 'voz-rabiscos';
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
 * os espaços e os símbolos ficam. Tocar numa palavra revela a frase inteira dela; tocar de novo a esconde.
 *
 * O HTML que o Angular desenha não é tocado: as letras ficam onde estão, transparentes por um realce
 * (`::highlight(voz-estudo)`, acima do marca-texto da voz), e os rabiscos vão numa camada por cima, um por
 * pedaço de linha de cada palavra (`Range.getClientRects`). Por isso nada se mexe ao revelar: só o realce e os
 * rabiscos daquela frase saem (o alvo do toque fica, para esconder de novo). A camada se redesenha quando a folha muda de largura, a fonte chega, um bloco
 * rola de lado ou o texto muda (`refresh`, chamado por quem observa o texto).
 */
export class VozEstudo {
  private roots: HTMLElement[] = [];
  private lang = 'pt-BR';
  /** As frases, na ordem da tela. */
  private phrases: Phrase[] = [];
  /** Os rabiscos de cada frase (o mouse acende todos, o toque abre todos). */
  private boxes: HTMLElement[][] = [];
  /**
   * As frases reveladas, pelo nó onde começam e pela chave delas (o texto, e quantas iguais vêm antes no nó):
   * a mesma frase desenhada de novo continua revelada, mesmo que o texto antes dela no mesmo nó mude; a
   * frase que muda volta a se esconder.
   */
  private revealed = new WeakMap<Text, Set<string>>();
  private readonly layers = new Map<HTMLElement, HTMLElement>();
  private hovered = -1;
  /** O realce desta camada (o nome é um só na página: outra fita que para não apaga o desta). */
  private highlight: Highlight | null = null;
  /** O tamanho de cada raiz no último desenho ("largura×altura"). */
  private readonly drawnAt = new Map<HTMLElement, string>();
  /** Onde o mouse está (para a frase debaixo dele continuar acesa depois de os rabiscos se redesenharem). */
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
        // no modo estudo, tocar numa palavra é revelar ou esconder a frase dela: não abre o link, o card ou a frase lida que está embaixo
        e.preventDefault();
        e.stopPropagation();
        this.toggle(i);
      };
      layer.addEventListener('pointerover', over);
      layer.addEventListener('pointerout', out);
      layer.addEventListener('click', click);
      root.append(layer);
      this.layers.set(root, layer);
      // um bloco de código ou uma tabela que rola de lado leva as palavras junto
      root.addEventListener('scroll', schedule, { capture: true, passive: true });
      // a cor que muda devagar (o spoiler revelado sai do transparente em 160ms): o rabisco pega a cor de chegada
      // (só a cor do texto: as transições dos próprios rabiscos, o laranja do mouse e o sumir, não redesenham)
      const colored = (e: TransitionEvent) => {
        if (e.propertyName === 'color' && !this.owns(e.target as Node)) schedule();
      };
      root.addEventListener('transitionend', colored, { passive: true });
      this.undo.push(() => {
        root.removeEventListener('scroll', schedule, { capture: true });
        root.removeEventListener('transitionend', colored);
      });
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
    this.phrases = [];
    this.boxes = [];
    this.hovered = -1;
    this.pointer = null;
    this.revealed = new WeakMap();
    if (this.highlight && CSS.highlights.get(STUDY_HIGHLIGHT) === this.highlight) CSS.highlights.delete(STUDY_HIGHLIGHT);
    this.highlight = null;
  }

  /** Já ligado nestas raízes? (A mesma folha: as frases reveladas continuam.) */
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
    // a chave: o texto da frase e quantas iguais vieram antes no mesmo nó ("Sim. Não. Sim.": cada "Sim" a sua)
    const seen = new Map<Text, Map<string, number>>();
    this.phrases = wordsBySentence(this.roots, lang).map(({ text, words }) => {
      const node = words[0][0].node;
      let counts = seen.get(node);
      if (!counts) seen.set(node, (counts = new Map()));
      const n = counts.get(text) ?? 0;
      counts.set(text, n + 1);
      return {
        start: node,
        key: `${n}:${text}`,
        words: words.map((pieces, w) => ({ ranges: rangesOf({ pieces }), glue: w + 1 < words.length && joined(pieces, words[w + 1]) })),
      };
    });
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

  /** A frase está revelada? (Pelo nó onde começa e pela chave dela.) */
  private isRevealed(i: number): boolean {
    const phrase = this.phrases[i];
    return !!phrase && !!this.revealed.get(phrase.start)?.has(phrase.key);
  }

  /** O realce que esconde as letras e um rabisco por pedaço de linha de cada palavra das frases ainda escondidas. */
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
    this.boxes = this.phrases.map(() => []);
    this.hovered = -1;
    // primeiro mede tudo, depois desenha: pôr um rabisco na página no meio das medidas faria o navegador
    // refazer a página inteira a cada palavra
    const marks: Mark[] = [];
    let count = 0;
    this.phrases.forEach(({ words }, i) => {
      // a revelada também ganha o alvo do toque (sem o desenho), para esconder de novo
      const open = this.isRevealed(i);
      for (const { ranges, glue } of words) {
        // uma palavra um pouco mais alta que a outra, como no app-rabisco (a mão que rabisca depressa)
        const tall = count++ % 3 === 1;
        // os pedaços da mesma palavra (o negrito no meio, a quebra de linha) colam um no outro; o último, na palavra seguinte se ela for colada
        const first = marks.length;
        for (const range of ranges) {
          const parent = range.startContainer.parentElement;
          const root = parent && this.roots.find((r) => r.contains(parent));
          const layer = root && this.layers.get(root);
          if (!parent || !root || !layer) continue;
          if (!open) hidden.push(range);
          const look = lookOf(parent, root, looks);
          const origin = origins.get(root)!;
          for (const rect of range.getClientRects()) {
            const r = clipped(rect, parent, root, clips);
            if (!r) continue;
            // o alvo do toque cresce para os lados até MIN_TAP; o desenho (o filho) fica do tamanho da palavra
            const pad = Math.max(0, (MIN_TAP - r.width) / 2);
            marks.push({ i, glue: true, tall, open, layer, x: r.left - origin.x, y: r.top - origin.y, w: r.width, h: r.height, left: pad, right: pad, look });
          }
        }
        if (marks.length > first) marks[marks.length - 1].glue = glue;
      }
    });
    trimPads(marks);
    for (const { i, tall, open, layer, x, y, w, h, left, right, look } of marks) {
      const box = layer.ownerDocument.createElement('span');
      box.dataset['p'] = String(i);
      if (tall) box.classList.add('alto');
      if (open) box.classList.add('aberta');
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
    // o mouse parado em cima de uma palavra: a frase dela continua acesa nos rabiscos novos
    if (this.pointer) this.hover(indexOf(this.roots[0].ownerDocument.elementFromPoint(this.pointer.x, this.pointer.y)));
  }

  /** O mouse em cima de uma palavra: a frase dela inteira acende (o que o toque vai abrir), e a mãozinha diz que dá para tocar. */
  private hover(i: number): void {
    if (i === this.hovered) return;
    for (const box of this.boxes[this.hovered] ?? []) box.classList.remove('mao');
    this.hovered = i;
    for (const box of this.boxes[i] ?? []) box.classList.add('mao');
  }

  /**
   * Revela a frase escondida (a de número `i`), ou esconde de novo a revelada: o realce de todas as palavras
   * dela sai ou volta, e os rabiscos somem ou voltam (num instante, pelo CSS). Os alvos do toque ficam no
   * lugar. Nada muda de tamanho.
   */
  toggle(i: number): void {
    const phrase = this.phrases[i];
    if (!phrase) return;
    let set = this.revealed.get(phrase.start);
    if (!set) this.revealed.set(phrase.start, (set = new Set()));
    const open = !set.has(phrase.key);
    if (open) set.add(phrase.key);
    else set.delete(phrase.key);
    const hl = CSS.highlights.get(STUDY_HIGHLIGHT);
    for (const range of phrase.words.flatMap((w) => w.ranges)) {
      if (open) hl?.delete(range);
      else hl?.add(range);
    }
    for (const box of this.boxes[i]) box.classList.toggle('aberta', open);
  }

}

/** O tamanho da raiz como o observador de tamanho a vê (a caixa do conteúdo). */
function sizeOf(el: HTMLElement): string {
  return `${el.clientWidth}x${el.clientHeight}`;
}

/** Uma frase do modo estudo: o que a guarda como revelada e as palavras dela na tela. */
interface Phrase {
  /** O nó de texto onde ela começa. */
  start: Text;
  /** O texto dela e quantas iguais vêm antes no mesmo nó ("0:Sim.", "1:Sim."). */
  key: string;
  /** Cada palavra: os trechos na tela e se ela cola na seguinte (entre as duas, só espaço e pontuação à mostra). */
  words: { ranges: Range[]; glue: boolean }[];
}

/** Um pedaço de linha de uma palavra a rabiscar: o lugar na camada, a folga do toque de cada lado e a tinta. */
interface Mark {
  /** A frase. */
  i: number;
  /**
   * Colado no pedaço seguinte da frase: o outro pedaço da mesma palavra, ou a palavra seguinte, quando entre
   * as duas só há espaço e pontuação à mostra.
   */
  glue: boolean;
  /** O laço um pouco mais alto (uma palavra em três). */
  tall: boolean;
  /** A frase revelada: o alvo fica, sem o desenho. */
  open: boolean;
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
 * O alvo do toque de dois pedaços vizinhos na linha. Colados (da mesma palavra, ou de duas palavras da mesma
 * frase com o espaço ou a vírgula entre elas), os dois vão até o meio do vão: a frase é um alvo seguido, sem
 * buraco entre as palavras; um vão largo (o texto justificado) não vira alvo. Fora isso (outra frase, ou o
 * spoiler fechado, o botão ou a imagem no meio), a folga das curtas ("Sim. E você?") não passa do meio do vão:
 * tocar perto de uma nunca revela a outra, e o que está no meio continua pegando o toque.
 */
function trimPads(marks: Mark[]): void {
  for (const line of linesOf(marks)) {
    line.sort((a, b) => a.x - b.x);
    for (let k = 1; k < line.length; k++) {
      const a = line[k - 1];
      const b = line[k];
      const gap = b.x - (a.x + a.w);
      const half = Math.max(0, gap / 2);
      const glued = a.i === b.i && a.glue && gap <= 1.5 * Math.max(a.h, b.h);
      a.right = glued ? half : Math.min(a.right, half);
      b.left = glued ? half : Math.min(b.left, half);
    }
  }
}

/**
 * Os pedaços em cada linha de cada camada. A mesma linha é a dos pedaços que se cobrem na altura (pelo menos
 * metade do mais baixo), e não a do mesmo topo: o código no meio da frase, o emoji de outra fonte e o expoente
 * começam um pouco acima ou abaixo das letras em volta.
 */
function linesOf(marks: readonly Mark[]): Mark[][] {
  const byLayer = new Map<HTMLElement, Mark[]>();
  for (const m of marks) {
    let list = byLayer.get(m.layer);
    if (!list) byLayer.set(m.layer, (list = []));
    list.push(m);
  }
  const lines: Mark[][] = [];
  for (const list of byLayer.values()) {
    list.sort((a, b) => a.y - b.y);
    let bottom = -Infinity;
    let low = Infinity;
    for (const m of list) {
      // (em ordem de topo: o que cobre a linha é o que vai do topo dele até o pé dela)
      if (Math.min(bottom, m.y + m.h) - m.y < Math.min(low, m.h) / 2) {
        lines.push([]);
        bottom = -Infinity;
        low = Infinity;
      }
      lines[lines.length - 1].push(m);
      bottom = Math.max(bottom, m.y + m.h);
      low = Math.min(low, m.h);
    }
  }
  return lines;
}

/** O que fica no meio da frase sem ser texto, e pega o toque sozinho (o spoiler fechado é `inert`). */
const OBJECTS = 'img, picture, svg, video, audio, canvas, iframe, input, button, app-note-widget, [inert]';

/**
 * As duas palavras estão coladas: entre o fim de uma e o começo da outra só há espaço, pontuação ou símbolo,
 * à mostra? Não, com o que a voz pula no meio (o spoiler fechado, o que só o leitor de tela ouve, o botão,
 * a imagem): esse continua pegando o próprio toque.
 */
function joined(a: readonly Piece[], b: readonly Piece[]): boolean {
  const end = a[a.length - 1];
  const start = b[0];
  if (!end || !start) return false;
  // no mesmo nó de texto, entre as duas palavras só há o que não é palavra
  if (end.node === start.node) return true;
  if (!end.node.isConnected || !start.node.isConnected) return false;
  // o que está entre os dois nós, na ordem do documento (o resto dos dois nós só tem o que não é palavra)
  const doc = end.node.ownerDocument;
  const range = doc.createRange();
  range.setStart(end.node, 0);
  range.setEnd(start.node, 0);
  const walk = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  walk.currentNode = end.node;
  for (let n = walk.nextNode(); n && n !== start.node; n = walk.nextNode()) {
    if (n instanceof Element ? n.matches(OBJECTS) : SPEAKS.test((n as Text).data)) return false;
  }
  return true;
}

/** O número da frase do rabisco tocado (-1 fora de um). */
function indexOf(target: EventTarget | null): number {
  const box = target instanceof HTMLElement && target.tagName === 'I' ? target.parentElement : target;
  const p = box instanceof HTMLElement ? box.dataset['p'] : undefined;
  return p === undefined ? -1 : Number(p);
}

/**
 * A tinta e o corpo da letra. A letra transparente (o spoiler no meio de se revelar, que sai do transparente
 * devagar) não dá um rabisco invisível: vale a tinta do primeiro em volta que tem cor, até a raiz.
 */
function lookOf(el: Element, root: Element, memo: Map<Element, Look>): Look {
  let look = memo.get(el);
  if (!look) {
    const css = getComputedStyle(el);
    let color = css.color;
    for (let up: Element | null = el; up && clear(color) && up !== root; ) {
      up = up.parentElement;
      if (up) color = getComputedStyle(up).color;
    }
    look = { color, size: css.fontSize };
    memo.set(el, look);
  }
  return look;
}

/** A cor não pinta nada (transparente, ou quase)? O navegador devolve "rgb(r, g, b)" ou "rgba(r, g, b, a)". */
function clear(color: string): boolean {
  if (color === 'transparent') return true;
  const alpha = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/.exec(color)?.[1];
  return alpha !== undefined && parseFloat(alpha) < 0.05;
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
