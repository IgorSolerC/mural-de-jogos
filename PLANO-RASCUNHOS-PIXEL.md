# Sair do ateliê perguntando, e rascunhos que não se perdem

Pedido do dono (cartão do Dev Murall, 24/nov/2026): ao sair do ateliê da pixel art (Pronto, Esc, qualquer jeito),
perguntar se quer **salvar, descartar ou salvar como cópia** (hoje tudo vai na hora e não há volta). E guardar a
arte que está sendo feita **neste aparelho, de tempos em tempos**, como um **rascunho** que aparece para continuar
depois, mesmo sem ter salvo; salvar faz o rascunho sumir. "Bem robusto, sem chance de perder uma arte que ama."

Impeccable no começo e no fim; uma rodada por vez, cada uma com /code-review mid antes da próxima; /code-review
high no fim. Um commit (com push) por rodada.

## Onde o ateliê abre hoje (e o que muda em cada um)

| Quem abre | Hoje | Salvar | Salvar como cópia | Descartar |
|---|---|---|---|---|
| Galeria, botão Ateliê da obra (`pages/pixel-arts-page`) | guarda ao fechar, com Desfazer | a obra muda (Desfazer) | obra nova "X (cópia)" na mesma pasta; a de antes fica | nada muda |
| Ficha da obra (`ui/pixel-sheet`, pelo `PixelField`) | vai para a ficha na hora | vai para a ficha (a ficha salva) | editando: obra nova com o desenho; a ficha fica como estava | a ficha fica como estava |
| Widget das anotações (`ui/widget-sheet`, pelo `PixelField`) | vai para a folha na hora | vai para a folha (o Pôr salva) | com desenho de antes: a cópia vai para a galeria, o widget fica como era | a folha fica como estava |
| Capa de pixel art (`ui/cover-picker`) | ao fechar, vira obra e capa | vira obra e capa | (desenho novo: sem cópia) | nada muda |

## Decidido sem perguntar (o dono pode reverter)

- **D1. Nada sai do ateliê antes de a pessoa dizer.** O ateliê guarda as mudanças com ele; `saved` (Salvar) e
  `copied` (Salvar como cópia) levam o desenho para quem abriu. Descartar é não mandar nada: não há como o
  descartado vazar. (`changed`/`stackChanged` continuam saindo a cada mudança, para quem quiser acompanhar.)
- **D2. Sem mudança, sem pergunta.** Abriu e fechou, ou desfez tudo até voltar ao de antes: fecha direto (não há o
  que perder; a pergunta sem motivo ensina a clicar sem ler). A conta é o desenho escrito, não o desfazer.
- **D3. A pergunta é a fichinha de sempre** (`Confirm.choose`, três respostas): **Salvar** (a principal, tinta),
  **Salvar como cópia** e **Descartar** na linha de cima, **Voltar ao ateliê** ao lado da principal. Esc e o
  clique fora voltam ao ateliê (o seguro). Desenho novo (sem original): só Salvar e Descartar.
- **D4. O Esc nunca fecha sozinho.** O ateliê segura o Esc e o `cancel` do `<dialog>`; e se o navegador fechar o
  `<dialog>` mesmo assim (o Chrome fecha no segundo Esc sem clique no meio), ele abre de novo e pergunta.
- **D5. Descartar tem Desfazer** (rodada 2): o aviso "Mudanças descartadas" traz o rascunho de volta.
- **D6. O rascunho mora no IndexedDB** (`meu-mural:rascunhos`, banco próprio): uma obra de 256 × 256 com camadas
  passa de centenas de kB, e o localStorage é pouco e dividido com o site todo. Sai na limpeza do Sair
  (`wipeBrowser`) e no Apagar o save; quem grava confere `storageFrozen()`. Conta como mural de ninguém em
  `localHasContent` (entrar pergunta antes de ele ir para a conta). Não sincroniza (pedido: "no dispositivo").
