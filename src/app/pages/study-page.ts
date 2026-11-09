import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, afterRenderEffect, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideIconData } from 'lucide-angular';
import { map } from 'rxjs';
import { studyPath } from '../core/areas';
import { CategoryLook, categoryColorHex } from '../core/category-looks';
import { KanbanStore } from '../core/kanban-store';
import { NO_TABS, NoteTab, sameTabs, tabKeyOf, tabsToMore } from '../core/note-tabs';
import { Settings } from '../core/settings';
import { WallView } from '../core/wall-view';
import { Desk } from '../core/desk';
import { daysBetween, studyDay } from '../core/fsrs';
import { reducedMotion } from '../core/motion';
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { CardFace, CardSize, DECK_NAME_MAX, Deck, LEVEL_LABEL, Level, STUDY_SIZE_KEY, StudyCard as Card, cardFace, frontTitle, groupKey, inGroup, levelOf, studyGroupId, whenLabel } from '../core/study';
import { readText, writeText } from '../core/storage';
import { DRILL_KINDS, DRILL_LABEL, DrillKind, DrillPlan, drillCounts as countDrills, drillPool } from '../core/study-drill';
import { QueueCounts, StudyScope, allCounts, countTotal, dayQueue, scopeCards } from '../core/study-queue';
import { StudyStore } from '../core/study-store';
import { PublicDeckNudge } from '../ui/public-deck-nudge';
import { nameCollator } from '../core/text';
import { pinningFor } from '../core/wall-physics';
import { ICON, ICON_CHOICE, IconModule } from '../ui/icons';
import { NearPool, NearScreen } from '../ui/near-screen';
import { Pin } from '../ui/pin';
import { SearchStrip } from '../ui/search-strip';
import { StudyCard } from '../ui/study-card';
import { StudyCardBack } from '../ui/study-card-back';
import { StudyCardFocus } from '../ui/study-card-focus';
import { StudyDeckSheet } from '../ui/study-deck-sheet';
import { StudySession } from '../ui/study-session';
import { StudyDrillPicker } from '../ui/study-drill-picker';
import type { DrillChoice } from '../ui/study-drill-picker';
import { MuralConfig } from '../ui/mural-config';
import { CardPicker } from '../ui/card-picker';
import { GroupMenu, backFromList } from '../ui/group-menu';
import { ContextMenu, ContextMenuTrigger, MENU_CLASS, MenuBy, MenuItem, MenuSections } from '../ui/context-menu';
import { RemoveAsking } from '../ui/remove-asking';
import { CategoryLabel } from '../ui/category-label';
import { TabFit } from '../ui/tab-fit';
import { TabMore, TabMoreItem } from '../ui/tab-more';
import { Toasts } from '../ui/toast';
import { NOTES } from '../core/kinds';

/** As ordens da parede do baralho. */
type SortId = 'proxima' | 'nivel' | 'entrada' | 'nome';

const SORTS: readonly { id: SortId; label: string }[] = [
  { id: 'proxima', label: 'Próxima revisão' },
  { id: 'nivel', label: 'Nível' },
  { id: 'entrada', label: 'Ordem de entrada' },
  { id: 'nome', label: 'De A a Z' },
];

/** Os tamanhos das cartas na parede do baralho, com os ícones das fichas simples e de "Só capa e nome". */
const CARD_SIZES: readonly { value: CardSize; label: string; icon: LucideIconData }[] = [
  { value: 'grandes', label: 'Flashcards grandes', icon: ICON.simples },
  { value: 'pequenas', label: 'Flashcards pequenos: mais flashcards na tela', icon: ICON.grade },
];

const LEVELS: readonly Level[] = ['desconhecida', 'nova', 'aprendendo', 'dominada'];
const LEVEL_PLURAL: Record<Level, string> = { desconhecida: 'Desconhecidos', nova: 'Novos', aprendendo: 'Aprendendo', dominada: 'Dominados' };

/** A carta como a parede mostra: a frente, a cartolina da anotação e a linha do pé. */
interface CardView {
  note: string;
  title: string;
  subtitle?: string;
  image?: string;
  stock: ReturnType<ReviewStore['notes']>[number]['stock'];
  level: Level;
  meta: string;
  /** O progresso, como a frente mostra no desenho do baralho. */
  face: CardFace;
  /** Num baralho público, a carta de anotação privada: só o dono vê (dito só ao leitor de tela: o cadeado na etiqueta saiu a pedido do dono). */
  mine: boolean;
  due: string;
  added: string;
  tilt: number;
}

/** Um baralho como a fileira e as pilhas mostram. */
interface DeckView {
  deck: Deck;
  cards: number;
  counts: QueueCounts;
  today: number;
  /** A carta de cima da pilha: a próxima do baralho (a que volta antes; sem nenhuma estudada, a primeira). */
  top: CardView | null;
  /** As cartolinas das cartas logo embaixo da de cima (até três): as costas da pilha, no desenho do baralho. */
  under: CardView['stock'][];
}

/** Um grupo das anotações como aba dos Estudos: os baralhos dele e quantas cartas para hoje. */
interface GroupTab {
  /** O id do grupo no endereço (`studyGroupId`). */
  id: string;
  /** A chave do grupo (a do quadro do Kanban). */
  key: string;
  label: string;
  look: CategoryLook;
  color: string | null;
  decks: DeckView[];
  /** As cartas dos baralhos do grupo (a de dois baralhos conta uma vez). */
  cards: number;
  /** Quantas anotações o grupo tem (as que podem virar carta). */
  notes: number;
  counts: QueueCounts;
  today: number;
}

const NO_COUNTS: QueueCounts = { novas: 0, aprender: 0, revisar: 0 };
/** O desenho de cada treino no remendo do Treinar. */
const DRILL_ICON: Record<DrillKind, LucideIconData> = {
  hoje: ICON.recomecar,
  vistos: ICON.historico,
  todos: ICON.camadas,
  novos: ICON.brilho,
  escolhidos: ICON.tarefas,
};

/** Quanto a carta pequena cresce ao virar: da miniatura ao tamanho das grandes (o --escala de study-page.scss). */
const SMALL_GROWS = 2.5;
/** A folga da carta pequena crescida até a beira da tela. */
const SCREEN_GAP = 8;
/** Nada virado. */
const NO_CARDS: ReadonlySet<string> = new Set();

/** O que o menu do botão direito tem aberto: um baralho (a pilha, ou o nome no alto do baralho aberto) ou um flashcard da parede. */
type MenuOn = { kind: 'baralho'; id: string; link: string | null } | { kind: 'grupo'; id: string; inMore: boolean } | { kind: 'carta'; note: string };

