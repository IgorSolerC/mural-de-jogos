# Plano: o canvas em ponto pequeno (a miniatura no mural e o editor de longe)

Pedido do dono em 26/nov/2026. A miniatura do canvas no mural é simplista demais (retângulos retos de uma cor); o
editor do canvas, com pouco zoom, deixa tudo branco e bege. O dono quer ver **o que tem dentro de um canvas**: as
cores das notas coladas e dos widgets, as cores dos textos, alguns textos pequenos, cantos mais arredondados, um
desenho simples na hora trocado depois por um **assado** mais rico (o forno das fichas), e o editor de longe com as
cores de verdade. "Nem muito polido, nem simplista como está."

Leia antes o `CLAUDE.md` da raiz (botões de hover, visita com as mesmas peças, sair da conta apaga tudo).

## 1. O que existe hoje (e o que as fotos mostraram)

Fotos em `.angular/canvas-mini/antes` (roteiro `fotos.mjs`, quadro de exemplo em `semente.mjs`).

| Onde | Peça | Como desenha hoje |
| --- | --- | --- |
| Miniatura no mural | `ui/free-board/board-sketch.ts` (SVG dos dados, dentro de `ui/canvas-card.ts`) | molduras em feltro com pesponto; toda outra peça um retângulo reto de uma cor (`farColor`); setas retas de meio a meio, **por cima** das peças; nenhum texto |
| Editor, nível longe (< 18 px na tela) | `ui/free-board/far-layer.ts` (`drawFar`, canvas 2D) | retângulos retos de `farColor`; a nota colada é sempre o branco `INDEX_CARD`, todo widget o bege `WIDGET`; as fitas das molduras em tamanho de tela |
| Editor, nível meio (18–72 px) | `ui/free-board/free-board-piece.ts` (`.tira`, `.leve`, `.cartao.liso`) | a nota colada vira a tira **branca** com o título; contador, tabela e pixel art viram o bloco **bege** com ícone e nome; o texto é a faixa do jeito |

A crítica do Impeccable (seção 7) deu 13/28: a ficha é amarela de perto e branca no meio e de longe; três desenhos
decidem a peça cada um do seu jeito; nenhum texto onde importa (o nome das molduras some do card); os títulos de 3 px
do nível meio são ruído.

## 2. A ideia: uma aparência de longe só, três desenhos que a usam

**D1. Uma função só diz como cada peça é em ponto pequeno** (`ui/free-board/far-look.ts`, pura): o papel, a faixa de
cima, a tinta, o título, o raio do canto, e o que a peça tem de próprio (os pontos da pixel art, a foto, as linhas da
tabela). Os três desenhos (a miniatura SVG, o canvas da camada de longe e o nível meio no DOM) leem dela: a ficha
amarela é amarela em todo zoom e no card.

**D2. As cores vêm do CSS, não de tabelas copiadas.** `styles.scss` é a verdade (`--stock-*`, `--stock-*-escuro`,
os `[data-jeito]` com `--c-papel`/`--c-tinta`). Uma sonda lê as variáveis uma vez por página e guarda
(`far-palette.ts`); as tabelas `STOCK_HEX`, `FELT_HEX` e `CALLOUT_HEX` de `far-layer.ts` passam a sair dela. As
cores de cada widget de mesmo papel (o calendário vermelho do contador, o neon, o placar, o bloquinho amarelo; o
cabeçalho escuro da tabela) ficam numa tabela pequena ao lado de quem desenha o widget, com o seletor que mostra de
onde vieram.

**D3. O que cada peça mostra em ponto pequeno:**

| Peça | Papel | Faixa / detalhe | Texto (quando cabe) |
| --- | --- | --- | --- |
| Moldura | o feltro escuro da cor, pesponto da cartolina | a fita Dymo da cor no canto de cima | o nome da moldura |
| Texto (card) | a folha clara do jeito (`cartao-miolo`: 22% do papel no creme) | a faixa do jeito em cima (~22% da altura, nunca menos de 2 px na tela), na cor do papel | o título (primeira linha), na tinta do jeito |
| Nota colada | a cartolina da ficha (achada pelo id, `CardFinder`) | a orelhinha kraft da pasta, se a ficha tiver grupo | o nome da ficha achada (**nunca** o título escrito na linha: na visita a privada não aparece) |
| Imagem | a foto (a miniatura de 256 px) com a borda branca de polaroide | sem a foto: cinza escuro com a borda | — |
| Pixel art | os próprios pontos | — | — |
| Contador | o jeito dele: calendário (folha branca, faixa vermelha), neon (azul-noite, aro ciano), placar (preto, letra amarela), riscado (bloquinho amarelo) | — | o título |
| Tabela | a folha do jeito (branca, recibo; a Caneta é giz na parede) | o cabeçalho escuro e as listras | — |
| Vídeo, áudio | escuro (`#2b2a28`) com o ícone claro | — | o título |
| Seta | o giz da cor, a mesma curva do quadro (`routedEdgePath`), com a ponta em "v" | **por baixo** das peças | o rótulo, não (é miúdo demais) |

**D4. Texto em px de tela, nunca de mundo.** Um título só aparece com letra de pelo menos 7 px e na peça com pelo
menos ~44 px de largura na tela (letra de 7 a 9 px), numa linha com reticências; entre ~24 e 44 px, uma barrinha da cor da
tinta fazem as vezes de texto; abaixo disso, só a cor. O nome da moldura aparece a partir de ~50 px de moldura. Na
Visão geral (eucatex de 77 px), só as cores e o nome das molduras grandes.

**D5. Cantos em px de tela:** ~2 px nas peças, ~4 px nas molduras (mais que isso vira bolha e foge do papel).

