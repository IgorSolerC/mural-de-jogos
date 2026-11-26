import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Word, spokenOf } from '../core/dictionary/dictionary';
import { Voz } from '../core/voz';
import { ICON, IconModule } from './icons';

/**
 * Ouvir a palavra do Dicionário Japonês (PLANO-DICIONARIO.md, 5.2): os fones de "Ouvir a nota", num botão redondo de
 * papel, dizem a palavra na voz japonesa deste aparelho (a mesma escolha de voz e de velocidade da leitura da nota,
 * core/voz.ts). A voz lê a leitura em kana (`spokenOf`). Tocar de novo enquanto diz cala; dizendo, acende o pontinho
 * laranja dos fones da nota. Sem voz japonesa no navegador, o botão não aparece (a voz do português leria o japonês).
 * O verbete (página e folhinha da seleção), a Tabela e a lousa usam a mesma peça.
 */
@Component({
  selector: 'app-word-voice',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.miudo]': 'small()', '[class.grande]': 'big()', '[class.escuro]': 'dark()' },
  template: `
    @if (speaks()) {
      <button
        type="button"
        class="ouvir-palavra"
        [class.ligado]="saying()"
        [attr.aria-pressed]="saying()"
        [attr.aria-label]="label() ?? 'Ouvir ' + word().text"
        [title]="saying() ? 'Calar' : 'Ouvir a palavra'"
        (click)="toggle()"
      >
        <lucide-icon [img]="Icon" [size]="big() ? 38 : small() ? 15 : 18" aria-hidden="true" />
      </button>
    }
  `,
  styles: `
    :host {
      --tam: 32px;
      display: inline-flex;
      align-self: center;
    }
    :host(.miudo) {
      --tam: 26px;
    }
    /* a pergunta do Treino que só fala (o Japonês → português falado, o Som do Escrever): o botão é a pergunta */
    :host(.grande) {
      --tam: 92px;
    }
    :host(.grande) .ouvir-palavra.ligado::after {
      right: 6px;
      bottom: 6px;
      width: 16px;
      height: 16px;
    }
    .ouvir-palavra {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: var(--tam);
      height: var(--tam);
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgb(21 21 21 / 0.06);
      color: rgb(21 21 21 / 0.62);
      cursor: pointer;
      transition:
        scale var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui),
        background-color var(--t-ui) var(--ease-ui);
    }
    /* o desenho no centro do círculo (solto, o ícone ganha o alto da linha do texto e sobe uns 3px) */
    .ouvir-palavra lucide-icon {
      display: inline-flex;
    }
    .ouvir-palavra:hover {
      scale: 1.06;
      color: #b4541f;
    }
    .ouvir-palavra:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 2px;
    }
    /* dizendo: aceso, com o pontinho laranja dos fones de "Ouvir a nota" embaixo do desenho */
    .ouvir-palavra.ligado {
      background: var(--ink);
      color: #ffd23f;
    }
    .ouvir-palavra.ligado::after {
      content: '';
      position: absolute;
      right: -1px;
      bottom: -1px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #df6a2c;
      box-shadow: 0 0 0 1.5px #f6f0e1;
    }
    /* na faixa escura do verbete: o creme da tinta clara */
    :host(.escuro) .ouvir-palavra {
      background: rgb(243 236 224 / 0.1);
      color: rgb(243 236 224 / 0.82);
    }
    :host(.escuro) .ouvir-palavra:hover {
      background: rgb(243 236 224 / 0.2);
      color: #ffd9a8;
    }
    :host(.escuro) .ouvir-palavra:focus-visible {
      outline-color: var(--hi);
    }
    :host(.escuro) .ouvir-palavra.ligado {
      background: #f3ece0;
      color: #b4541f;
    }
    :host(.escuro) .ouvir-palavra.ligado::after {
      box-shadow: 0 0 0 1.5px #f3ece0;
    }
    @media (prefers-reduced-motion: reduce) {
      .ouvir-palavra:hover {
        scale: none;
      }
    }
  `,
})
export class WordVoice {
  private readonly voz = inject(Voz);

  readonly word = input.required<Word>();
  /** O tamanho menor, da Tabela. */
  readonly small = input(false);
  /** Sobre a faixa escura do verbete. */
  readonly dark = input(false);
  /** O tamanho da pergunta do Treino (o botão é a pergunta). */
  readonly big = input(false);
  /** O nome para o leitor de tela, no lugar do "Ouvir 食べる" (no Treino, a palavra não pode aparecer). */
  readonly label = input<string | null>(null);

  protected readonly Icon = ICON.fones;
  private readonly key = computed(() => `dicionario:${this.word().id}`);
  /** O navegador tem voz japonesa (a lista chega depois, no `voiceschanged`). */
  protected readonly speaks = computed(() => this.voz.voices().length > 0 && this.voz.voicesOf('ja').length > 0);
  protected readonly saying = computed(() => this.voz.saying(this.key()));

  /** No toque (o iPhone só fala começando num toque). */
  protected toggle(): void {
    if (this.saying()) this.voz.hushTitle(this.key());
    else this.voz.sayTitle(spokenOf(this.word()), 'ja', this.key());
  }
}
