import { Bytes, fromBase64url } from '../domain/bytes';
import { consumeChallenge } from '../domain/challenge';
import { sealServerSecret } from '../domain/proofs';
import { VerifiedRegistration, WebAuthnError, verifyRegistration } from '../domain/webauthn';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';

/**
 * As conferências do que a página manda ao criar e ao gerenciar o cofre. O servidor não sabe nada dos
 * segredos: confere só o que dá para conferir de fora, os tamanhos exatos da versão 1 da cripto
 * (`projects/cofre/src/core/crypto.ts`), os parâmetros do Argon2id e as passkeys.
 */

/** [versão][IV 12][cifrado][etiqueta 16]: o que a versão 1 soma a todo selado. */
export const SEALED_OVERHEAD = 1 + 12 + 16;
export const KEY = 32;
/** Um selado de uma chave de 32 bytes (os envelopes e V). */
export const SEALED_KEY = SEALED_OVERHEAD + KEY;
export const BLOCK = 512;
export const MANIFEST_MAX = 160 * 1024 + SEALED_OVERHEAD;
const KDF_MIN = { m: 64 * 1024, t: 3, p: 1 };
const KDF_MAX = { m: 1024 * 1024, t: 16, p: 4 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const invalid = (message: string) => new HttpError(400, 'pedido-invalido', message);

/** Um campo em base64url com o tamanho que a versão 1 exige. */
export function bytesField(value: unknown, what: string, ok: (n: number) => boolean): Bytes {
  const bytes = typeof value === 'string' && value.length <= 300_000 ? fromBase64url(value) : null;
  if (!bytes || !ok(bytes.length)) throw invalid(`${what}: formato ou tamanho errado.`);
  return bytes;
}

export const exactly = (n: number) => (len: number) => len === n;
export const manifestSize = (n: number) => n >= SEALED_OVERHEAD + BLOCK && n <= MANIFEST_MAX && (n - SEALED_OVERHEAD) % BLOCK === 0;

export function uuidField(value: unknown, what: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid(`${what}: id inválido.`);
  return value;
}

/** A versão da cripto e os parâmetros do Argon2id, com o mesmo mínimo que o navegador impõe (6.4). */
export function kdfField(body: Record<string, unknown>): { m: number; t: number; p: number } {
  if (body['versao'] !== 1) throw invalid('Versão da cripto desconhecida.');
  const kdf = body['kdf'] as Record<string, unknown> | undefined;
  const [m, t, p] = [kdf?.['m'], kdf?.['t'], kdf?.['p']];
  if (![m, t, p].every((n) => Number.isSafeInteger(n))) throw invalid('Parâmetros do Argon2id inválidos.');
  const k = { m: m as number, t: t as number, p: p as number };
  if (k.m < KDF_MIN.m || k.t < KDF_MIN.t || k.p < KDF_MIN.p) throw invalid('Parâmetros do Argon2id abaixo do mínimo.');
  if (k.m > KDF_MAX.m || k.t > KDF_MAX.t || k.p > KDF_MAX.p) throw invalid('Parâmetros do Argon2id acima do máximo.');
  return k;
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

/** Um aparelho como a página manda: a passkey registrada, o apelido e o envelope dele. */
export interface DeviceInput {
  challengeId: unknown;
  credential: { id: string; clientDataJSON: string; attestationObject: string };
  transports: string;
  nickname: string;
  prf: boolean;
  envelopeId: string;
  envelope: Bytes;
  /** No modo servidor, o S_i do aparelho (o navegador o sorteou; o servidor guarda cifrado). */
  serverSecret: Bytes | null;
}

export function deviceField(raw: unknown, what: string): DeviceInput {
  const d = (raw ?? {}) as Record<string, unknown>;
  const prf = d['prf'];
  if (typeof prf !== 'boolean') throw invalid(`${what}: diga se ele tem PRF.`);
  // com PRF, o segredo do aparelho nunca sai dele: um S_i junto é erro, não algo a ignorar
  if (prf && d['s'] !== undefined) throw invalid(`${what}: com PRF, o servidor não recebe segredo.`);
  const credential = (d['credencial'] ?? {}) as Record<string, unknown>;
  return {
    challengeId: d['desafio'],
    credential: { id: credential['id'] as string, clientDataJSON: credential['clientDataJSON'] as string, attestationObject: credential['attestationObject'] as string },
    transports: transportsField(credential['transports']),
    nickname: nicknameField(d['apelido']),
    prf,
    envelopeId: uuidField(d['envelopeId'], what),
    envelope: bytesField(d['envelope'], `envelope (${what})`, exactly(SEALED_KEY)),
    serverSecret: prf ? null : bytesField(d['s'], `segredo (${what})`, exactly(KEY)),
  };
}

/**
 * Confere cada passkey contra o desafio dela (que sai do banco antes: uso único, mesmo se der errado), e
 * que nenhuma se repete nem já existe.
 */
export async function verifyDevices(deps: Deps, userId: string, devices: DeviceInput[]): Promise<VerifiedRegistration[]> {
  const verified: VerifiedRegistration[] = [];
  for (const d of devices) {
    const challenge = await consumeChallenge(deps, d.challengeId, userId, 'registro');
    try {
      verified.push(await verifyRegistration(d.credential, { challenge, origin: deps.config.origin, rpId: deps.config.rpId }));
    } catch (e) {
      if (e instanceof WebAuthnError) throw new HttpError(400, 'passkey-invalida', `A passkey não foi aceita (${e.message}).`);
      throw e;
    }
  }
  const ids = verified.map((r) => r.credentialId);
  if (new Set(ids).size !== ids.length) throw new HttpError(409, 'passkey-repetida', 'O mesmo aparelho foi registrado duas vezes.');
  for (const id of ids) {
    if (await deps.db.first('SELECT 1 FROM cofre_credenciais WHERE id = ?', [id])) throw new HttpError(409, 'passkey-repetida', 'Esta passkey já está registrada.');
  }
  for (const d of devices) {
    if (await deps.db.first('SELECT 1 FROM cofre_envelopes WHERE id = ?', [d.envelopeId])) throw invalid('Envelope com um id que já existe.');
  }
  return verified;
}

/** As gravações de um aparelho: a passkey e o envelope (o S_i cifrado, no modo servidor). Contam 8 linhas. */
export async function deviceStatements(deps: Deps, userId: string, d: DeviceInput, r: VerifiedRegistration, at: string): Promise<Statement[]> {
  const sealed = d.serverSecret ? await sealServerSecret(deps, userId, d.envelopeId, d.serverSecret) : null;
  return [
    {
      sql: 'INSERT INTO cofre_credenciais (id, usuario_id, chave_publica, algoritmo, contador_assinatura, prf, apelido, transportes, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [r.credentialId, userId, r.publicKey, r.algorithm, r.signCount, d.prf ? 1 : 0, d.nickname, d.transports, at],
    },
    {
      sql: 'INSERT INTO cofre_envelopes (id, usuario_id, tipo, credencial_id, envelope, s_cifrado, s_versao, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [d.envelopeId, userId, d.prf ? 'prf' : 'servidor', r.credentialId, d.envelope, sealed?.sealed ?? null, sealed?.version ?? null, at],
    },
  ];
}
