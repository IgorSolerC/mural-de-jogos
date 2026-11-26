# Treino no Dicionário Japonês

Pedido do dono em 26/nov/2026: um modo **Treino** no dicionário. Três jeitos de treinar, que se juntam:

- **Escrever à mão** (書): o site dá uma dica (o **som**, o **romaji** ou a **tradução**) e a pessoa escreve a palavra
  com o pincel da lousa, **cada caractere no seu quadrado**. Ao terminar, a palavra certa aparece embaixo, cada
  caractere no seu quadrado com a **ordem dos traços** do KanjiVG, para comparar. A própria pessoa diz se acertou.
- **Português → japonês** (訳): uma palavra em português escrita; a pessoa digita em japonês.
- **Japonês → português** (読): a palavra japonesa escrita **ou** falada; a pessoa digita em português.

Antes de começar, a pessoa escolhe **com quais palavras** (todas as aprendidas, escolher entre as aprendidas, todas as
favoritas, escolher entre as favoritas, o dicionário inteiro, escolher no dicionário), **filtra pela escrita** (kanji,
hiragana, katakana: precisa ter, tanto faz, não pode ter) e marca **um ou mais jeitos** (com mais de um, cada palavra
sorteia o dela) e **uma ou mais dicas** (com mais de uma, cada palavra sorteia a dela). No fim, **o boletim**: o que
acertou, o que errou e todos os desenhos.

Estrutura decidida sem rodada de escolha (como o dono pede), planejada com o Impeccable (shape) e revisada por ele no
fim (critique). Cada rodada com testes, `/code-review medium`, commit e push; no fim, `/code-review high`.

## 0. O que é verdade aqui

- **Uma pessoa estudando japonês** (o dono e a namorada), no computador e no celular, que quer fixar as palavras que
  já aprendeu: lembrar como se escreve (a mão), como se diz (digitando) e o que quer dizer. Modo do Impeccable:
  **Operate** (uma tarefa de estudo, repetida), com o capricho do dicionário: o papel de arroz, o vermelho do 判子, a
  Klee One, o pincel Yuji Syuku, o 田字格. Gostoso de usar = poucos toques até a primeira palavra, o teclado
  inteiro sem mouse no computador, o polegar no celular, e um fim que ensina (o que errou, lado a lado com o certo).
- **Nada é compartilhado**: o dicionário só lê o CSV e as marcas (aprendida, favorita) da própria pessoa. O treino não
  escreve nas marcas nem em mural nenhum, então não mexe em sincronização nem em itens com mais de uma pessoa.
- **O treino não fica guardado** (como o Treinar dos Flashcards): a rodada, as respostas e os desenhos vivem na memória
  da mesa e somem ao fechar. **Só a montagem** (jeitos, dicas, fonte, filtros, quantas e as escolhidas à mão) fica
  neste navegador, para o próximo treino começar com um toque: `meu-mural:dicionario:treino:v1`, pelos ajudantes de
  `storage.ts`, sai na limpeza do logout pelo prefixo (teste em `browser-reset.spec.ts`). Não sincroniza: é preferência
  deste aparelho, como a voz.
- **Palavras que não se treinam**: os pedaços de gramática com 〜 (〜ます, 〜(ら)れる), as com alternativas (`な / なあ`)
  ou explicação no texto (`〜そうだ (ouvi dizer)`). Sobram as palavras de verdade; o ？ de 本当？ sai da resposta.

## 1. Onde mora

- Na pasta do dicionário, um grupo novo depois de Favoritas: o botão de tinta **Treinar** (o alvo, o mesmo desenho do
  Treinar dos Flashcards). Ele abre **Montar o treino**. Nenhuma rota nova: a página continua a mesma e o endereço não
  muda (como a mesa dos Flashcards).

## 2. Montar o treino (a folha)

Um `<dialog class="sheet">` de papel de arroz, como a lousa e a folhinha do dicionário: no alto o carimbo vermelho
**練習** (renshū, "treino") e "Montar o treino". O corpo são as **linhas da folha de filtros** (`ui/_filtro-linhas.scss`,
a mesma dos Gastos e do dicionário): cada linha o nome e o que faz à esquerda, os recortes à direita (o escolhido, o
adesivo de tinta torto). De cima para baixo, na ordem em que a pessoa pensa:

