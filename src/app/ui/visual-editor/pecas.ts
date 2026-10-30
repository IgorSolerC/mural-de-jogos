import { ApplicationRef, ComponentRef, EnvironmentInjector, createComponent } from '@angular/core';
import { GapCursor } from 'prosemirror-gapcursor';
import { Node as PMNode, Slice } from 'prosemirror-model';
import { Command, EditorState, NodeSelection, Plugin, PluginKey, Selection, TextSelection, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView, NodeView } from 'prosemirror-view';
import { NoteLinks } from '../../core/note-links';
import { bodyIndent, indentOf } from '../../core/rich-text';
import { imageFileOf } from '../../core/images';
import { WidgetSize, widgetSpoken, withInlineText } from '../../core/widgets';
import { NoteWidget } from '../note-widget';
import { mapaDe } from './listas';
import { schema } from './schema';

/**
 * Os widgets no Visual (PLANO-EDITOR-VISUAL.md, 5.13, e a rodada 5): o widget é uma peça viva dentro da
 * folha, o mesmo `app-note-widget` da leitura, criado à mão dentro do ProseMirror. Um toque o seleciona
 * inteiro (é um átomo); a régua do editor mostra a tirinha de sempre (o nome, o resumo, Tirar e Editar),
 * e a folha do widget (ui/widget-sheet.ts) põe e troca. A legenda da imagem e do vídeo, o título do
 * contador e o da faixa se escrevem direto na peça selecionada (`WidgetField.inline` no registro): o
 * componente troca o texto por um campo com a mesma letra, no mesmo lugar, que o ProseMirror não toca.
 *
 * Aqui moram: a peça (`WidgetView`), o lugar onde um widget novo entra (as regras do `writeWidget` do
 * Markdown: no lugar de uma linha vazia, ou numa linha só dele depois da do cursor, com o recuo da
 * descrição dentro de um item), os marcadores "Guardando a imagem…" da imagem colada ou solta (que
 * andam com as mudanças), o arrastar (a peça solta no meio de uma linha vai para uma linha só dela,
 * embaixo) e o que se escreve com a peça selecionada (vai para uma linha nova embaixo dela: a peça não
 * some por uma letra).
 */

const N = schema.nodes;
const WIDGET = N['widget'];
const LINHA = N['linha'];

/** O que a peça precisa do editor. */
export interface ContextoPeca {
  appRef: ApplicationRef;
  injector: EnvironmentInjector;
  links: () => NoteLinks | null;
}

/** Os controles de dentro da peça: o toque é deles (tocar o vídeo, o som, ampliar), não seleciona a peça. */
const CONTROLES = 'button, a, input, select, textarea, video, audio, iframe, [role=button], [role=slider], [contenteditable=true], .tocavel';

/** O campo da legenda (ou do título) dentro da peça, de onde veio o evento. */
function campoDe(e: Event): HTMLInputElement | null {
  return (e.target as Element | null)?.closest?.('input.campo-peca') ?? null;
}

/**
 * A peça do widget na folha: o `app-note-widget` de sempre, criado à mão (`createComponent` com o injetor
 * do editor e `ApplicationRef.attachView`), desmontado no `destroy` (nenhum fica vivo, nem o contador
 * contando escondido). O `update` só troca as entradas quando a linha dela mudou, sem recriar: o vídeo que
 * está tocando continua tocando enquanto se escreve em outra linha (o W2 do plano).
 *
 * Selecionada, o componente recebe `editavel`: a legenda (ou o título) vira um campo. Enter ou sair dele
 * grava (uma mudança no histórico); Esc volta ao que estava; o "}}" vira "} }" (a marca do widget
 * fecharia ali), com um aviso miúdo embaixo da peça enquanto se escreve.
 */
export class WidgetView implements NodeView {
  readonly dom: HTMLElement;
  private readonly ref: ComponentRef<NoteWidget>;
  private readonly aviso: HTMLElement;
  private selecionada = false;
  /** O campo está com o foco: a peça continua editável até ele sair, mesmo se a seleção da folha mudar. */
  private escrevendo = false;
  private editavel = false;
  /** O texto do campo quando ele recebeu o foco (o Esc volta a ele). */
  private antes = '';

