import { Db, SqlValue } from '../ports';

/** O banco em cima do D1 da Cloudflare. Junto com `src/entry/worker.ts`, é o único lugar que conhece o D1. */
export function d1Db(d1: D1Database): Db {
  // o D1 guarda BLOB a partir de ArrayBuffer
  const bind = (v: SqlValue) => (v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v);
  const prepare = (sql: string, params: SqlValue[] = []) => d1.prepare(sql).bind(...params.map(bind));
  return {
    async first<T>(sql: string, params?: SqlValue[]) {
      return (await prepare(sql, params).first<T>()) ?? null;
    },
    async all<T>(sql: string, params?: SqlValue[]) {
      return (await prepare(sql, params).all<T>()).results;
    },
    async batch(statements) {
      if (statements.length === 0) return [];
      const results = await d1.batch(statements.map((s) => prepare(s.sql, s.params)));
      return results.map((r) => ({
        changes: r.meta.changes ?? 0,
        rowsRead: r.meta.rows_read ?? 0,
        rowsWritten: r.meta.rows_written ?? 0,
      }));
    },
  };
}