1. **Treinar** (os jeitos, um ou mais): três recortes grandes, cada um com o selo do jeito, o nome e uma linha do que
   faz: **書 Escrever à mão** ("A dica aparece, você escreve com o pincel"), **訳 Português → japonês** ("Lê em
   português, digita em japonês"), **読 Japonês → português** ("Lê ou ouve em japonês, digita em português"). Com
   mais de um, uma frase embaixo: "Cada palavra sorteia um destes." Nenhum marcado: o Começar fica apagado e a linha
   diz por quê.
2. **Com quais palavras** (a fonte): duas escolhas que se combinam, que organizam as seis do pedido sem repetir:
   - **De onde**: Aprendidas · Favoritas · Dicionário inteiro, cada uma com quantas palavras tem (a que não tem
     nenhuma, desbotada e com o motivo: "Marque palavras com 覚 nos verbetes").
   - **Quais**: **Todas** ou **Escolher…** (abre a lista para marcar; ao lado, "12 escolhidas"). Trocar o De onde
     guarda as escolhidas que ainda servem.
3. **Escrita** (os três filtros simples, um por linha dentro do mesmo bloco): **Kanji**, **Hiragana**, **Katakana**,
   cada um com três recortes: **Precisa ter · Tanto faz · Não pode ter** (padrão: Tanto faz). Cada recorte diz quantas
   palavras sobrariam. Ex.: só katakana = Kanji não pode, Hiragana não pode, Katakana precisa.
4. **Dicas** (só com o Escrever à mão; uma ou mais): **Som** (a voz japonesa do aparelho; sem voz, desbotado e com o
   motivo), **Romaji**, **Tradução**. Com mais de uma: "Cada palavra sorteia uma."
5. **Como mostrar o japonês** (só com o Japonês → português; um ou dois): **Escrito** · **Falado**.
6. **Quantas**: 10 · 20 · 50 · Todas (N). Menos palavras do que o número: vale o que tem.

No pé (com o picote): "**N palavras** combinam" e o botão de tinta **Começar o treino**. O foco começa nele: quem
treina sempre igual abre e aperta Enter. Sem nenhuma palavra: "Nenhuma palavra combina" e o que afrouxar.

### Escolher… (a lista)

A folha do "Escolher os flashcards" (`ui/study-drill-picker.ts`, a do perfil): a busca colada com "Marcar todos", uma
linha por palavra com a marca redonda, "N escolhidas · Cancelar · Pronto". A peça ganha as palavras do título e do pé
como entradas (para servir aos dois treinos) e, na linha, a palavra japonesa no lugar da cartolina pequena (o desenho
segue o conteúdo: aqui o que importa é a palavra). A linha mostra a palavra (Klee One), a leitura, o sentido e o JLPT;
a busca acha por português, kana (hiragana = katakana) e romaji. Ela lista as palavras do De onde que passam nos
filtros de escrita. Só montadas as linhas perto da tela (`appPerto`), porque o dicionário inteiro são 1.450.

## 3. A mesa (o treino)

Um `<dialog>` de tela cheia, como a mesa dos Flashcards, com o **papel de arroz** da lousa no lugar do eucatex (é o
dicionário). Uma peça nova, `ui/word-drill.ts`, porque a mesa dos Flashcards é feita do estudo deles (FSRS, cartas,
verso da anotação); o que é igual é reaproveitado:

- **A linha de cima**: Parar (X, Esc), "Treino" e a palavra em que está ("3 de 20"), o **placar** dos Flashcards
  (acertos com o ✓, erros com o ✗, nomes visíveis no computador) e **Desfazer** (Z): volta a última resposta e a
  palavra dela (no Escrever, com o desenho que a pessoa tinha feito).
- **Os botões do pé**: **Errei** e **Acertei** com o desenho dos Flashcards (o creme com o risco vermelho e a tinta
  com as letras de alta visibilidade), as teclas 1 e 2 impressas, e antes deles o botão da ação do momento
  ("Conferir", Enter). O CSS deles sai de `study-session.scss` para um parcial (`ui/_mesa-respostas.scss`) que as
  duas mesas usam: nada copiado.
- **Cada palavra** mostra, no alto, o selo do jeito (書 · 訳 · 読) e a pergunta em uma frase.

### 書 Escrever à mão

- **A dica**, grande no meio, num cartão de papel: **Som**, o botão de ouvir grande que fala sozinho ao chegar e
  repete ao toque (ou R); **Romaji**, o romaji na letra de rótulo; **Tradução**, o sentido em português na letra de
  mão. Embaixo, miúdo: "3 caracteres" (os quadrados já dizem, mas o leitor de tela também precisa).
- **Os quadrados**: um 田字格 por caractere, lado a lado (no celular, quebram em linhas de 2 ou 3, grandes para o
  dedo). Cada um é o quadro de traçar da lousa, **a mesma peça**: o pincel que engrossa devagar, a pressão da caneta,
  qualquer toque é traço. Cada quadrado tem o seu Desfazer (o último traço dele) pequeno embaixo; "Limpar tudo" no pé.
  Sem modelo nem guia: é de memória.
- **Conferir** (Enter, ou "Terminei"): os quadrados da pessoa ficam e, embaixo de cada um, **o quadrado certo** do
  mesmo caractere: a ordem dos traços do KanjiVG desenhada um caractere depois do outro, numerada (a mesma peça da
  Ordem da lousa; com menos movimento, inteiros). Tocar num quadrado certo desenha de novo. Caractere sem traços (raro):
  a letra de pincel. Ao lado (ou embaixo, no celular): a palavra, a leitura, o romaji, o sentido e o ouvir.
- A pessoa compara e diz **Errei** (1) ou **Acertei** (2).

### 訳 Português → japonês

- A pergunta: o sentido em português, grande, na letra de mão, com a classe miúda ("verbo").
- **O campo**: "Em japonês" (kana, kanji ou romaji). O romaji digitado aparece também em kana embaixo, ao vivo
  ("taberu → たべる"), para quem não tem teclado japonês.
- **Conferir** (Enter): a resposta certa aparece (a palavra grande com a leitura em furigana, o romaji, o ouvir) e o
  site diz se **bateu**: com a escrita, com a leitura (hiragana = katakana) ou com o romaji (vogais longas dobradas ou
  não). Bateu: "Bateu com a leitura" com o ✓, e o Acertei com o foco. Não bateu: "Não bateu" e o Errei com o foco.
  **A pessoa decide**: um sinônimo de verdade conta como acerto, se ela disser.

### 読 Japonês → português

- A pergunta: a palavra japonesa grande (Klee One, sem a leitura por cima: ler também é o treino) **ou** só o ouvir
  grande, falando sozinho ao chegar (sem o texto; com o Escrito e o Falado, cada palavra sorteia um).
- O campo: "Em português". **Conferir**: aparecem a palavra, a leitura, o romaji e o sentido, e o site diz se bateu
  com um dos sentidos (sem acento, sem caixa, sem o que está entre parênteses; "comer" bate em "comer / ..."). A pessoa
  decide, como no outro.

### O teclado

Enter confere; depois de conferir, 1 Errei, 2 Acertei, Enter o que o site sugeriu; Z desfaz; R repete a voz; Esc para
(com o "Parar o treino?" quando já respondeu alguma: perder o treino sem querer seria ruim). No campo de texto, as
teclas são do campo até conferir.

## 4. O boletim (o fim)

Quando acaba (ou ao Parar depois de alguma resposta, com "Ver o boletim"), a mesa vira o boletim, no papel de arroz:

- **Em cima**: "Treino completo." e a conta grande: **acertou 14 de 20** (70%), o tempo, e uma linha por jeito quando
  foram mais de um ("書 6 de 8 · 訳 5 de 7 · 読 3 de 5").
- **Errou (6)** primeiro (é o que ensina), depois **Acertou (14)**, cada palavra uma linha: o selo do jeito, a palavra
  (Klee One, leitura, sentido), a dica que saiu ("Dica: som") e o que a pessoa fez: no Escrever, **os desenhos dela**
  (cada quadrado, pequeno) com **os certos** ao lado (o caractere no pincel, pequeno); nos digitados, "Você escreveu:
  たべる". Tocar na palavra abre a **lousa** dela por cima (a mesma peça da página).
- **As ações**: **Treinar as que errei** (só as erradas, mesma montagem; o primeiro, com o foco, quando errou alguma),
  **Outro treino** (as mesmas regras, outro sorteio) e **Voltar ao dicionário**.

## 5. As peças (reaproveitar, não copiar)

- `core/dictionary/drill.ts` (puro, testado): o tipo da montagem e a leitura dela (sanitize), as palavras que se
  treinam, a fonte (De onde × Quais), os filtros de escrita (tem kanji, hiragana, katakana), as contas de cada recorte,
  o sorteio (as palavras, o jeito e a dica de cada uma, pela semente), a conferência dos digitados (japonês e
  português) e o boletim (as contas por jeito).
- `ui/brush-pad.ts`: o quadro de traçar da lousa (o canvas, os toques, o pincel, o desenho), com os traços como
  entrada e saída; a lousa (Treinar) e a mesa usam a mesma peça.
- `ui/stroke-order.ts`: o desenho da ordem dos traços (o svg com o fantasma, os feitos, o que está sendo desenhado e
  os números) e o tocador (`StrokePlayer`: tocar, pausar, passo, velocidade); a lousa (Ordem) e a mesa usam os dois.
- `ui/_mesa-respostas.scss`: o placar, o Errei e o Acertei das duas mesas.
- `ui/study-drill-picker.ts` com as palavras como entradas; `ui/word-voice.ts` para ouvir (com um tamanho grande);
  `ui/word-board.ts` aberta do boletim.
- `ui/word-drill-setup.ts` (a folha de montar) e `ui/word-drill.ts` (a mesa e o boletim), sob demanda (`@defer`, o
  dicionário já é um pedaço preguiçoso).

## 6. As rodadas

Cada uma com testes novos, a suíte, a build de produção, fotos a 2× (computador e celular), `/code-review medium`,
Novidades, BUILD + 1, commit e push.

1. **Montar e treinar digitando**: `core/dictionary/drill.ts`, o Treinar na pasta, a folha de montar inteira (com o
   Escolher… e a montagem guardada), a mesa com o 訳 e o 読, o placar, o Desfazer e um fim simples.
2. **Escrever à mão**: `brush-pad` e `stroke-order` tirados da lousa (a lousa igual, testes dela passando), o 書 na
   mesa com as dicas, os quadrados e a comparação com a ordem dos traços.
3. **O boletim**: o fim de verdade (errou/acertou, os desenhos, por jeito), Treinar as que errei, Outro treino, a
   lousa a partir do boletim, o Parar com boletim.
4. **Fechamento**: a crítica do Impeccable (critique) do treino inteiro, os consertos dela, `/code-review high` e os
   consertos, DESIGN.md.

## 7. Testes

- `core/dictionary/drill.spec.ts`: as palavras que se treinam (sem 〜, sem alternativas), os filtros de escrita (cada
  um dos três estados, combinados, o exemplo só katakana), as contas, a fonte (aprendidas pelo CSV e pela marca,
  favoritas, escolhidas que não servem mais), o sorteio (jeito e dica só entre os marcados; Som e Falado só com voz),
  a conferência (kana, katakana = hiragana, romaji com e sem vogal dobrada, kanji, o ？; os sentidos sem acento e sem
  parênteses), a montagem lida de lixo.
- `ui/word-drill-setup.spec.ts`: as linhas, as contas, o Começar apagado sem jeito ou sem palavra, as dicas só com o
  Escrever, o Escolher…, a montagem guardada e lida de volta.
- `ui/word-drill.spec.ts`: digitar e conferir (bateu e não bateu), 1/2/Enter, o Desfazer, o placar; os quadrados (um
  por caractere, traçar, desfazer num só), a comparação; o boletim (errou primeiro, os desenhos, as que errei).
- `ui/word-board.spec.ts` continua passando inteira (a lousa com as peças novas).
- `browser-reset.spec.ts`: a montagem sai na limpeza.
