import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MarkLookup, Word } from '../core/dictionary/dictionary';
import {
  DRILL_SIZES,
  DRILL_SOURCES,
  DRILL_WAYS,
  DrillSetup,
  DrillSize,
  DrillSource,
  DrillWay,
  JP_SHOWS,
  JpShow,
  NEEDS,
  Need,
  SCRIPTS,
  Script,
  WRITE_HINTS,
  WriteHint,
  WAY_INFO,
  drillPool,
  needCounts,
  readSetup,
  sourceCounts,
  sourceWords,
  writeSetup,
} from '../core/dictionary/drill';
import { isLearned } from '../core/dictionary/marks';
import { DictionaryMarks } from '../core/dictionary/marks-store';
import { toHiragana } from '../core/dictionary/kana';
import { dictionaryWords } from '../core/dictionary/words';
import { plural } from '../core/text';
import { Voz } from '../core/voz';
import { BackdropClose } from './backdrop-close';
import { loadKleeOne } from './font-sheet';
import { ICON, IconModule } from './icons';
import { DrillChoice, StudyDrillPicker } from './study-drill-picker';

/** O que a folha entrega ao Começar: a montagem e as palavras que combinam com ela (o treino sorteia entre elas). */
export interface DrillStart {
  setup: DrillSetup;
  pool: Word[];
}


const SOURCE_LABEL: Record<DrillSource, string> = { aprendidas: 'Aprendidas', favoritas: 'Favoritas', todas: 'Dicionário inteiro' };
const SCRIPT_INFO: Record<Script, { label: string; glyph: string }> = {
  kanji: { label: 'Kanji', glyph: '漢' },
  hiragana: { label: 'Hiragana', glyph: 'あ' },
  katakana: { label: 'Katakana', glyph: 'ア' },
};
const NEED_LABEL: Record<Need, string> = { precisa: 'Precisa ter', tanto: 'Tanto faz', sem: 'Não pode ter' };
const HINT_LABEL: Record<WriteHint, string> = { som: 'Som', romaji: 'Romaji', traducao: 'Tradução' };
const SHOW_LABEL: Record<JpShow, string> = { escrito: 'Escrito', falado: 'Falado' };

/**
 * Montar o treino do Dicionário Japonês (PLANO-TREINO-DICIONARIO.md, seção 2): a folhinha de papel de arroz com o
 * carimbo 練習, e as linhas da folha de filtros (ui/_filtro-linhas.scss): os jeitos de treinar, com quais palavras (De
 * onde × Quais, com o Escolher… na folha dos flashcards), os três filtros de escrita, as dicas do Escrever, como mostrar
 * o japonês e quantas. Cada recorte diz quantas palavras sobrariam. No pé, quantas combinam e o Começar, com o foco:
 * quem treina sempre igual abre e aperta Enter. A montagem do último treino fica guardada neste navegador.
 */
