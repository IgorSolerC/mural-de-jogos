import { chainCommands, deleteSelection, joinBackward, joinForward, selectNodeForward, toggleMark } from 'prosemirror-commands';
import { GapCursor } from 'prosemirror-gapcursor';
import { redo, undo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { MarkType, Node as PMNode, NodeType } from 'prosemirror-model';
import { Command, EditorState, NodeSelection, Plugin, TextSelection, Transaction } from 'prosemirror-state';
import { linkarEndereco } from './links';
import { schema, textoDoCru } from './schema';

/**
 * O teclado do Visual (PLANO-EDITOR-VISUAL.md, 5.9), escrito tecla por tecla: o `baseKeymap` do
 * ProseMirror não entra inteiro (ele usa o Ctrl+Enter, que no comentário é "Enviar"). Tecla que o Visual
 * não usa passa adiante. Enter, Backspace e Delete nas linhas, títulos, citações, sutis e no bloco de
 * código, Tab e Shift+Tab no recuo do texto (e os dois espaços no código), as marcas, o código (Ctrl+E,
 * que numa linha vazia ou em várias linhas faz o bloco) e o desfazer.
 */

const N = schema.nodes;
const M = schema.marks;
const BC = N['blocoCodigo'];

/** A largura do começo de uma linha só de espaços e tabs, em colunas (o tab até a parada de 4). */
function largura(espacos: string): number {
  let w = 0;
  for (const ch of espacos) w += ch === '\t' ? 4 - (w % 4) : 1;
  return w;
}

/**
 * O bloco de código vira linhas de texto (as letras de dentro, sem ler marca nenhuma: o que estava no
 * código fica como letras), uma por linha, com os espaços do começo no recuo. Devolve as linhas postas.
 */
export function paraLinhas(tr: Transaction, pos: number, bloco: PMNode): PMNode[] {
  const base: number = bloco.attrs['recuo'] ?? 0;
  const linhas = bloco.textContent.split('\n').map((t) => {
    const lead = /^[ \t]*/.exec(t)![0];
    const resto = t.slice(lead.length);
    return N['linha'].create({ recuo: Math.min(40, base + (resto ? largura(lead) : 0)) }, resto ? schema.text(resto) : []);
  });
  tr.replaceWith(pos, pos + bloco.nodeSize, linhas);
  return linhas;
}

/** Os nós de cima (as linhas do texto) que a seleção pega, com a posição de cada um. */
function nosDaSelecao(state: EditorState): [PMNode, number][] {
  const { from, to } = state.selection;
  const out: [PMNode, number][] = [];
  state.doc.forEach((n, pos) => {
    const fim = pos + n.nodeSize;
    // a seleção pega o nó; o cursor sozinho, o nó em que ele está
    if (from === to ? pos < from && from < fim : pos < to && from < fim) out.push([n, pos]);
  });
  return out;
}

/**
 * As linhas da seleção num bloco de código, como o `code()` do Markdown faz com elas: as letras de cada
 * uma (o título, a citação e as marcas viram só letras; o trecho cru e a divisória, o texto deles), o
 * recuo a mais de cada linha em espaços. O conteúdo fica selecionado (numa linha vazia, o cursor dentro).
 */
export const emBloco: Command = (state, dispatch) => {
  const nos = nosDaSelecao(state);
  if (!nos.length) return false;
  if (dispatch) {
    const recuo: number = nos[0][0].attrs['recuo'] ?? 0;
    const linhas = nos.map(([n]) => {
      if (n.type === N['cru']) return textoDoCru(n);
      if (n.type === N['divisoria']) return '---';
      const a: number = n.attrs['recuo'] ?? 0;
      return (n.type !== BC && n.textContent && a > recuo ? ' '.repeat(a - recuo) : '') + n.textContent;
    });
    const texto = linhas.join('\n');
    const de = nos[0][1];
    const ultimo = nos[nos.length - 1];
    const tr = state.tr.replaceWith(de, ultimo[1] + ultimo[0].nodeSize, BC.create({ recuo }, texto ? schema.text(texto) : []));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, de + 1, de + 1 + texto.length)).scrollIntoView());
  }
  return true;
};

