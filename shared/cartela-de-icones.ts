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

/**
 * Os ícones que dá para escolher, na ordem da cartela: primeiro os do trabalho andando (as colunas), depois
 * os assuntos (os grupos), depois os cenários do dia a dia (comunicação, tecnologia, dinheiro, lazer…).
 */
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
  // mais cenários (23/10/2026), para as senhas do cofre e para quem quiser nos grupos e nas colunas
  // comunicação
  /** Lucide Mail. */
  { id: 'email', label: 'E-mail', desenho: [['path', { d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7', key: '132q7q' }], ['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2', key: 'izxlao' }]] },
  /** Lucide AtSign. */
  { id: 'arroba', label: 'Arroba', desenho: [['circle', { cx: '12', cy: '12', r: '4', key: '4exip2' }], ['path', { d: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8', key: '7n84p3' }]] },
  /** Lucide MessageCircle. */
  { id: 'mensagem', label: 'Mensagem', desenho: [['path', { d: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719', key: '1sd12s' }]] },
  /** Lucide Phone. */
  { id: 'telefone', label: 'Telefone', desenho: [['path', { d: 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384', key: '9njp5v' }]] },
  /** Lucide Smartphone. */
  { id: 'celular', label: 'Celular', desenho: [['rect', { width: '14', height: '20', x: '5', y: '2', rx: '2', ry: '2', key: '1yt0o3' }], ['path', { d: 'M12 18h.01', key: 'mhygvu' }]] },
  // tecnologia
  /** Lucide Laptop. */
  { id: 'computador', label: 'Computador', desenho: [['path', { d: 'M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z', key: '1pdavp' }], ['path', { d: 'M20.054 15.987H3.946', key: '14rxg9' }]] },
  /** Lucide Wifi. */
  { id: 'wifi', label: 'Wi-Fi', desenho: [['path', { d: 'M12 20h.01', key: 'zekei9' }], ['path', { d: 'M2 8.82a15 15 0 0 1 20 0', key: 'dnpr2z' }], ['path', { d: 'M5 12.859a10 10 0 0 1 14 0', key: '1x1e6c' }], ['path', { d: 'M8.5 16.429a5 5 0 0 1 7 0', key: '1bycff' }]] },
  /** Lucide Cloud. */
  { id: 'nuvem', label: 'Nuvem', desenho: [['path', { d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z', key: 'p7xjir' }]] },
  /** Lucide Server. */
  { id: 'servidor', label: 'Servidor', desenho: [['rect', { width: '20', height: '8', x: '2', y: '2', rx: '2', ry: '2', key: 'ngkwjq' }], ['rect', { width: '20', height: '8', x: '2', y: '14', rx: '2', ry: '2', key: 'iecqi9' }], ['line', { x1: '6', x2: '6.01', y1: '6', y2: '6', key: '16zg32' }], ['line', { x1: '6', x2: '6.01', y1: '18', y2: '18', key: 'nzw8ys' }]] },
  /** Lucide Code. */
  { id: 'codigo', label: 'Código', desenho: [['path', { d: 'm16 18 6-6-6-6', key: 'eg8j8' }], ['path', { d: 'm8 6-6 6 6 6', key: 'ppft3o' }]] },
  /** Lucide SquareTerminal. */
  { id: 'terminal', label: 'Terminal', desenho: [['path', { d: 'm7 11 2-2-2-2', key: '1lz0vl' }], ['path', { d: 'M11 13h4', key: '1p7l4v' }], ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2', key: '1m3agn' }]] },
  /** Lucide Database. */
  { id: 'banco-de-dados', label: 'Banco de dados', desenho: [['ellipse', { cx: '12', cy: '5', rx: '9', ry: '3', key: 'msslwz' }], ['path', { d: 'M3 5V19A9 3 0 0 0 21 19V5', key: '1wlel7' }], ['path', { d: 'M3 12A9 3 0 0 0 21 12', key: 'mv7ke4' }]] },
  /** Lucide Printer. */
  { id: 'impressora', label: 'Impressora', desenho: [['path', { d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', key: '143wyd' }], ['path', { d: 'M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6', key: '1itne7' }], ['rect', { x: '6', y: '14', width: '12', height: '8', rx: '1', key: '1ue0tg' }]] },
  // segurança e documentos
  /** Lucide KeyRound. */
  { id: 'chave', label: 'Chave', desenho: [['path', { d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z', key: '1s6t7t' }], ['circle', { cx: '16.5', cy: '7.5', r: '.5', fill: 'currentColor', key: 'w0ekpg' }]] },
  /** Lucide Lock. */
  { id: 'cadeado', label: 'Cadeado', desenho: [['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2', key: '1w4ew1' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4', key: 'fwvmzm' }]] },
  /** Lucide ShieldCheck. */
  { id: 'escudo', label: 'Escudo', desenho: [['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', key: 'oel41y' }], ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74' }]] },
  /** Lucide FingerprintPattern. */
  { id: 'digital', label: 'Impressão digital', desenho: [['path', { d: 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4', key: '1nerag' }], ['path', { d: 'M14 13.12c0 2.38 0 6.38-1 8.88', key: 'o46ks0' }], ['path', { d: 'M17.29 21.02c.12-.6.43-2.3.5-3.02', key: 'ptglia' }], ['path', { d: 'M2 12a10 10 0 0 1 18-6', key: 'ydlgp0' }], ['path', { d: 'M2 16h.01', key: '1gqxmh' }], ['path', { d: 'M21.8 16c.2-2 .131-5.354 0-6', key: 'drycrb' }], ['path', { d: 'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2', key: '1tidbn' }], ['path', { d: 'M8.65 22c.21-.66.45-1.32.57-2', key: '13wd9y' }], ['path', { d: 'M9 6.8a6 6 0 0 1 9 5.2v2', key: '1fr1j5' }]] },
  /** Lucide IdCard. */
  { id: 'documento', label: 'Documento', desenho: [['path', { d: 'M16 10h2', key: '8sgtl7' }], ['path', { d: 'M16 14h2', key: 'epxaof' }], ['path', { d: 'M6.17 15a3 3 0 0 1 5.66 0', key: 'n6f512' }], ['circle', { cx: '9', cy: '11', r: '2', key: 'yxgjnd' }], ['rect', { x: '2', y: '5', width: '20', height: '14', rx: '2', key: 'qneu4z' }]] },
  /** Lucide FileText. */
  { id: 'arquivo', label: 'Arquivo', desenho: [['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z', key: '1oefj6' }], ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5', key: 'wfsgrz' }], ['path', { d: 'M10 9H8', key: 'b1mrlr' }], ['path', { d: 'M16 13H8', key: 't4e002' }], ['path', { d: 'M16 17H8', key: 'z1uh3a' }]] },
  // dinheiro e compras
  /** Lucide CreditCard. */
  { id: 'cartao', label: 'Cartão', desenho: [['rect', { width: '20', height: '14', x: '2', y: '5', rx: '2', key: 'ynyp8z' }], ['line', { x1: '2', x2: '22', y1: '10', y2: '10', key: '1b3vmo' }]] },
  /** Lucide Wallet. */
  { id: 'carteira', label: 'Carteira', desenho: [['path', { d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', key: '18etb6' }], ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4', key: 'xoc0q4' }]] },
  /** Lucide PiggyBank. */
  { id: 'cofrinho', label: 'Cofrinho', desenho: [['path', { d: 'M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.16 3.16 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z', key: '1piglc' }], ['path', { d: 'M16 10h.01', key: '1m94wz' }], ['path', { d: 'M2 8v1a2 2 0 0 0 2 2h1', key: '1env43' }]] },
  /** Lucide ChartLine. */
  { id: 'grafico', label: 'Gráfico', desenho: [['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16', key: 'c24i48' }], ['path', { d: 'm19 9-5 5-4-4-3 3', key: '2osh9i' }]] },
  /** Lucide Receipt. */
  { id: 'recibo', label: 'Recibo', desenho: [['path', { d: 'M12 17V7', key: 'pyj7ub' }], ['path', { d: 'M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8', key: '1elt7d' }], ['path', { d: 'M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z', key: 'ycz6yz' }]] },
  /** Lucide Store. */
  { id: 'loja', label: 'Loja', desenho: [['path', { d: 'M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5', key: 'slp6dd' }], ['path', { d: 'M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244', key: 'o0xfot' }], ['path', { d: 'M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05', key: 'wn3emo' }]] },
  /** Lucide ShoppingBag. */
  { id: 'sacola', label: 'Sacola', desenho: [['path', { d: 'M16 10a4 4 0 0 1-8 0', key: '1ltviw' }], ['path', { d: 'M3.103 6.034h17.794', key: 'awc11p' }], ['path', { d: 'M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z', key: 'o988cm' }]] },
  // lazer
  /** Lucide Gamepad2. */
  { id: 'jogos', label: 'Jogos', desenho: [['line', { x1: '6', x2: '10', y1: '11', y2: '11', key: '1gktln' }], ['line', { x1: '8', x2: '8', y1: '9', y2: '13', key: 'qnk9ow' }], ['line', { x1: '15', x2: '15.01', y1: '12', y2: '12', key: 'krot7o' }], ['line', { x1: '18', x2: '18.01', y1: '10', y2: '10', key: '1lcuu1' }], ['path', { d: 'M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z', key: 'mfqc10' }]] },
  /** Lucide Dices. */
  { id: 'dados', label: 'Dados', desenho: [['rect', { width: '12', height: '12', x: '2', y: '10', rx: '2', ry: '2', key: '6agr2n' }], ['path', { d: 'm17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6', key: '1o487t' }], ['path', { d: 'M6 18h.01', key: 'uhywen' }], ['path', { d: 'M10 14h.01', key: 'ssrbsk' }], ['path', { d: 'M15 6h.01', key: 'cblpky' }], ['path', { d: 'M18 9h.01', key: '2061c0' }]] },
  /** Lucide PartyPopper. */
  { id: 'festa', label: 'Festa', desenho: [['path', { d: 'M5.8 11.3 2 22l10.7-3.79', key: 'gwxi1d' }], ['path', { d: 'M4 3h.01', key: '1vcuye' }], ['path', { d: 'M22 8h.01', key: '1mrtc2' }], ['path', { d: 'M15 2h.01', key: '1cjtqr' }], ['path', { d: 'M22 20h.01', key: '1mrys2' }], ['path', { d: 'm22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10', key: 'hbicv8' }], ['path', { d: 'm22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17', key: '1i94pl' }], ['path', { d: 'm11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7', key: '1cofks' }], ['path', { d: 'M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z', key: '4kbmks' }]] },
  /** Lucide Cake. */
  { id: 'bolo', label: 'Aniversário', desenho: [['path', { d: 'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8', key: '1w3rig' }], ['path', { d: 'M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1', key: 'n2jgmb' }], ['path', { d: 'M2 21h20', key: '1nyx9w' }], ['path', { d: 'M7 8v3', key: '1qtyvj' }], ['path', { d: 'M12 8v3', key: 'hwp4zt' }], ['path', { d: 'M17 8v3', key: '1i6e5u' }], ['path', { d: 'M7 4h.01', key: '1bh4kh' }], ['path', { d: 'M12 4h.01', key: '1ujb9j' }], ['path', { d: 'M17 4h.01', key: '1upcoc' }]] },
  /** Lucide Gift. */
  { id: 'presente', label: 'Presente', desenho: [['path', { d: 'M12 7v14', key: '1akyts' }], ['path', { d: 'M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8', key: '1sqzm4' }], ['path', { d: 'M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5', key: 'kc0143' }], ['rect', { x: '3', y: '7', width: '18', height: '4', rx: '1', key: '1hberx' }]] },
  /** Lucide Ticket. */
  { id: 'ingresso', label: 'Ingresso', desenho: [['path', { d: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', key: 'qn84l0' }], ['path', { d: 'M13 5v2', key: 'dyzc3o' }], ['path', { d: 'M13 17v2', key: '1ont0d' }], ['path', { d: 'M13 11v2', key: '1wjjxi' }]] },
  /** Lucide Tv. */
  { id: 'tv', label: 'TV', desenho: [['path', { d: 'm17 2-5 5-5-5', key: '16satq' }], ['rect', { width: '20', height: '15', x: '2', y: '7', rx: '2', key: '1e6viu' }]] },
  /** Lucide MonitorPlay. */
  { id: 'streaming', label: 'Streaming', desenho: [['path', { d: 'M15.033 9.44a.647.647 0 0 1 0 1.12l-4.065 2.352a.645.645 0 0 1-.968-.56V7.648a.645.645 0 0 1 .967-.56z', key: 'vbtd3f' }], ['path', { d: 'M12 17v4', key: '1riwvh' }], ['path', { d: 'M8 21h8', key: '1ev6f3' }], ['rect', { x: '2', y: '3', width: '20', height: '14', rx: '2', key: 'x3v2xh' }]] },
  /** Lucide Headphones. */
  { id: 'fones', label: 'Fones', desenho: [['path', { d: 'M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3', key: '1xhozi' }]] },
  /** Lucide Newspaper. */
  { id: 'jornal', label: 'Notícias', desenho: [['path', { d: 'M15 18h-5', key: '95g1m2' }], ['path', { d: 'M18 14h-8', key: 'sponae' }], ['path', { d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2', key: '39pd36' }], ['rect', { width: '8', height: '4', x: '10', y: '6', rx: '1', key: 'aywv1n' }]] },
  /** Lucide Volleyball. */
  { id: 'esporte', label: 'Esporte', desenho: [['path', { d: 'M11.1 7.1a16.55 16.55 0 0 1 10.9 4', key: '2880wi' }], ['path', { d: 'M12 12a12.6 12.6 0 0 1-8.7 5', key: '113sja' }], ['path', { d: 'M16.8 13.6a16.55 16.55 0 0 1-9 7.5', key: '1qmsgl' }], ['path', { d: 'M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10', key: '1bmeqp' }], ['path', { d: 'M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5', key: 'iekzv9' }], ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }]] },
  // casa
  /** Lucide House. */
  { id: 'casa', label: 'Casa', desenho: [['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', key: '5wwlr5' }], ['path', { d: 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', key: 'r6nss1' }]] },
  /** Lucide Wrench. */
  { id: 'ferramenta', label: 'Ferramenta', desenho: [['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z', key: '1ngwbx' }]] },
  /** Lucide Plug. */
  { id: 'energia', label: 'Energia', desenho: [['path', { d: 'M12 22v-5', key: '1ega77' }], ['path', { d: 'M15 8V2', key: '18g5xt' }], ['path', { d: 'M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z', key: '1xoxul' }], ['path', { d: 'M9 8V2', key: '14iosj' }]] },
  /** Lucide Droplet. */
  { id: 'agua', label: 'Água', desenho: [['path', { d: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z', key: 'c7niix' }]] },
  /** Lucide Cctv. */
  { id: 'seguranca', label: 'Câmera de segurança', desenho: [['path', { d: 'M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97', key: 'ir91b5' }], ['path', { d: 'M17.106 9.053a1 1 0 0 1 .447 1.341l-3.106 6.211a1 1 0 0 1-1.342.447L3.61 12.3a2.92 2.92 0 0 1-1.3-3.91L3.69 5.6a2.92 2.92 0 0 1 3.92-1.3z', key: 'jlp8i1' }], ['path', { d: 'M2 19h3.76a2 2 0 0 0 1.8-1.1L9 15', key: '19bib8' }], ['path', { d: 'M2 21v-4', key: 'l40lih' }], ['path', { d: 'M7 9h.01', key: '19b3jx' }]] },
  // transporte e viagem
  /** Lucide Car. */
  { id: 'carro', label: 'Carro', desenho: [['path', { d: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2', key: '5owen' }], ['circle', { cx: '7', cy: '17', r: '2', key: 'u2ysq9' }], ['path', { d: 'M9 17h6', key: 'r8uit2' }], ['circle', { cx: '17', cy: '17', r: '2', key: 'axvx0g' }]] },
  /** Lucide Bus. */
  { id: 'onibus', label: 'Ônibus', desenho: [['path', { d: 'M8 6v6', key: '18i7km' }], ['path', { d: 'M15 6v6', key: '1sg6z9' }], ['path', { d: 'M2 12h19.6', key: 'de5uta' }], ['path', { d: 'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3', key: '1wwztk' }], ['circle', { cx: '7', cy: '18', r: '2', key: '19iecd' }], ['path', { d: 'M9 18h5', key: 'lrx6i' }], ['circle', { cx: '16', cy: '18', r: '2', key: '1v4tcr' }]] },
  /** Lucide Bike. */
  { id: 'bicicleta', label: 'Bicicleta', desenho: [['circle', { cx: '18.5', cy: '17.5', r: '3.5', key: '15x4ox' }], ['circle', { cx: '5.5', cy: '17.5', r: '3.5', key: '1noe27' }], ['circle', { cx: '15', cy: '5', r: '1', key: '19l28e' }], ['path', { d: 'M12 17.5V14l-3-3 4-3 2 3h2', key: '1npguv' }]] },
  /** Lucide MapPin. */
  { id: 'lugar', label: 'Lugar', desenho: [['path', { d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0', key: '1r0f0z' }], ['circle', { cx: '12', cy: '10', r: '3', key: 'ilqhr7' }]] },
  /** Lucide Luggage. */
  { id: 'mala', label: 'Viagem', desenho: [['path', { d: 'M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2', key: '1m57jg' }], ['path', { d: 'M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14', key: '1l99gc' }], ['path', { d: 'M10 20h4', key: 'ni2waw' }], ['circle', { cx: '16', cy: '20', r: '2', key: '1vifvg' }], ['circle', { cx: '8', cy: '20', r: '2', key: 'ckkr5m' }]] },
  /** Lucide BedDouble. */
  { id: 'hotel', label: 'Hotel', desenho: [['path', { d: 'M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8', key: '1k78r4' }], ['path', { d: 'M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4', key: 'fb3tl2' }], ['path', { d: 'M12 4v6', key: '1dcgq2' }], ['path', { d: 'M2 18h20', key: 'ajqnye' }]] },
  /** Lucide TreePalm. */
  { id: 'praia', label: 'Praia', desenho: [['path', { d: 'M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4', key: 'foxbe7' }], ['path', { d: 'M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3', key: '18arnh' }], ['path', { d: 'M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35', key: 'ywahnh' }], ['path', { d: 'M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14', key: 'ft0feo' }]] },
  // comida
  /** Lucide Utensils. */
  { id: 'comida', label: 'Comida', desenho: [['path', { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', key: 'cjf0a3' }], ['path', { d: 'M7 2v20', key: '1473qp' }], ['path', { d: 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7', key: 'j28e5' }]] },
  /** Lucide Coffee. */
  { id: 'cafe', label: 'Café', desenho: [['path', { d: 'M10 2v2', key: '7u0qdc' }], ['path', { d: 'M14 2v2', key: '6buw04' }], ['path', { d: 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1', key: 'pwadti' }], ['path', { d: 'M6 2v2', key: 'colzsn' }]] },
  // saúde
  /** Lucide HeartPulse. */
  { id: 'saude', label: 'Saúde', desenho: [['path', { d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5', key: 'mvr1a0' }], ['path', { d: 'M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27', key: 'auskq0' }]] },
  /** Lucide Pill. */
  { id: 'remedio', label: 'Remédio', desenho: [['path', { d: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z', key: 'wa1lgi' }], ['path', { d: 'm8.5 8.5 7 7', key: 'rvfmvr' }]] },
  /** Lucide Dumbbell. */
  { id: 'academia', label: 'Academia', desenho: [['path', { d: 'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z', key: '9m4mmf' }], ['path', { d: 'm2.5 21.5 1.4-1.4', key: '17g3f0' }], ['path', { d: 'm20.1 3.9 1.4-1.4', key: '1qn309' }], ['path', { d: 'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z', key: '1t2c92' }], ['path', { d: 'm9.6 14.4 4.8-4.8', key: '6umqxw' }]] },
  // gente, bichos e escola
  /** Lucide UserRound. */
  { id: 'pessoa', label: 'Pessoa', desenho: [['circle', { cx: '12', cy: '8', r: '5', key: '1hypcn' }], ['path', { d: 'M20 21a8 8 0 0 0-16 0', key: 'rfgkzh' }]] },
  /** Lucide Baby. */
  { id: 'bebe', label: 'Bebê', desenho: [['path', { d: 'M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5', key: '1u7htd' }], ['path', { d: 'M15 12h.01', key: '1k8ypt' }], ['path', { d: 'M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1', key: '11xh7x' }], ['path', { d: 'M9 12h.01', key: '157uk2' }]] },
  /** Lucide Dog. */
  { id: 'cachorro', label: 'Cachorro', desenho: [['path', { d: 'M11.25 16.25h1.5L12 17z', key: 'w7jh35' }], ['path', { d: 'M16 14v.5', key: '1lajdz' }], ['path', { d: 'M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309', key: 'u7s9ue' }], ['path', { d: 'M8 14v.5', key: '1nzgdb' }], ['path', { d: 'M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5', key: 'v8hric' }]] },
  /** Lucide Cat. */
  { id: 'gato', label: 'Gato', desenho: [['path', { d: 'M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z', key: 'x6xyqk' }], ['path', { d: 'M8 14v.5', key: '1nzgdb' }], ['path', { d: 'M16 14v.5', key: '1lajdz' }], ['path', { d: 'M11.25 16.25h1.5L12 17l-.75-.75Z', key: '12kq1m' }]] },
  /** Lucide Sprout. */
  { id: 'planta', label: 'Planta', desenho: [['path', { d: 'M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3', key: '139s4v' }], ['path', { d: 'M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4', key: '1dlkgp' }], ['path', { d: 'M5 21h14', key: '11awu3' }]] },
  /** Lucide School. */
  { id: 'escola', label: 'Escola', desenho: [['path', { d: 'M14 21v-3a2 2 0 0 0-4 0v3', key: '1rgiei' }], ['path', { d: 'M18 4.933V21', key: 'tjwmp4' }], ['path', { d: 'm4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6', key: 'zywc2d' }], ['path', { d: 'm6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11', key: '1d4ql0' }], ['path', { d: 'M6 4.933V21', key: '1ufz1j' }], ['circle', { cx: '12', cy: '9', r: '2', key: '1092wv' }]] },
] as const satisfies readonly { readonly id: string; readonly label: string; readonly desenho: readonly ElementoDoDesenho[] }[];

export type IdDoIcone = (typeof CARTELA_DE_ICONES)[number]['id'];

/**
 * As cores que dá para escolher: tintas fortes, para a borda fina continuar à vista no manilha. As oito
 * primeiras são as que se sorteiam (grupo novo, tag nova, a cor de um artista); o cinza e o preto só se
 * escolhem (`sorteavel: false`), e entraram no fim para nada que já foi sorteado mudar de cor.
 */
export const CORES_DA_CARTELA = [
  { id: 'vermelho', label: 'Vermelho', hex: '#d63a2f' },
  { id: 'laranja', label: 'Laranja', hex: '#e46f0c' },
  { id: 'amarelo', label: 'Amarelo', hex: '#cf9d00' },
  { id: 'verde', label: 'Verde', hex: '#5e9c1c' },
  { id: 'azul', label: 'Azul', hex: '#2d8bd6' },
  { id: 'roxo', label: 'Roxo', hex: '#8c58d8' },
  { id: 'rosa', label: 'Rosa', hex: '#e2579f' },
  { id: 'vinho', label: 'Vinho', hex: '#ad2463' },
  { id: 'cinza', label: 'Cinza', hex: '#7a756c', sorteavel: false },
  { id: 'preto', label: 'Preto', hex: '#1f1f1f', sorteavel: false },
] as const;

/** As cores que se sorteiam: as oito de antes do cinza e do preto. */
export const CORES_SORTEAVEIS = CORES_DA_CARTELA.filter((c) => !('sorteavel' in c));

export type IdDaCor = (typeof CORES_DA_CARTELA)[number]['id'];

/** O id é de um ícone da cartela? */
export function ehIconeDaCartela(id: unknown): id is IdDoIcone {
  return CARTELA_DE_ICONES.some((i) => i.id === id);
}

/** O id é de uma cor da cartela? */
export function ehCorDaCartela(id: unknown): id is IdDaCor {
  return CORES_DA_CARTELA.some((c) => c.id === id);
}

/** O hex de uma cor da cartela, ou null (sem cor, ou um id que não é dela). */
export function hexDaCor(id: string | null | undefined): string | null {
  return CORES_DA_CARTELA.find((c) => c.id === id)?.hex ?? null;
}
