import { Mapping } from 'prosemirror-transform';
import { Node as PMNode } from 'prosemirror-model';
import { Command, EditorState, Plugin, PluginKey, TextSelection, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView, NodeView } from 'prosemirror-view';
import { CALLOUTS, CalloutFold, CalloutLook, calloutLook, calloutName, DEFAULT_CALLOUT } from '../../core/callouts';
import { calloutIcon } from '../callout-looks';
import { ICON } from '../icons';
import { schema } from './schema';
import { ciclo, desenho } from './controles';
import type { AcaoCartao, EstadoCartao } from './visual-api';

/**
 * O card no Visual (ver core/callouts.ts e PLANO-EDITOR-VISUAL.md): como o resto, sem árvore. A linha de
 * cima é o nó `cartaoTopo` (o título escrito direto nela), e as de dentro são as linhas de sempre (texto,
 * item, título, tabela, widget…) com o atributo `cartao`, a coluna do ">" do card: no texto, cada uma
 * ganha o "> " na frente (rich-doc.ts). O card vai da linha de cima até a última linha seguida com o
 * atributo.
 *
 * O papel é pintado linha por linha (as decorações daqui e o visual-editor.scss), com o mesmo desenho
 * da leitura (ui/_formatado.scss). Ficar dentro do card não depende de cada comando lembrar do
 * atributo: a linha que nasce dentro do card (o Enter, a lista, o colar, o estilo que troca o nó) fica
 * nele, pelo lugar (ver `cartoes`); só sair dele é dito (o Enter na última linha vazia, o "Desfazer o
 * card", o Backspace no começo da linha de cima), com a meta `CARTAO`.
 */

const N = schema.nodes;
const TOPO = N['cartaoTopo'];
const LINHA = N['linha'];
const CRU = N['cru'];

/** A transação que diz sozinha quem fica dentro do card (o lugar não decide por ela). */
export const CARTAO = 'vis-cartao';

const dentro = (n: PMNode): boolean => n.type !== TOPO && n.attrs['cartao'] != null;

/** Um card do documento: o índice e a posição da linha de cima, e onde acabam as de dentro. */
interface Card {
  topo: number;
  pos: number;
  /** O índice e o fim (a posição depois) da última linha de dentro; sem nenhuma, os da de cima. */
  ultimo: number;
  fim: number;
  node: PMNode;
}

export function cardsDe(doc: PMNode): Card[] {
  const out: Card[] = [];
  let atual: Card | null = null;
  doc.forEach((n, pos, i) => {
    if (n.type === TOPO) {
      atual = { topo: i, pos, ultimo: i, fim: pos + n.nodeSize, node: n };
      out.push(atual);
    } else if (atual && dentro(n)) {
      atual.ultimo = i;
      atual.fim = pos + n.nodeSize;
    } else atual = null;
  });
  return out;
}

/** O card onde está o nó de índice `i` (a linha de cima ou uma de dentro), ou null. */
export function cardEm(doc: PMNode, i: number): Card | null {
  return cardsDe(doc).find((c) => i >= c.topo && i <= c.ultimo) ?? null;
}

/** O índice do nó (de cima) da seleção, ou -1 fora de um. */
function indiceDe(state: EditorState): number {
  const $f = state.selection.$from;
  return $f.depth ? $f.index(0) : Math.min($f.index(0), state.doc.childCount - 1);
}

// ===== Quem fica dentro =====

/**
 * Depois de cada mudança: (1) o que nasceu entre a linha de cima e o fim de um card (contando o que
 * entrou no fim dele) fica dentro, na coluna dele; (2) a linha de dentro sem card em cima (a de cima
 * saiu) sai do card, e a de dentro fica na coluna da de cima. O (1) não vale na transação que diz
 * sozinha (`CARTAO`) nem nos ajustes fora do desfazer (o texto que chegou, o que o leitor leu).
 */
