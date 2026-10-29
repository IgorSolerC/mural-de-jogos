import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HttpError } from './errors';
import { offline, readOnly, usageToday } from './domain/quota';
import { Deps } from './ports';
import { accountRoutes } from './routes/account';
import { agendaRoutes } from './routes/agenda';
import { catalogRoutes } from './routes/catalog';
import { extRoutes } from './ext/routes';
import { commentRoutes } from './routes/comments';
import { followRoutes } from './routes/follow';
import { keyRoutes } from './routes/keys';
import { mirrorRoutes } from './routes/mirror';
import { requestRoutes } from './routes/requests';
import { notesWriteRoutes } from './ext/notes-write';
import { mcpRoutes } from './ext/mcp';
import { docsRoutes } from './ext/docs';
import { oauthRoutes } from './ext/oauth';
import { calendarReadRoutes } from './ext/calendar-read';
import { calendarWriteRoutes } from './ext/calendar-write';
import { kanbanReadRoutes } from './ext/kanban-read';
import { muralsReadRoutes } from './ext/murals-read';
import { muralsWriteRoutes } from './ext/murals-write';
import { kanbanWriteRoutes } from './ext/kanban-write';
import { spendingReadRoutes } from './ext/spending-read';
import { spendingWriteRoutes } from './ext/spending-write';
import { muralRoutes } from './routes/mural';
import { noteRoutes } from './routes/notes';
import { reactionRoutes } from './routes/reactions';
import { imageRoutes } from './routes/images';
import { ALL, room, usageOf } from './domain/image';

/** O molde da rota que respondeu; o erro de um middleware (sem rota ainda) fica com o caminho (ver `logPath`). */
export function routeOf(routePath: string | undefined, path: string): string {
  return routePath && routePath !== '*' && routePath !== '/*' ? routePath : logPath(path);
}

/**
 * Um caminho que veio de fora, para o log: o Hono decodifica o `%0A`, então uma quebra de linha no
 * endereço escreveria uma linha falsa no log; e um endereço enorme encheria a linha. Até 200 letras,
 * sem os caracteres de controle.
 */
export function logPath(path: string): string {
  const clean = path.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '?');
  return clean.length > 200 ? `${clean.slice(0, 200)}…` : clean;
}

/** Os caminhos que qualquer origem chama (a API das AIs, o MCP e o OAuth dos conectores). */
export function isOpenPath(path: string): boolean {
  return path.startsWith('/ext/') || path === '/mcp' || path.startsWith('/oauth/') || path.startsWith('/.well-known/');
}

/** A versão da API que o /v1/status informa (mude junto com mudanças que o site precise saber). */
const API_VERSION = 1;

/**
 * A API inteira, montada a partir das dependências prontas. Só usa `Request`/`Response` padrão da
 * web (via Hono), então roda igual no Worker da Cloudflare e no Node (ver `src/entry/`).
 */
export function createApp(deps: Deps): Hono {
  const app = new Hono();
  const { config } = deps;

  app.use(
    '*',
    cors({
      // a API das AIs (`/ext`, o MCP e o OAuth) aceita qualquer origem: ela só anda com a chave ou o token no
      // cabeçalho, sem cookie
      origin: (origin, c) => (isOpenPath(c.req.path) ? '*' : config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'Mural-Rev-Base', 'Idempotency-Key', 'Mcp-Protocol-Version'],
      exposeHeaders: ['Mural-Rev', 'Mural-Agora', 'Mural-Codigo', 'Mural-Pedidos', 'Mural-Pedidos-Aprovar', 'Imagem-Sua'],
      // O Chrome limita a 2 horas, o Firefox a 1 dia: menos pré-consultas, menos requisições na cota.
      maxAge: 86_400,
    }),
  );

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    // o relógio da nuvem: o site compara com o do aparelho (um relógio errado faz edição velha vencer)
    c.header('Mural-Agora', deps.now().toISOString());
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
  });

  // O interruptor geral: desligada, só o /v1/status responde; só leitura, só GET.
  app.use('*', async (c, next) => {
    const isStatus = c.req.method === 'GET' && c.req.path === '/v1/status';
    if (config.mode === 'desligado' && !isStatus) throw offline();
    if (config.mode === 'so-leitura' && !['GET', 'HEAD'].includes(c.req.method)) throw readOnly();
    await next();
  });

  app.get('/v1/status', async (c) => {
    let usage;
    let images;
    try {
      usage = await usageToday(deps);
      images = await usageOf(deps.db, ALL);
    } catch {
      throw new HttpError(503, 'banco-indisponivel', 'O banco da nuvem não respondeu.');
    }
    return c.json({
      versao: API_VERSION,
      modo: config.mode,
      dia: usage.day,
      gravacoes: usage.writes,
      linhasGravadas: usage.rowsWritten,
      cotaLinhas: config.dailyRowBudget,
      // quanto as imagens guardam e quanto falta para a cota da nuvem (a checagem diária avisa a 70%)
      imagens: room(images, config.imagesTotalBytes),
    });
  });

  accountRoutes(app, deps);
  muralRoutes(app, deps);
  followRoutes(app, deps);
  reactionRoutes(app, deps);
  commentRoutes(app, deps);
  noteRoutes(app, deps);
  imageRoutes(app, deps);
  catalogRoutes(app, deps);
  agendaRoutes(app, deps);
  keyRoutes(app, deps);
  mirrorRoutes(app, deps);
  requestRoutes(app, deps);
  extRoutes(app, deps);
  spendingReadRoutes(app, deps);
  kanbanReadRoutes(app, deps);
  calendarReadRoutes(app, deps);
  calendarWriteRoutes(app, deps);
  muralsReadRoutes(app, deps);
  muralsWriteRoutes(app, deps);
  kanbanWriteRoutes(app, deps);
  spendingWriteRoutes(app, deps);
  notesWriteRoutes(app, deps);
  mcpRoutes(app, deps);
  oauthRoutes(app, deps);
  docsRoutes(app);

  app.notFound((c) => {
    deps.log?.(`${c.req.method} ${logPath(c.req.path)} 404 nao-encontrado`);
    return c.json({ erro: 'nao-encontrado', mensagem: 'Esse endereço não existe na API.' }, 404);
  });

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      // a rota pelo molde (/v1/murais/:codigo), sem o que vem nela nem a consulta
      deps.log?.(`${c.req.method} ${routeOf(c.req.routePath, c.req.path)} ${error.status} ${error.code}`);
      return c.json({ erro: error.code, mensagem: error.message }, error.status);
    }
    // o molde da rota, para achar de onde veio (o erro em si pode ter a pilha, nunca o corpo do pedido)
    console.error(`${c.req.method} ${routeOf(c.req.routePath, c.req.path)} 500 erro-interno`, error);
    return c.json({ erro: 'erro-interno', mensagem: 'Algo deu errado na nuvem.' }, 500);
  });

  return app;
}
