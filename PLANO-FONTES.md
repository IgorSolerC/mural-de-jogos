# Mapa das fontes do Murall

Pedido do dono do projeto em 12/nov/2026: saber todas as fontes do site, onde cada uma aparece e para que serve,
para poder trocar uma ou outra sem muito trabalho. A escolha é feita no **Provador de fontes** (página de teste
fora do projeto, publicada como Artifact), que usa os mesmos papéis desta lista. A troca entra depois, por papel,
uma rodada por vez.

## 1. As famílias que o site carrega hoje

Todas vêm do `@fontsource` (auto-hospedadas: o CSP só deixa `font-src 'self'`), listadas em `angular.json`
(`styles`), e cada uma tem um token em `src/styles.scss` (bloco "Tipos"). Contagem = declarações de
`font-family`/`font:` com o token em `src/`.

| Token | Família | Pesos carregados | Usos | Para que serve (a ideia original) |
|---|---|---|---|---|
| `--f-label` | **Barlow Condensed** | 600, 800, 800 itálico | ~480 | Rótulo impresso: metadados, botões de papel, abas, chaves, giz, números grandes. Quase sempre 800 em CAIXA ALTA espaçada. |
| `--f-hand` | **Kalam** | 400, 700 | ~315 | A letra de quem escreve: texto das anotações, comentários, recados a lápis, verso das cartas. |
| `--f-marker` | **Permanent Marker** | 400 | ~217 | A caneta de pincel grossa: títulos das fichas, H1/H2 do texto, botões de tinta, títulos das folhas, nomes de grupo, itens de menu. |
| `--f-ui` | **Barlow** | 400, 500, 600 | ~48 | A letra neutra: `body`, campos digitados, nome das opções nas folhas (`linha-titulo`). |
| `--f-mono` | Courier New (do sistema) | — | 12 | Máquina de escrever: recibo das tabelas, chaves da API, números do contador. |
| `--f-codigo` | **Cascadia Mono** | 400, 700 | 5 | Código no texto das anotações (baixada só quando um código aparece). |
| `--f-didone` | **Abril Fatface** | 400 | 9 | Gráfica de revista: recortes da Wishlist e logos de seção. |
| `--f-serif` | **DM Serif Display** | 400, 400 itálico | 5 | Manchete de revista: recortes da Wishlist e logos de seção. |
| — | **Klee One** | 400 | 120 blocos | Japonês escrito à mão nas frentes dos flashcards (`src/klee-one.scss`, só as fatias por `unicode-range`, posto pela carta na primeira vez). |
| — | **Inter Variable** | variável | 2 | Só no PDF exportado (`ui/pdf-sheet.scss`, `--pdf-letra`). |
| — | Barlow Condensed escrita à mão | 800 | 2 | Desenho em canvas no Quadro livre (`free-board/far-layer.ts`, `free-board-lab-data.ts`), sem passar pelo token. |

**Pesos que o site pede e não carrega.** Vários lugares pedem 700, que nenhuma das duas Barlow carrega: o
navegador usa o vizinho. A Barlow pedida em 700 (`_paper-kit.scss` `linha-titulo`) **sai em 600**; a Barlow
Condensed pedida em 700 (`_formatado.scss` `tabela-cabeca`, `styles.scss` `.divisoria-n`, `context-menu.scss`
`.atalho`, `folder-card.scss` `.qtd`) **sai em 800**. O Provador mostra o "Como está hoje" com os pesos que
aparecem de verdade.

Fora do token há 8 `font-family: 'Barlow Condensed', …` escritos à mão e 4 `'Permanent Marker'` escritos à mão
(`study-card.scss`, `study-card-back.scss`, `flashcard-tab.scss`): numa troca, eles precisam ir junto.

## 2. Os papéis (o que o Provador deixa trocar)

Cada papel é um trabalho que a letra faz. Hoje vários papéis dividem o mesmo token, por isso trocar `--f-marker`
mudaria de uma vez o título da ficha, o H1 do texto, o botão Salvar e o item de menu. Os papéis abaixo separam
esses trabalhos.