  constructor(
    private node: PMNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly ctx: ContextoPeca,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'vis-peca';
    this.dom.setAttribute('role', 'group');
    const host = document.createElement('app-note-widget');
    host.className = 'widget';
    this.ref = createComponent(NoteWidget, { environmentInjector: ctx.injector, hostElement: host });
    this.ref.setInput('name', node.attrs['nome']);
    this.ref.setInput('args', node.attrs['args']);
    this.ref.setInput('size', node.attrs['tamanho']);
    this.ref.setInput('links', ctx.links());
    ctx.appRef.attachView(this.ref.hostView);
    this.aviso = document.createElement('span');
    this.aviso.className = 'vis-peca-aviso';
    this.aviso.hidden = true;
    this.aviso.setAttribute('role', 'status');
    this.aviso.textContent = 'O “}}” fecharia o widget: fica “} }”';
    this.dom.append(host, this.aviso);
    this.dom.addEventListener('focusin', (e) => {
      const c = campoDe(e);
      if (!c) return;
      this.escrevendo = true;
      this.antes = c.value;
      // arrastar a peça pegaria o arrasto de selecionar as letras do campo
      this.dom.draggable = false;
    });
    this.dom.addEventListener('focusout', (e) => {
      const c = campoDe(e);
      if (!c) return;
      this.grava(c, false);
      this.escrevendo = false;
      this.dom.draggable = true;
      this.aviso.hidden = true;
      if (!this.selecionada) this.poeEditavel(false);
    });
    // o toque no campo: no celular, o navegador deixa o foco na folha (o campo mora dentro dela); o
    // campo pega o foco no próprio toque (no gesto, o teclado do celular abre)
    this.dom.addEventListener('click', (e) => {
      const c = campoDe(e);
      if (c && document.activeElement !== c) c.focus();
    });
    this.dom.addEventListener('input', (e) => {
      const c = campoDe(e);
      if (c) this.aviso.hidden = !c.value.includes('}}');
    });
    this.dom.addEventListener('keydown', (e) => {
      const c = campoDe(e);
      if (!c || e.isComposing) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.grava(c, true);
        this.view.focus();
      } else if (e.key === 'Escape') {
        // só o campo: o editor da ficha não fecha
        e.preventDefault();
        e.stopPropagation();
        c.value = this.antes;
        this.aviso.hidden = true;
        this.view.focus();
      } else if (e.key === 'Tab' && e.shiftKey) {
        // de volta para a folha, com a peça selecionada (o Tab, o editor leva à tirinha)
        e.preventDefault();
        this.view.focus();
      }
    });
    this.desenha();
  }

  /** O nome para o leitor de tela ("Widget: Contador, Lançamento do GTA VI") e o recuo. */
  private desenha(): void {
    const a = this.node.attrs;
    this.dom.setAttribute('aria-label', 'Widget: ' + widgetSpoken(a['nome'], a['args']));
    this.dom.dataset['nome'] = a['nome'];
    this.dom.style.setProperty('--recuo', String(a['recuo'] ?? 0));
  }

  private poeEditavel(sim: boolean): void {
    if (sim === this.editavel) return;
    this.editavel = sim;
    this.ref.setInput('editavel', sim);
  }

  /** O que foi escrito no campo vai para a peça (uma mudança no histórico); `devolve`: a peça fica selecionada. */
  private grava(c: HTMLInputElement, devolve: boolean): void {
    const pos = this.getPos();
    if (pos === undefined || !this.view.editable) return;
    const args = withInlineText(this.node.attrs['nome'], this.node.attrs['args'], c.value);
    const sel = this.view.state.selection;
    const aqui = sel instanceof NodeSelection && sel.from === pos;
    if (!args) {
      if (devolve && !aqui) this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
      return;
    }
    const tr = this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, args });
    // a peça trocada continua selecionada (a tirinha e o campo ficam)
    if (devolve || aqui) tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const [a, b] = [this.node.attrs, node.attrs];
    if (a['nome'] !== b['nome']) this.ref.setInput('name', b['nome']);
    if (JSON.stringify(a['args']) !== JSON.stringify(b['args'])) this.ref.setInput('args', b['args']);
    if (a['tamanho'] !== b['tamanho']) this.ref.setInput('size', b['tamanho']);
    this.node = node;
    this.desenha();
    return true;
  }

  selectNode(): void {
    this.selecionada = true;
    this.dom.classList.add('ProseMirror-selectednode');
    this.poeEditavel(true);
  }

  deselectNode(): void {
    this.selecionada = false;
    this.dom.classList.remove('ProseMirror-selectednode');
    if (!this.escrevendo) this.poeEditavel(false);
  }

  /** O campo e os controles (tocar o vídeo e o som, ampliar) ficam com eles: o toque não seleciona a peça. */
  stopEvent(e: Event): boolean {
    if (e.type === 'dragstart' || e.type === 'dragend') return !!campoDe(e);
    const t = e.target as Element | null;
    // o controle de dentro da peça (o `closest` também acharia a folha, que é contenteditable)
    const c = t?.closest?.(CONTROLES);
    return !!c && c !== this.dom && this.dom.contains(c);
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.ctx.appRef.detachView(this.ref.hostView);
    this.ref.destroy();
  }
}

