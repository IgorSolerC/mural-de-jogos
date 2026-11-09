import { PASTA_ID_RE } from '../../../contrato/api-v1/notas';
import { lookKey } from './category-looks';
import { LABEL_MAX } from './note-labels';
import { Review } from './review';
import { cleanLabel } from './text';

/**
 * As pastas das anotações (PLANO-PASTAS.md): cada grupo (e o "Sem grupo", chave "") tem a sua árvore,
 * guardada nas configurações do mural (`NotesConfig.folders`). A anotação guarda só o id da pasta
 * (`Review.folder`), e o nome mora só na pasta: renomear, mover e desfazer uma pasta não regravam nenhuma
 * anotação, nem no envio para a nuvem nem no espelho da API.
 *
 * A regra vale na leitura (`FolderTree.of`): a pasta da anotação é a guardada se ela existe, está viva e é
 * do grupo da anotação; a desfeita (lápide, `gone`) leva à viva mais próxima acima dela; senão, a anotação
 * está solta na raiz do grupo. Nada disso regrava a anotação.
 *
 * Funções puras, sem Angular: o serviço que grava é o `NoteFolders` (core/note-folders.ts).
 */

export interface NoteFolder {
  /** 'p' e letras aleatórias; as que vieram de um assunto, 'a' e o hash do grupo e do nome (`subjectFolderId`). */
  id: string;
  /** A chave do grupo (`lookKey`; "" é o "Sem grupo"). */
  group: string;
  name: string;
  /** A pasta de cima, ou null na raiz do grupo. */
  parent: string | null;
  /**
   * Desfeita (ISO): a lápide. As anotações que ainda apontam para ela sobem para a pasta de cima (`parent`)
   * pela regra da leitura; ela sai de vez depois de `TOMBSTONE_DAYS` sem ninguém apontando.
   */
  gone?: string;
}

/** Teto técnico (PLANO-PASTAS.md, P10): pastas por conta, contando as lápides. */
export const MAX_FOLDERS = 2000;
/** Teto técnico de níveis: a mais funda fica no 24º. */
export const MAX_FOLDER_DEPTH = 24;
/** Quanto a lápide espera, sem nenhuma anotação apontando, antes de sair (um aparelho parado volta e junta). */
export const TOMBSTONE_DAYS = 60;
/** O nome de uma pasta nova (as seguintes, "Nova pasta 2"…). */
export const NEW_FOLDER_NAME = 'Nova pasta';

/** O id de uma pasta: a mesma regra da API (o espelho recusa o que não passa nela). */
export function isFolderId(v: unknown): v is string {
  return typeof v === 'string' && PASTA_ID_RE.test(v);
}

/** "  scripts   de casa " → "scripts de casa", até 32 letras (como o grupo e a tag). */
export function cleanFolderName(raw: string): string {
  return cleanLabel(raw, LABEL_MAX);
}

