/**
 * A cartela de ícones e cores do site, num lugar só: TODA escolha de ícone ou de cor sai daqui. É a
 * cartela dos grupos das anotações e das colunas do Kanban (o Murall a lê em `src/app/core/icon-choices.ts`,
 * `src/app/ui/icons.ts` e `src/app/core/category-looks.ts`) e a das senhas e dos grupos do cofre
 * (`projects/cofre/src/app/cartela.ts`). Para pôr um ícone ou uma cor numa escolha nova, é aqui.
 *
 * Os ids ficam guardados (nas configurações do mural, nos quadros e dentro das senhas cifradas), então
 * nunca mudam de nome nem de sentido; um desenho novo entra no fim. Cada desenho são os elementos de um
 * ícone do Lucide (24×24, traço de 2px), copiados como dados: o Murall desenha com o lucide-angular, e o
 * cofre, que não importa nada de fora, com o `<cofre-icone>` dele. O teste `src/app/ui/icons.spec.ts`
 * confere que cada desenho é o do Lucide.
 *
 * Só dados, sem nenhum import, como `topo-do-murall.ts` (a regra está em `projects/cofre/regras.test.mjs`).
 */

/** Um elemento do desenho: a tag do SVG e os atributos dela (como no Lucide). */
export type ElementoDoDesenho = readonly [tag: 'path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse', atributos: { readonly [nome: string]: string }];

