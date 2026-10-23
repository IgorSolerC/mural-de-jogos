import { Context, Hono } from 'hono';
import { HISTORY_DAYS } from '../domain/cleanup';
import { eventStatement } from '../domain/events';
import { eraseVaultStatements } from '../domain/murall';
import { resetStatement } from '../domain/password-brake';
import { proofHash } from '../domain/proofs';
import { DAY_MS, write } from '../domain/quota';
import { authenticate } from '../domain/session';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { KEY, SEALED_KEY, bytesField, deviceField, deviceStatements, exactly, kdfField, uuidField, verifyDevices } from './fields';
import { country, readJson } from './http';

/**
 * Gerenciar o cofre aberto (8.5): a senha, os aparelhos, o código de recuperação, os aparelhos abertos,
 * o histórico e apagar o cofre. Nada aqui lê ou muda os itens; cada mudança entra no histórico.
 */

/** Quantas passkeys um cofre pode ter. */
export const MAX_DEVICES = 10;
const HISTORY_MAX = 500;
/** O que a pessoa tem de escrever para apagar o cofre. */
export const DELETE_CONFIRMATION = 'APAGAR';

export function manageRoutes(app: Hono, deps: Deps): void {
  const vault = (c: Context) => authenticate(deps, c.req.header('Authorization'), ['cofre']);

  app.get('/api/cofre/aparelhos', async (c) => {
    const s = await vault(c);
    const rows = await deps.db.all<{ id: string; apelido: string; prf: number; criado_em: string; usado_em: string | null }>(
      'SELECT id, apelido, prf, criado_em, usado_em FROM cofre_credenciais WHERE usuario_id = ? ORDER BY criado_em',
      [s.userId],
    );
    return c.json({ aparelhos: rows.map((r) => ({ id: r.id, apelido: r.apelido, prf: r.prf === 1, criadoEm: r.criado_em, usadoEm: r.usado_em })) });
  });

  // Pôr um aparelho (o desafio vem do POST /api/cofre/registro, que exclui os que já existem).
  app.post('/api/cofre/aparelhos', async (c) => {
    const s = await vault(c);
    const body = await readJson(c);
    const device = deviceField(body['aparelho'], 'aparelho');
    const count = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM cofre_credenciais WHERE usuario_id = ?', [s.userId]);
    if ((count?.n ?? 0) >= MAX_DEVICES) throw new HttpError(409, 'aparelhos-demais', `O cofre já tem ${MAX_DEVICES} aparelhos. Tire um antes de pôr outro.`);
    const [verified] = await verifyDevices(deps, s.userId, [device]);
    const now = deps.now();
    await write(deps, [...(await deviceStatements(deps, s.userId, device, verified!, now.toISOString())), eventStatement(s.userId, 'aparelho-posto', now, s.device, country(c))], 12);
    return c.json({ id: verified!.credentialId, apelido: device.nickname, prf: device.prf }, 201);
  });

  // Tirar um aparelho: a passkey e o envelope dele. Nunca o último (o cofre ficaria sem como abrir, 8.5).
  app.delete('/api/cofre/aparelhos/:id', async (c) => {
    const s = await vault(c);
    const id = c.req.param('id');
    if (!(await deps.db.first('SELECT 1 FROM cofre_credenciais WHERE id = ? AND usuario_id = ?', [id, s.userId]))) {
      throw new HttpError(404, 'aparelho-nao-encontrado', 'Este aparelho não está no cofre.');
    }
    const now = deps.now();
    // a condição vai em cada parte do lote: dois "tirar" ao mesmo tempo não deixam o cofre sem nenhum
    const others = '(SELECT COUNT(*) FROM cofre_credenciais WHERE usuario_id = ?) > 1';
    const [envelope, credential] = await write(
      deps,
      [
        { sql: `DELETE FROM cofre_envelopes WHERE credencial_id = ? AND usuario_id = ? AND ${others}`, params: [id, s.userId, s.userId] },
        { sql: `DELETE FROM cofre_credenciais WHERE id = ? AND usuario_id = ? AND ${others}`, params: [id, s.userId, s.userId] },
        { sql: `INSERT INTO cofre_eventos (usuario_id, tipo, em, aparelho, pais) SELECT ?, 'aparelho-tirado', ?, ?, ? WHERE (SELECT COUNT(*) FROM cofre_credenciais WHERE id = ?) = 0`, params: [s.userId, now.toISOString(), s.device, country(c), id] },
      ],
      10,
    );
    if (credential?.changes !== 1 || envelope?.changes !== 1) throw new HttpError(409, 'ultimo-aparelho', 'Este é o único aparelho do cofre: ponha outro antes de tirar este.');
    return c.json({ tirado: true });
  });

  // Trocar a senha (8.5): novo sal, novo V (a mesma chave do cofre, selada com a senha nova) e nova prova.
  app.put('/api/cofre/senha', async (c) => {
    const s = await vault(c);
    const body = await readJson(c);
    const { m, t, p } = kdfField(body);
    const salt = bytesField(body['sal'], 'sal', exactly(16));
    const v = bytesField(body['v'], 'V', exactly(SEALED_KEY));
    const auth = await proofHash(deps, 'auth', bytesField(body['kAuth'], 'prova da senha', exactly(KEY)));
    const now = deps.now();
    await write(
      deps,
      [
        {
          sql: 'UPDATE cofre_contas SET versao_cripto = 1, kdf_m = ?, kdf_t = ?, kdf_p = ?, sal = ?, v = ?, auth_hash = ?, auth_pimenta = ?, mudado_em = ? WHERE usuario_id = ?',
          params: [m, t, p, salt, v, auth.hash, auth.version, now.toISOString(), s.userId],
        },
        resetStatement(s.userId),
        eventStatement(s.userId, 'senha-trocada', now, s.device, country(c)),
      ],
      8,
    );
    return c.json({ trocada: true });
  });

  // Um código de recuperação novo: o envelope e a prova; o antigo deixa de valer na hora.
  app.put('/api/cofre/recuperacao', async (c) => {
    const s = await vault(c);
    const body = await readJson(c);
    const id = uuidField(body['id'], 'envelope do código');
    const envelope = bytesField(body['envelope'], 'envelope do código', exactly(SEALED_KEY));
    const rec = await proofHash(deps, 'rec', bytesField(body['kRec'], 'prova do código', exactly(KEY)));
    if (await deps.db.first('SELECT 1 FROM cofre_envelopes WHERE id = ?', [id])) throw new HttpError(400, 'pedido-invalido', 'Envelope com um id que já existe.');
    const now = deps.now();
    await write(
      deps,
      [
        { sql: "DELETE FROM cofre_envelopes WHERE usuario_id = ? AND tipo = 'recuperacao'", params: [s.userId] },
        {
          sql: "INSERT INTO cofre_envelopes (id, usuario_id, tipo, envelope, rec_hash, rec_pimenta, criado_em) VALUES (?, ?, 'recuperacao', ?, ?, ?, ?)",
          params: [id, s.userId, envelope, rec.hash, rec.version, now.toISOString()],
        },
        eventStatement(s.userId, 'codigo-trocado', now, s.device, country(c)),
      ],
      10,
    );
    return c.json({ trocado: true });
  });

  // Os aparelhos com o cofre aberto (ou entrando) agora, sem nenhum dado da sessão além de quando e onde.
  app.get('/api/cofre/sessoes', async (c) => {
    const s = await vault(c);
    const rows = await deps.db.all<{ hash: string; tipo: string; criada_em: string; usada_em: string; aparelho: string | null }>(
      'SELECT hash, tipo, criada_em, usada_em, aparelho FROM cofre_sessoes WHERE usuario_id = ? AND expira_em > ? ORDER BY usada_em DESC',
      [s.userId, deps.now().toISOString()],
    );
    return c.json({
      sessoes: rows.map((r) => ({ tipo: r.tipo, criadaEm: r.criada_em, usadaEm: r.usada_em, aparelho: r.aparelho, atual: r.hash === s.hash })),
    });
  });

  // "Trancar todos" (8.5): todas as sessões da conta, inclusive esta.
  app.post('/api/cofre/trancar-todos', async (c) => {
    const s = await vault(c);
    const now = deps.now();
    await write(deps, [{ sql: 'DELETE FROM cofre_sessoes WHERE usuario_id = ?', params: [s.userId] }, eventStatement(s.userId, 'todos-trancados', now, s.device, country(c))], 12, { session: true });
    c.header('Clear-Site-Data', '"cache", "storage"');
    return c.json({ trancados: true });
  });

  // O histórico dos últimos 90 dias (8.5), do mais novo para o mais velho.
  app.get('/api/cofre/eventos', async (c) => {
    const s = await vault(c);
    const since = new Date(deps.now().getTime() - HISTORY_DAYS * DAY_MS).toISOString();
    const rows = await deps.db.all<{ tipo: string; em: string; aparelho: string | null; pais: string | null }>(
      'SELECT tipo, em, aparelho, pais FROM cofre_eventos WHERE usuario_id = ? AND em > ? ORDER BY em DESC, id DESC LIMIT ?',
      [s.userId, since, HISTORY_MAX],
    );
    return c.json({ eventos: rows });
  });

  // Apagar o cofre (só aberto, com a palavra escrita): tudo da conta, sem volta. O backup diário guarda
  // a cópia cifrada por 30 dias (16.3).
  app.delete('/api/cofre', async (c) => {
    const s = await vault(c);
    const body = await readJson(c, 1024);
    if (body['confirmacao'] !== DELETE_CONFIRMATION) {
      throw new HttpError(400, 'falta-confirmacao', `Para apagar o cofre, escreva ${DELETE_CONFIRMATION}.`);
    }
    await write(deps, eraseVaultStatements(s.userId), 40);
    c.header('Clear-Site-Data', '"cache", "storage"');
    return c.json({ apagado: true });
  });
}
