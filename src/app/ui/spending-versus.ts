import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { brl, brlShort, monthLabel } from '../core/spending';
import { Versus } from '../core/spending-period';
import { SpendingStore } from '../core/spending-store';

/** Quantas categorias aparecem antes do "+ N". */
const SHOWN = 7;

/**
 * Este mês contra o de antes, por categoria: duas réguas finas por linha na mesma escala (a de cima, de
 * tinta, é este mês; a de baixo, de kraft, o mês de antes), o valor deste mês e a diferença. A diferença
 * só aparece quando passa de 10% e de R$ 20; acima do mês de antes em vermelho, abaixo na tinta verde das
 * entradas, sempre com o sinal. Tocar numa categoria deixa na fita só ela.
 */
@Component({
  selector: 'app-spending-versus',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h2 class="titulo">Contra {{ beforeName() }}</h2>
      <p class="legenda" aria-hidden="true">
        <span><span class="amostra agora"></span>{{ nowName() }}</span>
        <span><span class="amostra antes"></span>{{ beforeName() }}</span>
      </p>
    </header>
    @if (total(); as t) {
      <p class="conta">{{ t }}</p>
    }
    <ul class="linhas">
      @for (l of lines(); track l.id) {
        <li>
          <button type="button" class="linha" [attr.aria-pressed]="selected() === l.id" [attr.aria-label]="l.label" (click)="pick.emit(selected() === l.id ? null : l.id)">
            <span class="nome" aria-hidden="true"><span class="selo" [style.--cor]="l.color"></span><span class="nome-texto">{{ l.name }}</span></span>
            <span class="reguas" aria-hidden="true">
              <span class="regua agora" [style.width.%]="l.nowW"></span>
              <span class="regua antes" [style.width.%]="l.beforeW"></span>
            </span>
            <span class="quanto" aria-hidden="true">{{ brlShort(l.now) }}</span>
            <span class="dif" [class.subiu]="(l.delta ?? 0) > 0" [class.desceu]="(l.delta ?? 0) < 0" aria-hidden="true">{{ l.deltaText }}</span>
          </button>
        </li>
      }
    </ul>
    @if (rest() > 0) {
      <button type="button" class="mais" (click)="all.set(!all())">{{ all() ? 'Só as ' + shownCount + ' maiores' : '+ ' + rest() + (rest() === 1 ? ' categoria' : ' categorias') }}</button>
    }
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 16px 10px;
      container: contra / inline-size;
    }
    .cabeca {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px 14px;
    }
    .titulo {
      @include gk.peca-titulo;
    }
    .legenda {
      display: flex;
      gap: 12px;
      margin: 0;
      @include gk.eixo-nome;

      > span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
    }
    .amostra {
      width: 12px;
      height: 6px;
      border-radius: 2px;
    }
    .agora {
      background: var(--ink);
    }
    .antes {
      background: #c9a878;
    }
    .conta {
      margin: 6px 0 4px;
      font-family: var(--f-hand);
      font-size: 1.02rem;
      line-height: 1.3;
    }
    .linhas {
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
    }
    .linha {
      @include gk.linha-escolha;
      display: grid;
      grid-template-columns: minmax(6em, 9em) minmax(0, 1fr) 4.6em 4.6em;
      align-items: center;
      gap: 0 10px;
      min-height: 36px;
    }
    /* o selinho torto fica fora do corte: só o texto ganha reticências */
    .nome {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      padding-left: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .nome-texto {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .selo {
      @include gk.selo(10px);
    }
    .reguas {
      display: grid;
      gap: 3px;
    }
    .regua {
      height: 6px;
      border-radius: 0 3px 3px 0;
    }
    .quanto {
      @include gk.valor;
      font-size: 0.94rem;
      text-align: right;
    }
    .dif {
      @include gk.valor;
      font-size: 0.8rem;
      text-align: right;
      color: var(--ink-2);

      &.subiu {
        color: var(--red-deep);
      }
      &.desceu {
        color: var(--tinta-entrada);
      }
    }
    /* peça estreita: o nome, o valor e a diferença numa linha; as réguas inteiras embaixo */
    @container contra (max-width: 460px) {
      .linha {
        grid-template-columns: minmax(0, 1fr) auto 4.6em;
        grid-template-areas:
          'nome quanto dif'
          'reguas reguas reguas';
        gap: 4px 10px;
        padding-block: 6px;
      }
      .nome {
        grid-area: nome;
      }
      .reguas {
        grid-area: reguas;
      }
      .quanto {
        grid-area: quanto;
      }
      .dif {
        grid-area: dif;
      }
    }
    .mais {
      @include gk.tinta-pequena;
      margin-top: 4px;
    }
  `,
})
export class SpendingVersus {
  private readonly store = inject(SpendingStore);

  readonly items = input.required<Versus[]>();
  readonly month = input.required<string>();
  readonly before = input.required<string>();
  /** A categoria escolhida na fita. */
  readonly selected = input<string | null>(null);
  readonly pick = output<string | null>();

  protected readonly brlShort = brlShort;
  protected readonly shownCount = SHOWN;
  protected readonly all = signal(false);

  protected readonly nowName = computed(() => monthLabel(this.month()).split(' de ')[0]);
  protected readonly beforeName = computed(() => monthLabel(this.before()).split(' de ')[0]);

  private readonly max = computed(() => Math.max(1, ...this.items().map((v) => Math.max(v.now, v.before))));

  protected readonly lines = computed(() => {
    const list = this.all() ? this.items() : this.items().filter((v, i) => i < SHOWN || v.id === this.selected());
    return list.map((v) => {
      const c = this.store.category(v.id);
      const name = c?.name ?? 'Sem categoria';
      const diff = v.now - v.before;
      const delta = Math.abs(diff) < 100 ? 0 : diff;
      const deltaText = !v.before && v.now ? 'novo' : !delta ? '=' : v.before >= 5000 && v.now ? `${diff > 0 ? '+' : '−'}${Math.round((Math.abs(diff) / v.before) * 100)}%` : `${diff > 0 ? '+' : '−'}${brlShort(Math.abs(diff))}`;
      return {
        ...v,
        name,
        color: `var(--stock-${c?.color ?? 'cinza'})`,
        nowW: (v.now / this.max()) * 100,
        beforeW: (v.before / this.max()) * 100,
        delta,
        deltaText,
        label: `${name}: ${brl(v.now)} em ${this.nowName()}, ${brl(v.before)} em ${this.beforeName()}${deltaText ? `, ${deltaText}` : ''}`,
      };
    });
  });

  protected readonly rest = computed(() => Math.max(0, this.items().length - SHOWN));

  /** À mão: as categorias que mais mudaram (o total do mês, o saldo já diz). */
  protected readonly total = computed(() => {
    const moved = this.items()
      .filter((v) => v.before && Math.abs(v.now - v.before) >= 2000)
      .sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before))
      .slice(0, 2);
    if (!moved.length) return null;
    const say = (v: Versus) => `${this.store.category(v.id)?.name ?? 'Sem categoria'} ${v.now > v.before ? 'subiu' : 'caiu'} ${brlShort(Math.abs(v.now - v.before))}`;
    return moved.map(say).join('; ') + '.';
  });
}
