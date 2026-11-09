/**
 * A grossura do traço dos ícones, num lugar só para o Murall e o cofre. O padrão é o ícone da etiqueta
 * de uma coluna do Kanban: 20 px de lado e 2 px de traço. Menor que ele, o traço afina na mesma
 * proporção (um décimo do lado: 16 px, 1,6 px; 12 px, 1,2 px), para o desenho pequeno não fechar num
 * borrão; maior, fica nos 2 px, para o grande não engrossar. O tamanho do ícone nunca muda por isso.
 *
 * Quem sabe o tamanho em px (o `[size]` do `<lucide-icon>`) usa `tracoNaGrade`; o ícone que o CSS mede
 * (em `em`, `cqi` ou pelo pai) usa o `medido` de `shared/_traco-dos-icones.scss`, que faz a mesma conta
 * com o tamanho que ele tem na tela.
 *
 * Só dados e contas, sem nenhum import, como `cartela-de-icones.ts` (a regra está em
 * `projects/cofre/regras.test.mjs`).
 */

/** O lado do ícone padrão, em px: o da etiqueta de uma coluna do Kanban. */
export const ICONE_PADRAO = 20;

/** A grossura do traço do ícone padrão, em px (a mais grossa que um ícone tem). */
export const TRACO_PADRAO = 2;

/** A grade em que os desenhos são feitos (a do Lucide): 24 × 24. */
export const GRADE_DO_ICONE = 24;

/**
 * O traço de um ícone de `tamanho` px, na grade de 24 do desenho (o `stroke-width` do SVG). Até o
 * padrão é sempre 2,4: o traço cresce e encolhe com o ícone, então também serve para o ícone que o CSS
 * estica (sem tamanho, é esse). Acima do padrão, encolhe na grade para continuar com 2 px na tela.
 */
export function tracoNaGrade(tamanho?: number): number {
  const lado = tamanho && tamanho > ICONE_PADRAO ? tamanho : ICONE_PADRAO;
  return Math.round(((TRACO_PADRAO * GRADE_DO_ICONE) / lado) * 1000) / 1000;
}
