import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { KindProfile, countOf, isNotes, revisitCountOf } from './kinds';
import { Mural } from './mural';
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
import { FacetKey, NO_FILTER, WallFilter, facetsOf, filterSize, matchesFilter, matchesQuery, tagsOf, toggleOption } from './wall-filter';

/**
 * `categoria` e `prioridade` (fixadas, comuns, sub-notas) só no mural de anotações; `nota` e
 * `status`, só nos de resenhas.
 */
export type SortKey = 'data' | 'nota' | 'alfabetica' | 'status' | 'categoria' | 'prioridade';
const SORT_KEYS: readonly SortKey[] = ['data', 'nota', 'alfabetica', 'status', 'categoria', 'prioridade'];
export type Direction = 'desc' | 'asc';
/** Completa (tudo), simples (a tira com a nota) ou capas (só a foto e o nome, para ver o máximo de fichas). */
export type Density = 'completa' | 'simples' | 'capas';

const KEY = 'mural-de-jogos:vista:v1';

/** Os grupos da cartela de filtros que contam o que a pessoa achou: somem no modo sem spoilers. */
export const SPOILER_FACETS: readonly FacetKey[] = ['verdict', 'grade', 'difficulty'];

/** O filtro sem os grupos que contam o que a pessoa achou (veredito, nota, dificuldade). */
export function withoutSpoilerFacets(f: WallFilter): WallFilter {
  return f.verdict.length || f.grade.length || f.difficulty.length ? { ...f, verdict: [], grade: [], difficulty: [] } : f;
}

interface ViewPrefs {
  sort: SortKey;
  /** O mural de anotações tem a ordem dele (a de sempre é Prioridade). */
  noteSort: SortKey;
  scoreKey: ScoreKey;
  direction: Direction;
  /** A direção da ordem do mural de anotações. */
  noteDirection: Direction;
  density: Density;
  /** O mural de anotações mostra as finalizadas também. */
  showDone: boolean;
}

const DEFAULT_DIRECTION: Record<SortKey, Direction> = {
  data: 'desc',
  nota: 'desc',
  alfabetica: 'asc',
  status: 'desc',
  categoria: 'asc',
  prioridade: 'desc',
};

/** A ordem que o mural aberto tem de fato: cada mural só ordena pelo que ele tem. */
export function sortFor(sort: SortKey, profile: KindProfile): SortKey {
  if (isNotes(profile.kind)) return sort === 'nota' || sort === 'status' ? 'data' : sort;
  return sort === 'categoria' || sort === 'prioridade' ? 'data' : sort;
}

