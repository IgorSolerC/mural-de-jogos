import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { DESFECHOS, OPERACOES, desfechoDoStatus } from '../../contrato/uso-apis/contagem';
import { SERVICOS } from '../../contrato/uso-apis/servicos';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { FAILURES_KEEP, cleanup } from '../src/domain/cleanup';
import { readCloudflareKeys, reportFrom } from '../src/domain/cloudflare-usage';
import { USAGE_BUDGET_SHARE, UsageMeter, measured } from '../src/domain/external-usage';
import { googleVerifier } from '../src/domain/google';
import { catalogBrake } from '../src/routes/catalog';
import { usageFrom } from '../src/routes/admin';
import { Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, jsonCaller } from './harness';

/**
 * A contagem das chamadas aos serviços externos (PLANO-ADMIN-APIS.md, rodada 2). Roda nos dois bancos,
 * como `suite.ts`. O catálogo é de mentira: cada resposta vem de `reply`.
 */

const SITE = 'https://igorsolerc.github.io';
const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '1000' };
const SECRET = 'chave-secreta-do-site';
const SEARCHED = 'segredo%20buscado';

interface Row {
  dia: string;
  servico: string;
  operacao: string;
  medido_em: string;
  desfecho: string;
  pedidos: number;
  ms_total: number;
  ms_max: number;
  ultimo_em: string;
}

