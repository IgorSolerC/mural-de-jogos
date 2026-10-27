import { Hono } from 'hono';
import { formatCode } from '../domain/code';
import { authenticateKey, keyOut } from '../domain/api-key';
import { Deps } from '../ports';

/**
 * A API das AIs e dos programas (PLANO-API.md, seção 7): `/ext/v1/*`, só com chave de API. Por ora (a
 * rodada 1), só quem é a conta e o que a chave pode fazer; as áreas chegam uma por rodada.
 */
export function extRoutes(app: Hono, deps: Deps): void {
  app.get('/ext/v1/eu', async (c) => {
    const caller = await authenticateKey(deps, c.req.header('Authorization'));
    return c.json({ conta: { codigo: formatCode(caller.code), nome: caller.name }, chave: keyOut(caller.key) });
  });
}
