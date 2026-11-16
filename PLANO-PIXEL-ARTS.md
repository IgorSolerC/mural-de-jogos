# Plano: a galeria de pixel arts (Extras → Pixel arts)

Pedido do dono (16/nov/2026): "o Murall tem um editor de pixel art muito bom, denso e legal de usar. Entretanto,
não há maneiras fáceis e consolidadas de salvar a pixel art nesse sistema." Uma aba nova em Extras, **Pixel arts**:
a galeria com todas as pixel arts feitas, com pastas, seleção em massa, título, tags, descrição e exibições
diferentes, com a Wishlist das Análises como base forte. Fácil ver tudo, categorizar e criar novas. Estética,
uso intuitivo, reaproveitar o que existe. Impeccable no começo e no fim; uma feature por vez com
`/code-review mid`; no fim, `/code-review high`. O dono pediu para não perguntar nada e ir até o fim: as
decisões abaixo são minhas e estão marcadas como suposições onde ele poderia querer outra coisa.

---

## 1. O brief (Impeccable, shape)

- **Quem e quando.** O dono, no computador e no celular, depois de desenhar no ateliê (ou para começar um
  desenho), e quando quer rever o que já fez. Modo **Experience** dentro de uma ferramenta: a obra manda na
  primeira tela; a barra fica quieta, a da Wishlist.
- **O que precisa dar certo.** Ver todas de uma vez e achar uma (busca, tags, jeito, pasta); criar uma nova em
  um toque (o ateliê abre na hora); guardar com nome, tags, pasta e descrição sem pensar; organizar várias de
  uma vez. Prova: a parede bonita de voltar, e "Nova pixel art" → desenhar → Salvar em menos de um minuto.
- **O que só daqui pode dizer.** Cada pixel art já tem um jeito de papelaria (Pixel, Figurinha, Ponto-cruz,
  Miçanga, DESIGN.md "Pixel art"): a galeria expõe cada uma **no material dela**, como numa mostra de
  trabalhos manuais pregada na parede. Ninguém mais tem isso.
- **A direção (no mundo do Murall, sem mundo novo).**
  - **Mostra** (a vista padrão, a colagem da Wishlist): cada obra no seu jeito: o Pixel impresso num quadrado
    de papel milimetrado preso com a tachinha; a Figurinha recortada, colada direto na parede; o Ponto-cruz no
    retalho de étamine; a Miçanga na placa de pinos. Colunas como os recortes (o `collage` da Wishlist, a altura
    pela proporção do desenho), um tanto fora do prumo, sorteado pelo id. Embaixo, fora da obra, a legenda de
    museu: o título em Barlow Condensed na tinta da parede e as tags na legenda com cor (a da Wishlist).
  - **Grade** (muitas de uma vez, a Grade da Wishlist): quadrados iguais, cada desenho nítido sobre o xadrez
    do transparente do ateliê, num cartão branco; o título embaixo em duas linhas.
  - O momento: tocar numa obra abre a ficha dela com o desenho grande; a mão em cima mostra a etiqueta de hover
    (Ateliê e Baixar) e, depois de um instante, a folha do caderno com a descrição (a da Wishlist).
- **Fora do escopo, de propósito.** A API e o MCP (não pedidos; a Wishlist só ganhou API na rodada 6 de um
  pedido que a incluía). Animação (o ateliê não tem quadros). Galeria pública na visita (as obras são da conta,
  não de um mural; fica para um pedido próprio). Nenhuma mudança no ateliê nem no widget, além do botão
  "Guardar na galeria" na folha do widget (rodada 6).
- **Faixas.** De 0 a algumas centenas de obras (teto de 500, como os outros tetos de dados do site); desenhos de
  1×1 a 64×64; título até 80 letras; até 12 tags; descrição até 4000 letras (o texto das anotações).
