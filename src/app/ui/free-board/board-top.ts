import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ICON, IconModule } from '../icons';

let seq = 0;

/**
 * O topo do quadro aberto, o mesmo no seu canvas e na visita (a regra "Visita: as mesmas peças do dono",
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
        @if (renamable()) {
          <!-- o nome se escreve ali mesmo (o canvas: renomear muda a anotação); Enter ou sair do campo guarda, Esc volta -->
          <h2 class="nome-titulo">
            <label class="sr-only" [attr.for]="fieldId">Nome</label>
            <input
              #campo
              [id]="fieldId"
              class="nome-quadro nome-campo"
              type="text"
              autocomplete="off"
              maxlength="200"
              [value]="name()"
              (keydown.enter)="$event.preventDefault(); campo.blur()"
              (keydown.escape)="$event.stopPropagation(); campo.value = name(); campo.blur()"
              (blur)="commit(campo)"
            />
          </h2>
        } @else {
          <h2 class="nome-quadro" [title]="name()">{{ name() }}</h2>
        }
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
  /** O nome se escreve no topo (o canvas, PLANO-CANVAS.md 3.2): `renamed` leva o nome novo. */
  readonly renamable = input(false);
  /** Ao abrir, o nome já vem selecionado para escrever (o canvas novo). */
  readonly selectName = input(false);
  readonly renamed = output<string>();
  protected readonly fieldId = `nome-quadro-${++seq}`;

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  protected readonly Icons = { voltar: ICON.voltar, cheia: ICON.telaCheia, sair: ICON.diminuir };
  protected readonly fullscreen = signal(typeof document !== 'undefined' && !!document.fullscreenElement);

  constructor() {
    afterNextRender(() => {
      if (!this.renamable() || !this.selectName()) return;
      const field = this.host.querySelector<HTMLInputElement>('.nome-campo');
      field?.focus();
      field?.select();
    });
  }

  /** Saiu do campo: o nome novo (sem espaços sobrando), se mudou e não ficou vazio. */
  protected commit(field: HTMLInputElement): void {
    const name = field.value.replace(/\s+/g, ' ').trim();
    if (!name) field.value = this.name();
    else if (name !== this.name()) this.renamed.emit(name);
  }

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
