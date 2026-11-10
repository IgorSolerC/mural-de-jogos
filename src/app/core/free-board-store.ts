import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { canonicalJson } from './canonical-json';
import {
  FB_MAX_BOARDS,
  FreeBoard,
  boardFits,
  boardInGroup,
  boardSources,
  boardsMovedGroup,
  cleanBoardName,
  freeBoardName,
  newFreeBoard,
  sanitizeFreeBoard,
  sortBoards,
} from './free-board';
import { Camera, ZOOM_MAX, ZOOM_MIN } from './free-board-geometry';
import { mergeFreeBoard } from './free-board-merge';
import { localImageIds } from './images';
import { cleanCategory } from './note-labels';
import { storageFrozen } from './storage';

/** O banco do IndexedDB dos quadros (sai na limpeza do Sair e no "Apagar o save": core/browser-reset.ts). */
export const BOARDS_DB = 'meu-mural:quadros';
const BOARDS = 'quadros';
const CAMERAS = 'cameras';
/** O aviso para as outras abas: "o quadro X mudou". */
const CHANNEL = 'meu-mural:quadros';

/**
 * Um quadro como está guardado neste aparelho. `quadro` null: apagado aqui e ainda não contado à nuvem
 * (a lápide; um quadro que nunca subiu sai de vez). `base` e `rev`: o quadro como a nuvem o viu por último
 * e a versão dela (0, nunca subiu), para a junção da rodada 5. `marca` muda a cada gravação: diz se outra
 * aba gravou no meio.
 */
export interface BoardRecord {
  id: string;
  quadro: FreeBoard | null;
  base: FreeBoard | null;
  rev: number;
  /** Há mudança daqui que a nuvem ainda não tem. */
  sujo: boolean;
  marca: string;
  apagado?: string;
}

/** Algo que o quadro não pôde fazer, dito para quem usa. */
export class FreeBoardProblem extends Error {}

/**
 * Os quadros do Quadro livre deste aparelho (PLANO-QUADRO-LIVRE.md, seção 6): um registro por quadro num
 * banco só deles, lido ao criar a loja (nunca no nível do módulo) e não antes do app subir, como o mural.
 *
 * Uma gravação por vez. Antes de gravar, confere se outra aba gravou o mesmo quadro no meio (a `marca`
 * mudou): se sim, junta em três vias (`mergeFreeBoard`, a base é o que esta aba viu por último). Cada
 * gravação avisa as outras abas, que leem o registro de novo.
 *
 * Sem IndexedDB (aba anônima de algum navegador), os quadros vivem só na memória da aba.
 */
