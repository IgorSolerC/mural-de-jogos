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

/** Cada carimbo tem um id próprio para o caminho do texto em volta (o SVG mora no documento). */
let seq = 0;

/**
 * O carimbo da anotação finalizada: um selo redondo de borracha, batido no canto da ficha por cima
 * do papel, como o "PAGO" numa conta. "FINALIZADA" corre em volta, o check à mão fica no meio e o
 * dia numa faixa embaixo dele. Tinta verde (a cor do que deu certo), que falha aqui e ali e
 * escurece o papel em vez de cobrir; nas cartolinas escuras, verde-clara. Com `hit`, ele bate.
 */
@Component({
  selector: 'app-done-stamp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-size]': 'size()',
    '[class.clara]': 'dark()',
    '[class.batendo]': 'hit()',
    role: 'img',
    '[attr.aria-label]': '"Finalizada em " + longDay()',
  },
  template: `
    <svg class="tinta" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <path [attr.id]="ring" d="M50 50 m-38.5 0 a38.5 38.5 0 1 1 77 0 a38.5 38.5 0 1 1 -77 0" />
      </defs>
      <circle cx="50" cy="50" r="46" class="borda" />
      <circle cx="50" cy="50" r="31.5" class="borda fina" />
      <text class="volta"><textPath [attr.href]="'#' + ring" startOffset="0" textLength="236" lengthAdjust="spacing">FINALIZADA ✦ FINALIZADA ✦</textPath></text>
      <path class="check" d="M33 48.5 45 60 70 33.5" />
      <rect x="23" y="63" width="54" height="11" rx="1.5" class="faixa" />
      <text x="50" y="71.4" class="dia">{{ day() }}</text>
    </svg>
  `,
  styles: `
    :host {
      --tinta: #1f7a45;
      --tam: 92px;
      display: block;
      width: var(--tam);
      height: var(--tam);
      rotate: -13deg;
      /* a tinta entra no papel: escurece a cartolina em vez de cobrir */
      mix-blend-mode: multiply;
      pointer-events: none;
    }
    /* na cartolina escura, a tinta clara não escurece nada: fica por cima, um pouco transparente */
    :host(.clara) {
      --tinta: #8fe3ad;
      mix-blend-mode: normal;
      opacity: 0.9;
    }
    :host([data-size='compact']) {
      --tam: 66px;
    }
    :host([data-size='big']) {
      --tam: 124px;
      rotate: -10deg;
    }
    .tinta {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      color: var(--tinta);
      /* a tinta que não pegou: falhas miúdas de um carimbo batido à mão */
      -webkit-mask: var(--falha) 0 0 / 70px 70px;
      mask: var(--falha) 0 0 / 70px 70px;
      --falha: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='11'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -7 5.3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23f)'/%3E%3C/svg%3E");
    }
    .borda {
      fill: none;
      stroke: currentColor;
      stroke-width: 3.4;
    }
    .borda.fina {
      stroke-width: 1.6;
    }
    .volta {
      fill: currentColor;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 9.6px;
      letter-spacing: 0.06em;
    }
    .check {
      fill: none;
      stroke: currentColor;
      stroke-width: 7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .faixa {
      fill: currentColor;
    }
    .dia {
      fill: #fff;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 7.6px;
      letter-spacing: 0.08em;
      text-anchor: middle;
      text-transform: uppercase;
    }
    /* na tinta clara, a letra da faixa é a do papel escuro */
    :host(.clara) .dia {
      fill: #10241a;
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
        scale: 2.4;
        rotate: -32deg;
        opacity: 0;
      }
      45% {
        scale: 0.9;
        opacity: 1;
      }
      62% {
        scale: 1.05;
      }
      100% {
        scale: 1;
      }
    }
    /* encostou: a tinta sai carregada e assenta no tom de carimbo */
    @keyframes tinge {
      0%,
      40% {
        filter: blur(0.6px);
      }
      55% {
        filter: blur(0) saturate(1.5) brightness(0.85);
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
  /** O tamanho: na ficha, na ficha simples ou na leitura. */
  readonly size = input<'card' | 'compact' | 'big'>('card');
  /** Na cartolina escura: a tinta clara. */
  readonly dark = input(false);
  /** Acabou de ser finalizada: o carimbo bate. */
  readonly hit = input(false);

  protected readonly ring = `carimbo-volta-${++seq}`;
  protected readonly day = computed(() => stampDay(this.at()));
  protected readonly longDay = computed(() => doneDayLong(this.at()));
}
