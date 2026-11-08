import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DEFAULT_MUSIC } from '../core/pomodoro';
import { soundVolume } from '../core/volume';
import { AudioSource, httpsUrl, parseAudio } from '../core/widgets';
import { EmbedBridge, EmbedReport } from './embed-bridge';

/** Quanto tempo a música leva para sumir na pausa e voltar no estudo. */
const FADE_MS = 1500;
const FADE_STEP_MS = 100;
/** Pediu para tocar e o tempo não andou nisso: o navegador segurou o som (falta um clique na página). */
const BLOCKED_MS = 3500;

/** O link que toca: o da pessoa, se o site souber tocar, senão a música padrão. */
export function musicSource(url: string): AudioSource {
  return parseAudio(url) ?? (parseAudio(DEFAULT_MUSIC) as AudioSource);
}

/** A lista do YouTube que o link traz (a rádio da música padrão), para o player continuar nela. */
export function youtubeList(url: string): string | null {
  const href = (parseAudio(url) ? httpsUrl(url) : null) ?? DEFAULT_MUSIC;
  const list = new URL(href).searchParams.get('list');
  return list && /^[\w-]{2,64}$/.test(list) ? list : null;
}

/**
 * A música do estudo do Pomodoro (PLANO-POMODORO.md, seção 7): um player escondido, o `<audio>` do navegador
 * para um arquivo ou o player do YouTube/Vimeo num iframe, pela mesma conversa do widget Áudio
 * (ui/embed-bridge.ts). `playing` diz se é para tocar agora: na pausa a música some em 1,5 s e para; na volta,
 * continua de onde parou e sobe em 1,5 s. O volume é o do site (core/volume.ts).
 *
 * Mora dentro do relógio do canto, que não sai da tela enquanto o Pomodoro está ligado: trocar de página não
 * corta a música.
 */
