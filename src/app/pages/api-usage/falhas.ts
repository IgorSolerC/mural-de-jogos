import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

/** Uma falha já em palavras, como a página monta. */
export interface FailureItem {
  servico: string;
  nome: string;
  quando: string;
  texto: string;
  /** Das últimas 24 h: ainda é notícia, e fica em vermelho. */
  recente: boolean;
}

/** Quantas aparecem antes do "Ver as N". */
const FIRST = 8;

/**
 * O bloco "Últimas falhas" do Uso das APIs (PLANO-ADMIN-APIS.md, 11.4): a hora de Brasília, o serviço e o que
 * houve em palavras, as mais novas primeiro. Tocar numa falha pede à página para abrir o detalhe do serviço. O
 * vermelho é só das últimas 24 h; as mais velhas ficam em tinta, para o que é de hoje se destacar.
 */
@Component({
  selector: 'app-uso-falhas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <ol class="lista-falhas">
        @for (f of shown(); track $index) {
          <li>
            <button type="button" class="falha" (click)="abrir.emit(f.servico)">
              <span class="sr-only">Abrir o detalhe de {{ f.nome }}:</span>
              <span class="quando">{{ f.quando }}</span>
              <span class="falha-nome">{{ f.nome }}</span>
              <span class="falha-texto" [class.recente]="f.recente">{{ f.texto }}</span>
            </button>
          </li>
        }
      </ol>
      @if (items().length > shown().length) {
        <button type="button" class="mais" (click)="all.set(true)">Ver as {{ items().length }}</button>
      }
    } @else {
      <p class="sem-falhas">Nenhuma falha nos últimos 30 dias.</p>
    }
  `,
  styles: `
    @use '../../ui/paper-kit' as kit;

    :host {
      display: block;
    }
    /* a hora de todas as falhas numa coluna só: cada linha herda as colunas da lista (subgrid) */
    .lista-falhas {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: 12px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;

      li {
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
      }
      li + li {
        border-top: 1.5px dashed rgb(21 21 21 / 0.25);
      }
    }
    .falha {
      --focus: var(--ink);
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
      column-gap: 12px;
      width: 100%;
      min-height: 48px;
      margin: 0;
      padding: 6px 6px 6px 0;
      border: 0;
      border-radius: 2px;
      background: transparent;
      color: var(--ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);

      &:hover {
        background: rgb(21 21 21 / 0.06);
      }
    }
    .quando {
      grid-row: span 2;
      padding-top: 1px;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.9rem;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .falha-nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.02rem;
      line-height: 1.15;
    }
    .falha-texto {
      color: var(--ink-2);
      font-family: var(--f-ui);
      font-size: 0.9rem;
      line-height: 1.25;

      &.recente {
        color: var(--red-deep);
      }
    }
    .mais {
      @include kit.botao-papel;
      & {
        margin-top: 12px;
      }
    }
    .sem-falhas {
      margin: 14px 0 0;
      font-family: var(--f-hand);
      font-size: 1.1rem;
    }
    @media (prefers-reduced-motion: reduce) {
      .falha {
        transition: none;
      }
    }
  `,
})
export class UsoFalhas {
  readonly items = input.required<FailureItem[]>();
  readonly abrir = output<string>();

  protected readonly all = signal(false);
  protected readonly shown = computed(() => (this.all() ? this.items() : this.items().slice(0, FIRST)));
}
