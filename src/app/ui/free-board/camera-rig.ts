import { Camera, Point, ZOOM_MAX, ZOOM_MIN, zoomAt } from '../../core/free-board-geometry';

/**
 * A câmera do Quadro livre (PLANO-QUADRO-LIVRE.md, seções 4.3 e 9.1), fora do Angular: os gestos mudam um
 * objeto comum, e o quadro recebe a câmera uma vez por quadro de animação (`apply`). Nenhum signal muda
 * durante o gesto; quando ele para (150 ms sem mexer), `settle` avisa, e só então o resto acontece (o texto
 * nítido de novo, a câmera guardada).
 *
 * No ver: arrastar com o botão esquerdo em qualquer lugar (depois de 4 px) ou com o do meio move a câmera; um
 * clique sem arrastar chega à peça. A roda do mouse dá zoom no ponteiro; Shift+roda anda de lado; no trackpad,
 * dois dedos andam e a pinça (a roda com Ctrl, como o navegador avisa) dá zoom. No toque, um dedo anda e dois
 * dão zoom.
 */

export interface RigHost {
  /** O tamanho da tela do quadro, em px. */
  size(): { w: number; h: number };
  /** Desenha a câmera (no quadro de animação). `moving`: ainda no meio de um gesto. */
  apply(camera: Camera, moving: boolean): void;
  /** O gesto parou. */
  settle(camera: Camera): void;
}

/** Quantos px o ponteiro anda antes de o clique virar arrasto (seção 4.3). */
export const DRAG_SLOP = 4;
/** Quanto tempo sem mexer até o gesto contar como parado (seção 9.5). */
export const SETTLE_MS = 150;

/** O fator de zoom de um passo da roda (`deltaY` em px): uns 14% por dente de mouse comum (100 px). */
export function wheelZoomFactor(deltaY: number, pinch: boolean): number {
  return Math.exp(-deltaY * (pinch ? 0.01 : 0.0015));
}

/**
 * A roda veio de um trackpad (dois dedos andam) ou de um mouse (dá zoom)? Um mouse manda passos inteiros e
 * grandes, só no eixo de cima a baixo, ou em linhas; o trackpad, passos pequenos, quebrados ou de lado.
 */
export function fromTrackpad(e: Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY'>): boolean {
  if (e.deltaMode !== 0) return false;
  return e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40;
}

const clampZ = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

export class CameraRig {
  private cam: Camera;
  private raf = 0;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private flight = 0;
  /** Os dedos e ponteiros apertados agora, em px da tela do quadro. */
  private readonly pointers = new Map<number, Point>();
  private dragging = false;
  private downAt: Point | null = null;
  private pinchStart: { dist: number; mid: Point; cam: Camera } | null = null;
  /** O último arrasto acabou agora: o clique que vem junto não chega à peça. */
  private swallowClick = false;
  private el: HTMLElement | null = null;

  constructor(
    private readonly host: RigHost,
    camera: Camera,
  ) {
    this.cam = { ...camera };
  }

  get camera(): Camera {
    return { ...this.cam };
  }

  /** Está no meio de um arrasto (a peça não recebe o clique)? */
  get busy(): boolean {
    return this.dragging || this.pointers.size > 1;
  }

  /** Muda a câmera de uma vez. */
  set(camera: Camera): void {
    this.stopFlight();
    this.cam = { x: camera.x, y: camera.y, z: clampZ(camera.z) };
    this.schedule();
  }

  /** Anda (em px da tela). */
  panBy(dx: number, dy: number): void {
    this.stopFlight();
    this.cam = { ...this.cam, x: this.cam.x + dx / this.cam.z, y: this.cam.y + dy / this.cam.z };
    this.schedule();
  }

  /** Zoom de `factor` mantendo parado o ponto da tela `p`. */
  zoomBy(factor: number, p: Point): void {
    this.stopFlight();
    this.cam = zoomAt(this.cam, p, this.cam.z * factor);
    this.schedule();
  }

