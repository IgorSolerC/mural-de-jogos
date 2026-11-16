import { Injectable, computed, inject, signal } from '@angular/core';
import { FolderTree, MAX_FOLDERS, NoteFolder } from './folders';
import type { Kind } from './kinds';
import { wishFolderGroup } from './mural-config';
import { NoteFolders } from './note-folders';
import type { Wish } from './review';
import { ReviewStore } from './review-store';

/**
 * As pastas da Wishlist (PLANO-WISHLIST.md, P1): as mesmas das anotações, na mesma árvore das configurações
 * (`NotesConfig.folders`), no grupo `desejos:<mural>` (`wishFolderGroup`). O desejo guarda só o id da pasta
 * (`Wish.folder`), e a regra da leitura é a das anotações: a pasta desfeita vira lápide e o desejo sobe sem ser
 * regravado. Renomear, mover, juntar e desfazer são os de `NoteFolders` (não dependem do grupo); aqui fica o que
 * mexe nos desejos: guardar, juntar numa pasta nova, contar.
 */
@Injectable({ providedIn: 'root' })
export class WishFolders {
  private readonly folders = inject(NoteFolders);
  private readonly store = inject(ReviewStore);

  readonly tree = computed<FolderTree>(() => this.folders.tree());

  /**
   * A pasta aberta na página da Wishlist (o mural e o id; null: a raiz), para o "Pôr na wishlist" de qualquer
   * lugar (o cupom do topo, o N) já nascer nela. A página põe e tira; não vai para o navegador.
   */
  readonly open = signal<{ kind: Kind; id: string | null } | null>(null);

  /** O grupo das pastas da Wishlist do mural. */
  group(kind: Kind): string {
    return wishFolderGroup(kind);
  }

  /** A pasta de verdade do desejo (null: solto na raiz da Wishlist do mural). */
  of(w: Pick<Wish, 'folder' | 'kind'>): string | null {
    return this.tree().resolve(w.folder, wishFolderGroup(w.kind));
  }

  /**
   * Guarda os desejos na pasta (null: a raiz da Wishlist), os do mural dela; os que já estão lá ficam. Cada um
   * ganha data nova (vai para os outros aparelhos). Devolve quantos mudaram e como desfazer (cada um volta para
   * a pasta de antes, se ninguém o mudou de pasta no meio).
   */
  place(ids: readonly string[], folder: string | null): { moved: number; undo: () => void } {
    const tree = this.tree();
    const target = folder ? tree.live(folder) : undefined;
    if (folder && !target) return { moved: 0, undo: () => undefined };
    const want: string[] = [];
    const back = new Map<string, string | null>();
    for (const id of ids) {
      const w = this.store.getWish(id);
      if (!w || (target && wishFolderGroup(w.kind) !== target.group)) continue;
      if (this.of(w) === (target?.id ?? null)) continue;
      want.push(id);
      back.set(id, w.folder ?? null);
    }
    if (!want.length) return { moved: 0, undo: () => undefined };
    this.store.moveWishes(want, target?.id ?? null);
    const to = target?.id ?? null;
    const undo = () => {
      for (const [id, was] of back) {
        const w = this.store.getWish(id);
        if (w && (w.folder ?? null) === to) this.store.moveWishes([id], was);
      }
    };
    return { moved: want.length, undo };
  }

  /**
   * Uma pasta nova em `parent` (null: a raiz da Wishlist do mural), "Nova pasta" sem repetir as irmãs, com os
   * desejos dentro: o recorte solto sobre outro. Devolve a pasta e como desfazer tudo, ou null sem lugar.
   */
  gather(ids: readonly string[], kind: Kind, parent: string | null): { folder: NoteFolder; undo: () => void } | null {
    const folder = this.create(kind, parent, '');
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

  /** Cria uma pasta na Wishlist do mural, dentro de `parent` (null: na raiz). Null: sem lugar. */
  create(kind: Kind, parent: string | null, name: string): NoteFolder | null {
    return this.folders.createIn(wishFolderGroup(kind), parent, name);
  }

  rename(id: string, name: string): () => void {
    return this.folders.rename(id, name);
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

  /**
   * A pasta que um pedido da API pede (o `pasta` de pôr e de mudar desejo), na Wishlist do mural `kind`: o id de
   * uma pasta dela (a desfeita vale pela viva), ou o caminho a partir da raiz ("Co-op/Curtos", sem caixa nem
   * acento), com as que faltam criadas. O id de uma pasta de outro mural nunca vira nome: o desejo fica na raiz,
   * com o aviso. No teto de pastas, fica na última que deu. A mesma regra da prévia da API
   * (`pastaDoDesejoPedida`, contrato/api-v1/operacoes-murais.ts).
   */
  forRequest(kind: Kind, pasta: string): { id: string | null; aviso?: string } {
    const r = this.folders.resolveRequest(wishFolderGroup(kind), pasta);
    if (r.foreign) return { id: null, aviso: `A pasta "${r.foreign.name}" é de outra Wishlist: o desejo ficou solto na raiz.` };
    if (r.full) return { id: r.id, aviso: `Não coube mais pasta (o teto é de ${MAX_FOLDERS}): o desejo ficou ${r.id ? `em ${this.tree().live(r.id)?.name}` : 'solto na raiz'}.` };
    return { id: r.id };
  }

  /** Quantos desejos e pastas a pasta tem logo dentro (o que sobe ao desfazê-la). */
  contentsOf(id: string): { notes: number; folders: number } {
    const tree = this.tree();
    const f = tree.live(id);
    if (!f) return { notes: 0, folders: 0 };
    const notes = this.store.wishes().filter((w) => wishFolderGroup(w.kind) === f.group && this.of(w) === id).length;
    return { notes, folders: tree.kids(f.group, id).length };
  }

  /** Quantos desejos do mural cada pasta tem, com os das de dentro (para a escolha da pasta). */
  countsIn(kind: Kind): Map<string, number> {
    const tree = this.tree();
    const out = new Map<string, number>();
    for (const w of this.store.wishes()) {
      if (w.kind !== kind) continue;
      for (const f of tree.path(this.of(w))) out.set(f.id, (out.get(f.id) ?? 0) + 1);
    }
    return out;
  }
}
