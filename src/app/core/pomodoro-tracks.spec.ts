import {
  AddResult,
  DEFAULT_TRACK_ID,
  MAX_TRACKS,
  LEGACY_TRACK_ID,
  MAX_TRACK_NAME,
  TracksSave,
  addTrack,
  chooseTrack,
  drawTrack,
  fetchTrackTitle,
  isPlaylist,
  musicOf,
  readTracks,
  removeTrack,
  renameTrack,
  restoreTrack,
  sameTrack,
  sessionTrack,
  setTrackOn,
  setTrackPlace,
  setTrackTitle,
  settleTurn,
  titleLookupUrl,
  trackName,
  trackOrigin,
  trackUrl,
} from './pomodoro-tracks';
import { DEFAULT_MUSIC } from './pomodoro';

const YT = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
const MP3 = 'https://exemplo.com/sons/chuva_forte.mp3';

const list = (...urls: string[]): TracksSave => {
  let s: TracksSave = { v: 1, tracks: [], turn: null };
  urls.forEach((u, i) => (s = addTrack(s, u, `m${i + 1}`).save));
  return s;
};

describe('Pomodoro: as músicas salvas', () => {
  it('sem nada guardado, a lista começa com a rádio de sempre', () => {
    const s = readTracks(null);
    expect(s.tracks.length).toBe(1);
    expect(s.tracks[0].id).toBe(DEFAULT_TRACK_ID);
    expect(s.tracks[0].url).toBe(DEFAULT_MUSIC);
    expect(trackName(s.tracks[0])).toBe('Rádio lofi de sempre');
    expect(s.tracks[0].on).toBeTrue();
  });

  it('a música única de antes da lista vira o primeiro item dela (nada se perde)', () => {
    const s = readTracks(null, ' https://exemplo.com/foco.mp3 ');
    expect(s.tracks).toEqual([{ id: LEGACY_TRACK_ID, url: 'https://exemplo.com/foco.mp3', name: '', title: '', on: true, place: null }]);
    expect(trackName(s.tracks[0])).toBe('foco');
    // o link de antes que não toca cai na rádio de sempre
    expect(readTracks(null, 'https://exemplo.com/pagina').tracks[0].id).toBe(DEFAULT_TRACK_ID);
    // com a lista já guardada, o link de antes não volta
    expect(readTracks({ tracks: [] }, 'https://exemplo.com/foco.mp3').tracks).toEqual([]);
  });

  it('lê o guardado item a item: o que não toca, ou repete o id, sai', () => {
    const s = readTracks({
      tracks: [
        { id: 'a1', url: YT, name: '  Para   estudar ', title: 'Lofi', on: false },
        { id: 'a1', url: MP3 },
        { id: 'b2', url: 'https://exemplo.com/pagina' },
        { id: '../x', url: MP3 },
        { id: 'c3', url: MP3, name: 42 },
        'lixo',
      ],
      turn: { id: 'c3', session: 4 },
    });
    expect(s.tracks).toEqual([
      { id: 'a1', url: YT, name: 'Para estudar', title: 'Lofi', on: false, place: null },
      { id: 'c3', url: MP3, name: '', title: '', on: true, place: null },
    ]);
    expect(s.turn).toEqual({ id: 'c3', session: 4 });
    // a rodada de uma música que não está mais na lista não vale
    expect(readTracks({ tracks: [{ id: 'a1', url: YT }], turn: { id: 'zz', session: 1 } }).turn).toBeNull();
  });

  it('pôr na lista: entra no fim, ligada; o mesmo link escrito de outro jeito não entra de novo', () => {
    const s = list(YT, MP3);
    expect(s.tracks.map((t) => t.id)).toEqual(['m1', 'm2']);
    const again = addTrack(s, 'https://youtu.be/jfKfPfyJRdk', 'm3') as Extract<AddResult, { existed: boolean }>;
    expect(again.existed).toBeTrue();
    expect(again.save).toBe(s);
    expect(again.track.id).toBe('m1');
    expect(sameTrack(YT, 'https://m.youtube.com/watch?feature=x&v=jfKfPfyJRdk')).toBeTrue();
    // o mesmo vídeo com uma lista é outra música
    expect(sameTrack(YT, YT + '&list=PLx1234')).toBeFalse();
    // o link que não toca não entra
    expect('invalid' in addTrack(s, 'https://exemplo.com/pagina', 'mz')).toBeTrue();
    // cheia, não entra (e diz)
    const full = list(...Array.from({ length: MAX_TRACKS }, (_, i) => `https://exemplo.com/${i}.mp3`));
    const over = addTrack(full, MP3, 'mx');
    expect('full' in over).toBeTrue();
    expect(over.save).toBe(full);
  });

  it('o nome: o dado à mão, senão o título achado, senão de onde vem', () => {
    let s = list(YT);
    expect(trackName(s.tracks[0])).toBe('Vídeo do YouTube');
    s = setTrackTitle(s, 'm1', 'lofi hip hop radio');
    expect(trackName(s.tracks[0])).toBe('lofi hip hop radio');
    s = renameTrack(s, 'm1', '  Foco da manhã ');
    expect(trackName(s.tracks[0])).toBe('Foco da manhã');
    // o título que chega depois não passa por cima do nome dado
    s = setTrackTitle(s, 'm1', 'outro título');
    expect(trackName(s.tracks[0])).toBe('Foco da manhã');
    // renomear para vazio (ou para o próprio título) volta ao título
    expect(trackName(renameTrack(s, 'm1', '   ').tracks[0])).toBe('outro título');
    expect(renameTrack(s, 'm1', 'outro título').tracks[0].name).toBe('');
    // o nome tem tamanho máximo
    expect(renameTrack(s, 'm1', 'x'.repeat(500)).tracks[0].name.length).toBe(MAX_TRACK_NAME);
    // mudar para o mesmo não muda nada
    expect(renameTrack(s, 'm1', 'Foco da manhã')).toBe(s);
    // o nome de onde vem (à mostra antes do título) não vira um nome dado: o título que chega aparece
    let fresh = list(YT);
    fresh = renameTrack(fresh, 'm1', 'Vídeo do YouTube');
    expect(fresh.tracks[0].name).toBe('');
    expect(trackName(setTrackTitle(fresh, 'm1', 'lofi').tracks[0])).toBe('lofi');
  });

  it('de onde vem cada uma', () => {
    expect(trackOrigin(YT)).toBe('Vídeo do YouTube');
    expect(trackOrigin('https://vimeo.com/76979871')).toBe('Vídeo do Vimeo');
    expect(trackOrigin(MP3)).toBe('Arquivo .mp3');
    expect(trackName(list(MP3).tracks[0])).toBe('chuva forte');
  });

  it('tirar da lista e o Desfazer, que põe de volta no mesmo lugar e na rodada', () => {
    let s = chooseTrack(list(YT, MP3, 'https://exemplo.com/b.ogg'), 'm2', 3);
    const turn = s.turn;
    const track = s.tracks[1];
    s = removeTrack(s, 'm2');
    expect(s.tracks.map((t) => t.id)).toEqual(['m1', 'm3']);
    expect(s.turn).toBeNull();
    s = restoreTrack(s, track, 1, turn);
    expect(s.tracks.map((t) => t.id)).toEqual(['m1', 'm2', 'm3']);
    expect(s.turn).toEqual({ id: 'm2', session: 3 });
    // já de volta (outra aba desfez), não entra duas vezes
    expect(restoreTrack(s, track, 1, turn)).toBe(s);
  });

  it('a música de uma rodada: a escolhida para ela, senão a sorteada; sem nenhuma marcada, nada (a rádio de sempre)', () => {
    const s = list(YT, MP3);
    expect(sessionTrack(chooseTrack(s, 'm2', 4), 4)?.id).toBe('m2');
    // a escolha vale só para a rodada dela
    expect(sessionTrack(chooseTrack(s, 'm2', 4), 5)?.id).toBe('m1');
    expect(chooseTrack(s, 'nenhuma', 1)).toBe(s);
    expect(sessionTrack({ v: 1, tracks: [], turn: null }, 1)).toBeNull();
    expect(sessionTrack(setTrackOn(setTrackOn(s, 'm1', false), 'm2', false), 1)).toBeNull();
  });

  it('o título vem do oEmbed do YouTube: da playlist, quando o link tem uma lista de verdade', async () => {
    expect(titleLookupUrl(YT)).toBe(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=jfKfPfyJRdk')}`);
    expect(titleLookupUrl(YT + '&list=PLabc123')).toContain(encodeURIComponent('https://www.youtube.com/playlist?list=PLabc123'));
    // a rádio (RD…) não tem página própria: o do vídeo
    expect(titleLookupUrl(DEFAULT_MUSIC)).toContain(encodeURIComponent('watch?v=XaWjY0pGhFs'));
    expect(titleLookupUrl(MP3)).toBeNull();

    const ok = jasmine.createSpy('fetch').and.resolveTo(new Response(JSON.stringify({ title: '  lofi  hip hop ' }), { status: 200 }));
    expect(await fetchTrackTitle(YT, ok)).toBe('lofi hip hop');
    expect(ok.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ credentials: 'omit' }));
    const gone = jasmine.createSpy('fetch').and.resolveTo(new Response('Not Found', { status: 404 }));
    expect(await fetchTrackTitle(YT, gone)).toBe('');
    const offline = jasmine.createSpy('fetch').and.rejectWith(new TypeError('Failed to fetch'));
    expect(await fetchTrackTitle(YT, offline)).toBe('');
    const never = jasmine.createSpy('fetch');
    expect(await fetchTrackTitle(MP3, never)).toBe('');
    expect(never).not.toHaveBeenCalled();
  });
});

