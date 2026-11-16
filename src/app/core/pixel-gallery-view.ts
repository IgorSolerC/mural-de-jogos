import { placeFor } from './clipping';
import { LOOK_PAD, PIXEL_LOOKS, PixelLook } from './pixel-art';
import { PixelPiece, pieceTitle, pixelArtOf } from './pixel-gallery';
import { plainText } from './rich-text';
import { fold, nameCollator } from './text';
import { wobble } from './wall-physics';

/**
 * A vista da galeria de pixel arts (PLANO-PIXEL-ARTS.md, 3): como a parede aparece (a Mostra, cada obra no jeito
 * dela, ou a Grade), em que ordem, e o que a busca e os filtros deixam à mostra. A vista e a ordem são do aparelho,
 * como as da Wishlist (`meu-mural:pixel-arts:vista:v1`, saem na limpeza do logout); a busca e os filtros valem só
 * na visita.
 */

export type PixelView = 'mostra' | 'grade';
export type PixelOrder = 'criada' | 'mudada' | 'nome' | 'tamanho';
export type PixelDirection = 'desc' | 'asc';

export interface PixelGalleryPrefs {
  vista: PixelView;
  ordem: PixelOrder;
  direcao: PixelDirection;
}

export const PIXEL_PREFS_KEY = 'meu-mural:pixel-arts:vista:v1';

export const PIXEL_PREFS_DEFAULT: PixelGalleryPrefs = { vista: 'mostra', ordem: 'criada', direcao: 'desc' };

export const PIXEL_ORDERS: readonly { value: PixelOrder; label: string }[] = [
  { value: 'criada', label: 'Quando fez' },
  { value: 'mudada', label: 'Quando mudou' },
  { value: 'nome', label: 'Nome' },
  { value: 'tamanho', label: 'Tamanho' },
];

/** O que está guardado, conferido campo a campo (o que não serve volta ao padrão). */
export function sanitizePixelPrefs(raw: unknown): PixelGalleryPrefs {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = PIXEL_PREFS_DEFAULT;
  return {
    vista: r['vista'] === 'grade' || r['vista'] === 'mostra' ? r['vista'] : d.vista,
    ordem: PIXEL_ORDERS.some((o) => o.value === r['ordem']) ? (r['ordem'] as PixelOrder) : d.ordem,
    direcao: r['direcao'] === 'asc' || r['direcao'] === 'desc' ? r['direcao'] : d.direcao,
  };
}

/** A direção de cada ordem quando ela é escolhida: as mais novas e as maiores primeiro, os nomes de A a Z. */
export function pixelNaturalDirection(o: PixelOrder): PixelDirection {
  return o === 'nome' ? 'asc' : 'desc';
}

/** O que a direção quer dizer, na ordem escolhida (o nome do botão de inverter). */
export function pixelDirectionLabel(o: PixelOrder, d: PixelDirection): string {
  const desc = d === 'desc';
  switch (o) {
    case 'criada':
      return desc ? 'As feitas há pouco primeiro' : 'As feitas há mais tempo primeiro';
    case 'mudada':
      return desc ? 'As mexidas há pouco primeiro' : 'As mexidas há mais tempo primeiro';
    case 'nome':
      return desc ? 'De Z a A' : 'De A a Z';
    case 'tamanho':
      return desc ? 'As maiores primeiro' : 'As menores primeiro';
  }
}

/** A galeria na ordem escolhida; empate fica pela feita mais nova (e pelo id). */
export function sortPieces(list: readonly PixelPiece[], p: Pick<PixelGalleryPrefs, 'ordem' | 'direcao'>): PixelPiece[] {
  const sign = p.direcao === 'desc' ? 1 : -1;
  const newest = (a: PixelPiece, b: PixelPiece) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const cmp = (a: PixelPiece, b: PixelPiece): number => {
    switch (p.ordem) {
      case 'criada':
        return sign * newest(a, b);
      case 'mudada':
        return sign * (a.at < b.at ? 1 : a.at > b.at ? -1 : 0) || newest(a, b);
      case 'nome': {
        // as sem título vão para o fim nas duas direções
        if (!a.title || !b.title) return a.title === b.title ? newest(a, b) : a.title ? -1 : 1;
        return -sign * nameCollator.compare(a.title, b.title) || newest(a, b);
      }
      case 'tamanho': {
        const sa = pixelArtOf(a);
        const sb = pixelArtOf(b);
        return sign * (sb.w * sb.h - sa.w * sa.h) || newest(a, b);
      }
    }
  };
  return [...list].sort(cmp);
}

