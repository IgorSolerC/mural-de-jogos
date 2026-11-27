import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NoteFolder, siblingNamed } from '../core/folders';
import { FolderSheet } from '../ui/folder-sheet';
import type { FolderInfo } from '../core/wall-view';
import { WishFolders } from '../core/wish-folders';
import { plural } from '../core/text';
import { plainText } from '../core/rich-text';
import { FolderAsking, WISH_UNITS } from '../ui/folder-asking';
import { FolderCard } from '../ui/folder-card';
import { FolderMoveSheet } from '../ui/folder-move-sheet';
import { FolderPath } from '../ui/folder-path';
import { Pin } from '../ui/pin';
import { WallDrag, WallDragItem, WallDrop, grabOf } from './wall-drag';
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
  foundByNote,
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
import { WishActions } from '../ui/wish-actions';
import { WishNote } from '../ui/wish-note';
import { WishTags } from '../ui/wish-tags';
import { reducedMotion } from '../core/motion';
import { FOLDER_MARK, NoteSelection, copyMarkedItem, insideWords } from '../ui/note-selection';
import { SelectionTray, TrayAction } from '../ui/selection-tray';
import { foldersRemovalAsk, joinMarked, markedTops, marksLabel, moveMarked, movedText } from '../core/folder-marks';
import { notesAsText } from '../core/note-copy';
import { Choice, Confirm } from '../ui/confirm';

/** O que mora na Wishlist, no singular e no plural (as contas dos marcados). */
const WISH_WORDS = ['recorte', 'recortes'] as const;


/**
 * Wishlist: o que você quer jogar, ler ou ver, no mural aberto. Cada item é a capa recortada de uma
 * revista e colada na parede, uma colagem. Tocar num recorte começa a resenha; pregada, ela sai daqui.
 * O adesivo na quina diz quanta vontade: MUST PLAY vem na frente, LATER vai para o fim.
 * Sem saber o que escolher? O sorteio tira um da parede.
 *
 * A pasta de cima é a do mural (PLANO-WISHLIST.md, 4.1): a busca (no nome e na descrição), o Filtrar (a folha
 * das Anotações, com a Vontade e as Tags), a ordem com o inverter e o "MUST 1º", a vista (Recortes, a colagem;
 * Grade, muitas capas de uma vez) e o Sortear. A vista e a ordem ficam guardadas no aparelho.
 *
 * As pastas (PLANO-WISHLIST.md, P1 e P9) são as das Anotações: as pastas manilha antes dos recortes, o caminho
 * na pasta da barra, a aberta no endereço (`?pasta=`); arrastar um recorte até uma pasta (ou um pedaço do
 * caminho) guarda nela, e soltar um recorte no miolo de outro cria uma pasta com os dois (pages/wall-drag.ts).
 * Dentro de uma pasta, a busca e os filtros pegam ela e as de dentro.
 */
