import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { CardFinder } from '../../core/card-finder';
import { FbNode, noteColor, noteFont, noteLook, noteParts } from '../../core/free-board';
import { calloutFallbackTitle, calloutPaper } from '../../core/callouts';
import { noteIcon } from '../callout-looks';
import { NoteLinks } from '../../core/note-links';
import { plainText } from '../../core/rich-text';
import { parseWidgetLine, widgetDef, widgetSpoken } from '../../core/widgets';
import { HOLE } from '../../core/free-board-geometry';
import { IconModule } from '../icons';
import { NoteWidget } from '../note-widget';
import { CODE_COPY, RichText } from '../rich-text';
import { DEFAULT_FRAME } from './far-layer';
import { PieceInfo } from './scene';
import { SketchItem, pieceItems, sketchFontsReady } from './sketch-model';
import { PHOTO_WAIT, cardsFrom, pieceLook } from './far-look';
import { SketchShapes } from './sketch-shapes';
import { cardItems } from './card-sketch';
import { PieceMeasure, sameMeasure } from './edit-ops';

/**
 * O widget no quadro é desenhado nesta largura (a de uma coluna de leitura: o que enche a linha fica com ela) e
 * com a linha da pauta do tamanho do furo da parede, e depois ampliado ou reduzido por igual até encher a caixa.
 */
export const WIDGET_BASE_W = 480;
export const WIDGET_BASE_LINE = HOLE;

/** O que a peça mediu do widget dela (ver `PieceMeasure`), e se já é a medida de verdade (a foto chegou, abriu). */
export type PieceMeasured = PieceMeasure & { id: string; settled: boolean };

/**
 * Uma peça do Quadro livre (PLANO-QUADRO-LIVRE.md, seções 3, 4.5 e 9.3), no nível de detalhe que a câmera
 * pede: perto, a peça de verdade (o widget das anotações, o feltro com a costura, o bilhete rasgado com a
 * sombra); no meio, a versão leve (a miniatura da foto, a tira com o título, o ícone e o nome do widget, o
 * papel liso), sem sombra nem grão. De longe a peça nem é montada: vira um retângulo no canvas (far-layer.ts).
 *
 * Só lê: o que muda o quadro chega na rodada de editar, pela página do dono.
 */
