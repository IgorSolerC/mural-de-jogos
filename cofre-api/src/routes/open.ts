import { Context, Hono } from 'hono';
import { LIMITS, accountKey, reserve } from '../domain/brake';
import { Bytes, base64url, blob, fromBase64url, sameBytes } from '../domain/bytes';
import { consumeChallenge, newChallenge } from '../domain/challenge';
import { eventStatement } from '../domain/events';
import { GRACE_MAX_ERRORS, GRACE_MS, NewGrace, TOKEN, graceEnded, graceStatements } from '../domain/grace';
import { assertCanTry, attemptStatements, successStatements, waitAfterError } from '../domain/password-brake';
import { openServerSecret, proofHash } from '../domain/proofs';
import { write } from '../domain/quota';
import { verifyPasskey } from '../domain/reconfirm';
import {
  Session,
  VAULT_IDLE_MS,
  VAULT_MAX_MS,
  authenticate,
  factorStatement,
  hashToken,
  newToken,
  sessionOfToken,
  vaultSessionStatements,
} from '../domain/session';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { currentPepper } from '../secrets';
import { SEALED_KEY, bytesField, exactly, invalid, uuidField } from './fields';
import { country, readJson } from './http';

/**
 * Abrir o cofre (8.1, passos 3 a 6), recuperar com o código (8.4) e trancar (8.2).
 *
 * A ordem é: o desafio (com o sal e os parâmetros do Argon2id), a passkey (que devolve o envelope do
 * aparelho, e com ele a chave do meio) e a prova da senha (que devolve V, o manifesto e a sessão do cofre).
 * A prova da senha só é aceita logo depois de uma passkey (ou do código), e cada tentativa gasta essa
 * marca: um palpite de senha custa um toque no celular (ameaça 15).
 */

type Blob = Uint8Array | ArrayBuffer | number[];

interface AccountRow {
  versao_cripto: number;
  kdf_m: number;
  kdf_t: number;
  kdf_p: number;
  sal: Blob;
  v: Blob;
  auth_hash: Blob;
  auth_pimenta: number;
  manifesto: Blob;
  contador: number;
  congelado_ate: string | null;
  mudado_em: string;
  carencia: number;
  pin: number;
}

/** A conta do cofre, ou 404 se ela ainda não tem cofre; 423 se está congelado (8.6). */
export async function vaultOf(deps: Deps, userId: string): Promise<AccountRow> {
  const row = await deps.db.first<AccountRow>(
    'SELECT versao_cripto, kdf_m, kdf_t, kdf_p, sal, v, auth_hash, auth_pimenta, manifesto, contador, congelado_ate, mudado_em, carencia, pin FROM cofre_contas WHERE usuario_id = ?',
    [userId],
  );
  if (!row) throw new HttpError(404, 'sem-cofre', 'Esta conta ainda não tem cofre.');
  if (row.congelado_ate && Date.parse(row.congelado_ate) > deps.now().getTime()) {
    throw new HttpError(423, 'cofre-congelado', `O cofre está congelado até ${row.congelado_ate}.`);
  }
  return row;
}

/** Um campo de prova em base64url, exatamente 32 bytes. */
function proofField(value: unknown, what: string): Bytes {
  const bytes = typeof value === 'string' ? fromBase64url(value) : null;
  if (!bytes || bytes.length !== 32) throw new HttpError(400, 'pedido-invalido', `${what}: formato ou tamanho errado.`);
  return bytes;
}

const needsFactor = () => new HttpError(403, 'falta-passkey', 'Confirme com a passkey (ou com o código de recuperação) antes da senha.');

/**
 * A carência que a página manda junto da prova da senha, ao abrir com a passkey (17.23): o id, o token que
 * só o aparelho guarda (aqui fica o hash) e M selada com a chave G do aparelho. `anterior`: o token da
 * carência que o aparelho tinha, que sai. Formato errado recusa o pedido antes de gastar a passkey.
 */
async function graceField(raw: unknown): Promise<{ grace: NewGrace; previousHash: string | null } | null> {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalid('carência: formato errado.');
  const g = raw as Record<string, unknown>;
  const token = g['token'];
  const previous = g['anterior'];
  if (typeof token !== 'string' || !TOKEN.test(token)) throw invalid('carência: token com formato errado.');
  if (previous !== undefined && (typeof previous !== 'string' || !TOKEN.test(previous))) throw invalid('carência: token anterior com formato errado.');
  return {
    grace: { id: uuidField(g['id'], 'carência'), hash: await hashToken(token), envelope: bytesField(g['envelope'], 'envelope da carência', exactly(SEALED_KEY)) },
    previousHash: typeof previous === 'string' ? await hashToken(previous) : null,
  };
}

