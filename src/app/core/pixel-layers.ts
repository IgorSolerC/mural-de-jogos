import { localImageId } from './images';
import { PIXEL_MAX, blankGrid, gridOf, writeGrid } from './pixel-art';

/**
 * As camadas de uma obra da galeria de pixel arts (PLANO-CAMADAS.md, 2). A obra guarda o desenho achatado no `art`
 * (o que a parede, as miniaturas, a capa e o widget leem) e, ao lado, a pilha de onde ele saiu: as camadas de pontos
 * (de baixo para cima, a de cima por cima) e as de referência (uma imagem guardada pelo Murall, que nunca entra no
 * desenho). A paleta e as cores são as do `art`, uma para todas (o modo indexado do Aseprite). A camada escondida
 * fica guardada e não entra no achatado. O widget `{{pixel: …}}` nunca tem camadas. Tudo aqui é puro.
 */

/** Quantas camadas de pontos e quantas referências cabem numa obra. */
export const PIXEL_LAYERS_MAX = 16;
export const PIXEL_REFS_MAX = 8;
export const LAYER_NAME_MAX = 40;
/** O nome da camada de uma obra sem camadas (a primeira de toda obra nova). */
export const FIRST_LAYER_NAME = 'Camada 1';
/** O tamanho do texto dos pontos de uma camada (64 × 64 com letras, sem abreviar, cabe com folga). */
const LAYER_TEXT_MAX = 12_000;
/** Até onde a referência pode ir, em pontos da grade, fora do papel (o bastante para mover e esticar à vontade). */
const REF_REACH = PIXEL_MAX * 4;
/** A menor opacidade da referência (abaixo disso ela some e ninguém a acha mais). */
export const REF_OPACITY_MIN = 0.1;

/** A imagem de referência: onde ela fica no papel, em pontos da grade (com fração), e a opacidade (0,1 a 1). */
export interface PixelRef {
  /** Sempre uma imagem guardada pelo Murall (`murall://imagem/ID`), nunca um link de fora. */
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
}

/** Uma camada como a obra guarda (e a nuvem leva): os pontos escritos como no widget, ou a referência. */
export interface StoredLayer {
  id: string;
  name: string;
  hidden?: true;
  rows?: string;
  ref?: PixelRef;
}

interface LayerBase {
  id: string;
  name: string;
  hidden: boolean;
}
/** Uma camada de pontos no ateliê: as fileiras inteiras, na grade da obra. */
export interface DotsLayer extends LayerBase {
  kind: 'pontos';
  rows: string[];
}
export interface RefLayer extends LayerBase {
  kind: 'ref';
  ref: PixelRef;
}
export type Layer = DotsLayer | RefLayer;

const ID_RE = /^[\w-]{1,64}$/;

/** Um id novo de camada (curto: só precisa não repetir dentro da obra). */
export function newLayerId(): string {
  const rand = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('') : Math.random().toString(36).slice(2, 8);
  return `c${Date.now().toString(36).slice(-4)}${rand}`;
}

/** O nome como a pessoa escreveu, sem espaço sobrando, no tamanho da camada. */
export function cleanLayerName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, LAYER_NAME_MAX).trim() : '';
}

/** O nome da próxima camada: "Camada N", o primeiro número que ninguém usa a partir da quantidade de camadas + 1. */
export function nextLayerName(layers: readonly Pick<Layer, 'name'>[], base = 'Camada'): string {
  const used = new Set(layers.map((l) => l.name));
  let n = layers.length + 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** A pilha de uma obra sem camadas: uma de pontos, com o desenho todo. */
export function singleLayer(rows: readonly string[]): Layer[] {
  return [{ id: 'c1', name: FIRST_LAYER_NAME, hidden: false, kind: 'pontos', rows: [...rows] }];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A referência conferida número a número; null se não serve (o endereço não é do Murall, o tamanho não fecha). */
export function cleanRef(raw: unknown): PixelRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const src = typeof r['src'] === 'string' && localImageId(r['src']) ? r['src'].trim() : null;
  const num = (k: string) => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : NaN);
  const [x, y, w, h, opacity] = ['x', 'y', 'w', 'h', 'opacity'].map(num);
  if (!src || [x, y, w, h].some((v) => Number.isNaN(v))) return null;
  if (w <= 0 || h <= 0 || w > REF_REACH || h > REF_REACH || Math.abs(x) > REF_REACH || Math.abs(y) > REF_REACH) return null;
  const o = Number.isNaN(opacity) ? 0.5 : Math.min(1, Math.max(REF_OPACITY_MIN, opacity));
  return { src, x: round2(x), y: round2(y), w: Math.max(0.01, round2(w)), h: Math.max(0.01, round2(h)), opacity: round2(o) };
}

