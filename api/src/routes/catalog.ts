import { Context, Hono } from 'hono';
import { Desfecho, OperacaoDe, desfechoDoStatus } from '../../../contrato/uso-apis/contagem';
import { KeepAlive, measured } from '../domain/external-usage';
import { HttpError } from '../errors';
import { CatalogBrake, CatalogKeys, Deps } from '../ports';
import { keepAliveOf } from './http';

/**
 * A busca com as chaves do site: jogos na RAWG, filmes e séries no TMDB. As chaves ficam nos secrets do
 * Worker (`TMDB_KEY`, `RAWG_KEY`) e nunca vão para o navegador; a API só repassa o pedido. Sem login: só
 * os poucos endereços que o site usa, com os parâmetros que ele manda, e só para quem vem de uma das
 * ORIGENS. Sem o secret, aquele catálogo responde 503 e o site volta para a Wikipedia. O banco não entra na
 * resposta: a conta do que foi lá fora é gravada depois (ver `domain/external-usage.ts`).
 *
 * Quem tem a própria chave (Ajustes › Busca) continua indo direto, sem passar por aqui.
 */

/** O que o site pede ao TMDB: a busca e os pôsteres de um título, com o nome de cada um na contagem. */
const TMDB_ROUTES: readonly { path: RegExp; op: OperacaoDe<'tmdb'> }[] = [
  { path: /^search\/(movie|tv)$/, op: 'busca' },
  { path: /^(movie|tv)\/\d{1,10}\/images$/, op: 'posteres' },
];
const TMDB_PARAMS = ['query', 'language', 'include_adult', 'page', 'include_image_language'];

/** O que o site pede à RAWG: a busca, um jogo e as lojas dele (para a capa da Steam). */
const RAWG_ROUTES: readonly { path: RegExp; op: OperacaoDe<'rawg'> }[] = [
  { path: /^games$/, op: 'busca' },
  { path: /^games\/[\w-]{1,120}$/, op: 'jogo' },
  { path: /^games\/[\w-]{1,120}\/stores$/, op: 'lojas' },
];
const RAWG_PARAMS = ['search', 'page_size', 'search_precise'];

/** Nenhum parâmetro passa disso (o nome de um jogo cabe com folga). */
const MAX_PARAM = 120;

/** Quanto o navegador guarda uma resposta: a mesma busca no mesmo dia não gasta a cota de novo. */
const CACHE = 'public, max-age=86400';

const UPSTREAM_TIMEOUT_MS = 8_000;

/**
 * Quantas buscas um IP faz por minuto. A origem (`fromSite`) só barra o navegador: um script escreve o
 * cabeçalho que quiser, e sem freio gastaria a cota inteira das chaves do site (a RAWG grátis dá 20 mil
 * pedidos por mês para todo mundo). Quem escreve uma resenha gasta uns 5 a 10 pedidos; 60 por minuto
 * sobram para quem digita rápido e trocam várias capas.
 */
export const CATALOG_PER_MINUTE = 60;
const CATALOG_WINDOW_MS = 60_000;
/** Quantos IPs o freio lembra de cada vez (os mais antigos saem primeiro). */
const CATALOG_TRACKED = 5_000;

/**
 * O freio por IP, só na memória (sem banco, que gastaria a cota de gravações a cada busca): conta por
 * janela de um minuto. No Worker, cada instância tem o seu, então o limite vale por instância; quem
 * insiste do mesmo lugar costuma cair na mesma, e o que passar ainda esbarra no limite do catálogo.
 */
export function catalogBrake(perMinute = CATALOG_PER_MINUTE, windowMs = CATALOG_WINDOW_MS, tracked = CATALOG_TRACKED): CatalogBrake {
  const seen = new Map<string, { start: number; n: number }>();
  return {
    take(ip, now) {
      let slot = seen.get(ip);
      if (!slot || now - slot.start >= windowMs) {
        seen.delete(ip);
        slot = { start: now, n: 0 };
        seen.set(ip, slot);
        // a lista não cresce sem fim: sai o IP mais antigo (a ordem do Map é a de entrada)
        if (seen.size > tracked) seen.delete(seen.keys().next().value!);
      }
      if (slot.n >= perMinute) return false;
      slot.n++;
      return true;
    },
  };
}

