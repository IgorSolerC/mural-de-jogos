import { HOLD_MS } from './context-menu';
import { swallowNextClick } from './focus';

/** Quanto o mouse anda antes de virar arrastar (menos que isso é um clique). */
export const DRAG_SLOP = 6;
/** Quanto o dedo segura parado até a ficha levantar e poder ser arrastada. */
export const DRAG_HOLD = 280;
/** Quanto o dedo pode andar antes de segurar: mais que isso é rolar a tela, não arrastar. */
export const DRAG_TOUCH_SLOP = 10;

/** Onde o gesto começou: o ponto, o elemento pego e se foi o dedo. */
export interface DragStart<T> {
  item: T;
  el: HTMLElement;
  x: number;
  y: number;
  touch: boolean;
}

/** O que quem usa faz em cada passo do gesto (o que é arrastado, onde cai, o que acontece ao soltar). */
export interface DragHoldConfig<T> {
  /**
   * Começa a arrastar (o mouse passou da folga, ou o dedo segurou): monta o fantasma e o que mais for
   * preciso. `false`: não arrasta (e o gesto acaba).
   */
  begin(start: DragStart<T>): boolean;
  /** O ponteiro andou (ou a tela rolou embaixo dele) arrastando: o fantasma segue e o alvo muda. */
  move(x: number, y: number): void;
  /** Soltou arrastando: cai onde está. */
  drop(): void;
  /** Acabou, soltando, cancelando (Esc, o navegador tomou o toque) ou não: limpa o fantasma e o resto. */
  end(): void;
  /**
   * O dedo segurou parado o tempo do toque longo e soltou sem arrastar: o menu do que se pegou (como o
   * toque longo de sempre). Sem isso, soltar parado só cancela.
   */
  hold?(start: DragStart<T>): void;
  /** Perto da beirada, rola o que for preciso; `true` se rolou (o alvo é refeito). */
  edge?(x: number, y: number): boolean;
}

/**
 * O gesto de arrastar do site (o do Kanban, que o mural de anotações também usa), com mouse, caneta e
 * dedo: o mouse arrasta depois de andar uns pixels; o dedo, depois de segurar parado um instante (andar
 * antes disso é rolar a tela), e enquanto ele arrasta a tela não rola nem o menu do navegador abre. O Esc
 * cancela; perto da beirada, `edge` rola. Soltar arrastando cai (`drop`), e o clique que vem depois não
 * abre o que se soltou. O dedo que segurou e soltou parado abre o menu (`hold`).
 *
 * Quem usa decide o que pega (chama `down` no pointerdown), o que segue o ponteiro e onde cai.
 */
export class DragHold<T> {
  private start: (DragStart<T> & { id: number; at: number; moved: boolean }) | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private dragging = false;
  private readonly listeners: (() => void)[] = [];
  /** Onde o ponteiro está agora. */
  pointer = { x: 0, y: 0 };

  constructor(private readonly config: DragHoldConfig<T>) {}

  /** Arrastando agora (já passou da folga ou do segurar). */
  get active(): boolean {
    return this.dragging;
  }

  /** Um gesto começou (o ponteiro desceu e ainda não subiu), arrastando ou não. */
  get pending(): boolean {
    return this.start !== null;
  }

