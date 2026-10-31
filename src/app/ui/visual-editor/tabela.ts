import { GapCursor } from 'prosemirror-gapcursor';
import { Fragment, Node as PMNode, ResolvedPos, Slice } from 'prosemirror-model';
import { Command, EditorState, Plugin, Selection, TextSelection, Transaction } from 'prosemirror-state';
import { CellSelection, TableMap, tableEditing } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import { parseInline } from '../../core/rich-text';
import { Align, MAX_TABLE_COLS, MAX_TABLE_ROWS, TableLook, pastedGrid } from '../../core/tables';
import { linkarEndereco } from './links';
import { inlineDe, schema } from './schema';
import { AcaoTabela, EstadoTabela } from './visual-api';

/**
 * A tabela escrita direto na folha, como no Docs (PLANO-EDITOR-VISUAL.md, 5.14 e a rodada 6): o nó
 * `tabela` › `fileira` › `cabeca` (só na primeira) e `celula`, cada célula com letras e marcas, sem
 * quebra de linha. O `prosemirror-tables` cuida da seleção de várias células, das setas entre elas e do
 * colar de células; aqui ficam as teclas do Murall (Enter desce, Shift+Enter sobe, Tab anda e cria a
 * fileira na última célula), o que o menu "Tabela" da régua faz, o colar de uma planilha (com tab, as
 * células se espalham; sem tab, as linhas se juntam com espaço) e as lições do apagar do Android (a
 * rodada 0, seção 12 do plano):
 *
 * - o Backspace no começo de uma célula passa para o fim da de antes, sem juntar as duas (na primeira,
 *   para); o Delete, o espelho. Na linha logo depois da tabela, o Backspace leva o cursor para o fim da
 *   última célula (a linha vazia sai); o Delete antes dela, o espelho;
 * - uma seleção que toca uma tabela (começa ou acaba nela, ou a atravessa) só tira o texto de cada linha
 *   e de cada célula do trecho: fileiras e colunas nunca saem por um apagar, nem por uma letra escrita, um
 *   colar ou um recortar por cima dela. A tabela inteira sai pelo menu (Tirar a tabela).
 *
 * Sem célula mesclada: a que chegar mesclada (colada de fora) é desfeita em células vazias, e o
 * cabeçalho é sempre a primeira fileira, e duas tabelas seguidas ganham uma linha vazia entre elas (no
 * texto, a de baixo seria mais fileiras da de cima): `tabelasRetas`. Os limites são os da folha da tabela
 * (`MAX_TABLE_COLS`, `MAX_TABLE_ROWS`).
 */

const N = schema.nodes;
const TABELA = N['tabela'];
const FILEIRA = N['fileira'];
const CABECA = N['cabeca'];
const CELULA = N['celula'];

// ===== Onde está o cursor =====

/** A tabela onde está a posição (as tabelas moram no alto do documento), com a posição dela. */
export function tabelaEm($p: ResolvedPos): { pos: number; node: PMNode } | null {
  return $p.depth >= 1 && $p.node(1).type === TABELA ? { pos: $p.before(1), node: $p.node(1) } : null;
}

/** Uma célula: a fileira (0 é o cabeçalho), a coluna e a letra dentro dela. */
export interface NaCelula {
  f: number;
  c: number;
  off: number;
}

/** A célula onde cai a posição (entre células ou fileiras, a mais perto). */
export function celulaEm($p: ResolvedPos): NaCelula | null {
  const t = tabelaEm($p);
  if (!t) return null;
  if ($p.depth >= 3) return { f: $p.index(1), c: $p.index(2), off: $p.parentOffset };
  if ($p.depth === 2) return { f: $p.index(1), c: Math.min($p.index(2), $p.node(2).childCount - 1), off: 0 };
  return { f: Math.min($p.index(1), t.node.childCount - 1), c: 0, off: 0 };
}

