import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AgendaDoMesV1, LembreteV1 } from '../../../contrato/api-v1/calendario';
import { ApiMirror } from './api-mirror';
import { agendaMonths, agendaV1, calendarMirror, lembreteV1 } from './api-mirror-calendar';
import { CalendarState, Reminder, sanitizeReminder } from './calendar';
import { CalendarStore } from './calendar-store';
import { CloudAccount } from './cloud-account';
import { todayISO } from './dates';
import { KanbanStore } from './kanban-store';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { EMPTY_SPENDING } from './spending';
import { SpendingStore } from './spending-store';

/**
 * O Calendário no espelho da API (core/api-mirror-calendar.ts, rodada 7): cada lembrete em v1 com a
 * repetição em palavras, a agenda de cada mês aberta pelas contas da tela, e o serviço mandando a área
 * `calendario` só quando a nuvem pede.
 */

const reminder = (raw: Record<string, unknown>): Reminder =>
  sanitizeReminder({ color: 'amarelo', notes: [], skip: [], createdAt: '2026-10-01T10:00:00.000Z', at: '2026-10-02T10:00:00.000Z', ...raw })!;

const DENTISTA = reminder({ id: 'lb-dentista', title: 'Dentista', date: '2026-10-22', time: '14:30', endTime: '15:30', color: 'azul', notes: ['r-ficha'] });
const ACADEMIA = reminder({ id: 'lb-academia', title: 'Academia', date: '2026-10-05', time: '07:00', repeat: 'semana', days: [1, 3], skip: ['2026-10-12'], color: 'verde' });
const FERIAS = reminder({ id: 'lb-ferias', title: 'Férias', date: '2026-10-30', end: '2026-11-02', quiet: true, color: 'laranja' });
const ANIVERSARIO = reminder({
  id: 'lb-niver',
  title: 'Aniversário da Bia',
  date: '2026-10-21',
  repeat: 'ano',
  google: { id: 'abcde12345', link: 'https://www.google.com/calendar/event?eid=x', lock: 'google' },
});

describe('o espelho da API: o lembrete em v1', () => {
  it('leva os campos da v1, na ordem dela, com a repetição em palavras', () => {
    const v = lembreteV1(ACADEMIA);
    expect(Object.keys(v)).toEqual(['id', 'titulo', 'dia', 'hora', 'fim', 'hora_fim', 'repete', 'em_palavras', 'pulados', 'cor', 'silencioso', 'notas', 'google', 'criado_em', 'versao']);
    expect(v).toEqual({
      id: 'lb-academia',
      titulo: 'Academia',
      dia: '2026-10-05',
      hora: '07:00',
      fim: null,
      hora_fim: null,
      repete: { cada: 'semana', intervalo: 1, dias_da_semana: [1, 3], vez_no_mes: null, so_nos_meses_com_o_dia: false, ate: null, vezes: null },
      em_palavras: 'Toda semana, na segunda e quarta, a partir de 5 de outubro de 2026.',
      pulados: ['2026-10-12'],
      cor: 'verde',
      silencioso: false,
      notas: [],
      google: null,
      criado_em: '2026-10-01T10:00:00.000Z',
      versao: '2026-10-02T10:00:00.000Z',
    } satisfies LembreteV1);
  });

  it('o de um dia só, o de vários dias, a marcação e o do Google travado', () => {
    expect(lembreteV1(DENTISTA)).toEqual(jasmine.objectContaining({ hora: '14:30', hora_fim: '15:30', repete: null, em_palavras: 'Só em 22 de outubro de 2026.', notas: ['r-ficha'] }));
    expect(lembreteV1(FERIAS)).toEqual(jasmine.objectContaining({ fim: '2026-11-02', silencioso: true, em_palavras: 'De 30 de out. a 2 de nov. de 2026.' }));
    expect(lembreteV1(ANIVERSARIO).google).toEqual({ link: 'https://www.google.com/calendar/event?eid=x', travado: 'google' });
    const count = reminder({ id: 'lb-x', title: 'Aula', date: '2026-10-05', repeat: 'semana', count: 3 });
    expect(lembreteV1(count).repete).toEqual(jasmine.objectContaining({ ate: '2026-10-19', vezes: 3 }));
  });
});

