# Plano: atalhos da fita de voz e o modo estudo (18/nov/2026)

Pedido do dono (cartão "Adicionar atalhos para controles de som no leitor de texto"): hoje só dá para mudar
onde a leitura em voz alta está tocando no texto. Quer atalhos de teclado, duas velocidades mais devagar e
um **modo estudo de som**: o texto vira rabisco (só a pontuação, os espaços e os símbolos à mostra), e
clicar numa palavra a revela, sem o texto "dançar". Os rabiscos tomam por base os das descrições secretas
(`ui/rabisco.ts`, o modo sem spoilers das fichas dos outros).

Continua o PLANO-VOZ.md (a fita, `ui/voz-fita.ts`; a voz, `core/voz.ts`; as frases, `ui/voz-frases.ts`).

## O que decidi (sem rodada de escolha)

### Feature 1: os atalhos e as velocidades devagar

- **As teclas** valem enquanto a fita está à mostra (lendo, pausada ou no fim), em qualquer lugar da ficha
  aberta: ↑ a próxima velocidade mais rápida, ↓ a mais devagar (param nas pontas), ← a frase anterior, →
  a próxima, Espaço pausa e continua. Ficam de fora quando a pessoa digita (campo, caixa de texto, editor),
  com Ctrl, Alt, Shift ou ⌘ juntos, com um menu aberto (as setas são do menu) e numa folha aberta por cima
  (comentários, compartilhar). As setas ← → da ficha, que viram as vezes de uma releitura, cedem para a
  fita enquanto ela está à mostra.
- **← → andam o mesmo que as teclas da fita** ("como o botão de voltar já faz"): uma fala por vez. Palavra
  por palavra não dá: as vozes do Google no Chrome (as que o dono usa) não avisam a palavra que dizem, então
  não há como saber de qual palavra seguir. A 0,25× as falas já são curtas (uns 40 letras; 17 no japonês).
- **Espaço é da fita** mesmo com o foco num botão (o clique da tecla é cancelado): quem clicou em
  "próxima" com o mouse e aperta Espaço quer pausar, não avançar de novo. Enter continua apertando o botão
  com o foco. A caixinha de uma tarefa (um campo) fica com o Espaço dela.
- **O retorno**: a tecla de metal da fita afunda um instante, como se apertada (← → e Espaço), e a
  etiqueta da velocidade pisca de leve (↑ ↓); o leitor de tela ouve a velocidade nova. Os nomes das teclas
  dizem o atalho ("Frase anterior (←)") e levam `aria-keyshortcuts`.
- **0,25× e 0,5×** no menu da velocidade (o trabalho que já estava começado e não commitado): abaixo de
  0,75× as falas se partem mais curtas, na proporção (`maxSpeech(lang, rate)`), para caber nos ~10 s que as
  vozes do Google aguentam; trocar a velocidade lendo parte as frases de novo e segue do mesmo pedaço.

### Feature 2: o modo estudo

- **Onde liga**: uma etiqueta nova na chapa da fita, entre a velocidade e o X, com o rabisco do estojo
  (`ICON.kitRabisco`), do mesmo papel creme da velocidade; ligada, ela fica laranja (a faixa da etiqueta da
  língua) e afundada. Fica guardada neste aparelho, como a velocidade (`meu-mural:voz`, que já sai no
  logout); vale só enquanto a fita lê: o X devolve o texto.
- **O que vira rabisco**: o que a voz lê (o nome da ficha e o texto), cada palavra (letra, kana, kanji,
  número) um laço cursivo do tamanho dela; a pontuação, os espaços, os símbolos e os emojis ficam. O
  japonês, sem espaços, se parte em palavras pelo `Intl.Segmenter` (私|の|ケーキ|です), não numa frase
  inteira. O spoiler fechado, os botões e os widgets ficam como estão (a voz também não os lê).
