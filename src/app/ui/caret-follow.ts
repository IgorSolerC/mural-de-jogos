/**
 * A prévia do editor acompanha quem escreve: com a ficha inteira à vista (ver ReviewEditor), a
 * rolagem dela vai até o trecho onde está o cursor. Cada linha desenhada pelo texto formatado leva o
 * número da linha do texto de onde saiu (`data-l`, ver RichText.anchors); aqui se acha a do cursor e
 * a altura dele dentro dela.
 */

/** A linha do texto onde está o cursor e quanto dela já ficou para trás (0 no começo, 1 no fim). */
export function caretSpot(text: string, at: number): { line: number; frac: number } {
  const before = text.slice(0, at);
  const line = before.split('\n').length - 1;
  const start = before.lastIndexOf('\n') + 1;
  const next = text.indexOf('\n', at);
  const end = next < 0 ? text.length : next;
  return { line, frac: end > start ? (at - start) / (end - start) : 0 };
}

/** O que quebra as linhas de uma <textarea>: o que a cópia dela (ver `caretBox`) precisa ter igual. */
const AREA_STYLE = ['boxSizing', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariantLigatures', 'fontFeatureSettings', 'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform', 'tabSize'] as const;

/**
 * A linha do cursor na posição `at` de uma <textarea> (de cima a baixo, a partir do topo dela). A
 * <textarea> não conta onde as linhas quebraram: uma cópia dela, invisível, com a mesma largura e a mesma
 * letra, conta (com o resto da linha do cursor, que pode levar a palavra dele para a linha de baixo).
 */
export function caretBox(area: HTMLTextAreaElement, at: number): { top: number; bottom: number } {
  const copy = document.createElement('div');
  const css = getComputedStyle(area);
  for (const p of AREA_STYLE) copy.style[p] = css[p];
  Object.assign(copy.style, { position: 'absolute', top: '0', left: '0', visibility: 'hidden', width: `${area.offsetWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  const text = area.value;
  const lineEnd = text.indexOf('\n', at);
  const mark = document.createElement('span');
  // (sem largura e sem abrir uma quebra de linha: a palavra do cursor quebra como na <textarea>)
  mark.textContent = '⁠';
  copy.append(text.slice(0, at), mark, text.slice(at, lineEnd < 0 ? text.length : lineEnd));
  (area.parentElement ?? document.body).append(copy);
  const box = copy.getBoundingClientRect();
  const line = mark.getBoundingClientRect();
  copy.remove();
  // (a caixa do marcador é a da letra, mais baixa que a linha: a linha inteira, em volta do meio dela)
  const middle = (line.top + line.bottom) / 2 - box.top - area.scrollTop;
  const half = (parseFloat(css.lineHeight) || line.height) / 2;
  return { top: middle - half, bottom: middle + half };
}

/** O lugar que rola em volta de `el` (null: a página). */
export function scrollerOf(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

/**
 * O pedaço desenhado da linha `line`: o de maior número até ela (as linhas que não aparecem, como as
 * tarefas feitas recolhidas ou o meio de um bloco de código, caem no pedaço de antes), e quantas
 * linhas do texto ele cobre até o próximo.
 */
export function anchorFor(root: ParentNode, line: number): { el: HTMLElement; first: number; span: number } | null {
  let el: HTMLElement | null = null;
  let first = -1;
  let after = Infinity;
  const all = [...root.querySelectorAll<HTMLElement>('[data-l]')];
  for (const node of all) {
    const l = Number(node.dataset['l']);
    if (l <= line && l >= first) {
      el = node;
      first = l;
    }
  }
  if (!el) return null;
  for (const node of all) {
    const l = Number(node.dataset['l']);
    if (l > first && l < after) after = l;
  }
  return { el, first, span: Number.isFinite(after) ? after - first : line - first + 1 };
}

/**
 * Quanto rolar para a altura `y` (no conteúdo rolável) ficar à vista com `pad` de folga em cima e
 * embaixo; null, já está. Nunca passa do começo.
 */
export function scrollToShow(top: number, height: number, y: number, pad: number): number | null {
  const room = Math.min(pad, height / 3);
  if (y > top + height - room) return Math.max(0, Math.round(y - height + room));
  if (y < top + room) return Math.max(0, Math.round(y - room));
  return null;
}

/**
 * A altura do cursor dentro do pedaço achado, no conteúdo de `view` (a caixa que rola): o item com o
 * que vem embaixo dele (a descrição, outra lista) conta só a linha dele, sem o corpo.
 */
export function caretY(view: HTMLElement, spot: { el: HTMLElement; first: number; span: number }, line: number, frac: number): number {
  const box = spot.el.getBoundingClientRect();
  const body = spot.el.querySelector(':scope > .corpo');
  const own = body ? body.getBoundingClientRect().top - box.top : box.height;
  const part = Math.min(1, Math.max(0, (line - spot.first + frac) / Math.max(1, spot.span)));
  return box.top - view.getBoundingClientRect().top + view.scrollTop + own * part;
}
