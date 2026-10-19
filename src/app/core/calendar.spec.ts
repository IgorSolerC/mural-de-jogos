import {
  CalendarState,
  Reminder,
  addDays,
  addMonths,
  calendarToSync,
  coversDay,
  drawColor,
  isDay,
  isPast,
  mergeCalendar,
  monthGrid,
  nextOccurrence,
  occurrenceStart,
  occursOn,
  rangeLabel,
  remindersOn,
  repeatSentence,
  repeatShort,
  sanitizeCalendar,
  sanitizeReminder,
  segmentOn,
  skipDay,
  spanLabel,
  timeLabel,
  timeOn,
  weekDays,
  weekLabel,
  weekday,
} from './calendar';

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rlembrete1',
    title: 'Lembrete',
    date: '2026-10-18',
    color: 'amarelo',
    notes: [],
    skip: [],
    createdAt: '2026-10-18T10:00:00.000Z',
    at: '2026-10-18T10:00:00.000Z',
    ...over,
  };
}

describe('Calendário: os dias', () => {
  it('conhece os dias de verdade', () => {
    expect(isDay('2026-10-18')).toBeTrue();
    expect(isDay('2028-02-29')).toBeTrue();
    expect(isDay('2027-02-29')).toBeFalse();
    expect(isDay('2026-13-01')).toBeFalse();
    expect(isDay('18/10/2026')).toBeFalse();
    expect(isDay(20261018)).toBeFalse();
  });

  it('anda pelos dias e meses sem fuso, e o 31 vira o último dia do mês curto', () => {
    expect(weekday('2026-10-18')).toBe(0); // domingo
    expect(weekday('1970-01-01')).toBe(4);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2028-03-31', -1)).toBe('2028-02-29');
  });

  it('a semana vai de domingo a sábado, e a folha do mês tem semanas inteiras', () => {
    expect(weekDays('2026-10-21')).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
    const grid = monthGrid('2026-10');
    expect(grid.length).toBe(5);
    expect(grid[0][0]).toBe('2026-09-27');
    expect(grid[4][6]).toBe('2026-10-31');
    expect(grid.every((w) => w.length === 7)).toBeTrue();
    // fevereiro de 2026 começa num domingo e acaba num sábado: quatro semanas certinhas
    expect(monthGrid('2026-02').length).toBe(4);
    expect(monthGrid('2026-08').length).toBe(6);
  });

  it('escreve a semana e o horário como o site', () => {
    expect(weekLabel('2026-10-21')).toBe('18 a 24 de outubro de 2026');
    expect(weekLabel('2026-10-01')).toBe('27 de set. a 3 de out. de 2026');
    expect(weekLabel('2026-12-31')).toBe('27 de dez. de 2026 a 2 de jan. de 2027');
    expect(timeLabel('09:00')).toBe('9h');
    expect(timeLabel('21:05')).toBe('21h05');
  });
});

