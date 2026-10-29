/**
 * Montar o cofre novo no navegador (seção 8.3, passo 5, do PLANO-COFRE.md): tudo o que o
 * `POST /api/cofre` recebe, a partir da senha mestra e das passkeys que acabaram de ser registradas.
 *
 * Aqui nascem M (a chave do meio), VK (dentro de V), o sal, o código de recuperação e o S_i de cada
 * aparelho sem PRF. Para o servidor vão só os selados, as provas (kAuth e kRec) e os S_i; o texto do
 * código volta para a tela imprimir no kit de emergência, uma vez, e não é guardado em lugar nenhum.
 * Os bytes secretos são zerados aqui mesmo. O segredo do PRF de cada passkey também, mas só quando
 * tudo deu certo (ele não serve para mais nada depois do envelope selado): se algo falhar no meio, a
 * passkey continua com ele, e montar de novo não a rebaixa em silêncio para o modo servidor.
 */
import { type Bytes, paraBase64url, zerar } from './bytes';
import { sortearCodigo } from './codigo';
import {
  chaveDaSenha,
  cifrarManifesto,
  conferirId,
  criarCofre,
  ErroCofre,
  type Kdf,
  KDF_PADRAO,
  type Manifesto,
  novaChaveDoMeio,
  novoId,
  novoSal,
  novoSegredoDeAparelho,
  provaDaSenha,
  provaDoCodigo,
  selarEnvelope,
  selarRecuperacao,
  VERSAO_CRIPTO,
} from './crypto';
import type { PasskeyRegistrada } from './passkey';

/** Na criação, um ou dois aparelhos (decisão 4); os outros entram depois, nos Ajustes. */
export const APARELHOS_NA_CRIACAO = 2;

/** Um aparelho que vai entrar no cofre: a passkey registrada e o nome que a pessoa deu. */
export interface AparelhoParaCriar {
  readonly passkey: PasskeyRegistrada;
  readonly apelido: string;
}

/** O corpo do `POST /api/cofre`, com os bytes em base64url. `pin`: a senha é um PIN (só para a tela de abrir). */
export interface CorpoDeCriar {
  readonly versao: number;
  readonly kdf: Kdf;
  readonly sal: string;
  readonly v: string;
  readonly kAuth: string;
  readonly manifesto: string;
  readonly recuperacao: { readonly id: string; readonly envelope: string; readonly kRec: string };
  readonly aparelhos: readonly {
    readonly desafio: string;
    readonly credencial: PasskeyRegistrada['credencial'];
    readonly apelido: string;
    readonly prf: boolean;
    readonly envelopeId: string;
    readonly envelope: string;
    /** Só no modo servidor: o S_i, que o servidor guarda cifrado. */
    readonly s?: string;
  }[];
  readonly pin?: boolean;
}

export interface CofreMontado {
  readonly corpo: CorpoDeCriar;
  /** O código de recuperação em texto, para o kit de emergência (aparece uma vez). */
  readonly codigo: string;
}

export interface PedidoDeCriar {
  /** O id da conta do Murall (vem do `POST /api/entrar`). */
  readonly usuario: string;
  readonly senha: string;
  readonly aparelhos: readonly AparelhoParaCriar[];
  /** Onde o cofre está sendo criado, em palavras ("PC", "Celular"), para o manifesto. */
  readonly aparelhoAgora: string;
  readonly kdf?: Kdf;
  readonly agora?: Date;
  /** A senha é um PIN (só algarismos). */
  readonly pin?: boolean;
}

/** Um aparelho como a API recebe (ao criar e ao pôr um aparelho). */
export type CorpoDoAparelho = CorpoDeCriar['aparelhos'][number];

/**
 * O corpo de um aparelho: o envelope dele selado com M (com o segredo do PRF, ou com um S_i sorteado aqui,
 * no modo servidor). Devolve também o segredo usado; um S_i sorteado (`sorteado`) é de quem chama zerar.
 */