@Injectable({ providedIn: 'root' })
export class FreeBoardStore {
  /** O que esta aba sabe que está gravado, por id. */
  private readonly records = new Map<string, BoardRecord>();
  /** Os quadros que existem, os mexidos por último primeiro (decisão D11). */
  readonly boards = signal<readonly FreeBoard[]>([]);
  readonly count = computed(() => this.boards().length);
  /** Sobe a cada gravação aqui ou em outra aba (quem desenha a lista ou envia para a nuvem olha). */
  readonly version = signal(0);
  /** Onde os quadros estão: `memoria` quando o navegador não deixa usar o IndexedDB. */
  readonly where = signal<'indexeddb' | 'memoria'>('indexeddb');
  private database: Promise<IDBDatabase> | undefined;
  private channel: BroadcastChannel | null = null;
  /** A fila das gravações: uma de cada vez. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Os quadros lidos pela primeira vez (ao criar a loja; depois dos campos de cima). */
  readonly ready: Promise<void>;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (ev: MessageEvent<{ id?: unknown }>) => {
        if (typeof ev.data?.id === 'string') void this.reread(ev.data.id);
      };
    }
    inject(DestroyRef, { optional: true })?.onDestroy(() => {
      this.channel?.close();
      this.channel = null;
      void this.database?.then((db) => db.close()).catch(() => undefined);
    });
    this.ready = this.reload();
  }

  // ===== ler =====

  get(id: string): FreeBoard | null {
    return this.records.get(id)?.quadro ?? null;
  }

  /** Os quadros do grupo (pela chave), na ordem da lista. */
  inGroup(group: string): FreeBoard[] {
    return this.boards().filter((b) => boardInGroup(b, group));
  }

  /** O registro guardado (para a sincronização da rodada 5 e os testes). */
  record(id: string): BoardRecord | null {
    return this.records.get(id) ?? null;
  }

  /** Lê todos de novo do banco (ao criar a loja e quando outra aba pede). */
  async reload(): Promise<void> {
    try {
      const db = await this.open();
      const all = await request<BoardRecord[]>(db.transaction(BOARDS).objectStore(BOARDS).getAll());
      this.records.clear();
      for (const raw of all) {
        const rec = sanitizeRecord(raw);
        if (rec) this.records.set(rec.id, rec);
      }
      this.publish();
    } catch {
      this.where.set('memoria');
    }
  }

  // ===== criar e mudar =====

  /** Um quadro novo no grupo, já guardado. Sem nome, "Quadro"; o nome repetido no grupo ganha um número. */
  async create(nome: string, grupo: string): Promise<FreeBoard> {
    await this.ready;
    if (this.count() >= FB_MAX_BOARDS) throw new FreeBoardProblem(`Cabem ${FB_MAX_BOARDS} quadros. Apague um para criar outro.`);
    const group = cleanCategory(grupo);
    const board = newFreeBoard(freeBoardName(this.boards(), group, nome), group, new Date().toISOString());
    if (!board) throw new FreeBoardProblem('O quadro precisa de um grupo.');
    return this.save(board);
  }

  /**
   * Guarda o quadro (o que a tela mudou). `from` é a versão de onde a mudança partiu (a que a tela tinha);
   * sem ela, vale a que esta aba viu por último. Se o guardado não é mais essa versão (outra aba gravou no
   * meio, mesmo que já tenha avisado), junta os dois em três vias e devolve o juntado: a tela passa a usar
   * o devolvido. Passou do tamanho que cabe no aparelho: não guarda e avisa.
   */
  save(board: FreeBoard, from?: FreeBoard | null): Promise<FreeBoard> {
    const clean = sanitizeFreeBoard(board);
    if (!clean) return Promise.reject(new FreeBoardProblem('Este quadro não pode ser guardado (falta o nome ou o grupo).'));
    if (!boardFits(clean)) return Promise.reject(new FreeBoardProblem('Este quadro ficou grande demais. Tire algumas peças.'));
    return this.write(clean.id, (stored, seen) => {
      let quadro = clean;
      const base = from === undefined ? (seen?.quadro ?? null) : from;
      // o caminho de sempre (nada mudou desde a versão de partida) não compara o quadro inteiro
      const untouched = stored?.marca === seen?.marca && (from === undefined || from === seen?.quadro);
      if (stored?.quadro && !untouched && canonicalJson(stored.quadro) !== canonicalJson(base)) quadro = mergeFreeBoard(base, clean, stored.quadro);
      return { id: clean.id, quadro, base: stored?.base ?? null, rev: stored?.rev ?? 0, sujo: true, marca: newMark() };
    }).then((rec) => rec?.quadro ?? clean);
  }

  /** Muda o quadro `id` pela função (null: não existe mais). */
  async update(id: string, change: (board: FreeBoard) => FreeBoard): Promise<FreeBoard | null> {
    await this.ready;
    const board = this.get(id);
    if (!board) return null;
    const next = change(board);
    return next === board ? board : this.save(next, board);
  }

  async rename(id: string, nome: string): Promise<FreeBoard | null> {
    const name = cleanBoardName(nome);
    if (!name) return this.get(id);
    return this.update(id, (b) => (b.nome === name ? b : { ...b, nome: name, em: new Date().toISOString() }));
  }

  /** Muda o quadro de grupo ("Mover para o grupo..."). */
  async moveToGroup(id: string, grupo: string): Promise<FreeBoard | null> {
    const group = cleanCategory(grupo);
    if (!group) return this.get(id);
    return this.update(id, (b) => (b.grupo === group ? b : { ...b, grupo: group, em: new Date().toISOString() }));
  }

  /** Um quadro novo igual a este, com outro id e o nome com número ("Duplicar"). */
  async duplicate(id: string): Promise<FreeBoard | null> {
    await this.ready;
    const board = this.get(id);
    if (!board) return null;
    if (this.count() >= FB_MAX_BOARDS) throw new FreeBoardProblem(`Cabem ${FB_MAX_BOARDS} quadros. Apague um para criar outro.`);
    const copy = newFreeBoard(freeBoardName(this.boards(), board.grupo, board.nome), board.grupo, new Date().toISOString());
    return copy ? this.save({ ...copy, n: board.n, e: board.e }) : null;
  }

  /**
   * Apaga o quadro; devolve o apagado (para o Desfazer). O que nunca subiu sai de vez; o que já está na
   * nuvem fica como lápide até ela saber (rodada 5).
   */
  async remove(id: string): Promise<FreeBoard | null> {
    await this.ready;
    const board = this.get(id);
    if (!board) return null;
    await this.write(id, (stored) => (stored && stored.rev > 0 ? { ...stored, quadro: null, sujo: true, marca: newMark(), apagado: new Date().toISOString() } : null));
    return board;
  }

  /** Põe de volta um quadro apagado (o Desfazer). */
  restore(board: FreeBoard): Promise<FreeBoard> {
    return this.save({ ...board, em: new Date().toISOString() });
  }

  // ===== os grupos =====

  /** Os quadros que vão embora com o grupo (para a pergunta de apagar o grupo). */
  goingWithGroup(group: string): FreeBoard[] {
    return this.inGroup(group);
  }

  /**
   * O grupo `from` virou `to` (renomeado ou juntado) ou foi apagado (`to` null): os quadros vão junto, ou
   * saem com ele (decisão D12). Devolve quantos mudaram ou saíram.
   */
  async moveGroup(from: string, to: string | null): Promise<number> {
    await this.ready;
    const moved = boardsMovedGroup(this.boards(), from, to, new Date().toISOString());
    for (const b of moved.changed) await this.save(b);
    for (const b of moved.removed) await this.remove(b.id);
    return moved.changed.length + moved.removed.length;
  }

  // ===== o que os quadros usam, o backup =====

  /** As imagens que os quadros usam (vão nas `usadas` do envio do mural, para não virarem soltas). */
  async imageIds(): Promise<string[]> {
    await this.ready;
    return localImageIds(this.boards().map(boardSources).join('\n'));
  }

  /** Os quadros para o arquivo de backup. */
  async forBackup(): Promise<FreeBoard[]> {
    await this.ready;
    return [...this.boards()];
  }

  /**
   * Os quadros de um backup restaurado (o campo `quadros` do JSON): entra o que não está aqui e o que está
   * mais novo no arquivo. Devolve quantos entraram ou mudaram.
   */
  async fromBackup(object: unknown): Promise<number> {
    const raw = (object as { quadros?: unknown } | null)?.quadros;
    if (!Array.isArray(raw)) return 0;
    await this.ready;
    let n = 0;
    for (const item of raw.slice(0, FB_MAX_BOARDS)) {
      const board = sanitizeFreeBoard(item);
      if (!board) continue;
      const here = this.get(board.id);
      if (here && here.em >= board.em) continue;
      if (!here && this.count() >= FB_MAX_BOARDS) break;
      await this.save(board);
      n++;
    }
    return n;
  }

  // ===== a câmera de cada quadro (só deste aparelho, decisão D7) =====

  async camera(id: string): Promise<Camera | null> {
    try {
      const db = await this.open();
      const raw = await request<{ x?: unknown; y?: unknown; z?: unknown } | undefined>(db.transaction(CAMERAS).objectStore(CAMERAS).get(id));
      const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
      if (!raw || !ok(raw.x) || !ok(raw.y) || !ok(raw.z)) return null;
      return { x: raw.x, y: raw.y, z: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw.z)) };
    } catch {
      return null;
    }
  }

  async setCamera(id: string, cam: Camera): Promise<void> {
    if (storageFrozen()) return;
    try {
      const db = await this.open();
      await done(db, CAMERAS, (store) => store.put({ id, x: cam.x, y: cam.y, z: cam.z }));
    } catch {
      /* a câmera é só conforto: sem ela, o quadro abre em "Ver tudo" */
    }
  }

  // ===== por dentro =====

  /**
   * Grava o registro de `id` numa transação só: lê o guardado, `next` decide o novo (null: sai) e grava.
   * Uma gravação por vez. Com a página recarregando para limpar o navegador, nada é gravado.
   */
  private write(id: string, next: (stored: BoardRecord | undefined, seen: BoardRecord | undefined) => BoardRecord | null): Promise<BoardRecord | null> {
    const job = this.queue.then(async () => {
      await this.ready;
      if (storageFrozen()) return this.records.get(id) ?? null;
      let db: IDBDatabase | null = null;
      try {
        db = await this.open();
      } catch {
        db = null;
      }
      let result: BoardRecord | null;
      if (!db) {
        result = next(this.records.get(id), this.records.get(id));
      } else {
        result = await new Promise<BoardRecord | null>((resolve, reject) => {
          const tx = db!.transaction(BOARDS, 'readwrite');
          const store = tx.objectStore(BOARDS);
          let out: BoardRecord | null = null;
          const get = store.get(id);
          get.onsuccess = () => {
            out = next(sanitizeRecord(get.result) ?? undefined, this.records.get(id));
            if (out) store.put(out);
            else store.delete(id);
          };
          tx.oncomplete = () => resolve(out);
          const fail = () => reject(new FreeBoardProblem('O navegador não deixou guardar o quadro. Libere espaço e tente de novo.'));
          tx.onabort = fail;
          tx.onerror = fail;
        });
      }
      if (result) this.records.set(id, result);
      else this.records.delete(id);
      this.publish();
      this.channel?.postMessage({ id });
      return result;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  /** Outra aba gravou o quadro `id`: lê de novo. */
  private async reread(id: string): Promise<void> {
    try {
      const db = await this.open();
      const rec = sanitizeRecord(await request<unknown>(db.transaction(BOARDS).objectStore(BOARDS).get(id)));
      if (rec) this.records.set(id, rec);
      else this.records.delete(id);
      this.publish();
    } catch {
      /* sem banco, cada aba fica com a sua memória */
    }
  }

  private publish(): void {
    this.boards.set(sortBoards([...this.records.values()].flatMap((r) => (r.quadro ? [r.quadro] : []))));
    this.version.update((v) => v + 1);
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new FreeBoardProblem('Este navegador não deixa guardar os quadros.'));
        const req = indexedDB.open(BOARDS_DB, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(BOARDS, { keyPath: 'id' });
          req.result.createObjectStore(CAMERAS, { keyPath: 'id' });
        };
        req.onsuccess = () => {
          // a limpeza do Sair apaga o banco: esta aba solta a conexão para não segurar
          req.result.onversionchange = () => {
            req.result.close();
            this.database = undefined;
          };
          resolve(req.result);
        };
        req.onerror = () => reject(new FreeBoardProblem('Este navegador não deixa guardar os quadros.'));
        req.onblocked = () => reject(new FreeBoardProblem('Feche as outras abas do Murall e tente de novo.'));
      }).catch((error) => {
        this.database = undefined;
        throw error;
      });
    }
    return this.database;
  }
}

/** O registro como veio do banco (de uma versão do site, ou estragado): o quadro passa pelo sanitize. */
function sanitizeRecord(raw: unknown): BoardRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<BoardRecord>;
  if (typeof r.id !== 'string') return null;
  const quadro = r.quadro == null ? null : sanitizeFreeBoard(r.quadro);
  if (r.quadro != null && (!quadro || quadro.id !== r.id)) return null;
  const base = r.base == null ? null : sanitizeFreeBoard(r.base);
  return {
    id: r.id,
    quadro,
    base: base && base.id === r.id ? base : null,
    rev: typeof r.rev === 'number' && Number.isSafeInteger(r.rev) && r.rev >= 0 ? r.rev : 0,
    sujo: r.sujo === true,
    marca: typeof r.marca === 'string' ? r.marca : '',
    ...(typeof r.apagado === 'string' ? { apagado: r.apagado } : {}),
  };
}

function newMark(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

function done(db: IDBDatabase, name: string, put: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
    put(tx.objectStore(name));
  });
}
