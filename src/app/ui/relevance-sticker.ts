import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule, Moon } from 'lucide-angular';
import { Kind, Relevance, relevanceLabel } from '../core/review';

/** O contorno do estouro: vinte pontas, como o "NOVO!" da capa de revista. */
const BURST = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? 40 : 50;
    pts.push(`${(50 + Math.cos(a) * rr).toFixed(2)}% ${(50 + Math.sin(a) * rr).toFixed(2)}%`);
  }
  return `polygon(${pts.join(', ')})`;
})();

/**
 * O adesivo de vontade de um desejo, do tipo que vem colado na capa da revista, com a margem branca
 * do corte do adesivo. MUST PLAY é o estouro vermelho de "NOVO!", com a letra amarela de manchete;
 * LATER é o selo oval azul-claro, fosco, desbotado de sol, com a lua de "fica pra outra noite".
 * Comum não tem adesivo: aqui ele é só uma etiqueta de papel, para a escolha.
 */
@Component({
  selector: 'app-relevance-sticker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"rel-" + relevance() + " tam-" + size()',
    '[style.--estouro]': 'burst',
    'aria-hidden': 'true',
  },
  template: `
    @switch (relevance()) {
      @case ('must') {
        <span class="borda"></span>
        <span class="miolo">
          <span class="txt">
            <small>{{ words()[0] }}</small>
            <b [class.longa]="words()[1].length > 4">{{ words()[1] }}!</b>
          </span>
        </span>
      }
      @case ('later') {
        <span class="borda"></span>
        <span class="miolo">
          <lucide-icon [img]="MoonIcon" [size]="size() === 'mini' ? 10 : 12" [strokeWidth]="2.6" />
          <span>{{ label() }}</span>
        </span>
      }
      @default {
        <span class="miolo">{{ label() }}</span>
      }
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
      flex: none;
      font-size: 16px;
      line-height: 1;
      /* adesivo de vinil: a margem branca corta rente, e a sombra é de coisa fina colada */
      filter: drop-shadow(0 1px 0.6px rgb(0 0 0 / 0.4)) drop-shadow(0 3px 3px rgb(0 0 0 / 0.26));
    }
    :host(.tam-mini) {
      font-size: 12.5px;
    }
    .borda,
    .miolo {
      position: absolute;
    }
    .borda {
      inset: 0;
      background: #fdfcf9;
    }

    /* ===== MUST PLAY: o estouro vermelho ===== */
    :host(.rel-must) {
      width: 4.7em;
      height: 4.7em;
    }
    :host(.rel-must) .borda,
    :host(.rel-must) .miolo {
      clip-path: var(--estouro);
    }
    :host(.rel-must) .miolo {
      inset: 0.24em;
      background:
        linear-gradient(135deg, rgb(255 255 255 / 0.42) 0 18%, rgb(255 255 255 / 0.08) 30%, transparent 42%),
        radial-gradient(circle, rgb(0 0 0 / 0.13) 0.7px, transparent 1.1px) 0 0 / 3px 3px,
        radial-gradient(circle at 38% 32%, #f24a3b, #c81d16 72%);
    }
    .txt {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 0.06em;
      rotate: -9deg;
    }
    .txt small {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.72em;
      letter-spacing: 0.16em;
      padding-left: 0.16em;
      color: #fff;
    }
    .txt b {
      font-family: var(--f-didone);
      font-weight: 400;
      font-size: 1.22em;
      letter-spacing: 0.01em;
      color: #ffe14a;
      text-shadow: 0 1px 0 #7a0d09;
    }
    .txt b.longa {
      font-size: 0.9em;
    }

    /* ===== LATER: o selo oval, fosco e desbotado ===== */
    :host(.rel-later) {
      width: 4.8em;
      height: 2.55em;
    }
    :host(.rel-later) .borda,
    :host(.rel-later) .miolo {
      border-radius: 50%;
    }
    :host(.rel-later) .miolo {
      inset: 0.19em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.2em;
      padding-right: 0.1em;
      background:
        radial-gradient(circle, rgb(20 50 90 / 0.08) 0.7px, transparent 1.1px) 0 0 / 3px 3px,
        linear-gradient(160deg, #dce8f0, #b9cfe0);
      box-shadow: inset 0 0 0 1.5px rgb(31 58 92 / 0.28);
      color: #1f3a5c;
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      font-size: 0.94em;
      letter-spacing: 0.08em;
    }
    :host(.rel-later) lucide-icon {
      display: inline-flex;
      rotate: -18deg;
    }

    /* ===== Comum: sem adesivo, só a etiqueta de papel da escolha ===== */
    :host(.rel-comum) {
      display: inline-grid;
      place-items: center;
      height: 2.3em;
      padding: 0 0.8em;
      filter: drop-shadow(0 1px 0.6px rgb(0 0 0 / 0.3));
    }
    :host(.rel-comum) .miolo {
      position: static;
      padding: 0.5em 0.8em 0.42em;
      background: #fdfcf9;
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.22);
      color: var(--ink);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.92em;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
  `,
})
export class RelevanceSticker {
  readonly relevance = input.required<Relevance>();
  readonly kind = input.required<Kind>();
  readonly size = input<'normal' | 'mini'>('normal');

  protected readonly MoonIcon = Moon;
  protected readonly burst = BURST;
  protected readonly label = computed(() => relevanceLabel(this.kind(), this.relevance()));
  /** "MUST" em cima, pequeno; o verbo embaixo, grande. */
  protected readonly words = computed(() => {
    const [a, ...b] = this.label().split(' ');
    return [a, b.join(' ')];
  });
}
