import { Hono } from 'hono';
import { guia, llmsTxt } from '../../../contrato/api-v1/guia';
import { openapi } from '../../../contrato/api-v1/openapi';

/**
 * A documentação da API das AIs (PLANO-API.md, 13.2), servida pela própria API e gerada do contrato:
 * `/llms.txt` (o mapa), `/llms-full.txt` (o guia inteiro) e `/ext/v1/openapi.json`. Sem chave.
 */
export function docsRoutes(app: Hono): void {
  const origin = (url: string) => new URL(url).origin;
  const text = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  app.get('/llms.txt', (c) => text(llmsTxt(origin(c.req.url))));
  app.get('/llms-full.txt', (c) => text(guia(origin(c.req.url))));
  app.get('/ext/v1/openapi.json', (c) => c.json(openapi(origin(c.req.url)), 200, { 'Cache-Control': 'public, max-age=3600' }));
}
