import { Hono } from 'hono';
import { MIRROR_MAX_CHARS, MIRROR_ROWS_PER_DAY, TYPES_OF, mirrorAreas, readMirrorBody } from '../domain/mirror';
import { utcDay, write } from '../domain/quota';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { readJson, sessionOf } from './http';

/**
 * O espelho, pelo lado do site (PLANO-API.md, 8.3), só com a sessão: `GET /v1/eu/espelho` diz que
 * áreas alguma chave lê e as impressões do que já está lá; `POST /v1/eu/espelho` põe e tira itens, em
 * lotes, só se a rev do mural ainda é a que o site viu (um aparelho atrasado não escreve coisa velha).
 * A nuvem guarda o "o que já foi": o site não precisa de nada no navegador para isso.
 */
export function mirrorRoutes(app: Hono, deps: Deps): void {
  app.get('/v1/eu/espelho', async (c) => {
    const s = await sessionOf(deps, c);
    const areas = await mirrorAreas(deps, s.userId);
    const types = areas.flatMap((a) => TYPES_OF[a] ?? []);
    const state = await deps.db.first<{ rev: number }>('SELECT rev FROM api_espelho_estado WHERE usuario_id = ?', [s.userId]);
    const hashes: Record<string, Record<string, string>> = {};
    if (types.length) {
      const rows = await deps.db.all<{ tipo: string; id: string; hash: string }>(
        `SELECT tipo, id, hash FROM api_espelho WHERE usuario_id = ? AND tipo IN (${types.map(() => '?').join(', ')})`,
        [s.userId, ...types],
      );
      for (const t of types) hashes[t] = {};
      for (const r of rows) hashes[r.tipo]![r.id] = r.hash;
    }
    return c.json({ areas, rev: state?.rev ?? null, hashes });
  });

  app.post('/v1/eu/espelho', async (c) => {
    const s = await sessionOf(deps, c);
    const areas = await mirrorAreas(deps, s.userId);
    if (!areas.length) throw new HttpError(409, 'espelho-sem-chave', 'Nenhuma chave lê o mural: não há o que espelhar.');
    const { rev, fuso, rows, gone } = readMirrorBody(await readJson(c, MIRROR_MAX_CHARS), areas);
    const mural = await deps.db.first<{ rev: number }>('SELECT rev FROM murais WHERE usuario_id = ?', [s.userId]);
    if (mural?.rev !== rev) {
      throw new HttpError(409, 'espelho-atrasado', 'O mural mudou na nuvem depois desta cópia. O espelho fica para a próxima sincronização.');
    }
    const now = deps.now();
    const day = utcDay(now);
    const state = await deps.db.first<{ dia: string; linhas_dia: number }>('SELECT dia, linhas_dia FROM api_espelho_estado WHERE usuario_id = ?', [s.userId]);
    const used = state?.dia === day ? state.linhas_dia : 0;
    const cost = rows.length + gone.length;
    if (used + cost > MIRROR_ROWS_PER_DAY) {
      throw new HttpError(429, 'espelho-cota', 'O espelho desta conta já gravou o que podia hoje. O resto vai amanhã.');
    }
    // cada gravação confere a rev de novo, no mesmo lote: um envio do mural entre a conferência de cima
    // e esta gravação deixa o espelho como estava
    const same = 'EXISTS (SELECT 1 FROM murais WHERE usuario_id = ? AND rev = ?)';
    const statements: Statement[] = [
      ...rows.map(
        (r): Statement => ({
          sql: `INSERT OR REPLACE INTO api_espelho (usuario_id, tipo, id, versao, hash, grupo, data, busca, dados) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${same}`,
          params: [s.userId, r.tipo, r.id, r.versao, r.hash, r.grupo, r.data, r.busca, r.dados, s.userId, rev],
        }),
      ),
      ...gone.map(
        (g): Statement => ({ sql: `DELETE FROM api_espelho WHERE usuario_id = ? AND tipo = ? AND id = ? AND ${same}`, params: [s.userId, g.tipo, g.id, s.userId, rev] }),
      ),
      {
        sql:
          'INSERT INTO api_espelho_estado (usuario_id, rev, fuso, atualizado_em, dia, linhas_dia) VALUES (?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT (usuario_id) DO UPDATE SET rev = excluded.rev, fuso = COALESCE(excluded.fuso, api_espelho_estado.fuso), ' +
          'atualizado_em = excluded.atualizado_em, dia = excluded.dia, linhas_dia = excluded.linhas_dia',
        params: [s.userId, rev, fuso, now.toISOString(), day, used + cost],
      },
    ];
    await write(deps, statements, cost + 2);
    return c.json({ ok: true, postos: rows.length, tirados: gone.length });
  });
}
