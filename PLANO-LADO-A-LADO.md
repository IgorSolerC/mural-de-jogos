# Lado a lado com tudo (26/nov/2026)

Pedido do dono (cartão "Melhorar o botão de 'ao lado' das anotações para que tenha mais opções"): hoje o "Ao lado" da
leitura só abre outra anotação. Ele quer abrir também análises, o Dicionário Japonês e canvas (só ver), e que cada
lado seja um lugar inteiro: o zoom de uma imagem, widget ou tabela, a lousa do kanji e o editor da anotação ficam
no lado deles, sem cobrir nem travar o outro; dá para editar as duas ao mesmo tempo, ampliar duas peças ao mesmo
tempo; fechar um lado fecha só ele, e o que fica vira a anotação de antes (com Comentários, Detalhes e Ao lado de
volta), até quando o que fica é o dicionário.

Processo pedido: este plano antes, com o Impeccable (shape); uma feature por vez, cada uma com `/code-review mid`
antes da próxima; a crítica do Impeccable e o `/code-review high` no fim.

---

## 1. Como é hoje (PLANO-DUAS-NOTAS.md, PLANO-LEITURA-UNIFICADA.md)

- **A leitura** (`ui/review-reader.ts`): um `<dialog>` modal com a ficha (`.par`) e as folhas ao lado (Detalhes,
  Comentários) que o trilho abre. A segunda anotação é a própria `ReviewReader` no modo `aoLado`, um `<dialog>` não
  modal dentro do de fora. O trilho deita no pé de cada uma enquanto há duas; o "Ao lado" só aparece com uma só, de
  1180px.
- **As regras de hoje** (D5/D6 de lá): o X da primeira fecha as duas; o da segunda, só ela. Editar fecha as duas e
  abre o editor de sempre. Só a cartolina, Detalhes, Comentários ou Citar numa delas fecha a outra (ela fica sozinha,
  `askAlone` → `takeOver`, no mesmo trecho).
- **O zoom das peças**: `ui/piece-lift.ts` (vídeo, áudio, contador, nota colada, tabela) sobe a peça como `popover`
  no meio da tela, com o véu (`::backdrop`), o X, o Tab preso nela e o toque fora fechando. A foto tem o visor dela
  (`ui/image-viewer.ts`, um `<dialog>` modal no body).
- **O editor** (`ui/review-editor.ts`): um só, no `app.html`, modal; a prévia da cartolina vai à direita de 1024px
  (`@media`), e em cima do estojo (aba Cartolina) abaixo disso.
- **O dicionário** (`pages/dictionary-page.ts`): uma página (rota preguiçosa), com o estado no endereço, a rolagem
  da janela, a lousa (`ui/word-board.ts`) e as conjugações (`ui/word-conjugations.ts`) modais.
- **O canvas** (`pages/canvas-page.ts`, `ui/visit-canvas.ts`): o quadro em tela cheia (`FreeBoardView`), que sem
  `editing` e sem `owner` só se vê.
- **O "Escolher a nota"** (`ui/card-picker.ts`): todas as fichas de todos os murais (o "Onde" separa), menos os
  canvas; `onlyKind` restringe a um mural.

## 2. Decisões (minhas, ditas aqui)

- **D1. Cada lado é um lugar.** Com dois abertos, tudo o que um lado abre fica nele: as folhas do trilho (Detalhes,
  Comentários, o Citar) cobrem a ficha daquele lado, como já fazem no celular (com o "Voltar para a ficha"); Só a
  cartolina mostra a ficha do mural do maior tamanho que cabe naquele lado; o zoom, a lousa e o editor também. O outro
  lado continua à vista e se toca. Sozinho, tudo volta a ser como hoje (o trilho de pé na beirada, as folhas ao lado,
  o zoom no meio da tela). Isso troca a regra de 18/nov ("Só a cartolina, Detalhes ou Comentários numa fecha a outra"):
  o pedido novo é que um lado nunca derrube o outro.
- **D2. Fechar um lado fecha só ele.** O X de cada lado diz "Fechar só esta"; o de fora deixa de fechar as duas. O que
  fica passa a ser a leitura sozinha, no mesmo trecho, com o foco no nome dele: o trilho de pé volta (Detalhes,
  Comentários, Ao lado). Fechar a leitura inteira continua no Esc e no toque no escuro em volta (e em todo caminho
  para fora: o quadro, a pasta, o perfil). A tela que estreita para menos de 1180px fecha o lado de lá (como hoje),
  menos o que tem edição aberta (D8).
- **D3. O que abre ao lado.** O "Ao lado" abre o "Escolher a nota" de sempre com tudo o que se lê: as anotações, as
  análises de todos os murais (o "Onde" já separa) e os canvas (com a miniatura dele e "Canvas" na linha); e, em cima
  da busca, uma linha fixa para o Dicionário Japonês, com o carimbo 辞 dele, que abre na hora. Título "Abrir ao lado",
  "Uma anotação, análise, canvas ou o dicionário, para ver ao lado desta.". O "Ao lado" passa a existir também na
  análise e no canvas (sozinhos, na leitura de sempre): "funcionar com tudo".
- **D4. Canvas na leitura é só ver.** Um canvas aberto na leitura (ao lado, ou o que ficou) mostra o quadro dele no
  corpo da ficha, do tamanho do lado, com o arrastar e o zoom do quadro e o "Ver tudo", sem editar; no pé, no lugar do
  Editar, "Abrir o canvas" (a página dele, onde se edita). Os Detalhes e os Comentários são os da anotação.
