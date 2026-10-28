import { DAY_MS } from './dates';
import { storageFrozen } from './storage';
/**
 * A cópia de antes da nuvem: na primeira vez que um aparelho junta (ou troca) o mural com o da conta,
 * o mural que estava aqui fica guardado inteiro, compactado, por 30 dias. Ajustes oferece para
 * baixar como um backup comum. É a rede de proteção se a junção fizer algo que a pessoa não queria.
 */
const DB_NAME = 'meu-mural:antes-da-nuvem';
const STORE = 'copias';
const KEY = 'ultima';
export const KEEP_DAYS = 30;

export interface BeforeCloudCopy {
  /** O backup, como sai de "Baixar backup". */
  blob: Blob;
  /** Quando foi guardada (ISO). */
  at: string;
}

/** Abre o banco; sem `create`, um banco que não existe não nasce (falha, e nada fica no navegador). */
function open(create: boolean): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (create) request.result.createObjectStore(STORE);
      // só ler (ou apagar a vencida) não cria o banco: depois de uma limpeza, ele não volta vazio
      else request.transaction?.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('bloqueado'));
  });
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>, create = false): Promise<T> {
  const db = await open(create);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = body(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Guarda a cópia (troca a anterior). Sem IndexedDB, não guarda: quem chama segue mesmo assim. */
export async function saveBeforeCloud(blob: Blob, now = new Date()): Promise<boolean> {
  // a página está recarregando para limpar o navegador (ver core/browser-reset.ts): gravar recriaria o banco
  if (typeof indexedDB === 'undefined' || storageFrozen()) return false;
  try {
    await run('readwrite', (s) => s.put({ blob, at: now.toISOString() } satisfies BeforeCloudCopy, KEY), true);
    return true;
  } catch {
    return false;
  }
}

/** A cópia, se existe e ainda está no prazo (a vencida é apagada). */
export async function readBeforeCloud(now = new Date()): Promise<BeforeCloudCopy | null> {
  // (a página está recarregando para limpar: o banco pode estar saindo)
  if (typeof indexedDB === 'undefined' || storageFrozen()) return null;
  try {
    const copy = (await run('readonly', (s) => s.get(KEY))) as BeforeCloudCopy | undefined;
    if (!copy) return null;
    if (now.getTime() - Date.parse(copy.at) > KEEP_DAYS * DAY_MS) {
      await run('readwrite', (s) => s.delete(KEY));
      return null;
    }
    return copy;
  } catch {
    return null;
  }
}

export { DB_NAME as BEFORE_CLOUD_DB };
