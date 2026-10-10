import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { fold } from '../core/review';
import { WallMotion } from '../core/wall-motion';
import { WallState } from '../core/wall-view';
import { NoteTag } from './note-tag';

/** Quantas tags ficam à mão; as outras aparecem no "+N". */
const MAX_SHORTCUTS = 10;

/**
 * As tags da aba aberta (em Tudo, as do mural inteiro), na pasta do mural de anotações, depois do
 * picote: é o filtro das anotações, que não têm cartela. Um toque liga ou desliga a tag (ligadas
 * várias, vale qualquer uma delas). A desligada é o contorno tracejado de uma etiqueta em branco; a
 * ligada é a etiqueta de papel kraft amarrada, como na ficha. As mais usadas vêm primeiro; com mais de
 * dez, o "+N" mostra as outras.
 */
@Component({
  selector: 'app-tag-shortcuts',
  imports: [NoteTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shortcuts(); as s) {
      <ul class="atalhos" aria-label="Filtrar pelas tags">
        @for (t of s.tags; track t.value; let i = $index) {
          <li>
            <button type="button" class="atalho" [attr.aria-pressed]="t.on" (click)="toggle(t.value)">
              <app-note-tag [label]="t.label" [ghost]="!t.on" [index]="t.on ? i : null" />
              <span class="n">{{ t.n }}</span>
            </button>
          </li>
        }
        @if (s.more || all()) {
          <li>
            <button type="button" class="mais" [attr.aria-expanded]="all()" (click)="all.set(!all())">
              {{ all() ? 'Menos' : '+' + s.more }}
              @if (!all()) {
                <span class="sr-only">{{ s.more === 1 ? 'tag' : 'tags' }}</span>
              }
            </button>
          </li>
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
        background: rgb(21 21 21 / 0.07);
      }
      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: 1px;
      }
    }

    .n,
    .mais {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.88rem;
      letter-spacing: 0.06em;
      color: rgb(21 21 21 / 0.72);
      font-variant-numeric: tabular-nums;
    }

    .mais {
      min-height: 36px;
      padding: 4px 8px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: var(--ink);
      text-transform: uppercase;
      text-decoration: underline 2px var(--ink);
      text-underline-offset: 4px;
      white-space: nowrap;
      cursor: pointer;

      &:hover {
        background: rgb(21 21 21 / 0.07);
      }
      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: 1px;
      }
    }

    /* no celular, uma linha só, que corre de lado dentro da pasta */
    @media (max-width: 720px) {
      .atalhos {
        flex-wrap: nowrap;
      }
      li {
        flex: none;
      }
    }
  `,
})
export class TagShortcuts {
  private readonly view = inject(WallState);
  private readonly motion = inject(WallMotion);

  /** Mostrando todas as tags (o "+N" aberto). */
  protected readonly all = signal(false);

  protected readonly shortcuts = computed(() => {
    const facet = this.view.facets().find((f) => f.key === 'tag');
    if (!facet) return null;
    // quantas anotações da aba (à mostra) usam cada tag: a ordem dos atalhos
    const uses = new Map<string, number>();
    for (const r of this.view.pool()) for (const t of r.tags ?? []) uses.set(fold(t), (uses.get(fold(t)) ?? 0) + 1);
    const used = (value: string) => uses.get(fold(value)) ?? 0;
    const options = facet.options
      .filter((o) => o.value !== 'sem')
      .sort((a, b) => used(b.value) - used(a.value) || a.label.localeCompare(b.label, 'pt-BR'));
    if (!options.length) return null;
    // as ligadas ficam sempre à mão, mesmo fora das mais usadas
    const shown = this.all() ? options : options.filter((o, i) => i < MAX_SHORTCUTS || o.on);
    return { tags: shown, more: options.length - shown.length };
  });

  protected toggle(value: string): void {
    this.motion.run(() => this.view.toggle('tag', value));
  }
}
