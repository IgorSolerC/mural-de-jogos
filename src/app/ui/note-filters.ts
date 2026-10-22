import { Injectable, computed, inject } from '@angular/core';
import { tagColorHex } from '../core/category-looks';
import { fold } from '../core/review';
import { outTags } from '../core/tag-filter';
import { matchesQuery } from '../core/wall-filter';
import { WallMotion } from '../core/wall-motion';
import { WallState } from '../core/wall-view';
import { FilterShow, SubjectOption, activeFilters, removeActive } from './filter-card';
import { FilterChip } from './filter-sheet';
import { TagChip } from './tag-chips';

/**
 * A folha dos filtros do mural de anotações (ver `FilterCard`): de onde vêm as escolhas, e o que cada
 * toque muda. O assunto e as tags da aba aberta (em Tudo, os do mural inteiro), cada um com quantas
 * anotações mostraria com o resto do filtro como está; as tags mais usadas na aba primeiro, na cor de
 * cada uma, e as escondidas (riscadas, com quantas anotações cada uma tira do mural; ver
 * core/tag-filter.ts). E o que fica fora do mural até a pessoa pedir: as finalizadas e as que estão
 * só no Kanban. A régua do mural (WallToolbar) dá um destes para o Filtrar, a folha e os adesivos ligados.
 */
@Injectable()
export class NoteFilters {
  private readonly view = inject(WallState);
  private readonly motion = inject(WallMotion);

  readonly subjects = computed<SubjectOption[]>(
    () => this.view.facets().find((f) => f.key === 'subject')?.options.map((o) => ({ value: o.value, label: o.label, n: o.n, on: o.on })) ?? [],
  );

  readonly tags = computed<TagChip[]>(() => {
    const facet = this.view.facets().find((f) => f.key === 'tag');
    // quantas anotações da aba (à mostra) usam cada tag: a ordem das etiquetas; e o grupo da primeira
    // delas, que dá a cor (a mesma tag pode ter uma cor em cada grupo, como na ficha)
    const uses = new Map<string, number>();
    const groupOf = new Map<string, string>();
    for (const r of this.view.pool()) {
      for (const t of r.tags ?? []) {
        const k = fold(t);
        uses.set(k, (uses.get(k) ?? 0) + 1);
        if (!groupOf.has(k)) groupOf.set(k, r.category ?? '');
      }
    }
    const used = (value: string) => uses.get(fold(value)) ?? 0;
    const looks = this.view.categoryLooks();
    const color = (label: string) => tagColorHex(looks, label, groupOf.get(fold(label)) ?? '');
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
        return hidden
          ? { value: o.value, label: o.label, n: hidden.n, on: false, out: true, color: color(o.label) }
          : { value: o.value, label: o.label, n: o.n, on: o.on, color: color(o.label) };
      });
    for (const [k, h] of out) if (!chips.some((c) => fold(c.value) === k)) chips.push({ value: h.label, label: h.label, n: h.n, on: false, out: true, color: color(h.label) });
    return chips.sort((a, b) => used(b.value) - used(a.value) || a.label.localeCompare(b.label, 'pt-BR'));
  });

  /** As finalizadas e as que estão só no Kanban: cada uma só quando existe (ou está à mostra). */
  readonly shows = computed<FilterShow[]>(() => {
    const list: FilterShow[] = [];
    if (this.view.doneCount() || this.view.showDone()) {
      list.push({ key: 'finalizadas', label: 'Finalizadas', n: this.view.doneCount(), on: this.view.showDone(), summary: 'Com as finalizadas' });
    }
    if (this.view.boardCount()) {
      list.push({ key: 'kanban', label: 'Só no Kanban', n: this.view.boardCount(), on: this.view.showBoard(), summary: 'Com as do Kanban' });
    }
    return list;
  });

  /** Os ligados, para os adesivos embaixo da pasta e o número do Filtrar. */
  readonly active = computed(() => activeFilters(this.subjects(), this.tags(), this.shows()));

  chooseSubject(value: string | null): void {
    this.motion.run(() => this.view.chooseSubject(value));
  }

  /** O clique: liga ou desliga a tag; na riscada, as anotações dela voltam. */
  toggleTag(value: string): void {
    this.motion.run(() => (this.view.tagIsOut(value) ? this.view.releaseTag(value) : this.view.toggle('tag', value)));
  }

  /** O clique direito: esconde as anotações da tag (na riscada, mostra de novo). */
  excludeTag(value: string): void {
    this.motion.run(() => this.view.excludeTag(value));
  }

  /**
   * "Mostrar também": as finalizadas (fica guardado, como a ordem) ou as que estão só no Kanban (só
   * nesta visita) entram no mural, ou saem, deslizando.
   */
  toggleShow(key: string): void {
    this.motion.run(() => (key === 'kanban' ? this.view.showBoard.update((v) => !v) : this.view.showDone.update((v) => !v)));
  }

  /** O X de um adesivo ligado: o mesmo toque que o ligou. */
  remove(f: FilterChip): void {
    removeActive(f, { subjectChosen: (v) => this.chooseSubject(v), tagToggled: (v) => this.toggleTag(v), showToggled: (k) => this.toggleShow(k) });
  }

  /** Limpar tudo, na folha: o assunto, as tags (ligadas e escondidas) e o que voltou ao mural; a busca fica. */
  clearChoices(): void {
    this.motion.run(() => {
      this.view.clearChoices();
      this.view.showDone.set(false);
      this.view.showBoard.set(false);
    });
  }
}
