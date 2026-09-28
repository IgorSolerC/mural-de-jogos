import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { BookOpen, ChevronDown, Film, Gamepad2, LucideAngularModule, LucideIconData, Origami, Tv } from 'lucide-angular';
import { KINDS, Kind, cap, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { SideBySide } from '../core/side-by-side';
import { ViewTransitions } from '../core/view-transitions';
import { WallView } from '../core/wall-view';

const KIND_ICON: Record<Kind, LucideIconData> = {
  jogos: Gamepad2,
  livros: BookOpen,
  filmes: Film,
  series: Tv,
  animes: Origami,
};

let uid = 0;

/**
 * A palavra do cartaz: "Meu mural de *jogos*". Tocar nela abre um bloquinho com os outros murais;
 * escolher um troca a parede inteira (fichas, fila, ranking e lado a lado), na mesma página.
 */
@Component({
  selector: 'app-kind-switcher',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onOutside($event)',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="palavra"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="menuId"
      [attr.aria-label]="'Mural de ' + mural.profile().plural + '. Trocar de mural'"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <span class="scribble">{{ mural.profile().plural }}</span>
      <lucide-icon class="chev" [img]="ChevronIcon" [size]="20" [strokeWidth]="3.2" aria-hidden="true" />
    </button>

    @if (open()) {
      <div class="bloco" role="menu" [id]="menuId" aria-label="Murais" (keydown)="onMenuKey($event)">
        @for (o of options(); track o.kind; let i = $index) {
          <button
            type="button"
            role="menuitemradio"
            class="item"
            [attr.aria-checked]="o.on"
            [attr.data-i]="i"
            tabindex="-1"
            (click)="choose(o.kind)"
          >
            <lucide-icon class="ico" [img]="o.icon" [size]="20" [strokeWidth]="2.4" aria-hidden="true" />
            <span class="nome" [class.scribble]="o.on">{{ o.label }}</span>
            @if (o.n) {
              <span class="n" aria-hidden="true">{{ o.n }}</span>
              <span class="sr-only">({{ o.n }})</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }

    /* A palavra continua sendo a do cartaz, com o sublinhado de pincel; a setinha diz que ela abre */
    .palavra {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin: -4px -6px;
      padding: 4px 6px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: inherit;
      letter-spacing: inherit;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .palavra:hover,
    .palavra[aria-expanded='true'] {
      background: rgb(21 21 21 / 0.08);
    }
    .palavra:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 1px;
    }
    .chev {
      display: inline-flex;
      translate: 0 3px;
      transition: rotate var(--t-ui) var(--ease-ui);
    }
    .palavra[aria-expanded='true'] .chev {
      rotate: 180deg;
    }

    /* O bloquinho: folha de papel presa embaixo do cartaz, um mural por linha, escrito a pincel */
    .bloco {
      position: absolute;
      top: calc(100% + 14px);
      left: -14px;
      z-index: 30;
      display: grid;
      min-width: 220px;
      padding: 10px 8px 16px;
      background: var(--paper);
      color: var(--ink);
      rotate: 1.2deg;
      /* serrilhado do bloquinho na borda de baixo, como o bilhete dos avisos */
      -webkit-mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
      mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
      filter: drop-shadow(0 10px 14px rgb(0 0 0 / 0.5));
      animation: sai var(--t-physical) var(--ease-physical);
    }
    @keyframes sai {
      from {
        clip-path: inset(0 0 100% 0);
        translate: 0 -8px;
      }
    }
    .item {
      display: grid;
      grid-template-columns: 26px 1fr auto;
      align-items: center;
      gap: 10px;
      min-height: 46px;
      padding: 6px 12px 6px 10px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--ink);
      font-family: var(--f-marker);
      font-size: 1.3rem;
      line-height: 1;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
    }
    .item:hover,
    .item:focus-visible {
      background: rgb(21 21 21 / 0.08);
      outline: none;
    }
    .item:focus-visible {
      box-shadow: inset 0 0 0 2.5px var(--ink);
    }
    .ico {
      display: inline-flex;
      justify-self: center;
    }
    .nome {
      position: relative;
      isolation: isolate;
      justify-self: start;
    }
    .n {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.06em;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }

    @media (max-width: 720px) {
      .bloco {
        left: -8px;
      }
      .chev {
        translate: 0 2px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bloco {
        animation: none;
      }
    }
  `,
})
export class KindSwitcher {
  protected readonly mural = inject(Mural);
  private readonly view = inject(WallView);
  private readonly side = inject(SideBySide);
  private readonly vt = inject(ViewTransitions);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly ChevronIcon = ChevronDown;
  protected readonly menuId = `murais-${++uid}`;
  protected readonly open = signal(false);

  protected readonly options = computed(() =>
    KINDS.map((kind) => ({
      kind,
      label: cap(profileOf(kind).plural),
      icon: KIND_ICON[kind],
      n: this.mural.counts()[kind],
      on: kind === this.mural.kind(),
    })),
  );

  protected toggle(): void {
    if (this.open()) this.close(true);
    else this.show();
  }

  protected choose(kind: Kind): void {
    this.close(true);
    if (kind === this.mural.kind()) return;
    this.vt.run(() => {
      this.side.picking.set(false);
      this.view.clearFilters();
      this.mural.kind.set(kind);
    });
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.show(e.key === 'ArrowUp' ? KINDS.length - 1 : undefined);
    }
  }

  protected onMenuKey(e: KeyboardEvent): void {
    const items = this.items();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        go(i + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        go(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        go(0);
        break;
      case 'End':
        e.preventDefault();
        go(items.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  protected onOutside(e: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close(false);
  }

  protected onFocusOut(e: FocusEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.relatedTarget as Node | null)) this.close(false);
  }

  /** Abre com o foco no mural aberto (ou no pedido pelas setas). */
  private show(at?: number): void {
    this.open.set(true);
    setTimeout(() => {
      const items = this.items();
      const on = items.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      items[at ?? Math.max(0, on)]?.focus();
    });
  }

  private close(refocus: boolean): void {
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

  private items(): HTMLButtonElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  }
}
