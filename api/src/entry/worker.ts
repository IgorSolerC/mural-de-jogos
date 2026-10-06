import { d1Db } from '../adapters/d1';
import { createApp } from '../app';
import { readConfig } from '../config';
import { createRemoteJWKSet } from 'jose';
import { cleanup } from '../domain/cleanup';
import { GOOGLE_CERTS_URL, googleVerifier } from '../domain/google';
import { Deps } from '../ports';

/** A entrada na Cloudflare: o único arquivo, junto com `adapters/d1.ts`, que conhece o Worker. */
interface Env {
  DB: D1Database;
  MODO?: string;
  ORIGENS?: string;
  COTA_LINHAS_DIA?: string;
  GOOGLE_CLIENT_ID?: string;
}

/** Fora do `fetch`: as chaves do Google ficam guardadas enquanto o Worker está de pé. */
const googleKeys = createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));

function deps(env: Env): Deps {
  const config = readConfig(env as unknown as Record<string, unknown>);
  return { db: d1Db(env.DB), config, now: () => new Date(), verifyGoogle: googleVerifier(config.googleClientId, googleKeys) };
}

export default {
  fetch(request, env) {
    return createApp(deps(env)).fetch(request);
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanup(deps(env)));
  },
} satisfies ExportedHandler<Env>;
