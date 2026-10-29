/**
 * Os murais de resenhas como a API das AIs mostra (PLANO-API.md, 7.2 e 8; rodada 9): o desejo (a
 * wishlist), o pra depois (o que espera uma ficha) e a ficha (a resenha, com as notas), e o que cada
 * mural tem (as notas de cada um, os nomes dos status, a dificuldade, a quantidade). Formato público e
 * estável v1: o site monta com as regras da tela (core/kinds.ts, `computeFinal`) e manda ao espelho; a
 * API só serve. Só tipos e funções puras.
 */

/** Os murais de resenhas (o de anotações tem a parte dele na API). */
export type MuralV1 = 'jogos' | 'livros' | 'filmes' | 'series' | 'animes' | 'musicas';
export const MURAIS: readonly MuralV1[] = ['jogos', 'livros', 'filmes', 'series', 'animes', 'musicas'];

/** Quanta vontade de um desejo: MUST vai para a frente da wishlist, LATER para o fim. */
export type RelevanciaV1 = 'must' | 'comum' | 'later';
export const RELEVANCIAS: readonly RelevanciaV1[] = ['must', 'comum', 'later'];

export type StatusV1 = 'incompleto' | 'finalizado' | 'platinado';
export const STATUS: readonly StatusV1[] = ['incompleto', 'finalizado', 'platinado'];
export type DificuldadeV1 = 'nenhuma' | 'facil' | 'media' | 'dificil' | 'impossivel' | 'infernal';
export const DIFICULDADES: readonly DificuldadeV1[] = ['nenhuma', 'facil', 'media', 'dificil', 'impossivel', 'infernal'];
export type VereditoV1 = 'masterpiece' | 'recomendo' | 'legalzinho' | 'meh' | 'chato';
export const VEREDITOS: readonly VereditoV1[] = ['masterpiece', 'recomendo', 'legalzinho', 'meh', 'chato'];
/** As notas que uma ficha pode ter (cada mural usa quatro delas: ver `ContextoFichasV1`). */
export const NOTAS: readonly string[] = [
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
  'letra',
  'vocal',
  'instrumental',
];

/** Um desejo da wishlist. */
export interface DesejoV1 {
  id: string;
  mural: MuralV1;
  nome: string;
  ano: string | null;
  /** Quem escreveu (livros) ou quem toca (músicas). */
  por: string | null;
  capa: string | null;
  relevancia: RelevanciaV1;
  criado_em: string;
  /** A versão que se manda de volta ao mudar ou tirar. */
  versao: string;
}

/** O que espera uma ficha (o Pra depois): só o nome e a capa. */
export type PraDepoisV1 = Omit<DesejoV1, 'relevancia'>;

/** Uma ficha (resenha) de um mural. */
export interface FichaV1 {
  id: string;
  mural: MuralV1;
  nome: string;
  por: string | null;
  ano: string | null;
  capa: string | null;
  /** Só nas músicas: álbum ou faixa (null nos outros murais). */
  forma: 'album' | 'faixa' | null;
  /** Só nas músicas: o artista (a aba dela no mural). */
  artista: string | null;
  /** A média, de 0 a 10 com uma casa: sempre calculada pelo Murall (ou dada na mão pela pessoa). */
  nota_final: number;
  /** As notas do mural (de 0 a 10, inteiras); null é sem nota. */
  notas: Record<string, number | null>;
  /** A pessoa deu a nota final na mão, no lugar da média. */
  nota_final_na_mao: boolean;
  status: StatusV1;
  /** null no mural sem dificuldade. */
  dificuldade: DificuldadeV1 | null;
  veredito: VereditoV1 | null;
  /** Horas jogadas, páginas lidas (null no mural sem quantidade, ou sem dizer). */
  quantidade: number | null;
  texto: string;
  /** O dia em que terminou (`AAAA-MM-DD`), só o ano (`AAAA`), ou null (não lembra). */
  concluida_em: string | null;
  visibilidade: 'privada' | 'publica';
  /** Releitura, rejogada: o id da ficha original. */
  releitura_de: string | null;
  criada_em: string;
  versao: string;
}

/** O que um mural tem, para escrever uma ficha certa. */
export interface PerfilDoMuralV1 {
  mural: MuralV1;
  /** "jogos", "livros". */
  nome: string;
  /** As quatro notas do mural, com o nome na tela e o peso na média. */
  notas: { id: string; nome: string; peso: number }[];
  /** Os nomes dos três status neste mural (incompleto, finalizado, platinado). */
  status: Record<StatusV1, string>;
  /** O nome da dificuldade neste mural; null: o mural não tem. */
  dificuldade: string | null;
  /** A quantidade que se anota (horas, páginas); null: o mural não tem. */
  quantidade: { unidade: string; fracao: boolean } | null;
  /** O nome da ficha da mesma obra outra vez ("rejogada", "releitura"). */
  releitura: string;
  fichas: number;
}

/** O vocabulário dos murais de resenhas (`contexto-fichas`, id `fichas`). */
export interface ContextoFichasV1 {
  murais: PerfilDoMuralV1[];
}

/** O id da linha de contexto das fichas. */
export const CONTEXTO_FICHAS = 'fichas';

export const NOME_MAX = 200;
export const POR_MAX = 120;
export const TEXTO_DA_FICHA_MAX = 20_000;
export const ARTISTA_MAX = 60;
export const QUANTIDADE_MAX = 99_999;

export function ehMural(v: unknown): v is MuralV1 {
  return (MURAIS as readonly unknown[]).includes(v);
}
