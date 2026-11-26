import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, afterRenderEffect, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
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
  matcher,
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
import { NearPool, NearScreen } from '../ui/near-screen';
import { ThumbIndex, ThumbRow } from '../ui/thumb-index';
import { Toasts } from '../ui/toast';
import { WordBoard } from '../ui/word-board';
import { WordDrill } from '../ui/word-drill';
import { DrillStart, WordDrillSetup } from '../ui/word-drill-setup';
import { DRILL_WAYS, DrillWay } from '../core/dictionary/drill';
import { WordEntry, daySaid, entryHeightGuess } from '../ui/word-entry';
import { markFavorite, markLearned } from '../ui/word-marking';
import { WordSeals } from '../ui/word-seals';
import { WordVoice } from '../ui/word-voice';

type View = DictState['view'];

/**
 * Digitando, a lista espera a pessoa parar por este tempo (ms) antes de procurar: cada tecla aparece no campo na hora,
 * e só a última procura nas 1.449 palavras (PLANO-DICIONARIO.md, 8.4).
 */
export const SEARCH_PAUSE_MS = 150;

/** Uma coluna da Tabela: o nome, a ordem que o clique na cabeça escolhe (sem, a coluna não ordena) e a largura. */
interface Column {
  id: string;
  label: string;
  sort?: SortKey;
  /** Números, à direita e com algarismos alinhados. */
  num?: boolean;
  /**
   * A largura, em rem: fixa, para a tabela não mudar de largura conforme as linhas perto da tela montam (as de longe
   * são vagas). São as que a tabela tinha quando cada coluna se ajustava ao maior texto dela, arredondadas para cima.
   */
  width: number;
}

const COLUMNS: readonly Column[] = [
  { id: 'n', label: 'Nº', sort: 'priority', num: true, width: 3.79 },
  { id: 'marcas', label: 'Marcas', width: 5.38 },
  { id: 'palavra', label: 'Japonês', sort: 'reading', width: 7.5 },
  { id: 'romaji', label: 'Romaji', width: 12.07 },
  { id: 'sentido', label: 'Português', sort: 'meaning', width: 13 },
  { id: 'jlpt', label: 'JLPT', sort: 'jlpt', width: 5.29 },
  { id: 'uso', label: 'Uso', sort: 'use', width: 5.17 },
  { id: 'imp', label: 'Imp.', sort: 'importance', num: true, width: 3.33 },
  { id: 'classe', label: 'Classe', sort: 'wordClass', width: 10.17 },
  { id: 'tema', label: 'Tema', sort: 'theme', width: 7.32 },
  { id: 'escrita', label: 'Escrita', width: 6.74 },
  { id: 'registro', label: 'Registro', width: 7 },
  { id: 'rank', label: 'Internet', sort: 'rank', num: true, width: 5.28 },
  { id: 'composicao', label: 'Relacionadas', width: 12 },
  { id: 'notas', label: 'Descrição', width: 18 },
  { id: 'origem', label: 'Origem', width: 14 },
];
const TABLE_WIDTH = COLUMNS.reduce((n, c) => n + c.width, 0);

/**
 * A altura de uma linha da Tabela pelo que ela tem dentro: a vaga da linha ainda não montada (só as perto da caixa
 * que rola são montadas). Com as larguras fixas, cada coluna que quebra a linha cabe tantas letras por linha (medido
 * nas 1.449 linhas: erro médio de 4,5 px, nunca mais de uma linha); a linha tem a altura da coluna mais alta, e
 * nunca menos que a da palavra com a leitura embaixo. Conta com a letra de 16 px do site (com outra, o palpite erra
 * até a linha montar). Montada uma vez, vale a medida dela (ui/near-screen.ts).
 */
export function tableRowGuess(w: Word): number {
  let guess = rowGuesses.get(w);
  if (guess === undefined) rowGuesses.set(w, (guess = rowGuessOf(w)));
  return guess;
}
/** Os palpites já feitos (a palavra não muda: um por palavra, e não a cada vez que a Tabela confere). */
const rowGuesses = new WeakMap<Word, number>();
function rowGuessOf(w: Word): number {
  const line = 0.92 * 16 * 1.35;
  const lines = (text: string, perLine: number) => Math.max(1, Math.ceil(text.length / perLine));
  const most = Math.max(lines(w.meaning, 18), lines(w.composition, 20), lines(w.notes, 36), lines(w.origin, 28), lines(w.registers.join(', '), 8));
  return Math.max(61.7, Math.round(19 + most * line));
}