### Anotações
| Papel | Hoje | Onde | Intuito |
|---|---|---|---|
| Título da anotação no mural | Permanent Marker 1.62rem | `review-card.ts` `.title` | Ler o nome de longe, na parede |
| Título na leitura e no editor | Permanent Marker 1.62rem | `review-reader.scss` `.faixa-nome .title`, `review-editor.scss` `.obra-nome`/`textarea`, `flashcard-tab.scss` `.titulo input` | O nome na faixa colorida da ficha aberta |
| Texto da anotação | Kalam 1.12rem | `review-card.ts` `.lead`/`.nota-texto`, `review-reader.scss` `.text`, `rich-editor.ts`, `comments-panel.scss` `.texto` | A pessoa escrevendo na ficha |
| **Títulos dentro do texto (H1, H2)** | Permanent Marker 1.32em / 1.12em | `_formatado.scss` `@mixin titulos` `.t1`/`.t2` | Separar partes do texto. **É a que você não gosta.** |
| Subtítulo dentro do texto (H3) | Barlow Condensed 800, caixa alta | `_formatado.scss` `.t3` | Um carimbo pequeno de seção |
| Data, contagens e metadados | Barlow Condensed 800, caixa alta | `review-card.ts` `.meta`, `review-reader.scss` `.meta`, `comments-panel.scss` `.quando`, `note-index.ts` `.meta`, `kanban-note.scss` `.tira-assunto` | Informação de apoio, impressa |
| Nome de grupo (orelhas, abas, pastas) | Permanent Marker 1.08rem | `app-cat-label`, `review-card.ts` `.aba-cat`, `_divisorias.scss` `nome-de-grupo`, `styles.scss` `.divisoria-nome`, `folder-card.scss` `.nome`, `tab-more.scss` `.rotulo`, `note-index.ts` `.orelha` | Escrito a pincel na aba de cartolina |
| Código no texto | Cascadia Mono 0.8em | `_formatado.scss` `.codigo`/`cod-recorte`, `code-langs-menu.ts` | Código que precisa alinhar |
| Cabeçalho de tabela | Barlow Condensed 700 (sai 800), caixa alta | `_formatado.scss` `tabela-cabeca` | Cabeça de coluna impressa |

### Kanban
| Papel | Hoje | Onde | Intuito |
|---|---|---|---|
| Título do card no Kanban | Permanent Marker 0.98rem | `kanban-note.scss` `.tira-nome` | O nome numa tira estreita |
| Nome da coluna | Permanent Marker 1.3rem | `_kanban-kit.scss` `etiqueta-nome`, `kanban-column-sheet.scss` `input` | A etiqueta no alto da coluna |
| Importância, status e carimbos | Barlow Condensed 800, caixa alta | `_kanban-kit.scss` `importancia`/`carimbo`, `kanban-column-head.scss` `.etiqueta-ordem` | Selos curtos |

### Flashcards
| Papel | Hoje | Onde | Intuito |
|---|---|---|---|
| Palavra da carta (alfabeto) | Permanent Marker, encolhe até caber | `study-card.scss` `.titulo`, `study-card-back.scss` `.verso-titulo` | A palavra grande da frente |
| Japonês nas cartas | Klee One | `study-card.scss` `.titulo` (cai nela para kana e kanji), `src/klee-one.scss` | Kanji escrito a lápis |
| Verso do flashcard | Kalam | `study-card-back.scss` `.verso-texto`, `&.frase` | A resposta, escrita à mão |

### Navegação
| Papel | Hoje | Onde | Intuito |
|---|---|---|---|
| Nome do mural e títulos de página | Permanent Marker | `kind-switcher.ts` `.palavra`, `styles.scss` `.plate`/`.tape-label`, `free-board-view.scss` `h2` | Placa da página |
| Partes do site no varal | Barlow Condensed 800, caixa alta | `area-bar.ts` `.secao` | Anotações · Análises · Utilidades · Extras |
| Escrito a giz na parede | Barlow Condensed 800, caixa alta | `_paper-kit.scss` `giz`, `styles.scss` `.achados`, `section-head.scss` | Contagem e legenda direto na parede |
| Recados a lápis (vazio, dicas) | Kalam | `_sheet.scss` `sub-mao`, `.vazio` de várias folhas, `study-piles.scss` `.vaga-pilha` | Nota a lápis quando não há nada |

