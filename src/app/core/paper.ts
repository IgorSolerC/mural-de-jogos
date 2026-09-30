/**
 * O papel da ficha, escolhido no editor: o papel da cartolina (textura), uma estampa de papelaria
 * (a cartolina temática: gatinhos, caveiras…), um rabisco que toma a ficha inteira, um estrago
 * (arrancada, dobrada, amassada, queimada…) e uma mancha (café, água, mofo, pegadas). Um de cada, no
 * máximo. Estampa e rabisco ficam atrás do que está escrito; o estrago é do papel, então leva junto o
 * que estiver escrito ali, mas não a foto nem os adesivos, que foram colados depois por cima.
 * Tudo é desenhado por id: a mesma ficha rasga sempre do mesmo jeito. Os desenhos estão em
 * `paper-art.ts`.
 */

// ===================== Papel (textura) =====================

export type Paper =
  | 'cartolina'
  | 'lisa'
  | 'canson'
  | 'linho'
  | 'verge'
  | 'reciclado'
  | 'glitter'
  | 'aquarela'
  | 'feltro'
  | 'arroz'
  | 'ondulado'
  | 'metalizado'
  | 'perolado';

/** Na ordem do estojo: dos lisos aos de relevo, os de fibra e, por último, os que brilham. */
export const PAPERS: readonly Paper[] = ['cartolina', 'lisa', 'canson', 'aquarela', 'linho', 'feltro', 'verge', 'arroz', 'reciclado', 'ondulado', 'metalizado', 'perolado', 'glitter'];

export const PAPER_LABEL: Record<Paper, string> = {
  cartolina: 'Cartolina',
  lisa: 'Lisa',
  canson: 'Canson',
  linho: 'Linho',
  verge: 'Vergê',
  reciclado: 'Reciclado',
  glitter: 'Glitter',
  aquarela: 'Aquarela',
  feltro: 'Feltro',
  arroz: 'Papel de arroz',
  ondulado: 'Ondulado',
  metalizado: 'Metalizado',
  perolado: 'Perolado',
};

// ===================== Estampa =====================

import type { MorePattern } from './pattern-motifs';

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
  | 'aranhas'
  | MorePattern;

/** A ordem no editor: por assunto, para achar mais fácil (bichos, terror, comida, jogo, céu, natureza…). */
export const PATTERNS: readonly Pattern[] = [
  // bichos
  'gatinhos',
  'cachorros',
  'aranhas',
  'borboletas',
  'abelhas',
  'peixes',
  'dinossauros',
  // terror
  'caveiras',
  'fantasmas',
  'morcegos',
  'aboboras',
  'bruxaria',
  'olhos',
  // comida
  'cozinha',
  'frutas',
  'doces',
  'pizza',
  'cafe',
  'cogumelos',
  // jogo
  'controles',
  'pixel',
  'dados',
  'cartas',
  'xadrez',
  // céu
  'estrelas',
  'planetas',
  'alienigenas',
  'raios',
  'chuva',
  // natureza
  'flores',
  'folhas',
  'cactos',
  // aventura
  'medieval',
  'piratas',
  'ninja',
  'tatuagens',
  'mineracao',
  // coisas
  'foguinhos',
  'coracoes',
  'ferramentas',
  'carros',
  'robos',
  'musica',
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
  cachorros: 'Cachorros',
  borboletas: 'Borboletas',
  abelhas: 'Abelhas',
  peixes: 'Peixes e baleias',
  dinossauros: 'Dinossauros',
  morcegos: 'Morcegos',
  aboboras: 'Abóboras',
  bruxaria: 'Bruxaria',
  olhos: 'Olhos',
  cozinha: 'Utensílios de cozinha',
  frutas: 'Frutas',
  doces: 'Doces',
  pizza: 'Pizza',
  cafe: 'Café',
  pixel: 'Pixel',
  dados: 'Dados',
  cartas: 'Naipes',
  xadrez: 'Xadrez',
  alienigenas: 'Alienígenas',
  chuva: 'Chuva',
  folhas: 'Folhas',
  cactos: 'Cactos',
  medieval: 'Armas medievais',
  piratas: 'Piratas',
  ninja: 'Ninja',
  tatuagens: 'Tatuagens de gangue',
  ferramentas: 'Ferramentas',
  robos: 'Robôs',
  musica: 'Música',
  mineracao: 'Mineração',
  carros: 'Carros',
};