/** Um freio por instância (fora do `createApp`, que no Worker roda a cada pedido). */
const sharedBrake = catalogBrake();

/** Os secrets do Worker (ou as variáveis do Node). Vazio: aquele catálogo fica sem a chave do site. */
export function readCatalogKeys(env: Record<string, unknown>): CatalogKeys {
  const text = (key: string) => (typeof env[key] === 'string' ? (env[key] as string).trim() : '');
  return { tmdb: text('TMDB_KEY'), rawg: text('RAWG_KEY') };
}

/**
 * A resposta sem a chave do site: a busca da RAWG devolve os endereços da página seguinte e da anterior
 * (`next`, `previous`) montados com a própria chave, que iria parar no navegador (e no cache dele). Cada
 * `key=…`/`api_key=…` com a chave sai do endereço, com o `&` que o seguia.
 */
export function withoutKey(body: string, key: string): string {
  if (!key) return body;
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return body.replace(new RegExp(`([?&])(?:api_)?key=${safe}(&?)`, 'g'), (_, sep: string, amp: string) => (amp ? sep : ''));
}

/** Só os parâmetros conhecidos, sem repetição e curtos. */
function pickParams(c: Context, allowed: readonly string[]): URLSearchParams {
  const out = new URLSearchParams();
  for (const name of allowed) {
    const value = c.req.query(name);
    if (value === undefined) continue;
    if (value.length > MAX_PARAM) throw new HttpError(400, 'parametro-grande', 'O pedido é grande demais.');
    out.set(name, value);
  }
  return out;
}

/** Como terminou o teste do admin: o desfecho da contagem, o HTTP de lá e quanto demorou. */
export interface CatalogProbe {
  desfecho: Desfecho;
  status: number | null;
  ms: number;
}

/**
 * O "Testar agora" do Uso das APIs: o pedido mais barato de cada catálogo (uma página de um resultado), pela chave do
 * site e pela mesma conta das buscas (gasta 1 da cota, e aparece na tabela). Null sem a chave do site.
 */
export function catalogProbe(deps: Deps): (which: 'rawg' | 'tmdb', keepAlive?: KeepAlive) => Promise<CatalogProbe | null> {
  const keys = deps.catalog?.keys ?? { tmdb: '', rawg: '' };
  const upstream = deps.catalog?.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init));
  return async (which, keepAlive) => {
    const key = keys[which];
    if (!key) return null;
    let url: string;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (which === 'rawg') {
      url = `https://api.rawg.io/api/games?${new URLSearchParams({ page_size: '1', key })}`;
    } else {
      const params = new URLSearchParams({ query: 'a', page: '1' });
      // como na busca: a "API key" curta vai na URL; o "token de leitura" (eyJ…), no cabeçalho
      if (key.startsWith('eyJ')) headers['Authorization'] = `Bearer ${key}`;
      else params.set('api_key', key);
      url = `https://api.themoviedb.org/3/search/movie?${params}`;
    }
    const started = Date.now();
    try {
      const res = await measured(deps, which, 'busca', () => upstream(url, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }), { keepAlive });
      return { desfecho: desfechoDoStatus(res.status), status: res.status, ms: Date.now() - started };
    } catch (error) {
      return { desfecho: error instanceof Error && error.name === 'TimeoutError' ? 'prazo' : 'fora', status: null, ms: Date.now() - started };
    }
  };
}