/** O que a busca e a folha dos filtros pedem. As tags vêm sem caixa e sem acento (`fold`). */
export interface PixelFilter {
  query: string;
  jeito: PixelLook | null;
  /** As tags ligadas: a obra com qualquer uma delas fica (como nas Anotações). */
  on: ReadonlySet<string>;
  /** As escondidas: a obra com alguma delas sai. */
  out: ReadonlySet<string>;
}

export const NO_PIXEL_FILTER: PixelFilter = { query: '', jeito: null, on: new Set(), out: new Set() };

/** Algum filtro ou a busca está ligado. */
export function pixelFiltering(f: PixelFilter): boolean {
  return !!f.query.trim() || !!f.jeito || f.on.size > 0 || f.out.size > 0;
}

/** O texto da descrição sem as marcas, sem caixa nem acento, guardado por obra (a busca não o refaz a cada letra). */
const plainNotes = new WeakMap<PixelPiece, string>();
function notePlain(p: PixelPiece): string {
  if (!p.note) return '';
  let plain = plainNotes.get(p);
  if (plain === undefined) plainNotes.set(p, (plain = fold(plainText(p.note))));
  return plain;
}

/** A obra passa: a busca acha no título, numa tag ou na descrição; o jeito escolhido; uma tag ligada e nenhuma escondida. */
export function pieceMatches(p: PixelPiece, f: PixelFilter): boolean {
  const needle = fold(f.query.trim());
  const tags = (p.tags ?? []).map(fold);
  if (needle && !fold(pieceTitle(p)).includes(needle) && !tags.some((t) => t.includes(needle)) && !notePlain(p).includes(needle)) return false;
  if (f.jeito && pixelArtOf(p).look !== f.jeito) return false;
  if (tags.some((t) => f.out.has(t))) return false;
  if (f.on.size && !tags.some((t) => f.on.has(t))) return false;
  return true;
}

/** A busca achou a obra só pela descrição (nem o título nem as tags têm o que se procura). */
export function pieceFoundByNote(p: PixelPiece, query: string): boolean {
  const needle = fold(query.trim());
  return !!needle && !fold(pieceTitle(p)).includes(needle) && !(p.tags ?? []).some((t) => fold(t).includes(needle)) && notePlain(p).includes(needle);
}

/** A linha de uma por vez da folha dos filtros: os quatro jeitos, com quantas obras tem cada um. */
export function pixelLookOptions(list: readonly PixelPiece[], chosen: PixelLook | null): { value: PixelLook; label: string; n: number; on: boolean }[] {
  const n = new Map<PixelLook, number>();
  for (const p of list) n.set(pixelArtOf(p).look, (n.get(pixelArtOf(p).look) ?? 0) + 1);
  return PIXEL_LOOKS.map((l) => ({ value: l.value, label: l.label, n: n.get(l.value) ?? 0, on: chosen === l.value }));
}

// ===== a Mostra: o lugar de cada obra na colagem (a de `core/clipping.ts`, a da Wishlist) =====

/**
 * O lugar da obra na coluna: a largura e o desvio sorteados como os do recorte (`placeFor`), o giro do papel
 * milimetrado (só o jeito Pixel tem papel; os outros jeitos são objetos e giram sozinhos, ver ui/pixel-art.ts),
 * e a altura estimada em larguras de coluna pela proporção do desenho (a colagem nunca mede a tela).
 */
export function pieceLayout(p: PixelPiece): { width: number; shift: number; gap: number; tilt: number; height: number } {
  const { width, shift, gap } = placeFor(p.id);
  const art = pixelArtOf(p);
  const pad = LOOK_PAD[art.look] * 2;
  const ratio = (art.w + pad) / (art.h + pad);
  // o papel milimetrado põe uma margem em volta do desenho; a legenda (o título e as tags) vai embaixo
  const paper = art.look === 'pixel' ? 1.24 : 1.04;
  const tilt = art.look === 'pixel' ? Math.round((wobble(p.id, 9100) * 2 - 1) * 180) / 100 : 0;
  // o desenho alto e fino fica com no máximo 1,3 vez a largura (ui/pixel-piece.ts)
  return { width, shift, gap, tilt, height: (width / 100) * paper * Math.min(1 / ratio, 1.3) + 0.26 + gap / 200 };
}
