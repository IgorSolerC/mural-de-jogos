import type { CartaoV1, ColunaV1, QuadroV1 } from '../../../contrato/api-v1/kanban';
import { BoardCategory, KanbanBoard, belongs, cardsIn, onWall } from './kanban';
import { sortCards, sortSentence } from './kanban-sort';
import { Review } from './review';

/**
 * O Kanban no espelho da API das AIs (PLANO-API.md, seção 8; rodada 8): cada quadro em v1, como a
 * tela mostra. Um quadro por grupo com nota; em cada coluna, só as notas que estão no quadro de verdade
 * (existem e são do grupo dele), na ordem da coluna (a que se arruma sozinha já vai arrumada, ver
 * core/kanban-sort.ts). Só funções puras; quem chama é `ApiMirror`.
 */

/** O que o espelho precisa saber dos quadros: os grupos com nota, o quadro de cada um e o "só no Kanban". */
export interface KanbanMirrorSource {
  categories: readonly BoardCategory[];
  boardFor(label: string): KanbanBoard;
  kanbanOnly(label: string): boolean;
}

/**
 * Um quadro em v1. `notes` são as notas que a API alcança (sem as compartilhadas): o cartão de uma nota
 * fora dela não vai, nem a dependência dela.
 */
export function quadroV1(b: KanbanBoard, label: string, kanbanOnly: boolean, notes: ReadonlyMap<string, Review>): QuadroV1 {
  const colunas: ColunaV1[] = [];
  const cartoes: CartaoV1[] = [];
  for (const col of b.columns) {
    const live = cardsIn(b, col.id).filter((c) => belongs(b, notes.get(c.note)));
    const list = col.sort?.length ? sortCards(live, col.sort, (id) => notes.get(id)) : live;
    colunas.push({ id: col.id, nome: col.name, finaliza: col.finishes, pula: !!col.skip, ordem: col.sort?.length ? sortSentence(col.sort) : null, cartoes: list.length });
    list.forEach((c, posicao) => {
      const n = notes.get(c.note)!;
      cartoes.push({
        nota: c.note,
        titulo: n.game.name,
        coluna: col.id,
        posicao,
        finalizada: !!n.doneAt,
        importancia: c.importance ?? null,
        status: c.status ?? null,
        depende_de: (c.deps ?? []).filter((d) => notes.has(d)),
        no_mural: onWall(c, kanbanOnly),
        tags: [...(n.tags ?? [])],
      });
    });
  }
  return { id: b.id, grupo: label, so_no_kanban: kanbanOnly, colunas, cartoes, versao: b.at };
}

/** Os quadros de todos os grupos com nota, na ordem das abas. */
export function kanbanMirror(src: KanbanMirrorSource, notes: ReadonlyMap<string, Review>): QuadroV1[] {
  return src.categories.map((c) => quadroV1(src.boardFor(c.label), c.label, src.kanbanOnly(c.label), notes));
}
