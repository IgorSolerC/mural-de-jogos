import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { studyPath } from '../core/areas';
import { Desk } from '../core/desk';
import { daysBetween, studyDay } from '../core/fsrs';
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { DECK_NAME_MAX, Deck, LEVEL_LABEL, Level, StudyCard as Card, frontTitle, levelOf, whenLabel } from '../core/study';
import { QueueCounts, allCounts, countTotal } from '../core/study-queue';
import { StudyStore } from '../core/study-store';
import { nameCollator } from '../core/text';
import { pinningFor } from '../core/wall-physics';
import { ICON, ICON_CHOICE, IconModule } from '../ui/icons';
import { Pin } from '../ui/pin';
import { SearchStrip } from '../ui/search-strip';
import { StudyCard } from '../ui/study-card';
import { StudyDeckSheet } from '../ui/study-deck-sheet';
import { StudyCardSheet } from '../ui/study-card-sheet';
import { StudySession } from '../ui/study-session';
import { CardPicker } from '../ui/card-picker';
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
}

/** O giro de cada carta na parede, do id: pequeno, como as fichas da Visão geral. */
function tiltOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 140) / 100 - 0.7) * 1.7;
}

/**
 * Os Estudos (`/anotacoes/estudos`, PLANO-ESTUDOS.md, seção 6): as divisórias de manilha com Tudo e um
 * baralho por aba; em Tudo, os baralhos como pilhas de cartas com um elástico e quantas vencem hoje; num
 * baralho, a parede das cartas, a frente à mostra, que abrem a anotação (a resposta) como no mural.
 *
 * Estudar (a sessão) e pôr cartas (a aba Flashcard do editor) chegam nas rodadas seguintes.
 */
