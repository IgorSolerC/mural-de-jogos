import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TABLES } from './harness';

/**
 * O backup diário do banco do cofre (PLANO-COFRE.md, 16.3): o job "cofre" do .github/workflows/backup.yml
 * passa a lista de tabelas ao api/scripts/backup.sh, que recusa um backup sem alguma delas.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('o backup do cofre', () => {
  // Uma tabela nova nas migrações precisa entrar na conferência do backup e na limpeza dos testes.
  const created = readdirSync(new URL('../migrations', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .flatMap((f) => [...read(`../migrations/${f}`).matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g)].map((m) => m[1]))
    .sort();
  const workflow = read('../../.github/workflows/backup.yml');

  it('confere todas as tabelas das migrações', () => {
    const line = /^ {6}BACKUP_TABELAS: (.+)$/m.exec(workflow);
    expect(line?.[1]?.split(/\s+/).filter(Boolean).sort()).toEqual(created);
  });

  it('os testes limpam todas as tabelas das migrações', () => {
    expect([...TABLES].sort()).toEqual(created);
  });

  it('exporta o banco do cofre, só depois de ele ir ao ar', () => {
    const job = workflow.slice(workflow.indexOf('\n  cofre:'));
    expect(job).toContain("if: vars.COFRE_NO_AR == 'sim'");
    expect(job).toContain('wrangler d1 export cofre --remote');
    expect(job).toContain('backup.sh trancar');
  });

  it('a limpeza diária do cofre roda antes do backup', () => {
    const minutes = (cron: string) => {
      const [m, h] = cron.split(' ');
      return Number(h) * 60 + Number(m);
    };
    const cleanup = /^crons = \["([^"]+)"\]$/m.exec(read('../wrangler.toml'))?.[1];
    const backup = /^ {4}- cron: '([^']+)'$/m.exec(workflow)?.[1];
    expect(cleanup && backup).toBeTruthy();
    expect(minutes(cleanup!)).toBeLessThan(minutes(backup!));
  });
});
