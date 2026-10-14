import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { BookOpen, ChevronDown, Disc3, Film, Gamepad2, LucideAngularModule, LucideIconData, Origami, StickyNote, Tv } from 'lucide-angular';
import { reviewPath, reviewPlace } from '../core/areas';
import { Kind, SCORED_KINDS, cap, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { SideBySide } from '../core/side-by-side';
import { ViewTransitions } from '../core/view-transitions';
import { WallView } from '../core/wall-view';

export const KIND_ICON: Record<Kind, LucideIconData> = {
  jogos: Gamepad2,
  livros: BookOpen,
  filmes: Film,
  series: Tv,
  animes: Origami,
  musicas: Disc3,
  anotacoes: StickyNote,
};

let uid = 0;

/**
 * O seletor de mural das páginas que dependem dele (as Análises, os Extras, Amigos separado por
 * mural): uma etiqueta de papel com o desenho e o nome do mural, escrito a pincel com o risco
 * vermelho (o mesmo que a palavra tinha no cartaz). Tocar nela abre o bloquinho com os murais;
 * escolher um troca a parede inteira na mesma página. Nas Análises o mural mora no endereço, então a
 * troca também vai para o endereço do mural escolhido, na mesma seção.
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
      <lucide-icon class="ico-mural" [img]="icon()" [size]="20" [strokeWidth]="2.4" aria-hidden="true" />
      <span class="nome-mural scribble">{{ label() }}</span>
      <lucide-icon class="chev" [img]="ChevronIcon" [size]="18" [strokeWidth]="3.2" aria-hidden="true" />
    </button>

    @if (open()) {
      <div class="bloco" role="menu" [id]="menuId" aria-label="Murais" (keydown)="onMenuKey($event)">
        @for (o of options(); track o.kind) {
          <button
            type="button"
            role="menuitemradio"
            class="item"
            [attr.aria-checked]="o.on"
            tabindex="-1"
            (mousedown)="$event.preventDefault()"
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

    /* A etiqueta do mural: um pedaço de papel creme colado na parede, um tico torto, com o desenho do
       mural, o nome a pincel sublinhado de vermelho e a setinha que diz que ela abre */
    .palavra {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-height: 46px;
      padding: 8px 12px;
      border: 0;
      border-radius: 2px;
      background-color: var(--paper);
      background-image: var(--paper-grain);
      background-size: 220px;
      background-blend-mode: multiply;
      color: var(--ink);
      font-family: var(--f-marker);
      font-size: 1.3rem;
      line-height: 1;
      letter-spacing: 0.005em;
      white-space: nowrap;
      rotate: -1.4deg;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.3),
        0 10px 14px -7px rgb(0 0 0 / 0.7);
      cursor: pointer;
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical),
        box-shadow var(--t-ui) var(--ease-ui);
    }
    .palavra:hover,
    .palavra[aria-expanded='true'] {
      rotate: -0.4deg;
      translate: 0 -1px;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.25),
        0 14px 18px -7px rgb(0 0 0 / 0.7);
    }
    .palavra:active {
      translate: 0 1px;
    }
    .palavra:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 4px;
    }
    .ico-mural,
    .chev {
      display: inline-flex;
    }
    .nome-mural {
      /* o risco de pincel passa um pouco da palavra: folga para ele não encostar na setinha */
      margin-right: 4px;
      translate: 0 1px;
    }
    .chev {
      transition: rotate var(--t-ui) var(--ease-ui);
    }
    .palavra[aria-expanded='true'] .chev {
      rotate: 180deg;
    }

    /* O bloquinho: folha de papel presa embaixo da etiqueta, um mural por linha, escrito a pincel */
    .bloco {
      position: absolute;
      top: calc(100% + 12px);
      left: -6px;
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
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  /** Os murais do bloquinho: os de resenhas (em Amigos, também o de anotações). */
  readonly kinds = input<readonly Kind[]>(SCORED_KINDS);

  protected readonly ChevronIcon = ChevronDown;
  protected readonly menuId = `murais-${++uid}`;
  protected readonly open = signal(false);

  protected readonly icon = computed(() => KIND_ICON[this.mural.kind()]);
  protected readonly label = computed(() => cap(this.mural.profile().plural));

  protected readonly options = computed(() =>
    this.kinds().map((kind) => ({
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
    // nas Análises o mural mora no endereço: troca na hora (para a animação) e o endereço vem atrás
    // (a transição mede a troca uma vez às escondidas e desfaz: nessa vez o endereço não muda)
    const place = reviewPlace(this.router.url);
    let measuring = false;
    this.vt.run(
      () => {
        this.side.picking.set(false);
        this.view.clearFilters();
        this.mural.kind.set(kind);
        if (place && !measuring) void this.router.navigateByUrl(reviewPath(kind, place.section));
      },
      () => {
        measuring = true;
        const picking = this.side.picking(),
          kind = this.mural.kind(),
          view = this.view.snapshot();
        return () => {
          measuring = false;
          this.side.picking.set(picking);
          this.mural.kind.set(kind);
          view();
        };
      },
    );
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.show(e.key === 'ArrowUp' ? this.kinds().length - 1 : undefined);
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
