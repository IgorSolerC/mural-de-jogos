import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Film, ImageOff, LucideAngularModule } from 'lucide-angular';
import { httpsUrl, parseVideo, readMedia } from '../core/widgets';
import { snapToLines } from './line-snap';

/**
 * Os widgets IMAGEM e VÍDEO (ver core/widgets.ts): uma foto revelada colada na cartolina, levemente
 * torta (o giro vem do link, então é sempre o mesmo), com o brilho do papel fotográfico. A moldura é
 * a borda branca da foto, a polaroide (a legenda escrita na faixa de baixo) ou o recorte rente; nas
 * duas sem faixa, a legenda vai numa etiqueta de papel colada no pé da foto.
 *
 * O vídeo é a foto da capa dele com um adesivo redondo de "tocar": o player (YouTube sem cookies,
 * Vimeo) só carrega quando a pessoa toca, e a foto se endireita para assistir. Um arquivo de vídeo
 * direto (.mp4) já vem com os controles do navegador.
 *
 * A foto é colada (`data-colado`): o estrago da ficha come o papel e a letra, nunca ela.
 *
 * O tamanho (ver note-widget.ts): a peça inteira (a borda, a faixa da polaroide, a etiqueta) tem a
 * altura do tamanho, `--widget-alto`, e a foto fica com o que sobra dela, na proporção da foto,
 * qualquer que seja o tamanho do arquivo; mais larga que a linha, ela encolhe até caber. O vídeo é
 * 16:9 do mesmo jeito.
 */
