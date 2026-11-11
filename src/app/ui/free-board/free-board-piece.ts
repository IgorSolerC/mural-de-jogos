import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, untracked, viewChild } from '@angular/core';
import { FbNode, noteColor, noteLook, noteParts } from '../../core/free-board';
import { calloutFallbackTitle, calloutPaper } from '../../core/callouts';
import { CALLOUT_ICON } from '../callout-looks';
import { NoteLinks } from '../../core/note-links';
import { plainText } from '../../core/rich-text';
import { parseWidgetLine, readCardRef, widgetDef, widgetSpoken } from '../../core/widgets';
import { HOLE } from '../../core/free-board-geometry';
import { ICON, IconModule } from '../icons';
import { NoteWidget } from '../note-widget';
import { RichText } from '../rich-text';
import { DEFAULT_FRAME } from './far-layer';
import { PieceInfo } from './scene';
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
  imports: [NoteWidget, RichText, IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'group',
    tabindex: '-1',
    '[attr.aria-label]': 'spoken()',
    '[attr.data-peca]': 'node().i',
    '[attr.data-tipo]': 'info().kind',
    '[attr.data-nivel]': 'level()',
    '[attr.data-cor]': 'color()',
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
             cima (a primeira linha), o resto embaixo e o pé rasgado. No meio, só o papel e o título -->
        <div class="cartao" [attr.data-jeito]="paper()" [class.liso]="level() === 'meio'">
          @if (cardTitle2(); as t) {
            <div class="cartao-topo">
              @if (cardIcon(); as ic) {
                <span class="cartao-icone" aria-hidden="true"><lucide-icon [img]="ic" [size]="18" /></span>
              }
              <span class="cartao-titulo">{{ t }}</span>
            </div>
          }
          @if (level() === 'perto' && parts().body.trim()) {
            <app-rich-text class="cartao-corpo" [text]="parts().body" [links]="links()" />
          }
        </div>
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
            <div class="esperando"></div>
          }
        } @else if (info().kind === 'nota') {
          <div class="tira"><span>{{ cardTitle() }}</span></div>
        } @else {
          <div class="leve">
            <lucide-icon [img]="icon()" [size]="20" aria-hidden="true" />
            <span>{{ widgetName() }}</span>
          </div>
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
  protected readonly cardIcon = computed(() => CALLOUT_ICON[this.look()]);
  protected readonly cardTitle = computed(() => {
    const w = this.widget();
    return w ? readCardRef(w.args).title || 'Anotação' : 'Anotação';
  });
  protected readonly widgetName = computed(() => widgetDef(this.widget()?.name ?? '')?.label ?? 'Widget');
  protected readonly icon = computed(() => {
    switch (this.widget()?.name) {
      case 'contador':
        return ICON.ampulheta;
      case 'video':
        return ICON.video;
      case 'audio':
        return ICON.som;
      case 'tabela':
        return ICON.tabela;
      case 'pixel':
        return ICON.pixelArt;
      default:
        return ICON.imagem;
    }
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
 * A altura que o card do texto pede para mostrar tudo o que tem (o título, o corpo inteiro e o pé rasgado), em px do
 * mundo, medida no próprio card por um instante sem o corte embaixo (a classe `medindo`). Null se o card não está
 * desenhado com o texto (longe ou no meio, onde só o título aparece).
 */
export function cardNeed(piece: HTMLElement): number | null {
  const card = piece.querySelector<HTMLElement>(':scope > .cartao');
  if (!card || card.classList.contains('liso')) return null;
  card.classList.add('medindo');
  const h = card.offsetHeight;
  card.classList.remove('medindo');
  // o rasgo fica nos 7 px de baixo da peça
  return h ? h + 7 : null;
}
