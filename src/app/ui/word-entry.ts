import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MONTHS_SHORT } from '../core/dates';
import { Conjugated, FormId, isConjugable } from '../core/dictionary/conjugation';
import { Word, classFamily, exampleParts, examplePlain, facetLabel, relatedWords } from '../core/dictionary/dictionary';
import { hasKanji } from '../core/dictionary/kana';
import { DictionaryMarks } from '../core/dictionary/marks-store';
import { dictionaryWords } from '../core/dictionary/words';
import { Toasts } from './toast';
import { markFavorite, markLearned } from './word-marking';
import { WordVoice } from './word-voice';

/** "em 14 de nov": o dia, dito curto. */
export function daySaid(day: string | null): string {
  return day ? `em ${Number(day.slice(8, 10))} de ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}` : '';
}

/** A classe, o grupo do verbo, o tema e a escrita, a linha miúda do verbete. */
function grammarOf(w: Word): string {
  return [w.wordClass, w.verbGroup && facetLabel('verbGroup', w.verbGroup), w.theme, facetLabel('script', w.script)].filter(Boolean).join(' · ');
}

/**
 * A altura do verbete pelo que ele tem dentro, numa coluna de `width` px: a vaga do verbete ainda não montado (a
 * página do dicionário só monta o que está perto da tela). Cada pedaço de texto conta pelas linhas que ocupa
 * (letras ÷ largura); os pesos saíram das medidas dos 1.449 verbetes em três larguras (de 358 a 656 px, erro médio
 * de 12 a 25 px num cartão de uns 550). Montado uma vez, vale a medida dele (ui/near-screen.ts).
 */
export function entryHeightGuess(w: Word, width: number): number {
  const per = (chars: number) => chars / Math.max(width, 200);
  const examples = w.examples.reduce((n, e) => n + examplePlain(e.ja).length + 0.55 * e.pt.length, 0);
  const related = w.composition.replace(/[(),]/g, '').length;
  const registers = w.registers.length === 1 && w.registers[0] === 'neutro' ? 0 : w.registers.join(', ').length + 3;
  return Math.round(
    167 +
      61 * w.examples.length +
      117 * per(examples) +
      222 * per(w.notes.length) +
      (w.origin ? 22 + 202 * per(w.origin.length + 9) : 0) +
      155 * per(w.meaning.length) +
      (related ? 74 + 373 * per(related) : 0) +
      162 * per(grammarOf(w).length + registers) +
      // o botão das conjugações dos verbos
      (isConjugable(w) ? 50 : 0),
  );
}

/**
 * Um verbete do Dicionário Japonês (PLANO-DICIONARIO.md): um cartão com a faixa escura na cor da classe (azul nos
 * nomes, vinho nos verbos, verde nos adjetivos, lilás nos advérbios, laranja nas expressões, cinza quente na gramática).
 * Na faixa, a palavra na Klee One (com a leitura em furigana quando tem kanji), o romaji, ouvir, o uso escrito, o JLPT
 * numa plaquinha, o carimbo 済 de aprendida e a fita de marcador da favorita. No papel, o sentido, a gramática, as
 * frases em caixinhas no tom da classe (a palavra marcada nele), a descrição com o fio, a origem (源) e as palavras
 * ligadas em cartõezinhos. A mesma peça na página do dicionário (um item da lista, `li[app-word-entry]`) e na folhinha
 * da seleção da leitura (ui/word-sheet.ts). As marcas vão pelo guardador (core/dictionary/marks-store.ts), com o
 * Desfazer no bilhete. A Tabela continua com os selos miúdos (ui/word-seals.ts).
 */
