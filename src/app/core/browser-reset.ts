import { Injectable } from '@angular/core';
import { BEFORE_CLOUD_DB } from './cloud-before';
import { ACCOUNT_KEY, SESSION_KEY, readAccount, readToken } from './cloud-account';
import { COLLEAGUES_DB } from './colleague-store';
import { DATA_DB } from './local-data';
import { PREFIXES, deleteDatabase } from './erase-save';
import { freezeStorage } from './storage';

/**
 * O que está guardado neste navegador é de alguém: de uma conta (a que está nele, e só enquanto ela
 * está) ou de ninguém (o mural de quem nunca entrou). O de uma conta nunca se junta com o de outra:
 *
 * - Sair da conta (por aqui, por "Sair de todos" em outro aparelho, ou a conta apagada) limpa o
 *   navegador inteiro: as listas, os Gastos, o Calendário, o Kanban, os ajustes, o perfil, as capas
 *   guardadas. Na nuvem fica tudo.
 * - O de uma conta sem a sessão dela (um site de antes, que deixava o mural ficar ao sair) é limpo ao
 *   abrir.
 * - Entrar com o mural de outra conta aqui limpa antes (ver `firstSync` em core/cloud-sync.ts); o de
 *   ninguém pergunta se vai junto.
 *
 * A limpeza acontece na subida da página, antes de qualquer parte do app ler o que guardou: quem pede
 * marca `RESET_KEY` e recarrega. Até recarregar, nada mais grava (`freezeStorage`), e as outras abas
 * abertas recarregam junto (`watchOtherTabs`).
 */

/** De quem é o mural deste navegador: o id da conta, ou nada (de ninguém). */
export const OWNER_KEY = 'meu-mural:nuvem:dono';
/** Pedido de limpar o navegador na próxima subida, com o que fica (ver `ResetKeep`). */
export const RESET_KEY = 'meu-mural:limpar';
/** As capas guardadas pelo service worker (public/sw.js): mostram o que a pessoa viu. */
export const COVERS_CACHE = 'mural-capas-v1';
/** Na sessão da aba: por que o navegador acabou de ser limpo, para Ajustes avisar depois de recarregar. */
const DONE_KEY = 'meu-mural:limpo';

/**
 * O que a limpeza deixa: `sessao`, a conta que está entrando (o mural de outra conta saiu, ou "Só o da
 * conta"); `copia`, a cópia de antes da nuvem (o mural de ninguém que ficou de fora, por 30 dias).
 */
export type ResetKeep = 'sessao' | 'copia';
/** Por que limpou: saiu da conta, apagou a conta, ou entrou numa e o que estava aqui ficou de fora. */
export type ResetReason = 'saiu' | 'apagou' | 'entrou';
const REASONS: readonly string[] = ['saiu', 'apagou', 'entrou'];

interface ResetRequest {
  keep: ResetKeep[];
  motivo: ResetReason;
}

function readRequest(raw: string | null): ResetRequest | null {
  if (raw === null) return null;
  try {
    const r = JSON.parse(raw) as Partial<ResetRequest> | null;
    const keep = Array.isArray(r?.keep) ? r.keep.filter((k): k is ResetKeep => k === 'sessao' || k === 'copia') : [];
    return { keep, motivo: REASONS.includes(r?.motivo ?? '') ? r!.motivo! : 'saiu' };
  } catch {
    return { keep: [], motivo: 'saiu' };
  }
}

/** As chaves do mural no `storage`, menos as de `keep`. */
export function resetKeys(storage: Pick<Storage, 'length' | 'key'>, keep: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && !keep.has(key) && PREFIXES.some((p) => key.startsWith(p))) out.push(key);
  }
  return out;
}

/**
 * Limpa o navegador: todas as chaves do mural, os bancos do IndexedDB e as capas guardadas, menos o de
 * `keep`. O pedido (`RESET_KEY`) sai por último: se a aba fechar no meio, a próxima subida termina.
 */
