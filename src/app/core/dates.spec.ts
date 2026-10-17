import { DAY_MS, MONTHS_LONG, MONTHS_SHORT, daysAgoLabel, localDay, longDayFmt, parseDay, todayISO } from './dates';
import { localDay as localDayFromReview, parseDay as parseDayFromReview, todayISO as todayFromReview } from './review';

describe('dates', () => {
  it('o dia é o do fuso de quem usa, não o UTC', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayISO()).toBe(localDay(new Date()));
  });

  it('parseDay volta à meia-noite local do mesmo dia', () => {
    const d = parseDay('2026-03-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 1, 0]);
    expect(localDay(parseDay('2024-02-29'))).toBe('2024-02-29');
  });

  it('review.ts continua dando as mesmas funções', () => {
    expect(localDayFromReview).toBe(localDay);
    expect(parseDayFromReview).toBe(parseDay);
    expect(todayFromReview).toBe(todayISO);
  });

  it('os meses e o dia em milissegundos', () => {
    expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
    expect(MONTHS_SHORT.length).toBe(12);
    expect(MONTHS_SHORT[9]).toBe('out');
    expect(MONTHS_LONG[2]).toBe('março');
    expect(longDayFmt.format(parseDay('2024-03-15'))).toBe('15 de março de 2024');
  });

  it('daysAgoLabel', () => {
    expect(daysAgoLabel(0)).toBe('hoje');
    expect(daysAgoLabel(1)).toBe('ontem');
    expect(daysAgoLabel(5)).toBe('há 5 dias');
  });
});