describe('Pomodoro: as playlists do YouTube', () => {
  const PL = 'PLOHoVaTp8R7dfrJW5pumS0iD_dhlXKv17';

  it('o link só da playlist toca (a página dela, o watch só com a lista, o player da série)', () => {
    for (const url of [`https://www.youtube.com/playlist?list=${PL}`, `https://m.youtube.com/watch?list=${PL}`, `https://music.youtube.com/playlist?list=${PL}`, `https://www.youtube-nocookie.com/embed/videoseries?list=${PL}`]) {
      expect(musicOf(url)).withContext(url).toEqual({ kind: 'youtube', id: null, start: 0, list: PL });
      expect(trackUrl(url)).withContext(url).toBe(url);
    }
    // a rádio de um vídeo sem o vídeo não existe; outro site com list= não é do YouTube
    expect(musicOf('https://www.youtube.com/playlist?list=RDXaWjY0pGhFs')).toBeNull();
    expect(musicOf(`https://exemplo.com/playlist?list=${PL}`)).toBeNull();
    expect(musicOf('https://www.youtube.com/playlist')).toBeNull();
    // o vídeo com a lista: começa nele, e segue na lista
    expect(musicOf(`https://www.youtube.com/watch?v=jfKfPfyJRdk&list=${PL}`)).toEqual({ kind: 'youtube', id: 'jfKfPfyJRdk', start: 0, list: PL });
  });

  it('playlist e rádio: de onde vêm, o título e a mesma playlist aberta em outro vídeo', () => {
    expect(isPlaylist(musicOf(`https://www.youtube.com/playlist?list=${PL}`))).toBeTrue();
    expect(isPlaylist(musicOf(DEFAULT_MUSIC))).toBeFalse();
    expect(trackOrigin(`https://www.youtube.com/playlist?list=${PL}`)).toBe('Playlist do YouTube');
    expect(trackOrigin(DEFAULT_MUSIC)).toBe('Rádio do YouTube');
    expect(trackName(list(`https://www.youtube.com/playlist?list=${PL}`).tracks[0])).toBe('Playlist do YouTube');
    expect(titleLookupUrl(`https://www.youtube.com/playlist?list=${PL}`)).toContain(encodeURIComponent(`https://www.youtube.com/playlist?list=${PL}`));
    expect(sameTrack(`https://www.youtube.com/playlist?list=${PL}`, `https://www.youtube.com/watch?v=jfKfPfyJRdk&list=${PL}&index=4`)).toBeTrue();
  });

  it('onde parou: guardado e conferido, e o mesmo lugar não regrava', () => {
    let s = list(`https://www.youtube.com/playlist?list=${PL}`);
    s = setTrackPlace(s, 'm1', { video: 'xXZwZ0DolJc', index: 1, t: 30.7 });
    expect(s.tracks[0].place).toEqual({ video: 'xXZwZ0DolJc', index: 1, t: 30 });
    expect(setTrackPlace(s, 'm1', { video: 'xXZwZ0DolJc', index: 1, t: 30.2 })).toBe(s);
    expect(readTracks(JSON.parse(JSON.stringify(s))).tracks[0].place).toEqual({ video: 'xXZwZ0DolJc', index: 1, t: 30 });
    // o guardado estranho cai fora
    const odd = readTracks({ tracks: [{ id: 'a1', url: MP3, place: { video: '<script>', index: -2, t: 'x' } }, { id: 'b2', url: MP3, place: { t: 12 } }] });
    expect(odd.tracks[0].place).toBeNull();
    expect(odd.tracks[1].place).toEqual({ video: null, index: 0, t: 12 });
    // de volta ao começo
    expect(setTrackPlace(s, 'm1', null).tracks[0].place).toBeNull();
  });
});

