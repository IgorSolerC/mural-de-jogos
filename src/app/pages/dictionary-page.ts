import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import {
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
import { KANA_ROWS } from '../core/dictionary/kana';
import { isLearned } from '../core/dictionary/marks';
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
import { ThumbIndex, ThumbRow } from '../ui/thumb-index';
import { Toasts } from '../ui/toast';
import { WordBoard } from '../ui/word-board';
import { WordEntry, daySaid } from '../ui/word-entry';
import { markFavorite, markLearned } from '../ui/word-marking';
import { WordSeals } from '../ui/word-seals';
import { WordVoice } from '../ui/word-voice';

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
  imports: [FacetFilters, FilterTags, IconModule, Pin, SearchHighlight, SearchStrip, SectionHead, ThumbIndex, WordBoard, WordEntry, WordSeals, WordVoice],
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /**
   * O último entalhe tocado, e quando: no pé da página, a linha curta do fim nunca chega ao alto da tela, e vale o
   * toque, mas só logo depois dele (rolando à mão, volta a valer o que está no alto).
   */
  private thumbJumped: { id: string; at: number } | null = null;

  constructor() {
    loadKleeOne();
    // o índice de dedo acompanha a rolagem (um cálculo por quadro, e só com o índice à mostra)
    let frame = 0;
    const onScroll = () => {
      if (!frame && this.thumbRows())
        frame = requestAnimationFrame(() => {
          frame = 0;
          this.spyThumb();
        });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    });
    // as seções mudaram (busca, filtro, a ordem trocada para Leitura): o entalhe aceso é medido de novo
    afterRenderEffect(() => {
      if (this.thumbRows()) untracked(() => this.spyThumb());
    });
    effect(() => {
      const fromUrl = this.state().query;
      // o endereço mudou por fora (não foi a página que mandou): a busca segue
      if (fromUrl !== this.sentQuery) untracked(() => this.query.set(fromUrl));
      this.sentQuery = fromUrl;
    });
  }

  /** As marcas do dono, como os filtros as perguntam (o CSV por baixo, a marca por cima). */
  private readonly lookup = computed<MarkLookup>(() => {
    // lidos aqui para o filtro refazer as contas quando as marcas ou a conta mudam
    const byId = this.marks.byId();
    const csv = this.marks.csvApplies();
    return { learned: (w) => isLearned(w, byId.get(w.id), csv), favorite: (id) => !!byId.get(id)?.favorite };
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

  /* ===== O índice de dedo (PLANO-DICIONARIO.md, 5.3) ===== */

  /**
   * Os entalhes do índice, com a ordem Leitura nos Verbetes: as dez linhas do silabário sempre (a que a busca ou os
   * filtros esvaziaram fica apagada) e, se houver, a de Outros. Fora disso, null: o índice não aparece.
   */
  protected readonly thumbRows = computed<ThumbRow[] | null>(() => {
    if (this.sort() !== 'reading' || this.state().view !== 'verbetes' || !this.shown().length) return null;
    const counts = new Map(this.sections().map((s) => [s.key?.id, s.words.length]));
    const rows = KANA_ROWS.map((r, i) => ({ id: `kana-${i}`, kana: r.kana, romaji: r.romaji, count: counts.get(`kana-${i}`) ?? 0 }));
    const others = counts.get('kana-outros');
    if (others) rows.push({ id: 'kana-outros', kana: '他', romaji: 'outros', count: others });
    return rows;
  });
  /** A linha em que a página está (a última seção cujo topo já passou do alto da tela). */
  protected readonly thumbAt = signal<string | null>(null);

  private spyThumb(): void {
    const heads = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.secao[data-secao]')];
    let at = heads[0]?.dataset['secao'] ?? null;
    for (const h of heads) {
      if (h.getBoundingClientRect().top > 140) break;
      at = h.dataset['secao']!;
    }
    // no pé da página: a linha tocada, se está à vista (a curta do fim não sobe até o alto)
    const bottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    const recent = this.thumbJumped && performance.now() - this.thumbJumped.at < 1000 ? this.thumbJumped.id : null;
    const jumped = bottom && recent ? heads.find((h) => h.dataset['secao'] === recent) : undefined;
    if (jumped && jumped.getBoundingClientRect().top < window.innerHeight) at = recent;
    this.thumbAt.set(at);
  }

  /** Um entalhe: a página pula para a linha do silabário. */
  protected jumpTo(id: string): void {
    const el = this.host.nativeElement.querySelector<HTMLElement>(`.secao[data-secao="${id}"]`);
    if (!el) return;
    this.thumbJumped = { id, at: performance.now() };
    el.scrollIntoView({ block: 'start' });
    // como um link na página: o leitor de tela continua da linha, e não do índice
    const heading = el.querySelector<HTMLElement>('[id^="dic-secao-"]');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    // as seções longe da tela têm a altura estimada (content-visibility): desenhadas as de perto, o pulo é refeito
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'start' });
        this.spyThumb();
      }),
    );
    this.thumbAt.set(id);
  }

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

  /** `push`: uma entrada nova no histórico (abrir a lousa: o voltar do celular fecha ela). */
  private go(next: Partial<DictState>, push = false): void {
    const s = { ...this.state(), query: this.query(), ...next };
    this.query.set(s.query);
    this.sentQuery = s.query;
    void this.router.navigate([], { relativeTo: this.route, queryParams: paramsOf(s), replaceUrl: !push });
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

  /* ===== A lousa ===== */

  /** A palavra aberta na lousa e o lugar dela na lista (as setas andam pela lista que a página mostra). */
  protected readonly boardWord = computed(() => {
    const id = this.state().word;
    if (!id) return null;
    const word = this.all.find((w) => w.id === id);
    return word ? { word, index: this.shown().findIndex((w) => w.id === id) } : null;
  });

  protected openBoard(w: Word): void {
    this.go({ word: w.id }, !this.state().word);
  }

  protected closeBoard(): void {
    if (this.state().word) this.go({ word: null });
  }

  protected stepBoard(delta: -1 | 1): void {
    const b = this.boardWord();
    const next = b && b.index >= 0 ? this.shown()[b.index + delta] : undefined;
    if (next) this.go({ word: next.id });
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
    return daySaid(this.marks.learnedDay(w));
  }

  protected setLearned(w: Word, on: boolean): void {
    markLearned(this.marks, this.toasts, w, on);
  }

  protected setFavorite(w: Word, on: boolean): void {
    markFavorite(this.marks, this.toasts, w, on);
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

  protected readonly label = facetLabel;
  protected ariaSort(col: Column): 'ascending' | 'descending' | null {
    if (!col.sort || col.sort !== this.sort()) return null;
    // a Importância e o Uso começam do maior: o sentido natural deles é o decrescente
    const naturalDown = col.sort === 'importance' || col.sort === 'use';
    return naturalDown !== (this.state().dir === 'desc') ? 'descending' : 'ascending';
  }
}