- **D7. Um rascunho por vez de ateliê aberto**, gravado um segundo depois da última mudança (e no máximo a cada
  cinco segundos desenhando sem parar), e na hora quando a aba some (`visibilitychange`, `pagehide`). Guarda o
  desenho inteiro (as camadas), o nome, de onde veio (a obra, uma obra nova, um widget) e o desenho de quando
  abriu (para achar o rascunho ao abrir de novo e para saber se ainda há mudança). Feito (rodada 2): a gravação do IndexedDB
  começada no `pagehide` é cortada com a página saindo (visto na build de produção), então a aba que some guarda
  também às pressas no localStorage (`meu-mural:rascunho-guardando:<id>`, síncrono), que a próxima abertura passa
  para o banco; o `put` que chega depois tira o guardado às pressas.
- **D8. O rascunho só some quando o desenho está salvo de verdade**: Salvar ou Salvar como cópia (que deram
  certo; a galeria cheia não apaga nada) ou Descartar. Numa ficha (a da obra, a do widget), o Salvar do ateliê
  ainda não é salvar: o rascunho fica até a ficha salvar, ou até a pessoa descartar na pergunta da ficha. A folha
  do widget fechada sem Pôr com um rascunho na mão avisa que ele ficou nos rascunhos (com Descartar).
- **D9. Onde aparece**: (a) na galeria de pixel arts, no alto da raiz, a seção **Rascunhos** (cada um com o
  desenho, de onde veio e quando foi guardado; tocar continua; a etiqueta de hover tem Continuar e Descartar, no
  padrão do Finalizar/Fixar); (b) ao abrir o ateliê da mesma arte (a mesma obra, ou o widget com o mesmo
  desenho), a pergunta "Continuar o rascunho?" (Continuar o rascunho · Descartar o rascunho · Abrir o salvo; Esc
  abre o salvo e o rascunho fica).
- **D10. Continuar pela galeria**: o rascunho de uma obra salva nela (se ela ainda existe; senão vira obra nova);
  o de obra nova, de widget ou de capa vira obra nova na galeria (o widget pega da galeria pelo "Escolher da
  galeria" da folha). O rascunho de uma obra que mudou noutro aparelho depois: salvar troca, com o Desfazer de sempre.
- **D11. Duas abas**: o ateliê aberto segura o rascunho (`navigator.locks`); a outra aba não o continua nem o
  oferece ("aberto noutra aba"), e a lista se atualiza entre as abas (`BroadcastChannel`). A aba que morre solta.
- **D12. Confiança à vista**: a barra de estado do ateliê diz "Rascunho guardado às 14:32" (e, sem IndexedDB,
  "Sem rascunho neste navegador"), em silêncio para o leitor de tela (não fala a cada gravação). No celular a barra de
  estado do ateliê não aparece: a rodada 4 decide onde a hora do rascunho mora lá.

## Compartilhado e sincronização

Os rascunhos são só deste aparelho e desta conta; nada vai para a nuvem nem para grupos. O widget de uma nota
compartilhada continua salvando pelo caminho de sempre (o Pôr da folha e a nota), então a junção não muda. A
galeria é do mural privado: salvar um rascunho é um `update`/`create` como qualquer outro.

## Rodadas

1. **A pergunta ao sair** (D1–D4): `saved`/`copied` no ateliê, a conta de "mudou", o Esc preso, os quatro
   lugares que abrem o ateliê. Testes de cada resposta em cada lugar. Novidades.
2. **O rascunho guardado** (D5–D8, D11, D12): `core/pixel-drafts.ts` (banco, loja com sinais, travas,
   aviso entre abas), o ateliê gravando, a barra de estado, o Desfazer do Descartar, a limpeza
   (`browser-reset.spec.ts`), `localHasContent`.
3. **O rascunho à vista** (D9, D10): a seção Rascunhos na galeria, continuar e descartar, a pergunta ao abrir,
   o aviso da folha do widget. Novidades. Feito (rodada 3), com o que faltava da 2: a folha do widget fechada sem Pôr avisa,
   e a ficha da obra apagada noutro aparelho diz que o desenho ficou nos rascunhos. A ficha descartada com um
   rascunho continuado nela tira o rascunho com o Desfazer.
4. **Fim**: crítica do Impeccable, /code-review high, fotos de perto no computador e no celular, DESIGN.md,
   memória.