@Component({
  selector: 'app-free-board-piece',
  imports: [NoteWidget, RichText, IconModule, SketchShapes],
  // a peça se pega e se arrasta pelo texto: o código na linha não copia aqui (nem no dos widgets dela)
  providers: [{ provide: CODE_COPY, useValue: false }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'group',
    tabindex: '-1',
    '[attr.aria-label]': 'spoken()',
    '[attr.data-peca]': 'node().i',
    '[attr.data-tipo]': 'info().kind',
    '[attr.data-nivel]': 'level()',
    '[attr.data-cor]': 'color()',
    // o tamanho da letra do card do texto (PLANO-CAIXAS-DE-TEXTO.md, D1): o card é em em, cresce por igual
    '[style.--fs]': 'font()',
    '[style.left.px]': 'node().x',
    '[style.top.px]': 'node().y',
    '[style.width.px]': 'node().w',
    '[style.height.px]': 'node().h',
  },
  styleUrl: './free-board-piece.scss',
  template: `
    @switch (info().kind) {
      @case ('moldura') {
        <div class="feltro" aria-hidden="true"></div>
        @if (title(); as t) {
          <span class="dymo" aria-hidden="true">{{ t }}</span>
        }
      }
      @case ('bilhete') {
        <!-- o texto é o card das anotações (core/callouts.ts): o papel do jeito ou da cor, o desenho e o título em
             cima (a primeira linha), o resto embaixo, na folha clara. No meio, só o papel e o título -->
        @if (level() === 'meio') {
          <svg class="de-longe" [attr.viewBox]="box()" preserveAspectRatio="none" aria-hidden="true"><g appSketchShapes [items]="far()"></g></svg>
        } @else {
        <!-- o que não cabe (PLANO-CAIXAS-DE-TEXTO.md, D4): o corpo mostra as linhas inteiras que cabem e o "…" no fim
             da última; sem lugar para nenhuma, a folha clara sai e o "…" vai no fim do título (ver fitCard) -->
        <div #cartao class="cartao" [attr.data-jeito]="paper()">
          @if (cardTitle2(); as t) {
            <div class="cartao-topo">
              @if (cardIcon(); as ic) {
                <span class="cartao-icone" aria-hidden="true"><lucide-icon [img]="ic" [size]="18" /></span>
              }
              <span class="cartao-titulo">{{ t }}</span>
            </div>
          }
          @if (parts().body.trim()) {
            <div class="cartao-corpo">
              <app-rich-text class="cartao-texto" [text]="parts().body" [links]="links()" />
              <span class="reticencias" aria-hidden="true">…</span>
            </div>
          }
        </div>
        }
      }
      @default {
        @if (level() === 'perto') {
          @if (widget(); as w) {
            @if (w.body) {
              <!-- a tabela enche a caixa: as linhas quebram na largura e as fileiras esticam até a altura dela -->
              <app-rich-text #tabela class="tabela encher" [text]="src()" [links]="links()" />
            } @else {
              <!-- o widget desenhado no tamanho de base e ampliado por igual até encher a caixa (ver measure) -->
              <div #escala class="escala" [style.width.px]="baseW" [style.--line.px]="baseLine">
                <app-note-widget [name]="w.name" [args]="w.args" [size]="w.size" [links]="links()" />
              </div>
            }
          }
        } @else if (info().kind === 'imagem') {
          @if (thumb(); as url) {
            <img class="miniatura" [src]="url" alt="" decoding="async" draggable="false" />
          } @else {
            <div class="esperando" [style.background]="photoWait"></div>
          }
        } @else {
          <!-- no meio: a aparência de longe (far-look.ts), a mesma da miniatura do canvas e da camada de longe -->
          <svg class="de-longe" [attr.viewBox]="box()" preserveAspectRatio="none" aria-hidden="true"><g appSketchShapes [items]="far()"></g></svg>
        }
      }
    }
  `,
})
export class FreeBoardPiece {
  readonly node = input.required<FbNode>();
  readonly info = input.required<PieceInfo>();
  readonly level = input.required<'perto' | 'meio'>();
  /** A miniatura pronta da imagem (para o meio), ou null. */
  readonly thumb = input<string | null>(null);
  /** O zoom da última conta da cena: o texto do nível meio se mede em px da tela. */
  readonly zoom = input(1);
  /** Quantas peças a moldura tem dentro (para o nome falado). */
  readonly count = input(0);
  readonly links = input<NoteLinks | null>(null);

  protected readonly src = computed(() => {
    const n = this.node();
    return n.t === 'w' ? n.src : '';
  });
  protected readonly text = computed(() => {
    const n = this.node();
    return n.t === 'x' ? n.txt : '';
  });
  protected readonly title = computed(() => {
    const n = this.node();
    return n.t === 'm' ? (n.nome ?? '') : '';
  });
  protected readonly font = computed(() => {
    const n = this.node();
    return n.t === 'x' ? noteFont(n) : null;
  });
  protected readonly color = computed(() => {
    const n = this.node();
    return n.t === 'm' ? (n.c ?? DEFAULT_FRAME) : (n.c ?? null);
  });

  /** O widget lido da linha (o nome do registro, os parâmetros, o tamanho e se mora em várias linhas). */
  protected readonly widget = computed(() => {
    const parsed = parseWidgetLine(this.src().split('\n')[0]);
    if (!parsed) return this.src().trim() ? { name: 'tabela', args: [] as string[], size: 'medio' as const, body: true } : null;
    return { ...parsed, body: !!widgetDef(parsed.name)?.body };
  });

