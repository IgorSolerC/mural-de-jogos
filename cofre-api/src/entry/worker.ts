import { d1Db } from '../adapters/d1';
import { createApp } from '../app';
import { readConfig } from '../config';
import { Deps } from '../ports';

/*
 * A entrada na Cloudflare: o único arquivo, junto com `adapters/d1.ts`, que conhece o Worker. Os
 * arquivos da página do cofre, os cabeçalhos dela e a limpeza diária entram na Fase 3.
 */

/** As variáveis do wrangler.toml (ver `config.ts`) e o banco. */
interface Env {
  DB: D1Database;
  MODO?: string;
  COTA_LINHAS_DIA?: string;
  COFRE_CODIGOS?: string;
  COFRE_ORIGEM?: string;
  COFRE_RP_ID?: string;
  GOOGLE_CLIENT_ID?: string;
}

function deps(env: Env): Deps {
  return { db: d1Db(env.DB), config: readConfig(env as unknown as Record<string, unknown>), now: () => new Date() };
}

export default {
  fetch(request, env) {
    return createApp(deps(env)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
