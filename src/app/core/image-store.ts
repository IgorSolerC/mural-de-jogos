import { Injectable, signal } from '@angular/core';
import { ImageProblem, MAX_BYTES, MAX_SIDE, hashOf, localImageId, localImageUrl, newImageId, shrinkImage } from './images';
import { storageFrozen } from './storage';

/** O banco do IndexedDB com as imagens coladas nas anotações (sai na limpeza do Sair: core/browser-reset.ts). */
export const IMAGES_DB = 'meu-mural:imagens';
const STORE = 'imagens';

/**
 * Uma imagem guardada neste aparelho: os bytes já encolhidos e o que se sabe deles. `estado` diz se
 * ela já está na nuvem (ver core/image-sync.ts): `local` ainda não subiu; `na-nuvem` subiu daqui ou
 * desceu de lá; `recusada`, a nuvem não aceitou de jeito nenhum (não tenta de novo, e só existe aqui).
 */
export interface StoredImage {
  id: string;
  blob: Blob;
  tipo: string;
  largura: number;
  altura: number;
  bytes: number;
  /** SHA-256 dos bytes: a mesma imagem colada de novo reaproveita o id. */
  hash: string;
  criada: string;
  estado: ImageState;
  /**
   * De outra pessoa (de uma anotação compartilhada, ou do mural de quem você visita), baixada para mostrar:
   * não vai no backup baixado nem conta como mural seu.
   */
  alheia?: true;
}

export type ImageState = 'local' | 'na-nuvem' | 'recusada';

/** Uma imagem no backup baixado: os bytes em base64 (o backup é um JSON). */
export interface BackupImage {
  id: string;
  tipo: string;
  largura: number;
  altura: number;
  criada: string;
  dados: string;
}

const TYPES = ['image/webp', 'image/jpeg', 'image/png'];

/**
 * As imagens coladas (PLANO-IMAGENS.md, rodada 2): encolhe, guarda no IndexedDB e devolve o endereço
 * que a tela mostra (um `blob:` desta aba). Sem conta, elas ficam só aqui (e no backup baixado), como o
 * resto do mural de quem nunca entrou.
 */
@Injectable({ providedIn: 'root' })
export class ImageStore {
  /** Sobe a cada imagem guardada aqui: quem procurou uma que faltava procura de novo. */
  readonly version = signal(0);
  /** Quantas estão guardadas aqui (o mural de ninguém com imagens tem conteúdo: ver core/cloud-sync.ts). */
  readonly count = signal(0);
  private database: Promise<IDBDatabase> | undefined;
  /** Os endereços `blob:` já feitos nesta aba, por id. */
  private readonly urls = new Map<string, string>();
  /** A contagem lida pela primeira vez (ao criar, nunca no nível do módulo; depois dos campos de cima). */
  readonly ready: Promise<void> = this.recount();

  /** Encolhe e guarda a imagem colada; devolve a guardada (a mesma de antes, se já estava aqui). */
  async add(file: Blob): Promise<StoredImage> {
    const shrunk = await shrinkImage(file);
    // a página está recarregando para limpar o navegador (ver core/browser-reset.ts): nada se grava
    if (storageFrozen()) throw new ImageProblem('O Murall está recarregando. Cole a imagem de novo daqui a pouco.');
    const hash = await hashOf(shrunk.blob);
    const db = await this.open();
    const same = await request<StoredImage | undefined>(db.transaction(STORE).objectStore(STORE).index('hash').get(hash));
    if (same) return same;
    const image: StoredImage = {
      id: newImageId(),
      blob: shrunk.blob,
      tipo: shrunk.tipo,
      largura: shrunk.largura,
      altura: shrunk.altura,
      bytes: shrunk.blob.size,
      hash,
      criada: new Date().toISOString(),
      estado: 'local',
    };
    await this.write(db, (store) => store.put(image));
    this.version.update((v) => v + 1);
    this.count.update((n) => n + 1);
    return image;
  }

  /** As que ainda não subiram para a nuvem, das mais velhas para as mais novas. */
  async pending(): Promise<StoredImage[]> {
    return (await this.all()).filter((i) => i.estado === 'local').sort((a, b) => a.criada.localeCompare(b.criada));
  }

  /** Muda o estado de uma guardada (subiu, ou a nuvem recusou). */
  async mark(id: string, estado: ImageState): Promise<void> {
    if (storageFrozen()) return;
    const image = await this.get(id);
    if (!image || image.estado === estado) return;
    await this.write(await this.open(), (store) => store.put({ ...image, estado }));
    // quem mostra onde ela está (a folha da imagem) olha de novo
    this.version.update((v) => v + 1);
  }

  /** Guarda a que desceu da nuvem (de outro aparelho, ou de outra pessoa: `alheia`), já como `na-nuvem`. */
  async fromCloud(id: string, blob: Blob, largura: number, altura: number, alheia = false): Promise<void> {
    if (storageFrozen() || (await this.get(id))) return;
    const image: StoredImage = {
      id,
      blob,
      tipo: blob.type,
      largura,
      altura,
      bytes: blob.size,
      hash: await hashOf(blob),
      criada: new Date().toISOString(),
      estado: 'na-nuvem',
      ...(alheia ? { alheia: true as const } : {}),
    };
    await this.write(await this.open(), (store) => store.put(image));
    this.version.update((v) => v + 1);
    if (!alheia) this.count.update((n) => n + 1);
  }

  /** A imagem guardada aqui, ou null. */
  async get(id: string): Promise<StoredImage | null> {
    try {
      const db = await this.open();
      return (await request<StoredImage | undefined>(db.transaction(STORE).objectStore(STORE).get(id))) ?? null;
    } catch {
      return null;
    }
  }

