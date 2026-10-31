import { Node as PMNode } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Fonte, LinhaDoc, docToText } from '../../core/rich-doc';
import { Span, copyText } from '../../core/rich-text';
import { ATRIBUTO_MURALL, TIPO_MURALL } from '../../core/transferencia';
import { CopyContext, readMedia, widgetCopy } from '../../core/widgets';
import { linhaDe, schema } from './schema';
import { tabelaEm, tirarSoTexto, tocaTabela } from './tabela';

/**
 * Copiar e recortar no Visual (PLANO-EDITOR-VISUAL.md, 5.16): a área de transferência recebe três coisas.
 *
 * - `text/plain`: o texto limpo, como a cópia que já existe (`copyText`: sem as marcas, os widgets em
 *   palavras), para o WhatsApp, o e-mail, o bloco de notas;
 * - `text/html`: o trecho formatado (títulos, listas, negrito, links, a tabela), para o Docs, o Word e o
 *   e-mail; ele leva também o markdown num atributo (`ATRIBUTO_MURALL`), para colar no Visual quando o
 *   navegador não deixa o tipo próprio chegar (o Safari, C10);
 * - `text/x-murall-markdown`: o markdown do trecho, escrito pelo tradutor (core/rich-doc.ts), para colar
 *   noutra nota do Murall sem perder nada.
 *
 * O ProseMirror não chega a copiar: este plugin vem antes dele e cancela o evento. Recortar é o mesmo, e
 * o trecho sai (a seleção que toca uma tabela só tira texto, como no apagar).
 */

const N = schema.nodes;

export interface AcoesCopiar {
  /** A fonte guardada do nó (o que ele era no texto), se ele não mudou. */
  fonte(n: PMNode): Fonte | undefined;
  /** O que a cópia dos widgets precisa saber (a hora, o título de uma ficha colada). */
  contexto(): CopyContext;
}

/** O que vai para a área de transferência. */
export interface Copia {
  markdown: string;
  texto: string;
  html: string;
}

export function copiar(acoes: AcoesCopiar): Plugin {
  const poe = (view: EditorView, e: ClipboardEvent, cortar: boolean): boolean => {
    const data = e.clipboardData;
    if (!data || view.state.selection.empty) return false;
    // dentro do campo da legenda de uma peça, o copiar é o do campo
    if ((e.target as Element | null)?.closest?.('input, textarea')) return false;
    const c = copiaDe(view.state, acoes);
    e.preventDefault();
    data.clearData();
    data.setData('text/html', c.html);
    data.setData('text/plain', c.texto);
    try {
      data.setData(TIPO_MURALL, c.markdown);
    } catch {
      // o navegador que recusa o tipo próprio: o HTML leva o markdown (C10)
    }
    if (cortar) {
      const { state } = view;
      const tr = tocaTabela(state) ? tirarSoTexto(state.tr, state.selection.from, state.selection.to) : state.tr.deleteSelection();
      view.dispatch(tr.scrollIntoView().setMeta('uiEvent', 'cut'));
    }
    return true;
  };
  return new Plugin({
    props: {
      handleDOMEvents: {
        copy: (view, e) => poe(view, e, false),
        cut: (view, e) => poe(view, e, true),
      },
    },
  });
}

/** O trecho selecionado nos três jeitos. */
export function copiaDe(state: EditorState, acoes: AcoesCopiar): Copia {
  const linhas = linhasDoTrecho(state, acoes.fonte);
  const markdown = docToText({ linhas, quebra: '\n' }).texto;
  const ctx = acoes.contexto();
  return { markdown, texto: soTabelas(linhas) ?? copyText(markdown, ctx), html: htmlDe(linhas, markdown, ctx) };
}

/**
 * Só células (a seleção dentro de uma tabela): o texto sai como uma planilha, uma fileira por linha, com
 * as células separadas por tab (a decisão 9 da rodada 6), para colar numa planilha ou noutra tabela.
 */
function soTabelas(linhas: readonly LinhaDoc[]): string | null {
  if (!linhas.length || linhas.some((l) => l.kind !== 'tabela')) return null;
  const celula = (spans: readonly Span[]) => spans.map((s) => s.text).join('').replace(/\s+/g, ' ');
  return linhas
    .flatMap((l) => (l.kind === 'tabela' ? [l.cabeca, ...l.fileiras] : []))
    .map((f) => f.map(celula).join('\t'))
    .join('\n');
}

/**
 * As linhas do trecho selecionado, como o tradutor as escreve. Uma seleção dentro de uma linha só leva
 * as letras (com as marcas), sem o tipo da linha: colada no meio de outra, ela não vira título nem item.
 * As linhas inteiras levam a fonte (saem como estavam escritas); as cortadas, não. O recuo comum sai.
 */
