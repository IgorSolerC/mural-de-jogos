import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ICON, IconModule } from '../icons';

/**
 * O topo do quadro aberto, o mesmo no seu Quadro livre e na visita (a regra "Visita: as mesmas peças do dono",
 * no CLAUDE.md): a etiqueta de tinta de voltar, o nome a pincel na fita e, à direita, o que quem usa põe
 * dentro (o Editar e o Pronto do dono, etiquetas de tinta também) e a da tela cheia do navegador. Uma fileira
 * só: o nome encolhe com reticências, nunca passa por baixo dos botões.
 */
@Component({
  selector: 'app-free-board-top',
  imports: [IconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:fullscreenchange)': 'onFullscreenChange()' },
  template: `
    <div class="topo">
      <div class="topo-esq">
        <span class="grupo-voltar">
          @if (backPath(); as p) {
            <a class="voltar" [routerLink]="p" title="Voltar para a lista (Esc)">
              <lucide-icon [img]="Icons.voltar" [size]="18" aria-hidden="true" />
              <span class="sr-only">Voltar para a lista</span>
            </a>
          } @else {
            <button type="button" class="voltar" (click)="back.emit()" title="Voltar para a lista (Esc)">
              <lucide-icon [img]="Icons.voltar" [size]="18" aria-hidden="true" />
              <span class="sr-only">Voltar para a lista</span>
            </button>
          }
        </span>
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
  styleUrl: './board-top.scss',
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
