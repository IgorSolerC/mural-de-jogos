/**
 * Confirmar de novo quem está com o cofre aberto, para mostrar uma senha que pede a passkey (seção 17.18
 * do PLANO-COFRE.md), sem tela.
 *
 * O item já está decifrado na memória (o cofre abre tudo de uma vez), então isto é uma trava da tela, não
 * uma cifra à parte: protege a senha de quem senta na frente do cofre aberto, não de quem já roda código na
 * página. Por isso a assinatura não vai ao servidor: o desafio é sorteado aqui, e o que vale é o aparelho
 * ter conferido a pessoa (a digital, o rosto, o PIN do Windows Hello: a flag UV) com uma passkey deste
 * cofre. Sem a passkey à mão, a senha mestra serve: ela abre V de novo com o Argon2id, como ao abrir.
 */
import type { CofreAberto } from './abrir';
import { aleatorios, deBase64url, paraBase64url, zerar } from './bytes';
import { abrirCofre, chaveDaSenha, ErroCofre } from './crypto';
import { type Autenticador, autenticadorDoNavegador, ErroPasskey } from './passkey';

/** Uma passkey do cofre, como o desafio de abrir lista (`allowCredentials`). */
export interface PasskeyDoCofre {
  readonly id: string;
  readonly transports?: readonly string[];
}

/** O bit "o usuário foi verificado" dos flags do authenticatorData (byte 32). */
const UV = 0x04;

/** Dá para confirmar pela passkey (o cofre foi aberto com o desafio, que lista as passkeys dele). */
export function podeConfirmarComPasskey(cofre: Pick<CofreAberto, 'passkeys'>): boolean {
  return !!cofre.passkeys?.length;
}

/** Dá para confirmar pela senha mestra (o cofre aberto guarda V, o sal e o Argon2id). */
export function podeConfirmarComSenha(cofre: Pick<CofreAberto, 'segredos'>): boolean {
  return !!cofre.segredos;
}

/**
 * Pede a passkey de novo, com a verificação do usuário obrigatória. Dá certo só se quem assinou é uma
 * passkey deste cofre e o aparelho diz que conferiu a pessoa; senão, `ErroPasskey`.
 */
export async function confirmarComPasskey(cofre: Pick<CofreAberto, 'passkeys'>, rpId: string, autenticador: Autenticador = autenticadorDoNavegador): Promise<void> {
  const passkeys = cofre.passkeys ?? [];
  if (!passkeys.length) throw new ErroPasskey('sem-suporte');
  let cred: PublicKeyCredential;
  try {
    const c = await autenticador.pegar({
      publicKey: {
        challenge: aleatorios(32),
        rpId,
        allowCredentials: passkeys.map((p) => ({
          type: 'public-key',
          id: deBase64url(p.id) ?? new Uint8Array(0),
          ...(p.transports?.length ? { transports: [...p.transports] as AuthenticatorTransport[] } : {}),
        })),
        userVerification: 'required',
        timeout: 120_000,
      },
    });
    if (!c || c.type !== 'public-key') throw new ErroPasskey('falhou');
    cred = c as PublicKeyCredential;
  } catch (e) {
    if (e instanceof ErroPasskey) throw e;
    const nome = e instanceof DOMException ? e.name : '';
    throw new ErroPasskey(nome === 'NotAllowedError' || nome === 'AbortError' ? 'cancelada' : nome === 'SecurityError' ? 'endereco' : 'falhou');
  }
  if (!passkeys.some((p) => p.id === paraBase64url(new Uint8Array(cred.rawId)))) throw new ErroPasskey('falhou');
  const dados = new Uint8Array((cred.response as AuthenticatorAssertionResponse).authenticatorData);
  if (dados.length < 37 || !(dados[32]! & UV)) throw new ErroPasskey('cancelada');
}

/** Confere a senha mestra abrindo V de novo; errada, `ErroCofre` ("abrir"). */
export async function confirmarComSenha(cofre: Pick<CofreAberto, 'segredos' | 'usuario'>, senha: string): Promise<void> {
  const segredos = cofre.segredos;
  if (!segredos) throw new ErroCofre('formato', 'tranque e abra o cofre de novo');
  if (!senha) throw new ErroCofre('abrir', 'falta a senha');
  let kSenha: Uint8Array | null = null;
  try {
    kSenha = await chaveDaSenha(senha, segredos.sal, segredos.kdf);
    try {
      await abrirCofre(kSenha, segredos.m, cofre.usuario, segredos.v);
    } catch {
      throw new ErroCofre('abrir', 'senha errada');
    }
  } finally {
    zerar(kSenha);
  }
}
