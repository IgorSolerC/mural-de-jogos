import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Clock } from '../core/clock';
import { POMODORO_PATH, pathOf } from '../core/areas';
import { chime, wakeChime } from '../core/chime';
import { PomodoroCorner as Corner, phaseMs, remainingMs, spokenTime } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { ICON, IconModule } from './icons';
import { PomodoroDial } from './pomodoro-dial';
import { PomodoroMusic } from './pomodoro-music';
import { Toasts } from './toast';

/** A trava do som entre as abas: só a aba que a segura toca a música e o sininho. */
const SOUND_LOCK = 'meu-mural:pomodoro-som';
/** Quanto o dedo anda antes de virar arrasto (menos que isso é clique). */
const DRAG_PX = 6;

/**
 * O relógio do canto do Pomodoro (PLANO-POMODORO.md, seção 5): enquanto o Pomodoro está ligado, fica num canto
 * da tela em toda página, com a fase e o tempo na skin escolhida. Com a mão em cima (ou o teclado), os botões:
 * pausar, pular a fase, a música e tirar, que desliga o Pomodoro (com Desfazer). Arrastar leva para outro canto;
 * o clique abre a página.
 *
 * É ele que faz o turno andar (o relógio do site, uma vez por segundo) e que guarda a música, que por isso não
 * para ao trocar de página. Chega num pedaço à parte, só quando o Pomodoro liga (ver app.html).
 */
