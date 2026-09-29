/**
 * O papel da ficha, escolhido no editor: o papel da cartolina (textura), uma estampa de papelaria
 * (a cartolina temática: gatinhos, caveiras…), um rabisco que toma a ficha inteira e um estrago
 * (arrancada, dobrada, amassada, queimada, molhada…). Um de cada, no máximo. Estampa e rabisco ficam
 * atrás do que está escrito; o estrago é do papel, então leva junto o que estiver escrito ali, mas
 * não a foto nem os adesivos, que foram colados depois por cima.
 * Tudo é desenhado por id: a mesma ficha rasga sempre do mesmo jeito. Os desenhos estão em
 * `paper-art.ts`.
 */

// ===================== Papel (textura) =====================

export type Paper = 'cartolina' | 'lisa' | 'canson' | 'linho' | 'verge' | 'reciclado' | 'glitter';

export const PAPERS: readonly Paper[] = ['cartolina', 'lisa', 'canson', 'linho', 'verge', 'reciclado', 'glitter'];

export const PAPER_LABEL: Record<Paper, string> = {
  cartolina: 'Cartolina',
  lisa: 'Lisa',
  canson: 'Canson',
  linho: 'Linho',
  verge: 'Vergê',
  reciclado: 'Reciclado',
  glitter: 'Glitter',
};

export const PAPER_HINT: Record<Paper, string> = {
  cartolina: 'A de sempre, com a fibra de papelaria.',
  lisa: 'Sem fibra nenhuma: cor chapada, lisinha.',
  canson: 'O relevo grosso do papel de aquarela.',
  linho: 'A trama cruzada do papel linho de diploma.',
  verge: 'As listras do papel de convite, contra a luz.',
  reciclado: 'Pintinhas e fiapos de outros papéis.',
  glitter: 'Purpurina, que acende quando a luz bate.',
};

// ===================== Estampa =====================

export type Pattern =
  | 'gatinhos'
  | 'caveiras'
  | 'foguinhos'
  | 'coracoes'
  | 'estrelas'
  | 'fantasmas'
  | 'cogumelos'
  | 'flores'
  | 'raios'
  | 'planetas'
  | 'controles'
  | 'aranhas';

export const PATTERNS: readonly Pattern[] = [
  'gatinhos',
  'caveiras',
  'foguinhos',
  'coracoes',
  'estrelas',
  'fantasmas',
  'cogumelos',
  'flores',
  'raios',
  'planetas',
  'controles',
  'aranhas',
];

export const PATTERN_LABEL: Record<Pattern, string> = {
  gatinhos: 'Gatinhos',
  caveiras: 'Caveiras',
  foguinhos: 'Foguinhos',
  coracoes: 'Corações',
  estrelas: 'Estrelas e luas',
  fantasmas: 'Fantasminhas',
  cogumelos: 'Cogumelos',
  flores: 'Flores',
  raios: 'Raios',
  planetas: 'Planetas',
  controles: 'Controles',
  aranhas: 'Aranhas',
};

// ===================== Rabisco =====================

export type Scribble = 'novelo' | 'espirais' | 'molinhas' | 'hachura' | 'riscado' | 'contorno' | 'aula';

export const SCRIBBLES: readonly Scribble[] = ['novelo', 'espirais', 'molinhas', 'hachura', 'riscado', 'contorno', 'aula'];

export const SCRIBBLE_LABEL: Record<Scribble, string> = {
  novelo: 'Novelo',
  espirais: 'Espirais',
  molinhas: 'Teste de caneta',
  hachura: 'Hachura',
  riscado: 'Riscado',
  contorno: 'Contorno',
  aula: 'Tédio na aula',
};

export const SCRIBBLE_HINT: Record<Scribble, string> = {
  novelo: 'Um novelo de lápis enquanto pensava na nota.',
  espirais: 'Espirais grandes, de quem estava no telefone.',
  molinhas: 'As molinhas de quem testa se a caneta pega.',
  hachura: 'Sombreado a lápis, de vai e vem.',
  riscado: 'Riscado com força, de um lado a outro.',
  contorno: 'A borda passada a lápis, várias vezes.',
  aula: 'Desenhinhos por toda parte: jogo da velha, estrelas, gatos.',
};

// ===================== Estrago =====================

export type Damage = 'rasgado' | 'rasgao' | 'remendado' | 'orelha' | 'dobrado' | 'amassado' | 'furado' | 'queimado' | 'molhado' | 'cafe';

