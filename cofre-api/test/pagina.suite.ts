import { describe, expect, it } from 'vitest';
import { deBase64url } from '../../projects/cofre/src/core/bytes';
import { lerCodigo } from '../../projects/cofre/src/core/codigo';
import { montarCofre } from '../../projects/cofre/src/core/criar';
import { abrirCofre, abrirEnvelope, abrirRecuperacao, chaveDaSenha, decifrarManifesto, KDF_PADRAO, provaDaSenha, provaDoCodigo } from '../../projects/cofre/src/core/crypto';
import type { PasskeyRegistrada } from '../../projects/cofre/src/core/passkey';
import { base64url } from '../src/domain/bytes';
import { DONO, VERIFIER } from './harness';
import type { Setup } from './suite';
import { ORIGEM, RP_ID, VETORES } from './webauthn-vetores';

/**
 * A página e a API juntas: o que `projects/cofre/src/core/criar.ts` monta vai para a API de verdade, com
 * as passkeys reais dos vetores, e depois abre pelo caminho que a página vai usar (8.1): o desafio, a
 * passkey (o envelope do aparelho, e o S_i no modo servidor), a prova da senha, V e o manifesto. Também
 * pelo código de recuperação. Se a página e a API discordarem de um formato, isto quebra.
 *
 * Só no Node: o Argon2id da página é WASM (hash-wasm), e o runtime dos Workers não compila WASM em
 * tempo de execução.
 */
const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);
const b = (texto: string) => deBase64url(texto)!;
const LOCAL = { COFRE_ORIGEM: ORIGEM, COFRE_RP_ID: RP_ID, COFRE_ENVELOPES_1: base64url(seq(32, 200)), COTA_LINHAS_DIA: '100000' };
const SENHA = 'cavalo-ponte-relogio-nuvem-pipoca-trevo';
/** O segredo que o PRF do celular daria (o autenticador virtual dos vetores não tinha PRF). */
const PRF_CELULAR = seq(32, 150);

