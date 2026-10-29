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
PLANO-IMAGENS.md). **Nada foi implementado.** As decisões estão na seção 9 (as minhas, com o porquê, e
cinco perguntas que são do usuário); as rodadas, na seção 11; o andamento, na 12.

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
  que é ele mesmo, editável (pergunta P1). Em Ajustes › Mural, "Jeito de escrever" escolhe qual abre
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
| `codigo` | `` `…` `` (com mais crases se o texto tiver crase) | não inclusiva; exclui os links; aceita negrito, itálico, riscado, marca, spoiler e sutil por fora (como `parseInline`) |
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
  A pergunta P1 é se o "Ver como fica" pode sumir (a minha recomendação: sim; o Visual já é ele,
  editável, e a ficha ao lado da edição já mostra a cara final).
- **A opção.** Ajustes › Mural, uma linha nova "Jeito de escrever", com o seletor de recortes dos
  outros ajustes: "Visual (como no Docs)" e "Markdown (as marcas à vista)". Ela escolhe qual aba abre
  quando um editor aparece, em todo lugar que tem o texto com formatação (a anotação, a resenha, o
  comentário, o "Sobre mim"). Trocar de aba no editor vale só para aquele editor enquanto ele estiver
  aberto (como no Docs, a preferência não muda por um clique). Mora em `Settings` (o `Stored` de
  `core/settings.ts`), entra no "Voltar ao padrão" (`PREFERENCE_DEFAULTS`) e no `reload` de outra aba.
  Por aparelho ou por conta: pergunta P3. O padrão: pergunta P2.
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
é que o que se escreve seja lido como texto, não como markdown. Fica como pergunta (P4), porque o Notion faz e há quem goste.

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
   de outro aparelho). **Ctrl+Shift+V** cola como letras, sem ler nada. Pergunta P5.

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
- Se a pergunta P3 escolher "por conta", a escolha passa a sincronizar como os outros ajustes com data
  (`…At`), seguindo a regra 2 do CLAUDE.md (o de uma conta nunca se junta com o de outra); não é
  conteúdo da conta (não entra em `localHasContent`).

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
| R6 | Quem sentia falta do "Ver como fica" (tarefas dobradas, spoiler tapado, links que abrem) | Perde algo | Pergunta P1; a ficha ao lado já mostra | — |
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
- **O "Ver como fica" só de leitura**, se a P1 disser que pode sair.
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

### 9.2 Perguntas que são do usuário

| # | Pergunta | A minha recomendação |
| --- | --- | --- |
| P1 | O "Ver como fica" (só leitura) pode sumir, ficando as abas **Visual** e **Markdown**? | Sim. O Visual é ele, editável, e a ficha ao lado já mostra a cara final. Se não, três abas (Visual, Markdown, Ver como fica), apertadas no celular. |
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

Nada feito ainda. Esperando as respostas das perguntas P1 a P5 (seção 9.2) e o "pode começar" da
rodada 0.

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
