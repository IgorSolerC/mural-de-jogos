import { createRemoteJWKSet } from 'jose';
import { d1Db } from '../adapters/d1';
import { createApp } from '../app';
import { readConfig } from '../config';
import { GOOGLE_CERTS_URL, googleLogin } from '../domain/google';
import { Deps } from '../ports';
import { readSecrets } from '../secrets';

/*
 * A entrada na Cloudflare: o único arquivo, junto com `adapters/d1.ts`, que conhece o Worker. Os
 * arquivos da página do cofre, os cabeçalhos dela e a limpeza diária entram na Fase 3.
 */

/** O que a API do Murall oferece ao cofre pelo service binding (a classe `CofreRpc` em `api/src/entry/worker.ts`). */
interface MuralRpc {
  contaPorGoogle(sub: string): Promise<{ id: string; codigo: string } | null>;
}

/** As variáveis do wrangler.toml (ver `config.ts`), os secrets (ver `secrets.ts`), o banco e o Murall. */
interface Env {
  DB: D1Database;
  MURAL: MuralRpc;
  MODO?: string;
  COTA_LINHAS_DIA?: string;
  COFRE_CODIGOS?: string;
  COFRE_ORIGEM?: string;
  COFRE_RP_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Fora do `fetch`: as chaves do Google ficam guardadas enquanto o Worker está de pé. */
const googleKeys = createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));

function deps(env: Env): Deps {
  const vars = env as unknown as Record<string, unknown>;
  const config = readConfig(vars);
  const secrets = readSecrets(vars);
  return {
    db: d1Db(env.DB),
    config,
    secrets,
    now: () => new Date(),
    mural: {
      async accountByGoogle(sub) {
        const account = await env.MURAL.contaPorGoogle(sub);
        return account ? { id: account.id, code: account.codigo } : null;
      },
    },
    googleLogin: googleLogin({ clientId: config.googleClientId, clientSecret: secrets.googleClientSecret, origin: config.origin, keys: googleKeys }),
  };
}

export default {
  fetch(request, env) {
    return createApp(deps(env)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
