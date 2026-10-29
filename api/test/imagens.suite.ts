import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { ALL, HALF_SENT_MS, MAX_IMAGE_BYTES } from '../src/domain/image';
import { DAY_MS } from '../src/domain/quota';
import { CatalogBrake, Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, eraseNow, gzip } from './harness';
import { jpeg, png, svg, webp } from './imagens-amostras';

/**
 * As imagens coladas nas anotações (PLANO-IMAGENS.md, rodada 1): o envio, quem vê, as travas que
 * seguram o plano grátis (o teto de cada imagem, o lado maior, as imagens por dia, a cota da conta e a da
 * nuvem, a cota de gravações do dia, o freio por IP), apagar, a conta que sai e a limpeza diária. Roda
 * nos dois bancos, como as outras suítes; o dos bytes é um segundo banco.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', IMAGENS_MB_TOTAL: '400', IMAGENS_MB_PESSOA: '25', IMAGENS_POR_DIA: '30' };

/** Um id como o site sorteia (16 bytes em base64url), diferente a cada chamada. */
let seq = 0;
const newId = () => `img${String(++seq).padStart(4, '0')}${'x'.repeat(15)}`;

export function imagensSuite(label: string, getDb: () => Db, getImagesDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'imagens', alg: 'RS256' };
  });

  interface Options {
    env?: Record<string, string>;
    /** Sem o banco das imagens (o binding faltando), ou um que falha ao gravar. */
    images?: 'nenhum' | 'falha';
    brake?: CatalogBrake;
  }

  async function setup(o: Options = {}) {
    const db = getDb();
    const imagesDb = getImagesDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    await imagesDb.batch([{ sql: 'DELETE FROM bytes' }]);
    const config: Config = readConfig({ ...ENV, ...o.env });
    const clock = { t: NOW.getTime() };
    const failing: Db = { ...imagesDb, batch: async () => Promise.reject(new Error('D1_ERROR: database full')) };
    const deps: Deps = {
      db,
      ...(o.images === 'nenhum' ? {} : { imagesDb: o.images === 'falha' ? failing : imagesDb }),
      config,
      now: () => new Date(clock.t),
      verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })),
      ...(o.brake ? { imageBrake: o.brake } : {}),
    };
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    /** Envia o mural como o site, com a lista das imagens do público (`publicas`; sem ela, a parte não vai). */
    const push = async (token: string, publicas?: string[]) => {
      const pulled = await call('/v1/eu/mural', { headers: auth(token) });
      const base = Number(pulled.headers.get('Mural-Rev') ?? 0);
      const form = new FormData();
      form.append('privado', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      form.append('publico', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      if (publicas) form.append('imagens', JSON.stringify({ publicas }));
      const res = await call('/v1/eu/mural', { method: 'PUT', headers: { ...auth(token), 'Mural-Rev-Base': String(base) }, body: form });
      clock.t += 5_000;
      return res.status;
    };
    /** Uma anotação compartilhada com a imagem no texto (`texto`), e as pessoas nela. */
    const nota = (id: string, texto: string) => ({
      id,
      kind: 'anotacoes',
      game: { name: 'Viagem', coverUrl: null, source: 'manual' },
      text: texto,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    const share = async (token: string, id: string, texto: string, membros: { codigo: string; papel: string }[]) =>
      (await call('/v1/notas', { method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ id, dados: nota(id, texto), membros }) })).status;
    const editNote = async (token: string, id: string, texto: string) => {
      const detail = (await (await call(`/v1/eu/notas/detalhes?ids=${id}`, { headers: auth(token) })).json()) as any;
      clock.t += 2_000;
      return (await call(`/v1/notas/${id}`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ base: detail.notas[0].rev, dados: nota(id, texto) }) })).status;
    };
    const login = async (sub: string) => {
      const credential = await new SignJWT({ given_name: sub })
        .setProtectedHeader({ alg: 'RS256', kid: 'imagens' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const res = await call('/v1/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
      const b = (await res.json()) as any;
      return { token: b.token as string, id: b.conta.id as string, codigo: b.conta.codigo as string };
    };
    const auth = (token?: string): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});
    const put = async (token: string, id: string, bytes: Uint8Array<ArrayBuffer>, type = 'image/webp') => {
      const res = await call(`/v1/imagens/${id}`, { method: 'PUT', headers: { ...auth(token), 'Content-Type': type }, body: bytes });
      return { status: res.status, body: (await res.json()) as any };
    };
    const get = (id: string, token?: string, headers: Record<string, string> = {}) => call(`/v1/imagens/${id}`, { headers: { ...auth(token), ...headers } });
    const del = async (token: string, id: string) => {
      const res = await call(`/v1/imagens/${id}`, { method: 'DELETE', headers: auth(token) });
      return { status: res.status, body: (await res.json()) as any };
    };
    const mine = async (token: string) => (await (await call('/v1/eu/imagens', { headers: auth(token) })).json()) as any;
    const counter = (who: string) => db.first<{ imagens: number; bytes: number }>('SELECT imagens, bytes FROM imagens_uso WHERE usuario_id = ?', [who]);
    const storedBytes = async () => (await imagesDb.first<{ n: number }>('SELECT COUNT(*) AS n FROM bytes'))!.n;
    const advance = (ms: number) => void (clock.t += ms);
    return { db, imagesDb, deps, call, login, put, get, del, mine, counter, storedBytes, advance, push, share, editNote };
  }

  describe(`Imagens: enviar e ver (${label})`, () => {
    it('o dono manda e vê de volta os mesmos bytes, sem cache no navegador e sem virar página', async () => {
      const { login, put, get, counter } = await setup();
      const ana = await login('ana');
      const id = newId();
      const img = webp(900, 600, 50_000);
      const sent = await put(ana.token, id, img);
      expect(sent.status).toBe(201);
      expect(sent.body).toMatchObject({ id, tipo: 'image/webp', bytes: 50_000, largura: 900, altura: 600 });
      expect(sent.body.uso).toEqual({ imagens: 1, bytes: 50_000, cota: 25 * 1024 * 1024, livre: 25 * 1024 * 1024 - 50_000 });

      const res = await get(id, ana.token);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/webp');
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(img);
      expect(await counter(ana.id)).toEqual({ imagens: 1, bytes: 50_000 });
      expect(await counter(ALL)).toEqual({ imagens: 1, bytes: 50_000 });
    });

    it('JPEG e PNG também; o tipo é o dos bytes, não o que o pedido diz', async () => {
      const { login, put, get } = await setup();
      const ana = await login('ana');
      const a = newId();
      const b = newId();
      expect((await put(ana.token, a, jpeg(800, 450), 'image/png')).body.tipo).toBe('image/jpeg');
      expect((await put(ana.token, b, png(120, 900), 'text/html')).body.tipo).toBe('image/png');
      expect((await get(a, ana.token)).headers.get('Content-Type')).toBe('image/jpeg');
    });

    it('a privada não abre sem a sessão do dono: sem sessão, com a de outra conta ou com uma inválida é 404 (nunca 401)', async () => {
      const { login, put, get } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const id = newId();
      await put(ana.token, id, webp(100, 100));
      for (const res of [await get(id), await get(id, bia.token), await get(id, 'A'.repeat(43)), await get(id, undefined, { Authorization: 'qualquer coisa' })]) {
        expect(res.status).toBe(404);
        expect(((await res.json()) as any).erro).toBe('imagem-nao-encontrada');
      }
      // a que não existe responde igual
      expect((await get(newId(), ana.token)).status).toBe(404);
      expect((await get('curto', ana.token)).status).toBe(404);
    });

    it('a que está no mural público abre sem login, com 7 dias de cache; tirada da lista, volta a ser privada', async () => {
      const { login, put, get, push } = await setup();
      const ana = await login('ana');
      const id = newId();
      await put(ana.token, id, webp(100, 100));
      expect(await push(ana.token, [id])).toBe(200);
      const res = await get(id);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800');
      // com a sessão de alguém: sem cache no navegador, e diz de quem é
      const bia = await login('bia');
      const seen = await get(id, bia.token);
      expect(seen.headers.get('Cache-Control')).toBe('private, no-store');
      expect(seen.headers.get('Imagem-Sua')).toBe('0');
      expect((await get(id, ana.token)).headers.get('Imagem-Sua')).toBe('1');
      // o envio sem a parte não muda a lista; com a lista vazia, ela sai
      expect(await push(ana.token)).toBe(200);
      expect((await get(id)).status).toBe(200);
      expect(await push(ana.token, [])).toBe(200);
      expect((await get(id)).status).toBe(404);
    });

    it('a lista do público vale antes de a imagem subir (ela chega depois, já pública)', async () => {
      const { login, put, get, push } = await setup();
      const ana = await login('ana');
      const id = newId();
      expect(await push(ana.token, [id])).toBe(200);
      await put(ana.token, id, webp(10, 10));
      expect((await get(id)).status).toBe(200);
    });

    it('pôr a imagem de outra pessoa na lista do público não a mostra', async () => {
      const { login, put, get, push } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const id = newId();
      await put(ana.token, id, webp(10, 10));
      expect(await push(bia.token, [id, 'nao e um id', 7 as never])).toBe(200);
      expect((await get(id)).status).toBe(404);
      expect((await get(id, bia.token)).status).toBe(404);
    });

    it('na anotação compartilhada: quem está nela vê a imagem privada de outra pessoa; quem sai, ou com a anotação apagada, não', async () => {
      const { db, login, put, get, share, call } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const cris = await login('cris');
      const id = newId();
      await put(ana.token, id, webp(10, 10));
      expect(await share(ana.token, 'nota-foto', `Olha: {{imagem: murall://imagem/${id}}}`, [{ codigo: bia.codigo, papel: 'leitor' }])).toBe(201);
      expect((await get(id, bia.token)).status).toBe(200);
      expect((await get(id, cris.token)).status, 'quem não está nela').toBe(404);
      expect((await get(id)).status).toBe(404);
      // a Bia sai: deixa de ver
      expect((await call(`/v1/notas/nota-foto/membros/eu`, { method: 'DELETE', headers: { Authorization: `Bearer ${bia.token}` } })).status).toBe(200);
      expect((await get(id, bia.token)).status).toBe(404);
      // apagada para todos: o registro das imagens dela sai junto
      expect((await call('/v1/notas/nota-foto', { method: 'DELETE', headers: { Authorization: `Bearer ${ana.token}` } })).status).toBe(200);
      expect(await db.first('SELECT 1 FROM nota_imagens WHERE nota_id = ?', ['nota-foto'])).toBeNull();
    });

    it('mudar o texto da compartilhada muda quais imagens ela usa', async () => {
      const { login, put, get, share, editNote } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const um = newId();
      const dois = newId();
      await put(ana.token, um, webp(10, 10));
      await put(ana.token, dois, webp(10, 10, 2_000, 1));
      await share(ana.token, 'nota-troca', `{{imagem: murall://imagem/${um}}}`, [{ codigo: bia.codigo, papel: 'editor' }]);
      expect((await get(um, bia.token)).status).toBe(200);
      expect((await get(dois, bia.token)).status).toBe(404);
      // quem escreve nela (a Bia, editora) troca a imagem
      expect(await editNote(bia.token, 'nota-troca', `{{imagem: murall://imagem/${dois}}}`)).toBe(200);
      expect((await get(um, bia.token)).status).toBe(404);
      expect((await get(dois, bia.token)).status).toBe(200);
    });

    it('a compartilhada pública no mural de quem está nela mostra a imagem enquanto a pessoa está na anotação', async () => {
      const { login, put, get, share, push, call } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const id = newId();
      await put(ana.token, id, webp(10, 10));
      await share(ana.token, 'nota-publica', `{{imagem: murall://imagem/${id}}}`, [{ codigo: bia.codigo, papel: 'leitor' }]);
      // a Bia mostra a anotação no mural público dela (a dona não)
      expect(await push(bia.token, [id])).toBe(200);
      expect((await get(id)).status).toBe(200);
      // a dona tira a Bia: a imagem deixa de estar à mostra, sem esperar o site dela
      expect((await call(`/v1/notas/nota-publica/membros/${bia.codigo.replace('-', '')}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ana.token}` } })).status).toBe(200);
      expect((await get(id)).status).toBe(404);
    });

    it('repetir o envio responde 200 sem contar de novo; o id de outra conta é 409', async () => {
      const { login, put, counter, storedBytes } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const id = newId();
      expect((await put(ana.token, id, webp(100, 100, 3_000))).status).toBe(201);
      const again = await put(ana.token, id, webp(100, 100, 3_000));
      expect(again.status).toBe(200);
      expect(again.body.uso.imagens).toBe(1);
      expect(await counter(ana.id)).toEqual({ imagens: 1, bytes: 3_000 });
      expect(await storedBytes()).toBe(1);
      expect((await put(bia.token, id, webp(100, 100, 3_000))).body.erro).toBe('imagem-id-em-uso');
      expect((await put(ana.token, id, webp(100, 100, 4_000))).body.erro).toBe('imagem-diferente');
    });

    it('o envio que caiu no meio (os dados sem os bytes) termina quando o site manda de novo', async () => {
      const { db, login, put, get, counter } = await setup();
      const ana = await login('ana');
      const id = newId();
      await put(ana.token, id, webp(100, 100, 3_000));
      // como se os bytes não tivessem chegado ao outro banco
      await getImagesDb().batch([{ sql: 'DELETE FROM bytes WHERE id = ?', params: [id] }]);
      await db.batch([{ sql: 'UPDATE imagens SET pronta = 0 WHERE id = ?', params: [id] }]);
      expect((await get(id, ana.token)).status).toBe(404);
      expect((await put(ana.token, id, webp(100, 100, 3_000))).status).toBe(200);
      expect((await get(id, ana.token)).status).toBe(200);
      expect(await counter(ana.id)).toEqual({ imagens: 1, bytes: 3_000 });
    });
  });

  describe(`Imagens: as travas do plano grátis (${label})`, () => {
    it('recusa o que não é imagem, o que passa de 900 px e o que passa de 200 KB, sem gravar nada', async () => {
      const { call, login, put, counter, storedBytes } = await setup();
      const ana = await login('ana');
      expect((await put(ana.token, newId(), svg(), 'image/svg+xml')).body.erro).toBe('imagem-tipo');
      expect((await put(ana.token, newId(), webp(901, 100))).body.erro).toBe('imagem-grande');
      expect((await put(ana.token, newId(), jpeg(100, 1200))).body.erro).toBe('imagem-grande');
      const heavy = await put(ana.token, newId(), webp(100, 100, MAX_IMAGE_BYTES + 1));
      expect(heavy.status).toBe(413);
      expect((await put(ana.token, newId(), new Uint8Array())).body.erro).toBe('imagem-vazia');
      // o tamanho dito no cabeçalho já barra, antes de ler
      const lying = await call(`/v1/imagens/${newId()}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ana.token}`, 'Content-Type': 'image/webp', 'Content-Length': String(MAX_IMAGE_BYTES + 1) },
        body: webp(100, 100),
      });
      expect(lying.status).toBe(413);
      // o id fora do formato
      expect((await put(ana.token, 'nao-e-um-id', webp(100, 100))).status).toBe(404);
      expect(await counter(ana.id)).toBeNull();
      expect(await storedBytes()).toBe(0);
    });

    it('sem sessão não manda', async () => {
      const { call } = await setup();
      const res = await call(`/v1/imagens/${newId()}`, { method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: webp(10, 10) });
      expect(res.status).toBe(401);
    });

    it('até IMAGENS_POR_DIA envios por conta em 24 horas; apagar não devolve a vaga', async () => {
      const { login, put, del, advance } = await setup({ env: { IMAGENS_POR_DIA: '2' } });
      const ana = await login('ana');
      const bia = await login('bia');
      const first = newId();
      expect((await put(ana.token, first, webp(10, 10))).status).toBe(201);
      expect((await put(ana.token, newId(), webp(10, 10))).status).toBe(201);
      await del(ana.token, first);
      const third = await put(ana.token, newId(), webp(10, 10));
      expect(third.status).toBe(429);
      expect(third.body.erro).toBe('imagens-hoje');
      // a outra conta tem as dela
      expect((await put(bia.token, newId(), webp(10, 10))).status).toBe(201);
      advance(DAY_MS + 1);
      expect((await put(ana.token, newId(), webp(10, 10))).status).toBe(201);
    });

    it('a cota da conta: passou, 403; apagar uma devolve o lugar', async () => {
      const { login, put, del } = await setup({ env: { IMAGENS_MB_PESSOA: '1' } });
      const ana = await login('ana');
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const id = newId();
        ids.push(id);
        expect((await put(ana.token, id, webp(10, 10, 170_000, i))).status).toBe(201);
      }
      const over = await put(ana.token, newId(), webp(10, 10, 170_000));
      expect(over.status).toBe(403);
      expect(over.body.erro).toBe('cota-imagens');
      expect((await del(ana.token, ids[0]!)).body.uso.livre).toBe(1024 * 1024 - 5 * 170_000);
      expect((await put(ana.token, newId(), webp(10, 10, 170_000))).status).toBe(201);
    });

    it('a cota da nuvem inteira: passou, 507 para todo mundo, mesmo com lugar na conta', async () => {
      const { login, put } = await setup({ env: { IMAGENS_MB_TOTAL: '1' } });
      const ana = await login('ana');
      const bia = await login('bia');
      for (let i = 0; i < 3; i++) expect((await put(ana.token, newId(), webp(10, 10, 170_000, i))).status).toBe(201);
      for (let i = 0; i < 3; i++) expect((await put(bia.token, newId(), webp(10, 10, 170_000, i))).status).toBe(201);
      const full = await put(bia.token, newId(), webp(10, 10, 170_000));
      expect(full.status).toBe(507);
      expect(full.body.erro).toBe('imagens-cheio');
    });

    it('sem cota configurada (zero ou valor errado), recusa tudo', async () => {
      const { login, put } = await setup({ env: { IMAGENS_MB_TOTAL: 'quatrocentos' } });
      const ana = await login('ana');
      expect((await put(ana.token, newId(), webp(10, 10))).body.erro).toBe('imagens-cheio');
    });

    it('a cota de gravações do dia vale também para as imagens (os bytes do outro banco contam)', async () => {
      const { login, put, storedBytes } = await setup({ env: { COTA_LINHAS_DIA: '30' } });
      const ana = await login('ana');
      const results: number[] = [];
      for (let i = 0; i < 5; i++) results.push((await put(ana.token, newId(), webp(10, 10, 2_000, i))).status);
      expect(results).toContain(503);
      // o que foi recusado não deixou bytes
      expect(await storedBytes()).toBe(results.filter((s) => s === 201).length);
    });

    it('o banco das imagens recusou (cheio): os dados saem e a conta volta ao que era', async () => {
      const { db, login, put, counter } = await setup({ images: 'falha' });
      const ana = await login('ana');
      const res = await put(ana.token, newId(), webp(10, 10));
      expect(res.status).toBe(507);
      expect(res.body.erro).toBe('imagens-cheio');
      expect((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM imagens'))!.n).toBe(0);
      expect(await counter(ana.id)).toEqual({ imagens: 0, bytes: 0 });
      expect(await counter(ALL)).toEqual({ imagens: 0, bytes: 0 });
    });

    it('sem o banco das imagens, elas ficam fora do ar e o resto da nuvem segue', async () => {
      const { call, login, put, get, mine } = await setup({ images: 'nenhum' });
      const ana = await login('ana');
      expect((await put(ana.token, newId(), webp(10, 10))).body.erro).toBe('imagens-indisponiveis');
      expect((await get(newId(), ana.token)).status).toBe(503);
      expect((await mine(ana.token)).disponivel).toBe(false);
      expect((await call('/v1/status')).status).toBe(200);
    });

    it('a nuvem só para leitura não recebe imagens, mas mostra', async () => {
      const first = await setup();
      const ana = await first.login('ana');
      const id = newId();
      await first.put(ana.token, id, webp(10, 10));
      const app = createApp({ ...first.deps, config: { ...first.deps.config, mode: 'so-leitura' } });
      const put = await app.request(`https://api.teste/v1/imagens/${newId()}`, { method: 'PUT', headers: { Authorization: `Bearer ${ana.token}` }, body: webp(10, 10) });
      expect(put.status).toBe(503);
      const got = await app.request(`https://api.teste/v1/imagens/${id}`, { headers: { Authorization: `Bearer ${ana.token}` } });
      expect(got.status).toBe(200);
    });

    it('o freio por IP nas visitas: passou, 429 com Retry-After, sem ler o banco', async () => {
      let left = 2;
      const { login, put, get } = await setup({ brake: { take: () => left-- > 0 } });
      const ana = await login('ana');
      const id = newId();
      await put(ana.token, id, webp(10, 10));
      const ip = { 'CF-Connecting-IP': '203.0.113.9' };
      expect((await get(id, ana.token, ip)).status).toBe(200);
      expect((await get(id, ana.token, ip)).status).toBe(200);
      const slow = await get(id, ana.token, ip);
      expect(slow.status).toBe(429);
      expect(slow.headers.get('Retry-After')).toBe('60');
    });
  });

  describe(`Imagens: quanto falta para encher (${label})`, () => {
    it('GET /v1/eu/imagens: o uso da conta, o da nuvem, os envios de hoje e a lista', async () => {
      const { login, put, mine } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const id = newId();
      await put(ana.token, id, webp(900, 300, 10_000));
      await put(bia.token, newId(), webp(10, 10, 5_000));
      const body = await mine(ana.token);
      expect(body.disponivel).toBe(true);
      expect(body.uso).toEqual({ imagens: 1, bytes: 10_000, cota: 25 * 1024 * 1024, livre: 25 * 1024 * 1024 - 10_000 });
      expect(body.nuvem).toEqual({ imagens: 2, bytes: 15_000, cota: 400 * 1024 * 1024, livre: 400 * 1024 * 1024 - 15_000 });
      expect(body.hoje).toEqual({ enviadas: 1, limite: 30 });
      expect(body.imagens).toEqual([
        { id, tipo: 'image/webp', bytes: 10_000, largura: 900, altura: 300, publica: false, pronta: true, criadaEm: NOW.toISOString() },
      ]);
    });

    it('o /v1/status diz quanto as imagens da nuvem guardam e quanto falta (para a checagem diária)', async () => {
      const { call, login, put } = await setup();
      const ana = await login('ana');
      await put(ana.token, newId(), webp(10, 10, 8_000));
      const body = (await (await call('/v1/status')).json()) as any;
      expect(body.imagens).toEqual({ imagens: 1, bytes: 8_000, cota: 400 * 1024 * 1024, livre: 400 * 1024 * 1024 - 8_000 });
    });
  });

  describe(`Imagens: apagar (${label})`, () => {
    it('o dono apaga: os bytes e os dados saem, a conta desce; de outra conta é 404', async () => {
      const { login, put, get, del, counter, storedBytes } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const id = newId();
      await put(ana.token, id, webp(10, 10, 4_000));
      expect((await del(bia.token, id)).status).toBe(404);
      const gone = await del(ana.token, id);
      expect(gone.status).toBe(200);
      expect(gone.body.uso).toMatchObject({ imagens: 0, bytes: 0 });
      expect((await get(id, ana.token)).status).toBe(404);
      expect(await storedBytes()).toBe(0);
      expect(await counter(ALL)).toEqual({ imagens: 0, bytes: 0 });
      expect((await del(ana.token, id)).status).toBe(404);
    });

    it('apagar a imagem tira também quem a mostrava e as anotações que a usavam', async () => {
      const { db, login, put, del, push, share } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const id = newId();
      await put(ana.token, id, webp(10, 10));
      await push(ana.token, [id]);
      await share(ana.token, 'nota-x', `{{imagem: murall://imagem/${id}}}`, [{ codigo: bia.codigo, papel: 'leitor' }]);
      await del(ana.token, id);
      expect(await db.first('SELECT 1 FROM imagem_publica WHERE imagem_id = ?', [id])).toBeNull();
      expect(await db.first('SELECT 1 FROM nota_imagens WHERE imagem_id = ?', [id])).toBeNull();
    });

    it('a conta que sai leva as imagens dela (dados, bytes e conta), e só as dela', async () => {
      const { deps, db, login, put, get, counter, storedBytes } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      await put(ana.token, newId(), webp(10, 10, 3_000));
      await put(ana.token, newId(), webp(10, 10, 3_000, 1));
      const kept = newId();
      await put(bia.token, kept, webp(10, 10, 5_000));
      await eraseNow(deps, ana.token);
      expect(await counter(ana.id)).toBeNull();
      expect(await counter(ALL)).toEqual({ imagens: 1, bytes: 5_000 });
      expect((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM imagens'))!.n).toBe(1);
      expect(await storedBytes()).toBe(1);
      expect((await get(kept, bia.token)).status).toBe(200);
    });
  });

  describe(`Imagens: a limpeza diária (${label})`, () => {
    it('termina as que ficaram no meio há mais de um dia: com bytes fica pronta, sem bytes sai e a conta desce', async () => {
      const { deps, db, imagesDb, login, put, get, counter, advance } = await setup();
      const ana = await login('ana');
      const withBytes = newId();
      const withoutBytes = newId();
      const recent = newId();
      await put(ana.token, withBytes, webp(10, 10, 2_000));
      await put(ana.token, withoutBytes, webp(10, 10, 3_000));
      await imagesDb.batch([{ sql: 'DELETE FROM bytes WHERE id = ?', params: [withoutBytes] }]);
      await db.batch([{ sql: 'UPDATE imagens SET pronta = 0 WHERE id IN (?, ?)', params: [withBytes, withoutBytes] }]);
      advance(HALF_SENT_MS + 1);
      await put(ana.token, recent, webp(10, 10, 1_000));
      await db.batch([{ sql: 'UPDATE imagens SET pronta = 0 WHERE id = ?', params: [recent] }]);
      await cleanup(deps);
      expect((await get(withBytes, ana.token)).status).toBe(200);
      expect(await db.first('SELECT id FROM imagens WHERE id = ?', [withoutBytes])).toBeNull();
      // a de agora ainda pode estar chegando: fica como está
      expect((await db.first<{ pronta: number }>('SELECT pronta FROM imagens WHERE id = ?', [recent]))!.pronta).toBe(0);
      expect(await counter(ana.id)).toEqual({ imagens: 2, bytes: 3_000 });
      expect(await counter(ALL)).toEqual({ imagens: 2, bytes: 3_000 });
    });

    it('reconta o uso a partir das imagens guardadas: uma conta errada não fica', async () => {
      const { deps, db, login, put, counter } = await setup();
      const ana = await login('ana');
      await put(ana.token, newId(), webp(10, 10, 2_000));
      await db.batch([
        { sql: 'UPDATE imagens_uso SET bytes = 999999, imagens = 7' },
        { sql: "INSERT INTO imagens_uso (usuario_id, imagens, bytes) VALUES ('fantasma', 3, 3)" },
      ]);
      await cleanup(deps);
      expect(await counter(ana.id)).toEqual({ imagens: 1, bytes: 2_000 });
      expect(await counter(ALL)).toEqual({ imagens: 1, bytes: 2_000 });
      expect(await counter('fantasma')).toBeNull();
    });
  });
}
