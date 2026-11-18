# Duas anotações lado a lado (18/nov/2026)

Pedido do dono (cartão "Possibilidade de ver 2 notas ao mesmo tempo"): hoje a leitura mostra uma anotação por vez.
Com uma aberta, um "+" na direita abre o "Escolher a nota" de sempre; a escolhida abre à direita da primeira, lado
a lado. Editar, fechar, minimizar ou pôr em tela cheia uma das duas fecha a outra.

Processo pedido: este plano antes; uma feature por vez, cada uma com `/code-review mid` antes da próxima;
Impeccable no começo e no fim; `/code-review high` no final.

---

## 1. Como é hoje

- **A leitura** (`ui/review-reader.ts`, ~1800 linhas, uma por página: `app.html`, a visita e o perfil têm a sua): um
  `<dialog>` modal com a dupla `.par`, a ficha (faixa com o nome, os botões "Ouvir", "Ver só a cartolina", "Ler em tela
  cheia" e o X; o corpo que rola; o pé com Mais, Finalizar e Editar) e, puxada pela orelha da direita, a folha de
  comentários. Os três jeitos de ver (`vista`): leitura, tela cheia e só a cartolina (o "minimizar"). Os links do
  texto abrem outra anotação na mesma folha, com o "Voltar" (`trail`).
- **A orelha dos comentários** (DESIGN.md, "Orelha"): um marcador de fichário na cartolina da ficha, saindo 41px da
  beirada direita a 92px do alto, o desenho e "Comentários" de pé, a pincel. Desde 900px.
- **O "Escolher a nota"** (`ui/card-picker.ts`): a folha com a busca, os filtros (`CardFilters`) e as abas por mural,
  usada pelo widget Nota, o Kanban, os lembretes, os Flashcards e o Quadro livre. Só lê as suas fichas
  (`ReviewStore`) e as suas pastas (`NoteFolders`).
- **A compartilhada aberta** é conferida mais seguido (`SharedStore.watch`, um conjunto de ids) e acompanha o que
  chega da nuvem (`followShared`).

## 2. Decisões (minhas, ditas aqui)

- **D1. Uma peça só: a segunda é a própria leitura.** A anotação da direita é outra `ReviewReader`, dentro do diálogo
  da primeira, no modo "ao lado" (`aoLado`): o mesmo molde, os mesmos botões, os links com o "Voltar", as tarefas que
  se marcam, a voz, as reações, o Mais. Nada desenhado de novo: o que entrar na leitura entra nas duas. No modo ao lado
  ela é um `<dialog>` aberto sem ser modal (`show()`), no fluxo do diálogo de fora, sem fundo nem Esc próprios.
- **D2. O "+" é uma orelha.** Um segundo marcador de fichário na beirada direita, logo abaixo do de Comentários (ou no
  lugar dele, quando a ficha não tem comentários), igual a ele: a cartolina da ficha, o "+" e "Abrir ao lado" de pé, a
  pincel; puxa 3px com o mouse; o anel amarelo no foco. Aparece só na leitura de sempre de uma anotação (não nas
  resenhas: lá o "Lado a lado" já existe e é outra coisa), fora da ficha aberta pelo link, e só onde cabem as duas
  (de 1180px, a mesma medida da folha de comentários ao lado).
- **D3. O seletor é o de sempre.** O "+" abre o `CardPicker`, só as anotações, sem a aberta, com o título "Abrir ao
  lado" e "Toque numa anotação para abrir ao lado dela.", sem o "Nova anotação". Na visita, as anotações publicadas da
  pessoa e as pastas dela: o `CardPicker` ganha a lista e a árvore de quem usa (`source`, `folderTree`; sem elas, as
  suas, como hoje).
- **D4. As duas, lado a lado.** Cada uma é a ficha inteira, com a tachinha, a faixa, a orelha do grupo e o pé dela,
  com 28px entre as duas; o diálogo cresce para caber (até 1560px, com 56px de margem de cada lado) e as duas dividem
  a largura por igual (nunca mais largas que a leitura de hoje). A da direita chega puxada de trás da primeira, como a
  folha de comentários (`puxa-folha`; sem, com o movimento reduzido). As orelhas da direita (Comentários e o "+") saem
  enquanto há duas: o lugar delas é o da outra ficha. O foco vai para o nome da que abriu.
- **D5. O que fecha a outra** (o pedido): Editar (de qualquer uma) fecha as duas e abre o editor naquela; o X
  da primeira fecha as duas (o Esc e o toque no fundo também, como hoje), e o da segunda fecha só ela (pedido do dono
  depois de ver pronto, 18/nov: a primeira fica); "Ver só a cartolina" ou "Ler em tela cheia" numa delas fecha a
  outra, e ela fica sozinha naquele jeito, no mesmo trecho onde se lia. Abrir os comentários (a orelha não está, mas o
  "Comentar" e o "Citar" sim) também: a folha de comentários precisa do lado direito. O que sai da leitura (o quadro
  do Kanban, a pasta, o dia do Calendário, o perfil, o Apagar) fecha as duas, como hoje.
- **D6. Quando só a da direita sai.** Finalizar a da direita (ela sai do mural) ou ela deixar de existir (o conflito
  resolvido apagando) fecha só ela: a primeira fica, e o foco volta para o "+". Com a tela estreitando para menos de
  1180px, a da direita fecha do mesmo jeito.
- **D7. A mesma anotação nas duas.** O seletor não oferece a aberta; se um link de uma levar à que está na outra, ela
  abre (as duas mostram a mesma, e marcar uma tarefa numa aparece na outra, pela loja).
- **D8. Os ids da página.** A da direita usa os seus (`leitura-titulo-2`, `leitura-comentarios-2`): o nome dela é
  quem a anuncia, e as perguntas por seletor de cada uma ficam dentro dela (a de fora pula a de dentro).

## 3. Compartilhado e sincronização

A segunda leitura não grava nada que a primeira já não grave: as tarefas marcadas, fixar, finalizar e o conflito
passam pelas mesmas funções (`ReviewStore`, `SharedStore`, `NoteDone`, `NotePin`), cada uma lendo a versão de agora
da loja antes de gravar (`tickTask` sobre `store.get`). As duas acompanham a nuvem cada uma por si (`followShared`).
O único ponto de encontro é a conferência mais seguido: `SharedStore.watch` era um conjunto, e as duas folhas com a
mesma compartilhada (D7) desligariam uma à outra; passa a contar quantas folhas olham cada id (só para de olhar
quando a última sai). Duas pessoas numa compartilhada continuam como hoje: cada uma vê e grava a sua leitura.

## 4. As features, uma por vez

1. **A leitura ao lado** (D1, D4–D8, a seção 3): o modo `aoLado` da `ReviewReader` (o `<dialog>` não modal, o
   molde e os ids dele), a de fora com a segunda (`openBeside`), o desenho das duas lado a lado, as regras de D5 e D6
   (a que fica sozinha herda o jeito e o trecho), a tela que estreita, o `watch` contado. Testes: as duas abrem, os
   ids, cada regra de D5 e D6, o trecho mantido na tela cheia, a tela estreita, o `watch` com duas folhas.
2. **O "+" e o seletor** (D2, D3): a orelha, o `CardPicker` com `source` e `folderTree`, a visita (o mesmo
   `CardPicker` com as dela), o foco, as Novidades. Testes: a orelha só onde vale (anotação, leitura, tela larga,
   uma só), escolher abre ao lado, a aberta fora da lista, na visita as dela, o seletor sem `source` igual ao de hoje.

Cada uma: os testes, a suíte, os de regra, `npx ng build`, fotos 2x no computador e no celular na build de
produção, BUILD, `/code-review mid`, commit e push. As Novidades entram com a feature 2 (antes dela a segunda leitura
não tem por onde abrir). No fim, a crítica do Impeccable, o `/code-review high` e o DESIGN.md.
