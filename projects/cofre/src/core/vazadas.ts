/**
 * O aviso de senha vazada (seção 10 do PLANO-COFRE.md), pela base do Have I Been Pwned, sem mandar a
 * senha nem o hash dela: o SHA-1 é feito aqui, só os 5 primeiros caracteres vão para
 * `api.pwnedpasswords.com/range/` (com `Add-Padding`, para o tamanho da resposta não dizer nada), e o resto
 * é conferido aqui mesmo. Roda quando a pessoa pede, ou uma vez a cada abertura com "Conferir os vazamentos
 * ao abrir o cofre" ligado (17.24), em segundo plano e devagar (`Ritmo`). A senha que aparece fica marcada
 * dentro do próprio item, cifrada, com o resumo dela (`resumoDaSenha`): trocada a senha, a marca não vale
 * mais (core/itens.ts). Sem rede ou com a base fora do ar, não avisa nada e não atrapalha o cofre.
 */
import { paraHex, utf8, zerar } from './bytes';

const BASE = 'https://api.pwnedpasswords.com/range/';
/** Quantos caracteres do SHA-1 a marca de vazada guarda (48 bits): só para saber se a senha mudou desde a conferência. */
export const RESUMO = 12;

/** O SHA-1 da senha, em hexadecimal maiúsculo (o formato da base). Os bytes da senha são zerados depois. */
export async function sha1(senha: string): Promise<string> {
  const bytes = utf8(senha);
  try {
    return paraHex(new Uint8Array(await crypto.subtle.digest('SHA-1', bytes))).toUpperCase();
  } finally {
    zerar(bytes);
  }
}

/** Lê a resposta da base: "SUFIXO:VEZES" por linha (as de preenchimento têm 0 vezes). */
export function lerFaixa(texto: string): Map<string, number> {
  const faixa = new Map<string, number>();
  for (const linha of texto.split(/\r?\n/)) {
    const [sufixo, vezes] = linha.trim().split(':');
    const n = Number(vezes);
    if (sufixo && /^[0-9A-F]{35}$/.test(sufixo) && n > 0) faixa.set(sufixo, n);
  }
  return faixa;
}

/** O resumo que a marca de vazada guarda: o começo do SHA-1 da senha (só mora dentro do item cifrado). */
export async function resumoDaSenha(senha: string): Promise<string> {
  return (await sha1(senha)).slice(0, RESUMO);
}

/**
 * O ritmo dos pedidos à base: quantos ao mesmo tempo e a pausa depois de cada um. A conferência pedida
 * pela pessoa vai rápido; a da abertura, em segundo plano, vai devagar (`RITMO_DA_ABERTURA`), para não
 * despejar dezenas de pedidos de uma vez numa base que é de graça.
 */
export interface Ritmo {
  readonly aoMesmoTempo: number;
  readonly pausaMs: number;
}
export const RITMO_PEDIDO: Ritmo = { aoMesmoTempo: 6, pausaMs: 0 };
export const RITMO_DA_ABERTURA: Ritmo = { aoMesmoTempo: 2, pausaMs: 150 };

/** O que a base disse de uma senha: o resumo dela e quantas vezes apareceu (0: nenhuma; null: não deu para conferir). */
export interface Conferida {
  readonly resumo: string;
  readonly vezes: number | null;
}

/**
 * Confere várias senhas: devolve, para cada uma, o resumo e quantas vezes ela aparece em vazamentos. Senhas
 * com o mesmo começo de hash fazem um pedido só, e os pedidos seguem o ritmo.
 */
export async function conferirSenhas(senhas: readonly string[], buscar: typeof fetch = (url, init) => fetch(url, init), ritmo: Ritmo = RITMO_PEDIDO): Promise<Conferida[]> {
  const hashes = await Promise.all(senhas.map((s) => (s ? sha1(s) : Promise.resolve(''))));
  const prefixos = [...new Set(hashes.filter((h) => h).map((h) => h.slice(0, 5)))];
  const faixas = new Map<string, Map<string, number> | null>();
  const pedir = (prefixo: string) =>
    buscar(`${BASE}${prefixo}`, { headers: { 'Add-Padding': 'true' }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', mode: 'cors' })
      .then(async (r) => (r.ok ? lerFaixa(await r.text()) : null))
      .catch(() => null);
  // uma fila com N trabalhando ao mesmo tempo; cada um pega o próximo começo de hash
  let proximo = 0;
  const trabalhar = async () => {
    while (proximo < prefixos.length) {
      const prefixo = prefixos[proximo++]!;
      faixas.set(prefixo, await pedir(prefixo));
      if (ritmo.pausaMs > 0 && proximo < prefixos.length) await new Promise((ok) => setTimeout(ok, ritmo.pausaMs));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(ritmo.aoMesmoTempo, prefixos.length)) }, trabalhar));
  return hashes.map((h) => {
    if (!h) return { resumo: '', vezes: 0 };
    const f = faixas.get(h.slice(0, 5));
    return { resumo: h.slice(0, RESUMO), vezes: f ? (f.get(h.slice(5)) ?? 0) : null };
  });
}

/** Só as vezes de cada senha (0: nenhuma; null: não deu para conferir). */
export async function conferirVazadas(senhas: readonly string[], buscar?: typeof fetch, ritmo?: Ritmo): Promise<(number | null)[]> {
  return (await conferirSenhas(senhas, buscar, ritmo)).map((c) => c.vezes);
}
