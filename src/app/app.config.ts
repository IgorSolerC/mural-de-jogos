import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, TitleStrategy, provideRouter, withHashLocation, withInMemoryScrolling, withPreloading } from '@angular/router';
import { MuralTitle } from './core/title';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Hash: funciona em qualquer hospedagem de arquivos estáticos, sem regra de reescrita. Todas as
    // páginas carregam logo depois da primeira, para o service worker guardar e o mural abrir offline.
    provideRouter(
      routes,
      withHashLocation(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      withPreloading(PreloadAllModules),
    ),
    { provide: TitleStrategy, useExisting: MuralTitle },
  ],
};
