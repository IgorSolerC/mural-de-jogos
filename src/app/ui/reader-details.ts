import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { CategoryLook } from '../core/category-looks';
import type { Importance } from '../core/kanban';
import { IMPORTANCE_LABEL } from '../core/kanban';
import { initialStock } from '../core/profile-people';
import type { Stock } from '../core/review';
import { CategoryLabel } from './category-label';
import { ICON, IconModule } from './icons';
import { IMPORTANCE_LEVEL } from './kanban-icons';
import type { PersonFace } from './person-photo';
import { WishTags } from './wish-tags';

/** Uma pessoa de quem vê a anotação: o emoji na cartolina dela (a foto do perfil), ou a inicial. */
export interface DetailsPerson {
  code: string;
  name: string;
  face: PersonFace | null;
}

/**
 * O que os Detalhes mostram (PLANO-LEITURA-UNIFICADA.md, D7): cada parte é null (ou vazia) quando a anotação não tem
 * aquilo, e a linha não aparece. Quem monta é a leitura; a peça só desenha e devolve os toques.
 */
export interface ReaderDetailsData {
  group: { label: string; look: CategoryLook; color: string | null } | null;
  folder: { id: string; label: string } | null;
  /** A data na fita (null: sem data), a frase inteira e o que vem embaixo (fixada, finalizada). */
  date: { tape: string | null; long: string; notes: readonly string[] };
  /** Quem vê: a frase e o desenho (a sua), ou as pessoas da compartilhada. */
  who: { icon: LucideIconData; line: string; people: readonly DetailsPerson[]; sub: string | null; opens: boolean } | null;
  tasks: { done: number; total: number } | null;
  tags: readonly { label: string; color: string | null }[];
  board: { id: string; column: string; color: string | null; importance: Importance | null; status: string | null; deps: boolean } | null;
  study: { deckId: string; deck: string; more: number; icon: LucideIconData; color: string; level: string; levelLabel: string; when: string } | null;
  reminders: readonly { id: string; day: string; when: string; title: string; past: boolean; icon: LucideIconData; color: string | null }[];
  moreReminders: number;
}

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** A data da fita de rotular: "21 NOV 2026" (de "2026-11-21"); null sem data ou com uma que não se lê. */
export function tapeDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : null;
}

/** Os gomos do medidor das tarefas: um por tarefa até 10; mais que isso, a barra contínua (null). */
export function taskSegments(done: number, total: number): boolean[] | null {
  if (total > 10 || total < 1) return null;
  return Array.from({ length: total }, (_, i) => i < done);
}

/**
 * A seta de prioridade da importância no quadro: quantas setinhas e para onde (crítico, três para cima; importante,
 * duas; médio, uma; baixo, uma para baixo; baixíssimo, duas para baixo). Desenhada aqui, e não do acervo: as setas do
 * acervo são "abrir" e "recolher" (um desenho serve a uma ideia só).
 */
export function priorityArrow(i: Importance): { up: boolean; n: number } {
  const level = IMPORTANCE_LEVEL[i];
  return level >= 3 ? { up: true, n: level - 2 } : { up: false, n: 3 - level };
}

/**
 * Os Detalhes de uma anotação, na folha ao lado da leitura (PLANO-LEITURA-UNIFICADA.md, D7): uma linha por dado, com o
 * desenho e o nome dele, e o valor em letra de texto. Só lê o que a leitura dá; os toques (a pasta, as pessoas, o
 * quadro, o baralho, o dia) voltam para ela. As dependências do quadro vêm projetadas (`[detalhes-deps]`): o selo
 * delas é do dono e mexe no quadro.
 */
@Component({
  selector: 'app-reader-details',
  imports: [CategoryLabel, IconModule, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reader-details.html',
  styleUrl: './reader-details.scss',
})
export class ReaderDetails {
  readonly data = input.required<ReaderDetailsData>();
  readonly folderOpened = output<string>();
  readonly peopleOpened = output<void>();
  readonly boardOpened = output<string>();
  readonly deckOpened = output<string>();
  readonly dayOpened = output<string>();
  readonly moreReminders = output<void>();

  protected readonly I = {
    grupo: ICON.pasta,
    pasta: ICON.pastaDeNotas,
    data: ICON.historico,
    quem: ICON.pessoas,
    tarefas: ICON.tarefas,
    tags: ICON.etiqueta,
    kanban: ICON.colunas,
    flash: ICON.camadas,
    agenda: ICON.calendario,
    fixada: ICON.fixar,
  };
  protected readonly importanceLabel = IMPORTANCE_LABEL;
  /** As cores das tags para a legenda (a leitura já sabe a de cada uma). */
  protected readonly tagColors = computed(() => {
    const map = new Map(this.data().tags.map((t) => [t.label, t.color]));
    return { hex: (tag: string) => map.get(tag) ?? null };
  });
  protected readonly tagLabels = computed(() => this.data().tags.map((t) => t.label));
  protected readonly segments = computed(() => {
    const t = this.data().tasks;
    return t ? taskSegments(t.done, t.total) : null;
  });
  protected readonly arrow = computed(() => {
    const i = this.data().board?.importance;
    return i ? { ...priorityArrow(i), chevrons: [0, 1, 2].slice(0, priorityArrow(i).n) } : null;
  });
  /** A cartolina de quem não tem foto: a sorteada pelo código, como na `PersonPhoto`. */
  protected stockOf(p: DetailsPerson): Stock {
    return p.face?.cor ?? initialStock(p.code);
  }
  protected initialOf(p: DetailsPerson): string {
    return ([...p.name.trim()][0] ?? '?').toLocaleUpperCase('pt-BR');
  }
}