export function usoApisSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'uso', alg: 'RS256' };
  });

  async function setup(options: { reply?: () => Response | Promise<Response>; windowMs?: number; env?: Record<string, string> } = {}) {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config = readConfig({ ...ENV, ...options.env });
    const clock = { t: NOW.getTime() };
    const logged: string[] = [];
    let reply = options.reply ?? (() => Response.json({ results: [] }));
    const meter = new UsageMeter(options.windowMs ?? 0);
    const deps: Deps = {
      db,
      config,
      now: () => new Date(clock.t),
      verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })),
      log: (line) => logged.push(line),
      meter,
      catalog: { keys: { tmdb: 'tmdb-chave', rawg: SECRET }, fetch: async () => reply(), brake: catalogBrake(2) },
    };
    const app = createApp(deps);
    const search = (path = `games?search=${SEARCHED}`, origin: string | null = SITE, ctx?: { waitUntil(p: Promise<unknown>): void; passThroughOnException(): void }) =>
      app.request(`https://api.teste/v1/catalogo/rawg/${path}`, { headers: origin ? { Origin: origin } : {} }, undefined, ctx as never);
    const rows = () => db.all<Row>('SELECT * FROM uso_apis ORDER BY servico, operacao, desfecho');
    const failures = () => db.all<{ em: string; servico: string; operacao: string; desfecho: string; status: number | null; repeticoes: number }>('SELECT * FROM uso_apis_falhas ORDER BY id');
    const json = jsonCaller((path, init) => app.request(`https://api.teste${path}`, init));
    const login = async (sub: string) => {
      const credential = await new SignJWT({ given_name: sub })
        .setProtectedHeader({ alg: 'RS256', kid: 'uso' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = (await (await json('POST', '/v1/auth/google', { credential })).json()) as any;
      return { token: b.token as string, id: b.conta.id as string };
    };
    return { db, deps, meter, search, rows, failures, json, login, logged, clock, setReply: (r: () => Response | Promise<Response>) => (reply = r) };
  }

  describe(`${label}: a contagem das APIs externas`, () => {
    it('cada caminho do catálogo tem a sua operação, e o que passou vira uma linha', async () => {
      const t = await setup();
      expect((await t.search()).status).toBe(200);
      expect((await t.search('games/hades')).status).toBe(200);
      const rows = await t.rows();
      expect(rows.map((r) => [r.dia, r.servico, r.operacao, r.medido_em, r.desfecho, r.pedidos])).toEqual([
        ['2026-10-06', 'rawg', 'busca', 'worker', 'ok', 1],
        ['2026-10-06', 'rawg', 'jogo', 'worker', 'ok', 1],
      ]);
      expect(rows[0]!.ultimo_em).toBe(NOW.toISOString());
      expect(await t.failures()).toEqual([]);
    });

    it('a mesma combinação soma, e o dia seguinte é outra linha', async () => {
      const t = await setup();
      await t.search();
      await t.search();
      t.clock.t += 86_400_000;
      await t.search();
      expect((await t.rows()).map((r) => [r.dia, r.pedidos])).toEqual([
        ['2026-10-06', 2],
        ['2026-10-07', 1],
      ]);
    });

    it('o desfecho de cada resposta, e a resposta ao site continua a mesma', async () => {
      const cases: [number, string, number][] = [
        [429, 'limite', 503],
        [401, 'recusada', 503],
        [403, 'recusada', 503],
        [500, 'fora', 502],
        [522, 'fora', 502],
        [404, 'nao-achou', 404],
      ];
      for (const [status, desfecho, answer] of cases) {
        const t = await setup({ reply: () => new Response('{}', { status }) });
        expect((await t.search()).status, String(status)).toBe(answer);
        expect((await t.rows()).map((r) => r.desfecho), String(status)).toEqual([desfecho]);
        const failing = desfecho !== 'nao-achou';
        expect((await t.failures()).map((f) => [f.desfecho, f.status]), String(status)).toEqual(failing ? [[desfecho, status]] : []);
      }
    });

    it('o prazo vencido e a rede que cai são diferentes, e nenhum dos dois tem status', async () => {
      const t = await setup({
        reply: () => {
          throw Object.assign(new Error('demorou'), { name: 'TimeoutError' });
        },
      });
      expect((await t.search()).status).toBe(502);
      t.setReply(() => {
        throw new TypeError('rede');
      });
      expect((await t.search()).status).toBe(502);
      expect((await t.rows()).map((r) => r.desfecho)).toEqual(['fora', 'prazo']);
      expect((await t.failures()).map((f) => [f.desfecho, f.status])).toEqual([
        ['prazo', null],
        ['fora', null],
      ]);
    });

    it('as falhas iguais da mesma janela viram uma linha, com as repetições', async () => {
      const t = await setup({ windowMs: 60_000, reply: () => new Response('{}', { status: 522 }) });
      await t.search();
      await t.search();
      await t.meter.flush(t.deps);
      expect((await t.failures()).map((f) => [f.desfecho, f.status, f.repeticoes])).toEqual([['fora', 522, 2]]);
    });

    it('o que é recusado aqui não conta nem grava: a recusa não vira gravação de graça', async () => {
      const t = await setup();
      expect((await t.search('games', null)).status).toBe(403);
      expect((await t.search('games', 'https://outro.site')).status).toBe(403);
      expect((await t.search('users')).status).toBe(404);
      expect((await t.rows()).length).toBe(0);
      expect((await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM uso_diario'))?.n).toBe(0);
    });

    it('nem o que foi buscado, nem o endereço, nem a chave chegam ao banco', async () => {
      const t = await setup({ reply: () => new Response(`erro com ${SECRET}`, { status: 500 }) });
      await t.search();
      const everything = JSON.stringify([await t.rows(), await t.failures()]);
      expect(everything).not.toContain('segredo');
      expect(everything).not.toContain('buscado');
      expect(everything).not.toContain(SECRET);
      expect(everything).not.toContain('games');
    });

    it('as tabelas não têm coluna de conta nem de IP', async () => {
      const t = await setup();
      for (const table of ['uso_apis', 'uso_apis_falhas']) {
        const cols = (await t.db.all<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)).map((c) => c.name);
        expect(cols.length, table).toBeGreaterThan(0);
        for (const col of cols) expect(col, table).not.toMatch(/usuario|conta|ip|codigo|url|caminho|query/);
      }
    });

    it('com a janela, o site não espera: várias chamadas viram uma gravação só, marcada no waitUntil', async () => {
      const t = await setup({ windowMs: 15 });
      const kept: Promise<unknown>[] = [];
      const ctx = { waitUntil: (p: Promise<unknown>) => void kept.push(p), passThroughOnException() {} };
      await t.search(undefined, SITE, ctx);
      await t.search(undefined, SITE, ctx);
      expect((await t.rows()).length, 'ainda não gravou').toBe(0);
      await Promise.all(kept);
      await Promise.all(kept);
      expect((await t.rows()).map((r) => r.pedidos)).toEqual([2]);
      expect((await t.db.first<{ gravacoes: number }>('SELECT gravacoes FROM uso_diario'))?.gravacoes).toBe(1);
    });

    it('a conta sobrevive à desistência de quem pediu: a chamada lá fora fica no waitUntil', async () => {
      let answer!: (r: Response) => void;
      const t = await setup({ windowMs: 5, reply: () => new Promise<Response>((resolve) => (answer = resolve)) });
      const kept: Promise<unknown>[] = [];
      const ctx = { waitUntil: (p: Promise<unknown>) => void kept.push(p), passThroughOnException() {} };
      // o site desiste aos 5 s: ninguém mais espera esta resposta
      void t.search(undefined, SITE, ctx);
      await new Promise((r) => setTimeout(r));
      expect(kept.length, 'já está no waitUntil antes de a resposta chegar').toBe(1);
      answer(new Response('{}', { status: 522 }));
      await kept[0];
      await Promise.all(kept.slice(1));
      expect((await t.rows()).map((r) => r.desfecho)).toEqual(['fora']);
    });

    it('o banco fora do ar não muda a resposta, e a conta espera a próxima janela', async () => {
      const t = await setup();
      const { db } = t.deps;
      t.deps.db = { ...db, batch: () => Promise.reject(new Error('sem banco')) };
      const res = await t.search();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ results: [] });
      expect(t.logged.some((l) => l.startsWith('uso das APIs: não deu para gravar'))).toBe(true);
      expect(t.meter.pending).toBe(true);
      t.deps.db = db;
      await t.meter.flush(t.deps);
      expect((await t.rows()).map((r) => r.pedidos)).toEqual([1]);
    });

    it('para quando metade da cota do dia foi usada, sem perder a conta: a cota é da sincronização', async () => {
      const t = await setup();
      const half = 1000 * USAGE_BUDGET_SHARE;
      await t.db.batch([{ sql: 'INSERT INTO uso_diario (dia, linhas_gravadas, gravacoes) VALUES (?, ?, 1)', params: ['2026-10-06', half] }]);
      await t.search();
      expect((await t.rows()).length).toBe(0);
      expect((await t.db.first<{ linhas_gravadas: number }>('SELECT linhas_gravadas FROM uso_diario'))?.linhas_gravadas).toBe(half);
      expect(t.meter.pending).toBe(true);
      // o dia virou: a conta guardada entra, no dia em que aconteceu
      t.clock.t += 86_400_000;
      await t.meter.flush(t.deps);
      expect((await t.rows()).map((r) => [r.dia, r.pedidos])).toEqual([['2026-10-06', 1]]);
    });

    it('em só leitura, não grava, e a busca responde igual', async () => {
      const t = await setup({ env: { MODO: 'so-leitura' } });
      expect((await t.search()).status).toBe(200);
      expect((await t.rows()).length).toBe(0);
      expect(t.meter.pending).toBe(true);
    });

    it('a contagem entra na cota do dia', async () => {
      const t = await setup();
      await t.search();
      // uma linha de contagem + a anotação do próprio uso
      expect((await t.db.first<{ linhas_gravadas: number }>('SELECT linhas_gravadas FROM uso_diario'))?.linhas_gravadas).toBe(2);
    });

    it('o 403 da Agenda só é limite quando o Google diz que é, e o corpo continua legível', async () => {
      const t = await setup();
      const res = await measured(t.deps, 'google-agenda', 'mudar', async () => Response.json({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }, { status: 403 }), { limitIn403: true });
      expect(await res.json()).toEqual({ error: { errors: [{ reason: 'rateLimitExceeded' }] } });
      await measured(t.deps, 'google-agenda', 'apagar', async () => Response.json({ error: { errors: [{ reason: 'forbiddenForNonOrganizer' }] } }, { status: 403 }), { limitIn403: true });
      await t.meter.flush(t.deps);
      expect((await t.rows()).map((r) => [r.operacao, r.desfecho])).toEqual([
        ['apagar', 'recusada'],
        ['mudar', 'limite'],
      ]);
    });

    it('sem medidor, a chamada passa direto e nada se conta', async () => {
      const t = await setup();
      const res = await measured({ ...t.deps, meter: undefined } as unknown as Deps, 'rawg', 'busca', async () => new Response('oi'));
      expect(await res.text()).toBe('oi');
      expect(t.meter.pending).toBe(false);
    });

    it('a limpeza deixa 400 dias de contadores, 30 dias de falhas e até 500 delas', async () => {
      const t = await setup();
      const line = (dia: string) => ({ sql: "INSERT INTO uso_apis VALUES (?, 'rawg', 'busca', 'worker', 'ok', 1, 1, 1, 'x')", params: [dia] });
      const failure = (em: string) => ({ sql: "INSERT INTO uso_apis_falhas (em, servico, operacao, medido_em, desfecho) VALUES (?, 'rawg', 'busca', 'worker', 'fora')", params: [em] });
      const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
      await t.db.batch([line(daysAgo(399).slice(0, 10)), line(daysAgo(401).slice(0, 10)), failure(daysAgo(29)), failure(daysAgo(31))]);
      await cleanup(t.deps);
      expect((await t.rows()).map((r) => r.dia)).toEqual([daysAgo(399).slice(0, 10)]);
      expect((await t.failures()).map((f) => f.em)).toEqual([daysAgo(29)]);

      await t.db.batch(Array.from({ length: FAILURES_KEEP + 3 }, () => failure(daysAgo(1))));
      await cleanup(t.deps);
      expect((await t.failures()).length).toBe(FAILURES_KEEP);
    });

    describe('a leitura da Cloudflare', () => {
      const TOKEN = 'token-de-leitura-secreto';
      const graphql = (account: unknown) => Response.json({ data: { viewer: { accounts: [account] } }, errors: null });
      const account = (timeField = 'date') => ({
        workers: [
          { sum: { requests: 100, errors: 2 }, quantiles: { cpuTimeP99: 4200 }, dimensions: { [timeField]: '2026-10-06', scriptName: 'mural-api', status: 'success' } },
          { sum: { requests: 3, errors: 3 }, quantiles: { cpuTimeP99: 11000 }, dimensions: { [timeField]: '2026-10-06', scriptName: 'mural-api', status: 'exceededResources' } },
          { sum: { requests: 7, errors: 0 }, quantiles: { cpuTimeP99: 900 }, dimensions: { [timeField]: '2026-10-06', scriptName: 'cofre-api', status: 'success' } },
          { sum: { requests: 50, errors: 0 }, quantiles: { cpuTimeP99: 99000 }, dimensions: { [timeField]: '2026-10-05', scriptName: 'mural-api', status: 'success' } },
        ],
        d1: [
          { sum: { rowsRead: 1000, rowsWritten: 10 }, dimensions: { date: '2026-10-06' } },
          { sum: { rowsRead: 500, rowsWritten: 5 }, dimensions: { date: '2026-10-06' } },
          { sum: { rowsRead: 9, rowsWritten: 9 }, dimensions: { date: '2026-10-05' } },
        ],
        storage: [
          { max: { databaseSizeBytes: 3000 }, dimensions: { date: '2026-10-06', databaseId: 'c2c789d6-f0f3-4f37-b53a-f049aa02a530' } },
          { max: { databaseSizeBytes: 2000 }, dimensions: { date: '2026-10-05', databaseId: 'c2c789d6-f0f3-4f37-b53a-f049aa02a530' } },
          { max: { databaseSizeBytes: 500 }, dimensions: { date: '2026-10-06', databaseId: 'abcdef12-0000-0000-0000-000000000000' } },
        ],
      });

      async function admin(reply: (query: string) => Response | Promise<Response>, keys = { token: TOKEN, account: 'conta-1' }) {
        const t = await setup();
        const dona = await t.login('dona');
        const calls: { url: string; init: RequestInit; query: string; variables: Record<string, string> }[] = [];
        const app = createApp({
          ...t.deps,
          config: readConfig({ ...ENV, ADMIN_USUARIOS: dona.id }),
          cloudflare: {
            keys,
            fetch: async (url, init) => {
              const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string> };
              calls.push({ url, init: init!, query: body.query, variables: body.variables });
              return reply(body.query);
            },
          },
        });
        const read = async (path = '/v1/admin/cloudflare', token: string | undefined = dona.token) => {
          const res = await app.request(`https://api.teste${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          return { status: res.status, cache: res.headers.get('Cache-Control'), body: (await res.json()) as any };
        };
        return { ...t, read, calls, dona };
      }

      it('só o admin lê', async () => {
        const t = await admin(() => graphql(account()));
        const bia = await t.login('bia');
        expect((await t.read(undefined, bia.token)).status).toBe(403);
        expect((await t.read('/v1/admin/cloudflare', '')).status).toBe(401);
        expect(t.calls.length).toBe(0);
      });

      it('sem o token ou a conta, diz que falta, sem chamar ninguém e sem erro', async () => {
        for (const keys of [{ token: '', account: 'conta-1' }, { token: TOKEN, account: '' }]) {
          const t = await admin(() => graphql(account()), keys);
          const r = await t.read();
          expect(r.status).toBe(200);
          expect(r.body).toEqual({ estado: 'sem-token', geradoEm: NOW.toISOString(), dias: [], workers: [], bancos: [] });
          expect(t.calls.length).toBe(0);
        }
      });

      it('junta por dia, por Worker e por banco; a conta inteira, sem filtrar', async () => {
        const t = await admin(() => graphql(account()));
        const r = await t.read();
        expect(r.status).toBe(200);
        expect(r.cache).toBe('no-store');
        expect(r.body.estado).toBe('ok');
        expect(r.body.dias).toEqual([
          { dia: '2026-10-06', pedidos: 110, erros: 5, cortados: 3, linhasLidas: 1500, linhasGravadas: 15 },
          { dia: '2026-10-05', pedidos: 50, erros: 0, cortados: 0, linhasLidas: 9, linhasGravadas: 9 },
        ]);
        expect(r.body.workers).toEqual([
          { nome: 'mural-api', pedidos: 103, erros: 5, cortados: 3, cpuP99: 11 },
          { nome: 'cofre-api', pedidos: 7, erros: 0, cortados: 0, cpuP99: 0.9 },
        ]);
        expect(r.body.bancos).toEqual([
          { nome: 'mural', bytes: 3000 },
          { nome: 'abcdef12', bytes: 500 },
        ]);
        const { query, variables, url, init } = t.calls[0]!;
        expect(url).toBe('https://api.cloudflare.com/client/v4/graphql');
        expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`);
        expect(variables['account']).toBe('conta-1');
        expect(variables['from']).toBe('2026-10-05');
        expect(variables['to']).toBe('2026-10-06');
        expect(query).not.toContain('scriptName:');
        expect(query).not.toContain('databaseId:');
      });

      it('a resposta fica guardada 5 min; o Atualizar passa por cima, no máximo uma vez por minuto', async () => {
        const t = await admin(() => graphql(account()));
        await t.read();
        await t.read();
        expect(t.calls.length).toBe(1);
        await t.read('/v1/admin/cloudflare?novo=1');
        expect(t.calls.length, 'ainda dentro do minuto').toBe(1);
        t.clock.t += 61_000;
        await t.read();
        expect(t.calls.length, 'sem pedir, continua guardada').toBe(1);
        await t.read('/v1/admin/cloudflare?novo=1');
        expect(t.calls.length).toBe(2);
        t.clock.t += 5 * 60_000 + 1;
        await t.read();
        expect(t.calls.length).toBe(3);
      });

      it('a dimensão recusada passa para a seguinte, e a que funcionou é lembrada', async () => {
        const t = await admin((query) => (query.includes('dimensions { date scriptName') ? Response.json({ data: null, errors: [{ message: 'unknown field date' }] }) : graphql(account('datetimeHour'))));
        const r = await t.read();
        expect(r.body.estado).toBe('ok');
        expect(r.body.dias[0].pedidos).toBe(110);
        expect(t.calls.length).toBe(2);
        expect(t.logged.some((l) => l.includes('unknown field date'))).toBe(true);
        t.clock.t += 5 * 60_000 + 1;
        await t.read();
        expect(t.calls.length).toBe(3);
        expect(t.calls[2]!.query).toContain('dimensions { datetimeHour scriptName');
      });

      it('por hora, o dia sai dos dez primeiros caracteres', () => {
        const hours = { workers: [{ sum: { requests: 4, errors: 0 }, dimensions: { datetimeHour: '2026-10-06T13:00:00Z', scriptName: 'x', status: 'success' } }] };
        expect(reportFrom(hours, 'datetimeHour', NOW).dias[0]!.pedidos).toBe(4);
      });

      it('nenhuma dimensão serve, HTTP de erro ou rede: "fora", com 200, sem guardar e sem o token no log', async () => {
        const replies: (() => Response)[] = [
          () => Response.json({ data: null, errors: [{ message: 'nope' }] }),
          () => new Response('{}', { status: 401 }),
          () => {
            throw new TypeError('rede');
          },
        ];
        for (const reply of replies) {
          const t = await admin(reply);
          const r = await t.read();
          expect(r.status).toBe(200);
          expect(r.body).toEqual({ estado: 'fora', geradoEm: NOW.toISOString(), dias: [], workers: [], bancos: [] });
          const before = t.calls.length;
          await t.read();
          expect(t.calls.length, 'a falha não fica guardada').toBeGreaterThan(before);
          expect(JSON.stringify(r.body)).not.toContain(TOKEN);
          expect(t.logged.join(' ')).not.toContain(TOKEN);
        }
      });

      it('lê os segredos, sem espaços', () => {
        expect(readCloudflareKeys({ CF_ANALYTICS_TOKEN: ' t ', CF_ACCOUNT_ID: 'c' })).toEqual({ token: 't', account: 'c' });
        expect(readCloudflareKeys({})).toEqual({ token: '', account: '' });
      });
    });

    describe('a leitura do admin', () => {
      it('as linhas vão como listas, com as falhas mais novas primeiro, e nada para outra conta', async () => {
        const t = await setup({ reply: () => new Response('{}', { status: 522 }) });
        const dona = await t.login('dona');
        const bia = await t.login('bia');
        await t.search();
        t.clock.t += 1000;
        t.setReply(() => new Response('{}', { status: 429 }));
        await t.search('games/hades');
        const app = createApp({ ...t.deps, config: readConfig({ ...ENV, ADMIN_USUARIOS: dona.id }) });
        const json = jsonCaller((path, init) => app.request(`https://api.teste${path}`, init));
        expect((await json('GET', '/v1/admin/uso', undefined, bia.token)).status).toBe(403);
        const res = await json('GET', '/v1/admin/uso', undefined, dona.token);
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        const body = (await res.json()) as any;
        expect(body.contandoDesde).toBe('2026-10-06');
        expect(body.linhas).toEqual(
          expect.arrayContaining([
            ['2026-10-06', 'rawg', 'busca', 'worker', 'fora', 1, expect.any(Number), expect.any(Number), NOW.toISOString()],
            ['2026-10-06', 'rawg', 'jogo', 'worker', 'limite', 1, expect.any(Number), expect.any(Number), new Date(NOW.getTime() + 1000).toISOString()],
          ]),
        );
        expect(body.falhas.map((f: any) => [f.servico, f.operacao, f.medidoEm, f.desfecho, f.status, f.repeticoes])).toEqual([
          ['rawg', 'jogo', 'worker', 'limite', 429, 1],
          ['rawg', 'busca', 'worker', 'fora', 522, 1],
        ]);
        expect(body.proprias.dia).toBe('2026-10-06');
        expect(body.proprias.cotaLinhas).toBe(1000);
        expect(body.proprias.linhasGravadas).toBeGreaterThan(0);
        expect(body.agenda).toEqual({ contasLigadas: 0 });
      });

      it('sem nada contado, diz que ainda não começou', async () => {
        const t = await setup();
        const dona = await t.login('dona');
        const app = createApp({ ...t.deps, config: readConfig({ ...ENV, ADMIN_USUARIOS: dona.id }) });
        const res = await app.request('https://api.teste/v1/admin/uso', { headers: { Authorization: `Bearer ${dona.token}` } });
        expect(await res.json()).toMatchObject({ contandoDesde: null, linhas: [], falhas: [] });
      });

      it('não devolve o que é mais velho que a janela', async () => {
        const t = await setup();
        const dona = await t.login('dona');
        const line = (dia: string) => ({ sql: "INSERT INTO uso_apis VALUES (?, 'rawg', 'busca', 'worker', 'ok', 1, 1, 1, 'x')", params: [dia] });
        await t.db.batch([line(usageFrom(NOW)), line('2026-08-01')]);
        const app = createApp({ ...t.deps, config: readConfig({ ...ENV, ADMIN_USUARIOS: dona.id }) });
        const res = await app.request('https://api.teste/v1/admin/uso', { headers: { Authorization: `Bearer ${dona.token}` } });
        const body = (await res.json()) as any;
        expect(body.linhas.map((l: unknown[]) => l[0])).toEqual([usageFrom(NOW)]);
        expect(body.contandoDesde).toBe('2026-08-01');
      });
    });
  });
}