/** FNV-1a de 32 bits, com a semente dada: o mesmo número em todo aparelho. */
function fnv(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * O id da pasta que nasce de um assunto (ou de um nome pedido pela API): o mesmo em todo aparelho, para
 * dois aparelhos que convertem cada um sozinho chegarem às mesmas pastas, e a junção não repetir "História".
 */
export function subjectFolderId(group: string, name: string): string {
  const key = `${lookKey(group)}|${lookKey(name)}`;
  return 'a' + (fnv(key, 2166136261).toString(36).padStart(7, '0') + fnv(key, 0x9747b28c).toString(36).padStart(7, '0')).slice(0, 12);
}

/** Um id novo para uma pasta criada à mão. */
export function newFolderId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return 'p' + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

/** O que veio guardado (ou da nuvem): ids válidos e únicos, nomes limpos e pais que existem, do mesmo grupo e sem ciclo. */
export function sanitizeFolders(raw: unknown): NoteFolder[] {
  if (!Array.isArray(raw)) return [];
  const list: NoteFolder[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (list.length >= MAX_FOLDERS) break;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const r = v as Record<string, unknown>;
    const id = r['id'];
    if (!isFolderId(id) || seen.has(id)) continue;
    const name = typeof r['name'] === 'string' ? cleanFolderName(r['name']) : '';
    if (!name) continue;
    const group = typeof r['group'] === 'string' ? lookKey(r['group']).slice(0, 64) : '';
    const parent = isFolderId(r['parent']) && r['parent'] !== id ? r['parent'] : null;
    const gone = typeof r['gone'] === 'string' && !Number.isNaN(Date.parse(r['gone'])) ? r['gone'] : undefined;
    seen.add(id);
    list.push({ id, group, name, parent, ...(gone ? { gone } : {}) });
  }
  const byId = new Map(list.map((f) => [f.id, f]));
  // o pai precisa existir, ser do mesmo grupo, não fazer ciclo e não passar do teto de níveis
  return list.map((f) => {
    if (!f.parent) return f;
    let depth = 1;
    let cur = byId.get(f.parent);
    const seenUp = new Set<string>([f.id]);
    let ok = !!cur && cur.group === f.group;
    while (ok && cur) {
      if (seenUp.has(cur.id) || depth >= MAX_FOLDER_DEPTH) ok = false;
      else {
        seenUp.add(cur.id);
        depth++;
        if (!cur.parent) break;
        const up = byId.get(cur.parent);
        if (!up || up.group !== f.group) break;
        cur = up;
      }
    }
    return ok ? f : { ...f, parent: null };
  });
}

/** A árvore das pastas, pronta para ler (montada uma vez por mudança das configurações). */
export interface FolderTree {
  readonly all: readonly NoteFolder[];
  /** Pelo id (as vivas e as lápides). */
  readonly index: ReadonlyMap<string, NoteFolder>;
  /** A pasta viva de verdade de um id guardado (a lápide sobe até a viva), no grupo dado; null: a raiz. */
  resolve(id: string | null | undefined, group: string): string | null;
  /** A pasta de verdade da anotação (pela regra da leitura); null: solta na raiz do grupo. */
  of(note: Pick<Review, 'folder' | 'category'>): string | null;
  /** A pasta de cima, viva (a lápide no meio do caminho é pulada); null: a raiz. */
  parentOf(id: string): string | null;
  /** As pastas vivas logo dentro de `parent` (null: a raiz do grupo), de A a Z. */
  kids(group: string, parent: string | null): readonly NoteFolder[];
  /** O caminho da raiz até a pasta (ela incluída); vazio se ela não está viva. */
  path(id: string | null | undefined): readonly NoteFolder[];
  /** A pasta viva, ou undefined. */
  live(id: string | null | undefined): NoteFolder | undefined;
  /** A pasta e todas as de dentro (os ids vivos). */
  below(id: string): ReadonlySet<string>;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
export const byFolderName = (a: NoteFolder, b: NoteFolder): number => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function folderTree(folders: readonly NoteFolder[]): FolderTree {
  const index = new Map(folders.map((f) => [f.id, f]));
  const upCache = new Map<string, string | null>();
  /** A viva que vale por um id (a lápide sobe), sem olhar o grupo. */
  const alive = (id: string | null | undefined): NoteFolder | undefined => {
    let cur = id ? index.get(id) : undefined;
    let steps = 0;
    while (cur?.gone) {
      if (++steps > MAX_FOLDERS) return undefined;
      cur = cur.parent ? index.get(cur.parent) : undefined;
    }
    return cur;
  };
  const parentOf = (id: string): string | null => {
    if (upCache.has(id)) return upCache.get(id)!;
    const f = index.get(id);
    const up = f?.parent ? alive(f.parent) : undefined;
    const out = up && f && up.group === f.group && up.id !== f.id ? up.id : null;
    upCache.set(id, out);
    return out;
  };
  const kidsMap = new Map<string, NoteFolder[]>();
  for (const f of folders) {
    if (f.gone) continue;
    const k = `${f.group}|${parentOf(f.id) ?? ''}`;
    const list = kidsMap.get(k);
    if (list) list.push(f);
    else kidsMap.set(k, [f]);
  }
  for (const list of kidsMap.values()) list.sort(byFolderName);
  const resolve = (id: string | null | undefined, group: string): string | null => {
    const f = alive(id);
    return f && f.group === group ? f.id : null;
  };
  const path = (id: string | null | undefined): NoteFolder[] => {
    const out: NoteFolder[] = [];
    let cur = id ? index.get(id) : undefined;
    if (!cur || cur.gone) return out;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id) && out.length < MAX_FOLDER_DEPTH + 1) {
      seen.add(cur.id);
      out.unshift(cur);
      const up = parentOf(cur.id);
      cur = up ? index.get(up) : undefined;
    }
    return out;
  };
  const kids = (group: string, parent: string | null): readonly NoteFolder[] => kidsMap.get(`${group}|${parent ?? ''}`) ?? [];
  const below = (id: string): ReadonlySet<string> => {
    const start = index.get(id);
    const out = new Set<string>();
    if (!start || start.gone) return out;
    const queue = [start];
    while (queue.length) {
      const f = queue.pop()!;
      if (out.has(f.id)) continue;
      out.add(f.id);
      queue.push(...kids(f.group, f.id));
    }
    return out;
  };
  return {
    all: folders,
    index,
    resolve,
    of: (note) => resolve(note.folder, lookKey(note.category ?? '')),
    parentOf,
    kids,
    path,
    live: (id) => {
      const f = id ? index.get(id) : undefined;
      return f && !f.gone ? f : undefined;
    },
    below,
  };
}