// ===== O lugar de um widget novo =====

/**
 * Onde um widget novo entra, como o `writeWidget` do Markdown: no lugar da linha vazia do cursor (`pos`
 * logo antes dela), ou logo depois da linha do cursor (`pos` logo depois dela). `lado`: para que lado a
 * posição gruda quando o texto muda em volta (a linha de antes, ou a de depois).
 */
export interface Lugar {
  pos: number;
  lado: -1 | 1;
}

const vazia = (n: PMNode | null | undefined) => !!n && n.type === LINHA && !n.content.size;

/** O lugar do widget novo pelo cursor (ou pela seleção: depois da linha onde ela acaba). */
export function lugarDoCursor(state: EditorState): Lugar {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.$from.depth === 0) return { pos: sel.to, lado: -1 };
  const $t = sel.$to;
  if ($t.depth === 0) return { pos: sel.from, lado: 1 };
  if (sel.empty && vazia($t.node(1))) return { pos: $t.before(1), lado: 1 };
  return { pos: $t.after(1), lado: -1 };
}

/** O lugar do widget novo onde a peça (ou a imagem) foi solta: depois da linha onde ela caiu (ou no lugar da vazia). */
export function lugarDoPonto(view: EditorView, x: number, y: number): Lugar | null {
  const at = view.posAtCoords({ left: x, top: y });
  if (!at) return null;
  const $p = view.state.doc.resolve(at.pos);
  if ($p.depth === 0) return { pos: at.pos, lado: 1 };
  if (vazia($p.node(1))) return { pos: $p.before(1), lado: 1 };
  return { pos: $p.after(1), lado: -1 };
}

/**
 * O recuo de um widget que entra depois do nó `i`: dentro de um item (no item, ou na descrição dele), o da
 * descrição (a coluna do texto do item, como o `bodyIndent` do Markdown); fora, nenhum.
 */
function recuoDepois(state: EditorState, doc: PMNode, i: number): number {
  if (i < 0) return 0;
  const m = mapaDe(state, doc);
  if (!m) return 0;
  const ultima = (i + 1 < m.primeira.length ? m.primeira[i + 1] : m.linhas.length) - 1;
  const ind = bodyIndent(m.linhas, ultima);
  return ind == null ? 0 : Math.min(40, indentOf(ind + 'x'));
}

/** Os atributos de um widget. */
export interface Peca {
  nome: string;
  args: readonly string[];
  tamanho: WidgetSize;
}

/**
 * Põe o widget no lugar (já mapeado para `tr.doc`): no lugar da linha vazia que está ali (com o recuo
 * dela), ou numa linha só dele, com o recuo da descrição quando é dentro de um item. Devolve onde ele ficou.
 */