describe('as listas da contagem', () => {
  it('desde quando: o mais antigo entre 30 dias atrás e o dia 1º do mês', () => {
    expect(usageFrom(new Date('2026-10-06T15:00:00Z'))).toBe('2026-09-06');
    // no dia 31, 30 dias atrás é o dia 1º
    expect(usageFrom(new Date('2026-10-31T15:00:00Z'))).toBe('2026-10-01');
    expect(usageFrom(new Date('2026-03-31T15:00:00Z'))).toBe('2026-03-01');
  });

  it('cada status tem o seu desfecho', () => {
    expect([200, 204, 301, 409].map(desfechoDoStatus)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect([404, 410].map(desfechoDoStatus)).toEqual(['nao-achou', 'nao-achou']);
    expect(desfechoDoStatus(429)).toBe('limite');
    expect([401, 403].map(desfechoDoStatus)).toEqual(['recusada', 'recusada']);
    expect([500, 502, 522].map(desfechoDoStatus)).toEqual(['fora', 'fora', 'fora']);
    expect([400, 418].map(desfechoDoStatus)).toEqual(['outro', 'outro']);
    for (const status of [200, 404, 429, 403, 500, 400]) expect(DESFECHOS).toContain(desfechoDoStatus(status));
  });

  it('todo serviço contado existe no catálogo da tela, e só a Cloudflare fica de fora da lista', () => {
    const ids = SERVICOS.map((s) => s.id);
    for (const servico of Object.keys(OPERACOES)) expect(ids, servico).toContain(servico);
    expect(ids.filter((id) => !(id in OPERACOES))).toEqual(['cloudflare']);
  });
});
