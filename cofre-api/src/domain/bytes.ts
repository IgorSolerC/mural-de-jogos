/** Bytes com um ArrayBuffer comum por baixo, o que o WebCrypto aceita. */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Bytes em base64url, sem o `=` do fim. */
export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url para bytes, só no formato canônico (sem padding, sem letra de fora, sem bits sobrando),
 * como `deBase64url` da página do cofre: um dado aceito de dois jeitos é uma porta para trocar uma coisa
 * por outra. Qualquer desvio devolve `null`.
 */
export function fromBase64url(text: string): Bytes | null {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return base64url(out) === text ? out : null;
}

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text) as Bytes;
}

export async function sha256(data: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as Bytes));
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 de `data` com a chave `key`. */
export async function hmac(key: Uint8Array, data: Uint8Array): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key as Bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as Bytes));
}

/** Um BLOB como o banco devolve (Uint8Array no Node, ArrayBuffer ou lista de números no D1) em bytes. */
export function blob(value: Uint8Array | ArrayBuffer | number[]): Bytes {
  return new Uint8Array(value instanceof Uint8Array ? value.slice() : value);
}

/** Compara bytes no mesmo tempo, acertando ou errando em qualquer posição (para provas e hashes). */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
