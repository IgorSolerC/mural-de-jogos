import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ICON, IconModule } from '../ui/icons';
import { ColleagueStore } from '../core/colleague-store';
import { Cloud } from '../core/cloud-config';
import { CloudMurals, cloudColleagueId, normalizeCode } from '../core/cloud-murals';
import { CloudAccount } from '../core/cloud-account';
import { ReviewPair, compareCollections, distinctReviews } from '../core/comparison';
import { affinity, portrait } from '../core/comparison-stats';
import { SCORED_KINDS, Kind, cap, countOf, g, profileOf } from '../core/kinds';
import { Follow } from '../core/follow';
import { ProfilePeople } from '../core/profile-people';
import { ProfileStore } from '../core/profile-store';
import { mediaSignal } from '../core/media';
import { Mural } from '../core/mural';
import {
  DIFFICULTY_LABEL,
  Review,
  SCORE_LABEL,
  fold,
  formatAmount,
  formatReviewDate,
  formatScore,
  shownFinal,
  newId,
  originalsOf,
  ratedKeys,
  scoreOf,
  sortBonuses,
  weightOf,
} from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SideBySide } from '../core/side-by-side';
import { SpoilerShield } from '../core/spoiler-shield';
import { ViewTransitions } from '../core/view-transitions';
import { WallView } from '../core/wall-view';
import { Desk } from '../core/desk';
import { NgTemplateOutlet } from '@angular/common';
import { BonusSticker } from '../ui/bonus';
import { Skulls } from '../ui/difficulty';
import { ReviewCard } from '../ui/review-card';
import { ReviewReader } from '../ui/review-reader';
import { SearchStrip } from '../ui/search-strip';
import { StatusLabel } from '../ui/status-label';
import { Toasts } from '../ui/toast';
import { VerdictStamp } from '../ui/verdict';
import { Caderno, OpenRequest } from './comparison/caderno';
import { Dupla, DuplaWall, PickPerson } from './comparison/dupla';
import { KIND_ICON } from '../ui/kind-switcher';
import { PersonFace } from '../ui/person-photo';
import { Pin } from '../ui/pin';
import { nameCollator } from '../core/text';
import { reducedMotion } from '../core/motion';

type Tab = 'comum' | 'dicas' | 'minhas';
type PairSort = 'briga' | 'minha' | 'colega' | 'nome';
type ListSort = 'nota' | 'nome' | 'recente';

/** Uma linha do Nota a nota: uma nota (com a maior circulada) ou um fato da ficha. */
interface NoteRow {
  id: string;
  label: string;
  kind: 'final' | 'score' | 'verdict' | 'bonus' | 'hours' | 'status' | 'difficulty' | 'date';
  mine: number | null;
  theirs: number | null;
  weightA: string;
  weightB: string;
  best: 'mine' | 'theirs' | null;
  /** Igual nos dois lados: escrito uma vez, no meio da linha. */
  same: boolean;
  /** Primeira linha dos fatos: um traço cheio a separa das notas. */
  split?: boolean;
}

/** Quantos pares (ou fichas soltas) aparecem de cada vez. */
const PAGE = 12;

const byName = (a: Review, b: Review) => nameCollator.compare(a.game.name, b.game.name) || a.id.localeCompare(b.id);

/**
 * Comparar murais: o mural de um amigo aberto ao lado do seu, sem se misturar com ele. Só com conta:
 * a pessoa vem da nuvem, escolhida na lista de amigos (quem você segue e quem segue você) ou pelo
 * código; backup de colega não entra mais. No alto, a ficha da dupla (como a da visita ao mural de
 * alguém); depois, o caderno de perguntas (o gosto de cada um) e, embaixo, as fichas: as obras em
 * comum lado a lado e as dicas de cada um para o outro. Segue o mural aberto no cartaz, como o
 * Ranking; os outros murais ficam nas orelhas da ficha.
 */
