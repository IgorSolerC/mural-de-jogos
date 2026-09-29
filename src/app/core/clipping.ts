import { SHAPE_W_H, Tear, snipFor, tearFor } from './tear';
import { wobble } from './wall-physics';

/**
 * Como o nome entra no recorte, sorteado pelo id (o mesmo em toda visita):
 * - `tira`: a tirinha de papel creme ou kraft rasgada à mão, o nome escrito a caneta;
 * - `manchete`: o nome impresso, recortado de outra página, em letra de revista (Didone ou serifa itálica);
 * - `tarja`: o nome em branco numa tarja de cor chapada (preta, vermelha ou amarela com letra preta);
 * - `resgate`: cada palavra recortada de uma revista diferente, como bilhete de sequestro.
 */
export type TitleKind = 'tira' | 'manchete' | 'tarja' | 'resgate';

/** Um pedaço de papel de revista com letra impressa: a cor do papel, a da tinta e a fonte. */
export interface Cutout {
  text: string;
  /** Índice em `CUTOUT_STYLES`. */
  style: number;
  tilt: number;
  /** Desce ou sobe um tico da linha, como colado à mão. */
  dy: number;
  /** Um tico maior ou menor que o vizinho. */
  scale: number;
  clip: string;
  /** Continua a palavra do pedaço anterior (a palavra foi recortada em sílabas). */
  joined: boolean;
  /** A tesoura deixou uma beiradinha branca da página em volta da cor. */
  rim: boolean;
}

export interface TitleLook {
  kind: TitleKind;
  /** Colado no pé da foto ou no alto. */
  place: 'pe' | 'topo';
  /** Encostado na esquerda ou na direita. */
  side: 'esq' | 'dir';
  /** Quanto entra da beirada, em px. */
  inset: number;
  tilt: number;
  /** A tirinha: creme ou kraft. */
  paper: 'creme' | 'kraft';
  /** A manchete: Didone gorda ou serifa itálica. */
  face: 'didone' | 'italico';
  /** A manchete leva o fio vermelho de seção em cima. */
  rule: boolean;
  /** A tarja: a cor chapada. */
  tint: 'preto' | 'vermelho' | 'amarelo';
  /** A tarja veio com uma beiradinha branca da página em volta. */
  rim: boolean;
  /** O corte da manchete e da tarja. */
  clip: string;
  /** O bilhete de resgate: uma peça por palavra. */
  words: Cutout[];
}

/**
 * As revistas de onde saem as letras do bilhete e do título da página. Papel, tinta e fonte;
 * `caps` é letra de manchete esportiva, sempre maiúscula.
 */
export const CUTOUT_STYLES: readonly { bg: string; ink: string; font: 'didone' | 'serif' | 'serif-it' | 'label'; caps?: boolean }[] = [
  { bg: '#fbfaf6', ink: '#161413', font: 'didone' },
  { bg: '#161413', ink: '#fbfaf6', font: 'label', caps: true },
  { bg: '#b81d1c', ink: '#ffffff', font: 'serif-it' },
  { bg: '#ffd23a', ink: '#161413', font: 'label', caps: true },
  { bg: '#fbfaf6', ink: '#b81d1c', font: 'didone' },
  { bg: '#e9e3d3', ink: '#161413', font: 'serif' },
  { bg: '#c8156b', ink: '#ffffff', font: 'didone' },
  { bg: '#fbfaf6', ink: '#161413', font: 'serif-it' },
  { bg: '#0f6fae', ink: '#ffffff', font: 'label', caps: true },
];

const PAGE_WHITE = '#fbfaf6';

/** Palavras demais viram uma parede de papelzinho: aí o nome vai de manchete. */
const RANSOM_MAX_WORDS = 5;
const RANSOM_MAX_CHARS = 30;

