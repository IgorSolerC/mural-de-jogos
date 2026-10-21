import { describe, expect, it } from 'vitest';
import { base64url, fromBase64url, utf8 } from '../src/domain/bytes';
import { CborError, decodeCbor, decodeCborAll } from '../src/domain/cbor';
import { AssertionInput, Expected, RegistrationInput, WebAuthnReason, derToRaw, importCoseKey, verifyAssertion, verifyRegistration } from '../src/domain/webauthn';
import { ORIGEM, RP_ID, VETORES } from './webauthn-vetores';

const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);
const REGISTRO: Expected = { challenge: seq(32, 1), origin: ORIGEM, rpId: RP_ID };
const ABRIR_1: Expected = { challenge: seq(32, 33), origin: ORIGEM, rpId: RP_ID };
const ABRIR_2: Expected = { challenge: seq(32, 65), origin: ORIGEM, rpId: RP_ID };

const bytes = (text: string) => fromBase64url(text)!;

/** Espera que a promessa falhe com este motivo. */
async function falha(p: Promise<unknown>, reason: WebAuthnReason): Promise<void> {
  await expect(p).rejects.toMatchObject({ name: 'WebAuthnError', reason });
}

/** O clientDataJSON com campos trocados (no registro ele não é assinado: só as conferências o pegam). */
function comClientData(text: string, mudar: (d: Record<string, unknown>) => void): string {
  const d = JSON.parse(new TextDecoder().decode(bytes(text))) as Record<string, unknown>;
  mudar(d);
  return base64url(utf8(JSON.stringify(d)));
}

/** O attestationObject com um byte dos dados do autenticador trocado (o tamanho não muda). */
function comAuthData(attestationObject: string, pos: number, valor: (b: number) => number): string {
  const att = bytes(attestationObject).slice();
  // os dados do autenticador começam depois da chave "authData" e do cabeçalho da byte string:
  // 0x58 + 1 byte de tamanho (até 255 bytes) ou 0x59 + 2 bytes (o RS256, com a chave maior)
  const marca = utf8('authData');
  let i = 0;
  while (i < att.length && !marca.every((m, j) => att[i + j] === m)) i++;
  const cabecalho = att[i + marca.length] === 0x59 ? 3 : 2;
  const inicio = i + marca.length + cabecalho;
  att[inicio + pos] = valor(att[inicio + pos]!);
  return base64url(att);
}

describe('CBOR (leitor rígido)', () => {
  it('lê o attestationObject real', () => {
    const v = decodeCborAll(bytes(VETORES.es256.reg.attestationObject));
    expect(v).toBeInstanceOf(Map);
    expect((v as Map<unknown, unknown>).get('fmt')).toBe('none');
  });

  it('recusa o que um leitor tolerante deixaria passar', () => {
    const casos: number[][] = [
      [0xa1, 0x01, 0x02, 0x00], // byte sobrando
      [0x5f, 0x41, 0x00, 0xff], // tamanho indefinido
      [0x18, 0x05], // número fora da forma mais curta
      [0xc0, 0x00], // tag
      [0xf9, 0x3c, 0x00], // número com vírgula
      [0xa2, 0x01, 0x00, 0x01, 0x00], // chave repetida
      [0x81, 0x81, 0x81, 0x81, 0x81, 0x00], // fundo demais
      [0x5a, 0xff, 0xff, 0xff, 0xff], // tamanho maior que o dado
      [0x62, 0xc3, 0x28], // texto que não é UTF-8
      [0xa1, 0x41, 0x00, 0x00], // chave de mapa em bytes
      [0x98, 0x41], // lista grande demais (65 itens)
    ];
    for (const c of casos) expect(() => decodeCborAll(Uint8Array.from(c)), c.map((b) => b.toString(16)).join(' ')).toThrow(CborError);
  });

  it('diz onde o item acabou, para ler a chave no meio dos dados', () => {
    expect(decodeCbor(Uint8Array.from([0xff, 0x01, 0x02]), 1)).toEqual({ value: 1, end: 2 });
  });
});

