import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Um laço de letra cursiva, repetido pela palavra: o "texto" que o desenhista não quis escrever. */
const LACO =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 16'%3E%3Cpath d='M0 11C3 11 6 7 6 5C6 3 4 3 3.5 5C3 8 5 11 8 11' fill='none' stroke='%23000' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E\")";

/**
 * Texto rabiscado do modo sem spoilers: cada palavra vira um rabisco cursivo do tamanho dela, com os
 * vãos entre as palavras no lugar, como a placa de um desenho animado. As letras continuam ali,
 * invisíveis (já embaralhadas por quem chama), só para o rabisco ocupar o espaço certo e quebrar a
 * linha onde o texto quebraria.
 */
@Component({
  selector: 'app-rabisco',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `@for (t of tokens(); track $index) {@if (t.word) {<span class="r">{{ t.text }}</span>} @else {<ng-container>{{ t.text }}</ng-container>}}`,
  styles: `
    :host {
      display: inline;
    }
    .r {
      -webkit-text-fill-color: transparent;
      background-color: currentColor;
      opacity: var(--rabisco-forca, 0.7);
      -webkit-mask: ${LACO} 0 62% / auto 0.86em round no-repeat;
      mask: ${LACO} 0 62% / auto 0.86em round no-repeat;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      user-select: none;
    }
    /* uma palavra um pouco mais alta que a outra, como a mão que rabisca depressa */
    .r:nth-of-type(3n + 2) {
      -webkit-mask-position: 0 54%;
      mask-position: 0 54%;
    }
  `,
})
export class Rabisco {
  /** O texto que o rabisco cobre (embaralhado antes: o de verdade não chega à página). */
  readonly text = input.required<string>();
  protected readonly tokens = computed(() =>
    this.text()
      .split(/(\s+)/)
      .filter(Boolean)
      .map((text) => ({ text, word: !/^\s+$/.test(text) })),
  );
}
