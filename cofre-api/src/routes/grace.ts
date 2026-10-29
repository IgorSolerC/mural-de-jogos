import { Context, Hono } from 'hono';
import { canUseVault } from '../config';
import { LIMITS, accountKey, ipKey, reserve } from '../domain/brake';
import { base64url, blob } from '../domain/bytes';
import { eventStatement } from '../domain/events';
import { GRACE_MAX_ERRORS, TOKEN, dropGracesStatement, graceEnded } from '../domain/grace';
import { write } from '../domain/quota';
import { reconfirm } from '../domain/reconfirm';
import { ENTRY_MS, authenticate, entrySessionStatements, hashToken, newToken } from '../domain/session';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { invalid } from './fields';
import { clientIp, country, deviceOf, readJson } from './http';
import { vaultOf } from './open';

interface GraceRow {
  id: string;
  usuario_id: string;
  codigo: string;
  envelope: Uint8Array | ArrayBuffer | number[];
}

/**
 * A carência do aparelho (17.23, `domain/grace.ts`): abrir só com a senha mestra, por 24 horas depois do
 * Google e da passkey; e, nos Ajustes do cofre, ligar, desligar e encerrar.
 */
export function graceRoutes(app: Hono, deps: Deps): void {
  // Pela carência, no lugar do Google e da passkey: o token do aparelho → uma sessão de entrada com a marca
  // do segundo fator, o envelope dele e o que a senha precisa (o sal e o Argon2id). Os erros contam ao
  // tentar a senha (POST /api/cofre/abrir), não aqui: carregar a página não gasta a carência.
  app.post('/api/carencia', async (c) => {
    const body = await readJson(c, 1024);
    const token = body['token'];
    if (typeof token !== 'string' || !TOKEN.test(token)) throw invalid('carência: token com formato errado.');
    // o freio por IP antes de olhar o banco (um próprio, à parte do login com o Google)
    await reserve(deps, await ipKey(deps, clientIp(c)), 'carencia', LIMITS.carencia.ip!, { session: true });
    const now = deps.now();
    const grace = await deps.db.first<GraceRow>(
      `SELECT g.id, g.usuario_id, g.codigo, g.envelope FROM cofre_carencias g JOIN cofre_contas a ON a.usuario_id = g.usuario_id
       WHERE g.hash = ? AND g.expira_em > ? AND g.erros < ${GRACE_MAX_ERRORS} AND a.carencia = 1`,
      [await hashToken(token), now.toISOString()],
    );
    if (!grace || !canUseVault(deps.config, grace.codigo)) throw graceEnded();
    const vault = await vaultOf(deps, grace.usuario_id);
    await reserve(deps, accountKey(grace.usuario_id), 'carencia', LIMITS.carencia.account, { session: true });
    const devices = await deps.db.all<{ id: string; transportes: string }>('SELECT id, transportes FROM cofre_credenciais WHERE usuario_id = ? ORDER BY criado_em', [grace.usuario_id]);
    const session = newToken();
    await write(deps, entrySessionStatements(await hashToken(session), grace.usuario_id, grace.codigo, deviceOf(body), now, ENTRY_MS, grace.id), 5, { session: true });
    return c.json({
      token: session,
      expiraEm: new Date(now.getTime() + ENTRY_MS).toISOString(),
      usuario: grace.usuario_id,
      codigo: grace.codigo,
      envelope: { id: grace.id, dados: base64url(blob(grace.envelope)) },
      versao: vault.versao_cripto,
      kdf: { m: vault.kdf_m, t: vault.kdf_t, p: vault.kdf_p },
      sal: base64url(blob(vault.sal)),
      mudadoEm: vault.mudado_em,
      pin: vault.pin === 1,
      // as passkeys do cofre, para a página pedir uma de novo antes de mostrar uma senha protegida (17.18)
      passkeys: devices.map((d) => ({ id: d.id, ...(d.transportes ? { transports: d.transportes.split(',') } : {}) })),
    });
  });

  // "Esquecer este aparelho": com o token, a carência sai. Responde sempre igual (existindo ou não).
  app.post('/api/carencia/esquecer', async (c) => {
    const body = await readJson(c, 1024);
    const token = body['token'];
    if (typeof token !== 'string' || !TOKEN.test(token)) throw invalid('carência: token com formato errado.');
    await write(deps, [{ sql: 'DELETE FROM cofre_carencias WHERE hash = ?', params: [await hashToken(token)] }], 5, { session: true });
    return c.json({ esquecida: true });
  });

  const vault = (c: Context) => authenticate(deps, c.req.header('Authorization'), ['cofre']);

  // Nos Ajustes: se está ligada, e os aparelhos com a carência valendo agora.
  app.get('/api/cofre/carencia', async (c) => {
    const s = await vault(c);
    const account = await deps.db.first<{ carencia: number }>('SELECT carencia FROM cofre_contas WHERE usuario_id = ?', [s.userId]);
    const rows = await deps.db.all<{ id: string; aparelho: string | null; criada_em: string; expira_em: string; usada_em: string | null }>(
      `SELECT id, aparelho, criada_em, expira_em, usada_em FROM cofre_carencias WHERE usuario_id = ? AND expira_em > ? AND erros < ${GRACE_MAX_ERRORS} ORDER BY criada_em DESC`,
      [s.userId, deps.now().toISOString()],
    );
    return c.json({
      ligada: account?.carencia === 1,
      carencias: rows.map((r) => ({ id: r.id, aparelho: r.aparelho, criadaEm: r.criada_em, expiraEm: r.expira_em, usadaEm: r.usada_em })),
    });
  });

  // Ligar pede a confirmação de agora (a passkey ou a senha, como o que deixa o cofre mais fraco, 17.21);
  // desligar não (só deixa mais forte) e encerra todas as carências da conta na hora.
  app.put('/api/cofre/carencia', async (c) => {
    const s = await vault(c);
    const body = await readJson(c, 16_384);
    const on = body['ligada'];
    if (typeof on !== 'boolean') throw invalid('ligada: precisa ser true ou false.');
    if (on) await reconfirm(deps, s, body, country(c));
    const now = deps.now();
    await write(
      deps,
      [
        { sql: 'UPDATE cofre_contas SET carencia = ? WHERE usuario_id = ?', params: [on ? 1 : 0, s.userId] },
        ...(on ? [] : [dropGracesStatement(s.userId)]),
        eventStatement(s.userId, on ? 'carencia-ligada' : 'carencia-desligada', now, s.device, country(c)),
      ],
      on ? 5 : 15,
    );
    return c.json({ ligada: on });
  });

  // Encerrar a carência de um aparelho (o mesmo de "Esquecer este aparelho", de longe).
  app.delete('/api/cofre/carencia/:id', async (c) => {
    const s = await vault(c);
    const [gone] = await write(deps, [{ sql: 'DELETE FROM cofre_carencias WHERE id = ? AND usuario_id = ?', params: [c.req.param('id'), s.userId] }], 5);
    if (gone?.changes !== 1) throw new HttpError(404, 'carencia-nao-encontrada', 'Este aparelho já não tem carência.');
    await write(deps, [eventStatement(s.userId, 'carencia-encerrada', deps.now(), s.device, country(c))], 3);
    return c.json({ encerrada: true });
  });
}
