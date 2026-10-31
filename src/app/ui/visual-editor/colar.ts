import { Fragment, Node as PMNode, Slice } from 'prosemirror-model';
import { EditorState, Plugin, Selection, Transaction } from 'prosemirror-state';
import { handlePaste as colarCelulas } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import { parseInline } from '../../core/rich-text';
import { MAX_TABLE_COLS, MAX_TABLE_ROWS, pastedGrid } from '../../core/tables';
import { markdownColado } from '../../core/transferencia';
import { IMAGEM_COLADA, lerHtml } from './html';
import { Lugar } from './pecas';
import { docDe, schema, sliceDoTexto, tabelaDe } from './schema';
import { celulaEm, colarNaCelula } from './tabela';

/**
 * Colar no Visual (PLANO-EDITOR-VISUAL.md, 5.16, 5.18 e os defeitos C1–C10 de 6.6), nesta ordem:
 *
 * 1. o tipo próprio do Murall (`text/x-murall-markdown`, ou o markdown que o HTML do Visual leva, quando
 *    o navegador não deixa o tipo chegar): lido como markdown, com tudo (widgets, tabelas, marcas);
 * 2. uma imagem sem texto junto: a imagem colada (ver pecas.ts, que vem antes deste plugin);
 * 3. o HTML de fora (o Docs, o Word, um site, o e-mail, uma planilha): traduzido para o que o Murall tem
 *    (ver html.ts); a imagem `data:` é guardada como colada; a que não vem é avisada;
 * 4. o texto com tab em várias linhas (uma planilha): fora de uma tabela, uma tabela nova; dentro de uma,
 *    as células se espalham a partir da do cursor (tabela.ts);
 * 5. o texto: lido como markdown do Murall (P5). Ctrl+Shift+V cola como letras, sem ler nada.
 *
 * O limite (5.18): o que passaria dele entra até onde cabe, por linhas inteiras (a marca nunca fica pela
 * metade), com o aviso "Parte do que foi colado não coube".
 */

const N = schema.nodes;

export interface AcoesColar {
  /** O tamanho do texto que o documento escreve (o limite conta a string guardada). */
  tamanho(doc: PMNode): number;
  /** O máximo de caracteres (null: sem limite). */
  max(): number | null;
  /** Uma imagem que veio dentro do HTML: quem cola a encolhe, guarda e põe no lugar dela. */
  imagem(arquivo: Blob, lugar: Lugar): void;
  /** Um aviso curto para a pessoa. */
  aviso(texto: string): void;
}

/** O Ctrl+Shift+V (o colar como letras), como o ProseMirror o lê (o Shift+Insert do Windows não conta). */
export function colandoComoLetras(view: EditorView): boolean {
  const input = (view as unknown as { input?: { shiftKey?: boolean; lastKeyCode?: number | null } }).input;
  return !!input?.shiftKey && input.lastKeyCode !== 45;
}

export function colar(acoes: AcoesColar): Plugin {
  return new Plugin({
    props: {
      handlePaste: (view, e, slice) => colarAqui(view, e, slice, acoes),
    },
  });
}

