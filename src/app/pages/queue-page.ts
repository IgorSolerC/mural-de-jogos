import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Bookmark, LucideAngularModule } from 'lucide-angular';
import { Desk } from '../core/desk';
import { ReviewStore } from '../core/review-store';
import { DraftCard } from '../ui/draft-card';

/**
 * Pra depois: os jogos guardados só com nome e capa. Antes moravam no topo do mural, disputando
 * espaço com as fichas; aqui cada folha tem lugar e o mural fica só com o que já foi resenhado.
 */
@Component({
  selector: 'app-queue-page',
  imports: [DraftCard, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <h1 class="tape-label big">Pra resenhar depois</h1>
      @if (store.draftCount(); as n) {
        <p class="sub">{{ n }} {{ n === 1 ? 'jogo esperando' : 'jogos esperando' }} a sua opinião</p>
      }
    </header>

    @if (store.draftCount()) {
      <div class="sheets">
        @for (d of store.drafts(); track d.id) {
          <app-draft-card
            [attr.data-ficha]="d.id"
            [draft]="d"
            [landing]="desk.landingId() === d.id"
            (opened)="desk.openDraft($event)"
          />
        }
      </div>
    } @else {
      <section class="empty" aria-labelledby="fila-vazia">
        <span class="tape" aria-hidden="true"></span>
        <h2 id="fila-vazia">Nenhum jogo na fila</h2>
        <p>
          Zerou algo e ainda não sabe o que achar? Na hora de pregar, escolha o jogo e toque em
          <strong>Salvar pra depois</strong>. Ele fica aqui, só com nome e capa, até você voltar.
        </p>
        <button type="button" class="btn-ink" (click)="desk.newReview()">
          <lucide-icon [img]="LaterIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
          Guardar um jogo
        </button>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 18px;
      margin-bottom: 30px;
    }
    .sub {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--wall-ink-2);
      font-variant-numeric: tabular-nums;
    }

    .sheets {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
      gap: 44px 32px;
      align-items: start;
      padding-top: 10px;
    }
    /* aqui a folha tem espaço: cresce até o tamanho de uma ficha simples */
    app-draft-card {
      width: 100%;
      max-width: 200px;
      justify-self: center;
    }

    /* folha de caderno solta na parede, explicando a fila */
    .empty {
      position: relative;
      max-width: 520px;
      padding: 34px 30px 28px 44px;
      rotate: -1deg;
      color: #2e3036;
      background:
        linear-gradient(90deg, transparent 26px, rgb(230 46 45 / 0.5) 26px 27.5px, transparent 0),
        repeating-linear-gradient(to bottom, transparent 0 26px, rgb(70 120 200 / 0.28) 26px 27.5px, transparent 27.5px 28px),
        #fbfaf3;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 10px 12px rgb(0 0 0 / 0.45));
    }
    .empty .tape {
      position: absolute;
      top: -9px;
      left: calc(50% - 30px);
      width: 60px;
      height: 20px;
      rotate: 4deg;
      background: rgb(222 205 160 / 0.86);
    }
    :host-context(body.has-tape) .empty .tape {
      background: url('/textures/fita-crepe.png') center / 100% 100% no-repeat;
    }
    .empty h2 {
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.6rem;
      line-height: 1.1;
      color: var(--ink);
    }
    .empty p {
      margin: 10px 0 20px;
      max-width: 44ch;
      font-family: var(--f-hand);
      font-size: 1.15rem;
      line-height: 28px;
    }
    .empty strong {
      font-weight: 700;
      color: var(--ink);
    }

    @media (max-width: 559px) {
      .tape-label.big {
        font-size: 1.4rem;
      }
      .sheets {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 34px 18px;
      }
      .empty {
        padding: 30px 20px 24px 40px;
      }
    }
  `,
})
export class QueuePage {
  protected readonly store = inject(ReviewStore);
  protected readonly desk = inject(Desk);
  protected readonly LaterIcon = Bookmark;
}