export const DAMAGES: readonly Damage[] = ['rasgado', 'rasgao', 'remendado', 'orelha', 'dobrado', 'amassado', 'furado', 'queimado', 'molhado', 'cafe'];

export const DAMAGE_LABEL: Record<Damage, string> = {
  rasgado: 'Rasgada',
  rasgao: 'Rasgão',
  remendado: 'Remendada',
  orelha: 'Orelha',
  dobrado: 'Dobrada em quatro',
  amassado: 'Amassada',
  furado: 'Furada',
  queimado: 'Queimada',
  molhado: 'Molhada',
  cafe: 'Café',
};

export const DAMAGE_HINT: Record<Damage, string> = {
  rasgado: 'Um canto ou uma borda foi arrancada; cada tentativa rasga em outro lugar.',
  rasgao: 'Um rasgão entrando pela beirada.',
  remendado: 'Rasgou de cima a baixo e foi colada com fita.',
  orelha: 'O canto dobrado por cima do que estava ali.',
  dobrado: 'Ficou dobrada em quatro na mochila.',
  amassado: 'Virou bolinha e foi desamassada.',
  furado: 'Furos de queimadura, de ponta a ponta.',
  queimado: 'Chegou perto demais da vela.',
  molhado: 'Pegou chuva: a água secou e deixou a marca.',
  cafe: 'A caneca de café foi apoiada bem em cima.',
};

/** Os estragos que tiram um pedaço do papel (ou entortam a beirada): a sombra segue o recorte. */
export function cutsPaper(d: Damage | undefined): boolean {
  return d === 'rasgado' || d === 'rasgao' || d === 'remendado' || d === 'orelha' || d === 'amassado' || d === 'furado' || d === 'queimado';
}

// ===================== Guardar =====================

function oneOf<T extends string>(list: readonly T[], fallback?: T) {
  return (raw: unknown): T | undefined => ((list as readonly unknown[]).includes(raw) && raw !== fallback ? (raw as T) : undefined);
}

/** Só o que existe; a cartolina de sempre (e "nenhum") não vai para o armazenamento. */
export const sanitizePaper = oneOf(PAPERS, 'cartolina');
export const sanitizePattern = oneOf(PATTERNS);
export const sanitizeScribble = oneOf(SCRIBBLES);
const currentDamage = oneOf(DAMAGES);
/** As fichas e backups antigos usavam dois nomes para os formatos agora reunidos. */
export const sanitizeDamage = (raw: unknown): Damage | undefined =>
  raw === 'arrancado' || raw === 'canto' ? 'rasgado' : currentDamage(raw);

/**
 * O sorteio do estrago: cada clique no estrago rasga de outro jeito, e o jeito escolhido fica
 * guardado com a ficha. Sem o sorteio (as fichas de antes), o estrago sai do id, como sempre.
 */
export const SEED_MAX = 2 ** 31 - 1;
export const sanitizeSeed = (raw: unknown): number | undefined =>
  Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= SEED_MAX ? (raw as number) : undefined;
/** Um sorteio novo, sempre diferente do anterior. */
export function newSeed(prev?: number | null): number {
  let s: number;
  do s = 1 + Math.floor(Math.random() * SEED_MAX);
  while (s === prev);
  return s;
}

// ===================== Texturas =====================

export const svgUrl = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

/** Filtro no espaço de cor da tela: sem isso o cinza do meio sai claro e a textura desbota a cartolina. */
export const SRGB = "color-interpolation-filters='sRGB'";

interface Texture {
  img: string;
  size: string;
  blend: string;
}