/**
 * Os ajustes da estampa: o espaço entre os desenhos, o tamanho deles e o quanto saem da fileira
 * (girados, fora do lugar, de tamanhos diferentes). O espaço vai até os desenhos se amontoarem uns
 * por cima dos outros; o tamanho, até um desenho maior que a ficha inteira. O de sempre não é guardado.
 */
export interface PatternLook {
  spacing: number;
  size: number;
  jitter: number;
}

export type LookKey = keyof PatternLook;

export const LOOK_KEYS: readonly LookKey[] = ['spacing', 'size', 'jitter'];

export const DEFAULT_LOOK: PatternLook = { spacing: 4, size: 2, jitter: 1 };

export const LOOK_LABEL: Record<LookKey, string> = {
  spacing: 'Espaço',
  size: 'Tamanho',
  jitter: 'Alinhamento',
};

export const LOOK_STEP_LABEL: Record<LookKey, readonly string[]> = {
  spacing: ['Amontoados', 'Encavalados', 'Grudados', 'Juntinhos', 'Normal', 'Espaçados', 'Soltos'],
  size: ['Miudinhos', 'Pequenos', 'Normais', 'Grandes', 'Enormes', 'Gigantes', 'Colossais', 'Quase a folha', 'Maiores que a folha'],
  jitter: ['Alinhados', 'De leve', 'Tortos', 'Bagunçados', 'Espalhados'],
};

/** Quantos degraus cada ajuste tem. */
export const LOOK_STEPS: Record<LookKey, number> = {
  spacing: LOOK_STEP_LABEL.spacing.length,
  size: LOOK_STEP_LABEL.size.length,
  jitter: LOOK_STEP_LABEL.jitter.length,
};

/** O degrau guardado com a ficha; o de sempre não vai para o armazenamento. */
export function sanitizeLookStep(raw: unknown, key: LookKey): number | undefined {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < LOOK_STEPS[key] && raw !== DEFAULT_LOOK[key] ? (raw as number) : undefined;
}

/** Os ajustes de uma ficha, com o de sempre no lugar do que ela não tem. */
export function lookOf(r: { patternSpacing?: number; patternSize?: number; patternJitter?: number }): PatternLook {
  return {
    spacing: r.patternSpacing ?? DEFAULT_LOOK.spacing,
    size: r.patternSize ?? DEFAULT_LOOK.size,
    jitter: r.patternJitter ?? DEFAULT_LOOK.jitter,
  };
}

// ===================== Rabisco =====================

export type Scribble =
  | 'novelo'
  | 'hachura'
  | 'riscado'
  | 'contorno'
  | 'aula'
  | 'moldura'
  | 'renda'
  | 'cupom'
  | 'pelicula'
  | 'regua'
  | 'trepadeira'
  | 'bandeirinhas'
  | 'gotica'
  | 'arabesco'
  | 'dialogo'
  | 'hud'
  | 'runas'
  | 'farpado'
  | 'terco'
  | 'invocacao'
  | 'tesouro'
  | 'olhos'
  | 'cybertribal';

/** Na ordem do estojo: as molduras, os enfeites e, por último, os bagunçados. */
export const SCRIBBLES: readonly Scribble[] = [
  'contorno', 'moldura', 'gotica', 'cybertribal', 'arabesco', 'dialogo', 'hud', 'runas', 'farpado', 'renda', 'cupom', 'pelicula', 'regua',
  'trepadeira', 'bandeirinhas', 'terco', 'invocacao', 'tesouro', 'olhos', 'aula', 'novelo', 'hachura', 'riscado',
];