/** A árvore vazia (sem pasta nenhuma). */
export const NO_FOLDERS: FolderTree = folderTree([]);

/** O nome da pasta da anotação (a última do caminho), ou null solta na raiz. */
export function folderNameOf(tree: FolderTree, note: Pick<Review, 'folder' | 'category'>): string | null {
  const id = tree.of(note);
  return id ? (tree.index.get(id)?.name ?? null) : null;
}

/** O caminho da pasta da anotação, como se lê: "Programação › Funcional" (null: solta na raiz). */
export function folderPathOf(tree: FolderTree, note: Pick<Review, 'folder' | 'category'>): string | null {
  const path = tree.path(tree.of(note));
  return path.length ? pathLabel(path) : null;
}

/** Um caminho de pastas como se lê: "Programação › Funcional". */
export function pathLabel(path: readonly Pick<NoteFolder, 'name'>[]): string {
  return path.map((f) => f.name).join(' › ');
}

/** O nome da pasta de cima da anotação (a primeira do caminho), ou null solta na raiz. */
export function topFolderNameOf(tree: FolderTree, note: Pick<Review, 'folder' | 'category'>): string | null {
  return tree.path(tree.of(note))[0]?.name ?? null;
}

/**
 * A anotação com o grupo `category` (null: sem grupo). Mudando de grupo, ela sai da pasta e fica solta na
 * raiz do grupo novo (PLANO-PASTAS.md, P2), por qualquer caminho: todo lugar que muda o grupo de uma
 * anotação passa por aqui. Só a caixa ou o acento ("estudos" → "Estudos") é o mesmo grupo: a pasta fica.
 */
export function withCategory<T extends Pick<Review, 'category' | 'folder'>>(r: T, category: string | null | undefined): T {
  const { category: before, folder, ...rest } = r;
  const same = lookKey(before ?? '') === lookKey(category ?? '');
  return { ...rest, ...(category ? { category } : {}), ...(same && folder ? { folder } : {}) } as T;
}

/** A anotação na pasta `folder` (null: solta na raiz). */
export function withFolder<T extends Pick<Review, 'folder'>>(r: T, folder: string | null): T {
  const { folder: _f, ...rest } = r;
  return { ...rest, ...(folder ? { folder } : {}) } as T;
}