describe('Calendário: quando o lembrete aparece', () => {
  it('o de um dia só aparece só nele', () => {
    const r = reminder({ date: '2027-08-23' });
    expect(occursOn(r, '2027-08-23')).toBeTrue();
    expect(occursOn(r, '2028-08-23')).toBeFalse();
    expect(nextOccurrence(r, '2026-10-18')).toBe('2027-08-23');
    expect(nextOccurrence(r, '2027-08-24')).toBeNull();
  });

  it('repete todo dia, toda semana, todo mês e todo ano, sempre a partir do primeiro dia', () => {
    const dia = reminder({ repeat: 'dia' });
    expect(occursOn(dia, '2026-10-17')).toBeFalse();
    expect(occursOn(dia, '2030-01-01')).toBeTrue();

    const semana = reminder({ date: '2026-10-22', repeat: 'semana' }); // quinta
    expect(occursOn(semana, '2026-10-29')).toBeTrue();
    expect(occursOn(semana, '2026-10-30')).toBeFalse();
    expect(occursOn(semana, '2026-10-15')).toBeFalse();

    const mes = reminder({ date: '2026-01-31', repeat: 'mes' });
    expect(occursOn(mes, '2026-02-28')).toBeTrue();
    expect(occursOn(mes, '2026-04-30')).toBeTrue();
    expect(occursOn(mes, '2026-05-31')).toBeTrue();
    expect(occursOn(mes, '2026-05-30')).toBeFalse();

    const ano = reminder({ date: '2024-02-29', repeat: 'ano' });
    expect(occursOn(ano, '2025-02-28')).toBeTrue();
    expect(occursOn(ano, '2028-02-29')).toBeTrue();
    expect(occursOn(ano, '2028-02-28')).toBeFalse();
    expect(nextOccurrence(ano, '2025-03-01')).toBe('2026-02-28');
  });

  it('um dia tirado da série some só ele', () => {
    const r = reminder({ repeat: 'semana' });
    const sem = skipDay(r, '2026-10-25', '2026-10-19T00:00:00.000Z');
    expect(occursOn(sem, '2026-10-25')).toBeFalse();
    expect(occursOn(sem, '2026-11-01')).toBeTrue();
    expect(nextOccurrence(sem, '2026-10-19')).toBe('2026-11-01');
  });

  it('o que já passou sai do relógio: o dia de antes, e hoje o horário que já foi (o dia todo, só amanhã)', () => {
    const cafe = reminder({ time: '08:30' });
    const todo = reminder();
    expect(isPast(todo, '2026-10-17', '2026-10-18', '00:00')).toBeTrue();
    expect(isPast(todo, '2026-10-18', '2026-10-18', '23:59')).toBeFalse();
    expect(isPast(cafe, '2026-10-18', '2026-10-18', '08:29')).toBeFalse();
    expect(isPast(cafe, '2026-10-18', '2026-10-18', '08:30')).toBeFalse();
    expect(isPast(cafe, '2026-10-18', '2026-10-18', '08:31')).toBeTrue();
    expect(isPast(cafe, '2026-10-19', '2026-10-18', '23:59')).toBeFalse();
  });

  it('no dia, o dia todo primeiro, depois pelo horário e pelo nome', () => {
    const list = [
      reminder({ id: 'ra', title: 'Dentista', time: '14:00' }),
      reminder({ id: 'rb', title: 'Aniversário', repeat: 'ano', date: '2020-10-18' }),
      reminder({ id: 'rc', title: 'Café', time: '08:30' }),
      reminder({ id: 'rd', title: 'Amanhã', date: '2026-10-19' }),
    ];
    expect(remindersOn(list, '2026-10-18').map((r) => r.title)).toEqual(['Aniversário', 'Café', 'Dentista']);
  });

  it('vários dias: aparece em cada dia, do primeiro ao último, e passa só no fim', () => {
    const viagem = reminder({ id: 'rv', title: 'Viagem', date: '2026-10-20', end: '2026-10-22', time: '20:00', endTime: '10:00' });
    expect(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((d) => coversDay(viagem, d))).toEqual([false, true, true, true, false]);
    expect(segmentOn(viagem, '2026-10-21')).toEqual({ start: '2026-10-20', n: 2, total: 3, first: false, last: false });
    expect(['2026-10-20', '2026-10-21', '2026-10-22'].map((d) => spanLabel(viagem, d))).toEqual(['20h', 'continua', 'até 10h']);
    expect(timeOn(viagem, '2026-10-21')).toBeUndefined();
    // hoje só passa no último dia, depois da hora do fim
    expect(isPast(viagem, '2026-10-20', '2026-10-20', '23:00')).toBeFalse();
    expect(isPast(viagem, '2026-10-22', '2026-10-22', '09:59')).toBeFalse();
    expect(isPast(viagem, '2026-10-22', '2026-10-22', '10:01')).toBeTrue();
    expect(isPast(viagem, '2026-10-21', '2026-10-22', '00:00')).toBeTrue();
    // em cima no dia, como as faixas do Google
    const cafe = reminder({ id: 'rc', title: 'Café', date: '2026-10-21', time: '08:00' });
    const feira = reminder({ id: 'rf', title: 'Feira', date: '2026-10-21' });
    expect(remindersOn([cafe, feira, viagem], '2026-10-21').map((r) => r.title)).toEqual(['Viagem', 'Feira', 'Café']);
    expect(repeatSentence(undefined, '2026-10-20', { end: '2026-10-22' })).toBe('De 20 a 22 de outubro de 2026.');
    expect(rangeLabel('2026-10-30', '2026-11-02')).toBe('30 de out. a 2 de nov.');
  });

  it('vários dias que se repetem: cada vez passa pelos dias dela, e tirar uma vez tira os dias dela', () => {
    const fds = reminder({ id: 'rf', title: 'Sítio', date: '2026-10-24', end: '2026-10-25', repeat: 'semana' });
    expect(['2026-10-31', '2026-11-01', '2026-11-02'].map((d) => occurrenceStart(fds, d))).toEqual(['2026-10-31', '2026-10-31', null]);
    const sem = skipDay(fds, '2026-10-31', '2026-10-19T00:00:00.000Z');
    expect(coversDay(sem, '2026-11-01')).toBeFalse();
    expect(coversDay(sem, '2026-11-08')).toBeTrue();
    expect(repeatSentence('semana', fds.date, fds)).toBe('Todo sábado, a partir de 24 de outubro de 2026. Cada vez dura 2 dias.');
  });

  it('guarda as repetições do Google e converte a que antes só o Google mudava', () => {
    const r = sanitizeReminder(reminder({ date: '2026-10-19', repeat: 'semana', days: [1, 3], every: 2, count: 4, quiet: true }))!;
    expect(r).toEqual(jasmine.objectContaining({ count: 4, until: '2026-11-04', quiet: true }));
    // a vez do mês só no mês e no ano; o dia só de alguns meses só do 29 em diante
    expect(sanitizeReminder(reminder({ repeat: 'dia', nth: 3 }))!.nth).toBeUndefined();
    expect(sanitizeReminder(reminder({ repeat: 'mes', strict: true }))!.strict).toBeUndefined();
    // a repetição travada de antes: sem a trava e sem nada a mandar ao Google
    const antes = { ...reminder({ repeat: 'semana', every: 2, at: '2026-10-12T00:00:00.000Z' }), google: { id: 'abc12345', lock: 'repeticao', at: '2026-10-11T00:00:00.000Z' } };
    const depois = sanitizeReminder(antes)!;
    expect(depois.google).toEqual({ id: 'abc12345', at: '2026-10-12T00:00:00.000Z' });
    expect(sanitizeReminder(depois)).toEqual(depois);
  });

  it('diz como repete, por extenso e curto', () => {
    expect(repeatSentence(undefined, '2027-08-23')).toBe('Só em 23 de agosto de 2027.');
    expect(repeatSentence('semana', '2026-10-22')).toBe('Toda quinta-feira, a partir de 22 de outubro de 2026.');
    expect(repeatSentence('semana', '2026-10-24')).toBe('Todo sábado, a partir de 24 de outubro de 2026.');
    expect(repeatSentence('mes', '2026-01-31')).toBe('Todo dia 31 de cada mês (no último dia, nos meses mais curtos).');
    expect(repeatSentence('ano', '2026-03-14')).toBe('Todo ano, em 14 de março.');
    expect(repeatSentence('ano', '2024-02-29')).toContain('nos anos que não são bissextos');
    expect(repeatShort({ repeat: 'semana', date: '2026-10-22' })).toBe('toda quinta');
    expect(repeatShort({ repeat: 'mes', date: '2026-10-05' })).toBe('todo dia 5');
    expect(repeatShort({ date: '2026-10-05' })).toBe('');
  });
});

