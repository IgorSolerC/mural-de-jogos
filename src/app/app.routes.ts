import { Routes } from '@angular/router';

// O título de cada página ganha o mural aberto (ver core/title.ts); o mural em si não leva nome de página.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/wall-page').then((m) => m.WallPage) },
  {
    path: 'lado-a-lado',
    title: 'Lado a lado',
    loadComponent: () => import('./pages/side-by-side-page').then((m) => m.SideBySidePage),
  },
  { path: 'fila', title: 'Pra depois', loadComponent: () => import('./pages/queue-page').then((m) => m.QueuePage) },
  {
    path: 'wishlist',
    title: 'Wishlist',
    loadComponent: () => import('./pages/wishlist-page').then((m) => m.WishlistPage),
  },
  { path: 'ranking', title: 'Ranking', loadComponent: () => import('./pages/ranking-page').then((m) => m.RankingPage) },
  { path: 'comparar', title: 'Comparar murais', loadComponent: () => import('./pages/comparison-page').then((m) => m.ComparisonPage) },
  {
    path: 'comparar/mural',
    title: 'Mural do colega',
    loadComponent: () => import('./pages/colleague-wall-page').then((m) => m.ColleagueWallPage),
  },
  { path: 'extras', title: 'Extras', loadComponent: () => import('./pages/extras-page').then((m) => m.ExtrasPage) },
  {
    path: 'extras/mata-mata',
    title: 'Mata-mata',
    loadComponent: () => import('./pages/knockout-page').then((m) => m.KnockoutPage),
  },
  {
    path: 'extras/maior-ou-menor',
    title: 'Maior ou menor',
    loadComponent: () => import('./pages/higher-lower-page').then((m) => m.HigherLowerPage),
  },
  {
    path: 'extras/estatisticas',
    title: 'Estatísticas',
    loadComponent: () => import('./pages/stats-page').then((m) => m.StatsPage),
  },
  {
    path: 'extras/muraldle',
    title: 'Muraldle',
    loadComponent: () => import('./pages/muraldle-page').then((m) => m.MuraldlePage),
  },
  { path: 'ajustes', title: 'Ajustes', loadComponent: () => import('./pages/settings-page').then((m) => m.SettingsPage) },
  { path: 'novidades', title: 'Novidades', loadComponent: () => import('./pages/news-page').then((m) => m.NewsPage) },
  { path: '**', redirectTo: '' },
];
