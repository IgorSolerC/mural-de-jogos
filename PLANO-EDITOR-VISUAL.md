# Plano: escrever sem ver o markdown (o modo Visual)

Pedido do usuário (29/out/2026), com as palavras dele: hoje a descrição de uma nota tem só dois jeitos,
"Markdown (editar)" e "Ver como fica (read-only)". Ele quer um terceiro (ou o "Ver como fica" deixando
de ser só leitura) "que me permita visualizar o resultado final enquanto eu digito, sem precisar
interagir com o markdown", como no Word ou no Google Docs. Por baixo continua markdown, mas a pessoa
"não saiba e não veja o markdown cru"; negrito, itálico e links vêm dos atalhos e da régua. O markdown
"ainda deve ser disponível e de fácil acesso". Widgets continuam com "Editar", mas tabelas e as
descrições dos widgets, se der, escritas direto. "Quero uma longa etapa de planejamento [...] pense
em tudo que pode dar errado [...] e tudo que é necessário para que a experiência final seja incrível."

Este arquivo é o plano inteiro, escrito para ser lido também por outras AIs (como o PLANO-API.md e o
PLANO-IMAGENS.md). O que já foi feito está na seção 12 (Andamento). As decisões estão na seção 9 (as minhas, com o porquê, e
as cinco perguntas ao usuário, respondidas em 29/out); as rodadas, na seção 11; o andamento, na 12.

---

## 0. Resumo em uma página

- **O texto continua sendo a verdade.** O que se guarda é a mesma string de hoje, com as mesmas marcas
  de `core/rich-text.ts`. Nenhuma marca nova, nenhum formato novo: o backup, a nuvem, a junção das
  compartilhadas, a API, o MCP, o PDF, a cópia e um site antigo aberto noutro aparelho não mudam nada.
  O modo Visual é só outro jeito de mexer na mesma string.
- **Uma linha do texto, uma linha na tela.** O texto do Murall já é lido linha a linha (cada linha é uma
  linha da pauta; a em branco também conta). O documento do Visual é a lista dessas linhas, cada uma
  com o tipo dela (texto, título, item, tarefa, citação, sutil, divisória) e as marcas por cima das
  letras; código, tabela e widget são peças inteiras. É o modelo do Google Docs por dentro (listas
  como parágrafos com nível), e é o que deixa o resto simples: o cursor, a troca de modo, as mudanças
  de fora e o "mexi numa linha, só ela muda".
- **ProseMirror** (MIT, grátis, sem servidor) faz o trabalho difícil de um editor de verdade: o
  `contenteditable`, a seleção, a composição de acentos e do teclado do celular, o desfazer, o colar.
  O resto é nosso: o esquema (os tipos de linha e as marcas), a tradução texto ⇄ documento, a régua, os
  widgets como componentes Angular. Fica num pedaço à parte, carregado só quando o Visual abre: o
  carregamento do site não cresce.
- **Quatro promessas**, conferidas por teste (seção 4): abrir e sair sem mexer não muda um byte; mexer
  numa linha muda só ela; o que está na tela é o que a leitura vai mostrar; nada some em silêncio (o
  que o Visual não sabe mostrar fica guardado como está, num "trecho cru").
- **Escrever sem marca aparecer.** O que a pessoa digita é texto: um `*` digitado sai com a barra antes
  (`\*`) quando, sem ela, a leitura o leria como marca, e só nesse caso. Uma trava confere cada linha
  escrita lendo-a de volta pelo próprio `parseRich`.
- **A régua é a mesma.** Formatar, Inserir, os botões, os atalhos (Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+E,
  Ctrl+Shift+7/8/9…) fazem a mesma coisa nos dois modos; no Visual os botões ficam acesos onde a marca
  vale, como no Docs. Listas continuam no Enter, Tab e Shift+Tab mudam o nível, "[[" abre a lista de
  anotações.
- **Widgets são peças vivas** dentro da folha: um toque seleciona (a tirinha de sempre: Editar, Tirar),
  a legenda da imagem e do vídeo e o título do contador e do áudio se escrevem direto nela.
- **A tabela se escreve direto**, célula por célula, como no Docs: Tab anda, Enter desce, a régua ganha
  o menu "Tabela" (linhas, colunas, alinhar, jeito) enquanto o cursor está nela. A folha da tabela
  continua no "Editar".
- **As abas do editor viram "Visual" e "Markdown".** O "Ver como fica" só de leitura dá lugar ao Visual,
  que é ele mesmo, editável (decisão P1). Em Ajustes › Mural, "Jeito de escrever" escolhe qual abre
  primeiro; trocar de aba leva o cursor para o mesmo lugar do texto.
- **Por partes**, em 10 rodadas, começando por uma prova no celular de verdade (seção 11). O Visual
  aparece como "em teste" desde a rodada 2, para o usuário experimentar cada parte.

## 1. Como o texto funciona hoje (o que pesa no desenho)

| Fato | De onde | Por que importa |
| --- | --- | --- |
| O texto é uma string com marcas leves; "nunca vira HTML: quem desenha é o próprio Angular" | `core/rich-text.ts` (cabeçalho) | O Visual não pode guardar HTML nem nada além da string. Ele lê e escreve essa string. |
| O leitor é um parser próprio, com regras que não são as do CommonMark: ênfase só fecha na mesma linha e colada no texto, `_` só fora da palavra, `((sutil))`, `\|\|spoiler\|\|`, `==marca==`, símbolos (`->` vira →), `[[link]]`, `-# sutil`, `1.1.`, corpo de item recuado | `parseInline`, `EMPHASES`, `ATOMS`, `parseLines` | Nenhuma biblioteca de markdown de fora serve para escrever de volta: o tradutor do Visual é nosso e confere tudo pelo `parseRich` de verdade. |
| Cada linha é uma linha da pauta; as em branco também; um parágrafo (`p`) guarda as linhas como foram escritas | `Block` `p: lines: Span[][]` | Não existe "parágrafo de várias linhas" como no CommonMark: Enter é uma linha nova, sempre. Isso casa com o modelo "uma linha, um nó". |
| Lista é por recuo: o que vem embaixo de um item recuado 2+ colunas é dele (descrição, outra lista, widget, tabela, código) | `bodyOf`, `ownerItem`, `bodyIndent`, `itemEnd` | O "nível" de uma linha não é um atributo dela, é o recuo lido no contexto. O Visual guarda o recuo de cada linha e pergunta ao parser o que ele significa. |
| A leitura numera a lista em sequência a partir do primeiro número (`start` e contador do CSS), seja o que for escrito nos outros itens | `ui/rich-text.ts` (`@case ('ol')`) | Os números escritos depois do primeiro não aparecem; o Visual mostra os números da leitura. |
| Widget é uma linha só dele: `{{nome: a \| b \| tamanho}}`; um nome que este site não conhece fica como texto | `core/widgets.ts` (`parseWidgetLine`, `widgetLine`, `escapeArg`) | Um site mais novo pode ter widgets que este não sabe desenhar: o Visual não pode estragar a linha deles. |
| A tabela é GFM; o jeito numa linha `{{tabela: listrada}}` logo em cima (a branca não se escreve); células sem quebra de linha; `\|` escapado | `core/tables.ts`, `tableBlockAt` | A tabela do Visual não pode ter célula mesclada, quebra de linha dentro da célula nem conteúdo de bloco. |
| O editor é um `<textarea>` com a régua por cima; cada mudança passa por `insertText`, então o Ctrl+Z do navegador desfaz cada uma | `ui/rich-editor.ts` (`replace`) | O Visual tem o próprio desfazer; a troca de modo precisa decidir o que acontece com o histórico (seção 5.17). |
| O editor é usado em três lugares: a ficha (anotação e resenha), o comentário e o "Sobre mim" do perfil | `review-editor.html`, `comments-panel.html`, `profile-edit-page.html` | O Visual vale nos três. O comentário envia com Ctrl+Enter (o Visual não pode usar essa tecla). |
| A prévia da ficha ao lado do editor segue o cursor lendo `selectionStart` do `<textarea>` | `review-editor.ts` (`caretFrom`, `followCaret`, `caretSpot`) | O editor precisa dizer "o cursor está na linha N" sem que o pai mexa no `<textarea>`. |
| A folha do widget é um diálogo modal; o editor guarda o pedido e escreve no `close` | `widgetOrder`, `onWidgetClosed` | No Visual vale a mesma armadilha (o texto digitado com a folha aberta iria parar no lugar errado). |
| Colar imagem vira widget numa linha só dela; colar texto com imagem de outra pessoa troca o id pela cópia | `onPaste`, `putImage`, `adoptImages` | O Visual faz o mesmo, com o lugar do widget acompanhando o que a pessoa escreve enquanto a imagem é guardada. |
| As compartilhadas se juntam por linhas (três vias, como o git) e, no conflito, por palavras | `core/merge3.ts`, `shared-notes.ts` | Reescrever linhas que a pessoa não mexeu cria conflito com o colega. A promessa "mexeu numa linha, só ela muda" é por isso. |
| O limite do texto é 20.000 caracteres, contados na string guardada | `TEXT_MAX` em `core/review.ts`, `max` no editor | No Visual o contador conta também as marcas que não aparecem. |
| O site é zoneless (Angular 20), os componentes OnPush com signals | `app.config.ts` | Os widgets dentro do ProseMirror são componentes criados à mão (`createComponent`, `attachView`), que precisam ser destruídos à mão. |
| Orçamento: o carregamento inicial tem teto de 3 MB (hoje ~1,95 MB); o estilo de cada componente, 24 kB, e o do `rich-editor` já está perto | `angular.json`, memória do projeto | O Visual vem num pedaço à parte (`@defer`) e com o estilo num componente seu. |
| A REGRA DO PDF: toda marca nova sai certa no "Salvar como PDF" | `rich-text.ts`, `widgets.ts` | Este plano não cria marca nenhuma: o PDF não muda. |
| A CSP: `script-src 'self'`, `style-src 'self' 'unsafe-inline'` | `src/index.html` | O ProseMirror não usa `eval` e escreve estilo pelo DOM: cabe na CSP de hoje. |
| Sair da conta apaga tudo o que o site guardou | `CLAUDE.md`, `core/browser-reset.ts` | A escolha "Jeito de escrever" mora dentro dos Ajustes que já existem (mesma chave): sai na limpeza, com teste. |

## 2. A experiência que se quer (o "como no Docs")

Cenas que o Visual precisa fazer bem. Cada uma vira pelo menos um teste (seção 7).

1. A pessoa abre uma anotação e vê a folha **igual à leitura** (a pauta, o recuo do parágrafo, os
   títulos, as listas com os números certos, as tarefas com a caixinha, o marca-texto, os widgets
   vivos, a tabela no jeito dela) e escreve nela. Não há asterisco, cerquilha, colchete nem chave.
2. Seleciona uma palavra, Ctrl+B: fica em negrito, o botão B acende. Ctrl+B de novo: sai.
   Sem seleção, Ctrl+B e continua escrevendo: o que vem sai em negrito.
3. Escreve "- " no começo da linha: vira um item (como no Docs); Ctrl+Z volta a ser o traço que ela
   escreveu. Enter continua a lista; Enter no item vazio termina; Tab entra um nível; Shift+Tab sai.
4. Clica na caixinha da tarefa: marca e risca. Shift+Enter abre a descrição embaixo do item.
5. Ctrl+K com uma palavra selecionada: o painel do link de sempre; o link aparece azul e sublinhado.
   Clicar num link mostra o painel passivo (trocar, tirar, abrir); Ctrl+clique abre.
6. "[[" abre a lista das anotações; escolhida, aparece o nome dela como link de caneta azul.
7. Inserir › Contador: a folha do widget de sempre; ao pôr, o contador aparece vivo na linha.
   Toque nele: a tirinha (Editar, Tirar). A legenda de uma imagem: clica nela e escreve.
8. Inserir › Tabela: aparece uma tabela 3×2 com o cursor na primeira célula; escreve, Tab, escreve,
   Tab na última célula cria a linha seguinte. O menu "Tabela" da régua põe coluna, alinha, muda o jeito.
9. Cola um trecho do Google Docs, de um site, do Word ou de uma planilha: vem o negrito, as listas, os
   links e a tabela; não vêm a fonte, a cor, o tamanho nem o lixo.
10. Copia do Visual e cola no WhatsApp: texto limpo, sem asteriscos. Copia e cola noutra nota do
    Murall (no Visual ou no Markdown): vem com a formatação.
11. Toca na aba "Markdown": vê o texto com as marcas, com o cursor no mesmo ponto. Volta: o mesmo.
12. No celular, escreve com o teclado do sistema (acentos, sugestões, ditado), a régua fica presa em
    cima do teclado, o cursor nunca fica escondido atrás dela.
13. Abre uma nota antiga cheia de jeitos de escrever (`__negrito__`, `* item`, `1. 1. 1.`, `####`) e sai
    sem mexer: nada muda no texto, a nota nem conta como editada.
14. A colega da anotação compartilhada muda um parágrafo enquanto a pessoa escreve noutro: o dela
    aparece, o cursor não pula, nada do que a pessoa escreveu some, e o Ctrl+Z desfaz só o que é dela.
15. Leitor de tela: a folha é uma caixa de texto com nome, os botões dizem se estão ligados, as
    tarefas dizem se estão feitas, os widgets têm nome.

## 3. Os caminhos possíveis

| Caminho | O que é | Problema | Veredito |
| --- | --- | --- | --- |
| **A. Editor próprio em `contenteditable`** | Escrever do zero a seleção, a digitação, o colar | É onde editores morrem: composição de acentos e do teclado do Android, o cursor do iOS, o desfazer, o colar. Anos de casos. | Não. |
| **B. ProseMirror** | O motor por trás de muitos editores (o Tiptap, o do NYT, o do Atlassian); esquema próprio, documento imutável, plugins | Uma dependência nova (o projeto tem poucas). Pesa uns 100 KB comprimidos (medir na rodada 0). O esquema e a tradução são trabalho nosso, de qualquer jeito. | **Escolhido.** |
| C. Tiptap | O ProseMirror com uma camada mais fácil | Mais peso e outra abstração por cima, sem ligação oficial com o Angular; as extensões prontas falam o markdown deles, não o nosso. | Não: o ganho é pequeno, porque o esquema e a tradução seriam nossos do mesmo jeito. |
| D. Lexical (Meta) | Editor moderno, com bom suporte a celular | Pensado para React; o modelo de nós (com a seleção própria) é bom, mas tabela e colar são menos maduros; menos exemplos de esquema próprio. | Não. Segunda opção se a rodada 0 achar um defeito sério do ProseMirror no celular. |
| E. CodeMirror 6 com "pré-visualização viva" (o jeito do Obsidian) | O texto continua markdown, mas as marcas se escondem fora da linha do cursor | As marcas **aparecem** na linha onde o cursor está. O usuário pediu exatamente para não ver o markdown. | Não. |
| F. Quill, Slate, Editor.js | Outros editores | Quill tem modelo próprio (Delta) e tabela fraca; Slate é React; Editor.js é por blocos, sem marcas finas. | Não. |
| G. Deixar o "Ver como fica" editável por cima do componente de leitura | `contenteditable` no `app-rich-text` | É o caminho A disfarçado: o Angular redesenhando o DOM que o navegador está editando briga com a seleção. | Não. |

O ProseMirror é dividido em pacotes pequenos; entram só os que precisam: `prosemirror-model`, `-state`,
`-view`, `-transform`, `-commands`, `-keymap`, `-history`, `-inputrules`, `-gapcursor`, `-dropcursor` e
`prosemirror-tables` (seção 5.14). Todos MIT. Versões fixas (sem `^`), conferidas na rodada 0.

## 4. A regra de ouro: o texto continua sendo a verdade

O Visual nunca guarda nada além da string de sempre. Isso dá quatro promessas, cada uma com o seu teste:

- **I1. Abrir e sair sem mexer não muda um byte.** Nem `__negrito__` vira `**negrito**`, nem `* item`
  vira `- item`, nem `1. 1. 1.` vira `1. 2. 3.`, nem `\r\n` vira `\n`. Sem mudança no documento, o
  editor nem chama `value.set` (a nota não conta como editada, a nuvem não manda nada).
- **I2. Mexer numa linha muda só ela.** E o que depende dela, do jeito que o Markdown já faz hoje (os
  números de baixo da lista em `renumberAfter`). As outras linhas saem como estavam escritas, byte a
  byte. É o que evita conflito na compartilhada e diferença à toa no histórico de versões.
- **I3. O que está na tela é o que a leitura vai mostrar.** O texto escrito pelo Visual, lido de volta
  pelo `parseRich`, dá exatamente as linhas, os tipos e as marcas da tela (com uma exceção aceita: o
  espaço na ponta de uma marca, seção 5.4).
- **I4. Nada some em silêncio.** O que o Visual não sabe mostrar como peça editável fica como está,
  num "trecho cru" (seção 5.5), em vez de ser reinterpretado.

O que isso deixa de fora, de graça: o backup, a nuvem e as migrações (`core/migrations.ts`) não mudam;
a API e o MCP continuam lendo e escrevendo markdown; o PDF não muda (nenhuma marca nova); a cópia
(`copyText`) e a busca (`plainText`) não mudam; um aparelho com o site antigo abre o mesmo texto.

## 5. O desenho

### 5.1 O documento: uma linha do texto, um nó

O documento (`doc`) é uma sequência de nós de bloco, na ordem das linhas do texto. Nada de lista dentro
de lista: o nível vem do recuo, como no texto (e como os parágrafos com nível do Docs).

| Nó | Linhas do texto | Conteúdo | Atributos | Escrito como |
| --- | --- | --- | --- | --- |
| `linha` | 1 | letras com marcas | `recuo` (colunas) | recuo + letras (vazia: `""`) |
| `titulo` | 1 | letras com marcas | `nivel` 1–3, `recuo` | `#`, `##` ou `###` + espaço |
| `item` | 1 | letras com marcas | `tipo` (`ul`, `ol`, `check`), `feita`, `recuo`, `numero` (o escrito, ex. `1.2`) | `- `, `- [ ] `/`- [x] `, `1.2. ` |
| `citacao` | 1 | letras com marcas | `recuo` | `> ` |
| `sutil` | 1 | letras com marcas | `recuo` | `-# ` |
| `divisoria` | 1 | nada (átomo) | `recuo` | `---` |
| `codigo` | 2+ | texto puro, com quebras | `recuo`, `cerca` (a escrita) | a cerca, as linhas, a cerca |
| `tabela` | 2+ | `fileira` › `cabeca`/`celula` (letras com marcas) | `recuo`, `jeito` (null = branca), `alinhar[]`, `sobra` | a marca do jeito (se tiver) e o GFM de `writeTable` |
| `widget` | 1 | nada (átomo) | `recuo`, `nome`, `args[]`, `tamanho` | `widgetLine` |
| `cru` | 1+ | nada (átomo) | `linhas` (o texto como estava) | as linhas, como estavam |

Todo nó ainda guarda a **fonte** (`fonte`: as linhas exatas de onde veio), que é como as promessas I1
e I2 se cumprem (seção 5.4). O documento vazio é uma `linha` vazia.

O papel de cada linha no contexto (a `linha` recuada embaixo de um item é a descrição dele; o item
recuado é de dentro; o número que aparece) **não é guardado no nó**: é lido do texto pelo próprio
`parseRich`, a cada mudança de estrutura, e vira decoração (classes e números na tela, seção 5.6). Assim a tela
nunca discorda da leitura: as duas perguntam ao mesmo parser.

Por que não o modelo de árvore (lista › item › parágrafo) dos exemplos do ProseMirror: o texto do Murall
não é uma árvore, é uma lista de linhas com recuo, e uma árvore teria de ser achatada de volta a cada
tecla, com mil casos de "esse recuo vira o quê". No modelo plano, Enter divide uma linha, Backspace
junta duas, Tab muda um número, e a tradução é uma linha por vez.

### 5.2 As marcas na linha

| Marca do ProseMirror | No texto | Regras |
| --- | --- | --- |
| `negrito` | `**…**` | inclusiva (o que se escreve na ponta continua em negrito, como no Docs) |
| `italico` | `*…*` (ou `_…_` quando o `*` não fecha ali) | inclusiva |
| `riscado` | `~~…~~` | inclusiva |
| `marca` | `==…==` | inclusiva |
| `spoiler` | `\|\|…\|\|` | inclusiva; na tela, uma tarja translúcida listrada com o texto legível (seção 5.15) |
| `sutil` | `((…))` | inclusiva |
| `codigo` | `` `…` `` (com mais crases se o texto tiver crase) | inclusiva desde a rodada 2 (não inclusiva, só a primeira letra depois do Ctrl+E virava código; ver a seção 12); exclui os links; aceita negrito, itálico, riscado, marca, spoiler e sutil por fora (como `parseInline`) |
| `link` | `[texto](endereço)`, `<endereço>` ou o endereço solto | atributo `href` (só `https:`, `http:`, `mailto:`); não inclusiva; as outras marcas valem no link inteiro (o rótulo do markdown não lê marca dentro) |
| `elo` (link de anotação) | `[[título]]` ou `[[título\|texto]]` | atributo `titulo`; o texto é o rótulo; não inclusiva; marcas no elo inteiro |

Os símbolos (`->`, `<=>`, `!=`…) não são marca: o texto do nó já é o que aparece (→, ⇔, ≠), porque
`parseInline` devolve o texto com os símbolos. A seção 5.4 diz como cada um volta para o texto.

### 5.2.1 O que não cabe numa linha e como a tela evita

- O rótulo de um link para fora não pode ter `[` nem `]` (o leitor não aceita, nem escapado): o
  colchete digitado dentro do link **sai do link** (fica fora dele, na tela também). É o que a régua já
  faz ao colar um endereço com o texto selecionado (`onPaste` tira os colchetes).
- O título de um link de anotação não pode ter `[`, `]` nem quebra de linha, e um `|` o divide em
  título e rótulo. Uma anotação com esses sinais no nome não pode ser apontada (como hoje no Markdown):
  a lista do "[[" mostra o aviso em vez de pôr um link quebrado.
- Uma marca que só cobre espaços não existe (o leitor pede uma letra dentro): some na hora.
- Marca parcial num link (negrito em metade do texto dele): vale no link inteiro, na hora.

