import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { onlyAdmin } from './core/admin';
import { POMODORO_PATH, SPENDING_PATH, enterExtras, enterNotes, enterReviews, toCalendar, toLastWall, toReviews } from './core/areas';

const wall = () => import('./pages/wall-page').then((m) => m.WallPage);
const kanban = () => import('./pages/kanban-page').then((m) => m.KanbanPage);
const calendar = () => import('./pages/calendar-page').then((m) => m.CalendarPage);
const study = () => import('./pages/study-page').then((m) => m.StudyPage);
const colleague = () => import('./pages/colleague-wall-page').then((m) => m.ColleagueWallPage);

/**
 * A visita: `/comparar/mural` e `/comparar/mural/estudos[/:grupo[/:baralho]]` (PLANO-BARALHOS-PUBLICOS.md). Uma
 * rota com quatro endereços, e não quatro rotas: com quatro, o Router refazia a página (a ficha da dona, o
 * seguir, a volta) a cada aba ou baralho tocado.
 */
export function visitMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  const [a, b, secao, grupo, baralho, ...rest] = segments;
  if (a?.path !== 'comparar' || b?.path !== 'mural' || rest.length) return null;
  if (!secao) return { consumed: segments, posParams: {} };
  if (secao.path === 'quadro-livre') return { consumed: segments, posParams: { secao, ...(grupo ? { grupo } : {}), ...(baralho ? { quadro: baralho } : {}) } };
  if (secao.path !== 'estudos') return null;
  return { consumed: segments, posParams: { secao, ...(grupo ? { grupo } : {}), ...(baralho ? { baralho } : {}) } };
}

/**
 * O Quadro livre: `/anotacoes/quadro-livre[/:grupo[/:quadro]]` (PLANO-QUADRO-LIVRE.md, 4.1). Uma rota com três
 * endereços, como a visita: abrir e fechar um quadro não refaz a página (a lista fica onde estava).
 */
export function freeBoardMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  const [a, b, grupo, quadro, ...rest] = segments;
  if (a?.path !== 'anotacoes' || b?.path !== 'quadro-livre' || rest.length) return null;
  return { consumed: segments, posParams: { ...(grupo ? { grupo } : {}), ...(quadro ? { quadro } : {}) } };
}

/**
 * O site em quatro partes (ver core/areas.ts): as Anotações, as Análises, com o mural de resenhas no
 * endereço (`/analises/livros/pra-depois`), as Utilidades e os Extras. O mural aberto sai do endereço; nos Extras,
 * do seletor da própria página. O título de cada página ganha o mural (ver core/title.ts).
 */
