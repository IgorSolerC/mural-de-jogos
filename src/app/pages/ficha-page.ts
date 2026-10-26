import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { CloudAccount } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { Desk } from '../core/desk';
import { FichaLinks, LinkedCard, OPEN_PARAM, startsClosed } from '../core/ficha-link';
import { Reactions } from '../core/reactions';
import { ICON, IconModule } from '../ui/icons';
import { ReviewCard } from '../ui/review-card';

type State = { kind: 'abrindo' } | LinkedCard;

/**
 * A ficha aberta pelo link (`#/ficha/CÓDIGO/ID`, ver core/ficha-link.ts): a página é só ela,
 * maximizada, na parede de quem escreveu (o site esconde o topo e os avisos). Quem não tem conta vê só
 * a ficha; com conta, as reações e os comentários, como no mural de quem segue. A ficha é a leitura de
 * sempre (ui/review-reader.ts), aberta sem o fechar; aqui ficam a espera, o que deu errado e a ficha
 * minimizada (o Minimizar da leitura, ou o link que pede a ficha fechada: `?aberta=nao`).
 */
@Component({
  selector: 'app-ficha-page',
  imports: [IconModule, ReviewCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('abrindo') {
        <p class="abrindo" role="status"><span class="carregando" aria-hidden="true"></span>Abrindo a ficha…</p>
      }
      @case ('ok') {
        <h1 class="sr-only">{{ s.card.game.name }}</h1>
        <!-- minimizada: a ficha como fica pregada no mural de quem escreveu; um toque abre de novo -->
        @if (links.minimized()) {
          <div class="no-mural">
            <div class="ficha-mural">
              <app-review-card [review]="s.card" [preview]="true" [looks]="s.mural.categoryLooks" [reactCode]="signedIn() ? s.code : null" (opened)="maximize()" />
            </div>
            <button type="button" class="ampliar" (click)="maximize()">
              <lucide-icon [img]="MaximizeIcon" [size]="18" aria-hidden="true" />
              Abrir a ficha
            </button>
            <a class="assinatura" href="./">feito no <span class="assinatura-nome">Murall</span></a>
          </div>
        }
      }
      @default {
        <article class="ficha-erro" role="alert">
          <h1>{{ errorTitle(s) }}</h1>
          <p>{{ errorText(s) }}</p>
          <div class="acoes">
            @if (s.kind === 'erro') {
              <button type="button" class="btn-ink" (click)="load()">Tentar de novo</button>
            }
            <a class="btn-quiet" href="./">Conhecer o Murall</a>
          </div>
        </article>
      }
    }
  `,
  styleUrl: './ficha-page.scss',
})
export class FichaPage {
  private readonly route = inject(ActivatedRoute);
  private readonly desk = inject(Desk);
  private readonly account = inject(CloudAccount);
  private readonly cloud = inject(Cloud);
  private readonly reactions = inject(Reactions);
  private readonly title = inject(Title);

  protected readonly state = signal<State>({ kind: 'abrindo' });
  protected readonly links = inject(FichaLinks);
  protected readonly signedIn = signal(false);
  protected readonly MaximizeIcon = ICON.aumentar;
  private alive = true;

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.links.wall.set(null);
      this.links.minimized.set(false);
      this.desk.closeReader();
    });
  }

  protected async load(): Promise<void> {
    this.state.set({ kind: 'abrindo' });
    const params = this.route.snapshot.paramMap;
    const found = await this.links.fetch(params.get('codigo') ?? '', params.get('id') ?? '');
    if (!this.alive) return;
    this.state.set(found);
    if (found.kind !== 'ok') return;
    const { card, mural, code } = found;
    this.title.setTitle(`${card.game.name} · Murall`);
    // a ficha na parede de quem escreveu (a do perfil dela)
    this.links.wall.set(mural.profile?.page ?? null);
    await this.cloud.ready;
    const mine = this.reactions.myCode() === code;
    const signedIn = !!this.cloud.config() && this.account.signedIn();
    if (!this.alive) return;
    this.signedIn.set(signedIn);
    this.owner = mine ? 'Você' : (mural.ownerName ?? 'Alguém');
    // o link que pede a ficha fechada: ela começa como fica no mural, e um toque a abre
    if (startsClosed(this.route.snapshot.queryParamMap.get(OPEN_PARAM))) {
      this.links.minimized.set(true);
      return;
    }
    this.links.minimized.set(false);
    this.desk.openLoose(card, this.owner, mural.cards, code, signedIn);
  }

  private owner = 'Alguém';

  /** A ficha minimizada abre de novo, maximizada. */
  protected maximize(): void {
    const s = this.state();
    if (s.kind !== 'ok') return;
    this.links.minimized.set(false);
    this.desk.openLoose(s.card, this.owner, s.mural.cards, s.code, this.signedIn());
  }

  protected errorTitle(s: State): string {
    if (s.kind === 'sem-ficha') return 'Esta ficha não está à mostra';
    if (s.kind === 'sem-codigo') return 'Este link não abre nada';
    return 'Não deu para abrir a ficha agora';
  }

  protected errorText(s: State): string {
    if (s.kind === 'sem-ficha') return 'Quem escreveu pode ter apagado esta ficha ou deixado a ficha privada.';
    if (s.kind === 'sem-codigo') return 'O link veio cortado, ou quem mandou trocou o código do mural. Peça o link de novo.';
    return s.kind === 'erro' ? s.message : '';
  }
}
