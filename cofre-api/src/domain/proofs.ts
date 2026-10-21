import { Deps } from '../ports';
import { currentEnvelopeKey, currentPepper } from '../secrets';
import { Bytes, hmac, utf8 } from './bytes';

/**
 * O que o servidor guarda no lugar dos segredos (seção 6.5 do plano). Nada daqui abre o cofre: as
 * provas são HMAC com a pimenta (um secret fora do banco), e o S_i dos aparelhos sem PRF vai cifrado com
 * a chave dos envelopes (outro secret). Quem levar só o banco não tem nem as provas nem os S_i.
 */

/** O rótulo de cada prova, para uma nunca servir no lugar da outra. */
export type ProofKind = 'auth' | 'rec';

/** HMAC-SHA256(pimenta, "cofre-v1 <tipo>" ‖ 0 ‖ prova), com a versão da pimenta usada. */
export async function proofHash(deps: Deps, kind: ProofKind, proof: Uint8Array, version?: number): Promise<{ hash: Bytes; version: number }> {
  const pepper = version === undefined ? currentPepper(deps.secrets) : { version, key: deps.secrets.peppers.get(version) };
  if (!pepper.key) throw new Error(`pimenta ${version} não existe`);
  const label = utf8(`cofre-v1 ${kind}\0`);
  const data = new Uint8Array(label.length + proof.length);
  data.set(label);
  data.set(proof, label.length);
  return { hash: await hmac(pepper.key, data), version: pepper.version };
}

/**
 * O `user.id` das passkeys de uma conta que ainda não tem cofre (16.8): 16 bytes derivados da pimenta e
 * do id da conta, iguais para os dois aparelhos da criação e impossíveis de ligar à conta sem a
 * pimenta. Ao criar o cofre, ele fica guardado em `cofre_contas.usuario_passkey`, e trocar a pimenta
 * depois não o muda.
 */
export async function derivedUserHandle(deps: Deps, userId: string): Promise<Bytes> {
  return (await hmac(currentPepper(deps.secrets).key, utf8(`cofre-v1 user.id\0${userId}`))).slice(0, 16);
}

/** O S_i de um aparelho sem PRF, cifrado com a chave dos envelopes: IV ‖ AES-256-GCM, amarrado à conta e ao envelope. */
export async function sealServerSecret(deps: Deps, userId: string, envelopeId: string, secret: Uint8Array): Promise<{ sealed: Bytes; version: number }> {
  const { key, version } = currentEnvelopeKey(deps.secrets);
  const aes = await crypto.subtle.importKey('raw', key as Bytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(`cofre-v1|s|${userId}|${envelopeId}`) }, aes, secret as Bytes),
  );
  const out = new Uint8Array(12 + sealed.length);
  out.set(iv);
  out.set(sealed, 12);
  return { sealed: out, version };
}

/** Abre o S_i guardado (só depois de conferida a assinatura da passkey daquele aparelho). */
export async function openServerSecret(deps: Deps, userId: string, envelopeId: string, sealed: Uint8Array, version: number): Promise<Bytes> {
  const key = deps.secrets.envelopeKeys.get(version);
  if (!key) throw new Error(`chave dos envelopes ${version} não existe`);
  const aes = await crypto.subtle.importKey('raw', key as Bytes, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(0, 12), additionalData: utf8(`cofre-v1|s|${userId}|${envelopeId}`) },
      aes,
      sealed.slice(12) as Bytes,
    ),
  );
}