export function linhasDoTrecho(state: EditorState, fonteDe: (n: PMNode) => Fonte | undefined = () => undefined): LinhaDoc[] {
  const sel = state.selection;
  const { $from, $to } = sel;
  if (sel instanceof TextSelection && $from.sameParent($to) && $from.parent.inlineContent) {
    const pai = $from.parent;
    if (pai.type.spec.code) {
      const texto = state.doc.textBetween(sel.from, sel.to);
      return [texto.includes('\n') ? { kind: 'codigo', recuo: 0, cerca: '```', texto, margem: 0, aberto: false } : { kind: 'linha', recuo: 0, spans: [{ text: texto, code: true }] }];
    }
    const solta = N['linha'].create(null, pai.content.cut($from.parentOffset, $to.parentOffset));
    return [semFonte(linhaDe(solta))];
  }
  const inteiros = new Set<PMNode>();
  state.doc.forEach((n) => inteiros.add(n));
  const linhas: LinhaDoc[] = [];
  const trecho = sel.content().content;
  // as células selecionadas vêm como fileiras soltas (o `prosemirror-tables`): a tabela em volta delas,
  // no jeito da de onde vieram, com o alinhamento das colunas delas e sem as células de sobra
  if (trecho.firstChild?.type === N['fileira']) {
    const de = tabelaEm($from)?.node;
    const fileiras: PMNode[] = [];
    trecho.forEach((f) => fileiras.push(N['fileira'].create(null, f.content)));
    const alinhar: (string | null)[] = [];
    fileiras[0].forEach((c) => alinhar.push((c.attrs['alinhar'] as string | null) ?? null));
    return [linhaDe(N['tabela'].create({ jeito: de?.attrs['jeito'] ?? null, alinhar }, fileiras))];
  }
  trecho.forEach((n) => {
    if (!n.type.isInGroup('bloco')) return;
    const l = linhaDe(n);
    if (l.kind === 'cru') {
      linhas.push(l);
      return;
    }
    const f = inteiros.has(n) ? (fonteDe(n) ?? l.fonte) : undefined;
    linhas.push(f ? { ...l, fonte: f } : semFonte(l));
  });
  // o recuo de todas junto sai (um pedaço de dentro de uma lista vem para a margem)
  const recuos = linhas.filter((l) => l.kind !== 'cru' && !(l.kind === 'linha' && !l.spans.length)).map((l) => l.recuo);
  const menor = recuos.length ? Math.min(...recuos) : 0;
  if (!menor) return linhas;
  return linhas.map((l) => (l.kind === 'cru' ? l : semFonte({ ...l, recuo: Math.max(0, l.recuo - menor), ...(l.kind === 'codigo' ? { margem: Math.max(0, l.margem - menor) } : {}) } as LinhaDoc)));
}

function semFonte(l: LinhaDoc): LinhaDoc {
  if (!l.fonte) return l;
  const { fonte: _, ...resto } = l;
  return resto as LinhaDoc;
}

// ===== O HTML =====

/**
 * O trecho em HTML para o Docs, o Word e o e-mail: os títulos em `h1`–`h3`, as listas em `ul`/`ol` (as
 * de dentro pelo recuo; a tarefa com a caixinha desenhada ☐ ☑), a citação, o código, a tabela com o
 * cabeçalho, as marcas em `strong`, `em`, `s`, `mark`, `code`, `small` e os links. O widget vira as
 * palavras dele (a imagem de um link, a imagem). Montado por elementos, nunca por texto: nada do que se
 * escreveu vira etiqueta.
 */
