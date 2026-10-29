/*
 * O mural offline. Sem internet, a página abre do que ficou guardado da última visita, e as capas
 * que já apareceram uma vez continuam aparecendo.
 *
 * - A página (navegação): rede primeiro, com prazo curto; sem rede, a última versão guardada.
 * - Os arquivos do próprio site: o guardado na hora. Os do código e das fontes têm o hash da versão
 *   no nome (uma versão nova traz arquivos novos, nunca troca um guardado por outro) e não voltam à
 *   rede; o resto (texturas, ícones) a rede atualiza por trás.
 * - As capas (Wikipedia, Steam, RAWG, Open Library, TMDB, AniList, iTunes): guardadas na primeira vez, para sempre.
 *   As do Kitsu não aceitam CORS: aparecem normalmente, mas não ficam guardadas.
 * - As buscas de catálogo passam direto: sem rede, a busca já avisa e oferece seguir sem capa.
 * - Todo o código da versão aberta fica guardado logo, mesmo o que ainda não foi usado (os pedaços
 *   que só chegam quando alguém toca, como as Configurações do mural ou o painel de emojis). Cada
 *   publicação troca o site inteiro no servidor: sem isso, uma página aberta antes dela pedia um
 *   pedaço que não existe mais, e a folha não abria (ver `keepVersion`).
 * - Os arquivos de versões antigas do site (o código e as fontes, que levam o hash no nome) saem
 *   quando ninguém os pede há mais de 30 dias. Os da versão atual ficam sempre, mesmo sem uso.
 * - Só se guarda o que é do site e igual para todos: o pedido com Authorization e a resposta com
 *   no-store ou private (o que é de uma conta) passam direto. Sair da conta apaga tudo isto (ver
 *   wipeBrowser em src/app/core/browser-reset.ts); a página que abre depois guarda a versão de novo.
 */
/** O código, a página e os arquivos do site (iguais para todos). */
const SHELL = 'mural-site-v1';
const COVERS = 'mural-capas-v1';
const MAX_COVERS = 3000;
/** Um arquivo de outra versão do site guardado há mais que isto sai do cache. */
const OLD_VERSION_DAYS = 30;
/**
 * A marca da versão guardada por inteiro (o texto da página), dentro do próprio cache: some junto com
 * ele (a limpeza do sair), e assim cada versão é guardada uma vez só, e não a cada vez que o service
 * worker acorda. Não existe no servidor.
 */
const KEPT = './versao-guardada';
/** Quantos arquivos a página pode mandar guardar de uma vez (ver a mensagem `guardar-versao`). */
const MAX_PAGE_FILES = 400;
/** A guarda da versão em andamento: a mesma página não é guardada duas vezes ao mesmo tempo. */
let keeping = null;
/** As capas já postas no fim da fila nesta vida do service worker. */
const refreshed = new Set();
const COVER_HOSTS =/(^|\.)(wikimedia\.org|steamstatic\.com|rawg\.io|openlibrary\.org|archive\.org|tmdb\.org|anilist\.co|mzstatic\.com)$/;

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
    // O que é de uma conta (um pedido com a sessão) nunca passa pelo cache.
    if (req.headers.has('authorization')) return;
    // O mural é uma página só (as rotas vão no #). Outra navegação (privacidade.html, /privacidade, um
    // ícone ou o cloud.json abertos na aba) passa direto: não pode virar a página guardada.
    if (req.mode === 'navigate') {
      if (isMural(url)) event.respondWith(page(req, event));
    }
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
    if (cacheable(res) && isHtml(res)) {
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

/** Rede primeiro; sem rede, a última cópia guardada. */
async function fresh(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (cacheable(res)) await cache.put(req, res.clone()).catch(() => undefined);
    return res;
  } catch {
    return (await cache.match(req)) ?? Response.error();
  }
}

/**
 * Os arquivos do site: o guardado na hora. O que tem o hash da versão no nome nunca muda, então basta
 * o guardado; o resto (texturas, ícones, o google.js) a rede atualiza por trás, para a próxima vez.
 */
async function asset(req, event) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(req);
  if (cached && VERSIONED.test(new URL(req.url).pathname)) return cached;
  const network = fetch(req).then((res) => {
    if (cacheable(res)) cache.put(req, res.clone()).catch(() => undefined);
    return res;
  });
  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}

/** A página do mural: a raiz do site (ou o index.html dela), com qualquer ?… e #…. */
function isMural(url) {
  const root = new URL('./', self.registration.scope).pathname;
  return url.pathname === root || url.pathname === root + 'index.html';
}

/** A resposta é uma página (e não um ícone ou um JSON). */
function isHtml(res) {
  return /^text\/html/i.test(res.headers.get('content-type') ?? '');
}

/**
 * Pode ir para o cache: a resposta inteira (200; o 206 de um pedaço de áudio não cabe), do site ou com
 * CORS, e que não diz ser de uma pessoa só (no-store, private).
 */
