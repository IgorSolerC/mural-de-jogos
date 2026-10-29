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

/**
 * Um corpo (de um pedido ou de uma resposta), até `max` bytes: lido aos pedaços e cortado assim que
 * passa (null). Um corpo maior nunca fica inteiro na memória, mesmo sem `Content-Length` (o envio aos
 * pedaços, `Transfer-Encoding: chunked`, não diz o tamanho antes).
 */
export async function readCappedBytes(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.byteLength;
  }
  return all;
}
