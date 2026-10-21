/**
 * A conferência das passkeys no servidor (WebAuthn nível 3, seções 7.1 e 7.2), escrita aqui em vez de
 * vir de uma biblioteca: o cofre pede `attestation: 'none'`, então não confere atestado de fabricante
 * (o que traria X.509 e ASN.1 e quase todas as dependências de uma biblioteca), só o que importa:
 *
 * - o `clientDataJSON`: o tipo, o desafio de uso único e a origem exata do cofre;
 * - os dados do autenticador: o hash do rpId, presença e verificação do usuário (biometria ou PIN) e
 *   o contador;
 * - no registro, a chave pública (COSE): ES256 (P-256) ou RS256 (2048 bits ou mais), nada mais;
 * - na abertura, a assinatura sobre `authenticatorData ‖ SHA-256(clientDataJSON)`, com o WebCrypto.
 *
 * Tudo o que vem do navegador chega em base64url e passa pelo leitor rígido (`fromBase64url`). Um erro
 * aqui nunca abre o cofre sozinho: a passkey é um dos três fatores e, com PRF, também entra na chave
 * (PLANO-COFRE.md, seção 5). Mesmo assim, cada passo tem o seu teste de ataque.
 *
 * MUDAR ESTE ARQUIVO SÓ COM TESTE NOVO (seção 14 do plano).
 */
import { CborError, CborValue, decodeCbor, decodeCborAll } from './cbor';
import { Bytes, base64url, fromBase64url, sha256, utf8 } from './bytes';

export const ES256 = -7;
export const RS256 = -257;
export type Algorithm = typeof ES256 | typeof RS256;

/** As flags dos dados do autenticador. */
const UP = 0x01;
const UV = 0x04;
const BE = 0x08;
const BS = 0x10;
const AT = 0x40;
const ED = 0x80;

export type WebAuthnReason =
  | 'formato'
  | 'tipo'
  | 'desafio'
  | 'origem'
  | 'rp'
  | 'presenca'
  | 'verificacao'
  | 'chave'
  | 'credencial'
  | 'assinatura'
  | 'contador';

export class WebAuthnError extends Error {
  constructor(
    readonly reason: WebAuthnReason,
    message: string,
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

const fail = (reason: WebAuthnReason, message: string): never => {
  throw new WebAuthnError(reason, message);
};

export interface Expected {
  /** O desafio que o servidor deu (os bytes), já tirado do banco (uso único). */
  challenge: Uint8Array;
  /** A origem exata do cofre (`https://cofre.murall.igorsc.com.br`). */
  origin: string;
  /** O rpId (o host do cofre). */
  rpId: string;
}

export interface RegistrationInput {
  /** O id da credencial, como o navegador deu (`rawId`, em base64url). */
  id: string;
  clientDataJSON: string;
  attestationObject: string;
}

export interface VerifiedRegistration {
  credentialId: string;
  /** A chave pública em COSE, como veio (para guardar e conferir as assinaturas depois). */
  publicKey: Bytes;
  algorithm: Algorithm;
  signCount: number;
  /** A passkey pode ser copiada para outros aparelhos (sincronizada no iCloud ou no Google)? */
  backupEligible: boolean;
}

export interface AssertionInput {
  id: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}

const b64 = (text: unknown, what: string, max = 4096): Bytes => {
  if (typeof text !== 'string' || text.length > max) return fail('formato', `${what}: formato inválido`);
  return fromBase64url(text) ?? fail('formato', `${what}: base64url inválido`);
};

/** 7.1 passos 5 a 12 e 7.2 passos 10 a 14: o que o navegador diz que assinou. */
async function checkClientData(raw: Bytes, type: 'webauthn.create' | 'webauthn.get', expected: Expected): Promise<void> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(raw)) as Record<string, unknown>;
  } catch {
    return fail('formato', 'clientDataJSON ilegível');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('formato', 'clientDataJSON ilegível');
  if (data['type'] !== type) fail('tipo', 'tipo de operação errado');
  if (data['challenge'] !== base64url(expected.challenge)) fail('desafio', 'desafio errado');
  if (data['origin'] !== expected.origin) fail('origem', 'origem errada');
  // dentro de um iframe de outra origem: o cofre nunca é emoldurado
  if (data['crossOrigin'] === true || data['topOrigin'] !== undefined) fail('origem', 'pedido de dentro de outra página');
}

