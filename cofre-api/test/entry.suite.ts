import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashToken } from '../src/domain/session';
import type { Db } from '../src/ports';
import { BASE_ENV, DONO, VERIFIER, jsonCaller } from './harness';
import type { Setup } from './suite';

/** O login com o Google (`POST /api/entrar`) e o `GET /api/cofre`. */
export function entrySuite(label: string, setup: Setup) {
  const entrar = (codigo: string, extra: Record<string, unknown> = {}) => ({ codigo, verificador: VERIFIER, aparelho: 'Chrome no Windows', ...extra });

  describe(`Entrar com o Google (${label})`, () => {
    it('entra com o código do Google e devolve uma sessão de entrada (sem cofre ainda, de 20 minutos)', async () => {
      const { db, call, google } = await setup();
      const res = await call('POST', '/api/entrar', entrar('codigo-sub-dono'), { ip: '203.0.113.5' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string; expiraEm: string; usuario: string; codigo: string };
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(body.expiraEm).toBe('2026-10-21T15:20:00.000Z');
      // o id da conta (vai no AAD do que a página sela) e o código do Murall
      expect(body.usuario).toBe(DONO.id);
      expect(body.codigo).toBe(DONO.code);
      // ao Google vai o código, o verificador do PKCE e o endereço de volta do próprio cofre
      expect(Object.fromEntries(google.requests[0]!)).toEqual({
        grant_type: 'authorization_code',
        code: 'codigo-sub-dono',
        code_verifier: VERIFIER,
        client_id: BASE_ENV.GOOGLE_CLIENT_ID,
        client_secret: BASE_ENV.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'https://cofre.teste.dev/entrar',
      });
      // no banco, só o hash do token
      const sessao = await db.first<{ hash: string; usuario_id: string; tipo: string; aparelho: string }>('SELECT hash, usuario_id, tipo, aparelho FROM cofre_sessoes');
      expect(sessao).toEqual({ hash: await hashToken(body.token), usuario_id: DONO.id, tipo: 'entrada', aparelho: 'Chrome no Windows' });
    });

    it('com a sessão de entrada, o GET /api/cofre diz que ainda não há cofre', async () => {
      const { call } = await setup();
      const { token } = (await (await call('POST', '/api/entrar', entrar('codigo-sub-dono'))).json()) as { token: string };
      const res = await call('GET', '/api/cofre', undefined, { token });
      expect(await res.json()).toEqual({ existe: false, congeladoAte: null, aparelhos: 0 });
    });

    it('sem cofre, a sessão de entrada acaba em 20 minutos (o tempo de criar)', async () => {
      const { call, advance } = await setup();
      const { token } = (await (await call('POST', '/api/entrar', entrar('codigo-sub-dono'))).json()) as { token: string };
      advance(20 * 60_000 - 1);
      expect((await call('GET', '/api/cofre', undefined, { token })).status).toBe(200);
      advance(1);
      expect(await (await call('GET', '/api/cofre', undefined, { token })).json()).toMatchObject({ erro: 'sessao-invalida' });
    });

    it('sem sessão, com token inventado ou malformado: 401', async () => {
      const { call } = await setup();
      for (const token of [undefined, 'a'.repeat(43), 'curto', 'a'.repeat(42) + '!']) {
        const res = await call('GET', '/api/cofre', undefined, { token });
        expect(res.status).toBe(401);
      }
    });

    it('quem não tem Murall não entra', async () => {
      const { db, call } = await setup();
      const res = await call('POST', '/api/entrar', entrar('codigo-sub-desconhecido'));
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ erro: 'sem-conta-murall' });
      expect(await db.first('SELECT * FROM cofre_sessoes')).toBeNull();
    });

    it('só as contas de COFRE_CODIGOS entram; vazio, ninguém; "*", todo mundo', async () => {
      const lista = await setup();
      expect(await (await lista.call('POST', '/api/entrar', entrar('codigo-sub-outra'))).json()).toMatchObject({ erro: 'cofre-fechado' });
      const ninguem = await setup({ COFRE_CODIGOS: '' });
      expect(await (await ninguem.call('POST', '/api/entrar', entrar('codigo-sub-dono'))).json()).toMatchObject({ erro: 'cofre-fechado' });
      const todos = await setup({ COFRE_CODIGOS: '*' });
      expect((await todos.call('POST', '/api/entrar', entrar('codigo-sub-outra'))).status).toBe(200);
    });

    it('código recusado pelo Google, token de outro cliente, assinado por outra chave ou vencido: 401', async () => {
      const { call, google } = await setup();
      expect(await (await call('POST', '/api/entrar', entrar('codigo-ruim'))).json()).toMatchObject({ erro: 'login-invalido' });
      google.tamper({ aud: 'outro.apps.googleusercontent.com' });
      expect((await call('POST', '/api/entrar', entrar('codigo-sub-dono'))).status).toBe(401);
      google.tamper({ key: google.otherKey });
      expect((await call('POST', '/api/entrar', entrar('codigo-sub-dono'))).status).toBe(401);
      google.tamper({ expiresIn: '-1h' });
      expect((await call('POST', '/api/entrar', entrar('codigo-sub-dono'))).status).toBe(401);
    });

    it('sem o código, sem o verificador do PKCE ou com eles fora do formato: 400, sem falar com o Google', async () => {
      const { call, google } = await setup();
      for (const body of [{}, { codigo: 'codigo-sub-dono' }, entrar('codigo-sub-dono', { verificador: 'curto' }), entrar('x'), entrar('codigo com espaço')]) {
        expect(await (await call('POST', '/api/entrar', body)).json()).toMatchObject({ erro: 'login-incompleto' });
      }
      expect(google.requests).toEqual([]);
    });

    it('corpo que não é objeto JSON: 400', async () => {
      const { call } = await setup();
      for (const body of [[1], 'texto', null]) expect((await call('POST', '/api/entrar', body)).status).toBe(400);
    });

    it('sem o client secret ou sem a pimenta, o login fica indisponível (nunca um valor padrão)', async () => {
      const semSegredo = await setup({ GOOGLE_CLIENT_SECRET: '' });
      expect(await (await semSegredo.call('POST', '/api/entrar', entrar('codigo-sub-dono'))).json()).toMatchObject({ erro: 'login-indisponivel' });
      const semPimenta = await setup({ COFRE_PIMENTA_1: '' });
      expect(await (await semPimenta.call('POST', '/api/entrar', entrar('codigo-sub-dono'))).json()).toMatchObject({ erro: 'cofre-sem-segredo' });
      const pimentaCurta = await setup({ COFRE_PIMENTA_1: 'AAAA' });
      expect((await pimentaCurta.call('POST', '/api/entrar', entrar('codigo-sub-dono'))).status).toBe(503);
    });

    it('freio por IP: 30 entradas por hora, contando as que deram errado; o IP não fica no banco', async () => {
      const { db, call, advance } = await setup();
      for (let i = 0; i < 30; i++) await call('POST', '/api/entrar', entrar('codigo-ruim'), { ip: '203.0.113.5' });
      const freado = await call('POST', '/api/entrar', entrar('codigo-sub-dono'), { ip: '203.0.113.5' });
      expect(freado.status).toBe(429);
      expect(await freado.json()).toMatchObject({ erro: 'muitas-tentativas' });
      // outro IP passa
      expect((await call('POST', '/api/entrar', entrar('codigo-sub-dono'), { ip: '198.51.100.7' })).status).toBe(200);
      const chaves = await db.all<{ chave: string }>('SELECT DISTINCT chave FROM freios');
      expect(chaves.some((c) => c.chave.includes('203.0.113') || c.chave.includes('198.51'))).toBe(false);
      // passada a hora, volta a entrar
      advance(3_600_000);
      expect((await call('POST', '/api/entrar', entrar('codigo-sub-dono'), { ip: '203.0.113.5' })).status).toBe(200);
    });

    it('freio por IP com pedidos ao mesmo tempo: nunca passa de 30', async () => {
      const { db, deps } = await setup();
      // o banco que demora a responder as leituras: todos os pedidos contam antes de algum anotar
      const devagar: Db = { ...db, first: async (sql, params) => (await new Promise((r) => setTimeout(r, 5)), db.first(sql, params)) };
      const app = createApp({ ...deps, db: devagar });
      const call = jsonCaller((path, init) => app.request(path, init));
      const res = await Promise.all(Array.from({ length: 36 }, () => call('POST', '/api/entrar', entrar('codigo-ruim'), { ip: '203.0.113.9' })));
      expect(res.filter((r) => r.status === 429).length).toBe(6);
      expect(await db.first("SELECT COUNT(*) AS n FROM freios WHERE acao = 'entrar'")).toEqual({ n: 30 });
    });

    it('freio por conta: 30 entradas por hora, de qualquer IP', async () => {
      const { call } = await setup({ COTA_LINHAS_DIA: '100000' });
      for (let i = 0; i < 30; i++) expect((await call('POST', '/api/entrar', entrar('codigo-sub-dono'), { ip: `10.0.0.${i}` })).status).toBe(200);
      expect(await (await call('POST', '/api/entrar', entrar('codigo-sub-dono'), { ip: '10.0.1.1' })).json()).toMatchObject({ erro: 'muitas-tentativas' });
    });

    it('o mesmo IP vira chaves diferentes em dias diferentes', async () => {
      const { db, call, advance } = await setup();
      await call('POST', '/api/entrar', entrar('codigo-ruim'), { ip: '203.0.113.5' });
      advance(86_400_000);
      await call('POST', '/api/entrar', entrar('codigo-ruim'), { ip: '203.0.113.5' });
      const chaves = await db.all<{ chave: string }>("SELECT DISTINCT chave FROM freios WHERE chave LIKE 'ip:%'");
      expect(chaves.length).toBe(2);
    });
  });
}
