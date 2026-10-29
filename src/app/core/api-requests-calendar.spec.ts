import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { LembreteV1 } from '../../../contrato/api-v1/calendario';
import { applyCalendarRequest, calendarTitle, calendarWords, undoCalendar } from './api-requests-calendar';
import { requestWords, undoable } from './api-requests';
import { Reminder, sanitizeReminder } from './calendar';
import { CALENDAR_KEY, CalendarStore } from './calendar-store';

/**
 * Os pedidos do Calendário aplicados pelo site (core/api-requests-calendar.ts, rodada 7): criar, mudar e
 * apagar lembretes (ou só um dia) pelo CalendarStore, com a versão, o lembrete travado pelo Google, as
 * anotações presas, o Desfazer e as frases da folha dos pedidos.
 */

const AT = '2026-10-05T10:00:00.000Z';
const NOW = '2026-10-29T12:00:00.000Z';

const reminder = (raw: Record<string, unknown>): Reminder => sanitizeReminder({ color: 'amarelo', notes: [], skip: [], createdAt: AT, at: AT, ...raw })!;
const DENTISTA = reminder({ id: 'lb-dentista', title: 'Dentista', date: '2026-11-03', time: '14:30', color: 'azul' });
const ACADEMIA = reminder({ id: 'lb-academia', title: 'Academia', date: '2026-10-05', time: '07:00', repeat: 'semana', days: [1, 3], color: 'verde' });
const NIVER = reminder({ id: 'lb-niver', title: 'Aniversário da Bia', date: '2026-10-21', repeat: 'ano', google: { id: 'abcde12345', lock: 'google' } });
const NOTES = new Set(['r-receita', 'r-lista']);

