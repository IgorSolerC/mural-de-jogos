import { describe, expect, it } from 'vitest';
import { base64url, blob } from '../src/domain/bytes';
import { proofHash } from '../src/domain/proofs';
import { DONO, VERIFIER } from './harness';
import type { Setup } from './suite';
import { ORIGEM, RP_ID, VETORES } from './webauthn-vetores';

const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);
const b = (n: number, ini: number) => base64url(seq(n, ini));
const LOCAL = { COFRE_ORIGEM: ORIGEM, COFRE_RP_ID: RP_ID, COFRE_ENVELOPES_1: b(32, 200), COTA_LINHAS_DIA: '100000' };
export const ENV = { rec: '3f1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b70', celular: '3f1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b71', pc: '3f1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b72' };
export const SENHA = b(32, 3);
export const CODIGO = b(32, 6);

/**
 * Um cofre já criado com os vetores reais: o celular (ES256, com PRF) e o PC (RS256, modo servidor).
 * `entrar` faz uma sessão de entrada nova; `desafio` põe no banco um desafio de assinatura com os
 * bytes dos vetores (33..64 para a primeira assinatura, 65..96 para a segunda).
 */
export async function cofrePronto(setup: Setup, env: Record<string, string> = {}) {
  const ctx = await setup({ ...LOCAL, ...env });
  const post = (path: string, body: unknown, token?: string, call = ctx.call) => call('POST', path, body, { origin: ORIGEM, token });
  const entrar = async () => {
    const res = await post('/api/entrar', { codigo: 'codigo-sub-dono', verificador: VERIFIER, aparelho: 'Chrome no Windows' });
    return ((await res.json()) as { token: string }).token;
  };
  const desafio = async (tipo: 'registro' | 'assinatura', bytes: Uint8Array) => {
    const id = crypto.randomUUID();
    await ctx.db.batch([
      { sql: 'INSERT INTO cofre_desafios (id, usuario_id, tipo, desafio, expira_em) VALUES (?, ?, ?, ?, ?)', params: [id, DONO.id, tipo, bytes, new Date(ctx.deps.now().getTime() + 120_000).toISOString()] },
    ]);
    return id;
  };
  const token = await entrar();
  const criado = await post(
    '/api/cofre',
    {
      versao: 1,
      kdf: { m: 65536, t: 3, p: 1 },
      sal: b(16, 1),
      v: b(61, 2),
      kAuth: SENHA,
      manifesto: b(541, 4),
      recuperacao: { id: ENV.rec, envelope: b(61, 5), kRec: CODIGO },
      aparelhos: [
        { desafio: await desafio('registro', seq(32, 1)), credencial: VETORES.es256.reg, apelido: 'Celular', prf: true, envelopeId: ENV.celular, envelope: b(61, 7) },
        { desafio: await desafio('registro', seq(32, 1)), credencial: VETORES.rs256.reg, apelido: 'PC', prf: false, envelopeId: ENV.pc, envelope: b(61, 9), s: b(32, 8) },
      ],
    },
    token,
  );
  expect(criado.status).toBe(201);
  /** A passkey do celular (ou do PC), com a assinatura `n` (0 ou 1) dos vetores. */
  const chave = async (t: string, alg: 'es256' | 'rs256' = 'es256', n: 0 | 1 = 0, call = ctx.call) =>
    post('/api/cofre/chave', { desafio: await desafio('assinatura', seq(32, n === 0 ? 33 : 65)), assinatura: VETORES[alg].assinaturas[n] }, t, call);
  /** Marca direto no banco que o segundo fator acabou de ser conferido (para testar o freio sem gastar vetores). */
  const marcar = (t: string) =>
    ctx.db.batch([{ sql: "UPDATE cofre_sessoes SET fator = 'passkey', fator_ate = ? WHERE tipo = 'entrada'", params: [new Date(ctx.deps.now().getTime() + 120_000).toISOString()] }]).then(() => t);
  return { ...ctx, post, entrar, desafio, chave, marcar };
}

