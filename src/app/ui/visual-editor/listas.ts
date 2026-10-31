import { Node as PMNode } from 'prosemirror-model';
import { Command, EditorState, Plugin, PluginKey, PluginSpec, TextSelection, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView, NodeView } from 'prosemirror-view';
import { Escrita } from '../../core/rich-doc';
import { Block, bodyIndent, bodyOf, indentOf, itemEnd, lineKind, linesOf, nextNumber, ownerItem, parseRich, renumberAfter } from '../../core/rich-text';
import { linkarEndereco } from './links';
import { schema, textoDoCru } from './schema';

/**
 * As listas e as tarefas no Visual (PLANO-EDITOR-VISUAL.md, 5.1, 5.4, 5.6, 5.9, 5.12): o item é uma linha
 * do texto, com o nível no recuo (como no texto); o que ela significa no contexto (o número que aparece,
 * a descrição embaixo do item, a tarefa feita que risca a descrição junto) não é guardado no nó: é lido
 * do texto escrito pelo próprio leitor (`parseRich`), como a leitura lê, e vira decoração. As teclas
 * (Enter, Shift+Enter, Backspace, Tab) perguntam ao texto escrito com as mesmas funções do Markdown
 * (`ownerItem`, `bodyIndent`, `itemEnd`, `nextNumber`, `renumberAfter` de core/rich-text.ts): os dois
 * modos fazem a mesma coisa com a lista.
 */

const N = schema.nodes;
const ITEM = N['item'];
const LINHA = N['linha'];
export type TipoLista = 'ul' | 'ol' | 'check';

// ===== O texto escrito, para perguntar ao leitor =====

type Escritor = (doc: PMNode) => Escrita;
const ESCRITOR = new PluginKey('vis-escritor');
interface SpecEscritor extends PluginSpec<unknown> {
  escrever: Escritor;
}

/**
 * O tradutor do Visual (o `escrever` dele, com as fontes guardadas), à mão dos comandos. Mora na spec do
 * plugin, não no estado: o estado passa de uma folha para a outra (a tela cheia, `reconfigure`) com os
 * campos dos plugins de mesma chave, e o escritor tem de ser o da folha de agora.
 */
export const escritor = (f: Escritor): Plugin => new Plugin({ key: ESCRITOR, escrever: f } as SpecEscritor);

/**
 * O documento como texto, linha a linha: `linhas` (as do texto escrito), `primeira` (a linha do texto
 * onde cada nó começa) e `no` (o nó de cada linha do texto). Null se a escrita não é exata (o
 * documento ainda vai se ajustar ao que o leitor lê).
 */
export interface Mapa {
  linhas: string[];
  primeira: number[];
  no: number[];
  texto: string;
}

export function mapaDe(state: EditorState, doc: PMNode = state.doc): Mapa | null {
  const escrever = (ESCRITOR.get(state)?.spec as SpecEscritor | undefined)?.escrever;
  return escrever ? mapaDoTexto(doc, escrever) : null;
}

function mapaDoTexto(doc: PMNode, escrever: Escritor): Mapa | null {
  const e = escrever(doc);
  if (!e.exato || e.doc.linhas.length !== doc.childCount) return null;
  const primeira: number[] = [];
  const no: number[] = [];
  e.doc.linhas.forEach((l, i) => {
    primeira.push(no.length);
    const n = linesOf(l.fonte!.texto).length;
    for (let k = 0; k < n; k++) no.push(i);
  });
  return { linhas: linesOf(e.texto), primeira, no, texto: e.texto };
}

/** Onde começa o nó `i` do documento. */
export function posDoNo(doc: PMNode, i: number): number {
  let pos = 0;
  for (let k = 0; k < i; k++) pos += doc.child(k).nodeSize;
  return pos;
}

/** O número do item seguinte ao de número `numero` ("3" depois de "2", "1.3" depois de "1.2"), como o Markdown. */
const proximo = (numero: string) => nextNumber(`${numero || '1'}. x`);

/** Os atributos do item novo que vem depois de `dono` (o mesmo tipo; a tarefa por fazer; o número seguinte). */
function itemDepois(dono: PMNode): Record<string, unknown> {
  const tipo = dono.attrs['tipo'] as TipoLista;
  return { recuo: dono.attrs['recuo'], fonte: null, tipo, feita: false, numero: tipo === 'ol' ? proximo(dono.attrs['numero']) : '' };
}

