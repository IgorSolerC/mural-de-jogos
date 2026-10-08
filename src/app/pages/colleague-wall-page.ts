import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowLeft, ArrowDownWideNarrow, ArrowUpNarrowWide, CheckCheck, ChevronDown, Eye, EyeOff, Grid3x3, LayoutGrid, ListFilter, LucideAngularModule, Rows3, UserCheck, UserPlus } from 'lucide-angular';
import { CloudAccount } from '../core/cloud-account';
import { Follow } from '../core/follow';
import { Reactions } from '../core/reactions';
import { Toasts } from '../ui/toast';
import { Busy } from '../ui/busy';
import { ColleagueStore } from '../core/colleague-store';
import { CloudMurals } from '../core/cloud-murals';
import { KINDS, Kind, SCORED_KINDS, cap, countOf, g, isNotes, profileOf, revisitCountOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { Review, VERDICT_LABEL, fold, isDone, originalsOf } from '../core/review';
import { SideBySide } from '../core/side-by-side';
import { ViewTransitions } from '../core/view-transitions';
import { FacetKey, NO_FILTER, WallFilter, facetsOf, filterSize, matchesFilter, matchesQuery, tagsOf, toggleOption } from '../core/wall-filter';
import { Direction, SPOILER_FACETS, SortKey, WallView, directionLabelOf, groupWall, sortFor, sortWall, withoutSpoilerFacets } from '../core/wall-view';
import { SpoilerShield } from '../core/spoiler-shield';
import { FilterSheet, FilterTags, FilterToggle } from '../ui/filter-sheet';
import { ReviewCard } from '../ui/review-card';
import { ReviewReader } from '../ui/review-reader';
import { SearchStrip } from '../ui/search-strip';

const avgFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DEFAULT_DIRECTION: Record<SortKey, Direction> = { data: 'desc', nota: 'desc', alfabetica: 'asc', status: 'desc', categoria: 'asc', prioridade: 'desc' };

/**
 * O mural do colega, só dele: as fichas do backup aberto na comparação, pregadas em seções como no
 * seu mural, sem nenhuma informação sua. Só se lê; tocar numa ficha abre a leitura com o nome dele.
 * Segue o mural aberto no cartaz (jogos, livros…), como as outras páginas.
 */
@Component({
  selector: 'app-colleague-wall-page',
  imports: [Busy, FilterSheet, FilterTags, LucideAngularModule, ReviewCard, ReviewReader, RouterLink, SearchStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './colleague-wall-page.html',
  styleUrl: './colleague-wall-page.scss',
})
export class ColleagueWallPage {
  protected readonly colleagues = inject(ColleagueStore);
  private readonly cloudMurals = inject(CloudMurals);
  /** Aberto pelo código: se atualiza da nuvem ao aparecer (a cada 2 minutos, no máximo). */
  private readonly refreshCloud = effect(() => {
    const c = this.colleagues.selected();
    untracked(() => void this.cloudMurals.refresh(c));
  });
  protected readonly mural = inject(Mural);
  protected readonly view = inject(WallView);
  private readonly vt = inject(ViewTransitions);
  private readonly side = inject(SideBySide);
  private readonly reader = viewChild.required(ReviewReader);
  private readonly injector = inject(Injector);
  private readonly filterTab = viewChild<ElementRef<HTMLButtonElement>>('filterTab');
  private readonly sheet = viewChild(FilterSheet);

  protected readonly BackIcon = ArrowLeft;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;
  protected readonly CoversIcon = Grid3x3;
  protected readonly DescIcon = ArrowDownWideNarrow;
  protected readonly AscIcon = ArrowUpNarrowWide;
  protected readonly FilterIcon = ListFilter;
  protected readonly FollowIcon = UserPlus;
  protected readonly FollowingIcon = UserCheck;
  protected readonly RevealIcon = Eye;
  protected readonly HideIcon = EyeOff;
  protected readonly DoneIcon = CheckCheck;

  private readonly follow = inject(Follow);
  private readonly account = inject(CloudAccount);
  private readonly toasts = inject(Toasts);
  /** Seguir só faz sentido para um mural aberto pelo código, com conta, e que não é o meu. */
  protected readonly canFollow = computed(() => {
    const code = this.colleague()?.codigo;
    return !!code && this.follow.available() && code !== this.account.account()?.codigo;
  });
  /** Sigo essa pessoa? null enquanto não se sabe: o botão espera, em vez de oferecer "Seguir" à toa. */
  protected readonly followState = computed(() => {
    const code = this.colleague()?.codigo;
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
  protected readonly verdictLabel = VERDICT_LABEL;

  protected readonly colleague = this.colleagues.selected;
  protected readonly name = computed(() => this.colleague()?.name ?? 'Colega');
  /** O código na nuvem do colega aberto pelo código (as fichas mostram as reações); null num backup. */
  protected readonly code = computed(() => this.colleague()?.codigo ?? null);
  private readonly reactions = inject(Reactions);
  private readonly loadReactions = effect(() => {
    const code = this.code();
    if (code) untracked(() => void this.reactions.load(code));
  });
  protected readonly profile = this.mural.profile;

  protected readonly query = signal('');
  protected readonly filter = signal<WallFilter>(NO_FILTER);
  protected readonly filtersOpen = signal(false);
  /** A ordem escolhida aqui; sem escolha, a de sempre do mural (Prioridade nas anotações, Data nos outros). */
  protected readonly sort = signal<SortKey | null>(null);
  protected readonly direction = signal<Direction>('desc');
  protected readonly simple = computed(() => this.view.density() === 'simples');
  protected readonly capas = computed(() => this.view.density() === 'capas');

  protected readonly sorts: readonly { value: SortKey; label: string }[] = [
    { value: 'data', label: 'Data' },
    { value: 'nota', label: 'Nota' },
    { value: 'alfabetica', label: 'A–Z' },
    { value: 'status', label: 'Status' },
  ];
  /** No mural de anotações: título e categoria, sem nota nem status. */
  private readonly noteSorts: readonly { value: SortKey; label: string }[] = [
    { value: 'prioridade', label: 'Prioridade' },
    { value: 'data', label: 'Data' },
    { value: 'alfabetica', label: 'Título' },
    { value: 'categoria', label: 'Categoria' },
  ];
  protected readonly sortLabel = computed(() => this.shownSorts().find((s) => s.value === this.shownSort())?.label ?? 'Data');
  /** O que a seta da ordem diz ("Mais recentes primeiro", "De A a Z"…), como no seu mural. */
  protected readonly directionLabel = computed(() => directionLabelOf(this.shownSort(), this.direction(), this.profile()));

  /** As fichas do colega no mural aberto. */
  protected readonly reviews = computed(() => (this.colleague()?.reviews ?? []).filter((r) => r.kind === this.mural.kind()));

  private readonly shield = inject(SpoilerShield);
  /**
   * "Mostrar notas" vale para a pessoa aberta e só enquanto a página estiver aberta: nada fica
   * guardado, e outra pessoa (ou a volta para cá) abre seguindo Ajustes de novo.
   */
  private readonly revealedFor = signal<string | null>(null);
  protected readonly revealed = computed(() => !!this.colleague() && this.revealedFor() === this.colleague()!.id);

  protected toggleReveal(): void {
    const id = this.colleague()?.id ?? null;
    this.vt.run(() => this.revealedFor.set(this.revealed() ? null : id));
  }
  /** As fichas sobre o que eu ainda não resenhei, com "Evitar spoilers de outros murais" (ver core/spoiler-shield.ts). */
  private readonly unseen = computed(() => this.shield.hiddenIn(this.reviews()));
  protected readonly hidden = computed<ReadonlySet<string>>(() => (this.revealed() ? new Set() : this.unseen()));
  /** Alguma ficha em segredo: a nota não ordena, não filtra e não entra nas médias, que contariam o segredo. */
  protected readonly guarding = computed(() => this.hidden().size > 0);
  /** O botão de mostrar aparece enquanto houver o que esconder (e para esconder de novo). */
  protected readonly canReveal = computed(() => this.unseen().size > 0);
  protected readonly unseenCount = computed(() => this.unseen().size);
  protected readonly shownSort = computed<SortKey>(() => {
    const sort = sortFor(this.sort() ?? (isNotes(this.profile().kind) ? 'prioridade' : 'data'), this.profile());
    return this.guarding() && sort === 'nota' ? 'data' : sort;
  });
  protected readonly shownSorts = computed(() =>
    isNotes(this.profile().kind) ? this.noteSorts : this.guarding() ? this.sorts.filter((s) => s.value !== 'nota') : this.sorts,
  );

  /** As anotações finalizadas (com check) da pessoa: fora do mural, a não ser com "Mostrar finalizadas". */
  protected readonly doneCount = computed(() => this.reviews().filter(isDone).length);
  /** "Mostrar finalizadas": só enquanto esta página estiver aberta, como o "Mostrar notas". */
  protected readonly showDone = signal(false);
  protected toggleDone(): void {
    this.vt.run(() => this.showDone.update((v) => !v));
  }
  /** O mural sem as finalizadas escondidas: o "todo" do mural, para contar e para o vazio. */
  /** Trocou de mural no cartaz: a busca, os filtros e a ordem daqui eram do outro mural. */
  private readonly resetOnKind = effect(() => {
    this.mural.kind();
    untracked(() => {
      this.clear();
      this.sort.set(null);
      this.direction.set('desc');
      this.showDone.set(false);
    });
  });
  protected readonly isNotesWall = computed(() => isNotes(this.profile().kind));
  protected readonly pool = computed(() => (this.showDone() ? this.reviews() : this.reviews().filter((r) => !isDone(r))));

  /** As fichas que a busca encontra, antes dos filtros: é sobre elas que a cartela conta. */
  private readonly searched = computed(() => {
    const needle = fold(this.query().trim());
    return this.pool().filter((r) => matchesQuery(r, needle));
  });

  /** Os filtros que valem: com fichas em segredo, filtrar por veredito, nota ou dificuldade contaria o segredo. */
  private readonly activeFilter = computed<WallFilter>(() => (this.guarding() ? withoutSpoilerFacets(this.filter()) : this.filter()));
  protected readonly facets = computed(() => {
    const all = facetsOf(this.searched(), this.activeFilter(), this.profile());
    return this.guarding() ? all.filter((f) => !SPOILER_FACETS.includes(f.key)) : all;
  });
  protected readonly tags = computed(() => tagsOf(this.activeFilter(), this.profile()));
  protected readonly filterCount = computed(() => filterSize(this.activeFilter()));

  protected readonly visible = computed(() => {
    const f = this.activeFilter();
    return this.searched().filter((r) => matchesFilter(r, f));
  });

  protected readonly sheetSummary = computed(() => {
    const total = this.pool().length;
    const shown = this.visible().length;
    const again = total - originalsOf(this.pool()).length;
    const all = again ? `${countOf(this.profile(), total - again)} e ${revisitCountOf(this.profile(), again)}` : countOf(this.profile(), total);
    return shown === total ? `Mostrando ${g(this.profile(), 'todos os', 'todas as')} ${all}` : `Mostrando ${shown} de ${all}`;
  });

  protected readonly groups = computed(() => {
    const order = { sort: this.shownSort(), key: 'final' as const, direction: this.direction(), profile: this.profile() };
    return groupWall(sortWall(this.visible(), order), order, this.guarding());
  });

  /** "34 jogos · média 7,1". Com fichas em segredo, sem a média. */
  protected readonly summary = computed(() => {
    // uma ficha por obra: as rejogadas do colega não entram na conta nem na média
    const list = originalsOf(this.reviews());
    if (!list.length) return '';
    // anotação não tem nota: só quantas estão no mural (e quantas já foram finalizadas)
    if (isNotes(this.profile().kind)) {
      const done = this.doneCount();
      return `${countOf(this.profile(), list.length - done)}${done ? ` · ${done} ${done === 1 ? 'finalizada' : 'finalizadas'}` : ''}`;
    }
    if (this.guarding()) {
      const n = this.unseenCount();
      return `${countOf(this.profile(), list.length)} · ${n} em segredo`;
    }
    const avg = list.reduce((s, r) => s + r.scores.final, 0) / list.length;
    return `${countOf(this.profile(), list.length)} · média ${avgFmt.format(avg)}`;
  });

  /** Os outros murais onde o colega tem fichas. */
  protected readonly otherWalls = computed(() => {
    const c = this.colleague();
    if (!c) return [];
    return KINDS.filter((k) => k !== this.mural.kind())
      // as anotações finalizadas não estão no mural
      .map((kind) => ({ kind, label: cap(profileOf(kind).plural), n: c.reviews.filter((r) => r.kind === kind && !r.revisitOf && !r.doneAt).length }))
      .filter((w) => w.n);
  });

  protected setSort(sort: SortKey): void {
    this.vt.run(() => {
      this.sort.set(sort);
      this.direction.set(DEFAULT_DIRECTION[sort]);
    });
  }

  protected toggleDirection(): void {
    this.vt.run(() => this.direction.update((d) => (d === 'desc' ? 'asc' : 'desc')));
  }

  protected toggleFilters(e: MouseEvent): void {
    if (this.filtersOpen()) {
      this.closeFilters();
      return;
    }
    this.filtersOpen.set(true);
    if (e.detail === 0) afterNextRender(() => this.sheet()?.focusFirst(), { injector: this.injector });
  }

  protected closeFilters(): void {
    const el = document.getElementById('cartela-filtros-colega');
    const hadFocus = !!el && el.contains(document.activeElement);
    this.filtersOpen.set(false);
    if (hadFocus) this.filterTab()?.nativeElement.focus();
  }

  protected toggleFilter(t: FilterToggle): void {
    this.vt.run(() => this.filter.update((f) => toggleOption(f, t.key, t.value)));
  }

  protected clearFacet(key: FacetKey): void {
    this.vt.run(() => this.filter.update((f) => ({ ...f, [key]: [] })));
  }

  protected clearAllFilters(): void {
    this.vt.run(() => this.filter.set(NO_FILTER));
  }

  protected clear(): void {
    this.query.set('');
    this.filter.set(NO_FILTER);
  }

  protected switchWall(kind: Kind): void {
    this.vt.run(() => {
      this.side.picking.set(false);
      this.view.clearFilters();
      this.clear();
      this.mural.kind.set(kind);
    });
  }

  /**
   * Voltar à comparação: Comparar não tem mural de anotações. Vendo as anotações da pessoa, o
   * cartaz troca antes para um mural com notas (um que ela tenha), senão a volta caía no seu mural.
   */
  protected backToCompare(): void {
    if (!isNotes(this.mural.kind())) return;
    const c = this.colleague();
    this.mural.kind.set(SCORED_KINDS.find((k) => c?.reviews.some((r) => r.kind === k)) ?? 'jogos');
  }

  protected open(review: Review): void {
    // com as outras fichas do colega: a leitura anda entre as vezes de uma obra que ele rejogou
    this.reader().open(review, this.name(), this.reviews(), this.hidden().has(review.id), this.code());
  }
}