export function poeNoLugar(state: EditorState, tr: Transaction, pos: number, p: Peca): number {
  const depois = tr.doc.nodeAt(pos);
  const attrs = (recuo: number) => ({ recuo, fonte: null, nome: p.nome, args: [...p.args], tamanho: p.tamanho });
  if (vazia(depois)) {
    tr.replaceWith(pos, pos + depois!.nodeSize, WIDGET.create(attrs(depois!.attrs['recuo'] ?? 0)));
    return pos;
  }
  const i = tr.doc.resolve(pos).index(0);
  tr.insert(pos, WIDGET.create(attrs(recuoDepois(state, tr.doc, i - 1))));
  return pos;
}

/** Tira o widget em `pos` (o texto nunca fica sem linha: sozinho, ele vira a linha vazia). O cursor fica ali. */
export function tiraEm(tr: Transaction, pos: number): void {
  const n = tr.doc.nodeAt(pos);
  if (!n) return;
  if (tr.doc.childCount === 1) tr.replaceWith(pos, pos + n.nodeSize, LINHA.create());
  else tr.delete(pos, pos + n.nodeSize);
  const $p = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
  tr.setSelection(Selection.near($p, 1));
}

// ===== As teclas da peça =====

/** Tab com a peça selecionada: o campo da legenda (ou do título), se ela tem; sem ele, a tecla passa (o editor leva à tirinha). */
export const tabNaPeca: Command = (state, _dispatch, view) => {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type !== WIDGET || !view) return false;
  const campo = (view.nodeDOM(sel.from) as HTMLElement | null)?.querySelector<HTMLInputElement>('input.campo-peca');
  if (!campo) return false;
  campo.focus();
  campo.select();
  return true;
};

// ===== Os marcadores da imagem que está sendo guardada =====

interface Marca extends Lugar {
  /** O trecho onde ela ia foi apagado: ela entra onde o cursor estiver. */
  perdida: boolean;
  /** O texto mudou desde que ela foi marcada (então a seleção é de quem está escrevendo: fica onde está). */
  mexeu: boolean;
}

const ENVIOS = new PluginKey<Map<number, Marca>>('vis-envios');
type Pedido = { poe: number; lugar: Lugar } | { tira: number };

/** O marcador "Guardando a imagem…" no lugar `lugar` (o id é de quem pediu). */
export function marcaEnvio(tr: Transaction, id: number, lugar: Lugar): Transaction {
  return tr.setMeta(ENVIOS, { poe: id, lugar } satisfies Pedido);
}

export function tiraEnvio(tr: Transaction, id: number): Transaction {
  return tr.setMeta(ENVIOS, { tira: id } satisfies Pedido);
}

/** O marcador de agora (mapeado com o texto), ou null. */
export function envio(state: EditorState, id: number): Marca | null {
  return ENVIOS.getState(state)?.get(id) ?? null;
}

function marcador(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'vis-guardando';
  el.contentEditable = 'false';
  el.setAttribute('aria-hidden', 'true');
  el.textContent = 'Guardando a imagem…';
  return el;
}

/**
 * O que a peça precisa da folha: a imagem colada ou solta (o editor a encolhe e guarda, e a põe no
 * marcador), e o que se escreve com a peça selecionada.
 */
export interface AcoesPeca {
  /** Uma imagem (sem texto junto) foi colada ou solta: o lugar dela. */
  imagem(arquivo: Blob, lugar: Lugar): void;
}

/**
 * O plugin das peças: os marcadores (que andam com as mudanças, como o exemplo de envio do ProseMirror; o
 * trecho dele apagado, ele fica perdido e a imagem entra onde o cursor estiver), a imagem colada ou solta,
 * o arrastar da peça (no meio de uma linha, ela vai para uma linha só dela, embaixo) e a letra escrita
 * com a peça selecionada (numa linha nova embaixo dela).
 */
