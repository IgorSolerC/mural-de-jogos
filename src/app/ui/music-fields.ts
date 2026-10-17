import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { AudioLines, Ban, ChevronDown, Disc3, Link2, LucideAngularModule, LucideIconData, MicVocal, Music } from 'lucide-angular';
import { AlbumTrack, GameLookup, isCatalogSample } from '../core/game-lookup';
import { ARTIST_MAX, MUSIC_FORMS, MUSIC_FORM_LABEL, MusicForm, PickedGame, SAMPLE_MAX, cleanArtist, musicFormOf } from '../core/review';
import { parseAudio, widgetDef } from '../core/widgets';

let uid = 0;

/** O que o vinil da ficha toca: um trecho do catálogo, um link que a pessoa colou, ou nada. */
type Sound = 'catalogo' | 'link' | 'nada';

const SOUNDS: Record<Sound, { label: string; icon: LucideIconData }> = {
  catalogo: { label: 'Trecho do catálogo', icon: AudioLines },
  link: { label: 'Um link meu', icon: Link2 },
  nada: { label: 'Nada', icon: Ban },
};

/**
 * O que só a ficha de música tem, no editor, logo depois de escolher o item:
 *
 * - **Álbum ou música**: só para o que foi escrito à mão (o catálogo já diz o que é).
 * - **Artista ou banda**: vem do catálogo já preenchido e dá para mudar. É a categoria da ficha: a
 *   aba dela no mural. As sugestões são os artistas que o mural já tem.
 * - **O que toca no vinil**: o trecho de 30 segundos do catálogo (num álbum, de qual faixa), um link
 *   que a pessoa cola (YouTube, Vimeo, um arquivo de som), ou nada. É opcional.
 *
 * O item vem e volta inteiro (`game` e `gameChange`): os campos da música moram nele (ver `PickedGame`).
 */
