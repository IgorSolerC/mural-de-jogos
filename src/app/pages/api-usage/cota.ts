import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ALMOST_OUT, NEAR_END, Quota, dayLabel, megabytes, percent, percentShort, shortNumber, wholeNumber } from '../../core/api-usage';

/**
 * Uma cota numa régua de escola: a fita-crepe vai até onde já foi gasto, com os riscos de 70% e 90%. Dentro da
 * folga, a fita é a de sempre; perto do fim, amarela; quase no fim, a caneta vermelha. A cor nunca fala sozinha:
 * a palavra está sempre lá, e o leitor de tela ouve tudo numa frase só. Da mesma família da `app-regua` das
 * Estatísticas, sem mexer nela.
 */
@Component({
  selector: 'app-cota',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.folgada]': 'calm()' },
  template: `
    <p class="linha">
      <span class="nome">{{ quota().nome }}</span>
      <span class="falta">{{ left() }}</span>
    </p>
    @if (calm()) {
      <!-- folgada: a régua fina, com a mesma fita e os mesmos riscos; o "de quanto" fica na frase do leitor de tela -->
      <div class="fina">
        <div class="regua" role="img" [attr.aria-label]="label()" [attr.data-nivel]="quota().nivel">
          <span class="fita" [class.pouca]="width() < 3" [style.width.%]="width()"></span>
          <span class="risco" [style.left.%]="near" aria-hidden="true"></span>
          <span class="risco" [style.left.%]="almost" aria-hidden="true"></span>
        </div>
        <span class="parte" aria-hidden="true">{{ percentShort(quota().parte) }}</span>
      </div>
    } @else {
      <div class="regua" role="img" [attr.aria-label]="label()" [attr.data-nivel]="quota().nivel">
        <span class="fita" [class.pouca]="width() < 3" [style.width.%]="width()"></span>
        <span class="risco" [style.left.%]="near" aria-hidden="true"></span>
        <span class="risco" [style.left.%]="almost" aria-hidden="true"></span>
      </div>
      <p class="linha miudo">
        <span>{{ used() }} de {{ total() }}</span>
        <span class="parte">
          {{ percent(quota().parte) }}
          @if (word(); as w) {
            <strong class="aviso" [attr.data-nivel]="quota().nivel">{{ w }}</strong>
          }
        </span>
      </p>
    }
    @if (quota().desde; as since) {
      <p class="desde">Contando desde {{ dayLabel(since) }}: o que veio antes não está aqui.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .linha {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 0 12px;
      margin: 0;
    }

    .nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.12rem;
      line-height: 1.15;
    }

    .falta {
      font-family: var(--f-ui);
      font-weight: 700;
      font-size: 0.98rem;
      font-variant-numeric: tabular-nums;
    }

    .regua {
      position: relative;
      height: 26px;
      margin: 6px 0 5px;
      overflow: hidden;
      border-radius: 2px;
      border-bottom: 2px solid var(--ink);
      background:
        repeating-linear-gradient(90deg, rgb(21 21 21 / 0.5) 0 1.5px, transparent 1.5px 10%) bottom / 100% 7px no-repeat,
        #fbf9f2;
    }

    .fita {
      position: absolute;
      inset: 3px auto 5px 0;
      background: var(--paper-grain), rgb(222 205 160 / 0.95);
      clip-path: polygon(0 0, 100% 0, calc(100% - 3px) 50%, 100% 100%, 0 100%);

      /* quase nada gasto: um risquinho reto, sem o recorte da ponta, que num pedaço tão curto parece defeito */
      &.pouca {
        min-width: 3px;
        clip-path: none;
      }
    }

    [data-nivel='perto'] .fita {
      background: var(--paper-grain), var(--hi);
    }

    [data-nivel='quase'] .fita {
      background: var(--red-deep);
    }

    .risco {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1.5px;
      background: var(--ink);
    }

    .miudo {
      font-family: var(--f-ui);
      font-size: 0.88rem;
      font-variant-numeric: tabular-nums;
    }

    .parte {
      display: inline-flex;
      align-items: baseline;
      gap: 8px;
    }

    .aviso {
      padding: 1px 6px;
      border-radius: 2px;
      background: var(--ink);
      color: var(--hi);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;

      &[data-nivel='quase'] {
        background: var(--red-deep);
        color: #fff;
      }
    }

    /* folgada: nome e "faltam" um pouco menores, e uma régua fina de 8 px com o percentual ao lado */
    :host(.folgada) {
      .nome {
        font-size: 1rem;
      }
      .falta {
        font-size: 0.9rem;
      }
    }

    .fina {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 5px;

      .regua {
        flex: 1;
        height: 8px;
        margin: 0;
        border-bottom-width: 1.5px;
        background: #fbf9f2;
      }

      .fita {
        inset: 0 auto 0 0;
      }

      .parte {
        flex: none;
        /* a mesma largura em todas, para as réguas finas alinharem */
        width: 3.6ch;
        font-family: var(--f-ui);
        font-size: 0.86rem;
        font-variant-numeric: tabular-nums;
        text-align: right;
        white-space: nowrap;
      }
    }

    .desde {
      margin: 3px 0 0;
      font-family: var(--f-hand);
      font-size: 0.98rem;
      line-height: 1.2;
    }
  `,
})
export class Cota {
  readonly quota = input.required<Quota>();

  protected readonly near = NEAR_END * 100;
  protected readonly almost = ALMOST_OUT * 100;
  protected readonly percent = percent;
  protected readonly percentShort = percentShort;
  protected readonly dayLabel = dayLabel;

  private readonly amount = (n: number, compact: boolean) => (this.quota().unidade === 'bytes' ? megabytes(n) : compact ? shortNumber(n) : wholeNumber(n));

  protected readonly left = computed(() => `faltam ${this.amount(this.quota().falta, false)}`);
  protected readonly used = computed(() => this.amount(this.quota().usado, false));
  protected readonly total = computed(() => this.amount(this.quota().total, true));
  /** Um gasto mínimo ainda aparece: 1 de 1 milhão não pode parecer zero. */
  protected readonly width = computed(() => {
    const q = this.quota();
    return q.usado <= 0 ? 0 : Math.min(100, Math.max(1, q.parte * 100));
  });
  /**
   * Abaixo de 70%, a cota não pede nada: a régua fina basta, e dez réguas grandes quase vazias não empurram a tabela
   * para fora da tela. A régua grande volta quando ela fica perto do fim, junto com a palavra.
   */
  protected readonly calm = computed(() => this.quota().nivel === 'folga');
  protected readonly word = computed(() => {
    const level = this.quota().nivel;
    return level === 'quase' ? 'Quase no fim' : level === 'perto' ? 'Perto do fim' : null;
  });
  protected readonly label = computed(() => {
    const q = this.quota();
    return `${q.nome}: ${this.amount(q.usado, false)} de ${this.amount(q.total, false)}, faltam ${this.amount(q.falta, false)}, ${percent(q.parte)}${this.word() ? `, ${this.word()!.toLowerCase()}` : ''}.`;
  });
}
