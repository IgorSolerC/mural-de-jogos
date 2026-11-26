import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DICTIONARY_PATH } from '../core/areas';
import { Word } from '../core/dictionary/dictionary';
import { BackdropClose } from './backdrop-close';
import { loadKleeOne } from './font-sheet';
import { ICON, IconModule } from './icons';
import { WordEntry } from './word-entry';

/**
 * "No dicionário" (PLANO-DICIONARIO.md, 4.3): a folhinha que a seleção de um trecho da leitura abre quando ele é uma
 * palavra do Dicionário Japonês. O verbete inteiro (o mesmo da página: a palavra, a leitura, o sentido, os selos de
 * aprendida e favorita, o JLPT, o uso, a gramática, a composição e as notas) e, no pé, o caminho para o dicionário
 * com a palavra procurada. Mais de um verbete (o と de citação e o と "e/com"), um embaixo do outro.
 */
@Component({
  selector: 'app-word-sheet',
  imports: [BackdropClose, IconModule, RouterLink, WordEntry],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet folha-palavra" aria-labelledby="ws-titulo" (close)="closed.emit()" (backdropClose)="close()">
      <div class="papel">
        <header class="cab">
          <p class="titulo" id="ws-titulo">
            <span class="hanko" lang="ja" aria-hidden="true">辞書</span>
            <span>No dicionário</span>
          </p>
          <button type="button" class="fechar" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>
        <ul class="verbetes" role="list">
          @for (w of words(); track w.id) {
            <li app-word-entry [word]="w"></li>
          }
        </ul>
        <footer class="pe">
          <a class="abrir" [routerLink]="path" [queryParams]="{ q: query() }" (click)="close()">
            Abrir no Dicionário
            <lucide-icon [img]="GoIcon" [size]="16" aria-hidden="true" />
          </a>
        </footer>
      </div>
    </dialog>
  `,
  styles: `
    @use 'folha-arroz' as arroz;

    .folha-palavra {
      max-width: min(560px, calc(100vw - 24px));
    }
    .papel {
      @include arroz.papel;
    }
    .cab {
      @include arroz.cab;
    }
    .titulo {
      @include arroz.titulo;
    }
    .hanko {
      @include arroz.hanko;
    }
    .fechar {
      @include arroz.fechar;
    }
    .verbetes {
      margin: 0;
      padding: 16px 22px;
      list-style: none;
      overflow: auto;
      overscroll-behavior: contain;
    }
    .pe {
      @include arroz.pe;
    }
    .abrir {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 40px;
      padding: 0 14px;
      border-radius: 2px;
      background: var(--ink);
      color: var(--hi);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-decoration: none;
      transition: translate var(--t-ui) var(--ease-ui);
    }
    .abrir:hover {
      translate: 0 -1px;
    }
    .abrir:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 3px;
    }
    @media (max-width: 480px) {
      .cab,
      .verbetes {
        padding-inline: 16px;
      }
    }
  `,
})
export class WordSheet {
  /** Os verbetes que o trecho achou (um, quase sempre). */
  readonly words = input.required<readonly Word[]>();
  /** O trecho, para o dicionário abrir procurando por ele. */
  readonly query = input.required<string>();
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly GoIcon = ICON.ir;
  protected readonly path = DICTIONARY_PATH;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    loadKleeOne();
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }
}