@Component({
  selector: 'app-pomodoro-corner',
  imports: [IconModule, PomodoroDial, PomodoroMusic, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pomodoro-corner.scss',
  template: `
    @let s = store.save();
    <div
      class="relogio"
      [class]="'canto-' + s.corner"
      [class.tocou]="rang()"
      [class.arrastando]="dragging()"
      [class.aberto]="opened()"
      [class.na-pagina]="onPage()"
      [style.translate]="offset()"
      (pointerdown)="grab($event)"
      (pointermove)="move($event)"
      (pointerup)="drop($event)"
      (pointercancel)="cancelDrag()"
    >
      <div class="acoes" role="group" aria-label="Pomodoro" (click)="keepOpen()">
        <button type="button" class="botao pausar" (click)="togglePause()" [attr.aria-label]="s.pausedAt === null ? 'Pausar o Pomodoro' : 'Continuar o Pomodoro'" [title]="s.pausedAt === null ? 'Pausar' : 'Continuar'">
          <lucide-icon [img]="s.pausedAt === null ? ICON.pausa : ICON.estudar" [size]="16" aria-hidden="true" />
        </button>
        <button type="button" class="botao pular" (click)="skip()" [attr.aria-label]="s.phase === 'estudo' ? 'Pular para a pausa' : 'Pular para o estudo'" title="Pular a fase">
          <lucide-icon [img]="ICON.pular" [size]="16" aria-hidden="true" />
        </button>
        <button type="button" class="botao musica" (click)="toggleMusic()" [attr.aria-pressed]="s.music" [attr.aria-label]="s.music ? 'Desligar a música' : 'Ligar a música'" [title]="s.music ? 'Desligar a música' : 'Ligar a música'">
          <lucide-icon [img]="s.music ? ICON.musica : ICON.semSom" [size]="16" aria-hidden="true" />
        </button>
        <button type="button" class="botao tirar" (click)="remove()" aria-label="Tirar o relógio e desligar o Pomodoro" title="Tirar e desligar">
          <lucide-icon [img]="ICON.fechar" [size]="16" aria-hidden="true" />
        </button>
      </div>

      <a class="mostrador" [routerLink]="path" [attr.aria-label]="spoken() + '. Abrir o Pomodoro'" (click)="openIfClick($event)" draggable="false">
        <app-pomodoro-dial [skin]="s.skin" [ms]="left()" [total]="total()" [phase]="s.phase" [paused]="s.pausedAt !== null" />
      </a>

      @if (blocked() && s.music) {
        <button type="button" class="tocar-musica" (click)="retryMusic()">
          <lucide-icon [img]="ICON.estudar" [size]="14" aria-hidden="true" />
          Tocar a música
        </button>
      }
    </div>

    @if (owner() && s.music) {
      <app-pomodoro-music #music [url]="s.musicUrl" [playing]="musicPlaying()" (blocked)="onBlocked($event)" (failed)="onFailed()" />
    }
  `,
})
export class PomodoroCorner {
  protected readonly store = inject(PomodoroStore);
  private readonly clock = inject(Clock);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly music = viewChild<PomodoroMusic>('music');

  protected readonly ICON = ICON;
  protected readonly path = POMODORO_PATH;

  /**
   * Na própria página do Pomodoro o relógio do canto some (a página já tem o grande, e no celular ele tamparia os
   * botões); só o desenho: a música e o turno continuam aqui.
   */
  protected readonly onPage = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => pathOf(this.router.url) === POMODORO_PATH),
    ),
    { initialValue: pathOf(this.router.url) === POMODORO_PATH },
  );

  protected readonly left = computed(() => remainingMs(this.store.save(), this.clock.now()));
  protected readonly total = computed(() => phaseMs(this.store.save()));
  /** O leitor de tela ouve por minuto (o texto só muda quando o minuto muda). */
  protected readonly spoken = computed(() => spokenTime(this.store.save(), this.clock.now()));

  /** Esta aba toca o som (segura a trava; sem trava no navegador, toca em todas). */
  protected readonly owner = signal(false);
  protected readonly blocked = signal(false);
  protected readonly rang = signal(false);
  protected readonly musicPlaying = computed(() => {
    const s = this.store.save();
    return s.on && s.music && s.phase === 'estudo' && s.pausedAt === null;
  });

  /** No toque (sem mouse), o primeiro toque no relógio mostra os botões; o segundo abre a página. */
  protected readonly opened = signal(false);
  private openTimer = 0;
  private readonly touch = matchMedia('(hover: none)');
  protected readonly dragging = signal(false);
  protected readonly offset = signal<string | null>(null);
  private start: { x: number; y: number; id: number } | null = null;
  private dragged = false;
  private ringTimer = 0;
  private releaseLock: (() => void) | null = null;
  /** O fim da fase, marcado à parte do relógio do site (ver `scheduleEnd`). */
  private endTimer = 0;
  private readonly endChannel = new MessageChannel();
  private readonly lockAbort = new AbortController();

  constructor() {
    this.clock.use();
    const destroy = inject(DestroyRef);

    // o relógio andou: a fase que acabou vira a próxima (em todas as abas, que gravam o mesmo)
    effect(() => {
      this.clock.now();
      untracked(() => this.store.tick());
    });

    // o fim exato da fase, para o sininho não atrasar com a aba escondida (ver scheduleEnd)
    this.endChannel.port2.onmessage = () => this.scheduleEnd();
    effect(() => {
      this.store.save();
      untracked(() => this.endChannel.port1.postMessage(null));
    });

    // trocou a fase: o sininho (só na aba do som) e o relógio balança
    let before: string | null = null;
    effect(() => {
      const s = this.store.save();
      const now = s.on ? s.phase : null;
      untracked(() => {
        if (before !== null && now !== null && now !== before) this.ring(now);
        before = now;
      });
    });

    // o navegador só deixa tocar som depois de um clique na página (a recarregada no meio do estudo)
    const wake = () => wakeChime();
    document.addEventListener('pointerdown', wake, { once: true, capture: true });

    this.takeSoundLock();
    destroy.onDestroy(() => {
      document.removeEventListener('pointerdown', wake, { capture: true });
      document.removeEventListener('pointerdown', this.retryOnClick, { capture: true });
      clearTimeout(this.ringTimer);
      clearTimeout(this.openTimer);
      clearTimeout(this.endTimer);
      this.endChannel.port1.close();
      this.endChannel.port2.close();
      this.lockAbort.abort();
      this.releaseLock?.();
    });
  }

  /** Pede a trava do som e a segura enquanto este relógio existir; fechou a aba que tocava, a próxima pega. */
  private takeSoundLock(): void {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) {
      this.owner.set(true);
      return;
    }
    locks
      .request(SOUND_LOCK, { signal: this.lockAbort.signal }, () => {
        this.owner.set(true);
        return new Promise<void>((resolve) => (this.releaseLock = resolve));
      })
      .catch(() => {
        /* desistiu da fila (o relógio saiu da tela) */
      });
  }

  /**
   * Marca um tique para o fim exato da fase. O relógio do site anda num setTimeout encadeado, que o Chrome segura
   * para uma vez por minuto numa aba escondida há mais de 5 minutos; sem música tocando (aba com som não é
   * segurada), o sininho atrasaria até um minuto. Um setTimeout marcado fora da cadeia (a mensagem do
   * MessageChannel é uma tarefa nova) não entra nesse aperto.
   */
  private scheduleEnd(): void {
    clearTimeout(this.endTimer);
    const s = this.store.save();
    if (!s.on || s.pausedAt !== null) return;
    this.endTimer = window.setTimeout(() => this.store.tick(), remainingMs(s, Date.now()) + 30);
  }

  private ring(to: 'estudo' | 'pausa'): void {
    if (this.owner()) chime(to);
    this.rang.set(false);
    clearTimeout(this.ringTimer);
    // o próximo quadro, para a animação começar de novo numa troca seguida da outra
    requestAnimationFrame(() => {
      this.rang.set(true);
      this.ringTimer = window.setTimeout(() => this.rang.set(false), 900);
    });
  }

  protected togglePause(): void {
    wakeChime();
    this.store.togglePause();
  }

  protected skip(): void {
    wakeChime();
    this.store.skip();
  }

  protected toggleMusic(): void {
    this.store.setMusic(!this.store.save().music);
    this.blocked.set(false);
  }

  /** O X: desliga o Pomodoro (o relógio sai junto); o Desfazer volta como estava. */
  protected remove(): void {
    const before = this.store.stop();
    this.toasts.show('Pomodoro desligado.', { label: 'Desfazer', run: () => this.store.restore(before) });
  }

  protected retryMusic(): void {
    wakeChime();
    this.music()?.retry();
  }

  protected onBlocked(blocked: boolean): void {
    this.blocked.set(blocked);
    // segurou: o próximo clique em qualquer lugar da página já solta a música
    if (blocked) document.addEventListener('pointerdown', this.retryOnClick, { once: true, capture: true });
    // soltou por outro caminho (o bilhete, o player voltou): o próximo clique não precisa tocar de novo
    else document.removeEventListener('pointerdown', this.retryOnClick, { capture: true });
  }

  private readonly retryOnClick = () => setTimeout(() => this.music()?.retry());

  protected onFailed(): void {
    this.toasts.show('A música do Pomodoro não tocou. Confira o link na página do Pomodoro.', { label: 'Abrir', run: () => void this.router.navigateByUrl(this.path) });
  }

  // ===== arrastar para outro canto =====

  protected grab(e: PointerEvent): void {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    this.start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.dragged = false;
  }

  protected move(e: PointerEvent): void {
    const st = this.start;
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!this.dragged && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!this.dragged) {
      this.dragged = true;
      this.dragging.set(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    this.offset.set(`${dx}px ${dy}px`);
  }

  protected drop(e: PointerEvent): void {
    const st = this.start;
    this.start = null;
    if (!st || !this.dragged) return;
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const corner: Corner = `${cy < innerHeight / 2 ? 's' : 'i'}${cx < innerWidth / 2 ? 'e' : 'd'}` as Corner;
    this.store.setCorner(corner);
    this.offset.set(null);
    this.dragging.set(false);
  }

  protected cancelDrag(): void {
    this.start = null;
    this.offset.set(null);
    this.dragging.set(false);
  }

  /**
   * O clique no mostrador abre a página; o que terminou um arrasto, não. No toque, o primeiro mostra os botões
   * (que somem sozinhos depois de um tempo), e só o segundo abre.
   */
  protected openIfClick(e: MouseEvent): void {
    if (this.dragged) {
      e.preventDefault();
      this.dragged = false;
      return;
    }
    if (this.touch.matches && !this.opened()) {
      e.preventDefault();
      this.keepOpen();
    }
  }

  /** Os botões ficam à mostra no toque por mais um tempo (a cada toque neles, de novo). */
  protected keepOpen(): void {
    if (!this.touch.matches) return;
    this.opened.set(true);
    clearTimeout(this.openTimer);
    this.openTimer = window.setTimeout(() => this.opened.set(false), 5000);
  }
}
