import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowLeft, LucideAngularModule, Check, ChevronDown, Heart, LayoutGrid, Rows3 } from 'lucide-angular';
import { ColleagueStore } from '../core/colleague-store';
import { Cloud } from '../core/cloud-config';
import { CloudMurals } from '../core/cloud-murals';
import { CloudAccount } from '../core/cloud-account';
import { ReviewPair, compareCollections, distinctReviews } from '../core/comparison';
import { affinity, nameFromFile, portrait } from '../core/comparison-stats';
import { KINDS, SCORED_KINDS, Kind, cap, countOf, g, profileOf } from '../core/kinds';
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
import { BackupEnvelope } from './comparison/envelope';
import { Caderno, OpenRequest } from './comparison/caderno';
import { NameTags } from './comparison/name-tags';

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

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const byName = (a: Review, b: Review) => collator.compare(a.game.name, b.game.name) || a.id.localeCompare(b.id);

/**
 * Comparar murais: o backup de um colega aberto ao lado do seu mural, sem se misturar com ele.
 * Chega num envelope, se apresenta num crachá, responde o caderno de perguntas (o gosto de cada um)
 * e, embaixo, as fichas: as obras em comum lado a lado e as dicas de cada um para o outro.
 * Segue o mural aberto no cartaz, como o Ranking; os outros murais ficam a um toque.
 */
