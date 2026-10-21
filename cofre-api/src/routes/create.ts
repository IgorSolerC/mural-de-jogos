import { Hono } from 'hono';
import { LIMITS, accountKey, assertUnderLimit, brakeStatement } from '../domain/brake';
import { Bytes, base64url, blob, fromBase64url } from '../domain/bytes';
import { consumeChallenge, newChallenge } from '../domain/challenge';
import { eventStatement } from '../domain/events';
import { derivedUserHandle, proofHash, sealServerSecret } from '../domain/proofs';
import { write } from '../domain/quota';
import { authenticate } from '../domain/session';
import { ES256, RS256, VerifiedRegistration, WebAuthnError, verifyRegistration } from '../domain/webauthn';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { country, readJson } from './http';

/**
 * Criar o cofre (8.3): `POST /api/cofre/registro` dá o desafio para registrar uma passkey, e
 * `POST /api/cofre` recebe tudo o que o navegador montou e guarda de uma vez.
 *
 * O servidor confere o que pode conferir sem saber nada dos segredos: os tamanhos exatos de cada
 * selado (a cripto da versão 1, `projects/cofre/src/core/crypto.ts`), os parâmetros do Argon2id
 * (o mesmo mínimo que o navegador impõe), e a assinatura de cada passkey contra o desafio dela.
 */

/** O que a versão 1 da cripto produz (ver `crypto.ts` da página): [versão][IV 12][cifrado][etiqueta 16]. */
const SEALED_OVERHEAD = 1 + 12 + 16;
const KEY = 32;
const SEALED_KEY = SEALED_OVERHEAD + KEY;
const BLOCK = 512;
const MANIFEST_MAX = 160 * 1024 + SEALED_OVERHEAD;
const KDF_MIN = { m: 64 * 1024, t: 3, p: 1 };
const KDF_MAX = { m: 1024 * 1024, t: 16, p: 4 };
/** Na criação, um ou dois aparelhos (decisão 4); os outros entram depois, em Ajustes. */
const MAX_DEVICES_AT_CREATION = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const invalid = (message: string) => new HttpError(400, 'pedido-invalido', message);

/** Um campo em base64url com o tamanho que a versão 1 exige. */
function bytesField(value: unknown, what: string, ok: (n: number) => boolean): Bytes {
  const bytes = typeof value === 'string' && value.length <= 300_000 ? fromBase64url(value) : null;
  if (!bytes || !ok(bytes.length)) throw invalid(`${what}: formato ou tamanho errado.`);
  return bytes;
}

const exactly = (n: number) => (len: number) => len === n;

function uuidField(value: unknown, what: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid(`${what}: id inválido.`);
  return value;
}

