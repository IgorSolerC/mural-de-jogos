/*
 * O mural offline. Sem internet, a página abre do que ficou guardado da última visita, e as capas
 * que já apareceram uma vez continuam aparecendo.
 *
 * - A página (navegação): rede primeiro, com prazo curto; sem rede, a última versão guardada.
 * - Os arquivos do próprio site: o guardado na hora, e a rede atualiza por trás. Os nomes têm hash,
 *   então uma versão nova do site traz arquivos novos, nunca troca um guardado por outro.
 * - As capas (Wikipedia, Steam, RAWG, Open Library, TMDB, AniList): guardadas na primeira vez, para sempre.
 *   As do Kitsu não aceitam CORS: aparecem normalmente, mas não ficam guardadas.
 * - As buscas de catálogo passam direto: sem rede, a busca já avisa e oferece seguir sem capa.
 * - Os arquivos de versões antigas do site (o código e as fontes, que levam o hash no nome) saem
 *   quando ninguém os pede há mais de 30 dias. Os da versão atual ficam sempre, mesmo sem uso.
 */
/** O mesmo nome está em src/main.ts, que guarda os arquivos da primeira visita. */
const SHELL = 'mural-site-v1';
const COVERS = 'mural-capas-v1';
const MAX_COVERS = 3000;
/** Um arquivo de outra versão do site guardado há mais que isto sai do cache. */
const OLD_VERSION_DAYS = 30;
/** Uma limpeza das versões antigas por vida do service worker (ele acorda a cada visita). */
let pruned = false;
/** As capas já postas no fim da fila nesta vida do service worker. */
const refreshed = new Set();
const COVER_HOSTS =/(^|\.)(wikimedia\.org|steamstatic\.com|rawg\.io|openlibrary\.org|archive\.org|tmdb\.org|anilist\.co)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['./', 'manifest.webmanifest', 'favicon.svg']))
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
      // com a página nova guardada (e com rede), é a hora de tirar o que é de versões antigas
      const saved = cache.put('./', res.clone()).then(() => {
        if (pruned) return;
        pruned = true;
        return pruneOldVersions(cache);
      });
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
 * Tira do cache os arquivos de versões antigas do site guardados há mais de OLD_VERSION_DAYS. Os da
 * versão atual (tudo o que a página guardada carrega, direta ou indiretamente: o código, os pedaços
 * que ele importa, as fontes do CSS) ficam, mesmo que ninguém os peça há muito tempo: sem eles, o
 * mural não abriria offline. A idade é a do cabeçalho Date da resposta guardada (cada uso com rede
 * guarda de novo).
 */
async function pruneOldVersions(cache) {
  const index = await cache.match('./');
  if (!index) return;
  const base = new URL('./', self.registration.scope).href;
  const current = new Set();
  const queue = [...(await index.text()).matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => new URL(m[1], base).href);
  while (queue.length) {
    const url = queue.pop();
    if (current.has(url)) continue;
    current.add(url);
    if (!/\.(?:js|css)$/.test(url)) continue;
    const res = await cache.match(url);
    if (!res) continue;
    const text = await res.text();
    for (const m of text.matchAll(/["'(]\.\/([\w./-]+\.(?:js|css|woff2?))["')]/g)) queue.push(new URL(m[1], url).href);
  }
  const limit = Date.now() - OLD_VERSION_DAYS * 86_400_000;
  for (const req of await cache.keys()) {
    if (current.has(req.url) || !VERSIONED.test(new URL(req.url).pathname)) continue;
    const res = await cache.match(req);
    const at = Date.parse(res?.headers.get('date') ?? '');
    if (Number.isFinite(at) && at < limit) await cache.delete(req);
  }
}
