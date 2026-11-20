import { DEFAULT_MUSIC } from './pomodoro';
import { AudioSource, httpsUrl, parseAudio } from './widgets';

/**
 * As músicas do Pomodoro (a lista salva, PLANO-POMODORO.md, seção 7): cada uma com o link, o título que o site
 * achou (o do vídeo ou da playlist, pelo oEmbed do YouTube) e o nome que a pessoa deu, se renomeou. Moram neste
 * aparelho, como o resto do Pomodoro, numa chave à parte (`meu-mural:pomodoro-musicas`): o turno é gravado a
 * cada troca de fase, e um site mais velho aberto em outra aba, que não conhece a lista, regrava só o turno.
 *
 * Tudo aqui é puro; quem grava e acompanha as outras abas é core/pomodoro-tracks-store.ts.
 */

/** A chave do aparelho (o prefixo é o que a limpeza do logout procura, ver core/browser-reset.ts). */
export const TRACKS_KEY = 'meu-mural:pomodoro-musicas';

/** Quantas músicas a lista guarda (o bastante para qualquer um; o limite só protege o localStorage). */
export const MAX_TRACKS = 200;
/** O nome dado à mão. */
export const MAX_TRACK_NAME = 120;
const MAX_URL = 2000;

/** A música que já vem na lista (a rádio lofi de sempre, pedido do dono). */
export const DEFAULT_TRACK_ID = 'radio-lofi';
/** A música única de antes da lista, que virou o primeiro item dela. */
export const LEGACY_TRACK_ID = 'musica-antiga';

export interface PomodoroTrack {
  id: string;
  url: string;
  /** O nome que a pessoa deu ('' = o título achado). */
  name: string;
  /** O título achado (o do vídeo ou da playlist); '' = ainda não achou. */
  title: string;
  /** Entra no sorteio de cada estudo. */
  on: boolean;
  /** Onde parou (o vídeo da playlist e o segundo), para continuar dali quando ela tocar de novo; null: do começo. */
  place: TrackPlace | null;
}

/** Onde a música parou: numa playlist, o vídeo (o id e a posição na lista); e o segundo dentro dele. */
export interface TrackPlace {
  /** O vídeo da playlist em que parou (null: a música não é uma lista). */
  video: string | null;
  index: number;
  t: number;
}

/**
 * De onde a música toca: o som de um link (core/widgets.ts, `parseAudio`) e, no YouTube, a playlist que ele traz.
 * Um link só da playlist (`youtube.com/playlist?list=…`) não tem vídeo: o player começa pelo primeiro dela.
 */
export type MusicSource = Exclude<AudioSource, { kind: 'youtube' }> | { kind: 'youtube'; id: string | null; start: number; list: string | null };

/** A música de uma rodada de estudo: a escolhida à mão ou a sorteada. */
export interface TrackTurn {
  id: string;
  /** A rodada de estudo (o `session` do Pomodoro, ver core/pomodoro.ts). */
  session: number;
}

export interface TracksSave {
  v: 1;
  tracks: PomodoroTrack[];
  /** A música da rodada (null: nenhuma ainda; a primeira da lista toca). */
  turn: TrackTurn | null;
}

export const DEFAULT_TRACK: PomodoroTrack = { id: DEFAULT_TRACK_ID, url: DEFAULT_MUSIC, name: '', title: 'Rádio lofi de sempre', on: true, place: null };

