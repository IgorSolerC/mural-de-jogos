import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { isDarkStock } from '../core/review';
import { CategorySum, brl, brlShort, usualDelta } from '../core/spending';
import { SpendingStore } from '../core/spending-store';

/** Um envelope pronto para desenhar. */
interface Envelope {
  id: string;
  name: string;
  color: string;
  dark: boolean;
  amount: number;
  /** A parte do total do mês (0 a 1). */
  share: number;
  budget?: number;
  /** Quanto do limite já foi (0 a 1, passa de 1 quando estoura). */
  used?: number;
  /** A diferença para o costume (+0,38 = 38% acima), quando há costume e ela é grande. */
  delta?: number;
}

/** Quantos envelopes aparecem antes do "mais N". */
const SHOWN = 6;

/**
 * Os envelopes: em cima, a faixa do mês, cada categoria um pedaço de cartolina do tamanho da parte dela
 * (a pizza da planilha, só que lida de uma vez); embaixo, um envelope de papel por categoria de saída, na
 * mesma cor e na mesma ordem, com quanto foi nela no mês (já sem o que voltou de reembolso) e, quando tem
 * limite, quanto do limite já foi: passou, o envelope estoura (o carimbo vermelho). A diferença para o
 * costume só aparece quando diz alguma coisa (ver `usualDelta`). Tocar num envelope (ou no pedaço dele na
 * faixa) mostra só os gastos dele na fita; de novo, mostra todos.
 */
