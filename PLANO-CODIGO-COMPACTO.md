# O código mais baixo e o código na linha que copia (17/nov/2026)

Pedido do dono (cartão "Melhorar QOL de code-blocks"): o bloco de código ocupa muito espaço de altura (a linha
do cabeçalho, com a linguagem, e a linha da barra de rolar, cada uma uma linha inteira da pauta); e o código na
linha deveria copiar com um clique, mudando de cor com o mouse em cima para mostrar que dá.

Escolhido com ele numa rodada de desenhos: **1A** (a linguagem no canto da primeira linha de código; com o mouse,
o Copiar toma o lugar dela) e **2A** (a barra de rolar fina, por cima do pé da última linha, só com o mouse). O
Copiar continua o adesivo do kit (`kit.botao-papel`), como hoje: o do desenho estava fora do padrão.

Processo pedido: este plano antes; uma feature por vez, cada uma com `/code-review mid` antes da próxima;
Impeccable no começo e no fim; `/code-review high` no final.

---

## 1. Como é hoje

- **O papel** (`ui/_formatado.scss`, `codigo-papel`): a primeira linha é o cabeçalho impresso (a linguagem e, na
  leitura, o Copiar), as faixas verdes começam na segunda. Leitura: `ui/rich-text.ts` + `ui/rich-text-codigo.scss`
  (`.codigo-peca`, o `::before` com o papel, o `<pre>` que rola). Visual: `ui/visual-editor/codigos.ts`
  (`CodigoView`: o `<pre>` com o papel, o `<code>` que rola, a pílula da linguagem e o Copiar no cabeçalho do
  bloco do cursor) + `visual-editor.scss`, `controles.scss`, `cartoes.scss`.
- **A barra**: no Windows a barra de verdade ocupa ~10px, e `ui/bar-on-ruling.ts` soma ao bloco o que falta para
  ela fechar uma linha inteira da pauta (`--sobra-barra`, nos modos `dentro`, da leitura, e `pai`, do Visual). A
  tabela larga usa a mesma peça (`fora`).
- **O código na linha** (`.cod`, a fita tom sobre tom com as pontas em diagonal): só desenho, sem clique.
- **Onde aparece**: a leitura, o Visual, a prévia do Markdown, o Nota (widget), os Flashcards (verso), o quadro
  livre, a Wishlist, os comentários, o perfil, a folha de conflito, a amostra dos Ajustes. Na ficha do mural, sem
  o Copiar e sem rolar (`review-card.ts`). No PDF, a caixa cinza quieta, com a linguagem no canto (`pdf-sheet.scss`).

## 2. Decisões (minhas, ditas aqui)

- **D1. O papel começa no código.** Sem a linha do cabeçalho: a primeira linha do papel já é a primeira de
  código, com a faixa verde nela (as faixas continuam nas mesmas linhas de código de antes: a 1ª, a 3ª…). O furo e
  o picote seguem iguais. O bloco de N linhas ocupa N linhas da pauta (antes N + 1, e N + 2 com a barra).
- **D2. A linguagem no canto da primeira linha.** Impressa como hoje (Barlow 800 em caixa alta, a tinta verde do
  formulário ou a `eti` do tema), na ponta direita da primeira linha, sobre um esmaecido da cor da faixa (o
  código que passa por baixo some nele, como some na beirada). Com o mouse em cima do bloco (ou o foco no
  Copiar), ela some e o Copiar entra no mesmo canto. No toque, o Copiar fica sempre, só com o desenho (sem a
  palavra, 26px), e a linguagem ao lado dele.
- **D3. A primeira linha nunca fica presa embaixo do canto.** Quando a primeira linha chega embaixo do canto
  (medido de verdade, com a letra já carregada, a cada mudança de texto e de largura), quem rola ganha à direita a
  largura do canto: rolando até o fim, a ponta dela aparece antes da linguagem e do Copiar. A linha curta não paga
  nada (as outras linhas não passam a rolar antes). Uma peça só para a leitura e o Visual: `ui/code-paper.ts`.
- **D4. No Visual, o mesmo canto.** No bloco do cursor, a pílula da linguagem e o Copiar ficam juntos no canto
  direito da primeira linha (no lugar da linguagem impressa), e o canto reservado é o deles. O menu "Código" da
  régua continua com tudo (a linguagem, o tema, Copiar, Desfazer o bloco).
- **D5. A barra fina, por cima.** A barra de verdade sai do bloco de código (some em todo navegador), e no lugar
  dela uma barra desenhada: 4px, a tinta `--cod-rolo` de cada tema, no pé da última linha, da tira dos furos até
  a beirada. Aparece com o mouse em cima do bloco, com o foco dentro dele e enquanto rola (no toque e no
  touchpad); sem nada para rolar, não existe. O polegar se arrasta (cresce com o mouse, 6px), e o clique no
  trilho rola uma tela para aquele lado. A roda com Shift, o touchpad, as setas e o dedo rolam como sempre.
  `bar-on-ruling.ts` fica só para a tabela (sai o modo `pai`).
- **D6. O código na linha copia.** Fora da escrita (a leitura e todo lugar que desenha o texto pronto), a fita
  vira um botão: cursor de mão, e com o mouse em cima a fita fica num tom a mais da própria letra (a mesma conta
  da fita, sem cor escrita, também na folha pautada); o clique (ou Enter/Espaço com o foco) copia só as letras e
  o bilhete de sempre diz "Código copiado" (`Toasts.copy`; sem deixar, "O navegador não deixou copiar"). Selecionar
  um pedaço com o mouse continua selecionando (o arrasto não copia). Na ficha do mural, nada muda: o clique abre a
  anotação, como o Copiar do bloco, que lá não existe. No verso do flashcard, o toque na fita copia e não vira a
  carta (como o bloco).
- **D7. O PDF não muda.** A caixa quieta continua com a linguagem no canto de cima, sem a barra e sem botão. O
  papel e a fita da tela não chegam lá (a regra do PDF confere as amostras).

## 3. Compartilhado e sincronização

Nada aqui grava: são o desenho e o copiar, só leitura. As anotações compartilhadas, os grupos e o Kanban não
mudam; duas pessoas lendo o mesmo bloco veem cada uma o seu (o tema de cada leitor continua o dele).

## 4. As features, uma por vez

1. **A linguagem no canto** (D1–D4, D7): o papel sem o cabeçalho, nas três vestes (leitura, Visual, card no
   Visual), a linguagem e o Copiar no canto, o canto reservado (`code-paper.ts`), o toque. Testes: a altura de N
   linhas, o canto, a reserva com a primeira linha comprida e não com a curta, o Visual, o PDF.
2. **A barra fina** (D5): a barra desenhada em `code-paper.ts`, a de verdade escondida, arrastar, clicar no
   trilho, aparecer e sumir; `bar-on-ruling.ts` sem o `pai`. Testes: o polegar do tamanho e no lugar, o arrasto,
   o clique, sem rolar não existe, a tabela como antes.
3. **O código na linha copia** (D6): o botão na leitura, o tom a mais, o bilhete, o teclado, a ficha que abre, o
   flashcard que não vira. Testes de cada um.

Cada uma: os testes, a suíte, os de regra, `npx ng build`, fotos 2x no computador e no celular, o PDF, BUILD,
Novidades, `/code-review mid`, commit e push. No fim, a crítica do Impeccable, o `/code-review high` e o DESIGN.md.
