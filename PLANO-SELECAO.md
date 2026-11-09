# Marcar várias coisas de uma vez (plano, 09/nov/2026)

Pedido: marcar também as análises (juntando com o Lado a lado), Shift+clique para marcar um intervalo, editar
as marcadas em massa (grupo, tags, pasta, quem vê, cartolina…) no mural, no Kanban e nos baralhos, e arrastar
várias no mural como no Kanban, com um código só para as duas páginas.

## 1. Um jeito só de marcar (ui/note-selection.ts)

A peça `NoteSelection` continua sendo a única: o mural (anotações e análises), o Kanban e a parede dos
Flashcards a usam, cada um dizendo só quais são as fichas dele.

- **Começar:** Ctrl+clique (⌘ no Mac) ou Shift+clique numa ficha. No toque: o botão Marcar da pasta do mural
  (agora também nas anotações) e o "Marcar" do menu da ficha (segurar o dedo).
- **Marcando** (alguma marcada, ou o modo Marcar ligado): o toque numa ficha marca ou desmarca, sem abrir;
  Shift+toque marca o intervalo da última marcada até ela, na ordem em que estão na tela; o Ctrl+toque continua
  marcando. Esc, Pronto ou Limpar na tira, ou um toque no vão da parede, desmarcam.
- **A tira** (`ui/selection-tray.ts`, a tira do Lado a lado que virou de todos): presa no pé da tela, diz
  quantas estão marcadas e o que dá para fazer com elas: Editar, Mover para pasta, Copiar, Ver lado a lado
  (análises), Marcar as visíveis, Limpar, Pronto. Substitui o bilhete "N anotações marcadas".
- **As análises:** a marca é a do Lado a lado (`SideBySide`, guardada por mural, como antes). Pronto sai do
  modo e as marcas ficam para o Lado a lado (o número no botão Marcar); nas anotações e no Kanban, Pronto
  desmarca (a marca delas é só para agir agora).
- O que já valia continua: Ctrl+C copia, arrastar uma marcada leva todas, trocar de quadro desmarca.

## 2. Arrastar várias, um código só (ui/drag-pile.ts)

O mural não levava as marcadas porque apertar uma ficha desmarcava tudo antes de o arrasto começar. Agora o
mural usa `drags: true` como o Kanban. O que as duas páginas faziam cada uma do seu jeito sai para
`ui/drag-pile.ts`: quem vai junto (`dragGroup`: as marcadas, na ordem da tela, se a pega é uma delas) e o maço
que segue o ponteiro (`dragPile`: a pega por cima, até duas por baixo, o número). O mural troca a cópia com o
número pelo mesmo maço do Kanban; o CSS do maço sai para `ui/_pilha-arrasto.scss`.

## 3. Editar as marcadas (ui/bulk-edit-sheet.ts + core/note-bulk.ts)

Uma folha "Editar N marcadas", aberta pela tira e pelo menu de uma marcada. As etiquetas são as do editor
(a fileira de propriedades: Grupo, Pasta, Tags; e as escolhas de papel), com os mesmos seletores
(`GroupPicker`, `FolderPicker`, `TagPicker`).

- **Divergência à vista:** a etiqueta de um campo em que as marcadas diferem diz "Vários" com o tracejado de
  "não escolhido", e a linha diz como estão ("3 públicas, 2 privadas"). Mexer no campo vale para todas.
- **Tags:** as que todas têm aparecem como sempre; as que só algumas têm aparecem tracejadas com "em 3 de 5".
  Tirar uma tira de todas, pôr uma põe em todas, tocar numa tracejada põe nas que faltam. Nenhuma outra tag
  de cada anotação se perde (sobrescrever tudo apagaria as tags de cada uma).
- **Campos:** anotações: Grupo, Pasta (no grupo comum; mudar o grupo tira das pastas, como no editor), Tags,
  Quem vê (Público/Privado), Cor da cartolina, Fixada. Análises: Quem vê e Cor da cartolina. No Kanban, mais
  Coluna, Importância e "No mural". Nos Flashcards, mais "Onde aparece" (Só como flashcard / No mural e como
  flashcard / Como o baralho).
- **Agora** (a última linha, porque não espera o Aplicar): Finalizar/Reabrir e Apagar (com a pergunta de sempre e o
  Desfazer). Nos Flashcards não há Apagar: levaria a anotação inteira, e não só o flashcard.
- **Gravar:** um Aplicar só, um bilhete só com um Desfazer só. A regra de cada campo é a mesma da API
  (`withFields` em core/api-requests.ts): a mesma grafia do grupo e das tags que o mural já usa, mudar de grupo
  tira da pasta. As compartilhadas: quem vê só muda em Compartilhar (fica de fora, e o bilhete diz); quem só lê
  não muda a cartolina.
- A visita não tem nada disso (as peças recebem a ação por uma entrada que só a página do dono passa).

## 4. Rodadas

1. Marcar (Shift, toque marcando, análises, tira, Marcar nas anotações e no menu) e arrastar várias no mural.
2. A folha de editar as marcadas no mural e no Kanban.
3. Marcar e editar nos Flashcards.
4. Crítica do Impeccable, /code-review high e as correções.

## 5. Andamento

- [x] Rodada 1 (Shift, toque marcando, análises no Lado a lado, a tira, Marcar nas anotações e no menu, arrastar várias)
- [x] Rodada 2 (a folha no mural e no Kanban; as ações de agora numa linha "Agora", não no pé)
- [x] Rodada 3 (nos Flashcards: Onde aparece, sem Apagar, no masculino)
- [ ] Rodada 4