- **Estados.** Vazio (o primeiro uso: o convite com "Nova pixel art" e, se houver, "Trazer das anotações");
  nada achado e pasta vazia (o cartão das Anotações, `ui/_sem-resultados.scss`); marcando várias (a tira);
  arrastando (o fantasma das Anotações); sem desenho (a ficha não salva sem um ponto: a mesma regra do widget).

---

## 2. Os dados

- **A obra** (`core/pixel-gallery.ts`):
  `PixelPiece { id, title, art: string[], tags?, folder?, note?, createdAt, at }`. `art` são os parâmetros do
  widget `{{pixel: …}}` (os de `writePixelArt`, sem a legenda: o título é à parte), então o desenho, o ateliê, a
  cópia como widget e o PDF falam a mesma língua. `note` é a descrição (o mesmo nome do campo da Wishlist).
- **O estado** `PixelGalleryState { pieces, removed }`: lápide por id com a data (o modelo dos Gastos), junção
  obra a obra pela data (`mergePixelGallery`), guardado em `meu-mural:pixel-arts:v1` (localStorage, sai na
  limpeza do logout pelo prefixo) e no mural privado da nuvem (`pixelArts`, SYNC_SCHEMA 58), nunca no público.
  Conta como conteúdo em `localHasContent` e `hasContent` (o de ninguém pergunta antes de ir para a conta).
- **As pastas**: as das Anotações (`NotesConfig.folders`), no grupo `pixel` (`PIXEL_FOLDER_GROUP`), como a
  Wishlist fez com `desejos:<mural>`; `core/pixel-folders.ts` (`PixelFolders`) por cima de `NoteFolders`, e a poda
  das lápides conta as obras também.
- **A cor das tags**: `NotesConfig.pixelTagColors` (tag sem caixa e sem acento → cor), como `wishTagColors`.
- **A vista e a ordem** do aparelho: `meu-mural:pixel-arts:vista:v1` (Mostra ou Grade; Quando fez, Quando
  mudou, Nome, Tamanho; a direção).

---

## 3. A página (`/extras/pixel-arts`, sem depender do mural, como o Pomodoro)

- **Em Extras**, uma prateleira nova **Criar** com a ficha "Pixel arts" (o ícone da pixel art). A barra de baixo
  do topo traz a volta para Extras (`muralFree`). O botão do topo vira **Nova pixel art** nela, e o N também.
- **A pasta de cima** (a `.pasta solta` da Wishlist): a busca (no título, nas tags e na descrição); **Filtrar**
  (a folha das Anotações: a linha de uma por vez é o **Jeito**, com quantas de cada, e as Tags nas cores);
  **Ordenar** (Quando fez, Quando mudou, Nome, Tamanho) com o inverter; a **vista** (Mostra, Grade); **Marcar**
  (liga a seleção, rodada 5). Dentro de uma pasta, o caminho.
- **A etiqueta de hover** (`ui/_etiqueta-acoes.scss`): **Ateliê** (abre o desenho direto no ateliê; o que
  mudar lá vai para a obra ao fechar, com Desfazer) e **Baixar** (o PNG nítido, cada ponto um quadrado inteiro).
  Sem mouse, no pé.
- **Tocar** abre a ficha da obra. **Botão direito / dedo segurado**: Abrir, Abrir no ateliê; Baixar PNG, Copiar
  como widget (a linha `{{pixel: …}}` para colar numa anotação), Duplicar; Mover para pasta… (e Tirar da pasta);
  Apagar (com Desfazer).
- **A descrição** na parede: a folha do caderno com a mão em cima e a ponta dela atrás da obra (a da Wishlist,
  `ui/wish-note.ts` vira peça comum).

## 4. A ficha da obra (pôr e editar são a mesma)

