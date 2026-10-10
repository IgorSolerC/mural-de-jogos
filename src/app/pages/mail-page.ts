import { ChangeDetectionStrategy, Component, Injector, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { focusAfterRender } from '../ui/focus';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ArrowRight, Bell, BellOff, Check, Copy, Ellipsis, Heart, Inbox, Link, LucideAngularModule, RefreshCw, UserMinus, UserPlus, UserX, UsersRound } from 'lucide-angular';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { CloudMurals, cloudColleagueId, muralLink } from '../core/cloud-murals';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { compareCollections } from '../core/comparison';
import { FeedItem, Follow, FollowedPerson, Follower, Person, dayLabel, isUnseen, localDayOf } from '../core/follow';
import { profileOf } from '../core/kinds';
import { Review, fold, formatScore, isNote, newId, rootOf, shownFinal } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Mural } from '../core/mural';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { ReviewCard } from '../ui/review-card';
import { Pin } from '../ui/pin';
import { ReviewReader } from '../ui/review-reader';
import { Toasts } from '../ui/toast';
import { Busy } from '../ui/busy';
import { SpoilerShield } from '../core/spoiler-shield';
import { Desk } from '../core/desk';
import { ReactionTarget, Reactions } from '../core/reactions';
import { ReactionId, reactionOf } from '../core/reaction-kinds';
import { ReactionPicker } from '../ui/reactions';

/** A aba Feed guarda o id 'chegou' (o nome de antes): o endereço e o que já está guardado não mudam. */
type Tab = 'chegou' | 'pessoas';
/** O mural de alguém, para o Feed: ainda vindo, aqui, ou a nuvem não respondeu. */
type WallState = 'buscando' | 'pronto' | 'erro';

/** Uma resenha que chegou: a ficha do amigo (quando o mural dele já está aqui) e a minha da mesma obra. */
interface Post {
  key: string;
  item: Extract<FeedItem, { tipo: 'resenha' }>;
  dia: string;
  theirs: Review | null;
  mine: Review | null;
  secret: boolean;
  /** A ficha do amigo como alvo das reações. */
  target: ReactionTarget;
  /** ficha: a ficha está aqui; buscando: o mural ainda vem; saiu: o mural veio e ela não está; erro: não veio. */
  estado: 'ficha' | 'buscando' | 'saiu' | 'erro';
}

/** Quem reagiu às minhas fichas: as reações seguidas à mesma ficha viram um bilhete só. */
interface Reacted {
  key: string;
  /** A mais nova, que dá o dia e o "Novo". */
  item: Extract<FeedItem, { tipo: 'reagiu' }>;
  ref: string;
  titulo: string;
  dia: string;
  who: { pessoa: Person; reacao: ReactionId }[];
}

/** O Feed em blocos: um bilhete de quem começou a seguir, de quem reagiu, ou as resenhas seguidas de uma pessoa. */
type Block =
  | { tipo: 'seguiu'; key: string; item: Extract<FeedItem, { tipo: 'seguiu' }>; dia: string }
  | ({ tipo: 'reagiu' } & Reacted)
  | { tipo: 'pessoa'; key: string; pessoa: Person; posts: Post[] };

/** Uma pessoa na lista única de Pessoas: quem eu sigo e quem me segue, juntos. */
interface Someone {
  codigo: string;
  nome: string;
  /** Eu sigo (com o silenciado), ou null. */
  sigo: FollowedPerson | null;
  /** Ela me segue, ou null. */
  segue: Follower | null;
}
const TABS: readonly Tab[] = ['chegou', 'pessoas'];
const tabFrom = (v: string | null): Tab => (TABS.includes(v as Tab) ? (v as Tab) : 'chegou');
const TILTS = [-0.5, 0.4, -0.3, 0.6, -0.4, 0.2];

/**
 * Amigos: o que chegou de quem você segue (as resenhas novas, um cartão por pessoa por dia, e quem
 * começou a seguir você) e as pessoas (seguir pelo código, silenciar, deixar de seguir, quem segue
 * você). Abrir conta tudo como visto. Os murais de quem aparece aqui só são baixados ao abrir, com a
 * pergunta "mudou?" à nuvem.
 */
