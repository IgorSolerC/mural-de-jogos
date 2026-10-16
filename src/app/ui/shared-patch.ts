import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LucideAngularModule, TriangleAlert, UsersRound } from 'lucide-angular';
import { canWrite } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';

/**
 * A anotação compartilhada, no mural: um remendo de feltro na quina de baixo da ficha, ao lado do dos
 * comentários e do das reações, com as pessoas e quantas são (as que não são você). Com um conflito
 * esperando quem escreve, o remendo vira o aviso em vermelho. Tocar abre a ficha (e a leitura mostra a
 * pergunta do conflito). Só no seu mural; a anotação só sua não tem remendo.
 */
@Component({
  selector: 'app-shared-patch',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      <button
        type="button"
        class="remendo"
        [class.conflito]="s.conflict"
        [style.--torto.deg]="tilt()"
        [attr.aria-label]="s.spoken"
        [title]="s.spoken"
        (click)="open($event)"
      >
        <lucide-icon [img]="s.conflict ? ConflictIcon : PeopleIcon" [size]="16" [strokeWidth]="2.5" aria-hidden="true" />
        <span class="n" aria-hidden="true">{{ s.conflict ? 'Conflito' : s.n }}</span>
      </button>
    }
  `,
  styleUrl: './shared-patch.scss',
})
export class SharedPatch {
  readonly noteId = input.required<string>();
  readonly opened = output<void>();
  private readonly shared = inject(SharedStore);
  protected readonly PeopleIcon = UsersRound;
  protected readonly ConflictIcon = TriangleAlert;

  protected readonly state = computed(() => {
    const e = this.shared.get(this.noteId());
    if (!e) return null;
    const conflict = !!e.conflito && canWrite(e.papel);
    // as pessoas além de você: no seu, quem você chamou; na dos outros, o dono e os outros (você está na lista)
    const n = e.membros.length;
    if (!n && !conflict) return null;
    const who = e.papel === 'dono' ? (n === 1 ? `com ${e.membros[0].nome}` : `com ${n} pessoas`) : `de ${e.dono.nome}`;
    return { conflict, n, spoken: conflict ? 'Conflito de sincronização: escolher a versão' : `Anotação compartilhada ${who}` };
  });

  /** Costurado meio torto, sempre do mesmo jeito na mesma ficha, para o outro lado do vizinho. */
  protected readonly tilt = computed(() => {
    let h = 11;
    for (const c of this.noteId()) h = (h * 37 + c.charCodeAt(0)) | 0;
    return -((Math.abs(h) % 7) - 2);
  });

  protected open(e: MouseEvent): void {
    e.stopPropagation();
    this.opened.emit();
  }
}
