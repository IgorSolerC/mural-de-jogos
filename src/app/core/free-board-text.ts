import { FbNode, FreeBoard, shownEdges, shownNodes } from './free-board';
import { framesOf, readingOrder } from './free-board-geometry';
import { plainText } from './rich-text';
import { parseWidgetLine, readCardRef, widgetDef, widgetSpoken } from './widgets';

/**
 * O Quadro livre como texto (PLANO-QUADRO-LIVRE.md, 4.9 e 7.8): as molduras como títulos, as peças dentro delas
 * na ordem de leitura, e as setas como "A → B (rótulo)". É o "Ver em lista" da tela (o leitor de tela, o jeito
 * rápido de achar algo no celular) e o que a API das AIs lê de um quadro.
 */

export interface OutlineItem {
  id: string;
  /** O que a peça é, para quem lê ("Bilhete", "Anotação", "Imagem"...). */
  kind: string;
  /** O que ela diz (o texto do bilhete, o título da nota, o nome do widget). */
  label: string;
  /** Quantas molduras ela tem em volta (0: solta no quadro). */
  depth: number;
  /** É uma moldura (um título na lista). */
  frame: boolean;
  /** A anotação do widget Nota (o id), se for uma. */
  note?: string;
}

export interface OutlineArrow {
  id: string;
  from: string;
  to: string;
  label: string | null;
}

export interface BoardOutline {
  items: OutlineItem[];
  arrows: OutlineArrow[];
}

/** O que a peça diz, numa linha. */
export function pieceLabel(n: FbNode): { kind: string; label: string; note?: string } {
  if (n.t === 'm') return { kind: 'Moldura', label: n.nome || 'Sem título' };
  if (n.t === 'x') return { kind: 'Bilhete', label: plainText(n.txt).replace(/\s+/g, ' ').trim().slice(0, 160) || '(vazio)' };
  const parsed = parseWidgetLine(n.src.split('\n')[0]);
  if (parsed?.name === 'nota') {
    const ref = readCardRef(parsed.args);
    return { kind: 'Anotação', label: ref.hidden ? 'Anotação privada' : ref.title || 'Anotação', ...(ref.id ? { note: ref.id } : {}) };
  }
  if (!parsed) return { kind: 'Tabela', label: plainText(n.src).split('\n')[0]?.slice(0, 120) ?? '' };
  const def = widgetDef(parsed.name);
  const spoken = widgetSpoken(parsed.name, parsed.args);
  const label = def && spoken.startsWith(def.label) ? spoken.slice(def.label.length).replace(/^,\s*/, '') : spoken;
  return { kind: def?.label ?? 'Widget', label };
}

/** O quadro em ordem de leitura, com a profundidade de cada peça nas molduras, e as setas. */
export function boardOutline(board: Pick<FreeBoard, 'n' | 'e'>): BoardOutline {
  const nodes = shownNodes(board);
  const owner = framesOf(nodes);
  const depth = (id: string) => {
    let d = 0;
    for (let o = owner.get(id); o; o = owner.get(o)) d++;
    return d;
  };
  const items = readingOrder(board).map((n): OutlineItem => ({ id: n.i, ...pieceLabel(n), depth: depth(n.i), frame: n.t === 'm' }));
  const byId = new Map(items.map((i) => [i.id, i]));
  const arrows = shownEdges(board).map((e): OutlineArrow => {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    const name = (x: OutlineItem | undefined) => (x ? x.label : '?');
    const back = e.p === '<';
    return { id: e.i, from: name(back ? b : a), to: name(back ? a : b), label: e.txt ?? null };
  });
  return { items, arrows };
}

/**
 * O quadro em texto corrido (markdown simples), para a API das AIs: o nome e o grupo, as molduras como títulos,
 * cada peça com o id dela entre colchetes (para ligar e acrescentar por ele) e as setas no fim.
 */
export function boardAsText(board: FreeBoard): string {
  const { items, arrows } = boardOutline(board);
  const lines = [`# ${board.nome}`, `Grupo: ${board.grupo}`, ''];
  for (const it of items) {
    if (it.frame) lines.push('', `${'#'.repeat(Math.min(6, 2 + it.depth))} ${it.label} [${it.id}]`);
    else lines.push(`${'  '.repeat(Math.max(0, it.depth - 1))}- ${it.kind}: ${it.label}${it.note ? ` (nota ${it.note})` : ''} [${it.id}]`);
  }
  if (arrows.length) {
    lines.push('', '## Setas');
    for (const a of arrows) lines.push(`- ${a.from} → ${a.to}${a.label ? ` (${a.label})` : ''}`);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
