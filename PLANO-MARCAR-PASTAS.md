# Marcar pastas junto com o que está nelas (17/nov/2026)

Pedido do dono (cartão "Possibilidade de selecionar pastas no CONTROL/SHIFT para mover/deletar"): hoje as pastas
só se movem, se desfazem e se escolhem uma de cada vez. Ele quer marcar pastas com Ctrl/Shift, como já se marcam
as anotações, **pastas e anotações ao mesmo tempo**, para mover em massa e pôr várias anotações e pastas dentro de
outras pastas com facilidade, sem quebrar nada nem ficar confuso (editar em massa, copiar em massa…). Decidido
com ele: vale nas três paredes com pastas, as **Anotações**, a **galeria de pixel arts** e a **Wishlist** (que
ainda não marca nada e ganha a seleção inteira).

Processo pedido: este plano antes; uma rodada por vez, cada uma com `/code-review mid` antes da próxima;
Impeccable no começo e no fim; `/code-review high` no final.

---

## 1. Como é hoje

- **Marcar** é uma peça só, `ui/note-selection.ts` (`NoteSelection`): Ctrl/⌘+clique ou Shift+clique numa ficha,
  o toque marcando, o tracejado de giz com o adesivo da ordem (`ui/_marcada.scss`), a tira no pé
  (`ui/selection-tray.ts`), Esc/Pronto/o vão saem. Usam: o mural (anotações e análises), o Kanban, a parede dos
  Flashcards e a galeria de pixel arts. A pasta (`app-folder-card`) não marca: o clique com Ctrl numa pasta
  apenas a abre, e o toque no vão marcando ignora as pastas (`INTERACTIVE`).
- **Arrastar** é uma peça só, `pages/wall-drag.ts` (`WallDrag`), nas três paredes: as fichas marcadas vão juntas
  (`ui/drag-pile.ts`); a pasta vai sempre sozinha.
- **As pastas** das três paredes são as das Anotações (`core/note-folders.ts`, com `WishFolders` e `PixelFolders`
  por cima: `place`, `gather`, `move`, `dissolve`, `join`…). Mover uma pasta só dentro do grupo dela
  (`withMovedFolder`); para outro grupo, só apagando o grupo inteiro e levando tudo (`foldersOfGroupMoved`).
- **Apagar uma pasta** não existe: há o "Desfazer a pasta" (o que está dentro sobe, nada é apagado).
- As três páginas repetem o mesmo `dropped`, o mesmo menu da pasta e a mesma folha "Mover para…".

## 2. Decisões (minhas, ditas aqui)

- **D1. Marcar uma pasta é marcar uma ficha.** Ctrl/⌘+clique e Shift+clique na pasta; marcando, o toque nela
  marca ou desmarca; "Marcar" no menu dela (o do botão direito, do dedo segurado, de Shift+F10). A marcada
  ganha o mesmo tracejado de giz e o mesmo adesivo com a ordem das fichas (o mixin de `_marcada.scss`), a 3px
  do meio do vão entre as pastas (duas vizinhas marcadas não viram uma caixa só, também no celular).
- **D2. Marcando, dois toques abrem a pasta.** O toque marca (como numa ficha); o duplo clique (ou dois toques)
  abre a pasta e deixa a marca como estava; o "Abrir" do menu e o caminho na barra continuam. A frase da tira
  ensina: "Toque para marcar; dois toques abrem a pasta".
- **D3. Uma ordem só.** Pastas e fichas entram na mesma lista, na ordem em que foram marcadas (a pasta como
  `pasta:<id>`, que nenhum id de ficha tem); `ids` continua sendo só as fichas (quem já usa não muda), `folders`
  as pastas, e `count` tudo. O Shift marca o intervalo na ordem da tela (as pastas vêm antes das fichas). A tira
  conta pelos dois: "2 pastas e 3 anotações" (recortes, pixel arts).
