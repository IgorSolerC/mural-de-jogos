import { MONTHS_LONG, MONTHS_SHORT } from './dates';
import { STOCKS, Stock } from './review';
import { cleanLabel, fold } from './text';

/**
 * Os Gastos (`/utilidades/gastos`): o dinheiro do mês. Cada lançamento é uma saída ou uma entrada de
 * dinheiro, com um nome, o valor, uma categoria e, nas saídas, como foi pago (à vista, Pix ou
 * parcelado) e se precisava (luxo, conforto ou indispensável).
 *
 * O que a planilha pedia à mão vira regra aqui:
 * - **parcelado** guarda o valor de cada parcela e quantas são, a partir do mês da primeira: cada mês
 *   mostra a dele ("7/10") sem ninguém lançar de novo;
 * - **fixo** (salário, aluguel, as contas) se repete todo mês desde o primeiro; mudar o valor num mês vale
 *   dali em diante (`values`), e um mês pode ficar de fora (`skip`) ou ser o último (`until`);
 * - o **reembolso** (uma entrada) pode dizer de que gasto ele é (`refundOf`): o gasto mostra quanto voltou,
 *   e as contas por categoria usam o que ele custou de verdade;
 * - um lançamento de uma vez ou parcelado pode **contar noutro mês** (`shift`): a compra do dia 3 de
 *   outubro que vem na fatura de setembro conta em setembro (o mês de antes ou o de depois do dia dele);
 * - cada saída é **com alguém** (`people`): você, por padrão, e quem mais estava junto. Por pessoa, o gasto
 *   conta dividido em partes iguais (o jantar de R$ 600 com três vale R$ 200 para cada um).
 *
 * Os valores são em centavos (inteiros, sempre positivos; a direção diz o sinal), os dias 'AAAA-MM-DD' e
 * os meses 'AAAA-MM'. Tudo aqui é puro.
 *
 * Guardado neste navegador e no mural privado da nuvem (`gastos`), lançamento a lançamento e categoria a
 * categoria: vale o mudado por último, e os apagados são lembrados (ver `mergeSpending`). Nunca no mural
 * público nem no arquivo de backup, como o Calendário.
 */

/** Saída (gastou) ou entrada (recebeu). */
export type Flow = 'saida' | 'entrada';
export const FLOWS: readonly Flow[] = ['saida', 'entrada'];

/** Como a saída foi paga. */
export type PayMethod = 'avista' | 'pix' | 'parcelado';
export const PAY_METHODS: readonly PayMethod[] = ['avista', 'pix', 'parcelado'];
export const PAY_LABEL: Record<PayMethod, string> = { avista: 'À vista', pix: 'Pix', parcelado: 'Parcelado' };

/**
 * Se a saída precisava, do supérfluo ao que não tem como contornar: luxo (dava para não ter), conforto
 * (um luxo, mas que faz falta) ou indispensável (sem escolha). Sem nada, a pessoa ainda não disse.
 */
export type Need = 'luxo' | 'conforto' | 'indispensavel';
export const NEEDS: readonly Need[] = ['luxo', 'conforto', 'indispensavel'];
export const NEED_LABEL: Record<Need, string> = { luxo: 'Luxo', conforto: 'Conforto', indispensavel: 'Indispensável' };

/** As palavras que marcam a necessidade na linha de anotar ("#luxo", "#conforto"), já sem acento. */
export const NEED_WORDS: Readonly<Record<string, Need>> = {
  luxo: 'luxo',
  superfluo: 'luxo',
  conforto: 'conforto',
  indispensavel: 'indispensavel',
  essencial: 'indispensavel',
  necessario: 'indispensavel',
  necessaria: 'indispensavel',
};

export function isNeed(v: unknown): v is Need {
  return typeof v === 'string' && (NEEDS as readonly string[]).includes(v);
}

export const TITLE_MAX = 80;
export const CATEGORY_NAME_MAX = 24;
export const PERSON_NAME_MAX = 24;
/** Até quantas pessoas num gasto. */
export const MAX_PEOPLE = 20;
/** Até R$ 10 milhões num lançamento. */
export const AMOUNT_MAX = 1_000_000_000;
export const MAX_INSTALLMENTS = 72;
const MAX_ENTRIES = 20_000;
const MAX_CATEGORIES = 80;
const MAX_PERSONS = 120;

export interface SpendingCategory {
  id: string;
  name: string;
  flow: Flow;
  /** A cartolina da categoria: o envelope, a etiqueta na fita e a faixa nos gráficos. */
  color: Stock;
  /** O limite do mês (centavos), só nas saídas: o envelope estoura quando passa. */
  budget?: number;
  /** Quando mudou por último (a junção entre aparelhos). */
  at: string;
}

/** Alguém com quem se gasta (a Bruna, o Biel). Você é a pessoa `eu`, que está em todo livro. */
export interface SpendingPerson {
  id: string;
  name: string;
  /** Quando mudou por último (a junção entre aparelhos). */
  at: string;
}

