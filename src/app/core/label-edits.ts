import { Injectable, inject } from '@angular/core';
import { CategoryLook, CategoryLooks, lookKey, tagKeyPrefix, tagLookKey } from './category-looks';
import { KanbanStore } from './kanban-store';
import { NotesConfig, savedSubjects, withSavedSubjects } from './mural-config';
import { MAX_PINNED_TAGS, cleanCategory, cleanSubject, cleanTag, sanitizeTags } from './note-labels';
import { Review } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';

/**
 * Renomear e apagar uma categoria, um assunto ou uma tag das anotações, pelas Configurações do mural. O nome mora
 * em vários lugares, e todos acompanham: as próprias anotações, o ícone e a cor (nos jeitos das
 * categorias, com as chaves "#" das tags), a ordem e os padrões de cada categoria, as tags fixas e o
 * quadro do Kanban (um por categoria, pelo nome).
 *
 * O assunto e a tag são de uma categoria (o assunto também fica na lista dos criados nas
 * configurações, `NotesConfig.subjects`, que acompanha). A tag é de uma categoria: renomear ou apagar a "Bug" do Trabalho não mexe na "Bug" dos Estudos, e
 * cada uma tem a sua cor (ver `tagLookKey`).
 *
 * Renomear para o nome de outra que já existe junta as duas: as anotações passam para ela, e o que
 * ela já tinha (cor, padrões, lugar na ordem, colunas do quadro) vale; o da que sumiu só entra onde
 * ela não tinha nada. Trocar só a caixa ou o acento ("trabalho" → "Trabalho") é a mesma categoria:
 * só a grafia das anotações muda.
 *
 * As compartilhadas mudam como as outras: o grupo, o assunto e as tags delas são de cada um (ver
 * core/shared-notes.ts), então a troca vale só no mural de quem está aqui.
 */