describe('o espelho da API: a agenda do mês', () => {
  it('abre as repetições pelas contas da tela: os dias da semana, sem o dia tirado, na ordem da folhinha', () => {
    const out = agendaV1([DENTISTA, ACADEMIA, ANIVERSARIO], '2026-10');
    expect(out.vezes.map((v) => `${v.dia} ${v.titulo}`)).toEqual([
      '2026-10-05 Academia',
      '2026-10-07 Academia',
      '2026-10-14 Academia',
      '2026-10-19 Academia',
      // no mesmo dia, o dia todo antes do horário
      '2026-10-21 Aniversário da Bia',
      '2026-10-21 Academia',
      '2026-10-22 Dentista',
      '2026-10-26 Academia',
      '2026-10-28 Academia',
    ]);
    expect(out.vezes[6]).toEqual({
      lembrete: 'lb-dentista', titulo: 'Dentista', dia: '2026-10-22', fim: null, hora: '14:30', hora_fim: '15:30', cor: 'azul', silencioso: false, repete: false, notas: ['r-ficha'],
    });
    expect(out.vezes[0]!.repete).toBeTrue();
  });

  it('a vez de vários dias que passa de um mês para o outro aparece nos dois, uma vez em cada', () => {
    const oct = agendaV1([FERIAS], '2026-10');
    const nov = agendaV1([FERIAS], '2026-11');
    expect(oct.vezes).toEqual([jasmine.objectContaining({ dia: '2026-10-30', fim: '2026-11-02', silencioso: true })]);
    expect(nov.vezes).toEqual(oct.vezes);
    expect(agendaV1([FERIAS], '2026-12').vezes).toEqual([]);
  });

  it('a janela: 3 meses antes do de hoje, ele e 12 depois, mesmo vazios', () => {
    expect(agendaMonths('2026-10-29')).toEqual([
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
      '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10',
    ]);
    const items = calendarMirror({ reminders: [DENTISTA], removed: {} }, '2026-10-29');
    expect(items.filter((i) => i.tipo === 'lembrete').map((i) => i.id)).toEqual(['lb-dentista']);
    expect(items.filter((i) => i.tipo === 'agenda').map((i) => i.id)).toEqual(agendaMonths('2026-10-29').map((m) => `agenda-${m}`));
    expect((items.find((i) => i.id === 'agenda-2026-12')!.dados as AgendaDoMesV1).vezes).toEqual([]);
  });
});

describe('o espelho da API: o serviço manda o Calendário', () => {
  let calls: { path: string; method: string; body: any }[];
  let remote: { areas: string[]; rev: number | null; hashes: Record<string, Record<string, string>> };
  let calendar: ReturnType<typeof signal<CalendarState>>;

  function setup(): ApiMirror {
    calls = [];
    remote = { areas: ['calendario'], rev: null, hashes: {} };
    calendar = signal<CalendarState>({ reminders: [DENTISTA, ACADEMIA], removed: {} });
    const account = {
      account: () => ({ codigo: 'G11T-G00D', nome: 'Igor', api: true }),
      request: async (path: string, init: { method?: string; body?: any } = {}) => {
        calls.push({ path, method: init.method ?? 'GET', body: init.body });
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
        { provide: ReviewStore, useValue: { notes: signal([]), sharedIds: signal<ReadonlySet<string>>(new Set()) } },
        { provide: KanbanStore, useValue: { boardOnly: signal(new Set()), cardOf: () => null, isOnWall: () => false, categories: signal([]), boardFor: () => null, groupKanbanOnly: () => false } },
        { provide: Settings, useValue: { notesConfig: signal({ subjects: {} }), pinnedTags: signal([]) } },
        { provide: SpendingStore, useValue: { state: signal(EMPTY_SPENDING) } },
        { provide: CalendarStore, useValue: { state: calendar } },
      ],
    });
    return TestBed.inject(ApiMirror);
  }

  const posts = () => calls.filter((c) => c.method === 'POST');
  const sent = (n: number) => posts()[n]!.body.poe.map((i: { tipo: string; id: string }) => `${i.tipo}:${i.id}`);

  it('só com a área calendario pedida: os lembretes e a janela da agenda vão; o que muda vai de novo, e o apagado sai', async () => {
    const m = setup();
    await m.afterSync(3);
    const first = sent(0);
    expect(first.filter((s: string) => s.startsWith('lembrete:'))).toEqual(['lembrete:lb-dentista', 'lembrete:lb-academia']);
    expect(first.filter((s: string) => s.startsWith('agenda:')).length).toBe(16);
    // mudar o dentista de dia muda o lembrete e a agenda do mês (só eles vão)
    const month = todayISO().slice(0, 7);
    calendar.set({ reminders: [{ ...DENTISTA, date: `${month}-03`, at: '2026-10-03T10:00:00.000Z' }, ACADEMIA], removed: {} });
    await m.afterSync(4);
    expect(sent(1)).toContain('lembrete:lb-dentista');
    expect(sent(1)).toContain(`agenda:agenda-${month}`);
    expect(sent(1)).not.toContain('lembrete:lb-academia');
    calendar.set({ reminders: [ACADEMIA], removed: { 'lb-dentista': '2026-10-04T10:00:00.000Z' } });
    await m.afterSync(5);
    expect(posts()[2]!.body.tira).toEqual([{ tipo: 'lembrete', id: 'lb-dentista' }]);
  });

  it('sem a área calendario, nenhum lembrete vai', async () => {
    const m = setup();
    remote.areas = ['notas'];
    await m.afterSync(3);
    expect(posts()[0]!.body.poe.some((i: { tipo: string }) => i.tipo === 'lembrete' || i.tipo === 'agenda')).toBeFalse();
  });
});
