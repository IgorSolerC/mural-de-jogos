import { Context } from 'hono';
import { Session, authenticate } from '../domain/session';
import { HttpError } from '../errors';
import { Deps } from '../ports';

/** O maior corpo JSON aceito, em caracteres. */
const MAX_JSON_CHARS = 16_384;

/** Lê o corpo JSON com limite de tamanho; um corpo que não é objeto vira `{}`. */
export async function readJson(c: Context): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (text.length > MAX_JSON_CHARS) throw new HttpError(413, 'grande-demais', 'O pedido é grande demais.');
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