/** O que mudou: quantas anotações. */
export interface LabelEditResult {
  changed: number;
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

/** A anotação é da categoria (pela chave; "" é a sem categoria)? */
export function inCategory(r: Pick<Review, 'category'>, category: string): boolean {
  return lookKey(r.category ?? '') === category;
}

/** As anotações da categoria `category` (a chave) com a tag `from` (pela chave), agora com `to` no lugar dela (null: sem ela). */
export function notesWithTag(notes: readonly Review[], category: string, from: string, to: string | null, at: string): Review[] {
  const out: Review[] = [];
  for (const r of notes) {
    if (!inCategory(r, category)) continue;
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

/** As anotações da categoria `category` (a chave) com o assunto `from` (pela chave), agora com `to` (null: sem assunto). */
export function notesWithSubject(notes: readonly Review[], category: string, from: string, to: string | null, at: string): Review[] {
  const out: Review[] = [];
  for (const r of notes) {
    if (!inCategory(r, category) || !r.subject || lookKey(r.subject) !== from || to === r.subject) continue;
    const { subject: _s, ...rest } = r;
    out.push({ ...rest, ...(to ? { subject: to } : {}), updatedAt: at } as Review);
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

/**
 * A cor das tags da categoria `from` passada para a categoria `to` (null: apagada, e as cores vão
 * junto); a que a tag já tinha em `to`, se tinha, vale.
 */
export function tagLooksMoved(looks: CategoryLooks, from: string, to: string | null): Record<string, CategoryLook> {
  const out: Record<string, CategoryLook> = { ...looks };
  const fromPrefix = tagKeyPrefix(from);
  if (to !== null && tagKeyPrefix(to) === fromPrefix) return out;
  for (const [k, look] of Object.entries(looks)) {
    // a chave de uma tag nunca começa com "#": o que começa é de outra categoria ("a" e "a#b")
    if (!k.startsWith(fromPrefix) || k.slice(fromPrefix.length).startsWith('#')) continue;
    delete out[k];
    const moved = to === null ? null : tagKeyPrefix(to) + k.slice(fromPrefix.length);
    if (moved && !out[moved]) out[moved] = look;
  }
  return out;
}

/**
 * A cor da tag `from` na categoria passada para `to` (null: apagada). A que valia vai junto, mesmo a
 * de sempre da tag (que não muda o nome, porque vale nas outras categorias). Juntando (`to` já está
 * em anotações da categoria), vale a cor de `to`.
 */
export function tagLookMoved(looks: CategoryLooks, category: string, from: string, to: string | null, merging: boolean): Record<string, CategoryLook> {
  const out: Record<string, CategoryLook> = { ...looks };
  const fromKey = tagLookKey(from, category);
  const look = looks[fromKey] ?? (looks[tagLookKey(from)]?.color ? { color: looks[tagLookKey(from)]!.color } : null);
  delete out[fromKey];
  if (to === null || lookKey(to) === lookKey(from)) {
    if (to !== null && looks[fromKey]) out[fromKey] = looks[fromKey];
    return out;
  }
  const toKey = tagLookKey(to, category);
  if (merging) return out;
  if (look) out[toKey] = look;
  // sem cor, continua sem: a cor de sempre do nome novo (de outra categoria) não entra por baixo
  else if (looks[tagLookKey(to)]?.color) out[toKey] = { none: true };
  else delete out[toKey];
  return out;
}

/**
 * A ordem e os padrões das categorias com a chave `from` passada para `to` (null: apagada), e as tags
 * dela que nascem escondidas no filtro: vão para `to` (apagada, para as anotações sem categoria, para
 * onde as anotações dela vão).
 */
export function configMoved(cfg: NotesConfig, from: string, to: string | null): NotesConfig {
  if (from === to) return cfg;
  const order = cfg.order.flatMap((k) => (k !== from ? [k] : to && !cfg.order.includes(to) ? [to] : []));
  const { [from]: moving, ...categories } = cfg.categories;
  if (moving && to && !categories[to]) categories[to] = moving;
  const fromPrefix = tagKeyPrefix(from);
  const toPrefix = tagKeyPrefix(to ?? '');
  const hiddenTags: string[] = [];
  for (const k of cfg.hiddenTags) {
    // (a chave de uma tag nunca começa com "#": o que começa é de outra categoria, "a" e "a#b")
    const mine = k.startsWith(fromPrefix) && !k.slice(fromPrefix.length).startsWith('#');
    const moved = mine ? toPrefix + k.slice(fromPrefix.length) : k;
    if (!hiddenTags.includes(moved)) hiddenTags.push(moved);
  }
  // os assuntos criados: os da categoria vão junto (para as anotações sem grupo, se ela foi apagada),
  // depois dos que a outra já tinha
  const { [from]: movingSubjects, ...subjects } = cfg.subjects;
  const target = to ?? '';
  const out = { ...cfg, order, categories, hiddenTags, subjects };
  return movingSubjects?.length ? withSavedSubjects(out, target, [...(subjects[target] ?? []), ...movingSubjects]) : out;
}

/** O assunto `from` da lista dos criados da categoria trocado por `to` (null: sai da lista). */
export function subjectConfigMoved(cfg: NotesConfig, category: string, from: string, to: string | null): NotesConfig {
  const list = savedSubjects(cfg, category);
  if (!list.some((x) => lookKey(x) === from)) return cfg;
  const next = list.flatMap((x) => (lookKey(x) === from ? (to ? [to] : []) : [x]));
  return withSavedSubjects(cfg, category, next);
}

/**
 * O filtro padrão da tag `from` da categoria passado para `to` (null: apagada, e o padrão sai junto).
 * Juntando com uma tag que já existe, vale o padrão dela.
 */
export function tagConfigMoved(cfg: NotesConfig, category: string, from: string, to: string | null, merging: boolean): NotesConfig {
  const fromKey = tagLookKey(from, category);
  if (!cfg.hiddenTags.includes(fromKey) || (to !== null && lookKey(to) === lookKey(from))) return cfg;
  const rest = cfg.hiddenTags.filter((k) => k !== fromKey);
  const toKey = to === null || merging ? null : tagLookKey(to, category);
  return { ...cfg, hiddenTags: toKey && !rest.includes(toKey) ? [...rest, toKey] : rest };
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

  /** Quantas anotações têm a categoria (pela chave). */
  categoryUses(category: string): number {
    const key = lookKey(category);
    return this.store.notes().filter((r) => !!r.category && lookKey(r.category) === key).length;
  }

  /** Quantas anotações da categoria ("" é a sem categoria) têm a tag (pela chave). */
  tagUses(tag: string, category: string): number {
    const key = lookKey(tag);
    const cat = lookKey(category);
    return this.store.notes().filter((r) => inCategory(r, cat) && (r.tags ?? []).some((t) => lookKey(t) === key)).length;
  }

  /** Quantas anotações da categoria ("" é a sem categoria) têm o assunto (pela chave). */
  subjectUses(subject: string, category: string): number {
    const key = lookKey(subject);
    const cat = lookKey(category);
    return this.store.notes().filter((r) => inCategory(r, cat) && !!r.subject && lookKey(r.subject) === key).length;
  }

  /** O nome de outro assunto da mesma categoria (numa anotação ou entre os criados) que já atende por `name`, para juntar. */
  existingSubject(name: string, except: string, category: string): string | null {
    const key = lookKey(name);
    const cat = lookKey(category);
    if (key === lookKey(except)) return null;
    const used = this.store.notes().find((r) => inCategory(r, cat) && !!r.subject && lookKey(r.subject) === key)?.subject;
    return used ?? savedSubjects(this.settings.notesConfig(), category).find((x) => lookKey(x) === key) ?? null;
  }

  /**
   * Renomeia o assunto nas anotações da categoria ("" é a sem categoria; null no nome: tira dele) e na
   * lista dos criados nas configurações.
   */
  renameSubject(subject: string, category: string, name: string | null): LabelEditResult {
    const from = lookKey(subject);
    const cat = lookKey(category);
    const to = name === null ? null : cleanSubject(name);
    if (to === '') return { changed: 0 };
    const result = this.save(notesWithSubject(this.store.notes(), cat, from, to, new Date().toISOString()));
    const cfg = subjectConfigMoved(this.settings.notesConfig(), category, from, to);
    if (cfg !== this.settings.notesConfig()) this.settings.setNotesConfig(cfg);
    return result;
  }

  /** O nome de outra categoria que já atende por `name` (sem ligar para caixa e acento), para juntar. */
  existingCategory(name: string, except: string): string | null {
    const key = lookKey(name);
    if (key === lookKey(except)) return null;
    return this.store.notes().find((r) => !!r.category && lookKey(r.category) === key)?.category ?? null;
  }

  /** O nome de outra tag da mesma categoria que já atende por `name`, para juntar. */
  existingTag(name: string, except: string, category: string): string | null {
    const key = lookKey(name);
    const cat = lookKey(category);
    if (key === lookKey(except)) return null;
    return this.store.notes().filter((r) => inCategory(r, cat)).flatMap((r) => r.tags ?? []).find((t) => lookKey(t) === key) ?? null;
  }

  /** Renomeia a categoria (null: apaga). Devolve quantas anotações mudaram e quantas ficaram de fora. */
  renameCategory(category: string, name: string | null): LabelEditResult {
    const from = lookKey(category);
    const to = name === null ? null : cleanCategory(name);
    if (to === '') return { changed: 0 };
    const toKey = to === null ? null : lookKey(to);
    const result = this.save(notesWithCategory(this.store.notes(), from, to, new Date().toISOString()));
    if (toKey !== from) {
      // apagada, as anotações dela ficam sem categoria, e as tags levam a cor para lá
      this.settings.applyCategoryLooks(tagLooksMoved(looksMoved(this.settings.categoryLooks(), from, toKey), from, toKey ?? ''), new Date().toISOString());
      this.settings.setNotesConfig(configMoved(this.settings.notesConfig(), from, toKey));
      this.kanban.moveCategory(from, toKey);
    }
    return result;
  }

  /**
   * Renomeia a tag nas anotações da categoria ("" é a sem categoria; null no nome: tira dela). A tag
   * fixa acompanha só quando a de antes não ficou em mais nenhuma anotação.
   */
  renameTag(tag: string, category: string, name: string | null): LabelEditResult {
    const from = lookKey(tag);
    const cat = lookKey(category);
    const to = name === null ? null : cleanTag(name);
    if (to === '') return { changed: 0 };
    const at = new Date().toISOString();
    const merging = to !== null && !!this.existingTag(to, tag, category);
    const result = this.save(notesWithTag(this.store.notes(), cat, from, to, at));
    this.settings.applyCategoryLooks(tagLookMoved(this.settings.categoryLooks(), cat, tag, to, merging), at);
    const cfg = tagConfigMoved(this.settings.notesConfig(), cat, tag, to, merging);
    if (cfg !== this.settings.notesConfig()) this.settings.setNotesConfig(cfg);
    const left = this.store.notes().some((r) => (r.tags ?? []).some((t) => lookKey(t) === from));
    if (!left && this.settings.pinnedTags().some((t) => lookKey(t) === from)) this.settings.applyPinnedTags(pinnedMoved(this.settings.pinnedTags(), from, to), at);
    return result;
  }

  /** Salva as anotações mudadas. */
  private save(changed: readonly Review[]): LabelEditResult {
    for (const r of changed) this.store.update(r, this.store.get(r.id));
    return { changed: changed.length };
  }
}