- **Sem o texto mexer**: as letras não saem do lugar. Ficam transparentes por um realce (`::highlight`,
  como o marca-texto da voz: o HTML que o Angular desenha não é tocado) e o rabisco é desenhado numa camada
  por cima, medida em cada palavra (`Range.getClientRects`), com o mesmo laço e a mesma força do
  `app-rabisco`. Revelar só apaga o realce e o rabisco daquela palavra: nada muda de tamanho.
- **Revelar**: o mouse em cima de uma palavra escondida a acende (o rabisco laranja, a mãozinha); clicar
  a revela. A revelada volta a ser texto comum (o link funciona, o card abre); para esconder de novo,
  desligar e ligar o modo. No modo estudo, tocar no texto não muda a frase lida (seria clicar para ver e
  perder o lugar), e o clique na palavra escondida não chega ao link ou ao card de baixo. O marca-texto da frase lida continua por baixo dos rabiscos: dá para seguir
  onde a voz está.
- **Selecionar** o texto fica desligado no modo estudo (arrastar revelaria tudo). O leitor de tela lê o
  texto de sempre (o rabisco é só para os olhos).
- **A camada acompanha**: a nota que muda (outra pessoa escreve na compartilhada, um card abre), a folha
  que muda de largura, a fonte que chega e o bloco de código que rola para o lado. O que foi revelado
  continua revelado enquanto a palavra está lá.
- **Sem o realce no navegador** (Firefox antigo), a etiqueta do modo estudo não aparece.

### Compartilhadas e visita

Nada é gravado na nota: o modo estudo e os atalhos só mudam o que se vê e o que a voz diz neste aparelho.
A compartilhada aberta por duas pessoas ao mesmo tempo não sente nada; a visita monta a mesma ficha
aberta, então ganha tudo sem nada à parte.

## Rodadas (uma por vez; cada uma com /code-review mid, commit e push)

1. **Os atalhos e as velocidades devagar** (`ui/voz-fita.ts`, `review-reader.ts`): testes das teclas (cada
   uma, os lugares onde não valem, as setas da releitura que cedem), Novidades.
2. **O modo estudo** (`ui/voz-estudo.ts`, `ui/voz-frases.ts` com `wordsOf`, `core/voz.ts` com a
   preferência, a etiqueta na fita): testes das palavras (o japonês partido, a pontuação fora), da camada
   (o tamanho igual ao da palavra, nada se mexe ao revelar), do clique, da nota que muda, da limpeza no
   logout; fotos 2x no computador e no celular.
3. **Fim**: crítica do Impeccable, DESIGN.md, /code-review high e o que ele achar.

## Como ficou (18/nov/2026)

- Feature 1 (37796288, BUILD 961): os atalhos e as velocidades devagar. Feature 2 (4e009c38, BUILD 962): o modo estudo.
- Fim (BUILD 963): a crítica do Impeccable em dois avaliadores isolados (27/40; o detector sem nada de verdade: as cores e
  medidas da chapa são de objeto desenhado). Entraram: o alvo do toque de 24px nas palavras curtas (o desenho num filho, porque
  a máscara recorta o toque), as dicas de primeira vez (os atalhos no computador, o tocar para revelar), as duas fileiras
  equilibradas da chapa a 320px e o nome do botão para o leitor de tela ("o texto vira rabisco na tela"). O /code-review high
  achou que outra fita que parava (a anotação ao lado fechando) apagava o realce desta, e os alvos de duas palavras curtas
  vizinhas se cobrindo; os dois consertados.
- Pedido depois (18/nov): tocar de novo na revelada a esconde (BUILD 964). O alvo do toque fica sobre a revelada (sem o
  desenho); com o mouse em cima, um tracejado laranja no pé da linha diz que tocar esconde. No modo estudo, o link de uma
  palavra revelada não abre (o toque é de esconder); com o modo desligado, abre.
- Ficaram de fora, por mudarem o pedido (oferecer só se o dono pedir): ↑ ↓ e Espaço
  devolvidos à rolagem quando o foco está num bloco que rola; uma tecla que revela a frase lida; o modo estudo sem a voz;
  esconder só a língua da leitura e deixar a tradução; as palavras reveladas virarem cartas dos Flashcards.