/** Você: a pessoa de todo gasto que não diz outra coisa. */
export const ME = 'eu';

export interface Entry {
  id: string;
  title: string;
  /** Em centavos. No parcelado, o valor de cada parcela; no fixo, o do primeiro mês. */
  amount: number;
  flow: Flow;
  /** O id da categoria (uma que sumiu conta como "Sem categoria"). */
  category: string;
  /** Só nas saídas. */
  pay?: PayMethod;
  /** Só nas saídas: se precisava. */
  need?: Need;
  /** Só nas saídas: com quem foi (ids das pessoas, ao menos uma). Sem nada, só você (`[ME]`). */
  people?: string[];
  /** O dia: no parcelado, o da primeira parcela; no fixo, o do primeiro mês. */
  date: string;
  /** Parcelado: quantas parcelas (2 ou mais). */
  installments?: number;
  /**
   * Uma vez só ou parcelado: conta no mês de antes (-1) ou no de depois (1) do mês de `date` (a fatura do
   * cartão que vira no dia 8). As parcelas seguintes andam junto. Sem nada, no mês do dia.
   */
  shift?: Shift;
  /** Fixo: repete todo mês, a partir do mês de `date`. */
  monthly?: true;
  /** Fixo: o último mês ('AAAA-MM'). */
  until?: string;
  /** Fixo: o valor a partir de um mês ('AAAA-MM' → centavos), até o próximo. */
  values?: Record<string, number>;
  /** Fixo: os meses que ficaram de fora. */
  skip?: string[];
  /** Entrada: o gasto que ela paga de volta (o reembolso do churrasco). */
  refundOf?: string;
  createdAt: string;
  at: string;
}

/** Para que mês o lançamento conta, perto do mês do dia dele: o de antes ou o de depois. */
export type Shift = -1 | 1;

export interface SpendingState {
  entries: Entry[];
  categories: SpendingCategory[];
  /** As pessoas dos gastos; você (`ME`) está sempre. */
  people: SpendingPerson[];
  /** Os lançamentos, as categorias e as pessoas apagados (id → quando). */
  removed: Record<string, string>;
}

/** As categorias de sempre nascem com esta data: qualquer mudança da pessoa é mais nova. */
const BORN = '2026-01-01T00:00:00.000Z';

/** As categorias com que todo livro começa (as da planilha da pessoa), com ids fixos: iguais em todo aparelho. */
export const DEFAULT_CATEGORIES: readonly SpendingCategory[] = [
  { id: 'comida', name: 'Comida', flow: 'saida', color: 'laranja', at: BORN },
  { id: 'mercado', name: 'Mercado', flow: 'saida', color: 'amarelo', at: BORN },
  { id: 'conta', name: 'Conta', flow: 'saida', color: 'azul', at: BORN },
  { id: 'aluguel', name: 'Aluguel', flow: 'saida', color: 'cinza', at: BORN },
  { id: 'luxo', name: 'Item', flow: 'saida', color: 'lilas', at: BORN },
  { id: 'eventos', name: 'Eventos', flow: 'saida', color: 'rosa', at: BORN },
  { id: 'presente', name: 'Presente', flow: 'saida', color: 'vermelho', at: BORN },
  { id: 'estudos', name: 'Estudos', flow: 'saida', color: 'verde', at: BORN },
  { id: 'transporte', name: 'Transporte', flow: 'saida', color: 'azul-escuro', at: BORN },
  { id: 'mensalidade', name: 'Mensalidade', flow: 'saida', color: 'lilas-escuro', at: BORN },
  { id: 'outros', name: 'Outros', flow: 'saida', color: 'cinza-escuro', at: BORN },
  { id: 'renda', name: 'Renda', flow: 'entrada', color: 'verde', at: BORN },
  { id: 'pix', name: 'Pix', flow: 'entrada', color: 'azul', at: BORN },
  { id: 'reembolso', name: 'Reembolso', flow: 'entrada', color: 'amarelo', at: BORN },
  { id: 'outras-entradas', name: 'Outros', flow: 'entrada', color: 'cinza', at: BORN },
];

/** Você, como nasce em todo livro (o nome pode mudar; apagar, não). */
export const DEFAULT_PERSON: SpendingPerson = { id: ME, name: 'Eu', at: BORN };

export const EMPTY_SPENDING: SpendingState = { entries: [], categories: [...DEFAULT_CATEGORIES], people: [DEFAULT_PERSON], removed: {} };

// ── Dinheiro ────────────────────────────────────────────────────────────────────────────────────────

const moneyFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** "1.234,56" (sem o R$). */
export function money(cents: number): string {
  return moneyFmt.format(cents / 100);
}