## 3. Rodadas (uma por vez, cada uma com /code-review medium antes da próxima)

### Rodada 1: a miniatura desenhada na hora (o pedido 1)

- `ui/free-board/far-palette.ts`: a sonda das cores (D2), com teste que compara com `styles.scss`.
- `ui/free-board/far-look.ts`: `farLook(node, info, cards)` (D3), puro, com teste por tipo de peça.
- `board-sketch.ts` refeito: setas primeiro (a curva, por baixo), molduras com a fita e o nome, peças com o
  papel, a faixa, o canto e o título (D4), a pixel art pelos caminhos de `inkPaths` (o mesmo de quem desenha o
  widget; teto de pontos, acima dele a cor média), a foto como o cinza com a borda branca (a foto de verdade vem
  no assado). A escala na tela vem de um `ResizeObserver` (o tamanho do eucatex), para o texto saber se cabe.
- `CanvasCard` passa a achar as fichas coladas pelo `CardFinder` (o mesmo do widget Nota, que a visita já usa).
- O leitor de tela: o nome do botão do canvas ganha as molduras ("3 regiões: Lisboa, Porto, Antes de ir"), no
  lugar onde já diz as peças.

### Rodada 2: a miniatura assada (o pedido 2)

- **Por que não o `<foreignObject>` do forno:** assar o DOM de verdade pediria montar centenas de widgets fora da
  tela por card, e o SVG-imagem perde o `<canvas>` (a pixel art, o ateliê) e as fotos em `blob:`. O que se
  reaproveita do forno é o resto: o banco `meu-mural:forno` (já sai no logout, teto de 80 MB com as menos usadas
  saindo primeiro), a fila que assa uma por vez fora do caminho da rolagem, e a revelação (o assado entra por cima
  num esmaecer curto, nenhum com o movimento reduzido).
- `ui/free-board/board-paint.ts`: o pintor em canvas 2D, a partir do mesmo `farLook`. Mais que o SVG: as fotos de
  verdade (do `ImageStore`, como a camada de longe), o grão do feltro e o pó do giz (o padrão que a camada de
  longe já tem), duas linhas do corpo do card de texto, o "23 dias" do contador, o cabeçalho da tabela; as letras
  de verdade (espera `document.fonts.load` de Kalam e Barlow Condensed).
- A chave do assado: a versão do pintor, o id e o `em` do quadro, uma assinatura do que ele leu de fora (a cor e o
  nome de cada ficha colada, quais fotos estavam no aparelho, o dia, se há contador), o tamanho e a densidade da
  tela. Outra pessoa mexeu no quadro compartilhado: o `em` muda, assa de novo. Nada vai para a nuvem.
- `CanvasCard`: o SVG na hora; o assado do banco (se já houver) ou assado no ocioso, por cima.

### Rodada 3: o editor de longe com as cores de verdade (o pedido 3)

- `far-layer.ts`: cada peça de longe desenhada pelo `board-paint` (o papel, a faixa, o canto, os pontos, a foto),
  ainda agrupando por cor no que for chapado, e sem texto (de longe ele não cabe).
- `free-board-piece`: o nível meio pela mesma aparência: a nota colada na cartolina dela com a orelhinha, o
  contador, a tabela e o vídeo no jeito deles, a pixel art com os pontos (uma imagem `pixelated`), o card de texto
  com a faixa e a folha clara; o título em px de tela (D4), sem as letras de 3 px.

### Fechamento

Crítica final do Impeccable, /code-review high, DESIGN.md (seções "Canvas na parede" e "Quadro livre"), as fotos de
perto no computador e no celular, a build de produção.

## 4. Compartilhados e várias pessoas

Tudo aqui **só lê**: nenhuma rodada muda o quadro, a anotação ou o que sincroniza. O quadro compartilhado mexido por
outra pessoa chega pela sincronização de sempre com outro `em`, e a miniatura assada é refeita. A visita monta a
mesma `CanvasCard` (regra 1 da visita); as fichas coladas vêm do `CardFinder`, que na visita só conhece as públicas:
a privada fica sem nome (o papel rasgado do widget), nunca com o título que está escrito na linha.

## 5. O que guarda no navegador

Só o assado, no banco do forno (`meu-mural:forno`, já em `wipeBrowser`); o teste em `browser-reset.spec.ts` ganha a
chave da miniatura. Nenhuma chave nova de localStorage.

## 6. Riscos

- **Desempenho no mural:** o SVG fica com mais nós (faixa e título por peça); o teto de peças desenhadas continua, e
  o assado, quando entra, troca tudo por uma imagem só.
- **Aparência congelada:** nada do papel das fichas muda; o editor de longe e a miniatura mudam por pedido.
- **Fontes:** o canvas desenha com a letra que já carregou; o assado espera as fontes.

## 7. A crítica do começo

Ver `.impeccable/critique/2026-11-26T11-33-49Z__src-app-ui-canvas-card-ts.md` (13/28). Rodada 1 feita: BUILD 1081. Rodada 2 feita: BUILD 1082 (o assado pinta o mesmo modelo do SVG, no modo rico, em `sketch-paint.ts`). Rodada 3 feita: BUILD 1083 (as peças do meio e a camada de longe pelos mesmos itens). Crítica final: `.impeccable/critique/2026-11-26T12-28-40Z__src-app-ui-canvas-card-ts.md` (20/28). A fita das molduras de longe foi feita a pedido do dono (BUILD 1084: as grandes primeiro, encolhe antes de cortar, uma letra só, sem cobrir moldura, fita nem peça; o canvas de longe com o dobro de pixels). Fica para o dono: o nome da nota colada em duas linhas quando há espaço.