Essas quatro são aplicadas na tela por um plugin (`appendTransaction`), fora da composição de acentos
(seção 5.20), para a tela sempre mostrar o que vai ser guardado (I3).

### 5.3 Ler: do texto para o documento

Um arquivo novo, `core/rich-doc.ts`, sem nada do ProseMirror dentro (testável sozinho, como o
`rich-text.ts`): `textToLines(text)` devolve a lista das linhas tipadas (o modelo de 5.1, em objetos
simples), e o lado do ProseMirror (`ui/visual-editor/schema.ts`) só converte esses objetos em nós.

- Reaproveita o que existe: `linesOf`, `lineKind`, `parseInline`, `parseWidgetLine`, `startsTable`,
  `tableCells`, `alignOf`, `tableLookOf`, `fenceOf`, `closes`, `indentOf` e `dedent` (que hoje são privados em `rich-text.ts` e
  passam a ser exportados, sem mudar o que fazem). Nenhuma regra do leitor é copiada: copiar é o jeito
  de os dois discordarem.
- A linha de texto (`p`) guarda o recuo à parte (colunas, com o tab valendo até a próxima parada de 4)
  e o resto em `parseInline`. O título, a citação, o sutil e o item, a parte depois da marca deles.
- O bloco de código vai da cerca até a que fecha (ou até o fim, sem fecho: atributo `aberto`); a tabela,
  da marca do jeito (se tiver) até a última linha dela; o widget, a linha dele.
- Cada nó leva a `fonte`.
- O que não dá para representar vira `cru` (5.5).

### 5.4 Escrever: do documento para o texto

`linesToText(lines)` em `core/rich-doc.ts`, em três camadas:

1. **A fonte guardada.** Se o nó, lido da `fonte` dele, dá exatamente o mesmo nó de agora (mesmo tipo,
   mesmos atributos, mesmas letras, mesmas marcas), sai a `fonte`, byte a byte. É o que
   mantém `__x__`, `* item`, `1)`, `[X]`, `####`, os espaços do fim e os escapes de quem escreveu à mão.
   Os nós do ProseMirror são imutáveis e compartilhados entre os estados, então o texto de cada nó fica
   num `WeakMap` (nó → texto): por tecla, só a linha mexida é escrita de novo.
2. **A forma de sempre** para a linha mexida: as marcas de bloco da tabela de 5.1, as de linha de 5.2,
   numa ordem fixa de abrir e fechar (a marca que dura mais abre primeiro; ao mudar de marca no meio,
   fecha as de dentro e reabre), o espaço da ponta saindo de dentro da marca (`**x **` não fecha no
   leitor; vira `**x** `), o código com crases a mais quando o texto tem crase, o link pelo jeito mais
   curto que o leitor lê igual (`<endereço>` ou solto quando o texto é o próprio endereço).
