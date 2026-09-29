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
import { Link, LucideAngularModule } from 'lucide-angular';
import { CoverChoice, GameLookup, LookupError, coverFrom, imageLoads } from '../core/game-lookup';
import { Kind, PickedGame, initialOf } from '../core/review';
import { Settings } from '../core/settings';

const SOURCE_ARTICLE: Record<string, string> = { TMDB: 'no', Kitsu: 'no', AniList: 'no' };

/** "na Wikipedia e na RAWG", "no Kitsu e no AniList". */
function joinSources(list: string[]): string {
  const parts = list.map((s) => `${SOURCE_ARTICLE[s] ?? 'na'} ${s}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : parts[0];
}

/**
 * A escolha da capa: as fotos que o catálogo tem do mesmo título, soltas na mesa, e a escolhida sai
 * do monte. Também dá para colar o link de uma imagem, ou ficar sem capa. Serve à wishlist, ao Pra
 * depois e à ficha do mural; quem usa recebe o item com a capa nova em `changed`.
 */
@Component({
  selector: 'app-cover-picker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grade">
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
              [src]="c.coverUrl"
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
            <lucide-icon [img]="LinkIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
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
          <lucide-icon [img]="LinkIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
          Colar link de imagem
        </button>
      }
      <ng-content />
    </div>
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

    .colar-btn {
      margin: 2px 0 0 -8px;
      font-size: 0.95rem;
    }

    .colar {
      display: grid;
      gap: 2px;
    }

    .colar-linha {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .tira-link {
      flex: 1 1 220px;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 46px;
      padding: 0 12px;
      border-radius: 2px;
      background: var(--paper);
      box-shadow: inset 0 0 0 2px var(--ink);

      &:focus-within {
        box-shadow:
          inset 0 0 0 3px var(--ink),
          0 0 0 4px rgb(21 21 21 / 0.16);
      }

      &.busy {
        opacity: 0.7;
      }

      input {
        flex: 1;
        min-width: 0;
        height: 44px;
        border: 0;
        background: transparent;
        outline: none;
        font-family: var(--f-ui);
        font-weight: 500;
        font-size: 1rem;
        color: var(--ink);
        caret-color: var(--red);

        &::placeholder {
          color: rgb(21 21 21 / 0.55);
        }
      }
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
      color: var(--error-ink, #6b0000);
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

  protected readonly LinkIcon = Link;
  protected readonly initialOf = initialOf;

  private readonly pasteField = viewChild<ElementRef<HTMLInputElement>>('pasteField');

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
    if (n) return n === 1 ? 'Carregando 1 foto…' : `Carregando ${n} fotos…`;
    return '';
  });
  protected readonly pasting = signal(false);
  protected readonly pasteUrl = signal('');
  protected readonly pasteBusy = signal(false);
  protected readonly pasteError = signal<string | null>(null);
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
    inject(DestroyRef).onDestroy(() => {
      this.abort?.abort();
      this.pasteAbort?.abort();
    });
  }

  private sync(gm: PickedGame, kind: Kind): void {
    const key = [kind, gm.name, gm.year ?? '', gm.by ?? ''].join('\u0000');
    if (key !== this.key) {
      this.key = key;
      this.closePaste();
      this.broken.set(new Set());
      this.error.set(null);
      this.notes.set([]);
      this.choices.set(gm.coverUrl ? [{ ...gm, from: coverFrom(gm) }] : []);
      this.cover.set(gm.coverUrl);
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
        const pasted = this.choices().filter((c) => c.from === 'Link' && !before.includes(c) && !found.some((f) => f.coverUrl === c.coverUrl));
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
    const pasted: CoverChoice = { ...this.game(), coverUrl: url, from: 'Link' };
    if (!this.choices().some((c) => c.coverUrl === url)) this.choices.update((list) => [pasted, ...list]);
    this.broken.update((set) => {
      const next = new Set(set);
      next.delete(url);
      return next;
    });
    this.pasting.set(false);
    this.pasteUrl.set('');
    this.choose(this.choices().find((c) => c.coverUrl === url) ?? pasted);
    // o campo sumiu: o teclado vai para a capa que acabou de entrar
    this.focusLater('input:checked');
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