const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Um link que o site sabe tocar, do jeito que fica guardado ('' = não toca). */
export function trackUrl(raw: string): string {
  const v = raw.trim().slice(0, MAX_URL);
  return v && musicOf(v) ? v : '';
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com']);

/** De onde a música toca (null: não é um som que o site saiba tocar). */
export function musicOf(raw: string): MusicSource | null {
  const src = parseAudio(raw);
  if (src && src.kind !== 'youtube') return src;
  const list = listOf(raw);
  // o player da série (embed/videoseries) tem o tamanho de um id de vídeo, mas não é um
  if (src && src.id !== 'videoseries') return { kind: 'youtube', id: src.id, start: src.start, list };
  // a playlist sem vídeo: a página dela, o watch só com a lista, ou o player da série
  const href = httpsUrl(raw);
  if (!href || !list) return null;
  const u = new URL(href);
  const path = u.pathname.split('/').filter(Boolean);
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const ok = YOUTUBE_HOSTS.has(host) && (['playlist', 'watch'].includes(path[0]) || (path[0] === 'embed' && path[1] === 'videoseries'));
  // as rádios (RD…) só existem a partir de um vídeo
  return ok && !list.startsWith('RD') ? { kind: 'youtube', id: null, start: 0, list } : null;
}

/** Uma playlist de verdade (não a rádio de um vídeo, `RD…`, que não acaba nem tem página). */
export function isPlaylist(src: MusicSource | null): boolean {
  return src?.kind === 'youtube' && !!src.list && !src.list.startsWith('RD');
}

function readPlace(raw: unknown): TrackPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Record<keyof TrackPlace, unknown>>;
  const t = typeof r.t === 'number' && Number.isFinite(r.t) && r.t >= 0 ? Math.min(Math.floor(r.t), 86_400 * 7) : 0;
  const video = typeof r.video === 'string' && /^[\w-]{11}$/.test(r.video) ? r.video : null;
  const index = typeof r.index === 'number' && Number.isInteger(r.index) && r.index >= 0 && r.index < 10_000 ? r.index : 0;
  return t > 0 || video ? { video, index: video ? index : 0, t } : null;
}

function readTrack(raw: unknown): PomodoroTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Record<keyof PomodoroTrack, unknown>>;
  const url = typeof r.url === 'string' ? trackUrl(r.url) : '';
  if (!isId(r.id) || !url) return null;
  return { id: r.id, url, name: text(r.name, MAX_TRACK_NAME), title: text(r.title, MAX_TRACK_NAME), on: r.on !== false, place: readPlace(r.place) };
}

/**
 * A lista guardada, conferida item a item (o que não toca, ou repete um id, sai). Sem nada guardado, a lista
 * começa com a música de antes da lista (`legacyUrl`, o link único que o Pomodoro guardava) ou, sem ela, com a
 * rádio de sempre: nada do que a pessoa tinha se perde, e quem nunca escolheu vê o que toca.
 */
export function readTracks(raw: unknown, legacyUrl = ''): TracksSave {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { tracks?: unknown }).tracks)) {
    const url = trackUrl(legacyUrl);
    const first: PomodoroTrack = url ? { id: LEGACY_TRACK_ID, url, name: '', title: '', on: true, place: null } : { ...DEFAULT_TRACK };
    return { v: 1, tracks: [first], turn: null };
  }
  const r = raw as { tracks: unknown[]; turn?: unknown };
  const seen = new Set<string>();
  const tracks: PomodoroTrack[] = [];
  for (const item of r.tracks) {
    const t = readTrack(item);
    if (!t || seen.has(t.id) || tracks.length >= MAX_TRACKS) continue;
    seen.add(t.id);
    tracks.push(t);
  }
  const turn = r.turn as Partial<TrackTurn> | null | undefined;
  const okTurn = !!turn && typeof turn === 'object' && isId(turn.id) && seen.has(turn.id) && Number.isInteger(turn.session) && (turn.session as number) >= 0;
  return { v: 1, tracks, turn: okTurn ? { id: turn.id as string, session: turn.session as number } : null };
}

/** Um id novo, que não repete os da lista. */
export function newTrackId(taken: readonly PomodoroTrack[]): string {
  for (;;) {
    const rand =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 12);
    const id = `m${rand}`;
    if (!taken.some((t) => t.id === id)) return id;
  }
}

/** O mesmo link, escrito de outro jeito (o https, o www, a ordem dos parâmetros): para não salvar duas vezes. */
export function sameTrack(a: string, b: string): boolean {
  return trackKey(a) === trackKey(b);
}

function trackKey(url: string): string {
  const src = musicOf(url);
  if (!src) return url.trim();
  if (src.kind === 'file') return src.url;
  if (src.kind === 'vimeo') return `vimeo:${src.id}`;
  // a mesma playlist, aberta em qualquer vídeo dela, é a mesma música
  if (isPlaylist(src)) return `playlist:${src.list}`;
  return `youtube:${src.id}:${src.list ?? ''}`;
}

/** A lista do YouTube que o link traz (`list=`), se tiver. */
export function listOf(url: string): string | null {
  const href = httpsUrl(url);
  if (!href) return null;
  const list = new URL(href).searchParams.get('list');
  return list && /^[\w-]{2,64}$/.test(list) ? list : null;
}