/** O código: no bloco, ele volta a ser texto; numa linha vazia ou em várias linhas, o bloco; senão, a marca na linha. */
export const codigo: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if ($from.depth === 1 && $from.parent.type === BC && state.selection.$to.sameParent($from)) {
    if (dispatch) {
      const at = $from.before();
      const antes = $from.parent.textBetween(0, $from.parentOffset);
      const linha = antes.split('\n').length - 1;
      const tr = state.tr;
      const linhas = paraLinhas(tr, at, $from.parent);
      let pos = at;
      for (let k = 0; k < linha; k++) pos += linhas[k].nodeSize;
      const col = Math.min(linhas[linha].content.size, antes.length - antes.lastIndexOf('\n') - 1);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1 + col)).scrollIntoView());
    }
    return true;
  }
  const varias = nosDaSelecao(state).length > 1;
  const vazia = empty && $from.parent.isTextblock && !$from.parent.content.size;
  if (varias || vazia) return emBloco(state, dispatch);
  return marca(M['codigo'])(state, dispatch);
};

/**
 * Enter no bloco de código: a quebra de linha dentro dele. Numa linha vazia no fim do bloco, sai dele (a
 * linha vazia sai junto, e a linha nova embaixo tem o recuo do bloco). Shift+Enter quebra sempre.
 */
export const enterNoCodigo =
  (sair: boolean): Command =>
  (state, dispatch) => {
    const { $from, $to, empty } = state.selection;
    if ($from.depth !== 1 || $from.parent.type !== BC || !$from.sameParent($to)) return false;
    const bloco = $from.parent;
    if (sair && empty && $from.parentOffset === bloco.content.size && bloco.textContent.endsWith('\n')) {
      if (dispatch) {
        const tr = state.tr.delete($from.pos - 1, $from.pos);
        const at = tr.mapping.map($from.after());
        tr.insert(at, N['linha'].create({ recuo: bloco.attrs['recuo'] }));
        dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
      }
      return true;
    }
    if (dispatch) dispatch(state.tr.insertText('\n').scrollIntoView());
    return true;
  };

/**
 * Tab no bloco de código: dois espaços (não muda o nível do bloco); com várias linhas selecionadas, dois
 * espaços no começo de cada uma. Shift+Tab tira até dois do começo de cada linha; sem nada para tirar,
 * passa (o foco sai da folha, como fora do código).
 */
const tabNoCodigo =
  (dir: 1 | -1): Command =>
  (state, dispatch) => {
    const { $from, $to, empty } = state.selection;
    if ($from.depth !== 1 || $from.parent.type !== BC || !$from.sameParent($to)) return false;
    if (dir > 0 && empty) {
      if (dispatch) dispatch(state.tr.insertText('  ').scrollIntoView());
      return true;
    }
    const texto = $from.parent.textContent;
    const comecos = [texto.lastIndexOf('\n', $from.parentOffset - 1) + 1];
    // as linhas que a seleção pega (a do fim, se ela acaba logo no começo dela, não conta)
    for (let k = texto.indexOf('\n', comecos[0]); k !== -1 && k + 1 < $to.parentOffset + (empty ? 1 : 0); k = texto.indexOf('\n', k + 1)) comecos.push(k + 1);
    const tr = state.tr;
    const inicio = $from.start();
    for (const c of comecos.reverse()) {
      if (dir > 0) tr.insertText('  ', inicio + c);
      else {
        const n = /^ {0,2}/.exec(texto.slice(c))![0].length;
        if (n) tr.delete(inicio + c, inicio + c + n);
      }
    }
    if (!tr.docChanged) return false;
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };

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
  if (enterNoCodigo(true)(state, dispatch)) return true;
  const { $from } = sel;
  const node = $from.parent;
  if (!node.isTextblock || $from.depth !== 1) return false;
  const recuo: number = node.attrs['recuo'] ?? 0;
  // o bloco de código: "```" (ou "~~~") sozinho na linha e Enter (um atalho de digitação; o Ctrl+Z volta)
  const cerca = sel.empty && node.type === N['linha'] && $from.parentOffset === node.content.size && !node.firstChild?.marks.length ? /^(`{3,}|~{3,})[^`~\s]*$/.exec(node.textContent) : null;
  if (cerca) {
    if (dispatch) {
      const at = $from.before();
      const tr = state.tr.replaceWith(at, $from.after(), BC.create({ recuo, cerca: cerca[1] }));
      dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
    }
    return true;
  }
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
    // o endereço solto logo antes do cursor vira link (como no espaço)
    if (sel.empty) linkarEndereco(tr, $from.pos, state);
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
  // no começo do bloco de código, ele volta a ser texto (o vazio, uma linha vazia)
  if (node.type === BC) {
    if (dispatch) {
      const tr = state.tr;
      paraLinhas(tr, pos, node);
      dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView());
    }
    return true;
  }
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
  // o bloco de código embaixo não se junta a uma linha (as quebras dele não cabem nela): a linha vazia
  // sai, e a que tem texto fica como está
  if (depois?.type === BC && $from.parent.type !== BC) {
    if (dispatch && !$from.parent.content.size) dispatch(state.tr.delete($from.before(), $from.after()).scrollIntoView());
    return true;
  }
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