function colarAqui(view: EditorView, e: ClipboardEvent, dado: Slice, acoes: AcoesColar): boolean {
  const data = e.clipboardData;
  const { $from } = view.state.selection;
  // no bloco de código, as letras (o ProseMirror já as leu do texto)
  if (!data || $from.parent.type.spec.code) return comLimite(view, dado, acoes);
  const letras = colandoComoLetras(view);
  let slice: Slice | null = null;
  let imagens: string[] = [];
  let faltaram = 0;
  if (!letras) {
    const md = markdownColado(data);
    if (md !== null) slice = sliceDoTexto(md, false);
    else {
      const html = data.getData('text/html');
      if (html.trim()) {
        const lido = lerHtml(html);
        if (lido.linhas.length || lido.faltaram) {
          slice = lido.linhas.length ? sliceDe(docDe(lido.linhas).content) : Slice.empty;
          imagens = lido.imagens;
          faltaram = lido.faltaram;
        } else {
          // o HTML não trouxe nada que o Murall tenha: o texto que veio junto
          const texto = data.getData('text/plain');
          slice = texto ? (view.someProp('clipboardTextParser', (f) => f(texto, $from, false, view)) ?? null) : null;
        }
      }
    }
  }
  // o colar de sempre do ProseMirror (o texto lido pelo `clipboardTextParser`), só com o limite
  if (!slice) return comLimite(view, dado, acoes);
  const naCelula = !!celulaEm($from);
  if (naCelula) {
    // na célula, as linhas viram letras; as células de outra tabela se espalham (o `prosemirror-tables`)
    const antes = slice.content.childCount;
    slice = colarNaCelula(slice, view);
    if (imagens.length && slice.content.childCount !== antes) faltaram += imagens.length;
    imagens = [];
    const t = slice.content.firstChild;
    if (t?.type === N['tabela'] && slice.content.childCount === 1 && colarCelulas(view, e, slice)) return avisaFaltas(acoes, faltaram);
  }
  const tr = colocar(view.state, slice, acoes, true);
  if (!tr) return avisaFaltas(acoes, faltaram);
  // as imagens que vieram no HTML: no lugar de cada uma, o marcador de "Guardando a imagem…"
  const lugares = tiraMarcadores(tr);
  view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
  for (const { i, lugar } of lugares) {
    const blob = imagens[i] ? blobDe(imagens[i]) : null;
    if (blob) acoes.imagem(blob, lugar);
    else faltaram++;
  }
  return avisaFaltas(acoes, faltaram);
}

/**
 * O colar de sempre do ProseMirror (o texto lido como markdown, a planilha numa célula), só quando passa
 * do limite: aí entra o que cabe. Cabendo, ele segue (false) pelo caminho de sempre.
 */
function comLimite(view: EditorView, slice: Slice, acoes: AcoesColar): boolean {
  const max = acoes.max();
  if (!max || !slice.content.size || celulaEm(view.state.selection.$from)) return false;
  const tr = colocar(view.state, slice, acoes, false);
  if (tr === undefined) return false;
  if (tr) view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
  return true;
}

/**
 * A transação que põe o trecho no lugar da seleção, cortada por linhas inteiras se passar do limite.
 * null: nada coube (com o aviso). `undefined` (só sem `sempre`): coube inteiro, e o colar de sempre segue.
 */
function colocar(state: EditorState, slice: Slice, acoes: AcoesColar, sempre: true): Transaction | null;
function colocar(state: EditorState, slice: Slice, acoes: AcoesColar, sempre: false): Transaction | null | undefined;
function colocar(state: EditorState, slice: Slice, acoes: AcoesColar, sempre: boolean): Transaction | null | undefined {
  const max = acoes.max();
  const inteiro = poe(state, slice);
  const passa = (tr: Transaction) => !!max && acoes.tamanho(tr.doc) > max && acoes.tamanho(tr.doc) > acoes.tamanho(state.doc);
  if (!passa(inteiro)) return sempre ? inteiro : undefined;
  const limite = `chegou no limite de ${new Intl.NumberFormat('pt-BR').format(max!)} caracteres`;
  // as primeiras `k` linhas do que foi colado: a maior quantidade que cabe
  const nos: PMNode[] = [];
  slice.content.forEach((n) => nos.push(n));
  const com = (k: number) => poe(state, new Slice(Fragment.from(nos.slice(0, k)), slice.openStart, k === nos.length ? slice.openEnd : nos[k - 1].isTextblock ? 1 : 0));
  let [cabe, nao] = [0, nos.length];
  while (nao - cabe > 1) {
    const meio = (cabe + nao) >> 1;
    if (passa(com(meio))) nao = meio;
    else cabe = meio;
  }
  if (!cabe) {
    acoes.aviso(`O que foi colado não coube: ${limite}`);
    return null;
  }
  acoes.aviso(`Parte do que foi colado não coube: ${limite}`);
  return com(cabe);
}

/**
 * Põe o trecho no lugar da seleção. Na linha vazia do texto (sem recuo), o que foi colado toma o lugar
 * dela inteiro: o título colado continua título, o item continua item (como no Docs).
 */