function readPrefs(): ViewPrefs {
  const fallback: ViewPrefs = { sort: 'data', noteSort: 'prioridade', scoreKey: 'final', direction: 'desc', noteDirection: 'desc', density: 'completa', showDone: false };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw) return fallback;
    return {
      sort: SORT_KEYS.includes(raw.sort) ? raw.sort : fallback.sort,
      noteSort: SORT_KEYS.includes(raw.noteSort) ? raw.noteSort : fallback.noteSort,
      scoreKey: raw.scoreKey === 'final' || (RATED_KEYS as readonly string[]).includes(raw.scoreKey)
        ? raw.scoreKey
        : fallback.scoreKey,
      direction: raw.direction === 'asc' ? 'asc' : 'desc',
      noteDirection: raw.noteDirection === 'asc' ? 'asc' : 'desc',
      density: raw.density === 'simples' || raw.density === 'capas' ? raw.density : 'completa',
      showDone: raw.showDone === true,
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

/** Estado do mural aberto: busca, filtros e ordenação. */
@Injectable({ providedIn: 'root' })
export class WallView {
  private readonly mural = inject(Mural);
  private readonly settings = inject(Settings);
  private readonly prefs = readPrefs();

  readonly query = signal('');
  /** Os filtros da cartela. Valem só nesta visita, como a busca. */
  readonly filter = signal<WallFilter>(NO_FILTER);
  /** A ordem escolhida nos murais de resenhas (o de anotações tem a dele, `noteSort`). */
  readonly sort = signal<SortKey>(this.prefs.sort);
  /** A ordem escolhida no mural de anotações; a de sempre é Prioridade (fixadas, comuns, sub-notas). */
  readonly noteSort = signal<SortKey>(this.prefs.noteSort);
  /** A ordem escolhida para o mural aberto. */
  private readonly chosenSort = computed(() => (isNotes(this.mural.kind()) ? this.noteSort() : this.sort()));
  /** A nota escolhida para ordenar. Guardada mesmo que o mural aberto não tenha ela (ver `activeScore`). */
  readonly scoreKey = signal<ScoreKey>(this.prefs.scoreKey);
  /** A nota que ordena de fato: a escolhida, se o mural aberto tem ela; senão, a Média. */
  readonly activeScore = computed<ScoreKey>(() => {
    const k = this.scoreKey();
    return scoreKeys(this.mural.kind()).includes(k) ? k : 'final';
  });
  /** A direção da ordem nos murais de resenhas e no de anotações, cada uma com a sua ordem. */
  readonly reviewDirection = signal<Direction>(this.prefs.direction);
  readonly noteDirection = signal<Direction>(this.prefs.noteDirection);
  private readonly chosenDirection = computed(() => (isNotes(this.mural.kind()) ? this.noteDirection : this.reviewDirection));
  /** A direção da ordem do mural aberto. */
  readonly direction = computed<Direction>(() => this.chosenDirection()());
  readonly density = signal<Density>(this.prefs.density);
  /** "Mostrar finalizadas": as anotações com check continuam no mural. Fica guardado, como a ordem. */
  readonly showDone = signal(this.prefs.showDone);
  /**
   * As anotações que acabaram de ganhar o check: ficam no mural o tempo do carimbo e depois saem
   * (ver ReviewCard). Com "Mostrar finalizadas", ficam de vez.
   */
  readonly stamping = signal<ReadonlySet<string>>(new Set());

  /** A anotação entra no mural agora? A finalizada, só mostrando as finalizadas ou durante o carimbo. */
  private shows(r: Review): boolean {
    return !isDone(r) || this.showDone() || this.stamping().has(r.id);
  }
  /** O mural sem as finalizadas escondidas: é o "todo" do mural, para contar e para o vazio. */
  readonly pool = computed<Review[]>(() => this.mural.wall().filter((r) => this.shows(r)));
  /** Quantas anotações finalizadas o mural tem (à mostra ou não). */
  readonly doneCount = computed(() => this.mural.wall().filter(isDone).length);
  /** As finalizadas que estão fora do mural agora. */
  readonly hiddenDone = computed(() => this.mural.wallCount() - this.pool().length);

  /**
   * A ordem que vale de fato. Sem spoilers, ordenar por nota entregaria o ranking mesmo com as notas
   * escondidas: o mural fica por data, e a escolha guardada volta quando o modo desliga.
   */
  readonly shownSort = computed<SortKey>(() => {
    const sort = sortFor(this.chosenSort(), this.mural.profile());
    return this.settings.noSpoilers() && sort === 'nota' ? 'data' : sort;
  });
  /** Os filtros que valem de fato: sem spoilers, filtrar por veredito, nota ou dificuldade entregaria o que está escondido. */
  private readonly activeFilter = computed<WallFilter>(() => {
    const f = this.filter();
    return this.settings.noSpoilers() ? withoutSpoilerFacets(f) : f;
  });

  /** As fichas que a busca encontra, antes dos filtros: é sobre elas que a cartela conta. */
  private readonly searched = computed<Review[]>(() => {
    const needle = fold(this.query().trim());
    // a parede inteira: as fichas e as rejogadas, cada uma no seu lugar (as anotações finalizadas, só à mostra)
    return this.pool().filter((r) => matchesQuery(r, needle));
  });

  /** Os grupos da cartela, com quantas fichas cada opção mostraria. */
  readonly facets = computed(() => {
    const all = facetsOf(this.searched(), this.activeFilter(), this.mural.profile());
    return this.settings.noSpoilers() ? all.filter((f) => !SPOILER_FACETS.includes(f.key)) : all;
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

  private readonly order = computed<WallOrder>(() => ({
    sort: this.shownSort(),
    key: this.activeScore(),
    direction: this.direction(),
    profile: this.mural.profile(),
  }));

  readonly groups = computed<WallGroup[]>(() => groupWall(this.visible(), this.order(), this.settings.noSpoilers()));

  constructor() {
    effect(() => {
      const prefs: ViewPrefs = {
        sort: this.sort(),
        noteSort: this.noteSort(),
        scoreKey: this.scoreKey(),
        direction: this.reviewDirection(),
        noteDirection: this.noteDirection(),
        density: this.density(),
        showDone: this.showDone(),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(prefs));
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

  setSort(sort: SortKey): void {
    const chosen = isNotes(this.mural.kind()) ? this.noteSort : this.sort;
    if (chosen() === sort) return;
    chosen.set(sort);
    this.chosenDirection().set(DEFAULT_DIRECTION[sort]);
  }

  toggleDirection(): void {
    this.chosenDirection().update((d) => (d === 'desc' ? 'asc' : 'desc'));
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

  /** Guarda a busca, o filtro e a ordem, e devolve como voltar a eles (ver ViewTransitions.run). */
  snapshot(): () => void {
    const query = this.query(),
      filter = this.filter(),
      sort = this.sort(),
      noteSort = this.noteSort(),
      scoreKey = this.scoreKey(),
      direction = this.reviewDirection(),
      noteDirection = this.noteDirection(),
      density = this.density();
    return () => {
      this.query.set(query);
      this.filter.set(filter);
      this.sort.set(sort);
      this.noteSort.set(noteSort);
      this.scoreKey.set(scoreKey);
      this.reviewDirection.set(direction);
      this.noteDirection.set(noteDirection);
      this.density.set(density);
    };
  }
}


/** Como o mural está ordenado: serve ao seu mural e ao mural de um colega. */
export interface WallOrder {
  sort: SortKey;
  /** A nota que ordena (só vale com `sort: 'nota'`). */
  key: ScoreKey;
  direction: Direction;
  profile: KindProfile;
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
  // no mural de anotações, as fixadas são sempre a primeira seção, em qualquer ordem
  const keyOf: (r: Review) => [string, string] = isNotes(o.profile.kind)
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

/** A categoria que agrupa a anotação: a primeira que foi colada nela, ou nenhuma. */
function firstCategory(r: Review): string | null {
  return r.bonuses[0]?.label ?? null;
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
  if (!isNotes(o.profile.kind)) return inner;
  // as fixadas vêm sempre primeiro; na Prioridade, as sub-notas vêm por último
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
