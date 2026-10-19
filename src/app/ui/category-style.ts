import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryColorId, CategoryIconId, CategoryLook, categoryColorHex } from '../core/category-looks';
import { Settings } from '../core/settings';
import { CategoryLabel, categoryIcon } from './category-label';
import { ICON_CHOICE, ICON_CHOICE_LABEL, IconModule } from './icons';

/**
 * A folha do ícone e da cor de uma categoria das anotações, no editor (ver core/category-looks.ts):
 * a orelha de prévia, os ícones e as cores da etiqueta. Muda na hora, para todas as anotações da
 * categoria (não espera salvar a anotação). Vem num `@defer`, fora do carregamento do site.
 */
@Component({
  selector: 'app-category-style',
  imports: [IconModule, CategoryLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.id]': 'id()', '[class.solta]': 'bare()' },
  template: `
    @if (!bare()) {
      <div class="previa" aria-hidden="true">
        <span class="orelha" [class.orelha-cor]="!!color()" [style.--cat-cor]="color()"><app-cat-label [label]="category()" [look]="look()" /></span>
      </div>
      <p class="hint">Vale para todas as anotações de {{ category() }}: na orelha da ficha e na aba do mural.</p>
    }
    <p class="sub" [id]="id() + '-icones'">Ícone</p>
    <div class="ops" role="group" [attr.aria-labelledby]="id() + '-icones'">
      @for (i of icons; track i) {
        <button type="button" class="op icone" [attr.aria-pressed]="iconId() === i" [attr.aria-label]="iconLabel[i]" [title]="iconLabel[i]" (click)="setIcon(i)">
          <lucide-icon [img]="iconOf[i]" [size]="19" aria-hidden="true" />
        </button>
      }
    </div>
    <p class="sub" [id]="id() + '-cores'">Cor da etiqueta</p>
    <div class="ops" role="group" [attr.aria-labelledby]="id() + '-cores'">
      <button type="button" class="op cor sem-cor" [attr.aria-pressed]="!look().color" aria-label="Sem cor" title="Sem cor: o papel manilha liso" (click)="setColor(undefined)"></button>
      @for (k of colors; track k.id) {
        <button type="button" class="op cor" [style.--c]="k.hex" [attr.aria-pressed]="look().color === k.id" [attr.aria-label]="k.label" [title]="k.label" (click)="setColor(k.id)"></button>
      }
    </div>
    @if (look().icon || look().color) {
      <button type="button" class="voltar" (click)="reset()">Voltar ao de sempre</button>
    }
  `,
  styles: `
    /* uma folha como a cartela de categorias, com a orelha de prévia em cima */
    :host {
      display: grid;
      gap: 8px;
      margin-top: 10px;
      padding: 12px 14px 14px;
      border-radius: 2px;
      background: #fdfcf8;
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.14),
        0 1px 2px rgb(0 0 0 / 0.12),
        0 6px 12px -8px rgb(0 0 0 / 0.3);
      animation: folha-in var(--t-physical) var(--ease-physical);
    }
    /* solta: dentro de outra folha (as configurações do mural), sem papel nem prévia próprios */
    :host(.solta) {
      margin: 0;
      padding: 0;
      background: none;
      box-shadow: none;
      animation: none;
    }
    @keyframes folha-in {
      from {
        opacity: 0;
        translate: 0 -6px;
      }
    }
    /* a prévia: a orelha de manilha saindo da beirada de uma cartolina */
    .previa {
      display: flex;
      padding-top: 4px;
      border-bottom: 10px solid var(--paper);
      box-shadow: 0 1px 0 rgb(21 21 21 / 0.12);
    }
    .orelha {
      display: inline-flex;
      max-width: 100%;
      margin-left: 12px;
      padding: 5px 11px 6px 9px;
      border-radius: 8px 8px 0 0;
      background-color: var(--manilha);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: #151515;
      font-family: var(--f-marker);
      font-size: 0.94rem;
      line-height: 1.2;
    }
    .orelha {
      position: relative;
      isolation: isolate;
    }
    .orelha.orelha-cor {
      padding: 9px 13px 6px 11px;
      background-color: var(--papel-orelha);
    }
    .hint {
      margin: 0;
      max-width: 54ch;
      font-size: 0.92rem;
      color: var(--ink-2);
    }
    .sub {
      margin: 4px 0 0;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .ops {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .op {
      display: inline-grid;
      place-items: center;
      width: 38px;
      height: 38px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .op:hover {
      background: rgb(21 21 21 / 0.06);
    }
    .op:focus-visible,
    .voltar:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 0;
    }
    /* a escolhida: o círculo de caneta da nota escolhida em volta */
    .op[aria-pressed='true'] {
      box-shadow: none;
      background-image: var(--circulo-caneta);
      background-repeat: no-repeat;
      background-position: center;
      background-size: 100% 100%;
    }
    .icone[aria-pressed='true'] {
      background: rgb(255 218 66 / 0.55);
    }
    .op lucide-icon {
      display: inline-flex;
    }
    /* a cor: a orelha em miniatura, a borda colorida por dentro do manilha */
    .cor::before {
      content: '';
      width: 26px;
      height: 18px;
      border: 3px solid var(--c);
      border-bottom: 0;
      border-radius: 6px 6px 0 0;
      background: var(--papel-orelha);
      box-shadow:
        0 0 0 2.5px var(--papel-orelha),
        0 0 0 3.5px rgb(21 21 21 / 0.18);
    }
    .sem-cor::before {
      border: 1.5px dashed rgb(21 21 21 / 0.45);
      background: var(--manilha);
    }
    /* o mesmo risco de pincel das ações do editor */
    .voltar {
      justify-self: start;
      min-height: 40px;
      margin: 0 0 -6px -8px;
      padding: 6px 8px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--ink);
      font-family: var(--f-marker);
      font-size: 1rem;
      text-decoration: underline 2px;
      text-underline-offset: 5px;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .voltar:hover {
      background: rgb(21 21 21 / 0.05);
    }
    @media (pointer: coarse) {
      .op {
        width: 44px;
        height: 44px;
      }
    }
  `,
})
export class CategoryStyle {
  readonly id = input.required<string>();
  readonly category = input.required<string>();
  /** Sem a folha e a prévia: quem mostra já tem a orelha à vista (ver ui/mural-config.ts). */
  readonly bare = input(false);

  private readonly settings = inject(Settings);
  protected readonly icons = CATEGORY_ICONS;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly iconLabel = ICON_CHOICE_LABEL;
  protected readonly colors = CATEGORY_COLORS;

  /** O ícone e a cor escolhidos para a categoria. */
  protected readonly look = computed<CategoryLook>(() => this.settings.categoryLook(this.category()));
  protected readonly color = computed(() => categoryColorHex(this.look().color));
  /** O ícone que a categoria mostra agora: o escolhido, ou o de sempre. */
  protected readonly iconId = computed(() => {
    const now = categoryIcon(this.category(), this.look());
    return CATEGORY_ICONS.find((i) => ICON_CHOICE[i] === now) ?? null;
  });

  /** Troca o ícone; o de sempre não fica guardado (assim "Voltar ao de sempre" some se só ele mudou). */
  protected setIcon(icon: CategoryIconId): void {
    const same = ICON_CHOICE[icon] === categoryIcon(this.category());
    this.settings.setCategoryLook(this.category(), { ...this.look(), icon: same ? undefined : icon });
  }

  protected setColor(color: CategoryColorId | undefined): void {
    this.settings.setCategoryLook(this.category(), { ...this.look(), color });
  }

  protected reset(): void {
    this.settings.setCategoryLook(this.category(), {});
  }
}
