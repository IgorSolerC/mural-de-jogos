import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ONE_DECIMAL as one } from '../../core/review';

export interface Coluna {
  key: string;
  label: string;
  n: number;
  /** A média das fichas da coluna (vai na dica e, com `avgRow`, numa linha embaixo). */
  avg?: number | null;
}

/** Uma marca a caneta vermelha atravessando o gráfico (a média, a mediana), em fração da largura. */
export interface Marca {
  at: number;
  label: string;
  dashed?: boolean;
  /** De que lado da linha vai o texto (para duas marcas perto não se atropelarem). */
  side?: 'esq' | 'dir';
}


/**
 * Gráfico de colunas no papel milimetrado: cada coluna é uma tira de cartolina recortada e colada em
 * pé, com a contagem escrita a pincel em cima e o rótulo impresso embaixo. Uma série só, então uma
 * cor só (`--tira`); a cor é o material, não um dado. Quem lê com leitor de tela ouve a lista inteira.
 */
@Component({
  selector: 'app-colunas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--alto.px]': 'height()' },
  template: `
    <figure>
      <div class="area" role="img" [attr.aria-label]="spoken()">
        <div class="colunas" [style.--n]="bars().length">
          @for (b of bars(); track b.key) {
            <div class="col" [class.zero]="!b.n" [class.lider]="lead() && b.n === max() && max() > 0" [title]="tip(b)">
              @if (b.n || showZero()) {
                <span class="valor" aria-hidden="true">{{ b.n }}</span>
              }
              <span class="tira" [style.height.%]="pct(b)"></span>
            </div>
          }
        </div>
        @for (m of marks(); track m.label) {
          <span class="marca" [class.tracejada]="m.dashed" [class.esq]="m.side === 'esq'" [style.left.%]="m.at * 100">
            <span class="marca-txt">{{ m.label }}</span>
          </span>
        }
      </div>
      <div class="eixo" aria-hidden="true" [style.--n]="bars().length">
        @for (b of bars(); track b.key; let i = $index) {
          <span [class.pulo]="thin() && i % 2 === 1" [class.oculto]="i % every() !== 0">{{ b.label }}</span>
        }
      </div>
      @if (avgRow()) {
        <div class="medias" aria-hidden="true" [style.--n]="bars().length">
          @for (b of bars(); track b.key) {
            <span>{{ b.avg === null || b.avg === undefined ? '' : fmt(b.avg) }}</span>
          }
        </div>
      }
    </figure>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
      --tira: var(--stock-azul);
    }

    figure {
      margin: 0;
    }

    :host(.com-marcas) figure {
      padding-top: 24px;
    }

    .area {
      position: relative;
      height: var(--alto, 170px);
      padding-top: 26px;
      border-bottom: 2.5px solid var(--ink);
    }

    .colunas {
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      gap: clamp(2px, 1.2%, 10px);
      height: 100%;
      align-items: end;
    }

    .col {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      height: 100%;
      min-width: 0;
    }

    .valor {
      margin-bottom: 3px;
      font-family: var(--f-marker);
      font-size: clamp(0.82rem, 2.4cqi, 1.15rem);
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .zero .valor {
      opacity: 0.4;
    }

    .tira {
      display: block;
      width: min(100%, 46px);
      min-height: 0;
      background-color: var(--tira);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      border: 1.5px solid var(--ink);
      border-bottom: 0;
      border-radius: 2px 2px 0 0;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.18);
      transform-origin: bottom;
      animation: sobe 520ms var(--ease-physical) both;
    }

    .zero .tira {
      border: 0;
      box-shadow: none;
    }

    .lider .tira {
      border-width: 2.5px;
    }

    .lider .valor {
      color: var(--red-deep);
      font-size: clamp(0.95rem, 2.8cqi, 1.35rem);
    }

    @keyframes sobe {
      from {
        transform: scaleY(0);
      }
    }

    .marca {
      position: absolute;
      top: -18px;
      bottom: 0;
      width: 0;
      border-left: 2.5px solid var(--red);
      pointer-events: none;

      &.tracejada {
        border-left-style: dashed;
        border-left-color: var(--ink);
        border-left-width: 2px;
      }
    }

    .marca-txt {
      position: absolute;
      top: -6px;
      left: 6px;
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 0.95rem;
      line-height: 1;
      white-space: nowrap;
      color: var(--red-deep);
    }

    .tracejada .marca-txt {
      color: var(--ink);
    }

    .esq .marca-txt {
      left: auto;
      right: 6px;
    }

    .eixo .oculto {
      visibility: hidden;
    }

    .eixo,
    .medias {
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      gap: clamp(2px, 1.2%, 10px);
      text-align: center;
    }

    .eixo {
      padding-top: 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-variant-numeric: tabular-nums;

      span {
        white-space: nowrap;
      }
    }

    .medias {
      padding-top: 2px;
      font-family: var(--f-hand);
      font-size: 0.88rem;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 560px) {
      .eixo .pulo {
        visibility: hidden;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .tira {
        animation: none;
      }
    }
  `,
})
export class Colunas {
  readonly bars = input.required<readonly Coluna[]>();
  readonly marks = input<readonly Marca[]>([]);
  /** O que cada coluna conta, para a dica e o leitor de tela: "fichas", "jogos". */
  readonly unit = input('fichas');
  readonly height = input(170);
  readonly avgRow = input(false);
  readonly showZero = input(false);
  /** Circula de vermelho a coluna mais alta. */
  readonly lead = input(true);
  /** Muitas colunas: no celular, um rótulo sim, um não. */
  readonly thin = input(false);
  readonly caption = input('');
  /** Um rótulo embaixo a cada tantas colunas (as 24 horas: de 3 em 3). */
  readonly every = input(1);

  protected readonly max = computed(() => Math.max(0, ...this.bars().map((b) => b.n)));
  protected readonly fmt = (v: number) => one.format(v);

  protected pct(b: Coluna): number {
    const m = this.max();
    return m ? (b.n / m) * 100 : 0;
  }

  protected tip(b: Coluna): string {
    const avg = b.avg === null || b.avg === undefined ? '' : `, média ${one.format(b.avg)}`;
    return `${b.label}: ${b.n} ${this.unit()}${avg}`;
  }

  protected readonly spoken = computed(() => {
    const head = this.caption() ? `${this.caption()}. ` : '';
    return head + this.bars().map((b) => `${b.label}: ${b.n}`).join('; ');
  });
}