  /** O texto como card: o jeito, o papel, o título (sem um, o nome do jeito) e o que tem dentro. */
  protected readonly look = computed(() => {
    const n = this.node();
    return n.t === 'x' ? noteLook(n) : 'nota';
  });
  protected readonly paper = computed(() => {
    const n = this.node();
    return n.t === 'x' ? calloutPaper(this.look(), noteColor(n)) : null;
  });
  protected readonly parts = computed(() => noteParts(this.text()));
  protected readonly cardTitle2 = computed(() => plainText(this.parts().title).trim() || calloutFallbackTitle(this.look()));
  protected readonly cardIcon = computed(() => {
    const n = this.node();
    return n.t === 'x' ? noteIcon(this.look(), n.ic) : null;
  });
  private readonly cards = cardsFrom(inject(CardFinder));
  /** A foto que ainda não chegou: o mesmo escuro da camada de longe. */
  protected readonly photoWait = PHOTO_WAIT;
  /** A caixa do desenho do meio: a peça no mundo. */
  protected readonly box = computed(() => {
    const n = this.node();
    return `${n.x} ${n.y} ${n.w} ${n.h}`;
  });
  /** O desenho do meio: a aparência de longe da peça, com o texto em px da tela (o zoom da conta). */
  protected readonly far = computed<SketchItem[]>(() => {
    if (this.level() !== 'meio') return [];
    sketchFontsReady();
    const items: SketchItem[] = [];
    const n = this.node();
    // o card do texto em proporção (o mesmo da peça de perto, menor: PLANO-CAIXAS-DE-TEXTO.md, D5); os outros no modo
    // rico, como o assado da miniatura: quanto falta no contador, as fileiras da tabela
    if (n.t === 'x') cardItems(items, n, pieceLook(n, this.cards, this.info()), this.zoom(), sketchFontsReady());
    else pieceItems(items, n, pieceLook(n, this.cards, this.info()), this.zoom(), { now: Date.now() });
    return items;
  });

  /** O nome falado (seção 4.9): "Moldura Roxo (Quartos), 12 peças", "Texto: Senha?", "Imagem". */
  protected readonly spoken = computed(() => {
    switch (this.info().kind) {
      case 'moldura': {
        const n = this.count();
        return `Moldura ${this.title() || 'sem título'}, ${n} ${n === 1 ? 'peça' : 'peças'}`;
      }
      case 'bilhete':
        return `Texto: ${plainText(this.text()).replace(/\s+/g, ' ').trim().slice(0, 120)}`;
      default: {
        const w = this.widget();
        return w ? widgetSpoken(w.name, w.args) : 'Widget';
      }
    }
  });

  /** O desenho do widget mediu outra proporção (o quadro acerta a caixa por ela; ver edit-ops.ts, `fitMeasured`). */
  readonly measured = output<PieceMeasured>();
  protected readonly baseW = WIDGET_BASE_W;
  protected readonly baseLine = WIDGET_BASE_LINE;

  private readonly escala = viewChild<ElementRef<HTMLElement>>('escala');
  private readonly cartao = viewChild<ElementRef<HTMLElement>>('cartao');
  private readonly table = viewChild('tabela', { read: ElementRef<HTMLElement> });
  /** O desenho medido: o tamanho dele e onde ele começa dentro da escala (o widget tem respiro em volta). */
  private drawn: { w: number; h: number; x: number; y: number } | null = null;
  private told: PieceMeasured | null = null;
  /** A proporção do quadro de animação anterior: a medida só vale quando se repete (ver `measure`). */
  private lastRatio = 0;

