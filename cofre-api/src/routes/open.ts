import { Context, Hono } from 'hono';
import { LIMITS, accountKey, assertUnderLimit, brakeStatement } from '../domain/brake';
import { Bytes, base64url, blob, fromBase64url, sameBytes } from '../domain/bytes';
import { consumeChallenge, newChallenge } from '../domain/challenge';
import { eventStatement } from '../domain/events';
import { assertCanTry, errorStatements, resetStatement } from '../domain/password-brake';
import { openServerSecret, proofHash } from '../domain/proofs';
import { write } from '../domain/quota';
import {
  Session,
  VAULT_IDLE_MS,
  VAULT_MAX_MS,
  authenticate,
  factorStatement,
  hashToken,
  newToken,
  sessionOfToken,
  spendFactorStatement,
  vaultSessionStatements,
} from '../domain/session';
import { AssertionInput, WebAuthnError, verifyAssertion } from '../domain/webauthn';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { currentPepper } from '../secrets';
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
}

/** A conta do cofre, ou 404 se ela ainda não tem cofre; 423 se está congelado (8.6). */
async function vaultOf(deps: Deps, userId: string): Promise<AccountRow> {
  const row = await deps.db.first<AccountRow>(
    'SELECT versao_cripto, kdf_m, kdf_t, kdf_p, sal, v, auth_hash, auth_pimenta, manifesto, contador, congelado_ate, mudado_em FROM cofre_contas WHERE usuario_id = ?',
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

export function openRoutes(app: Hono, deps: Deps): void {
  const { config } = deps;
  const entry = (c: Context) => authenticate(deps, c.req.header('Authorization'), ['entrada']);

  app.post('/api/cofre/desafio', async (c) => {
    const s = await entry(c);
    const vault = await vaultOf(deps, s.userId);
    await assertUnderLimit(deps, accountKey(s.userId), 'desafio', LIMITS.desafio.account);
    const now = deps.now();
    const devices = await deps.db.all<{ id: string; transportes: string; apelido: string; prf: number }>(
      'SELECT id, transportes, apelido, prf FROM cofre_credenciais WHERE usuario_id = ? ORDER BY criado_em',
      [s.userId],
    );
    const { id, challenge, statements } = newChallenge(s.userId, 'assinatura', now);
    await write(deps, [brakeStatement(accountKey(s.userId), 'desafio', now), ...statements], 6, { session: true });
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
    });
  });

  app.post('/api/cofre/chave', async (c) => {
    const s = await entry(c);
    const body = await readJson(c, 16_384);
    await vaultOf(deps, s.userId);
    const challenge = await consumeChallenge(deps, body['desafio'], s.userId, 'assinatura');
    const raw = (body['assinatura'] ?? {}) as Record<string, unknown>;
    const assertion: AssertionInput = {
      id: raw['id'] as string,
      clientDataJSON: raw['clientDataJSON'] as string,
      authenticatorData: raw['authenticatorData'] as string,
      signature: raw['signature'] as string,
    };
    const rejected = (detail: string) => new HttpError(400, 'passkey-invalida', `A passkey não foi aceita (${detail}).`);
    if (typeof assertion.id !== 'string' || assertion.id.length > 1400) throw rejected('outra passkey');
    const credential = await deps.db.first<{ id: string; chave_publica: Blob; contador_assinatura: number }>(
      'SELECT id, chave_publica, contador_assinatura FROM cofre_credenciais WHERE id = ? AND usuario_id = ?',
      [assertion.id, s.userId],
    );
    if (!credential) throw rejected('esta passkey não é do seu cofre');
    let signCount: number;
    try {
      ({ signCount } = await verifyAssertion(assertion, {
        challenge,
        origin: config.origin,
        rpId: config.rpId,
        credentialId: credential.id,
        publicKey: blob(credential.chave_publica),
        storedSignCount: credential.contador_assinatura,
      }));
    } catch (e) {
      if (e instanceof WebAuthnError) throw rejected(e.message);
      throw e;
    }
    const envelope = await deps.db.first<{ id: string; tipo: 'prf' | 'servidor'; envelope: Blob; s_cifrado: Blob | null; s_versao: number | null }>(
      'SELECT id, tipo, envelope, s_cifrado, s_versao FROM cofre_envelopes WHERE credencial_id = ? AND usuario_id = ?',
      [credential.id, s.userId],
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
        { sql: 'UPDATE cofre_credenciais SET contador_assinatura = ?, usado_em = ? WHERE id = ?', params: [signCount, now.toISOString(), credential.id] },
        { sql: 'UPDATE cofre_envelopes SET usado_em = ? WHERE id = ?', params: [now.toISOString(), envelope.id] },
        factorStatement(s, 'passkey', now),
        eventStatement(s.userId, 'passkey-usada', now, s.device, country(c)),
      ],
      8,
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
    await assertUnderLimit(deps, accountKey(s.userId), 'recuperar', LIMITS.recuperar.account);
    const kRec = proofField(body['kRec'], 'prova do código');
    const rec = await deps.db.first<{ id: string; envelope: Blob; rec_hash: Blob; rec_pimenta: number; usado_em: string | null }>(
      "SELECT id, envelope, rec_hash, rec_pimenta, usado_em FROM cofre_envelopes WHERE usuario_id = ? AND tipo = 'recuperacao'",
      [s.userId],
    );
    // uso único (8.4): o código que já abriu o cofre não abre de novo; um novo sai em Ajustes
    if (rec?.usado_em) throw new HttpError(410, 'codigo-ja-usado', 'Este código de recuperação já foi usado. Gere outro nos Ajustes do cofre.');
    const now = deps.now();
    const ok = rec !== null && sameBytes((await proofHash(deps, 'rec', kRec, rec.rec_pimenta)).hash, blob(rec.rec_hash));
    const statements: Statement[] = [brakeStatement(accountKey(s.userId), 'recuperar', now)];
    if (ok) {
      statements.push(
        factorStatement(s, 'recuperacao', now),
        eventStatement(s.userId, 'codigo-usado', now, s.device, country(c)),
      );
    }
    await write(deps, statements, ok ? 8 : 2, { session: true });
    if (!ok) throw new HttpError(401, 'codigo-errado', 'O código de recuperação não confere.');
    return c.json({ envelope: { id: rec.id, dados: base64url(blob(rec.envelope)) } });
  });

  app.post('/api/cofre/abrir', async (c) => {
    const s = await entry(c);
    const body = await readJson(c, 4096);
    if (!s.factor) throw needsFactor();
    const vault = await vaultOf(deps, s.userId);
    await assertCanTry(deps, s.userId);
    const kAuth = proofField(body['kAuth'], 'prova da senha');
    const now = deps.now();
    // a marca da passkey é gasta antes de conferir: duas tentativas ao mesmo tempo com a mesma passkey,
    // só uma apaga a marca e chega à senha
    const [spent] = await write(deps, [spendFactorStatement(s, now)], 2, { session: true });
    if (spent?.changes !== 1) throw needsFactor();
    const ok = sameBytes((await proofHash(deps, 'auth', kAuth, vault.auth_pimenta)).hash, blob(vault.auth_hash));

    if (!ok) {
      const { statements, waitUntil } = await errorStatements(deps, s.userId);
      await write(deps, [...statements, eventStatement(s.userId, 'erro-senha', now, s.device, country(c))], 8, { session: true });
      throw new HttpError(401, 'senha-errada', waitUntil ? `A senha não confere. Muitos erros seguidos: tente de novo depois de ${waitUntil}.` : 'A senha não confere.');
    }

    const token = newToken();
    const recovered = s.factor === 'recuperacao';
    const statements: Statement[] = [
      resetStatement(s.userId),
      ...vaultSessionStatements(s, await hashToken(token), recovered, now),
      eventStatement(s.userId, recovered ? 'aberto-com-codigo' : 'aberto', now, s.device, country(c)),
    ];
    // o código só fica gasto quando abre de verdade: errar a senha depois dele não o queima
    if (recovered) statements.push({ sql: "UPDATE cofre_envelopes SET usado_em = ? WHERE usuario_id = ? AND tipo = 'recuperacao'", params: [now.toISOString(), s.userId] });
    // a pimenta foi trocada (16.2): a prova que acabou de conferir passa para a versão nova
    const pepper = currentPepper(deps.secrets);
    if (vault.auth_pimenta < pepper.version) {
      const fresh = await proofHash(deps, 'auth', kAuth);
      statements.push({ sql: 'UPDATE cofre_contas SET auth_hash = ?, auth_pimenta = ? WHERE usuario_id = ?', params: [fresh.hash, fresh.version, s.userId] });
    }
    await write(deps, statements, 14, { session: true });
    return c.json({
      token,
      expiraEm: new Date(now.getTime() + VAULT_MAX_MS).toISOString(),
      paradaMaxima: VAULT_IDLE_MS / 1000,
      v: base64url(blob(vault.v)),
      manifesto: base64url(blob(vault.manifesto)),
      contador: vault.contador,
      recuperada: recovered,
    });
  });

  // O `sendBeacon` não manda cabeçalho: o token pode vir no corpo. Responde sempre igual, com sessão ou
  // sem, e pede ao navegador para apagar o que tiver guardado desta origem (7.3).
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
    c.header('Clear-Site-Data', '"cache", "storage"');
    return c.json({ trancado: true });
  });
}
