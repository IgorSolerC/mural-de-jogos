import { Node as PMNode } from 'prosemirror-model';
import { Command, EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView, NodeView } from 'prosemirror-view';
import { CodeRange, codeHighlightLoaded, codeRanges, loadCodeHighlight } from '../../core/code-highlight';
import { CodeTheme, codeLangName, codeLangOf, codeThemeOf, withCodeLang, withCodeTheme } from '../../core/code-langs';
import { ICON } from '../icons';
import { desenho, etiqueta } from './controles';
import { codigo } from './keymap';
import { schema } from './schema';
import type { AcaoCodigo, EstadoCodigo } from './visual-api';

/**
 * O bloco de código no Visual (ver core/code-langs.ts e ui/_formatado.scss): a folha de formulário contínuo
 * da leitura, com o que se escreve direto nela. A linguagem ("```js") é o atributo `lingua` do nó: a
 * etiqueta dela fica impressa no alto do papel, e as cores vêm do mesmo colorir da leitura
 * (core/code-highlight.ts), como decorações (o texto continua só letras). Com o cursor no bloco, dois botões
 * do kit (controles.ts) presos no canto de cima do papel: a linguagem (que abre o menu "Código" da régua,
 * com as comuns e o campo para escrever outra) e Copiar.
 */

const BC = schema.nodes['blocoCodigo'];

/** O bloco do cursor, para o menu "Código" da régua (ele aparece com ele). */
export function estadoCodigo(state: EditorState): EstadoCodigo | null {
  const { $from, $to } = state.selection;
  if ($from.depth !== 1 || $from.parent.type !== BC || !$from.sameParent($to)) return null;
  return { lingua: $from.parent.attrs['lingua'] ?? '' };
}

/** O texto do bloco do cursor (o "Copiar o código"), ou null fora de um. */
export function textoDoCodigo(state: EditorState): string | null {
  return estadoCodigo(state) ? state.selection.$from.parent.textContent : null;
}

/** O comando de uma ação do menu "Código" (o copiar é de quem tem a área de transferência). */
export function acaoCodigo(acao: AcaoCodigo): Command | null {
  if (acao === 'copiar') return null;
  // desfazer: o bloco volta a ser texto (como o Ctrl+E nele), o cursor no mesmo lugar
  if (acao === 'desfazer') return (state, dispatch) => !!estadoCodigo(state) && codigo(state, dispatch);
  return (state, dispatch) => {
    if (!estadoCodigo(state)) return false;
    const { $from } = state.selection;
    const antes: string = $from.parent.attrs['lingua'] ?? '';
    const lingua = 'tema' in acao ? withCodeTheme(antes, acao.tema) : withCodeLang(antes, acao.lingua);
    if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), null, { ...$from.parent.attrs, lingua }));
    return true;
  };
}

// ===== O bloco na tela =====

/** O que a peça do bloco pede a quem a desenha: abrir o menu da linguagem e copiar o texto. */
export interface CodigoContexto {
  pedeLingua: () => void;
  copia: (texto: string) => void;
  /** O tema dos blocos sem tema próprio (Ajustes › Mural). */
  temaPadrao: () => CodeTheme;
}

/**
 * O bloco: o `<pre>` da leitura (o papel, os furos), as letras no `<code>` de dentro, a etiqueta da
 * linguagem impressa no alto (só desenho) e os botões do bloco do cursor (ver `vis-codigo-ativo`).
 */