function quemFica(trs: readonly Transaction[], velho: EditorState, novo: EditorState): Transaction | null {
  if (!trs.some((t) => t.docChanged)) return null;
  const tr = novo.tr;
  const manual = trs.some((t) => t.getMeta(CARTAO) || t.getMeta('addToHistory') === false);
  if (!manual) {
    const mapa = new Mapping();
    for (const t of trs) mapa.appendMapping(t.mapping);
    // os lugares dos cards de antes, na ordem (o mapa não troca a ordem)
    const lugares = cardsDe(velho.doc)
      .filter((c) => c.ultimo > c.topo)
      .map((c) => ({ de: mapa.map(c.pos + c.node.nodeSize, 1), ate: mapa.map(c.fim, 1), col: c.node.attrs['recuo'] as number }));
    let k = 0;
    if (lugares.length)
      novo.doc.forEach((n, pos) => {
        while (k < lugares.length && lugares[k].ate < pos + n.nodeSize) k++;
        const l = lugares[k];
        if (l && pos >= l.de && n.type !== TOPO && n.type !== CRU && n.attrs['cartao'] == null) tr.setNodeMarkup(pos, null, { ...n.attrs, cartao: l.col });
      });
  }
  let col: number | null = null;
  tr.doc.forEach((n, pos) => {
    if (n.type === TOPO) {
      col = n.attrs['recuo'];
      // a linha de cima nunca está dentro de outro card
      if (n.attrs['cartao'] != null) tr.setNodeMarkup(pos, null, { ...n.attrs, cartao: null });
      return;
    }
    if (n.attrs['cartao'] == null) {
      col = null;
      return;
    }
    if (n.type === CRU) return;
    if (col === null) tr.setNodeMarkup(pos, null, { ...n.attrs, cartao: null });
    else if (n.attrs['cartao'] !== col) tr.setNodeMarkup(pos, null, { ...n.attrs, cartao: col });
  });
  return tr.docChanged ? tr.setMeta('addToHistory', trs.every((t) => t.getMeta('addToHistory') !== false)) : null;
}

// ===== O desenho =====

const DESENHO = new PluginKey<{ chave: string; deco: DecorationSet }>('vis-cartoes');

/** Cada linha de dentro com a classe do papel (e a cor do jeito), a última com o pé rasgado. */
function desenhar(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  for (const c of cardsDe(doc)) {
    const jeito = calloutLook(c.node.attrs['tipo']);
    if (c.ultimo === c.topo) decos.push(Decoration.node(c.pos, c.fim, { class: 'vis-cartao-fim' }));
    let pos = c.pos + c.node.nodeSize;
    for (let i = c.topo + 1; i <= c.ultimo; i++) {
      const n = doc.child(i);
      decos.push(Decoration.node(pos, pos + n.nodeSize, { class: 'vis-no-cartao' + (i === c.ultimo ? ' vis-cartao-fim' : ''), 'data-jeito': jeito }));
      pos += n.nodeSize;
    }
  }
  return DecorationSet.create(doc, decos);
}

/**
 * O que muda o papel: a linha de cima (e o jeito dela) e quem está dentro, linha a linha. As letras não
 * mudam nada: o desenho só anda com elas.
 */
function estrutura(doc: PMNode): string {
  let k = '';
  doc.forEach((n) => (k += n.type === TOPO ? `[${n.attrs['tipo']}` : n.attrs['cartao'] != null ? '>' : '.'));
  return k;
}

/** O plugin do card: quem fica dentro (a cada mudança) e o papel pintado nas linhas. */
export function cartoes(): Plugin {
  return new Plugin<{ chave: string; deco: DecorationSet }>({
    key: DESENHO,
    state: {
      init: (_c, state) => ({ chave: estrutura(state.doc), deco: desenhar(state.doc) }),
      apply: (tr, velho) => {
        if (!tr.docChanged) return velho;
        const chave = estrutura(tr.doc);
        return { chave, deco: chave === velho.chave ? velho.deco.map(tr.mapping, tr.doc) : desenhar(tr.doc) };
      },
    },
    appendTransaction: quemFica,
    props: {
      // o card do cursor ganha os botões do jeito e do fechar (ver CartaoView)
      decorations: (state) => {
        const deco = DESENHO.getState(state)?.deco;
        const c = topoDoCursor(state);
        return c && deco ? deco.add(state.doc, [Decoration.node(c.pos, c.pos + c.node.nodeSize, { class: 'vis-cartao-ativo' })]) : deco;
      },
    },
  });
}

