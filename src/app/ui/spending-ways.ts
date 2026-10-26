import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PAY_LABEL, PAY_METHODS, PayMethod, brl } from '../core/spending';
import { KINDS, KIND_LABEL, Kind, SpendWays } from '../core/spending-period';

/** Uma linha da peça: um pagamento ou um jeito, e quanto foi nele. */
interface Part {
  group: 'pay' | 'kind';
  id: PayMethod | Kind;
  name: string;
  amount: number;
  /** A parte do que saiu (0 a 1). */
  share: number;
  count: number;
}

/** O que a peça escolhe na fita: um pagamento, ou um jeito (o parcelado é o jeito Parcelas). */
export interface WayPick {
  group: 'pay' | 'kind';
  value: string | null;
}

/**
 * Como saiu: do que saiu, quanto foi à vista, no Pix e parcelado, e quanto foi de uma vez, em parcelas
 * e todo mês. Cada grupo é uma régua dividida em tons de tinta (o parcelado com o tracejado do canhoto)
 * e uma linha por pedaço, com o valor, a parte e quantos gastos. Em cima, à mão, a conta que importa:
 * quanto do que saiu já estava marcado antes do mês começar (parcelas e todo mês).
 *
 * No mês, tocar numa linha deixa na fita só aqueles gastos (`pick`); na vista de vários meses, a peça só
 * mostra (`static`).
 */
