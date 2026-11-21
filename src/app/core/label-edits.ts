import { SharedGroupsStore } from './shared-groups-store';
import { Injectable, inject } from '@angular/core';
import { NoteFolders } from './note-folders';
import { siblingNamed } from './folders';
import { CategoryLook, CategoryLooks, lookKey, randomCategoryColor, tagKeyPrefix, tagLookKey } from './category-looks';
import { KanbanStore } from './kanban-store';
import { MAX_CONFIG_CATEGORIES, NotesConfig, prefsOf, savedSubjects, withSavedSubjects } from './mural-config';
import { MAX_PINNED_TAGS, cleanCategory, cleanNewCategory, cleanSubject, cleanTag, sanitizeTags } from './note-labels';
import type { Review } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { StudyStore } from './study-store';
import { FreeBoardStore } from './free-board-store';
import { NoteBulk } from './note-bulk';
import { CloudError } from './cloud-account';
import { canWrite } from './shared-notes';
import { GroupDeleteResult, GroupFate, configWithoutGroup, deletedGroupFolderName, notesLeavingGroup } from './group-delete';
import { isNote } from './review';

/**
 * Renomear e apagar uma categoria, um assunto ou uma tag das anotações, pelas Configurações do mural. O nome mora
 * em vários lugares, e todos acompanham: as próprias anotações, o ícone e a cor (nos jeitos das
 * categorias, com as chaves "#" das tags), a ordem e os padrões de cada categoria, as tags fixas, o
 * quadro do Kanban (um por categoria, pelo nome) e os baralhos dos Estudos (cada um é de um grupo).
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
  private readonly study = inject(StudyStore);
  private readonly freeBoards = inject(FreeBoardStore);
  private readonly folders = inject(NoteFolders);
  private readonly groups = inject(SharedGroupsStore);
  private readonly bulk = inject(NoteBulk);

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

  /** A pasta de cima do grupo ("" é a sem grupo) com esse nome (sem caixa e acento). */
  private topFolder(name: string, category: string): string | null {
    return siblingNamed(this.folders.tree(), lookKey(category), null, name)?.id ?? null;
  }

  /** Quantas anotações estão no assunto (a pasta de cima com esse nome, e as de dentro dela). */
  subjectUses(subject: string, category: string): number {
    const id = this.topFolder(subject, category);
    return id ? this.folders.countBelow(id) : 0;
  }

  /** O nome de outro assunto (pasta de cima) do mesmo grupo que já atende por `name`, para juntar. */
  existingSubject(name: string, except: string, category: string): string | null {
    if (lookKey(name) === lookKey(except)) return null;
    const id = this.topFolder(name, category);
    return id ? this.folders.nameOf(id) : null;
  }

  /**
   * Renomeia o assunto (a pasta de cima com esse nome) do grupo ("" é a sem grupo). Com o nome de outro
   * que já existe, junta os dois; null no nome desfaz a pasta (as anotações ficam soltas no grupo). Só
   * as configurações mudam: nenhuma anotação é regravada (ver core/folders.ts).
   */
  renameSubject(subject: string, category: string, name: string | null): LabelEditResult {
    const id = this.topFolder(subject, category);
    if (!id) return { changed: 0 };
    const changed = this.folders.countBelow(id);
    if (name === null) {
      this.folders.dissolve(id);
      return { changed };
    }
    const to = cleanSubject(name);
    if (to === '') return { changed: 0 };
    const twin = siblingNamed(this.folders.tree(), lookKey(category), null, to, id);
    if (twin) this.folders.join(id, twin.id);
    else this.folders.rename(id, to);
    return { changed };
  }

  /** O nome de outra categoria que já atende por `name` (sem ligar para caixa e acento), para juntar. */
  existingCategory(name: string, except: string): string | null {
    const key = lookKey(name);
    if (key === lookKey(except)) return null;
    // o das anotações, e o criado à mão sem nenhuma (PLANO-NOVO-GRUPO.md)
    return this.store.notes().find((r) => !!r.category && lookKey(r.category) === key)?.category ?? this.settings.madeGroups().find((g) => g.key === key)?.label ?? null;
  }

  /**
   * O grupo que já atende pelo nome (o nome dele): das anotações, criado à mão ou um compartilhado; null, nenhum. É o
   * que o "Novo grupo" do "Mais" avisa antes de criar (o `taken` de ui/tab-more.ts).
   */
  readonly groupNamed = (name: string): string | null => this.existingCategory(name, '') ?? (this.groups.ofCategory(name) ? cleanCategory(name) : null);

  /**
   * Cria o grupo sem nenhuma anotação (o "Novo grupo" do "Mais" das abas, PLANO-NOVO-GRUPO.md): guardado nas
   * configurações do mural até ser apagado, com uma cor sorteada, como todo grupo novo. O nome que já é de um grupo
   * (das anotações, criado à mão, ou um compartilhado) não cria nada: devolve esse grupo. O que só existe por um
   * baralho ou um quadro livre passa a ser criado, com a grafia dele. Vazio, ou sem lugar nas configurações: null.
   */
  createCategory(name: string): { label: string; created: boolean } | null {
    const typed = cleanNewCategory(name);
    if (!typed) return null;
    const there = this.groupNamed(typed);
    if (there) return { label: there, created: false };
    const key = lookKey(typed);
    const clean = this.study.decks().find((d) => !!d.group && lookKey(d.group) === key)?.group ?? this.freeBoards.boards().find((b) => lookKey(b.grupo) === key)?.grupo ?? typed;
    // (as configurações guardam até MAX_CONFIG_CATEGORIES grupos: além disso, o criado sumiria na próxima leitura)
    const cfg = this.settings.notesConfig();
    if (!cfg.categories[key] && Object.keys(cfg.categories).length >= MAX_CONFIG_CATEGORIES) return null;
    this.settings.setCategoryPrefs(clean, { name: clean });
    const look = this.settings.categoryLook(clean);
    if (!look.color) this.settings.setCategoryLook(clean, { ...look, color: randomCategoryColor() });
    return { label: clean, created: true };
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
    // um grupo compartilhado: o nome é do grupo, para todos (só o dono e os gestores renomeiam; apagar, nunca
    // por aqui: o dono para de compartilhar antes)
    const shared = this.groups.ofCategory(category);
    if (shared && (to === null || !this.groups.rename(shared.id, to))) return { changed: 0 };
    const toKey = to === null ? null : lookKey(to);
    // o grupo criado à mão continua criado com o nome novo (também juntado num outro, que fica criado)
    const made = !!prefsOf(this.settings.notesConfig(), category).name;
    const result = this.save(notesWithCategory(this.store.notes(), from, to, new Date().toISOString()));
    if (toKey !== from) {
      // apagada, as anotações dela ficam sem categoria, e as tags levam a cor para lá
      this.settings.applyCategoryLooks(tagLooksMoved(looksMoved(this.settings.categoryLooks(), from, toKey), from, toKey ?? ''), new Date().toISOString());
      this.settings.setNotesConfig(configMoved(this.settings.notesConfig(), from, toKey));
      // as pastas vão com o grupo (apagado: para o "Sem grupo", com as anotações)
      this.folders.moveGroup(from, toKey);
      this.kanban.moveCategory(from, toKey);
    }
    if (to !== null && (made || prefsOf(this.settings.notesConfig(), to).name)) this.settings.setCategoryPrefs(to, { name: to });
    // os baralhos do grupo vão com ele (também quando só muda a escrita: a caixa, um acento); apagado, saem
    this.study.moveGroup(category, to);
    // os quadros livres do grupo também (apagado, saem com ele: PLANO-QUADRO-LIVRE.md, decisão D12)
    void this.freeBoards.moveGroup(category, to);
    return result;
  }

  /** As anotações do grupo (pela chave), as suas e as compartilhadas que estão nele no seu mural. */
  private notesOf(key: string): Review[] {
    return this.store.notes().filter((r) => isNote(r) && !!r.category && lookKey(r.category) === key);
  }

  /**
   * Apaga o grupo, com o destino do que está nele (PLANO-APAGAR-GRUPO.md, D3): apagar tudo, levar para outro grupo
   * (as soltas e as pastas de cima entram na pasta escolhida) ou deixar sem grupo (dentro da pasta "Grupo deletado:
   * nome"). O ícone, a cor, os padrões e o lugar na ordem vão embora; o quadro do Kanban, os baralhos e os quadros
   * livres vão para o outro grupo, ou embora. Um grupo compartilhado: só o dono apaga, e antes ele deixa de ser
   * compartilhado (D6); se a nuvem falhar, nada muda aqui.
   */
  async deleteCategory(category: string, fate: GroupFate): Promise<GroupDeleteResult> {
    const none = { moved: 0, removed: 0 };
    const from = lookKey(category);
    if (!from) return { ok: false, error: 'Esse grupo não existe.', ...none };
    let target: string | null = null;
    if (fate.kind === 'levar') {
      const clean = cleanCategory(fate.to);
      if (!clean || lookKey(clean) === from) return { ok: false, error: 'Escolha outro grupo para onde levar.', ...none };
      const there = this.groups.ofCategory(clean);
      // num grupo compartilhado (seu ou de outra pessoa) em que você escreve, as anotações entram pelo nome e sobem
      // para ele uma a uma (SharedGroupsStore.adopt); o nome dele fica parado enquanto isso (D8)
      if (there && !canWrite(there.papel)) return { ok: false, error: `Em ${clean} você só lê: escolha outro grupo.`, ...none };
      // a grafia que o grupo já tem nas anotações
      target = this.existingCategory(clean, category) ?? clean;
    }
    const shared = this.groups.ofCategory(category);
    if (shared) {
      if (shared.papel !== 'dono') return { ok: false, error: `${category} é de ${shared.dono.nome}: para tirá-lo do seu mural, saia do grupo.`, ...none };
      try {
        // tudo o que está nele, até o que os outros escreveram, fica com você, no grupo de mesmo nome (o quadro também)
        const board = await this.groups.stop(shared.id);
        if (board) this.kanban.keep(board);
      } catch (err) {
        return { ok: false, error: err instanceof CloudError ? err.message : 'Não deu para parar de compartilhar agora. Tente de novo.', ...none };
      }
    }
    const at = new Date().toISOString();
    const looks = looksMoved(this.settings.categoryLooks(), from, null);
    const toKey = target === null ? null : lookKey(target);
    let result: GroupDeleteResult;
    if (fate.kind === 'apagar') {
      const done = await this.bulk.removeNow(this.bulk.plan(this.notesOf(from).map((r) => r.id)));
      // as que a nuvem não tirou ficam no grupo, e ele fica como estava (as pastas, o quadro, os baralhos, o jeito):
      // apagar de novo depois tira o resto
      if (this.notesOf(from).length) return { ok: true, moved: 0, removed: done.removed + done.cloud, failed: done.failed, kept: true };
      this.folders.dropGroup(from);
      this.settings.applyCategoryLooks(tagLooksMoved(looks, from, null), at);
      // (as configurações lidas agora: as pastas acabaram de mudar nelas)
      this.settings.setNotesConfig(configWithoutGroup(this.settings.notesConfig(), from, true));
      // as tags fixas que não estão em mais nenhuma anotação soltam (como ao apagar a tag)
      const used = new Set(this.store.notes().flatMap((r) => (r.tags ?? []).map(lookKey)));
      const pinned = this.settings.pinnedTags();
      if (pinned.some((t) => !used.has(lookKey(t)))) this.settings.applyPinnedTags(pinned.filter((t) => used.has(lookKey(t))), at);
      result = { ok: true, moved: 0, removed: done.removed + done.cloud, failed: done.failed };
    } else {
      const tree = this.folders.tree();
      let into: string | null = null;
      let made: string | undefined;
      if (fate.kind === 'levar') {
        into = fate.folder && tree.live(fate.folder)?.group === toKey ? fate.folder : null;
      } else if (this.store.notes().some((r) => r.category && lookKey(r.category) === from) || tree.kids(from, null).length) {
        // a pasta nova das sem grupo (sem repetir uma irmã); sem lugar para ela, as anotações ficam na raiz
        const folder = this.folders.createIn('', null, deletedGroupFolderName(category));
        into = folder?.id ?? null;
        made = folder?.name;
      }
      // as pastas primeiro: num grupo compartilhado, as anotações sobem já apontando para pastas que ele tem
      this.folders.moveGroup(from, toKey, into);
      const moved = this.save(notesLeavingGroup(this.store.notes(), tree, from, target, into, at)).changed;
      this.settings.applyCategoryLooks(tagLooksMoved(looks, from, toKey ?? ''), at);
      this.settings.setNotesConfig(configMoved(configWithoutGroup(this.settings.notesConfig(), from, false), from, toKey));
      result = { ok: true, moved, removed: 0, ...(made ? { folder: made } : {}) };
    }
    this.kanban.moveCategory(from, toKey);
    this.study.moveGroup(category, target);
    // (os quadros livres moram no IndexedDB: a falha de um não desfaz o resto)
    await this.freeBoards.moveGroup(category, target).catch(() => undefined);
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
