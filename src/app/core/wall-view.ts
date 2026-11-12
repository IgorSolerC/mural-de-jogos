import { type CategoryLooks, lookKey } from './category-looks';
import { NoteFolders } from './note-folders';
import { FolderTree, NoteFolder, folderNameOf } from './folders';
import { Injectable, Signal, WritableSignal, computed, effect, forwardRef, inject, signal, untracked } from '@angular/core';
import { KANBAN_LAST_KEY, boardIdFor } from './kanban';
import { KanbanStore } from './kanban-store';
import { SharedStore } from './shared-store';
import { Kind, KindProfile, countOf, hasTabs, isMusic, isNotes, revisitCountOf } from './kinds';
import { Mural } from './mural';
import { Settings } from './settings';
import { AutoTab, GROUP_VIEWS, WallShow, activeOrder, groupShows, groupSorts, groupViews, hiddenKeys, noteDensity } from './mural-config';
import type { CategoryColorId } from './category-looks';
import {
  NO_DAY_LABEL,
  RATED_KEYS,
  Review,
  SCORE_LABEL,
  STATUS_RANK,
  STOCKS,
  STOCK_LABEL,
  ScoreKey,
  Stock,
  fold,
  isDone,
  isPinnedNote,
  letterOf,
  musicFormOf,
  rankOrder,
  parseDay,
  scoreKeys,
  scoreOf,
  shownFinal,
} from './review';
import { ALL_TAB, NO_CATEGORY_TAB, NoteTab, NoteTabs, PINNED_TAB, SHARED_TAB, NO_TABS, firstStanding, hasTab, isGroupTab, noteTabKey, noteTabsOf, sameTabs, tabsToMore } from './note-tabs';
import { NO_TAG_OUTS, TagOuts, excludeTag, hiddenByTags, outByDefault, releaseTag, showAllTags, tagIsOut } from './tag-filter';
import { FacetKey, GRADE_LABEL, NO_FILTER, WallFilter, facetsOf, filterFor, filterSize, gradeBandOf, matchesFilter, matchesQuery, tagsOf, toggleOption } from './wall-filter';
import { ONE_DECIMAL as avgFmt } from './review';
import { cap, labelKey, nameCollator, plural } from './text';
import { longMonthFmt } from './dates';
import { tasksOf } from './rich-text';
import { pinningFor } from './wall-physics';
import { writeJson, writeText } from './storage';

/**
 * `categoria` no mural de anotações e no de músicas (onde ela é o artista); `tag` (a anotação aparece
 * na seção de cada tag que tem), `prioridade` (fixadas, depois as comuns), `criacao`, `alteracao`,
 * `finalizacao`, `tarefas` (as por fazer), `cor` (da cartolina) e `quem` (privada ou pública) só no de
 * anotações; `nota` e `status`, só nos de resenhas.
 */
export type SortKey =
  | 'data'
  | 'nota'
  | 'alfabetica'
  | 'status'
  | 'categoria'
  | 'assunto'
  | 'tag'
  | 'prioridade'
  | 'criacao'
  | 'alteracao'
  | 'finalizacao'
  | 'tarefas'
  | 'cor'
  | 'quem'
  | 'dono';
const SORT_KEYS: readonly SortKey[] = ['data', 'nota', 'alfabetica', 'status', 'categoria', 'assunto', 'tag', 'prioridade', 'criacao', 'alteracao', 'finalizacao', 'tarefas', 'cor', 'quem', 'dono'];
/** As ordens que só o mural de anotações tem (os de resenhas ordenam por data no lugar delas). */
const NOTE_ONLY_SORTS: readonly SortKey[] = ['assunto', 'tag', 'prioridade', 'criacao', 'alteracao', 'finalizacao', 'tarefas', 'cor', 'quem', 'dono'];
export type Direction = 'desc' | 'asc';
/**
 * Comum (a ficha de sempre; o id guardado continua `completa`), inteira (a comum com o texto todo, as fichas encaixadas em colagem), simples
 * (a tira com a nota; no mural de anotações, a Visão geral: fichas pequenas só com o título, as tags e
 * a orelha), capas (só a foto e o nome, para ver o máximo de fichas; só nos murais de resenhas) ou
 * lista (só no mural de anotações: o índice em colunas, ver NoteIndex).
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

/** Os tipos de ficha dos murais de resenhas (a lista é só das anotações). */
const REVIEW_DENSITIES: readonly Density[] = ['completa', 'inteira', 'simples', 'capas'];
/** Os do mural de anotações: sem a Capa e nome (ver `GROUP_VIEWS`). */
const NOTE_DENSITIES: readonly Density[] = GROUP_VIEWS;

/** Como uma aba do mural de anotações está: a ordem, a direção e o tipo de ficha dela. */
export interface NoteView {
  sort: SortKey;
  direction: Direction;
  density: Density;
}

/** O "Mostrar também" do Filtrar: as finalizadas, as só no Kanban e as só nos Flashcards à mostra. */
interface ShowToggles {
  done: boolean;
  kanban: boolean;
  study: boolean;
}
const NO_TOGGLES: ShowToggles = { done: false, kanban: false, study: false };
const NO_IDS: ReadonlySet<string> = new Set();

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
  /**
   * No mural de anotações, as fixadas ficam no topo também nas outras ordens (Data, Título, Categoria,
   * Tag). Sem isso, só a Prioridade separa as fixadas; as outras ordens as tratam como as outras.
   */
  pinnedFirst: boolean;
  /** A aba aberta no mural de anotações (ver core/note-tabs.ts); vazia, "Tudo". */
  noteTab: string;
  /** A aba (o artista) aberta no mural de músicas; vazia, "Tudo". */
  musicTab: string;
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
  assunto: 'asc',
  tag: 'asc',
  prioridade: 'desc',
  criacao: 'desc',
  alteracao: 'desc',
  finalizacao: 'desc',
  tarefas: 'desc',
  cor: 'asc',
  quem: 'asc',
  dono: 'asc',
};

/** A ordem que o mural aberto tem de fato: cada mural só ordena pelo que ele tem. */
export function sortFor(sort: SortKey, profile: KindProfile): SortKey {
  if (isNotes(profile.kind)) return sort === 'nota' || sort === 'status' ? 'data' : sort;
  // as músicas também se ordenam pelo artista (a categoria delas)
  if (sort === 'categoria' && isMusic(profile.kind)) return sort;
  return sort === 'categoria' || NOTE_ONLY_SORTS.includes(sort) ? 'data' : sort;
}

function readNoteView(raw: unknown, base: NoteView): NoteView | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  return {
    sort: SORT_KEYS.includes(v['sort'] as SortKey) ? (v['sort'] as SortKey) : base.sort,
    direction: v['direction'] === 'asc' ? 'asc' : v['direction'] === 'desc' ? 'desc' : base.direction,
    density: NOTE_DENSITIES.includes(noteDensity(v['density']) as Density) ? (noteDensity(v['density']) as Density) : base.density,
  };
}

/** Com `whole` falso (a visita), a aba e as seções fechadas começam do zero. */
function readPrefs(key: string, whole: boolean): ViewPrefs {
  const fallback: ViewPrefs = { sort: 'data', scoreKey: 'final', direction: 'desc', density: 'completa', noteViews: { [ALL_TAB]: NOTE_VIEW }, pinnedFirst: false, noteTab: ALL_TAB, musicTab: ALL_TAB, collapsed: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!raw) return fallback;
    const density: Density = REVIEW_DENSITIES.includes(raw.density) ? raw.density : 'completa';
    // antes das abas, a ordem do mural de anotações era uma só (noteSort, noteDirection), e o tipo de
    // ficha, o mesmo de todos os murais: viram a vista de Tudo
    const all: NoteView = {
      sort: SORT_KEYS.includes(raw.noteSort) ? raw.noteSort : NOTE_VIEW.sort,
      direction: raw.noteDirection === 'asc' ? 'asc' : 'desc',
      density: noteDensity(density),
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
      pinnedFirst: raw.pinnedFirst === true,
      noteTab: whole && typeof raw.noteTab === 'string' ? raw.noteTab.slice(0, 80) : ALL_TAB,
      musicTab: whole && typeof raw.musicTab === 'string' ? raw.musicTab.slice(0, 80) : ALL_TAB,
      collapsed: whole && Array.isArray(raw.collapsed) ? raw.collapsed.filter((k: unknown) => typeof k === 'string').slice(-MAX_COLLAPSED) : [],
    };
  } catch {
    return fallback;
  }
}


/** A letra da seção na ordem alfabética: A a Z sem acento, e "#" para número, símbolo e outras escritas. */