export async function corpoDoAparelho(aparelho: AparelhoParaCriar, usuario: string, m: Uint8Array): Promise<{ corpo: CorpoDoAparelho; segredo: Bytes; sorteado: boolean }> {
  const { passkey, apelido } = aparelho;
  const comPrf = passkey.prf !== null;
  // sem PRF, o segredo do aparelho é sorteado aqui e vai para o servidor (o modo servidor, 5)
  const segredo = passkey.prf ?? novoSegredoDeAparelho();
  const envelopeId = novoId();
  let envelope: Bytes;
  try {
    envelope = await selarEnvelope(segredo, usuario, envelopeId, m);
  } catch (e) {
    // o S_i sorteado aqui ainda não foi entregue a ninguém: se não selou, é daqui zerar
    if (!comPrf) zerar(segredo);
    throw e;
  }
  return {
    corpo: {
      desafio: passkey.desafio,
      credencial: passkey.credencial,
      apelido,
      prf: comPrf,
      envelopeId,
      envelope: paraBase64url(envelope),
      ...(comPrf ? {} : { s: paraBase64url(segredo) }),
    },
    segredo,
    sorteado: !comPrf,
  };
}

export async function montarCofre(pedido: PedidoDeCriar): Promise<CofreMontado> {
  const { usuario, senha, aparelhos } = pedido;
  conferirId(usuario, 'usuário');
  if (aparelhos.length < 1 || aparelhos.length > APARELHOS_NA_CRIACAO) throw new ErroCofre('formato', 'registre um ou dois aparelhos');
  if (!senha) throw new ErroCofre('formato', 'falta a senha mestra');

  const kdf = pedido.kdf ?? KDF_PADRAO;
  const sal = novoSal();
  /** Os S_i sorteados aqui para os aparelhos sem PRF. */
  const segredos: Bytes[] = [];
  let kSenha: Bytes | null = null;
  let m: Bytes | null = null;
  let codigo: Bytes | null = null;
  try {
    kSenha = await chaveDaSenha(senha, sal, kdf);
    m = novaChaveDoMeio();
    const { v, chave } = await criarCofre(kSenha, m, usuario);
    const kAuth = await provaDaSenha(kSenha, m);

    const sorteado = await sortearCodigo();
    codigo = sorteado.bytes;
    const idRecuperacao = novoId();
    const recuperacao = {
      id: idRecuperacao,
      envelope: paraBase64url(await selarRecuperacao(codigo, usuario, m)),
      kRec: paraBase64url(await provaDoCodigo(codigo)),
    };

    const corpoAparelhos: CorpoDoAparelho[] = [];
    for (const aparelho of aparelhos) {
      const { corpo, segredo, sorteado } = await corpoDoAparelho(aparelho, usuario, m);
      if (sorteado) segredos.push(segredo);
      corpoAparelhos.push(corpo);
    }

    const manifesto: Manifesto = { contador: 0, itens: {}, lixeira: {}, mudadoEm: (pedido.agora ?? new Date()).toISOString(), aparelho: pedido.aparelhoAgora };
    const corpo: CorpoDeCriar = {
      versao: VERSAO_CRIPTO,
      kdf: { m: kdf.m, t: kdf.t, p: kdf.p },
      sal: paraBase64url(sal),
      v: paraBase64url(v),
      kAuth: paraBase64url(kAuth),
      manifesto: paraBase64url(await cifrarManifesto(chave, usuario, manifesto)),
      recuperacao,
      aparelhos: corpoAparelhos,
      ...(pedido.pin ? { pin: true } : {}),
    };
    zerar(kAuth);
    for (const { passkey } of aparelhos) {
      zerar(passkey.prf);
      passkey.prf = null;
    }
    return { corpo, codigo: sorteado.texto };
  } finally {
    zerar(kSenha, m, codigo, ...segredos);
  }
}
