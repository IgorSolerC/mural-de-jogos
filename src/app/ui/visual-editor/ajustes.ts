import { Node as PMNode } from 'prosemirror-model';
import { Plugin, Transaction } from 'prosemirror-state';

/**
 * Os ajustes da tela ao que o texto guarda (PLANO-EDITOR-VISUAL.md, 5.2.1), feitos logo depois de cada
 * mudança, para a tela mostrar o que vai ficar (I3).
 */

/** Os trechos do documento novo que as transações mexeram (de cada passo que troca conteúdo). */
export function faixasMudadas(trs: readonly Transaction[]): [number, number][] {
  const out: [number, number][] = [];
  for (const tr of trs) {
    for (let i = 0; i < out.length; i++) out[i] = [tr.mapping.map(out[i][0], -1), tr.mapping.map(out[i][1], 1)];
    tr.mapping.maps.forEach((m, k) => {
      const depois = tr.mapping.slice(k + 1);
      m.forEach((_de, _ate, de, ate) => out.push([depois.map(de, -1), depois.map(ate, 1)]));
    });
  }
  return out;
}

/** Os nós de cima (as linhas) que tocam os trechos dados, com a posição de cada um, sem repetir. */
export function linhasMexidas(doc: PMNode, faixas: readonly [number, number][]): [PMNode, number][] {
  const vistos = new Set<number>();
  const out: [PMNode, number][] = [];
  for (const [de, ate] of faixas) {
    const [a, b] = [Math.max(0, Math.min(de, doc.content.size)), Math.max(0, Math.min(ate, doc.content.size))];
    doc.nodesBetween(Math.max(0, a - 1), Math.min(doc.content.size, b + 1), (n, pos) => {
      if (!vistos.has(pos)) {
        vistos.add(pos);
        out.push([n, pos]);
      }
      return false;
    });
  }
  return out.sort((x, y) => x[1] - y[1]);
}

/**
 * Uma linha do texto nunca tem quebra dentro (só o bloco de código tem): a quebra que chegar numa linha
 * (apagar uma seleção que ia do meio de uma linha ao meio de um bloco de código junta os dois) parte a
 * linha ali, como o Enter.
 */
export function partirQuebras(tr: Transaction, linhas: readonly [PMNode, number][]): void {
  for (const [n, pos] of [...linhas].reverse()) {
    if (!n.isTextblock || n.type.spec.code) continue;
    const texto = n.textContent;
    for (let i = texto.length - 1; i >= 0; i--) {
      if (texto[i] !== '\n' && texto[i] !== '\r') continue;
      const at = tr.mapping.map(pos + 1 + i);
      tr.delete(at, at + 1);
      tr.split(at);
    }
  }
}

export const semQuebras = (): Plugin =>
  new Plugin({
    appendTransaction(trs, _velho, state) {
      if (!trs.some((t) => t.docChanged)) return null;
      const linhas = linhasMexidas(state.doc, faixasMudadas(trs)).filter(([n]) => n.isTextblock && !n.type.spec.code && /[\n\r]/.test(n.textContent));
      if (!linhas.length) return null;
      const tr = state.tr;
      partirQuebras(tr, linhas);
      return tr.docChanged ? tr : null;
    },
  });