  constructor() {
    // a escala apareceu (o widget perto) ou a linha mudou (o texto do widget, que nem sempre muda o tamanho):
    // mede do zero, e de novo quando o desenho chega, muda de tamanho ou fica pronto
    effect((onCleanup) => {
      const box = this.escala()?.nativeElement;
      this.src();
      this.drawn = null;
      this.told = null;
      this.lastRatio = 0;
      if (!box) return;
      onCleanup(watchDrawing(box, (again) => this.measure(box, again)));
    });
    // a tabela: a altura que o conteúdo pede na largura da caixa (quando a largura muda, o texto muda ou chega)
    effect((onCleanup) => {
      const host = this.table()?.nativeElement;
      this.src();
      this.told = null;
      if (!host) return;
      onCleanup(watchDrawing(host, () => this.measureTable(host)));
    });
    // o card do texto de perto: o que não cabe vira "…", a cada mudança do texto, do tamanho ou da letra, e quando a
    // letra a pincel chega (ela quebra as linhas em outro lugar)
    afterRenderEffect((onCleanup) => {
      this.node();
      const card = this.cartao()?.nativeElement;
      if (!card) return;
      fitCard(card);
      // ... e quando o que tem dentro muda de tamanho sozinho (a foto de um widget no texto que chega depois)
      const text = card.querySelector<HTMLElement>('.cartao-texto');
      if (!text) return;
      let frame = 0;
      const ro = new ResizeObserver(() => {
        if (!frame) frame = requestAnimationFrame(() => ((frame = 0), fitCard(card)));
      });
      for (const kid of text.children) ro.observe(kid);
      onCleanup(() => {
        cancelAnimationFrame(frame);
        ro.disconnect();
      });
    });
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    if (fonts) {
      const again = () => {
        const card = this.cartao()?.nativeElement;
        if (card) fitCard(card);
      };
      fonts.addEventListener('loadingdone', again);
      inject(DestroyRef).onDestroy(() => fonts.removeEventListener('loadingdone', again));
    }
    // a caixa mudou (o tamanho, a proporção acertada): a mesma medida, na escala nova
    effect(() => {
      this.node();
      untracked(() => this.place());
    });
  }

  private measure(box: HTMLElement, again: () => void): void {
    const piece = drawingIn(box);
    if (!piece || !piece.offsetWidth || !piece.offsetHeight) return;
    const at = offsetIn(piece, box);
    this.drawn = { w: piece.offsetWidth, h: piece.offsetHeight, ...at };
    // só o desenho pega o ponteiro: a escala é mais larga que a caixa, e a sobra dela cobriria as peças vizinhas
    piece.style.pointerEvents = 'auto';
    this.place();
    // o que ainda não é o desenho de verdade (a foto revelando, o que não abriu, a que acabou de chegar e ainda não
    // tem altura) não acerta a caixa guardada
    const ready = !box.querySelector('[data-sem-medida]') && [...piece.querySelectorAll('img')].every((img) => img.offsetHeight > 0 || getComputedStyle(img).display === 'none');
    // ... nem o widget que acabou de ser montado e ainda não recebeu o que mostra (sem as classes, sem a foto): a
    // medida só vale quando é a mesma no quadro seguinte (se mudou, mede de novo nele)
    const r = this.drawn.w / this.drawn.h;
    const steady = Math.abs(r - this.lastRatio) / r < 0.002;
    this.lastRatio = r;
    if (ready && !steady) again();
    this.tell({ src: untracked(this.src), r }, ready && steady);
  }

  /** A tabela sem esticar, por um instante (a classe `medindo` de ui/rich-text.ts): a altura do conteúdo. */
  private measureTable(host: HTMLElement): void {
    // puxar só a altura não mede de novo: na mesma largura e com o mesmo texto, o conteúdo só pede outra altura se
    // passou da caixa (a letra que chegou depois quebrou mais linhas)
    const w = host.offsetWidth;
    const t = this.told;
    if (t && 'w' in t && t.w === w && t.src === untracked(this.src) && host.scrollHeight <= host.clientHeight + 1) return;
    host.classList.add('medindo');
    const minH = host.offsetHeight;
    host.classList.remove('medindo');
    if (minH) this.tell({ src: untracked(this.src), w, minH }, true);
  }

