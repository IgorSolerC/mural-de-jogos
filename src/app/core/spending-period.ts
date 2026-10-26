import {
  CategorySum,
  Entry,
  PAY_METHODS,
  PayMethod,
  Row,
  monthOfDay,
  rowsIn,
  shiftMonth,
  spentByCategory,
  totals,
} from './spending';

/**
 * As contas dos Gastos que olham além de um mês só: a vista de vários meses (os últimos 3, 6 ou 12 até o
 * mês aberto), como o dinheiro saiu (à vista, Pix ou parcelado; uma vez, parcela ou todo mês), o mês
 * contra o de antes e o gasto de cada dia. Tudo puro, em centavos, com as mesmas regras do mês: um
 * reembolso ligado a um gasto desconta do que saiu (nunca abaixo de zero), no pedaço do gasto.
 */

/** Quantos meses a vista ampla mostra. */
export type Span = 3 | 6 | 12;
export const SPANS: readonly Span[] = [3, 6, 12];

export function isSpan(v: unknown): v is Span {
  return v === 3 || v === 6 || v === 12;
}

/** O jeito de uma saída: uma vez só, uma parcela ou todo mês. */
export type Kind = 'uma' | 'parcela' | 'fixo';
export const KINDS: readonly Kind[] = ['uma', 'parcela', 'fixo'];
export const KIND_LABEL: Record<Kind, string> = { uma: 'Uma vez', parcela: 'Parcelas', fixo: 'Todo mês' };

export function kindOf(e: Pick<Entry, 'monthly' | 'installments'>): Kind {
  return e.monthly ? 'fixo' : e.installments && e.installments > 1 ? 'parcela' : 'uma';
}

/** Um mês na vista ampla. */
export interface PeriodMonth {
  month: string;
  rows: Row[];
  /** O que entrou (sem os reembolsos ligados). */
  income: number;
  /** O que saiu, já sem o que voltou. */
  spent: number;
  balance: number;
  /** Do que saiu, o que já vinha de antes (fixos e parcelas depois da primeira). */
  committed: number;
  /** Do que saiu, os fixos e todas as parcelas (a primeira também). */
  planned: number;
  byCategory: CategorySum[];
}

/** Os `n` meses que acabam em `end`, o mais antigo primeiro. */
export function periodMonths(entries: readonly Entry[], end: string, n: number): PeriodMonth[] {
  const out: PeriodMonth[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const month = shiftMonth(end, -i);
    const rows = rowsIn(entries, month);
    const t = totals(rows, entries);
    const ways = spendWays(rows, entries);
    out.push({ month, rows, ...t, planned: ways.kind.parcela.amount + ways.kind.fixo.amount, byCategory: spentByCategory(rows, entries) });
  }
  return out;
}

/** O período inteiro somado. */
export interface PeriodTotals {
  income: number;
  spent: number;
  balance: number;
  /** Quantos meses do período tiveram algum lançamento. */
  active: number;
  /** A média do que saiu por mês com lançamento. */
  avgSpent: number;
  /** O mês em que mais saiu e o em que menos saiu (dos que tiveram saída). */
  most: PeriodMonth | null;
  least: PeriodMonth | null;
}

export function periodTotals(months: readonly PeriodMonth[]): PeriodTotals {
  const active = months.filter((m) => m.rows.length);
  const withSpent = months.filter((m) => m.spent > 0);
  const spent = months.reduce((s, m) => s + m.spent, 0);
  const income = months.reduce((s, m) => s + m.income, 0);
  const pick = (better: (a: PeriodMonth, b: PeriodMonth) => boolean) => withSpent.reduce<PeriodMonth | null>((x, m) => (!x || better(m, x) ? m : x), null);
  return {
    income,
    spent,
    balance: income - spent,
    active: active.length,
    avgSpent: active.length ? Math.round(spent / active.length) : 0,
    most: pick((a, b) => a.spent > b.spent),
    least: withSpent.length > 1 ? pick((a, b) => a.spent < b.spent) : null,
  };
}

/** Quanto e quantos gastos num pedaço. */
export interface Slice {
  amount: number;
  count: number;
}