A folha de papel do site (`dialog.sheet`), no jeito do editor das anotações que a Wishlist já usa
(`ui/_props-editor.scss`): à esquerda, a mesa com o desenho grande no xadrez e o botão **Abrir o ateliê** (o
`PixelField` da folha do widget, que já abre o ateliê por cima e já abre sozinho no desenho novo); à direita,
o **Título**, a fileira de etiquetas **Jeito** (as quatro, em miniatura com o próprio desenho), **Tags**
(`ui/tag-picker`), **Pasta** (`ui/folder-picker`, rodada 4) e a **Descrição** (`app-rich-editor`). No pé: Apagar
(editando), Cancelar e Salvar (só o que mudou, com Desfazer). Fechar com algo escrito pergunta antes (a pergunta
das anotações). A obra nova nasce na pasta aberta.

## 5. Marcar várias (rodada 5)

`ui/note-selection.ts` deixa de ser só de anotações (o que marca é qualquer coisa com id; copiar é de quem
usa). A tira (`ui/selection-tray.ts`): **Mover para pasta…** (`FolderMoveSheet`), **Tags…** (a folha de editar
várias, só com Pasta e Tags, no CSS de `bulk-edit-sheet.scss`), **Baixar** (um PNG por obra) e **Apagar** (com
Desfazer). Arrastar uma marcada leva todas (`WallDrag.marked`).

## 6. Trazer das anotações (rodada 6)

"Todas as pixel arts que você já fez": as que moram como widget nas anotações também contam. A galeria vazia
(e o menu do vão) oferece **Trazer das anotações** quando há widgets de pixel art em anotações: a folha lista
cada uma (o desenho, a legenda, a anotação de onde vem), marcadas as que ainda não estão na galeria, e traz como
obras (título = a legenda, ou o título da anotação). Na folha do widget, **Guardar na galeria** guarda o desenho
aberto como obra.

---

## 7. Rodadas (uma de cada vez: testes, `npx ng build`, `/code-review mid`, commit e push)

1. **Os dados:** `core/pixel-gallery.ts`, `core/pixel-gallery-store.ts`, a sincronização (58), as pastas
   (`PixelFolders`, a poda), `pixelTagColors`, a vista do aparelho, os testes (junção, limpeza do logout).
2. **A página, as vistas e a ficha:** a rota, a prateleira Criar, o topo e o N, a barra (busca, Filtrar, Ordenar,
   vista), a Mostra e a Grade, o vazio, a etiqueta de hover (Ateliê direto e Baixar o PNG), a descrição na parede,
   e a ficha da obra (desenho, nome, jeito, tags, descrição), Salvar e Apagar com Desfazer.
3. **O botão direito e o dedo segurado:** o menu da obra (Abrir, Abrir no ateliê; Baixar PNG, Copiar como
   widget, Duplicar; Apagar) e o do vão (Nova pixel art).
4. **As pastas:** na parede, o caminho, o endereço, o arrastar, criar, renomear, mover, desfazer, Mover para
   pasta…, a Pasta na ficha.
5. **Marcar várias:** a seleção comum, a tira, a folha de Pasta e Tags, Baixar e Apagar em massa.
6. **Trazer das anotações** e o **Guardar na galeria** do widget.
7. **O fim:** DESIGN.md, Novidades, a crítica final do Impeccable e o `/code-review high`, com as correções.

## 8. Riscos

- O tamanho no localStorage: um 64×64 de 61 cores cabe em uns 5 kB; 500 obras ≈ 2,5 MB, abaixo do limite. O
  envio à nuvem vai junto do mural privado (os Gastos fazem igual).
- A ordem dos parâmetros posicionais de `fingerprint`/`push` na sincronização: um parâmetro a mais em todos os
  lugares, conferido pela impressão nos testes.
- A poda das lápides das pastas tem de contar as obras (senão a pasta de uma obra some depois de desfeita).
- A Mostra mede a altura pela proporção do desenho (nunca medindo o DOM), como a colagem.

## 9. Andamento

