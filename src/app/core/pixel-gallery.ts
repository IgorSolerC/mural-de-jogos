import { PASTA_ID_RE } from '../../../contrato/api-v1/notas';
import { sanitizeTags } from './note-labels';
import { PixelArt, hasInk, readPixelArt, writePixelArt } from './pixel-art';
import { WISH_NOTE_MAX, WISH_TAGS_MAX, cleanWishNote } from './review';
import { widgetLine } from './widgets';

/**
 * A galeria de pixel arts (PLANO-PIXEL-ARTS.md): as obras guardadas da conta, fora de qualquer mural. Cada obra
 * é o desenho do widget `{{pixel: …}}` (os parâmetros de `writePixelArt`, sem a legenda), com um título, tags,
 * uma pasta e uma descrição. Guardada neste navegador e no mural privado da nuvem (`pixelArts`), obra a obra:
 * vale a mudada por último, e a apagada fica apagada (`mergePixelGallery`, o modelo dos Gastos). Nunca no mural
 * público. Tudo aqui é puro.
 */

/** O tamanho do título, das tags e da descrição (os da Wishlist: a mesma folha e a mesma legenda). */
export const PIXEL_TITLE_MAX = 80;
export const PIXEL_TAGS_MAX = WISH_TAGS_MAX;
export const PIXEL_NOTE_MAX = WISH_NOTE_MAX;
/** Até quantas obras (um 64 × 64 de 61 cores é uns 5 kB; 500 cabem no navegador com folga). */
export const PIXEL_GALLERY_MAX = 500;
/**
 * O grupo das pastas da galeria, em `NotesConfig.folders` (as das Anotações, como a Wishlist): com os dois-pontos,
 * que a chave de um grupo das Anotações nunca tem do jeito que se escreve (um grupo "Pixel" seria `pixel`).
 */
export const PIXEL_FOLDER_GROUP = 'galeria:pixel-arts';
/**
 * A cor das tags da galeria mora nas cores das tags da Wishlist (`NotesConfig.wishTagColors`), com a chave
 * `'pixel|<tag>'`: um espaço próprio ao lado dos murais (nenhum mural se chama assim).
 */
export const PIXEL_TAG_SPACE = 'pixel';
/** O tamanho do que um desenho escrito pode ter (64 × 64 com letras, sem abreviar, cabe com folga). */
const ART_TEXT_MAX = 12_000;

export interface PixelPiece {
  id: string;
  /** O nome da obra; vazio, "Sem título". */
  title: string;
  /** O desenho: os parâmetros do widget `{{pixel: …}}`, sem a legenda (ver `writePixelArt`). Sempre com tinta. */
  art: string[];
  /** As tags, limpas e sem repetir; sem o campo, nenhuma. */
  tags?: string[];
  /** A pasta (o id, em `NotesConfig.folders`, grupo `PIXEL_FOLDER_GROUP`); sem o campo, a raiz. */
  folder?: string;
  /** A descrição: o texto das anotações (Markdown), até `PIXEL_NOTE_MAX` letras; sem o campo, nenhuma. */
  note?: string;
  createdAt: string;
  /** A última mudança (a junção fica com a mais nova). */
  at: string;
}

export interface PixelGalleryState {
  /** Na ordem de criação (a mesma em todo aparelho: as impressões batem). */
  pieces: PixelPiece[];
  /** As apagadas, pelo id, com a data (a apagada só volta mudada depois dela). */
  removed: Record<string, string>;
}

export const EMPTY_PIXEL_GALLERY: PixelGalleryState = { pieces: [], removed: {} };

/** O que o editar muda numa obra; o resto (id, datas) fica. */
export type PixelPatch = Partial<Pick<PixelPiece, 'title' | 'art' | 'tags' | 'folder' | 'note'>>;

const ID_RE = /^[\w-]{1,64}$/;

function isStamp(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
}

/**
 * O desenho escrito do jeito de sempre (a grade, os pontos abreviados, a paleta e o jeito só quando não são os
 * de sempre), sem a legenda. Null: não é desenho, ou não tem nenhum ponto.
 */
export function cleanArt(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.every((a) => typeof a === 'string')) return null;
  if (raw.reduce((n: number, a: string) => n + a.length, 0) > ART_TEXT_MAX) return null;
  const art = readPixelArt(raw as string[]);
  if (!hasInk(art.rows)) return null;
  return writePixelArt({ ...art, caption: '' });
}

/**
 * A obra com as mudanças, limpa: o título curto, o desenho escrito do jeito de sempre, e cada campo opcional só
 * quando tem valor (nenhuma tag, a raiz e a descrição vazia saem). Null: o desenho não vale.
 */
export function withPixelPatch(p: PixelPiece, patch: PixelPatch): PixelPiece | null {
  const next = { ...p, ...patch };
  const art = patch.art ? cleanArt(patch.art) : next.art;
  if (!art) return null;
  const { tags, folder, note, ...rest } = next;
  const cleanTags = sanitizeTags(tags ?? [], PIXEL_TAGS_MAX);
  const cleanNote = cleanWishNote(note);
  return {
    ...rest,
    title: cleanTitle(next.title),
    art,
    ...(cleanTags.length ? { tags: cleanTags } : {}),
    ...(typeof folder === 'string' && PASTA_ID_RE.test(folder) ? { folder } : {}),
    ...(cleanNote ? { note: cleanNote } : {}),
  };
}

