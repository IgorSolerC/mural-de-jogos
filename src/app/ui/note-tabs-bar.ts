import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core';
import { ICON, IconModule } from './icons';
import { WallMotion } from '../core/wall-motion';
import { WallState } from '../core/wall-view';
import { ALL_TAB, NO_CATEGORY_TAB, NoteTab, PINNED_TAB, SHARED_TAB } from '../core/note-tabs';
import { AutoTab } from '../core/mural-config';

const NONE_TAB = NO_CATEGORY_TAB;

/** A aba que o mural gera, pela chave da aba ('' é o Tudo). */
function autoOf(key: string): AutoTab {
  return key === PINNED_TAB ? 'fixadas' : key === SHARED_TAB ? 'compartilhadas' : 'tudo';
}
import { CategoryLook, bandColor, categoryColorHex, lookKey } from '../core/category-looks';
import { CategoryLabel } from './category-label';
import { TabMore, TabMoreItem } from './tab-more';
import { TabFit } from './tab-fit';

/**
 * As abas do mural de anotações (ver core/note-tabs.ts): divisórias de pasta de papel manilha, em
 * cima da pasta. A aberta fica na frente, clara, emendada na borda da pasta; as outras ficam atrás,
 * mais escuras. Toda categoria fica em pé enquanto couber na largura (e até oito abas, contando
 * Tudo); as que sobram, as com menos anotações, e as escondidas na engrenagem do mural vão para o
 * "Mais" (um <select> invisível sobre a aba, como o Ordenar). Para saber o que cabe, uma fileira
 * escondida mede cada aba de verdade (ver ui/tab-fit.ts, a mesma régua das abas do Kanban). O Tudo
 * só fica em pé com "Mostrar a aba Tudo" nas configurações do mural (ou aberto pela busca).
 *
 * No mural de músicas, as mesmas divisórias, uma por artista.
 */
