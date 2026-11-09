import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { SubjectEntry } from './note-labels';
import { lookKey } from './category-looks';
import {
  FolderTree,
  NoteFolder,
  convertSubjects,
  folderTree,
  foldersOfGroupMoved,
  prunedFolders,
  siblingNamed,
  subjectFolderId,
  withDissolvedFolder,
  withJoinedFolder,
  withMovedFolder,
  withNewFolder,
  withFolder,
  withRenamedFolder,
} from './folders';
import { Review, isNote } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';

/**
 * As pastas das anotações do seu Murall (PLANO-PASTAS.md): a árvore pronta para ler (`tree`) e o que muda
 * nela, sempre pelas configurações do mural (`NotesConfig.folders`). Nada aqui regrava anotação: renomear,
 * mover, desfazer e juntar pastas mudam só as configurações (as anotações seguem pela regra da leitura,
 * ver core/folders.ts).
 *
 * Também converte o assunto de antes em pasta, sozinho, sempre que ele aparece: ao abrir, ao chegar um
 * mural da nuvem de um aparelho que ainda não converteu, ao importar um backup antigo, nos lugares das
 * compartilhadas (`convertSubjects`, idempotente e com os mesmos ids em todo aparelho).
 */
@Injectable({ providedIn: 'root' })
export class NoteFolders {
  private readonly settings = inject(Settings);
  private readonly store = inject(ReviewStore);

  readonly tree = computed<FolderTree>(() => folderTree(this.settings.notesConfig().folders ?? []));

  constructor() {
    effect(() => {
      const cfg = this.settings.notesConfig();
      const notes = this.store.notes();
      const legacy = Object.keys(cfg.subjects ?? {}).length > 0 || notes.some((n) => n.subject !== undefined);
      if (legacy) untracked(() => this.convert());
    });
  }

  /** O assunto de antes vira pasta (as anotações não ganham data nova: a conversão é a mesma em todo aparelho). */
  private convert(): void {
    const cfg = this.settings.notesConfig();
    const { folders, notes } = convertSubjects(this.store.notes(), cfg.folders ?? [], cfg.subjects ?? {});
    // só grava as configurações quando mudam (gravar marca a mudança e leva o mural à nuvem de novo)
    if (Object.keys(cfg.subjects ?? {}).length || folders.length !== (cfg.folders ?? []).length) this.settings.setNotesConfig({ folders, subjects: {} });
    this.store.replaceMany(notes);
  }

  private get folders(): readonly NoteFolder[] {
    return this.settings.notesConfig().folders;
  }

  private save(folders: readonly NoteFolder[]): void {
    const pruned = prunedFolders(folders, this.store.notes(), Date.now());
    this.settings.setNotesConfig({ folders: pruned });
  }

  /** O nome da pasta viva, ou null. */
  nameOf(id: string | null | undefined): string | null {
    return this.tree().live(id)?.name ?? null;
  }

  /** A pasta de verdade da anotação (null: solta na raiz do grupo). */
  of(note: Pick<Review, 'folder' | 'category'>): string | null {
    return this.tree().of(note);
  }

  /** Como voltar as configurações das pastas ao que são agora (o Desfazer do bilhete). */
  private checkpoint(): () => void {
    const before = this.folders;
    return () => this.settings.setNotesConfig({ folders: [...before] });
  }

