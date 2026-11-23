import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output } from '@angular/core';
import { FacetGroup } from '../core/facets';
import { plural } from '../core/text';

let folhas = 0;

/**
 * A folha de filtros em linhas, a mesma dos filtros das Anotações (ui/filter-card.ts), presa com fita-crepe
 * embaixo da pasta: a da fita dos Gastos e a do Dicionário Japonês. Cada filtro uma linha, o nome e o que ele faz
 * à esquerda, os recortes à direita (o escolhido, o adesivo de tinta); dentro de uma linha vale qualquer um dos
 * escolhidos, entre as linhas, todos juntos. Ao lado de cada recorte, quantos itens ele mostraria; o que não
 * mostraria nenhum fica desbotado. No pé, quantos mostra, Limpar tudo e Pronto.
 */
@Component({
  selector: 'app-facet-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', '[attr.aria-label]': 'label()', '(keydown.escape)': '$event.stopPropagation(); done.emit()' },
  template: `
    <span class="fita fita-l" aria-hidden="true"></span>
    <span class="fita fita-r" aria-hidden="true"></span>

    @for (g of groups(); track g.key) {
      <div class="linha" role="group" [attr.aria-labelledby]="ids + g.key">
        <div class="linha-texto">
          <p class="linha-titulo" [id]="ids + g.key">{{ g.title }}</p>
          <p class="linha-desc">{{ g.desc }}</p>
        </div>
        <div class="recortes">
          @for (o of g.options; track o.value) {
            <label class="recorte" [class.zero]="!o.n && !o.on" [class.sem]="o.value === 'sem'">
              <input type="checkbox" [checked]="o.on" (change)="toggle.emit({ key: g.key, value: o.value })" />
              @if (o.color) {
                <span class="selo" [style.--cor]="'var(--stock-' + o.color + ')'" aria-hidden="true"></span>
              }
              <span class="recorte-nome">{{ o.label }}</span>
              <span class="recorte-n"><span class="sr-only">, </span>{{ o.n }}</span>
            </label>
          }
        </div>
      </div>
    }

    <footer class="pe">
      <p class="conta" aria-live="polite">{{ summary() }}</p>
      <div class="pe-acoes">
        @if (active()) {
          <button type="button" class="acao-caneta" (click)="clearAll.emit()">Limpar tudo</button>
        }
        <button type="button" class="pronto" (click)="done.emit()">Pronto</button>
      </div>
    </footer>
  `,
  styles: `
    @use 'paper-kit' as kit;
    @use 'spending-kit' as gk;
    @use 'filtro-linhas' as fl;

    :host {
      @include kit.cartela;
      padding-top: 12px;
    }

    @include kit.cartela-fitas('.fita-l', '.fita-r');

    .pe {
      @include kit.cartela-pe;
      margin-top: 6px;
    }

    @include fl.linhas;
    @include fl.recorte-desenho;

    /* o selinho da categoria, como na fita e nos envelopes (no adesivo de tinta, com a borda clara) */
    .selo {
      @include gk.selo(11px);
    }
    .recorte:has(input:checked) .selo {
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.55);
    }

    /* "Sem resposta" é o resto: a mesma letra, mais leve */
    .sem:not(:has(input:checked)) .recorte-nome {
      font-weight: 600;
      color: var(--ink-2);
    }
  `,
})
export class FacetFilters<K extends string = string> {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly groups = input.required<FacetGroup<K>[]>();
  /** Quantos itens a lista mostra com os filtros, e quantos tem. */
  readonly shown = input.required<number>();
  readonly total = input.required<number>();
  /** O nome dos itens no pé ("lançamento", "lançamentos"). */
  readonly units = input.required<readonly [string, string]>();
  /** O nome da região para o leitor de tela ("Filtros da fita"). */
  readonly label = input('Filtros');
  /** Há algum filtro ligado. */
  readonly active = input(false);
  /** Aberta pelo teclado: o foco vai para o primeiro recorte (pelo mouse, fica onde estava, como nas Anotações). */
  readonly focusFirst = input(false);
  readonly toggle = output<{ key: K; value: string }>();
  readonly clearAll = output<void>();
  readonly done = output<void>();

  /** Os ids dos nomes das linhas, únicos na página. */
  protected readonly ids = `ff${++folhas}-`;

  /** O pé: "Mostrando 8 de 12 lançamentos", ou só quantos são. */
  protected readonly summary = computed(() => {
    const [one, many] = this.units();
    const total = plural(this.total(), one, many);
    return this.active() ? `Mostrando ${this.shown()} de ${total}` : total;
  });

  constructor() {
    afterNextRender(() => {
      if (this.focusFirst()) this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    });
  }
}
