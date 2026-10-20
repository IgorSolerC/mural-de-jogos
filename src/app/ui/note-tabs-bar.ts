import { ChangeDetectionStrategy, Component, ElementRef, computed, inject } from '@angular/core';
import { ICON, IconModule } from './icons';
import { WallMotion } from '../core/wall-motion';
import { WallState } from '../core/wall-view';
import { ALL_TAB, NO_CATEGORY_TAB, NoteTab } from '../core/note-tabs';
import { CategoryLook, bandColor, categoryColorHex, lookKey } from '../core/category-looks';
import { CategoryLabel } from './category-label';
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
  imports: [IconModule, CategoryLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tabs(); as t) {
      <div class="abas" role="group" [attr.aria-label]="music() ? 'Artistas' : 'Grupos das anotações'">
        @if (allShown()) {
          <button type="button" class="aba" [class.on]="active() === ALL" [attr.aria-pressed]="active() === ALL" (click)="choose(ALL)">
            <span class="nome">Tudo</span><span class="n">{{ t.all }}</span>
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
        @if (layout().more.length) {
          <label class="aba mais" [class.on]="moreOn()">
            <span class="nome">{{ moreOn() ? activeLabel() : 'Mais' }}</span>
            @if (moreOn()) {
              <span class="n">{{ moreCount() }}</span>
            }
            <lucide-icon class="chev" [img]="ChevronIcon" [size]="15" aria-hidden="true" />
            <select [attr.aria-label]="music() ? 'Mais artistas' : 'Mais grupos'" (change)="choose($any($event.target).value)">
              <option value="" disabled [selected]="!moreOn()">{{ music() ? 'Mais artistas' : 'Mais grupos' }}</option>
              @for (x of layout().more; track x.key) {
                <option [value]="x.key" [selected]="active() === x.key">{{ x.label }} ({{ x.n }})</option>
              }
            </select>
          </label>
        }
      </div>

      <!-- a régua de medir: todas as abas, escondidas, para saber quantas cabem em pé -->
      <div class="abas medida" aria-hidden="true">
        @if (allShown()) {
          <span class="aba" data-k="tudo"><span class="nome">Tudo</span><span class="n">{{ t.all }}</span></span>
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

      select {
        @include kit.select-por-cima;
      }
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
  protected readonly ALL = ALL_TAB;
  protected readonly NONE = NO_CATEGORY_TAB;

  /** As abas, só quando há o que separar. */
  protected readonly tabs = computed(() => {
    const t = this.view.noteTabs();
    return t && t.tabs.length ? t : null;
  });
  protected readonly active = this.view.activeTab;
  protected readonly activeLabel = this.view.activeTabLabel;

  /** O Tudo em pé (ver `WallState.allTabShown`). */
  protected readonly allShown = this.view.allTabShown;

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
    lead: () => (this.allShown() ? 'tudo' : null),
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

  /** A aba aberta é uma das do "Mais": ele mostra o nome dela, como aba aberta. */
  protected readonly moreOn = computed(() => this.layout().more.some((x) => x.key === this.active()));
  protected readonly moreCount = computed(() => this.layout().more.find((x) => x.key === this.active())?.n ?? 0);

  protected choose(key: string): void {
    if (key === this.active()) return;
    this.motion.run(() => this.view.setNoteTab(key));
  }
}
