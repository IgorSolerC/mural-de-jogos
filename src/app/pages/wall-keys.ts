/**
 * As setas numa parede de escolher (a Visão geral e a lista do mural de anotações): de qual item para
 * qual. `rows`: os itens correm em fileiras (para os lados, a ordem; para cima e para baixo, o item da
 * fileira de cima ou de baixo mais perto na horizontal). `columns`: correm em colunas, como a lista
 * (para cima e para baixo, a ordem; para os lados, o item da coluna do lado mais perto na vertical).
 * Home e End vão ao primeiro e ao último. Devolve o índice do próximo, ou null quando a tecla não é
 * dessas (ou com Ctrl, Alt, Cmd ou Shift, que são de outros atalhos) ou não há para onde ir.
 */
export function stepFocus(items: readonly HTMLElement[], at: number, e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>, flow: 'rows' | 'columns'): number | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !items.length) return null;
  const last = items.length - 1;
  const inOrder = (d: 1 | -1): number | null => {
    const n = at + d;
    return n < 0 || n > last ? null : n;
  };
  switch (e.key) {
    case 'Home':
      return at === 0 ? null : 0;
    case 'End':
      return at === last ? null : last;
    case 'ArrowRight':
      return flow === 'rows' ? inOrder(1) : across(items, at, 'right');
    case 'ArrowLeft':
      return flow === 'rows' ? inOrder(-1) : across(items, at, 'left');
    case 'ArrowDown':
      return flow === 'columns' ? inOrder(1) : across(items, at, 'down');
    case 'ArrowUp':
      return flow === 'columns' ? inOrder(-1) : across(items, at, 'up');
    default:
      return null;
  }
}

/** Uns pixels de folga: as fichas tortas não ficam exatamente na mesma linha. */
const SLACK = 12;

/**
 * O item vizinho numa direção, pela posição na tela: entre os que estão para lá, os da linha (ou
 * coluna) mais perto, e desses o mais alinhado com o de agora.
 */
function across(items: readonly HTMLElement[], at: number, dir: 'up' | 'down' | 'left' | 'right'): number | null {
  const boxes = items.map((el) => el.getBoundingClientRect());
  const from = boxes[at];
  const vertical = dir === 'up' || dir === 'down';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  // a distância no sentido da tecla (pelas beiradas, para itens de alturas diferentes) e de lado (pelos meios)
  const ahead = (b: DOMRect): number =>
    vertical ? (sign > 0 ? b.top - from.bottom : from.top - b.bottom) : sign > 0 ? b.left - from.right : from.left - b.right;
  const aside = (b: DOMRect): number =>
    vertical ? Math.abs(b.left + b.width / 2 - (from.left + from.width / 2)) : Math.abs(b.top + b.height / 2 - (from.top + from.height / 2));
  let nearest = Infinity;
  for (let i = 0; i < boxes.length; i++) if (i !== at && ahead(boxes[i]) > -SLACK) nearest = Math.min(nearest, ahead(boxes[i]));
  if (nearest === Infinity) return null;
  let best: number | null = null;
  for (let i = 0; i < boxes.length; i++) {
    if (i === at || ahead(boxes[i]) <= -SLACK || ahead(boxes[i]) > nearest + SLACK) continue;
    if (best === null || aside(boxes[i]) < aside(boxes[best])) best = i;
  }
  return best;
}