/** Uma seção do mural: fichas vizinhas na ordem atual que dividem a mesma etiqueta. */
export interface WallGroup {
  key: string;
  label: string;
  /** O resumo inteiro da seção: "3 jogos · média 9,1" (o nome acessível e a dica da cabeça). */
  summary: string;
  /**
   * O que a cabeça mostra depois do número (que já diz quantas são): "média 9,1", "1 rejogada", "2 álbuns ·
   * 1 música". Vazio quando o resumo é só a contagem (como nas anotações).
   */
  detail: string;
  reviews: Review[];
  /**
   * As fichas desta seção que já apareceram numa seção de antes (ordenando por tag, a anotação com duas
   * tags fica nas duas): a parede monta para elas uma cópia à parte (ver WallCardPool). Sem o campo, nenhuma.
   */
  copies?: ReadonlySet<string>;
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
 * as abas, as tags e a parede (WallToolbar, NoteTabsBar, NoteFilters, WallBoard) leem a que a página
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
  /** O ícone e a cor das categorias das anotações do dono do mural (ver core/category-looks.ts). */
  abstract readonly categoryLooks: Signal<CategoryLooks>;
  /** As pastas das anotações do dono do mural (as suas, ou as públicas de quem você visita; core/folders.ts). */
  abstract readonly folders: Signal<FolderTree>;
  /**
   * A ordem das categorias montada à mão pelo dono (a engrenagem do mural, ver core/mural-config.ts),
   * pela chave; null, da maior para a menor. Só o seu mural tem: a de quem visita não vem junto.
   */
  readonly categoryOrder: Signal<readonly string[] | null> = signal(null);
  /**
   * As abas das categorias escondidas ("c:" e a chave), que ficam sempre no "Mais" (ver
   * core/mural-config.ts). Só no seu mural: quem visita vê todas as abas em pé, como sempre.
   */
  readonly hiddenTabs: Signal<ReadonlySet<string>> = signal(new Set<string>());
  /**
   * "Esconder os grupos vazios" (ver `NotesConfig.hideEmpty`). Só o seu mural de anotações: no de quem
   * visita e no de músicas, toda aba fica em pé como sempre.
   */
  readonly hideEmpty: Signal<boolean> = signal(false);
  /**
   * As abas dos grupos sem nenhuma anotação à mostra no mural (o número da aba é 0: todas só no Kanban,
   * finalizadas e escondidas…), com "Esconder os grupos vazios" ligado; senão, nenhuma.
   */
  readonly emptyTabs = computed<ReadonlySet<string>>(
    () => {
      const tabs = this.notes() && this.hideEmpty() ? this.noteTabs()?.tabs : null;
      return tabs ? new Set(tabs.filter((t) => t.n === 0).map((t) => t.key)) : NO_TABS;
    },
    // mexer numa anotação refaz as abas: com os mesmos vazios, nada muda adiante
    { equal: sameTabs },
  );
  /**
   * As abas que vão para o "Mais" mesmo com lugar em pé: as escondidas à mão e as vazias, menos a
   * aberta (ver `tabsToMore`).
   */
  readonly tabsInMore = computed<ReadonlySet<string>>(() => (this.notes() ? tabsToMore(this.hiddenTabs(), this.emptyTabs(), this.activeTab()) : NO_TABS), {
    equal: sameTabs,
  });
  /**
   * A aba "Tudo" fica em pé (ver `NotesConfig.showAll`). Só o seu mural de anotações pode tirá-la: o
   * de músicas e o de quem visita têm sempre o Tudo.
   */
  readonly showAllTab: Signal<boolean> = signal(true);
  /**
   * As abas Fixadas e Compartilhadas existem quando há o que mostrar nelas (ver `specialTabs`). Só o seu
   * mural de anotações tem: no de quem visita, as fixadas e as compartilhadas são do dono dele.
   */
  readonly specialsOn: Signal<boolean> = signal(false);
  /** O olho delas nas configurações: em pé ao lado dos grupos; desligado (o padrão), só no "Mais". */
  readonly pinnedStands: Signal<boolean> = signal(false);
  readonly sharedStands: Signal<boolean> = signal(false);
  /** A cor da etiqueta das abas que o mural gera (Tudo, Fixadas, Compartilhadas), pelas configurações. */
  readonly autoColors: Signal<Partial<Record<AutoTab, CategoryColorId>>> = signal({});
  /**
   * As anotações que outras pessoas compartilharam com você, e de quem cada uma é (id → o nome do
   * dono). Só o seu mural; no de quem visita, o dono vem na própria anotação (`sharedBy`).
   */
  readonly sharedWithMe: Signal<ReadonlyMap<string, string>> = signal(new Map<string, string>());
  /**
   * A visualização com que cada grupo abre, escolhida nas configurações do mural (pela chave da aba,
   * ver core/mural-config.ts). O grupo que tem uma esquece a última escolhida na régua. Só o seu
   * mural de anotações: o de quem visita abre como a pessoa que visita deixou.
   */
  readonly groupViews: Signal<ReadonlyMap<string, Density>> = signal(new Map<string, Density>());
  /**
   * A visualização trocada na régua num grupo que tem a dele: vale enquanto o grupo fica aberto, e
   * não é guardada (ao voltar para ele, o grupo abre na dele de novo).
   */
  protected readonly passingDensity = signal<{ tab: string; density: Density } | null>(null);
  /**
   * A ordem com que cada grupo abre, escolhida nas configurações do mural (pela chave da aba). Como a
   * visualização: o grupo que tem uma esquece a última escolhida na régua. Só o seu mural de anotações.
   */
  readonly groupSorts: Signal<ReadonlyMap<string, SortKey>> = signal(new Map<string, SortKey>());
  /** A ordem (e a direção) trocada na régua num grupo que tem a dele: vale enquanto ele fica aberto. */
  protected readonly passingSort = signal<{ tab: string; sort: SortKey; direction: Direction } | null>(null);
  /**
   * Sem a aba Tudo, a busca pediu para procurar em todos os grupos: o Tudo aparece até a pessoa
   * escolher um grupo. Só nesta visita.
   */
  protected readonly allAsked = signal(false);
  /**
   * As tags que nascem escondidas no filtro (as chaves de `tagLookKey(tag, categoria)`, ver
   * core/tag-filter.ts): só no seu mural, pelas configurações; no de um colega, nenhuma.
   */
  readonly defaultTagOuts: Signal<ReadonlySet<string>> = signal(new Set<string>());
  /**
   * As anotações que estão só no Kanban (pelo id, ver `KanbanStore.boardOnly`): ficam fora do mural,
   * como as finalizadas, até a pessoa pedir para ver (`showBoard`). Só no seu mural: o quadro é seu, e
   * o mural de quem visita não sabe dele.
   */
  readonly boardOnly: Signal<ReadonlySet<string>> = signal(new Set<string>());
  /** Das de cima, as fora do mural só por causa dos Estudos (ver `KanbanStore.studyOnly`). */
  readonly studyOnly: Signal<ReadonlySet<string>> = signal(new Set<string>());
  /** Das de cima, as que são flashcards (só nos Flashcards, ou nos Flashcards e no Kanban; ver `KanbanStore.deckOff`). */
  readonly deckOff: Signal<ReadonlySet<string>> = signal(new Set<string>());
  /**
   * O que cada grupo mostra também ao abrir (pela chave da aba, ver `CategoryPrefs.shows`): só no seu mural,
   * pelas configurações; no de quem visita, nada (as abas abrem só com o que está no mural).
   */
  readonly groupShows: Signal<ReadonlyMap<string, ReadonlySet<WallShow>>> = signal(new Map<string, ReadonlySet<WallShow>>());
  /**
   * "Só no Kanban", no Filtrar: as que estão num quadro e fora do mural aparecem nele. Não fica guardado: a aba
   * abre no padrão dela (ver `applyTabShows`), como as outras duas.
   */
  readonly showBoard = signal(false);
  /** "Só nos Flashcards", no Filtrar: os flashcards que estão fora do mural aparecem nele (ver `showBoard`). */
  readonly showStudy = signal(false);
  /** O mural aberto no cartaz (jogos, livros… ou anotações): o do dono e o de quem visita são o mesmo. */
  readonly profile = computed(() => this.mural.profile());
  /** O mural de anotações: abas, tags e a lista; sem nota, veredito nem status. */
  readonly notes = computed(() => isNotes(this.mural.kind()));
  /** O mural de músicas: de resenhas, com as abas dos artistas em cima da pasta. */
  readonly music = computed(() => isMusic(this.mural.kind()));
  /** O "Mostrar notas" da régua: só no mural de alguém, enquanto houver nota em segredo (ver VisitView). */
  readonly canReveal: Signal<boolean> = signal(false);
  readonly revealed: Signal<boolean> = signal(false);
  toggleReveal(): void {}

  readonly query = signal('');
  /** Os filtros da cartela. Valem só nesta visita, como a busca. */
  readonly filter = signal<WallFilter>(NO_FILTER);
  /**
   * As tags escondidas nesta visita (o clique direito no filtro) e as escondidas pelo padrão que a
   * pessoa mostrou de novo. A anotação com uma tag escondida sai do mural (ver core/tag-filter.ts).
   */
  readonly tagOuts = signal<TagOuts>(NO_TAG_OUTS);
  /** A ordem escolhida nos murais de resenhas (o de anotações tem uma por aba, `noteViews`). */
  readonly sort: WritableSignal<SortKey>;
  /**
   * A vista de cada aba do mural de anotações: a ordem (a de sempre é Prioridade: fixadas, depois
   * as comuns), a direção e o tipo de ficha. A chave é a da aba; "" é Tudo.
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
  /** "Finalizadas", no Filtrar: as anotações com check continuam no mural (ver `showBoard`). */
  readonly showDone = signal(false);
  /** As fixadas no topo também fora da Prioridade (ver `ViewPrefs.pinnedFirst`). Fica guardado. */
  readonly pinnedFirst: WritableSignal<boolean>;
  /**
   * As anotações que acabaram de ganhar o check: ficam no mural o tempo do carimbo e depois saem
   * (ver ReviewCard). Com "Mostrar finalizadas", ficam de vez.
   */
  readonly stamping = signal<ReadonlySet<string>>(new Set());

  /** O "Mostrar também" de agora, na aba aberta. */
  private readonly toggles = computed<ShowToggles>(() => ({ done: this.showDone(), kanban: this.showBoard(), study: this.showStudy() }));

  /** O "Mostrar também" com que a aba abre: o do grupo (ver `CategoryPrefs.shows`); nas outras, nada ligado. */
  protected tabShows(key: string): ShowToggles {
    const on = this.notes() ? this.groupShows().get(key) : undefined;
    return on ? { done: on.has('finalizadas'), kanban: on.has('kanban'), study: on.has('flashcards') } : NO_TOGGLES;
  }

  /** O "Mostrar também" de uma aba: o de agora, se é a escolhida; senão, o padrão dela. */
  private togglesOf(key: string): ShowToggles {
    return key === this.noteTab() ? this.toggles() : this.tabShows(key);
  }

