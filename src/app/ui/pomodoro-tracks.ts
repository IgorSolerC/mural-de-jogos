import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { PomodoroStore } from '../core/pomodoro-store';
import { MAX_TRACKS, MAX_TRACK_NAME, PomodoroTrack, isPlaylist, musicOf, trackName, trackOrigin, trackUrl } from '../core/pomodoro-tracks';
import { PomodoroTracks } from '../core/pomodoro-tracks-store';
import { httpsUrl } from '../core/widgets';
import { ICON, IconModule } from './icons';
import { Toasts } from './toast';

/**
 * As músicas do Pomodoro, na folha da página (pages/pomodoro-page.ts): a lista salva neste aparelho
 * (core/pomodoro-tracks-store.ts), cada uma numa linha de índice com a caixinha do sorteio, o nome (o título do
 * vídeo ou da playlist, ou o dado à mão), de onde vem, a da vez e os botões de tocar, renomear e tirar; embaixo,
 * o campo de pôr outra (um vídeo ou uma playlist do YouTube, ou um arquivo de som).
 */
@Component({
  selector: 'app-pomodoro-tracks',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pomodoro-tracks.html',
  styleUrl: './pomodoro-tracks.scss',
})
export class PomodoroTrackList {
  protected readonly tracks = inject(PomodoroTracks);
  private readonly store = inject(PomodoroStore);
  private readonly toasts = inject(Toasts);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly ICON = ICON;
  protected readonly nameMax = MAX_TRACK_NAME;
  private readonly s = this.store.save;

  constructor() {
    // as músicas ainda sem título (a de antes da lista, uma que não achou da outra vez): procura agora
    afterNextRender(() => this.tracks.lookTitles());
  }

  /** O estudo está andando ou pausado (não a pausa nem desligado): escolher uma música toca agora. */
  protected readonly inStudy = computed(() => this.s().on && this.s().phase === 'estudo');
  /** A música marcada na lista: a deste estudo; na pausa e desligado, a escolhida para o próximo (se tiver). */
  protected readonly turnTrack = computed(() => (this.inStudy() ? this.tracks.current() : this.tracks.next()));
  /** A música está tocando agora (o estudo andando, com a música ligada). */
  protected readonly playingNow = computed(() => {
    const s = this.s();
    return s.on && s.music && s.phase === 'estudo' && s.pausedAt === null;
  });

  /** O link que está sendo escrito no "Pôr uma música". */
  protected readonly draft = signal('');
  /** O que deu errado no último "Pôr na lista" (some quando o link muda). */
  protected readonly addError = signal<string | null>(null);
  /** A música sendo renomeada, e o nome que o campo mostrou ao abrir (o título que chega depois não o troca). */
  protected readonly renaming = signal<string | null>(null);
  protected renameStart = '';

  protected readonly musicHint = computed(() => {
    const n = this.tracks.tracks().length;
    if (n === 0) return 'Cole o link de um vídeo ou de uma playlist do YouTube, ou de um arquivo de som.';
    const m = this.tracks.marked();
    if (m === 0) return 'Nenhuma marcada: toca a rádio lofi de sempre. Marque as que entram no sorteio.';
    if (m === 1) return n === 1 ? 'Ela toca em todo estudo. Com mais de uma marcada, cada estudo sorteia uma.' : 'Só uma marcada: ela toca em todo estudo. Marque mais para sortear.';
    return `Cada estudo sorteia uma das ${m} marcadas, sem repetir a do estudo de antes.`;
  });

  protected name(t: PomodoroTrack): string {
    return trackName(t);
  }

  /** De onde vem; a playlist diz também em que vídeo parou (ela continua dali quando tocar de novo). */
  protected origin(t: PomodoroTrack): string {
    const from = trackOrigin(t.url);
    return isPlaylist(musicOf(t.url)) && t.place?.video ? `${from}, parou no ${t.place.index + 1}º vídeo` : from;
  }

  protected typeDraft(value: string): void {
    this.draft.set(value);
    this.addError.set(null);
  }

  /** "Pôr na lista": o link que o site sabe tocar entra no fim da lista, e o título é procurado. */
  protected addTrack(e: Event): void {
    e.preventDefault();
    const v = this.draft().trim();
    if (!v) {
      this.addError.set('Cole o link antes: um vídeo ou uma playlist do YouTube, ou um arquivo de som.');
      return;
    }
    if (!trackUrl(v)) {
      this.addError.set(
        httpsUrl(v)
          ? 'Esse link não é de um som que dê para tocar aqui: use um vídeo ou uma playlist do YouTube, ou um arquivo de áudio (.mp3, .ogg, .wav…).'
          : 'O link precisa começar com https://',
      );
      return;
    }
    const r = this.tracks.add(v);
    if ('invalid' in r) return;
    if ('full' in r) {
      this.addError.set(`A lista já tem ${MAX_TRACKS} músicas: tire uma para pôr outra.`);
      return;
    }
    if (r.existed) {
      this.addError.set(`Essa já está na lista, como "${trackName(r.track)}".`);
      return;
    }
    this.draft.set('');
  }

  protected choose(id: string): void {
    this.tracks.choose(id);
  }

  protected toggleOn(id: string, on: boolean): void {
    this.tracks.setOn(id, on);
  }

  protected startRename(id: string): void {
    const t = this.tracks.tracks().find((x) => x.id === id);
    if (!t) return;
    this.renameStart = trackName(t);
    this.renaming.set(id);
    afterNextRender(
      () => {
        const input = this.host.nativeElement.querySelector<HTMLInputElement>(`[data-faixa-campo="${id}"]`);
        input?.focus();
        input?.select();
      },
      { injector: this.injector },
    );
  }

  protected rename(e: Event, id: string, name: string): void {
    e.preventDefault();
    this.tracks.rename(id, name);
    this.stopRename(id);
  }

  /** Sai do renomear e devolve o foco ao lápis da música. */
  protected stopRename(id: string): void {
    if (this.renaming() !== id) return;
    this.renaming.set(null);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-faixa-lapis="${id}"]`)?.focus(), { injector: this.injector });
  }

  /** Tira da lista, com o Desfazer. */
  protected remove(id: string): void {
    const undo = this.tracks.remove(id);
    if (!undo) return;
    this.toasts.show(`"${trackName(undo.track)}" saiu da lista.`, { label: 'Desfazer', run: () => this.tracks.restore(undo) });
  }
}
