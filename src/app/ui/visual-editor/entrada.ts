import { undoInputRule } from 'prosemirror-inputrules';
import { ResolvedPos } from 'prosemirror-model';
import { Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { apagarParaFrente, apagarParaTras, enter, shiftEnter } from './keymap';

/**
 * O que a rodada 0 ensinou no Android (PLANO-EDITOR-VISUAL.md, seção 12): no Visual, o navegador só põe
 * letras e compõe. Partir linha e apagar são do editor, pelo `beforeinput`.
 *
 * - O Enter: o Chrome do Android não manda o Enter pelo keydown que o ProseMirror lê; ele parte o
 *   bloco no DOM, e fora da linha comum isso não parece um Enter. O `insertParagraph` e o
 *   `insertLineBreak` são cancelados e viram o nosso Enter (e o nosso Shift+Enter). Antes, a composição que acabou de terminar
 *   entra no documento (o `flush`); durante a composição, fica com o ProseMirror. No iPhone, o
 *   ProseMirror ainda chamaria o Enter 200 ms depois: o `lastIOSEnter` zerado desliga isso.
 * - O apagar: no apagar segurado, o Gboard troca a tecla Backspace pela tecla 229 com um
 *   `deleteContentBackward`, e no apagar rápido seleciona um pedaço para trás e apaga a seleção. Fora
 *   da composição, nenhum apagar fica com o navegador: no meio das letras sai exatamente o trecho que
 *   ele apagaria (o `getTargetRanges` do evento) ou uma letra inteira (acento combinado e emoji com tom
 *   saem de uma vez, pelo `Intl.Segmenter`); numa borda, com seleção ou numa peça, o nosso apagar (o
 *   mesmo da tecla); logo depois de um atalho de digitação, o desfazer dele.
 *
 * O `domObserver` e o `input` são internos do prosemirror-view 1.42.6 (conferir a cada versão).
 */

interface Internos {
  domObserver?: { flush(): void };
  input?: { lastIOSEnter: number };
}
const internos = (view: EditorView) => view as unknown as Internos;

export const enterPeloBeforeinput = (): Plugin =>
  new Plugin({
    props: {
      handleDOMEvents: {
        beforeinput(view, e) {
          if (e.inputType !== 'insertParagraph' && e.inputType !== 'insertLineBreak') return false;
          if (view.composing) return false;
          e.preventDefault();
          internos(view).domObserver?.flush();
          (e.inputType === 'insertLineBreak' ? shiftEnter : enter)(view.state, view.dispatch, view);
          const input = internos(view).input;
          if (input) input.lastIOSEnter = 0;
          return true;
        },
      },
    },
  });

const LETRAS = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;

/** A letra inteira antes (ou depois) da posição, com o acento combinado e o emoji de várias partes. */
export function letraVizinha($pos: ResolvedPos, dir: -1 | 1): { from: number; to: number } {
  const texto = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, '￼');
  const off = $pos.parentOffset;
  let [de, ate] = dir < 0 ? [off - 1, off] : [off, off + 1];
  if (LETRAS)
    for (const l of LETRAS.segment(texto)) {
      const fim = l.index + l.segment.length;
      if (dir < 0 && fim === off) [de, ate] = [l.index, off];
      if (dir > 0 && l.index === off) [de, ate] = [off, fim];
    }
  return { from: $pos.start() + Math.max(0, de), to: $pos.start() + Math.min(texto.length, ate) };
}

/** O trecho que o navegador apagaria, se ele cabe numa linha só (senão é coisa de borda: null). */
function trechoDoNavegador(view: EditorView, e: InputEvent): { from: number; to: number } | null {
  const r = e.getTargetRanges?.()[0];
  if (!r) return null;
  let from: number;
  let to: number;
  try {
    from = view.posAtDOM(r.startContainer, r.startOffset);
    to = view.posAtDOM(r.endContainer, r.endOffset);
  } catch {
    return null;
  }
  if (from >= to) return null;
  const $a = view.state.doc.resolve(from);
  return $a.parent.isTextblock && $a.sameParent(view.state.doc.resolve(to)) ? { from, to } : null;
}

export const apagarPeloBeforeinput = (): Plugin =>
  new Plugin({
    props: {
      handleDOMEvents: {
        beforeinput(view, e) {
          const tipo = e.inputType;
          if (!tipo.startsWith('delete') || tipo === 'deleteByCut' || tipo === 'deleteByDrag' || view.composing) return false;
          e.preventDefault();
          internos(view).domObserver?.flush();
          const dir = /Backward/.test(tipo) ? -1 : /Forward/.test(tipo) ? 1 : 0;
          const { state } = view;
          const sel = state.selection;
          const naBorda = sel.empty && (dir < 0 ? sel.$from.parentOffset === 0 : sel.$from.parentOffset === sel.$from.parent.content.size);
          if (dir < 0 && undoInputRule(state, view.dispatch)) return true;
          if (!sel.empty || naBorda || !dir || !(sel instanceof TextSelection)) {
            (dir > 0 ? apagarParaFrente : apagarParaTras)(state, view.dispatch, view);
            return true;
          }
          const trecho = trechoDoNavegador(view, e) ?? letraVizinha(sel.$from, dir as -1 | 1);
          if (trecho.to > trecho.from) view.dispatch(state.tr.delete(trecho.from, trecho.to).scrollIntoView());
          return true;
        },
      },
    },
  });