function poe(state: EditorState, slice: Slice): Transaction {
  const tr = state.tr;
  const { $from, empty } = state.selection;
  const primeiro = slice.content.firstChild;
  if (empty && $from.depth === 1 && $from.parent.type === N['linha'] && !$from.parent.content.size && !$from.parent.attrs['recuo'] && primeiro?.isBlock) {
    const de = $from.before(1);
    tr.replaceWith(de, $from.after(1), slice.content);
    const fim = de + slice.content.size;
    return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(fim, tr.doc.content.size)), -1));
  }
  const sozinho = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1 ? slice.content.firstChild : null;
  return sozinho ? tr.replaceSelectionWith(sozinho, false) : tr.replaceSelection(slice);
}

/** O trecho das linhas, aberto nas pontas que são linhas de letras (elas se juntam com a do cursor). */
function sliceDe(conteudo: Fragment): Slice {
  if (!conteudo.childCount) return Slice.empty;
  return new Slice(conteudo, conteudo.firstChild!.isTextblock ? 1 : 0, conteudo.lastChild!.isTextblock ? 1 : 0);
}

/** Tira os marcadores das imagens `data:` (os widgets de mentira) e devolve onde cada uma vai. */
function tiraMarcadores(tr: Transaction): { i: number; lugar: Lugar }[] {
  const achados: { pos: number; i: number }[] = [];
  tr.doc.forEach((n, pos) => {
    const a = n.type === N['widget'] ? String((n.attrs['args'] as string[])[0] ?? '') : '';
    if (a.startsWith(IMAGEM_COLADA)) achados.push({ pos, i: +a.slice(IMAGEM_COLADA.length) });
  });
  const feitos: { i: number; pos: number; passo: number }[] = [];
  for (const { pos, i } of achados.reverse()) {
    const n = tr.doc.nodeAt(pos)!;
    if (tr.doc.childCount === 1) tr.replaceWith(pos, pos + n.nodeSize, N['linha'].create());
    else tr.delete(pos, pos + n.nodeSize);
    feitos.push({ i, pos, passo: tr.steps.length });
  }
  return feitos.reverse().map(({ i, pos, passo }) => ({ i, lugar: { pos: tr.mapping.slice(passo).map(pos, -1), lado: -1 as const } }));
}

/** A imagem `data:` em bytes (sem `fetch`: a CSP não deixa ler `data:`). */
function blobDe(url: string): Blob | null {
  const m = /^data:(image\/[\w+.-]+);base64,(.*)$/is.exec(url);
  if (!m) return null;
  try {
    const bin = atob(m[2].replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1].toLowerCase() });
  } catch {
    return null;
  }
}

function avisaFaltas(acoes: AcoesColar, faltaram: number): true {
  if (faltaram === 1) acoes.aviso('1 imagem não veio: cole ela sozinha');
  else if (faltaram > 1) acoes.aviso(`${faltaram} imagens não vieram: cole cada uma sozinha`);
  return true;
}

/**
 * O texto de uma planilha (com tab, em várias linhas, todas com as mesmas colunas), fora de uma tabela:
 * uma tabela nova, como o Docs faz (a primeira fileira é o cabeçalho), nos limites da folha da tabela.
 * Null quando não é (o código com tab no começo das linhas não é: a primeira linha não tem tab).
 */
export function sliceDaPlanilha(texto: string, comoLetras: boolean): Slice | null {
  if (comoLetras) return null;
  const grade = pastedGrid(texto);
  if (!grade || grade.length < 2) return null;
  const largura = grade[0].length;
  if (largura < 2 || grade.some((l) => l.length !== largura)) return null;
  const cols = Math.min(largura, MAX_TABLE_COLS);
  const spans = grade.slice(0, MAX_TABLE_ROWS + 1).map((l) => l.slice(0, cols).map((c) => (c ? parseInline(c) : [])));
  const tabela = tabelaDe(spans[0], spans.slice(1), { recuo: 0, fonte: null, jeito: null, alinhar: [] });
  return new Slice(Fragment.from(tabela), 0, 0);
}