/**
 * Liga ou desliga a marca, como no Docs: com parte da seleção marcada, marca o resto. No bloco de código
 * não tem marca: a tecla fica com o Visual e nada acontece (sem o negrito do próprio navegador).
 */
export const marca =
  (tipo: MarkType): Command =>
  (state, dispatch) =>
    toggleMark(tipo, null, { removeWhenPresent: false })(state, dispatch) || !!state.selection.$from.parent.type.spec.code;

/** O estilo do parágrafo nas linhas da seleção (o "Formatar › Parágrafo"). */
export const estilo =
  (tipo: NodeType, nivel?: number): Command =>
  (state, dispatch) => {
    if (tipo === BC) return state.selection.$from.parent.type === BC || emBloco(state, dispatch);
    if (!linhasDaSelecao(state).length) return false;
    if (dispatch) {
      // os blocos de código da seleção viram linhas antes (o que estava dentro fica, como letras)
      const tr = state.tr;
      const { from, to } = state.selection;
      const blocos: [PMNode, number][] = [];
      state.doc.nodesBetween(from, to, (n, pos) => {
        if (n.type === BC) blocos.push([n, pos]);
        return false;
      });
      for (const [n, pos] of blocos.reverse()) paraLinhas(tr, pos, n);
      const [de, ate] = [tr.mapping.map(from, -1), tr.mapping.map(to, 1)];
      const alvos: [PMNode, number][] = [];
      tr.doc.nodesBetween(de, ate, (n, pos) => {
        if (n.isTextblock) alvos.push([n, pos]);
        return false;
      });
      for (const [n, pos] of alvos) {
        // a linha em branco no meio de várias fica em branco
        if (alvos.length > 1 && !n.textContent.trim()) continue;
        const recuo = tipo === N['linha'] ? n.attrs['recuo'] : 0;
        tr.setNodeMarkup(pos, tipo, tipo === N['titulo'] ? { recuo, fonte: n.attrs['fonte'], nivel } : { recuo, fonte: n.attrs['fonte'] });
      }
      if (blocos.length) tr.setSelection(TextSelection.between(tr.doc.resolve(de), tr.doc.resolve(ate)));
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
    'Shift-Enter': chainCommands(enterNoCodigo(false), enter),
    Backspace: apagarParaTras,
    'Shift-Backspace': apagarParaTras,
    Delete: apagarParaFrente,
    Tab: chainCommands(tabNoCodigo(1), recuar(1)),
    'Shift-Tab': chainCommands(tabNoCodigo(-1), recuar(-1)),
    'Mod-b': marca(M['negrito']),
    'Mod-i': marca(M['italico']),
    'Mod-e': codigo,
    'Mod-Shift-x': marca(M['riscado']),
    'Mod-Shift-h': marca(M['marca']),
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
  });
