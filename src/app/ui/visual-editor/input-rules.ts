import { InputRule, inputRules } from 'prosemirror-inputrules';
import { NodeType } from 'prosemirror-model';
import { EditorState, Plugin } from 'prosemirror-state';
import { enderecoNoEspaco } from './links';
import { schema } from './schema';

/**
 * Os atalhos de digitação do Visual (PLANO-EDITOR-VISUAL.md, 5.10), o "autoformatar" do Docs: no começo
 * da linha, "# ", "## " e "### " viram título, "> " citação e "-# " texto sutil; no meio, as setas e os
 * sinais viram os símbolos da leitura (os de `SYMBOLS` em core/rich-text.ts), na hora em que o último
 * sinal entra. Cada um desfaz com o Ctrl+Z ou com o Backspace logo depois (e fica o que foi digitado,
 * escrito no texto com a barra que o mantém). Durante a composição (o acento, o teclado do celular),
 * nada acontece: o plugin espera ela acabar. O endereço solto (https://… ou www.…) vira link no espaço
 * (e no Enter, ver keymap.ts). As listas (desde a rodada 4): "- ", "* " e "+ " viram item, "1. " (qualquer
 * número, e "1.1. ") item numerado, "[] ", "[ ] " e "- [ ] " tarefa, em qualquer recuo (embaixo de um
 * item, o recuado vira item de dentro). As marcas digitadas ("**x**") não viram formatação (a P4: o que
 * se escreve é texto).
 */

const N = schema.nodes;
const M = schema.marks;

/** Dentro do código e dos links os sinais ficam como são (como na leitura). */
function semSimbolos(state: EditorState, at: number): boolean {
  return state.doc.resolve(at).marks().some((m) => m.type === M['codigo'] || m.type === M['link'] || m.type === M['elo']);
}

function simbolo(re: RegExp, troca: string): InputRule {
  return new InputRule(re, (state, match, start, end) => (semSimbolos(state, start) ? null : state.tr.insertText(troca, start, end)));
}

/**
 * Os símbolos, os mais longos primeiro. Os de três sinais que começam num de dois ("<=>", "<->",
 * "<--", "<==") chegam com o primeiro já trocado ("≤" e depois ">"): por isso as duplas "≤>", "←>"…
 */
const SIMBOLOS: readonly [RegExp, string][] = [
  [/-->$/, '⟶'],
  [/==>$/, '⟹'],
  [/≤>$/, '⇔'],
  [/←>$/, '↔'],
  [/←-$/, '⟵'],
  [/≤=$/, '⟸'],
  [/=>$/, '⇒'],
  [/->$/, '→'],
  [/<-$/, '←'],
  [/!=$/, '≠'],
  [/>=$/, '≥'],
  [/<=$/, '≤'],
  [/~=$/, '≈'],
  [/\+-$/, '±'],
];

/** Um atalho do começo da linha: só numa linha de texto sem recuo, que vira o tipo dado. */
function bloco(re: RegExp, tipo: NodeType, attrs: (m: RegExpMatchArray) => Record<string, unknown> = () => ({})): InputRule {
  return new InputRule(re, (state, match, start, end) => {
    const $s = state.doc.resolve(start);
    const linha = $s.parent;
    if ($s.depth !== 1 || linha.type !== N['linha'] || linha.attrs['recuo']) return null;
    return state.tr.delete(start, end).setNodeMarkup($s.before(), tipo, { recuo: 0, fonte: linha.attrs['fonte'], ...attrs(match) });
  });
}

/**
 * Um atalho de lista no começo da linha: a linha de texto (em qualquer recuo) vira o item do tipo dado.
 * Num item, só a tarefa (o "[ ] " depois do "- " que já virou item: o "- [ ] " do Markdown).
 */
function lista(re: RegExp, tipo: 'ul' | 'ol' | 'check'): InputRule {
  return new InputRule(re, (state, match, start, end) => {
    const $s = state.doc.resolve(start);
    const linha = $s.parent;
    if ($s.depth !== 1 || !(linha.type === N['linha'] || (linha.type === N['item'] && tipo === 'check' && linha.attrs['tipo'] !== 'check'))) return null;
    const numero = tipo === 'ol' ? match[1] : '';
    return state.tr.delete(start, end).setNodeMarkup($s.before(), N['item'], { recuo: linha.attrs['recuo'], fonte: linha.attrs['fonte'], tipo, feita: false, numero });
  });
}

export const atalhos = (): Plugin =>
  inputRules({
    rules: [
      bloco(/^(#{1,3})\s$/, N['titulo'], (m) => ({ nivel: m[1].length })),
      bloco(/^>\s$/, N['citacao']),
      bloco(/^-#\s$/, N['sutil']),
      lista(/^[-*+] $/, 'ul'),
      lista(/^(\d{1,4}(?:\.\d{1,4})*)\. $/, 'ol'),
      lista(/^(?:- )?\[ ?\] $/, 'check'),
      ...SIMBOLOS.map(([re, troca]) => simbolo(re, troca)),
      enderecoNoEspaco(),
    ],
  });
