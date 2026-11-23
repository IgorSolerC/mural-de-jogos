# Dicionário Japonês (Outros)

Pedido do dono em 23/nov/2026: uma página própria em Outros, "Dicionario Japones", para **consultar** as 933 palavras
de `vocabulario_japones.csv` (o vocabulário que ainda não está nas anotações dele): pesquisar, filtrar e ordenar.
Ninguém escreve nada nela. Primeiro só a página com busca, filtros e ordem, publicada; depois as coisas mais
demoradas, como o zoom da palavra para aprender a desenhar o kanji com uma fonte de pincel.

Estrutura escolhida sem rodada de escolha (como o dono pede), planejada e revisada com o Impeccable.

## 0. O que é verdade aqui

- **Uma pessoa estudando japonês**, no computador e no celular, que quer achar uma palavra (pelo português, pelo
  romaji, pela leitura em kana ou pelo kanji), ver o que estudar a seguir (a prioridade, o JLPT, o uso) e entender
  como escrever. Modo do Impeccable: **Operate** (consulta), com o capricho do Murall nos detalhes.
- **Os dados são fixos**: 933 linhas, 18 colunas. Nada é do dono nem de conta: não vai para a nuvem, não sincroniza,
  não entra no backup, não é compartilhado. Por isso nada aqui mexe em compartilhados (pedido 2 do dono).
- **Nada no armazenamento do navegador.** A busca, os filtros, a ordem e a vista moram no endereço
  (`/extras/dicionario?q=taberu&jlpt=N5&ordem=leitura`): o voltar do navegador funciona, o link mostra a mesma
  coisa, e o logout não tem o que apagar (regra do CLAUDE.md respeitada sem esforço).

## 1. Onde mora

- Rota `/extras/dicionario` (`DICTIONARY_PATH` em `core/areas.ts`), carregada sob demanda, sem o `enterExtras`
  (não depende do mural): entra em `muralFree`.
- **Prateleira de Outros**: um dicionário de pé (pano azul-marinho, o título gravado a ouro e os entalhes do índice
  de dedo na borda das páginas), a fita Dymo "Dicionário", o nome do link diz quantas palavras.
- **Barra da página**: a volta "← Outros" e o logo do dicionário (o selo vermelho 辞書 ao lado de "Dicionário",
  num rótulo de papel). Sem contagem: contar traria o CSV para o pedaço da barra, que toda página carrega.

## 2. Os dados

- O CSV fica em `src/app/core/dictionary/vocabulario-japones.csv` (o arquivo do dono, sem mudança) e entra como
  texto pelo carregador do esbuild (`core/dictionary/words.ts`, `with { loader: 'text' }`), só no pedaço da
  página. Trocar a lista = trocar o arquivo.
- `core/dictionary/dictionary.ts` (puro, testado): o tipo `Word`, a leitura do CSV, a busca, os filtros, as ordens,
  as seções e o endereço; `core/dictionary/kana.ts`: katakana → hiragana, romaji → kana, as linhas do silabário.

### Busca

- Um campo só acha por **tudo o que se escreve**: português (sem acento, sem caixa), romaji, kana (hiragana e
  katakana se acham entre si: テレビ = てれび), kanji, e também na composição e nas notas.
- **Romaji digitado vira kana** (`taberu` acha たべる, `kyou` acha きょう): o romaji do CSV usa vogais longas
  dobradas (ou, ee, uu, ii), e a busca aceita também `o`/`ō` sem dobrar.
- **Relevância**: igual > começa com > contém; a palavra japonesa, a leitura e o romaji valem mais que o
  português, que vale mais que composição e notas. Buscando, a ordem padrão vira Relevância (a escolhida volta ao
  limpar).

### Filtros (a folha de filtros do Murall, a mesma dos Gastos)

