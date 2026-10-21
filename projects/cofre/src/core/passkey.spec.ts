import type { DesafioDeRegistro } from './api';
import { paraBase64url } from './bytes';
import { entradaPrf, ErroCofre } from './crypto';
import { type Autenticador, ErroPasskey, type MotivoPasskey, opcoesDeRegistro, pedirSegredoPrf, registrarPasskey } from './passkey';

const RP = 'cofre.murall.igorsc.com.br';
const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);

const DESAFIO: DesafioDeRegistro = {
  desafio: '6c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b70',
  publicKey: {
    challenge: paraBase64url(seq(32, 1)),
    rp: { id: RP, name: 'Murall Cofre' },
    user: { id: paraBase64url(seq(16, 50)), name: 'Cofre do Murall (K7QF-M2XA)', displayName: 'Cofre do Murall (K7QF-M2XA)' },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    attestation: 'none',
    timeout: 120000,
    excludeCredentials: [{ type: 'public-key', id: paraBase64url(seq(20, 90)), transports: ['internal'] }],
  },
};

const ID = seq(24, 7);
const SEGREDO = seq(32, 100);

interface Prf {
  enabled?: boolean;
  results?: { first?: BufferSource };
}

/** Uma credencial como o navegador devolve, só com o que o cofre lê. */
function credencial(prf: Prf | undefined, rawId = ID) {
  return {
    type: 'public-key',
    id: paraBase64url(rawId),
    rawId: rawId.slice().buffer,
    response: { clientDataJSON: seq(10, 1).buffer, attestationObject: seq(12, 2).buffer, getTransports: () => ['hybrid', 'internal'] },
    getClientExtensionResults: () => (prf ? { prf } : {}),
  } as unknown as Credential;
}

/** Um autenticador de mentira que anota as opções e responde o que o teste mandar. */
function autenticador(criar: Credential | Error, pegar?: Credential | Error) {
  const visto: { criar: CredentialCreationOptions[]; pegar: CredentialRequestOptions[] } = { criar: [], pegar: [] };
  const a: Autenticador = {
    criar: async (o) => {
      visto.criar.push(o);
      if (criar instanceof Error) throw criar;
      return criar;
    },
    pegar: async (o) => {
      visto.pegar.push(o);
      if (!pegar) throw new Error('não devia pedir assinatura');
      if (pegar instanceof Error) throw pegar;
      return pegar;
    },
  };
  return { a, visto };
}

async function falhaPasskey(promessa: Promise<unknown>, motivo: MotivoPasskey): Promise<void> {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroPasskey);
    expect((e as ErroPasskey).motivo).toBe(motivo);
    return;
  }
  throw new Error(`esperava ErroPasskey(${motivo})`);
}