/** A célula do cursor (na seleção de várias células, a da ponta que anda). */
function celulaDoCursor(state: EditorState): (NaCelula & { tabela: { pos: number; node: PMNode } }) | null {
  const sel = state.selection;
  const $p = sel instanceof CellSelection ? state.doc.resolve(sel.$headCell.pos + 1) : sel.$head;
  const tabela = tabelaEm($p);
  const at = celulaEm($p);
  return tabela && at ? { ...at, tabela } : null;
}

/** A posição da letra `off` da célula (`f`, `c`) da tabela que começa em `pos` (`fim`: o fim da célula). */
export function posDaCelula(tabela: PMNode, pos: number, f: number, c: number, off = 0, fim = false): number {
  const fi = Math.max(0, Math.min(f, tabela.childCount - 1));
  let at = pos + 1;
  for (let k = 0; k < fi; k++) at += tabela.child(k).nodeSize;
  const fileira = tabela.child(fi);
  const ci = Math.max(0, Math.min(c, fileira.childCount - 1));
  at += 1;
  for (let k = 0; k < ci; k++) at += fileira.child(k).nodeSize;
  const celula = fileira.child(ci);
  return at + 1 + (fim ? celula.content.size : Math.min(off, celula.content.size));
}

/** O cursor na célula (no fim dela, com `fim`), ou o conteúdo dela inteiro selecionado (`tudo`). */
function naCelula(doc: PMNode, pos: number, f: number, c: number, jeito: 'comeco' | 'fim' | 'tudo', off?: number): Selection {
  const t = doc.nodeAt(pos)!;
  const de = posDaCelula(t, pos, f, c, 0);
  const ate = posDaCelula(t, pos, f, c, 0, true);
  if (off !== undefined) return TextSelection.create(doc, Math.min(de + off, ate));
  if (jeito === 'tudo') return TextSelection.create(doc, de, ate);
  return TextSelection.create(doc, jeito === 'fim' ? ate : de);
}

// ===== A grade: a tabela como fileiras de células, para os comandos do menu =====

interface Grade {
  celulas: PMNode[][];
  sobra: string[][];
  alinhar: Align[];
}

function gradeDe(t: PMNode): Grade {
  const celulas: PMNode[][] = [];
  const sobra: string[][] = [];
  t.forEach((f) => {
    const linha: PMNode[] = [];
    f.forEach((c) => linha.push(c));
    celulas.push(linha);
    sobra.push([...((f.attrs['sobra'] as string[]) ?? [])]);
  });
  const cols = celulas[0]?.length ?? 1;
  const alinhar = Array.from({ length: cols }, (_, c) => ((t.attrs['alinhar'] as Align[]) ?? [])[c] ?? null);
  return { celulas, sobra, alinhar };
}

/** A tabela da grade (com os atributos de `t`): o cabeçalho em cima, cada célula com o alinhamento da coluna. */
function tabelaDaGrade(t: PMNode, g: Grade): PMNode {
  const fileiras = g.celulas.map((linha, f) =>
    FILEIRA.create(
      { sobra: g.sobra[f] ?? [] },
      linha.map((cel, c) => (f ? CELULA : CABECA).create({ alinhar: g.alinhar[c] ?? null }, cel.content)),
    ),
  );
  return TABELA.create({ ...t.attrs, alinhar: [...g.alinhar] }, fileiras);
}

const vazia = (f: number) => (f ? CELULA : CABECA).create();

/**
 * Muda a tabela do cursor pela grade dela: `mexe` muda a grade e diz onde o cursor fica (null: não dá,
 * e o comando não vale). A tabela inteira é trocada num passo só (o Ctrl+Z volta tudo).
 */