/**
 * Depois de um item numerado entrar (ou descer) no nó `i`, os de baixo da mesma lista que vinham na
 * sequência descem um número, exatamente como o Enter do Markdown faz (`renumberAfter`). `was`: o número
 * que o próprio nó tinha, quando foi ele que desceu (os de dentro dele vão junto).
 */
function renumerar(state: EditorState, tr: Transaction, i: number, was?: string): void {
  const m = mapaDe(state, tr.doc);
  if (!m || i >= tr.doc.childCount) return;
  const out = renumberAfter(m.linhas, m.primeira[i], was);
  for (let j = 0; j < out.length; j++) {
    if (out[j] === m.linhas[j]) continue;
    const k = m.no[j];
    const n = tr.doc.child(k);
    const lk = lineKind(out[j]);
    if (m.primeira[k] !== j || n.type !== ITEM || lk.kind !== 'ol') continue;
    tr.setNodeMarkup(posDoNo(tr.doc, k), null, { ...n.attrs, numero: lk.pre + lk.n });
  }
}

/** As marcas que continuam na linha nova (as inclusivas, como no Docs). Por último: um passo depois as apaga. */
function manterMarcas(state: EditorState, tr: Transaction): void {
  const { $from } = state.selection;
  const marcas = state.storedMarks || ($from.parentOffset ? $from.marks() : null);
  if (marcas) tr.ensureMarks(marcas.filter((m) => m.type.spec.inclusive !== false));
}

/** O item de quem a linha `i` é a descrição (o nó dele), ou null. */
function donoDe(state: EditorState, m: Mapa, i: number): number | null {
  const row = m.primeira[i];
  const dono = ownerItem(m.linhas, row);
  if (dono === null || dono === row) return null;
  const k = m.no[dono];
  return m.primeira[k] === dono && state.doc.child(k).type === ITEM ? k : null;
}

// ===== As teclas =====

/**
 * Enter num item ou na descrição dele (a tabela 5.9 do plano, como o Markdown faz). No item com texto,
 * o item novo do mesmo tipo (a tarefa nova por fazer; o número seguinte, os de baixo descem); no fim de
 * um item com descrição, o novo vem depois dela. No começo de um item com texto, um item vazio entra em
 * cima. No item vazio, a lista acaba ali (a linha vira texto). Na descrição, o próximo item. False: não
 * é com a lista (o Enter de sempre).
 */
