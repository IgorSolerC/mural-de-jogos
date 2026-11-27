import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DictionaryView } from '../ui/dictionary-view';

export { SEARCH_PAUSE_MS, tableRowGuess } from '../ui/dictionary-view';

/**
 * A página do Dicionário Japonês (PLANO-DICIONARIO.md): a peça do dicionário (ui/dictionary-view.ts) com o estado no
 * endereço, a mesma que abre ao lado de uma anotação (PLANO-LADO-A-LADO.md, D5).
 */
@Component({
  selector: 'app-dictionary-page',
  imports: [DictionaryView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- o nome está na barra embaixo do topo (ui/area-bar.ts), com a volta para Outros -->
    <h1 class="sr-only">Dicionário Japonês</h1>
    <app-dictionary-view />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class DictionaryPage {}
