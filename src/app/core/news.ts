import { Injectable, computed, inject, signal } from '@angular/core';
import { Cloud, CloudNotice } from './cloud-config';
import { ReviewStore } from './review-store';
import { todayISO } from './dates';
import { readText, writeJson } from './storage';

/**
 * As novidades do site: a lista fica em `news-list.ts` e as regras de cada entrada (o que é
 * funcionalidade, melhoria ou correção, e quando juntar) em `NOVIDADES.md`, na raiz; aqui ficam os
 * tipos, as regras de visto e a faixa do topo. A lista chega num pedaço à parte, logo depois de o site
 * abrir: até lá, nada de novidade nem de faixa (`ready`).
 */
export interface NewsEntry {
  /**
   * O que fica guardado como visto neste navegador. A entrada de funcionalidade nunca troca de id; a de
   * ajustes troca quando ganha um item (ver `NOVIDADES.md`).
   */
  id: string;
  /** A versão do site, MAIOR.MENOR.AJUSTE: a funcionalidade sobe o do meio; os ajustes, o último. */
  version: string;
  /** `funcionalidade`: uma coisa nova, com `items`; `ajustes`: as melhorias e as correções de um dia. */
  kind: NewsKind;
  /** O dia da atualização, AAAA-MM-DD. */
  date: string;
  title: string;
  /** Funcionalidade: o que ela traz, uma frase por item. */
  items?: string[];
  /** Ajustes: o que já existia e ficou melhor. */
  melhorias?: string[];
  /** Ajustes: o que não funcionava como devia e agora funciona. */
  correcoes?: string[];
  /**
   * A frase da faixa no topo do site, só numa funcionalidade: melhorias e correções ficam só na página
   * (uma faixa a cada ajuste atrapalharia quem está usando). Sem ela, a novidade só aparece na página.
   */
  notice?: string;
  /** Até quando a faixa aparece (AAAA-MM-DD, inclusive). */
  until?: string;
  /**
   * O id da entrada de onde esta saiu, quando uma entrada antiga foi separada em duas:
   * quem já tinha visto aquela já viu esta.
   */
  was?: string;
}

export type NewsKind = 'funcionalidade' | 'ajustes';

/** O tipo de cada mudança, como a etiqueta da página mostra. */
export type NewsChangeKind = 'funcionalidade' | 'melhoria' | 'correcao';

/** O nome da etiqueta de cada tipo de mudança. */
export const NEWS_KIND_LABEL: Record<NewsChangeKind, string> = { funcionalidade: 'Funcionalidade', melhoria: 'Melhorias', correcao: 'Correções' };