/** Abrir, recuperar e trancar o cofre. */
export function openSuite(label: string, setup: Setup) {
  const cofre = (env: Record<string, string> = {}) => cofrePronto(setup, env);

  describe(`Abrir o cofre (${label})`, () => {
    it('com o cofre criado, a sessão de entrada vale só 5 minutos (a de 20 é para criar)', async () => {
      const { post, call, advance } = await cofre();
      const res = await post('/api/entrar', { codigo: 'codigo-sub-dono', verificador: VERIFIER, aparelho: 'Chrome no Windows' });
      const { token, expiraEm } = (await res.json()) as { token: string; expiraEm: string };
      expect(expiraEm).toBe('2026-10-21T15:05:00.000Z');
      advance(5 * 60_000);
      expect((await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token })).status).toBe(401);
    });

    it('o desafio traz o sal, o Argon2id, as passkeys da conta e a última mudança', async () => {
      const { post, entrar, db } = await cofre();
      const res = await post('/api/cofre/desafio', {}, await entrar());
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toMatchObject({ versao: 1, kdf: { m: 65536, t: 3, p: 1 }, sal: b(16, 1), mudadoEm: '2026-10-21T15:00:00.000Z' });
      expect(body.aparelhos).toEqual([
        { id: VETORES.es256.reg.id, apelido: 'Celular', prf: true },
        { id: VETORES.rs256.reg.id, apelido: 'PC', prf: false },
      ]);
      expect(body.publicKey).toMatchObject({ rpId: RP_ID, userVerification: 'required' });
      expect(body.publicKey.allowCredentials.map((c: any) => c.id)).toEqual([VETORES.es256.reg.id, VETORES.rs256.reg.id]);
      expect(await db.first('SELECT tipo FROM cofre_desafios WHERE id = ?', [body.desafio])).toEqual({ tipo: 'assinatura' });
    });

    it('a passkey com PRF devolve o envelope do aparelho; a do modo servidor, também o S_i', async () => {
      const { chave, entrar, db } = await cofre();
      const t = await entrar();
      const celular = await chave(t, 'es256');
      expect(await celular.json()).toEqual({ envelope: { id: ENV.celular, dados: b(61, 7) }, tipo: 'prf' });
      const pc = await chave(t, 'rs256');
      expect(await pc.json()).toEqual({ envelope: { id: ENV.pc, dados: b(61, 9) }, tipo: 'servidor', s: b(32, 8) });
      const contador = await db.first<{ contador_assinatura: number }>('SELECT contador_assinatura FROM cofre_credenciais WHERE id = ?', [VETORES.es256.reg.id]);
      expect(contador!.contador_assinatura).toBeGreaterThan(0);
      expect(await db.all('SELECT tipo FROM cofre_eventos WHERE tipo = ?', ['passkey-usada'])).toHaveLength(2);
    });

    it('abre com a passkey e a senha: V, o manifesto, o contador e a sessão do cofre; a de entrada some', async () => {
      const { chave, entrar, post, call, db } = await cofre();
      const t = await entrar();
      await chave(t);
      const res = await post('/api/cofre/abrir', { kAuth: SENHA }, t);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toMatchObject({ v: b(61, 2), manifesto: b(541, 4), contador: 0, recuperada: false, paradaMaxima: 600, expiraEm: '2026-10-21T23:00:00.000Z' });
      expect(await (await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token: body.token })).json()).toMatchObject({ existe: true, aparelhos: 2 });
      expect((await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token: t })).status).toBe(401);
      expect(await db.first("SELECT tipo FROM cofre_eventos WHERE tipo = 'aberto'")).toEqual({ tipo: 'aberto' });
    });

    it('sem a passkey antes, a senha nem é conferida', async () => {
      const { entrar, post, db } = await cofre();
      const res = await post('/api/cofre/abrir', { kAuth: SENHA }, await entrar());
      expect(await res.json()).toMatchObject({ erro: 'falta-passkey' });
      expect(await db.first('SELECT * FROM cofre_freio_senha')).toBeNull();
    });

    it('cada tentativa de senha gasta a passkey: errou, precisa de outra (força bruta online)', async () => {
      const { chave, entrar, post } = await cofre();
      const t = await entrar();
      await chave(t);
      expect(await (await post('/api/cofre/abrir', { kAuth: b(32, 99) }, t)).json()).toMatchObject({ erro: 'senha-errada' });
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()).toMatchObject({ erro: 'falta-passkey' });
      await chave(t, 'es256', 1);
      expect((await post('/api/cofre/abrir', { kAuth: SENHA }, t)).status).toBe(200);
    });

    it('a marca da passkey vale 2 minutos', async () => {
      const { chave, entrar, post, advance } = await cofre();
      const t = await entrar();
      await chave(t);
      advance(120_000);
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()).toMatchObject({ erro: 'falta-passkey' });
    });

    it('freio da senha: 5 erros, 1 minuto de espera; a próxima sequência, 2 minutos; acertar zera', async () => {
      const { entrar, post, marcar, advance, db } = await cofre();
      let t = await entrar();
      for (let i = 0; i < 5; i++) expect((await post('/api/cofre/abrir', { kAuth: b(32, 99) }, await marcar(t))).status).toBe(401);
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA }, await marcar(t))).json()).toMatchObject({ erro: 'senha-espera' });
      advance(60_000);
      for (let i = 0; i < 5; i++) expect((await post('/api/cofre/abrir', { kAuth: b(32, 99) }, await marcar(t))).status).toBe(401);
      advance(60_000);
      t = await entrar();
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA }, await marcar(t))).json()).toMatchObject({ erro: 'senha-espera' });
      advance(60_000);
      expect((await post('/api/cofre/abrir', { kAuth: SENHA }, await marcar(t))).status).toBe(200);
      expect(await db.first('SELECT * FROM cofre_freio_senha')).toBeNull();
    });

    it('no máximo 20 erros de senha por dia', async () => {
      const { entrar, post, marcar, advance } = await cofre();
      for (let rodada = 0; rodada < 4; rodada++) {
        const t = await entrar();
        for (let i = 0; i < 5; i++) await post('/api/cofre/abrir', { kAuth: b(32, 99) }, await marcar(t));
        advance(20 * 60_000);
      }
      const t = await entrar();
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA }, await marcar(t))).json()).toMatchObject({ erro: 'senha-limite-dia' });
    });

    it('a mesma assinatura duas vezes: recusada (o contador não subiu)', async () => {
      const { chave, entrar } = await cofre();
      const t = await entrar();
      expect((await chave(t, 'es256', 1)).status).toBe(200);
      expect(await (await chave(t, 'es256', 0)).json()).toMatchObject({ erro: 'passkey-invalida' });
    });

    it('desafio de registro não serve para abrir; desafio usado não serve de novo', async () => {
      const { entrar, post, desafio } = await cofre();
      const t = await entrar();
      const registro = await desafio('registro', seq(32, 33));
      expect(await (await post('/api/cofre/chave', { desafio: registro, assinatura: VETORES.es256.assinaturas[0] }, t)).json()).toMatchObject({ erro: 'desafio-invalido' });
      const id = await desafio('assinatura', seq(32, 33));
      expect((await post('/api/cofre/chave', { desafio: id, assinatura: VETORES.es256.assinaturas[0] }, t)).status).toBe(200);
      expect(await (await post('/api/cofre/chave', { desafio: id, assinatura: VETORES.es256.assinaturas[1] }, t)).json()).toMatchObject({ erro: 'desafio-invalido' });
    });

    it('passkey que não é do cofre: recusada', async () => {
      const { entrar, post, desafio } = await cofre();
      const t = await entrar();
      const outra = { ...VETORES.es256.assinaturas[0], id: b(32, 9) };
      expect(await (await post('/api/cofre/chave', { desafio: await desafio('assinatura', seq(32, 33)), assinatura: outra }, t)).json()).toMatchObject({ erro: 'passkey-invalida' });
    });

    it('a sessão do cofre não serve para abrir de novo, nem a de entrada para o que é do cofre aberto', async () => {
      const { chave, entrar, post } = await cofre();
      const t = await entrar();
      await chave(t);
      const { token } = (await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()) as { token: string };
      expect((await post('/api/cofre/desafio', {}, token)).status).toBe(401);
      expect((await post('/api/cofre/abrir', { kAuth: SENHA }, token)).status).toBe(401);
    });

    it('a sessão do cofre tranca com 10 minutos parada, e usar renova (até 8 horas)', async () => {
      const { chave, entrar, post, call, advance } = await cofre();
      const t = await entrar();
      await chave(t);
      const { token } = (await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()) as { token: string };
      const ver = async () => (await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token })).status;
      advance(9 * 60_000);
      expect(await ver()).toBe(200);
      advance(9 * 60_000);
      expect(await ver()).toBe(200);
      advance(10 * 60_000);
      expect(await ver()).toBe(401);

      // usando sempre, acaba nas 8 horas
      const t2 = await entrar();
      await chave(t2, 'es256', 1);
      const aberto = (await (await post('/api/cofre/abrir', { kAuth: SENHA }, t2)).json()) as { token: string };
      for (let m = 0; m < 8 * 60 - 9; m += 9) {
        advance(9 * 60_000);
        expect((await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token: aberto.token })).status).toBe(200);
      }
      advance(9 * 60_000);
      expect((await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token: aberto.token })).status).toBe(401);
    });

    it('congelado, ninguém abre (nem com tudo certo)', async () => {
      const { entrar, post, db, chave } = await cofre();
      await db.batch([{ sql: 'UPDATE cofre_contas SET congelado_ate = ?', params: ['2026-10-22T15:00:00.000Z'] }]);
      const t = await entrar();
      expect(await (await post('/api/cofre/desafio', {}, t)).json()).toMatchObject({ erro: 'cofre-congelado' });
      expect((await chave(t)).status).toBe(423);
      expect((await post('/api/cofre/recuperar', { kRec: CODIGO }, t)).status).toBe(423);
    });

    it('a pimenta trocada: quem abre com a senha certa passa para a versão nova', async () => {
      const { db, deps, withEnv, entrar, chave, post } = await cofre();
      const nova = withEnv({ COFRE_PIMENTA_2: b(32, 77) });
      const t = await entrar();
      await chave(t);
      expect((await post('/api/cofre/abrir', { kAuth: SENHA }, t, nova)).status).toBe(200);
      const conta = await db.first<{ auth_hash: Uint8Array; auth_pimenta: number }>('SELECT auth_hash, auth_pimenta FROM cofre_contas');
      expect(conta!.auth_pimenta).toBe(2);
      const segredos = { ...deps.secrets, peppers: new Map([...deps.secrets.peppers, [2, seq(32, 77)]]) };
      expect(blob(conta!.auth_hash)).toEqual((await proofHash({ ...deps, secrets: segredos }, 'auth', seq(32, 3))).hash);
    });

    it('no modo só leitura, dá para abrir, mas não para criar nem mudar', async () => {
      const { withEnv, entrar, chave, post } = await cofre();
      const leitura = withEnv({ MODO: 'so-leitura' });
      const t = await entrar();
      expect((await chave(t, 'es256', 0, leitura)).status).toBe(200);
      expect((await post('/api/cofre/abrir', { kAuth: SENHA }, t, leitura)).status).toBe(200);
      expect(await (await post('/api/cofre', {}, t, leitura)).json()).toMatchObject({ erro: 'cofre-so-leitura' });
      expect(await (await post('/api/cofre/registro', {}, t, leitura)).json()).toMatchObject({ erro: 'cofre-so-leitura' });
    });
  });

  describe(`Recuperar e trancar (${label})`, () => {
    it('o código no lugar da passkey: devolve o envelope do código, e a senha ainda é pedida', async () => {
      const { entrar, post, db } = await cofre();
      const t = await entrar();
      const rec = await post('/api/cofre/recuperar', { kRec: CODIGO }, t);
      expect(await rec.json()).toEqual({ envelope: { id: ENV.rec, dados: b(61, 5) } });
      expect(await (await post('/api/cofre/abrir', { kAuth: b(32, 99) }, t)).json()).toMatchObject({ erro: 'senha-errada' });
      await post('/api/cofre/recuperar', { kRec: CODIGO }, t);
      const aberto = (await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()) as any;
      expect(aberto.recuperada).toBe(true);
      expect(await db.first("SELECT tipo FROM cofre_eventos WHERE tipo = 'aberto-com-codigo'")).toEqual({ tipo: 'aberto-com-codigo' });
    });

    it('código errado: 401, e no máximo 10 tentativas por dia', async () => {
      const { entrar, post } = await cofre();
      const t = await entrar();
      expect(await (await post('/api/cofre/recuperar', { kRec: b(32, 98) }, t)).json()).toMatchObject({ erro: 'codigo-errado' });
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()).toMatchObject({ erro: 'falta-passkey' });
      for (let i = 0; i < 9; i++) await post('/api/cofre/recuperar', { kRec: b(32, 98) }, t);
      expect(await (await post('/api/cofre/recuperar', { kRec: CODIGO }, t)).json()).toMatchObject({ erro: 'muitas-tentativas' });
    });

    it('a prova do código e a da senha não servem uma no lugar da outra', async () => {
      const { entrar, post } = await cofre();
      const t = await entrar();
      expect(await (await post('/api/cofre/recuperar', { kRec: SENHA }, t)).json()).toMatchObject({ erro: 'codigo-errado' });
    });

    it('trancar apaga a sessão (com o token no corpo, como o sendBeacon manda) e pede para limpar a origem', async () => {
      const { chave, entrar, post, call } = await cofre();
      const t = await entrar();
      await chave(t);
      const { token } = (await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()) as { token: string };
      const res = await post('/api/cofre/trancar', { token });
      expect(res.status).toBe(200);
      expect(res.headers.get('Clear-Site-Data')).toBe('"cache", "storage"');
      expect((await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token })).status).toBe(401);
      // sem sessão (ou já trancado), a resposta é a mesma
      const outra = await post('/api/cofre/trancar', { token: 'x'.repeat(43) });
      expect(outra.status).toBe(200);
      expect(outra.headers.get('Clear-Site-Data')).toBe('"cache", "storage"');
    });
  });
}
