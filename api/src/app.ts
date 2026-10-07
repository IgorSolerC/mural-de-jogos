import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HttpError } from './errors';
import { offline, usageToday } from './domain/quota';
import { Deps } from './ports';
import { accountRoutes } from './routes/account';
import { followRoutes } from './routes/follow';
import { muralRoutes } from './routes/mural';
import { reactionRoutes } from './routes/reactions';

/** A versão da API que o /v1/status informa (mude junto com mudanças que o site precise saber). */
export const API_VERSION = 1;

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
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'Mural-Rev-Base'],
      exposeHeaders: ['Mural-Rev', 'Mural-Agora', 'Mural-Codigo'],
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
    if (config.mode === 'so-leitura' && !['GET', 'HEAD'].includes(c.req.method)) {
      throw new HttpError(503, 'nuvem-so-leitura', 'A nuvem está só para leitura agora. O seu mural continua salvo neste aparelho.');
    }
    await next();
  });

  app.get('/v1/status', async (c) => {
    let usage;
    try {
      usage = await usageToday(deps);
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
    });
  });

  accountRoutes(app, deps);
  muralRoutes(app, deps);
  followRoutes(app, deps);
  reactionRoutes(app, deps);

  app.notFound((c) => c.json({ erro: 'nao-encontrado', mensagem: 'Esse endereço não existe na API.' }, 404));

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ erro: error.code, mensagem: error.message }, error.status);
    console.error(error);
    return c.json({ erro: 'erro-interno', mensagem: 'Algo deu errado na nuvem.' }, 500);
  });

  return app;
}