- **D4. As marcas ficam ao abrir e fechar pastas**, nas três paredes, como já é nas Anotações: dá para marcar
  numa pasta, subir, marcar mais e mover tudo de uma vez (a tira diz quantas estão fora da vista). A galeria de
  pixel arts, que desmarcava ao trocar de pasta, passa a fazer igual. Pasta desfeita, apagada ou que deixou de
  existir (outro aparelho) sai das marcas.
- **D5. O que está dentro de uma pasta marcada vai com ela.** Se algo marcado (ficha ou pasta) está dentro de
  outra pasta marcada, mover, arrastar e juntar levam só a de cima (`markedTops`): nada sai de dentro da pasta
  marcada. Copiar, editar e apagar pegam o conteúdo das pastas sem contar duas vezes.
- **D6. Arrastar leva tudo.** Pegar uma marcada (ficha ou pasta) leva todas as marcadas; o maço mostra as de
  cima (pastas também). Soltar numa pasta guarda nela; no caminho ou no vão, como hoje; numa ficha não marcada,
  cria a pasta nova com ela e tudo o que foi (as pastas entram na nova). Não são alvo as marcadas nem o que está
  dentro delas. A etiqueta diz o que vai: "Guardar 2 pastas e 3 anotações em Funcional".
- **D7. Mover para pasta** (a tira, o menu de uma marcada): a folha de sempre, sem poder escolher as marcadas e
  o que está dentro delas. Nas Anotações, as marcadas de grupos diferentes não se movem para uma pasta (como
  hoje): a pasta conta pelo grupo dela.
- **D8. Copiar** (Ctrl+C, a tira, o menu): o que está marcado e tudo o que está dentro das pastas marcadas, sem
  repetir, na ordem da parede dentro de cada pasta. Nas Anotações e na Wishlist, título e descrição
  (`notesAsText`); nas pixel arts, os widgets. O bilhete diz: "Copiei o texto de 7 anotações (5 de dentro das
  pastas)".
- **D9. Editar** (Anotações): a folha vale para as anotações marcadas e para as de dentro das pastas marcadas,
  e diz isso ("3 marcadas e 9 dentro de 2 pastas"). Exceções que fazem sentido para pasta:
  - **Pasta**: leva o que está marcado (as pastas inteiras) para a pasta escolhida; as de dentro ficam onde estão.
  - **Grupo**: as pastas marcadas vão para o grupo novo com tudo dentro (a árvore inteira), na raiz dele ou na
    Pasta escolhida; as anotações de dentro trocam de grupo e continuam nas pastas. É o que hoje só o "levar"
    do apagar o grupo faz (`foldersOfGroupMoved`), agora para algumas pastas (a mesma função, por pastas). A de
    mesmo nome que já está lá junta, como no levar.
- **D10. Apagar com pastas** pergunta o que fazer com as pastas: "Apagar tudo" (as pastas somem com o que está
  dentro, pelas regras das compartilhadas do apagar em massa) ou "Só desfazer as pastas" (o de dentro sobe; as
  fichas marcadas soltas saem do mesmo jeito). Sem pasta marcada, a pergunta de hoje. O Desfazer volta as suas e
  as pastas (as compartilhadas que saíram para todos não voltam, como hoje).
- **D11. O menu de uma pasta marcada**, com outras marcadas, ganha no alto o que o de uma ficha marcada tem:
  Editar as N marcadas (Anotações), Mover as N marcadas, Copiar as N marcadas, Desmarcar.
- **D12. A visita não marca pastas** (marcar é só do dono, como hoje). Pasta de um grupo compartilhado em que
  você só lê não se marca (não se move nem se apaga).
- **D13. Nada novo guardado**: as marcas são da página (as do Lado a lado continuam no aparelho); nada na API,
  na nuvem nem no navegador. A limpeza de sair da conta não muda.

## 3. Peças (reaproveitando)