@Component({
  selector: 'app-music-fields',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let g = game();
    @if (!fromCatalog()) {
      <fieldset class="campo">
        <legend class="rotulo">Álbum ou música?</legend>
        <div class="opts">
          @for (f of forms; track f) {
            <label class="opcao">
              <input type="radio" [name]="id + '-tipo'" [value]="f" [checked]="form() === f" (change)="setForm(f)" />
              <span class="etiqueta" [class.recorte]="form() !== f" [class.colado]="form() === f">
                <lucide-icon [img]="f === 'album' ? AlbumIcon : SongIcon" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
                <span>{{ formLabel[f] }}</span>
              </span>
            </label>
          }
        </div>
      </fieldset>
    }

    <div class="campo">
      <label class="rotulo" [for]="id + '-artista'">Artista ou banda</label>
      <div class="tira">
        <lucide-icon [img]="ArtistIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
        <input
          [id]="id + '-artista'"
          type="text"
          autocomplete="off"
          autocapitalize="words"
          spellcheck="false"
          placeholder="Quem toca"
          [maxLength]="artistMax"
          [attr.list]="id + '-artistas'"
          [attr.aria-describedby]="id + '-artista-dica'"
          [value]="artist() ?? ''"
          (input)="artist.set($any($event.target).value || null)"
          (blur)="tidyArtist()"
        />
      </div>
      <datalist [id]="id + '-artistas'">
        @for (a of artists(); track a) {
          <option [value]="a"></option>
        }
      </datalist>
      <p class="dica" [id]="id + '-artista-dica'">{{ artistHint() }}</p>
    </div>

    <fieldset class="campo" [attr.aria-busy]="loading() || null">
      <legend class="rotulo">O que toca no vinil?</legend>
      <div class="opts">
        @for (s of sounds(); track s) {
          <label class="opcao">
            <input type="radio" [name]="id + '-som'" [value]="s" [checked]="sound() === s" (change)="setSound(s)" />
            <span class="etiqueta" [class.recorte]="sound() !== s" [class.colado]="sound() === s">
              <lucide-icon [img]="soundOf[s].icon" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
              <span>{{ soundOf[s].label }}</span>
            </span>
          </label>
        }
      </div>
      @switch (sound()) {
        @case ('catalogo') {
          @if (form() === 'album' && tracks().length > 1) {
            <label class="tira escolha">
              <span class="escolha-pre">Faixa</span>
              <select [attr.aria-describedby]="id + '-som-dica'" (change)="useTrack($any($event.target).value)">
                @for (t of tracks(); track t.sample) {
                  <option [value]="t.sample" [selected]="t.sample === g.sample">{{ t.n }}. {{ t.name }}</option>
                }
              </select>
              <lucide-icon class="chev" [img]="ChevronIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
            </label>
            <p class="dica" [id]="id + '-som-dica'">A sua preferida do disco: toca um trecho de 30 segundos dela.</p>
          } @else {
            <p class="dica">Toca um trecho de 30 segundos, direto do catálogo.</p>
          }
        }
        @case ('link') {
          <div class="tira" [class.errada]="!!linkProblem()">
            <lucide-icon [img]="LinkIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
            <input
              class="link"
              type="url"
              inputmode="url"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              aria-label="Link da música"
              placeholder="YouTube, Vimeo ou um arquivo de som"
              [maxLength]="sampleMax"
              [value]="linkText()"
              [attr.aria-invalid]="!!linkProblem()"
              [attr.aria-describedby]="id + '-som-dica'"
              (input)="setLink($any($event.target).value)"
            />
          </div>
          @if (linkProblem(); as p) {
            <p class="field-error" [id]="id + '-som-dica'">{{ p }}</p>
          } @else {
            <p class="dica" [id]="id + '-som-dica'">O play do disco toca o som desse link, ali mesmo na ficha.</p>
          }
        }
        @default {
          <p class="dica" aria-live="polite">{{ loading() ? 'Procurando no catálogo o que dá para tocar…' : 'O disco fica parado na ficha. Dá para pôr o som depois.' }}</p>
        }
      }
    </fieldset>
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
      min-width: 0;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    .opts {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
    }
    /* a escolha é a etiqueta: picotada na cartela, ou colada em tinta preta (como os filtros do mural) */
    .etiqueta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 11px;
      border-radius: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.88rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
    }
    .etiqueta lucide-icon {
      display: inline-flex;
      margin-top: -1px;
    }
    .etiqueta.colado {
      background: var(--ink);
      color: var(--paper);
      box-shadow: 0 2px 3px rgb(0 0 0 / 0.3);
    }

    /* a tira de papel de sempre, com o desenho do campo na ponta */
    .tira {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 50px;
      padding: 0 14px;
      border-radius: 2px;
      background: var(--paper);
      color: var(--ink);
      box-shadow:
        inset 0 0 0 2px var(--ink),
        0 1px 3px rgb(0 0 0 / 0.2);
    }
    .tira:focus-within {
      box-shadow:
        inset 0 0 0 3px var(--ink),
        0 0 0 4px rgb(21 21 21 / 0.16);
    }
    .tira.errada {
      box-shadow:
        inset 0 0 0 3px var(--error-ink),
        0 1px 3px rgb(0 0 0 / 0.2);
    }
    .tira lucide-icon {
      flex: none;
      display: inline-flex;
    }
    .opts + .tira {
      margin-top: 10px;
    }
    input[type='text'],
    input[type='url'] {
      flex: 1;
      min-width: 0;
      height: 46px;
      padding: 0;
      border: 0;
      background: transparent;
      outline: none;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.2rem;
      caret-color: var(--red);
    }
    /* o link é para conferir letra por letra: na letra de forma */
    input.link {
      font-family: var(--f-ui);
      font-weight: 500;
      font-size: 1rem;
    }
    input::placeholder {
      color: rgb(21 21 21 / 0.55);
    }
    input::selection {
      background: var(--hi);
      color: var(--ink);
    }
    /* a lista do navegador já abre com as sugestões: a setinha dele sobraria ao lado do campo */
    input::-webkit-calendar-picker-indicator {
      display: none !important;
    }

    /* a faixa do álbum: a tira inteira é o controle, com o <select> do navegador por cima, invisível */
    .escolha {
      position: relative;
      cursor: pointer;
    }
    .escolha-pre {
      flex: none;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .escolha select {
      flex: 1;
      min-width: 0;
      height: 46px;
      padding: 0 22px 0 0;
      border: 0;
      background: transparent;
      outline: none;
      appearance: none;
      -webkit-appearance: none;
      color: var(--ink);
      font-family: var(--f-hand);
      font-size: 1.2rem;
      text-overflow: ellipsis;
      cursor: pointer;
      color-scheme: light;
    }
    .escolha option {
      background: var(--paper);
      color: var(--ink);
      font-family: var(--f-ui);
      font-size: 1rem;
    }
    .escolha .chev {
      position: absolute;
      right: 13px;
      top: calc(50% - 8px);
      pointer-events: none;
    }

    .dica {
      margin: 7px 2px 0;
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1.35;
      color: var(--ink-2);
      text-wrap: pretty;
    }
    .field-error {
      margin: 7px 2px 0;
      font-weight: 600;
      font-size: 0.92rem;
      line-height: 1.35;
      color: var(--error-ink);
    }
  `,
})
export class MusicFields {
  private readonly lookup = inject(GameLookup);

  /** O item escolhido, com os campos da música (o tipo, a amostra). */
  readonly game = input.required<PickedGame>();
  readonly gameChange = output<PickedGame>();
  /** O artista: a categoria da ficha (null: sem artista). */
  readonly artist = model<string | null>(null);
  /** Os artistas que o mural já tem, para sugerir. */
  readonly artists = input<readonly string[]>([]);
  /** O item acabou de ser escolhido na busca: um álbum já sai tocando a primeira faixa. */
  readonly fresh = input(false);
  /** A vez que o editor abriu: cada vez recomeça os campos, mesmo com a mesma ficha de antes. */
  readonly session = input(0);

  protected readonly AlbumIcon = Disc3;
  protected readonly SongIcon = Music;
  protected readonly ArtistIcon = MicVocal;
  protected readonly LinkIcon = Link2;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly forms = MUSIC_FORMS;
  protected readonly formLabel = MUSIC_FORM_LABEL;
  protected readonly soundOf = SOUNDS;
  protected readonly artistMax = ARTIST_MAX;
  protected readonly sampleMax = SAMPLE_MAX;
  protected readonly id = `musica-${++uid}`;

  protected readonly form = computed<MusicForm>(() => musicFormOf(this.game()));
  /** Veio do catálogo: ele já diz se é álbum ou música, e tem o que tocar. */
  protected readonly fromCatalog = computed(() => this.game().source === 'itunes');
  /** O item no catálogo (muda quando a pessoa troca de item, não quando mexe nos campos dele). */
  private readonly catalogKey = computed(() => (this.fromCatalog() ? (this.game().sourceId ?? null) : null));
  /** O nome do item: o que foi escrito à mão não tem número no catálogo, e é pelo nome que se vê que trocou. */
  private readonly itemName = computed(() => this.game().name);

  /** O que o catálogo tem para tocar deste item: as faixas do álbum, ou o trecho da música. */
  protected readonly tracks = signal<readonly AlbumTrack[]>([]);
  protected readonly loading = signal(false);
  /** "Um link meu" escolhido, com ou sem um link que toque já escrito. */
  private readonly linking = signal(false);
  /** O link como está escrito no campo (só vai para o item quando é um som que toca). */
  protected readonly linkText = signal('');

  protected readonly sound = computed<Sound>(() => {
    const sample = this.game().sample;
    if (this.linking()) return 'link';
    if (!sample) return 'nada';
    return isCatalogSample(sample) ? 'catalogo' : 'link';
  });
  /** As escolhas: o trecho do catálogo só quando ele tem um. */
  protected readonly sounds = computed<Sound[]>(() => (this.tracks().length ? ['catalogo', 'link', 'nada'] : ['link', 'nada']));

  /** O link escrito não é um som que o site saiba tocar: o que dizer. */
  protected readonly linkProblem = computed(() => {
    const url = this.linkText().trim();
    return this.sound() === 'link' && url && !parseAudio(url) ? (widgetDef('audio')?.problem?.({ url }) ?? 'Esse link não toca aqui.') : null;
  });
  /** O que impede salvar a ficha (para o editor avisar); null, nada. */
  readonly problem = computed(() => this.linkProblem());

  protected readonly artistHint = computed(() => {
    const a = cleanArtist(this.artist() ?? '');
    if (!a) return 'Em branco, a ficha vai para a aba “Sem artista”.';
    const known = this.artists().some((x) => x.localeCompare(a, 'pt-BR', { sensitivity: 'base' }) === 0);
    return known ? `Vai para a aba de ${a}, que o mural já tem.` : 'Abre uma aba nova no mural, só dele.';
  });

  private abort: AbortController | undefined;

  constructor() {
    // o item trocou (ou o editor abriu de novo): o que o catálogo tem para tocar é outro, e o link
    // escrito era do de antes
    effect(() => {
      const key = this.catalogKey();
      this.itemName();
      this.session();
      untracked(() => {
        this.syncLink();
        void this.load(key);
      });
    });
    inject(DestroyRef).onDestroy(() => this.abort?.abort());
  }

  /** O campo do link como o item está: o link dela, se não é do catálogo. */
  private syncLink(): void {
    const sample = this.game().sample;
    this.linking.set(false);
    this.linkText.set(sample && !isCatalogSample(sample) ? sample : '');
  }

  private async load(key: string | null): Promise<void> {
    this.abort?.abort();
    this.tracks.set([]);
    this.loading.set(false);
    if (!key) return;
    const ctrl = new AbortController();
    this.abort = ctrl;
    this.loading.set(true);
    try {
      const found = await this.lookup.sampleChoices(this.game(), ctrl.signal);
      if (ctrl.signal.aborted) return;
      this.tracks.set(found);
      // o álbum recém-escolhido já sai tocando: a primeira faixa, até a pessoa escolher a preferida
      if (this.fresh() && found.length && !this.game().sample && !this.linking() && this.form() === 'album') this.useTrack(found[0].sample);
    } catch {
      // sem o catálogo agora: o link colado continua valendo
    } finally {
      if (!ctrl.signal.aborted) this.loading.set(false);
    }
  }

  protected setForm(form: MusicForm): void {
    if (form !== this.form()) this.gameChange.emit({ ...this.game(), form });
  }

  protected tidyArtist(): void {
    const a = cleanArtist(this.artist() ?? '');
    if (a !== (this.artist() ?? '')) this.artist.set(a || null);
  }

  protected setSound(sound: Sound): void {
    if (sound === 'catalogo') {
      this.linking.set(false);
      const first = this.tracks()[0];
      if (first) this.useTrack(first.sample);
    } else if (sound === 'link') {
      this.linking.set(true);
      this.setLink(this.linkText());
    } else {
      this.linking.set(false);
      this.emitSample(null);
    }
  }

  /** A faixa (pelo trecho dela) que o vinil toca; num álbum, o nome dela vai junto. */
  protected useTrack(sample: string): void {
    const t = this.tracks().find((x) => x.sample === sample);
    if (t) this.emitSample(t.sample, this.form() === 'album' ? t.name : undefined);
  }

  /** O link escrito: vai para o item quando é um som que toca; enquanto não é, o disco fica parado. */
  protected setLink(text: string): void {
    this.linkText.set(text);
    const url = text.trim();
    this.emitSample(url && parseAudio(url) ? url : null);
  }

  private emitSample(sample: string | null, title?: string): void {
    const { sample: was, sampleTitle: wasTitle, ...rest } = this.game();
    if ((was ?? null) === sample && wasTitle === title) return;
    this.gameChange.emit({ ...rest, ...(sample ? { sample } : {}), ...(sample && title ? { sampleTitle: title } : {}) });
  }
}
