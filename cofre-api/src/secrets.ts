import { fromBase64url } from './domain/bytes';
import { HttpError } from './errors';

/**
 * Os secrets do Worker (`wrangler secret put`, nunca no wrangler.toml nem no git), seção 16.2 do plano:
 *
 * - `COFRE_PIMENTA_<n>`: 32 bytes em base64url. As provas da senha e do código são guardadas como
 *   HMAC com ela, e o IP só como HMAC com uma chave do dia derivada dela. A de número maior é a atual;
 *   as anteriores continuam valendo para conferir, até cada conta passar para a nova.
 * - `COFRE_ENVELOPES_<n>`: 32 bytes; cifra o S_i dos aparelhos no modo servidor (parte 3).
 * - `GOOGLE_CLIENT_SECRET`: o do cliente OAuth do cofre.
 *
 * Sem eles (ou com um fora do formato), o que depende deles responde 503: nunca um valor padrão.
 */
export interface Secrets {
  /** As versões da pimenta: número → 32 bytes. */
  peppers: ReadonlyMap<number, Uint8Array>;
  googleClientSecret: string;
}

export function readSecrets(env: Record<string, unknown>): Secrets {
  const peppers = new Map<number, Uint8Array>();
  for (const [key, value] of Object.entries(env)) {
    const m = /^COFRE_PIMENTA_([1-9][0-9]{0,2})$/.exec(key);
    if (!m || typeof value !== 'string') continue;
    const bytes = fromBase64url(value.trim());
    if (bytes?.length === 32) peppers.set(Number(m[1]), bytes);
  }
  const secret = env['GOOGLE_CLIENT_SECRET'];
  return { peppers, googleClientSecret: typeof secret === 'string' ? secret.trim() : '' };
}

/** A pimenta atual (a de número maior) e o número dela. */
export function currentPepper(secrets: Secrets): { version: number; key: Uint8Array } {
  const version = Math.max(0, ...secrets.peppers.keys());
  const key = secrets.peppers.get(version);
  if (!key) throw new HttpError(503, 'cofre-sem-segredo', 'O cofre ainda não está configurado no servidor.');
  return { version, key };
}
