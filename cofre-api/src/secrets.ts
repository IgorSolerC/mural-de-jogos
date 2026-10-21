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
  /** As versões da chave dos envelopes do modo servidor: número → 32 bytes. */
  envelopeKeys: ReadonlyMap<number, Uint8Array>;
  googleClientSecret: string;
}

export function readSecrets(env: Record<string, unknown>): Secrets {
  const secret = env['GOOGLE_CLIENT_SECRET'];
  return { peppers: versions(env, 'COFRE_PIMENTA'), envelopeKeys: versions(env, 'COFRE_ENVELOPES'), googleClientSecret: typeof secret === 'string' ? secret.trim() : '' };
}

/** As versões `<nome>_1`, `<nome>_2`… que têm 32 bytes em base64url; as fora do formato são ignoradas. */
function versions(env: Record<string, unknown>, name: string): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  const pattern = new RegExp(`^${name}_([1-9][0-9]{0,2})$`);
  for (const [key, value] of Object.entries(env)) {
    const m = pattern.exec(key);
    if (!m || typeof value !== 'string') continue;
    const bytes = fromBase64url(value.trim());
    if (bytes?.length === 32) out.set(Number(m[1]), bytes);
  }
  return out;
}

/** A versão atual (a de número maior) e o número dela; sem nenhuma, 503. */
function current(keys: ReadonlyMap<number, Uint8Array>): { version: number; key: Uint8Array } {
  const version = Math.max(0, ...keys.keys());
  const key = keys.get(version);
  if (!key) throw new HttpError(503, 'cofre-sem-segredo', 'O cofre ainda não está configurado no servidor.');
  return { version, key };
}

/** A pimenta atual. */
export function currentPepper(secrets: Secrets): { version: number; key: Uint8Array } {
  return current(secrets.peppers);
}

/** A chave atual dos envelopes do modo servidor. */
export function currentEnvelopeKey(secrets: Secrets): { version: number; key: Uint8Array } {
  return current(secrets.envelopeKeys);
}
