/** O tamanho de um comentário, em caracteres como o campo do site conta (`String.length`). */
export const COMMENT_MAX = 500;
/** O id de um comentário (um UUID sorteado aqui). */
export const COMMENT_ID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Quem pode comentar nas publicações de alguém: qualquer conta, ou só quem a pessoa segue. */
export type CommentsFrom = 'todos' | 'seguidos';

export function isCommentsFrom(v: unknown): v is CommentsFrom {
  return v === 'todos' || v === 'seguidos';
}

/**
 * O texto de um comentário como fica guardado: quebras de linha iguais, sem os caracteres de controle
 * (as quebras e o Tab ficam: as listas e as tabelas dependem deles), sem espaço sobrando no fim das
 * linhas nem linhas em branco nas pontas. '' se não sobrar nada (ou se não veio texto).
 *
 * As marcas de formatação ficam como vieram: quem desenha é o site, sempre por interpolação, nunca HTML.
 * O tamanho (`COMMENT_MAX`) é conferido por quem chama, para a resposta dizer qual foi o problema.
 */
export function cleanComment(input: unknown): string {
  if (typeof input !== 'string') return '';
  const text = input
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n\t]/gu, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+|\n+$/g, '')
    .replace(/\n{3,}/g, '\n\n');
  return text.trim() ? text : '';
}
