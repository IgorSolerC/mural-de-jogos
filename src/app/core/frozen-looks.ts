/**
 * A aparência congelada: uma impressão digital de tudo o que é desenhado por sorteio (as estampas,
 * os rabiscos, os estragos, as manchas, as decorações, os papéis; os recortes da wishlist e as folhas
 * do Pra depois), para
 * vários sorteios, ids e tamanhos. `frozen-looks.spec.ts` compara com `frozen-looks.data.ts`: o que
 * já foi aprovado nunca muda por tabela quando se mexe em outra coisa.
 *
 * Mudar de propósito UM desenho: rode `node scripts/freeze-looks.mjs <prefixo>` (por exemplo
 * `damage:costurado`), que regrava só as impressões que começam com esse prefixo. Um desenho novo
 * entra nas listas abaixo (no fim, sem mexer nas outras) e é congelado do mesmo jeito.
 */
import { clipHeight, placeFor, ransom, stickerFor, titleFor } from './clipping';
import { pageFor, pageHeight } from './notebook';
import { DEFAULT_LOOK, LOOK_KEYS, LOOK_STEPS, PatternLook, hash, textureOf } from './paper';
import type { Damage, Decor, Paper, Pattern, Scribble, Stain } from './paper';
import { decorArt } from './decor-art';
import { cutMask, paperArt, paperStyle, patternTile } from './paper-art';
import { snipFor, stripFor, tearFor } from './tear';

export const FROZEN_PAPERS: readonly Paper[] = ['cartolina', 'lisa', 'canson', 'linho', 'verge', 'reciclado', 'glitter', 'aquarela', 'feltro', 'arroz', 'ondulado', 'metalizado', 'perolado'];
export const FROZEN_PATTERNS: readonly Pattern[] = [
  'gatinhos', 'caveiras', 'foguinhos', 'coracoes', 'estrelas', 'fantasmas', 'cogumelos', 'flores', 'raios', 'planetas', 'controles', 'aranhas',
  // 2026-09-29, segunda leva
  'cachorros', 'borboletas', 'abelhas', 'peixes', 'dinossauros', 'morcegos', 'aboboras', 'bruxaria', 'olhos', 'cozinha', 'frutas', 'doces', 'pizza', 'cafe',
  'dados', 'cartas', 'xadrez', 'pixel', 'alienigenas', 'chuva', 'folhas', 'cactos', 'medieval', 'piratas', 'ninja', 'tatuagens', 'ferramentas', 'robos', 'musica',
  'mineracao', 'carros',
];
// Espirais e Teste de caneta saíram em 2026-09-29, a pedido
export const FROZEN_SCRIBBLES: readonly Scribble[] = [
  'novelo', 'hachura', 'riscado', 'contorno', 'aula', 'moldura', 'renda', 'cupom', 'pelicula', 'regua', 'trepadeira', 'bandeirinhas',
  // 2026-09-30, as molduras e os rabiscos de tema
  'gotica', 'arabesco', 'dialogo', 'hud', 'runas', 'farpado', 'terco', 'invocacao', 'tesouro', 'olhos',
];
export const FROZEN_DAMAGES: readonly Damage[] = [
  'rasgado', 'rasgao', 'remendado', 'orelha', 'dobrado', 'amassado', 'furado', 'queimado',
  // 2026-09-29, segunda leva
  'costurado', 'colado', 'picotado', 'caderno', 'arranhado', 'garras', 'mordido', 'descascado',
  // 2026-09-29, os tiros
  'baleado',
];
/** As manchas eram estragos até 2026-09-29: as digitais delas vieram de lá, iguais. */
export const FROZEN_STAINS: readonly Stain[] = [
  'molhado', 'cafe', 'tracas', 'mofado', 'pisado', 'pegadas', 'sangue',
  // 2026-09-30, a terceira leva
  'passos', 'mao', 'nanquim', 'gosma', 'lagrimas', 'salgadinho',
];

/** As decorações, desde 2026-09-29. */
export const FROZEN_DECORS: readonly Decor[] = [
  'purpurina', 'estrelinhas', 'adesivos', 'selo', 'clipe', 'argolas', 'ilhoses',
  // 2026-09-29, a segunda leva
  'confete', 'neon', 'gamer', 'bottons', 'vidas', 'postit', 'ingresso', 'promocao', 'carimbo', 'medalha', 'lacre',
  'grampos', 'alfinete', 'curativo', 'cuidado', 'neve', 'petalas', 'teia', 'beijo',
];

