/**
 * Abrir o cofre na página (seção 8.1 do PLANO-COFRE.md), sem tela:
 *
 * 1. `POST /api/cofre/desafio` dá o desafio da assinatura, o sal e o Argon2id.
 * 2. Ao mesmo tempo, a passkey assina (com o PRF) e o Argon2id faz kSenha com a senha digitada.
 * 3. `POST /api/cofre/chave` confere a assinatura e devolve o envelope daquele aparelho (no modo servidor,
 *    também o S_i), que abre em M. No lugar da passkey, o código de recuperação (`POST /api/cofre/recuperar`).
 * 4. kAuth vai para `POST /api/cofre/abrir`, que devolve V e o manifesto; V abre em VK.
 *
 * Nada aqui confia no servidor: a versão e o Argon2id passam pelas regras do núcleo (6.4), o rpId tem de
 * ser o do cofre, e M e VK só saem de selados que o servidor não consegue forjar. Os bytes secretos são
 * zerados assim que deixam de servir.
 */
import type { ApiCofre, AssinaturaJson, DesafioDeAbrir } from './api';
import { type Bytes, deBase64url, paraBase64url, zerar } from './bytes';
import { lerCodigo } from './codigo';
import {
  abrirCofre,
  abrirEnvelope,
  abrirRecuperacao,
  chaveDaSenha,
  type ChaveDoCofre,
  decifrarManifesto,
  entradaPrf,
  ErroCofre,
  type Manifesto,
  provaDaSenha,
  provaDoCodigo,
  TAM_CHAVE,
  VERSAO_CRIPTO,
} from './crypto';
import { type Autenticador, autenticadorDoNavegador, ErroPasskey } from './passkey';

/** O cofre aberto, só na memória: a chave (não exportável), o manifesto e de quem é. */
export interface CofreAberto {
  readonly usuario: string;
  readonly chave: ChaveDoCofre;
  manifesto: Manifesto;
  contador: number;
  /** Aberto pelo código de recuperação: a tela pede um código novo e uma passkey (8.4). */
  readonly recuperada: boolean;
  /** Até quando a sessão do cofre vale, no máximo (8 horas). */
  readonly expiraEm: string;
  /** Segundos parado até a sessão acabar no servidor. */
  readonly paradaMaxima: number;
  /** Este aparelho, em palavras, para o manifesto ("PC", "Celular"). */
  readonly aparelho: string;
}

/** A assinatura de uma passkey para abrir, e o segredo do PRF que ela deu (null se não deu). */
export interface Assinada {
  readonly desafio: string;
  readonly assinatura: AssinaturaJson;
  prf: Bytes | null;
}

function bytes(texto: string | undefined, oQue: string): Bytes {
  const b = typeof texto === 'string' ? deBase64url(texto) : null;
  if (!b) throw new ErroCofre('formato', `${oQue}: formato inválido`);
  return b;
}

const b64 = (buffer: ArrayBuffer) => paraBase64url(new Uint8Array(buffer));

/** A passkey assina o desafio da API, com o PRF pedido. */
export async function assinar(desafio: DesafioDeAbrir, rpId: string, autenticador: Autenticador = autenticadorDoNavegador): Promise<Assinada> {
  const pk = desafio.publicKey;
  if (pk?.rpId !== rpId) throw new ErroCofre('formato', 'o desafio é de outro endereço');
  const challenge = bytes(pk.challenge, 'desafio');
  if (challenge.length < 16) throw new ErroCofre('formato', 'desafio curto demais');
  if (!pk.allowCredentials?.length) throw new ErroCofre('formato', 'o cofre não tem passkeys');
  let cred: PublicKeyCredential;
  try {
    const c = await autenticador.pegar({
      publicKey: {
        challenge,
        rpId,
        allowCredentials: pk.allowCredentials.map((a) => ({
          type: 'public-key',
          id: bytes(a.id, 'passkey'),
          ...(a.transports?.length ? { transports: [...a.transports] as AuthenticatorTransport[] } : {}),
        })),
        userVerification: 'required',
        timeout: 120_000,
        extensions: { prf: { eval: { first: await entradaPrf() } } } as AuthenticationExtensionsClientInputs,
      },
    });
    if (!c || c.type !== 'public-key') throw new ErroPasskey('falhou');
    cred = c as PublicKeyCredential;
  } catch (e) {
    if (e instanceof ErroPasskey || e instanceof ErroCofre) throw e;
    const nome = e instanceof DOMException ? e.name : '';
    throw new ErroPasskey(nome === 'NotAllowedError' || nome === 'AbortError' ? 'cancelada' : nome === 'SecurityError' ? 'endereco' : 'falhou');
  }
  const r = cred.response as AuthenticatorAssertionResponse;
  const prf = (cred.getClientExtensionResults() as { prf?: { results?: { first?: BufferSource } } }).prf?.results?.first;
  let segredo: Bytes | null = null;
  if (prf) {
    const copia = new Uint8Array(ArrayBuffer.isView(prf) ? prf.buffer.slice(prf.byteOffset, prf.byteOffset + prf.byteLength) : prf.slice(0));
    segredo = copia.length === TAM_CHAVE ? copia : null;
  }
  return {
    desafio: desafio.desafio,
    assinatura: {
      id: b64(cred.rawId),
      clientDataJSON: b64(r.clientDataJSON),
      authenticatorData: b64(r.authenticatorData),
      signature: b64(r.signature),
      ...(r.userHandle ? { userHandle: b64(r.userHandle) } : {}),
    },
    prf: segredo,
  };
}