export async function wipeBrowser(keep: readonly ResetKeep[] = []): Promise<void> {
  const kept = new Set<string>([RESET_KEY, ...(keep.includes('sessao') ? [SESSION_KEY, ACCOUNT_KEY] : [])]);
  try {
    for (const key of resetKeys(localStorage, kept)) localStorage.removeItem(key);
  } catch {
    /* sem localStorage, não há o que tirar dele */
  }
  try {
    // o da aba também (o aviso de depois da limpeza é gravado depois dela, em `resetOnBoot`)
    for (const key of resetKeys(sessionStorage)) sessionStorage.removeItem(key);
  } catch {
    /* sem sessionStorage, idem */
  }
  const databases = [DATA_DB, COLLEAGUES_DB, ...(keep.includes('copia') ? [] : [BEFORE_CLOUD_DB])];
  await Promise.all(databases.map(deleteDatabase));
  try {
    if (typeof caches !== 'undefined') await caches.delete(COVERS_CACHE);
  } catch {
    /* sem Cache Storage (aba anônima): não há capas guardadas */
  }
  try {
    localStorage.removeItem(RESET_KEY);
  } catch {
    /* idem */
  }
}

/**
 * Na subida da página, antes do app: limpa se alguém pediu, ou se o mural daqui é de uma conta que não
 * está mais neste navegador. Devolve se limpou.
 */
export async function resetOnBoot(): Promise<boolean> {
  let request: ResetRequest | null;
  let orphan: boolean;
  try {
    request = readRequest(localStorage.getItem(RESET_KEY));
    // sem a sessão ou sem a conta inteira (uma das duas não coube ao entrar, ou se estragou), ninguém
    // está neste navegador: o app abre como fora da conta, e o mural dela não pode ficar à mostra
    orphan = localStorage.getItem(OWNER_KEY) !== null && (readToken() === null || readAccount() === null);
  } catch {
    return false;
  }
  if (!request && !orphan) return false;
  // sem a sessão, não há conta para deixar
  const keep = orphan ? (request?.keep ?? []).filter((k) => k !== 'sessao') : request!.keep;
  await wipeBrowser(keep);
  try {
    sessionStorage.setItem(DONE_KEY, request?.motivo ?? 'saiu');
  } catch {
    /* fica sem o aviso */
  }
  return true;
}

/** O navegador acabou de ser limpo? Diz o motivo uma vez só. */
export function takeReset(): ResetReason | null {
  try {
    const was = sessionStorage.getItem(DONE_KEY);
    sessionStorage.removeItem(DONE_KEY);
    return was !== null && REASONS.includes(was) ? (was as ResetReason) : null;
  } catch {
    return null;
  }
}

/** Outra aba pediu a limpeza: esta para de gravar e recarrega junto (e limpa, se for a primeira a subir). */
export function watchOtherTabs(reload: () => void = () => location.reload(), freeze: () => void = freezeStorage): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (e: StorageEvent) => {
    if (e.key !== RESET_KEY || e.newValue === null) return;
    freeze();
    reload();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

/** Pede a limpeza do navegador e recarrega (os testes trocam `reload` e `freeze`). */
@Injectable({ providedIn: 'root' })
export class BrowserReset {
  reload = () => location.reload();
  freeze = freezeStorage;
  /** O pedido em andamento (a página está recarregando). */
  pending: ResetRequest | null = null;

  request(motivo: ResetReason, keep: ResetKeep[] = []): void {
    if (this.pending) return;
    const pending: ResetRequest = { keep, motivo };
    this.pending = pending;
    this.freeze();
    try {
      localStorage.setItem(RESET_KEY, JSON.stringify(pending));
    } catch {
      // Não coube nem o pedido (o armazenamento cheio, com o espelho do mural): sem ele, a subida não
      // limparia o que não tem dono marcado. A limpeza começa daqui; com espaço, o pedido vai depois,
      // para as outras abas recarregarem e a subida terminar e avisar.
      void wipeBrowser(keep)
        .then(() => localStorage.setItem(RESET_KEY, JSON.stringify(pending)))
        .catch(() => undefined)
        .finally(() => this.reload());
      return;
    }
    this.reload();
  }
}
