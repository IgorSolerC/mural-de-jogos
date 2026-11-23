import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import {
  CSV_MARKS,
  DictFilter,
  MarkLookup,
  DictState,
  FacetKey,
  SORTS,
  SortKey,
  Word,
  effectiveSort,
  facetChips,
  facetGroups,
  facetLabel,
  filterCount,
  isFiltered,
  matchScore,
  paramsOf,
  passes,
  sectionsOf,
  sortWords,
  stateFromParams,
  toggleFacet,
} from '../core/dictionary/dictionary';
import { MONTHS_SHORT } from '../core/dates';
import { hasKanji } from '../core/dictionary/kana';
import { DictionaryMarks } from '../core/dictionary/marks-store';
import { dictionaryWords } from '../core/dictionary/words';
import { plural } from '../core/text';
import { FacetFilters } from '../ui/facet-filters';
import { FilterChip, FilterTags } from '../ui/filter-sheet';
import { ICON, IconModule } from '../ui/icons';
import { loadKleeOne } from '../ui/font-sheet';
import { Pin } from '../ui/pin';
import { SearchHighlight } from '../ui/search-highlight';
import { SearchStrip } from '../ui/search-strip';
import { SectionHead } from '../ui/section-head';
import { Toasts } from '../ui/toast';
import { WordSeals } from '../ui/word-seals';

type View = DictState['view'];

/** Uma coluna da Tabela: o nome, a ordem que o clique na cabeça escolhe (sem, a coluna não ordena) e a largura. */
interface Column {
  id: string;
  label: string;
  sort?: SortKey;
  /** Números, à direita e com algarismos alinhados. */
  num?: boolean;
}

const COLUMNS: readonly Column[] = [
  { id: 'n', label: 'Nº', sort: 'priority', num: true },
  { id: 'marcas', label: 'Marcas' },
  { id: 'palavra', label: 'Japonês', sort: 'reading' },
  { id: 'romaji', label: 'Romaji' },
  { id: 'sentido', label: 'Português', sort: 'meaning' },
  { id: 'jlpt', label: 'JLPT', sort: 'jlpt' },
  { id: 'uso', label: 'Uso', sort: 'use' },
  { id: 'imp', label: 'Imp.', sort: 'importance', num: true },
  { id: 'classe', label: 'Classe', sort: 'wordClass' },
  { id: 'tema', label: 'Tema', sort: 'theme' },
  { id: 'escrita', label: 'Escrita' },
  { id: 'registro', label: 'Registro' },
  { id: 'rank', label: 'Internet', sort: 'rank', num: true },
  { id: 'composicao', label: 'Composição' },
  { id: 'notas', label: 'Notas' },
];

/**
 * O Dicionário Japonês de Outros (PLANO-DICIONARIO.md): as palavras do CSV do dono para consultar. A pasta da
 * Wishlist e das Pixel arts em cima (a busca, o Filtrar com a folha de filtros em linhas, a ordem com a seta e a
 * vista) e, embaixo, a página do dicionário: os verbetes em duas colunas, em seções da ordem escolhida, ou a Tabela
 * com todas as colunas. Tudo o que a página mostra mora no endereço: nada é guardado, ninguém escreve aqui.
 */
