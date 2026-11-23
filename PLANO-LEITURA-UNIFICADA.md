# A leitura e a tela cheia viram uma vista só (23/nov/2026)

Pedido do dono (cartão "Unificar a visualização em tela cheia com a visualização maximizada"): a leitura de sempre é
poluída e quase sempre ele pula para a tela cheia; as duas são tão parecidas que o botão mal faz sentido. Quer uma
vista só, mistura das duas: a faixa fina, a largura e a letra da tela cheia; os botões de baixo da leitura, bem mais
finos; Comentários e "Abrir ao lado" repensados (ocupavam espaço, eram feios e não se entendia o que faziam); sem a
orelha de cima; a data e o resto do cabeçalho mantidos, mas menos poluídos e escondidos até ele querer.

Escolhido no preview interativo (`.angular/preview-leitura/`, servidor `leitura-unificada` na porta 6551, versão ★,
`stage.html?v=33`), em quatro rodadas: a 9 (o trilho de etiquetas), a 9A sem as orelhas de pasta, os detalhes na
E5 (tarefas em gomos) com o Kanban da E3 (a seta de prioridade), o desenho da esquerda sempre cinza.

Processo pedido: este plano antes; uma parte por vez, cada uma com `/code-review mid` antes da próxima; Impeccable no
começo (crítica da ★) e no fim; `/code-review high` no final, com os consertos.

---

## 1. Como é hoje

- **A leitura** (`ui/review-reader.ts`, ~2240 linhas, uma por página): um `<dialog>` modal com a dupla `.par`. A ficha
  tem a faixa com o nome (24px em cima, pela tachinha), o corpo que rola e o pé (Mais, Finalizar, Editar, 50px de
  altura). Três jeitos de ver (`vista`): `leitura`, `tela-cheia` (só a faixa fina e o texto, coluna de 52rem + 2cm,
  letra 1,24rem) e `cartolina`.
- **No alto do corpo, na leitura**: a linha da data (quem vê, a pasta, fixada, a data, as tarefas, com quem está), as
  tags e os lugares (o Kanban, os Flashcards, os lembretes). A orelha do grupo sai pela beirada de cima.
- **Na beirada direita**: as orelhas de Comentários e de "Abrir ao lado" (de 900px e de 1180px). No fim do texto, a
  linha das reações e o "Comentar" (na compartilhada de outra pessoa e nas resenhas).
- **A folha de comentários** (`.lado`, `commentsOpen`): ao lado da ficha de 1180px; abaixo disso, por cima dela.

## 2. Decisões

- **D1. Uma vista só.** A leitura passa a ter sempre a medida da tela cheia: a faixa fina, a folha de 52rem + 2cm (a
  tela menos 48px, até lá), a letra de 1,24rem e a pauta de 1,95rem (no celular, a folha da largura da tela, presa no
  alto, a letra de 1,06rem). `ReaderView` fica `'leitura' | 'cartolina'`: o botão "Ler em tela cheia" sai da faixa e
  da cartolina. A troca de largura que guardava o trecho (`readingPlace`/`restorePlace`) continua servindo a cartolina
  e a segunda anotação que fica sozinha.
- **D2. A faixa fina.** O nome, a seta de volta dos links, Ouvir, "Ver só a cartolina" e o X, como na tela cheia de
  hoje. O carimbo da finalizada continua na emenda da faixa com a folha, menor (o tamanho `card` do `DoneStamp`).
- **D3. Sem a orelha do grupo.** O grupo vai para os Detalhes, com o desenho e a cor dele.
- **D4. O pé fino.** A mesma fileira (Mais à esquerda; Finalizar e Editar à direita), com os botões de 34px e o Editar
  menor, na mesma tinta. Com o dedo (`pointer: coarse`), os botões continuam com 44px de alvo.
- **D5. O trilho.** As orelhas da direita dão lugar a um trilho de etiquetas de tinta, fora da folha, na beirada
  direita: **Detalhes** (só nas anotações), **Comentários** (com o número, quando há porta para eles) e **Ao lado**
  (de 1180px, como hoje). Cada etiqueta tem o desenho e o nome embaixo, separada das outras, e reage à mão (cresce e o
  desenho ganha cor), como as etiquetas de ação (`ui/_etiqueta-acoes.scss`). A escolhida fica acesa. Abaixo de 900px
  o trilho deita no pé, ao lado do Mais, só com os desenhos (o nome fica para o leitor de tela). O "Comentar" do fim
  do texto sai: o trilho está em toda largura. As reações ficam onde estão.
- **D6. A folha ao lado.** É a de comentários de hoje (`.lado`), com a faixa de cartolina e o título ("Detalhes" ou
  "Comentários"); o trilho troca o que ela mostra, a mesma etiqueta tocada de novo fecha, e o X também. Ao lado de
  1180px; abaixo, por cima da ficha, com "Voltar para a ficha". As regras de hoje continuam: abrir a folha fecha a
  segunda anotação; na segunda, Detalhes e Comentários a deixam sozinha (`askAlone`), como os comentários hoje.
