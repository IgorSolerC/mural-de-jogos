import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, signal, untracked } from '@angular/core';
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
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { CardFace, CardSize, DECK_NAME_MAX, Deck, LEVEL_LABEL, Level, STUDY_SIZE_KEY, StudyCard as Card, cardFace, frontTitle, groupKey, inGroup, levelOf, studyGroupId, whenLabel } from '../core/study';
import { readText, writeText } from '../core/storage';
import { QueueCounts, StudyScope, allCounts, countTotal, dayQueue } from '../core/study-queue';
import { StudyStore } from '../core/study-store';
import { nameCollator } from '../core/text';
import { pinningFor } from '../core/wall-physics';
import { ICON, ICON_CHOICE, IconModule } from '../ui/icons';
import { NearPool, NearScreen } from '../ui/near-screen';
import { Pin } from '../ui/pin';
import { SearchStrip } from '../ui/search-strip';
import { StudyCard } from '../ui/study-card';
import { StudyDeckSheet } from '../ui/study-deck-sheet';
import { StudyCardSheet } from '../ui/study-card-sheet';
import { StudySession } from '../ui/study-session';
import { MuralConfig } from '../ui/mural-config';
import { CardPicker } from '../ui/card-picker';
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
  { value: 'grandes', label: 'Cartas grandes', icon: ICON.simples },
  { value: 'pequenas', label: 'Cartas pequenas: mais cartas na tela', icon: ICON.grade },
];

const LEVELS: readonly Level[] = ['desconhecida', 'nova', 'aprendendo', 'dominada'];
const LEVEL_PLURAL: Record<Level, string> = { desconhecida: 'Desconhecidas', nova: 'Novas', aprendendo: 'Aprendendo', dominada: 'Dominadas' };

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
 * que abrem a anotação (a resposta) como no mural. Estudar vale para o baralho, o grupo ou tudo.
 */
@Component({
  selector: 'app-study-page',
  imports: [CardPicker, CategoryLabel, IconModule, NearScreen, NgTemplateOutlet, Pin, RouterLink, SearchStrip, StudyCard, StudyCardSheet, StudyDeckSheet, StudySession, MuralConfig, TabMore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-page.html',
  styleUrl: './study-page.scss',
})
export class StudyPage {
  protected readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly kanban = inject(KanbanStore);
  private readonly settings = inject(Settings);
  private readonly wallView = inject(WallView);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly AllIcon = ICON.camadas;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly EditIcon = ICON.editar;
  protected readonly AdjustIcon = ICON.ajustar;
  protected readonly PlayIcon = ICON.estudar;
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
  /** A sessão de estudo aberta: de um baralho, de um grupo (o nome), ou de todos (os dois null). */
  protected readonly session = signal<{ deck: string | null; group?: string | null; ahead?: boolean } | null>(null);
  /** A folha das configurações dos Estudos aberta. */
  protected readonly config = signal(false);
  /** Quantas revisões vencem amanhã (no baralho, no grupo ou em todos): o "Estudar adiantado" só aparece com alguma. */
  protected readonly tomorrow = computed(() => countTotal(dayQueue(this.study.view(), this.now(), this.scope(), this.study.live, 1).counts));
  /** A folha da carta aberta (o id da anotação). */
  protected readonly cardSheet = signal<string | null>(null);
  /** O seletor de fichas do "Trazer anotações" aberto. */
  protected readonly picking = signal(false);
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
    });
    // o "+ Novo baralho" abre nele com a folha aberta: a página é outra depois da navegação (são duas rotas)
    const asked = (this.router.getCurrentNavigation()?.extras.state as { folha?: string } | undefined)?.folha;
    if (asked) this.sheet.set({ id: asked, fresh: true });
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
    if (had) this.study.setDecks(note, [...had.decks, deck]);
    else this.study.addCard(note, [deck], {}, true);
    // só as anotações do grupo do baralho podem entrar nele (o seletor só mostra essas)
    if (!this.study.cardOf().get(note)?.decks.includes(deck)) return;
    const name = this.store.get(note)?.game.name ?? '';
    this.toasts.show(`“${name}” virou carta de ${this.study.deck(deck)?.name ?? ''}`);
  }

  /** "Editar a frente" da folha da carta: o editor da anotação, na aba Flashcard. */
  protected edit(note: string): void {
    this.study.openFront.set(note);
    this.desk.editReview(note);
  }

  /** Troca o tamanho das cartas e guarda neste aparelho. */
  protected setCardSize(size: CardSize): void {
    this.cardSize.set(size);
    writeText(STUDY_SIZE_KEY, size);
  }

  /** A carta abre a anotação, como no mural: a resposta, com o Editar e tudo. */
  protected open(note: string): void {
    this.desk.openReview(note);
  }

  /** Uma cor ainda sem baralho (ou a do primeiro, se todas já têm). */
  private freeColor(): LightStock {
    const used = new Set(this.study.decks().map((d) => d.color));
    return LIGHT_STOCKS.find((s) => !used.has(s) && s !== 'branco') ?? 'amarelo';
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
    return n === 1 ? '1 carta' : `${n} cartas`;
  }

  /** Quantas camadas a pilha desenha embaixo da de cima: mais cartas, mais grossa (até três). */
  protected layers(n: number): number[] {
    return Array.from({ length: n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0 }, (_, i) => i);
  }
}
