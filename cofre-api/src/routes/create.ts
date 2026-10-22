import { Hono } from 'hono';
import { LIMITS, accountKey, assertUnderLimit, brakeStatement } from '../domain/brake';
import { base64url, blob } from '../domain/bytes';
import { newChallenge } from '../domain/challenge';
import { eventStatement } from '../domain/events';
import { derivedUserHandle, proofHash } from '../domain/proofs';
import { write } from '../domain/quota';
import { authenticate } from '../domain/session';
import { ES256, RS256 } from '../domain/webauthn';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { KEY, SEALED_KEY, bytesField, deviceField, deviceStatements, exactly, invalid, kdfField, manifestSize, uuidField, verifyDevices } from './fields';
import { country, readJson } from './http';

/**
 * Criar o cofre (8.3): `POST /api/cofre/registro` dá o desafio para registrar uma passkey, e
 * `POST /api/cofre` recebe tudo o que o navegador montou e guarda de uma vez.
 *
 * O servidor confere o que pode conferir sem saber nada dos segredos: os tamanhos exatos de cada
 * selado (a cripto da versão 1, `projects/cofre/src/core/crypto.ts`), os parâmetros do Argon2id
 * (o mesmo mínimo que o navegador impõe), e a assinatura de cada passkey contra o desafio dela.
 */

/** Na criação, um ou dois aparelhos (decisão 4); os outros entram depois, em Ajustes. */
const MAX_DEVICES_AT_CREATION = 2;

export function createRoutes(app: Hono, deps: Deps): void {
  const { config } = deps;

  app.post('/api/cofre/registro', async (c) => {
    const s = await authenticate(deps, c.req.header('Authorization'), ['entrada', 'cofre']);
    await assertUnderLimit(deps, accountKey(s.userId), 'desafio', LIMITS.desafio.account);
    const now = deps.now();
    const account = await deps.db.first<{ usuario_passkey: Uint8Array | ArrayBuffer | number[] }>('SELECT usuario_passkey FROM cofre_contas WHERE usuario_id = ?', [s.userId]);
    const handle = account ? blob(account.usuario_passkey) : await derivedUserHandle(deps, s.userId);
    const existing = await deps.db.all<{ id: string; transportes: string }>('SELECT id, transportes FROM cofre_credenciais WHERE usuario_id = ?', [s.userId]);
    const { id, challenge, statements } = newChallenge(s.userId, 'registro', now);
    await write(deps, [brakeStatement(accountKey(s.userId), 'desafio', now), ...statements], 6);
    const name = `Cofre do Murall (${s.code.slice(0, 4)}-${s.code.slice(4)})`;
    return c.json({
      desafio: id,
      publicKey: {
        challenge: base64url(challenge),
        rp: { id: config.rpId, name: 'Murall Cofre' },
        user: { id: base64url(handle), name, displayName: name },
        pubKeyCredParams: [
          { type: 'public-key', alg: ES256 },
          { type: 'public-key', alg: RS256 },
        ],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        attestation: 'none',
        timeout: 120_000,
        // não registra o mesmo aparelho duas vezes
        excludeCredentials: existing.map((e) => ({ type: 'public-key', id: e.id, ...(e.transportes ? { transports: e.transportes.split(',') } : {}) })),
      },
    });
  });

  app.post('/api/cofre', async (c) => {
    const s = await authenticate(deps, c.req.header('Authorization'), ['entrada']);
    const body = await readJson(c);
    if (await deps.db.first('SELECT 1 FROM cofre_contas WHERE usuario_id = ?', [s.userId])) {
      throw new HttpError(409, 'cofre-existe', 'Esta conta já tem um cofre.');
    }

    // a cripto: a versão e os parâmetros do Argon2id, com o mesmo mínimo que o navegador impõe
    const { m, t, p } = kdfField(body);
    const salt = bytesField(body['sal'], 'sal', exactly(16));
    const v = bytesField(body['v'], 'V', exactly(SEALED_KEY));
    const kAuth = bytesField(body['kAuth'], 'prova da senha', exactly(KEY));
    const manifest = bytesField(body['manifesto'], 'manifesto', manifestSize);

    const recovery = body['recuperacao'] as Record<string, unknown> | undefined;
    const recoveryId = uuidField(recovery?.['id'], 'envelope do código');
    const recoveryEnvelope = bytesField(recovery?.['envelope'], 'envelope do código', exactly(SEALED_KEY));
    const kRec = bytesField(recovery?.['kRec'], 'prova do código', exactly(KEY));

    const devices = body['aparelhos'];
    if (!Array.isArray(devices) || devices.length < 1 || devices.length > MAX_DEVICES_AT_CREATION) throw invalid('Registre um ou dois aparelhos.');
    const parsed = devices.map((raw, i) => deviceField(raw, `aparelho ${i + 1}`));
    const envelopeIds = [recoveryId, ...parsed.map((d) => d.envelopeId)];
    if (new Set(envelopeIds).size !== envelopeIds.length) throw invalid('Envelopes com o mesmo id.');

    // cada passkey contra o seu desafio (que sai do banco agora: uso único, mesmo se der errado)
    const verified = await verifyDevices(deps, s.userId, parsed);

    const now = deps.now();
    const at = now.toISOString();
    const auth = await proofHash(deps, 'auth', kAuth);
    const rec = await proofHash(deps, 'rec', kRec);
    const handle = await derivedUserHandle(deps, s.userId);
    const statements: Statement[] = [
      {
        sql:
          'INSERT INTO cofre_contas (usuario_id, versao_cripto, kdf_m, kdf_t, kdf_p, sal, v, auth_hash, auth_pimenta, manifesto, contador, usuario_passkey, criado_em, mudado_em) ' +
          'VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
        params: [s.userId, m, t, p, salt, v, auth.hash, auth.version, manifest, handle, at, at],
      },
      {
        sql: "INSERT INTO cofre_envelopes (id, usuario_id, tipo, envelope, rec_hash, rec_pimenta, criado_em) VALUES (?, ?, 'recuperacao', ?, ?, ?, ?)",
        params: [recoveryId, s.userId, recoveryEnvelope, rec.hash, rec.version, at],
      },
    ];
    for (const [i, d] of parsed.entries()) statements.push(...(await deviceStatements(deps, s.userId, d, verified[i]!, at)));
    statements.push(eventStatement(s.userId, 'cofre-criado', now, s.device, country(c)));
    // a entrada de criar (20 minutos) não serve para mais nada: abrir pede uma entrada nova, de 5
    statements.push({ sql: 'DELETE FROM cofre_sessoes WHERE hash = ?', params: [s.hash] });
    try {
      await write(deps, statements, 5 + parsed.length * 8 + 8);
    } catch (error) {
      // dois "criar" ao mesmo tempo: o outro chegou antes
      if (!(error instanceof HttpError) && (await deps.db.first('SELECT 1 FROM cofre_contas WHERE usuario_id = ?', [s.userId]))) {
        throw new HttpError(409, 'cofre-existe', 'Esta conta já tem um cofre.');
      }
      throw error;
    }
    return c.json({ criado: true, aparelhos: parsed.map((d, i) => ({ id: verified[i]!.credentialId, apelido: d.nickname, prf: d.prf })) }, 201);
  });
}
