import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, untracked, viewChild } from '@angular/core';

/** Matiz (0–360), saturação e brilho (0–1). */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** "#rrggbb" → HSV; o cinza (sem saturação) e o preto (sem brilho) ficam com o matiz `keepHue`, que não se perde. */
export function hexToHsv(hex: string, keepHue = 0): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = keepHue;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** HSV → "#rrggbb". */
export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (k: number) => {
    const t = (k + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(t, 4 - t, 1));
  };
  return '#' + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

/** Os nomes que se falam do matiz, a cada 30°. */
const HUES = ['vermelho', 'laranja', 'amarelo', 'verde-amarelo', 'verde', 'verde-água', 'ciano', 'azul-celeste', 'azul', 'violeta', 'roxo', 'rosa'];

/**
 * O mapa de cor do ateliê (PLANO-CAMADAS.md, rodada 4), sempre aberto embaixo das pastilhas, como o do Aseprite: o
 * quadrado da saturação (para a direita) e do brilho (para cima) no matiz de agora, e a fita do matiz embaixo, cada um
 * com o anel de tinta no ponto. Arrastar com o mouse ou o dedo muda a cor na hora (`picking`); soltar fecha o passo
 * (`picked`, o desfazer). No teclado, cada um é um controle deslizante: as setas andam 1% (ou 1°), o Shift dez vezes
 * isso. O matiz fica guardado aqui: escurecer até o preto e voltar não perde a cor.
 */
@Component({
  selector: 'app-color-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #sv
      class="sv"
      role="slider"
      [attr.tabindex]="disabled() ? -1 : 0"
      [attr.aria-disabled]="disabled() || null"
      aria-label="Saturação e brilho"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="round(hsv().v * 100)"
      [attr.aria-valuetext]="svText()"
      [style.--matiz]="'hsl(' + hsv().h + ' 100% 50%)'"
      (pointerdown)="down($event, 'sv')"
      (pointermove)="move($event)"
      (pointerup)="up($event)"
      (pointercancel)="cancel()"
      (keydown)="key($event, 'sv')"
      (keyup)="keyUp($event)"
    >
      <span class="ponto" [style.left.%]="hsv().s * 100" [style.top.%]="(1 - hsv().v) * 100" [style.--cor]="color() ?? 'transparent'"></span>
    </div>
    <div
      #hue
      class="matiz"
      role="slider"
      [attr.tabindex]="disabled() ? -1 : 0"
      [attr.aria-disabled]="disabled() || null"
      aria-label="Matiz"
      aria-valuemin="0"
      aria-valuemax="360"
      [attr.aria-valuenow]="round(hsv().h)"
      [attr.aria-valuetext]="hueText()"
      (pointerdown)="down($event, 'h')"
      (pointermove)="move($event)"
      (pointerup)="up($event)"
      (pointercancel)="cancel()"
      (keydown)="key($event, 'h')"
      (keyup)="keyUp($event)"
    >
      <span class="ponto" [style.left.%]="hsv().h / 3.6" [style.--cor]="'hsl(' + hsv().h + ' 100% 50%)'"></span>
    </div>
  `,
  styleUrl: './color-map.scss',
  host: { '[class.apagado]': 'disabled()' },
})
export class ColorMap {
  /** A cor de agora ("#rrggbb"); null, o transparente (o mapa fica apagado). */
  readonly color = input<string | null>(null);
  readonly disabled = input(false);
  /** A cor mudou no meio do gesto (arrastando, ou a cada seta). */
  readonly picking = output<string>();
  /** O gesto acabou: o passo do desfazer entra. */
  readonly picked = output<void>();

  private readonly svEl = viewChild.required<ElementRef<HTMLElement>>('sv');
  private readonly hueEl = viewChild.required<ElementRef<HTMLElement>>('hue');
  protected readonly hsv = signal<Hsv>({ h: 0, s: 0, v: 0 });
  private dragging: 'sv' | 'h' | null = null;
  protected readonly round = Math.round;

  constructor() {
    // a cor que vem de fora (outra pastilha, o Hex, o desfazer) vira o ponto; a que este mapa mandou, não (o matiz fica)
    effect(() => {
      const c = this.color();
      untracked(() => {
        if (!c || /^#[0-9a-f]{6}$/i.test(c) === false) return;
        if (hsvToHex(this.hsv()).toLowerCase() === c.toLowerCase()) return;
        this.hsv.set(hexToHsv(c, this.hsv().h));
      });
    });
  }

  /** Coloca o foco no mapa (o A e o F4 do ateliê, os dois cliques na pastilha). */
  focus(): void {
    this.svEl().nativeElement.focus();
  }

  protected readonly svText = computed(() => `saturação ${Math.round(this.hsv().s * 100)}%, brilho ${Math.round(this.hsv().v * 100)}%`);
  protected readonly hueText = computed(() => `${HUES[Math.round(this.hsv().h / 30) % 12]}, ${Math.round(this.hsv().h)}°`);

  protected down(e: PointerEvent, what: 'sv' | 'h'): void {
    if (this.disabled() || e.button !== 0) return;
    e.preventDefault();
    this.dragging = what;
    const el = e.currentTarget as HTMLElement;
    el.focus({ preventScroll: true });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // (o ponteiro que o navegador já soltou)
    }
    this.at(e);
  }

  protected move(e: PointerEvent): void {
    if (this.dragging) this.at(e);
  }

  protected up(e: PointerEvent): void {
    if (!this.dragging) return;
    this.at(e);
    this.dragging = null;
    this.picked.emit();
  }

  /** O gesto que o navegador cancelou (a folha rolou): fica a cor de até ali, sem pegar o ponto do cancelamento. */
  protected cancel(): void {
    if (!this.dragging) return;
    this.dragging = null;
    this.picked.emit();
  }

  /** O ponto debaixo do ponteiro vira a cor. */
  private at(e: PointerEvent): void {
    const el = (this.dragging === 'sv' ? this.svEl() : this.hueEl()).nativeElement;
    const r = el.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height)));
    const now = this.hsv();
    this.set(this.dragging === 'sv' ? { ...now, s: fx, v: 1 - fy } : { ...now, h: Math.min(359.9, fx * 360) });
  }

  protected key(e: KeyboardEvent, what: 'sv' | 'h'): void {
    if (this.disabled()) return;
    const big = e.shiftKey ? 10 : 1;
    const step = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as Record<string, [number, number]>)[e.key];
    if (!step) return;
    // (as setas do mapa não andam o ponto do teclado da folha)
    e.preventDefault();
    e.stopPropagation();
    const now = this.hsv();
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    if (what === 'sv') this.set({ ...now, s: clamp(now.s + (step[0] * big) / 100), v: clamp(now.v + (step[1] * big) / 100) });
    else this.set({ ...now, h: (((now.h + (step[0] || step[1]) * big) % 360) + 360) % 360 });
  }

  protected keyUp(e: KeyboardEvent): void {
    if (e.key.startsWith('Arrow') && !this.disabled()) this.picked.emit();
  }

  private set(next: Hsv): void {
    this.hsv.set(next);
    this.picking.emit(hsvToHex(next));
  }
}
