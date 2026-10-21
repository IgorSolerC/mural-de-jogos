import { base64url } from './domain/bytes';

/**
 * Os cabeçalhos de segurança de toda resposta do cofre, a página e a API (seção 7.3 do plano). O
 * GitHub Pages não deixa pôr cabeçalhos, e `frame-ancestors`, HSTS, COOP e COEP só valem como cabeçalho:
 * é por isso que o cofre mora num Worker.
 *
 * - CSP sem `unsafe-inline` nem `unsafe-eval`: scripts só da própria origem (mais o
 *   `wasm-unsafe-eval` do Argon2id em WASM), estilos da origem ou com o nonce do pedido (os que o
 *   Angular injeta, pelo `ngCspNonce`), conexões só com a origem e com o aviso de senha vazada, e
 *   Trusted Types obrigatório (só as políticas do Angular).
 * - `base-uri 'self'` (o plano dizia `'none'`): o Angular usa `<base href="/">`; um `<base>` para fora
 *   continua barrado.
 * - Isolamento de origem (COOP + COEP + CORP + Origin-Agent-Cluster): a página fica num processo só
 *   dela, e nada de outra origem entra sem permissão.
 * - Em `http://localhost` (o desenvolvimento, 16.15), sem HSTS e sem `upgrade-insecure-requests`.
 */

export function newNonce(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

export function contentSecurityPolicy(nonce: string, secure: boolean): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    `style-src 'self' 'nonce-${nonce}'`,
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
}

export const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'hid=()',
  'bluetooth=()',
  'display-capture=()',
  'clipboard-read=()',
  'clipboard-write=(self)',
  'publickey-credentials-get=(self)',
  'publickey-credentials-create=(self)',
].join(', ');

/** Todos os cabeçalhos, para o nonce deste pedido. `secure`: o cofre está em https (fora do localhost). */
export function securityHeaders(nonce: string, secure: boolean): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(nonce, secure),
    ...(secure ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': PERMISSIONS_POLICY,
    // nada fica em cache, nem no de voltar/avançar (bfcache)
    'Cache-Control': 'no-store',
  };
}

/** A resposta com os cabeçalhos de segurança (os do mesmo nome que já vinham são trocados). */
export function withSecurity(response: Response, nonce: string, secure: boolean): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders(nonce, secure))) out.headers.set(name, value);
  // o servidor de arquivos não diz quando o arquivo mudou: o cofre não deixa rastro de versão
  out.headers.delete('ETag');
  out.headers.delete('Last-Modified');
  return out;
}
