import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

describe('a conferência do backup', () => {
  const script = fileURLToPath(new URL('../scripts/backup.sh', import.meta.url));
  const hasBash = spawnSync('bash', ['-c', 'true']).status === 0;
  const conferir = (sql: string, env: Record<string, string> = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'backup-'));
    try {
      writeFileSync(join(dir, 'mural.sql'), sql);
      return spawnSync('bash', [script, 'conferir', join(dir, 'mural.sql')], { env: { ...process.env, ...env }, encoding: 'utf8' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const tables = ['usuarios', 'murais'].map((t) => `CREATE TABLE "${t}" (id);`).join('\n');
  const env = { BACKUP_TABELAS: 'usuarios murais', BACKUP_COM_DADOS: 'usuarios' };

  it.skipIf(!hasBash)('recusa o banco sem nenhum usuário (esvaziado, ou a exportação cortada depois das tabelas)', () => {
    expect(conferir(`${tables}\nINSERT INTO "murais" ("id") VALUES(1);\n`, env).status).toBe(1);
    expect(conferir(`${tables}\nINSERT INTO "usuarios" ("id") VALUES(1);\n`, env).status).toBe(0);
    expect(conferir(`${tables}\nINSERT INTO usuarios VALUES(1);\n`, env).status).toBe(0);
    // a tabela de nome parecido não conta
    expect(conferir(`${tables}\nINSERT INTO "usuarios_velhos" ("id") VALUES(1);\n`, env).stderr).toContain('nenhuma linha na tabela usuarios');
  });

  it.skipIf(!hasBash)('o mural exige usuarios por padrão; com a lista do cofre, nenhuma linha é exigida', () => {
    expect(conferir('CREATE TABLE "usuarios" (id);\n').stderr).toContain('não tem a tabela');
    expect(conferir(tables, { BACKUP_TABELAS: 'usuarios murais' }).status).toBe(0);
  });

  it('o workflow faz o checkout sem deixar o token para o npm ci', () => {
    const workflow = read('../../.github/workflows/backup.yml');
    const checkouts = workflow.split('uses: actions/checkout@').slice(1);
    expect(checkouts.length).toBe(2);
    for (const c of checkouts) expect(c.slice(0, 300)).toMatch(/with:\s*\n(?:\s*#[^\n]*\n)*\s*persist-credentials: false/);
  });
});