- **D5. O dicionário ao lado é o mesmo dicionário.** A página vira uma peça (`DictionaryView`) com duas fontes do
  estado: o endereço (a página) e um sinal só dela (ao lado). Ao lado, a pasta com a busca, o Filtrar, as Favoritas, a
  ordem e a vista fica presa em cima enquanto as palavras rolam; a lousa da escrita e as conjugações cobrem só o lado
  do dicionário. O Treinar fica de fora ao lado (é uma sessão de estudo, não uma consulta). O dicionário tem a faixa de
  uma ficha (o nome, o X "Fechar só esta") e, sozinho, o "Ao lado" para escolher outra coisa.
- **D6. Onde abre o novo.** O escolhido abre sempre à direita do que está aberto (o botão está na beirada direita).
  O que fica sozinho vai para o meio; o próximo escolhido entra à direita dele.
- **D7. Editar ao lado.** Com dois abertos, o Editar de um lado abre o editor naquele lado, no lugar da ficha, e o
  outro continua (lendo ou editando: dá para editar as duas). O editor ao lado é o mesmo editor, sem o modal: a
  largura do lado decide o jeito dele, as mesmas regras de hoje pela largura da janela, agora pela do lado (a cartolina
  em cima do estojo, na aba dela, até 1024px; ao lado do texto só num lado largo, de monitor muito grande). Salvar ou
  fechar volta a ficha à leitura, com o que mudou. Sozinho, o Editar é o de hoje (fecha a leitura, abre o editor).
- **D8. Nada se perde.** A mesma anotação não se edita nos dois lados: o Editar do outro lado leva o foco para o editor
  já aberto e avisa. O lado que lê a anotação que o outro salvou mostra a de agora. Fechar a leitura inteira (o Esc, o
  fundo, um caminho para fora) com um editor ao lado que tem algo por salvar pergunta antes, como o editor pergunta. A
  tela estreitando não fecha o lado que está editando.
- **D9. O zoom de cada lado.** Com dois abertos, a peça ampliada sobe do tamanho que cabe no lado dela, o véu cobre só
  esse lado e o toque nele desce a peça; o outro lado se toca (o Tab não fica preso, o Esc desce a peça do lado onde
  está o foco). Dá para ampliar uma em cada lado. A foto ampliada também.

## 3. Compartilhado e sincronização

Nada novo grava: cada lado lê e grava pelas mesmas funções de hoje (`ReviewStore`, `SharedStore`, `NoteDone`,
`NotePin`, o editor). O editor ao lado é o editor de sempre, então a compartilhada se salva como no modal (a versão e
o conflito de lá). Os pontos de encontro: a mesma anotação nos dois lados (D8: um editor por anotação; o lado que só lê
passa a mostrar a versão salva, sem gravar nada); a conferência mais seguido (`SharedStore.watch`, que já conta folhas);
as marcas do dicionário (`DictionaryMarks`, a loja de sempre). O canvas ao lado só lê o quadro (`FreeBoardStore` no seu
mural, `VisitBoards` na visita). Duas pessoas numa compartilhada continuam como hoje.

## 4. As features, uma por vez

1. **Cada lado por si** (D1, D2): as folhas do trilho e o Citar cobrindo o próprio lado; Só a cartolina dentro do lado;
   o X de cada lado fechando só ele (o de dentro que fica vira a leitura sozinha); a sala de cada lado (`ROOM`, para as
   rodadas seguintes). Testes: cada folha no seu lado sem fechar o outro, a cartolina de cada lado, os dois X, o foco.
2. **O zoom em cada lado** (D9): `PieceLift` e o visor da foto medindo o lado (a sala) com dois abertos; o véu do lado;
   o outro lado vivo; dois zooms. Testes: a peça cabe no lado, o toque no outro lado não desce, o Esc, dois de uma vez,
   sozinho como hoje.
3. **Editar em cada lado** (D7, D8): o editor sem o modal dentro do lado, o jeito pela largura do lado (as regras de
   largura viram mixins usados pela janela e pelo lado), salvar e fechar de volta à leitura, as duas editando, a mesma
   anotação, as perguntas antes de fechar, a tela que estreita. Testes: cada um desses.
4. **Análises e canvas ao lado** (D3 sem o dicionário, D4): o seletor com tudo, o "Ao lado" na análise e no canvas, o
   canvas na leitura (o quadro só de ver e o "Abrir o canvas"). Testes: o seletor, a análise ao lado, o canvas ao lado,
   na visita.
5. **O dicionário ao lado** (D3, D5, D6): a `DictionaryView` saindo da página (a página fica com o endereço), o lado
   dele (a faixa, a pasta presa, a lousa e as conjugações no lado), sozinho com o "Ao lado", o novo entrando à direita.
   Testes: a página como antes, o dicionário ao lado, a lousa no lado, fechar a anotação e sobrar o dicionário, escolher
   outra a partir dele.
6. **O fechamento**: a crítica do Impeccable, o `/code-review high`, o DESIGN.md.

Cada uma: os testes, a suíte, os de regra, `npx ng build`, fotos 2x no computador e no celular na build de produção,
BUILD, Novidades (uma entrada de funcionalidade, a 1.58.0, que cresce a cada rodada), `/code-review mid`, commit e
push.
