/**
 * O login com o Google na página (seções 5 e 8.1 do PLANO-COFRE.md): o fluxo de código com PKCE, sem
 * carregar nada do Google aqui. A página sai para o Google com um `state` e o desafio do PKCE, e volta
 * em `/entrar` com o código; quem troca o código é a API (que tem o client secret).
 *
 * A única coisa que o cofre guarda no aparelho está aqui (seção 7.4): o `state` e o verificador do
 * PKCE ficam no `sessionStorage` entre sair para o Google e voltar, e somem na volta, deu certo ou não.
 * Não são segredos do cofre. Uma regra dos testes (regras.test.mjs) confere que nenhum outro arquivo
 * usa o `sessionStorage`.
 */
import { aleatorios, paraBase64url, utf8 } from './bytes';

const CHAVE = 'cofre:login';
/** Mais que isso entre sair e voltar, o login não vale (alguém pode ter deixado a aba aberta). */
const PRAZO_MS = 10 * 60_000;
const GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth';

/** O que precisa sobreviver à ida ao Google. */
interface Pendente {
  readonly state: string;
  readonly verificador: string;
  readonly criadoEm: number;
}

/** Onde a página guarda o pendente: o `sessionStorage` (ou um de mentira, nos testes). */
export interface Guarda {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

/** A guarda de verdade: o `sessionStorage` desta aba (some quando a aba fecha). */
export const guardaDaAba: Guarda = {
  getItem: (chave) => sessionStorage.getItem(chave),
  setItem: (chave, valor) => sessionStorage.setItem(chave, valor),
  removeItem: (chave) => sessionStorage.removeItem(chave),
};

/** O desafio do PKCE (RFC 7636, S256): o SHA-256 do verificador, em base64url. */
export async function desafioPkce(verificador: string): Promise<string> {
  return paraBase64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(verificador))));
}

/**
 * Prepara a ida ao Google e devolve o endereço: guarda o `state` e o verificador e monta a URL com o
 * desafio, só o escopo `openid` e a escolha da conta.
 */
export async function urlDoLogin(clientId: string, origem: string, guarda: Guarda = guardaDaAba, agora = Date.now()): Promise<string> {
  const pendente: Pendente = { state: paraBase64url(aleatorios(32)), verificador: paraBase64url(aleatorios(32)), criadoEm: agora };
  guarda.setItem(CHAVE, JSON.stringify(pendente));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origem}/entrar`,
    response_type: 'code',
    scope: 'openid',
    state: pendente.state,
    code_challenge: await desafioPkce(pendente.verificador),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${GOOGLE}?${params}`;
}

export type MotivoLogin =
  /** A pessoa cancelou no Google (ou o Google recusou). */
  | 'cancelado'
  /** O `state` não bate, ou não há login pendente nesta aba: o login não começou aqui. */
  | 'outra-origem'
  /** Passou do prazo entre sair e voltar. */
  | 'vencido'
  /** A volta veio sem o código. */
  | 'incompleto';

export type VoltaDoLogin = { readonly ok: true; readonly codigo: string; readonly verificador: string } | { readonly ok: false; readonly motivo: MotivoLogin };

/**
 * Lê a volta do Google (os parâmetros de `/entrar`). Quem chama limpa a URL antes de qualquer outra coisa
 * (`history.replaceState`), para o código não ficar no histórico; aqui o pendente sai da guarda na hora,
 * desse certo ou não: cada ida ao Google vale uma volta.
 */
export function lerVolta(busca: string, guarda: Guarda = guardaDaAba, agora = Date.now()): VoltaDoLogin {
  const bruto = guarda.getItem(CHAVE);
  guarda.removeItem(CHAVE);
  const params = new URLSearchParams(busca);
  if (params.has('error')) return { ok: false, motivo: 'cancelado' };
  let pendente: Pendente | null = null;
  try {
    pendente = bruto ? (JSON.parse(bruto) as Pendente) : null;
  } catch {
    pendente = null;
  }
  const state = params.get('state');
  if (!pendente || typeof pendente.state !== 'string' || typeof pendente.verificador !== 'string' || !state || state !== pendente.state) {
    return { ok: false, motivo: 'outra-origem' };
  }
  if (!Number.isFinite(pendente.criadoEm) || agora - pendente.criadoEm > PRAZO_MS || agora < pendente.criadoEm) return { ok: false, motivo: 'vencido' };
  const codigo = params.get('code');
  if (!codigo) return { ok: false, motivo: 'incompleto' };
  return { ok: true, codigo, verificador: pendente.verificador };
}

export const MENSAGENS_DO_LOGIN: Record<MotivoLogin, string> = {
  cancelado: 'O login com o Google foi cancelado.',
  'outra-origem': 'Este login não começou aqui. Entre de novo por esta página.',
  vencido: 'O login demorou demais. Entre de novo.',
  incompleto: 'O Google não mandou o código. Entre de novo.',
};

/**
 * O aparelho, em palavras, para o histórico do cofre ("Chrome no Windows"). No iPhone e no iPad, o Chrome,
 * o Firefox e o Edge têm nome próprio no agente (CriOS, FxiOS, EdgiOS) e o "Safari/" de todos.
 */
export function descreverAparelho(agente: string): string {
  const navegador = /Edg(A|iOS)?\//.test(agente)
    ? 'Edge'
    : /(Firefox|FxiOS)\//.test(agente)
      ? 'Firefox'
      : /(Chrome|CriOS)\//.test(agente)
        ? 'Chrome'
        : /Safari\//.test(agente)
          ? 'Safari'
          : 'Navegador';
  const sistema = /Android/.test(agente)
    ? 'Android'
    : /iPad/.test(agente)
      ? 'iPad'
      : /iPhone|iPod/.test(agente)
        ? 'iPhone'
        : /Windows/.test(agente)
          ? 'Windows'
          : /Mac OS X/.test(agente)
            ? 'Mac'
            : /Linux/.test(agente)
              ? 'Linux'
              : 'outro sistema';
  return `${navegador} no ${sistema}`;
}
