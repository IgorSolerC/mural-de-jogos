import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { OpenPlan, brl, brlShort, monthShort } from '../core/spending';

/** Quantos carnês aparecem antes do "e mais N". */
const SHOWN = 5;

/**
 * Os carnês abertos: cada compra parcelada que ainda não acabou é um carnê com um canhoto por parcela (os
 * pagos já destacados, o deste mês em tinta), quanto falta e quando acaba, e embaixo quanto ainda vem em
 * parcelas depois deste mês.
 */
@Component({
  selector: 'app-spending-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="titulo" id="gc-carnes">
      Carnês abertos
      <span class="soma">{{ brlShort(perMonth()) }}/mês</span>
    </h2>
    <ul class="carnes" aria-labelledby="gc-carnes">
      @for (p of shown(); track p.entry.id) {
        <li class="carne" [attr.aria-label]="label(p)">
          <span class="nome" aria-hidden="true">{{ p.entry.title }}</span>
          <span class="canhotos" aria-hidden="true">
            @for (i of stubs(p.of); track i) {
              <span class="canhoto" [class.pago]="!p.upcoming && i < p.current" [class.agora]="!p.upcoming && i === p.current"></span>
            }
          </span>
          <span class="conta" aria-hidden="true">
            <b>{{ p.current }}/{{ p.of }}</b>
            @if (p.upcoming) {
              começa em {{ short(p.upcoming.first) }} · até {{ short(p.last) }}
            } @else if (p.left) {
              faltam {{ brlShort(p.left) }} · até {{ short(p.last) }}
            } @else {
              última
            }
          </span>
        </li>
      }
    </ul>
    @if (plans().length > shownMax) {
      <button type="button" class="mais" [attr.aria-expanded]="all()" (click)="all.set(!all())">
        {{ all() ? 'Mostrar menos' : 'e mais ' + (plans().length - shownMax) }}
      </button>
    }
    @if (ahead() > 0) {
      <p class="pela-frente">Ainda vêm {{ brl(ahead()) }} em parcelas depois deste mês.</p>
    }
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 14px 12px;
    }
    .titulo {
      @include gk.peca-titulo;
      margin-bottom: 8px;
    }
    .soma {
      margin-left: auto;
      @include gk.valor;
      font-size: 0.9rem;
      color: var(--ink);
    }
    .carnes {
      display: grid;
      gap: 7px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .carne {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        'nome conta'
        'canhotos canhotos';
      gap: 3px 10px;
      align-items: baseline;
    }
    .nome {
      grid-area: nome;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      font-size: 0.94rem;
    }
    .conta {
      grid-area: conta;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink-2);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;

      b {
        color: var(--ink);
        margin-right: 4px;
      }
    }
    /* os canhotos do carnê: cada parcela um tiquete; os pagos ficaram só o picote */
    .canhotos {
      grid-area: canhotos;
      display: flex;
      gap: 2px;
      height: 10px;
    }
    .canhoto {
      flex: 1 1 0;
      max-width: 22px;
      border-radius: 1px;
      background: #f1e3b5;
      box-shadow: inset 0 0 0 1px rgb(21 21 21 / 0.22);

      &.pago {
        background: none;
        box-shadow: none;
        border: 1.5px dashed rgb(21 21 21 / 0.28);
      }
      &.agora {
        background: var(--ink);
        box-shadow: none;
      }
    }
    .mais {
      @include gk.tinta-pequena;
      margin-top: 6px;
      margin-left: -8px;
      text-decoration: underline 2px;
      text-underline-offset: 3px;
    }
    .pela-frente {
      margin: 8px 0 0;
      font-family: var(--f-hand);
      font-size: 0.98rem;
      line-height: 1.3;
      color: var(--ink-2);
    }
  `,
})
export class SpendingPlans {
  readonly plans = input.required<OpenPlan[]>();
  /** Quanto ainda vem em parcelas depois do mês aberto. */
  readonly ahead = input(0);
  readonly month = input.required<string>();

  protected readonly brl = brl;
  protected readonly brlShort = brlShort;
  protected readonly shownMax = SHOWN;

  /** Todos os carnês, ou só os que acabam primeiro. */
  protected readonly all = signal(false);
  protected readonly shown = computed(() => (this.all() ? this.plans() : this.plans().slice(0, SHOWN)));
  /** O que sai em parcelas neste mês: os carnês que ainda vão começar não contam. */
  protected readonly perMonth = computed(() => this.plans().reduce((t, p) => t + (p.upcoming ? 0 : p.entry.amount), 0));

  protected stubs(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  protected short(month: string): string {
    return monthShort(month, Number(this.month().slice(0, 4)));
  }

  protected label(p: OpenPlan): string {
    if (p.upcoming) return `${p.entry.title}: ${p.of} parcelas de ${brl(p.entry.amount)}, começa em ${this.short(p.upcoming.first)} e vai até ${this.short(p.last)}`;
    return `${p.entry.title}: parcela ${p.current} de ${p.of}, ${brl(p.entry.amount)} cada${p.left ? `, faltam ${brl(p.left)} até ${this.short(p.last)}` : ', a última'}`;
  }
}
