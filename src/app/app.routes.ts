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
  { path: 'ajustes', title: 'Ajustes', loadComponent: () => import('./pages/settings-page').then((m) => m.SettingsPage) },
  { path: '**', redirectTo: '' },
];
