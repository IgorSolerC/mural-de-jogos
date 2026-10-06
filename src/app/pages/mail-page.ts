import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BellOff, Check, Heart, Inbox, LayoutGrid, LucideAngularModule, UserPlus, UsersRound } from 'lucide-angular';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { CLOUD_COLLEAGUE_PREFIX, CloudMurals } from '../core/cloud-murals';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { compareCollections } from '../core/comparison';
import { Affinity, affinity } from '../core/comparison-stats';
import { FeedItem, Follow, Person, dayLabel, groupFeed } from '../core/follow';
import { countOf, profileOf } from '../core/kinds';
import { Review, fold, formatScore, newId, shownFinal } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { CoverSleeve } from '../ui/cover-sleeve';
import { JudgeLabel } from '../ui/judge-label';
import { Pin } from '../ui/pin';
import { ReviewReader } from '../ui/review-reader';
import { Toasts } from '../ui/toast';

type Tab = 'chegou' | 'pessoas';
const TABS: readonly Tab[] = ['chegou', 'pessoas'];
const TILTS = [-0.5, 0.4, -0.3, 0.6, -0.4, 0.2];
/** Afinidade só com obras suficientes em comum: com duas, a porcentagem diz pouco. */
const MIN_PAIRS = 3;

/**
 * O correio: o que chegou de quem você segue (as resenhas novas, um cartão por pessoa por dia, e quem
 * começou a seguir você) e as pessoas (seguir pelo código, silenciar, deixar de seguir, quem segue
 * você). Abrir conta tudo como visto. Os murais de quem aparece aqui só são baixados ao abrir, com a
 * pergunta "mudou?" à nuvem.
 */