export const SCRIBBLE_LABEL: Record<Scribble, string> = {
  novelo: 'Novelo',
  hachura: 'Hachura',
  riscado: 'Riscado',
  contorno: 'Contorno',
  aula: 'Tédio na aula',
  moldura: 'Moldura',
  renda: 'Renda',
  cupom: 'Recorte aqui',
  pelicula: 'Película',
  regua: 'Régua',
  trepadeira: 'Trepadeira',
  bandeirinhas: 'Bandeirinhas',
  gotica: 'Moldura gótica',
  arabesco: 'Arabescos',
  dialogo: 'Caixa de diálogo',
  hud: 'Mira de tiro',
  runas: 'Runas',
  farpado: 'Arame farpado',
  terco: 'Terço',
  invocacao: 'Círculo de invocação',
  tesouro: 'Mapa do tesouro',
  olhos: 'Olhos na margem',
  cybertribal: 'Moldura cybertribal',
};

/**
 * A força do lápis do rabisco, em degraus: de quase sumido a carregado. O Normal (o de sempre) não
 * é guardado; os outros multiplicam a opacidade do grafite.
 */
export const SCRIBBLE_INK: readonly number[] = [0.25, 0.45, 0.7, 1, 1.35, 1.7, 2];
export const SCRIBBLE_INK_LABEL: readonly string[] = ['Quase sumido', 'Bem clarinho', 'Clarinho', 'Normal', 'Mais escuro', 'Escuro', 'Carregado'];
export const DEFAULT_SCRIBBLE_INK = 3;

/** O degrau guardado com a ficha; o Normal não vai para o armazenamento. */
export function sanitizeScribbleInk(raw: unknown): number | undefined {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < SCRIBBLE_INK.length && raw !== DEFAULT_SCRIBBLE_INK ? (raw as number) : undefined;
}

// ===================== Estrago =====================

/** O que mexe no próprio papel: rasga, fura, dobra, queima, arranha. */
export type Damage =
  | 'rasgado'
  | 'rasgao'
  | 'remendado'
  | 'costurado'
  | 'colado'
  | 'picotado'
  | 'caderno'
  | 'orelha'
  | 'dobrado'
  | 'amassado'
  | 'arranhado'
  | 'garras'
  | 'mordido'
  | 'furado'
  | 'baleado'
  | 'queimado'
  | 'descascado';

/** A ordem dos retalhos no editor: os rasgos e remendos, as dobras, os bichos, o fogo. */
export const DAMAGES: readonly Damage[] = [
  'rasgado',
  'rasgao',
  'remendado',
  'costurado',
  'colado',
  'picotado',
  'caderno',
  'orelha',
  'dobrado',
  'amassado',
  'arranhado',
  'garras',
  'mordido',
  'furado',
  'baleado',
  'queimado',
  'descascado',
];

export const DAMAGE_LABEL: Record<Damage, string> = {
  rasgado: 'Rasgada',
  rasgao: 'Rasgão',
  remendado: 'Remendada',
  costurado: 'Costurada',
  colado: 'Colada em pedaços',
  picotado: 'Tesoura de picote',
  caderno: 'Arrancada do caderno',
  orelha: 'Orelha',
  dobrado: 'Dobrada em quatro',
  amassado: 'Amassada',
  arranhado: 'Arranhada',
  garras: 'Garras',
  mordido: 'Mordida',
  furado: 'Furada',
  baleado: 'Baleada',
  queimado: 'Queimada',
  descascado: 'Fita arrancada',
};

// ===================== Mancha =====================

/**
 * O que caiu em cima do papel, sem mexer nele: o café, a água, o sangue, o mofo, as pegadas, as traças. Vai
 * junto com um estrago (uma ficha rasgada pode ter café). Os desenhos são os mesmos de quando as
 * manchas ficavam entre os estragos: o sorteio guardado dá a mesma mancha.
 */
export type Stain = 'cafe' | 'molhado' | 'sangue' | 'mofado' | 'tracas' | 'pisado' | 'pegadas' | 'passos' | 'mao' | 'nanquim' | 'gosma' | 'lagrimas' | 'salgadinho' | 'cybertribal';