/** A chave do Tudo na régua das abas. */
const ALL_TAB = 'tudo';

/** O giro de cada carta na parede, do id: pequeno, como as fichas da Visão geral. */
function tiltOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 140) / 100 - 0.7) * 1.7;
}

/**
 * Os Estudos (`/anotacoes/estudos`, PLANO-ESTUDOS.md, seção 6, e PLANO-ESTUDOS-GRUPOS.md, seção 4): as
 * divisórias de manilha com Tudo e os grupos das anotações, as mesmas do mural e do Kanban (a ordem, o
 * "Mais", os escondidos e "Esconder os grupos vazios" da engrenagem do mural; aqui, vazio é sem baralho).
 * Num grupo (`/:grupo`), os baralhos dele como pilhas de cartas presas com um elástico; em Tudo, as pilhas
 * de todos, uma seção por grupo; num baralho (`/:grupo/:baralho`), a parede das cartas, a frente à mostra,
 * que viram ali mesmo com um toque (nada disso conta como estudo); o botão de maximizar abre a carta em foco, e
 * a folha da carta leva à anotação e ao editor. Estudar vale para o baralho, o grupo ou tudo.
 */
@Component({
  selector: 'app-study-page',
  imports: [CardPicker, CategoryLabel, ContextMenu, IconModule, NearScreen, NgTemplateOutlet, Pin, RouterLink, SearchStrip, StudyCard, StudyCardBack, StudyCardFocus, StudyDeckSheet, StudyDrillPicker, StudySession, MuralConfig, TabMore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-page.html',
  styleUrls: ['./study-page.scss', './study-page-flip.scss'],
  host: {
    '(document:click)': 'clickedAround($event)',
    '(document:keydown.escape)': 'escapeAround($event)',
    '(window:resize)': 'resized()',
  },
})
export class StudyPage {
  protected readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly publicDeckNudge = inject(PublicDeckNudge);
  private readonly kanban = inject(KanbanStore);
  private readonly settings = inject(Settings);
  private readonly wallView = inject(WallView);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly removal = inject(RemoveAsking);

  protected readonly AllIcon = ICON.camadas;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly EditIcon = ICON.editar;
  protected readonly AdjustIcon = ICON.ajustar;
  protected readonly MaximizeIcon = ICON.aumentar;
  protected readonly ReadIcon = ICON.livros;
  protected readonly PlayIcon = ICON.estudar;
  protected readonly TrainIcon = ICON.alvo;
  protected readonly GearIcon = ICON.configurar;
  /** A anotação (a lupa se confundia com a busca, que é logo embaixo). */
  protected readonly BringIcon = ICON.anotacoes;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly BackIcon = ICON.voltar;
  /** O baralho público: as pessoas do "Público" do editor da anotação. */
  protected readonly PublicIcon = ICON.pessoas;
  protected readonly tabKey = tabKeyOf;
  protected readonly allTab = ALL_TAB;
  protected readonly notesKind = NOTES;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly sorts = SORTS;
  protected readonly cardSizes = CARD_SIZES;
  protected readonly levels = LEVELS;
  protected readonly levelPlural = LEVEL_PLURAL;
  protected readonly nameMax = DECK_NAME_MAX;
  protected readonly studyPath = studyPath;

  /** O grupo e o baralho do endereço. */
  private readonly params = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => ({ group: p.get('grupo'), deck: p.get('baralho') }))), {
    initialValue: { group: null, deck: null },
  });
  /** O grupo aberto (null: Tudo, ou um que não existe mais). */
  protected readonly group = computed(() => {
    const id = this.params().group;
    return (id && this.groups().find((g) => g.id === id)) || null;
  });
  /** O baralho aberto, do grupo aberto (null: o grupo, ou Tudo). */
  protected readonly deck = computed(() => {
    const id = this.params().deck;
    const g = this.group();
    const d = id && g ? this.study.deck(id) : undefined;
    return d && inGroup(d, g!.label) ? d : null;
  });
  /** O grupo aberto que o mural também tem (com anotação): o nome, comparado pelo texto. */
  private readonly wallLabel = computed(() => {
    const g = this.group();
    return g && g.notes ? g.label : null;
  });
  /** O que o Estudar estuda aqui: o baralho, os baralhos do grupo, ou todos. */
  private readonly scope = computed<StudyScope>(() => this.deck()?.id ?? this.group()?.decks.map((v) => v.deck.id) ?? undefined);

  /** Agora, de minuto em minuto (o relógio dos Estudos, que a barra também lê). */
  protected readonly now = this.study.now;
  /** A página saiu (a navegação para outro baralho pode reaproveitá-la ou trocar por outra). */
  private gone = false;

  protected readonly query = signal('');
  protected readonly level = signal<Level | ''>('');
  protected readonly sort = signal<SortId>('proxima');
  /** O tamanho das cartas na parede do baralho, lembrado neste aparelho (vale para todos os baralhos). */
  protected readonly cardSize = signal<CardSize>(readText(STUDY_SIZE_KEY) === 'pequenas' ? 'pequenas' : 'grandes');
  /** O que os campos impressos da pasta dizem: o nível e a ordem escolhidos. */
  protected readonly levelLabel = computed(() => {
    const l = this.level();
    return l ? LEVEL_PLURAL[l] : 'Todos';
  });
  protected readonly sortLabel = computed(() => SORTS.find((s) => s.id === this.sort())!.label);
  /** A folha do baralho aberta (`fresh`: acabou de nascer, o nome vem selecionado). */
  protected readonly sheet = signal<{ id: string; fresh: boolean } | null>(null);
  /** A sessão de estudo aberta: de um baralho, de um grupo (o nome), ou de todos (os dois null); com `drill`, o treino. */
  protected readonly session = signal<{ deck: string | null; group?: string | null; drill?: DrillPlan } | null>(null);
  /** O "Escolher quais" do Treinar aberto. */
  protected readonly choosing = signal(false);
  /** A folha das configurações dos Estudos aberta. */
  protected readonly config = signal(false);
  /** As configurações abertas pelo "Ajustes do grupo" do menu de uma aba: as do mural, já no grupo. */
  protected readonly configGroup = signal<string | null>(null);
  private readonly groupMenu = inject(GroupMenu);
  private readonly injector = inject(Injector);
  /** Quantos flashcards cada treino traria aqui (no baralho, no grupo ou em todos). */
  protected readonly drillCounts = computed(() => countDrills(this.study.view(), this.now(), this.scope(), this.study.live));
  /** O remendo do Treinar (o do baralho, do grupo ou de tudo), que o menu de um baralho também abre. */
  private readonly trainMore = viewChild<TabMore>('treino');
  /** O "Treinar" do menu de um baralho de fora: o baralho abre com o remendo do Treinar aberto. */
  private readonly trainAsked = signal(false);
  /**
   * O remendo do Treinar: os tipos de treino com algum flashcard, cada um com quantos traria (o "Escolher
   * quais" escolhe entre todos, sem número).
   */
  protected readonly drillItems = computed<TabMoreItem[]>(() => {
    const n = this.drillCounts();
    return DRILL_KINDS.filter((k) => n[k] > 0).map((k) =>
      k === 'escolhidos'
        ? { key: k, label: DRILL_LABEL[k], n: 0, look: {}, glyph: DRILL_ICON[k], say: '', quiet: true }
        : { key: k, label: DRILL_LABEL[k], n: n[k], look: {}, glyph: DRILL_ICON[k], say: n[k] === 1 ? '1 flashcard' : `${n[k]} flashcards` },
    );
  });
  /** Os flashcards para o "Escolher quais": todos os do que se treina, com o nível (e o baralho, juntando vários). */
  protected readonly drillChoices = computed<DrillChoice[]>(() => {
    const byId = this.notesById();
    const many = !this.deck();
    return scopeCards(this.study.view(), this.scope(), this.study.live).flatMap(({ card, deck }) => {
      const note = byId.get(card.note);
      if (!note) return [];
      const level = LEVEL_LABEL[levelOf(card.srs)];
      return [{ note: card.note, title: frontTitle(card, note.game.name), subtitle: card.front.subtitle, meta: many ? `${level} · ${deck.name}` : level, stock: pinningFor(note.id, note.stock).stock, icon: deck.icon ? ICON_CHOICE[deck.icon] : null }];
    });
  });
  /** Onde se treina, na frase do "Escolher quais". */
  protected readonly drillPlace = computed(() => this.deck()?.name ?? this.group()?.label ?? 'todos os baralhos');
  /** A carta maximizada (o id da anotação). */
  protected readonly focused = signal<string | null>(null);
  /** As cartas com o verso à mostra na parede. Fica só na memória da página: virar não é estudar, e nada se guarda. */
  protected readonly flipped = signal<ReadonlySet<string>>(NO_CARDS);
  /** As cartas já viradas neste baralho: o verso delas fica montado, para o giro de volta. */
  protected readonly turnedOnce = signal<ReadonlySet<string>>(NO_CARDS);
  /** O que a voz do leitor de tela diz ao virar. */
  protected readonly spoken = signal('');
  protected readonly calm = reducedMotion();
  /** O seletor de fichas do "Trazer anotações" aberto. */
  protected readonly picking = signal(false);
  /** O menu do botão direito (ui/context-menu.ts): o que ele tem aberto. */
  protected readonly menuOn = signal<MenuOn | null>(null);
  private readonly menu = viewChild<ContextMenu>('menu');
  /** O nome no alto do menu: o do baralho, ou a frente do flashcard. */
  protected readonly menuCaption = computed(() => {
    const m = this.menuOn();
    if (!m) return '';
    if (m.kind === 'baralho') return this.study.deck(m.id)?.name ?? '';
    if (m.kind === 'grupo') return this.groups().find((g) => g.id === m.id)?.label ?? '';
    // a frente pode ser um kanji só: o baralho junto diz de onde ele é
    const title = this.cards().find((c) => c.note === m.note)?.title ?? '';
    return title && `${title} · ${this.deck()?.name ?? ''}`;
  });
  /** As opções do menu aberto, só as que valem agora. */
  protected readonly menuSections = computed<MenuSections>(() => {
    const m = this.menuOn();
    if (!m) return [];
    return m.kind === 'baralho' ? this.deckMenu(m.id, m.link) : m.kind === 'grupo' ? this.groupMenuOf(m.id, m.inMore) : this.cardMenu(m.note);
  });
  /** O nome do primeiro baralho, na cartolina da primeira vez. */
  protected readonly firstName = signal('');
  /** O grupo do primeiro baralho de todos (a cartolina de Tudo, sem baralho nenhum); '' é o de sempre. */
  protected readonly firstGroup = signal('');

  private readonly notesById = computed(() => new Map(this.store.notes().map((n) => [n.id, n])));
  private readonly counts = computed(() => allCounts(this.study.view(), this.now(), this.study.live));
  /** O número de cada carta em cada baralho, na ordem em que entrou (o Nº do Ingresso, da Faixa…). */
  private readonly numbers = computed(() => {
    const out = new Map<string, Map<string, number>>();
    const cards = [...this.study.cards()].sort((a, b) => a.added.localeCompare(b.added));
    for (const c of cards) {
      for (const d of c.decks) {
        const m = out.get(d) ?? new Map<string, number>();
        m.set(c.note, m.size + 1);
        out.set(d, m);
      }
    }
    return out;
  });

  protected readonly decks = computed<DeckView[]>(() => {
    const { byDeck } = this.counts();
    const now = this.now();
    const byId = this.notesById();
    const next = this.byNext();
    return this.study.decks().map((deck) => {
      const counts = byDeck.get(deck.id) ?? { novas: 0, aprender: 0, revisar: 0 };
      const views: CardView[] = [];
      for (const c of this.study.cards()) {
        const note = byId.get(c.note);
        if (note && c.decks.includes(deck.id)) views.push(this.view(c, deck.id, note.game.name, pinningFor(note.id, note.stock).stock, now));
      }
      views.sort(next);
      return { deck, cards: views.length, counts, today: countTotal(counts), top: views[0] ?? null, under: views.slice(1, 4).map((v) => v.stock) };
    });
  });

  /**
   * As abas: os grupos das anotações (os do quadro do Kanban) e os de algum baralho cujo grupo não tem
   * anotação à mostra, cada um com os baralhos dele, na ordem das abas do mural (a montada à mão, ou da
   * maior para a menor): as configurações dos grupos valem nos três.
   */
  protected readonly groups = computed<GroupTab[]>(() => {
    const looks = this.settings.categoryLooks();
    const labels = new Map<string, string>();
    const notes = new Map<string, number>();
    for (const c of this.kanban.categories()) {
      labels.set(c.key, c.label);
      notes.set(c.key, c.notes);
    }
    for (const d of this.study.decks()) if (d.group && !labels.has(groupKey(d.group))) labels.set(groupKey(d.group), d.group);
    const views = this.decks();
    const st = this.study.view();
    const now = this.now();
    const list = [...labels].map(([key, label]): GroupTab => {
      const decks = views.filter((v) => inGroup(v.deck, label));
      const ids = new Set(decks.map((v) => v.deck.id));
      const counts = decks.length ? dayQueue(st, now, [...ids], this.study.live).counts : NO_COUNTS;
      const cards = st.cards.filter((c) => this.study.live(c.note) && c.decks.some((d) => ids.has(d))).length;
      const look = looks[key] ?? {};
      return { id: studyGroupId(label), key, label, look, color: categoryColorHex(look.color), decks, cards, notes: notes.get(key) ?? 0, counts, today: countTotal(counts) };
    });
    const at = new Map(this.wallTabs().map((t, i) => [t.key, i]));
    const place = (g: GroupTab) => at.get(tabKeyOf(g.key)) ?? Number.MAX_SAFE_INTEGER;
    return list.sort((a, b) => place(a) - place(b));
  });
  /** As abas do mural de anotações (as dos grupos), pela chave da régua. */
  private readonly wallTabs = computed<NoteTab[]>(() => {
    const t = this.wallView.notes() ? this.wallView.noteTabs() : null;
    return (t?.tabs ?? []).filter((x) => x.key.startsWith('c:')).map((x) => ({ ...x, key: tabKeyOf(x.key.slice(2)) }));
  });
  /** Os grupos sem baralho (pela chave da régua), com "Esconder os grupos vazios" ligado; senão, nenhum. */
  private readonly emptyGroups = computed<ReadonlySet<string>>(
    () => (this.wallView.hideEmpty() ? new Set(this.groups().flatMap((g) => (g.decks.length ? [] : [tabKeyOf(g.key)]))) : NO_TABS),
    { equal: sameTabs },
  );
  /**
   * Quais abas ficam em pé e quais vão para o "Mais", com a régua das abas do mural e do Kanban (ver
   * ui/tab-fit.ts): o Tudo sempre na frente, os grupos escondidos e os vazios no "Mais" (menos o aberto).
   */
  private readonly fit = new TabFit({
    host: this.host,
    row: '.abas-grupos .abas:not(.medida)',
    tabs: () => {
      const weight = new Map(this.wallTabs().map((t) => [t.key, t]));
      return this.groups().map((g) => {
        const w = weight.get(tabKeyOf(g.key));
        return { key: tabKeyOf(g.key), label: g.label, n: w?.n ?? g.decks.length, total: w?.total ?? g.decks.length };
      });
    },
    active: () => (this.group() ? tabKeyOf(this.group()!.key) : ALL_TAB),
    ordered: () => !!this.wallView.categoryOrder(),
    hidden: () => tabsToMore(this.wallView.hiddenTabs(), this.emptyGroups(), this.group() ? tabKeyOf(this.group()!.key) : ''),
    lead: () => [ALL_TAB],
  });
  protected readonly shownTabs = computed(() => {
    const keys = new Set(this.fit.layout().shown.map((t) => t.key));
    return this.groups().filter((g) => keys.has(tabKeyOf(g.key)));
  });
  protected readonly moreTabs = computed(() => {
    const keys = new Set(this.fit.layout().more.map((t) => t.key));
    return this.groups().filter((g) => keys.has(tabKeyOf(g.key)));
  });
  /** O "Mais": cada grupo com quantas para hoje (o sem baralho, sem número: um 0 não diria nada). */
  protected readonly moreItems = computed<TabMoreItem[]>(() =>
    this.moreTabs().map((g) => ({ key: g.id, label: g.label, n: g.today, look: g.look, say: g.decks.length ? `${g.today} para hoje` : 'sem baralho', quiet: !g.decks.length })),
  );
  /**
   * O Novo baralho de Tudo: os grupos, na ordem das abas, só com o desenho e o nome. Todos, até os sem
   * baralho e os escondidos: é neles que o botão mais faz falta (a chave é o nome, que o newDeck recebe).
   */
  protected readonly newDeckItems = computed<TabMoreItem[]>(() => this.groups().map((g) => ({ key: g.label, label: g.label, n: 0, look: g.look, say: '', quiet: true })));
  /** O grupo aberto é um dos do "Mais": ele mostra o nome dele, como aba aberta. */
  protected readonly moreOn = computed(() => this.moreTabs().find((g) => g.id === this.group()?.id) ?? null);
  /** Os grupos com baralho, para as seções de Tudo. */
  protected readonly filled = computed(() => this.groups().filter((g) => g.decks.length));
  /** O grupo do primeiro baralho de todos: o escolhido, ou o de sempre. */
  protected readonly firstGroupValue = computed(() => this.firstGroup() || this.study.fallbackGroup());
  /** Os grupos para escolher na cartolina da primeira vez (sem nenhum, o de sempre). */
  protected readonly firstGroups = computed(() => {
    const labels = this.groups().map((g) => g.label);
    const fallback = this.study.fallbackGroup();
    return labels.some((l) => groupKey(l) === groupKey(fallback)) ? labels : [fallback, ...labels];
  });

  /** Abre o grupo escolhido no "Mais". */
  protected openGroup(id: string): void {
    if (id && id !== this.group()?.id) void this.router.navigateByUrl(studyPath(id));
  }

  /** O endereço de um baralho, no grupo dele. */
  protected deckPath(d: Deck): string {
    return d.group ? studyPath(studyGroupId(d.group), d.id) : studyPath();
  }

  /** Os números da linha de estudo: os do baralho aberto, do grupo aberto, ou os de todos (sem contar duas vezes). */
  protected readonly line = computed<QueueCounts>(() => {
    const d = this.deck();
    if (d) return this.counts().byDeck.get(d.id) ?? NO_COUNTS;
    return this.group()?.counts ?? this.counts().total;
  });
  protected readonly lineTotal = computed(() => countTotal(this.line()));

  /** Sem nada para hoje: quando é a próxima revisão (no baralho, no grupo ou em todos) e quantas cartas vencem nela. */
  protected readonly next = computed(() => {
    const scope = this.scope();
    const ids = scope === undefined ? null : typeof scope === 'string' ? [scope] : scope;
    const today = studyDay(this.now());
    let day: string | null = null;
    let n = 0;
    for (const c of this.study.cards()) {
      if (c.srs.state !== 'revisao' || !this.study.live(c.note)) continue;
      if (ids ? !c.decks.some((d) => ids.includes(d)) : !c.decks.length) continue;
      const due = studyDay(new Date(c.srs.due));
      if (due <= today) continue;
      if (!day || due < day) {
        day = due;
        n = 1;
      } else if (due === day) n++;
    }
    if (!day) return null;
    const gap = daysBetween(today, day);
    return { when: gap === 1 ? 'amanhã' : `em ${gap} dias`, n };
  });

  /** As cartas do baralho aberto, como a parede mostra (filtradas e na ordem escolhida). */
  protected readonly cards = computed<CardView[]>(() => {
    const d = this.deck();
    if (!d) return [];
    const now = this.now();
    const byId = this.notesById();
    const q = this.query().trim().toLocaleLowerCase('pt-BR');
    const lv = this.level();
    const out: CardView[] = [];
    for (const c of this.study.cards()) {
      const note = byId.get(c.note);
      if (!note || !c.decks.includes(d.id)) continue;
      const view = { ...this.view(c, d.id, note.game.name, pinningFor(note.id, note.stock).stock, now), mine: !!d.public && !!note.private };
      if (lv && view.level !== lv) continue;
      if (q && ![view.title, note.game.name, view.subtitle ?? ''].some((s) => s.toLocaleLowerCase('pt-BR').includes(q))) continue;
      out.push(view);
    }
    return out.sort(this.comparer());
  });

  /** Quantas cartas o baralho aberto tem, sem filtro (para saber se está vazio ou se o filtro esconde). */
  protected readonly deckSize = computed(() => {
    const d = this.deck();
    return d ? this.study.cards().filter((c) => c.decks.includes(d.id) && this.study.live(c.note)).length : 0;
  });

  constructor() {
    // outra ordem, outro filtro, outro tamanho: o que está na tela é montado antes da pintura, sem passar
    // por uma tela de vagas (ver ui/near-screen.ts)
    const nearPool = inject(NearPool);
    afterRenderEffect(() => {
      this.cards();
      this.cardSize();
      nearPool.settle();
      // a carta pequena crescida pode ter mudado de casa (a ordem, o filtro)
      this.resized();
    });
    // o "+ Novo baralho" abre nele com a folha aberta, e o "Trazer anotações" do menu de um baralho, com o
    // seletor: a página é outra depois da navegação (são duas rotas)
    const state = this.router.getCurrentNavigation()?.extras.state as { folha?: string; trazer?: boolean; treinar?: boolean } | undefined;
    if (state?.folha) this.sheet.set({ id: state.folha, fresh: true });
    if (state?.trazer) this.picking.set(true);
    if (state?.treinar) this.trainAsked.set(true);
    // o pedido vale uma vez, no baralho aberto: com o remendo à mostra, abre; sem treino nenhum ali, esquece
    afterRenderEffect(() => {
      // (no baralho aberto, ou na pasta do grupo pelo menu da aba dele)
      if (!this.trainAsked() || !(this.deck() || this.group())) return;
      const more = this.trainMore();
      untracked(() => {
        this.trainAsked.set(false);
        more?.show();
      });
    });
    // o botão direito, o dedo segurado ou Shift+F10 num baralho (a pilha, ou o nome no alto dele aberto) ou
    // num flashcard da parede abre o menu dele
    new ContextMenuTrigger({
      host: this.host,
      // e as abas dos grupos (e as linhas do "Mais" delas): o menu do grupo, o mesmo do mural e do Kanban
      targets: '[data-baralho], [data-carta], .abas-grupos .abas:not(.medida) .aba[data-grupo], .abas-grupos app-tab-more .opcao[data-k]',
      keyOf: (box) => {
        const group = box.dataset['grupo'] ?? (box.matches('.opcao') ? box.dataset['k'] : undefined);
        if (group !== undefined) return this.groups().some((g) => g.id === group) ? `grupo:${group}` : null;
        const deck = box.dataset['baralho'];
        if (deck) return this.study.deck(deck) ? `baralho:${deck}` : null;
        const note = box.dataset['carta'];
        return note && this.study.cardOf().has(note) ? `carta:${note}` : null;
      },
      hold: true,
      isOpenFor: (key) => !!this.menu()?.isOpenFor(key),
      open: (key, box, x, y, by) => this.openMenu(key, box, x, y, by),
    });
    // o endereço de antes dos grupos (/estudos/:baralho) leva ao baralho no grupo dele; um grupo (ou um
    // baralho) que não existe mais, ao que sobrou. Espera a conversão dos baralhos de antes terminar.
    effect(() => {
      const { group, deck } = this.params();
      if (!group || this.study.decks().some((d) => !d.group)) return;
      const g = this.group();
      const d = this.deck();
      untracked(() => {
        const old = !deck ? this.study.deck(group) : undefined;
        const to = old ? this.deckPath(old) : !g ? studyPath() : deck && !d ? studyPath(g.id) : null;
        if (to) void this.router.navigateByUrl(to, { replaceUrl: true, state: this.router.getCurrentNavigation()?.extras.state });
      });
    });
    // outro baralho (o mesmo, com outro nome ou vindo de outro aparelho, não conta): a parede começa de novo
    // com as frentes à mostra, e a carta maximizada, que era do outro, fecha
    const deckId = computed(() => this.deck()?.id);
    effect(() => {
      deckId();
      untracked(() => {
        this.flipped.set(NO_CARDS);
        this.turnedOnce.set(NO_CARDS);
        this.focused.set(null);
      });
    });
    // o grupo aberto aqui fica aberto no mural também (como o do quadro do Kanban): só quando ele muda (as
    // contas refazem o grupo a cada minuto) e só se o mural tem a aba dele (o grupo só com baralho, sem
    // anotação, não tem)
    effect(() => {
      const label = this.wallLabel();
      if (label) untracked(() => this.wallView.openGroup(label));
    });
    this.study.tick();
    const timer = setInterval(() => this.study.tick(), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.gone = true;
    });
  }

  private view(c: Card, deck: string, noteTitle: string, stock: CardView['stock'], now: Date): CardView {
    const level = levelOf(c.srs);
    const meta = level === 'desconhecida' ? LEVEL_LABEL[level] : `${LEVEL_LABEL[level]} · ${whenLabel(c.srs, now)}`;
    return {
      note: c.note,
      title: frontTitle(c, noteTitle),
      subtitle: c.front.subtitle,
      image: c.front.image,
      stock,
      level,
      meta,
      face: cardFace(c, now, this.numbers().get(deck)?.get(c.note)),
      mine: false,
      due: c.srs.due,
      added: c.added,
      tilt: tiltOf(c.note),
    };
  }

  /** A que volta antes primeiro; as nunca estudadas no fim, na ordem em que entraram. */
  private byNext(): (a: CardView, b: CardView) => number {
    const byName = (a: CardView, b: CardView) => nameCollator.compare(a.title, b.title);
    return (a, b) => {
      const na = a.level === 'desconhecida';
      const nb = b.level === 'desconhecida';
      if (na !== nb) return na ? 1 : -1;
      return na ? a.added.localeCompare(b.added) : a.due.localeCompare(b.due) || byName(a, b);
    };
  }

  private comparer(): (a: CardView, b: CardView) => number {
    const byName = (a: CardView, b: CardView) => nameCollator.compare(a.title, b.title);
    switch (this.sort()) {
      case 'nivel':
        return (a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.due.localeCompare(b.due) || byName(a, b);
      case 'entrada':
        return (a, b) => a.added.localeCompare(b.added) || byName(a, b);
      case 'nome':
        return byName;
      default:
        return this.byNext();
    }
  }

  /** As anotações que já são cartas do baralho aberto (ficam fora do "Trazer anotações"). */
  protected readonly inDeck = computed(() => {
    const d = this.deck();
    return d ? this.study.cards().filter((c) => c.decks.includes(d.id)).map((c) => c.note) : [];
  });

  /** O grupo do baralho como o seletor de anotações filtra (a chave do quadro do Kanban). */
  protected groupOfDeck(d: Deck): string | null {
    return groupKey(d.group) || null;
  }

  /** "Nova carta": o editor de uma anotação nova, já na aba Flashcard, com este baralho (e no grupo dele). */
  protected newCard(deck: string): void {
    this.study.pending.set({ decks: [deck] });
    const group = this.study.deck(deck)?.group;
    if (group) this.desk.newNoteIn(group);
    else this.desk.newNote('');
  }

  /**
   * "Trazer anotações": a anotação escolhida vira carta deste baralho, com a frente do nome dela; ela já
   * estava no mural e continua lá (D4).
   */
  protected bring(note: string, deck: string): void {
    const had = this.study.cardOf().get(note);
    const before = had?.decks ?? [];
    if (had) this.study.setDecks(note, [...had.decks, deck]);
    else this.study.addCard(note, [deck], {}, true);
    // só as anotações do grupo do baralho podem entrar nele (o seletor só mostra essas)
    if (!this.study.cardOf().get(note)?.decks.includes(deck)) return;
    if (this.publicDeckNudge.afterEntering(note, before)) return;
    const name = this.store.get(note)?.game.name ?? '';
    this.toasts.show(`“${name}” virou flashcard de ${this.study.deck(deck)?.name ?? ''}`);
  }

  /** Os ajustes da carta: o editor da anotação, na aba Flashcard. */
  protected edit(note: string): void {
    this.desk.editReview(note, 'flashcard');
  }

  /** Troca o tamanho das cartas e guarda neste aparelho. As cartas voltam para a frente: a pequena virada é só uma. */
  protected setCardSize(size: CardSize): void {
    if (size !== this.cardSize()) this.flipped.set(NO_CARDS);
    this.cardSize.set(size);
    writeText(STUDY_SIZE_KEY, size);
  }

  /** Ler a anotação da carta: a anotação como no mural, com o Editar e tudo. */
  protected open(note: string): void {
    this.desk.openReview(note);
  }

  /**
   * Tocou na carta: ela vira ali mesmo. Nada conta como estudo. Das grandes, várias ficam viradas, como cartas
   * na mesa; das pequenas, que crescem por cima das vizinhas, uma de cada vez.
   */
  protected flip(note: string, li: HTMLElement): void {
    const small = this.cardSize() === 'pequenas';
    const back = !this.flipped().has(note);
    if (back && small) this.keepOnScreen(li);
    if (!back) this.keepFocus(li);
    this.flipped.update((set) => {
      const next = new Set(small ? [] : set);
      if (back) next.add(note);
      else next.delete(note);
      return next;
    });
    if (back && !this.turnedOnce().has(note)) this.turnedOnce.update((set) => new Set(set).add(note));
    this.say(back ? 'Verso' : 'Frente', note);
  }

  /** O Esc com o foco na carta virada: ela volta para a frente, e o de fora não mexe em mais nenhuma. */
  protected unflip(note: string, li: HTMLElement, e: Event): void {
    if (!this.flipped().has(note)) return;
    e.stopPropagation();
    this.keepFocus(li);
    this.turnBack(note);
  }

  /**
   * O Esc com o foco em outro lugar: a carta pequena crescida volta (ela cobre as vizinhas, e o foco pode nem
   * estar nela). As grandes não cobrem nada: só voltam com o Esc nelas. Os diálogos e os campos têm o Esc deles.
   */
  protected escapeAround(e: Event): void {
    const grown = this.cardSize() === 'pequenas' ? [...this.flipped()][0] : undefined;
    if (!grown || document.querySelector('dialog:modal')) return;
    // (o Esc do menu do botão direito fecha só o menu)
    if (e.target instanceof Element && e.target.closest(`input, textarea, select, app-tab-more, .${MENU_CLASS}`)) return;
    this.turnBack(grown);
  }

  /**
   * A carta pequena crescida fecha com um toque fora dela (na outra carta, é o toque dela que troca; no menu
   * do botão direito, é a escolha que decide).
   */
  protected clickedAround(e: Event): void {
    const grown = this.cardSize() === 'pequenas' ? [...this.flipped()][0] : undefined;
    if (!grown || (e.target instanceof Element && e.target.closest(`.carta-li.virada, .carta-btn, dialog, .${MENU_CLASS}`))) return;
    this.turnBack(grown);
  }

  /** A janela mudou: a carta pequena crescida é empurrada de novo, para continuar dentro da tela. */
  protected resized(): void {
    const li = this.cardSize() === 'pequenas' ? this.host.querySelector<HTMLElement>('.carta-li.virada') : null;
    if (li) this.keepOnScreen(li);
  }

  private turnBack(note: string): void {
    this.flipped.update((set) => {
      const next = new Set(set);
      next.delete(note);
      return next;
    });
    this.say('Frente', note);
  }

  private say(side: 'Frente' | 'Verso', note: string): void {
    this.spoken.set(`${side} de ${this.cards().find((c) => c.note === note)?.title ?? 'flashcard'}`);
  }

  /** O foco dentro do verso que vai ficar de costas cairia na página: passa para a carta. */
  private keepFocus(li: HTMLElement): void {
    const at = document.activeElement;
    if (at?.closest('.verso') && li.contains(at)) li.querySelector<HTMLElement>('.carta-btn')?.focus({ preventScroll: true });
  }

  /**
   * A carta pequena cresce em volta do meio dela, e o giro a empurra daí: para baixo, com o topo na linha da
   * miniatura (sem cobrir a régua em cima), e para dentro, se passar da beira da tela.
   */
  private keepOnScreen(li: HTMLElement): void {
    const box = li.getBoundingClientRect();
    const view = document.documentElement;
    const push = (size: number, centered: number, wanted: number, screen: number): number => {
      const grown = size * SMALL_GROWS;
      const at = Math.max(SCREEN_GAP, Math.min(wanted, screen - SCREEN_GAP - grown));
      return Math.round(at - (centered - grown / 2));
    };
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    li.style.setProperty('--empurra-x', `${push(box.width, x, x - (box.width * SMALL_GROWS) / 2, view.clientWidth)}px`);
    li.style.setProperty('--empurra-y', `${push(box.height, y, box.top, view.clientHeight)}px`);
  }

  /** Uma cor ainda sem baralho (ou a do primeiro, se todas já têm). */
  private freeColor(): LightStock {
    const used = new Set(this.study.decks().map((d) => d.color));
    return LIGHT_STOCKS.find((s) => !used.has(s) && s !== 'branco') ?? 'amarelo';
  }

  /** Um tipo de treino escolhido no remendo do Treinar: abre a mesa (ou, em "Escolher quais", a lista). */
  protected train(kind: string): void {
    if (kind === 'escolhidos') {
      this.choosing.set(true);
      return;
    }
    this.startDrill(kind as DrillKind);
  }

  /** A mesa do treino, com as cartas desse tipo no que se estuda aqui (o baralho, o grupo ou tudo). */
  protected startDrill(kind: DrillKind, chosen: readonly string[] = []): void {
    // o mesmo relógio das contas do remendo: o que ele prometeu é o que vem (na virada do dia, às 4h, também)
    const items = drillPool(this.study.view(), this.now(), this.scope(), kind, this.study.live, chosen);
    if (!items.length) return;
    this.session.set({ deck: this.deck()?.id ?? null, group: this.deck() ? null : (this.group()?.label ?? null), drill: { kind, items } });
  }

  /**
   * "Novo baralho", na pasta do grupo: nasce no grupo aberto, com um nome que ainda não existe e uma cor
   * livre, e a folha abre com o nome para escrever por cima. A página do baralho é outra rota, e abre a
   * folha pelo pedido da navegação; se for a mesma página, abre aqui.
   */
  protected newDeck(group = this.group()?.label): void {
    if (!group?.trim()) return;
    const names = new Set(this.study.decks().map((d) => d.name));
    let n = this.study.decks().length + 1;
    while (names.has(`Baralho ${n}`)) n++;
    const id = this.study.addDeck(`Baralho ${n}`, this.freeColor(), null, undefined, group);
    if (!id) return;
    void this.router.navigateByUrl(studyPath(studyGroupId(group), id), { state: { folha: id } }).then(() => {
      if (!this.gone) this.sheet.set({ id, fresh: true });
    });
  }

  /** A cartolina do primeiro baralho (de um grupo, ou de todos, com o grupo escolhido): o baralho com o nome escrito. */
  protected createFirst(group: string): void {
    const name = this.firstName().trim();
    if (!name || !group.trim()) return;
    const id = this.study.addDeck(name, this.freeColor(), null, undefined, group);
    if (!id) return;
    this.firstName.set('');
    this.firstGroup.set('');
    void this.router.navigateByUrl(studyPath(studyGroupId(group), id));
  }

  /** Abre o menu do baralho ou do flashcard; o foco volta para o botão dele ao fechar. */
  private openMenu(key: string, box: HTMLElement, x: number, y: number, by: MenuBy): void {
    const id = key.slice(key.indexOf(':') + 1);
    const deck = key.startsWith('baralho:');
    if (key.startsWith('grupo:')) {
      this.menuOn.set({ kind: 'grupo', id, inMore: box.matches('.opcao') });
      this.menu()?.show({ key, x, y, by, back: backFromList(box) });
      return;
    }
    this.menuOn.set(deck ? { kind: 'baralho', id, link: box instanceof HTMLAnchorElement ? box.href : null } : { kind: 'carta', note: id });
    // a pilha é o próprio link; o alto do baralho aberto, o lápis dele; o flashcard, o botão de virar
    const back = deck ? (box instanceof HTMLAnchorElement ? box : box.querySelector<HTMLElement>('.ajustes-baralho')) : box.querySelector<HTMLElement>('.carta-btn');
    this.menu()?.show({ key, x, y, by, back: back ?? null });
  }

  /** Depois de a fileira das abas mudar: o foco no primeiro que existir (a aba de volta, ou o "Mais"). */
  private focusTabAfter(...selectors: string[]): void {
    afterNextRender(() => selectors.map((s) => this.host.querySelector<HTMLElement>(s)).find((el) => !!el)?.focus(), { injector: this.injector });
  }

  /**
   * O menu de um grupo (ui/group-menu.ts), com o que só os Flashcards têm: estudar as dele para hoje e um
   * baralho novo nele. Os ajustes abrem as configurações do mural (não as dos estudos) já no grupo.
   */
  private groupMenuOf(id: string, inMore: boolean): MenuSections {
    const g = this.groups().find((x) => x.id === id);
    if (!g) return [];
    const lead: MenuItem[] = [];
    if (g.today) lead.push({ id: 'estudar', label: 'Estudar', icon: ICON.estudar, dialog: true, count: { n: g.today, say: 'para hoje' }, run: () => this.session.set({ deck: null, group: g.label }) });
    // sem nada para hoje, é o Treinar que sobra (como na pasta do grupo)
    const drills = countDrills(this.study.view(), this.now(), g.decks.map((v) => v.deck.id), this.study.live);
    if (g.decks.length && DRILL_KINDS.some((k) => drills[k] > 0)) {
      lead.push({ id: 'treinar', label: 'Treinar', icon: ICON.alvo, hint: 'Passar os flashcards de novo, sem contar no progresso', run: () => this.trainGroup(g.id) });
    }
    lead.push({ id: 'novo-baralho', label: 'Novo baralho', icon: ICON.adicionar, dialog: true, hint: `Um baralho já em ${g.label}`, run: () => this.newDeck(g.label) });
    return this.groupMenu.sections({
      label: g.label,
      here: 'flashcards',
      path: studyPath(g.id),
      inMore,
      lead,
      adjust: () => {
        this.configGroup.set(g.label);
        this.config.set(true);
      },
      // a aba saiu da fileira: o foco vai para o "Mais", onde ela está agora
      hidden: () => this.focusTabAfter('.abas-grupos app-tab-more button'),
      shown: () => this.focusTabAfter(`.abas-grupos .abas:not(.medida) .aba[data-grupo="${CSS.escape(g.id)}"]`, '.abas-grupos app-tab-more button'),
    });
  }

  /**
   * O menu de um baralho: abrir (e numa aba nova, como no link), estudar, pôr flashcards, os ajustes e, no
   * fim, apagar. No próprio baralho aberto, sem o abrir.
   */
  private deckMenu(id: string, link: string | null): MenuSections {
    const d = this.study.deck(id);
    if (!d) return [];
    const open: MenuItem[] = [];
    if (this.deck()?.id !== id) {
      open.push({ id: 'abrir', label: 'Abrir', icon: ICON.ir, run: () => void this.router.navigateByUrl(this.deckPath(d)) });
      if (link) open.push({ id: 'aba', label: 'Abrir em outra aba', icon: ICON.abrirFora, run: () => void window.open(link, '_blank', 'noopener') });
    }
    const today = countTotal(this.counts().byDeck.get(id) ?? NO_COUNTS);
    const work: MenuItem[] = [];
    if (today) work.push({ id: 'estudar', label: 'Estudar', icon: ICON.estudar, dialog: true, count: { n: today, say: 'para hoje' }, run: () => this.session.set({ deck: id }) });
    // sem nada para hoje, é o Treinar que sobra (como na pasta do baralho)
    const drills = countDrills(this.study.view(), this.now(), id, this.study.live);
    if (DRILL_KINDS.some((k) => drills[k] > 0)) {
      work.push({ id: 'treinar', label: 'Treinar', icon: ICON.alvo, hint: 'Passar os flashcards de novo, sem contar no progresso', run: () => this.trainIn(d) });
    }
    work.push({ id: 'novo', label: 'Novo flashcard', icon: ICON.adicionar, dialog: true, run: () => this.newCard(id) });
    work.push({ id: 'trazer', label: 'Trazer anotações', icon: ICON.anotacoes, dialog: true, hint: 'Anotações do grupo, para virar flashcards deste baralho', run: () => this.bringInto(d) });
    const adjust: MenuItem[] = [{ id: 'ajustes', label: 'Ajustes do baralho', icon: ICON.editar, dialog: true, hint: 'O nome, o desenho, a cor, quem vê e a posição', run: () => this.sheet.set({ id, fresh: false }) }];
    const end: MenuItem[] = [{ id: 'apagar', label: 'Apagar o baralho', icon: ICON.apagar, danger: true, dialog: true, run: () => void this.removeDeck(id) }];
    return [open, work, adjust, end];
  }

  /**
   * O menu de um flashcard da parede: virar, maximizar e ler a anotação (o que a etiqueta de tinta faz),
   * editar e ver o progresso (o editor, na aba Flashcard) e, no fim, tirar deste baralho.
   */
  private cardMenu(note: string): MenuSections {
    const d = this.deck();
    const c = this.cards().find((x) => x.note === note);
    if (!d || !c) return [];
    const up = this.flipped().has(note);
    const look: MenuItem[] = [
      { id: 'virar', label: up ? 'Virar de volta' : 'Virar o flashcard', icon: up ? ICON.esconder : ICON.ver, hint: up ? 'A frente de novo' : 'Atrás está a anotação', run: () => this.flipFromMenu(note) },
      { id: 'maximizar', label: 'Maximizar', icon: ICON.aumentar, dialog: true, run: () => this.focused.set(note) },
      { id: 'ler', label: 'Ler a anotação', icon: ICON.livros, dialog: true, run: () => this.open(note) },
    ];
    const edit: MenuItem[] = [{ id: 'editar', label: 'Editar o flashcard', icon: ICON.ajustar, dialog: true, hint: 'A frente, os baralhos e o mural, na aba Flashcard', run: () => this.edit(note) }];
    if (this.study.cardOf().get(note)?.stats.seen) {
      edit.push({ id: 'progresso', label: 'Ver o progresso', icon: ICON.desempenho, dialog: true, hint: 'Quantas vezes foi visto, os acertos e a chance de lembrar agora', run: () => this.desk.editReview(note, 'flashcard', 'progresso') });
    }
    const end: MenuItem[] = [{ id: 'tirar', label: `Tirar de ${d.name}`, icon: ICON.tirar, danger: true, run: () => void this.removal.card(note, d.id, c.title) }];
    return [look, edit, end];
  }

  /** Virar pelo menu: a carta como está agora na parede (ela pode ter sido redesenhada com o menu aberto). */
  private flipFromMenu(note: string): void {
    const li = this.host.querySelector<HTMLElement>(`.carta-li[data-carta="${CSS.escape(note)}"]`);
    if (li) this.flip(note, li);
  }

  /** "Treinar" de um baralho: o remendo do Treinar dele; de fora, abre o baralho com o remendo aberto. */
  private trainIn(d: Deck): void {
    if (this.deck()?.id === d.id) this.trainMore()?.show();
    else void this.router.navigateByUrl(this.deckPath(d), { state: { treinar: true } });
  }

  /** "Treinar" de um grupo: o remendo do Treinar dele (na pasta do grupo); de fora, abre o grupo com o remendo aberto. */
  private trainGroup(id: string): void {
    if (this.group()?.id === id && !this.deck()) this.trainMore()?.show();
    else void this.router.navigateByUrl(studyPath(id), { state: { treinar: true } });
  }

  /** "Trazer anotações" de um baralho: aqui mesmo, no aberto; de fora, abre o baralho com o seletor. */
  private bringInto(d: Deck): void {
    if (this.deck()?.id === d.id) this.picking.set(true);
    else void this.router.navigateByUrl(this.deckPath(d), { state: { trazer: true } });
  }

  /** Apagar o baralho pelo menu: a mesma pergunta da folha; o aberto volta para o grupo. */
  private async removeDeck(id: string): Promise<void> {
    const here = this.deck()?.id === id;
    if ((await this.removal.deck(id)) && here && !this.gone) this.removed();
  }

  /** O baralho saiu: volta para o grupo dele (ou para Tudo). */
  protected removed(): void {
    const g = this.group();
    void this.router.navigateByUrl(g ? studyPath(g.id) : studyPath());
  }

  /** "2 baralhos · 101 cartas": o resumo de um grupo na seção de Tudo. */
  protected groupSummary(g: GroupTab): string {
    return `${g.decks.length === 1 ? '1 baralho' : `${g.decks.length} baralhos`} · ${this.countLabel(g.cards)}`;
  }

  protected countLabel(n: number): string {
    return n === 1 ? '1 flashcard' : `${n} flashcards`;
  }

  /** Quantas camadas a pilha desenha embaixo da de cima: mais cartas, mais grossa (até três). */
  protected layers(n: number): number[] {
    return Array.from({ length: n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0 }, (_, i) => i);
  }
}
