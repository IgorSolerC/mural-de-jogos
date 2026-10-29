import { describe, expect, it } from 'vitest';
import { deBase64url } from '../../projects/cofre/src/core/bytes';
import { lerCodigo } from '../../projects/cofre/src/core/codigo';
import { montarCofre } from '../../projects/cofre/src/core/criar';
import { abrirCofre, abrirEnvelope, abrirRecuperacao, chaveDaSenha, decifrarManifesto, KDF_PADRAO, provaDaSenha, provaDoCodigo } from '../../projects/cofre/src/core/crypto';
import { abrir, assinar, chaveDoMeio, chaveDoMeioPeloCodigo, senhaDoDesafio } from '../../projects/cofre/src/core/abrir';
import { ApiCofre } from '../../projects/cofre/src/core/api';
import { abrirPelaCarencia, esquecerCarencia, guardarCarencia, lerCarencia, prepararCarencia } from '../../projects/cofre/src/core/carencia';
import { confirmacaoPelaPasskey, confirmacaoPelaSenha } from '../../projects/cofre/src/core/confirmar';
import { novoCodigo, porAparelho, trocarSenha } from '../../projects/cofre/src/core/gerenciar';
import { apagarDeVez, ErroConflito, lerItens, limparLapides, paraALixeira, restaurar, salvarItem } from '../../projects/cofre/src/core/itens';
import type { Autenticador, PasskeyRegistrada } from '../../projects/cofre/src/core/passkey';
import { createApp } from '../src/app';
import { base64url } from '../src/domain/bytes';
import { DONO, NOW, VERIFIER } from './harness';
import type { Setup } from './suite';
import { ORIGEM, RP_ID, VETORES } from './webauthn-vetores';