/** A versão que vem depois de `prev`: a funcionalidade sobe o número do meio; os ajustes, o último. */
export function nextVersion(prev: string, kind: NewsKind): string {
  const [major, minor, patch] = prev.split('.').map(Number);
  return kind === 'funcionalidade' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/** Tudo o que é dela na lista de vistas: ela e a entrada de onde ela saiu. */
function keysOf(n: NewsEntry): string[] {
  return n.was ? [n.id, n.was] : [n.id];
}

/** Já foi vista: ela mesma, ou a entrada antiga de onde ela saiu. */
export function isSeen(n: NewsEntry, seen: ReadonlySet<string>): boolean {
  return seen.has(n.id) || (n.was !== undefined && seen.has(n.was));
}

/** O que a faixa do topo mostra. */
export interface Notice {
  /** O que fica guardado como visto quando a pessoa fecha. */
  key: string;
  text: string;
  /** Tem link para a página de novidades (os avisos da nuvem não têm). */
  news: boolean;
}

export const NEWS_SEEN_KEY = 'meu-mural:novidades';
const KEY = NEWS_SEEN_KEY;
/** Um limite para os avisos da nuvem vistos não crescerem para sempre (eles não estão em NEWS). */
const MAX_SEEN = 200;


/**
 * O que vai para a lista de vistas: as novidades vistas, todas (cortar uma faria ela voltar como
 * nova), e os avisos da nuvem só até `MAX_SEEN`, os mais recentes.
 */
export function seenToSave(seen: ReadonlySet<string>, news: readonly NewsEntry[]): string[] {
  const known = new Set(news.flatMap(keysOf));
  const list = [...seen];
  return [...list.filter((k) => known.has(k)), ...list.filter((k) => !known.has(k)).slice(-MAX_SEEN)];
}

/**
 * Quem nunca passou por aqui: quem chega agora não recebe notícia velha (tudo conta como visto);
 * quem já tinha um mural antes desta página existir vê só a mais nova.
 */
export function firstSeen(news: readonly NewsEntry[], hadWall: boolean): string[] {
  return (hadWall ? news.slice(1) : news).map((n) => n.id);
}

/**
 * A faixa da vez: o aviso da nuvem, se houver um não visto e no prazo; senão, a funcionalidade mais
 * nova que tem aviso (os ajustes nunca viram faixa, nem escondem a da funcionalidade de antes). Só
 * essa: fechar a faixa nunca faz uma mais velha aparecer no lugar.
 */
export function noticeOf(news: readonly NewsEntry[], cloud: CloudNotice | null, seen: ReadonlySet<string>, day: string): Notice | null {
  if (cloud && !seen.has(`nuvem:${cloud.id}`) && (!cloud.until || cloud.until >= day)) {
    return { key: `nuvem:${cloud.id}`, text: cloud.text, news: false };
  }
  const latest = news.find((n) => n.kind === 'funcionalidade' && n.notice);
  if (!latest?.notice) return null;
  if (isSeen(latest, seen) || (latest.until && latest.until < day)) return null;
  return { key: latest.id, text: latest.notice, news: true };
}

/** Lê o que ficou guardado; null se nunca foi gravado (ou não serve). */
export function readSeen(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as { vistas?: unknown };
    const list = data?.vistas;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class News {
  private readonly cloud = inject(Cloud);
  private readonly store = inject(ReviewStore);

  /** As novidades, da mais nova para a mais velha (vazia até a lista chegar). */
  readonly entries = signal<readonly NewsEntry[]>([]);
  private readonly seen = signal<ReadonlySet<string>>(new Set());
  private readonly loaded = signal(false);
  /** Hoje, uma vez por abertura: o prazo de um aviso não precisa de relógio. */
  private readonly day = todayISO();
  /** Quando a lista chegou e o que foi visto já foi lido. */
  readonly ready: Promise<void>;

  /** A faixa do topo, ou null. */
  readonly notice = computed(() => (this.loaded() ? noticeOf(this.entries(), this.cloud.notice(), this.seen(), this.day) : null));
  /** Quantas novidades esta pessoa ainda não viu. */
  readonly unseen = computed(() => this.entries().filter((n) => !isSeen(n, this.seen())).length);

  constructor() {
    this.ready = import('./news-list').then(({ NEWS }) => {
      this.entries.set(NEWS);
      this.seen.set(this.load());
      this.loaded.set(true);
    });
    // fechar a faixa numa aba fecha nas outras
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== KEY) return;
        const list = readSeen(e.newValue);
        if (list) this.seen.set(new Set(list));
      });
    }
  }

  /** As novidades que esta pessoa ainda não tinha visto. */
  unseenIds(): Set<string> {
    return new Set(this.entries().filter((n) => !isSeen(n, this.seen())).map((n) => n.id));
  }

  /** Fecha a faixa: ela não volta. */
  dismiss(key: string): void {
    this.mark([key]);
  }

  /** Abriu a página: tudo conta como visto, e a faixa de novidade vai embora. */
  seeAll(): void {
    this.mark(this.entries().map((n) => n.id));
  }

  private mark(keys: string[]): void {
    // antes da lista chegar não há o que marcar (e gravar agora apagaria as vistas guardadas)
    if (!this.loaded()) return;
    const next = new Set(this.seen());
    let changed = false;
    for (const k of keys) {
      if (!next.has(k)) {
        next.add(k);
        changed = true;
      }
    }
    if (!changed) return;
    this.seen.set(next);
    this.save(next);
  }

  private load(): ReadonlySet<string> {
    // sem localStorage, nada lido: a faixa volta a cada abertura, o que é melhor que nunca avisar
    const list = readSeen(readText(KEY));
    if (list) return new Set(list);
    const first = new Set(firstSeen(this.entries(), this.store.hasContent()));
    this.save(first);
    return first;
  }

  private save(seen: ReadonlySet<string>): void {
    writeJson(KEY, { vistas: seenToSave(seen, this.entries()) });
  }
}
