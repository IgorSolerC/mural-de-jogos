/**
 * A carência do aparelho (17.23 do PLANO-COFRE.md): por 24 horas depois de abrir o cofre com o Google e a
 * passkey, este aparelho abre de novo só com a senha mestra. Ligada por padrão; desliga nos Ajustes.
 *
 * Ao abrir com a passkey, a página sorteia um token e uma chave G, sela a chave do meio M com G (um
 * envelope como o de um aparelho, com o id da carência) e manda o envelope e o token junto da prova da
 * senha. O servidor guarda o envelope e o hash do token; o aparelho guarda o token, G e de quem é. Para
 * abrir pela carência, o token troca-se no servidor pelo envelope e por uma sessão de entrada; G abre M,
 * e a senha faz o resto, como sempre. O servidor confere o prazo, os erros (3) e se a carência está
 * ligada; G nunca sai daqui, e o envelope nunca fica aqui.
 *
 * É a única coisa do cofre no `localStorage` (a terceira exceção da seção 7.4, conferida pelas regras dos
 * testes): sem ela, a carência não sobrevive a trancar (que recarrega a página) nem a fechar a aba. Quem
 * levar o aparelho dentro do prazo ainda precisa da senha, com 3 tentativas. Esquecer o aparelho (na porta
 * ou nos Ajustes), desligar, "Trancar todos", congelar e tirar um aparelho apagam a carência.
 */
import type { ApiCofre, CorpoDaCarencia, DesafioDeAbrir } from './api';
import { abrir, type CofreAberto, senhaDoDesafio } from './abrir';
import { aleatorios, type Bytes, deBase64url, paraBase64url, zerar } from './bytes';
import { abrirEnvelope, ErroCofre, novoId, selarEnvelope, TAM_CHAVE } from './crypto';
import type { Guarda } from './entrar';

const CHAVE = 'cofre:carencia';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CODIGO = /^[A-Z0-9]{8}$/;

/** O que o aparelho guarda da carência. */
export interface Carencia {
  readonly id: string;
  /** Troca-se no servidor pelo envelope (lá, só o hash dele). */
  readonly token: string;
  /** G, em base64url: abre o envelope. Nunca sai do aparelho. */
  readonly chave: string;
  /** O id e o código da conta do Murall (o id entra no AAD do envelope). */
  readonly usuario: string;
  readonly codigo: string;
  /** O prazo que o servidor deu (24 horas depois do Google e da passkey). */
  readonly expiraEm: string;
  /** A senha mestra é um PIN (o campo mostra o teclado de números). */
  readonly pin: boolean;
}

/** O armário do aparelho: o `localStorage` desta origem (nos testes, um de mentira). */
export const armarioDoAparelho: Guarda = {
  getItem: (chave) => localStorage.getItem(chave),
  setItem: (chave, valor) => localStorage.setItem(chave, valor),
  removeItem: (chave) => localStorage.removeItem(chave),
};

/** Sem armário (os testes, a demonstração): nada fica, e o aparelho não tem carência. */
export const semArmario: Guarda = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

/** O armário pode recusar (navegação privada, armazenamento bloqueado): aí o aparelho fica sem carência. */
function tentar<T>(fazer: () => T, senao: T): T {
  try {
    return fazer();
  } catch {
    return senao;
  }
}

/** A carência guardada, se ainda vale pelo relógio daqui; a vencida ou estragada sai do armário. */
export function lerCarencia(armario: Guarda, agora = Date.now()): Carencia | null {
  const bruto = tentar(() => armario.getItem(CHAVE), null);
  if (bruto === null) return null;
  const c = tentar(() => JSON.parse(bruto) as Partial<Record<keyof Carencia, unknown>> | null, null);
  const valida =
    !!c &&
    typeof c.id === 'string' &&
    ID.test(c.id) &&
    typeof c.token === 'string' &&
    TOKEN.test(c.token) &&
    typeof c.chave === 'string' &&
    deBase64url(c.chave)?.length === TAM_CHAVE &&
    typeof c.usuario === 'string' &&
    ID.test(c.usuario) &&
    typeof c.codigo === 'string' &&
    CODIGO.test(c.codigo) &&
    typeof c.expiraEm === 'string' &&
    Date.parse(c.expiraEm) > agora &&
    typeof c.pin === 'boolean';
  if (!valida) {
    esquecerAqui(armario);
    return null;
  }
  return c as unknown as Carencia;
}