@Component({
  selector: 'app-word-drill-setup',
  imports: [BackdropClose, IconModule, StudyDrillPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './word-drill-setup.html',
  styleUrl: './word-drill-setup.scss',
})
export class WordDrillSetup {
  private readonly marks = inject(DictionaryMarks);
  private readonly voz = inject(Voz);
  private readonly words = dictionaryWords().words;

  /** Os jeitos que já existem na mesa. */
  readonly ways = input<readonly DrillWay[]>(DRILL_WAYS);
  readonly started = output<DrillStart>();
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly StartIcon = ICON.alvo;
  protected readonly PickIcon = ICON.tarefas;
  protected readonly WAY_INFO = WAY_INFO;
  protected readonly SOURCES = DRILL_SOURCES;
  protected readonly SOURCE_LABEL = SOURCE_LABEL;
  protected readonly SCRIPTS = SCRIPTS;
  protected readonly SCRIPT_INFO = SCRIPT_INFO;
  protected readonly NEEDS = NEEDS;
  protected readonly NEED_LABEL = NEED_LABEL;
  protected readonly HINTS = WRITE_HINTS;
  protected readonly HINT_LABEL = HINT_LABEL;
  protected readonly SHOWS = JP_SHOWS;
  protected readonly SHOW_LABEL = SHOW_LABEL;
  protected readonly SIZES = DRILL_SIZES;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly startBtn = viewChild<ElementRef<HTMLButtonElement>>('comecar');
  private readonly paper = viewChild<ElementRef<HTMLElement>>('papel');

  /** A montagem (a do último treino, lida ao abrir). */
  protected readonly setup = signal<DrillSetup>(readSetup());
  /** A lista do Escolher… aberta. */
  protected readonly choosing = signal(false);

  /** As marcas da pessoa, como o treino as pergunta (o CSV por baixo, a marca por cima). */
  private readonly lookup = computed<MarkLookup>(() => {
    const byId = this.marks.byId();
    const csv = this.marks.csvApplies();
    return { learned: (w) => isLearned(w, byId.get(w.id), csv), favorite: (id) => !!byId.get(id)?.favorite };
  });

  /** O aparelho tem voz japonesa (o Som e o Falado precisam dela). */
  protected readonly voice = computed(() => this.voz.voicesOf('ja').length > 0);

  /** A pessoa já mexeu nos jeitos nesta folha. */
  private readonly waysTouched = signal(false);
  /**
   * Os jeitos marcados que existem na mesa. Nenhum dos guardados existe (um jeito que a mesa ainda não tem): o primeiro
   * que existe, até a pessoa mexer, sem apagar o guardado.
   */
  protected readonly chosenWays = computed(() => {
    const on = this.setup().ways.filter((w) => this.ways().includes(w));
    return on.length || this.waysTouched() ? on : this.ways().slice(0, 1);
  });
  protected readonly writes = computed(() => this.chosenWays().includes('escrever'));
  protected readonly reads = computed(() => this.chosenWays().includes('jp-pt'));

  protected readonly pool = computed(() => drillPool(this.words, this.setup(), this.lookup()));
  protected readonly sourceN = computed(() => sourceCounts(this.words, this.setup(), this.lookup()));
  /** Quantas cada De onde tem sem os filtros nem o Escolher (zero: o motivo, no lugar do número). */
  private readonly sourceRaw = computed(() =>
    sourceCounts(this.words, { ...this.setup(), pick: 'todas', needs: { kanji: 'tanto', hiragana: 'tanto', katakana: 'tanto' } }, this.lookup()),
  );
  protected readonly needN = computed(() => {
    const s = this.setup();
    const m = this.lookup();
    return Object.fromEntries(SCRIPTS.map((sc) => [sc, needCounts(this.words, s, m, sc)])) as Record<Script, Record<Need, number>>;
  });
  /** As palavras do De onde nos filtros: a lista do Escolher… */
  private readonly listWords = computed(() => sourceWords(this.words, this.setup(), this.lookup()));
  /** Quantas escolhidas valem agora (as do De onde que passam nos filtros). */
  protected readonly chosenN = computed(() => (this.setup().pick === 'escolher' ? this.pool().length : 0));

  protected readonly choices = computed<DrillChoice[]>(() =>
    this.listWords().map((w) => ({
      note: w.id,
      title: w.meaning,
      glyph: w.text,
      meta: `${w.reading !== w.text ? w.reading + ' · ' : ''}${w.romaji}${w.jlpt !== '-' ? ' · ' + w.jlpt : ''}`,
      stock: '',
      icon: null,
      search: `${w.text} ${toHiragana(w.reading)}`,
    })),
  );
  protected readonly chosenNow = computed(() => {
    const ids = new Set(this.listWords().map((w) => w.id));
    return this.setup().chosen.filter((id) => ids.has(id));
  });
  protected readonly pickLead = computed(() => {
    const src = this.setup().source;
    const from = src === 'aprendidas' ? 'as aprendidas' : src === 'favoritas' ? 'as favoritas' : 'o dicionário inteiro';
    return `Entre ${from} que passam nos filtros de escrita.`;
  });

  /** Quantas o treino terá (o tamanho pedido, ou todas as que combinam). */
  protected readonly drawn = computed(() => {
    const n = this.pool().length;
    const size = this.setup().size;
    return size ? Math.min(size, n) : n;
  });
  /** O que falta para começar (null: pode começar). */
  protected readonly blocked = computed<string | null>(() => {
    if (!this.chosenWays().length) return 'Marque um jeito de treinar.';
    if (this.setup().pick === 'escolher' && !this.pool().length) return 'Escolha as palavras do treino.';
    if (!this.pool().length) return 'Nenhuma palavra combina com isso. Afrouxe a escrita ou troque o De onde.';
    return null;
  });
  protected readonly summary = computed(() => {
    const n = this.pool().length;
    const k = this.drawn();
    return k < n ? `${plural(k, 'palavra sorteada', 'palavras sorteadas')} entre ${n}` : plural(n, 'palavra', 'palavras');
  });

  constructor() {
    loadKleeOne();
    // o De onde guardado ficou vazio (sem conta, sem favoritas): o primeiro que tem palavras
    const s = this.setup();
    const raw = this.sourceRaw();
    if (!raw[s.source]) {
      const other = DRILL_SOURCES.find((src) => raw[src] > 0);
      if (other) this.setup.set({ ...s, source: other });
    }
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      // o foco no Começar: quem treina sempre igual abre e aperta Enter. Sem como começar, no papel (o motivo está no pé)
      setTimeout(() => (this.blocked() ? this.paper() : this.startBtn())?.nativeElement.focus());
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** Quantas o De onde tem, ou o motivo de não ter nenhuma. */
  protected sourceEmpty(src: DrillSource): string | null {
    if (this.sourceRaw()[src]) return null;
    if (src === 'aprendidas') return 'Marque palavras com 覚 nos verbetes';
    if (src === 'favoritas') return 'Marque palavras com a estrela nos verbetes';
    return null;
  }

  private patch(p: Partial<DrillSetup>): void {
    this.setup.update((s) => ({ ...s, ...p }));
  }

  protected toggleWay(w: DrillWay): void {
    const on = this.chosenWays();
    const next = on.includes(w) ? on.filter((x) => x !== w) : [...on, w];
    // os guardados que a mesa ainda não tem ficam guardados
    const kept = this.setup().ways.filter((x) => !this.ways().includes(x));
    this.waysTouched.set(true);
    this.patch({ ways: DRILL_WAYS.filter((x) => next.includes(x) || kept.includes(x)) });
  }

  protected setSource(src: DrillSource): void {
    this.patch({ source: src });
  }

  protected setPick(pick: 'todas' | 'escolher'): void {
    this.patch({ pick });
    // escolher sem nenhuma escolhida: a lista abre na hora
    if (pick === 'escolher' && !this.chosenNow().length) this.openPicker();
  }

  /** As marcadas ao abrir a lista: tiradas uma vez (as marcas mudando por outra aba não desfazem o que se marca nela). */
  protected readonly pickerInitial = signal<string[]>([]);

  protected openPicker(): void {
    this.pickerInitial.set(this.chosenNow());
    this.choosing.set(true);
  }

  protected setNeed(sc: Script, n: Need): void {
    this.patch({ needs: { ...this.setup().needs, [sc]: n } });
  }

  protected toggleHint(h: WriteHint): void {
    const hints = this.setup().hints;
    const next = hints.includes(h) ? hints.filter((x) => x !== h) : WRITE_HINTS.filter((x) => x === h || hints.includes(x));
    if (next.length) this.patch({ hints: next });
  }

  protected toggleShow(v: JpShow): void {
    const show = this.setup().show;
    const next = show.includes(v) ? show.filter((x) => x !== v) : JP_SHOWS.filter((x) => x === v || show.includes(x));
    if (next.length) this.patch({ show: next });
  }

  protected setSize(n: DrillSize): void {
    this.patch({ size: n });
  }

  /** A dica marcada (o Som sem voz não conta: fica apagado). */
  protected hintOn(h: WriteHint): boolean {
    return this.setup().hints.includes(h) && (h !== 'som' || this.voice());
  }

  protected showOn(v: JpShow): boolean {
    return this.setup().show.includes(v) && (v !== 'falado' || this.voice());
  }

  /** As escolhidas da lista: as de outros De onde ficam guardadas. */
  protected picked(ids: string[]): void {
    const shown = new Set(this.listWords().map((w) => w.id));
    this.patch({ chosen: [...this.setup().chosen.filter((id) => !shown.has(id)), ...ids], pick: 'escolher' });
  }

  /** A lista fechou sem nenhuma escolhida: volta ao Todas (o Escolher sem palavras não treina nada). */
  protected pickerClosed(): void {
    this.choosing.set(false);
    if (!this.chosenNow().length) this.patch({ pick: 'todas' });
  }

  protected start(): void {
    if (this.blocked()) return;
    const setup = { ...this.setup(), ways: this.chosenWays() };
    writeSetup({ ...this.setup(), ways: DRILL_WAYS.filter((w) => setup.ways.includes(w) || (this.setup().ways.includes(w) && !this.ways().includes(w))) });
    this.started.emit({ setup, pool: this.pool() });
    this.close();
  }
}
