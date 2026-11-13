import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { ICON, IconModule } from '../ui/icons';
import { collage, placeFor, shelfColumns } from '../core/clipping';
import { Desk } from '../core/desk';
import { g } from '../core/kinds';
import { Mural } from '../core/mural';
import { RELEVANCES, Relevance, Wish, fold, relevanceLabel, relevanceOf } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { readJson, writeJson } from '../core/storage';
import { ViewTransitions } from '../core/view-transitions';
import {
  NO_WISH_FILTER,
  WISHLIST_PREFS_KEY,
  WISH_ORDERS,
  WishFilter,
  WishOrder,
  WishView,
  WishlistPrefs,
  naturalDirection,
  sanitizeWishlistPrefs,
  sortWishes,
  wishDirectionLabel,
  wishFiltering,
  wishMatches,
  wishTagCounts,
  wishTagHex,
  wishVontadeOptions,
} from '../core/wishlist-view';
import { Toasts } from '../ui/toast';
import { ContextMenu, ContextMenuTrigger, MenuItem, MenuSections } from '../ui/context-menu';
import { FilterCard, SubjectOption, activeFilters, removeActive } from '../ui/filter-card';
import { FilterChip, FilterTags } from '../ui/filter-sheet';
import { focusAfterRemoval } from '../ui/focus';
import { SearchHighlight } from '../ui/search-highlight';
import { SearchStrip } from '../ui/search-strip';
import { TagChip } from '../ui/tag-chips';
import { WishClip } from '../ui/wish-clip';
import { WishCover } from '../ui/wish-cover';
import { WishTags } from '../ui/wish-tags';
import { reducedMotion } from '../core/motion';


/**
 * Wishlist: o que você quer jogar, ler ou ver, no mural aberto. Cada item é a capa recortada de uma
 * revista e colada na parede, uma colagem. Tocar num recorte começa a resenha; pregada, ela sai daqui.
 * O adesivo na quina diz quanta vontade: MUST PLAY vem na frente, LATER vai para o fim.
 * Sem saber o que escolher? O sorteio tira um da parede.
 *
 * A pasta de cima é a do mural (PLANO-WISHLIST.md, 4.1): a busca (no nome e no lembrete), o Filtrar (a folha
 * das Anotações, com a Vontade e as Tags), a ordem com o inverter e o "MUST 1º", a vista (Recortes, a colagem;
 * Grade, muitas capas de uma vez) e o Sortear. A vista e a ordem ficam guardadas no aparelho.
 */
