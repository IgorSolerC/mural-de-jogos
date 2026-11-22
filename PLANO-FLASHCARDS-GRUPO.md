# Os Flashcards e os quadros livres de um grupo compartilhado são de todos (21/nov/2026)

Pedido do dono: "Quero que todos os integrantes de grupos que tenham flashcard compartilhem os flashcards e
quadros livres também. Tudo que está no grupo deve ser de todos. Se um usuário alterar um flashcard, deverá
alterar para todos."

Até aqui (PLANO-COMPARTILHAR.md, D9), o grupo compartilhado levava o mural, o Kanban, as pastas e os quadros livres,
mas não os baralhos: cada pessoa tinha os seus Estudos (`StudyStore`, no mural privado dela), e a mesma anotação do
grupo podia ser carta de um e não de outro, com frentes diferentes.

## Decisões

- **D1. Onde mora:** os baralhos e as cartas de um grupo compartilhado vão para o **documento do grupo**
  (`grupos.dados.estudos`, ao lado do `kanban` e das `pastas`), com a mesma subida, a mesma espera sem rede e a
  junção de duas pessoas mexendo ao mesmo tempo (baralho a baralho, carta a carta, o mexido por último vence, e o
  apagado fica apagado: `mergeStudy`, a junção de dois aparelhos). Nada muda na nuvem para guardar: o documento já
  é aberto para o site.
- **D2. O que é do grupo e o que é de cada um.** Do grupo: o baralho (nome, ícone, cor, desenho das cartas, voz,
  "no mural também", público, a ordem) e a carta (de qual anotação, em quais baralhos, a frente, "no mural"). De
  cada um: **o progresso** (o FSRS, os acertos e erros, o recomeçar), **a pausa** e **quantas novas por dia**, o
  dia de hoje e os ajustes dos Estudos. A regra do CLAUDE.md ("estudar, o progresso é dele") vale aqui: duas pessoas
  estudam o mesmo baralho cada uma no seu ritmo, e a pausa de uma não para a outra.
- **D3. Quem pode.** Os papéis de sempre (PLANO-COMPARTILHAR.md, 3.2), estendidos aos baralhos como ao Kanban:
  o Leitor vê os baralhos, estuda (o progresso é dele), pausa e escolhe as novas por dia, e não muda nada no
  baralho nem na carta; o Editor cria, muda e apaga baralhos e cartas; tornar um baralho público (ou deixar de ser)
  é do Gestor e do dono, conferido também na nuvem, como o nome e a cor do grupo.
- **D4. O que já existia.** O grupo compartilhado antes desta build não tem `estudos` no documento. A primeira
  pessoa que escreve no grupo e abre o site leva os baralhos dela daquele grupo para o documento, com as cartas
  (o dono leva os dele; o Editor que tinha baralhos seus no grupo também leva os dele). Nada some: o baralho de
  cada um vira do grupo. O Leitor não escreve no grupo: os baralhos que ele já tinha ali continuam só dele.
- **D5. A cópia guardada.** Os Estudos de cada um continuam guardando tudo o que a pessoa vê (como hoje), e o
  documento do grupo passa por cima no que é do grupo. Assim o progresso fica, o aparelho de uma build de antes
  continua mostrando os baralhos, e parar de compartilhar devolve ao dono tudo como estava no grupo.
- **D6. Sair do grupo.** Quem sai (ou é tirado, ou o dono para de compartilhar) perde as anotações do grupo e
  os baralhos dele saem dos seus Estudos (P4: o que se fez no grupo fica nele). O dono que para de compartilhar
  fica com os baralhos e as cartas como estavam no grupo, e com o seu progresso.
- **D7. Público.** O baralho público de um grupo compartilhado aparece no mural de quem está no grupo, com as
  cartas das anotações que cada um mostra (como hoje no do dono). A API das AIs não vê os baralhos de um grupo
  em que a conta só edita ou lê (a mesma regra das anotações e do Kanban, `ApiReach`).
