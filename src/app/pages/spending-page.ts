import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ICON, IconModule } from '../ui/icons';
import { todayISO } from '../core/dates';
import { reducedMotion } from '../core/motion';
import { readText, writeText } from '../core/storage';
import {
  Need,
  activeMonths,
  dailyBalance,
  daysLeft,
  installmentsAhead,
  isMonth,
  monthLabel,
  monthOfDay,
  monthStrips,
  openPlans,
  refundsByExpense,
  repeatsIn,
  rowsIn,
  shiftMonth,
  spentByCategory,
  spentByNeed,
  spentByPerson,
  totals,
  usualByCategory,
} from '../core/spending';
import {
  Span,
  addWays,
  categoryLines,
  isSpan,
  periodLabel,
  periodMonths,
  periodSpends,
  periodTotals,
  previousPeriod,
  spendWays,
} from '../core/spending-period';
import { FilterContext, FilterKey, SpendingFilter, filterChips, filterCount, filterGroups, filterRows, isFiltered, onlyIn, toggleFilter, withGroup } from '../core/spending-filter';
import { SpendingStore } from '../core/spending-store';
import { FilterChip, FilterTags } from '../ui/filter-sheet';
import { Collage } from '../ui/collage';
import { SpendingCategoriesSheet } from '../ui/spending-categories-sheet';
import { SpendingColumns } from '../ui/spending-columns';
import { SpendingGrid } from '../ui/spending-grid';
import { SpendingPeriodSummary } from '../ui/spending-period-summary';
import { SpendingTop } from '../ui/spending-top';
import { SpendingWays, WayPick } from '../ui/spending-ways';
import { SpendingEnvelopes } from '../ui/spending-envelopes';
import { SpendingFilters } from '../ui/spending-filters';
import { SpendingMonths } from '../ui/spending-months';
import { SpendingNeeds } from '../ui/spending-needs';
import { SpendingPeople } from '../ui/spending-people';
import { SpendingPeopleSheet } from '../ui/spending-people-sheet';
import { SpendingPlans } from '../ui/spending-plans';
import { SpendingQuick } from '../ui/spending-quick';
import { SpendingSummary } from '../ui/spending-summary';
import { SpendingTape } from '../ui/spending-tape';

/** "Sem os fixos" fica lembrado neste aparelho. */
const NO_FIXED_KEY = 'meu-mural:gastos-sem-fixos:v1';

/** As vistas: um mês, ou os últimos 3, 6 ou 12 até ele. */
const VIEWS: readonly { span: Span | null; label: string; key: string }[] = [
  { span: null, label: 'Mês', key: 'm' },
  { span: 3, label: '3 meses', key: '3' },
  { span: 6, label: '6 meses', key: '6' },
  { span: 12, label: '12 meses', key: '1' },
];

/**
 * Os Gastos (`/utilidades/gastos?mes=AAAA-MM`): o dinheiro de um mês, numa mesa.
 *
 * Embaixo da pasta, a linha de anotar (o gasto escrito como se fala); depois, a fita do mês (uma linha
 * baixa por lançamento, para ver o mês inteiro) e as peças: o saldo (e quanto ainda dá por dia), como
 * saiu, os envelopes de cada categoria (com o limite, se tiver), o Precisava?, o Por pessoa, o mês a mês
 * e os carnês abertos. No celular, uma coluna: o saldo, a fita, e o resto embaixo.
 *
 * Em cima, a pasta de manilha do Murall (a mesma do Calendário): Este mês, as setas e o nome do mês, e o
 * Filtrar, que abre embaixo a cartela de filtros da fita; os ligados ficam colados na pasta, cada um com o
 * seu X. Os envelopes, o Precisava? e o Por pessoa escolhem o grupo deles nesses mesmos filtros.
 *
 * O mês mora no endereço (Voltar volta ao mês de antes); sem ele, o de hoje. ← e → trocam de mês.
 *
 * Em cima da pasta, as divisórias das vistas: **Mês**, ou **3, 6 ou 12 meses** até o mês aberto
 * (`?vista=6`). A de vários meses troca a fita pelos meses lado a lado: as colunas do mês a mês, a tabela
 * das categorias mês a mês, os maiores gastos do período, o saldo do período (contra os mesmos meses antes
 * dele), como saiu, o Precisava?, o Por pessoa e os carnês. Tocar num mês (ou num gasto) abre aquele mês.
 *
 * As peças ficam numa colagem (ui/collage.ts), como as fichas inteiras do mural de anotações: colunas da
 * mesma largura, quantas couberem, e cada peça cai no primeiro lugar livre, embaixo da coluna que acabou
 * antes. No mês, a fita ocupa duas colunas quando cabem três, e as peças caem ao lado dela e, quando ela
 * acaba, embaixo; nos vários meses, as colunas, a tabela e os maiores gastos são as largas.
 */
