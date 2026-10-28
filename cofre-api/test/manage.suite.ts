import { describe, expect, it } from 'vitest';
import { base64url } from '../src/domain/bytes';
import { cleanup } from '../src/domain/cleanup';
import { VAULT_TABLES, eraseVaultStatements, hasVault } from '../src/domain/murall';
import { hashToken } from '../src/domain/session';
import { DONO, OUTRA } from './harness';
import { CODIGO, ENV, SENHA, cofrePronto } from './open.suite';
import type { Setup } from './suite';
import { ORIGEM, VETORES } from './webauthn-vetores';

const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);
const b = (n: number, ini: number) => base64url(seq(n, ini));
const NOVO_ENV = '9a1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b7a';
/** A confirmação de agora pela senha mestra (a prova dela, a mesma de abrir). */
const PELA_SENHA = { confirmar: { kAuth: SENHA } };

/** Gerenciar o cofre aberto e a limpeza diária. */
export function manageSuite(label: string, setup: Setup) {
  /** O cofre pronto (celular com PRF e PC no modo servidor) e já aberto pelo celular. */
  async function aberto(env: Record<string, string> = {}) {
    const ctx = await cofrePronto(setup, env);
    const entrada = await ctx.entrar();
    await ctx.chave(entrada);
    const { token } = (await (await ctx.post('/api/cofre/abrir', { kAuth: SENHA }, entrada)).json()) as { token: string };
    const pedir = (method: string, path: string, body?: unknown, t = token) => ctx.call(method, path, body, { origin: ORIGEM, token: t });
    /** A confirmação de agora pela passkey: o desafio de confirmar, com os bytes do vetor no lugar dos sorteados. */
    const pelaPasskey = async (alg: 'es256' | 'rs256' = 'es256', n: 0 | 1 = 1, t = token) => {
      const { desafio } = (await (await pedir('POST', '/api/cofre/confirmar', {}, t)).json()) as { desafio: string };
      await ctx.db.batch([{ sql: 'UPDATE cofre_desafios SET desafio = ? WHERE id = ?', params: [seq(32, n === 0 ? 33 : 65), desafio] }]);
      return { confirmar: { desafio, assinatura: VETORES[alg].assinaturas[n] } };
    };
    return { ...ctx, token, pedir, pelaPasskey };
  }

  describe(`Gerenciar o cofre (${label})`, () => {
    it('lista os aparelhos, com o apelido e se têm PRF', async () => {
      const { pedir } = await aberto();
      const { aparelhos } = (await (await pedir('GET', '/api/cofre/aparelhos')).json()) as any;
      expect(aparelhos.map((a: any) => [a.id, a.apelido, a.prf])).toEqual([
        [VETORES.es256.reg.id, 'Celular', true],
        [VETORES.rs256.reg.id, 'PC', false],
      ]);
      expect(aparelhos[0].usadoEm).toBe('2026-10-21T15:00:00.000Z');
    });

    it('tira um aparelho (e o envelope dele), mas nunca o último', async () => {
      const { pedir, db } = await aberto();
      expect(await (await pedir('DELETE', `/api/cofre/aparelhos/${VETORES.rs256.reg.id}`, PELA_SENHA)).json()).toEqual({ tirado: true });
      expect(await db.first('SELECT * FROM cofre_envelopes WHERE id = ?', [ENV.pc])).toBeNull();
      expect(await db.first("SELECT tipo FROM cofre_eventos WHERE tipo = 'aparelho-tirado'")).toEqual({ tipo: 'aparelho-tirado' });
      const ultimo = await pedir('DELETE', `/api/cofre/aparelhos/${VETORES.es256.reg.id}`, PELA_SENHA);
      expect(ultimo.status).toBe(409);
      expect(await ultimo.json()).toMatchObject({ erro: 'ultimo-aparelho' });
      expect(await db.first('SELECT id FROM cofre_credenciais')).toEqual({ id: VETORES.es256.reg.id });
      expect((await pedir('DELETE', '/api/cofre/aparelhos/nao-existe', PELA_SENHA)).status).toBe(404);
    });

    it('põe um aparelho com a passkey registrada contra o desafio', async () => {
      const { pedir, desafio, db } = await aberto();
      await pedir('DELETE', `/api/cofre/aparelhos/${VETORES.rs256.reg.id}`, PELA_SENHA);
      const aparelho = { desafio: await desafio('registro', seq(32, 1)), credencial: VETORES.rs256.reg, apelido: 'PC do trabalho', prf: false, envelopeId: NOVO_ENV, envelope: b(61, 11), s: b(32, 12) };
      const res = await pedir('POST', '/api/cofre/aparelhos', { aparelho, ...PELA_SENHA });
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ id: VETORES.rs256.reg.id, apelido: 'PC do trabalho', prf: false });
      expect(await db.first('SELECT tipo FROM cofre_envelopes WHERE id = ?', [NOVO_ENV])).toEqual({ tipo: 'servidor' });
      // o mesmo aparelho de novo não entra
      const repetido = { ...aparelho, desafio: await desafio('registro', seq(32, 1)), envelopeId: '9a1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b7b' };
      expect(await (await pedir('POST', '/api/cofre/aparelhos', { aparelho: repetido, ...PELA_SENHA })).json()).toMatchObject({ erro: 'passkey-repetida' });
    });

    it('no máximo 10 aparelhos', async () => {
      const { pedir, desafio, db } = await aberto();
      const at = '2026-10-21T15:00:00.000Z';
      await db.batch(
        Array.from({ length: 8 }, (_, i) => ({
          sql: "INSERT INTO cofre_credenciais (id, usuario_id, chave_publica, algoritmo, prf, apelido, criado_em) VALUES (?, ?, ?, -7, 1, 'x', ?)",
          params: [`extra-${i}`, DONO.id, seq(4, 0), at],
        })),
      );
      const aparelho = { desafio: await desafio('registro', seq(32, 1)), credencial: VETORES.rs256.reg, apelido: 'Outro', prf: true, envelopeId: NOVO_ENV, envelope: b(61, 11) };
      expect(await (await pedir('POST', '/api/cofre/aparelhos', { aparelho, ...PELA_SENHA })).json()).toMatchObject({ erro: 'aparelhos-demais' });
    });

    it('troca a senha: a antiga para de abrir, a nova abre', async () => {
      const { pedir, entrar, chave, post, db } = await aberto();
      const res = await pedir('PUT', '/api/cofre/senha', { versao: 1, kdf: { m: 131072, t: 4, p: 1 }, sal: b(16, 40), v: b(61, 41), kAuth: b(32, 42), ...PELA_SENHA });
      expect(await res.json()).toEqual({ trocada: true });
      expect(await db.first<any>('SELECT kdf_m, kdf_t FROM cofre_contas WHERE usuario_id = ?', [DONO.id])).toEqual({ kdf_m: 131072, kdf_t: 4 });
      const t = await entrar();
      await chave(t, 'es256', 1);
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()).toMatchObject({ erro: 'senha-errada' });
      await chave(t, 'rs256', 0);
      const aberto2 = (await (await post('/api/cofre/abrir', { kAuth: b(32, 42) }, t)).json()) as any;
      expect(aberto2).toMatchObject({ v: b(61, 41) });
    });

    it('a senha nova também tem o mínimo do Argon2id', async () => {
      const { pedir } = await aberto();
      expect(await (await pedir('PUT', '/api/cofre/senha', { versao: 1, kdf: { m: 1024, t: 1, p: 1 }, sal: b(16, 40), v: b(61, 41), kAuth: b(32, 42), ...PELA_SENHA })).json()).toMatchObject({ erro: 'pedido-invalido' });
    });

    it('código novo: o antigo para de valer na hora', async () => {
      const { pedir, entrar, post } = await aberto();
      expect(await (await pedir('PUT', '/api/cofre/recuperacao', { id: NOVO_ENV, envelope: b(61, 50), kRec: b(32, 51), ...PELA_SENHA })).json()).toEqual({ trocado: true });
      const t = await entrar();
      expect(await (await post('/api/cofre/recuperar', { kRec: CODIGO }, t)).json()).toMatchObject({ erro: 'codigo-errado' });
      expect(await (await post('/api/cofre/recuperar', { kRec: b(32, 51) }, t)).json()).toEqual({ envelope: { id: NOVO_ENV, dados: b(61, 50) } });
    });

    it('o código vale uma vez: depois de abrir com ele, só um novo', async () => {
      const { entrar, post, pedir } = await aberto();
      const t = await entrar();
      await post('/api/cofre/recuperar', { kRec: CODIGO }, t);
      const comCodigo = (await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()) as any;
      expect(comCodigo.recuperada).toBe(true);
      const t2 = await entrar();
      expect(await (await post('/api/cofre/recuperar', { kRec: CODIGO }, t2)).json()).toMatchObject({ erro: 'codigo-ja-usado' });
      // aberto pelo código (sem passkey à mão), a senha mestra confirma o código novo
      expect((await pedir('PUT', '/api/cofre/recuperacao', { id: NOVO_ENV, envelope: b(61, 50), kRec: b(32, 51), ...PELA_SENHA }, comCodigo.token)).status).toBe(200);
      expect((await post('/api/cofre/recuperar', { kRec: b(32, 51) }, t2)).status).toBe(200);
    });

    it('os aparelhos abertos: quando e onde, a atual marcada, e nenhum token', async () => {
      const { pedir, entrar } = await aberto();
      await entrar();
      const { sessoes } = (await (await pedir('GET', '/api/cofre/sessoes')).json()) as any;
      // a desta entrada e a do cofre aberto (a de criar e a entrada que abriu já sumiram)
      expect(sessoes).toHaveLength(2);
      expect(sessoes.filter((s: any) => s.atual)).toEqual([{ tipo: 'cofre', criadaEm: '2026-10-21T15:00:00.000Z', usadaEm: '2026-10-21T15:00:00.000Z', aparelho: 'Chrome no Windows', atual: true }]);
      expect(JSON.stringify(sessoes)).not.toMatch(/hash|token/);
    });

    it('trancar todos: todas as sessões, inclusive esta', async () => {
      const { pedir, entrar, db } = await aberto();
      await entrar();
      const res = await pedir('POST', '/api/cofre/trancar-todos', {});
      expect(res.headers.get('Clear-Site-Data')).toBe('"cache", "storage"');
      expect(await db.first('SELECT * FROM cofre_sessoes WHERE usuario_id = ?', [DONO.id])).toBeNull();
      expect((await pedir('GET', '/api/cofre/aparelhos')).status).toBe(401);
    });

    it('o histórico: do mais novo para o mais velho, só os últimos 90 dias', async () => {
      const { pedir, db } = await aberto();
      await db.batch([{ sql: "INSERT INTO cofre_eventos (usuario_id, tipo, em) VALUES (?, 'aberto', '2026-07-01T00:00:00.000Z')", params: [DONO.id] }]);
      const { eventos } = (await (await pedir('GET', '/api/cofre/eventos')).json()) as any;
      expect(eventos.map((e: any) => e.tipo)).toEqual(['aberto', 'passkey-usada', 'cofre-criado']);
      expect(eventos[0]).toEqual({ tipo: 'aberto', em: '2026-10-21T15:00:00.000Z', aparelho: 'Chrome no Windows', pais: null });
    });

    it('apagar o cofre: só com a palavra escrita, e vai tudo da conta (e nada de outra)', async () => {
      const { pedir, db, entrar, call } = await aberto();
      await db.batch([{ sql: "INSERT INTO cofre_eventos (usuario_id, tipo, em) VALUES (?, 'aberto', ?)", params: [OUTRA.id, '2026-10-21T15:00:00.000Z'] }]);
      expect(await (await pedir('DELETE', '/api/cofre', { confirmacao: 'apagar' })).json()).toMatchObject({ erro: 'falta-confirmacao' });
      expect(await (await pedir('DELETE', '/api/cofre', { confirmacao: 'APAGAR' })).json()).toMatchObject({ erro: 'falta-confirmar' });
      const res = await pedir('DELETE', '/api/cofre', { confirmacao: 'APAGAR', ...PELA_SENHA });
      expect(await res.json()).toEqual({ apagado: true });
      expect(res.headers.get('Clear-Site-Data')).toBe('"cache", "storage"');
      for (const t of ['cofre_itens', 'cofre_envelopes', 'cofre_credenciais', 'cofre_desafios', 'cofre_freio_senha', 'cofre_eventos', 'cofre_sessoes', 'cofre_contas']) {
        expect(await db.first(`SELECT 1 FROM ${t} WHERE usuario_id = ?`, [DONO.id]), t).toBeNull();
      }
      expect(await db.first('SELECT 1 AS um FROM cofre_eventos WHERE usuario_id = ?', [OUTRA.id])).toEqual({ um: 1 });
      const t = await entrar();
      expect(await (await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token: t })).json()).toMatchObject({ existe: false });
    });

    it('para o Murall: diz se a conta tem cofre, e apagar o cofre dela tira tudo (e nada de outra)', async () => {
      const { db, pedir } = await aberto();
      expect(await hasVault(db, DONO.id)).toBe(true);
      expect(await hasVault(db, OUTRA.id)).toBe(false);
      // trancado continua tendo cofre
      await pedir('POST', '/api/cofre/trancar-todos', {});
      expect(await hasVault(db, DONO.id)).toBe(true);
      await db.batch([{ sql: "INSERT INTO cofre_eventos (usuario_id, tipo, em) VALUES (?, 'aberto', ?)", params: [OUTRA.id, '2026-10-21T15:00:00.000Z'] }]);
      await db.batch(eraseVaultStatements(DONO.id));
      for (const t of VAULT_TABLES) expect(await db.first(`SELECT 1 FROM ${t} WHERE usuario_id = ?`, [DONO.id]), t).toBeNull();
      expect(await hasVault(db, DONO.id)).toBe(false);
      expect(await db.first('SELECT 1 AS um FROM cofre_eventos WHERE usuario_id = ?', [OUTRA.id])).toEqual({ um: 1 });
    });

    it('nada disso com a sessão de entrada', async () => {
      const { entrar, call } = await aberto();
      const t = await entrar();
      for (const [m, p] of [['GET', '/api/cofre/aparelhos'], ['GET', '/api/cofre/sessoes'], ['GET', '/api/cofre/eventos'], ['PUT', '/api/cofre/senha'], ['DELETE', '/api/cofre'], ['POST', '/api/cofre/confirmar']] as const) {
        expect((await call(m, p, m === 'GET' ? undefined : {}, { origin: ORIGEM, token: t })).status, `${m} ${p}`).toBe(401);
      }
    });
  });

  describe(`Confirmar de novo antes do que tranca o dono fora (${label})`, () => {
    const SENHA_NOVA = { versao: 1, kdf: { m: 131072, t: 4, p: 1 }, sal: b(16, 40), v: b(61, 41), kAuth: b(32, 42) };
    const CODIGO_NOVO = { id: NOVO_ENV, envelope: b(61, 50), kRec: b(32, 51) };
    const ERRADA = { confirmar: { kAuth: b(32, 99) } };

    it('só o token não troca a senha, não põe nem tira aparelho, não gera código e não apaga', async () => {
      const { pedir, desafio, db } = await aberto();
      const antes = await db.all('SELECT * FROM cofre_contas');
      await db.batch([
        { sql: 'DELETE FROM cofre_credenciais WHERE id = ?', params: [VETORES.rs256.reg.id] },
        { sql: 'DELETE FROM cofre_envelopes WHERE id = ?', params: [ENV.pc] },
        { sql: "INSERT INTO cofre_credenciais (id, usuario_id, chave_publica, algoritmo, prf, apelido, criado_em) VALUES ('outro', ?, ?, -7, 1, 'Tablet', ?)", params: [DONO.id, seq(4, 0), '2026-10-21T15:00:00.000Z'] },
      ]);
      const aparelho = { desafio: await desafio('registro', seq(32, 1)), credencial: VETORES.rs256.reg, apelido: 'Do ladrão', prf: false, envelopeId: NOVO_ENV, envelope: b(61, 11), s: b(32, 12) };
      const pedidos: [string, string, Record<string, unknown> | undefined][] = [
        ['PUT', '/api/cofre/senha', SENHA_NOVA],
        ['POST', '/api/cofre/aparelhos', { aparelho }],
        ['DELETE', '/api/cofre/aparelhos/outro', undefined],
        ['DELETE', '/api/cofre/aparelhos/outro', {}],
        ['PUT', '/api/cofre/recuperacao', CODIGO_NOVO],
        ['DELETE', '/api/cofre', { confirmacao: 'APAGAR' }],
      ];
      for (const [m, p, corpo] of pedidos) {
        const res = await pedir(m, p, corpo);
        expect(res.status, `${m} ${p}`).toBe(403);
        expect(await res.json(), `${m} ${p}`).toMatchObject({ erro: 'falta-confirmar' });
        if (!corpo) continue;
        for (const ruim of [{}, { kAuth: 'x' }, { desafio: 'x' }, 'sim', [SENHA]]) {
          const r = await pedir(m, p, { ...corpo, confirmar: ruim });
          expect([400, 403], `${m} ${p} ${JSON.stringify(ruim)}`).toContain(r.status);
        }
      }
      expect(await db.all('SELECT * FROM cofre_contas')).toEqual(antes);
      expect((await db.all<{ id: string }>('SELECT id FROM cofre_credenciais ORDER BY id')).map((r) => r.id)).toEqual([VETORES.es256.reg.id, 'outro'].sort());
      expect(await db.first('SELECT id FROM cofre_envelopes WHERE id = ?', [NOVO_ENV])).toBeNull();
      expect(await db.first("SELECT id FROM cofre_envelopes WHERE tipo = 'recuperacao'")).toEqual({ id: ENV.rec });
    });

    it('a senha errada: 403 sem trancar a página, no histórico, e não gasta o freio de abrir', async () => {
      const { pedir, db, entrar, chave, post } = await aberto();
      const res = await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...ERRADA });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ erro: 'senha-errada' });
      expect(await db.first("SELECT tipo FROM cofre_eventos WHERE tipo = 'erro-senha'")).toEqual({ tipo: 'erro-senha' });
      expect(await db.first('SELECT * FROM cofre_freio_senha')).toBeNull();
      expect(await db.first("SELECT 1 AS um FROM freios WHERE acao = 'erro-senha'")).toBeNull();
      // a sessão continua, e o dono abre em outro aparelho como sempre
      expect((await pedir('GET', '/api/cofre/aparelhos')).status).toBe(200);
      const t = await entrar();
      await chave(t, 'rs256', 0);
      expect((await post('/api/cofre/abrir', { kAuth: SENHA }, t)).status).toBe(200);
    });

    it('cinco erros da senha por cofre aberto; depois, só a passkey (ou abrir de novo)', async () => {
      const { pedir, pelaPasskey, entrar, chave, post } = await aberto();
      for (let i = 0; i < 5; i++) expect((await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...ERRADA })).status).toBe(403);
      // nem a certa passa: quem tem só o token já teve as tentativas dele
      const limite = await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...PELA_SENHA });
      expect(limite.status).toBe(429);
      expect(await limite.json()).toMatchObject({ erro: 'confirmar-limite' });
      expect((await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...(await pelaPasskey()) })).status).toBe(200);
      // outro cofre aberto começa do zero
      const t = await entrar();
      await chave(t, 'rs256', 0);
      const { token } = (await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()) as { token: string };
      expect((await pedir('PUT', '/api/cofre/recuperacao', { id: '9a1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', envelope: b(61, 52), kRec: b(32, 53), ...PELA_SENHA }, token)).status).toBe(200);
    });

    it('acertar a senha não conta no freio', async () => {
      const { pedir } = await aberto();
      for (let i = 0; i < 7; i++) {
        const res = await pedir('PUT', '/api/cofre/recuperacao', { id: `9a1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b${(16 + i).toString(16)}`, envelope: b(61, 50), kRec: b(32, 51), ...PELA_SENHA });
        expect(res.status, `vez ${i + 1}`).toBe(200);
      }
    });

    it('pela passkey: o desafio de confirmar lista as passkeys, vale uma vez e por 5 minutos', async () => {
      const { pedir, pelaPasskey, advance, db } = await aberto();
      const body = (await (await pedir('POST', '/api/cofre/confirmar', {})).json()) as any;
      expect(body.publicKey).toMatchObject({ rpId: 'localhost', userVerification: 'required' });
      expect(body.publicKey.allowCredentials.map((c: any) => c.id)).toEqual([VETORES.es256.reg.id, VETORES.rs256.reg.id]);
      expect(await db.first<any>('SELECT tipo, expira_em FROM cofre_desafios WHERE id = ?', [body.desafio])).toEqual({ tipo: 'assinatura', expira_em: '2026-10-21T15:05:00.000Z' });

      const conf = await pelaPasskey('es256', 1);
      expect(await (await pedir('PUT', '/api/cofre/senha', { ...SENHA_NOVA, ...conf })).json()).toEqual({ trocada: true });
      // o mesmo desafio não serve de novo
      expect(await (await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...conf })).json()).toMatchObject({ erro: 'desafio-invalido' });
      expect(await db.first("SELECT id FROM cofre_envelopes WHERE tipo = 'recuperacao'")).toEqual({ id: ENV.rec });
      // vencido não serve
      const velha = await pelaPasskey('rs256', 0);
      advance(5 * 60_000);
      expect(await (await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...velha })).json()).toMatchObject({ erro: 'desafio-invalido' });
      // e é a senha nova (a prova trocada) que confirma agora
      expect((await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...PELA_SENHA })).status).toBe(403);
      expect((await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, confirmar: { kAuth: SENHA_NOVA.kAuth } })).status).toBe(200);
    });

    it('a passkey de outro cofre, a assinatura de outro desafio ou um contador que volta não confirmam', async () => {
      const { pedir, pelaPasskey, db } = await aberto();
      await db.batch([{ sql: 'DELETE FROM cofre_credenciais WHERE id = ?', params: [VETORES.rs256.reg.id] }, { sql: 'DELETE FROM cofre_envelopes WHERE id = ?', params: [ENV.pc] }]);
      expect(await (await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...(await pelaPasskey('rs256', 0)) })).json()).toMatchObject({ erro: 'passkey-invalida' });
      // a assinatura 1 sobre os bytes da 0
      const { desafio } = (await (await pedir('POST', '/api/cofre/confirmar', {})).json()) as { desafio: string };
      await db.batch([{ sql: 'UPDATE cofre_desafios SET desafio = ? WHERE id = ?', params: [seq(32, 33), desafio] }]);
      expect(await (await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, confirmar: { desafio, assinatura: VETORES.es256.assinaturas[1] } })).json()).toMatchObject({ erro: 'passkey-invalida' });
      // a assinatura 0 já abriu o cofre: o contador não sobe
      expect(await (await pedir('PUT', '/api/cofre/recuperacao', { ...CODIGO_NOVO, ...(await pelaPasskey('es256', 0)) })).json()).toMatchObject({ erro: 'passkey-invalida' });
      expect(await db.first("SELECT id FROM cofre_envelopes WHERE tipo = 'recuperacao'")).toEqual({ id: ENV.rec });
    });

    it('os desafios de confirmar têm o freio da sessão, e não gastam os de abrir do dono', async () => {
      const { pedir, entrar, post } = await aberto();
      for (let i = 0; i < 10; i++) expect((await pedir('POST', '/api/cofre/confirmar', {})).status).toBe(200);
      expect(await (await pedir('POST', '/api/cofre/confirmar', {})).json()).toMatchObject({ erro: 'muitas-tentativas' });
      expect((await post('/api/cofre/desafio', {}, await entrar())).status).toBe(200);
    });

    it('aberto pelo código (o aparelho perdido), a senha mestra tira o perdido, põe um aparelho e gera o código novo', async () => {
      const { entrar, post, pedir, desafio, db } = await aberto();
      const t = await entrar();
      await post('/api/cofre/recuperar', { kRec: CODIGO }, t);
      const { token, recuperada } = (await (await post('/api/cofre/abrir', { kAuth: SENHA }, t)).json()) as any;
      expect(recuperada).toBe(true);
      expect((await pedir('DELETE', `/api/cofre/aparelhos/${VETORES.rs256.reg.id}`, PELA_SENHA, token)).status).toBe(200);
      const aparelho = { desafio: await desafio('registro', seq(32, 1)), credencial: VETORES.rs256.reg, apelido: 'PC novo', prf: false, envelopeId: NOVO_ENV, envelope: b(61, 11), s: b(32, 12) };
      expect((await pedir('POST', '/api/cofre/aparelhos', { aparelho, ...PELA_SENHA }, token)).status).toBe(201);
      expect((await pedir('PUT', '/api/cofre/recuperacao', { id: '9a1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', envelope: b(61, 52), kRec: b(32, 53), ...PELA_SENHA }, token)).status).toBe(200);
      expect(await db.first("SELECT usado_em FROM cofre_envelopes WHERE tipo = 'recuperacao'")).toEqual({ usado_em: null });
    });
  });

  describe(`Limpeza diária (${label})`, () => {
    it('apaga o que venceu e transforma em lápide o que passou de 30 dias na lixeira', async () => {
      const { deps, db, advance } = await aberto();
      const at = (d: string) => `${d}T12:00:00.000Z`;
      await db.batch([
        { sql: 'INSERT INTO cofre_itens (usuario_id, id, versao, dados, mudado_em, na_lixeira_desde) VALUES (?, ?, 1, ?, ?, ?)', params: [DONO.id, 'velho', seq(541, 1), at('2026-09-01'), at('2026-09-15')] },
        { sql: 'INSERT INTO cofre_itens (usuario_id, id, versao, dados, mudado_em, na_lixeira_desde) VALUES (?, ?, 1, ?, ?, ?)', params: [DONO.id, 'recente', seq(541, 2), at('2026-10-01'), at('2026-10-10')] },
        { sql: 'INSERT INTO cofre_itens (usuario_id, id, versao, dados, mudado_em, na_lixeira_desde) VALUES (?, ?, 1, ?, ?, NULL)', params: [DONO.id, 'ativo', seq(541, 3), at('2026-01-01')] },
        { sql: "INSERT INTO cofre_eventos (usuario_id, tipo, em) VALUES (?, 'aberto', ?)", params: [DONO.id, at('2026-07-01')] },
        { sql: "INSERT INTO freios (chave, acao, criado_em) VALUES ('x', 'entrar', ?)", params: [at('2026-10-01')] },
        { sql: "INSERT INTO uso_diario (dia, linhas_gravadas, gravacoes) VALUES ('2026-08-01', 5, 1)" },
        { sql: 'INSERT INTO cofre_freio_senha (usuario_id, erros_seguidos, sequencias, espera_ate) VALUES (?, 0, 1, ?)', params: [OUTRA.id, at('2026-10-01')] },
        { sql: "INSERT INTO cofre_desafios (id, usuario_id, tipo, desafio, expira_em) VALUES ('d', ?, 'registro', ?, ?)", params: [DONO.id, seq(32, 1), at('2026-10-20')] },
        { sql: "INSERT INTO cofre_sessoes (hash, usuario_id, tipo, codigo, criada_em, usada_em, expira_em) VALUES (?, ?, 'entrada', 'X', ?, ?, ?)", params: [await hashToken('v'.repeat(43)), DONO.id, at('2026-10-20'), at('2026-10-20'), at('2026-10-20')] },
      ]);
      advance(60_000);
      await cleanup(deps);
      const dados = async (id: string) => (await db.first<{ n: number }>('SELECT length(dados) AS n FROM cofre_itens WHERE id = ?', [id]))?.n;
      expect(await dados('velho')).toBe(0);
      expect(await dados('recente')).toBe(541);
      expect(await dados('ativo')).toBe(541);
      expect(await db.first("SELECT versao FROM cofre_itens WHERE id = 'velho'")).toEqual({ versao: 1 });
      expect(await db.first("SELECT 1 FROM cofre_eventos WHERE em = ?", [at('2026-07-01')])).toBeNull();
      expect(await db.first("SELECT tipo FROM cofre_eventos WHERE tipo = 'aberto'")).toEqual({ tipo: 'aberto' });
      expect(await db.first("SELECT 1 FROM freios WHERE chave = 'x'")).toBeNull();
      expect(await db.first("SELECT 1 FROM uso_diario WHERE dia = '2026-08-01'")).toBeNull();
      expect(await db.first('SELECT 1 FROM cofre_freio_senha WHERE usuario_id = ?', [OUTRA.id])).toBeNull();
      expect(await db.first("SELECT 1 FROM cofre_desafios WHERE id = 'd'")).toBeNull();
      // a sessão vencida some; a do cofre aberto agora continua
      expect(await db.first('SELECT 1 FROM cofre_sessoes WHERE hash = ?', [await hashToken('v'.repeat(43))])).toBeNull();
      expect(await db.first("SELECT tipo FROM cofre_sessoes WHERE tipo = 'cofre'")).toEqual({ tipo: 'cofre' });
    });

    it('desligado, não mexe em nada', async () => {
      const { db, deps } = await aberto();
      await db.batch([{ sql: "INSERT INTO cofre_eventos (usuario_id, tipo, em) VALUES (?, 'aberto', '2026-01-01T00:00:00.000Z')", params: [DONO.id] }]);
      await cleanup({ ...deps, config: { ...deps.config, mode: 'desligado' } });
      expect(await db.first("SELECT 1 AS um FROM cofre_eventos WHERE em = '2026-01-01T00:00:00.000Z'")).toEqual({ um: 1 });
    });
  });
}
