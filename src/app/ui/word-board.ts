import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { Word, compositionParts, wordsWithKanji } from '../core/dictionary/dictionary';
import { hasKanji } from '../core/dictionary/kana';
import { dictionaryWords } from '../core/dictionary/words';
import { reducedMotion } from '../core/motion';
import { BackdropClose } from './backdrop-close';
import { ROOM, showInRoom } from './room';
import { loadKleeOne, loadYujiSyuku } from './font-sheet';
import { ICON, IconModule } from './icons';
import { WordVoice } from './word-voice';
import { BrushPad } from './brush-pad';
import { Speed, StrokeOrder, StrokePlayer, Strokes, Tianzige } from './stroke-order';
import { BrushStroke } from '../core/dictionary/drill';

type Mode = 'pincel' | 'ordem' | 'treinar';

/** O começo de um traço (o primeiro "M x,y" do caminho), onde a guia do Treinar põe a bolinha. */
export function strokeStart(d: string): [number, number] | null {
  const m = /^\s*M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/i.exec(d);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Os caracteres que a lousa desenha: tudo menos o 〜 e os espaços. */
export function boardChars(text: string): string[] {
  return [...text].filter((c) => c !== '〜' && c !== '～' && c.trim() !== '');
}

/**
 * A lousa do Dicionário Japonês (PLANO-DICIONARIO.md, 5.1): a palavra maximizada numa folha de papel de arroz, para
 * aprender a escrever. Em cima, a palavra inteira no pincel (Yuji Syuku), cada caractere um botão; embaixo, o
 * quadrado de caligrafia (o 田字格, a cruz vermelha tracejada dos cadernos japoneses) em três jeitos: **Pincel**, o
 * caractere enorme na letra de pincel; **Ordem**, os traços do KanjiVG aparecendo um a um, numerados, com tocar,
 * pausar, passo a passo e a velocidade; e **Treinar**, o modelo apagado embaixo e o próximo traço como guia, para traçar
 * por cima com o dedo ou o mouse. Ao lado, a tabela de passos (筆順): um quadradinho por traço, o novo em vermelho.
 * Os traços chegam sob demanda (core/dictionary/strokes.ts, um pedaço só deles). Só desenho: nada é guardado.
 */
@Component({
  selector: 'app-word-board',
  imports: [BackdropClose, BrushPad, IconModule, StrokeOrder, Tianzige, WordVoice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'key($event)' },
  templateUrl: './word-board.html',
  styleUrl: './word-board.scss',
})
export class WordBoard {
  private readonly destroyRef = inject(DestroyRef);

  readonly word = input.required<Word>();
  /** Há palavra antes e depois na lista da página (as setas da lousa andam por ela). */
  readonly hasPrev = input(false);
  readonly hasNext = input(false);
  readonly step = output<-1 | 1>();
  /** Outra palavra (da composição ou das que usam o mesmo kanji): a página abre a lousa dela. */
  readonly goto = output<Word>();
  readonly closed = output<void>();
  /** O lado da leitura onde o dicionário está (ui/room.ts): a folha abre nele, e não na tela inteira. */
  private readonly rooms = inject(ROOM, { optional: true });
  /** Esconde a folha aberta no lado (ou null: aberta como modal, ou fechada). */
  private hideRoom: (() => void) | null = null;
  /** A folha que sai de cena aberta no lado (o lado fechou) leva o véu e o ouvinte do Esc junto. */
  private readonly unroom = inject(DestroyRef).onDestroy(() => this.hideRoom?.());

  protected readonly CloseIcon = ICON.fechar;
  protected readonly PrevIcon = ICON.anterior;
  protected readonly NextIcon = ICON.proximo;
  protected readonly PlayIcon = ICON.estudar;
  protected readonly PauseIcon = ICON.pausa;
  protected readonly RestartIcon = ICON.recomecar;
  protected readonly UndoIcon = ICON.desfazer;
  protected readonly ClearIcon = ICON.borracha;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly reduced = reducedMotion();

  /** Todos os traços do dicionário, quando chegam (null: ainda não, ou não deu para baixar). */
  protected readonly strokes = signal<Record<string, Strokes> | null>(null);
  protected readonly failed = signal(false);

  /** Desenhar a escrita (来る) ou a leitura (くる), quando são diferentes. */
  protected readonly script = signal<'escrita' | 'leitura'>('escrita');
  protected readonly hasReading = computed(() => hasKanji(this.word().text) && this.word().reading !== this.word().text);
  protected readonly chars = computed(() => boardChars(this.script() === 'leitura' ? this.word().reading : this.word().text));
  /** O caractere no quadrado (o índice em `chars`). */
  protected readonly at = signal(0);
  protected readonly char = computed(() => this.chars()[this.at()] ?? '');
  protected readonly data = computed<Strokes | null>(() => this.strokes()?.[this.char()] ?? null);
  private readonly dict = dictionaryWords();
  /** O caractere no quadrado, quando é kanji: as outras palavras com ele aparecem ao lado. */
  protected readonly kanjiNow = computed(() => (hasKanji(this.char()) ? this.char() : null));
  protected readonly sameKanji = computed(() => {
    const k = this.kanjiNow();
    return k ? wordsWithKanji(this.dict.words, k, this.word().id) : [];
  });
  /** A composição em pedaços, com as outras palavras do dicionário em link. */
  protected readonly parts = computed(() => compositionParts(this.word().composition, this.dict.byText, this.word().id));
  /** Os caracteres que têm traços (o ？ não tem). */
  protected readonly drawable = computed(() => this.chars().map((c) => !!this.strokes()?.[c]));

  protected readonly mode = signal<Mode>('ordem');
  protected readonly modes: readonly { value: Mode; label: string; hint: string }[] = [
    { value: 'pincel', label: 'Pincel', hint: 'O caractere enorme, na letra de pincel' },
    { value: 'ordem', label: 'Ordem', hint: 'Os traços aparecendo um a um, na ordem de escrever' },
    { value: 'treinar', label: 'Treinar', hint: 'Trace por cima do modelo, um traço de cada vez' },
  ];

  // ===== A ordem dos traços (ui/stroke-order.ts) =====
  private readonly player = new StrokePlayer(() => this.data(), () => this.dialog().nativeElement, this.reduced);
  /** Quantos traços já estão desenhados inteiros (0 a N). */
  protected readonly shown = this.player.shown;
  /** O traço que está sendo desenhado agora (o índice), ou null. */
  protected readonly drawing = this.player.drawing;
  protected readonly playing = this.player.playing;
  protected readonly speed = this.player.speed;
  protected readonly speeds: readonly { value: Speed; label: string }[] = [
    { value: 0.5, label: 'Devagar' },
    { value: 1, label: 'Normal' },
    { value: 2, label: 'Rápido' },
  ];
  /** Um passo pedido pela tabela vindo de outro jeito: a troca para a Ordem mostra até ele, em vez de tocar. */
  private pendingStep: number | null = null;

  protected readonly total = this.player.total;
  protected readonly counter = computed(() => `${Math.min(this.shown() + (this.drawing() !== null ? 1 : 0), this.total())} / ${this.total()}`);

  // ===== Treinar =====
  /** Os traços que a pessoa já fez (pontos no quadro de 109), no quadro de traçar (ui/brush-pad.ts). */
  protected readonly drawn = signal<BrushStroke[]>([]);
  protected readonly done = computed(() => Math.min(this.drawn().length, this.total()));
  protected readonly showModel = signal(true);
  /** O próximo traço a fazer: a guia vermelha tracejada, com a bolinha onde ele começa. */
  protected readonly guide = computed(() => {
    const d = this.data();
    const i = this.done();
    if (!d || i >= d.s.length) return null;
    return { d: d.s[i], start: strokeStart(d.s[i]), n: i + 1 };
  });

  constructor() {
    loadYujiSyuku();
    loadKleeOne();
    import('../core/dictionary/strokes')
      .then((m) => this.strokes.set(m.STROKES))
      .catch(() => this.failed.set(true));
    // no lado da leitura (PLANO-LADO-A-LADO.md, D5), a lousa cobre só o lado; sem lado, a tela inteira
    afterNextRender(() => {
      const room = this.rooms?.room() ?? null;
      if (room) this.hideRoom = showInRoom(this.dialog().nativeElement, room, () => this.close());
      else this.dialog().nativeElement.showModal();
    });

    // outra palavra (as setas), ou a escrita/leitura trocada: volta ao primeiro caractere que tem traços. Os traços
    // que chegam depois (o pedaço ainda baixava) mantêm o caractere já escolhido, se ele tem traços
    let drawnFor = '';
    effect(() => {
      const key = `${this.word().id}|${this.script()}`;
      const drawable = this.drawable();
      untracked(() => {
        const keep = key === drawnFor && drawable[this.at()];
        drawnFor = key;
        if (!keep) this.at.set(Math.max(0, drawable.indexOf(true)));
      });
    });
    // outro caractere: recomeça a ordem (tocando sozinho, uma vez, se não pede menos movimento) e limpa o treino
    // (a palavra e a escrita também: a palavra seguinte pode começar pelo mesmo caractere, com os mesmos traços)
    effect(() => {
      this.word();
      this.script();
      const d = this.data();
      const mode = this.mode();
      untracked(() => {
        this.stop();
        // o traço que estava no meio (o dedo ainda no quadrado) não passa para o caractere seguinte: o quadro de
        // traçar larga o traço quando os traços mudam por fora
        this.drawn.set([]);
        this.shown.set(0);
        if (!d) return;
        const asked = this.pendingStep;
        this.pendingStep = null;
        if (mode === 'ordem' && asked !== null) this.shown.set(Math.min(asked, d.s.length));
        else if (mode === 'ordem' && !this.reduced) this.play();
        else if (mode === 'ordem') this.shown.set(d.s.length);
      });
    });
    this.destroyRef.onDestroy(() => this.stop());
  }

  close(): void {
    this.stop();
    // no lado, ela não é um diálogo aberto: esconde e avisa (o `close` do diálogo não vem)
    if (this.hideRoom) {
      const hide = this.hideRoom;
      this.hideRoom = null;
      hide();
      this.closed.emit();
      return;
    }
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** Um caractere da palavra no quadrado; com os traços ainda chegando, a escolha fica (o "Molhando o pincel…"). */
  protected choose(i: number): void {
    if (this.strokes() === null || this.drawable()[i]) this.at.set(i);
  }

  protected setMode(m: Mode): void {
    this.mode.set(m);
  }

  // ===== A ordem =====

  protected toggle(): void {
    this.player.toggle();
  }

  protected play(): void {
    void this.player.play();
  }

  private stop(): void {
    this.player.stop();
  }

  /** Um traço para trás ou para a frente, parado. */
  protected go(delta: -1 | 1): void {
    this.player.go(delta);
  }

  protected restart(): void {
    this.player.restart();
  }

  /** A tabela de passos: tocar num quadradinho mostra a lousa até aquele traço. */
  protected jump(i: number): void {
    this.stop();
    if (this.mode() !== 'ordem') {
      // a troca de jeito recomeça a lousa: ela mesma mostra até o passo pedido
      this.pendingStep = i + 1;
      this.mode.set('ordem');
    } else this.shown.set(i + 1);
  }

  protected setSpeed(s: Speed): void {
    this.speed.set(s);
  }

  // ===== Treinar =====

  protected undo(): void {
    this.drawn.update((list) => list.slice(0, -1));
  }

  protected clear(): void {
    this.drawn.set([]);
  }

  // ===== Teclado =====

  protected key(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' && this.mode() === 'ordem' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      this.toggle();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.shiftKey) {
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if ((d === -1 && this.hasPrev()) || (d === 1 && this.hasNext())) {
        e.preventDefault();
        this.step.emit(d);
      }
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.mode() === 'ordem') {
      e.preventDefault();
      this.go(e.key === 'ArrowLeft' ? -1 : 1);
    }
  }
}
