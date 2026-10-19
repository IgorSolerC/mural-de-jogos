import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { ICON, IconModule } from './icons';
import { CommentTarget, Comments, spokenComments } from '../core/comments';

/**
 * Quantos comentários a ficha tem, num remendo de feltro colado na quina de baixo dela, ao lado do das
 * reações (ver ui/reactions.ts). Sem comentário nenhum, não aparece. Tocar pede a ficha aberta já com
 * os comentários (`opened`): quem desenha a ficha abre a leitura.
 */
@Component({
  selector: 'app-comment-bubble',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count(); as n) {
      <button type="button" class="balao" [style.--torto.deg]="tilt()" [attr.aria-label]="spoken() + '. Ver os comentários'" [title]="spoken()" (click)="open($event)">
        <lucide-icon [img]="Icon" [size]="17" aria-hidden="true" />
        <span class="n" aria-hidden="true">{{ n }}</span>
      </button>
    }
  `,
  styleUrl: './comment-bubble.scss',
})
export class CommentBubble {
  readonly target = input.required<CommentTarget>();
  /** Tocaram no remendo: a ficha deve abrir com os comentários. */
  readonly opened = output<void>();
  protected readonly Icon = ICON.comentar;
  private readonly comments = inject(Comments);
  protected readonly count = computed(() => this.comments.countOf(this.target().code, this.target().ref));
  protected readonly spoken = computed(() => spokenComments(this.count()));
  /** Costurado meio torto, sempre do mesmo jeito na mesma ficha (de −3 a +4 graus), sem imitar o vizinho. */
  protected readonly tilt = computed(() => {
    let h = 7;
    for (const c of this.target().ref) h = (h * 33 + c.charCodeAt(0)) | 0;
    return (Math.abs(h) % 8) - 3;
  });

  constructor() {
    // a contagem do mural do dono: um pedido por mural (o serviço não repete dentro de um minuto)
    const code = computed(() => this.target().code);
    effect(() => {
      const c = code();
      untracked(() => void this.comments.loadCounts(c));
    });
  }

  protected open(e: MouseEvent): void {
    // o remendo fica por cima da ficha: o toque é dele
    e.stopPropagation();
    this.comments.want(this.target().ref);
    this.opened.emit();
  }
}
