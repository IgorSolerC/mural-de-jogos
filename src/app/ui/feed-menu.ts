import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { BellOff, ChevronDown, GalleryVerticalEnd, LucideAngularModule } from 'lucide-angular';
import { closeOnOutsidePress } from './outside-press';

let uid = 0;

/**
 * A outra metade do botão de pregar: a setinha colada ao lado de "Pregar no mural", separada dele
 * pelo picote, que abre um bilhetinho com o outro caminho, o de menos destaque. Pregar publica (vai
 * para o mural e para o Feed de quem segue); daqui sai a ficha que vai só para o mural, sem aviso, ou
 * a que estava assim e agora vai para o Feed. Como o "Criar rascunho" ao lado de "Criar" no GitHub.
 *
 * O bilhete abre para cima (a setinha mora no rodapé da ficha) e fica preso na beirada direita do
 * botão inteiro: quem usa põe o botão e a setinha dentro de um mesmo contêiner posicionado.
 */
@Component({
  selector: 'app-feed-menu',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="seta"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="menuId"
      [attr.aria-label]="'Outro jeito de ' + verb()"
      [title]="'Outro jeito de ' + verb()"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <lucide-icon class="chev" [img]="ChevronIcon" [size]="20" [strokeWidth]="3" aria-hidden="true" />
    </button>

    @if (open()) {
      <div class="bilhete" role="menu" [id]="menuId" [attr.aria-label]="'Outro jeito de ' + verb()" (keydown)="onMenuKey($event)">
        <button type="button" role="menuitem" class="item" tabindex="-1" (mousedown)="$event.preventDefault()" (click)="choose()">
          <lucide-icon class="ico" [img]="announce() ? FeedIcon : QuietIcon" [size]="20" [strokeWidth]="2.4" aria-hidden="true" />
          <span class="nome">{{ label() }}</span>
          <span class="dica">{{ hint() }}</span>
        </button>
      </div>
    }
  `,
  styles: `
    /* sem posição própria: o bilhete se prende no contêiner do botão inteiro (ver acima) */
    :host {
      display: contents;
    }

    /* A setinha: o mesmo pincel do botão, do outro lado do picote */
    .seta {
      flex: none;
      display: grid;
      place-items: center;
      width: 46px;
      min-height: 50px;
      padding: 0;
      border: 0;
      border-left: 2px dashed rgb(247 244 236 / 0.4);
      border-radius: 0 3px 3px 0;
      background: var(--ink);
      color: var(--hi);
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .seta:hover,
    .seta[aria-expanded='true'] {
      background: color-mix(in srgb, var(--ink) 86%, #fff);
    }
    .seta:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 3px;
    }
    .chev {
      display: inline-flex;
      transition: rotate var(--t-ui) var(--ease-ui);
    }
    .seta[aria-expanded='true'] .chev {
      rotate: 180deg;
    }

    /* O bilhete: uma folhinha de bloco presa acima do botão, um tico torta, com o outro caminho */
    .bilhete {
      position: absolute;
      right: -4px;
      bottom: calc(100% + 12px);
      z-index: 30;
      display: grid;
      width: min(360px, calc(100vw - 40px));
      padding: 12px 8px 8px;
      /* branco de bloquinho, um tom acima do creme da ficha, para soltar dela */
      background: #fffdf8;
      color: var(--ink);
      rotate: -1deg;
      transform-origin: 90% 100%;
      /* serrilhado na beirada de cima: arrancada do bloquinho */
      -webkit-mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
      mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
      filter: drop-shadow(0 10px 14px rgb(0 0 0 / 0.45));
      animation: sobe var(--t-physical) var(--ease-physical);
    }
    @keyframes sobe {
      from {
        clip-path: inset(100% 0 0 0);
        translate: 0 8px;
      }
    }
    .item {
      display: grid;
      grid-template-columns: 26px 1fr;
      grid-template-areas: 'ico nome' '. dica';
      align-items: center;
      gap: 4px 10px;
      min-height: 46px;
      padding: 10px 12px 10px 10px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--ink);
      text-align: left;
      cursor: pointer;
    }
    .item:hover,
    .item:focus-visible {
      background: rgb(21 21 21 / 0.08);
      outline: none;
    }
    .item:focus-visible {
      box-shadow: inset 0 0 0 2px rgb(21 21 21 / 0.55);
    }
    .ico {
      grid-area: ico;
      display: inline-flex;
      justify-self: center;
    }
    .nome {
      grid-area: nome;
      font-family: var(--f-marker);
      font-size: 1.15rem;
      line-height: 1.1;
    }
    .dica {
      grid-area: dica;
      font-size: 0.9rem;
      line-height: 1.4;
      color: var(--ink-2);
      text-wrap: pretty;
    }

    @media (prefers-reduced-motion: reduce) {
      .bilhete {
        animation: none;
      }
    }
  `,
})
export class FeedMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  /** O verbo do botão ao lado ("pregar", "salvar"), para o nome da setinha. */
  readonly verb = input('pregar');
  /** O outro caminho, escrito no bilhete ("Pregar sem publicar no Feed"). */
  readonly label = input.required<string>();
  /** O que acontece, em uma frase, embaixo do nome. */
  readonly hint = input('');
  /** O outro caminho publica no Feed (a ficha estava fora dele)? Muda só o desenho. */
  readonly announce = input(false);
  /** Escolheu o outro caminho. */
  readonly picked = output<void>();

  protected readonly ChevronIcon = ChevronDown;
  protected readonly QuietIcon = BellOff;
  protected readonly FeedIcon = GalleryVerticalEnd;
  protected readonly menuId = `outro-jeito-${++uid}`;
  protected readonly open = signal(false);

  constructor() {
    closeOnOutsidePress(this.open, this.host, () => this.close(false));
  }

  protected toggle(): void {
    if (this.open()) this.close(true);
    else this.show();
  }

  protected choose(): void {
    this.close(true);
    this.picked.emit();
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.show();
    }
  }

  protected onMenuKey(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        // um caminho só: as setas ficam nele
        e.preventDefault();
        break;
      case 'Escape':
        // fecha só o bilhete, não a ficha (o diálogo fecharia com o Esc)
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  protected onFocusOut(e: FocusEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.relatedTarget as Node | null)) this.close(false);
  }

  private show(): void {
    this.open.set(true);
    setTimeout(() => this.host.nativeElement.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
  }

  private close(refocus: boolean): void {
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }
}
