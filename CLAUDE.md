# Regras do Murall (ler antes de qualquer feature)

## Botões de hover dos cards: um padrão só

Pedido do dono do projeto em 07/nov/2026, depois de o Kanban e os Flashcards terem saído diferentes do
mural. **Todo botão de ação que aparece ao passar o mouse sobre um card, em qualquer mural, hoje e nos
que vierem, segue o padrão do Finalizar e do Fixar do mural de anotações:**

1. **Separados**: cada botão é uma etiqueta de tinta própria, com fundo e sombra próprios e um vão entre
   eles. Nunca juntos numa etiqueta só, nunca com um fio separando.
2. **Reagem ao mouse**: o botão cresce (`scale: 1.06`) e o desenho ganha uma cor que combine com ele.
   Nunca só clarear o fundo, nunca ficar parado.

Como fazer: use os mixins de `src/app/ui/_etiqueta-acoes.scss` (`grupo`, `botao`, `mostra`, `cor-na-mao`,
`com-nome`) e não copie o CSS. O card decide só onde a etiqueta fica e quando aparece. Tamanho diferente
só por falta de espaço de verdade, como nas miniaturas de flashcard; quem usa escreve `expectEtiquetaPadrao`
(`src/app/testing/etiqueta-acoes.spec.ts`) num teste. `scripts/etiqueta-acoes.test.mjs` falha se alguém revelar
botões com o mouse por conta própria.

## Visita: as mesmas peças do dono

Pedido do dono do projeto em 09/nov/2026, depois de a carta dos Flashcards virar no mural dele e, na visita,
abrir como anotação (a visita tinha uma parede só dela, que ficou para trás). **O que funciona no seu Murall
funciona para quem visita.** Só fica de fora o que é do dono: editar, estudar (o progresso é dele), as
configurações, os montes de hoje e o que é privado.

1. **Uma peça só.** A visita monta as mesmas peças do dono, nunca uma cópia: no mural, `WallBoard` e
   `WallToolbar` sobre a vista `VisitView`; nos Flashcards, `StudyGroupTabs`, `StudyPiles` e `StudyCardWall`
   (`src/app/ui/`). Coisa nova numa peça já aparece na visita.
2. **Os dados por uma fonte.** A peça lê pelo que quem usa dá: a vista do mural (`WallState`) ou a fonte dos
   Flashcards (`STUDY_SOURCE`, `src/app/core/study-source.ts`). A peça não importa nada que escreve
   (`StudyStore`, `ReviewStore`, `Desk`…): o que só o dono faz entra pela página dele, por uma entrada da peça
   (`editable`, `ownerMenu`, `publicMark`), e a visita não tem nem como chamar.
3. **Feature nova que a visita também mostra** entra em `PECAS` (e, se for da visita, em `VISITA` e `SO_LEEM`)
   de `scripts/visita-mesmas-pecas.test.mjs`, que falha se alguém desenhar à mão o que uma peça desenha ou se
   uma peça da visita importar o que escreve. E ganha um teste que faz na visita o que o dono faz (como em
   `src/app/ui/visit-study.spec.ts`, "a parede é a mesma dos seus Flashcards").

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
