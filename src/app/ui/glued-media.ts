import { ApplicationRef, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, EnvironmentInjector, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ICON, IconModule } from './icons';
import { soundVolume } from '../core/volume';
import { hostOf, httpsUrl, inlineField, parseVideo, readMedia } from '../core/widgets';
import { NgTemplateOutlet } from '@angular/common';
import { localImageId } from '../core/images';
import { ImageStore } from '../core/image-store';
import { ImageSync } from '../core/image-sync';
import { EmbedBridge } from './embed-bridge';
import { snapToLines } from './line-snap';
import { VolumeKnob } from './volume-knob';
import { ZoomKnob } from './zoom-knob';
import { pieceLift } from './piece-lift';
import { CloudAccount } from '../core/cloud-account';

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
 * O vídeo toca no volume de todo som do site: com o mouse em cima, o adesivo do alto-falante, no
 * canto da foto, abre o volume (ui/volume-knob.ts); o player obedece por mensagem.
 *
 * A foto e o vídeo se ampliam: com o mouse em cima dela, o broche de ampliar (ui/zoom-knob.ts), no
 * mesmo canto (no vídeo, ao lado do alto-falante). A imagem abre
 * no visor dela (ui/image-viewer.ts, carregado só no toque); o vídeo sobe inteiro para o meio da
 * tela (ui/piece-lift.ts), com a moldura e a etiqueta (a figura toda, reta), e o que estava
 * tocando continua tocando.
 *
 * O tamanho (ver note-widget.ts): a peça inteira (a borda, a faixa da polaroide, a etiqueta) tem a
 * altura do tamanho, `--widget-alto`, e a foto fica com o que sobra dela, na proporção da foto,
 * qualquer que seja o tamanho do arquivo; mais larga que a linha, ela encolhe até caber. O vídeo é
 * 16:9 do mesmo jeito.
 */