export function paginaSuite(label: string, setup: Setup) {
  async function criado() {
    const ctx = await setup(LOCAL);
    const post = (path: string, body: unknown, token?: string) => ctx.call('POST', path, body, { origin: ORIGEM, token });
    const entrar = async () =>
      (await (await post('/api/entrar', { codigo: 'codigo-sub-dono', verificador: VERIFIER, aparelho: 'Chrome no Windows' })).json()) as { token: string; usuario: string };
    /** Um desafio no banco com os bytes dos vetores, como se o servidor o tivesse dado. */
    const desafio = async (tipo: 'registro' | 'assinatura', bytes: Uint8Array) => {
      const id = crypto.randomUUID();
      await ctx.db.batch([
        { sql: 'INSERT INTO cofre_desafios (id, usuario_id, tipo, desafio, expira_em) VALUES (?, ?, ?, ?, ?)', params: [id, DONO.id, tipo, bytes, new Date(ctx.deps.now().getTime() + 120_000).toISOString()] },
      ]);
      return id;
    };
    const passkey = async (alg: 'es256' | 'rs256', prf: Uint8Array | null): Promise<PasskeyRegistrada> => ({
      desafio: await desafio('registro', seq(32, 1)),
      credencial: { ...VETORES[alg].reg, transports: ['internal'] },
      prf: prf ? (prf.slice() as Uint8Array<ArrayBuffer>) : null,
      prfLigado: prf !== null,
    });

    const entrada = await entrar();
    expect(entrada.usuario).toBe(DONO.id);
    const montado = await montarCofre({
      usuario: entrada.usuario,
      senha: SENHA,
      aparelhos: [
        { passkey: await passkey('es256', PRF_CELULAR), apelido: 'Celular' },
        { passkey: await passkey('rs256', null), apelido: 'PC' },
      ],
      aparelhoAgora: 'PC',
      agora: ctx.deps.now(),
    });
    const res = await post('/api/cofre', montado.corpo, entrada.token);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      criado: true,
      aparelhos: [
        { id: VETORES.es256.reg.id, apelido: 'Celular', prf: true },
        { id: VETORES.rs256.reg.id, apelido: 'PC', prf: false },
      ],
    });

    /** O desafio do cofre (o que a página pede primeiro): o sal e o Argon2id. */
    type DoCofre = { sal: string; kdf: typeof KDF_PADRAO };
    const desafioDoCofre = async (token: string) => (await (await post('/api/cofre/desafio', {}, token)).json()) as DoCofre;
    /** Depois da passkey, a senha: a prova vai para a API, e V e o manifesto voltam abertos. */
    const abrir = async (m: Uint8Array, token: string, doCofre: DoCofre, senha = SENHA) => {
      const kSenha = await chaveDaSenha(senha, b(doCofre.sal), doCofre.kdf);
      const aberto = await post('/api/cofre/abrir', { kAuth: base64url(await provaDaSenha(kSenha, m)) }, token);
      expect(aberto.status).toBe(200);
      const corpo = (await aberto.json()) as { v: string; manifesto: string; contador: number };
      const chave = await abrirCofre(kSenha, m, DONO.id, b(corpo.v));
      return decifrarManifesto(chave, DONO.id, corpo.contador, b(corpo.manifesto));
    };
    /** A passkey assina (com o desafio dos vetores no lugar do que a API deu) e volta o envelope do aparelho. */
    const chave = async (token: string, alg: 'es256' | 'rs256') =>
      (await (await post('/api/cofre/chave', { desafio: await desafio('assinatura', seq(32, 33)), assinatura: VETORES[alg].assinaturas[0] }, token)).json()) as {
        envelope: { id: string; dados: string };
        tipo: string;
        s?: string;
      };
    return { ...ctx, post, entrar, desafioDoCofre, abrir, chave, codigo: montado.codigo };
  }

  describe(`A página e a API juntas (${label})`, () => {
    it('o cofre que a página monta é aceito e abre pelo celular, com o segredo do PRF', async () => {
      const { entrar, desafioDoCofre, chave, abrir } = await criado();
      const { token } = await entrar();
      const doCofre = await desafioDoCofre(token);
      const celular = await chave(token, 'es256');
      expect(celular.tipo).toBe('prf');
      expect(celular.s).toBeUndefined();
      const m = await abrirEnvelope(PRF_CELULAR, DONO.id, celular.envelope.id, b(celular.envelope.dados));
      expect(await abrir(m, token, doCofre)).toEqual({ contador: 0, itens: {}, lixeira: {}, mudadoEm: '2026-10-21T15:00:00.000Z', aparelho: 'PC' });
    });

    it('e pelo PC no modo servidor, com o S_i que o servidor devolve depois da assinatura', async () => {
      const { entrar, desafioDoCofre, chave, abrir } = await criado();
      const { token } = await entrar();
      const doCofre = await desafioDoCofre(token);
      const pc = await chave(token, 'rs256');
      expect(pc.tipo).toBe('servidor');
      const m = await abrirEnvelope(b(pc.s!), DONO.id, pc.envelope.id, b(pc.envelope.dados));
      expect((await abrir(m, token, doCofre)).contador).toBe(0);
    });

    it('e pelo código do kit de emergência, no lugar da passkey', async () => {
      const { entrar, desafioDoCofre, post, abrir, codigo } = await criado();
      const { token } = await entrar();
      const doCofre = await desafioDoCofre(token);
      const bytes = await lerCodigo(codigo);
      const rec = (await (await post('/api/cofre/recuperar', { kRec: base64url(await provaDoCodigo(bytes)) }, token)).json()) as { envelope: { dados: string } };
      const m = await abrirRecuperacao(bytes, DONO.id, b(rec.envelope.dados));
      expect((await abrir(m, token, doCofre)).itens).toEqual({});
    });

    it('com a senha errada, a API recusa a prova que a página calcula', async () => {
      const { entrar, desafioDoCofre, chave, post } = await criado();
      const { token } = await entrar();
      const doCofre = await desafioDoCofre(token);
      const celular = await chave(token, 'es256');
      const m = await abrirEnvelope(PRF_CELULAR, DONO.id, celular.envelope.id, b(celular.envelope.dados));
      const errada = await chaveDaSenha('cavalo-ponte-relogio-nuvem-pipoca-trevos', b(doCofre.sal), doCofre.kdf);
      const res = await post('/api/cofre/abrir', { kAuth: base64url(await provaDaSenha(errada, m)) }, token);
      expect(await res.json()).toMatchObject({ erro: 'senha-errada' });
    });
  });
}
