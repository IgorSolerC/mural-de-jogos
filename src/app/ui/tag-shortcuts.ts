import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { fold } from '../core/review';
import { outTags } from '../core/tag-filter';
import { matchesQuery } from '../core/wall-filter';
import { WallMotion } from '../core/wall-motion';
import { WallState } from '../core/wall-view';
import { TagChip, TagChips } from './tag-chips';

/**
 * As tags da aba aberta (em Tudo, as do mural inteiro), na pasta do mural de anotações, depois do
 * picote: é o filtro das anotações, que não têm cartela. As etiquetas são as de `TagChips` (as mesmas
 * do Kanban); aqui fica de onde elas vêm: as opções de tag do mural, as mais usadas na aba primeiro,
 * e as escondidas (riscadas, com quantas anotações cada uma tira do mural; ver core/tag-filter.ts).
 */
@Component({
  selector: 'app-tag-shortcuts',
  imports: [TagChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-tag-chips [tags]="tags()" (toggled)="toggle($event)" (excluded)="exclude($event)" />`,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class TagShortcuts {
  private readonly view = inject(WallState);
  private readonly motion = inject(WallMotion);

  protected readonly tags = computed<TagChip[]>(() => {
    const facet = this.view.facets().find((f) => f.key === 'tag');
    // quantas anotações da aba (à mostra) usam cada tag: a ordem dos atalhos
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

  /** O clique: liga ou desliga a tag; na riscada, as anotações dela voltam. */
  protected toggle(value: string): void {
    this.motion.run(() => (this.view.tagIsOut(value) ? this.view.releaseTag(value) : this.view.toggle('tag', value)));
  }

  /** O clique direito: esconde as anotações da tag (na riscada, mostra de novo). */
  protected exclude(value: string): void {
    this.motion.run(() => this.view.excludeTag(value));
  }
}