function refaz(mexe: (g: Grade, at: NaCelula) => NaCelula | null): Command {
  return (state, dispatch) => {
    const at = celulaDoCursor(state);
    if (!at) return false;
    const g = gradeDe(at.tabela.node);
    const depois = mexe(g, at);
    if (!depois) return false;
    if (dispatch) {
      const nova = tabelaDaGrade(at.tabela.node, g);
      const tr = state.tr.replaceWith(at.tabela.pos, at.tabela.pos + at.tabela.node.nodeSize, nova);
      tr.setSelection(naCelula(tr.doc, at.tabela.pos, depois.f, depois.c, 'comeco', depois.off));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// ===== O menu "Tabela" da régua =====

export function estadoTabela(state: EditorState): EstadoTabela | null {
  const at = celulaDoCursor(state);
  if (!at) return null;
  const t = at.tabela.node;
  return {
    fileira: at.f,
    fileiras: t.childCount,
    coluna: at.c,
    colunas: t.firstChild?.childCount ?? 1,
    alinhar: ((t.attrs['alinhar'] as Align[]) ?? [])[at.c] ?? null,
    jeito: (t.attrs['jeito'] as TableLook | null) ?? 'branca',
  };
}

/** As colunas da seleção de células (ou a do cursor). */
function colunasDaSelecao(state: EditorState, c: number): number[] {
  const sel = state.selection;
  if (!(sel instanceof CellSelection)) return [c];
  const t = sel.$anchorCell.node(-1);
  const start = sel.$anchorCell.start(-1);
  const r = TableMap.get(t).rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start);
  return Array.from({ length: r.right - r.left }, (_, k) => r.left + k);
}

/** O comando de uma ação do menu "Tabela" (false: não vale ali, como o botão apagado da grade). */
export function acaoTabela(acao: AcaoTabela): Command {
  if (typeof acao === 'object' && 'jeito' in acao)
    return (state, dispatch) => {
      const at = celulaDoCursor(state);
      if (!at) return false;
      if (dispatch) dispatch(state.tr.setNodeAttribute(at.tabela.pos, 'jeito', acao.jeito === 'branca' ? null : acao.jeito));
      return true;
    };
  if (typeof acao === 'object')
    return (state, dispatch) => {
      const at = celulaDoCursor(state);
      if (!at) return false;
      const cols = colunasDaSelecao(state, at.c);
      return refaz((g, a) => {
        for (const c of cols) g.alinhar[c] = acao.alinhar;
        return a;
      })(
        state,
        dispatch &&
          ((tr) => {
            // a seleção de células continua (o alinhamento de várias colunas de uma vez)
            // (alinhar não muda o tamanho de nada: as posições das células são as mesmas)
            const s = state.selection;
            if (s instanceof CellSelection) tr.setSelection(new CellSelection(tr.doc.resolve(s.$anchorCell.pos), tr.doc.resolve(s.$headCell.pos)));
            dispatch(tr);
          }),
      );
    };
  switch (acao) {
    case 'fileiraEmCima':
    case 'fileiraEmbaixo':
      return refaz((g, a) => {
        if (g.celulas.length - 1 >= MAX_TABLE_ROWS || (acao === 'fileiraEmCima' && a.f === 0)) return null;
        const f = acao === 'fileiraEmCima' ? a.f : a.f + 1;
        g.celulas.splice(f, 0, g.alinhar.map(() => vazia(f)));
        g.sobra.splice(f, 0, []);
        return { f, c: a.c, off: 0 };
      });
    case 'colunaAntes':
    case 'colunaDepois':
      return refaz((g, a) => {
        if (g.alinhar.length >= MAX_TABLE_COLS) return null;
        const c = acao === 'colunaAntes' ? a.c : a.c + 1;
        g.celulas.forEach((linha, f) => linha.splice(c, 0, vazia(f)));
        g.alinhar.splice(c, 0, null);
        return { f: a.f, c, off: 0 };
      });
    case 'subirFileira':
    case 'descerFileira':
      return refaz((g, a) => {
        const para = a.f + (acao === 'subirFileira' ? -1 : 1);
        // o cabeçalho fica onde está (como na grade da folha)
        if (a.f === 0 || para < 1 || para >= g.celulas.length) return null;
        [g.celulas[a.f], g.celulas[para]] = [g.celulas[para], g.celulas[a.f]];
        [g.sobra[a.f], g.sobra[para]] = [g.sobra[para], g.sobra[a.f]];
        return { ...a, f: para };
      });
    case 'colunaParaTras':
    case 'colunaParaFrente':
      return refaz((g, a) => {
        const para = a.c + (acao === 'colunaParaTras' ? -1 : 1);
        if (para < 0 || para >= g.alinhar.length) return null;
        for (const linha of g.celulas) [linha[a.c], linha[para]] = [linha[para], linha[a.c]];
        [g.alinhar[a.c], g.alinhar[para]] = [g.alinhar[para], g.alinhar[a.c]];
        return { ...a, c: para };
      });
    case 'tirarFileira':
      return refaz((g, a) => {
        if (a.f === 0 || g.celulas.length <= 2) return null;
        g.celulas.splice(a.f, 1);
        g.sobra.splice(a.f, 1);
        return { f: Math.min(a.f, g.celulas.length - 1), c: a.c, off: 0 };
      });
    case 'tirarColuna':
      return refaz((g, a) => {
        if (g.alinhar.length <= 1) return null;
        for (const linha of g.celulas) linha.splice(a.c, 1);
        g.alinhar.splice(a.c, 1);
        return { f: a.f, c: Math.min(a.c, g.alinhar.length - 1), off: 0 };
      });
    case 'tirarTabela':
      return (state, dispatch) => {
        const at = celulaDoCursor(state);
        if (!at) return false;
        if (dispatch) dispatch(tiraTabela(state.tr, at.tabela.pos).scrollIntoView());
        return true;
      };
  }
}

/** Tira a tabela em `pos` (o texto nunca fica sem linha: sozinha, ela vira a linha vazia). O cursor fica ali. */
export function tiraTabela(tr: Transaction, pos: number): Transaction {
  const n = tr.doc.nodeAt(pos);
  if (!n) return tr;
  if (tr.doc.childCount === 1) tr.replaceWith(pos, pos + n.nodeSize, N['linha'].create());
  else tr.delete(pos, pos + n.nodeSize);
  return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), 1));
}