export function titleFor(id: string, name: string, tear: Tear): TitleLook {
  let n = 0;
  const r = () => wobble(id, 2400 + n++);
  const words = name.trim().split(/\s+/).filter(Boolean);
  const fitsRansom = words.length <= RANSOM_MAX_WORDS && name.length <= RANSOM_MAX_CHARS;
  const kr = r();
  let kind: TitleKind = kr < 0.3 ? 'tira' : kr < 0.52 ? 'manchete' : kr < 0.72 ? 'tarja' : 'resgate';
  if (kind === 'resgate' && !fitsRansom) kind = 'manchete';

  // o alto do recorte: nunca por cima do canto dobrado nem da cabeça da matéria
  const foldAt = tear.fold?.corner ?? -1;
  // o alto do recorte: nunca por cima de uma quina dobrada lá em cima nem da cabeça da matéria
  const canTop = foldAt !== 0 && foldAt !== 1 && tear.page !== 'cabeca' && (kind === 'tarja' || kind === 'manchete');
  const place: TitleLook['place'] = canTop && r() < 0.45 ? 'topo' : 'pe';
  // a tirinha e o bilhete ficam à esquerda (o pé da página tem a coluna à esquerda também),
  // menos quando a quina de baixo à esquerda dobrou: aí o nome vai para a outra ponta
  let side: TitleLook['side'] = kind === 'tira' || kind === 'resgate' || r() < 0.55 ? 'esq' : 'dir';
  if (place === 'pe' && foldAt === 3) side = 'dir';
  else if (place === 'pe' && foldAt === 2 && kind !== 'tira' && kind !== 'resgate') side = 'esq';
  else if (place === 'topo' && foldAt === 0) side = 'dir';
  const inset = Math.round(kind === 'resgate' ? 2 + r() * 8 : 4 + r() * 12);
  const tilt = Math.round((r() - 0.5) * (kind === 'tarja' ? 5 : 6) * 10) / 10;

  const paper: TitleLook['paper'] = tear.page === 'baixo' || wobble(id, 7) < 0.3 ? 'kraft' : 'creme';
  const face: TitleLook['face'] = r() < 0.6 ? 'didone' : 'italico';
  const rule = r() < 0.35;
  const tr = r();
  const tint: TitleLook['tint'] = tr < 0.45 ? 'preto' : tr < 0.8 ? 'vermelho' : 'amarelo';

  return {
    kind,
    place,
    side,
    inset,
    tilt,
    paper,
    face,
    rule,
    tint,
    rim: r() < 0.65,
    clip: snipFor(id, 1),
    words: kind === 'resgate' ? ransom(id, syllables(id, words), 3) : [],
  };
}

/**
 * Um nome de uma palavra só daria um papelzinho: ele é recortado em dois ou três pedaços de três
 * letras ou mais, cada um de uma revista, como no bilhete de sequestro de verdade. Com duas palavras
 * ou mais, cada palavra fica inteira (cortada no meio, a leitura tropeça).
 */
function syllables(id: string, words: readonly string[]): { text: string; joined: boolean }[] {
  const letters = words.length === 1 ? [...words[0]] : [];
  if (letters.length < 6) return words.map((text) => ({ text, joined: false }));
  const parts = letters.length >= 9 && wobble(id, 2900) < 0.6 ? 3 : 2;
  const out: { text: string; joined: boolean }[] = [];
  let at = 0;
  for (let i = 0; i < parts; i++) {
    const left = letters.length - at;
    const even = Math.round(left / (parts - i));
    // um tico para mais ou para menos, sem deixar pedaço com menos de três letras
    const size = i === parts - 1 ? left : Math.min(left - 3 * (parts - i - 1), Math.max(3, even + Math.round((wobble(id, 2901 + i) - 0.5) * 2)));
    out.push({ text: letters.slice(at, at + size).join(''), joined: i > 0 });
    at += size;
  }
  return out;
}

/** Cada pedaço de um bilhete de resgate, nunca da mesma revista que o vizinho. */
export function ransom(id: string, parts: readonly (string | { text: string; joined: boolean })[], salt: number): Cutout[] {
  let n = 0;
  const r = () => wobble(id, 3100 + salt * 97 + n++);
  let last = -1;
  return parts.map((part, i) => {
    const { text, joined } = typeof part === 'string' ? { text: part, joined: false } : part;
    let style = Math.floor(r() * CUTOUT_STYLES.length);
    if (style === last) style = (style + 1 + Math.floor(r() * (CUTOUT_STYLES.length - 1))) % CUTOUT_STYLES.length;
    last = style;
    return {
      text,
      style,
      tilt: Math.round((r() - 0.5) * 9 * 10) / 10,
      dy: Math.round((r() - 0.5) * 4),
      scale: Math.round((0.9 + r() * 0.26) * 100) / 100,
      clip: snipFor(id, 20 + salt * 31 + i, 2.4),
      rim: CUTOUT_STYLES[style].bg !== PAGE_WHITE && r() < 0.45,
      joined,
    };
  });
}

