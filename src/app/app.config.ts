import { ApplicationConfig, ErrorHandler, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, TitleStrategy, provideRouter, withHashLocation, withInMemoryScrolling, withPreloading } from '@angular/router';
import { LocalData } from './core/local-data';
import { MuralErrorHandler } from './core/missing-piece';
import { MuralTitle } from './core/title';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // As resenhas moram no IndexedDB (e a primeira abertura copia o localStorage para lá): tudo é
    // lido para a memória antes de qualquer tela pedir o mural.
    provideAppInitializer(() => inject(LocalData).load()),
    // Hash: funciona em qualquer hospedagem de arquivos estáticos, sem regra de reescrita. Todas as
    // páginas carregam logo depois da primeira, para o service worker guardar e o mural abrir offline.
    provideRouter(
      routes,
      withHashLocation(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
      withPreloading(PreloadAllModules),
    ),
    { provide: TitleStrategy, useExisting: MuralTitle },
    // um pedaço do site que não chegou (uma página aberta antes da última publicação) vira um bilhete
    // com o Recarregar, em vez de um botão que não abre nada (ver core/missing-piece.ts)
    { provide: ErrorHandler, useClass: MuralErrorHandler },
  ],
};