export function guardarCarencia(armario: Guarda, carencia: Carencia): void {
  tentar(() => armario.setItem(CHAVE, JSON.stringify(carencia)), undefined);
}

/** Tira a carência do armário (só daqui; no servidor, `esquecerCarencia`). */
export function esquecerAqui(armario: Guarda): void {
  tentar(() => armario.removeItem(CHAVE), undefined);
}

/** "Esquecer este aparelho": some daqui e do servidor (se o servidor não responder, daqui já saiu). */
export async function esquecerCarencia(api: ApiCofre, armario: Guarda, agora = Date.now()): Promise<void> {
  const carencia = lerCarencia(armario, agora);
  esquecerAqui(armario);
  if (carencia) await api.esquecerCarencia(carencia.token).catch(() => undefined);
}

/** A carência sorteada antes de abrir: o corpo para a API e o que guardar se o servidor aceitar. */
export interface CarenciaNova {
  readonly corpo: CorpoDaCarencia;
  /** Monta o que o aparelho guarda, com o prazo que o servidor deu. */
  guardavel(expiraEm: string, pin: boolean): Carencia;
}

/** Sorteia o token e G e sela M com G. M continua de quem chamou; G só fica em texto, para o armário. */
export async function prepararCarencia(m: Uint8Array, usuario: string, codigo: string, anterior: Carencia | null): Promise<CarenciaNova> {
  const id = novoId();
  const token = paraBase64url(aleatorios(32));
  const g = aleatorios(TAM_CHAVE);
  try {
    const envelope = paraBase64url(await selarEnvelope(g, usuario, id, m));
    const chave = paraBase64url(g);
    return {
      corpo: { id, token, envelope, ...(anterior ? { anterior: anterior.token } : {}) },
      guardavel: (expiraEm, pin) => ({ id, token, chave, usuario, codigo, expiraEm, pin }),
    };
  } finally {
    zerar(g);
  }
}

/**
 * Abre o cofre pela carência: o token vira a sessão de entrada e o envelope (a API já passa a usar a
 * sessão), G abre M, e a senha faz o resto (a prova vai para `POST /api/cofre/abrir`). Uma senha errada vem
 * da API como `ErroApi` ("senha-errada"); a carência que acabou, como "carencia-invalida".
 */
export async function abrirPelaCarencia(api: ApiCofre, carencia: Carencia, senha: string, aparelhoDescrito: string, aparelho: string): Promise<CofreAberto> {
  const entrada = await api.entrarPelaCarencia(carencia.token, aparelhoDescrito);
  if (entrada.usuario !== carencia.usuario) throw new ErroCofre('abrir', 'a carência é de outra conta');
  // as passkeys do cofre vão com o aberto, como as do desafio de abrir (as senhas protegidas pedem uma)
  const allowCredentials = (entrada.passkeys ?? []).map((p) => ({ type: 'public-key' as const, id: p.id, ...(p.transports?.length ? { transports: p.transports } : {}) }));
  const desafio: Pick<DesafioDeAbrir, 'versao' | 'sal' | 'kdf'> & { publicKey: { allowCredentials: typeof allowCredentials } } = {
    versao: entrada.versao,
    sal: entrada.sal,
    kdf: entrada.kdf,
    publicKey: { allowCredentials },
  };
  let g: Bytes | null = null;
  let m: Bytes | null = null;
  let kSenha: Bytes | null = null;
  try {
    g = deBase64url(carencia.chave);
    const envelope = deBase64url(entrada.envelope?.dados ?? '');
    if (!g || !envelope) throw new ErroCofre('formato', 'envelope da carência inválido');
    m = await abrirEnvelope(g, carencia.usuario, carencia.id, envelope);
    kSenha = await senhaDoDesafio(senha, desafio);
    const [mAqui, kAqui] = [m, kSenha];
    // abrir() zera os dois quando chega lá
    m = null;
    kSenha = null;
    return await abrir(api, carencia.usuario, kAqui, mAqui, aparelho, desafio);
  } finally {
    zerar(g, m, kSenha);
  }
}