// ===== mudanças (puras: devolvem a lista nova) =====

/** A irmã viva com o mesmo nome (sem caixa e acento), tirando `except`. */
export function siblingNamed(tree: FolderTree, group: string, parent: string | null, name: string, except?: string): NoteFolder | undefined {
  const key = lookKey(name);
  return tree.kids(group, parent).find((f) => f.id !== except && lookKey(f.name) === key);
}

/** O nome sem repetir as irmãs: "Nova pasta", "Nova pasta 2"… */
export function uniqueFolderName(tree: FolderTree, group: string, parent: string | null, wanted: string, except?: string): string {
  const base = cleanFolderName(wanted) || NEW_FOLDER_NAME;
  if (!siblingNamed(tree, group, parent, base, except)) return base;
  for (let n = 2; n < MAX_FOLDERS + 2; n++) {
    const suffix = ` ${n}`;
    const name = cleanFolderName(base.slice(0, LABEL_MAX - suffix.length) + suffix);
    if (!siblingNamed(tree, group, parent, name, except)) return name;
  }
  return base;
}

/** Uma pasta nova (o nome sem repetir as irmãs). Sem lugar (teto), a lista fica a mesma e a pasta é null. */
export function withNewFolder(
  folders: readonly NoteFolder[],
  group: string,
  parent: string | null,
  name: string,
  id = newFolderId(),
): { folders: NoteFolder[]; folder: NoteFolder | null } {
  const tree = folderTree(folders);
  const g = lookKey(group);
  const up = parent ? tree.live(parent) : undefined;
  const at = up && up.group === g ? up.id : null;
  if (folders.length >= MAX_FOLDERS || (at && tree.path(at).length >= MAX_FOLDER_DEPTH)) return { folders: [...folders], folder: null };
  const existing = tree.index.get(id);
  const folder: NoteFolder = { id, group: g, name: uniqueFolderName(tree, g, at, name, id), parent: at };
  // o mesmo id de uma lápide (a pasta de um nome pedido de novo): ela volta à vida
  if (existing) return { folders: folders.map((f) => (f.id === id ? folder : f)), folder };
  return { folders: [...folders, folder], folder };
}

/** A pasta com outro nome (limpo; vazio não muda). Não junta: quem chama oferece Juntar (`siblingNamed`). */
export function withRenamedFolder(folders: readonly NoteFolder[], id: string, name: string): NoteFolder[] {
  const clean = cleanFolderName(name);
  if (!clean) return [...folders];
  return folders.map((f) => (f.id === id && !f.gone ? { ...f, name: clean } : f));
}

/** A pasta dentro de `parent` (null: a raiz). Nunca dentro dela mesma, de uma de dentro dela ou de outro grupo. */
export function withMovedFolder(folders: readonly NoteFolder[], id: string, parent: string | null): NoteFolder[] {
  const tree = folderTree(folders);
  const f = tree.live(id);
  if (!f) return [...folders];
  if (parent !== null) {
    const up = tree.live(parent);
    if (!up || up.group !== f.group || tree.below(id).has(parent)) return [...folders];
    // o mais fundo de dentro dela não pode passar do teto de níveis
    const height = Math.max(...[...tree.below(id)].map((x) => tree.path(x).length - tree.path(id).length + 1));
    if (tree.path(parent).length + height > MAX_FOLDER_DEPTH) return [...folders];
  }
  return folders.map((x) => (x.id === id ? { ...x, parent } : x));
}

/**
 * Desfaz a pasta: ela vira lápide, e o que estava dentro sobe para a de cima (as pastas aqui, mudando o
 * pai; as anotações pela regra da leitura, sem serem regravadas). Nunca apaga anotação.
 */
