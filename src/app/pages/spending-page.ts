import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ICON, IconModule } from '../ui/icons';
import { todayISO } from '../core/dates';
import { reducedMotion } from '../core/motion';
import { readText, writeText } from '../core/storage';
import {
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
  totals,
  usualByCategory,
} from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { SpendingCategoriesSheet } from '../ui/spending-categories-sheet';
import { SpendingEnvelopes } from '../ui/spending-envelopes';
import { SpendingMonths } from '../ui/spending-months';
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
 * O mês mora no endereço (Voltar volta ao mês de antes); sem ele, o de hoje. ← e → trocam de mês.
 */
@Component({
  selector: 'app-spending-page',
  imports: [IconModule, SpendingCategoriesSheet, SpendingEnvelopes, SpendingMonths, SpendingPlans, SpendingQuick, SpendingSummary, SpendingTape],
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

  /** O envelope escolhido: a fita mostra só ele e o mês a mês, a parte dele. */
  protected readonly focus = signal<string | null>(null);
  protected readonly noFixed = signal(readText(NO_FIXED_KEY) === '1');
  protected readonly managing = signal(false);

  private readonly entries = computed(() => this.store.entries());
  protected readonly rows = computed(() => rowsIn(this.entries(), this.open()));
  protected readonly totals = computed(() => totals(this.rows(), this.entries()));
  protected readonly days = computed(() => dailyBalance(this.rows(), this.open(), this.isThisMonth() ? this.today() : undefined));
  protected readonly left = computed(() => daysLeft(this.open(), this.today()));
  protected readonly refunds = computed(() => refundsByExpense(this.entries()));

  /** As contas dos envelopes e do mês a mês, sem os fixos quando a pessoa pede. */
  private readonly counted = computed(() => (this.noFixed() ? this.entries().filter((e) => !e.monthly) : this.entries()));
  protected readonly sums = computed(() => spentByCategory(rowsIn(this.counted(), this.open()), this.counted()));
  protected readonly usual = computed(() => usualByCategory(this.counted(), this.open()));
  protected readonly strips = computed(() => monthStrips(this.counted(), this.open(), 6));
  protected readonly showMonths = computed(() => this.strips().filter((s) => s.spent || s.income).length > 1);

  protected readonly plans = computed(() => openPlans(this.entries(), this.open()));
  protected readonly ahead = computed(() => installmentsAhead(this.entries(), this.open()).total);
  protected readonly repeats = computed(() => repeatsIn(this.rows()));

  protected readonly tapeRows = computed(() => {
    const f = this.focus();
    return f ? this.rows().filter((r) => r.entry.category === f) : this.rows();
  });

  /** Escolher um envelope (ou tirar a escolha). No celular a fita fica longe dos envelopes: ela vem até a vista. */
  protected pick(id: string | null): void {
    this.focus.set(id || null);
    if (!id) return;
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
    // trocar de mês esquece o envelope escolhido só se ele não tiver nada no mês novo
    effect(() => {
      const sums = this.sums();
      const f = untracked(() => this.focus());
      if (f && !sums.some((s) => s.id === f)) untracked(() => this.focus.set(null));
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
    else return;
    e.preventDefault();
  }
}
