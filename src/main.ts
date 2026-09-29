import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

// O mural offline (public/sw.js). No `ng serve` fica de fora, para não servir arquivo velho.
if (!isDevMode() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
    // Na primeira visita a página carregou antes do service worker existir: os arquivos dela (código,
    // estilos, fontes, texturas) não passaram por ele. Guarda agora, senão o offline abre em branco.
    void navigator.serviceWorker.ready.then(async () => {
      const cache = await caches.open('mural-site-v1');
      const own = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((url) => new URL(url).origin === location.origin);
      await Promise.all(
        own.map(async (url) => {
          if (!(await cache.match(url))) await cache.add(url).catch(() => undefined);
        }),
      );
    });
  });
}