/** Como o dinheiro saiu: por pagamento e por jeito. */
export interface SpendWays {
  /** O que saiu, já sem o que voltou. */
  total: number;
  pay: Record<PayMethod, Slice>;
  kind: Record<Kind, Slice>;
}

/**
 * Como o que saiu foi pago (à vista, Pix, parcelado) e de que jeito (uma vez, parcela, todo mês). O
 * reembolso ligado desconta do pedaço do gasto que ele paga de volta, no mês em que o dinheiro voltou.
 */
export function spendWays(rows: readonly Row[], entries: readonly Entry[]): SpendWays {
  const pay = Object.fromEntries(PAY_METHODS.map((p) => [p, { amount: 0, count: 0 }])) as Record<PayMethod, Slice>;
  const kind = Object.fromEntries(KINDS.map((k) => [k, { amount: 0, count: 0 }])) as Record<Kind, Slice>;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const payOf = (e: Entry): PayMethod => (e.installments && e.installments > 1 && !e.monthly ? 'parcelado' : e.pay === 'pix' ? 'pix' : 'avista');
  for (const r of rows) {
    if (r.entry.flow !== 'saida') continue;
    for (const s of [pay[payOf(r.entry)], kind[kindOf(r.entry)]]) {
      s.amount += r.amount;
      s.count++;
    }
  }
  for (const r of rows) {
    const of = r.entry.flow === 'entrada' && r.entry.refundOf ? byId.get(r.entry.refundOf) : undefined;
    if (!of || of.flow !== 'saida') continue;
    for (const s of [pay[payOf(of)], kind[kindOf(of)]]) s.amount = Math.max(0, s.amount - r.amount);
  }
  const total = PAY_METHODS.reduce((n, p) => n + pay[p].amount, 0);
  return { total, pay, kind };
}

/** Os jeitos de vários meses somados. */
export function addWays(list: readonly SpendWays[]): SpendWays {
  const pay = Object.fromEntries(PAY_METHODS.map((p) => [p, { amount: 0, count: 0 }])) as Record<PayMethod, Slice>;
  const kind = Object.fromEntries(KINDS.map((k) => [k, { amount: 0, count: 0 }])) as Record<Kind, Slice>;
  let total = 0;
  for (const w of list) {
    total += w.total;
    for (const p of PAY_METHODS) {
      pay[p].amount += w.pay[p].amount;
      pay[p].count += w.pay[p].count;
    }
    for (const k of KINDS) {
      kind[k].amount += w.kind[k].amount;
      kind[k].count += w.kind[k].count;
    }
  }
  return { total, pay, kind };
}

/** Uma categoria mês a mês, na tabela da vista ampla. */
export interface CategoryLine {
  id: string;
  /** O que saiu em cada mês do período, na ordem dos meses. */
  cells: number[];
  total: number;
  /** A média por mês com lançamento. */
  avg: number;
}

/** As categorias de saída do período, a de mais gasto primeiro, com o valor de cada mês. */
export function categoryLines(months: readonly PeriodMonth[]): CategoryLine[] {
  const ids = new Set(months.flatMap((m) => m.byCategory.filter((c) => c.amount > 0).map((c) => c.id)));
  const active = Math.max(1, months.filter((m) => m.rows.length).length);
  return [...ids]
    .map((id) => {
      const cells = months.map((m) => m.byCategory.find((c) => c.id === id)?.amount ?? 0);
      const total = cells.reduce((s, v) => s + v, 0);
      return { id, cells, total, avg: Math.round(total / active) };
    })
    .sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1));
}

/** Um gasto somado no período (as parcelas e os meses de um fixo juntos). */
export interface PeriodSpend {
  entry: Entry;
  /** Quanto saiu dele no período, já sem o que voltou. */
  total: number;
  /** Em quantos meses do período ele aparece. */
  months: number;
  /** O último mês do período em que ele aparece (para abrir). */
  last: string;
}