@Component({
  selector: 'app-spending-page',
  imports: [
    Collage,
    FilterTags,
    IconModule,
    SpendingCategoriesSheet,
    SpendingColumns,
    SpendingEnvelopes,
    SpendingGrid,
    SpendingPeriodSummary,
    SpendingTop,
    SpendingWays,
    SpendingFilters,
    SpendingMonths,
    SpendingNeeds,
    SpendingPeople,
    SpendingPeopleSheet,
    SpendingPlans,
    SpendingQuick,
    SpendingSummary,
    SpendingTape,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './spending-page.html',
  styleUrl: './spending-page.scss',
})
export class SpendingPage {
  protected readonly store = inject(SpendingStore);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly PrevIcon = ICON.anterior;
  protected readonly NextIcon = ICON.proximo;
  protected readonly FilterIcon = ICON.filtrar;
  protected readonly MonthIcon = ICON.calendario;
  protected readonly ColumnsIcon = ICON.barras;
  protected readonly views = VIEWS;

  private readonly filterButton = viewChild<ElementRef<HTMLButtonElement>>('filtrar');

  protected readonly today = signal(todayISO());
  private readonly thisMonth = computed(() => monthOfDay(this.today()));

  /** O mês do endereço, ou o de hoje. */
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap, { initialValue: null });
  protected readonly month = computed(() => this.query()?.get('mes') ?? null);
  /** Quantos meses a vista mostra (null: um mês só). */
  protected readonly span = computed<Span | null>(() => {
    const v = Number(this.query()?.get('vista'));
    return isSpan(v) ? v : null;
  });
  protected readonly open = computed(() => {
    const m = this.month();
    return isMonth(m) ? m : this.thisMonth();
  });

  protected readonly title = computed(() => {
    const label = this.span() ? this.periodName() : monthLabel(this.open());
    return label[0].toLocaleUpperCase('pt-BR') + label.slice(1);
  });
  protected readonly isThisMonth = computed(() => this.open() === this.thisMonth());
  protected readonly future = computed(() => this.open() > this.thisMonth());

  /** Os filtros da fita (ver core/spending-filter.ts); ficam ao trocar de mês. */
  protected readonly filter = signal<SpendingFilter>({});
  /** A cartela de filtros está aberta (e se abriu pelo teclado: o foco vai para ela). */
  protected readonly filtering = signal(false);
  protected readonly filtersByKeyboard = signal(false);
  /** O envelope escolhido (a Categoria com só ele): o mês a mês mostra a parte dele. */
  protected readonly focus = computed(() => onlyIn(this.filter(), 'category'));
  /** A resposta ao "Precisava?" escolhida (`null`: os sem resposta). */
  protected readonly needFocus = computed<Need | null | undefined>(() => {
    const n = onlyIn(this.filter(), 'need');
    return n === null ? undefined : n === 'sem' ? null : (n as Need);
  });
  /** A pessoa escolhida: a fita mostra a parte dela em cada gasto. */
  protected readonly personFocus = computed(() => onlyIn(this.filter(), 'person'));
  protected readonly noFixed = signal(readText(NO_FIXED_KEY) === '1');

  protected readonly managing = signal(false);
  protected readonly managingPeople = signal(false);

  private readonly entries = computed(() => this.store.entries());
  protected readonly rows = computed(() => rowsIn(this.entries(), this.open()));
  protected readonly totals = computed(() => totals(this.rows(), this.entries()));
  protected readonly days = computed(() => dailyBalance(this.rows(), this.open(), this.isThisMonth() ? this.today() : undefined));
  protected readonly left = computed(() => daysLeft(this.open(), this.today()));
  protected readonly refunds = computed(() => refundsByExpense(this.entries()));

  /**
   * As contas dos envelopes e do mês a mês, sem os fixos de saída (aluguel, contas…) quando a pessoa pede
   * na vista de um mês. As entradas fixas (o salário) ficam: o botão é dos gastos. A vista de vários meses
   * não tem o botão, e conta tudo.
   */
  private readonly counted = computed(() => (this.noFixed() ? this.entries().filter((e) => !(e.monthly && e.flow === 'saida')) : this.entries()));
  /** As linhas do mês aberto nessas contas (uma passada só para os envelopes, o Precisava? e o Por pessoa). */
  private readonly countedRows = computed(() => rowsIn(this.counted(), this.open()));
  protected readonly sums = computed(() => spentByCategory(this.countedRows(), this.counted()));
  protected readonly needSums = computed(() => spentByNeed(this.countedRows(), this.counted()));
  /** Quantos gastos do mês em cada resposta ao "Precisava?" (a segunda régua da peça). */
  protected readonly needCounts = computed(() => {
    const out = new Map<Need | null, number>();
    for (const r of this.countedRows()) if (r.entry.flow === 'saida') out.set(r.entry.need ?? null, (out.get(r.entry.need ?? null) ?? 0) + 1);
    return out;
  });
  protected readonly showNeeds = computed(() => [...this.needSums().values()].some((v) => v > 0));
  protected readonly personSums = computed(() => spentByPerson(this.countedRows(), this.counted()));
  /** Por pessoa só diz algo quando algum gasto do mês foi com mais alguém (ou sem você). */
  protected readonly showPeople = computed(() => this.rows().some((r) => r.entry.flow === 'saida' && !!r.entry.people));
  protected readonly usual = computed(() => usualByCategory(this.counted(), this.open()));
  protected readonly strips = computed(() => monthStrips(this.counted(), this.open(), 6));
  protected readonly showMonths = computed(() => this.strips().filter((s) => s.spent || s.income).length > 1);

  /** Como saiu no mês (à vista, Pix, parcelado; uma vez, parcelas, todo mês). */
  protected readonly ways = computed(() => spendWays(this.rows(), this.entries()));
  protected readonly payFocus = computed(() => onlyIn(this.filter(), 'pay'));
  protected readonly kindFocus = computed(() => onlyIn(this.filter(), 'kind'));
  /** O mês de antes, e quanto saiu nele (null sem lançamento lá). */
  protected readonly previousMonth = computed(() => shiftMonth(this.open(), -1));
  protected readonly previousSpent = computed(() => {
    const rows = rowsIn(this.entries(), this.previousMonth());
    return rows.length ? totals(rows, this.entries()).spent : null;
  });

  // ── Vários meses ──
  /** Os meses da vista, a partir do primeiro com lançamento (os de antes do livro não diriam nada). */
  protected readonly period = computed(() => {
    const n = this.span();
    if (!n) return [];
    const first = activeMonths(this.entries())[0];
    const months = periodMonths(this.entries(), this.open(), n);
    const from = months.findIndex((m) => !first || m.month >= first);
    return from > 0 ? months.slice(from) : months;
  });
  protected readonly periodName = computed(() => periodLabel(this.open(), Math.max(1, this.period().length)));
  protected readonly periodTotals = computed(() => periodTotals(this.period()));
  protected readonly previousPeriod = computed(() => {
    const n = this.span();
    return n ? previousPeriod(this.entries(), this.open(), n) : null;
  });
  protected readonly periodWays = computed(() => addWays(this.period().map((m) => spendWays(m.rows, this.entries()))));
  /** A categoria escolhida na tabela: as colunas mostram a parte dela, e os maiores gastos ficam só nela. */
  protected readonly periodFocus = signal<string | null>(null);
  protected readonly categoryLines = computed(() => categoryLines(this.period()));
  protected readonly topSpends = computed(() => {
    const f = this.periodFocus();
    const all = periodSpends(this.period(), this.entries());
    return f ? all.filter((s) => s.entry.category === f) : all;
  });
  protected readonly periodNeedSums = computed(() => {
    const out = new Map<Need | null, number>();
    for (const m of this.period()) for (const [k, v] of spentByNeed(m.rows, this.entries())) out.set(k, (out.get(k) ?? 0) + v);
    return out;
  });
  protected readonly periodNeedCounts = computed(() => {
    const out = new Map<Need | null, number>();
    for (const m of this.period()) for (const r of m.rows) if (r.entry.flow === 'saida') out.set(r.entry.need ?? null, (out.get(r.entry.need ?? null) ?? 0) + 1);
    return out;
  });
  protected readonly periodShowNeeds = computed(() => [...this.periodNeedSums().values()].some((v) => v > 0));
  protected readonly periodPersonSums = computed(() => {
    const out = new Map<string, number>();
    for (const m of this.period()) for (const [k, v] of spentByPerson(m.rows, this.entries())) out.set(k, (out.get(k) ?? 0) + v);
    return out;
  });
  protected readonly periodShowPeople = computed(() => this.period().some((m) => m.rows.some((r) => r.entry.flow === 'saida' && !!r.entry.people)));

  protected readonly plans = computed(() => openPlans(this.entries(), this.open()));
  protected readonly ahead = computed(() => installmentsAhead(this.entries(), this.open()).total);
  protected readonly repeats = computed(() => repeatsIn(this.rows()));

  private readonly filterContext = computed<FilterContext>(() => ({
    categories: this.store.categories(),
    people: this.store.people(),
    refunds: this.refunds(),
    month: this.open(),
  }));
  protected readonly tapeRows = computed(() => filterRows(this.rows(), this.filter(), this.filterContext()));
  protected readonly filtered = computed(() => isFiltered(this.filter()));
  protected readonly filterCount = computed(() => filterCount(this.filter()));
  protected readonly filterGroups = computed(() => filterGroups(this.rows(), this.filter(), this.filterContext()));
  protected readonly chips = computed<FilterChip[]>(() => filterChips(this.filter(), this.filterContext()));

  protected toggleFilter(key: FilterKey, value: string): void {
    this.filter.update((f) => toggleFilter(f, key, value));
  }

  protected removeChip(c: FilterChip): void {
    this.toggleFilter(c.key as FilterKey, c.value);
    if (this.filtered()) this.showTape();
  }

  protected clearFilters(): void {
    this.filter.set({});
  }

  /** Pronto: a cartela fecha e, filtrada, a fita vem até a vista (no celular ela fica bem embaixo). */
  protected toggleFilters(byKeyboard: boolean): void {
    this.filtersByKeyboard.set(byKeyboard);
    this.filtering.set(!this.filtering());
  }

  protected closeFilters(): void {
    this.filtering.set(false);
    this.filterButton()?.nativeElement.focus({ preventScroll: true });
    if (this.filtered()) this.showTape();
  }

  /** Uma peça escolhe só uma opção do grupo dela (ou tira a escolha). No celular a fita fica longe: ela vem até a vista. */
  private choose(key: FilterKey, value: string | null): void {
    this.filter.update((f) => withGroup(f, key, value ? [value] : []));
    if (value) this.showTape();
  }

  /** Escolher um envelope (ou tirar a escolha). "Sem categoria" escolhe todas as categorias que sumiram do livro. */
  protected pick(id: string | readonly string[] | null): void {
    const ids = id === null ? [] : typeof id === 'string' ? [id] : [...id];
    this.filter.update((f) => withGroup(f, 'category', ids));
    if (ids.length) this.showTape();
  }

  /** Escolher uma resposta ao "Precisava?" (`null`: os sem resposta; `undefined`: tirar a escolha). */
  protected pickNeed(n: Need | null | undefined): void {
    this.choose('need', n === undefined ? null : (n ?? 'sem'));
  }

  /** Escolher um pagamento ou um jeito no "Como saiu" (ou tirar a escolha). */
  protected pickWay(p: WayPick): void {
    this.choose(p.group, p.value);
  }

  /** Escolher uma pessoa (ou tirar a escolha). */
  protected pickPerson(id: string | null): void {
    this.choose('person', id);
  }

  private showTape(): void {
    const tape = this.host.nativeElement.querySelector('app-spending-tape');
    const box = tape?.getBoundingClientRect();
    if (tape && box && (box.top > innerHeight - 80 || box.bottom < 80)) tape.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /** Ainda não há nenhum lançamento: a mesa mostra só o que serve para começar. */
  protected readonly blank = computed(() => this.entries().length === 0);

  constructor() {
    // a barra da página conta os lançamentos do mês aberto
    effect(() => {
      const m = this.open();
      untracked(() => this.store.month.set(m));
    });
    effect(() => writeText(NO_FIXED_KEY, this.noFixed() ? '1' : '0'));
    // o dia vira enquanto a página está aberta
    const tick = setInterval(() => this.today.set(todayISO()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  protected go(month: string): void {
    void this.router.navigate([], { queryParams: { mes: month === this.thisMonth() ? null : month }, queryParamsHandling: 'merge' });
  }

  /** Abrir um mês na vista de um mês (de uma coluna ou de um gasto da vista de vários meses). */
  protected openMonth(month: string): void {
    void this.router.navigate([], { queryParams: { mes: month === this.thisMonth() ? null : month, vista: null }, queryParamsHandling: 'merge' });
  }

  /** Trocar a vista: um mês, ou os últimos 3, 6 ou 12 até o aberto. */
  protected setSpan(n: Span | null): void {
    if (n) this.filtering.set(false);
    void this.router.navigate([], { queryParams: { vista: n }, queryParamsHandling: 'merge' });
  }

  protected goToday(): void {
    this.go(this.thisMonth());
  }

  protected step(n: number): void {
    this.go(shiftMonth(this.open(), n));
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
    else if (e.key === 'h' || e.key === 'H') this.goToday();
    else if ((e.key === 'f' || e.key === 'F') && !this.blank() && !this.span()) this.toggleFilters(true);
    else if (VIEWS.some((v) => v.key === e.key) && !this.blank()) this.setSpan(VIEWS.find((v) => v.key === e.key)!.span);
    else return;
    e.preventDefault();
  }
}
