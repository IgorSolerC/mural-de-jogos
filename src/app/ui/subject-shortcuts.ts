import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WallMotion } from '../core/wall-motion';
import { WallState } from '../core/wall-view';
import { SubjectChip, SubjectChips } from './subject-chips';

/**
 * Os assuntos da aba aberta (em Tudo, os do mural inteiro), na pasta do mural de anotações, antes das
 * tags: as opções do grupo "Assunto" do filtro, de A a Z e "Sem assunto" no fim, cada uma com quantas
 * anotações mostraria com o resto do filtro como está. O desenho é o de `SubjectChips` (o mesmo do
 * Kanban).
 */
@Component({
  selector: 'app-subject-shortcuts',
  imports: [SubjectChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-subject-chips [chips]="chips()" (toggled)="toggle($event)" />`,
  styles: `
    :host {
      display: block;
    }
    :host:has(app-subject-chips.vazio) {
      display: none;
    }
  `,
})
export class SubjectShortcuts {
  private readonly view = inject(WallState);
  private readonly motion = inject(WallMotion);

  protected readonly chips = computed<SubjectChip[]>(
    () => this.view.facets().find((f) => f.key === 'subject')?.options.map((o) => ({ value: o.value, label: o.label, n: o.n, on: o.on })) ?? [],
  );

  protected toggle(value: string): void {
    this.motion.run(() => this.view.toggle('subject', value));
  }
}
