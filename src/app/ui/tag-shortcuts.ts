import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WallMotion } from '../core/wall-motion';
import { WallView } from '../core/wall-view';
import { ALL_TAB } from '../core/note-tabs';
import { NoteTag } from './note-tag';

/** Quantas tags à mão embaixo da régua; as outras ficam no Filtrar. */
const MAX_SHORTCUTS = 10;

/**
 * As tags da aba aberta, embaixo da régua do mural de anotações: um toque filtra por elas, sem abrir
 * a cartela. A desligada é o contorno tracejado de uma etiqueta em branco; a ligada é a etiqueta de
 * papel kraft amarrada (como na cartela e na ficha). As mais usadas na aba vêm primeiro. Só nas abas
 * de categoria (em Tudo, as tags de todos os assuntos juntas só fariam barulho).
 */
@Component({
  selector: 'app-tag-shortcuts',
  imports: [NoteTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shortcuts(); as s) {
      <ul class="atalhos" aria-label="Filtrar pelas tags desta aba">
        @for (t of s.tags; track t.value; let i = $index) {
          <li>
            <button type="button" class="atalho" [attr.aria-pressed]="t.on" (click)="toggle(t.value)">
              <app-note-tag [label]="t.label" [ghost]="!t.on" [index]="t.on ? i : null" />
              <span class="n">{{ t.n }}</span>
            </button>
          </li>
        }
        @if (s.more) {
          <li class="mais">+{{ s.more }} no Filtrar</li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .atalhos {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .atalho {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 4px 8px 4px 4px;
      border: 0;
      border-radius: 4px;
      background: none;
      cursor: pointer;

      &:hover {
        background: rgb(255 255 255 / 0.08);
      }
      &:focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: 1px;
      }
    }

    /* na parede escura, a etiqueta em branco é tracejada em giz */
    .atalho app-note-tag.ghost {
      color: var(--wall-ink);
      outline-color: rgb(243 239 230 / 0.5);
    }

    .n,
    .mais {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.88rem;
      letter-spacing: 0.06em;
      color: var(--wall-ink-2);
      font-variant-numeric: tabular-nums;
    }

    .mais {
      padding-left: 6px;
      text-transform: uppercase;
    }
  `,
})
export class TagShortcuts {
  private readonly view = inject(WallView);
  private readonly motion = inject(WallMotion);

  protected readonly shortcuts = computed(() => {
    if (this.view.activeTab() === ALL_TAB) return null;
    const facet = this.view.facets().find((f) => f.key === 'tag');
    if (!facet) return null;
    // quantas anotações da aba (à mostra) usam cada tag: a ordem dos atalhos
    const uses = new Map<string, number>();
    for (const r of this.view.pool()) for (const t of r.tags ?? []) uses.set(t, (uses.get(t) ?? 0) + 1);
    const options = facet.options
      .filter((o) => o.value !== 'sem')
      .sort((a, b) => (uses.get(b.value) ?? 0) - (uses.get(a.value) ?? 0) || a.label.localeCompare(b.label, 'pt-BR'));
    if (!options.length) return null;
    // as ligadas ficam sempre à mão, mesmo fora das mais usadas
    const shown = options.filter((o, i) => i < MAX_SHORTCUTS || o.on);
    return { tags: shown, more: options.length - shown.length };
  });

  protected toggle(value: string): void {
    this.motion.run(() => this.view.toggle('tag', value));
  }
}