@Component({
  selector: 'app-spending-envelopes',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h2 class="titulo">Envelopes</h2>
      <button type="button" class="tinta-pequena" [attr.aria-pressed]="noFixed()" (click)="toggleFixed.emit()" title="Tira os fixos (aluguel, contas…) das contas dos envelopes e do mês a mês">
        Sem os fixos
      </button>
      <button type="button" class="tinta-pequena" (click)="manage.emit()">
        <lucide-icon [img]="GearIcon" [size]="14" aria-hidden="true" />
        Ajustar
      </button>
    </header>

    @if (envelopes().length) {
      <div class="faixa" role="group" aria-label="A parte de cada categoria no mês">
        @for (e of envelopes(); track e.id) {
          @if (e.share >= 0.005) {
            <button
              type="button"
              class="pedaco"
              [style.flex-grow]="e.share"
              [style.--cor]="e.color"
              [attr.aria-pressed]="selected() === e.id"
              [attr.aria-label]="e.name + ': ' + pct(e.share) + ' do mês'"
              [title]="e.name + ' · ' + pct(e.share)"
              (click)="pick.emit(selected() === e.id ? null : e.id)"
            ></button>
          }
        }
      </div>
      <ul class="envelopes">
        @for (e of shown(); track e.id) {
          <li>
            <button
              type="button"
              class="envelope"
              [class.escuro]="e.dark"
              [class.estourou]="(e.used ?? 0) > 1"
              [style.--cor]="e.color"
              [attr.aria-pressed]="selected() === e.id"
              [attr.aria-label]="label(e)"
              (click)="pick.emit(selected() === e.id ? null : e.id)"
            >
              <span class="aba" aria-hidden="true"></span>
              <span class="nome" aria-hidden="true">{{ e.name }}</span>
              <span class="quanto" aria-hidden="true">{{ brl(e.amount) }}</span>
              @if (e.budget) {
                <span class="limite" aria-hidden="true">
                  <span class="trilho"><span class="foi" [style.width.%]="Math.min(100, (e.used ?? 0) * 100)"></span></span>
                  <span class="de">de {{ brlShort(e.budget) }}</span>
                </span>
                @if ((e.used ?? 0) > 1) {
                  <span class="carimbo" aria-hidden="true">Estourou</span>
                }
              } @else if (e.delta !== undefined) {
                <span class="parte" aria-hidden="true">
                  <lucide-icon [img]="e.delta > 0 ? UpIcon : DownIcon" [size]="12" />
                  {{ deltaText(e.delta) }}
                </span>
              }
            </button>
          </li>
        }
      </ul>
      @if (envelopes().length > shownMax) {
        <button type="button" class="tinta-pequena mais" [attr.aria-expanded]="all()" (click)="all.set(!all())">
          {{ all() ? 'Mostrar menos' : '+ ' + (envelopes().length - shownMax) + ' envelopes' }}
        </button>
      }
    } @else {
      <p class="vazio">Os envelopes enchem com os gastos do mês.</p>
    }
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      display: block;
      container: envelopes / inline-size;
    }
    .cabeca {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      margin-bottom: 10px;
    }
    .titulo {
      @include gk.peca-titulo;
      margin-right: auto;
      color: var(--wall-ink);
      text-shadow: var(--chalk-shadow);
      font-size: 0.92rem;
    }
    /* os botões ficam na parede: giz */
    .tinta-pequena {
      @include gk.tinta-pequena;
      color: var(--wall-ink);

      &:hover:not(:disabled) {
        background: rgb(255 255 255 / 0.08);
      }
      &:focus-visible {
        outline-color: var(--hi);
      }
      &[aria-pressed='true'] {
        color: var(--ink);
      }
    }

    .envelopes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
      gap: 10px 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* O envelope: papel na cor da categoria, a aba fechada em cima (as duas dobras em V) */
    .envelope {
      --tinta: var(--ink);
      position: relative;
      display: grid;
      align-content: start;
      gap: 2px;
      width: 100%;
      min-height: 0;
      padding: 19px 10px 8px;
      border: 0;
      border-radius: 2px;
      background-color: var(--cor);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: var(--tinta);
      box-shadow: var(--shadow-card);
      text-align: left;
      cursor: pointer;
      transition:
        translate var(--t-ui) var(--ease-ui),
        box-shadow var(--t-ui) var(--ease-ui);

      &.escuro {
        --tinta: var(--ink-claro-solido);
      }
      &:hover {
        translate: 0 -2px;
        box-shadow: var(--shadow-lift);
      }
      &:focus-visible {
        outline: 3px solid var(--hi);
        outline-offset: 3px;
      }
      /* escolhido: a aba aberta, o envelope um pouco para cima e o anel amarelo na parede */
      &[aria-pressed='true'] {
        translate: 0 -3px;
        outline: 3px solid var(--hi);
        outline-offset: 3px;

        .aba {
          scale: 1 -1;
          translate: 0 -100%;
        }
      }
    }
    .aba {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 16px;
      transform-origin: top center;
      background:
        linear-gradient(to bottom right, transparent calc(50% - 1px), rgb(21 21 21 / 0.28) 50%, transparent calc(50% + 1px)) left / 50% 100% no-repeat,
        linear-gradient(to bottom left, transparent calc(50% - 1px), rgb(21 21 21 / 0.28) 50%, transparent calc(50% + 1px)) right / 50% 100% no-repeat;
      transition:
        scale var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical);
    }
    .envelope[aria-pressed='true'] .aba {
      background:
        linear-gradient(to top right, var(--cor) calc(50% - 1px), rgb(21 21 21 / 0.28) 50%, transparent calc(50% + 1px)) left / 50% 100% no-repeat,
        linear-gradient(to top left, var(--cor) calc(50% - 1px), rgb(21 21 21 / 0.28) 50%, transparent calc(50% + 1px)) right / 50% 100% no-repeat;
    }

    .nome {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .quanto {
      @include gk.valor;
      font-weight: 800;
      font-size: 1.16rem;
    }
    .parte lucide-icon {
      display: inline-flex;
    }
    .parte,
    .de {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0 6px;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.74rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-variant-numeric: tabular-nums;
      opacity: 0.85;
    }
    .delta {
      display: inline-flex;
      align-items: center;
      gap: 1px;

      lucide-icon {
        display: inline-flex;
      }
    }
    .limite {
      display: grid;
      gap: 3px;
      margin-top: 3px;
    }
    .trilho {
      height: 5px;
      border-radius: 1px;
      background: rgb(21 21 21 / 0.16);
      overflow: hidden;
    }
    .escuro .trilho {
      background: rgb(243 236 224 / 0.25);
    }
    .foi {
      display: block;
      height: 100%;
      background: currentColor;
    }
    .estourou .foi {
      background: var(--red-deep);
    }
    .carimbo {
      position: absolute;
      top: 4px;
      right: 5px;
      padding: 2px 5px 1px;
      border: 2px solid var(--red-deep);
      border-radius: 3px;
      background: rgb(255 255 255 / 0.75);
      color: var(--red-deep);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.66rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      rotate: 8deg;
    }

    .vazio {
      margin: 0;
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1.3;
      color: var(--wall-ink-2);
    }

    /* A faixa do mês: os pedaços de cartolina lado a lado, com a parede aparecendo entre eles */
    .faixa {
      display: flex;
      gap: 2px;
      height: 18px;
      margin-bottom: 14px;
    }
    .pedaco {
      flex: 1 1 0;
      min-width: 3px;
      padding: 0;
      border: 0;
      border-radius: 1px;
      background-color: var(--cor);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.45);
      cursor: pointer;
      transition: translate var(--t-ui) var(--ease-ui);

      &:hover {
        translate: 0 -2px;
      }
      &:focus-visible {
        outline: 3px solid var(--hi);
        outline-offset: 2px;
      }
      &[aria-pressed='true'] {
        translate: 0 -3px;
        outline: 3px solid var(--hi);
        outline-offset: 2px;
      }
    }
    /* com um escolhido, os outros pedaços recuam */
    .faixa:has([aria-pressed='true']) .pedaco:not([aria-pressed='true']) {
      opacity: 0.35;
    }

    .mais {
      margin-top: 10px;
    }

    @media (prefers-reduced-motion: reduce) {
      .envelope,
      .aba {
        transition: none;
      }
    }
  `,
})
export class SpendingEnvelopes {
  private readonly store = inject(SpendingStore);

  readonly sums = input.required<CategorySum[]>();
  /** A média de cada categoria nos meses de antes (vazio sem costume). */
  readonly usual = input<Map<string, number>>(new Map());
  /** Em quantos dos meses de antes cada categoria teve gasto. */
  readonly seen = input<Map<string, number>>(new Map());
  readonly selected = input<string | null>(null);
  readonly noFixed = input(false);
  readonly pick = output<string | null>();
  readonly toggleFixed = output<void>();
  readonly manage = output<void>();

  protected readonly GearIcon = ICON.configurar;
  protected readonly UpIcon = ICON.acima;
  protected readonly DownIcon = ICON.abaixo;
  protected readonly brl = brl;
  protected readonly brlShort = brlShort;
  protected readonly Math = Math;
  protected readonly shownMax = SHOWN;
  /** Todos os envelopes, ou só os maiores. */
  protected readonly all = signal(false);

  protected readonly envelopes = computed<Envelope[]>(() => {
    const sums = new Map(this.sums().map((s) => [s.id, s.amount]));
    const total = this.sums().reduce((t, s) => t + s.amount, 0) || 1;
    const usual = this.usual();
    const out: Envelope[] = [];
    for (const c of this.store.categories()) {
      if (c.flow !== 'saida') continue;
      const amount = sums.get(c.id) ?? 0;
      if (!amount && !c.budget) continue;
      const delta = usualDelta(amount, usual.get(c.id), this.seen().get(c.id));
      out.push({
        id: c.id,
        name: c.name,
        color: `var(--stock-${c.color})`,
        dark: isDarkStock(c.color),
        amount,
        share: amount / total,
        ...(c.budget ? { budget: c.budget, used: amount / c.budget } : {}),
        ...(delta !== undefined ? { delta } : {}),
      });
      sums.delete(c.id);
    }
    // gastos de uma categoria que foi apagada: um envelope só, "Sem categoria"
    const orphan = [...sums.values()].reduce((a, b) => a + b, 0);
    if (orphan) out.push({ id: '', name: 'Sem categoria', color: 'var(--stock-branco)', dark: false, amount: orphan, share: orphan / total });
    return out.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'pt-BR'));
  });

  /** Os envelopes à mostra: os maiores, ou todos; o escolhido sempre aparece. */
  protected readonly shown = computed(() => {
    const list = this.envelopes();
    if (this.all() || list.length <= SHOWN) return list;
    const top = list.slice(0, SHOWN);
    const picked = list.find((e) => e.id === this.selected());
    return picked && !top.includes(picked) ? [...top.slice(0, SHOWN - 1), picked] : top;
  });

  protected pct(v: number): string {
    return `${Math.round(v * 100)}%`;
  }

  /** A diferença para o costume: "+38% do costume", "−27% do costume", ou "2,5× o costume" quando passou do dobro. */
  protected deltaText(d: number): string {
    if (d >= 1) return `${(d + 1).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× o costume`;
    return `${d > 0 ? '+' : '−'}${this.pct(Math.abs(d))} do costume`;
  }

  protected label(e: Envelope): string {
    const parts = [`${e.name}: ${brl(e.amount)}`];
    parts.push(`${this.pct(e.share)} do mês`);
    if (e.budget) parts.push(`de um limite de ${brl(e.budget)}${(e.used ?? 0) > 1 ? ', estourou' : ''}`);
    if (e.delta !== undefined) parts.push(this.deltaText(e.delta).replace('−', 'menos ').replace('+', 'mais '));
    return parts.join(', ');
  }
}
