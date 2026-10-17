import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { fold } from '../core/review';
import { WallMotion } from '../core/wall-motion';
import { WallState } from '../core/wall-view';
import { TagChip, TagChips } from './tag-chips';

/**
 * As tags da aba aberta (em Tudo, as do mural inteiro), na pasta do mural de anotações, depois do
 * picote: é o filtro das anotações, que não têm cartela. As etiquetas são as de `TagChips` (as mesmas
 * do Kanban); aqui fica de onde elas vêm: as opções de tag do mural, as mais usadas na aba primeiro.
 */
@Component({
  selector: 'app-tag-shortcuts',
  imports: [TagChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-tag-chips [tags]="tags()" (toggled)="toggle($event)" />`,
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
    if (!facet) return [];
    // quantas anotações da aba (à mostra) usam cada tag: a ordem dos atalhos
    const uses = new Map<string, number>();
    for (const r of this.view.pool()) for (const t of r.tags ?? []) uses.set(fold(t), (uses.get(fold(t)) ?? 0) + 1);
    const used = (value: string) => uses.get(fold(value)) ?? 0;
    return facet.options
      .filter((o) => o.value !== 'sem')
      .sort((a, b) => used(b.value) - used(a.value) || a.label.localeCompare(b.label, 'pt-BR'))
      .map((o) => ({ value: o.value, label: o.label, n: o.n, on: o.on }));
  });

  protected toggle(value: string): void {
    this.motion.run(() => this.view.toggle('tag', value));
  }
}
