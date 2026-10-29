// O service worker (public/sw.js) num navegador de mentira: o Cache Storage, a rede e os eventos.
// Roda com `node --test scripts/sw.test.mjs` (está no npm run test:ci).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://murall.test';
const SW_URL = `${ORIGIN}/sw.js`;
const OLD_DATE = new Date(Date.now() - 40 * 86_400_000).toUTCString();

const INDEX = '<!doctype html><html><head><base href="/"><link rel="stylesheet" href="styles-AAAAAAAA.css"><link rel="manifest" href="manifest.webmanifest"></head><body><script src="main-BBBBBBBB.js" type="module"></script></body></html>';
const INDEX_2 = INDEX.replace('main-BBBBBBBB.js', 'main-EEEEEEEE.js');

/** O site no servidor: endereço → [corpo, content-type, cabeçalhos a mais]. */
function site() {
  return new Map([
    [`${ORIGIN}/`, [INDEX, 'text/html']],
    [`${ORIGIN}/index.html`, [INDEX, 'text/html']],
    [`${ORIGIN}/styles-AAAAAAAA.css`, ['@font-face{src:url(./media/kalam-CCCCCCCC.woff2)}', 'text/css']],
    [`${ORIGIN}/main-BBBBBBBB.js`, ['import"./chunk-DDDDDDDD.js";', 'text/javascript']],
    [`${ORIGIN}/main-EEEEEEEE.js`, ['import"./chunk-DDDDDDDD.js";', 'text/javascript']],
    // o pedaço que só chega quando alguém toca (um @defer)
    [`${ORIGIN}/chunk-DDDDDDDD.js`, ['export const folha=()=>import("./chunk-FFFFFFFF.js");', 'text/javascript']],
    [`${ORIGIN}/chunk-FFFFFFFF.js`, ['export const x=1;', 'text/javascript']],
    [`${ORIGIN}/media/kalam-CCCCCCCC.woff2`, ['fonte', 'font/woff2']],
    [`${ORIGIN}/manifest.webmanifest`, ['{}', 'application/manifest+json']],
    [`${ORIGIN}/favicon.svg`, ['<svg/>', 'image/svg+xml']],
    [`${ORIGIN}/cloud.json`, ['{"ativo":true}', 'application/json']],
    [`${ORIGIN}/icons/icon-512.png`, ['png', 'image/png']],
    [`${ORIGIN}/privacidade`, ['<p>privacidade</p>', 'text/html']],
    [`${ORIGIN}/textures/papel.webp`, ['papel 1', 'image/webp']],
    [`${ORIGIN}/api/v1/mural`, ['{"da":"conta"}', 'application/json', { 'cache-control': 'no-store' }]],
    [`${ORIGIN}/perfil.json`, ['{"da":"conta"}', 'application/json', { 'cache-control': 'private, max-age=60' }]],
  ]);
}

class FakeCache {
  constructor() {
    this.entries = new Map();
  }
  key(r) {
    return new URL(typeof r === 'string' ? r : r.url, SW_URL).href;
  }
  async match(r) {
    return this.entries.get(this.key(r))?.clone();
  }
  async put(r, res) {
    if (res.status === 206) throw new TypeError('206 não cabe');
    this.entries.set(this.key(r), res.clone());
  }
  async add(r) {
    await this.put(r, await env.fetch(r));
  }
  async addAll(list) {
    for (const r of list) await this.add(r);
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async delete(r) {
    return this.entries.delete(this.key(r));
  }
}

let env;

/** Um service worker novo (acabou de acordar), com o cache e a rede dados. */
function boot({ stores = new Map(), server = site() } = {}) {
  const handlers = {};
  const fetched = [];
  const state = { offline: false, server, fetched, stores };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async has(name) {
      return stores.has(name);
    },
  };
  const fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url, SW_URL).href;
    fetched.push(url);
    if (state.offline) throw new TypeError('Failed to fetch');
    const hit = state.server.get(url.split('#')[0]);
    if (!hit) return new Response('não achei', { status: 404, headers: { 'content-type': 'text/html', date: new Date().toUTCString() } });
    const [body, type, extra = {}] = hit;
    return new Response(body, { status: 200, headers: { 'content-type': type, date: extra.date ?? new Date().toUTCString(), ...extra } });
  };
  const self = {
    location: new URL(SW_URL),
    registration: { scope: `${ORIGIN}/` },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener: (type, fn) => (handlers[type] = fn),
  };
  const context = vm.createContext({
    self,
    caches,
    fetch,
    Response,
    Request,
    Headers,
    URL,
    console,
    // o prazo da página (4 s) não segura o teste
    setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
  });
  vm.runInContext(SOURCE, context);
  env = { ...state, fetch, handlers, caches, state };
  return env;
}

