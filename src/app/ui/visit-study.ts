import { ChangeDetectionStrategy, Component, DestroyRef, afterRenderEffect, computed, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideIconData } from 'lucide-angular';
import { visitStudyPath } from '../core/areas';
import { CategoryLook, categoryColorHex, lookKey } from '../core/category-looks';
import { Colleague } from '../core/colleague-store';
import { Review } from '../core/review';
import { CardFace, CardSize, Deck, LEVEL_LABEL, Level, STUDY_SIZE_KEY, StudyCard as Card, cardFace, frontTitle, groupKey, levelOf, studyGroupId } from '../core/study';
import { DeckCopyRequest } from '../core/study-copy';
import { readText, writeText } from '../core/storage';
import { nameCollator } from '../core/text';
import { pinningFor } from '../core/wall-physics';
import { CategoryLabel } from './category-label';
import { ICON, IconModule } from './icons';
import { NearPool, NearScreen } from './near-screen';
import { SearchStrip } from './search-strip';
import { StudyCard } from './study-card';
import { CopySample, StudyCopySheet } from './study-copy-sheet';

/** As ordens da parede do baralho; as duas primeiras só com o progresso à mostra. */
type SortId = 'proxima' | 'nivel' | 'entrada' | 'nome';

const SORTS: readonly { id: SortId; label: string; progress?: true }[] = [
  { id: 'proxima', label: 'Próxima revisão', progress: true },
  { id: 'nivel', label: 'Nível', progress: true },
  { id: 'entrada', label: 'Ordem de entrada' },
  { id: 'nome', label: 'De A a Z' },
];

const CARD_SIZES: readonly { value: CardSize; label: string; icon: LucideIconData }[] = [
  { value: 'grandes', label: 'Cartas grandes', icon: ICON.simples },
  { value: 'pequenas', label: 'Cartas pequenas: mais cartas na tela', icon: ICON.grade },
];

const LEVELS: readonly Level[] = ['desconhecida', 'nova', 'aprendendo', 'dominada'];
const LEVEL_PLURAL: Record<Level, string> = { desconhecida: 'Desconhecidas', nova: 'Novas', aprendendo: 'Aprendendo', dominada: 'Dominadas' };

/** Uma carta como a parede de quem visita mostra. */
interface CardView {
  note: Review;
  title: string;
  subtitle?: string;
  image?: string;
  stock: Review['stock'];
  level: Level;
  /** O progresso na frente; null quando a dona o esconde. */
  face: CardFace | null;
  due: string;
  added: string;
  tilt: number;
}

interface DeckView {
  deck: Deck;
  cards: CardView[];
  top: CardView | null;
  under: CardView['stock'][];
}

interface GroupView {
  id: string;
  label: string;
  look: CategoryLook;
  color: string | null;
  decks: DeckView[];
  cards: number;
}

/** O giro de cada carta na parede, do id (o mesmo da página dos Estudos). */
function tiltOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 140) / 100 - 0.7) * 1.7;
}

/**
 * Os Estudos de outra pessoa, na visita (`/comparar/mural/estudos`, PLANO-BARALHOS-PUBLICOS.md, 4.4): só os
 * baralhos que ela tornou públicos, com as cartas de anotações públicas. O mesmo desenho dos seus Estudos
 * (as divisórias de manilha com Tudo e os grupos, a pasta, as pilhas com o elástico e a parede das cartas,
 * dos mesmos estilos de `study-page.scss`), só para ver: sem Estudar, sem os montes de hoje (são os dela) e
 * sem mexer. Tocar numa carta abre a anotação (o verso) na leitura da visita; no baralho, "Copiar baralho"
 * abre a folha que faz dele um baralho seu (ui/study-copy-sheet.ts).
 */
