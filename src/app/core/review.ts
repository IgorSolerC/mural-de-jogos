import { KIND_PROFILES, Kind, isKind, profileOf } from './kinds';
import { scoreDisplay } from './settings';
import { Damage, Decor, Paper, Pattern, Scribble, Stain, sanitizeDamage, sanitizeDecor, sanitizeLookStep, sanitizePaper, sanitizePattern, sanitizeScribble, sanitizeScribbleInk, sanitizeSeed, sanitizeStain } from './paper';

export type { Kind } from './kinds';

/** Não terminei, terminei e fui além (Platinado, Relido, Revisto, Revi). Os nomes mudam por mural; o valor, nunca. */
export type Status = 'incompleto' | 'finalizado' | 'platinado';

/**
 * A escala de dificuldade. O valor guardado nunca muda de sentido: quando o topo ganhou o nível
 * das caveiras vermelhas, 'dificil' passou a se chamar Complicado e 'impossivel' passou a se
 * chamar Difícil; o novo Infernal é 'infernal'. Resenhas e backups antigos continuam certos.
 */
export type Difficulty = 'nenhuma' | 'facil' | 'media' | 'dificil' | 'impossivel' | 'infernal';

export type Verdict = 'masterpiece' | 'recomendo' | 'legalzinho' | 'meh' | 'chato';

export type LightStock = 'vermelho' | 'laranja' | 'amarelo' | 'verde' | 'azul' | 'lilas' | 'rosa' | 'cinza' | 'branco';
/** A versão bem escura de cada cartolina: a do branco é a preta. */
export type DarkStock =
  | 'vermelho-escuro'
  | 'laranja-escuro'
  | 'amarelo-escuro'
  | 'verde-escuro'
  | 'azul-escuro'
  | 'lilas-escuro'
  | 'rosa-escuro'
  | 'cinza-escuro'
  | 'preto';
export type Stock = LightStock | DarkStock;

/** As cartolinas claras, na volta do círculo de cores, o cinza e o branco no fim. */
export const LIGHT_STOCKS: readonly LightStock[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'lilas', 'rosa', 'cinza', 'branco'];
/** As escuras, na mesma ordem: cada uma embaixo da clara dela, no editor. */
export const DARK_STOCKS: readonly DarkStock[] = ['vermelho-escuro', 'laranja-escuro', 'amarelo-escuro', 'verde-escuro', 'azul-escuro', 'lilas-escuro', 'rosa-escuro', 'cinza-escuro', 'preto'];
/** Todas: a ordem das amostras no editor, as claras numa fileira e as escuras na de baixo. */
export const STOCKS: readonly Stock[] = [...LIGHT_STOCKS, ...DARK_STOCKS];

/** Na cartolina escura a tinta é clara: o que está escrito nela, o lápis do rabisco e a estampa. */
export function isDarkStock(s: Stock | undefined): s is DarkStock {
  return !!s && (DARK_STOCKS as readonly string[]).includes(s);
}

/**
 * O rodízio que dá cor às fichas antigas sem cor (e à tachinha delas): as oito de sempre, sem o
 * branco nem as escuras, que vieram depois. Assim nenhuma ficha de antes muda de cor.
 */
export const ROTATION_STOCKS: readonly Stock[] = ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'lilas', 'rosa', 'cinza'];

export const STOCK_LABEL: Record<Stock, string> = {
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
  lilas: 'Lilás',
  rosa: 'Rosa',
  cinza: 'Cinza',
  branco: 'Branco',
  'vermelho-escuro': 'Vermelho escuro',
  'laranja-escuro': 'Laranja escuro',
  'amarelo-escuro': 'Amarelo escuro',
  'verde-escuro': 'Verde escuro',
  'azul-escuro': 'Azul escuro',
  'lilas-escuro': 'Lilás escuro',
  'rosa-escuro': 'Rosa escuro',
  'cinza-escuro': 'Cinza escuro',
  preto: 'Preto',
};

/**
 * As notas que a pessoa dá, de todos os murais. Cada mural usa quatro (ver `KIND_PROFILES`); a
 * mesma chave quer dizer a mesma coisa em qualquer mural (História é História num jogo e num livro).
 */
