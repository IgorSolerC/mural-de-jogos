import { Injectable, Signal, WritableSignal, computed, effect, forwardRef, inject, signal } from '@angular/core';
import { KindProfile, countOf, isNotes, revisitCountOf } from './kinds';
import { Mural } from './mural';
import { checkCount } from './rich-text';
import { Settings } from './settings';
import {
  NO_DAY_LABEL,
  RATED_KEYS,
  Review,
  SCORE_LABEL,
  STATUS_RANK,
  ScoreKey,
  fold,
  isDone,
  isPinnedNote,
  rankOrder,
  parseDay,
  scoreKeys,
  scoreOf,
  shownFinal,
} from './review';
import { ALL_TAB, NoteTabs, hasTab, noteTabKey, noteTabsOf } from './note-tabs';
import { FacetKey, NO_FILTER, WallFilter, facetsOf, filterSize, matchesFilter, matchesQuery, tagsOf, toggleOption } from './wall-filter';

/**
 * `categoria`, `tag` (pela primeira tag) e `prioridade` (fixadas, comuns, sub-notas) só no mural de
 * anotações; `nota` e `status`, só nos de resenhas.
 */
export type SortKey = 'data' | 'nota' | 'alfabetica' | 'status' | 'categoria' | 'tag' | 'prioridade';
const SORT_KEYS: readonly SortKey[] = ['data', 'nota', 'alfabetica', 'status', 'categoria', 'tag', 'prioridade'];
export type Direction = 'desc' | 'asc';
/**
 * Completa (tudo), inteira (a completa com o texto todo, as fichas encaixadas em colagem), simples
 * (a tira com a nota), capas (só a foto e o nome, para ver o máximo de fichas) ou lista (só no mural
 * de anotações: uma linha por anotação, ver NoteIndex).
 */
export type Density = 'completa' | 'inteira' | 'simples' | 'capas' | 'lista';

const KEY = 'mural-de-jogos:vista:v1';
/** A vista dos murais dos outros: a ordem e o tipo de ficha de quem visita, separados dos do seu mural. */
export const VISIT_KEY = 'mural-de-jogos:vista-visita:v1';

/** Os grupos da cartela de filtros que contam o que a pessoa achou: somem no modo sem spoilers. */
export const SPOILER_FACETS: readonly FacetKey[] = ['verdict', 'grade', 'difficulty'];

/** O filtro sem os grupos que contam o que a pessoa achou (veredito, nota, dificuldade). */
export function withoutSpoilerFacets(f: WallFilter): WallFilter {
  return f.verdict.length || f.grade.length || f.difficulty.length ? { ...f, verdict: [], grade: [], difficulty: [] } : f;
}

const DENSITIES: readonly Density[] = ['completa', 'inteira', 'simples', 'capas', 'lista'];
/** Os tipos de ficha dos murais de resenhas (a lista é só das anotações). */
const REVIEW_DENSITIES: readonly Density[] = ['completa', 'inteira', 'simples', 'capas'];

/** Como uma aba do mural de anotações está: a ordem, a direção e o tipo de ficha dela. */
export interface NoteView {
  sort: SortKey;
  direction: Direction;
  density: Density;
}

/** A vista de sempre do mural de anotações: Prioridade, as mais recentes primeiro, fichas completas. */
const NOTE_VIEW: NoteView = { sort: 'prioridade', direction: 'desc', density: 'completa' };

interface ViewPrefs {
  /** A ordem, a direção e o tipo de ficha dos murais de resenhas. */
  sort: SortKey;
  scoreKey: ScoreKey;
  direction: Direction;
  density: Density;
  /**
   * Cada aba do mural de anotações com a sua vista (a chave é a da aba; "" é Tudo). A aba que ainda
   * não tem a dela começa como a de Tudo.
   */
  noteViews: Record<string, NoteView>;
  /** O mural de anotações mostra as finalizadas também. */
  showDone: boolean;
  /**
   * No mural de anotações, as fixadas ficam no topo também nas outras ordens (Data, Título, Categoria,
   * Tag). Sem isso, só a Prioridade separa as fixadas; as outras ordens as tratam como as outras.
   */
  pinnedFirst: boolean;
  /** A aba aberta no mural de anotações (ver core/note-tabs.ts); vazia, "Tudo". */
  noteTab: string;
  /** As seções fechadas: "aba::seção" nas anotações, "k:mural::seção" nos outros (ver `WallView.collapsed`). */
  collapsed: string[];
}

/** Quantas seções fechadas ficam guardadas (as mais antigas saem primeiro). */
const MAX_COLLAPSED = 300;

