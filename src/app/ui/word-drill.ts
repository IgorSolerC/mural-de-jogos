import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { Word, spokenOf } from '../core/dictionary/dictionary';
import { DrillAnswer, DrillItem, DrillSetup, JaMatch, WAY_INFO, checkJa, checkPt, drawDrill, drillScore } from '../core/dictionary/drill';
import { hasKanji, romajiToKana } from '../core/dictionary/kana';
import { BOUNCE_MS, reducedMotion } from '../core/motion';
import { Voz } from '../core/voz';
import { loadKleeOne } from './font-sheet';
import { ICON, IconModule } from './icons';
import { WordVoice } from './word-voice';

/** A pergunta de cada jeito, em uma frase. */
const QUESTION: Record<DrillItem['way'], string> = {
  escrever: 'Como se escreve?',
  'pt-jp': 'Como se diz em japonês?',
  'jp-pt': 'O que quer dizer?',
};

const JA_MATCH_SAID: Record<Exclude<JaMatch, null>, string> = {
  escrita: 'Bateu com a escrita',
  leitura: 'Bateu com a leitura',
  romaji: 'Bateu com o romaji',
};

/**
 * A mesa do Treino do dicionário (PLANO-TREINO-DICIONARIO.md, seção 3): a tela cheia da mesa dos Flashcards (a parede,
 * a linha de cima com o Parar, o placar e o Desfazer, e os botões do pé, em ui/_mesa.scss) com uma folha de papel de
 * arroz no meio, a pergunta da palavra. Nos jeitos digitados, a pessoa escreve e confere (Enter): a resposta certa
 * aparece e o site diz se bateu, mas quem decide é ela (Errei 1, Acertei 2; Enter, o sugerido). Desfazer (Z) volta a
 * palavra de antes com o que se tinha escrito. O treino não guarda nada: some ao fechar. Parar depois de alguma
 * resposta mostra o fim, com o que já foi feito.
 */