@Component({
  selector: 'app-comparison-page',
  imports: [
    BonusSticker,
    Caderno,
    Dupla,
    IconModule,
    NgTemplateOutlet,
    Pin,
    ReviewCard,
    ReviewReader,
    RouterLink,
    SearchStrip,
    Skulls,
    StatusLabel,
    VerdictStamp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comparison-page.html',
  styleUrl: './comparison-page.scss',
})
export class ComparisonPage {
  protected readonly colleagues = inject(ColleagueStore);
  protected readonly cloud = inject(Cloud);
  protected readonly account = inject(CloudAccount);
  protected readonly follow = inject(Follow);
  private readonly cloudMurals = inject(CloudMurals);
  private readonly profilePeople = inject(ProfilePeople);
  private readonly profiles = inject(ProfileStore);
  protected readonly cloudOn = computed(() => !!this.cloud.config());
  /** O código de quem está sendo aberto agora, e o que deu errado na última tentativa. */
  protected readonly opening = signal<string | null>(null);
  protected readonly pickError = signal<{ text: string; code: boolean } | null>(null);
  /** O colega aberto se atualiza da nuvem ao aparecer aqui (a cada 2 minutos, no máximo). */
  private readonly refreshCloud = effect(() => {
    const c = this.colleague();
    if (c) untracked(() => void this.cloudMurals.refresh(c));
  });
  /** As fotos dos amigos vêm com as listas do seu perfil. */
  private readonly loadFaces = effect(() => {
    const code = this.account.account()?.codigo;
    if (code && this.follow.available()) untracked(() => void this.profilePeople.load(code, true));
  });
  protected readonly mural = inject(Mural);
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly toasts = inject(Toasts);
  private readonly vt = inject(ViewTransitions);
  private readonly view = inject(WallView);
  private readonly side = inject(SideBySide);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly ChevronIcon = ICON.abrir;
  protected readonly FullIcon = ICON.completas;
  protected readonly CompactIcon = ICON.simples;
  protected readonly WishIcon = ICON.querer;
  protected readonly DoneIcon = ICON.naWishlist;
  protected readonly fmt = formatScore;
  protected readonly abs = Math.abs;
  protected readonly g = g;
  protected readonly cap = cap;
  protected readonly PAGE = PAGE;

  private readonly phone = mediaSignal('(max-width: 699px)');

  // ===== O colega =====
  /** Só com conta: sem ela, nada guardado de antes aparece (ver a folha de entrar). */
  protected readonly colleague = computed(() => (this.follow.available() ? this.colleagues.selected() : null));
  protected readonly name = computed(() => this.colleague()?.name ?? 'Colega');

  /** Você na ficha: o código, o nome e a foto do seu perfil. */
  protected readonly me = computed(() => {
    const a = this.account.account();
    const p = this.profiles.profile();
    const face: PersonFace = { emoji: p.emoji, cor: p.photo };
    return { codigo: a?.codigo ?? 'eu', nome: a?.nome ?? 'Você', face };
  });

  /**
   * Com quem comparar: os amigos (quem você segue e quem segue você, cada um uma vez, pelo nome) e,
   * depois, quem foi aberto pelo código e não é amigo. null enquanto a lista de amigos não chegou.
   */
  protected readonly people = computed<PickPerson[] | null>(() => {
    const list = this.follow.people();
    if (!list) return null;
    const me = this.account.account()?.codigo;
    const cards = me ? this.profilePeople.of(me)?.listas : undefined;
    const faces = new Map<string, PersonFace>();
    for (const p of [...(cards?.seguindo ?? []), ...(cards?.seguidores ?? [])]) if (p.cartao) faces.set(p.codigo, { emoji: p.cartao.emoji, cor: p.cartao.cor });
    const saved = new Map(this.colleagues.colleagues().flatMap((c) => (c.codigo ? [[c.codigo, c] as const] : [])));
    for (const [code, c] of saved) if (c.profile) faces.set(code, { emoji: c.profile.emoji, cor: c.profile.photo });
    const out = new Map<string, PickPerson>();
    const add = (codigo: string, nome: string, relacao: string) => out.set(codigo, { codigo, nome, relacao, face: faces.get(codigo) ?? null });
    const followers = new Set(list.seguidores.map((p) => p.codigo));
    for (const p of list.seguindo) add(p.codigo, p.nome, followers.has(p.codigo) ? 'Vocês se seguem' : 'Você segue');
    for (const p of list.seguidores) if (!out.has(p.codigo)) add(p.codigo, p.nome, 'Segue você');
    const friends = [...out.values()].sort((a, b) => nameCollator.compare(a.nome, b.nome));
    const others = [...saved.entries()]
      .filter(([code]) => !out.has(code) && code !== me)
      .map<PickPerson>(([code, c]) => ({ codigo: code, nome: c.name, relacao: 'Aberto pelo código', face: faces.get(code) ?? null }));
    return [...friends, ...others];
  });

  // ===== O que se compara: o mural aberto, uma ficha por obra =====
  protected readonly profile = this.mural.profile;
  private readonly mine = computed(() => distinctReviews(this.mural.reviews()));
  private readonly theirs = computed(() =>
    distinctReviews(originalsOf((this.colleague()?.reviews ?? []).filter((r) => r.kind === this.mural.kind()))),
  );
  protected readonly collections = computed(() => compareCollections(this.mine(), this.theirs()));
  protected readonly you = computed(() => portrait(this.mine()));
  protected readonly them = computed(() => portrait(this.theirs()));
  protected readonly affinity = computed(() => affinity(this.collections().pairs));
  protected readonly nothingHere = computed(() => !this.mine().length && !this.theirs().length);

  // ===== Sem spoilers: as notas do colega sobre o que eu não avaliei ficam em segredo =====
  private readonly shield = inject(SpoilerShield);
  /** "Mostrar notas": só para o colega aberto e só enquanto a página estiver aberta. Nada fica guardado. */
  private readonly revealedFor = signal<string | null>(null);
  protected readonly revealed = computed(() => !!this.colleague() && this.revealedFor() === this.colleague()!.id);
  private readonly unseen = computed(() =>
    this.shield.hiddenIn((this.colleague()?.reviews ?? []).filter((r) => r.kind === this.mural.kind())),
  );
  /** "Revelar a nota" na leitura: aquela ficha fica à mostra, do mesmo colega e só enquanto a página estiver aberta. */
  private readonly single = signal<{ of: string | null; ids: ReadonlySet<string> }>({ of: null, ids: new Set() });
  private readonly singles = computed<ReadonlySet<string>>(() => {
    const s = this.single();
    return !!this.colleague() && s.of === this.colleague()!.id ? s.ids : new Set();
  });
  protected revealOne(e: { ids: string[]; revealed: boolean }): void {
    const ids = new Set(this.singles());
    for (const id of e.ids) e.revealed ? ids.add(id) : ids.delete(id);
    this.single.set({ of: this.colleague()?.id ?? null, ids });
  }
  protected readonly hidden = computed<ReadonlySet<string>>(() => {
    if (this.revealed()) return new Set();
    const singles = this.singles();
    return singles.size ? new Set([...this.unseen()].filter((id) => !singles.has(id))) : this.unseen();
  });
  /** As que ainda estão em segredo, fora as reveladas uma a uma (com "Mostrar notas", todas: o botão fica para esconder). */
  protected readonly unseenCount = computed(() => this.theirs().filter((r) => this.unseen().has(r.id) && !this.singles().has(r.id)).length);
  /** Com dicas em segredo, ordenar as dicas por nota contaria o segredo: vale "Mais recentes". */
  protected readonly tipSort = computed<ListSort>(() => (this.hidden().size && this.listSort() === 'nota' ? 'recente' : this.listSort()));

  protected toggleReveal(): void {
    const id = this.colleague()?.id ?? null;
    // esconder as notas esconde também as reveladas uma a uma
    this.vt.run(() => {
      this.revealedFor.set(this.revealed() ? null : id);
      this.single.set({ of: null, ids: new Set() });
    });
  }

  /** As orelhas da ficha: o mural aberto e os outros com algo para comparar, na ordem de sempre. */
  protected readonly walls = computed<DuplaWall[]>(() => {
    const c = this.colleague();
    if (!c) return [];
    const all = compareCollections(distinctReviews(originalsOf(this.store.reviews())), distinctReviews(originalsOf(c.reviews))).pairs;
    const open = this.mural.kind();
    // anotação não tem nota para comparar
    return SCORED_KINDS.filter((kind) => kind === open || c.reviews.some((r) => r.kind === kind) || all.some((p) => p.mine.kind === kind)).map(
      (kind) => ({
        kind,
        label: cap(profileOf(kind).plural),
        icon: KIND_ICON[kind],
        common: all.filter((p) => p.mine.kind === kind).length,
        on: kind === open,
      }),
    );
  });
  /** "12 jogos em comum", ou "Nenhum livro em comum". */
  protected readonly summary = computed(() => {
    const n = this.collections().pairs.length;
    const p = this.profile();
    return n ? `${countOf(p, n)} em comum` : `${g(p, 'Nenhum', 'Nenhuma')} ${p.singular} em comum`;
  });
  /** Os outros murais com algo para comparar: sem eles, as orelhas nem aparecem. */
  protected readonly otherWalls = computed(() => this.walls().filter((w) => !w.on));

  // ===== As fichas =====
  protected readonly tab = linkedSignal<string | undefined, Tab>({
    source: () => this.colleague()?.id,
    computation: () => 'comum',
  });
  protected readonly query = signal('');
  protected readonly pairSort = signal<PairSort>('briga');
  protected readonly listSort = signal<ListSort>('nota');
  /** O nome da ordem escolhida, escrito na aba (o select por cima é invisível). */
  protected readonly sortLabel = computed(() => {
    if (this.tab() !== 'comum') return { nota: 'Maior nota', recente: 'Mais recentes', nome: 'A–Z' }[this.tab() === 'dicas' ? this.tipSort() : this.listSort()];
    return { briga: 'Maior briga', minha: 'Maior nota sua', colega: `Maior nota de ${this.name()}`, nome: 'A–Z' }[this.pairSort()];
  });
  protected readonly simple = computed(() => this.phone() || this.view.density() === 'simples');
  protected readonly paired = this.phone;

  private readonly q = computed(() => fold(this.query().trim()));
  private matches(r: Review): boolean {
    const q = this.q();
    return !q || fold(`${r.game.name} ${r.game.by ?? ''}`).includes(q);
  }

  protected readonly pairs = computed(() => {
    const list = this.collections().pairs.filter((p) => this.matches(p.mine) || this.matches(p.theirs));
    const name = (a: ReviewPair, b: ReviewPair) => byName(a.mine, b.mine);
    switch (this.pairSort()) {
      case 'briga':
        return list.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || name(a, b));
      case 'minha':
        return list.sort((a, b) => shownFinal(b.mine) - shownFinal(a.mine) || name(a, b));
      case 'colega':
        return list.sort((a, b) => shownFinal(b.theirs) - shownFinal(a.theirs) || name(a, b));
      default:
        return list.sort(name);
    }
  });

  private sortList(list: Review[], sort: ListSort): Review[] {
    switch (sort) {
      case 'nome':
        return list.sort(byName);
      case 'recente':
        return list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || byName(a, b));
      default:
        return list.sort((a, b) => shownFinal(b) - shownFinal(a) || byName(a, b));
    }
  }
  protected readonly tips = computed(() => this.sortList(this.collections().onlyTheirs.filter((r) => this.matches(r)), this.tipSort()));
  protected readonly myTips = computed(() => this.sortList(this.collections().onlyMine.filter((r) => this.matches(r)), this.listSort()));

  /** Quantos aparecem: volta ao começo sempre que a lista muda de assunto. */
  private readonly colleagueId = computed(() => this.colleague()?.id);
  protected readonly limit = linkedSignal({
    source: () => [this.tab(), this.q(), this.pairSort(), this.listSort(), this.colleagueId(), this.mural.kind()],
    computation: () => PAGE,
  });
  protected readonly shownPairs = computed(() => this.pairs().slice(0, this.limit()));
  protected readonly shownTips = computed(() => this.tips().slice(0, this.limit() * 2));
  protected readonly shownMine = computed(() => this.myTips().slice(0, this.limit() * 2));
  protected readonly total = computed(() =>
    this.tab() === 'comum' ? this.pairs().length : this.tab() === 'dicas' ? this.tips().length : this.myTips().length,
  );
  /** Quantas a aba tem, sem a busca: o "de 12" do "Mostrando 3 de 12". */
  protected readonly tabTotal = computed(() => {
    const c = this.collections();
    return this.tab() === 'comum' ? c.pairs.length : this.tab() === 'dicas' ? c.onlyTheirs.length : c.onlyMine.length;
  });
  protected readonly shown = computed(() =>
    this.tab() === 'comum' ? this.shownPairs().length : this.tab() === 'dicas' ? this.shownTips().length : this.shownMine().length,
  );

  /** O par aberto no "Nota a nota". */
  protected readonly notesOpen = signal<string | null>(null);
  /**
   * As linhas do nota a nota do par aberto, na ordem do Lado a lado: as notas (com o veredito e os
   * bônus) e, depois de um traço cheio, os fatos da ficha. Uma linha em branco dos dois lados some;
   * um fato igual nos dois lados é escrito uma vez só, no meio, para a folha não repetir o óbvio.
   */
  protected readonly noteRows = computed<NoteRow[]>(() => {
    const pair = this.pairs().find((p) => p.key === this.notesOpen());
    if (!pair) return [];
    const a = pair.mine;
    const b = pair.theirs;
    const p = profileOf(a.kind);
    const score = (id: string, label: string, x: number | null, y: number | null, weightA = '', weightB = ''): NoteRow => ({
      id,
      label,
      kind: id === 'final' ? 'final' : 'score',
      mine: x,
      theirs: y,
      weightA,
      weightB,
      best: x === null || y === null || x === y ? null : x > y ? 'mine' : 'theirs',
      same: false,
    });
    const fact = (id: NoteRow['kind'], label: string, same: boolean, split = false): NoteRow => ({
      id,
      label,
      kind: id,
      mine: null,
      theirs: null,
      weightA: '',
      weightB: '',
      best: null,
      same,
      split,
    });
    const weight = (w: string) => (w === 'nao-tem' ? 'não tem' : w === 'relevante' ? 'relevante' : w === 'pouco' ? 'pouco importa' : '');
    const rows: NoteRow[] = [
      score('final', 'Nota final', shownFinal(a), shownFinal(b), a.finalOverride !== undefined ? 'na mão' : '', b.finalOverride !== undefined ? 'na mão' : ''),
    ];
    if (a.verdict || b.verdict) rows.push(fact('verdict', 'Veredito', a.verdict === b.verdict));
    for (const k of ratedKeys(a.kind)) {
      const wa = weightOf(a.weights, k);
      const wb = weightOf(b.weights, k);
      rows.push(
        score(k, SCORE_LABEL[k], wa === 'nao-tem' ? null : scoreOf(a.scores, k), wb === 'nao-tem' ? null : scoreOf(b.scores, k), weight(wa), weight(wb)),
      );
    }
    if (a.bonuses.length || b.bonuses.length) rows.push(fact('bonus', 'Bônus', false));

    const facts: NoteRow[] = [];
    if (p.amount && (a.hoursPlayed !== null || b.hoursPlayed !== null)) {
      facts.push(fact('hours', p.amount.row, a.hoursPlayed === b.hoursPlayed));
    }
    facts.push(fact('status', 'Status', a.status === b.status));
    if (p.difficulty) facts.push(fact('difficulty', p.difficulty, a.difficulty === b.difficulty));
    if (a.completedAt !== null || b.completedAt !== null) {
      facts.push(fact('date', 'Data', a.completedAt === b.completedAt && a.status === b.status));
    }
    facts[0].split = true;
    return [...rows, ...facts];
  });
  protected difficultyOf(r: Review): string {
    return DIFFICULTY_LABEL[r.difficulty];
  }
  protected bonusesOf(r: Review) {
    return sortBonuses(r.bonuses);
  }
  protected amount(r: Review): string {
    return formatAmount(r.kind, r.hoursPlayed);
  }
  protected date(r: Review): string {
    return formatReviewDate(r.completedAt);
  }

  /** Os títulos que já estão na minha wishlist, para o botão "Quero" virar "Na wishlist". */
  private readonly wished = computed(() => new Set(this.store.wishes().map((w) => `${w.kind}:${fold(w.game.name)}`)));
  protected isWished(r: Review): boolean {
    return this.wished().has(`${r.kind}:${fold(r.game.name)}`);
  }

  // ===== Ações =====
  /**
   * Compara com alguém: um amigo da lista ou o código digitado. Quem já está guardado aparece na hora
   * (e se atualiza da nuvem por trás); quem não está vem da nuvem antes.
   */
  protected async pick(value: string, fromList = false): Promise<void> {
    if (this.opening()) return;
    const code = normalizeCode(value);
    this.pickError.set(null);
    if (!code) {
      this.pickError.set({ text: 'Esse código não existe. Confira: ele tem 8 letras e números.', code: true });
      return;
    }
    const saved = this.colleagues.colleagues().find((c) => c.id === cloudColleagueId(code));
    if (saved) {
      this.choose(saved.id);
      return;
    }
    this.opening.set(code);
    try {
      const c = await this.cloudMurals.open(code);
      this.choose(c.id);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Não consegui abrir esse mural.';
      // um amigo da lista: a mensagem diz de quem é o mural (o campo do código não tem nada a ver)
      const who = fromList ? this.people()?.find((p) => p.codigo === code)?.nome : undefined;
      // a nuvem não achou o mural: o amigo ainda não publicou (conferir as letras não serve aqui)
      const why = /Não achei mural/.test(text) ? `${who} ainda não tem um mural publicado.` : `Não deu para abrir o mural de ${who}. ${text}`;
      this.pickError.set(who ? { text: why, code: false } : { text, code: true });
    } finally {
      this.opening.set(null);
    }
  }

  private choose(id: string): void {
    this.query.set('');
    this.notesOpen.set(null);
    this.colleagues.select(id);
  }

  protected switchWall(kind: Kind): void {
    if (kind === this.mural.kind()) return;
    this.vt.run(() => {
      this.side.picking.set(false);
      this.view.clearFilters();
      this.mural.kind.set(kind);
    });
  }

  protected open(req: OpenRequest): void {
    this.openReview(req.review, req.side === 'voce');
  }

  protected openReview(review: Review, mine: boolean): void {
    // a minha abre na mesa de sempre (dá para editar); a do colega, só para ler, com o nome dele
    if (mine) this.desk.openReview(review.id);
    // a revelada uma a uma abre à mostra, com "Esconder a nota"
    else this.reader().open(review, this.name(), [], !this.revealed() && this.unseen().has(review.id), null, null, this.singles().has(review.id));
  }

  /** A maior briga ou a unanimidade: leva para a lista, com o par encontrado pela busca. */
  protected focusPair(pair: ReviewPair): void {
    this.tab.set('comum');
    this.query.set(pair.mine.game.name);
    this.notesOpen.set(pair.key);
    requestAnimationFrame(() =>
      document.getElementById('fichas')?.scrollIntoView({
        behavior: reducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      }),
    );
  }

  protected toggleNotes(key: string): void {
    this.notesOpen.update((k) => (k === key ? null : key));
  }

  protected wish(r: Review): void {
    if (this.isWished(r)) return;
    const now = new Date().toISOString();
    const id = newId();
    this.store.saveWish({ id, kind: r.kind, game: { ...r.game }, createdAt: now, updatedAt: now });
    this.toasts.show(`${r.game.name} foi pra sua wishlist`, {
      label: 'Desfazer',
      run: () => this.store.removeWish(id),
    });
  }

  protected setDensity(simple: boolean): void {
    this.view.setDensity(simple ? 'simples' : 'completa');
  }

  /** "Sua nota é 3 maior", para quem não vê o bilhete. */
  protected spoken(pair: ReviewPair): string {
    const d = this.gap(pair);
    if (d === 0) return 'Mesma nota';
    return d > 0 ? `Sua nota é ${formatScore(d)} maior` : `A nota de ${this.name()} é ${formatScore(-d)} maior`;
  }

  /** A diferença entre as notas como aparecem (Arredondado ou Inteiros mudam a conta): 9 e 8,5 dão 0,5. */
  protected gap(pair: ReviewPair): number {
    return pair.difference;
  }
}