### Botões
| Papel | Hoje | Onde | Intuito |
|---|---|---|---|
| Botão principal de tinta | Permanent Marker amarela no preto | `_paper-kit.scss` `tinta()`, `styles.scss` `.btn-cartolina`/`.acao-caneta` | Nova anotação, Salvar: a ação principal |
| Botão de papel (secundário) | Barlow Condensed 800, caixa alta | `_paper-kit.scss` `botao-papel`, `styles.scss` `.btn-quiet` | Cancelar, Filtrar, Ordenar |
| Botões de hover dos cards | Barlow Condensed 800, caixa alta 0.8rem | `_etiqueta-acoes.scss` `com-nome` | Fixar, Finalizar (padrão do CLAUDE.md) |

### Folhas e menus
| Papel | Hoje | Onde | Intuito |
|---|---|---|---|
| Título da folha | Permanent Marker 1.9rem | `_sheet.scss` `h2`, `mural-config.scss` `h3`, `comments-panel.scss` `.titulo` | O nome da janela aberta |
| Título de seção da folha | Barlow Condensed 800, caixa alta | `_paper-kit.scss` `grupo-titulo`, `picker-filters.scss` `.secao-titulo` | Separar grupos de ajustes |
| Nome de uma opção | Barlow 700 (sai 600) 1.06rem | `_paper-kit.scss` `linha-titulo` | O título de cada linha de ajuste |
| Texto digitado nos campos | Barlow 400 1rem | `_paper-kit.scss` `campo`, `review-editor.scss` `input`/`select`, `body` | O que a pessoa digita |
| Itens do menu do botão direito | Permanent Marker 1.05rem | `context-menu.scss` `.nome` | Ações do menu |
| Avisos (toast) | Barlow Condensed 800, caixa alta | `toast.ts` `p` | "Anotação salva" |

### Números e especiais
| Papel | Hoje | Onde | Intuito |
|---|---|---|---|
| Números grandes | Barlow Condensed 800 | `countdown.ts` `.num`, `pomodoro-dial.scss` `.tempo`, `stats-page.scss` | Contador, pomodoro, estatísticas |
| Máquina de escrever | Courier New | `--f-mono`: `_formatado.scss` recibo, `api-key-sheet.scss`, `markup-guide.ts` | Recibo, chaves |
| Recortes de revista | Abril Fatface / DM Serif Display | `wish-clip.ts`, `section-logos.ts`, `relevance-sticker.ts` | Manchete recortada da Wishlist |

## 3. Por que o conjunto incomoda

1. **Três vozes altas e nenhuma quieta.** Pincel grosso (Permanent Marker), cartaz condensado extra-negrito em
   caixa alta (Barlow Condensed 800, ~480 lugares) e letra à mão (Kalam). Quase tudo fala alto ao mesmo tempo, e
   não sobra uma letra calma para o que é só informação.
2. **H1 e H2 do texto na Permanent Marker.** No meio da Kalam, são duas letras à mão de pessoas diferentes na
   mesma folha. O pincel é muito mais pesado que o texto, então o título parece um carimbo por cima, não o começo
   de uma parte.
3. **O pincel em lugares demais.** A mesma Permanent Marker está no botão Salvar, no item de menu, no nome de
   grupo, no título da folha e até em campos digitados (`mural-config.scss` `input`, `kanban-column-sheet.scss`
   `input`). Usada em tudo, ela perde o efeito de destaque.
4. **Caixa alta espaçada como padrão.** Metadados, botões, avisos e selos em maiúsculas com espaço entre as letras
   deixam a tela com cara de etiqueta de caixa: lê-se mais devagar e tudo parece aviso.
5. **Pesos que não existem.** O CSS pede 700 onde só há 600 e 800 (seção 1), então o degrau entre um título e
   um rótulo nem sempre é o que foi escrito.

## 4. Como a troca vai entrar (depois da escolha)