- `ui/note-selection.ts`: o config ganha `folders?: { markable, idOf, live }`; por dentro, a lista de chaves.
- `core/folder-marks.ts` (novo, puro): `markedTops` (só as de cima), `insideMarked` (o que está dentro das pastas
  marcadas, por uma função que diz a pasta de cada ficha), `marksLabel` ("2 pastas e 3 anotações") e
  `moveMarked` (move pastas e fichas para a pasta escolhida com um Desfazer só, pelas `place`/`move` de quem
  chama). As três páginas usam, em vez de três cópias.
- `pages/wall-drag.ts`: o item `notas` ganha `folders`; a pasta marcada pega leva o grupo.
- `ui/folder-card.ts` + `ui/_marcada.scss`: o tracejado na pasta.
- `core/folders.ts`: `foldersToGroup(folders, ids, to, parent, at)`, de que `foldersOfGroupMoved` passa a ser o
  caso de todas as de cima.
- `core/note-bulk.ts` e `ui/bulk-edit-sheet.ts`: as de dentro das pastas, o Grupo levando as pastas, apagar com
  pastas.

## 4. Rodadas

1. **Marcar pastas nas Anotações**: `NoteSelection` com pastas (chaves, tracejado, intervalo, dois toques
   abrem, "Marcar" no menu da pasta), `core/folder-marks.ts`, a tira com as duas contas, Copiar com o que está
   dentro.
2. **Mover juntas nas Anotações**: arrastar pastas e fichas juntas (`WallDrag`), "Mover para pasta" com pastas,
   juntar numa pasta nova, o menu de uma pasta marcada.
3. **Editar e apagar nas Anotações**: a folha com o que está dentro, o Grupo levando as pastas, a Pasta, apagar
   com pastas, Desfazer as pastas.
4. **Pixel arts**: as pastas na seleção, as marcas ficam ao trocar de pasta, Mover/Copiar/Baixar/Tags/Apagar
   com o que está dentro.
5. **Wishlist**: marcar recortes e pastas (Ctrl/Shift, o botão Marcar da barra, a tira), arrastar várias, Mover,
   Copiar, a Vontade, Tirar da wishlist.
6. **Fechamento**: crítica do Impeccable, `/code-review high` e as correções.

## 5. Andamento

- [x] Rodada 1 (a peça marca pastas; dois toques abrem; o Marcar no menu da pasta; a tira conta as duas; a cópia
  leva tudo o que está dentro, também as finalizadas e as só no Kanban)
- [x] Rodada 2 (arrastar e Mover para pasta com pastas, juntar numa pasta nova, o menu de uma marcada; o que é de
  outro grupo fica e o bilhete diz)
- [x] Rodada 3 (a folha com as de dentro, "Também as de dentro das pastas" na tira; Grupo leva as pastas
  (`withFoldersToGroup`, de que o levar do apagar o grupo é o caso de todas as de cima); Pasta leva as de cima;
  Apagar tudo / Só desfazer as pastas, na ficha vermelha; só pastas vazias: o Editar avisa). Rodadas 1–3 num
  commit só (as três mexem nos mesmos arquivos), BUILD 938, Novidades 1.48.1 (M4) e 1.49.0 (F4: pastas para
  outro grupo)
- [x] Rodada 4 (galeria: as pastas na seleção, as marcas ficam ao trocar de pasta, Copiar/Baixar/Tags com as de
  dentro, Apagar com a pergunta das pastas, Mover; `joinMarked`, `movedText` e `foldersRemovalAsk` em
  core/folder-marks.ts, os mesmos nas três paredes; `confirm.choose` passou a aceitar a ficha vermelha)
- [x] Rodada 5 (Wishlist: o Marcar na barra, Ctrl/Shift+clique nos recortes e nas pastas, a tira com Marcar todos,
  Copiar, Tirar da wishlist e Mover; a vontade do menu de um marcado vale para todos; marcar fecha o sorteio).
  Rodadas 1–5 num commit só (BUILD 938)
- [ ] Rodada 6
