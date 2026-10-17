import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { googleVerifier } from '../src/domain/google';
import { MAX_MEMBERS, MAX_NOTE_CHARS } from '../src/domain/shared-note';
import { MAX_SHARES_PER_DAY, MIN_EDIT_MS } from '../src/routes/notes';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, jsonCaller } from './harness';

/**
 * As anotações compartilhadas (migração 0011): os papéis (dono, gestor, editor, leitor), a vez de
 * gravar (`rev`), o conflito guardado até alguém escolher, o aviso no correio e o que acontece quando
 * alguém sai, é tirado, apaga a anotação ou apaga a conta. Roda nos dois bancos, como as outras suítes.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000' };

/** Uma anotação como o site manda (o servidor só confere o id, o mural e o título). */
const nota = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'anotacoes',
  game: { name: 'Lista do mercado', coverUrl: null, source: 'manual' },
  text: 'arroz\nfeijão',
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...extra,
});

export function notasSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'notas', alg: 'RS256' };
  });

  async function setup() {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig(ENV);
    const clock = { t: NOW.getTime() };
    const deps: Deps = {
      db,
      config,
      now: () => new Date(clock.t),
      verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })),
    };
    const advance = (ms: number) => void (clock.t += ms);
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    const json = jsonCaller(call);
    const res = async (r: Response | Promise<Response>) => {
      const x = await r;
      return { status: x.status, body: (await x.json().catch(() => null)) as any };
    };
    const login = async (sub: string, givenName = sub) => {
      const credential = await new SignJWT({ given_name: givenName })
        .setProtectedHeader({ alg: 'RS256', kid: 'notas' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = (await (await json('POST', '/v1/auth/google', { credential })).json()) as any;
      return { token: b.token as string, codigo: b.conta.codigo as string, id: b.conta.id as string, nome: b.conta.nome as string };
    };
    const share = (token: string, id: string, membros: unknown[] = [], dados: unknown = nota(id)) => res(json('POST', '/v1/notas', { id, dados, membros }, token));
    const put = (token: string, id: string, body: Record<string, unknown>) => {
      const r = res(json('PUT', `/v1/notas/${id}`, body, token));
      advance(MIN_EDIT_MS + 500);
      return r;
    };
    const setRole = (token: string, id: string, codigo: string, papel: unknown) => res(json('PUT', `/v1/notas/${id}/membros/${codigo}`, { papel }, token));
    const drop = (token: string, id: string, codigo: string) => res(json('DELETE', `/v1/notas/${id}/membros/${codigo}`, undefined, token));
    const index = async (token: string) => (await res(json('GET', '/v1/eu/notas', undefined, token))).body.notas as { id: string; versao: number; papel: string }[];
    const details = async (token: string, ids: string[]) =>
      (await res(json('GET', `/v1/eu/notas/detalhes?ids=${ids.join(',')}`, undefined, token))).body.notas as any[];
    const feed = async (token: string) => (await res(json('GET', '/v1/eu/notificacoes', undefined, token))).body;
    return { db, app, call, json, res, login, share, put, setRole, drop, index, details, feed, advance };
  }

  /** Ana (dona), Bia e Cris. */
  async function three() {
    const t = await setup();
    const ana = await t.login('ana', 'Ana');
    const bia = await t.login('bia', 'Bia');
    const cris = await t.login('cris', 'Cris');
    return { ...t, ana, bia, cris };
  }

  describe(`Anotações compartilhadas (${label})`, () => {
    describe('compartilhar', () => {
      it('a dona compartilha: a anotação aparece para ela e para quem entrou, cada um com o seu papel', async () => {
        const { share, index, details, ana, bia, cris } = await three();
        const r = await share(ana.token, 'nota-1', [
          { codigo: bia.codigo, papel: 'editor' },
          { codigo: cris.codigo, papel: 'leitor' },
        ]);
        expect(r.status).toBe(201);
        expect(r.body.nota).toMatchObject({ id: 'nota-1', papel: 'dono', rev: 1, dono: { codigo: ana.codigo, nome: 'Ana' } });
        expect(r.body.nota.membros.map((m: any) => [m.nome, m.papel])).toEqual(
          expect.arrayContaining([
            ['Bia', 'editor'],
            ['Cris', 'leitor'],
          ]),
        );
        expect(await index(ana.token)).toEqual([{ id: 'nota-1', versao: 1, papel: 'dono' }]);
        expect(await index(bia.token)).toEqual([{ id: 'nota-1', versao: 1, papel: 'editor' }]);
        expect(await index(cris.token)).toEqual([{ id: 'nota-1', versao: 1, papel: 'leitor' }]);
        const [d] = await details(bia.token, ['nota-1']);
        expect(d.dados.text).toBe('arroz\nfeijão');
        expect(d.atualizadoPor.nome).toBe('Ana');
      });

      it('quem entra recebe o aviso "compartilhou" no correio, com o título e o papel; ao sair, o aviso some', async () => {
        const { share, feed, drop, advance, ana, bia } = await three();
        advance(60_000);
        await share(ana.token, 'nota-1', [{ codigo: bia.codigo, papel: 'gestor' }]);
        const f = await feed(bia.token);
        expect(f.itens).toHaveLength(1);
        expect(f.itens[0]).toMatchObject({ tipo: 'compartilhou', ref: 'nota-1', titulo: 'Lista do mercado', mural: 'anotacoes', papel: 'gestor', pessoa: { nome: 'Ana' } });
        expect(f.naoVistas).toBe(1);
        expect((await drop(bia.token, 'nota-1', 'eu')).status).toBe(200);
        expect((await feed(bia.token)).itens).toEqual([]);
      });

      it('o aviso mostra o título e o papel de agora', async () => {
        const { share, put, setRole, feed, ana, bia } = await three();
        await share(ana.token, 'nota-1', [{ codigo: bia.codigo, papel: 'leitor' }]);
        await put(ana.token, 'nota-1', { base: 1, dados: nota('nota-1', { game: { name: 'Compras da semana' } }) });
        await setRole(ana.token, 'nota-1', bia.codigo, 'editor');
        expect((await feed(bia.token)).itens[0]).toMatchObject({ titulo: 'Compras da semana', papel: 'editor' });
      });

      it('compartilhar de novo a mesma anotação (a resposta se perdeu) devolve a que já existe', async () => {
        const { share, ana } = await three();
        expect((await share(ana.token, 'nota-1')).status).toBe(201);
        const again = await share(ana.token, 'nota-1');
        expect(again.status).toBe(200);
        expect(again.body.nota.rev).toBe(1);
      });

      it('o id de uma anotação de outra pessoa não serve (409 nota-id-em-uso)', async () => {
        const { share, ana, bia } = await three();
        await share(ana.token, 'nota-1');
        const r = await share(bia.token, 'nota-1');
        expect(r.status).toBe(409);
        expect(r.body.erro).toBe('nota-id-em-uso');
      });

      it('recusa anotação quebrada, de outro mural, com outro id ou grande demais', async () => {
        const { share, ana } = await three();
        expect((await share(ana.token, 'nota-1', [], { ...nota('nota-1'), kind: 'jogos' })).status).toBe(400);
        expect((await share(ana.token, 'nota-1', [], nota('outra'))).status).toBe(400);
        expect((await share(ana.token, 'nota-1', [], [])).status).toBe(400);
        expect((await share(ana.token, 'nota-1', [], { ...nota('nota-1'), game: {} })).status).toBe(400);
        expect((await share(ana.token, 'x', [])).status).toBe(400);
        const big = await share(ana.token, 'nota-1', [], nota('nota-1', { text: 'a'.repeat(MAX_NOTE_CHARS) }));
        expect(big.status).toBe(413);
      });

      it('recusa papel que não existe e código de ninguém; a própria dona na lista é ignorada', async () => {
        const { share, index, ana, bia } = await three();
        expect((await share(ana.token, 'nota-1', [{ codigo: bia.codigo, papel: 'dono' }])).body.erro).toBe('papel-invalido');
        expect((await share(ana.token, 'nota-1', [{ codigo: 'ZZZZ-ZZZZ', papel: 'leitor' }])).status).toBe(404);
        const r = await share(ana.token, 'nota-1', [{ codigo: ana.codigo, papel: 'leitor' }]);
        expect(r.status).toBe(201);
        expect(r.body.nota.membros).toEqual([]);
        expect(await index(ana.token)).toHaveLength(1);
      });

      it(`até ${MAX_MEMBERS} pessoas por anotação`, async () => {
        const { share, setRole, login, ana } = await three();
        const people = [];
        for (let i = 0; i < MAX_MEMBERS; i++) people.push(await login(`p${i}`, `P${i}`));
        const r = await share(
          ana.token,
          'nota-1',
          people.map((p) => ({ codigo: p.codigo, papel: 'leitor' })),
        );
        expect(r.status).toBe(201);
        const extra = await login('extra', 'Extra');
        const more = await setRole(ana.token, 'nota-1', extra.codigo, 'leitor');
        expect(more.status).toBe(400);
        expect(more.body.erro).toBe('gente-demais');
      });

      it(`o freio do dia: até ${MAX_SHARES_PER_DAY} pessoas novas`, async () => {
        const { db, setRole, share, ana, bia } = await three();
        await db.batch(
          Array.from({ length: MAX_SHARES_PER_DAY }, () => ({
            sql: "INSERT INTO freios (usuario_id, acao, criado_em) VALUES (?, 'compartilhar', ?)",
            params: [ana.id, NOW.toISOString()],
          })),
        );
        await share(ana.token, 'nota-1');
        const r = await setRole(ana.token, 'nota-1', bia.codigo, 'leitor');
        expect(r.status).toBe(429);
        expect(r.body.erro).toBe('compartilhar-devagar');
      });
    });

    describe('os papéis', () => {
      async function shared() {
        const t = await three();
        await t.share(t.ana.token, 'nota-1', [
          { codigo: t.bia.codigo, papel: 'editor' },
          { codigo: t.cris.codigo, papel: 'leitor' },
        ]);
        return t;
      }

      it('quem não está na anotação não a vê nem grava (para ele, ela não existe)', async () => {
        const { login, details, put } = await shared();
        const davi = await login('davi', 'Davi');
        expect(await details(davi.token, ['nota-1'])).toEqual([]);
        const r = await put(davi.token, 'nota-1', { base: 1, dados: nota('nota-1') });
        expect(r.status).toBe(404);
        expect(r.body.erro).toBe('nota-nao-encontrada');
      });

      it('o leitor só lê (403 so-leitura)', async () => {
        const { put, cris } = await shared();
        const r = await put(cris.token, 'nota-1', { base: 1, dados: nota('nota-1', { text: 'outro' }) });
        expect(r.status).toBe(403);
        expect(r.body.erro).toBe('so-leitura');
      });

      it('o editor escreve, e a vez sobe', async () => {
        const { put, details, ana, bia } = await shared();
        const r = await put(bia.token, 'nota-1', { base: 1, dados: nota('nota-1', { text: 'arroz\nfeijão\nleite' }) });
        expect(r.status).toBe(200);
        expect(r.body.nota.rev).toBe(2);
        const [d] = await details(ana.token, ['nota-1']);
        expect(d.dados.text).toBe('arroz\nfeijão\nleite');
        expect(d.atualizadoPor.nome).toBe('Bia');
      });

      it('o editor não muda a categoria, as tags nem quem vê (403 so-gestor); a ordem das tags não conta', async () => {
        const { put, share, setRole, login, ana } = await shared();
        expect((await put(ana.token, 'nota-1', { base: 1, dados: nota('nota-1', { tags: ['a', 'b'] }) })).status).toBe(200);
        const t = await login('bia', 'Bia');
        for (const change of [{ category: 'Casa' }, { tags: ['a'] }, { tags: ['a', 'b'], private: true }, { tags: ['a', 'b'], quiet: true }]) {
          const r = await put(t.token, 'nota-1', { base: 2, dados: nota('nota-1', change) });
          expect(r.status, JSON.stringify(change)).toBe(403);
          expect(r.body.erro).toBe('so-gestor');
        }
        expect((await put(t.token, 'nota-1', { base: 2, dados: nota('nota-1', { tags: ['b', 'a'], text: 'x' }) })).status).toBe(200);
        void share;
        void setRole;
      });

      it('o editor não põe nem tira ninguém; o gestor põe, troca o papel e tira', async () => {
        const { setRole, drop, login, index, bia, cris, ana } = await shared();
        const davi = await login('davi', 'Davi');
        expect((await setRole(bia.token, 'nota-1', davi.codigo, 'leitor')).body.erro).toBe('so-gestor');
        expect((await drop(bia.token, 'nota-1', cris.codigo)).body.erro).toBe('so-gestor');
        expect((await setRole(ana.token, 'nota-1', bia.codigo, 'gestor')).status).toBe(200);
        expect((await setRole(bia.token, 'nota-1', davi.codigo, 'editor')).status).toBe(201);
        expect((await setRole(bia.token, 'nota-1', cris.codigo, 'editor')).status).toBe(200);
        expect((await drop(bia.token, 'nota-1', davi.codigo)).status).toBe(200);
        expect(await index(davi.token)).toEqual([]);
        expect((await index(cris.token))[0]?.papel).toBe('editor');
      });

      it('o gestor muda as tags, mas não tira a dona, não muda o papel dela e não apaga a anotação para todos', async () => {
        const { setRole, drop, put, res, json, ana, bia } = await shared();
        await setRole(ana.token, 'nota-1', bia.codigo, 'gestor');
        expect((await put(bia.token, 'nota-1', { base: 1, dados: nota('nota-1', { tags: ['nova'], private: true }) })).status).toBe(200);
        expect((await drop(bia.token, 'nota-1', ana.codigo)).body.erro).toBe('e-o-dono');
        expect((await setRole(bia.token, 'nota-1', ana.codigo, 'leitor')).body.erro).toBe('e-o-dono');
        const del = await res(json('DELETE', '/v1/notas/nota-1', undefined, bia.token));
        expect(del.status).toBe(403);
        expect(del.body.erro).toBe('so-dono');
      });

      it('ninguém muda o próprio papel, e a dona não sai da própria anotação', async () => {
        const { setRole, drop, ana, bia } = await shared();
        await setRole(ana.token, 'nota-1', bia.codigo, 'gestor');
        expect((await setRole(bia.token, 'nota-1', bia.codigo, 'leitor')).body.erro).toBe('e-voce');
        expect((await drop(ana.token, 'nota-1', 'eu')).body.erro).toBe('e-o-dono');
      });

      it('mudar as pessoas sobe a versão para todos (o site baixa a lista nova)', async () => {
        const { setRole, index, ana, bia, cris } = await shared();
        const before = (await index(cris.token))[0]!.versao;
        await setRole(ana.token, 'nota-1', bia.codigo, 'leitor');
        expect((await index(cris.token))[0]?.versao).toBe(before + 1);
      });

      it('sair e ser posto de novo avisa de novo', async () => {
        const { drop, setRole, feed, ana, bia, advance } = await shared();
        await drop(bia.token, 'nota-1', 'eu');
        advance(60_000);
        await setRole(ana.token, 'nota-1', bia.codigo, 'leitor');
        const f = await feed(bia.token);
        expect(f.itens).toHaveLength(1);
        expect(f.itens[0].em).toBe(new Date(NOW.getTime() + 60_000).toISOString());
      });
    });

    describe('a vez de gravar e o conflito', () => {
      async function shared() {
        const t = await three();
        await t.share(t.ana.token, 'nota-1', [
          { codigo: t.bia.codigo, papel: 'editor' },
          { codigo: t.cris.codigo, papel: 'leitor' },
        ]);
        return t;
      }

      it('gravar a partir de uma vez velha responde 409 com a anotação de agora, para juntar', async () => {
        const { put, ana, bia } = await shared();
        await put(ana.token, 'nota-1', { base: 1, dados: nota('nota-1', { text: 'de Ana' }) });
        const r = await put(bia.token, 'nota-1', { base: 1, dados: nota('nota-1', { text: 'de Bia' }) });
        expect(r.status).toBe(409);
        expect(r.body.erro).toBe('conflito');
        expect(r.body.nota).toMatchObject({ rev: 2, dados: { text: 'de Ana' } });
      });

      it('sem a vez, ou com uma que não é número, recusa', async () => {
        const { put, ana } = await shared();
        expect((await put(ana.token, 'nota-1', { dados: nota('nota-1') })).body.erro).toBe('sem-rev');
        expect((await put(ana.token, 'nota-1', { base: '1', dados: nota('nota-1') })).body.erro).toBe('sem-rev');
      });

      it('duas gravações seguidas da mesma pessoa em menos de 1 s: a segunda espera (429)', async () => {
        const { res, json, advance, ana } = await shared();
        advance(MIN_EDIT_MS);
        expect((await res(json('PUT', '/v1/notas/nota-1', { base: 1, dados: nota('nota-1', { text: '1' }) }, ana.token))).status).toBe(200);
        const r = await res(json('PUT', '/v1/notas/nota-1', { base: 2, dados: nota('nota-1', { text: '2' }) }, ana.token));
        expect(r.status).toBe(429);
      });

      it('o conflito fica guardado com as duas versões e quem fez cada uma; o leitor não vê', async () => {
        const { put, details, ana, bia, cris } = await shared();
        await put(ana.token, 'nota-1', { base: 1, dados: nota('nota-1', { text: 'Ana mexeu' }) });
        const r = await put(bia.token, 'nota-1', { base: 2, dados: nota('nota-1', { text: 'Ana mexeu' }), conflito: { b: nota('nota-1', { text: 'Bia mexeu' }) } });
        expect(r.status).toBe(200);
        expect(r.body.nota.conflito).toMatchObject({ a: { text: 'Ana mexeu' }, b: { text: 'Bia mexeu' }, autorA: { nome: 'Ana' }, autorB: { nome: 'Bia' } });
        const [forAna] = await details(ana.token, ['nota-1']);
        expect(forAna.conflito.b.text).toBe('Bia mexeu');
        const [forCris] = await details(cris.token, ['nota-1']);
        expect(forCris.conflito).toBeUndefined();
        expect(forCris.dados.text).toBe('Ana mexeu');
      });

      it('uma edição comum não tira o conflito; escolher (`resolver`) tira', async () => {
        const { put, details, ana, bia } = await shared();
        await put(bia.token, 'nota-1', { base: 1, dados: nota('nota-1', { text: 'a' }), conflito: { b: nota('nota-1', { text: 'b' }) } });
        await put(ana.token, 'nota-1', { base: 2, dados: nota('nota-1', { text: 'a!' }) });
        expect((await details(ana.token, ['nota-1']))[0].conflito).toBeDefined();
        const r = await put(ana.token, 'nota-1', { base: 3, dados: nota('nota-1', { text: 'b' }), resolver: true });
        expect(r.status).toBe(200);
        expect(r.body.nota.conflito).toBeUndefined();
        expect((await details(bia.token, ['nota-1']))[0].dados.text).toBe('b');
      });

      it('o editor escolhe a versão de um gestor mesmo que ela mude as tags (a estrutura de uma das duas vale)', async () => {
        const { put, setRole, ana, bia, cris } = await shared();
        await setRole(ana.token, 'nota-1', cris.codigo, 'gestor');
        // Cris (gestora) mudou as tags e brigou com a versão de agora
        await put(cris.token, 'nota-1', { base: 1, dados: nota('nota-1', { text: 'x' }), conflito: { b: nota('nota-1', { text: 'y', tags: ['cris'] }) } });
        const r = await put(bia.token, 'nota-1', { base: 2, dados: nota('nota-1', { text: 'y', tags: ['cris'] }), resolver: true });
        expect(r.status).toBe(200);
        // mas não inventa uma terceira
        const r2 = await put(bia.token, 'nota-1', { base: 3, dados: nota('nota-1', { text: 'y', tags: ['bia'] }) });
        expect(r2.status).toBe(403);
      });

      it('o editor não manda um conflito com outra estrutura', async () => {
        const { put, bia } = await shared();
        const r = await put(bia.token, 'nota-1', { base: 1, dados: nota('nota-1'), conflito: { b: nota('nota-1', { category: 'Outra' }) } });
        expect(r.status).toBe(403);
      });

      it('o leitor não escolhe num conflito', async () => {
        const { put, cris, bia } = await shared();
        await put(bia.token, 'nota-1', { base: 1, dados: nota('nota-1', { text: 'a' }), conflito: { b: nota('nota-1', { text: 'b' }) } });
        expect((await put(cris.token, 'nota-1', { base: 2, dados: nota('nota-1', { text: 'b' }), resolver: true })).status).toBe(403);
      });
    });

    describe('comentários', () => {
      /** Ana compartilha nota-1 com Bia e Cris (ninguém segue ninguém) e deixa a anotação privada (fora do mural público). */
      async function talking() {
        const t = await three();
        const dan = await t.login('dan', 'Dan');
        await t.share(t.ana.token, 'nota-1', [
          { codigo: t.bia.codigo, papel: 'leitor' },
          { codigo: t.cris.codigo, papel: 'editor' },
        ]);
        await t.db.batch([{ sql: 'UPDATE usuarios SET fichas_publicas = ? WHERE id = ?', params: ['[]', t.ana.id] }]);
        const comment = (token: string, texto: string, ref = 'nota-1') =>
          t.res(t.json('POST', `/v1/murais/${t.ana.codigo}/comentarios/${ref}`, { texto, titulo: 'Lista do mercado', mural: 'anotacoes' }, token));
        const thread = (token?: string) => t.res(t.json('GET', `/v1/murais/${t.ana.codigo}/comentarios/nota-1`, undefined, token));
        const counts = async (token?: string) => (await t.res(t.json('GET', `/v1/murais/${t.ana.codigo}/comentarios`, undefined, token))).body.contagem;
        const notices = async (token: string) =>
          ((await t.feed(token)).itens as any[]).filter((i) => i.tipo === 'comentou').map((i) => [i.pessoa.nome, i.ref, i.titulo, i.mural]);
        return { ...t, dan, comment, thread, counts, notices };
      }

      it('na privada, a dona e quem está nela comentam e leem, mesmo sem seguir; os outros não veem nada', async () => {
        const { comment, thread, counts, ana, bia, cris, dan } = await talking();
        expect((await comment(ana.token, 'Lembrete: comprar café.')).status).toBe(201);
        expect((await comment(bia.token, 'Eu levo o café.')).status).toBe(201);
        expect((await comment(cris.token, 'E eu o pão.')).status).toBe(201);
        for (const who of [ana, bia, cris]) {
          const r = await thread(who.token);
          expect([r.status, r.body.pode], who.nome).toEqual([200, true]);
          expect(r.body.comentarios.map((k: any) => k.autor.nome)).toEqual(['Ana', 'Bia', 'Cris']);
          expect(await counts(who.token)).toEqual({ 'nota-1': 3 });
        }
        expect((await thread(dan.token)).status).toBe(404);
        expect((await thread()).status).toBe(404);
        expect(await counts(dan.token)).toEqual({});
        expect(await counts()).toEqual({});
        expect((await comment(dan.token, 'Oi?')).status).not.toBe(201);
      });

      it('quem está nela reage aos comentários sem seguir a dona', async () => {
        const { comment, res, json, ana, bia } = await talking();
        const id = (await comment(ana.token, 'Alguém viu o açúcar?')).body.comentario.id;
        expect((await res(json('PUT', `/v1/comentarios/${id}/reacao`, { reacao: 'fogo' }, bia.token))).status).toBe(201);
      });

      it('o aviso chega a todos que estão nela, menos a quem escreveu; quem sai deixa de ver', async () => {
        const { comment, notices, drop, ana, bia, cris } = await talking();
        await comment(ana.token, 'Lembrete: comprar café.');
        expect(await notices(ana.token)).toEqual([]);
        expect(await notices(bia.token)).toEqual([['Ana', 'nota-1', 'Lista do mercado', 'anotacoes']]);
        expect(await notices(cris.token)).toEqual([['Ana', 'nota-1', 'Lista do mercado', 'anotacoes']]);
        await comment(bia.token, 'Eu levo o café.');
        expect(await notices(ana.token)).toEqual([['Bia', 'nota-1', 'Lista do mercado', 'anotacoes']]);
        expect(await notices(bia.token)).toEqual([['Ana', 'nota-1', 'Lista do mercado', 'anotacoes']]);
        expect((await notices(cris.token)).map((n) => n[0]).sort()).toEqual(['Ana', 'Bia']);
        expect((await drop(cris.token, 'nota-1', 'eu')).status).toBe(200);
        expect(await notices(cris.token)).toEqual([]);
      });

      it('apagar o comentário da dona tira o aviso dos outros', async () => {
        const { comment, notices, res, json, ana, bia } = await talking();
        const id = (await comment(ana.token, 'Lembrete: comprar café.')).body.comentario.id;
        expect(await notices(bia.token)).toHaveLength(1);
        expect((await res(json('DELETE', `/v1/comentarios/${id}`, undefined, ana.token))).status).toBe(200);
        expect(await notices(bia.token)).toEqual([]);
      });
    });

    describe('sair, apagar e ir embora', () => {
      it('a dona apaga para todos: some das listas e do correio de todo mundo', async () => {
        const { share, index, feed, res, json, ana, bia } = await three();
        await share(ana.token, 'nota-1', [{ codigo: bia.codigo, papel: 'editor' }]);
        const r = await res(json('DELETE', '/v1/notas/nota-1', undefined, ana.token));
        expect(r.status).toBe(200);
        expect(await index(ana.token)).toEqual([]);
        expect(await index(bia.token)).toEqual([]);
        expect((await feed(bia.token)).itens).toEqual([]);
      });

      it('a dona apaga a conta: as anotações dela somem para todos', async () => {
        const { share, index, res, json, db, ana, bia } = await three();
        await share(ana.token, 'nota-1', [{ codigo: bia.codigo, papel: 'editor' }]);
        expect((await res(json('DELETE', '/v1/eu', undefined, ana.token))).status).toBe(200);
        expect(await index(bia.token)).toEqual([]);
        expect(await db.all('SELECT * FROM notas')).toEqual([]);
        expect(await db.all('SELECT * FROM nota_membros')).toEqual([]);
        expect(await db.all("SELECT * FROM atividades WHERE tipo = 'compartilhou'")).toEqual([]);
      });

      it('uma pessoa apaga a conta: sai das anotações dos outros, e eles veem a lista nova', async () => {
        const { share, index, details, res, json, ana, bia, cris } = await three();
        await share(ana.token, 'nota-1', [
          { codigo: bia.codigo, papel: 'editor' },
          { codigo: cris.codigo, papel: 'leitor' },
        ]);
        const before = (await index(ana.token))[0]!.versao;
        await res(json('DELETE', '/v1/eu', undefined, bia.token));
        expect((await index(ana.token))[0]?.versao).toBe(before + 1);
        const [d] = await details(ana.token, ['nota-1']);
        expect(d.membros.map((m: any) => m.nome)).toEqual(['Cris']);
      });

      it('os detalhes pedem até 25 de uma vez e ignoram ids que não servem', async () => {
        const { share, details, ana } = await three();
        await share(ana.token, 'nota-1');
        const out = await details(ana.token, ['nota-1', 'x', 'nota-2', 'nota-1']);
        expect(out.map((n: any) => n.id)).toEqual(['nota-1']);
      });

      it('sem sessão, nada', async () => {
        const { res, json } = await three();
        expect((await res(json('GET', '/v1/eu/notas'))).status).toBe(401);
        expect((await res(json('POST', '/v1/notas', { id: 'nota-1', dados: nota('nota-1') }))).status).toBe(401);
      });
    });
  });
}