@Component({
  selector: 'app-visit-study',
  imports: [CategoryLabel, IconModule, NearScreen, NgTemplateOutlet, RouterLink, SearchStrip, StudyCard, StudyCopySheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visit-study.html',
  styleUrls: ['../pages/study-page.scss', './visit-study.scss'],
})
export class VisitStudy {
  readonly colleague = input.required<Colleague>();
  /** O grupo e o baralho do endereço (null: Tudo, ou o grupo). */
  readonly groupId = input<string | null>(null);
  readonly deckId = input<string | null>(null);
  /** Uma carta foi tocada: a anotação dela, e as do baralho (a leitura anda entre elas). */
  readonly opened = output<{ note: Review; pool: Review[] }>();

  protected readonly AllIcon = ICON.camadas;
  protected readonly BackIcon = ICON.voltar;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly cardSizes = CARD_SIZES;
  protected readonly levels = LEVELS;
  protected readonly levelPlural = LEVEL_PLURAL;
  protected readonly path = visitStudyPath;
  protected readonly groupIdOf = studyGroupId;

  /** Agora, de minuto em minuto: o progresso da frente ("volta em 3 dias") anda. */
  private readonly now = signal(new Date());

  protected readonly query = signal('');
  protected readonly level = signal<Level | ''>('');
  protected readonly sortChoice = signal<SortId | null>(null);
  /** O tamanho das cartas: o mesmo dos seus Estudos (vale para todos os baralhos, neste aparelho). */
  protected readonly cardSize = signal<CardSize>(readText(STUDY_SIZE_KEY) === 'pequenas' ? 'pequenas' : 'grandes');

  private readonly study = computed(() => this.colleague().estudos ?? null);
  /** A dona deixa ver o progresso. */
  protected readonly progress = computed(() => this.study()?.progress ?? false);
  protected readonly sorts = computed(() => SORTS.filter((s) => !s.progress || this.progress()));
  /** A ordem: a escolhida, se ainda vale; senão a primeira (sem o progresso, a de entrada). */
  protected readonly sort = computed<SortId>(() => {
    const c = this.sortChoice();
    return c && this.sorts().some((s) => s.id === c) ? c : this.sorts()[0].id;
  });
  protected readonly sortLabel = computed(() => SORTS.find((s) => s.id === this.sort())!.label);
  protected readonly levelLabel = computed(() => {
    const l = this.level();
    return l ? LEVEL_PLURAL[l] : 'Todos';
  });

  /** As anotações dela que as cartas usam: as do mural e as só fora dele. */
  private readonly notesById = computed(() => {
    const c = this.colleague();
    return new Map([...c.reviews, ...(c.studyNotes ?? [])].map((r) => [r.id, r]));
  });

  /** O número de cada carta em cada baralho, na ordem de entrada (o Nº do Ingresso, da Faixa…). */
  private readonly numbers = computed(() => {
    const out = new Map<string, Map<string, number>>();
    for (const c of this.study()?.cards ?? []) {
      for (const d of c.decks) {
        const m = out.get(d) ?? new Map<string, number>();
        m.set(c.note, m.size + 1);
        out.set(d, m);
      }
    }
    return out;
  });

  private readonly decks = computed<DeckView[]>(() => {
    const st = this.study();
    if (!st) return [];
    const byId = this.notesById();
    const now = this.now();
    return st.decks.map((deck) => {
      const cards: CardView[] = [];
      for (const c of st.cards) {
        const note = byId.get(c.note);
        if (note && c.decks.includes(deck.id)) cards.push(this.view(c, deck.id, note, now));
      }
      const top = [...cards].sort(this.comparer(this.progress() ? 'proxima' : 'entrada'));
      return { deck, cards, top: top[0] ?? null, under: top.slice(1, 4).map((v) => v.stock) };
    });
  });

  /** Os grupos com baralho público, na ordem dos baralhos, com o ícone e a cor que a dona deu. */
  protected readonly groups = computed<GroupView[]>(() => {
    const looks = this.colleague().categoryLooks ?? {};
    const out = new Map<string, GroupView>();
    for (const v of this.decks()) {
      const label = v.deck.group!;
      const key = groupKey(label);
      let g = out.get(key);
      if (!g) {
        const look = looks[lookKey(label)] ?? {};
        g = { id: studyGroupId(label), label, look, color: categoryColorHex(look.color), decks: [], cards: 0 };
        out.set(key, g);
      }
      g.decks.push(v);
    }
    for (const g of out.values()) g.cards = new Set(g.decks.flatMap((d) => d.cards.map((c) => c.note.id))).size;
    return [...out.values()];
  });

  protected readonly group = computed(() => {
    const id = this.groupId();
    return (id && this.groups().find((g) => g.id === id)) || null;
  });
  protected readonly deck = computed(() => {
    const id = this.deckId();
    return (id && this.group()?.decks.find((d) => d.deck.id === id)) || null;
  });
  /** O endereço pedia um grupo ou um baralho que não está mais à mostra. */
  protected readonly lost = computed(() => (!!this.groupId() && !this.group()) || (!!this.deckId() && !this.deck()));

  /** As cartas do baralho aberto, filtradas e na ordem escolhida. */
  protected readonly cards = computed<CardView[]>(() => {
    const d = this.deck();
    if (!d) return [];
    const q = this.query().trim().toLocaleLowerCase('pt-BR');
    const lv = this.progress() ? this.level() : '';
    return d.cards
      .filter((c) => (!lv || c.level === lv) && (!q || [c.title, c.note.game.name, c.subtitle ?? ''].some((s) => s.toLocaleLowerCase('pt-BR').includes(q))))
      .sort(this.comparer(this.sort()));
  });

  constructor() {
    const nearPool = inject(NearPool);
    afterRenderEffect(() => {
      this.cards();
      this.cardSize();
      nearPool.settle();
    });
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private view(c: Card, deck: string, note: Review, now: Date): CardView {
    return {
      note,
      title: frontTitle(c, note.game.name),
      subtitle: c.front.subtitle,
      image: c.front.image,
      stock: pinningFor(note.id, note.stock).stock,
      level: levelOf(c.srs),
      face: this.progress() ? cardFace(c, now, this.numbers().get(deck)?.get(c.note)) : null,
      due: c.srs.due,
      added: c.added,
      tilt: tiltOf(c.note),
    };
  }

  private comparer(sort: SortId): (a: CardView, b: CardView) => number {
    const byName = (a: CardView, b: CardView) => nameCollator.compare(a.title, b.title);
    switch (sort) {
      case 'proxima':
        return (a, b) => {
          const na = a.level === 'desconhecida';
          const nb = b.level === 'desconhecida';
          if (na !== nb) return na ? 1 : -1;
          return na ? a.added.localeCompare(b.added) : a.due.localeCompare(b.due) || byName(a, b);
        };
      case 'nivel':
        return (a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.due.localeCompare(b.due) || byName(a, b);
      case 'nome':
        return byName;
      default:
        return (a, b) => a.added.localeCompare(b.added) || byName(a, b);
    }
  }

  /** O que a carta diz ao leitor de tela e à dica: o título e, com o progresso, o nível e a volta. */
  protected meta(c: CardView): string {
    if (!c.face) return c.title;
    return c.level === 'desconhecida' ? `${c.title}, ${LEVEL_LABEL[c.level]}` : `${c.title}, ${LEVEL_LABEL[c.level]} · ${c.face.when}`;
  }

  protected open(c: CardView): void {
    this.opened.emit({ note: c.note, pool: this.cards().map((v) => v.note) });
  }

  /** "Copiar baralho" aberto: o baralho, as cartas que quem visita vê e a de cima da pilha, para a folha mostrar. */
  protected readonly copying = signal<{ request: DeckCopyRequest; sample: CopySample | null } | null>(null);

  protected askCopy(d: DeckView): void {
    const notes = new Set(d.cards.map((c) => c.note.id));
    const cards = (this.study()?.cards ?? []).filter((c) => notes.has(c.note) && c.decks.includes(d.deck.id));
    const top = d.top;
    this.copying.set({
      request: { deck: d.deck, cards, notes: d.cards.map((c) => c.note) },
      sample: top ? { title: top.title, subtitle: top.subtitle, image: top.image, stock: top.stock } : null,
    });
  }

  protected setCardSize(size: CardSize): void {
    this.cardSize.set(size);
    writeText(STUDY_SIZE_KEY, size);
  }

  protected countLabel(n: number): string {
    return n === 1 ? '1 carta' : `${n} cartas`;
  }

  protected groupSummary(g: GroupView): string {
    return `${g.decks.length === 1 ? '1 baralho' : `${g.decks.length} baralhos`} · ${this.countLabel(g.cards)}`;
  }

  /** Quantas camadas a pilha desenha embaixo da de cima (a mesma régua dos seus Estudos). */
  protected layers(n: number): number[] {
    return Array.from({ length: n >= 10 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0 }, (_, i) => i);
  }
}
