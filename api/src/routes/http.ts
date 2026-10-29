import { Context } from 'hono';
import { readCappedBytes } from '../domain/bytes';
import { Session, authenticate } from '../domain/session';
import { HttpError } from '../errors';
import { Deps } from '../ports';

/** O maior corpo JSON aceito, em caracteres. */
const MAX_JSON_CHARS = 16_384;

const tooBig = () => new HttpError(413, 'grande-demais', 'O pedido é grande demais.');

/**
 * O corpo do pedido, até `maxBytes`: o `Content-Length` grande é recusado antes de ler, e o corpo sem
 * ele (enviado aos pedaços) é cortado assim que passa, sem ficar inteiro na memória. Passou, `big()`.
 */
export async function readBody(c: Context, maxBytes: number, big: () => Error = tooBig): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(c.req.header('Content-Length') ?? 0) > maxBytes) throw big();
  const bytes = await readCappedBytes(c.req.raw.body, maxBytes);
  if (!bytes) throw big();
  return bytes;
}

/** O corpo do pedido como texto (UTF-8), até `maxChars` caracteres (ver `readBody`). */
export async function readText(c: Context, maxChars: number, big: () => Error = tooBig): Promise<string> {
  // um caractere tem até 3 bytes em UTF-8 (os de 4 bytes contam 2 no JS)
  const text = new TextDecoder().decode(await readBody(c, 3 * maxChars, big));
  if (text.length > maxChars) throw big();
  return text;
}

/** Lê o corpo JSON com limite de tamanho (`max` caracteres); um corpo que não é objeto vira `{}`. */
export async function readJson(c: Context, max = MAX_JSON_CHARS): Promise<Record<string, unknown>> {
  const text = await readText(c, max);
  if (!text) return {};
  try {
    const data: unknown = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'json-invalido', 'O pedido não é um JSON válido.');
  }
}

/** Quem está chamando, pelo cabeçalho `Authorization` (ver `authenticate`). */
export function sessionOf(deps: Deps, c: Context): Promise<Session> {
  return authenticate(deps, c.req.header('Authorization'));
}