  /** O endereço para mostrar a imagem nesta aba (`blob:`), ou null se ela não está neste aparelho. */
  async url(id: string): Promise<string | null> {
    const known = this.urls.get(id);
    if (known) return known;
    const image = await this.get(id);
    if (!image) return null;
    const url = this.urls.get(id) ?? URL.createObjectURL(image.blob);
    this.urls.set(id, url);
    return url;
  }

  /** Quantas estão só neste aparelho (não subiram, ou a nuvem recusou): sair da conta as leva junto. */
  async unsent(): Promise<number> {
    return (await this.all()).filter((i) => i.estado !== 'na-nuvem').length;
  }

  /** Tira a imagem deste aparelho (apagada em Ajustes › Imagens). */
  async remove(id: string): Promise<void> {
    if (storageFrozen()) return;
    const image = await this.get(id);
    if (!image) return;
    await this.write(await this.open(), (store) => store.delete(id));
    const url = this.urls.get(id);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(id);
    this.version.update((v) => v + 1);
    if (!image.alheia) this.count.update((n) => Math.max(0, n - 1));
  }

  /** Todas as guardadas aqui (para o backup baixado). */
  async all(): Promise<StoredImage[]> {
    try {
      const db = await this.open();
      return await request<StoredImage[]>(db.transaction(STORE).objectStore(STORE).getAll());
    } catch {
      return [];
    }
  }

  /** As guardadas aqui, para irem no backup baixado (nunca no mural da nuvem: elas sobem à parte). */
  async forBackup(): Promise<BackupImage[]> {
    // as de outras pessoas (só baixadas para mostrar) ficam de fora
    const all = (await this.all()).filter((i) => !i.alheia);
    return Promise.all(
      all.map(async (i) => ({ id: i.id, tipo: i.tipo, largura: i.largura, altura: i.altura, criada: i.criada, dados: toBase64(new Uint8Array(await i.blob.arrayBuffer())) })),
    );
  }

  /**
   * As imagens de um backup restaurado (o campo `imagens` do JSON): as que servem e ainda não estão aqui
   * entram. Devolve quantas entraram.
   */
  async fromBackup(object: unknown): Promise<number> {
    const raw = (object as { imagens?: unknown } | null)?.imagens;
    if (!Array.isArray(raw)) return 0;
    const images: StoredImage[] = [];
    for (const item of raw.slice(0, 5000) as Partial<BackupImage>[]) {
      const { id, tipo, largura, altura, criada, dados } = item ?? {};
      if (typeof id !== 'string' || !localImageId(localImageUrlSafe(id))) continue;
      if (typeof tipo !== 'string' || !TYPES.includes(tipo) || typeof dados !== 'string' || dados.length > (MAX_BYTES * 4) / 3 + 8) continue;
      if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura! < 1 || altura! < 1 || Math.max(largura!, altura!) > MAX_SIDE) continue;
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = fromBase64(dados);
      } catch {
        continue;
      }
      const blob = new Blob([bytes], { type: tipo });
      images.push({ id, blob, tipo, largura: largura!, altura: altura!, bytes: blob.size, hash: await hashOf(blob), criada: typeof criada === 'string' ? criada : new Date().toISOString(), estado: 'local' });
    }
    const before = (await this.all()).length;
    await this.restore(images);
    return (await this.all()).length - before;
  }

  /** Guarda as que vieram de fora (um backup restaurado), sem trocar as que já estão aqui. */
  async restore(images: readonly StoredImage[]): Promise<void> {
    if (images.length === 0 || storageFrozen()) return;
    const db = await this.open();
    const known = new Set(await request<IDBValidKey[]>(db.transaction(STORE).objectStore(STORE).getAllKeys()));
    const fresh = images.filter((i) => !known.has(i.id));
    if (fresh.length === 0) return;
    await this.write(db, (store) => fresh.forEach((i) => store.put(i)));
    this.version.update((v) => v + 1);
    this.count.update((n) => n + fresh.length);
  }

  private async recount(): Promise<void> {
    try {
      const db = await this.open();
      this.count.set((await request<StoredImage[]>(db.transaction(STORE).objectStore(STORE).getAll())).filter((i) => !i.alheia).length);
    } catch {
      this.count.set(0);
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new ImageProblem('Este navegador não deixa guardar imagens (aba anônima?).'));
        const req = indexedDB.open(IMAGES_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' }).createIndex('hash', 'hash');
        req.onsuccess = () => {
          // a limpeza do Sair apaga o banco: esta aba solta a conexão para não segurar
          req.result.onversionchange = () => {
            req.result.close();
            this.database = undefined;
          };
          resolve(req.result);
        };
        req.onerror = () => reject(new ImageProblem('Este navegador não deixa guardar imagens (aba anônima?).'));
        req.onblocked = () => reject(new ImageProblem('Feche as outras abas do Murall e tente de novo.'));
      }).catch((error) => {
        this.database = undefined;
        throw error;
      });
    }
    return this.database;
  }

  private write(db: IDBDatabase, put: (store: IDBObjectStore) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      // sem espaço (o navegador cheio) ou outro erro: a imagem não entra, e o texto fica sem ela
      const fail = () => reject(new ImageProblem('O navegador não deixou guardar a imagem. Libere espaço e tente de novo.'));
      tx.onabort = fail;
      tx.onerror = fail;
      put(tx.objectStore(STORE));
    });
  }
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/** O endereço de um id que veio de fora, ou '' se ele não é um id (sem lançar). */
function localImageUrlSafe(id: string): string {
  try {
    return localImageUrl(id);
  } catch {
    return '';
  }
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  // em pedaços: um String.fromCharCode com 100 mil argumentos estoura a pilha
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
