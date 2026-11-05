import { Injectable, computed, signal } from '@angular/core';
import { BackupSnapshot } from './backup-file';
import { sanitizeReview } from './review';
import { PageBackground, sanitizeProfile } from './profile';
import { readText, removeKey, storageFrozen, writeText } from './storage';

/** O banco do IndexedDB com os murais de outras pessoas. */
export const COLLEAGUES_DB = 'meu-mural:colegas';

const CHOSEN_KEY = 'meu-mural:colega-aberto';


export interface Colleague extends BackupSnapshot {
  id: string;
  name: string;
  fileName: string;
  loadedAt: string;
  /** Aberto pela nuvem (ver `cloud-murals.ts`): o código da pessoa e a versão do mural que veio. */
  codigo?: string;
  rev?: number;
  /** Com que `MURAL_READER` ele foi lido (sem: por um site de antes das anotações). */
  leitor?: number;
}

/**
 * A parede de quem se visita: a do perfil da pessoa; sem perfil (um backup, ou alguém de antes dos
 * perfis), o eucatex do próprio site, nunca a sua.
 */
export function wallOf(colleague: Colleague | null | undefined): PageBackground {
  return colleague?.profile?.page ?? 'eucatex';
}

/**
 * Os murais de outras pessoas abertos pelo código (ver `cloud-murals.ts`), num banco separado: nunca
 * entram no backup ou nas resenhas próprias. Backup de colega não entra mais (desde 27/out/2026, a
 * comparação é só pelo código ou pelos amigos): o que tinha vindo de um arquivo sai ao abrir.
 */
@Injectable({ providedIn: 'root' })
export class ColleagueStore {
  readonly colleagues = signal<Colleague[]>([]);
  readonly loading = signal(true);
  readonly storageError = signal<string | null>(null);
  private database: Promise<IDBDatabase> | undefined;
  readonly ready = this.load();

  /** O colega aberto na comparação, lembrado entre as visitas (só o id, neste navegador). */
  private readonly chosenId = signal<string | null>(readText(CHOSEN_KEY));
  /** O escolhido, ou o mural aberto mais recentemente quando a escolha sumiu. */
  readonly selected = computed<Colleague | null>(() => {
    const list = this.colleagues();
    return list.find((c) => c.id === this.chosenId()) ?? list[0] ?? null;
  });

  select(id: string): void {
    this.chosenId.set(id);
    writeText(CHOSEN_KEY, id);
  }

  async remove(id: string): Promise<void> {
    // a página está recarregando para limpar o navegador: o banco sai inteiro, nada se abre nele
    if (!storageFrozen()) await this.transaction(await this.open(), (store) => store.delete(id));
    this.colleagues.update((list) => list.filter((c) => c.id !== id));
  }

  /**
   * Tira todos os murais guardados e a escolha do Comparar. Ao entrar numa conta, os abertos antes de
   * entrar (de ninguém: pelo link ou pelo perfil) não vão para ela (ver `firstSync` em cloud-sync.ts).
   */
  async clear(): Promise<void> {
    await this.ready;
    this.colleagues.set([]);
    this.chosenId.set(null);
    if (storageFrozen()) return;
    removeKey(CHOSEN_KEY);
    await this.transaction(await this.open(), (store) => store.clear());
  }

  /**
   * Troca o id de um colega guardado (a pessoa trocou o código): grava o novo e apaga o antigo, no
   * mesmo lugar da lista e com a escolha do Comparar indo junto. Se o novo já existe, só sai o antigo.
   */
  async move(oldId: string, next: Colleague): Promise<void> {
    const list = this.colleagues();
    if (!list.some((c) => c.id === oldId)) return;
    const wasChosen = this.selected()?.id === oldId;
    const already = list.some((c) => c.id === next.id);
    if (!already) await this.put(next);
    if (!storageFrozen()) await this.transaction(await this.open(), (store) => store.delete(oldId));
    this.colleagues.update((now) =>
      already ? now.filter((c) => c.id !== oldId) : now.map((c) => (c.id === oldId ? next : c)),
    );
    if (wasChosen) this.select(next.id);
  }

  /**
   * Guarda o mural (ele vai para a frente da lista). `select`: fica escolhido no Comparar, como quando
   * a pessoa o abre; sem, quem está escolhido continua o mesmo (o mural que só se atualizou por trás,
   * ou que o correio e o perfil buscaram, não toma o lugar de quem a pessoa escolheu).
   */
  async restore(colleague: Colleague, select = true): Promise<void> {
    await this.put(colleague);
    // sem escolha guardada, o escolhido é o primeiro da lista: ele fica, mesmo com outro indo para a frente
    const current = this.selected();
    if (!select && current && current.id !== this.chosenId()) this.select(current.id);
    this.colleagues.update((list) => [
      colleague,
      ...list.filter((c) => c.id !== colleague.id),
    ]);
    if (select) this.select(colleague.id);
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(COLLEAGUES_DB, 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('colegas', { keyPath: 'id' });
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            this.database = undefined;
          };
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () =>
          reject(
            new Error('Feche as outras abas do Murall e tente novamente.'),
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
    // a página está recarregando para limpar o navegador (ver core/browser-reset.ts): nada se grava
    if (storageFrozen()) return;
    try {
      await this.transaction(await this.open(), (store) =>
        store.put(colleague),
      );
      this.storageError.set(null);
    } catch {
      throw new Error(
        'O navegador não deixou guardar esse mural. Libere espaço e tente de novo. Seus cards continuam salvos.',
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
      // o que veio de um arquivo de backup (sem código) sai do banco
      const files = rows.filter((c) => c && typeof c.id === 'string' && !c.codigo);
      if (files.length && !storageFrozen()) await this.transaction(db, (store) => files.forEach((c) => store.delete(c.id)));
      this.colleagues.set(
        rows
          .filter(
            (c) =>
              c &&
              typeof c.id === 'string' &&
              typeof c.codigo === 'string' &&
              typeof c.name === 'string' &&
              Array.isArray(c.reviews),
          )
          .map((c) => ({
            ...c,
            reviews: c.reviews.map((r) => sanitizeReview(r)).filter((r) => r !== null),
            profile: sanitizeProfile(c.profile),
          }))
          .sort((a, b) => b.loadedAt.localeCompare(a.loadedAt)),
      );
    } catch {
      this.storageError.set(
        'Não consegui abrir os murais guardados dos amigos. Tente recarregar a página; seus cards continuam no mural.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
