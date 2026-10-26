import { NEEDS, NEED_LABEL, Row, SpendingCategory, SpendingPerson, monthOfDay, peopleOf } from './spending';

/**
 * Os filtros da fita dos Gastos, como os do mural: cada grupo tem as suas opções; dentro de um grupo vale
 * qualquer uma das ligadas, entre grupos, todas juntas. O número de cada opção é quantos lançamentos ela
 * mostraria com os outros grupos como estão, e a que não mostraria nenhum fica apagada.
 *
 * "Só as parcelas" é ligar Parcela; "sem as parcelas", ligar Uma vez e Todo mês (o parcelado é o Tipo, não o
 * Pagamento). Os envelopes, o Precisava?
 * e o Por pessoa escolhem o grupo deles aqui também (um envelope escolhido é a Categoria com só ele).
 */

export type FilterKey = 'flow' | 'kind' | 'pay' | 'need' | 'category' | 'person' | 'other';

/** As opções ligadas de cada grupo; um grupo sem nada (ou vazio) não filtra. */
export type SpendingFilter = Partial<Record<FilterKey, string[]>>;

export const NO_FILTER: SpendingFilter = {};

export interface FilterOption {
  value: string;
  label: string;
  /** Quantos lançamentos do mês a opção mostraria (com os outros grupos como estão). */
  n: number;
  on: boolean;
  /** A cartolina da categoria, para o selinho. */
  color?: string;
}

export interface FilterGroup {
  key: FilterKey;
  title: string;
  options: FilterOption[];
}

/** O que os filtros precisam além das linhas: os nomes, e quanto já voltou de cada gasto. */
export interface FilterContext {
  categories: readonly SpendingCategory[];
  people: readonly SpendingPerson[];
  refunds: ReadonlyMap<string, number>;
  /** O mês aberto ('AAAA-MM'): o que é de um dia de outro mês conta como "De outro mês". */
  month: string;
}

const TITLES: Record<FilterKey, string> = {
  flow: 'Saiu ou entrou',
  kind: 'Tipo',
  pay: 'Pagamento',
  need: 'Precisava?',
  category: 'Categoria',
  person: 'Com quem',
  other: 'Marcas',
};
const ORDER: readonly FilterKey[] = ['flow', 'kind', 'pay', 'need', 'category', 'person', 'other'];
const FIXED: Record<'flow' | 'kind' | 'pay' | 'need' | 'other', readonly { value: string; label: string }[]> = {
  flow: [
    { value: 'saida', label: 'Saídas' },
    { value: 'entrada', label: 'Entradas' },
  ],
  kind: [
    { value: 'uma', label: 'Uma vez' },
    { value: 'parcela', label: 'Parcela' },
    { value: 'fixo', label: 'Todo mês' },
  ],
  pay: [
    { value: 'avista', label: 'À vista' },
    { value: 'pix', label: 'Pix' },
  ],
  need: [...NEEDS.map((n) => ({ value: n, label: NEED_LABEL[n] })), { value: 'sem', label: 'Sem resposta' }],
  other: [
    { value: 'reembolso', label: 'Volta de um gasto' },
    { value: 'voltou', label: 'Voltou dinheiro' },
    { value: 'outro-mes', label: 'De outro mês' },
  ],
};

/** Os valores de uma linha num grupo (uma linha pode ter vários: as pessoas, as marcas). Nenhum: fica de fora se o grupo filtra. */
function valuesOf(r: Row, key: FilterKey, ctx: FilterContext): string[] {
  const e = r.entry;
  switch (key) {
    case 'flow':
      return [e.flow];
    case 'kind':
      return [r.fixed ? 'fixo' : r.part ? 'parcela' : 'uma'];
    case 'pay':
      return e.flow === 'saida' ? [e.pay ?? 'avista'] : [];
    case 'need':
      return e.flow === 'saida' ? [e.need ?? 'sem'] : [];
    case 'category':
      return [e.category];
    case 'person':
      return e.flow === 'saida' ? peopleOf(e) : [];
    case 'other': {
      const out: string[] = [];
      if (e.flow === 'entrada' && e.refundOf) out.push('reembolso');
      if (ctx.refunds.get(e.id)) out.push('voltou');
      if (monthOfDay(r.day) !== ctx.month) out.push('outro-mes');
      return out;
    }
  }
}

function passes(r: Row, f: SpendingFilter, ctx: FilterContext, skip?: FilterKey): boolean {
  for (const key of ORDER) {
    const on = f[key];
    if (key === skip || !on?.length) continue;
    if (!valuesOf(r, key, ctx).some((v) => on.includes(v))) return false;
  }
  return true;
}