@Component({
  selector: 'app-glued-media',
  imports: [IconModule, NgTemplateOutlet, VolumeKnob, ZoomKnob],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = media();
    <figure #colagem class="colagem" data-papel-proprio data-ergue-justo [class]="'colagem moldura-' + m.frame" [class.tocando]="playing()" [class.e-video]="kind() === 'video'" [style.--giro.deg]="tilt()">
      <span #foto class="foto" data-colado data-ergue-giro data-ergue-largura data-ergue-canto [class.video]="kind() === 'video'" [class.som]="!!video() && !broken()" [class.amplia]="!broken()" [class.quebrada]="broken()" [class.revelando]="kind() === 'imagem' && !loaded() && !broken()" [attr.data-esperando]="seeking() ? '' : null" [style.--prop]="ratio()">
        @if (broken()) {
          <span class="falha">
            <lucide-icon [img]="BrokenIcon" [size]="22" aria-hidden="true" />
            <span class="falha-nome">{{ broken() }}</span>
            @if (host()) {
              <span class="falha-host">{{ host() }}</span>
            }
          </span>
        } @else if (kind() === 'imagem') {
          <!-- a guardada pelo Murall espera o endereço dela (um src vazio daria "não abriu") -->
          @if (src()) {
            <img [src]="src()" [alt]="m.caption || 'Imagem colada na anotação'" referrerpolicy="no-referrer" decoding="async" (load)="onLoad($event)" (error)="failed.set(true)" />
          }
          <span class="reflexo" aria-hidden="true"></span>
          @if (loaded()) {
            <app-zoom-knob class="ampliar" [label]="'Ampliar a imagem' + (m.caption ? ': ' + m.caption : '')" (pressed)="zoom()" />
          }
        } @else if (video(); as v) {
          @if (v.kind === 'file') {
            <video #film class="tocavel" [src]="v.url" controls preload="metadata" playsinline [attr.aria-label]="m.caption || 'Vídeo'" (error)="failed.set(true)"></video>
          } @else if (playing() && embed()) {
            <iframe
              #frame
              class="tocavel"
              [src]="embed()"
              [title]="m.caption || (v.kind === 'youtube' ? 'Vídeo do YouTube' : 'Vídeo do Vimeo')"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
              (load)="bridge?.loaded()"
            ></iframe>
          } @else {
            @if (v.kind === 'youtube') {
              <img class="capa" [src]="'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg'" alt="" referrerpolicy="no-referrer" decoding="async" />
            } @else {
              <span class="sem-capa" aria-hidden="true"><lucide-icon [img]="VideoIcon" [size]="34" aria-hidden="true" /></span>
            }
            <span class="reflexo" aria-hidden="true"></span>
            <!-- o adesivo redondo de tocar, colado no meio da foto -->
            <button type="button" class="tocar tocavel" [attr.aria-label]="'Tocar o vídeo' + (m.caption ? ': ' + m.caption : '')" (click)="play($event)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 5.6c0-.9 1-1.5 1.8-1l9 6.4c.7.5.7 1.5 0 2l-9 6.4c-.8.5-1.8 0-1.8-1z" /></svg>
            </button>
          }
        }
        @if (video() && !broken()) {
          <!-- os broches do canto: ampliar e, na quina, o alto-falante -->
          <span class="broches">
            <app-zoom-knob [label]="'Ampliar o vídeo' + (m.caption ? ': ' + m.caption : '')" (pressed)="lift.toggle(colagem)" />
            <app-volume-knob />
          </span>
        }
        @if (m.frame === 'polaroid') {
          <figcaption class="legenda-polaroide">@if (editavel()) {<ng-container *ngTemplateOutlet="campo; context: { $implicit: m.caption }" />} @else {{{ m.caption }}}</figcaption>
        }
      </span>
      @if (m.frame !== 'polaroid' && (m.caption || editavel())) {
        <!-- sem a faixa da polaroide, a legenda vai numa etiqueta de papel colada no pé da foto -->
        <figcaption class="etiqueta-lugar"><span class="etiqueta" data-colado data-ergue-largura><span class="etiqueta-papel" aria-hidden="true"></span>@if (editavel()) {<ng-container *ngTemplateOutlet="campo; context: { $implicit: m.caption }" />} @else {{{ m.caption }}}</span></figcaption>
      }
    </figure>
    <!-- no modo Visual, com a peça selecionada: a legenda vira um campo, com a mesma letra e no mesmo
         lugar (quem grava é a peça do editor, ui/visual-editor/pecas.ts) -->
    <ng-template #campo let-valor>
      <input class="campo-peca" type="text" data-campo="caption" enterkeyhint="done" autocomplete="off" [value]="valor" [attr.maxlength]="inline?.max ?? null" [placeholder]="inline?.inline ?? ''" [attr.aria-label]="kind() === 'video' ? 'Legenda do vídeo' : 'Legenda da imagem'" />
    </ng-template>
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
    /* riscada: a foto embaixo de uma tarefa feita leva um risco de caneta vermelha (a do tique) de
       canto a canto, por cima de tudo e sem pegar o toque. Quem liga é o texto (--riscado: 1, ver
       ui/rich-text.ts); sem ele, o risco não aparece */
    .foto::after {
      content: '';
      position: absolute;
      inset: 6% 5%;
      z-index: 4;
      pointer-events: none;
      opacity: var(--riscado, 0);
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpath d='M3 94C24 77 41 58 60 40S86 13 97 5' fill='none' stroke='%23c4302b' stroke-width='3.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E")
        center / 100% 100% no-repeat;
      filter: drop-shadow(0 0 1px rgb(255 255 255 / 0.7));
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

    /* ===== Os broches no canto de cima da foto, à direita: ampliar (ui/zoom-knob.ts) e, no
       vídeo, o alto-falante na quina, com o de ampliar ao lado ===== */
    .ampliar,
    .broches {
      grid-area: 1 / 1;
      place-self: start end;
      position: relative;
      z-index: 2;
      margin: 8px;
    }
    .broches {
      display: flex;
      gap: 6px;
    }
    /* no alto, o player grande tem os botões dele no canto: o alto-falante sai da foto e fica
       pendurado na beirada de cima, ao lado do X (do tamanho de sempre: a peça cresce com o zoom e
       os broches não) */
    .erguida .broches {
      /* (sem a área da grade: o canto é o da foto, não o de dentro da borda branca) */
      grid-area: auto;
      position: absolute;
      top: calc(-13px / var(--erguida-zoom, 1));
      right: calc(23px / var(--erguida-zoom, 1));
      margin: 0;
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
  /**
   * No modo Visual, a peça selecionada: a legenda vira um campo para escrever direto (sem legenda, o
   * lugar dela com o convite). Sem isto, nada muda: a peça é a da leitura.
   */
  readonly editavel = input(false);
  /** O campo da legenda no registro (o limite de letras e o convite). */
  protected readonly inline = inlineField('imagem');

  protected readonly BrokenIcon = ICON.semImagem;
  protected readonly VideoIcon = ICON.video;
  /** O vídeo no meio da tela. */
  protected readonly lift = pieceLift();
  private readonly sanitizer = inject(DomSanitizer);
  private readonly env = inject(EnvironmentInjector);
  private readonly app = inject(ApplicationRef);

  protected readonly media = computed(() => readMedia(this.args()));
  private readonly images = inject(ImageStore);
  private readonly imageSync = inject(ImageSync);
  private readonly account = inject(CloudAccount);
  /** A imagem guardada pelo Murall (`murall://imagem/ID`, ver core/images.ts), ou null (um link comum). */
  private readonly localId = computed(() => (this.kind() === 'imagem' ? localImageId(this.media().url) : null));
  /**
   * O endereço `blob:` da guardada, quando ela chega do IndexedDB; `undefined` enquanto procura, null se
   * ela não está neste aparelho (colada em outro, e ainda não veio da nuvem).
   */
  private readonly localSrc = signal<string | null | undefined>(undefined);
  /** O que vai no `<img>`: o link, ou o endereço da guardada. */
  protected readonly src = computed(() => (this.localId() ? (this.localSrc() ?? '') : this.media().url));
  /** A guardada ainda procurando o endereço (no aparelho, ou descendo da nuvem): o PDF espera (ui/pdf-sheet.ts). */
  protected readonly seeking = computed(() => !!this.localId() && this.localSrc() === undefined);
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
    if (this.localId()) {
      if (this.localSrc() === null) return 'A imagem ainda não chegou a este aparelho';
      // a da nuvem sem conta: a nuvem só entrega a que está à mostra
      if (this.failed()) return this.localSrc()?.startsWith('http') ? 'Esta imagem não está à mostra' : 'A imagem não abriu';
      return '';
    }
    if (!httpsUrl(url)) return 'O link precisa começar com https://';
    if (this.kind() === 'video' && !this.video()) return 'Esse vídeo não toca aqui';
    if (this.failed()) return this.kind() === 'video' ? 'O vídeo não abriu' : 'A imagem não abriu';
    return '';
  });
  protected readonly host = computed(() => (this.localId() ? '' : hostOf(this.media().url)));

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
    // com o site calado, o vídeo já começa calado (o volume de agora: mudar depois não recarrega)
    const quiet = untracked(soundVolume) === 0;
    const url =
      v.kind === 'youtube'
        ? `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}${quiet ? '&mute=1' : ''}${v.start ? `&start=${v.start}` : ''}`
        : `https://player.vimeo.com/video/${v.id}?autoplay=1&dnt=1${quiet ? '&muted=1' : ''}${v.hash ? `&h=${v.hash}` : ''}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  private readonly photo = viewChild<ElementRef<HTMLElement>>('foto');
  private readonly film = viewChild<ElementRef<HTMLVideoElement>>('film');
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  /** A conversa com o player de fora, enquanto ele toca (só para o volume). */
  protected bridge: EmbedBridge | null = null;

  constructor() {
    // a altura inteira, em linhas da pauta: o texto de baixo continua em cima das linhas azuis
    snapToLines('.colagem');
    // a guardada pelo Murall: procura no IndexedDB; sem ela aqui, desce da nuvem (com a sessão) e fica
    // guardada; de novo quando outra imagem é guardada nesta aba ou a sincronização termina uma rodada
    effect((onCleanup) => {
      const id = this.localId();
      this.images.version();
      this.imageSync.round();
      this.account.signedIn();
      if (!id) return untracked(() => this.localSrc.set(undefined));
      let alive = true;
      onCleanup(() => (alive = false));
      const signedIn = this.account.signedIn();
      void this.images
        .url(id)
        .then((url) => url ?? (signedIn ? this.imageSync.fetch(id) : null))
        // sem conta (a visita a um mural público): o endereço da nuvem, num <img> comum
        .then((url) => url ?? (signedIn ? null : this.imageSync.publicUrl(id)))
        .then((url) => alive && this.localSrc.set(url));
    });
    // o player de fora entrou (ou saiu, trocando o link): a conversa com ele começa de novo
    effect(() => {
      const v = this.video();
      const kind = this.playing() && v && v.kind !== 'file' ? v.kind : null;
      untracked(() => {
        this.bridge?.destroy();
        this.bridge = kind ? new EmbedBridge(kind, () => this.frame()?.nativeElement, (r) => r.ready && this.bridge?.send({ do: 'volume', v: soundVolume() })) : null;
      });
    });
    // o volume do site, na hora
    effect(() => {
      const v = soundVolume();
      const film = this.film()?.nativeElement;
      untracked(() => {
        if (film) film.volume = v;
        if (this.bridge?.isReady) this.bridge.send({ do: 'volume', v });
      });
    });
    inject(DestroyRef).onDestroy(() => this.bridge?.destroy());
  }

  protected onLoad(e: Event): void {
    const img = e.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) this.ratio.set(img.naturalWidth / img.naturalHeight);
    this.loaded.set(true);
  }

  /** Amplia a foto no meio da tela (o visor só carrega agora, no primeiro toque). */
  protected zoom(): void {
    const from = this.photo()?.nativeElement;
    if (!from) return;
    const { caption, frame } = this.media();
    // a guardada pelo Murall abre pelo endereço dela nesta aba
    const url = this.src();
    const ratio = this.ratio() ?? 4 / 3;
    const file = from.querySelector('img')?.naturalWidth ?? 0;
    const natural = file && Math.max(file, from.offsetWidth * 1.5);
    void import('./image-viewer').then((m) => m.showImage({ url, caption, frame, ratio, natural, from }, this.env, this.app));
  }

  protected play(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.playing.set(true);
  }
}