@Component({
  selector: 'app-wishlist-page',
  imports: [ContextMenu, Pin, FilterCard, FilterTags, FolderCard, FolderMoveSheet, FolderSheet, FolderPath, IconModule, SearchHighlight, SearchStrip, SelectionTray, WishActions, WishClip, WishCover, WishNote, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()', '[class.com-sorteio]': 'winner()', '[class.com-tira]': 'marking()' },
  template: `
    <!-- o nome e a contagem estão no índice embaixo do topo (ui/area-bar.ts) -->
    <h1 class="sr-only">Wishlist</h1>

    @if (mural.wishCount()) {
      <!-- a pasta, como no mural: a busca, a ordem e o sorteio em tinta e, depois do picote, o que a
           busca achou -->
      <div class="pasta solta">
        <!-- dentro de uma pasta, o caminho de volta (o mesmo das Anotações) -->
        @if (folderPath().length) {
          <app-folder-path group="Wishlist" [path]="folderPath()" (go)="enterFolder($event)" />
        }
        <div class="pasta-linha">
          <app-search-strip
            class="pasta-busca"
            inputId="busca-desejos"
            [glued]="true"
            [label]="searchWhere()"
            [placeholder]="searchWhere() + '…'"
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
                  [attr.aria-pressed]="shownView() === v.value"
                  [attr.aria-label]="v.label"
                  [title]="v.hint"
                  (click)="setView(v.value)"
                >
                  <lucide-icon [img]="v.icon" [size]="18" aria-hidden="true" />
                </button>
              }
            </div>

            <!-- marcar vários para mover, copiar ou tirar juntos (no toque, o jeito de marcar sem o Ctrl) -->
            <div class="pasta-grupo">
              <button
                type="button"
                class="tinta"
                [attr.aria-pressed]="marking()"
                (click)="toggleMarking()"
                aria-label="Marcar recortes"
                title="Marcar recortes e pastas para mover, copiar ou tirar juntos (ou Ctrl+clique e Shift+clique neles)"
              >
                <lucide-icon [img]="MarkIcon" [size]="18" aria-hidden="true" />
                <span aria-hidden="true">Marcar</span>
              </button>
            </div>

            <div class="pasta-grupo">
              <button #drawBtn type="button" class="tinta" [disabled]="drawPool().length < 2" (click)="draw()">
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
                <!-- procurando dentro de uma pasta: ela e as de dentro -->
                @if (folderPath().at(-1); as f) {
                  <span>em {{ f.name }} e nas pastas de dentro</span>
                  <button type="button" class="tinta-link" (click)="enterFolder(null)">Procurar em toda a Wishlist</button>
                }
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
      <p class="sr-only" aria-live="polite">{{ folderSaid() }}</p>

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

      @if (folderKids().length) {
        <!-- as pastas da aberta (ou da raiz), antes dos recortes: as mesmas das Anotações -->
        <section class="pastas" aria-label="Pastas">
          <ul class="pastas-lista">
            @for (f of folderKids(); track f.id) {
              <li>
                <app-folder-card
                  [folder]="f"
                  [info]="folderInfo().get(f.id) ?? { notes: 0, folders: 0, peek: [] }"
                  [units]="['recorte', 'recortes']"
                  [naming]="naming() === f.id"
                  [clash]="naming() === f.id ? clash() : null"
                  (opened)="enterFolder($event)"
                  (draft)="drafted(f, $event)"
                  (named)="named(f, $event)"
                />
              </li>
            }
          </ul>
        </section>
      }

      @if (filtering() && !visible().length) {
        <!-- a busca e os filtros não acharam nada: o cartão das Anotações -->
        <section class="no-results cartolina" aria-live="polite">
          <app-pin class="pin" color="#f4f4f0" />
          <h2>{{ openFolder() ? 'Nada nesta pasta com esse filtro' : 'Nada na wishlist com esse filtro' }}</h2>
          <p>{{ noneText() }}</p>
          <div class="acoes-vazio">
            <button type="button" class="btn-quiet" (click)="clear()">Limpar a busca e os filtros</button>
          </div>
        </section>
      } @else if (folderEmpty()) {
        <!-- a pasta aberta não tem nada: o cartão da pasta vazia das Anotações -->
        <section class="no-results cartolina pasta-vazia" aria-live="polite">
          <app-pin class="pin" color="#f4f4f0" />
          <h2>{{ folderPath().at(-1)?.name }} está vazia</h2>
          <p>Nenhum recorte nesta pasta ainda. O que você recortar aqui já nasce nela, e dá para arrastar um até o nome dela no caminho.</p>
          <div class="acoes-vazio">
            <button type="button" class="btn-ink" (click)="desk.newWish()">
              <lucide-icon [img]="CutIcon" [size]="19" aria-hidden="true" />
              Adicionar {{ g(mural.profile(), 'um', 'uma') }} {{ mural.profile().singular }}
            </button>
          </div>
        </section>
      }

      @if (shownView() === 'grade') {
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
                [editable]="editable"
                [query]="filter().query"
                [noteOpen]="byNote().has(w.id)"
                (opened)="drawn.set(null); desk.openWish($event)"
                (edit)="edit(w)"
                (vontade)="openVontade(w, $event)"
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
                  @if (w.note) {
                    <!-- tem descrição: a ponta da folha do caderno aparece atrás do recorte (é de onde ela sai) -->
                    <span class="ponta" aria-hidden="true"></span>
                  }
                  <app-wish-clip
                    [wish]="w"
                    [landing]="desk.landingId() === w.id"
                    [class.sorteado]="winner()?.id === w.id"
                    [class.na-sombra]="winner() && winner()?.id !== w.id"
                    [describedBy]="w.note ? 'descricao-' + w.id : null"
                    (opened)="drawn.set(null); desk.openWish($event)"
                  />
                  <div class="pe" [class.na-sombra]="winner() && winner()?.id !== w.id">
                    @if (w.tags?.length) {
                      <app-wish-tags class="tags" [tags]="w.tags!" [kind]="w.kind" />
                    }
                    <app-wish-actions class="etiqueta" [wish]="w" [editable]="editable" (edit)="edit(w)" (vontade)="openVontade(w, $event)" />
                  </div>
                  @if (w.note; as n) {
                    <app-wish-note [wishId]="w.id" [text]="n" [query]="filter().query" [open]="byNote().has(w.id)" />
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

    <!-- marcando: a tira no pé da tela, com o que fazer com os marcados (PLANO-MARCAR-PASTAS.md, rodada 5) -->
    @if (marking()) {
      <app-selection-tray
        [count]="selection.count()"
        [folders]="selection.folders().length"
        [units]="['recorte', 'recortes']"
        [hidden]="hiddenMarked()"
        [hint]="folderKids().length ? 'Toque nos recortes e nas pastas para marcar; dois toques abrem a pasta' : 'Toque nos recortes para marcar'"
        label="Recortes marcados"
        [words]="['marcado', 'marcados']"
        [actions]="trayActions()"
        (clear)="selection.clear()"
        (done)="selection.done()"
      />
    }

    <!-- o menu do site: o do recorte (o botão direito, o dedo segurado, Shift+F10: começar a resenha, as
         vontades, tirar da wishlist) e o do Vontade da etiqueta (só as vontades, com os adesivos) -->
    <app-context-menu #menu [caption]="menuWish()?.game?.name ?? ''" [note]="menuNote()" [sections]="menuSections()" (closed)="menuOn.set(null)" />
    <!-- o menu de uma pasta da parede, ou do vão dela -->
    <app-context-menu #menuDaPasta [caption]="folderMenu().caption" [sections]="folderMenu().sections" />

    <!-- mover sem arrastar: a folha com a árvore da Wishlist do mural -->
    @if (moveSheet(); as m) {
      <!-- o Customizar… de uma pasta (PLANO-PASTAS-CUSTOMIZADAS.md, 4) -->
      <app-folder-sheet />

      <app-folder-move-sheet
        [title]="m.title"
        [sub]="m.sub"
        [tree]="folderTree()"
        [group]="group()"
        groupName="Wishlist"
        [counts]="m.counts"
        [blocked]="m.blocked"
        [rootLabel]="m.rootLabel"
        [start]="m.start"
        [units]="['recorte', 'recortes']"
        (chosen)="moveTo($event)"
        (create)="moveToNew($event)"
        (closed)="moving.set(null)"
      />
    }
  `,
  styles: `
    @use '../ui/pastas-parede' as pastas;
    @use '../ui/arrasto';
    @use '../ui/caderno';
    @use '../ui/sem-resultados' as sem;
    @use '../ui/marcada' as marca;

    :host {
      display: block;
    }

    /* ===== Marcado (ui/note-selection.ts): o tracejado de giz e o adesivo com a ordem, os das pixel arts ===== */
    .desejo[data-marcada] > app-wish-clip,
    app-wish-cover[data-marcada] {
      @include marca.marcada($inset: -9px, $raio: 6px, $topo: -18px, $direita: -16px);
    }
    /* marcando, o toque marca: a etiqueta de hover sairia por cima do adesivo com o número */
    .desejo[data-marcada] app-wish-actions,
    app-wish-cover[data-marcada] ::ng-deep app-wish-actions {
      display: none;
    }
    /* com a tira no pé, sobra chão embaixo para ela não esconder a última fileira */
    :host(.com-tira) {
      padding-bottom: 150px;
    }

    /* ===== As pastas (as das Anotações) e o arrastar (pages/wall-drag.ts) ===== */
    @include pastas.na-parede;
    @include arrasto.fantasma;
    .desejo[data-arrastada],
    app-wish-cover[data-arrastada] {
      opacity: 0.35;
    }
    /* o recorte alvo (soltar ali cria a pasta com os dois): o tracejado do marca-texto em volta do papel */
    .desejo[data-alvo] > app-wish-clip,
    app-wish-cover[data-alvo] {
      outline: 2.5px dashed var(--hi);
      outline-offset: 6px;
    }
    /* o vão da pasta aberta (soltar ali guarda nela): o mesmo tracejado, em volta da parede */
    .recortes[data-alvo],
    .grade[data-alvo],
    .pastas[data-alvo],
    .no-results[data-alvo] {
      outline: 2.5px dashed var(--hi);
      outline-offset: 10px;
      border-radius: 4px;
    }
    /* a parede ocupa a tela embaixo da barra: o vão dela é alvo de soltar, e o botão direito nele abre o menu */
    .recortes,
    .grade {
      min-height: 40vh;
      align-content: start;
    }

    .pasta {
      margin-bottom: 44px;
    }
    /* a folha dos filtros, presa embaixo da pasta, com o mesmo vão até a parede */
    app-filter-card.cartela {
      margin-top: -22px;
      margin-bottom: 44px;
    }

    /* o cartão de quando não há nada à mostra: o das Anotações (ui/_sem-resultados.scss) */
    @include sem.cartao;
    .acoes-vazio {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px 18px;
    }
    .pasta-vazia h2 {
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
    /* a ponta da folha da descrição mora atrás do recorte: o recorte é o contexto dela (e a folha aberta pela
       busca fica por cima dos vizinhos) */
    .desejo {
      isolation: isolate;
    }
    .desejo:has(app-wish-note.aberta) {
      z-index: 20;
    }
    .ponta {
      @include caderno.ponta;
      top: 30%;
      right: -12px;
      rotate: 8deg;
    }
    /* a folha grande abriu: a ponta some (a mesma espera da folha com a mão; na hora com o teclado e a busca) */
    @media (hover: hover) {
      .desejo:hover > .ponta {
        opacity: 0;
        transition-delay: 300ms;
      }
    }
    .desejo:has(.hit:focus-visible) > .ponta,
    .desejo:has(app-wish-note.aberta) > .ponta {
      opacity: 0;
    }
    /* embaixo do recorte: as tags e, sem mouse, a etiqueta */
    .pe {
      display: flex;
      align-items: flex-start;
      gap: 6px 10px;
      margin-top: 2px;
      transition: opacity var(--t-physical) var(--ease-physical);
    }
    .pe.na-sombra {
      opacity: 0.32;
    }
    .pe .tags {
      flex: 1;
      min-width: 0;
    }
    /* a etiqueta: com o mouse, inteira acima do papel (a manchete fica à vista); sem mouse, no pé */
    .etiqueta {
      position: absolute;
      z-index: 6;
      top: -16px;
      right: 6px;
    }
    @media (hover: none) {
      /* as tags ao lado da etiqueta quando cabem; senão, a etiqueta desce, à direita */
      .pe {
        flex-wrap: wrap;
      }
      .pe .tags {
        flex: 1 1 8em;
      }
      .etiqueta {
        position: static;
        flex: none;
        margin-left: auto;
      }
    }
    /* a descrição: um instante depois da mão parar em cima, na hora com o teclado; some na hora */
    app-wish-note {
      opacity: 0;
      transition:
        opacity var(--t-ui) var(--ease-ui),
        translate var(--t-ui) var(--ease-ui);
    }
    @media (hover: hover) {
      .desejo:hover > app-wish-note {
        opacity: 1;
        translate: 0 0;
        transition-delay: 300ms;
      }
    }
    .desejo:has(.hit:focus-visible) > app-wish-note,
    app-wish-note.aberta {
      opacity: 1;
      translate: 0 0;
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
  protected readonly MarkIcon = ICON.marcado;
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

  // ===== As pastas =====
  private readonly folders = inject(WishFolders);
  private readonly asking = inject(FolderAsking);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly folderTree = this.folders.tree;
  /** O grupo das pastas da Wishlist do mural aberto. */
  protected readonly group = computed(() => this.folders.group(this.mural.kind()));
  /** A pasta pedida no endereço (`?pasta=`). */
  private readonly asked = signal<string | null>(null);
  /** A pasta aberta: a pedida, se é da Wishlist deste mural (a desfeita vale pela de cima); null: a raiz. */
  protected readonly openFolder = computed(() => this.folderTree().resolve(this.asked(), this.group()));
  protected readonly folderPath = computed(() => this.folderTree().path(this.openFolder()));
  /** A pasta de verdade de cada desejo (as mudanças de pasta mudam a árvore, e ela refaz tudo). */
  private readonly folderOf = computed(() => {
    const tree = this.folderTree();
    const group = this.group();
    return new Map(this.mural.wishes().map((w) => [w.id, tree.resolve(w.folder, group)]));
  });
  private whereIs(id: string): string | null {
    return this.folderOf().get(id) ?? null;
  }

  /** Onde se procura: a Wishlist do mural aberto, ou a pasta aberta e as de dentro. */
  protected readonly pool = computed(() => {
    const open = this.openFolder();
    const all = this.mural.wishes();
    if (!open) return all;
    const below = this.folderTree().below(open);
    return all.filter((w) => below.has(this.whereIs(w.id) ?? ''));
  });
  protected readonly filtering = computed(() => wishFiltering(this.filter()));
  /** Sem procurar, só os direto na pasta aberta (as de dentro moram nas pastas); procurando, ela e as de dentro. */
  protected readonly visible = computed(() => {
    const f = this.filter();
    const open = this.openFolder();
    const base = this.filtering() ? this.pool() : this.pool().filter((w) => this.whereIs(w.id) === open);
    return sortWishes(
      base.filter((w) => wishMatches(w, f)),
      this.prefs(),
    );
  });
  /** As pastas na parede: as de dentro da aberta, sem procurar. */
  protected readonly folderKids = computed<readonly NoteFolder[]>(() => (this.filtering() ? [] : this.folderTree().kids(this.group(), this.openFolder())));
  /**
   * O que cada pasta mostra: quantos recortes tem (com os das de dentro), quantas pastas logo dentro, e até três
   * capas espiando, na ordem da parede (MUST PLAY primeiro), as direto nela antes das de dentro.
   */
  protected readonly folderInfo = computed<ReadonlyMap<string, FolderInfo>>(() => {
    const kids = this.folderKids();
    if (!kids.length) return new Map();
    const tree = this.folderTree();
    const kidIds = new Set(kids.map((f) => f.id));
    const acc = new Map(kids.map((f) => [f.id, { n: 0, direct: [] as Wish[], deep: [] as Wish[] }]));
    // uma passada pela Wishlist na ordem da parede: cada desejo conta na pasta da parede que está no caminho dele
    for (const w of sortWishes(this.mural.wishes(), this.prefs())) {
      const at = this.whereIs(w.id);
      const kid = tree.path(at).find((f) => kidIds.has(f.id));
      if (!kid) continue;
      const a = acc.get(kid.id)!;
      a.n++;
      if (w.game.coverUrl && a.direct.length + a.deep.length < 6) (at === kid.id ? a.direct : a.deep).push(w);
    }
    const out = new Map<string, FolderInfo>();
    for (const f of kids) {
      const a = acc.get(f.id)!;
      out.set(f.id, { notes: a.n, folders: tree.kids(f.group, f.id).length, peek: [...a.direct, ...a.deep].slice(0, 3) });
    }
    return out;
  });
  /** A pasta aberta não tem nada: nem recorte, nem pasta. */
  protected readonly folderEmpty = computed(() => this.openFolder() !== null && !this.filtering() && !this.visible().length && !this.folderKids().length);
  /** Onde a busca procura: a Wishlist, ou a pasta aberta (e as de dentro). */
  protected readonly searchWhere = computed(() => {
    const f = this.folderPath().at(-1);
    return f ? `Procurar em ${f.name}` : 'Procurar na wishlist';
  });
  /** O que o leitor de tela ouve depois de trocar de pasta: "Pasta Co-op, 4 recortes e 1 pasta". */
  protected readonly folderSaid = signal('');

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
    if (f.query.trim() && !f.vontade && !f.on.size && !f.out.size) return `${nenhum} ${p.singular} da wishlist tem “${f.query.trim()}” no nome ou na descrição.`;
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
  /** O desejo com o menu aberto, e qual menu: o do recorte (o botão direito) ou o do Vontade da etiqueta. */
  protected readonly menuOn = signal<{ id: string; only: 'tudo' | 'vontade' } | null>(null);
  protected readonly menuWish = computed(() => this.mural.wishes().find((w) => w.id === this.menuOn()?.id) ?? null);
  /** No alto do menu do dedo: o começo da descrição, sem as marcas do texto. */
  protected readonly menuNote = computed(() => {
    const plain = plainText(this.menuWish()?.note ?? '').replace(/\s+/g, ' ').trim();
    return plain.length > 180 ? plain.slice(0, 179).trimEnd() + '…' : plain;
  });
  /** O que fica no menu de um recorte sobre a pasta dele: mover para outra e, dentro de uma, tirar dela. */
  private folderItems(w: Wish): MenuItem[] {
    const items: MenuItem[] = [
      {
        id: 'mover-pasta',
        label: 'Mover para pasta…',
        icon: ICON.guardarNaPasta,
        dialog: true,
        run: () => this.moving.set({ kind: 'desejos', ids: [w.id], name: w.game.name, from: this.whereIs(w.id) }),
      },
    ];
    const open = this.openFolder();
    if (open !== null && this.whereIs(w.id) === open) {
      const up = this.folderTree().parentOf(open);
      items.push({ id: 'tirar-pasta', label: 'Tirar da pasta', icon: ICON.tirarDaPasta, hint: `Vai para ${this.goesTo(up)}`, run: () => this.dropped({ kind: 'notas', lead: w.id, ids: [w.id] }, { kind: 'guardar', folder: up }) });
    }
    return items;
  }

  /** O Editar da etiqueta e do menu: a folha do desejo (a Wishlist é só do dono: nunca na visita). */
  protected readonly editable = true;
  /**
   * As três vontades, com o adesivo de verdade em miniatura (Comum, que não tem, fica com o desenho do
   * vazio) e o tique na de agora; escolher a de agora não faz nada.
   */
  private vontadeItems(w: Wish, fromButton = false): MenuItem[] {
    const hints: Record<Relevance, string> = { must: 'O adesivo vermelho: vem na frente', comum: 'Sem adesivo', later: 'O selo azul: vai para o fim' };
    return RELEVANCES.map((r) => ({
      id: r,
      label: r === 'comum' ? 'Comum' : relevanceLabel(w.kind, r),
      icon: r === 'comum' ? ICON.semNada : ICON.adesivo,
      ...(r === 'comum' ? {} : { sticker: { relevance: r, kind: w.kind } }),
      on: relevanceOf(w) === r,
      hint: hints[r],
      run: () => this.setRelevance(w, r, fromButton),
    }));
  }
  /**
   * O do recorte: o que o toque faz (começar a resenha) e o Editar, as vontades e, sozinho no fim, tirar da
   * wishlist, com o Desfazer. O do Vontade: só as vontades.
   */
  protected readonly menuSections = computed<MenuSections>(() => {
    const w = this.menuWish();
    if (!w) return [];
    if (this.menuOn()?.only === 'vontade') return [this.vontadeItems(w, true)];
    const on = this.selection.has(w.id);
    const many = this.marking() && on && this.selection.count() > 1;
    return [
      ...this.markedItems(w.id, false),
      [
        { id: 'comecar', label: 'Começar a resenha', icon: ICON.editar, dialog: true, run: () => this.startDrawn(w) },
        { id: 'editar', label: 'Editar', icon: ICON.ajustar, dialog: true, run: () => this.edit(w) },
        // marcar vários (no toque, o jeito de marcar sem o Ctrl)
        { id: 'marcar', label: on ? 'Desmarcar' : 'Marcar', icon: on ? ICON.desmarcado : ICON.marcado, hint: on ? undefined : 'Para mover, copiar ou tirar vários juntos', run: () => this.selection.toggle(w.id) },
      ],
      // marcado com outros: a vontade vale para todos os marcados (e os de dentro das pastas marcadas)
      many ? this.vontadeItems(w).map((x) => ({ ...x, on: false, hint: `Para os ${this.selection.copied().items.length} marcados`, run: () => this.setRelevanceMany(this.selection.copied().items, x.id as Relevance) })) : this.vontadeItems(w),
      this.folderItems(w),
      [many ? { id: 'tirar', label: `Tirar os ${this.selection.count()} marcados`, icon: ICON.apagar, danger: true, run: () => void this.removeMarked() } : { id: 'tirar', label: 'Tirar da wishlist', icon: ICON.apagar, danger: true, run: () => this.remove(w.id) }],
    ];
  });
  /** Os desejos que a busca achou só pela descrição: a folha do caderno fica aberta neles. */
  protected readonly byNote = computed(() => {
    const q = this.filter().query;
    return new Set(q.trim() ? this.visible().filter((w) => foundByNote(w, q)).map((w) => w.id) : []);
  });
  private readonly host: HTMLElement;

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    this.host = host;
    // marcar vários (PLANO-MARCAR-PASTAS.md, rodada 5): a peça das Anotações e das pixel arts, com os recortes e as pastas
    this.selection = new NoteSelection<Wish>({
      host,
      markable: '.desejo[data-ficha], app-wish-cover[data-ficha]',
      idOf: (el) => el.getAttribute('data-ficha'),
      on: () => true,
      notes: () => this.wishById(),
      // outro mural: os marcados eram de outra Wishlist
      reset: () => this.mural.kind(),
      layout: () => [this.visible(), this.shownView(), this.folderKids()],
      drags: true,
      mode: this.marking,
      folders: {
        markable: 'app-folder-card[data-pasta]',
        idOf: (el) => el.getAttribute('data-pasta'),
        live: this.liveFolders,
        open: (id) => this.enterFolder(id),
        inside: (id) => this.inside(id).map((w) => w.id),
      },
      // o Ctrl+C: o nome e a descrição de cada um, como as anotações
      copy: (items, inside) => ({
        text: notesAsText(items.map((w) => ({ game: w.game, text: w.note ?? '' }))),
        done: `${items.length === 1 ? 'Copiei o recorte' : `Copiei os ${items.length} recortes`}${insideWords(inside, items.length, this.selection.folders().length)}.`,
      }),
    });
    const wishTrigger = new ContextMenuTrigger({
      host,
      targets: '.desejo[data-ficha], app-wish-cover[data-ficha]',
      keyOf: (box) => {
        const id = box.getAttribute('data-ficha');
        return id && this.mural.wishes().some((w) => w.id === id) ? id : null;
      },
      // o dedo segurado e solto sem arrastar abre o menu pelo arrasto (o mesmo gesto)
      hold: () => !this.dragOn(),
      isOpenFor: (id) => this.menu().isOpenFor(id),
      open: (id, box, x, y, by) => {
        this.menuOn.set({ id, only: 'tudo' });
        // o foco volta para onde estava no recorte (Shift+F10 no adesivo); senão, para o recorte
        const active = document.activeElement;
        this.menu().show({ key: id, x, y, by, back: active instanceof HTMLElement && box.contains(active) ? active : box.querySelector<HTMLElement>('.hit') });
      },
    });
    // o botão direito numa pasta da parede, ou no nada: tudo abaixo da busca que não tem menu próprio (os vãos da
    // parede, as margens, o fim da página, o cartaz de vazio)
    const folderTrigger = new ContextMenuTrigger({
      host,
      targets: 'app-folder-card[data-pasta]',
      ignore: '.desejo, app-wish-cover, input',
      blank: 'busca-desejos',
      keyOf: (box) => (box.matches('app-folder-card') ? `pasta:${box.dataset['pasta']}` : 'vao'),
      hold: (box) => !box.matches('app-folder-card') || !this.dragOn(),
      isOpenFor: (key) => !!this.folderMenuRef()?.isOpenFor(key),
      open: (key, box, x, y, by) => {
        const f = key.startsWith('pasta:') ? this.folderTree().live(key.slice(6)) : undefined;
        if (key !== 'vao' && !f) return;
        this.folderMenu.set(f ? { caption: `Pasta ${f.name}`, sections: this.folderSections(f) } : { caption: this.folderName(this.openFolder()), sections: this.gapSections() });
        this.folderMenuRef()?.show({ key, x, y, back: box.matches('app-folder-card') ? box.querySelector<HTMLElement>('button') : null, by });
      },
    });
    // arrastar organiza: recorte numa pasta guarda, recorte no miolo de outro cria uma pasta com os dois
    const drag = new WallDrag({
      host,
      on: () => this.dragOn(),
      marked: () => this.selection.ids(),
      markedFolders: () => this.selection.folders(),
      openFolder: () => this.openFolder(),
      groupName: () => 'Wishlist',
      folderName: (id) => this.folderTree().live(id)?.name ?? null,
      folderOf: (id) => this.whereIs(id),
      below: (id) => this.folderTree().below(id),
      parentOf: (id) => this.folderTree().parentOf(id),
      drop: (item, to) => this.dropped(item, to),
      open: (id) => this.enterFolder(id),
      menu: (item, box, x, y) => {
        const grab = grabOf(item);
        if (grab.kind === 'pasta') folderTrigger.openAt(`pasta:${grab.id}`, x, y, box);
        else wishTrigger.openAt(grab.id, x, y, box);
      },
      scope: () => host.querySelector('.recortes, .grade, .pastas'),
      gap: '.recortes, .grade, .pastas, .no-results',
      pieces: {
        selector: '.desejo[data-ficha], app-wish-cover[data-ficha]',
        idOf: (el) => el.getAttribute('data-ficha'),
        // só o papel do recorte (sem as tags e o lembrete de baixo); a capa da Grade inteira
        face: (el) => (el.matches('app-wish-cover') ? el : (el.querySelector<HTMLElement>('app-wish-clip') ?? el)),
        joinLabel: (n) => (n === 1 ? 'Nova pasta com os dois' : `Nova pasta com os ${n + 1}`),
        units: WISH_WORDS,
        core: 0.6,
      },
    });
    this.destroyRef.onDestroy(() => drag.off());
    // marcar fecha o sorteio: o bilhete e a tira moram no mesmo pé da tela
    effect(() => {
      if (this.marking()) untracked(() => this.drawn.set(null));
    });
    // a pasta aberta mora no endereço (o Voltar do navegador sobe), e o "Pôr na wishlist" nasce nela
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => this.asked.set(q.get('pasta')));
    effect(() => {
      const open = { kind: this.mural.kind(), id: this.openFolder() };
      untracked(() => this.folders.open.set(open));
    });
    this.destroyRef.onDestroy(() => this.folders.open.set(null));
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
      if (!id || this.visible().some((x) => x.id === id) || !this.mural.wishes().some((w) => w.id === id)) return;
      untracked(() => {
        if (this.filtering()) this.filter.set(NO_WISH_FILTER);
        const where = this.whereIs(id);
        if (where !== this.openFolder()) this.enterFolder(where, false);
      });
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

  /**
   * A vista trocada na régua dentro de uma pasta que tem a dela (PLANO-PASTAS-CUSTOMIZADAS.md, 5): vale enquanto a
   * pasta fica aberta e não é guardada.
   */
  private readonly passingView = signal<{ folder: string; vista: WishView } | null>(null);
  /** A vista da pasta aberta (Customizar…), ou a trocada nela; fora (ou na pasta sem vista), a do aparelho. */
  protected readonly shownView = computed<WishView>(() => {
    const open = this.openFolder();
    const own = open ? this.folderTree().live(open)?.look?.view : undefined;
    if (open && (own === 'recortes' || own === 'grade')) {
      const p = this.passingView();
      return p && p.folder === open ? p.vista : own;
    }
    return this.prefs().vista;
  });

  protected setView(v: WishView): void {
    if (v === this.shownView()) return;
    const open = this.openFolder();
    // na pasta com a vista dela, a trocada vale só enquanto ela está aberta
    if (open && this.folderTree().live(open)?.look?.view) this.passingView.set({ folder: open, vista: v });
    else this.prefs.update((p) => ({ ...p, vista: v }));
  }

  /** O Vontade da etiqueta: o menu com as três vontades, embaixo do botão. */
  protected openVontade(w: Wish, at: { el: HTMLElement; keyboard: boolean }): void {
    const r = at.el.getBoundingClientRect();
    this.menuOn.set({ id: w.id, only: 'vontade' });
    this.menu().show({ key: 'v:' + w.id, x: r.left, y: r.bottom + 6, back: at.el, by: at.keyboard ? 'teclado' : 'mouse' });
  }

  /**
   * Trocou a vontade (pelo Vontade ou pelo menu do recorte): o recorte muda de lugar na colagem, com a
   * transição, e o teclado vai junto com ele (no Vontade, de onde o menu abriu, ou no recorte); se ele saiu
   * da tela, a tela vai até ele. O aviso tem o Desfazer.
   */
  protected setRelevance(w: Wish, r: Relevance, fromButton = false): void {
    const before = relevanceOf(w);
    if (r === before) return;
    this.transitions.run(() => this.store.setRelevance(w.id, r));
    this.toasts.show(`“${w.game.name}” agora é ${r === 'comum' ? 'Comum' : relevanceLabel(w.kind, r)}`, {
      label: 'Desfazer',
      run: () => this.transitions.run(() => this.store.setRelevance(w.id, before)),
    });
    this.follow(w.id, fromButton ? 'app-wish-actions .vontade' : null);
  }

  /**
   * O teclado vai junto com o recorte que mudou de lugar (no botão `at` dele, ou no recorte), depois que a
   * transição assenta; se ele saiu da tela, a tela vai até ele.
   */
  private follow(id: string, at: string | null): void {
    setTimeout(() => {
      const box = document.querySelector(`[data-ficha="${CSS.escape(id)}"]`);
      const btn = (at ? box?.querySelector<HTMLElement>(at) : null) ?? box?.querySelector<HTMLElement>('.hit');
      btn?.focus({ preventScroll: true });
      btn?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }, 140);
  }

  /** O "Editar recorte": a folha do desejo; tirar por ela leva o foco ao vizinho, como o menu. */
  protected edit(w: Wish): void {
    this.desk.editWish(w.id, { remove: () => this.remove(w.id), saved: () => this.follow(w.id, 'app-wish-actions .editar') });
  }

  /** Tira da wishlist (com o Desfazer); o foco vai para o recorte vizinho, ou para o "Adicionar" da wishlist vazia. */
  private remove(id: string): void {
    if (this.drawn() === id) this.drawn.set(null);
    focusAfterRemoval(this.host, this.visible().map((w) => w.id), id, (n) => `[data-ficha="${CSS.escape(n)}"] .hit`, '.vazio .btn-ink, #busca-desejos');
    this.desk.removeWish(id);
  }

  /** Tira um recorte da parede, nunca o mesmo da vez anterior, leva a tela até ele e o foco ao bilhete. */
  /** Onde o sorteio tira: o que a busca achou ou, sem procurar, a pasta aberta e as de dentro (a Wishlist inteira na raiz). */
  protected readonly drawPool = computed(() => (this.filtering() ? this.visible() : this.pool()));

  protected draw(): void {
    // (o bilhete e a tira moram no mesmo pé da tela: sortear sai de marcar)
    if (this.marking()) this.selection.done();
    const pool = this.drawPool().filter((w) => w.id !== this.drawn());
    if (!pool.length) return;
    const w = pool[Math.floor(Math.random() * pool.length)];
    // o sorteado mora numa pasta de dentro: ela abre (o Voltar do navegador volta para cá)
    const where = this.whereIs(w.id);
    if (!this.filtering() && where !== this.openFolder()) this.enterFolder(where, true, false);
    this.drawn.set(w.id);
    const reduced = reducedMotion();
    // depois de a parede (talvez a de outra pasta) e o bilhete desenharem
    afterNextRender(
      () => {
        this.host.querySelector(`[data-ficha="${CSS.escape(w.id)}"]`)?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        this.startBtn()?.nativeElement.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
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

  // ===== As pastas: entrar, arrastar, dar nome, os menus, mover sem arrastar =====

  /** Arrastar organiza (fora do nome sendo escrito numa pasta). */
  protected readonly dragOn = computed(() => !this.naming());
  /** A pasta sendo nomeada (a nova, ou Renomear), e a irmã com o nome que está escrito. */
  protected readonly naming = signal<string | null>(null);
  protected readonly clash = signal<string | null>(null);
  protected readonly folderMenu = signal<{ caption: string; sections: MenuSections }>({ caption: '', sections: [] });
  private readonly folderMenuRef = viewChild<ContextMenu>('menuDaPasta');

  /** O nome de uma pasta (null: a Wishlist). */
  private folderName(id: string | null): string {
    return id ? (this.folderTree().live(id)?.name ?? '') : 'Wishlist';
  }

  /** Para onde vai: "Indies", ou "a Wishlist". */
  private goesTo(id: string | null): string {
    return id ? this.folderName(id) : 'a Wishlist';
  }

  /**
   * Abre a pasta (null: a raiz da Wishlist). `push`: veio de um toque (o Voltar do navegador volta para cá). O
   * foco vai para onde se está no caminho; subindo, para a pasta de onde se veio.
   */
  protected enterFolder(id: string | null, push = true, focus = push): void {
    const from = this.openFolder();
    if (id === from) return;
    this.drawn.set(null);
    this.naming.set(null);
    this.asked.set(id);
    // já, sem esperar o efeito: o "Adicionar aqui" do menu da pasta abre a folha logo em seguida
    this.folders.open.set({ kind: this.mural.kind(), id });
    void this.router.navigate([], { relativeTo: this.route, queryParams: { pasta: id }, queryParamsHandling: 'merge', replaceUrl: !push });
    if (!focus) return;
    const info = id ? this.folderTree().live(id) : null;
    const n = this.visible().length;
    const k = this.folderKids().length;
    const what = [n ? plural(n, 'recorte', 'recortes') : '', k ? plural(k, 'pasta', 'pastas') : ''].filter(Boolean).join(' e ') || 'vazia';
    this.folderSaid.set(`${info ? `Pasta ${info.name}` : 'Wishlist'}, ${what}`);
    afterNextRender(
      () => {
        const back = from && this.folderTree().parentOf(from) === id ? this.host.querySelector<HTMLElement>(`app-folder-card[data-pasta="${CSS.escape(from)}"] button`) : null;
        const here = back ?? this.host.querySelector<HTMLElement>('app-folder-path .aqui') ?? this.host.querySelector<HTMLElement>('#busca-desejos');
        here?.focus({ preventScroll: !!back });
      },
      { injector: this.injector },
    );
  }

  private undoToast(text: string, undo: () => void): void {
    this.toasts.show(text, { label: 'Desfazer', run: () => this.transitions.run(undo) });
  }

  /**
   * Soltou arrastando (ou escolheu no menu): guarda os recortes, junta numa pasta nova ou põe uma pasta dentro
   * de outra, com o Desfazer. A colagem muda com a transição, e o aviso sai de dentro dela (ela muda no quadro
   * seguinte: o que a mudança devolve só existe lá dentro).
   */
  private dropped(item: WallDragItem, to: WallDrop): void {
    const kind = this.mural.kind();
    if (item.kind === 'varios') {
      // os marcados com pastas no meio (PLANO-MARCAR-PASTAS.md, D6)
      this.transitions.run(() => {
        if (to.kind === 'juntar') {
          const made = joinMarked((ids) => this.folders.gather(ids, kind, this.openFolder()), this.folders, [...item.ids, to.with], item.folders);
          if (!made) {
            this.toasts.show('Não cabe mais nenhuma pasta aqui.');
            return;
          }
          this.selection.done();
          this.naming.set(made.folder.id);
          this.undoToast(`Nova pasta com ${marksLabel(made.folders, item.ids.length + 1, WISH_WORDS)}.`, made.undo);
          return;
        }
        const done = moveMarked(this.folders, { folders: item.folders, items: item.ids }, to.folder);
        const said = movedText(done, WISH_WORDS, to.folder ? this.folderName(to.folder) : 'a Wishlist', to.folder !== null, true);
        if (!said.moved) {
          this.toasts.show(said.text);
          return;
        }
        this.selection.done();
        this.undoToast(said.text, done.undo);
      });
      return;
    }
    if (to.kind === 'juntar') {
      if (item.kind !== 'notas') return;
      const ids = [...item.ids, to.with];
      this.transitions.run(() => {
        const made = this.folders.gather(ids, kind, this.openFolder());
        if (!made) {
          this.toasts.show('Não cabe mais nenhuma pasta aqui.');
          return;
        }
        this.naming.set(made.folder.id);
        this.undoToast(`Nova pasta com ${ids.length} recortes.`, made.undo);
      });
      return;
    }
    const where = this.folderName(to.folder);
    if (item.kind === 'pasta') {
      const was = this.folderName(item.id);
      this.transitions.run(() => {
        const undo = this.folders.move(item.id, to.folder);
        if (undo) this.undoToast(to.folder ? `${was} guardada em ${where}.` : `${was} foi para a Wishlist.`, undo);
      });
      return;
    }
    const one = this.mural.wishes().find((w) => w.id === grabOf(item).id)?.game.name ?? 'O recorte';
    this.transitions.run(() => {
      const done = this.folders.place(item.ids, to.folder);
      if (!done.moved) return;
      const text = to.folder
        ? done.moved === 1
          ? `“${one}” guardado em ${where}.`
          : `${done.moved} recortes guardados em ${where}.`
        : done.moved === 1
          ? `“${one}” saiu das pastas.`
          : `${done.moved} recortes saíram das pastas.`;
      this.undoToast(text, done.undo);
    });
  }

  /** A cada letra do nome: a irmã que já tem esse nome (o Enter junta as duas). */
  protected drafted(f: NoteFolder, value: string): void {
    const tree = this.folderTree();
    this.clash.set(siblingNamed(tree, f.group, tree.parentOf(f.id), value, f.id)?.name ?? null);
  }

  /** Acabou de dar nome à pasta: renomeia, ou junta com a irmã de mesmo nome; o foco volta para ela. */
  protected named(f: NoteFolder, value: string | null): void {
    this.naming.set(null);
    this.clash.set(null);
    const clean = value?.trim() ?? '';
    let focus = f.id;
    if (clean && clean !== f.name) {
      const tree = this.folderTree();
      const twin = siblingNamed(tree, f.group, tree.parentOf(f.id), clean, f.id);
      if (twin) {
        this.undoToast(`${f.name} entrou em ${twin.name}: agora é uma pasta só.`, this.folders.join(f.id, twin.id));
        focus = twin.id;
      } else {
        this.folders.rename(f.id, clean);
      }
    }
    afterNextRender(() => this.host.querySelector<HTMLElement>(`app-folder-card[data-pasta="${CSS.escape(focus)}"] button`)?.focus(), { injector: this.injector });
  }

  /** Uma pasta nova (vazia) em `parent`, já com o campo do nome. */
  private newFolder(parent: string | null): void {
    if (parent !== this.openFolder()) this.enterFolder(parent);
    const made = this.folders.create(this.mural.kind(), parent, '');
    if (made) this.naming.set(made.id);
    else this.toasts.show('Não cabe mais nenhuma pasta aqui.');
  }

  /** Desfaz a pasta: o que tinha dentro sobe (pergunta antes, se não estiver vazia), com o Desfazer. */
  private async dissolve(f: NoteFolder): Promise<void> {
    const up = this.goesTo(this.folderTree().parentOf(f.id));
    if (!(await this.asking.dissolve(f.name, this.folders.contentsOf(f.id), up, WISH_UNITS)) || !this.folderTree().live(f.id)) return;
    this.transitions.run(() => this.undoToast(`A pasta ${f.name} foi desfeita.`, this.folders.dissolve(f.id)));
  }

  /** As opções do menu de uma pasta da parede. */
  private folderSections(f: NoteFolder): MenuSections {
    const p = this.mural.profile();
    return [
      ...this.markedItems(f.id, true),
      [{ id: 'abrir', label: 'Abrir', icon: ICON.pastaDeNotas, run: () => this.enterFolder(f.id) }, this.markFolderItem(f.id)],
      [
        {
          id: 'novo-desejo',
          label: `Adicionar ${g(p, 'um', 'uma')} ${p.singular} aqui`,
          icon: ICON.adicionar,
          dialog: true,
          run: () => {
            this.enterFolder(f.id);
            this.desk.newWish();
          },
        },
        { id: 'nova-pasta', label: 'Nova pasta dentro', icon: ICON.novaPasta, run: () => this.newFolder(f.id) },
        { id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.naming.set(f.id) },
        { id: 'customizar', label: 'Customizar…', icon: ICON.paleta, dialog: true, run: () => this.customize(f) },
        { id: 'mover', label: 'Mover para…', icon: ICON.guardarNaPasta, dialog: true, run: () => this.moving.set({ kind: 'pasta', id: f.id, name: f.name, from: this.folderTree().parentOf(f.id) }) },
      ],
      [{ id: 'desfazer', label: 'Desfazer a pasta', icon: ICON.desfazerPasta, danger: true, hint: 'O que tem dentro sobe; nenhum recorte sai da wishlist', run: () => void this.dissolve(f) }],
    ];
  }

  private readonly folderSheet = viewChild(FolderSheet);

  /** O Customizar… da pasta (PLANO-PASTAS-CUSTOMIZADAS.md, 4): o nome, a cor e o enfeite, com o Desfazer. */
  private customize(f: NoteFolder): void {
    const live = this.folderTree().live(f.id);
    if (!live) return;
    this.folderSheet()?.open({
      folder: live,
      info: this.folderInfo().get(f.id) ?? { notes: 0, folders: 0, peek: [] },
      units: ['recorte', 'recortes'],
      clash: (name) => {
        const tree = this.folderTree();
        return siblingNamed(tree, live.group, tree.parentOf(live.id), name, live.id)?.name ?? null;
      },
      current: () => this.folderTree().live(f.id),
      apply: (change) => {
        let undo: (() => void) | null = null;
        this.transitions.run(() => (undo = this.folders.customize(f.id, change)));
        return undo;
      },
      views: this.views,
      inherited: this.views.find((v) => v.value === this.prefs().vista)?.label,
      note: 'A pasta fica assim para todos que a veem.',
    });
  }

  /** Marcar ou desmarcar a pasta, no menu dela (no toque, o jeito de marcar sem o Ctrl). */
  private markFolderItem(id: string): MenuItem {
    const on = this.selection.hasFolder(id);
    return { id: 'marcar', label: on ? 'Desmarcar' : 'Marcar', icon: on ? ICON.desmarcado : ICON.marcado, hint: on ? undefined : 'Para mover, copiar ou tirar vários juntos', run: () => this.selection.toggleFolder(id) };
  }

  /** No alto do menu de um marcado (recorte ou pasta), com outros marcados: mover e copiar todos (PLANO-MARCAR-PASTAS.md, D11). */
  private markedItems(id: string, folder: boolean): MenuSections {
    const n = this.selection.count();
    if (!this.marking() || n < 2 || !(folder ? this.selection.hasFolder(id) : this.selection.has(id))) return [];
    return [[{ id: 'mover-marcados', label: `Mover os ${n} marcados…`, icon: ICON.guardarNaPasta, dialog: true, run: () => this.moveMarked() }, { ...copyMarkedItem(this.selection), label: `Copiar os ${n} marcados` }]];
  }

  /** O menu do vão da parede: pôr um recorte ou criar uma pasta ali. */
  private gapSections(): MenuSections {
    const p = this.mural.profile();
    return [
      [
        { id: 'novo-desejo', label: `Adicionar ${g(p, 'um', 'uma')} ${p.singular} aqui`, icon: ICON.adicionar, dialog: true, run: () => this.desk.newWish() },
        { id: 'nova-pasta', label: 'Nova pasta aqui', icon: ICON.novaPasta, run: () => this.newFolder(this.openFolder()) },
      ],
    ];
  }

  // ===== Marcar vários (PLANO-MARCAR-PASTAS.md, rodada 5): a seleção das Anotações, com a tira no pé =====

  private readonly confirm = inject(Confirm);
  /** Marcando: o toque marca em vez de começar a resenha (o botão Marcar da barra, ou o Ctrl+clique). */
  protected readonly marking = signal(false);
  readonly selection: NoteSelection<Wish>;
  private readonly wishById = computed(() => new Map(this.mural.wishes().map((w) => [w.id, w])));
  /** As pastas da Wishlist deste mural, vivas (as que se marcam). */
  private readonly liveFolders = computed<ReadonlySet<string>>(() => {
    const group = this.group();
    return new Set(this.folderTree().all.flatMap((f) => (f.group === group && !f.gone ? [f.id] : [])));
  });
  /** Os recortes de uma pasta e das de dentro dela, na ordem da parede: o que vai junto com a pasta marcada. */
  private inside(id: string): Wish[] {
    const below = this.folderTree().below(id);
    return sortWishes(
      this.mural.wishes().filter((w) => below.has(this.whereIs(w.id) ?? '')),
      this.prefs(),
    );
  }
  /** Os marcados de cima (o que está dentro de uma pasta marcada vai com ela). */
  private readonly markedTop = computed(() => markedTops(this.folderTree(), { folders: this.selection.folders(), items: this.selection.ids() }, (id) => this.whereIs(id)));
  /** Os marcados que a busca, os filtros ou a pasta não mostram agora (as pastas também). */
  protected readonly hiddenMarked = computed(() => {
    const shown = new Set(this.visible().map((w) => w.id));
    const kids = new Set(this.folderKids().map((f) => f.id));
    return this.selection.ids().filter((id) => !shown.has(id)).length + this.selection.folders().filter((id) => !kids.has(id)).length;
  });
  /** O que a tira oferece: marcar todos os à mostra, copiar, tirar da wishlist e, de tinta, mover. */
  protected readonly trayActions = computed<TrayAction[]>(() => {
    const n = this.selection.count();
    const shown = [...this.folderKids().map((f) => FOLDER_MARK + f.id), ...this.visible().map((w) => w.id)];
    const all = shown.length > 0 && shown.every((k) => this.selection.has(k));
    return [
      { id: 'todas', label: 'Marcar todos', icon: ICON.marcado, disabled: all, hint: 'Os à mostra agora', run: () => this.selection.add(shown) },
      { id: 'copiar', label: 'Copiar', icon: ICON.copiar, disabled: !n, hint: 'O nome e a descrição de cada um', run: () => void this.selection.copy() },
      { id: 'tirar', label: 'Tirar da wishlist', icon: ICON.apagar, disabled: !n, danger: true, run: () => void this.removeMarked() },
      { id: 'mover', label: 'Mover para pasta…', icon: ICON.guardarNaPasta, primary: true, run: () => this.moveMarked() },
    ];
  });

  protected toggleMarking(): void {
    if (this.marking()) this.selection.done();
    else this.selection.start();
  }

  /** "Mover para pasta…" da tira e do menu de um marcado: a folha, com as pastas marcadas indo inteiras. */
  private moveMarked(): void {
    const tops = this.markedTop();
    const n = tops.folders.length + tops.items.length;
    if (!n) return;
    const from = new Set([...tops.folders.map((id) => this.folderTree().parentOf(id)), ...tops.items.map((id) => this.whereIs(id))]);
    if (tops.folders.length) {
      this.moving.set({ kind: 'varios', ids: tops.items, folders: tops.folders, name: marksLabel(tops.folders.length, tops.items.length, WISH_WORDS), from: from.size === 1 ? [...from][0] : null });
      return;
    }
    const one = this.wishById().get(tops.items[0]);
    this.moving.set({ kind: 'desejos', ids: tops.items, name: n === 1 && one ? one.game.name : plural(n, 'recorte', 'recortes'), from: from.size === 1 ? [...from][0] : null });
  }

  /** A vontade escolhida no menu de um marcado vale para todos os marcados (e os de dentro das pastas marcadas). */
  private setRelevanceMany(list: readonly Wish[], r: Relevance): void {
    const changed = list.filter((w) => relevanceOf(w) !== r);
    if (!changed.length) return;
    const before = new Map(changed.map((w) => [w.id, relevanceOf(w)]));
    this.transitions.run(() => changed.forEach((w) => this.store.setRelevance(w.id, r)));
    this.toasts.show(`${plural(changed.length, 'recorte', 'recortes')} agora ${changed.length === 1 ? 'é' : 'são'} ${r === 'comum' ? 'Comum' : relevanceLabel(changed[0].kind, r)}`, {
      label: 'Desfazer',
      run: () => this.transitions.run(() => before.forEach((was, id) => this.store.setRelevance(id, was))),
    });
  }

  /**
   * Tirar da wishlist os marcados, com um Desfazer só; com pastas marcadas, a pergunta das pastas
   * (PLANO-MARCAR-PASTAS.md, D10): elas saem com tudo o que está dentro, ou só se desfazem.
   */
  private async removeMarked(): Promise<void> {
    const tops = this.markedTop();
    const nf = tops.folders.length;
    const all = this.selection.copied().items.map((w) => w.id);
    let choice: Choice = 'confirm';
    if (nf) choice = await this.confirm.choose(foldersRemovalAsk(nf, all.length - tops.items.length, tops.items.length, WISH_WORDS, [], true));
    if (!choice) return;
    this.transitions.run(() => {
      const ids = choice === 'secondary' ? tops.items : all;
      const gone = ids.flatMap((id) => this.store.removeWish(id) ?? []);
      const folderUndos = nf ? (choice === 'secondary' ? tops.folders.map((id) => this.folders.dissolve(id)) : [this.folders.drop(tops.folders)]) : [];
      this.selection.done();
      const text =
        choice === 'secondary'
          ? `${nf === 1 ? 'A pasta foi desfeita' : `As ${nf} pastas foram desfeitas`}${gone.length ? ` e ${plural(gone.length, 'recorte saiu', 'recortes saíram')} da wishlist` : ''}.`
          : `${marksLabel(nf, gone.length, WISH_WORDS)} ${nf + gone.length === 1 ? 'saiu' : 'saíram'} da wishlist.`;
      this.toasts.show(text, {
        label: 'Desfazer',
        run: () =>
          this.transitions.run(() => {
            [...folderUndos].reverse().forEach((u) => u());
            gone.forEach((w) => this.store.restoreWish(w));
          }),
      });
    });
  }

  /** O que está sendo movido pela folha: recortes, uma pasta, ou os marcados com pastas no meio. */
  protected readonly moving = signal<
    | { kind: 'desejos'; ids: readonly string[]; name: string; from: string | null }
    | { kind: 'pasta'; id: string; name: string; from: string | null }
    | { kind: 'varios'; ids: readonly string[]; folders: readonly string[]; name: string; from: string | null }
    | null
  >(null);
  /** O que a folha precisa saber: as contas, onde está e o que não se pode escolher. */
  protected readonly moveSheet = computed(() => {
    const m = this.moving();
    if (!m) return null;
    const tree = this.folderTree();
    return {
      title: m.kind === 'pasta' ? `Mover a pasta ${m.name}` : `Mover ${m.name}`,
      sub: m.kind === 'pasta' || (m.kind === 'desejos' && m.ids.length === 1) ? `Está em ${this.folderName(m.from)}` : m.from === null && m.kind === 'varios' ? 'Estão em lugares diferentes' : `Estão em ${this.folderName(m.from)}`,
      counts: this.folders.countsIn(this.mural.kind()),
      // (nunca uma pasta dentro dela mesma)
      blocked: m.kind === 'pasta' ? tree.below(m.id) : m.kind === 'varios' ? new Set(m.folders.flatMap((id) => [...tree.below(id)])) : new Set<string>(),
      rootLabel: m.kind === 'desejos' ? 'Sem pasta' : 'Direto na Wishlist',
      start: m.from,
    };
  });

  /** Escolheu na folha: move (os recortes, ou a pasta), com o aviso e o Desfazer. */
  protected moveTo(id: string | null): void {
    const m = this.moving();
    this.moving.set(null);
    if (!m || (id === m.from && m.kind === 'pasta')) return;
    if (m.kind === 'pasta') this.dropped({ kind: 'pasta', id: m.id }, { kind: 'guardar', folder: id });
    else if (m.kind === 'varios') this.dropped({ kind: 'varios', grab: { kind: 'pasta', id: m.folders[0] }, ids: m.ids, folders: m.folders }, { kind: 'guardar', folder: id });
    else this.dropped({ kind: 'notas', lead: m.ids[0], ids: m.ids }, { kind: 'guardar', folder: id });
  }

  /** O nome escrito na folha que ainda não é pasta: cria ali e move para ela. */
  protected moveToNew(e: { parent: string | null; name: string }): void {
    const made = this.folders.create(this.mural.kind(), e.parent, e.name);
    if (made) this.moveTo(made.id);
    else {
      this.moving.set(null);
      this.toasts.show('Não cabe mais nenhuma pasta aqui.');
    }
  }
}