@Component({
  selector: 'app-note-tabs',
  imports: [IconModule, CategoryLabel, TabMore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tabs(); as t) {
      <div class="abas" role="group" [attr.aria-label]="music() ? 'Artistas' : 'Grupos das anotações'">
        @if (allShown()) {
          <button
            type="button"
            class="aba"
            [class.on]="active() === ALL"
            [class.orelha-cor]="!!autoColor('tudo')"
            [style.--cat-cor]="autoColor('tudo')"
            [attr.aria-pressed]="active() === ALL"
            (click)="choose(ALL)"
          >
            <app-cat-label class="rotulo-cat" label="Tudo" [glyph]="AllIcon" [iconSize]="15" /><span class="n">{{ t.all }}</span>
          </button>
        }
        <!-- as abas que o mural gera, com o olho ligado nas configurações (sem lugar, no "Mais") -->
        @for (x of specialShown(); track x.key) {
          <button
            type="button"
            class="aba"
            [class.on]="active() === x.key"
            [class.orelha-cor]="!!autoColor(x.key)"
            [style.--cat-cor]="autoColor(x.key)"
            [attr.aria-pressed]="active() === x.key"
            (click)="choose(x.key)"
          >
            <app-cat-label class="rotulo-cat" [label]="x.label" [glyph]="iconOf(x.key)" [iconSize]="15" /><span class="n">{{ x.n }}</span>
          </button>
        }
        @for (x of layout().shown; track x.key) {
          <button
            type="button"
            class="aba"
            [class.on]="active() === x.key"
            [class.sem]="x.key === NONE"
            [class.orelha-cor]="!!colorOf(x)"
            [style.--cat-cor]="colorOf(x)"
            [attr.aria-pressed]="active() === x.key"
            [title]="x.label"
            (click)="choose(x.key)"
          >
            @if (x.key === NONE) {
              <span class="nome">{{ x.label }}</span>
            } @else {
              <app-cat-label class="rotulo-cat" [label]="x.label" [look]="lookOf(x)" [glyph]="glyph()" [iconSize]="15" />
            }
            <span class="n">{{ x.n }}</span>
          </button>
        }
        @if (moreGroups().length || moreAutos().length) {
          <app-tab-more
            class="aba mais"
            [class.on]="moreOn()"
            [groups]="moreGroups()"
            [autos]="moreAutos()"
            [active]="active()"
            [label]="music() ? 'Mais artistas' : 'Mais abas'"
            [groupsLabel]="music() ? 'Artistas' : 'Grupos'"
            (chosen)="choose($event)"
          >
            <span class="nome">{{ moreOn() ? activeLabel() ?? 'Tudo' : 'Mais' }}</span>
            @if (moreOn()) {
              <span class="n">{{ moreCount() }}</span>
            }
            <lucide-icon class="chev" [img]="ChevronIcon" [size]="15" aria-hidden="true" />
          </app-tab-more>
        }
      </div>

      <!-- a régua de medir: todas as abas, escondidas, para saber quantas cabem em pé -->
      <div class="abas medida" aria-hidden="true">
        @if (allShown()) {
          <span class="aba especial" data-k="tudo"><app-cat-label class="rotulo-cat" label="Tudo" [glyph]="AllIcon" [iconSize]="15" /><span class="n">{{ t.all }}</span></span>
        }
        @for (x of special(); track x.key) {
          <span class="aba especial" [attr.data-k]="x.key"><app-cat-label class="rotulo-cat" [label]="x.label" [glyph]="iconOf(x.key)" [iconSize]="15" /><span class="n">{{ x.n }}</span></span>
        }
        @for (x of t.tabs; track x.key) {
          <span class="aba" [class.sem]="x.key === NONE" [attr.data-k]="x.key">
            @if (x.key === NONE) {
              <span class="nome">{{ x.label }}</span>
            } @else {
              <app-cat-label class="rotulo-cat" [label]="x.label" [look]="lookOf(x)" [glyph]="glyph()" [iconSize]="15" />
            }
            <span class="n">{{ x.n }}</span>
          </span>
        }
        <span class="aba mais" data-k="mais"><span class="nome">Mais</span></span>
      </div>
    }
  `,
  styles: `
    @use 'divisorias' as div;
    @use 'paper-kit' as kit;

    /* As camadas: as abas de trás (0) ficam atrás da borda da pasta (1), que passa por cima do pé
       delas; só a aberta (2) vem para a frente, emendada na borda. */
    :host {
      @include div.pasta;
      display: block;
    }
    :host::after {
      @include div.borda-da-pasta;
    }

    .abas {
      position: relative;
      @include div.abas-de-grupo;
    }

    /* a régua de medir: no lugar, sem ocupar espaço nem aparecer */
    .medida {
      position: absolute;
      inset: 0 auto auto 0;
      visibility: hidden;
      pointer-events: none;
    }

    /* a orelha dos grupos, igual à dos quadros do Kanban (ver _divisorias.scss) */
    .aba {
      @include div.aba-de-grupo('.on', '.nome, .rotulo-cat', '.n');
    }

    .nome {
      @include div.nome-de-grupo;
    }
    .rotulo-cat {
      @include div.rotulo-de-grupo;
    }

    .n {
      @include div.numero-de-grupo;
    }

    /* "Sem categoria" escrito a lápis, não a pincel: não é uma categoria */
    .sem .nome {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.05rem;
    }

    .mais {
      @include div.mais-de-grupo;

      .chev {
        transition: rotate var(--t-ui) var(--ease-ui);
      }
    }
    /* o "Mais" aberto: a setinha vira */
    .mais.aberto .chev {
      rotate: 180deg;
    }

    @media (prefers-reduced-motion: reduce) {
      .aba {
        transition: none;
      }
    }
  `,
})
export class NoteTabsBar {
  private readonly view = inject(WallState);
  private readonly motion = inject(WallMotion);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly ChevronIcon = ICON.abrir;
  protected readonly AllIcon = ICON.camadas;
  protected readonly ALL = ALL_TAB;
  protected readonly NONE = NO_CATEGORY_TAB;

  /** As abas, só quando há o que separar (ou alguma aba especial). */
  protected readonly tabs = computed(() => {
    const t = this.view.noteTabs();
    return t && (t.tabs.length || this.special().length) ? t : null;
  });
  protected readonly active = this.view.activeTab;
  protected readonly activeLabel = this.view.activeTabLabel;

  /** O Tudo em pé (ver `WallState.allTabShown`). */
  protected readonly allShown = this.view.allTabShown;
  /**
   * As abas que o mural gera em pé (o olho ligado nas configurações), logo depois do Tudo (ver
   * `WallState.standingSpecials`); as outras ficam no "Mais".
   */
  protected readonly special = computed(() => (this.music() ? [] : this.view.standingSpecials()));
  /** O desenho de cada aba especial: o alfinete das fixadas, as duas pessoas das compartilhadas. */
  protected iconOf(key: string) {
    return key === PINNED_TAB ? ICON.fixar : key === SHARED_TAB ? ICON.pessoas : ICON.camadas;
  }

  /** Quais ficam em pé e quais vão para o "Mais" (ver ui/tab-fit.ts). */
  private readonly fit = new TabFit({
    host: this.host,
    row: '.abas:not(.medida)',
    tabs: () => this.tabs()?.tabs ?? null,
    active: () => this.active(),
    // na ordem montada à mão (só nas anotações), ficam em pé as primeiras dela
    ordered: () => !this.music() && !!this.view.categoryOrder(),
    // as escondidas na engrenagem do mural vão sempre para o "Mais"
    hidden: () => (this.music() ? undefined : this.view.hiddenTabs()),
    lead: () => [...(this.allShown() ? ['tudo'] : []), ...this.special().map((x) => x.key)],
    // sem lugar, as especiais vão para o "Mais": primeiro as Compartilhadas, depois as Fixadas
    droppable: () => this.special().map((x) => x.key).reverse(),
  });
  protected readonly layout = this.fit.layout;

  /** O mural de músicas: as abas são dos artistas. */
  protected readonly music = this.view.music;
  /** O desenho das abas dos artistas (o microfone); nas anotações, cada categoria tem o dela. */
  protected readonly glyph = computed(() => (this.music() ? ICON.vocal : null));

  /** O desenho e a cor da categoria: os que o dono do mural escolheu (sem escolha, o de sempre). */
  protected lookOf(x: NoteTab): CategoryLook {
    // o artista não é categoria de anotação: não pega o jeito de uma de mesmo nome; a cor vem do nome dele
    if (this.music()) return x.key === NO_CATEGORY_TAB ? {} : { color: bandColor(x.label) };
    return this.view.categoryLooks()[lookKey(x.label)] ?? {};
  }
  protected colorOf(x: NoteTab): string | null {
    return categoryColorHex(this.lookOf(x).color);
  }

  /** As especiais em pé e as que foram para o "Mais" por falta de lugar. */
  protected readonly specialShown = computed(() => this.special().filter((x) => !this.layout().leadMore.includes(x.key)));

  /** O "Mais": os grupos que não couberam em pé, com o desenho e a cor de cada um. */
  protected readonly moreGroups = computed<TabMoreItem[]>(() =>
    this.layout().more.map((x) => ({ key: x.key, label: x.label, n: x.n, look: this.lookOf(x), glyph: this.glyph(), plain: x.key === NONE_TAB })),
  );
  /**
   * E, depois da costura, as abas que o mural gera e que não estão em pé: o Tudo (sem o olho), as
   * especiais com o olho desligado e as que foram para o "Mais" por falta de lugar.
   */
  protected readonly moreAutos = computed<TabMoreItem[]>(() => {
    if (this.music()) return [];
    const t = this.tabs();
    const out: TabMoreItem[] = [];
    if (!this.allShown() && t) out.push({ key: ALL_TAB, label: 'Tudo', n: t.all, look: this.autoLook('tudo'), glyph: ICON.camadas });
    const standing = new Set(this.specialShown().map((x) => x.key));
    for (const x of this.view.specialTabs()) {
      if (!standing.has(x.key)) out.push({ key: x.key, label: x.label, n: x.n, look: this.autoLook(autoOf(x.key)), glyph: this.iconOf(x.key) });
    }
    return out;
  });

  /** A aba aberta é uma das do "Mais": ele mostra o nome dela, como aba aberta. */
  protected readonly moreOn = computed(() => [...this.moreGroups(), ...this.moreAutos()].some((x) => x.key === this.active()));
  protected readonly moreCount = computed(() => [...this.moreGroups(), ...this.moreAutos()].find((x) => x.key === this.active())?.n ?? 0);

  /** A cor da etiqueta de uma aba que o mural gera (nas configurações do mural). */
  private autoLook(k: AutoTab): CategoryLook {
    const color = this.view.autoColors()[k];
    return color ? { color } : {};
  }
  protected autoColor(key: string): string | null {
    return categoryColorHex(this.autoLook(autoOf(key)).color);
  }

  protected choose(key: string): void {
    if (key === this.active()) return;
    this.motion.run(() => this.view.setNoteTab(key));
  }
}
