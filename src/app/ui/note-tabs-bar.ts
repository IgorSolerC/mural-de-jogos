import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { WallMotion } from '../core/wall-motion';
import { WallView } from '../core/wall-view';
import { ALL_TAB, NO_CATEGORY_TAB } from '../core/note-tabs';

/**
 * As abas do mural de anotações (ver core/note-tabs.ts): divisórias de pasta de papel manilha, em
 * cima da régua. A aberta fica na frente, clara, emendada na borda da pasta; as outras ficam atrás,
 * mais escuras. As categorias pequenas ficam no "Mais" (um <select> invisível sobre a aba, como o
 * Ordenar). No celular, a fileira corre de lado e a aba aberta vem para a vista.
 */
@Component({
  selector: 'app-note-tabs',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tabs(); as t) {
      <div class="abas" role="group" aria-label="Categorias das anotações">
        <button type="button" class="aba" [class.on]="active() === ALL" [attr.aria-pressed]="active() === ALL" (click)="choose(ALL)">
          <span class="nome">Tudo</span><span class="n">{{ t.all }}</span>
        </button>
        @for (x of t.main; track x.key) {
          <button
            type="button"
            class="aba"
            [class.on]="active() === x.key"
            [class.sem]="x.key === NONE"
            [attr.aria-pressed]="active() === x.key"
            [title]="x.label"
            (click)="choose(x.key)"
          >
            <span class="nome">{{ x.label }}</span><span class="n">{{ x.n }}</span>
          </button>
        }
        @if (t.more.length) {
          <label class="aba mais" [class.on]="moreOn()">
            <span class="nome">{{ moreOn() ? activeLabel() : 'Mais' }}</span>
            @if (moreOn()) {
              <span class="n">{{ moreCount() }}</span>
            }
            <lucide-icon class="chev" [img]="ChevronIcon" [size]="15" [strokeWidth]="2.8" aria-hidden="true" />
            <select aria-label="Mais categorias" (change)="choose($any($event.target).value)">
              <option value="" disabled [selected]="!moreOn()">Mais categorias</option>
              @for (x of t.more; track x.key) {
                <option [value]="x.key" [selected]="active() === x.key">{{ x.label }} ({{ x.n }})</option>
              }
            </select>
          </label>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      /* a borda da pasta: a aba aberta emenda nela */
      --manilha: #f3e5bb;
      --manilha-atras: #ae9a6c;
      --borda: 7px;
    }
    :host::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: var(--borda);
      border-radius: 1px;
      background-color: var(--manilha);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow: 0 5px 9px -4px rgb(0 0 0 / 0.55);
    }

    .abas {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-end;
      gap: 3px;
      padding: 6px 12px 0;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
    }

    .aba {
      position: relative;
      flex: none;
      display: inline-flex;
      align-items: baseline;
      gap: 7px;
      min-height: 40px;
      margin-bottom: var(--borda);
      padding: 10px 16px 7px;
      border: 0;
      border-radius: 10px 10px 0 0;
      background-color: var(--manilha-atras);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: var(--ink);
      box-shadow: inset 0 -5px 6px -5px rgb(0 0 0 / 0.35);
      cursor: pointer;
      white-space: nowrap;
      translate: 0 3px;
      transition:
        translate var(--t-ui) var(--ease-ui),
        background-color var(--t-ui) var(--ease-ui);

      &:hover:not(.on) {
        background-color: #c7b385;
        translate: 0 0;
      }

      &:focus-visible,
      &:has(select:focus-visible) {
        outline: 3px solid var(--focus);
        outline-offset: -3px;
      }

      /* a aberta: na frente, clara, emendada na borda da pasta */
      &.on {
        z-index: 1;
        margin-bottom: 0;
        padding-top: 13px;
        padding-bottom: calc(7px + var(--borda));
        background-color: var(--manilha);
        box-shadow: none;
        translate: 0 0;
      }
    }

    .nome {
      max-width: 16ch;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--f-marker);
      font-size: 1.08rem;
      line-height: 1.1;
    }

    .aba:not(.on) .nome {
      opacity: 0.82;
    }

    .n {
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.92rem;
      letter-spacing: 0.04em;
      opacity: 0.62;
      font-variant-numeric: tabular-nums;
    }
    /* na aba de trás, mais escura, o número precisa de mais tinta para continuar legível */
    .aba:not(.on) .n {
      opacity: 0.85;
    }

    /* "Sem categoria" escrito a lápis, não a pincel: não é uma categoria */
    .sem .nome {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.05rem;
    }

    .mais {
      padding-right: 32px;

      .chev {
        position: absolute;
        right: 11px;
        top: calc(50% - 6px);
        display: inline-flex;
      }
      &.on .chev {
        top: calc(50% - 6px - var(--borda) / 2);
      }

      select {
        position: absolute;
        inset: 0;
        width: 100%;
        opacity: 0;
        cursor: pointer;
        font-size: 16px;
        color-scheme: light;
        color: var(--ink);
        background-color: var(--paper);
      }
    }

    @media (max-width: 720px) {
      .abas {
        padding-inline: 6px;
      }
      .aba {
        padding-inline: 13px;
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
  private readonly view = inject(WallView);
  private readonly motion = inject(WallMotion);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly ChevronIcon = ChevronDown;
  protected readonly ALL = ALL_TAB;
  protected readonly NONE = NO_CATEGORY_TAB;

  /** As abas, só quando há o que separar. */
  protected readonly tabs = computed(() => {
    const t = this.view.noteTabs();
    return t && (t.main.length || t.more.length) ? t : null;
  });
  protected readonly active = this.view.activeTab;
  protected readonly activeLabel = this.view.activeTabLabel;
  /** A aba aberta é uma das do "Mais": ele mostra o nome dela, como aba aberta. */
  protected readonly moreOn = computed(() => !!this.tabs()?.more.some((x) => x.key === this.active()));
  protected readonly moreCount = computed(() => this.tabs()?.more.find((x) => x.key === this.active())?.n ?? 0);

  constructor() {
    // no celular a fileira corre de lado: a aba aberta vem para a vista
    afterRenderEffect(() => {
      this.active();
      const on = this.host.querySelector<HTMLElement>('.aba.on');
      const row = on?.parentElement;
      if (!on || !row || row.scrollWidth <= row.clientWidth) return;
      const left = on.offsetLeft;
      if (left < row.scrollLeft || left + on.offsetWidth > row.scrollLeft + row.clientWidth) {
        row.scrollTo({ left: left - 24, behavior: 'instant' });
      }
    });
  }

  protected choose(key: string): void {
    if (key === this.active()) return;
    this.motion.run(() => this.view.setNoteTab(key));
  }
}