  /** Avisa o quadro da medida, se ela é outra (os décimos da proporção não contam). */
  private tell(m: PieceMeasure, settled: boolean): void {
    const t = this.told;
    if (t && t.src === m.src && t.settled === settled && sameMeasure(t, m)) return;
    this.told = { ...m, id: untracked(this.node).i, settled };
    this.measured.emit(this.told);
  }

  /** Amplia o desenho até encher a caixa (na proporção acertada, enche certinho; antes disso, cabe nela). */
  private place(): void {
    const el = this.escala()?.nativeElement;
    const d = this.drawn;
    if (!el || !d) return;
    const n = untracked(this.node);
    const s = Math.min(n.w / d.w, n.h / d.h);
    el.style.transform = `scale(${s}) translate(${-d.x}px, ${-d.y}px)`;
    el.style.visibility = 'visible';
  }
}

/**
 * O desenho do widget dentro de `root`: desce enquanto há um filho só no fluxo (o host do widget, o embrulho dele, o
 * lugar com folga em volta do cartão do contador) e para onde há mais de um (a foto com o broche e a imagem; a foto
 * e a legenda; o texto inteiro de uma nota, que enche a linha). Não desce para um filho com escala própria (o tamanho
 * dele no layout não é o que aparece).
 */
export function drawingIn(root: HTMLElement): HTMLElement | null {
  let el = root;
  for (let depth = 0; depth < 10; depth++) {
    const kids = flowKids(el);
    if (kids.length !== 1) break;
    const kid = kids[0];
    const cs = getComputedStyle(kid);
    if (cs.transform !== 'none' || cs.scale !== 'none') break;
    el = kid;
  }
  return el === root ? null : el;
}

/** Os filhos no fluxo (sem os soltos por cima nem os escondidos); os de um embrulho `display: contents` contam. */
function flowKids(el: Element): HTMLElement[] {
  return [...el.children].flatMap((kid) => {
    if (!(kid instanceof HTMLElement)) return [];
    const cs = getComputedStyle(kid);
    if (cs.display === 'contents') return flowKids(kid);
    return kid.offsetParent && cs.position !== 'absolute' && cs.position !== 'fixed' ? [kid] : [];
  });
}

/** Onde `el` começa dentro de `root` (o caminho dos `offsetParent`, sem as transformações). */
function offsetIn(el: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let at: HTMLElement | null = el;
  while (at && at !== root) {
    x += at.offsetLeft;
    y += at.offsetTop;
    const up: Element | null = at.offsetParent;
    at = up instanceof HTMLElement && root.contains(up) ? up : null;
  }
  return { x, y };
}

/**
 * Chama `measure` (no quadro de animação seguinte) quando o desenho dentro de `box` chega, troca, muda de tamanho
 * ou fica pronto (sai o `data-sem-medida`). Devolve o que desliga tudo.
 */
function watchDrawing(box: HTMLElement, measure: (again: () => void) => void): () => void {
  let frame = 0;
  let watched: Element | null = null;
  const later = () => {
    if (!frame) frame = requestAnimationFrame(run);
  };
  const ro = new ResizeObserver(later);
  const run = () => {
    frame = 0;
    const now = drawingIn(box);
    if (now !== watched) {
      if (watched) ro.unobserve(watched);
      if (now) ro.observe(now);
      watched = now;
    }
    measure(later);
  };
  ro.observe(box);
  const mo = new MutationObserver(later);
  mo.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-sem-medida'] });
  later();
  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    mo.disconnect();
  };
}

/**
 * O que não cabe no card do texto vira "…" (PLANO-CAIXAS-DE-TEXTO.md, D4), medido no próprio card, em px do mundo:
 *
 * - o título quebra em até 3 linhas, menos se faltar lugar para uma linha do corpo embaixo;
 * - o corpo mostra as linhas inteiras que cabem (cortado entre duas linhas, nunca no meio da letra) e, se sobrou texto,
 *   o "…" vai no fim da última que aparece (ou na ponta dela, por cima das últimas letras, quando ela enche a largura);
 * - sem lugar para nenhuma linha do corpo, a folha clara sai e o "…" vai no fim do título.
 *
 * As linhas são as caixas do texto de verdade (um Range em cada pedaço de texto), então valem a lista, a tarefa e o
 * negrito. Na escala da câmera as caixas vêm em px da tela: divididas pela escala do card.
 *
 * No fim, o card com o título cortado pela linha presa do CSS (o de mais de três linhas, ou encolhido para o corpo
 * caber) ganha `titulo-cortado`: ele também esconde texto (abre para ler no ver, com a lupa).
 */