/** Na ordem do estojo: o que se bebe e o que se chora, o sangue e a tinta, a gosma e a gordura, o mofo e os bichos, e quem passou por cima. */
export const STAINS: readonly Stain[] = ['cafe', 'molhado', 'lagrimas', 'sangue', 'mao', 'nanquim', 'gosma', 'salgadinho', 'mofado', 'tracas', 'pisado', 'pegadas', 'passos', 'cybertribal'];

export const STAIN_LABEL: Record<Stain, string> = {
  cafe: 'Café',
  molhado: 'Molhada',
  sangue: 'Sangue',
  mofado: 'Mofada',
  tracas: 'Traças',
  pisado: 'Pisada',
  pegadas: 'Pegadas de gato',
  passos: 'Passinhos misteriosos',
  mao: 'Mão de sangue',
  nanquim: 'Nanquim',
  gosma: 'Gosma',
  lagrimas: 'Lágrimas',
  salgadinho: 'Dedos de salgadinho',
  cybertribal: 'Cybertribal',
};

// ===================== Decoração =====================

/**
 * Coisas de fora postas na ficha depois de pronta: purpurina, estrelinhas douradas, adesivos, um selo,
 * um clipe, argolas, ilhoses. Ficam por cima de tudo, até da foto. Os desenhos estão em `decor-art.ts`.
 */
export type Decor =
  | 'purpurina'
  | 'estrelinhas'
  | 'adesivos'
  | 'selo'
  | 'clipe'
  | 'argolas'
  | 'ilhoses'
  | 'confete'
  | 'neon'
  | 'gamer'
  | 'bottons'
  | 'vidas'
  | 'postit'
  | 'ingresso'
  | 'promocao'
  | 'carimbo'
  | 'medalha'
  | 'lacre'
  | 'grampos'
  | 'alfinete'
  | 'curativo'
  | 'cuidado'
  | 'neve'
  | 'petalas'
  | 'teia'
  | 'beijo';

/**
 * Na ordem do estojo: o que brilha e a festa; os adesivos e as coisas de jogo; a papelaria (selo,
 * post-it, ingresso, etiqueta, carimbo, medalha, lacre); o que prende e fura; o tempo e os bichos.
 */
export const DECORS: readonly Decor[] = [
  'purpurina',
  'confete',
  'estrelinhas',
  'neon',
  'adesivos',
  'gamer',
  'bottons',
  'vidas',
  'selo',
  'postit',
  'ingresso',
  'promocao',
  'carimbo',
  'medalha',
  'lacre',
  'clipe',
  'grampos',
  'alfinete',
  'argolas',
  'ilhoses',
  'curativo',
  'cuidado',
  'neve',
  'petalas',
  'teia',
  'beijo',
];

export const DECOR_LABEL: Record<Decor, string> = {
  purpurina: 'Purpurina',
  estrelinhas: 'Estrelinhas douradas',
  adesivos: 'Adesivos fofos',
  selo: 'Selo',
  clipe: 'Clipe',
  argolas: 'Argolas',
  ilhoses: 'Ilhoses',
  confete: 'Confete',
  neon: 'Néon',
  gamer: 'Adesivos gamer',
  bottons: 'Bottons',
  vidas: 'Corações de vida',
  postit: 'Post-it',
  ingresso: 'Ingresso',
  promocao: 'Etiqueta de promoção',
  carimbo: 'Carimbo',
  medalha: 'Medalha de campeão',
  lacre: 'Lacre de cera',
  grampos: 'Grampos',
  alfinete: 'Alfinete',
  curativo: 'Curativo',
  cuidado: 'Fita de cuidado',
  neve: 'Neve',
  petalas: 'Pétalas de cerejeira',
  teia: 'Teia de aranha',
  beijo: 'Beijo de batom',
};

/** As decorações que furam o papel: a sombra da ficha segue o recorte, como nos estragos. */
export function decorCuts(d: Decor | undefined): boolean {
  return d === 'argolas' || d === 'ilhoses' || d === 'alfinete';
}