  /** O ponteiro desceu em algo que se arrasta. */
  down(e: PointerEvent, item: T, el: HTMLElement): void {
    if (this.start || e.button !== 0 || !e.isPrimary) return;
    const touch = e.pointerType === 'touch';
    this.start = { item, el, x: e.clientX, y: e.clientY, touch, id: e.pointerId, at: Date.now(), moved: false };
    this.pointer = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => this.onMove(ev);
    const up = (ev: PointerEvent) => this.onUp(ev);
    const cancel = () => this.cancel();
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && this.dragging) {
        ev.preventDefault();
        this.cancel();
      }
    };
    // enquanto arrasta com o dedo, a tela não rola (o toque segue com o arrastar)
    const touchmove = (ev: TouchEvent) => {
      if (this.dragging) ev.preventDefault();
    };
    // segurar o dedo não abre o menu do navegador no meio do arrastar
    const menu = (ev: Event) => {
      if (this.dragging) ev.preventDefault();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('touchmove', touchmove, { passive: false });
    window.addEventListener('contextmenu', menu);
    this.listeners.push(
      () => window.removeEventListener('pointermove', move),
      () => window.removeEventListener('pointerup', up),
      () => window.removeEventListener('pointercancel', cancel),
      () => window.removeEventListener('keydown', key, true),
      () => window.removeEventListener('touchmove', touchmove),
      () => window.removeEventListener('contextmenu', menu),
    );
    if (touch) this.holdTimer = setTimeout(() => this.begin(), DRAG_HOLD);
  }

  /** Para o gesto sem soltar (o Esc, sair da página). */
  cancel(): void {
    const was = this.start !== null;
    clearTimeout(this.holdTimer);
    cancelAnimationFrame(this.frame);
    for (const off of this.listeners.splice(0)) off();
    this.start = null;
    this.dragging = false;
    if (was) this.config.end();
  }

  /** A tela rolou embaixo do ponteiro (ou o alvo mudou de lugar): refaz o alvo. */
  refresh(): void {
    if (this.dragging) this.config.move(this.pointer.x, this.pointer.y);
  }

  private onMove(e: PointerEvent): void {
    const s = this.start;
    if (!s || e.pointerId !== s.id) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    if (dist > DRAG_TOUCH_SLOP) s.moved = true;
    if (!this.dragging) {
      // o dedo andou antes de segurar: é rolar a tela, não arrastar
      if (s.touch) {
        if (dist > DRAG_TOUCH_SLOP) this.cancel();
        return;
      }
      if (dist < DRAG_SLOP) return;
      // (começar já leva a cópia até o ponteiro)
      this.begin();
      if (this.dragging) e.preventDefault();
      return;
    }
    e.preventDefault();
    this.config.move(this.pointer.x, this.pointer.y);
  }

  private begin(): void {
    const s = this.start;
    if (!s || this.dragging) return;
    if (!this.config.begin(s)) {
      this.cancel();
      return;
    }
    this.dragging = true;
    if (s.touch) navigator.vibrate?.(12);
    this.config.move(this.pointer.x, this.pointer.y);
    this.scrollLoop();
  }

  private scrollLoop(): void {
    cancelAnimationFrame(this.frame);
    const edge = this.config.edge;
    if (!edge) return;
    const tick = () => {
      if (!this.dragging) return;
      if (edge(this.pointer.x, this.pointer.y)) this.config.move(this.pointer.x, this.pointer.y);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private onUp(e: PointerEvent): void {
    const s = this.start;
    if (!s || e.pointerId !== s.id) return;
    // o dedo segurou parado o tempo do toque longo e soltou sem arrastar: o menu (nada se move)
    if (this.dragging && s.touch && !s.moved && Date.now() - s.at >= HOLD_MS && this.config.hold) {
      swallowNextClick();
      const start: DragStart<T> = { item: s.item, el: s.el, x: s.x, y: s.y, touch: s.touch };
      this.cancel();
      this.config.hold(start);
      return;
    }
    // o dedo levantou a ficha, mas soltou parado antes do toque longo: foi um toque um pouco demorado, não
    // um arrasto (nada cai, e o clique passa e abre a ficha, como antes de a ficha poder ser arrastada)
    if (this.dragging && s.touch && !s.moved && Date.now() - s.at < HOLD_MS) {
      this.cancel();
      return;
    }
    if (this.dragging) {
      // o clique que vem depois de soltar não abre o que se soltou
      swallowNextClick();
      this.config.drop();
    }
    this.cancel();
  }
}

/** A velocidade da rolagem pela beirada: mais perto da beirada, mais rápido (até `max` por quadro). */
export function edgeSpeed(distance: number, edge: number, max = 18): number {
  return Math.round(((edge - Math.max(0, distance)) / edge) * max);
}