/** "R$ 1.234,56", com o sinal na frente quando negativo ("−R$ 12,00"). */
export function brl(cents: number): string {
  return (cents < 0 ? '−' : '') + 'R$ ' + money(Math.abs(cents));
}

/** "R$ 1.235": arredondado, para os gráficos. */
export function brlShort(cents: number): string {
  return (cents < 0 ? '−' : '') + 'R$ ' + wholeFmt.format(Math.round(Math.abs(cents) / 100));
}

/**
 * O valor digitado, em centavos: "1.234,56", "1234,5", "1234.56", "R$ 44", "44,". Vírgula é sempre a dos
 * centavos; um ponto só é dos centavos quando é o único e tem uma ou duas casas depois dele ("12.5"). Nada
 * que dê para ler, ou zero: null.
 */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/r\$|\s| /gi, '');
  if (!s || /[^\d.,]/.test(s)) return null;
  if (s.includes(',')) {
    const [int, ...rest] = s.split(',');
    if (rest.length > 1) return null;
    s = int.replace(/\./g, '') + '.' + (rest[0] ?? '');
  } else if ((s.match(/\./g) ?? []).length === 1 && /\.\d{1,2}$/.test(s)) {
    // "12.5" e "12.50": centavos
  } else {
    s = s.replace(/\./g, '');
  }
  if (s.endsWith('.')) s = s.slice(0, -1);
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 && cents <= AMOUNT_MAX ? cents : null;
}

/** O valor no campo, para editar: "1234,56" (sem os pontos de milhar, que atrapalham ao apagar). */
export function moneyInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ── Meses ───────────────────────────────────────────────────────────────────────────────────────────

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v);
}

export function isDay(v: unknown): v is string {
  return typeof v === 'string' && DAY_RE.test(v);
}

/** O mês de um dia. */
export function monthOfDay(day: string): string {
  return day.slice(0, 7);
}

/** O mês `n` meses depois (ou antes, com `n` negativo). */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

/** Quantos meses de `from` até `to` (negativo se `to` vem antes). */
export function monthsBetween(from: string, to: string): number {
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** "outubro de 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} de ${y}`;
}

/** "out" (e "out/25" quando o ano não é `year`). */
export function monthShort(month: string, year?: number): string {
  const [y, m] = month.split('-').map(Number);
  return MONTHS_SHORT[m - 1] + (year !== undefined && y !== year ? `/${String(y).slice(2)}` : '');
}

function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** O mesmo dia do mês em outro mês (o 31 cai no último dia dos meses mais curtos). */
export function dayIn(month: string, day: string): string {
  const d = Math.min(Number(day.slice(8, 10)), daysIn(month));
  return `${month}-${String(d).padStart(2, '0')}`;
}

// ── O mês ───────────────────────────────────────────────────────────────────────────────────────────

/** Um lançamento como ele aparece num mês. */
export interface Row {
  entry: Entry;
  /** O dia, dentro do mês. */
  day: string;
  /** O valor neste mês, em centavos. */
  amount: number;
  /** Parcelado: esta parcela (1 é a primeira) e quantas são. */
  part?: { n: number; of: number };
  /** Fixo: repete todo mês. */
  fixed?: true;
}

/** O valor de um fixo num mês: o último valor mudado até ele (ou o de quando nasceu). */
export function fixedValue(e: Pick<Entry, 'amount' | 'values'>, month: string): number {
  let best: string | null = null;
  for (const m of Object.keys(e.values ?? {})) if (m <= month && (best === null || m > best)) best = m;
  return best === null ? e.amount : e.values![best];
}

/** O mês em que o lançamento conta pela primeira vez: o do dia, ou o de antes ou de depois (`shift`). */
export function firstMonth(e: Pick<Entry, 'date' | 'shift' | 'monthly'>): string {
  const m = monthOfDay(e.date);
  return e.shift && !e.monthly ? shiftMonth(m, e.shift) : m;
}

/**
 * O lançamento num mês, se ele aparece lá. O dia da linha é sempre o de verdade: a compra de 3 de outubro
 * que conta em setembro aparece em setembro com o dia 3 de outubro (e cada parcela seguinte, um mês depois).
 */
export function rowIn(e: Entry, month: string): Row | null {
  const first = firstMonth(e);
  if (e.monthly) {
    if (month < first || (e.until && month > e.until) || e.skip?.includes(month)) return null;
    return { entry: e, day: dayIn(month, e.date), amount: fixedValue(e, month), fixed: true };
  }
  if (e.installments && e.installments > 1) {
    const k = monthsBetween(first, month);
    if (k < 0 || k >= e.installments) return null;
    return { entry: e, day: dayIn(shiftMonth(month, -(e.shift ?? 0)), e.date), amount: e.amount, part: { n: k + 1, of: e.installments } };
  }
  return first === month ? { entry: e, day: e.date, amount: e.amount } : null;
}

