import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { resetOnBoot, watchOtherTabs } from './app/core/browser-reset';

// Saiu da conta (aqui ou em outra aba), ou o mural daqui é de uma conta que não está mais nele: o
// navegador é limpo antes de o app ler qualquer coisa (ver core/browser-reset.ts).
watchOtherTabs();
const booted = resetOnBoot().catch(() => false);
void booted.then(() => bootstrapApplication(App, appConfig)).catch((err) => console.error(err));

// O mural offline (public/sw.js). No `ng serve` fica de fora, para não servir arquivo velho.
if (!isDevMode() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
    // Na primeira visita a página carregou antes do service worker existir, e depois de sair da conta
    // a limpeza apagou o que ele tinha guardado: os arquivos dela (código, estilos, fontes, texturas)
    // não ficaram no cache. Ele guarda agora o que faltar (e o resto do código desta versão, o que só
    // chega quando alguém toca: ver keepVersion em public/sw.js), senão o offline abre em branco.
    // Depois da limpeza, para ela não apagar o que acabou de ser guardado.
    void Promise.all([navigator.serviceWorker.ready, booted])
      .then(([reg]) => {
        const arquivos = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((url) => url.startsWith(location.origin + '/'));
        const economia = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
        reg.active?.postMessage({ tipo: 'guardar-versao', economia, arquivos });
      })
      .catch(() => undefined);
  });
}