3. **A trava.** A linha escrita é lida de volta (`parseInline` na linha; `parseRich` nas linhas
   vizinhas, porque uma linha muda a de baixo: uma linha de traços embaixo de uma com `|` vira tabela,
   um recuo vira corpo de item). Se o que volta não é o nó:
   - tenta o itálico com `_` no lugar de `*` (o `*` que fecha não pode estar colado em outro `*`);
   - escapa, com a barra, os sinais do trecho de letras que o leitor leu como marca (`*`, `_`, `~`,
     `=`, `|`, `(`, `)`, `` ` ``, `[`, `]`, `<`, `>`, `!`, `{`, `\`, `:` do `https:`, `.` do `www.` e
     dos números de lista, `#`, `-`, `+` no começo da linha), um trecho de cada vez, só onde precisa;
   - os símbolos: a pessoa que desfez o autocorreto (seção 5.10) tem `->` de propósito no nó; ele sai
     `-\>` (o leitor não troca por →). O → digitado ou colado sai como →.
   - se nada servir (o caso provável: itálico de uma letra colado a um negrito no meio de uma palavra,
     como `x*a*`+`**b**`+`y`; o fuzz da rodada 1 diz quais são de verdade), a
     tela se ajusta ao que o leitor lê da melhor tentativa, e o caso entra numa lista de casos sabidos
     nos testes. A pessoa vê na hora o que vai ficar (I3); nada é escondido.

Escapar só o que precisa é a diferença entre um markdown limpo e um cheio de barras: a frase "Isso
(muito) bom!" sai como foi escrita, porque o leitor não lê marca nela.

Outros cuidados da escrita:

- **A linha que viraria bloco** (um texto que começa com `# `, `- `, `1. `, `> `, `-# `, `---`, ` ``` `,
  `{{contador: …}}`, uma linha de traços embaixo de uma com `|`, ou uma linha com `|` logo embaixo de
  uma tabela, que o leitor lê como mais uma fileira) sai com a barra no primeiro sinal (`\#`, `\-`,
  `1\.`, `\>`, `\{{`, `\|`). A trava acha esses casos sozinha; os testes listam cada um.
- **O nome de widget que este site não conhece** não é escapado: para o leitor daqui é texto, e um
  site mais novo vai querer ler o widget.
- **A numeração.** O item novo ganha o número de `nextNumber`, e os de baixo descem por `renumberAfter`,
  exatamente como o Enter do Markdown faz hoje. Os outros números ficam como estavam (I2).
- **O recuo.** Item de dentro: o recuo do de cima mais 2 (o Tab do Markdown vai de 2 em 2). Descrição de
  um item: a coluna do texto dele (o `bodyIndent`, como o Shift+Enter de hoje). Linha vazia: `""`.
- **A tabela** sai por `writeTable` (que já escapa o `|` das células), com as células escritas pelo
  passo 2, e a marca do jeito em cima quando não é a branca. As células de sobra que estavam escritas
  além do cabeçalho (o leitor esconde) voltam do atributo `sobra`.
- **O widget** sai pela `fonte` enquanto não for mexido; mexido (pela folha ou pela legenda escrita
  direto), por `widgetLines`, como hoje.
- **O bloco de código** escolhe uma cerca maior que qualquer fila de crases (ou tis) de dentro; o que
  estava sem fecho no fim do texto ganha o fecho só se for mexido.

### 5.5 O que o Visual não sabe mostrar: o trecho cru

Algumas linhas podem não virar nó editável sem risco de mudar o que significam. Não há um caso
conhecido certo hoje; os candidatos são as linhas que a trava não consegue escrever de volta iguais (o
fuzz e o script das notas reais acham) e o recuo misturado de tab e espaço num corpo de item, que só
faz sentido com a conta exata de colunas. Essas linhas viram um nó `cru`:

- Na tela, ele aparece **como a leitura o mostra** (um `app-rich-text` com as linhas dele), com uma
  borda tracejada discreta e, no foco, a etiqueta "Este trecho só se muda no Markdown" com o botão
  "Mudar no Markdown" (troca de aba com o cursor nele).
- Ele é escrito de volta exatamente como estava.
- Ele também é o que deixa o Visual chegar por partes: enquanto um tipo de linha ainda não tem nó (as
  listas antes da rodada 4, a tabela antes da 6), ele aparece como cru, guardado intacto.
- A rodada 1 tem um script (`scripts/visual-ida-e-volta.mjs`) que roda o tradutor em todas as notas de
  um backup (o arquivo baixado em Ajustes › Backup, na máquina do usuário, nunca no repositório) e diz
  quantas linhas viram cru e por quê. A meta é zero nas notas reais; o cru é a rede de segurança.

### 5.6 O desenho na tela: igual à leitura

- **Os mesmos estilos.** O desenho da leitura mora hoje no estilo do `ui/rich-text.ts` (com o encapsulamento
  do Angular, que não alcança o DOM do ProseMirror). Ele vai para um parcial, `ui/_formatado.scss`,
  usado pelos dois: a leitura (com as classes de hoje) e o Visual (os mesmos nomes de classe dentro de
  `.folha-visual`, num componente sem encapsulamento e com prefixo, para não vazar, como aprendido com
  o `.nota` do Feed que pintava a anotação). A leitura não pode mudar nem um pixel: os testes de olhar
  da leitura (e as fotos de perto) conferem.
- **A pauta.** Cada linha ocupa uma linha da pauta (`--line`); o título, a tabela (uma fileira por
  linha), o widget (a altura do tamanho dele, `WIDGET_LINES`) e o código ocupam múltiplos dela, como
  na leitura. O `white-space: pre-wrap` mantém os espaços.
- **O recuo do parágrafo** (`text-indent` da primeira linha) igual à leitura.
- **Números, níveis e corpo por decoração.** Um plugin escreve o texto (o `WeakMap` torna isso
  barato), roda o `parseRich` e põe nas linhas as classes e os dados que a leitura usaria: o número do
  item (`data-n`, `data-pre`), o nível, "corpo de item", "tarefa feita" (risca o corpo junto). O número
  desenhado é o mesmo da leitura. Ele roda na própria transação (sem um quadro com o número errado
  depois de um Enter), mas só quando a **estrutura** muda (um nó entra, sai ou muda de tipo, de recuo,
  de número ou de feita) ou quando uma linha passa de vazia a escrita ou o contrário (a linha em branco
  entre duas descrições deixa o corpo continuar; escrita sem recuo, ela o corta). As outras letras
  digitadas não mudam a estrutura, porque a escrita escapa o que o leitor leria como bloco (5.4).
- **Tarefas.** A caixinha é um pedaço não editável da linha, que marca e desmarca com um toque (o mesmo
  desenho de `.caixa`). As feitas não se dobram no editor ("N tarefas feitas" é da leitura).
- **O placeholder** de cada editor ("Escreva o que quiser…") aparece como na `<textarea>`.

### 5.7 As abas, a opção nos Ajustes e a troca de modo

- **As abas.** "Escrever" e "Ver como fica" dão lugar a **"Visual"** e **"Markdown"**, sempre nessa
  ordem, com os mesmos papéis de tab do ARIA e as mesmas setas de hoje (`onTabKey`). A "Ajuda" e a
  "Tela cheia" ficam onde estão. No celular, só os desenhos (um documento e um `#`), como hoje.
  O "Ver como fica" sai (decisão P1): o Visual já é ele, editável, e a ficha ao lado da edição já
  mostra a cara final.
- **A opção.** Ajustes › Mural, uma linha nova "Jeito de escrever", com o seletor de recortes dos
  outros ajustes: "Visual (como no Docs)" e "Markdown (as marcas à vista)". Ela escolhe qual aba abre
  quando um editor aparece, em todo lugar que tem o texto com formatação (a anotação, a resenha, o
  comentário, o "Sobre mim"). Trocar de aba no editor vale só para aquele editor enquanto ele estiver
  aberto (como no Docs, a preferência não muda por um clique). Mora em `Settings` (o `Stored` de
  `core/settings.ts`), entra no "Voltar ao padrão" (`PREFERENCE_DEFAULTS`) e no `reload` de outra aba.
  Vale por aparelho, como o Desempenho, sem sincronizar (decisão P3). Para quem nunca escolheu, abre
  o Markdown enquanto o Visual está "em teste" e o Visual a partir da rodada 9 (decisão P2).
- **A troca de modo com o cursor.** Do Visual para o Markdown: o nó do cursor dá a linha do texto (o
  tradutor sabe onde cada nó começa), e a posição dentro da linha vem do mapa letra-a-letra que a
  escrita produz (cada letra da tela sabe em que posição do texto caiu). Do Markdown para o Visual: a
  linha do `selectionStart` dá o nó, e a posição dentro dela sai de alinhar o texto escrito com as
  letras da tela (as letras aparecem na mesma ordem, com marcas e barras no meio; os símbolos contam
  como um). A seleção (não só o cursor) vai junto, pelas duas pontas.
- **Um atalho para trocar**, a escolher na rodada 2, que não brigue com o Chrome, o Edge, o Firefox, o
  AltGr do teclado ABNT2 nem com o Ctrl+Enter do comentário.
- **Carregamento.** O Visual vem num `@defer`. Enquanto o pedaço chega (a primeira vez), a folha mostra
  o texto pela leitura (`app-rich-text`), no mesmo tamanho, para não pular.

### 5.8 A régua no Visual

A régua é a mesma (`rich-editor.ts`), e o que cada botão faz passa a ter dois caminhos: o de hoje, no
`<textarea>`, e um comando do ProseMirror. Para não espalhar `if (visual)` pelo arquivo (que já tem 3.371
linhas e o estilo no limite do orçamento), o Visual é um componente à parte (`ui/visual-editor/visual-editor.ts`) que
recebe as ações (`run(action)`) e devolve o estado (`marks`, `lineStyle`, `inTable`, `canUndo`).

- **Botões acesos.** Negrito, itálico, riscado, marca-texto e as listas ganham `aria-pressed` e o
  desenho de ligado quando a marca vale na seleção (ou nas marcas guardadas para a próxima letra).
- **Formatar › Parágrafo** marca o estilo da linha do cursor (o `lineStyle` de hoje, agora vindo do nó).
  Escolher um estilo troca o tipo das linhas da seleção.
- **Inserir** igual: link para endereço, link para anotação, divisória, os widgets.
- **O menu "Tabela"** aparece na régua enquanto o cursor está numa tabela (seção 5.14).
- **Desfazer e Refazer** chamam o histórico do ProseMirror.
- **"Linha dentro do item"** (o Shift+Enter) igual.
- **A Ajuda** (`ui/markup-guide.ts`) ganha o modo: no Visual, lista os atalhos de teclado e os atalhos
  de digitação (seção 5.10), e diz, no fim, "No Markdown, as marcas aparecem como texto: veja a aba
  Markdown". No Markdown, a de hoje.

### 5.9 O teclado

| Tecla | Onde | O que faz |
| --- | --- | --- |
| Enter | texto, título, sutil | linha nova; do título e do sutil, a nova sai como texto (o Markdown de hoje não continua o `-# `) |
| Enter | no começo de uma linha com texto | linha vazia em cima, o cursor fica no texto (como no Docs); no item, um item vazio em cima, como o Markdown faz hoje |
| Enter | item com texto | item novo do mesmo tipo (a tarefa nova por fazer; o número seguinte, os de baixo descem); no fim de um item com descrição, o novo vem depois dela (`itemEnd`) |
| Enter | item vazio | a lista acaba ali: a linha vira texto, como hoje |
| Enter | descrição de um item | o próximo item (como hoje, `itemAfterBody`) |
| Enter | citação | outra linha de citação; na citação vazia, a citação acaba |
| Enter | código | quebra de linha dentro; numa linha vazia no fim do bloco, sai dele (a linha vazia sai junto) |
| Enter | célula | a célula de baixo; na última fileira, uma fileira nova (como a folha da tabela) |
| Enter | widget selecionado | linha nova embaixo dele |
| Shift+Enter | item ou descrição | linha dentro do item (no recuo do texto dele) |
| Shift+Enter | célula | a célula de cima |
| Shift+Enter | outros | o mesmo que Enter |
| Backspace | começo de item | primeiro tira o marcador (fica texto no mesmo recuo); de novo, sai um nível; sem recuo, junta com a de cima |
| Backspace | começo de título, citação, sutil | vira texto |
| Backspace | começo de linha, a de cima é widget, tabela ou divisória | seleciona a peça de cima (de novo, apaga), como no Docs |
| Backspace | logo depois de um atalho de digitação | desfaz o atalho (o "- " volta a ser traço) |
| Delete | fim de linha | junta com a de baixo (a peça de baixo: seleciona) |
| Tab / Shift+Tab | item, descrição, linhas selecionadas | um nível para dentro / para fora (2 colunas, sempre em número par, como o Tab do Markdown) |
| Tab / Shift+Tab | célula | a próxima / a anterior; Tab na última cria a fileira |
| Tab | texto solto | um nível para dentro (a leitura mostra o recuo; embaixo de um item, vira descrição dele, e a tela mostra isso) |
| Shift+Tab | sem recuo | o de sempre do navegador: o foco sai da folha (o caminho do teclado para fora dela) |
| Ctrl+B, Ctrl+I, Ctrl+E, Ctrl+Shift+X, Ctrl+Shift+H | seleção ou cursor | negrito, itálico, código, riscado, marca-texto (liga e desliga) |
| Ctrl+K | seleção ou link | o painel do link (com o link de agora, para trocar) |
| Ctrl+Shift+7, 8, 9 | linhas | numerada, lista, tarefas (pelo `e.code`, como hoje) |
| Ctrl+Alt+Enter | tarefa | marca ou desmarca (a conferir colisões; o Ctrl+Enter é do comentário) |
| Ctrl+/ | qualquer lugar | a Ajuda |
| Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z | qualquer lugar | o histórico do ProseMirror |
| Setas | perto de widget, tabela, divisória | o cursor de lacuna (`gapcursor`): dá para parar antes e depois de uma peça, mesmo no começo e no fim do texto; setas do lado numa peça a selecionam |
| Setas | tabela | andam de célula (o `prosemirror-tables`) |
| Esc | painel, lista do "[[", menu aberto | fecha só ele; sem nada aberto, passa adiante (o editor da ficha fecha, como hoje) |

O mapa de teclas é nosso, escrito tecla por tecla: o `baseKeymap` do ProseMirror não entra inteiro,
porque ele usa o Ctrl+Enter (sair do bloco de código), que no comentário é "Enviar". Tecla que o
Visual não usa passa adiante (o Ctrl+Enter chega ao comentário, o Esc ao editor da ficha).

### 5.10 Atalhos de digitação (o "autoformatar" do Docs)

O Docs transforma "1. " numa lista e "->" numa seta; o Notion faz mais. Para o Visual (cada um desfaz
com Ctrl+Z ou com o Backspace logo depois, e então fica o que foi digitado, escapado no texto):

| Digitado no começo da linha | Vira |
| --- | --- |
| `- `, `* `, `+ ` | item de lista |
| `1. ` (qualquer número) e `1.1. ` | item numerado |
| `[] `, `[ ] `, `- [ ] ` | tarefa |
| `# `, `## `, `### ` | título 1, 2, 3 |
| `> ` | citação |
| `-# ` | texto sutil |
| ` ``` ` e Enter | bloco de código |
| `---` e Enter | divisória |

No meio da linha: as setas e os sinais (`->` → →, `<=` → ≤…, a mesma lista de `SYMBOLS`), na hora em
que o último sinal entra; um endereço (`https://…`, `www.…`) vira link no espaço ou no Enter; "[[" abre
a lista das anotações (como hoje).

**Não** viram formatação, no Visual, as marcas de linha digitadas (`**x**`, `*x*`, `~~x~~`): o pedido
é que o que se escreve seja lido como texto, não como markdown. Decidido na P4 (o Notion faz, mas aqui não).

### 5.11 Links

- **Para um endereço.** Ctrl+K ou a régua: o painel de hoje (Texto e Endereço), que no Visual põe ou
  troca a marca `link`. O endereço passa por `normalizeUrl` (o "https://" que faltou); espaços viram
  `%20`; o que não for `https:`, `http:` ou `mailto:` não vira link.
- **Clique num link** (sem Ctrl): o painel passivo de hoje, com o endereço, "Trocar", "Tirar o link" e
  "Abrir" (nova aba). Ctrl+clique abre direto. Tirar o link de um endereço solto deixa o texto: ele sai
  escapado (`https\://…`), para não voltar a ser link na leitura.
- **Para outra anotação.** "[[" ou a régua: a lista e o painel de hoje. O link aparece com a caneta azul
  da leitura e, tracejado, o que aponta para uma anotação que não existe. Escrever dentro do texto do
  link muda o rótulo (o texto sai `[[Título|rótulo]]`), como mudar o texto de um link no Docs.
- **Colar um endereço com texto selecionado** vira o link do texto (como hoje).

### 5.12 Listas e tarefas

- Os três tipos (lista, numerada, tarefas), o `1.1.`, a descrição de várias linhas embaixo do item, o
  widget, a tabela e o código dentro do item: tudo pelo recuo, como no texto (5.1).
- A régua (e Ctrl+Shift+7/8/9) nas linhas selecionadas: todas já do tipo voltam a ser texto; senão viram
  do tipo, contando a numerada a partir da primeira (a mesma regra de `list()`).
- Mudar o tipo de uma lista que tem descrições: as descrições ficam (são do item pelo recuo).
- Marcar uma tarefa feita risca a descrição junto (como a leitura).
- O recuo que vira descrição por acaso (Tab num texto embaixo de um item) é o que a leitura faria: a tela
  mostra assim, na hora.

### 5.13 Widgets

- **A peça.** O nó `widget` é desenhado pelo `app-note-widget` de sempre, criado à mão dentro do
  ProseMirror (`createComponent` com o injetor do editor, `ApplicationRef.attachView`, as entradas por
  `setInput`). O nó não é editável por dentro (é um átomo): um toque o seleciona inteiro.
- **A tirinha** de hoje aparece com o widget selecionado: o nome, o resumo (`widgetSummary`), "Tirar" e
  "Editar". Delete e Backspace com ele selecionado o tiram (Ctrl+Z volta). Enter abre uma linha embaixo.
- **Editar** abre a folha do widget de sempre (`ui/widget-sheet.ts`), com os valores do nó; ao fechar,
  o editor troca o nó (o mesmo esquema do `widgetOrder` de hoje: com a folha modal aberta, o ProseMirror
  não recebe nada).
- **Inserir › um widget**: a folha; ao pôr, o nó entra numa linha só dele: no lugar de uma linha vazia,
  ou logo depois da linha do cursor; dentro de um item, com o recuo da descrição (as regras de
  `writeWidget`).
- **Escrever direto na peça** (o pedido das "descrições"): a legenda da imagem e do vídeo (`caption`
  de `readMedia`), o título do contador (`readCountdown`) e o título do áudio (`readAudio`). Dentro da
  peça, o lugar do texto vira um campo de uma linha, com a letra da peça, que o ProseMirror não toca
  (`stopEvent` e `ignoreMutation` para ele). Clicar nele escreve; Enter ou sair dele grava (uma
  mudança no histórico); Esc volta ao que estava. Sem legenda, a peça selecionada mostra o lugar dela
  ("Escreva uma legenda"); fora da seleção, a peça é igual à da leitura. Para isso, os componentes das
  peças (`GluedMedia`, `Countdown`, `AudioTrack`) ganham uma entrada `editavel` que troca o texto pelo
  campo com a mesma letra e o mesmo lugar; sem ela, nada muda neles (a aparência aprovada fica
  congelada, com teste). O que a marca do widget
  não aceita: a quebra de linha não entra; o `|` vai escapado (`escapeArg`); o `}}` vira `} }` (aviso
  miúdo embaixo do campo quando acontece). O limite é o `max` do campo no registro.
- **A peça não se recria a cada tecla.** O `update()` da peça só troca as entradas quando a linha dela
  mudou; o vídeo que está tocando continua tocando enquanto se escreve em outra linha.
- **Tocar o vídeo e o áudio** dentro do editor funciona (os cliques nos controles não selecionam a peça).
- **Arrastar** uma peça para outro lugar: o ProseMirror deixa; soltar no meio de uma linha põe a peça
  numa linha só dela, embaixo daquela.
- **Imagem colada ou solta** (`putImage`): enquanto ela é encolhida e guardada, um marcador "Guardando
  a imagem…" fica no lugar (uma decoração que anda com as mudanças, como no exemplo de envio do
  ProseMirror); pronta, vira o nó. Se a pessoa apagar o trecho onde ela ia, ela entra onde o cursor
  estiver. A imagem de outra pessoa (`adoptImages`) troca o id dentro do nó.
- **A Nota colada** (o widget `nota`) e o widget de um nome desconhecido: o primeiro é peça como os
  outros; o segundo é texto (como a leitura mostra).

### 5.14 A tabela direto na folha

- **O nó.** `tabela` › `fileira` › `cabeca` (só na primeira) e `celula`, cada célula com letras e marcas,
  sem quebra de linha. Com o `prosemirror-tables` (a seleção de várias células, Tab entre elas, as
  setas, o colar de células, o conserto de tabela torta), sem célula mesclada: o esquema não oferece,
  e o que chegar mesclado (colado) é desfeito em células repetidas vazias.
- **O jeito, o alinhamento e o tamanho** ficam no nó (`jeito`, `alinhar[]`); o limite de 12 colunas e
  200 fileiras (`MAX_TABLE_COLS`, `MAX_TABLE_ROWS`) vale aqui também.
- **O menu "Tabela"** na régua, enquanto o cursor está nela: Fileira em cima, Fileira embaixo, Coluna
  antes, Coluna depois, Mover (fileira e coluna, como a grade), Alinhar (início, meio, fim), o Jeito
  (as cinco miniaturas da folha), Tirar a fileira, Tirar a coluna, Tirar a tabela, e "Abrir na folha"
  (a folha da tabela de hoje, para quem prefere).
- **Enter** desce, **Shift+Enter** sobe; colar várias linhas numa célula: com tab (de planilha),
  espalha a partir da célula (o `pastedGrid` de hoje); sem tab, as linhas se juntam com espaço.
- **Negrito numa seleção de células** vale em todas.
- **Inserir › Tabela** no Visual põe a tabela 3×2 direto na folha, com o cursor na primeira célula (sem
  abrir a folha). A folha continua no "Abrir na folha" e no "Editar" da tirinha.
- **No celular** a tabela rola de lado dentro da folha (como a leitura), e a célula do cursor entra
  na tela.

### 5.15 Código, citação, sutil, spoiler, títulos, divisória

- **Bloco de código**: letra de máquina, sem marcas, as quebras de linha dentro; Tab dentro do bloco põe
  dois espaços (não muda o nível); Ctrl+E numa linha vazia ou com várias linhas selecionadas cria o
  bloco (como o `code()` de hoje).
- **Citação**: a barra da leitura do lado; as linhas seguidas se juntam no desenho.
- **Sutil** (a linha `-# ` e o `((trecho))`): menor e mais claro, como a leitura.
- **Spoiler**: na leitura, uma tarja preta que esconde. Na escrita a pessoa precisa ler o que escreve:
  uma tarja translúcida com listras pretas finas por cima do texto legível, e a palavra "spoiler"
  no `title`. O leitor de tela diz "spoiler" antes do trecho.
- **Títulos**: três níveis com a cara da leitura; o `####` a `######` aparece como o 3, e continua
  `####` enquanto a linha não for mexida.
- **Divisória**: o fio da leitura, selecionável como uma peça.

### 5.16 Colar, copiar e arrastar

**Colar no Visual**, nesta ordem:

1. O tipo próprio do Murall (`text/x-murall-markdown`, que o Visual e o Markdown põem ao copiar): é
   lido como markdown, com tudo (widgets, tabelas, marcas).
2. Uma imagem sem texto junto: a imagem colada (5.13), como hoje.
3. HTML (do Docs, do Word, de um site, do e-mail): traduzido para o que o Murall tem, e só isso:
   negrito (`<b>`, `<strong>`, `font-weight` 600+), itálico, riscado, marca-texto (`<mark>` e o
   realce do Docs), código (`<code>`, fonte de máquina), link (`https`/`mailto`), títulos (h4–h6 como o
   3), listas e as listas de tarefas do Docs, citação, `<pre>`, `<hr>`, tabela (a primeira fileira é o
   cabeçalho; célula mesclada desfeita; o que tem bloco dentro da célula vira uma linha só). Tudo o
   resto (fonte, cor, tamanho, `div`, `span` sem sentido) vira só letras. Os casos sabidos:
   - o Docs embrulha tudo num `<b style="font-weight:normal" id="docs-internal-guid-…">`: **não** é
     negrito;
   - o Word manda listas como parágrafos com `mso-list` e um "·" na frente: viram itens;
   - imagem `<img>` com `https:` vira o widget de imagem pelo link; com `data:`, a imagem guardada
     como colada (com o encolher e os limites); `file:`/`cid:` (do Word) não vem, e um aviso diz
     "1 imagem não veio: cole ela sozinha".
4. Texto puro com tab em várias linhas (planilha): fora de uma tabela, uma tabela nova, como o Docs
   faz; dentro de uma, espalha a partir da célula (5.14).
5. Texto puro: lido como markdown do Murall (é o que vem de uma nota antiga, de uma AI, do Markdown
   de outro aparelho). **Ctrl+Shift+V** cola como letras, sem ler nada (decisão P5).

Colar um endereço com texto selecionado: o link (5.11). Colar com o limite de caracteres perto: 5.18.

**Copiar do Visual** põe três coisas na área de transferência:

- `text/plain`: o texto limpo, como a cópia que já existe (`copyText`: sem as marcas, os widgets como
  "{imagem: https://…}"), para o WhatsApp, o e-mail, o bloco de notas;
- `text/html`: o trecho formatado, para o Docs, o Word e o e-mail com formatação;
- `text/x-murall-markdown`: o markdown do trecho, para colar noutra nota do Murall (no Visual ou no
  Markdown) sem perder nada. O Markdown também passa a pôr esse tipo ao copiar e a lê-lo ao colar.

**Arrastar** texto dentro da folha move com a formatação; arrastar um arquivo de imagem é a imagem
solta (como hoje); outro arquivo não abre por cima do Murall (como hoje).

### 5.17 Desfazer e refazer

- O histórico do ProseMirror (`prosemirror-history`), com os grupos de digitação de meio segundo, e
  cada ação da régua, cada atalho de digitação e cada colar como um passo.
- **Trocar de modo.** Enquanto o Visual está aberto, a `<textarea>` (escondida) não acompanha cada
  tecla: o `[value]` dela fica no texto de quando ela saiu (pôr o valor por fora apagaria o desfazer do
  navegador). Ida para o Markdown: ela aparece, recebe o foco e o trecho que mudou entra por um
  `insertText` (o `replaceAll` de hoje; numa `<textarea>` escondida o `insertText` falha, por isso
  depois de aparecer), então um Ctrl+Z no Markdown desfaz o que o Visual fez de uma vez, e o que se
  fez no Markdown antes continua no desfazer. Volta para o Visual: se o texto não mudou desde a saída,
  volta o mesmo estado do ProseMirror (com o histórico); se mudou, um estado novo, sem histórico. O histórico de um modo não passa para o
  outro (seria mentir sobre o que cada passo fez).
- **Mudanças de fora** (5.19) entram sem ir para o histórico (`addToHistory: false`): o Ctrl+Z desfaz só
  o que a pessoa fez, e o ProseMirror acerta o resto.

### 5.18 O limite de caracteres

- O limite é da string guardada (20.000 na ficha), não do que aparece. Um filtro de transação recusa a
  mudança que passaria do limite (a digitação simplesmente para, como a `maxlength` do `<textarea>`), e
  um aviso diz uma vez "Chegou no limite de 20.000 caracteres".
- **Colar além do limite**: entra o que cabe, por linhas inteiras, com o aviso "Parte do que foi colado
  não coube". Nunca corta uma marca ao meio.
- **Durante a composição** (um acento, o teclado do celular) o filtro não recusa nada: recusar ali
  desencontra o que o navegador mostra do documento. Passou do limite compondo, o excesso sai no
  `compositionend`, com o mesmo aviso.
- O contador embaixo da folha continua contando a string guardada; no Visual, o `title` dele diz "conta
  também as marcas que o Markdown guarda (o negrito são 4 a mais)".

### 5.19 O texto mudou por fora enquanto se escreve

O `value` pode mudar sem a pessoa digitar: a colega na anotação compartilhada, outro aparelho, um pedido
da AI pela API (`acrescentar_na_nota`, `marcar_tarefas`), uma tarefa marcada pela ficha do mural, o
editor abrindo outra ficha (`reset`).

- O editor lembra o último texto que ele mesmo escreveu. Chegou outro: as linhas dos dois são
  comparadas (o `commonPairs` de `core/merge3.ts`), e só os nós das linhas mudadas são trocados, numa
  transação fora do histórico. O cursor e a seleção andam com a transação (o ProseMirror mapeia), então
  ninguém perde o lugar.
- Outra ficha (outro id): um estado novo, histórico vazio.
- A linha que a pessoa está escrevendo agora e que também mudou por fora: quem resolve é a junção das
  compartilhadas, como hoje (o editor mostra o que chegou; a folha de conflito continua sendo a de hoje,
  que mostra markdown: fica de fora deste plano, seção 8).

### 5.20 Celular

- **O teclado do sistema** (acentos, sugestões, ditado, o Gboard e o teclado da Samsung no Android, o do
  iPhone): o ProseMirror trata a composição. O nosso cuidado é **não mexer no documento durante a
  composição** (os ajustes de 5.2.1, as decorações e os atalhos de digitação esperam o
  `compositionend`).
- **A régua presa em cima do teclado** (`DOCK_MEDIA`, `watchVisualViewport`, o "Pronto") igual. O
  `pointerdown` da régua já evita perder a seleção; conferir no Safari do iPhone, onde o
  `contenteditable` perde a seleção com mais facilidade.
- **O cursor nunca atrás da régua**: o ProseMirror rola até o cursor com uma margem (`scrollMargin`)
  do tamanho da régua presa mais uma linha.
- **Zoom do iPhone ao tocar num campo** com letra menor que 16 px: a folha do Visual tem no mínimo
  16 px no iPhone (a leitura já é maior que isso; conferir na peça do sutil e na tabela).
- **Peças não editáveis** (widget, caixinha, divisória) confundem o cursor do iPhone: o cursor de lacuna
  e linhas de respiro antes e depois na tela (não no texto) ajudam; testar num aparelho de verdade.
- **O menu do sistema** (copiar, colar, selecionar tudo) no lugar certo: conferir.
- **O teste em aparelho de verdade** é obrigatório nas rodadas 0, 2, 4 e 9 (o editor do celular de
  outubro nunca foi conferido num aparelho: aqui não dá para pular). Precisa do usuário com o celular
  dele: o site de desenvolvimento aberto pela rede local, ou um deploy de teste.

### 5.21 Tela cheia, a prévia que segue o cursor, o foco de fora

- **Tela cheia**: o editor grande nasce com o mesmo `EditorState` do pequeno (o estado é imutável e
  serve para outra vista), com o histórico junto; o pequeno é destruído enquanto o grande existe, e
  volta com o estado do grande ao sair. As peças são criadas de novo (a imagem já está guardada; o vídeo
  recarrega).
- **A prévia da ficha que segue o cursor** (`review-editor.ts`): hoje ela lê o `<textarea>`. O
  `RichEditor` passa a dar um sinal `caret` (a linha do texto e a fração dela), vindo do `<textarea>` ou
  do Visual, e o `review-editor` usa esse sinal no lugar do `caretArea`.
- **`focus()`** (o "Falta…" do editor, o Enter no nome da ficha) e **`reset()`** valem nos dois modos.

### 5.22 Acessibilidade

- A folha é `role="textbox"`, `aria-multiline="true"`, com o nome (`aria-label` ou o rótulo de fora,
  como o `areaId` de hoje) e o `aria-describedby` do contador.
- Os botões da régua dizem se estão ligados (`aria-pressed`); o estilo da linha do cursor está no
  "Formatar" (`menuitemradio` marcado, como hoje).
- A caixinha da tarefa tem `role="checkbox"` e `aria-checked`; o atalho de 5.9 marca pelo teclado.
- O widget tem nome ("Widget: Contador, Lançamento do GTA VI"); selecionado, Enter abre "Editar".
- A tabela é uma `<table>` de verdade, com o cabeçalho em `<th scope="col">`.
- O Tab nunca prende: Shift+Tab numa linha sem recuo sai da folha (como hoje).
- O corretor do navegador vale (`spellcheck` e a língua da página na folha), e o teclado do celular
  começa as frases com maiúscula (`autocapitalize="sentences"`); conferir que se comporta como na
  `<textarea>` de hoje.
- O spoiler na escrita tem contraste suficiente nas listras (conferir com o Impeccable).

### 5.23 Peso e desempenho

- **O pedaço do Visual** (ProseMirror + `prosemirror-tables` + o nosso) vem num `@defer`/`import()`: o
  carregamento inicial não cresce. A medida entra na rodada 0 (estimativa: 100–150 KB comprimidos).
- **O estilo**: o parcial da leitura entra no componente do Visual; se passar dos 24 kB do orçamento por
  componente, a parte da pauta e das listas vira uma folha de estilo carregada junto do pedaço.
- **Por tecla**: o ProseMirror só redesenha os nós mudados; a escrita usa o `WeakMap` (só a linha
  mexida); o `parseRich` das decorações só roda quando a estrutura muda (5.6). Um texto de 20 mil caracteres
  com 50 widgets e uma tabela de 200 fileiras é o caso de medida (rodada 8).
- **As peças**: destruídas no `destroy()` do ProseMirror (sem vazar componentes); o `update()` evita
  recriar.

### 5.24 Segurança

- Nada vira HTML a partir do texto: o desenho do ProseMirror é feito por `createElement` (os `toDOM`),
  e os widgets são os componentes de sempre.
- O HTML colado é lido pelo ProseMirror num documento à parte (nada roda; imagens não carregam), e só
  as marcas e os blocos do esquema sobrevivem. Link com `javascript:`, `data:` ou qualquer coisa fora
  de `https`/`http`/`mailto` não vira link.
- O tipo `text/x-murall-markdown` colado é tratado como markdown digitado: passa pelo mesmo leitor; um
  widget nele é um widget como qualquer outro (a pessoa poderia escrevê-lo no Markdown).

### 5.25 A regra do logout (CLAUDE.md)

- A escolha "Jeito de escrever" mora dentro do `Stored` dos Ajustes (a chave de sempre,
  `mural-de-jogos:config:v1`, com o prefixo legado que a limpeza conhece, gravada por `writeJson`): sai
  na limpeza sem nada novo em `wipeBrowser`. O teste em `core/browser-reset.spec.ts` mostra que ela
  sai (a regra pede o teste mesmo assim).
- O estado do ProseMirror (o documento e o histórico) vive só na memória; nada vai para o
  `localStorage`, o `sessionStorage` ou o IndexedDB. A área de transferência não é armazenamento do site.
- A escolha é por aparelho (decisão P3): não sincroniza, não entra na nuvem nem em `localHasContent`.

### 5.26 Arquivos

Novos:

- `core/rich-doc.ts` (+ `.spec.ts`): as linhas tipadas, ler, escrever, a trava, o mapa do cursor. Sem
  ProseMirror.
- `ui/visual-editor/` : `visual-editor.ts` (o componente), `schema.ts`, `keymap.ts`, `input-rules.ts`,
  `paste.ts` (HTML e texto), `widget-view.ts` (a peça), `table.ts` (o menu e os comandos), `layout.ts`
  (o plugin das decorações), com os `.spec.ts` de cada parte.
- `ui/_formatado.scss`: o desenho da leitura, compartilhado.
- `scripts/visual-ida-e-volta.mjs`: o tradutor nas notas de um backup local.

Mudados:

- `core/rich-text.ts`: exporta `fenceOf`, `closes`, `indentOf`, `dedent` (sem mudar o que fazem) e
  ganha "A REGRA DO VISUAL" no cabeçalho (seção 10).
- `core/widgets.ts`: "A REGRA DO VISUAL" no cabeçalho; o registro diz quais campos se escrevem direto
  na peça (`WidgetField.inline`).
- `ui/rich-editor.ts`: as abas, o modo, o `caret`, as ações indo para o Visual, o tipo próprio ao
  copiar e colar no Markdown.
- `ui/rich-text.ts`: o estilo vai para o parcial.
- `ui/markup-guide.ts`: a Ajuda por modo.
- `ui/review-editor.ts`: a prévia pelo `caret`.
- `core/settings.ts` e `pages/settings-page.html`: "Jeito de escrever".
- `core/browser-reset.spec.ts`: o teste da regra.
- `package.json`: os pacotes do ProseMirror (versão fixa).
- `NOVIDADES.md` e `core/news.ts` quando aparecer para a pessoa; `core/build.ts` a cada commit.

## 6. Tudo o que pode dar errado

Cada linha: o defeito, como ele aparece para a pessoa, o que o evita e o teste que o pega.

### 6.1 A fidelidade do texto

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| F1 | Abrir no Visual reescreve o texto (`__x__` → `**x**`, `* a` → `- a`, `1. 1.` → `1. 2.`) | A nota conta como editada sem ninguém mexer; versão nova na compartilhada; sincroniza à toa | A fonte guardada; sem mudança, nada de `value.set` (I1) | Ida e volta byte a byte em todo o corpus (7.1) |
| F2 | Mexer numa palavra reescreve a lista inteira | Conflito com o colega na compartilhada, diferença enorme nas versões guardadas | Só a linha mexida sai na forma de sempre; renumerar só como o Markdown faz (I2) | Uma edição aleatória muda só as linhas esperadas |
| F3 | O que se digitou vira marca na leitura (`*nome*`, `2 **3`, `a_b_c`) | No Visual parece texto; na ficha, itálico | Escape pela trava (5.4) | Fuzz: letras sorteadas com sinais, ida e volta |
| F4 | Barras demais no markdown | O Markdown fica feio para quem troca de aba | Escapar só o que o leitor leria | Frases comuns com sinais saem sem barra |
| F5 | Uma combinação de marcas que o markdown não escreve (itálico colado a negrito dentro da palavra) | O que se vê não é o que fica | Outras grafias (`_`); senão a tela se ajusta na hora (I3) | Casos sabidos fixos no spec |
| F6 | Espaço na ponta da marca (`**x **` não fecha) | O negrito some na leitura | O espaço sai da marca ao escrever; na tela não muda (só o marca-texto e o riscado deixam de pintar o espaço da ponta) | Spec |
| F7 | Colchete no texto de um link, `\|` ou `]` no título de uma anotação | O link quebra na leitura | O colchete sai do link; a lista do "[[" avisa | Spec |
| F8 | Endereço com espaço, aspas, parênteses sem par | O link para no meio | `normalizeUrl`, `%20`, `<endereço>` quando precisa | Spec com os da Wikipédia |
| F9 | Os símbolos: `->` vira → sem querer, ou → volta a `->` | A seta some ou aparece | O texto do nó é o que aparece; o autocorreto desfeito sai `-\>` | Spec |
| F10 | A barra invertida digitada some (`a\*`) ou come o sinal | `C:\Users` ok, mas `\*` some | `\\` quando a barra vem antes de um sinal | Fuzz |
| F11 | Uma linha de texto vira bloco (`# `, `- `, `1. `, `> `, `-# `, `---`, ` ``` `, `{{contador: …}}`, a linha de traços embaixo de uma com `\|`, a linha com `\|` logo embaixo de uma tabela) | Um título, uma lista ou um widget aparecem do nada na leitura | O primeiro sinal escapado, pela trava das linhas vizinhas | Um caso por bloco |
| F12 | Widget de um site mais novo escapado | O site novo deixa de mostrar o widget | Escapar só o que este leitor leria como bloco | Spec com `{{enquete: …}}` |
| F13 | Tabela com células a mais na fileira perde as de sobra | Dado escondido que some | O atributo `sobra` devolve | Spec |
| F14 | `####`, `1)`, `[X]`, `*`, `+`, `•` viram a forma de sempre | Só na linha mexida; a leitura é igual | Aceito (I2 limita à linha) | Spec documenta |
| F15 | Tab no recuo e no meio do texto | O nível muda; a coluna da tabela muda | Recuo contado em colunas (tab até a parada de 4), tab do texto mantido | Spec |
| F16 | `\r\n` vira `\n` (um texto que veio da API ou de um arquivo do Windows) | Diferença em todas as linhas ao mexer numa | Sem mexer, nada é escrito; a quebra de cada linha fica guardada junto da fonte dela (o `linesOf` tira o `\r` na leitura, então o tradutor anota à parte qual quebra cada linha tinha), e a linha nova usa a quebra que o texto mais usa | Spec com `\r\n` e com as duas misturadas |
| F17 | Espaços do fim da linha somem | Invisível | Só na linha mexida (aceito) | — |
| F18 | Caractere de uso privado (emoji antigo de celular japonês) | Marcas lidas errado | Trava; senão cru | Spec com U+E000 |
| F19 | Bloco de código sem fecho no fim | Mexer põe o fecho | Aceito, só se mexer | Spec |
| F20 | Crases ou tis dentro do código | O bloco fecha antes | Cerca maior que a fila de dentro | Spec |
| F21 | Item com corpo de recuo irregular (3 e 5 espaços) | O corpo muda de dono | Recuo guardado por linha; a trava; senão cru | Corpus |
| F22 | O leitor muda no futuro e o tradutor fica para trás | Ida e volta quebra | A REGRA DO VISUAL e o spec que passa por todos os blocos e widgets | Spec que falha sem o Visual saber o bloco novo |

### 6.2 Digitar e o cursor

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| K1 | O negrito não continua (ou não para) na ponta | Escreve no fim da palavra em negrito e sai normal | Marcas inclusivas como no Docs; links e código não | Spec de digitação |
| K2 | Não dá para pôr o cursor antes de um widget no começo do texto, entre duas peças, depois da tabela no fim | A pessoa não consegue escrever ali | Cursor de lacuna; Enter na peça abre linha | Spec |
| K3 | Acento com tecla morta (´ + a), IME, ditado, Gboard duplicam ou somem letras | Letra repetida ou perdida | Nada mexe no documento durante a composição | Puppeteer com a composição simulada + aparelho real |
| K4 | O ajuste da tela (5.2.1) briga com quem digita | A marca liga e desliga sozinha | Ajuste fora da composição e só no que mudou | Spec |
| K5 | O autocorretor do celular troca uma palavra metade em negrito | Some o negrito da metade | Aceito (é o que o Docs faz); conferir que nada pior acontece | Aparelho |
| K6 | Ctrl+A e apagar deixa um nó estranho (item vazio, tabela) | O texto começa com "- " | Documento vazio = uma linha vazia | Spec |
| K7 | Enter dentro de um link leva o link para a linha nova | O link cresce | Link não inclusivo | Spec |
| K8 | Escrever no texto de um link de anotação muda o título sem querer | O link abre outra nota | O título fica; só o rótulo muda | Spec |
| K9 | Seleção atravessando texto, tabela e widget, e Delete | Tabela pela metade | O `prosemirror-tables` conserta; a peça sai inteira | Spec |
| K10 | Espaços seguidos somem (o `contenteditable` junta) | "a  b" vira "a b" | `white-space: pre-wrap` | Spec |
| K11 | O placeholder some no Firefox ou fica por cima do cursor | Visual | Decoração de placeholder | Foto |

### 6.3 Listas e tarefas

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| L1 | Número na tela diferente da leitura (`1.1.`, lista que começa no 3, listas separadas por linha em branco, `1. 1. 1.`) | O número muda depois de salvar | Os números vêm do `parseRich` (5.6) | Spec com cada caso |
| L2 | Tab num texto embaixo de um item vira descrição dele | Parece estranho | É a leitura; a tela mostra igual (WYSIWYG) | Spec |
| L3 | Backspace no começo do item apaga o item inteiro | Perde o texto | Primeiro tira o marcador | Spec |
| L4 | Renumerar em cascata numa lista longa | Muitas linhas mudam | É o que o Markdown já faz (`renumberAfter`); aceito | Spec |
| L5 | Mudar o tipo de uma lista com descrições perde as descrições | Some texto | Descrição é do item pelo recuo, fica | Spec |
| L6 | A caixinha não responde ao toque no celular (toque vira cursor) | Não marca | `pointerdown` na caixinha, fora do editável | Aparelho |

### 6.4 Widgets

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| W1 | Clicar na peça põe o cursor dentro dela | Escreve "dentro" do widget | Átomo, seleção da peça inteira | Spec |
| W2 | O vídeo recarrega a cada tecla | O vídeo volta para o começo | `update()` sem recriar | Spec (o componente é o mesmo objeto) |
| W3 | Componentes das peças vazam ao fechar | Memória cresce, contador continua contando escondido | `destroy()` de cada peça | Spec conta as vistas |
| W4 | Folha do widget aberta e o texto digitado cai no ProseMirror | Texto no lugar errado | O pedido gravado no `close`, como hoje | Spec |
| W5 | Legenda com `\|` ou `}}` | Legenda muda | `escapeArg` + aviso | Spec |
| W6 | Soltar uma peça arrastada no meio de uma linha | Widget no meio do texto (o leitor não lê) | Peça sempre numa linha dela | Spec |
| W7 | A imagem guardada entra no lugar errado se o texto mudou | Imagem no meio de outra coisa | Marcador que anda com as mudanças | Spec |
| W8 | O campo da legenda no celular: o teclado abre e a régua presa cobre | Não se vê o que escreve | O campo rola para a vista | Aparelho |
| W9 | Peça de um widget com parâmetro errado (contador sem data) | Quebra o editor | O mesmo componente da leitura (que já mostra o erro dele) | Spec |

### 6.5 Tabela

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| T1 | Enter quebra a linha dentro da célula | O markdown não guarda: a tabela quebra | Enter desce | Spec |
| T2 | Colar várias linhas numa célula | Idem | Com tab espalha, sem tab junta | Spec |
| T3 | Colar tabela com células mescladas | Colunas desalinhadas | Desfaz a mescla | Spec com HTML do Docs e do Excel |
| T4 | `\|` digitado numa célula | Uma coluna a mais | `writeTable` escapa; a trava | Spec |
| T5 | Tabela de 200 fileiras lenta | Digitação arrastada | Medir na rodada 8; o limite já existe | Medida |
| T6 | Tabela toda vazia | O leitor ainda lê como tabela? | `startsTable` aceita células vazias; conferir | Spec |
| T7 | Negrito em várias células selecionadas | Só uma fica | Comando de marca nas faixas da seleção de células | Spec |
| T8 | Tabela dentro de item perde o recuo | Sai do item | Recuo do nó em todas as linhas | Spec |

### 6.6 Colar e copiar

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| C1 | Colar do Docs vira tudo negrito | O `<b id="docs-internal-guid">` | Regra própria | Spec com HTML do Docs guardado como amostra |
| C2 | Colar do Word traz "·" e listas falsas | Lista vira texto com ponto | `mso-list` → itens | Amostra do Word |
| C3 | Colar de um site traz cor, fonte, tamanho, imagens de anúncio | Lixo | Só o esquema; `<img>` só com `https:` | Amostras |
| C4 | Link `javascript:` colado | Risco | Só `https`/`http`/`mailto` | Spec |
| C5 | Colar markdown de outra nota no Visual mostra asteriscos | Feio | O tipo próprio; o texto puro lido como markdown | Spec |
| C6 | Copiar do Visual e colar no WhatsApp leva asteriscos | Feio | `text/plain` limpo | Spec |
| C7 | Copiar do Visual e colar no Markdown perde as marcas | Perde formatação | O tipo próprio lido pelo Markdown | Spec |
| C8 | Colar um código com `**` e `_` vira formatação | Texto estragado | Ctrl+Shift+V; Ctrl+Z | Spec |
| C9 | Colar além do limite | Corta no meio de uma marca | Por linhas inteiras | Spec |
| C10 | O navegador não deixa tipo próprio na área de transferência (Safari) | O tipo some | O HTML do ProseMirror carrega o trecho (colar no Visual funciona igual); no Markdown cai no texto puro | Aparelho |

### 6.7 Sincronização e outros caminhos

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| S1 | Mudança de fora com o Visual aberto: o cursor pula, o que se digitou some | Perde texto | Só as linhas mudadas; o cursor mapeado | Spec |
| S2 | Ctrl+Z desfaz a mudança do colega | Apaga o dos outros | Fora do histórico | Spec |
| S3 | A folha de conflito mostra markdown | A pessoa do Visual vê marcas | Fora deste plano (seção 8); anotado | — |
| S4 | Pedido da AI acrescenta texto enquanto se escreve | Igual a S1 | Igual a S1 | Spec |
| S5 | Gravar a cada tecla pesa (a prévia, a nuvem) | Lento | É o que o Markdown já faz; a escrita é barata (WeakMap) | Medida |

### 6.8 Celular

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| M1 | A régua presa cobre o cursor | Escreve às cegas | `scrollMargin` | Aparelho |
| M2 | Tocar na régua tira a seleção (iPhone) | O negrito não pega | `pointerdown` sem foco; conferir | Aparelho |
| M3 | Zoom ao tocar na folha (iPhone) | A tela pula | Letra de 16 px ou mais | Aparelho |
| M4 | Backspace apaga uma palavra inteira com sugestão (Gboard) | Some mais que uma letra | É o teclado; conferir que a marca não vaza | Aparelho |
| M5 | A rolagem da folha (`fill`) briga com a do diálogo | Pulos | Mesma regra da `<textarea>` (quem rola é a página) | Foto |

### 6.9 Acessibilidade

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| A1 | O leitor de tela não sabe o que é a folha | "Grupo" sem nome | `role="textbox"`, nome, `aria-multiline` | Spec |
| A2 | Os botões não dizem o que está ligado | Formata às cegas | `aria-pressed` | Spec |
| A3 | Armadilha do Tab | Teclado preso | Shift+Tab sem recuo sai | Spec |
| A4 | Widget e caixinha sem nome | "Imagem" muda | Nome e `role` | Spec |
| A5 | O spoiler na escrita sem contraste | Ilegível | Impeccable confere | Foto |

### 6.10 Peso, desempenho e o projeto

| # | Defeito | Como aparece | O que evita | Teste |
| --- | --- | --- | --- | --- |
| R1 | O carregamento inicial cresce | Site mais lento para todos | `@defer` | `npx ng build` (o inicial não muda) |
| R2 | Estilo por componente passa de 24 kB | Build falha | Parcial; folha à parte se precisar | Build |
| R3 | Texto grande lento | Digitação arrastada | Medida na rodada 8 | Medida |
| R4 | Os dois modos se separam com o tempo (feature nova só no Markdown) | Uma coisa existe num modo e não no outro | A REGRA DO VISUAL + o spec | Spec |
| R5 | A pessoa não acha mais o markdown | Pedido do usuário | Aba sempre à vista | — |
| R6 | Quem sentia falta do "Ver como fica" (tarefas dobradas, spoiler tapado, links que abrem) | Perde algo | Decisão P1 (sai); a ficha ao lado já mostra a cara final, e o Ctrl+clique abre os links | — |
| R7 | A Ajuda fala de asteriscos no Visual | Confunde | Ajuda por modo | Spec |
| R8 | O contador anda mais que o que se vê | Confunde | `title` explica | — |
| R9 | Testes do ProseMirror instáveis no Karma (foco assíncrono, seleção) | Rodada vermelha à toa | Despachar transações e eventos direto na vista; semente fixa; as lições dos testes instáveis de outubro (o foco assíncrono, a semente do Jasmine) | Rodar 3 vezes |
| R10 | O comportamento do Markdown muda junto | Quebra o hábito de quem gosta | O Markdown fica como está (só as abas e o tipo próprio ao copiar) | Os specs de hoje passam sem mudar |
| R11 | Atualizar o ProseMirror quebra algo | Defeito do nada | Versão fixa; atualizar é uma rodada com todos os testes | — |

## 7. Testes

### 7.1 O tradutor (`core/rich-doc.spec.ts`, sem navegador de verdade)

- **O corpus**: todas as amostras de `markdown.spec.ts`, `markdown-items.spec.ts`, `widgets.spec.ts`,
  `tables.spec.ts`, `ui/pdf-sheet.samples.ts` e uma lista própria dos jeitos de escrever (os de F1, F11,
  F14, F15, F16, F18–F21). Para cada texto: ler e escrever sem mexer dá o mesmo texto, byte a byte (I1);
  o documento lido é o que o `parseRich` diz (I3).
- **Mexer numa linha**: para cada texto do corpus, uma edição sorteada num nó (letra, marca, tipo,
  recuo), escrever, e conferir que só as linhas esperadas mudaram (I2) e que a leitura do novo texto é o
  documento novo (I3).
- **Fuzz** com semente fixa (como os testes do Jasmine com semente, das lições de outubro): documentos
  sorteados (letras com todos os sinais do leitor, marcas sobrepostas, links, recuos, todos os tipos de
  linha), escritos e lidos de volta; milhares por rodada; cada falha vira um caso fixo.
- **O mapa do cursor**: posição na tela → posição no texto → posição na tela volta ao mesmo lugar.
- **Mexer e desfazer**: depois de qualquer edição e do Ctrl+Z dela, o texto volta byte a byte (os nós
  desfeitos voltam com a fonte deles).
- **As notas reais**: `scripts/visual-ida-e-volta.mjs` com o backup do usuário (na máquina dele, nunca
  no repositório): quantas linhas viram cru, quais falham I1. Rodar antes de abrir o Visual para todos.

### 7.2 O editor (Karma)

- `ui/visual-editor/*.spec.ts`: cada linha da tabela de teclado (5.9), cada atalho de digitação (5.10),
  a régua (cada ação e o `aria-pressed`), os links, as listas, as peças (a tirinha, a folha, a legenda,
  a imagem colada com o marcador, o `destroy`), a tabela (o menu, Tab, Enter, colar), o colar (com as
  amostras de HTML guardadas do Docs, do Word, de um site e do Excel), o copiar (os três tipos), o limite,
  a mudança de fora, o desfazer.
- `ui/rich-editor.spec.ts`: as abas, a troca de modo com o cursor e a seleção, a opção dos Ajustes, a
  tela cheia com o mesmo estado, o tipo próprio no Markdown. **Os testes de hoje do Markdown continuam
  passando sem mudar** (R10).
- Os specs do `review-editor` (o da prévia, `review-editor.preview.spec.ts`): a prévia segue o cursor
  nos dois modos.
- `core/browser-reset.spec.ts`: a escolha sai na limpeza.
- `ui/rich-text.spec.ts` e as fotos: a leitura não mudou nem um pixel com o estilo no parcial.
- O spec da REGRA DO VISUAL: para cada `Block['kind']` e cada nome de `WIDGETS`, uma amostra que o
  Visual lê como nó (não cru) e escreve de volta igual. Um bloco ou widget novo sem amostra falha.

### 7.3 De verdade

- **Puppeteer** (`.angular/pptr/visual-*.mjs`, como os scripts de fotos de antes): digitar de verdade
  (teclas, Shift, Ctrl), a composição de acento pelos eventos de composição, colar, as fotos de perto
  (2×) de cada peça, no computador e no celular simulado, na build de produção, com dados guardados.
- **Aparelhos de verdade**, com a lista: Chrome do Android com o Gboard (acentos, sugestão, ditado,
  apagar), Safari do iPhone (seleção, régua presa, zoom, peças), Chrome e Edge do Windows com o teclado
  ABNT2 (tecla morta), Firefox do computador. Precisa do usuário.
- **A build de produção** (`npx ng build`): o inicial não cresce; o orçamento por componente passa; o
  smoke com dados guardados (a lição do site em branco de outubro).
- **Todos os testes** (`npm run test:ci`; a API e o `contrato/` não mudam).

## 8. O que fica de fora (de propósito)

- **Marcas novas.** Cor de letra, tamanho, fonte, sublinhado, alinhamento de parágrafo, imagem no meio
  da linha: o markdown do Murall não tem, e criar marca é outra conversa (com a REGRA DO PDF, a API, o
  site antigo). O Visual só mostra o que o texto já sabe guardar.
- **Edição a várias mãos ao vivo** (o cursor do colega aparecendo, como no Docs): a compartilhada
  continua juntando por versões.
- **A folha de conflito** (`conflict-sheet`) e a lista de versões guardadas mostrando o texto formatado:
  continuam mostrando o markdown; pode virar outra rodada depois.
- **O "Ver como fica" só de leitura**: sai (decisão P1).
- **Arrastar itens de lista pela alça** (reordenar como no Notion): o arrastar do ProseMirror já move o
  texto selecionado; uma alça é outra rodada.
- **Corretor ortográfico próprio**: fica o do navegador (que funciona no `contenteditable`).
- **Comentários no meio do texto, sugestões, histórico de alterações** do Docs.
- **O editor dos outros campos** (o nome, a frase do perfil): continuam campos simples.
- **O Visual na API e no MCP**: eles escrevem markdown, que é o que o texto é.

## 9. Decisões

### 9.1 As minhas (com o porquê), que valem até o usuário dizer o contrário

| # | Decidido | Por quê | Outras |
| --- | --- | --- | --- |
| D1 | **O texto continua a string de hoje, sem marca nova** | Tudo em volta (nuvem, API, PDF, junção, site antigo) continua igual | Guardar o documento do editor (JSON): quebraria tudo |
| D2 | **ProseMirror**, versões fixas, num pedaço preguiçoso | O motor mais maduro para esquema próprio; o difícil (seleção, composição, colar) resolvido | Lexical (segunda opção), editor próprio (não) |
| D3 | **Modelo plano: uma linha do texto, um nó**, o nível pelo recuo | É o que o texto é; faz a ida e volta, o cursor e as mudanças de fora serem por linha | Árvore de listas (os exemplos do ProseMirror) |
| D4 | **A fonte guardada** por nó + escrita só do que mudou | As promessas I1 e I2 | Escrever tudo na forma de sempre (mudaria notas sem ninguém mexer) |
| D5 | **Escape mínimo, com a trava do próprio leitor** | Markdown limpo e certeza de que a leitura bate | Escapar todo sinal (feio), não escapar (perde texto) |
| D6 | **Trecho cru** para o que não dá | Nada some (I4) | Reinterpretar (perde), recusar abrir no Visual (frustra) |
| D7 | **A tela segue a leitura** (números, níveis e corpo vindos do `parseRich`) | O que se vê é o que fica | Calcular à parte (dois jeitos discordando) |
| D8 | **Atalhos de digitação de bloco ligados** (lista, tarefa, título, citação, código, divisória) e **os símbolos e os links** | É o que o Docs faz; desfaz com Ctrl+Z | Nenhum atalho; todos, inclusive `**x**` (P4) |
| D9 | **A tabela direto, com o `prosemirror-tables`**, sem mescla | Seleção de células e colar prontos e testados | Tabela própria (refazer o que existe) |
| D10 | **Legenda e títulos dos widgets escritos direto**; o resto pela folha | O pedido; só o que é uma frase cabe bem na peça | Tudo pela folha (o de hoje) |
| D11 | **Copiar põe texto limpo, HTML e o tipo próprio** | WhatsApp sem asteriscos, Docs com negrito, Murall com tudo | Só markdown no texto puro |
| D12 | **Colar texto puro lê como markdown**, Ctrl+Shift+V cola como letras | O texto puro com marcas vem quase sempre do Murall ou de uma AI (P5) | Sempre letras |
| D13 | **A escolha num ajuste; a aba vale só naquele editor** | A preferência não muda por um clique de olhar | A aba muda a escolha |
| D14 | **"Em teste" desde a rodada 2**, para o usuário experimentar cada parte | O jeito por partes; o retorno chega cedo | Esconder até o fim |
| D15 | **O Markdown não muda** (só as abas e o tipo próprio ao copiar e colar) | Quem gosta do Markdown não perde nada | — |

### 9.2 Perguntas que eram do usuário

Respondidas em 29/out/2026: o usuário ficou com as recomendações ("Sim, use as suas").

| # | Pergunta | Decidido |
| --- | --- | --- |
| P1 | O "Ver como fica" (só leitura) pode sumir, ficando as abas **Visual** e **Markdown**? | Sim. O Visual é ele, editável, e a ficha ao lado já mostra a cara final. |
| P2 | Qual abre primeiro para quem nunca escolheu? | O **Visual**, depois da rodada 9 (antes, o Markdown). É o jeito que a maioria espera; o Markdown fica a um toque. |
| P3 | A escolha é **por aparelho** (como o Desempenho) ou **da conta** (vale em todos)? | Por aparelho: no celular e no computador as pessoas escrevem diferente, e é mais simples. |
| P4 | No Visual, digitar `**x**` vira negrito (como no Notion)? | Não: o pedido é que o que se escreve seja lido como texto, não como markdown; só os atalhos de bloco e os símbolos, como no Docs. |
| P5 | Colar um texto puro com marcas (de uma AI, de outro lugar) lê as marcas? | Sim, e Ctrl+Shift+V cola como letras. |

## 10. Regras novas para o futuro (A REGRA DO VISUAL)

Entram nos cabeçalhos de `core/rich-text.ts` e `core/widgets.ts`, ao lado da REGRA DO PDF:

> **A REGRA DO VISUAL**: toda marca nova (ou mudada) e todo widget novo precisam ser lidos e escritos pelo
> modo Visual (`core/rich-doc.ts`, `ui/visual-editor/`): a amostra no spec da regra (os tipos obrigam),
> a ida e volta sem mudar um byte, e o desenho na tela igual ao da leitura. Um widget novo diz no
> registro quais campos se escrevem direto na peça (`WidgetField.inline`).

E na memória do projeto: o Visual é parte do texto; qualquer mudança no leitor roda os specs do
tradutor.

## 11. Rodadas

Um commit por passo, como sempre (a BUILD a cada um; as Novidades quando a pessoa vê algo novo; o
Impeccable em todo passo de tela; todos os testes e testes novos; `npx ng build`; as fotos de perto).

0. **A prova** (fora do site, num rascunho, sem commit no site). O ProseMirror com o esquema mínimo
   (linhas, títulos, itens, marcas, um widget falso, uma tabela do `prosemirror-tables`) numa página de
   teste. Medir o peso comprimido do pedaço. Digitar no Android (Gboard) e no iPhone **do usuário**
   (acentos, sugestão, ditado, apagar, selecionar e tocar na régua, cursor perto da peça). Conferir o
   tipo próprio na área de transferência no Safari. Sai daqui: as versões fixas, o peso, e se o
   ProseMirror passa no celular (senão, o Lexical entra na prova).
1. **O tradutor** (`core/rich-doc.ts`, sem tela): ler, escrever, a fonte guardada, a trava, o escape, o
   cru, o mapa do cursor; o corpus, o fuzz, o script das notas reais (rodado com o backup do usuário). O
   site não muda.
2. **A folha básica, "em teste"**: o componente, as abas Visual/Markdown, a opção nos Ajustes (com
   "em teste"; o padrão continua o Markdown), a troca de modo com o cursor, as linhas de texto, os
   títulos, a citação, o sutil, a divisória, as marcas, a régua com os botões acesos, o desfazer, o
   limite, o estilo da leitura no parcial (a leitura sem mudar um pixel). O que ainda não tem nó (as
   listas, os widgets, a tabela, o código) aparece como trecho cru, que guarda tudo como está: é o que
   deixa abrir o Visual "em teste" desde já sem risco. O que o Visual ainda não sabe pôr (lista, widget,
   tabela) fica apagado na régua, com a dica "Ainda não no Visual: use a aba Markdown". A mudança de fora, por enquanto, refaz o
   documento inteiro (seguro; o cursor pode pular); a troca só das linhas mudadas vem na rodada 8.
   Aparelho de verdade.
3. **Links e código**: o painel do link (Ctrl+K), o painel passivo do clique, o "[[" com a lista, o
   endereço solto que vira link, o código na linha e o bloco de código, a Ajuda por modo.
4. **Listas e tarefas**: os três tipos, o `1.1.`, a descrição, Tab e Shift+Tab, Enter e Backspace da
   tabela 5.9, os números da leitura, a caixinha, os atalhos de digitação. Aparelho de verdade.
5. **Widgets como peças**: a peça Angular, a tirinha, a folha, inserir, arrastar, a legenda e os títulos
   escritos direto, a imagem colada e solta com o marcador, a de outra pessoa.
6. **A tabela direto**: o nó, o menu "Tabela", Tab, Enter, colar planilha, a seleção de células, o jeito.
7. **Colar e copiar**: o HTML de fora (com as amostras do Docs, do Word, de sites, do Excel), o texto
   puro, o Ctrl+Shift+V, os três tipos ao copiar, o tipo próprio no Markdown.
8. **O resto em volta**: a mudança de fora só nas linhas mudadas (compartilhada, outro aparelho, API),
   a tela cheia com o mesmo estado, a prévia que segue o cursor, o celular inteiro (régua presa,
   rolagem, zoom), a acessibilidade, a medida do texto grande.
9. **Para todos**: tira o "em teste", o padrão da P2, as Novidades, a REGRA DO VISUAL nos cabeçalhos, o
   script nas notas reais de novo, a lista dos aparelhos inteira.

## 12. Andamento

- 29/out/2026: o plano (40a8a16, BUILD 640) e as respostas das perguntas P1 a P5, todas como
  recomendado (seção 9.2).
- 29/out/2026, rodada 0 começada (a parte do computador feita; falta o celular do usuário):
  - **A prova** mora em `.angular/prova-visual/` (fora do site e do git, como as fotos de puppeteer):
    `node construir.mjs` monta `www/`, `node servir.mjs` serve na 5241 em todas as placas de rede
    (a configuração `prova-visual` do `.claude/launch.json`) e guarda em `relatorios/` o que o botão
    "Mandar para o computador" da página manda. `node conferir.mjs` é o roteiro do puppeteer.
    O esquema é o mínimo de 5.1 (linha, título, item com a caixinha, um contador falso com o título
    escrito direto na peça, a tabela do `prosemirror-tables`), as marcas de 5.2, o teclado próprio de
    5.9 (sem o `baseKeymap`), os atalhos de digitação de 5.10, a régua com os botões acesos e presa em
    cima do teclado no celular, e um diagnóstico: o registro das teclas, do `beforeinput` e da
    composição, a conferência tela × documento (o texto de cada linha no DOM contra o do nó) e o tipo
    `text/x-murall-markdown` ao copiar e colar. O markdown que ela mostra é aproximado (o tradutor é
    a rodada 1).
  - **As versões fixas**, todas MIT, cada uma publicada há duas semanas ou mais (as mais novas de
    out/2026 ficaram de fora até amadurecerem): `prosemirror-model` 1.25.12, `-state` 1.4.4, `-view`
    1.42.6, `-transform` 1.12.2, `-commands` 1.7.2, `-keymap` 1.2.3, `-history` 1.5.1, `-inputrules`
    1.5.1, `-gapcursor` 1.4.1, `-dropcursor` 1.8.4, `prosemirror-tables` 1.8.5 (e, de tabela,
    `orderedmap` 2.1.1, `rope-sequence` 1.3.4, `w3c-keyname` 2.2.8).
  - **O peso**: o pedaço da prova inteiro (os onze pacotes e o nosso código) dá 260 KB cru, **81 KB
    gzip, 71 KB brotli**; sem o `prosemirror-tables`, 68 KB gzip. Abaixo da estimativa de 5.23
    (100–150 KB). O tree-shaking quase não tira nada do ProseMirror: contar com o pacote inteiro.
  - **No Chrome do computador** (puppeteer, 37 conferências, todas passando): digitar, Ctrl+B ligando e
    desligando sem seleção, "- ", "1. ", "[] ", "## " e "->" virando o que devem, o Backspace logo
    depois desfazendo o atalho, Enter continuando e terminando a lista, Backspace no começo do item
    tirando o marcador, Tab e Shift+Tab, a tecla morta (´ + a) e uma palavra composta letra a letra
    como o teclado do celular faz (sem letra a mais nem a menos; o "->" espera a composição acabar), a
    caixinha marcando sem mexer no cursor, a peça selecionada inteira com a tirinha, Enter na peça
    abrindo uma linha, o título escrito direto na peça, as setas passando por ela, a tabela (escrever,
    Enter desce, Enter na última fileira cria outra, Tab anda), Ctrl+Z e Ctrl+Y, o tipo próprio do
    Murall indo e voltando pela área de transferência com o negrito junto, a tela igual ao documento a
    sessão inteira, nenhum erro no console. No celular simulado (Pixel 5): a régua presa embaixo, a
    letra da folha com 18,9 px (o iPhone não dá zoom), a caixinha marcando com um toque sem dar foco à
    folha.
  - **Achados**: (1) o `preventDefault` no `touchstart` da caixinha mata o `click`: no celular ela não
    marcava. Segurar o foco com o `pointerdown` (e o `mousedown`) cancelado e marcar no `click`
    funciona. Vale para toda peça tocável dentro da folha (a caixinha, a tirinha, os controles do vídeo).
    (2) O `selectionchange` do navegador chega um instante depois da tecla: um robô que aperta Home e
    logo Backspace age na seleção velha (juntou duas linhas). Gente não digita tão rápido, mas os testes
    do Karma e do puppeteer precisam de uma pausa depois de mexer na seleção pelo teclado, ou despachar a
    seleção direto na vista (o R9). O copiar com a seleção velha também sai pelo navegador, sem o tipo
    próprio. (3) O ProseMirror ignora o Enter do Chrome do Android no `keydown` (lê da mudança no DOM) e,
    no iPhone, espera 200 ms pelo Enter: o nosso Enter continua sendo chamado, mas é o que mais precisa
    do aparelho de verdade.
- 29/out/2026, o primeiro relatório do celular do usuário (Android 10, Chrome 155, Gboard, 384×734):
  os 13 itens do roteiro marcados "Deu certo" (acentos, sugestão, ditado, apagar, negrito pela régua com
  a seleção mantida, lista, caixinha, peça, título na peça, tabela, régua presa, copiar e colar, menu do
  sistema), a tela igual ao documento em 80 conferências, e o tipo `text/x-murall-markdown` chegou ao
  colar no Chrome do Android. Mas as notas dele trouxeram três defeitos:
  - **O Enter dentro do item não pulava de linha** ("fiquei preso na linha") e **na célula virava um
    espaço**. O registro mostrou o porquê: o Gboard manda o Enter (keydown 13 e `insertParagraph`), e o
    ProseMirror, no Chrome do Android, ignora o keydown e espera o navegador partir o bloco no DOM para
    ler a mudança. Na linha comum (`<p>`) dá certo; dentro da peça do item (o `contentDOM` num `<span>`)
    e da célula, o que o navegador faz não parece um Enter: nada muda, ou vira espaço. Reproduzido no
    puppeteer com a identidade do Pixel 5 ("Segundo" + Enter + "meio" deu "Segundomeio"). **Conserto**:
    um plugin cancela o `insertParagraph` e o `insertLineBreak` no `beforeinput` e chama o nosso Enter (e
    o Shift+Enter), em todo aparelho, depois de pôr no documento a composição que acabou de terminar
    (`domObserver.flush()`); durante a composição, fica com o ProseMirror; no iPhone, zera o
    `input.lastIOSEnter` para o ProseMirror não chamar o Enter de novo 200 ms depois. Os dois são
    internos do `prosemirror-view` 1.42.6: conferir a cada versão (o R11). **Regra para a rodada 2 em
    diante**: o Enter do Visual sempre pelo `beforeinput`, nunca confiando na leitura do DOM.
  - **Segurar o apagar quebrou a tabela.** O registro (então só os últimos 400 eventos; agora 4.000) já
    não tinha esse trecho. Com a célula sendo ela mesma a linha de texto (`cellContent: 'inline*'`), as
    bordas da tabela ficam frágeis para os comandos de sempre (`joinBackward` e `selectNodeBackward`
    olham a célula como um bloco qualquer, e um apagar segurado seleciona e apaga peças). **Conserto**:
    no começo de uma célula o Backspace não faz nada (e o Delete no fim), e na linha logo depois da tabela
    ele leva o cursor para o fim da última célula (a linha vazia sai), como no Docs; o Delete antes da
    tabela, o espelho. A tabela só sai inteira selecionada de propósito.
  - O roteiro do puppeteer ganhou as conferências do Android (o Enter no item, no item vazio, na linha,
    na célula e na última fileira, o Shift+Enter no item, o apagar segurado no começo da célula e depois
    da tabela, o Delete antes dela): 46 conferências, todas passando.
- 29/out/2026, o segundo relatório do Android: o Enter passou a funcionar no item e na célula (12 Enters,
  todos tratados pelo `beforeinput`), mas segurar o apagar perto da tabela "às vezes apagava uma linha
  inteira, às vezes mais, às vezes nem saía de uma célula e ficava presa nela". Com o registro inteiro,
  o porquê: **o Gboard muda de jeito no meio do apagar segurado**. As primeiras repetições vêm como a
  tecla Backspace (keydown 8, o nosso teclado trata); depois de uns 10, ele passa a mandar a tecla 229 com
  um `deleteContentBackward`, que o ProseMirror deixa o navegador fazer no DOM e lê depois. Numa borda
  (o começo de uma célula ou de uma linha), o navegador apaga a estrutura do DOM e a leitura desmancha
  fileiras, ou não acha mudança e o cursor fica parado. E o "presa na célula" era o conserto anterior (o
  Backspace no começo da célula não fazia nada). **Conserto**: (1) nas bordas (o começo da linha no
  Backspace, o fim no Delete, uma seleção que pega mais de um bloco, uma peça ou células selecionadas)
  o `deleteContentBackward` e o `deleteContentForward` são cancelados e viram o nosso apagar; no meio das
  letras e durante a composição, ficam com o teclado (é onde o Gboard precisa do DOM para as sugestões);
  (2) o Backspace no começo de uma célula passa para o fim da célula de antes, sem juntar as duas, e
  assim o apagar segurado esvazia a tabela de trás para frente sem perder fileira nem coluna (na
  primeira célula, para); o Delete, o espelho. **Regra para a rodada 2 em diante**: o Enter e o apagar
  nas bordas sempre pelo `beforeinput`; o ProseMirror lendo o DOM só para as letras e a composição. O
  roteiro do puppeteer ganhou a rajada de `deleteContentBackward` do Gboard (o evento sintético; o que
  conta é quem trata) e o apagar andando de célula: 47 conferências, todas passando.
- 29/out/2026, o terceiro relatório do Android ("zoou legal a tabela"): segurando o apagar, as três
  fileiras da tabela se fundiram numa só, com as nove células vazias lado a lado. As repetições na
  borda já vinham para o nosso apagar, mas as do meio das letras ainda ficavam com o navegador, e com o
  apagar rápido a seleção que o ProseMirror conhece e o cursor no DOM se desencontram: o navegador
  apagou um `</tr><tr>` (a cara do apagar nativo do `contenteditable`). O puppeteer não reproduz (o
  apagar nativo dele não é o do Gboard). **Conserto**: fora da composição, nenhum apagar fica com o
  navegador. Todo `beforeinput` `delete*` (menos o recortar e o arrastar) é cancelado: no meio das
  letras, sai exatamente o trecho que o navegador apagaria (o `getTargetRanges` do evento, se cabe numa
  linha só) ou uma letra inteira pelo `Intl.Segmenter` (o acento combinado e o emoji com tom de pele saem
  de uma vez); numa borda ou com seleção, o nosso apagar; logo depois de um atalho de digitação, o
  desfazer dele. Durante a composição (a palavra sublinhada do teclado), fica com o ProseMirror. **A
  regra para a rodada 2 em diante fica mais forte**: o navegador não apaga nem parte bloco nenhum no
  Visual; ele só põe letras (e compõe), e o resto é do editor, pelo `beforeinput`. O roteiro ganhou a
  rajada no meio da célula e a letra inteira: 49 conferências, todas passando.
- 29/out/2026, o quarto relatório do Android ("segue bugado"): todo apagar já era nosso, e mesmo assim a
  tabela virou uma fileira de cinco células e a linha de cima sumiu. O registro mostrou o último jeito
  do Gboard: **no apagar rápido (a tecla 229) ele não apaga letra a letra; seleciona um pedaço para trás e
  manda apagar a seleção**. O pedaço cresceu de dentro da tabela até a linha de cima, e apagar uma seleção
  que corta a tabela pelo meio (o `deleteSelection` de sempre) desmancha as fileiras. Entre duas células
  da mesma tabela isso não acontece (o `prosemirror-tables` vira a seleção numa de células, que só
  esvazia); acontece quando uma ponta está fora. Reproduzido no puppeteer com a seleção do meio da linha
  de cima até o meio de uma célula (sem o conserto, da tabela sobram duas células). **Conserto**: uma
  seleção que toca uma tabela (começa ou acaba nela, ou a atravessa) tira só o texto de cada linha e de
  cada célula do trecho; fileiras e colunas nunca saem por um apagar (a tabela inteira sai selecionada
  como peça, ou pelo menu dela). Vale para o Backspace, o Delete e o `beforeinput`. **Fica para a rodada
  6**: escrever por cima de uma seleção assim (a letra que substitui) e colar por cima dela precisam da
  mesma regra. 51 conferências, todas passando.
- 29/out/2026, **a rodada 0 fechada** a pedido do usuário ("Ir à rodada 1"), sem o reteste do quarto
  conserto no aparelho. Fica para a rodada 2 (a primeira com aparelho de verdade): repetir o apagar
  segurado perto e dentro da tabela, e o iPhone com o tipo próprio no Safari, que não foi testado (não
  houve iPhone). O ProseMirror passa no Android: as letras, a composição, o ditado e as sugestões vão
  bem; o que precisou de conserto foi o Enter e o apagar, e a regra que saiu daqui vale para o Visual
  inteiro: **o navegador só põe letras e compõe; partir linha e apagar são do editor, pelo
  `beforeinput`; uma seleção que toca uma tabela só tira texto**.
- 29/out/2026, **a rodada 1, o tradutor** (`core/rich-doc.ts` + `.spec.ts`, `scripts/visual-ida-e-volta.mjs`;
  o site não muda):
  - **O papel de cada linha vem do próprio `parseRich`**, não de uma cópia das regras: o tradutor anda
    pelos blocos que o leitor devolve (com `blockLine` e o `line` de cada item, e o `bodyOf` para o corpo
    dos itens, já que o leitor lê o corpo à parte, sem o recuo, e a mesma linha "  # x" é título no corpo
    de um item e texto fora dele) e tira das linhas cruas só o que o leitor não guarda: o recuo (em
    colunas, como `indentOf`), o número escrito, a cerca do código e a margem do corpo onde ele mora, e
    as células de sobra da tabela. Do `rich-text.ts` passaram a ser exportados `fenceOf`, `closes`,
    `indentOf`, `bodyOf` e `SYMBOLS` (sem mudar o que fazem); o `dedent` não precisou.
  - **As linhas** (`LinhaDoc`): `linha`, `titulo`, `item`, `citacao`, `sutil`, `divisoria`, `codigo`,
    `tabela`, `widget` e `cru`, como em 5.1, com os pedaços (`Span`) do próprio leitor. Cada uma guarda a
    `fonte` (o trecho do texto, a quebra depois dele e a chave do que foi lido); sem mudança, sai ela.
  - **A escrita** (`docToText`): a linha mexida é escrita com todos os sinais escapados e cada jeito de
    marcar (negrito `**`/`__`, itálico `*`/`_`, spoiler `||`/`>!…!<`, e dois jeitos de aninhar), e o
    primeiro que o leitor lê igual é enxugado: cada barra sai se o leitor ainda lê igual sem ela; o link,
    pelo jeito mais curto (solto, `<…>`, `[…](…)`). Depois o texto inteiro é lido de volta (a trava); se
    não volta, as linhas escritas ganham a barra no sinal do começo (a linha de traços embaixo de uma
    com "|"), depois todas; se nem assim, `exato: false` e o documento que o leitor leu (a tela se
    ajusta). `normalizarLinha` aplica o que o texto não guarda (a marca solta o espaço da ponta, o
    espaço do começo vira recuo, dois códigos colados viram um) e a tela vai usar a mesma.
  - **O trecho cru**: a linha que nenhum jeito escreve de volta igual (lida sozinha). No fuzz, só linhas
    com cara de widget e lixo depois ("{{contador: …}}))->{{x}}", que o leitor lê como widget de
    argumentos estranhos).
  - **O cursor**: `alinhar`, `posicaoNoTexto` e `posicaoNoDoc` (as letras na mesma ordem, os símbolos
    contando como os sinais que os escrevem), com a volta ao mesmo lugar conferida.
  - **Os números**: o corpus do spec (as amostras do PDF, uma amostra por bloco da REGRA DO VISUAL, os
    casos F1–F21) volta byte a byte, sem trecho cru, reescrito do zero volta igual, e mexer em cada linha
    muda só ela. O fuzz: 3.000 textos sorteados sem nenhuma falha de I1 nem de reescrita; 4.000 linhas
    sorteadas com marcas sobrepostas, 3 inexatas fora do caso do "~=" (abaixo). **As notas reais do
    usuário** (as 290 do conector do Murall, 274 com texto, 2.554 linhas): nenhum trecho cru, nenhuma
    mudança ao abrir e sair, nenhuma reescrita inexata. 20 mil caracteres: ler 27 ms, escrever com uma
    linha mexida 21 ms.
  - **Os casos sabidos** (a escrita diz que não é exata; a tela vai mostrar o que o leitor lê): (1) **o
    leitor troca "~=" por "≈" antes de ler as marcas**, então um riscado que termina colado num
    marca-texto ("~~==") não tem escrita, e quem escreve "~~==x==~~" no Markdown hoje já vê lixo: é um
    defeito do leitor, para consertar à parte (os símbolos não deviam atravessar as marcas); (2) o
    itálico de uma letra colado num negrito no meio da palavra ("x*a***b**y"); (3) o título vazio; (4) o
    rótulo de um link para fora com colchete, o título de uma anotação com "|" ou colchete; (5) uma crase
    solta colada antes de um código; (6) um código de três crases no começo da linha (vira cerca).
- 29–30/out/2026, **a rodada 2, a folha básica "em teste"** (d424254 BUILD 655, e o commit do Visual,
  BUILD 656; com push):
  - **O estilo da leitura num parcial** (`ui/_formatado.scss`, d424254): as ênfases, o código, os títulos,
    a citação, o sutil, a divisória, a seta do link e o link de caneta viraram mixins, incluídos pela
    leitura no lugar de cada regra. O CSS compilado da leitura saiu igual, byte a byte (compilado pelo
    sass antes e depois): ela não muda um pixel.
  - **O componente** `ui/visual-editor/` (`visual-editor.ts`, `schema.ts`, `keymap.ts`, `input-rules.ts`,
    `entrada.ts`, `visual-api.ts`, `visual-editor.scss`), carregado num `@defer` só quando a aba Visual
    abre pela primeira vez (enquanto chega, a folha mostra o texto pela leitura). Os dez pacotes do
    ProseMirror com versão exata (sem o `prosemirror-tables`, que é da rodada 6). **O peso**: o pedaço do
    Visual tem 260 KB cru, 71,6 KB comprimido; o carregamento inicial ficou em 1,96 MB (560 KB
    comprimido, +1,4 KB: as abas novas, o ajuste e os dois desenhos novos do acervo; nada do ProseMirror).
  - **Os nós** de 5.1 que entram: `linha` (com o recuo, desenhado como o `text-indent` da primeira linha,
    na largura de um espaço da letra da folha, medida), `titulo`, `citacao`, `sutil`, `divisoria` e o
    `cru`, que guarda a `LinhaDoc` inteira (com a fonte) e mostra o trecho pelo `app-rich-text` de
    sempre, criado à mão (`createComponent` + `attachView`, desmontado no `destroy`), com a borda tracejada
    e, selecionado, a etiqueta "Este trecho só se muda no Markdown" com o "Mudar no Markdown" (o botão
    segura o foco no `pointerdown` e age no `click`). A etiqueta entra no fluxo, embaixo do trecho, com a
    altura de uma linha da pauta (duas no toque): o texto de baixo desce linhas inteiras e continua
    sentado na pauta (por cima, ela cobria a linha de baixo). As marcas: as de 5.2, com o link e o link de
    anotação só à mostra. O spoiler na escrita: a tarja translúcida com listras finas.
  - **A escrita** é o tradutor da rodada 1: cada nó vira a `LinhaDoc` dele (guardada por nó num
    `WeakMap`), o `docToText` escreve, e a fonte nova de cada nó escrito de novo fica guardada (na próxima
    tecla, só a linha mexida é escrita). Escrita inexata (um caso sabido): as linhas que o leitor lê
    diferente passam a ser o que ele lê, fora do histórico (a linha vazia do cursor espera).
  - **Decisões desta rodada**: (1) **o código na linha ficou inclusivo** (5.2 dizia "não inclusiva"): não
    inclusivo, o Ctrl+E e a letra seguinte viravam código e a segunda já não, porque a marca guardada só
    vale para a primeira inserção; assim ele se comporta como o negrito (liga, escreve, desliga). (2) **O
    título sem letra** não tem escrita ("# " é texto na leitura): ele é guardado como a linha vazia, e a
    tela fica com o título esperando a primeira letra (escolher "Título 1" numa linha vazia não escreve
    "# " no texto); o Enter no título vazio o volta a texto. (3) **O Tab só recua o texto** (a linha
    comum): o título, a citação e o sutil recuados não são lidos como eles mesmos fora de um item. (4)
    **Colar texto** já lê o markdown do Murall (a P5), pelo próprio tradutor (o que não é nó vira cru), e
    o Ctrl+Shift+V cola como letras; o HTML de fora fica com o esquema (o colar de verdade é a rodada 7).
    (5) **Sem atalho para trocar de aba**: nenhuma tecla ficou livre ao mesmo tempo do Chrome, do Edge,
    do Firefox e do AltGr do ABNT2 (o Ctrl+Shift+M é do Chrome; o Ctrl+Alt é o AltGr); as abas recebem o
    foco pelo Tab e trocam pelas setas, como hoje. (6) A posição do texto → a letra da tela
    (`posicaoNoDoc`) passou a contar as letras que já acabaram antes da posição: o cursor do Markdown
    logo depois do "o" de "**negrito**" (antes do "**") ia para antes do "o"; e `posicaoNoTexto(…, fim)`
    devolve o fim da letra de antes (o fim de uma seleção fica colado na última letra). O spec da rodada
    1 continua passando.
  - **O teclado** é o de 5.9 para estes tipos, escrito tecla por tecla: Enter (no fim do título e do
    sutil a nova é texto; a citação continua e, vazia, acaba; no começo de uma linha com texto, a vazia
    entra em cima; "---" e Enter é a divisória; numa peça ou no cursor de lacuna, uma linha nova),
    Backspace (no começo, o título, a citação e o sutil viram texto, o recuo volta um nível, a peça de
    cima é selecionada e de novo sai), Delete, Tab e Shift+Tab (sem recuo, o foco sai), as marcas e o
    histórico. O Esc e o Ctrl+Enter passam adiante sem o ProseMirror cancelar a tecla (o editor da ficha
    fecha; o comentário envia). As lições da rodada 0 valem inteiras: o Enter e todo apagar fora da
    composição vêm pelo `beforeinput` (`entrada.ts`, com o `flush`, o `lastIOSEnter` e o
    `Intl.Segmenter`). Os atalhos de digitação: "# ", "## ", "### ", "> ", "-# " e os símbolos (com as
    duplas "≤>", "←>"… dos de três sinais), fora do código e dos links; o Backspace logo depois volta os
    sinais (e eles saem escapados, "-\>").
  - **As abas** viraram Visual (com o carimbo "teste" de caneta azul) e Markdown, com os papéis de tab e as
    setas; o "Ver como fica" saiu (P1). **A régua**: negrito, itálico, riscado e marca-texto com
    `aria-pressed` e a tecla afundada quando ligados; o Formatar marca o estilo da linha do Visual e o
    troca; o Inserir põe a divisória; o desfazer e o refazer são os do ProseMirror; o que o Visual ainda
    não sabe pôr (as listas, a linha dentro do item, os links, os widgets, a tabela, o bloco de código)
    fica apagado (`aria-disabled`) e o toque avisa "Ainda não no Visual: use a aba Markdown" (o Ctrl+K e o
    Ctrl+Shift+7/8/9 também; a imagem colada ou solta também, sem abrir o arquivo por cima do Murall).
  - **A troca de aba com o cursor** (5.7, 5.17): a seleção vai pelas posições do texto, nos dois sentidos.
    A folha do Markdown fica parada no texto de quando o Visual abriu; na volta, o que mudou entra por um
    `insertText`, e o Ctrl+Z do Markdown desfaz o Visual de uma vez (o Ctrl+Y refaz). De volta ao Visual
    sem mudança no texto, ele é o mesmo (com o desfazer dele). A tela cheia no Visual abre outra folha do
    Visual no mesmo ponto do texto (o mesmo estado nas duas é da rodada 8).
  - **Os Ajustes**: Ajustes › Mural › "Jeito de escrever", com a cartela de recortes, "Visual (como no
    Docs)" com o carimbo "em teste" e "Markdown (as marcas à vista)"; o padrão é o Markdown (P2), por
    aparelho (P3), no "Voltar ao padrão" e no `reload` de outra aba, dentro do `Stored` dos Ajustes (sai
    na limpeza do logout, com o teste em `browser-reset.spec.ts`).
  - **Em volta**: o limite da string guardada (a mudança que passa dele não entra, com o aviso; compondo,
    entra, e o excesso sai no `compositionend`); o contador diz no `title` que conta as marcas; o
    placeholder; a folha é `role="textbox"` com `aria-multiline`, o nome e o `aria-describedby` do
    contador, `spellcheck`, `autocapitalize`, `lang`; no celular, a régua presa pelo foco da folha do
    Visual, o "Pronto" e o `scrollMargin` de 120 px embaixo; a letra da folha é a do Markdown (1,14 rem,
    mais de 16 px). A mudança de fora refaz o documento inteiro, com o cursor no mesmo ponto do texto.
  - **Conferido**: os specs novos (`visual-editor.spec.ts`, 31; `rich-editor.visual.spec.ts`, 8; o do
    jeito de escrever nos Ajustes; o do logout), os de hoje do Markdown sem mudar (só saíram os dois do
    "Ver como fica", trocados pelos das abas novas, e o das notas nos Ajustes passou a procurar só as
    três notas), a suíte inteira, `npx ng build`, o smoke da build de produção com o Visual ligado, e o
    roteiro do puppeteer (`.angular/pptr/visual-roteiro.mjs`, fora do git: 17 conferências, todas
    passando no computador e no celular simulado, sem erro no console), com as fotos de perto.
  - **Fica para o celular do usuário** (o site publica no push: Ajustes › Mural › Jeito de escrever ›
    Visual): (1) escrever com acentos, sugestões e ditado, apagar segurado (letra a letra e no começo de
    uma linha embaixo de uma lista, que é um trecho cru: ela é selecionada e de novo sai), Enter no meio,
    no fim e no começo de uma linha, "# " e "->"; (2) tocar no B com uma palavra selecionada (a seleção
    continua e o B acende); (3) tocar num trecho cru e no "Mudar no Markdown"; (4) a régua presa e o
    cursor nunca atrás dela; (5) **o reteste da rodada 0**: o apagar segurado perto e dentro da tabela
    (na prova, `.angular/prova-visual`, porque no site a tabela ainda é trecho cru) e (6) **o iPhone**, que
    nunca foi testado: o Enter (o `lastIOSEnter`), a seleção ao tocar na régua, o zoom (a letra tem mais
    de 16 px) e o tipo próprio na área de transferência no Safari.
  - **Ficou de fora** (das rodadas seguintes, como o plano manda): a Ajuda por modo (rodada 3; só o texto
    dela que falava do "Ver como fica" mudou), a prévia da ficha seguindo o cursor do Visual (rodada 8),
    a mudança de fora só nas linhas mudadas (rodada 8), o copiar com os três tipos (rodada 7).
- 30/out/2026, **a rodada 3, links e código** (por partes, cada uma num commit com push):
  - **O bloco de código** (BUILD 657) deixou de ser trecho cru: é o nó `blocoCodigo` (um `pre.codigo`
    com o `code` dentro, `content: 'text*'`, `marks: ''`, `code: true`), com a letra de máquina e o
    retalho de papel da leitura (o mixin `codigo` de `_formatado.scss`), as quebras dentro, e os
    atributos `cerca`, `margem` e `aberto` do tradutor (a escrita escolhe a cerca maior que qualquer fila
    de crases de dentro; mexido, o sem fecho ganha o fecho, como o plano aceitou). O recuo empurra o
    bloco inteiro (`margin-left`), não só a primeira linha. O teclado: Enter quebra dentro e, numa linha
    vazia no fim, sai do bloco (a linha vazia sai junto; a nova tem o recuo do bloco); Shift+Enter quebra
    sempre; Tab põe dois espaços (com várias linhas selecionadas, em cada uma) e Shift+Tab tira até dois
    (sem nada para tirar, o foco sai); "```" (ou "~~~", com ou sem a língua) e Enter numa linha abre o
    bloco; Ctrl+E (e o botão Código do Formatar) numa linha vazia ou com várias linhas selecionadas faz o
    bloco com as letras delas (o título, a citação e as marcas viram só letras; o trecho cru e a
    divisória entram como o texto deles, como o `code()` do Markdown faz com o que está escrito), e dentro
    do bloco ele volta a ser texto, linha a linha; o Formatar › Bloco de código faz o mesmo, e escolher
    outro estilo dentro do bloco o desfaz antes. Backspace no começo do bloco o volta a texto. As marcas
    (Ctrl+B…) não valem dentro (a tecla fica com o Visual, sem o negrito do navegador); os atalhos de
    digitação também não. **Decidido**: (1) o Delete no fim de uma linha com o bloco embaixo não junta
    os dois (as quebras do bloco não cabem numa linha): a linha vazia sai, a com texto fica; (2) uma
    linha nunca tem quebra dentro: apagar uma seleção do meio de uma linha até o meio do bloco junta os
    dois numa linha, e um plugin (`ajustes.ts`, `semQuebras`) a parte nas quebras, como o Enter; (3) o
    cursor e a seleção dentro do bloco vão e voltam pelas posições do texto na troca de aba
    (`posicaoNoTexto`/`posicaoNoDoc` ganharam o bloco, com a margem do corpo de item e o `\r\n`).
  - **Os links** (BUILD 658), em `ui/visual-editor/links.ts` e no `visual-editor.ts`, com os painéis de
    sempre do `rich-editor.ts` (o Markdown não muda):
    - **O painel do endereço**: o Ctrl+K e o botão da régua pedem o painel ao Visual (`pedeLinkAqui`), que
      responde pelo `pedeLink` com o que vai nele: num link (o cursor ou a seleção dentro dele), o dele,
      para trocar; senão, a seleção (só a parte dela na linha do começo), e o endereço solto selecionado
      vai no campo do endereço, como no Markdown. O trecho mora no Visual e anda com as mudanças (o mapa
      de cada transação), até o painel pôr (`poeLink`), tirar (`tiraLink`) ou fechar (`voltaAoTrecho`,
      que devolve o foco com o trecho selecionado). O link novo leva as marcas de texto da primeira letra
      do trecho. O endereço passa por `linkHref` (o `normalizeUrl` de sempre, os espaços em `%20`, os
      parênteses sem par em `%28`/`%29`; os da Wikipédia ficam): é o F8. Só `https`, `http` e `mailto`.
    - **O clique num link** (sem arrastar, sem seleção): o painel passivo, com o cursor onde a pessoa
      tocou, que fecha quando o cursor sai do link (o `link` do estado do Visual), quando se escreve, ou
      com o Esc (só ele). No Visual o painel do endereço ganha **Abrir** (um link de verdade, aba nova) e
      **Tirar o link**; o do link de anotação, **Tirar o link**. O Ctrl+clique (Cmd no Mac) abre o
      endereço numa aba nova; o `mousedown` com Ctrl no link não é do ProseMirror (que selecionaria a
      linha). O link nunca navega de dentro da folha.
    - **O "[["**: o estado do Visual conta o "[[" aberto antes do cursor (fora do código e dos links) e a
      busca depois dele (`colchetes`), e o editor abre e filtra a lista de sempre, com o mesmo `dismissedAt`
      do Esc. Com a lista aberta (e opções), o Visual deixa passar as setas, o Enter e o Tab (a entrada
      `lista`), que são dela. Escolhida a anotação, o "[[busca" (e um "]]" logo depois) vira o link. O
      painel da régua (Link para outra anotação) abre com a seleção como texto e busca, como no Markdown.
    - **O link de anotação** guarda sempre o título na marca (`ref`), mesmo quando o texto é o próprio
      título: escrever no texto dele muda só o rótulo, e ele sai `[[Título|rótulo]]` (o K8); voltando ao
      título, sai `[[Título]]` de novo. Ele é desenhado por uma `markView` (`eloView`): a caneta azul da
      leitura e, tracejado, quando a anotação não existe (o `.elo.quebrado` da leitura), com o nome dela no
      `title`; as anotações mudando, os links se redesenham.
    - **Os ajustes de 5.2.1** (`linksInteiros`, um `appendTransaction` nas linhas mexidas, fora da
      composição): o colchete digitado dentro de um link sai dele (o F7: o link se parte em dois, com o
      mesmo endereço); os espaços das pontas saem do link; pôr uma marca de texto numa parte do link a põe
      no link inteiro, e tirar de uma parte tira do todo (o `RemoveMarkStep` da transação diz qual foi);
      o link de anotação colado sem título ganha o texto como título. O link não é inclusivo: o que se
      escreve no fim dele e o Enter no fim ficam fora (o K7).
    - **O endereço solto** (`https://…`, `www.…`) vira link no espaço (um atalho de digitação: o Backspace
      logo depois desfaz, e fica o texto, escrito `https\://…`) e no Enter; a pontuação do fim fica de fora,
      como na leitura. **Colar um endereço** com um texto selecionado numa linha faz o link do texto.
    - **Decidido**: (1) no tradutor, a escrita mais curta passou a ter duas passadas (`escreverPecas`): o
      endereço solto seguido de um ponto ("www.x.com.") só podia sair solto depois de o ponto perder a
      barra (com "\." depois, a leitura levava a barra para dentro do endereço), e saía `[www.x.com](…)`;
      (2) o Ctrl+K no bloco de código e numa peça não faz nada; (3) o link pego pela metade num Ctrl+E (o
      código não convive com link) se parte, como o colchete.
    - **Achado no puppeteer**: um robô que aperta as setas e logo escreve age antes do `selectionchange`
      (o R9), e as marcas guardadas (`storedMarks`) do link recém-posto ainda valiam: a letra saía sem o
      link, partindo-o. O link posto não guarda mais marcas para a próxima letra (não precisa: ele não é
      inclusivo).
  - **A Ajuda por modo** (BUILD 659, `ui/markup-guide.ts`): na aba Visual, `GUIDE_VISUAL`, em três
    partes (os atalhos de teclado; os de digitação no começo da linha; os do meio da linha, com o "[["
    só onde há anotações, o endereço que vira link, as setas, os sinais e o Backspace que desfaz o
    atalho), sem nenhuma marca do Markdown, e no fim "No Markdown, as marcas aparecem como texto: veja a
    aba Markdown", com o aviso de que as listas, as tabelas e os widgets, por enquanto, só mudam nela
    (**a rodada 4 e as seguintes tiram cada um desse aviso e põem os atalhos deles na Ajuda**). No
    Markdown, a de sempre. No toque, o que é só um atalho de teclado (sem jeito de escrever nem nota) sai.
  - **Conferido** em cada passo: os specs novos (`visual-editor.spec.ts`, os do bloco e dos links;
    `rich-editor.visual.spec.ts`, os painéis, a lista do "[[", a Ajuda; `rich-doc.spec.ts`, o cursor no
    bloco), os do Markdown sem mudar, a suíte inteira, `npx ng build` (o pedaço do Visual em 75,7 KB
    comprimido; o inicial não cresceu), o smoke da build de produção com um bloco de código guardado, e
    o roteiro do puppeteer da rodada (`.angular/pptr/visual-r3.mjs`, fora do git: o bloco, os links, a
    lista do "[[", o rótulo do link de anotação, o Ctrl+clique, a Ajuda), no computador e no celular
    simulado, sem erro no console, com as fotos de perto.
  - **Fica para o celular do usuário**: (1) o bloco de código com o teclado do sistema: o Enter dentro
    (pelo `beforeinput`, como o resto), o Enter que sai do bloco, o apagar segurado dentro dele e no
    começo dele (o bloco volta a texto), e a letra de máquina sem zoom no iPhone; (2) tocar num link: o
    painel passivo sem o teclado pular, o Abrir, o Tirar o link; (3) o "[[" com o Gboard: a lista filtra
    enquanto a palavra ainda está sublinhada (o estado lê o "[[" também compondo; ler não mexe no texto),
    e tocar numa anotação da lista no meio da composição põe o link certo; (4) escrever no meio de um link de
    anotação com sugestões do teclado (o rótulo muda, o título fica); (5) o endereço que vira link no
    espaço do teclado do celular (o espaço do Gboard pode chegar como composição); (6) a Ajuda no celular.
- 30/out/2026, **a rodada 4, listas e tarefas** (em dois commits, com push):
  - **O desenho num parcial** (be50ebc, BUILD 660): o ponto, o lugar e o desenho do número, a caixinha a
    caneta, o tique da feita, a tarefa feita riscada, o corpo da feita e o respiro depois do item com
    corpo viraram mixins só de declarações em `ui/_formatado.scss` (os seletores ficam com quem usa). O
    CSS compilado da leitura saiu igual, byte a byte.
  - **O nó `item`** (BUILD 661): `tipo` (`ul`, `ol`, `check`), `feita`, `numero` (o escrito) e o `recuo`,
    uma linha do texto cada, desenhado pela peça `ItemView` (`ui/visual-editor/listas.ts`): o ponto e o
    número no `::before` da linha (como o `li` da leitura), a caixinha da tarefa num `span` não editável
    com `role="checkbox"` e `aria-checked`, que segura o foco no `pointerdown`/`mousedown` e marca no
    `click` (o `touchstart` nunca é cancelado). Com o item, as listas deixaram de ser trecho cru; ficam
    crus só a tabela e o widget.
  - **Os números, o corpo e a feita vêm do leitor** (5.6): o plugin `desenhoDasListas` escreve o texto
    (o `escrever` de sempre, com as fontes guardadas), roda o `parseRich` e decora cada linha: `data-n` (o
    número da leitura, com o do pai na frente no "1.1."), `--pre-n`, `--vis-corpo` (o lugar da descrição,
    a soma dos lugares dos marcadores de fora, em letras da folha: `--vis-letra`), `--vis-tira` (o recuo
    que o corpo come; o resto aparece como na leitura), `vis-feita` (a descrição de uma tarefa feita,
    riscada junto) e `vis-respiro` (a linha de respiro depois do item com corpo). Ele só reroda quando a
    estrutura muda (os nós, o tipo, o recuo, o número, a feita, a linha que passa de vazia a escrita, o
    texto dos trechos crus); durante a composição só acompanha as letras, e no `compositionend` refaz.
  - **As teclas** perguntam ao texto escrito com as funções do Markdown (`ownerItem`, `bodyIndent`,
    `itemEnd`, `nextNumber`, `renumberAfter`), por um mapa nó ⇄ linha do texto (`mapaDe`, com o tradutor à
    mão dos comandos pelo plugin `escritor`): Enter no item com texto faz o item novo do mesmo tipo (a
    tarefa por fazer, o número seguinte, os de baixo descendo exatamente como no Markdown); no fim de um
    item com descrição, o novo vem depois dela; no começo de um item com texto, um item vazio entra em
    cima (o de cima fica com o número, este desce com o seguinte); no item vazio a lista acaba (a linha
    vira texto sem recuo); na descrição, o próximo item. Shift+Enter (e "Linha dentro do item") abre a
    linha no recuo do texto do item. O Enter e o Shift+Enter do teclado do celular vêm pelo
    `beforeinput` (o `insertLineBreak` agora chama o Shift+Enter). Ctrl+Alt+Enter marca a tarefa do
    cursor ou a de quem a linha é a descrição.
  - **Os atalhos de digitação** "- ", "* ", "+ ", "1. " (qualquer número, e "1.1. "), "[] ", "[ ] " e
    "- [ ] " (o "[ ] " num item vira tarefa), em qualquer recuo; o Backspace logo depois desfaz. **A
    régua** e o Ctrl+Shift+7/8/9 nas linhas da seleção (a regra do `list()`), com o botão da lista
    afundado (`aria-pressed`) na linha do cursor; a "Linha dentro do item" acesa. **A Ajuda** do Visual
    ganhou os atalhos das listas, e o aviso do fim fala só das tabelas e dos widgets.
  - **Decidido nesta rodada**: (1) **o Tab num item leva a descrição e os itens de dentro junto** (como no
    Docs; o Markdown move só a linha): com um bloco de código ou um trecho cru no corpo, só ele anda. (2)
    **O numerado que muda de nível ganha o número do lugar novo** (1 numa lista nova, o seguinte ao do de
    cima no mesmo nível), e os de baixo seguem (`renumberAfter`): sem ver o texto, ninguém conserta um
    "3." que ficou num item de dentro. (3) **Sair de uma descrição é um passo que se vê**: o Backspace no
    começo dela e o Shift+Tab nela levam o recuo para o par logo abaixo de onde a descrição do item
    começa (ela sai do item), em vez de 2 colunas (de 6 a 4 nada mudava na tela); fora de descrição,
    continua o de 2 em 2. (4) **O Enter na descrição só vale na linha de texto** (no título, na citação ou
    no sutil dentro de um item, o Enter é o deles). (5) **O "Texto normal" do Formatar deixa o item**
    (como o Markdown, que só tira as marcas do título, da citação e do sutil); o título, a citação e o
    sutil trocam o item pelo estilo deles. (6) **Na régua, a linha em branco no meio da seleção não
    conta** para "todas já são do tipo" (no Markdown, com uma linha em branco no meio, a lista nunca
    voltava a texto). (7) O Ctrl+Alt+Enter mora no plugin que vê o teclado antes do ProseMirror: no
    Chrome do Android ele deixa todo Enter para o `beforeinput`, que não vem com o Ctrl (achado no
    puppeteer com a identidade do Pixel 5). (8) O marcador escrito à mão ("* ", "1)", "[X]") vira o de
    sempre só na linha mexida (o F14, aceito).
  - **Conferido**: os specs novos (`listas.spec.ts`, 24: os números de L1, o corpo e a feita, cada Enter,
    Shift+Enter, Backspace (L3), Tab com a descrição e o número do nível, L2, a caixinha e o
    Ctrl+Alt+Enter (L6), os atalhos, a régua (L5), o beforeinput; `rich-editor.visual.spec.ts`, a régua e
    o Ctrl+Shift+9, a Ajuda), os de antes (os que usavam a lista como exemplo de trecho cru passaram a
    usar a tabela e o widget), a suíte inteira, `npx ng build`, o smoke da build de produção com listas
    guardadas, e o roteiro do puppeteer (`.angular/pptr/visual-r4.mjs`, fora do git: listas escritas de
    verdade, o Enter que renumera, a descrição, a caixinha pelo toque, o Ctrl+Alt+Enter, o Backspace, a
    régua acesa e, no celular simulado com a identidade do Pixel 5, o Enter do Android no item), sem erro
    no console, com as fotos de perto.
  - **Fica para o celular do usuário** (a rodada pede aparelho): (1) o Enter no item com o Gboard (o
    `insertParagraph` no contentDOM da peça), no item vazio, na descrição, e o Enter de uma sugestão do
    teclado no fim do item; (2) tocar na caixinha: marca sem abrir o teclado nem mover o cursor (L6), e
    com o teclado aberto; (3) "- " e "1. " com o espaço do Gboard (que pode vir como composição: o atalho
    espera o `compositionend`); (4) o apagar segurado começando no meio de um item, passando pelo marcador
    e pela linha de cima; (5) a "Linha dentro do item" pela régua presa em cima do teclado; (6) o iPhone:
    o cursor perto da caixinha e do número, e o Enter (o `lastIOSEnter`).
- 30/out/2026, **a rodada 5, os widgets como peças** (BUILD 662, com push):
  - **O nó `widget`** (`schema.ts`): um átomo de bloco (`nome`, `args` como o registro os lê, sem o
    tamanho, `tamanho`, `recuo` e a `fonte`), escrito por `widgetLine` (o tradutor já sabia). O widget de
    um nome desconhecido continua texto (a leitura também o mostra assim); a marca do jeito da tabela
    sozinha fica crua (a tabela é da rodada 6). Com ele, só a tabela continua trecho cru. O texto que
    começa com uma peça abre com o cursor de lacuna antes dela (o `Selection.atStart` selecionava a peça,
    e a tirinha apareceria sem ninguém tocar).
  - **A peça** (`ui/visual-editor/pecas.ts`, `WidgetView`): o `app-note-widget` de sempre, criado à mão
    (`createComponent` com o injetor do editor num `<app-note-widget class="widget">`, `attachView`),
    desmontado no `destroy` (W3, o spec conta as vistas); o `update` só troca as entradas que mudaram,
    sem recriar (W2: o spec confere que o `app-glued-media` é o mesmo elemento depois de escrever em
    outra linha e depois de mudar a legenda). O nome para o leitor de tela no `aria-label` ("Widget:
    Contador, Natal", por `widgetSpoken` do registro). Os controles de dentro (tocar o vídeo e o som,
    ampliar, a barra da fita, o campo) ficam com eles (`stopEvent`): tocar o vídeo no editor funciona e
    não seleciona a peça. **Achado**: o `closest()` dos controles achava a própria folha (ela é
    `contenteditable=true`) e o toque nunca selecionava a peça; agora só conta o controle de dentro dela.
  - **As teclas** (5.9): o toque seleciona a peça inteira (W1); Delete e Backspace a tiram (o Ctrl+Z
    volta); Enter abre uma linha embaixo; o Backspace no começo da linha de baixo a seleciona. No Chrome
    do Android, com a seleção numa peça, o navegador não manda nada no Enter nem no apagar (o
    ProseMirror deixa o Enter para ele): o Enter, o Backspace e o Delete numa peça (ou no cursor de
    lacuna) vêm pelo `keydown`, antes do ProseMirror (conferido com a identidade do Pixel 5). O cursor
    de lacuna antes e depois das peças (K2), no começo e no fim do texto e entre duas peças.
  - **A tirinha** (a de sempre do `rich-editor.ts`): o estado do Visual conta a peça selecionada
    (`peca`), e a tirinha passiva aparece com o nome e o resumo; sair dela a fecha. O Tab com a peça
    selecionada vai ao campo dela (se tem) e, de lá (ou sem campo), ao Editar da tirinha; o Shift+Tab no
    campo volta à folha. Editar abre a folha do widget com os valores do nó; o Visual guarda o lugar
    (`lugarDaPeca`, que anda com as mudanças) e o editor troca o nó no `close` (`poePeca`, `tiraPeca`,
    `voltaAPeca`): com a folha modal aberta, o ProseMirror não recebe nada (W4).
  - **O Inserir** põe cada widget no Visual (a folha; ao pôr, as regras do `writeWidget`: no lugar de
    uma linha vazia, ou numa linha só dele depois da do cursor, com o recuo da descrição dentro de um
    item, `poeNoLugar`); a peça posta fica selecionada (a tirinha confirma). **A tabela continua apagada
    no Visual** (o menu "Tabela" e a tabela direto são a rodada 6).
  - **Escrever direto na peça** (`WidgetField.inline` no registro: o convite do campo; `inlineField`,
    `withInlineText`): os componentes `GluedMedia`, `Countdown` e `AudioTrack` ganharam a entrada
    `editavel`, que troca o texto por um `<input class="campo-peca">` no mesmo lugar (a etiqueta, a faixa
    da polaroide, o lado do contador, as placas do neon e do placar, a etiqueta da fita, o adesivo e o
    envelope do vinil, a tira simples), com a letra dela (o estilo do campo mora no Visual:
    `font: inherit`, um pontilhado a lápis embaixo que vira traço de caneta escrevendo, o convite a
    lápis). A peça selecionada é editável; sem legenda, o lugar dela aparece com o convite. Enter ou
    sair grava (uma mudança no histórico, a peça continua selecionada), Esc volta ao que estava. O valor
    passa pelos campos do widget (`read`/`write`, como a folha: o título "Neon" vai depois do jeito); o
    "|" vai escapado (`escapeArg`, agora exportado) e o "}}" vira "} }", com o aviso miúdo embaixo da
    peça enquanto se escreve (W5). **Sem `editavel`, nada muda**: o DOM das peças na leitura é o mesmo
    (só a ordem do `aria-hidden` no HTML, que o Angular agora põe por ligação), e as fotos de antes e
    depois (`.angular/pptr/visual-r5-leitura.mjs`, com a hora parada e a rede cortada) só diferem no
    ruído que duas fotos da mesma versão também têm; o spec `ui/widget-editavel.spec.ts` confere o texto,
    o `aria-hidden` e a falta do campo. **Achado**: no celular simulado, o toque no campo deixava o foco
    na folha (o campo mora dentro dela); a peça dá o foco ao campo no próprio toque.
  - **Decidido**: (1) **escrever com a peça selecionada não a apaga** (o Docs apagaria): as letras vão
    para uma linha nova embaixo dela, no recuo dela (no Android também, pelo teclado sem composição; a
    letra composta pelo Gboard com a peça selecionada fica para o aparelho). (2) **A peça só se arrasta
    selecionada** (o ProseMirror a deixa arrastável enquanto se aperta): arrastável sempre, o toque no
    campo, no celular, não dava o foco a ele. Solta no meio de uma linha, ela vai para uma linha só dela,
    embaixo (W6), com o recuo do lugar novo. (3) Enter na peça selecionada abre a linha embaixo (5.9),
    não o Editar (5.22 dizia "Enter abre Editar"): o Editar fica no Tab, que leva à tirinha.
  - **A imagem colada ou solta** (`putImage` no Visual): o Visual recebe a imagem sem texto junto (o
    `handlePaste` e o `handleDrop`, com o lugar do ponto onde ela foi solta), põe o marcador "Guardando a
    imagem…" (uma decoração que anda com as mudanças; o trecho dela apagado, ela entra onde o cursor
    estiver) e pede ao editor (`imagem`), que a encolhe, guarda e devolve o endereço (`poeImagem`); se não
    entrar, o marcador sai (`tiraMarca`). Escreveu enquanto ela era guardada: o cursor fica com quem
    escreve (W7). A imagem de outra pessoa (`adoptImages`, que agora recebe quem troca o endereço) troca o
    id dentro do nó, fora do histórico (o Ctrl+Z tira o colar inteiro).
  - **A Ajuda** do Visual ganhou a parte "Widgets", e o aviso do fim fala só das tabelas.
  - **Conferido**: os specs novos (`pecas.spec.ts`, 22; `widget-editavel.spec.ts`; os do editor com a
    tirinha, o Inserir com a folha e a imagem colada), os de antes (o trecho cru de exemplo passou a ser a
    tabela), a suíte inteira, `npx ng build`, o smoke da build de produção com widgets e uma imagem colada
    guardados, e o roteiro do puppeteer (`.angular/pptr/visual-r5.mjs`, fora do git: o toque, a tirinha, o
    título e a legenda escritos direto, o Tab, Delete e Ctrl+Z, o vídeo tocando, o Inserir com a folha, a
    imagem colada e, com a identidade do Pixel 5, o Enter e as letras com a peça selecionada), no
    computador e no celular simulado, sem erro no console, com as fotos de perto.
  - **Fica para o celular do usuário**: (1) tocar numa peça (seleciona, sem abrir o teclado à toa) e no
    campo da legenda: o teclado abre, o campo fica à vista acima da régua presa (W8), o Enter do teclado
    grava; (2) com a peça selecionada, o Enter e o apagar do Gboard, e uma palavra composta (com
    sugestão) escrita com ela selecionada; (3) tocar o vídeo e o áudio dentro do editor; (4) arrastar a
    peça com o dedo (no celular o arrastar do `contenteditable` é frágil; se não der, fica pelo
    Recortar/Colar); (5) colar uma foto da galeria (o marcador e a peça); (6) o iPhone: o cursor perto das
    peças (5.20, as linhas de respiro), o campo sem zoom (no iPhone, só lá, o campo fica com 16 px enquanto se
    escreve, porque a legenda da etiqueta e o nome da faixa são menores: conferir que não pula).