/** Os lançamentos do mês, do dia mais recente para o mais antigo (no mesmo dia, o lançado por último antes). */
export function rowsIn(entries: readonly Entry[], month: string): Row[] {
  const out: Row[] = [];
  for (const e of entries) {
    const r = rowIn(e, month);
    if (r) out.push(r);
  }
  return out.sort((a, b) => (a.day !== b.day ? (a.day < b.day ? 1 : -1) : a.entry.createdAt < b.entry.createdAt ? 1 : -1));
}

/** Os meses em que há algum lançamento lançado de fato (o primeiro mês de cada um), do mais antigo ao mais novo. */
export function activeMonths(entries: readonly Entry[]): string[] {
  return [...new Set(entries.map((e) => firstMonth(e)))].sort();
}

export interface MonthTotals {
  /** Quanto entrou (sem os reembolsos ligados a um gasto: esses descontam do que saiu). */
  income: number;
  /** Quanto saiu, já sem o que voltou. */
  spent: number;
  /** Entrou menos saiu. */
  balance: number;
  /** Do que saiu, o que já vinha de antes: fixos e parcelas. */
  committed: number;
}

/**
 * Os totais do mês. Um reembolso ligado a um gasto (de qualquer mês) não é dinheiro novo: ele desconta do
 * que saiu, como nos envelopes e no mês a mês, e o saldo fica o mesmo. Sem `entries`, todo reembolso conta
 * como entrada.
 */
export function totals(rows: readonly Row[], entries: readonly Entry[] = []): MonthTotals {
  const expenses = new Set(entries.filter((e) => e.flow === 'saida').map((e) => e.id));
  let income = 0;
  let spent = 0;
  let committed = 0;
  for (const r of rows) {
    if (r.entry.flow === 'entrada') {
      if (r.entry.refundOf && expenses.has(r.entry.refundOf)) spent -= r.amount;
      else income += r.amount;
    } else {
      spent += r.amount;
      if (r.fixed || (r.part && r.part.n > 1)) committed += r.amount;
    }
  }
  return { income, spent, balance: income - spent, committed };
}

/** Quanto já voltou de cada gasto (id do gasto → centavos), em qualquer mês. */
export function refundsByExpense(entries: readonly Entry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    if (e.flow !== 'entrada' || !e.refundOf || e.monthly || e.installments) continue;
    out.set(e.refundOf, (out.get(e.refundOf) ?? 0) + e.amount);
  }
  return out;
}

/** Uma categoria e quanto foi nela num mês. */
export interface CategorySum {
  id: string;
  amount: number;
}

/**
 * Quanto saiu em cada categoria no mês, do maior para o menor, já sem o que voltou: um reembolso ligado a
 * um gasto tira o valor dele da categoria do gasto, no mês em que o dinheiro voltou (nunca abaixo de zero).
 */
export function spentByCategory(rows: readonly Row[], entries: readonly Entry[]): CategorySum[] {
  return [...spentBy(rows, entries, (e) => e.category)].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount || (a.id < b.id ? -1 : 1));
}

/** Quanto saiu no mês em cada necessidade (`null`: sem resposta), já sem o que voltou. Só as que tiveram gasto. */
export function spentByNeed(rows: readonly Row[], entries: readonly Entry[]): Map<Need | null, number> {
  return spentBy(rows, entries, (e) => e.need ?? null);
}

/** Com quem foi a saída: as pessoas dela, ou só você. */
export function peopleOf(e: Pick<Entry, 'people'>): string[] {
  return e.people?.length ? e.people : [ME];
}

/**
 * Um valor dividido em partes iguais entre `n` pessoas, em centavos inteiros que somam o valor: os centavos
 * que sobram vão um para cada, a começar pela primeira (R$ 100 entre três: 33,34 + 33,33 + 33,33).
 */
export function splitAmount(amount: number, n: number): number[] {
  const base = Math.floor(amount / n);
  return Array.from({ length: n }, (_, i) => base + (i < amount - base * n ? 1 : 0));
}

/** A parte de uma pessoa num gasto (0 se ela não estava). */
export function shareOf(e: Pick<Entry, 'people'>, amount: number, person: string): number {
  const people = peopleOf(e);
  const i = people.indexOf(person);
  return i < 0 ? 0 : splitAmount(amount, people.length)[i];
}

/**
 * Quanto saiu no mês com cada pessoa (id → centavos), cada gasto dividido em partes iguais entre as pessoas
 * dele, já sem o que voltou: o reembolso ligado desconta das mesmas pessoas, na mesma divisão (nunca abaixo
 * de zero). Só as pessoas que tiveram gasto.
 */
