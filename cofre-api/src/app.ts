import { Hono } from 'hono';
import { HttpError } from './errors';
import { offline, readOnly, usageToday } from './domain/quota';
import { Deps } from './ports';

/** A versão da API que o /api/status informa. */
const API_VERSION = 1;

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

  // O interruptor geral: desligado, só o /api/status responde; só leitura, só GET.
  app.use('*', async (c, next) => {
    const isStatus = c.req.method === 'GET' && c.req.path === '/api/status';
    if (config.mode === 'desligado' && !isStatus) throw offline();
    if (config.mode === 'so-leitura' && !['GET', 'HEAD'].includes(c.req.method)) throw readOnly();
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
    });
  });

  app.notFound((c) => c.json({ erro: 'nao-encontrado', mensagem: 'Esse endereço não existe na API do cofre.' }, 404));

  // Nunca o corpo do pedido nem o token no log (9.3): só o tipo e a mensagem do erro.
  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ erro: error.code, mensagem: error.message }, error.status);
    console.error(`erro interno: ${error.name}: ${error.message}`);
    return c.json({ erro: 'erro-interno', mensagem: 'Algo deu errado no cofre.' }, 500);
  });

  return app;
}
