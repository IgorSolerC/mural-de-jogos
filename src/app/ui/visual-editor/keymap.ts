import { chainCommands, deleteSelection, joinBackward, joinForward, selectAll, selectNodeForward, toggleMark } from 'prosemirror-commands';
import { GapCursor } from 'prosemirror-gapcursor';
import { redo, undo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { MarkType, Node as PMNode, NodeType } from 'prosemirror-model';
import { Command, EditorState, NodeSelection, Plugin, TextSelection, Transaction } from 'prosemirror-state';
import { CodeOptions, CodeState, codeBackspace, codeComment, codeDeleteLines, codeDiff, codeDuplicateLines, codeEnter, codeHome, codeMoveLines, codeTab } from '../../core/code-edit';
import { closes } from '../../core/rich-text';
import { linkarEndereco } from './links';
import { enterNaLista, linhaNoItem, mapaDe, paraFrente, paraTras, recuarItem, recuoParaFora } from './listas';
import { tabNaPeca } from './pecas';
import { linhaDaPeca, schema, textoDoCru } from './schema';
import { apagarNaTabela, apagarSelecao, enterNaTabela, entrarNaTabela, tabNaTabela, tabelaEm } from './tabela';
import { apagarNoCartao, enterNoCartao } from './cartoes';

/**
 * O teclado do Visual (PLANO-EDITOR-VISUAL.md, 5.9), escrito tecla por tecla: o `baseKeymap` do
 * ProseMirror não entra inteiro (ele usa o Ctrl+Enter, que no comentário é "Enviar"). Tecla que o Visual
 * não usa passa adiante. Enter, Backspace e Delete nas linhas, títulos, citações, sutis, itens de lista
 * (ver listas.ts) e no bloco de código, Tab e Shift+Tab no recuo do texto e no nível dos itens (e no
 * recuo do código, com as teclas de core/code-edit.ts), as marcas, o código (Ctrl+E, que numa linha vazia
 * ou em várias linhas faz o bloco) e o desfazer (o Ctrl+Alt+Enter da tarefa mora no visual-editor.ts).
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
    // (o bloco de dentro de um card: as linhas ficam nele)
    return N['linha'].create({ recuo: Math.min(40, base + (resto ? largura(lead) : 0)), cartao: bloco.attrs['cartao'] }, resto ? schema.text(resto) : []);
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
    const mapa = mapaDe(state);
    const linhas = nos.map(([n, pos]) => {
      if (n.type === N['cru']) return textoDoCru(n);
      if (n.type === N['tabela']) {
        const i = state.doc.resolve(pos).index(0);
        return mapa ? mapa.linhas.slice(mapa.primeira[i], mapa.primeira[i + 1] ?? mapa.linhas.length).join('\n') : n.textContent;
      }
      if (n.type === N['divisoria']) return '---';
      if (n.type === N['widget']) return linhaDaPeca(n);
      const a: number = n.attrs['recuo'] ?? 0;
      return (n.type !== BC && n.textContent && a > recuo ? ' '.repeat(a - recuo) : '') + n.textContent;
    });
    const texto = linhas.join('\n');
    const de = nos[0][1];
    const ultimo = nos[nos.length - 1];
    const tr = state.tr.replaceWith(de, ultimo[1] + ultimo[0].nodeSize, BC.create({ recuo, cartao: nos[0][0].attrs['cartao'] ?? null }, texto ? schema.text(texto) : []));
    dispatch(tr.setSelection(TextSelection.create(tr.doc, de + 1, de + 1 + texto.length)).scrollIntoView());
  }
  return true;
};

/** O código: no bloco, ele volta a ser texto; numa linha vazia ou em várias linhas, o bloco; senão, a marca na linha. */
export const codigo: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  // na célula da tabela, só a marca (a célula não guarda bloco)
  if (tabelaEm($from)) return marca(M['codigo'])(state, dispatch);
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

/** A seleção num bloco de código só: o bloco, ou null. */
function noBloco(state: EditorState): PMNode | null {
  const { $from, $to } = state.selection;
  return $from.depth === 1 && $from.parent.type === BC && $from.sameParent($to) ? $from.parent : null;
}

/**
 * Uma tecla de core/code-edit.ts no bloco da seleção: troca só o que mudou (as cores e o desfazer andam com
 * as letras). Fora de um bloco, ou com a conta dizendo que a tecla não é dela (null), a tecla passa.
 */
const noCodigo =
  (conta: (s: CodeState, o: CodeOptions) => CodeState | null): Command =>
  (state, dispatch) => {
    const bloco = noBloco(state);
    if (!bloco) return false;
    const { $from, $to, anchor, head } = state.selection;
    const antes = bloco.textContent;
    const depois = conta({ text: antes, from: $from.parentOffset, to: $to.parentOffset }, { lang: bloco.attrs['lingua'] ?? '' });
    if (!depois) return false;
    if (dispatch) {
      const inicio = $from.start();
      const d = codeDiff(antes, depois.text);
      const tr = state.tr;
      if (d.ins) tr.replaceWith(inicio + d.de, inicio + d.ate, schema.text(d.ins));
      else if (d.ate > d.de) tr.delete(inicio + d.de, inicio + d.ate);
      // a seleção volta no sentido em que estava (quem estende com o Shift continua da mesma ponta)
      const [a, b] = anchor <= head ? [depois.from, depois.to] : [depois.to, depois.from];
      dispatch(tr.setSelection(TextSelection.create(tr.doc, inicio + a, inicio + b)).scrollIntoView());
    }
    return true;
  };

/**
 * Enter no bloco de código: a quebra de linha com o recuo da de cima (ver core/code-edit.ts). Numa linha
 * vazia (ou só de recuo) no fim do bloco, sai dele: a linha sai junto, e a linha nova embaixo tem o recuo
 * do bloco. A cerca escrita na última linha também sai dele, como quem fecha o bloco no Markdown.
 * Shift+Enter quebra sempre.
 */
export const enterNoCodigo =
  (sair: boolean): Command =>
  (state, dispatch) => {
    const bloco = noBloco(state);
    if (!bloco) return false;
    const { $from, empty } = state.selection;
    if (sair && empty && $from.parentOffset === bloco.content.size) {
      const texto = bloco.textContent;
      const quebra = texto.lastIndexOf('\n');
      const ultima = texto.slice(quebra + 1);
      const cerca = closes(ultima, bloco.attrs['cerca']);
      if ((quebra >= 0 && !ultima.trim()) || cerca) {
        if (dispatch) {
          const inicio = $from.start();
          const tr = state.tr.delete(inicio + Math.max(0, quebra), $from.pos);
          const at = tr.mapping.map($from.after());
          // (a linha nova continua no card de quem saiu dele; o Enter de novo sai do card)
          tr.insert(at, N['linha'].create({ recuo: bloco.attrs['recuo'], cartao: bloco.attrs['cartao'] }));
          dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
        }
        return true;
      }
    }
    return noCodigo(codeEnter)(state, dispatch);
  };

/** Tab e Shift+Tab no bloco: o recuo do código (não muda o nível do bloco), e a tecla nunca sai dele. */
const tabNoCodigo = (dir: 1 | -1): Command => noCodigo((s, o) => codeTab(s, dir, o));

/** Backspace no recuo do código: volta uma parada de uma vez (ver core/code-edit.ts). */
export const apagarRecuoDoCodigo: Command = noCodigo(codeBackspace);

/** Alt+seta: as linhas sobem e descem; Shift+Alt+seta: a cópia; Ctrl+Shift+K: saem. Fora do bloco, a tecla passa. */
const moverNoCodigo = (dir: 1 | -1): Command =>
  (state, dispatch) => !!noBloco(state) && (noCodigo((s) => codeMoveLines(s, dir))(state, dispatch) || true);
const duplicarNoCodigo = (dir: 1 | -1): Command => noCodigo((s) => codeDuplicateLines(s, dir));
const apagarLinhasDoCodigo: Command = noCodigo(codeDeleteLines);

/** Ctrl+/: comenta (ou tira o comentário), na linguagem do bloco. Sem saber como ela comenta, a tecla é a da Ajuda. */
export const comentarNoCodigo: Command = noCodigo(codeComment);

/** Home: o começo das letras da linha, e de novo, o começo da linha (com o Shift, a seleção vai junto). */
const homeNoCodigo =
  (estende: boolean): Command =>
  (state, dispatch) => {
    const bloco = noBloco(state);
    if (!bloco) return false;
    if (dispatch) {
      const { $from, anchor, head } = state.selection;
      const inicio = $from.start();
      const para = inicio + codeHome(bloco.textContent, head - inicio);
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, estende ? anchor : para, para)).scrollIntoView());
    }
    return true;
  };

