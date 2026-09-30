import { Injectable, signal } from '@angular/core';
import {
  BackupSnapshot,
  parseBackupSnapshot,
  readBackupFile,
} from './backup-file';
import { newId, sanitizeReview } from './review';

export interface Colleague extends BackupSnapshot {
  id: string;
  name: string;
  fileName: string;
  loadedAt: string;
}

/** Coleções recebidas ficam em um banco separado; nunca entram no backup ou nas resenhas próprias. */
@Injectable({ providedIn: 'root' })
export class ColleagueStore {
  readonly colleagues = signal<Colleague[]>([]);
  readonly loading = signal(true);
  readonly storageError = signal<string | null>(null);
  private database: Promise<IDBDatabase> | undefined;
  readonly ready = this.load();

  async add(file: File, name: string): Promise<Colleague> {
    await this.ready;
    const snapshot = parseBackupSnapshot(await readBackupFile(file));
    const colleague: Colleague = {
      ...snapshot,
      id: newId(),
      name: name.trim().slice(0, 60) || 'Colega',
      fileName: file.name,
      loadedAt: new Date().toISOString(),
    };
    await this.put(colleague);
    this.colleagues.update((list) => [colleague, ...list]);
    return colleague;
  }

  async rename(id: string, name: string): Promise<void> {
    const old = this.colleagues().find((c) => c.id === id);
    if (!old || !name.trim()) return;
    const colleague = { ...old, name: name.trim().slice(0, 60) };
    await this.put(colleague);
    this.colleagues.update((list) =>
      list.map((c) => (c.id === id ? colleague : c)),
    );
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    await this.transaction(db, (store) => store.delete(id));
    this.colleagues.update((list) => list.filter((c) => c.id !== id));
  }

  async restore(colleague: Colleague): Promise<void> {
    await this.put(colleague);
    this.colleagues.update((list) => [
      colleague,
      ...list.filter((c) => c.id !== colleague.id),
    ]);
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('meu-mural:colegas', 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('colegas', { keyPath: 'id' });
        request.onsuccess = () => {
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(
            new Error('Feche as outras abas do Meu Mural e tente novamente.'),
          );
      }).catch((error) => {
        this.database = undefined;
        throw error;
      });
    }
    return this.database;
  }

  private transaction(
    db: IDBDatabase,
    write: (store: IDBObjectStore) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('colegas', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
      write(tx.objectStore('colegas'));
    });
  }

  private async put(colleague: Colleague): Promise<void> {
    try {
      await this.transaction(await this.open(), (store) =>
        store.put(colleague),
      );
      this.storageError.set(null);
    } catch {
      throw new Error(
        'O navegador não deixou guardar esse backup. Libere espaço e carregue o arquivo novamente. Seus cards continuam salvos.',
      );
    }
  }

  private async load(): Promise<void> {
    try {
      const db = await this.open();
      const rows = await new Promise<Colleague[]>((resolve, reject) => {
        const request = db
          .transaction('colegas')
          .objectStore('colegas')
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      this.colleagues.set(
        rows
          .filter(
            (c) =>
              c &&
              typeof c.id === 'string' &&
              typeof c.name === 'string' &&
              Array.isArray(c.reviews),
          )
          .map((c) => ({
            ...c,
            reviews: c.reviews.map(sanitizeReview).filter((r) => r !== null),
          }))
          .sort((a, b) => b.loadedAt.localeCompare(a.loadedAt)),
      );
    } catch {
      this.storageError.set(
        'Não consegui abrir os backups de colegas. Tente recarregar a página; seus cards continuam no mural.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
