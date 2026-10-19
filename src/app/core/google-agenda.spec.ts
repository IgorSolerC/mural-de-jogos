import { Reminder, occursOn, repeatSentence, repeatShort, sanitizeReminder } from './calendar';
import { GEvent, eventIdFor, fromEvent, instanceIdFor, parseRecurrence, reminderIdFor, ruleOf, toEvent } from './google-agenda';

const T = '2026-10-10T10:00:00.000Z';

function reminder(over: Partial<Reminder> = {}): Reminder {
  return { id: 'rbolo00001', title: 'Bolo', date: '2026-10-20', color: 'rosa', notes: [], skip: [], createdAt: T, at: T, ...over };
}

function event(over: Partial<GEvent> = {}): GEvent {
  return { id: 'abc123def456', status: 'confirmed', summary: 'Dentista', start: { date: '2026-10-20' }, end: { date: '2026-10-21' }, updated: '2026-10-12T08:00:00.000Z', etag: '"1"', seu: true, tipo: 'default', htmlLink: 'https://www.google.com/calendar/event?eid=x', ...over };
}

describe('Google Agenda: os ids', () => {
  it('o evento de um lembrete do Murall tem um id que volta para o lembrete; o de um evento do Google também', () => {
    const id = eventIdFor('rbolo00001');
    expect(id).toMatch(/^mu[0-9a-f]+$/);
    expect(reminderIdFor(id)).toBe('rbolo00001');
    expect(reminderIdFor('abc123def456')).toBe('gabc123def456');
    expect(eventIdFor('gabc123def456')).toBe('abc123def456');
    // id comprido: um resumo fixo
    const long = 'a'.repeat(80);
    expect(reminderIdFor(long)).toBe(reminderIdFor(long));
    expect(reminderIdFor(long).length).toBeLessThanOrEqual(64);
  });
});

