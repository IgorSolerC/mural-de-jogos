/*
 * O mural offline. Sem internet, a página abre do que ficou guardado da última visita, e as capas
 * que já apareceram uma vez continuam aparecendo.
 *
 * - A página (navegação): rede primeiro, com prazo curto; sem rede, a última versão guardada.
 * - Os arquivos do próprio site: o guardado na hora, e a rede atualiza por trás. Os nomes têm hash,
 *   então uma versão nova do site traz arquivos novos, nunca troca um guardado por outro.
 * - As capas (Wikipedia, Steam, RAWG, Open Library, TMDB, AniList, iTunes): guardadas na primeira vez, para sempre.
 *   As do Kitsu não aceitam CORS: aparecem normalmente, mas não ficam guardadas.
 * - As buscas de catálogo passam direto: sem rede, a busca já avisa e oferece seguir sem capa.
 * - Todo o código da versão aberta fica guardado logo, mesmo o que ainda não foi usado (os pedaços
 *   que só chegam quando alguém toca, como as Configurações do mural ou o painel de emojis). Cada
 *   publicação troca o site inteiro no servidor: sem isso, uma página aberta antes dela pedia um
 *   pedaço que não existe mais, e a folha não abria (ver `keepVersion`).
 * - Os arquivos de versões antigas do site (o código e as fontes, que levam o hash no nome) saem
 *   quando ninguém os pede há mais de 30 dias. Os da versão atual ficam sempre, mesmo sem uso.
 * - A ponte da mudança de endereço (ponte.html e ponte.js): guardada na instalação e servida do cache
 *   primeiro. Depois que o endereço do GitHub passar a redirecionar para murall.igorsc.com.br, é ela
 *   que ainda roda no endereço antigo e entrega o mural deste navegador ao novo (ver public/ponte.js).
 */
/** O mesmo nome está em src/main.ts, que guarda os arquivos da primeira visita. */
const SHELL = 'mural-site-v1';
const COVERS = 'mural-capas-v1';
const MAX_COVERS = 3000;
/** Um arquivo de outra versão do site guardado há mais que isto sai do cache. */
const OLD_VERSION_DAYS = 30;
/** A página guardada da última vez que a versão foi guardada e limpa: uma vez por versão em cada vida do service worker (ele acorda a cada visita). */
let kept = '';
/** As capas já postas no fim da fila nesta vida do service worker. */
const refreshed = new Set();
const COVER_HOSTS =/(^|\.)(wikimedia\.org|steamstatic\.com|rawg\.io|openlibrary\.org|archive\.org|tmdb\.org|anilist\.co|mzstatic\.com)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['./', 'manifest.webmanifest', 'favicon.svg', 'ponte.html', 'ponte.js']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== COVERS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // a ponte da mudança: do cache, mesmo com a rede redirecionando para o endereço novo
    if (/\/ponte\.(html|js)$/.test(url.pathname)) {
      event.respondWith(bridge(req));
      return;
    }
    // Uma página avulsa do site (como privacidade.html) não é o mural: passa direto, sem virar a página guardada.
    if (req.mode === 'navigate' && /\.html$/.test(url.pathname) && !url.pathname.endsWith('/index.html')) return;
    if (req.mode === 'navigate') event.respondWith(page(req, event));
    // O interruptor da nuvem (cloud.json): a rede primeiro, para desligar valer na hora.
    else if (url.pathname.endsWith('/cloud.json')) event.respondWith(fresh(req));
    else event.respondWith(asset(req, event));
    return;
  }
  if (req.destination === 'image' && COVER_HOSTS.test(url.hostname)) event.respondWith(cover(req));
});

/** A página: a rede tem 4 segundos; depois disso (ou sem rede), vale a guardada. */
async function page(req, event) {
  const cache = await caches.open(SHELL);
  let saving = Promise.resolve();
  const network = fetch(req).then((res) => {
    if (res.ok) {
      // com a página nova guardada (e com rede), é a hora de guardar o resto dela e tirar o que é de
      // versões antigas; quem pediu economia de dados só leva o que usar
      const saved = cache.put('./', res.clone()).then(() => keepVersion(cache, req.headers.get('save-data') !== 'on'));
      saving = saved.catch(() => undefined);
    }
    return res;
  });
  // se o prazo vencer e a rede falhar depois, ninguém mais espera por ela
  network.catch(() => undefined);
  event.waitUntil(network.then(() => saving, () => undefined));
  const timeout = new Promise((resolve) => setTimeout(resolve, 4000));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    /* sem rede: vale a guardada */
  }
  const cached = await cache.match('./');
  return cached ?? network;
}

