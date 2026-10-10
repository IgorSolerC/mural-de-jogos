import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TABLES } from './harness';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('as listas de tabelas', () => {
  // Uma tabela nova nas migrações precisa entrar na conferência do backup e na limpeza dos testes.
  const created = readdirSync(new URL('../migrations', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .flatMap((f) => [...read(`../migrations/${f}`).matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g)].map((m) => m[1]))
    .sort();

  it('o backup confere todas as tabelas das migrações', () => {
    const line = /^TABELAS=\(([^)]*)\)/m.exec(read('../scripts/backup.sh'));
    expect(line?.[1]?.split(/\s+/).filter(Boolean).sort()).toEqual(created);
  });

  it('os testes limpam todas as tabelas das migrações', () => {
    expect([...TABLES].sort()).toEqual(created);
  });
});