/**
 * Manda a assinatura e abre o envelope do aparelho: com PRF, com o segredo que a passkey deu; no modo
 * servidor, com o S_i que o servidor devolveu depois de conferir. Devolve M (quem chama zera). O segredo
 * do PRF é zerado aqui.
 */
export async function chaveDoMeio(api: ApiCofre, assinada: Assinada, usuario: string): Promise<Bytes> {
  try {
    const resposta = await api.chave(assinada.desafio, assinada.assinatura);
    const dados = bytes(resposta.envelope?.dados, 'envelope');
    if (resposta.tipo === 'prf') {
      if (!assinada.prf) throw new ErroCofre('abrir', 'esta passkey não deu a chave do PRF');
      return await abrirEnvelope(assinada.prf, usuario, resposta.envelope.id, dados);
    }
    if (resposta.tipo !== 'servidor') throw new ErroCofre('formato', 'tipo de envelope desconhecido');
    const s = bytes(resposta.s, 'segredo do aparelho');
    try {
      return await abrirEnvelope(s, usuario, resposta.envelope.id, dados);
    } finally {
      zerar(s);
    }
  } finally {
    zerar(assinada.prf);
    assinada.prf = null;
  }
}

/** O código de recuperação (do kit) no lugar da passkey: devolve M. */
export async function chaveDoMeioPeloCodigo(api: ApiCofre, codigoDigitado: string, usuario: string): Promise<Bytes> {
  const codigo = await lerCodigo(codigoDigitado);
  try {
    const resposta = await api.recuperar(paraBase64url(await provaDoCodigo(codigo)));
    return await abrirRecuperacao(codigo, usuario, bytes(resposta.envelope?.dados, 'envelope do código'));
  } finally {
    zerar(codigo);
  }
}

/** kSenha a partir do desafio: recusa versão desconhecida e Argon2id fraco ou absurdo vindos do servidor (6.4). */
export async function senhaDoDesafio(senha: string, desafio: DesafioDeAbrir): Promise<Bytes> {
  if (desafio.versao !== VERSAO_CRIPTO) throw new ErroCofre('versao', `versão do cofre desconhecida: ${desafio.versao}`);
  return chaveDaSenha(senha, bytes(desafio.sal, 'sal'), desafio.kdf, desafio.versao);
}

/**
 * Com M e kSenha: a prova da senha vai para a API, que devolve V e o manifesto; V abre em VK. Zera M e
 * kSenha (deu certo ou não). Uma senha errada vem da API como `ErroApi` ("senha-errada").
 */
export async function abrir(api: ApiCofre, usuario: string, kSenha: Bytes, m: Bytes, aparelho: string): Promise<CofreAberto> {
  let kAuth: Bytes | null = null;
  try {
    kAuth = await provaDaSenha(kSenha, m);
    const abertura = await api.abrir(paraBase64url(kAuth));
    const chave = await abrirCofre(kSenha, m, usuario, bytes(abertura.v, 'V'));
    const manifesto = await decifrarManifesto(chave, usuario, abertura.contador, bytes(abertura.manifesto, 'manifesto'));
    return {
      usuario,
      chave,
      manifesto,
      contador: abertura.contador,
      recuperada: abertura.recuperada === true,
      expiraEm: abertura.expiraEm,
      paradaMaxima: abertura.paradaMaxima,
      aparelho,
    };
  } finally {
    zerar(kSenha, m, kAuth);
  }
}
