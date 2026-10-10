import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Db, SqlValue } from '../ports';

/**
 * O banco em cima do SQLite embutido no Node (`node:sqlite`, sem dependência nativa). É a saída se a
 * Cloudflare deixar de servir: o `.sql` de `wrangler d1 export` entra direto num arquivo destes.
 */
export function sqliteDb(db: DatabaseSync): Db {
  const run = (sql: string) => db.prepare(sql);
  return {
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (run(sql).get(...params) as T | undefined) ?? null;
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return run(sql).all(...params) as T[];
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map((s) => ({ changes: Number(run(s.sql).run(...(s.params ?? [])).changes) }));
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

/**
 * Aplica as migrações de `dir` que ainda não rodaram, anotando na mesma tabela que o wrangler usa
 * (`d1_migrations`), para um banco exportado do D1 continuar sabendo onde parou.
 */
export function migrate(db: DatabaseSync, dir: string): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
  const done = new Set((db.prepare('SELECT name FROM d1_migrations').all() as { name: string }[]).map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(dir, name), 'utf8'));
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    applied.push(name);
  }
  return applied;
}