export function withDissolvedFolder(folders: readonly NoteFolder[], id: string, at: string): NoteFolder[] {
  const tree = folderTree(folders);
  const f = tree.live(id);
  if (!f) return [...folders];
  const up = tree.parentOf(id);
  return folders.map((x) => {
    if (x.id === id) return { ...x, parent: up, gone: at };
    if (!x.gone && tree.parentOf(x.id) === id) return { ...x, parent: up };
    return x;
  });
}

/**
 * Junta a pasta `from` na `into` (do mesmo grupo): as pastas de dentro vão para `into`, e `from` vira
 * lápide apontando para ela, então as anotações seguem sozinhas, sem serem regravadas.
 */
export function withJoinedFolder(folders: readonly NoteFolder[], from: string, into: string, at: string): NoteFolder[] {
  const tree = folderTree(folders);
  const a = tree.live(from);
  const b = tree.live(into);
  if (!a || !b || a.id === b.id || a.group !== b.group || tree.below(from).has(into)) return [...folders];
  return folders.map((x) => {
    if (x.id === from) return { ...x, parent: into, gone: at };
    if (!x.gone && tree.parentOf(x.id) === from) return { ...x, parent: into };
    return x;
  });
}

/**
 * As pastas do grupo `from` (a chave) levadas para `to` (null: o grupo foi apagado, e elas vão para o "Sem
 * grupo", com as anotações). Se `to` já tem pastas, as de cima com o mesmo nome viram uma só (a de `to`
 * fica, a que chega vira lápide apontando para ela).
 */
export function foldersOfGroupMoved(folders: readonly NoteFolder[], from: string, to: string | null, at: string): NoteFolder[] {
  const src = lookKey(from);
  const dst = lookKey(to ?? '');
  if (src === dst) return [...folders];
  const tree = folderTree(folders);
  let out = folders.map((f) => (f.group === src ? { ...f, group: dst } : f));
  // as de cima com o mesmo nome de uma que já estava em `to`
  for (const f of tree.kids(src, null)) {
    const twin = tree.kids(dst, null).find((x) => lookKey(x.name) === lookKey(f.name));
    if (twin) out = withJoinedFolder(out, f.id, twin.id, at);
  }
  return out;
}

/** Sem as lápides velhas (mais de `TOMBSTONE_DAYS`) que nenhuma anotação nem pasta aponta mais. */
export function prunedFolders(folders: readonly NoteFolder[], notes: readonly Pick<Review, 'folder'>[], now: number): NoteFolder[] {
  const old = now - TOMBSTONE_DAYS * 24 * 3_600_000;
  if (!folders.some((f) => f.gone && Date.parse(f.gone) < old)) return [...folders];
  const used = new Set<string>();
  for (const n of notes) if (n.folder) used.add(n.folder);
  for (const f of folders) if (f.parent) used.add(f.parent);
  return folders.filter((f) => !f.gone || Date.parse(f.gone) >= old || used.has(f.id));
}

// ===== o mural público =====

/**
 * As pastas que vão no mural público (PLANO-PASTAS.md, 3.8): só as que têm alguma das anotações à mostra
 * dentro (ou abaixo), vivas, com o pai de verdade. A pasta só com anotações privadas não sai nem pelo nome.
 */
export function publicFolders(tree: FolderTree, shown: readonly Pick<Review, 'folder' | 'category'>[]): NoteFolder[] {
  const out = new Map<string, NoteFolder>();
  for (const n of shown) {
    for (const f of tree.path(tree.of(n))) {
      if (out.has(f.id)) continue;
      out.set(f.id, { id: f.id, group: f.group, name: f.name, parent: tree.parentOf(f.id) });
    }
  }
  return [...out.values()];
}

/** A anotação com a pasta de verdade (a lápide resolvida; sem pasta viva, sem o campo): para o público. */
export function withLiveFolder<T extends Pick<Review, 'folder' | 'category'>>(tree: FolderTree, note: T): T {
  const id = tree.of(note);
  return note.folder === (id ?? undefined) ? note : withFolder(note, id);
}