/** Ctrl+A no bloco: primeiro as letras dele; de novo (já todas selecionadas), o texto inteiro. */
const selecionarNoCodigo: Command = (state, dispatch) => {
  const bloco = noBloco(state);
  if (!bloco) return false;
  const { $from, $to } = state.selection;
  if ($from.parentOffset === 0 && $to.parentOffset === bloco.content.size) return false;
  if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, $from.start(), $from.end())));
  return true;
};

/**
 * A seta para baixo na última linha do último bloco (ou para cima na primeira do primeiro): uma linha nova
 * do lado de fora, com o cursor nela. Sem isso, o bloco no fim do texto prendia o cursor.
 */
const setaParaFora =
  (dir: 1 | -1): Command =>
  (state, dispatch, view) => {
    const bloco = noBloco(state);
    const { $from, empty } = state.selection;
    if (!bloco || !empty) return false;
    const i = $from.index(0);
    if (dir > 0 ? i + 1 < state.doc.childCount : i > 0) return false;
    if (view && !view.endOfTextblock(dir > 0 ? 'down' : 'up')) return false;
    if (dispatch) dispatch(linhaNova(state, dir > 0 ? $from.after() : $from.before()));
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
const enterDaLinha: Command = (state, dispatch) => {
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
  // o bloco de código: "```" (ou "~~~") sozinho na linha e Enter (um atalho de digitação; o Ctrl+Z volta),
  // com a linguagem escrita logo depois ("```js"), como no Obsidian
  const cerca = sel.empty && node.type === N['linha'] && $from.parentOffset === node.content.size && !node.firstChild?.marks.length ? /^(`{3,}|~{3,})[ \t]*([^`~]*)$/.exec(node.textContent) : null;
  if (cerca) {
    if (dispatch) {
      const at = $from.before();
      const tr = state.tr.replaceWith(at, $from.after(), BC.create({ recuo, cartao: node.attrs['cartao'] ?? null, cerca: cerca[1], lingua: cerca[2].trim() }));
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
  // o item e a descrição dele (ver listas.ts): o próximo item, a lista que acaba
  if (enterNaLista(state, dispatch)) return true;
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

/** Enter: na célula da tabela, a de baixo (ver tabela.ts); no card, o dele (ver cartoes.ts); senão, o da linha. */
export const enter: Command = chainCommands(enterNaTabela(1), enterNoCartao, enterDaLinha);

/**
 * Backspace no começo de uma linha: o título, a citação e o sutil viram texto; o item perde o marcador
 * (fica texto no mesmo recuo); o texto recuado volta um nível (a descrição de um item sai dele). Com uma
 * peça logo em cima (a divisória, um trecho cru), a peça fica selecionada (de novo, ela sai), como no
 * Docs; a linha vazia sai junto. Senão, junta com a de cima.
 */
export const apagarNoComeco: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parentOffset > 0 || $from.depth !== 1) return false;
  const node = $from.parent;
  const pos = $from.before();
  // no começo do bloco de código, ele volta a ser texto (o vazio, uma linha vazia); com uma linha vazia em
  // cima, só ela sai, e o bloco sobe inteiro
  if (node.type === BC) {
    const cima = $from.index(0) > 0 ? state.doc.child($from.index(0) - 1) : null;
    if (cima?.type === N['linha'] && !cima.content.size && node.content.size) {
      if (dispatch) dispatch(state.tr.delete(pos - cima.nodeSize, pos).scrollIntoView());
      return true;
    }
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
  if (node.type === N['item']) {
    if (dispatch) dispatch(state.tr.setNodeMarkup(pos, N['linha'], { recuo: node.attrs['recuo'], fonte: null }));
    return true;
  }
  if (node.type === N['linha'] && node.attrs['recuo'] > 0) {
    if (dispatch) dispatch(state.tr.setNodeMarkup(pos, null, { ...node.attrs, recuo: recuoParaFora(state, $from.index(0), node.attrs['recuo']) }));
    return true;
  }
  const antes = $from.index(0) > 0 ? state.doc.child($from.index(0) - 1) : null;
  // a linha embaixo de um bloco de código não entra nele (as marcas dela não cabem): a vazia sai, e da que tem
  // texto o cursor só vai para o fim do bloco
  if (antes?.type === BC && node.type !== BC) {
    if (dispatch) {
      const tr = state.tr;
      if (!node.content.size) tr.delete(pos, $from.after());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, pos - 1)).scrollIntoView());
    }
    return true;
  }
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
  // no fim do bloco, ele também não engole o que vem embaixo: a linha vazia sai, e o resto fica como está
  if ($from.parent.type === BC && depois && !depois.isAtom) {
    if (dispatch && depois.type === N['linha'] && !depois.content.size) dispatch(state.tr.delete($from.after(), $from.after() + depois.nodeSize).scrollIntoView());
    return true;
  }
  if (!depois?.isAtom) return false;
  if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $from.after())).scrollIntoView());
  return true;
};