for (const alg of ['es256', 'rs256'] as const) {
  const v = VETORES[alg];
  const reg: RegistrationInput = v.reg;
  const [a1, a2] = v.assinaturas as unknown as [AssertionInput, AssertionInput];

  describe(`registro de passkey ${alg.toUpperCase()}`, () => {
    it('aceita o registro real e devolve a chave pública', async () => {
      const r = await verifyRegistration(reg, REGISTRO);
      expect(r.credentialId).toBe(reg.id);
      expect(r.algorithm).toBe(alg === 'es256' ? -7 : -257);
      expect((await importCoseKey(r.publicKey)).algorithm).toBe(r.algorithm);
    });

    it('recusa desafio errado (reusar um registro velho)', async () => {
      await falha(verifyRegistration(reg, { ...REGISTRO, challenge: seq(32, 2) }), 'desafio');
    });

    it('recusa outra origem (um site falso igual ao cofre)', async () => {
      await falha(verifyRegistration(reg, { ...REGISTRO, origin: 'https://cofre.murall.igorsc.com.br' }), 'origem');
      await falha(verifyRegistration({ ...reg, clientDataJSON: comClientData(reg.clientDataJSON, (d) => (d['origin'] = 'http://localhost:4456')) }, REGISTRO), 'origem');
    });

    it('recusa pedido de dentro de um iframe de outra página', async () => {
      await falha(verifyRegistration({ ...reg, clientDataJSON: comClientData(reg.clientDataJSON, (d) => (d['crossOrigin'] = true)) }, REGISTRO), 'origem');
      await falha(verifyRegistration({ ...reg, clientDataJSON: comClientData(reg.clientDataJSON, (d) => (d['topOrigin'] = 'https://atacante.dev')) }, REGISTRO), 'origem');
    });

    it('recusa outro rpId (passkey de outro site)', async () => {
      await falha(verifyRegistration(reg, { ...REGISTRO, rpId: 'cofre.localhost' }), 'rp');
    });

    it('recusa o tipo trocado (uma abertura no lugar do registro)', async () => {
      await falha(verifyRegistration({ ...reg, clientDataJSON: comClientData(reg.clientDataJSON, (d) => (d['type'] = 'webauthn.get')) }, REGISTRO), 'tipo');
      await falha(verifyRegistration({ ...reg, clientDataJSON: a1.clientDataJSON }, ABRIR_1), 'tipo');
    });

    it('recusa sem a verificação do usuário (sem biometria nem PIN) ou sem a presença', async () => {
      await falha(verifyRegistration({ ...reg, attestationObject: comAuthData(reg.attestationObject, 32, (b) => b & ~0x04) }, REGISTRO), 'verificacao');
      await falha(verifyRegistration({ ...reg, attestationObject: comAuthData(reg.attestationObject, 32, (b) => b & ~0x01) }, REGISTRO), 'presenca');
    });

    it('recusa o id da credencial que não bate com o dos dados do autenticador', async () => {
      await falha(verifyRegistration({ ...reg, id: base64url(seq(32, 9)) }, REGISTRO), 'credencial');
    });

    it('recusa dados cortados, base64 comum e lixo', async () => {
      const att = reg.attestationObject;
      await falha(verifyRegistration({ ...reg, attestationObject: att.slice(0, att.length - 8) }, REGISTRO), 'formato');
      await falha(verifyRegistration({ ...reg, attestationObject: att.replace(/_/g, '/') + '==' }, REGISTRO), 'formato');
      await falha(verifyRegistration({ ...reg, clientDataJSON: base64url(utf8('não é json')) }, REGISTRO), 'formato');
      await falha(verifyRegistration({ ...reg, attestationObject: 123 as unknown as string }, REGISTRO), 'formato');
    });
  });

  describe(`abertura com passkey ${alg.toUpperCase()}`, () => {
    const chave = async () => verifyRegistration(reg, REGISTRO);

    it('aceita as duas assinaturas reais, com o contador subindo', async () => {
      const r = await chave();
      const s1 = await verifyAssertion(a1, { ...ABRIR_1, credentialId: r.credentialId, publicKey: r.publicKey, storedSignCount: r.signCount });
      const s2 = await verifyAssertion(a2, { ...ABRIR_2, credentialId: r.credentialId, publicKey: r.publicKey, storedSignCount: s1.signCount });
      expect(s2.signCount).toBeGreaterThan(s1.signCount);
    });

    it('recusa a assinatura repetida (o contador não subiu: passkey clonada ou resposta gravada)', async () => {
      const r = await chave();
      const s2 = await verifyAssertion(a2, { ...ABRIR_2, credentialId: r.credentialId, publicKey: r.publicKey, storedSignCount: r.signCount });
      await falha(verifyAssertion(a1, { ...ABRIR_1, credentialId: r.credentialId, publicKey: r.publicKey, storedSignCount: s2.signCount }), 'contador');
    });

    it('recusa desafio errado, outra origem e outro rpId', async () => {
      const r = await chave();
      const base = { credentialId: r.credentialId, publicKey: r.publicKey, storedSignCount: r.signCount };
      await falha(verifyAssertion(a1, { ...ABRIR_2, ...base }), 'desafio');
      await falha(verifyAssertion(a1, { ...ABRIR_1, ...base, origin: 'https://cofre.murall.igorsc.com.br' }), 'origem');
      await falha(verifyAssertion(a1, { ...ABRIR_1, ...base, rpId: 'murall.localhost' }), 'rp');
    });

    it('recusa assinatura mexida e dados assinados mexidos', async () => {
      const r = await chave();
      const base = { ...ABRIR_1, credentialId: r.credentialId, publicKey: r.publicKey, storedSignCount: r.signCount };
      const sig = bytes(a1.signature).slice();
      sig[sig.length - 1] = sig[sig.length - 1]! ^ 1;
      await falha(verifyAssertion({ ...a1, signature: base64url(sig) }, base), 'assinatura');
      // o contador trocado está dentro do que foi assinado
      const ad = bytes(a1.authenticatorData).slice();
      ad[36] = ad[36]! ^ 0x40;
      await falha(verifyAssertion({ ...a1, authenticatorData: base64url(ad) }, base), 'assinatura');
      // o clientDataJSON também é assinado (pelo hash): trocar um campo sem mudar origem, tipo nem desafio não passa
      await falha(verifyAssertion({ ...a1, clientDataJSON: comClientData(a1.clientDataJSON, (d) => (d['extra'] = 1)) }, base), 'assinatura');
    });

    it('recusa sem a verificação do usuário', async () => {
      const r = await chave();
      const ad = bytes(a1.authenticatorData).slice();
      ad[32] = ad[32]! & ~0x04;
      await falha(verifyAssertion({ ...a1, authenticatorData: base64url(ad) }, { ...ABRIR_1, credentialId: r.credentialId, publicKey: r.publicKey, storedSignCount: r.signCount }), 'verificacao');
    });

    it('recusa outra passkey e a chave pública de outro aparelho', async () => {
      const r = await chave();
      await falha(verifyAssertion(a1, { ...ABRIR_1, credentialId: base64url(seq(32, 9)), publicKey: r.publicKey, storedSignCount: 0 }), 'credencial');
      const outro = await verifyRegistration(VETORES[alg === 'es256' ? 'rs256' : 'es256'].reg, REGISTRO);
      await expect(verifyAssertion(a1, { ...ABRIR_1, credentialId: a1.id, publicKey: outro.publicKey, storedSignCount: 0 })).rejects.toMatchObject({ name: 'WebAuthnError' });
    });

    it('recusa um registro mandado como abertura', async () => {
      const r = await chave();
      await falha(verifyAssertion({ ...a1, clientDataJSON: reg.clientDataJSON }, { ...REGISTRO, credentialId: r.credentialId, publicKey: r.publicKey, storedSignCount: 0 }), 'tipo');
    });
  });
}

