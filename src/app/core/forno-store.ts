import { storageFrozen } from './storage';

/**
 * As imagens do forno guardadas neste aparelho (PLANO-FORNO.md, rodada 3): abrir o mural de novo não
 * assa nada que já foi assado. É desenho, refeito a partir das fichas (não é dado de conta, não
 * sincroniza nem entra no backup), mas é do site: sai na limpeza do Sair (core/browser-reset.ts).
 */
export const FORNO_DB = 'meu-mural:forno';
const STORE = 'imagens';
/** Os atalhos: da chave barata de uma ficha (o desenho dela, o tamanho, a densidade) para as imagens dela. */
const ATALHOS = 'atalhos';
const TABELAS = [STORE, ATALHOS];

/** O tamanho guardado, no máximo: passando, saem as usadas há mais tempo. */
export const FORNO_TETO_BYTES = 80 * 1024 * 1024;
/** A data de uso só é regravada depois disto (ler não vira uma escrita a cada ficha). */
const USO_DE_NOVO = 24 * 60 * 60 * 1000;

interface Guardada {
  chave: string;
  blob: Blob;
  bytes: number;
  /** A última vez que alguma ficha usou (ms desde 1970). */
  usada: number;
}

let banco: Promise<IDBDatabase> | undefined;

function abrir(): Promise<IDBDatabase> {
  if (!banco) banco = abrirNaVersao(undefined);
  return banco;
}

/**
 * Abre o banco. Um banco com o nome certo e sem a tabela (criado vazio por outra coisa, ou que perdeu a
 * tabela) é aberto de novo na versão seguinte, que cria a tabela: senão o forno nunca guardaria nada.
 */
function abrirNaVersao(versao: number | undefined): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('sem IndexedDB'));
    // sem versão: abre a que estiver lá (ou cria a 1); faltando uma tabela, a seguinte cria
    const req = versao === undefined ? indexedDB.open(FORNO_DB) : indexedDB.open(FORNO_DB, versao);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'chave' }).createIndex('usada', 'usada');
      if (!db.objectStoreNames.contains(ATALHOS)) db.createObjectStore(ATALHOS, { keyPath: 'atalho' });
    };
    req.onsuccess = () => {
      const db = req.result;
      if (TABELAS.some((t) => !db.objectStoreNames.contains(t))) {
        const proxima = db.version + 1;
        db.close();
        abrirNaVersao(proxima).then(resolve, reject);
        return;
      }
      // a limpeza do Sair apaga o banco: esta aba solta a conexão para não segurar
      db.onversionchange = () => {
        db.close();
        banco = undefined;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('o banco do forno não abriu'));
    req.onblocked = () => reject(new Error('o banco do forno está preso em outra aba'));
  }).catch((error) => {
    banco = undefined;
    throw error;
  });
}

function pedido<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** A imagem guardada da chave, ou null (sem banco, aba anônima: null, e o forno assa). */
export async function lerDoForno(chave: string): Promise<Blob | null> {
  try {
    const db = await abrir();
    const achada = (await pedido(db.transaction(STORE).objectStore(STORE).get(chave))) as Guardada | undefined;
    if (!achada) return null;
    const agora = Date.now();
    if (agora - achada.usada > USO_DE_NOVO && !storageFrozen()) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...achada, usada: agora });
    }
    return achada.blob;
  } catch {
    return null;
  }
}

/** Guarda a imagem assada; passando do teto, saem as usadas há mais tempo. Falhar não faz mal. */
export async function guardarNoForno(chave: string, blob: Blob, teto = FORNO_TETO_BYTES): Promise<void> {
  // a página está recarregando para limpar o navegador (ver core/browser-reset.ts): nada se grava
  if (storageFrozen()) return;
  try {
    const db = await abrir();
    const tx = db.transaction(STORE, 'readwrite');
    const loja = tx.objectStore(STORE);
    loja.put({ chave, blob, bytes: blob.size, usada: Date.now() } satisfies Guardada);
    // o total, das mais usadas para as menos; o que passa do teto sai
    let total = 0;
    const cursor = loja.index('usada').openCursor(null, 'prev');
    await new Promise<void>((resolve, reject) => {
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        const g = c.value as Guardada;
        total += g.bytes;
        if (total > teto && g.chave !== chave) c.delete();
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* sem banco ou sem espaço: a imagem fica só na memória desta aba */
  }
}

/** As imagens de uma ficha, guardadas pela chave barata dela (ver PaperArtLayer.porAtalho). */
export interface AtalhoGuardado {
  atalho: string;
  /** Os grupos de camadas, na ordem: a chave, onde a imagem fica e se a mistura foi junto. */
  grupos: { chave: string; inset: string; fundida: boolean }[];
  sombra: { chave: string; inset: string } | null;
}

export async function lerAtalho(atalho: string): Promise<AtalhoGuardado | null> {
  try {
    const db = await abrir();
    return ((await pedido(db.transaction(ATALHOS).objectStore(ATALHOS).get(atalho))) as AtalhoGuardado | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function guardarAtalho(a: AtalhoGuardado): Promise<void> {
  if (storageFrozen()) return;
  try {
    const db = await abrir();
    await pedido(db.transaction(ATALHOS, 'readwrite').objectStore(ATALHOS).put(a));
  } catch {
    /* sem banco: a ficha assa de novo na próxima visita */
  }
}

/** Tira uma imagem guardada (a que não abre mais). */
export async function apagarDoForno(chave: string): Promise<void> {
  if (storageFrozen()) return;
  try {
    const db = await abrir();
    await pedido(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(chave));
  } catch {
    /* sem banco: nada a tirar */
  }
}

/** Para os testes: quantas imagens e quantos bytes o banco guarda. */
export async function fornoGuardado(): Promise<{ imagens: number; bytes: number }> {
  const db = await abrir();
  const todas = (await pedido(db.transaction(STORE).objectStore(STORE).getAll())) as Guardada[];
  return { imagens: todas.length, bytes: todas.reduce((s, g) => s + g.bytes, 0) };
}
