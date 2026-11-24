import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Os dois selos de uma palavra do Dicionário Japonês (PLANO-DICIONARIO.md, 4.2), um botão cada, sempre à mostra
 * (não aparecem só com o mouse): **aprendida**, o carimbo verde com 覚 (oboeru, "aprender, guardar na memória"), e
 * **favorita**, a estrela amarela com 好 (suki, "gostar"). Sem a marca, cada um é só o recorte tracejado com o
 * desenho apagado, pedindo para ser marcado; marcado, o carimbo batido torto e a estrela colada. Só desenho: quem
 * usa guarda a marca (core/dictionary/marks-store.ts). A Tabela usa esta peça; o verbete (ui/word-entry.ts) tem o carimbo 済 e a fita de marcador.
 */
@Component({
  selector: 'app-word-seals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.miudo]': 'small()' },
  template: `
    <button
      type="button"
      class="selo aprendida"
      [class.ligado]="learned()"
      [attr.aria-pressed]="learned()"
      [attr.aria-label]="'Aprendida: ' + word()"
      [title]="learned() ? 'Aprendida' + (learnedSaid() ? ' ' + learnedSaid() : '') + '. Tocar desmarca' : 'Marcar como aprendida'"
      (click)="learnedChange.emit(!learned())"
    >
      <span lang="ja" aria-hidden="true">覚</span>
    </button>
    <button
      type="button"
      class="selo favorita"
      [class.ligado]="favorite()"
      [attr.aria-pressed]="favorite()"
      [attr.aria-label]="'Favorita: ' + word()"
      [title]="favorite() ? 'Favorita. Tocar tira a estrela' : 'Marcar como favorita'"
      (click)="favoriteChange.emit(!favorite())"
    >
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path class="estrela" d="M20 2.8l5.1 10.6 11.6 1.6-8.5 8.1 2.1 11.5L20 29.1 9.7 34.6l2.1-11.5-8.5-8.1 11.6-1.6z" />
      </svg>
      <span lang="ja" aria-hidden="true">好</span>
    </button>
  `,
  styles: `
    :host {
      --tam: 34px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    :host(.miudo) {
      --tam: 28px;
    }
    .selo {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: var(--tam);
      height: var(--tam);
      padding: 0;
      border: 0;
      background: none;
      color: rgb(21 21 21 / 0.42);
      font-family: 'Klee One', 'Yu Mincho', serif;
      font-size: calc(var(--tam) * 0.46);
      line-height: 1;
      cursor: pointer;
      transition:
        scale var(--t-ui) var(--ease-ui),
        rotate var(--t-physical) var(--ease-physical),
        color var(--t-ui) var(--ease-ui);
    }
    .selo:hover {
      scale: 1.06;
    }
    .selo:focus-visible {
      outline: 2px solid var(--ink);
      outline-offset: 3px;
      border-radius: 6px;
    }

    /* aprendida: o carimbo verde. Sem a marca, o recorte tracejado; marcado, batido torto */
    .aprendida {
      border-radius: 6px;
    }
    .aprendida:not(.ligado) {
      box-shadow: none;
      background:
        repeating-linear-gradient(90deg, rgb(21 21 21 / 0.36) 0 4px, transparent 4px 7px) top / 100% 1.5px no-repeat,
        repeating-linear-gradient(90deg, rgb(21 21 21 / 0.36) 0 4px, transparent 4px 7px) bottom / 100% 1.5px no-repeat,
        repeating-linear-gradient(180deg, rgb(21 21 21 / 0.36) 0 4px, transparent 4px 7px) left / 1.5px 100% no-repeat,
        repeating-linear-gradient(180deg, rgb(21 21 21 / 0.36) 0 4px, transparent 4px 7px) right / 1.5px 100% no-repeat;
    }
    .aprendida:not(.ligado):hover {
      color: #1f7a45;
    }
    .aprendida.ligado {
      background: #1f7a45;
      color: #f6f0e1;
      box-shadow:
        inset 0 0 0 2px #1f7a45,
        inset 0 0 0 3px rgb(246 240 225 / 0.8),
        0 1px 2px rgb(0 0 0 / 0.25);
      rotate: -6deg;
    }

    /* favorita: a estrela amarela com 好. Sem a marca, só o contorno tracejado */
    .favorita svg {
      position: absolute;
      inset: -3px;
      width: calc(100% + 6px);
      height: calc(100% + 6px);
      overflow: visible;
    }
    .estrela {
      fill: none;
      stroke: rgb(21 21 21 / 0.36);
      stroke-width: 1.6;
      stroke-dasharray: 3.2 2.6;
      stroke-linejoin: round;
      transition: fill var(--t-ui) var(--ease-ui), stroke var(--t-ui) var(--ease-ui);
    }
    .favorita span {
      position: relative;
      font-size: calc(var(--tam) * 0.34);
      translate: 0 1px;
    }
    .favorita:not(.ligado):hover .estrela {
      stroke: #b88a00;
    }
    .favorita:not(.ligado):hover {
      color: #8a6500;
    }
    .favorita.ligado {
      color: var(--ink);
      rotate: 8deg;
      filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.3));
    }
    .favorita.ligado .estrela {
      fill: #ffd23f;
      stroke: #8a6500;
      stroke-dasharray: none;
      stroke-width: 1.4;
    }

    @media (prefers-reduced-motion: reduce) {
      .selo {
        transition: color var(--t-ui) var(--ease-ui);
      }
      .selo:hover {
        scale: none;
      }
    }
  `,
})
export class WordSeals {
  /** A palavra, para o nome dos botões ("Aprendida: 来る"). */
  readonly word = input.required<string>();
  readonly learned = input(false);
  readonly favorite = input(false);
  /** Como dizer quando foi aprendida ("em 14 de nov"), na dica. */
  readonly learnedSaid = input('');
  /** O tamanho menor, da Tabela. */
  readonly small = input(false);
  readonly learnedChange = output<boolean>();
  readonly favoriteChange = output<boolean>();
}