export const enterNaLista: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || sel.$from.depth !== 1) return false;
  const node = sel.$from.parent;
  if (node.type === ITEM) return enterNoItem(state, dispatch);
  if (node.type !== LINHA || !sel.empty) return false;
  // a descrição de um item (a linha recuada embaixo dele): o próximo item
  const m = mapaDe(state);
  const i = sel.$from.index(0);
  const k = m && donoDe(state, m, i);
  if (k == null) return false;
  if (dispatch) {
    const novo = itemDepois(state.doc.child(k));
    const tr = state.tr;
    const pos = sel.$from.before();
    if (!node.textContent.trim()) {
      // a linha do corpo vazia vira o item ali mesmo
      tr.replaceWith(pos, pos + node.nodeSize, ITEM.create(novo));
      tr.setSelection(TextSelection.create(tr.doc, pos + 1));
      renumerar(state, tr, i);
    } else {
      linkarEndereco(tr, sel.$from.pos, state);
      tr.split(tr.mapping.map(sel.$from.pos), 1, [{ type: ITEM, attrs: novo }]);
      renumerar(state, tr, i + 1);
      manterMarcas(state, tr);
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
};

const enterNoItem: Command = (state, dispatch) => {
  const sel = state.selection;
  const item = sel.$from.parent;
  // o item vazio: a lista acaba ali (a linha vira texto, sem recuo), como no Markdown
  if (sel.empty && !item.textContent.trim()) {
    if (dispatch) {
      const pos = sel.$from.before();
      const tr = state.tr.replaceWith(pos, pos + item.nodeSize, LINHA.create());
      dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView());
    }
    return true;
  }
  if (!dispatch) return true;
  const tr = state.tr;
  if (sel.empty) linkarEndereco(tr, sel.$from.pos, state);
  else tr.deleteSelection();
  const $p = tr.selection.$from;
  const aqui = $p.parent;
  const idx = $p.index(0);
  if ($p.depth !== 1 || aqui.type !== ITEM) {
    tr.split($p.pos);
    dispatch(tr.scrollIntoView());
    return true;
  }
  const pos = $p.before();
  if ($p.parentOffset === 0 && aqui.content.size) {
    // no começo de um item com texto: um item vazio em cima (a tarefa por fazer), e este desce inteiro;
    // o de cima fica com o número deste, este ganha o seguinte e leva os de baixo junto
    tr.insert(pos, ITEM.create({ ...aqui.attrs, fonte: null, feita: false }));
    if (aqui.attrs['tipo'] === 'ol') {
      tr.setNodeMarkup(pos + 2, null, { ...aqui.attrs, numero: proximo(aqui.attrs['numero']) });
      renumerar(state, tr, idx + 1, aqui.attrs['numero']);
    }
  } else {
    const novo = itemDepois(aqui);
    // no fim de um item com descrição: o novo entra depois dela (que continua dele)
    const m = $p.parentOffset === aqui.content.size ? mapaDe(state, tr.doc) : null;
    const fim = m ? m.no[itemEnd(m.linhas, m.primeira[idx])] : idx;
    if (fim > idx) {
      const at = posDoNo(tr.doc, fim) + tr.doc.child(fim).nodeSize;
      tr.insert(at, ITEM.create(novo));
      tr.setSelection(TextSelection.create(tr.doc, at + 1));
      renumerar(state, tr, fim + 1);
    } else {
      tr.split($p.pos, 1, [{ type: ITEM, attrs: novo }]);
      renumerar(state, tr, idx + 1);
    }
    manterMarcas(state, tr);
  }
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Shift+Enter num item ou na descrição dele (e "Linha dentro do item"): uma linha nova dentro do mesmo
 * item, no recuo do texto dele (`bodyIndent`, como o Markdown): a descrição. Fora de lista, false.
 */
export const linhaNoItem: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || sel.$from.depth !== 1) return false;
  const node = sel.$from.parent;
  if (!node.isTextblock || node.type.spec.code) return false;
  const m = mapaDe(state);
  const ind = m && bodyIndent(m.linhas, m.primeira[sel.$from.index(0)]);
  if (ind == null) return false;
  if (dispatch) {
    const tr = state.tr;
    if (!sel.empty) tr.deleteSelection();
    tr.split(tr.selection.from, 1, [{ type: LINHA, attrs: { recuo: Math.min(40, indentOf(ind + 'x')), fonte: null } }]);
    manterMarcas(state, tr);
    dispatch(tr.scrollIntoView());
  }
  return true;
};

/** Ctrl+Alt+Enter: marca ou desmarca a tarefa do cursor (ou a de quem a linha é a descrição). */
export const marcarTarefa: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth !== 1) return false;
  let k: number | null = $from.index(0);
  if (state.doc.child(k).type !== ITEM) {
    const m = mapaDe(state);
    k = m && donoDe(state, m, k);
  }
  if (k == null) return false;
  const n = state.doc.child(k);
  if (n.type !== ITEM || n.attrs['tipo'] !== 'check') return false;
  if (dispatch) dispatch(state.tr.setNodeMarkup(posDoNo(state.doc, k), null, { ...n.attrs, feita: !n.attrs['feita'] }).scrollIntoView());
  return true;
};

/** O recuo seguinte de 2 em 2, sempre num número par (3 → 4), como o Tab do Markdown. */
export const paraFrente = (r: number) => r + (r % 2 ? 1 : 2);
export const paraTras = (r: number) => Math.max(0, r - (r % 2 ? 1 : 2));

/**
 * Um nível para fora, para a linha de texto `i` (de recuo `r`): na descrição de um item, ela sai dele
 * (o recuo par logo abaixo da coluna onde a descrição dele começa, a de um nível acima); senão, 2
 * colunas. Assim cada passo muda o que se vê (na descrição, de 2 em 2 o recuo podia não mudar nada).
 */
export function recuoParaFora(state: EditorState, i: number, r: number): number {
  const m = mapaDe(state);
  const k = m && donoDe(state, m, i);
  if (k == null) return paraTras(r);
  const d: number = state.doc.child(k).attrs['recuo'];
  return Math.min(paraTras(r), d + 1 - ((d + 1) % 2));
}

/** O que anda junto com o item no Tab: a descrição e os itens de dentro (o resto, o bloco de código e os trechos crus, não). */
const ANDAM = new Set(['linha', 'item', 'titulo', 'citacao', 'sutil', 'divisoria']);