export function fitCard(card: HTMLElement): void {
  fitLines(card);
  const title = card.querySelector<HTMLElement>('.cartao-titulo');
  // (meia linha de folga: a caixa das letras a pincel passa um pouco da linha, e isso não é linha escondida)
  card.classList.toggle('titulo-cortado', !!title && title.scrollHeight > title.clientHeight + lineOf(title) / 2);
}

function fitLines(card: HTMLElement): void {
  const title = card.querySelector<HTMLElement>('.cartao-titulo');
  const topo = title?.parentElement ?? null;
  const sheet = card.querySelector<HTMLElement>(':scope > .cartao-corpo');
  const text = sheet?.querySelector<HTMLElement>('.cartao-texto') ?? null;
  const dots = sheet?.querySelector<HTMLElement>('.reticencias') ?? null;
  // do zero: o título de até 3 linhas, a folha à mostra, o texto inteiro
  card.style.removeProperty('--titulo-linhas');
  card.classList.remove('sem-corpo', 'cortado');
  title?.classList.remove('com-mais');
  text?.style.removeProperty('max-height');
  if (!card.offsetHeight) return;
  const titleLine = title ? lineOf(title) : 0;
  // o que a faixa ocupa além das linhas do título (os respiros dela)
  const topoPad = topo && title ? topo.offsetHeight - title.offsetHeight : 0;
  const titleLines = title && titleLine ? Math.round(title.offsetHeight / titleLine) : 0;
  const clampTitle = (room: number) => {
    if (!titleLine) return;
    const n = Math.max(1, Math.min(3, Math.floor((room - topoPad + 0.5) / titleLine)));
    if (n < titleLines) card.style.setProperty('--titulo-linhas', String(n));
  };
  if (!sheet || !text) {
    // só o título: ele enche o card
    clampTitle(card.clientHeight);
    return;
  }
  const bodyLine = lineOf(text);
  // o lugar de uma linha do corpo: a linha, os respiros da folha e a moldura do pé
  const oneLine = bodyLine + padY(sheet) + (parseFloat(getComputedStyle(card).paddingBottom) || 0);
  if (topo && topo.offsetHeight + oneLine > card.clientHeight + 0.5) clampTitle(card.clientHeight - oneLine);
  if ((topo?.offsetHeight ?? 0) + oneLine > card.clientHeight + 0.5) {
    // nem uma linha do corpo cabe: a folha sai e o título diz que tem mais
    noBody(card, title, clampTitle);
    return;
  }
  if (text.scrollHeight <= text.clientHeight + 1) return;
  // (a letra desce um pouco na linha, `--texto-desce` de ui/rich-text.ts: a caixa dela passa do fim por isso, e não é
  // linha escondida; a tolerância é uma fração da linha)
  const room = text.clientHeight + bodyLine * 0.3;
  // a linha de cada pedaço de texto: a caixa da letra (a do Kalam é mais alta que a linha e passa para a vizinha) com
  // a altura da linha, no meio dela
  const lines = linesIn(text).map((l) => {
    const mid = (l.top + l.bottom) / 2;
    return { top: mid - bodyLine / 2, bottom: mid + bodyLine / 2, right: l.right };
  });
  const seen = lines.filter((l) => l.bottom <= room);
  if (!lines.length) {
    // sem texto (só um widget, uma foto): o "…" no canto de baixo, por cima do que foi cortado
    card.classList.add('cortado');
    if (!dots) return;
    dots.classList.add('por-cima');
    dots.style.left = `${text.offsetLeft + text.clientWidth - dots.offsetWidth}px`;
    dots.style.top = `${text.offsetTop + text.clientHeight - bodyLine}px`;
    dots.style.height = `${bodyLine}px`;
    return;
  }
  if (seen.length === lines.length) return;
  if (!seen.length) {
    noBody(card, title, clampTitle);
    return;
  }
  const bottom = Math.max(...seen.map((l) => l.bottom));
  text.style.maxHeight = `${bottom}px`;
  card.classList.add('cortado');
  if (!dots) return;
  // o "…" no fim da última linha que aparece; sem lugar depois dela, na ponta, por cima das últimas letras
  const last = seen.filter((l) => l.bottom > bottom - bodyLine / 2);
  const right = Math.max(...last.map((l) => l.right));
  const top = Math.min(...last.map((l) => l.top));
  dots.classList.toggle('por-cima', right + dots.offsetWidth > text.clientWidth + 0.5);
  const left = Math.min(right, text.clientWidth - dots.offsetWidth);
  dots.style.left = `${text.offsetLeft + left}px`;
  dots.style.top = `${text.offsetTop + top}px`;
  dots.style.height = `${bottom - top}px`;
}

