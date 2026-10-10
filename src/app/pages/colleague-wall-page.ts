import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ArrowLeft, LucideAngularModule, UserCheck, UserPlus } from 'lucide-angular';
import { CloudAccount } from '../core/cloud-account';
import { CloudMurals } from '../core/cloud-murals';
import { ColleagueStore } from '../core/colleague-store';
import { Follow } from '../core/follow';
import { KINDS, Kind, SCORED_KINDS, cap, countOf, isNotes, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { Reactions } from '../core/reactions';
import { isDone, originalsOf } from '../core/review';
import { SideBySide } from '../core/side-by-side';
import { ViewTransitions } from '../core/view-transitions';
import { VisitView } from '../core/visit-view';
import { WallState } from '../core/wall-view';
import { Busy } from '../ui/busy';
import { ReviewReader } from '../ui/review-reader';
import { Toasts } from '../ui/toast';
import { WallToolbar } from '../ui/wall-toolbar';
import { WallAccess, WallBoard } from './wall-board';
import { ONE_DECIMAL as avgFmt } from '../core/review';

const NO_PICKS: ReadonlyMap<string, number> = new Map();

/**
 * O mural de outra pessoa (aberto em Comparar, em Amigos ou pelo link), só dela. Em cima, a placa com
 * o nome, o seguir e os outros murais dela; embaixo, a mesma régua e a mesma parede do seu mural
 * (WallToolbar e WallBoard, sobre a vista `VisitView`): busca, filtros, abas, tags, ordens, tipos de
 * ficha e seções que fecham, tudo como o dono vê. Só se lê: tocar numa ficha abre a leitura com o
 * nome dela. Segue o mural aberto no cartaz (jogos, livros…), como as outras páginas.
 */
@Component({
  selector: 'app-colleague-wall-page',
  imports: [Busy, LucideAngularModule, ReviewReader, RouterLink, WallBoard, WallToolbar],
  providers: [VisitView, { provide: WallState, useExisting: VisitView }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './colleague-wall-page.html',
  styleUrl: './colleague-wall-page.scss',
})
export class ColleagueWallPage {
  protected readonly colleagues = inject(ColleagueStore);
  protected readonly visit = inject(VisitView);
  protected readonly mural = inject(Mural);
  private readonly cloudMurals = inject(CloudMurals);
  private readonly vt = inject(ViewTransitions);
  private readonly side = inject(SideBySide);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly BackIcon = ArrowLeft;
  protected readonly FollowIcon = UserPlus;
  protected readonly FollowingIcon = UserCheck;

  protected readonly colleague = this.visit.colleague;
  protected readonly name = this.visit.owner;
  protected readonly profile = this.mural.profile;

  /** Aberto pelo código: se atualiza da nuvem ao aparecer (a cada 2 minutos, no máximo). */
  private readonly refreshCloud = effect(() => {
    const c = this.colleague();
    untracked(() => void this.cloudMurals.refresh(c));
  });
  private readonly reactions = inject(Reactions);
  private readonly loadReactions = effect(() => {
    const code = this.visit.code();
    if (code) untracked(() => void this.reactions.load(code));
  });

  /**
   * De onde a pessoa veio: Amigos ("Voltar a Amigos") ou Comparar (o de sempre, também para quem
   * chegou pelo link).
   */
  private readonly from: 'amigos' | 'comparar' = (() => {
    const router = inject(Router);
    const prev = untracked(() => router.currentNavigation())?.previousNavigation?.finalUrl;
    return prev && router.serializeUrl(prev).startsWith('/amigos') ? 'amigos' : 'comparar';
  })();
  protected readonly back = this.from === 'amigos' ? { link: '/amigos', label: 'Voltar a Amigos' } : { link: '/comparar', label: 'Voltar à comparação' };

  /** As fichas em segredo, as reações da pessoa e nada do que é do dono (marcar, tarefas, chegada). */
  protected readonly access = computed<WallAccess>(() => ({
    landingId: null,
    picking: false,
    picked: NO_PICKS,
    masked: false,
    secret: this.visit.hidden(),
    reactCode: this.visit.code(),
    checkable: false,
  }));

  /** "34 jogos · média 7,1". Com fichas em segredo, quantas; nas anotações, quantas já foram finalizadas. */
  protected readonly summary = computed(() => {
    // uma ficha por obra: as rejogadas da pessoa não entram na conta nem na média
    const list = originalsOf(this.visit.wall());
    if (!list.length) return '';
    if (isNotes(this.profile().kind)) {
      const done = list.filter(isDone).length;
      return `${countOf(this.profile(), list.length - done)}${done ? ` · ${done} ${done === 1 ? 'finalizada' : 'finalizadas'}` : ''}`;
    }
    if (this.visit.guarding()) return `${countOf(this.profile(), list.length)} · ${this.visit.hidden().size} em segredo`;
    const avg = list.reduce((s, r) => s + r.scores.final, 0) / list.length;
    return `${countOf(this.profile(), list.length)} · média ${avgFmt.format(avg)}`;
  });

  /** Os outros murais onde a pessoa tem fichas. */
  protected readonly otherWalls = computed(() => {
    const c = this.colleague();
    if (!c) return [];
    return KINDS.filter((k) => k !== this.mural.kind())
      // as anotações finalizadas não estão no mural
      .map((kind) => ({ kind, label: cap(profileOf(kind).plural), n: c.reviews.filter((r) => r.kind === kind && !r.revisitOf && !r.doneAt).length }))
      .filter((w) => w.n);
  });

  private readonly follow = inject(Follow);
  private readonly account = inject(CloudAccount);
  private readonly toasts = inject(Toasts);
  /** Seguir só faz sentido para um mural aberto pelo código, com conta, e que não é o meu. */
  protected readonly canFollow = computed(() => {
    const code = this.visit.code();
    return !!code && this.follow.available() && code !== this.account.account()?.codigo;
  });
  /** Sigo essa pessoa? null enquanto não se sabe: o botão espera, em vez de oferecer "Seguir" à toa. */
  protected readonly followState = computed(() => {
    const code = this.visit.code();
    return code ? this.follow.isFollowing(code) : null;
  });
  protected readonly following = computed(() => this.followState() === true);
  protected readonly followBusy = signal(false);

  protected async toggleFollow(): Promise<void> {
    const c = this.colleague();
    if (!c?.codigo || this.followBusy()) return;
    const code = c.codigo;
    this.followBusy.set(true);
    try {
      if (this.following()) {
        await this.follow.unfollow(code);
        this.toasts.show(`Você deixou de seguir ${c.name}`, { label: 'Desfazer', run: () => void this.follow.follow(code).catch(() => undefined) });
      } else {
        await this.follow.follow(code);
        this.toasts.show(`Agora você segue ${c.name}. As resenhas novas aparecem em Amigos.`);
      }
    } catch (err) {
      this.toasts.show(err instanceof Error ? err.message : 'Não deu certo agora. Tente de novo.');
    } finally {
      this.followBusy.set(false);
    }
  }

  protected switchWall(kind: Kind): void {
    this.vt.run(() => {
      this.side.picking.set(false);
      this.mural.kind.set(kind);
    });
  }

  /**
   * Voltar à comparação: Comparar não tem mural de anotações. Vendo as anotações da pessoa, o
   * cartaz troca antes para um mural com notas (um que ela tenha), senão a volta caía no seu mural.
   */
  protected goBack(): void {
    if (this.from !== 'comparar' || !isNotes(this.mural.kind())) return;
    const c = this.colleague();
    this.mural.kind.set(SCORED_KINDS.find((k) => c?.reviews.some((r) => r.kind === k)) ?? 'jogos');
  }

  protected open(id: string): void {
    const review = this.visit.wall().find((r) => r.id === id);
    if (!review) return;
    // com as outras fichas da pessoa: a leitura anda entre as vezes de uma obra que ela rejogou;
    // a revelada uma a uma abre à mostra, com "Esconder a nota"
    this.reader().open(review, this.name(), this.visit.wall(), this.visit.isSecret(id), this.visit.code(), null, this.visit.singles().has(id));
  }
}