/** As linhas que passam em todos os filtros. */
export function filterRows(rows: readonly Row[], f: SpendingFilter, ctx: FilterContext): Row[] {
  return isFiltered(f) ? rows.filter((r) => passes(r, f, ctx)) : [...rows];
}

export function isFiltered(f: SpendingFilter): boolean {
  return ORDER.some((k) => !!f[k]?.length);
}

/** Quantas opções estão ligadas, em todos os grupos (o número ao lado do Filtrar). */
export function filterCount(f: SpendingFilter): number {
  return ORDER.reduce((n, k) => n + (f[k]?.length ?? 0), 0);
}

/** Liga ou desliga uma opção. */
export function toggleFilter(f: SpendingFilter, key: FilterKey, value: string): SpendingFilter {
  const on = f[key] ?? [];
  const next = on.includes(value) ? on.filter((v) => v !== value) : [...on, value];
  return withGroup(f, key, next);
}

/** O grupo inteiro trocado (vazio: o grupo sai). */
export function withGroup(f: SpendingFilter, key: FilterKey, values: string[]): SpendingFilter {
  const out = { ...f };
  if (values.length) out[key] = values;
  else delete out[key];
  return out;
}

/** A única opção ligada no grupo, se for uma só (o envelope escolhido, a pessoa escolhida). */
export function onlyIn(f: SpendingFilter, key: FilterKey): string | null {
  const on = f[key];
  return on?.length === 1 ? on[0] : null;
}

/**
 * Os grupos da cartela, com as opções e quantos lançamentos cada uma mostraria. Categoria e Com quem só
 * com o que aparece no mês (ou está ligado); Precisava? e Pagamento só com alguma saída; Marcas e Com quem
 * só quando têm o que separar.
 */
export function filterGroups(rows: readonly Row[], f: SpendingFilter, ctx: FilterContext): FilterGroup[] {
  const groups: FilterGroup[] = [];
  for (const key of ORDER) {
    const pool = rows.filter((r) => passes(r, f, ctx, key));
    const count = (value: string) => pool.filter((r) => valuesOf(r, key, ctx).includes(value)).length;
    const on = f[key] ?? [];
    let options: { value: string; label: string; color?: string }[];
    if (key === 'category') {
      const seen = new Set(rows.map((r) => r.entry.category));
      options = ctx.categories.filter((c) => seen.has(c.id) || on.includes(c.id)).map((c) => ({ value: c.id, label: c.name, color: c.color }));
      // a categoria que sumiu do livro
      if (rows.some((r) => !ctx.categories.some((c) => c.id === r.entry.category))) options.push(...[...seen].filter((id) => !ctx.categories.some((c) => c.id === id)).map((id) => ({ value: id, label: 'Sem categoria' })));
    } else if (key === 'person') {
      const seen = new Set(rows.flatMap((r) => valuesOf(r, 'person', ctx)));
      options = ctx.people.filter((p) => seen.has(p.id) || on.includes(p.id)).map((p) => ({ value: p.id, label: p.name }));
      // só você nos gastos do mês: nada a separar
      if (options.length < 2 && !on.length) continue;
    } else options = [...FIXED[key]];
    const built = options.map((o) => ({ ...o, n: count(o.value), on: on.includes(o.value) }));
    if (key === 'other' && built.every((o) => !o.n && !o.on)) continue;
    if ((key === 'pay' || key === 'need') && !rows.some((r) => r.entry.flow === 'saida') && !on.length) continue;
    groups.push({ key, title: TITLES[key], options: built });
  }
  return groups;
}

/** Os filtros ligados, como adesivos com X embaixo da pasta ("Pix", "Com Bruna", "Comida"). */
export function filterChips(f: SpendingFilter, ctx: FilterContext): { key: FilterKey; value: string; label: string }[] {
  const out: { key: FilterKey; value: string; label: string }[] = [];
  for (const key of ORDER) {
    for (const value of f[key] ?? []) {
      let label: string;
      if (key === 'category') label = ctx.categories.find((c) => c.id === value)?.name ?? 'Sem categoria';
      else if (key === 'person') label = `Com ${ctx.people.find((p) => p.id === value)?.name ?? 'alguém'}`;
      else label = FIXED[key].find((o) => o.value === value)?.label ?? value;
      out.push({ key, value, label });
    }
  }
  return out;
}
