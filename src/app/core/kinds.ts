import type { Bonus, RatedKey, Status } from './review';

/**
 * Os murais. Cada um é uma parede à parte: as fichas, o Pra depois, o ranking, o lado a lado e os
 * bônus escritos de um mural nunca aparecem no outro. O valor guardado ('jogos') não muda nunca.
 */
export type Kind = 'jogos' | 'livros' | 'filmes' | 'series' | 'animes';

export const KINDS: readonly Kind[] = ['jogos', 'livros', 'filmes', 'series', 'animes'];

/**
 * Uma das quatro notas do mural, e quanto ela pesa na média: a do centro da experiência pesa 2
 * (Diversão, Envolvimento); em filmes, séries e animes o Roteiro também.
 */
export interface Category {
  key: RatedKey;
  base: number;
}

/** A quantidade que a pessoa anota (horas jogadas, páginas lidas). */
export interface Amount {
  /** Rótulo do campo no editor. */
  label: string;
  /** Escrito ao lado do campo. */
  unit: string;
  /** "42 h", "320 pág." */
  short: (v: string) => string;
  /** Na leitura: "42 h jogadas", "320 páginas". */
  long: (v: string) => string;
  /** Aceita fração (1,5 h)? Páginas não. */
  decimals: boolean;
  example: string;
  /** No "Falta escolher…" do editor. */
  missing: string;
  /** No balanço do ranking. */
  total: string;
  most: string;
  /** Linha do Nota a nota. */
  row: string;
}

export interface KindProfile {
  kind: Kind;
  /** Como aparece no cartaz: "Meu mural de *jogos*". */
  plural: string;
  singular: string;
  /** Série é feminino: "nenhuma série", "a série". */
  fem: boolean;
  /** As quatro notas, sempre quatro: o boletim, a ficha simples e o Nota a nota foram feitos para quatro. */
  categories: readonly Category[];
  /** Os três status: não terminei, terminei, fui além. O valor guardado é o mesmo em todo mural. */
  status: Record<Status, string>;
  /** As seções do mural ordenado por status. */
  statusGroup: Record<Status, string>;
  /** "Jogado até" / "Concluído em". */
  day: { incompleto: string; feito: string };
  amount: Amount | null;
  /** Mural com a escala de caveiras; o rótulo no editor. */
  difficulty: string | null;
  /** "Lançado em 2019". */
  released: string;
  /** Na busca, o exemplo do que digitar. */
  placeholder: string;
  /** Mural vazio: "Pregue a resenha do último jogo que você jogou." */
  lastOne: string;
  /** Pra depois vazio: "Zerou algo e ainda não sabe o que achar?" */
  finished: string;
  /** O fim do exemplo do texto da resenha: "…se jogaria de novo". */
  again: string;
  /** Wishlist: "o que você quer *jogar*". */
  verb: string;
  bonuses: readonly Bonus[];
}

const f = (id: string, label: string): Bonus => ({ id, label, kind: 'favor' });
const c = (id: string, label: string): Bonus => ({ id, label, kind: 'contra' });

const HOURS: Amount = {
  label: 'Tempo jogado',
  unit: 'horas',
  short: (v) => `${v} h`,
  long: (v) => `${v} h jogadas`,
  decimals: true,
  example: 'como 12 ou 12,5',
  missing: 'um tempo jogado em horas',
  total: 'Horas jogadas',
  most: 'Mais jogado',
  row: 'Horas',
};

const PAGES: Amount = {
  label: 'Páginas',
  unit: 'páginas',
  short: (v) => `${v} pág.`,
  long: (v) => `${v} páginas`,
  decimals: false,
  example: 'como 320',
  missing: 'um número de páginas',
  total: 'Páginas lidas',
  most: 'Mais longo',
  row: 'Páginas',
};

const REVI: Pick<KindProfile, 'status' | 'statusGroup'> = {
  status: { incompleto: 'Parei', finalizado: 'Terminei', platinado: 'Revi' },
  statusGroup: { incompleto: 'Parados', finalizado: 'Terminados', platinado: 'Revistos' },
};