@Component({
  selector: 'app-wishlist-page',
  imports: [ContextMenu, FilterCard, FilterTags, IconModule, SearchHighlight, SearchStrip, WishClip, WishCover, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()', '[class.com-sorteio]': 'winner()' },
  template: `
    <!-- o nome e a contagem estão no índice embaixo do topo (ui/area-bar.ts) -->
    <h1 class="sr-only">Wishlist</h1>

    @if (mural.wishCount()) {
      <!-- a pasta, como no mural: a busca, a ordem e o sorteio em tinta e, depois do picote, o que a
           busca achou -->
      <div class="pasta solta">
        <div class="pasta-linha">
          <app-search-strip
            class="pasta-busca"
            inputId="busca-desejos"
            [glued]="true"
            label="Procurar na wishlist"
            placeholder="Procurar na wishlist…"
            [value]="filter().query"
            (valueChange)="setQuery($event)"
          />

          <div class="pasta-controles">
            <div class="pasta-grupo">
              <button
                #filterBtn
                type="button"
                class="tinta"
                [attr.aria-expanded]="filterOpen()"
                aria-controls="cartela-desejos"
                (click)="toggleFilter($event)"
              >
                <lucide-icon [img]="FilterIcon" [size]="18" aria-hidden="true" />
                <span>Filtrar</span>
                @if (chips().length) {
                  <span class="tinta-n" aria-hidden="true">{{ chips().length }}</span>
                  <span class="sr-only">({{ chips().length }} ligados)</span>
                }
              </button>
            </div>

            <div class="pasta-grupo" role="group" aria-label="Ordenar">
              <label class="tinta campo">
                <span class="campo-pre">Ordenar</span>
                <span class="campo-val" aria-hidden="true">{{ orderLabel() }}</span>
                <lucide-icon class="campo-chev" [img]="ChevronIcon" [size]="15" aria-hidden="true" />
                <select aria-label="Ordenar por" (change)="sort($any($event.target).value)">
                  @for (o of orders; track o.value) {
                    <option [value]="o.value" [selected]="o.value === prefs().ordem">{{ o.label }}</option>
                  }
                </select>
              </label>
              <button type="button" class="tinta so-icone" (click)="flip()" [attr.aria-label]="directionLabel() + '. Inverter ordem'" [title]="directionLabel()">
                <lucide-icon [img]="prefs().direcao === 'desc' ? DescIcon : AscIcon" [size]="18" aria-hidden="true" />
              </button>
              <!-- a vontade antes da ordem: MUST PLAY na frente, LATER no fim (como as fixadas no topo) -->
              <button
                type="button"
                class="tinta"
                [attr.aria-pressed]="prefs().vontadePrimeiro"
                [attr.aria-label]="mustLabel() + ' na frente'"
                [title]="prefs().vontadePrimeiro ? mustLabel() + ' na frente, LATER no fim' : 'A vontade não muda a ordem'"
                (click)="toggleVontadeFirst()"
              >
                MUST 1º
              </button>
            </div>

            <div class="pasta-grupo" role="group" aria-label="Vista">
              @for (v of views; track v.value) {
                <button
                  type="button"
                  class="tinta so-icone"
                  [attr.aria-pressed]="prefs().vista === v.value"
                  [attr.aria-label]="v.label"
                  [title]="v.hint"
                  (click)="setView(v.value)"
                >
                  <lucide-icon [img]="v.icon" [size]="18" aria-hidden="true" />
                </button>
              }
            </div>

            <div class="pasta-grupo">
              <button #drawBtn type="button" class="tinta" [disabled]="visible().length < 2" (click)="draw()">
                <lucide-icon [img]="DiceIcon" [size]="18" aria-hidden="true" />
                Sortear
              </button>
            </div>
          </div>
        </div>

        <!-- depois do picote: os filtros ligados, cada um com o seu X, e o que a busca e os filtros acharam -->
        <div class="pasta-linha pasta-baixo">
          @if (chips().length) {
            <div class="pasta-filtros">
              <app-filter-tags class="atalhos" [tags]="chips()" (remove)="removeChip($event)" />
            </div>
          }
          <div class="pasta-estado">
            @if (filtering()) {
              <p class="achados" aria-live="polite">
                <span>Mostrando {{ visible().length }} de {{ pool().length }}</span>
                <button type="button" class="tinta-link" (click)="clear()">Limpar</button>
              </p>
            }
          </div>
        </div>
      </div>

      <!-- a folha dos filtros das Anotações, presa embaixo da pasta: a Vontade (uma por recorte) e as Tags -->
      @if (filterOpen()) {
        <app-filter-card
          id="cartela-desejos"
          class="cartela"
          animate.enter="desce"
          animate.leave="sobe"
          subjectTitle="Vontade"
          subjectHint="Uma por recorte: escolha uma para ver só ela."
          [units]="['recorte', 'recortes']"
          [subjects]="vontadeOptions()"
          [tags]="tagChips()"
          [shown]="visible().length"
          [total]="pool().length"
          [filtering]="filtering()"
          (subjectChosen)="chooseVontade($event)"
          (tagToggled)="toggleTag($event)"
          (tagExcluded)="excludeTag($event)"
          (cleared)="clearChoices()"
          (done)="closeFilter()"
        />
      }
      <p class="sr-only" aria-live="polite">{{ winner() ? 'Sorteado: ' + winner()!.game.name : '' }}</p>

      @if (winner(); as w) {
        <!-- o resultado do sorteio: um bilhete arrancado do bloco, preso embaixo da tela; logo depois da
           pasta, para o teclado chegar nele sem passar por todos os recortes -->
        <aside class="sorteio" aria-labelledby="sorteio-titulo">
          <p class="sorteio-titulo" id="sorteio-titulo">
            Que tal {{ mural.profile().verb }} <strong>{{ w.game.name }}</strong>?
          </p>
          <div class="sorteio-acoes">
            <button #startBtn type="button" class="btn-ink" (click)="startDrawn(w)">Começar a resenha</button>
            <button type="button" class="btn-quiet" (click)="draw()">
              <lucide-icon [img]="DiceIcon" [size]="17" aria-hidden="true" />
              Outro
            </button>
          </div>
          <button type="button" class="sorteio-fechar" (click)="closeDraw()" aria-label="Fechar o sorteio">
            <lucide-icon [img]="CloseIcon" [size]="18" aria-hidden="true" />
          </button>
        </aside>
      }

      @if (!visible().length) {
        <p class="none">{{ noneText() }}</p>
      }

      @if (prefs().vista === 'grade') {
        <!-- a Grade: muitas capas de uma vez, todas do mesmo tamanho -->
        <h2 class="sr-only">Capas</h2>
        <ul class="grade" [appRealceBusca]="filter().query" realceEm=".nome">
          @for (w of visible(); track w.id) {
            <li>
              <app-wish-cover
                [attr.data-ficha]="w.id"
                [wish]="w"
                [landing]="desk.landingId() === w.id"
                [class.sorteado]="winner()?.id === w.id"
                [class.na-sombra]="winner() && winner()?.id !== w.id"
                (opened)="drawn.set(null); desk.openWish($event)"
              />
            </li>
          }
        </ul>
      } @else {
        <h2 class="sr-only">Recortes</h2>
        <div class="recortes" [style.--colunas]="cols()" [appRealceBusca]="filter().query" realceEm=".nome-colado">
          @for (col of columns(); track $index) {
            <div class="coluna">
              @for (w of col; track w.id) {
                <!-- o recorte e, embaixo, a legenda das tags (fora do recorte: não tortas nem com a sombra dele) -->
                @let at = place(w.id);
                <div
                  class="desejo"
                  [attr.data-ficha]="w.id"
                  [style.--largura]="at.width"
                  [style.--desvio]="at.shift"
                  [style.--vao]="at.gap + 'px'"
                  [style.view-transition-name]="'desejo-pe-' + w.id"
                >
                  <app-wish-clip
                    [wish]="w"
                    [landing]="desk.landingId() === w.id"
                    [class.sorteado]="winner()?.id === w.id"
                    [class.na-sombra]="winner() && winner()?.id !== w.id"
                    (opened)="drawn.set(null); desk.openWish($event)"
                    (relevance)="setRelevance(w, $event)"
                  />
                  @if (w.tags?.length) {
                    <app-wish-tags class="tags" [class.na-sombra]="winner() && winner()?.id !== w.id" [tags]="w.tags!" [kind]="w.kind" />
                  }
                </div>
              }
            </div>
          }
        </div>
      }

    } @else {
      <!-- um cupom de catálogo, com a linha de recortar em volta -->
      <section class="vazio" aria-labelledby="desejos-vazio">
        <lucide-icon class="tesoura" [img]="CutIcon" [size]="26" aria-hidden="true" />
        <h2 id="desejos-vazio">{{ g(mural.profile(), 'Nenhum', 'Nenhuma') }} {{ mural.profile().singular }} na wishlist</h2>
        <p>
          Viu um trailer, ganhou uma indicação? Recorte aqui o que você quer {{ mural.profile().verb }}: fica só o nome e a
          capa, até a hora de resenhar.
        </p>
        <button type="button" class="btn-ink" (click)="desk.newWish()" aria-keyshortcuts="n">
          <lucide-icon [img]="CutIcon" [size]="19" aria-hidden="true" />
          Adicionar {{ g(mural.profile(), 'um', 'uma') }} {{ mural.profile().singular }}
        </button>
      </section>
    }

    <!-- o botão direito (o dedo segurado, Shift+F10) num recorte: começar a resenha, a vontade, tirar da wishlist -->
    <app-context-menu #menu [caption]="menuWish()?.game?.name ?? ''" [sections]="menuSections()" (closed)="menuOn.set(null)" />
  `,
  styles: `
    :host {
      display: block;
    }

    .pasta {
      margin-bottom: 44px;
    }
    /* a folha dos filtros, presa embaixo da pasta, com o mesmo vão até a parede */
    app-filter-card.cartela {
      margin-top: -22px;
      margin-bottom: 44px;
    }

    .none {
      font-family: var(--f-hand);
      font-size: 1.2rem;
      color: var(--wall-ink);
      overflow-wrap: anywhere;
    }

    /* ===== A colagem: colunas, cada recorte de uma largura e um tanto fora do prumo ===== */
    .recortes {
      display: grid;
      grid-template-columns: repeat(var(--colunas), minmax(0, 1fr));
      align-items: start;
      column-gap: 34px;
      padding-top: 10px;
    }
    .desejo {
      position: relative;
      width: calc(var(--largura, 100) * 1%);
      margin-left: calc(var(--desvio, 0) * 1%);
      margin-bottom: var(--vao, 40px);
    }
    .desejo:hover,
    .desejo:focus-within {
      z-index: 30;
    }
    .desejo .tags {
      margin-top: 2px;
      transition: opacity var(--t-physical) var(--ease-physical);
    }
    .tags.na-sombra {
      opacity: 0.32;
    }
    /* segurar o dedo num recorte abre o menu dele (ui/context-menu.ts): sem o balão do sistema (salvar a
       capa) nem a seleção junto */
    @supports selector(:popover-open) {
      app-wish-clip {
        -webkit-touch-callout: none;
        user-select: none;
      }
    }

    /* ===== A Grade: muitas capas de uma vez, todas do mesmo tamanho (ui/wish-cover.ts) ===== */
    .grade {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
      gap: 26px 16px;
      margin: 0;
      padding: 14px 0 0;
      list-style: none;
    }
    .grade > li {
      display: grid;
      min-width: 0;
    }
    @supports selector(:popover-open) {
      app-wish-cover {
        -webkit-touch-callout: none;
        user-select: none;
      }
    }

    /* ===== O bilhete do sorteio ===== */
    .sorteio {
      position: fixed;
      z-index: 40;
      left: 50%;
      bottom: 22px;
      isolation: isolate;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 20px;
      width: min(560px, calc(100vw - 32px));
      padding: 18px 54px 22px 22px;
      translate: -50% 0;
      rotate: -0.8deg;
      color: var(--ink);
      /* a sombra fica no bilhete; o papel e o serrilhado, num fundo à parte (a máscara comeria a sombra) */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 8px 12px rgb(0 0 0 / 0.5));
      animation: bilhete var(--t-physical) var(--ease-physical) both;
    }
    /* arrancado do bloco: a beirada de cima serrilhada */
    .sorteio::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background: var(--paper);
      -webkit-mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
      mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%;
    }
    /* com o bilhete na tela, sobra chão embaixo para ele não esconder a última fileira */
    :host(.com-sorteio) {
      padding-bottom: 150px;
    }
    .sorteio-titulo {
      flex: 1 1 220px;
      font-family: var(--f-hand);
      font-size: 1.25rem;
      line-height: 1.25;
    }
    .sorteio-titulo strong {
      font-weight: 700;
    }
    .sorteio-acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .sorteio-acoes .btn-quiet {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--ink);
    }
    .sorteio-fechar {
      position: absolute;
      top: 12px;
      right: 10px;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--ink);
    }
    .sorteio-fechar:hover {
      background: rgb(21 21 21 / 0.1);
    }
    .sorteio :focus-visible {
      outline-color: var(--ink);
    }
    @keyframes bilhete {
      0% {
        translate: -50% 30px;
        opacity: 0;
      }
    }

    /* vazio: um cupom grande, com a linha de recortar em volta */
    .vazio {
      position: relative;
      max-width: 540px;
      padding: 38px 34px 30px;
      rotate: -0.8deg;
      background: #fdfcf9;
      color: var(--ink);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 10px 12px rgb(0 0 0 / 0.45));
    }
    .vazio::before {
      content: '';
      position: absolute;
      inset: 8px;
      border: 2px dashed rgb(21 21 21 / 0.45);
      pointer-events: none;
    }
    .vazio .tesoura {
      position: absolute;
      top: -4px;
      left: 30px;
      display: inline-flex;
      padding: 0 4px;
      background: #fdfcf9;
    }
    .vazio h2 {
      font-family: var(--f-didone);
      font-size: 2rem;
      line-height: 1.02;
      color: var(--red-deep);
      text-wrap: balance;
    }
    .vazio p {
      margin: 12px 0 22px;
      max-width: 44ch;
      font-family: var(--f-hand);
      font-size: 1.15rem;
      line-height: 1.45;
    }

    @media (max-width: 559px) {
      .recortes {
        column-gap: 18px;
      }
      .grade {
        grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
        gap: 20px 12px;
      }
      .vazio {
        padding: 34px 22px 26px;
      }
      :host(.com-sorteio) {
        padding-bottom: 210px;
      }
      .sorteio {
        bottom: 12px;
        padding: 16px 48px 18px 18px;
      }
    }
  `,
})
export class WishlistPage {
  protected readonly mural = inject(Mural);
  protected readonly desk = inject(Desk);
  private readonly transitions = inject(ViewTransitions);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly toasts = inject(Toasts);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly g = g;
  protected readonly CutIcon = ICON.tesoura;
  protected readonly DiceIcon = ICON.sortear;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly FilterIcon = ICON.filtrar;
  protected readonly DescIcon = ICON.ordenarDecrescente;
  protected readonly AscIcon = ICON.ordenarCrescente;
  protected readonly orders = WISH_ORDERS;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly views: readonly { value: WishView; label: string; hint: string; icon: typeof ICON.grade }[] = [
    { value: 'recortes', label: 'Recortes', hint: 'Recortes: a colagem', icon: ICON.tesoura },
    { value: 'grade', label: 'Grade', hint: 'Grade: muitas capas de uma vez', icon: ICON.grade },
  ];

  /** A vista e a ordem, do aparelho (`meu-mural:wishlist:v1`, lido aqui e não no módulo: a limpeza do logout roda antes). */
  protected readonly prefs = signal<WishlistPrefs>(sanitizeWishlistPrefs(readJson(WISHLIST_PREFS_KEY)));
  /** A busca e os filtros: valem só nesta visita, e cada mural começa sem eles (as tags e a vontade são de um mural). */
  protected readonly filter = linkedSignal<unknown, WishFilter>({ source: () => this.mural.kind(), computation: () => NO_WISH_FILTER });
  protected readonly filterOpen = linkedSignal({ source: () => this.mural.kind(), computation: () => false });
  protected readonly orderLabel = computed(() => WISH_ORDERS.find((o) => o.value === this.prefs().ordem)!.label);
  protected readonly directionLabel = computed(() => wishDirectionLabel(this.prefs().ordem, this.prefs().direcao));
  protected readonly mustLabel = computed(() => relevanceLabel(this.mural.kind(), 'must'));
  /** O id sorteado; o bilhete some quando ele sai da lista. */
  protected readonly drawn = signal<string | null>(null);

  /** Onde se procura: a Wishlist do mural aberto. */
  protected readonly pool = computed(() => this.mural.wishes());
  protected readonly filtering = computed(() => wishFiltering(this.filter()));
  protected readonly visible = computed(() => {
    const f = this.filter();
    return sortWishes(
      this.pool().filter((w) => wishMatches(w, f)),
      this.prefs(),
    );
  });

  /** As tags, na cor de cada uma, as mais usadas primeiro (o valor é a tag sem caixa e sem acento). */
  protected readonly tagChips = computed<TagChip[]>(() => {
    const { on, out } = this.filter();
    const colors = this.settings.notesConfig().wishTagColors;
    const kind = this.mural.kind();
    const chips: TagChip[] = wishTagCounts(this.pool()).map((t) => ({ value: t.key, label: t.label, n: t.n, on: on.has(t.key), out: out.has(t.key), color: wishTagHex(colors, kind, t.label) }));
    // a ligada (ou escondida) que nenhum desejo tem mais continua à mão, senão filtraria sem ter como desligar
    for (const k of [...on, ...out]) if (!chips.some((c) => c.value === k)) chips.push({ value: k, label: k, n: 0, on: on.has(k), out: out.has(k), color: wishTagHex(colors, kind, k) });
    return chips;
  });
  protected readonly vontadeOptions = computed<SubjectOption[]>(() => wishVontadeOptions(this.pool(), this.mural.kind(), this.filter().vontade));
  protected readonly chips = computed(() => activeFilters(this.vontadeOptions(), this.tagChips()));
  /** O que dizer com a parede vazia: a busca não achou, ou os filtros esconderam tudo. */
  protected readonly noneText = computed(() => {
    const p = this.mural.profile();
    const f = this.filter();
    const nenhum = g(p, 'Nenhum', 'Nenhuma');
    if (f.query.trim() && !f.vontade && !f.on.size && !f.out.size) return `${nenhum} ${p.singular} da wishlist tem “${f.query.trim()}” no nome ou no lembrete.`;
    return `${nenhum} ${p.singular} da wishlist com esses filtros.`;
  });
  /** Onde cada recorte fica na coluna (a largura, o desvio e o vão), o mesmo sorteio do recorte. */
  protected readonly place = placeFor;

  private readonly drawBtn = viewChild<ElementRef<HTMLButtonElement>>('drawBtn');
  private readonly filterBtn = viewChild<ElementRef<HTMLButtonElement>>('filterBtn');
  private readonly card = viewChild(FilterCard);
  private readonly startBtn = viewChild<ElementRef<HTMLButtonElement>>('startBtn');
  /** Quantas colunas cabem: recortes de pelo menos 172px, com 34px entre eles (duas no celular). */
  protected readonly cols = signal(6);
  protected readonly columns = computed(() => collage(this.visible(), this.cols()));
  protected readonly winner = computed<Wish | null>(() => this.visible().find((w) => w.id === this.drawn()) ?? null);

  private readonly menu = viewChild.required<ContextMenu>('menu');
  /** O recorte com o menu aberto. */
  protected readonly menuOn = signal<string | null>(null);
  protected readonly menuWish = computed(() => this.mural.wishes().find((w) => w.id === this.menuOn()) ?? null);
  /**
   * O que o toque no recorte faz (começar a resenha); as outras vontades do adesivo (Comum é tirar o
   * adesivo); e, sozinho no fim, tirar da wishlist, com o Desfazer.
   */
  protected readonly menuSections = computed<MenuSections>(() => {
    const w = this.menuWish();
    if (!w) return [];
    const rel = relevanceOf(w);
    const stickers: MenuItem[] = RELEVANCES.filter((r) => r !== rel).map((r) =>
      r === 'comum'
        ? { id: 'comum', label: 'Tirar o adesivo', icon: ICON.adesivo, hint: 'Volta a ser Comum, sem adesivo', run: () => this.setRelevance(w, r, false) }
        : { id: r, label: `Marcar ${relevanceLabel(w.kind, r)}`, icon: ICON.adesivo, hint: 'O adesivo da quina do recorte', run: () => this.setRelevance(w, r, false) },
    );
    return [
      [{ id: 'comecar', label: 'Começar a resenha', icon: ICON.editar, dialog: true, run: () => this.startDrawn(w) }],
      stickers,
      [{ id: 'tirar', label: 'Tirar da wishlist', icon: ICON.apagar, danger: true, run: () => this.remove(w.id) }],
    ];
  });
  private readonly host: HTMLElement;

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    this.host = host;
    new ContextMenuTrigger({
      host,
      targets: '.desejo[data-ficha], app-wish-cover[data-ficha]',
      keyOf: (box) => {
        const id = box.getAttribute('data-ficha');
        return id && this.mural.wishes().some((w) => w.id === id) ? id : null;
      },
      hold: true,
      isOpenFor: (id) => this.menu().isOpenFor(id),
      open: (id, box, x, y, by) => {
        this.menuOn.set(id);
        // o foco volta para onde estava no recorte (Shift+F10 no adesivo); senão, para o recorte
        const active = document.activeElement;
        this.menu().show({ key: id, x, y, by, back: active instanceof HTMLElement && box.contains(active) ? active : box.querySelector<HTMLElement>('.hit') });
      },
    });
    const measure = () => this.cols.set(shelfColumns(host.clientWidth, 172, 34));
    // a vista e a ordem ficam no aparelho (writeJson respeita a trava da limpeza do logout)
    let saved = JSON.stringify(this.prefs());
    effect(() => {
      const now = JSON.stringify(this.prefs());
      if (now === saved) return;
      saved = now;
      writeJson(WISHLIST_PREFS_KEY, this.prefs());
    });
    // "Ver na lista" ou um item novo chegando: se a busca ou os filtros escondem ele, saem da frente
    effect(() => {
      const id = this.desk.landingId();
      if (id && this.filtering() && !this.visible().some((x) => x.id === id)) this.filter.set(NO_WISH_FILTER);
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

  /** Fecha a folha; se o foco estava nela, volta para o Filtrar. */
  protected closeFilter(): void {
    const el = document.getElementById('cartela-desejos');
    const hadFocus = !!el && el.contains(document.activeElement);
    this.filterOpen.set(false);
    if (hadFocus) this.filterBtn()?.nativeElement.focus();
  }

  protected chooseVontade(v: string | null): void {
    this.transitions.run(() => this.filter.update((f) => ({ ...f, vontade: (v as Relevance | null) || null })));
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
    removeActive(c, { subjectChosen: (v) => this.chooseVontade(v), tagToggled: (v) => this.toggleTag(v) });
  }

  /** O Limpar tudo da folha: a vontade e as tags (a busca fica). */
  protected clearChoices(): void {
    this.transitions.run(() => this.filter.update((f) => ({ ...NO_WISH_FILTER, query: f.query })));
  }

  /** O Limpar da pasta: tudo, a busca também. */
  protected clear(): void {
    this.transitions.run(() => this.filter.set(NO_WISH_FILTER));
  }

  // ===== A ordem e a vista =====

  protected sort(o: WishOrder): void {
    if (o === this.prefs().ordem) return;
    this.transitions.run(() => this.prefs.update((p) => ({ ...p, ordem: o, direcao: naturalDirection(o) })));
  }

  protected flip(): void {
    this.transitions.run(() => this.prefs.update((p) => ({ ...p, direcao: p.direcao === 'desc' ? 'asc' : 'desc' })));
  }

  protected toggleVontadeFirst(): void {
    this.transitions.run(() => this.prefs.update((p) => ({ ...p, vontadePrimeiro: !p.vontadePrimeiro })));
  }

  protected setView(v: WishView): void {
    if (v === this.prefs().vista) return;
    this.prefs.update((p) => ({ ...p, vista: v }));
  }

  /**
   * Trocou a vontade no adesivo (ou no menu): o recorte muda de lugar na colagem, e o teclado vai junto com
   * ele, no adesivo (do menu, no recorte, de onde o menu abriu).
   */
  protected setRelevance(w: Wish, r: Relevance, sticker = true): void {
    this.transitions.run(() => this.store.setRelevance(w.id, r));
    this.toasts.show(`“${w.game.name}” agora é ${r === 'comum' ? 'Comum' : relevanceLabel(w.kind, r)}`);
    setTimeout(() => {
      const box = document.querySelector(`[data-ficha="${w.id}"]`);
      const btn = (sticker ? box?.querySelector<HTMLElement>('.adesivo-btn') : null) ?? box?.querySelector<HTMLElement>('.hit');
      btn?.focus({ preventScroll: true });
      btn?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }, 140);
  }

  /** Tira da wishlist (com o Desfazer); o foco vai para o recorte vizinho, ou para o "Adicionar" da wishlist vazia. */
  private remove(id: string): void {
    if (this.drawn() === id) this.drawn.set(null);
    focusAfterRemoval(this.host, this.visible().map((w) => w.id), id, (n) => `[data-ficha="${CSS.escape(n)}"] .hit`, '.vazio .btn-ink, #busca-desejos');
    this.desk.removeWish(id);
  }

  /** Tira um recorte da parede, nunca o mesmo da vez anterior, leva a tela até ele e o foco ao bilhete. */
  protected draw(): void {
    const pool = this.visible().filter((w) => w.id !== this.drawn());
    if (!pool.length) return;
    const w = pool[Math.floor(Math.random() * pool.length)];
    this.drawn.set(w.id);
    const reduced = reducedMotion();
    requestAnimationFrame(() => {
      document.querySelector(`[data-ficha="${w.id}"]`)?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
      this.startBtn()?.nativeElement.focus({ preventScroll: true });
    });
  }

  protected closeDraw(): void {
    this.drawn.set(null);
    this.drawBtn()?.nativeElement.focus({ preventScroll: true });
  }

  /** Esc fecha o bilhete, mas não quando é para fechar um diálogo aberto por cima. */
  protected onEscape(): void {
    if (!this.winner() || document.querySelector('dialog[open]')) return;
    this.closeDraw();
  }

  protected startDrawn(w: Wish): void {
    this.drawn.set(null);
    this.desk.openWish(w.id);
  }
}