/** Os estragos (e manchas) que tiram um pedaço do papel (ou entortam a beirada): a sombra segue o recorte. */
export function cutsPaper(d: Damage | Stain | undefined): boolean {
  return !!d && CUTS.has(d);
}

const CUTS: ReadonlySet<Damage | Stain> = new Set<Damage | Stain>([
  'rasgado',
  'rasgao',
  'remendado',
  'costurado',
  'colado',
  'picotado',
  'caderno',
  'orelha',
  'amassado',
  'arranhado',
  'garras',
  'mordido',
  'tracas',
  'furado',
  'baleado',
  'queimado',
]);

// ===================== Guardar =====================

function oneOf<T extends string>(list: readonly T[], fallback?: T) {
  return (raw: unknown): T | undefined => ((list as readonly unknown[]).includes(raw) && raw !== fallback ? (raw as T) : undefined);
}

/** Só o que existe; a cartolina de sempre (e "nenhum") não vai para o armazenamento. */
export const sanitizePaper = oneOf(PAPERS, 'cartolina');
export const sanitizePattern = oneOf(PATTERNS);
export const sanitizeScribble = oneOf(SCRIBBLES);
export const sanitizeDecor = oneOf(DECORS);
const currentDamage = oneOf(DAMAGES);
/** As fichas e backups antigos usavam dois nomes para os formatos agora reunidos. */
export const sanitizeDamage = (raw: unknown): Damage | undefined =>
  raw === 'arrancado' || raw === 'canto' ? 'rasgado' : currentDamage(raw);
/** Só a mancha; as fichas de antes guardavam a mancha no lugar do estrago (Review.sanitize muda de campo). */
export const sanitizeStain = oneOf(STAINS);