/**
 * Tab e Shift+Tab num item: ele muda de nível (2 colunas, sempre par) e o que vem embaixo dele vai junto
 * (a descrição e os itens de dentro), como no Docs. Com um bloco de código ou um trecho cru no corpo,
 * só ele anda (como no Markdown). Devolve false se não é um item.
 */
export function recuarItem(state: EditorState, tr: Transaction, i: number, dir: 1 | -1): boolean {
  const n = state.doc.child(i);
  if (n.type !== ITEM) return false;
  const r: number = n.attrs['recuo'];
  const novo = Math.min(40, dir > 0 ? paraFrente(r) : paraTras(r));
  const delta = novo - r;
  tr.setNodeMarkup(posDoNo(state.doc, i), null, { ...n.attrs, recuo: novo });
  const m = mapaDe(state);
  if (!m || !delta) return true;
  const fim = m.no[itemEnd(m.linhas, m.primeira[i])];
  const corpo: number[] = [];
  for (let k = i + 1; k <= fim; k++) corpo.push(k);
  if (corpo.every((k) => ANDAM.has(state.doc.child(k).type.name)))
    for (const k of corpo) {
      const c = state.doc.child(k);
      if (c.type === LINHA && !c.textContent.trim() && !c.attrs['recuo']) continue;
      tr.setNodeMarkup(posDoNo(state.doc, k), null, { ...c.attrs, recuo: Math.max(0, Math.min(40, c.attrs['recuo'] + delta)) });
    }
  if (n.attrs['tipo'] === 'ol') numeroNoNivel(state, tr, i);
  return true;
}

/**
 * O item numerado que mudou de nível ganha o número do lugar novo, como no Docs: o seguinte ao do item
 * de cima no mesmo nível (a mesma lista), ou 1 numa lista nova; os de baixo da lista nova seguem
 * (`renumberAfter`). Na tela o número é sempre o da leitura; assim o texto também conta certo.
 */
function numeroNoNivel(state: EditorState, tr: Transaction, i: number): void {
  const m = mapaDe(state, tr.doc);
  if (!m) return;
  const row = m.primeira[i];
  const w = indentOf(m.linhas[row]);
  let numero = '1';
  for (let j = row - 1; j >= 0; j--) {
    const l = m.linhas[j];
    if (!l.trim() || indentOf(l) > w) continue;
    const k = lineKind(l);
    if (indentOf(l) === w && k.kind === 'ol') numero = proximo(k.pre + k.n);
    break;
  }
  const n = tr.doc.child(i);
  const era: string = n.attrs['numero'];
  if (era === numero) return;
  tr.setNodeMarkup(posDoNo(tr.doc, i), null, { ...n.attrs, numero });
  renumerar(state, tr, i, era);
}

/**
 * A régua e o Ctrl+Shift+7/8/9 nas linhas da seleção, com a regra do `list()` do Markdown: se todas já
 * são do tipo, voltam a ser texto; senão viram do tipo (a numerada contando 1, 2, 3 a partir da
 * primeira; a linha em branco no meio de várias fica em branco). O título, a citação e o sutil viram
 * itens com as letras deles; o bloco de código e as peças ficam.
 */
