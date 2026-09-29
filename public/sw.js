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
 */
const SHELL = 'mural-site-v1';
const COVERS = 'mural-capas-v1';
const MAX_COVERS = 3000;
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
    if (req.mode === 'navigate') event.respondWith(page(req));
    else event.respondWith(asset(req, event));
    return;
  }
  if (req.destination === 'image' && COVER_HOSTS.test(url.hostname)) event.respondWith(cover(req));
});

/** A página: a rede tem 4 segundos; depois disso (ou sem rede), vale a guardada. */
async function page(req) {
  const cache = await caches.open(SHELL);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put('./', res.clone());
    return res;
  });
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

async function asset(req, event) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
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
      trim(cache);
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
