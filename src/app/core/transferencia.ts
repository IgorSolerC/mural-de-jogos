import { closes, fenceOf } from './rich-text';

/**
 * A área de transferência do Murall (PLANO-EDITOR-VISUAL.md, 5.16): copiar do Visual e do Markdown põe,
 * junto do texto de sempre, o tipo próprio `text/x-murall-markdown`, com o markdown do trecho; colar
 * numa nota do Murall (no Visual ou no Markdown) lê ele primeiro, então nada se perde no caminho.
 *
 * O Safari pode não deixar o tipo próprio chegar (C10): o HTML que o Visual põe leva o mesmo markdown num
 * atributo (`ATRIBUTO_MURALL`), e quem cola lê de lá. Fica aqui, longe do ProseMirror: o Markdown (no
 * carregamento inicial) também usa.
 */

export const TIPO_MURALL = 'text/x-murall-markdown';
export const ATRIBUTO_MURALL = 'data-murall-markdown';

/**
 * O markdown que veio do Murall: o tipo próprio ou, sem ele, o atributo do HTML do Visual. Null quando
 * o que se cola veio de fora.
 */
export function markdownColado(data: DataTransfer | null | undefined): string | null {
  if (!data) return null;
  let md = '';
  try {
    md = data.getData(TIPO_MURALL);
  } catch {
    md = '';
  }
  if (md) return md;
  const html = data.getData('text/html');
  return html.includes(ATRIBUTO_MURALL) ? markdownDoHtml(html) : null;
}

/** O markdown guardado no HTML do Visual (lido num documento à parte: nada roda, nada carrega). */
export function markdownDoHtml(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.querySelector(`[${ATRIBUTO_MURALL}]`)?.getAttribute(ATRIBUTO_MURALL) ?? null;
}

/**
 * O começo do markdown que cabe em `cabe` caracteres, por linhas inteiras (5.18): nunca uma linha pela
 * metade (a marca dela ficaria aberta) e nunca dentro de um bloco de código (a cerca sem fecho levaria o
 * resto do texto para dentro dele). "" quando nem a primeira linha cabe.
 */
export function cortarPorLinhas(md: string, cabe: number): string {
  if (md.length <= cabe) return md;
  const linhas = md.split('\n');
  let feito = '';
  let at = 0;
  let aberta: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const fim = at + (i ? 1 : 0) + l.length;
    if (fim > cabe) break;
    at = fim;
    if (aberta) {
      if (closes(l, aberta)) aberta = null;
    } else aberta = fenceOf(l);
    // só fica o que acaba fora de um bloco de código
    if (!aberta) feito = md.slice(0, at);
  }
  return feito;
}
