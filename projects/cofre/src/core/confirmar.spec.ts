import type { CofreAberto } from './abrir';
import { deBase64url } from './bytes';
import { confirmarComPasskey, confirmarComSenha, podeConfirmarComPasskey, podeConfirmarComSenha } from './confirmar';
import { chaveDaSenha, criarCofre, ErroCofre, KDF_PADRAO, novaChaveDoMeio, novoSal } from './crypto';
import { type Autenticador, ErroPasskey } from './passkey';

const RP = 'cofre.murall.igorsc.com.br';
const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const PC = 'cGFzc2tleS1kby1wYw';
const CELULAR = 'cGFzc2tleS1kby1jZWx1bGFy';

/** A assinatura de uma passkey: quem assinou (o rawId) e os flags do authenticatorData (byte 32). */
function assinada(id: string, flags: number): Credential {
  const dados = new Uint8Array(37);
  dados[32] = flags;
  return { type: 'public-key', rawId: deBase64url(id)!.buffer, response: { authenticatorData: dados.buffer }, getClientExtensionResults: () => ({}) } as unknown as Credential;
}

function autenticador(resposta: Credential | Error | null): Autenticador & { pedidos: CredentialRequestOptions[] } {
  const pedidos: CredentialRequestOptions[] = [];
  return {
    pedidos,
    criar: async () => null,
    pegar: async (o) => {
      pedidos.push(o);
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
  };
}

const cofre = { passkeys: [{ id: PC, transports: ['internal'] }, { id: CELULAR }] };

async function motivo(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (e) {
    return e instanceof ErroPasskey || e instanceof ErroCofre ? e.motivo : String(e);
  }
  return 'deu certo';
}

describe('confirmar de novo para ver uma senha protegida', () => {
  it('a passkey: deste cofre, deste endereço, com a pessoa conferida pelo aparelho (UV)', async () => {
    const a = autenticador(assinada(CELULAR, 0x05));
    await confirmarComPasskey(cofre, RP, a);
    const pk = a.pedidos[0]!.publicKey!;
    expect(pk.rpId).toBe(RP);
    expect(pk.userVerification).toBe('required');
    expect((pk.challenge as Uint8Array).length).toBe(32);
    expect(pk.allowCredentials!.map((c) => [...new Uint8Array(c.id as Uint8Array)])).toEqual([[...deBase64url(PC)!], [...deBase64url(CELULAR)!]]);
    expect(pk.allowCredentials![0]!.transports).toEqual(['internal']);
    // o desafio é sorteado a cada vez
    await confirmarComPasskey(cofre, RP, a);
    expect(a.pedidos[1]!.publicKey!.challenge).not.toEqual(pk.challenge);
  });

  it('recusa a passkey de outro cofre, a assinatura sem a pessoa conferida, o cancelar e o vazio', async () => {
    expect(await motivo(confirmarComPasskey(cofre, RP, autenticador(assinada('b3V0cmEtcGFzc2tleQ', 0x05))))).toBe('falhou');
    // presença (UP) sem verificação (UV) não basta
    expect(await motivo(confirmarComPasskey(cofre, RP, autenticador(assinada(PC, 0x01))))).toBe('cancelada');
    expect(await motivo(confirmarComPasskey(cofre, RP, autenticador(new DOMException('não', 'NotAllowedError'))))).toBe('cancelada');
    expect(await motivo(confirmarComPasskey(cofre, RP, autenticador(new DOMException('não', 'SecurityError'))))).toBe('endereco');
    // os mesmos motivos de criar a passkey (um lugar só traduz os erros do navegador)
    expect(await motivo(confirmarComPasskey(cofre, RP, autenticador(new DOMException('não', 'NotSupportedError'))))).toBe('sem-suporte');
    expect(await motivo(confirmarComPasskey(cofre, RP, autenticador(null)))).toBe('falhou');
    expect(await motivo(confirmarComPasskey({ passkeys: [] }, RP, autenticador(assinada(PC, 0x05))))).toBe('sem-suporte');
    expect([podeConfirmarComPasskey(cofre), podeConfirmarComPasskey({})]).toEqual([true, false]);
  });

  it('a senha mestra: abre V de novo; errada, "abrir"; sem os segredos do aberto, não dá', async () => {
    const sal = novoSal();
    const m = novaChaveDoMeio();
    const { v } = await criarCofre(await chaveDaSenha('frase certa', sal, KDF_PADRAO), m, USUARIO);
    const aberto: Pick<CofreAberto, 'segredos' | 'usuario'> = { usuario: USUARIO, segredos: { m, v, sal, kdf: { ...KDF_PADRAO } } };
    expect(podeConfirmarComSenha(aberto)).toBeTrue();
    expect(await motivo(confirmarComSenha(aberto, 'frase certa'))).toBe('deu certo');
    expect(await motivo(confirmarComSenha(aberto, 'frase errada'))).toBe('abrir');
    expect(await motivo(confirmarComSenha(aberto, ''))).toBe('abrir');
    expect(podeConfirmarComSenha({})).toBeFalse();
    expect(await motivo(confirmarComSenha({ usuario: USUARIO }, 'frase certa'))).toBe('formato');
  });
});