/** O título como a pessoa escreveu (sem trocar a caixa), sem espaço sobrando, no máximo `PIXEL_TITLE_MAX` letras. */
function cleanTitle(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, PIXEL_TITLE_MAX).trim() : '';
}

/** Uma obra como foi guardada (ou veio da nuvem), conferida campo a campo; null se não serve. */
export function sanitizePixelPiece(raw: unknown): PixelPiece | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r['id'] === 'string' && ID_RE.test(r['id']) ? r['id'] : null;
  const art = cleanArt(r['art']);
  if (!id || !art || !isStamp(r['at'])) return null;
  const createdAt = isStamp(r['createdAt']) ? r['createdAt'] : r['at'];
  return withPixelPatch(
    { id, title: '', art, createdAt, at: r['at'] },
    { title: typeof r['title'] === 'string' ? r['title'] : '', tags: r['tags'] as string[], folder: r['folder'] as string, note: r['note'] as string },
  );
}

function newer(a: PixelPiece | undefined, b: PixelPiece): boolean {
  return !a || b.at > a.at || (b.at === a.at && JSON.stringify(b) > JSON.stringify(a));
}

/** Na ordem de criação; no empate, pelo id (a mesma ordem em todo aparelho). */
function byCreation(a: PixelPiece, b: PixelPiece): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Já conferidas, só em ordem e sem as apagadas (o que `sanitizePixelGallery` faria, sem refazer o desenho de cada
 * uma): o armazém passa por aqui a cada mudança, com a obra mudada já limpa. O teto (`PIXEL_GALLERY_MAX`) só barra
 * a obra nova: o Desfazer e a junção com outro aparelho nunca jogam fora uma obra que existe.
 */
export function orderedGallery(pieces: readonly PixelPiece[], removed: Readonly<Record<string, string>>): PixelGalleryState {
  const live = pieces.filter((p) => !(removed[p.id] && removed[p.id] >= p.at));
  return { pieces: [...live].sort(byCreation), removed: { ...removed } };
}

/** A galeria como foi guardada (ou veio da nuvem), conferida obra a obra. */
export function sanitizePixelGallery(raw: unknown): PixelGalleryState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { pieces: [], removed: {} };
  const r = raw as Record<string, unknown>;
  const removed: Record<string, string> = {};
  if (r['removed'] && typeof r['removed'] === 'object' && !Array.isArray(r['removed'])) {
    for (const [id, at] of Object.entries(r['removed'] as Record<string, unknown>)) if (ID_RE.test(id) && isStamp(at)) removed[id] = at;
  }
  const pieces = new Map<string, PixelPiece>();
  // (um teto de leitura bem acima do da galeria, só contra lixo: as de dois aparelhos juntadas passam do teto)
  for (const item of Array.isArray(r['pieces']) ? r['pieces'].slice(0, PIXEL_GALLERY_MAX * 4) : []) {
    const p = sanitizePixelPiece(item);
    if (p && newer(pieces.get(p.id), p)) pieces.set(p.id, p);
  }
  return orderedGallery([...pieces.values()], removed);
}

/** A galeria de outro aparelho juntada à daqui: cada obra na versão mais nova, e a apagada fica apagada. */
export function mergePixelGallery(here: PixelGalleryState, there: PixelGalleryState): PixelGalleryState {
  const removed: Record<string, string> = { ...here.removed };
  for (const [id, at] of Object.entries(there.removed)) if (!removed[id] || at > removed[id]) removed[id] = at;
  const pieces = new Map<string, PixelPiece>();
  for (const p of [...here.pieces, ...there.pieces]) if (newer(pieces.get(p.id), p)) pieces.set(p.id, p);
  return orderedGallery([...pieces.values()], removed);
}

/** O que vai para a nuvem: null sem nenhuma obra nem apagada (o mural de antes da galeria fica com a mesma impressão). */
export function pixelGalleryToSync(state: PixelGalleryState): PixelGalleryState | null {
  return state.pieces.length || Object.keys(state.removed).length ? state : null;
}

/** O desenho da obra, lido uma vez por obra (a obra mudada é outro objeto, e a de antes sai sozinha). */
const arts = new WeakMap<PixelPiece, PixelArt>();
export function pixelArtOf(p: PixelPiece): PixelArt {
  let art = arts.get(p);
  if (!art) arts.set(p, (art = readPixelArt(p.art)));
  return art;
}

/** O nome da obra para mostrar: o título, ou "Sem título". */
export function pieceTitle(p: Pick<PixelPiece, 'title'>): string {
  return p.title || 'Sem título';
}

/** A obra como widget, para colar numa anotação: o desenho com o título de legenda. */
export function pieceWidgetLine(p: PixelPiece): string {
  const art = pixelArtOf(p);
  return widgetLine('pixel', writePixelArt({ ...art, caption: p.title }) ?? p.art);
}