- **D7. Os Detalhes (a E5 com o Kanban da E3).** Uma lista: em cada linha, o desenho (cinza) e o nome do dado em caixa
  alta miúda, e o valor em letra de texto (o secundário menor, em cinza, embaixo). Só aparecem as linhas com dado:
  - **Grupo**: o desenho dele na cor dele e o nome (`app-cat-label` tingido), sem orelha.
  - **Pasta**: o caminho; tocar abre a parede nela (como hoje).
  - **Data**: na fita de rotular (o Dymo), e "fixada no topo" com a tachinha; a anotação sem data diz "Sem data". A
    finalizada diz "finalizada em …".
  - **Quem vê**: a sua privada, "Só você" com o cadeado; a publicada, "Qualquer pessoa vê no seu mural" com o olho
    (e "sem ir para o Feed" na sem aviso). A compartilhada: as bolinhas com o emoji de cada pessoa na cartolina dela
    (a foto do perfil, que vem com a anotação: `foto` do dono e de cada membro; quem não tem, ou entrou pelo grupo,
    a inicial na cartolina sorteada pelo código, como a `PersonPhoto`), os nomes (que abrem a folha das pessoas, como hoje) e, embaixo, o
    resumo de `accessSummary` (o papel, se é pública).
  - **Tarefas**: o medidor de gomos verde, um gomo por tarefa (até 10; mais que isso, a barra contínua), e "1 de 3
    feitas".
  - **Tags**: a legenda da Wishlist (`ui/wish-tags.ts`): o quadradinho sem borda na cor da tag e o nome em caixa alta
    miúda; sem cor, o quadradinho cinza bem claro (no papel; na parede continua o contorno de hoje).
  - **Kanban**: o quadradinho na cor da coluna e o nome dela (abre o quadro), a seta de prioridade na tinta da
    importância (crítico: a chama; importante: duas setas; médio: uma; baixo: uma para baixo; baixíssimo: duas para
    baixo) com o nome dela, as dependências (o selo de hoje) e, embaixo, a observação entre aspas.
  - **Flashcards**: o desenho do baralho na cor dele, o nome (abre o baralho) e "e mais N"; embaixo, o nível com o
    ponto na cor dele e quando volta.
  - **Agenda**: o desenho do lembrete na cor dele e o dia (abre o Calendário); embaixo, o nome e "e mais N" (que
    mostra os outros, como hoje).
- **D8. As resenhas.** Uma resenha não tem Detalhes: a capa, a nota, os bônus, o boletim e a linha da data são o
  conteúdo dela e ficam no corpo, na folha larga. O trilho delas tem só Comentários.
- **D9. A visita, o link e quem só lê.** A mesma peça (regra "Visita: as mesmas peças do dono"): a de outra pessoa
  mostra o que dá para saber dela (grupo, pasta, data, tags, quem vê pelo `sharedBy`); o Kanban, os Flashcards e a
  Agenda são do dono e não aparecem, como hoje. A peça dos Detalhes só recebe o que mostrar e devolve os toques
  (abrir a pasta, as pessoas, o quadro, o baralho, o dia): não importa nada que escreve.
- **D10. Compartilhadas e sincronização.** Nada muda nos dados: a leitura só lê. A compartilhada aberta continua
  conferida mais seguido e acompanhando o que chega da nuvem (`followShared`); os Detalhes leem do mesmo `review()` e
  do `SharedStore`, então mudam junto quando outra pessoa mexe (grupo, tags, quem está).

## 3. As partes

1. **Os Detalhes e o trilho** (commit 1). `ui/reader-details.ts` (a peça, só entradas e saídas) e o modelo dela
   montado na leitura; `WishTags` ganha o tom do papel; o trilho no lugar das orelhas (e no pé, no celular); a folha
   ao lado com Detalhes ou Comentários; saem do corpo a linha da data, as tags e os lugares da anotação, a orelha do
   grupo e o "Comentar". Testes da peça e da leitura. `/code-review mid`.
2. **Uma vista só** (commit 2). A medida da tela cheia vira a da leitura; sai a `tela-cheia` (o botão, a vista, o Esc
   da ficha solta que voltava dela, a segunda que pedia ficar sozinha em tela cheia); o pé fino; o carimbo menor.
   Testes. `/code-review mid`.
3. **Fechamento**: crítica do Impeccable sobre o que foi feito, `/code-review high`, consertos (commit 3, se houver).

Cada commit: BUILD + 1, a entrada de ajustes de hoje nas Novidades (melhoria M1/M4, ver NOVIDADES.md), `npx ng build`,
a suíte inteira, fotos a 2x no computador e no celular, push.

## 4. Fora (não pedido)

- Mudar o editor, a cartolina, o PDF ou a ficha do mural.
- Detalhes nas resenhas (D8).
- Guardar se a folha dos Detalhes fica aberta entre uma anotação e outra.