@Component({
  selector: 'app-study-page',
  imports: [CardPicker, IconModule, Pin, RouterLink, SearchStrip, StudyCard, StudyCardSheet, StudyDeckSheet, StudySession],
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

  protected readonly AllIcon = ICON.camadas;
  protected readonly AddIcon = ICON.adicionar;
  protected readonly EditIcon = ICON.editar;
  protected readonly AdjustIcon = ICON.ajustar;
  protected readonly PlayIcon = ICON.estudar;
  protected readonly BringIcon = ICON.buscar;
  protected readonly notesKind = NOTES;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly sorts = SORTS;
  protected readonly levels = LEVELS;
  protected readonly levelPlural = LEVEL_PLURAL;
  protected readonly nameMax = DECK_NAME_MAX;
  protected readonly studyPath = studyPath;

  /** O baralho do endereço (null: Tudo, ou um que não existe mais). */
  private readonly param = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('baralho'))), { initialValue: null });
  protected readonly deck = computed(() => {
    const id = this.param();
    return (id && this.study.deck(id)) || null;
  });

  /** Agora, de minuto em minuto (o relógio dos Estudos, que a barra também lê). */
  protected readonly now = this.study.now;
  /** A página saiu (a navegação para outro baralho pode reaproveitá-la ou trocar por outra). */
  private gone = false;

  protected readonly query = signal('');
  protected readonly level = signal<Level | ''>('');
  protected readonly sort = signal<SortId>('proxima');
  /** A folha do baralho aberta (`fresh`: acabou de nascer, o nome vem selecionado). */
  protected readonly sheet = signal<{ id: string; fresh: boolean } | null>(null);
  /** A sessão de estudo aberta: de um baralho, ou de todos (null). */
  protected readonly session = signal<{ deck: string | null } | null>(null);
  /** A folha da carta aberta (o id da anotação). */
  protected readonly cardSheet = signal<string | null>(null);
  /** O seletor de fichas do "Trazer anotações" aberto. */
  protected readonly picking = signal(false);
  /** O nome do primeiro baralho, na cartolina da primeira vez. */
  protected readonly firstName = signal('');

  private readonly notesById = computed(() => new Map(this.store.notes().map((n) => [n.id, n])));
  private readonly counts = computed(() => allCounts(this.study.state(), this.now(), this.study.live));

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
        if (note && c.decks.includes(deck.id)) views.push(this.view(c, note.game.name, pinningFor(note.id, note.stock).stock, now));
      }
      views.sort(next);
      return { deck, cards: views.length, counts, today: countTotal(counts), top: views[0] ?? null };
    });
  });

  /** Os números da linha de estudo: os do baralho aberto, ou os de todos (sem contar duas vezes). */
  protected readonly line = computed<QueueCounts>(() => {
    const d = this.deck();
    return d ? (this.counts().byDeck.get(d.id) ?? { novas: 0, aprender: 0, revisar: 0 }) : this.counts().total;
  });
  protected readonly lineTotal = computed(() => countTotal(this.line()));

  /** Sem nada para hoje: quando é a próxima revisão e quantas cartas vencem nela. */
  protected readonly next = computed(() => {
    const d = this.deck();
    const today = studyDay(this.now());
    let day: string | null = null;
    let n = 0;
    for (const c of this.study.cards()) {
      if (c.srs.state !== 'revisao' || !this.study.live(c.note)) continue;
      if (d ? !c.decks.includes(d.id) : !this.decks().some((x) => c.decks.includes(x.deck.id))) continue;
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
      const view = this.view(c, note.game.name, pinningFor(note.id, note.stock).stock, now);
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
    // o "+ Novo baralho" abre nele com a folha aberta: a página é outra depois da navegação (são duas rotas)
    const asked = (this.router.getCurrentNavigation()?.extras.state as { folha?: string } | undefined)?.folha;
    if (asked) this.sheet.set({ id: asked, fresh: true });
    this.study.tick();
    const timer = setInterval(() => this.study.tick(), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.gone = true;
    });
  }

  private view(c: Card, noteTitle: string, stock: CardView['stock'], now: Date): CardView {
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

  /** "Nova carta": o editor de uma anotação nova, já na aba Flashcard, com este baralho. */
  protected newCard(deck: string): void {
    this.study.pending.set({ decks: [deck] });
    this.desk.newNote('');
  }

  /**
   * "Trazer anotações": a anotação escolhida vira carta deste baralho, com a frente do nome dela; ela já
   * estava no mural e continua lá (D4).
   */
  protected bring(note: string, deck: string): void {
    const had = this.study.cardOf().get(note);
    if (had) this.study.setDecks(note, [...had.decks, deck]);
    else this.study.addCard(note, [deck], {}, true);
    const name = this.store.get(note)?.game.name ?? '';
    this.toasts.show(`“${name}” virou carta de ${this.study.deck(deck)?.name ?? ''}`);
  }

  /** "Editar a frente" da folha da carta: o editor da anotação, na aba Flashcard. */
  protected edit(note: string): void {
    this.study.openFront.set(note);
    this.desk.editReview(note);
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
   * "+ Novo baralho": nasce com um nome que ainda não existe e uma cor livre, e a folha abre com o nome
   * para escrever por cima. Vindo de Tudo, a página do baralho é outra e abre a folha pelo pedido da
   * navegação; vindo de outro baralho, a página é a mesma (a mesma rota) e abre aqui.
   */
  protected newDeck(): void {
    const names = new Set(this.study.decks().map((d) => d.name));
    let n = this.study.decks().length + 1;
    while (names.has(`Baralho ${n}`)) n++;
    const id = this.study.addDeck(`Baralho ${n}`, this.freeColor());
    if (!id) return;
    void this.router.navigateByUrl(studyPath(id), { state: { folha: id } }).then(() => {
      if (!this.gone) this.sheet.set({ id, fresh: true });
    });
  }

  /** A cartolina da primeira vez: o baralho com o nome escrito. */
  protected createFirst(): void {
    const name = this.firstName().trim();
    if (!name) return;
    const id = this.study.addDeck(name, this.freeColor());
    if (!id) return;
    this.firstName.set('');
    void this.router.navigateByUrl(studyPath(id));
  }

  protected removed(): void {
    void this.router.navigateByUrl(studyPath());
  }

  protected countLabel(n: number): string {
    return n === 1 ? '1 carta' : `${n} cartas`;
  }

  /** Quantas camadas a pilha desenha embaixo da de cima: mais cartas, mais grossa (até três). */
  protected layers(n: number): number[] {
    return Array.from({ length: n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0 }, (_, i) => i);
  }
}
