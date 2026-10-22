import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { fold } from '../core/review';
import { outTags } from '../core/tag-filter';
import { matchesQuery } from '../core/wall-filter';
import { WallMotion } from '../core/wall-motion';
import { WallState } from '../core/wall-view';
import { ALL_TAB } from '../core/note-tabs';
import { FilterCard, FilterShow, SubjectOption } from './filter-card';
import { TagChip } from './tag-chips';

/**
 * A ficha dos filtros na pasta do mural de anotações (ver `FilterCard`): de onde vêm as escolhas. O
 * assunto e as tags da aba aberta (em Tudo, os do mural inteiro), cada um com quantas anotações
 * mostraria com o resto do filtro como está; as tags mais usadas na aba primeiro, e as escondidas
 * (riscadas, com quantas anotações cada uma tira do mural; ver core/tag-filter.ts). E o que fica fora
 * do mural até a pessoa pedir: as finalizadas e as que estão só no Kanban.
 */
@Component({
  selector: 'app-wall-filters',
  imports: [FilterCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-filter-card
      [subjects]="subjects()"
      [tags]="tags()"
      [shows]="shows()"
      [shown]="view.visible().length"
      [total]="view.pool().length"
      [filtering]="view.isFiltered()"
      [elsewhere]="view.elsewhere()"
      (subjectChosen)="chooseSubject($event)"
      (tagToggled)="toggleTag($event)"
      (tagExcluded)="excludeTag($event)"
      (showToggled)="toggleShow($event)"
      (cleared)="clear()"
      (searchedAll)="searchAll()"
    />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class WallFilters {
  protected readonly view = inject(WallState);
  private readonly motion = inject(WallMotion);

  protected readonly subjects = computed<SubjectOption[]>(
    () => this.view.facets().find((f) => f.key === 'subject')?.options.map((o) => ({ value: o.value, label: o.label, n: o.n, on: o.on })) ?? [],
  );

  protected readonly tags = computed<TagChip[]>(() => {
    const facet = this.view.facets().find((f) => f.key === 'tag');
    // quantas anotações da aba (à mostra) usam cada tag: a ordem das etiquetas
    const uses = new Map<string, number>();
    for (const r of this.view.pool()) for (const t of r.tags ?? []) uses.set(fold(t), (uses.get(fold(t)) ?? 0) + 1);
    const used = (value: string) => uses.get(fold(value)) ?? 0;
    // as escondidas: as que tiram do mural alguma anotação que a busca acharia
    const needle = fold(this.view.query().trim());
    const out = outTags(
      this.view.pool().filter((r) => matchesQuery(r, needle)),
      this.view.tagOuts(),
      this.view.defaultTagOuts(),
    );
    const chips: TagChip[] = (facet?.options ?? [])
      .filter((o) => o.value !== 'sem')
      .map((o) => {
        const hidden = out.get(fold(o.value));
        return hidden ? { value: o.value, label: o.label, n: hidden.n, on: false, out: true } : { value: o.value, label: o.label, n: o.n, on: o.on };
      });
    for (const [k, h] of out) if (!chips.some((c) => fold(c.value) === k)) chips.push({ value: h.label, label: h.label, n: h.n, on: false, out: true });
    return chips.sort((a, b) => used(b.value) - used(a.value) || a.label.localeCompare(b.label, 'pt-BR'));
  });

  /** As finalizadas e as que estão só no Kanban: cada uma só quando existe (ou está à mostra). */
  protected readonly shows = computed<FilterShow[]>(() => {
    const list: FilterShow[] = [];
    if (this.view.doneCount() || this.view.showDone()) {
      list.push({ key: 'finalizadas', label: 'Finalizadas', n: this.view.doneCount(), on: this.view.showDone(), summary: 'com as finalizadas' });
    }
    if (this.view.boardCount()) {
      list.push({ key: 'kanban', label: 'Só no Kanban', n: this.view.boardCount(), on: this.view.showBoard(), summary: 'com as do Kanban' });
    }
    return list;
  });

  protected chooseSubject(value: string | null): void {
    this.motion.run(() => this.view.chooseSubject(value));
  }

  /** O clique: liga ou desliga a tag; na riscada, as anotações dela voltam. */
  protected toggleTag(value: string): void {
    this.motion.run(() => (this.view.tagIsOut(value) ? this.view.releaseTag(value) : this.view.toggle('tag', value)));
  }

  /** O clique direito: esconde as anotações da tag (na riscada, mostra de novo). */
  protected excludeTag(value: string): void {
    this.motion.run(() => this.view.excludeTag(value));
  }

  /**
   * "Mostrar também": as finalizadas (fica guardado, como a ordem) ou as que estão só no Kanban (só
   * nesta visita) entram no mural, ou saem, deslizando.
   */
  protected toggleShow(key: string): void {
    this.motion.run(() => (key === 'kanban' ? this.view.showBoard.update((v) => !v) : this.view.showDone.update((v) => !v)));
  }

  /** Tira a busca e os filtros ligados (o Limpar). */
  protected clear(): void {
    this.motion.run(() => this.view.clearFilters());
  }

  /** A busca sai da aba e procura no mural inteiro. */
  protected searchAll(): void {
    this.motion.run(() => this.view.setNoteTab(ALL_TAB));
  }
}
