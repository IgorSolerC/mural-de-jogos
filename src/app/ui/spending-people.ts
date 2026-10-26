import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ME, brl } from '../core/spending';
import { SpendingStore } from '../core/spending-store';

/** Uma linha da peça: uma pessoa e a parte dela no que saiu no mês. */
interface Part {
  id: string;
  name: string;
  amount: number;
  /** Do tamanho da maior (0 a 1), para a barrinha. */
  scale: number;
  /** A parte dela no que saiu no mês (0 a 1): as partes de todos somam o mês. */
  share: number;
}

/**
 * Por pessoa: do que saiu no mês, quanto foi com cada um, cada gasto dividido em partes iguais entre quem
 * estava (o jantar de R$ 600 com três conta R$ 200 para cada), já sem o que voltou de reembolso e sem os
 * fixos quando a pessoa pede. Uma linha por pessoa, a maior primeiro, com uma faixa de kraft do
 * tamanho dela perto da maior, o valor e a parte do mês em porcentagem. Tocar numa linha deixa na fita só os gastos daquela pessoa, com a parte
 * dela; de novo, mostra todos.
 */
@Component({
  selector: 'app-spending-people',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h2 class="titulo">Por pessoa</h2>
      @if (noFixed()) {
        <span class="sem-fixos">sem os fixos</span>
      }
      <button type="button" class="tinta-pequena" (click)="manage.emit()">Ajustar</button>
    </header>
    <p class="conta">Cada gasto conta em partes iguais para quem estava nele.</p>

    <ul class="linhas">
      @for (p of parts(); track p.id) {
        <li>
          <button
            type="button"
            class="linha"
            [attr.aria-pressed]="selected() === p.id"
            [attr.aria-label]="p.name + ': ' + brl(p.amount) + ', ' + pct(p.share) + ' do que saiu'"
            (click)="pick.emit(selected() === p.id ? null : p.id)"
          >
            <span class="nome" aria-hidden="true">{{ p.name }}</span>
            <span class="trilho" aria-hidden="true"><span class="traco" [style.width.%]="p.scale * 100"></span></span>
            <span class="quanto" aria-hidden="true">{{ brl(p.amount) }}</span>
            <span class="parte" aria-hidden="true">{{ pct(p.share) }}</span>
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 16px 12px;
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
    .sem-fixos {
      font-family: var(--f-hand);
      font-size: 0.98rem;
      color: var(--ink-2);
    }
    .tinta-pequena {
      @include gk.tinta-pequena;
      margin: -10px -8px -10px 0;
    }
    .conta {
      margin: 4px 0 8px;
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1.3;
      color: var(--ink-2);
    }

    /* uma grade só para todas as linhas: os nomes, as barrinhas e os valores começam e acabam juntos */
    .linhas {
      display: grid;
      grid-template-columns: minmax(4.5em, max-content) minmax(40px, 1fr) auto 3.4em;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .linhas > li {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
    }
    .linha {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
      align-items: center;
      gap: 0 12px;
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

      &:hover {
        background: rgb(21 21 21 / 0.05);
      }
      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: -1px;
      }
      &[aria-pressed='true'] {
        background: rgb(255 218 66 / 0.38);
      }
    }
    @media (pointer: coarse) {
      .linha {
        min-height: 44px;
      }
    }
    .nome {
      min-width: 0;
      max-width: 12em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    /* a parte de cada um: a faixa de kraft do mês a mês, do tamanho dela perto da maior (sem trilho) */
    .trilho {
      display: block;
      height: 12px;
    }
    .traco {
      display: block;
      min-width: 2px;
      height: 100%;
      border-radius: 1px;
      background-color: #c9a878;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.25);
    }
    .parte {
      @include gk.valor;
      font-size: 0.82rem;
      text-align: right;
      color: var(--ink-2);
    }
    .quanto {
      @include gk.valor;
      font-size: 1rem;
      text-align: right;
    }
  `,
})
export class SpendingPeople {
  private readonly store = inject(SpendingStore);

  /** Quanto saiu com cada pessoa no mês (ver `spentByPerson`). */
  readonly sums = input.required<Map<string, number>>();
  /** A pessoa escolhida (a fita mostra só os gastos dela); `null`: nenhuma. */
  readonly selected = input<string | null>(null);
  readonly noFixed = input(false);
  readonly pick = output<string | null>();
  readonly manage = output<void>();

  protected readonly brl = brl;

  protected pct(share: number): string {
    const p = share * 100;
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
  }

  protected readonly parts = computed<Part[]>(() => {
    const sums = this.sums();
    const top = Math.max(1, ...sums.values());
    const total = [...sums.values()].reduce((a, b) => a + b, 0) || 1;
    return [...sums]
      .filter(([, amount]) => amount > 0)
      .map(([id, amount]) => ({ id, name: this.store.person(id)?.name ?? (id === ME ? 'Eu' : 'Alguém'), amount, scale: amount / top, share: amount / total }))
      .sort((a, b) => b.amount - a.amount || (a.id === ME ? -1 : b.id === ME ? 1 : a.name.localeCompare(b.name, 'pt-BR')));
  });
}
