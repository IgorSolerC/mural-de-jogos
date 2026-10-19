import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { focusAfterRender, tabStep } from '../ui/focus';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideIconData } from 'lucide-angular';
import { ICON, IconModule } from '../ui/icons';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { CloudMurals, muralLink } from '../core/cloud-murals';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { compareCollections } from '../core/comparison';
import { FeedItem, Follow, FollowedPerson, Follower, Person, isUnseen } from '../core/follow';
import { CardNotice, SharedNotice, groupNotices } from '../core/notices';
import { SharedStore } from '../core/shared-store';
import { ProfilePeople } from '../core/profile-people';
import { Review, fold, isNote, newId, rootOf } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Mural } from '../core/mural';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { Pin } from '../ui/pin';
import { ReviewReader } from '../ui/review-reader';
import { Toasts } from '../ui/toast';
import { Busy } from '../ui/busy';
import { SpoilerShield } from '../core/spoiler-shield';
import { Desk } from '../core/desk';
import { ReactionTarget, Reactions } from '../core/reactions';
import { Comments } from '../core/comments';
import { FeedPost, FeedPostData } from '../ui/feed-post';
import { NoticeList } from '../ui/notice-list';
import { PersonFace, PersonPhoto } from '../ui/person-photo';
import { PineBoard } from '../ui/pine-board';
import { failedText, FollowToasts } from '../ui/follow-toasts';

/** A aba Feed guarda o id 'chegou' (o nome de antes): o endereço e o que já está guardado não mudam. */
type Tab = 'chegou' | 'avisos' | 'pessoas';
/** O mural de alguém, para o Feed: ainda vindo, aqui, ou a nuvem não respondeu. */
type WallState = 'buscando' | 'pronto' | 'erro';
type Resenha = Extract<FeedItem, { tipo: 'resenha' }>;

/** Uma pessoa na lista única de Pessoas: quem eu sigo e quem me segue, juntos. */
interface Someone {
  codigo: string;
  nome: string;
  /** Eu sigo (com o silenciado), ou null. */
  sigo: FollowedPerson | null;
  /** Ela me segue, ou null. */
  segue: Follower | null;
}
const TABS: readonly Tab[] = ['chegou', 'avisos', 'pessoas'];
const tabFrom = (v: string | null): Tab => (TABS.includes(v as Tab) ? (v as Tab) : 'chegou');
/** Quantos avisos cabem no quadro ao lado do Feed (os outros ficam na aba Avisos). */
const BOARD_NOTICES = 5;
/** Quantos rostos de quem eu sigo aparecem no bilhete do quadro. */
const BOARD_FACES = 8;

/**
 * Amigos, em três partes. O Feed é o que quem você segue pregou: um post por ficha, com a ficha de
 * verdade, a diferença para a sua nota e o reagir e o comentar ali mesmo. Os Avisos são o que
 * aconteceu com você (quem começou a seguir, reagiu ou comentou nas suas fichas): num quadro ao lado
 * do Feed, nas telas largas, e numa aba própria. Pessoas é seguir pelo código, silenciar, deixar de
 * seguir e quem segue você. Abrir conta tudo como visto. Os murais de quem aparece no Feed só são
 * baixados ao abrir, com a pergunta "mudou?" à nuvem.
 */
