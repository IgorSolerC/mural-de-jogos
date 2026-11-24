import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { Word } from '../core/dictionary/dictionary';
import { hasKanji } from '../core/dictionary/kana';
import { reducedMotion } from '../core/motion';
import { BackdropClose } from './backdrop-close';
import { loadKleeOne, loadYujiSyuku } from './font-sheet';
import { ICON, IconModule } from './icons';
import { WordVoice } from './word-voice';

/** Os traços de um caractere (do KanjiVG, no quadro de 109): o `d` de cada um e onde fica o número dele. */
interface Strokes {
  s: string[];
  n: [number, number][];
}

type Mode = 'pincel' | 'ordem' | 'treinar';
type Speed = 0.5 | 1 | 2;

/** Quanto tempo um traço leva para ser desenhado, por unidade de comprimento (no quadro de 109), na velocidade 1. */
const MS_PER_UNIT = 9;
/** O respiro entre um traço e o próximo. */
const PAUSE_MS = 220;

/** O começo de um traço (o primeiro "M x,y" do caminho), onde a guia do Treinar põe a bolinha. */
export function strokeStart(d: string): [number, number] | null {
  const m = /^\s*M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/i.exec(d);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Os caracteres que a lousa desenha: tudo menos o 〜 e os espaços. */
export function boardChars(text: string): string[] {
  return [...text].filter((c) => c !== '〜' && c !== '～' && c.trim() !== '');
}

/**
 * A lousa do Dicionário Japonês (PLANO-DICIONARIO.md, 5.1): a palavra maximizada numa folha de papel de arroz, para
 * aprender a escrever. Em cima, a palavra inteira no pincel (Yuji Syuku), cada caractere um botão; embaixo, o
 * quadrado de caligrafia (o 田字格, a cruz vermelha tracejada dos cadernos japoneses) em três jeitos: **Pincel**, o
 * caractere enorme na letra de pincel; **Ordem**, os traços do KanjiVG aparecendo um a um, numerados, com tocar,
 * pausar, passo a passo e a velocidade; e **Treinar**, o modelo apagado embaixo e o próximo traço como guia, para traçar
 * por cima com o dedo ou o mouse. Ao lado, a tabela de passos (筆順): um quadradinho por traço, o novo em vermelho.
 * Os traços chegam sob demanda (core/dictionary/strokes.ts, um pedaço só deles). Só desenho: nada é guardado.
 */
@Component({
  selector: 'app-word-board',
  imports: [BackdropClose, IconModule, WordVoice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown)': 'key($event)' },
  templateUrl: './word-board.html',
  styleUrl: './word-board.scss',
})
export class WordBoard {
  private readonly destroyRef = inject(DestroyRef);

  readonly word = input.required<Word>();
  /** Há palavra antes e depois na lista da página (as setas da lousa andam por ela). */
  readonly hasPrev = input(false);
  readonly hasNext = input(false);
  readonly step = output<-1 | 1>();
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly PrevIcon = ICON.anterior;
  protected readonly NextIcon = ICON.proximo;
  protected readonly PlayIcon = ICON.estudar;
  protected readonly PauseIcon = ICON.pausa;
  protected readonly RestartIcon = ICON.recomecar;
  protected readonly UndoIcon = ICON.desfazer;
  protected readonly ClearIcon = ICON.borracha;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('tela');
  private readonly reduced = reducedMotion();

  /** Todos os traços do dicionário, quando chegam (null: ainda não, ou não deu para baixar). */
  protected readonly strokes = signal<Record<string, Strokes> | null>(null);
  protected readonly failed = signal(false);

  /** Desenhar a escrita (来る) ou a leitura (くる), quando são diferentes. */
  protected readonly script = signal<'escrita' | 'leitura'>('escrita');
  protected readonly hasReading = computed(() => hasKanji(this.word().text) && this.word().reading !== this.word().text);
  protected readonly chars = computed(() => boardChars(this.script() === 'leitura' ? this.word().reading : this.word().text));
  /** O caractere no quadrado (o índice em `chars`). */
  protected readonly at = signal(0);
  protected readonly char = computed(() => this.chars()[this.at()] ?? '');
  protected readonly data = computed<Strokes | null>(() => this.strokes()?.[this.char()] ?? null);
  /** Os caracteres que têm traços (o ？ não tem). */
  protected readonly drawable = computed(() => this.chars().map((c) => !!this.strokes()?.[c]));

  protected readonly mode = signal<Mode>('ordem');
  protected readonly modes: readonly { value: Mode; label: string; hint: string }[] = [
    { value: 'pincel', label: 'Pincel', hint: 'O caractere enorme, na letra de pincel' },
    { value: 'ordem', label: 'Ordem', hint: 'Os traços aparecendo um a um, na ordem de escrever' },
    { value: 'treinar', label: 'Treinar', hint: 'Trace por cima do modelo, um traço de cada vez' },
  ];

  // ===== A ordem dos traços =====
  /** Quantos traços já estão desenhados inteiros (0 a N). */
  protected readonly shown = signal(0);
  /** O traço que está sendo desenhado agora (o índice), ou null. */
  protected readonly drawing = signal<number | null>(null);
  protected readonly playing = signal(false);
  protected readonly speed = signal<Speed>(1);
  protected readonly speeds: readonly { value: Speed; label: string }[] = [
    { value: 0.5, label: 'Devagar' },
    { value: 1, label: 'Normal' },
    { value: 2, label: 'Rápido' },
  ];
  /** Cada rodada de tocar tem um número: mudar de caractere, pausar ou fechar cancela a de antes. */
  private run = 0;
  private current: Animation | null = null;
  /** Um passo pedido pela tabela vindo de outro jeito: a troca para a Ordem mostra até ele, em vez de tocar. */
  private pendingStep: number | null = null;

  protected readonly total = computed(() => this.data()?.s.length ?? 0);
  protected readonly counter = computed(() => `${Math.min(this.shown() + (this.drawing() !== null ? 1 : 0), this.total())} / ${this.total()}`);

  // ===== Treinar =====
  /** Os traços que a pessoa já fez (pontos no quadro de 109). */
  private readonly drawn = signal<{ x: number; y: number; w: number }[][]>([]);
  protected readonly done = computed(() => Math.min(this.drawn().length, this.total()));
  protected readonly showModel = signal(true);
  /** O próximo traço a fazer: a guia vermelha tracejada, com a bolinha onde ele começa. */
  protected readonly guide = computed(() => {
    const d = this.data();
    const i = this.done();
    if (!d || i >= d.s.length) return null;
    return { d: d.s[i], start: strokeStart(d.s[i]), n: i + 1 };
  });
  private pen: { x: number; y: number; w: number; t: number }[] | null = null;
  /** O dedo (ou a caneta) que está traçando: um segundo dedo ou a palma não entram no traço. */
  private penId: number | null = null;

  constructor() {
    loadYujiSyuku();
    loadKleeOne();
    import('../core/dictionary/strokes')
      .then((m) => this.strokes.set(m.STROKES))
      .catch(() => this.failed.set(true));
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      // o quadrado mudou de tamanho (a janela, o celular virado): o treino é desenhado de novo, nítido
      const square = this.dialog().nativeElement.querySelector('.quadrado');
      if (square && typeof ResizeObserver !== 'undefined') {
        const watch = new ResizeObserver(() => this.paint());
        watch.observe(square);
        this.destroyRef.onDestroy(() => watch.disconnect());
      }
    });

    // outra palavra (as setas), ou a escrita/leitura trocada: volta ao primeiro caractere que tem traços
    effect(() => {
      const drawable = this.drawable();
      untracked(() => this.at.set(Math.max(0, drawable.indexOf(true))));
    });
    // outro caractere: recomeça a ordem (tocando sozinho, uma vez, se não pede menos movimento) e limpa o treino
    // (a palavra e a escrita também: a palavra seguinte pode começar pelo mesmo caractere, com os mesmos traços)
    effect(() => {
      this.word();
      this.script();
      const d = this.data();
      const mode = this.mode();
      untracked(() => {
        this.stop();
        this.drawn.set([]);
        this.shown.set(0);
        if (!d) return;
        const asked = this.pendingStep;
        this.pendingStep = null;
        if (mode === 'ordem' && asked !== null) this.shown.set(Math.min(asked, d.s.length));
        else if (mode === 'ordem' && !this.reduced) this.play();
        else if (mode === 'ordem') this.shown.set(d.s.length);
        if (mode === 'treinar') queueMicrotask(() => this.paint());
      });
    });
    this.destroyRef.onDestroy(() => this.stop());
  }

  close(): void {
    this.stop();
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected choose(i: number): void {
    if (this.drawable()[i]) this.at.set(i);
  }

  protected setMode(m: Mode): void {
    this.mode.set(m);
  }

  // ===== A ordem =====

  protected toggle(): void {
    if (this.playing()) this.stop();
    else this.play();
  }

  /** Desenha os traços que faltam, um a um, desde onde está (do começo, se já acabou). */
  protected async play(): Promise<void> {
    const d = this.data();
    if (!d) return;
    this.stop();
    if (this.shown() >= d.s.length) this.shown.set(0);
    const run = ++this.run;
    this.playing.set(true);
    while (run === this.run && this.shown() < d.s.length) {
      const i = this.shown();
      await this.animate(i, run);
      if (run !== this.run) return;
      this.shown.set(i + 1);
      this.drawing.set(null);
      if (i + 1 >= d.s.length) break;
      await new Promise((r) => setTimeout(r, PAUSE_MS / this.speed()));
    }
    if (run === this.run) this.playing.set(false);
  }

  /** O traço `i` aparecendo do começo ao fim, no tempo do comprimento dele. */
  private async animate(i: number, run: number): Promise<void> {
    this.drawing.set(i);
    // o caminho entra no próximo quadro
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const path = this.dialog().nativeElement.querySelector<SVGPathElement>(`path[data-tracando="${i}"]`);
    if (!path || run !== this.run || this.reduced) {
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

  private stop(): void {
    this.run++;
    this.current?.cancel();
    this.current = null;
    this.drawing.set(null);
    this.playing.set(false);
  }

  /** Um traço para trás ou para a frente, parado. */
  protected go(delta: -1 | 1): void {
    this.stop();
    this.shown.update((n) => Math.max(0, Math.min(this.total(), n + delta)));
  }

  protected restart(): void {
    this.stop();
    this.shown.set(0);
    if (!this.reduced) void this.play();
  }

  /** A tabela de passos: tocar num quadradinho mostra a lousa até aquele traço. */
  protected jump(i: number): void {
    this.stop();
    if (this.mode() !== 'ordem') {
      // a troca de jeito recomeça a lousa: ela mesma mostra até o passo pedido
      this.pendingStep = i + 1;
      this.mode.set('ordem');
    } else this.shown.set(i + 1);
  }

  protected setSpeed(s: Speed): void {
    this.speed.set(s);
  }

  // ===== Treinar =====

  private toBoard(e: PointerEvent): { x: number; y: number } {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 109, y: ((e.clientY - r.top) / r.height) * 109 };
  }

  protected down(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (this.pen) return;
    this.penId = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
    // qualquer toque é traço, por menor que seja: os pontos (o 丶, os do 心) são um toque sem arrastar, e um toque
    // sem querer sai no Desfazer. Só o traço que o navegador interrompeu (pointercancel) não conta.
    if (e.type === 'pointercancel') {
      this.paint();
      return;
    }
    this.drawn.update((list) => [...list, pen.map(({ x, y, w }) => ({ x, y, w }))]);
    this.paint();
  }

  /** A grossura do traço: a pressão da caneta, ou a velocidade do dedo e do mouse. */
  private width(e: PointerEvent, speed: number): number {
    if (e.pointerType === 'pen' && e.pressure > 0) return 2.4 + e.pressure * 4.2;
    return Math.max(2.6, Math.min(6.4, 6.4 - speed * 9));
  }

  protected undo(): void {
    this.drawn.update((list) => list.slice(0, -1));
    this.paint();
  }

  protected clear(): void {
    this.drawn.set([]);
    this.paint();
  }

  /** Desenha os traços feitos (e o que está sendo feito) na tela do Treinar. */
  protected paint(): void {
    const canvas = this.canvas()?.nativeElement;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(box.width * dpr);
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = size / 109;
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // tinta opaca: cada pedaço é desenhado à parte, e com transparência as emendas sairiam em contas mais escuras
    ctx.strokeStyle = '#1d1c1a';
    const strokes = [...this.drawn(), ...(this.pen ? [this.pen] : [])];
    for (const s of strokes) {
      if (s.length === 1) {
        ctx.beginPath();
        ctx.arc(s[0].x * k, s[0].y * k, (s[0].w * k) / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
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

  // ===== Teclado =====

  protected key(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' && this.mode() === 'ordem' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      this.toggle();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.shiftKey) {
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if ((d === -1 && this.hasPrev()) || (d === 1 && this.hasNext())) {
        e.preventDefault();
        this.step.emit(d);
      }
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.mode() === 'ordem') {
      e.preventDefault();
      this.go(e.key === 'ArrowLeft' ? -1 : 1);
    }
  }
}
