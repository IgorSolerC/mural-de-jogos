import { wallPath } from '../core/areas';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ICON, IconModule } from '../ui/icons';
import { CloudAccount } from '../core/cloud-account';
import { Cloud } from '../core/cloud-config';
import { CloudMurals, cloudColleagueId, normalizeCode } from '../core/cloud-murals';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { Desk } from '../core/desk';
import { Follow } from '../core/follow';
import { PeopleTab, ProfilePeople } from '../core/profile-people';
import { Kind } from '../core/kinds';
import { Mural } from '../core/mural';
import { Profile, defaultProfile, profileStats, updatedLabel } from '../core/profile';
import { ProfileStore } from '../core/profile-store';
import { Reactions } from '../core/reactions';
import { Review, shownToOthers } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { KanbanStore } from '../core/kanban-store';
import { Settings } from '../core/settings';
import { SpoilerShield } from '../core/spoiler-shield';
import { Busy } from '../ui/busy';
import { PageWall } from '../ui/page-wall';
import { PeopleSheet } from '../ui/people-sheet';
import { Pin } from '../ui/pin';
import { ProfileHero } from '../ui/profile-hero';
import { ProfileSectionView } from '../ui/profile-section';
import { ProfileWalls } from '../ui/profile-walls';
import { ReviewReader } from '../ui/review-reader';
import { Toasts } from '../ui/toast';
import { failedText, FollowToasts } from '../ui/follow-toasts';

/** O link que abre o perfil de quem tem esse código. */
export function profileLink(code: string, base: string = location.origin + location.pathname): string {
  return `${base}#/perfil/${code}`;
}

/** O perfil de quem ainda não montou o seu: o padrão, sem a seção vazia. */
const BLANK: Profile = { ...defaultProfile(), sections: [] };

/** Quem é o dono do perfil aberto, e em que pé está. */
type Who =
  | { kind: 'own' }
  | { kind: 'other'; code: string }
  /** O endereço tem um código que não existe. */
  | { kind: 'invalid'; raw: string };

/**
 * O perfil de alguém (`#/perfil/K7QF-M2XA`) ou o seu (`#/perfil`): o quadro de cima (a polaroid, o
 * "Sobre mim", os números), as pastas dos murais que têm fichas à mostra, e as seções que a pessoa
 * montou, cada uma no tipo de ficha escolhido. O seu mostra o que os outros veem (sem as privadas).
 * Os dados de quem visita vêm do mural público dela (CloudMurals), o mesmo do mural por código.
 */