export function pecas(acoes: AcoesPeca): Plugin {
  return new Plugin<Map<number, Marca>>({
    key: ENVIOS,
    state: {
      init: () => new Map(),
      apply(tr, velho) {
        const pedido = tr.getMeta(ENVIOS) as Pedido | undefined;
        if (!tr.docChanged && !pedido) return velho;
        const novo = new Map<number, Marca>();
        for (const [id, m] of velho) {
          if (!tr.docChanged) {
            novo.set(id, m);
            continue;
          }
          const r = tr.mapping.mapResult(m.pos, m.lado);
          novo.set(id, { ...m, pos: r.pos, perdida: m.perdida || r.deleted, mexeu: true });
        }
        if (pedido && 'poe' in pedido) novo.set(pedido.poe, { ...pedido.lugar, perdida: false, mexeu: false });
        if (pedido && 'tira' in pedido) novo.delete(pedido.tira);
        return novo;
      },
    },
    props: {
      decorations(state) {
        const marcas = ENVIOS.getState(state);
        if (!marcas?.size) return null;
        const decos = [...marcas]
          .filter(([, m]) => !m.perdida)
          .map(([id, m]) => Decoration.widget(m.pos, marcador, { key: 'envio-' + id, side: m.lado, ignoreSelection: true }));
        return DecorationSet.create(state.doc, decos);
      },
      handlePaste(view, e) {
        // a imagem sem texto junto (as células de uma planilha também trazem a foto delas: aí vale o texto)
        if (e.clipboardData?.getData('text/plain').trim()) return false;
        const arquivo = imageFileOf(e.clipboardData);
        if (!arquivo) return false;
        acoes.imagem(arquivo, lugarDoCursor(view.state));
        return true;
      },
      handleDrop(view, e, slice, moved) {
        const ev = e as DragEvent;
        const arquivo = imageFileOf(ev.dataTransfer);
        if (arquivo && !view.dragging) {
          const lugar = lugarDoPonto(view, ev.clientX, ev.clientY);
          if (!lugar) return false;
          acoes.imagem(arquivo, lugar);
          return true;
        }
        return soltaPeca(view, ev, slice, moved);
      },
      handleTextInput(view, _from, _to, texto) {
        const sel = view.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type !== WIDGET) return false;
        // a peça não some por uma letra: o que se escreve vai para uma linha nova embaixo dela
        const tr = view.state.tr.insert(sel.to, LINHA.create({ recuo: sel.node.attrs['recuo'] }, schema.text(texto)));
        view.dispatch(tr.setSelection(TextSelection.create(tr.doc, sel.to + 1 + texto.length)).scrollIntoView());
        return true;
      },
    },
  });
}

/**
 * A peça arrastada e solta dentro de uma linha: ela vai para uma linha só dela, embaixo daquela (o
 * leitor não lê um widget no meio do texto), com o recuo do lugar novo. Entre duas linhas, o soltar de
 * sempre do ProseMirror (o recuo também segue o lugar novo).
 */
function soltaPeca(view: EditorView, e: DragEvent, slice: Slice, moved: boolean): boolean {
  const peca = slice.content.childCount === 1 ? slice.content.firstChild : null;
  if (!peca || peca.type !== WIDGET) return false;
  const lugar = lugarDoPonto(view, e.clientX, e.clientY);
  if (!lugar) return false;
  const { state } = view;
  const tr = state.tr;
  const sel = state.selection;
  if (moved && sel instanceof NodeSelection && sel.node.type === WIDGET) {
    // soltou em cima dela mesma: nada muda
    if (lugar.pos >= sel.from && lugar.pos <= sel.to) return true;
    tr.deleteSelection();
  }
  const pos = tr.mapping.map(lugar.pos, lugar.lado);
  const at = poeNoLugar(state, tr, pos, { nome: peca.attrs['nome'], args: peca.attrs['args'], tamanho: peca.attrs['tamanho'] });
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
  view.focus();
  return true;
}

/** O cursor logo depois do widget em `pos` (o de lacuna, quando embaixo dele não tem uma linha de texto). */
export function depoisDaPeca(tr: Transaction, pos: number): Selection {
  const fim = pos + (tr.doc.nodeAt(pos)?.nodeSize ?? 0);
  const $f = tr.doc.resolve(fim);
  return $f.nodeAfter?.isTextblock ? TextSelection.create(tr.doc, fim + 1) : new GapCursor($f);
}
