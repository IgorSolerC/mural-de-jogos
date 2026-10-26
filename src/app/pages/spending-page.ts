import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ICON, IconModule } from '../ui/icons';
import { todayISO } from '../core/dates';
import { reducedMotion } from '../core/motion';
import { readText, writeText } from '../core/storage';
import {
  Need,
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
import { FilterContext, FilterKey, SpendingFilter, filterChips, filterCount, filterGroups, filterRows, isFiltered, onlyIn, toggleFilter, withGroup } from '../core/spending-filter';
import { SpendingStore } from '../core/spending-store';
import { FilterChip, FilterTags } from '../ui/filter-sheet';
import { SpendingCategoriesSheet } from '../ui/spending-categories-sheet';
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

/**
 * Os Gastos (`/utilidades/gastos?mes=AAAA-MM`): o dinheiro de um mês, numa mesa.
 *
 * À esquerda, o que se faz: a linha de anotar (o gasto escrito como se fala) e a fita do mês, uma linha
 * baixa por lançamento, para ver o mês inteiro. À direita, o que se vê: o saldo (e quanto ainda dá por dia),
 * os envelopes de cada categoria (com o limite, se tiver), o mês a mês e os carnês abertos. No celular,
 * uma coluna: o saldo, a linha de anotar e a fita, e o resto embaixo.
 *
 * Em cima, a pasta de manilha do Murall (a mesma do Calendário): Este mês, as setas e o nome do mês, e o
 * Filtrar, que abre embaixo a cartela de filtros da fita; os ligados ficam colados na pasta, cada um com o
 * seu X. Os envelopes, o Precisava? e o Por pessoa escolhem o grupo deles nesses mesmos filtros.
 *
 * O mês mora no endereço (Voltar volta ao mês de antes); sem ele, o de hoje. ← e → trocam de mês.
 */
@Component({
  selector: 'app-spending-page',
  imports: [
    FilterTags,
    IconModule,
    SpendingCategoriesSheet,
    SpendingEnvelopes,
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

  private readonly filterButton = viewChild<ElementRef<HTMLButtonElement>>('filtrar');

  private readonly today = signal(todayISO());
  private readonly thisMonth = computed(() => monthOfDay(this.today()));

  /** O mês do endereço, ou o de hoje. */
  protected readonly month = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('mes'))), { initialValue: null });
  protected readonly open = computed(() => {
    const m = this.month();
    return isMonth(m) ? m : this.thisMonth();
  });

  protected readonly title = computed(() => {
    const label = monthLabel(this.open());
    return label[0].toLocaleUpperCase('pt-BR') + label.slice(1);
  });
  protected readonly isThisMonth = computed(() => this.open() === this.thisMonth());
  protected readonly future = computed(() => this.open() > this.thisMonth());

  /** Os filtros da fita (ver core/spending-filter.ts); ficam ao trocar de mês. */
  protected readonly filter = signal<SpendingFilter>({});
  /** A cartela de filtros está aberta. */
  protected readonly filtering = signal(false);
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

  /** As contas dos envelopes e do mês a mês, sem os fixos quando a pessoa pede. */
  private readonly counted = computed(() => (this.noFixed() ? this.entries().filter((e) => !e.monthly) : this.entries()));
  protected readonly sums = computed(() => spentByCategory(rowsIn(this.counted(), this.open()), this.counted()));
  protected readonly needSums = computed(() => spentByNeed(rowsIn(this.counted(), this.open()), this.counted()));
  /** Quantos gastos do mês em cada resposta ao "Precisava?" (a segunda régua da peça). */
  protected readonly needCounts = computed(() => {
    const out = new Map<Need | null, number>();
    for (const r of rowsIn(this.counted(), this.open())) if (r.entry.flow === 'saida') out.set(r.entry.need ?? null, (out.get(r.entry.need ?? null) ?? 0) + 1);
    return out;
  });
  protected readonly showNeeds = computed(() => [...this.needSums().values()].some((v) => v > 0));
  protected readonly personSums = computed(() => spentByPerson(rowsIn(this.counted(), this.open()), this.counted()));
  /** Por pessoa só diz algo quando algum gasto do mês foi com mais alguém (ou sem você). */
  protected readonly showPeople = computed(() => this.rows().some((r) => r.entry.flow === 'saida' && !!r.entry.people));
  protected readonly usual = computed(() => usualByCategory(this.counted(), this.open()));
  protected readonly strips = computed(() => monthStrips(this.counted(), this.open(), 6));
  protected readonly showMonths = computed(() => this.strips().filter((s) => s.spent || s.income).length > 1);

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

  protected clearGroup(key: FilterKey): void {
    this.filter.update((f) => withGroup(f, key, []));
  }

  protected removeChip(c: FilterChip): void {
    this.toggleFilter(c.key as FilterKey, c.value);
    if (this.filtered()) this.showTape();
  }

  protected clearFilters(): void {
    this.filter.set({});
  }

  /** Pronto: a cartela fecha e, filtrada, a fita vem até a vista (no celular ela fica bem embaixo). */
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

  /** Escolher um envelope (ou tirar a escolha). */
  protected pick(id: string | null): void {
    this.choose('category', id || null);
  }

  /** Escolher uma resposta ao "Precisava?" (`null`: os sem resposta; `undefined`: tirar a escolha). */
  protected pickNeed(n: Need | null | undefined): void {
    this.choose('need', n === undefined ? null : (n ?? 'sem'));
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
    else if ((e.key === 'f' || e.key === 'F') && !this.blank()) this.filtering.set(!this.filtering());
    else return;
    e.preventDefault();
  }
}
