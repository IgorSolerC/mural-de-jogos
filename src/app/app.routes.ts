import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Mural de Jogos', loadComponent: () => import('./pages/wall-page').then((m) => m.WallPage) },
  {
    path: 'lado-a-lado',
    title: 'Lado a lado · Mural de Jogos',
    loadComponent: () => import('./pages/side-by-side-page').then((m) => m.SideBySidePage),
  },
  { path: 'fila', title: 'Pra depois · Mural de Jogos', loadComponent: () => import('./pages/queue-page').then((m) => m.QueuePage) },
  { path: 'ranking', title: 'Ranking · Mural de Jogos', loadComponent: () => import('./pages/ranking-page').then((m) => m.RankingPage) },
  { path: 'ajustes', title: 'Ajustes · Mural de Jogos', loadComponent: () => import('./pages/settings-page').then((m) => m.SettingsPage) },
  { path: '**', redirectTo: '' },
];