function cacheable(res) {
  return res.status === 200 && (res.type === 'basic' || res.type === 'cors' || res.type === 'default') && !/no-store|private/i.test(res.headers.get('cache-control') ?? '');
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
    if (cacheable(res)) {
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
 * A página avisa que abriu (src/main.ts), com os arquivos que ela carregou: na primeira visita ela
 * carregou antes do service worker existir, e depois de sair da conta a limpeza apagou o cache; nos
 * dois casos nada do que ela usou (o código, os estilos, as fontes, as texturas) ficou guardado.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.tipo !== 'guardar-versao') return;
  event.waitUntil(
    caches
      .open(SHELL)
      .then(async (cache) => {
        await keepPageFiles(cache, Array.isArray(data.arquivos) ? data.arquivos : []);
        await keepVersion(cache, !data.economia, true);
      })
      .catch(() => undefined),
  );
});

/** Guarda os arquivos do site que a página carregou e ainda não estão no cache. */
async function keepPageFiles(cache, files) {
  const kept = new URL(KEPT, self.location.href).href;
  for (const file of files.slice(0, MAX_PAGE_FILES)) {
    let url;
    try {
      url = new URL(String(file), self.location.href);
    } catch {
      continue;
    }
    url.hash = '';
    // só arquivo do site por http(s): um blob: (a imagem colada, que é de uma conta) tem a mesma origem
    if (!/^https?:$/.test(url.protocol) || url.origin !== self.location.origin || isMural(url) || url.pathname.endsWith('/sw.js') || url.href === kept) continue;
    if (await cache.match(url.href)) continue;
    const res = await fetch(url.href).catch(() => null);
    if (res && cacheable(res)) await cache.put(url.href, res).catch(() => undefined);
  }
}

/**
 * A versão da página guardada: o código que ela ainda não pediu vem já (com `fetchMissing`), e os
 * arquivos de versões antigas saem. Uma vez por versão (a marca `KEPT`); a que ficou pela metade (sem
 * rede, com economia de dados) é guardada de novo na vez seguinte. Sem a página no cache (a limpeza
 * do sair), com `fetchPage` ela vem da rede.
 */
async function keepVersion(cache, fetchMissing, fetchPage = false) {
  let index = await cache.match('./');
  if (!index && fetchPage) {
    const res = await fetch(new URL('./', self.registration.scope).href, { cache: 'no-cache' }).catch(() => null);
    if (!res || !cacheable(res) || !isHtml(res)) return;
    await cache.put('./', res.clone());
    index = res;
  }
  if (!index) return;
  const text = await index.text();
  const done = await cache.match(KEPT);
  if (done && (await done.text()) === text) return;
  if (keeping?.text === text && (keeping.full || !fetchMissing)) return keeping.run;
  const run = (async () => {
    const files = await versionFiles(cache, text, fetchMissing);
    await pruneOldVersions(cache, files.all);
    // só a versão inteira ganha a marca: faltou algum pedaço, a próxima visita tenta de novo
    if (fetchMissing && files.complete) await cache.put(KEPT, new Response(text));
  })();
  keeping = { text, full: fetchMissing, run };
  try {
    await run;
  } finally {
    if (keeping?.run === run) keeping = null;
  }
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
  let complete = true;
  const queue = [];
  const push = (href, from) => {
    try {
      queue.push(new URL(href, from).href);
    } catch {
      /* um endereço que não se lê: fica de fora */
    }
  };
  for (const m of index.matchAll(/(?:src|href)="([^"]+)"/g)) push(m[1], base);
  while (queue.length) {
    const url = queue.pop();
    if (files.has(url)) continue;
    files.add(url);
    const { origin, pathname } = new URL(url);
    if (origin !== self.location.origin || !/\.(?:js|css)$/.test(pathname)) continue;
    let res = await cache.match(url);
    if (!res && VERSIONED.test(pathname)) {
      if (fetchMissing) {
        res = await fetch(url, { priority: 'low' }).catch(() => null);
        if (res && cacheable(res)) await cache.put(url, res.clone()).catch(() => undefined);
        else res = null;
      }
      if (!res) complete = false;
    }
    if (!res) continue;
    const text = await res.text();
    for (const m of text.matchAll(/["'(]\.\/([\w./-]+\.(?:js|css|woff2?))["')]/g)) push(m[1], url);
  }
  return { all: files, complete };
}

/**
 * Tira do cache os arquivos de versões antigas do site guardados há mais de OLD_VERSION_DAYS. Os da
 * versão atual (`current`, ver `versionFiles`) ficam, mesmo que ninguém os peça há muito tempo: sem
 * eles, o mural não abriria offline. A idade é a do cabeçalho Date da resposta guardada (de quando
 * chegou: o arquivo com hash nunca muda e não é pedido de novo). Roda quando uma versão nova é guardada.
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
