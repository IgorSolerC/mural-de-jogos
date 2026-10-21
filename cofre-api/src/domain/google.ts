import { JWTVerifyGetKey, jwtVerify } from 'jose';
import { HttpError } from '../errors';

/** Onde o código do login vira tokens, e as chaves que assinam o `id_token`. */
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** O caminho do cofre para onde o Google volta (8.1 e 16.14). */
export const RETURN_PATH = '/entrar';

/**
 * Troca o código do login (fluxo de código com PKCE, escopo só `openid`) pela identidade: o `sub` da
 * conta do Google, que é o mesmo em todos os clientes OAuth (o Murall acha a conta por ele). O código
 * e o verificador vêm da página; o client secret, dos secrets do Worker.
 */
export type GoogleLogin = (code: string, verifier: string) => Promise<string>;

export interface GoogleLoginOptions {
  clientId: string;
  clientSecret: string;
  /** O endereço do cofre: o `redirect_uri` é ele + `/entrar`, igual ao que a página mandou ao Google. */
  origin: string;
  keys: JWTVerifyGetKey;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

const unavailable = () => new HttpError(503, 'login-indisponivel', 'O login do cofre ainda não está configurado no servidor.');
const invalid = () => new HttpError(401, 'login-invalido', 'Não consegui confirmar o login com o Google. Entre de novo.');

export function googleLogin(o: GoogleLoginOptions): GoogleLogin {
  const doFetch = o.fetch ?? ((url, init) => fetch(url, init));
  return async (code, verifier) => {
    if (!o.clientId || !o.clientSecret) throw unavailable();
    let response: Response;
    try {
      response = await doFetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: o.clientId,
          client_secret: o.clientSecret,
          redirect_uri: o.origin + RETURN_PATH,
        }),
      });
    } catch {
      throw new HttpError(502, 'google-fora', 'O Google não respondeu. Tente de novo.');
    }
    // código vencido, já usado ou com o verificador errado: o Google responde 400
    if (!response.ok) throw invalid();
    const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
    if (typeof body?.id_token !== 'string') throw invalid();
    try {
      const { payload } = await jwtVerify(body.id_token, o.keys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: o.clientId,
        algorithms: ['RS256'],
        clockTolerance: 30,
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      if (typeof payload.sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(payload.sub)) throw new Error('sub inválido');
      return payload.sub;
    } catch {
      throw invalid();
    }
  };
}

/** O código que o Google mandou de volta e o verificador do PKCE (RFC 7636: 43 a 128 caracteres). */
export function readLoginBody(body: Record<string, unknown>): { code: string; verifier: string } {
  const code = body['codigo'];
  const verifier = body['verificador'];
  if (typeof code !== 'string' || !/^[\x21-\x7e]{10,512}$/.test(code) || typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new HttpError(400, 'login-incompleto', 'Faltou o código do Google.');
  }
  return { code, verifier };
}
