import { describe, expect, it } from 'vitest';
import { FREE, evaluate, parseStatus, usageFrom, utcDay } from '../scripts/saude';

const status = { modo: 'ligado', dia: '2026-10-06', linhasGravadas: 1200, cotaLinhas: 60000 };
const day = (over: Partial<{ workerRequests: number; workerErrors: number; d1RowsRead: number; d1RowsWritten: number }> = {}) => ({
  day: '2026-10-05',
  workerRequests: 3000,
  workerErrors: 0,
  d1RowsRead: 40000,
  d1RowsWritten: 900,
  ...over,
});

describe('checagem diária', () => {
  it('tudo dentro do gratuito: sem problemas', () => {
    const r = evaluate(status, null, { days: [day()], d1DatabaseBytes: 3 * 1024 * 1024 }, null);
    expect(r.problems).toEqual([]);
    expect(r.lines.length).toBeGreaterThan(3);
  });

  it('API fora do ar falha', () => {
    expect(evaluate(null, 'HTTP 503', null, null).problems[0]).toContain('HTTP 503');
  });

  it('70% de qualquer limite falha', () => {
    expect(evaluate({ ...status, linhasGravadas: 42000 }, null, null, null).problems).toHaveLength(1);
    expect(evaluate(status, null, { days: [day({ workerRequests: FREE.workerRequests * 0.7 })], d1DatabaseBytes: null }, null).problems).toHaveLength(1);
    expect(evaluate(status, null, { days: [day({ d1RowsRead: 3_600_000 })], d1DatabaseBytes: null }, null).problems).toHaveLength(1);
    expect(evaluate(status, null, { days: [day({ d1RowsWritten: 70_000 })], d1DatabaseBytes: null }, null).problems).toHaveLength(1);
    expect(evaluate(status, null, { days: [day()], d1DatabaseBytes: 360 * 1024 * 1024 }, null).problems).toHaveLength(1);
  });

  it('muitos erros no Worker falham; poucos, não', () => {
    expect(evaluate(status, null, { days: [day({ workerErrors: 400 })], d1DatabaseBytes: null }, null).problems).toHaveLength(1);
    expect(evaluate(status, null, { days: [day({ workerRequests: 30, workerErrors: 5 })], d1DatabaseBytes: null }, null).problems).toEqual([]);
  });

  it('nuvem desligada de propósito e sem token só anotam', () => {
    const r = evaluate({ ...status, modo: 'desligado' }, null, null, null);
    expect(r.problems).toEqual([]);
    expect(r.notes).toHaveLength(2);
  });

  it('erro ao ler a Cloudflare falha (um token vencido precisa aparecer)', () => {
    expect(evaluate(status, null, null, 'not authorized').problems[0]).toContain('not authorized');
  });

  it('lê o status da API e recusa o que não é', () => {
    expect(parseStatus({ versao: 1, ...status })).toEqual(status);
    expect(parseStatus({ modo: 'ligado' })).toBeNull();
    expect(parseStatus('ok')).toBeNull();
  });

  it('junta os grupos da Cloudflare por dia', () => {
    const u = usageFrom(
      {
        workers: [
          { sum: { requests: 10, errors: 1 }, dimensions: { datetime: '2026-10-05T10:00:00Z' } },
          { sum: { requests: 5, errors: 0 }, dimensions: { datetime: '2026-10-05T23:59:00Z' } },
          { sum: { requests: 7, errors: 0 }, dimensions: { datetime: '2026-10-06T01:00:00Z' } },
        ],
        d1: [{ sum: { rowsRead: 100, rowsWritten: 4 }, dimensions: { date: '2026-10-06' } }],
        storage: [{ max: { databaseSizeBytes: 12345 } }],
      },
      ['2026-10-05', '2026-10-06'],
    );
    expect(u.days).toEqual([
      { day: '2026-10-05', workerRequests: 15, workerErrors: 1, d1RowsRead: 0, d1RowsWritten: 0 },
      { day: '2026-10-06', workerRequests: 7, workerErrors: 0, d1RowsRead: 100, d1RowsWritten: 4 },
    ]);
    expect(u.d1DatabaseBytes).toBe(12345);
  });

  it('dia UTC', () => {
    const now = new Date('2026-10-06T01:30:00Z');
    expect(utcDay(now)).toBe('2026-10-06');
    expect(utcDay(now, 1)).toBe('2026-10-05');
  });
});