@Component({
  selector: 'app-mail-page',
  imports: [Busy, FeedPost, IconModule, NoticeList, PersonPhoto, Pin, PineBoard, ReviewReader, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mail-page.html',
  styleUrl: './mail-page.scss',
})
export class MailPage {
  protected readonly follow = inject(Follow);
  protected readonly account = inject(CloudAccount);
  protected readonly settings = inject(Settings);
  private readonly shield = inject(SpoilerShield);
  private readonly cloud = inject(Cloud);
  private readonly cloudMurals = inject(CloudMurals);
  private readonly colleagues = inject(ColleagueStore);
  private readonly profilePeople = inject(ProfilePeople);
  private readonly store = inject(ReviewStore);
  private readonly toasts = inject(Toasts);
  private readonly followToasts = inject(FollowToasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly reader = viewChild.required(ReviewReader);
  private readonly muralKind = inject(Mural);
  private readonly desk = inject(Desk);
  private readonly reactions = inject(Reactions);
  private readonly comments = inject(Comments);
  private readonly injector = inject(Injector);

  protected readonly FollowIcon = ICON.seguir;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly MuteIcon = ICON.silenciar;
  protected readonly UnmuteIcon = ICON.avisos;
  protected readonly MoreIcon = ICON.maisOpcoes;
  protected readonly CopyIcon = ICON.copiar;
  protected readonly LinkIcon = ICON.link;
  protected readonly UnfollowIcon = ICON.deixarDeSeguir;
  protected readonly RemoveIcon = ICON.removerPessoa;

  protected readonly tabs: readonly { id: Tab; label: string; icon: LucideIconData }[] = [
    { id: 'chegou', label: 'Feed', icon: ICON.feed },
    { id: 'avisos', label: 'Avisos', icon: ICON.avisos },
    { id: 'pessoas', label: 'Pessoas', icon: ICON.pessoas },
  ];
  /** Cada etiqueta colada de um jeito, sempre o mesmo. */
  protected readonly tilts = ['-1.1deg', '0.8deg', '-0.6deg'];
  protected readonly tab = signal<Tab>(tabFrom(this.route.snapshot.queryParamMap.get('aba')));
  /** Um link para outra aba (#/amigos?aba=pessoas) com a página já aberta também troca a aba. */
  private readonly followTabParam = this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => this.tab.set(tabFrom(q.get('aba'))));

  protected readonly cloudOn = computed(() => !!this.cloud.config());
  /** Separado: o plural do mural aberto ("animes"), para dizer que só ele aparece. */
  protected readonly onlyKind = computed(() => (this.settings.friendKinds() === 'separado' ? this.muralKind.profile().plural : null));

  /**
   * O Feed: cada resenha que chegou é um post, com a ficha do amigo (quando o mural dele já está
   * aqui) e a minha ficha da mesma obra, se eu tiver. Do mais novo para o mais velho. A que saiu do
   * mural (apagada, ou que virou privada) não aparece: um post avisando que algo não existe não diz
   * nada. Publicada de novo, ela volta.
   */
  protected readonly posts = computed<FeedPostData[]>(() =>
    this.follow.visible().flatMap((item) => {
      if (item.tipo !== 'resenha') return [];
      const post = this.postOf(item);
      return post.estado === 'saiu' ? [] : [post];
    }),
  );

  /** Os Avisos: quem começou a seguir, reagiu ou comentou, com os seguidos sobre a mesma ficha juntos. */
  protected readonly notices = computed(() => groupNotices(this.follow.visible()));
  /** Os que cabem no quadro ao lado do Feed. */
  protected readonly boardNotices = computed(() => this.notices().slice(0, BOARD_NOTICES));
  /** Os avisos que chegaram depois da última vez que a página foi aberta (as chaves deles). */
  protected readonly freshNotices = computed<ReadonlySet<string>>(() => new Set(this.notices().flatMap((n) => (this.isFresh(n.item) ? [n.key] : []))));

  /** As fichas em segredo reveladas com "Revelar" (a chave do post), só enquanto a página estiver aberta. */
  private readonly revealed = signal<ReadonlySet<string>>(new Set());

  protected reveal(p: FeedPostData): void {
    this.revealed.update((s) => new Set(s).add(p.key));
  }

  private postOf(item: Resenha): FeedPostData {
    const key = `resenha:${item.pessoa.codigo}:${item.ref}`;
    const target: ReactionTarget = { code: item.pessoa.codigo, ref: item.ref, titulo: item.titulo, mural: item.mural };
    const theirs = this.reviewOf(item.pessoa.codigo, item.ref);
    if (!theirs) {
      // sem a ficha: o mural ainda vem, não veio, ou veio sem ela — e só "saiu" se o mural que veio é
      // de depois da resenha (a nuvem foi consultada com ela na lista); senão, ele ainda vai ser buscado
      const wall = this.wallState().get(item.pessoa.codigo);
      const checked = this.checked.has(`${item.pessoa.codigo}:${item.ref}`);
      const estado = wall === 'erro' ? 'erro' : wall === 'pronto' && checked ? 'saiu' : 'buscando';
      return { key, item, theirs: null, mine: null, secret: false, target, estado };
    }
    // a anotação não tem nota: nada a comparar nem a esconder
    if (isNote(theirs)) return { key, item, theirs, mine: null, secret: false, target, estado: 'ficha' };
    const mine = this.mineOf(item.pessoa.codigo, theirs);
    // "Notas dos outros: Evitar spoilers": o que eu ainda não avaliei vem em segredo, até ser revelado
    const secret = !!this.matches().get(item.pessoa.codigo)?.hidden.has(theirs.id) && !this.revealed().has(key);
    return { key, item, theirs, mine, secret, target, estado: 'ficha' };
  }

  protected readonly people = this.follow.people;
  protected readonly followingCount = computed(() => this.people()?.seguindo.length ?? 0);
  /** Quem eu sigo, para os rostos do bilhete do quadro (os primeiros; o resto vira "+N"). */
  protected readonly boardFaces = computed(() => this.people()?.seguindo.slice(0, BOARD_FACES) ?? []);
  protected readonly moreFaces = computed(() => Math.max(0, this.followingCount() - BOARD_FACES));
  /**
   * Pessoas, numa lista só: cada pessoa uma vez, com a relação ("Vocês se seguem", "Você segue",
   * "Segue você"). Quem segue você sem você seguir de volta vem primeiro (tem o que fazer); depois
   * pelo nome.
   */
  protected readonly everyone = computed<Someone[]>(() => {
    const p = this.people();
    if (!p) return [];
    const byCode = new Map<string, Someone>();
    for (const f of p.seguindo) byCode.set(f.codigo, { codigo: f.codigo, nome: f.nome, sigo: f, segue: null });
    for (const f of p.seguidores) {
      const known = byCode.get(f.codigo);
      if (known) known.segue = f;
      else byCode.set(f.codigo, { codigo: f.codigo, nome: f.nome, sigo: null, segue: f });
    }
    const pending = (x: Someone) => (x.segue && !x.sigo ? 0 : 1);
    return [...byCode.values()].sort((a, b) => pending(a) - pending(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  });
  /** A lista em dois grupos: quem espera você seguir de volta, e o resto. */
  protected readonly groups = computed(() => {
    const all = this.everyone();
    const waiting = all.filter((x) => x.segue && !x.sigo);
    return [
      { id: 'voltar', titulo: 'Para seguir de volta', pessoas: waiting },
      { id: 'todas', titulo: 'Suas pessoas', pessoas: all.filter((x) => !waiting.includes(x)) },
    ].filter((g) => g.pessoas.length);
  });
  /**
   * O começo de tudo: a lista chegou, ninguém é seguido e nada chegou. O Feed mostra só o bilhete com
   * o primeiro passo, sem o quadro de avisos ao lado repetindo que não há nada.
   */
  protected readonly starting = computed(() => !!this.people() && !this.followingCount() && !this.posts().length && !this.notices().length);
  /** A pessoa com as opções abertas na lista (uma por vez). */
  protected readonly openRow = signal<string | null>(null);
  /** O estado do mural de cada pessoa que tem resenha no Feed. */
  protected readonly wallState = signal<ReadonlyMap<string, WallState>>(new Map());
  protected readonly peopleError = signal<string | null>(null);

  /** As resenhas (`código:ref`) já procuradas num mural pedido à nuvem depois que elas chegaram. */
  private readonly checked = new Set<string>();
  /** A primeira busca dos murais terminou: daí em diante, resenha nova busca o mural sozinha. */
  private opened = false;

  /** O visto de quando a página abriu: o adesivo "Novo" fica enquanto ela estiver aberta. */
  private readonly freshSince = signal<{ at: string | null; keys: ReadonlySet<string> } | undefined>(undefined);

  protected readonly code = signal('');
  protected readonly followError = signal<string | null>(null);
  /** O pedido em andamento: 'form', ou 'código:ação' (a ação mostra o aro; a linha toda espera). */
  protected readonly busy = signal<string | null>(null);
  /** O código de quem está sendo seguido de volta agora (para o botão do aviso esperar). */
  /** A anotação compartilhada de que a pessoa está saindo agora. */
  protected readonly leavingNote = computed(() => (this.busy()?.endsWith(':sair') ? this.busy()!.slice(0, -':sair'.length) : null));
  protected readonly followingBack = computed(() => (this.busy()?.endsWith(':seguir') ? this.busy()!.slice(0, -':seguir'.length) : null));

  protected isBusy(code: string, action: string): boolean {
    return this.busy() === `${code}:${action}`;
  }

  protected rowBusy(code: string): boolean {
    return !!this.busy()?.startsWith(`${code}:`);
  }

  /** Os murais de quem aparece em Amigos, pelo código. */
  private readonly walls = computed(() => {
    const out = new Map<string, Colleague>();
    for (const c of this.colleagues.colleagues()) if (c.codigo) out.set(c.codigo, c);
    return out;
  });
  /**
   * A foto do perfil de cada pessoa (o emoji na cartolina), pelo código: a do cartão que vem com as
   * minhas listas de Seguindo e Seguidores e, de quem tem o mural aberto aqui, a do perfil dele (a mais
   * nova). Quem não tem foto fica com a inicial.
   */
  protected readonly faces = computed<ReadonlyMap<string, PersonFace>>(() => {
    const out = new Map<string, PersonFace>();
    const me = this.account.account()?.codigo;
    const lists = me ? this.profilePeople.of(me)?.listas : undefined;
    for (const p of [...(lists?.seguindo ?? []), ...(lists?.seguidores ?? [])]) if (p.cartao) out.set(p.codigo, { emoji: p.cartao.emoji, cor: p.cartao.cor });
    for (const [code, c] of this.walls()) if (c.profile) out.set(code, { emoji: c.profile.emoji, cor: c.profile.photo });
    return out;
  });
  private readonly myReviews = computed(() => this.store.reviews().filter((r) => !r.revisitOf));
  /** Por pessoa: as fichas dela pelo id e a minha ficha da mesma obra. */
  private readonly matches = computed(() => {
    const out = new Map<string, { byId: Map<string, Review>; mine: Map<string, Review>; hidden: ReadonlySet<string> }>();
    const mine = this.myReviews();
    for (const [code, c] of this.walls()) {
      const theirs = c.reviews.filter((r) => !r.revisitOf);
      const { pairs } = compareCollections(mine, theirs);
      out.set(code, {
        byId: new Map(c.reviews.map((r) => [r.id, r])),
        mine: new Map(pairs.map((p) => [p.theirs.id, p.mine])),
        hidden: this.shield.hiddenIn(c.reviews),
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
    // as reações e os comentários das fichas de quem aparece aqui (todo mundo vê; quem segue também reage e comenta)
    effect(() => {
      const codes = new Set(this.posts().map((p) => p.item.pessoa.codigo));
      untracked(() =>
        codes.forEach((code) => {
          void this.reactions.load(code);
          void this.comments.loadCounts(code);
        }),
      );
    });
    // chegou resenha com a página aberta: o mural guardado da pessoa é de antes dela, busca de novo
    effect(() => {
      this.follow.items();
      untracked(() => {
        if (this.opened) void this.fetchWalls(false);
      });
    });
  }

  private async open(): Promise<void> {
    await this.follow.check(true);
    this.freshSince.set({ at: this.follow.seenAt(), keys: this.follow.seenKeys() });
    void this.follow.loadPeople().then(
      () => this.peopleError.set(null),
      (e) => this.peopleError.set(e instanceof Error ? e.message : 'Não consegui buscar as pessoas.'),
    );
    // as fotos de perfil de quem eu sigo e de quem me segue vêm com as minhas listas (sem elas, a inicial)
    const me = this.account.account()?.codigo;
    if (me) void this.profilePeople.load(me, true);
    await this.fetchWalls(true);
    this.opened = true;
    await this.follow.markSeen();
  }

  /** As resenhas do Feed de cada pessoa, pelo código. */
  private refsByPerson(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const i of this.follow.items()) if (i.tipo === 'resenha') out.set(i.pessoa.codigo, [...(out.get(i.pessoa.codigo) ?? []), i.ref]);
    return out;
  }

  /**
   * Busca os murais de quem tem resenha no Feed, quatro pedidos por vez (cada um pergunta "mudou?").
   * `all`: de todo mundo (ao abrir). Senão, os de quem apareceu no Feed depois e os que já vieram
   * mas não têm uma resenha que chegou depois. Os que estão vindo ou falharam (esses têm "Tentar de
   * novo") ficam como estão.
   */
  private async fetchWalls(all: boolean): Promise<void> {
    const todo: [string, string[]][] = [];
    for (const [code, refs] of this.refsByPerson()) {
      const state = this.wallState().get(code);
      if (all || state === undefined) {
        todo.push([code, refs]);
        continue;
      }
      if (state !== 'pronto') continue;
      if (refs.some((ref) => !this.reviewOf(code, ref) && !this.checked.has(`${code}:${ref}`))) todo.push([code, refs]);
    }
    for (const [c] of todo) this.setWall(c, 'buscando');
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, async () => {
      for (let next = todo.shift(); next; next = todo.shift()) await this.fetchWall(next[0], next[1]);
    }));
  }

  /** Busca (ou confere) o mural de alguém e guarda se veio: sem ele, o post diz que está buscando ou que falhou. */
  private async fetchWall(code: string, refs: readonly string[] = this.refsByPerson().get(code) ?? []): Promise<void> {
    this.setWall(code, 'buscando');
    const started = Date.now();
    const c = await this.cloudMurals.ensure(code, refs);
    // veio da nuvem agora (e não o guardado de antes, que é o que volta sem rede)
    const fresh = !!c && Date.parse(c.loadedAt) >= started;
    // o mural novo é de depois destas resenhas: a que não estiver nele, saiu mesmo
    if (fresh) for (const ref of refs) this.checked.add(`${code}:${ref}`);
    const missing = !!c && refs.some((ref) => !c.reviews.some((r) => r.id === ref));
    // só o guardado, e sem alguma resenha: não dá para dizer que saiu, então "Tentar de novo"
    this.setWall(code, !c || (!fresh && missing) ? 'erro' : 'pronto');
  }

  private setWall(code: string, state: WallState): void {
    this.wallState.update((m) => new Map(m).set(code, state));
  }

  /** "Tentar de novo" num post cujo mural não veio. */
  protected async retryWall(code: string): Promise<void> {
    if (this.wallState().get(code) === 'buscando') return;
    await this.fetchWall(code);
  }

  protected go(id: Tab): void {
    this.tab.set(id);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { aba: id === 'chegou' ? null : id }, replaceUrl: true });
  }

  /** As setas andam pelas abas (dão a volta); Home e End vão às pontas. */
  protected onTabKey(e: KeyboardEvent): void {
    const i = TABS.indexOf(this.tab());
    const next = tabStep(e.key, i, TABS.length);
    if (next < 0 || next === i) return;
    e.preventDefault();
    this.go(TABS[next]);
    queueMicrotask(() => document.getElementById(`aba-${TABS[next]}`)?.focus());
  }

  protected isFresh(item: FeedItem): boolean {
    const since = this.freshSince();
    return since !== undefined && isUnseen(item, since.at, since.keys);
  }

  /** Abre a ficha do amigo no leitor (com `comments`, já na folha de comentários). */
  protected openPost(p: FeedPostData, comments: boolean): void {
    if (!p.theirs) return;
    if (comments) this.comments.want(p.theirs.id);
    this.openReview(p.theirs, p.item.pessoa, p.secret);
  }

  /**
   * Um aviso tocado: a minha ficha que recebeu a reação, ou os comentários dela; a resposta a um
   * comentário meu abre a conversa já nela, na minha ficha (ou na anotação compartilhada que está no
   * meu mural) ou na ficha da outra pessoa, que vem do mural dela.
   */
  protected openNotice(n: CardNotice): void {
    const mine = this.store.get(n.item.ref);
    if (n.tipo === 'respondeu') {
      if (mine) {
        this.comments.want(mine.id, n.item.comentario ?? undefined);
        this.desk.openReview(mine.id);
      } else void this.openTheirs(n.item.dono, n.item.ref, n.item.comentario);
      return;
    }
    if (!mine) return;
    if (n.tipo === 'comentou') this.openMyComments(mine);
    else this.desk.openReview(mine.id);
  }

  /** A ficha `ref` do mural de `code`, aberta na conversa (no comentário `comment`, se veio). */
  private async openTheirs(code: string, ref: string, comment: string | null): Promise<void> {
    const wall = await this.cloudMurals.ensure(code, [ref]);
    const r = wall?.reviews.find((x) => x.id === ref);
    if (!wall || !r) {
      this.toasts.show(wall ? 'Essa ficha não está mais no mural.' : 'Não consegui abrir essa ficha agora. Tente de novo.');
      return;
    }
    this.comments.want(r.id, comment ?? undefined);
    this.openReview(r, { codigo: code, nome: wall.name });
  }

  /** Abre a minha ficha já com os comentários à mostra. */
  protected openMyComments(r: Review): void {
    this.comments.want(r.id);
    this.desk.openReview(r.id);
  }

  protected reviewOf(code: string, ref: string): Review | null {
    return this.matches().get(code)?.byId.get(ref) ?? null;
  }

  /**
   * A minha ficha da mesma obra. A comparação casa só as fichas originais, então uma rejogada (releitura,
   * reassistida) do amigo procura pela original dela; se a original não está no mural público (ficou
   * privada), a rejogada é casada como se fosse a obra.
   */
  protected mineOf(code: string, theirs: Review): Review | null {
    const found = this.matches().get(code)?.mine.get(rootOf(theirs));
    if (found || !theirs.revisitOf) return found ?? null;
    const { revisitOf: _, ...asWork } = theirs;
    return compareCollections(this.myReviews(), [asWork]).pairs[0]?.mine ?? null;
  }

  protected isWished(r: Review): boolean {
    return this.wished().has(`${r.kind}:${fold(r.game.name)}`);
  }

  protected wish(r: Review): void {
    if (this.isWished(r)) return;
    const now = new Date().toISOString();
    const id = newId();
    this.store.saveWish({ id, kind: r.kind, game: { ...r.game }, createdAt: now, updatedAt: now });
    this.toasts.show(`${r.game.name} foi pra sua wishlist`, { label: 'Desfazer', run: () => this.store.removeWish(id) });
  }

  protected openReview(r: Review, who: Person, secret = false): void {
    const wall = this.walls().get(who.codigo);
    this.reader().open(r, wall?.name ?? who.nome, wall?.reviews.filter((x) => x.kind === r.kind) ?? [], secret, who.codigo);
  }

  /** O nome de alguém leva ao perfil da pessoa (de lá, cada pasta abre um mural dela). */
  protected openProfile(who: Pick<Person, 'codigo'>): void {
    void this.router.navigate(['/perfil', who.codigo]);
  }

  /** "Seguir alguém", de fora da aba Pessoas: vai para ela, com o foco no campo do código. */
  protected goFollow(): void {
    this.go('pessoas');
    focusAfterRender(this.injector, () => document.getElementById('codigo-seguir'));
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

  private readonly shared = inject(SharedStore);

  /** O aviso de uma anotação compartilhada com você: ela abre no seu mural (já está nele). */
  protected openShared(n: SharedNotice): void {
    if (this.store.get(n.item.ref)) this.desk.openReview(n.item.ref);
    else this.shared.refreshSoon();
  }

  /** Sair da anotação que compartilharam com você, direto do aviso: ela some do seu mural (e o aviso, daqui). */
  protected async leaveShared(n: SharedNotice): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Sair desta anotação?',
      text: `“${n.item.titulo}” sai do seu mural. Ela continua com ${n.item.pessoa.nome} e com quem mais está nela; para voltar, alguém precisa chamar você de novo.`,
      confirm: 'Sair da anotação',
    });
    if (!sure) return;
    await this.run(`${n.item.ref}:sair`, async () => {
      await this.shared.leave(n.item.ref);
      this.follow.forget((i) => i.tipo === 'compartilhou' && i.ref === n.item.ref);
      this.toasts.show(`Você saiu de “${n.item.titulo}”`);
    });
  }

  protected async followBack(p: Person): Promise<void> {
    await this.run(`${p.codigo}:seguir`, async () => {
      await this.follow.follow(p.codigo);
      this.toasts.show(`Agora você segue ${p.nome}`);
    });
  }

  protected async toggleMute(p: { codigo: string; nome: string; silenciado: boolean }): Promise<void> {
    await this.run(`${p.codigo}:silenciar`, async () => {
      await this.follow.mute(p.codigo, !p.silenciado);
      this.toasts.show(p.silenciado ? `${p.nome} volta a contar no número do botão` : `${p.nome} não conta mais no número do botão`);
    });
  }

  protected toggleRow(code: string): void {
    this.openRow.update((c) => (c === code ? null : code));
  }

  /** Esc dentro das opções: fecha e devolve o foco ao "⋯" da pessoa. */
  protected closeRow(code: string): void {
    this.openRow.set(null);
    focusAfterRender(this.injector, () => document.getElementById(`opcoes-btn-${code}`));
  }

  /** "Vocês se seguem", "Você segue" ou "Segue você". */
  protected bond(x: Someone): string {
    return x.sigo && x.segue ? 'Vocês se seguem' : x.sigo ? 'Você segue' : 'Segue você';
  }

  protected async unfollow(p: Person): Promise<void> {
    await this.run(`${p.codigo}:deixar`, async () => {
      await this.followToasts.stop(p.codigo, p.nome);
    });
  }

  protected async removeFollower(p: Person): Promise<void> {
    const sure = await this.confirm.ask({
      text: `${p.nome} deixa de seguir você e para de ver as suas resenhas em Amigos. O seu mural continua aberto para quem tem o seu código; para trocar o código, vá em Ajustes › Conta.`,
      confirm: 'Remover seguidor',
    });
    if (!sure) return;
    await this.run(`${p.codigo}:tirar`, async () => {
      await this.follow.removeFollower(p.codigo);
      this.toasts.show(`${p.nome} não segue mais você`);
    });
  }

  protected async copyLink(code: string): Promise<void> {
    await this.toasts.copy(muralLink(code), 'Link do seu mural copiado', `Não deu para copiar. O link é ${muralLink(code)}`);
  }

  protected async copyCode(code: string): Promise<void> {
    await this.toasts.copy(code, 'Código copiado', `Não deu para copiar. O seu código é ${code}`);
  }

  private async run(key: string, job: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(key);
    try {
      await job();
    } catch (err) {
      this.toasts.show(failedText(err));
    } finally {
      this.busy.set(null);
    }
  }
}