/** A linha de cima do card onde está o cursor (de baixo para cima, só pelo card dele), ou null. */
function topoDoCursor(state: EditorState): { pos: number; node: PMNode } | null {
  const doc = state.doc;
  let i = indiceDe(state);
  if (i < 0 || i >= doc.childCount) return null;
  let pos = state.selection.$from.posAtIndex(i, 0);
  for (;;) {
    const n = doc.child(i);
    if (n.type === TOPO) return { pos, node: n };
    if (!dentro(n) || i === 0) return null;
    i--;
    pos -= doc.child(i).nodeSize;
  }
}

/** Como o card fica na leitura, na ordem em que o botão anda (os nomes do menu "Card" da régua). */
const DOBRAS: readonly { valor: CalloutFold; nome: string; curto: string }[] = [
  { valor: '', nome: 'Sempre aberto', curto: 'Aberto' },
  { valor: '+', nome: 'Fecha, começa aberto', curto: 'Abre e fecha' },
  { valor: '-', nome: 'Começa fechado', curto: 'Fechado' },
];

// ===== A linha de cima na tela =====

/**
 * A linha de cima do card: o desenho do jeito na frente (só desenho), o título escrito direto e, no card
 * que fecha, a setinha (na escrita, ele fica sempre aberto). Sem título, a linha mostra o nome do jeito,
 * apagado, como o que vai aparecer na leitura. Com o cursor no card, dois botões presos na beirada de
 * cima do papel, à direita (ver controles.ts): o jeito, que anda pelos nove a cada toque, e como ele fica
 * na leitura (sempre aberto, fecha começando aberto, começa fechado). O menu "Card" da régua faz o mesmo.
 */
export class CartaoView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly icone: HTMLElement;
  private readonly seta: HTMLElement;
  private readonly controles: HTMLElement;
  private tipo = '';
  /** O jeito e o fechar que os botões mostram (refeitos só quando um dos dois muda). */
  private feitos = '';

  constructor(
    private node: PMNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'linha vis-cartao-topo';
    this.icone = document.createElement('span');
    this.icone.className = 'vis-cartao-icone';
    this.icone.contentEditable = 'false';
    this.icone.setAttribute('aria-hidden', 'true');
    this.contentDOM = document.createElement('span');
    this.contentDOM.className = 'vis-cartao-titulo';
    this.seta = document.createElement('span');
    this.seta.className = 'vis-cartao-seta';
    this.seta.contentEditable = 'false';
    this.seta.setAttribute('aria-hidden', 'true');
    this.seta.append(desenho(ICON.abrir));
    this.controles = document.createElement('span');
    this.controles.className = 'vis-controles vis-cartao-controles';
    this.controles.contentEditable = 'false';
    this.controles.setAttribute('role', 'toolbar');
    this.controles.setAttribute('aria-label', 'Jeito do card');
    this.dom.append(this.icone, this.contentDOM, this.seta, this.controles);
    this.desenha();
  }

  /** Os botões do jeito e do fechar, com o que o card tem agora. */
  private desenhaControles(): void {
    const tipo: string = this.node.attrs['tipo'];
    const dobra: CalloutFold = this.node.attrs['dobra'] || '';
    const jeito = calloutLook(tipo);
    if (this.feitos === `${jeito}|${dobra}`) return;
    this.feitos = `${jeito}|${dobra}`;
    this.controles.replaceChildren(
      ciclo({
        rotulo: 'Jeito do card',
        opcoes: CALLOUTS.map((c) => ({ valor: c.look, nome: c.name })),
        at: CALLOUTS.findIndex((c) => c.look === jeito),
        icone: ICON.paleta,
        giro: '-1.2deg',
        escolhe: (v) => this.muda({ tipo: v }),
      }),
      ciclo({
        rotulo: 'Na leitura',
        opcoes: DOBRAS,
        at: DOBRAS.findIndex((d) => d.valor === dobra),
        icone: ICON.card,
        giro: '0.9deg',
        escolhe: (v) => this.muda({ dobra: v }),
      }),
    );
  }

  /** O card com o jeito (ou o fechar) trocado; o cursor fica onde está. */
  private muda(attrs: { tipo?: string; dobra?: string }): void {
    const pos = this.getPos();
    if (pos === undefined || !this.view.editable) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, ...attrs }).setMeta(CARTAO, true));
    this.view.focus();
  }

  private desenha(): void {
    const a = this.node.attrs;
    if (a['tipo'] !== this.tipo) {
      this.tipo = a['tipo'];
      this.icone.replaceChildren(desenho(calloutIcon(this.tipo)));
    }
    this.dom.dataset['tipo'] = this.tipo;
    this.dom.dataset['jeito'] = calloutLook(this.tipo);
    this.dom.dataset['dobra'] = a['dobra'] || '';
    this.dom.classList.toggle('vazio', !this.node.content.size);
    this.contentDOM.dataset['vazio'] = calloutName(this.tipo);
    this.seta.hidden = !a['dobra'];
    this.seta.title = a['dobra'] === '-' ? 'Começa fechado na leitura' : 'Fecha na leitura';
    this.desenhaControles();
  }

  /** Os botões são deles: o toque não põe o cursor na linha. */
  stopEvent(e: Event): boolean {
    return this.controles.contains(e.target as Node | null);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.desenha();
    return true;
  }

  ignoreMutation(m: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (m.type === 'selection') return false;
    if (this.icone.contains(m.target) || this.seta.contains(m.target) || this.controles.contains(m.target)) return true;
    return m.type === 'attributes' && m.target === this.dom;
  }
}

