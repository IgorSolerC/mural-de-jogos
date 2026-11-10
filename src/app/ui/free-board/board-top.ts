import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ICON, IconModule } from '../icons';

/**
 * O topo do quadro aberto, o mesmo no seu Quadro livre e na visita (a regra "Visita: as mesmas peças do dono",
 * no CLAUDE.md): a etiqueta de voltar, o nome a pincel na fita e, à direita, o que quem usa põe dentro (o
 * Editar e o Pronto do dono) e a tela cheia do navegador. Uma fileira só: o nome encolhe com reticências, nunca
 * passa por baixo dos botões.
 */
@Component({
  selector: 'app-free-board-top',
  imports: [IconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:fullscreenchange)': 'onFullscreenChange()' },
  template: `
    <div class="topo">
      <div class="topo-esq">
        @if (backPath(); as p) {
          <a class="tape-label voltar" [routerLink]="p" title="Voltar para a lista (Esc)">
            <lucide-icon [img]="Icons.voltar" [size]="18" aria-hidden="true" />
            <span class="sr-only">Voltar para a lista</span>
          </a>
        } @else {
          <button type="button" class="tape-label voltar" (click)="back.emit()" title="Voltar para a lista (Esc)">
            <lucide-icon [img]="Icons.voltar" [size]="18" aria-hidden="true" />
            <span class="sr-only">Voltar para a lista</span>
          </button>
        }
        <h2 class="nome-quadro" [title]="name()">{{ name() }}</h2>
      </div>
      <div class="topo-dir">
        <ng-content />
        <button
          type="button"
          class="tela-btn"
          (click)="toggleFullscreen()"
          [attr.aria-pressed]="fullscreen()"
          [title]="fullscreen() ? 'Sair da tela cheia' : 'Tela cheia de verdade (esconde as barras do navegador)'"
        >
          <lucide-icon [img]="fullscreen() ? Icons.sair : Icons.cheia" [size]="20" aria-hidden="true" />
          <span class="sr-only">{{ fullscreen() ? "Sair da tela cheia" : "Tela cheia" }}</span>
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    /* uma fileira por cima do quadro; o vão entre os dois lados continua sendo do quadro (arrastar anda) */
    .topo {
      position: absolute;
      top: 14px;
      left: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      pointer-events: none;
    }
    .topo-esq,
    .topo-dir {
      display: flex;
      align-items: center;
      gap: 14px;
      pointer-events: auto;
    }
    .topo-esq {
      min-width: 0;
    }
    .topo-dir {
      flex: none;
    }
    .voltar {
      flex: none;
      display: inline-grid;
      place-items: center;
      min-width: 48px;
      min-height: 44px;
      border: 0;
      cursor: pointer;
    }
    .voltar:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 3px;
    }
    /* o nome do quadro, a pincel na fita: o mesmo papel da etiqueta de voltar, mas parado */
    .nome-quadro {
      min-width: 0;
      margin: 0;
      padding: 6px 16px 4px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      background-color: var(--paper);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: var(--ink);
      font: 400 1.35rem / 1.15 var(--f-marker);
      rotate: 0.8deg;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.35),
        0 6px 10px -4px rgb(0 0 0 / 0.5);
    }
    .tela-btn {
      display: inline-grid;
      place-items: center;
      width: 46px;
      height: 46px;
      border: 0;
      border-radius: 4px;
      background: linear-gradient(to bottom, #b9b4ab, #9c978e 55%, #8b867d);
      color: var(--ink);
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.4),
        inset 0 -2px 0 rgb(0 0 0 / 0.22),
        0 6px 10px -3px rgb(0 0 0 / 0.6);
      cursor: pointer;
    }
    .tela-btn:hover {
      filter: brightness(1.08);
    }
    /* no alumínio, o amarelo do foco some: o anel é de tinta */
    .tela-btn:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    @media (max-width: 420px) {
      .topo-esq,
      .topo-dir {
        gap: 8px;
      }
      .nome-quadro {
        padding-inline: 10px;
        font-size: 1.15rem;
      }
    }
  `,
})
export class FreeBoardTop {
  readonly name = input.required<string>();
  /** O caminho da lista (a visita, por link); sem ele, o voltar avisa por `back` (a página do dono). */
  readonly backPath = input<string | null>(null);
  readonly back = output<void>();

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  protected readonly Icons = { voltar: ICON.voltar, cheia: ICON.telaCheia, sair: ICON.diminuir };
  protected readonly fullscreen = signal(typeof document !== 'undefined' && !!document.fullscreenElement);

  protected onFullscreenChange(): void {
    this.fullscreen.set(!!document.fullscreenElement);
  }

  /** A tela cheia do navegador sobre a tela do quadro aberto (esconde também as barras dele). */
  protected toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const el = this.host.closest<HTMLElement>('.tela-cheia') ?? this.host.parentElement;
    void el?.requestFullscreen?.().catch(() => undefined);
  }
}
