import { canonicalJson } from './canonical-json';

/**
 * O que o site guarda no localStorage, num jeito só. Ler ou gravar pode falhar (a cota cheia, o
 * navegador sem armazenamento, uma janela privada que não deixa): aqui a falha nunca sobe, e o que
 * não pôde ser gravado vale só até recarregar a página. Quem precisa saber que a gravação falhou
 * (as resenhas, no IndexedDB, ver `local-data.ts`) não passa por aqui.
 */

/**
 * O navegador vai ser limpo (saiu da conta, ver core/browser-reset.ts): nada mais grava até a página
 * recarregar, senão o que esta aba ainda tem na memória voltaria depois da limpeza.
 */
let frozen = false;

/** Quem acompanha cada chave (ver `onOtherTab`). */
const watched = new Map<string, Set<(before: string | null) => void>>();
/** O texto de cada chave acompanhada como esta aba o viu por último (gravou ou ouviu). */
const seen = new Map<string, string | null>();
/** O que esta aba acabou de receber de outra, sem nada dela no meio (ver `tookFromOtherTab`). */
const taken = new Map<string, string>();

export function freezeStorage(): void {
  frozen = true;
}

export function storageFrozen(): boolean {
  return frozen;
}

/**
 * Só para os testes que fazem de conta que são vários aparelhos na mesma página (eles dividem o
 * localStorage e o que cada aba viu, que no navegador são de uma aba só): sem a conferência das outras
 * abas (ver `catchUpOtherTabs` e `writeJson`), um "aparelho" não toma o outro por outra aba, e o aviso
 * de outra aba troca pelo gravado, como antes da junção.
 */
let otherTabsChecked = true;
export function checkOtherTabs(on: boolean): void {
  otherTabsChecked = on;
}

/** Só para os testes: destrava (no site, só recarregar a página destrava). */
export function thawStorage(): void {
  frozen = false;
}

/** O texto guardado na chave, ou null (nada guardado, ou sem armazenamento). */
export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** O JSON guardado na chave, ou null (nada guardado, ilegível, ou sem armazenamento). Quem lê confere a forma. */
export function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}

/** Guarda o texto; sem armazenamento, fica só nesta visita. */
export function writeText(key: string, value: string): void {
  if (frozen) return;
  try {
    localStorage.setItem(key, value);
    if (watched.has(key)) seen.set(key, value);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}

/**
 * Guarda o valor em JSON; sem armazenamento, fica só nesta visita. Numa chave acompanhada (ver
 * `onOtherTab`) que outra aba gravou e esta ainda não ouviu, não grava por cima: quem acompanha ouve na
 * hora, com o que esta aba tinha visto, junta o que as duas fizeram (ver core/tab-join.ts) e o effect
 * grava a junção.
 */
export function writeJson(key: string, value: unknown): void {
  if (frozen) return;
  try {
    const text = JSON.stringify(value);
    const fns = watched.get(key);
    if (fns && otherTabsChecked) {
      const now = readText(key);
      const before = seen.get(key) ?? null;
      if (now !== before && now !== text) {
        seen.set(key, now);
        taken.delete(key);
        for (const fn of [...fns]) fn(before);
        return;
      }
      // o que o effect grava é o que acabou de vir da outra aba: o gravado fica como ela o deixou
      const same = taken.get(key);
      taken.delete(key);
      if (same !== undefined && now !== null && same === canonicalJson(value)) return;
    }
    localStorage.setItem(key, text);
    if (fns) seen.set(key, text);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}

/**
 * Quem acompanha a chave pôs na memória o que outra aba gravou, sem mudança daqui: a passada do effect
 * que vê exatamente isto não regrava. Regravar passaria o texto dela pelo saneamento desta aba, e uma aba
 * aberta antes de uma versão nova do site tiraria os campos que ela não conhece (e a outra, ao ouvir, os
 * perderia). O que esta aba mudar depois é gravado como sempre.
 */
export function tookFromOtherTab(key: string, value: unknown): void {
  if (otherTabsChecked && watched.has(key)) taken.set(key, canonicalJson(value));
}

/** Tira a chave (sem armazenamento, não há o que tirar). */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
    if (watched.has(key)) seen.set(key, null);
  } catch {
    /* nada guardado */
  }
}

/**
 * Acompanha agora o que outra aba gravou nas chaves acompanhadas e esta ainda não ouviu: o aviso do
 * navegador chega depois, às vezes depois de esta aba pegar a vez da sincronização (ver
 * core/cloud-sync.ts), e ela enviaria o que tinha antes. Cada chave mudada chama quem a acompanha.
 */
export function catchUpOtherTabs(): void {
  if (!otherTabsChecked) return;
  for (const [key, fns] of watched) {
    const now = readText(key);
    const before = seen.get(key) ?? null;
    if (now === before) continue;
    seen.set(key, now);
    for (const fn of [...fns]) fn(before);
  }
}

/**
 * Outra aba deste navegador gravou (ou tirou) a chave: `fn` roda, para esta aba acompanhar. Quem guarda
 * o estado inteiro numa chave e o regrava a cada mudança precisa disto: sem acompanhar, a aba aberta
 * desde antes regravaria o que tinha por cima do que a outra mudou (e a sincronização o mandaria de
 * volta para a nuvem). A aba que gravou não ouve a própria gravação. Devolve como parar de ouvir.
 * `before`: a chave como esta aba a viu por último, para juntar o que ela mudou e ainda não gravou
 * (ver core/tab-join.ts).
 */
export function onOtherTab(key: string, fn: (before: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listen = (e: StorageEvent) => {
    if (e.key !== key && e.key !== null) return;
    try {
      if (e.storageArea && e.storageArea !== localStorage) return;
    } catch {
      return;
    }
    const before = seen.get(key) ?? null;
    seen.set(key, readText(key));
    // sem a conferência (os testes de vários aparelhos numa página), não se sabe o que esta aba viu
    fn(otherTabsChecked ? before : null);
  };
  window.addEventListener('storage', listen);
  let fns = watched.get(key);
  if (!fns) {
    fns = new Set();
    watched.set(key, fns);
    // quem acompanha acabou de ler a chave: é assim que esta aba a viu
    seen.set(key, readText(key));
  }
  fns.add(fn);
  return () => {
    window.removeEventListener('storage', listen);
    const set = watched.get(key);
    set?.delete(fn);
    if (set && !set.size) {
      watched.delete(key);
      seen.delete(key);
      taken.delete(key);
    }
  };
}