// ===== As teclas =====

/**
 * Enter no card: na linha de cima, o que vem depois do cursor desce para a primeira linha de dentro (no
 * começo do título, uma linha vazia entra em cima do card); na última linha de dentro vazia, ela sai do
 * card (como a lista que acaba no item vazio). False: o Enter de sempre (a linha nova fica no card).
 */
export const enterNoCartao: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || sel.$from.depth !== 1 || !sel.$from.sameParent(sel.$to)) return false;
  const node = sel.$from.parent;
  const i = sel.$from.index(0);
  if (node.type === TOPO) {
    if (!dispatch) return true;
    const tr = state.tr.deleteSelection();
    const $p = tr.selection.$from;
    if ($p.parentOffset === 0 && node.content.size && sel.empty) {
      tr.insert($p.before(), LINHA.create());
    } else {
      tr.split($p.pos, 1, [{ type: LINHA, attrs: { recuo: 0, fonte: null, cartao: node.attrs['recuo'] } }]);
    }
    dispatch(tr.setMeta(CARTAO, true).scrollIntoView());
    return true;
  }
  const card = dentro(node) ? cardEm(state.doc, i) : null;
  if (!card || card.ultimo !== i || node.type !== LINHA || node.content.size || !sel.empty) return false;
  if (dispatch) dispatch(state.tr.setNodeMarkup(sel.$from.before(), null, { ...node.attrs, cartao: null, recuo: 0, fonte: null }).setMeta(CARTAO, true).scrollIntoView());
  return true;
};

/**
 * Backspace no começo da linha de cima: o card se desfaz (o título vira uma linha de texto, e as de
 * dentro ficam no texto, sem o papel), como o "Desfazer o card" da régua. O Ctrl+Z o traz de volta.
 */
export const apagarNoCartao: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth !== 1 || $from.parent.type !== TOPO || $from.parentOffset > 0) return false;
  if (dispatch) dispatch(desfazer(state, indiceDe(state)).scrollIntoView());
  return true;
};

// ===== O que a régua pede (o menu "Card") =====

/** O card do cursor, para o menu "Card" da régua (ele aparece com ele). */
export function estadoCartao(state: EditorState): EstadoCartao | null {
  const c = cardEm(state.doc, indiceDe(state));
  if (!c) return null;
  const tipo: string = c.node.attrs['tipo'];
  return { tipo, jeito: calloutLook(tipo), dobra: c.node.attrs['dobra'] };
}

