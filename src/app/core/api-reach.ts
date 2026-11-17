import { Injectable, computed, inject, signal } from '@angular/core';
import { categoryKey } from './kanban';
import { ReviewStore } from './review-store';

/** Mesmos ids, sem ligar para a ordem. */
const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** O que o `SharedGroupsStore` dá (ver `ApiReach`). */
export interface ReachSource {
  /** As compartilhadas dos grupos em que a conta é dono ou gestor. */
  managed(): ReadonlySet<string>;
  /** Os grupos compartilhados em que ela só edita ou lê, pela chave do nome que eles têm aqui (`categoryKey`). */
  closed(): ReadonlySet<string>;
}

/**
 * Até onde a API das AIs alcança nas anotações compartilhadas (pedido do dono em 17/nov/2026): as anotações
 * de um grupo compartilhado em que a conta é **dono ou gestor** entram no espelho e nos pedidos como as
 * suas; as dos grupos em que ela só edita ou lê, e as compartilhadas soltas (de uma anotação só), ficam de
 * fora, como sempre ficaram. O grupo compartilhado em que ela só edita ou lê fica fechado por inteiro (`closed`):
 * nenhuma nota vai para ele por um pedido (a nota que chega num grupo compartilhado é levada para ele sozinha,
 * core/shared-groups-store.ts), e o quadro do Kanban e os quadros livres dele não aparecem.
 *
 * Um lugar só para a regra: o espelho (core/api-mirror.ts), os pedidos (core/api-requests.ts), o Kanban e os
 * Estudos leem `hidden`. Quem sabe os grupos e os papéis é o `SharedGroupsStore`, que se apresenta aqui
 * (`attach`), como faz com as pastas (core/group-folders.ts): assim o espelho não depende do serviço dos
 * grupos. Sem ele (os testes que não o montam), nenhuma compartilhada é alcançada.
 */
@Injectable({ providedIn: 'root' })
export class ApiReach {
  private readonly store = inject(ReviewStore);
  private readonly source = signal<ReachSource | null>(null);

  /** As compartilhadas que a API alcança (as dos grupos em que a conta é dono ou gestor). */
  readonly managed = computed<ReadonlySet<string>>(() => {
    const shared = this.store.sharedIds();
    const fromGroups = this.source()?.managed() ?? new Set<string>();
    return new Set([...fromGroups].filter((id) => shared.has(id)));
  }, { equal: sameIds });

  /** As anotações que a API não vê nem mexe: as compartilhadas, menos as de `managed`. */
  readonly hidden = computed<ReadonlySet<string>>(() => {
    const shared = this.store.sharedIds();
    const managed = this.managed();
    if (!managed.size) return shared;
    return new Set([...shared].filter((id) => !managed.has(id)));
  }, { equal: sameIds });

  /** Os grupos compartilhados em que a conta não é dono nem gestor, pela chave do nome que eles têm aqui (`categoryKey`). */
  readonly closed = computed<ReadonlySet<string>>(() => this.source()?.closed() ?? new Set<string>(), { equal: sameIds });

  /** O grupo (pelo nome) é um compartilhado em que a conta não é dono nem gestor? */
  closes(group: string | null | undefined): boolean {
    return !!group?.trim() && this.closed().has(categoryKey(group));
  }

  attach(source: ReachSource): void {
    this.source.set(source);
  }
}