- 30/out/2026, **a rodada 6, a tabela direto na folha** (em dois commits, com push):
  - **O desenho num parcial** (61fb4fc, BUILD 663): o rolo, o papel, a tabela, a célula, o cabeçalho e os
    cinco jeitos viraram mixins só de declarações em `ui/_formatado.scss`, com os comentários de dentro
    das regras no lugar deles (o CSS compilado da leitura saiu igual, byte a byte).
  - **O nó `tabela`** (BUILD 667; no meio entraram três commits de outras sessões, 664–666): `tabela` ›
    `fileira` › `cabeca` (só na primeira) e `celula`, cada célula com letras e marcas (`inline*`), com o
    `prosemirror-tables` 1.8.5 (versão exata; a seleção de várias células, as setas entre elas, o colar de
    células e o conserto de tabela torta), no pedaço preguiçoso do Visual. Na tela, uma `<table>` de
    verdade dentro do rolo e do papel da leitura (o `toDOM`, sem peça própria), as fileiras num `<tbody>`
    só, o cabeçalho em `<th scope="col">` com o `.th-texto` da leitura; os seletores das listras e do
    tracejado do recibo contam a primeira fileira como cabeçalho. A tabela deixou de ser trecho cru: agora
    nenhum tipo de linha é cru; o cru fica só para o que o tradutor não escreve igual (os casos sabidos da
    rodada 1, como a linha com cara de widget e lixo depois).
  - **Os atributos**: na `tabela`, `jeito` (null é a branca, sem a marca), `alinhar` (a verdade, um por
    coluna) e o `recuo`; na `fileira`, `sobra` (as células escritas além das do cabeçalho, que andam com
    a fileira quando ela muda de lugar); na célula, o `alinhar` da coluna (só para o desenho, copiado da
    tabela) e o `colspan`, o `rowspan` e o `colwidth` que o `prosemirror-tables` lê, sempre 1, 1 e nada.
    O plugin `tabelasRetas` (depois do conserto do `prosemirror-tables`) desfaz a célula mesclada que chegar
    (fica o conteúdo na de cima à esquerda e células vazias no resto), põe o cabeçalho na primeira fileira e
    só nela e copia o alinhamento de cada coluna nas células.
  - **O tradutor** (`core/rich-doc.ts`): **mexer numa célula reescreve só a fileira dela** (o I2 na
    tabela, que o plano não tinha pedido): a escrita lê a tabela da fonte e devolve, como estavam, o
    cabeçalho, a linha de traços (se o alinhamento não mudou), a marca do jeito e cada fileira que não
    mudou (procurada pela chave, então a fileira que trocou de lugar leva a escrita dela), com o mesmo recuo
    e o mesmo número de colunas; senão, a tabela inteira sai do jeito de sempre (a trava confere tudo, como
    sempre). O cursor numa célula vai e volta pelas posições do texto (`posicaoNaTabela`, e o
    `posicaoNoDoc` diz a célula): a troca de aba, o texto que chega de fora e o ajuste da tela não levam
    mais o cursor para o começo da tabela.
  - **As teclas** (5.9, `ui/visual-editor/tabela.ts`): Enter desce de célula e, na última fileira, cria
    outra (até 200); Shift+Enter sobe (no cabeçalho, fica); o endereço solto antes do cursor vira link, como
    no fim de uma linha. Tab vai para a próxima célula com o que tem nela selecionado (como o
    `goToNextCell`), e na última cria a fileira; Shift+Tab volta, e na primeira passa (o foco sai: o Tab
    nunca prende). As setas e o Shift+setas são do `prosemirror-tables`. O Enter e o Shift+Enter do
    teclado do celular (o `insertParagraph` e o `insertLineBreak`) fazem o mesmo, pelo `beforeinput`.
    Ctrl+E na célula é só a marca (a célula não guarda bloco); os atalhos de bloco ("- ", "# ") não valem
    nela. Ctrl+A seleciona tudo (o `AllSelection`), e apagar deixa a folha vazia (K6).
  - **As lições do Android** (a rodada 0): o Backspace no começo de uma célula passa para o fim da de
    antes, sem juntar (na primeira, para); o Delete, o espelho; o cursor de lacuna logo depois (ou antes) de
    uma tabela entra nela. Na linha logo depois da tabela, o Backspace no começo leva ao fim da última
    célula (a linha vazia sai; o título, o item e o recuo continuam desfeitos antes, como nas outras linhas);
    o Delete no fim da linha antes dela, o espelho. **Uma seleção que toca uma tabela** (começa ou acaba
    nela, ou a atravessa) **só tira texto**: o de cada linha e de cada célula do trecho; as linhas e as peças
    que ficam inteiras dentro dele saem; fileiras e colunas nunca saem. Vale para o Backspace, o Delete e o
    `beforeinput` e, como ficou anotado na rodada 0, **para escrever, colar e recortar por cima dela**
    (`protegeTabela`): a letra (`handleTextInput` e o `insertText` do teclado do celular, cancelado e feito
    pelo editor), o colar (o trecho sai antes, e o colar segue no lugar do cursor) e o recortar (o
    navegador recebe o trecho, e só o texto sai). A composição do teclado não se cancela: no
    `compositionstart`, o trecho já sai. Também: o apagar de uma letra pelo `beforeinput` só vale numa linha
    de letras (um cursor entre blocos é coisa de borda), achado no spec da rajada.
  - **Colar numa célula**: o texto com tab (de uma planilha) vira células, que o `prosemirror-tables`
    espalha a partir da do cursor, com as fileiras e as colunas que faltarem, cortadas no limite (12 e 200);
    sem tab, as linhas se juntam com espaço e são lidas como o texto das anotações (com Ctrl+Shift+V, como
    letras). O que vem do próprio Visual ou de fora com linhas e blocos vira as letras deles, juntas com
    espaço (`transformPasted`); as células de outra tabela continuam células. A quebra que chegar numa
    célula vira espaço (`semQuebras`), e os ajustes dos links (5.2.1) valem nas células.
  - **Duas tabelas seguidas** (a de baixo sem a marca do jeito) seriam lidas como uma só: entre elas entra
    uma linha vazia (achado no spec da célula mesclada; acontecia também com o Inserir › Tabela com o
    cursor numa tabela).
  - **O Inserir › Tabela** no Visual põe a tabela 3×2 direto (as regras do widget: no lugar da linha
    vazia, ou numa linha depois da do cursor; dentro de um item, no recuo da descrição; com o cursor numa
    tabela, depois dela), com o cursor na primeira célula. O widget Tabela do Inserir deixou de ficar
    apagado.
  - **O menu "Tabela"** na régua, enquanto o cursor está numa tabela (o botão some fora dela, e o menu
    aberto fecha): "Fileiras e colunas" (Fileira em cima, Fileira embaixo, Coluna antes, Coluna depois;
    Subir e Descer a fileira, Levar a coluna para a esquerda e para a direita), "Alinhar a coluna" (No
    começo, No meio, No fim, marcado o da coluna do cursor; com várias células selecionadas, em todas as
    colunas delas), o "Jeito" (as cinco miniaturas da folha da tabela, a escolhida torta e presa com a
    tachinha, como na folha), Tirar a fileira, Tirar a coluna, Tirar a tabela e **Abrir na folha** (a folha
    da tabela de sempre, com a tabela do cursor; ao salvar, a tabela do Visual é trocada, com o recuo dela;
    Tirar, ela sai; fechar, o cursor volta para onde estava). Cada mudança é um passo do desfazer. As
    miniaturas moram agora num componente só (`ui/table-look-art.ts`), usado pela folha da tabela e pelo
    menu (`ui/table-looks.ts`): a folha desenha exatamente o mesmo SVG.
  - **Decidido nesta rodada**: (1) **o menu segue a régua da grade da folha**, não a do
    `prosemirror-tables`: o cabeçalho fica no lugar (Fileira em cima, Subir e Descer, Tirar a fileira
    apagados nele), a única fileira de baixo não sai, a única coluna não sai; o que não vale fica apagado
    (`aria-disabled`), como o botão da grade. (2) **Os comandos do menu refazem a tabela pela grade**
    (trocar a tabela inteira num passo) em vez dos comandos do `prosemirror-tables`, para o cursor ficar na
    célula certa (os de mover do `prosemirror-tables` selecionam a fileira inteira). (3) **O Enter desce sem
    apagar a seleção** que estiver dentro da célula. (4) **Tab seleciona o conteúdo da próxima célula**
    (como no Docs e no `goToNextCell`). (5) **A seleção que atravessa a tabela tira as linhas inteiras de
    dentro do trecho** (no protótipo da rodada 0 elas ficavam vazias); as das pontas ficam, sem se juntar.
    (6) **O Ctrl+A apaga tudo, a tabela junto**: selecionar tudo é de propósito (o apagar rápido do Gboard
    nunca seleciona assim). (7) As células selecionadas juntas aparecem com o marca-texto amarelo por
    cima (o mesmo do item marcado nos menus), e o cursor some enquanto elas estão selecionadas. (8) Na
    tabela larga, o rolo anda de lado até a célula do cursor (o ProseMirror rola os rolos também), com uma
    folga de 12 px. (9) O texto copiado de uma tabela (o `text/plain`) sai uma fileira por linha, com as
    células separadas por tab, como uma planilha (o copiar de verdade é da rodada 7).
  - **A Ajuda** do Visual ganhou a parte "Tabela", e o aviso do fim não fala mais dela (o fim só lembra a
    aba Markdown).
  - **Conferido**: os specs novos (`tabela.spec.ts`, 35: I1 e o desenho, I2 por fileira, T1–T8, K6, K9,
    cada tecla, a rajada do Gboard e o caso do quarto relatório com seleções por pedaços, escrever, colar e
    recortar por cima, o colar de planilha, o menu e os limites, o cursor de ida e volta; os da tabela em
    `rich-doc.spec.ts`; o menu, o Inserir e o "Abrir na folha" em `rich-editor.visual.spec.ts`), os de antes
    (os exemplos de trecho cru passaram a ser a linha com cara de widget e lixo depois), a suíte inteira,
    `npx ng build`, o smoke da build de produção com as cinco caras da tabela guardadas, e o roteiro do
    puppeteer (`.angular/pptr/visual-r6.mjs`, fora do git: escrever, Tab, Enter, as células selecionadas e
    o negrito em todas, o menu e as miniaturas, o Abrir na folha, o Inserir, a tabela larga rolando de lado
    e, com a identidade do Pixel 5, o Enter do Android, a rajada e o apagar por pedaços), no computador e no
    celular simulado, sem erro no console, com as fotos de perto.
  - **Fica para o celular do usuário** (o primeiro da lista é o mais importante): (1) **segurar o apagar
    dentro e perto da tabela com o Gboard** (devagar e rápido, começando no meio de uma célula, na linha de
    baixo e na de cima): nenhuma fileira nem coluna pode sair; (2) selecionar um trecho que atravessa a
    tabela e escrever uma letra por cima, com e sem sugestão do teclado (a composição que começa por cima da
    seleção é o caso que o puppeteer não faz); (3) o Enter do Gboard na célula e na última fileira; (4)
    tocar numa célula (o cursor entra, o teclado abre) e numa célula vazia do cabeçalho; (5) a tabela larga
    rolando de lado com o dedo, e o cursor indo para a célula escondida pelo Tab da régua presa (não há Tab
    no teclado do celular: conferir se faz falta um "Próxima célula" na régua); (6) o menu Tabela pela régua
    presa em cima do teclado (ele abre para cima) e as miniaturas tocáveis; (7) colar de uma planilha do
    celular (o Planilhas Google manda o tab?); (8) o iPhone, que nunca foi testado.
