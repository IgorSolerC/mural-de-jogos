import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Hash: funciona em qualquer hospedagem de arquivos estáticos, sem regra de reescrita.
    provideRouter(routes, withHashLocation(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
  ],
};