const TEXTURES: Partial<Record<Paper, Texture>> = {
  canson: {
    img: svgUrl(
      260,
      260,
      `<filter ${SRGB} id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.05' numOctaves='4' seed='3' stitchTiles='stitch'/><feColorMatrix type='luminanceToAlpha'/><feDiffuseLighting surfaceScale='6' lighting-color='#fff' diffuseConstant='.64'><feDistantLight azimuth='235' elevation='50'/></feDiffuseLighting></filter><rect width='100%' height='100%' filter='url(#f)'/>`,
    ),
    size: '260px 260px',
    blend: 'soft-light',
  },
  linho: {
    img: svgUrl(
      220,
      220,
      `<filter ${SRGB} id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.02 1.1' numOctaves='1' seed='4' stitchTiles='stitch' result='h'/><feTurbulence type='fractalNoise' baseFrequency='1.1 .02' numOctaves='1' seed='9' stitchTiles='stitch' result='v'/><feBlend in='h' in2='v' mode='multiply'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='2.1' intercept='-.5'/><feFuncG type='linear' slope='2.1' intercept='-.5'/><feFuncB type='linear' slope='2.1' intercept='-.5'/><feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#f)'/>`,
    ),
    size: '220px 220px',
    blend: 'soft-light',
  },
  verge: {
    img: svgUrl(
      240,
      240,
      `<defs><filter ${SRGB} id='w'><feTurbulence type='fractalNoise' baseFrequency='.02 .3' numOctaves='2' seed='2' stitchTiles='stitch'/><feDisplacementMap in='SourceGraphic' scale='1.8'/></filter><pattern id='l' width='240' height='3' patternUnits='userSpaceOnUse'><rect width='240' height='1.2' fill='#000' fill-opacity='.42'/><rect y='1.7' width='240' height='1' fill='#fff' fill-opacity='.55'/></pattern></defs><rect width='240' height='240' fill='#808080'/><g filter='url(#w)'><rect width='240' height='240' fill='url(#l)'/><g fill='#fff' fill-opacity='.6'><rect x='28' width='2.4' height='240'/><rect x='108' width='2.4' height='240'/><rect x='188' width='2.4' height='240'/></g></g>`,
    ),
    size: '240px 240px',
    blend: 'soft-light',
  },
  glitter: {
    img: svgUrl(
      140,
      140,
      `<filter ${SRGB} id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.6' numOctaves='1' seed='21' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  5 0 0 0 -3.2'/><feComponentTransfer><feFuncA type='discrete' tableValues='0 .85 1'/></feComponentTransfer></filter><filter ${SRGB} id='c' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.55' numOctaves='1' seed='42' stitchTiles='stitch'/><feColorMatrix values='1.5 0 0 0 0  0 1.3 0 0 .05  0 0 1.7 0 .1  0 5 0 0 -3.3'/><feComponentTransfer><feFuncA type='discrete' tableValues='0 .85 1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#g)'/><rect width='100%' height='100%' filter='url(#c)'/>`,
    ),
    size: '140px 140px',
    blend: 'screen',
  },
};

TEXTURES.reciclado = (() => {
  const r = rng(99);
  const cols = ['#2e3f66', '#7a2f2f', '#333', '#555', '#6a5a2c', '#2f5a3a', '#3a3a70'];
  let fib = '';
  for (let k = 0; k < 70; k++) {
    const x = r() * 260,
      y = r() * 260,
      a = r() * Math.PI * 2,
      l = 3 + r() * 7;
    const x2 = x + Math.cos(a) * l,
      y2 = y + Math.sin(a) * l;
    const cx = (x + x2) / 2 + (r() - 0.5) * 4,
      cy = (y + y2) / 2 + (r() - 0.5) * 4;
    fib += `<path d='M${f1(x)} ${f1(y)}Q${f1(cx)} ${f1(cy)} ${f1(x2)} ${f1(y2)}' stroke='${cols[k % cols.length]}' stroke-opacity='${(0.35 + r() * 0.35).toFixed(2)}' stroke-width='${(0.6 + r() * 0.6).toFixed(2)}'/>`;
  }
  let dots = '';
  for (let k = 0; k < 150; k++)
    dots += `<circle cx='${f1(r() * 260)}' cy='${f1(r() * 260)}' r='${(0.4 + r() * r() * 1.4).toFixed(2)}' fill='#2a241c' fill-opacity='${(0.3 + r() * 0.5).toFixed(2)}'/>`;
  return {
    img: svgUrl(
      260,
      260,
      `<filter ${SRGB} id='m' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.028' numOctaves='3' seed='5' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='.22' intercept='.8'/><feFuncG type='linear' slope='.22' intercept='.78'/><feFuncB type='linear' slope='.22' intercept='.75'/><feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#m)'/>${dots}<g fill='none' stroke-linecap='round'>${fib}</g>`,
    ),
    size: '260px 260px',
    blend: 'multiply',
  };
})();

/** A textura do papel, para as variáveis de CSS (`--textura`, `--textura-tam`, `--textura-mistura`). */
export function textureOf(paper: Paper | undefined): Texture | null {
  return TEXTURES[paper ?? 'cartolina'] ?? null;
}

// ===================== Miudezas =====================

export function f1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: uma sequência de 0 a 1 a partir de uma semente. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
