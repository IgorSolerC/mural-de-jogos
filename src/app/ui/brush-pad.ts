import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, model, untracked, viewChild } from '@angular/core';
import { BrushStroke } from '../core/dictionary/drill';

/**
 * O quadro de traçar com o pincel (o Treinar da lousa, ui/word-board.ts, e os quadrados do Escrever à mão do Treino do
 * dicionário, ui/word-drill.ts): um canvas onde o dedo, o mouse ou a caneta desenha com a grossura de um pincel (a
 * pressão da caneta; sem ela, mais devagar, mais grosso). Qualquer toque é traço, por menor que seja: os pontos (o 丶,
 * os do 心) são um toque sem arrastar, e um toque sem querer sai no Desfazer de quem usa. Só o traço que o navegador
 * interrompeu (pointercancel) não conta, e só o primeiro dedo desenha (um segundo dedo ou a palma não entram).
 *
 * Os traços são a entrada e a saída (`strokes`, em pontos do quadro de 109, o do KanjiVG): quem usa desfaz, limpa e
 * guarda. Mudar os traços por fora larga o traço que estava no meio (o dedo ainda no quadro).
 */
@Component({
  selector: 'app-brush-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #tela
      class="tela"
      role="img"
      [attr.aria-label]="label()"
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up($event)"
      (pointercancel)="up($event)"
    ></canvas>
  `,
  styles: `
    :host {
      display: block;
      touch-action: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
      cursor: crosshair;
    }
  `,
})
export class BrushPad {
  readonly strokes = model<BrushStroke[]>([]);
  /** O que o leitor de tela diz do quadro. */
  readonly label = input('');

  private readonly destroy = inject(DestroyRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('tela');
  private pen: { x: number; y: number; w: number; t: number }[] | null = null;
  /** O dedo (ou a caneta) que está traçando. */
  private penId: number | null = null;
  /** Os traços que este quadro mesmo deu por último: outros vieram de fora (desfazer, limpar, outro caractere). */
  private own: BrushStroke[] | null = null;

  constructor() {
    effect(() => {
      const list = this.strokes();
      untracked(() => {
        if (list !== this.own) {
          this.pen = null;
          this.penId = null;
        }
        this.paint();
      });
    });
    afterNextRender(() => {
      this.paint();
      // o quadro mudou de tamanho (a janela, o celular virado): desenhado de novo, nítido
      if (typeof ResizeObserver !== 'undefined') {
        const watch = new ResizeObserver(() => this.paint());
        watch.observe(this.canvas().nativeElement);
        this.destroy.onDestroy(() => watch.disconnect());
      }
    });
  }


  private toBoard(e: PointerEvent): { x: number; y: number } {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 109, y: ((e.clientY - r.top) / r.height) * 109 };
  }

  protected down(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (this.pen) return;
    this.penId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = this.toBoard(e);
    this.pen = [{ ...p, w: this.width(e, 0), t: e.timeStamp }];
    e.preventDefault();
  }

  protected move(e: PointerEvent): void {
    if (!this.pen || e.pointerId !== this.penId) return;
    const p = this.toBoard(e);
    const last = this.pen[this.pen.length - 1];
    const dist = Math.hypot(p.x - last.x, p.y - last.y);
    if (dist < 0.4) return;
    const speed = dist / Math.max(1, e.timeStamp - last.t);
    // o pincel: mais devagar, mais grosso; a ponta da caneta com pressão, a pressão manda
    this.pen.push({ ...p, w: (last.w * 2 + this.width(e, speed)) / 3, t: e.timeStamp });
    this.paint();
  }

  protected up(e: PointerEvent): void {
    if (e.pointerId !== this.penId) return;
    this.penId = null;
    const pen = this.pen;
    this.pen = null;
    if (!pen) return;
    if (e.type === 'pointercancel') {
      this.paint();
      return;
    }
    const next = [...this.strokes(), pen.map(({ x, y, w }) => ({ x, y, w }))];
    this.own = next;
    this.strokes.set(next);
  }

  /** A grossura do traço: a pressão da caneta, ou a velocidade do dedo e do mouse. */
  private width(e: PointerEvent, speed: number): number {
    if (e.pointerType === 'pen' && e.pressure > 0) return 2.4 + e.pressure * 4.2;
    return Math.max(2.6, Math.min(6.4, 6.4 - speed * 9));
  }

  /** Desenha os traços feitos (e o que está sendo feito). */
  private paint(): void {
    const canvas = this.canvas().nativeElement;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(box.width * dpr);
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintStrokes(ctx, [...this.strokes(), ...(this.pen ? [this.pen] : [])], size);
  }
}

/** Os traços do pincel num canvas quadrado de `size` px (o quadro de 109 esticado), em tinta opaca. */
export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: readonly BrushStroke[], size: number): void {
  const k = size / 109;
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // tinta opaca: cada pedaço é desenhado à parte, e com transparência as emendas sairiam em contas mais escuras
  ctx.strokeStyle = '#1d1c1a';
  ctx.fillStyle = '#1d1c1a';
  for (const s of strokes) {
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc(s[0].x * k, s[0].y * k, (s[0].w * k) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    for (let i = 1; i < s.length; i++) {
      ctx.beginPath();
      ctx.lineWidth = s[i].w * k;
      ctx.moveTo(s[i - 1].x * k, s[i - 1].y * k);
      ctx.lineTo(s[i].x * k, s[i].y * k);
      ctx.stroke();
    }
  }
}

/**
 * Os traços do pincel só para ver, pequenos (o boletim do Treino: os desenhos que a pessoa fez), redesenhados nítidos
 * quando o tamanho muda.
 */
@Component({
  selector: 'app-brush-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  template: `<canvas #tela></canvas>`,
  styles: `
    :host {
      display: block;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class BrushView {
  readonly strokes = input.required<readonly BrushStroke[]>();
  readonly label = input('');
  private readonly destroy = inject(DestroyRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('tela');

  constructor() {
    effect(() => {
      this.strokes();
      untracked(() => this.paint());
    });
    afterNextRender(() => {
      this.paint();
      if (typeof ResizeObserver !== 'undefined') {
        const watch = new ResizeObserver(() => this.paint());
        watch.observe(this.canvas().nativeElement);
        this.destroy.onDestroy(() => watch.disconnect());
      }
    });
  }

  private paint(): void {
    const canvas = this.canvas().nativeElement;
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const size = Math.round(box.width * (window.devicePixelRatio || 1));
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d');
    if (ctx) paintStrokes(ctx, this.strokes(), size);
  }
}
