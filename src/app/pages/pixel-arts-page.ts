import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { collage, shelfColumns } from '../core/clipping';
import { PixelLook } from '../core/pixel-art';
import { PIXEL_TAG_SPACE, artValues, pieceTitle, pieceWidgetLine, valuesArt } from '../core/pixel-gallery';
import { plainText } from '../core/rich-text';
import { PixelGallery } from '../core/pixel-gallery-store';
import {
  NO_PIXEL_FILTER,
  PIXEL_ORDERS,
  PIXEL_PREFS_KEY,
  PixelFilter,
  PixelGalleryPrefs,
  PixelOrder,
  PixelView,
  pieceFoundByNote,
  pieceLayout,
  pieceMatches,
  pixelDirectionLabel,
  pixelFiltering,
  pixelLookOptions,
  pixelNaturalDirection,
  sanitizePixelPrefs,
  sortPieces,
} from '../core/pixel-gallery-view';
import { downloadBlob, pieceToPng, pngName } from '../core/pixel-png';
import { fold } from '../core/review';
import { Settings } from '../core/settings';
import { readJson, writeJson } from '../core/storage';
import { ViewTransitions } from '../core/view-transitions';
import { WidgetValues } from '../core/widgets';
import { wishTagCounts, wishTagHex } from '../core/wishlist-view';
import { reducedMotion } from '../core/motion';
import { ContextMenu, ContextMenuTrigger, MenuSections } from '../ui/context-menu';
import { FilterCard, SubjectOption, activeFilters, removeActive } from '../ui/filter-card';
import { FilterChip, FilterTags } from '../ui/filter-sheet';
import { focusAfterRemoval } from '../ui/focus';
import { ICON, IconModule } from '../ui/icons';
import { Pin } from '../ui/pin';
import { PixelPieceCard } from '../ui/pixel-piece';
import { PixelSheet } from '../ui/pixel-sheet';
import { PixelStudio } from '../ui/pixel-studio/pixel-studio';
import { PixelTile } from '../ui/pixel-tile';
import { SearchHighlight } from '../ui/search-highlight';
import { SearchStrip } from '../ui/search-strip';
import { TagChip } from '../ui/tag-chips';
import { Toasts } from '../ui/toast';

/**
 * Pixel arts (PLANO-PIXEL-ARTS.md): a galeria de todas as pixel arts guardadas, em Extras. A Wishlist das Análises
 * é a base: a pasta de cima com a busca (no título, nas tags e na descrição), o Filtrar (a folha das Anotações,
 * com o Jeito de uma por vez e as Tags nas cores), a ordem com o inverter e a vista. Na Mostra, cada obra no
 * material dela, em colunas como os recortes; na Grade, muitas de uma vez, todas do mesmo tamanho. Tocar abre a
 * ficha (ui/pixel-sheet.ts); a etiqueta de hover abre o desenho direto no ateliê ou baixa o PNG. A vista e a
 * ordem ficam guardadas no aparelho.
 */
