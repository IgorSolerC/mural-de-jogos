# Regras do Murall (ler antes de qualquer feature)

## Sair da conta apaga TUDO o que o site guarda no navegador

Pedido do dono do projeto, depois de um incidente em 26/out/2026: o mural de uma conta foi parar em outra
porque o navegador guardava os dados depois do logout. Manter dados depois de sair "só faz perder a
segurança de ter um login". Por isso, sem exceção:

1. **Depois de um logout, nada do que o site guardou pode ficar no navegador.** Vale para todo caminho de
   saída: o botão Sair, "Sair de todos os aparelhos", a sessão que acabou (401) e a conta apagada.
2. **O que está guardado é de uma conta (a que está logada, e só enquanto está) ou de ninguém** (quem
   nunca entrou). O de uma conta **nunca** se junta com o de outra. O de ninguém só vai para uma conta
   se a pessoa escolher.
3. A limpeza mora em `src/app/core/browser-reset.ts` (`wipeBrowser`, `resetOnBoot`, `BrowserReset`).
   Ela roda na subida da página, em `src/main.ts`, antes de o app ler qualquer coisa. Não crie outro jeito
   de sair da conta que não passe por ela.

### Toda feature que guarda algo no navegador

- **localStorage / sessionStorage**: a chave começa com `meu-mural:` (ou o legado `mural-de-jogos:`),
  senão a limpeza não a encontra. Grave pelos ajudantes de `src/app/core/storage.ts` (`writeJson`,
  `writeText`), que respeitam a trava `freezeStorage` enquanto a página recarrega.
- **IndexedDB**: banco novo entra na lista de `wipeBrowser` em `browser-reset.ts`, e quem grava nele
  confere `storageFrozen()`.
- **Cache Storage** (service worker, `public/sw.js`), **cookies**, **OPFS** ou qualquer outro armazenamento
  novo: entra em `wipeBrowser`.
- Não leia o armazenamento no nível do módulo (fora de construtor ou função): a limpeza roda depois dos
  imports, e uma leitura feita na importação pegaria os dados de antes.
- Dado novo de uma conta que sincroniza conta como conteúdo em `localHasContent` (`src/app/core/cloud-sync.ts`):
  assim, ao entrar, o de ninguém pergunta antes de ir para a conta.
- Escreva o teste em `src/app/core/browser-reset.spec.ts` mostrando que o dado novo sai na limpeza.

A única exceção é o que não é do site, como as chaves de outros sites no mesmo navegador. Na dúvida, apaga.