  /** Desliza até `to` (uns 320 ms, saindo rápido e chegando devagar); com movimento reduzido, pula. */
  flyTo(to: Camera, reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false): void {
    this.stopFlight();
    const target = { x: to.x, y: to.y, z: clampZ(to.z) };
    if (reduced) return this.set(target);
    const from = { ...this.cam };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 320);
      const k = 1 - Math.pow(1 - t, 3);
      // o zoom anda em escala (a meio caminho de 25% para 100% é 50%, não 62%)
      const z = from.z * Math.pow(target.z / from.z, k);
      // o ponto do meio da tela anda em linha reta
      const { w, h } = this.host.size();
      const cx = from.x + w / 2 / from.z + (target.x + w / 2 / target.z - (from.x + w / 2 / from.z)) * k;
      const cy = from.y + h / 2 / from.z + (target.y + h / 2 / target.z - (from.y + h / 2 / from.z)) * k;
      this.cam = { x: cx - w / 2 / z, y: cy - h / 2 / z, z };
      this.schedule();
      this.flight = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.flight = requestAnimationFrame(step);
  }

  private stopFlight(): void {
    if (this.flight) cancelAnimationFrame(this.flight);
    this.flight = 0;
  }

  /** Pede um quadro de animação (um só, por mais eventos que cheguem) e adia o "parou". */
  private schedule(): void {
    if (!this.raf) {
      this.raf = requestAnimationFrame(() => {
        this.raf = 0;
        this.host.apply(this.camera, true);
      });
    }
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      // segurando parado no meio do arrasto: o "parou" vem quando soltar (`up` chama de novo)
      if (this.dragging) return;
      this.host.settle(this.camera);
    }, SETTLE_MS);
  }

  // ===== os eventos =====

  /** Liga os gestos na tela do quadro; devolve o que desliga. */
  attach(el: HTMLElement): () => void {
    this.el = el;
    const opts = { passive: false } as const;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, o);
      return () => el.removeEventListener(type, fn as EventListener, o);
    };
    const offs = [
      on('wheel', (e) => this.wheel(e), opts),
      on('pointerdown', (e) => this.down(e)),
      on('pointermove', (e) => this.move(e)),
      on('pointerup', (e) => this.up(e)),
      on('pointercancel', (e) => this.up(e)),
      on('lostpointercapture', (e) => this.up(e)),
      // o clique que fecha um arrasto não chega à peça (na captura, antes dela)
      on('click', (e) => this.click(e), { capture: true }),
      on('auxclick', (e) => e.button === 1 && e.preventDefault()),
      // a foto e o link não saem arrastados: arrastar anda
      on('dragstart', (e) => e.preventDefault()),
    ];
    return () => {
      offs.forEach((off) => off());
      this.stopFlight();
      cancelAnimationFrame(this.raf);
      clearTimeout(this.settleTimer);
      this.el = null;
    };
  }

  private local(e: { clientX: number; clientY: number }): Point {
    const r = this.el!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  wheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.local(e);
    const lines = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? this.host.size().h : 1;
    const dx = e.deltaX * lines;
    const dy = e.deltaY * lines;
    if (e.ctrlKey || e.metaKey) return this.zoomBy(wheelZoomFactor(dy, true), p);
    if (e.shiftKey) return this.panBy(dx || dy, 0);
    if (fromTrackpad(e)) return this.panBy(dx, dy);
    this.zoomBy(wheelZoomFactor(dy, false), p);
  }

  private down(e: PointerEvent): void {
    // o botão direito fica para o menu (rodada 4); o do meio anda na hora
    if (e.button === 2 || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1)) return;
    this.stopFlight();
    this.pointers.set(e.pointerId, this.local(e));
    this.swallowClick = false;
    if (e.button === 1) {
      e.preventDefault();
      this.startDrag(e);
    }
    if (this.pointers.size === 1) {
      this.downAt = this.local(e);
    } else if (this.pointers.size === 2) {
      // o segundo dedo: a pinça começa (e o arrasto de um dedo vira parte dela)
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam: this.camera };
      this.startDrag(e);
    }
  }

  private startDrag(e: PointerEvent): void {
    if (!this.dragging) {
      this.dragging = true;
      this.host.apply(this.camera, true);
    }
    try {
      this.el?.setPointerCapture(e.pointerId);
    } catch {
      // o ponteiro já saiu (o teste sintético não captura)
    }
  }

  private move(e: PointerEvent): void {
    const before = this.pointers.get(e.pointerId);
    if (!before) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pinchStart && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = this.pinchStart;
      // o ponto do mundo que estava no meio da pinça segue o meio dos dedos
      const z = clampZ(s.cam.z * (dist / s.dist));
      const wx = s.cam.x + s.mid.x / s.cam.z;
      const wy = s.cam.y + s.mid.y / s.cam.z;
      this.cam = { x: wx - mid.x / z, y: wy - mid.y / z, z };
      this.schedule();
      return;
    }
    if (!this.dragging) {
      if (!this.downAt || Math.hypot(p.x - this.downAt.x, p.y - this.downAt.y) < DRAG_SLOP) return;
      this.startDrag(e);
      // o caminho até passar dos 4 px também conta
      this.panBy(this.downAt.x - p.x, this.downAt.y - p.y);
      return;
    }
    this.panBy(before.x - p.x, before.y - p.y);
  }

  private up(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size < 2) this.pinchStart = null;
    if (this.pointers.size === 1 && this.dragging) {
      // sobrou um dedo depois da pinça: ele continua andando dali
      return;
    }
    if (!this.pointers.size) {
      if (this.dragging) this.swallowClick = true;
      this.dragging = false;
      this.downAt = null;
      this.schedule();
    }
  }

  private click(e: MouseEvent): void {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }
}