/** Um pedido da página (o Request do Node não aceita mode navigate). */
function request(path, { mode = 'no-cors', headers = {}, destination = '' } = {}) {
  return { url: new URL(path, `${ORIGIN}/`).href, method: 'GET', mode, destination, headers: new Headers(headers) };
}

/** Dispara o fetch: devolve a resposta dada pelo service worker (ou null, quando ele deixa passar), já com o que ficou para depois terminado. */
async function dispatch(sw, req) {
  const waits = [];
  let responded = null;
  sw.handlers.fetch({ request: req, respondWith: (p) => (responded = Promise.resolve(p)), waitUntil: (p) => waits.push(p) });
  const res = responded ? await responded : null;
  await Promise.all(waits);
  return res;
}

async function message(sw, data) {
  const waits = [];
  sw.handlers.message({ data, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
}

const shell = (sw) => sw.stores.get('mural-site-v1');
const has = async (sw, path) => Boolean(await shell(sw)?.match(new URL(path, `${ORIGIN}/`).href));
const navigate = (sw, path = '/') => dispatch(sw, request(path, { mode: 'navigate' }));

test('abrir o mural guarda a página e todo o código da versão, até o pedaço que ninguém tocou', async () => {
  const sw = boot();
  const res = await navigate(sw);
  assert.equal(await res.text(), INDEX);
  assert.equal(await (await shell(sw).match('./')).text(), INDEX);
  for (const file of ['/main-BBBBBBBB.js', '/styles-AAAAAAAA.css', '/chunk-DDDDDDDD.js', '/chunk-FFFFFFFF.js']) assert.ok(await has(sw, file), file);
  // a fonte não vem antes de a tela pedir
  assert.equal(await has(sw, '/media/kalam-CCCCCCCC.woff2'), false);
});

test('outra navegação no site (um ícone, o cloud.json, /privacidade) passa direto e não vira a página guardada', async () => {
  const sw = boot();
  await navigate(sw);
  for (const path of ['/icons/icon-512.png', '/cloud.json', '/privacidade', '/privacidade.html', '/sw.js']) {
    assert.equal(await navigate(sw, path), null, path);
  }
  assert.equal(await (await shell(sw).match('./')).text(), INDEX);
  // e sem rede o mural ainda abre dela
  sw.state.offline = true;
  assert.equal(await (await navigate(sw, '/?aberta=nao')).text(), INDEX);
});

test('a raiz que responde outra coisa que não uma página (um JSON) não substitui a guardada', async () => {
  const server = site();
  const sw = boot({ server });
  await navigate(sw);
  server.set(`${ORIGIN}/`, ['{"ops":1}', 'application/json']);
  await navigate(sw);
  assert.equal(await (await shell(sw).match('./')).text(), INDEX);
});

test('o que é de uma conta não vai para o cache: o pedido com Authorization e a resposta no-store ou private', async () => {
  const sw = boot();
  assert.equal(await dispatch(sw, request('/api/v1/mural', { headers: { authorization: 'Bearer x' } })), null);
  assert.equal(await (await dispatch(sw, request('/api/v1/mural'))).text(), '{"da":"conta"}');
  assert.equal(await (await dispatch(sw, request('/perfil.json'))).text(), '{"da":"conta"}');
  assert.equal(await has(sw, '/api/v1/mural'), false);
  assert.equal(await has(sw, '/perfil.json'), false);
});

test('o arquivo com hash guardado vem do cache sem ir à rede; o sem hash atualiza por trás', async () => {
  const server = site();
  const sw = boot({ server });
  await navigate(sw);
  await dispatch(sw, request('/textures/papel.webp'));
  sw.fetched.length = 0;
  assert.equal(await (await dispatch(sw, request('/main-BBBBBBBB.js'))).text(), 'import"./chunk-DDDDDDDD.js";');
  assert.deepEqual(sw.fetched, []);
  server.set(`${ORIGIN}/textures/papel.webp`, ['papel 2', 'image/webp']);
  assert.equal(await (await dispatch(sw, request('/textures/papel.webp'))).text(), 'papel 1');
  assert.equal(await (await dispatch(sw, request('/textures/papel.webp'))).text(), 'papel 2');
});

test('a versão é guardada uma vez só, mesmo com o service worker acordando de novo', async () => {
  const stores = new Map();
  await navigate(boot({ stores }));
  const sw = boot({ stores });
  await navigate(sw);
  await message(sw, { tipo: 'guardar-versao', economia: false, arquivos: [] });
  // só a página foi à rede: o código já estava guardado e marcado
  assert.deepEqual(sw.fetched, [`${ORIGIN}/`]);
});

test('a versão guardada pela metade (sem rede para um pedaço) é completada na vez seguinte', async () => {
  const server = site();
  const lazy = server.get(`${ORIGIN}/chunk-FFFFFFFF.js`);
  server.delete(`${ORIGIN}/chunk-FFFFFFFF.js`);
  const stores = new Map();
  const sw = boot({ stores, server });
  await navigate(sw);
  assert.equal(await has(sw, '/chunk-FFFFFFFF.js'), false);
  server.set(`${ORIGIN}/chunk-FFFFFFFF.js`, lazy);
  // no mesmo service worker, pela mensagem da página
  await message(sw, { tipo: 'guardar-versao', economia: false, arquivos: [] });
  assert.ok(await has(sw, '/chunk-FFFFFFFF.js'));
});

test('com economia de dados só fica o que foi usado, e a visita sem economia guarda o resto (mesmo no mesmo service worker)', async () => {
  const sw = boot();
  await dispatch(sw, { ...request('/', { mode: 'navigate', headers: { 'save-data': 'on' } }) });
  assert.equal(await has(sw, '/chunk-DDDDDDDD.js'), false);
  await message(sw, { tipo: 'guardar-versao', economia: false, arquivos: [] });
  assert.ok(await has(sw, '/chunk-DDDDDDDD.js'));
  assert.ok(await has(sw, '/chunk-FFFFFFFF.js'));
});

test('depois da limpeza do sair (o cache todo apagado), a página que abre guarda a versão de novo', async () => {
  const stores = new Map();
  const sw = boot({ stores });
  await navigate(sw);
  // wipeBrowser: todos os caches saem
  for (const name of [...stores.keys()]) stores.delete(name);
  await message(sw, {
    tipo: 'guardar-versao',
    economia: false,
    arquivos: [
      `${ORIGIN}/main-BBBBBBBB.js`,
      `${ORIGIN}/styles-AAAAAAAA.css`,
      `${ORIGIN}/media/kalam-CCCCCCCC.woff2`,
      `${ORIGIN}/textures/papel.webp#x`,
      `${ORIGIN}/cloud.json`,
      // nunca: outro site, uma imagem colada (blob:, da conta), o próprio service worker, a página
      'https://outro.test/x.js',
      `blob:${ORIGIN}/0b0e-imagem`,
      `${ORIGIN}/sw.js`,
      `${ORIGIN}/`,
      'não é endereço:::',
    ],
  });
  assert.equal(await (await shell(sw).match('./')).text(), INDEX);
  for (const file of ['/main-BBBBBBBB.js', '/styles-AAAAAAAA.css', '/media/kalam-CCCCCCCC.woff2', '/textures/papel.webp', '/cloud.json', '/chunk-FFFFFFFF.js']) {
    assert.ok(await has(sw, file), file);
  }
  const keys = [...shell(sw).entries.keys()];
  assert.ok(!keys.some((k) => k.startsWith('blob:') || k.includes('outro.test') || k.endsWith('/sw.js')), keys.join(' '));
});

test('a versão nova tira os arquivos de versões antigas com mais de 30 dias, e nunca os da atual', async () => {
  const server = site();
  // a versão de antes, guardada há 40 dias
  server.set(`${ORIGIN}/main-BBBBBBBB.js`, ['import"./chunk-DDDDDDDD.js";', 'text/javascript', { date: OLD_DATE }]);
  server.set(`${ORIGIN}/chunk-DDDDDDDD.js`, ['export const a=1;', 'text/javascript', { date: OLD_DATE }]);
  const stores = new Map();
  await navigate(boot({ stores, server }));
  server.set(`${ORIGIN}/`, [INDEX_2, 'text/html']);
  const sw = boot({ stores, server });
  await navigate(sw);
  assert.equal(await has(sw, '/main-BBBBBBBB.js'), false);
  assert.ok(await has(sw, '/main-EEEEEEEE.js'));
  // velho, mas também é da versão nova
  assert.ok(await has(sw, '/chunk-DDDDDDDD.js'));
});

test('as capas guardadas não pegam a resposta com no-store, e a de outro lugar passa direto', async () => {
  const server = site();
  server.set('https://upload.wikimedia.org/capa.jpg', ['jpg', 'image/jpeg']);
  server.set('https://upload.wikimedia.org/privada.jpg', ['jpg', 'image/jpeg', { 'cache-control': 'no-store' }]);
  const sw = boot({ server });
  await dispatch(sw, request('https://upload.wikimedia.org/capa.jpg', { destination: 'image' }));
  await dispatch(sw, request('https://upload.wikimedia.org/privada.jpg', { destination: 'image' }));
  const covers = sw.stores.get('mural-capas-v1');
  assert.ok(await covers.match('https://upload.wikimedia.org/capa.jpg'));
  assert.equal(await covers.match('https://upload.wikimedia.org/privada.jpg'), undefined);
  assert.equal(await dispatch(sw, request('https://mural-api.test/v1/imagens/x', { destination: 'image' })), null);
});
