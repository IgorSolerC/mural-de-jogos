import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, Injector, signal, viewChild } from '@angular/core';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCheck,
  ChevronDown,
  Grid3x3,
  LayoutGrid,
  List,
  ListChecks,
  ListFilter,
  LucideAngularModule,
  Rows3,
  SquareCheckBig,
} from 'lucide-angular';
import { Mural } from '../core/mural';
import { countOf, g, isNotes, revisitCountOf } from '../core/kinds';
import { SCORE_LABEL, ScoreKey, scoreKeys } from '../core/review';
import { SideBySide } from '../core/side-by-side';
import { WallMotion } from '../core/wall-motion';
import { FacetKey, NO_FILTER } from '../core/wall-filter';
import { Density, SortKey, WallView, directionLabelOf } from '../core/wall-view';
import { Settings } from '../core/settings';
import { FilterSheet, FilterToggle } from './filter-sheet';
import { NoteTabsBar } from './note-tabs-bar';
import { TagShortcuts } from './tag-shortcuts';
import { ALL_TAB, NO_CATEGORY_TAB } from '../core/note-tabs';
import { SearchStrip } from './search-strip';

/** Ordenar é um controle só: data, nome, status ou uma das notas. */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'data', label: 'Data' },
  { value: 'alfabetica', label: 'Nome' },
  { value: 'status', label: 'Status' },
];
/** No mural de anotações: sem status nem notas, e com as categorias. */
const NOTE_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'prioridade', label: 'Prioridade' },
  { value: 'data', label: 'Data' },
  { value: 'alfabetica', label: 'Título' },
  { value: 'categoria', label: 'Categoria' },
  { value: 'tag', label: 'Tag' },
];

@Component({
  selector: 'app-wall-toolbar',
  imports: [FilterSheet, LucideAngularModule, NoteTabsBar, SearchStrip, TagShortcuts],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-toolbar.html',
  styleUrl: './wall-toolbar.scss',
})
export class WallToolbar {
  protected readonly view = inject(WallView);
  private readonly mural = inject(Mural);
  protected readonly side = inject(SideBySide);
  private readonly motion = inject(WallMotion);

  protected readonly DescIcon = ArrowDownWideNarrow;
  protected readonly AscIcon = ArrowUpNarrowWide;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;
  protected readonly CoversIcon = Grid3x3;
  protected readonly ListIcon = List;
  protected readonly TasksIcon = ListChecks;
  /** Os tipos de ficha da pasta das anotações (com a Lista, que só elas têm). */
  protected readonly noteDensities: readonly { value: Density; label: string; icon: typeof List }[] = [
    { value: 'completa', label: 'Fichas completas', icon: Rows3 },
    { value: 'simples', label: 'Fichas simples', icon: LayoutGrid },
    { value: 'capas', label: 'Só capa e nome', icon: Grid3x3 },
    { value: 'lista', label: 'Lista', icon: List },
  ];
  protected readonly ChevronIcon = ChevronDown;
  protected readonly MarkIcon = SquareCheckBig;
  protected readonly FilterIcon = ListFilter;
  protected readonly DoneIcon = CheckCheck;

  private readonly injector = inject(Injector);
  /** A aba Filtrar (só nos murais de resenhas: as anotações não têm cartela). */
  private readonly filterTab = viewChild<ElementRef<HTMLButtonElement>>('filterTab');
  private readonly sheet = viewChild(FilterSheet);

  /** A cartela de filtros aberta embaixo da régua. */
  protected readonly open = signal(false);
  protected readonly kind = this.mural.kind;
  /** "Mostrando 12 de 40 jogos", no pé da cartela. */
  protected readonly summary = computed(() => {
    // as anotações finalizadas escondidas não contam: estão fora do mural, não filtradas
    const total = this.view.pool().length;
    const shown = this.view.visible().length;
    // as rejogadas também são fichas na parede: "40 jogos e 3 rejogadas"
    const again = this.mural.revisitCount();
    const all = again
      ? `${countOf(this.mural.profile(), total - again)} e ${revisitCountOf(this.mural.profile(), again)}`
      : countOf(this.mural.profile(), total);
    return shown === total ? `Mostrando ${g(this.mural.profile(), 'todos os', 'todas as')} ${all}` : `Mostrando ${shown} de ${all}`;
  });

