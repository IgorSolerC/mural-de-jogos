import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from './icons';
import { closeOnOutsidePress } from './outside-press';

let uid = 0;

/** Um caminho do bilhete do "Mais". */
export interface MoreItem {
  id: string;
  label: string;
  icon: LucideIconData;
  /** Um ligar e desligar (Lado a lado): ligado ou não, para o leitor de tela; o desenho é quem mostra. */
  pressed?: boolean;
  /** Apagar, sair: vai por último, depois de um risco, na tinta vermelha. */
  danger?: boolean;
  /** Abre outra folha (Compartilhar). */
  dialog?: boolean;
  /** O que acontece, para quem para o mouse em cima ("Marcar pra comparar com outros jogos"). */
  hint?: string;
}

/**
 * O "Mais" do pé de uma folha: as ações de vez em quando (fixar, compartilhar, escrever outra vez,
 * apagar) guardadas num bilhetinho de bloco, para o pé ficar só com o que se usa toda hora. O
 * bilhete é o mesmo do "Outro jeito de pregar" (ui/feed-menu.ts): branco de bloquinho, serrilhado em
 * cima, um tico torto, e abre para cima, preso na beirada esquerda do botão.
 */
@Component({
  selector: 'app-more-menu',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="btn-quiet mais"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="menuId"
      [attr.aria-label]="label()"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <lucide-icon [img]="MoreIcon" [size]="20" aria-hidden="true" />
      <span class="mais-txt">Mais</span>
    </button>

    @if (open()) {
      <div class="bilhete" role="menu" [id]="menuId" [attr.aria-label]="label()" (keydown)="onMenuKey($event)">
        @for (item of items(); track item.id) {
          <button
            type="button"
            class="item"
            [class.perigo]="item.danger"
            [attr.role]="item.pressed === undefined ? 'menuitem' : 'menuitemcheckbox'"
            [attr.aria-checked]="item.pressed === undefined ? null : item.pressed"
            [attr.aria-haspopup]="item.dialog ? 'dialog' : null"
            [attr.title]="item.hint ?? null"
            tabindex="-1"
            (mousedown)="$event.preventDefault()"
            (click)="choose(item)"
          >
            <lucide-icon class="ico" [img]="item.icon" [size]="20" aria-hidden="true" />
            <span class="nome">{{ item.label }}</span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    /* o bilhete se prende neste contêiner, que fica do tamanho do botão */
    :host {
      position: relative;
      display: inline-flex;
    }

    .mais {
      gap: 6px;
    }
    .mais[aria-expanded='true'] {
      background: rgb(21 21 21 / 0.1);
    }

    /* O bilhete: a folhinha de bloco do "Outro jeito de pregar", aberta para cima */
    .bilhete {
      position: absolute;
      left: -6px;
      bottom: calc(100% + 10px);
      z-index: 30;
      display: grid;
      width: max-content;
      min-width: 236px;
      max-width: min(320px, calc(100vw - 40px));
      padding: 14px 8px 8px;
      background: #fffdf8;
      color: var(--ink);
      rotate: -1deg;
      transform-origin: 10% 100%;
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
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 8px 12px 8px 10px;
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

    /* o que apaga vem por último, depois do risco a caneta, na tinta vermelha */
    .item.perigo {
      color: var(--red-deep);
    }
    .item:not(.perigo) + .item.perigo {
      margin-top: 9px;
      position: relative;
    }
    .item:not(.perigo) + .item.perigo::before {
      content: '';
      position: absolute;
      inset: -6px 6px auto;
      border-top: 1.5px dashed rgb(21 21 21 / 0.28);
    }

    .ico {
      display: inline-flex;
      justify-self: center;
    }
    .nome {
      font-family: var(--f-marker);
      font-size: 1.1rem;
      line-height: 1.1;
    }

    @media (max-width: 420px) {
      .mais-txt {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bilhete {
        animation: none;
      }
    }
  `,
})
export class MoreMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  readonly items = input.required<readonly MoreItem[]>();
  /** O nome do botão para o leitor de tela ("Mais ações da anotação"). */
  readonly label = input('Mais ações');
  /** Escolheu um caminho: o id dele. */
  readonly picked = output<string>();

  protected readonly MoreIcon = ICON.maisOpcoes;
  protected readonly menuId = `mais-${++uid}`;
  protected readonly open = signal(false);

  constructor() {
    closeOnOutsidePress(this.open, this.host, () => this.close(false));
  }

  protected toggle(): void {
    if (this.open()) this.close(true);
    else this.show(0);
  }

  protected choose(item: MoreItem): void {
    // o foco volta para o botão antes: a ação pode abrir outra folha, que devolve o foco para ele
    this.close(true);
    this.picked.emit(item.id);
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.show(e.key === 'ArrowUp' ? -1 : 0);
    }
  }

  protected onMenuKey(e: KeyboardEvent): void {
    const all = this.entries();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        all[(at + 1) % all.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        all[(at - 1 + all.length) % all.length]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        all[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        all.at(-1)?.focus();
        break;
      case 'Escape':
        // fecha só o bilhete, não a folha (o diálogo fecharia com o Esc)
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

  private entries(): HTMLButtonElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.item')];
  }

  /** Abre com o foco no primeiro caminho (ou no último, pela seta para cima). */
  private show(at: number): void {
    this.open.set(true);
    setTimeout(() => this.entries().at(at)?.focus());
  }

  private close(refocus: boolean): void {
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }
}