export type RatedKey =
  | 'historia'
  | 'diversao'
  | 'jogabilidade'
  | 'visual'
  | 'envolvimento'
  | 'personagens'
  | 'escrita'
  | 'roteiro'
  | 'atuacao'
  | 'animacao';

/** 'final' é a média ponderada das notas dadas, nunca digitada. */
export type ScoreKey = 'final' | RatedKey;

/** Quanto cada categoria conta para a média desta resenha. 'nao-tem' tira a categoria da conta. */
export type Weight = 'nao-tem' | 'pouco' | 'normal' | 'relevante';

export type Weights = Partial<Record<RatedKey, Weight>>;

export const WEIGHTS: readonly Weight[] = ['relevante', 'normal', 'pouco', 'nao-tem'];

export const WEIGHT_LABEL: Record<Weight, string> = {
  relevante: 'Relevante',
  normal: 'Normal',
  pouco: 'Pouco importante',
  'nao-tem': 'Não tem',
};

/** Multiplicador sobre o peso-base da categoria. */
export const WEIGHT_FACTOR: Record<Weight, number> = {
  relevante: 2,
  normal: 1,
  pouco: 0.5,
  'nao-tem': 0,
};

/** Bônus a favor puxam a média como um 10 a mais; os contra, como um 0 a mais. Cada um mexe no máximo um quarto de ponto. */
export type BonusKind = 'favor' | 'contra';

export interface Bonus {
  /** Da cartela pronta do mural ('trilha-sonora') ou escrito pela pessoa ('u-…', tirado do nome). */
  id: string;
  label: string;
  kind: BonusKind;
}

export const BONUS_KINDS: readonly BonusKind[] = ['favor', 'contra'];

export const BONUS_KIND_LABEL: Record<BonusKind, string> = { favor: 'A favor', contra: 'Contra' };

/** A nota que cada bônus põe na conta. */
export const BONUS_SCORE: Record<BonusKind, number> = { favor: 10, contra: 0 };

/** Cada bônus pesa na média o mesmo que uma categoria Normal de peso-base 1 (História, por exemplo). */
export const BONUS_WEIGHT = 1;

/** O máximo que um bônus sozinho mexe na média, para cima ou para baixo: um defeito não derruba uma ficha inteira. */
export const BONUS_MAX_SHIFT = 0.25;

/** Nomes curtos o bastante para caber num adesivo da ficha. */
export const BONUS_MAX_LABEL = 32;

const CATALOG_BY_ID = Object.fromEntries(
  Object.values(KIND_PROFILES).map((p) => [p.kind, new Map(p.bonuses.map((b) => [b.id, b]))]),
) as Record<Kind, Map<string, Bonus>>;

/** É um adesivo da cartela pronta deste mural? */
export function isCatalogBonus(kind: Kind, id: string): boolean {
  return CATALOG_BY_ID[kind].has(id);
}

/**
 * Id de um bônus escrito pela pessoa: o mesmo nome do mesmo lado dá sempre o mesmo id. O lado entra
 * no id para "Curto" a favor numa ficha e "Curto" contra noutra não virarem o mesmo bônus.
 */
export function customBonusId(label: string, kind: BonusKind): string {
  const slug = fold(label)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `u-${kind === 'favor' ? 'f' : 'c'}-${slug || 'bonus'}`;
}

/** "  muitos   inimigos " → "Muitos inimigos". */
export function cleanBonusLabel(label: string): string {
  const flat = label.replace(/\s+/g, ' ').trim().slice(0, BONUS_MAX_LABEL).trim();
  return flat.charAt(0).toUpperCase() + flat.slice(1);
}

/** Os a favor primeiro, os contra depois; dentro de cada lado, a ordem em que foram colados. */
export function sortBonuses(list: readonly Bonus[]): Bonus[] {
  return [...list.filter((b) => b.kind === 'favor'), ...list.filter((b) => b.kind === 'contra')];
}

export function bonusTally(list: readonly Bonus[] | undefined): Record<BonusKind, number> {
  const t = { favor: 0, contra: 0 };
  for (const b of list ?? []) t[b.kind]++;
  return t;
}

/** As notas de uma ficha: só as quatro do mural dela, de 0 a 10 (null é sem nota). */
export type Rated = Partial<Record<RatedKey, number | null>>;

/** Categorias de 0 a 10; final com uma casa decimal, até 11 somente quando dada na mão. */
export type Scores = { final: number } & Rated;