describe('Google Agenda: do lembrete para o evento', () => {
  it('o dia todo, com a cor mais perto e as anotações na descrição', () => {
    expect(toEvent(reminder(), 'America/Sao_Paulo', ['Receita do bolo'])).toEqual({
      summary: 'Bolo',
      start: { date: '2026-10-20' },
      end: { date: '2026-10-21' },
      colorId: '4',
      description: 'Anotações no Murall: Receita do bolo',
    });
    // o branco fica na cor da agenda
    expect(toEvent(reminder({ color: 'branco' }), 'UTC').colorId).toBeUndefined();
  });

  it('com horário: uma hora no fuso do aparelho (ou até a hora do fim), virando o dia se preciso', () => {
    const e = toEvent(reminder({ time: '23:30' }), 'America/Sao_Paulo');
    expect(e.start).toEqual({ dateTime: '2026-10-20T23:30:00', timeZone: 'America/Sao_Paulo' });
    expect(e.end).toEqual({ dateTime: '2026-10-21T00:30:00', timeZone: 'America/Sao_Paulo' });
    const longo = toEvent(reminder({ time: '09:00', endTime: '11:30' }), 'UTC');
    expect(longo.end).toEqual({ dateTime: '2026-10-20T11:30:00', timeZone: 'UTC' });
  });

  it('a repetição vira RRULE, com o último dia dos meses curtos, o 29 de fevereiro, o fim e os dias tirados', () => {
    expect(ruleOf(reminder({ repeat: 'semana' }))).toBe('FREQ=WEEKLY');
    expect(ruleOf(reminder({ date: '2026-01-31', repeat: 'mes' }))).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
    expect(ruleOf(reminder({ date: '2024-02-29', repeat: 'ano' }))).toBe('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
    expect(ruleOf(reminder({ repeat: 'semana', every: 2, days: [1, 3], until: '2026-12-31' }))).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231');
    expect(toEvent(reminder({ repeat: 'ano', skip: ['2027-10-20'] }), 'UTC').recurrence).toEqual(['RRULE:FREQ=YEARLY', 'EXDATE;VALUE=DATE:20271020']);
    expect(toEvent(reminder({ repeat: 'dia', time: '08:00', skip: ['2026-10-22'] }), 'America/Sao_Paulo').recurrence).toEqual([
      'RRULE:FREQ=DAILY',
      'EXDATE;TZID=America/Sao_Paulo:20261022T080000',
    ]);
  });

  it('a regra que vai é a mesma que volta', () => {
    for (const r of [
      reminder({ repeat: 'dia' }),
      reminder({ repeat: 'semana', every: 3 }),
      reminder({ date: '2026-01-30', repeat: 'mes' }),
      reminder({ date: '2024-02-29', repeat: 'ano' }),
      reminder({ repeat: 'semana', days: [2, 4], until: '2027-01-10' }),
    ]) {
      const back = parseRecurrence([`RRULE:${ruleOf(r)}`], r.date)!;
      expect({ repeat: back.repeat as string | undefined, every: back.every, days: back.days, until: back.until }).toEqual({ repeat: r.repeat, every: r.every, days: r.days, until: r.until });
    }
  });
});

describe('Google Agenda: a repetição que vem do Google', () => {
  it('lê os jeitos que o Murall sabe mostrar, os dias tirados e o COUNT como um último dia', () => {
    expect(parseRecurrence(undefined, '2026-10-20')).toBeUndefined();
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY;BYDAY=TU;WKST=MO'], '2026-10-20')).toEqual({ repeat: 'semana', skip: [] });
    expect(parseRecurrence(['RRULE:FREQ=MONTHLY;BYMONTHDAY=20', 'EXDATE;VALUE=DATE:20261120,20261220'], '2026-10-20')).toEqual({ repeat: 'mes', skip: ['2026-11-20', '2026-12-20'] });
    expect(parseRecurrence(['RRULE:FREQ=DAILY;COUNT=3'], '2026-10-20')!.until).toBe('2026-10-22');
    expect(parseRecurrence(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4'], '2026-10-19')!.until).toBe('2026-11-04');
  });

  it('o que só o Google sabe fazer fica de fora', () => {
    expect(parseRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=2SA'], '2026-10-10')).toBeNull();
    expect(parseRecurrence(['RRULE:FREQ=HOURLY'], '2026-10-10')).toBeNull();
    expect(parseRecurrence(['RRULE:FREQ=DAILY', 'RDATE:20261111'], '2026-10-10')).toBeNull();
    expect(parseRecurrence(['RRULE:FREQ=YEARLY;BYMONTH=3'], '2026-10-10')).toBeNull();
  });

  it('as repetições novas aparecem nos dias certos e dizem como repetem', () => {
    const quinzena = { date: '2026-10-19', repeat: 'semana' as const, every: 2, days: [1, 3], skip: [] };
    expect(['2026-10-19', '2026-10-21', '2026-10-26', '2026-11-02', '2026-11-04'].map((d) => occursOn(quinzena, d))).toEqual([true, true, false, true, true]);
    expect(occursOn({ date: '2026-10-19', repeat: 'dia', until: '2026-10-21', skip: [] }, '2026-10-22')).toBeFalse();
    expect(repeatSentence('semana', '2026-10-19', { every: 2, days: [1, 3] })).toBe('A cada 2 semanas, na segunda e quarta, a partir de 19 de outubro de 2026.');
    expect(repeatSentence('dia', '2026-10-19', { until: '2026-10-21' })).toBe('Todo dia, a partir de 19 de outubro de 2026, até 21 de outubro de 2026.');
    expect(repeatShort({ repeat: 'mes', date: '2026-10-19', every: 3 })).toBe('a cada 3 meses');
    expect(repeatShort({ repeat: 'semana', date: '2026-10-19', days: [1, 3] })).toBe('segunda e quarta');
  });
});

describe('Google Agenda: do evento para o lembrete', () => {
  const today = '2026-10-18';

  it('um evento seu vira um lembrete ligado, com a versão e o link; as anotações do Murall ficam', () => {
    const r = fromEvent(event({ colorId: '5' }), reminder({ id: 'gabc123def456', notes: ['nbolo'] }), today);
    expect(r.kind).toBe('upsert');
    const x = (r as { reminder: Reminder }).reminder;
    expect(x).toEqual(
      jasmine.objectContaining({ id: 'gabc123def456', title: 'Dentista', date: '2026-10-20', color: 'amarelo', notes: ['nbolo'], at: '2026-10-12T08:00:00.000Z' }),
    );
    expect(x.google).toEqual({ id: 'abc123def456', etag: '"1"', at: '2026-10-12T08:00:00.000Z', link: 'https://www.google.com/calendar/event?eid=x' });
    expect(x.time).toBeUndefined();
  });

  it('com horário, no fuso daqui, e a hora do fim quando não dura uma hora', () => {
    const start = new Date(2026, 9, 20, 15, 0);
    const end = new Date(2026, 9, 20, 15, 30);
    const r = fromEvent(event({ start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }), undefined, today) as { reminder: Reminder };
    expect(r.reminder.date).toBe('2026-10-20');
    expect(r.reminder.time).toBe('15:00');
    expect(r.reminder.endTime).toBe('15:30');
    expect(r.reminder.end).toBeUndefined();
    expect(r.reminder.color).toBe('azul');
  });

  it('um convite, um aniversário ou um "a cada 2 semanas" ficam só para ler; os tipos que não são lembrete ficam de fora', () => {
    expect((fromEvent(event({ seu: false }), undefined, today) as { reminder: Reminder }).reminder.google!.lock).toBe('convite');
    expect((fromEvent(event({ tipo: 'birthday', recurrence: ['RRULE:FREQ=YEARLY'] }), undefined, today) as { reminder: Reminder }).reminder.google!.lock).toBe('google');
    expect((fromEvent(event({ recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2'] }), undefined, today) as { reminder: Reminder }).reminder.google!.lock).toBe('repeticao');
    expect(fromEvent(event({ tipo: 'workingLocation' }), undefined, today)).toEqual({ kind: 'ignore', reason: 'tipo' });
    expect(fromEvent(event({ recurrence: ['RRULE:FREQ=MONTHLY;BYDAY=1MO'] }), undefined, today)).toEqual({ kind: 'ignore', reason: 'repeticao' });
  });

  it('vários dias: o dia todo até o último dia, e com horário até a hora do fim (meia-noite é o fim do dia de antes)', () => {
    const feriado = fromEvent(event({ start: { date: '2026-10-20' }, end: { date: '2026-10-23' } }), undefined, today) as { reminder: Reminder };
    expect(feriado.reminder.end).toBe('2026-10-22');
    expect(feriado.reminder.google!.dur).toBeUndefined();
    const viagem = fromEvent(event({ start: { dateTime: new Date(2026, 9, 20, 20, 0).toISOString() }, end: { dateTime: new Date(2026, 9, 22, 10, 0).toISOString() } }), undefined, today) as {
      reminder: Reminder;
    };
    expect(viagem.reminder).toEqual(jasmine.objectContaining({ date: '2026-10-20', time: '20:00', end: '2026-10-22', endTime: '10:00' }));
    const ateMeiaNoite = fromEvent(event({ start: { dateTime: new Date(2026, 9, 20, 20, 0).toISOString() }, end: { dateTime: new Date(2026, 9, 23, 0, 0).toISOString() } }), undefined, today) as {
      reminder: Reminder;
    };
    expect(ateMeiaNoite.reminder.end).toBe('2026-10-22');
    expect(ateMeiaNoite.reminder.endTime).toBeUndefined();
    // e de volta, igual
    expect(toEvent(feriado.reminder, 'UTC').end).toEqual({ date: '2026-10-23' });
    expect(toEvent(viagem.reminder, 'UTC').end).toEqual({ dateTime: '2026-10-22T10:00:00', timeZone: 'UTC' });
    expect(toEvent(ateMeiaNoite.reminder, 'UTC').end).toEqual({ dateTime: '2026-10-23T00:00:00', timeZone: 'UTC' });
  });

  it('o lembrete guardado com a duração de antes ganha o fim no lugar dela', () => {
    expect(sanitizeReminder(reminder({ google: { id: 'abc123def456', dur: 3 } }))).toEqual(jasmine.objectContaining({ end: '2026-10-22', google: { id: 'abc123def456' } }));
    expect(sanitizeReminder(reminder({ time: '09:00', google: { id: 'abc123def456', dur: 150 } }))).toEqual(jasmine.objectContaining({ endTime: '11:30', google: { id: 'abc123def456' } }));
    const longo = sanitizeReminder(reminder({ time: '20:00', google: { id: 'abc123def456', dur: 38 * 60 } }))!;
    expect([longo.end, longo.endTime]).toEqual(['2026-10-22', '10:00']);
  });

  it('os dias tirados lá como "só este evento" ficam no lembrete quando o evento muda', () => {
    const antes = reminder({ id: 'gabc123def456', repeat: 'semana', skip: ['2026-10-27'], google: { id: 'abc123def456', skip: ['2026-10-27'] } });
    const r = fromEvent(event({ summary: 'Pilates', recurrence: ['RRULE:FREQ=WEEKLY', 'EXDATE;VALUE=DATE:20261103'] }), antes, today) as { reminder: Reminder };
    expect(r.reminder.skip).toEqual(['2026-10-27', '2026-11-03']);
    expect(r.reminder.google!.skip).toEqual(['2026-10-27', '2026-11-03']);
  });

  it('o id de uma vez de um que repete: o dia, e com horário a hora do começo em UTC', () => {
    expect(instanceIdFor('abc123def456', {}, '2026-10-27')).toBe('abc123def456_20261027');
    const utc = new Date(2026, 9, 27, 9, 0).toISOString().slice(0, 19).replace(/[-:]/g, '');
    expect(instanceIdFor('abc123def456', { time: '09:00' }, '2026-10-27')).toBe(`abc123def456_${utc}Z`);
  });

  it('apagado no Google, uma vez tirada de um que repete, e o que acabou faz tempo', () => {
    expect(fromEvent(event({ status: 'cancelled' }), undefined, today)).toEqual({ kind: 'remove' });
    expect(fromEvent({ id: 'abc_20261027', status: 'cancelled', recurringEventId: 'abc123def456', originalStartTime: { date: '2026-10-27' } }, undefined, today)).toEqual({
      kind: 'skipDay',
      masterEventId: 'abc123def456',
      day: '2026-10-27',
    });
    expect(fromEvent(event({ recurringEventId: 'abc123def456' }), undefined, today)).toEqual({ kind: 'ignore', reason: 'excecao' });
    expect(fromEvent(event({ start: { date: '2026-08-01' }, end: { date: '2026-08-02' } }), undefined, today)).toEqual({ kind: 'ignore', reason: 'antigo' });
    // o que já está no Murall continua acompanhando
    expect(fromEvent(event({ start: { date: '2026-08-01' }, end: { date: '2026-08-02' } }), reminder({ id: 'gabc123def456' }), today).kind).toBe('upsert');
    // repete sem fim: vem, mesmo tendo começado há anos
    expect(fromEvent(event({ start: { date: '2015-03-14' }, end: { date: '2015-03-15' }, recurrence: ['RRULE:FREQ=YEARLY'] }), undefined, today).kind).toBe('upsert');
  });
});
