/**
 * O Kanban como a API das AIs mostra (PLANO-API.md, 7.2 e 8; rodada 8): o quadro de cada grupo das
 * Anotações, com as colunas e os cartões (cada cartão é uma nota do grupo). Formato público e estável
 * v1: o site monta com o que a tela mostra (a ordem das colunas que se arrumam sozinhas, só as notas
 * que estão no quadro de verdade) e manda ao espelho; a API só serve. Só tipos e funções puras.
 */

import type { ImportanciaV1 } from './notas';

export const IMPORTANCIAS: readonly ImportanciaV1[] = ['critico', 'importante', 'medio', 'baixo', 'baixissimo'];

export interface ColunaV1 {
  id: string;
  nome: string;
  /** A nota que chega aqui é finalizada (e, saindo para uma coluna que não finaliza, aberta de novo). */
  finaliza: boolean;
  /** A seta de avançar das colunas da esquerda pula esta (uma coluna de entrada). */
  pula: boolean;
  /** A ordem que a coluna se dá sozinha, em palavras; null: a ordem em que os cartões foram postos. */
  ordem: string | null;
  /** Quantos cartões a coluna tem. */
  cartoes: number;
}

export interface CartaoV1 {
  /** O id da nota (o cartão é a própria nota). */
  nota: string;
  titulo: string;
  /** O id da coluna. */
  coluna: string;
  /** O lugar na coluna, na ordem em que aparece (0 = o de cima). */
  posicao: number;
  finalizada: boolean;
  importancia: ImportanciaV1 | null;
  /** Umas palavras soltas ao lado da importância ("Em revisão", "Com o Sérgio"). */
  status: string | null;
  /** As notas (de qualquer grupo, pelo id) que precisam estar finalizadas antes desta. */
  depende_de: string[];
  /** A nota aparece também no mural das Anotações (senão, só no Kanban). */
  no_mural: boolean;
  tags: string[];
}

export interface QuadroV1 {
  /** O id do quadro (sai do grupo: o mesmo em todo aparelho). */
  id: string;
  /** O grupo das Anotações dono do quadro (só as notas dele entram). */
  grupo: string;
  /** As notas do quadro ficam só no Kanban, fora do mural (a não ser a que diz outra coisa em no_mural). */
  so_no_kanban: boolean;
  /** Da esquerda para a direita. */
  colunas: ColunaV1[];
  /** Coluna por coluna, cada uma de cima para baixo. */
  cartoes: CartaoV1[];
  /** Quando o quadro mudou (a hora zero, 1970, é o quadro de sempre, em que ninguém mexeu). */
  versao: string;
}

/** Os tamanhos de sempre do app (core/kanban.ts). */
export const COLUNAS_MAX = 20;
export const CARTOES_MAX = 1000;
export const NOME_DA_COLUNA_MAX = 40;
export const STATUS_MAX = 28;
export const DEPENDENCIAS_MAX = 30;

/** O quadro com os lugares e as contagens refeitos (depois de mexer nos cartões, na prévia de um pedido). */
export function renumerar(q: QuadroV1): QuadroV1 {
  const porColuna = new Map(q.colunas.map((c) => [c.id, [] as CartaoV1[]]));
  for (const c of q.cartoes) porColuna.get(c.coluna)?.push(c);
  const cartoes = q.colunas.flatMap((c) => (porColuna.get(c.id) ?? []).map((x, i) => ({ ...x, posicao: i })));
  return { ...q, colunas: q.colunas.map((c) => ({ ...c, cartoes: porColuna.get(c.id)?.length ?? 0 })), cartoes };
}
