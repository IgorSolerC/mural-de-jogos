import { describe, expect, it } from 'vitest';
import { base64url, blob, fromBase64url } from '../src/domain/bytes';
import { derivedUserHandle, openServerSecret, proofHash } from '../src/domain/proofs';
import { DONO, OUTRA, VERIFIER } from './harness';
import type { Setup } from './suite';
import { ORIGEM, RP_ID, VETORES } from './webauthn-vetores';

const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);
const b = (n: number, ini: number) => base64url(seq(n, ini));
/** Os vetores reais foram feitos em http://localhost:4455: o cofre destes testes mora lá. */
const LOCAL = { COFRE_ORIGEM: ORIGEM, COFRE_RP_ID: RP_ID, COFRE_ENVELOPES_1: b(32, 200), COTA_LINHAS_DIA: '100000' };
const ENV_IDS = ['3f1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b70', '3f1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b71', '3f1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b72'];

/** Um pedido de criar o cofre como a página manda (os selados são bytes quaisquer do tamanho certo). */
function corpo(aparelhos: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return {
    versao: 1,
    kdf: { m: 65536, t: 3, p: 1 },
    sal: b(16, 1),
    v: b(61, 2),
    kAuth: b(32, 3),
    manifesto: b(541, 4),
    recuperacao: { id: ENV_IDS[0], envelope: b(61, 5), kRec: b(32, 6) },
    aparelhos,
    ...extra,
  };
}

