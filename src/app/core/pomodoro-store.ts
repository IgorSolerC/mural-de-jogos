import { Injectable, computed, signal } from '@angular/core';
import { readJson, writeJson } from './storage';
import {
  POMODORO_KEY,
  PomodoroCorner,
  PomodoroPhase,
  PomodoroSave,
  PomodoroSkin,
  advance,
  clampMinutes,
  pause,
  readPomodoro,
  resume,
  setMinutes,
  skip,
  start,
  stop,
} from './pomodoro';

/**
 * O Pomodoro deste aparelho (PLANO-POMODORO.md): os ajustes e o turno, numa chave só do localStorage
 * (`meu-mural:pomodoro`), que a limpeza do logout apaga pelo prefixo. Não vai para a nuvem: é como o volume,
 * uma preferência do aparelho. As abas abertas andam juntas pelo aviso `storage` do navegador.
 *
 * Fica no bundle inicial só isto (o app precisa saber se o relógio do canto aparece); o relógio, as skins e a
 * música chegam num pedaço à parte, quando o Pomodoro liga.
 */
@Injectable({ providedIn: 'root' })
export class PomodoroStore {
  // lido aqui, e não no módulo: a limpeza do logout roda depois dos imports (regra do CLAUDE.md)
  private readonly state = signal<PomodoroSave>(readPomodoro(readJson(POMODORO_KEY)));
  readonly save = this.state.asReadonly();
  readonly on = computed(() => this.state().on);
  readonly paused = computed(() => this.state().on && this.state().pausedAt !== null);

  constructor() {
    window.addEventListener('storage', (e) => {
      if (e.key !== POMODORO_KEY && e.key !== null) return;
      const raw = readJson<{ session?: unknown }>(POMODORO_KEY);
      const next = readPomodoro(raw);
      // um site mais velho, aberto em outra aba, não conhece a rodada: a que esta aba sabe fica (senão a música do
      // estudo seria sorteada de novo no meio dele, e a conta recomeçaria do zero)
      const keep = !!raw && typeof raw === 'object' && raw.session === undefined;
      this.state.set(keep ? { ...next, session: Math.max(next.session, this.state().session) } : next);
    });
  }

  private write(next: PomodoroSave): void {
    if (next === this.state()) return;
    this.state.set(next);
    writeJson(POMODORO_KEY, next);
  }

  /** Começa um estudo agora. */
  start(now = Date.now()): void {
    this.write(start(this.state(), now));
  }

  /** Desliga; devolve como estava, para o Desfazer. */
  stop(now = Date.now()): PomodoroSave {
    const before = this.state();
    this.write(stop(before, now));
    return before;
  }

  /**
   * O Desfazer do desligar: o turno volta exatamente como estava (o tempo do meio contou); o que mudou nos
   * ajustes depois de desligar (a música, o link, os tempos, a skin) fica como está agora.
   * Os trechos de hoje voltam como eram.
   */
  restore(before: PomodoroSave): void {
    // o trecho que o desligar fechou volta a andar (senão a régua do dia o pintaria duas vezes)
    const { on, phase, startedAt, pausedAt, log, runAt } = before;
    this.write(readPomodoro({ ...this.state(), on, phase, startedAt, pausedAt, log, runAt }));
  }

  togglePause(now = Date.now()): void {
    const s = this.state();
    this.write(s.pausedAt === null ? pause(s, now) : resume(s, now));
  }

  skip(now = Date.now()): void {
    this.write(skip(this.state(), now));
  }

  /** O relógio andou: as fases que acabaram viram as próximas. */
  tick(now = Date.now()): void {
    this.write(advance(this.state(), now));
  }

  setMinutes(which: PomodoroPhase, minutes: number, now = Date.now()): void {
    this.write(setMinutes(this.state(), which, minutes, now));
  }

  /** Um atalho de tempo (25/5, 50/10, 90/20). */
  preset(study: number, rest: number, now = Date.now()): void {
    const s = setMinutes(this.state(), 'estudo', clampMinutes(study), now);
    this.write(setMinutes(s, 'pausa', clampMinutes(rest, s.rest), now));
  }

  setSkin(skin: PomodoroSkin): void {
    this.write({ ...this.state(), skin });
  }

  setCorner(corner: PomodoroCorner): void {
    if (corner !== this.state().corner) this.write({ ...this.state(), corner });
  }

  setMusic(music: boolean): void {
    if (music !== this.state().music) this.write({ ...this.state(), music });
  }
}