Uma linha por filtro, nome e o que faz à esquerda, os recortes à direita com quantas palavras cada um mostraria;
dentro da linha vale qualquer um, entre linhas, todos. Linhas: **JLPT** (N5, N4, N3, N2, Sem nível), **Uso** (Altíssimo,
Alto, Médio, Baixo), **Importância** (10 a 0, numerais em itálico como as médias), **Classe**, **Tema**, **Escrita**
(kanji, kanji+kana, kana, katakana, ambos), **Registro** (separado por `;`: uma palavra entra em cada um dos seus) e
**Grupo do verbo** (godan, ichidan, irregular; só aparece a linha com verbos à vista). Os ligados viram adesivos com X
embaixo da pasta. Para não repetir código, a folha dos Gastos vira a peça genérica `ui/facet-filters.ts`, que os
Gastos e o dicionário usam.

### Ordens (com a seta que inverte)

Prioridade (a ordem de estudo do CSV, padrão), Relevância (só buscando), Importância, Uso no dia a dia (frequência,
desempate pelo rank), Mais comuns na internet (rank do corpus; quem não tem vai para o fim), JLPT, Leitura
(あいうえお), Português (A–Z), Classe, Tema. As ordens que agrupam desenham **seções** com a cabeça de seção do mural
(`app-section-head`): Prioridade e Importância por importância ("Importância 10"), JLPT por nível, Leitura pelas
linhas do silabário (あ行, か行…), Classe e Tema pelo nome, Uso pelo rótulo.

## 3. A página

- **A pasta** (a mesma da Wishlist e das Pixel arts): a busca colada ("Procurar: português, romaji, かな ou 漢字"),
  Filtrar com o número de ligados, Ordenar (o select de tinta + a seta) e a vista (Verbetes · Tabela). Depois do
  picote: os filtros ligados e "Mostrando 42 de 933 · Limpar".
- **Verbetes** (padrão): a página do dicionário, uma folha de papel creme presa na parede, em duas colunas no
  computador (uma no celular), separadas por um fio. Cada verbete:
  - a palavra grande na Klee One (a letra de lápis dos flashcards), com a **leitura em furigana** por cima quando a
    palavra tem kanji;
  - o romaji em letra de rótulo e o português na letra de quem escreve;
  - à direita, o **selo do JLPT** (um carimbo vermelho, como o 判子) e o **uso** em cinco tracinhos;
  - embaixo, miúdo: classe · grupo do verbo · tema · escrita · registro; a composição com o sinal 例 e as notas
    em lápis; o número da prioridade e o rank, discretos.
  - A busca marca o que achou (`appRealceBusca`, o realce de sempre).
- **Tabela**: o livro-razão com todas as colunas, cabeça grudada, clique na cabeça ordena (e inverte), rolagem
  lateral no celular com a palavra presa à esquerda.
- **Nada encontrado**: o cartão das Anotações ("Nada com “xyz”"), com Limpar a busca e os filtros.
- **Desempenho**: 933 verbetes cabem na página; cada seção usa `content-visibility: auto` com altura estimada.

## 4. Pedidos de 23/nov (depois de publicada a parte 1), na frente das outras

O dono pediu, nesta ordem de prioridade, antes da lousa:

1. **As palavras já aprendidas no dicionário.** As 92 palavras das anotações dele (14 a 23/nov) entram no CSV no
   mesmo padrão das outras, conferidas em fontes: o JLPT das listas de estudo, como no resto do CSV, conferido no Jisho (que segue as listas
   do Tanos; onde a marca dele não é a do nível de estudo, como 〜さん N1 e おはよう N2, vale a das listas: N5; 何人 não
   tem marca e fica N5, como 一人 e 二人; バー fica N1, a marca do Jisho), o rank pela mesma lista
   da internet de Leeds (espelho `hingston/japanese`, 44.998 palavras, conferido: 829 das posições do CSV batem
   exatamente), a classe, o tema, a escrita e o registro no mesmo vocabulário do CSV. Uma coluna nova,
   `aprendida`, diz o dia (AAAA-MM-DD) em que a palavra foi aprendida. As que já estavam no CSV (好き, どう, 分かる,
   うん, ううん, まで, いい) só ganham o dia. Homógrafas de sentido diferente viram verbetes próprios (と "e/com" ao
   lado de と de citação; の de posse; から "a partir de"; 十 じゅう). "Nomes no geral" não é palavra: fica de fora.