@Component({
  selector: 'app-profile-page',
  imports: [Busy, IconModule, PageWall, PeopleSheet, Pin, ProfileHero, ProfileSectionView, ProfileWalls, ReviewReader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly account = inject(CloudAccount);
  protected readonly cloud = inject(Cloud);
  private readonly cloudMurals = inject(CloudMurals);
  private readonly colleagues = inject(ColleagueStore);
  private readonly profiles = inject(ProfileStore);
  private readonly settings = inject(Settings);
  private readonly store = inject(ReviewStore);
  private readonly kanban = inject(KanbanStore);
  private readonly shield = inject(SpoilerShield);
  private readonly desk = inject(Desk);
  private readonly mural = inject(Mural);
  private readonly follow = inject(Follow);
  private readonly toasts = inject(Toasts);
  private readonly followToasts = inject(FollowToasts);
  private readonly reactions = inject(Reactions);
  private readonly peopleOf = inject(ProfilePeople);
  private readonly peopleSheet = viewChild(PeopleSheet);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly EditIcon = ICON.editar;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly RetryIcon = ICON.atualizar;
  protected readonly FollowIcon = ICON.seguir;
  protected readonly FollowingIcon = ICON.seguindo;

  private readonly param = toSignal(this.route.paramMap.pipe(map((p) => p.get('codigo'))), { initialValue: null });

  /** O seu código, na conta: `/perfil/SEU-CODIGO` é o seu perfil. */
  protected readonly who = computed<Who>(() => {
    const raw = this.param();
    if (!raw) return { kind: 'own' };
    const code = normalizeCode(raw);
    if (!code) return { kind: 'invalid', raw };
    return code === this.account.account()?.codigo ? { kind: 'own' } : { kind: 'other', code };
  });
  protected readonly own = computed(() => this.who().kind === 'own');

  // ===== O mural público de quem visita =====
  /** Buscando na nuvem (o guardado, se houver, já aparece enquanto isso). */
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  private readonly fetched = signal<Colleague | null>(null);
  /** O guardado neste navegador (de uma visita antes), enquanto a nuvem não responde. */
  private readonly stored = computed(() => {
    const who = this.who();
    return who.kind === 'other' ? (this.colleagues.colleagues().find((c) => c.id === cloudColleagueId(who.code)) ?? null) : null;
  });
  protected readonly colleague = computed(() => this.fetched() ?? this.stored());

  private loadSeq = 0;
  private readonly load = effect(() => {
    const who = this.who();
    untracked(() => void this.fetch(who));
  });

  protected async fetch(who: Who = this.who()): Promise<void> {
    const seq = ++this.loadSeq;
    this.fetched.set(null);
    this.failed.set(false);
    if (who.kind !== 'other') return;
    await this.cloud.ready;
    if (seq !== this.loadSeq || !this.cloud.config()) return;
    this.loading.set(true);
    const c = await this.cloudMurals.ensure(who.code);
    if (seq !== this.loadSeq) return;
    this.loading.set(false);
    if (c) {
      this.fetched.set(c);
      if (c.codigo) void this.reactions.load(c.codigo);
    } else this.failed.set(true);
  }

  // ===== O que o perfil mostra =====
  protected readonly name = computed(() => {
    if (this.own()) return this.settings.ownerName().trim() || this.account.account()?.nome || 'Você';
    return this.colleague()?.name ?? '';
  });
  protected readonly code = computed(() => {
    const who = this.who();
    return who.kind === 'other' ? who.code : (this.account.account()?.codigo ?? null);
  });
  protected readonly profile = computed<Profile>(() => (this.own() ? this.profiles.profile() : (this.colleague()?.profile ?? BLANK)));
  /** As fichas que aparecem: só as públicas e fora das só no Kanban (o seu perfil mostra o que os outros veem). */
  protected readonly cards = computed<readonly Review[]>(() => {
    if (!this.own()) return this.colleague()?.reviews ?? [];
    const board = this.kanban.boardOnly();
    return this.store.reviews().filter((r) => shownToOthers(r, board));
  });
  private readonly byId = computed(() => new Map(this.cards().map((r) => [r.id, r])));
  /** As fichas de outra pessoa sobre o que você não avaliou ficam em segredo (Ajustes › Mural). */
  protected readonly hidden = computed(() => (this.own() ? new Set<string>() : this.shield.hiddenIn(this.cards())));
  protected readonly stats = computed(() => profileStats(this.cards()));
  protected readonly updated = computed(() => updatedLabel(this.cards()));
  protected readonly looks = computed(() => (this.own() ? this.settings.categoryLooks() : (this.colleague()?.categoryLooks ?? {})));
  protected readonly reactCode = computed(() => this.code());

  /** As seções com as fichas que existem e estão à mostra; para quem visita, as vazias somem. */
  protected readonly sections = computed(() =>
    this.profile()
      .sections.map((s) => ({ ...s, cards: s.items.map((id) => this.byId().get(id)).filter((r): r is Review => !!r) }))
      .filter((s) => this.own() || s.cards.length > 0),
  );

  // ===== Seguir =====
  protected readonly canFollow = computed(() => {
    const who = this.who();
    return who.kind === 'other' && this.follow.available() && !!this.colleague();
  });
  protected readonly followState = computed(() => {
    const who = this.who();
    return who.kind === 'other' ? this.follow.isFollowing(who.code) : null;
  });
  protected readonly following = computed(() => this.followState() === true);
  protected readonly followBusy = signal(false);

  protected async toggleFollow(): Promise<void> {
    const who = this.who();
    if (who.kind !== 'other' || this.followBusy()) return;
    const name = this.name();
    this.followBusy.set(true);
    try {
      if (this.following()) await this.followToasts.stop(who.code, name);
      else await this.followToasts.start(who.code, name);
      // o número de seguidores dela mudou
      void this.peopleOf.load(who.code, false, true);
    } catch (err) {
      this.toasts.show(failedText(err));
    } finally {
      this.followBusy.set(false);
    }
  }

  /** O link que abre este perfil (para mandar a alguém). */
  protected async copyLink(): Promise<void> {
    const code = this.code();
    if (!code) return;
    const link = profileLink(code);
    await this.toasts.copy(link, 'Link do perfil copiado', `Não deu para copiar. O link é ${link}`);
  }

  // ===== Seguindo e Seguidores: os números na polaroid, e as listas numa ficha por cima =====
  /** Pede os números de quem está aberto (o seu também). */
  private readonly loadPeople = effect(() => {
    const code = this.code();
    const on = !!this.cloud.config();
    untracked(() => {
      this.peopleSheet()?.close();
      if (code && on) void this.peopleOf.load(code);
    });
  });
  /** Os números embaixo do nome; abrem as listas se a pessoa deixa (as suas, sempre). */
  protected readonly peopleCounts = computed(() => {
    const code = this.code();
    const data = code ? this.peopleOf.of(code) : undefined;
    return data ? { seguindo: data.seguindo, seguidores: data.seguidores, open: this.own() || data.listasVisiveis } : null;
  });

  protected openPeople(tab: PeopleTab): void {
    void this.peopleSheet()?.open(tab);
  }

  // ===== Abrir =====
  /** O mural inteiro: o seu, ou o da pessoa (como em Comparar), já no mural da pasta. */
  protected openWall(kind: Kind): void {
    const c = this.colleague();
    if (this.own()) {
      // o endereço do mural escolhe o mural (ver core/areas.ts)
      void this.router.navigateByUrl(wallPath(kind));
    } else if (c) {
      this.mural.kind.set(kind);
      this.colleagues.select(c.id);
      void this.router.navigate(['/comparar/mural']);
    }
  }

  protected open(review: Review): void {
    if (this.own()) {
      this.desk.openReview(review.id);
      return;
    }
    this.reader().open(review, this.name(), this.cards(), this.hidden().has(review.id), this.code());
  }

}