export function spentByPerson(rows: readonly Row[], entries: readonly Entry[]): Map<string, number> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const sums = new Map<string, number>();
  for (const r of rows) {
    if (r.entry.flow !== 'saida') continue;
    const people = peopleOf(r.entry);
    splitAmount(r.amount, people.length).forEach((v, i) => sums.set(people[i], (sums.get(people[i]) ?? 0) + v));
  }
  for (const r of rows) {
    const of = r.entry.flow === 'entrada' && r.entry.refundOf ? byId.get(r.entry.refundOf) : undefined;
    if (!of || of.flow !== 'saida') continue;
    const people = peopleOf(of);
    splitAmount(r.amount, people.length).forEach((v, i) => {
      if (sums.has(people[i])) sums.set(people[i], Math.max(0, sums.get(people[i])! - v));
    });
  }
  return sums;
}

/** Quanto saiu no mês em cada pedaço (`keyOf`), já sem o que voltou: o reembolso desconta do pedaço do gasto. */
function spentBy<K>(rows: readonly Row[], entries: readonly Entry[], keyOf: (e: Entry) => K): Map<K, number> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const sums = new Map<K, number>();
  for (const r of rows) {
    if (r.entry.flow === 'saida') sums.set(keyOf(r.entry), (sums.get(keyOf(r.entry)) ?? 0) + r.amount);
  }
  for (const r of rows) {
    const of = r.entry.flow === 'entrada' && r.entry.refundOf ? byId.get(r.entry.refundOf) : undefined;
    if (!of || of.flow !== 'saida') continue;
    const k = keyOf(of);
    if (sums.has(k)) sums.set(k, Math.max(0, sums.get(k)! - r.amount));
  }
  return sums;
}

/** O que entrou em cada categoria no mês, do maior para o menor. */
export function incomeByCategory(rows: readonly Row[]): CategorySum[] {
  const sums = new Map<string, number>();
  for (const r of rows) if (r.entry.flow === 'entrada') sums.set(r.entry.category, (sums.get(r.entry.category) ?? 0) + r.amount);
  return [...sums].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount || (a.id < b.id ? -1 : 1));
}

/**
 * A média de cada categoria nos meses antes deste que têm algum lançamento (até `span` deles), para dizer
 * se este mês foi acima ou abaixo do costume. Sem mês nenhum antes: vazio.
 */
export function usualByCategory(
  entries: readonly Entry[],
  month: string,
  span = 3,
): { months: number; avg: Map<string, number>; seen: Map<string, number> } {
  const before = activeMonths(entries)
    .filter((m) => m < month)
    .slice(-span);
  const avg = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const m of before) {
    for (const s of spentByCategory(rowsIn(entries, m), entries)) {
      avg.set(s.id, (avg.get(s.id) ?? 0) + s.amount / before.length);
      if (s.amount > 0) seen.set(s.id, (seen.get(s.id) ?? 0) + 1);
    }
  }
  return { months: before.length, avg, seen };
}

/**
 * A diferença de uma categoria para o costume (0,38 = 38% acima), só quando ela diz alguma coisa: a
 * categoria teve gasto em pelo menos 2 dos meses de antes, e a diferença passa de 15% e de R$ 50. Uma
 * compra de uma vez só (a pós) não vira "83× o costume".
 */
export function usualDelta(amount: number, avg: number | undefined, seen: number | undefined): number | undefined {
  if (!avg || (seen ?? 0) < 2) return undefined;
  const d = amount / avg - 1;
  return Math.abs(d) >= 0.15 && Math.abs(amount - avg) >= 5000 ? d : undefined;
}

/** Um mês na comparação mês a mês. */
export interface MonthStrip {
  month: string;
  income: number;
  spent: number;
  byCategory: CategorySum[];
}

/** Os `n` meses que acabam em `month` (o mais antigo primeiro), como as faixas do mês a mês. */
export function monthStrips(entries: readonly Entry[], month: string, n = 6): MonthStrip[] {
  const out: MonthStrip[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = shiftMonth(month, -i);
    const rows = rowsIn(entries, m);
    const byCategory = spentByCategory(rows, entries);
    out.push({ month: m, income: totals(rows, entries).income, spent: byCategory.reduce((s, c) => s + c.amount, 0), byCategory });
  }
  return out;
}

/** Um ponto do saldo dia a dia: o saldo no fim do dia. */
export interface DayBalance {
  day: string;
  balance: number;
}

/**
 * O saldo do mês dia a dia (o que entrou menos o que saiu, somado até o fim de cada dia), do dia 1 ao
 * último dia do mês (ou até `until`, para o mês corrente parar em hoje). O que conta neste mês mas é de
 * um dia de outro (`shift`) entra no último dia (o do mês seguinte) ou no primeiro (o do anterior).
 */
