import { Injectable, computed, inject } from '@angular/core';
import { FolderTree, NoteFolder } from './folders';
import { NoteFolders } from './note-folders';
import type { FolderLook } from './folder-looks';
import { PIXEL_FOLDER_GROUP, PixelPiece } from './pixel-gallery';
import { PixelGallery } from './pixel-gallery-store';

/**
 * As pastas da galeria de pixel arts (PLANO-PIXEL-ARTS.md, 2): as mesmas das anotações, na mesma árvore das
 * configurações (`NotesConfig.folders`), no grupo `PIXEL_FOLDER_GROUP`, como a Wishlist (core/wish-folders.ts).
 * A obra guarda só o id da pasta, e a regra da leitura é a das anotações: a pasta desfeita vira lápide e a obra
 * sobe sem ser regravada. Renomear, mover, juntar e desfazer são os de `NoteFolders`; aqui fica o que mexe nas
 * obras: guardar, juntar numa pasta nova, contar.
 */
@Injectable({ providedIn: 'root' })
export class PixelFolders {
  private readonly folders = inject(NoteFolders);
  private readonly gallery = inject(PixelGallery);

  readonly tree = computed<FolderTree>(() => this.folders.tree());
  readonly group = PIXEL_FOLDER_GROUP;

  /** A pasta de verdade da obra (null: solta na raiz da galeria). */
  of(p: Pick<PixelPiece, 'folder'>): string | null {
    return this.tree().resolve(p.folder, PIXEL_FOLDER_GROUP);
  }

  /** A pasta de verdade de cada obra (as mudanças de pasta mudam a árvore, e ela refaz tudo). */
  readonly folderOf = computed<ReadonlyMap<string, string | null>>(() => {
    const tree = this.tree();
    return new Map(this.gallery.pieces().map((p) => [p.id, tree.resolve(p.folder, PIXEL_FOLDER_GROUP)]));
  });

  /**
   * Guarda as obras na pasta (null: a raiz da galeria); as que já estão lá ficam. Devolve quantas mudaram e como
   * desfazer (cada uma volta para a pasta de antes, se ninguém a mudou de pasta no meio).
   */
  place(ids: readonly string[], folder: string | null): { moved: number; undo: () => void } {
    const target = folder ? this.tree().live(folder) : undefined;
    if (folder && (!target || target.group !== PIXEL_FOLDER_GROUP)) return { moved: 0, undo: () => undefined };
    const to = target?.id ?? null;
    const back = new Map<string, string | null>();
    for (const id of ids) {
      const p = this.gallery.get(id);
      if (p && this.of(p) !== to) back.set(id, p.folder ?? null);
    }
    if (!back.size) return { moved: 0, undo: () => undefined };
    this.gallery.move([...back.keys()], to);
    const undo = () => {
      // cada uma volta para a de antes (as que ninguém mudou de pasta no meio), juntas pela pasta de antes
      const by = new Map<string | null, string[]>();
      for (const [id, was] of back) {
        const p = this.gallery.get(id);
        if (p && (p.folder ?? null) === to) by.set(was, [...(by.get(was) ?? []), id]);
      }
      for (const [was, list] of by) this.gallery.move(list, was);
    };
    return { moved: back.size, undo };
  }

  /**
   * Uma pasta nova em `parent` (null: a raiz da galeria), "Nova pasta" sem repetir as irmãs, com as obras dentro:
   * a obra solta sobre outra. Devolve a pasta e como desfazer tudo, ou null sem lugar.
   */
  gather(ids: readonly string[], parent: string | null): { folder: NoteFolder; undo: () => void } | null {
    const folder = this.create(parent, '');
    if (!folder) return null;
    const { undo } = this.place(ids, folder.id);
    return {
      folder,
      undo: () => {
        undo();
        // a pasta criada vira lápide (o que entrou nela depois sobe: nada se perde)
        if (this.tree().live(folder.id)) this.folders.dissolve(folder.id);
      },
    };
  }

  /** Cria uma pasta na galeria, dentro de `parent` (null: na raiz). Null: sem lugar. */
  create(parent: string | null, name: string): NoteFolder | null {
    return this.folders.createIn(PIXEL_FOLDER_GROUP, parent, name);
  }

  rename(id: string, name: string): () => void {
    return this.folders.rename(id, name);
  }

  /** O Customizar… (PLANO-PASTAS-CUSTOMIZADAS.md): o nome e o visual, com o Desfazer; null se nada mudou. */
  customize(id: string, change: { name?: string; look: FolderLook | undefined }): (() => void) | null {
    return this.folders.customize(id, change);
  }

  move(id: string, parent: string | null): (() => void) | null {
    return this.folders.move(id, parent);
  }

  join(from: string, into: string): () => void {
    return this.folders.join(from, into);
  }

  dissolve(id: string): () => void {
    return this.folders.dissolve(id);
  }

  /** Apaga as pastas com tudo o que tinham (as obras de dentro saem por quem chama), com o Desfazer. */
  drop(ids: readonly string[]): () => void {
    return this.folders.drop(ids);
  }

  /** As pastas vivas da galeria (as que se marcam, PLANO-MARCAR-PASTAS.md). */
  readonly live = computed<ReadonlySet<string>>(() => new Set(this.tree().all.flatMap((f) => (f.group === this.group && !f.gone ? [f.id] : []))));

  /** Quantas obras e pastas a pasta tem logo dentro (o que sobe ao desfazê-la). */
  contentsOf(id: string): { notes: number; folders: number } {
    const f = this.tree().live(id);
    if (!f) return { notes: 0, folders: 0 };
    let notes = 0;
    for (const at of this.folderOf().values()) if (at === id) notes++;
    return { notes, folders: this.tree().kids(f.group, id).length };
  }

  /** Quantas obras cada pasta tem, com as das de dentro (para a escolha da pasta). */
  readonly counts = computed<ReadonlyMap<string, number>>(() => {
    const tree = this.tree();
    const out = new Map<string, number>();
    for (const at of this.folderOf().values()) for (const f of tree.path(at)) out.set(f.id, (out.get(f.id) ?? 0) + 1);
    return out;
  });
}
