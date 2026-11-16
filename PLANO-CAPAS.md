# Plano: capas sem link (imagem do aparelho e pixel art)

Pedido do dono (16/nov/2026): "Atualmente só é possível utilizar imagens em LINK como capa das análises de filme,
anime, música, jogos, etc, e também anotações. Quero que seja possível colar uma imagem diretamente, ou selecionar
do PC, para que uma imagem nova seja salva. Quero também a opção de poder utilizar uma pixel art como capa,
selecionada diretamente da sua galeria pessoal de pixel-arts do murall, ou ser feita diretamente do menu de
seleção." Estética, uso intuitivo, reaproveitar o que existe. Impeccable no começo e no fim; uma feature por vez
com `/code-review mid`; no fim, `/code-review high`. As decisões abaixo são minhas (o dono não quer rodada de
escolha); as que ele poderia querer de outro jeito estão marcadas como **suposição**.

---

## 1. O brief (Impeccable, shape)

- **Quem e quando.** O dono, no computador e no celular, escolhendo a capa de uma ficha (no editor das análises e
  das anotações, na parte Capa) ou de um recorte da Wishlist. Modo **Operate**: escolher e voltar a escrever.
- **O que precisa dar certo.** A capa que não está em catálogo nenhum entra sem passar por um site de imagens:
  Ctrl+V com a foto copiada, soltar o arquivo em cima das capas, ou Escolher do aparelho (no celular, a galeria e a
  câmera). E a pixel art feita no ateliê vira capa em dois toques, da galeria ou desenhada ali mesmo. Prova: copiar
  um print, abrir Capa, Ctrl+V, Pronto.
- **O que só daqui pode dizer.** A pixel art de capa sai **impressa no papel milimetrado**, o jeito Pixel da galeria
  (o mesmo papel creme com o quadriculado verde da Mostra e do vazio da galeria): a capa parece uma folha de caderno
  de desenho colada na ficha, e não um desenho minúsculo esticado e borrado.
- **A direção (no mundo do Murall, sem mundo novo).** Nada de peça nova onde já existe uma:
  - O seletor continua o `CoverPicker` (as fotos soltas na mesa, a escolhida levantada). As capas novas entram
    no monte como qualquer outra, na frente e já escolhidas, com o crédito miúdo embaixo: **Do aparelho** ou
    **Pixel art** (como "Link", "Wikipedia").
  - A fileira de ações de caneta embaixo das fotos ganha, ao lado de "Colar link de imagem": **Do aparelho** (o
    ícone de enviar da folha do widget de imagem) e **Pixel art** (o ícone da pixel art). O "Do aparelho" diz no
    título que colar e soltar também servem; colar (Ctrl+V) funciona com o foco em qualquer lugar do seletor, e
    soltar um arquivo em cima das capas acende o monte com o tracejado de "pode soltar".
  - **Pixel art** abre a folha da galeria (refeito a pedido do dono, ver o andamento): o modal do "Escolher a
    nota", com a busca, os filtros (as pastas da galeria, o Jeito, as Mexidas, as tags) e a ordem, as obras em grade,
    e o **Desenhar uma nova** no pé. A mesma folha serve ao widget de pixel art das anotações.
  - **Desenhar uma nova** abre o ateliê (`ui/pixel-studio`) por cima, já com a tela em branco. Ao fechar com pelo
    menos um ponto, o desenho vai para a galeria com o nome do item (e a pasta da raiz) e vira a capa; sem ponto,
    nada acontece. **Suposição:** guardar na galeria (e não só na capa), para a obra poder ser reaproveitada.
- **Fora do escopo, de propósito.** Recortar ou girar a imagem; a capa que acompanha a obra (mudar a obra depois
  não muda a capa: a capa é uma cópia impressa, como o PNG baixado, **suposição**); a capa da visita alheia;
  mandar capa pela API das AIs.
- **Faixas.** Imagem: o que o armazém já aceita (até 40 MB de origem, encolhida para 900 px e 200 KB, WebP/JPEG).
  Pixel art: 1×1 a 64×64; a galeria de 0 a 500 obras.