export class CodigoView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly etiqueta: HTMLElement;
  private readonly controles: HTMLElement;
  private feito = '\u0000';

  constructor(
    private node: PMNode,
    private readonly view: EditorView,
    private readonly ctx: CodigoContexto,
  ) {
    this.dom = document.createElement('pre');
    this.dom.className = 'linha codigo';
    this.dom.spellcheck = false;
    this.etiqueta = document.createElement('span');
    this.etiqueta.className = 'codigo-lingua';
    this.etiqueta.contentEditable = 'false';
    this.etiqueta.setAttribute('aria-hidden', 'true');
    this.contentDOM = document.createElement('code');
    this.controles = document.createElement('span');
    this.controles.className = 'vis-controles vis-codigo-controles';
    this.controles.contentEditable = 'false';
    this.controles.setAttribute('role', 'toolbar');
    this.controles.setAttribute('aria-label', 'Bloco de código');
    this.dom.append(this.etiqueta, this.contentDOM, this.controles);
    this.desenha();
  }

  private desenha(): void {
    const lingua: string = this.node.attrs['lingua'] ?? '';
    const recuo: number = this.node.attrs['recuo'] ?? 0;
    if (recuo) this.dom.style.setProperty('--recuo', String(recuo));
    else this.dom.style.removeProperty('--recuo');
    // o papel é o desenho de sempre (sem marca nenhuma): só os escuros levam a marca
    const tema = codeThemeOf(lingua) ?? this.ctx.temaPadrao();
    if (tema === 'papel') delete this.dom.dataset['tema'];
    else this.dom.dataset['tema'] = tema;
    if (this.feito === lingua) return;
    this.feito = lingua;
    const nome = codeLangName(lingua);
    if (lingua) this.dom.dataset['lingua'] = lingua;
    else delete this.dom.dataset['lingua'];
    this.etiqueta.textContent = nome;
    this.etiqueta.hidden = !nome;
    this.controles.replaceChildren(this.botaoDaLingua(nome, !!codeLangOf(lingua) || !lingua), etiqueta({ nome: 'Copiar o código', icone: ICON.copiar, giro: '1.2deg', aperta: () => this.ctx.copia(this.node.textContent) }));
  }

  /** A linguagem: o desenho do código, o nome (ou "Linguagem", sem nenhuma) e a setinha do menu. */
  private botaoDaLingua(nome: string, conhecida: boolean): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = 'vis-ciclo vis-codigo-botao';
    b.style.setProperty('--giro', '-1deg');
    const fala = nome ? `Linguagem: ${nome}${conhecida ? '' : ' (sem cores)'}. Trocar` : 'Escolher a linguagem (para as cores)';
    b.setAttribute('aria-label', fala);
    b.title = fala;
    b.setAttribute('aria-haspopup', 'menu');
    const rotulo = document.createElement('span');
    rotulo.className = 'vis-ciclo-nome';
    rotulo.textContent = nome || 'Linguagem';
    const seta = desenho(ICON.abrir);
    seta.classList.add('vis-ciclo-seta');
    b.append(desenho(ICON.codigo), rotulo, seta);
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.view.editable) this.ctx.pedeLingua();
    });
    return b;
  }

  /** Os botões são deles: o toque não põe o cursor no bloco. */
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
    if (this.etiqueta.contains(m.target) || this.controles.contains(m.target)) return true;
    return m.type === 'attributes' && m.target === this.dom;
  }
}

// ===== As cores =====

const REALCE = new PluginKey<{ deco: DecorationSet; espera: boolean }>('vis-realce');

/**
 * As cores de cada nó de bloco (os nós não mudam: o bloco que ninguém mexeu continua o mesmo nó, e não é
 * colorido de novo a cada tecla em outro lugar). Os textos do meio da escrita não vão para a conta comum
 * (ver core/code-highlight.ts), que ficaria cheia deles.
 */
const CORES = new WeakMap<PMNode, CodeRange[]>();

/** As cores de cada bloco com linguagem (`espera`: algum precisa do colorir, que ainda está chegando). */
function colorir(doc: PMNode): { deco: DecorationSet; espera: boolean } {
  const decos: Decoration[] = [];
  let espera = false;
  doc.forEach((n, pos) => {
    if (n.type !== BC || !n.attrs['lingua']) return;
    let r: CodeRange[] | null | undefined = CORES.get(n);
    if (!r) {
      r = codeRanges(n.textContent, n.attrs['lingua'], false);
      if (r) CORES.set(n, r);
    }
    if (!r) {
      if (codeLangOf(n.attrs['lingua']) && !codeHighlightLoaded()) espera = true;
      return;
    }
    for (const x of r) decos.push(Decoration.inline(pos + 1 + x.de, pos + 1 + x.ate, { class: x.c }));
  });
  return { deco: decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty, espera };
}

/** Onde está o bloco do cursor (os botões dele aparecem), ou null. */
function blocoDoCursor(state: EditorState): { pos: number; node: PMNode } | null {
  const { $from } = state.selection;
  return $from.depth === 1 && $from.parent.type === BC ? { pos: $from.before(), node: $from.parent } : null;
}

/**
 * As cores dos blocos (refeitas a cada mudança do texto: as contas ficam guardadas por texto, ver
 * core/code-highlight.ts) e a marca do bloco do cursor. Quando o colorir chega, a folha se pinta de novo.
 */
export function realceDoCodigo(): Plugin {
  return new Plugin<{ deco: DecorationSet; espera: boolean }>({
    key: REALCE,
    state: {
      init: (_c, state) => colorir(state.doc),
      apply: (tr, velho) => (tr.docChanged || tr.getMeta(REALCE) ? colorir(tr.doc) : velho),
    },
    view: (v) => {
      let vivo = true;
      let esperando = false;
      const confere = (view: EditorView) => {
        if (esperando || !REALCE.getState(view.state)?.espera) return;
        esperando = true;
        void loadCodeHighlight().then(() => {
          esperando = false;
          if (vivo && codeHighlightLoaded()) view.dispatch(view.state.tr.setMeta(REALCE, true).setMeta('addToHistory', false));
        });
      };
      confere(v);
      return {
        update: (view) => confere(view),
        destroy: () => (vivo = false),
      };
    },
    props: {
      decorations: (state) => {
        const deco = REALCE.getState(state)?.deco ?? DecorationSet.empty;
        const b = blocoDoCursor(state);
        return b ? deco.add(state.doc, [Decoration.node(b.pos, b.pos + b.node.nodeSize, { class: 'vis-codigo-ativo' })]) : deco;
      },
    },
  });
}
