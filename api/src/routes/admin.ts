import { Context, Hono } from 'hono';
import { isAdmin } from '../domain/admin';
import { Session } from '../domain/session';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { sessionOf } from './http';

/**
 * Quem chama, se for admin: sem sessão, 401; com a sessão de outra conta, 403. Só a sessão do site passa
 * (`sessionOf`): uma chave de API ou um conector nunca entram aqui.
 */
async function requireAdmin(deps: Deps, c: Context): Promise<Session> {
  const session = await sessionOf(deps, c);
  if (!isAdmin(deps, session.userId)) throw new HttpError(403, 'so-admin', 'Só a conta de admin vê isto.');
  return session;
}

/**
 * O que só o admin lê (PLANO-ADMIN-APIS.md, seção 10). Sem `Cache-Control` próprio, sai `no-store`
 * (ver `app.ts`), e o service worker não guarda.
 */
export function adminRoutes(app: Hono, deps: Deps): void {
  /** O uso de cada API. A contagem entra na rodada 2: por enquanto, responde que ainda não há nada. */
  app.get('/v1/admin/uso', async (c) => {
    await requireAdmin(deps, c);
    return c.json({ geradoEm: deps.now().toISOString(), contandoDesde: null, linhas: [], falhas: [] });
  });
}
