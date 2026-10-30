import { chainCommands, deleteSelection, joinBackward, joinForward, selectNodeForward, toggleMark } from 'prosemirror-commands';
import { GapCursor } from 'prosemirror-gapcursor';
import { redo, undo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { MarkType, Node as PMNode, NodeType } from 'prosemirror-model';
import { Command, EditorState, NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import { schema } from './schema';

/**
 * O teclado do Visual (PLANO-EDITOR-VISUAL.md, 5.9), escrito tecla por tecla: o `baseKeymap` do
 * ProseMirror não entra inteiro (ele usa o Ctrl+Enter, que no comentário é "Enviar"). Tecla que o Visual
 * não usa passa adiante. Nesta rodada: Enter, Backspace e Delete nas linhas, títulos, citações e sutis,
 * Tab e Shift+Tab no recuo do texto, as marcas e o desfazer.
 */

const N = schema.nodes;
const M = schema.marks;

/** Os blocos de texto (as linhas) que a seleção pega, com a posição de cada um. */
export function linhasDaSelecao(state: EditorState): [PMNode, number][] {
  const out: [PMNode, number][] = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) out.push([node, pos]);
    return false;
  });
  return out;
}

/** Uma linha vazia, com o cursor nela, na posição `pos` (entre dois blocos). */
function linhaNova(state: EditorState, pos: number): ReturnType<EditorState['tr']['insert']> {
  const tr = state.tr.insert(pos, N['linha'].create());
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
}

/**
 * Enter: linha nova. No fim de um título ou de um sutil, a nova é texto (o Markdown também não continua
 * o "-# "); no meio, os dois pedaços ficam do mesmo jeito. No começo de uma linha com texto, a linha
 * vazia entra em cima e o cursor fica no texto (como no Docs). Na citação vazia, a citação acaba; no
 * título vazio, ele vira texto. "---" e Enter é a divisória. Numa peça selecionada (ou no cursor de
 * lacuna, perto dela), uma linha nova embaixo (ou ali).
 */
export const enter: Command = (state, dispatch) => {
  const sel = state.selection;
  if (sel instanceof GapCursor) {
    if (dispatch) dispatch(linhaNova(state, sel.from));
    return true;
  }
  if (sel instanceof NodeSelection && sel.node.isBlock) {
    if (dispatch) dispatch(linhaNova(state, sel.to));
    return true;
  }
  const { $from } = sel;
  const node = $from.parent;
  if (!node.isTextblock || $from.depth !== 1) return false;
  const recuo: number = node.attrs['recuo'] ?? 0;
  // a divisória: "---" sozinho na linha (um atalho de digitação; o Ctrl+Z volta o "---")
  if (sel.empty && node.type === N['linha'] && node.textContent === '---' && $from.parentOffset === 3 && !node.firstChild?.marks.length) {
    if (dispatch) {
      const at = $from.before();
      const tr = state.tr.replaceWith(at, $from.after(), [N['divisoria'].create({ recuo }), N['linha'].create()]);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
    }
    return true;
  }
  // a citação vazia acaba, o título vazio vira texto
  if (sel.empty && !node.content.size && (node.type === N['citacao'] || node.type === N['titulo'] || node.type === N['sutil'])) {
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), N['linha'], { recuo, fonte: null }).scrollIntoView());
    return true;
  }
  if (dispatch) {
    const marcas = state.storedMarks || ($from.parentOffset ? $from.marks() : null);
    const tr = state.tr;
    if (!sel.empty) tr.deleteSelection();
    const $p = tr.selection.$from;
    if ($p.depth !== 1) return false;
    const pai = $p.parent;
    if ($p.parentOffset === 0 && pai.content.size) {
      // no começo de uma linha com texto: a vazia entra em cima, o cursor fica no texto
      tr.insert($p.before(), N['linha'].create());
    } else {
      const noFim = $p.parentOffset === pai.content.size;
      const vira = (pai.type === N['titulo'] || pai.type === N['sutil']) && noFim ? N['linha'] : pai.type;
      const attrs = vira === N['titulo'] ? { recuo: pai.attrs['recuo'], fonte: null, nivel: pai.attrs['nivel'] } : { recuo: vira === N['linha'] && pai.type !== N['linha'] ? 0 : pai.attrs['recuo'], fonte: null };
      tr.split($p.pos, 1, [{ type: vira, attrs }]);
      if (marcas) tr.ensureMarks(marcas.filter((m) => m.type.spec.inclusive !== false));
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/**
 * Backspace no começo de uma linha: o título, a citação e o sutil viram texto; o texto recuado volta um
 * nível. Com uma peça logo em cima (a divisória, um trecho cru), a peça fica selecionada (de novo, ela
 * sai), como no Docs; a linha vazia sai junto. Senão, junta com a de cima.
 */
export const apagarNoComeco: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parentOffset > 0 || $from.depth !== 1) return false;
  const node = $from.parent;
  const pos = $from.before();
  if (node.type === N['titulo'] || node.type === N['citacao'] || node.type === N['sutil']) {
    if (dispatch) dispatch(state.tr.setNodeMarkup(pos, N['linha'], { recuo: node.attrs['recuo'], fonte: null }));
    return true;
  }
  if (node.type === N['linha'] && node.attrs['recuo'] > 0) {
    if (dispatch) dispatch(state.tr.setNodeMarkup(pos, null, { ...node.attrs, recuo: paraTras(node.attrs['recuo']) }));
    return true;
  }
  const antes = $from.index(0) > 0 ? state.doc.child($from.index(0) - 1) : null;
  if (antes?.isAtom) {
    if (dispatch) {
      const tr = state.tr;
      const at = pos - antes.nodeSize;
      if (!node.content.size && state.doc.childCount > 1) tr.delete(pos, $from.after());
      dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
    }
    return true;
  }
  return false;
};