export function dailyBalance(rows: readonly Row[], month: string, until?: string): DayBalance[] {
  const byDay = new Map<string, number>();
  const last = `${month}-${String(daysIn(month)).padStart(2, '0')}`;
  for (const r of rows) {
    const day = r.day > last ? last : r.day < `${month}-01` ? `${month}-01` : r.day;
    byDay.set(day, (byDay.get(day) ?? 0) + (r.entry.flow === 'entrada' ? r.amount : -r.amount));
  }
  const out: DayBalance[] = [];
  let balance = 0;
  for (let d = 1; d <= daysIn(month); d++) {
    const day = `${month}-${String(d).padStart(2, '0')}`;
    if (until && day > until) break;
    balance += byDay.get(day) ?? 0;
    out.push({ day, balance });
  }
  return out;
}

/** Os dias que faltam no mês depois de `today` (contando hoje). */
export function daysLeft(month: string, today: string): number {
  if (monthOfDay(today) !== month) return 0;
  return daysIn(month) - Number(today.slice(8, 10)) + 1;
}

/** Uma compra parcelada que ainda não acabou: o carnê aberto. */
export interface OpenPlan {
  entry: Entry;
  /** A parcela deste mês (ou a próxima, se começa depois). */
  current: number;
  of: number;
  /** Quanto ainda falta pagar depois deste mês. */
  left: number;
  /** O mês da última parcela. */
  last: string;
}

/** Os carnês abertos no mês: as compras parceladas com parcela neste mês ou depois, a que acaba antes primeiro. */
export function openPlans(entries: readonly Entry[], month: string): OpenPlan[] {
  const out: OpenPlan[] = [];
  for (const e of entries) {
    if (e.monthly || !e.installments || e.installments < 2) continue;
    const first = firstMonth(e);
    const last = shiftMonth(first, e.installments - 1);
    if (last < month) continue;
    const k = Math.max(0, monthsBetween(first, month));
    out.push({ entry: e, current: k + 1, of: e.installments, left: (e.installments - k - 1) * e.amount, last });
  }
  return out.sort((a, b) => (a.last !== b.last ? (a.last < b.last ? -1 : 1) : b.left - a.left));
}

/** As parcelas que ainda vêm depois deste mês: quanto, no total, e o último mês com alguma. */
export function installmentsAhead(entries: readonly Entry[], month: string): { total: number; nextMonth: number; last: string | null } {
  let total = 0;
  let nextMonth = 0;
  let last: string | null = null;
  for (const e of entries) {
    if (e.monthly || !e.installments || e.installments < 2 || e.flow !== 'saida') continue;
    const first = firstMonth(e);
    const end = shiftMonth(first, e.installments - 1);
    const next = shiftMonth(month, 1);
    const start = next > first ? next : first;
    if (start > end) continue;
    total += (monthsBetween(start, end) + 1) * e.amount;
    if (rowIn(e, next)) nextMonth += e.amount;
    if (last === null || end > last) last = end;
  }
  return { total, nextMonth, last };
}

// ── Semelhanças ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A chave do nome, para achar o mesmo gasto escrito de outro jeito: sem acento, caixa e espaço a mais,
 * e sem a parcela que a pessoa escrevia à mão no fim ("Steam 3/3", "Violão (7/10)").
 */
