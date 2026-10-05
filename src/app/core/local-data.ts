import { Injectable } from '@angular/core';

/**
 * Onde moram as resenhas, a fila, a wishlist e as apagadas: no IndexedDB, que não tem o teto de uns
 * 5 MB do localStorage.
 *
 * A mudança não pode perder nada de quem já usava o mural, então:
 *
 * - **Migração:** na primeira abertura desta versão, o texto de cada chave do localStorage é copiado,
 *   igualzinho, para o IndexedDB, junto com a marca de "migrado", numa transação só. Se ela não
 *   completar, nada muda: o mural segue no localStorage como antes e tenta de novo na próxima vez.
 * - **Nada é apagado:** o localStorage continua guardando uma cópia (o espelho), atualizada a cada
 *   gravação enquanto couber. É dela que uma versão antiga do site (aberta offline, pelo cache) lê.
 * - **Versão antiga mexeu:** cada espelho gravado deixa uma impressão digital. Se, ao abrir, o texto
 *   do localStorage não bate com a impressão, quem gravou foi outra versão: o que está lá é juntado
 *   ao do IndexedDB como um backup (o mais novo de cada ficha fica, as apagadas continuam apagadas).
 *   Um espelho que deixou de caber não confunde: a impressão antiga ainda bate com o texto antigo.
 * - **Sem IndexedDB** (navegador antigo, alguma aba anônima): tudo segue no localStorage, como antes.
 *
 * O valor de cada chave é o mesmo texto JSON que ia para o localStorage, então ler, limpar e juntar
 * continua igual. A leitura é síncrona: `load()` roda antes do app subir (ver `app.config.ts`) e
 * deixa tudo na memória.
 */

/** As chaves que moram aqui (as mesmas do localStorage, para a cópia e a migração). */
export const DATA_KEYS = [
  'mural-de-jogos:resenhas:v1',
  'mural-de-jogos:pendentes:v1',
  'mural-de-jogos:desejos:v1',
  'mural-de-jogos:apagadas:v1',
] as const;
export type DataKey = (typeof DATA_KEYS)[number];

const DB_NAME = 'meu-mural:dados';
const STORE = 'chaves';
/** No IndexedDB: quando o localStorage foi copiado para cá. */
const MIGRATED = 'migrado';
/** No localStorage: a impressão digital de cada espelho que esta versão gravou. */
const MIRROR_STAMPS = 'mural-de-jogos:espelho:v1';
const CHANNEL = 'meu-mural:dados';

type Mode = 'local' | 'indexeddb';

@Injectable({ providedIn: 'root' })
export class LocalData {
  /** Até `load()` dar certo, tudo vem e vai direto do localStorage (é o que os testes usam). */
  private mode: Mode = 'local';
  private readonly cache = new Map<DataKey, string | null>();
  private db: IDBDatabase | null = null;
  private channel: BroadcastChannel | null = null;
  /** O que uma versão antiga deixou no localStorage depois da migração, para juntar. */
  private foreign: Partial<Record<DataKey, string>> | null = null;
  private readonly listeners: ((key: DataKey) => void)[] = [];

  /** Onde os dados estão agora (para Ajustes e para os testes). */
  get where(): Mode {
    return this.mode;
  }

