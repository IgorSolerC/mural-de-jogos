/**
 * O aquecimento dos players de fora (YouTube, Vimeo) do widget de áudio: o player de quem fica na
 * tela é montado escondido e calado, toca um instante para encher o começo da faixa e volta ao
 * início, parado. Quando a pessoa aperta o play, o som já está ali.
 *
 * Para não pesar:
 * - só aquece quem ficou na tela (um instante, `DWELL`; passar rolando não conta);
 * - um de cada vez, quando o navegador está à toa (`requestIdleCallback`);
 * - no máximo `MAX_HELD` players montados: passando disso, o que saiu da tela há mais tempo é
 *   desmontado (o que está tocando nunca);
 * - nada na conexão lenta ou com economia de dados ligada: aí o player só vem no play, como antes.
 */

export interface Warmable {
  /** Monta o player e o aquece; avise `warmups.done(this)` quando acabar (aquecido ou não). */
  warmUp(): void;
  /** Desmonta o player, se ele não está tocando. Devolve se desmontou. */
  coolDown(): boolean;
}

/** Quanto tempo na tela antes de aquecer (ms). */
const DWELL = 700;
/** Quantos players montados, no máximo, contando os que a pessoa tocou. */
export const MAX_HELD = 4;
/** Desiste de esperar um aquecimento que não acaba (o próximo não fica preso nele). */
const GIVE_UP = 12000;

type Idle = (cb: () => void, opts?: { timeout: number }) => unknown;

const browserIdle: Idle = (cb, opts) => {
  const ric = (window as unknown as { requestIdleCallback?: Idle }).requestIdleCallback;
  return ric ? ric.call(window, cb, opts) : window.setTimeout(cb, 200);
};

export class Warmups {
  /** Desligado nos testes que não querem iframes de verdade. */
  enabled = true;
  private readonly visible = new Set<Warmable>();
  private readonly dwell = new Map<Warmable, number>();
  private waiting: Warmable[] = [];
  /** Os players montados, do que apareceu há mais tempo para o mais recente. */
  private held: Warmable[] = [];
  private busy: Warmable | null = null;
  private giveUp = 0;
  private scheduled = false;

  constructor(private readonly opts: { dwell?: number; idle?: Idle } = {}) {}

  /** Entrou ou saiu da tela. */
  seen(w: Warmable, inView: boolean): void {
    if (inView) {
      this.visible.add(w);
      // o mais recente na tela vai para o fim (é o último a sair)
      if (this.held.includes(w)) this.held = [...this.held.filter((h) => h !== w), w];
      else if (!this.dwell.has(w) && !this.waiting.includes(w) && this.busy !== w) {
        this.dwell.set(
          w,
          window.setTimeout(() => {
            this.dwell.delete(w);
            this.waiting.push(w);
            this.pump();
          }, this.opts.dwell ?? DWELL),
        );
      }
    } else {
      this.visible.delete(w);
      clearTimeout(this.dwell.get(w));
      this.dwell.delete(w);
      this.waiting = this.waiting.filter((x) => x !== w);
      // saiu um da tela: talvez dê lugar a outro que está esperando
      this.pump();
    }
  }

  /** O player foi montado (aquecendo, ou porque a pessoa tocou). */
  mounted(w: Warmable): void {
    this.waiting = this.waiting.filter((x) => x !== w);
    clearTimeout(this.dwell.get(w));
    this.dwell.delete(w);
    if (!this.held.includes(w)) this.held.push(w);
    this.trim(MAX_HELD);
  }

  /** O player foi desmontado (trocou o link, ou deu lugar a outro). */
  unmounted(w: Warmable): void {
    this.held = this.held.filter((x) => x !== w);
    if (this.busy === w) this.done(w);
    else this.pump();
  }

  /** Terminou de aquecer (ou desistiu). */
  done(w: Warmable): void {
    if (this.busy !== w) return;
    this.busy = null;
    clearTimeout(this.giveUp);
    this.pump();
  }

  /** O widget saiu do texto. */
  forget(w: Warmable): void {
    this.seen(w, false);
    this.held = this.held.filter((x) => x !== w);
    if (this.busy === w) this.done(w);
  }

  private slow(): boolean {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return !!c && (!!c.saveData || /(^|-)2g$/.test(c.effectiveType ?? ''));
  }

  /** Desmonta até sobrarem `max`, do que saiu da tela há mais tempo; os da tela ficam. */
  private trim(max: number): void {
    for (const w of [...this.held]) {
      if (this.held.length <= max) return;
      if (!this.visible.has(w) && w.coolDown()) this.held = this.held.filter((x) => x !== w);
    }
  }

  private pump(): void {
    if (!this.enabled || this.busy || this.scheduled || !this.waiting.length || this.slow()) return;
    // o lugar do que vai aquecer
    this.trim(MAX_HELD - 1);
    if (this.held.length >= MAX_HELD) return;
    this.scheduled = true;
    (this.opts.idle ?? browserIdle)(
      () => {
        this.scheduled = false;
        if (this.busy || !this.enabled) return;
        const w = this.waiting.shift();
        if (!w) return;
        this.busy = w;
        this.giveUp = window.setTimeout(() => this.done(w), GIVE_UP);
        w.warmUp();
      },
      { timeout: 2000 },
    );
  }
}

export const warmups = new Warmups();