/** A ponte: a guardada primeiro; sem ela, a rede (e guarda, se vier dela mesma, sem redirecionar). */
async function bridge(req) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok && !res.redirected) await cache.put(req, res.clone());
  return res;
}

/** Rede primeiro; sem rede, a última cópia guardada. */
async function fresh(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) ?? Response.error();
  }
}

async function asset(req, event) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}

/** Capa: pede com CORS (todas as fontes aceitam) para poder guardar; se falhar, deixa o navegador pedir do jeito dele. */
async function cover(req) {
  const cache = await caches.open(COVERS);
  const cached = await cache.match(req.url);
  if (cached) {
    // Vista de novo: vai para o fim da fila, para as capas do mural não saírem antes das miniaturas
    // de busca vistas uma vez só. Uma vez por capa enquanto o service worker está acordado.
    if (!refreshed.has(req.url)) {
      refreshed.add(req.url);
      cache.put(req.url, cached.clone()).catch(() => undefined);
    }
    return cached;
  }
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (res.ok) {
      await cache.put(req.url, res.clone());
      trim(cache).catch(() => undefined);
    }
    return res;
  } catch {
    return fetch(req);
  }
}

/** Não deixa a caixa de capas crescer sem fim: as mais antigas saem primeiro. */
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_COVERS; i++) await cache.delete(keys[i]);
}

/** O arquivo leva o hash da versão no nome ("chunk-6P2NQ2Y2.js", "kalam-latin-400-normal-4TKJA74U.woff2"). */
const VERSIONED = /-[A-Z0-9]{8}\.(?:js|css|woff2?)$/;

/**
 * A página avisa que abriu (src/main.ts): na primeira visita ela carregou antes do service worker
 * existir, e nenhuma navegação passou por `page` para guardar o resto da versão.
 */
self.addEventListener('message', (event) => {
  if (event.data?.tipo !== 'guardar-versao') return;
  event.waitUntil(caches.open(SHELL).then((cache) => keepVersion(cache, !event.data.economia)));
});

/**
 * A versão da página guardada: o código que ela ainda não pediu vem já (com `fetchMissing`), e os
 * arquivos de versões antigas saem. Uma vez por versão em cada vida do service worker.
 */
async function keepVersion(cache, fetchMissing) {
  const index = await cache.match('./');
  if (!index) return;
  const text = await index.text();
  if (text === kept) return;
  kept = text;
  await pruneOldVersions(cache, await versionFiles(cache, text, fetchMissing));
}

/**
 * Os arquivos de uma versão do site: tudo o que a página carrega, direta ou indiretamente (o código,
 * os pedaços que ele importa, as fontes do CSS). Com `fetchMissing`, o código (.js e .css com o hash
 * no nome) que ainda não está guardado vem da rede, um por vez e sem pressa: as fontes não, que o
 * navegador só pede as do alfabeto que aparece na tela, e faltar uma só troca a letra. Um arquivo que
 * a rede não tem mais (a página é de antes de outra publicação) fica de fora.
 */
async function versionFiles(cache, index, fetchMissing) {
  const base = new URL('./', self.registration.scope).href;
  const files = new Set();
  const queue = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => new URL(m[1], base).href);
  while (queue.length) {
    const url = queue.pop();
    if (files.has(url)) continue;
    files.add(url);
    if (!/\.(?:js|css)$/.test(url)) continue;
    let res = await cache.match(url);
    if (!res && fetchMissing && new URL(url).origin === self.location.origin && VERSIONED.test(new URL(url).pathname)) {
      res = await fetch(url, { priority: 'low' }).catch(() => null);
      if (res?.ok) await cache.put(url, res.clone()).catch(() => undefined);
      else res = null;
    }
    if (!res) continue;
    const text = await res.text();
    for (const m of text.matchAll(/["'(]\.\/([\w./-]+\.(?:js|css|woff2?))["')]/g)) queue.push(new URL(m[1], url).href);
  }
  return files;
}

/**
 * Tira do cache os arquivos de versões antigas do site guardados há mais de OLD_VERSION_DAYS. Os da
 * versão atual (`current`, ver `versionFiles`) ficam, mesmo que ninguém os peça há muito tempo: sem
 * eles, o mural não abriria offline. A idade é a do cabeçalho Date da resposta guardada (cada uso com
 * rede guarda de novo).
 */
async function pruneOldVersions(cache, current) {
  const limit = Date.now() - OLD_VERSION_DAYS * 86_400_000;
  for (const req of await cache.keys()) {
    if (current.has(req.url) || !VERSIONED.test(new URL(req.url).pathname)) continue;
    const res = await cache.match(req);
    const at = Date.parse(res?.headers.get('date') ?? '');
    if (Number.isFinite(at) && at < limit) await cache.delete(req);
  }
}
