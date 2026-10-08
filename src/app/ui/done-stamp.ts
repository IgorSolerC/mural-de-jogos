import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const longFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

/** "07 OUT 2026": o dia no fuso de quem vê, como um carimbo datador imprime. */
export function stampDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "7 de outubro de 2026". */
export function doneDayLong(iso: string): string {
  return longFmt.format(new Date(iso));
}

/**
 * O carimbo da anotação finalizada: um carimbo datador de escritório, a palavra em cima e o dia
 * embaixo, em tinta vermelha que falha aqui e ali. Com `hit`, ele bate no papel (ver ReviewCard).
 */
@Component({
  selector: 'app-done-stamp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.big]': 'size() === "big"',
    '[class.clara]': 'dark()',
    '[class.batendo]': 'hit()',
    role: 'img',
    '[attr.aria-label]': '"Finalizada em " + longDay()',
    '[title]': '"Finalizada em " + longDay()',
  },
  template: `
    <span class="tinta" aria-hidden="true">
      <span class="palavra">Finalizado</span>
      <span class="dia">{{ day() }}</span>
    </span>
  `,
  styles: `
    :host {
      --tinta: #c4302b;
      --fs: 0.74rem;
      display: inline-block;
      flex: none;
      rotate: -7deg;
      /* a tinta entra no papel: escurece a cartolina em vez de cobrir */
      mix-blend-mode: multiply;
      pointer-events: auto;
    }
    /* na cartolina escura, a tinta clara não escurece nada: fica por cima */
    :host(.clara) {
      --tinta: #ff8f80;
      mix-blend-mode: normal;
    }
    :host(.big) {
      --fs: 0.98rem;
      rotate: -6deg;
    }
    .tinta {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      padding: 0.32em 0.6em 0.36em;
      border: 0.2em solid var(--tinta);
      border-radius: 0.55em 0.4em 0.6em 0.45em;
      /* a moldura de dentro, como a borracha do carimbo */
      outline: 0.09em solid var(--tinta);
      outline-offset: -0.42em;
      color: var(--tinta);
      font-family: var(--f-label);
      font-size: var(--fs);
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
      /* a tinta que não pegou: falhas miúdas de um carimbo batido à mão */
      -webkit-mask: var(--falha) 0 0 / 7em auto;
      mask: var(--falha) 0 0 / 7em auto;
      --falha: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -8 5.8'/%3E%3C/filter%3E%3Crect width='120' height='60' filter='url(%23f)'/%3E%3C/svg%3E");
    }
    .palavra {
      font-weight: 800;
      font-size: 1.12em;
      letter-spacing: 0.12em;
      /* o espaço da última letra não empurra a palavra para fora do meio */
      margin-right: -0.12em;
    }
    .dia {
      margin-top: 0.22em;
      padding-top: 0.2em;
      border-top: 0.09em solid var(--tinta);
      font-weight: 700;
      font-size: 0.86em;
      letter-spacing: 0.08em;
      font-variant-numeric: tabular-nums;
    }

    /* Batendo no papel: desce grande e torto, encosta com força e assenta */
    :host(.batendo) {
      animation: bate 560ms cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
    }
    :host(.batendo) .tinta {
      animation: tinge 560ms ease-out both;
    }
    @keyframes bate {
      0% {
        scale: 2.6;
        rotate: -22deg;
        opacity: 0;
      }
      45% {
        scale: 0.9;
        rotate: -7deg;
        opacity: 1;
      }
      62% {
        scale: 1.05;
      }
      100% {
        scale: 1;
        rotate: -7deg;
      }
    }
    /* encostou: a tinta sai carregada e assenta no tom de carimbo */
    @keyframes tinge {
      0%,
      40% {
        filter: blur(0.6px);
      }
      55% {
        filter: blur(0) saturate(1.6) brightness(0.8);
      }
      100% {
        filter: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host(.batendo),
      :host(.batendo) .tinta {
        animation: none;
      }
    }
  `,
})
export class DoneStamp {
  /** Quando foi finalizada (ISO). */
  readonly at = input.required<string>();
  readonly size = input<'card' | 'big'>('card');
  /** Na cartolina escura: a tinta clara. */
  readonly dark = input(false);
  /** Acabou de ser finalizada: o carimbo bate. */
  readonly hit = input(false);

  protected readonly day = computed(() => stampDay(this.at()));
  protected readonly longDay = computed(() => doneDayLong(this.at()));
}
