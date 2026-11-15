import { Injectable, computed, signal } from '@angular/core';
import { NoteFolder } from './folders';

/** Um grupo compartilhado, para as pastas: o id, se quem está aqui escreve nele, se o documento já tem as pastas, se é o dono. */
export interface GroupFolderInfo {
  id: string;
  write: boolean;
  doc: boolean;
  dono: boolean;
}

/** O que `SharedGroupsStore` dá às pastas (ver `GroupFolders`). */
export interface GroupFolderSource {
  /** As pastas dos grupos compartilhados, na chave do nome que cada grupo tem aqui. */
  folders(): readonly NoteFolder[];
  /** Os grupos compartilhados pela chave do nome que eles têm aqui. */
  groups(): ReadonlyMap<string, GroupFolderInfo>;
  /** Grava as pastas de um grupo no documento dele; false: quem só lê, ou nada mudou. */
  update(groupId: string, folders: readonly NoteFolder[]): boolean;
}

/**
 * As pastas dos grupos compartilhados para quem monta a árvore (`NoteFolders`), sem depender do serviço dos grupos
 * (PLANO-CONSERTO-GRUPOS.md, rodada 2): o `SharedGroupsStore` se apresenta aqui (`attach`), como o `SharedStore`
 * recebe os nomes dos grupos. Sem ele (os testes que não o montam), não há grupo compartilhado nenhum.
 */
@Injectable({ providedIn: 'root' })
export class GroupFolders {
  private readonly source = signal<GroupFolderSource | null>(null);

  readonly folders = computed<readonly NoteFolder[]>(() => this.source()?.folders() ?? []);
  readonly groups = computed<ReadonlyMap<string, GroupFolderInfo>>(() => this.source()?.groups() ?? new Map());

  attach(source: GroupFolderSource): void {
    this.source.set(source);
  }

  update(groupId: string, folders: readonly NoteFolder[]): boolean {
    return this.source()?.update(groupId, folders) ?? false;
  }
}