@Component({
  selector: 'app-pomodoro-music',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (source(); as s) {
      @if (s.kind === 'file') {
        <audio #sound class="motor" [src]="s.url" loop preload="auto" (loadeddata)="fileReady()" (playing)="onReport({ state: 'playing' })" (error)="onReport({ error: true })"></audio>
      } @else {
        <iframe #frame class="motor" [src]="embed()" title="" tabindex="-1" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" (load)="bridge?.loaded()"></iframe>
      }
    }
  `,
  styles: `
    /* o player do YouTube não toca abaixo de 200 × 200: fica do tamanho certo, invisível e atrás de tudo */
    .motor {
      position: fixed;
      right: 0;
      bottom: 0;
      z-index: -1;
      width: 200px;
      height: 200px;
      border: 0;
      opacity: 0;
      pointer-events: none;
    }
  `,
})
export class PomodoroMusic {
  readonly url = input('');
  /** Tocar agora (estudo andando); senão, some e para. */
  readonly playing = input(false);
  /** O navegador segurou o som: falta um clique na página. */
  readonly blocked = output<boolean>();
  /** O link não tocou (o vídeo saiu do ar, o arquivo não abre). */
  readonly failed = output<void>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly sound = viewChild<ElementRef<HTMLAudioElement>>('sound');

  protected readonly source = computed(() => musicSource(this.url()));
  protected bridge: EmbedBridge | null = null;

  protected readonly embed = computed<SafeResourceUrl | null>(() => {
    const s = this.source();
    if (s.kind === 'file') return null;
    let url: string;
    if (s.kind === 'youtube') {
      const list = youtubeList(this.url());
      // com lista (a rádio da música padrão), o player segue nela; sem, o vídeo repete
      const loop = list ? `&list=${encodeURIComponent(list)}` : `&loop=1&playlist=${s.id}`;
      url = `https://www.youtube-nocookie.com/embed/${s.id}?enablejsapi=1&autoplay=0&controls=0&disablekb=1&playsinline=1&rel=0${loop}&origin=${encodeURIComponent(location.origin)}${s.start ? `&start=${s.start}` : ''}`;
    } else {
      url = `https://player.vimeo.com/video/${s.id}?autoplay=0&loop=1&dnt=1&controls=0&playsinline=1${s.hash ? `&h=${s.hash}` : ''}`;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  /** O volume que o player tem agora (de 0 a 1), andando no esmaecer. */
  private level = 0;
  private fader = 0;
  private waitTimer = 0;
  /** Já tocou de verdade desde o último pedido. */
  private heard = false;
  private wantPlay = false;

  constructor() {
    // um player novo para cada link (o de antes some com o iframe)
    effect(() => {
      const s = this.source();
      untracked(() => {
        this.bridge?.destroy();
        this.bridge = s.kind === 'file' ? null : new EmbedBridge(s.kind, () => this.frame()?.nativeElement, (r) => this.onReport(r));
        this.level = 0;
        this.heard = false;
        if (this.wantPlay) queueMicrotask(() => this.play());
      });
    });

    effect(() => {
      const want = this.playing();
      const v = soundVolume();
      untracked(() => this.steer(want, v));
    });

    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.fader);
      clearTimeout(this.waitTimer);
      this.bridge?.destroy();
      this.sound()?.nativeElement.pause();
    });
  }

  /** O clique de "Tocar a música", depois de o navegador segurar o som. */
  retry(): void {
    if (this.wantPlay) this.play();
  }

  /**
   * O arquivo carregou: se era para estar tocando e o pedido chegou antes de o `<audio>` existir (o primeiro,
   * ou o de um link trocado), toca agora.
   */
  protected fileReady(): void {
    const audio = this.sound()?.nativeElement;
    if (audio && this.wantPlay && audio.paused) this.play();
  }

  private steer(want: boolean, volume: number): void {
    const was = this.wantPlay;
    this.wantPlay = want;
    if (want && !was) this.play();
    else if (want) this.fadeTo(volume);
    else if (was) this.fadeTo(0, () => this.send({ do: 'pause' }));
  }

  private play(): void {
    this.heard = false;
    this.apply(this.level);
    this.send({ do: 'play' });
    this.fadeTo(soundVolume());
    clearTimeout(this.waitTimer);
    this.waitTimer = window.setTimeout(() => {
      if (this.wantPlay && !this.heard) this.blocked.emit(true);
    }, BLOCKED_MS);
  }

  private send(c: { do: 'play' } | { do: 'pause' } | { do: 'volume'; v: number } | { do: 'seek'; t: number }): void {
    const audio = this.sound()?.nativeElement;
    if (audio) {
      if (c.do === 'play') audio.play().catch(() => this.wantPlay && this.blocked.emit(true));
      else if (c.do === 'pause') audio.pause();
      else if (c.do === 'volume') audio.volume = Math.min(1, Math.max(0, c.v));
      else audio.currentTime = c.t;
      return;
    }
    this.bridge?.send(c);
  }

  private apply(v: number): void {
    this.level = v;
    this.send({ do: 'volume', v });
  }

  /** Leva o volume até `target` em 1,5 s (ou menos, se já estiver perto). */
  private fadeTo(target: number, then?: () => void): void {
    clearInterval(this.fader);
    const step = Math.max(0.02, 1 / (FADE_MS / FADE_STEP_MS));
    /** Um passo; true quando chegou (e aí o `then` roda, uma vez só). */
    const tick = (): boolean => {
      const diff = target - this.level;
      if (Math.abs(diff) <= step) {
        clearInterval(this.fader);
        this.apply(target);
        then?.();
        return true;
      }
      this.apply(this.level + Math.sign(diff) * step);
      return false;
    };
    if (!tick()) this.fader = window.setInterval(tick, FADE_STEP_MS);
  }

  protected onReport(r: EmbedReport): void {
    if (r.error) {
      this.failed.emit();
      return;
    }
    if (r.ready && this.wantPlay) {
      // o pedido de tocar esperou na fila: o volume de agora vai junto
      this.apply(this.level);
    }
    if (r.state === 'playing') {
      this.heard = true;
      this.blocked.emit(false);
      // tocou com a fase já na pausa (o player demorou): para de novo
      if (!this.wantPlay) this.send({ do: 'pause' });
    }
    // sem lista e sem o loop do player (Vimeo antigo): volta ao começo
    if (r.state === 'ended' && this.wantPlay) {
      this.send({ do: 'seek', t: 0 });
      this.send({ do: 'play' });
    }
  }
}