@Component({
  selector: 'app-word-drill',
  imports: [IconModule, WordVoice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './word-drill.html',
  styleUrl: './word-drill.scss',
  host: { '(keydown)': 'onKey($event)' },
})
export class WordDrill {
  private readonly voz = inject(Voz);

  readonly setup = input.required<DrillSetup>();
  /** As palavras que combinam com a montagem (o treino sorteia entre elas). */
  readonly pool = input.required<readonly Word[]>();
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly WrongIcon = ICON.fechar;
  protected readonly RightIcon = ICON.pronto;
  protected readonly UndoIcon = ICON.desfazer;
  protected readonly AgainIcon = ICON.recomecar;
  protected readonly WAY_INFO = WAY_INFO;
  protected readonly QUESTION = QUESTION;
  protected readonly calm = reducedMotion();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('campo');

  /** As palavras sorteadas, na ordem do treino. */
  protected readonly items = signal<DrillItem[]>([]);
  protected readonly answers = signal<DrillAnswer[]>([]);
  /** O treino acabou (todas respondidas, ou Parar depois de alguma). */
  protected readonly finished = signal(false);
  /** O que a pessoa digitou na palavra da vez, e se já conferiu. */
  protected readonly typed = signal('');
  protected readonly checked = signal(false);
  /** O que o leitor de tela diz (conferiu, respondeu). */
  protected readonly spoken = signal('');
  private started = Date.now();
  private rounds = 0;
  /** Quando os botões do pé trocaram (o clique duplo não cai no botão que acabou de surgir; ver `BOUNCE_MS`). */
  private swappedAt = 0;

  /** A palavra da vez (null: acabou). */
  protected readonly item = computed(() => (this.finished() ? null : (this.items()[this.answers().length] ?? null)));
  protected readonly position = computed(() => `${Math.min(this.answers().length + 1, this.items().length)} de ${this.items().length}`);
  protected readonly score = computed(() => drillScore(this.answers()));
  protected readonly withKanji = computed(() => {
    const it = this.item();
    return !!it && hasKanji(it.word.text) && it.word.reading !== it.word.text;
  });

  /** O romaji digitado lido como kana, ao vivo (o Português → japonês sem teclado japonês). */
  protected readonly asKana = computed(() => {
    const it = this.item();
    const t = this.typed().trim();
    if (it?.way !== 'pt-jp' || !/[a-z]/i.test(t)) return null;
    return romajiToKana(t);
  });

  /** Com o que a resposta bateu (depois de conferir): o que dizer, ou null quando não bateu. */
  protected readonly match = computed<string | null>(() => {
    const it = this.item();
    if (!it || !this.checked()) return null;
    if (it.way === 'pt-jp') {
      const m = checkJa(it.word, this.typed());
      return m ? JA_MATCH_SAID[m] : null;
    }
    if (it.way === 'jp-pt') {
      const sense = checkPt(it.word, this.typed());
      return sense ? `Bateu com “${sense}”` : null;
    }
    return null;
  });

  constructor() {
    loadKleeOne();
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.begin(this.pool());
    });
    inject(DestroyRef).onDestroy(() => this.voz.hushTitle());
  }

  /** Um treino novo com estas palavras (o primeiro, ou o Outro treino do fim). */
  private begin(words: readonly Word[]): void {
    const voice = this.voz.voicesOf('ja').length > 0;
    this.items.set(drawDrill(words, this.setup(), `${Date.now()}:${this.rounds++}`, voice));
    this.answers.set([]);
    this.finished.set(false);
    this.started = Date.now();
    this.arrive();
  }

  /** A palavra da vez chega: o campo limpo, a voz quando a pergunta é falada, o foco no campo. */
  private arrive(typed = ''): void {
    this.voz.hushTitle();
    this.typed.set(typed);
    this.checked.set(false);
    this.swappedAt = performance.now();
    const it = this.item();
    if (!it) {
      this.spoken.set('Treino completo.');
      this.focusLater('.fim .btn-ink');
      return;
    }
    if (it.way === 'jp-pt' && it.show === 'falado') this.say(it.word);
    this.focusLater('.campo input');
  }

  protected say(w: Word): void {
    this.voz.sayTitle(spokenOf(w), 'ja', `dicionario:${w.id}`);
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** O X e o Esc: depois de alguma resposta, o fim com o que já foi feito; no fim, ou sem nada respondido, fecha. */
  protected stop(): void {
    if (this.answers().length && !this.finished()) {
      this.voz.hushTitle();
      this.finished.set(true);
      this.spoken.set('Treino parado.');
      this.focusLater('.fim .btn-ink');
    } else this.close();
  }

  protected onCancel(e: Event): void {
    e.preventDefault();
    this.stop();
  }

  /** O Enter que confirma a conversão do teclado japonês (kana → kanji) não confere: a pessoa ainda está escrevendo. */
  protected enterInField(e: Event): void {
    const k = e as KeyboardEvent;
    if (k.isComposing || k.keyCode === 229) e.preventDefault();
  }

  /** Conferir: a resposta certa aparece, e o foco vai para o botão que o site sugere. */
  protected check(): void {
    if (!this.item() || this.checked()) return;
    this.checked.set(true);
    this.swappedAt = performance.now();
    const m = this.match();
    this.spoken.set(m ? `${m}.` : 'Não bateu.');
    this.focusLater(m ? '.acertei' : '.errei');
  }

  protected answer(ok: boolean): void {
    const it = this.item();
    if (!it || !this.checked()) return;
    this.answers.update((list) => [...list, { item: it, ok, typed: this.typed() }]);
    if (this.answers().length >= this.items().length) this.finished.set(true);
    this.arrive();
    if (!this.finished()) this.spoken.set(ok ? 'Acertou.' : 'Errou.');
  }

  /** Desfazer: a última resposta volta, com o que se tinha escrito, para conferir de novo. */
  protected undo(): void {
    const list = this.answers();
    const last = list.at(-1);
    if (!last) return;
    this.answers.set(list.slice(0, -1));
    this.finished.set(false);
    this.arrive(last.typed ?? '');
    this.spoken.set('Resposta desfeita');
  }

  /** O clique que era para o botão de antes (o do teclado, `detail` 0, vale). */
  protected press(e: MouseEvent, what: 'conferir' | 'errei' | 'acertei'): void {
    if (e.detail > 0 && e.timeStamp - this.swappedAt < BOUNCE_MS) return;
    if (what === 'conferir') this.check();
    else this.answer(what === 'acertei');
  }

  /** Outro treino: as mesmas regras, outro sorteio. */
  protected again(): void {
    this.begin(this.pool());
  }

  protected onKey(e: KeyboardEvent): void {
    const inField = e.target instanceof HTMLElement && !!e.target.closest('input, textarea');
    const key = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (inField && !this.checked()) return;
    if (e.repeat && ['1', '2', 'enter'].includes(key)) {
      e.preventDefault();
      return;
    }
    if (key === 'z') {
      e.preventDefault();
      this.undo();
    } else if (key === 'r') {
      const it = this.item();
      if (it && (this.checked() || (it.way === 'jp-pt' && it.show === 'falado'))) {
        e.preventDefault();
        this.say(it.word);
      }
    } else if (this.checked() && key === '1') {
      e.preventDefault();
      this.answer(false);
    } else if (this.checked() && key === '2') {
      e.preventDefault();
      this.answer(true);
    }
  }

  private focusLater(selector: string): void {
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }

  /** Quanto tempo o treino levou, dito como gente. */
  protected minutes(): string {
    const m = Math.max(1, Math.round((Date.now() - this.started) / 60_000));
    return m === 1 ? '1 minuto' : `${m} minutos`;
  }
}