/** Nem uma linha do corpo cabe: a folha clara sai, o título enche o card e termina em "…". */
function noBody(card: HTMLElement, title: HTMLElement | null, clampTitle: (room: number) => void): void {
  card.classList.add('sem-corpo');
  card.style.removeProperty('--titulo-linhas');
  clampTitle(card.clientHeight - (parseFloat(getComputedStyle(card).paddingBottom) || 0));
  title?.classList.add('com-mais');
}

/** A altura de uma linha do elemento (o line-height dele, em px). */
function lineOf(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight);
  return Number.isFinite(lh) ? lh : parseFloat(cs.fontSize) * 1.35;
}

function padY(el: HTMLElement): number {
  const cs = getComputedStyle(el);
  return (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
}

/** As linhas do texto (as caixas de cada pedaço de texto), em px do elemento, a partir do canto de cima dele. */
function linesIn(el: HTMLElement): { top: number; bottom: number; right: number }[] {
  const box = el.getBoundingClientRect();
  const scale = el.offsetWidth ? box.width / el.offsetWidth : 0;
  if (!scale) return [];
  const out: { top: number; bottom: number; right: number }[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    // (o texto só do leitor de tela, escondido, não é linha)
    if (!n.textContent?.trim() || n.parentElement?.closest('.sr-only')) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (!r.width || !r.height) continue;
      out.push({ top: (r.top - box.top) / scale, bottom: (r.bottom - box.top) / scale, right: (r.right - box.left) / scale });
    }
  }
  return out;
}

/**
 * A altura que o card do texto pede para mostrar tudo o que tem (o título, o corpo inteiro e a moldura do pé), em px do
 * mundo, medida no próprio card por um instante sem o corte embaixo (a classe `medindo`). Null se o card não está
 * desenhado com o texto (longe ou no meio, onde só o título aparece).
 */
export function cardNeed(piece: HTMLElement, fs?: number, w?: number): number | null {
  const card = piece.querySelector<HTMLElement>(':scope > .cartao');
  if (!card || card.classList.contains('liso')) return null;
  // com outra letra (a escolhida agora, antes de guardar) ou outra largura: a mesma conta, com elas por um instante
  const was = piece.style.getPropertyValue('--fs');
  const wasW = piece.style.width;
  if (fs !== undefined) piece.style.setProperty('--fs', String(fs));
  if (w !== undefined) piece.style.width = `${w}px`;
  card.classList.add('medindo');
  const h = card.offsetHeight;
  card.classList.remove('medindo');
  if (fs !== undefined) piece.style.setProperty('--fs', was);
  if (w !== undefined) piece.style.width = wasW;
  return h || null;
}