- **D8. Os quadros livres** já vão com o grupo (PLANO-COMPARTILHAR.md, rodada 6): quem está no grupo vê e edita
  os quadros dele, e o que alguém faz no grupo fica nele. Falta o que ficou anotado lá: o quadro de outra pessoa
  aparece no grupo pelo nome que ela deu ao grupo, e não pelo grupo de verdade; quem tem um grupo seu de mesmo
  nome (o compartilhado aparece como "Nome · Dona") vê o quadro no grupo errado. Passa a ir pelo id do grupo.
- **D9. Compatibilidade:** SYNC_SCHEMA 64 (um site da 63 mudaria só a cópia guardada, e a mudança no baralho de um
  grupo não chegaria a ninguém).

## Partes (uma por vez, cada uma com /code-review mid, commit e push)

1. **Os dados.** `core/shared-study.ts` (puro: ler e escrever a parte dos Estudos no documento, a vista por cima
   dos guardados, a parte de um grupo a partir dos Estudos, a junção), `SharedGroupsStore` (`studies`,
   `updateStudy`, a junção do documento, o aviso antes de um grupo sair), `StudyStore` (`saved` é o guardado e
   `state` a vista; toda mudança vai para o guardado e, no que é do grupo, para o documento; os baralhos de antes
   vão para o documento; sair e parar de compartilhar), a sincronização pelo guardado, o espelho da API sem os
   baralhos dos grupos fechados, e a nuvem conferindo o público dos baralhos. Testes de ponta a ponta com duas
   contas na nuvem de mentira.
2. **A tela.** Quem só lê não vê o que não pode fazer (a folha do baralho, o Novo baralho, os menus, a aba
   Flashcard do editor, Editar as marcadas, Copiar o baralho), a folha do baralho diz de quem é o baralho e que o
   progresso é de cada um, e a peça Quem vê conta os baralhos no que vai junto. Impeccable no começo e no fim.
3. **Os quadros livres** pelo id do grupo (D8).

No fim: /code-review high, Novidades, BUILD, build de produção, fotos 2x.

## Andamento

- [x] Parte 1 — Os dados (BUILD 990): `core/shared-study.ts`, a ponte `core/group-studies.ts` (o `StudyStore` não depende do `SharedGroupsStore`, como as pastas em `GroupFolders`), `saved`/`state` no `StudyStore`, a junção no documento do grupo, sair e parar de compartilhar, o espelho da API e a nuvem conferindo quem vê os baralhos
- [x] Parte 2 — A tela (BUILD 991): `StudyStore.readOnlyGroup`, `readOnlyDeck`, `audienceLocked` e `sharedOf`; quem só lê fica sem Novo baralho, Novo flashcard, Trazer anotações, editar e tirar flashcards, a cartolina de criar e, na folha do baralho, sem o que não é dele (fica o Estudo); quem edita sem gerir vê o Quem vê travado, com o motivo; a folha diz de quem é o baralho; a aba Flashcard do editor diz o que o flashcard é; a peça Quem vê do grupo conta os Flashcards no que vai junto
- [x] Parte 3 — Os quadros livres pelo grupo (BUILD 990, junto da parte 1): `FreeBoardStore.setPlaces`, o lugar que aparece; o guardado continua com o grupo da dona
- [x] Fechamento (BUILD 992): /code-review high com os 8 achados consertados (o baralho seu de antes num grupo só de ler com botões que não faziam nada, o documento que crescia sem fim com os apagados de flashcard e o 413 calado, as cópias dos flashcards do grupo ocupando o teto dos seus, a gravação que levava baralho ao grupo antes de o nome dele estar certo, o menu do quadro de outra pessoa pelo grupo dela, sair do grupo deixando os baralhos seus de antes, os baralhos refeitos a cada resposta, o Editar as marcadas no grupo só de ler); fotos 2x da build de produção com a nuvem de mentira (`.angular/pptr/flashcards-grupo.mjs`), no computador e no celular, de quem só lê e de quem edita. Ficou de fora: a crítica do Impeccable