describe('registrar a passkey do cofre', () => {
  it('as opções impõem o rpId do cofre, a biometria, o atestado "none" e pedem o PRF com a entrada do cofre', async () => {
    const entrada = await entradaPrf();
    const o = opcoesDeRegistro({ ...DESAFIO.publicKey, authenticatorSelection: { userVerification: 'discouraged' }, attestation: 'direct' }, RP, entrada);
    expect(o.rp).toEqual({ id: RP, name: 'Murall Cofre' });
    expect(new Uint8Array(o.challenge as ArrayBuffer)).toEqual(seq(32, 1));
    expect(new Uint8Array(o.user.id as ArrayBuffer)).toEqual(seq(16, 50));
    expect(o.authenticatorSelection).toEqual({ residentKey: 'preferred', userVerification: 'required' });
    expect(o.attestation).toBe('none');
    expect(o.timeout).toBe(120000);
    expect(o.excludeCredentials).toEqual([{ type: 'public-key', id: seq(20, 90), transports: ['internal'] }]);
    expect((o.extensions as { prf: { eval: { first: Uint8Array } } }).prf.eval.first).toEqual(entrada);
  });

  it('recusa opções de outro endereço, desafio curto e algoritmo que a API não confere', async () => {
    const entrada = await entradaPrf();
    expect(() => opcoesDeRegistro({ ...DESAFIO.publicKey, rp: { id: 'murall.igorsc.com.br', name: 'x' } }, RP, entrada)).toThrowError(ErroCofre, /outro endereço/);
    expect(() => opcoesDeRegistro({ ...DESAFIO.publicKey, challenge: paraBase64url(seq(8, 1)) }, RP, entrada)).toThrowError(ErroCofre, /curto/);
    expect(() => opcoesDeRegistro({ ...DESAFIO.publicKey, challenge: 'não é base64url!' }, RP, entrada)).toThrowError(ErroCofre);
    expect(() => opcoesDeRegistro({ ...DESAFIO.publicKey, pubKeyCredParams: [{ type: 'public-key', alg: -8 }] }, RP, entrada)).toThrowError(ErroCofre, /algoritmo/);
    const so256 = opcoesDeRegistro({ ...DESAFIO.publicKey, pubKeyCredParams: [{ type: 'public-key', alg: -8 }, { type: 'public-key', alg: -7 }] }, RP, entrada);
    expect(so256.pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }]);
  });

  it('com o segredo já no registro: um toque só, e a credencial no formato da API', async () => {
    const { a, visto } = autenticador(credencial({ enabled: true, results: { first: SEGREDO.slice().buffer } }));
    const p = await registrarPasskey(DESAFIO, RP, a);
    expect(p.desafio).toBe(DESAFIO.desafio);
    expect(p.credencial).toEqual({ id: paraBase64url(ID), clientDataJSON: paraBase64url(seq(10, 1)), attestationObject: paraBase64url(seq(12, 2)), transports: ['hybrid', 'internal'] });
    expect(p.prf).toEqual(SEGREDO);
    expect(p.prfLigado).toBe(true);
    expect(visto.criar.length).toBe(1);
    expect(visto.pegar.length).toBe(0);
  });

  it('com PRF mas sem o segredo no registro: pede uma assinatura da mesma passkey, com desafio sorteado aqui', async () => {
    const { a, visto } = autenticador(credencial({ enabled: true }), credencial({ results: { first: SEGREDO } }));
    const p = await registrarPasskey(DESAFIO, RP, a);
    expect(p.prf).toEqual(SEGREDO);
    const pedido = visto.pegar[0]!.publicKey!;
    expect(pedido.rpId).toBe(RP);
    expect(pedido.userVerification).toBe('required');
    expect(pedido.allowCredentials).toEqual([{ type: 'public-key', id: ID, transports: ['hybrid', 'internal'] }]);
    expect((pedido.challenge as Uint8Array).length).toBe(32);
    expect(new Uint8Array(pedido.challenge as ArrayBuffer)).not.toEqual(seq(32, 1));
    expect((pedido.extensions as { prf: { eval: { first: Uint8Array } } }).prf.eval.first).toEqual(await entradaPrf());
  });

  it('sem PRF: nenhuma assinatura a mais, e a passkey volta sem segredo (a tela decide o modo servidor)', async () => {
    for (const prf of [{ enabled: false }, undefined]) {
      const { a, visto } = autenticador(credencial(prf));
      const p = await registrarPasskey(DESAFIO, RP, a);
      expect([p.prf, p.prfLigado]).toEqual([null, false]);
      expect(visto.pegar.length).toBe(0);
    }
  });

  it('cancelar a segunda confirmação não rebaixa: a passkey volta com prfLigado, e dá para pedir de novo', async () => {
    const { a } = autenticador(credencial({ enabled: true }), new DOMException('cancelou', 'NotAllowedError'));
    const p = await registrarPasskey(DESAFIO, RP, a);
    expect([p.prf, p.prfLigado]).toEqual([null, true]);
    const outra = autenticador(credencial({ enabled: true }), credencial({ results: { first: SEGREDO } }));
    expect(await pedirSegredoPrf(p, RP, outra.a)).toEqual(SEGREDO);
  });

  it('o segredo de outra passkey ou de tamanho errado não vale', async () => {
    const { a } = autenticador(credencial({ enabled: true }), credencial({ results: { first: SEGREDO } }, seq(24, 70)));
    await falhaPasskey(registrarPasskey(DESAFIO, RP, a), 'falhou');
    const curto = autenticador(credencial({ enabled: true, results: { first: seq(16, 1) } }), credencial({ results: { first: seq(31, 1) } }));
    expect((await registrarPasskey(DESAFIO, RP, curto.a)).prf).toBeNull();
  });

  it('os erros do navegador viram mensagens em português', async () => {
    const casos: [string, MotivoPasskey][] = [
      ['NotAllowedError', 'cancelada'],
      ['AbortError', 'cancelada'],
      ['InvalidStateError', 'ja-registrada'],
      ['SecurityError', 'endereco'],
      ['NotSupportedError', 'sem-suporte'],
      ['UnknownError', 'falhou'],
    ];
    for (const [nome, motivo] of casos) await falhaPasskey(registrarPasskey(DESAFIO, RP, autenticador(new DOMException('x', nome)).a), motivo);
    await falhaPasskey(registrarPasskey(DESAFIO, RP, autenticador(null as unknown as Credential).a), 'falhou');
    expect(new ErroPasskey('cancelada').message).toContain('não foi confirmada');
  });
});
