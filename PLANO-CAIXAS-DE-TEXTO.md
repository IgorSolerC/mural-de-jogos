# Plano: as caixas de texto do canvas

Pedido do dono em 26/nov/2026, nas caixas de texto do canvas (o card do texto, `t: 'x'` em `core/free-board.ts`):

1. poder mudar o **tamanho da letra**;
2. a linha que não cabe na largura **quebra** para a de baixo; o que não cabe nem na largura nem na altura vira **"…"
   no fim**, para dizer que tem coisa escondida;
3. tirando o zoom, **o padding dela "dá uma zoada"**: deixar melhor;
4. e, no geral, **deixar intuitivo** usar essas caixas.

Leia antes o `CLAUDE.md` da raiz (botões de hover num padrão só, a visita com as mesmas peças, sair da conta apaga
tudo). O desenho de longe é o do PLANO-MINIATURA-CANVAS.md (far-look, sketch-model): mexer nele mexe nos três desenhos.

## 1. O que existe hoje (e o que as fotos mostraram)

Fotos em `.angular/canvas-texto/antes` e `transicao` (roteiros `fotos.mjs` e `transicao.mjs`, quadro em
`semente.mjs`: sete cards, de só título, curto, comprido, estreito, lista, formatado e sem título).

- **Perto** (o lado da peça na tela ≥ 72 px, `NEAR_PX` em `scene.ts`): o card de verdade no DOM
  (`free-board-piece.ts`): a faixa do jeito com o desenho e o título (até 3 linhas, com "…"), a folha clara com o
  corpo, a moldura de 5 px da cor em volta. Tudo em px do mundo: a câmera escala por igual.
- **Meio** (18 a 72 px): um SVG da aparência de longe (`pieceItems` de `sketch-model.ts`), com o texto em **px da tela**
  (7 a 9 px), a faixa alta o bastante para essa letra, sem o desenho do jeito, sem a moldura em volta da folha, cantos
  de 2 px da tela.
- **Longe** (< 18 px): os mesmos itens, pintados no canvas da camada de longe.

O que dá errado:

- **A "zoada" do padding é a troca de perto para meio.** No limite, o card perde o desenho, a moldura em volta do texto,
  os cantos e o respiro, e a letra **cresce** tirando o zoom (no meio ela é de 7 a 9 px da tela; ao lado, o card ainda de
  perto tem letra de 5 px). A 31%, o "Dia 1: chegada" (meio) tem a letra maior que a do "Cuidado com o elétrico" (perto),
  e os dois cards ficam de famílias diferentes lado a lado. Cada card troca num zoom (o limite é pelo tamanho dele), então
  tirar o zoom é uma sequência de pulos.
- **O corpo é cortado no meio da linha**, sem reticências (o "Cuidado…", o "Nota" sem título, o "corpo" do card
  estreito cortado pela metade da letra).
- O título do card estreito come o card todo (três linhas) e o corpo aparece como uma faixinha cortada.
- Não há tamanho de letra: todo card é 1,15rem (18,4 px do mundo).

## 2. Decisões

**D1. Um tamanho de letra por card, em cinco degraus.** `fs` no card (`FbNote`): 0,75 (Pequena), 1 (Média, a de
sempre: o campo some), 1,4 (Grande), 2 (Bem grande), 3 (Enorme). Um número, não um nome: o site antigo guarda o campo
como veio (`extras` guarda números) e a junção dos compartilhados é campo a campo (`mergeFields`): um muda a letra,
outro o texto, ficam os dois. O sanitize prende ao degrau mais perto. A letra escala o card inteiro que é em `em`
(o título, os respiros, a faixa); a moldura de papel fica nos 5 px (a beirada é do papel, não da letra).

**D2. Onde muda a letra.** Na etiqueta da seleção (a peça única de `_etiqueta-acoes.scss`), um botão "Tamanho da
letra" (o desenho `ALargeSmall`) ao lado do Jeito, que abre o menu dos cinco degraus (o "Aa" em cada tamanho, o de
agora com o tique), como a Cor e o Jeito já fazem; o mesmo no botão direito da peça ("Tamanho da letra…"); e os
atalhos de editor de texto, Ctrl+Shift+> e Ctrl+Shift+< (um degrau). Vale para vários textos selecionados de uma vez.

