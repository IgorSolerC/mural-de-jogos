import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NEEDS, NEED_LABEL, Need, brl } from '../core/spending';

/** Uma linha da peça: uma resposta ao "Precisava?" e quanto foi nela. */
interface Part {
  need: Need | null;
  name: string;
  amount: number;
  /** A parte do que saiu no mês (0 a 1). */
  share: number;
  /** Quantos gastos, e a parte deles na quantidade de gastos do mês (0 a 1). */
  n: number;
  nShare: number;
}

/**
 * Precisava?: do que saiu no mês, quanto foi luxo, conforto e indispensável (já sem o que voltou de reembolso,
 * e sem os fixos quando a pessoa pede). Em cima, duas réguas divididas na tinta de cada resposta: pelo valor
 * e pela quantidade de gastos (muito luxo barato e pouco indispensável caro se vê na diferença entre as
 * duas); embaixo, uma linha por resposta com o valor, a parte do valor e quantos gastos. Os gastos sem resposta aparecem numa linha tracejada, pedindo
 * para marcar. Tocar numa linha mostra só aqueles gastos na fita; de novo, mostra todos.
 */
@Component({
  selector: 'app-spending-needs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.so-ler]': 'static()' },
  template: `
    <header class="cabeca">
      <h2 class="titulo">Precisava?</h2>
      @if (noFixed()) {
        <span class="sem-fixos">sem os fixos</span>
      }
    </header>
    @if (spare(); as s) {
      <p class="conta">{{ s }}</p>
    }

    <div class="reguas" aria-hidden="true">
      <span class="regua-nome">Valor</span>
      <div class="regua">
        @for (p of parts(); track p.need) {
          @if (p.share >= 0.005) {
            <span class="pedaco" [attr.data-need]="p.need ?? 'nenhuma'" [style.flex-grow]="p.share"></span>
          }
        }
      </div>
      @if (hasCounts()) {
        <span class="regua-nome">Quantidade</span>
        <div class="regua">
          @for (p of parts(); track p.need) {
            @if (p.nShare >= 0.005) {
              <span class="pedaco" [attr.data-need]="p.need ?? 'nenhuma'" [style.flex-grow]="p.nShare"></span>
            }
          }
        </div>
      }
    </div>

    <ul class="linhas">
      @for (p of parts(); track p.need) {
        <li>
          <button
            type="button"
            class="linha"
            [attr.data-need]="p.need ?? 'nenhuma'"
            [attr.aria-pressed]="static() ? null : selected() === p.need"
            [disabled]="static() || !p.amount"
            [attr.aria-label]="p.name + ': ' + brl(p.amount) + ', ' + pct(p.share) + ' do que saiu' + (hasCounts() ? ', ' + p.n + (p.n === 1 ? ' gasto' : ' gastos') : '')"
            (click)="pick.emit(selected() === p.need ? undefined : p.need)"
          >
            <span class="tinta" aria-hidden="true"></span>
            <span class="nome" aria-hidden="true">{{ p.name }}</span>
            <span class="quanto" aria-hidden="true">{{ brl(p.amount) }}</span>
            <span class="parte" aria-hidden="true">{{ pct(p.share) }}</span>
            @if (hasCounts()) {
              <span class="vezes" aria-hidden="true">{{ p.n }} {{ p.n === 1 ? 'gasto' : 'gastos' }}</span>
            }
          </button>
        </li>
      }
    </ul>

    @if (untouched() && !static()) {
      <p class="nota">Marque cada gasto na fita, ou já ao anotar: <b>cinema 38 #luxo</b>.</p>
    }
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 16px 12px;
      container: precisava / inline-size;
    }
    .cabeca {
      display: flex;
      align-items: baseline;
      gap: 6px 10px;
    }
    .titulo {
      @include gk.peca-titulo;
      margin-right: auto;
    }
    .conta {
      margin: 6px 0 0;
      font-family: var(--f-hand);
      font-size: 1.04rem;
      line-height: 1.3;
    }
    .sem-fixos {
      font-family: var(--f-hand);
      font-size: 0.98rem;
      color: var(--ink-2);
    }

    /* as réguas do mês, divididas na tinta de cada resposta (o luxo riscado, como uma faixa de aviso):
       pelo valor e pela quantidade, cada uma com o nome impresso na margem */
    .reguas {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 5px 10px;
      margin: 10px 0 6px;
    }
    .regua-nome {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .regua {
      display: flex;
      gap: 2px;
      height: 12px;
    }
    .pedaco {
      flex-basis: 0;
      min-width: 4px;
      border-radius: 2px;
      background: var(--tinta);
    }
    [data-need='indispensavel'] {
      --tinta: var(--tinta-indispensavel);
    }
    [data-need='conforto'] {
      --tinta: var(--tinta-conforto);
    }
    [data-need='luxo'] {
      --tinta: var(--tinta-luxo);
    }
    [data-need='nenhuma'] {
      --tinta: rgb(21 21 21 / 0.5);
    }
    .pedaco[data-need='luxo'] {
      background: repeating-linear-gradient(-45deg, var(--tinta) 0 4px, rgb(184 29 28 / 0.55) 4px 7px);
    }
    .pedaco[data-need='nenhuma'] {
      background: none;
      outline: 1.5px dashed var(--tinta);
      outline-offset: -1.5px;
    }

    .linhas {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .linha {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto 3.4em;

      &:has(.vezes) {
        grid-template-columns: auto minmax(0, 1fr) auto 3.4em 4.8em;
      }
      align-items: center;
      gap: 0 10px;
      width: 100%;
      min-height: 34px;
      padding: 2px 4px;
      border: 0;
      border-radius: 2px;
      background: none;
      color: var(--ink);
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover:not(:disabled) {
        background: rgb(21 21 21 / 0.05);
      }
      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: -1px;
      }
      &[aria-pressed='true'] {
        background: rgb(255 218 66 / 0.38);
      }
      &:disabled {
        cursor: default;
        color: rgb(21 21 21 / 0.62);
      }
    }
    @media (pointer: coarse) {
      .linha {
        min-height: 44px;
      }
    }
    .tinta {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: var(--tinta);
    }
    [data-need='luxo'] .tinta {
      background: repeating-linear-gradient(-45deg, var(--tinta) 0 3px, rgb(184 29 28 / 0.55) 3px 5px);
    }
    .linha:disabled .tinta {
      opacity: 0.4;
    }
    [data-need='nenhuma'] .tinta {
      background: none;
      outline: 1.5px dashed var(--tinta);
      outline-offset: -1.5px;
    }
    .nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--tinta);
    }
    [data-need='nenhuma'] .nome {
      color: var(--ink-2);
    }
    .linha:disabled .nome {
      color: inherit;
    }
    .quanto {
      @include gk.valor;
      font-size: 1rem;
    }
    .parte,
    .vezes {
      @include gk.valor;
      font-size: 0.82rem;
      text-align: right;
      color: var(--ink-2);
    }

    /* só para ler (vários meses): as linhas com a tinta de sempre, sem parecer apagadas */
    :host(.so-ler) .linha:disabled {
      color: var(--ink);

      .nome {
        color: var(--tinta);
      }
      .tinta {
        opacity: 1;
      }
    }

    /* peça estreita (celular): sem a contagem, para o nome e o valor caberem */
    @container precisava (max-width: 380px) {
      .linha:has(.vezes) {
        grid-template-columns: auto minmax(0, 1fr) auto 3em;
      }
      .vezes {
        display: none;
      }
    }
    .nome {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nota {
      margin: 8px 0 0;
      font-family: var(--f-hand);
      font-size: 0.98rem;
      line-height: 1.3;
      color: var(--ink-2);

      b {
        font-family: var(--f-ui);
        font-weight: 600;
        font-size: 0.86rem;
        color: var(--ink);
      }
    }
  `,
})
export class SpendingNeeds {
  /** Quanto saiu em cada resposta no mês (ver `spentByNeed`). */
  readonly sums = input.required<Map<Need | null, number>>();
  /** Quantos gastos do mês em cada resposta (a régua da quantidade); sem nada, só a do valor. */
  readonly counts = input<Map<Need | null, number>>(new Map());
  /** A resposta escolhida (a fita mostra só ela); `undefined`: nenhuma. */
  readonly selected = input<Need | null | undefined>(undefined);
  readonly noFixed = input(false);
  /** Só mostra, sem escolher na fita (na vista de vários meses). */
  readonly static = input(false);
  readonly pick = output<Need | null | undefined>();