@Component({
  selector: 'app-comparison-page',
  imports: [
    BackupEnvelope,
    BonusSticker,
    Caderno,
    LucideAngularModule,
    NameTags,
    NgTemplateOutlet,
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
  private readonly cloudMurals = inject(CloudMurals);
  protected readonly codeBusy = signal(false);
  protected readonly codeError = signal('');
  /** O colega aberto pelo código se atualiza da nuvem ao aparecer aqui (a cada 2 minutos, no máximo). */
  private readonly refreshCloud = effect(() => {
    const c = this.colleagues.selected();
    untracked(() => void this.cloudMurals.refresh(c));
  });
  protected readonly mural = inject(Mural);
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly toasts = inject(Toasts);
  private readonly vt = inject(ViewTransitions);
  private readonly view = inject(WallView);
  private readonly side = inject(SideBySide);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly ChevronIcon = ChevronDown;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;
  protected readonly WishIcon = Heart;
  protected readonly DoneIcon = Check;
  protected readonly BackIcon = ArrowLeft;
  protected readonly fmt = formatScore;
  protected readonly abs = Math.abs;
  protected readonly labels = SCORE_LABEL;
  protected readonly countOf = countOf;
  protected readonly g = g;
  protected readonly cap = cap;
  protected readonly PAGE = PAGE;

  private readonly phone = mediaSignal('(max-width: 699px)');

  // ===== O colega =====
  protected readonly colleague = this.colleagues.selected;
  /** O envelope aberto para mais um colega (com um já na mesa). */
  protected readonly adding = signal(false);
  /** O colega acabou de chegar com um nome provisório: o crachá já abre pedindo o nome. */
  protected readonly naming = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly name = computed(() => this.colleague()?.name ?? 'Colega');

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
  protected readonly hidden = computed<ReadonlySet<string>>(() => (this.revealed() ? new Set() : this.unseen()));
  protected readonly unseenCount = computed(() => this.theirs().filter((r) => this.unseen().has(r.id)).length);
  /** Com dicas em segredo, ordenar as dicas por nota contaria o segredo: vale "Mais recentes". */
  protected readonly tipSort = computed<ListSort>(() => (this.hidden().size && this.listSort() === 'nota' ? 'recente' : this.listSort()));

  protected toggleReveal(): void {
    const id = this.colleague()?.id ?? null;
    this.vt.run(() => this.revealedFor.set(this.revealed() ? null : id));
  }

  /** Os outros murais onde há o que comparar: "Livros · 3 em comum". */
  protected readonly otherWalls = computed(() => {
    const c = this.colleague();
    if (!c) return [];
    const all = compareCollections(distinctReviews(originalsOf(this.store.reviews())), distinctReviews(originalsOf(c.reviews))).pairs;
    // anotação não tem nota para comparar
    return SCORED_KINDS.filter((k) => k !== this.mural.kind())
      .map((kind) => ({
        kind,
        label: cap(profileOf(kind).plural),
        common: all.filter((p) => p.mine.kind === kind).length,
        theirs: c.reviews.some((r) => r.kind === kind),
      }))
      .filter((w) => w.common || w.theirs);
  });

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
  protected readonly limit = linkedSignal({
    source: () => [this.tab(), this.q(), this.pairSort(), this.listSort(), this.colleague()?.id, this.mural.kind()],
    computation: () => PAGE,
  });
  protected readonly shownPairs = computed(() => this.pairs().slice(0, this.limit()));
  protected readonly shownTips = computed(() => this.tips().slice(0, this.limit() * 2));
  protected readonly shownMine = computed(() => this.myTips().slice(0, this.limit() * 2));
  protected readonly total = computed(() =>
    this.tab() === 'comum' ? this.pairs().length : this.tab() === 'dicas' ? this.tips().length : this.myTips().length,
  );
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
      score('final', 'Nota final', a.scores.final, b.scores.final, a.finalOverride !== undefined ? 'na mão' : '', b.finalOverride !== undefined ? 'na mão' : ''),
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
  /** O código digitado no envelope: traz o mural público da pessoa e já compara. */
  protected async openCode(value: string): Promise<void> {
    if (this.codeBusy()) return;
    this.codeBusy.set(true);
    this.codeError.set('');
    try {
      const c = await this.cloudMurals.open(value);
      this.adding.set(false);
      this.query.set('');
      this.naming.set(false);
      this.toasts.show(`O mural de ${c.name} chegou`);
    } catch (err) {
      this.codeError.set(err instanceof Error ? err.message : 'Não consegui abrir esse mural.');
    } finally {
      this.codeBusy.set(false);
    }
  }

  protected async load(file: File): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const guess = nameFromFile(file.name);
    const n = this.colleagues.colleagues().length;
    try {
      const c = await this.colleagues.add(file, guess || (n ? `Colega ${n + 1}` : 'Colega'));
      this.adding.set(false);
      this.query.set('');
      // só pergunta o nome quando nem o backup nem o nome do arquivo disseram
      this.naming.set(!guess && !c.ownerName);
      this.toasts.show(`O mural de ${c.name} chegou`);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não consegui abrir esse backup. Tente outro arquivo.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async replace(file: File): Promise<void> {
    const c = this.colleague();
    if (!c || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const fresh = await this.colleagues.replace(c.id, file);
      this.toasts.show(`Backup de ${fresh.name} atualizado: ${fresh.reviews.length} ${fresh.reviews.length === 1 ? 'resenha' : 'resenhas'}`);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não consegui ler esse backup. O anterior continua aqui.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async rename(name: string): Promise<void> {
    const c = this.colleague();
    this.naming.set(false);
    if (!c) return;
    try {
      await this.colleagues.rename(c.id, name);
    } catch {
      this.error.set('Não consegui guardar o nome. Tente de novo.');
    }
  }

  protected choose(id: string): void {
    this.naming.set(false);
    this.error.set('');
    this.query.set('');
    this.notesOpen.set(null);
    this.colleagues.select(id);
  }

  protected async remove(): Promise<void> {
    const c = this.colleague();
    if (!c || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.colleagues.remove(c.id);
      this.naming.set(false);
      this.toasts.show(`${c.name} saiu da comparação`, {
        label: 'Desfazer',
        run: () => void this.colleagues.restore(c).catch(() => this.error.set('Não consegui trazer de volta. Abra o arquivo de novo.')),
      });
    } catch {
      this.error.set('Não consegui tirar esse backup. Tente de novo.');
    } finally {
      this.busy.set(false);
    }
  }

  protected switchWall(kind: Kind): void {
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
    else this.reader().open(review, this.name(), [], this.hidden().has(review.id));
  }

  /** A maior briga ou a unanimidade: leva para a lista, com o par encontrado pela busca. */
  protected focusPair(pair: ReviewPair): void {
    this.tab.set('comum');
    this.query.set(pair.mine.game.name);
    this.notesOpen.set(pair.key);
    requestAnimationFrame(() =>
      document.getElementById('fichas')?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
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
    this.view.density.set(simple ? 'simples' : 'completa');
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