/** Uma tabela vazia de `cols` colunas e `fileiras` fileiras embaixo do cabeçalho (a de Inserir › Tabela: 3×2). */
export function tabelaVazia(recuo: number, cols = 3, fileiras = 2): PMNode {
  return TABELA.create(
    { recuo, alinhar: Array(cols).fill(null) },
    Array.from({ length: fileiras + 1 }, (_, f) => FILEIRA.create(null, Array.from({ length: cols }, () => vazia(f)))),
  );
}

// ===== As teclas da célula =====

/**
 * Enter na célula: a de baixo (na última fileira, uma fileira nova, até o limite); Shift+Enter, a de
 * cima (no cabeçalho, fica). O endereço solto logo antes do cursor vira link, como no fim de uma linha.
 */
export function enterNaTabela(dir: 1 | -1): Command {
  return (state, dispatch) => {
    const at = celulaDoCursor(state);
    if (!at) return false;
    const t = at.tabela.node;
    const f = at.f + dir;
    if (f < 0) return true;
    if (f >= t.childCount && t.childCount - 1 >= MAX_TABLE_ROWS) return true;
    if (dispatch) {
      const tr = state.tr;
      if (state.selection.empty) linkarEndereco(tr, state.selection.from, state);
      if (f >= t.childCount) {
        const atual = tr.doc.nodeAt(at.tabela.pos)!;
        tr.insert(at.tabela.pos + atual.nodeSize - 1, FILEIRA.create(null, Array.from({ length: atual.firstChild!.childCount }, () => vazia(f))));
      }
      tr.setSelection(naCelula(tr.doc, at.tabela.pos, f, at.c, 'fim'));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/**
 * Tab na célula: a próxima, com o que tem nela selecionado (na última, uma fileira nova, até o limite);
 * Shift+Tab, a de antes. Na primeira célula, o Shift+Tab passa (o foco sai da folha: o Tab nunca prende).
 */
export function tabNaTabela(dir: 1 | -1): Command {
  return (state, dispatch) => {
    const at = celulaDoCursor(state);
    if (!at) return false;
    const t = at.tabela.node;
    const cols = t.firstChild!.childCount;
    let f = at.f;
    let c = at.c + dir;
    if (c >= cols) [f, c] = [f + 1, 0];
    if (c < 0) [f, c] = [f - 1, cols - 1];
    if (f < 0) return false;
    if (f >= t.childCount && t.childCount - 1 >= MAX_TABLE_ROWS) return true;
    if (dispatch) {
      const tr = state.tr;
      if (f >= t.childCount) tr.insert(at.tabela.pos + t.nodeSize - 1, FILEIRA.create(null, Array.from({ length: cols }, () => vazia(f))));
      tr.setSelection(naCelula(tr.doc, at.tabela.pos, f, c, 'tudo'));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** A célula antes (ou depois) da (`f`, `c`), na ordem de leitura; null na primeira (ou na última). */
function vizinha(t: PMNode, f: number, c: number, dir: 1 | -1): { f: number; c: number } | null {
  const cols = t.firstChild!.childCount;
  let [nf, nc] = [f, c + dir];
  if (nc < 0) [nf, nc] = [f - 1, cols - 1];
  if (nc >= cols) [nf, nc] = [f + 1, 0];
  return nf < 0 || nf >= t.childCount ? null : { f: nf, c: nc };
}

/**
 * O apagar nas bordas da célula (a lição do Android): no começo de uma célula, o Backspace passa para o
 * fim da de antes, sem juntar as duas (na primeira célula, para: a tecla fica com a tabela); no fim, o
 * Delete passa para o começo da próxima. O cursor de lacuna logo depois de uma tabela: o Backspace entra
 * no fim da última célula; logo antes, o Delete entra no começo da primeira.
 */
export function apagarNaTabela(dir: 1 | -1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (sel instanceof GapCursor) {
      const t = dir < 0 ? sel.$from.nodeBefore : sel.$from.nodeAfter;
      if (t?.type !== TABELA) return false;
      const pos = dir < 0 ? sel.from - t.nodeSize : sel.from;
      if (dispatch) dispatch(state.tr.setSelection(dir < 0 ? naCelula(state.doc, pos, t.childCount - 1, t.lastChild!.childCount - 1, 'fim') : naCelula(state.doc, pos, 0, 0, 'comeco')).scrollIntoView());
      return true;
    }
    if (!(sel instanceof TextSelection) || !sel.empty) return false;
    const at = celulaDoCursor(state);
    if (!at) return false;
    const $c = sel.$from;
    if (dir < 0 ? $c.parentOffset > 0 : $c.parentOffset < $c.parent.content.size) return false;
    const v = vizinha(at.tabela.node, at.f, at.c, dir);
    if (v && dispatch) dispatch(state.tr.setSelection(naCelula(state.doc, at.tabela.pos, v.f, v.c, dir < 0 ? 'fim' : 'comeco')).scrollIntoView());
    return true;
  };
}

/**
 * Backspace no começo da linha logo depois de uma tabela (`dir` -1), ou Delete no fim da linha logo antes
 * dela (1): o cursor entra na tabela (no fim da última célula, ou no começo da primeira), e a linha vazia
 * sai. A tabela nunca se junta a uma linha.
 */
export function entrarNaTabela(dir: 1 | -1): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!(sel instanceof TextSelection) || !sel.empty) return false;
    const $c = sel.$from;
    if ($c.depth !== 1 || (dir < 0 ? $c.parentOffset > 0 : $c.parentOffset < $c.parent.content.size)) return false;
    const i = $c.index(0);
    const t = state.doc.maybeChild(i + dir);
    if (t?.type !== TABELA) return false;
    if (dispatch) {
      const tr = state.tr;
      const linha = $c.before(1);
      if (!$c.parent.content.size) tr.delete(linha, $c.after(1));
      const pos = dir < 0 ? linha - t.nodeSize : tr.mapping.map($c.after(1));
      tr.setSelection(dir < 0 ? naCelula(tr.doc, pos, t.childCount - 1, t.lastChild!.childCount - 1, 'fim') : naCelula(tr.doc, pos, 0, 0, 'comeco'));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

// ===== A seleção que toca uma tabela só tira texto =====

/** A seleção de texto vai além de uma linha e toca uma tabela (começa ou acaba nela, ou a atravessa). */
export function tocaTabela(state: EditorState): boolean {
  const sel = state.selection;
  if (!(sel instanceof TextSelection) || sel.empty || sel.$from.sameParent(sel.$to)) return false;
  let toca = false;
  state.doc.nodesBetween(sel.from, sel.to, (n) => {
    if (n.type === TABELA) toca = true;
    return false;
  });
  return toca;
}

/**
 * Tira só o texto do trecho (de `from` a `to`): o de cada linha e o de cada célula; as linhas e as peças
 * que ficam inteiras dentro dele saem; as tabelas ficam, com as fileiras e as colunas (o quarto relatório
 * do Android: o Gboard, no apagar rápido, seleciona um pedaço para trás e apaga a seleção). O cursor fica
 * no começo do trecho.
 */
export function tirarSoTexto(tr: Transaction, from: number, to: number): Transaction {
  const trechos: [number, number][] = [];
  tr.doc.forEach((n, pos) => {
    const fim = pos + n.nodeSize;
    if (fim <= from || pos >= to) return;
    if (n.type === TABELA) {
      n.descendants((c, p) => {
        if (!c.isTextblock) return true;
        const de = Math.max(from, pos + 1 + p + 1);
        const ate = Math.min(to, pos + 1 + p + 1 + c.content.size);
        if (ate > de) trechos.push([de, ate]);
        return false;
      });
    } else if (pos >= from && fim <= to) trechos.push([pos, fim]);
    else if (n.isTextblock) {
      const de = Math.max(from, pos + 1);
      const ate = Math.min(to, fim - 1);
      if (ate > de) trechos.push([de, ate]);
    }
  });
  for (const [de, ate] of trechos.reverse()) tr.delete(de, ate);
  return tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(from, -1))));
}

/** Apagar (Backspace, Delete, o `beforeinput` do teclado do celular) uma seleção que toca uma tabela. */
export const apagarSelecao: Command = (state, dispatch) => {
  if (!tocaTabela(state)) return false;
  if (dispatch) dispatch(tirarSoTexto(state.tr, state.selection.from, state.selection.to).scrollIntoView());
  return true;
};

/**
 * Escrever, colar e recortar por cima de uma seleção que toca uma tabela seguem a mesma regra: primeiro
 * sai só o texto do trecho; depois, a letra (ou o que foi colado) entra no lugar do cursor. A composição
 * do teclado do celular não pode ser cancelada: no começo dela, o trecho já sai (e a seleção vira cursor).
 */
export const protegeTabela = (): Plugin =>
  new Plugin({
    props: {
      handleTextInput(view, _from, _to, texto) {
        if (!tocaTabela(view.state)) return false;
        const tr = tirarSoTexto(view.state.tr, view.state.selection.from, view.state.selection.to);
        view.dispatch(tr.insertText(texto, tr.selection.from).scrollIntoView());
        return true;
      },
      handlePaste(view) {
        // o trecho sai, e o colar segue (os outros plugins e o ProseMirror) no lugar do cursor
        if (tocaTabela(view.state)) view.dispatch(tirarSoTexto(view.state.tr, view.state.selection.from, view.state.selection.to));
        return false;
      },
      handleDOMEvents: {
        beforeinput(view, e) {
          if ((e.inputType !== 'insertText' && e.inputType !== 'insertReplacementText') || view.composing || !tocaTabela(view.state)) return false;
          const texto = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
          e.preventDefault();
          const tr = tirarSoTexto(view.state.tr, view.state.selection.from, view.state.selection.to);
          if (texto) tr.insertText(texto.replace(/[\r\n]+/g, ' '), tr.selection.from);
          view.dispatch(tr.scrollIntoView());
          return true;
        },
        compositionstart(view) {
          if (tocaTabela(view.state)) view.dispatch(tirarSoTexto(view.state.tr, view.state.selection.from, view.state.selection.to));
          return false;
        },
        // o recortar por cima dela: ver copiar.ts (o trecho vai para a área de transferência, e só o texto sai)
      },
    },
  });

// ===== Colar numa célula =====

/**
 * O texto colado numa célula: com tab (de uma planilha), as células, que se espalham a partir da do
 * cursor (o colar de células do `prosemirror-tables`), até o limite de colunas e de fileiras; sem tab, as
 * linhas juntas com um espaço (a célula não tem quebra), lidas como o texto das anotações (com
 * Ctrl+Shift+V, como letras). Null fora de uma tabela.
 */
export function sliceNaCelula(texto: string, comoLetras: boolean, $ctx: ResolvedPos): Slice | null {
  const at = celulaEm($ctx);
  const t = tabelaEm($ctx);
  if (!at || !t) return null;
  const grade = pastedGrid(texto);
  if (grade && (grade.length > 1 || grade[0].length > 1)) {
    const linhas = grade.slice(0, Math.max(1, MAX_TABLE_ROWS + 1 - at.f));
    const cols = Math.max(1, MAX_TABLE_COLS - at.c);
    const largura = Math.min(cols, Math.max(...linhas.map((l) => l.length)));
    const fileiras = linhas.map((l) =>
      FILEIRA.create(
        null,
        Array.from({ length: largura }, (_, c) => CELULA.create(null, letrasDe(l[c] ?? '', comoLetras))),
      ),
    );
    return new Slice(Fragment.from(TABELA.create(null, fileiras)), 0, 0);
  }
  const junto = texto.replace(/[\r\n]+$/, '').replace(/[ \t]*[\r\n]+[ \t]*/g, ' ');
  return new Slice(Fragment.from(letrasDe(junto, comoLetras)), 0, 0);
}

function letrasDe(texto: string, comoLetras: boolean): PMNode[] {
  if (!texto) return [];
  return comoLetras ? [schema.text(texto)] : inlineDe(parseInline(texto));
}

/**
 * O que foi colado (do próprio Visual ou de fora) dentro de uma célula: linhas e peças viram as letras
 * delas, juntas com um espaço (a célula não guarda quebra nem bloco); células de outra tabela continuam
 * células (o `prosemirror-tables` as espalha), cortadas no limite de colunas e de fileiras.
 */
export function colarNaCelula(slice: Slice, view: EditorView): Slice {
  const at = celulaEm(view.state.selection.$from);
  if (!at || !slice.content.childCount) return slice;
  const primeiro = slice.content.firstChild!;
  if (primeiro.type === TABELA && slice.content.childCount === 1) {
    const fileiras: PMNode[] = [];
    primeiro.forEach((f, _o, i) => {
      if (i > MAX_TABLE_ROWS - at.f) return;
      const cel: PMNode[] = [];
      f.forEach((c, _p, k) => {
        if (k < MAX_TABLE_COLS - at.c) cel.push(c);
      });
      fileiras.push(f.copy(Fragment.from(cel)));
    });
    return new Slice(Fragment.from(primeiro.copy(Fragment.from(fileiras))), slice.openStart, slice.openEnd);
  }
  if (primeiro.isInline || primeiro.type.spec['tableRole'] === 'row' || primeiro.type.spec['tableRole']?.endsWith('cell')) return slice;
  const out: PMNode[] = [];
  slice.content.forEach((n) => {
    const letras: PMNode[] = [];
    n.descendants((c) => {
      if (c.isText) letras.push(c);
      return true;
    });
    if (!letras.length) return;
    if (out.length) out.push(schema.text(' '));
    out.push(...letras);
  });
  return new Slice(Fragment.from(out), 0, 0);
}

// ===== A tabela sempre reta =====

/**
 * A tabela como o texto guarda: o cabeçalho é a primeira fileira (só ela), nenhuma célula mesclada
 * (a mesclada que chegou colada vira a célula de cima à esquerda e células vazias no resto), todas as
 * fileiras com as mesmas colunas, e cada célula com o alinhamento da coluna dela. Depois do conserto de
 * tabela torta do `prosemirror-tables` (o plugin vem depois dele).
 */
export const tabelasRetas = (): Plugin => {
  const certas = new WeakSet<PMNode>();
  return new Plugin({
    appendTransaction(trs, _velho, state) {
      if (!trs.some((t) => t.docChanged)) return null;
      const tr = state.tr;
      state.doc.forEach((t, pos) => {
        if (t.type !== TABELA || certas.has(t)) return;
        const novo = endireitar(t);
        if (novo) {
          const at = celulaEm(tr.doc.resolve(tr.mapping.map(state.selection.head)));
          const dentro = tabelaEm(state.selection.$head)?.pos === pos;
          const p = tr.mapping.map(pos);
          tr.replaceWith(p, p + t.nodeSize, novo);
          if (dentro && at) tr.setSelection(naCelula(tr.doc, p, at.f, at.c, 'comeco', at.off));
          certas.add(novo);
        } else certas.add(t);
      });
      // duas tabelas seguidas (a de baixo sem a marca do jeito) seriam lidas como uma só: uma linha vazia entre elas
      const seguidas: number[] = [];
      tr.doc.forEach((n, pos, i) => {
        if (i && n.type === TABELA && !n.attrs['jeito'] && tr.doc.child(i - 1).type === TABELA) seguidas.push(pos);
      });
      for (const pos of seguidas.reverse()) tr.insert(pos, N['linha'].create());
      return tr.docChanged ? tr : null;
    },
  });
};

/** A tabela reta, se ela não está (null: já está). */
function endireitar(t: PMNode): PMNode | null {
  let map: TableMap;
  try {
    map = TableMap.get(t);
  } catch {
    return null;
  }
  const cols = map.width;
  const alinhar = Array.from({ length: cols }, (_, c) => ((t.attrs['alinhar'] as Align[]) ?? [])[c] ?? null);
  let torta = map.problems?.length || ((t.attrs['alinhar'] as Align[]) ?? []).length !== cols;
  t.forEach((f, _o, i) => {
    if (f.childCount !== cols) torta = true;
    f.forEach((c, _p, k) => {
      if (c.type !== (i ? CELULA : CABECA) || c.attrs['colspan'] !== 1 || c.attrs['rowspan'] !== 1 || c.attrs['colwidth'] || c.attrs['alinhar'] !== alinhar[k]) torta = true;
    });
  });
  if (!torta) return null;
  const vistas = new Set<number>();
  const fileiras: PMNode[] = [];
  for (let f = 0; f < map.height; f++) {
    const cel: PMNode[] = [];
    for (let c = 0; c < cols; c++) {
      const at = map.map[f * cols + c];
      const tipo = f ? CELULA : CABECA;
      const original = at !== undefined && !vistas.has(at) ? t.nodeAt(at) : null;
      if (original) vistas.add(at);
      cel.push(tipo.create({ alinhar: alinhar[c] }, original?.content));
    }
    fileiras.push(FILEIRA.create({ sobra: (t.maybeChild(f)?.attrs['sobra'] as string[]) ?? [] }, cel));
  }
  return TABELA.create({ ...t.attrs, alinhar }, fileiras);
}

/** O `prosemirror-tables` (a seleção de células, as setas entre elas, o colar de células, o conserto de tabela torta). */
export const edicaoDaTabela = (): Plugin => tableEditing({ allowTableNodeSelection: false });
