import { Routes } from '@angular/router';
import { enterExtras, enterNotes, enterReviews, toLastWall, toReviews } from './core/areas';

const wall = () => import('./pages/wall-page').then((m) => m.WallPage);

/**
 * O site em três partes (ver core/areas.ts): as Anotações, as Análises, com o mural de resenhas no
 * endereço (`/analises/livros/pra-depois`), e os Extras. O mural aberto sai do endereço; nos Extras,
 * do seletor da própria página. O título de cada página ganha o mural (ver core/title.ts).
 */
export const routes: Routes = [
  // "Murall": a última parede aberta
  { path: '', pathMatch: 'full', redirectTo: toLastWall },
  { path: 'anotacoes', title: 'Anotações', canActivate: [enterNotes], loadComponent: wall },
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
    path: 'comparar/mural',
    // o mural da pessoa tem o próprio seletor de mural (e pode ser o de anotações)
    title: 'Mural do colega',
    loadComponent: () => import('./pages/colleague-wall-page').then((m) => m.ColleagueWallPage),
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
  { path: 'novidades', title: 'Novidades', loadComponent: () => import('./pages/news-page').then((m) => m.NewsPage) },
  { path: '**', redirectTo: '' },
];
