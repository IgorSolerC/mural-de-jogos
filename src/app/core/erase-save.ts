/**
 * "Apagar o save", em Ajustes: tira deste navegador tudo o que o mural guarda (resenhas, fila,
 * wishlist, as apagadas, backups de colegas, recordes e partidas dos Extras, a data do último backup),
 * menos os ajustes: o nome, as chaves de busca, as preferências, o login na nuvem e as novidades já
 * vistas ficam.
 *
 * Depois a página recarrega: cada parte do app lê o que guardou só ao subir, e assim nenhuma fica com
 * o save velho na memória.
 */

/** As chaves do localStorage que são do mural. */
const PREFIXES = ['mural-de-jogos:', 'meu-mural:'];
/** Os ajustes (ver `core/settings.ts`), o login na nuvem (ver `core/cloud-account.ts`) e as novidades vistas (ver `core/news.ts`). */
const KEEP = new Set(['mural-de-jogos:config:v1', 'meu-mural:nuvem:sessao', 'meu-mural:nuvem:conta', 'meu-mural:novidades']);
/** Os bancos do IndexedDB: as listas (`core/local-data.ts`), os backups de colegas (`core/colleague-store.ts`) e a cópia de antes da nuvem (`core/cloud-before.ts`). */
const DATABASES = ['meu-mural:dados', 'meu-mural:colegas', 'meu-mural:antes-da-nuvem'];
/** Na sessão: o save acabou de ser apagado, para Ajustes avisar depois de recarregar. */
const ERASED = 'meu-mural:save-apagado';

/** As chaves do save que estão no `storage`. */
export function saveKeys(storage: Pick<Storage, 'length' | 'key'>): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && !KEEP.has(key) && PREFIXES.some((p) => key.startsWith(p))) out.push(key);
  }
  return out;
}

export async function eraseSave(): Promise<void> {
  // o localStorage primeiro: ao subir de novo, o banco vazio copiaria o espelho que ficou lá
  try {
    for (const key of saveKeys(localStorage)) localStorage.removeItem(key);
  } catch {
    /* sem localStorage, não há o que tirar dele */
  }
  await Promise.all(DATABASES.map(deleteDatabase));
  try {
    sessionStorage.setItem(ERASED, '1');
  } catch {
    /* fica sem o aviso */
  }
}

/** O save acabou de ser apagado? Responde sim uma vez só. */
export function takeErased(): boolean {
  try {
    const was = sessionStorage.getItem(ERASED) !== null;
    sessionStorage.removeItem(ERASED);
    return was;
  } catch {
    return false;
  }
}

/**
 * As conexões abertas (esta aba e as outras) fecham sozinhas quando o banco vai ser apagado; uma aba
 * que demora não segura a página para sempre.
 */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve();
    const timer = setTimeout(resolve, 4000);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = done;
  });
}