/** O nome de uma música: o que a pessoa deu, o título achado ou, sem nenhum, de onde ela vem. */
export function trackName(t: PomodoroTrack): string {
  return t.name || t.title || fallbackName(t.url);
}

/** De onde vem a música, numa frase curta ("Vídeo do YouTube", "Arquivo .mp3"). */
export function trackOrigin(url: string): string {
  const src = musicOf(url);
  if (!src) return '';
  if (isPlaylist(src)) return 'Playlist do YouTube';
  if (src.kind === 'youtube') return src.list ? 'Rádio do YouTube' : 'Vídeo do YouTube';
  if (src.kind === 'vimeo') return 'Vídeo do Vimeo';
  const ext = /\.([a-z0-9]+)$/i.exec(new URL(src.url).pathname)?.[1]?.toLowerCase();
  return ext ? `Arquivo .${ext}` : 'Arquivo de som';
}

/** O nome de quem ainda não tem título: o do arquivo, sem a extensão, ou de onde ela vem. */
function fallbackName(url: string): string {
  const src = musicOf(url);
  if (src?.kind === 'file') {
    const last = new URL(src.url).pathname.split('/').filter(Boolean).pop() ?? '';
    let base = last;
    try {
      base = decodeURIComponent(last);
    } catch {
      /* fica como veio */
    }
    const name = base.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();
    if (name) return name.slice(0, MAX_TRACK_NAME);
  }
  return trackOrigin(url) || 'Música';
}

export type AddResult = { save: TracksSave; track: PomodoroTrack; existed: boolean } | { save: TracksSave; full: true } | { save: TracksSave; invalid: true };

/** Põe um link na lista (no fim). Já estava: a lista fica como está, e volta a que já estava. Cheia, ou um link que não toca, não entra. */
export function addTrack(s: TracksSave, url: string, id: string, title = ''): AddResult {
  const ok = trackUrl(url);
  if (!ok) return { save: s, invalid: true };
  const found = s.tracks.find((t) => sameTrack(t.url, ok));
  if (found) return { save: s, track: found, existed: true };
  if (s.tracks.length >= MAX_TRACKS) return { save: s, full: true };
  const track: PomodoroTrack = { id, url: ok, name: '', title: text(title, MAX_TRACK_NAME), on: true, place: null };
  return { save: { ...s, tracks: [...s.tracks, track] }, track, existed: false };
}

/** Renomeia ('' volta ao título achado). */
export function renameTrack(s: TracksSave, id: string, name: string): TracksSave {
  const n = text(name, MAX_TRACK_NAME);
  // o nome que já está à mostra não vira um dado à mão (o "Vídeo do YouTube" esconderia o título que chega)
  return patch(s, id, (t) => (n === trackName(t) || n === t.title ? { ...t, name: n === t.title ? '' : t.name } : { ...t, name: n }));
}

/** O título achado chegou (o nome dado à mão continua valendo). */
export function setTrackTitle(s: TracksSave, id: string, title: string): TracksSave {
  const v = text(title, MAX_TRACK_NAME);
  return v ? patch(s, id, (t) => ({ ...t, title: v })) : s;
}

/** Onde a música parou (para continuar dali); null volta ao começo. */
export function setTrackPlace(s: TracksSave, id: string, place: TrackPlace | null): TracksSave {
  const p = place ? readPlace(place) : null;
  return patch(s, id, (t) => (samePlace(t.place, p) ? t : { ...t, place: p }));
}

function samePlace(a: TrackPlace | null, b: TrackPlace | null): boolean {
  return a === b || (!!a && !!b && a.video === b.video && a.index === b.index && a.t === b.t);
}

export function removeTrack(s: TracksSave, id: string): TracksSave {
  if (!s.tracks.some((t) => t.id === id)) return s;
  return { ...s, tracks: s.tracks.filter((t) => t.id !== id), turn: s.turn?.id === id ? null : s.turn };
}

/** O Desfazer do apagar: a música volta para o lugar dela (e para a rodada, se era a dela). */
export function restoreTrack(s: TracksSave, track: PomodoroTrack, index: number, turn: TrackTurn | null): TracksSave {
  if (s.tracks.length >= MAX_TRACKS || s.tracks.some((t) => t.id === track.id || sameTrack(t.url, track.url))) return s;
  const tracks = [...s.tracks];
  tracks.splice(Math.min(Math.max(0, index), tracks.length), 0, track);
  const back = turn?.id === track.id && !s.turn ? turn : s.turn;
  return { ...s, tracks, turn: back };
}

