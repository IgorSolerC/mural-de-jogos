import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FbNode, noteColor, noteLook, noteParts } from '../../core/free-board';
import { calloutFallbackTitle, calloutPaper } from '../../core/callouts';
import { CALLOUT_ICON } from '../callout-looks';
import { NoteLinks } from '../../core/note-links';
import { plainText } from '../../core/rich-text';
import { WIDGET_LINES, parseWidgetLine, readCardRef, widgetDef, widgetSpoken } from '../../core/widgets';
import { ICON, IconModule } from '../icons';
import { NoteWidget } from '../note-widget';
import { RichText } from '../rich-text';
import { DEFAULT_FRAME } from './far-layer';
import { PieceInfo } from './scene';

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
    '[style.height.px]': 'fixedHeight()',
    '[style.min-height.px]': 'fixedHeight() === null ? node().h : null',
    '[style.--line.px]': 'line()',
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
              <app-rich-text class="tabela" [text]="src()" [links]="links()" />
            } @else {
              <app-note-widget [name]="w.name" [args]="w.args" [size]="w.size" [links]="links()" />
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

  /** A moldura e o bilhete têm a altura guardada; o widget, a do próprio conteúdo (decisão D9). */
  protected readonly fixedHeight = computed(() => {
    const kind = this.info().kind;
    if (kind === 'moldura' || kind === 'bilhete' || this.level() === 'meio') return this.node().h;
    return null;
  });

  /**
   * A linha da pauta que o widget usa para medir o tamanho dele (`--widget-alto` = linhas × linha): no
   * quadro não há pauta, então a linha sai da altura guardada, e o widget enche a caixa dele.
   */
  protected readonly line = computed(() => {
    const w = this.info().kind === 'moldura' || this.info().kind === 'bilhete' ? null : this.widget();
    if (!w || w.body) return null;
    return Math.max(6, this.node().h / (WIDGET_LINES[w.size] ?? WIDGET_LINES.medio));
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

}