describe('os pedidos do Calendário aplicados pelo site', () => {
  let store: CalendarStore;
  const ctx = (stamps = new Map<string, string | null>()) => ({ now: NOW, stamps, noteExists: (id: string) => NOTES.has(id) });
  const apply = (op: string, alvo: string, dados: unknown, c = ctx()) => applyCalendarRequest(store, { op, alvo, dados }, c);

  beforeEach(() => {
    localStorage.removeItem(CALENDAR_KEY);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(CalendarStore);
    store.state.set({ reminders: [DENTISTA, ACADEMIA, NIVER], removed: {} });
  });

  afterEach(() => localStorage.removeItem(CALENDAR_KEY));

  it('criar: com o id do pedido, os campos da v1 e uma cor sorteada; de novo, o mesmo, sem duplicar', () => {
    const out = apply('lembrete.criar', 'lb-novo', { titulo: 'Reunião', dia: '2026-11-04', hora: '09:00', hora_fim: '10:00', repete: { cada: 'semana', dias_da_semana: [3, 5], vezes: 4 }, notas: ['r-lista'] });
    expect(out.estado).toBe('aplicado');
    const r = store.get('lb-novo')!;
    expect(r).toEqual(jasmine.objectContaining({ title: 'Reunião', date: '2026-11-04', time: '09:00', endTime: '10:00', repeat: 'semana', days: [3, 5], count: 4, until: '2026-11-13', notes: ['r-lista'] }));
    expect(r.color).not.toBe('branco');
    expect(out.carimbo).toBe(r.at);
    expect(out.desde).toBeNull();
    const v = (out.resultado as { lembrete: LembreteV1 }).lembrete;
    expect(v.em_palavras).toBe('Toda semana, na quarta e sexta, a partir de 4 de novembro de 2026, 4 vezes.');
    const again = apply('lembrete.criar', 'lb-novo', { titulo: 'Reunião', dia: '2026-11-04' });
    expect(again).toEqual({ estado: 'aplicado', resultado: { lembrete: v }, antes: null });
    expect(store.reminders().filter((x) => x.id === 'lb-novo').length).toBe(1);
  });

  it('não entra: a anotação presa que não existe, o que não combina, a forma errada', () => {
    expect(apply('lembrete.criar', 'lb-x', { titulo: 'X', dia: '2026-11-04', notas: ['r-sumiu'] })).toEqual(
      jasmine.objectContaining({ estado: 'falhou', resultado: { erro: 'Não achei a anotação r-sumiu para prender no lembrete.' } }),
    );
    expect(apply('lembrete.criar', 'lb-x', { titulo: 'X', dia: '2026-11-04', fim: '2026-11-01' }).estado).toBe('falhou');
    expect(apply('lembrete.criar', 'lb-x', { titulo: 'X' }).estado).toBe('falhou');
    expect(store.get('lb-x')).toBeUndefined();
  });

  it('mudar: com a versão de agora; mudar o dia leva o fim junto; com a versão velha (você mexeu no meio), conflito', () => {
    store.state.update((s) => ({ ...s, reminders: [...s.reminders, reminder({ id: 'lb-ferias', title: 'Férias', date: '2026-12-20', end: '2026-12-24' })] }));
    const out = apply('lembrete.editar', 'lb-ferias', { versao: AT, dia: '2026-12-26', cor: 'rosa' });
    expect(out.estado).toBe('aplicado');
    expect(store.get('lb-ferias')).toEqual(jasmine.objectContaining({ date: '2026-12-26', end: '2026-12-30', color: 'rosa' }));
    expect(out.desde).toBe(AT);
    // a versão lida antes do pedido que entrou aqui ainda vale (a corrente é só de pedidos daqui)
    const stamps = new Map([[`lb-ferias@${out.carimbo}`, AT]]);
    expect(apply('lembrete.editar', 'lb-ferias', { versao: AT, titulo: 'Férias na praia' }, ctx(stamps)).estado).toBe('aplicado');
    // você mexeu: a versão velha da AI dá conflito, com o lembrete de agora
    store.save({ ...store.get('lb-dentista')!, title: 'Dentista (mudei)' });
    const late = apply('lembrete.editar', 'lb-dentista', { versao: AT, hora: '16:00' });
    expect(late.estado).toBe('conflito');
    expect((late.resultado as { lembrete: LembreteV1 }).lembrete.titulo).toBe('Dentista (mudei)');
  });

  it('trocar a repetição, tirar a hora e tirar a repetição (os dias pulados saem junto)', () => {
    store.skipDay('lb-academia', '2026-10-12');
    const v = store.get('lb-academia')!.at;
    apply('lembrete.editar', 'lb-academia', { versao: v, hora: null, repete: { cada: 'mes', vez_no_mes: 1 } });
    expect(store.get('lb-academia')).toEqual(jasmine.objectContaining({ repeat: 'mes', nth: 1 }));
    expect(store.get('lb-academia')!.time).toBeUndefined();
    expect(store.get('lb-academia')!.days).toBeUndefined();
    apply('lembrete.editar', 'lb-academia', { versao: store.get('lb-academia')!.at, repete: null });
    expect(store.get('lb-academia')!.repeat).toBeUndefined();
    expect(store.get('lb-academia')!.skip).toEqual([]);
  });

  it('o lembrete travado pelo Google muda só a cor e as notas', () => {
    expect(apply('lembrete.editar', 'lb-niver', { versao: AT, titulo: 'Niver' }).estado).toBe('falhou');
    expect(apply('lembrete.editar', 'lb-niver', { versao: AT, cor: 'lilas', notas: ['r-receita'] }).estado).toBe('aplicado');
    expect(store.get('lb-niver')).toEqual(jasmine.objectContaining({ title: 'Aniversário da Bia', color: 'lilas', notes: ['r-receita'], google: jasmine.objectContaining({ lock: 'google' }) }));
  });

  it('apagar só um dia: a vez que começa nele, num lembrete que se repete; ou apagar inteiro', () => {
    expect(apply('lembrete.apagar', 'lb-dentista', { versao: AT, dia: '2026-11-03' }).estado).toBe('falhou');
    // terça não é dia da academia
    expect(apply('lembrete.apagar', 'lb-academia', { versao: AT, dia: '2026-10-20' }).estado).toBe('falhou');
    const day = apply('lembrete.apagar', 'lb-academia', { versao: AT, dia: '2026-10-19' });
    expect(day.estado).toBe('aplicado');
    expect(store.get('lb-academia')!.skip).toEqual(['2026-10-19']);
    expect((day.antes as Reminder).skip).toEqual([]);
    const whole = apply('lembrete.apagar', 'lb-dentista', { versao: AT });
    expect(whole).toEqual(jasmine.objectContaining({ estado: 'aplicado', resultado: { lembrete: null } }));
    expect(store.get('lb-dentista')).toBeUndefined();
    expect(apply('lembrete.editar', 'lb-dentista', { versao: AT, cor: 'rosa' }).estado).toBe('falhou');
  });

  it('o Desfazer: o criado sai, o mudado e o apagado voltam como eram', () => {
    apply('lembrete.criar', 'lb-novo', { titulo: 'Reunião', dia: '2026-11-04' });
    undoCalendar(store, { op: 'lembrete.criar', alvo: 'lb-novo' });
    expect(store.get('lb-novo')).toBeUndefined();
    const changed = apply('lembrete.editar', 'lb-academia', { versao: AT, titulo: 'Pilates', repete: null });
    undoCalendar(store, { op: 'lembrete.editar', alvo: 'lb-academia', antes: changed.antes });
    expect(store.get('lb-academia')).toEqual(jasmine.objectContaining({ title: 'Academia', repeat: 'semana', days: [1, 3] }));
    expect(store.get('lb-academia')!.at > AT).toBeTrue();
    const gone = apply('lembrete.apagar', 'lb-dentista', { versao: AT });
    undoCalendar(store, { op: 'lembrete.apagar', alvo: 'lb-dentista', antes: JSON.parse(JSON.stringify(gone.antes)) });
    expect(store.get('lb-dentista')).toEqual(jasmine.objectContaining({ title: 'Dentista', time: '14:30' }));
    expect(undoable({ estado: 'aplicado', op: 'lembrete.criar', antes: null })).toBeTrue();
  });

  it('as frases, esperando e no histórico, e o nome que a pessoa reconhece', () => {
    expect(calendarWords('lembrete.criar', { titulo: 'Dentista', dia: '2026-11-03', hora: '14:30' }, 'Dentista')).toBe('Marcar “Dentista” para 3 de novembro, às 14h30');
    expect(requestWords('lembrete.criar', { titulo: 'Aula', dia: '2026-11-03', repete: { cada: 'semana' } }, 'Aula', true)).toBe('marcou “Aula” para 3 de novembro, toda semana');
    expect(requestWords('lembrete.editar', { versao: AT, dia: '2026-11-04', hora: '15:00' }, 'Dentista')).toBe('Mudar o dia e o horário de “Dentista”');
    expect(requestWords('lembrete.apagar', { versao: AT, dia: '2026-10-19' }, 'Academia')).toBe('Tirar “Academia” de 19 de outubro');
    expect(requestWords('lembrete.apagar', { versao: AT }, 'Dentista', true)).toBe('apagou o lembrete “Dentista”');
    expect(calendarTitle(store, { op: 'lembrete.criar', alvo: 'x', dados: { titulo: 'Reunião' } })).toBe('Reunião');
    expect(calendarTitle(store, { op: 'lembrete.editar', alvo: 'lb-academia', dados: {} })).toBe('Academia');
    expect(calendarTitle(store, { op: 'lembrete.apagar', alvo: 'lb-sumiu', dados: {}, antes: DENTISTA })).toBe('Dentista');
  });
});
