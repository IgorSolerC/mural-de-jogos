import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { write } from '../src/domain/quota';
import { Config, Db, Deps } from '../src/ports';

/**
 * A mesma suíte roda em dois bancos: o D1 (simulado pelo Miniflare, `workers.test.ts`) e o SQLite do
 * Node (`node.test.ts`). Se algo só funcionar num deles, a outra rodada quebra.
 */
export const BASE_ENV = {
  MODO: 'ligado',
  ORIGENS: 'https://igorsolerc.github.io,http://localhost:4200',
  COTA_LINHAS_DIA: '1000',
  GOOGLE_CLIENT_ID: 'teste.apps.googleusercontent.com',
};

const TABLES = ['usuarios', 'sessoes', 'murais', 'murais_publicos', 'seguindo', 'atividades', 'uso_diario'];
const NOW = new Date('2026-10-06T15:00:00Z');

export function apiSuite(label: string, getDb: () => Db) {
  async function setup(env: Record<string, string> = {}, now = NOW) {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig({ ...BASE_ENV, ...env });
    const deps: Deps = { db, config, now: () => now };
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    return { db, deps, app, call };
  }

  describe(`API (${label})`, () => {
    it('cria todas as tabelas da migração', async () => {
      const db = getDb();
      const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
      const names = rows.map((r) => r.name);
      for (const t of TABLES) expect(names).toContain(t);
    });

    it('o /v1/status responde com o modo e o uso do dia', async () => {
      const { call } = await setup();
      const res = await call('/v1/status');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        versao: 1,
        modo: 'ligado',
        dia: '2026-10-06',
        gravacoes: 0,
        linhasGravadas: 0,
        cotaLinhas: 1000,
      });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('endereço desconhecido responde 404 no formato de erro', async () => {
      const { call } = await setup();
      const res = await call('/v1/nada');
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ erro: 'nao-encontrado' });
    });

    describe('interruptor (MODO)', () => {
      it('desligado: só o /v1/status responde', async () => {
        const { call } = await setup({ MODO: 'desligado' });
        expect((await call('/v1/status')).status).toBe(200);
        const res = await call('/v1/nada');
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ erro: 'nuvem-desligada' });
      });

      it('só leitura: GET passa, gravação é recusada', async () => {
        const { call } = await setup({ MODO: 'so-leitura' });
        expect((await call('/v1/nada')).status).toBe(404);
        const res = await call('/v1/nada', { method: 'POST' });
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ erro: 'nuvem-so-leitura' });
      });

      it('valor desconhecido (erro de digitação) desliga', async () => {
        const { call } = await setup({ MODO: 'Ligado ' });
        const status = await (await call('/v1/status')).json();
        expect(status).toMatchObject({ modo: 'desligado' });
        expect((await call('/v1/nada')).status).toBe(503);
      });
    });

    describe('CORS', () => {
      it('libera só as origens configuradas', async () => {
        const { call } = await setup();
        const ok = await call('/v1/status', { headers: { Origin: 'https://igorsolerc.github.io' } });
        expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://igorsolerc.github.io');
        const other = await call('/v1/status', { headers: { Origin: 'https://outro.site' } });
        expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
      });

      it('a pré-consulta (OPTIONS) libera os cabeçalhos da sincronização e fica guardada', async () => {
        const { call } = await setup();
        const res = await call('/v1/eu/mural', {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://localhost:4200',
            'Access-Control-Request-Method': 'PUT',
            'Access-Control-Request-Headers': 'authorization,if-match',
          },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4200');
        expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('if-match');
        expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
      });

      it('erros também levam o CORS (o site consegue ler a mensagem)', async () => {
        const { call } = await setup({ MODO: 'desligado' });
        const res = await call('/v1/nada', { headers: { Origin: 'https://igorsolerc.github.io' } });
        expect(res.status).toBe(503);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://igorsolerc.github.io');
      });
    });

    describe('cota de gravações', () => {
      const insert = (codigo: string) => ({
        sql: 'INSERT INTO usuarios (id, google_sub, codigo, nome, criado_em) VALUES (?, ?, ?, ?, ?)',
        params: [`id-${codigo}`, `sub-${codigo}`, codigo, 'Teste', NOW.toISOString()],
      });

      it('grava e anota o uso no mesmo lote', async () => {
        const { deps, db, call } = await setup();
        const [result] = await write(deps, [insert('AAAA1111')], 3);
        expect(result!.changes).toBe(1);
        expect(await db.first('SELECT codigo FROM usuarios')).toEqual({ codigo: 'AAAA1111' });
        expect(await (await call('/v1/status')).json()).toMatchObject({ gravacoes: 1, linhasGravadas: 4 });
      });

      it('passou da cota: recusa com 503 cota-diaria e não grava nada', async () => {
        const { deps, db } = await setup({ COTA_LINHAS_DIA: '10' });
        await write(deps, [insert('AAAA1111')], 5); // usa 6
        await expect(write(deps, [insert('BBBB2222')], 5)).rejects.toMatchObject({ status: 503, code: 'cota-diaria' });
        expect(await db.all('SELECT codigo FROM usuarios')).toHaveLength(1);
        expect(await db.first('SELECT linhas_gravadas FROM uso_diario')).toEqual({ linhas_gravadas: 6 });
      });

      it('a cota recomeça no dia UTC seguinte', async () => {
        const { db } = await setup({ COTA_LINHAS_DIA: '10' });
        const config = readConfig({ ...BASE_ENV, COTA_LINHAS_DIA: '10' });
        await write({ db, config, now: () => new Date('2026-10-06T23:59:00Z') }, [insert('AAAA1111')], 8);
        await write({ db, config, now: () => new Date('2026-10-07T00:01:00Z') }, [insert('BBBB2222')], 8);
        expect(await db.all('SELECT dia FROM uso_diario ORDER BY dia')).toEqual([{ dia: '2026-10-06' }, { dia: '2026-10-07' }]);
      });

      it('cota inválida ou ausente bloqueia toda gravação', async () => {
        const { deps } = await setup({ COTA_LINHAS_DIA: 'muito' });
        await expect(write(deps, [insert('AAAA1111')], 1)).rejects.toMatchObject({ code: 'cota-diaria' });
      });

      it('com a nuvem em só leitura ou desligada, não grava', async () => {
        for (const MODO of ['so-leitura', 'desligado']) {
          const { deps, db } = await setup({ MODO });
          await expect(write(deps, [insert('AAAA1111')], 1)).rejects.toMatchObject({ status: 503 });
          expect(await db.all('SELECT * FROM usuarios')).toHaveLength(0);
          expect(await db.all('SELECT * FROM uso_diario')).toHaveLength(0);
        }
      });

      it('um erro no meio do lote desfaz tudo, inclusive a anotação do uso', async () => {
        const { deps, db } = await setup();
        await expect(write(deps, [insert('AAAA1111'), insert('AAAA1111')], 2)).rejects.toThrow();
        expect(await db.all('SELECT * FROM usuarios')).toHaveLength(0);
        expect(await db.all('SELECT * FROM uso_diario')).toHaveLength(0);
      });
    });

    describe('limpeza diária', () => {
      it('apaga sessões vencidas, atividades de mais de 90 dias e uso de mais de 30 dias', async () => {
        const { deps, db } = await setup();
        await db.batch([
          { sql: "INSERT INTO sessoes VALUES ('velha', 'u', '2026-01-01', '2026-01-01', '2026-10-01T00:00:00Z', NULL)" },
          { sql: "INSERT INTO sessoes VALUES ('nova', 'u', '2026-10-01', '2026-10-01', '2026-12-30T00:00:00Z', NULL)" },
          { sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', 'a', 'b', '2026-06-01T00:00:00Z')" },
          { sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', 'a', 'c', '2026-09-01T00:00:00Z')" },
          { sql: "INSERT INTO uso_diario VALUES ('2026-08-01', 5, 1)" },
          { sql: "INSERT INTO uso_diario VALUES ('2026-10-01', 5, 1)" },
        ]);
        await cleanup(deps);
        expect(await db.all('SELECT hash FROM sessoes')).toEqual([{ hash: 'nova' }]);
        expect(await db.all('SELECT alvo_id FROM atividades')).toEqual([{ alvo_id: 'c' }]);
        expect(await db.all('SELECT dia FROM uso_diario')).toEqual([{ dia: '2026-10-01' }]);
      });

      it('não roda com a nuvem desligada', async () => {
        const { deps, db } = await setup({ MODO: 'desligado' });
        await db.batch([{ sql: "INSERT INTO uso_diario VALUES ('2026-01-01', 5, 1)" }]);
        await cleanup(deps);
        expect(await db.all('SELECT dia FROM uso_diario')).toHaveLength(1);
      });
    });

    describe('índices únicos das atividades', () => {
      it('seguir de novo não cria outra notificação; a mesma resenha também não', async () => {
        const { db } = await setup();
        const follow = { sql: "INSERT OR IGNORE INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', 'a', 'b', '2026-10-06')" };
        const review = { sql: "INSERT OR IGNORE INTO atividades (tipo, autor_id, ref, criado_em) VALUES ('resenha', 'a', 'r1', '2026-10-06')" };
        await db.batch([follow, follow, review, review]);
        expect(await db.all('SELECT tipo FROM atividades ORDER BY tipo')).toEqual([{ tipo: 'resenha' }, { tipo: 'seguiu' }]);
      });
    });
  });
}
