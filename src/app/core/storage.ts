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

export function freezeStorage(): void {
  frozen = true;
}

export function storageFrozen(): boolean {
  return frozen;
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
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}

/** Guarda o valor em JSON; sem armazenamento, fica só nesta visita. */
export function writeJson(key: string, value: unknown): void {
  if (frozen) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}

/** Tira a chave (sem armazenamento, não há o que tirar). */
export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nada guardado */
  }
}

/**
 * Outra aba deste navegador gravou (ou tirou) a chave: `fn` roda, para esta aba acompanhar. Quem guarda
 * o estado inteiro numa chave e o regrava a cada mudança precisa disto: sem acompanhar, a aba aberta
 * desde antes regravaria o que tinha por cima do que a outra mudou (e a sincronização o mandaria de
 * volta para a nuvem). A aba que gravou não ouve a própria gravação. Devolve como parar de ouvir.
 */
export function onOtherTab(key: string, fn: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listen = (e: StorageEvent) => {
    if (e.key !== key && e.key !== null) return;
    try {
      if (e.storageArea && e.storageArea !== localStorage) return;
    } catch {
      return;
    }
    fn();
  };
  window.addEventListener('storage', listen);
  return () => window.removeEventListener('storage', listen);
}