/**
 * As fichas e a árvore das pastas de um mural de outra pessoa (a visita, o Feed): o mural público de antes
 * das pastas (ainda não reenviado) traz o assunto, que vira pasta aqui, na leitura, do mesmo jeito que no
 * aparelho dela.
 */
export function foldersOfSnapshot(reviews: readonly Review[], folders: readonly NoteFolder[] | undefined): { reviews: readonly Review[]; tree: FolderTree } {
  const legacy = reviews.filter((r) => r.subject !== undefined);
  if (!legacy.length) return { reviews, tree: folderTree(folders ?? []) };
  const converted = convertSubjects(legacy, folders ?? [], {});
  const byId = new Map(converted.notes.map((n) => [n.id, n]));
  return { reviews: reviews.map((r) => byId.get(r.id) ?? r), tree: folderTree(converted.folders) };
}

// ===== a conversão do assunto =====

/** Uma anotação de antes das pastas: o assunto ainda escrito nela. */
type WithSubject = Pick<Review, 'id' | 'category' | 'folder' | 'subject'>;

/**
 * O assunto vira pasta (PLANO-PASTAS.md, 3.4): cada assunto usado ou criado nas configurações vira uma
 * pasta na raiz do grupo, com o id do grupo e do nome (o mesmo em todo aparelho) e a grafia mais usada; a
 * anotação troca `subject` por `folder`. Idempotente: sem assunto nenhum, nada muda. A pasta que já existe
 * com aquele id (renomeada, ou desfeita) não muda de nome; a desfeita continua desfeita.
 *
 * Devolve as pastas (todas) e só as anotações que mudaram.
 */
export function convertSubjects<T extends WithSubject>(
  notes: readonly T[],
  folders: readonly NoteFolder[],
  saved: Readonly<Record<string, readonly string[]>>,
): { folders: NoteFolder[]; notes: T[] } {
  const out = [...folders];
  const ids = new Set(out.map((f) => f.id));
  // as pastas de cima vivas que já existem, pelo nome: o assunto com esse nome vai para elas (a pasta
  // criada à mão, ou pela API, com o mesmo nome não fica repetida)
  const tops = new Map<string, string>();
  const tree = folderTree(folders);
  for (const f of folders) if (!f.gone && tree.parentOf(f.id) === null) tops.set(`${f.group}|${lookKey(f.name)}`, f.id);
  // a grafia mais usada de cada assunto, por grupo
  const spell = new Map<string, Map<string, number>>();
  for (const n of notes) {
    const s = n.subject ? cleanFolderName(n.subject) : '';
    if (!s) continue;
    const id = subjectFolderId(n.category ?? '', s);
    const m = spell.get(id) ?? new Map<string, number>();
    m.set(s, (m.get(s) ?? 0) + 1);
    spell.set(id, m);
  }
  const ensure = (group: string, name: string): string | null => {
    const clean = cleanFolderName(name);
    if (!clean) return null;
    const twin = tops.get(`${lookKey(group)}|${lookKey(clean)}`);
    if (twin) return twin;
    const id = subjectFolderId(group, clean);
    if (!ids.has(id) && out.length < MAX_FOLDERS) {
      const m = spell.get(id);
      const best = m?.size ? [...m].reduce((a, x) => (x[1] > a[1] ? x : a))[0] : clean;
      out.push({ id, group: lookKey(group), name: best, parent: null });
      ids.add(id);
    }
    return ids.has(id) ? id : null;
  };
  for (const [group, list] of Object.entries(saved)) for (const name of list) ensure(group, name);
  const changed: T[] = [];
  for (const n of notes) {
    if (n.subject === undefined) continue;
    const { subject, ...rest } = n;
    const id = n.folder ?? ensure(n.category ?? '', subject ?? '');
    changed.push({ ...rest, ...(id ? { folder: id } : {}) } as T);
  }
  return { folders: out, notes: changed };
}