describe('Pomodoro: o sorteio de cada estudo', () => {
  const many = () => list(...Array.from({ length: 6 }, (_, i) => `https://exemplo.com/${i}.mp3`));

  it('sorteia só entre as marcadas, e todas as abas sorteiam a mesma', () => {
    let s = many();
    s = setTrackOn(setTrackOn(s, 'm1', false), 'm4', false);
    const seen = new Set<string>();
    for (let session = 1; session <= 200; session++) {
      const t = drawTrack(s, session)!;
      expect(['m2', 'm3', 'm5', 'm6']).toContain(t.id);
      expect(drawTrack(JSON.parse(JSON.stringify(s)), session)!.id).toBe(t.id);
      seen.add(t.id);
    }
    // todas aparecem
    expect(seen.size).toBe(4);
  });

  it('não repete a do estudo de antes (com outra marcada), e a do estudo fica gravada', () => {
    let s = setTrackOn(many(), 'm3', false);
    for (let session = 1; session <= 100; session++) {
      const before = s.turn?.id;
      s = settleTurn(s, session);
      expect(s.turn!.session).toBe(session);
      if (before) expect(s.turn!.id).not.toBe(before);
      // gravada, desmarcar no meio do estudo não troca o que toca
      const now = s.turn!.id;
      expect(sessionTrack(setTrackOn(s, now, false), session)!.id).toBe(now);
      expect(settleTurn(s, session)).toBe(s);
    }
    // com uma marcada só, ela toca sempre (repetindo)
    let one = setTrackOn(setTrackOn(list(YT, MP3), 'm2', false), 'm1', true);
    one = settleTurn(one, 1);
    expect(settleTurn(one, 2).turn).toEqual({ id: 'm1', session: 2 });
    // nenhuma marcada: nada gravado
    const none = setTrackOn(setTrackOn(list(YT, MP3), 'm1', false), 'm2', false);
    expect(settleTurn(none, 1)).toBe(none);
  });

  it('a escolhida à mão para o próximo estudo vale quando ele começa, e não depois', () => {
    let s = chooseTrack(many(), 'm5', 3);
    s = settleTurn(s, 3);
    expect(s.turn).toEqual({ id: 'm5', session: 3 });
    s = settleTurn(s, 4);
    expect(s.turn!.id).not.toBe('m5');
  });
});
