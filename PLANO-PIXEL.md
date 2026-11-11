# Widget Pixel art

Pedido do dono em 10/nov/2026: um widget novo nas anotações para fazer pixel art. Até 10 cores, cada
uma um número de 0 a 9, o 0 sempre transparente. O desenho mora no texto (markdown), sem arquivo, e
tem uma folha para criar e mexer. Poucas letras no markdown, sem poluir; usabilidade em primeiro lugar.

## 1. A marca no texto

Uma linha só, como todo widget (`core/widgets.ts`). Assim o desenho ganha de graça tudo o que os
widgets já têm: o modo Visual (peça, `−`/`+` do tamanho, jeito a cada toque), o Quadro livre, o PDF, a
cópia, a busca, a ficha do mural, dentro de lista e de card.

```
{{pixel: 8x8 | 0110011/11111111/11111111/0111111/001111/00011 | pastel | Coração}}
```

- **A grade**, `LxA` (de 1 a 32 cada lado; `×` também vale). Sempre escrita: diz o tamanho de verdade
  mesmo quando as pontas são transparentes.
- **Os pontos**, as fileiras de cima para baixo separadas por `/`, um algarismo por ponto. Para gastar
  pouco texto: os `0` do fim de cada fileira não se escrevem, e as fileiras vazias do fim também não
  (a do meio fica vazia: `//`). Uma fileira mais curta que a grade completa com transparente; o que
  passa da grade não aparece (e não se perde enquanto a folha está aberta).
- **A paleta**, uma palavra: `classica` (a de sempre, não se escreve), `pastel`, `terra`, `mar`, `neon`,
  `cinzas`. Em todas, o 1 é a tinta escura (o contorno), o 2 o claro; do 3 ao 9, as cores.
- **Cores trocadas**, só as que mudaram: `3#e43b44 7#3355aa` (o número e a cor, separados por espaço).
- **O jeito**: `pixel` (o de sempre, não se escreve), `figurinha`, `ponto-cruz`, `micanga`.
- **A legenda**, o primeiro texto que não é nada disso (escreve-se direto na peça no Visual).
- **O tamanho**, o de todo widget (`mini`, `pequeno`, `grande`).

Os parâmetros valem em qualquer ordem quando escritos à mão; a folha escreve sempre na ordem acima.
Uma legenda que é a palavra de uma paleta ou de um jeito ("Pastel") faz a paleta e o jeito irem
escritos antes dela (a primeira palavra de cada um é ele), como na legenda da imagem.

Um 16×16 cheio é ~270 letras numa linha; com os zeros do fim cortados, um desenho comum fica bem
abaixo disso. Pedido do dono em 11/nov: encurtar mais. Cinco ou mais pontos iguais seguidos vão
abreviados: o algarismo, `*` e a quantidade sempre com dois algarismos (`0*12` são doze 0, `4*05`
cinco 4). Os dois algarismos fixos acabam com a dúvida (`0*051` são cinco 0 e um 1); com um só, no fim
da fileira, também vale à mão. A linha de antes, sem abreviação, continua valendo.

## 2. O desenho (`ui/pixel-art.ts`)

Um SVG com um `path` por cor (até 9 elementos, qualquer que seja a grade), da altura do tamanho do
widget (`--widget-alto`) e da largura da proporção da grade; mais largo que a linha, encolhe. O
transparente mostra a cartolina. Quatro jeitos, todos da papelaria:

- **Pixel**: os quadradinhos rentes, sem sombra (`crispEdges`).
- **Figurinha**: o desenho recortado com a borda branca seguindo o contorno (filtro `feMorphology`),
  a sombra rente de colado e um giro pequeno tirado do próprio desenho.
- **Ponto-cruz**: um retalho de étamine (o pano de bordar, com os furinhos) e cada ponto um X de linha.
- **Miçanga**: a placa de pinos clara e cada ponto uma conta redonda com o furo no meio.

Legenda em Kalam embaixo. O broche de ampliar (`ZoomKnob` + `pieceLift`) sobe o desenho para o meio da
tela, nítido em qualquer zoom. Para quem não vê: `role="img"` com a legenda (ou "Pixel art 16 × 16").
Grade sem pontos: o contorno tracejado dizendo como escrever, como o contador sem data.

## 3. A folha de desenhar (`ui/pixel-canvas.ts`, campo `pixels` da folha do widget)

A folha do widget de sempre (`ui/widget-sheet.ts`): o palco mostra a peça de verdade; em "O que ele
mostra" entra a prancheta; em "Aparência", os quatro jeitos em miniatura, a paleta e o tamanho.

- **Prancheta**: a grade com o xadrez do transparente e os fios a cada ponto (mais fortes a cada 8).
  Pintar arrastando (sem pular pontos num arrasto rápido); o botão direito apaga; o Shift desenha uma
  reta desde o último ponto.
- **Ferramentas**, uma régua só, etiquetas do site: Lápis (B), Borracha (E), Balde (G), Conta-gotas
  (I); Espelho (M, o lado de lá pinta junto); Desfazer e Refazer (Ctrl+Z, Ctrl+Y). Mais (um menu):
  virar de lado, virar de cabeça para baixo, empurrar o desenho um ponto, limpar tudo.
- **As cores**: dez pastilhas com o número delas (o 0 em xadrez riscado), a escolhida erguida. Os
  números 0–9 do teclado escolhem. Um segundo toque na escolhida (ou o lápis dela) abre o seletor de cor
  do aparelho; a trocada ganha um "voltar à da paleta".
- **Grade**: Largura e Altura (1–32) ao lado da paleta; mudar não apaga o que ficou de fora enquanto a
  folha está aberta.
- **Teclado**: a prancheta é um lugar só no Tab; as setas andam um cursor, Espaço/Enter pinta, e quem
  usa leitor de tela ouve "Linha 3, coluna 5: vermelho".
- **Trazer de uma imagem** (F4): uma foto do aparelho vira pontos na grade e na paleta de agora (a
  cor mais perto de cada ponto; o quase transparente vira 0).

Sem desenho, "Falta desenhar" no pé (a regra de sempre da folha).

## 4. Features, uma por vez (cada uma passa por `/code-review mid` antes da próxima)

1. **O formato e o desenho**: `core/pixel-art.ts` (ler, escrever, paletas, jeitos), o registro em
   `core/widgets.ts`, `ui/pixel-art.ts` com os quatro jeitos e o broche, o `@case` em `note-widget.ts`,
   o ícone, a amostra do PDF (e com ela a REGRA DO VISUAL), a linha do guia de marcas. Testes.
2. **A folha de desenhar**: `ui/pixel-canvas.ts` como campo da folha, as miniaturas dos jeitos, o texto
   do palco vazio. Testes da prancheta (pintar, balde, espelho, desfazer, teclado, a marca escrita).
3. **Trazer de uma imagem** (F4 da seção 3).
4. **Pelo resto do Murall**: o Widget do Quadro livre (menu, ícone, tamanho da peça nova), o guia da
   API/MCP (`contrato/api-v1/guia.ts`), DESIGN.md.

Commits: as features 1 e 2 vão juntas (a 1 sozinha poria no Inserir um widget sem folha); depois um
commit por feature. Cada um com BUILD + 1, a entrada das Novidades, `npx ng build`, os testes e o PDF
conferido. No fim, a crítica do Impeccable e o `/code-review high`.