/**
 * O sorteio do estrago e do rabisco: cada clique rasga (ou rabisca) de outro jeito, e o jeito
 * escolhido fica guardado com a ficha. Sem o sorteio (as fichas de antes), ele sai do id, como sempre.
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
      `<defs><filter ${SRGB} id='w'><feTurbulence type='fractalNoise' baseFrequency='.02 .3' numOctaves='2' seed='2' stitchTiles='stitch'/><feDisplacementMap in='SourceGraphic' scale='1.8'/></filter><pattern id='l' width='240' height='3' patternUnits='userSpaceOnUse'><rect width='240' height='1.2' fill='#000' fill-opacity='.42'/><rect y='1.7' width='240' height='1' fill='#fff' fill-opacity='.55'/></pattern></defs><rect width='240' height='240' fill='#808080'/><g filter='url(#w)'><rect width='240' height='240' fill='url(#l)'/></g>`,
    ),
    size: '240px 240px',
    blend: 'soft-light',
  },
  aquarela: {
    // o grão graúdo do papel de aquarela: montes e covinhas largos, com luz de lado
    img: svgUrl(
      300,
      300,
      `<filter ${SRGB} id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.024' numOctaves='5' seed='11' stitchTiles='stitch'/><feColorMatrix type='luminanceToAlpha'/><feDiffuseLighting surfaceScale='11' lighting-color='#fff' diffuseConstant='.62'><feDistantLight azimuth='225' elevation='42'/></feDiffuseLighting></filter><rect width='100%' height='100%' filter='url(#f)'/>`,
    ),
    size: '300px 300px',
    blend: 'soft-light',
  },
  feltro: {
    // penugem fina e fechada, sem direção: cada fiapo um pontinho claro ou escuro
    img: svgUrl(
      180,
      180,
      `<filter ${SRGB} id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='6' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feGaussianBlur stdDeviation='.35'/><feComponentTransfer><feFuncR type='linear' slope='2.6' intercept='-.8'/><feFuncG type='linear' slope='2.6' intercept='-.8'/><feFuncB type='linear' slope='2.6' intercept='-.8'/><feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#f)'/>`,
    ),
    size: '180px 180px',
    blend: 'soft-light',
  },
  ondulado: {
    // o papelão ondulado: as ondas deitadas, luz em cima de cada uma e sombra no vão
    img: svgUrl(
      240,
      9,
      `<defs><linearGradient id='o' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#5c5c5c'/><stop offset='.35' stop-color='#bdbdbd'/><stop offset='.55' stop-color='#d2d2d2'/><stop offset='1' stop-color='#5c5c5c'/></linearGradient></defs><rect width='240' height='9' fill='url(#o)'/>`,
    ),
    size: '240px 9px',
    blend: 'soft-light',
  },
  metalizado: {
    // metal escovado: riscos finos deitados e duas faixas largas de brilho
    img: svgUrl(
      320,
      320,
      `<defs><linearGradient id='b' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.22' stop-color='#fff' stop-opacity='.55'/><stop offset='.4' stop-color='#000' stop-opacity='.25'/><stop offset='.68' stop-color='#fff' stop-opacity='.4'/><stop offset='.86' stop-color='#000' stop-opacity='.2'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient><filter ${SRGB} id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.006 .9' numOctaves='2' seed='8' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='2.2' intercept='-.6'/><feFuncG type='linear' slope='2.2' intercept='-.6'/><feFuncB type='linear' slope='2.2' intercept='-.6'/><feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer></filter></defs><rect width='100%' height='100%' filter='url(#f)'/><rect width='100%' height='100%' fill='url(#b)'/>`,
    ),
    size: '320px 320px',
    blend: 'soft-light',
  },
  perolado: {
    // o reflexo furta-cor da cartolina perolada: rosa, creme, verde-água e lilás passando de leve, com nuvens
    img: svgUrl(
      420,
      420,
      `<defs><linearGradient id='p' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#ff8fd0'/><stop offset='.25' stop-color='#ffe27a'/><stop offset='.5' stop-color='#7fe3ff'/><stop offset='.75' stop-color='#b99bff'/><stop offset='1' stop-color='#ff8fd0'/></linearGradient><filter ${SRGB} id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.008' numOctaves='3' seed='14' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.4 1.1'/></filter></defs><rect width='100%' height='100%' fill='url(#p)'/><rect width='100%' height='100%' filter='url(#n)' opacity='.4'/>`,
    ),
    size: '420px 420px',
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

TEXTURES.arroz = (() => {
  // o papel de arroz: fibras compridas e claras, curvas, espalhadas por cima de nuvens de fibra (soft-light)
  const r = rng(77);
  const T = 280;
  let fib = '';
  for (let k = 0; k < 90; k++) {
    const x = r() * T,
      y = r() * T,
      a = r() * Math.PI * 2,
      l = 18 + r() * 50;
    const x2 = x + Math.cos(a) * l,
      y2 = y + Math.sin(a) * l;
    const cx = (x + x2) / 2 + (r() - 0.5) * l * 0.6,
      cy = (y + y2) / 2 + (r() - 0.5) * l * 0.6;
    fib += `<path d='M${f1(x)} ${f1(y)}Q${f1(cx)} ${f1(cy)} ${f1(x2)} ${f1(y2)}' stroke-opacity='${(0.3 + r() * 0.45).toFixed(2)}' stroke-width='${(0.4 + r() * 0.8).toFixed(2)}'/>`;
  }
  // as fibras que passam da beirada voltam do outro lado: o ladrilho emenda sem costura
  const copies = [
    [0, 0],
    [-T, 0],
    [0, -T],
    [-T, -T],
  ]
    .map(([dx, dy]) => `<g transform='translate(${dx} ${dy})'>${fib}</g>`)
    .join('');
  return {
    img: svgUrl(
      T,
      T,
      `<filter ${SRGB} id='m' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.018' numOctaves='3' seed='23' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='.5' intercept='.26'/><feFuncG type='linear' slope='.5' intercept='.26'/><feFuncB type='linear' slope='.5' intercept='.26'/><feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#m)'/><g fill='none' stroke='#fff' stroke-linecap='round'>${copies}</g>`,
    ),
    size: `${T}px ${T}px`,
    blend: 'soft-light',
  };
})();

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
