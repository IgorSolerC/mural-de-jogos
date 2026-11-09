/**
 * Arrastar várias marcadas de uma vez, igual no mural (pages/wall-drag.ts) e no Kanban (PLANO-SELECAO.md, 2):
 * quem vai junto com a ficha pega e o maço que segue o ponteiro. O CSS do maço é o de ui/_pilha-arrasto.scss.
 */

/**
 * As marcadas que vão junto com a pega, na ordem da tela (`order`; as marcadas fora dela, escondidas pela
 * busca ou pelo filtro, vão no fim, na ordem em que foram marcadas). Vazio quando a pega não está marcada
 * ou é a única: ela vai sozinha.
 */
export function dragGroup(lead: string, marked: readonly string[], order: readonly string[]): string[] {
  const set = new Set(marked);
  if (!set.has(lead) || set.size < 2) return [];
  const seen = order.filter((id) => set.has(id));
  const shown = new Set(seen);
  return [...new Set([...seen, ...marked.filter((id) => !shown.has(id))])];
}

/** Os atributos de estilo da página (`_ngcontent-…`) de um elemento: o maço e o número os levam, como as fichas. */
export function scopeOf(el: Element): string[] {
  return Array.from(el.attributes, (a) => a.name).filter((n) => n.startsWith('_ngcontent-'));
}

/**
 * O maço que segue o ponteiro quando vão várias: a cópia da ficha pega por cima, até duas das outras
 * por baixo, saindo de lado, e o adesivo com quantas vão. `copy` faz a cópia de uma ficha (cada página
 * tira dela o que não vai junto: os botões, os ids); `under` são as fichas de baixo, da de cima para a funda.
 */
export function dragPile(top: HTMLElement, under: readonly HTMLElement[], count: number, copy: (el: HTMLElement) => HTMLElement, scope: readonly string[]): HTMLElement {
  const pile = document.createElement('div');
  for (const name of scope) pile.setAttribute(name, '');
  pile.classList.add('pilha');
  const below = under.slice(0, 2);
  // a mais funda primeiro, para a de cima ser pintada por último
  // (as cópias levam os estilos da página que faz o maço, mesmo vindas de outro componente)
  const scoped = (el: HTMLElement) => {
    const c = copy(el);
    for (const name of scope) c.setAttribute(name, '');
    return c;
  };
  [...below].reverse().forEach((el, i) => {
    const c = scoped(el);
    c.classList.add('pilha-baixo');
    c.style.setProperty('--k', String(below.length - i));
    pile.append(c);
  });
  pile.append(scoped(top));
  const n = document.createElement('span');
  for (const name of scope) n.setAttribute(name, '');
  n.className = 'pilha-n';
  n.textContent = String(count);
  pile.append(n);
  return pile;
}