/** O card desfeito: o título vira uma linha de texto (sem título, ela sai) e as de dentro ficam fora. */
function desfazer(state: EditorState, i: number): Transaction {
  const tr = state.tr.setMeta(CARTAO, true);
  const c = cardEm(state.doc, i);
  if (!c) return tr;
  let pos = c.pos + c.node.nodeSize;
  for (let k = c.topo + 1; k <= c.ultimo; k++) {
    const n = state.doc.child(k);
    if (n.type !== CRU) tr.setNodeMarkup(pos, null, { ...n.attrs, cartao: null, fonte: null });
    pos += n.nodeSize;
  }
  const tinhaCursor = state.selection.$from.depth === 1 && state.selection.$from.index(0) === c.topo;
  if (c.node.content.size || c.ultimo === c.topo) {
    tr.setNodeMarkup(c.pos, LINHA, { recuo: c.node.attrs['recuo'], fonte: null });
    if (tinhaCursor) tr.setSelection(TextSelection.create(tr.doc, c.pos + 1));
  } else {
    tr.delete(c.pos, c.pos + c.node.nodeSize);
    if (tinhaCursor) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(c.pos + 1, tr.doc.content.size))));
  }
  return tr;
}

/**
 * Um card novo: com várias linhas selecionadas (ou uma linha escrita selecionada), elas vão para dentro
 * dele; senão, ele entra no lugar da linha vazia do cursor ou embaixo da linha (ou do card) do cursor,
 * com uma linha vazia dentro. O cursor fica no título.
 */
function novo(state: EditorState, jeito: CalloutLook): Transaction {
  const tr = state.tr.setMeta(CARTAO, true);
  const topo = (recuo: number) => TOPO.create({ recuo, tipo: jeito, dobra: '' });
  const { from, to, empty } = state.selection;
  const alvos: [PMNode, number][] = [];
  // as linhas de que a seleção pega alguma coisa (a que ela só toca no começo ou no fim, não)
  if (!empty)
    state.doc.forEach((n, pos) => {
      const [de, ate] = n.isTextblock ? [pos + 1, pos + n.nodeSize - 1] : [pos, pos + n.nodeSize];
      if (ate > from && de < to) alvos.push([n, pos]);
    });
  const escritos = alvos.filter(([n]) => n.type !== TOPO && (n.textContent.trim() || n.isAtom));
  if (escritos.length) {
    // as linhas da seleção vão para dentro (a linha de cima de um card que estava nela, como texto)
    for (const [n, pos] of alvos) {
      if (n.type === TOPO) tr.setNodeMarkup(pos, LINHA, { recuo: 0, fonte: null, cartao: 0 });
      else if (n.type !== CRU) tr.setNodeMarkup(pos, null, { ...n.attrs, cartao: 0, fonte: null });
    }
    const at = alvos[0][1];
    tr.insert(at, topo(0));
    return tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
  }
  const i = indiceDe(state);
  const aqui = state.doc.maybeChild(i);
  let pos = 0;
  state.doc.forEach((n, p, k) => {
    if (k === i) pos = p;
  });
  const vazia = aqui?.type === LINHA && !aqui.content.size && aqui.attrs['cartao'] == null;
  const card = cardEm(state.doc, i);
  const at = vazia ? pos : card ? card.fim : pos + (aqui?.nodeSize ?? 0);
  if (vazia) tr.delete(pos, pos + aqui!.nodeSize);
  tr.insert(at, [topo(0), LINHA.create({ cartao: 0 })]);
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
}

/** O comando de uma ação do menu "Card" da régua. */
export function acaoCartao(acao: AcaoCartao): Command {
  return (state, dispatch) => {
    if (acao === 'novo' || (typeof acao === 'object' && 'novo' in acao)) {
      if (dispatch) dispatch(novo(state, acao === 'novo' ? DEFAULT_CALLOUT : acao.novo));
      return true;
    }
    const i = indiceDe(state);
    const c = cardEm(state.doc, i);
    if (!c) return false;
    if (!dispatch) return true;
    if (acao === 'desfazer') {
      dispatch(desfazer(state, i).scrollIntoView());
      return true;
    }
    const attrs = 'jeito' in acao ? { tipo: acao.jeito } : { dobra: acao.dobra };
    dispatch(state.tr.setNodeMarkup(c.pos, null, { ...c.node.attrs, ...attrs }).setMeta(CARTAO, true));
    return true;
  };
}
