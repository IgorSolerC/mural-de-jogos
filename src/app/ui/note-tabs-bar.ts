import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, signal } from '@angular/core';
import { ChevronDown, LucideAngularModule } from 'lucide-angular';
import { WallMotion } from '../core/wall-motion';
import { WallView } from '../core/wall-view';
import { ALL_TAB, NO_CATEGORY_TAB, NoteTab, splitTabs } from '../core/note-tabs';

/** O vão entre duas abas (o `gap` da fileira). */
const GAP = 3;

/**
 * As abas do mural de anotações (ver core/note-tabs.ts): divisórias de pasta de papel manilha, em
 * cima da pasta. A aberta fica na frente, clara, emendada na borda da pasta; as outras ficam atrás,
 * mais escuras. Toda categoria fica em pé enquanto couber na largura (e até oito abas, contando
 * Tudo); as que sobram, as com menos anotações, vão para o "Mais" (um <select> invisível sobre a aba,
 * como o Ordenar). Para saber o que cabe, uma fileira escondida mede cada aba de verdade.
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
        @for (x of layout().shown; track x.key) {
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
        @if (layout().more.length) {
          <label class="aba mais" [class.on]="moreOn()">
            <span class="nome">{{ moreOn() ? activeLabel() : 'Mais' }}</span>
            @if (moreOn()) {
              <span class="n">{{ moreCount() }}</span>
            }
            <lucide-icon class="chev" [img]="ChevronIcon" [size]="15" [strokeWidth]="2.8" aria-hidden="true" />
            <select aria-label="Mais categorias" (change)="choose($any($event.target).value)">
              <option value="" disabled [selected]="!moreOn()">Mais categorias</option>
              @for (x of layout().more; track x.key) {
                <option [value]="x.key" [selected]="active() === x.key">{{ x.label }} ({{ x.n }})</option>
              }
            </select>
          </label>
        }
      </div>

      <!-- a régua de medir: todas as abas, escondidas, para saber quantas cabem em pé -->
      <div class="abas medida" aria-hidden="true">
        <span class="aba" data-k="tudo"><span class="nome">Tudo</span><span class="n">{{ t.all }}</span></span>
        @for (x of t.tabs; track x.key) {
          <span class="aba" [class.sem]="x.key === NONE" [attr.data-k]="x.key"><span class="nome">{{ x.label }}</span><span class="n">{{ x.n }}</span></span>
        }
        <span class="aba mais" data-k="mais"><span class="nome">Mais</span></span>
      </div>
    }
  `,
  styles: `
    /* As camadas: as abas de trás (0) ficam atrás da borda da pasta (1), que passa por cima do pé
       delas; só a aberta (2) vem para a frente, emendada na borda. */
    :host {
      position: relative;
      isolation: isolate;
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
      z-index: 1;
      height: var(--borda);
      border-radius: 1px;
      background-color: var(--manilha);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      /* a sombra fina que a borda da pasta faz no pé das abas de trás */
      box-shadow: 0 -2px 3px -1px rgb(0 0 0 / 0.35);
    }

    .abas {
      position: relative;
      display: flex;
      align-items: flex-end;
      gap: 3px;
      padding: 6px 12px 0;
    }

    /* a régua de medir: no lugar, sem ocupar espaço nem aparecer */
    .medida {
      position: absolute;
      inset: 0 auto auto 0;
      visibility: hidden;
      pointer-events: none;
    }

    .aba {
      position: relative;
      z-index: 0;
      flex: none;
      display: inline-flex;
      align-items: baseline;
      gap: 7px;
      min-height: 40px;
      /* a de trás desce até o fundo: o pé dela fica escondido atrás da borda da pasta */
      padding: 10px 14px calc(7px + var(--borda));
      border: 0;
      border-radius: 10px 10px 0 0;
      background-color: var(--manilha-atras);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: var(--ink);
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
        z-index: 2;
        padding-top: 13px;
        background-color: var(--manilha);
        box-shadow: none;
        translate: 0 0;
        /* a cor muda na hora: ela já vem para a frente da borda da pasta, e o marrom de trás
           escorrendo para o claro aparecia por cima da borda por alguns quadros */
        transition: translate var(--t-ui) var(--ease-ui);
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
      /* a mesma altura de linha do nome: com o número, a aba ficava mais alta que o "Mais" */
      line-height: 1.1;
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

      /* no meio da parte que aparece (o pé fica atrás da borda da pasta) */
      .chev {
        position: absolute;
        right: 11px;
        top: calc(50% - 6px - var(--borda) / 2);
        display: inline-flex;
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
        padding-inline: 11px;
      }
      .mais {
        padding-right: 30px;
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
    return t && t.tabs.length ? t : null;
  });
  protected readonly active = this.view.activeTab;
  protected readonly activeLabel = this.view.activeTabLabel;

  /** A largura de cada aba, medida na régua escondida ("tudo", "mais" e a chave de cada categoria). */
  private readonly widths = signal<ReadonlyMap<string, number>>(new Map());
  /** A largura que a fileira tem para as abas. */
  private readonly room = signal(0);

  /** Quais ficam em pé e quais vão para o "Mais". Sem medida ainda, todas em pé (até o limite). */
  protected readonly layout = computed<{ shown: NoteTab[]; more: NoteTab[] }>(() => {
    const t = this.tabs();
    if (!t) return { shown: [], more: [] };
    const w = this.widths();
    const room = this.room();
    if (!room || !w.size) return splitTabs(t.tabs, this.active());
    const fits = (shown: readonly NoteTab[], more: boolean) => {
      let used = w.get('tudo') ?? 0;
      for (const x of shown) used += GAP + (w.get(x.key) ?? 0);
      if (more) used += GAP + (w.get('mais') ?? 0);
      return used <= room;
    };
    return splitTabs(t.tabs, this.active(), fits);
  });

  /** A aba aberta é uma das do "Mais": ele mostra o nome dela, como aba aberta. */
  protected readonly moreOn = computed(() => this.layout().more.some((x) => x.key === this.active()));
  protected readonly moreCount = computed(() => this.layout().more.find((x) => x.key === this.active())?.n ?? 0);

  constructor() {
    // a largura da fileira muda com a janela
    const ro = new ResizeObserver(() => this.measureRoom());
    ro.observe(this.host);
    inject(DestroyRef).onDestroy(() => ro.disconnect());

    // cada vez que as abas mudam (nome, número), a régua escondida mede de novo
    afterRenderEffect(() => {
      this.tabs();
      const next = new Map<string, number>();
      for (const el of Array.from(this.host.querySelectorAll<HTMLElement>('.medida [data-k]'))) {
        next.set(el.dataset['k']!, el.offsetWidth);
      }
      const now = this.widths();
      if (next.size !== now.size || [...next].some(([k, v]) => now.get(k) !== v)) this.widths.set(next);
      this.measureRoom();
    });
  }

  /** O espaço da fileira para as abas: a largura dela, sem o recuo dos lados. */
  private measureRoom(): void {
    const row = this.host.querySelector<HTMLElement>('.abas:not(.medida)');
    if (!row) return;
    const cs = getComputedStyle(row);
    const room = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (Math.abs(room - this.room()) > 0.5) this.room.set(room);
  }

  protected choose(key: string): void {
    if (key === this.active()) return;
    this.motion.run(() => this.view.setNoteTab(key));
  }
}
