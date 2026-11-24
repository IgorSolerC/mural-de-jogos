import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MONTHS_SHORT } from '../core/dates';
import { Word, compositionParts, facetLabel } from '../core/dictionary/dictionary';
import { hasKanji } from '../core/dictionary/kana';
import { DictionaryMarks } from '../core/dictionary/marks-store';
import { dictionaryWords } from '../core/dictionary/words';
import { Toasts } from './toast';
import { markFavorite, markLearned } from './word-marking';
import { WordSeals } from './word-seals';
import { WordVoice } from './word-voice';

/** "em 14 de nov": o dia, dito curto. */
export function daySaid(day: string | null): string {
  return day ? `em ${Number(day.slice(8, 10))} de ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}` : '';
}

/**
 * Um verbete do Dicionário Japonês (PLANO-DICIONARIO.md): a palavra na Klee One com a leitura em furigana quando tem
 * kanji, o romaji, os selos de aprendida e favorita, o carimbo do JLPT e o uso em tracinhos; o português; a linha da
 * gramática; a composição depois do 例; as notas a lápis; e os números. A mesma peça na página do dicionário (um
 * item da lista, `li[app-word-entry]`) e na folhinha da seleção da leitura (ui/word-sheet.ts). Os selos marcam pelo
 * guardador das marcas, com o Desfazer no bilhete.
 */
@Component({
  selector: '[app-word-entry]',
  imports: [NgTemplateOutlet, WordSeals, WordVoice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let w = word();
    <div class="cabeca-verbete">
      <!-- na página, a palavra abre a lousa (ver grande e aprender a escrever) -->
      @if (drawable()) {
        <button type="button" class="palavra lousa" lang="ja" [attr.aria-label]="'Ver ' + w.text + ' grande e aprender a escrever'" title="Ver grande e aprender a escrever" (click)="draw.emit(w)">
          <ng-container *ngTemplateOutlet="escrita" />
        </button>
      } @else {
        <span class="palavra" lang="ja"><ng-container *ngTemplateOutlet="escrita" /></span>
      }
      <ng-template #escrita>
        @if (ruby()) {
          <ruby>{{ w.text }}<rp>(</rp><rt>{{ w.reading }}</rt><rp>)</rp></ruby>
        } @else {
          {{ w.text }}
        }
      </ng-template>
      <span class="romaji">{{ w.romaji }}</span>
      <app-word-voice [word]="w" />
      <span class="marcas">
        <app-word-seals
          [word]="w.text"
          [learned]="learned()"
          [favorite]="favorite()"
          [learnedSaid]="learnedSaid()"
          (learnedChange)="setLearned($event)"
          (favoriteChange)="setFavorite($event)"
        />
        <span class="selo-jlpt" [class.sem-nivel]="w.jlpt === '-'" [title]="'JLPT: ' + jlpt()">
          <span class="sr-only">JLPT </span>{{ w.jlpt === '-' ? '–' : w.jlpt }}
        </span>
        <span class="uso" [title]="'Uso: ' + w.use">
          <span class="sr-only">Uso {{ w.use }}</span>
          @for (t of ticks; track t) {
            <i [class.cheio]="t <= w.frequency" aria-hidden="true"></i>
          }
        </span>
      </span>
    </div>
    <p class="sentido">{{ w.meaning }}</p>
    <p class="gramatica">
      {{ grammar() }}
      @if (registers(); as r) {
        <span class="registro">· {{ r }}</span>
      }
    </p>
    @if (w.composition) {
      <p class="exemplos">
        <span class="rei" lang="ja" aria-hidden="true">例</span><span class="sr-only">Exemplos: </span>
        <!-- na página, o que é outra palavra do dicionário abre a lousa dela -->
        <span lang="ja">@for (p of parts(); track $index) {@if (p.word; as pw) {<button type="button" class="elo" [attr.aria-label]="p.text + ': abrir na lousa'" [title]="pw.meaning" (click)="draw.emit(pw)">{{ p.text }}</button>} @else {<ng-container>{{ p.text }}</ng-container>}}</span>
      </p>
    }
    @if (w.notes) {
      <p class="nota">{{ w.notes }}</p>
    }
    <p class="numeros">
      <span>nº {{ w.order }}</span>
      <span>importância {{ w.importance }}</span>
      @if (learnedSaid(); as quando) {
        <span class="quando">aprendida {{ quando }}</span>
      }
      <span>{{ rankSaid() }}</span>
    </p>
  `,
  styleUrl: './word-entry.scss',
})
export class WordEntry {
  private readonly marks = inject(DictionaryMarks);
  private readonly toasts = inject(Toasts);

  readonly word = input.required<Word>();
  /** A palavra é o botão que abre a lousa (na página do dicionário). */
  readonly drawable = input(false);
  readonly draw = output<Word>();

  protected readonly ticks = [1, 2, 3, 4, 5];
  /** A composição em pedaços; os links só na página (na folhinha da seleção não há lousa para abrir). */
  protected readonly parts = computed(() =>
    this.drawable() ? compositionParts(this.word().composition, dictionaryWords().byText, this.word().id) : [{ text: this.word().composition }],
  );
  /** A leitura vai em furigana por cima só quando a palavra tem kanji. */
  protected readonly ruby = computed(() => hasKanji(this.word().text) && this.word().text !== this.word().reading);
  protected readonly jlpt = computed(() => facetLabel('jlpt', this.word().jlpt));
  /** A classe, o grupo do verbo, o tema e a escrita, numa linha miúda. */
  protected readonly grammar = computed(() => {
    const w = this.word();
    return [w.wordClass, w.verbGroup && facetLabel('verbGroup', w.verbGroup), w.theme, facetLabel('script', w.script)].filter(Boolean).join(' · ');
  });
  /** O registro só quando diz alguma coisa (neutro sozinho é o normal). */
  protected readonly registers = computed(() => {
    const r = this.word().registers;
    return r.length === 1 && r[0] === 'neutro' ? '' : r.join(', ');
  });
  protected readonly rankSaid = computed(() => {
    const rank = this.word().rank;
    return rank === null ? 'fora da lista da internet' : `${rank.toLocaleString('pt-BR')}ª mais comum na internet`;
  });

  protected readonly learned = computed(() => this.marks.learned(this.word()));
  protected readonly favorite = computed(() => this.marks.favorite(this.word().id));
  protected readonly learnedSaid = computed(() => daySaid(this.marks.learnedDay(this.word())));

  protected setLearned(on: boolean): void {
    markLearned(this.marks, this.toasts, this.word(), on);
  }

  protected setFavorite(on: boolean): void {
    markFavorite(this.marks, this.toasts, this.word(), on);
  }
}
