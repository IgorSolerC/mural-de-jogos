import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { UsageDay, dayShort, duration, wholeNumber } from '../../core/api-usage';

/** Uma coluna, já medida (alturas em % da área do gráfico). */
interface Column {
  day: UsageDay;
  /** A coluna inteira e a parte de cima, a que falhou (em % da coluna). */
  height: number;
  failedPart: number;
  /** O número escrito em cima: só no maior dia e em hoje. */
  label: boolean;
  /** Na primeira e na última coluna, o número encosta na beirada da tira, para não sair do papel. */
  edge: 'inicio' | 'fim' | null;
  anchor: 'inicio' | 'meio' | 'fim';
}

/**
 * Os últimos 30 dias de um serviço (PLANO-ADMIN-APIS.md, 11.6): uma tira de kraft por dia no papel
 * milimetrado, todas na mesma escala, com a parte que falhou em cima, hachurada em vermelho. Rótulo só no
 * maior dia e em hoje; o resto aparece passando o mouse, e todos os números estão na tabela embaixo. O que
 * veio antes de a contagem começar fica cinza: não é zero, é desconhecido.
 */
@Component({
  selector: 'app-uso-dias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cabeca">
      <h3 class="titulo">Últimos 30 dias</h3>
      @if (hasFailures()) {
        <p class="legenda" aria-hidden="true">
          <span><span class="amostra"></span>respondeu</span>
          <span><span class="amostra hachura"></span>falhou</span>
        </p>
      }
    </div>

    @if (total() > 0) {
      <div class="grafico" role="img" [attr.aria-label]="summary()" [style.--n]="columns().length" (pointerleave)="hovered.set(null)">
        @for (c of columns(); track c.day.dia; let i = $index) {
          <span class="coluna" [class.antes]="!c.day.contado" (pointerenter)="hovered.set(i)">
            @if (c.day.total > 0) {
              <span class="barra" [style.height.%]="c.height">
                @if (c.label) {
                  <span class="valor" [attr.data-ponta]="c.edge">{{ whole(c.day.total) }}</span>
                }
                @if (c.day.falhas > 0) {
                  <span class="parte-falha" [style.height.%]="c.failedPart"></span>
                }
              </span>
            }
          </span>
        }
        @if (hovered() !== null) {
          @let c = columns()[hovered()!];
          <span class="dica" aria-hidden="true" [attr.data-ancora]="c.anchor" [style.left.%]="((c.anchor === 'inicio' ? hovered()! : c.anchor === 'fim' ? hovered()! + 1 : hovered()! + 0.5) / columns().length) * 100">
            <b>{{ short(c.day.dia) }}</b>{{ tip(c.day) }}
          </span>
        }
      </div>
      <div class="pe" aria-hidden="true">
        <span>{{ short(days()[0]!.dia) }}</span>
        @if (since(); as s) {
          <span class="desde">contando desde {{ short(s) }}</span>
        }
        <span>hoje</span>
      </div>

      <details class="numeros">
        <summary>Ver os números</summary>
        <table>
          <caption class="sr-only">Pedidos de cada dia contado, do mais novo para o mais velho</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              <th scope="col" class="num">Pedidos</th>
              <th scope="col" class="num">Falharam</th>
              <th scope="col" class="num">Tempo</th>
            </tr>
          </thead>
          <tbody>
            @for (d of withUse(); track d.dia) {
              <tr>
                <th scope="row">{{ short(d.dia) }}</th>
                <td class="num">{{ whole(d.total) }}</td>
                <td class="num">{{ d.falhas ? whole(d.falhas) : '—' }}</td>
                <td class="num">{{ d.tempoMs === null ? '—' : duration(d.tempoMs) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </details>
    } @else {
      <p class="vazio">Nenhuma chamada nos últimos 30 dias.</p>
    }
  `,
  styles: `
    @use '../../ui/spending-kit' as gk;

    :host {
      display: block;
      min-width: 0;
      /* a hachura da falha: tinta vermelha a 45°, sobre um rosado que separa do kraft mesmo sem cor */
      --hachura: repeating-linear-gradient(45deg, var(--red-deep) 0 1.5px, transparent 1.5px 4px), #f3d6cf;
    }
    .cabeca {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px 14px;
      margin-bottom: 8px;
    }
    .titulo {
      margin: 0;
      color: var(--ink-2);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .legenda {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 12px;
      margin: 0;
      @include gk.eixo-nome;

      > span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
    }
    .amostra {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: #c9a878;

      &.hachura {
        background: var(--hachura);
      }
    }

    .grafico {
      @include gk.papel-grafico;
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      height: 132px;
      /* o espaço do rótulo do maior dia */
      padding: 20px 2px 0;
    }
    .coluna {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      min-width: 0;
      height: 100%;

      &:hover {
        background: rgb(21 21 21 / 0.05);
      }
      /* antes de contar: desconhecido, não zero */
      &.antes {
        background: rgb(21 21 21 / 0.06);
      }
    }
    /* a tira de kraft, presa no pé; a parte que falhou fica em cima, separada por um fio do papel */
    .barra {
      position: relative;
      display: flex;
      flex-direction: column;
      width: min(62%, 16px);
      min-height: 2px;
      border-radius: 3px 3px 0 0;
      background-color: #c9a878;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
    }
    .parte-falha {
      flex: none;
      width: 100%;
      min-height: 2px;
      border-bottom: 2px solid #fbfcf6;
      border-radius: 3px 3px 0 0;
      background: var(--hachura);
    }
    .valor {
      position: absolute;
      bottom: calc(100% + 3px);
      left: 50%;
      translate: -50% 0;
      @include gk.valor;
      font-size: 0.74rem;
      color: var(--ink);

      &[data-ponta='inicio'] {
        left: 0;
        translate: none;
      }
      &[data-ponta='fim'] {
        left: auto;
        right: 0;
        translate: none;
      }
    }
    .dica {
      @include gk.dica;
      top: 2px;

      &[data-ancora='meio'] {
        translate: -50% 0;
      }
      &[data-ancora='fim'] {
        translate: -100% 0;
      }
    }
    .pe {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-top: 4px;
      @include gk.eixo-nome;
    }
    .desde {
      text-transform: none;
      letter-spacing: 0.02em;
      font-family: var(--f-hand);
      font-size: 0.92rem;
      font-weight: 400;
    }
    .numeros {
      margin-top: 8px;

      summary {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        color: var(--ink-2);
        font-size: 0.88rem;
        text-decoration: underline;
        text-decoration-thickness: 1.5px;
        text-underline-offset: 3px;
        cursor: pointer;

        &:hover {
          color: var(--ink);
        }
        @media (pointer: coarse) {
          min-height: 44px;
        }
      }
    }
    table {
      width: 100%;
      max-width: 420px;
      border-collapse: collapse;
      font-family: var(--f-ui);
      font-size: 0.92rem;
      line-height: 1.3;

      th,
      td {
        padding: 4px 0 4px 14px;
        text-align: left;
        font-weight: 400;

        &:first-child {
          padding-left: 0;
        }
      }
      thead th {
        color: var(--ink-2);
        font-family: var(--f-label);
        font-weight: 800;
        font-size: 0.76rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      tbody tr + tr {
        border-top: 1.5px dashed rgb(21 21 21 / 0.25);
      }
      .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
    }
    .vazio {
      margin: 0;
      font-family: var(--f-hand);
      font-size: 1.05rem;
    }
  `,
})
export class UsoDias {
  readonly days = input.required<UsageDay[]>();

  protected readonly hovered = signal<number | null>(null);
  protected readonly total = computed(() => this.days().reduce((n, d) => n + d.total, 0));
  protected readonly hasFailures = computed(() => this.days().some((d) => d.falhas > 0));
  /** O primeiro dia contado, se a contagem começou no meio dos 30 dias. */
  protected readonly since = computed(() => {
    const days = this.days();
    return days[0]?.contado ? null : (days.find((d) => d.contado)?.dia ?? null);
  });
  protected readonly withUse = computed(() => this.days().filter((d) => d.total > 0).reverse());

  protected readonly columns = computed((): Column[] => {
    const days = this.days();
    const max = Math.max(...days.map((d) => d.total));
    const top = days.findIndex((d) => d.total === max);
    const last = days.length - 1;
    return days.map((day, i) => ({
      day,
      height: max > 0 ? (day.total / max) * 100 : 0,
      failedPart: day.total > 0 ? (day.falhas / day.total) * 100 : 0,
      // hoje só leva rótulo longe do maior, para os dois números não se encostarem
      label: day.total > 0 && (i === top || (i === last && last - top >= 3)),
      edge: i === 0 ? 'inicio' : i === last ? 'fim' : null,
      anchor: i < days.length / 4 ? 'inicio' : i >= (days.length * 3) / 4 ? 'fim' : 'meio',
    }));
  });

  protected readonly summary = computed(() => {
    const days = this.days();
    const failed = days.reduce((n, d) => n + d.falhas, 0);
    const max = days.reduce((a, d) => (d.total > a.total ? d : a), days[0]!);
    const today = days.at(-1)!;
    const failedText = failed > 0 ? `, ${wholeNumber(failed)} falharam` : ', nenhuma falha';
    return `Pedidos por dia nos últimos 30 dias: ${wholeNumber(this.total())} no total${failedText}. O maior dia foi ${dayShort(max.dia)}, com ${wholeNumber(max.total)}. Hoje, ${wholeNumber(today.total)}.`;
  });

  protected readonly short = dayShort;
  protected readonly whole = wholeNumber;
  protected readonly duration = duration;

  protected tip(d: UsageDay): string {
    if (!d.contado) return 'antes da contagem';
    if (d.total === 0) return 'nenhum pedido';
    const failed = d.falhas > 0 ? ` · ${wholeNumber(d.falhas)} falharam` : '';
    return `${wholeNumber(d.total)} ${d.total === 1 ? 'pedido' : 'pedidos'}${failed}`;
  }
}
