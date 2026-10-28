import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FREE, QUERY_DB_ONLY, databaseIdOf, evaluate, parseStatus, sumUsage, usageFrom, utcDay, type Status } from '../scripts/saude';

const status = { modo: 'ligado', dia: '2026-10-06', linhasGravadas: 1200, cotaLinhas: 60000 };
const day = (over: Partial<{ workerRequests: number; workerErrors: number; d1RowsRead: number; d1RowsWritten: number }> = {}) => ({
  day: '2026-10-05',
  workerRequests: 3000,
  workerErrors: 0,
  d1RowsRead: 40000,
  d1RowsWritten: 900,
  ...over,
});
const murall = (s: Status | null, error: string | null = null) => [{ name: 'do Murall', status: s, error }];
const usage = (days: ReturnType<typeof day>[], bytes: number | null) => ({ days, databases: [{ name: 'mural', bytes }] });

describe('checagem diária', () => {
  it('tudo dentro do gratuito: sem problemas', () => {
    const r = evaluate(murall(status, null), usage([day()], 3 * 1024 * 1024), null);
    expect(r.problems).toEqual([]);
    expect(r.lines.length).toBeGreaterThan(3);
  });

  it('API fora do ar falha', () => {
    expect(evaluate(murall(null, 'HTTP 503'), null, null).problems[0]).toContain('HTTP 503');
  });

  it('70% de qualquer limite falha', () => {
    expect(evaluate(murall({ ...status, linhasGravadas: 42000 }, null), null, null).problems).toHaveLength(1);
    expect(evaluate(murall(status, null), usage([day({ workerRequests: FREE.workerRequests * 0.7 })], null), null).problems).toHaveLength(1);
    expect(evaluate(murall(status, null), usage([day({ d1RowsRead: 3_600_000 })], null), null).problems).toHaveLength(1);
    expect(evaluate(murall(status, null), usage([day({ d1RowsWritten: 70_000 })], null), null).problems).toHaveLength(1);
    expect(evaluate(murall(status, null), usage([day()], 360 * 1024 * 1024), null).problems).toHaveLength(1);
  });

  it('muitos erros no Worker falham; poucos, não', () => {
    expect(evaluate(murall(status, null), usage([day({ workerErrors: 400 })], null), null).problems).toHaveLength(1);
    expect(evaluate(murall(status, null), usage([day({ workerRequests: 30, workerErrors: 5 })], null), null).problems).toEqual([]);
  });

  it('nuvem desligada de propósito e sem token só anotam', () => {
    const r = evaluate(murall({ ...status, modo: 'desligado' }, null), null, null);
    expect(r.problems).toEqual([]);
    expect(r.notes).toHaveLength(2);
  });

  it('erro ao ler a Cloudflare falha (um token vencido precisa aparecer)', () => {
    expect(evaluate(murall(status, null), null, 'not authorized').problems[0]).toContain('not authorized');
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
      'mural',
    );
    expect(u.days).toEqual([
      { day: '2026-10-05', workerRequests: 15, workerErrors: 1, d1RowsRead: 0, d1RowsWritten: 0 },
      { day: '2026-10-06', workerRequests: 7, workerErrors: 0, d1RowsRead: 100, d1RowsWritten: 4 },
    ]);
    expect(u.databases).toEqual([{ name: 'mural', bytes: 12345 }]);
  });

  it('o cofre entra no mesmo relatório: fora do ar falha, desligado só anota', () => {
    const cofre = { modo: 'ligado', dia: '2026-10-06', linhasGravadas: 30, cotaLinhas: 20000 };
    const ok = evaluate([...murall(status), { name: 'do cofre', status: cofre, error: null }], null, null);
    expect(ok.problems).toEqual([]);
    expect(ok.lines.some((l) => l.includes('API do cofre'))).toBe(true);
    const fora = evaluate([...murall(status), { name: 'do cofre', status: null, error: 'HTTP 522' }], null, null);
    expect(fora.problems).toEqual(['A API do cofre não respondeu direito: HTTP 522.']);
    const desligado = evaluate([...murall(status), { name: 'do cofre', status: { ...cofre, modo: 'desligado' }, error: null }], null, null);
    expect(desligado.problems).toEqual([]);
    expect(desligado.notes).toContain('A API do cofre está em modo "desligado".');
  });

  it('os limites de pedidos e linhas são da conta: o Murall e o cofre somam', () => {
    // 40% em cada um não avisa sozinho, mas 80% na conta avisa
    const half = (over: Parameters<typeof day>[0]) => usage([day(over)], null);
    const sum = sumUsage([
      half({ workerRequests: 40_000, d1RowsWritten: 40_000 }),
      { ...half({ workerRequests: 40_000, d1RowsWritten: 40_000 }), databases: [{ name: 'cofre', bytes: null }] },
    ]);
    expect(sum.days).toEqual([{ day: '2026-10-05', workerRequests: 80_000, workerErrors: 0, d1RowsRead: 80_000, d1RowsWritten: 80_000 }]);
    expect(evaluate(murall(status), half({ workerRequests: 40_000, d1RowsWritten: 40_000 }), null).problems).toEqual([]);
    expect(evaluate(murall(status), sum, null).problems).toHaveLength(2);
  });

  it('o tamanho é por banco', () => {
    const sum = sumUsage([usage([day()], 300 * 1024 * 1024), { days: [day()], databases: [{ name: 'cofre', bytes: 300 * 1024 * 1024 }] }]);
    expect(sum.databases.map((d) => d.name)).toEqual(['mural', 'cofre']);
    expect(evaluate(murall(status), sum, null).problems).toEqual([]);
    const big = sumUsage([usage([day()], 1024), { days: [day()], databases: [{ name: 'cofre', bytes: 360 * 1024 * 1024 }] }]);
    expect(evaluate(murall(status), big, null).problems).toEqual(['O banco cofre já tem 360,0 MB, 72,0% do gratuito.']);
  });

  it('o id do D1 do cofre vem do wrangler.toml, e o de mentira não vale', () => {
    expect(databaseIdOf('database_name = "cofre"\ndatabase_id = "00000000-0000-0000-0000-000000000000"\n')).toBeNull();
    expect(databaseIdOf('database_id = "c2c789d6-f0f3-4f37-b53a-f049aa02a530"\n')).toBe('c2c789d6-f0f3-4f37-b53a-f049aa02a530');
    expect(databaseIdOf('# nada aqui\n')).toBeNull();
    // o wrangler.toml de verdade tem a linha no formato que databaseIdOf lê (com o id real ou o de mentira)
    expect(readFileSync(new URL('../../cofre-api/wrangler.toml', import.meta.url), 'utf8')).toMatch(/^database_id = "[0-9a-f-]{36}"$/m);
  });

  it('as imagens: quanto guardam, quanto falta, e o aviso a 70% da cota própria', () => {
    const img = (bytes: number, cota = 400 * 1024 * 1024) => ({ ...status, imagens: { imagens: 12, bytes, cota } });
    const ok = evaluate(murall(img(100 * 1024 * 1024)), null, null);
    expect(ok.problems).toEqual([]);
    expect(ok.lines).toContain('| Imagens guardadas do Murall (12) | 100,0 MB de 400,0 MB, faltam 300,0 MB | 25,0% |');
    expect(evaluate(murall(img(280 * 1024 * 1024)), null, null).problems).toEqual(['As imagens do Murall já ocupam 280,0 MB, 70,0% da cota própria (400,0 MB).']);
    expect(evaluate(murall(img(0, 0)), null, null).notes).toContain('A cota das imagens do Murall está zerada: nenhuma imagem é aceita.');
    // o status de uma API de antes (sem as imagens) continua valendo
    expect(parseStatus({ ...status, imagens: { imagens: 1, bytes: 2, cota: 3, livre: 1 } })).toEqual({ ...status, imagens: { imagens: 1, bytes: 2, cota: 3 } });
    expect(parseStatus({ ...status, imagens: 'x' })).toEqual(status);
  });

  it('o banco das imagens entra só com o tamanho e as linhas: os pedidos do Worker não contam duas vezes', () => {
    expect(QUERY_DB_ONLY).not.toContain('workers');
    expect(QUERY_DB_ONLY).not.toContain('$script');
    expect(QUERY_DB_ONLY).not.toContain('$fromTime');
    expect(QUERY_DB_ONLY).toContain('d1AnalyticsAdaptiveGroups');
    expect(QUERY_DB_ONLY).toContain('d1StorageAdaptiveGroups');
    const u = usageFrom({ d1: [{ sum: { rowsRead: 9, rowsWritten: 3 }, dimensions: { date: '2026-10-06' } }], storage: [{ max: { databaseSizeBytes: 999 } }] }, ['2026-10-06'], 'mural-imagens');
    expect(u.days[0]).toMatchObject({ workerRequests: 0, d1RowsWritten: 3 });
    // o 70% do banco das imagens avisa como o de qualquer banco
    const big = sumUsage([usage([day()], 1024), { days: [day()], databases: [{ name: 'mural-imagens', bytes: 351 * 1024 * 1024 }] }]);
    expect(evaluate(murall(status), big, null).problems).toEqual(['O banco mural-imagens já tem 351,0 MB, 70,2% do gratuito.']);
  });

  it('o id do banco das imagens vem do wrangler.toml da API, pelo nome', () => {
    const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    expect(databaseIdOf(toml, 'mural')).toBe('c2c789d6-f0f3-4f37-b53a-f049aa02a530');
    expect(databaseIdOf(toml, 'mural-imagens')).toMatch(/^[0-9a-f-]{36}$/);
    expect(databaseIdOf(toml, 'mural-imagens')).not.toBe(databaseIdOf(toml, 'mural'));
    expect(databaseIdOf(toml, 'nao-existe')).toBeNull();
  });

  it('dia UTC', () => {
    const now = new Date('2026-10-06T01:30:00Z');
    expect(utcDay(now)).toBe('2026-10-06');
    expect(utcDay(now, 1)).toBe('2026-10-05');
  });
});
