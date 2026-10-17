import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NoteTag } from './note-tag';

/** Quantas tags ficam à mão; as outras aparecem no "+N". */
const MAX_SHORTCUTS = 10;

/** Uma tag do filtro: o valor que liga e desliga, como ela aparece e em quantas anotações está. */
export interface TagChip {
  value: string;
  label: string;
  n: number;
  on: boolean;
}

/**
 * O filtro por tags na pasta, depois do picote: o do mural de anotações (ver `TagShortcuts`) e o do
 * Kanban. Um toque liga ou desliga a tag (ligadas várias, vale qualquer uma delas). A desligada é o
 * contorno tracejado de uma etiqueta em branco; a ligada é a etiqueta de papel kraft amarrada, como na
 * ficha. Chegam na ordem em que aparecem (as mais usadas primeiro); com mais de dez, o "+N" mostra as
 * outras, e as ligadas ficam sempre à mão.
 */
@Component({
  selector: 'app-tag-chips',
  imports: [NoteTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shortcuts(); as s) {
      <ul class="atalhos" aria-label="Filtrar pelas tags">
        @for (t of s.tags; track t.value; let i = $index) {
          <li>
            <button type="button" class="atalho" [attr.aria-pressed]="t.on" (click)="toggled.emit(t.value)">
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
export class TagChips {
  /** As tags, já na ordem (as mais usadas primeiro). */
  readonly tags = input.required<readonly TagChip[]>();
  readonly toggled = output<string>();

  /** Mostrando todas as tags (o "+N" aberto). */
  protected readonly all = signal(false);

  protected readonly shortcuts = computed(() => {
    const options = this.tags();
    if (!options.length) return null;
    const shown = this.all() ? options : options.filter((o, i) => i < MAX_SHORTCUTS || o.on);
    return { tags: shown, more: options.length - shown.length };
  });
}