const DEFAULT_DIRECTION: Record<SortKey, Direction> = {
  data: 'desc',
  nota: 'desc',
  alfabetica: 'asc',
  status: 'desc',
  categoria: 'asc',
  tag: 'asc',
  prioridade: 'desc',
};

/** A ordem que o mural aberto tem de fato: cada mural só ordena pelo que ele tem. */
export function sortFor(sort: SortKey, profile: KindProfile): SortKey {
  if (isNotes(profile.kind)) return sort === 'nota' || sort === 'status' ? 'data' : sort;
  return sort === 'categoria' || sort === 'tag' || sort === 'prioridade' ? 'data' : sort;
}

function readNoteView(raw: unknown, base: NoteView): NoteView | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  return {
    sort: SORT_KEYS.includes(v['sort'] as SortKey) ? (v['sort'] as SortKey) : base.sort,
    direction: v['direction'] === 'asc' ? 'asc' : v['direction'] === 'desc' ? 'desc' : base.direction,
    density: DENSITIES.includes(v['density'] as Density) ? (v['density'] as Density) : base.density,
  };
}

/** Com `whole` falso (a visita), a aba, as seções fechadas e as finalizadas à mostra começam do zero. */
function readPrefs(key: string, whole: boolean): ViewPrefs {
  const fallback: ViewPrefs = { sort: 'data', scoreKey: 'final', direction: 'desc', density: 'completa', noteViews: { [ALL_TAB]: NOTE_VIEW }, showDone: false, pinnedFirst: false, noteTab: ALL_TAB, collapsed: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!raw) return fallback;
    const density: Density = REVIEW_DENSITIES.includes(raw.density) ? raw.density : 'completa';
    // antes das abas, a ordem do mural de anotações era uma só (noteSort, noteDirection), e o tipo de
    // ficha, o mesmo de todos os murais: viram a vista de Tudo
    const all: NoteView = {
      sort: SORT_KEYS.includes(raw.noteSort) ? raw.noteSort : NOTE_VIEW.sort,
      direction: raw.noteDirection === 'asc' ? 'asc' : 'desc',
      density,
    };
    const noteViews: Record<string, NoteView> = {};
    if (raw.noteViews && typeof raw.noteViews === 'object') {
      for (const [k, v] of Object.entries(raw.noteViews).slice(0, 200)) {
        const view = readNoteView(v, all);
        if (view) noteViews[k.slice(0, 80)] = view;
      }
    }
    noteViews[ALL_TAB] ??= all;
    return {
      sort: SORT_KEYS.includes(raw.sort) ? raw.sort : fallback.sort,
      scoreKey: raw.scoreKey === 'final' || (RATED_KEYS as readonly string[]).includes(raw.scoreKey)
        ? raw.scoreKey
        : fallback.scoreKey,
      direction: raw.direction === 'asc' ? 'asc' : 'desc',
      density,
      noteViews,
      showDone: whole && raw.showDone === true,
      pinnedFirst: raw.pinnedFirst === true,
      noteTab: whole && typeof raw.noteTab === 'string' ? raw.noteTab.slice(0, 80) : ALL_TAB,
      collapsed: whole && Array.isArray(raw.collapsed) ? raw.collapsed.filter((k: unknown) => typeof k === 'string').slice(-MAX_COLLAPSED) : [],
    };
  } catch {
    return fallback;
  }
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** A letra da seção na ordem alfabética: A a Z sem acento, e "#" para número, símbolo e outras escritas. */
function letterOf(name: string): string {
  const c = fold(name.trim()).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const avgFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Uma seção do mural: fichas vizinhas na ordem atual que dividem a mesma etiqueta. */
export interface WallGroup {
  key: string;
  label: string;
  summary: string;
  reviews: Review[];
}

/** Onde a vista de um mural fica guardada neste navegador. */
interface WallMemory {
  key: string;
  /** Tudo (o seu mural) ou só a ordem e o tipo de ficha (os murais dos outros, ver `VISIT_KEY`). */
  whole: boolean;
}

/**
 * A vista de um mural: busca, filtros, abas, ordem, tipo de ficha e seções fechadas, sobre as fichas
 * de `wall`. É a mesma para o seu mural (`WallView`) e para o de outra pessoa (`VisitView`): a régua,
 * as abas, as tags e a parede (WallToolbar, NoteTabsBar, TagShortcuts, WallBoard) leem a que a página
 * fornece, então quem visita vê e mexe no mural como o dono. Sem nada fornecido, é a do seu mural.
 */
@Injectable({ providedIn: 'root', useExisting: forwardRef(() => WallView) })
export abstract class WallState {
  protected readonly mural = inject(Mural);

  /** As fichas do mural: as originais e as rejogadas (e as anotações finalizadas). */
  abstract readonly wall: Signal<Review[]>;
  /**
   * Alguma nota em segredo (sem spoilers no seu mural; "Evitar spoilers de outros murais" no de
   * alguém): a nota não ordena, não filtra e não entra nas médias, que contariam o segredo.
   */
  abstract readonly guarding: Signal<boolean>;
  /** De quem é o mural: null, o seu; senão, o nome da pessoa (a régua e a parede falam dela). */
  abstract readonly owner: Signal<string | null>;
  /** O mural aberto no cartaz (jogos, livros… ou anotações): o do dono e o de quem visita são o mesmo. */
  readonly profile = computed(() => this.mural.profile());
  /** O mural de anotações: abas, tags e a lista; sem nota, veredito nem status. */
  readonly notes = computed(() => isNotes(this.mural.kind()));
  /** O "Mostrar notas" da régua: só no mural de alguém, enquanto houver nota em segredo (ver VisitView). */
  readonly canReveal: Signal<boolean> = signal(false);
  readonly revealed: Signal<boolean> = signal(false);
  toggleReveal(): void {}

  readonly query = signal('');
  /** Os filtros da cartela. Valem só nesta visita, como a busca. */
  readonly filter = signal<WallFilter>(NO_FILTER);
  /** A ordem escolhida nos murais de resenhas (o de anotações tem uma por aba, `noteViews`). */
  readonly sort: WritableSignal<SortKey>;
  /**
   * A vista de cada aba do mural de anotações: a ordem (a de sempre é Prioridade: fixadas, comuns,
   * sub-notas), a direção e o tipo de ficha. A chave é a da aba; "" é Tudo.
   */
  readonly noteViews: WritableSignal<Readonly<Record<string, NoteView>>>;
  /** A nota escolhida para ordenar. Guardada mesmo que o mural aberto não tenha ela (ver `activeScore`). */
  readonly scoreKey: WritableSignal<ScoreKey>;
  /** A nota que ordena de fato: a escolhida, se o mural aberto tem ela; senão, a Média. */
  readonly activeScore = computed<ScoreKey>(() => {
    const k = this.scoreKey();
    return scoreKeys(this.mural.kind()).includes(k) ? k : 'final';
  });
  /** A direção da ordem e o tipo de ficha nos murais de resenhas. */
  readonly reviewDirection: WritableSignal<Direction>;
  readonly reviewDensity: WritableSignal<Density>;
  /** "Mostrar finalizadas": as anotações com check continuam no mural. Fica guardado, como a ordem. */
  readonly showDone: WritableSignal<boolean>;
  /** As fixadas no topo também fora da Prioridade (ver `ViewPrefs.pinnedFirst`). Fica guardado. */
  readonly pinnedFirst: WritableSignal<boolean>;
  /**
   * As anotações que acabaram de ganhar o check: ficam no mural o tempo do carimbo e depois saem
   * (ver ReviewCard). Com "Mostrar finalizadas", ficam de vez.
   */
  readonly stamping = signal<ReadonlySet<string>>(new Set());

  /** A anotação entra no mural agora? A finalizada, só mostrando as finalizadas ou durante o carimbo. */
  private shows(r: Review): boolean {
    return !isDone(r) || this.showDone() || this.stamping().has(r.id);
  }
  /**
   * A aba escolhida no mural de anotações (ver core/note-tabs.ts). Fica guardada: o mural abre na
   * última aba usada. Vazia, "Tudo".
   */
  readonly noteTab: WritableSignal<string>;
  /** As abas do mural de anotações (null nos de resenhas; sem nenhuma aba, nada a separar). */
  readonly noteTabs = computed<NoteTabs | null>(() =>
    isNotes(this.mural.kind()) ? noteTabsOf(this.wall(), (r) => this.shows(r)) : null,
  );
  /** A aba que vale de fato: a escolhida, se ela ainda existe; senão, "Tudo". */
  readonly activeTab = computed<string>(() => {
    const tabs = this.noteTabs();
    const k = this.noteTab();
    return tabs && hasTab(tabs, k) ? k : ALL_TAB;
  });
  /** O nome da aba aberta (null em "Tudo"). */
  readonly activeTabLabel = computed<string | null>(() => {
    const tabs = this.noteTabs();
    const k = this.activeTab();
    if (!tabs || k === ALL_TAB) return null;
    return tabs.tabs.find((t) => t.key === k)?.label ?? null;
  });
  /** A vista da aba aberta: a dela, ou a de Tudo, se ela ainda não tem uma. */
  readonly noteView = computed<NoteView>(() => {
    const views = this.noteViews();
    return views[this.activeTab()] ?? views[ALL_TAB] ?? NOTE_VIEW;
  });
  /** A ordem escolhida para o mural aberto (no de anotações, a da aba). */
  private readonly chosenSort = computed(() => (isNotes(this.mural.kind()) ? this.noteView().sort : this.sort()));
  /** A direção da ordem do mural aberto. */
  readonly direction = computed<Direction>(() => (isNotes(this.mural.kind()) ? this.noteView().direction : this.reviewDirection()));
  /** O tipo de ficha do mural aberto (no de anotações, o da aba). Muda com `setDensity`. */
  readonly density = computed<Density>(() => (isNotes(this.mural.kind()) ? this.noteView().density : this.reviewDensity()));

  protected inTab(r: Review): boolean {
    const k = this.activeTab();
    return k === ALL_TAB || noteTabKey(r) === k;
  }
  /**
   * As seções fechadas (o maço preso com elástico), cada uma com a chave da seção (ver `groupWall`):
   * nas anotações, por aba ("aba::seção"), e a Fixadas fechada continua fechada em qualquer ordem;
   * nos outros murais, por mural ("k:jogos::2026-09"). Fica guardado, como a aba.
   */
  readonly collapsed: WritableSignal<ReadonlySet<string>>;

  /** De onde é a seção: a aba aberta nas anotações, o mural nos outros. */
  private collapseKey(groupKey: string): string {
    const kind = this.mural.kind();
    return `${isNotes(kind) ? this.activeTab() : `k:${kind}`}::${groupKey}`;
  }

  /** A seção está fechada? */
  isCollapsed(groupKey: string): boolean {
    return this.collapsed().has(this.collapseKey(groupKey));
  }

  /** Fecha ou abre uma seção do mural aberto (nas anotações, da aba aberta). */
  toggleCollapsed(groupKey: string): void {
    const k = this.collapseKey(groupKey);
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (!next.delete(k)) next.add(k);
      return next;
    });
  }

  /** O mural da aba aberta (nos de resenhas e em "Tudo", o mural inteiro), finalizadas também. */
  readonly tabbed = computed<Review[]>(() => (this.activeTab() === ALL_TAB ? this.wall() : this.wall().filter((r) => this.inTab(r))));
  /** O mural sem as finalizadas escondidas: é o "todo" do mural (da aba), para contar e para o vazio. */
  readonly pool = computed<Review[]>(() => this.tabbed().filter((r) => this.shows(r)));
  /** Quantas anotações finalizadas a aba tem (à mostra ou não). */
  readonly doneCount = computed(() => this.tabbed().filter(isDone).length);
  /** As finalizadas que estão fora do mural agora. */
  readonly hiddenDone = computed(() => this.tabbed().length - this.pool().length);

  /**
   * A ordem que vale de fato. Sem spoilers, ordenar por nota entregaria o ranking mesmo com as notas
   * escondidas: o mural fica por data, e a escolha guardada volta quando o modo desliga.
   */
  readonly shownSort = computed<SortKey>(() => {
    const sort = sortFor(this.chosenSort(), this.mural.profile());
    // numa aba de categoria, ordenar por categoria daria uma seção só: vale a Prioridade
    if (sort === 'categoria' && this.activeTab() !== ALL_TAB) return 'prioridade';
    return this.guarding() && sort === 'nota' ? 'data' : sort;
  });
  /** Os filtros que valem de fato: sem spoilers, filtrar por veredito, nota ou dificuldade entregaria o que está escondido. */
  private readonly activeFilter = computed<WallFilter>(() => {
    const f = this.filter();
    return this.guarding() ? withoutSpoilerFacets(f) : f;
  });

  /** As fichas que a busca encontra, antes dos filtros: é sobre elas que a cartela conta. */
  private readonly searched = computed<Review[]>(() => {
    const needle = fold(this.query().trim());
    // a parede inteira: as fichas e as rejogadas, cada uma no seu lugar (as anotações finalizadas, só à mostra)
    return this.pool().filter((r) => matchesQuery(r, needle));
  });

  /** Quantas anotações finalizadas, escondidas, a busca acharia (para o mural dizer que elas existem). */
  readonly doneMatches = computed(() => {
    const needle = fold(this.query().trim());
    if (!needle || this.showDone()) return 0;
    return this.tabbed().filter((r) => isDone(r) && !this.stamping().has(r.id) && matchesQuery(r, needle)).length;
  });

  /** Quantas anotações à mostra, nas outras abas, a busca acharia (para oferecer procurar em todas). */
  readonly elsewhere = computed(() => {
    const needle = fold(this.query().trim());
    if (!needle || this.activeTab() === ALL_TAB) return 0;
    return this.wall().filter((r) => !this.inTab(r) && this.shows(r) && matchesQuery(r, needle)).length;
  });

  /** Os grupos da cartela, com quantas fichas cada opção mostraria. */
  readonly facets = computed(() => {
    const all = facetsOf(this.searched(), this.activeFilter(), this.mural.profile());
    // numa aba de categoria, o grupo Categoria só teria ela mesma
    const inTab = this.activeTab() === ALL_TAB ? all : all.filter((f) => f.key !== 'category');
    return this.guarding() ? inTab.filter((f) => !SPOILER_FACETS.includes(f.key)) : inTab;
  });
  /** Os filtros ligados, como etiquetas. */
  readonly tags = computed(() => tagsOf(this.activeFilter(), this.mural.profile()));
  readonly filterCount = computed(() => filterSize(this.activeFilter()));

  readonly isFiltered = computed(() => this.query().trim() !== '' || this.filterCount() > 0);

  readonly visible = computed<Review[]>(() => {
    const f = this.activeFilter();
    const list = this.searched().filter((r) => matchesFilter(r, f));
    return list.sort(comparatorOf(this.order()));
  });

  /**
   * As tarefas (checklists) das fichas à mostra, somadas: quantas feitas e quantas para fazer. Segue a
   * busca, os filtros e o "Mostrar finalizadas", porque conta só o que está no mural agora.
   */
  readonly tasks = computed(() => {
    let done = 0;
    let total = 0;
    for (const r of this.visible()) {
      const c = checkCount(r.text);
      done += c.done;
      total += c.total;
    }
    return { done, todo: total - done, total };
  });

  private readonly order = computed<WallOrder>(() => ({
    sort: this.shownSort(),
    key: this.activeScore(),
    direction: this.direction(),
    profile: this.mural.profile(),
    pinnedFirst: this.pinnedFirst(),
  }));

  readonly groups = computed<WallGroup[]>(() => groupWall(this.visible(), this.order(), this.guarding()));

  /** As obras com rejogada: a original fica sabendo quantas vezes está no mural (id da original → vezes). */
  readonly times = computed(() => {
    const out = new Map<string, number>();
    for (const r of this.wall()) if (r.revisitOf) out.set(r.revisitOf, (out.get(r.revisitOf) ?? 1) + 1);
    return out;
  });

  constructor(memory: WallMemory) {
    const prefs = readPrefs(memory.key, memory.whole);
    this.sort = signal(prefs.sort);
    this.noteViews = signal(prefs.noteViews);
    this.scoreKey = signal(prefs.scoreKey);
    this.reviewDirection = signal(prefs.direction);
    this.reviewDensity = signal(prefs.density);
    this.showDone = signal(prefs.showDone);
    this.pinnedFirst = signal(prefs.pinnedFirst);
    this.noteTab = signal(prefs.noteTab);
    this.collapsed = signal(new Set(prefs.collapsed));
    // na visita, só a ordem e o tipo de ficha ficam guardados: a aba, as seções e as finalizadas são de cada mural
    effect(() => {
      const kept: Partial<ViewPrefs> = {
        sort: this.sort(),
        scoreKey: this.scoreKey(),
        direction: this.reviewDirection(),
        density: this.reviewDensity(),
        noteViews: this.noteViews(),
        pinnedFirst: this.pinnedFirst(),
        ...(memory.whole ? { showDone: this.showDone(), noteTab: this.noteTab(), collapsed: [...this.collapsed()].slice(-MAX_COLLAPSED) } : {}),
      };
      try {
        localStorage.setItem(memory.key, JSON.stringify(kept));
      } catch {
        /* preferências valem só nesta sessão */
      }
    });
  }

  /** A anotação acabou de ganhar o check: fica no mural enquanto o carimbo bate. */
  stamp(id: string): void {
    this.stamping.update((s) => new Set(s).add(id));
  }

  /** O carimbo terminou (ou o check saiu): a anotação segue a regra do mural de novo. */
  release(id: string): void {
    this.stamping.update((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  /**
   * Abre uma aba do mural de anotações. Os filtros da cartela eram da aba de antes (as tags dela) e
   * saem; a busca fica, e passa a procurar na aba nova.
   */
  setNoteTab(key: string): void {
    if (this.noteTab() === key && this.activeTab() === key) return;
    this.noteTab.set(key);
    this.filter.set(NO_FILTER);
  }

  /** Muda a vista da aba aberta do mural de anotações (só ela: as outras abas ficam como estão). */
  private patchNoteView(patch: Partial<NoteView>): void {
    const key = this.activeTab();
    const next = { ...this.noteView(), ...patch };
    this.noteViews.update((views) => ({ ...views, [key]: next }));
  }

  setSort(sort: SortKey): void {
    if (isNotes(this.mural.kind())) {
      if (this.noteView().sort === sort) return;
      this.patchNoteView({ sort, direction: DEFAULT_DIRECTION[sort] });
      return;
    }
    if (this.sort() === sort) return;
    this.sort.set(sort);
    this.reviewDirection.set(DEFAULT_DIRECTION[sort]);
  }

  toggleDirection(): void {
    const flip = (d: Direction): Direction => (d === 'desc' ? 'asc' : 'desc');
    if (isNotes(this.mural.kind())) this.patchNoteView({ direction: flip(this.noteView().direction) });
    else this.reviewDirection.update(flip);
  }

  /** O tipo de ficha do mural aberto (no de anotações, só o da aba aberta). */
  setDensity(density: Density): void {
    if (isNotes(this.mural.kind())) {
      if (this.noteView().density !== density) this.patchNoteView({ density });
    } else if (REVIEW_DENSITIES.includes(density)) {
      this.reviewDensity.set(density);
    }
  }

  toggle(key: FacetKey, value: string): void {
    this.filter.update((f) => toggleOption(f, key, value));
  }

  clearFacet(key: FacetKey): void {
    this.filter.update((f) => (f[key].length ? { ...f, [key]: [] } : f));
  }

  clearFilters(): void {
    this.query.set('');
    this.filter.set(NO_FILTER);
  }

  /** Volta ao começo: sem busca nem filtros, em "Tudo", com as seções abertas e as finalizadas fora. */
  protected reset(): void {
    this.clearFilters();
    this.noteTab.set(ALL_TAB);
    this.collapsed.set(new Set());
    this.showDone.set(false);
  }
}

/** A vista do seu mural: fica toda guardada, e as notas se escondem com "Sem spoilers" (Ajustes). */
@Injectable({ providedIn: 'root' })
export class WallView extends WallState {
  private readonly settings = inject(Settings);
  readonly wall = this.mural.wall;
  readonly guarding = computed(() => this.settings.noSpoilers());
  readonly owner = signal<string | null>(null).asReadonly();

  constructor() {
    super({ key: KEY, whole: true });
  }

  /**
   * Uma ficha nova que ficaria escondida: no mural de anotações, abre a aba dela (se a aba de agora
   * a esconde); se ainda assim ficaria fora, limpa a busca e os filtros.
   */
  reveal(r: Review): void {
    if (isNotes(this.mural.kind()) && !this.inTab(r)) this.setNoteTab(noteTabKey(r));
    if (!this.visible().some((x) => x.id === r.id)) this.clearFilters();
  }

  /** A categoria de uma anotação nova escrita agora: a da aba aberta (null em "Tudo" e em "Sem categoria"). */
  newNoteCategory(): string | null {
    return this.activeTab().startsWith('c:') ? this.activeTabLabel() : null;
  }

  /** Guarda a busca, o filtro e a ordem, e devolve como voltar a eles (ver ViewTransitions.run). */
  snapshot(): () => void {
    const query = this.query(),
      filter = this.filter(),
      sort = this.sort(),
      scoreKey = this.scoreKey(),
      direction = this.reviewDirection(),
      density = this.reviewDensity(),
      noteViews = this.noteViews(),
      noteTab = this.noteTab();
    return () => {
      this.query.set(query);
      this.filter.set(filter);
      this.sort.set(sort);
      this.scoreKey.set(scoreKey);
      this.reviewDirection.set(direction);
      this.reviewDensity.set(density);
      this.noteViews.set(noteViews);
      this.noteTab.set(noteTab);
    };
  }
}


/** O que a seta da ordem diz, no seu mural e no de um colega. */
export function directionLabelOf(sort: SortKey, direction: Direction, profile: KindProfile): string {
  const desc = direction === 'desc';
  switch (sort) {
    case 'data':
      return desc ? 'Mais recentes primeiro' : 'Mais antigas primeiro';
    case 'alfabetica':
      return desc ? 'De Z a A' : 'De A a Z';
    case 'categoria':
      return desc ? 'Categorias de Z a A' : 'Categorias de A a Z';
    case 'tag':
      return desc ? 'Tags de Z a A' : 'Tags de A a Z';
    case 'prioridade':
      return desc ? 'Fixadas, comuns e sub-notas; as mais recentes primeiro' : 'Fixadas, comuns e sub-notas; as mais antigas primeiro';
    case 'status':
      return `${desc ? profile.statusGroup.platinado : profile.statusGroup.incompleto} primeiro`;
    default:
      return desc ? 'Maiores notas primeiro' : 'Menores notas primeiro';
  }
}

/** Como o mural está ordenado: serve ao seu mural e ao mural de um colega. */
export interface WallOrder {
  sort: SortKey;
  /** A nota que ordena (só vale com `sort: 'nota'`). */
  key: ScoreKey;
  direction: Direction;
  profile: KindProfile;
  /** Nas anotações, as fixadas no topo também fora da Prioridade (na Prioridade, sempre). */
  pinnedFirst?: boolean;
}

/** As fixadas vêm na frente, numa seção só delas? Na Prioridade sempre; nas outras ordens, só se a pessoa quis. */
function pinsFirst(o: WallOrder): boolean {
  return isNotes(o.profile.kind) && (o.sort === 'prioridade' || !!o.pinnedFirst);
}

/** As fichas na ordem pedida. */
export function sortWall(list: readonly Review[], o: WallOrder): Review[] {
  return [...list].sort(comparatorOf(o));
}

/**
 * O mural agrupado pelo que ordena: mês, faixa de nota, letra ou status. A lista já vem ordenada,
 * então cada grupo é só uma sequência de fichas com a mesma chave.
 */
export function groupWall(sorted: readonly Review[], o: WallOrder, hideAverage = false): WallGroup[] {
  const sectionOf = groupKeyOf(o);
  // no mural de anotações, as fixadas são a primeira seção (fora da Prioridade, só se a pessoa quis)
  const keyOf: (r: Review) => [string, string] = pinsFirst(o)
    ? (r) => (isPinnedNote(r) ? PINNED_GROUP : sectionOf(r))
    : sectionOf;
  const groups: WallGroup[] = [];
  for (const r of sorted) {
    const [key, label] = keyOf(r);
    const last = groups.at(-1);
    if (last?.key === key) last.reviews.push(r);
    else groups.push({ key, label, summary: '', reviews: [r] });
  }
  // anotação não tem nota: a seção diz só quantas são
  const showAvg = o.sort !== 'nota' && !hideAverage && !isNotes(o.profile.kind);
  for (const g of groups) {
    const n = g.reviews.length;
    // "3 jogos · 1 rejogada": a rejogada não é mais um jogo no mural
    const again = g.reviews.filter((r) => r.revisitOf).length;
    const parts = [...(n > again ? [countOf(o.profile, n - again)] : []), ...(again ? [revisitCountOf(o.profile, again)] : [])];
    if (showAvg && n > 1) parts.push(`média ${avgFmt.format(g.reviews.reduce((s, r) => s + r.scores.final, 0) / n)}`);
    g.summary = parts.join(' · ');
  }
  return groups;
}

const PINNED_GROUP: [string, string] = ['fixadas', 'Fixadas'];
/** As seções da Prioridade: as fixadas, as comuns e as sub-notas. */
const RANK_GROUPS: [string, string][] = [PINNED_GROUP, ['comuns', 'Anotações'], ['sub-notas', 'Sub-notas']];

/** A categoria da anotação (a seção dela ordenando por categoria), ou nenhuma. */
function firstCategory(r: Review): string | null {
  return r.category ?? null;
}

/** A primeira tag da anotação (a seção dela ordenando por tag), ou nenhuma. */
function firstTag(r: Review): string | null {
  return r.tags?.[0] ?? null;
}

function groupKeyOf(o: WallOrder): (r: Review) => [string, string] {
  switch (o.sort) {
    case 'prioridade':
      return (r) => RANK_GROUPS[rankOrder(r)];
    case 'categoria':
      return (r) => {
        const c = firstCategory(r);
        return c === null ? ['sem-categoria', 'Sem categoria'] : [`c:${fold(c)}`, c];
      };
    case 'tag':
      return (r) => {
        const t = firstTag(r);
        return t === null ? ['sem-tag', 'Sem tag'] : [`t:${fold(t)}`, `#${t}`];
      };
    case 'alfabetica':
      return (r) => {
        const c = letterOf(r.game.name);
        return c === '#' ? ['num', '#'] : [c, c];
      };
    case 'status': {
      const groups = o.profile.statusGroup;
      return (r) => [r.status, groups[r.status]];
    }
    case 'nota': {
      const k = o.key;
      if (k === 'final') {
        return (r) => {
          const band = Math.min(9, Math.floor(shownFinal(r)));
          if (band < 5) return ['b-low', 'Abaixo de 5'];
          return [`b${band}`, band === 9 ? '9 ou mais' : `Na casa do ${band}`];
        };
      }
      const name = SCORE_LABEL[k];
      return (r) => {
        const v = scoreOf(r.scores, k);
        return v === null ? ['none', `Sem nota de ${name}`] : [`v${v}`, `${name} ${String(v).replace('.', ',')}`];
      };
    }
    default:
      return (r) => {
        if (r.completedAt === null) return ['sem-data', NO_DAY_LABEL];
        // só o ano: a seção é o ano, depois dos meses dele (é a data menos precisa, a mais antiga do ano);
        // mês sem dia fica na seção do mês, depois dos dias (pela mesma regra, ver comparatorOf)
        if (r.completedAt.length === 4) return [r.completedAt, r.completedAt];
        const month = r.completedAt.slice(0, 7);
        const label = monthFmt.format(parseDay(month + '-01'));
        return [month, label.charAt(0).toUpperCase() + label.slice(1)];
      };
  }
}

function comparatorOf(o: WallOrder): (a: Review, b: Review) => number {
  const inner = orderOf(o);
  if (!pinsFirst(o)) return inner;
  // as fixadas vêm primeiro; na Prioridade, as sub-notas vêm por último
  const rank = o.sort === 'prioridade' ? rankOrder : (r: Review) => (isPinnedNote(r) ? 0 : 1);
  return (a, b) => rank(a) - rank(b) || inner(a, b);
}

function orderOf(o: WallOrder): (a: Review, b: Review) => number {
  const sign = o.direction === 'desc' ? -1 : 1;
  // Data de conclusão primeiro; no mesmo dia, a ficha criada por último vem antes. Sem data conta
  // como a mais antiga, então fica no fim quando a data só desempata.
  const byDate = (a: Review, b: Review) =>
    (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || Date.parse(a.createdAt) - Date.parse(b.createdAt);
  switch (o.sort) {
    case 'prioridade':
      // dentro de cada lugar, pela data: as mais recentes primeiro
      return (a, b) => {
        if ((a.completedAt === null) !== (b.completedAt === null)) return a.completedAt === null ? 1 : -1;
        return sign * byDate(a, b);
      };
    case 'categoria':
      // pela primeira categoria (sem categoria sempre no fim), e dentro dela as mais recentes primeiro
      return (a, b) => {
        const ca = firstCategory(a);
        const cb = firstCategory(b);
        if ((ca === null) !== (cb === null)) return ca === null ? 1 : -1;
        return (ca !== null && cb !== null ? sign * collator.compare(ca, cb) : 0) || -byDate(a, b);
      };
    case 'tag':
      // pela primeira tag (sem tag sempre no fim), e dentro dela as mais recentes primeiro
      return (a, b) => {
        const ta = firstTag(a);
        const tb = firstTag(b);
        if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1;
        return (ta !== null && tb !== null ? sign * collator.compare(ta, tb) : 0) || -byDate(a, b);
      };
    case 'alfabetica':
      // a seção manda primeiro (o "#" antes do A), senão o Ø, o Ł ou um nome em japonês, que o
      // collator põe no meio do alfabeto, abririam outra seção "#" no meio das letras
      return (a, b) =>
        sign * (letterOf(a.game.name).localeCompare(letterOf(b.game.name)) || collator.compare(a.game.name, b.game.name)) ||
        -byDate(a, b);
    case 'status':
      return (a, b) => sign * (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || -byDate(a, b);
    case 'nota': {
      const key = o.key;
      return (a, b) => {
        const av = scoreOf(a.scores, key);
        const bv = scoreOf(b.scores, key);
        // Sem nota vai sempre para o fim, em qualquer direção.
        if (av === null && bv === null) return -byDate(a, b);
        if (av === null) return 1;
        if (bv === null) return -1;
        return sign * (av - bv) || -(shownFinal(a) - shownFinal(b)) || -byDate(a, b);
      };
    }
    default:
      // 'AAAA' < 'AAAA-MM' < 'AAAA-MM-DD' na comparação de texto: o ano sozinho conta como mais antigo
      // que os meses dele, e o mês sem dia como mais antigo que os dias dele
      return (a, b) => {
        // Sem data vai sempre para o fim, em qualquer direção.
        if ((a.completedAt === null) !== (b.completedAt === null)) return a.completedAt === null ? 1 : -1;
        return sign * byDate(a, b);
      };
  }
}