- **Estados.** Guardando a imagem ("Guardando a imagem…", o mesmo da folha do widget); erro de imagem (a frase do
  `ImageProblem`, na caneta vermelha da margem do seletor); a capa guardada que ainda não chegou a este aparelho
  (a ficha mostra "sem capa" e, no seletor, a foto hachurada "não abriu", como um link quebrado); galeria vazia
  (a tira só com Desenhar uma nova e uma frase); busca sem nada.

## 2. Os dados

- A capa guardada é o mesmo endereço das imagens coladas: `coverUrl: 'murall://imagem/ID'`
  (`core/images.ts`). `sanitizeGame` (`core/review.ts`) passa a aceitar esse endereço além do https.
- Nada muda na nuvem: o mural vai inteiro como texto, então `localImageIds` já acha a capa nas `usadas` e, no mural
  público, nas `publicas`; a compartilhada já anota as imagens do JSON inteiro (`nota_imagens`). A capa de uma
  anotação compartilhada abre para quem está no grupo; a da ficha pública, para quem visita.
- A pixel art de capa é um PNG sem perda (o canvas sem suavizar): 720 × 900 (o 4:5 da capa), o papel milimetrado e
  o desenho no meio num quadrado de 560 px (cada ponto um número inteiro de pixels), fora do corte do 1:1 do mural
  de músicas e do 3:4 do seletor. `ImageStore.addPng` guarda sem encolher (o PNG já cabe: confere 900 px e 200 KB).
  O `tipo` PNG é o que diz "Pixel art" no crédito (a foto do aparelho sempre vira WebP ou JPEG).
- Ajustes › Imagens: "onde cada uma é usada" passa a contar a capa (apagar a imagem diz que a ficha fica sem capa).

## 3. Mostrar a capa guardada (uma peça só)

Hoje o caminho "procura no aparelho, senão desce da nuvem com a sessão, senão (sem conta) o endereço público"
está escrito duas vezes (`ui/glued-media.ts` e `ui/study-card.ts`). Ele vira uma peça só, `ui/stored-image.ts`:
`storedImageSrc(url)` (o endereço que vai no `<img>`) e a diretiva `img[muralSrc]`, que troca o `[src]` em todo
lugar que desenha capa: `cover-sleeve`, `record-cover`, `wish-cover`, `wish-clip`, `mini-polaroid`, `folder-card`,
`pdf-sheet` (a capa do PDF espera, com `data-esperando`), a fotinho da etiqueta Capa no editor e na Wishlist, e o
próprio `cover-picker`. A guardada que não chega dispara o `error` do `<img>`, então cada peça cai no "sem capa"
que já tem. O glued-media e a carta dos Flashcards passam a usar a mesma função.

## 4. Rodadas (um commit cada, com BUILD e Novidades; `/code-review mid` antes da próxima)

1. **Imagem do aparelho.** `stored-image.ts` (e o glued-media e a carta usando), a diretiva nos lugares da seção 3,
   o `sanitizeGame`, no seletor: Do aparelho, colar, soltar, o crédito, os estados; Ajustes › Imagens contando a
   capa. Testes: sanitize, o seletor (escolher, colar, soltar, erro), a diretiva (local, link, ausente).
2. **Pixel art da galeria.** `core/pixel-cover.ts` (o PNG no papel milimetrado), `ImageStore.addPng`, a tira da
   galeria no seletor (busca, todas, vazia), o crédito "Pixel art". Testes: o PNG (tamanho, sem borrar, cabe), a
   tira (busca, escolher vira capa).
3. **Desenhar uma nova.** O ateliê por cima a partir da tira; ao fechar com ponto, a obra na galeria (nome do item)
   e a capa. Testes: fechar sem ponto não faz nada; com ponto, a obra e a capa.
4. **Fim.** A crítica do Impeccable, o `/code-review high` e as correções; DESIGN.md (a seção da escolha da capa).

