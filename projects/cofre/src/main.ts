import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { Cofre } from './app/cofre';

/*
 * O cofre de senhas. Não importa nada de src/app (o Murall): só o Angular (regras.test.mjs confere).
 * Sem service worker, sem nada guardado no aparelho (seção 7.4).
 */
bootstrapApplication(Cofre, { providers: [provideBrowserGlobalErrorListeners(), provideZonelessChangeDetection()] }).catch(() => {
  document.body.textContent = 'O cofre não abriu. Recarregue a página.';
});