export const KIND_PROFILES: Record<Kind, KindProfile> = {
  jogos: {
    kind: 'jogos',
    plural: 'jogos',
    singular: 'jogo',
    fem: false,
    categories: [
      { key: 'historia', base: 1 },
      { key: 'diversao', base: 2 },
      { key: 'jogabilidade', base: 1 },
      { key: 'visual', base: 1 },
    ],
    status: { incompleto: 'Incompleto', finalizado: 'Finalizado', platinado: 'Platinado' },
    statusGroup: { incompleto: 'Incompletos', finalizado: 'Finalizados', platinado: 'Platinados' },
    day: { incompleto: 'Jogado até', feito: 'Concluído em' },
    amount: HOURS,
    difficulty: 'Dificuldade',
    released: 'Lançado em',
    placeholder: 'Comece a digitar: Hollow Knight, Zelda…',
    lastOne: 'do último jogo que você jogou',
    finished: 'Zerou algo e ainda não sabe o que achar?',
    again: 'se jogaria de novo',
    verb: 'jogar',
    bonuses: [
      f('trilha-sonora', 'Trilha sonora incrível'),
      f('personagens', 'Personagens marcantes'),
      f('final-memoravel', 'Final memorável'),
      f('reviravolta', 'Reviravolta genial'),
      f('mundo', 'Inovador'),
      f('rejogar', 'Dá vontade de rejogar'),
      f('multiplayer', 'Multiplayer divertido'),
      f('rir', 'Me fez rir'),
      f('emocionou', 'Me emocionou'),
      f('centavo', 'Único'),
      f('genial', 'Genial'),
      f('detalhista', 'Detalhista'),
      f('melhor-do-genero', 'Melhor do gênero'),
      f('combate-fluido', 'Combate fluido'),
      f('me-marcou', 'Me marcou'),
      f('pausar-pintura', 'Se pausar vira pintura'),
      c('bugs', 'Muitos bugs'),
      c('mal-otimizado', 'Mal otimizado'),
      c('loadings', 'Loadings longos'),
      c('grind', 'Grind excessivo'),
      c('microtransacoes', 'Microtransações'),
      c('final-decepcionante', 'Final decepcionante'),
      c('arrastado', 'Arrastado'),
      c('muito-curto', 'Muito curto'),
      c('camera', 'Câmera ruim'),
      c('desbalanceado', 'Desbalanceado'),
      c('caro', 'Caro pelo que entrega'),
      c('repetitivo', 'Repetitivo'),
      c('estressante', 'Estressante'),
    ],
  },
  livros: {
    kind: 'livros',
    plural: 'livros',
    singular: 'livro',
    fem: false,
    categories: [
      { key: 'historia', base: 1 },
      { key: 'envolvimento', base: 2 },
      { key: 'personagens', base: 1 },
      { key: 'escrita', base: 1 },
    ],
    status: { incompleto: 'Larguei', finalizado: 'Lido', platinado: 'Relido' },
    statusGroup: { incompleto: 'Largados', finalizado: 'Lidos', platinado: 'Relidos' },
    day: { incompleto: 'Lido até', feito: 'Lido em' },
    amount: PAGES,
    difficulty: 'Dificuldade de leitura',
    released: 'Publicado em',
    placeholder: 'Comece a digitar: Dom Casmurro, Duna…',
    lastOne: 'do último livro que você leu',
    finished: 'Terminou um livro e ainda não sabe o que achar?',
    again: 'se leria de novo',
    verb: 'ler',
    bonuses: [
      f('personagens', 'Personagens marcantes'),
      f('final-memoravel', 'Final memorável'),
      f('nao-larguei', 'Não consegui largar'),
      f('escrita-bonita', 'Escrita bonita'),
      f('reviravolta', 'Reviravolta genial'),
      f('mundo-rico', 'Mundo rico'),
      f('me-fez-pensar', 'Me fez pensar'),
      f('rir', 'Me fez rir'),
      f('emocionou', 'Me emocionou'),
      f('reler', 'Dá vontade de reler'),
      f('centavo', 'Único'),
      c('arrastado', 'Arrastado'),
      c('final-decepcionante', 'Final decepcionante'),
      c('previsivel', 'Previsível'),
      c('personagens-rasos', 'Personagens rasos'),
      c('traducao-ruim', 'Tradução ruim'),
      c('longo-demais', 'Longo demais'),
      c('confuso', 'Confuso'),
      c('cliche', 'Clichê'),
    ],
  },
  filmes: {
    kind: 'filmes',
    plural: 'filmes',
    singular: 'filme',
    fem: false,
    categories: [
      { key: 'roteiro', base: 2 },
      { key: 'envolvimento', base: 2 },
      { key: 'atuacao', base: 1 },
      { key: 'visual', base: 1 },
    ],
    status: { incompleto: 'Não terminei', finalizado: 'Assistido', platinado: 'Revisto' },
    statusGroup: { incompleto: 'Não terminados', finalizado: 'Assistidos', platinado: 'Revistos' },
    day: { incompleto: 'Visto até', feito: 'Assistido em' },
    amount: null,
    difficulty: null,
    released: 'Lançado em',
    placeholder: 'Comece a digitar: Cidade de Deus, Duna…',
    lastOne: 'do último filme que você viu',
    finished: 'Viu um filme e ainda não sabe o que achar?',
    again: 'se veria de novo',
    verb: 'ver',
    bonuses: [
      f('trilha-sonora', 'Trilha sonora incrível'),
      f('fotografia', 'Fotografia linda'),
      f('atuacao-marcante', 'Atuação marcante'),
      f('final-memoravel', 'Final memorável'),
      f('reviravolta', 'Reviravolta genial'),
      f('efeitos', 'Efeitos incríveis'),
      f('me-fez-pensar', 'Me fez pensar'),
      f('rir', 'Me fez rir'),
      f('emocionou', 'Me emocionou'),
      f('rever', 'Dá vontade de rever'),
      f('centavo', 'Único'),
      c('arrastado', 'Arrastado'),
      c('final-decepcionante', 'Final decepcionante'),
      c('previsivel', 'Previsível'),
      c('longo-demais', 'Longo demais'),
      c('furos', 'Furos no roteiro'),
      c('efeitos-ruins', 'Efeitos ruins'),
      c('atuacao-fraca', 'Atuação fraca'),
      c('confuso', 'Confuso'),
      c('cliche', 'Clichê'),
    ],
  },
  series: {
    kind: 'series',
    plural: 'séries',
    singular: 'série',
    fem: true,
    categories: [
      { key: 'roteiro', base: 2 },
      { key: 'envolvimento', base: 2 },
      { key: 'personagens', base: 1 },
      { key: 'visual', base: 1 },
    ],
    ...REVI,
    statusGroup: { incompleto: 'Paradas', finalizado: 'Terminadas', platinado: 'Revistas' },
    day: { incompleto: 'Vista até', feito: 'Terminada em' },
    amount: null,
    difficulty: null,
    released: 'Estreou em',
    placeholder: 'Comece a digitar: Breaking Bad, Dark…',
    lastOne: 'da última série que você terminou',
    finished: 'Terminou uma série e ainda não sabe o que achar?',
    again: 'se veria de novo',
    verb: 'ver',
    bonuses: [
      f('trilha-sonora', 'Trilha sonora incrível'),
      f('personagens', 'Personagens marcantes'),
      f('final-memoravel', 'Final memorável'),
      f('maratonei', 'Maratonei'),
      f('abertura', 'Abertura incrível'),
      f('reviravolta', 'Reviravolta genial'),
      f('rir', 'Me fez rir'),
      f('emocionou', 'Me emocionou'),
      f('rever', 'Dá vontade de rever'),
      f('centavo', 'Única'),
      c('enrolacao', 'Muita enrolação'),
      c('caiu', 'Caiu de qualidade'),
      c('final-decepcionante', 'Final decepcionante'),
      c('sem-final', 'Cancelada sem final'),
      c('previsivel', 'Previsível'),
      c('personagens-irritantes', 'Personagens irritantes'),
      c('temporadas-demais', 'Temporadas demais'),
      c('cliche', 'Clichê'),
    ],
  },
  animes: {
    kind: 'animes',
    plural: 'animes',
    singular: 'anime',
    fem: false,
    categories: [
      { key: 'roteiro', base: 2 },
      { key: 'envolvimento', base: 2 },
      { key: 'personagens', base: 1 },
      { key: 'animacao', base: 1 },
    ],
    ...REVI,
    day: { incompleto: 'Visto até', feito: 'Terminado em' },
    amount: null,
    difficulty: null,
    released: 'Estreou em',
    placeholder: 'Comece a digitar: Frieren, Cowboy Bebop…',
    lastOne: 'do último anime que você terminou',
    finished: 'Terminou um anime e ainda não sabe o que achar?',
    again: 'se veria de novo',
    verb: 'ver',
    bonuses: [
      f('abertura', 'Abertura incrível'),
      f('trilha-sonora', 'Trilha sonora incrível'),
      f('animacao-linda', 'Animação incrível'),
      f('lutas', 'Lutas épicas'),
      f('personagens', 'Personagens marcantes'),
      f('final-memoravel', 'Final memorável'),
      f('reviravolta', 'Reviravolta genial'),
      f('emocionou', 'Me emocionou'),
      f('rir', 'Me fez rir'),
      f('maratonei', 'Maratonei'),
      f('centavo', 'Único'),
      c('filler', 'Muito filler'),
      c('arrastado', 'Arrastado'),
      c('animacao-ruim', 'Animação ruim'),
      c('final-decepcionante', 'Final decepcionante'),
      c('fanservice', 'Fanservice demais'),
      c('sem-final', 'Terminou sem final'),
      c('caiu', 'Caiu de qualidade'),
      c('cliche', 'Clichê'),
    ],
  },
};

export function profileOf(kind: Kind): KindProfile {
  return KIND_PROFILES[kind];
}

export function isKind(v: unknown): v is Kind {
  return typeof v === 'string' && (KINDS as readonly string[]).includes(v);
}

/** Escolhe a palavra pelo gênero do mural: g(p, 'nenhum', 'nenhuma'). */
export function g(p: KindProfile, masc: string, fem: string): string {
  return p.fem ? fem : masc;
}

/** "1 jogo", "3 séries". */
export function countOf(p: KindProfile, n: number): string {
  return `${n} ${n === 1 ? p.singular : p.plural}`;
}

/** Primeira letra maiúscula: "Séries", "Livro". */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
