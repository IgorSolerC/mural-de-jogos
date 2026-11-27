# Conjugações dos verbos no Dicionário Japonês

Pedido do dono em 26/nov/2026 (nota "Adicionar uma forma de ver conjugações dos verbos no dicionário", Dev Murall):

- Ver **todas as conjugações** de um verbo do dicionário, de forma **rápida e consolidada**, tomando como base a nota
  **行く→ Ir** (grupo JAPONES): as mesmas formas, nos mesmos grupos e com as mesmas etiquetas.
- Cada conjugação diz **para que serve**, de forma genérica ("Usado para um convite ou sugestão"), com **um exemplo**
  ("Ex: みんな、食べよう！").
- A **busca** do dicionário acha o verbo pela forma conjugada (行かなかった → 行く).
- A **seleção numa anotação** também: selecionar 行かなかった mostra o "No dicionário" com o verbete de 行く.

Planejado com o Impeccable (shape), estrutura decidida sem rodada de escolha (como o dono pede). Três rodadas, cada uma
com testes, `/code-review medium`, commit e push; no fim, a crítica do Impeccable e `/code-review high`.

## 0. O que é verdade aqui

- **Quem usa:** o dono e a namorada, estudando japonês no computador e no celular. Modo do Impeccable: **Operate**
  (consulta rápida). Sucesso = abrir o verbete, um toque, e ver a tabela inteira de uma vez; um segundo toque numa
  forma diz o uso e o exemplo. Dentro do mundo do dicionário que já existe (papel de arroz, o 判子 vermelho, Klee One,
  a faixa vinho dos verbos): nada de mundo novo.
- **Nada é compartilhado nem guardado.** As conjugações saem de uma regra (código puro), não de dados: não entram no
  CSV, no armazenamento, na nuvem nem em mural nenhum. Não mexem em sincronização nem em itens com mais de uma pessoa.
  A seleção numa anotação compartilhada só lê o texto selecionado, como já fazia.
- **282 verbos** (classe `verbo`): 156 godan, 80 ichidan, 3 irregulares (来る, する, 料理する marcado assim) e 43 com
  する. Os auxiliares e a cópula (だ, です, 〜ます) não são verbos aqui: não ganham conjugações.

## 1. As formas (a nota 行く→ Ir, generalizada)

`core/dictionary/conjugation.ts`, puro. Os cinco grupos da nota, na ordem dela, e as etiquetas dela
("Passado • Polido • Afirmativo"):

| Grupo | Formas (行く) |
| --- | --- |
| Tempos básicos | 行く, 行きます, 行かない, 行きません, 行った, 行きました, 行かなかった, 行きませんでした |
| Forma -te | 行って, 行かなくて, 行かないで |
| Desejativa | 行きたい, 行きたくない, 行きたかった |
| Formas modais e vozes | 行こう, 行きましょう, 行ける, 行けます, 行けない, 行けません, 行かれる, 行かれます, 行かせる, 行かせます, 行かせられる, 行かされる, 行かせられます, 行け, 行きなさい |
| Condicionais | 行けば, 行かなければ, 行ったら, 行かなかったら |

- **As regras:** godan pela última sílaba (う→わ no negativo; って/いて/いで/して/んで no -te; 行く é って), ichidan
  tirando o る, する e 来る inteiros (a escrita com kanji segue a leitura: 来ない = こない), os verbos com する
  conjugam só o する (勉強しない). A contraída (〜される) só nos godan que não terminam em す (a nota diz: só Grupo 1).
- **Exceções de verdade, numa tabela pequena:** ある (ない, なかった…), os honoríficos em 〜aru (いらっしゃる →
  いらっしゃいます, いらっしゃい; くださる, おっしゃる, ござる), くれる (くれ). Formas que **não se usam**
  (o potencial de できる, 分かる, 見える, 聞こえる, 要る, ある; o passivo e o causativo de ある) aparecem como "—"
  com "não se usa" para o leitor de tela (sem marca de estado raro no visual).
- **Cada forma** tem a escrita e a leitura em kana (a leitura é o que a busca, a voz e a furigana usam), o uso genérico
  (impessoal, como as notas do dicionário) e um exemplo com a forma marcada entre [ ] e a tradução: o mesmo formato
  das frases do verbete (`exampleParts`).
- **Teste:** as formas de 行く são exatamente as 33 da nota (escrita), e um punhado de verbos de cada tipo confere com
  a tabela (食べる, 飲む, 話す, 待つ, 死ぬ, 遊ぶ, 泳ぐ, 買う, 来る, する, 勉強する, ある, いらっしゃる, くれる); todos os
  282 conjugam sem sobrar forma vazia.

## 2. A folha de conjugações (rodada 1)

- **Onde abre:** no verbete de um verbo (página e folhinha "No dicionário"), uma linha logo depois da gramática: um
  botão de papel com o selo vermelho **活** (katsuyō) e "Conjugações", no tom dos cartõezinhos das ligadas. Na
  página, quem hospeda a folha é a página (como a lousa); na folhinha, a folhinha (a folha de conjugações abre por
  cima dela). O verbete só avisa (`conjugate`).
