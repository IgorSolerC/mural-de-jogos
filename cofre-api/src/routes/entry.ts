import { Hono } from 'hono';
import { canUseVault } from '../config';
import { LIMITS, accountKey, assertUnderLimit, brakeStatement, ipKey } from '../domain/brake';
import { readLoginBody } from '../domain/google';
import { write } from '../domain/quota';
import { ENTRY_CREATE_MS, ENTRY_MS, authenticate, entrySessionStatements, hashToken, newToken } from '../domain/session';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { clientIp, deviceOf, readJson } from './http';

/** `POST /api/entrar` (o Google, 8.1 passo 2) e `GET /api/cofre` (existe? congelado? quantos aparelhos?). */
export function entryRoutes(app: Hono, deps: Deps): void {
  app.post('/api/entrar', async (c) => {
    const body = await readJson(c, 4096);
    const { code, verifier } = readLoginBody(body);
    const now = deps.now();

    // o freio por IP vem antes de falar com o Google, e conta mesmo quando o login dá errado
    const ip = await ipKey(deps, clientIp(c));
    await assertUnderLimit(deps, ip, 'entrar', LIMITS.entrar.ip!);
    await write(deps, [brakeStatement(ip, 'entrar', now)], 2, { session: true });

    const sub = await deps.googleLogin(code, verifier);
    const account = await deps.mural.accountByGoogle(sub);
    if (!account) {
      throw new HttpError(403, 'sem-conta-murall', 'Esta conta do Google não tem Murall. Entre no Murall com ela primeiro.');
    }
    if (!canUseVault(deps.config, account.code)) {
      throw new HttpError(403, 'cofre-fechado', 'O cofre de senhas ainda não está aberto para a sua conta.');
    }
    await assertUnderLimit(deps, accountKey(account.id), 'entrar', LIMITS.entrar.account);

    const token = newToken();
    // 5 minutos para abrir; 20 para criar, quando ainda não há cofre (ENTRY_CREATE_MS)
    const ttl = (await deps.db.first('SELECT 1 FROM cofre_contas WHERE usuario_id = ?', [account.id])) ? ENTRY_MS : ENTRY_CREATE_MS;
    await write(deps, [brakeStatement(accountKey(account.id), 'entrar', now), ...entrySessionStatements(await hashToken(token), account.id, account.code, deviceOf(body), now, ttl)], 7, { session: true });
    // a página precisa do id da conta: ele entra no AAD de tudo o que ela sela (6.1); e o código, para mostrar
    return c.json({ token, expiraEm: new Date(now.getTime() + ttl).toISOString(), usuario: account.id, codigo: account.code });
  });

  app.get('/api/cofre', async (c) => {
    const s = await authenticate(deps, c.req.header('Authorization'), ['entrada', 'cofre']);
    const row = await deps.db.first<{ congelado_ate: string | null; aparelhos: number }>(
      'SELECT congelado_ate, (SELECT COUNT(*) FROM cofre_credenciais WHERE usuario_id = cofre_contas.usuario_id) AS aparelhos FROM cofre_contas WHERE usuario_id = ?',
      [s.userId],
    );
    const frozen = row?.congelado_ate && Date.parse(row.congelado_ate) > deps.now().getTime() ? row.congelado_ate : null;
    return c.json({ existe: row !== null, congeladoAte: frozen, aparelhos: row?.aparelhos ?? 0 });
  });
}