describe('Calendário: guardar e juntar', () => {
  it('limpa o que vem de fora e joga fora o que não serve', () => {
    expect(sanitizeReminder({ ...reminder(), title: '   ' })).toBeNull();
    expect(sanitizeReminder({ ...reminder(), date: '2026-02-30' })).toBeNull();
    expect(sanitizeReminder({ ...reminder(), id: '<script>' })).toBeNull();
    const r = sanitizeReminder({ ...reminder(), title: '  Bolo   de  fubá ', time: '25:00', repeat: 'hora', color: 'dourado', notes: ['ra', 'ra', 3, 'rb'], done: ['2026-10-18'], skip: ['2026-10-19'] })!;
    expect(r.title).toBe('Bolo de fubá');
    expect(r.time).toBeUndefined();
    expect(r.repeat).toBeUndefined();
    expect(r.color).toBe('amarelo');
    expect(r.notes).toEqual(['ra', 'rb']);
    // a marca de feito de antes não existe mais (o que passou sai riscado sozinho)
    expect('done' in r).toBeFalse();
    // sem repetir, não há dia tirado
    expect(r.skip).toEqual([]);
    expect(sanitizeCalendar('lixo')).toEqual({ reminders: [], removed: {} });
  });

  it('o mudado por último vence, o apagado não volta, e a junção é a mesma dos dois lados', () => {
    const velho = reminder({ id: 'ra', title: 'Velho', at: '2026-10-18T10:00:00.000Z' });
    const novo = reminder({ id: 'ra', title: 'Novo', at: '2026-10-18T11:00:00.000Z' });
    const outro = reminder({ id: 'rb', title: 'Outro', createdAt: '2026-10-17T00:00:00.000Z', at: '2026-10-17T00:00:00.000Z' });
    const here: CalendarState = { reminders: [velho, outro], removed: {} };
    const there: CalendarState = { reminders: [novo], removed: { rb: '2026-10-18T09:00:00.000Z' } };
    const ab = mergeCalendar(here, there);
    expect(ab.reminders.map((r) => r.title)).toEqual(['Novo']);
    expect(ab.removed).toEqual({ rb: '2026-10-18T09:00:00.000Z' });
    expect(mergeCalendar(there, here)).toEqual(ab);
    // mexido depois de apagado em outro aparelho: volta (a mudança é mais nova)
    const mexido = { ...outro, at: '2026-10-18T12:00:00.000Z' };
    expect(mergeCalendar({ reminders: [mexido], removed: {} }, there).reminders.map((r) => r.id).sort()).toEqual(['ra', 'rb']);
  });

  it('sem nada, não vai para a nuvem', () => {
    expect(calendarToSync({ reminders: [], removed: {} })).toBeNull();
    expect(calendarToSync({ reminders: [], removed: { ra: '2026-10-18T09:00:00.000Z' } })).not.toBeNull();
  });

  it('a cor sorteada nunca é a do último lembrete criado, nem o branco', () => {
    const list = [reminder({ color: 'verde', createdAt: '2026-10-19T00:00:00.000Z' }), reminder({ id: 'rb', color: 'rosa' })];
    for (let i = 0; i < 20; i++) {
      const c = drawColor(list, () => i / 20);
      expect(c).not.toBe('verde');
      expect(c).not.toBe('branco');
    }
  });
});