  protected readonly brl = brl;

  protected readonly hasCounts = computed(() => this.counts().size > 0);

  protected readonly parts = computed<Part[]>(() => {
    const sums = this.sums();
    const counts = this.counts();
    const total = [...sums.values()].reduce((a, b) => a + b, 0) || 1;
    const many = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
    const part = (need: Need | null, name: string): Part => ({
      need,
      name,
      amount: sums.get(need) ?? 0,
      share: (sums.get(need) ?? 0) / total,
      n: counts.get(need) ?? 0,
      nShare: (counts.get(need) ?? 0) / many,
    });
    const out: Part[] = NEEDS.map((need) => part(need, NEED_LABEL[need]));
    if (sums.get(null) || counts.get(null)) out.push(part(null, 'Sem resposta'));
    return out;
  });

  /** A resposta à pergunta da peça, à mão: quanto do mês foi luxo ou conforto (o que não era indispensável). */
  protected readonly spare = computed(() => {
    const sums = this.sums();
    const amount = (sums.get('luxo') ?? 0) + (sums.get('conforto') ?? 0);
    const total = [...sums.values()].reduce((a, b) => a + b, 0);
    if (!amount || !total) return null;
    return `${brl(amount)} foram luxo ou conforto (${this.pct(amount / total)} do que saiu).`;
  });

  /** Nenhum gasto do mês foi marcado ainda: a peça diz como. */
  protected readonly untouched = computed(() => NEEDS.every((n) => !this.sums().get(n)));

  protected pct(share: number): string {
    const p = share * 100;
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
  }
}