- 16/nov: o plano (este arquivo).
- 16/nov, rodada 1 (BUILD 897): `core/pixel-gallery.ts` (a obra com o desenho do widget sem a legenda, `cleanArt`,
  `withPixelPatch`, a junção obra a obra, `pieceWidgetLine`), `core/pixel-gallery-store.ts` (`PixelGallery`:
  criar, mudar com o Desfazer só do que mudou, guardar em pasta, apagar com lápide e trazer de volta),
  `core/pixel-folders.ts` (`PixelFolders`, no grupo `galeria:pixel-arts`: os dois-pontos não saem de um nome de
  grupo das Anotações) e a poda das lápides das pastas contando as obras. A cor das tags fica nas cores das tags
  da Wishlist, no espaço `pixel` (`PIXEL_TAG_SPACE`), sem campo novo nas configurações. Sincronização: `pixelArts`
  no mural privado, SYNC_SCHEMA 58, conta como conteúdo. O `/code-review mid` achou seis: o teto jogava fora a obra
  mais velha no Desfazer e na junção (agora o teto só barra a obra nova), o título ganhava maiúscula forçada
  (`cleanLabel`; agora a caixa que a pessoa escreveu), a galeria que chega da nuvem era lida duas vezes (agora uma
  por mural, guardada), e o `stampAfter` estava copiado em três armazéns (agora `core/dates.ts`). Ficaram: a galeria
  fora do arquivo de backup (como os Gastos e o Calendário, de propósito) e as pastas no índice local da API (o
  contexto das notas só lista as pastas dos grupos das notas: nada vaza).
- 16/nov, rodada 2 (BUILD 898): `pages/pixel-arts-page.*` em `/extras/pixel-arts` (`muralFree`, a volta para
  Extras na barra), a prateleira **Criar** em Extras, o "Nova pixel art" do topo e o N (`PixelGallery.ask`). A barra
  é a pasta da Wishlist (busca no nome, nas tags e na descrição; Filtrar com o Jeito de uma por vez e as Tags;
  Ordenar por Quando fez, Quando mudou, Nome e Tamanho, com o inverter; a vista, guardada em
  `meu-mural:pixel-arts:vista:v1`, `core/pixel-gallery-view.ts`). A **Mostra** (`ui/pixel-piece.ts`) usa o próprio
  widget (`app-pixel-art`) no jeito da obra, o Pixel num papel milimetrado com tachinha, na colagem da Wishlist
  (`collage` + `placeFor`, a altura pela proporção, com teto de 1,3 vez a largura); a placa da Miçanga fica
  opaca na parede escura. A **Grade** (`ui/pixel-tile.ts`) é o cartão branco com o xadrez e a miniatura comum
  (`ui/pixel-thumb.ts`, tirada da folha do widget, que passou a usá-la). A etiqueta (`ui/pixel-actions.ts`): Ateliê
  (o ateliê direto, por cima de tudo; ao fechar, o desenho vai para a obra com o Desfazer) e Baixar (`core/pixel-png.ts`,
  o PNG com o lado maior de pelo menos 512 px). A descrição na parede é a folha do caderno da Wishlist
  (`WishNote`, `WishTags` com o espaço `pixel`). A ficha (`ui/pixel-sheet.*`) usa o CSS da folha da Wishlist
  (`styleUrls: wish-adder.scss` + o seu), a faixa de grafite do ateliê, o `PixelField` (abre o ateliê sozinho na obra
  nova, e só existe com a ficha aberta: fechada, ele abria um ateliê invisível que travava a página), o Nome, as
  etiquetas Jeito (os quatro jeitos desenhados com o próprio desenho) e Tags, e a Descrição. O `/code-review mid`
  achou cinco, corrigidos: o desenho alto e fino ocupava telas inteiras (o teto, com `--widget-alto` em cqi do
  contêiner de fora, porque a propriedade é registrada), a pergunta de descartar comparava o nome de outro jeito,
  salvar uma obra apagada noutro aparelho sumia calado, um método sem uso, e a conversão dos valores do widget em
  desenho repetida (agora `artValues`/`valuesArt`).
