import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { googleVerifier } from '../src/domain/google';
import { MIN_GROUP_EDIT_MS } from '../src/routes/groups';
import { MIN_EDIT_MS } from '../src/routes/notes';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, eraseNow, gzip, jsonCaller } from './harness';

/**
 * Os grupos compartilhados (migração 0025, PLANO-COMPARTILHAR.md): o documento do grupo, as pessoas e os
 * papéis (a tabela 3.2 do plano, conferida aqui no servidor, linha a linha), as anotações do grupo (do dono
 * do grupo; o editor apaga só as que escreveu), pôr e tirar uma anotação do grupo, sair e parar de
 * compartilhar (o escrito fica no grupo), o aviso, os comentários de quem está no grupo, o público servido
 * pela nuvem e o que sai junto com a conta. Roda nos dois bancos, como as outras suítes.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000' };
const GRUPO = 'gTrabalho001';

const nota = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'anotacoes',
  game: { name: `Tarefa ${id}`, coverUrl: null, source: 'manual' },
  text: 'fazer',
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...extra,
});
const doc = (extra: Record<string, unknown> = {}) => ({ nome: 'Trabalho', aparencia: { icone: 'pasta', cor: 'azul' }, kanban: { colunas: ['A fazer'] }, ...extra });

export function gruposSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'grupos', alg: 'RS256' };
  });

  async function setup() {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig(ENV);
    const clock = { t: NOW.getTime() };
    const deps: Deps = { db, config, now: () => new Date(clock.t), verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })) };
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
        .setProtectedHeader({ alg: 'RS256', kid: 'grupos' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = (await (await json('POST', '/v1/auth/google', { credential })).json()) as any;
      return { token: b.token as string, codigo: b.conta.codigo as string, id: b.conta.id as string };
    };
    const ana = await login('ana', 'Ana');
    const bia = await login('bia', 'Bia');
    const cris = await login('cris', 'Cris');
    const davi = await login('davi', 'Davi');
    /** Ana compartilha o Trabalho: Bia gestora, Cris editora, Davi leitor. */
    const shareGroup = (extra: Record<string, unknown> = {}) =>
      res(
        json(
          'POST',
          '/v1/grupos',
          {
            id: GRUPO,
            dados: doc(),
            membros: [
              { codigo: bia.codigo, papel: 'gestor' },
              { codigo: cris.codigo, papel: 'editor' },
              { codigo: davi.codigo, papel: 'leitor' },
            ],
            ...extra,
          },
          ana.token,
        ),
      );
    const putGroup = async (token: string, body: Record<string, unknown>) => {
      const r = await res(json('PUT', `/v1/grupos/${GRUPO}`, body, token));
      advance(MIN_GROUP_EDIT_MS + 500);
      return r;
    };
    const newNote = (token: string, id: string, grupo: string | null = GRUPO) => res(json('POST', '/v1/notas', { id, dados: nota(id), ...(grupo ? { grupo } : {}) }, token));
    const putNote = async (token: string, id: string, body: Record<string, unknown>) => {
      const r = await res(json('PUT', `/v1/notas/${id}`, body, token));
      advance(MIN_EDIT_MS + 500);
      return r;
    };
    const notes = async (token: string) => ((await res(json('GET', '/v1/eu/notas', undefined, token))).body.notas as { id: string; papel: string }[]).sort((a, b) => (a.id < b.id ? -1 : 1));
    const groups = async (token: string) => (await res(json('GET', '/v1/eu/grupos', undefined, token))).body.grupos as { id: string; papel: string }[];
    /** Um quadro livre (o servidor não abre: só confere o gzip), com o grupo e o público nos cabeçalhos. */
    const board = (id: string) => JSON.stringify({ v: 1, id, nome: 'Planta', grupo: 'Trabalho', em: NOW.toISOString(), n: [], e: [] });
    const putBoard = async (token: string, id: string, base: number, headers: Record<string, string> = {}) => {
      const r = await app.request(`https://api.teste/v1/eu/quadros/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/gzip', 'Quadro-Rev-Base': String(base), ...headers },
        body: await gzip(board(id)),
      });
      advance(2_500);
      return { status: r.status, body: (await r.json().catch(() => null)) as any };
    };
    const boards = async (token: string) => ((await res(json('GET', '/v1/eu/quadros', undefined, token))).body.quadros as any[]).map((q) => [q.id, q.papel ?? 'dono']);
    return { db, deps, json, res, advance, login, putBoard, boards, ana, bia, cris, davi, shareGroup, putGroup, newNote, putNote, notes, groups };
  }

  describe(`Grupos compartilhados (${label})`, () => {
    it('o dono compartilha o grupo: cada um o vê com o seu papel, e o detalhe traz o documento e as pessoas', async () => {
      const t = await setup();
      const r = await t.shareGroup();
      expect(r.status).toBe(201);
      expect(r.body.grupo).toMatchObject({ id: GRUPO, papel: 'dono', rev: 1, publico: false, notas: 0, dados: { nome: 'Trabalho' } });
      expect(r.body.grupo.membros.map((m: any) => [m.nome, m.papel]).sort()).toEqual([
        ['Bia', 'gestor'],
        ['Cris', 'editor'],
        ['Davi', 'leitor'],
      ]);
      expect(await t.groups(t.cris.token)).toEqual([{ id: GRUPO, versao: 1, papel: 'editor' }]);
      const d = (await t.res(t.json('GET', `/v1/eu/grupos/detalhes?ids=${GRUPO}`, undefined, t.davi.token))).body.grupos;
      expect(d[0]).toMatchObject({ papel: 'leitor', dono: { nome: 'Ana' } });
    });

    it('o documento: o editor mexe no Kanban; o nome, a cor e o público, só o dono e os gestores; o leitor nada', async () => {
      const t = await setup();
      await t.shareGroup();
      expect((await t.putGroup(t.cris.token, { base: 1, dados: doc({ kanban: { colunas: ['A fazer', 'Feito'] } }) })).status).toBe(200);
      expect((await t.putGroup(t.cris.token, { base: 2, dados: doc({ nome: 'Outro', kanban: { colunas: ['A fazer', 'Feito'] } }) })).body.erro).toBe('so-gestor');
      expect((await t.putGroup(t.cris.token, { base: 2, publico: true })).body.erro).toBe('so-gestor');
      expect((await t.putGroup(t.davi.token, { base: 2, dados: doc() })).body.erro).toBe('so-leitura');
      const ok = await t.putGroup(t.bia.token, { base: 2, dados: doc({ nome: 'Trabalho e Casa', kanban: { colunas: ['A fazer', 'Feito'] } }), publico: true });
      expect(ok.status).toBe(200);
      expect(ok.body.grupo).toMatchObject({ rev: 3, publico: true, dados: { nome: 'Trabalho e Casa' } });
      // a base velha: 409 com o grupo de agora, para o site juntar
      const stale = await t.putGroup(t.cris.token, { base: 2, dados: doc() });
      expect(stale.status).toBe(409);
      expect(stale.body.grupo.rev).toBe(3);
    });

    it('pessoas: o gestor chama e troca papéis; o editor não; ninguém mexe no dono', async () => {
      const t = await setup();
      await t.shareGroup();
      expect((await t.res(t.json('PUT', `/v1/grupos/${GRUPO}/membros/${t.davi.codigo}`, { papel: 'editor' }, t.cris.token))).body.erro).toBe('so-gestor');
      expect((await t.res(t.json('PUT', `/v1/grupos/${GRUPO}/membros/${t.davi.codigo}`, { papel: 'editor' }, t.bia.token))).status).toBe(200);
      expect((await t.groups(t.davi.token))[0]?.papel).toBe('editor');
      expect((await t.res(t.json('PUT', `/v1/grupos/${GRUPO}/membros/${t.ana.codigo}`, { papel: 'leitor' }, t.bia.token))).body.erro).toBe('e-o-dono');
      expect((await t.res(t.json('DELETE', `/v1/grupos/${GRUPO}/membros/${t.ana.codigo}`, undefined, t.bia.token))).body.erro).toBe('e-o-dono');
    });

    it('as anotações do grupo: quem escreve cria (e ela é do dono do grupo); o leitor não; todos a recebem com o papel do grupo', async () => {
      const t = await setup();
      await t.shareGroup();
      const r = await t.newNote(t.cris.token, 'n-cris1');
      expect(r.status).toBe(201);
      expect(r.body.nota).toMatchObject({ papel: 'editor', grupo: GRUPO, dono: { nome: 'Ana' }, criadoPor: { nome: 'Cris' } });
      expect((await t.newNote(t.davi.token, 'n-davi1')).body.erro).toBe('so-leitura');
      expect(await t.notes(t.ana.token)).toEqual([{ id: 'n-cris1', versao: 1, papel: 'dono' }]);
      expect(await t.notes(t.davi.token)).toEqual([{ id: 'n-cris1', versao: 1, papel: 'leitor' }]);
      expect((await t.putNote(t.davi.token, 'n-cris1', { base: 1, dados: nota('n-cris1', { text: 'outro' }) })).body.erro).toBe('so-leitura');
      expect((await t.putNote(t.bia.token, 'n-cris1', { base: 1, dados: nota('n-cris1', { text: 'outro' }) })).status).toBe(200);
      // a pasta e as tags são do grupo: ficam guardadas (numa compartilhada solta, são de cada um e saem)
      await t.putNote(t.cris.token, 'n-cris1', { base: 2, dados: nota('n-cris1', { tags: ['urgente'], folder: 'pAbcdefgh', category: 'Trabalho' }) });
      const row = await t.db.first<{ dados: string }>('SELECT dados FROM notas WHERE id = ?', ['n-cris1']);
      expect(JSON.parse(row!.dados)).toMatchObject({ tags: ['urgente'], folder: 'pAbcdefgh' });
      expect(JSON.parse(row!.dados).category).toBeUndefined();
    });

    it('apagar: o editor apaga só as que escreveu; o gestor e o dono, qualquer uma; o leitor nenhuma (P3)', async () => {
      const t = await setup();
      await t.shareGroup();
      await t.newNote(t.cris.token, 'n-cris1');
      await t.newNote(t.bia.token, 'n-bia01');
      await t.newNote(t.ana.token, 'n-ana01');
      const del = (token: string, id: string) => t.res(t.json('DELETE', `/v1/notas/${id}`, undefined, token));
      expect((await del(t.cris.token, 'n-bia01')).body.erro).toBe('so-quem-escreveu');
      expect((await del(t.davi.token, 'n-cris1')).status).toBe(403);
      expect((await del(t.cris.token, 'n-cris1')).status).toBe(200);
      expect((await del(t.bia.token, 'n-ana01')).status).toBe(200);
      expect((await del(t.ana.token, 'n-bia01')).status).toBe(200);
      expect(await t.notes(t.ana.token)).toEqual([]);
    });

    it('pôr no grupo de outra pessoa leva junto a conversa da anotação (ela passa a morar no mural do dono do grupo)', async () => {
      const t = await setup();
      await t.shareGroup();
      await t.newNote(t.cris.token, 'n-solta1', null);
      await t.res(t.json('POST', `/v1/murais/${t.cris.codigo}/comentarios/n-solta1`, { texto: 'lembrete', titulo: 'Tarefa', mural: 'anotacoes' }, t.cris.token));
      await t.res(t.json('PUT', '/v1/notas/n-solta1/grupo', { grupo: GRUPO }, t.cris.token));
      const thread = await t.res(t.json('GET', `/v1/murais/${t.ana.codigo}/comentarios/n-solta1`, undefined, t.bia.token));
      expect(thread.body.comentarios.map((k: any) => k.texto)).toEqual(['lembrete']);
    });

    it('pôr e tirar do grupo: quem é dono da anotação e escreve no grupo põe (ela passa a ser do dono do grupo); só gestor tira', async () => {
      const t = await setup();
      await t.shareGroup();
      // uma compartilhada solta da Cris (com ninguém), que ela leva para o grupo da Ana
      expect((await t.newNote(t.cris.token, 'n-solta1', null)).status).toBe(201);
      const move = (token: string, id: string, grupo: string | null) => t.res(t.json('PUT', `/v1/notas/${id}/grupo`, { grupo }, token));
      expect((await move(t.davi.token, 'n-solta1', GRUPO)).status).toBe(404);
      const r = await move(t.cris.token, 'n-solta1', GRUPO);
      expect(r.status).toBe(200);
      expect(r.body.nota).toMatchObject({ grupo: GRUPO, dono: { nome: 'Ana' }, criadoPor: { nome: 'Cris' }, papel: 'editor' });
      expect((await t.notes(t.davi.token)).map((n) => n.id)).toEqual(['n-solta1']);
      // a editora não tira; a gestora tira: ela fica com a Ana, sem grupo, e os outros deixam de vê-la
      expect((await move(t.cris.token, 'n-solta1', null)).body.erro).toBe('so-gestor');
      const out = await move(t.bia.token, 'n-solta1', null);
      expect(out.status).toBe(200);
      expect(await t.notes(t.davi.token)).toEqual([]);
      expect(await t.notes(t.ana.token)).toEqual([{ id: 'n-solta1', versao: 3, papel: 'dono' }]);
    });

    it('sair do grupo: quem sai perde o acesso a tudo, até ao que escreveu, que fica no grupo (P4)', async () => {
      const t = await setup();
      await t.shareGroup();
      await t.newNote(t.cris.token, 'n-cris1');
      expect((await t.res(t.json('DELETE', `/v1/grupos/${GRUPO}/membros/eu`, undefined, t.cris.token))).status).toBe(200);
      expect(await t.groups(t.cris.token)).toEqual([]);
      expect(await t.notes(t.cris.token)).toEqual([]);
      expect((await t.res(t.json('GET', '/v1/eu/notas/detalhes?ids=n-cris1', undefined, t.cris.token))).body.notas).toEqual([]);
      expect((await t.notes(t.bia.token)).map((n) => n.id)).toEqual(['n-cris1']);
      // o dono não sai: para de compartilhar
      expect((await t.res(t.json('DELETE', `/v1/grupos/${GRUPO}/membros/eu`, undefined, t.ana.token))).body.erro).toBe('e-o-dono');
    });

    it('parar de compartilhar: só o dono; tudo fica com ele, e os outros deixam de ver', async () => {
      const t = await setup();
      await t.shareGroup();
      await t.newNote(t.cris.token, 'n-cris1');
      expect((await t.res(t.json('DELETE', `/v1/grupos/${GRUPO}`, undefined, t.bia.token))).body.erro).toBe('so-dono');
      expect((await t.res(t.json('DELETE', `/v1/grupos/${GRUPO}`, undefined, t.ana.token))).status).toBe(200);
      expect(await t.groups(t.bia.token)).toEqual([]);
      expect(await t.notes(t.bia.token)).toEqual([]);
      expect((await t.notes(t.ana.token)).map((n) => [n.id, n.papel])).toEqual([['n-cris1', 'dono']]);
    });

    it('o aviso: "compartilhou o grupo com você", com o nome e o papel de agora; sai junto quando a pessoa sai', async () => {
      const t = await setup();
      t.advance(60_000);
      await t.shareGroup();
      const feed = async (token: string) => (await t.res(t.json('GET', '/v1/eu/notificacoes', undefined, token))).body;
      const f = await feed(t.cris.token);
      expect(f.itens).toHaveLength(1);
      expect(f.itens[0]).toMatchObject({ tipo: 'compartilhou-grupo', ref: GRUPO, titulo: 'Trabalho', papel: 'editor', pessoa: { nome: 'Ana' } });
      await t.res(t.json('DELETE', `/v1/grupos/${GRUPO}/membros/eu`, undefined, t.cris.token));
      expect((await feed(t.cris.token)).itens).toEqual([]);
    });

    it('comentários: quem está no grupo comenta numa anotação dele, mesmo privada e sem seguir o dono', async () => {
      const t = await setup();
      await t.shareGroup();
      await t.newNote(t.ana.token, 'n-ana01');
      const say = (token: string) =>
        t.res(t.json('POST', `/v1/murais/${t.ana.codigo}/comentarios/n-ana01`, { texto: 'Vou fazer', titulo: 'Tarefa', mural: 'anotacoes' }, token));
      expect((await say(t.davi.token)).status).toBe(201);
      // quem não está no grupo nem segue a Ana não comenta
      const eva = await t.login('eva', 'Eva');
      expect((await say(eva.token)).status).toBe(403);
    });

    it('o público: só o grupo público aparece pelo código, com as anotações, e a versão junta o grupo e elas', async () => {
      const t = await setup();
      await t.shareGroup();
      await t.newNote(t.cris.token, 'n-cris1');
      const list = () => t.res(t.json('GET', `/v1/murais/${t.ana.codigo}/grupos`));
      const one = (q = '') => t.res(t.json('GET', `/v1/murais/${t.ana.codigo}/grupos/${GRUPO}${q}`));
      expect((await list()).body.grupos).toEqual([]);
      expect((await one()).status).toBe(404);
      t.advance(MIN_GROUP_EDIT_MS + 500);
      await t.putGroup(t.ana.token, { base: 1, publico: true });
      expect((await list()).body.grupos).toEqual([{ id: GRUPO, versao: 2, nome: 'Trabalho' }]);
      const g = await one();
      expect(g.status).toBe(200);
      expect(g.body.grupo).toMatchObject({ id: GRUPO, dados: { nome: 'Trabalho' } });
      expect(g.body.notas.map((n: any) => n.id)).toEqual(['n-cris1']);
      // nada mudou: 204; uma anotação mudada muda a versão
      expect((await one(`?versao=${g.body.grupo.versao}`)).status).toBe(204);
      await t.putNote(t.cris.token, 'n-cris1', { base: 1, dados: nota('n-cris1', { text: 'feito' }) });
      expect((await one(`?versao=${g.body.grupo.versao}`)).status).toBe(200);
    });

    it('as anotações de grupo não gastam o limite de compartilhadas soltas da pessoa', async () => {
      const t = await setup();
      await t.shareGroup();
      await t.newNote(t.ana.token, 'n-ana01');
      const row = await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM notas WHERE dono_id = ? AND grupo_id IS NULL', [t.ana.id]);
      expect(row!.n).toBe(0);
    });

    it('os quadros livres vão junto com o grupo (P2): quem está nele lê; o editor grava; o leitor não; o público mostra', async () => {
      const t = await setup();
      await t.shareGroup();
      const Q = 'quadroGrupo0001qqqqqqq';
      expect((await t.putBoard(t.ana.token, Q, 0, { 'Quadro-Grupo': GRUPO })).status).toBe(200);
      expect(await t.boards(t.davi.token)).toEqual([[Q, 'leitor']]);
      expect(await t.boards(t.cris.token)).toEqual([[Q, 'editor']]);
      expect((await t.res(t.json('GET', `/v1/eu/quadros/${Q}`, undefined, t.davi.token))).status).toBe(200);
      // o editor grava no quadro da Ana (que continua dela); o leitor não
      expect((await t.putBoard(t.cris.token, Q, 1)).status).toBe(200);
      expect((await t.putBoard(t.davi.token, Q, 2)).body.erro).toBe('so-leitura');
      expect((await t.db.first<{ usuario_id: string }>('SELECT usuario_id FROM quadros WHERE id = ?', [Q]))!.usuario_id).toBe(t.ana.id);
      // quem não está no grupo nem sabe que ele existe
      const eva = await t.login('eva', 'Eva');
      expect((await t.res(t.json('GET', `/v1/eu/quadros/${Q}`, undefined, eva.token))).status).toBe(404);
      // o grupo público mostra o quadro a quem visita
      expect((await t.res(t.json('GET', `/v1/murais/${t.ana.codigo}/quadros`))).body.quadros).toEqual([]);
      t.advance(2_000);
      await t.res(t.json('PUT', `/v1/grupos/${GRUPO}`, { base: 1, publico: true }, t.ana.token));
      expect((await t.res(t.json('GET', `/v1/murais/${t.ana.codigo}/quadros`))).body.quadros.map((q: any) => q.id)).toEqual([Q]);
    });

    it('um quadro solto com pessoas: o dono chama, a pessoa vê e (editor) grava; sair tira; quem sai do grupo deixa o quadro que fez nele (P4)', async () => {
      const t = await setup();
      const Q = 'quadroSolto0001qqqqqqq';
      await t.putBoard(t.ana.token, Q, 0);
      expect((await t.res(t.json('PUT', `/v1/eu/quadros/${Q}/membros/${t.bia.codigo}`, { papel: 'editor' }, t.ana.token))).body.membros.map((m: any) => m.nome)).toEqual(['Bia']);
      expect(await t.boards(t.bia.token)).toEqual([[Q, 'editor']]);
      expect((await t.putBoard(t.bia.token, Q, 1)).status).toBe(200);
      expect((await t.res(t.json('PUT', `/v1/eu/quadros/${Q}/membros/${t.cris.codigo}`, { papel: 'leitor' }, t.bia.token))).body.erro).toBe('so-gestor');
      expect((await t.res(t.json('DELETE', `/v1/eu/quadros/${Q}/membros/eu`, undefined, t.bia.token))).status).toBe(200);
      expect(await t.boards(t.bia.token)).toEqual([]);
      // o quadro que a Cris fez no grupo da Ana fica no grupo, com a Ana, quando ela sai
      await t.shareGroup();
      const Q2 = 'quadroCris0001qqqqqqqq';
      await t.putBoard(t.cris.token, Q2, 0, { 'Quadro-Grupo': GRUPO });
      expect(await t.boards(t.ana.token)).toContainEqual([Q2, 'gestor']);
      await t.res(t.json('DELETE', `/v1/grupos/${GRUPO}/membros/eu`, undefined, t.cris.token));
      expect((await t.db.first<{ usuario_id: string }>('SELECT usuario_id FROM quadros WHERE id = ?', [Q2]))!.usuario_id).toBe(t.ana.id);
      expect(await t.boards(t.cris.token)).toEqual([]);
    });

    it('apagar a conta: a do dono leva o grupo e as anotações dele; a de quem está só a tira do grupo', async () => {
      const t = await setup();
      await t.shareGroup();
      await t.newNote(t.cris.token, 'n-cris1');
      await eraseNow(t.deps, t.cris.token);
      expect((await t.groups(t.bia.token))[0]).toMatchObject({ id: GRUPO });
      const people = (await t.res(t.json('GET', `/v1/eu/grupos/detalhes?ids=${GRUPO}`, undefined, t.bia.token))).body.grupos[0].membros.map((m: any) => m.nome);
      expect(people.sort()).toEqual(['Bia', 'Davi']);
      expect((await t.notes(t.bia.token)).map((n) => n.id)).toEqual(['n-cris1']);
      await eraseNow(t.deps, t.ana.token);
      expect(await t.groups(t.bia.token)).toEqual([]);
      expect(await t.notes(t.bia.token)).toEqual([]);
      expect(await t.db.first('SELECT 1 AS x FROM grupo_membros')).toBeNull();
    });
  });
}
