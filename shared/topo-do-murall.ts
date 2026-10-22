/**
 * O topo do Murall em dados, num lugar só (PLANO-COFRE.md, 17.12 e 17.14): as partes do varal, os bottons,
 * os desenhos deles e as seções das Anotações. O Murall monta o topo e a barra das Anotações com isto
 * (`src/app/ui/site-header.ts`, `src/app/core/areas.ts`, `src/app/ui/area-bar.ts`), e o cofre, o topo dele
 * (`projects/cofre/src/app/topo`): mudar aqui muda nos dois. O desenho mora ao lado, em
 * `shared/topo/_topo-do-murall.scss`, também dos dois.
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

/** O endereço completo de uma página do Murall, para quem está fora dele (o cofre). */
export function enderecoNoMurall(caminho: string): string {
  return `${MURALL_URL}/#${caminho}`;
}

/** Uma etiqueta do varal: uma parte do site. */
export interface ParteDoSite {
  readonly area: 'anotacoes' | 'analises' | 'extras';
  readonly label: string;
}

/** As três partes do site, na ordem do varal. */
export const PARTES_DO_SITE: readonly ParteDoSite[] = [
  { area: 'anotacoes', label: 'Anotações' },
  { area: 'analises', label: 'Análises' },
  { area: 'extras', label: 'Extras' },
];

/** Cada etiqueta pende de um jeito no barbante, sempre o mesmo (o prendedor é o eixo). */
export const INCLINACOES = [-2.2, 1.6, -1.2, 2];

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

/** Um desenho de traço (o formato dos ícones Lucide): a lista de elementos do SVG, 24×24. */
export type Desenho = readonly (readonly [string, Readonly<Record<string, string>>])[];

/** Os desenhos dos bottons, copiados dos ícones Lucide (os mesmos do acervo do Murall). */
export const DESENHOS = {
  /** O Perfil sem a foto (no cofre, que não tem a conta do Murall): uma pessoa. Lucide UserRound. */
  pessoa: [
    ['circle', { cx: '12', cy: '8', r: '5' }],
    ['path', { d: 'M20 21a8 8 0 0 0-16 0' }],
  ],
  /** Amigos. Lucide UsersRound. */
  amigos: [
    ['path', { d: 'M18 21a8 8 0 0 0-16 0' }],
    ['circle', { cx: '10', cy: '8', r: '5' }],
    ['path', { d: 'M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3' }],
  ],
  /** Ajustes. Lucide Settings. */
  ajustes: [
    [
      'path',
      {
        d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
      },
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
} satisfies Record<string, Desenho>;

/** Um botton: o que é da pessoa e vale para todos os murais. */
export interface Botton {
  readonly id: 'perfil' | 'amigos' | 'ajustes';
  readonly label: string;
  readonly title: string;
  readonly caminho: string;
}

/** Os bottons, na ordem do topo. */
export const BOTTONS: readonly Botton[] = [
  { id: 'perfil', label: 'Perfil', title: 'Seu perfil', caminho: '/perfil' },
  { id: 'amigos', label: 'Amigos', title: 'Amigos', caminho: '/amigos' },
  { id: 'ajustes', label: 'Ajustes', title: 'Ajustes', caminho: '/ajustes' },
];