- **Tokens por papel, em cima dos que existem.** Em `src/styles.scss`, um token por papel apontando para a família
  de hoje (`--f-titulo-ficha: var(--f-marker)`, `--f-titulo-texto: var(--f-marker)`, …). Primeiro a troca dos usos
  para o token do papel, sem mudar nada na tela; depois a escolha vira uma linha por papel.
- **Peso e caixa alta junto da família.** Quando o papel muda de letra, o peso e a caixa alta mudam junto (um
  mixin por papel em `ui/_tipos.scss`), para não sobrar `font-weight: 800` numa letra que não tem 800. Cada
  peso pedido precisa estar carregado (hoje o 700 das Barlow não está: seção 1).
- **Família nova pelo `@fontsource`**, com só os pesos usados em `angular.json` (o CSP não deixa Google Fonts),
  e saída de quem ficar sem uso. Japonês continua em fatias por `unicode-range`, como a Klee One.
- **Uma rodada por grupo de papéis** (Anotações, Kanban, Flashcards, Navegação, Botões, Folhas, Números), cada uma
  com o /code-review mid antes da próxima, as fotos de perto (computador e celular) e as Novidades.
- As letras que só existem no Mac e no iPhone (SF Pro, SF Rounded, New York, SF Mono) entram pelos nomes
  genéricos do CSS (`system-ui`, `ui-rounded`, `ui-serif`, `ui-monospace`): aparecem de verdade só em aparelho da
  Apple; no Windows e no Android viram a letra do sistema. Para ter o mesmo jeito em todo lugar, as parecidas do
  Provador (Inter, Nunito, Newsreader, JetBrains Mono) são o caminho.

## 5. O que foi escolhido e como entrou (12/nov/2026)

Os papéis trocados têm três tokens em `src/styles.scss`: `--f-<papel>` (a família), `--w-<papel>` (o peso) e
`--e-<papel>` (a escala sobre o tamanho que cada peça já tinha). Trocar de novo é mudar só essas linhas.

| Papel | Escolha | Onde mais vale |
|---|---|---|
| Título da anotação no mural | Caveat 700, ×1,16 | as miniaturas na boca da pasta e no perfil (`mini-cartolina.ts`), a Visão geral |
| Título na leitura e no editor | Caveat 700, ×1,16 (o mesmo da cartolina) | o nome no Widget Nota (`linked-card.ts`, inteira e a que sumiu) |
| Texto da anotação | Kalam, ×0,94 | o editor (Markdown e Visual), o Quadro livre e os comentários |
| Títulos dentro do texto (H1, H2) | Caveat 700, ×1,18 | todo texto formatado (`_formatado.scss`) e as amostras do menu de estilos; o PDF tem a letra dele |
| Título do card no Kanban | Caveat 700, ×1,36 | toda ficha pequena de anotação: o card do Kanban, a presa num lembrete, a colada |
| Nome da coluna | Caveat 700, ×1,2 | o campo de renomear a coluna |
| Itens do menu do botão direito | Caveat 700, ×1,1 | |
| Nome das pastas | Caveat 700, ×1,1 | o campo de renomear; a altura da pasta acompanha (`--nome-tam`) |

- **Só nas anotações.** O nome das fichas de jogos, livros, filmes, séries, animes e músicas continua na
  Permanent Marker. A escala vem por `--titulo-escala` e `--e-texto`, que toda peça zera (`:host`, `.ficha`)
  e só a anotação liga (`ficha-anotacao`, `.ficha.de-anotacao`, `app-rich-editor.anotacao`): a ficha de
  dentro de um widget não herda a da de fora.
- **A folga da caneta.** A Caveat passa um pouco da caixa à direita; onde o título corta (`overflow: hidden`),
  `padding-right: var(--caneta-folga)` (0,14em) guarda a ponta da última letra.
- **A ficha compacta** só aumenta a letra (`font-size: calc(var(--title-fs) * var(--titulo-escala))`): a
  altura da tira e a capinha continuam as de `--title-fs`.
- A Caveat Brush chegou a entrar no título da leitura e saiu no mesmo dia: o dono quis o nome igual em todo
  lugar.
- Testes: `src/app/ui/font-roles.spec.ts`.
