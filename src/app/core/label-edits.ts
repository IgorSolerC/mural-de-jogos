import { Injectable, inject } from '@angular/core';
import { CategoryLook, CategoryLooks, lookKey, tagLookKey } from './category-looks';
import { KanbanStore } from './kanban-store';
import { NotesConfig } from './mural-config';
import { MAX_PINNED_TAGS, cleanCategory, cleanTag, sanitizeTags } from './note-labels';
import { Review } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { canManage } from './shared-notes';
import { SharedStore } from './shared-store';

/**
 * Renomear e apagar uma categoria ou uma tag das anotações, pelas Configurações do mural. O nome mora
 * em vários lugares, e todos acompanham: as próprias anotações, o ícone e a cor (nos jeitos das
 * categorias, com a chave "#" das tags), a ordem e os padrões de cada categoria, as tags fixas e o
 * quadro do Kanban (um por categoria, pelo nome).
 *
 * Renomear para o nome de outra que já existe junta as duas: as anotações passam para ela, e o que
 * ela já tinha (cor, padrões, lugar na ordem, colunas do quadro) vale; o da que sumiu só entra onde
 * ela não tinha nada. Trocar só a caixa ou o acento ("trabalho" → "Trabalho") é a mesma categoria:
 * só a grafia das anotações muda.
 *
 * Uma anotação compartilhada em que a pessoa não gere (Editor, Leitor) fica como está: a categoria e
 * as tags dela são do dono e dos gestores (a loja das compartilhadas desfaria a troca).
 */

/** O que mudou: quantas anotações e quantas compartilhadas ficaram de fora. */
export interface LabelEditResult {
  changed: number;
  skipped: number;
}

// ===== as anotações =====

/** As anotações com a categoria `from` (pela chave), agora com `to` (null: sem categoria). */
export function notesWithCategory(notes: readonly Review[], from: string, to: string | null, at: string): Review[] {
  const out: Review[] = [];
  for (const r of notes) {
    if (!r.category || lookKey(r.category) !== from) continue;
    if (to === r.category) continue;
    const { category: _c, ...rest } = r;
    out.push({ ...rest, ...(to ? { category: to } : {}), updatedAt: at } as Review);
  }
  return out;
}

/** As anotações com a tag `from` (pela chave), agora com `to` no lugar dela (null: sem ela). */
export function notesWithTag(notes: readonly Review[], from: string, to: string | null, at: string): Review[] {
  const out: Review[] = [];
  for (const r of notes) {
    const tags = r.tags ?? [];
    if (!tags.some((t) => lookKey(t) === from)) continue;
    // no lugar dela, para a ordem das tags na ficha não mudar; se a anotação já tinha a outra, fica uma
    const next = sanitizeTags(tags.flatMap((t) => (lookKey(t) === from ? (to ? [to] : []) : [t])));
    if (next.length === tags.length && next.every((t, i) => t === tags[i])) continue;
    const { tags: _t, ...rest } = r;
    out.push({ ...rest, ...(next.length ? { tags: next } : {}), updatedAt: at } as Review);
  }
  return out;
}

// ===== o que fica guardado pelo nome =====

/** Os jeitos (ícone e cor) com a chave `from` passada para `to` (null: apagada); a de `to`, se já tinha, vale. */
export function looksMoved(looks: CategoryLooks, from: string, to: string | null): Record<string, CategoryLook> {
  const { [from]: moving, ...rest } = looks;
  if (from === to) return { ...looks };
  if (!moving || !to || rest[to]) return rest;
  return { ...rest, [to]: moving };
}

/** A ordem e os padrões das categorias com a chave `from` passada para `to` (null: apagada). */
export function configMoved(cfg: NotesConfig, from: string, to: string | null): NotesConfig {
  if (from === to) return cfg;
  const order = cfg.order.flatMap((k) => (k !== from ? [k] : to && !cfg.order.includes(to) ? [to] : []));
  const { [from]: moving, ...categories } = cfg.categories;
  if (moving && to && !categories[to]) categories[to] = moving;
  return { ...cfg, order, categories };
}