@Component({
  selector: 'app-pixel-arts-page',
  imports: [ContextMenu, FilterCard, FilterTags, IconModule, Pin, PixelPieceCard, PixelSheet, PixelStudio, PixelTile, SearchHighlight, SearchStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pixel-arts-page.html',
  styleUrl: './pixel-arts-page.scss',
})
export class PixelArtsPage {
  protected readonly gallery = inject(PixelGallery);
  private readonly settings = inject(Settings);
  private readonly transitions = inject(ViewTransitions);
  private readonly toasts = inject(Toasts);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly AddIcon = ICON.pixelArt;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly FilterIcon = ICON.filtrar;
  protected readonly DescIcon = ICON.ordenarDecrescente;
  protected readonly AscIcon = ICON.ordenarCrescente;
  protected readonly orders = PIXEL_ORDERS;
  protected readonly views: readonly { value: PixelView; label: string; hint: string; icon: typeof ICON.grade }[] = [
    { value: 'mostra', label: 'Mostra', hint: 'Mostra: cada uma no jeito dela', icon: ICON.parede },
    { value: 'grade', label: 'Grade', hint: 'Grade: muitas de uma vez', icon: ICON.grade },
  ];

  /** A vista e a ordem, do aparelho (lidas aqui e não no módulo: a limpeza do logout roda antes). */
  protected readonly prefs = signal<PixelGalleryPrefs>(sanitizePixelPrefs(readJson(PIXEL_PREFS_KEY)));
  /** A busca e os filtros: valem só nesta visita. */
  protected readonly filter = signal<PixelFilter>(NO_PIXEL_FILTER);
  protected readonly filterOpen = signal(false);
  protected readonly orderLabel = computed(() => PIXEL_ORDERS.find((o) => o.value === this.prefs().ordem)!.label);
  protected readonly directionLabel = computed(() => pixelDirectionLabel(this.prefs().ordem, this.prefs().direcao));

  /** Onde se procura: a galeria inteira. */
  protected readonly pool = computed(() => this.gallery.pieces());
  protected readonly filtering = computed(() => pixelFiltering(this.filter()));
  protected readonly visible = computed(() => {
    const f = this.filter();
    return sortPieces(
      this.pool().filter((p) => pieceMatches(p, f)),
      this.prefs(),
    );
  });

  /** As tags, na cor de cada uma, as mais usadas primeiro (o valor é a tag sem caixa e sem acento). */
  protected readonly tagChips = computed<TagChip[]>(() => {
    const { on, out } = this.filter();
    const colors = this.settings.notesConfig().wishTagColors;
    const chips: TagChip[] = wishTagCounts(this.pool()).map((t) => ({ value: t.key, label: t.label, n: t.n, on: on.has(t.key), out: out.has(t.key), color: wishTagHex(colors, PIXEL_TAG_SPACE, t.label) }));
    // a ligada (ou escondida) que nenhuma obra tem mais continua à mão, senão filtraria sem ter como desligar
    for (const k of [...on, ...out]) if (!chips.some((c) => c.value === k)) chips.push({ value: k, label: k, n: 0, on: on.has(k), out: out.has(k), color: wishTagHex(colors, PIXEL_TAG_SPACE, k) });
    return chips;
  });
  protected readonly lookOptions = computed<SubjectOption[]>(() => pixelLookOptions(this.pool(), this.filter().jeito));
  protected readonly chips = computed(() => activeFilters(this.lookOptions(), this.tagChips()));
  protected readonly noneText = computed(() => {
    const f = this.filter();
    if (f.query.trim() && !f.jeito && !f.on.size && !f.out.size) return `Nenhuma pixel art tem “${f.query.trim()}” no nome, nas tags ou na descrição.`;
    return 'Nenhuma pixel art com esses filtros.';
  });

  /** As obras que a busca achou só pela descrição: a folha do caderno fica aberta nelas. */
  protected readonly byNote = computed(() => {
    const q = this.filter().query;
    return new Set(q.trim() ? this.visible().filter((p) => pieceFoundByNote(p, q)).map((p) => p.id) : []);
  });

  /** Quantas colunas da Mostra cabem: obras de pelo menos 172px, com 34px entre elas (duas no celular). */
  protected readonly cols = signal(6);
  protected readonly columns = computed(() => collage(this.visible(), this.cols(), (id) => this.layoutOf(id).height));
  private readonly layouts = computed(() => new Map(this.visible().map((p) => [p.id, pieceLayout(p)])));
  protected layoutOf(id: string): ReturnType<typeof pieceLayout> {
    return this.layouts().get(id) ?? { width: 100, shift: 0, gap: 40, tilt: 0, height: 1 };
  }

  /** A obra que acabou de chegar (nova, ou salva): assenta com um tapa. */
  protected readonly landing = signal<string | null>(null);

  private readonly sheet = viewChild.required(PixelSheet);
  private readonly filterBtn = viewChild<ElementRef<HTMLButtonElement>>('filterBtn');
  private readonly card = viewChild(FilterCard);
  private readonly host: HTMLElement;

  // ===== O menu do botão direito (e do dedo segurado, e do Shift+F10) =====

  private readonly menu = viewChild.required<ContextMenu>('menu');
  /** A obra com o menu aberto; null com o menu do vão (ou nenhum). */
  protected readonly menuOn = signal<string | null>(null);
  protected readonly menuPiece = computed(() => (this.menuOn() ? (this.gallery.get(this.menuOn()!) ?? null) : null));
  /** No alto do menu do dedo: o começo da descrição, sem as marcas do texto (como na Wishlist). */
  protected readonly menuNote = computed(() => {
    const plain = plainText(this.menuPiece()?.note ?? '').replace(/\s+/g, ' ').trim();
    return plain.length > 180 ? plain.slice(0, 179).trimEnd() + '…' : plain;
  });
  protected readonly menuCaption = computed(() => {
    const p = this.menuPiece();
    return p ? pieceTitle(p) : 'Pixel arts';
  });
  /**
   * O da obra: o que o toque faz (a ficha, para editar) e o Ateliê; o que sai dela (o PNG, a linha do widget para colar
   * numa anotação, uma cópia); e, sozinho no fim, Apagar, com o Desfazer. O do vão: uma obra nova.
   */
  protected readonly menuSections = computed<MenuSections>(() => {
    const p = this.menuPiece();
    // a obra do menu aberto saiu (apagada noutro aparelho): o menu fecha (o efeito do construtor), não vira o do vão
    if (this.menuOn() && !p) return [];
    if (!p) return [[{ id: 'nova', label: 'Nova pixel art', icon: ICON.adicionar, dialog: true, keys: 'N', ariaKeys: 'N', run: () => this.add() }]];
    return [
      [
        { id: 'editar', label: 'Editar', icon: ICON.ajustar, dialog: true, run: () => this.open(p.id) },
        { id: 'atelie', label: 'Abrir no ateliê', icon: ICON.editar, dialog: true, run: () => this.atelie(p.id) },
      ],
      [
        { id: 'baixar', label: 'Baixar PNG', icon: ICON.baixar, run: () => void this.download(p.id) },
        { id: 'widget', label: 'Copiar como widget', icon: ICON.copiar, hint: 'Para colar numa anotação', run: () => void this.copyWidget(p.id) },
        { id: 'duplicar', label: 'Duplicar', icon: ICON.camadas, run: () => this.duplicate(p.id) },
      ],
      [{ id: 'apagar', label: 'Apagar', icon: ICON.apagar, danger: true, run: () => this.remove(p.id) }],
    ];
  });

  /** O desenho aberto direto no ateliê (o Ateliê da etiqueta), com o que mudou até agora. */
  protected readonly studio = signal<{ id: string; values: WidgetValues } | null>(null);

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    this.host = host;
    const measure = () => this.cols.set(shelfColumns(host.clientWidth, 172, 34));
    effect(() => {
      if (this.menuOn() && !this.menuPiece()) untracked(() => this.menu().close(false));
    });
    // o botão direito numa obra (o menu dela) ou no vão da parede (uma obra nova)
    new ContextMenuTrigger({
      host,
      targets: 'app-pixel-piece[data-ficha], app-pixel-tile[data-ficha], .mostra, .grade',
      keyOf: (box) => {
        const id = box.getAttribute('data-ficha');
        if (!id) return 'vao';
        return this.gallery.get(id) ? id : null;
      },
      hold: true,
      isOpenFor: (key) => this.menu().isOpenFor(key),
      open: (key, box, x, y, by) => {
        this.menuOn.set(key === 'vao' ? null : key);
        // o foco volta para onde estava na obra (Shift+F10 no Ateliê); senão, para o toque dela
        const active = document.activeElement;
        this.menu().show({ key, x, y, by, back: active instanceof HTMLElement && box.contains(active) ? active : key === 'vao' ? null : box.querySelector<HTMLElement>('.hit') });
      },
    });
    // a vista e a ordem ficam no aparelho (writeJson respeita a trava da limpeza do logout)
    let saved = JSON.stringify(this.prefs());
    effect(() => {
      const now = JSON.stringify(this.prefs());
      if (now === saved) return;
      saved = now;
      writeJson(PIXEL_PREFS_KEY, this.prefs());
    });
    // o "Nova pixel art" do topo (e o N): a ficha nova; o pedido de antes de a página abrir não conta
    let asked = this.gallery.compose();
    effect(() => {
      const n = this.gallery.compose();
      if (n === asked) return;
      asked = n;
      untracked(() => this.add());
    });
    afterNextRender(() => {
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(host);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  // ===== A busca e os filtros =====

  protected setQuery(q: string): void {
    this.filter.update((f) => ({ ...f, query: q }));
  }

  protected toggleFilter(e: MouseEvent): void {
    if (this.filterOpen()) {
      this.closeFilter();
      return;
    }
    this.filterOpen.set(true);
    // aberta pelo teclado (Enter ou espaço não têm clique de verdade): o foco desce para a folha
    if (e.detail === 0) afterNextRender(() => this.card()?.focusFirst(), { injector: this.injector });
  }

  protected closeFilter(): void {
    const el = document.getElementById('cartela-pixel');
    const hadFocus = !!el && el.contains(document.activeElement);
    this.filterOpen.set(false);
    if (hadFocus) this.filterBtn()?.nativeElement.focus();
  }

  protected chooseLook(v: string | null): void {
    this.transitions.run(() => this.filter.update((f) => ({ ...f, jeito: (v as PixelLook | null) || null })));
  }

  /** Um toque na tag: a escondida volta; a ligada desliga; senão, liga. */
  protected toggleTag(key: string): void {
    const k = fold(key);
    this.transitions.run(() =>
      this.filter.update((f) => {
        const on = new Set(f.on);
        const out = new Set(f.out);
        if (out.has(k)) out.delete(k);
        else if (on.has(k)) on.delete(k);
        else on.add(k);
        return { ...f, on, out };
      }),
    );
  }

  /** O botão direito na tag: esconde as com ela (de novo: mostra). */
  protected excludeTag(key: string): void {
    const k = fold(key);
    this.transitions.run(() =>
      this.filter.update((f) => {
        const on = new Set(f.on);
        const out = new Set(f.out);
        on.delete(k);
        if (out.has(k)) out.delete(k);
        else out.add(k);
        return { ...f, on, out };
      }),
    );
  }

  protected removeChip(c: FilterChip): void {
    removeActive(c, { subjectChosen: (v) => this.chooseLook(v), tagToggled: (v) => this.toggleTag(v) });
  }

  /** O Limpar tudo da folha: o jeito e as tags (a busca fica). */
  protected clearChoices(): void {
    this.transitions.run(() => this.filter.update((f) => ({ ...NO_PIXEL_FILTER, query: f.query })));
  }

  /** O Limpar da pasta: tudo, a busca também. */
  protected clear(): void {
    this.transitions.run(() => this.filter.set(NO_PIXEL_FILTER));
  }

  // ===== A ordem e a vista =====

  protected sort(o: PixelOrder): void {
    if (o === this.prefs().ordem) return;
    this.transitions.run(() => this.prefs.update((p) => ({ ...p, ordem: o, direcao: pixelNaturalDirection(o) })));
  }

  protected flip(): void {
    this.transitions.run(() => this.prefs.update((p) => ({ ...p, direcao: p.direcao === 'desc' ? 'asc' : 'desc' })));
  }

  protected setView(v: PixelView): void {
    if (v === this.prefs().vista) return;
    this.prefs.update((p) => ({ ...p, vista: v }));
  }

  // ===== Criar, abrir, o ateliê, baixar, apagar =====

  /** Uma obra nova: a ficha, com o ateliê aberto por cima. */
  protected add(): void {
    this.sheet().open();
  }

  /** A obra nova chegou: os filtros que a esconderiam saem da frente, e ela assenta na parede. */
  protected created(id: string): void {
    const p = this.gallery.get(id);
    if (p && !pieceMatches(p, this.filter())) this.filter.set(NO_PIXEL_FILTER);
    this.land(id);
  }

  /** Abre a ficha da obra; apagar por ela leva o foco ao vizinho, como o menu. */
  protected open(id: string): void {
    const p = this.gallery.get(id);
    if (!p) return;
    this.sheet().edit(p, { remove: () => this.remove(id), saved: () => this.follow(id) });
  }

  /** O Ateliê da etiqueta: o desenho direto no ateliê, por cima de tudo; o que mudar vai para a obra ao fechar. */
  protected atelie(id: string): void {
    const p = this.gallery.get(id);
    if (p) this.studio.set({ id, values: artValues(p.art) });
  }

  protected drawn(v: WidgetValues): void {
    // o ateliê manda o desenho (os pontos, a grade, a paleta, as cores): o jeito fica o da obra
    this.studio.update((s) => (s ? { ...s, values: { ...s.values, ...v } } : s));
  }

  /** O ateliê fechou: o desenho mudado vai para a obra (com o Desfazer), e o foco volta para o Ateliê dela. */
  protected studioClosed(): void {
    const s = this.studio();
    this.studio.set(null);
    if (!s) return;
    const p = this.gallery.get(s.id);
    const art = valuesArt(s.values);
    if (p && art) {
      const undo = this.gallery.update(s.id, { art });
      if (undo) this.toasts.show(`“${pieceTitle(p)}” mudou na galeria`, { label: 'Desfazer', run: () => this.transitions.run(undo) });
    } else if (p) {
      this.toasts.show('Uma pixel art precisa de pelo menos um ponto: o desenho ficou como era.');
    }
    this.follow(s.id, 'app-pixel-actions .atelie');
  }

  /** O Baixar: o PNG nítido da obra. */
  protected async download(id: string): Promise<void> {
    const p = this.gallery.get(id);
    if (!p) return;
    const blob = await pieceToPng(p);
    if (!blob) {
      this.toasts.show('Não consegui montar a imagem agora. Tente de novo.');
      return;
    }
    downloadBlob(blob, pngName(p));
  }

  /** A linha do widget (`{{pixel: …}}`, com o nome de legenda) na área de transferência, para colar numa anotação. */
  protected copyWidget(id: string): Promise<void> {
    const p = this.gallery.get(id);
    if (!p) return Promise.resolve();
    return this.toasts.copy(pieceWidgetLine(p), 'Copiei a pixel art como widget: cole numa anotação.', 'Não deu para copiar. Tente de novo.');
  }

  /** Uma cópia da obra, com "(cópia)" no nome: entra como a mais nova, e a tela vai até ela. */
  protected duplicate(id: string): void {
    const p = this.gallery.get(id);
    if (!p) return;
    const made = this.gallery.create({ art: p.art, title: p.title ? `${p.title} (cópia)` : '', tags: p.tags ?? [], note: p.note ?? '', folder: p.folder });
    if (!made) {
      this.toasts.show('A galeria está cheia: apague uma pixel art para guardar outra.');
      return;
    }
    this.land(made.id);
    this.toasts.show(`Fiz uma cópia de “${pieceTitle(p)}”.`, { label: 'Desfazer', run: () => this.transitions.run(() => this.gallery.remove([made.id])) });
  }

  /** Apaga (com o Desfazer); o foco vai para a obra vizinha, ou para a busca. */
  protected remove(id: string): void {
    const p = this.gallery.get(id);
    if (!p) return;
    focusAfterRemoval(this.host, this.visible().map((x) => x.id), id, (n) => `[data-ficha="${CSS.escape(n)}"] .hit`, '.vazio .btn-ink, #busca-pixel');
    this.transitions.run(() => {
      const gone = this.gallery.remove([id]);
      this.toasts.show(`“${pieceTitle(p)}” saiu da galeria`, { label: 'Desfazer', run: () => this.transitions.run(() => this.gallery.restore(gone)) });
    });
  }

  /** A obra assenta na parede (nova, ou mudada): a tela vai até ela e o foco também. */
  private land(id: string): void {
    this.landing.set(id);
    setTimeout(() => this.landing.update((x) => (x === id ? null : x)), 900);
    this.follow(id);
  }

  /** O teclado vai até a obra (no botão `at` dela, ou no toque), depois que a parede assenta. */
  private follow(id: string, at: string | null = null): void {
    afterNextRender(
      () => {
        setTimeout(() => {
          const box = this.host.querySelector(`[data-ficha="${CSS.escape(id)}"]`);
          const btn = (at ? box?.querySelector<HTMLElement>(at) : null) ?? box?.querySelector<HTMLElement>('.hit');
          btn?.focus({ preventScroll: true });
          btn?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
        }, 140);
      },
      { injector: this.injector },
    );
  }
}
