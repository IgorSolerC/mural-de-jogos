import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ICON, IconModule } from './icons';
import { CoverChoice, GameLookup, LookupError, STORED_COVER, coverFrom, imageLoads } from '../core/game-lookup';
import { ImageStore, StoredImage } from '../core/image-store';
import { ImageProblem, imageFileOf, localImageId, localImageUrl } from '../core/images';
import { pixelCoverPng } from '../core/pixel-cover';
import { PixelPiece, artValues, pieceTitle, pieceTitleOf, pixelArtOf, valuesArt } from '../core/pixel-gallery';
import { PixelPicker } from './pixel-picker';
import { WidgetValues } from '../core/widgets';
import { PixelGallery } from '../core/pixel-gallery-store';
import { PixelStudio } from './pixel-studio/pixel-studio';
import { Kind, PickedGame, initialOf } from '../core/review';
import { Settings } from '../core/settings';
import { plural } from '../core/text';
import { MuralSrc } from './stored-image';

const SOURCE_ARTICLE: Record<string, string> = { TMDB: 'no', Kitsu: 'no', AniList: 'no' };

/** O crédito da capa que é uma pixel art da galeria. */
const PIXEL_COVER = 'Pixel art';

/** "na Wikipedia e na RAWG", "no Kitsu e no AniList". */
function joinSources(list: string[]): string {
  const parts = list.map((s) => `${SOURCE_ARTICLE[s] ?? 'na'} ${s}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : parts[0];
}

/**
 * A escolha da capa: as fotos que o catálogo tem do mesmo título, soltas na mesa, e a escolhida sai
 * do monte. Também dá para colar o link de uma imagem, trazer uma do aparelho (escolher, colar com
 * Ctrl+V ou soltar em cima das capas: ela é guardada como as imagens das anotações, PLANO-CAPAS.md),
 * usar uma pixel art da galeria, escolhida na folha da galeria (ui/pixel-picker.ts) e impressa no papel
 * milimetrado (core/pixel-cover.ts), ou desenhar uma ali mesmo no ateliê (ela fica também na galeria), ou
 * ficar sem capa.
 * Serve à wishlist, ao Pra depois e à ficha do mural; quem usa recebe o item com a
 * capa nova em `changed`.
 */
@Component({
  selector: 'app-cover-picker',
  imports: [IconModule, MuralSrc, PixelPicker, PixelStudio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(dragenter)': 'onDrag($event)',
    '(dragover)': 'onDrag($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
    // o arrasto acabou em outro lugar (soltou fora, Esc): o tracejado apaga
    '(document:dragend)': 'dropping.set(false)',
    '(document:drop)': 'dropping.set(false)',
    '[class.soltando]': 'dropping()',
  },
  template: `
    <div class="grade">
      @if (saving()) {
        <!-- a imagem do aparelho sendo encolhida e guardada: o lugar dela, na frente do monte -->
        <span class="capa esperando guardando" aria-hidden="true">
          <span class="foto"><span class="carregando-capa clara"><span class="roda"></span><span class="txt">guardando</span></span></span>
        </span>
      }
      @for (c of shown(); track c.coverUrl; let i = $index) {
        <label class="capa" [class.on]="cover() === c.coverUrl" [class.quebrada]="isBroken(c.coverUrl)">
          <input
            type="radio"
            class="sr-only"
            [name]="group()"
            [checked]="cover() === c.coverUrl"
            (change)="choose(c)"
            [attr.aria-label]="'Capa ' + (i + 1) + ' de ' + shown().length + ', ' + c.from + (isBroken(c.coverUrl) ? ', não abriu' : '')"
          />
          <span class="foto">
            <img
              [muralSrc]="c.coverUrl"
              alt=""
              [class.revelada]="isLoaded(c.coverUrl)"
              [class.escondida]="!isLoaded(c.coverUrl)"
              decoding="async"
              referrerpolicy="no-referrer"
              (load)="onLoaded(c.coverUrl)"
              (error)="onBroken(c.coverUrl)"
            />
            @if (isBroken(c.coverUrl)) {
              <span class="nao-abriu" aria-hidden="true">não abriu</span>
            } @else if (!isLoaded(c.coverUrl)) {
              <!-- a foto já foi achada, mas ainda está chegando -->
              <span class="carregando-capa clara" aria-hidden="true"><span class="roda"></span><span class="txt">carregando</span></span>
            }
          </span>
          <span class="de" aria-hidden="true">{{ c.from }}</span>
        </label>
      }
      @if (loading()) {
        <!-- os catálogos ainda procurando: o lugar das fotos que ainda vão chegar -->
        @for (s of [1, 2]; track s) {
          <span class="capa esperando" aria-hidden="true">
            <span class="foto"><span class="carregando-capa clara"><span class="roda"></span><span class="txt">procurando</span></span></span>
          </span>
        }
      }
      <label class="capa sem" [class.on]="cover() === null">
        <input type="radio" class="sr-only" [name]="group()" [checked]="cover() === null" (change)="choose(null)" aria-label="Sem capa" />
        <span class="foto">
          <span class="inicial" aria-hidden="true">{{ initialOf(game().name) }}</span>
          <span class="sem-txt" aria-hidden="true">sem capa</span>
        </span>
      </label>
    </div>
    <!-- o que ainda está vindo, à vista: onde ainda procura, e quantas fotos ainda estão chegando -->
    <p class="andamento" [class.parado]="!progress()" role="status">
      @if (progress(); as msg) {
        <span class="roda" aria-hidden="true"></span>{{ msg }}
      } @else {
        <span class="sr-only">{{ shown().length }} capas para escolher.</span>
      }
    </p>

    @if (pasting()) {
      <div class="colar">
        <label class="rotulo" [for]="group() + '-link'">Link da imagem</label>
        <div class="colar-linha">
          <div class="tira-link" [class.busy]="pasteBusy()">
            <lucide-icon [img]="LinkIcon" [size]="18" aria-hidden="true" />
            <input
              #pasteField
              type="url"
              inputmode="url"
              autocomplete="off"
              spellcheck="false"
              placeholder="https://…"
              [id]="group() + '-link'"
              [value]="pasteUrl()"
              (input)="pasteUrl.set($any($event.target).value)"
              (keydown)="onPasteKey($event)"
              (paste)="onPaste($event)"
              [attr.aria-invalid]="pasteError() ? true : null"
              [attr.aria-describedby]="pasteError() ? group() + '-link-erro' : null"
            />
          </div>
          <button type="button" class="btn-quiet" (click)="usePaste()" [disabled]="pasteBusy()">Usar</button>
          <button type="button" class="btn-quiet" (click)="cancelPaste()">Cancelar</button>
        </div>
        @if (pasteError(); as err) {
          <p class="field-error" [id]="group() + '-link-erro'" role="alert">{{ err }}</p>
        }
      </div>
    }

    <div class="acoes">
      @if (!pasting()) {
        <button type="button" class="acao-caneta colar-btn" (click)="openPaste()">
          <lucide-icon [img]="LinkIcon" [size]="16" aria-hidden="true" />
          Colar link de imagem
        </button>
      }
      <button type="button" class="acao-caneta aparelho-btn" (click)="chooseFile()">
        <lucide-icon [img]="UploadIcon" [size]="16" aria-hidden="true" />
        Escolher do aparelho
      </button>
      <button type="button" class="acao-caneta pixel-btn" aria-haspopup="dialog" [disabled]="saving()" (click)="pixelPickerOpen.set(true)">
        <lucide-icon [img]="PixelIcon" [size]="16" aria-hidden="true" />
        Pixel art
      </button>
      <input #fileField class="escolher-arquivo" type="file" accept="image/*" tabindex="-1" aria-hidden="true" hidden (change)="fromDevice($event)" />
      <ng-content />
    </div>
    @if (imageError(); as err) {
      <p class="aviso" role="alert">{{ err }}</p>
    } @else if (saving()) {
      <p class="sr-only" role="status">Guardando a imagem…</p>
    } @else if (drawnNote(); as note) {
      <p class="dica-capa" role="status">{{ note }}</p>
    }
    <!-- a galeria de pixel arts: a folha do "Escolher a nota", com os filtros e o Desenhar uma nova -->
    <app-pixel-picker
      [(open)]="pixelPickerOpen"
      heading="Pixel art de capa"
      hint="Uma da sua galeria vira a capa, impressa no papel milimetrado."
      footHint="Toque numa pixel art para usar de capa."
      [keepsNew]="true"
      (picked)="usePiece($event)"
      (create)="drawNew()"
    />
    @if (studio(); as v) {
      <!-- já, e não quando a página sossegar: o ateliê abre logo depois do clique -->
      @defer (on immediate) {
        <app-pixel-studio [values]="v" (changed)="drawing($event)" (closed)="studioClosed()" />
      }
    }
    <!-- a outra porta, sem botão: só onde há teclado e mouse (no celular não há Ctrl+V nem arrastar arquivo) -->
    <p class="dica-capa dica-colar">Também dá para colar uma imagem (Ctrl+V) ou soltar o arquivo em cima das capas.</p>
    @if (error(); as err) {
      <p class="aviso" role="status">{{ err }} Dá para colar um link ou seguir sem capa.</p>
    } @else if (notes().length) {
      <p class="aviso" role="status">{{ notes().join(' ') }} As outras capas estão aí.</p>
    } @else if (kind() === 'jogos' && !settings.hasRawg() && !loading() && game().source !== 'manual') {
      <p class="dica-capa">Com uma chave da RAWG em Ajustes, aparecem também as capas da Steam.</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 10px;
      min-width: 0;
    }

    /* ===== As capas: fotos soltas na mesa; a escolhida sai do monte ===== */
    .grade {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
      gap: 16px 14px;
      padding: 8px 6px 4px;
    }

    .capa {
      position: relative;
      display: block;
      cursor: pointer;
      transition:
        translate var(--t-ui) var(--ease-ui),
        rotate var(--t-physical) var(--ease-physical);

      &:hover {
        translate: 0 -2px;
      }

      /* o foco é tracejado: não se confunde com a borda da escolhida */
      &:has(input:focus-visible) {
        outline: 2px dashed var(--ink);
        outline-offset: 8px;
        border-radius: 2px;
      }
    }

    .foto {
      position: relative;
      display: block;
      aspect-ratio: 3 / 4;
      overflow: hidden;
      background: #e8e5de;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
      transition:
        filter var(--t-ui) var(--ease-ui),
        opacity var(--t-ui) var(--ease-ui);

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: 50% 20%;
      }

      img[src*='/library_600x900.'] {
        object-position: 50% 50%;
      }
    }

    /* de onde veio: a legenda miúda embaixo da foto, como o crédito da imagem na revista */
    .de {
      display: block;
      margin-top: 7px;
      overflow: hidden;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.68rem;
      letter-spacing: 0.1em;
      line-height: 1;
      text-align: center;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--ink-2);
    }
    .capa.on .de {
      margin-top: 10px;
      color: var(--ink);
    }

    /* as que não foram escolhidas ficam um pouco apagadas: a escolhida salta */
    .grade:has(.on) .capa:not(.on) .foto {
      filter: saturate(0.7);
      opacity: 0.78;
    }

    .grade:has(.on) .capa:not(.on):hover .foto {
      filter: none;
      opacity: 1;
    }

    /* a escolhida: levantada do papel, com a borda de tinta, como quem separou a foto do monte */
    .capa.on .foto {
      outline: 3px solid var(--ink);
      outline-offset: 3px;
      box-shadow: 0 6px 10px -3px rgb(0 0 0 / 0.45);
    }

    .capa.on {
      translate: 0 -3px;
      rotate: -1.5deg;
    }

    .sem .foto {
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 2px;
      background: repeating-linear-gradient(-45deg, rgb(21 21 21 / 0.05) 0 6px, transparent 6px 12px), #eeebe4;
      color: rgb(21 21 21 / 0.66);
    }

    .inicial {
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      font-size: 2rem;
      line-height: 1;
    }

    .sem-txt,
    .nao-abriu {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    /* a capa que já estava, mas não abriu agora: fica à vista (não some da ficha sem a pessoa pedir) */
    .quebrada .foto {
      display: grid;
      place-items: center;
      background: repeating-linear-gradient(45deg, rgb(21 21 21 / 0.05) 0 6px, transparent 6px 12px), #eeebe4;

      img {
        position: absolute;
        inset: 0;
        opacity: 0;
      }
    }

    .nao-abriu {
      padding: 0 4px;
      text-align: center;
      color: rgb(21 21 21 / 0.66);
    }

    /* procurando outras capas: o lugar das fotos que ainda vão chegar, tracejado */
    .esperando {
      cursor: default;

      .foto {
        outline: 1.5px dashed rgb(21 21 21 / 0.3);
        outline-offset: -1.5px;
        box-shadow: none;
      }

      &:hover {
        translate: none;
      }
    }

    .foto img.escondida {
      opacity: 0;
    }

    /* o andamento, à vista, embaixo das fotos */
    .andamento {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 22px;
      margin: -2px 0 0;
      font-family: var(--f-ui);
      font-weight: 600;
      font-size: 0.92rem;
      line-height: 1.3;
      color: var(--ink-2);

      &.parado {
        min-height: 0;
        margin: 0;
      }

      .roda {
        flex: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid currentColor;
        border-right-color: transparent;
        animation: capa-roda 800ms linear infinite;
      }
    }

    .acoes {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;

      &:empty {
        display: none;
      }
    }

    .colar-btn,
    .aparelho-btn,
    .pixel-btn {
      margin: 2px 0 0 -8px;
      font-size: 0.95rem;
    }

    /* a dica de colar e soltar: só com mouse (o toque não tem Ctrl+V nem arrastar arquivo) */
    .dica-colar {
      margin-top: -4px;
    }
    @media not ((hover: hover) and (pointer: fine)) {
      .dica-colar {
        display: none;
      }
    }

    /* um arquivo sendo arrastado por cima: o monte inteiro vira o lugar de soltar, tracejado como a foto que vai chegar */
    :host(.soltando) .grade {
      outline: 2px dashed var(--ink);
      outline-offset: 2px;
      border-radius: 3px;
      background: rgb(21 21 21 / 0.04);
    }

    .colar {
      display: grid;
      gap: 2px;
    }

    .btn-quiet {
      color: var(--ink);
    }

    /* observação a caneta vermelha, na margem */
    .aviso {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.05rem;
      line-height: 1.3;
      color: var(--red-deep);
    }

    .dica-capa {
      font-size: 0.88rem;
      line-height: 1.35;
      color: var(--ink-2);
    }

    .field-error {
      margin-top: 6px;
      font-weight: 600;
      font-size: 0.92rem;
      color: var(--error-ink);
    }

    @media (max-width: 600px) {
      .grade {
        grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
        gap: 14px 12px;
      }
    }
  `,
})
export class CoverPicker {
  private readonly lookup = inject(GameLookup);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly settings = inject(Settings);

  /** O item, com a capa que ele tem agora. */
  readonly game = input.required<PickedGame>();
  readonly kind = input.required<Kind>();
  /** O nome do grupo de rádios (e o começo dos ids): um por diálogo. */
  readonly group = input('capa');
  /** O item com a capa escolhida (e a fonte de onde ela veio). */
  readonly changed = output<PickedGame>();

  protected readonly LinkIcon = ICON.link;
  protected readonly UploadIcon = ICON.enviar;
  protected readonly PixelIcon = ICON.pixelArt;
  protected readonly initialOf = initialOf;

  private readonly pasteField = viewChild<ElementRef<HTMLInputElement>>('pasteField');
  private readonly fileField = viewChild<ElementRef<HTMLInputElement>>('fileField');
  private readonly images = inject(ImageStore);
  private readonly gallery = inject(PixelGallery);

  /** As capas que dá para escolher; a primeira é a que veio com o item. */
  private readonly choices = signal<CoverChoice[]>([]);
  /** A capa escolhida (a URL); null é sem capa. */
  protected readonly cover = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Um catálogo que não respondeu (a RAWG com a chave recusada, a Wikipedia fora do ar): dito, não escondido. */
  protected readonly notes = signal<string[]>([]);
  /** Os catálogos que ainda não responderam. */
  protected readonly waiting = signal<string[]>([]);
  /** As fotos que já chegaram. */
  private readonly loadedUrls = signal<ReadonlySet<string>>(new Set());
  /** A linha do andamento: onde ainda procura, ou quantas fotos ainda estão chegando; vazia quando acabou. */
  protected readonly progress = computed(() => {
    const w = this.waiting();
    if (this.loading() && w.length) return `Procurando mais capas ${joinSources(w)}…`;
    if (this.loading()) return 'Procurando mais capas…';
    const n = this.shown().filter((c) => c.coverUrl && !this.isLoaded(c.coverUrl) && !this.isBroken(c.coverUrl)).length;
    if (n) return `Carregando ${plural(n, 'foto', 'fotos')}…`;
    return '';
  });
  protected readonly pasting = signal(false);
  protected readonly pasteUrl = signal('');
  protected readonly pasteBusy = signal(false);
  protected readonly pasteError = signal<string | null>(null);
  /** Uma imagem do aparelho sendo encolhida e guardada. */
  protected readonly saving = signal(false);
  protected readonly imageError = signal<string | null>(null);
  /** A folha da galeria de pixel arts, aberta. */
  protected readonly pixelPickerOpen = signal(false);
  /** O ateliê aberto, desenhando uma nova (os valores do widget de pixel art); null fechado. */
  protected readonly studio = signal<WidgetValues | null>(null);
  /** A frase de depois de desenhar: a obra nova também ficou na galeria. */
  protected readonly drawnNote = signal<string | null>(null);
  /** Um arquivo arrastado por cima das capas. */
  protected readonly dropping = signal(false);
  /**
   * As capas que a pessoa trouxe aqui (um link colado, uma imagem do aparelho): ficam na frente quando os
   * catálogos respondem depois, e saem só quando troca de item.
   */
  private readonly mine = new Set<string>();
  /** Capas que não abriram: somem da escolha, menos a escolhida (ela não sai da ficha sem a pessoa pedir). */
  private readonly broken = signal<ReadonlySet<string>>(new Set());
  protected readonly shown = computed(() =>
    this.choices().filter((c) => c.coverUrl && (!this.broken().has(c.coverUrl) || c.coverUrl === this.cover())),
  );

  /** Qual item está na mesa: trocar de item (não de capa) recomeça a escolha. */
  private key = '';
  private abort: AbortController | undefined;
  /** O link colado sendo testado: cancela quando troca de item, fecha o campo ou sai. */
  private pasteAbort: AbortController | undefined;

  constructor() {
    effect(() => {
      const gm = this.game();
      const kind = this.kind();
      untracked(() => this.sync(gm, kind));
    });
    // Ctrl+V com uma imagem copiada, com o seletor aberto: vira a capa. Fora de um campo de texto (o texto da
    // anotação cola a imagem nele mesmo); o campo do link cuida do dele (onPaste)
    const pasted = (e: ClipboardEvent) => {
      if (e.defaultPrevented || typesHere(e.target)) return;
      this.takeClipboard(e);
    };
    document.addEventListener('paste', pasted);
    inject(DestroyRef).onDestroy(() => {
      this.abort?.abort();
      this.pasteAbort?.abort();
      document.removeEventListener('paste', pasted);
    });
  }

  private sync(gm: PickedGame, kind: Kind): void {
    const key = [kind, gm.name, gm.year ?? '', gm.by ?? ''].join('\u0000');
    if (key !== this.key) {
      this.key = key;
      this.closePaste();
      this.mine.clear();
      this.imageError.set(null);
      this.drawnNote.set(null);
      this.broken.set(new Set());
      this.error.set(null);
      this.notes.set([]);
      this.choices.set(gm.coverUrl ? [{ ...gm, from: coverFrom(gm) }] : []);
      this.cover.set(gm.coverUrl);
      void this.creditStored(gm.coverUrl);
      void this.load(gm, kind);
      return;
    }
    // a capa mudou por fora (a da Steam que chegou depois): entra na frente, já escolhida
    if (gm.coverUrl === this.cover()) return;
    if (gm.coverUrl && !this.choices().some((c) => c.coverUrl === gm.coverUrl))
      this.choices.update((list) => [{ ...gm, from: coverFrom(gm) }, ...list]);
    this.cover.set(gm.coverUrl);
  }

  private async load(gm: PickedGame, kind: Kind): Promise<void> {
    this.abort?.abort();
    this.loading.set(false);
    // sem nome de catálogo não há outras capas para achar: fica o link ou nenhuma
    if (gm.source === 'manual') return;
    const ctrl = new AbortController();
    this.abort = ctrl;
    this.loading.set(true);
    try {
      // as que já estavam e o catálogo não trouxe (um link colado, a da Steam) continuam na frente
      const before = this.choices();
      const show = (found: CoverChoice[]) => {
        const kept = before.filter((c) => c.coverUrl && !found.some((f) => f.coverUrl === c.coverUrl));
        const pasted = this.choices().filter((c) => !!c.coverUrl && this.mine.has(c.coverUrl) && !before.includes(c) && !found.some((f) => f.coverUrl === c.coverUrl));
        this.choices.set([...pasted, ...kept, ...found]);
      };
      // cada fonte entra quando responde; as fotos por imprimir ficam até a última
      const { choices: found, notes } = await this.lookup.coverChoices(gm, kind, ctrl.signal, (sofar, waiting) => {
        if (ctrl.signal.aborted) return;
        show(sofar);
        this.waiting.set(waiting);
      });
      if (ctrl.signal.aborted) return;
      this.notes.set(notes);
      show(found);
    } catch (e) {
      if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
      this.error.set(e instanceof LookupError ? e.message : 'Não consegui procurar outras capas agora.');
    } finally {
      if (!ctrl.signal.aborted) {
        this.loading.set(false);
        this.waiting.set([]);
      }
    }
  }

  protected isLoaded(url: string | null): boolean {
    return !!url && this.loadedUrls().has(url);
  }

  protected onLoaded(url: string | null): void {
    if (url && !this.loadedUrls().has(url)) this.loadedUrls.update((set) => new Set(set).add(url));
  }

  protected isBroken(url: string | null): boolean {
    return !!url && this.broken().has(url);
  }

  protected choose(c: CoverChoice | null): void {
    const gm = this.game();
    // a frase do desenho novo fala da capa que ele virou: escolheu outra, ela sai
    if (c?.coverUrl !== this.cover()) this.drawnNote.set(null);
    this.cover.set(c?.coverUrl ?? null);
    this.changed.emit(c?.coverUrl ? { ...gm, coverUrl: c.coverUrl, source: c.source, sourceId: c.sourceId } : { ...gm, coverUrl: null });
  }

  protected onBroken(url: string | null): void {
    if (url) this.broken.update((set) => new Set(set).add(url));
  }

  protected openPaste(): void {
    this.pasting.set(true);
    this.pasteError.set(null);
    setTimeout(() => this.pasteField()?.nativeElement.focus());
  }

  protected closePaste(): void {
    this.pasteAbort?.abort();
    this.pasting.set(false);
    this.pasteUrl.set('');
    this.pasteError.set(null);
    this.pasteBusy.set(false);
  }

  /** Desistiu do link: o teclado volta para o botão de colar. */
  protected cancelPaste(): void {
    this.closePaste();
    this.focusLater('.colar-btn');
  }

  private focusLater(selector: string): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }));
  }

  /** Um link de imagem colado vira mais uma capa, se abrir como imagem. */
  protected async usePaste(): Promise<void> {
    const url = this.pasteUrl().trim();
    if (this.pasteBusy()) return;
    if (!/^https:\/\/\S+$/.test(url) || url.length > 2000) {
      this.pasteError.set('Cole um link que comece com https://');
      return;
    }
    this.pasteBusy.set(true);
    this.pasteError.set(null);
    this.pasteAbort?.abort();
    const ctrl = new AbortController();
    this.pasteAbort = ctrl;
    const ok = await imageLoads(url, ctrl.signal);
    // enquanto testava, a pessoa trocou de item ou desistiu: o link não vai para o outro
    if (ctrl.signal.aborted) return;
    this.pasteBusy.set(false);
    if (!ok) {
      this.pasteError.set('Esse link não abriu como imagem. Copie o endereço da imagem, não o da página.');
      return;
    }
    this.pasting.set(false);
    this.pasteUrl.set('');
    this.bring({ ...this.game(), coverUrl: url, from: 'Link' });
  }

  /** Uma capa trazida aqui (o link colado, a imagem do aparelho) entra na frente do monte, já escolhida. */
  private bring(choice: CoverChoice): void {
    const url = choice.coverUrl!;
    this.mine.add(url);
    if (!this.choices().some((c) => c.coverUrl === url)) this.choices.update((list) => [choice, ...list]);
    this.broken.update((set) => {
      const next = new Set(set);
      next.delete(url);
      return next;
    });
    this.choose(this.choices().find((c) => c.coverUrl === url) ?? choice);
    // o teclado vai para a capa que acabou de entrar
    this.focusLater('input:checked');
  }

  /**
   * A capa guardada que já estava: a pixel art (o único PNG guardado, a foto do aparelho vira WebP ou JPEG) diz
   * "Pixel art" no crédito, e não "Do aparelho".
   */
  private async creditStored(url: string | null): Promise<void> {
    const id = url ? localImageId(url) : null;
    if (!id || (await this.images.get(id))?.tipo !== 'image/png') return;
    this.choices.update((list) => list.map((c) => (c.coverUrl === url ? { ...c, from: PIXEL_COVER } : c)));
  }

  // ===== as pixel arts da galeria (PLANO-CAPAS.md): escolhidas na folha da galeria, ou desenhadas aqui =====

  /** A obra vira a capa: impressa no papel milimetrado, guardada como as imagens (sobe para a nuvem com a conta). */
  protected async usePiece(p: PixelPiece): Promise<boolean> {
    this.drawnNote.set(null);
    return this.store(async () => {
      const png = await pixelCoverPng(pixelArtOf(p));
      if (!png) throw new ImageProblem('O navegador não conseguiu montar a imagem. Tente de novo.');
      return { image: await this.images.addPng(png.blob, png.width, png.height), from: PIXEL_COVER };
    });
  }

  /** O Desenhar uma nova da folha da galeria: o ateliê por cima de tudo, com a tela em branco. */
  protected drawNew(): void {
    this.imageError.set(null);
    this.drawnNote.set(null);
    this.studio.set(artValues([]));
  }

  protected drawing(v: WidgetValues): void {
    this.studio.update((s) => (s ? { ...s, ...v } : s));
  }

  /**
   * O ateliê fechou: com pelo menos um ponto, o desenho vai para a galeria com o nome do item e vira a capa; sem
   * ponto, nada muda e o teclado volta para o Pixel art.
   */
  protected async studioClosed(): Promise<void> {
    const values = this.studio();
    this.studio.set(null);
    const art = values && valuesArt(values);
    if (!art) {
      this.focusLater('.pixel-btn');
      return;
    }
    const piece = this.gallery.create({ art, title: pieceTitleOf(this.game().name) });
    if (!piece) {
      this.imageError.set('A galeria de pixel arts está cheia: apague alguma lá para guardar esta.');
      this.focusLater('.pixel-btn');
      return;
    }
    if (await this.usePiece(piece)) this.drawnNote.set(`“${pieceTitle(piece)}” também ficou na sua galeria de pixel arts.`);
  }

  // ===== a imagem do aparelho: escolher, colar ou soltar (guardada como as das anotações, core/image-store.ts) =====

  /** Abre a escolha de arquivo do aparelho (no celular, a galeria e a câmera). */
  protected chooseFile(): void {
    this.fileField()?.nativeElement.click();
  }

  protected fromDevice(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    // a mesma foto escolhida de novo também avisa
    input.value = '';
    if (file) void this.saveImage(file);
  }

  /** Colou no campo do link: uma imagem (sem texto junto) vira a capa; um texto segue para o campo. */
  protected onPaste(e: ClipboardEvent): void {
    if (e.clipboardData?.getData('text/plain')?.trim()) return;
    this.takeClipboard(e);
  }

  /** A imagem do colar, se há uma (o texto puro fica com quem recebeu o colar). */
  private takeClipboard(e: ClipboardEvent): void {
    const file = imageFileOf(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    void this.saveImage(file);
  }

  protected onDrag(e: DragEvent): void {
    if (!hasFiles(e)) return;
    // sem isto o navegador abre o arquivo no lugar do site
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    this.dropping.set(true);
  }

  protected onDragLeave(e: DragEvent): void {
    // saiu de uma capa para outra (ainda dentro do seletor): continua aceso
    if (e.relatedTarget instanceof Node && this.host.nativeElement.contains(e.relatedTarget)) return;
    this.dropping.set(false);
  }

  protected onDrop(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    this.dropping.set(false);
    const file = imageFileOf(e.dataTransfer);
    if (file) void this.saveImage(file);
    else this.imageError.set('Isso não é uma imagem. Solte uma foto (JPG, PNG ou WebP).');
  }

  /** Qual imagem do aparelho é a última pedida: colou outra enquanto a de antes encolhia, vale a nova. */
  private saveTurn = 0;

  private async saveImage(file: Blob): Promise<void> {
    await this.store(async () => ({ image: await this.images.add(file), from: STORED_COVER }));
  }

  /**
   * Guarda a imagem que `make` prepara e a põe de capa, com o "guardando" no monte e o erro na margem. True: virou
   * a capa.
   */
  private async store(make: () => Promise<{ image: StoredImage; from: string }>): Promise<boolean> {
    const key = this.key;
    const turn = ++this.saveTurn;
    this.saving.set(true);
    this.imageError.set(null);
    try {
      const { image, from } = await make();
      // enquanto guardava, a pessoa trocou de item (a imagem não vai para o outro) ou trouxe outra
      if (key !== this.key || turn !== this.saveTurn) return false;
      this.bring({ ...this.game(), coverUrl: localImageUrl(image.id), from });
      return true;
    } catch (error) {
      if (key === this.key && turn === this.saveTurn) this.imageError.set(error instanceof ImageProblem ? error.message : 'A imagem não entrou. Tente de novo.');
      return false;
    } finally {
      if (turn === this.saveTurn) this.saving.set(false);
    }
  }

  protected onPasteKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void this.usePaste();
    } else if (e.key === 'Escape') {
      // o Esc fecha só o campo, não o diálogo
      e.preventDefault();
      e.stopPropagation();
      this.cancelPaste();
    }
  }
}

/** O que está sendo arrastado traz arquivos (e não um texto ou uma capa da própria página). */
function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
}

/** O colar caiu num lugar de escrever (um campo de texto, o texto da anotação): o colar é dele. */
function typesHere(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !['radio', 'checkbox', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}
