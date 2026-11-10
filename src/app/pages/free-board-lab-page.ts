import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { FreeBoard } from '../core/free-board';
import { ImageStore } from '../core/image-store';
import { ReviewStore } from '../core/review-store';
import { FreeBoardView } from '../ui/free-board/free-board-view';
import { LabImages, bigBoard, mansionBoard } from './free-board-lab-data';

/**
 * O laboratório do Quadro livre (`/laboratorio/quadro-livre`, PLANO-QUADRO-LIVRE.md, rodada 2): o motor de ver
 * com a mansão montada à mão e, com `?quadro=grande`, o quadro gerado de 2.000 peças, para medir e fotografar
 * antes de a seção existir. Escondida: nenhum link leva até aqui. Não grava nada: os quadros e as imagens
 * (`LabImages`) ficam só na memória da página.
 */
@Component({
  selector: 'app-free-board-lab-page',
  imports: [FreeBoardView, RouterLink],
  providers: [{ provide: ImageStore, useFactory: () => new LabImages() }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lab">
      @if (board(); as b) {
        <app-free-board [board]="b" />
      } @else {
        <p class="desenhando">Desenhando os cômodos…</p>
      }
      <nav class="troca" aria-label="Quadros do laboratório">
        <a class="tape-label" routerLink="." [queryParams]="{}" [attr.aria-current]="big() ? null : 'page'">Mansão</a>
        <a class="tape-label" routerLink="." [queryParams]="{ quadro: 'grande' }" [attr.aria-current]="big() ? 'page' : null">2.000 peças</a>
      </nav>
    </div>
  `,
  styles: `
    .lab {
      position: fixed;
      inset: 0;
      z-index: 60;
      background: var(--wall);
    }
    .desenhando {
      position: absolute;
      top: 50%;
      left: 50%;
      translate: -50% -50%;
      color: var(--wall-ink-2);
      font: 400 1.2rem var(--f-hand);
    }
    .troca {
      position: absolute;
      top: 14px;
      left: 16px;
      display: flex;
      gap: 12px;
    }
    .troca a {
      font-size: 1.05rem;
      text-decoration: none;
      opacity: 0.72;
    }
    .troca a[aria-current] {
      opacity: 1;
    }
    .troca a:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 3px;
    }
  `,
})
export class FreeBoardLabPage {
  private readonly images = inject(ImageStore) as unknown as LabImages;
  private readonly store = inject(ReviewStore);
  protected readonly big = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('quadro') === 'grande')), { initialValue: false });
  private readonly drawn = signal<string[] | null>(null);
  protected readonly board = computed<FreeBoard | null>(() => {
    const ids = this.drawn();
    if (!ids) return null;
    if (this.big()) return bigBoard(ids);
    const notes = this.store
      .notes()
      .slice(0, 1)
      .map((n) => ({ id: n.id, title: n.game.name }));
    return mansionBoard(ids.slice(0, 24), notes);
  });

  constructor() {
    void this.images.draw(60).then((ids) => this.drawn.set(ids));
    inject(DestroyRef).onDestroy(() => this.images.destroy());
  }
}