/** Os gastos do período, o maior primeiro: cada lançamento uma vez, com tudo o que saiu dele nos meses. */
export function periodSpends(months: readonly PeriodMonth[], entries: readonly Entry[]): PeriodSpend[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const sums = new Map<string, PeriodSpend>();
  for (const m of months) {
    for (const r of m.rows) {
      if (r.entry.flow !== 'saida') continue;
      const s = sums.get(r.entry.id);
      if (s) {
        s.total += r.amount;
        s.months++;
        s.last = m.month;
      } else sums.set(r.entry.id, { entry: r.entry, total: r.amount, months: 1, last: m.month });
    }
  }
  for (const m of months) {
    for (const r of m.rows) {
      const of = r.entry.flow === 'entrada' && r.entry.refundOf ? byId.get(r.entry.refundOf) : undefined;
      const s = of && sums.get(of.id);
      if (s) s.total = Math.max(0, s.total - r.amount);
    }
  }
  return [...sums.values()].sort((a, b) => b.total - a.total || (a.entry.createdAt < b.entry.createdAt ? 1 : -1));
}

/** Uma categoria neste mês, no de antes e no costume. */
export interface Versus {
  id: string;
  now: number;
  before: number;
  /** A média dos meses de antes com lançamento (até 3), quando há. */
  usual?: number;
}

/** As categorias de saída deste mês e do de antes, lado a lado, as maiores (de qualquer dos dois) primeiro. */
export function monthVersus(entries: readonly Entry[], month: string, usual?: ReadonlyMap<string, number>): Versus[] {
  const now = spentByCategory(rowsIn(entries, month), entries);
  const prev = spentByCategory(rowsIn(entries, shiftMonth(month, -1)), entries);
  const ids = new Set([...now, ...prev].filter((c) => c.amount > 0).map((c) => c.id));
  return [...ids]
    .map((id) => ({
      id,
      now: now.find((c) => c.id === id)?.amount ?? 0,
      before: prev.find((c) => c.id === id)?.amount ?? 0,
      ...(usual?.get(id) ? { usual: Math.round(usual.get(id)!) } : {}),
    }))
    .sort((a, b) => Math.max(b.now, b.before) - Math.max(a.now, a.before) || (a.id < b.id ? -1 : 1));
}

/** O que saiu em cada dia do mês (índice 0 = dia 1), já sem o que voltou; o que é de um dia de outro mês fica no primeiro ou no último. */
export function spentByDay(rows: readonly Row[], month: string, entries: readonly Entry[]): number[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out = Array.from({ length: days }, () => 0);
  const indexOf = (day: string) => (monthOfDay(day) < month ? 0 : monthOfDay(day) > month ? days - 1 : Number(day.slice(8, 10)) - 1);
  const expenses = new Set(entries.filter((e) => e.flow === 'saida').map((e) => e.id));
  for (const r of rows) {
    if (r.entry.flow === 'saida') out[indexOf(r.day)] += r.amount;
  }
  for (const r of rows) {
    if (r.entry.flow === 'entrada' && r.entry.refundOf && expenses.has(r.entry.refundOf)) {
      const i = indexOf(r.day);
      out[i] = Math.max(0, out[i] - r.amount);
    }
  }
  return out;
}

/** Os `n` meses logo antes do período, somados, para comparar (null se lá não há lançamento nenhum). */
export function previousPeriod(entries: readonly Entry[], end: string, n: number): PeriodTotals | null {
  const before = periodMonths(entries, shiftMonth(end, -n), n);
  return before.some((m) => m.rows.length) ? periodTotals(before) : null;
}

/** "mai a out de 2026", ou "nov/25 a out/26" quando o período passa de um ano para outro. */
export function periodLabel(end: string, n: number): string {
  const start = shiftMonth(end, -(n - 1));
  const short = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [y1, m1] = start.split('-').map(Number);
  const [y2, m2] = end.split('-').map(Number);
  if (y1 === y2) return `${short[m1 - 1]} a ${short[m2 - 1]} de ${y2}`;
  return `${short[m1 - 1]}/${String(y1).slice(2)} a ${short[m2 - 1]}/${String(y2).slice(2)}`;
}