- 16/nov, rodada 3 (no mesmo commit da 2, BUILD 898): o botão direito, o dedo segurado e o Shift+F10
  (`ContextMenuTrigger`, o `ContextMenu` do site): na obra, Editar e Abrir no ateliê; Baixar PNG, Copiar como
  widget (`pieceWidgetLine`, a linha `{{pixel}}` com o nome de legenda) e Duplicar (com o Desfazer); Apagar; no vão,
  Nova pixel art. O desenho estreito fica no meio do papel. O `/code-review mid` achou três, corrigidos: o menu aberto
  de uma obra apagada noutro aparelho virava o do vão (agora fecha), Duplicar perdia a pasta, e o "Abrir" com o
  desenho do Editar (agora "Editar").
- 16/nov, rodada 4 (BUILD 899): as pastas, como na Wishlist: `PixelFolders` na página (a aberta no endereço,
  `?pasta=`; o caminho `FolderPath` na barra; a busca "Procurar em {pasta}" pega ela e as de dentro; as pastas
  manilha `FolderCard` antes das obras, que agora aceita as obras espiando, `FolderCardInfo`, a miniatura no
  xadrez, sem mexer no `FolderInfo` das Anotações), o arrastar (`WallDrag` com as obras como peças: o miolo de 60%
  junta numa pasta nova), o menu da pasta e o do vão (Nova pixel art aqui, Nova pasta aqui), Mover para pasta… e
  Tirar da pasta no menu da obra, a folha `FolderMoveSheet`, a pergunta de desfazer em pixel arts (`PIXEL_UNITS`) e a
  Pasta na ficha (`FolderPicker`, com o Criar; a obra nova nasce na pasta aberta). O `/code-review mid` achou dois,
  corrigidos: mudar a pasta pela ficha tirava a obra da parede sem dizer para onde (o aviso diz, e o foco vai para o
  caminho) e a galeria sem obra nenhuma escondia as pastas.
- 16/nov, rodada 5 (BUILD 900): marcar várias. `NoteSelection` ficou genérica (`NoteSelection<T>`, com `copy` de quem
  usa: aqui o Ctrl+C leva as linhas dos widgets); o Marcar na barra, a tira (`SelectionTray`: Marcar todas, Copiar,
  Baixar um PNG de cada, Tags…, Apagar e, de tinta, Mover para pasta…), arrastar uma marcada leva todas
  (`WallDrag.marked`), o botão direito numa marcada age em todas. O tracejado e o adesivo da marcada viraram o mixin
  `ui/_marcada.scss` (o CSS dos Flashcards conferido idêntico com o sass comprimido). As Tags das marcadas são
  `ui/pixel-bulk-tags.ts`, a linha das Tags da folha de editar as marcadas das Anotações (os mesmos arquivos de
  estilo); `PixelGallery.updateMany` grava todas numa mudança com um Desfazer (e o `update` de uma passou a usá-lo).
  O `/code-review mid` achou três, corrigidos: as marcadas de pastas de dentro não iam para a pasta aberta, as tags
  das marcadas partiam do que elas tinham ao abrir a folha, e o menu numa marcada agia só nela.
- 16/nov, rodada 6 (BUILD 901): trazer das anotações. `pixelArtsInText` e `pixelArtsInNotes` (core/pixel-gallery.ts)
  acham os widgets `{{pixel}}` no texto das anotações e das resenhas (fora dos blocos de código; também dentro dos
  cartões), cada um com a anotação de onde vem e se o mesmo desenho já está na galeria. A folha `ui/pixel-import-sheet.ts`
  (a ficha de fichário das Anotações) lista todas, marcadas as que ainda não estão; as escolhidas viram obras na pasta
  aberta, com a legenda de nome e o Desfazer. A galeria vazia convida a trazer, a barra avisa quantas ainda não estão
  (com o Trazer), e o menu do vão também tem. Na folha do widget, "Guardar na galeria de pixel arts" guarda uma cópia
  (com o Ver). O `/code-review mid` achou quatro, corrigidos: o trazer escondido no menu do vão, o guardar repetido
  que duplicava, os filtros escondendo as que chegavam, e os widgets dentro dos cartões.