export const routes: Routes = [
  // "Murall": a última parede aberta
  { path: '', pathMatch: 'full', redirectTo: toLastWall },
  { path: 'anotacoes', title: 'Anotações', canActivate: [enterNotes], loadComponent: wall },
  { path: 'anotacoes/kanban', title: 'Kanban', canActivate: [enterNotes], loadComponent: kanban },
  { path: 'anotacoes/kanban/:quadro', title: 'Kanban', canActivate: [enterNotes], loadComponent: kanban },
  { path: 'anotacoes/estudos', title: 'Flashcards', canActivate: [enterNotes], loadComponent: study },
  // um grupo, ou um baralho dele; o endereço de antes dos grupos (/anotacoes/estudos/:baralho) cai no
  // primeiro, e a página leva ao baralho no grupo dele
  { path: 'anotacoes/estudos/:grupo', title: 'Flashcards', canActivate: [enterNotes], loadComponent: study },
  { path: 'anotacoes/estudos/:grupo/:baralho', title: 'Flashcards', canActivate: [enterNotes], loadComponent: study },
  // o Calendário morava aqui até 02/nov/2026: o endereço de antes vai para o novo com a query (dia, lembrete)
  { matcher: freeBoardMatcher, title: 'Quadro livre', canActivate: [enterNotes], loadComponent: () => import('./pages/free-boards-page').then((m) => m.FreeBoardsPage) },
  { path: 'anotacoes/calendario', redirectTo: toCalendar },
  { path: 'analises', pathMatch: 'full', redirectTo: toReviews() },
  {
    path: 'analises/:tipo',
    canActivate: [enterReviews],
    children: [
      { path: '', loadComponent: wall },
      { path: 'pra-depois', title: 'Pra depois', loadComponent: () => import('./pages/queue-page').then((m) => m.QueuePage) },
      { path: 'wishlist', title: 'Wishlist', loadComponent: () => import('./pages/wishlist-page').then((m) => m.WishlistPage) },
      {
        path: 'lado-a-lado',
        title: 'Lado a lado',
        loadComponent: () => import('./pages/side-by-side-page').then((m) => m.SideBySidePage),
      },
    ],
  },
  // as Utilidades: os Gastos e o Calendário aqui, o cofre de senhas na origem dele (um link na barra)
  { path: 'utilidades', pathMatch: 'full', redirectTo: SPENDING_PATH },
  { path: 'utilidades/gastos', title: 'Gastos', loadComponent: () => import('./pages/spending-page').then((m) => m.SpendingPage) },
  { path: 'utilidades/calendario', title: 'Calendário', loadComponent: calendar },
  // os endereços de antes das três partes
  { path: 'fila', redirectTo: toReviews('pra-depois') },
  { path: 'wishlist', redirectTo: toReviews('wishlist') },
  { path: 'lado-a-lado', redirectTo: toReviews('lado-a-lado') },
  {
    path: 'ranking',
    canActivate: [enterExtras],
    title: 'Ranking',
    loadComponent: () => import('./pages/ranking-page').then((m) => m.RankingPage),
  },
  {
    path: 'comparar',
    canActivate: [enterExtras],
    title: 'Comparar murais',
    loadComponent: () => import('./pages/comparison-page').then((m) => m.ComparisonPage),
  },
  {
    // o mural da pessoa (com o próprio seletor de mural, e pode ser o de anotações) e os baralhos públicos dos
    // Estudos dela, por grupo e baralho: uma rota só, para a página continuar a mesma ao andar entre eles
    matcher: visitMatcher,
    title: (route) => (route.paramMap.get('secao') ? 'Flashcards do colega' : 'Mural do colega'),
    loadComponent: colleague,
  },
  {
    path: 'extras',
    canActivate: [enterExtras],
    title: 'Extras',
    loadComponent: () => import('./pages/extras-page').then((m) => m.ExtrasPage),
  },
  {
    path: 'extras/mata-mata',
    canActivate: [enterExtras],
    title: 'Mata-mata',
    loadComponent: () => import('./pages/knockout-page').then((m) => m.KnockoutPage),
  },
  {
    path: 'extras/maior-ou-menor',
    canActivate: [enterExtras],
    title: 'Maior ou menor',
    loadComponent: () => import('./pages/higher-lower-page').then((m) => m.HigherLowerPage),
  },
  {
    path: 'extras/estatisticas',
    canActivate: [enterExtras],
    title: 'Estatísticas',
    loadComponent: () => import('./pages/stats-page').then((m) => m.StatsPage),
  },
  {
    path: 'extras/muraldle',
    canActivate: [enterExtras],
    title: 'Muraldle',
    loadComponent: () => import('./pages/muraldle-page').then((m) => m.MuraldlePage),
  },
  {
    // o Pomodoro (PLANO-POMODORO.md); sem o enterExtras, porque não depende do mural
    path: POMODORO_PATH.slice(1),
    title: 'Pomodoro',
    loadComponent: () => import('./pages/pomodoro-page').then((m) => m.PomodoroPage),
  },
  {
    // só a conta de admin; sem o enterExtras, porque a página não depende do mural
    path: 'extras/uso-das-apis',
    canActivate: [onlyAdmin],
    title: 'Uso das APIs',
    loadComponent: () => import('./pages/api-usage-page').then((m) => m.ApiUsagePage),
  },
  {
    path: 'perfil/editar',
    title: 'Seu perfil',
    loadComponent: () => import('./pages/profile-edit-page').then((m) => m.ProfileEditPage),
  },
  // o seu perfil, e o de alguém pelo código (o mesmo do mural)
  { path: 'perfil', title: 'Perfil', loadComponent: () => import('./pages/profile-page').then((m) => m.ProfilePage) },
  { path: 'perfil/:codigo', title: 'Perfil', loadComponent: () => import('./pages/profile-page').then((m) => m.ProfilePage) },
  { path: 'ajustes', title: 'Ajustes', loadComponent: () => import('./pages/settings-page').then((m) => m.SettingsPage) },
  { path: 'amigos', title: 'Amigos', loadComponent: () => import('./pages/mail-page').then((m) => m.MailPage) },
  // o primeiro nome da aba
  { path: 'correio', redirectTo: 'amigos' },
  // a ficha aberta pelo link: só ela, maximizada, para quem não usa o Murall (ver core/ficha-link.ts)
  { path: 'ficha/:codigo/:id', title: 'Ficha', loadComponent: () => import('./pages/ficha-page').then((m) => m.FichaPage) },
  // um conector (claude.ai, Claude Code) pedindo acesso pelo OAuth (PLANO-API.md, 11.2)
  { path: 'autorizar', title: 'Autorizar', loadComponent: () => import('./pages/authorize-page').then((m) => m.AuthorizePage) },
  // o laboratório do Quadro livre (PLANO-QUADRO-LIVRE.md, rodada 2): escondido, nenhum link leva até ele
  { path: 'laboratorio/quadro-livre', title: 'Quadro livre', loadComponent: () => import('./pages/free-board-lab-page').then((m) => m.FreeBoardLabPage) },
  { path: 'novidades', title: 'Novidades',loadComponent: () => import('./pages/news-page').then((m) => m.NewsPage) },
  // um endereço que não existe (ou uma seção que um mural não tem): a última parede aberta. Pela função, e
  // não por '' (que redireciona de novo): o Router não segue a segunda e a página ficava em branco em "/"
  { path: '**', redirectTo: toLastWall },
];