/** O apelido do aparelho ("Celular", "PC"), como a pessoa escreveu, curto e sem símbolo estranho. */
function nicknameField(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/[^\p{L}\p{N} .()'-]/gu, '').trim().slice(0, 40) : '';
  if (!text) throw invalid('Dê um nome ao aparelho.');
  return text;
}

function transportsField(value: unknown): string {
  if (!Array.isArray(value)) return '';
  const known = ['usb', 'nfc', 'ble', 'smart-card', 'hybrid', 'internal'];
  return [...new Set(value.filter((t): t is string => typeof t === 'string' && known.includes(t)))].join(',');
}


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
    if (body['versao'] !== 1) throw invalid('Versão da cripto desconhecida.');
    const kdf = body['kdf'] as Record<string, unknown> | undefined;
    const [m, t, p] = [kdf?.['m'], kdf?.['t'], kdf?.['p']];
    if (![m, t, p].every((n) => Number.isSafeInteger(n))) throw invalid('Parâmetros do Argon2id inválidos.');
    if ((m as number) < KDF_MIN.m || (t as number) < KDF_MIN.t || (p as number) < KDF_MIN.p) throw invalid('Parâmetros do Argon2id abaixo do mínimo.');
    if ((m as number) > KDF_MAX.m || (t as number) > KDF_MAX.t || (p as number) > KDF_MAX.p) throw invalid('Parâmetros do Argon2id acima do máximo.');
    const salt = bytesField(body['sal'], 'sal', exactly(16));
    const v = bytesField(body['v'], 'V', exactly(SEALED_KEY));
    const kAuth = bytesField(body['kAuth'], 'prova da senha', exactly(KEY));
    const manifest = bytesField(body['manifesto'], 'manifesto', (n) => n >= SEALED_OVERHEAD + BLOCK && n <= MANIFEST_MAX && (n - SEALED_OVERHEAD) % BLOCK === 0);

    const recovery = body['recuperacao'] as Record<string, unknown> | undefined;
    const recoveryId = uuidField(recovery?.['id'], 'envelope do código');
    const recoveryEnvelope = bytesField(recovery?.['envelope'], 'envelope do código', exactly(SEALED_KEY));
    const kRec = bytesField(recovery?.['kRec'], 'prova do código', exactly(KEY));

    const devices = body['aparelhos'];
    if (!Array.isArray(devices) || devices.length < 1 || devices.length > MAX_DEVICES_AT_CREATION) throw invalid('Registre um ou dois aparelhos.');
    const parsed = devices.map((raw, i) => {
      const d = (raw ?? {}) as Record<string, unknown>;
      const prf = d['prf'];
      if (typeof prf !== 'boolean') throw invalid(`Aparelho ${i + 1}: diga se ele tem PRF.`);
      // com PRF, o segredo do aparelho nunca sai dele: um S_i junto é erro, não algo a ignorar
      if (prf && d['s'] !== undefined) throw invalid(`Aparelho ${i + 1}: com PRF, o servidor não recebe segredo.`);
      const credential = (d['credencial'] ?? {}) as Record<string, unknown>;
      return {
        challengeId: d['desafio'],
        credential: { id: credential['id'] as string, clientDataJSON: credential['clientDataJSON'] as string, attestationObject: credential['attestationObject'] as string },
        transports: transportsField(credential['transports']),
        nickname: nicknameField(d['apelido']),
        prf,
        envelopeId: uuidField(d['envelopeId'], `aparelho ${i + 1}`),
        envelope: bytesField(d['envelope'], `envelope do aparelho ${i + 1}`, exactly(SEALED_KEY)),
        // no modo servidor, o S_i do aparelho (o navegador o sorteou; o servidor guarda cifrado)
        serverSecret: prf ? null : bytesField(d['s'], `segredo do aparelho ${i + 1}`, exactly(KEY)),
      };
    });
    const envelopeIds = [recoveryId, ...parsed.map((d) => d.envelopeId)];
    if (new Set(envelopeIds).size !== envelopeIds.length) throw invalid('Envelopes com o mesmo id.');

    // cada passkey contra o seu desafio (que sai do banco agora: uso único, mesmo se der errado)
    const verified: VerifiedRegistration[] = [];
    for (const d of parsed) {
      const challenge = await consumeChallenge(deps, d.challengeId, s.userId, 'registro');
      try {
        verified.push(await verifyRegistration(d.credential, { challenge, origin: config.origin, rpId: config.rpId }));
      } catch (e) {
        if (e instanceof WebAuthnError) throw new HttpError(400, 'passkey-invalida', `A passkey não foi aceita (${e.message}).`);
        throw e;
      }
    }
    const credentialIds = verified.map((r) => r.credentialId);
    if (new Set(credentialIds).size !== credentialIds.length) throw new HttpError(409, 'passkey-repetida', 'O mesmo aparelho foi registrado duas vezes.');
    for (const id of credentialIds) {
      if (await deps.db.first('SELECT 1 FROM cofre_credenciais WHERE id = ?', [id])) throw new HttpError(409, 'passkey-repetida', 'Esta passkey já está registrada.');
    }

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
        params: [s.userId, m as number, t as number, p as number, salt, v, auth.hash, auth.version, manifest, handle, at, at],
      },
      {
        sql: "INSERT INTO cofre_envelopes (id, usuario_id, tipo, envelope, rec_hash, rec_pimenta, criado_em) VALUES (?, ?, 'recuperacao', ?, ?, ?, ?)",
        params: [recoveryId, s.userId, recoveryEnvelope, rec.hash, rec.version, at],
      },
    ];
    for (const [i, d] of parsed.entries()) {
      const r = verified[i]!;
      statements.push({
        sql: 'INSERT INTO cofre_credenciais (id, usuario_id, chave_publica, algoritmo, contador_assinatura, prf, apelido, transportes, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [r.credentialId, s.userId, r.publicKey, r.algorithm, r.signCount, d.prf ? 1 : 0, d.nickname, d.transports, at],
      });
      const sealed = d.serverSecret ? await sealServerSecret(deps, s.userId, d.envelopeId, d.serverSecret) : null;
      statements.push({
        sql: 'INSERT INTO cofre_envelopes (id, usuario_id, tipo, credencial_id, envelope, s_cifrado, s_versao, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        params: [d.envelopeId, s.userId, d.prf ? 'prf' : 'servidor', r.credentialId, d.envelope, sealed?.sealed ?? null, sealed?.version ?? null, at],
      });
    }
    statements.push(eventStatement(s.userId, 'cofre-criado', now, s.device, country(c)));
    try {
      await write(deps, statements, 4 + parsed.length * 8 + 8);
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
