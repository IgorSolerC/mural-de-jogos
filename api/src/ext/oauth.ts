import { Context, Hono } from 'hono';
import { MAX_CHAVES, textoLimpo } from '../../../contrato/api-v1/escopos';
import {
  ESCOPOS_DO_OAUTH,
  MAX_RETORNOS,
  NOME_DO_CLIENTE_MAX,
  DIAS_DA_RENOVACAO,
  DOCUMENTO_MAX,
  DOCUMENTO_VALE_MS,
  DOCUMENTOS_POR_IP,
  PEDIDOS_POR_IP,
  PRAZO_DO_ACESSO_S,
  PRAZO_DO_CODIGO_MS,
  PRAZO_DO_PEDIDO_MS,
  REGISTROS_POR_IP,
  dominioDoRetorno,
  ehDocumentoDeCliente,
  escoposDoPedido,
  retornoAceito,
  retornoConhecido,
  retornoLocal,
} from '../../../contrato/api-v1/oauth';
import {
  KeyRow,
  MAX_KEYS_PER_DAY,
  accessNotice,
  apiAllowed,
  apiUnavailable,
  connectorDomain,
  expiresIn,
  keyOf,
  keyOut,
  newKeyId,
  newSecret,
  readKeyInput,
} from '../domain/api-key';
import { brakeStatement, usedToday } from '../domain/brake';
import { base64url, readCappedBytes, sha256 } from '../domain/bytes';
import { DAY_MS, write } from '../domain/quota';
import { hashToken } from '../domain/session';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { readJson, readText, sessionOf } from '../routes/http';
import { refuseOpen } from '../routes/keys';

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
const REQUEST_ID_RE = /^op_[A-Za-z0-9_-]{16}$/;
/** O code_challenge do S256: o SHA-256 do verificador em base64url, sempre 43 letras. */
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const STATE_MAX = 512;
/** O code_verifier do PKCE (RFC 7636, 4.1). */
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
/** O corpo do token e da revogação. */
const FORM_MAX = 8_192;
/** Dois pedidos de renovação com a mesma renovação dentro disto são corrida do cliente, não roubo. */
const RENOVACAO_EM_CORRIDA_MS = 30_000;
/** As respostas com token nunca ficam em cache (RFC 6749, 5.1). */
const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

interface ClientRow {
  id: string;
  nome: string;
  retornos: string;
  tipo: string;
}

interface RequestRow {
  id: string;
  cliente_id: string;
  retorno: string;
  desafio: string;
  estado_cliente: string | null;
  recurso: string | null;
  escopos_pedidos: string;
  expira_em: string;
  nome: string;
  retornos: string;
}

