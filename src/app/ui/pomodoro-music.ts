import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DEFAULT_MUSIC } from '../core/pomodoro';
import { MusicSource, TrackPlace, isPlaylist, musicOf } from '../core/pomodoro-tracks';
import { PomodoroTracks } from '../core/pomodoro-tracks-store';
import { soundVolume } from '../core/volume';
import { EmbedBridge, EmbedReport } from './embed-bridge';

/** Quanto tempo a música leva para sumir na pausa e voltar no estudo. */
const FADE_MS = 1500;
const FADE_STEP_MS = 100;
/** Pediu para tocar e o tempo não andou nisso: o navegador segurou o som (falta um clique na página). */
const BLOCKED_MS = 3500;
/** De quanto em quanto tempo, tocando, a música guarda onde está (e sempre na troca de vídeo, ao parar e ao fechar a aba). */
const PLACE_EVERY_MS = 60_000;
/** Quantos vídeos seguidos de uma playlist podem não tocar antes de ela contar como fora do ar. */
const MAX_SKIPS = 5;

/** O link que toca: o da pessoa, se o site souber tocar, senão a música padrão. */
export function musicSource(url: string): MusicSource {
  return musicOf(url) ?? (musicOf(DEFAULT_MUSIC) as MusicSource);
}

/**
 * O endereço do player do YouTube. Com uma lista, o player segue nela, um vídeo depois do outro, como um áudio só:
 * a playlist de verdade volta ao primeiro vídeo quando acaba (`loop=1`), e a rádio de um vídeo (`RD…`) não acaba.
 * Sem lista, o vídeo repete. Com `place`, começa de onde parou: o vídeo da playlist e o segundo.
 */
export function youtubeEmbed(s: Extract<MusicSource, { kind: 'youtube' }>, place: TrackPlace | null, origin: string): string {
  const video = (s.list && place?.video) || s.id;
  const at = place ? Math.floor(place.t) : s.start;
  const p = new URLSearchParams({ enablejsapi: '1', autoplay: '0', controls: '0', disablekb: '1', playsinline: '1', rel: '0' });
  if (s.list) {
    p.set('list', s.list);
    if (place?.video) p.set('index', String(place.index));
    if (isPlaylist(s)) p.set('loop', '1');
  } else if (s.id) {
    p.set('loop', '1');
    p.set('playlist', s.id);
  }
  p.set('origin', origin);
  if (at > 0) p.set('start', String(at));
  return `https://www.youtube-nocookie.com/embed/${video ?? 'videoseries'}?${p.toString()}`;
}

