import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { LancamentoV1, MesV1 } from '../../../contrato/api-v1/gastos';
import { ApiMirror } from './api-mirror';
import { contextoGastosV1, lancamentoV1, mesV1, mirrorMonths, spendingMirror } from './api-mirror-spending';
import { CloudAccount } from './cloud-account';
import { KanbanStore } from './kanban-store';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { DEFAULT_CATEGORIES, DEFAULT_PERSON, Entry, SpendingState, monthOfDay, rowsIn, spentByCategory, totals } from './spending';
import { SpendingStore } from './spending-store';
import { todayISO } from './dates';

/**
 * Os Gastos no espelho da API (core/api-mirror-spending.ts, rodada 6): o lançamento, o contexto e o
 * mês em v1, feitos com as contas da tela, e o serviço mandando a área `gastos` só quando a nuvem pede.
 */

const AT = '2026-10-05T10:00:00.000Z';
const entry = (id: string, extra: Partial<Entry>): Entry => ({
  id,
  title: id,
  amount: 1000,
  flow: 'saida',
  category: 'mercado',
  date: '2026-10-05',
  createdAt: AT,
  at: AT,
  ...extra,
});

function book(): SpendingState {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => (c.id === 'mercado' ? { ...c, budget: 80000 } : c)),
    people: [{ id: 'p-bruna', name: 'Bruna', at: AT }, { ...DEFAULT_PERSON, name: 'Igor' }],
    removed: {},
    entries: [
      entry('merc', { title: 'Mercado', amount: 23050, date: '2026-10-26', pay: 'pix', need: 'indispensavel' }),
      entry('viol', { title: 'Violão', amount: 13990, category: 'luxo', pay: 'parcelado', installments: 10, need: 'luxo', people: ['eu', 'p-bruna'], date: '2026-09-10' }),
      entry('sal', { title: 'Salário', amount: 455900, flow: 'entrada', category: 'renda', date: '2026-10-01', monthly: true, values: { '2026-12': 470000 } }),
      entry('cine', { title: 'Cinema', amount: 4000, category: 'sumiu', date: '2026-10-11', shift: 1 }),
      entry('volta', { title: 'Bruna pagou', amount: 2000, flow: 'entrada', category: 'reembolso', date: '2026-10-12', refundOf: 'merc' }),
    ],
  };
}