export function titleKey(title: string): string {
  return fold(title)
    .replace(/\(?\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)?\s*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** O que um gasto já lançado sugere ao escrever um nome parecido. */
export interface Suggestion {
  title: string;
  flow: Flow;
  category: string;
  pay?: PayMethod;
  need?: Need;
  amount: number;
  /** Quantas vezes ele já foi lançado. */
  times: number;
}

/**
 * Os lançamentos de antes com um nome que começa como o digitado (em qualquer palavra), um por nome, o
 * mais usado primeiro: escolher um preenche categoria, pagamento e o último valor.
 */
export function suggestions(entries: readonly Entry[], typed: string, max = 6): Suggestion[] {
  const q = titleKey(typed);
  if (!q) return [];
  const byKey = new Map<string, { last: Entry; times: number }>();
  for (const e of entries) {
    const key = titleKey(e.title);
    if (!key || !(key.startsWith(q) || key.includes(' ' + q))) continue;
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { last: e, times: 1 });
    else {
      seen.times++;
      if (e.createdAt > seen.last.createdAt) seen.last = e;
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.times - a.times || (a.last.createdAt < b.last.createdAt ? 1 : -1))
    .slice(0, max)
    .map(({ last, times }) => ({
      title: last.title.replace(/\s*\(?\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)?\s*$/, ''),
      flow: last.flow,
      category: last.category,
      ...(last.pay && last.pay !== 'parcelado' ? { pay: last.pay } : {}),
      ...(last.need ? { need: last.need } : {}),
      amount: last.monthly ? fixedValue(last, '9999-12') : last.amount,
      times,
    }));
}

/** O mesmo gasto, mais de uma vez no mês. */
export interface Repeat {
  title: string;
  times: number;
  total: number;
  category: string;
}

/** As saídas que se repetiram no mês (o mesmo nome duas vezes ou mais; fixos e parcelas não contam). */
export function repeatsIn(rows: readonly Row[]): Repeat[] {
  const byKey = new Map<string, Repeat>();
  for (const r of rows) {
    if (r.entry.flow !== 'saida' || r.fixed || r.part) continue;
    const key = titleKey(r.entry.title);
    if (!key) continue;
    const seen = byKey.get(key);
    if (seen) {
      seen.times++;
      seen.total += r.amount;
    } else byKey.set(key, { title: r.entry.title, times: 1, total: r.amount, category: r.entry.category });
  }
  return [...byKey.values()].filter((r) => r.times > 1).sort((a, b) => b.total - a.total);
}

// ── Guardar e juntar ────────────────────────────────────────────────────────────────────────────────

const ID_RE = /^[\w-]{1,64}$/;

function isStamp(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
}

function isCents(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= AMOUNT_MAX;
}

function isStock(v: unknown): v is Stock {
  return typeof v === 'string' && (STOCKS as readonly string[]).includes(v);
}

export function sanitizeEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const flow = r['flow'] === 'entrada' ? 'entrada' : r['flow'] === 'saida' ? 'saida' : null;
  const title = typeof r['title'] === 'string' ? cleanLabel(r['title'], TITLE_MAX) : '';
  if (!flow || !title || typeof r['id'] !== 'string' || !ID_RE.test(r['id'])) return null;
  if (!isCents(r['amount']) || !isDay(r['date']) || !isStamp(r['at'])) return null;
  const category = typeof r['category'] === 'string' && ID_RE.test(r['category']) ? r['category'] : flow === 'saida' ? 'outros' : 'outras-entradas';
  const e: Entry = {
    id: r['id'],
    title,
    amount: r['amount'],
    flow,
    category,
    date: r['date'],
    createdAt: isStamp(r['createdAt']) ? r['createdAt'] : r['at'],
    at: r['at'],
  };
  if (flow === 'saida' && (PAY_METHODS as readonly unknown[]).includes(r['pay'])) e.pay = r['pay'] as PayMethod;
  if (flow === 'saida' && isNeed(r['need'])) e.need = r['need'];
  if (flow === 'saida' && Array.isArray(r['people'])) {
    const people = [...new Set(r['people'].filter((p): p is string => typeof p === 'string' && ID_RE.test(p)))].slice(0, MAX_PEOPLE);
    // só você é o padrão: não precisa ser guardado
    if (people.length && !(people.length === 1 && people[0] === ME)) e.people = people;
  }
  if (r['monthly'] === true) {
    e.monthly = true;
    if (isMonth(r['until']) && r['until'] >= monthOfDay(e.date)) e.until = r['until'];
    const values: Record<string, number> = {};
    if (r['values'] && typeof r['values'] === 'object') {
      for (const [m, v] of Object.entries(r['values'] as Record<string, unknown>)) if (isMonth(m) && isCents(v)) values[m] = v;
    }
    if (Object.keys(values).length) e.values = values;
    const skip = Array.isArray(r['skip']) ? [...new Set(r['skip'].filter(isMonth))].sort().slice(0, 600) : [];
    if (skip.length) e.skip = skip;
    if (e.pay === 'parcelado') delete e.pay;
  } else if (flow === 'saida' && typeof r['installments'] === 'number' && Number.isInteger(r['installments']) && r['installments'] >= 2) {
    e.installments = Math.min(r['installments'], MAX_INSTALLMENTS);
    e.pay = 'parcelado';
  } else if (e.pay === 'parcelado') e.pay = 'avista';
  if (!e.monthly && (r['shift'] === -1 || r['shift'] === 1)) e.shift = r['shift'];
  if (flow === 'entrada' && !e.monthly && typeof r['refundOf'] === 'string' && ID_RE.test(r['refundOf']) && r['refundOf'] !== e.id) e.refundOf = r['refundOf'];
  return e;
}

export function sanitizeCategory(raw: unknown): SpendingCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? cleanLabel(r['name'], CATEGORY_NAME_MAX) : '';
  const flow = r['flow'] === 'entrada' ? 'entrada' : r['flow'] === 'saida' ? 'saida' : null;
  if (!name || !flow || typeof r['id'] !== 'string' || !ID_RE.test(r['id']) || !isStamp(r['at'])) return null;
  // a de sempre "Luxo/Item" virou "Item": o luxo agora é a resposta de cada gasto ao "Precisava?"
  const c: SpendingCategory = { id: r['id'], name: r['id'] === 'luxo' && name === 'Luxo/Item' ? 'Item' : name, flow, color: isStock(r['color']) ? r['color'] : 'cinza', at: r['at'] };
  if (flow === 'saida' && isCents(r['budget'])) c.budget = r['budget'];
  return c;
}

export function sanitizePerson(raw: unknown): SpendingPerson | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? cleanLabel(r['name'], PERSON_NAME_MAX) : '';
  if (!name || typeof r['id'] !== 'string' || !ID_RE.test(r['id']) || !isStamp(r['at'])) return null;
  return { id: r['id'], name, at: r['at'] };
}

