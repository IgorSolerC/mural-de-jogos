import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DEFAULT_PALETTE, clampSide, gridOf, paletteWord, parseColors } from '../core/pixel-art';
import { PixelDraft, draftWhen } from '../core/pixel-drafts';
import { ICON, IconModule } from './icons';
import { PixelThumb } from './pixel-thumb';

/**
 * Um rascunho do ateliê na galeria de pixel arts (PLANO-RASCUNHOS-PIXEL.md, D9), na seção Rascunhos do alto da raiz:
 * a mesma peça da obra na Grade (ui/pixel-tile.ts, o desenho sozinho num quadrado e o nome embaixo), com de onde ele
 * veio e quando foi guardado. Tocar continua no ateliê; com a mão em cima, a etiqueta (Continuar e Descartar) no
 * padrão do Finalizar e do Fixar (`ui/_etiqueta-acoes.scss`). O aberto no ateliê de outra aba (D11) não continua daqui.
 */
@Component({
  selector: 'app-pixel-draft-tile',
  imports: [IconModule, PixelThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.ocupado]': 'busy()',
  },
  template: `
    <span class="quadro">
      <app-pixel-thumb [art]="art()" />
    </span>
    <button type="button" class="hit" [attr.aria-disabled]="busy() || null" (click)="!busy() && continued.emit()">
      <span class="sr-only">Continuar o rascunho {{ title() }}, {{ meta() }}</span>
    </button>
    <span class="linha">
      <!-- o nome e de onde veio juntos: sem mouse, a etiqueta vem depois dos dois -->
      <span class="textos">
        <span class="nome" [class.sem-titulo]="!draft().title" dir="auto">{{ title() }}</span>
        <span class="meta" aria-hidden="true">{{ meta() }}</span>
      </span>
      @if (!busy()) {
        <div class="acoes etiqueta">
          <button type="button" class="botao continuar" [attr.aria-label]="'Continuar o rascunho ' + title() + ' no ateliê'" title="Continuar no ateliê" (click)="continued.emit()">
            <lucide-icon [img]="BrushIcon" [size]="16" aria-hidden="true" />
          </button>
          <button type="button" class="botao descartar" [attr.aria-label]="'Descartar o rascunho ' + title()" title="Descartar o rascunho" (click)="discarded.emit()">
            <lucide-icon [img]="TrashIcon" [size]="16" aria-hidden="true" />
          </button>
        </div>
      }
    </span>
  `,
  styles: `
    @use 'obra-galeria' as obra;
    @use 'etiqueta-acoes' as et;

    :host {
      position: relative;
      display: grid;
      gap: 6px;
      align-content: start;
      isolation: isolate;
    }
    :host(:hover),
    :host(:focus-within) {
      z-index: 30;
    }
    .quadro {
      display: block;
      aspect-ratio: 1;
      transition:
        translate var(--t-ui) var(--ease-ui),
        filter var(--t-ui) var(--ease-ui);
    }
    :host(:not(.ocupado):hover) .quadro,
    :host(:focus-within) .quadro {
      translate: 0 -3px;
      filter: drop-shadow(0 8px 8px rgb(0 0 0 / 0.45));
    }

    /* o toque, o título e o lugar da etiqueta: os da obra na Grade (ui/_obra-galeria.scss) */
    @include obra.na-parede('.quadro');

    .linha {
      margin-top: 4px;
    }
    .textos {
      flex: 1 1 6em;
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .meta {
      font-family: var(--f-label);
      font-weight: 600;
      font-size: 0.78rem;
      line-height: 1.2;
      color: var(--wall-ink-2);
    }

    .acoes {
      @include et.grupo;
    }
    .botao {
      @include et.botao;
    }
    .continuar {
      @include et.cor-na-mao(var(--etiqueta-amarelo));
    }
    .descartar {
      @include et.cor-na-mao(var(--etiqueta-vermelho));
    }
    :host(:hover) .botao,
    .acoes:has(:focus-visible) .botao {
      @include et.mostra;
    }

    /* aberto no ateliê de outra aba: à vista, apagado, sem continuar daqui */
    :host(.ocupado) .quadro {
      opacity: 0.45;
    }
    :host(.ocupado) .hit {
      cursor: default;
    }
  `,
})
export class PixelDraftTile {
  readonly draft = input.required<PixelDraft>();
  /** A obra de onde o rascunho veio ainda está na galeria (sem ela, ele vira uma obra nova). */
  readonly pieceThere = input(false);
  /** Aberto no ateliê de outra aba. */
  readonly busy = input(false);
  readonly continued = output<void>();
  readonly discarded = output<void>();

  protected readonly BrushIcon = ICON.paleta;
  protected readonly TrashIcon = ICON.apagar;

  protected readonly title = computed(() => this.draft().title || 'Sem título');
  protected readonly art = computed(() => {
    const v = this.draft().values;
    const w = clampSide(v['width']);
    const h = clampSide(v['height']);
    return { w, h, rows: gridOf(v['pixels'] ?? '', w, h), palette: paletteWord(v['palette'] ?? '') ?? DEFAULT_PALETTE, colors: parseColors(v['colors'] ?? '') ?? {} };
  });
  /** De onde veio e quando foi guardado ("Mudanças na obra · hoje às 14:32"). */
  protected readonly meta = computed(() => {
    if (this.busy()) return 'Aberto no ateliê de outra aba';
    const o = this.draft().origin;
    const from = o.kind === 'obra' ? (this.pieceThere() ? 'Mudanças na obra' : 'A obra saiu da galeria') : o.kind === 'widget' ? 'De um widget das anotações' : 'Pixel art nova';
    return `${from} · ${draftWhen(this.draft().savedAt)}`;
  });
}