describe('os Gastos no espelho da API: o v1', () => {
  it('o lançamento: centavos, envelope, parcelas, pessoas pelo nome, o mês que conta e a fatura', () => {
    const s = book();
    const viol = lancamentoV1(s.entries[1]!, s);
    const want: LancamentoV1 = {
      id: 'viol',
      titulo: 'Violão',
      centavos: 13990,
      tipo: 'saida',
      envelope: { id: 'luxo', nome: 'Item' },
      pagamento: 'parcelado',
      parcelas: 10,
      precisava: 'luxo',
      pessoas: ['Igor', 'Bruna'],
      dia: '2026-09-10',
      mes: '2026-09',
      fatura: 0,
      mensal: null,
      reembolso_de: null,
      criado_em: AT,
      versao: AT,
    };
    expect(viol).toEqual(want);
    // sem pessoas, só você; o envelope que sumiu vira null; a fatura de depois muda o mês
    const cine = lancamentoV1(s.entries[3]!, s);
    expect([cine.pessoas, cine.envelope, cine.fatura, cine.mes]).toEqual([['Igor'], null, 1, '2026-11']);
    // a entrada não tem pessoas, pagamento nem precisava; o mensal leva os valores
    const sal = lancamentoV1(s.entries[2]!, s);
    expect([sal.pessoas, sal.pagamento, sal.precisava, sal.mensal]).toEqual([[], null, null, { ate: null, valores: { '2026-12': 470000 }, pulados: [] }]);
    expect(lancamentoV1(s.entries[4]!, s).reembolso_de).toBe('merc');
  });

  it('o contexto: os envelopes com o limite, você primeiro nas pessoas e os meses com lançamento', () => {
    const ctx = contextoGastosV1(book());
    expect(ctx.envelopes.find((e) => e.id === 'mercado')).toEqual(jasmine.objectContaining({ nome: 'Mercado', tipo: 'saida', limite_centavos: 80000 }));
    expect(ctx.envelopes.find((e) => e.id === 'renda')!.limite_centavos).toBeNull();
    expect(ctx.pessoas).toEqual([
      { id: 'eu', nome: 'Igor', eu: true },
      { id: 'p-bruna', nome: 'Bruna', eu: false },
    ]);
    expect(ctx.meses).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('o mês é o da tela: os totais, os envelopes, o Precisava?, as pessoas, os carnês e as linhas', () => {
    const s = book();
    const m: MesV1 = mesV1(s, '2026-10');
    const rows = rowsIn(s.entries, '2026-10');
    const t = totals(rows, s.entries);
    expect([m.entradas, m.saidas, m.saldo, m.comprometido]).toEqual([t.income, t.spent, t.balance, t.committed]);
    // o reembolso desconta do mercado: 230,50 - 20,00
    expect(m.por_envelope).toEqual(spentByCategory(rows, s.entries).map((x) => jasmine.objectContaining({ id: x.id, centavos: x.amount })));
    expect(m.por_envelope.find((e) => e.id === 'mercado')).toEqual({ id: 'mercado', nome: 'Mercado', centavos: 21050, limite_centavos: 80000 });
    expect(m.precisava).toEqual({ luxo: 13990, conforto: 0, indispensavel: 21050, sem_resposta: 0 });
    // o violão dividido entre você e a Bruna, você primeiro
    expect(m.por_pessoa).toEqual([
      { nome: 'Igor', centavos: 21050 + 6995 },
      { nome: 'Bruna', centavos: 6995 },
    ]);
    expect(m.carnes).toEqual([{ id: 'viol', titulo: 'Violão', parcela: 2, de: 10, falta: 8 * 13990, ultimo_mes: '2027-06' }]);
    expect(m.parcelas_a_frente).toEqual({ total: 8 * 13990, proximo_mes: 13990, ultimo_mes: '2027-06' });
    expect(m.linhas.map((l) => [l.id, l.dia, l.parcela, l.mensal])).toEqual([
      ['merc', '2026-10-26', null, false],
      ['volta', '2026-10-12', null, false],
      ['viol', '2026-10-10', { n: 2, de: 10 }, false],
      ['sal', '2026-10-01', null, true],
    ]);
    // o cinema conta em novembro (a fatura de depois), com o dia de verdade
    expect(mesV1(s, '2026-11').linhas.find((l) => l.id === 'cine')).toEqual(jasmine.objectContaining({ dia: '2026-10-11', envelope: null }));
  });

  it('os meses que vão: os 24 mais recentes com lançamento até hoje (hoje sempre) e os 3 seguintes', () => {
    const many = Array.from({ length: 30 }, (_, i) => entry(`e${i}`, { date: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-05` }));
    const months = mirrorMonths(many, '2026-10-27');
    expect(months.length).toBe(27);
    expect(months.slice(-4)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    expect(months[0]).toBe('2024-08');
    expect(mirrorMonths([], '2026-10-27')).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
  });
});

describe('os Gastos no espelho da API: o serviço (ApiMirror)', () => {
  let calls: { method: string; body: any }[];
  let remote: { areas: string[]; rev: number | null; hashes: Record<string, Record<string, string>> };
  let spending: ReturnType<typeof signal<SpendingState>>;

  function setup(areas: string[]): ApiMirror {
    calls = [];
    remote = { areas, rev: null, hashes: {} };
    spending = signal(book());
    const account = {
      account: () => ({ codigo: 'G11T-G00D', nome: 'Igor', api: true }),
      request: async (_path: string, init: { method?: string; body?: any } = {}) => {
        calls.push({ method: init.method ?? 'GET', body: init.body });
        if (init.method === 'POST') {
          for (const i of init.body.poe) remote.hashes[i.tipo] = { ...remote.hashes[i.tipo], [i.id]: i.hash };
          for (const i of init.body.tira) delete remote.hashes[i.tipo]![i.id];
          remote.rev = init.body.rev;
          return { ok: true };
        }
        return structuredClone(remote);
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: CloudAccount, useValue: account },
        { provide: ReviewStore, useValue: { notes: signal([]), sharedIds: signal(new Set()) } },
        { provide: KanbanStore, useValue: { boardOnly: signal(new Set()), cardOf: () => null, isOnWall: () => false } },
        { provide: Settings, useValue: { notesConfig: signal({ subjects: {} }), pinnedTags: signal([]) } },
        { provide: SpendingStore, useValue: { state: spending } },
      ],
    });
    return TestBed.inject(ApiMirror);
  }

  afterEach(() => TestBed.resetTestingModule());
  const sent = () => calls.filter((c) => c.method === 'POST').flatMap((c) => c.body.poe.map((i: { tipo: string; id: string }) => `${i.tipo}:${i.id}`));

  it('com a área gastos, vão os lançamentos, as visões dos meses e o contexto (e nada das Anotações)', async () => {
    const m = setup(['gastos']);
    await m.afterSync(3);
    const today = monthOfDay(todayISO());
    const expected = spendingMirror(spending(), todayISO()).map((i) => `${i.tipo}:${i.id}`);
    expect(sent()).toEqual(expected);
    expect(sent()).toContain(`visao:gastos-${today}`);
    expect(sent()).toContain('contexto-gastos:gastos');
    expect(sent().some((s: string) => s.startsWith('nota:') || s.startsWith('contexto:'))).toBeFalse();
  });

  it('só com as Anotações, nada dos Gastos vai', async () => {
    const m = setup(['notas']);
    await m.afterSync(3);
    expect(sent().some((s: string) => s.startsWith('lancamento:') || s.startsWith('visao:'))).toBeFalse();
  });

  it('o lançamento apagado e o mês que saiu da janela saem do espelho', async () => {
    const m = setup(['gastos']);
    await m.afterSync(3);
    remote.hashes['visao'] = { ...remote.hashes['visao'], 'gastos-2020-01': 'ab'.repeat(8) };
    spending.update((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== 'cine') }));
    await m.afterSync(4);
    const last = calls.filter((c) => c.method === 'POST').at(-1)!.body;
    expect(last.tira).toEqual(jasmine.arrayWithExactContents([
      { tipo: 'lancamento', id: 'cine' },
      { tipo: 'visao', id: 'gastos-2020-01' },
    ]));
  });
});
