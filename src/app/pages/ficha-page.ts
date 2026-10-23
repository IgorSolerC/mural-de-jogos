import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { CloudAccount } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { Desk } from '../core/desk';
import { FichaLinks, LinkedCard } from '../core/ficha-link';
import { Reactions } from '../core/reactions';

type State = { kind: 'abrindo' } | LinkedCard;

/**
 * A ficha aberta pelo link (`#/ficha/CÓDIGO/ID`, ver core/ficha-link.ts): a página é só ela,
 * maximizada, na parede de quem escreveu (o site esconde o topo e os avisos). Quem não tem conta vê só
 * a ficha; com conta, as reações e os comentários, como no mural de quem segue. A ficha é a leitura de
 * sempre (ui/review-reader.ts), aberta sem o fechar; aqui ficam só a espera e o que deu errado.
 */
@Component({
  selector: 'app-ficha-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('abrindo') {
        <p class="abrindo" role="status"><span class="carregando" aria-hidden="true"></span>Abrindo a ficha…</p>
      }
      @case ('ok') {
        <h1 class="sr-only">{{ s.card.game.name }}</h1>
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
  private readonly links = inject(FichaLinks);
  private readonly desk = inject(Desk);
  private readonly account = inject(CloudAccount);
  private readonly cloud = inject(Cloud);
  private readonly reactions = inject(Reactions);
  private readonly title = inject(Title);

  protected readonly state = signal<State>({ kind: 'abrindo' });
  private alive = true;

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => {
      this.alive = false;
      this.links.wall.set(null);
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
    this.desk.openLoose(card, mine ? 'Você' : (mural.ownerName ?? 'Alguém'), mural.cards, code, signedIn);
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
