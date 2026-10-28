import { assinar, assinarComSenha, chaveDoMeio, senhaDoDesafio } from './abrir';
import { ApiCofre, type ChaveDoAparelho, type DesafioDeAbrir } from './api';
import { paraBase64url } from './bytes';
import { entradaPrf, ErroCofre, type MotivoErro, novaChaveDoMeio, novoId, selarEnvelope } from './crypto';
import { type Autenticador, ErroPasskey } from './passkey';

const RP = 'cofre.murall.igorsc.com.br';
const USUARIO = '0b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
const seq = (n: number, ini: number) => Uint8Array.from({ length: n }, (_, i) => (ini + i) & 255);

const DESAFIO: DesafioDeAbrir = {
  desafio: '6c1d2a6e-5d4f-4e3a-9b1c-2d3e4f5a6b70',
  publicKey: { challenge: paraBase64url(seq(32, 1)), rpId: RP, allowCredentials: [{ type: 'public-key', id: paraBase64url(seq(16, 9)), transports: ['hybrid'] }], userVerification: 'required' },
  versao: 1,
  kdf: { m: 65536, t: 3, p: 1 },
  sal: paraBase64url(seq(16, 3)),
  aparelhos: [{ id: paraBase64url(seq(16, 9)), apelido: 'Celular', prf: true }],
  mudadoEm: '2026-10-21T15:00:00.000Z',
};

function assinatura(prf: BufferSource | null) {
  return {
    type: 'public-key',
    rawId: seq(16, 9).buffer,
    response: { clientDataJSON: seq(4, 1).buffer, authenticatorData: seq(4, 2).buffer, signature: seq(4, 3).buffer, userHandle: seq(4, 4).buffer },
    getClientExtensionResults: () => (prf ? { prf: { results: { first: prf } } } : {}),
  } as unknown as Credential;
}

function autenticador(resposta: Credential | Error): Autenticador & { pedidos: CredentialRequestOptions[] } {
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

async function falha(promessa: Promise<unknown>, tipo: typeof ErroCofre | typeof ErroPasskey, motivo: string): Promise<void> {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(tipo);
    expect((e as { motivo: string }).motivo).toBe(motivo);
    return;
  }
  throw new Error(`esperava ${motivo}`);
}

class ApiDaChave extends ApiCofre {
  constructor(private readonly resposta: ChaveDoAparelho) {
    super();
  }
  override async chave(): Promise<ChaveDoAparelho> {
    return this.resposta;
  }
}