@Component({
  selector: 'app-mail-page',
  imports: [Busy, LucideAngularModule, NgTemplateOutlet, Pin, ReactionPicker, ReviewCard, ReviewReader, RouterLink],
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
  private readonly store = inject(ReviewStore);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly reader = viewChild.required(ReviewReader);
  private readonly muralKind = inject(Mural);
  private readonly desk = inject(Desk);
  protected readonly reactions = inject(Reactions);

  protected readonly InboxIcon = Inbox;
  protected readonly FollowIcon = UserPlus;
  protected readonly CheckIcon = Check;
  protected readonly WishIcon = Heart;
  protected readonly MuteIcon = BellOff;
  protected readonly UnmuteIcon = Bell;
  protected readonly MoreIcon = Ellipsis;
  protected readonly CopyIcon = Copy;
  protected readonly LinkIcon = Link;
  protected readonly RetryIcon = RefreshCw;
  protected readonly UnfollowIcon = UserMinus;
  protected readonly RemoveIcon = UserX;
  protected readonly GoIcon = ArrowRight;
  protected readonly formatScore = formatScore;

  protected readonly tabs: readonly { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: 'chegou', label: 'Feed', icon: Inbox },
    { id: 'pessoas', label: 'Pessoas', icon: UsersRound },
  ];
  protected readonly tab = signal<Tab>(tabFrom(this.route.snapshot.queryParamMap.get('aba')));
  /** Um link para outra aba (#/amigos?aba=pessoas) com a página já aberta também troca a aba. */
  private readonly followTabParam = this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => this.tab.set(tabFrom(q.get('aba'))));

  protected readonly cloudOn = computed(() => !!this.cloud.config());
  /** Separado: o plural do mural aberto ("animes"), para dizer que só ele aparece. */
  protected readonly onlyKind = computed(() => (this.settings.friendKinds() === 'separado' ? this.muralKind.profile().plural : null));
  /**
   * O que chegou, um por um: cada resenha nova é a ficha do amigo pregada aqui, com a minha ficha da
   * mesma obra, se eu tiver. Resenhas seguidas da mesma pessoa ficam sob uma fita só.
   */
  protected readonly blocks = computed<Block[]>(() => {
    const out: Block[] = [];
    for (const item of this.follow.visible()) {
      const dia = localDayOf(item.em);
      if (item.tipo === 'seguiu') {
        out.push({ tipo: 'seguiu', key: `seguiu:${item.pessoa.codigo}`, item, dia });
        continue;
      }
      if (item.tipo === 'reagiu') {
        const last = out[out.length - 1];
        if (last?.tipo === 'reagiu' && last.ref === item.ref) {
          // a mesma pessoa aparece uma vez só, com a reação mais nova
          if (!last.who.some((w) => w.pessoa.codigo === item.pessoa.codigo)) last.who.push({ pessoa: item.pessoa, reacao: item.reacao });
        } else {
          out.push({ tipo: 'reagiu', key: `reagiu:${item.ref}:${item.em}`, item, ref: item.ref, titulo: item.titulo, dia, who: [{ pessoa: item.pessoa, reacao: item.reacao }] });
        }
        continue;
      }
      const post = this.postOf(item, dia);
      const last = out[out.length - 1];
      if (last?.tipo === 'pessoa' && last.pessoa.codigo === item.pessoa.codigo) last.posts.push(post);
      else out.push({ tipo: 'pessoa', key: `pessoa:${item.pessoa.codigo}:${item.ref}`, pessoa: item.pessoa, posts: [post] });
    }
    return out;
  });

  private postOf(item: Extract<FeedItem, { tipo: 'resenha' }>, dia: string): Post {
    const key = `resenha:${item.pessoa.codigo}:${item.ref}`;
    const target: ReactionTarget = { code: item.pessoa.codigo, ref: item.ref, titulo: item.titulo, mural: item.mural };
    const theirs = this.reviewOf(item.pessoa.codigo, item.ref);
    if (!theirs) {
      // sem a ficha: o mural ainda vem, não veio, ou veio sem ela — e só "saiu" se o mural que veio é
      // de depois da resenha (a nuvem foi consultada com ela na lista); senão, ele ainda vai ser buscado
      const wall = this.wallState().get(item.pessoa.codigo);
      const checked = this.checked.has(`${item.pessoa.codigo}:${item.ref}`);
      const estado = wall === 'erro' ? 'erro' : wall === 'pronto' && checked ? 'saiu' : 'buscando';
      return { key, item, dia, theirs: null, mine: null, secret: false, target, estado };
    }
    // a anotação não tem nota: nada a comparar nem a esconder
    if (isNote(theirs)) return { key, item, dia, theirs, mine: null, secret: false, target, estado: 'ficha' };
    const mine = this.mineOf(item.pessoa.codigo, theirs);
    // "Notas dos outros: Evitar spoilers": o que eu ainda não avaliei vem em segredo
    const secret = !!this.matches().get(item.pessoa.codigo)?.hidden.has(theirs.id);
    return { key, item, dia, theirs, mine, secret, target, estado: 'ficha' };
  }

  protected readonly people = this.follow.people;
  protected readonly followingCount = computed(() => this.people()?.seguindo.length ?? 0);
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
  protected readonly peopleCount = computed(() => this.everyone().length);
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
  /** O bilhete de seguir na coluna do lado: guardado até a pessoa pedir. */
  protected readonly followOpen = signal(false);
  protected readonly followError = signal<string | null>(null);
  /** O pedido em andamento: 'form', ou 'código:ação' (a ação mostra o aro; a linha toda espera). */
  protected readonly busy = signal<string | null>(null);

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
    // as reações das fichas de quem aparece aqui (todo mundo vê; quem segue também reage)
    effect(() => {
      const codes = new Set(this.blocks().flatMap((b) => (b.tipo === 'pessoa' ? [b.pessoa.codigo] : [])));
      untracked(() => codes.forEach((code) => void this.reactions.load(code)));
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

  protected isFresh(item: FeedItem): boolean {
    const since = this.freshSince();
    return since !== undefined && isUnseen(item, since.at, since.keys);
  }

  /** "Bia", "Bia e Caio", "Bia, Caio e mais 2". */
  protected reactedNames(b: Reacted): string {
    const names = b.who.map((w) => w.pessoa.nome);
    if (names.length <= 2) return names.join(' e ');
    return `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;
  }

  /** As reações do bilhete, sem repetir. */
  protected reactedEmojis(b: Reacted): string[] {
    return [...new Set(b.who.map((w) => reactionOf(w.reacao).emoji))];
  }

  /** "à sua ficha de Hades", ou "à sua anotação Compras". */
  protected reactedWhat(b: Reacted): string {
    return b.item.mural === 'anotacoes' ? 'à sua anotação' : 'à sua ficha de';
  }

  /** O que o leitor de tela diz do bilhete: "Bia reagiu com Fogo à sua ficha de Hades". */
  protected reactedSpoken(b: Reacted): string {
    const how = [...new Set(b.who.map((w) => reactionOf(w.reacao).label))].join(', ');
    return `${this.reactedNames(b)} ${b.who.length > 1 ? 'reagiram' : 'reagiu'} com ${how} ${this.reactedWhat(b)} ${b.titulo}`;
  }

  /** A minha ficha que recebeu a reação, se ela ainda está no mural. */
  protected reactedReview(b: Reacted): Review | null {
    return this.store.get(b.ref) ?? null;
  }

  /** Abre a minha ficha que recebeu a reação, no leitor de sempre (com as reações embaixo). */
  protected openMine(r: Review): void {
    this.desk.openReview(r.id);
  }

  /** "avaliou", "escreveu uma rejogada" (releitura, reassistida), ou "publicou uma anotação". */
  protected verb(r: Review): string {
    if (isNote(r)) return 'publicou uma anotação';
    return r.revisitOf ? `escreveu uma ${profileOf(r.kind).revisit.one}` : 'avaliou';
  }

  /** O que vai na fita da pessoa: o verbo da ficha, quando é uma só; senão, pelo que chegou. */
  protected blockVerb(posts: readonly Post[]): string {
    if (posts.length === 1 && posts[0].theirs) return this.verb(posts[0].theirs);
    const notes = posts.filter((p) => this.isNotePost(p)).length;
    return notes === posts.length ? 'publicou anotações' : notes ? 'publicou' : 'avaliou';
  }

  /** O post é de uma anotação (sem nota, sem placar, sem wishlist)? */
  protected isNotePost(p: Post): boolean {
    return p.item.mural === 'anotacoes';
  }

  /** A nota do amigo menos a minha, como aparecem (Arredondado e Inteiros mudam a conta). */
  protected delta(theirs: Review, mine: Review): number {
    return Math.round((shownFinal(theirs) - shownFinal(mine)) * 10) / 10;
  }

  /** "+1,4", "−0,8". */
  protected signed(d: number): string {
    return `${d > 0 ? '+' : '−'}${formatScore(Math.abs(d))}`;
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

  protected openReview(r: Review, who: Person, secret = false): void {
    const wall = this.walls().get(who.codigo);
    this.reader().open(r, wall?.name ?? who.nome, wall?.reviews.filter((x) => x.kind === r.kind) ?? [], secret, who.codigo);
  }

  /** A inicial do crachazinho de cada pessoa na lista. */
  protected initial(name: string): string {
    return (name.trim()[0] ?? '?').toLocaleUpperCase('pt-BR');
  }

  protected async openWall(who: Person): Promise<void> {
    await this.run(`${who.codigo}:mural`, async () => {
      const c = await this.cloudMurals.ensure(who.codigo);
      if (!c) {
        this.toasts.show(`Não consegui abrir o mural de ${who.nome} agora.`);
        return;
      }
      this.colleagues.select(cloudColleagueId(who.codigo));
      await this.router.navigate(['/comparar/mural']);
    });
  }

  protected async followCode(e: Event): Promise<void> {
    e.preventDefault();
    if (this.busy()) return;
    this.busy.set('form');
    this.followError.set(null);
    try {
      const p = await this.follow.follow(this.code());
      this.code.set('');
      this.followOpen.set(false);
      this.toasts.show(`Agora você segue ${p.nome}`);
    } catch (err) {
      this.followError.set(err instanceof Error ? err.message : 'Não consegui seguir agora.');
    } finally {
      this.busy.set(null);
    }
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
      this.toasts.show(p.silenciado ? `${p.nome} volta a contar no número da aba` : `${p.nome} não conta mais no número da aba`);
    });
  }

  protected openFollow(): void {
    this.followOpen.set(true);
    focusAfterRender(this.injector, () => document.getElementById('codigo-lado'));
  }
  private readonly injector = inject(Injector);

  /** "Agora não" ou Esc: guarda o bilhete e devolve o foco ao botão que o abriu. */
  protected closeFollow(): void {
    this.followOpen.set(false);
    this.followError.set(null);
    focusAfterRender(this.injector, () => document.querySelector<HTMLElement>('.abrir-seguir'));
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
      await this.follow.unfollow(p.codigo);
      // seguir de novo não manda outro aviso para a pessoa
      this.toasts.show(`Você deixou de seguir ${p.nome}`, { label: 'Desfazer', run: () => void this.follow.follow(p.codigo).catch(() => undefined) });
    });
  }

  protected async removeFollower(p: Person): Promise<void> {
    const sure = await this.confirm.ask({
      text: `${p.nome} deixa de seguir você e para de ver as suas resenhas em Amigos. O seu mural continua aberto para quem tem o seu código; para trocar o código, vá em Ajustes › Perfil.`,
      confirm: 'Remover seguidor',
    });
    if (!sure) return;
    await this.run(`${p.codigo}:tirar`, async () => {
      await this.follow.removeFollower(p.codigo);
      this.toasts.show(`${p.nome} não segue mais você`);
    });
  }

  protected async copyLink(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(muralLink(code));
      this.toasts.show('Link do seu mural copiado');
    } catch {
      this.toasts.show(`O link é ${muralLink(code)}`);
    }
  }

  protected async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.toasts.show('Código copiado');
    } catch {
      this.toasts.show(`O seu código é ${code}`);
    }
  }

  private async run(key: string, job: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(key);
    try {
      await job();
    } catch (err) {
      this.toasts.show(err instanceof Error ? err.message : 'Não deu certo agora. Tente de novo.');
    } finally {
      this.busy.set(null);
    }
  }
}
