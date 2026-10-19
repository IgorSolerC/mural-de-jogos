import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Reminder } from './calendar';
import { CalendarStore } from './calendar-store';
import { CloudAccount, CloudError } from './cloud-account';
import { GEvent, eventIdFor } from './google-agenda';
import { GoogleAgenda } from './google-agenda-sync';
import { ReviewStore } from './review-store';

/**
 * A sincronização com o Google Agenda: a API é de mentira (uma agenda na memória, com o sync token), e
 * o que se confere é o que o Murall manda e o que fica no Calendário.
 */

const T0 = '2026-10-10T10:00:00.000Z';

interface FakeCalendar {
  events: Map<string, GEvent>;
  /** Os eventos mudados desde cada sync token. */
  changes: GEvent[];
  version: number;
  ops: { acao: string; id: string; evento?: Record<string, unknown> }[];
  refazer: boolean;
  /** Os ids que o Google recusa (400). */
  refuse: string[];
}

describe('o Google Agenda ligado ao Calendário', () => {
  let google: GoogleAgenda;
  let calendar: CalendarStore;
  let fake: FakeCalendar;
  let connected: boolean;

  const reminder = (id: string, title: string, over: Partial<Reminder> = {}): Reminder => ({ id, title, date: '2026-10-20', color: 'rosa', notes: [], skip: [], createdAt: T0, at: T0, ...over });

  /** A API do Murall com a agenda de mentira por trás. */
  async function api(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
    const url = new URL(path, 'https://api.teste');
    if (url.pathname === '/v1/agenda' && !init.method) return { disponivel: true, conectada: connected, desde: connected ? T0 : null };
    if (url.pathname === '/v1/agenda' && init.method === 'DELETE') {
      connected = false;
      return { ok: true };
    }
    if (!connected) throw new CloudError('desligada', 'agenda-desligada', 409);
    if (url.pathname === '/v1/agenda/eventos') {
      const sync = url.searchParams.get('sync');
      if (sync && fake.refazer) {
        fake.refazer = false;
        throw new CloudError('refazer', 'agenda-refazer', 410);
      }
      const eventos = sync ? fake.changes.filter((e) => Number(e.updated!.slice(-4, -1)) > Number(sync)) : [...fake.events.values()];
      return { eventos, sync: String(fake.version) };
    }
    if (url.pathname === '/v1/agenda/enviar') {
      const { ops } = init.body as { ops: FakeCalendar['ops'] };
      fake.ops.push(...ops);
      return {
        resultados: ops.map((op) => {
          fake.version++;
          const updated = `2026-10-18T12:00:00.${String(fake.version).padStart(3, '0')}Z`;
          if (fake.refuse.includes(op.id)) return { id: op.id, ok: false, erro: 'recusado' };
          // uma vez só de um que repete: tirada ou devolvida (o evento dela não muda)
          if (op.id.includes('_')) return { id: op.id, ok: true };
          if (op.acao === 'apagar') {
            fake.events.delete(op.id);
            return { id: op.id, ok: true };
          }
          const ev: GEvent = { id: op.id, status: 'confirmed', ...(op.evento as object), updated, etag: `"e${fake.version}"`, seu: true, tipo: 'default' };
          fake.events.set(op.id, ev);
          fake.changes.push(ev);
          return { id: op.id, ok: true, etag: ev.etag, updated, htmlLink: 'https://www.google.com/calendar/event?eid=' + op.id };
        }),
      };
    }
    throw new Error('rota desconhecida ' + path);
  }

  /** Uma mudança feita no Google (como se fosse no celular, no app do Google). */
  function changeInGoogle(ev: Partial<GEvent> & { id: string }): void {
    fake.version++;
    const full: GEvent = { status: 'confirmed', seu: true, tipo: 'default', ...fake.events.get(ev.id), ...ev, updated: `2026-10-18T12:00:00.${String(fake.version).padStart(3, '0')}Z`, etag: `"e${fake.version}"` };
    if (full.status === 'cancelled') fake.events.delete(ev.id);
    else fake.events.set(ev.id, full);
    fake.changes.push(full);
  }

  beforeEach(async () => {
    localStorage.clear();
    connected = true;
    fake = { events: new Map(), changes: [], version: 0, ops: [], refazer: false, refuse: [] };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: CloudAccount,
          useValue: { account: signal({ id: 'u1', codigo: 'K7QF-M2XA', nome: 'Igor' }), signedIn: signal(true), request: (p: string, i?: { method?: string; body?: unknown }) => api(p, i) },
        },
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([]);
    calendar = TestBed.inject(CalendarStore);
    calendar.today.set('2026-10-18');
    calendar.state.set({ reminders: [], removed: {} });
    google = TestBed.inject(GoogleAgenda);
    TestBed.tick();
    await google.refresh('u1');
  });
  afterEach(() => localStorage.clear());

  it('ligado, manda os lembretes do Murall (com o id que não repete) e traz os eventos do Google', async () => {
    calendar.state.set({ reminders: [reminder('rbolo00001', 'Fazer bolo', { repeat: 'ano' })], removed: {} });
    fake.events.set('dentista0001', { id: 'dentista0001', status: 'confirmed', summary: 'Dentista', start: { date: '2026-10-22' }, end: { date: '2026-10-23' }, updated: '2026-10-11T00:00:00.000Z', etag: '"d"', seu: true, tipo: 'default' });
    await google.sync();
    expect(fake.ops).toEqual([{ acao: 'criar', id: eventIdFor('rbolo00001'), evento: jasmine.objectContaining({ summary: 'Fazer bolo', recurrence: ['RRULE:FREQ=YEARLY'] }) }]);
    const bolo = calendar.get('rbolo00001')!;
    expect(bolo.google!.id).toBe(eventIdFor('rbolo00001'));
    expect(bolo.google!.at).toBe(bolo.at);
    expect(calendar.get('gdentista0001')!.title).toBe('Dentista');
    expect(google.pending()).toBe(0);
    // a segunda rodada não manda nada: o eco do que foi mandado volta igual (a mesma versão)
    fake.ops = [];
    await google.sync();
    expect(fake.ops).toEqual([]);
    expect(calendar.get('rbolo00001')!.title).toBe('Fazer bolo');
  });

  it('mudou no Google: muda no Murall (as anotações ficam); mudou no Murall: muda no Google', async () => {
    calendar.state.set({ reminders: [reminder('rbolo00001', 'Fazer bolo', { notes: ['nreceita1'] })], removed: {} });
    await google.sync();
    const id = eventIdFor('rbolo00001');
    changeInGoogle({ id, summary: 'Fazer bolo de chocolate' });
    await google.sync();
    expect(calendar.get('rbolo00001')!.title).toBe('Fazer bolo de chocolate');
    expect(calendar.get('rbolo00001')!.notes).toEqual(['nreceita1']);
    fake.ops = [];
    calendar.save({ ...calendar.get('rbolo00001')!, title: 'Bolo da Bia' });
    expect(google.pending()).toBe(1);
    await google.sync();
    expect(fake.ops).toEqual([{ acao: 'mudar', id, evento: jasmine.objectContaining({ summary: 'Bolo da Bia' }) }]);
  });

  it('apagado num lado, apagado no outro', async () => {
    calendar.state.set({ reminders: [reminder('rbolo00001', 'Bolo'), reminder('rcafe00001', 'Café')], removed: {} });
    await google.sync();
    // no Murall
    calendar.remove('rbolo00001');
    fake.ops = [];
    await google.sync();
    expect(fake.ops).toEqual([{ acao: 'apagar', id: eventIdFor('rbolo00001') }]);
    // não manda de novo
    fake.ops = [];
    await google.sync();
    expect(fake.ops).toEqual([]);
    // no Google
    changeInGoogle({ id: eventIdFor('rcafe00001'), status: 'cancelled' });
    await google.sync();
    expect(calendar.get('rcafe00001')).toBeUndefined();
    expect(fake.ops).toEqual([]);
  });

  it('uma vez tirada no Google, de um que repete, vira um dia tirado no Murall', async () => {
    calendar.state.set({ reminders: [reminder('rbolo00001', 'Bolo', { repeat: 'semana' })], removed: {} });
    await google.sync();
    const id = eventIdFor('rbolo00001');
    fake.version++;
    fake.changes.push({ id: `${id}_20261027`, status: 'cancelled', recurringEventId: id, originalStartTime: { date: '2026-10-27' }, updated: `2026-10-18T12:00:00.${String(fake.version).padStart(3, '0')}Z` });
    await google.sync();
    expect(calendar.get('rbolo00001')!.skip).toEqual(['2026-10-27']);
  });

  it('a vez tirada chega antes do evento, na mesma leva, e o evento mudado depois não a traz de volta', async () => {
    fake.events.set('pilates0001', {
      id: 'pilates0001',
      status: 'confirmed',
      summary: 'Pilates',
      start: { date: '2026-10-20' },
      end: { date: '2026-10-21' },
      recurrence: ['RRULE:FREQ=WEEKLY'],
      updated: T0,
      etag: '"p"',
      seu: true,
      tipo: 'default',
    });
    const tirada: GEvent = { id: 'pilates0001_20261027', status: 'cancelled', recurringEventId: 'pilates0001', originalStartTime: { date: '2026-10-27' } };
    // a leitura do zero devolve a vez tirada antes do evento dela
    const all = [tirada, ...fake.events.values()];
    fake.events = new Map(all.map((e) => [e.id, e]));
    await google.sync();
    expect(calendar.get('gpilates0001')!.skip).toEqual(['2026-10-27']);
    expect(fake.ops).toEqual([]);
    changeInGoogle({ id: 'pilates0001', summary: 'Pilates da manhã' });
    await google.sync();
    const r = calendar.get('gpilates0001')!;
    expect(r.title).toBe('Pilates da manhã');
    expect(r.skip).toEqual(['2026-10-27']);
    expect(google.pending()).toBe(0);
  });

  it('"Só neste dia" no Murall: o evento vai com o dia de fora e a vez é tirada no Google; o Desfazer a devolve', async () => {
    calendar.state.set({ reminders: [reminder('rbolo00001', 'Bolo', { repeat: 'semana' })], removed: {} });
    await google.sync();
    const id = eventIdFor('rbolo00001');
    const antes = calendar.get('rbolo00001')!;
    calendar.skipDay('rbolo00001', '2026-10-27');
    expect(google.pending()).toBe(1);
    fake.ops = [];
    await google.sync();
    expect(fake.ops).toEqual([
      { acao: 'mudar', id, evento: jasmine.objectContaining({ recurrence: ['RRULE:FREQ=WEEKLY', 'EXDATE;VALUE=DATE:20261027'] }) },
      { acao: 'apagar', id: `${id}_20261027` },
    ]);
    expect(calendar.get('rbolo00001')!.google!.skip).toEqual(['2026-10-27']);
    expect(google.pending()).toBe(0);
    fake.ops = [];
    calendar.restore(antes);
    await google.sync();
    expect(fake.ops).toEqual([
      { acao: 'mudar', id, evento: jasmine.objectContaining({ recurrence: ['RRULE:FREQ=WEEKLY'] }) },
      { acao: 'voltar', id: `${id}_20261027` },
    ]);
    expect(calendar.get('rbolo00001')!.google!.skip).toEqual([]);
  });

  it('uma repetição que só o Google muda: um dia sai daqui (só a vez), e apagar tudo apaga lá', async () => {
    fake.events.set('quintas0001', {
      id: 'quintas0001',
      status: 'confirmed',
      summary: 'Faxina',
      start: { date: '2026-10-20' },
      end: { date: '2026-10-21' },
      recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2'],
      updated: T0,
      etag: '"q"',
      seu: true,
      tipo: 'default',
    });
    await google.sync();
    expect(calendar.get('gquintas0001')!.google!.lock).toBe('repeticao');
    calendar.skipDay('gquintas0001', '2026-11-03');
    fake.ops = [];
    await google.sync();
    expect(fake.ops).toEqual([{ acao: 'apagar', id: 'quintas0001_20261103' }]);
    calendar.remove('gquintas0001');
    fake.ops = [];
    await google.sync();
    expect(fake.ops).toEqual([{ acao: 'apagar', id: 'quintas0001' }]);
  });

  it('desconectar desfaz os vínculos: o que veio do Google vira lembrete do Murall, que muda aqui', async () => {
    fake.events.set('convite0001', { id: 'convite0001', status: 'confirmed', summary: 'Reunião', start: { date: '2026-10-21' }, end: { date: '2026-10-22' }, updated: T0, etag: '"c"', seu: false, tipo: 'default' });
    calendar.state.set({ reminders: [reminder('rbolo00001', 'Bolo')], removed: {} });
    await google.sync();
    const before = calendar.get('gconvite0001')!;
    expect(before.google!.lock).toBe('convite');
    await google.disconnect();
    expect(google.status()).toBe('desligada');
    expect(calendar.reminders().every((r) => !r.google)).toBeTrue();
    expect(calendar.get('gconvite0001')!.at > before.at).toBeTrue();
    // apagar agora não leva nada ao Google
    calendar.remove('gconvite0001');
    expect(calendar.state().googleTrash).toBeUndefined();
  });

  it('o Google recusou uma mudança: a folha diz, e ela vai de novo na próxima rodada', async () => {
    calendar.state.set({ reminders: [reminder('rbolo00001', 'Bolo')], removed: {} });
    fake.refuse = [eventIdFor('rbolo00001')];
    await google.sync();
    expect(google.error()).toContain('O Google não aceitou 1 mudança');
    expect(google.pending()).toBe(1);
    fake.refuse = [];
    await google.sync();
    expect(google.error()).toBeNull();
    expect(google.pending()).toBe(0);
  });

  it('vários dias vão e voltam inteiros', async () => {
    calendar.state.set({ reminders: [reminder('rviagem0001', 'Viagem', { end: '2026-10-22' })], removed: {} });
    await google.sync();
    expect(fake.ops[0].evento).toEqual(jasmine.objectContaining({ start: { date: '2026-10-20' }, end: { date: '2026-10-23' } }));
    changeInGoogle({ id: eventIdFor('rviagem0001'), end: { date: '2026-10-25' } });
    await google.sync();
    expect(calendar.get('rviagem0001')!.end).toBe('2026-10-24');
  });

  it('os dois mudaram: vale a mudança mais nova', async () => {
    calendar.state.set({ reminders: [reminder('rbolo00001', 'Bolo')], removed: {} });
    await google.sync();
    const id = eventIdFor('rbolo00001');
    // o Google mudou antes; o Murall depois (o relógio daqui é mais novo que o 2026-10-18 do Google)
    changeInGoogle({ id, summary: 'Do Google' });
    calendar.save({ ...calendar.get('rbolo00001')!, title: 'Do Murall' });
    fake.ops = [];
    await google.sync();
    expect(calendar.get('rbolo00001')!.title).toBe('Do Murall');
    expect(fake.ops[0]).toEqual(jasmine.objectContaining({ acao: 'mudar', id }));
  });

  it('um convite de outra pessoa vem só para ler: o Murall nunca o manda', async () => {
    fake.events.set('convite0001', { id: 'convite0001', status: 'confirmed', summary: 'Reunião', start: { date: '2026-10-21' }, end: { date: '2026-10-22' }, updated: T0, etag: '"c"', seu: false, tipo: 'default' });
    await google.sync();
    const r = calendar.get('gconvite0001')!;
    expect(r.google!.lock).toBe('convite');
    calendar.save({ ...r, notes: ['nata00001'] });
    fake.ops = [];
    await google.sync();
    expect(fake.ops).toEqual([]);
    expect(google.pending()).toBe(0);
  });

  it('o Google esqueceu o ponto: lê tudo de novo; a permissão saiu: fica desligado', async () => {
    await google.sync();
    fake.events.set('novo0000001', { id: 'novo0000001', status: 'confirmed', summary: 'Novo', start: { date: '2026-10-25' }, end: { date: '2026-10-26' }, updated: T0, etag: '"n"', seu: true, tipo: 'default' });
    fake.refazer = true;
    await google.sync();
    expect(calendar.get('gnovo0000001')!.title).toBe('Novo');
    connected = false;
    await google.sync();
    expect(google.status()).toBe('desligada');
    expect(google.error()).toContain('Ligue de novo');
  });
});