/**
 * A música do estudo do Pomodoro (PLANO-POMODORO.md, seção 7): um player escondido, o `<audio>` do navegador
 * para um arquivo ou o player do YouTube/Vimeo num iframe, pela mesma conversa do widget Áudio
 * (ui/embed-bridge.ts). `playing` diz se é para tocar agora: na pausa a música some em 1,5 s e para; na volta,
 * continua de onde parou e sobe em 1,5 s. O volume é o do site (core/volume.ts).
 *
 * Uma playlist do YouTube toca inteira, um vídeo depois do outro, e volta ao começo no fim. Onde a música está
 * (o vídeo da playlist e o segundo) fica guardado na música da lista (`trackId`, core/pomodoro-tracks-store.ts),
 * para ela continuar dali quando tocar de novo, também depois de recarregar.
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
        <audio #sound class="motor" [src]="s.url" loop preload="auto" (loadeddata)="fileReady()" (playing)="onReport({ state: 'playing' })" (timeupdate)="fileTime()" (error)="onReport({ error: true })"></audio>
      } @else {
        <!-- um iframe novo para cada link: trocar o endereço do mesmo iframe deixava o player novo sem conversa -->
        @for (e of [embed()]; track e) {
          <iframe #frame class="motor" [src]="e" title="" tabindex="-1" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" (load)="bridge?.loaded()"></iframe>
        }
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
  /** A música da lista que toca (null: a rádio de sempre, fora da lista): guarda onde ela parou. */
  readonly trackId = input<string | null>(null);
  /** Tocar agora (estudo andando); senão, some e para. */
  readonly playing = input(false);
  /** O navegador segurou o som: falta um clique na página. */
  readonly blocked = output<boolean>();
  /** O link não tocou (o vídeo saiu do ar, o arquivo não abre). */
  readonly failed = output<void>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly tracks = inject(PomodoroTracks);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly sound = viewChild<ElementRef<HTMLAudioElement>>('sound');

  protected readonly source = computed(() => musicSource(this.url()));
  protected bridge: EmbedBridge | null = null;

  protected readonly embed = computed<SafeResourceUrl | null>(() => {
    const s = this.source();
    if (s.kind === 'file') return null;
    const url =
      s.kind === 'youtube'
        ? youtubeEmbed(s, untracked(() => this.placeOf(this.trackId())), location.origin)
        : `https://player.vimeo.com/video/${s.id}?autoplay=0&loop=1&dnt=1&controls=0&playsinline=1${s.hash ? `&h=${s.hash}` : ''}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  /** O volume que o player tem agora (de 0 a 1), andando no esmaecer. */
  private level = 0;
  private fader = 0;
  private waitTimer = 0;
  /** Já tocou de verdade desde o último pedido. */
  private heard = false;
  private wantPlay = false;
  /** Onde a música está agora, de que música da lista, e quando foi guardado por último. */
  private here: TrackPlace = { video: null, index: 0, t: 0 };
  private hereOf: string | null = null;
  private toldAt = 0;
  /** Andou desde o último aviso. */
  private dirty = false;
  /** Quantos vídeos a playlist tem (0: ainda não disse). */
  private count = 0;
  /** Vídeos da playlist seguidos que não tocaram (o fora do ar, o que não deixa tocar fora do YouTube). */
  private skipped = 0;
  /** O vídeo da playlist que se tentou por último, pulando os que não tocam (-1: nenhum). */
  private tryAt = -1;
  /** Pulou para outro vídeo e o player ficou calado (nem tocou, nem errou de novo): a playlist não toca. */
  private skipTimer = 0;

  constructor() {
    // trocou a música da lista com o mesmo link (o Desfazer de tirar a que tocava): guarda na de antes onde
    // parou, e o mesmo player segue, agora por esta
    effect(() => {
      const id = this.trackId();
      untracked(() => {
        this.tell();
        this.hereOf = id;
      });
    });

    // um player novo para cada link (o de antes some com o iframe, e guarda onde parou)
    effect(() => {
      const s = this.source();
      untracked(() => {
        this.tell();
        const id = this.trackId();
        this.hereOf = id;
        this.bridge?.destroy();
        this.bridge = s.kind === 'file' ? null : new EmbedBridge(s.kind, () => this.frame()?.nativeElement, (r) => this.onReport(r));
        this.level = 0;
        this.heard = false;
        const p = this.placeOf(id);
        this.here = { video: p?.video ?? null, index: p?.index ?? 0, t: p?.t ?? 0 };
        this.toldAt = Date.now();
        this.dirty = false;
        this.count = 0;
        this.skipped = 0;
        this.tryAt = -1;
        clearTimeout(this.skipTimer);
        if (this.wantPlay) queueMicrotask(() => this.play());
      });
    });

    effect(() => {
      const want = this.playing();
      const v = soundVolume();
      untracked(() => this.steer(want, v));
    });

    // a aba que fecha (ou some) guarda onde a música estava
    const hide = () => this.tell();
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', hide);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', hide);
      this.tell();
      clearInterval(this.fader);
      clearTimeout(this.waitTimer);
      clearTimeout(this.skipTimer);
      this.bridge?.destroy();
      this.sound()?.nativeElement.pause();
    });
  }

  /** O clique de "Tocar a música", depois de o navegador segurar o som. */
  retry(): void {
    if (this.wantPlay) this.play();
  }

  /**
   * O arquivo carregou: volta para onde parou (uma vez só) e, se era para estar tocando e o pedido chegou antes de
   * o `<audio>` existir (o primeiro, ou o de um link trocado), toca agora.
   */
  protected fileReady(): void {
    const audio = this.sound()?.nativeElement;
    if (!audio) return;
    if (this.here.t > 0 && audio.currentTime < 1 && (!audio.duration || this.here.t < audio.duration - 1)) audio.currentTime = this.here.t;
    if (this.wantPlay && audio.paused) this.play();
  }

  /** O tempo do arquivo andou. */
  protected fileTime(): void {
    const audio = this.sound()?.nativeElement;
    if (audio && !audio.paused) this.track({ time: audio.currentTime });
  }

  private steer(want: boolean, volume: number): void {
    const was = this.wantPlay;
    this.wantPlay = want;
    if (want && !was) this.play();
    else if (want) this.fadeTo(volume);
    else if (was)
      this.fadeTo(0, () => {
        this.send({ do: 'pause' });
        this.tell();
      });
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

  private placeOf(id: string | null): TrackPlace | null {
    return id ? (this.tracks.tracks().find((t) => t.id === id)?.place ?? null) : null;
  }

  /** Guarda onde a música está, se andou desde a última vez. */
  private tell(): void {
    this.toldAt = Date.now();
    if (!this.dirty) return;
    this.dirty = false;
    if (this.hereOf) this.tracks.setPlace(this.hereOf, { ...this.here });
  }

  /** O que o player conta de onde está: o vídeo da playlist (a troca guarda na hora) e o segundo (de minuto em minuto). */
  private track(r: EmbedReport): void {
    const s = this.source();
    if (s.kind === 'vimeo') return;
    const list = s.kind === 'youtube' && !!s.list;
    // só tocando: o que o player conta ao abrir (antes do play) não apaga onde ela tinha parado
    const changed = list && this.heard && r.video !== undefined && r.video !== this.here.video;
    if (changed) {
      this.here = { video: r.video!, index: r.index ?? this.here.index, t: 0 };
      this.dirty = true;
    } else if (list && this.heard && r.index !== undefined && r.index !== this.here.index) {
      this.here = { ...this.here, index: r.index };
      this.dirty = true;
    }
    // o segundo só conta tocando (o eco do começo, antes do play, não apaga onde parou)
    if (r.time !== undefined && r.time > 0 && this.heard && Math.abs(r.time - this.here.t) >= 1) {
      this.here = { ...this.here, t: r.time };
      this.dirty = true;
    }
    if (r.count !== undefined) this.count = r.count;
    if (changed || Date.now() - this.toldAt >= PLACE_EVERY_MS) this.tell();
  }

  private send(c: { do: 'play' } | { do: 'pause' } | { do: 'volume'; v: number } | { do: 'seek'; t: number } | { do: 'at'; i: number }): void {
    const audio = this.sound()?.nativeElement;
    if (audio) {
      if (c.do === 'play') audio.play().catch(() => this.wantPlay && this.blocked.emit(true));
      else if (c.do === 'pause') audio.pause();
      else if (c.do === 'volume') audio.volume = Math.min(1, Math.max(0, c.v));
      else if (c.do === 'seek') audio.currentTime = c.t;
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
      // um vídeo da playlist que não toca não derruba a playlist: pula para o próximo (e desiste depois de vários)
      clearTimeout(this.skipTimer);
      if (isPlaylist(this.source()) && this.skipped < MAX_SKIPS) {
        this.skipped++;
        // o seguinte ao último tentado (o índice que o player conta anda sozinho e pularia vídeos)
        const next = (this.tryAt >= 0 ? this.tryAt : this.here.index) + 1;
        this.tryAt = this.count ? next % this.count : next;
        this.send({ do: 'at', i: this.tryAt });
        this.skipTimer = window.setTimeout(() => this.failed.emit(), BLOCKED_MS * 2);
        return;
      }
      this.failed.emit();
      return;
    }
    if (r.ready && this.wantPlay) {
      // o pedido de tocar esperou na fila: o volume de agora vai junto
      this.apply(this.level);
    }
    if (r.state === 'playing') {
      this.heard = true;
      this.skipped = 0;
      this.tryAt = -1;
      clearTimeout(this.skipTimer);
      this.blocked.emit(false);
      // tocou com a fase já na pausa (o player demorou): para de novo
      if (!this.wantPlay) this.send({ do: 'pause' });
    }
    this.track(r);
    if (r.state === 'ended' && this.wantPlay) {
      // a playlist acabou (no último vídeo) e o loop do player não voltou: volta ao primeiro; entre um vídeo e
      // outro, o player segue sozinho, e a rádio (RD…) também. O resto volta ao começo (Vimeo antigo)
      const s = this.source();
      if (isPlaylist(s)) {
        if (this.count && this.here.index >= this.count - 1) this.send({ do: 'at', i: 0 });
      } else if (!(s.kind === 'youtube' && s.list)) {
        this.send({ do: 'seek', t: 0 });
        this.send({ do: 'play' });
      }
    }
  }
}