/** A nota de uma categoria, ou null (sem nota, ou categoria de outro mural). */
export function scoreOf(scores: Rated & { final?: number }, k: ScoreKey): number | null {
  // a final vale como aparece (Ajustes › Nota): é ela que ordena, agrupa e empata
  if (k === 'final') return scores.final === undefined ? null : shownScore(scores.final);
  return scores[k] ?? null;
}

export type GameSource = 'wikipedia' | 'rawg' | 'openlibrary' | 'kitsu' | 'anilist' | 'tmdb' | 'manual';

/** O que foi escolhido na busca: um jogo, um livro, um filme… O nome ficou de quando o mural só tinha jogos. */
export interface PickedGame {
  name: string;
  coverUrl: string | null;
  source: GameSource;
  sourceId?: string;
  year?: string;
  /** Quem escreveu (livros), para distinguir dois títulos iguais. */
  by?: string;
}

export interface Review {
  id: string;
  /** Em qual mural a ficha mora. Fichas de antes dos murais são jogos. */
  kind: Kind;
  /** O item resenhado (o campo se chama `game` desde o primeiro backup; renomear perderia dados). */
  game: PickedGame;
  scores: Scores;
  status: Status;
  /** Só nos murais com dificuldade; nos outros, sempre 'nenhuma'. */
  difficulty: Difficulty;
  /** O carimbo de veredito; opcional. */
  verdict: Verdict | null;
  /** Peso de cada categoria nesta resenha; ausente = normal. */
  weights: Weights;
  /** Bônus a favor e contra, na ordem em que foram colados. Entram na média. */
  bonuses: Bonus[];
  /**
   * A nota final dada na mão, no lugar da média (0 a 11, uma casa). Quando existe, é ela que vai em
   * `scores.final`; a média das notas continua saindo de `computeFinal`. Sem o campo, vale a média.
   */
  finalOverride?: number;
  /** A quantidade do mural: horas jogadas, páginas lidas. Null nos murais sem quantidade. */
  hoursPlayed: number | null;
  /** Cor da cartolina, escolhida uma vez quando a ficha é criada. */
  stock?: Stock;
  /** O papel da cartolina (canson, linho, glitter…); sem o campo, a cartolina de sempre. */
  paper?: Paper;
  /** A estampa de papelaria impressa na cartolina (gatinhos, caveiras…); sem o campo, lisa. */
  pattern?: Pattern;
  /** Os ajustes da estampa (PatternLook), um degrau de 0 a 4 cada; sem o campo, o de sempre. */
  patternSpacing?: number;
  patternSize?: number;
  patternJitter?: number;
  /** O sorteio da estampa (cada clique nela desloca e bagunça de outro jeito); sem ele, centrada. */
  patternSeed?: number;
  /** O rabisco a lápis que toma a ficha inteira, atrás do que está escrito; sem o campo, nenhum. */
  scribble?: Scribble;
  /** O sorteio do rabisco que a pessoa escolheu (cada clique rabisca de outro jeito); sem ele, o jeito sai do id. */
  scribbleSeed?: number;
  /** A força do lápis do rabisco (um degrau de SCRIBBLE_INK); sem o campo, o Normal. */
  scribbleInk?: number;
  /** O estrago no papel (arrancada, queimada, amassada…): leva o que está escrito, não a foto nem os adesivos. */
  damage?: Damage;
  /** O sorteio do estrago que a pessoa escolheu (cada clique rasga de outro jeito); sem ele, o jeito sai do id. */
  damageSeed?: number;
  /** A mancha por cima do papel (café, água, sangue, mofo, pegadas): vai junto com o estrago. */
  stain?: Stain;
  /** O sorteio da mancha, como o do estrago. */
  stainSeed?: number;
  /** A decoração posta por cima de tudo (purpurina, adesivos, argolas…). */
  decor?: Decor;
  /** O sorteio da decoração, como o do estrago. */
  decorSeed?: number;
  text: string;
  /**
   * Dia em que foi concluído (ou visto pela última vez), 'AAAA-MM-DD', ou apenas 'AAAA'.
   * `null` é data não definida: algo de tanto tempo atrás que ninguém lembra mais o dia.
   */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Guardado para resenhar depois: só nome e capa, fora do mural. */
export interface Draft {
  id: string;
  kind: Kind;
  game: PickedGame;
  createdAt: string;
  updatedAt: string;
}

/**
 * Na wishlist: o que você quer jogar, ler ou ver, recortado do catálogo só com nome e capa. Tem a
 * mesma forma do pendente, mas mora em outra lista: ainda não foi jogado, não espera opinião.
 */
export interface Wish {
  id: string;
  kind: Kind;
  game: PickedGame;
  /** Quanta vontade; sem o campo (os desejos de antes dele), é Comum. */
  relevance?: Relevance;
  createdAt: string;
  updatedAt: string;
}

/** Quanta vontade de um desejo: MUST PLAY vai para a frente da wishlist, LATER para o fim. */
export type Relevance = 'must' | 'comum' | 'later';
export const RELEVANCES: readonly Relevance[] = ['must', 'comum', 'later'];
export const RELEVANCE_RANK: Record<Relevance, number> = { must: 0, comum: 1, later: 2 };

export function relevanceOf(w: Wish): Relevance {
  return w.relevance ?? 'comum';
}

/** O nome no adesivo, no verbo do mural: MUST PLAY nos jogos, MUST READ nos livros, MUST WATCH no resto. */
export function relevanceLabel(kind: Kind, r: Relevance): string {
  if (r === 'comum') return 'Comum';
  if (r === 'later') return 'LATER';
  return kind === 'jogos' ? 'MUST PLAY' : kind === 'livros' ? 'MUST READ' : 'MUST WATCH';
}

export const STATUSES: readonly Status[] = ['incompleto', 'finalizado', 'platinado'];

export const STATUS_RANK: Record<Status, number> = { incompleto: 1, finalizado: 2, platinado: 3 };

export const DIFFICULTIES: readonly Difficulty[] = ['nenhuma', 'facil', 'media', 'dificil', 'impossivel', 'infernal'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  nenhuma: 'Nenhuma',
  facil: 'Fácil',
  media: 'Média',
  dificil: 'Complicado',
  impossivel: 'Difícil',
  infernal: 'Infernal',
};

/** Quantas caveirinhas cada dificuldade ganha na ficha. */
export const DIFFICULTY_SKULLS: Record<Difficulty, number> = {
  nenhuma: 0,
  facil: 1,
  media: 2,
  dificil: 3,
  impossivel: 4,
  infernal: 5,
};

/** O topo da escala: as caveiras ficam vermelhas e ganham chifres. */
export const DIFFICULTY_MAX_SKULLS = 5;

export function isHorned(d: Difficulty): boolean {
  return d === 'infernal';
}

/** Todas as chaves de nota, de todos os murais. */
export const RATED_KEYS: readonly RatedKey[] = [
  'historia',
  'diversao',
  'jogabilidade',
  'visual',
  'envolvimento',
  'personagens',
  'escrita',
  'roteiro',
  'atuacao',
  'animacao',
];

/** As quatro notas do mural, na ordem do boletim. */
export function ratedKeys(kind: Kind): RatedKey[] {
  return profileOf(kind).categories.map((c) => c.key);
}

/** A Média e as quatro notas do mural. */
export function scoreKeys(kind: Kind): ScoreKey[] {
  return ['final', ...ratedKeys(kind)];
}

export const VERDICTS: readonly Verdict[] = ['masterpiece', 'recomendo', 'legalzinho', 'meh', 'chato'];

export const VERDICT_LABEL: Record<Verdict, string> = {
  masterpiece: 'Masterpiece',
  recomendo: 'Recomendo',
  legalzinho: 'Legalzinho',
  meh: 'Meh',
  chato: 'Chato',
};

/** O nome de cada nota; a mesma chave tem o mesmo nome em qualquer mural. */
export const SCORE_LABEL: Record<ScoreKey, string> = {
  final: 'Média',
  historia: 'História',
  diversao: 'Diversão',
  jogabilidade: 'Jogabilidade',
  visual: 'Visual',
  envolvimento: 'Envolvimento',
  personagens: 'Personagens',
  escrita: 'Escrita',
  roteiro: 'Roteiro',
  atuacao: 'Atuação',
  animacao: 'Animação',
};

/** Quando o nome inteiro não cabe na casinha do boletim (celular), fica a abreviação. */
export const SCORE_SHORT: Partial<Record<RatedKey, string>> = {
  jogabilidade: 'Jogab.',
  envolvimento: 'Envolv.',
  personagens: 'Person.',
};

export function weightOf(weights: Weights | undefined, k: RatedKey): Weight {
  return weights?.[k] ?? 'normal';
}

/** A categoria entra na média desta resenha? */
export function counts(weights: Weights | undefined, k: RatedKey): boolean {
  return weightOf(weights, k) !== 'nao-tem';
}

/**
 * Média ponderada das notas dadas, com uma casa decimal. A categoria do centro do mural (Diversão
 * num jogo, Envolvimento num livro; Roteiro e Envolvimento em filmes, séries e animes) tem peso-base
 * 2x; cada categoria ainda pode valer o dobro
 * (Relevante), metade (Pouco importante) ou sair da conta (Não tem).
 * Cada bônus mexe na média o que mais uma nota de peso 1 mexeria (10 se for a favor, 0 se for contra),
 * limitado a um quarto de ponto. Cada um é medido contra a média das notas, sozinho, e os efeitos se somam.
 * Null se nenhuma nota que conta foi dada (bônus sozinho não faz média).
 */
export function computeFinal(kind: Kind, scores: Rated, weights?: Weights, bonuses?: readonly Bonus[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const { key, base } of profileOf(kind).categories) {
    const v = scores[key] ?? null;
    const w = base * WEIGHT_FACTOR[weightOf(weights, key)];
    if (v === null || w === 0) continue;
    sum += v * w;
    weight += w;
  }
  if (!weight) return null;
  const avg = sum / weight;
  let shift = 0;
  for (const b of bonuses ?? []) {
    const alone = ((BONUS_SCORE[b.kind] - avg) * BONUS_WEIGHT) / (weight + BONUS_WEIGHT);
    shift += Math.min(BONUS_MAX_SHIFT, Math.max(-BONUS_MAX_SHIFT, alone));
  }
  return Math.round(Math.min(10, Math.max(0, avg + shift)) * 10) / 10;
}

/** A média só das notas, sem os bônus: para mostrar quanto eles mexeram. */
export function computeBase(review: Pick<Review, 'kind' | 'scores' | 'weights'>): number | null {
  return computeFinal(review.kind, review.scores, review.weights);
}

const amountFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 42 → "42 h"; 1.5 → "1,5 h"; 320 páginas → "320 pág.". Vazio nos murais sem quantidade. */
export function formatAmount(kind: Kind, v: number | null, long = false): string {
  const a = profileOf(kind).amount;
  if (v === null || !a) return '';
  const n = amountFmt.format(v);
  return long ? a.long(n) : a.short(n);
}

const scoreFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** A nota como aparece, pelo ajuste de exibição: 8.4 → 8,4 (Livre), 8,5 (Arredondado) ou 8 (Inteiros). */
export function shownScore(v: number): number {
  switch (scoreDisplay()) {
    case 'metade':
      return Math.round(v * 2) / 2;
    case 'inteiro':
      return Math.round(v);
    default:
      return Math.round(v * 10) / 10;
  }
}

/**
 * A nota final da ficha como aparece. É ela que decide grupo ("Na casa do 8"), filtro, ordem, empate
 * no ranking e quem ganhou no lado a lado: um 7,9 mostrado como 8 fica com os 8. As médias não.
 */
export function shownFinal(r: { scores: { final: number } }): number {
  return shownScore(r.scores.final);
}

/** 8.4 → "8,4"; 9 → "9" (arredondada pelo ajuste de exibição). */
export function formatScore(v: number | null | undefined): string {
  return v === null || v === undefined ? '–' : scoreFmt.format(shownScore(v));
}

/** A nota como foi dada, com uma casa, sem o ajuste de exibição: 8.4 → "8,4". Para os campos que a pessoa edita. */
export function formatRawScore(v: number): string {
  return scoreFmt.format(Math.round(v * 10) / 10);
}

/** Quanto os bônus mexeram na média: "+0,4", "−0,3" ou "±0". */
export function formatShift(v: number): string {
  // arredonda pelo tamanho, não pelo sinal: −0,25 é "−0,3", como +0,25 é "+0,3"
  const r = (Math.sign(v) * Math.round(Math.abs(v) * 10)) / 10;
  if (r === 0) return '±0';
  return `${r > 0 ? '+' : '−'}${scoreFmt.format(Math.abs(r))}`;
}

/**
 * A frase que vai escrita na ficha: a primeira da resenha, inteira. Se for curta demais, leva a
 * segunda junto; se passar de `max`, corta no último espaço antes do limite, nunca no meio da palavra.
 */
export function leadSentence(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  // a frase termina na pontuação seguida de espaço: "nota 8.5" não parte a frase no meio
  const sentences = flat.split(/(?<=[.!?…])\s+/);
  let lead = sentences[0];
  if (lead.length < 36 && sentences[1] && lead.length + sentences[1].length + 1 <= max) {
    lead = `${lead} ${sentences[1]}`;
  }
  if (lead.length <= max) return lead;
  const cut = lead.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut.slice(0, max)).replace(/[\s,;:–-]+$/, '')}…`;
}

/** Uma data no fuso local, 'AAAA-MM-DD'. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hoje no fuso local, 'AAAA-MM-DD'. */
export function todayISO(): string {
  return localDay(new Date());
}

/** 'AAAA-MM-DD' → Date à meia-noite local (sem o pulo de fuso de `new Date('AAAA-MM-DD')`). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = parseDay(v);
  // "2025-02-31" vira 3 de março no Date: só vale o dia que volta igual
  return !Number.isNaN(d.getTime()) && d.getFullYear() > 1970 && localDay(d) === v;
}

/** Ano lembrado sem inventar um dia de conclusão. Mantém a precisão nos backups. */
export function isYearOnly(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}$/.test(v) && Number(v) > 1970;
}

/** Mês e ano lembrados, sem o dia: 'AAAA-MM'. */
export function isYearMonth(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && Number(v.slice(0, 4)) > 1970;
}

/** Uma data de conclusão com a precisão que a pessoa lembra: dia, mês ou só o ano. */
export function isValidReviewDate(v: unknown): v is string {
  return isYearOnly(v) || isYearMonth(v) || isValidDay(v);
}

const reviewDateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const reviewDayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const reviewMonthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' });
const reviewMonthOnlyFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const longDayFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const longMonthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** "15 mar 2024", "mar 2024" ou "2024"; com `dayOnly` (o mês já está na seção), "15 mar" ou "mar". */
export function formatReviewDate(date: string | null, dayOnly = false): string {
  if (date === null) return 'Sem data';
  if (isYearOnly(date)) return date;
  if (isYearMonth(date)) return (dayOnly ? reviewMonthOnlyFmt : reviewMonthFmt).format(parseDay(date + '-01')).replace(/\./g, '');
  return (dayOnly ? reviewDayFmt : reviewDateFmt).format(parseDay(date)).replace(/\./g, '');
}

/** Por extenso, para a leitura: "15 de março de 2024", "março de 2024" ou "2024". */
export function formatReviewDateLong(date: string | null): string {
  if (date === null) return '';
  if (isYearOnly(date)) return date;
  if (isYearMonth(date)) return longMonthFmt.format(parseDay(date + '-01'));
  return longDayFmt.format(parseDay(date));
}

/** A primeira letra do nome, maiúscula, para o "sem capa": um grafema inteiro (emoji e acento juntos). */
export function initialOf(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const Seg = (Intl as any).Segmenter;
  const first: string = Seg ? new Seg('pt-BR', { granularity: 'grapheme' }).segment(t)[Symbol.iterator]().next().value.segment : [...t][0];
  return first.toUpperCase();
}

/** O que aparece no lugar da data quando ela não foi definida. */
export const NO_DAY_LABEL = 'Data não definida';

/** Rótulo da data conforme o status: quem não terminou só "jogou até" (ou "leu até") aquele dia. */
export function dayLabel(kind: Kind, status: Status): string {
  const day = profileOf(kind).day;
  return status === 'incompleto' ? day.incompleto : day.feito;
}

export function newId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `r${Date.now().toString(36)}${rand}`;
}

function clampScore(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, n));
}

function str(v: unknown, max = 20000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function isoOr(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = Date.parse(v);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

const SOURCES: readonly GameSource[] = ['wikipedia', 'rawg', 'openlibrary', 'kitsu', 'anilist', 'tmdb', 'manual'];

function sanitizeGame(raw: unknown): PickedGame | null {
  const g = (raw ?? {}) as Record<string, any>;
  const name = str(g['name'], 200).trim();
  if (!name) return null;
  const cover = str(g['coverUrl'], 2000);
  const source: GameSource = SOURCES.includes(g['source']) ? g['source'] : 'manual';
  return {
    name,
    coverUrl: /^https:\/\//.test(cover) ? cover : null,
    source,
    sourceId: str(g['sourceId'], 100) || undefined,
    year: str(g['year'], 10) || undefined,
    by: str(g['by'], 120).trim() || undefined,
  };
}

function sanitizeKind(v: unknown): Kind {
  return isKind(v) ? v : 'jogos';
}

/** Aceita a lista de bônus de um backup: da cartela do mural vale o nome da cartela; os escritos, o nome guardado. */
export function sanitizeBonuses(raw: unknown, kind: Kind): Bonus[] {
  if (!Array.isArray(raw)) return [];
  const catalog = CATALOG_BY_ID[kind];
  const out = new Map<string, Bonus>();
  for (const item of raw.slice(0, 60)) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    const known = typeof b['id'] === 'string' ? catalog.get(b['id']) : undefined;
    if (known) {
      out.set(known.id, { ...known });
      continue;
    }
    const label = cleanBonusLabel(str(b['label'], 200));
    const side = b['kind'];
    if (!label || (side !== 'favor' && side !== 'contra')) continue;
    const id = customBonusId(label, side);
    if (!out.has(id)) out.set(id, { id, label, kind: side });
  }
  return [...out.values()];
}

/** A nota final na mão: de 0 a 11, com uma casa; a média automática continua até 10. */
export function sanitizeOverride(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return Math.round(Math.min(11, Math.max(0, raw)) * 10) / 10;
}

/**
 * A mancha e o sorteio dela. As fichas (e backups) de antes guardavam a mancha no lugar do estrago:
 * ela muda de campo com o mesmo sorteio, e sai igualzinha.
 */
function stainFields(r: Record<string, any>): Pick<Review, 'stain' | 'stainSeed'> {
  const own = sanitizeStain(r['stain']);
  const legacy = own ? undefined : sanitizeStain(r['damage']);
  const stain = own ?? legacy;
  return {
    ...optional('stain', stain),
    ...optional('stainSeed', stain ? sanitizeSeed(own ? r['stainSeed'] : r['damageSeed']) : undefined),
  };
}

/** Um campo que só vai para a resenha quando tem valor: as antigas continuam iguais, sem chave vazia. */
function optional<K extends string, V>(key: K, v: V | undefined): Partial<Record<K, V>> {
  return v === undefined ? {} : ({ [key]: v } as Record<K, V>);
}

function sanitizeId(v: unknown): string {
  return typeof v === 'string' && /^[\w-]{4,64}$/.test(v) ? v : newId();
}

/** Aceita um pendente vindo do localStorage ou de um backup (ou null se não serve). */
export function sanitizeDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const game = sanitizeGame(r['game']);
  if (!game) return null;
  const createdAt = isoOr(r['createdAt'], new Date().toISOString());
  return {
    id: sanitizeId(r['id']),
    kind: sanitizeKind(r['kind']),
    game,
    createdAt,
    updatedAt: isoOr(r['updatedAt'], createdAt),
  };
}

/** Aceita um desejo vindo do localStorage ou de um backup (ou null se não serve). */
export function sanitizeWish(raw: unknown): Wish | null {
  const wish: Wish | null = sanitizeDraft(raw);
  if (!wish) return null;
  const rel = (raw as Record<string, unknown>)['relevance'];
  // Comum é o padrão: não precisa ir para o armazenamento
  return rel === 'must' || rel === 'later' ? { ...wish, relevance: rel } : wish;
}

/** Aceita dados vindos do localStorage ou de um backup e devolve uma resenha válida (ou null). */
export function sanitizeReview(raw: unknown): Review | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const game = sanitizeGame(r['game']);
  if (!game) return null;
  const kind = sanitizeKind(r['kind']);
  const profile = profileOf(kind);
  const s = (r['scores'] ?? {}) as Record<string, any>;
  const rawWeights = (r['weights'] ?? {}) as Record<string, unknown>;
  const rated: Rated = {};
  const weights: Weights = {};
  for (const { key } of profile.categories) {
    // resenhas antigas de jogos chamavam Visual de "grafico"
    rated[key] = clampScore(key === 'visual' && kind === 'jogos' ? (s['visual'] ?? s['grafico']) : s[key]);
    const w = rawWeights[key];
    if (typeof w === 'string' && (WEIGHTS as readonly string[]).includes(w) && w !== 'normal') weights[key] = w as Weight;
    if (weights[key] === 'nao-tem') rated[key] = null;
  }
  const bonuses = sanitizeBonuses(r['bonuses'], kind);
  // A média vem das notas e dos bônus; resenhas antigas que só tinham a nota final mantêm a delas.
  const legacyFinal = Number(s['final']);
  const override = sanitizeOverride(r['finalOverride']);
  const final =
    override ??
    computeFinal(kind, rated, weights, bonuses) ??
    (Number.isFinite(legacyFinal) ? Math.round(Math.min(10, Math.max(0, legacyFinal)) * 10) / 10 : null);
  if (final === null) return null;
  const status: Status = STATUSES.includes(r['status']) ? r['status'] : 'finalizado';
  const difficulty: Difficulty = profile.difficulty && DIFFICULTIES.includes(r['difficulty']) ? r['difficulty'] : 'nenhuma';
  const amount = Number(r['hoursPlayed']);
  const hasAmount =
    !!profile.amount && r['hoursPlayed'] !== null && r['hoursPlayed'] !== undefined && r['hoursPlayed'] !== '' && Number.isFinite(amount) && amount >= 0;
  const now = new Date().toISOString();
  const createdAt = isoOr(r['createdAt'], now);
  return {
    id: sanitizeId(r['id']),
    kind,
    game,
    scores: { final, ...rated },
    ...optional('finalOverride', override),
    status,
    difficulty,
    verdict: VERDICTS.includes(r['verdict']) ? r['verdict'] : null,
    weights,
    bonuses,
    hoursPlayed: hasAmount
      ? profile.amount!.decimals
        ? Math.round(Math.min(amount, 99999) * 10) / 10
        : Math.round(Math.min(amount, 99999))
      : null,
    stock: STOCKS.includes(r['stock']) ? r['stock'] : undefined,
    ...optional('paper', sanitizePaper(r['paper'])),
    ...optional('pattern', sanitizePattern(r['pattern'])),
    ...optional('patternSpacing', sanitizePattern(r['pattern']) ? sanitizeLookStep(r['patternSpacing'], 'spacing') : undefined),
    ...optional('patternSize', sanitizePattern(r['pattern']) ? sanitizeLookStep(r['patternSize'], 'size') : undefined),
    ...optional('patternJitter', sanitizePattern(r['pattern']) ? sanitizeLookStep(r['patternJitter'], 'jitter') : undefined),
    ...optional('patternSeed', sanitizePattern(r['pattern']) ? sanitizeSeed(r['patternSeed']) : undefined),
    ...optional('scribble', sanitizeScribble(r['scribble'])),
    ...optional('scribbleSeed', sanitizeScribble(r['scribble']) ? sanitizeSeed(r['scribbleSeed']) : undefined),
    ...optional('scribbleInk', sanitizeScribble(r['scribble']) ? sanitizeScribbleInk(r['scribbleInk']) : undefined),
    ...optional('damage', sanitizeDamage(r['damage'])),
    ...optional('damageSeed', sanitizeDamage(r['damage']) ? sanitizeSeed(r['damageSeed']) : undefined),
    ...stainFields(r),
    ...optional('decor', sanitizeDecor(r['decor'])),
    ...optional('decorSeed', sanitizeDecor(r['decor']) ? sanitizeSeed(r['decorSeed']) : undefined),
    text: str(r['text']),
    completedAt:
      r['completedAt'] === null
        ? null
        : isValidReviewDate(r['completedAt'])
          ? // nunca no futuro (um backup de um fuso adiantado pode trazer o dia de amanhã)
            r['completedAt'] > todayISO()
            ? todayISO().slice(0, r['completedAt'].length)
            : r['completedAt']
          : localDay(new Date(createdAt)),
    createdAt,
    updatedAt: isoOr(r['updatedAt'], createdAt),
  };
}

/** Normaliza texto para busca: sem acento, minúsculo. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