/** Criar o cofre (`POST /api/cofre/registro` e `POST /api/cofre`). */
export function createSuite(label: string, setup: Setup) {
  /** Entra, e põe no banco desafios de registro com os bytes dos vetores (1..32), como se o servidor os tivesse dado. */
  async function entrou(env: Record<string, string> = {}) {
    const ctx = await setup({ ...LOCAL, ...env });
    const res = await ctx.call('POST', '/api/entrar', { codigo: 'codigo-sub-dono', verificador: VERIFIER }, { origin: ORIGEM });
    const { token } = (await res.json()) as { token: string };
    const desafio = async (usuario = DONO.id, id = crypto.randomUUID(), validoAte = new Date(ctx.deps.now().getTime() + 120_000)) => {
      await ctx.db.batch([
        { sql: "INSERT INTO cofre_desafios (id, usuario_id, tipo, desafio, expira_em) VALUES (?, ?, 'registro', ?, ?)", params: [id, usuario, seq(32, 1), validoAte.toISOString()] },
      ]);
      return id;
    };
    const post = (path: string, body: unknown, t = token) => ctx.call('POST', path, body, { origin: ORIGEM, token: t });
    return { ...ctx, token, desafio, post };
  }

  const aparelho = (alg: 'es256' | 'rs256', desafio: string, envelopeId: string, prf: boolean, extra: Record<string, unknown> = {}) => ({
    desafio,
    credencial: { ...VETORES[alg].reg, transports: ['internal', 'inventado'] },
    apelido: alg === 'es256' ? 'Celular' : 'PC',
    prf,
    envelopeId,
    envelope: b(61, 7),
    ...(prf ? {} : { s: b(32, 8) }),
    ...extra,
  });

  describe(`Criar o cofre (${label})`, () => {
    it('o desafio de registro traz o rpId, o user.id da conta e o nome que você reconhece', async () => {
      const { db, deps, post } = await entrou();
      const res = await post('/api/cofre/registro', {});
      expect(res.status).toBe(200);
      const { desafio, publicKey } = (await res.json()) as { desafio: string; publicKey: any };
      expect(publicKey.rp).toEqual({ id: RP_ID, name: 'Murall Cofre' });
      expect(publicKey.user).toEqual({ id: base64url(await derivedUserHandle(deps, DONO.id)), name: 'Cofre do Murall (K7QF-M2XA)', displayName: 'Cofre do Murall (K7QF-M2XA)' });
      expect(fromBase64url(publicKey.user.id)!.length).toBe(16);
      expect(publicKey.authenticatorSelection).toEqual({ residentKey: 'preferred', userVerification: 'required' });
      expect(publicKey.attestation).toBe('none');
      expect(publicKey.excludeCredentials).toEqual([]);
      const row = await db.first<{ desafio: Uint8Array; tipo: string; expira_em: string }>('SELECT desafio, tipo, expira_em FROM cofre_desafios WHERE id = ?', [desafio]);
      expect(base64url(blob(row!.desafio))).toBe(publicKey.challenge);
      expect(row!.tipo).toBe('registro');
      expect(row!.expira_em).toBe('2026-10-21T15:02:00.000Z');
    });

    it('cria o cofre com um aparelho com PRF, sem guardar nenhum segredo em claro', async () => {
      const { db, deps, desafio, post, call, token } = await entrou();
      const res = await post('/api/cofre', corpo([aparelho('es256', await desafio(), ENV_IDS[1]!, true)]));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ criado: true, aparelhos: [{ id: VETORES.es256.reg.id, apelido: 'Celular', prf: true }] });
      const conta = await db.first<any>('SELECT * FROM cofre_contas WHERE usuario_id = ?', [DONO.id]);
      expect(conta).toMatchObject({ versao_cripto: 1, kdf_m: 65536, kdf_t: 3, kdf_p: 1, contador: 0, auth_pimenta: 1 });
      // a prova da senha só como HMAC com a pimenta
      expect(base64url(blob(conta.auth_hash))).not.toBe(b(32, 3));
      expect(blob(conta.auth_hash)).toEqual((await proofHash(deps, 'auth', seq(32, 3))).hash);
      expect(blob(conta.usuario_passkey)).toEqual(await derivedUserHandle(deps, DONO.id));
      const credencial = await db.first<any>('SELECT algoritmo, prf, apelido, transportes FROM cofre_credenciais');
      expect(credencial).toEqual({ algoritmo: -7, prf: 1, apelido: 'Celular', transportes: 'internal' });
      const envelopes = await db.all<any>('SELECT id, tipo, credencial_id, s_cifrado, rec_hash FROM cofre_envelopes ORDER BY id');
      expect(envelopes.map((e) => [e.tipo, e.credencial_id, e.s_cifrado, e.rec_hash === null])).toEqual([
        ['recuperacao', null, null, false],
        ['prf', VETORES.es256.reg.id, null, true],
      ]);
      expect(blob(envelopes[0].rec_hash)).toEqual((await proofHash(deps, 'rec', seq(32, 6))).hash);
      expect(await db.first('SELECT tipo FROM cofre_eventos')).toEqual({ tipo: 'cofre-criado' });
      expect(await db.first('SELECT * FROM cofre_desafios')).toBeNull();
      expect(await (await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token })).json()).toEqual({ existe: true, congeladoAte: null, aparelhos: 1 });
    });

    it('com um aparelho no modo servidor, o S_i fica cifrado com a chave dos envelopes e volta igual', async () => {
      const { db, deps, desafio, post } = await entrou();
      const res = await post('/api/cofre', corpo([aparelho('es256', await desafio(), ENV_IDS[1]!, true), aparelho('rs256', await desafio(), ENV_IDS[2]!, false)]));
      expect(res.status).toBe(201);
      const env = await db.first<{ s_cifrado: Uint8Array; s_versao: number; tipo: string }>('SELECT s_cifrado, s_versao, tipo FROM cofre_envelopes WHERE id = ?', [ENV_IDS[2]!]);
      expect(env!.tipo).toBe('servidor');
      expect(base64url(blob(env!.s_cifrado))).not.toContain(b(32, 8));
      expect(await openServerSecret(deps, DONO.id, ENV_IDS[2]!, blob(env!.s_cifrado), env!.s_versao)).toEqual(seq(32, 8));
      // amarrado à conta e ao envelope: em outro lugar não abre
      await expect(openServerSecret(deps, OUTRA.id, ENV_IDS[2]!, blob(env!.s_cifrado), env!.s_versao)).rejects.toThrow();
      expect(await db.first('SELECT algoritmo FROM cofre_credenciais WHERE prf = 0')).toEqual({ algoritmo: -257 });
    });

    it('o desafio vale uma vez só, mesmo quando a criação dá errado', async () => {
      const { desafio, post } = await entrou();
      const id = await desafio();
      // a primeira tentativa gasta o desafio (a passkey é de outro aparelho que não bate com o id)
      const ruim = aparelho('es256', id, ENV_IDS[1]!, true, { credencial: { ...VETORES.es256.reg, id: b(32, 9) } });
      expect(await (await post('/api/cofre', corpo([ruim]))).json()).toMatchObject({ erro: 'passkey-invalida' });
      expect(await (await post('/api/cofre', corpo([aparelho('es256', id, ENV_IDS[1]!, true)]))).json()).toMatchObject({ erro: 'desafio-invalido' });
    });

    it('desafio vencido, de outra conta ou inventado: recusado', async () => {
      const { desafio, post, advance } = await entrou();
      const vencido = await desafio();
      advance(120_000);
      expect(await (await post('/api/cofre', corpo([aparelho('es256', vencido, ENV_IDS[1]!, true)]))).json()).toMatchObject({ erro: 'desafio-invalido' });
      const outro = await entrou();
      const deOutra = await outro.desafio(OUTRA.id);
      expect(await (await outro.post('/api/cofre', corpo([aparelho('es256', deOutra, ENV_IDS[1]!, true)]))).json()).toMatchObject({ erro: 'desafio-invalido' });
      expect(await (await outro.post('/api/cofre', corpo([aparelho('es256', crypto.randomUUID(), ENV_IDS[1]!, true)]))).json()).toMatchObject({ erro: 'desafio-invalido' });
      const curto = await entrou();
      const quaseVencido = await curto.desafio(DONO.id, undefined, new Date(curto.deps.now().getTime() + 1000));
      curto.advance(1000);
      expect(await (await curto.post('/api/cofre', corpo([aparelho('es256', quaseVencido, ENV_IDS[1]!, true)]))).json()).toMatchObject({ erro: 'desafio-invalido' });
    });

    it('não cria dois cofres na mesma conta', async () => {
      const { desafio, post } = await entrou();
      expect((await post('/api/cofre', corpo([aparelho('es256', await desafio(), ENV_IDS[1]!, true)]))).status).toBe(201);
      expect(await (await post('/api/cofre', corpo([aparelho('rs256', await desafio(), ENV_IDS[2]!, true)]))).json()).toMatchObject({ erro: 'cofre-existe' });
    });

    it('o mesmo aparelho duas vezes: recusado', async () => {
      const { desafio, post } = await entrou();
      const res = await post('/api/cofre', corpo([aparelho('es256', await desafio(), ENV_IDS[1]!, true), aparelho('es256', await desafio(), ENV_IDS[2]!, true)]));
      expect(await res.json()).toMatchObject({ erro: 'passkey-repetida' });
    });

    it('recusa cripto mais fraca que o mínimo e selados do tamanho errado', async () => {
      const { desafio, post, db } = await entrou();
      const um = async () => [aparelho('es256', await desafio(), ENV_IDS[1]!, true)];
      const casos: Record<string, unknown>[] = [
        { versao: 2 },
        { kdf: { m: 65535, t: 3, p: 1 } },
        { kdf: { m: 65536, t: 2, p: 1 } },
        { kdf: { m: 4 * 1024 * 1024, t: 3, p: 1 } },
        { kdf: { m: '65536', t: 3, p: 1 } },
        { sal: b(15, 1) },
        { v: b(60, 2) },
        { kAuth: b(31, 3) },
        { manifesto: b(540, 4) },
        { manifesto: b(541 + 100, 4) },
        { recuperacao: { id: ENV_IDS[0], envelope: b(61, 5), kRec: b(16, 6) } },
        { recuperacao: { id: 'nao-e-uuid', envelope: b(61, 5), kRec: b(32, 6) } },
        { sal: b(16, 1) + '=' },
      ];
      for (const extra of casos) {
        const res = await post('/api/cofre', corpo(await um(), extra));
        expect(await res.json(), JSON.stringify(extra)).toMatchObject({ erro: 'pedido-invalido' });
      }
      expect(await db.first('SELECT * FROM cofre_contas')).toBeNull();
    });

    it('PRF e segredo do servidor: um ou outro, nunca os dois nem nenhum', async () => {
      const { desafio, post } = await entrou();
      expect(await (await post('/api/cofre', corpo([aparelho('es256', await desafio(), ENV_IDS[1]!, true, { s: b(32, 8) })]))).json()).toMatchObject({ erro: 'pedido-invalido' });
      const semS = aparelho('es256', await desafio(), ENV_IDS[1]!, false);
      delete (semS as Record<string, unknown>)['s'];
      expect(await (await post('/api/cofre', corpo([semS]))).json()).toMatchObject({ erro: 'pedido-invalido' });
      expect(await (await post('/api/cofre', corpo([aparelho('es256', await desafio(), ENV_IDS[1]!, 'sim' as unknown as boolean)]))).json()).toMatchObject({ erro: 'pedido-invalido' });
    });

    it('nenhum aparelho, três aparelhos ou envelopes com o mesmo id: recusado', async () => {
      const { desafio, post } = await entrou();
      expect(await (await post('/api/cofre', corpo([]))).json()).toMatchObject({ erro: 'pedido-invalido' });
      const tres = [aparelho('es256', await desafio(), ENV_IDS[1]!, true), aparelho('rs256', await desafio(), ENV_IDS[2]!, true), aparelho('rs256', await desafio(), ENV_IDS[0]!, true)];
      expect(await (await post('/api/cofre', corpo(tres))).json()).toMatchObject({ erro: 'pedido-invalido' });
      expect(await (await post('/api/cofre', corpo([aparelho('es256', await desafio(), ENV_IDS[0]!, true)]))).json()).toMatchObject({ erro: 'pedido-invalido' });
    });

    it('sem a chave dos envelopes, o aparelho no modo servidor não entra (503), e nada é gravado', async () => {
      const { desafio, post, db } = await entrou({ COFRE_ENVELOPES_1: '' });
      const res = await post('/api/cofre', corpo([aparelho('rs256', await desafio(), ENV_IDS[1]!, false)]));
      expect(await res.json()).toMatchObject({ erro: 'cofre-sem-segredo' });
      expect(await db.first('SELECT * FROM cofre_contas')).toBeNull();
    });

    it('sem sessão de entrada, nada', async () => {
      const { post } = await entrou();
      expect((await post('/api/cofre/registro', {}, 'x'.repeat(43))).status).toBe(401);
      expect((await post('/api/cofre', corpo([]), 'x'.repeat(43))).status).toBe(401);
    });

    it('freio: 30 desafios por hora por conta', async () => {
      const { post } = await entrou();
      for (let i = 0; i < 30; i++) expect((await post('/api/cofre/registro', {})).status).toBe(200);
      expect(await (await post('/api/cofre/registro', {})).json()).toMatchObject({ erro: 'muitas-tentativas' });
    });

    it('depois de criado, o desafio de registro usa o user.id guardado e exclui o aparelho que já existe', async () => {
      const { desafio, post } = await entrou();
      await post('/api/cofre', corpo([aparelho('es256', await desafio(), ENV_IDS[1]!, true)]));
      const { publicKey } = (await (await post('/api/cofre/registro', {})).json()) as { publicKey: any };
      expect(publicKey.excludeCredentials).toEqual([{ type: 'public-key', id: VETORES.es256.reg.id, transports: ['internal'] }]);
    });
  });
}
