import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { googleLogin, GOOGLE_TOKEN_URL } from '../src/domain/google';
import { base64url } from '../src/domain/bytes';
import { Mural, MuralAccount } from '../src/ports';

/** O que as suítes usam igual. */

export const BASE_ENV = {
  MODO: 'ligado',
  COTA_LINHAS_DIA: '1000',
  COFRE_CODIGOS: 'K7QF-M2XA',
  COFRE_ORIGEM: 'https://cofre.teste.dev',
  COFRE_RP_ID: 'cofre.teste.dev',
  GOOGLE_CLIENT_ID: 'cofre.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'segredo-do-cliente',
  COFRE_PIMENTA_1: base64url(new Uint8Array(32).fill(7)),
};

/** Todas as tabelas das migrações: cada teste começa com elas vazias (as filhas antes das mães). */
export const TABLES = [
  'cofre_envelopes',
  'cofre_credenciais',
  'cofre_itens',
  'cofre_contas',
  'cofre_sessoes',
  'cofre_desafios',
  'cofre_eventos',
  'cofre_freio_senha',
  'freios',
  'uso_diario',
];
export const NOW = new Date('2026-10-21T15:00:00Z');

/** A conta do Murall de teste (o código está em COFRE_CODIGOS) e outra, fora da lista. */
export const DONO: MuralAccount = { id: '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', code: 'K7QFM2XA' };
export const OUTRA: MuralAccount = { id: '1b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c', code: 'ABCD1234' };

/** O Murall de mentira: o `sub` do Google → a conta. */
export function fakeMural(accounts: Record<string, MuralAccount> = { 'sub-dono': DONO, 'sub-outra': OUTRA }): Mural {
  return { accountByGoogle: async (sub) => accounts[sub] ?? null };
}

export const VERIFIER = 'v'.repeat(43);

/**
 * O Google de mentira: um par de chaves gerado na hora assina o `id_token`; o "código" que a página
 * manda é `codigo-<sub>` (ou `codigo-ruim`, que o Google recusa). Guarda os pedidos para conferir.
 */
export async function fakeGoogle() {
  const google = await generateKeyPair('RS256', { extractable: true });
  const other = (await generateKeyPair('RS256')).privateKey;
  const jwk: JWK = { ...(await exportJWK(google.publicKey)), kid: 'teste', alg: 'RS256' };
  const requests: URLSearchParams[] = [];
  let tokenOptions: { aud?: string; key?: CryptoKey; expiresIn?: string } = {};
  const fetch = async (url: string, init?: RequestInit) => {
    if (url !== GOOGLE_TOKEN_URL) return new Response('não', { status: 404 });
    const form = new URLSearchParams(init?.body as string);
    requests.push(form);
    const code = form.get('code') ?? '';
    if (!code.startsWith('codigo-') || code === 'codigo-ruim') return Response.json({ error: 'invalid_grant' }, { status: 400 });
    const idToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'teste' })
      .setSubject(code.slice('codigo-'.length))
      .setAudience(tokenOptions.aud ?? BASE_ENV.GOOGLE_CLIENT_ID)
      .setIssuer('https://accounts.google.com')
      .setIssuedAt()
      .setExpirationTime(tokenOptions.expiresIn ?? '1h')
      .sign(tokenOptions.key ?? google.privateKey);
    return Response.json({ id_token: idToken, access_token: 'x' });
  };
  return {
    requests,
    /** Troca como os próximos `id_token` saem (outro `aud`, outra chave, vencido). */
    tamper(o: typeof tokenOptions) {
      tokenOptions = o;
    },
    otherKey: other,
    login: (clientSecret = BASE_ENV.GOOGLE_CLIENT_SECRET) =>
      googleLogin({ clientId: BASE_ENV.GOOGLE_CLIENT_ID, clientSecret, origin: BASE_ENV.COFRE_ORIGEM, keys: createLocalJWKSet({ keys: [jwk] }), fetch }),
  };
}

/** Uma chamada com corpo JSON, da origem do cofre (ou de outra), com o token e o IP, se vierem. */
export function jsonCaller(call: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  return (method: string, path: string, body?: unknown, o: { origin?: string | null; token?: string; ip?: string } = {}) => {
    const origin = o.origin === undefined ? BASE_ENV.COFRE_ORIGEM : o.origin;
    return call(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {}),
        ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
        ...(o.ip ? { 'CF-Connecting-IP': o.ip } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  };
}
