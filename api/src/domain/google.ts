import { JWTVerifyGetKey, jwtVerify } from 'jose';
import { HttpError } from '../errors';

/** O que a API aproveita do login do Google: só o id da conta e, para sugerir um nome, o primeiro nome. */
export interface GoogleIdentity {
  sub: string;
  givenName: string | null;
}

export type VerifyGoogle = (credential: string) => Promise<GoogleIdentity>;

/** As chaves públicas do Google, onde o `jose` busca (e guarda) as chaves que assinam os tokens. */
export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * Confere o ID token do botão "Fazer login com o Google": assinatura com as chaves do Google,
 * emissor do Google, `aud` igual ao nosso Client ID e validade. O e-mail não é lido.
 */
export function googleVerifier(clientId: string, keys: JWTVerifyGetKey): VerifyGoogle {
  return async (credential) => {
    if (!clientId) throw new HttpError(503, 'login-indisponivel', 'O login ainda não está configurado na nuvem.');
    try {
      const { payload } = await jwtVerify(credential, keys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: clientId,
        algorithms: ['RS256'],
        clockTolerance: 30,
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      const sub = payload.sub;
      if (typeof sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(sub)) throw new Error('sub inválido');
      const givenName = typeof payload['given_name'] === 'string' ? payload['given_name'] : null;
      return { sub, givenName };
    } catch {
      throw new HttpError(401, 'login-invalido', 'Não consegui confirmar o login com o Google. Tente entrar de novo.');
    }
  };
}
