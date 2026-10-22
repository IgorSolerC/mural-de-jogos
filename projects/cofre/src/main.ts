import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { demonstracao } from './app/ambiente';
import { Cofre } from './app/cofre';
import { SERVICOS, servicosDoNavegador } from './app/servicos';

/*
 * O cofre de senhas. Não importa nada de src/app (o Murall): só o Angular (regras.test.mjs confere).
 * Sem service worker, sem nada guardado no aparelho (seção 7.4).
 */
// o golpe do "cole isto no console": um aviso grande para quem abrir as ferramentas do navegador
console.warn(
  '%cPARE!%c\nEste é o cofre de senhas. Se alguém pediu para você colar alguma coisa aqui, é golpe: quem fizer isso pode levar as suas senhas.',
  'color:#b81d1c;font:900 42px sans-serif',
  'font:600 16px sans-serif',
);

bootstrapApplication(Cofre, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    { provide: SERVICOS, useFactory: () => demonstracao()?.servicos ?? servicosDoNavegador() },
  ],
}).catch(() => {
  document.body.textContent = 'O cofre não abriu. Recarregue a página.';
});
