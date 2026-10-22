/**
 * As seções das Anotações e o cofre de senhas, num lugar só (PLANO-COFRE.md, 17.12). O Murall monta a
 * barra das Anotações com isto (`src/app/core/areas.ts` e `ui/area-bar.ts`), e o cofre, o topo dele
 * (`projects/cofre/src/app/topo`): mudar aqui muda nos dois.
 *
 * Só dados, sem nenhum import: é a única coisa de fora que o cofre pode usar, porque não traz código de
 * ninguém (a regra está em `projects/cofre/regras.test.mjs`).
 */

/** O endereço do Murall (as rotas dele são com `#`). */
export const MURALL_URL = 'https://murall.igorsc.com.br';

/** O endereço do cofre de senhas, uma origem só dele. */
export const COFRE_URL = 'https://cofre.murall.igorsc.com.br/';

/** O nome da aba do cofre, depois das seções. */
export const COFRE_ROTULO = 'Cofre';

export interface SecaoDasAnotacoes {
  /** O pedaço do caminho depois de `/anotacoes`; vazio é o próprio mural. */
  readonly slug: string;
  readonly label: string;
}

/** Mural, Kanban e Calendário, nesta ordem. */
export const SECOES_DAS_ANOTACOES: readonly SecaoDasAnotacoes[] = [
  { slug: '', label: 'Mural' },
  { slug: 'kanban', label: 'Kanban' },
  { slug: 'calendario', label: 'Calendário' },
];

/** O endereço completo de uma seção no Murall, para quem está fora dele (o cofre). */
export function enderecoNoMurall(slug: string): string {
  return `${MURALL_URL}/#/anotacoes${slug ? '/' + slug : ''}`;
}