/**
 * As camadas como foram guardadas (ou vieram da nuvem), conferidas uma a uma, com os pontos refeitos na grade `w` ×
 * `h` (o que passa dela fica de fora): sem id repetido, até `PIXEL_LAYERS_MAX` de pontos e `PIXEL_REFS_MAX`
 * referências, e pelo menos uma de pontos. Null: não sobra nenhuma de pontos.
 */
export function sanitizeLayers(raw: unknown, w: number, h: number): StoredLayer[] | null {
  if (!Array.isArray(raw)) return null;
  const out: StoredLayer[] = [];
  const ids = new Set<string>();
  let dots = 0;
  let refs = 0;
  for (const item of raw.slice(0, (PIXEL_LAYERS_MAX + PIXEL_REFS_MAX) * 2)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const id = typeof r['id'] === 'string' && ID_RE.test(r['id']) && !ids.has(r['id']) ? r['id'] : null;
    if (!id) continue;
    const base = { id, name: cleanLayerName(r['name']) || 'Camada', ...(r['hidden'] === true ? { hidden: true as const } : {}) };
    if (r['ref'] !== undefined) {
      const ref = cleanRef(r['ref']);
      if (!ref || refs >= PIXEL_REFS_MAX) continue;
      refs++;
      ids.add(id);
      out.push({ ...base, ref });
      continue;
    }
    const text = typeof r['rows'] === 'string' ? r['rows'] : '';
    if (text.length > LAYER_TEXT_MAX || dots >= PIXEL_LAYERS_MAX) continue;
    dots++;
    ids.add(id);
    out.push({ ...base, rows: writeGrid(gridOf(text, w, h)) });
  }
  return dots ? out : null;
}

/** As camadas guardadas viram as do ateliê, na grade da obra; sem camadas, uma só com o desenho. */
export function readLayers(stored: readonly StoredLayer[] | undefined, art: { w: number; h: number; rows: readonly string[] }): Layer[] {
  if (!stored?.length) return singleLayer(art.rows);
  return stored.map((s): Layer => {
    const base = { id: s.id, name: s.name, hidden: !!s.hidden };
    return s.ref ? { ...base, kind: 'ref', ref: { ...s.ref } } : { ...base, kind: 'pontos', rows: gridOf(s.rows ?? '', art.w, art.h) };
  });
}

/**
 * As camadas do ateliê como a obra guarda; nada (undefined) quando a pilha é a de uma obra sem camadas (uma de
 * pontos, à mostra, com o nome de sempre): a obra de antes e a de agora ficam iguais.
 */
export function writeLayers(layers: readonly Layer[]): StoredLayer[] | undefined {
  if (layers.length === 1 && layers[0].kind === 'pontos' && !layers[0].hidden && layers[0].name === FIRST_LAYER_NAME) return undefined;
  return layers.map((l) => ({ id: l.id, name: l.name, ...(l.hidden ? { hidden: true as const } : {}), ...(l.kind === 'ref' ? { ref: { ...l.ref } } : { rows: writeGrid(l.rows) }) }));
}

/**
 * O desenho achatado: as camadas de pontos à mostra, de baixo para cima, cada ponto pintado por cima do que está
 * embaixo (o transparente deixa ver). As referências e as escondidas não entram.
 */
export function flattenLayers(layers: readonly Layer[], w: number, h: number): string[] {
  const shown = layers.filter((l): l is DotsLayer => l.kind === 'pontos' && !l.hidden);
  if (shown.length === 1) return Array.from({ length: h }, (_, y) => (shown[0].rows[y] ?? '').slice(0, w).padEnd(w, '0'));
  const out = blankGrid(w, h).map((r) => [...r]);
  for (const l of shown) {
    for (let y = 0; y < h; y++) {
      const row = l.rows[y];
      if (!row) continue;
      for (let x = 0; x < w; x++) {
        const c = row[x];
        if (c && c !== '0') out[y][x] = c;
      }
    }
  }
  return out.map((r) => r.join(''));
}

/** A pilha guardada é a de uma obra sem camadas (uma de pontos, à mostra, com o nome de sempre)? Então não se grava. */
export function plainStack(stored: readonly StoredLayer[]): boolean {
  return stored.length === 1 && stored[0].rows !== undefined && !stored[0].hidden && stored[0].name === FIRST_LAYER_NAME;
}

/** As camadas guardadas achatadas, na grade da obra (para conferir com o `art`). */
export function flattenStored(stored: readonly StoredLayer[], w: number, h: number): string[] {
  return flattenLayers(readLayers(stored, { w, h, rows: blankGrid(w, h) }), w, h);
}

/** As imagens de referência das camadas (os endereços `murall://imagem/ID`). */
export function refSources(stored: readonly StoredLayer[] | undefined): string[] {
  return (stored ?? []).flatMap((l) => (l.ref ? [l.ref.src] : []));
}
