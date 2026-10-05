import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { KindProfile } from '../../core/kinds';
import { formatScore } from '../../core/review';

const one = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * A escala de quem dá as notas numa régua de escola: o bigode a tinta dos 10% aos 90%, a metade do
 * meio num pedaço de fita-crepe, a mediana num risco de caneta vermelha. Embaixo, "Onde fica um…?":
 * a régua deslizante mostra quantas notas do mural ficam abaixo do número escolhido.
 */
@Component({
  selector: 'app-regua',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="regua" role="img" [attr.aria-label]="'Metade das notas entre ' + avg(p25()) + ' e ' + avg(p75()) + '; mediana ' + avg(median())">
      <div class="trilho">
        <span class="bigode" [style.left.%]="pos(p10())" [style.right.%]="100 - pos(p90())"></span>
        <span class="caixa" [style.left.%]="pos(p25())" [style.right.%]="100 - pos(p75())"></span>
        <span class="med" [style.left.%]="pos(median())"></span>
        <span class="sonda" [style.left.%]="pos(probe())"><span>{{ fmt(probe()) }}</span></span>
      </div>
      <div class="nums" aria-hidden="true">
        @for (t of ticks(); track t) {
          <span [style.left.%]="pos(t)">{{ t }}</span>
        }
      </div>
    </div>
    <p class="legenda">
      <span><i class="lg caixa-lg"></i>metade do meio</span>
      <span><i class="lg med-lg"></i>mediana</span>
      <span><i class="lg bigode-lg"></i>80% das notas</span>
    </p>
    <label class="campo">
      <span class="rot">Onde fica um…</span>
      <input type="range" min="0" [max]="scale()" step="0.5" [value]="probe()" (input)="probe.set(+$any($event.target).value)" />
    </label>
    <p class="texto" aria-live="polite">{{ probeText() }}</p>
  `,
  styles: `
    :host {
      display: block;
      --fita: rgb(222 205 160 / 0.9);
    }

    .regua {
      margin: 0 6px;
      padding-top: 40px;
    }

    .trilho {
      position: relative;
      height: 44px;
      border-bottom: 2.5px solid var(--ink);
      background: repeating-linear-gradient(90deg, rgb(21 21 21 / 0.55) 0 1.5px, transparent 1.5px 10%) bottom / 100% 10px no-repeat;
    }

    .bigode {
      position: absolute;
      top: 21px;
      height: 2.5px;
      background: var(--ink);

      &::before,
      &::after {
        content: '';
        position: absolute;
        top: -7px;
        width: 2.5px;
        height: 16px;
        background: var(--ink);
      }
      &::before {
        left: 0;
      }
      &::after {
        right: 0;
      }
    }

    .caixa {
      position: absolute;
      top: 10px;
      height: 24px;
      background: var(--paper-grain), var(--fita);
      clip-path: polygon(0 8%, 4px 50%, 0 92%, 100% 100%, calc(100% - 4px) 50%, 100% 0);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.25));
    }

    .med {
      position: absolute;
      top: 3px;
      width: 3.5px;
      height: 38px;
      margin-left: -1.75px;
      border-radius: 2px;
      background: var(--red);
    }

    .sonda {
      position: absolute;
      top: -24px;
      translate: -50% 0;
      transition: left var(--t-ui) var(--ease-ui);

      span {
        display: block;
        padding: 2px 7px 1px;
        border-radius: 2px;
        background: var(--ink);
        color: var(--hi);
        font-family: var(--f-marker);
        font-size: 0.95rem;
        line-height: 1.1;
      }

      &::after {
        content: '';
        position: absolute;
        left: calc(50% - 5px);
        bottom: -5px;
        border: 5px solid transparent;
        border-bottom: 0;
        border-top-color: var(--ink);
      }
    }

    .nums {
      position: relative;
      height: 22px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      font-variant-numeric: tabular-nums;

      span {
        position: absolute;
        top: 4px;
        translate: -50% 0;
      }
    }

    .legenda {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin: 10px 0 0;
      font-family: var(--f-hand);
      font-size: 0.95rem;
      color: var(--ink-2);

      span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
    }

    .lg {
      display: inline-block;
      width: 18px;
      height: 12px;
      border: 1.5px solid var(--ink);
      border-radius: 1px;
    }
    .caixa-lg {
      background: var(--fita);
    }
    .med-lg {
      width: 4px;
      border: 0;
      background: var(--red);
    }
    .bigode-lg {
      height: 2.5px;
      border: 0;
      background: var(--ink);
    }

    .campo {
      display: grid;
      gap: 4px;
      margin-top: 18px;

      input {
        width: 100%;
        accent-color: var(--ink);
      }
    }

    .rot {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }

    .texto {
      min-height: 2.8em;
      margin: 6px 0 0;
      font-family: var(--f-hand);
      font-size: 1.04rem;
      line-height: 1.35;
    }
  `,
})
export class Regua {
  /** As Médias como aparecem, da menor para a maior. */
  readonly finals = input.required<readonly number[]>();
  readonly p10 = input.required<number | null>();
  readonly p25 = input.required<number | null>();
  readonly median = input.required<number | null>();
  readonly p75 = input.required<number | null>();
  readonly p90 = input.required<number | null>();
  readonly profile = input.required<KindProfile>();

  protected readonly fmt = formatScore;
  protected readonly probe = signal(8);
  /** De 0 a 10 (11 só quando alguém deu 11). */
  protected readonly scale = computed(() => (this.finals().some((v) => v > 10) ? 11 : 10));
  protected readonly ticks = computed(() => Array.from({ length: this.scale() + 1 }, (_, i) => i));

  protected avg(v: number | null): string {
    return v === null ? '–' : one.format(v);
  }

  protected pos(v: number | null): number {
    return v === null ? 0 : (v / this.scale()) * 100;
  }

  protected readonly probeText = computed(() => {
    const f = this.finals();
    const v = this.probe();
    if (!f.length) return '';
    const below = f.filter((x) => x < v).length;
    const same = f.filter((x) => x === v).length;
    const p = this.profile();
    const tail = same ? `, e ${same} ${same === 1 ? `${p.singular} tem` : `${p.plural} têm`} exatamente ${this.fmt(v)}` : '';
    return `Um ${this.fmt(v)} fica acima de ${Math.round((below / f.length) * 100)}% das notas${tail}.`;
  });
}