/**
 * O Dicionário Japonês de Outros (PLANO-DICIONARIO.md): as palavras do CSV do dono para consultar. A pasta da
 * Wishlist e das Pixel arts em cima (a busca, o Filtrar com a folha de filtros em linhas, a ordem com a seta e a
 * vista) e, embaixo, a página do dicionário: os verbetes em duas colunas, em seções da ordem escolhida, ou a Tabela
 * com todas as colunas. Tudo o que a página mostra mora no endereço: nada é guardado, ninguém escreve aqui.
 */
@Component({
  selector: 'app-dictionary-page',
  imports: [FacetFilters, FilterTags, IconModule, NearScreen, Pin, SearchHighlight, SearchStrip, SectionHead, ThumbIndex, WordBoard, WordDrill, WordDrillSetup, WordEntry, WordSeals, WordVoice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dictionary-page.html',
  styleUrl: './dictionary-page.scss',
})
export class DictionaryPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly marks = inject(DictionaryMarks);
  private readonly toasts = inject(Toasts);
  private readonly nearPool = inject(NearPool);
  private readonly injector = inject(Injector);
  protected readonly StarIcon = ICON.estrela;
  protected readonly TrainIcon = ICON.alvo;

  protected readonly FilterIcon = ICON.filtrar;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly DescIcon = ICON.ordenarDecrescente;
  protected readonly AscIcon = ICON.ordenarCrescente;
  protected readonly views: readonly { value: View; label: string; hint: string; icon: typeof ICON.livros }[] = [
    { value: 'verbetes', label: 'Verbetes', hint: 'As palavras como num dicionário de papel', icon: ICON.livros },
    { value: 'tabela', label: 'Tabela', hint: 'Todas as colunas numa tabela', icon: ICON.tabela },
  ];
  protected readonly columns = COLUMNS;
  protected readonly tableWidth = TABLE_WIDTH;

  private readonly data = dictionaryWords();
  /** Todas as palavras, na ordem do CSV. */
  protected readonly all = this.data.words;

  /** O estado da página, lido do endereço (a busca, os filtros, a ordem e a vista). */
  protected readonly state = toSignal(this.route.queryParamMap.pipe(map((p) => stateFromParams(Object.fromEntries(p.keys.map((k) => [k, p.get(k) ?? undefined]))))), {
    initialValue: stateFromParams({}),
  });

  /**
   * A busca digitada, no campo na hora. Ler de volta do endereço a cada tecla reescreveria o campo com uma navegação
   * atrasada enquanto a pessoa ainda digita; o endereço só manda quando muda por fora (voltar do navegador, um link).
   */
  protected readonly query = signal(this.state().query);
  /**
   * A busca que a lista mostra: a digitada, quando a pessoa para de digitar (`SEARCH_PAUSE_MS`), e na hora quando ela
   * apaga tudo, mexe em outra coisa ou o endereço muda por fora. Junto, a busca vai para o endereço.
   */
  protected readonly searched = signal(this.state().query);
  private sentQuery = this.state().query;
  private typing: ReturnType<typeof setTimeout> | undefined;

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
    // outra busca, outro filtro, outra ordem, outra vista: o que está na tela é montado antes da pintura, sem passar
    // por uma tela de vagas (ver ui/near-screen.ts); e a largura das colunas, para o palpite das vagas
    afterRenderEffect(() => {
      this.shown();
      this.state().view;
      untracked(() => {
        this.nearPool.settle();
        this.measureColumn();
      });
    });
    // a janela mudando de tamanho: uma medida por quadro (cada largura nova refaz os palpites das 1.449 vagas)
    let resizing = 0;
    const onResize = () => {
      if (!resizing)
        resizing = requestAnimationFrame(() => {
          resizing = 0;
          this.measureColumn();
        });
    };
    window.addEventListener('resize', onResize, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(resizing);
      clearTimeout(this.typing);
      this.stopJump?.(false);
    });
    effect(() => {
      const fromUrl = this.state().query;
      // o endereço mudou por fora (não foi a página que mandou): a busca segue
      if (fromUrl !== this.sentQuery)
        untracked(() => {
          clearTimeout(this.typing);
          this.query.set(fromUrl);
          this.searched.set(fromUrl);
        });
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
    const q = this.searched();
    if (!q.trim()) return { words: this.all, scores: null };
    const score = matcher(q);
    const scores = new Map<string, number>();
    for (const w of this.all) {
      const s = score(this.data.keys.get(w.id)!);
      if (s) scores.set(w.id, s);
    }
    return { words: this.all.filter((w) => scores.has(w.id)), scores };
  });

  /** O que a busca e os filtros mostram, na ordem escolhida. */
  protected readonly sort = computed(() => effectiveSort({ ...this.state(), query: this.searched() }));
  private readonly dir = computed(() => this.state().dir);
  /**
   * Todas as palavras na ordem escolhida, refeita só quando a ordem muda: buscar, filtrar e marcar só tiram palavras
   * dela (a ordem desempata pela prioridade, então tirar palavras não muda a ordem das que ficam).
   */
  private readonly ordered = computed(() => {
    const sort = this.sort();
    return sort === 'relevance' ? null : sortWords(this.all, sort, this.dir());
  });
  protected readonly shown = computed(() => {
    const { filter } = this.state();
    const { words, scores } = this.found();
    const marks = this.lookup();
    const keep = (w: Word) => (!scores || scores.has(w.id)) && passes(w, filter, undefined, marks);
    const ordered = this.ordered();
    if (ordered) return ordered.filter(keep);
    return sortWords(words.filter(keep), 'relevance', this.dir(), (w) => scores?.get(w.id) ?? 0);
  });
  protected readonly sections = computed(() => sectionsOf(this.shown(), this.sort()));

  /* ===== Só o que está perto da tela (PLANO-DICIONARIO.md, 8.2) ===== */

  /** A largura de uma coluna dos Verbetes (0 antes de medir): o palpite da altura das vagas depende dela. */
  private readonly column = signal(0);
  /** Os Verbetes estão em duas colunas (larga) ou numa só (estreita). */
  private readonly twoColumns = signal(true);

  private measureColumn(): void {
    const li = this.host.nativeElement.querySelector<HTMLElement>('.lugar-verbete');
    if (!li?.offsetWidth) return;
    this.column.set(li.offsetWidth);
    this.twoColumns.set(li.offsetWidth * 2 <= (li.parentElement?.offsetWidth ?? 0));
  }

  /** O palpite da altura de cada verbete, feito uma vez por largura de coluna (e não a cada vez que a página confere). */
  private readonly guesses = computed(() => {
    const width = this.column() || 600;
    return new Map(this.all.map((w) => [w.id, entryHeightGuess(w, width)]));
  });

  /** A altura da vaga de um verbete: a medida dele, se já foi montado; senão, o palpite pelo que ele tem dentro. */
  protected entryHeight(w: Word): number {
    return this.nearPool.measured('verbete', w.id) ?? this.guesses().get(w.id)!;
  }

  /**
   * A altura de cada seção dos Verbetes, para a seção que o navegador ainda não desenhou (content-visibility): o nome
   * e as vagas dela, divididas pelas colunas (as duas colunas se equilibram), com o vão entre os cartões. Feita quando
   * as seções ou a largura mudam; desenhada uma vez, a seção guarda a altura de verdade (`auto`).
   */
  protected readonly sectionHeights = computed(() => {
    const twoColumns = this.twoColumns();
    const gap = twoColumns ? 32 : 20;
    this.guesses();
    return this.sections().map((s) => {
      const total = untracked(() => s.words.reduce((n, w) => n + this.entryHeight(w) + gap, 0)) - gap;
      return Math.round(62 + (twoColumns ? total / 2 : total));
    });
  });

  /**
   * O Tab chegou numa vaga (o verbete ou a linha ainda não montados): ela vira o cartão na hora, e o foco entra nele,
   * no primeiro botão indo para a frente e no último voltando (Shift+Tab). Sem isso, o Tab pularia as palavras ainda
   * não montadas: nas duas colunas, a de baixo da esquerda vem depois da de cima da direita.
   */
  protected enterVaga(perto: NearScreen, e: FocusEvent): void {
    const place = perto.el;
    const from = e.relatedTarget;
    const back = from instanceof Node && !!(place.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING);
    // um clique na vaga (rolando rápido) só a monta: o foco entra no cartão só quando chegou pelo teclado
    const byKeyboard = e.target instanceof Element && e.target.matches(':focus-visible');
    perto.mount();
    if (!byKeyboard) return;
    afterNextRender(
      () => {
        const stops = [...place.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.closest('[data-vaga]'));
        (back ? stops.at(-1) : stops[0])?.focus();
      },
      { injector: this.injector },
    );
  }

  /** A altura da vaga de uma linha da Tabela: a medida dela, se já foi montada; senão, o palpite. */
  protected rowHeight(w: Word): number {
    return this.nearPool.measured('linha', w.id) ?? tableRowGuess(w);
  }

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
    // o que ficou na tela é montado já, e não aos poucos
    this.nearPool.settle();
    // como um link na página: o leitor de tela continua da linha, e não do índice
    const heading = el.querySelector<HTMLElement>('[id^="dic-secao-"]');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    this.thumbAt.set(id);
    this.holdJump(el);
  }

  /** O pulo do índice que ainda está acertando o lugar (ver `holdJump`), para outro pulo ou a saída o pararem. */
  private jumpFrame = 0;
  private stopJump: ((spy?: boolean) => void) | null = null;

  /**
   * As seções e as vagas longe da tela têm a altura estimada: desenhadas as de perto (e as de cima que o navegador
   * desenha pela primeira vez), a linha sai do lugar. O pulo é refeito a cada quadro até ela ficar parada por três
   * quadros, por no máximo 15; a pessoa rolando, tocando (a barra de rolagem também) ou teclando, para na hora.
   */
  private holdJump(el: HTMLElement): void {
    this.stopJump?.(false);
    const target = el.getBoundingClientRect().top;
    let frames = 0;
    let still = 0;
    const events = ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const;
    const onInput = () => stop();
    // (saindo da página, só solta: medir o índice de uma página que está indo embora não serve para nada)
    const stop = (spy = true) => {
      cancelAnimationFrame(this.jumpFrame);
      for (const type of events) removeEventListener(type, onInput);
      this.stopJump = null;
      if (spy) this.spyThumb();
    };
    for (const type of events) addEventListener(type, onInput, { passive: true });
    this.stopJump = stop;
    const redo = () => {
      if (!el.isConnected || ++frames > 15) return stop();
      if (Math.abs(el.getBoundingClientRect().top - target) > 1) {
        el.scrollIntoView({ block: 'start' });
        still = 0;
      } else if (++still >= 3) return stop();
      this.jumpFrame = requestAnimationFrame(redo);
    };
    this.jumpFrame = requestAnimationFrame(redo);
  }

  protected readonly searching = computed(() => !!this.searched().trim());
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
  protected readonly noneTitle = computed(() => (this.searching() && !this.filtered() ? `Nada com “${this.searched().trim()}”` : 'Nenhuma palavra com esse filtro'));
  protected readonly noneText = computed(() =>
    this.searching()
      ? 'Procure em português, em romaji (kuru), em kana (くる) ou em kanji (来る). Os filtros ligados também valem para a busca.'
      : 'Os filtros ligados juntos não deixam nenhuma palavra. Tire um deles para ver mais.',
  );

  /* ===== Mudar o endereço (a única coisa que a página escreve) ===== */

  /** `push`: uma entrada nova no histórico (abrir a lousa: o voltar do celular fecha ela). */
  private go(next: Partial<DictState>, push = false): void {
    clearTimeout(this.typing);
    const s = { ...this.state(), query: this.query(), ...next };
    this.query.set(s.query);
    this.searched.set(s.query);
    this.sentQuery = s.query;
    void this.router.navigate([], { relativeTo: this.route, queryParams: paramsOf(s), replaceUrl: !push });
  }

  /** Uma tecla na busca: o campo na hora; a lista e o endereço quando a pessoa para (apagar tudo vale na hora). */
  protected setQuery(query: string): void {
    this.query.set(query);
    clearTimeout(this.typing);
    if (!query.trim()) this.go({ query });
    else this.typing = setTimeout(() => this.go({ query }), SEARCH_PAUSE_MS);
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

  /** Um link da lousa (a composição, as palavras com o mesmo kanji): uma entrada nova, e o voltar volta à de antes. */
  protected gotoBoard(w: Word): void {
    this.go({ word: w.id }, true);
  }

  protected closeBoard(): void {
    if (this.state().word) this.go({ word: null });
  }

  protected stepBoard(delta: -1 | 1): void {
    const b = this.boardWord();
    const next = b && b.index >= 0 ? this.shown()[b.index + delta] : undefined;
    if (next) this.go({ word: next.id });
  }

  /* ===== O Treino (PLANO-TREINO-DICIONARIO.md) ===== */

  /** Os jeitos de treinar que a mesa já tem. */
  protected readonly drillWays: readonly DrillWay[] = DRILL_WAYS;
  /** A folha de montar aberta. */
  protected readonly drilling = signal<'montar' | null>(null);
  /** O treino na mesa: a montagem e as palavras que combinam. */
  protected readonly drillRun = signal<DrillStart | null>(null);

  protected startDrill(run: DrillStart): void {
    this.drillRun.set(run);
  }

  /** A folha fechou: o foco volta ao Treinar (quando não abriu a mesa). */
  protected setupClosed(): void {
    this.drilling.set(null);
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
