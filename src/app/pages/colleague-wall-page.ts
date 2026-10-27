import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ICON, IconModule } from '../ui/icons';
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
import { plural } from '../core/text';
import { failedText, FollowToasts } from '../ui/follow-toasts';
import { KIND_ICON } from '../ui/kind-switcher';
import { PersonFace, PersonPhoto } from '../ui/person-photo';

const NO_PICKS: ReadonlyMap<string, number> = new Map();

/**
 * O mural de outra pessoa (aberto em Comparar, em Amigos ou pelo link), só dela, na parede dela (o app
 * troca a parede do site enquanto se visita: ver `siteWall` em app.ts). Em cima, a ficha da dona: uma
 * orelha de cartolina por mural em que ela tem fichas (a aberta emendada no papel) e, no papel, a foto
 * do perfil, "O mural de Marina", a linha dela, quanto tem aqui, o perfil e o seguir. Embaixo, a mesma
 * régua e a mesma parede do seu mural (WallToolbar e WallBoard, sobre a vista `VisitView`): busca,
 * filtros, abas, tags, ordens, tipos de ficha e seções que fecham, tudo como o dono vê. Só se lê:
 * tocar numa ficha abre a leitura com o nome dela.
 */
@Component({
  selector: 'app-colleague-wall-page',
  imports: [Busy, IconModule, PersonPhoto, ReviewReader, RouterLink, WallBoard, WallToolbar],
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

  protected readonly BackIcon = ICON.voltar;
  protected readonly FollowIcon = ICON.seguir;
  protected readonly FollowingIcon = ICON.seguindo;
  protected readonly ProfileIcon = ICON.pessoa;

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
   * De onde a pessoa veio: o perfil dela ("Voltar ao perfil"), Amigos ("Voltar a Amigos") ou Comparar
   * (o de sempre, também para quem chegou pelo link).
   */
  private readonly prevUrl = (() => {
    const router = inject(Router);
    const prev = untracked(() => router.currentNavigation())?.previousNavigation?.finalUrl;
    return prev ? router.serializeUrl(prev) : '';
  })();
  private readonly from: 'perfil' | 'amigos' | 'comparar' = this.prevUrl.startsWith('/perfil/')
    ? 'perfil'
    : this.prevUrl.startsWith('/amigos')
      ? 'amigos'
      : 'comparar';
  protected readonly back =
    this.from === 'perfil'
      ? { link: this.prevUrl, label: 'Voltar ao perfil' }
      : this.from === 'amigos'
        ? { link: '/amigos', label: 'Voltar a Amigos' }
        : { link: '/comparar', label: 'Voltar à comparação' };

  /** As fichas em segredo, as reações da pessoa e nada do que é do dono (marcar, tarefas, chegada). */
  protected readonly access = computed<WallAccess>(() => ({
    landingId: null,
    picking: false,
    picked: NO_PICKS,
    masked: false,
    secret: this.visit.hidden(),
    reactCode: this.visit.code(),
    checkable: false,
    looks: this.visit.categoryLooks(),
  }));

  /** "34 jogos · média 7,1". Com fichas em segredo, quantas; nas anotações, quantas já foram finalizadas. */
  protected readonly summary = computed(() => {
    // uma ficha por obra: as rejogadas da pessoa não entram na conta nem na média
    const list = originalsOf(this.visit.wall());
    if (!list.length) return '';
    if (isNotes(this.profile().kind)) {
      const done = list.filter(isDone).length;
      return `${countOf(this.profile(), list.length - done)}${done ? ` · ${plural(done, 'finalizada', 'finalizadas')}` : ''}`;
    }
    if (this.visit.guarding()) return `${countOf(this.profile(), list.length)} · ${this.visit.hidden().size} em segredo`;
    const avg = list.reduce((s, r) => s + r.scores.final, 0) / list.length;
    return `${countOf(this.profile(), list.length)} · média ${avgFmt.format(avg)}`;
  });

  /** As orelhas: os murais onde a pessoa tem fichas, na ordem de sempre, e o aberto mesmo vazio. */
  protected readonly walls = computed(() => {
    const c = this.colleague();
    if (!c) return [];
    const open = this.mural.kind();
    return KINDS.map((kind) => ({
      kind,
      label: cap(profileOf(kind).plural),
      icon: KIND_ICON[kind],
      // as anotações finalizadas não estão no mural
      n: c.reviews.filter((r) => r.kind === kind && !r.revisitOf && !r.doneAt).length,
      on: kind === open,
    })).filter((w) => w.n || w.on);
  });

  /** A foto do perfil dela (sem perfil, um backup: a inicial numa cartolina). */
  protected readonly face = computed<PersonFace | null>(() => {
    const p = this.colleague()?.profile;
    return p ? { emoji: p.emoji, cor: p.photo } : null;
  });
  /** A linha curta do perfil ("Curadora · SP"). */
  protected readonly tagline = computed(() => this.colleague()?.profile?.tagline.trim() ?? '');

  private readonly follow = inject(Follow);
  private readonly account = inject(CloudAccount);
  private readonly toasts = inject(Toasts);
  private readonly followToasts = inject(FollowToasts);
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
      if (this.following()) await this.followToasts.stop(code, c.name);
      else await this.followToasts.start(code, c.name);
    } catch (err) {
      this.toasts.show(failedText(err));
    } finally {
      this.followBusy.set(false);
    }
  }

  protected switchWall(kind: Kind): void {
    if (kind === this.mural.kind()) return;
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