function byCreation(a: Entry, b: Entry): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** O vencedor entre duas versões da mesma coisa: a mudada por último; no empate, o maior texto (igual nos dois aparelhos). */
function newer<T extends { at: string }>(a: T | undefined, b: T): boolean {
  return !a || b.at > a.at || (b.at === a.at && JSON.stringify(b) > JSON.stringify(a));
}

/**
 * O livro como foi guardado (ou veio da nuvem), conferido peça por peça. As categorias de sempre que
 * faltam voltam (a não ser que tenham sido apagadas), e você (`ME`) está sempre. Uma pessoa apagada sai dos
 * gastos dela (o gasto que fica sem ninguém volta a ser só seu).
 */
export function sanitizeSpending(raw: unknown): SpendingState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SPENDING, categories: [...DEFAULT_CATEGORIES], people: [DEFAULT_PERSON] };
  const r = raw as Record<string, unknown>;
  const removed: Record<string, string> = {};
  if (r['removed'] && typeof r['removed'] === 'object') {
    for (const [id, at] of Object.entries(r['removed'] as Record<string, unknown>)) if (ID_RE.test(id) && isStamp(at)) removed[id] = at;
  }
  const entries = new Map<string, Entry>();
  for (const item of Array.isArray(r['entries']) ? r['entries'].slice(0, MAX_ENTRIES) : []) {
    const e = sanitizeEntry(item);
    if (e && !(removed[e.id] && removed[e.id] >= e.at) && newer(entries.get(e.id), e)) entries.set(e.id, e);
  }
  const categories = new Map<string, SpendingCategory>(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
  for (const item of Array.isArray(r['categories']) ? r['categories'].slice(0, MAX_CATEGORIES) : []) {
    const c = sanitizeCategory(item);
    if (c && newer(categories.get(c.id), c)) categories.set(c.id, c);
  }
  for (const [id, c] of categories) if (removed[id] && removed[id] >= c.at) categories.delete(id);
  const people = new Map<string, SpendingPerson>([[ME, DEFAULT_PERSON]]);
  for (const item of Array.isArray(r['people']) ? r['people'].slice(0, MAX_PERSONS) : []) {
    const p = sanitizePerson(item);
    if (p && newer(people.get(p.id), p)) people.set(p.id, p);
  }
  for (const [id, p] of people) if (id !== ME && removed[id] && removed[id] >= p.at) people.delete(id);
  // quem não está mais no livro sai dos gastos dele (o gasto que fica sem ninguém volta a ser só seu)
  for (const [id, e] of entries) {
    if (!e.people?.some((p) => !people.has(p))) continue;
    const kept = e.people.filter((p) => people.has(p));
    const next = { ...e };
    if (kept.length && !(kept.length === 1 && kept[0] === ME)) next.people = kept;
    else delete next.people;
    entries.set(id, next);
  }
  return { entries: [...entries.values()].sort(byCreation), categories: [...categories.values()], people: [...people.values()], removed };
}

/**
 * O livro de dois aparelhos juntos: cada lançamento e cada categoria vem de onde mudou por último, e um
 * apagado (depois da última mudança dele) fica apagado. O mesmo resultado dos dois lados, em qualquer ordem.
 */
export function mergeSpending(here: SpendingState, there: SpendingState): SpendingState {
  const removed: Record<string, string> = { ...here.removed };
  for (const [id, at] of Object.entries(there.removed)) if (!removed[id] || at > removed[id]) removed[id] = at;
  return sanitizeSpending({
    entries: [...here.entries, ...there.entries],
    categories: [...here.categories, ...there.categories],
    people: [...here.people, ...there.people],
    removed,
  });
}

/** O que vai para a nuvem: null sem nada além das categorias de sempre (o mural de antes dos Gastos fica com a mesma impressão). */
export function spendingToSync(state: SpendingState): SpendingState | null {
  const untouched =
    state.categories.length === DEFAULT_CATEGORIES.length && state.categories.every((c) => c.at === BORN) && state.people.every((p) => p.at === BORN);
  return state.entries.length || Object.keys(state.removed).length || !untouched ? state : null;
}

/** A cor de uma categoria nova: a cartolina menos usada pelas outras da mesma direção. */
export function drawCategoryColor(categories: readonly SpendingCategory[], flow: Flow, random = Math.random): Stock {
  const used = new Map<Stock, number>(STOCKS.map((s) => [s, 0]));
  for (const c of categories) if (c.flow === flow) used.set(c.color, (used.get(c.color) ?? 0) + 1);
  const least = Math.min(...used.values());
  const pool = STOCKS.filter((s) => used.get(s) === least && s !== 'preto' && s !== 'branco');
  return (pool.length ? pool : STOCKS)[Math.floor(random() * (pool.length || STOCKS.length))];
}
