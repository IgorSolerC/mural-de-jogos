import {
  CONTEXTO_GASTOS,
  MESES_PARA_FRENTE,
  MESES_PARA_TRAS,
  visaoDoMes,
  type ContextoGastosV1,
  type EnvelopeV1,
  type LancamentoV1,
  type MesV1,
  type PessoaV1,
} from '../../../contrato/api-v1/gastos';
import {
  Entry,
  ME,
  SpendingCategory,
  SpendingState,
  activeMonths,
  firstMonth,
  incomeByCategory,
  installmentsAhead,
  monthOfDay,
  openPlans,
  peopleOf,
  rowsIn,
  shiftMonth,
  spentByCategory,
  spentByNeed,
  spentByPerson,
  totals,
} from './spending';

/**
 * Os Gastos no formato público v1, para o espelho da API das AIs (PLANO-API.md, rodada 6): cada
 * lançamento, o vocabulário (envelopes e pessoas) e o mês pronto, feito com as mesmas contas da tela
 * (core/spending.ts). A API não refaz conta nenhuma: serve o que vai daqui.
 */

/** O nome de quem está no livro (você, pelo nome que deu nos Gastos). */
function nameOf(state: SpendingState, id: string): string {
  return state.people.find((p) => p.id === id)?.name ?? (id === ME ? 'Eu' : 'Alguém');
}

function envelopeRef(state: SpendingState, id: string): { id: string; nome: string } | null {
  const c = state.categories.find((x) => x.id === id);
  return c ? { id: c.id, nome: c.name } : null;
}

/** Um lançamento em v1. */
export function lancamentoV1(e: Entry, state: SpendingState): LancamentoV1 {
  const out = e.flow === 'saida';
  return {
    id: e.id,
    titulo: e.title,
    centavos: e.amount,
    tipo: e.flow,
    envelope: envelopeRef(state, e.category),
    pagamento: out ? (e.pay ?? null) : null,
    parcelas: e.installments && e.installments > 1 ? e.installments : null,
    precisava: out ? (e.need ?? null) : null,
    pessoas: out ? peopleOf(e).map((id) => nameOf(state, id)) : [],
    dia: e.date,
    mes: firstMonth(e),
    fatura: e.monthly ? 0 : (e.shift ?? 0),
    mensal: e.monthly ? { ate: e.until ?? null, valores: { ...(e.values ?? {}) }, pulados: [...(e.skip ?? [])] } : null,
    reembolso_de: e.refundOf ?? null,
    criado_em: e.createdAt,
    versao: e.at,
  };
}

export function envelopeV1(c: SpendingCategory): EnvelopeV1 {
  return { id: c.id, nome: c.name, tipo: c.flow, cor: c.color, limite_centavos: c.flow === 'saida' ? (c.budget ?? null) : null, versao: c.at };
}

/** O vocabulário dos Gastos: os envelopes, as pessoas (você primeiro) e os meses com lançamento. */
export function contextoGastosV1(state: SpendingState): ContextoGastosV1 {
  const people: PessoaV1[] = state.people.map((p) => ({ id: p.id, nome: p.name, eu: p.id === ME }));
  return {
    envelopes: state.categories.map(envelopeV1),
    pessoas: [...people.filter((p) => p.eu), ...people.filter((p) => !p.eu)],
    meses: activeMonths(state.entries),
  };
}

/** O mês como a tela mostra: os totais, os envelopes, o Precisava?, as pessoas, os carnês e as linhas. */
export function mesV1(state: SpendingState, month: string): MesV1 {
  const entries = state.entries;
  const rows = rowsIn(entries, month);
  const t = totals(rows, entries);
  const nome = (id: string) => state.categories.find((c) => c.id === id)?.name ?? 'Sem categoria';
  const need = spentByNeed(rows, entries);
  const ahead = installmentsAhead(entries, month);
  return {
    mes: month,
    entradas: t.income,
    saidas: t.spent,
    saldo: t.balance,
    comprometido: t.committed,
    por_envelope: spentByCategory(rows, entries).map((s) => ({
      id: s.id,
      nome: nome(s.id),
      centavos: s.amount,
      limite_centavos: state.categories.find((c) => c.id === s.id)?.budget ?? null,
    })),
    entradas_por_envelope: incomeByCategory(rows).map((s) => ({ id: s.id, nome: nome(s.id), centavos: s.amount })),
    precisava: {
      luxo: need.get('luxo') ?? 0,
      conforto: need.get('conforto') ?? 0,
      indispensavel: need.get('indispensavel') ?? 0,
      sem_resposta: need.get(null) ?? 0,
    },
    por_pessoa: [...spentByPerson(rows, entries)]
      .sort((a, b) => (a[0] === ME ? -1 : b[0] === ME ? 1 : b[1] - a[1]))
      .map(([id, centavos]) => ({ nome: nameOf(state, id), centavos })),
    carnes: openPlans(entries, month).map((p) => ({ id: p.entry.id, titulo: p.entry.title, parcela: p.current, de: p.of, falta: p.left, ultimo_mes: p.last })),
    parcelas_a_frente: { total: ahead.total, proximo_mes: ahead.nextMonth, ultimo_mes: ahead.last },
    linhas: rows.map((r) => ({
      id: r.entry.id,
      titulo: r.entry.title,
      dia: r.day,
      centavos: r.amount,
      tipo: r.entry.flow,
      envelope: state.categories.find((c) => c.id === r.entry.category)?.name ?? null,
      parcela: r.part ? { n: r.part.n, de: r.part.of } : null,
      mensal: !!r.fixed,
    })),
  };
}

/**
 * Os meses que vão como visão: os 24 mais recentes com lançamento até o mês de hoje (o de hoje sempre)
 * e os 3 seguintes (as parcelas e os mensais que já vêm), do mais antigo ao mais novo.
 */
export function mirrorMonths(entries: readonly Entry[], today: string): string[] {
  const now = monthOfDay(today);
  const past = [...new Set([...activeMonths(entries).filter((m) => m <= now), now])].sort().slice(-MESES_PARA_TRAS);
  const ahead = Array.from({ length: MESES_PARA_FRENTE }, (_, i) => shiftMonth(now, i + 1));
  return [...past, ...ahead];
}

/** O que os Gastos mandam ao espelho, sem as impressões: os lançamentos, as visões e o contexto. */
export function spendingMirror(state: SpendingState, today: string): { tipo: 'lancamento' | 'visao' | 'contexto-gastos'; id: string; dados: LancamentoV1 | MesV1 | ContextoGastosV1 }[] {
  return [
    ...state.entries.map((e) => ({ tipo: 'lancamento' as const, id: e.id, dados: lancamentoV1(e, state) })),
    ...mirrorMonths(state.entries, today).map((m) => ({ tipo: 'visao' as const, id: visaoDoMes(m), dados: mesV1(state, m) })),
    { tipo: 'contexto-gastos' as const, id: CONTEXTO_GASTOS, dados: contextoGastosV1(state) },
  ];
}