/** Sem sorteio (as fichas de antes), e alguns sorteios quaisquer, até o maior. */
const SEEDS: readonly (number | undefined)[] = [undefined, 1, 111, 222, 4242, 98765, 2147483647];
/** A ficha completa, a simples e o retalho do editor (este também sem o filtro de lápis). */
const SIZES: readonly { W: number; H: number; plain?: boolean }[] = [
  { W: 420, H: 300 },
  { W: 340, H: 150 },
  { W: 150, H: 107, plain: true },
];
const IDS = ['r1', 'rdx0x3'];
const PATTERN_SEEDS: readonly (number | undefined)[] = [undefined, 5, 99, 123456];
const CLIP_IDS = Array.from({ length: 24 }, (_, i) => `w${(i * 7919 + 13).toString(36)}x${i}`);

function print(v: unknown): string {
  const s = JSON.stringify(v) ?? 'undefined';
  return `${hash(s).toString(36)}.${hash([...s].reverse().join('')).toString(36)}.${s.length}`;
}

/** Os ajustes de estampa conferidos: o de sempre e cada degrau de cada ajuste, os outros no de sempre. */
function looks(): { key: string; look: PatternLook }[] {
  const out = [{ key: 'normal', look: DEFAULT_LOOK }];
  for (const k of LOOK_KEYS)
    for (let step = 0; step < LOOK_STEPS[k]; step++) if (step !== DEFAULT_LOOK[k]) out.push({ key: `${k}${step}`, look: { ...DEFAULT_LOOK, [k]: step } });
  out.push({ key: 'extremos', look: { spacing: 0, size: 8, jitter: 4 } });
  return out;
}

function artPrint(input: Parameters<typeof paperArt>[0]): string {
  const art = paperArt(input);
  return print({ art, cor: cutMask(art, input.W, input.H), miolo: cutMask(art, input.W, input.H, 'miolo'), queima: cutMask(art, input.W, input.H, 'queima') });
}

/** Todas as impressões, `tipo:nome:variação` → digital. */
export function frozenPrints(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const damage of FROZEN_DAMAGES)
    for (const id of IDS)
      for (const s of SIZES)
        for (const seed of SEEDS) out[`damage:${damage}:${id}:${s.W}x${s.H}:${seed ?? '-'}`] = artPrint({ id, W: s.W, H: s.H, plain: s.plain, damage, seed, uid: 'f' });
  for (const stain of FROZEN_STAINS)
    for (const id of IDS)
      for (const s of SIZES)
        for (const seed of SEEDS) out[`stain:${stain}:${id}:${s.W}x${s.H}:${seed ?? '-'}`] = artPrint({ id, W: s.W, H: s.H, plain: s.plain, stain, stainSeed: seed, uid: 'f' });
  for (const scribble of FROZEN_SCRIBBLES)
    for (const id of IDS)
      for (const s of SIZES)
        for (const seed of SEEDS) out[`scribble:${scribble}:${id}:${s.W}x${s.H}:${seed ?? '-'}`] = artPrint({ id, W: s.W, H: s.H, plain: s.plain, scribble, scribbleSeed: seed, uid: 'f' });
  // a força do lápis (fora do Normal, que é o próprio rabisco acima), na ficha completa
  for (const scribble of FROZEN_SCRIBBLES)
    for (const ink of [0, 1, 2, 4, 5, 6])
      for (const seed of [undefined, 111]) out[`scribble:${scribble}:ink${ink}:${seed ?? '-'}`] = artPrint({ id: 'r1', W: 420, H: 300, scribble, scribbleSeed: seed, scribbleInk: ink, uid: 'f' });
  for (const decor of FROZEN_DECORS)
    for (const id of IDS)
      for (const s of SIZES)
        for (const seed of SEEDS) out[`decor:${decor}:${id}:${s.W}x${s.H}:${seed ?? '-'}`] = print(decorArt({ id, W: s.W, H: s.H, decor, seed, uid: 'f' }));
  for (const pattern of FROZEN_PATTERNS)
    for (const { key, look } of looks())
      for (const seed of PATTERN_SEEDS) out[`pattern:${pattern}:${key}:${seed ?? '-'}`] = print(patternTile(pattern, look, seed));
  for (const paper of FROZEN_PAPERS) {
    out[`paper:${paper}`] = print({ texture: textureOf(paper), style: paperStyle(paper, undefined) });
    out[`paper:${paper}:estampa`] = print(paperStyle(paper, 'gatinhos', { spacing: 2, size: 5, jitter: 3 }, 77));
  }
  for (const id of CLIP_IDS) {
    const tear = tearFor(id);
    const look = titleFor(id, 'Hollow Knight: Silksong', tear);
    out[`clip:${id}`] = print({
      tear,
      strip: stripFor(id),
      snips: [0, 1, 2, 5].map((n) => snipFor(id, n)),
      look,
      sticker: stickerFor(id, tear, look),
      place: placeFor(id),
      height: clipHeight(id),
      ransom: ransom(id, ['MUST', { text: 'PLAY', joined: true }, 'Hades'], 2),
    });
    out[`page:${id}`] = print({ page: pageFor(id), height: pageHeight(id) });
  }
  return out;
}