@Component({
  selector: 'app-spending-ways',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="titulo">Como saiu</h2>
    @if (headline(); as h) {
      <p class="conta">{{ h }}</p>
    }
    @for (g of groups(); track g.id) {
      <section class="grupo" [attr.aria-label]="g.name">
        <div class="regua-linha" aria-hidden="true">
          <span class="regua-nome">{{ g.name }}</span>
          <div class="regua">
            @for (p of g.parts; track p.id) {
              @if (p.share >= 0.005) {
                <span class="pedaco" [attr.data-way]="p.id" [style.flex-grow]="p.share"></span>
              }
            }
          </div>
        </div>
        <ul class="linhas">
          @for (p of g.parts; track p.id) {
            <li>
              @if (static()) {
                <div class="linha" [attr.data-way]="p.id" [class.vazia]="!p.amount">
                  <ng-container *ngTemplateOutlet="conteudo; context: { $implicit: p }" />
                </div>
              } @else {
                <button
                  type="button"
                  class="linha"
                  [attr.data-way]="p.id"
                  [attr.aria-pressed]="isOn(p)"
                  [disabled]="!p.amount && !isOn(p)"
                  [attr.aria-label]="p.name + ': ' + brl(p.amount) + ', ' + pct(p.share) + ' do que saiu, ' + p.count + (p.count === 1 ? ' gasto' : ' gastos')"
                  (click)="toggle(p)"
                >
                  <ng-container *ngTemplateOutlet="conteudo; context: { $implicit: p }" />
                </button>
              }
            </li>
          }
        </ul>
      </section>
    }

    <ng-template #conteudo let-p>
      <span class="tinta" aria-hidden="true"></span>
      <span class="nome" aria-hidden="true">{{ p.name }}</span>
      <span class="quanto" aria-hidden="true">{{ brl(p.amount) }}</span>
      <span class="parte" aria-hidden="true">{{ pct(p.share) }}</span>
      <span class="vezes" aria-hidden="true">{{ p.count }} {{ p.count === 1 ? 'gasto' : 'gastos' }}</span>
    </ng-template>
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 16px 12px;
      container: jeitos / inline-size;
    }
    .titulo {
      @include gk.peca-titulo;
    }
    .conta {
      margin: 6px 0 0;
      font-family: var(--f-hand);
      font-size: 1.04rem;
      line-height: 1.3;
    }

    .grupo + .grupo {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1.5px dashed rgb(21 21 21 / 0.16);
    }
    .regua-linha {
      display: grid;
      grid-template-columns: 6.6em minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      margin: 10px 0 4px;
    }
    .regua-nome {
      @include gk.eixo-nome;
      font-size: 0.7rem;
      letter-spacing: 0.1em;
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

    /* os tons de tinta de cada pedaço: o forte, o médio, o claro; o parcelado (e as parcelas) com o
       tracejado do canhoto do carnê */
    [data-way='avista'] {
      --tinta: var(--ink);
    }
    [data-way='pix'] {
      --tinta: rgb(21 21 21 / 0.48);
    }
    [data-way='fixo'] {
      --tinta: #5c4520;
    }
    [data-way='uma'] {
      --tinta: transparent;
    }
    .pedaco[data-way='uma'],
    [data-way='uma'] .tinta {
      box-shadow: inset 0 0 0 1.5px var(--ink);
    }
    [data-way='parcelado'],
    [data-way='parcela'] {
      --tinta: #8a6a2f;
    }
    .pedaco:is([data-way='parcelado'], [data-way='parcela']) {
      background: repeating-linear-gradient(-45deg, #8a6a2f 0 4px, #c9a878 4px 7px);
    }

    .linhas {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .linha {
      @include gk.linha-escolha;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto 3.4em 4.8em;
      align-items: center;
      gap: 0 10px;

      &.vazia {
        color: rgb(21 21 21 / 0.62);
      }
    }
    .tinta {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: var(--tinta);
    }
    [data-way='parcelado'] .tinta,
    [data-way='parcela'] .tinta {
      background: repeating-linear-gradient(-45deg, #8a6a2f 0 3px, #c9a878 3px 5px);
    }
    .nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .quanto {
      @include gk.valor;
      font-size: 1rem;
    }
    .nome {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* peça estreita (celular): sem a contagem, para o nome e o valor caberem */
    @container jeitos (max-width: 380px) {
      .linha {
        grid-template-columns: auto minmax(0, 1fr) auto 3em;
      }
      .vezes {
        display: none;
      }
    }

    .parte,
    .vezes {
      @include gk.valor;
      font-size: 0.82rem;
      text-align: right;
      color: var(--ink-2);
    }
  `,
})
export class SpendingWays {
  readonly ways = input.required<SpendWays>();
  /** Os escolhidos na fita (o pagamento e o jeito), quando é um só. */
  readonly pay = input<string | null>(null);
  readonly kind = input<string | null>(null);
  /** Só mostra (na vista de vários meses). */
  readonly static = input(false);
  readonly pick = output<WayPick>();

  protected readonly brl = brl;

  protected readonly groups = computed(() => {
    const w = this.ways();
    const total = w.total || 1;
    const part = (group: Part['group'], id: Part['id'], name: string, s: { amount: number; count: number }): Part => ({
      group,
      id,
      name,
      amount: s.amount,
      share: s.amount / total,
      count: s.count,
    });
    return [
      { id: 'pay', name: 'Pagamento', parts: PAY_METHODS.map((p) => part('pay', p, PAY_LABEL[p], w.pay[p])) },
      { id: 'kind', name: 'Jeito', parts: KINDS.map((k) => part('kind', k, KIND_LABEL[k], w.kind[k])) },
    ];
  });

  /** A conta à mão: quanto foi parcelado e quanto já estava marcado (parcelas e todo mês). */
  protected readonly headline = computed(() => {
    const w = this.ways();
    if (!w.total) return null;
    const planned = w.kind.parcela.amount + w.kind.fixo.amount;
    if (!planned) return 'Tudo o que saiu foi de uma vez só: nada em parcelas nem todo mês.';
    return `${this.pct(planned / w.total)} do que saiu já estava marcado: ${brl(w.kind.parcela.amount)} em parcelas e ${brl(w.kind.fixo.amount)} todo mês.`;
  });

  /** O filtro de cada linha: o parcelado é o jeito Parcelas (o filtro de pagamento só tem à vista e Pix). */
  private target(p: Part): WayPick {
    return p.id === 'parcelado' ? { group: 'kind', value: 'parcela' } : { group: p.group, value: p.id };
  }

  protected isOn(p: Part): boolean {
    const t = this.target(p);
    return (t.group === 'pay' ? this.pay() : this.kind()) === t.value;
  }

  protected toggle(p: Part): void {
    const t = this.target(p);
    this.pick.emit(this.isOn(p) ? { group: t.group, value: null } : t);
  }

  protected pct(share: number): string {
    const p = share * 100;
    return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
  }
}

