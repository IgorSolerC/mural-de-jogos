import type { Bonus, RatedKey, Status } from './review';
import { plural } from './text';

/**
 * Os murais. Cada um é uma parede à parte: as fichas, o Pra depois, o ranking, o lado a lado e os
 * bônus escritos de um mural nunca aparecem no outro. O valor guardado ('jogos') não muda nunca.
 */
export type Kind = 'jogos' | 'livros' | 'filmes' | 'series' | 'animes' | 'musicas' | 'anotacoes';

export const KINDS: readonly Kind[] = ['jogos', 'livros', 'filmes', 'series', 'animes', 'musicas', 'anotacoes'];

/**
 * O mural de anotações não é de resenhas: sem notas, veredito, status, dificuldade nem rejogadas; os
 * adesivos são categorias. Guarda as fichas à parte (ver `ReviewStore`, `notas` no backup), para um
 * site antigo, que não conhece anotações, nunca jogar nenhuma fora.
 */
export const NOTES: Kind = 'anotacoes';

export function isNotes(kind: Kind): boolean {
  return kind === NOTES;
}

/**
 * O mural de músicas é de resenhas (notas, veredito, status, bônus, ranking), mas cada ficha é de um
 * álbum ou de uma música só, tem um artista (a categoria dela, que vira aba no mural, como nas
 * anotações) e, no lugar da capa, o vinil que toca uma amostra. Também guarda as fichas à parte
 * (`musicas` no backup): um site antigo, que não conhece o mural, as leria como jogos.
 */
export const MUSIC: Kind = 'musicas';

export function isMusic(kind: Kind): boolean {
  return kind === MUSIC;
}

/** Os murais com abas em cima da pasta: uma por categoria nas anotações, uma por artista nas músicas. */
export function hasTabs(kind: Kind): boolean {
  return isNotes(kind) || isMusic(kind);
}