export function openRoutes(app: Hono, deps: Deps): void {
  const { config } = deps;
  const entry = (c: Context) => authenticate(deps, c.req.header('Authorization'), ['entrada']);

  app.post('/api/cofre/desafio', async (c) => {
    const s = await entry(c);
    const vault = await vaultOf(deps, s.userId);
    await reserve(deps, accountKey(s.userId), 'desafio', LIMITS.desafio.account, { session: true });
    const now = deps.now();
    const devices = await deps.db.all<{ id: string; transportes: string; apelido: string; prf: number }>(
      'SELECT id, transportes, apelido, prf FROM cofre_credenciais WHERE usuario_id = ? ORDER BY criado_em',
      [s.userId],
    );
    const { id, challenge, statements } = newChallenge(s.userId, 'assinatura', now);
    await write(deps, statements, 4, { session: true });
    return c.json({
      desafio: id,
      publicKey: {
        challenge: base64url(challenge),
        rpId: config.rpId,
        allowCredentials: devices.map((d) => ({ type: 'public-key', id: d.id, ...(d.transportes ? { transports: d.transportes.split(',') } : {}) })),
        userVerification: 'required',
        timeout: 120_000,
      },
      versao: vault.versao_cripto,
      kdf: { m: vault.kdf_m, t: vault.kdf_t, p: vault.kdf_p },
      sal: base64url(blob(vault.sal)),
      aparelhos: devices.map((d) => ({ id: d.id, apelido: d.apelido, prf: d.prf === 1 })),
      mudadoEm: vault.mudado_em,
      // a página sela a carência deste aparelho junto da senha só com ela ligada (17.23)
      carencia: vault.carencia === 1,
      pin: vault.pin === 1,
    });
  });

  app.post('/api/cofre/chave', async (c) => {
    const s = await entry(c);
    const body = await readJson(c, 16_384);
    await vaultOf(deps, s.userId);
    const challenge = await consumeChallenge(deps, body['desafio'], s.userId, 'assinatura');
    const credentialId = await verifyPasskey(deps, s.userId, challenge, body['assinatura']);
    const envelope = await deps.db.first<{ id: string; tipo: 'prf' | 'servidor'; envelope: Blob; s_cifrado: Blob | null; s_versao: number | null }>(
      'SELECT id, tipo, envelope, s_cifrado, s_versao FROM cofre_envelopes WHERE credencial_id = ? AND usuario_id = ?',
      [credentialId, s.userId],
    );
    if (!envelope) throw new HttpError(409, 'sem-envelope', 'Esta passkey não tem envelope no cofre.');
    // no modo servidor, o S_i só sai depois da assinatura conferida (6.1)
    const serverSecret =
      envelope.tipo === 'servidor' && envelope.s_cifrado !== null && envelope.s_versao !== null
        ? await openServerSecret(deps, s.userId, envelope.id, blob(envelope.s_cifrado), envelope.s_versao)
        : null;
    const now = deps.now();
    await write(
      deps,
      [
        { sql: 'UPDATE cofre_envelopes SET usado_em = ? WHERE id = ?', params: [now.toISOString(), envelope.id] },
        factorStatement(s, 'passkey', now),
        eventStatement(s.userId, 'passkey-usada', now, s.device, country(c)),
      ],
      6,
      { session: true },
    );
    return c.json({
      envelope: { id: envelope.id, dados: base64url(blob(envelope.envelope)) },
      tipo: envelope.tipo,
      ...(serverSecret ? { s: base64url(serverSecret) } : {}),
    });
  });

  app.post('/api/cofre/recuperar', async (c) => {
    const s = await entry(c);
    const body = await readJson(c, 4096);
    await vaultOf(deps, s.userId);
    const kRec = proofField(body['kRec'], 'prova do código');
    const rec = await deps.db.first<{ id: string; envelope: Blob; rec_hash: Blob; rec_pimenta: number; usado_em: string | null }>(
      "SELECT id, envelope, rec_hash, rec_pimenta, usado_em FROM cofre_envelopes WHERE usuario_id = ? AND tipo = 'recuperacao'",
      [s.userId],
    );
    // uso único (8.4): o código que já abriu o cofre não abre de novo; um novo sai em Ajustes
    if (rec?.usado_em) throw new HttpError(410, 'codigo-ja-usado', 'Este código de recuperação já foi usado. Gere outro nos Ajustes do cofre.');
    // a tentativa fica anotada antes de conferir, e conta mesmo quando dá errado
    await reserve(deps, accountKey(s.userId), 'recuperar', LIMITS.recuperar.account, { session: true });
    const now = deps.now();
    const ok = rec !== null && sameBytes((await proofHash(deps, 'rec', kRec, rec.rec_pimenta)).hash, blob(rec.rec_hash));
    if (!ok) throw new HttpError(401, 'codigo-errado', 'O código de recuperação não confere.');
    await write(deps, [factorStatement(s, 'recuperacao', now), eventStatement(s.userId, 'codigo-usado', now, s.device, country(c))], 6, { session: true });
    return c.json({ envelope: { id: rec.id, dados: base64url(blob(rec.envelope)) } });
  });

  app.post('/api/cofre/abrir', async (c) => {
    const s = await entry(c);
    const body = await readJson(c, 4096);
    if (!s.factor) throw needsFactor();
    const vault = await vaultOf(deps, s.userId);
    await assertCanTry(deps, s.userId);
    const kAuth = proofField(body['kAuth'], 'prova da senha');
    // a carência nova só nasce de uma abertura com a passkey, com ela ligada; pela própria carência ou pelo
    // código, não (abrir pela carência não renova o prazo)
    const offered = await graceField(body['carencia']);
    const newGrace = offered && s.factor === 'passkey' && !s.grace && vault.carencia === 1 ? offered : null;
    const now = deps.now();
    // a marca da passkey é gasta antes de conferir, e a tentativa já conta como erro no freio, tudo numa
    // gravação com a condição no banco: duas tentativas ao mesmo tempo com a mesma passkey, só uma chega
    // à senha; e várias ao mesmo tempo (cada uma com a sua) não passam juntas do freio
    const [spent] = await write(deps, attemptStatements(s.hash, s.userId, now, s.grace), 7, { session: true });
    if (spent?.changes !== 1) {
      await assertCanTry(deps, s.userId);
      if (s.grace) throw graceEnded();
      throw needsFactor();
    }
    const ok = sameBytes((await proofHash(deps, 'auth', kAuth, vault.auth_pimenta)).hash, blob(vault.auth_hash));

    if (!ok) {
      await write(deps, [eventStatement(s.userId, 'erro-senha', now, s.device, country(c))], 3, { session: true });
      const waitUntil = await waitAfterError(deps, s.userId);
      const message = waitUntil ? `A senha não confere. Muitos erros seguidos: tente de novo depois de ${waitUntil}.` : 'A senha não confere.';
      // a última tentativa da carência: o aparelho fica sabendo que a próxima pede o Google e a passkey
      const graceGone = s.grace !== null && !(await deps.db.first(`SELECT 1 FROM cofre_carencias WHERE id = ? AND erros < ${GRACE_MAX_ERRORS}`, [s.grace]));
      throw new HttpError(401, 'senha-errada', graceGone ? `${message} Este aparelho volta a pedir o Google e a passkey.` : message);
    }

    const token = newToken();
    const recovered = s.factor === 'recuperacao';
    const statements: Statement[] = [
      ...successStatements(s.userId, now.toISOString()),
      ...vaultSessionStatements(s, await hashToken(token), recovered, now),
      eventStatement(s.userId, recovered ? 'aberto-com-codigo' : s.grace ? 'aberto-com-carencia' : 'aberto', now, s.device, country(c)),
    ];
    // acertou pela carência: os erros dela voltam a zero (o prazo continua o mesmo)
    if (s.grace) statements.push({ sql: 'UPDATE cofre_carencias SET erros = 0, usada_em = ? WHERE id = ?', params: [now.toISOString(), s.grace] });
    if (newGrace) statements.push(...graceStatements(s.userId, s.code, newGrace.grace, newGrace.previousHash, s.device, now));
    // o código só fica gasto quando abre de verdade: errar a senha depois dele não o queima
    if (recovered) statements.push({ sql: "UPDATE cofre_envelopes SET usado_em = ? WHERE usuario_id = ? AND tipo = 'recuperacao'", params: [now.toISOString(), s.userId] });
    // a pimenta foi trocada (16.2): a prova que acabou de conferir passa para a versão nova
    const pepper = currentPepper(deps.secrets);
    if (vault.auth_pimenta < pepper.version) {
      const fresh = await proofHash(deps, 'auth', kAuth);
      statements.push({ sql: 'UPDATE cofre_contas SET auth_hash = ?, auth_pimenta = ? WHERE usuario_id = ?', params: [fresh.hash, fresh.version, s.userId] });
    }
    await write(deps, statements, 16, { session: true });
    return c.json({
      token,
      expiraEm: new Date(now.getTime() + VAULT_MAX_MS).toISOString(),
      paradaMaxima: VAULT_IDLE_MS / 1000,
      v: base64url(blob(vault.v)),
      manifesto: base64url(blob(vault.manifesto)),
      contador: vault.contador,
      recuperada: recovered,
      carencia: newGrace ? { id: newGrace.grace.id, expiraEm: new Date(now.getTime() + GRACE_MS).toISOString() } : null,
    });
  });

  // O `sendBeacon` não manda cabeçalho: o token pode vir no corpo. Responde sempre igual, com sessão ou
  // sem, e pede ao navegador para apagar o que tiver guardado desta origem (7.3). Com `manter` (o aparelho
  // tem a carência, 17.23), só o cache: a carência mora no armazenamento, e trancar não a encerra.
  app.post('/api/cofre/trancar', async (c) => {
    const header = /^Bearer (.+)$/.exec(c.req.header('Authorization') ?? '')?.[1];
    const body = header ? {} : await readJson(c, 1024).catch(() => ({}) as Record<string, unknown>);
    const token = header ?? (typeof body['token'] === 'string' ? body['token'] : '');
    let session: Session | null = null;
    try {
      session = await sessionOfToken(deps, token, ['cofre', 'entrada']);
    } catch {
      /* sem sessão: nada a apagar */
    }
    if (session) await write(deps, [{ sql: 'DELETE FROM cofre_sessoes WHERE hash = ?', params: [session.hash] }], 4, { session: true });
    c.header('Clear-Site-Data', body['manter'] === true ? '"cache"' : '"cache", "storage"');
    return c.json({ trancado: true });
  });
}