export function htmlDe(linhas: readonly LinhaDoc[], markdown: string, ctx: CopyContext): string {
  const doc = document.implementation.createHTMLDocument('');
  const raiz = doc.createElement('div');
  raiz.setAttribute(ATRIBUTO_MURALL, markdown);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, ...filhos: (Node | string)[]) => {
    const e = doc.createElement(tag);
    e.append(...filhos);
    return e;
  };
  // o spoiler seguido (um negrito dentro dele) é um trecho só, entre um par de "||"
  const letras = (spans: readonly Span[]): Node[] => spans.map((s, i) => pedaco(doc, s, !!s.spoiler && !spans[i - 1]?.spoiler, !!s.spoiler && !spans[i + 1]?.spoiler));
  const paragrafo = (spans: readonly Span[]) => {
    const p = el('p', ...letras(spans));
    if (!spans.length) p.append(doc.createElement('br'));
    return p;
  };
  // as listas abertas, da de fora para a de dentro
  let pilha: { recuo: number; tipo: 'ul' | 'ol' | 'check'; lista: HTMLElement; ultimo: HTMLElement | null }[] = [];
  let citacao: HTMLElement | null = null;
  for (const l of linhas) {
    if (l.kind !== 'item') pilha = [];
    if (l.kind !== 'citacao') citacao = null;
    switch (l.kind) {
      case 'linha':
        raiz.append(paragrafo(l.spans));
        break;
      case 'titulo':
        raiz.append(el(`h${l.nivel}` as 'h1', ...letras(l.spans)));
        break;
      case 'sutil':
        raiz.append(el('p', el('small', ...letras(l.spans))));
        break;
      case 'citacao':
        if (!citacao) raiz.append((citacao = el('blockquote')));
        citacao.append(paragrafo(l.spans));
        break;
      case 'divisoria':
        raiz.append(el('hr'));
        break;
      case 'codigo':
        raiz.append(el('pre', el('code', l.texto)));
        break;
      case 'item': {
        while (pilha.length && pilha[pilha.length - 1].recuo > l.recuo) pilha.pop();
        let topo = pilha[pilha.length - 1];
        const tipoDaLista = (t: string) => (t === 'ol' ? 'ol' : 'ul');
        if (topo && topo.recuo === l.recuo && tipoDaLista(topo.tipo) !== tipoDaLista(l.tipo)) {
          pilha.pop();
          topo = pilha[pilha.length - 1];
        }
        if (!topo || topo.recuo < l.recuo) {
          const lista = doc.createElement(tipoDaLista(l.tipo));
          if (l.tipo === 'ol' && /^\d+$/.test(l.numero) && l.numero !== '1') lista.setAttribute('start', l.numero);
          (topo?.ultimo ?? raiz).append(lista);
          topo = { recuo: l.recuo, tipo: l.tipo, lista, ultimo: null };
          pilha.push(topo);
        }
        const li = el('li');
        if (l.tipo === 'check') {
          li.style.listStyleType = 'none';
          li.append(l.feita ? '☑ ' : '☐ ');
        }
        li.append(...(l.tipo === 'check' && l.feita ? [el('s', ...letras(l.spans))] : letras(l.spans)));
        topo.lista.append(li);
        topo.ultimo = li;
        break;
      }
      case 'tabela': {
        const tabela = el('table');
        tabela.setAttribute('border', '1');
        tabela.style.borderCollapse = 'collapse';
        const celula = (tag: 'th' | 'td', spans: readonly Span[], c: number) => {
          const td = el(tag, ...letras(spans));
          if (l.alinhar[c]) td.style.textAlign = l.alinhar[c]!;
          return td;
        };
        tabela.append(el('thead', el('tr', ...l.cabeca.map((s, c) => celula('th', s, c)))));
        tabela.append(el('tbody', ...l.fileiras.map((f) => el('tr', ...f.map((s, c) => celula('td', s, c))))));
        raiz.append(tabela);
        break;
      }
      case 'widget': {
        const { url, caption } = l.nome === 'imagem' ? readMedia(l.args) : { url: '', caption: '' };
        if (/^https:\/\//i.test(url)) {
          const img = doc.createElement('img');
          img.src = url;
          img.alt = caption;
          raiz.append(el('p', img));
        } else raiz.append(el('p', widgetCopy(l.nome, l.args, ctx)));
        break;
      }
      case 'cru':
        for (const t of copyText(l.linhas.join('\n'), ctx).split('\n')) raiz.append(paragrafo(t ? [{ text: t }] : []));
        break;
    }
  }
  return raiz.outerHTML;
}

/** Um pedaço com as marcas dele, de fora para dentro: o link, o negrito, o itálico, o riscado, o marca-texto, o código, o sutil. */
function pedaco(doc: Document, s: Span, abreSpoiler: boolean, fechaSpoiler: boolean): Node {
  // o spoiler, como na cópia em texto: entre "||", como se escreve no Discord
  let no: Node = doc.createTextNode((abreSpoiler ? '||' : '') + s.text + (fechaSpoiler ? '||' : ''));
  const embrulha = (tag: string) => {
    const e = doc.createElement(tag);
    e.append(no);
    no = e;
  };
  if (s.subtle) embrulha('small');
  if (s.code) embrulha('code');
  if (s.mark) embrulha('mark');
  if (s.strike) embrulha('s');
  if (s.italic) embrulha('em');
  if (s.bold) embrulha('strong');
  if (s.href && /^(?:https?:|mailto:)/i.test(s.href)) {
    const a = doc.createElement('a');
    a.href = s.href;
    a.append(no);
    no = a;
  }
  return no;
}