@Component({
  selector: '[app-word-entry]',
  imports: [NgTemplateOutlet, WordVoice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-familia]': 'family()', '[attr.data-palavra]': 'word().id' },
  template: `
    @let w = word();
    <div class="faixa">
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
      <app-word-voice [word]="w" [dark]="true" />
      <span class="marcas">
        @if (w.use) {
          <span class="uso" [title]="'Uso: ' + w.use"
            ><b>{{ w.use }}</b><i aria-hidden="true">uso</i><span class="sr-only"> (uso)</span></span
          >
        }
        <span class="nivel" [class.sem-nivel]="w.jlpt === '-'" [title]="'JLPT: ' + jlpt()">
          <span class="sr-only">JLPT </span>{{ w.jlpt === '-' ? '–' : w.jlpt }}
        </span>
        <!-- aprendida: o carimbo 済 (sumi, "feito"). Sem a marca, o recorte tracejado; marcada, batido torto em verde -->
        <button
          type="button"
          class="sumi"
          [class.ligado]="learned()"
          [class.agora]="bumped() === 'sumi'"
          [attr.aria-pressed]="learned()"
          [attr.aria-label]="'Aprendida: ' + w.text"
          [title]="learned() ? 'Aprendida' + (learnedSaid() ? ' ' + learnedSaid() : '') + '. Tocar desmarca' : 'Marcar como aprendida'"
          (click)="setLearned(!learned())"
        >
          <span lang="ja" aria-hidden="true">済</span>
        </button>
      </span>
      <!-- favorita: a fita de marcador de livro. Sem a marca, um toco apagado dentro da faixa; marcada, cai amarela -->
      <button
        type="button"
        class="fita"
        [class.ligado]="favorite()"
        [class.agora]="bumped() === 'fita'"
        [attr.aria-pressed]="favorite()"
        [attr.aria-label]="'Favorita: ' + w.text"
        [title]="favorite() ? 'Favorita. Tocar tira a fita' : 'Marcar como favorita'"
        (click)="setFavorite(!favorite())"
      >
        <span class="corpo" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" /></svg>
        </span>
      </button>
    </div>
    <div class="miolo">
      <!-- achada por uma forma conjugada (a busca, a seleção): o porquê, e o caminho para as conjugações nela -->
      @if (found(); as f) {
        <button type="button" class="achada" [attr.aria-label]="'Achada por ' + f.text + ', ' + f.form.tags + ': ver nas conjugações'" (click)="conjugate.emit({ word: w, form: f.form.id })">
          <span class="achada-como" aria-hidden="true">achada como</span>
          <span class="achada-forma" lang="ja">{{ f.text }}</span>
          <span class="achada-tags">{{ f.form.tags }}</span>
          <span class="achada-ir" aria-hidden="true">ver nas conjugações</span>
        </button>
      }
      <p class="sentido">{{ w.meaning }}</p>
      <p class="gramatica">
        {{ grammar() }}
        @if (registers(); as r) {
          <span class="registro">· {{ r }}</span>
        }
      </p>
      <!-- os verbos: a tabela de conjugações (活用, katsuyō) -->
      @if (conjugable()) {
        <button type="button" class="conjugar" [attr.aria-label]="'Conjugações de ' + w.text" (click)="conjugate.emit({ word: w, form: null })">
          <span class="selo" lang="ja" aria-hidden="true">活</span>
          Conjugações
        </button>
      }
      <!-- as frases, cada uma numa caixinha no tom da classe: o japonês a lápis com a palavra marcada e a tradução embaixo -->
      @if (w.examples.length) {
        <ol class="frases" aria-label="Exemplos">
          @for (f of examples(); track $index) {
            <li>
              <span class="frase" lang="ja">@for (p of f.parts; track $index) {@if (p.mark) {<b>{{ p.text }}</b>} @else {<ng-container>{{ p.text }}</ng-container>}}</span>
              <span class="traducao">{{ f.pt }}</span>
            </li>
          }
        </ol>
      }
      @if (w.notes) {
        <p class="nota">{{ w.notes }}</p>
      }
      @if (w.origin) {
        <p class="origem">
          <span class="selo" lang="ja" aria-hidden="true">源</span><span class="sr-only">Origem: </span>
          <span>{{ w.origin }}</span>
        </p>
      }
      @if (related().length) {
        <div class="ligadas">
          <p class="rotulo-ligadas" [id]="'lig-' + w.id">Palavras ligadas</p>
          <ul class="cartoezinhos" role="list" [attr.aria-labelledby]="'lig-' + w.id">
            @for (r of related(); track $index) {
              <li>
                <!-- na página, a que é outra palavra do dicionário abre a lousa dela -->
                @if (r.word && drawable()) {
                  <button type="button" class="ligada abre" [attr.aria-label]="r.text + ', ' + r.gloss + ': abrir na lousa'" [title]="r.word.meaning" (click)="draw.emit(r.word)">
                    <span class="lig-ja" lang="ja">{{ r.text }}</span>
                    @if (r.gloss) {
                      <span class="lig-pt">{{ r.gloss }}</span>
                    }
                  </button>
                } @else {
                  <span class="ligada">
                    <span class="lig-ja" lang="ja">{{ r.text }}</span>
                    @if (r.gloss) {
                      <span class="lig-pt">{{ r.gloss }}</span>
                    }
                  </span>
                }
              </li>
            }
          </ul>
        </div>
      }
      <p class="numeros">
        <span>nº {{ w.order }}</span>
        <span>importância {{ w.importance }}</span>
        <span>{{ rankSaid() }}</span>
        @if (learnedSaid(); as quando) {
          <span class="quando">aprendida {{ quando }}</span>
        }
      </p>
    </div>
  `,
  styleUrl: './word-entry.scss',
})
export class WordEntry {
  private readonly marks = inject(DictionaryMarks);
  private readonly toasts = inject(Toasts);

