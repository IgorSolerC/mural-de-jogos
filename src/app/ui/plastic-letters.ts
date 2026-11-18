import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * As letras de plástico do letreiro de feltro (a página de Extras, PLANO-EXTRAS.md): cada letra uma peça encaixada
 * no sulco, com o chanfro em cima e a sombra embaixo, um tiquinho torta. Só o desenho: as letras são `aria-hidden`,
 * e quem usa diz o texto ao leitor de tela (no título, com o texto num `sr-only`; num link, no nome dele).
 * Os tamanhos: `cab` (o título do letreiro), `nome` (o de cada linha) e `mini` (o estado embaixo do nome). As cores:
 * `branca`, `amarela` e `rosa`.
 */
@Component({
  selector: 'app-plastic-letters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[attr.data-cor]': 'tone()',
    '[attr.data-tam]': 'size()',
  },
  template: `
    @for (w of words(); track $index) {
      <span class="palavra">
        @for (ch of w; track $index) {
          <span class="pl">{{ ch }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 0.4em;
      color: #f4f2ec;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 1.7rem;
      line-height: 1;
      text-transform: uppercase;
    }

    :host([data-tam='cab']) {
      font-size: 2.3rem;
      letter-spacing: 0.08em;
    }

    :host([data-tam='mini']) {
      font-size: 1.05rem;
    }

    :host([data-cor='amarela']) {
      color: #ffd84a;
    }

    :host([data-cor='rosa']) {
      color: #ffb3c8;
    }

    /* uma palavra não quebra no meio; as letras dela ficam juntas, com o vãozinho de peça para peça */
    .palavra {
      display: inline-flex;
      gap: 0.06em;
      white-space: nowrap;
    }

    .pl {
      display: inline-block;
      text-shadow:
        0 -1px 0 rgb(255 255 255 / 0.35),
        0 1px 0 rgb(0 0 0 / 0.55),
        0 2px 2px rgb(0 0 0 / 0.55);

      /* tortas sem padrão que se veja em poucas letras */
      &:nth-child(3n) {
        rotate: -2.5deg;
        translate: 0 1px;
      }
      &:nth-child(4n + 1) {
        rotate: 2deg;
      }
      &:nth-child(5n + 2) {
        translate: 0 -1.5px;
      }
      &:nth-child(7n) {
        rotate: -1deg;
        translate: 0 2px;
      }
    }

    @media (max-width: 560px) {
      :host {
        font-size: 1.35rem;
      }

      :host([data-tam='cab']) {
        font-size: 1.8rem;
      }

      :host([data-tam='mini']) {
        font-size: 0.95rem;
      }
    }
  `,
})
export class PlasticLetters {
  readonly text = input.required<string>();
  readonly tone = input<'branca' | 'amarela' | 'rosa'>('branca');
  readonly size = input<'cab' | 'nome' | 'mini'>('nome');
  /** As palavras, cada uma em letras (maiúsculas: o letreiro só tem essas peças). */
  protected readonly words = computed(() =>
    this.text()
      .toLocaleUpperCase('pt-BR')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => [...w]),
  );
}