/** Delete no fim de uma linha com uma peça logo embaixo: a peça fica selecionada (de novo, ela sai). */
const apagarNoFim: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parentOffset < $from.parent.content.size || $from.depth !== 1) return false;
  const depois = $from.index(0) + 1 < state.doc.childCount ? state.doc.child($from.index(0) + 1) : null;
  if (!depois?.isAtom) return false;
  if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $from.after())).scrollIntoView());
  return true;
};

export const apagarParaTras: Command = chainCommands(undoInputRule, deleteSelection, apagarNoComeco, joinBackward);
export const apagarParaFrente: Command = chainCommands(deleteSelection, apagarNoFim, joinForward, selectNodeForward);

/** O recuo seguinte de 2 em 2, sempre num número par (3 → 4), como o Tab do Markdown. */
const paraFrente = (r: number) => r + (r % 2 ? 1 : 2);
const paraTras = (r: number) => Math.max(0, r - (r % 2 ? 1 : 2));

/**
 * Tab e Shift+Tab: o texto entra ou sai um nível (o recuo de 2 em 2, como no Markdown). Só nas linhas
 * de texto: o título, a citação e o sutil recuados não são lidos como eles mesmos. Shift+Tab sem recuo
 * nenhum é o de sempre do navegador (o foco sai da folha: o Tab nunca prende).
 */
export const recuar =
  (dir: 1 | -1): Command =>
  (state, dispatch) => {
    const alvos = linhasDaSelecao(state).filter(([n]) => n.type === N['linha']);
    if (dir < 0 && alvos.every(([n]) => !n.attrs['recuo'])) return false;
    if (dispatch && alvos.length) {
      const tr = state.tr;
      for (const [n, pos] of alvos) tr.setNodeMarkup(pos, null, { ...n.attrs, recuo: Math.min(40, dir > 0 ? paraFrente(n.attrs['recuo']) : paraTras(n.attrs['recuo'])) });
      dispatch(tr);
    }
    return true;
  };

/** Liga ou desliga a marca, como no Docs: com parte da seleção marcada, marca o resto. */
export const marca = (tipo: MarkType): Command => toggleMark(tipo, null, { removeWhenPresent: false });

/** O estilo do parágrafo nas linhas da seleção (o "Formatar › Parágrafo"). */
export const estilo =
  (tipo: NodeType, nivel?: number): Command =>
  (state, dispatch) => {
    const alvos = linhasDaSelecao(state);
    if (!alvos.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const [n, pos] of alvos) {
        // a linha em branco no meio de várias fica em branco
        if (alvos.length > 1 && !n.textContent.trim()) continue;
        const recuo = tipo === N['linha'] ? n.attrs['recuo'] : 0;
        tr.setNodeMarkup(pos, tipo, tipo === N['titulo'] ? { recuo, fonte: n.attrs['fonte'], nivel } : { recuo, fonte: n.attrs['fonte'] });
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/** A divisória numa linha só dela, depois da linha do cursor (no lugar dela, se está vazia). */
export const divisoria: Command = (state, dispatch) => {
  const { $from } = state.selection;
  const i = $from.depth ? $from.index(0) : Math.min($from.index(0), state.doc.childCount - 1);
  const atual = state.doc.child(i);
  let pos = 0;
  for (let k = 0; k < i; k++) pos += state.doc.child(k).nodeSize;
  if (dispatch) {
    const tr = state.tr;
    const vazia = atual.type === N['linha'] && !atual.content.size;
    const at = vazia ? pos : pos + atual.nodeSize;
    if (vazia) tr.delete(pos, pos + atual.nodeSize);
    tr.insert(at, N['divisoria'].create());
    const depois = tr.doc.childAfter(at + 1);
    if (!depois.node?.isTextblock) tr.insert(at + 1, N['linha'].create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)).scrollIntoView());
  }
  return true;
};

export const teclas = (): Plugin =>
  keymap({
    Enter: enter,
    'Shift-Enter': enter,
    Backspace: apagarParaTras,
    'Shift-Backspace': apagarParaTras,
    Delete: apagarParaFrente,
    Tab: recuar(1),
    'Shift-Tab': recuar(-1),
    'Mod-b': marca(M['negrito']),
    'Mod-i': marca(M['italico']),
    'Mod-e': marca(M['codigo']),
    'Mod-Shift-x': marca(M['riscado']),
    'Mod-Shift-h': marca(M['marca']),
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
  });
