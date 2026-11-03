import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Reminder, Repeat, addDays, addMonths, countEnd, isPast, nextOccurrence, occursOn, sanitizeReminder, segmentOn } from './calendar';
import { CalendarStore } from './calendar-store';
import { reminderOptions } from './reminder-links';

/** A revisão do Calendário (code-review alto): o riscado dos de vários dias, as procuras longas e o dia que anda. */

function reminder(over: Partial<Reminder> = {}): Reminder {
  return { id: 'rrevisao1', title: 'Lembrete', date: '2026-11-02', color: 'amarelo', notes: [], skip: [], createdAt: '2026-10-01T00:00:00.000Z', at: '2026-10-01T00:00:00.000Z', ...over };
}

/** A procura de antes, dia a dia, sem teto: o que a nova tem de achar igual. */
function bruteNext(r: Reminder, from: string, horizon: string): string | null {
  for (let day = from < r.date ? r.date : from; day <= horizon; day = addDays(day, 1)) {
    if (r.until && day > r.until) return null;
    if (occursOn(r, day)) return day;
  }
  return null;
}

function bruteCount(r: Reminder, count: number, horizon: string): string | null {
  const probe = { ...r, skip: [], until: undefined };
  let seen = 0;
  for (let day = r.date; day <= horizon; day = addDays(day, 1)) if (occursOn(probe, day) && ++seen === count) return day;
  return null;
}

