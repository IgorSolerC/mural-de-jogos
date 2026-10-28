/**
 * Registrar uma passkey do cofre com o PRF (seções 5, 8.3 e 16.8 do PLANO-COFRE.md).
 *
 * O PRF faz a passkey devolver um segredo de 32 bytes que só ela gera, sempre o mesmo para a mesma
 * entrada (`entradaPrf`). Com ele, o envelope do aparelho fica selado por um segredo que nunca sai do
 * aparelho. Os aparelhos respondem de três jeitos:
 * - dão o segredo já no registro (`prf.results.first`);
 * - dizem que têm PRF (`prf.enabled`), mas só dão o segredo numa assinatura: a página pede uma, com
 *   a mesma passkey (um segundo toque no Face ID ou na digital). Essa assinatura não vai para o
 *   servidor: serve só para tirar o segredo, então o desafio é sorteado aqui;
 * - não têm PRF: o aparelho fica no modo servidor (decisão 5), e quem decide isso é a tela, nunca
 *   esta função em silêncio.
 *
 * As opções vêm da API, mas a página impõe o que importa para a segurança: o rpId tem de ser o
 * endereço do cofre, a verificação do usuário é obrigatória, o atestado é "none" e só ES256 e RS256.
 */
import type { DesafioDeRegistro, OpcoesDeRegistroJson } from './api';
import { aleatorios, type Bytes, deBase64url, paraBase64url, zerar } from './bytes';
import { entradaPrf, ErroCofre, TAM_CHAVE } from './crypto';

/** Quem cria e usa as passkeys: o navegador, ou um de mentira nos testes. */
export interface Autenticador {
  criar(opcoes: CredentialCreationOptions): Promise<Credential | null>;
  pegar(opcoes: CredentialRequestOptions): Promise<Credential | null>;
}

export const autenticadorDoNavegador: Autenticador = {
  criar: (opcoes) => navigator.credentials.create(opcoes),
  pegar: (opcoes) => navigator.credentials.get(opcoes),
};

/** Os algoritmos que a API do cofre confere (ES256 e RS256). */
const ALGORITMOS = [-7, -257];
const PRAZO_MS = 120_000;

export type MotivoPasskey =
  /** A pessoa cancelou, ou o tempo acabou (o navegador não diz qual). */
  | 'cancelada'
  /** Este aparelho já tem uma passkey deste cofre. */
  | 'ja-registrada'
  /** O navegador não deixou usar passkeys neste endereço. */
  | 'endereco'
  /** O navegador ou o aparelho não tem passkeys. */
  | 'sem-suporte'
  /** Outro problema do navegador. */
  | 'falhou';

const MENSAGENS: Record<MotivoPasskey, string> = {
  cancelada: 'A passkey não foi confirmada. Tente de novo quando estiver com o aparelho na mão.',
  'ja-registrada': 'Este aparelho já tem uma passkey deste cofre.',
  endereco: 'Este endereço não aceita passkeys. Abra o cofre pelo endereço certo.',
  'sem-suporte': 'Este navegador ou aparelho não tem passkeys.',
  falhou: 'Não deu para criar a passkey. Tente de novo.',
};

export class ErroPasskey extends Error {
  constructor(readonly motivo: MotivoPasskey) {
    super(MENSAGENS[motivo]);
    this.name = 'ErroPasskey';
  }
}

function traduzir(e: unknown): never {
  const nome = e instanceof DOMException ? e.name : '';
  const motivo: MotivoPasskey =
    nome === 'NotAllowedError' || nome === 'AbortError'
      ? 'cancelada'
      : nome === 'InvalidStateError'
        ? 'ja-registrada'
        : nome === 'SecurityError'
          ? 'endereco'
          : nome === 'NotSupportedError'
            ? 'sem-suporte'
            : 'falhou';
  throw new ErroPasskey(motivo);
}

/** Uma passkey registrada agora, pronta para ir à API com o envelope do aparelho. */
export interface PasskeyRegistrada {
  /** O id do desafio de registro na API. */
  readonly desafio: string;
  /** O que a API confere (os bytes em base64url). */
  readonly credencial: {
    readonly id: string;
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports: readonly string[];
  };
  /** O segredo do PRF (32 bytes), ou null: sem PRF por enquanto. */
  prf: Bytes | null;
  /** O aparelho disse que tem PRF (mesmo que o segredo ainda não tenha vindo). */
  readonly prfLigado: boolean;
}

function bytesDaApi(texto: string, oQue: string): Bytes {
  const bytes = deBase64url(texto);
  if (!bytes) throw new ErroCofre('formato', `${oQue}: formato inválido`);
  return bytes;
}

