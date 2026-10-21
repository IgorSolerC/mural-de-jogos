// Confere os cabeçalhos de segurança do cofre num endereço (seção 7.3 do PLANO-COFRE.md e Fase 3):
//
//   node scripts/cabecalhos.mjs https://cofre.murall.igorsc.com.br
//   node scripts/cabecalhos.mjs http://localhost:8787      (o `npx wrangler dev`, sem HSTS)
//
// Pede a página, uma rota da página (/entrar), um arquivo (favicon.svg) e a API (/api/status), e
// confere em cada resposta cada cabeçalho, com o valor exato. Sai com erro (código 1) se faltar ou
// sobrar alguma coisa. Os valores esperados são os mesmos de src/site.ts (um teste confere).

import { pathToFileURL } from 'node:url';

/** Os cabeçalhos esperados; a CSP com o nonce de cada pedido no lugar de NONCE. */
export function expectedHeaders(secure) {
  const csp = [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'nonce-NONCE'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://api.pwnedpasswords.com",
    "manifest-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types angular angular#bundler',
    ...(secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  return {
    'content-security-policy': csp,
    ...(secure ? { 'strict-transport-security': 'max-age=63072000; includeSubDomains' } : {}),
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
    'origin-agent-cluster': '?1',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'permissions-policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), display-capture=(), clipboard-read=(), clipboard-write=(self), publickey-credentials-get=(self), publickey-credentials-create=(self)',
    'cache-control': 'no-store',
  };
}

/** O que está errado numa resposta (lista vazia: tudo certo). */
export function problems(headers, secure) {
  const out = [];
  const csp = headers.get('content-security-policy') ?? '';
  const nonce = /'nonce-([A-Za-z0-9_-]{22})'/.exec(csp)?.[1];
  if (!nonce) out.push('a CSP não tem um nonce de 16 bytes');
  for (const [name, value] of Object.entries(expectedHeaders(secure))) {
    const want = value.replace('NONCE', nonce ?? '');
    const got = headers.get(name);
    if (got !== want) out.push(`${name}: esperava\n    ${want}\n  veio\n    ${got}`);
  }
  if (!secure && headers.has('strict-transport-security')) out.push('HSTS em http');
  for (const name of ['etag', 'last-modified', 'server-timing', 'x-powered-by']) if (headers.has(name)) out.push(`${name} não devia sair`);
  return out;
}

async function main(base) {
  const secure = base.startsWith('https://');
  let failed = false;
  const nonces = new Set();
  for (const path of ['/', '/entrar', '/favicon.svg', '/api/status']) {
    const res = await fetch(new URL(path, base), { redirect: 'manual' });
    const found = problems(res.headers, secure);
    nonces.add(/'nonce-([^']+)'/.exec(res.headers.get('content-security-policy') ?? '')?.[1]);
    console.log(`${found.length ? 'ERRO' : 'ok  '} ${res.status} ${path}`);
    for (const f of found) console.log(`  ${f}`);
    if (res.status >= 400 || found.length) failed = true;
  }
  if (nonces.size !== 4) {
    console.log('ERRO o nonce se repetiu entre pedidos');
    failed = true;
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.log('Uso: node scripts/cabecalhos.mjs <endereço do cofre>');
    process.exit(2);
  }
  await main(process.argv[2]);
}