- **Rodada 7 (30/out, BUILD 668): colar e copiar.**
  - **Copiar e recortar** (`ui/visual-editor/copiar.ts`, um plugin antes do ProseMirror e da tabela, que
    cancela o evento): a área de transferência recebe o `text/plain` limpo (o `copyText` de sempre: sem as
    marcas, os widgets em palavras; C6), o `text/html` formatado (títulos `h1`–`h3`, `ul`/`ol` aninhadas pelo
    recuo, a tarefa com ☐ ☑ e a feita riscada, a citação, o `pre`, a tabela com `thead` e o alinhamento, as
    marcas em `strong`, `em`, `s`, `mark`, `code`, `small`, o link só `https`/`http`/`mailto`, a imagem de
    `https:` como `<img>`), montado por elementos num documento à parte (nada carrega, nada do que se
    escreveu vira etiqueta), e o `text/x-murall-markdown` escrito pelo tradutor (as linhas inteiras com a
    fonte delas: saem como estavam escritas). O HTML leva o mesmo markdown num atributo
    (`data-murall-markdown`), para o colar no Visual funcionar quando o navegador não deixar o tipo próprio
    chegar (C10, o Safari). Um pedaço de dentro de uma linha leva só as letras (colado no meio de outra, não
    vira título nem item); o pedaço de dentro de uma lista vem para a margem (o recuo comum sai). Recortar é o
    mesmo, e a seleção que toca uma tabela só tira texto (o `cut` de `protegeTabela` saiu: era o mesmo).
  - **Células selecionadas** vêm do `prosemirror-tables` como fileiras soltas: o copiar põe a tabela em volta
    delas (o jeito da de origem, o alinhamento das colunas delas, sem as células de sobra), e o texto sai
    como uma planilha, uma fileira por linha e as células separadas por tab (a decisão 9 da rodada 6 vale
    para quando o que se copia é só tabela; com outras linhas junto, o texto é o `copyText` de sempre, em que
    a tabela sai com " · "). Achado no spec: antes disso, copiar células deixava a área de transferência vazia.
  - **Colar** (`ui/visual-editor/colar.ts`, na ordem de 5.16): o tipo próprio (ou o atributo do HTML do
    Visual) lido como markdown, com tudo (C5); a imagem sozinha continua com `pecas.ts`; o HTML de fora
    traduzido (`ui/visual-editor/html.ts`); o texto com tab em várias linhas, todas com as mesmas colunas
    (pelo menos 2), vira uma tabela nova fora de uma tabela (`sliceDaPlanilha`, a primeira fileira é o
    cabeçalho, nos limites de 12 × 200; o código com tab no começo das linhas não é planilha); dentro de
    uma, espalha (rodada 6); o texto puro, lido como markdown (P5). Ctrl+Shift+V (o `shiftKey` do
    ProseMirror, sem o Shift+Insert) cola como letras, sem ler o HTML nem o tipo próprio (C8). No bloco de
    código, as letras. Na linha vazia (sem recuo), o que se colou toma o lugar dela inteiro (o título colado
    continua título). Numa célula, as linhas viram letras e as células de outra tabela se espalham.
  - **O HTML de fora** (`html.ts`, lido por `DOMParser`, nada roda): o que o Murall tem e só isso. Os casos
    sabidos: o `<b id="docs-internal-guid">` do Docs não é negrito (o `font-weight` do estilo vale sobre a
    etiqueta, C1), as marcas do Docs vêm do estilo de cada pedaço, o realce (cor do fundo) só vale como
    marca-texto vindo do Docs ou do Word (num site, o fundo é enfeite), a lista de tarefas do Docs (`role=
    checkbox`, `aria-checked`) e a caixinha dele (uma imagem) que não é imagem; o Word: os parágrafos com
    `mso-list` viram itens com o nível e o número (o marcador `mso-list:Ignore` sai, C2), **cada lista do
    Word (o `lN`) conta de novo** (achado no spec: a numerada depois da de marcadores continuava a contagem
    dela), o `MsoTitle` é o título 1, o `mso-highlight` é marca-texto; os sites: `script`, `style`, botões,
    formulários e mídia não entram, o link `javascript:` fica só o texto (C3, C4), o pixel de contagem (1×1)
    não é imagem, h4–h6 viram o 3, a fonte de máquina é código, o `white-space: pre` guarda os espaços. A
    tabela: a primeira fileira é o cabeçalho, a mesclada fica na de cima à esquerda e as cobertas vazias, o
    que tem bloco dentro vira uma linha só, as fileiras e colunas vazias do fim saem (o Excel manda de
    sobra), o alinhamento da coluna é o que todas as células de baixo dizem (os números à direita do Excel),
    uma célula só são as letras dela. A imagem: `https:` vira o widget de imagem pelo link; `data:` é
    guardada como colada (com o marcador "Guardando a imagem…", até 20 por colar); `file:`/`cid:` (do Word) e
    o resto não vêm, e o aviso diz "1 imagem não veio: cole ela sozinha"; a pequena (até 32 px) no meio das
    letras é o `alt` dela (o emoji, o ícone); **a grande no meio das letras parte a linha** (achado no spec:
    a do Word vem dentro do parágrafo e sumia sem aviso).
  - **O limite** (5.18, C9): o que passaria dele entra até onde cabe, pelas linhas inteiras do que se colou
    (a busca binária no número de linhas), com o aviso "Parte do que foi colado não coube: chegou no limite
    de N caracteres" (ou "O que foi colado não coube", e nada entra). O colar de sempre do ProseMirror
    também passa por aí.
  - **O Markdown** também usa a área de transferência do Murall (`core/transferencia.ts`, no carregamento
    inicial, longe do ProseMirror): copiar e recortar põem o tipo próprio junto do texto (o mesmo markdown;
    o recortar pelo `execCommand`, que entra no desfazer); colar o que veio do Visual lê o tipo próprio, e
    não o texto limpo (C7), cortado por linhas inteiras e fora de um bloco de código perto do limite
    (`cortarPorLinhas`), com o mesmo aviso. As imagens de outra pessoa (a cópia que vira sua) são
    procuradas no markdown, também no Visual: o texto limpo não tem os endereços delas.
  - **A Ajuda** do Visual ganhou a parte "Colar e copiar" (Ctrl+C, Ctrl+V, Ctrl+Shift+V, o limite).
  - **Conferido**: o spec novo (`ui/visual-editor/colar.spec.ts`, 27: as amostras do Docs, do Word, de um
    site e do Excel em `lerHtml`, C1–C4; `cortarPorLinhas` e o atributo do HTML; copiar nos três tipos, o
    pedaço de dentro da linha e da lista, recortar, a tabela e as células selecionadas; colar o tipo
    próprio, o atributo sem ele, do Visual para o Visual, o Docs, o Word com o aviso da imagem, a imagem
    `data:`, o texto puro e o Ctrl+Shift+V, a planilha e o código com tab, o bloco de código, o limite com
    parte e sem nada, o HTML numa linha vazia entre outras); os do Markdown em `rich-editor.spec.ts` (copiar,
    recortar, colar do Visual, o limite); a suíte inteira; `npx ng build`; e o roteiro do puppeteer na build
    de produção (`.angular/pptr/visual-r7.mjs`, fora do git, que é também o smoke: a área de transferência de
    verdade do Chrome pelos comandos Copy, Cut e Paste do teclado, copiar do Visual e colar no Markdown, do
    Markdown para o Visual, o HTML do Docs e do Word escritos pela API da área de transferência, a planilha,
    o Ctrl+Shift+V e a Ajuda), no computador e no celular simulado, com as fotos de perto.
  - **Fica para o aparelho de verdade**: (1) colar do Docs, do Word e do Excel de verdade (as amostras do
    spec foram escritas como eles mandam, não copiadas deles); (2) o Safari (C10: o tipo próprio chega? o
    atributo no HTML segura?); (3) o colar no celular (o menu "Colar" do Android e o do Gboard, a planilha
    do Planilhas Google com tab); (4) colar do Visual no WhatsApp e no e-mail (o texto limpo) e no Docs (o
    HTML).