/** As opções da API para o `navigator.credentials.create`, com as regras da página por cima. */
export function opcoesDeRegistro(json: OpcoesDeRegistroJson, rpId: string, entrada: Bytes): PublicKeyCredentialCreationOptions {
  if (json.rp?.id !== rpId) throw new ErroCofre('formato', 'a passkey seria de outro endereço');
  const challenge = bytesDaApi(json.challenge, 'desafio');
  if (challenge.length < 16) throw new ErroCofre('formato', 'desafio curto demais');
  const userId = bytesDaApi(json.user?.id, 'user.id');
  if (userId.length < 1 || userId.length > 64) throw new ErroCofre('formato', 'user.id com tamanho inválido');
  const params = (json.pubKeyCredParams ?? []).filter((p) => p.type === 'public-key' && ALGORITMOS.includes(p.alg));
  if (!params.length) throw new ErroCofre('formato', 'nenhum algoritmo aceito');
  return {
    challenge,
    rp: { id: rpId, name: json.rp.name },
    user: { id: userId, name: json.user.name, displayName: json.user.displayName },
    pubKeyCredParams: params.map((p) => ({ type: 'public-key', alg: p.alg })),
    authenticatorSelection: { residentKey: json.authenticatorSelection?.residentKey ?? 'preferred', userVerification: 'required' },
    attestation: 'none',
    timeout: PRAZO_MS,
    excludeCredentials: (json.excludeCredentials ?? []).map((c) => ({
      type: 'public-key',
      id: bytesDaApi(c.id, 'passkey já registrada'),
      ...(c.transports?.length ? { transports: [...c.transports] as AuthenticatorTransport[] } : {}),
    })),
    extensions: { prf: { eval: { first: entrada } } } as AuthenticationExtensionsClientInputs,
  };
}

interface ResultadoPrf {
  enabled?: boolean;
  results?: { first?: BufferSource };
}

function resultadoPrf(cred: PublicKeyCredential): ResultadoPrf | undefined {
  return (cred.getClientExtensionResults() as { prf?: ResultadoPrf }).prf;
}

/**
 * O segredo do PRF (o `prf.results.first` de uma credencial) numa cópia própria, se veio com o tamanho
 * certo; a cópia de tamanho errado é zerada. Serve ao registro e à assinatura de abrir.
 */
export function segredoDoPrf(bruto: BufferSource | undefined): Bytes | null {
  if (!bruto) return null;
  const bytes = new Uint8Array(ArrayBuffer.isView(bruto) ? bruto.buffer.slice(bruto.byteOffset, bruto.byteOffset + bruto.byteLength) : bruto.slice(0));
  if (bytes.length === TAM_CHAVE) return bytes;
  zerar(bytes);
  return null;
}

function segredo(prf: ResultadoPrf | undefined): Bytes | null {
  return segredoDoPrf(prf?.results?.first);
}

function comoPasskey(cred: Credential | null): PublicKeyCredential {
  if (!cred || cred.type !== 'public-key') throw new ErroPasskey('falhou');
  return cred as PublicKeyCredential;
}

/**
 * Registra uma passkey com o desafio da API. Se o aparelho tem PRF mas não deu o segredo no registro,
 * pede logo uma assinatura para tirá-lo; se a pessoa cancelar essa segunda confirmação, a passkey
 * volta com `prf: null` e `prfLigado: true`, e a tela oferece `pedirSegredoPrf` de novo.
 */
export async function registrarPasskey(desafio: DesafioDeRegistro, rpId: string, autenticador: Autenticador = autenticadorDoNavegador): Promise<PasskeyRegistrada> {
  const entrada = await entradaPrf();
  let cred: PublicKeyCredential;
  try {
    cred = comoPasskey(await autenticador.criar({ publicKey: opcoesDeRegistro(desafio.publicKey, rpId, entrada) }));
  } catch (e) {
    if (e instanceof ErroCofre || e instanceof ErroPasskey) throw e;
    traduzir(e);
  }
  const resposta = cred.response as AuthenticatorAttestationResponse;
  const prf = resultadoPrf(cred);
  // uma cópia só do segredo (outra, jogada fora sem zerar, ficaria na memória)
  const segredoNoRegistro = segredo(prf);
  const passkey: PasskeyRegistrada = {
    desafio: desafio.desafio,
    credencial: {
      id: paraBase64url(new Uint8Array(cred.rawId)),
      clientDataJSON: paraBase64url(new Uint8Array(resposta.clientDataJSON)),
      attestationObject: paraBase64url(new Uint8Array(resposta.attestationObject)),
      transports: typeof resposta.getTransports === 'function' ? resposta.getTransports() : [],
    },
    prf: segredoNoRegistro,
    prfLigado: prf?.enabled === true || segredoNoRegistro !== null,
  };
  if (!passkey.prf && passkey.prfLigado) {
    try {
      passkey.prf = await pedirSegredoPrf(passkey, rpId, autenticador);
    } catch (e) {
      if (!(e instanceof ErroPasskey && e.motivo === 'cancelada')) throw e;
    }
  }
  return passkey;
}

/**
 * Tira o segredo do PRF com uma assinatura da passkey que acabou de ser registrada. O desafio é
 * sorteado aqui: esta assinatura não vai para o servidor.
 */
export async function pedirSegredoPrf(passkey: PasskeyRegistrada, rpId: string, autenticador: Autenticador = autenticadorDoNavegador): Promise<Bytes | null> {
  const transports = passkey.credencial.transports as AuthenticatorTransport[];
  let cred: PublicKeyCredential;
  try {
    cred = comoPasskey(
      await autenticador.pegar({
        publicKey: {
          challenge: aleatorios(32),
          rpId,
          allowCredentials: [{ type: 'public-key', id: bytesDaApi(passkey.credencial.id, 'passkey'), ...(transports.length ? { transports } : {}) }],
          userVerification: 'required',
          timeout: PRAZO_MS,
          extensions: { prf: { eval: { first: await entradaPrf() } } } as AuthenticationExtensionsClientInputs,
        },
      }),
    );
  } catch (e) {
    if (e instanceof ErroPasskey) throw e;
    traduzir(e);
  }
  if (paraBase64url(new Uint8Array(cred.rawId)) !== passkey.credencial.id) throw new ErroPasskey('falhou');
  return segredo(resultadoPrf(cred));
}