describe('abrir o cofre na página', () => {
  it('a passkey assina com o rpId do cofre, biometria obrigatória e o PRF pedido; a assinatura vai em base64url', async () => {
    const aut = autenticador(assinatura(seq(32, 100).buffer));
    const a = await assinar(DESAFIO, RP, aut);
    const pedido = aut.pedidos[0]!.publicKey!;
    expect(pedido.rpId).toBe(RP);
    expect(pedido.userVerification).toBe('required');
    expect(new Uint8Array(pedido.challenge as ArrayBuffer)).toEqual(seq(32, 1));
    expect(pedido.allowCredentials).toEqual([{ type: 'public-key', id: seq(16, 9), transports: ['hybrid'] }]);
    expect((pedido.extensions as { prf: { eval: { first: Uint8Array } } }).prf.eval.first).toEqual(await entradaPrf());
    expect(a.assinatura).toEqual({
      id: paraBase64url(seq(16, 9)),
      clientDataJSON: paraBase64url(seq(4, 1)),
      authenticatorData: paraBase64url(seq(4, 2)),
      signature: paraBase64url(seq(4, 3)),
      userHandle: paraBase64url(seq(4, 4)),
    });
    expect(a.prf).toEqual(seq(32, 100));
  });

  it('recusa desafio de outro endereço, curto ou sem passkeys; cancelar vira mensagem', async () => {
    const aut = autenticador(assinatura(null));
    await falha(assinar({ ...DESAFIO, publicKey: { ...DESAFIO.publicKey, rpId: 'murall.igorsc.com.br' } }, RP, aut), ErroCofre, 'formato');
    await falha(assinar({ ...DESAFIO, publicKey: { ...DESAFIO.publicKey, challenge: paraBase64url(seq(8, 1)) } }, RP, aut), ErroCofre, 'formato');
    await falha(assinar({ ...DESAFIO, publicKey: { ...DESAFIO.publicKey, allowCredentials: [] } }, RP, aut), ErroCofre, 'formato');
    expect(aut.pedidos.length).toBe(0);
    await falha(assinar(DESAFIO, RP, autenticador(new DOMException('x', 'NotAllowedError'))), ErroPasskey, 'cancelada');
  });

  it('o envelope do PRF abre com o segredo da passkey, que é zerado depois', async () => {
    const segredo = seq(32, 100);
    const m = novaChaveDoMeio();
    const id = novoId();
    const envelope = paraBase64url(await selarEnvelope(segredo, USUARIO, id, m));
    const assinada = { desafio: 'd', assinatura: { id: 'x', clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' }, prf: segredo.slice() };
    const prf = assinada.prf;
    expect(await chaveDoMeio(new ApiDaChave({ envelope: { id, dados: envelope }, tipo: 'prf' }), assinada, USUARIO)).toEqual(m);
    expect(prf.every((x) => x === 0)).toBe(true);
    expect(assinada.prf).toBeNull();
  });

  it('o envelope do PRF sem o segredo não abre (nunca cai no modo servidor)', async () => {
    const assinada = { desafio: 'd', assinatura: { id: 'x', clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' }, prf: null };
    await falha(chaveDoMeio(new ApiDaChave({ envelope: { id: novoId(), dados: paraBase64url(seq(61, 1)) }, tipo: 'prf', s: paraBase64url(seq(32, 1)) }), assinada, USUARIO), ErroCofre, 'abrir');
    await falha(
      chaveDoMeio(new ApiDaChave({ envelope: { id: novoId(), dados: paraBase64url(seq(61, 1)) }, tipo: 'outro' as 'prf' }), { ...assinada, prf: seq(32, 1) }, USUARIO),
      ErroCofre,
      'formato',
    );
  });

  it('a passkey e a senha juntas: se a senha falhar, o segredo do PRF que a passkey deu é zerado', async () => {
    const copias: Uint8Array[] = [];
    const slice = Uint8Array.prototype.slice;
    spyOn(Uint8Array.prototype, 'slice').and.callFake(function (this: Uint8Array, ...args: [number?, number?]) {
      const copia = slice.apply(this, args);
      // as cópias do segredo do PRF (os bytes 100..131)
      if (copia.length === 32 && copia.every((x, i) => x === 100 + i)) copias.push(copia);
      return copia;
    });
    const doNavegador = seq(32, 100).buffer;
    const aut = autenticador(assinatura(doNavegador));
    await falha(assinarComSenha({ ...DESAFIO, kdf: { m: 1024, t: 3, p: 1 } }, 'senha', RP, aut), ErroCofre, 'kdf-fraco');
    await new Promise((ok) => setTimeout(ok, 50));
    expect(aut.pedidos.length).toBe(1);
    expect(copias.length).toBe(1);
    expect(copias[0]!.every((x) => x === 0)).toBe(true);
    // e o que o navegador deu também
    expect(new Uint8Array(doNavegador).every((x) => x === 0)).toBe(true);
  });

  it('recusa versão desconhecida e Argon2id fraco vindos do servidor', async () => {
    const casos: [Partial<DesafioDeAbrir>, MotivoErro][] = [
      [{ versao: 2 }, 'versao'],
      [{ kdf: { m: 1024, t: 3, p: 1 } }, 'kdf-fraco'],
      [{ kdf: { m: 65536, t: 1, p: 1 } }, 'kdf-fraco'],
      [{ kdf: { m: 4 * 1024 * 1024, t: 3, p: 1 } }, 'kdf-invalido'],
    ];
    for (const [mudar, motivo] of casos) await falha(senhaDoDesafio('senha', { ...DESAFIO, ...mudar }), ErroCofre, motivo);
  });
});
