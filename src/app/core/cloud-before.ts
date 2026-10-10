/**
 * A cópia de antes da nuvem: na primeira vez que um aparelho junta (ou troca) o mural com o da conta,
 * o mural que estava aqui fica guardado inteiro, compactado, por 30 dias. Ajustes oferece para
 * baixar como um backup comum. É a rede de proteção se a junção fizer algo que a pessoa não queria.
 */
const DB_NAME = 'meu-mural:antes-da-nuvem';
const STORE = 'copias';
const KEY = 'ultima';
export const KEEP_DAYS = 30;
const DAY = 86_400_000;

export interface BeforeCloudCopy {
  /** O backup, como sai de "Baixar backup". */
  blob: Blob;
  /** Quando foi guardada (ISO). */
  at: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('bloqueado'));
  });
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
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
  if (typeof indexedDB === 'undefined') return false;
  try {
    await run('readwrite', (s) => s.put({ blob, at: now.toISOString() } satisfies BeforeCloudCopy, KEY));
    return true;
  } catch {
    return false;
  }
}

/** A cópia, se existe e ainda está no prazo (a vencida é apagada). */
export async function readBeforeCloud(now = new Date()): Promise<BeforeCloudCopy | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const copy = (await run('readonly', (s) => s.get(KEY))) as BeforeCloudCopy | undefined;
    if (!copy) return null;
    if (now.getTime() - Date.parse(copy.at) > KEEP_DAYS * DAY) {
      await run('readwrite', (s) => s.delete(KEY));
      return null;
    }
    return copy;
  } catch {
    return null;
  }
}

export { DB_NAME as BEFORE_CLOUD_DB };
