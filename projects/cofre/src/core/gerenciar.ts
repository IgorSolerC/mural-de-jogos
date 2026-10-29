/**
 * Gerenciar o cofre aberto (seção 8.5 do PLANO-COFRE.md), sem tela: pôr e tirar aparelhos, trocar a senha
 * mestra e gerar um código de recuperação novo. Tudo usa os segredos que só existem com o cofre aberto
 * (`SegredosDoAberto`: M, V, o sal e o Argon2id); o servidor recebe só selados e provas.
 *
 * O servidor só faz cada uma com a confirmação de agora (`core/confirmar.ts`): a passkey de novo ou a
 * senha mestra. Trocar a senha já pede a atual, e é ela que confirma.
 */
import type { CofreAberto, SegredosDoAberto } from './abrir';
import type { ApiCofre, Confirmacao } from './api';
import { paraBase64url, zerar } from './bytes';
import { sortearCodigo } from './codigo';
import { type AparelhoParaCriar, corpoDoAparelho } from './criar';
import { chaveDaSenha, ErroCofre, KDF_PADRAO, novoId, novoSal, provaDaSenha, provaDoCodigo, reselarCofre, selarRecuperacao, VERSAO_CRIPTO } from './crypto';

function segredosDe(cofre: CofreAberto): SegredosDoAberto {
  if (!cofre.segredos) throw new ErroCofre('formato', 'tranque e abra o cofre de novo para gerenciar');
  return cofre.segredos;
}

/**
 * Põe um aparelho: a passkey registrada agora (com o desafio de `api.desafioDeRegistro()`) e o envelope
 * dele, selado com M. O segredo do PRF da passkey é zerado quando dá certo.
 */
export async function porAparelho(api: ApiCofre, cofre: CofreAberto, aparelho: AparelhoParaCriar, confirmar: Confirmacao): Promise<{ id: string; prf: boolean }> {
  const { m } = segredosDe(cofre);
  const { corpo, segredo, sorteado } = await corpoDoAparelho(aparelho, cofre.usuario, m);
  try {
    const resposta = await api.porAparelho(corpo, confirmar);
    zerar(aparelho.passkey.prf);
    aparelho.passkey.prf = null;
    return { id: resposta.id, prf: resposta.prf };
  } finally {
    if (sorteado) zerar(segredo);
  }
}

/**
 * Troca a senha mestra: confere a atual abrindo V com ela, sela a mesma chave do cofre com a nova (sal
 * novo, o Argon2id padrão) e manda V e a prova nova. A força da nova é conferida por quem chama; `pin`: a
 * nova é um PIN (o servidor só guarda isso para a tela de abrir mostrar o teclado de números).
 */
export async function trocarSenha(api: ApiCofre, cofre: CofreAberto, atual: string, nova: string, pin = false): Promise<void> {
  const segredos = segredosDe(cofre);
  if (!nova) throw new ErroCofre('formato', 'falta a senha nova');
  const sal = novoSal();
  let kAntiga = null;
  let kNova = null;
  let kAuth = null;
  let kAuthAtual = null;
  try {
    kAntiga = await chaveDaSenha(atual, segredos.sal, segredos.kdf);
    kNova = await chaveDaSenha(nova, sal, KDF_PADRAO);
    // reselarCofre só sela se a senha atual abrir o V de agora ("abrir" se não abrir)
    const v = await reselarCofre(kAntiga, kNova, segredos.m, cofre.usuario, segredos.v);
    kAuth = await provaDaSenha(kNova, segredos.m);
    // a prova da senha atual é a confirmação de agora: o servidor confere antes de trocar
    kAuthAtual = await provaDaSenha(kAntiga, segredos.m);
    await api.trocarSenha(
      { versao: VERSAO_CRIPTO, kdf: { ...KDF_PADRAO }, sal: paraBase64url(sal), v: paraBase64url(v), kAuth: paraBase64url(kAuth), pin },
      { kAuth: paraBase64url(kAuthAtual) },
    );
    segredos.v = v;
    segredos.sal = sal;
    segredos.kdf = { ...KDF_PADRAO };
  } finally {
    zerar(kAntiga, kNova, kAuth, kAuthAtual);
  }
}

/** Um código de recuperação novo: o antigo para de valer na hora. Devolve o texto, para o kit (uma vez). */
export async function novoCodigo(api: ApiCofre, cofre: CofreAberto, confirmar: Confirmacao): Promise<string> {
  const { m } = segredosDe(cofre);
  const { bytes, texto } = await sortearCodigo();
  try {
    await api.novoCodigo({ id: novoId(), envelope: paraBase64url(await selarRecuperacao(bytes, cofre.usuario, m)), kRec: paraBase64url(await provaDoCodigo(bytes)) }, confirmar);
    return texto;
  } finally {
    zerar(bytes);
  }
}