function parseList(text: string): string[] {
  try {
    const list: unknown = JSON.parse(text);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** O endereço de volta com os parâmetros da resposta (os que vierem vazios ficam de fora). */
export function backTo(retorno: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(retorno);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  return url.toString();
}

/** O `resource` (RFC 8707) é este servidor: a raiz da API ou o `/mcp`. */
function isThisResource(resource: string, origin: string): boolean {
  const plain = resource.replace(/\/+$/, '');
  return plain === origin || plain === `${origin}/mcp`;
}

/** A página de erro de quando não dá para voltar ao cliente (ele não é conhecido, ou o retorno não confere). */
function errorPage(c: Context, status: 400 | 429 | 503, message: string): Response {
  const safe = message.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  return c.html(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Murall</title>` +
      `<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#2b2622;background:#f6f1e7">` +
      `<h1 style="font-size:1.25rem">Não deu para conectar ao Murall</h1><p>${safe}</p></body></html>`,
    status,
    { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Frame-Options': 'DENY' },
  );
}

/** O IP de quem chama, em hash (o freio do registro guarda isto, nunca o IP). */
async function ipKey(c: Context): Promise<string> {
  const ip = c.req.header('CF-Connecting-IP') ?? 'desconhecido';
  return `ip:${(await hashToken(ip)).slice(0, 32)}`;
}

export function oauthRoutes(app: Hono, deps: Deps): void {
  const origin = (c: Context) => new URL(c.req.url).origin;
  /**
   * O cliente do pedido: o registrado (`oc_…`) ou o do documento (CIMD), buscado no endereço do próprio
   * `client_id` e guardado por um dia. Um documento que não serve é erro (`OAuthError`), com o porquê.
   * Cada busca (a que dá certo e a que não) conta no freio do IP, antes de sair daqui.
   */
  async function findClient(id: string, c: Context): Promise<ClientRow | null> {
    if (CLIENT_ID_RE.test(id)) return deps.db.first<ClientRow>('SELECT id, nome, retornos, tipo FROM oauth_clientes WHERE id = ?', [id]);
    if (!ehDocumentoDeCliente(id)) return null;
    const known = await deps.db.first<ClientRow & { criado_em: string }>(
      "SELECT id, nome, retornos, tipo, criado_em FROM oauth_clientes WHERE id = ? AND tipo = 'cimd'",
      [id],
    );
    const now = deps.now();
    if (known && now.getTime() - Date.parse(known.criado_em) < DOCUMENTO_VALE_MS) return known;
    const ip = await ipKey(c);
    if ((await usedToday(deps, ip, 'oauth-documento', now)) >= DOCUMENTOS_POR_IP) {
      throw new OAuthError(429, 'too_many_requests', 'Documentos de aplicativo demais buscados deste endereço hoje. Tente de novo amanhã.');
    }
    let doc: Record<string, unknown>;
    try {
      doc = await fetchClientDocument(id);
    } catch (error) {
      // a busca que falhou também conta (senão o mesmo endereço quebrado seria buscado sem fim)
      await write(deps, [brakeStatement(ip, 'oauth-documento', now)], 2).catch(() => undefined);
      throw error;
    }
    const name = textoLimpo(doc['client_name'], NOME_DO_CLIENTE_MAX) || dominioDoRetorno(id);
    const redirects = JSON.stringify([...new Set(doc['redirect_uris'] as string[])]);
    await write(
      deps,
      [
        {
          sql:
            "INSERT INTO oauth_clientes (id, nome, retornos, tipo, criado_em) VALUES (?, ?, ?, 'cimd', ?) " +
            'ON CONFLICT (id) DO UPDATE SET nome = excluded.nome, retornos = excluded.retornos, criado_em = excluded.criado_em',
          params: [id, name, redirects, now.toISOString()],
        },
        brakeStatement(ip, 'oauth-documento', now),
      ],
      4,
    );
    return { id, nome: name, retornos: redirects, tipo: 'cimd' };
  }

  /** Busca e confere o documento do cliente (sem seguir redirecionamento, com prazo e tamanho máximo). */
  async function fetchClientDocument(url: string): Promise<Record<string, unknown>> {
    const bad = (why: string) => new OAuthError(400, 'invalid_client', `O documento do aplicativo (${url}) não serve: ${why}`);
    let res: Response;
    try {
      res = await (deps.oauthFetch ?? fetch)(url, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5_000) });
    } catch {
      throw bad('não respondeu.');
    }
    if (res.status !== 200) throw bad(`respondeu ${res.status}.`);
    if (Number(res.headers.get('Content-Length') ?? 0) > DOCUMENTO_MAX) throw bad('é grande demais.');
    // lido aos pedaços: sem Content-Length, um corpo sem fim não enche a memória antes de ser recusado
    const text = await readCapped(res, DOCUMENTO_MAX).catch(() => {
      throw bad('não respondeu.');
    });
    if (text === null) throw bad('é grande demais.');
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch {
      throw bad('não é JSON.');
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw bad('não é um objeto JSON.');
    const d = doc as Record<string, unknown>;
    if (d['client_id'] !== url) throw bad('o client_id dele não é o próprio endereço.');
    const uris = d['redirect_uris'];
    if (!Array.isArray(uris) || !uris.length || uris.length > MAX_RETORNOS || !uris.every(retornoAceito)) {
      throw bad(`faltam redirect_uris (de 1 a ${MAX_RETORNOS}, https:// ou http://localhost).`);
    }
    const auth = d['token_endpoint_auth_method'];
    if (auth !== undefined && auth !== 'none') throw bad('só clientes públicos (token_endpoint_auth_method: none).');
    return d;
  }
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
        // o client_id pode ser o endereço do documento do cliente (CIMD)
        client_id_metadata_document_supported: true,
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

  // Autorizar (PLANO-API.md, 11.1): confere o pedido, guarda por 10 minutos e manda a pessoa para a
  // página Autorizar do site. Até o retorno conferir, o erro é uma página daqui (voltar a um endereço
  // não conferido seria um redirecionamento aberto); depois, o erro volta ao cliente.
  app.get('/oauth/autorizar', async (c) => {
    const q = (k: string) => c.req.query(k);
    if (!deps.config.site) return errorPage(c, 503, 'A autorização de conectores ainda não está ligada nesta API.');
    let client: ClientRow | null;
    try {
      client = await findClient(q('client_id') ?? '', c);
    } catch (error) {
      if (error instanceof OAuthError) return errorPage(c, error.status === 429 ? 429 : 400, error.message);
      if (error instanceof HttpError) return errorPage(c, 503, error.message);
      throw error;
    }
    if (!client) return errorPage(c, 400, 'Esse aplicativo não está registrado no Murall (client_id desconhecido). Volte a ele e conecte de novo.');
    const retornos = parseList(client.retornos);
    const asked = q('redirect_uri');
    const retorno = asked === undefined ? (retornos.length === 1 ? retornos[0]! : '') : retornos.includes(asked) ? asked : '';
    if (!retorno) return errorPage(c, 400, 'O endereço de volta (redirect_uri) não é um dos que esse aplicativo registrou.');
    const state = q('state');
    const back = (error: string, description: string) =>
      c.redirect(backTo(retorno, { error, error_description: description, state: state?.slice(0, STATE_MAX), iss: origin(c) }), 302);
    if (q('response_type') !== 'code') return back('unsupported_response_type', 'Só response_type=code.');
    if (q('code_challenge_method') !== 'S256' || !CHALLENGE_RE.test(q('code_challenge') ?? '')) {
      return back('invalid_request', 'O PKCE é obrigatório: code_challenge com code_challenge_method=S256.');
    }
    if (state !== undefined && state.length > STATE_MAX) return back('invalid_request', `O state passa de ${STATE_MAX} letras.`);
    const resource = q('resource');
    if (resource !== undefined && !isThisResource(resource, origin(c))) return back('invalid_target', `O resource é ${origin(c)}/mcp.`);
    const now = deps.now();
    const ip = await ipKey(c);
    try {
      if ((await usedToday(deps, ip, 'oauth-pedido', now)) >= PEDIDOS_POR_IP) {
        return back('temporarily_unavailable', 'Pedidos demais deste endereço hoje. Tente de novo amanhã.');
      }
      const id = `op_${base64url(crypto.getRandomValues(new Uint8Array(12)))}`;
      await write(
        deps,
        [
          {
            sql:
              'INSERT INTO oauth_pedidos (id, cliente_id, retorno, desafio, estado_cliente, recurso, escopos_pedidos, expira_em) ' +
              'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            params: [
              id,
              client.id,
              retorno,
              q('code_challenge')!,
              state ?? null,
              resource ?? null,
              JSON.stringify(escoposDoPedido(q('scope'))),
              new Date(now.getTime() + PRAZO_DO_PEDIDO_MS).toISOString(),
            ],
          },
          brakeStatement(ip, 'oauth-pedido', now),
        ],
        4,
      );
      return c.redirect(`${deps.config.site}/#/autorizar?pedido=${id}`, 302);
    } catch (error) {
      if (error instanceof HttpError) return back('temporarily_unavailable', error.message);
      throw error;
    }
  });

  // O que a página Autorizar lê e responde, só com a sessão do site.
  const requestGone = () => new HttpError(404, 'pedido-nao-encontrado', 'Este pedido venceu ou já foi respondido. Volte ao aplicativo e conecte de novo.');
  async function openRequest(id: string): Promise<RequestRow> {
    if (!REQUEST_ID_RE.test(id)) throw requestGone();
    const row = await deps.db.first<RequestRow>(
      'SELECT p.id, p.cliente_id, p.retorno, p.desafio, p.estado_cliente, p.recurso, p.escopos_pedidos, p.expira_em, c.nome, c.retornos ' +
        'FROM oauth_pedidos p JOIN oauth_clientes c ON c.id = p.cliente_id WHERE p.id = ? AND p.expira_em > ?',
      [id, deps.now().toISOString()],
    );
    if (!row) throw requestGone();
    return row;
  }
  const userCode = async (userId: string) =>
    (await deps.db.first<{ codigo: string }>('SELECT codigo FROM usuarios WHERE id = ?', [userId]))?.codigo ?? '';
  /** O pedido ainda está aberto (vai em cada gravação: dois "Permitir" ao mesmo tempo criam uma chave só). */
  const stillOpen = (id: string, at: string) => ({ sql: 'EXISTS (SELECT 1 FROM oauth_pedidos WHERE id = ? AND expira_em > ?)', params: [id, at] });

  app.get('/v1/eu/oauth/pedidos/:id', async (c) => {
    const s = await sessionOf(deps, c);
    const p = await openRequest(c.req.param('id'));
    return c.json({
      disponivel: apiAllowed(deps, await userCode(s.userId)),
      pedido: {
        id: p.id,
        cliente: p.nome,
        retorno: p.retorno,
        dominio: dominioDoRetorno(p.retorno),
        conhecido: retornoConhecido(p.retorno),
        local: retornoLocal(p.retorno),
        escopos: parseList(p.escopos_pedidos),
        expiraEm: p.expira_em,
      },
    });
  });

  app.post('/v1/eu/oauth/pedidos/:id/permitir', async (c) => {
    const s = await sessionOf(deps, c);
    const p = await openRequest(c.req.param('id'));
    if (!apiAllowed(deps, await userCode(s.userId))) throw apiUnavailable();
    // o nome da chave é o do cliente, se a pessoa não der outro
    const input = readKeyInput({ nome: p.nome, ...(await readJson(c)) }, true);
    const now = deps.now();
    const at = now.toISOString();
    const live = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM api_chaves WHERE usuario_id = ? AND expira_em > ?', [s.userId, at]);
    if ((live?.n ?? 0) >= MAX_CHAVES) {
      throw new HttpError(409, 'chaves-demais', `Já são ${MAX_CHAVES} chaves e conectores nesta conta. Apague um que não usa mais em Ajustes › Acessos.`);
    }
    if ((await usedToday(deps, s.userId, 'chave', now)) >= MAX_KEYS_PER_DAY) {
      throw new HttpError(429, 'chaves-devagar', 'Muitas chaves e conectores criados hoje. Tente de novo amanhã.');
    }
    const row: KeyRow = {
      id: newKeyId(),
      usuario_id: s.userId,
      nome: input.name!,
      origem: 'oauth',
      escopos: JSON.stringify(input.scopes),
      grupos: input.groups ? JSON.stringify(input.groups) : null,
      aprovacao: input.approval!,
      criada_em: at,
      expira_em: expiresIn(now, input.days!),
      usada_em: null,
    };
    const code = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const open = stillOpen(p.id, at);
    const statements: Statement[] = [
      {
        sql:
          'INSERT INTO api_chaves (id, usuario_id, nome, origem, escopos, grupos, aprovacao, criada_em, expira_em, cliente_id) ' +
          `SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${open.sql}`,
        params: [row.id, row.usuario_id, row.nome, row.origem, row.escopos, row.grupos, row.aprovacao, row.criada_em, row.expira_em, p.cliente_id, ...open.params],
      },
      {
        sql: `INSERT INTO oauth_codigos (hash, chave_id, cliente_id, retorno, desafio, recurso, expira_em) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${open.sql}`,
        params: [
          await hashToken(code),
          row.id,
          p.cliente_id,
          p.retorno,
          p.desafio,
          p.recurso,
          new Date(now.getTime() + PRAZO_DO_CODIGO_MS).toISOString(),
          ...open.params,
        ],
      },
      { sql: `UPDATE oauth_clientes SET usado_em = ? WHERE id = ? AND ${open.sql}`, params: [at, p.cliente_id, ...open.params] },
      // o freio também só conta o Permitir que criou (o segundo clique, ou outra aba, não gasta a vaga do dia)
      { sql: `INSERT INTO freios (usuario_id, acao, criado_em) SELECT ?, 'chave', ? WHERE ${open.sql}`, params: [s.userId, at, ...open.params] },
      accessNotice(s.userId, row.id, row.nome, dominioDoRetorno(p.retorno), at, open),
      { sql: 'DELETE FROM oauth_pedidos WHERE id = ?', params: [p.id] },
    ];
    const [created] = await write(deps, statements, 15);
    if (!created?.changes) throw requestGone();
    // o domínio como a lista de Acessos mostra (o do documento, ou o do primeiro retorno, com a porta)
    const dominio = connectorDomain(p.cliente_id, p.retornos);
    return c.json({ para: backTo(p.retorno, { code, state: p.estado_cliente, iss: origin(c) }), chave: keyOut(keyOf(row), { dominio }) }, 201);
  });

  app.post('/v1/eu/oauth/pedidos/:id/recusar', async (c) => {
    await sessionOf(deps, c);
    const p = await openRequest(c.req.param('id'));
    await write(deps, [{ sql: 'DELETE FROM oauth_pedidos WHERE id = ?', params: [p.id] }], 1);
    return c.json({
      para: backTo(p.retorno, { error: 'access_denied', error_description: 'A pessoa não permitiu o acesso ao Murall.', state: p.estado_cliente, iss: origin(c) }),
    });
  });

  // Os tokens (RFC 6749 + OAuth 2.1): o código vira o par acesso + renovação; a renovação vira outro par,
  // e a velha não serve mais (se voltar, a chave inteira é cortada: alguém copiou).
  app.post(
    '/oauth/token',
    oauth(async (c) => {
      const form = await readForm(c);
      const now = deps.now();
      const grant = form.get('grant_type');
      if (grant === 'authorization_code') return c.json(await exchangeCode(form, origin(c), now), 200, NO_STORE);
      if (grant === 'refresh_token') return c.json(await refresh(form, now), 200, NO_STORE);
      throw new OAuthError(400, 'unsupported_grant_type', 'Os grant_type aceitos são authorization_code e refresh_token.');
    }),
  );

  /** O par novo: o acesso (no formato das chaves, 1 hora) e a renovação (opaca). */
  async function newPair(now: Date) {
    const access = newSecret();
    const renewal = `mr_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`;
    return {
      access,
      renewal,
      accessHash: await hashToken(access),
      renewalHash: await hashToken(renewal),
      accessUntil: new Date(now.getTime() + PRAZO_DO_ACESSO_S * 1000).toISOString(),
    };
  }

  const tokenReply = (pair: { access: string; renewal: string }, scopes: string) => ({
    access_token: pair.access,
    token_type: 'Bearer',
    expires_in: PRAZO_DO_ACESSO_S,
    refresh_token: pair.renewal,
    scope: (JSON.parse(scopes) as string[]).join(' '),
  });

  const badGrant = (message: string) => new OAuthError(400, 'invalid_grant', message);

  async function exchangeCode(form: URLSearchParams, here: string, now: Date) {
    const code = form.get('code') ?? '';
    const verifier = form.get('code_verifier') ?? '';
    if (!code || !VERIFIER_RE.test(verifier)) throw new OAuthError(400, 'invalid_request', 'Mande o code e o code_verifier (PKCE).');
    const at = now.toISOString();
    const hash = await hashToken(code);
    const row = await deps.db.first<{ chave_id: string; cliente_id: string; retorno: string; desafio: string; recurso: string | null; escopos: string }>(
      'SELECT o.chave_id, o.cliente_id, o.retorno, o.desafio, o.recurso, k.escopos FROM oauth_codigos o ' +
        'JOIN api_chaves k ON k.id = o.chave_id WHERE o.hash = ? AND o.expira_em > ? AND k.expira_em > ?',
      [hash, at, at],
    );
    if (!row) throw badGrant('O código venceu, já foi usado ou a autorização foi apagada. Conecte de novo.');
    const clientId = clientOf(form);
    if (clientId !== row.cliente_id) throw badGrant('O código é de outro client_id.');
    const redirect = form.get('redirect_uri');
    if (redirect !== null && redirect !== row.retorno) throw badGrant('O redirect_uri não é o mesmo da autorização.');
    const resource = form.get('resource');
    if (resource !== null && !isThisResource(resource, here)) throw new OAuthError(400, 'invalid_target', `O resource é ${here}/mcp.`);
    if (base64url(await sha256(verifier)) !== row.desafio) throw badGrant('O code_verifier não confere com o code_challenge (PKCE).');
    const pair = await newPair(now);
    const [updated] = await write(
      deps,
      [
        // o código ainda existe: dois pedidos com o mesmo código dão um par só
        {
          sql:
            'UPDATE api_chaves SET hash = ?, hash_expira_em = ?, renovacao_hash = ?, renovacao_velha_hash = NULL, renovada_em = ? ' +
            'WHERE id = ? AND EXISTS (SELECT 1 FROM oauth_codigos WHERE hash = ?)',
          params: [pair.accessHash, pair.accessUntil, pair.renewalHash, at, row.chave_id, hash],
        },
        { sql: 'DELETE FROM oauth_codigos WHERE hash = ?', params: [hash] },
      ],
      4,
    );
    if (!updated?.changes) throw badGrant('O código já foi usado.');
    return tokenReply(pair, row.escopos);
  }

  async function refresh(form: URLSearchParams, now: Date) {
    const token = form.get('refresh_token') ?? '';
    if (!token) throw new OAuthError(400, 'invalid_request', 'Mande o refresh_token.');
    const hash = await hashToken(token);
    const at = now.toISOString();
    const row = await deps.db.first<{ id: string; usuario_id: string; cliente_id: string | null; escopos: string; expira_em: string; renovada_em: string | null }>(
      "SELECT id, usuario_id, cliente_id, escopos, expira_em, renovada_em FROM api_chaves WHERE renovacao_hash = ? AND origem = 'oauth'",
      [hash],
    );
    if (!row) {
      const reused = await deps.db.first<{ id: string; usuario_id: string; renovada_em: string | null }>(
        "SELECT id, usuario_id, renovada_em FROM api_chaves WHERE renovacao_velha_hash = ? AND origem = 'oauth'",
        [hash],
      );
      if (!reused) throw badGrant('Essa renovação não vale (vencida, apagada ou copiada errada). Conecte de novo.');
      // dois pedidos de renovação ao mesmo tempo (o mesmo cliente): o segundo só perde, sem cortar
      if (reused.renovada_em && now.getTime() - Date.parse(reused.renovada_em) < RENOVACAO_EM_CORRIDA_MS) {
        throw badGrant('Essa renovação acabou de ser trocada; use a nova.');
      }
      // a renovação velha voltou: alguém tem uma cópia. A chave inteira sai (RFC 9700, 4.14.2)
      await write(deps, [{ sql: 'DELETE FROM api_chaves WHERE id = ?', params: [reused.id] }, refuseOpen(reused.usuario_id, now, reused.id)], 6, {
        ignoreBudget: true,
      });
      deps.log?.('POST /oauth/token renovacao-repetida chave-cortada');
      throw badGrant('Essa renovação já tinha sido usada: por segurança, o conector foi cortado. Conecte de novo.');
    }
    const clientId = clientOf(form, row.cliente_id);
    if (clientId !== row.cliente_id) throw badGrant('A renovação é de outro client_id.');
    const lastUse = Date.parse(row.renovada_em ?? '') || 0;
    if (Date.parse(row.expira_em) <= now.getTime() || now.getTime() - lastUse > DIAS_DA_RENOVACAO * DAY_MS) {
      throw badGrant('O conector venceu. Conecte de novo.');
    }
    const pair = await newPair(now);
    const [updated] = await write(
      deps,
      [
        {
          sql:
            'UPDATE api_chaves SET hash = ?, hash_expira_em = ?, renovacao_hash = ?, renovacao_velha_hash = ?, renovada_em = ? ' +
            'WHERE id = ? AND renovacao_hash = ?',
          params: [pair.accessHash, pair.accessUntil, pair.renewalHash, hash, at, row.id, hash],
        },
      ],
      4,
    );
    if (!updated?.changes) throw badGrant('Essa renovação acabou de ser trocada; use a nova.');
    return tokenReply(pair, row.escopos);
  }

  // Revogar (RFC 7009): o token de acesso ou a renovação de um conector. A chave inteira sai (é o
  // "desconectar" do cliente). Sempre 200, ache ou não (a resposta não diz se o token existia).
  app.post(
    '/oauth/revogar',
    oauth(async (c) => {
      const form = await readForm(c);
      const token = form.get('token') ?? '';
      if (!token) throw new OAuthError(400, 'invalid_request', 'Mande o token.');
      const hash = await hashToken(token);
      const row = await deps.db.first<{ id: string; usuario_id: string }>(
        "SELECT id, usuario_id FROM api_chaves WHERE origem = 'oauth' AND (hash = ? OR renovacao_hash = ? OR renovacao_velha_hash = ?)",
        [hash, hash, hash],
      );
      if (row) {
        await write(deps, [{ sql: 'DELETE FROM api_chaves WHERE id = ?', params: [row.id] }, refuseOpen(row.usuario_id, deps.now(), row.id)], 6, {
          ignoreBudget: true,
        });
      }
      return c.json({}, 200, NO_STORE);
    }),
  );
}

/**
 * O corpo da resposta, até `max` bytes: lido aos pedaços, e cortado assim que passa (null). Um corpo
 * maior nunca fica inteiro na memória.
 */
export async function readCapped(res: Response, max: number): Promise<string | null> {
  const bytes = await readCappedBytes(res.body, max);
  return bytes && new TextDecoder().decode(bytes);
}

/** O corpo do token e da revogação: formulário (o normal do OAuth) ou JSON (alguns clientes mandam). */
async function readForm(c: Context): Promise<URLSearchParams> {
  const text = await readText(c, FORM_MAX, () => new OAuthError(400, 'invalid_request', 'O pedido é grande demais.'));
  const form = (c.req.header('Content-Type') ?? '').includes('application/json') ? fromJson(text) : new URLSearchParams(text);
  // o client_id também pode vir no Basic (cliente público: a senha vem vazia ou é ignorada)
  const basic = /^Basic (\S+)$/i.exec(c.req.header('Authorization') ?? '');
  if (basic && !form.has('client_id')) {
    try {
      const id = decodeURIComponent(atob(basic[1]!).split(':')[0] ?? '');
      if (id) form.set('client_id', id);
    } catch {
      throw new OAuthError(401, 'invalid_client', 'O cabeçalho Basic não serve.');
    }
  }
  return form;
}

function fromJson(text: string): URLSearchParams {
  try {
    const data: unknown = JSON.parse(text || '{}');
    const out = new URLSearchParams();
    if (data && typeof data === 'object') for (const [k, v] of Object.entries(data)) if (typeof v === 'string') out.set(k, v);
    return out;
  } catch {
    throw new OAuthError(400, 'invalid_request', 'O corpo não é um JSON válido.');
  }
}

/** O client_id do pedido (na renovação pode faltar: vale o da chave). */
function clientOf(form: URLSearchParams, fallback?: string | null): string {
  const id = form.get('client_id');
  if (id === null && fallback) return fallback;
  if (!id) throw new OAuthError(401, 'invalid_client', 'Faltou o client_id.');
  return id;
}
