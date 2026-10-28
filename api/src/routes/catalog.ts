import { Context, Hono } from 'hono';
import { HttpError } from '../errors';
import { CatalogBrake, CatalogKeys, Deps } from '../ports';

/**
 * A busca com as chaves do site: jogos na RAWG, filmes e séries no TMDB. As chaves ficam nos secrets do
 * Worker (`TMDB_KEY`, `RAWG_KEY`) e nunca vão para o navegador; a API só repassa o pedido. Sem banco e
 * sem login: só os poucos endereços que o site usa, com os parâmetros que ele manda, e só para quem
 * vem de uma das ORIGENS. Sem o secret, aquele catálogo responde 503 e o site volta para a Wikipedia.
 *
 * Quem tem a própria chave (Ajustes › Busca) continua indo direto, sem passar por aqui.
 */

/** O que o site pede ao TMDB: a busca e os pôsteres de um título. */
const TMDB_PATHS = [/^search\/(movie|tv)$/, /^(movie|tv)\/\d{1,10}\/images$/];
const TMDB_PARAMS = ['query', 'language', 'include_adult', 'page', 'include_image_language'];

/** O que o site pede à RAWG: a busca, um jogo e as lojas dele (para a capa da Steam). */
const RAWG_PATHS = [/^games$/, /^games\/[\w-]{1,120}$/, /^games\/[\w-]{1,120}\/stores$/];
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

  const forward = async (c: Context, which: 'tmdb' | 'rawg', url: string, headers: Record<string, string>) => {
    let res: Response;
    try {
      res = await upstream(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
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
    if (!TMDB_PATHS.some((re) => re.test(path))) throw new HttpError(404, 'nao-encontrado', 'Esse endereço não existe na API.');
    const params = pickParams(c, TMDB_PARAMS);
    // a "API key" curta vai na URL; o "token de leitura" (começa com eyJ), no cabeçalho
    const token = keys.tmdb.startsWith('eyJ');
    if (!token) params.set('api_key', keys.tmdb);
    return forward(c, 'tmdb', `https://api.themoviedb.org/3/${path}?${params}`, token ? { Authorization: `Bearer ${keys.tmdb}` } : {});
  });

  app.get('/v1/catalogo/rawg/*', async (c) => {
    fromSite(c);
    if (!keys.rawg) throw new HttpError(503, 'sem-chave', 'O site está sem a chave da RAWG.');
    const path = c.req.path.slice('/v1/catalogo/rawg/'.length);
    if (!RAWG_PATHS.some((re) => re.test(path))) throw new HttpError(404, 'nao-encontrado', 'Esse endereço não existe na API.');
    const params = pickParams(c, RAWG_PARAMS);
    params.set('key', keys.rawg);
    return forward(c, 'rawg', `https://api.rawg.io/api/${path}?${params}`, {});
  });
}
