import { WorkerEntrypoint } from 'cloudflare:workers';
import { d1Db } from '../adapters/d1';
import { createApp } from '../app';
import { readCatalogKeys } from '../routes/catalog';
import { readAgendaKeys } from '../domain/agenda';
import { readConfig } from '../config';
import { createRemoteJWKSet } from 'jose';
import { cleanup } from '../domain/cleanup';
import { GOOGLE_CERTS_URL, googleVerifier } from '../domain/google';
import { accountByGoogle } from '../domain/vault';
import { Deps } from '../ports';

/*
 * A entrada na Cloudflare: o único arquivo, junto com `adapters/d1.ts`, que conhece o Worker.
 */

/** O que o cofre de senhas oferece ao Murall pelo service binding (a classe `MuralRpc` em `cofre-api/src/entry/worker.ts`). */
interface VaultRpc {
  podeUsar(codigo: string): Promise<boolean>;
  temCofre(usuarioId: string): Promise<boolean>;
  apagarCofre(usuarioId: string): Promise<{ apagado: true }>;
  encerrarCarencias(usuarioId: string): Promise<{ encerradas: true }>;
}

/** As variáveis do wrangler.toml (ver `config.ts`), os bancos e o cofre. */
interface Env {
  DB: D1Database;
  /** Só os bytes das imagens (o banco `mural-imagens`, PLANO-IMAGENS.md). */
  IMAGENS?: D1Database;
  COFRE?: VaultRpc;
  MODO?: string;
  ORIGENS?: string;
  COTA_LINHAS_DIA?: string;
  GOOGLE_CLIENT_ID?: string;
  VER_MURAIS?: string;
  API_CODIGOS?: string;
  SITE?: string;
  IMAGENS_MB_TOTAL?: string;
  IMAGENS_MB_PESSOA?: string;
  IMAGENS_POR_DIA?: string;
  /** Secrets (`wrangler secret put`), nunca no wrangler.toml: as chaves do site na busca. */
  TMDB_KEY?: string;
  RAWG_KEY?: string;
  /** O Google Agenda: o client secret do cliente OAuth e a chave (32 bytes em base64) que cifra a permissão. */
  GOOGLE_CLIENT_SECRET?: string;
  AGENDA_CHAVE?: string;
}

/** Fora do `fetch`: as chaves do Google ficam guardadas enquanto o Worker está de pé. */
const googleKeys = createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));

function deps(env: Env): Deps {
  const config = readConfig(env as unknown as Record<string, unknown>);
  return {
    db: d1Db(env.DB),
    ...(env.IMAGENS ? { imagesDb: d1Db(env.IMAGENS) } : {}),
    config,
    now: () => new Date(),
    verifyGoogle: googleVerifier(config.googleClientId, googleKeys),
    catalog: { keys: readCatalogKeys(env as unknown as Record<string, unknown>) },
    agenda: { keys: readAgendaKeys(env as unknown as Record<string, unknown>) },
    log: (line) => console.warn(line),
    ...(env.COFRE
      ? {
          vault: {
            canUse: (code: string) => env.COFRE!.podeUsar(code),
            has: (userId: string) => env.COFRE!.temCofre(userId),
            erase: async (userId: string) => void (await env.COFRE!.apagarCofre(userId)),
            endGraces: async (userId: string) => void (await env.COFRE!.encerrarCarencias(userId)),
          },
        }
      : {}),
  };
}

/**
 * O app de cada `env`, montado uma vez enquanto o Worker está de pé: montar as rotas (e o roteador
 * compilar as expressões delas na primeira busca) gasta quase 1 ms de CPU, que cada pedido pagava de novo
 * no plano grátis de 10 ms. O `env` é o mesmo objeto entre os pedidos da mesma instância.
 */
const apps = new WeakMap<Env, ReturnType<typeof createApp>>();

function appOf(env: Env): ReturnType<typeof createApp> {
  let app = apps.get(env);
  if (!app) apps.set(env, (app = createApp(deps(env))));
  return app;
}

export default {
  fetch(request, env) {
    return appOf(env).fetch(request);
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanup(deps(env)));
  },
} satisfies ExportedHandler<Env>;

/**
 * A porta do cofre de senhas (ver `domain/vault.ts`): só por service binding, sem endereço público.
 * O Worker do cofre chama `env.MURAL.contaPorGoogle(sub)`.
 */
export class CofreRpc extends WorkerEntrypoint<Env> {
  contaPorGoogle(sub: string): Promise<{ id: string; codigo: string } | null> {
    return accountByGoogle(d1Db(this.env.DB), sub);
  }
}
