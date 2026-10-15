/**
 * A conversa com um player de fora (YouTube, Vimeo) num iframe, por mensagem: o aperto de mão do
 * começo, os pedidos guardados até ele ficar pronto, e o que ele conta, traduzido para um formato só.
 * Usada pelo widget de áudio (que toca o som escondido) e pelo de vídeo (que só ajusta o volume).
 */

export type EmbedKind = 'youtube' | 'vimeo';

/** O que se pede ao player. O volume vai de 0 a 1; em 0, ele fica calado. */
export type EmbedCommand = { do: 'play' } | { do: 'pause' } | { do: 'seek'; t: number } | { do: 'volume'; v: number };

/**
 * O que o player conta. `playing` vem só quando o tempo anda de verdade (o "play" do Vimeo chega
 * antes do som, ainda carregando: esse é `waiting`).
 */
export interface EmbedReport {
  ready?: true;
  state?: 'playing' | 'waiting' | 'paused' | 'ended';
  time?: number;
  duration?: number;
  error?: true;
}

let uid = 0;

export class EmbedBridge {
  private readonly id = ++uid;
  private ready = false;
  private heard = false;
  private queue: EmbedCommand[] = [];
  private listen = 0;
  /** O Vimeo disse "play" e o tempo ainda não andou. */
  private vimeoAsked = false;
  private vimeoAt = -1;
  /** O Vimeo está tocando (o fim de um carregamento no meio da faixa volta a tocar). */
  private vimeoPlaying = false;

