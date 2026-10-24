import { Hono } from 'hono';
import { HttpError } from './errors';
import { offline, readOnly, usageToday } from './domain/quota';
import { Deps } from './ports';
import { createRoutes } from './routes/create';
import { entryRoutes } from './routes/entry';
import { itemRoutes } from './routes/items';
import { manageRoutes } from './routes/manage';
import { openRoutes } from './routes/open';

/** A versão da API que o /api/status informa. */
const API_VERSION = 1;

/** As rotas que só mexem na sessão, e por isso valem também no "só leitura". */
const SESSION_PATHS = new Set(['/api/entrar', '/api/cofre/desafio', '/api/cofre/chave', '/api/cofre/abrir', '/api/cofre/recuperar', '/api/cofre/trancar', '/api/cofre/trancar-todos']);

/**
 * A API do cofre inteira, montada a partir das dependências prontas. Mora na mesma origem da página
 * do cofre (`/api/...`, 7.2): não tem CORS, e um pedido que diga vir de outra origem é recusado.
 */
export function createApp(deps: Deps): Hono {
  const app = new Hono();
  const { config } = deps;

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    // nada do cofre fica em cache, nem no de voltar/avançar (9.3)
    c.header('Cache-Control', 'no-store');
  });

  // Só a página do cofre chama esta API. O navegador manda `Origin` em todo pedido que muda algo; um de
  // outra origem (uma página qualquer tentando usar a sessão de alguém) não passa daqui.
  app.use('*', async (c, next) => {
    const origin = c.req.header('Origin');
    if (origin !== undefined && origin !== config.origin) throw new HttpError(403, 'origem-recusada', 'Este pedido não veio do cofre.');
    await next();
  });

  // O interruptor geral: desligado, só o /api/status responde; só leitura, só GET e as rotas da sessão
  // (entrar, abrir, trancar), para dar para abrir e ver o cofre sem mudar o que tem dentro.
  app.use('*', async (c, next) => {
    const isStatus = c.req.method === 'GET' && c.req.path === '/api/status';
    if (config.mode === 'desligado' && !isStatus) throw offline();
    if (config.mode === 'so-leitura' && !['GET', 'HEAD'].includes(c.req.method) && !SESSION_PATHS.has(c.req.path)) throw readOnly();
    await next();
  });

  // Sem login: a checagem de saúde (16.7) e a página perguntam se o cofre está de pé.
  app.get('/api/status', async (c) => {
    let usage;
    try {
      usage = await usageToday(deps);
    } catch {
      throw new HttpError(503, 'banco-indisponivel', 'O banco do cofre não respondeu.');
    }
    return c.json({
      versao: API_VERSION,
      modo: config.mode,
      dia: usage.day,
      gravacoes: usage.writes,
      linhasGravadas: usage.rowsWritten,
      cotaLinhas: config.dailyRowBudget,
      // o cliente OAuth do cofre (público: vai na URL do Google); vazio, o login ainda não está pronto
      googleClientId: config.googleClientId,
    });
  });

  entryRoutes(app, deps);
  createRoutes(app, deps);
  openRoutes(app, deps);
  itemRoutes(app, deps);
  manageRoutes(app, deps);

  app.notFound((c) => {
    deps.log?.(`${c.req.method} ${c.req.path} 404 nao-encontrado`);
    return c.json({ erro: 'nao-encontrado', mensagem: 'Esse endereço não existe na API do cofre.' }, 404);
  });

  // Nunca o corpo do pedido nem o token no log (9.3): só o tipo e a mensagem do erro; nas respostas de
  // erro, o método, o molde da rota (sem o id que vem nela), o status e o código.
  app.onError((error, c) => {
    if (error instanceof HttpError) {
      const route = c.req.routePath && c.req.routePath !== '*' && c.req.routePath !== '/*' ? c.req.routePath : c.req.path;
      deps.log?.(`${c.req.method} ${route} ${error.status} ${error.code}`);
      return c.json({ erro: error.code, mensagem: error.message }, error.status);
    }
    console.error(`erro interno: ${error.name}: ${error.message}`);
    return c.json({ erro: 'erro-interno', mensagem: 'Algo deu errado no cofre.' }, 500);
  });

  return app;
}