/**
 * A página e a API juntas: o que `projects/cofre/src/core/criar.ts` monta vai para a API de verdade, com
 * as passkeys reais dos vetores, e depois abre pelo caminho que a página vai usar (8.1): o desafio, a
 * passkey (o envelope do aparelho, e o S_i no modo servidor), a prova da senha, V e o manifesto. Também
 * pelo código de recuperação. Depois, abrir e usar com a lógica da página (`core/abrir.ts` e
 * `core/itens.ts`): guardar, mudar, lixeira, voltar, apagar de vez, o conflito entre dois aparelhos, as
 * lápides e um servidor que troca ou some com um item. Se a página e a API discordarem de um formato,
 * isto quebra.
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

  /** O cofre criado pela página, e a API da página falando com a API de verdade (a mesma do teste). */
  async function paraAbrir() {
    const ctx = await criado();
    const app = createApp(ctx.deps);
    const novaApi = () =>
      new ApiCofre(((url: RequestInfo | URL, init?: RequestInit) =>
        Promise.resolve(app.request(String(url), { ...init, headers: { ...(init?.headers as Record<string, string>), Origin: ORIGEM } }))) as typeof fetch);
    /**
     * Uma passkey dos vetores: ao assinar, troca no banco o desafio de assinatura pelos bytes que o vetor
     * assinou (o autenticador virtual não assina o desafio que o servidor sorteou agora).
     */
    const autenticador = (alg: 'es256' | 'rs256', n: 0 | 1, prf: Uint8Array | null): Autenticador => ({
      criar: async () => null,
      pegar: async () => {
        await ctx.db.batch([{ sql: "UPDATE cofre_desafios SET desafio = ? WHERE tipo = 'assinatura'", params: [seq(32, n === 0 ? 33 : 65)] }]);
        const v = VETORES[alg].assinaturas[n];
        const buf = (t: string) => b(t).slice().buffer;
        return {
          type: 'public-key',
          rawId: buf(v.id),
          response: { clientDataJSON: buf(v.clientDataJSON), authenticatorData: buf(v.authenticatorData), signature: buf(v.signature), userHandle: buf(v.userHandle) },
          getClientExtensionResults: () => (prf ? { prf: { results: { first: prf.slice().buffer } } } : {}),
        } as unknown as Credential;
      },
    });
    /** Entra e abre como a página vai fazer: o desafio, e a passkey e o Argon2id ao mesmo tempo. */
    const abrirPelaPagina = async (alg: 'es256' | 'rs256', n: 0 | 1, aparelho: string, senha = SENHA) => {
      const api = novaApi();
      const { token } = await ctx.entrar();
      api.usarToken(token);
      const desafio = await api.desafioDeAbrir();
      const [assinada, kSenha] = await Promise.all([assinar(desafio, RP_ID, autenticador(alg, n, alg === 'es256' ? PRF_CELULAR : null)), senhaDoDesafio(senha, desafio)]);
      const m = await chaveDoMeio(api, assinada, DONO.id);
      return { api, cofre: await abrir(api, DONO.id, kSenha, m, aparelho, desafio) };
    };
    /** Abre pelo código do kit, com a senha. */
    const abrirPeloCodigo = async (codigoTexto: string, senha = SENHA) => {
      const api = novaApi();
      api.usarToken((await ctx.entrar()).token);
      const desafio = await api.desafioDeAbrir();
      const m = await chaveDoMeioPeloCodigo(api, codigoTexto, DONO.id);
      return { api, cofre: await abrir(api, DONO.id, await senhaDoDesafio(senha, desafio), m, 'PC', desafio) };
    };
    return { ...ctx, novaApi, abrirPelaPagina, abrirPeloCodigo, autenticador };
  }

  describe(`Abrir e usar o cofre pela página (${label})`, () => {
    it('abre pelo celular (PRF), guarda, muda, põe na lixeira, volta e apaga de vez', async () => {
      const { abrirPelaPagina } = await paraAbrir();
      const { api, cofre } = await abrirPelaPagina('es256', 0, 'Celular');
      expect(cofre.contador).toBe(0);
      expect(cofre.recuperada).toBe(false);
      // as passkeys do cofre ficam com o aberto, para pedir uma de novo antes de mostrar uma senha protegida (17.18)
      expect(cofre.passkeys?.length).toBe(2);
      expect(await lerItens(api, cofre)).toEqual([]);

      const campos = { titulo: 'Banco', usuario: 'igor', senha: 'senha-1', url: 'https://banco.exemplo', descricao: 'agência 0001' };
      const salvo = await salvarItem(api, cofre, campos, null);
      expect(cofre.contador).toBe(1);
      let lista = await lerItens(api, cofre);
      expect(lista.map((i) => [i.id, i.versao, i.naLixeira, i.item?.titulo, i.item?.senha])).toEqual([[salvo.id, 1, false, 'Banco', 'senha-1']]);

      const mudado = await salvarItem(api, cofre, { ...campos, senha: 'senha-2' }, lista[0]!);
      expect(mudado.versao).toBe(2);
      lista = await lerItens(api, cofre);
      expect(lista[0]!.item!.senha).toBe('senha-2');
      expect(lista[0]!.item!.historico.map((h) => h.senha)).toEqual(['senha-1']);

      await paraALixeira(api, cofre, lista[0]!);
      lista = await lerItens(api, cofre);
      expect(lista[0]!.naLixeira).toBe(true);
      expect(cofre.manifesto.lixeira).toEqual({ [salvo.id]: 2 });
      await restaurar(api, cofre, lista[0]!);
      lista = await lerItens(api, cofre);
      expect(lista[0]!.naLixeira).toBe(false);
      await paraALixeira(api, cofre, lista[0]!);
      lista = await lerItens(api, cofre);
      await apagarDeVez(api, cofre, lista[0]!);
      expect(await lerItens(api, cofre)).toEqual([]);
      expect(cofre.contador).toBe(6);
    });

    it('a carência (17.23): abre pela passkey com ela, e depois, sem o Google e sem a passkey, só com a senha', async () => {
      const { novaApi, entrar, autenticador } = await paraAbrir();
      const armario = new Map<string, string>();
      const guarda = { getItem: (c: string) => armario.get(c) ?? null, setItem: (c: string, v: string) => void armario.set(c, v), removeItem: (c: string) => void armario.delete(c) };
      const api = novaApi();
      api.usarToken((await entrar()).token);
      const desafio = await api.desafioDeAbrir();
      expect(desafio.carencia).toBe(true);
      const [assinada, kSenha] = await Promise.all([assinar(desafio, RP_ID, autenticador('es256', 0, PRF_CELULAR)), senhaDoDesafio(SENHA, desafio)]);
      const m = await chaveDoMeio(api, assinada, DONO.id);
      const nova = await prepararCarencia(m, DONO.id, DONO.code, null);
      const aberto = await abrir(api, DONO.id, kSenha, m, 'Celular', desafio, nova.corpo);
      expect(aberto.carencia?.id).toBe(nova.corpo.id);
      guardarCarencia(guarda, nova.guardavel(aberto.carencia!.expiraEm, false));
      await salvarItem(api, aberto, { titulo: 'Banco', usuario: 'igor', senha: 's', url: '', descricao: '' }, null);

      // o relógio do servidor dos testes está parado em 21/10: a leitura usa a mesma hora
      const carencia = lerCarencia(guarda, NOW.getTime())!;
      expect(carencia).not.toBeNull();
      await expect(abrirPelaCarencia(novaApi(), carencia, 'outra-senha', 'Chrome no Android', 'Celular')).rejects.toMatchObject({ codigo: 'senha-errada' });
      const outra = novaApi();
      const cofre = await abrirPelaCarencia(outra, carencia, SENHA, 'Chrome no Android', 'Celular');
      expect((await lerItens(outra, cofre)).map((i) => i.item?.titulo)).toEqual(['Banco']);
      // esquecida, não abre mais
      await esquecerCarencia(novaApi(), guarda, NOW.getTime());
      expect(armario.size).toBe(0);
      await expect(abrirPelaCarencia(novaApi(), carencia, SENHA, 'Chrome no Android', 'Celular')).rejects.toMatchObject({ codigo: 'carencia-invalida' });
    });

    it('abre pelo PC no modo servidor, e pelo código do kit', async () => {
      const { abrirPelaPagina, novaApi, entrar, codigo } = await paraAbrir();
      const pc = await abrirPelaPagina('rs256', 0, 'PC');
      await salvarItem(pc.api, pc.cofre, { titulo: 'E-mail', usuario: '', senha: 'x', url: '', descricao: '' }, null);

      const api = novaApi();
      api.usarToken((await entrar()).token);
      const desafio = await api.desafioDeAbrir();
      const m = await chaveDoMeioPeloCodigo(api, codigo.toLowerCase().replace(/-/g, ' '), DONO.id);
      const cofre = await abrir(api, DONO.id, await senhaDoDesafio(SENHA, desafio), m, 'PC');
      expect(cofre.recuperada).toBe(true);
      expect((await lerItens(api, cofre)).map((i) => i.item?.titulo)).toEqual(['E-mail']);
    });

    it('dois aparelhos gravando: o segundo leva um conflito, relê e grava (nada se perde)', async () => {
      const { abrirPelaPagina } = await paraAbrir();
      const celular = await abrirPelaPagina('es256', 0, 'Celular');
      const pc = await abrirPelaPagina('rs256', 0, 'PC');
      await salvarItem(celular.api, celular.cofre, { titulo: 'do celular', usuario: '', senha: '1', url: '', descricao: '' }, null);
      await expect(salvarItem(pc.api, pc.cofre, { titulo: 'do PC', usuario: '', senha: '2', url: '', descricao: '' }, null)).rejects.toBeInstanceOf(ErroConflito);
      expect((await lerItens(pc.api, pc.cofre)).map((i) => i.item?.titulo)).toEqual(['do celular']);
      await salvarItem(pc.api, pc.cofre, { titulo: 'do PC', usuario: '', senha: '2', url: '', descricao: '' }, null);
      const titulos = (await lerItens(celular.api, celular.cofre)).map((i) => i.item?.titulo).sort();
      expect(titulos).toEqual(['do PC', 'do celular']);
      expect(celular.cofre.manifesto.aparelho).toBe('PC');
    });

    it('a lápide de um item que passou dos 30 dias na lixeira sai do manifesto', async () => {
      const { abrirPelaPagina, db } = await paraAbrir();
      const { api, cofre } = await abrirPelaPagina('es256', 0, 'Celular');
      const salvo = await salvarItem(api, cofre, { titulo: 'velho', usuario: '', senha: '', url: '', descricao: '' }, null);
      await paraALixeira(api, cofre, salvo);
      // o que a limpeza diária faz depois de 30 dias: apaga os dados e deixa o id e a versão
      await db.batch([{ sql: 'UPDATE cofre_itens SET dados = ? WHERE id = ?', params: [new Uint8Array(0), salvo.id] }]);
      const lista = await lerItens(api, cofre);
      expect(lista).toEqual([{ id: salvo.id, versao: 1, naLixeira: true, naLixeiraDesde: expect.any(String), item: null }]);
      expect(await limparLapides(api, cofre, lista)).toEqual([]);
      expect(await lerItens(api, cofre)).toEqual([]);
      expect(cofre.manifesto.lixeira).toEqual({});
    });

    it('um servidor que troca, some ou volta um item é pego (nada aparece)', async () => {
      const { abrirPelaPagina, db } = await paraAbrir();
      const { api, cofre } = await abrirPelaPagina('es256', 0, 'Celular');
      const a = await salvarItem(api, cofre, { titulo: 'a', usuario: '', senha: '1', url: '', descricao: '' }, null);
      const c = await salvarItem(api, cofre, { titulo: 'c', usuario: '', senha: '2', url: '', descricao: '' }, null);
      const dados = async (id: string) => (await db.first<{ dados: Uint8Array }>('SELECT dados FROM cofre_itens WHERE id = ?', [id]))!.dados;
      const [da, dc] = [await dados(a.id), await dados(c.id)];
      // os dados de um item no lugar do outro: o AAD (o id) não bate
      await db.batch([{ sql: 'UPDATE cofre_itens SET dados = ? WHERE id = ?', params: [dc, a.id] }]);
      await expect(lerItens(api, cofre)).rejects.toMatchObject({ motivo: 'abrir' });
      await db.batch([{ sql: 'UPDATE cofre_itens SET dados = ? WHERE id = ?', params: [da, a.id] }]);
      // um item sumido: o manifesto diz que ele existe
      await db.batch([{ sql: 'DELETE FROM cofre_itens WHERE id = ?', params: [c.id] }]);
      await expect(lerItens(api, cofre)).rejects.toMatchObject({ motivo: 'manifesto' });
    });
  });

  describe(`Gerenciar o cofre pela página (${label})`, () => {
    it('um código novo abre; o antigo para de valer na hora', async () => {
      const { abrirPelaPagina, abrirPeloCodigo, codigo } = await paraAbrir();
      const { api, cofre } = await abrirPelaPagina('es256', 0, 'Celular');
      const novo = await novoCodigo(api, cofre, await confirmacaoPelaSenha(cofre, SENHA));
      expect(novo).not.toBe(codigo);
      expect((await abrirPeloCodigo(novo)).cofre.recuperada).toBe(true);
      await expect(abrirPeloCodigo(codigo)).rejects.toMatchObject({ status: expect.any(Number) });
    });

    it('trocar a senha: a nova abre, a velha não; a senha atual errada não troca nada', async () => {
      const { abrirPelaPagina } = await paraAbrir();
      const { api, cofre } = await abrirPelaPagina('es256', 0, 'Celular');
      await expect(trocarSenha(api, cofre, 'nao-e-esta', 'outra-senha-forte-de-teste')).rejects.toMatchObject({ motivo: 'abrir' });
      await trocarSenha(api, cofre, SENHA, 'outra-senha-forte-de-teste');
      expect((await abrirPelaPagina('es256', 1, 'Celular', 'outra-senha-forte-de-teste')).cofre.contador).toBe(0);
      await expect(abrirPelaPagina('rs256', 0, 'PC', SENHA)).rejects.toMatchObject({ codigo: 'senha-errada' });
    });

    it('tirar e pôr aparelhos, sem nunca tirar o último', async () => {
      const { abrirPelaPagina, db } = await paraAbrir();
      const { api, cofre } = await abrirPelaPagina('es256', 0, 'Celular');
      expect((await api.aparelhos()).aparelhos.map((a) => [a.apelido, a.prf])).toEqual([
        ['Celular', true],
        ['PC', false],
      ]);
      await api.tirarAparelho(VETORES.rs256.reg.id, await confirmacaoPelaSenha(cofre, SENHA));
      await expect(api.tirarAparelho(VETORES.es256.reg.id, await confirmacaoPelaSenha(cofre, SENHA))).rejects.toMatchObject({ codigo: 'ultimo-aparelho' });
      // pôr de novo o PC (modo servidor), com o desafio de registro trocado pelos bytes do vetor
      const desafio = await api.desafioDeRegistro();
      await db.batch([{ sql: "UPDATE cofre_desafios SET desafio = ? WHERE tipo = 'registro'", params: [seq(32, 1)] }]);
      const passkey: PasskeyRegistrada = { desafio: desafio.desafio, credencial: { ...VETORES.rs256.reg, transports: ['internal'] }, prf: null, prfLigado: false };
      expect(await porAparelho(api, cofre, { passkey, apelido: 'PC de novo' }, await confirmacaoPelaSenha(cofre, SENHA))).toEqual({ id: VETORES.rs256.reg.id, prf: false });
      expect((await api.aparelhos()).aparelhos.map((a) => a.apelido)).toEqual(['Celular', 'PC de novo']);
      // e o PC posto agora abre o cofre
      expect((await abrirPelaPagina('rs256', 0, 'PC')).cofre.contador).toBe(0);
    });

    it('as sessões, trancar todos, o histórico e apagar o cofre', async () => {
      const { abrirPelaPagina, entrar, novaApi } = await paraAbrir();
      const { api } = await abrirPelaPagina('es256', 0, 'Celular');
      const { sessoes } = await api.sessoes();
      expect(sessoes.filter((s) => s.atual).map((s) => s.tipo)).toEqual(['cofre']);
      expect(JSON.stringify(sessoes)).not.toMatch(/token|hash/);
      const tipos = (await api.eventos()).eventos.map((e) => e.tipo);
      expect(tipos).toEqual(expect.arrayContaining(['cofre-criado', 'passkey-usada', 'aberto']));
      await api.trancarTodos();
      await expect(api.itens()).rejects.toMatchObject({ status: 401 });

      const outro = await abrirPelaPagina('es256', 1, 'Celular');
      const confirmar = await confirmacaoPelaSenha(outro.cofre, SENHA);
      await expect(outro.api.apagarCofre('apagar', confirmar)).rejects.toMatchObject({ codigo: 'falta-confirmacao' });
      await outro.api.apagarCofre('APAGAR', confirmar);
      const depois = novaApi();
      depois.usarToken((await entrar()).token);
      expect(await depois.estado()).toEqual({ existe: false, congeladoAte: null, aparelhos: 0, pin: false });
    });

    it('confirmar de novo: a passkey pelo desafio do servidor, ou a senha (conferida aqui antes, sem gastar tentativas)', async () => {
      const { abrirPelaPagina, autenticador, db } = await paraAbrir();
      const { api, cofre } = await abrirPelaPagina('es256', 0, 'Celular');
      // sem a confirmação, o servidor não troca nada (a página de antes desta regra)
      await expect(api.novoCodigo({ id: crypto.randomUUID(), envelope: base64url(seq(61, 1)), kRec: base64url(seq(32, 2)) }, undefined as never)).rejects.toMatchObject({
        status: 403,
        codigo: 'falta-confirmar',
      });
      // a senha errada nem sai da página
      await expect(confirmacaoPelaSenha(cofre, 'nao-e-esta')).rejects.toMatchObject({ motivo: 'abrir' });
      expect(await db.first("SELECT 1 AS um FROM freios WHERE acao = 'confirmar-senha'")).toBeNull();
      // a passkey do PC (modo servidor, sem PRF) confirma
      const pelaPasskey = await confirmacaoPelaPasskey(api, RP_ID, autenticador('rs256', 0, null));
      expect(Object.keys(pelaPasskey).sort()).toEqual(['assinatura', 'desafio']);
      expect(typeof (await novoCodigo(api, cofre, pelaPasskey))).toBe('string');
      // e não serve duas vezes
      await expect(novoCodigo(api, cofre, pelaPasskey)).rejects.toMatchObject({ codigo: 'desafio-invalido' });
      const pelaSenha = await confirmacaoPelaSenha(cofre, SENHA);
      expect(typeof (await novoCodigo(api, cofre, pelaSenha))).toBe('string');
      // o desafio de outro endereço não vai para a passkey
      await expect(confirmacaoPelaPasskey(api, 'outro.exemplo', autenticador('rs256', 1, null))).rejects.toMatchObject({ motivo: 'formato' });
    });

    it('aberto pelo código, sem passkey nenhuma à mão: a senha mestra põe um aparelho e gera o código novo', async () => {
      const { abrirPeloCodigo, abrirPelaPagina, codigo, db } = await paraAbrir();
      const { api, cofre } = await abrirPeloCodigo(codigo);
      expect(cofre.recuperada).toBe(true);
      await api.tirarAparelho(VETORES.rs256.reg.id, await confirmacaoPelaSenha(cofre, SENHA));
      const desafio = await api.desafioDeRegistro();
      await db.batch([{ sql: "UPDATE cofre_desafios SET desafio = ? WHERE tipo = 'registro'", params: [seq(32, 1)] }]);
      const passkey: PasskeyRegistrada = { desafio: desafio.desafio, credencial: { ...VETORES.rs256.reg, transports: ['internal'] }, prf: null, prfLigado: false };
      await porAparelho(api, cofre, { passkey, apelido: 'PC novo' }, await confirmacaoPelaSenha(cofre, SENHA));
      const novo = await novoCodigo(api, cofre, await confirmacaoPelaSenha(cofre, SENHA));
      // o aparelho novo abre, e o código novo também
      expect((await abrirPelaPagina('rs256', 0, 'PC')).cofre.contador).toBe(0);
      expect((await abrirPeloCodigo(novo)).cofre.recuperada).toBe(true);
    });
  });
}