  /**
   * Guarda as anotações na pasta (null: soltas na raiz do grupo), as que são do grupo dela; as que já estão
   * lá ficam como estão. Cada uma ganha data nova (vai para os outros aparelhos). Devolve quantas mudaram
   * e como desfazer (cada uma volta para a pasta de antes).
   */
  place(ids: readonly string[], folder: string | null): { moved: number; undo: () => void } {
    const tree = this.tree();
    const target = folder ? tree.live(folder) : undefined;
    if (folder && !target) return { moved: 0, undo: () => undefined };
    const now = new Date().toISOString();
    const before: Review[] = [];
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r || !isNote(r)) continue;
      if (target && lookKey(r.category ?? '') !== target.group) continue;
      if (tree.of(r) === (target?.id ?? null)) continue;
      before.push(r);
      this.store.update({ ...withFolder(r, target?.id ?? null), updatedAt: now }, r);
    }
    const undo = () => {
      const at = new Date().toISOString();
      for (const b of before) {
        const r = this.store.get(b.id);
        if (r) this.store.update({ ...withFolder(r, b.folder ?? null), updatedAt: at }, r);
      }
    };
    return { moved: before.length, undo };
  }

  /**
   * Uma pasta nova em `parent` (null: a raiz do grupo), "Nova pasta" (sem repetir as irmãs), com as
   * anotações dentro: a nota solta sobre outra. Devolve a pasta e como desfazer tudo, ou null sem lugar.
   */
  gather(ids: readonly string[], category: string | null | undefined, parent: string | null): { folder: NoteFolder; undo: () => void } | null {
    const back = this.checkpoint();
    const folder = this.create(category, parent, '');
    if (!folder) return null;
    const { undo } = this.place(ids, folder.id);
    return {
      folder,
      undo: () => {
        undo();
        back();
      },
    };
  }

  /** Cria uma pasta no grupo (`category`, null: sem grupo), dentro de `parent` (null: na raiz). Devolve a pasta, ou null sem lugar. */
  create(category: string | null | undefined, parent: string | null, name: string): NoteFolder | null {
    const { folders, folder } = withNewFolder(this.folders, lookKey(category ?? ''), parent, name);
    if (folder) this.save(folders);
    return folder;
  }

  /**
   * A pasta da raiz do grupo com esse nome (sem caixa e acento): a que já existe, ou uma nova, com o id do
   * grupo e do nome (o mesmo em todo aparelho; a desfeita com esse id volta). Para quem escolhe pelo nome:
   * a escolha de assunto de antes, os pedidos da API com `assunto`. Null: nome vazio ou sem lugar.
   */
  ensureTop(category: string | null | undefined, name: string): string | null {
    const group = lookKey(category ?? '');
    const existing = siblingNamed(this.tree(), group, null, name);
    if (existing) return existing.id;
    const { folders, folder } = withNewFolder(this.folders, group, null, name, subjectFolderId(group, name));
    if (!folder) return null;
    this.save(folders);
    return folder.id;
  }

  /** Muda o nome (devolve como desfazer). */
  rename(id: string, name: string): () => void {
    const back = this.checkpoint();
    this.save(withRenamedFolder(this.folders, id, name));
    return back;
  }

  /** Põe a pasta dentro de `parent` (null: a raiz); a que não pode ir (ela mesma, uma de dentro) fica. Devolve como desfazer, ou null se nada mudou. */
  move(id: string, parent: string | null): (() => void) | null {
    const back = this.checkpoint();
    const next = withMovedFolder(this.folders, id, parent);
    if (next.every((f, i) => f === this.folders[i])) return null;
    this.save(next);
    return back;
  }

  /** Desfaz a pasta: o que estava dentro sobe (nenhuma anotação é apagada nem regravada). Devolve como desfazer. */
  dissolve(id: string): () => void {
    const back = this.checkpoint();
    this.save(withDissolvedFolder(this.folders, id, new Date().toISOString()));
    return back;
  }

  /** Junta `from` em `into` (do mesmo grupo): tudo vai para `into`. Devolve como desfazer. */
  join(from: string, into: string): () => void {
    const back = this.checkpoint();
    this.save(withJoinedFolder(this.folders, from, into, new Date().toISOString()));
    return back;
  }

  /** Quantas anotações e pastas a pasta tem logo dentro (o que sobe ao desfazê-la). */
  contentsOf(id: string): { notes: number; folders: number } {
    const tree = this.tree();
    const f = tree.live(id);
    if (!f) return { notes: 0, folders: 0 };
    const notes = this.store.notes().filter((n) => tree.of(n) === id).length;
    return { notes, folders: tree.kids(f.group, id).length };
  }

  /** As pastas vão com o grupo renomeado, juntado ou apagado (null: para o "Sem grupo"). */
  moveGroup(from: string, to: string | null): void {
    const next = foldersOfGroupMoved(this.folders, from, to, new Date().toISOString());
    if (next.some((f, i) => f !== this.folders[i])) this.save(next);
  }

  /**
   * As pastas de cima do grupo, de A a Z, como a escolha de assunto de antes as mostrava: o nome e
   * quantas das anotações dadas estão nela (ou dentro dela).
   */
  topLibrary(category: string | null | undefined, notes: readonly Review[]): SubjectEntry[] {
    const tree = this.tree();
    const group = lookKey(category ?? '');
    const top = new Map<string, number>();
    for (const n of notes) {
      if (!isNote(n) || lookKey(n.category ?? '') !== group) continue;
      const first = tree.path(tree.of(n))[0];
      if (first) top.set(first.id, (top.get(first.id) ?? 0) + 1);
    }
    return tree.kids(group, null).map((f) => ({ label: f.name, n: top.get(f.id) ?? 0, saved: true }));
  }

  /** Quantas anotações do grupo cada pasta tem, com as de dentro (para a escolha da pasta). */
  countsIn(category: string | null | undefined): Map<string, number> {
    const tree = this.tree();
    const group = lookKey(category ?? '');
    const out = new Map<string, number>();
    for (const n of this.store.notes()) {
      if (lookKey(n.category ?? '') !== group) continue;
      for (const f of tree.path(tree.of(n))) out.set(f.id, (out.get(f.id) ?? 0) + 1);
    }
    return out;
  }

  /** Quantas anotações (as suas, também as compartilhadas) estão na pasta e nas de dentro. */
  countBelow(id: string): number {
    const tree = this.tree();
    const ids = tree.below(id);
    if (!ids.size) return 0;
    return this.store.notes().filter((n) => isNote(n) && ids.has(tree.of(n) ?? '')).length;
  }
}