interface AuthData {
  flags: number;
  signCount: number;
  /** Só no registro (flag AT). */
  credentialId?: Bytes;
  publicKey?: Bytes;
}

/** Os dados do autenticador (6.1): rpIdHash, flags, contador e, no registro, a credencial. */
async function parseAuthData(raw: Bytes, expected: Expected, registration: boolean): Promise<AuthData> {
  if (raw.length < 37) fail('formato', 'dados do autenticador curtos');
  const rpIdHash = await sha256(utf8(expected.rpId));
  if (!equal(raw.subarray(0, 32), rpIdHash)) fail('rp', 'rpId errado');
  const flags = raw[32]!;
  if (!(flags & UP)) fail('presenca', 'sem a presença do usuário');
  if (!(flags & UV)) fail('verificacao', 'sem a verificação do usuário (biometria ou PIN)');
  // "pode ser copiada" desligado com "foi copiada" ligado é impossível (6.1.3)
  if (!(flags & BE) && flags & BS) fail('formato', 'flags de cópia incoerentes');
  const signCount = new DataView(raw.buffer, raw.byteOffset + 33, 4).getUint32(0);
  let pos = 37;
  const out: AuthData = { flags, signCount };
  if (registration) {
    if (!(flags & AT)) fail('formato', 'registro sem a credencial');
    if (raw.length < pos + 18) fail('formato', 'credencial curta');
    pos += 16; // o AAGUID (com atestado "none", não diz nada que o cofre use)
    const idLength = (raw[pos]! << 8) | raw[pos + 1]!;
    pos += 2;
    if (idLength < 16 || idLength > 1023 || raw.length < pos + idLength) fail('formato', 'id da credencial inválido');
    out.credentialId = raw.slice(pos, pos + idLength);
    pos += idLength;
    try {
      const { end } = decodeCbor(raw, pos);
      out.publicKey = raw.slice(pos, end);
      pos = end;
    } catch (e) {
      fail('chave', e instanceof CborError ? e.message : 'chave pública ilegível');
    }
  } else if (flags & AT) {
    fail('formato', 'abertura com credencial nova');
  }
  if (flags & ED) {
    try {
      pos = decodeCbor(raw, pos).end;
    } catch {
      fail('formato', 'extensões ilegíveis');
    }
  }
  if (pos !== raw.length) fail('formato', 'sobraram bytes nos dados do autenticador');
  return out;
}

/** A chave COSE (RFC 9053) como chave do WebCrypto, só ES256/P-256 e RS256 com 2048 bits ou mais. */
export async function importCoseKey(cose: Uint8Array): Promise<{ key: CryptoKey; algorithm: Algorithm }> {
  let map: CborValue;
  try {
    map = decodeCborAll(cose);
  } catch {
    return fail('chave', 'chave pública ilegível');
  }
  if (!(map instanceof Map)) return fail('chave', 'chave pública não é um mapa');
  const kty = map.get(1);
  const alg = map.get(3);
  const bytesOf = (label: number): Uint8Array => {
    const v = map.get(label);
    return v instanceof Uint8Array ? v : fail('chave', 'parâmetro da chave faltando');
  };
  try {
    if (kty === 2 && alg === ES256) {
      if (map.get(-1) !== 1) fail('chave', 'curva não aceita');
      const x = bytesOf(-2);
      const y = bytesOf(-3);
      if (x.length !== 32 || y.length !== 32) fail('chave', 'ponto da curva com tamanho errado');
      const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: base64url(x), y: base64url(y) }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return { key, algorithm: ES256 };
    }
    if (kty === 3 && alg === RS256) {
      const n = bytesOf(-1);
      const e = bytesOf(-2);
      if (n.length < 256 || n.length > 512 || n[0] === 0 || e.length < 1 || e.length > 4) fail('chave', 'chave RSA fora do tamanho');
      const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: base64url(n), e: base64url(e), alg: 'RS256' }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      return { key, algorithm: RS256 };
    }
  } catch (e) {
    if (e instanceof WebAuthnError) throw e;
    return fail('chave', 'chave pública inválida');
  }
  return fail('chave', 'algoritmo não aceito (só ES256 e RS256)');
}