/**
 * O apagar: uma seleção que toca uma tabela só tira texto, e a tabela nunca se desmancha nem se junta a uma
 * linha pelo apagar (as lições do Android, ver tabela.ts); o resto, como numa linha.
 */
export const apagarParaTras: Command = chainCommands(undoInputRule, apagarSelecao, deleteSelection, apagarRecuoDoCodigo, apagarNaTabela(-1), apagarNoCartao, apagarNoComeco, entrarNaTabela(-1), joinBackward);
export const apagarParaFrente: Command = chainCommands(apagarSelecao, deleteSelection, apagarNaTabela(1), entrarNaTabela(1), apagarNoFim, joinForward, selectNodeForward);

/**
 * Tab e Shift+Tab: o texto e os itens entram ou saem um nível (o recuo de 2 em 2, sempre par, como no
 * Markdown). Só nas linhas de texto e nos itens: o título, a citação e o sutil recuados não são lidos
 * como eles mesmos. Com o cursor num item, a descrição e os itens de dentro vão junto; na descrição de
 * um item, o Shift+Tab a tira dele (ver `recuoParaFora`). Shift+Tab sem recuo nenhum é o de sempre do
 * navegador (o foco sai da folha: o Tab nunca prende).
 */
export const recuar =
  (dir: 1 | -1): Command =>
  (state, dispatch) => {
    const alvos = linhasDaSelecao(state).filter(([n]) => n.type === N['linha'] || n.type === N['item']);
    if (dir < 0 && alvos.every(([n]) => !n.attrs['recuo'])) return false;
    // numa peça (a seleção sem linha de texto), a tecla passa: o Tab nunca prende
    if (!linhasDaSelecao(state).length) return false;
    if (dispatch && alvos.length) {
      const tr = state.tr;
      if (alvos.length === 1) {
        const [n, pos] = alvos[0];
        const i = state.doc.resolve(pos).index(0);
        const r: number = n.attrs['recuo'];
        if (!recuarItem(state, tr, i, dir)) tr.setNodeMarkup(pos, null, { ...n.attrs, recuo: Math.min(40, dir > 0 ? paraFrente(r) : recuoParaFora(state, i, r)) });
      } else for (const [n, pos] of alvos) tr.setNodeMarkup(pos, null, { ...n.attrs, recuo: Math.min(40, dir > 0 ? paraFrente(n.attrs['recuo']) : paraTras(n.attrs['recuo'])) });
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
        // a linha em branco no meio de várias fica em branco; o "Texto normal" num item o deixa item
        // (como no Markdown, que só tira as marcas do título, da citação e do sutil)
        if (alvos.length > 1 && !n.textContent.trim()) continue;
        if (tipo === N['linha'] && n.type === N['item']) continue;
        // a linha de cima do card fica como está (o card se desfaz pelo menu dele)
        if (n.type === N['cartaoTopo']) continue;
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

/** Shift+Enter: na célula, a de cima; a quebra no bloco de código; num item (ou na descrição dele), a linha dentro dele; senão, o Enter. */
export const shiftEnter: Command = chainCommands(enterNaTabela(-1), enterNoCodigo(false), linhaNoItem, enter);

export const teclas = (): Plugin =>
  keymap({
    Enter: enter,
    'Shift-Enter': shiftEnter,
    Backspace: apagarParaTras,
    'Shift-Backspace': apagarParaTras,
    Delete: apagarParaFrente,
    Tab: chainCommands(tabNaPeca, tabNaTabela(1), tabNoCodigo(1), recuar(1)),
    'Shift-Tab': chainCommands(tabNaTabela(-1), tabNoCodigo(-1), recuar(-1)),
    // as de um editor de código, só dentro do bloco (fora dele, a tecla passa)
    'Mod-]': tabNoCodigo(1),
    'Mod-[': tabNoCodigo(-1),
    'Alt-ArrowUp': moverNoCodigo(-1),
    'Alt-ArrowDown': moverNoCodigo(1),
    'Shift-Alt-ArrowUp': duplicarNoCodigo(-1),
    'Shift-Alt-ArrowDown': duplicarNoCodigo(1),
    'Mod-Shift-k': apagarLinhasDoCodigo,
    'Mod-/': comentarNoCodigo,
    Home: homeNoCodigo(false),
    'Shift-Home': homeNoCodigo(true),
    ArrowUp: setaParaFora(-1),
    ArrowDown: setaParaFora(1),
    // tudo (e, apagado, o texto vira uma linha vazia: a tabela sai junto, como no Docs); no bloco, as letras dele primeiro
    'Mod-a': chainCommands(selecionarNoCodigo, selectAll),
    'Mod-b': marca(M['negrito']),
    'Mod-i': marca(M['italico']),
    'Mod-e': codigo,
    'Mod-Shift-x': marca(M['riscado']),
    'Mod-Shift-h': marca(M['marca']),
    'Mod-z': undo,
    'Mod-y': redo,
    'Shift-Mod-z': redo,
  });