/** Os ícones que dá para escolher, na ordem da cartela: primeiro os do trabalho andando (as colunas), depois os assuntos (os grupos). */
export const CARTELA_DE_ICONES = [
  /** Lucide Circle. */
  { id: 'circulo', label: 'Círculo', desenho: [['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }]] },
  /** Lucide ListChecks. */
  { id: 'lista', label: 'Lista de tarefas', desenho: [['path', { d: 'M13 5h8', key: 'a7qcls' }], ['path', { d: 'M13 12h8', key: 'h98zly' }], ['path', { d: 'M13 19h8', key: 'c3s6r1' }], ['path', { d: 'm3 17 2 2 4-4', key: '1jhpwq' }], ['path', { d: 'm3 7 2 2 4-4', key: '1obspn' }]] },
  /** Lucide Pencil. */
  { id: 'lapis', label: 'Lápis', desenho: [['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', key: '1a8usu' }], ['path', { d: 'm15 5 4 4', key: '1mk7zo' }]] },
  /** Lucide Hammer. */
  { id: 'martelo', label: 'Martelo', desenho: [['path', { d: 'm15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9', key: '1hayfq' }], ['path', { d: 'm18 15 4-4', key: '16gjal' }], ['path', { d: 'm21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5', key: '15ts47' }]] },
  /** Lucide Settings. */
  { id: 'engrenagem', label: 'Engrenagem', desenho: [['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915', key: '1i5ecw' }], ['circle', { cx: '12', cy: '12', r: '3', key: '1v7zrd' }]] },
  /** Lucide Eye. */
  { id: 'olho', label: 'Olho (revisão)', desenho: [['path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0', key: '1nclc0' }], ['circle', { cx: '12', cy: '12', r: '3', key: '1v7zrd' }]] },
  /** Lucide Hourglass. */
  { id: 'ampulheta', label: 'Ampulheta (esperando)', desenho: [['path', { d: 'M5 22h14', key: 'ehvnwv' }], ['path', { d: 'M5 2h14', key: 'pdyrp9' }], ['path', { d: 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22', key: '1d314k' }], ['path', { d: 'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2', key: '1vvvr6' }]] },
  /** Lucide Pause. */
  { id: 'pausa', label: 'Pausa', desenho: [['rect', { x: '14', y: '3', width: '5', height: '18', rx: '1', key: 'kaeet6' }], ['rect', { x: '5', y: '3', width: '5', height: '18', rx: '1', key: '1wsw3u' }]] },
  /** Lucide Ban. */
  { id: 'bloqueio', label: 'Bloqueado', desenho: [['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }], ['path', { d: 'M4.929 4.929 19.07 19.071', key: '196cmz' }]] },
  /** Lucide CheckCheck. */
  { id: 'check', label: 'Feito', desenho: [['path', { d: 'M18 6 7 17l-5-5', key: '116fxf' }], ['path', { d: 'm22 10-7.5 7.5L13 16', key: 'ke71qq' }]] },
  /** Lucide Trophy. */
  { id: 'trofeu', label: 'Troféu', desenho: [['path', { d: 'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978', key: '1n3hpd' }], ['path', { d: 'M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978', key: 'rfe1zi' }], ['path', { d: 'M18 9h1.5a1 1 0 0 0 0-5H18', key: '7xy6bh' }], ['path', { d: 'M4 22h16', key: '57wxv0' }], ['path', { d: 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z', key: '1mhfuq' }], ['path', { d: 'M6 9H4.5a1 1 0 0 1 0-5H6', key: 'tex48p' }]] },
  /** Lucide Rocket. */
  { id: 'foguete', label: 'Foguete', desenho: [['path', { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5', key: 'qeys4' }], ['path', { d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09', key: 'u4xsad' }], ['path', { d: 'M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z', key: '676m9' }], ['path', { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05', key: '92ym6u' }]] },
  /** Lucide Lightbulb. */
  { id: 'lampada', label: 'Lâmpada (ideias)', desenho: [['path', { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', key: '1gvzjb' }], ['path', { d: 'M9 18h6', key: 'x1upvd' }], ['path', { d: 'M10 22h4', key: 'ceow96' }]] },
  /** Lucide Bug. */
  { id: 'inseto', label: 'Inseto (correção)', desenho: [['path', { d: 'M12 20v-9', key: '1qisl0' }], ['path', { d: 'M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z', key: 'uouzyp' }], ['path', { d: 'M14.12 3.88 16 2', key: 'qol33r' }], ['path', { d: 'M21 21a4 4 0 0 0-3.81-4', key: '1b0z45' }], ['path', { d: 'M21 5a4 4 0 0 1-3.55 3.97', key: '5cxbf6' }], ['path', { d: 'M22 13h-4', key: '1jl80f' }], ['path', { d: 'M3 21a4 4 0 0 1 3.81-4', key: '1fjd4g' }], ['path', { d: 'M3 5a4 4 0 0 0 3.55 3.97', key: '1d7oge' }], ['path', { d: 'M6 13H2', key: '82j7cp' }], ['path', { d: 'm8 2 1.88 1.88', key: 'fmnt4t' }], ['path', { d: 'M9 7.13V6a3 3 0 1 1 6 0v1.13', key: '1vgav8' }]] },
  /** Lucide Flag. */
  { id: 'bandeira', label: 'Bandeira', desenho: [['path', { d: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528', key: '1jaruq' }]] },
  /** Lucide Star. */
  { id: 'estrela', label: 'Estrela', desenho: [['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z', key: 'r04s7s' }]] },
  /** Lucide Package. */
  { id: 'caixa', label: 'Caixa', desenho: [['path', { d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z', key: '1a0edw' }], ['path', { d: 'M12 22V12', key: 'd0xqtd' }], ['polyline', { points: '3.29 7 12 12 20.71 7', key: 'ousv84' }], ['path', { d: 'm7.5 4.27 9 5.15', key: '1c824w' }]] },
  /** Lucide CalendarDays. */
  { id: 'calendario', label: 'Calendário', desenho: [['path', { d: 'M8 2v4', key: '1cmpym' }], ['path', { d: 'M16 2v4', key: '4m81vk' }], ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2', key: '1hopcy' }], ['path', { d: 'M3 10h18', key: '8toen8' }], ['path', { d: 'M8 14h.01', key: '6423bh' }], ['path', { d: 'M12 14h.01', key: '1etili' }], ['path', { d: 'M16 14h.01', key: '1gbofw' }], ['path', { d: 'M8 18h.01', key: 'lrp35t' }], ['path', { d: 'M12 18h.01', key: 'mhygvu' }], ['path', { d: 'M16 18h.01', key: 'kzsmim' }]] },
  /** Lucide Clock. */
  { id: 'relogio', label: 'Relógio', desenho: [['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }], ['path', { d: 'M12 6v6l4 2', key: 'mmk7yg' }]] },
  /** Lucide UsersRound. */
  { id: 'pessoas', label: 'Pessoas', desenho: [['path', { d: 'M18 21a8 8 0 0 0-16 0', key: '3ypg7q' }], ['circle', { cx: '10', cy: '8', r: '5', key: 'o932ke' }], ['path', { d: 'M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3', key: '10s06x' }]] },
  /** Lucide Flame. */
  { id: 'chama', label: 'Chama (urgente)', desenho: [['path', { d: 'M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4', key: '1slcih' }]] },
  /** Lucide Zap. */
  { id: 'raio', label: 'Raio', desenho: [['path', { d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z', key: '1xq2db' }]] },
  /** Lucide Target. */
  { id: 'alvo', label: 'Alvo', desenho: [['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }], ['circle', { cx: '12', cy: '12', r: '6', key: '1vlfrh' }], ['circle', { cx: '12', cy: '12', r: '2', key: '1c9p78' }]] },
  /** Lucide BellRing. */
  { id: 'sino', label: 'Sino', desenho: [['path', { d: 'M10.268 21a2 2 0 0 0 3.464 0', key: 'vwvbt9' }], ['path', { d: 'M22 8c0-2.3-.8-4.3-2-6', key: '5bb3ad' }], ['path', { d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326', key: '11g9vi' }], ['path', { d: 'M4 2C2.8 3.7 2 5.7 2 8', key: 'tap9e0' }]] },
  /** Lucide Megaphone. */
  { id: 'megafone', label: 'Megafone', desenho: [['path', { d: 'M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', key: 'q8bfy3' }], ['path', { d: 'M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14', key: '1853fq' }], ['path', { d: 'M8 6v8', key: '15ugcq' }]] },
  /** Lucide Tag. */
  { id: 'etiqueta', label: 'Etiqueta', desenho: [['path', { d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z', key: 'vktsd0' }], ['circle', { cx: '7.5', cy: '7.5', r: '.5', fill: 'currentColor', key: 'kqv944' }]] },
  /** Lucide FolderOpen. */
  { id: 'pasta', label: 'Pasta', desenho: [['path', { d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2', key: 'usdka0' }]] },
  /** Lucide Briefcase. */
  { id: 'maleta', label: 'Maleta', desenho: [['path', { d: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16', key: 'jecpp' }], ['rect', { width: '20', height: '14', x: '2', y: '6', rx: '2', key: 'i6l2r4' }]] },
  /** Lucide GraduationCap. */
  { id: 'capelo', label: 'Capelo', desenho: [['path', { d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z', key: 'j76jl0' }], ['path', { d: 'M22 10v6', key: '1lu8f3' }], ['path', { d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5', key: '1r8lef' }]] },
  /** Lucide NotebookPen. */
  { id: 'caderno', label: 'Caderno', desenho: [['path', { d: 'M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4', key: 're6nr2' }], ['path', { d: 'M2 6h4', key: 'aawbzj' }], ['path', { d: 'M2 10h4', key: 'l0bgd4' }], ['path', { d: 'M2 14h4', key: '1gsvsf' }], ['path', { d: 'M2 18h4', key: '1bu2t1' }], ['path', { d: 'M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z', key: 'pqwjuv' }]] },
  /** Lucide BookOpen. */
  { id: 'livro', label: 'Livro', desenho: [['path', { d: 'M12 7v14', key: '1akyts' }], ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z', key: 'ruj8y' }]] },
  /** Lucide Bookmark. */
  { id: 'marcador', label: 'Marcador de página', desenho: [['path', { d: 'M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z', key: 'oz39mx' }]] },
  /** Lucide Feather. */
  { id: 'pena', label: 'Pena', desenho: [['path', { d: 'M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z', key: '18jl4k' }], ['path', { d: 'M16 8 2 22', key: 'vp34q' }], ['path', { d: 'M17.5 15H9', key: '1oz8nu' }]] },
  /** Lucide ShoppingCart. */
  { id: 'carrinho', label: 'Carrinho de compras', desenho: [['circle', { cx: '8', cy: '21', r: '1', key: 'jimo8o' }], ['circle', { cx: '19', cy: '21', r: '1', key: '13723u' }], ['path', { d: 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12', key: '9zh506' }]] },
  /** Lucide Coins. */
  { id: 'moedas', label: 'Moedas', desenho: [['path', { d: 'M13.744 17.736a6 6 0 1 1-7.48-7.48', key: 'bq4yh3' }], ['path', { d: 'M15 6h1v4', key: '11y1tn' }], ['path', { d: 'm6.134 14.768.866-.5 2 3.464', key: '17snzx' }], ['circle', { cx: '16', cy: '8', r: '6', key: '14bfc9' }]] },
  /** Lucide ChefHat. */
  { id: 'chapeu', label: 'Chapéu de cozinheiro', desenho: [['path', { d: 'M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z', key: '1qvrer' }], ['path', { d: 'M6 17h12', key: '1jwigz' }]] },
  /** Lucide Plane. */
  { id: 'aviao', label: 'Avião', desenho: [['path', { d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z', key: '1v9wt8' }]] },
  /** Lucide Earth. */
  { id: 'mundo', label: 'Mundo', desenho: [['path', { d: 'M21.54 15H17a2 2 0 0 0-2 2v4.54', key: '1djwo0' }], ['path', { d: 'M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17', key: '1tzkfa' }], ['path', { d: 'M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05', key: '14pb5j' }], ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }]] },
  /** Lucide Landmark. */
  { id: 'predio', label: 'Prédio', desenho: [['path', { d: 'M10 18v-7', key: 'wt116b' }], ['path', { d: 'M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z', key: '1m329m' }], ['path', { d: 'M14 18v-7', key: 'vav6t3' }], ['path', { d: 'M18 18v-7', key: 'aexdmj' }], ['path', { d: 'M3 22h18', key: '8prr45' }], ['path', { d: 'M6 18v-7', key: '1ivflk' }]] },
  /** Lucide Heart. */
  { id: 'coracao', label: 'Coração', desenho: [['path', { d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5', key: 'mvr1a0' }]] },
  /** Lucide Music. */
  { id: 'musica', label: 'Música', desenho: [['path', { d: 'M9 18V5l12-2v13', key: '1jmyc2' }], ['circle', { cx: '6', cy: '18', r: '3', key: 'fqmcym' }], ['circle', { cx: '18', cy: '16', r: '3', key: '1hluhg' }]] },
  /** Lucide Film. */
  { id: 'filme', label: 'Filme', desenho: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', key: 'afitv7' }], ['path', { d: 'M7 3v18', key: 'bbkbws' }], ['path', { d: 'M3 7.5h4', key: 'zfgn84' }], ['path', { d: 'M3 12h18', key: '1i2n21' }], ['path', { d: 'M3 16.5h4', key: '1230mu' }], ['path', { d: 'M17 3v18', key: 'in4fa5' }], ['path', { d: 'M17 7.5h4', key: 'myr1c1' }], ['path', { d: 'M17 16.5h4', key: 'go4c1d' }]] },
  /** Lucide Camera. */
  { id: 'camera', label: 'Câmera', desenho: [['path', { d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z', key: '18u6gg' }], ['circle', { cx: '12', cy: '13', r: '3', key: '1vg3eu' }]] },
  /** Lucide Palette. */
  { id: 'paleta', label: 'Paleta', desenho: [['path', { d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z', key: 'e79jfc' }], ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor', key: '1okk4w' }], ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor', key: 'f64h9f' }], ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor', key: 'qy21gx' }], ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor', key: 'fotxhn' }]] },
  /** Lucide Brain. */
  { id: 'cerebro', label: 'Cérebro', desenho: [['path', { d: 'M12 18V5', key: 'adv99a' }], ['path', { d: 'M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4', key: '1e3is1' }], ['path', { d: 'M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5', key: '1gqd8o' }], ['path', { d: 'M17.997 5.125a4 4 0 0 1 2.526 5.77', key: 'iwvgf7' }], ['path', { d: 'M18 18a4 4 0 0 0 2-7.464', key: 'efp6ie' }], ['path', { d: 'M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517', key: '1gq6am' }], ['path', { d: 'M6 18a4 4 0 0 1-2-7.464', key: 'k1g0md' }], ['path', { d: 'M6.003 5.125a4 4 0 0 0-2.526 5.77', key: 'q97ue3' }]] },
  /** Lucide Microscope. */
  { id: 'microscopio', label: 'Microscópio', desenho: [['path', { d: 'M6 18h8', key: '1borvv' }], ['path', { d: 'M3 22h18', key: '8prr45' }], ['path', { d: 'M14 22a7 7 0 1 0 0-14h-1', key: '1jwaiy' }], ['path', { d: 'M9 14h2', key: '197e7h' }], ['path', { d: 'M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z', key: '1bmzmy' }], ['path', { d: 'M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3', key: '1drr47' }]] },
  /** Lucide Cpu. */
  { id: 'chip', label: 'Chip', desenho: [['path', { d: 'M12 20v2', key: '1lh1kg' }], ['path', { d: 'M12 2v2', key: 'tus03m' }], ['path', { d: 'M17 20v2', key: '1rnc9c' }], ['path', { d: 'M17 2v2', key: '11trls' }], ['path', { d: 'M2 12h2', key: '1t8f8n' }], ['path', { d: 'M2 17h2', key: '7oei6x' }], ['path', { d: 'M2 7h2', key: 'asdhe0' }], ['path', { d: 'M20 12h2', key: '1q8mjw' }], ['path', { d: 'M20 17h2', key: '1fpfkl' }], ['path', { d: 'M20 7h2', key: '1o8tra' }], ['path', { d: 'M7 20v2', key: '4gnj0m' }], ['path', { d: 'M7 2v2', key: '1i4yhu' }], ['rect', { x: '4', y: '4', width: '16', height: '16', rx: '2', key: '1vbyd7' }], ['rect', { x: '8', y: '8', width: '8', height: '8', rx: '1', key: 'z9xiuo' }]] },
  /** Lucide Puzzle. */
  { id: 'quebra-cabeca', label: 'Quebra-cabeça', desenho: [['path', { d: 'M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z', key: 'w46dr5' }]] },
  /** Lucide Crown. */
  { id: 'coroa', label: 'Coroa', desenho: [['path', { d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z', key: '1vdc57' }], ['path', { d: 'M5 21h14', key: '11awu3' }]] },
  /** Lucide Sparkles. */
  { id: 'brilho', label: 'Brilho', desenho: [['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z', key: '1s2grr' }], ['path', { d: 'M20 2v4', key: '1rf3ol' }], ['path', { d: 'M22 4h-4', key: 'gwowj6' }], ['circle', { cx: '4', cy: '20', r: '2', key: '6kqj1y' }]] },
] as const satisfies readonly { readonly id: string; readonly label: string; readonly desenho: readonly ElementoDoDesenho[] }[];

export type IdDoIcone = (typeof CARTELA_DE_ICONES)[number]['id'];

/** As cores que dá para escolher: tintas fortes, para a borda fina continuar à vista no manilha. */
export const CORES_DA_CARTELA = [
  { id: 'vermelho', label: 'Vermelho', hex: '#d63a2f' },
  { id: 'laranja', label: 'Laranja', hex: '#e46f0c' },
  { id: 'amarelo', label: 'Amarelo', hex: '#cf9d00' },
  { id: 'verde', label: 'Verde', hex: '#5e9c1c' },
  { id: 'azul', label: 'Azul', hex: '#2d8bd6' },
  { id: 'roxo', label: 'Roxo', hex: '#8c58d8' },
  { id: 'rosa', label: 'Rosa', hex: '#e2579f' },
  { id: 'vinho', label: 'Vinho', hex: '#ad2463' },
] as const;

export type IdDaCor = (typeof CORES_DA_CARTELA)[number]['id'];

/** O id é de um ícone da cartela? */
export function ehIconeDaCartela(id: unknown): id is IdDoIcone {
  return CARTELA_DE_ICONES.some((i) => i.id === id);
}

/** O id é de uma cor da cartela? */
export function ehCorDaCartela(id: unknown): id is IdDaCor {
  return CORES_DA_CARTELA.some((c) => c.id === id);
}
