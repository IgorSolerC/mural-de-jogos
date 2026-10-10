/** Bytes em base64url, sem o `=` do fim. */
export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** O SHA-256 de um texto (em UTF-8). */
export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
