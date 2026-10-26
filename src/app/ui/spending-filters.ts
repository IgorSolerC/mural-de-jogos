import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output } from '@angular/core';
import { FilterGroup, FilterKey } from '../core/spending-filter';

/** Cada adesivo colado entra com um torto diferente, como colado à mão (os mesmos da cartela do mural). */
const TILTS = [-2, 1.6, -1.2, 2.2, -1.8, 1.1, -2.4, 1.4];

/**
 * A cartela de filtros dos Gastos: a mesma folha de adesivos do mural, presa com fita-crepe embaixo da
 * pasta. Cada opção é o recorte tracejado ainda na folha; a ligada sai colada em tinta. Dentro de um grupo
 * vale qualquer uma das coladas; entre grupos, todas juntas. O número ao lado diz quantos lançamentos ela
 * mostraria, e a que não mostraria nenhum fica apagada. Embaixo, quantos sobraram, Limpar tudo e Pronto.
 */
@Component({
  selector: 'app-spending-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', 'aria-label': 'Filtros da fita', '(keydown.escape)': '$event.stopPropagation(); done.emit()' },
  template: `
    <span class="fita fita-l" aria-hidden="true"></span>
    <span class="fita fita-r" aria-hidden="true"></span>

    <div class="grupos">
      @for (g of groups(); track g.key) {
        <fieldset class="grupo" [class]="'g-' + g.key">
          <legend class="cabeca">
            <span class="grupo-nome">{{ g.title }}</span>
            @if (chosen(g)) {
              <button type="button" class="limpar" (click)="clearGroup.emit(g.key)" [attr.aria-label]="'Limpar ' + g.title">limpar</button>
            }
          </legend>
          <div class="opts">
            @for (o of g.options; track o.value; let i = $index) {
              <label class="filtro-opcao" [class.zerada]="!o.n && !o.on">
                <input type="checkbox" [checked]="o.on" [disabled]="!o.n && !o.on" (change)="toggle.emit({ key: g.key, value: o.value })" />
                <span class="adesivo" [class.recorte]="!o.on" [class.colado]="o.on" [style.--cola]="tilt(i)">
                  @if (o.color) {
                    <span class="selo" [style.--cor]="'var(--stock-' + o.color + ')'" aria-hidden="true"></span>
                  }
                  {{ o.label }}
                </span>
                <span class="n" aria-hidden="true">{{ o.n }}</span>
                <span class="sr-only">({{ o.n }})</span>
              </label>
            }
          </div>
        </fieldset>
      }
    </div>

    <div class="pe">
      <p class="conta" aria-live="polite">{{ shown() === total() ? 'Mostrando todos os ' + total() : 'Mostrando ' + shown() + ' de ' + total() }}</p>
      <div class="pe-acoes">
        @if (shown() !== total() || active()) {
          <button type="button" class="limpar" (click)="clearAll.emit()">Limpar tudo</button>
        }
        <button type="button" class="pronto" (click)="done.emit()">Pronto</button>
      </div>
    </div>
  `,
  styles: `
    @use 'paper-kit' as kit;
    @use 'spending-kit' as gk;

    :host {
      @include kit.cartela;
    }

    @include kit.cartela-fitas('.fita-l', '.fita-r');

    /* os grupos em colunas iguais, que se alinham de uma fileira para a outra; Categoria, que tem mais
       adesivos, ocupa duas (com a cartela larga) */
    .grupos {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      align-items: start;
      gap: 22px 40px;
    }
    .grupo {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }
    @media (min-width: 760px) {
      .g-category {
        grid-column: span 2;
      }
    }

    .cabeca {
      display: flex;
      align-items: baseline;
      gap: 10px;
      width: 100%;
      min-height: 26px;
      margin: 0 0 8px;
      padding: 0;
    }
    .grupo-nome {
      @include gk.peca-titulo;
    }

    /* "limpar": risco de caneta pequeno, como na cartela do mural */
    .limpar {
      min-height: 26px;
      margin: -4px 0;
      padding: 2px 6px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1;
      text-decoration: underline 1.5px;
      text-underline-offset: 4px;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);

      &:hover {
        background: rgb(21 21 21 / 0.06);
      }
      &:focus-visible {
        outline: 3px solid var(--ink);
        outline-offset: 0;
      }
    }

    .opts {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
    }

    /* a opção é o adesivo e, ao lado, quantos lançamentos ele mostra */
    .filtro-opcao {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding-right: 2px;
      cursor: pointer;

      input {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        margin: 0;
      }
      &:has(input:focus-visible) .adesivo {
        outline: 2.5px solid var(--ink);
        outline-offset: 2px;
      }
    }
    .filtro-opcao.zerada {
      cursor: default;
      opacity: 0.4;
    }

    /* recorte e colado ocupam o mesmo lugar: nada pula ao colar */
    .adesivo {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 11px;
      border-radius: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.88rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
      transition:
        background-color var(--t-ui) var(--ease-ui),
        rotate var(--t-physical) var(--ease-physical);
    }
    .recorte {
      outline: 1.5px dashed rgb(21 21 21 / 0.42);
      outline-offset: -1.5px;
      color: rgb(21 21 21 / 0.74);
    }
    .filtro-opcao:not(.zerada):hover .recorte {
      background: rgb(21 21 21 / 0.06);
      color: var(--ink);
    }
    .colado {
      background: var(--ink);
      color: var(--paper);
      box-shadow: 0 2px 3px rgb(0 0 0 / 0.3);
      rotate: var(--cola);
    }
    .selo {
      @include gk.selo(11px);
    }
    .colado .selo {
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.5);
    }

    .n {
      min-width: 1.4ch;
      font-family: var(--f-label);
      font-weight: 600;
      font-size: 0.86rem;
      letter-spacing: 0.02em;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }

    .pe {
      @include kit.cartela-pe;
    }

    @media (prefers-reduced-motion: reduce) {
      .adesivo {
        transition: none;
      }
    }
  `,
})
export class SpendingFilters {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly groups = input.required<FilterGroup[]>();
  /** Quantos lançamentos a fita mostra com os filtros, e quantos o mês tem. */
  readonly shown = input.required<number>();
  readonly total = input.required<number>();
  /** Há algum filtro ligado. */
  readonly active = input(false);
  readonly toggle = output<{ key: FilterKey; value: string }>();
  readonly clearGroup = output<FilterKey>();
  readonly clearAll = output<void>();
  readonly done = output<void>();

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus({ preventScroll: true }));
  }

  protected chosen(g: FilterGroup): boolean {
    return g.options.some((o) => o.on);
  }

  protected tilt(i: number): string {
    return `${TILTS[i % TILTS.length] * 0.5}deg`;
  }
}
