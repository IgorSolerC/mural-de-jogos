import { Injectable, computed, inject, signal } from '@angular/core';
import { ACCOUNT_KEY, SESSION_KEY } from './cloud-account';
import { DATA_DB } from './local-data';
import { ReviewStore } from './review-store';
import { readText, writeText } from './storage';

/** O endereço novo do site (o domínio próprio no GitHub Pages). */
export const NEW_ORIGIN = 'https://murall.igorsc.com.br';
/** O endereço de antes: o mural deste navegador ficou guardado lá. */
export const OLD_ORIGIN = 'https://igorsolerc.github.io';
/** A ponte no endereço antigo (ver public/ponte.js): o service worker de lá a serve do cache. */
export const BRIDGE_URL = `${OLD_ORIGIN}/mural-de-jogos/ponte.html`;
/** Fechou o convite para trazer o mural (não volta neste navegador). */
const CLOSED_KEY = 'meu-mural:mudanca:fechada';
/** Quanto a ponte tem para responder. */
const WAIT_MS = 25_000;
const PREFIXES = ['mural-de-jogos:', 'meu-mural:'];
/** O login não vem: no endereço novo a pessoa entra de novo (e o Google confere o endereço). */
const SKIP = new Set([SESSION_KEY, ACCOUNT_KEY]);

/** O que a ponte entrega: as chaves do localStorage e as do IndexedDB do mural, como textos. */
export interface BridgeData {
  ls: Record<string, string>;
  idb: Record<string, string>;
}

export type MoveState = 'pronto' | 'abrindo' | 'vazio' | 'sem-antigo' | 'bloqueado' | 'falhou';

/** Só o que é do mural, só textos, e nunca o login. */
export function cleanBridge(raw: unknown): BridgeData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pick = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!v || typeof v !== 'object') return out;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val !== 'string' || SKIP.has(k)) continue;
      if (PREFIXES.some((p) => k.startsWith(p)) || k === 'migrado') out[k] = val;
    }
    return out;
  };
  return { ls: pick(r['ls']), idb: pick(r['idb']) };
}

/** A ponte trouxe algum mural? (só as datas de migração e de espelho não contam) */
export function bridgeHasWall(data: BridgeData): boolean {
  return Object.keys({ ...data.ls, ...data.idb }).some((k) => k !== 'migrado' && k !== 'mural-de-jogos:espelho:v1');
}

/**
 * A mudança de endereço: o site saiu de igorsolerc.github.io/mural-de-jogos para murall.igorsc.com.br, e
 * o que ele guarda no navegador é de cada endereço (o novo começa vazio). No endereço novo, com o mural
 * vazio, uma faixa oferece trazer o mural deste navegador: "Trazer o mural" abre a ponte do endereço
 * antigo numa janela (ver public/ponte.js), que devolve tudo o que o mural guardava lá (menos o login);
 * aqui isso é gravado como estava (o IndexedDB e o localStorage) e a página recarrega, como depois de
 * "Apagar o save": cada parte lê o que guardou só ao subir.
 */
@Injectable({ providedIn: 'root' })
export class MoveHouse {
  private readonly store = inject(ReviewStore);
  /** Onde o site está aberto (os testes trocam). */
  readonly origin = signal(typeof location === 'undefined' ? '' : location.origin);
  /** Recarrega a página (os testes trocam). */
  reload = () => location.reload();

  readonly state = signal<MoveState>('pronto');
  private readonly closed = signal(readText(CLOSED_KEY) === '1');

  /** A faixa aparece no endereço novo, com o mural vazio, até ser fechada (ou o mural chegar). */
  readonly offered = computed(() => this.origin() === NEW_ORIGIN && !this.closed() && (!this.store.hasContent() || this.state() !== 'pronto'));

  close(): void {
    this.closed.set(true);
    writeText(CLOSED_KEY, '1');
  }

  /** Abre a ponte e espera o mural. A janela precisa sair de um clique (senão o navegador bloqueia). */
  bring(): void {
    if (this.state() === 'abrindo') return;
    const win = window.open(BRIDGE_URL, 'murall-ponte', 'popup,width=480,height=360');
    if (!win) {
      this.state.set('bloqueado');
      return;
    }
    this.state.set('abrindo');
    const done = (state: MoveState) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      this.state.set(state);
    };
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { tipo?: unknown; semAntigo?: unknown } | null;
      if (!d || d.tipo !== 'murall-ponte') return;
      // aberta já aqui (o navegador não guardou o endereço antigo): nada para trazer
      if (e.origin === this.origin() && d.semAntigo === true) return done('sem-antigo');
      if (e.origin !== OLD_ORIGIN) return;
      const data = cleanBridge(e.data);
      if (!data || !bridgeHasWall(data)) return done('vazio');
      void this.save(data).then(
        () => this.reload(),
        () => done('falhou'),
      );
    };
    const timer = setTimeout(() => done('falhou'), WAIT_MS);
    window.addEventListener('message', onMessage);
  }

  /** Grava o que veio como estava lá: primeiro o IndexedDB, depois o localStorage. */
  async save(data: BridgeData): Promise<void> {
    await writeDb(data.idb);
    for (const [k, v] of Object.entries(data.ls)) localStorage.setItem(k, v);
  }
}

function writeDb(entries: Record<string, string>): Promise<void> {
  const list = Object.entries(entries);
  if (!list.length || typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DATA_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('chaves');
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('bloqueado'));
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('chaves', 'readwrite');
      const store = tx.objectStore('chaves');
      for (const [k, v] of list) store.put(v, k);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
