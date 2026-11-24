import { Injectable, computed, signal } from '@angular/core';
import { StoredLayer, sanitizeLayers } from './pixel-layers';
import { clampSide } from './pixel-art';
import { readJson, removeKey, storageFrozen, writeJson } from './storage';
import { WidgetValues } from './widgets';

/**
 * Os rascunhos do ateliê da pixel art (PLANO-RASCUNHOS-PIXEL.md): o desenho que está sendo feito, guardado neste
 * aparelho de tempos em tempos, para nada se perder (a aba que fecha, o celular que desliga, o Descartar sem querer).
 * O rascunho só sai quando o desenho foi salvo de verdade, ou descartado.
 *
 * Mora no IndexedDB (um desenho de 256 × 256 com camadas passa de centenas de kB; o localStorage é pouco e dividido
 * com o site todo). É da conta deste navegador como o resto: sai na limpeza do Sair (core/browser-reset.ts) e no
 * Apagar o save (core/erase-save.ts), e conta como mural de ninguém ao entrar (core/cloud-sync.ts). Não sincroniza.
 */
export const DRAFTS_DB = 'meu-mural:rascunhos';
const STORE = 'pixel';
/** O aviso entre as abas: a lista mudou (cada aba relê). */
const CHANNEL = 'meu-mural:rascunhos';
/** A trava de um rascunho aberto num ateliê (`navigator.locks`): a aba que morre solta sozinha. */
const LOCK = 'meu-mural:rascunho:';
/**
 * O rascunho guardado às pressas quando a aba some (`stash`), no localStorage, que grava na hora: a gravação do
 * IndexedDB começada no `pagehide` é abortada quando a página sai. A próxima abertura do site passa para o banco.
 */
export const STASH_PREFIX = 'meu-mural:rascunho-guardando:';

/** De onde o desenho veio: uma obra da galeria, uma obra nova, ou o widget de uma anotação. */
export type DraftOrigin = { kind: 'obra'; id: string } | { kind: 'nova' } | { kind: 'widget' };

export interface PixelDraft {
  id: string;
  origin: DraftOrigin;
  /** O nome que se mostra (a obra, a legenda do widget); vazio, "Sem título". */
  title: string;
  /** O desenho, nos valores do widget (`pixels`, `width`, `height`, `palette`, `colors`). */
  values: WidgetValues;
  /** As camadas (só de uma obra da galeria). */
  layers?: StoredLayer[];
  /** O desenho de quando o ateliê abriu, escrito (`draftKey`): acha o rascunho ao abrir o mesmo desenho de novo. */
  base: string;
  createdAt: number;
  savedAt: number;
}

/** A chave de um desenho (os valores que importam, numa ordem só): o mesmo desenho dá a mesma chave. */
export function draftKey(v: WidgetValues): string {
  return JSON.stringify([v['width'] ?? '', v['height'] ?? '', v['pixels'] ?? '', v['palette'] ?? '', v['colors'] ?? '']);
}

const ID_RE = /^[\w-]{4,64}$/;
/** O id de uma obra da galeria (o mesmo de core/pixel-gallery.ts). */
const PIECE_RE = /^[\w-]{1,64}$/;
const VALUE_KEYS = ['pixels', 'width', 'height', 'palette', 'colors'] as const;

/** Um rascunho como foi guardado, conferido campo a campo; null se não serve. */
export function sanitizeDraft(raw: unknown): PixelDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || !ID_RE.test(r['id'])) return null;
  const o = r['origin'] as Record<string, unknown> | undefined;
  const origin: DraftOrigin | null =
    o?.['kind'] === 'obra' && typeof o['id'] === 'string' && PIECE_RE.test(o['id']) ? { kind: 'obra', id: o['id'] } : o?.['kind'] === 'nova' ? { kind: 'nova' } : o?.['kind'] === 'widget' ? { kind: 'widget' } : null;
  if (!origin) return null;
  const v = r['values'] as Record<string, unknown> | undefined;
  if (!v || typeof v !== 'object') return null;
  const values: WidgetValues = {};
  for (const k of VALUE_KEYS) if (typeof v[k] === 'string') values[k] = v[k] as string;
  if (values['width'] === undefined || values['height'] === undefined) return null;
  const at = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const layers = r['layers'] === undefined ? null : sanitizeLayers(r['layers'], clampSide(values['width']), clampSide(values['height']));
  return {
    id: r['id'],
    origin,
    title: typeof r['title'] === 'string' ? r['title'].slice(0, 120) : '',
    values,
    ...(layers ? { layers } : {}),
    base: typeof r['base'] === 'string' ? r['base'] : '',
    createdAt: at(r['createdAt']),
    savedAt: at(r['savedAt']),
  };
}

let db: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  if (!db) db = openAt(undefined);
  return db;
}

/** Abre o banco; um banco com o nome e sem a tabela (criado vazio por outra coisa) é aberto na versão seguinte, que a cria. */
function openAt(version: number | undefined): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('sem IndexedDB'));
    const req = version === undefined ? indexedDB.open(DRAFTS_DB) : indexedDB.open(DRAFTS_DB, version);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const next = d.version + 1;
        d.close();
        openAt(next).then(resolve, reject);
        return;
      }
      // a limpeza do Sair apaga o banco: esta aba solta a conexão para não segurar
      d.onversionchange = () => {
        d.close();
        db = undefined;
      };
      resolve(d);
    };
    req.onerror = () => reject(req.error ?? new Error('o banco dos rascunhos não abriu'));
    req.onblocked = () => reject(new Error('o banco dos rascunhos está preso em outra aba'));
  }).catch((error) => {
    db = undefined;
    throw error;
  });
}