/** Os murais de resenhas, com nota: os que entram em comparações, rankings, jogos e estatísticas. */
export const SCORED_KINDS: readonly Kind[] = KINDS.filter((k) => !isNotes(k));

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
  /** A pergunta da busca, quando "Qual <singular>?" não serve (nas músicas a ficha pode ser de um álbum). */
  ask?: string;
  /** Mural vazio: "Pregue a resenha do último jogo que você jogou." */
  lastOne: string;
  /** Pra depois vazio: "Zerou algo e ainda não sabe o que achar?" */
  finished: string;
  /** O fim do exemplo do texto da resenha: "…se jogaria de novo". */
  again: string;
  /** Wishlist: "o que você quer *jogar*". */
  verb: string;
  /**
   * A mesma obra outra vez, numa ficha à parte: "rejogada", "releitura", "reassistida". Sempre no
   * feminino, em minúsculas (ver `cap`).
   */
  revisit: { one: string; many: string };
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
    revisit: { one: 'rejogada', many: 'rejogadas' },
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
      f('me-fez-pensar', 'Me fez pensar'),
      f('centavo', 'Único'),
      f('genial', 'Genial'),
      f('detalhista', 'Detalhista'),
      f('melhor-do-genero', 'Melhor do gênero'),
      f('combate-fluido', 'Combate fluido'),
      f('me-marcou', 'Me marcou'),
      f('pausar-pintura', 'Se pausar vira pintura'),
      f('worldbuilding', 'Worldbuilding marcante'),
      f('classico', 'Clássico'),
      f('acessibilidade', 'Boa acessibilidade'),
      c('bugs', 'Muitos bugs'),
      c('mal-otimizado', 'Mal otimizado'),
      c('loadings', 'Loadings longos'),
      c('grind', 'Grind excessivo'),
      c('microtransacoes', 'Microtransações'),
      c('final-decepcionante', 'Final decepcionante'),
      c('caiu', 'Decaiu de qualidade'),
      c('arrastado', 'Arrastado'),
      c('muito-curto', 'Muito curto'),
      c('camera', 'Câmera ruim'),
      c('desbalanceado', 'Desbalanceado'),
      c('caro', 'Caro pelo que entrega'),
      c('repetitivo', 'Repetitivo'),
      c('estressante', 'Estressante'),
      c('simplista', 'Simplista'),
      c('historia-cliche', 'História clichê'),
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
    revisit: { one: 'releitura', many: 'releituras' },
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
      // os mesmos dos jogos, quando cabem num livro (o mesmo id quer dizer a mesma coisa)
      f('mundo', 'Inovador'),
      f('genial', 'Genial'),
      f('detalhista', 'Detalhista'),
      f('melhor-do-genero', 'Melhor do gênero'),
      f('me-marcou', 'Me marcou'),
      f('classico', 'Clássico'),
      f('leitura-fluida', 'Leitura fluida'),
      f('frases', 'Frases pra sublinhar'),
      f('bom-de-conversar', 'Bom pra discutir'),
      c('arrastado', 'Arrastado'),
      c('final-decepcionante', 'Final decepcionante'),
      c('caiu', 'Decaiu de qualidade'),
      c('previsivel', 'Previsível'),
      c('personagens-rasos', 'Personagens rasos'),
      c('traducao-ruim', 'Tradução ruim'),
      c('longo-demais', 'Longo demais'),
      c('confuso', 'Confuso'),
      c('cliche', 'Clichê'),
      c('revisao', 'Erros de revisão'),
      c('enchecao', 'Encheção de linguiça'),
      c('caca-niquel', 'Caça-níquel'),
      c('muito-curto', 'Muito curto'),
      c('ritmo-irregular', 'Ritmo irregular'),
      c('caro', 'Caro pelo que entrega'),
      c('repetitivo', 'Repetitivo'),
      c('estressante', 'Estressante'),
      c('simplista', 'Simplista'),
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
    revisit: { one: 'reassistida', many: 'reassistidas' },
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
      f('personagens', 'Personagens marcantes'),
      f('mundo', 'Inovador'),
      f('genial', 'Genial'),
      f('detalhista', 'Detalhista'),
      f('melhor-do-genero', 'Melhor do gênero'),
      f('me-marcou', 'Me marcou'),
      f('classico', 'Clássico'),
      f('worldbuilding', 'Worldbuilding marcante'),
      f('cenas-de-acao', 'Cenas de ação incríveis'),
      f('com-amigos', 'Bom pra ver com amigos'),
      c('arrastado', 'Arrastado'),
      c('final-decepcionante', 'Final decepcionante'),
      c('caiu', 'Decaiu de qualidade'),
      c('previsivel', 'Previsível'),
      c('longo-demais', 'Longo demais'),
      c('furos', 'Furos no roteiro'),
      c('efeitos-ruins', 'Efeitos ruins'),
      c('atuacao-fraca', 'Atuação fraca'),
      c('confuso', 'Confuso'),
      c('cliche', 'Clichê'),
      c('continuidade', 'Erros de continuidade'),
      c('montagem', 'Montagem confusa'),
      c('caca-niquel', 'Caça-níquel'),
      c('muito-curto', 'Muito curto'),
      c('camera', 'Câmera tremida'),
      c('ritmo-irregular', 'Ritmo irregular'),
      c('caro', 'Caro pelo que entrega'),
      c('repetitivo', 'Repetitivo'),
      c('estressante', 'Estressante'),
      c('simplista', 'Simplista'),
      c('personagens-rasos', 'Personagens rasos'),
      c('dublagem', 'Dublagem ruim'),
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
    revisit: { one: 'reassistida', many: 'reassistidas' },
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
      f('me-fez-pensar', 'Me fez pensar'),
      f('rever', 'Dá vontade de rever'),
      f('centavo', 'Única'),
      // série é feminino: Inovadora, Clássica
      f('mundo', 'Inovadora'),
      f('genial', 'Genial'),
      f('detalhista', 'Detalhista'),
      f('melhor-do-genero', 'Melhor do gênero'),
      f('me-marcou', 'Me marcou'),
      f('classico', 'Clássica'),
      f('worldbuilding', 'Worldbuilding marcante'),
      f('fotografia', 'Fotografia linda'),
      f('atuacao-marcante', 'Atuação marcante'),
      f('efeitos', 'Efeitos incríveis'),
      f('cenas-de-acao', 'Cenas de ação incríveis'),
      f('com-amigos', 'Bom pra ver com amigos'),
      c('enrolacao', 'Muita enrolação'),
      c('caiu', 'Decaiu de qualidade'),
      c('final-decepcionante', 'Final decepcionante'),
      c('sem-final', 'Cancelada sem final'),
      c('previsivel', 'Previsível'),
      c('personagens-irritantes', 'Personagens irritantes'),
      c('temporadas-demais', 'Temporadas demais'),
      c('cliche', 'Clichê'),
      c('arrastado', 'Arrastada'),
      c('furos', 'Furos no roteiro'),
      c('continuidade', 'Erros de continuidade'),
      c('caca-niquel', 'Caça-níquel'),
      c('muito-curto', 'Muito curta'),
      c('ritmo-irregular', 'Ritmo irregular'),
      c('repetitivo', 'Repetitiva'),
      c('estressante', 'Estressante'),
      c('simplista', 'Simplista'),
      c('confuso', 'Confusa'),
      c('personagens-rasos', 'Personagens rasos'),
      c('atuacao-fraca', 'Atuação fraca'),
      c('efeitos-ruins', 'Efeitos ruins'),
      c('dublagem', 'Dublagem ruim'),
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
    revisit: { one: 'reassistida', many: 'reassistidas' },
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
      f('me-fez-pensar', 'Me fez pensar'),
      f('rir', 'Me fez rir'),
      f('maratonei', 'Maratonei'),
      f('centavo', 'Único'),
      f('mundo', 'Inovador'),
      f('genial', 'Genial'),
      f('detalhista', 'Detalhista'),
      f('melhor-do-genero', 'Melhor do gênero'),
      f('me-marcou', 'Me marcou'),
      f('classico', 'Clássico'),
      f('worldbuilding', 'Worldbuilding marcante'),
      f('pausar-pintura', 'Se pausar vira pintura'),
      f('rever', 'Dá vontade de rever'),
      f('com-amigos', 'Bom pra ver com amigos'),
      c('filler', 'Muito filler'),
      c('arrastado', 'Arrastado'),
      c('animacao-ruim', 'Animação ruim'),
      c('final-decepcionante', 'Final decepcionante'),
      c('fanservice', 'Fanservice demais'),
      c('sem-final', 'Terminou sem final'),
      c('caiu', 'Decaiu de qualidade'),
      c('cliche', 'Clichê'),
      c('previsivel', 'Previsível'),
      c('personagens-rasos', 'Personagens rasos'),
      c('furos', 'Furos no roteiro'),
      c('confuso', 'Confuso'),
      c('efeitos-ruins', 'CGI feio'),
      c('propaganda', 'Propaganda do mangá'),
      c('muito-curto', 'Muito curto'),
      c('longo-demais', 'Longo demais'),
      c('ritmo-irregular', 'Ritmo irregular'),
      c('repetitivo', 'Repetitivo'),
      c('estressante', 'Estressante'),
      c('simplista', 'Simplista'),
      c('dublagem', 'Dublagem ruim'),
    ],
  },
  musicas: {
    kind: 'musicas',
    plural: 'músicas',
    singular: 'música',
    fem: true,
    // o quanto a música pega pesa em dobro; a Letra e o Vocal saem da conta numa faixa instrumental ("Não tem")
    categories: [
      { key: 'envolvimento', base: 2 },
      { key: 'letra', base: 1 },
      { key: 'vocal', base: 1 },
      { key: 'instrumental', base: 1 },
    ],
    status: { incompleto: 'Pulei', finalizado: 'Ouvi', platinado: 'No repeat' },
    statusGroup: { incompleto: 'Puladas', finalizado: 'Ouvidas', platinado: 'No repeat' },
    day: { incompleto: 'Ouvi até', feito: 'Ouvi em' },
    amount: null,
    difficulty: null,
    released: 'Lançamento em',
    placeholder: 'Comece a digitar: Clube da Esquina, Karma Police, Rita Lee…',
    ask: 'Qual álbum ou música?',
    lastOne: 'do último disco que você ouviu',
    finished: 'Ouviu um disco e ainda não sabe o que achar?',
    again: 'se ouviria de novo',
    revisit: { one: 'reescuta', many: 'reescutas' },
    verb: 'ouvir',
    // a ficha é de um álbum (masculino) ou de uma música (feminino): os nomes não têm gênero
    bonuses: [
      f('nao-sai-da-cabeca', 'Não sai da cabeça'),
      f('arrepia', 'Arrepia'),
      f('refrao', 'Refrão viciante'),
      f('letra-marcante', 'Letra marcante'),
      f('vocal-impecavel', 'Vocal impecável'),
      f('solo', 'Solo de arrepiar'),
      f('producao', 'Produção impecável'),
      f('cantar-junto', 'Pra cantar junto'),
      f('danca', 'Dá vontade de dançar'),
      f('sem-pular', 'Nenhuma faixa pra pular'),
      f('ao-vivo', 'Melhor ainda ao vivo'),
      f('boa-pra-estrada', 'Boa pra estrada'),
      f('feat', 'Feat certeiro'),
      f('capa-linda', 'Capa linda'),
      f('nostalgia', 'Nostalgia pura'),
      f('trilha-da-vida', 'Trilha da minha vida'),
      f('emocionou', 'Me emocionou'),
      f('me-fez-pensar', 'Me fez pensar'),
      f('me-marcou', 'Me marcou'),
      f('genial', 'Genial'),
      f('melhor-do-genero', 'Melhor do gênero'),
      f('classico', 'Clássico'),
      f('atemporal', 'Atemporal'),
      f('a-frente-do-tempo', 'À frente do tempo'),
      c('enjoa', 'Enjoa rápido'),
      c('letra-fraca', 'Letra fraca'),
      c('refrao-chato', 'Refrão chato'),
      c('autotune', 'Autotune demais'),
      c('mixagem', 'Mixagem ruim'),
      c('generico', 'Soa genérico'),
      c('copia', 'Parece cópia'),
      c('cliche', 'Clichê'),
      c('previsivel', 'Previsível'),
      c('arrastado', 'Se arrasta'),
      c('intro-longa', 'Intro longa demais'),
      c('muito-curto', 'Acaba cedo demais'),
      c('enchecao', 'Faixas pra encher'),
      c('caiu', 'Perde o fôlego'),
      c('ritmo-irregular', 'Altos e baixos'),
      c('final-decepcionante', 'Final decepcionante'),
      c('hype', 'Hype demais'),
      c('datado', 'Envelheceu mal'),
      c('cansa', 'Cansa o ouvido'),
      c('caca-niquel', 'Caça-níquel'),
      c('simplista', 'Simplista'),
    ],
  },
  anotacoes: {
    kind: 'anotacoes',
    plural: 'anotações',
    singular: 'anotação',
    fem: true,
    // sem notas: nada de média, boletim nem categoria de nota
    categories: [],
    status: { incompleto: 'Anotação', finalizado: 'Anotação', platinado: 'Anotação' },
    statusGroup: { incompleto: 'Anotações', finalizado: 'Anotações', platinado: 'Anotações' },
    day: { incompleto: 'Data', feito: 'Data' },
    amount: null,
    difficulty: null,
    released: '',
    placeholder: 'Título da anotação',
    lastOne: 'da sua primeira anotação',
    finished: '',
    again: '',
    revisit: { one: 'cópia', many: 'cópias' },
    verb: 'anotar',
    // as categorias prontas; as que a pessoa escrever entram depois, como os bônus escritos
    bonuses: [
      f('compras', 'Lista de compras'),
      f('a-fazer', 'A fazer'),
      f('ideias', 'Ideias'),
      f('lembretes', 'Lembretes'),
      f('estudos', 'Estudos'),
      f('trabalho', 'Trabalho'),
      f('receitas', 'Receitas'),
      f('metas', 'Metas'),
      f('viagem', 'Viagem'),
      f('diario', 'Diário'),
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
  return plural(n, p.singular, p.plural);
}

/** "1 rejogada", "3 releituras". */
export function revisitCountOf(p: KindProfile, n: number): string {
  return plural(n, p.revisit.one, p.revisit.many);
}

export { cap } from './text';