/** Onde o adesivo de vontade (MUST PLAY, LATER) é colado: numa quina livre, meio para fora do papel. */
export interface StickerSpot {
  /** 0 no alto à esquerda, 1 no alto à direita, 2 embaixo à direita, 3 embaixo à esquerda. */
  corner: 0 | 1 | 2 | 3;
  /** Quanto o adesivo sai da beirada, em px, para cada lado. */
  dx: number;
  dy: number;
  /** Um número de -1 a 1: cada adesivo decide o quanto entorta. */
  tilt: number;
}

/**
 * A quina do adesivo: nunca a dobrada, nem a arrancada, nem a do nome. Com o nome no pé, vai no alto
 * (quase sempre à direita); com o nome no alto, embaixo, do lado oposto ao dele.
 */
export function stickerFor(id: string, tear: Tear, look: TitleLook): StickerSpot {
  const r = (n: number) => wobble(id, 6100 + n);
  const title = look.place === 'topo' ? (look.side === 'esq' ? 0 : 1) : look.side === 'esq' ? 3 : 2;
  const blocked = new Set<number>([title]);
  if (tear.fold) blocked.add(tear.fold.corner);
  if (tear.rip !== null) blocked.add(tear.rip);
  const tops: (0 | 1)[] = r(0) < 0.7 ? [1, 0] : [0, 1];
  const bottoms: (2 | 3)[] = look.side === 'esq' ? [2, 3] : [3, 2];
  const order = look.place === 'pe' ? [...tops, ...bottoms] : [...bottoms, ...tops];
  const corner = order.find((c) => !blocked.has(c)) ?? 1;
  return {
    corner,
    dx: Math.round(8 + r(1) * 8),
    dy: Math.round(10 + r(2) * 8),
    tilt: Math.round((r(3) * 2 - 1) * 100) / 100,
  };
}

/**
 * Onde o recorte cai na colagem: nem todos da mesma largura, nem todos alinhados na coluna, nem
 * todos à mesma distância do de cima. Em % da coluna e px.
 */
export function placeFor(id: string): { width: number; shift: number; gap: number } {
  const w = 82 + Math.round(wobble(id, 40) * 18);
  const room = 100 - w;
  return { width: w, shift: Math.round(wobble(id, 41) * room), gap: Math.round(30 + wobble(id, 42) * 26) };
}

/** A altura estimada de um recorte, em larguras de coluna, pelo formato e pelo pedaço de página. */
export function clipHeight(id: string): number {
  const t = tearFor(id);
  const p = placeFor(id);
  const w = (p.width / 100) * (t.page === 'lado' ? 0.78 : 1);
  const extra = t.page === 'baixo' ? 0.28 : t.page === 'cabeca' ? 0.19 : 0;
  return w / SHAPE_W_H[t.shape] + extra + p.gap / 200;
}

/**
 * A colagem, em colunas: cada peça vai para a coluna mais curta até ali, na ordem da lista, então a
 * leitura continua da esquerda para a direita (o mais novo no alto à esquerda, o seguinte ao lado).
 * A altura vem de uma estimativa pelo id (`height`), sem medir nada na tela.
 */
export function collage<T extends { id: string }>(items: readonly T[], columns: number, height: (id: string) => number = clipHeight): T[][] {
  const out: T[][] = Array.from({ length: Math.max(1, columns) }, () => []);
  const sum = out.map(() => 0);
  for (const item of items) {
    // a coluna mais curta; no empate (ou quase), a mais à esquerda
    let at = 0;
    for (let i = 1; i < out.length; i++) if (sum[i] < sum[at] - 0.05) at = i;
    out[at].push(item);
    sum[at] += height(item.id);
  }
  return out;
}