  /**
   * Abre a aba no padrão dela (ver `tabShows`): ao trocar de aba e ao voltar ao mural de outra página. Ao voltar
   * para a aba de antes, ela também abre no padrão dela, e não como foi deixada.
   */
  protected applyTabShows(): void {
    const active = this.activeTab();
    // sem a aba Tudo em pé, o mural abre no primeiro grupo sem ele ter sido escolhido: ele passa a ser o
    // escolhido, para o número da aba e o padrão das configurações valerem nele (ver `togglesOf`)
    if (this.notes() && this.noteTab() !== active) this.noteTab.set(active);
    const t = this.tabShows(active);
    this.showDone.set(t.done);
    this.showBoard.set(t.kanban);
    this.showStudy.set(t.study);
  }

  /**
   * A anotação entra no mural agora (com `t`, o "Mostrar também" de outra aba)? A finalizada, só mostrando as
   * finalizadas ou durante o carimbo; a que está fora do mural, só mostrando as do lugar dela (no Kanban, nos
   * Flashcards; a que está nos dois, com qualquer um).
   */
  private shows(r: Review, t: ShowToggles = this.toggles()): boolean {
    return this.showsDone(r, t) && this.showsBoard(r, t);
  }
  private showsDone(r: Review, t: ShowToggles = this.toggles()): boolean {
    return !isDone(r) || t.done || this.stamping().has(r.id);
  }
  private showsBoard(r: Review, t: ShowToggles = this.toggles()): boolean {
    if (!this.boardOnly().has(r.id)) return true;
    return (t.kanban && !this.studyOnly().has(r.id)) || (t.study && this.deckOff().has(r.id));
  }
  /** Está fora do mural por estar num quadro (só no Kanban, ou no Kanban e nos Flashcards). */
  private inKanbanOff(r: Review): boolean {
    return this.boardOnly().has(r.id) && !this.studyOnly().has(r.id);
  }
  /**
   * A aba escolhida no mural de anotações (ver core/note-tabs.ts). Fica guardada: o mural abre na
   * última aba usada. Vazia, "Tudo".
   */
  readonly noteTab: WritableSignal<string>;
  /** A aba (o artista) escolhida no mural de músicas, guardada do mesmo jeito. */
  readonly musicTab: WritableSignal<string>;
  /** A aba escolhida no mural aberto: cada mural com abas guarda a dele. */
  private tabOf(kind: Kind): WritableSignal<string> {
    return isMusic(kind) ? this.musicTab : this.noteTab;
  }
  /**
   * As abas do mural: uma por categoria nas anotações, uma por artista nas músicas (null nos outros;
   * sem nenhuma aba, nada a separar).
   */
  readonly noteTabs = computed<NoteTabs | null>(() => {
    const kind = this.mural.kind();
    if (isNotes(kind)) {
      // cada aba conta o que mostraria ao abrir (o padrão dela), e a escolhida, com o Filtrar de agora. A
      // escolhida, e não `activeTab`, que depende destas abas
      const tabs = noteTabsOf(this.wall(), (r) => this.shows(r, this.togglesOf(noteTabKey(r))), undefined, this.categoryOrder());
      return { ...tabs, all: this.wall().filter((r) => this.shows(r, this.togglesOf(ALL_TAB))).length };
    }
    return isMusic(kind) ? noteTabsOf(this.wall(), undefined, 'Sem artista') : null;
  });
  /**
   * A aba que vale de fato: a escolhida, se ela ainda existe; senão, "Tudo". Sem a aba Tudo (e sem a
   * busca ter pedido por ela), o primeiro grupo em pé: o mural abre sempre num grupo.
   */
  readonly activeTab = computed<string>(() => {
    const tabs = this.noteTabs();
    const k = this.tabOf(this.mural.kind())();
    // as abas especiais valem mesmo sem grupos para separar (todas as anotações num grupo só, ou sem grupo)
    if (this.specialTabs().some((t) => t.key === k)) return k;
    if (!tabs || !tabs.tabs.length) return ALL_TAB;
    if (k !== ALL_TAB && hasTab(tabs, k)) return k;
    if (this.showAllTab() || this.allAsked()) return ALL_TAB;
    const hidden = this.notes() ? this.hiddenTabs() : NO_TABS;
    // o primeiro grupo em pé: nem escondido, nem vazio (com "Esconder os grupos vazios")
    return firstStanding(tabs.tabs, (t) => t.key, hidden, this.emptyTabs())!.key;
  });
  /**
   * As abas especiais do mural de anotações: Fixadas (as fixadas de todos os grupos, enquanto há
   * alguma) e Compartilhadas (as que outras pessoas compartilharam com você, enquanto há alguma). Em pé
   * depois do Tudo, ou no "Mais" (ver `standingSpecials`).
   */
  readonly specialTabs = computed<NoteTab[]>(() => {
    if (!this.notes() || !this.specialsOn()) return [];
    const out: NoteTab[] = [];
    const wall = this.wall();
    {
      // como os grupos, ela fica enquanto tem alguma, mesmo com todas finalizadas e escondidas
      const list = wall.filter(isPinnedNote);
      if (list.length) out.push({ key: PINNED_TAB, label: 'Fixadas', n: list.filter((r) => this.shows(r, this.togglesOf(PINNED_TAB))).length, total: list.length });
    }
    const shared = this.sharedWithMe();
    if (shared.size) {
      const list = wall.filter((r) => shared.has(r.id));
      if (list.length) out.push({ key: SHARED_TAB, label: 'Compartilhadas', n: list.filter((r) => this.shows(r, this.togglesOf(SHARED_TAB))).length, total: list.length });
    }
    return out;
  });
  /** As abas especiais em pé ao lado dos grupos (o olho ligado); as outras ficam no "Mais". */
  readonly standingSpecials = computed<NoteTab[]>(() =>
    this.specialTabs().filter((t) => (t.key === PINNED_TAB ? this.pinnedStands() : this.sharedStands())),
  );
  /**
   * A aba Tudo em pé: o olho ligado nas configurações, ou quando não há grupos para separar mas há abas
   * especiais (ela é o caminho de volta para o resto). Sem ela em pé, o Tudo fica no "Mais".
   */
  readonly allTabShown = computed(() => this.showAllTab() || (!this.noteTabs()?.tabs.length && this.specialTabs().length > 0));
  /** O nome da aba aberta (null em "Tudo"). */
  readonly activeTabLabel = computed<string | null>(() => {
    const tabs = this.noteTabs();
    const k = this.activeTab();
    if (!tabs || k === ALL_TAB) return null;
    return (tabs.tabs.find((t) => t.key === k) ?? this.specialTabs().find((t) => t.key === k))?.label ?? null;
  });
  /**
   * A vista da aba aberta: a dela, ou a de Tudo, se ela ainda não tem uma (a das Fixadas começa
   * ordenada pelo grupo, que separa; a das Compartilhadas, pelo dono).
   */
  readonly noteView = computed<NoteView>(() => {
    const views = this.noteViews();
    const tab = this.activeTab();
    const base = views[ALL_TAB] ?? NOTE_VIEW;
    const first: SortKey | null = tab === PINNED_TAB ? 'categoria' : tab === SHARED_TAB ? 'dono' : null;
    return views[tab] ?? (first ? { ...base, sort: first, direction: DEFAULT_DIRECTION[first] } : base);
  });
  /** A ordem escolhida nas configurações para o grupo aberto; null, ele abre na última usada. */
  readonly groupSort = computed<SortKey | null>(() => (this.notes() ? (this.groupSorts().get(this.activeTab()) ?? null) : null));
  /** A ordem do grupo com a dele: ela (na direção de sempre), ou a trocada na régua enquanto ele está aberto. */
  private readonly groupOrder = computed<{ sort: SortKey; direction: Direction } | null>(() => {
    const fixed = this.groupSort();
    if (!fixed) return null;
    const passing = this.passingSort();
    return passing && passing.tab === this.activeTab() ? passing : { sort: fixed, direction: DEFAULT_DIRECTION[fixed] };
  });
  /** A ordem escolhida para o mural aberto (no de anotações, a da aba, ou a do grupo). */
  private readonly chosenSort = computed(() => (isNotes(this.mural.kind()) ? (this.groupOrder()?.sort ?? this.noteView().sort) : this.sort()));
  /** A direção da ordem do mural aberto. */
  readonly direction = computed<Direction>(() =>
    isNotes(this.mural.kind()) ? (this.groupOrder()?.direction ?? this.noteView().direction) : this.reviewDirection(),
  );
  /** A visualização escolhida nas configurações para o grupo aberto; null, ele abre na última usada. */
  readonly groupDensity = computed<Density | null>(() => (this.notes() ? (this.groupViews().get(this.activeTab()) ?? null) : null));
  /**
   * O tipo de ficha do mural aberto (no de anotações, o da aba; num grupo com a visualização dele,
   * ela, ou a trocada na régua enquanto ele está aberto). Muda com `setDensity`.
   */
  readonly density = computed<Density>(() => {
    if (!isNotes(this.mural.kind())) return this.reviewDensity();
    const fixed = this.groupDensity();
    if (!fixed) return this.noteView().density;
    const passing = this.passingDensity();
    return passing && passing.tab === this.activeTab() ? passing.density : fixed;
  });

  protected inTab(r: Review): boolean {
    const k = this.activeTab();
    if (k === PINNED_TAB) return isPinnedNote(r);
    if (k === SHARED_TAB) return this.sharedWithMe().has(r.id);
    return k === ALL_TAB || noteTabKey(r) === k;
  }
  /**
   * As seções fechadas (a pilha, PLANO-ETIQUETAS.md), cada uma com a chave da seção (ver `groupWall`):
   * nas anotações, por aba ("aba::seção"), e a Fixadas fechada continua fechada em qualquer ordem;
   * nos outros murais, por mural ("k:jogos::2026-09"; nas músicas, por mural e por aba). Fica
   * guardado, como a aba.
   */
  readonly collapsed: WritableSignal<ReadonlySet<string>>;

