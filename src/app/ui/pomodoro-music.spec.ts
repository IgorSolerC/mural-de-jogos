import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { POMODORO_KEY } from '../core/pomodoro';
import { TRACKS_KEY, musicOf } from '../core/pomodoro-tracks';
import { PomodoroTracks } from '../core/pomodoro-tracks-store';
import { EmbedBridge, EmbedCommand, EmbedReport } from './embed-bridge';
import { PomodoroMusic, youtubeEmbed } from './pomodoro-music';

const PL = 'PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17';
const PLAYLIST = `https://www.youtube.com/playlist?list=${PL}`;
const ORIGIN = 'http://localhost:4200';
const yt = (url: string) => musicOf(url) as Extract<NonNullable<ReturnType<typeof musicOf>>, { kind: 'youtube' }>;
const params = (url: string) => new URL(url).searchParams;

describe('Pomodoro: o player da música', () => {
  it('a playlist toca no player da série, em volta; com onde parou, começa no vídeo e no segundo dela', () => {
    const fresh = youtubeEmbed(yt(PLAYLIST), null, ORIGIN);
    expect(new URL(fresh).pathname).toBe('/embed/videoseries');
    expect(params(fresh).get('list')).toBe(PL);
    expect(params(fresh).get('loop')).toBe('1');
    expect(params(fresh).get('enablejsapi')).toBe('1');
    expect(params(fresh).get('origin')).toBe(ORIGIN);
    expect(params(fresh).has('start')).toBeFalse();

    const back = youtubeEmbed(yt(PLAYLIST), { video: 'xXZwZ0DolJc', index: 1, t: 30 }, ORIGIN);
    expect(new URL(back).pathname).toBe('/embed/xXZwZ0DolJc');
    expect(params(back).get('list')).toBe(PL);
    expect(params(back).get('index')).toBe('1');
    expect(params(back).get('start')).toBe('30');
  });

  it('o vídeo sozinho repete; a rádio segue sem fim; o tempo do link vale', () => {
    const one = youtubeEmbed(yt('https://youtu.be/jfKfPfyJRdk?t=90'), null, ORIGIN);
    expect(new URL(one).pathname).toBe('/embed/jfKfPfyJRdk');
    expect(params(one).get('loop')).toBe('1');
    expect(params(one).get('playlist')).toBe('jfKfPfyJRdk');
    expect(params(one).get('start')).toBe('90');
    const radio = youtubeEmbed(yt('https://www.youtube.com/watch?v=XaWjY0pGhFs&list=RDXaWjY0pGhFs'), null, ORIGIN);
    expect(params(radio).get('list')).toBe('RDXaWjY0pGhFs');
    expect(params(radio).has('loop')).toBeFalse();
  });

  describe('montado', () => {
    @Component({
      imports: [PomodoroMusic],
      template: `<app-pomodoro-music [url]="url()" [trackId]="id()" [playing]="playing()" />`,
    })
    class Host {
      readonly url = signal(PLAYLIST);
      readonly id = signal<string | null>('m1');
      readonly playing = signal(true);
      readonly music = viewChild.required(PomodoroMusic);
    }

    let sent: EmbedCommand[];
    beforeEach(() => {
      localStorage.removeItem(POMODORO_KEY);
      localStorage.setItem(TRACKS_KEY, JSON.stringify({ v: 1, tracks: [{ id: 'm1', url: PLAYLIST }, { id: 'm2', url: 'https://youtu.be/jfKfPfyJRdk' }], turn: null }));
      sent = [];
      spyOn(EmbedBridge.prototype, 'send').and.callFake((c: EmbedCommand) => void sent.push(c));
      // o player de verdade não conversa nos testes: o que ele conta vem de cada teste
      spyOn(EmbedBridge.prototype, 'loaded');
      TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    });
    afterEach(() => {
      localStorage.removeItem(TRACKS_KEY);
      localStorage.removeItem(POMODORO_KEY);
    });

    const report = (h: Host, r: EmbedReport) => (h.music() as unknown as { onReport(r: EmbedReport): void }).onReport(r);

    it('guarda na música em que vídeo da playlist está, e volta ao primeiro se a lista acabar', async () => {
      const f = TestBed.createComponent(Host);
      await f.whenStable();
      const tracks = TestBed.inject(PomodoroTracks);
      const h = f.componentInstance;
      report(h, { state: 'playing', time: 0 });
      report(h, { video: 'xXZwZ0DolJc', index: 1, count: 150, time: 0 });
      // a troca de vídeo guarda na hora
      expect(tracks.tracks()[0].place).toEqual({ video: 'xXZwZ0DolJc', index: 1, t: 0 });
      report(h, { time: 42 });
      // o segundo espera os 10 s; a pausa guarda
      h.playing.set(false);
      await f.whenStable();
      await new Promise((r) => setTimeout(r, 1700));
      expect(tracks.tracks()[0].place).toEqual({ video: 'xXZwZ0DolJc', index: 1, t: 42 });
      expect(sent).toContain({ do: 'pause' });
      // tocando de novo, o fim da lista volta ao primeiro vídeo (e não repete o último)
      h.playing.set(true);
      await f.whenStable();
      sent = [];
      // no meio da lista, o player segue sozinho
      report(h, { state: 'ended' });
      expect(sent).not.toContain({ do: 'at', i: 0 });
      report(h, { state: 'playing', video: 'is8UDe2PhKQ', index: 149 });
      sent = [];
      report(h, { state: 'ended' });
      expect(sent).toContain({ do: 'at', i: 0 });
      expect(sent).not.toContain({ do: 'seek', t: 0 });
    });

    it('um vídeo da playlist que não toca é pulado; vários seguidos, a playlist conta como fora do ar', async () => {
      const f = TestBed.createComponent(Host);
      await f.whenStable();
      const h = f.componentInstance;
      const failed = jasmine.createSpy('failed');
      h.music().failed.subscribe(failed);
      report(h, { state: 'playing', video: 'BZ4UzthYTss', index: 3, count: 150 });
      sent = [];
      report(h, { error: true });
      expect(sent).toContain({ do: 'at', i: 4 });
      // o player conta o vídeo novo antes do erro dele: o próximo tentado é o 5, e não o 6
      report(h, { video: 'zzzzzzzzzz1', index: 4 });
      report(h, { error: true });
      expect(sent).toContain({ do: 'at', i: 5 });
      expect(failed).not.toHaveBeenCalled();
      // tocou o seguinte: a conta recomeça
      report(h, { state: 'playing', video: 'xXZwZ0DolJc', index: 4 });
      for (let i = 0; i < 5; i++) report(h, { error: true });
      expect(failed).not.toHaveBeenCalled();
      report(h, { error: true });
      expect(failed).toHaveBeenCalledTimes(1);
      // pulou e o player ficou calado: também conta como fora do ar
      report(h, { state: 'playing', video: 'xXZwZ0DolJc', index: 4 });
      jasmine.clock().install();
      try {
        report(h, { error: true });
        jasmine.clock().tick(7100);
        expect(failed).toHaveBeenCalledTimes(2);
      } finally {
        jasmine.clock().uninstall();
      }
      // sem saber quantos vídeos a lista tem, o fim de um vídeo não volta ao primeiro
      h.url.set(`https://www.youtube.com/playlist?list=PLabcdefgh`);
      await f.whenStable();
      sent = [];
      report(h, { state: 'playing' });
      report(h, { state: 'ended' });
      expect(sent).not.toContain({ do: 'at', i: 0 });
    });

    it('o que o player conta antes de tocar não apaga onde ela tinha parado', async () => {
      const tracks = TestBed.inject(PomodoroTracks);
      tracks.setPlace('m1', { video: 'xXZwZ0DolJc', index: 1, t: 30 });
      const f = TestBed.createComponent(Host);
      f.componentInstance.playing.set(false);
      await f.whenStable();
      report(f.componentInstance, { video: 'BZ4UzthYTss', index: 0, time: 0 });
      f.destroy();
      expect(tracks.tracks()[0].place).toEqual({ video: 'xXZwZ0DolJc', index: 1, t: 30 });
    });

    it('trocar de música guarda onde a outra parou, e a nova começa de onde ela tinha parado', async () => {
      const tracks = TestBed.inject(PomodoroTracks);
      tracks.setPlace('m2', { video: null, index: 0, t: 75 });
      const f = TestBed.createComponent(Host);
      await f.whenStable();
      const h = f.componentInstance;
      report(h, { state: 'playing' });
      report(h, { video: 'BZ4UzthYTss', index: 0, time: 12 });
      h.url.set('https://youtu.be/jfKfPfyJRdk');
      h.id.set('m2');
      await f.whenStable();
      expect(tracks.tracks()[0].place).toEqual({ video: 'BZ4UzthYTss', index: 0, t: 12 });
      const frame = f.nativeElement.querySelector('iframe') as HTMLIFrameElement;
      expect(frame.src).toContain('/embed/jfKfPfyJRdk');
      expect(params(frame.src).get('start')).toBe('75');
    });
  });
});
