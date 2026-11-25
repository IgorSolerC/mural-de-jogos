import { Injectable, computed, inject, signal } from '@angular/core';
import { POMODORO_KEY, nextSession } from './pomodoro';
import { PomodoroStore } from './pomodoro-store';
import { readJson, writeJson } from './storage';
import {
  PomodoroTrack,
  TRACKS_KEY,
  TrackPlace,
  TrackTurn,
  TracksSave,
  addTrack,
  chooseTrack,
  fetchTrackTitle,
  newTrackId,
  readTracks,
  removeTrack,
  renameTrack,
  restoreTrack,
  sessionTrack,
  setTrackOn,
  setTrackPlace,
  setTrackTitle,
  settleTurn,
} from './pomodoro-tracks';

/**
 * As músicas do Pomodoro deste aparelho (core/pomodoro-tracks.ts), na chave `meu-mural:pomodoro-musicas`, que a
 * limpeza do logout apaga pelo prefixo. Como o resto do Pomodoro, não vai para a nuvem; as abas abertas andam
 * juntas pelo aviso `storage` do navegador.
 *
 * Fica fora do bundle inicial: só a página do Pomodoro e o relógio do canto (que chegam num pedaço à parte) usam.
 */
@Injectable({ providedIn: 'root' })
export class PomodoroTracks {
  private readonly pomodoro = inject(PomodoroStore);
  // lido aqui, e não no módulo: a limpeza do logout roda depois dos imports (regra do CLAUDE.md)
  private readonly state = signal<TracksSave>(this.read());
  readonly save = this.state.asReadonly();
  readonly tracks = computed(() => this.state().tracks);
  /** A música desta rodada de estudo (null: o Pomodoro desligado, ou nenhuma marcada, e toca a rádio de sempre). */
  readonly current = computed(() => {
    const s = this.pomodoro.save();
    return s.on ? sessionTrack(this.state(), s.session) : null;
  });
  /** A escolhida à mão para o próximo estudo (na pausa, ou com o Pomodoro desligado). */
  readonly next = computed(() => {
    const s = this.pomodoro.save();
    const turn = this.state().turn;
    if (s.on && s.phase === 'estudo') return null;
    return turn?.session === nextSession(s) ? (this.state().tracks.find((t) => t.id === turn.id) ?? null) : null;
  });
  /**
   * A música que vai tocar: a deste estudo; fora dele, a do próximo (a escolhida à mão ou a que o sorteio dá, que só
   * depende da lista e da rodada). null: a rádio de sempre (nenhuma marcada).
   */
  readonly upcoming = computed(() => {
    const s = this.pomodoro.save();
    return s.on && s.phase === 'estudo' ? this.current() : sessionTrack(this.state(), nextSession(s));
  });
  /** Quantas entram no sorteio. */
  readonly marked = computed(() => this.state().tracks.filter((t) => t.on).length);

  constructor() {
    window.addEventListener('storage', (e) => {
      // sem lista guardada ainda, ela sai do link único de antes, que mora na chave do turno
      const legacy = e.key === POMODORO_KEY && readJson(TRACKS_KEY) === null;
      if (e.key === TRACKS_KEY || e.key === null || legacy) this.state.set(this.read());
    });
  }

  private read(): TracksSave {
    const legacy = readJson<{ musicUrl?: unknown }>(POMODORO_KEY)?.musicUrl;
    return readTracks(readJson(TRACKS_KEY), typeof legacy === 'string' ? legacy : '');
  }

  private write(next: TracksSave): void {
    if (next === this.state()) return;
    this.state.set(next);
    writeJson(TRACKS_KEY, next);
  }

  /** A rodada a que uma escolha à mão vale: a do estudo de agora, ou, na pausa e desligado, a do próximo estudo. */
  private choiceSession(): number {
    const s = this.pomodoro.save();
    return s.on && s.phase === 'estudo' ? s.session : nextSession(s);
  }

  /** O estudo começou: a música dele fica gravada (só a aba que toca chama). */
  settle(session: number): void {
    this.write(settleTurn(this.state(), session));
  }

  /** O Desfazer do desligar: a música do estudo que volta é a que tocava (uma escolha para o próximo, no meio, sai). */
  restoreTurn(turn: TrackTurn | null): void {
    const s = this.state();
    if (turn && s.tracks.some((t) => t.id === turn.id) && (s.turn?.id !== turn.id || s.turn.session !== turn.session)) this.write({ ...s, turn });
  }

  /** Liga ou desliga a música no sorteio. */
  setOn(id: string, on: boolean): void {
    this.write(setTrackOn(this.state(), id, on));
  }

  /** Põe o link na lista (e procura o título); devolve a música (a que já estava, se o link repete) e se já estava. */
  add(url: string): { track: PomodoroTrack; existed: boolean } | { full: true } | { invalid: true } {
    const r = addTrack(this.state(), url, newTrackId(this.state().tracks));
    this.write(r.save);
    if ('full' in r) return { full: true };
    if ('invalid' in r) return { invalid: true };
    if (!r.existed) this.lookTitles();
    return { track: r.track, existed: r.existed };
  }

  /** As músicas já procuradas nesta visita (a que não achou não é procurada de novo até recarregar). */
  private readonly looked = new Set<string>();
  private looking = false;

  /** Procura, uma por vez, o título das músicas que ainda não têm (as do YouTube, pelo oEmbed). */
  lookTitles(fetcher?: typeof fetch): void {
    if (this.looking) return;
    const next = this.state().tracks.find((t) => !t.title && !this.looked.has(t.url));
    if (!next) return;
    this.looked.add(next.url);
    this.looking = true;
    void fetchTrackTitle(next.url, fetcher)
      .then((title) => {
        if (title) this.write(setTrackTitle(this.state(), next.id, title));
      })
      .finally(() => {
        this.looking = false;
        this.lookTitles(fetcher);
      });
  }

  /** Onde a música parou (a playlist e o segundo), para continuar dali. */
  setPlace(id: string, place: TrackPlace | null): void {
    this.write(setTrackPlace(this.state(), id, place));
  }

  rename(id: string, name: string): void {
    this.write(renameTrack(this.state(), id, name));
  }

  /** Apaga; devolve o que o Desfazer precisa para pôr de volta. */
  remove(id: string): { track: PomodoroTrack; index: number; turn: TrackTurn | null } | null {
    const s = this.state();
    const index = s.tracks.findIndex((t) => t.id === id);
    if (index < 0) return null;
    const undo = { track: s.tracks[index], index, turn: s.turn };
    this.write(removeTrack(s, id));
    return undo;
  }

  restore(undo: { track: PomodoroTrack; index: number; turn: TrackTurn | null }): void {
    this.write(restoreTrack(this.state(), undo.track, undo.index, undo.turn));
  }

  /** Toca esta agora (na pausa e desligado: no próximo estudo). */
  choose(id: string): void {
    this.write(chooseTrack(this.state(), id, this.choiceSession()));
  }
}