  /** De onde é a seção: a aba aberta nas anotações, o mural nos outros (e a aba dele, nas músicas). */
  private collapseKey(groupKey: string): string {
    const kind = this.mural.kind();
    const from = isNotes(kind) ? this.activeTab() : isMusic(kind) ? `k:${kind}:${this.activeTab()}` : `k:${kind}`;
    return `${from}::${groupKey}`;
  }

  /** A seção está fechada? */
  isCollapsed(groupKey: string): boolean {
    return this.collapsed().has(this.collapseKey(groupKey));
  }

  /** Fecha ou abre uma seção do mural aberto (nas anotações, da aba aberta). */
  toggleCollapsed(groupKey: string): void {
    this.setCollapsed([groupKey], !this.isCollapsed(groupKey));
  }

  /**
   * Fecha (ou abre) de uma vez as seções do mural aberto (o menu da cabeça: fechar as outras, abrir ou fechar
   * todas). A que fecha agora vai para o fim da fila: passando de `MAX_COLLAPSED`, saem as fechadas há mais tempo.
   */
  setCollapsed(groupKeys: readonly string[], closed: boolean): void {
    const ks = groupKeys.map((g) => this.collapseKey(g));
    const set = this.collapsed();
    if (ks.every((k) => set.has(k) === closed)) return;
    const next = new Set(set);
    for (const k of ks) {
      next.delete(k);
      if (closed) next.add(k);
    }
    // (as desta vez ficam: saem primeiro as de antes; só um lote maior que o teto perde o começo dele)
    const now = new Set(ks);
    for (const k of next) {
      if (next.size <= MAX_COLLAPSED) break;
      if (!now.has(k)) next.delete(k);
    }
    for (const k of next) {
      if (next.size <= MAX_COLLAPSED) break;
      next.delete(k);
    }
    this.collapsed.set(next);
  }

  /** O mural da aba aberta (nos de resenhas e em "Tudo", o mural inteiro), finalizadas também. */
  readonly tabNotes = computed<Review[]>(() => (this.activeTab() === ALL_TAB ? this.wall() : this.wall().filter((r) => this.inTab(r))));

  // ===== As pastas (PLANO-PASTAS.md) =====

  /** A pasta aberta em cada aba de grupo (a chave da aba → o id), só enquanto a página está aberta. */
  private readonly openFolders = signal<ReadonlyMap<string, string>>(new Map());
  /**
   * Sem abas, com todas as anotações num grupo só (ou todas sem grupo), o Tudo é esse grupo: as pastas dele
   * valem ali. A chave e o nome dele, ou null.
   */
  private readonly loneGroup = computed<{ key: string; label: string } | null>(() => {
    if (!this.notes() || this.activeTab() !== ALL_TAB || this.noteTabs()?.tabs.length) return null;
    const all = this.wall();
    if (!all.length) return null;
    const key = lookKey(all[0].category ?? '');
    if (!all.every((r) => lookKey(r.category ?? '') === key)) return null;
    return { key, label: key ? all[0].category! : 'Sem grupo' };
  });
  /**
   * O grupo das pastas: o da aba de grupo aberta nas anotações (a chave; "" é o Sem grupo), o único grupo
   * de um mural sem abas, ou null fora deles.
   */
  readonly folderGroup = computed<string | null>(() => {
    if (!this.notes()) return null;
    const tab = this.activeTab();
    if (!isGroupTab(tab)) return this.loneGroup()?.key ?? null;
    return tab === NO_CATEGORY_TAB ? '' : tab.slice(2);
  });
  /** O nome do grupo das pastas, o começo do caminho ("Sem grupo" para as sem grupo). */
  readonly folderGroupLabel = computed(() =>
    this.activeTab() === NO_CATEGORY_TAB ? 'Sem grupo' : (this.loneGroup()?.label ?? this.activeTabLabel() ?? 'Sem grupo'),
  );
  /** A pasta aberta no grupo (viva; a desfeita sobe), ou null na raiz (e fora de um grupo). */
  readonly openFolder = computed<string | null>(() => {
    const g = this.folderGroup();
    return g === null ? null : this.folders().resolve(this.openFolders().get(this.activeTab()), g);
  });
  /** O caminho da raiz até a pasta aberta (vazio na raiz). */
  readonly folderPath = computed<readonly NoteFolder[]>(() => this.folders().path(this.openFolder()));
  /**
   * Procurando (a busca ou um filtro ligado): dentro de um grupo, a parede deixa as pastas e mostra tudo o
   * que há na aberta e nas de dentro, numa lista só (PLANO-PASTAS.md, P6).
   */
  readonly seeking = computed(() => this.query().trim() !== '' || filterSize(this.activeFilter()) > 0);
  /** As pastas logo dentro da aberta, na parede (só num grupo, e não procurando). */
  readonly folderKids = computed<readonly NoteFolder[]>(() => {
    const g = this.folderGroup();
    return g === null || this.seeking() ? [] : this.folders().kids(g, this.openFolder());
  });
  /**
   * Quantas anotações à mostra (e quantas pastas) cada pasta da parede tem, e as três que espiam pela boca: as
   * primeiras que se vê ao abrir a pasta (as que estão direto nela, na ordem da parede; depois as de dentro).
   */
  readonly folderInfo = computed<ReadonlyMap<string, FolderInfo>>(() => {
    const kids = this.folderKids();
    if (!kids.length) return new Map();
    const tree = this.folders();
    const out = new Map<string, FolderInfo>(kids.map((f) => [f.id, { notes: 0, folders: tree.kids(f.group, f.id).length, peek: [] }]));
    const kidOf = new Map<string, string>();
    for (const f of kids) for (const id of tree.below(f.id)) kidOf.set(id, f.id);
    const direct = new Map<string, Review[]>();
    const deep = new Map<string, Review[]>();
    for (const r of this.tabNotes()) {
      const at = tree.of(r) ?? '';
      const k = kidOf.get(at);
      if (!k || !this.shows(r)) continue;
      out.get(k)!.notes++;
      const into = at === k ? direct : deep;
      const list = into.get(k);
      if (list) list.push(r);
      else into.set(k, [r]);
    }
    const order = this.order();
    for (const [k, info] of out) {
      const first = sortWall(direct.get(k) ?? [], order);
      info.peek = (first.length >= 3 ? first : [...first, ...sortWall(deep.get(k) ?? [], order)]).slice(0, 3);
    }
    return out;
  });

  /**
   * Como a pasta mudou por último: tocando numa pasta ou no caminho (`true`: o endereço ganha uma entrada no
   * histórico, e o Voltar sobe) ou não (trocar de grupo, o Voltar do navegador: o endereço só acompanha).
   */
  readonly folderPushed = signal(false);
  /**
   * Para onde o foco vai depois de um toque que trocou a pasta (PLANO-PASTAS.md, 4.11): entrando, o último
   * pedaço do caminho (`to: null`); subindo, a pasta da parede de onde se saiu (o id). `n` muda a cada toque.
   */
  readonly folderFocus = signal<{ to: string | null; n: number } | null>(null);

  /** Abre a pasta no grupo aberto (null: volta à raiz). `push`: veio de um toque (ver `folderPushed`). */
  enterFolder(id: string | null, push = true): void {
    const tab = this.activeTab();
    if (this.folderGroup() === null) return;
    if (push) {
      // subindo, a pasta do caminho logo abaixo da nova aberta é a que fica na parede
      const was = this.folderPath();
      const at = id === null ? -1 : was.findIndex((f) => f.id === id);
      const to = id === null || at >= 0 ? (was[at + 1]?.id ?? null) : null;
      this.folderFocus.update((f) => ({ to, n: (f?.n ?? 0) + 1 }));
    }
    // (abrir a que já está aberta não muda o endereço: o toque não fica esperando pela próxima troca)
    this.folderPushed.set(push && id !== this.openFolder());
    this.openFolders.update((m) => {
      const next = new Map(m);
      if (id) next.set(tab, id);
      else next.delete(tab);
      return next;
    });
  }

