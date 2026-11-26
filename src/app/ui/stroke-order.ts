import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { reducedMotion } from '../core/motion';

/** Os traços de um caractere (do KanjiVG, no quadro de 109): o `d` de cada um e onde fica o número dele. */
export interface Strokes {
  s: string[];
  n: [number, number][];
}

export type Speed = 0.5 | 1 | 2;

/** Quanto tempo um traço leva para ser desenhado, por unidade de comprimento (no quadro de 109), na velocidade 1. */
export const MS_PER_UNIT = 9;
/** O respiro entre um traço e o próximo. */
export const PAUSE_MS = 220;

/**
 * A ordem dos traços desenhada (a Ordem da lousa, ui/word-board.ts, e o quadrado certo do Escrever à mão do Treino,
 * ui/word-drill.ts): o caractere apagado por baixo, os traços já feitos em tinta (o último passo a passo em vermelho), o
 * que está sendo desenhado em vermelho e o número de cada um em vermelho, com o halo do papel. Só desenha: quem toca é
 * o `StrokePlayer`.
 */
@Component({
  selector: 'app-stroke-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 109 109" [attr.role]="label() ? 'img' : null" [attr.aria-label]="label() || null" [attr.aria-hidden]="label() ? null : 'true'">
      @for (p of strokes().s; track $index) {
        <path class="fantasma" [attr.d]="p" />
      }
      @for (p of strokes().s; track $index; let i = $index) {
        @if (i < shown()) {
          <path class="feito" [class.ultimo]="markLast() && i === shown() - 1 && drawing() === null" [attr.d]="p" />
        } @else if (i === drawing()) {
          <path class="tracando" [attr.d]="p" pathLength="1" [attr.data-tracando]="i" />
        }
      }
      @for (n of strokes().n; track $index; let i = $index) {
        @if (i < shown() || i === drawing()) {
          <text class="numero" [attr.x]="n[0]" [attr.y]="n[1]">{{ i + 1 }}</text>
        }
      }
    </svg>
  `,
  styles: `
    :host {
      --shu: #b42a20;
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    path {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .fantasma {
      stroke: rgb(21 21 21 / 0.09);
      stroke-width: 5;
    }
    .feito {
      stroke: var(--ink);
      stroke-width: 5;
      transition: stroke 400ms var(--ease-ui);
    }
    /* o que acabou de ser feito passo a passo fica vermelho, como na tabela */
    .feito.ultimo {
      stroke: var(--shu);
    }
    .tracando {
      stroke: var(--shu);
      stroke-width: 5.4;
      stroke-dasharray: 1;
      stroke-dashoffset: 0;
    }
    .numero {
      fill: var(--shu);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 6.4px;
      paint-order: stroke;
      stroke: #fbf8ef;
      stroke-width: 1.8px;
    }
    @media (prefers-reduced-motion: reduce) {
      .feito {
        transition: none;
      }
    }
  `,
})
export class StrokeOrder {
  readonly strokes = input.required<Strokes>();
  /** Quantos traços já estão inteiros (0 a N). */
  readonly shown = input(0);
  /** O que está sendo desenhado agora (o índice), ou null. */
  readonly drawing = input<number | null>(null);
  /** O último feito em vermelho (o passo a passo da lousa). */
  readonly markLast = input(true);
  /** O que o leitor de tela diz; sem, o desenho fica fora da leitura. */
  readonly label = input('');
}

/**
 * Quem toca a ordem dos traços: desenha os que faltam um a um, no tempo do comprimento de cada um (pela velocidade),
 * com um respiro entre eles; pausa, anda um traço, recomeça. Cada rodada tem um número: mudar de caractere, pausar ou
 * fechar cancela a de antes. O traço que se desenha é o `path[data-tracando]` de `root` (o `StrokeOrder` dele).
 */
export class StrokePlayer {
  readonly shown = signal(0);
  readonly drawing = signal<number | null>(null);
  readonly playing = signal(false);
  readonly speed = signal<Speed>(1);
  readonly total = computed(() => this.data()?.s.length ?? 0);
  private run = 0;
  private current: Animation | null = null;

  constructor(
    private readonly data: () => Strokes | null,
    private readonly root: () => ParentNode | null,
    readonly reduced = reducedMotion(),
  ) {}

  toggle(): void {
    if (this.playing()) this.stop();
    else void this.play();
  }

  /** Desenha os traços que faltam, um a um, desde onde está (do começo, se já acabou). Resolve quando acaba (ou para). */
  async play(): Promise<boolean> {
    const d = this.data();
    if (!d) return false;
    this.stop();
    if (this.shown() >= d.s.length) this.shown.set(0);
    const run = ++this.run;
    this.playing.set(true);
    while (run === this.run && this.shown() < d.s.length) {
      const i = this.shown();
      await this.animate(i, run);
      if (run !== this.run) return false;
      this.shown.set(i + 1);
      this.drawing.set(null);
      if (i + 1 >= d.s.length) break;
      await new Promise((r) => setTimeout(r, PAUSE_MS / this.speed()));
    }
    if (run !== this.run) return false;
    this.playing.set(false);
    return true;
  }

  /** O traço `i` aparecendo do começo ao fim, no tempo do comprimento dele. */
  private async animate(i: number, run: number): Promise<void> {
    this.drawing.set(i);
    // o caminho entra no próximo quadro
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const path = this.root()?.querySelector<SVGPathElement>(`path[data-tracando="${i}"]`);
    if (!path || run !== this.run || this.reduced || typeof path.animate !== 'function') {
      await new Promise((r) => setTimeout(r, this.reduced ? 500 / this.speed() : 0));
      return;
    }
    const length = path.getTotalLength();
    this.current = path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
      duration: Math.max(260, (length * MS_PER_UNIT) / this.speed()),
      easing: 'cubic-bezier(0.45, 0, 0.35, 1)',
      fill: 'forwards',
    });
    await this.current.finished.catch(() => undefined);
    this.current = null;
  }

  stop(): void {
    this.run++;
    this.current?.cancel();
    this.current = null;
    this.drawing.set(null);
    this.playing.set(false);
  }

  /** Um traço para trás ou para a frente, parado. */
  go(delta: -1 | 1): void {
    this.stop();
    this.shown.update((n) => Math.max(0, Math.min(this.total(), n + delta)));
  }

  /** Do começo; tocando, se não pede menos movimento. */
  restart(): void {
    this.stop();
    this.shown.set(0);
    if (!this.reduced) void this.play();
  }

  /** O caractere inteiro, parado. */
  showAll(): void {
    this.stop();
    this.shown.set(this.total());
  }
}

/**
 * Um caractere que se desenha sozinho na ordem dos traços quando `go` liga (o quadrado certo do Escrever à mão: um
 * depois do outro), e de novo ao toque. Com menos movimento, aparece inteiro. Avisa quando termina (`done`).
 */
@Component({
  selector: 'app-stroke-replay',
  imports: [StrokeOrder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'replay()', '[attr.title]': '"Desenhar de novo"' },
  template: `<app-stroke-order [strokes]="strokes()" [shown]="player.shown()" [drawing]="player.drawing()" [markLast]="false" [label]="label()" />`,
  styles: `
    :host {
      display: block;
      cursor: pointer;
    }
    app-stroke-order {
      width: 100%;
      height: 100%;
    }
  `,
})
export class StrokeReplay {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly strokes = input.required<Strokes>();
  /** Liga: desenha (uma vez). */
  readonly go = input(false);
  readonly label = input('');
  readonly done = output<void>();
  protected readonly player = new StrokePlayer(() => this.strokes(), () => this.host.nativeElement);

  constructor() {
    effect(() => {
      if (this.go()) untracked(() => void this.start());
    });
    inject(DestroyRef).onDestroy(() => this.player.stop());
  }

  /** Já avisou que terminou (o aviso é um só: tocar de novo não passa a vez de novo). */
  private told = false;

  private async start(): Promise<void> {
    // com menos movimento: inteiro, na hora
    if (this.player.reduced) this.player.showAll();
    else if (!(await this.player.play())) return;
    if (!this.told) {
      this.told = true;
      this.done.emit();
    }
  }

  /** O toque desenha de novo (no meio da vez dele também: o aviso de que terminou vem quando este acabar). */
  protected replay(): void {
    this.player.shown.set(0);
    void this.start();
  }
}

/**
 * O quadrado de caligrafia (o 田字格 dos cadernos japoneses): a moldura vermelha e a cruz vermelha tracejada no meio. Por
 * baixo do que se escreve ou se mostra (a lousa e os quadrados do Treino), do tamanho de quem o põe.
 */
@Component({
  selector: 'app-tianzige',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 109 109">
      <rect x="1" y="1" width="107" height="107" rx="1.5" />
      <line class="cruz" x1="54.5" y1="2" x2="54.5" y2="107" />
      <line class="cruz" x1="2" y1="54.5" x2="107" y2="54.5" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    rect {
      fill: none;
      stroke: #b42a20;
      stroke-width: 1.4;
      opacity: 0.75;
    }
    .cruz {
      stroke: rgb(180 42 32 / 0.34);
      stroke-width: 0.6;
      stroke-dasharray: 2.4 2;
    }
  `,
})
export class Tianzige {}
