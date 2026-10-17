import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CATEGORY_COLORS, CategoryColorId } from '../core/category-looks';
import { Settings } from '../core/settings';

/**
 * As cores de uma tag numa categoria (a mesma tag pode ter uma cor em cada uma): as mesmas oito das
 * categorias e "Sem cor" (o papel pardo de sempre), cada uma desenhada como uma etiqueta em miniatura
 * (o bico, o contorno colorido por dentro do papel claro, como a tag fica na ficha). Muda na hora, em
 * toda anotação da categoria que tem a tag (ver `Settings.setTagColor`).
 */
@Component({
  selector: 'app-tag-colors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ops" role="radiogroup" [attr.aria-label]="'Cor da tag ' + tag()">
      <button type="button" role="radio" class="op sem-cor" [attr.aria-checked]="!color()" aria-label="Sem cor" title="Sem cor: o papel pardo de sempre" (click)="set(undefined)">
        <span class="amostra" aria-hidden="true"></span>
      </button>
      @for (k of colors; track k.id) {
        <button type="button" role="radio" class="op" [style.--c]="k.hex" [attr.aria-checked]="color() === k.id" [attr.aria-label]="k.label" [title]="k.label" (click)="set(k.id)">
          <span class="amostra" aria-hidden="true"></span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .ops {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }
    .op {
      display: inline-grid;
      place-items: center;
      width: 38px;
      height: 34px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .op:hover {
      background: rgb(21 21 21 / 0.06);
    }
    .op:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 0;
    }
    .op[aria-checked='true'] {
      box-shadow: inset 0 0 0 2px var(--ink);
    }
    /* a etiqueta em miniatura: três recortes do mesmo formato, um dentro do outro (ver NoteTag) */
    .amostra {
      position: relative;
      width: 28px;
      height: 16px;
      background: #fffcf2;
      clip-path: polygon(7px 0, 100% 0, 100% 100%, 7px 100%, 0 50%);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.25));
    }
    .amostra::before,
    .amostra::after {
      content: '';
      position: absolute;
      inset: 2px;
      clip-path: polygon(5.3px 0, 100% 0, 100% 100%, 5.3px 100%, 0 50%);
      background: var(--c);
    }
    .amostra::after {
      inset: 4px 4px 4px 4.5px;
      clip-path: polygon(3.5px 0, 100% 0, 100% 100%, 3.5px 100%, 0 50%);
      background: #fffcf2;
    }
    /* sem cor: a etiqueta de papel pardo, lisa */
    .sem-cor .amostra {
      background: #d8bd8c;
    }
    .sem-cor .amostra::before,
    .sem-cor .amostra::after {
      display: none;
    }
    @media (pointer: coarse) {
      .op {
        width: 44px;
        height: 44px;
      }
    }
    @media (forced-colors: active) {
      .op[aria-checked='true'] {
        outline: 2px solid Highlight;
      }
    }
  `,
})
export class TagColors {
  readonly tag = input.required<string>();
  /** A categoria em que a cor vale ("" para as anotações sem categoria). */
  readonly category = input.required<string>();

  protected readonly colors = CATEGORY_COLORS;
  private readonly settings = inject(Settings);
  protected readonly color = computed(() => this.settings.tagColor(this.tag(), this.category()));

  protected set(color: CategoryColorId | undefined): void {
    this.settings.setTagColor(this.tag(), color, this.category());
  }
}