**D3. Mudar a letra cresce o card até caber** (nunca encolhe sozinho), no mesmo passo do desfazer: a altura é medida
no próprio card com a letra nova por um instante (como o `cardNeed` faz no escrever), antes de guardar.

**D4. O que não cabe vira "…".** No card de perto, o título quebra em até 3 linhas (menos, se a caixa for baixa) e o
corpo mostra as linhas inteiras que cabem; se sobrou texto, a última linha que aparece termina em "…". Sem lugar para
nenhuma linha do corpo, a folha clara some e o "…" vai no fim do título. Palavra maior que a linha quebra no meio
(`overflow-wrap: anywhere`). A conta é feita no próprio card (as linhas de verdade, pelas caixas do texto), quando o
tamanho, o texto ou a letra mudam.

**D5. Uma aparência só do card em qualquer zoom.** O card fica de perto (no DOM) enquanto a letra do corpo tiver pelo
menos ~4,5 px na tela (com a letra Média, até ~25%; com a Enorme, até ~8%), em vez dos 72 px de lado. Abaixo disso, o
meio e o longe desenham **o mesmo card em proporção** (`pieceItems` num modo fiel, em px do mundo): a faixa da altura
das linhas do título, o desenho do jeito, a moldura de 5 px, a folha clara, os cantos do card, e cada linha de texto
como um traço da tinta no lugar e do comprimento da linha (quebrada pelas mesmas larguras). Tirar o zoom não pula mais:
o card só vai ficando menor. A miniatura do mural fica como o dono aprovou (letra de 7 a 9 px da tela).

**D6. Experiência geral** (seção 4, da crítica do começo).

## 3. Rodadas (uma por vez, cada uma com /code-review medium antes da próxima, e um commit)

1. **O tamanho da letra** (D1, D2, D3): dados, sanitize, peça, etiqueta, menus, atalhos, crescer; testes.
2. **Quebra e reticências** (D4): a conta das linhas na peça; testes.
3. **O card em qualquer zoom** (D5): o limite do perto pela letra, o modo fiel do desenho de longe; testes.
4. **A experiência** (seção 4).
5. **Fechamento:** crítica do Impeccable (duas avaliações isoladas), /code-review high, DESIGN.md.

## 4. A experiência (da crítica do começo)

Crítica em `.impeccable/critique/2026-11-26T13-37-20Z__src-app-ui-free-board-free-board-piece-ts.md` (duas
avaliações isoladas): **25/40**, consistência 1/4. O P0 é o pulo de perto para meio (D5); o P1, o corte sem "…" (D4) e
o tamanho da letra (D1–D3). Para a rodada 4:

- **E1. Escrever na etiqueta.** Com um texto só selecionado, o primeiro botão é Escrever (o lápis), o mesmo do duplo
  clique e do Enter. O Jeito deixa de usar o desenho do jeito (na Nota é um lápis, e parece "escrever"): fica com o
  desenho do card (`ICON.card`), e o nome do jeito no título do botão.
- **E2. Ler o que ficou escondido.** No ver (e na visita, que monta a mesma peça), o card com "…" abre inteiro ao
  clique ou ao Enter: a folha do texto em modo de ler, no mesmo lugar, com a faixa do card e o texto em
  `app-rich-text`; o Esc e o X fecham. No editar, o duplo clique continua escrevendo.
- **E3. "Ajustar ao texto"** no botão direito do card (como o "Ajustar ao conteúdo" da moldura): a altura que o texto
  pede, em furos, maior ou menor.
- **E4. O card novo nasce do tamanho do que se escreveu.** No primeiro Pronto de um card que acabou de nascer, ele
  alarga até ~320 antes de crescer para baixo (um parágrafo não vira fita) e, só com o título, fica da altura da
  faixa (sem a metade de papel vazio). Os cards de antes não mudam sozinhos.
- **E5. O card sendo escrito fica por cima** dos vizinhos enquanto cresce (só na tela; a ordem guardada não muda).
- **E6. Conferir na folha** o cursor que cai no começo do texto ao abrir (devia ir para o fim).

Ficam de fora (ruído para este pedido): a régua de ferramentas com 10,88 px, o raio de 18 px do feltro, o título
"skipped-heading" de outra página.