/** As tags fixas com a tag `from` (pela chave) trocada por `to` (null: solta). */
export function pinnedMoved(pinned: readonly string[], from: string, to: string | null): string[] {
  return sanitizeTags(pinned.flatMap((t) => (lookKey(t) === from ? (to ? [to] : []) : [t])), MAX_PINNED_TAGS);
}

@Injectable({ providedIn: 'root' })
export class LabelEdits {
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly kanban = inject(KanbanStore);
  private readonly shared = inject(SharedStore);

  /** Quantas anotações têm a categoria (pela chave). */
  categoryUses(category: string): number {
    const key = lookKey(category);
    return this.store.notes().filter((r) => !!r.category && lookKey(r.category) === key).length;
  }

  /** Quantas anotações têm a tag (pela chave). */
  tagUses(tag: string): number {
    const key = lookKey(tag);
    return this.store.notes().filter((r) => (r.tags ?? []).some((t) => lookKey(t) === key)).length;
  }

  /** O nome de outra categoria que já atende por `name` (sem ligar para caixa e acento), para juntar. */
  existingCategory(name: string, except: string): string | null {
    const key = lookKey(name);
    if (key === lookKey(except)) return null;
    return this.store.notes().find((r) => !!r.category && lookKey(r.category) === key)?.category ?? null;
  }

  existingTag(name: string, except: string): string | null {
    const key = lookKey(name);
    if (key === lookKey(except)) return null;
    return this.store.notes().flatMap((r) => r.tags ?? []).find((t) => lookKey(t) === key) ?? null;
  }

  /** Renomeia a categoria (null: apaga). Devolve quantas anotações mudaram e quantas ficaram de fora. */
  renameCategory(category: string, name: string | null): LabelEditResult {
    const from = lookKey(category);
    const to = name === null ? null : cleanCategory(name);
    if (to === '') return { changed: 0, skipped: 0 };
    const toKey = to === null ? null : lookKey(to);
    const result = this.save(notesWithCategory(this.store.notes(), from, to, new Date().toISOString()));
    if (toKey !== from) {
      this.settings.applyCategoryLooks(looksMoved(this.settings.categoryLooks(), from, toKey), new Date().toISOString());
      this.settings.setNotesConfig(configMoved(this.settings.notesConfig(), from, toKey));
      this.kanban.moveCategory(from, toKey);
    }
    return result;
  }

  /** Renomeia a tag (null: tira de todas as anotações). */
  renameTag(tag: string, name: string | null): LabelEditResult {
    const from = lookKey(tag);
    const to = name === null ? null : cleanTag(name);
    if (to === '') return { changed: 0, skipped: 0 };
    const toKey = to === null ? null : lookKey(to);
    const result = this.save(notesWithTag(this.store.notes(), from, to, new Date().toISOString()));
    const at = new Date().toISOString();
    if (toKey !== from) {
      this.settings.applyCategoryLooks(looksMoved(this.settings.categoryLooks(), tagLookKey(tag), toKey === null ? null : `#${toKey}`), at);
    }
    if (this.settings.pinnedTags().some((t) => lookKey(t) === from)) this.settings.applyPinnedTags(pinnedMoved(this.settings.pinnedTags(), from, to), at);
    return result;
  }

  /** Salva as anotações mudadas, menos as compartilhadas em que a pessoa não gere. */
  private save(changed: readonly Review[]): LabelEditResult {
    let skipped = 0;
    let saved = 0;
    for (const r of changed) {
      const role = this.shared.role(r.id);
      if (role && !canManage(role)) {
        skipped++;
        continue;
      }
      const before = this.store.get(r.id);
      this.store.update(r, before);
      saved++;
    }
    return { changed: saved, skipped };
  }
}