  readonly word = input.required<Word>();
  /** A palavra é o botão que abre a lousa (na página do dicionário), e as ligadas que estão no dicionário também. */
  readonly drawable = input(false);
  readonly draw = output<Word>();
  /** A forma conjugada que achou a palavra (a busca, a seleção da leitura): a tira no topo do papel. */
  readonly found = input<Conjugated | null>(null);
  /** As conjugações do verbo, abertas numa forma ou não: quem mostra o verbete abre a folha (ui/word-conjugations.ts). */
  readonly conjugate = output<{ word: Word; form: FormId | null }>();

  /** A família de cor da classe, no `data-familia` do cartão (o SCSS dá a faixa e o tom de cada uma). */
  protected readonly family = computed(() => classFamily(this.word().wordClass));
  /** As palavras ligadas em itens; as que estão no dicionário levam a palavra, para abrir na lousa. */
  protected readonly related = computed(() => relatedWords(this.word().composition, dictionaryWords().byText, this.word().id));
  /** As frases em pedaços, com a palavra marcada. */
  protected readonly examples = computed(() => this.word().examples.map((e) => ({ parts: exampleParts(e.ja), pt: e.pt })));
  /** O verbo conjuga: o botão das conjugações. */
  protected readonly conjugable = computed(() => isConjugable(this.word()));
  /** A leitura vai em furigana por cima só quando a palavra tem kanji. */
  protected readonly ruby = computed(() => hasKanji(this.word().text) && this.word().text !== this.word().reading);
  protected readonly jlpt = computed(() => facetLabel('jlpt', this.word().jlpt));
  /** A classe, o grupo do verbo, o tema e a escrita, numa linha miúda. */
  protected readonly grammar = computed(() => grammarOf(this.word()));
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

  /**
   * O botão que a pessoa acabou de tocar: só ele faz a animação (a batida do 済, a queda da fita). O que já vem marcado
   * aparece parado, para a página não balançar inteira ao abrir nem a cada filtro.
   */
  protected readonly bumped = signal<'sumi' | 'fita' | null>(null);
  private bumpTimer = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.bumpTimer));
  }

  protected setLearned(on: boolean): void {
    this.bump('sumi');
    markLearned(this.marks, this.toasts, this.word(), on);
  }

  protected setFavorite(on: boolean): void {
    this.bump('fita');
    markFavorite(this.marks, this.toasts, this.word(), on);
  }

  private bump(which: 'sumi' | 'fita'): void {
    clearTimeout(this.bumpTimer);
    this.bumped.set(which);
    this.bumpTimer = window.setTimeout(() => this.bumped.set(null), 1200);
  }
}
