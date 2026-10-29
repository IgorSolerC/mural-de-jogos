import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ContextoNotasV1, NotaV1 } from '../../contrato/api-v1/notas';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { PER_KEY_DAY } from '../src/domain/requests';
import { utcDay } from '../src/domain/quota';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gzip, jsonCaller, eraseNow } from './harness';

/**
 * Escrever nas Anotações (PLANO-API.md, rodada 3): a chave pede, a nuvem guarda o pedido e mostra a
 * nota como vai ficar; o site pega, aplica, conclui, aprova, recusa e desfaz. Roda nos dois bancos.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };
const DAY = 86_400_000;

function nota(id: string, extra: Partial<NotaV1> = {}): NotaV1 {
  return {
    id,
    titulo: `Nota ${id}`,
    texto: 'Começo.\n- [ ] mandar a ata\n- [x] reservar a sala',
    grupo: 'Trabalho',
    assunto: null,
    tags: [],
    data: null,
    finalizada_em: null,
    fixada: false,
    visibilidade: 'privada',
    capa: null,
    tarefas: { feitas: 1, total: 2 },
    kanban: null,
    criada_em: '2026-10-01T10:00:00.000Z',
    versao: '2026-10-01T10:00:00.000Z',
    ...extra,
  };
}

const CONTEXTO: ContextoNotasV1 = {
  grupos: [
    { nome: 'Trabalho', notas: 1, assuntos: [], tags: [] },
    { nome: 'Estudos', notas: 1, assuntos: [], tags: [] },
  ],
  sem_grupo: { notas: 0, tags: [] },
  tags_fixas: [],
};

export function pedidosSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'pedidos', alg: 'RS256' };
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
    const body = async (res: Response | Promise<Response>) => (await (await res).json()) as any;
    const login = async (sub: string) => {
      const credential = await new SignJWT({ given_name: sub })
        .setProtectedHeader({ alg: 'RS256', kid: 'pedidos' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = await body(json('POST', '/v1/auth/google', { credential }));
      return { token: b.token as string, codigo: b.conta.codigo as string, id: b.conta.id as string };
    };
    const newKey = async (token: string, extra: Record<string, unknown> = {}) =>
      (await body(json('POST', '/v1/eu/chaves', { nome: 'AI', escopos: ['notas:ler', 'notas:criar', 'notas:editar'], validade: 30, ...extra }, token))) as {
        segredo: string;
        chave: { id: string };
      };
    /** A AI chamando com a chave (e o Idempotency-Key, se vier). */
    const ai = (secret: string, method: string, path: string, payload?: unknown, idem?: string) =>
      call(path, {
        method,
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(idem ? { 'Idempotency-Key': idem } : {}) },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
    /** Uma conta com mural, o espelho com duas notas e o contexto, e uma chave que lê e escreve. */
    const ready = async (keyExtra: Record<string, unknown> = {}) => {
      const me = await login('ana');
      const k = await newKey(me.token, keyExtra);
      const form = new FormData();
      form.append('privado', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      form.append('publico', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      await call('/v1/eu/mural', { method: 'PUT', headers: { Authorization: `Bearer ${me.token}`, 'Mural-Rev-Base': '0' }, body: form });
      advance(5_000);
      const item = (dados: unknown, tipo: string, id: string) => ({ tipo, id, hash: 'ab'.repeat(8), dados });
      const res = await json(
        'POST',
        '/v1/eu/espelho',
        { rev: 1, poe: [item(nota('trab-1'), 'nota', 'trab-1'), item(nota('estu-1', { grupo: 'Estudos' }), 'nota', 'estu-1'), item(CONTEXTO, 'contexto', 'notas')] },
        me.token,
      );
      expect(res.status).toBe(200);
      return { me, secret: k.segredo, keyId: k.chave.id };
    };
    return { db, deps, call, json, body, login, newKey, ai, ready, advance };
  }

  describe(`${label}: a AI pede (escrever nas Anotações)`, () => {
    it('criar: entra direto com a aprovação padrão, nasce privada, e aparece na lista e pelo id antes de o Murall aplicar', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const res = await t.ai(secret, 'POST', '/ext/v1/notas', { titulo: '  Reunião  com o time ', texto: '- [ ] pauta', grupo: 'trabalho', tags: ['#Urgente', 'urgente'] });
      expect(res.status).toBe(202);
      const b = await t.body(res);
      expect(b.pedido).toEqual(expect.objectContaining({ op: 'nota.criar', estado: 'pendente', id: expect.stringMatching(/^pd_/) }));
      expect(b.nota).toEqual(
        expect.objectContaining({ id: b.pedido.alvo, titulo: 'Reunião com o time', grupo: 'trabalho', tags: ['Urgente'], visibilidade: 'privada', tarefas: { feitas: 0, total: 1 } }),
      );
      expect(b.pedido.alvo).toMatch(/^r[0-9a-z]{8,}[0-9a-z]{12}$/);
      const list = await t.body(t.ai(secret, 'GET', '/ext/v1/notas'));
      expect(list.itens[0].id).toBe(b.pedido.alvo);
      expect(list.itens[0].pedidos).toEqual([{ id: b.pedido.id, op: 'nota.criar', estado: 'pendente' }]);
      expect((await t.body(t.ai(secret, 'GET', `/ext/v1/notas/${b.pedido.alvo}`))).nota.titulo).toBe('Reunião com o time');
      // no grupo de outro: não aparece
      expect((await t.body(t.ai(secret, 'GET', '/ext/v1/notas?grupo=Estudos'))).itens.map((n: { id: string }) => n.id)).toEqual(['estu-1']);
    });

    it('o mesmo Idempotency-Key devolve o mesmo pedido; usado noutra operação, recusa', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const a = await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Uma' }, 'abc-123'));
      const b = await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Uma' }, 'abc-123'));
      expect(b.pedido.id).toBe(a.pedido.id);
      expect(b.repetido).toBe(true);
      expect((await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM api_pedidos'))!.n).toBe(1);
      const other = await t.ai(secret, 'POST', '/ext/v1/notas/trab-1/fixar', undefined, 'abc-123');
      expect(other.status).toBe(409);
      expect((await t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'x' }, 'com espaço')).status).toBe(400);
    });

    it.each([
      [{}, 'título'],
      [{ titulo: 'x'.repeat(201) }, 'título'],
      [{ titulo: 'ok', tags: Array.from({ length: 13 }, (_, i) => `t${i}`) }, 'tags'],
      [{ titulo: 'ok', data: '2026-13-01' }, 'data'],
      [{ titulo: 'ok', capa: 'http://inseguro.com/x.png' }, 'capa'],
      [{ titulo: 'ok', texto: 42 }, 'texto'],
    ])('criar recusa o que não serve: %j', async (payload, word) => {
      const t = await setup();
      const { secret } = await t.ready();
      const res = await t.ai(secret, 'POST', '/ext/v1/notas', payload);
      expect(res.status).toBe(400);
      expect((await t.body(res)).mensagem.toLowerCase()).toContain(word);
    });

    it('a visibilidade pede "Mudar quem vê"; o grupo que não existe pede criar_grupo', async () => {
      const t = await setup();
      const { secret, me } = await t.ready();
      expect((await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'x', visibilidade: 'publica' }))).erro).toBe('sem-permissao');
      const grupo = await t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'x', grupo: 'Viagens' });
      expect(grupo.status).toBe(422);
      const g = await t.body(grupo);
      expect(g.erro).toBe('grupo-novo');
      expect(g.mensagem).toContain('Trabalho, Estudos');
      expect((await t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'x', grupo: 'Viagens', criar_grupo: true })).status).toBe(202);
      const pub = (await t.newKey(me.token, { escopos: ['notas:criar', 'publicar'] })).segredo;
      expect((await t.body(t.ai(pub, 'POST', '/ext/v1/notas', { titulo: 'x', visibilidade: 'publica' }))).nota.visibilidade).toBe('publica');
    });

    it('a chave limitada a um grupo só cria e mexe nele', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const limited = (await t.newKey(me.token, { grupos: ['Trabalho'], escopos: ['notas:ler', 'notas:criar', 'notas:editar'] })).segredo;
      expect((await t.body(t.ai(limited, 'POST', '/ext/v1/notas', { titulo: 'sem grupo' }))).erro).toBe('fora-dos-grupos');
      expect((await t.body(t.ai(limited, 'POST', '/ext/v1/notas', { titulo: 'x', grupo: 'Estudos' }))).erro).toBe('fora-dos-grupos');
      expect((await t.ai(limited, 'POST', '/ext/v1/notas', { titulo: 'x', grupo: 'trabalho' })).status).toBe(202);
      expect((await t.ai(limited, 'POST', '/ext/v1/notas/estu-1/fixar')).status).toBe(404);
      expect((await t.body(t.ai(limited, 'PATCH', '/ext/v1/notas/trab-1', { versao: nota('trab-1').versao, grupo: 'Estudos' }))).erro).toBe('fora-dos-grupos');
    });

    it('editar pede a versão de agora: a velha devolve 409 com a nota; a certa espera aprovação e aparece por cima', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      expect((await t.ai(secret, 'PATCH', '/ext/v1/notas/trab-1', { titulo: 'Novo' })).status).toBe(400);
      const old = await t.ai(secret, 'PATCH', '/ext/v1/notas/trab-1', { versao: '2026-09-01T00:00:00.000Z', titulo: 'Novo' });
      expect(old.status).toBe(409);
      const o = await t.body(old);
      expect(o.erro).toBe('versao-velha');
      expect(o.nota.id).toBe('trab-1');
      const ok = await t.body(t.ai(secret, 'PATCH', '/ext/v1/notas/trab-1', { versao: nota('trab-1').versao, titulo: 'Pauta nova', texto: '- [x] a\n- [x] b' }));
      expect(ok.pedido.estado).toBe('aguardando-aprovacao');
      expect(ok.nota).toEqual(expect.objectContaining({ titulo: 'Pauta nova', tarefas: { feitas: 2, total: 2 } }));
      const seen = (await t.body(t.ai(secret, 'GET', '/ext/v1/notas/trab-1'))).nota;
      expect(seen.titulo).toBe('Pauta nova');
      expect(seen.pedidos).toEqual([{ id: ok.pedido.id, op: 'nota.editar', estado: 'aguardando-aprovacao' }]);
      expect((await t.ai(secret, 'PATCH', '/ext/v1/notas/nao-existe', { versao: 'x', titulo: 'a' })).status).toBe(400);
      expect((await t.ai(secret, 'PATCH', '/ext/v1/notas/nao-existe', { versao: NOW.toISOString(), titulo: 'a' })).status).toBe(404);
    });

    it('acrescentar e as tarefas: a tarefa que não existe é recusada na hora, com as que existem', async () => {
      const t = await setup();
      const { secret } = await t.ready({ aprovacao: 'nunca' });
      const add = await t.body(t.ai(secret, 'POST', '/ext/v1/notas/trab-1/acrescentar', { texto: '- [ ] levar café' }));
      expect(add.pedido.estado).toBe('pendente');
      expect(add.nota.texto.endsWith('- [x] reservar a sala\n- [ ] levar café')).toBe(true);
      const miss = await t.ai(secret, 'POST', '/ext/v1/notas/trab-1/tarefas', { marcar: ['comprar pão'] });
      expect(miss.status).toBe(422);
      expect((await t.body(miss)).mensagem).toContain('mandar a ata');
      const ok = await t.body(t.ai(secret, 'POST', '/ext/v1/notas/trab-1/tarefas', { marcar: ['MANDAR A ATA', 'levar café'], novas: ['revisar'] }));
      expect(ok.nota.tarefas).toEqual({ feitas: 3, total: 4 });
      expect((await t.ai(secret, 'POST', '/ext/v1/notas/trab-1/tarefas', {})).status).toBe(400);
    });

    it('finalizar, fixar e apagar (apagar pede a permissão dele)', async () => {
      const t = await setup();
      const { secret, me } = await t.ready({ aprovacao: 'nunca' });
      expect((await t.body(t.ai(secret, 'POST', '/ext/v1/notas/trab-1/finalizar'))).nota.finalizada_em).toBe(new Date(NOW.getTime() + 5_000).toISOString());
      expect((await t.body(t.ai(secret, 'POST', '/ext/v1/notas/trab-1/fixar'))).nota.fixada).toBe(true);
      expect((await t.body(t.ai(secret, 'DELETE', '/ext/v1/notas/trab-1'))).erro).toBe('sem-permissao');
      const del = (await t.newKey(me.token, { escopos: ['notas:apagar'] })).segredo;
      const gone = await t.body(t.ai(del, 'DELETE', '/ext/v1/notas/trab-1'));
      expect(gone.pedido.op).toBe('nota.apagar');
      expect(gone.nota).toBeNull();
    });

    it(`os freios: ${PER_KEY_DAY} pedidos por chave em 24 horas, e a fatia da cota do dia`, async () => {
      const t = await setup();
      const { secret, me, keyId } = await t.ready();
      const at = NOW.toISOString();
      await t.db.batch(
        Array.from({ length: PER_KEY_DAY }, (_, i) => ({
          sql: 'INSERT INTO api_pedidos (id, usuario_id, chave_id, chave_nome, op, alvo, dados, estado, criado_em, expira_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          params: [`pd_${String(i).padStart(16, '0')}`, me.id, keyId, 'AI', 'nota.fixar', 'trab-1', '{}', 'aplicado', at, at],
        })),
      );
      const full = await t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'x' });
      expect(full.status).toBe(429);
      t.advance(DAY);
      expect((await t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'x' })).status).toBe(202);
      await t.db.batch([{ sql: 'UPDATE uso_diario SET linhas_gravadas = 85000 WHERE dia = ?', params: [utcDay(t.deps.now())] }]);
      const quota = await t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'y' });
      expect(quota.status).toBe(503);
      expect((await t.body(quota)).erro).toBe('cota-api');
    });
  });

  describe(`${label}: o site aplica (pegar, concluir, aprovar, recusar, desfazer)`, () => {
    it('o GET do mural diz quantos pedidos esperam; a lista traz os dados para aplicar', async () => {
      const t = await setup();
      const { secret, me } = await t.ready();
      await t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Uma' });
      await t.ai(secret, 'POST', '/ext/v1/notas/trab-1/fixar');
      const head = await t.call('/v1/eu/mural', { headers: { Authorization: `Bearer ${me.token}` } });
      expect(head.headers.get('Mural-Pedidos')).toBe('1');
      expect(head.headers.get('Mural-Pedidos-Aprovar')).toBe('1');
      const list = await t.body(t.json('GET', '/v1/eu/pedidos', undefined, me.token));
      expect(list.itens.map((p: { op: string; estado: string }) => `${p.op}:${p.estado}`)).toEqual(['nota.criar:pendente', 'nota.fixar:aguardando-aprovacao']);
      expect(list.itens[0].dados).toEqual({ titulo: 'Uma' });
      expect(list.itens[0].chave.nome).toBe('AI');
    });

    it('um aparelho pega por 2 minutos; conclui depois de sincronizar; a AI vê o resultado, nunca o "antes"', async () => {
      const t = await setup();
      const { secret, me } = await t.ready();
      const { pedido } = await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Uma' }));
      const take = (device: string) => t.json('POST', `/v1/eu/pedidos/${pedido.id}/pegar`, { aparelho: device }, me.token);
      expect((await take('aparelho-A')).status).toBe(200);
      expect((await take('aparelho-B')).status).toBe(409);
      expect((await take('aparelho-A')).status, 'o mesmo aparelho pega de novo').toBe(200);
      t.advance(2 * 60 * 1000 + 1);
      expect((await take('aparelho-B')).status, 'depois do prazo, outro pega').toBe(200);
      const done = await t.body(
        t.json('POST', '/v1/eu/pedidos/concluir', { itens: [{ id: pedido.id, estado: 'aplicado', resultado: { nota: { id: pedido.alvo } }, antes: { segredo: 'x' } }] }, me.token),
      );
      expect(done.itens).toEqual([{ id: pedido.id, ok: true }]);
      const seen = await t.body(t.ai(secret, 'GET', `/ext/v1/pedidos/${pedido.id}`));
      expect(seen.pedido.estado).toBe('aplicado');
      expect(seen.pedido.resultado).toEqual({ nota: { id: pedido.alvo } });
      expect(JSON.stringify(seen)).not.toContain('segredo');
      // concluído não se conclui de novo, nem se pega
      expect((await t.body(t.json('POST', '/v1/eu/pedidos/concluir', { itens: [{ id: pedido.id, estado: 'falhou' }] }, me.token))).itens[0].ok).toBe(false);
      expect((await take('aparelho-A')).status).toBe(409);
      // o histórico mostra, com o "antes", para o Desfazer
      const hist = await t.body(t.json('GET', '/v1/eu/pedidos?estado=historico', undefined, me.token));
      expect(hist.itens[0].antes).toEqual({ segredo: 'x' });
      expect((await t.body(t.json('POST', `/v1/eu/pedidos/${pedido.id}/desfazer`, undefined, me.token))).pedido.estado).toBe('desfeito');
      expect((await t.json('POST', `/v1/eu/pedidos/${pedido.id}/desfazer`, undefined, me.token)).status).toBe(409);
    });

    it('aprovar passa a pendente; recusar fecha; a AI vê em que pé está', async () => {
      const t = await setup();
      const { secret, me } = await t.ready();
      const a = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas/trab-1/fixar'))).pedido;
      const b = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas/trab-1/finalizar'))).pedido;
      expect((await t.json('POST', `/v1/eu/pedidos/${a.id}/pegar`, { aparelho: 'aparelho-A' }, me.token)).status, 'esperando aprovação não se pega').toBe(409);
      expect((await t.body(t.json('POST', `/v1/eu/pedidos/${a.id}/aprovar`, undefined, me.token))).pedido.estado).toBe('pendente');
      expect((await t.body(t.json('POST', `/v1/eu/pedidos/${b.id}/recusar`, undefined, me.token))).pedido.estado).toBe('recusado');
      const mine = await t.body(t.ai(secret, 'GET', '/ext/v1/pedidos'));
      expect(mine.itens.map((p: { id: string; estado: string }) => [p.id, p.estado])).toEqual([
        [b.id, 'recusado'],
        [a.id, 'pendente'],
      ]);
      // a nota por cima já não leva o recusado
      expect((await t.body(t.ai(secret, 'GET', '/ext/v1/notas/trab-1'))).nota.pedidos).toEqual([{ id: a.id, op: 'nota.fixar', estado: 'pendente' }]);
    });

    it('recusado enquanto um aparelho o aplicava: o aparelho conclui e o histórico conta o que aconteceu', async () => {
      const t = await setup();
      const { secret, me, keyId } = await t.ready();
      const a = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Uma' }))).pedido;
      const b = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Duas' }))).pedido;
      const c = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Três' }))).pedido;
      expect((await t.json('POST', `/v1/eu/pedidos/${a.id}/pegar`, { aparelho: 'aparelho-A' }, me.token)).status).toBe(200);
      expect((await t.json('POST', `/v1/eu/pedidos/${b.id}/pegar`, { aparelho: 'aparelho-A' }, me.token)).status).toBe(200);
      // você recusa um na folha; e apaga a chave (o outro fica recusado também), com o aparelho no meio
      expect((await t.body(t.json('POST', `/v1/eu/pedidos/${a.id}/recusar`, undefined, me.token))).pedido.estado).toBe('recusado');
      await t.json('DELETE', `/v1/eu/chaves/${keyId}`, undefined, me.token);
      const done = await t.body(
        t.json('POST', '/v1/eu/pedidos/concluir', { itens: [a, b, c].map((p) => ({ id: p.id, estado: 'aplicado', resultado: { nota: { id: p.alvo } } })) }, me.token),
      );
      // o que ninguém tinha pego continua recusado
      expect(done.itens.map((i: { ok: boolean }) => i.ok)).toEqual([true, true, false]);
      const estado = async (id: string) => (await t.db.first<{ estado: string; pego_por: string | null }>('SELECT estado, pego_por FROM api_pedidos WHERE id = ?', [id]))!;
      expect(await estado(a.id)).toEqual({ estado: 'aplicado', pego_por: null });
      expect(await estado(b.id)).toEqual({ estado: 'aplicado', pego_por: null });
      expect((await estado(c.id)).estado).toBe('recusado');
    });

    it('apagar a chave recusa os pedidos abertos dela; a de outra conta não mexe em nada', async () => {
      const t = await setup();
      const { secret, me, keyId } = await t.ready();
      const p = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Uma' }))).pedido;
      const bia = await t.login('bia');
      await t.json('DELETE', `/v1/eu/chaves/${keyId}`, undefined, bia.token);
      expect((await t.db.first<{ estado: string }>('SELECT estado FROM api_pedidos WHERE id = ?', [p.id]))!.estado).toBe('pendente');
      await t.json('DELETE', `/v1/eu/chaves/${keyId}`, undefined, me.token);
      expect((await t.db.first<{ estado: string }>('SELECT estado FROM api_pedidos WHERE id = ?', [p.id]))!.estado).toBe('recusado');
    });

    it('o que ninguém aplicou em 30 dias expira; a limpeza tira os resolvidos de mais de 30 dias; apagar a conta leva todos', async () => {
      const t = await setup();
      const { secret, me } = await t.ready();
      const p = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Uma' }))).pedido;
      t.advance(30 * DAY + 1000);
      expect((await t.body(t.json('GET', '/v1/eu/pedidos', undefined, me.token))).itens).toEqual([]);
      await cleanup(t.deps);
      expect((await t.db.first<{ estado: string }>('SELECT estado FROM api_pedidos WHERE id = ?', [p.id]))!.estado).toBe('expirado');
      t.advance(31 * DAY);
      await cleanup(t.deps);
      expect(await t.db.first('SELECT 1 AS x FROM api_pedidos WHERE id = ?', [p.id])).toBeNull();
      const again = await t.login('ana');
      const k = await t.newKey(again.token);
      await t.json('POST', '/v1/eu/espelho', { rev: 1, poe: [] }, again.token);
      await t.ai(k.segredo, 'POST', '/ext/v1/notas', { titulo: 'Duas' });
      await eraseNow(t.deps, again.token);
      expect((await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM api_pedidos'))!.n).toBe(0);
    });
  });

  describe(`${label}: a revisão da API das AIs (28/out)`, () => {
    type T = Awaited<ReturnType<typeof setup>>;
    const insert = (t: T, rows: { id: string; userId: string; keyId: string; op: string; estado: string; criado: string; expira: string; pegoAte?: string }[]) =>
      t.db.batch(
        rows.map((r) => ({
          sql: 'INSERT INTO api_pedidos (id, usuario_id, chave_id, chave_nome, op, alvo, dados, estado, pego_por, pego_ate, criado_em, expira_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          params: [r.id, r.userId, r.keyId, 'AI', r.op, 'trab-1', '{}', r.estado, r.pegoAte ? 'aparelho-A' : null, r.pegoAte ?? null, r.criado, r.expira],
        })),
      );
    const state = async (t: T, id: string) => (await t.db.first<{ estado: string }>('SELECT estado FROM api_pedidos WHERE id = ?', [id]))!.estado;

    it('limite e depois com fração ou grandes demais não dão erro 500; a ordem que não é da lista é recusada', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      for (const q of ['limite=2.5', 'depois=1.5', 'depois=1e20', 'limite=1e400', 'limite=abc&depois=-3']) {
        const res = await t.ai(secret, 'GET', `/ext/v1/notas?${q}`);
        expect(res.status, q).toBe(200);
      }
      expect((await t.body(t.ai(secret, 'GET', '/ext/v1/notas?limite=1.9'))).itens.length).toBe(1);
      expect((await t.ai(secret, 'GET', '/ext/v1/pedidos?limite=2.5')).status).toBe(200);
      for (const ordem of ['constructor', '__proto__', 'toString']) {
        const res = await t.ai(secret, 'GET', `/ext/v1/notas?ordem=${ordem}`);
        expect([res.status, (await t.body(res)).erro], ordem).toEqual([400, 'ordem-invalida']);
      }
    });

    it('a nota que só existe num pedido de criar passa pelos mesmos filtros da lista', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const made = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Compras do mês', texto: 'leite', grupo: 'Trabalho', tags: ['casa'], assunto: 'Mercado' }))).nota;
      const ids = async (q: string) => (await t.body(t.ai(secret, 'GET', `/ext/v1/notas?${q}`))).itens.map((n: NotaV1) => n.id);
      expect(await ids('')).toContain(made.id);
      expect(await ids('finalizadas=sim')).not.toContain(made.id);
      expect(await ids('finalizadas=nao')).toContain(made.id);
      expect(await ids('fixadas=sim')).not.toContain(made.id);
      expect(await ids('tag=outra')).not.toContain(made.id);
      expect(await ids('tag=%23Casa')).toContain(made.id);
      expect(await ids('assunto=viagem')).not.toContain(made.id);
      expect(await ids('assunto=mercado')).toContain(made.id);
      expect(await ids('q=xyz')).not.toContain(made.id);
      expect(await ids('q=LEITE')).toContain(made.id);
      expect(await ids('mudou_depois_de=2030-01-01T00:00:00Z')).not.toContain(made.id);
    });

    it('os pedidos da chave filtram pelo estado antes do limite; o estado que não existe é recusado; o aberto vencido é expirado', async () => {
      const t = await setup();
      const { secret, me, keyId } = await t.ready();
      const later = new Date(NOW.getTime() + 30 * DAY).toISOString();
      const past = new Date(NOW.getTime() - DAY).toISOString();
      await insert(t, [
        { id: 'pd_pendente000000001', userId: me.id, keyId, op: 'nota.fixar', estado: 'pendente', criado: '2026-01-01T00:00:00.000Z', expira: later },
        { id: 'pd_vencido0000000001', userId: me.id, keyId, op: 'nota.fixar', estado: 'pendente', criado: '2026-01-02T00:00:00.000Z', expira: past },
        ...Array.from({ length: 5 }, (_, i) => ({ id: `pd_aplicado00000000${i}`, userId: me.id, keyId, op: 'nota.fixar', estado: 'aplicado', criado: `2026-02-0${i + 1}T00:00:00.000Z`, expira: later })),
      ]);
      const list = async (q: string) => (await t.body(t.ai(secret, 'GET', `/ext/v1/pedidos?${q}`))).itens.map((p: { id: string; estado: string }) => [p.id, p.estado]);
      expect(await list('estado=pendente&limite=2')).toEqual([['pd_pendente000000001', 'pendente']]);
      expect(await list('estado=expirado')).toEqual([['pd_vencido0000000001', 'expirado']]);
      expect((await list('estado=aplicado&limite=3')).length).toBe(3);
      const bad = await t.ai(secret, 'GET', '/ext/v1/pedidos?estado=feito');
      expect([bad.status, (await t.body(bad)).erro]).toEqual([400, 'estado-invalido']);
    });

    it('a chave limitada não vê o nome dos outros grupos no erro do grupo novo', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const limited = (await t.newKey(me.token, { grupos: ['Trabalho', 'Viagens'], escopos: ['notas:criar'] })).segredo;
      const res = await t.ai(limited, 'POST', '/ext/v1/notas', { titulo: 'x', grupo: 'Viagens' });
      const b = await t.body(res);
      expect([res.status, b.erro]).toEqual([422, 'grupo-novo']);
      expect(b.mensagem).toContain('Trabalho');
      expect(b.mensagem).not.toContain('Estudos');
    });

    it('com a aprovação "mudancas", a nota que já nasce pública espera; a privada entra direto', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const pub = (await t.newKey(me.token, { escopos: ['notas:criar', 'publicar'] })).segredo;
      expect((await t.body(t.ai(pub, 'POST', '/ext/v1/notas', { titulo: 'x', visibilidade: 'publica' }))).pedido.estado).toBe('aguardando-aprovacao');
      expect((await t.body(t.ai(pub, 'POST', '/ext/v1/notas', { titulo: 'y', visibilidade: 'privada' }))).pedido.estado).toBe('pendente');
      const never = (await t.newKey(me.token, { escopos: ['notas:criar', 'publicar'], aprovacao: 'nunca' })).segredo;
      expect((await t.body(t.ai(never, 'POST', '/ext/v1/notas', { titulo: 'z', visibilidade: 'publica' }))).pedido.estado).toBe('pendente');
    });

    it('apertar a chave recusa os pedidos abertos dela que perderam a permissão, e faz o pendente esperar a aprovação nova', async () => {
      const t = await setup();
      const { me, secret, keyId } = await t.ready({ aprovacao: 'nunca', escopos: ['notas:ler', 'notas:criar', 'notas:editar', 'publicar'] });
      const edit = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas/trab-1/fixar'))).pedido;
      const create = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Nova', grupo: 'Trabalho' }))).pedido;
      const publish = (await t.body(t.ai(secret, 'POST', '/ext/v1/notas', { titulo: 'Pública', grupo: 'Trabalho', visibilidade: 'publica' }))).pedido;
      expect([edit.estado, create.estado, publish.estado]).toEqual(['pendente', 'pendente', 'pendente']);
      const patch = (payload: unknown) => t.json('PATCH', `/v1/eu/chaves/${keyId}`, payload, me.token);
      const all = async () => [await state(t, edit.id), await state(t, create.id), await state(t, publish.id)];
      // só o nome: nada muda
      expect((await patch({ nome: 'Outro nome' })).status).toBe(200);
      expect(await all()).toEqual(['pendente', 'pendente', 'pendente']);
      // tirar "Mudar quem vê": só o pedido que publicava sai
      expect((await patch({ escopos: ['notas:ler', 'notas:criar', 'notas:editar'] })).status).toBe(200);
      expect(await all()).toEqual(['pendente', 'pendente', 'recusado']);
      expect((await t.body(t.ai(secret, 'GET', `/ext/v1/pedidos/${publish.id}`))).pedido.resultado.motivo).toContain('permissão');
      // passar a pedir aprovação das mudanças: a edição pendente passa a esperar; criar segue direto
      expect((await patch({ aprovacao: 'mudancas' })).status).toBe(200);
      expect(await all()).toEqual(['aguardando-aprovacao', 'pendente', 'recusado']);
      // limitar os grupos: os das Anotações saem
      expect((await patch({ grupos: ['Estudos'] })).status).toBe(200);
      expect(await all()).toEqual(['recusado', 'recusado', 'recusado']);
    });

    it('apertar a aprovação não mexe no pedido que um aparelho está aplicando agora', async () => {
      const t = await setup();
      const { me, keyId } = await t.ready({ aprovacao: 'nunca' });
      const later = new Date(NOW.getTime() + 30 * DAY).toISOString();
      await insert(t, [
        { id: 'pd_aplicando00000001', userId: me.id, keyId, op: 'nota.fixar', estado: 'pendente', criado: NOW.toISOString(), expira: later, pegoAte: new Date(NOW.getTime() + 60 * 60_000).toISOString() },
        { id: 'pd_livre000000000001', userId: me.id, keyId, op: 'nota.fixar', estado: 'pendente', criado: NOW.toISOString(), expira: later },
      ]);
      expect((await t.json('PATCH', `/v1/eu/chaves/${keyId}`, { aprovacao: 'tudo' }, me.token)).status).toBe(200);
      expect([await state(t, 'pd_aplicando00000001'), await state(t, 'pd_livre000000000001')]).toEqual(['pendente', 'aguardando-aprovacao']);
    });
  });
}