@Component({
  selector: 'app-dictionary-page',
  imports: [FacetFilters, FilterTags, IconModule, Pin, SearchHighlight, SearchStrip, SectionHead, WordSeals],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dictionary-page.html',
  styleUrl: './dictionary-page.scss',
})
export class DictionaryPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly marks = inject(DictionaryMarks);
  private readonly toasts = inject(Toasts);
  protected readonly StarIcon = ICON.estrela;

  protected readonly FilterIcon = ICON.filtrar;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly DescIcon = ICON.ordenarDecrescente;
  protected readonly AscIcon = ICON.ordenarCrescente;
  protected readonly views: readonly { value: View; label: string; hint: string; icon: typeof ICON.livros }[] = [
    { value: 'verbetes', label: 'Verbetes', hint: 'As palavras como num dicionário de papel', icon: ICON.livros },
    { value: 'tabela', label: 'Tabela', hint: 'Todas as colunas numa tabela', icon: ICON.tabela },
  ];
  protected readonly columns = COLUMNS;

  private readonly data = dictionaryWords();
  /** Todas as palavras, na ordem do CSV. */
  protected readonly all = this.data.words;

  /** O estado da página, lido do endereço (a busca, os filtros, a ordem e a vista). */
  protected readonly state = toSignal(this.route.queryParamMap.pipe(map((p) => stateFromParams(Object.fromEntries(p.keys.map((k) => [k, p.get(k) ?? undefined]))))), {
    initialValue: stateFromParams({}),
  });

  /**
   * A busca digitada: manda na lista e no campo na hora, e só depois vai para o endereço. Ler de volta do endereço a
   * cada tecla reescreveria o campo com uma navegação atrasada enquanto a pessoa ainda digita; o endereço só manda
   * quando muda por fora (voltar do navegador, um link).
   */
  protected readonly query = signal(this.state().query);
  private sentQuery = this.state().query;

  protected readonly filterOpen = signal(false);
  /** A folha aberta pelo teclado: o foco vai para o primeiro recorte. */
  protected readonly filterByKeyboard = signal(false);
  private readonly filterBtn = viewChild<ElementRef<HTMLButtonElement>>('filterBtn');

  constructor() {
    loadKleeOne();
    effect(() => {
      const fromUrl = this.state().query;
      // o endereço mudou por fora (não foi a página que mandou): a busca segue
      if (fromUrl !== this.sentQuery) untracked(() => this.query.set(fromUrl));
      this.sentQuery = fromUrl;
    });
  }

  /** As marcas do dono, como os filtros as perguntam (o CSV por baixo, a marca por cima). */
  private readonly lookup = computed<MarkLookup>(() => {
    const byId = this.marks.byId();
    if (!byId.size) return CSV_MARKS;
    return { learned: (w) => byId.get(w.id)?.learned ?? !!w.learnedOn, favorite: (id) => !!byId.get(id)?.favorite };
  });

  /** O que a busca achou, com quanto cada palavra combina (todas, sem busca). */
  private readonly found = computed(() => {
    const q = this.query();
    const scores = new Map<string, number>();
    for (const w of this.all) {
      const s = matchScore(this.data.keys.get(w.id)!, q);
      if (s) scores.set(w.id, s);
    }
    return { words: this.all.filter((w) => scores.has(w.id)), scores };
  });

  /** O que a busca e os filtros mostram, na ordem escolhida. */
  protected readonly sort = computed(() => effectiveSort({ ...this.state(), query: this.query() }));
  protected readonly shown = computed(() => {
    const { filter, dir } = this.state();
    const { words, scores } = this.found();
    const marks = this.lookup();
    return sortWords(
      words.filter((w) => passes(w, filter, undefined, marks)),
      this.sort(),
      dir,
      (w) => scores.get(w.id) ?? 0,
    );
  });
  protected readonly sections = computed(() => sectionsOf(this.shown(), this.sort()));

  protected readonly searching = computed(() => !!this.query().trim());
  protected readonly filtered = computed(() => isFiltered(this.state().filter));
  /** Há busca ou filtro: a linha "Mostrando N de 933" e o Limpar. */
  protected readonly narrowing = computed(() => this.searching() || this.filtered());

  protected readonly groups = computed(() => facetGroups(this.all, this.found().words, this.state().filter, this.lookup()));
  /** O atalho das favoritas, na pasta: liga e desliga o filtro Favoritas. */
  protected readonly favoritesOnly = computed(() => !!this.state().filter.favorite?.length);
  protected readonly chips = computed<FilterChip[]>(() => facetChips(this.state().filter, this.all));
  protected readonly filterN = computed(() => filterCount(this.state().filter));

  /** As ordens do select: a Relevância só enquanto busca. */
  protected readonly sorts = computed(() => SORTS.filter((s) => s.value !== 'relevance' || this.searching()));
  protected readonly sortLabel = computed(() => SORTS.find((s) => s.value === this.sort())!.label);
  protected readonly directionLabel = computed(() => {
    const o = SORTS.find((s) => s.value === this.sort())!;
    return this.state().dir === 'desc' ? o.flipped : o.natural;
  });

  protected readonly units: readonly [string, string] = ['palavra', 'palavras'];
  protected readonly countSaid = computed(() => `Mostrando ${this.shown().length} de ${plural(this.all.length, 'palavra', 'palavras')}`);

  /** O cartão de quando nada aparece. */
  protected readonly noneTitle = computed(() => (this.searching() && !this.filtered() ? `Nada com “${this.query().trim()}”` : 'Nenhuma palavra com esse filtro'));
  protected readonly noneText = computed(() =>
    this.searching()
      ? 'Procure em português, em romaji (kuru), em kana (くる) ou em kanji (来る). Os filtros ligados também valem para a busca.'
      : 'Os filtros ligados juntos não deixam nenhuma palavra. Tire um deles para ver mais.',
  );

  /* ===== Mudar o endereço (a única coisa que a página escreve) ===== */

  private go(next: Partial<DictState>): void {
    const s = { ...this.state(), query: this.query(), ...next };
    this.query.set(s.query);
    this.sentQuery = s.query;
    void this.router.navigate([], { relativeTo: this.route, queryParams: paramsOf(s), replaceUrl: true });
  }

  protected setQuery(query: string): void {
    this.go({ query });
  }

  protected setSort(value: string): void {
    const sort = SORTS.find((s) => s.value === value)?.value ?? null;
    // a ordem padrão de agora não fica no endereço: buscar e limpar volta a ela sozinha
    const auto = this.searching() ? 'relevance' : 'priority';
    this.go({ sort: sort === auto ? null : sort, dir: 'asc' });
  }

  /** A cabeça de uma coluna da Tabela: a mesma ordem inverte; outra, escolhe no sentido natural. */
  protected sortBy(col: Column): void {
    if (!col.sort) return;
    if (col.sort === this.sort()) this.flip();
    else this.setSort(col.sort);
  }

  protected flip(): void {
    this.go({ dir: this.state().dir === 'desc' ? 'asc' : 'desc' });
  }

  protected setView(view: View): void {
    this.go({ view });
  }

  protected toggle(key: FacetKey, value: string): void {
    this.go({ filter: toggleFacet(this.state().filter, key, value) });
  }

  protected toggleFavorites(): void {
    this.go({ filter: { ...this.state().filter, favorite: this.favoritesOnly() ? [] : ['sim'] } });
  }

  /* ===== As marcas (o selo de aprendida e a estrela) ===== */

  protected learned(w: Word): boolean {
    return this.lookup().learned(w);
  }
  protected favorite(w: Word): boolean {
    return this.lookup().favorite(w.id);
  }
  /** "em 14 de nov", o dia em que a palavra foi aprendida (vazio quando não se sabe). */
  protected learnedSaid(w: Word): string {
    const day = this.marks.learnedDay(w);
    return day ? `em ${Number(day.slice(8, 10))} de ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}` : '';
  }

  protected setLearned(w: Word, on: boolean): void {
    const undo = this.marks.setLearned(w, on);
    this.toasts.show(on ? `“${w.text}” marcada como aprendida` : `“${w.text}” voltou para as que faltam aprender`, { label: 'Desfazer', run: undo });
  }

  protected setFavorite(w: Word, on: boolean): void {
    const undo = this.marks.setFavorite(w.id, on);
    this.toasts.show(on ? `“${w.text}” está nas favoritas` : `“${w.text}” saiu das favoritas`, { label: 'Desfazer', run: undo });
  }

  protected removeChip(c: FilterChip): void {
    this.toggle(c.key as FacetKey, c.value);
  }

  protected clearFilters(): void {
    this.go({ filter: {} });
  }

  /** O Limpar da linha de baixo e do cartão vazio: a busca e os filtros. */
  protected clearAll(): void {
    this.go({ query: '', filter: {} as DictFilter });
  }

  protected toggleFilter(e: MouseEvent): void {
    // aberta pelo teclado (Enter ou Espaço dão um clique sem posição), o foco vai para a folha
    this.filterByKeyboard.set(e.detail === 0);
    this.filterOpen.update((v) => !v);
  }

  protected closeFilter(): void {
    this.filterOpen.set(false);
    this.filterBtn()?.nativeElement.focus({ preventScroll: true });
  }

  /* ===== O que o verbete e a Tabela mostram ===== */

  /** A leitura vai em furigana por cima só quando a palavra tem kanji. */
  protected readonly ruby = (w: Word) => hasKanji(w.text) && w.text !== w.reading;
  protected readonly label = facetLabel;
  /** A classe, o grupo do verbo, o tema e a escrita, numa linha miúda. */
  protected grammar(w: Word): string {
    return [w.wordClass, w.verbGroup && facetLabel('verbGroup', w.verbGroup), w.theme, facetLabel('script', w.script)].filter(Boolean).join(' · ');
  }
  /** O registro só quando diz alguma coisa (neutro sozinho é o normal). */
  protected registers(w: Word): string {
    return w.registers.length === 1 && w.registers[0] === 'neutro' ? '' : w.registers.join(', ');
  }
  protected rankSaid(w: Word): string {
    return w.rank === null ? 'fora da lista da internet' : `${w.rank.toLocaleString('pt-BR')}ª mais comum na internet`;
  }
  protected readonly ticks = [1, 2, 3, 4, 5];

  protected ariaSort(col: Column): 'ascending' | 'descending' | null {
    if (!col.sort || col.sort !== this.sort()) return null;
    // a Importância e o Uso começam do maior: o sentido natural deles é o decrescente
    const naturalDown = col.sort === 'importance' || col.sort === 'use';
    return naturalDown !== (this.state().dir === 'desc') ? 'descending' : 'ascending';
  }
}