  /** O mural de anotações: outras ordens, e nada de marcar para o lado a lado. */
  protected readonly notes = computed(() => isNotes(this.mural.kind()));
  /** "Procurar no mural", ou "Procurar em Trabalho" com uma aba aberta. */
  protected readonly searchLabel = computed(() => {
    const tab = this.view.activeTabLabel();
    if (this.view.activeTab() === NO_CATEGORY_TAB) return 'Procurar nas sem categoria';
    return tab ? `Procurar em ${tab}` : 'Procurar no mural';
  });
  /** Numa aba de categoria, ordenar por categoria não separa nada: a opção sai. */
  protected readonly sortOptions = computed(() =>
    !this.notes() ? SORT_OPTIONS : this.view.activeTab() === ALL_TAB ? NOTE_SORT_OPTIONS : NOTE_SORT_OPTIONS.filter((o) => o.value !== 'categoria'),
  );
  /** A Média e as quatro notas do mural aberto. */
  protected readonly scoreOptions = computed(() =>
    scoreKeys(this.mural.kind()).map((k) => ({ value: `nota:${k}`, label: SCORE_LABEL[k] })),
  );
  protected readonly settings = inject(Settings);
  protected readonly sortValue = computed(() =>
    this.view.shownSort() === 'nota' ? `nota:${this.view.activeScore()}` : this.view.shownSort(),
  );

  protected readonly sortLabel = computed(() => {
    const v = this.sortValue();
    const opt = [...this.sortOptions(), ...this.scoreOptions()].find((o) => o.value === v);
    return opt?.label ?? 'Data';
  });

  protected directionLabel(): string {
    return directionLabelOf(this.view.shownSort(), this.view.direction(), this.mural.profile());
  }

  protected toggleOpen(e: MouseEvent): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    // aberta pelo teclado (Enter ou espaço não têm clique de verdade): o foco desce para a cartela
    if (e.detail === 0) afterNextRender(() => this.sheet()?.focusFirst(), { injector: this.injector });
  }

  /** Fecha a cartela; se o foco estava nela, volta para a aba Filtrar. */
  protected close(): void {
    const sheetEl = document.getElementById('cartela-filtros');
    const hadFocus = !!sheetEl && sheetEl.contains(document.activeElement);
    this.open.set(false);
    if (hadFocus) this.filterTab()?.nativeElement.focus();
  }

  protected toggle(t: FilterToggle): void {
    this.motion.run(() => this.view.toggle(t.key, t.value));
  }

  protected clearFacet(key: FacetKey): void {
    this.motion.run(() => this.view.clearFacet(key));
  }

  protected clearAll(): void {
    this.motion.run(() => this.view.filter.set(NO_FILTER));
  }

  protected setSortValue(v: string): void {
    this.motion.run(() => {
      if (v.startsWith('nota:')) {
        this.view.setSort('nota');
        this.view.scoreKey.set(v.slice(5) as ScoreKey);
      } else {
        this.view.setSort(v as SortKey);
      }
    });
  }

  protected setDensity(d: Density): void {
    // (com uma troca esperando, voltar ao tipo de agora também conta: a troca esperando é desfeita)
    if (this.view.density() === d && !this.motion.swapping) return;
    this.motion.swap(() => this.view.setDensity(d));
  }

  /** "Mostrar finalizadas": as anotações com check voltam (ou saem) do mural, deslizando. */
  protected toggleDone(): void {
    this.motion.run(() => this.view.showDone.update((v) => !v));
  }

  /** Tira a busca e as tags ligadas (nas anotações, o "Limpar" da pasta). */
  protected clearFilters(): void {
    this.motion.run(() => this.view.clearFilters());
  }

  /** A busca sai da aba e procura no mural inteiro. */
  protected searchAll(): void {
    this.motion.run(() => this.view.setNoteTab(ALL_TAB));
  }

  protected flip(): void {
    this.motion.run(() => this.view.toggleDirection());
  }
}
