import { Context, Hono } from 'hono';
import { textoLimpo } from '../../../contrato/api-v1/escopos';
import { ESCOPOS_DO_OAUTH, MAX_RETORNOS, NOME_DO_CLIENTE_MAX, REGISTROS_POR_IP, retornoAceito } from '../../../contrato/api-v1/oauth';
import { brakeStatement, usedToday } from '../domain/brake';
import { base64url } from '../domain/bytes';
import { write } from '../domain/quota';
import { hashToken } from '../domain/session';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from '../routes/http';

/**
 * O OAuth 2.1 dos conectores (PLANO-API.md, seção 11): os metadados (RFC 9728 e 8414) e o registro de
 * cliente (RFC 7591). Os erros saem no formato do OAuth (`error`, `error_description`), não no da API,
 * porque quem lê é o cliente do conector.
 */

/** Um erro no formato do OAuth. */
export class OAuthError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 429 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** O endereço do metadado do recurso, que o 401 do `/mcp` aponta (é o que faz o cliente abrir o login). */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

export const CLIENT_ID_RE = /^oc_[A-Za-z0-9_-]{16}$/;

/** O IP de quem chama, em hash (o freio do registro guarda isto, nunca o IP). */
async function ipKey(c: Context): Promise<string> {
  const ip = c.req.header('CF-Connecting-IP') ?? 'desconhecido';
  return `ip:${(await hashToken(ip)).slice(0, 32)}`;
}

export function oauthRoutes(app: Hono, deps: Deps): void {
  const origin = (c: Context) => new URL(c.req.url).origin;
  const cached = { 'Cache-Control': 'public, max-age=300' };

  /** Roda a rota e transforma os erros no formato do OAuth. */
  const oauth = (handler: (c: Context) => Promise<Response>) => async (c: Context) => {
    try {
      return await handler(c);
    } catch (error) {
      if (error instanceof OAuthError) {
        deps.log?.(`${c.req.method} ${c.req.path} ${error.status} ${error.code}`);
        return c.json({ error: error.code, error_description: error.message }, error.status);
      }
      if (error instanceof HttpError) {
        deps.log?.(`${c.req.method} ${c.req.path} ${error.status} ${error.code}`);
        const code = error.status === 503 ? 'temporarily_unavailable' : 'server_error';
        return c.json({ error: code, error_description: error.message }, error.status);
      }
      throw error;
    }
  };

  // O recurso protegido (RFC 9728): o `/mcp`, e a raiz para quem procura sem o caminho.
  const resource = (c: Context, path: string) =>
    c.json(
      {
        resource: `${origin(c)}${path}`,
        authorization_servers: [origin(c)],
        scopes_supported: ESCOPOS_DO_OAUTH,
        bearer_methods_supported: ['header'],
        resource_name: 'Murall',
        resource_documentation: `${origin(c)}/llms.txt`,
      },
      200,
      cached,
    );
  app.get('/.well-known/oauth-protected-resource', (c) => resource(c, ''));
  app.get('/.well-known/oauth-protected-resource/mcp', (c) => resource(c, '/mcp'));

  // O servidor de autorização (RFC 8414).
  app.get('/.well-known/oauth-authorization-server', (c) =>
    c.json(
      {
        issuer: origin(c),
        authorization_endpoint: `${origin(c)}/oauth/autorizar`,
        token_endpoint: `${origin(c)}/oauth/token`,
        registration_endpoint: `${origin(c)}/oauth/registrar`,
        revocation_endpoint: `${origin(c)}/oauth/revogar`,
        scopes_supported: ESCOPOS_DO_OAUTH,
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        revocation_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true,
        service_documentation: `${origin(c)}/llms.txt`,
      },
      200,
      cached,
    ),
  );

  // O registro de cliente (RFC 7591). Só clientes públicos: sem segredo, o PKCE é a prova.
  app.post(
    '/oauth/registrar',
    oauth(async (c) => {
      const body = await readJson(c).catch(() => {
        throw new OAuthError(400, 'invalid_client_metadata', 'O registro é um JSON (RFC 7591).');
      });
      const uris = body['redirect_uris'];
      if (!Array.isArray(uris) || !uris.length || uris.length > MAX_RETORNOS) {
        throw new OAuthError(400, 'invalid_redirect_uri', `Mande de 1 a ${MAX_RETORNOS} endereços de volta em redirect_uris.`);
      }
      const wrong = uris.find((u) => !retornoAceito(u));
      if (wrong !== undefined) {
        throw new OAuthError(400, 'invalid_redirect_uri', 'Os endereços de volta são https://, ou http://localhost e http://127.0.0.1, sem # no fim.');
      }
      const grants = body['grant_types'] ?? ['authorization_code'];
      if (!Array.isArray(grants) || grants.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
        throw new OAuthError(400, 'invalid_client_metadata', 'Os grant_types aceitos são authorization_code e refresh_token.');
      }
      const responses = body['response_types'] ?? ['code'];
      if (!Array.isArray(responses) || responses.some((r) => r !== 'code')) {
        throw new OAuthError(400, 'invalid_client_metadata', 'O único response_type aceito é code.');
      }
      const name = textoLimpo(body['client_name'], NOME_DO_CLIENTE_MAX) || 'Um aplicativo';
      const now = deps.now();
      const ip = await ipKey(c);
      if ((await usedToday(deps, ip, 'oauth-registro', now)) >= REGISTROS_POR_IP) {
        throw new OAuthError(429, 'too_many_requests', 'Registros demais deste endereço hoje. Tente de novo amanhã.');
      }
      const id = `oc_${base64url(crypto.getRandomValues(new Uint8Array(12)))}`;
      const redirects = [...new Set(uris as string[])];
      await write(
        deps,
        [
          {
            sql: "INSERT INTO oauth_clientes (id, nome, retornos, tipo, criado_em) VALUES (?, ?, ?, 'dcr', ?)",
            params: [id, name, JSON.stringify(redirects), now.toISOString()],
          },
          brakeStatement(ip, 'oauth-registro', now),
        ],
        5,
      );
      return c.json(
        {
          client_id: id,
          client_id_issued_at: Math.floor(now.getTime() / 1000),
          client_name: name,
          redirect_uris: redirects,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          // pediu com segredo, recebe sem: o servidor só tem clientes públicos (RFC 7591, 3.2.1)
          token_endpoint_auth_method: 'none',
        },
        201,
      );
    }),
  );
}