@Component({
  selector: 'app-mail-page',
  imports: [CoverSleeve, JudgeLabel, LucideAngularModule, Pin, ReviewReader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mail-page.html',
  styleUrl: './mail-page.scss',
})
export class MailPage {
  protected readonly follow = inject(Follow);
  protected readonly account = inject(CloudAccount);
  protected readonly settings = inject(Settings);
  private readonly cloud = inject(Cloud);
  private readonly cloudMurals = inject(CloudMurals);
  private readonly colleagues = inject(ColleagueStore);
  private readonly store = inject(ReviewStore);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly InboxIcon = Inbox;
  protected readonly FollowIcon = UserPlus;
  protected readonly CheckIcon = Check;
  protected readonly WishIcon = Heart;
  protected readonly WallIcon = LayoutGrid;
  protected readonly MuteIcon = BellOff;
  protected readonly formatScore = formatScore;

  protected readonly tabs: readonly { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: 'chegou', label: 'Chegou', icon: Inbox },
    { id: 'pessoas', label: 'Pessoas', icon: UsersRound },
  ];
  protected readonly tab = signal<Tab>(TABS.includes(this.route.snapshot.queryParamMap.get('aba') as Tab) ? (this.route.snapshot.queryParamMap.get('aba') as Tab) : 'chegou');

  protected readonly cloudOn = computed(() => !!this.cloud.config());
  protected readonly groups = computed(() => groupFeed(this.follow.items()));
  protected readonly people = this.follow.people;
  protected readonly followingCount = computed(() => this.people()?.seguindo.length ?? 0);
  protected readonly peopleCount = computed(() => {
    const p = this.people();
    return p ? p.seguindo.length + p.seguidores.length : 0;
  });
  protected readonly peopleError = signal<string | null>(null);
  protected readonly masked = this.settings.noSpoilers;

  /** O "visto até" de quando a página abriu: o adesivo "Novo" fica enquanto ela estiver aberta. */
  private readonly freshSince = signal<string | null | undefined>(undefined);

  protected readonly code = signal('');
  protected readonly followError = signal<string | null>(null);
  /** O código da pessoa (ou 'form') com um pedido em andamento. */
  protected readonly busy = signal<string | null>(null);

  /** Os murais de quem aparece no correio, pelo código. */
  private readonly walls = computed(() => {
    const out = new Map<string, Colleague>();
    for (const c of this.colleagues.colleagues()) if (c.codigo) out.set(c.codigo, c);
    return out;
  });
  private readonly myReviews = computed(() => this.store.reviews().filter((r) => !r.revisitOf));
  /** Por pessoa: as fichas dela pelo id, a minha ficha da mesma obra e a afinidade. */
  private readonly matches = computed(() => {
    const out = new Map<string, { byId: Map<string, Review>; mine: Map<string, Review>; affinity: Affinity | null }>();
    const mine = this.myReviews();
    for (const [code, c] of this.walls()) {
      const theirs = c.reviews.filter((r) => !r.revisitOf);
      const { pairs } = compareCollections(mine, theirs);
      out.set(code, {
        byId: new Map(c.reviews.map((r) => [r.id, r])),
        mine: new Map(pairs.map((p) => [p.theirs.id, p.mine])),
        affinity: pairs.length >= MIN_PAIRS ? affinity(pairs) : null,
      });
    }
    return out;
  });
  private readonly wished = computed(() => new Set(this.store.wishes().map((w) => `${w.kind}:${fold(w.game.name)}`)));

  constructor() {
    // ao abrir (e ao entrar na conta com a página aberta): busca tudo, guarda o "visto até" e marca
    effect(() => {
      if (!this.follow.available()) return;
      untracked(() => void this.open());
    });
  }

  private async open(): Promise<void> {
    await this.follow.check(true);
    this.freshSince.set(this.follow.seenAt());
    void this.follow.loadPeople().then(
      () => this.peopleError.set(null),
      (e) => this.peopleError.set(e instanceof Error ? e.message : 'Não consegui buscar as pessoas.'),
    );
    // os murais de quem tem resenha no correio (no máximo 12 pessoas por vez)
    const codes = [...new Set(this.follow.items().filter((i) => i.tipo === 'resenha').map((i) => i.pessoa.codigo))].slice(0, 12);
    await Promise.all(codes.map((c) => this.cloudMurals.ensure(c)));
    await this.follow.markSeen();
  }

  protected go(id: Tab): void {
    this.tab.set(id);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { aba: id === 'chegou' ? null : id }, replaceUrl: true });
  }

  protected onTabKey(e: KeyboardEvent): void {
    const i = TABS.indexOf(this.tab());
    const next = e.key === 'ArrowRight' || e.key === 'End' ? 1 : e.key === 'ArrowLeft' || e.key === 'Home' ? 0 : -1;
    if (next < 0 || next === i) return;
    e.preventDefault();
    this.go(TABS[next]);
    queueMicrotask(() => document.getElementById(`aba-${TABS[next]}`)?.focus());
  }

  protected tilt(i: number): number {
    return TILTS[i % TILTS.length];
  }

  protected when(day: string): string {
    return dayLabel(day);
  }

  protected isFresh(em: string): boolean {
    const since = this.freshSince();
    return since !== undefined && (since === null || em > since);
  }

  /** "3 jogos", ou "3 resenhas" quando são de murais diferentes. */
  protected countText(items: readonly Extract<FeedItem, { tipo: 'resenha' }>[]): string {
    const kinds = new Set(items.map((i) => i.mural));
    if (kinds.size === 1) return countOf(profileOf(items[0].mural), items.length);
    return `${items.length} resenhas`;
  }

  protected reviewOf(code: string, ref: string): Review | null {
    return this.matches().get(code)?.byId.get(ref) ?? null;
  }

  protected mineOf(code: string, theirs: Review): Review | null {
    return this.matches().get(code)?.mine.get(theirs.id) ?? null;
  }

  protected affinityOf(code: string): Affinity | null {
    return this.matches().get(code)?.affinity ?? null;
  }

  protected shown(r: Review): number {
    return shownFinal(r);
  }

  protected isWished(r: Review): boolean {
    return this.wished().has(`${r.kind}:${fold(r.game.name)}`);
  }

  protected wantLabel(r: Review): string {
    const p = profileOf(r.kind);
    return `Quero ${p.verb}`;
  }

  protected wish(r: Review): void {
    if (this.isWished(r)) return;
    const now = new Date().toISOString();
    const id = newId();
    this.store.saveWish({ id, kind: r.kind, game: { ...r.game }, createdAt: now, updatedAt: now });
    this.toasts.show(`${r.game.name} foi pra sua wishlist`, { label: 'Desfazer', run: () => this.store.removeWish(id) });
  }

  protected openReview(r: Review, who: Person): void {
    const wall = this.walls().get(who.codigo);
    this.reader().open(r, wall?.name ?? who.nome, wall?.reviews.filter((x) => x.kind === r.kind) ?? []);
  }

  protected async openWall(who: Person): Promise<void> {
    const c = await this.cloudMurals.ensure(who.codigo);
    if (!c) {
      this.toasts.show(`Não consegui abrir o mural de ${who.nome} agora.`);
      return;
    }
    this.colleagues.select(CLOUD_COLLEAGUE_PREFIX + who.codigo.replace('-', ''));
    await this.router.navigate(['/comparar/mural']);
  }

  protected async followCode(e: Event): Promise<void> {
    e.preventDefault();
    if (this.busy()) return;
    this.busy.set('form');
    this.followError.set(null);
    try {
      const p = await this.follow.follow(this.code());
      this.code.set('');
      this.toasts.show(`Agora você segue ${p.nome}`);
    } catch (err) {
      this.followError.set(err instanceof Error ? err.message : 'Não consegui seguir agora.');
    } finally {
      this.busy.set(null);
    }
  }

  protected async followBack(p: Person): Promise<void> {
    await this.run(p.codigo, async () => {
      await this.follow.follow(p.codigo);
      this.toasts.show(`Agora você segue ${p.nome}`);
    });
  }

  protected async toggleMute(p: { codigo: string; nome: string; silenciado: boolean }): Promise<void> {
    await this.run(p.codigo, async () => {
      await this.follow.mute(p.codigo, !p.silenciado);
      this.toasts.show(p.silenciado ? `${p.nome} volta a contar no envelope` : `${p.nome} não conta mais no envelope`);
    });
  }

  protected async unfollow(p: Person): Promise<void> {
    await this.run(p.codigo, async () => {
      await this.follow.unfollow(p.codigo);
      // seguir de novo não manda outro aviso para a pessoa
      this.toasts.show(`Você deixou de seguir ${p.nome}`, { label: 'Desfazer', run: () => void this.follow.follow(p.codigo).catch(() => undefined) });
    });
  }

  protected async removeFollower(p: Person): Promise<void> {
    const sure = await this.confirm.ask({
      text: `${p.nome} deixa de seguir você e para de ver as suas resenhas no correio. O seu mural continua aberto para quem tem o seu código; para trocar o código, vá em Ajustes › Perfil.`,
      confirm: 'Tirar da lista',
    });
    if (!sure) return;
    await this.run(p.codigo, async () => {
      await this.follow.removeFollower(p.codigo);
      this.toasts.show(`${p.nome} não segue mais você`);
    });
  }

  protected async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.toasts.show('Código copiado');
    } catch {
      this.toasts.show(`O seu código é ${code}`);
    }
  }

  private async run(code: string, job: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(code);
    try {
      await job();
    } catch (err) {
      this.toasts.show(err instanceof Error ? err.message : 'Não deu certo agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }
}