@Component({
  selector: 'app-glued-media',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = media();
    <figure class="colagem" [class]="'colagem moldura-' + m.frame" [class.tocando]="playing()" [class.e-video]="kind() === 'video'" [style.--giro.deg]="tilt()">
      <span class="foto" data-colado [class.video]="kind() === 'video'" [class.quebrada]="broken()" [class.revelando]="kind() === 'imagem' && !loaded() && !broken()" [style.--prop]="ratio()">
        @if (broken()) {
          <span class="falha">
            <lucide-icon [img]="BrokenIcon" [size]="22" [strokeWidth]="2.2" aria-hidden="true" />
            <span class="falha-nome">{{ broken() }}</span>
            @if (host()) {
              <span class="falha-host">{{ host() }}</span>
            }
          </span>
        } @else if (kind() === 'imagem') {
          <img [src]="m.url" [alt]="m.caption || 'Imagem colada na anotação'" referrerpolicy="no-referrer" decoding="async" (load)="onLoad($event)" (error)="failed.set(true)" />
          <span class="reflexo" aria-hidden="true"></span>
        } @else if (video(); as v) {
          @if (v.kind === 'file') {
            <video class="tocavel" [src]="v.url" controls preload="metadata" playsinline [attr.aria-label]="m.caption || 'Vídeo'" (error)="failed.set(true)"></video>
          } @else if (playing() && embed()) {
            <iframe
              class="tocavel"
              [src]="embed()"
              [title]="m.caption || (v.kind === 'youtube' ? 'Vídeo do YouTube' : 'Vídeo do Vimeo')"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>
          } @else {
            @if (v.kind === 'youtube') {
              <img class="capa" [src]="'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg'" alt="" referrerpolicy="no-referrer" decoding="async" />
            } @else {
              <span class="sem-capa" aria-hidden="true"><lucide-icon [img]="FilmIcon" [size]="34" [strokeWidth]="1.8" /></span>
            }
            <span class="reflexo" aria-hidden="true"></span>
            <!-- o adesivo redondo de tocar, colado no meio da foto -->
            <button type="button" class="tocar tocavel" [attr.aria-label]="'Tocar o vídeo' + (m.caption ? ': ' + m.caption : '')" (click)="play($event)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 5.6c0-.9 1-1.5 1.8-1l9 6.4c.7.5.7 1.5 0 2l-9 6.4c-.8.5-1.8 0-1.8-1z" /></svg>
            </button>
          }
        }
        @if (m.frame === 'polaroid') {
          <figcaption class="legenda-polaroide">{{ m.caption }}</figcaption>
        }
      </span>
      @if (m.frame !== 'polaroid' && m.caption) {
        <!-- sem a faixa da polaroide, a legenda vai numa etiqueta de papel colada no pé da foto -->
        <figcaption class="etiqueta-lugar"><span class="etiqueta" data-colado><span class="etiqueta-papel" aria-hidden="true"></span>{{ m.caption }}</span></figcaption>
      }
    </figure>
  `,
  styles: `
    :host {
      display: block;
      /* a foto ocupa linhas inteiras da pauta (a altura final vem do tamanho dela, ver o construtor) */
      padding: 0.45em 0 0.6em;
      box-sizing: border-box;
      white-space: normal;
      container-type: inline-size;
    }
    /* a altura da foto: a do tamanho, menos o respiro de cima e de baixo, a borda e a legenda
       (--reserva). --pad: a borda da foto dos dois lados, que entra na largura (a foto é border-box) */
    .colagem {
      --pad: 0.68em;
      --reserva: 1.8em;
      --alto-foto: max(1em, calc(var(--widget-alto, 22em) - var(--reserva)));
      display: grid;
      justify-items: start;
      width: fit-content;
      max-width: 100%;
      margin: 0;
    }
    /* a faixa de baixo da polaroide acompanha a foto (no mini, mais fina; nunca menor que a legenda) */
    .colagem.moldura-polaroid {
      --pad: 1.1em;
      --reserva: calc(1.75em + clamp(1.2em, calc(var(--widget-alto, 22em) * 0.16), 2.2em) * var(--letra-tam, 1));
    }
    .colagem.moldura-recorte {
      --pad: 0em;
      --reserva: 1.1em;
    }
    .colagem:has(> .etiqueta-lugar) {
      --reserva: 2.7em;
    }
    .colagem.moldura-recorte:has(> .etiqueta-lugar) {
      --reserva: 2em;
    }

    /* ===== A foto: o papel fotográfico colado, torto, com a sombra rente de quem está colado ===== */
    .foto {
      position: relative;
      display: grid;
      max-width: 100%;
      rotate: var(--giro, -1deg);
      transform-origin: 50% 40%;
      transition: rotate var(--t-physical) var(--ease-physical);
      background: #fbfaf6;
      border-radius: 2px;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.32),
        0 3px 6px -2px rgb(0 0 0 / 0.28);
    }
    .foto {
      box-sizing: border-box;
      padding: 0.34em;
    }
    .moldura-polaroid .foto {
      padding: 0.55em 0.55em 0;
    }
    .moldura-recorte .foto {
      padding: 0;
      background: transparent;
    }
    /* o vídeo não tem tamanho próprio antes de tocar (nem a foto antes de carregar): a figura ocupa a
       linha, e a foto, o que cabe */
    .colagem.e-video,
    .colagem:has(> .revelando) {
      width: auto;
    }
    .tocando .foto {
      rotate: 0deg;
    }
    img,
    video,
    iframe,
    .sem-capa {
      grid-area: 1 / 1;
      display: block;
      max-width: 100%;
      border: 0;
      border-radius: 1px;
    }
    img {
      width: 100%;
      height: auto;
      object-fit: contain;
    }
    /* a foto carregada: a largura que a proporção dela pede para a altura do tamanho, até a da linha */
    .foto:not(.video, .revelando, .quebrada) {
      width: min(100cqw, calc(var(--alto-foto) * var(--prop, 1.333) + var(--pad)));
    }
    /* revelando (carregando): o papel da foto ainda em branco, 4:3, da altura do tamanho. Não é
       .carregando: essa é a global do botão esperando (o aro girando) */
    .revelando {
      width: min(100cqw, calc(var(--alto-foto) * 4 / 3 + var(--pad)));
      aspect-ratio: 4 / 3;
      background: #efe9dc;
    }
    .revelando img {
      opacity: 0;
    }
    /* o vídeo: sempre 16:9, da altura do tamanho (o papel da foto manda na largura) */
    .foto.video {
      width: min(100cqw, calc(var(--alto-foto) * 16 / 9 + var(--pad)));
    }
    .video img.capa,
    .video video,
    .video iframe,
    .video .sem-capa {
      width: 100%;
      max-height: none;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      background: #151515;
    }
    .video .sem-capa {
      display: grid;
      place-items: center;
      color: rgb(243 236 224 / 0.45);
    }
    /* o brilho do papel fotográfico, de cima, como o do plástico das capas. Não é .brilho: essa é a
       global das faíscas da nota alta (um quadradinho de 15px que pisca) */
    .reflexo {
      grid-area: 1 / 1;
      pointer-events: none;
      border-radius: 1px;
      background: linear-gradient(118deg, transparent 32%, rgb(255 255 255 / 0.16) 44%, transparent 56%, transparent 70%, rgb(255 255 255 / 0.07) 78%, transparent 86%);
    }

    /* ===== O adesivo de tocar: uma etiqueta redonda vermelha, com a borda branca do corte ===== */
    .tocar {
      /* do tamanho do vídeo: no mini, não cobre a foto toda */
      --d: min(3.1em, calc(var(--alto-foto) * 0.5));
      grid-area: 1 / 1;
      place-self: center;
      display: grid;
      place-items: center;
      width: var(--d);
      height: var(--d);
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #e4473f, #b81d1c 70%);
      color: #fbfaf6;
      rotate: -8deg;
      box-shadow:
        0 0 0 3px #fbfaf6,
        0 3px 6px 2px rgb(0 0 0 / 0.38);
      cursor: pointer;
      transition: scale var(--t-ui) var(--ease-ui);
    }
    .tocar svg {
      width: calc(var(--d) * 0.47);
      height: calc(var(--d) * 0.47);
      margin-left: calc(var(--d) * 0.045);
      fill: currentColor;
    }
    .tocar:hover {
      scale: 1.08;
    }
    .tocar:active {
      scale: 0.97;
    }
    .tocar:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 4px;
    }

    /* ===== As legendas: na faixa da polaroide (a caneta de quem revelou) ou numa etiqueta ===== */
    .legenda-polaroide {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: clamp(1.25em, calc(var(--widget-alto, 22em) * 0.16), 2.3em);
      max-width: 100%;
      width: 0;
      min-width: 100%;
      padding: 0 0.3em;
      box-sizing: border-box;
      color: #151515;
      font-family: var(--f-hand);
      font-size: calc(0.95em * var(--letra-tam, 1));
      line-height: 1.15;
      text-align: center;
      overflow-wrap: anywhere;
    }
    /* no mini, a polaroide é estreita demais para a legenda quebrar: uma linha, com reticências */
    :host-context(.tam-mini) .legenda-polaroide {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      align-content: center;
    }
    /* a etiqueta: um pedaço de papel branco recortado e colado meio por cima do pé da foto, torto
       para o outro lado. O lugar dela tem a largura da foto (a legenda não alarga a foto); ela, a do
       que está escrito, e pode passar da foto estreita (em pé) para o lado, até quebrar a linha */
    .etiqueta-lugar {
      position: relative;
      z-index: 1;
      width: 0;
      min-width: 100%;
      margin-top: -0.7em;
      padding: 0 0.5em 0 0.8em;
      box-sizing: border-box;
    }
    .etiqueta {
      position: relative;
      display: inline-block;
      width: max-content;
      max-width: max(100%, 12em);
      padding: 0.28em 0.6em 0.22em;
      box-sizing: border-box;
      color: #151515;
      font-family: var(--f-hand);
      font-size: calc(0.9em * var(--letra-tam, 1));
      line-height: 1.25;
      overflow-wrap: anywhere;
      rotate: calc(var(--giro, -1deg) * -1.4);
      isolation: isolate;
      /* a sombra fica aqui, e o corte no papel: o corte cortaria a sombra junto */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 2px 3px rgb(0 0 0 / 0.16));
    }
    .etiqueta-papel {
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        /* a fibra do papel, quase nada */
        repeating-linear-gradient(94deg, rgb(0 0 0 / 0.018) 0 1px, transparent 1px 4px),
        #fbfaf6;
      /* o corte de tesoura: as quinas não saem retas */
      clip-path: polygon(0.6% 3%, 99% 0, 100% 96%, 1.2% 100%);
    }

    /* ===== Não abriu: o lugar da foto, tracejado ===== */
    .quebrada {
      background: transparent;
      box-shadow: none;
      border: 2px dashed color-mix(in srgb, currentColor 45%, transparent);
      rotate: 0deg;
    }
    .falha {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0 0.6em;
      padding: 0.3em 0.6em;
    }
    .falha lucide-icon {
      grid-row: span 2;
      opacity: 0.7;
    }
    .falha-nome {
      font-family: var(--f-marker);
      font-size: 0.95em;
    }
    .falha-host {
      font-family: var(--f-ui);
      font-size: 0.8em;
      opacity: 0.86;
      overflow-wrap: anywhere;
    }
    @media (prefers-reduced-motion: reduce) {
      .foto {
        transition: none;
      }
    }
  `,
})
export class GluedMedia {
  readonly kind = input.required<'imagem' | 'video'>();
  /** Os parâmetros como foram escritos no texto. */
  readonly args = input.required<readonly string[]>();

  protected readonly BrokenIcon = ImageOff;
  protected readonly FilmIcon = Film;
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly media = computed(() => readMedia(this.args()));
  // de cada link: trocar o link (digitando, ou consertando um erro) começa de novo, sem o "não abriu"
  // do link de antes nem o vídeo dele tocando
  private readonly url = computed(() => this.media().url);
  /** Do link, e só dele: mexer na legenda não remonta o player (ele recarregaria e começaria de novo). */
  protected readonly video = computed(() => (this.kind() === 'video' ? parseVideo(this.url()) : null));
  protected readonly loaded = linkedSignal({ source: this.url, computation: () => false });
  protected readonly failed = linkedSignal({ source: this.url, computation: () => false });
  protected readonly playing = linkedSignal({ source: this.url, computation: () => false });
  /** A largura sobre a altura da foto, quando ela chega (a largura da foto sai dela). */
  protected readonly ratio = linkedSignal<string, number | null>({ source: this.url, computation: () => null });

  /** O que não deixa a foto aparecer (sem link, link sem https, vídeo que não toca aqui, não abriu). */
  protected readonly broken = computed(() => {
    const { url } = this.media();
    if (!url) return this.kind() === 'video' ? 'Vídeo sem link' : 'Imagem sem link';
    if (!httpsUrl(url)) return 'O link precisa começar com https://';
    if (this.kind() === 'video' && !this.video()) return 'Esse vídeo não toca aqui';
    if (this.failed()) return this.kind() === 'video' ? 'O vídeo não abriu' : 'A imagem não abriu';
    return '';
  });
  protected readonly host = computed(() => {
    try {
      return new URL(this.media().url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  });

  /** O giro da foto, do link: entre 0,6 e 1,8 grau, para um lado ou para o outro. */
  protected readonly tilt = computed(() => {
    let h = 0;
    for (const ch of this.media().url) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const mag = 0.6 + (Math.abs(h) % 120) / 100;
    return h & 1 ? mag : -mag;
  });

  /** O endereço do player, montado só a partir do id conferido (nunca o link como foi escrito). */
  protected readonly embed = computed<SafeResourceUrl | null>(() => {
    const v = this.video();
    if (!v || v.kind === 'file') return null;
    const url =
      v.kind === 'youtube'
        ? `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1${v.start ? `&start=${v.start}` : ''}`
        : `https://player.vimeo.com/video/${v.id}?autoplay=1&dnt=1${v.hash ? `&h=${v.hash}` : ''}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    // a altura inteira, em linhas da pauta: o texto de baixo continua em cima das linhas azuis
    snapToLines('.colagem');
  }

  protected onLoad(e: Event): void {
    const img = e.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) this.ratio.set(img.naturalWidth / img.naturalHeight);
    this.loaded.set(true);
  }

  protected play(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.playing.set(true);
  }
}