  async load(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch {
      return; // sem IndexedDB: segue no localStorage
    }
    try {
      const stored = await readAll(db);
      if (stored.get(MIGRATED) == null) {
        const copied = new Map<DataKey, string | null>();
        for (const key of DATA_KEYS) copied.set(key, safeGet(key));
        await writeMany(db, [
          ...[...copied].filter(([, v]) => v !== null).map(([k, v]) => [k, v] as [string, string]),
          [MIGRATED, new Date().toISOString()],
        ]);
        for (const [k, v] of copied) this.cache.set(k, v);
        // o que está no localStorage agora é exatamente o que foi copiado: vale como espelho nosso
        this.stampAll();
      } else {
        const stamps = readStamps();
        const foreign: Partial<Record<DataKey, string>> = {};
        let any = false;
        for (const key of DATA_KEYS) {
          const value = stored.get(key);
          this.cache.set(key, typeof value === 'string' ? value : null);
          const mirror = safeGet(key);
          if (mirror !== null && mirror !== value && stamps[key] !== stamp(mirror)) {
            foreign[key] = mirror;
            any = true;
          }
        }
        if (any) {
          // o resto das chaves vai junto (é igual ao daqui ou mais velho; juntar não muda nada)
          for (const key of DATA_KEYS) foreign[key] ??= safeGet(key) ?? undefined;
          this.foreign = foreign;
        }
      }
    } catch {
      db.close();
      this.cache.clear();
      return; // a cópia não completou: nada mudou, segue no localStorage e tenta de novo depois
    }
    this.db = db;
    this.mode = 'indexeddb';
    db.onversionchange = () => db.close();
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e) => void this.reload(e.data as DataKey);
    }
  }

  getItem(key: DataKey): string | null {
    if (this.mode === 'local') return localStorage.getItem(key);
    return this.cache.get(key) ?? null;
  }

  /**
   * Grava. No localStorage, grava na hora e um erro (cota cheia) é lançado, como sempre foi. No
   * IndexedDB, devolve a promessa da gravação, que falha quando ela não completa; o espelho que não
   * coube não é erro.
   */
  setItem(key: DataKey, value: string): Promise<void> | void {
    if (this.mode === 'local') {
      localStorage.setItem(key, value);
      return;
    }
    this.cache.set(key, value);
    this.mirror(key, value);
    return writeMany(this.db!, [[key, value]]).then(() => this.channel?.postMessage(key));
  }

  /** Outra aba gravou esta chave: o valor novo já está em `getItem`. */
  onExternalChange(listener: (key: DataKey) => void): void {
    this.listeners.push(listener);
    if (this.listeners.length === 1 && typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (this.mode === 'local' && (DATA_KEYS as readonly string[]).includes(e.key ?? '')) this.emit(e.key as DataKey);
      });
    }
  }

  /** O que uma versão antiga deixou no localStorage para juntar, uma vez só. */
  takeForeign(): Partial<Record<DataKey, string>> | null {
    const f = this.foreign;
    this.foreign = null;
    return f;
  }

  private emit(key: DataKey): void {
    for (const l of this.listeners) l(key);
  }

  private async reload(key: DataKey): Promise<void> {
    if (!this.db || !(DATA_KEYS as readonly string[]).includes(key)) return;
    try {
      const value = (await readAll(this.db)).get(key);
      this.cache.set(key, typeof value === 'string' ? value : null);
      this.emit(key);
    } catch {
      /* fica o que estava; a próxima gravação daqui ou de lá resolve */
    }
  }

  private mirror(key: DataKey, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      return; // não coube: o IndexedDB tem tudo; a impressão antiga continua batendo com o texto antigo
    }
    try {
      const stamps = readStamps();
      stamps[key] = stamp(value);
      localStorage.setItem(MIRROR_STAMPS, JSON.stringify(stamps));
    } catch {
      /* sem a impressão, a próxima abertura junta o espelho, que é igual: não muda nada */
    }
  }

  private stampAll(): void {
    try {
      const stamps: Record<string, string> = {};
      for (const key of DATA_KEYS) {
        const v = localStorage.getItem(key);
        if (v !== null) stamps[key] = stamp(v);
      }
      localStorage.setItem(MIRROR_STAMPS, JSON.stringify(stamps));
    } catch {
      /* idem */
    }
  }
}

/** Tamanho e FNV-1a do texto: basta para saber se foi esta versão que gravou. */
export function stamp(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

function readStamps(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(MIRROR_STAMPS) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('bloqueado'));
  });
}

function readAll(db: IDBDatabase): Promise<Map<string, unknown>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE);
    const store = tx.objectStore(STORE);
    const out = new Map<string, unknown>();
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) return;
      out.set(String(c.key), c.value);
      c.continue();
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function writeMany(db: IDBDatabase, entries: [string, string][]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [k, v] of entries) store.put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Só para os testes: apaga o banco. */
export function deleteDataDb(): Promise<void> {
  return new Promise((resolve) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