/** Um sorteio que se repete (o mesmo em toda rodada). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('Calendário: revisão', () => {
  describe('o riscado de uma vez de vários dias', () => {
    it('"toda primeira segunda" de dois dias passa no último dia, quando a hora do fim já foi', () => {
      // primeira segunda de novembro (02/11) a terça (03/11), das 9h às 10h; a de dezembro é 07/12 a 08/12
      const r = reminder({ repeat: 'mes', nth: 1, end: '2026-11-03', time: '09:00', endTime: '10:00' });
      expect(segmentOn(r, '2026-12-08')?.last).toBeTrue();
      expect(isPast(r, '2026-12-08', '2026-12-08', '11:00')).toBeTrue();
      expect(isPast(r, '2026-12-08', '2026-12-08', '09:30')).toBeFalse();
      // o primeiro dia dela, hoje, não passa
      expect(isPast(r, '2026-12-07', '2026-12-07', '23:00')).toBeFalse();
    });

    it('a de "a cada 2 semanas" com a semana do domingo conta a semana do jeito dela', () => {
      // sábado e domingo, a cada 2 semanas, com a semana de domingo a sábado (o WKST=SU do Google): a
      // vez que começa no sábado 14/11 é da semana de 08/11 e vai até o domingo 15/11 (contada de segunda
      // a domingo, o 14/11 cairia na semana seguinte, que não é da vez)
      const r = reminder({ date: '2026-11-08', end: '2026-11-09', repeat: 'semana', every: 2, days: [0, 6], weekStart: 0, time: '20:00', endTime: '08:00' });
      const day = '2026-11-15';
      expect(segmentOn(r, day)?.last).toBeTrue();
      expect(isPast(r, day, day, '09:00')).toBeTrue();
      expect(isPast(r, day, day, '07:00')).toBeFalse();
    });
  });

  describe('a próxima vez e o "depois de N vezes", sem o teto de 40 anos', () => {
    it('"a cada 50 anos" ainda tem a próxima vez', () => {
      const r = reminder({ date: '2026-08-23', repeat: 'ano', every: 50 });
      expect(nextOccurrence(r, '2026-08-24')).toBe('2076-08-23');
    });

    it('o 29 de fevereiro só nos bissextos, a cada 25 anos, acha o próximo bissexto da vez', () => {
      // 2053, 2078 e 2103 não são bissextos; 2128 é
      const r = reminder({ date: '2028-02-29', repeat: 'ano', every: 25, strict: true });
      expect(nextOccurrence(r, '2028-03-01')).toBe('2128-02-29');
    });

    it('"todo mês, depois de 999 vezes" guarda o último dia (antes caía no "nunca")', () => {
      const r = reminder({ date: '2026-01-31', repeat: 'mes' });
      expect(countEnd(r, 999)).toBe(addMonths('2026-01-31', 998));
      const clean = sanitizeReminder({ ...r, count: 999 })!;
      expect(clean.count).toBe(999);
      expect(clean.until).toBe(addMonths('2026-01-31', 998));
    });

    it('"todo ano, depois de 100 vezes" acaba no centésimo aniversário', () => {
      expect(countEnd(reminder({ date: '2026-08-23', repeat: 'ano' }), 100)).toBe('2125-08-23');
    });

    it('sem repetir, só a primeira vez existe', () => {
      expect(countEnd(reminder(), 1)).toBe('2026-11-02');
      expect(countEnd(reminder(), 2)).toBeNull();
    });

    it('acha o mesmo que a procura dia a dia, em centenas de regras sorteadas', () => {
      const random = seeded(42);
      const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
      const repeats: Repeat[] = ['dia', 'semana', 'mes', 'ano'];
      for (let i = 0; i < 300; i++) {
        const date = addDays('2024-01-01', Math.floor(random() * 1500));
        const repeat = pick(repeats);
        const raw: Partial<Reminder> = { date, repeat };
        if (random() < 0.6) raw.every = 1 + Math.floor(random() * (repeat === 'ano' ? 3 : 5));
        if (repeat === 'semana' && random() < 0.6) raw.days = [...new Set([pick([0, 1, 2, 3, 4, 5, 6]), pick([0, 1, 2, 3, 4, 5, 6])])].sort();
        if (repeat === 'semana' && random() < 0.5) raw.weekStart = 0;
        if ((repeat === 'mes' || repeat === 'ano') && random() < 0.4) raw.nth = pick([1, 2, 3, 4, -1]);
        if ((repeat === 'mes' || repeat === 'ano') && random() < 0.4) raw.strict = true;
        if (random() < 0.3) raw.until = addDays(date, Math.floor(random() * 900));
        const r = sanitizeReminder({ ...reminder(), ...raw, skip: Array.from({ length: 6 }, () => addDays(date, Math.floor(random() * 400))) })!;
        const horizon = addDays(date, 366 * 9);
        for (const from of [date, addDays(date, Math.floor(random() * 800)), addDays(date, -10)]) {
          const want = bruteNext(r, from, horizon);
          const got = nextOccurrence(r, from);
          if (want) expect(got).withContext(JSON.stringify({ r, from })).toBe(want);
          else expect(got === null || got > horizon).withContext(JSON.stringify({ r, from, got })).toBeTrue();
        }
        const count = 1 + Math.floor(random() * 12);
        const want = bruteCount(r, count, horizon);
        if (want) expect(countEnd(r, count)).withContext(JSON.stringify({ r, count })).toBe(want);
      }
    });
  });

  it('o seletor de lembretes procura o dia que importa só dos que têm a busca no nome', () => {
    const list = [reminder({ id: 'rmercado1', title: 'Mercado' }), reminder({ id: 'rdentista', title: 'Dentista', repeat: 'ano' })];
    expect(reminderOptions(list, 'dent', '2026-11-03', '10:00').map((o) => o.id)).toEqual(['rdentista']);
    expect(reminderOptions(list, '', '2026-11-03', '10:00').map((o) => o.id)).toEqual(['rdentista', 'rmercado1']);
  });

  describe('o dia e a hora do CalendarStore', () => {
    beforeEach(() => {
      localStorage.clear();
      jasmine.clock().install();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    });
    afterEach(() => {
      TestBed.resetTestingModule();
      jasmine.clock().uninstall();
    });

    it('andam sozinhos, em qualquer página (sem o Calendário aberto): a meia-noite vira o dia', () => {
      jasmine.clock().mockDate(new Date(2026, 10, 3, 23, 59, 30));
      const calendar = TestBed.inject(CalendarStore);
      expect(calendar.today()).toBe('2026-11-03');
      expect(calendar.time()).toBe('23:59');
      jasmine.clock().tick(60_000);
      expect(calendar.today()).toBe('2026-11-04');
      expect(calendar.time()).toBe('00:00');
    });

    it('param quando o site sai (sem relógio sobrando)', () => {
      jasmine.clock().mockDate(new Date(2026, 10, 3, 10, 0, 0));
      const calendar = TestBed.inject(CalendarStore);
      const tick = spyOn(calendar, 'tick').and.callThrough();
      TestBed.resetTestingModule();
      jasmine.clock().tick(120_000);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(tick).not.toHaveBeenCalled();
    });
  });
});