- **A folha** (`ui/word-conjugations.*`, sob demanda): o papel de arroz da folhinha (`_folha-arroz`), carimbo 活用 e
  "Conjugações" na cabeça, o X. Embaixo da cabeça, o verbo: a palavra em Klee One com a furigana, o romaji, o sentido,
  o grupo ("Grupo 1 · godan") e o ouvir.
- **A tabela consolidada:** cada grupo com o nome em letra de rótulo e, embaixo, as linhas por sentido (Presente
  afirmativo, Presente negativo, Passado…), com as colunas **Informal** e **Polido** lado a lado (é assim que a
  conjugação se lê: o par). A -te e a desejativa têm uma forma por linha; as condicionais têm Afirmativa e Negativa; a
  contraída fica só na coluna da informal (com "coloquial") e a imperativa firme (なさい) na da polida (com "firme"). Cada forma é um botão: a escrita em Klee One e a
  leitura em kana miúda embaixo (só quando tem kanji). Tudo cabe numa rolagem curta no computador (33 formas em 20
  linhas); no celular, o nome da linha vai em cima e o par embaixo.
- **O uso e o exemplo:** tocar numa forma abre embaixo da linha dela a caixinha do detalhe (uma de cada vez; tocar
  de novo fecha): as etiquetas da nota, o uso em uma ou duas frases, o exemplo na caixinha das frases do verbete (a
  forma marcada no tom vinho) com a tradução, e o ouvir da forma. `aria-expanded`/`aria-controls`; Esc fecha a folha.
- **Aberta por uma forma** (a busca ou a seleção acharam 行かない): a folha abre com ela escolhida, o detalhe aberto e
  ela rolada para a vista.
- **Os cinco grupos** têm um índice em cima (Tempos básicos · Forma -te · Desejativa · Modais e vozes · Condicionais),
  que rola a folha até o grupo. No celular ajuda a não rolar à toa.

## 3. A busca acha a forma conjugada (rodada 2)

- `WordKeys` ganha `forms` (as leituras e escritas das conjugações, dobradas: katakana = hiragana), feitas quando o
  dicionário abre (só nos 282 verbos). A busca em japonês, kana ou romaji (`ikanakatta` → いかなかった) que é,
  inteira, uma forma do verbo acha o verbo (vale menos que a palavra escrita igual, mais que achar no meio).
- **O verbete diz por quê:** na lista, o verbete achado por uma forma ganha uma tira no topo do papel: "行かなかった ·
  Passado • Informal • Negativo", que abre as conjugações já nela. Sem a tira, achar 行く buscando 行かなかった
  pareceria engano.
- Medir: abrir o dicionário e digitar não podem ficar mais pesados (a regra é feita uma vez por verbo; a busca compara
  num `Set`).

## 4. A seleção numa anotação (rodada 3)

- `lookupWords` (o "é exatamente esta palavra" da seleção) também aceita uma forma conjugada inteira; a pontuação em
  volta (。、！？「」) sai antes de procurar.
- A folhinha "No dicionário" mostra o verbete de 行く com a mesma tira ("行かなかった · Passado • Informal •
  Negativo"), que abre as conjugações nela. O "Aprendida" marca o verbo (a forma de dicionário).

## 5. Peças (reaproveitar, não copiar)

- O papel, a cabeça, o carimbo e o X: `ui/_folha-arroz.scss`. O verbete: `ui/word-entry.ts`. A voz: `ui/word-voice.ts`
  (a forma vai como uma palavra com a leitura dela). As frases: `exampleParts`. A família vinho dos verbos: as
  variáveis do verbete.
- A busca e a seleção: `keysOf`, `termScore`, `lookupWords` em `core/dictionary/dictionary.ts`.

## 6. Testes

- `conjugation.spec.ts`: a nota de 行く inteira, os tipos de verbo, as exceções, todos os 282.
- A folha: abre pelo verbete, a tabela por grupos, tocar abre o uso e o exemplo, aberta por uma forma.
- A busca: 行かなかった, ikanakatta, たべられる acham o verbo, com a tira; o latim não acha forma.
- A seleção: selecionar 行かなかった abre a folhinha com 行く e a tira.

## 7. Fechamento (26/nov)

A crítica do Impeccable da entrega inteira (duas avaliações isoladas) deu 27/40. Consertado o que era do pedido:

- A folha mora no endereço (`?conjugar=&forma=`), como a lousa: o voltar do celular fecha a folha em vez de sair do
  dicionário; o X e o Esc voltam quando foi a página que abriu. Só verbo que conjuga, e nunca por cima da lousa.
- O exemplo vem de uma frase do próprio verbete quando ela marca a forma; senão, o da forma, com "com outro verbo, na
  mesma forma".
- Uma linha diz que a forma se toca; o nome das colunas fica embaixo do índice enquanto o grupo rola; os grupos são
  h2; o contraste das colunas e das leituras subiu; "21 de 33 formas" quando algumas não se usam; a tira "achada
  como" diz "ver nas conjugações".

Ficam para o dono as sugestões fora do pedido: caber a tabela inteira numa tela do computador (grupos em duas
colunas), um jeito de esconder as formas para estudar, a regra de cada grupo escrita uma vez, setas do teclado entre
as formas, o índice que acende o grupo em que se está.