/** Uma escrita (ou leitura) inteira, até a transação terminar: o que voltou ok está no disco. */
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await open();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('a gravação do rascunho parou'));
  });
}

/** Um id novo de rascunho. */
export function newDraftId(): string {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Os rascunhos deste aparelho, numa lista à vista (a mais nova primeiro). Gravar e apagar vão direto ao banco e
 * avisam as outras abas; a lista se refaz a partir do banco, que é a verdade.
 */
@Injectable({ providedIn: 'root' })
export class PixelDrafts {
  readonly list = signal<readonly PixelDraft[]>([]);
  readonly count = computed(() => this.list().length);
  /** O banco abriu (sem ele, aba anônima de alguns navegadores: o ateliê diz que não há rascunho). */
  readonly available = signal(true);
  /** A primeira leitura do banco terminou. */
  readonly ready: Promise<void>;
  /** Os rascunhos que esta aba segura num ateliê aberto (id → soltar). */
  private readonly held = new Map<string, () => void>();
  private readonly channel: BroadcastChannel | null = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);

  constructor() {
    this.ready = this.recover().then(() => this.refresh());
    this.channel?.addEventListener('message', () => void this.refresh());
  }

  /** Relê o banco. */
  async refresh(): Promise<void> {
    try {
      const all = ((await run<unknown[]>('readonly', (s) => s.getAll())) ?? []).map(sanitizeDraft).filter((d): d is PixelDraft => !!d);
      this.list.set(all.sort((a, b) => b.savedAt - a.savedAt));
      this.available.set(true);
    } catch {
      this.available.set(false);
    }
  }

  /**
   * Guarda o rascunho agora, sem esperar (a aba está sumindo): no localStorage, até a próxima abertura o passar para
   * o banco (`recover`). O `put` que chegar ao banco depois o tira.
   */
  stash(d: PixelDraft): void {
    writeJson(STASH_PREFIX + d.id, d);
  }

  /** Os rascunhos guardados às pressas (a aba que sumiu) vão para o banco, quando são mais novos que o de lá. */
  private async recover(): Promise<void> {
    let keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(STASH_PREFIX)) keys.push(k);
      }
    } catch {
      keys = [];
    }
    for (const k of keys) {
      const d = sanitizeDraft(readJson(k));
      if (d && d.id === k.slice(STASH_PREFIX.length)) {
        const there = await this.get(d.id);
        // sem banco, fica no localStorage para a próxima vez
        if ((!there || there.savedAt < d.savedAt) && !(await this.write(d))) continue;
      }
      removeKey(k);
    }
  }

  /** O rascunho, como está no banco agora. */
  async get(id: string): Promise<PixelDraft | null> {
    try {
      return sanitizeDraft(await run('readonly', (s) => s.get(id)));
    } catch {
      return null;
    }
  }

  /** Guarda (ou troca) o rascunho; devolve se ficou guardado. A página recarregando para limpar não grava nada. */
  async put(d: PixelDraft): Promise<boolean> {
    if (!(await this.write(d))) return false;
    // o guardado às pressas deste rascunho, se havia, ficou para trás
    const stashed = sanitizeDraft(readJson(STASH_PREFIX + d.id));
    if (stashed && stashed.savedAt <= d.savedAt) removeKey(STASH_PREFIX + d.id);
    await this.changed();
    return true;
  }

  private async write(d: PixelDraft): Promise<boolean> {
    if (storageFrozen()) return false;
    try {
      await run('readwrite', (s) => s.put(d));
      this.available.set(true);
      return true;
    } catch {
      this.available.set(false);
      return false;
    }
  }

  async remove(id: string): Promise<void> {
    if (storageFrozen()) return;
    removeKey(STASH_PREFIX + id);
    try {
      await run('readwrite', (s) => s.delete(id));
      await this.changed();
    } catch {
      /* sem banco: não há o que tirar */
    }
  }

  /** Segura o rascunho enquanto o ateliê está aberto: outra aba não o continua. Devolve como soltar. */
  hold(id: string): () => void {
    if (this.held.has(id)) return this.held.get(id)!;
    let release = () => {};
    const done = new Promise<void>((r) => (release = r));
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    void locks?.request(LOCK + id, () => done).catch(() => undefined);
    const free = () => {
      release();
      this.held.delete(id);
    };
    this.held.set(id, free);
    return free;
  }

  /** Os rascunhos abertos num ateliê de outra aba agora. */
  async heldElsewhere(): Promise<Set<string>> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks) return new Set();
    try {
      const q = await locks.query();
      return new Set((q.held ?? []).map((l) => l.name ?? '').filter((n) => n.startsWith(LOCK)).map((n) => n.slice(LOCK.length)).filter((id) => !this.held.has(id)));
    } catch {
      return new Set();
    }
  }

  /** A lista mudou: as outras abas releem, e esta também (quem gravou já vê a lista nova). */
  private changed(): Promise<void> {
    this.channel?.postMessage('mudou');
    return this.refresh();
  }
}
