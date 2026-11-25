import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { Clock } from '../core/clock';
import { wakeChime } from '../core/chime';
import { POMODORO_SKINS, PomodoroPhase, doneToday, phaseEnd, phaseMs, remainingMs, todayRuns } from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { trackName } from '../core/pomodoro-tracks';
import { PomodoroTracks } from '../core/pomodoro-tracks-store';
import { ICON, IconModule } from '../ui/icons';
import { PomodoroDay } from '../ui/pomodoro-day';
import { PomodoroDial } from '../ui/pomodoro-dial';
import { PomodoroPart, PomodoroSheet } from '../ui/pomodoro-sheet';
import { Shelf } from '../ui/shelf';
import { Toasts } from '../ui/toast';

/** No máximo tantos tomatinhos na tábua, em dois andares de seis (o número certo está em cima da régua do dia). */
const MAX_TOMATOES = 12;

/** "14h35", a hora do aparelho (escrita assim para não ser lida como o tempo que falta, que é "18:36"). */
function hourOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * O Pomodoro (`/extras/pomodoro`, PLANO-POMODORO-REWORK.md): uma tela só, sem rolar. O relógio grande de pé na
 * prateleira de Outros, com um tomatinho na tábua por estudo de hoje; na frente da tábua, três fitas Dymo (o tempo, a
 * música, o relógio) que abrem a folha dos ajustes na parte de cada uma; embaixo, a frase do estado com os botões e a
 * régua do dia.
 */
@Component({
  selector: 'app-pomodoro-page',
  host: { '(document:keydown)': 'onKey($event)' },
  imports: [IconModule, PomodoroDay, PomodoroDial, PomodoroSheet, Shelf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pomodoro-page.html',
  styleUrl: './pomodoro-page.scss',
})
export class PomodoroPage {
  protected readonly store = inject(PomodoroStore);
  private readonly tracks = inject(PomodoroTracks);
  protected readonly clock = inject(Clock);
  private readonly toasts = inject(Toasts);

  protected readonly ICON = ICON;

  constructor() {
    this.clock.use();
    // a página ocupa a sobra da tela embaixo do topo (que muda de altura com a largura): mede onde ela começa
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let topo = '';
    const fit = () => {
      const next = `${Math.round(host.getBoundingClientRect().top + scrollY)}px`;
      if (next !== topo) host.style.setProperty('--topo', (topo = next));
    };
    // de novo quando o que vem antes muda de altura (a fonte que chega depois, um aviso no topo): o corpo da página
    // cresce junto (o tamanho desta página não muda a medida, então não fica medindo em volta)
    // (no quadro seguinte: mudar o layout dentro do aviso dele é o "ResizeObserver loop" no console)
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => requestAnimationFrame(fit));
    afterNextRender(() => {
      fit();
      watch?.observe(document.body);
    });
    addEventListener('resize', fit);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener('resize', fit);
      watch?.disconnect();
    });
  }

  protected readonly s = this.store.save;
  protected readonly on = computed(() => this.s().on);
  protected readonly paused = computed(() => this.s().pausedAt !== null);
  /** O que falta (desligado: o estudo inteiro, pronto para começar). */
  protected readonly left = computed(() => (this.on() ? remainingMs(this.s(), this.clock.now()) : phaseMs(this.s(), 'estudo')));
  protected readonly total = computed(() => (this.on() ? phaseMs(this.s()) : phaseMs(this.s(), 'estudo')));
  protected readonly phase = computed<PomodoroPhase>(() => (this.on() ? this.s().phase : 'estudo'));

  protected readonly done = computed(() => doneToday(this.s(), this.clock.now()));
  protected readonly tomatoes = computed(() => Array.from({ length: Math.min(this.done(), MAX_TOMATOES) }, (_, i) => i));
  protected readonly runs = computed(() => todayRuns(this.s(), this.clock.now()));
  /** A fase que anda agora, para o traço do agora na régua (parado ou desligado: nenhuma). */
  protected readonly runningPhase = computed<PomodoroPhase | null>(() => (this.on() && !this.paused() ? this.s().phase : null));

  /** A frase ao lado dos botões: o estado e quando a fase acaba. */
  protected readonly status = computed(() => {
    const s = this.s();
    if (!s.on) return `Pronto para ${s.study} min de estudo.`;
    if (s.pausedAt !== null) {
      const min = Math.ceil(remainingMs(s, this.clock.now()) / 60_000);
      return `Parado. Faltam ${min} min de ${s.phase === 'estudo' ? 'estudo' : 'pausa'}.`;
    }
    const at = hourOf(phaseEnd(s));
    return s.phase === 'estudo' ? `Estudando. A pausa começa às ${at}.` : `Pausa. O estudo volta às ${at}.`;
  });

  /**
   * As fitas: o tempo, a música (a deste estudo; fora dele, a do próximo, a escolhida à mão ou a que o sorteio dá, que
   * só depende da lista e da rodada) e o relógio.
   */
  protected readonly timeTape = computed(() => `${this.s().study}/${this.s().rest} min`);
  protected readonly musicTape = computed(() => {
    if (!this.s().music) return 'Sem música';
    const t = this.tracks.upcoming();
    return t ? trackName(t) : 'Rádio lofi';
  });
  protected readonly skinTape = computed(() => POMODORO_SKINS.find((k) => k.value === this.s().skin)?.label ?? '');

  /** A folha dos ajustes aberta, na parte da fita tocada. */
  protected readonly sheet = signal<PomodoroPart | null>(null);

  /**
   * O Espaço começa o foco e pausa ou continua, como o tocar e pausar de um player: só com a página na frente (fora de
   * campos, botões e links, onde o Espaço é deles, e sem a folha aberta).
   */
  protected onKey(e: KeyboardEvent): void {
    if (e.key !== ' ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || this.sheet()) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, button, a, [contenteditable], dialog, [role="menu"]')) return;
    e.preventDefault();
    if (this.on()) this.togglePause();
    else this.startFocus();
  }

  protected startFocus(): void {
    wakeChime();
    this.store.start();
  }

  protected togglePause(): void {
    wakeChime();
    this.store.togglePause();
  }

  protected skip(): void {
    wakeChime();
    this.store.skip();
  }

  protected turnOff(): void {
    const turn = this.tracks.save().turn;
    const before = this.store.stop();
    this.toasts.show('Pomodoro desligado.', {
      label: 'Desfazer',
      run: () => {
        this.store.restore(before);
        this.tracks.restoreTurn(turn);
      },
    });
  }
}