export const lista =
  (tipo: TipoLista): Command =>
  (state, dispatch) => {
    const { from, to } = state.selection;
    const alvos: [PMNode, number][] = [];
    state.doc.nodesBetween(from, to, (n, pos) => {
      if (n.isTextblock && !n.type.spec.code) alvos.push([n, pos]);
      return false;
    });
    if (!alvos.length) return false;
    // (a linha em branco no meio de várias não conta: ela fica em branco de um jeito e do outro)
    const todos = alvos.every(([n]) => (n.type === ITEM && n.attrs['tipo'] === tipo) || (alvos.length > 1 && n.type !== ITEM && !n.textContent.trim()));
    if (dispatch) {
      const tr = state.tr;
      let conta = 0;
      for (const [n, pos] of alvos) {
        if (todos) tr.setNodeMarkup(pos, LINHA, { recuo: n.attrs['recuo'], fonte: null });
        else if (alvos.length === 1 || n.textContent.trim()) tr.setNodeMarkup(pos, ITEM, { recuo: n.attrs['recuo'] ?? 0, fonte: null, tipo, feita: false, numero: tipo === 'ol' ? String(++conta) : '' });
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

// ===== O desenho: os números, o corpo e a feita, lidos pelo leitor =====

interface Papel {
  /** O recuo da descrição na tela, em "em" da letra da folha (o lugar do marcador de cada item de fora). */
  corpo: number;
  /** As colunas do recuo que o corpo do item come (o resto aparece, como na leitura). */
  tira: number;
  /** Na descrição de uma tarefa feita (riscada junto). */
  feita: boolean;
}

/** O lugar do marcador de cada lista (os mesmos da leitura, ui/_formatado.scss): onde o texto e o corpo começam. */
function lugar(b: Extract<Block, { kind: 'ul' | 'ol' | 'check' }>): number {
  return b.kind === 'ol' ? 1.7 + (b.pre?.length ?? 0) * 0.33 : 1.35;
}

/** As decorações das listas: o número de cada item numerado, o lugar e o risco de cada descrição. */
function desenhar(doc: PMNode, m: Mapa): DecorationSet {
  const papel: (Papel | undefined)[] = [];
  const numero: (string | undefined)[] = [];
  const preN: number[] = [];
  const andar = (blocks: readonly Block[], fora: Papel) => {
    for (const b of blocks) {
      if (b.kind !== 'ul' && b.kind !== 'ol' && b.kind !== 'check') continue;
      b.items.forEach((it, k) => {
        const i = m.no[it.line];
        if (i === undefined || m.primeira[i] !== it.line) return;
        papel[i] = fora;
        if (b.kind === 'ol') {
          numero[i] = (b.pre ?? '') + (b.start + k) + '.';
          preN[i] = b.pre?.length ?? 0;
        }
        const corpo = it.body && bodyOf(m.linhas, it.line);
        if (!corpo) return;
        const dentro: Papel = { corpo: fora.corpo + lugar(b), tira: corpo.indent, feita: fora.feita || !!it.done };
        for (let j = it.line + 1; j <= corpo.end; j++) if (m.primeira[m.no[j]] === j) papel[m.no[j]] = dentro;
        andar(it.body!, dentro);
      });
    }
  };
  andar(parseRich(m.texto), { corpo: 0, tira: 0, feita: false });
  const decos: Decoration[] = [];
  let pos = 0;
  doc.forEach((n, _o, i) => {
    const p = papel[i];
    const classes = [p?.feita ? 'vis-feita' : ''].filter(Boolean);
    const estilo = [p?.corpo ? `--vis-corpo: ${+p.corpo.toFixed(3)}` : '', p?.tira ? `--vis-tira: ${p.tira}` : '', preN[i] ? `--pre-n: ${preN[i]}` : ''].filter(Boolean);
    if (classes.length || estilo.length || numero[i] !== undefined)
      decos.push(
        Decoration.node(pos, pos + n.nodeSize, {
          ...(classes.length ? { class: classes.join(' ') } : {}),
          ...(estilo.length ? { style: estilo.join('; ') } : {}),
          ...(numero[i] !== undefined ? { 'data-n': numero[i]! } : {}),
        }),
      );
    pos += n.nodeSize;
  });
  return DecorationSet.create(doc, decos);
}

/**
 * O que muda o papel das linhas na leitura: os nós, o tipo, o recuo, o número e a feita do item, a linha
 * que passa de vazia a escrita (a linha em branco deixa o corpo continuar; escrita sem recuo, o corta)
 * e o texto dos trechos crus. As outras letras não mudam nada (a escrita escapa o que viraria bloco).
 */
function estrutura(doc: PMNode): string {
  const partes: string[] = [];
  doc.forEach((n) => {
    const a = n.attrs;
    let k = n.type.name + ':' + (a['recuo'] ?? '');
    if (n.type === ITEM) k += `:${a['tipo']}:${a['numero']}:${a['feita'] ? 1 : 0}`;
    else if (n.type === LINHA || n.type === N['titulo']) k += n.textContent.trim() ? ':x' : ':';
    else if (n.type === N['blocoCodigo']) k += `:${a['margem']}:${a['aberto'] ? 1 : 0}`;
    else if (n.type === N['cru']) k += ':' + textoDoCru(n);
    partes.push(k);
  });
  return partes.join('\n');
}

interface Desenho {
  chave: string;
  deco: DecorationSet;
}
const DESENHO = new PluginKey<Desenho>('vis-listas');
/** Refazer o desenho depois da composição (enquanto se compõe, ele só acompanha as letras). */
const REFAZ = 'vis-listas-refaz';

/**
 * O plugin do desenho das listas (5.6): roda o leitor na própria transação (sem um quadro com o número
 * errado depois de um Enter), mas só quando a estrutura muda; o resto do tempo, as decorações só andam
 * com as letras. Durante a composição (o acento, o teclado do celular), nada muda: ao acabar, refaz.
 */
export function desenhoDasListas(escrever: Escritor): Plugin {
  const calcula = (doc: PMNode, velho: DecorationSet | null): DecorationSet => {
    const m = mapaDoTexto(doc, escrever);
    return m ? desenhar(doc, m) : (velho ?? DecorationSet.empty);
  };
  return new Plugin<Desenho>({
    key: DESENHO,
    state: {
      init: (_c, state) => ({ chave: estrutura(state.doc), deco: calcula(state.doc, null) }),
      apply(tr, velho) {
        const refaz = !!tr.getMeta(REFAZ);
        if (!tr.docChanged && !refaz) return velho;
        const deco = tr.docChanged ? velho.deco.map(tr.mapping, tr.doc) : velho.deco;
        if (tr.getMeta('composition') !== undefined) return { chave: velho.chave, deco };
        const chave = estrutura(tr.doc);
        if (chave === velho.chave && !refaz) return { chave, deco };
        return { chave, deco: calcula(tr.doc, deco) };
      },
    },
    props: {
      decorations: (state) => DESENHO.getState(state)?.deco,
      handleDOMEvents: {
        compositionend: (view) => {
          setTimeout(() => {
            if (!view.isDestroyed && !view.composing && DESENHO.getState(view.state)?.chave !== estrutura(view.state.doc)) view.dispatch(view.state.tr.setMeta(REFAZ, true));
          });
          return false;
        },
      },
    },
  });
}

// ===== A peça do item: a caixinha da tarefa =====

/**
 * O item na tela: a linha com o marcador da leitura (o ponto e o número são desenho, no `::before`; o
 * número vem da decoração) e, na tarefa, a caixinha, que marca e desmarca com um toque. A caixinha segura
 * o foco no `pointerdown` (e no `mousedown`) e age no `click`: cancelar o `touchstart` mataria o click
 * no celular (a lição da rodada 0). Ela não põe o cursor nem abre o teclado.
 */
export class ItemView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly caixa: HTMLElement | null = null;

  constructor(
    private node: PMNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'linha vis-item';
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'vis-item-texto';
    if (node.attrs['tipo'] === 'check') {
      const c = document.createElement('span');
      c.className = 'vis-caixa';
      c.contentEditable = 'false';
      c.setAttribute('role', 'checkbox');
      const segura = (e: Event) => e.preventDefault();
      c.addEventListener('pointerdown', segura);
      c.addEventListener('mousedown', segura);
      c.addEventListener('click', (e) => {
        e.preventDefault();
        this.marca();
      });
      this.caixa = c;
      this.dom.append(c);
    }
    this.dom.append(this.contentDOM);
    this.desenha();
  }

  private marca(): void {
    const pos = this.getPos();
    if (pos === undefined || !this.view.editable) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, feita: !this.node.attrs['feita'] }));
  }

  /** O tipo, a feita e o recuo (a classe fica: as das decorações moram nela também). */
  private desenha(): void {
    const a = this.node.attrs;
    this.dom.dataset['tipo'] = a['tipo'];
    this.dom.style.setProperty('--recuo', String(a['recuo'] ?? 0));
    const feita = a['tipo'] === 'check' && !!a['feita'];
    this.dom.toggleAttribute('data-feita', feita);
    if (this.caixa) {
      this.caixa.setAttribute('aria-checked', String(feita));
      this.caixa.setAttribute('aria-label', 'Tarefa feita');
      this.caixa.title = feita ? 'Desmarcar a tarefa (Ctrl+Alt+Enter)' : 'Marcar como feita (Ctrl+Alt+Enter)';
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type || node.attrs['tipo'] !== this.node.attrs['tipo']) return false;
    this.node = node;
    this.desenha();
    return true;
  }

  /** O toque na caixinha é dela (o ProseMirror não põe o cursor nem seleciona). */
  stopEvent(e: Event): boolean {
    return !!this.caixa && this.caixa.contains(e.target as Node);
  }

  ignoreMutation(m: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (m.type === 'selection') return false;
    if (this.caixa?.contains(m.target)) return true;
    return m.type === 'attributes' && m.target === this.dom;
  }
}
