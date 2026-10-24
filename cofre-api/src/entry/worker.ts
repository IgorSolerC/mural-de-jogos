import { WorkerEntrypoint } from 'cloudflare:workers';
import { createRemoteJWKSet } from 'jose';
import { d1Db } from '../adapters/d1';
import { createApp } from '../app';
import { canUseVault, readConfig } from '../config';
import { cleanup } from '../domain/cleanup';
import { GOOGLE_CERTS_URL, googleLogin } from '../domain/google';
import { eraseVaultStatements, hasVault } from '../domain/murall';
import { write } from '../domain/quota';
import { Deps } from '../ports';
import { readSecrets } from '../secrets';
import { newNonce, withSecurity } from '../site';

/*
 * A entrada na Cloudflare: o único arquivo, junto com `adapters/d1.ts`, que conhece o Worker. Ele serve
 * a página do cofre (os arquivos de dist/cofre/browser, pelo binding ASSETS) e a API (`/api/...`), na
 * mesma origem, e põe os cabeçalhos de segurança em toda resposta (`site.ts`). O Worker roda antes dos
 * arquivos (`run_worker_first`): nenhum arquivo sai sem os cabeçalhos.
 */

/** O que a API do Murall oferece ao cofre pelo service binding (a classe `CofreRpc` em `api/src/entry/worker.ts`). */
interface RpcDoMural {
  contaPorGoogle(sub: string): Promise<{ id: string; codigo: string } | null>;
}

/** As variáveis do wrangler.toml (ver `config.ts`), os secrets (ver `secrets.ts`), o banco e o Murall. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MURAL: RpcDoMural;
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

export function deps(env: Env): Deps {
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
    log: (line) => console.warn(line),
  };
}

/** Põe o nonce deste pedido no `ngCspNonce` da raiz: o Angular o usa nos estilos que injeta. */
function withNonce(response: Response, nonce: string): Response {
  if (!(response.headers.get('Content-Type') ?? '').startsWith('text/html')) return response;
  return new HTMLRewriter().on('cofre-root', {
    element(el) {
      el.setAttribute('ngCspNonce', nonce);
    },
  }).transform(response);
}

/**
 * A página e a API, com os cabeçalhos. `fazerDeps` é a de produção; só o teste de ponta a ponta
 * (`test/e2e/worker-e2e.ts`, que nunca é publicado) passa outra, com o Google e o Murall de mentira.
 */
export async function serve(request: Request, env: Env, fazerDeps: (env: Env) => Deps = deps): Promise<Response> {
  const d = fazerDeps(env);
  const nonce = newNonce();
  const secure = d.config.origin.startsWith('https://');
  const url = new URL(request.url);
  let response: Response;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    response = await createApp(d).fetch(request);
  } else if (request.method !== 'GET' && request.method !== 'HEAD') {
    response = new Response('Método não aceito.', { status: 405, headers: { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' } });
  } else {
    response = withNonce(await env.ASSETS.fetch(request), nonce);
  }
  return withSecurity(response, nonce, secure);
}

/**
 * A porta do Murall (16.13): só por service binding, sem endereço público. A API do Murall chama
 * `env.COFRE.podeUsar(codigo)` para mostrar a aba "Cofre" só a quem está em COFRE_CODIGOS, sem saber se
 * a conta tem cofre nem nada de dentro dele. Só para apagar a conta ela pergunta se há cofre
 * (`temCofre`), e leva o cofre junto quando a conta sai (`apagarCofre`).
 */
export class MuralRpc extends WorkerEntrypoint<Env> {
  podeUsar(codigo: string): boolean {
    if (typeof codigo !== 'string' || !codigo || codigo.length > 16) return false;
    return canUseVault(readConfig(this.env as unknown as Record<string, unknown>), codigo);
  }

  /** Antes de apagar a conta do Murall (ameaça 23): a conta tem cofre? Só o sim ou o não (ver `domain/murall.ts`). */
  async temCofre(usuarioId: string): Promise<boolean> {
    return hasVault(d1Db(this.env.DB), accountId(usuarioId));
  }

  /** A conta do Murall saiu de vez: o cofre dela vai junto (o backup diário guarda a cópia cifrada por 30 dias). */
  async apagarCofre(usuarioId: string): Promise<{ apagado: true }> {
    await write(deps(this.env), eraseVaultStatements(accountId(usuarioId)), 40);
    return { apagado: true };
  }
}

/** O id de uma conta do Murall (um UUID): qualquer outra coisa é erro de quem chamou. */
function accountId(id: unknown): string {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('id de conta inválido');
  return id;
}

export default {
  fetch(request, env) {
    return serve(request, env);
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(cleanup(deps(env)));
  },
} satisfies ExportedHandler<Env>;