describe('chaves e assinaturas fora do aceito', () => {
  const coseEs256 = async () => (await verifyRegistration(VETORES.es256.reg, REGISTRO)).publicKey;

  it('recusa outra curva e outro algoritmo', async () => {
    const cose = await coseEs256();
    // a5 01 02 03 26 20 01 …: o byte 6 é a curva (1 = P-256), o 4 é o algoritmo (0x26 = -7)
    expect(cose[4]).toBe(0x26);
    expect(cose[6]).toBe(0x01);
    const p384 = cose.slice();
    p384[6] = 0x02;
    await expect(importCoseKey(p384)).rejects.toMatchObject({ reason: 'chave' });
    const eddsa = cose.slice();
    eddsa[4] = 0x27;
    await expect(importCoseKey(eddsa)).rejects.toMatchObject({ reason: 'chave' });
    await expect(importCoseKey(Uint8Array.from([0xa0]))).rejects.toMatchObject({ reason: 'chave' });
  });

  it('a assinatura ECDSA em DER: só a forma estrita', () => {
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    const der = (ri: number[], si: number[]) => Uint8Array.from([0x30, 4 + ri.length + si.length, 0x02, ri.length, ...ri, 0x02, si.length, ...si]);
    expect(derToRaw(der([...r], [...s]))).toEqual(Uint8Array.from([...r, ...s]));
    // o zero da frente quando o bit de cima está ligado, e inteiros curtos completados à esquerda
    const alto = new Uint8Array(32).fill(0x90);
    expect(derToRaw(der([0, ...alto], [5]))).toEqual(Uint8Array.from([...alto, ...new Uint8Array(31), 5]));
    expect(() => derToRaw(der([0, 0x11], [...s]))).toThrow(); // zero sobrando
    expect(() => derToRaw(der([0x90], [...s]))).toThrow(); // negativo
    expect(() => derToRaw(Uint8Array.from([...der([...r], [...s]), 0]))).toThrow(); // byte sobrando
    expect(() => derToRaw(der([0, 0, ...r], [...s]))).toThrow(); // grande demais
  });
});