  /**
   * O mural da aba aberta, na pasta aberta: num grupo, só o que está direto nela; procurando, ela e as de
   * dentro (na raiz, o grupo inteiro). Fora de um grupo, a aba inteira. Finalizadas também.
   */
  readonly tabbed = computed<Review[]>(() => {
    const all = this.tabNotes();
    if (this.folderGroup() === null || this.seeking()) return this.subtree();
    const tree = this.folders();
    const open = this.openFolder();
    return all.filter((r) => tree.of(r) === open);
  });
  /**
   * A pasta aberta e todas as de dentro (na raiz, o grupo inteiro; fora de um grupo, a aba inteira): onde a
   * busca e os filtros procuram, e o que o Filtrar conta antes de ligar um filtro.
   */
  private readonly subtree = computed<Review[]>(() => {
    const all = this.tabNotes();
    const open = this.folderGroup() === null ? null : this.openFolder();
    if (open === null) return all;
    const tree = this.folders();
    const below = tree.below(open);
    return all.filter((r) => below.has(tree.of(r) ?? ''));
  });
  /**
   * Ordenando por finalização, as finalizadas aparecem (é delas que a ordem fala), sem mudar o
   * "Mostrar finalizadas" guardado. Só a parede: o número das abas continua o de sempre.
   */
  private readonly doneBySort = computed(() => this.notes() && this.shownSort() === 'finalizacao');
  /** O mural sem as finalizadas escondidas: é o "todo" do mural (da aba), para contar e para o vazio. */
  readonly pool = computed<Review[]>(() => this.shownOf(this.tabbed()));
  /** As à mostra de uma lista (sem as finalizadas escondidas; ordenando por finalização, elas também). */
  private shownOf(list: readonly Review[]): Review[] {
    const done = this.doneBySort();
    return list.filter((r) => this.shows(r) || (done && isDone(r) && this.showsBoard(r)));
  }
  /** Quantas anotações finalizadas a aba tem (à mostra ou não). */
  readonly doneCount = computed(() => this.tabbed().filter(isDone).length);
  /** As finalizadas que estão fora do mural agora (também as que estão só no Kanban). */
  readonly hiddenDone = computed(() => (this.doneBySort() ? 0 : this.tabbed().filter((r) => !this.showsDone(r)).length));
  /** As anotações da aba que estão fora do mural, no Kanban ou nos Flashcards (as finalizadas, só com as finalizadas à mostra). */
  readonly boardCount = computed(() => {
    const only = this.boardOnly();
    return only.size ? this.tabbed().filter((r) => only.has(r.id) && this.showsDone(r)).length : 0;
  });
  /** Delas, as que estão num quadro (o "Só no Kanban" do Filtrar). */
  readonly kanbanCount = computed(() => (this.boardOnly().size ? this.tabbed().filter((r) => this.inKanbanOff(r) && this.showsDone(r)).length : 0));
  /** Delas, as que são flashcards (o "Só nos Flashcards" do Filtrar; a que está nos dois conta nos dois). */
  readonly studyCount = computed(() => {
    const deck = this.deckOff();
    return deck.size ? this.tabbed().filter((r) => deck.has(r.id) && this.showsDone(r)).length : 0;
  });
  /** As que estão fora do mural agora por estarem no Kanban ou nos Flashcards (para o vazio dizer onde elas estão). */
  readonly hiddenBoard = computed(() => (this.boardOnly().size ? this.tabbed().filter((r) => !this.showsBoard(r) && this.showsDone(r)).length : 0));
  /**
   * As fora do mural que estão à mostra agora (pelo "Só no Kanban" ou pelo "Só nos Flashcards"): levam a
   * etiqueta na ficha.
   */
  readonly shownOff = computed<ReadonlySet<string>>(() => {
    const only = this.boardOnly();
    if (!only.size || (!this.showBoard() && !this.showStudy())) return NO_IDS;
    return new Set([...only].filter((id) => (this.showBoard() && !this.studyOnly().has(id)) || (this.showStudy() && this.deckOff().has(id))));
  });
  /**
   * Onde moram as fora do mural da aba, as escondidas agora (sem nenhuma escondida, todas): no Kanban, nos
   * Estudos ou nos dois (PLANO-ESTUDOS.md, 6.9). As palavras do vazio e da busca seguem daqui.
   */
  readonly boardPlace = computed<'kanban' | 'estudos' | 'ambos'>(() => {
    const only = this.boardOnly();
    const study = this.studyOnly();
    if (!study.size) return 'kanban';
    const off = this.tabbed().filter((r) => only.has(r.id));
    const hidden = off.filter((r) => !this.showsBoard(r));
    let k = false;
    let s = false;
    for (const r of hidden.length ? hidden : off) {
      if (study.has(r.id)) s = true;
      else k = true;
    }
    return k && s ? 'ambos' : s ? 'estudos' : 'kanban';
  });

  /**
   * "Mostrar aqui" (o vazio e a busca): as fora do mural escondidas na aba voltam, ligando o "Só no Kanban" e o
   * "Só nos Flashcards" de quem as tem.
   */
  showOff(): void {
    const hidden = this.tabbed().filter((r) => this.boardOnly().has(r.id) && !this.showsBoard(r));
    if (hidden.some((r) => this.inKanbanOff(r))) this.showBoard.set(true);
    if (hidden.some((r) => this.deckOff().has(r.id))) this.showStudy.set(true);
  }

  /**
   * A ordem que vale de fato. Sem spoilers, ordenar por nota entregaria o ranking mesmo com as notas
   * escondidas: o mural fica por data, e a escolha guardada volta quando o modo desliga.
   */
  readonly shownSort = computed<SortKey>(() => {
    const sort = sortFor(this.chosenSort(), this.mural.profile());
    // numa aba de categoria, ordenar por categoria daria uma seção só: vale a Prioridade (nas músicas, a
    // Data); nas Fixadas e nas Compartilhadas, que juntam os grupos, ela separa
    if (sort === 'categoria' && isGroupTab(this.activeTab())) return this.notes() ? 'prioridade' : 'data';
    return this.guarding() && sort === 'nota' ? 'data' : sort;
  });
  /**
   * Os filtros que valem de fato: só os dos grupos que o mural aberto tem (a tag das anotações não
   * filtra as análises) e, sem spoilers, sem veredito, nota nem dificuldade, que entregariam o que
   * está escondido.
   */
  protected readonly activeFilter = computed<WallFilter>(() => {
    const f = filterFor(this.filter(), this.mural.profile());
    return this.guarding() ? withoutSpoilerFacets(f) : f;
  });

  /** A anotação está fora por uma tag escondida (no filtro, ou pelo padrão)? */
  private readonly outByTags = computed(() => {
    const outs = this.tagOuts();
    const defaults = this.defaultTagOuts();
    return (r: Review) => hiddenByTags(r, outs, defaults);
  });

  /**
   * As fichas que a busca encontra, antes dos filtros, sem as das tags escondidas: é sobre elas que a
   * cartela conta.
   */
  private readonly searched = computed<Review[]>(() => {
    const needle = fold(this.query().trim());
    const out = this.outByTags();
    // a parede inteira: as fichas e as rejogadas, cada uma no seu lugar (as anotações finalizadas, só à mostra)
    return this.pool().filter((r) => matchesQuery(r, needle, this.folders()) && !out(r));
  });

  /** Quantas fichas que a busca acharia as tags escondidas tiram do mural. */
  readonly tagHidden = computed(() => {
    const needle = fold(this.query().trim());
    const out = this.outByTags();
    return this.pool().filter((r) => out(r) && matchesQuery(r, needle, this.folders())).length;
  });

  /** Quantas anotações finalizadas, escondidas, a busca acharia (para o mural dizer que elas existem). */
  readonly doneMatches = computed(() => {
    const needle = fold(this.query().trim());
    if (!needle || this.showDone()) return 0;
    return this.tabbed().filter((r) => isDone(r) && !this.stamping().has(r.id) && this.showsBoard(r) && matchesQuery(r, needle, this.folders())).length;
  });

  /** Quantas anotações só no Kanban, escondidas, a busca acharia (para o mural dizer que elas existem). */
  readonly boardMatches = computed(() => {
    const needle = fold(this.query().trim());
    if (!needle || !this.boardOnly().size) return 0;
    const out = this.outByTags();
    return this.tabbed().filter((r) => !this.showsBoard(r) && this.showsDone(r) && matchesQuery(r, needle, this.folders()) && !out(r)).length;
  });

  /** Quantas anotações à mostra, nas outras abas, a busca acharia (para oferecer procurar em todas). */
  readonly elsewhere = computed(() => {
    const needle = fold(this.query().trim());
    if (!needle || this.activeTab() === ALL_TAB) return 0;
    const out = this.outByTags();
    return this.wall().filter((r) => !this.inTab(r) && this.shows(r) && matchesQuery(r, needle, this.folders()) && !out(r)).length;
  });

  /** Os grupos da cartela, com quantas fichas cada opção mostraria. */
  readonly facets = computed(() => {
    // dentro de um grupo, sem procurar ainda, a parede mostra só o que está direto na pasta, mas filtrar
    // procura nela e nas de dentro: a cartela conta essas (sem busca, só as tags escondidas tiram alguma)
    const out = this.outByTags();
    const base = this.folderGroup() === null || this.seeking() ? this.searched() : this.shownOf(this.subtree()).filter((r) => !out(r));
    const all = facetsOf(base, this.activeFilter(), this.mural.profile(), this.folders());
    // numa aba de categoria, o grupo Categoria só teria ela mesma; e nas anotações, a pasta é o lugar
    // (a parede entra nela), não um filtro (PLANO-PASTAS.md, 4.4)
    const inTab = isGroupTab(this.activeTab()) ? all.filter((f) => f.key !== 'category' && !(this.notes() && f.key === 'subject')) : all;
    return this.guarding() ? inTab.filter((f) => !SPOILER_FACETS.includes(f.key)) : inTab;
  });
  /** Os filtros ligados, como etiquetas. */
  readonly tags = computed(() => tagsOf(this.activeFilter(), this.mural.profile(), this.folders()));
  readonly filterCount = computed(() => filterSize(this.activeFilter()));

  readonly isFiltered = computed(() => this.query().trim() !== '' || this.filterCount() > 0 || this.tagHidden() > 0);

  readonly visible = computed<Review[]>(() => {
    const f = this.activeFilter();
    return sortWall(
      this.searched().filter((r) => matchesFilter(r, f, undefined, this.folders())),
      this.order(),
    );
  });

