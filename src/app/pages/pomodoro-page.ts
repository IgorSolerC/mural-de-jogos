import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Clock } from '../core/clock';
import { chime, wakeChime } from '../core/chime';
import {
  POMODORO_CORNERS,
  POMODORO_PRESETS,
  POMODORO_SKINS,
  PomodoroCorner,
  PomodoroPhase,
  PomodoroSkin,
  doneToday,
  phaseEnd,
  phaseMs,
  remainingMs,
} from '../core/pomodoro';
import { PomodoroStore } from '../core/pomodoro-store';
import { parseAudio } from '../core/widgets';
import { ICON, IconModule } from '../ui/icons';
import { MinutesRuler } from '../ui/minutes-ruler';
import { PomodoroDial } from '../ui/pomodoro-dial';
import { Toasts } from '../ui/toast';

/** O tempo das skins da cartela com o Pomodoro desligado: um que mostra os quatro algarismos diferentes. */
const SAMPLE_MS = (18 * 60 + 42) * 1000;
/** No máximo tantos tomatinhos desenhados; o resto vira "+N". */
const MAX_TOMATOES = 8;

/** "14h35", a hora do aparelho (escrita assim para não ser lida como o tempo que falta, que é "18:36"). */
function hourOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * O Pomodoro (`/extras/pomodoro`, PLANO-POMODORO.md, seção 4): a bancada de foco. À esquerda, a vitrine com o
 * relógio grande na skin escolhida e o botão de começar; à direita, a folha de súmula dos jogos com os tempos e
 * a música; embaixo, a parede de relógios (as 12 skins, vivas) e o canto da tela.
 *
 * Tudo vale na hora: mudar um tempo com o turno andando já muda o que falta.
 */
@Component({
  selector: 'app-pomodoro-page',
  imports: [IconModule, MinutesRuler, PomodoroDial],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pomodoro-page.html',
  styleUrl: './pomodoro-page.scss',
})
export class PomodoroPage {
  protected readonly store = inject(PomodoroStore);
  private readonly clock = inject(Clock);
  private readonly toasts = inject(Toasts);

  protected readonly ICON = ICON;
  protected readonly SKINS = POMODORO_SKINS;
  protected readonly CORNERS = POMODORO_CORNERS;
  protected readonly PRESETS = POMODORO_PRESETS;

  constructor() {
    this.clock.use();
  }

  protected readonly s = this.store.save;
  protected readonly on = computed(() => this.s().on);
  protected readonly paused = computed(() => this.s().pausedAt !== null);
  /** O que falta (desligado: o estudo inteiro, pronto para começar). */
  protected readonly left = computed(() => (this.on() ? remainingMs(this.s(), this.clock.now()) : phaseMs(this.s(), 'estudo')));
  protected readonly total = computed(() => (this.on() ? phaseMs(this.s()) : phaseMs(this.s(), 'estudo')));
  protected readonly phase = computed<PomodoroPhase>(() => (this.on() ? this.s().phase : 'estudo'));
  /** As skins da cartela: o tempo de verdade com o Pomodoro ligado; desligado, um de amostra. */
  protected readonly sampleMs = computed(() => (this.on() ? this.left() : SAMPLE_MS));
  protected readonly sampleTotal = computed(() => (this.on() ? this.total() : 25 * 60_000));

  protected readonly done = computed(() => doneToday(this.s(), this.clock.now()));
  protected readonly tomatoes = computed(() => Array.from({ length: Math.min(this.done(), MAX_TOMATOES) }, (_, i) => i));

  /** A linha embaixo do relógio: o estado e a hora em que a fase acaba. */
  protected readonly status = computed(() => {
    const s = this.s();
    if (!s.on) return `Desligado. Começa com ${s.study} min de estudo e ${s.rest} de pausa.`;
    if (s.pausedAt !== null) {
      const min = Math.ceil(remainingMs(s, this.clock.now()) / 60_000);
      return `Pausado. Faltam ${min} min de ${s.phase === 'estudo' ? 'estudo' : 'pausa'}.`;
    }
    const at = hourOf(phaseEnd(s));
    const min = Math.ceil(remainingMs(s, this.clock.now()) / 60_000);
    const left = min <= 1 ? 'Falta menos de 1 min' : `Faltam ${min} min`;
    return s.phase === 'estudo' ? `${left} de estudo. A pausa começa às ${at}.` : `${left} de pausa. O estudo volta às ${at}.`;
  });

  /** O link da música digitado e ainda não aceito (o que o site não sabe tocar). */
  protected readonly draftUrl = signal<string | null>(null);
  /** Ainda no campo, com o link pela metade: o erro espera a pessoa sair dele. */
  private readonly typing = signal(false);
  protected readonly urlError = computed(() => {
    const d = this.draftUrl();
    return !this.typing() && d !== null && d.trim() !== '' && !parseAudio(d);
  });
  protected readonly musicHint = computed(() => {
    const url = this.s().musicUrl;
    const src = url ? parseAudio(url) : null;
    if (!src) return 'Sem link, toca a rádio lofi de sempre, do YouTube.';
    if (src.kind === 'youtube') return 'Toca o vídeo do link (e a lista dele, se tiver).';
    if (src.kind === 'vimeo') return 'Toca o vídeo do Vimeo do link, em volta.';
    return 'Toca o arquivo do link, em volta.';
  });

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
    const before = this.store.stop();
    this.toasts.show('Pomodoro desligado.', { label: 'Desfazer', run: () => this.store.restore(before) });
  }

  protected setMinutes(which: PomodoroPhase, minutes: number): void {
    this.store.setMinutes(which, minutes);
  }

  protected preset(study: number, rest: number): void {
    this.store.preset(study, rest);
  }

  protected isPreset(study: number, rest: number): boolean {
    return this.s().study === study && this.s().rest === rest;
  }

  protected setSkin(skin: PomodoroSkin): void {
    this.store.setSkin(skin);
  }

  protected setCorner(corner: PomodoroCorner): void {
    this.store.setCorner(corner);
  }

  protected toggleMusic(): void {
    this.store.setMusic(!this.s().music);
  }

  /** Digitando: o link que o site sabe tocar (ou o campo vazio) já vale; o erro só aparece ao sair do campo. */
  protected typeUrl(value: string): void {
    const v = value.trim();
    if (!v || parseAudio(v)) {
      this.draftUrl.set(null);
      this.store.setMusicUrl(v);
      return;
    }
    this.draftUrl.set(value);
    this.typing.set(true);
  }

  /** O link sai do campo: vale se o site souber tocar (vazio é a música padrão). */
  protected commitUrl(value: string): void {
    this.typing.set(false);
    const v = value.trim();
    if (v && !parseAudio(v)) {
      this.draftUrl.set(v);
      return;
    }
    this.draftUrl.set(null);
    this.store.setMusicUrl(v);
  }

  /** O sininho de amostra, para ouvir antes (e acordar o som da página). */
  protected testChime(): void {
    wakeChime();
    setTimeout(() => chime(this.phase() === 'estudo' ? 'pausa' : 'estudo'), 60);
  }

  protected skinLabel(skin: PomodoroSkin): string {
    return POMODORO_SKINS.find((k) => k.value === skin)?.label ?? '';
  }
}
