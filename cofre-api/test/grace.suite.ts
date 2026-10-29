import { describe, expect, it } from 'vitest';
import { base64url } from '../src/domain/bytes';
import { cleanup } from '../src/domain/cleanup';
import { endGraces } from '../src/domain/grace';
import { hashToken } from '../src/domain/session';
import { DONO } from './harness';
import { CODIGO, SENHA, cofrePronto } from './open.suite';
import type { Setup } from './suite';
import { ORIGEM, VETORES } from './webauthn-vetores';

const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);
const b = (n: number, ini: number) => base64url(seq(n, ini));
const ERRADA = b(32, 99);
/** A carência que a página sela ao abrir com a passkey: o id, o token do aparelho e M selada com G. */
const CARENCIA = { id: '7c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b70', token: 'T'.repeat(43), envelope: b(61, 21) };
const OUTRA_CARENCIA = { id: '7c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b71', token: 'U'.repeat(43), envelope: b(61, 22) };
const PELA_SENHA = { confirmar: { kAuth: SENHA } };

/** A carência do aparelho (PLANO-COFRE.md, 17.23): abrir só com a senha por 24 horas depois do Google e da passkey. */
export function graceSuite(label: string, setup: Setup) {
  /** O cofre pronto e aberto pelo celular, com a carência pedida; devolve a sessão do cofre e a resposta. */
  async function comCarencia(env: Record<string, string> = {}) {
    const ctx = await cofrePronto(setup, env);
    const entrada = await ctx.entrar();
    await ctx.chave(entrada);
    const res = await ctx.post('/api/cofre/abrir', { kAuth: SENHA, carencia: CARENCIA }, entrada);
    expect(res.status).toBe(200);
    const aberto = (await res.json()) as { token: string; carencia: { id: string; expiraEm: string } | null };
    const pedir = (method: string, path: string, body?: unknown, t = aberto.token) => ctx.call(method, path, body, { origin: ORIGEM, token: t });
    /** Entra pela carência (sem o Google e sem a passkey). */
    const pelaCarencia = (token = CARENCIA.token, call = ctx.call) => call('POST', '/api/carencia', { token, aparelho: 'Chrome no Android' }, { origin: ORIGEM });
    /** Entra pela carência e tenta a senha. */
    const abrirPelaCarencia = async (kAuth: string, extra: Record<string, unknown> = {}) => {
      const res = await pelaCarencia();
      if (res.status !== 200) return res;
      const { token } = (await res.json()) as { token: string };
      return ctx.post('/api/cofre/abrir', { kAuth, ...extra }, token);
    };
    return { ...ctx, aberto, pedir, pelaCarencia, abrirPelaCarencia };
  }

  describe(`A carência do aparelho (${label})`, () => {
    it('o desafio diz que a carência está ligada (o padrão) e se a senha é um PIN', async () => {
      const { post, entrar } = await cofrePronto(setup);
      expect(await (await post('/api/cofre/desafio', {}, await entrar())).json()).toMatchObject({ carencia: true, pin: false });
    });

    it('abrir com a passkey guarda a carência por 24 horas: só o hash do token e o envelope', async () => {
      const { aberto, db } = await comCarencia();
      expect(aberto.carencia).toEqual({ id: CARENCIA.id, expiraEm: '2026-10-22T15:00:00.000Z' });
      const linha = await db.first<Record<string, unknown>>('SELECT * FROM cofre_carencias');
      expect(linha).toMatchObject({ id: CARENCIA.id, usuario_id: DONO.id, hash: await hashToken(CARENCIA.token), codigo: DONO.code, erros: 0, expira_em: '2026-10-22T15:00:00.000Z' });
      expect(JSON.stringify(linha)).not.toContain(CARENCIA.token);
    });

    it('pela carência, sem o Google e sem a passkey: a entrada traz o envelope e o que a senha precisa', async () => {
      const { pelaCarencia } = await comCarencia();
      const res = await pelaCarencia();
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body).toMatchObject({
        usuario: DONO.id,
        codigo: DONO.code,
        envelope: { id: CARENCIA.id, dados: CARENCIA.envelope },
        versao: 1,
        kdf: { m: 65536, t: 3, p: 1 },
        sal: b(16, 1),
        pin: false,
        expiraEm: '2026-10-21T15:05:00.000Z',
      });
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // as passkeys do cofre, para as senhas protegidas pedirem uma de novo
      expect(body.passkeys.map((p: { id: string }) => p.id)).toEqual([VETORES.es256.reg.id, VETORES.rs256.reg.id]);
    });

    it('abre só com a senha, entra no histórico, e não renova o prazo nem cria outra carência', async () => {
      const { abrirPelaCarencia, db, advance } = await comCarencia();
      advance(23 * 3_600_000);
      const res = await abrirPelaCarencia(SENHA, { carencia: OUTRA_CARENCIA });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ recuperada: false, carencia: null });
      expect(await db.all('SELECT id, expira_em FROM cofre_carencias')).toEqual([{ id: CARENCIA.id, expira_em: '2026-10-22T15:00:00.000Z' }]);
      expect(await db.first("SELECT tipo FROM cofre_eventos WHERE tipo = 'aberto-com-carencia'")).toEqual({ tipo: 'aberto-com-carencia' });
    });

    it('depois de 24 horas, a carência não vale: o aparelho volta a pedir o Google e a passkey', async () => {
      const { pelaCarencia, advance } = await comCarencia();
      advance(24 * 3_600_000);
      const res = await pelaCarencia();
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ erro: 'carencia-invalida' });
    });

    it('um token que não é de carência nenhuma não entra', async () => {
      const { pelaCarencia } = await comCarencia();
      expect(await (await pelaCarencia('X'.repeat(43))).json()).toMatchObject({ erro: 'carencia-invalida' });
      expect(await (await pelaCarencia('curto')).json()).toMatchObject({ erro: 'pedido-invalido' });
    });

    it('a carência não serve de sessão: nem lê o cofre, nem gerencia', async () => {
      const { pelaCarencia, call } = await comCarencia();
      const { token } = (await (await pelaCarencia()).json()) as { token: string };
      expect((await call('GET', '/api/cofre/itens', undefined, { origin: ORIGEM, token })).status).toBe(401);
      expect((await call('GET', '/api/cofre/carencia', undefined, { origin: ORIGEM, token })).status).toBe(401);
    });

    it('3 erros de senha pela carência e ela acaba; o terceiro já avisa', async () => {
      const { abrirPelaCarencia, pelaCarencia } = await comCarencia();
      expect(await (await abrirPelaCarencia(ERRADA)).json()).toEqual({ erro: 'senha-errada', mensagem: 'A senha não confere.' });
      expect((await abrirPelaCarencia(ERRADA)).status).toBe(401);
      const terceiro = (await (await abrirPelaCarencia(ERRADA)).json()) as { mensagem: string };
      expect(terceiro.mensagem).toBe('A senha não confere. Este aparelho volta a pedir o Google e a passkey.');
      expect(await (await pelaCarencia()).json()).toMatchObject({ erro: 'carencia-invalida' });
    });

    it('acertar pela carência zera os erros dela', async () => {
      const { abrirPelaCarencia, db } = await comCarencia();
      await abrirPelaCarencia(ERRADA);
      await abrirPelaCarencia(ERRADA);
      expect((await abrirPelaCarencia(SENHA)).status).toBe(200);
      expect(await db.first('SELECT erros, usada_em FROM cofre_carencias')).toEqual({ erros: 0, usada_em: '2026-10-21T15:00:00.000Z' });
      for (let i = 0; i < 2; i++) await abrirPelaCarencia(ERRADA);
      expect((await abrirPelaCarencia(SENHA)).status).toBe(200);
    });

    it('várias entradas pela mesma carência ao mesmo tempo não passam das 3 tentativas', async () => {
      const { pelaCarencia, post, db } = await comCarencia();
      const tokens: string[] = [];
      for (let i = 0; i < 6; i++) tokens.push(((await (await pelaCarencia()).json()) as { token: string }).token);
      const erros = (await Promise.all(tokens.map(async (t) => ((await (await post('/api/cofre/abrir', { kAuth: ERRADA }, t)).json()) as { erro: string }).erro))).sort();
      expect(erros).toEqual([...Array(3).fill('carencia-invalida'), ...Array(3).fill('senha-errada')]);
      expect(await db.first("SELECT COUNT(*) AS n FROM freios WHERE acao = 'erro-senha'")).toEqual({ n: 3 });
    });

    it('a carência passa pelo freio da senha da conta (as 20 tentativas do dia valem para todos os caminhos)', async () => {
      const { abrirPelaCarencia, db, deps } = await comCarencia();
      const antes = new Date(deps.now().getTime() - 60_000).toISOString();
      await db.batch(Array.from({ length: 20 }, () => ({ sql: "INSERT INTO freios (chave, acao, criado_em) VALUES (?, 'erro-senha', ?)", params: [`conta:${DONO.id}`, antes] })));
      expect(await (await abrirPelaCarencia(SENHA)).json()).toMatchObject({ erro: 'senha-limite-dia' });
      // a recusa do freio não gasta a carência
      expect(await db.first('SELECT erros FROM cofre_carencias')).toEqual({ erros: 0 });
    });

    it('com o cofre congelado, a carência não abre, e congelar a encerra', async () => {
      const { pelaCarencia, post, entrar, db } = await comCarencia();
      expect((await post('/api/cofre/congelar', {}, await entrar())).status).toBe(200);
      expect(await db.first('SELECT * FROM cofre_carencias')).toBeNull();
      expect(await (await pelaCarencia()).json()).toMatchObject({ erro: 'carencia-invalida' });
    });

    it('uma carência com o formato errado recusa o pedido sem gastar a passkey', async () => {
      const { entrar, chave, post, db } = await cofrePronto(setup);
      const t = await entrar();
      await chave(t);
      const res = await post('/api/cofre/abrir', { kAuth: SENHA, carencia: { ...CARENCIA, envelope: b(40, 1) } }, t);
      expect(res.status).toBe(400);
      expect(await db.first('SELECT * FROM cofre_freio_senha')).toBeNull();
      expect((await post('/api/cofre/abrir', { kAuth: SENHA, carencia: CARENCIA }, t)).status).toBe(200);
    });

    it('a senha errada ao abrir com a passkey não guarda a carência', async () => {
      const { entrar, chave, post, db } = await cofrePronto(setup);
      const t = await entrar();
      await chave(t);
      expect((await post('/api/cofre/abrir', { kAuth: ERRADA, carencia: CARENCIA }, t)).status).toBe(401);
      expect(await db.first('SELECT * FROM cofre_carencias')).toBeNull();
    });

    it('abrir com o código de recuperação não cria carência', async () => {
      const { entrar, post, db } = await cofrePronto(setup);
      const t = await entrar();
      expect((await post('/api/cofre/recuperar', { kRec: CODIGO }, t)).status).toBe(200);
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA, carencia: CARENCIA }, t)).json()).toMatchObject({ recuperada: true, carencia: null });
      expect(await db.first('SELECT * FROM cofre_carencias')).toBeNull();
    });

    it('a carência nova do aparelho tira a que ele tinha antes (anterior)', async () => {
      const { entrar, chave, post, db } = await comCarencia();
      const t = await entrar();
      await chave(t, 'es256', 1);
      const res = await post('/api/cofre/abrir', { kAuth: SENHA, carencia: { ...OUTRA_CARENCIA, anterior: CARENCIA.token } }, t);
      expect(await res.json()).toMatchObject({ carencia: { id: OUTRA_CARENCIA.id } });
      expect(await db.all('SELECT id FROM cofre_carencias')).toEqual([{ id: OUTRA_CARENCIA.id }]);
    });

    it('nos Ajustes: lista as carências valendo e encerra uma', async () => {
      const { pedir, pelaCarencia } = await comCarencia();
      const lista = (await (await pedir('GET', '/api/cofre/carencia')).json()) as any;
      expect(lista).toEqual({
        ligada: true,
        carencias: [{ id: CARENCIA.id, aparelho: 'Chrome no Windows', criadaEm: '2026-10-21T15:00:00.000Z', expiraEm: '2026-10-22T15:00:00.000Z', usadaEm: null }],
      });
      expect(await (await pedir('DELETE', `/api/cofre/carencia/${CARENCIA.id}`)).json()).toEqual({ encerrada: true });
      expect((await pedir('DELETE', `/api/cofre/carencia/${CARENCIA.id}`)).status).toBe(404);
      expect(await (await pelaCarencia()).json()).toMatchObject({ erro: 'carencia-invalida' });
    });

    it('desligar encerra todas na hora, e ligada não volta sem a confirmação de agora', async () => {
      const { pedir, pelaCarencia, db, entrar, post } = await comCarencia();
      expect(await (await pedir('PUT', '/api/cofre/carencia', { ligada: false })).json()).toEqual({ ligada: false });
      expect(await db.first('SELECT * FROM cofre_carencias')).toBeNull();
      expect(await (await pelaCarencia()).json()).toMatchObject({ erro: 'carencia-invalida' });
      expect(await (await post('/api/cofre/desafio', {}, await entrar())).json()).toMatchObject({ carencia: false });
      expect(await (await pedir('PUT', '/api/cofre/carencia', { ligada: true })).json()).toMatchObject({ erro: 'falta-confirmar' });
      expect(await (await pedir('PUT', '/api/cofre/carencia', { ligada: true, confirmar: { kAuth: ERRADA } })).json()).toMatchObject({ erro: 'senha-errada' });
      expect(await (await pedir('PUT', '/api/cofre/carencia', { ligada: true, ...PELA_SENHA })).json()).toEqual({ ligada: true });
      expect((await db.all("SELECT tipo FROM cofre_eventos WHERE tipo LIKE 'carencia-%' ORDER BY id")).map((e: any) => e.tipo)).toEqual(['carencia-desligada', 'carencia-ligada']);
      expect((await pedir('PUT', '/api/cofre/carencia', { ligada: 'sim' })).status).toBe(400);
    });

    it('desligada, abrir com a passkey não guarda a carência', async () => {
      const { pedir, entrar, chave, post, db } = await comCarencia();
      await pedir('PUT', '/api/cofre/carencia', { ligada: false });
      const t = await entrar();
      await chave(t, 'es256', 1);
      expect(await (await post('/api/cofre/abrir', { kAuth: SENHA, carencia: OUTRA_CARENCIA }, t)).json()).toMatchObject({ carencia: null });
      expect(await db.first('SELECT * FROM cofre_carencias')).toBeNull();
    });

    it('"Trancar todos" e tirar um aparelho encerram a carência de todos', async () => {
      const um = await comCarencia();
      expect((await um.pedir('POST', '/api/cofre/trancar-todos', {})).status).toBe(200);
      expect(await um.db.first('SELECT * FROM cofre_carencias')).toBeNull();

      const outro = await comCarencia();
      expect((await outro.pedir('DELETE', '/api/cofre/aparelhos/nao-existe', PELA_SENHA)).status).toBe(404);
      expect(await outro.db.first('SELECT id FROM cofre_carencias')).toEqual({ id: CARENCIA.id });
      const aparelhos = (await (await outro.pedir('GET', '/api/cofre/aparelhos')).json()) as { aparelhos: { id: string }[] };
      expect((await outro.pedir('DELETE', `/api/cofre/aparelhos/${aparelhos.aparelhos[1]!.id}`, PELA_SENHA)).status).toBe(200);
      expect(await outro.db.first('SELECT * FROM cofre_carencias')).toBeNull();
    });

    it('"Esquecer este aparelho": com o token, a carência sai (e a resposta é sempre igual)', async () => {
      const { call, pelaCarencia, db } = await comCarencia();
      const esquecer = (token: string) => call('POST', '/api/carencia/esquecer', { token }, { origin: ORIGEM });
      expect(await (await esquecer('X'.repeat(43))).json()).toEqual({ esquecida: true });
      expect(await db.first('SELECT id FROM cofre_carencias')).toEqual({ id: CARENCIA.id });
      expect(await (await esquecer(CARENCIA.token)).json()).toEqual({ esquecida: true });
      expect(await (await pelaCarencia()).json()).toMatchObject({ erro: 'carencia-invalida' });
    });

    it('trancar com a carência guardada não pede para apagar o armazenamento do aparelho', async () => {
      const { aberto, call } = await comCarencia();
      const res = await call('POST', '/api/cofre/trancar', { token: aberto.token, manter: true }, { origin: ORIGEM });
      expect(res.headers.get('Clear-Site-Data')).toBe('"cache"');
      const sem = await call('POST', '/api/cofre/trancar', { token: aberto.token }, { origin: ORIGEM });
      expect(sem.headers.get('Clear-Site-Data')).toBe('"cache", "storage"');
    });

    it('entrar pela carência e esquecer valem no modo só leitura (são da sessão)', async () => {
      const { pelaCarencia, withEnv, call } = await comCarencia();
      const leitura = withEnv({ MODO: 'so-leitura' });
      expect((await pelaCarencia(CARENCIA.token, leitura)).status).toBe(200);
      expect((await leitura('POST', '/api/carencia/esquecer', { token: CARENCIA.token }, { origin: ORIGEM })).status).toBe(200);
      expect((await call('POST', '/api/carencia', { token: CARENCIA.token }, { origin: 'https://outro.site' })).status).toBe(403);
    });

    it('fora da lista de quem pode usar o cofre, a carência não entra', async () => {
      const { pelaCarencia, withEnv } = await comCarencia();
      expect(await (await pelaCarencia(CARENCIA.token, withEnv({ COFRE_CODIGOS: 'ABCD-1234' }))).json()).toMatchObject({ erro: 'carencia-invalida' });
    });

    it('sair do Murall (pela chamada interna) encerra a carência de todos os aparelhos da conta', async () => {
      const { deps, pelaCarencia, db } = await comCarencia();
      await endGraces(deps, DONO.id);
      expect(await db.first('SELECT * FROM cofre_carencias')).toBeNull();
      expect(await (await pelaCarencia()).json()).toMatchObject({ erro: 'carencia-invalida' });
    });

    it('a passkey conferida numa entrada da carência vale por si: a senha não gasta a carência', async () => {
      const { pelaCarencia, chave, post, db } = await comCarencia();
      const { token } = (await (await pelaCarencia()).json()) as { token: string };
      await chave(token, 'es256', 1);
      expect((await post('/api/cofre/abrir', { kAuth: ERRADA }, token)).status).toBe(401);
      expect(await db.first('SELECT erros FROM cofre_carencias')).toEqual({ erros: 0 });
    });

    it('as entradas pela carência têm o freio delas: não gastam as entradas do Google do dono', async () => {
      const { pelaCarencia, entrar, db, deps } = await comCarencia();
      const antes = new Date(deps.now().getTime() - 60_000).toISOString();
      await db.batch(Array.from({ length: 30 }, () => ({ sql: "INSERT INTO freios (chave, acao, criado_em) VALUES (?, 'carencia', ?)", params: [`conta:${DONO.id}`, antes] })));
      expect(await (await pelaCarencia()).json()).toMatchObject({ erro: 'muitas-tentativas' });
      expect(await entrar()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('a limpeza diária tira as carências vencidas', async () => {
      const { deps, advance, db } = await comCarencia();
      advance(25 * 3_600_000);
      await cleanup(deps);
      expect(await db.first('SELECT * FROM cofre_carencias')).toBeNull();
    });

    it('a senha como PIN: ao criar e ao trocar, só para a tela mostrar o teclado de números', async () => {
      const { pedir, pelaCarencia, call, db } = await comCarencia();
      const { token } = (await (await pelaCarencia()).json()) as { token: string };
      expect(await (await call('GET', '/api/cofre', undefined, { origin: ORIGEM, token })).json()).toMatchObject({ pin: false });
      const troca = { versao: 1, kdf: { m: 65536, t: 3, p: 1 }, sal: b(16, 40), v: b(61, 41), kAuth: b(32, 42), ...PELA_SENHA };
      expect((await pedir('PUT', '/api/cofre/senha', { ...troca, pin: 'sim' })).status).toBe(400);
      expect((await pedir('PUT', '/api/cofre/senha', { ...troca, pin: true })).status).toBe(200);
      expect(await db.first('SELECT pin FROM cofre_contas')).toEqual({ pin: 1 });
      // a carência continua: o envelope dela guarda M, que trocar a senha não muda
      expect(((await (await pelaCarencia()).json()) as { pin: boolean }).pin).toBe(true);
    });
  });
}
