# Plano: o estojo das cartolinas arrumado (25/nov/2026)

Pedido do dono (cartão "Organizar customização de cartolinas"): arrumar o estojo da ficha
(`ui/card-kit.ts`), o que se escolhe nele e como cada coisa é desenhada. Ele preza a estética, o uso
fácil e o reaproveitamento do que já existe. Vai por partes, uma por vez, cada uma com o seu commit e o
`/code-review medium` antes da próxima; no fim, a crítica do Impeccable e o `/code-review high`.

## O que já existe e vale para tudo

- O visual da ficha mora nos campos de `Review` listados em `LOOK_FIELDS` (`core/card-look.ts`). O
  "Card padrão" das colunas do Kanban (compartilhados também) guarda e veste o mesmo visual por ele: um
  campo novo entra em `LOOK_FIELDS` e passa pelo `sanitizeReview` como os outros.
- As anotações e os Kanbans compartilhados passam pelo mesmo `sanitizeReview`. Um campo novo some para
  quem ainda está numa build velha; a trava do site velho (`core/newer-build.ts`) recarrega quem vê uma
  build mais nova. Por isso **nada aqui muda o significado de um valor que já está guardado**: o que
  existe continua lido igual, e o que é novo vai em campo novo, sem migrar dados.
- O que é desenhado por sorteio está congelado (`core/frozen-looks.ts`): só muda o que o dono pediu, e
  as digitais desse desenho são regravadas com `node scripts/freeze-looks.mjs <prefixo>`.
- O forno das fichas (`ui/forno.ts`) compara a assinatura do que é desenhado: desenho novo assa de novo.

## As partes, na ordem

### 1. Os papéis marcados pelo tempo, fixos

- **Desbotada no sol**: um degradê só, igual em toda ficha, com a cor mais viva em cima e a mais
  desbotada embaixo. Sem o "quadrado" (a outra ficha, a moldura ou o bilhete que cobriam um pedaço) e
  sem sortear de novo a cada clique.
- **Carregou pela metade**, repensado: uma cartolina cinza comum com a metade de cima pintada na cor da
  cartolina, a pincel (a beirada da tinta irregular, as cerdas falhando no fim da pincelada, uma ou outra
  marca de pincel a mais no cinza). Fixa, igual em toda ficha. É o desenho que, no futuro, pode aparecer
  enquanto o forno assa, para a cartolina crua não pular de uma vez para a assada.
- O `paperSeed` deixa de valer: o estojo não sorteia mais esses dois, e o desenho não lê o sorteio
  (o campo guardado é ignorado; as fichas antigas passam a ter o desenho novo, como o dono pediu).

### 2. Sem a Aquarela

- Sai da lista dos papéis. O que estava guardado como `aquarela` é lido como `canson` (no
  `sanitizePaper`), nas fichas, nos cards padrão do Kanban, nos backups e no que vem da nuvem.

### 3. A terceira fileira de cores: as pastéis

- Sete pastéis (os mesmos matizes, dessaturados e claros, com tinta escura) e, no lugar do branco e do
  preto, o **bege** e o **marrom** (kraft). A fileira entra embaixo das escuras, nas mesmas nove colunas.
- Valem onde a cor da ficha vale (`STOCKS`: a ficha, a edição em lote, as anotações compartilhadas);
  ficam fora das paletas que só usam as claras (Kanban, Calendário, Quadro livre) e do sorteio de cor
  dos Gastos. Cada uma ganha a tachinha da parede, a cor do card no texto e o nome.

### 4. A tinta da estampa e do rabisco

- Hoje a tinta é preta na cartolina clara e branca na escura. Continua o padrão (**Automática**), e
  cada um ganha a escolha **Preta** ou **Branca**, ao lado da Opacidade (`patternTone`,
  `scribbleTone`; sem o campo, a automática).

### 5. Estampas novas de papelaria

- Seis, da mesma família da pauta e do quadriculado (linhas, faixas e pontos, que mudam a textura do
  papel): **Caligrafia** (a pauta de três linhas com a do meio tracejada), **Listrado** (faixas
  inclinadas), **Xadrez escocês** (faixas de larguras diferentes que se cruzam, com os fios finos),
  **Zigue-zague**, **Bolinhas** (as de poá, maiores e desencontradas) e **Losangos** (o argyle, com os
  fios tracejados). Mesmos ajustes (Espaço, Tamanho, Alinhamento, Opacidade) e o mesmo jeito de ladrilho
  das que existem (`core/pattern-grids.ts`).

### 6. As decorações por assunto

- O mesmo jeito das estampas: a régua de assuntos grudada no alto (Todas e cada assunto), os blocos com
  o título, o pontinho no assunto do que está na ficha. Os assuntos: Brilho e festa, Adesivos,
  Papelaria, Prender e furar, Natureza, TV e computador. A régua e os blocos viram uma peça só do
  estojo, usada pelas duas abas (sem copiar o modelo).

### 7. Os estragos em dois, e um de cada

- A aba Estrago mostra dois blocos: **Destrutivos** (o que rasga, fura, queima, corta: rasgos, furos,
  mordidas, quebra-cabeça, glitch…) e **Estéticos** (o que só marca o papel ou a beirada: orelha,
  dobrada, amassada, picote, selo, recortada à mão, cantos, puída, arrancada do caderno, tirinhas, fita
  arrancada). Cada bloco com o seu "Nenhum".
- **Dois ao mesmo tempo** (o experimental): um destrutivo e um estético na mesma ficha. É possível:
  o desenho já soma vários (o papel marcado, o estrago e as manchas entram no mesmo recorte). Os
  cuidados: cada um com o seu sorteio e os seus ids no SVG, o recorte de cada um com a regra de
  preenchimento dele (uns usam par-ou-ímpar), a sombra seguindo os dois recortes, a orelha e o carvão
  da queimada valendo para qualquer um dos dois.
- Sem migrar nada: `damage` continua sendo o estrago, de qualquer bloco. Só quando há dois, o
  destrutivo fica em `damage` e o estético vai no campo novo `wear` (com `wearSeed`). Quem está numa
  build velha vê o destrutivo, como antes.

## Fecho

- A crítica do Impeccable no estojo todo (computador e celular, olhando de perto) e os consertos.
- O `/code-review high` e os consertos.
- DESIGN.md ("Papel da ficha") e as Novidades.