/** A música desta rodada, escolhida à mão. */
export function chooseTrack(s: TracksSave, id: string, session: number): TracksSave {
  if (!s.tracks.some((t) => t.id === id)) return s;
  if (s.turn?.id === id && s.turn.session === session) return s;
  return { ...s, turn: { id, session } };
}

function patch(s: TracksSave, id: string, fn: (t: PomodoroTrack) => PomodoroTrack): TracksSave {
  const i = s.tracks.findIndex((t) => t.id === id);
  if (i < 0) return s;
  const t = s.tracks[i];
  const next = fn(t);
  if (next.name === t.name && next.title === t.title && next.on === t.on && next.place === t.place) return s;
  const tracks = [...s.tracks];
  tracks[i] = next;
  return { ...s, tracks };
}

/** Liga ou desliga a música no sorteio. */
export function setTrackOn(s: TracksSave, id: string, on: boolean): TracksSave {
  return patch(s, id, (t) => ({ ...t, on }));
}

/** Um número de 0 a 1 que só depende da semente (mulberry32): todas as abas sorteiam o mesmo. */
function seeded(seed: number): number {
  let a = (seed | 0) + 0x6d2b79f5;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}

/**
 * O sorteio da música de uma rodada, entre as marcadas, sem repetir a da rodada de antes (quando há outra).
 * Só depende da lista e da rodada: as abas abertas sorteiam a mesma, e a página mostra a que vai tocar antes de o
 * relógio do canto gravar. Nenhuma marcada: null (toca a rádio de sempre).
 */
export function drawTrack(s: TracksSave, session: number): PomodoroTrack | null {
  const marked = s.tracks.filter((t) => t.on);
  if (marked.length <= 1) return marked[0] ?? null;
  const before = s.turn && s.turn.session !== session ? s.turn.id : null;
  const pool = marked.length > 1 && before ? marked.filter((t) => t.id !== before) : marked;
  const at = Math.floor(seeded(session ^ hash(pool.map((t) => t.id).join(' '))) * pool.length);
  return pool[Math.min(at, pool.length - 1)];
}

/** A música de uma rodada: a dela (escolhida à mão ou já sorteada), senão a que o sorteio dá. */
export function sessionTrack(s: TracksSave, session: number): PomodoroTrack | null {
  const own = s.turn?.session === session ? s.tracks.find((t) => t.id === s.turn!.id) : undefined;
  return own ?? drawTrack(s, session);
}

/** A música da rodada fica gravada nela (desmarcar no meio do estudo não troca o que toca). */
export function settleTurn(s: TracksSave, session: number): TracksSave {
  if (s.turn?.session === session && s.tracks.some((t) => t.id === s.turn!.id)) return s;
  const t = drawTrack(s, session);
  return t ? { ...s, turn: { id: t.id, session } } : s;
}

/** Quanto o título espera o oEmbed responder. */
const TITLE_WAIT_MS = 8000;

/**
 * O endereço do oEmbed do YouTube para o título (gratuito, sem chave e aberto a outros sites): o da playlist,
 * quando o link traz uma lista de verdade (as rádios, `RD…`, não têm página própria), senão o do vídeo.
 * Só o YouTube: do Vimeo e dos arquivos, o nome vem do próprio link.
 */
export function titleLookupUrl(url: string): string | null {
  const src = musicOf(url);
  if (src?.kind !== 'youtube') return null;
  const page = isPlaylist(src) || !src.id ? `https://www.youtube.com/playlist?list=${src.list}` : `https://www.youtube.com/watch?v=${src.id}`;
  return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`;
}

/** O título do vídeo ou da playlist ('' quando não achou: sem internet, o vídeo privado, outro site). */
export async function fetchTrackTitle(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  const at = titleLookupUrl(url);
  if (!at) return '';
  try {
    const res = await fetcher(at, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(TITLE_WAIT_MS) });
    if (!res.ok) return '';
    const body = (await res.json()) as { title?: unknown };
    return text(body?.title, MAX_TRACK_NAME);
  } catch {
    return '';
  }
}