- **Rodada 8 (30/out, BUILD 669–670): o resto em volta.**
  - **O texto de fora só nos blocos mudados** (5.19, S1, S2, S4; `chega` em `ui/visual-editor/visual-editor.ts`,
    no lugar do `carregar` que refazia o documento inteiro): o texto que chega (a colega da compartilhada,
    outro aparelho, um pedido da AI pela API, o que se escreveu no Markdown e volta para o Visual) é lido pelo
    tradutor, e os **blocos** dos dois (os nós do `textToDoc`, não as linhas cruas: a tabela, o bloco de
    código e o trecho cru são um bloco só) são comparados pelo `commonPairs` de `core/merge3.ts`, cada um
    pelo trecho escrito **e** pela chave do que o leitor leu nele (a mesma linha lida noutro contexto, como
    a linha recuada que passou a ser o corpo de um item, é outro bloco). Só os nós dos trechos diferentes
    são trocados, de trás para a frente, numa transação fora do desfazer (`addToHistory` false), que não
    volta como `mudou` (a meta `vis-chegou`: o texto já é o valor de agora) nem passa pelo limite ou pelo
    ajuste. Os nós iguais continuam os mesmos objetos (as peças não se refazem, o vídeo não recarrega), com
    a fonte nova no `WeakMap` (a quebra de depois pode ter mudado: o `\r\n` de quem escreveu fica). O
    cursor e a seleção andam com a transação (o ProseMirror mapeia), e o histórico também (o
    `prosemirror-history` refaz os passos guardados por cima do que chegou, como numa edição a muitas
    mãos): **o Ctrl+Z desfaz o que a pessoa escreveu e nunca o que veio de fora**. O cursor numa linha
    trocada por uma só (a colega mexeu na linha onde se escreve) fica no mesmo ponto dela, em vez de ir para
    a ponta do trecho trocado. O nó que ainda esperava o ajuste (a escrita não exata) não casa com nada e é
    trocado.
  - **Outra ficha** (`recomeca`, que o `reset()` do editor chama nas duas folhas, a pequena e a da tela
    cheia): um estado novo com o texto de agora e o desfazer vazio; o texto da ficha nova chega depois, fora
    dele (o Ctrl+Z nunca volta para a ficha de antes).
  - **A tela cheia com o mesmo estado** (5.21; `levaEstado`/`recebeEstado`, a `MalaVisual` da
    `visual-api.ts`): a folha grande nasce com o estado da pequena (o documento, a seleção e o desfazer:
    o `reconfigure` guarda os campos dos plugins de mesma chave, o desfazer, os marcadores das imagens
    guardando, o desenho das listas, a seleção de células), com as fontes da escrita (o `WeakMap` vai junto:
    os nós são os mesmos), e ao fechar a pequena recebe o da grande antes de voltar a valer. O escritor dos
    comandos (`escritor` em `listas.ts`) saiu do estado do plugin para a spec dele: senão o `reconfigure`
    levaria o da outra folha junto. O que mudou desde que a outra folha escreveu (ela estava escondida, no
    Markdown) entra por cima, pelo `chega`.
  - **A prévia que segue o cursor** (5.21): o `RichEditor` dá o sinal `caret` (a linha do texto e a
    fração dela, pelo `caretSpot`), vindo da `<textarea>` (no `track`, com a ponta da seleção que anda) ou
    do Visual (a saída nova `cursor`, a posição no texto da ponta da seleção, a cada mudança de seleção ou
    de documento e no foco, só da folha à mostra); o `review-editor` segue o sinal (um `effect`) no lugar
    do `caretArea` (e dos `focusin`/`click`/`keyup` no molde). O `reset()` o esquece (null até o cursor
    entrar no texto da ficha nova). O `focus()` e o `reset()` já valiam nos dois modos; o `reset()` agora
    recomeça também o desfazer do Visual.
  - **O celular, o que dá sem aparelho** (5.20, 6.8): o `scrollMargin` (120 px embaixo: a régua presa de
    54 px e uma linha) já estava; no puppeteer com a identidade do Pixel 5, o cursor escrevendo na última
    linha fica em cima da régua presa (698 px contra 797), e a folha não rola sozinha (quem rola é o editor,
    como a `<textarea>`, M5). A letra da folha é 18,24 px (1,14rem), também na tela cheia do celular.
  - **A acessibilidade** (5.22, 6.9): já estava quase tudo das rodadas de antes (o `role="textbox"`, o
    `aria-multiline`, o nome, o `aria-describedby` do contador, o `spellcheck`, o `autocapitalize`, o
    `lang`; o `aria-pressed` da régua; a caixinha `role="checkbox"` com o `aria-checked`; o nome do widget;
    a `<table>` com o `<th>`; o Shift+Tab sem recuo que sai). O que faltava era o spec do A1 no editor de
    verdade (`rich-editor.visual.spec.ts`: o nome "Anotação", o contador que o `aria-describedby` aponta, o
    corretor, a língua e a letra de 16 px ou mais). O A5 (o spoiler na escrita): a tinta da folha (#151515)
    sobre as listras de 20% de tinta no papel creme passa de 10:1 no pior pixel (a foto de perto,
    `.angular/shots/r8-spoiler.png`).
  - **A medida do texto grande** (5.23, R3, S5): uma nota de 19.002 caracteres e 3.877 linhas (3.676 nós)
    com 50 widgets, 50 títulos, listas com corpo, tarefas e uma tabela de 200 fileiras, escrevendo uma letra
    no meio. **Antes**, o despacho de uma letra no Visual (Karma, build de desenvolvimento) levava 17–21 ms,
    quase tudo na trava da escrita, que lia o texto inteiro de volta a cada tecla (`docToText` 12 ms, o
    `textToDoc` dele 9–12 ms, a chave de cada linha contada de novo várias vezes). **Depois**, 4 ms:
    (1) **a trava só no trecho mexido** (`escritaParcial` em `core/rich-doc.ts`, com a escrita de antes):
    as linhas do começo e do fim iguais à escrita de antes (a mesma escrita, a mesma chave, a mesma quebra
    depois) ficam como foram lidas, e o trecho do meio, alargado até duas fronteiras seguras (o começo ou o
    fim do texto, ou uma linha sem recuo logo depois de uma linha vazia), é lido sozinho; só o jeito
    enxuto, e o bloco de código aberto no trecho lê tudo; o que não volta igual cai na trava de sempre, do
    texto inteiro; (2) **a chave de cada linha contada uma vez** (um `WeakMap` em `chave`; as linhas não
    mudam depois de feitas) e a linha com a fonte guardada por nó na escrita do Visual (`comFonte`). Na
    build de produção (puppeteer, `.angular/pptr/visual-r8.mjs medida`, o tempo da tecla até o segundo quadro
    depois dela): Visual 34 ms de mediana (p90 42), Markdown 23 ms (p90 28); com a CPU 4× mais lenta, Visual
    190 ms (p90 207), Markdown 101 ms (p90 109). Antes da trava parcial, com a medida de antes (o quadro e um
    `setTimeout`), o Visual dava 42 ms contra 28 do Markdown. A diferença que sobra é o ProseMirror (o
    despacho e o redesenho de uma folha de 3.676 nós: o estilo e o leiaute nativos pesam uns 10 ms por letra
    a mais que a `<textarea>`) e a prévia, que é a mesma nos dois modos. O editor abre essa nota em ~530 ms.
  - **Decidido nesta rodada**: (1) **a comparação é por blocos do tradutor, com a chave**, e não pelas
    linhas cruas: um nó pode ser várias linhas (a tabela, o código, o cru), e a mesma linha muda de sentido
    pelo contexto. (2) **A folha pequena não é destruída** enquanto a grande existe (ela já ficava escondida
    e parada, `ativo` falso): ela recebe o estado da grande ao fechar; as peças da grande são criadas de
    novo, como o plano dizia. (3) **O Enter no widget selecionado continua abrindo a linha embaixo** (5.13 e
    a rodada 5), e não o "Editar" que a 5.22 dizia: pelo teclado, o Tab leva à tirinha, com o Editar. (4)
    **A letra mínima do iPhone**: o zoom ao tocar olha a letra do elemento que recebe o foco, que é a folha
    inteira (18 px); o sutil (15,3 px), o cabeçalho e as tabelas de letra menor ficam como a leitura (sem
    mudar a cara só no iPhone). Se o aparelho mostrar zoom, entra a regra só do iPhone (o mínimo de 16 px
    nessas partes), como a da legenda das peças. (5) **A trava parcial** (acima), conferida por um fuzz com
    semente fixa que compara, a cada mexida, a escrita com a trava parcial e a do texto inteiro (iguais em
    tudo: o texto, o exato, as chaves, as fontes, os inícios). (6) **A medida pelos quadros**: o primeiro
    roteiro media a tecla até um `setTimeout` depois do quadro, e com a CPU lenta o Visual dava segundos;
    não era a folha atrasando, eram os `setTimeout` da página esperando na fila atrás da entrada e do
    desenho (o Chrome os deixa por último). Fica anotado: com a CPU lenta e uma nota enorme, o que a página
    faz por `setTimeout` (o ProseMirror usa alguns) atrasa enquanto se digita rápido.
  - **Conferido**: os specs novos (em `visual-editor.spec.ts`: a colega na linha 5 com o cursor na 2, os
    nós iguais que ficam, o Ctrl+Z que não desfaz o dela, o acrescentar da AI no fim enquanto se escreve, a
    linha do cursor mudada por fora, a quebra `\r\n` que fica, a linha que vira corpo de item, a tabela com
    uma fileira nova, o `recomeca`, a tela cheia de uma folha para a outra com o desfazer, a saída
    `cursor`; em `rich-editor.visual.spec.ts`: a tela cheia de verdade, com o desfazer nos dois sentidos, o
    `reset` que recomeça o desfazer, o `caret` do Visual e da `<textarea>`, o A1; em
    `review-editor.preview.spec.ts`: a prévia que segue o cursor do Visual; em `rich-doc.spec.ts`: o fuzz da
    trava parcial), a suíte inteira (2795 de 2795; numa rodada antes, um teste das peças caiu com o "ResizeObserver
    loop completed with undelivered notifications", que passou sozinho três vezes e na rodada seguinte),
    `npx ng build` e o roteiro do puppeteer na build de produção (`.angular/pptr/visual-r8.mjs`, fora do git,
    que é também o smoke: o Markdown escrito por fora troca só a linha dele (41 dos 42 nós ficam os mesmos) e
    o Ctrl+Z do Visual não o desfaz; a tela cheia desfaz o que se escreveu na pequena, e a pequena, o da
    grande; a prévia da Ficha inteira vai até o cursor no fim e volta ao alto; a letra; e, com a identidade
    do Pixel 5, a régua presa sobre o cursor e quem rola), no computador e no celular simulado, sem erro no
    console, com as fotos de perto.
  - **Fica para o aparelho de verdade**: (1) **o zoom do iPhone** ao tocar na folha, num sutil e numa célula
    de tabela (a decisão 4); (2) a régua presa em cima do teclado de verdade, com o cursor nunca atrás dela
    (o `scrollMargin`), escrevendo no fim de uma nota comprida e numa tabela; (3) a mudança de fora com o
    teclado aberto e compondo (a colega mexe enquanto o Gboard sublinha uma palavra: o nó da linha de quem
    escreve não deve ser trocado no meio da composição; aqui só se confere sem composição); (4) a tela
    cheia no celular com o teclado aberto (o desfazer junto, o cursor no mesmo lugar); (5) **a nota enorme
    num celular de verdade** (a medida acima é de um computador, com a CPU 4× mais lenta simulada); (6) o
    leitor de tela (o TalkBack e o VoiceOver: a folha, a caixinha, o widget, o contador).
- **Depois da rodada 8: o primeiro teste do usuário (30/out, BUILD 671).** No celular e no computador, a
  tabela foi o que não se entendeu: ela entrava sempre com 3 colunas e 3 linhas, e mudar o tamanho
  dependia do menu "Tabela", que só aparece com o cursor dentro dela e não se descobre sozinho.
  - **Inserir › Tabela** no Visual abre a grade do tamanho no lugar do Inserir (como no Docs): 6 × 6
    quadradinhos de papel, a fileira de cima é o cabeçalho (toda tabela tem, e ela acende com as colunas), o
    tamanho escrito à mão embaixo; setas e Enter pelo teclado. A ação nova `{ tabelaNova: { colunas,
    fileiras } }` do Visual.
  - **As alças** (`alcasDaTabela` em `ui/visual-editor/tabela.ts`): embaixo da tabela do cursor, numa
    decoração (fora do texto), em duas linhas da pauta: "Fileira" e "Coluna" a lápis, cada um com o + (uma
    embaixo da do cursor, uma depois da do cursor) e o − (tira a do cursor), as etiquetas de papel do site
    (`botao-papel`, o − com o corte vermelho), tortas como coladas à mão. O − apontado marca de vermelho o
    que vai sair (uma decoração de nó: a classe posta à mão na célula, o ProseMirror desfazia). O que não
    vale fica desligado (o cabeçalho, a única fileira de baixo, a única coluna). O toque não tira o cursor
    da célula (pointerdown e mousedown cancelados: só o pointerdown deixava o clique mover a seleção para
    fora da tabela). Somem com a folha sem o foco. O menu "Tabela" da régua continua com o resto (mover,
    alinhar, o jeito, a folha).
  - **As divisões das colunas** a lápis (o azul da pauta) na branca e na listrada, só na escrita: a tabela
    vazia mostra quantas colunas tem. A leitura não muda.
  - A estética das alças foi refeita a pedido ("mais padrão do projeto, mais artesanal"): eram quadradinhos
    brancos genéricos com o nome em letra de etiqueta.
  - Conferido: os specs (as alças em `tabela.spec.ts`, a grade pelo mouse e pelo teclado em
    `rich-editor.visual.spec.ts`), a suíte inteira, `npx ng build` e o roteiro `.angular/pptr/visual-alcas.mjs`
    na build de produção, no computador e no celular simulado, sem erro no console, com as fotos de perto.
- Próximo: a rodada 9, para todos (tira o "em teste", o padrão da P2, as Novidades, a REGRA DO VISUAL nos
  cabeçalhos, o script nas notas reais de novo, a lista dos aparelhos inteira).

## 13. A conferir na prova (riscos que só a rodada 0 responde)

- **O ProseMirror no teclado do Android.** É o ponto mais frágil de qualquer editor na web; ele é o
  mais testado nisso, mas o Gboard muda. Se a prova mostrar letra duplicada ou perdida que não se
  resolve, o Lexical entra na prova antes de seguir.
- **O cursor do iPhone perto das peças.** Pode pedir linhas de respiro maiores na tela ou o cursor de
  lacuna desenhado com mais cuidado.
- **O peso real** dos pacotes, comprimidos, no pedaço preguiçoso.
- **O tipo próprio na área de transferência** no Safari (pode não sobreviver; o HTML do ProseMirror
  cobre o colar no Visual).
- **O orçamento de estilo**: o desenho da leitura dentro do componente do Visual pode passar dos 24 kB.
- **O tempo do `parseRich` a cada mudança de estrutura** num texto de 20 mil caracteres (as decorações).
- **Notas reais que viram cru**: o script da rodada 1 diz quantas; se muitas, o tradutor precisa de
  mais tipos antes da rodada 2.

## Fontes

- ProseMirror, guia e referência: https://prosemirror.net/docs/guide/ e https://prosemirror.net/docs/ref/
- `prosemirror-tables`: https://github.com/ProseMirror/prosemirror-tables
- Cursor de lacuna: https://github.com/ProseMirror/prosemirror-gapcursor
- Exemplo de envio de imagem com marcador: https://prosemirror.net/examples/upload/
- Lexical: https://lexical.dev/
- CodeMirror 6 (o caminho do Obsidian, descartado): https://codemirror.net/
