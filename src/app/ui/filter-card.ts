import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { plural } from '../core/text';
import { FilterChip } from './filter-sheet';
import { TagChip, TagChips } from './tag-chips';

/** Um assunto do filtro: o valor que escolhe, o nome, em quantas anotações está e se está escolhido. */
export interface SubjectOption {
  value: string;
  label: string;
  n: number;
  on: boolean;
}

/**
 * O que fica fora do mural até a pessoa pedir (as finalizadas, as que estão só no Kanban): um
 * interruptor na linha "Mostrar também", com quantas são e como o adesivo ligado diz que estão à mostra.
 */
export interface FilterShow {
  key: string;
  label: string;
  n: number;
  on: boolean;
  /** No adesivo ligado, embaixo da pasta: "Com as finalizadas". */
  summary: string;
}

/**
 * Os filtros ligados da folha, para os adesivos embaixo da pasta (`app-filter-tags`) e o número do
 * Filtrar: o assunto escolhido, as tags ligadas, as escondidas e o que voltou ao mural. Tirar cada um é
 * o mesmo gesto que o ligou (`removeActive`).
 */
export function activeFilters(subjects: readonly SubjectOption[], tags: readonly TagChip[], shows: readonly FilterShow[] = []): FilterChip[] {
  const out: FilterChip[] = [];
  for (const s of subjects) if (s.on) out.push({ key: 'subject', value: s.value, label: s.label });
  for (const t of tags) if (t.on && !t.out) out.push({ key: 'tag', value: t.value, label: `#${t.label}` });
  for (const t of tags) if (t.out) out.push({ key: 'out', value: t.value, label: `Sem #${t.label}` });
  for (const x of shows) if (x.on) out.push({ key: 'show', value: x.key, label: x.summary });
  return out;
}

/** O que tirar um adesivo ligado faz: o assunto volta a Todos; a tag (ligada ou escondida) e o interruptor, o mesmo toque da folha. */
export interface FilterActions {
  subjectChosen(value: string | null): void;
  tagToggled(value: string): void;
  showToggled?(key: string): void;
}

export function removeActive(f: FilterChip, to: FilterActions): void {
  if (f.key === 'subject') to.subjectChosen(null);
  else if (f.key === 'show') to.showToggled?.(f.value);
  else to.tagToggled(f.value);
}

let nextId = 0;

/**
 * A folha dos filtros do mural de anotações e do Kanban: a mesma cartela branca das resenhas (ver
 * ui/filter-sheet.ts), presa com fita-crepe embaixo da pasta, que o Filtrar abre. Dentro, as linhas
 * das Configurações: o assunto (os recortes da cartela, o escolhido o adesivo de tinta; um por vez),
 * as tags (as etiquetas, na cor de cada uma) e o "Mostrar também" (os interruptores do que fica fora
 * do mural). No pé, quantas mostra, o Limpar tudo e o Pronto.
 */
@Component({
  selector: 'app-filter-card',
  imports: [TagChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', 'aria-label': 'Filtros', '(keydown.escape)': 'onEscape($event)' },
  templateUrl: './filter-card.html',
  styleUrl: './filter-card.scss',
})
export class FilterCard {
  /** Os assuntos, já na ordem (de A a Z, "Sem assunto" no fim). */
  readonly subjects = input<readonly SubjectOption[]>([]);
  /** As tags, já na ordem (as mais usadas primeiro), com as escondidas. */
  readonly tags = input<readonly TagChip[]>([]);
  /** O que fica fora do mural e volta com um interruptor (só no mural de anotações). */
  readonly shows = input<readonly FilterShow[]>([]);
  /** Quantas estão à mostra e de quantas: o "Mostrando 3 de 26". */
  readonly shown = input(0);
  readonly total = input(0);
  /** A busca ou algum filtro está ligado. */
  readonly filtering = input(false);

  readonly subjectChosen = output<string | null>();
  readonly tagToggled = output<string>();
  readonly tagExcluded = output<string>();
  readonly showToggled = output<string>();
  readonly cleared = output<void>();
  readonly done = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly id = `filtros-${nextId++}`;

  /** O assunto separa alguma coisa: dois ou mais (o "Sem assunto" conta), ou um escolhido. */
  protected readonly subjectRow = computed(() => {
    const s = this.subjects();
    return s.length > 1 || s.some((x) => x.on);
  });
  protected readonly chosen = computed(() => this.subjects().find((s) => s.on) ?? null);

  protected readonly anyChosen = computed(() => activeFilters(this.subjects(), this.tags(), this.shows()).length > 0);

  /** O pé: "Mostrando 3 de 26 anotações", ou só quantas são. */
  protected readonly summary = computed(() => {
    const total = plural(this.total(), 'anotação', 'anotações');
    return this.filtering() ? `Mostrando ${this.shown()} de ${total}` : total;
  });

  protected onEscape(e: Event): void {
    e.stopPropagation();
    this.done.emit();
  }

  /** Leva o foco para a primeira escolha, quando a folha abre pelo teclado. */
  focusFirst(): void {
    this.host.nativeElement.querySelector<HTMLElement>('input:checked, button, input')?.focus();
  }
}