2. **Marcar como aprendida e favoritar.** No verbete (e na Tabela), dois selos: **aprendida**, um carimbo verde
   com o kanji **覚** (oboeru, "aprender, guardar na memória"); **favorita**, uma estrela amarela com **好** (suki,
   "gostar", o 好 de お好み e 好きな, o do favorito). Filtros novos na folha:
   "Aprendidas" (Aprendidas / Para aprender) e "Favoritas". As marcas são do dono: guardadas neste navegador
   (`meu-mural:dicionario:v1`, pelos ajudantes de storage.ts, saem na limpeza do logout) e, com conta, no mural
   privado da nuvem (`dicionario`, juntadas palavra a palavra, vale a mudança mais nova; SYNC_SCHEMA sobe). Não há
   nada compartilhado: são marcas de uma pessoa, como a galeria de pixel arts. A coluna `aprendida` do CSV é o
   padrão; a marca do dono vale por cima.
3. **Na seleção de texto da leitura**, ao lado do Citar e do Nova nota: quando o trecho selecionado (japonês ou
   português) é uma palavra do dicionário, aparecem **"No dicionário"**, que abre uma folhinha com o resumo do
   verbete (a palavra grande, a leitura, o sentido, o JLPT, o uso, a classe, a composição, as notas, os selos e o
   link para o verbete no Dicionário), e **"Aprendida"**, que marca na hora (com Desfazer). O dicionário só é
   carregado quando alguém seleciona algo (import sob demanda).

## 5. Depois: as funções criativas, uma por vez

Cada uma com `/code-review mid` antes da seguinte, commit e push.

1. **A lousa (zoom da palavra).** Tocar no verbete abre a palavra maximizada numa folha de papel de arroz:
   cada caractere enorme num quadrado de caligrafia (o 田字格, a cruz vermelha tracejada dos cadernos japoneses),
   numa **fonte de pincel** (Yuji Syuku, OFL, só as fatias usadas; aprovada pelo dono), com a ordem dos traços
   animada a partir do **KanjiVG** (CC BY-SA 3.0, com crédito na página; aprovado; `scripts/kanjivg-tracos.py`
   gera `core/dictionary/strokes.ts`): os traços aparecem um a um, numerados, com tocar/pausar, traço
   anterior/seguinte e velocidade; a tabela de passos (筆順) ao lado; e **Treinar**: o caractere desbotado embaixo,
   você traça por cima com o dedo ou o mouse, com o próximo traço como guia.
2. **Ouvir a palavra** (a voz japonesa do navegador, a mesma escolha de voz de "Ouvir a nota").
3. **O índice de dedo** (os entalhes あかさたなはまやらわ na borda da página): com a ordem Leitura, pula para a
   linha do silabário.
4. **Os kanji da palavra**: em cada kanji, as outras palavras do dicionário que o usam, e a composição com links.
5. **Sortear uma palavra** do que está filtrado.

## 6. Testes

- `core/dictionary/dictionary.spec.ts`: leitura do CSV (aspas, vírgulas, campos vazios), busca (acento, romaji →
  kana, katakana = hiragana, relevância), filtros (dentro OU, entre E, contagens, registro múltiplo), ordens e seções.
- `pages/dictionary-page.spec.ts`: a página mostra 933, busca, filtra, ordena, troca a vista, lê e escreve o endereço.
- `ui/facet-filters` herda os testes da folha dos Gastos.
- Prateleira, barra (logo e contagem) e rota.