  constructor(
    readonly kind: EmbedKind,
    private readonly frame: () => HTMLIFrameElement | undefined,
    private readonly report: (r: EmbedReport) => void,
  ) {
    window.addEventListener('message', this.onMessage);
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** O iframe carregou: começa o aperto de mão. */
  loaded(): void {
    if (this.kind === 'vimeo') {
      for (const ev of ['play', 'pause', 'ended', 'timeupdate', 'bufferstart', 'bufferend', 'error']) this.post({ method: 'addEventListener', value: ev });
      this.post({ method: 'getDuration' });
      return;
    }
    // o YouTube só começa a contar o que acontece depois de ouvir "listening" (repetido até ele responder)
    let tries = 0;
    clearInterval(this.listen);
    const hello = () => {
      if (this.heard || ++tries > 40) return clearInterval(this.listen);
      this.post({ event: 'listening', id: this.id, channel: 'widget' });
    };
    hello();
    this.listen = window.setInterval(hello, 250);
  }

  /** Pede ao player (antes de ele ficar pronto, o pedido espera na fila). */
  send(c: EmbedCommand): void {
    if (!this.ready) {
      // da fila, só o último de cada tipo vale (dois volumes, ou tocar e parar, não se somam)
      this.queue = this.queue.filter((q) => q.do !== c.do && !(c.do === 'play' && q.do === 'pause') && !(c.do === 'pause' && q.do === 'play'));
      this.queue.push(c);
      return;
    }
    if (this.kind === 'youtube') {
      const call = (func: string, args: unknown[] = []) => this.post({ event: 'command', func, args, id: this.id, channel: 'widget' });
      if (c.do === 'play') call('playVideo');
      else if (c.do === 'pause') call('pauseVideo');
      else if (c.do === 'seek') call('seekTo', [c.t, true]);
      else if (c.v <= 0) call('mute');
      else {
        call('unMute');
        call('setVolume', [Math.round(c.v * 100)]);
      }
    } else {
      if (c.do === 'seek') this.post({ method: 'setCurrentTime', value: c.t });
      else if (c.do === 'volume') {
        this.post({ method: 'setMuted', value: c.v <= 0 });
        if (c.v > 0) this.post({ method: 'setVolume', value: c.v });
      } else this.post({ method: c.do });
    }
  }

  destroy(): void {
    window.removeEventListener('message', this.onMessage);
    clearInterval(this.listen);
    this.queue = [];
  }

  private readonly onMessage = (e: MessageEvent): void => {
    const frame = this.frame();
    if (!frame || e.source !== frame.contentWindow) return;
    let d: unknown = e.data;
    if (typeof d === 'string') {
      try {
        d = JSON.parse(d);
      } catch {
        return;
      }
    }
    if (!d || typeof d !== 'object') return;
    this.heard = true;
    if (this.kind === 'youtube') this.fromYoutube(d as YoutubeMessage);
    else this.fromVimeo(d as VimeoMessage);
  };

  private fromYoutube(d: YoutubeMessage): void {
    if (d.event === 'onReady' || d.event === 'initialDelivery') {
      if (!this.ready) for (const ev of ['onStateChange', 'onError']) this.post({ event: 'command', func: 'addEventListener', args: [ev], id: this.id, channel: 'widget' });
      this.becomeReady();
    }
    if (d.event === 'onError') {
      this.report({ error: true });
      return;
    }
    const info = d.event === 'onStateChange' ? { playerState: d.info as number } : d.event === 'infoDelivery' || d.event === 'initialDelivery' ? (d.info as YoutubeInfo | null) : null;
    if (!info) return;
    const r: EmbedReport = {};
    if (typeof info.duration === 'number' && info.duration > 0) r.duration = info.duration;
    if (typeof info.currentTime === 'number') r.time = info.currentTime;
    // 1 tocando, 3 carregando, 2 parado, 0 acabou (−1 e 5: ainda não começou)
    const st = info.playerState;
    if (st === 1) r.state = 'playing';
    else if (st === 3) r.state = 'waiting';
    else if (st === 2) r.state = 'paused';
    else if (st === 0) r.state = 'ended';
    if (r.duration !== undefined || r.time !== undefined || r.state) this.report(r);
  }

  private fromVimeo(d: VimeoMessage): void {
    if (d.event === 'ready') {
      this.loaded();
      this.becomeReady();
    }
    if (d.method === 'getDuration' && typeof d.value === 'number' && d.value > 0) this.report({ duration: d.value });
    const data = d.data;
    const r: EmbedReport = {};
    if (data && typeof data.duration === 'number' && data.duration > 0) r.duration = data.duration;
    if ((d.event === 'timeupdate' || d.event === 'playProgress') && data && typeof data.seconds === 'number') {
      r.time = data.seconds;
      // pediu para tocar e o tempo andou: agora, sim, está tocando
      if (this.vimeoAsked && data.seconds !== this.vimeoAt) {
        this.vimeoAsked = false;
        this.vimeoPlaying = true;
        r.state = 'playing';
      }
    }
    if (d.event === 'play') {
      this.vimeoAsked = true;
      this.vimeoAt = typeof data?.seconds === 'number' ? data.seconds : -1;
      r.state = 'waiting';
    } else if (d.event === 'bufferstart' && this.vimeoPlaying) r.state = 'waiting';
    else if (d.event === 'bufferend' && this.vimeoPlaying) r.state = 'playing';
    else if (d.event === 'pause' || d.event === 'ended') {
      this.vimeoAsked = false;
      this.vimeoPlaying = false;
      r.state = d.event === 'pause' ? 'paused' : 'ended';
    } else if (d.event === 'error') {
      this.report({ error: true });
      return;
    }
    if (r.duration !== undefined || r.time !== undefined || r.state) this.report(r);
  }

  private becomeReady(): void {
    if (this.ready) return;
    this.ready = true;
    this.report({ ready: true });
    const q = this.queue;
    this.queue = [];
    for (const c of q) this.send(c);
  }

  private post(msg: object): void {
    const win = this.frame()?.contentWindow;
    if (!win) return;
    if (this.kind === 'youtube') win.postMessage(JSON.stringify(msg), 'https://www.youtube-nocookie.com');
    else win.postMessage(msg, 'https://player.vimeo.com');
  }
}

interface YoutubeInfo {
  currentTime?: number;
  duration?: number;
  playerState?: number;
}
interface YoutubeMessage {
  event?: string;
  info?: unknown;
}
interface VimeoMessage {
  event?: string;
  method?: string;
  value?: unknown;
  data?: { seconds?: number; duration?: number } | null;
}
