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
const watched = new Map<string, Set<() => void>>();
/** O texto de cada chave acompanhada como esta aba o viu por último (gravou ou ouviu). */
const seen = new Map<string, string | null>();

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
    if (watched.has(key)) seen.set(key, value);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}

/** Guarda o valor em JSON; sem armazenamento, fica só nesta visita. */
export function writeJson(key: string, value: unknown): void {
  if (frozen) return;
  try {
    const text = JSON.stringify(value);
    localStorage.setItem(key, text);
    if (watched.has(key)) seen.set(key, text);
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
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
  for (const [key, fns] of watched) {
    const now = readText(key);
    if (now === (seen.get(key) ?? null)) continue;
    seen.set(key, now);
    for (const fn of [...fns]) fn();
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
    seen.set(key, readText(key));
    fn();
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
    }
  };
}
