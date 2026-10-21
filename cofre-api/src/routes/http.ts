import { Context } from 'hono';
import { HttpError } from '../errors';

/** O maior corpo aceito, em bytes (9.3: até 64 kB). */
export const MAX_BODY_BYTES = 65_536;

/**
 * Lê o corpo JSON com limite de tamanho (`max` bytes). Um corpo que não é um objeto é recusado: no
 * cofre, nada de "na dúvida, vale vazio".
 */
export async function readJson(c: Context, max = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const length = Number(c.req.header('Content-Length') ?? 0);
  if (length > max) throw tooBig();
  const body = await c.req.arrayBuffer();
  if (body.byteLength > max) throw tooBig();
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body));
  } catch {
    throw new HttpError(400, 'json-invalido', 'O pedido não é um JSON válido.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'json-invalido', 'O pedido não é um JSON válido.');
  return data as Record<string, unknown>;
}

const tooBig = () => new HttpError(413, 'grande-demais', 'O pedido é grande demais.');

/** O IP de quem chama, como a Cloudflare informa; fora dela (Node, testes), um valor fixo. */
export function clientIp(c: Context): string {
  return c.req.header('CF-Connecting-IP') ?? 'sem-ip';
}

/** O aparelho, como a página o descreve ("Chrome no Windows"), para o histórico; nunca o user agent inteiro. */
export function deviceOf(body: Record<string, unknown>): string | null {
  const d = body['aparelho'];
  return typeof d === 'string' ? d.replace(/[^\p{L}\p{N} .()/-]/gu, '').slice(0, 60) || null : null;
}

/** O país de quem chama, como a Cloudflare informa (`CF-IPCountry`), para o histórico. */
export function country(c: Context): string | null {
  const v = c.req.header('CF-IPCountry');
  return v && /^[A-Z]{2}$/.test(v) ? v : null;
}