/**
 * Confere um registro (7.1). O desafio já foi tirado do banco por quem chama (uso único). Com
 * atestado "none", o `attStmt` não é lido: o cofre não confia em fabricante nenhum, só na assinatura
 * que a passkey fizer depois.
 */
export async function verifyRegistration(input: RegistrationInput, expected: Expected): Promise<VerifiedRegistration> {
  const clientData = b64(input.clientDataJSON, 'clientDataJSON');
  const attestation = b64(input.attestationObject, 'attestationObject', 16_384);
  const id = b64(input.id, 'id da credencial');
  await checkClientData(clientData, 'webauthn.create', expected);
  let object: CborValue;
  try {
    object = decodeCborAll(attestation);
  } catch {
    return fail('formato', 'attestationObject ilegível');
  }
  if (!(object instanceof Map) || typeof object.get('fmt') !== 'string' || !(object.get('attStmt') instanceof Map)) fail('formato', 'attestationObject incompleto');
  const authDataRaw = (object as Map<CborValue, CborValue>).get('authData');
  if (!(authDataRaw instanceof Uint8Array)) return fail('formato', 'attestationObject sem os dados do autenticador');
  const authData = await parseAuthData(authDataRaw as Bytes, expected, true);
  if (!equal(authData.credentialId!, id)) fail('credencial', 'o id da credencial não bate');
  const { algorithm } = await importCoseKey(authData.publicKey!);
  return {
    credentialId: base64url(authData.credentialId!),
    publicKey: authData.publicKey!,
    algorithm,
    signCount: authData.signCount,
    backupEligible: (authData.flags & BE) !== 0,
  };
}

/**
 * Confere uma assinatura (7.2) com a chave guardada no registro. Devolve o contador novo. Contador que
 * não sobe (com algum dos dois diferente de zero) é sinal de passkey clonada: recusado.
 */
export async function verifyAssertion(
  input: AssertionInput,
  expected: Expected & { credentialId: string; publicKey: Uint8Array; storedSignCount: number },
): Promise<{ signCount: number }> {
  if (input.id !== expected.credentialId) fail('credencial', 'outra passkey');
  const clientData = b64(input.clientDataJSON, 'clientDataJSON');
  const authDataRaw = b64(input.authenticatorData, 'authenticatorData');
  const signature = b64(input.signature, 'assinatura');
  await checkClientData(clientData, 'webauthn.get', expected);
  const authData = await parseAuthData(authDataRaw, expected, false);
  const { key, algorithm } = await importCoseKey(expected.publicKey);
  const signed = concat(authDataRaw, await sha256(clientData));
  const ok =
    algorithm === ES256
      ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(signature), signed)
      : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
  if (!ok) fail('assinatura', 'assinatura inválida');
  if ((authData.signCount !== 0 || expected.storedSignCount !== 0) && authData.signCount <= expected.storedSignCount) {
    fail('contador', 'o contador da passkey voltou (pode ser uma cópia)');
  }
  return { signCount: authData.signCount };
}

/**
 * A assinatura ECDSA vem em DER (`SEQUENCE { INTEGER r, INTEGER s }`); o WebCrypto quer r ‖ s, 32
 * bytes cada. Leitura estrita: tamanhos curtos, inteiros positivos na forma mínima, nada sobrando.
 */
export function derToRaw(der: Uint8Array): Bytes {
  const bad = (): never => fail('assinatura', 'assinatura ECDSA mal formada');
  if (der.length < 8 || der.length > 72 || der[0] !== 0x30 || der[1] !== der.length - 2) bad();
  let pos = 2;
  const out = new Uint8Array(64);
  for (const at of [0, 32]) {
    if (der[pos] !== 0x02) bad();
    const n = der[pos + 1]!;
    pos += 2;
    if (n < 1 || n > 33 || pos + n > der.length) bad();
    let int = der.subarray(pos, pos + n);
    pos += n;
    // positivo e mínimo: o zero da frente só quando o bit de cima do próximo byte está ligado
    if (int[0]! & 0x80) bad();
    if (int.length > 1 && int[0] === 0 && !(int[1]! & 0x80)) bad();
    if (int[0] === 0 && int.length > 1) int = int.subarray(1);
    if (int.length > 32) bad();
    out.set(int, at + 32 - int.length);
  }
  if (pos !== der.length) bad();
  return out;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function concat(a: Uint8Array, b: Uint8Array): Bytes {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
