import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { pedacosDoCaminho } from '../../../contrato/api-v1/notas';
import { SubjectEntry } from './note-labels';
import { lookKey } from './category-looks';
import {
  FolderTree,
  MAX_FOLDERS,
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

  /**
   * O Desfazer de uma mudança de pasta: só o que ela mexeu volta, na lista de agora (o resto que mudou no meio,
   * aqui ou vindo de outro aparelho, fica). `patch` diz, pasta a pasta, como ela volta; a que não deve voltar
   * (mexida de novo depois) devolve ela mesma.
   */
  private undoWith(patch: (f: NoteFolder) => NoteFolder): () => void {
    return () => {
      const now = this.folders;
      const next = now.map(patch);
      if (next.some((f, i) => f !== now[i])) this.save(next);
    };
  }

  /**
   * Como voltar o que `withDissolvedFolder` ou `withJoinedFolder` fizeram: a pasta deixa de ser lápide, com a
   * de cima de antes, e as que subiram dela voltam para dentro (as que ainda estão onde subiram).
   */
  private undoGone(before: readonly NoteFolder[], after: readonly NoteFolder[], id: string): () => void {
    const was = before.find((f) => f.id === id);
    if (!was) return () => undefined;
    const lifted = new Map<string, string | null>();
    const old = new Map(before.map((f) => [f.id, f]));
    for (const f of after) if (f.id !== id && old.get(f.id)?.parent === id && f.parent !== id) lifted.set(f.id, f.parent);
    return this.undoWith((f) => {
      if (f.id === id && f.gone) {
        const { gone: _g, ...alive } = f;
        return { ...alive, parent: was.parent };
      }
      return lifted.has(f.id) && f.parent === lifted.get(f.id) ? { ...f, parent: id } : f;
    });
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
    const folder = this.create(category, parent, '');
    if (!folder) return null;
    const { undo } = this.place(ids, folder.id);
    return {
      folder,
      undo: () => {
        // as anotações voltam, e a pasta criada vira lápide (o que entrou nela depois sobe, nada se perde)
        undo();
        if (this.tree().live(folder.id)) this.save(withDissolvedFolder(this.folders, folder.id, new Date().toISOString()));
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

  /**
   * A pasta que um pedido da API pede (o `pasta` de criar e editar), numa anotação do grupo `category`: o id
   * de uma pasta sua (a desfeita vale pela viva dela), ou o caminho a partir da raiz ("Programação/Funcional",
   * sem caixa nem acento), com as que faltam criadas, como o "Criar" da escolha da pasta. O id de uma pasta de
   * outro grupo nunca vira nome: a anotação fica na raiz, com o aviso. No teto de pastas, fica na última que deu.
   * A mesma regra da prévia da API (`pastaDoPedido`, contrato/api-v1/operacoes.ts).
   */
  forRequest(category: string | null, pasta: string): { id: string | null; aviso?: string } {
    const group = lookKey(category ?? '');
    const known = this.tree().index.get(pasta);
    if (known) {
      if (known.group !== group) return { id: null, aviso: `A pasta "${known.name}" é de outro grupo: a nota ficou solta na raiz${category ? ` de ${category}` : ''}.` };
      return { id: this.tree().resolve(pasta, group) };
    }
    let parent: string | null = null;
    for (const name of pedacosDoCaminho(pasta)) {
      const found = siblingNamed(this.tree(), group, parent, name);
      if (found) {
        parent = found.id;
        continue;
      }
      const made = this.create(category, parent, name);
      if (!made) return { id: parent, aviso: `Não coube mais pasta (o teto é de ${MAX_FOLDERS}): a nota ficou ${parent ? `em ${this.nameOf(parent)}` : 'solta na raiz'}.` };
      parent = made.id;
    }
    return { id: parent };
  }

  /** Muda o nome. Devolve como desfazer: o nome de antes volta, se ninguém deu outro nome no meio. */
  rename(id: string, name: string): () => void {
    const was = this.tree().live(id)?.name;
    this.save(withRenamedFolder(this.folders, id, name));
    const now = this.tree().live(id)?.name;
    if (was === undefined || now === was) return () => undefined;
    return this.undoWith((f) => (f.id === id && !f.gone && f.name === now ? { ...f, name: was } : f));
  }

  /**
   * Põe a pasta dentro de `parent` (null: a raiz); a que não pode ir (ela mesma, uma de dentro) fica. Devolve
   * como desfazer (ela volta para onde estava, se ainda está onde foi posta), ou null se nada mudou.
   */
  move(id: string, parent: string | null): (() => void) | null {
    const was = this.folders.find((f) => f.id === id)?.parent ?? null;
    const next = withMovedFolder(this.folders, id, parent);
    if (next.every((f, i) => f === this.folders[i])) return null;
    this.save(next);
    return () => {
      if (this.folders.find((f) => f.id === id)?.parent !== parent) return;
      // pela mesma conferência de mover (nunca para dentro dela mesma, se a de antes foi parar lá dentro)
      const back = withMovedFolder(this.folders, id, was);
      if (back.some((f, i) => f !== this.folders[i])) this.save(back);
    };
  }

  /** Desfaz a pasta: o que estava dentro sobe (nenhuma anotação é apagada nem regravada). Devolve como desfazer. */
  dissolve(id: string): () => void {
    const before = this.folders;
    const after = withDissolvedFolder(before, id, new Date().toISOString());
    this.save(after);
    return this.undoGone(before, after, id);
  }

  /** Junta `from` em `into` (do mesmo grupo): tudo vai para `into`. Devolve como desfazer. */
  join(from: string, into: string): () => void {
    const before = this.folders;
    const after = withJoinedFolder(before, from, into, new Date().toISOString());
    this.save(after);
    return this.undoGone(before, after, from);
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

  /**
   * Quantas anotações cada pasta tem, com as de dentro, de todos os grupos de uma vez: uma passada só pelas
   * anotações (a pasta é de um grupo só, e a anotação só conta nas do grupo dela). Para quem mostra as
   * pastas de todos os grupos juntas, como a parte Pastas das configurações.
   */
  readonly countsByFolder = computed<ReadonlyMap<string, number>>(() => {
    const tree = this.tree();
    const out = new Map<string, number>();
    for (const n of this.store.notes()) for (const f of tree.path(tree.of(n))) out.set(f.id, (out.get(f.id) ?? 0) + 1);
    return out;
  });

  /** Quantas anotações (as suas, também as compartilhadas) estão na pasta e nas de dentro. */
  countBelow(id: string): number {
    const tree = this.tree();
    const ids = tree.below(id);
    if (!ids.size) return 0;
    return this.store.notes().filter((n) => isNote(n) && ids.has(tree.of(n) ?? '')).length;
  }
}
