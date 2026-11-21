import { Injectable, computed, signal } from '@angular/core';
import type { GroupStudy, StudyPart } from './shared-study';

/** O que o `SharedGroupsStore` dá aos Estudos (ver `GroupStudies`). */
export interface GroupStudiesSource {
  studies: () => readonly GroupStudy[];
  synced: () => boolean;
  update: (groupId: string, part: StudyPart) => boolean;
}

const NONE: readonly GroupStudy[] = [];

/**
 * A ponte entre os Flashcards e os grupos compartilhados (PLANO-FLASHCARDS-GRUPO.md), como `GroupFolders` para as
 * pastas: o `SharedGroupsStore` se apresenta aqui, e o `StudyStore` lê os baralhos de cada grupo e grava neles sem
 * depender do serviço dos grupos (nem da nuvem, nem das anotações compartilhadas). Sem ninguém apresentado, não há
 * grupo compartilhado.
 */
@Injectable({ providedIn: 'root' })
export class GroupStudies {
  private readonly source = signal<GroupStudiesSource | null>(null);
  private readonly leaving: ((groupId: string, keep: boolean) => void)[] = [];

  /** Os Flashcards de cada grupo compartilhado. */
  readonly studies = computed(() => this.source()?.studies() ?? NONE);
  /** A lista dos grupos já foi conferida na nuvem desde que o site abriu. */
  readonly synced = computed(() => this.source()?.synced() ?? false);

  attach(source: GroupStudiesSource): void {
    this.source.set(source);
  }

  /** Grava os Flashcards de um grupo (false: quem está aqui só lê nele, ou o grupo não está mais aqui). */
  update(groupId: string, part: StudyPart): boolean {
    return this.source()?.update(groupId, part) ?? false;
  }

  /** Avisa `fn` antes de cada grupo sair deste aparelho; `keep`: quem está aqui é o dono, e fica com o que era do grupo. */
  beforeLeave(fn: (groupId: string, keep: boolean) => void): void {
    this.leaving.push(fn);
  }

  /** O grupo `groupId` vai sair deste aparelho (o `SharedGroupsStore` chama, com o grupo ainda aqui). */
  leave(groupId: string, keep: boolean): void {
    for (const fn of this.leaving) fn(groupId, keep);
  }
}