## 5. Andamento

- 16/nov/2026: plano escrito.
- 16/nov/2026, rodada 1 (imagem do aparelho), BUILD 903: `ui/stored-image.ts` (`storedImageSrc` e `img[muralSrc]`;
  o glued-media e a carta dos Flashcards passaram a usar), a diretiva em todo lugar que desenha capa, o
  `sanitizeGame` aceitando `murall://imagem/ID`, no seletor o Escolher do aparelho, o Ctrl+V fora dos campos de
  texto, soltar em cima das capas (o monte tracejado), o "guardando" no lugar da foto, o crédito "Do aparelho", e
  Ajustes › Imagens contando a capa. O `/code-review mid` achou seis: corrigidos o colar seguido (vale a última) e
  o tracejado que ficava aceso; ficou como está a capa guardada que não chegou ficar "sem capa" até recarregar
  (precisa estar fora do aparelho e da nuvem, como o link quebrado).
- 16/nov/2026, rodada 2 (pixel art da galeria), BUILD 904: `core/pixel-cover.ts` (o PNG 720 × 900 no papel
  milimetrado, a linha grossa na borda do ponto quando ele é dividido, a metade se passar de 200 KB),
  `ImageStore.addPng`, a tira Suas pixel arts no seletor (a busca de `pieceMatches`, a ordem de `sortPieces`), o
  crédito "Pixel art" também ao abrir de novo (o PNG guardado). O `/code-review mid` achou três: o
  `aria-haspopup` de uma tira que não é menu e um comentário, corrigidos; a galeria vazia sem saída fica para a
  rodada 3 (Desenhar uma nova).
- 16/nov/2026, rodada 3 refeita (a folha da galeria), BUILD 905: o dono pediu, no meio da rodada 3, a galeria como
  um modal "semelhante ao modal de seleção de anotações", com filtros, e o Desenhar uma nova dentro dele; e o mesmo
  modal no widget de pixel art das anotações, para anexar uma obra da galeria. Depois, em grade ("pixelarts são 99%
  arte"). A tira solta saiu. `PickerFilters` passou a ler `PickerFacets` (o `CardFilters` cumpre sem mudar nada no
  "Escolher a nota"); `ui/pixel-filters.ts` (as pastas, o Jeito, as Mexidas, as tags, a ordem) e `ui/pixel-picker.ts`
  (a folha, em grade). Na capa, o Pixel art abre a folha; o Desenhar uma nova abre o ateliê, e o desenho vai para a
  galeria com o nome da ficha e vira a capa. No widget, o novo abre a folha quando a galeria tem obras, e o Escolher
  da galeria fica ao lado do Guardar na galeria; o Desenhar uma nova abre o ateliê do próprio widget. O
  `/code-review mid` achou dois, corrigidos: a legenda velha ao trocar de obra e a tabela das Mexidas repetida.
- 16/nov/2026, rodada 4 (o fim), BUILD 906: a crítica do Impeccable (duas avaliações isoladas, 29/40; o detector não
  achou nada nos arquivos novos, e o injetor no navegador ficou de fora pela CSP do site) e as correções dela: a capa
  de pixel art lembra a obra (`StoredImage.pixel`, só no aparelho), a folha a marca ao reabrir e a capa diz o nome
  dela no leitor de tela; trocar no widget um desenho feito à mão tem o Desfazer; no celular a folha abre sem o
  teclado por cima da grade; o foco tracejado; a galeria cheia dita em palavras; a busca mais curta. Ficaram como
  estão: "Toque numa…" no pé (o mesmo do "Escolher a nota", que some no celular) e o nome "Pixel art" do botão. O
  `/code-review high` achou cinco: o colar dentro de outra folha virava a capa de baixo, o `galleryMatch` refazia a
  galeria a cada letra, as capas de link ouviam o armazém de imagens à toa e faltava o teste da visita, corrigidos; o
  crédito "Pixel art" pelo PNG continua (é o único PNG guardado). As rodadas terminaram.