export function catalogRoutes(app: Hono, deps: Deps): void {
  const keys = deps.catalog?.keys ?? { tmdb: '', rawg: '' };
  const upstream = deps.catalog?.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init));
  const brake = deps.catalog?.brake ?? sharedBrake;

  /** O site pergunta uma vez quais catálogos têm a chave do site. */
  app.get('/v1/catalogo', (c) => {
    c.header('Cache-Control', 'public, max-age=600');
    return c.json({ tmdb: !!keys.tmdb, rawg: !!keys.rawg });
  });

  /** Só o próprio site: um pedido sem a origem dele (um script qualquer) não gasta a cota das chaves. */
  const fromSite = (c: Context) => {
    const origin = c.req.header('Origin')?.replace(/\/+$/, '') ?? '';
    if (!deps.config.allowedOrigins.includes(origin)) throw new HttpError(403, 'origem', 'Só o site do Murall usa esta busca.');
    // o IP que a Cloudflare viu; sem ele (o Node atrás de outro proxy, os testes) não há por quem contar
    const ip = c.req.header('CF-Connecting-IP');
    if (ip && !brake.take(ip, deps.now().getTime())) {
      c.header('Retry-After', '60');
      throw new HttpError(429, 'catalogo-devagar', 'Muitas buscas seguidas. Espere um minuto.');
    }
  };

  /** O pedido lá fora, sem a conta (quem chama mede: só o que sai daqui gasta a cota, e as recusas de antes não gravam nada). */
  const ask = (url: string, headers: Record<string, string> = {}) => upstream(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });

  const forward = async (c: Context, which: 'tmdb' | 'rawg', run: () => Promise<Response>) => {
    let res: Response;
    try {
      res = await run();
    } catch {
      throw new HttpError(502, 'catalogo-fora', 'O catálogo não respondeu.');
    }
    const name = which === 'tmdb' ? 'TMDB' : 'RAWG';
    // a chave do site recusada ou no limite: o site volta para a Wikipedia até recarregar
    if (res.status === 401 || res.status === 403) throw new HttpError(503, 'chave-recusada', `A chave do site no ${name} foi recusada.`);
    if (res.status === 429) throw new HttpError(503, 'catalogo-limite', `A busca do site no ${name} chegou ao limite por agora.`);
    if (res.status === 404) throw new HttpError(404, 'nao-encontrado', 'Não está no catálogo.');
    if (!res.ok) throw new HttpError(502, 'catalogo-fora', 'O catálogo não respondeu.');
    const body = withoutKey(await res.text(), keys[which]);
    return c.body(body, 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': CACHE });
  };

  app.get('/v1/catalogo/tmdb/*', async (c) => {
    fromSite(c);
    if (!keys.tmdb) throw new HttpError(503, 'sem-chave', 'O site está sem a chave do TMDB.');
    const path = c.req.path.slice('/v1/catalogo/tmdb/'.length);
    const route = TMDB_ROUTES.find((r) => r.path.test(path));
    if (!route) throw new HttpError(404, 'nao-encontrado', 'Esse endereço não existe na API.');
    const params = pickParams(c, TMDB_PARAMS);
    // a "API key" curta vai na URL; o "token de leitura" (começa com eyJ), no cabeçalho
    const token = keys.tmdb.startsWith('eyJ');
    if (!token) params.set('api_key', keys.tmdb);
    const url = `https://api.themoviedb.org/3/${path}?${params}`;
    return forward(c, 'tmdb', () => measured(deps, 'tmdb', route.op, () => ask(url, token ? { Authorization: `Bearer ${keys.tmdb}` } : {}), { keepAlive: keepAliveOf(c) }));
  });

  app.get('/v1/catalogo/rawg/*', async (c) => {
    fromSite(c);
    if (!keys.rawg) throw new HttpError(503, 'sem-chave', 'O site está sem a chave da RAWG.');
    const path = c.req.path.slice('/v1/catalogo/rawg/'.length);
    const route = RAWG_ROUTES.find((r) => r.path.test(path));
    if (!route) throw new HttpError(404, 'nao-encontrado', 'Esse endereço não existe na API.');
    const params = pickParams(c, RAWG_PARAMS);
    params.set('key', keys.rawg);
    const url = `https://api.rawg.io/api/${path}?${params}`;
    return forward(c, 'rawg', () => measured(deps, 'rawg', route.op, () => ask(url), { keepAlive: keepAliveOf(c) }));
  });
}