  private readonly order = computed<WallOrder>(() => ({
    sort: this.shownSort(),
    key: this.activeScore(),
    direction: this.direction(),
    profile: this.mural.profile(),
    pinnedFirst: this.pinnedFirst(),
    categoryOrder: this.notes() ? this.categoryOrder() : null,
    ownerOf: this.ownerOf,
    ownLabel: this.owner() ?? 'Você',
    folderName: (r) => folderNameOf(this.folders(), r),
  }));
  /** De quem é a anotação: null, do dono do mural; senão, o nome de quem a compartilhou. */
  private readonly ownerOf = (r: Review): string | null => this.sharedWithMe().get(r.id) ?? r.sharedBy?.nome ?? null;

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
    this.pinnedFirst = signal(prefs.pinnedFirst);
    this.noteTab = signal(prefs.noteTab);
    this.musicTab = signal(prefs.musicTab);
    this.collapsed = signal(new Set(prefs.collapsed));
    // na visita, só a ordem e o tipo de ficha ficam guardados: a aba e as seções são de cada mural (o "Mostrar
    // também" não fica guardado: cada aba abre no padrão dela, ver `applyTabShows`)
    effect(() => {
      const kept: Partial<ViewPrefs> = {
        sort: this.sort(),
        scoreKey: this.scoreKey(),
        direction: this.reviewDirection(),
        density: this.reviewDensity(),
        noteViews: this.noteViews(),
        pinnedFirst: this.pinnedFirst(),
        ...(memory.whole ? { noteTab: this.noteTab(), musicTab: this.musicTab(), collapsed: [...this.collapsed()].slice(-MAX_COLLAPSED) } : {}),
      };
      writeJson(memory.key, kept);
    });
    // o padrão da aba escolhida mudou (nas configurações, com ela aberta): ela passa a estar nele. Trocar de aba
    // já abre no padrão (ver `setNoteTab`): só a mudança do padrão da mesma aba conta aqui
    let last: { key: string; t: ShowToggles } | null = null;
    effect(() => {
      const key = this.noteTab();
      const t = this.tabShows(key);
      const changed = !!last && last.key === key && (last.t.done !== t.done || last.t.kanban !== t.kanban || last.t.study !== t.study);
      last = { key, t };
      if (changed) untracked(() => this.applyTabShows());
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
   * Abre uma aba do mural aberto (uma categoria das anotações, um artista das músicas). Os filtros da
   * cartela eram da aba de antes (as tags dela) e saem; a busca fica, e passa a procurar na aba nova.
   */
  setNoteTab(key: string): void {
    const tab = this.tabOf(this.mural.kind());
    this.allAsked.set(key === ALL_TAB);
    if (tab() === key && this.activeTab() === key) return;
    this.passingDensity.set(null);
    this.passingSort.set(null);
    tab.set(key);
    this.filter.set(NO_FILTER);
    this.tagOuts.set(NO_TAG_OUTS);
    this.applyTabShows();
  }

  /**
   * De volta ao mural de anotações, vindo de outra página: a aba aberta abre no padrão dela, como se acabasse de
   * ser escolhida (sem pasta nem tags do filtro, com o "Mostrar também" do grupo); a busca fica.
   */
  enterWall(): void {
    if (!this.notes()) return;
    this.filter.set(NO_FILTER);
    this.tagOuts.set(NO_TAG_OUTS);
    this.applyTabShows();
  }

  /** Muda a vista da aba aberta do mural de anotações (só ela: as outras abas ficam como estão). */
  private patchNoteView(patch: Partial<NoteView>): void {
    const key = this.activeTab();
    const next = { ...this.noteView(), ...patch };
    this.noteViews.update((views) => ({ ...views, [key]: next }));
  }

  setSort(sort: SortKey): void {
    if (isNotes(this.mural.kind())) {
      if (this.chosenSort() === sort) return;
      // o grupo com a ordem dele: a trocada na régua vale só enquanto ele está aberto
      if (this.groupSort()) this.passingSort.set({ tab: this.activeTab(), sort, direction: DEFAULT_DIRECTION[sort] });
      else this.patchNoteView({ sort, direction: DEFAULT_DIRECTION[sort] });
      return;
    }
    if (this.sort() === sort) return;
    this.sort.set(sort);
    this.reviewDirection.set(DEFAULT_DIRECTION[sort]);
  }

  toggleDirection(): void {
    const flip = (d: Direction): Direction => (d === 'desc' ? 'asc' : 'desc');
    if (!isNotes(this.mural.kind())) this.reviewDirection.update(flip);
    else if (this.groupSort()) this.passingSort.set({ tab: this.activeTab(), sort: this.shownSort(), direction: flip(this.direction()) });
    else this.patchNoteView({ direction: flip(this.noteView().direction) });
  }

  /** O tipo de ficha do mural aberto (no de anotações, só o da aba aberta). */
  setDensity(density: Density): void {
    if (isNotes(this.mural.kind())) {
      if (!NOTE_DENSITIES.includes(density)) return;
      // o grupo com a visualização dele: a trocada na régua vale só enquanto ele está aberto
      if (this.groupDensity()) this.passingDensity.set({ tab: this.activeTab(), density });
      else if (this.noteView().density !== density) this.patchNoteView({ density });
    } else if (REVIEW_DENSITIES.includes(density)) {
      this.reviewDensity.set(density);
    }
  }

  toggle(key: FacetKey, value: string): void {
    this.filter.update((f) => toggleOption(f, key, value));
  }

  /** O campo do assunto na pasta das anotações: um assunto por vez (o valor da opção), ou todos (null). */
  chooseSubject(value: string | null): void {
    this.filter.update((f) => ({ ...f, subject: value ? [value] : [] }));
  }

  /**
   * O clique direito numa tag do filtro: esconde as anotações que têm a tag (sai das ligadas, se
   * estava). Na tag já escondida, mostra de novo.
   */
  excludeTag(value: string): void {
    if (this.tagIsOut(value)) {
      this.releaseTag(value);
      return;
    }
    const k = fold(value);
    this.filter.update((f) => (f.tag.some((t) => fold(t) === k) ? { ...f, tag: f.tag.filter((t) => fold(t) !== k) } : f));
    this.tagOuts.update((o) => excludeTag(o, value));
  }

  /** O clique na tag riscada: as anotações dela voltam (nesta visita, mesmo as que o padrão esconde). */
  releaseTag(value: string): void {
    this.tagOuts.update((o) => releaseTag(o, value, outByDefault(value, this.tabNotes(), this.defaultTagOuts())));
  }

  /** A tag está riscada no filtro: esconde alguma anotação da aba. */
  tagIsOut(value: string): boolean {
    const k = fold(value);
    const outs = this.tagOuts();
    if (outs.out.includes(k)) return true;
    const defaults = this.defaultTagOuts();
    return this.tabNotes().some((r) => !!r.tags?.some((t) => fold(t) === k && tagIsOut(t, r.category, outs, defaults)));
  }

  clearFacet(key: FacetKey): void {
    this.filter.update((f) => (f[key].length ? { ...f, [key]: [] } : f));
  }

  /** Limpar tudo, na folha dos filtros: sem filtros e nenhuma tag escondida (nem pelo padrão); a busca fica. */
  clearChoices(): void {
    this.filter.set(NO_FILTER);
    this.tagOuts.set(showAllTags(this.wall(), this.defaultTagOuts()));
  }

  /** Limpar: sem busca nem filtros, e nenhuma tag escondida nesta visita (nem pelo padrão). */
  clearFilters(): void {
    this.query.set('');
    this.filter.set(NO_FILTER);
    this.tagOuts.set(showAllTags(this.wall(), this.defaultTagOuts()));
  }

  /** Volta ao começo: sem busca nem filtros, em "Tudo", com as seções abertas e as finalizadas fora. */
  protected reset(): void {
    this.clearFilters();
    // (as tags do padrão voltam a nascer escondidas)
    this.tagOuts.set(NO_TAG_OUTS);
    this.noteTab.set(ALL_TAB);
    this.musicTab.set(ALL_TAB);
    this.allAsked.set(false);
    this.collapsed.set(new Set());
    this.passingDensity.set(null);
    this.passingSort.set(null);
    this.applyTabShows();
    this.openFolders.set(new Map());
  }

  /** Abre a pasta pelo endereço (`?pasta=`): na aba do grupo dela, se for preciso. A que não existe abre a raiz. */
  openFolderFrom(id: string | null): void {
    if (!this.notes()) return;
    const f = id ? this.folders().live(id) : undefined;
    if (f) {
      const tab = f.group ? `c:${f.group}` : NO_CATEGORY_TAB;
      // (sem abas, o Tudo já é o grupo)
      if (this.activeTab() !== tab && this.noteTabs()?.tabs.some((t) => t.key === tab)) this.setNoteTab(tab);
    }
    this.enterFolder(f ? f.id : null, false);
  }
}

/** A vista do seu mural: fica toda guardada, e as notas se escondem com "Sem spoilers" (Ajustes). */
@Injectable({ providedIn: 'root' })
export class WallView extends WallState {
  private readonly settings = inject(Settings);
  private readonly shared = inject(SharedStore);
  readonly wall = this.mural.wall;
  readonly guarding = computed(() => this.settings.noSpoilers());
  readonly owner = signal<string | null>(null).asReadonly();
  readonly categoryLooks = this.settings.categoryLooks.asReadonly();
  readonly folders = inject(NoteFolders).tree;
  override readonly categoryOrder = computed(() => activeOrder(this.settings.notesConfig()));
  override readonly hiddenTabs = computed<ReadonlySet<string>>(() => new Set([...hiddenKeys(this.settings.notesConfig())].map((k) => `c:${k}`)));
  override readonly showAllTab = computed(() => !this.notes() || this.settings.notesConfig().showAll);
  override readonly hideEmpty = computed(() => this.settings.notesConfig().hideEmpty);
  override readonly specialsOn = computed(() => this.notes());
  override readonly pinnedStands = computed(() => this.settings.notesConfig().showPinned);
  override readonly sharedStands = computed(() => this.settings.notesConfig().showShared);
  override readonly autoColors = computed(() => this.settings.notesConfig().autoColors);
  override readonly sharedWithMe = computed<ReadonlyMap<string, string>>(() => {
    const out = new Map<string, string>();
    for (const e of this.shared.entries().values()) if (e.papel !== 'dono') out.set(e.id, e.dono.nome);
    return out;
  });
  override readonly groupViews = computed<ReadonlyMap<string, Density>>(() => groupViews(this.settings.notesConfig()));
  override readonly groupSorts = computed<ReadonlyMap<string, SortKey>>(() => groupSorts(this.settings.notesConfig()));
  override readonly defaultTagOuts = this.settings.hiddenTagKeys;
  override readonly boardOnly = inject(KanbanStore).boardOnly;
  override readonly studyOnly = inject(KanbanStore).studyOnly;
  override readonly deckOff = inject(KanbanStore).deckOff;
  override readonly groupShows = computed(() => groupShows(this.settings.notesConfig()));

  constructor() {
    super({ key: KEY, whole: true });
    // o grupo aberto no mural é o do Kanban também: abrir o Kanban cai no quadro dele (e o quadro
    // aberto no Kanban abre o grupo no mural, ver `openGroup`)
    effect(() => {
      if (!this.notes()) return;
      const label = this.activeTab().startsWith('c:') ? this.activeTabLabel() : null;
      if (label) writeText(KANBAN_LAST_KEY, boardIdFor(label));
    });
  }

  /**
   * Abre no mural de anotações a aba do grupo (o quadro aberto no Kanban): mural e Kanban ficam no
   * mesmo grupo. Como trocar de aba, os filtros da aba de antes saem. O grupo vazio no mural, com
   * "Esconder os grupos vazios", não abre aqui (o mural fica onde estava): ele está no "Mais", e o
   * quadro dele no Kanban não traz nada para o mural mostrar.
   */
  openGroup(label: string): void {
    const key = noteTabKey({ category: label });
    if (this.emptyTabs().has(key)) return;
    this.allAsked.set(false);
    if (this.noteTab() === key) return;
    this.passingDensity.set(null);
    this.passingSort.set(null);
    this.noteTab.set(key);
    this.filter.set(NO_FILTER);
    this.tagOuts.set(NO_TAG_OUTS);
    this.applyTabShows();
  }

  /**
   * Uma ficha nova que ficaria escondida: num mural com abas, abre a aba dela (se a aba de agora
   * a esconde); se ainda assim ficaria fora, limpa a busca e os filtros.
   */
  reveal(r: Review): void {
    if (hasTabs(this.mural.kind()) && !this.inTab(r)) this.setNoteTab(noteTabKey(r));
    if (!this.visible().some((x) => x.id === r.id)) this.clearFilters();
  }

  /** A categoria de uma anotação nova escrita agora: a da aba aberta (null em "Tudo" e em "Sem categoria"). */
  newNoteCategory(): string | null {
    return this.notes() && this.activeTab().startsWith('c:') ? this.activeTabLabel() : null;
  }

  /**
   * A pasta (o id) da anotação nova escrita no mural: a aberta no grupo; fora de uma pasta, a única ligada
   * no filtro, se for uma só (e não "Sem assunto").
   */
  newNoteSubject(): string | null {
    const open = this.openFolder();
    if (open) return open;
    const on = this.notes() ? this.activeFilter().subject : [];
    return on.length === 1 && on[0] !== 'sem' ? on[0] : null;
  }

  /** Guarda a busca, o filtro e a ordem, e devolve como voltar a eles (ver ViewTransitions.run). */
  snapshot(): () => void {
    const query = this.query(),
      filter = this.filter(),
      tagOuts = this.tagOuts(),
      sort = this.sort(),
      scoreKey = this.scoreKey(),
      direction = this.reviewDirection(),
      density = this.reviewDensity(),
      noteViews = this.noteViews(),
      noteTab = this.noteTab(),
      musicTab = this.musicTab();
    return () => {
      this.query.set(query);
      this.filter.set(filter);
      this.tagOuts.set(tagOuts);
      this.sort.set(sort);
      this.scoreKey.set(scoreKey);
      this.reviewDirection.set(direction);
      this.reviewDensity.set(density);
      this.noteViews.set(noteViews);
      this.noteTab.set(noteTab);
      this.musicTab.set(musicTab);
    };
  }
}


/** O que a seta da ordem diz, no seu mural e no de um colega. */
export function directionLabelOf(sort: SortKey, direction: Direction, profile: KindProfile, ordered = false): string {
  const desc = direction === 'desc';
  switch (sort) {
    case 'data':
      return desc ? 'Mais recentes primeiro' : 'Mais antigas primeiro';
    case 'alfabetica':
      return desc ? 'De Z a A' : 'De A a Z';
    case 'categoria':
      if (isMusic(profile.kind)) return desc ? 'Artistas de Z a A' : 'Artistas de A a Z';
      if (ordered) return desc ? 'Grupos na sua ordem, de trás para a frente' : 'Grupos na sua ordem';
      return desc ? 'Grupos de Z a A' : 'Grupos de A a Z';
    case 'assunto':
      return desc ? 'Pastas de Z a A' : 'Pastas de A a Z';
    case 'tag':
      return desc ? 'Tags de Z a A' : 'Tags de A a Z';
    case 'prioridade':
      return desc ? 'Fixadas primeiro; as mais recentes antes' : 'Fixadas primeiro; as mais antigas antes';
    case 'criacao':
      return desc ? 'Criadas há pouco primeiro' : 'Criadas há mais tempo primeiro';
    case 'alteracao':
      return desc ? 'Mexidas há pouco primeiro' : 'Paradas há mais tempo primeiro';
    case 'finalizacao':
      return desc ? 'Finalizadas há pouco primeiro' : 'Finalizadas há mais tempo primeiro';
    case 'tarefas':
      return desc ? 'Mais por fazer primeiro' : 'Menos por fazer primeiro';
    case 'cor':
      return desc ? 'Da última cor à primeira' : 'Na ordem das cores';
    case 'quem':
      return desc ? 'Públicas primeiro' : 'Privadas primeiro';
    case 'dono':
      return desc ? 'As suas primeiro; os outros donos de Z a A' : 'As suas primeiro; os outros donos de A a Z';
    case 'status':
      return `${desc ? profile.statusGroup.platinado : profile.statusGroup.incompleto} primeiro`;
    default:
      return desc ? 'Maiores notas primeiro' : 'Menores notas primeiro';
  }
}

/**
 * Uma pasta na parede: quantas anotações à mostra ela tem (com as de dentro), quantas pastas logo dentro, e
 * as primeiras três anotações dela, que aparecem em miniatura saindo pela boca (a capa ou a cartolina).
 */
export interface FolderInfo {
  notes: number;
  folders: number;
  peek: readonly Review[];
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
  /** Nas anotações, a ordem das categorias montada à mão (pela chave); sem ela, de A a Z. */
  categoryOrder?: readonly string[] | null;
  /**
   * O dono da anotação, ordenando por dono: o nome de quem a compartilhou, ou null quando ela é do
   * dono do mural (sem a função, todas são dele).
   */
  ownerOf?: (r: Review) => string | null;
  /** Como a seção das anotações do dono do mural se chama ("Você", ou o nome dele na visita). */
  ownLabel?: string;
  /** O nome da pasta da anotação (ordenando por pasta); sem a função, nenhuma tem pasta. */
  folderName?: (r: Review) => string | null;
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
  const groups = o.sort === 'tag' && isNotes(o.profile.kind) ? groupByTags(sorted, o) : groupInRuns(sorted, o);
  // anotação não tem nota: a seção diz só quantas são
  const showAvg = o.sort !== 'nota' && !hideAverage && !isNotes(o.profile.kind);
  for (const g of groups) {
    const n = g.reviews.length;
    // "3 jogos · 1 rejogada": a rejogada não é mais um jogo no mural
    const again = g.reviews.filter((r) => r.revisitOf).length;
    const counts = n > again ? countsOf(o.profile, g.reviews.filter((r) => !r.revisitOf)) : [];
    const extra = again ? [revisitCountOf(o.profile, again)] : [];
    if (showAvg && n > 1) extra.push(`média ${avgFmt.format(g.reviews.reduce((s, r) => s + r.scores.final, 0) / n)}`);
    g.summary = [...counts, ...extra].join(' · ');
    // o número da cabeça já diz quantas são: a contagem só volta no detalhe quando se divide (álbuns e músicas)
    g.detail = [...(counts.length > 1 ? counts : []), ...extra].join(' · ');
  }
  return groups;
}

/** "3 jogos"; nas músicas, o que cada ficha é: "2 álbuns", "1 música". */
function countsOf(profile: KindProfile, originals: readonly Review[]): string[] {
  if (!isMusic(profile.kind)) return [countOf(profile, originals.length)];
  const albums = originals.filter((r) => musicFormOf(r.game) === 'album').length;
  const songs = originals.length - albums;
  return [...(albums ? [plural(albums, 'álbum', 'álbuns')] : []), ...(songs ? [countOf(profile, songs)] : [])];
}

/** As seções em sequência: a lista já vem ordenada, cada seção é uma corrida de fichas com a mesma chave. */
function groupInRuns(sorted: readonly Review[], o: WallOrder): WallGroup[] {
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
    else groups.push({ key, label, summary: '', detail: '', reviews: [r] });
  }
  return groups;
}

/**
 * Ordenando por tag: uma seção por tag, e a anotação em todas as das tags dela (a de duas tags aparece
 * duas vezes, uma em cada). As seções vão de A a Z (ou de Z a A), "Sem tag" no fim; as fixadas, se vêm
 * na frente, ficam só na seção delas. Dentro de cada seção, as mais recentes primeiro, como na ordem
 * por tag. A segunda vez que uma ficha aparece é uma cópia (`copies`).
 */
function groupByTags(sorted: readonly Review[], o: WallOrder): WallGroup[] {
  const sign = o.direction === 'desc' ? -1 : 1;
  const pins = pinsFirst(o);
  const byKey = new Map<string, WallGroup>();
  const inGroup = new Map<string, Set<string>>();
  const add = (key: string, label: string, r: Review) => {
    let g = byKey.get(key);
    if (!g) byKey.set(key, (g = { key, label, summary: '', detail: '', reviews: [] }));
    const ids = inGroup.get(key) ?? new Set<string>();
    inGroup.set(key, ids);
    // duas tags que só mudam no acento ou na caixa são a mesma seção: a anotação entra uma vez
    if (ids.has(r.id)) return;
    ids.add(r.id);
    g.reviews.push(r);
  };
  for (const r of sorted) {
    if (pins && isPinnedNote(r)) add(...PINNED_GROUP, r);
    else if (!r.tags?.length) add('sem-tag', 'Sem tag', r);
    else for (const t of r.tags) add(`t:${fold(t)}`, `#${t}`, r);
  }
  const rankOf = (g: WallGroup) => (g.key === PINNED_GROUP[0] ? 0 : g.key === 'sem-tag' ? 2 : 1);
  const groups = [...byKey.values()].sort((a, b) => rankOf(a) - rankOf(b) || sign * nameCollator.compare(a.label.slice(1), b.label.slice(1)));
  const newest = (a: Review, b: Review) => -byDateOf(a, b);
  const seen = new Set<string>();
  for (const g of groups) {
    if (g.key !== PINNED_GROUP[0]) g.reviews.sort(newest);
    const copies = g.reviews.filter((r) => seen.has(r.id)).map((r) => r.id);
    if (copies.length) g.copies = new Set(copies);
    for (const r of g.reviews) seen.add(r.id);
  }
  return groups;
}

/** Pela data de conclusão; no mesmo dia, a criada por último depois. Sem data conta como a mais antiga. */
function byDateOf(a: Review, b: Review): number {
  return (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

const PINNED_GROUP: [string, string] = ['fixadas', 'Fixadas'];
/** As seções da Prioridade: as fixadas e as comuns. */
const RANK_GROUPS: [string, string][] = [PINNED_GROUP, ['comuns', 'Anotações']];

/** A categoria da anotação (a seção dela ordenando por categoria), ou nenhuma. */
function firstCategory(r: Review): string | null {
  return r.category ?? null;
}

/** O nome da pasta da anotação (a seção dela ordenando por pasta), ou nenhuma. */
function folderOfNote(r: Review, o: WallOrder): string | null {
  return o.folderName?.(r) ?? null;
}

/** A primeira tag da anotação (a seção dela ordenando por tag), ou nenhuma. */
function firstTag(r: Review): string | null {
  return r.tags?.[0] ?? null;
}

/** A seção do mês de um instante (ISO), no fuso de quem vê: "Outubro de 2026". */
function monthOf(iso: string): [string, string] {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ['sem-data', NO_DAY_LABEL];
  return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, cap(longMonthFmt.format(d))];
}

/**
 * As tarefas da anotação: quantas faltam e quantas são. Lidas uma vez por versão da ficha (a ficha
 * mudada é outro objeto): a busca e os filtros reordenam sem ler os textos de novo.
 */
const TASK_COUNTS = new WeakMap<Review, { left: number; all: number }>();
function taskCount(r: Review): { left: number; all: number } {
  let c = TASK_COUNTS.get(r);
  if (!c) {
    const tasks = [...tasksOf(r.text).values()];
    c = { left: tasks.filter((done) => !done).length, all: tasks.length };
    TASK_COUNTS.set(r, c);
  }
  return c;
}
/** As seções da ordem por tarefas: com alguma por fazer, todas feitas, e sem tarefa (sempre no fim). */
const TASK_GROUPS: [string, string][] = [
  ['tarefas-por-fazer', 'Com tarefas por fazer'],
  ['tarefas-feitas', 'Todas feitas'],
  ['sem-tarefa', 'Sem tarefas'],
];
const taskRank = (c: { left: number; all: number }) => (c.left ? 0 : c.all ? 1 : 2);

/** A cor da cartolina como aparece na parede (a sem cor guardada ganha a do rodízio, ver wall-physics). */
const stockShown = (r: Review): Stock => pinningFor(r.id, r.stock).stock;

function groupKeyOf(o: WallOrder): (r: Review) => [string, string] {
  switch (o.sort) {
    case 'criacao':
      return (r) => monthOf(r.createdAt);
    case 'alteracao':
      return (r) => monthOf(r.updatedAt);
    case 'finalizacao':
      return (r) => (r.doneAt ? monthOf(r.doneAt) : ['nao-finalizadas', 'Não finalizadas']);
    case 'tarefas':
      return (r) => TASK_GROUPS[taskRank(taskCount(r))];
    case 'cor':
      return (r) => {
        const c = stockShown(r);
        return [`cor:${c}`, STOCK_LABEL[c]];
      };
    case 'quem':
      return (r) => (r.private ? ['privadas', 'Privadas'] : ['publicas', 'Públicas']);
    case 'dono':
      return (r) => {
        const name = o.ownerOf?.(r) ?? null;
        return name === null ? ['dono-mural', o.ownLabel ?? 'Você'] : [`d:${fold(name)}`, name];
      };
    case 'prioridade':
      return (r) => RANK_GROUPS[rankOrder(r)];
    case 'categoria':
      return (r) => {
        const c = firstCategory(r);
        return c === null ? ['sem-categoria', isMusic(o.profile.kind) ? 'Sem artista' : 'Sem grupo'] : [`c:${fold(c)}`, c];
      };
    case 'assunto':
      return (r) => {
        const s = folderOfNote(r, o);
        return s === null ? ['sem-assunto', 'Fora das pastas'] : [`s:${fold(s)}`, s];
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
          const band = gradeBandOf(shownFinal(r));
          return [band === 'baixo' ? 'b-low' : `b${band}`, GRADE_LABEL[band]];
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
        const label = longMonthFmt.format(parseDay(month + '-01'));
        return [month, cap(label)];
      };
  }
}

function comparatorOf(o: WallOrder): (a: Review, b: Review) => number {
  const inner = orderOf(o);
  if (!pinsFirst(o)) return inner;
  // as fixadas vêm primeiro
  const rank = (r: Review) => (isPinnedNote(r) ? 0 : 1);
  return (a, b) => rank(a) - rank(b) || inner(a, b);
}

function orderOf(o: WallOrder): (a: Review, b: Review) => number {
  const sign = o.direction === 'desc' ? -1 : 1;
  // Data de conclusão primeiro; no mesmo dia, a ficha criada por último vem antes. Sem data conta
  // como a mais antiga, então fica no fim quando a data só desempata.
  const byDate = (a: Review, b: Review) =>
    (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || Date.parse(a.createdAt) - Date.parse(b.createdAt);
  // pelo rótulo (sem rótulo sempre no fim), e dentro dele as mais recentes primeiro
  const byLabel = (labelOf: (r: Review) => string | null) => (a: Review, b: Review) => {
    const la = labelOf(a);
    const lb = labelOf(b);
    if ((la === null) !== (lb === null)) return la === null ? 1 : -1;
    return (la !== null && lb !== null ? sign * nameCollator.compare(la, lb) : 0) || -byDate(a, b);
  };
  // um instante (ISO), a mais antiga primeiro; sem ele, sempre no fim
  const byInstant = (of: (r: Review) => string | undefined) => (a: Review, b: Review) => {
    const ia = of(a);
    const ib = of(b);
    if (!ia !== !ib) return ia ? -1 : 1;
    return (ia && ib ? sign * (Date.parse(ia) - Date.parse(ib)) : 0) || -byDate(a, b);
  };
  switch (o.sort) {
    case 'criacao':
      return byInstant((r) => r.createdAt);
    case 'alteracao':
      return byInstant((r) => r.updatedAt);
    case 'finalizacao':
      return byInstant((r) => r.doneAt);
    case 'tarefas':
      // as seções ficam sempre na mesma ordem; dentro das por fazer, pela quantidade
      return (a, b) => {
        const ca = taskCount(a);
        const cb = taskCount(b);
        return taskRank(ca) - taskRank(cb) || sign * (ca.left - cb.left) || -byDate(a, b);
      };
    case 'cor':
      return (a, b) => sign * (STOCKS.indexOf(stockShown(a)) - STOCKS.indexOf(stockShown(b))) || -byDate(a, b);
    case 'quem':
      // asc: as privadas primeiro
      return (a, b) => sign * ((a.private ? 0 : 1) - (b.private ? 0 : 1)) || -byDate(a, b);
    case 'dono': {
      // as do dono do mural sempre primeiro; os outros donos pelo nome
      const ownerOf = o.ownerOf ?? (() => null);
      return (a, b) => {
        const na = ownerOf(a);
        const nb = ownerOf(b);
        if ((na === null) !== (nb === null)) return na === null ? -1 : 1;
        return (na !== null && nb !== null ? sign * nameCollator.compare(na, nb) : 0) || -byDate(a, b);
      };
    }
    case 'categoria': {
      const order = o.categoryOrder;
      if (!order) return byLabel(firstCategory);
      // na ordem montada: as que têm lugar nele, depois as outras de A a Z; sem categoria sempre no fim
      const at = new Map(order.map((k, i) => [k, i]));
      return (a, b) => {
        const ca = firstCategory(a);
        const cb = firstCategory(b);
        if ((ca === null) !== (cb === null)) return ca === null ? 1 : -1;
        if (ca === null || cb === null) return -byDate(a, b);
        const pa = at.get(labelKey(ca)) ?? order.length;
        const pb = at.get(labelKey(cb)) ?? order.length;
        return sign * (pa - pb || nameCollator.compare(ca, cb)) || -byDate(a, b);
      };
    }
    case 'assunto':
      return byLabel((r) => folderOfNote(r, o));
    case 'tag':
      // pela primeira tag
      return byLabel(firstTag);
    case 'alfabetica':
      // a seção manda primeiro (o "#" antes do A), senão o Ø, o Ł ou um nome em japonês, que o
      // collator põe no meio do alfabeto, abririam outra seção "#" no meio das letras
      return (a, b) =>
        sign * (letterOf(a.game.name).localeCompare(letterOf(b.game.name)) || nameCollator.compare(a.game.name, b.game.name)) ||
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
    // na prioridade, dentro de cada lugar, também pela data
    case 'prioridade':
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
