# Plano: Quadro livre (anotações visuais)

Pedido do usuário (09/nov/2026, cartão "Mural livre (anotações visuais)" do Dev Murall): "o MURALL deve ser o
lugar onde qualquer coisa que você queira anotar tem um espaço para você [...] Mas ainda faltam anotações
visuais, como murais em branco." A referência são dois Canvas do Obsidian sobre o jogo Blue Prince: áreas
coloridas com título ("Roxo (Quartos)", "Red Prince", "Lugares para interagir", "Anjos do proletariado"),
dezenas de imagens pequenas, bilhetes curtos ("Senha?", "Ler email no escritório") e setas curvas, algumas
com rótulo ("Precisa da lupa", "Preciso da senha para usar ler o email").

O que o pedido pede, item por item (a seção 13 diz onde cada um entra):

1. Uma aba **"Quadro livre"** nas Anotações, ao lado dos Flashcards.
2. Os quadros **separados por grupo** (Estudos, Trabalho...); em cada grupo, quantos quadros a pessoa quiser,
   cada um **com nome**.
3. Criar ou abrir um quadro abre **em tela cheia**, primeiro **só para ver**: mover a câmera (segurar e
   arrastar), mexer nos widgets. Um botão **Editar** mostra as ferramentas.
4. No quadro: **widgets, anotações, imagens, setas, "grupos"** (retângulos de cantos arredondados com
   título e cor, para demarcar uma região) e **agrupamentos**.
5. Espaço que **beira o infinito, sem travar**.
6. **Clicar e arrastar cria uma área de seleção**; **botão direito** com menu.
7. Câmera: **botão do meio** arrastando, ou **Ctrl + arrastar no fundo**.
8. **Chamadas de API e armazenamento econômicos** no Cloudflare.
9. Reaproveitar o que existe; criar só o que é novo de verdade. **Impeccable** no começo e no fim;
   **`/code-review high`** no fim, com as correções.

Só o plano: nada foi implementado. As quatro decisões que eram suas estão respondidas na seção 12.1.

---

## 0. Resumo

- **Cada quadro é um documento próprio, fora do mural.** O mural privado inteiro (até 1,9 MB compactado)
  sobe a cada mudança; se os quadros morassem nele, arrastar uma imagem reenviaria todas as anotações.
  Cada quadro vira uma linha só dele na nuvem (tabela `quadros`), compactada, com versão própria: mexer num
  quadro manda só ele (uns 2 a 10 KB). No aparelho, um banco do IndexedDB só dos quadros.
- **O formato é o do JSON Canvas** (o formato aberto do Obsidian), enxugado: nós com posição e tamanho,
  setas entre nós com lado e rótulo, a ordem da lista é a ordem de empilhar. Chaves curtas, números
  inteiros, padrões omitidos. Isso deixa a porta aberta para **importar os seus `.canvas` do Obsidian**.
- **Quase tudo no quadro é um widget que já existe.** Anotação = o widget Nota (com os quatro jeitos);
  imagem, vídeo, áudio, contador e tabela = os widgets das anotações, com a mesma folha para editar. Só
  três coisas são novas: a **moldura** (o retângulo com título), o **bilhete de texto** e a **seta**.
- **O quadro é o próprio eucatex, infinito.** Os furos da parede (26 px) viram a grade onde as peças
  encaixam; a moldura é uma folha de feltro de cantos macios com o título numa fita Dymo; a seta é um risco
  de giz, com o rótulo num pedaço de fita crepe. Seleção em amarelo (a cor de estado do site).
- **Sem biblioteca nova:** um motor próprio em DOM (para reaproveitar as peças em Angular), com a câmera
  fora da detecção de mudanças, **só o que está perto da tela montado**, **três níveis de detalhe** pelo
  zoom (de longe, tudo vira retângulos numa camada de canvas 2D) e **miniaturas das imagens** para o zoom
  afastado.
- **Ver primeiro, editar depois.** Ver: arrastar move a câmera, tocar usa o widget. Editar: arrastar no
  fundo seleciona; Ctrl+arrastar, botão do meio ou espaço+arrastar move a câmera.
- **Rodadas pequenas**, cada uma com commit e push: dados → motor (medido) → a seção → editar → nuvem →
  pontas. A rodada do motor termina com fotos para você aprovar o jeito antes de eu construir a edição.

---

## 1. Como é hoje (o que pesa no desenho)

| O que existe | Por que importa aqui |
|---|---|
| O mural privado é **um blob gzip por conta** (`murais.dados`, teto de 1,9 MB), regravado inteiro a cada envio, 5 s depois da última mudança (`CloudSync`, `api/src/routes/mural.ts`). | Quadro dentro dele = cada arrasto sobe o mural todo e o quadro come o teto do mural. Daí a tabela própria (seção 7). |
| A cota própria de gravações: 60 mil linhas por dia (`COTA_LINHAS_DIA`), contada em `write()` (`api/src/domain/quota.ts`). | Cada envio de quadro custa umas 4 linhas; o ritmo de envio (seção 7.4) segura isso. |
| Imagens: bytes no D1 `mural-imagens`; **30 por dia e 25 MB por conta** (`IMAGENS_POR_DIA`, `IMAGENS_MB_PESSOA`); as que nenhuma nota usa viram "soltas" e saem em 30 dias (`imagens.usadas` no envio do mural, `nota_imagens`). | Um quadro como o do Blue Prince tem uns 75 prints: passa o limite do dia e enche os 25 MB em uns cinco quadros. E as imagens só do quadro **seriam apagadas como soltas** se o servidor não souber delas (seção 7.6). |
| O topo das partes (`SECOES_DAS_ANOTACOES` em `shared/topo-do-murall.ts`) é dividido com o cofre. | A aba nova muda os hashes do cofre (`cofre-hashes.json`): o cofre precisa ser republicado por você, como na rodada 0 dos Estudos. |
| "Quadro" já é o nome do Kanban no código e na tela ("quadro Dev Murall"). "Grupo" já é o grupo das anotações. | No código, o Quadro livre se chama `FreeBoard`; na tela, "quadro" sozinho só aparece dentro do Quadro livre. O retângulo com título se chama **moldura** (Q1). |
| A visita monta as mesmas peças do dono (regra do CLAUDE.md). | A tela do quadro nasce como peça que lê por uma fonte (`FREE_BOARD_SOURCE`), com o que é do dono entrando por `editable`. |
| Os botões de hover seguem a etiqueta de tinta (`ui/_etiqueta-acoes.scss`). | A barrinha da seleção usa os mesmos mixins (seção 11). |

---

## 2. Pesquisa: o que foi considerado

### 2.1 Bibliotecas prontas (todas descartadas)

| Opção | Por que não |
|---|---|
| **tldraw** | É React, e o SDK pede chave de licença para produção (ou marca d'água). Também não usa as peças do Murall. |
| **React Flow / Excalidraw** | React. O Excalidraw desenha num `<canvas>`, então nenhuma ficha, widget ou imagem do Murall entraria como é. |
| **Konva / Pixi (canvas, WebGL)** | Rápidos com dezenas de milhares de peças, mas tudo teria que ser redesenhado à mão: o papel, o widget Nota, os vídeos, a tabela. É o contrário de "não reinventar a roda". |
| **perfect-arrows** | Faz o que precisamos para as setas (de caixa a caixa), mas está parado ("legacy & inactive"). A conta é pequena: escrevo a nossa (seção 9.6). |

Toda dependência nova também precisaria do seu ok. Nenhuma é necessária.

### 2.2 Formato: JSON Canvas

O Obsidian publica o formato dos Canvas como aberto ([jsoncanvas.org](https://jsoncanvas.org/spec/1.0/)):
nós `text`, `file`, `link` e `group` com `x`, `y`, `width`, `height` e `color` (hex ou as predefinições
1 a 6); setas com `fromNode`, `toNode`, `fromSide`/`toSide` (top, right, bottom, left),
`fromEnd`/`toEnd` (none, arrow), `color` e `label`; a ordem da lista é a ordem de empilhar. O nosso
formato (seção 5) é esse mesmo modelo, com chaves curtas. Importar e exportar `.canvas` vira uma tradução
direta, se um dia você quiser (ficou de fora na Q4).

### 2.3 Desempenho: o que os outros aprenderam

- **tldraw** ([culling](https://tldraw.dev/sdk-features/culling), [desempenho](https://tldraw.dev/sdk-features/performance)):
  DOM, tira de cena o que está fora da tela, recalcula a visibilidade só do que mudou e usa um índice
  espacial para selecionar e procurar debaixo do ponteiro.
- **Um canvas em DOM com milhares de cartões** ([relato](https://dev.to/alanscodelog/handling-thousands-cards-on-an-infinite-canvas-4gea)):
  o DOM bem cuidado começa a travar perto de **mil cartões visíveis**, sobretudo no zoom; o que salva são
  **níveis de detalhe** (completo → esqueleto sem texto → retângulo de cor).
- **Obsidian** ([fórum](https://forum.obsidian.md/t/canvas-is-laggy-with-larger-number-of-nodes/72042),
  [Canvas Image LOD](https://www.obsidianstats.com/plugins/canvas-image-lod)): o Canvas fica pesado no zoom
  médio, quando muito texto pequeno ainda é desenhado, e em quadros cheios de imagens, porque o Chromium
  redesenha cada imagem a partir do arquivo inteiro a cada zoom. O remédio é **trocar a imagem por uma
  cópia pequena** quando ela aparece pequena.
- **Texto borrado** ([Chrome](https://developer.chrome.com/blog/re-rastering-composite)): com
  `will-change: transform`, o Chrome não redesenha o conteúdo ao mudar a escala, e o texto fica borrado.
  O certo é ligar `will-change` só durante o gesto e tirar quando ele para (o Chrome redesenha nítido no
  quadro seguinte).

Conclusão: **DOM para as peças de perto, camada de canvas 2D para as de longe**, montando só o que está
perto da tela. Isso aguenta quadros bem maiores que os do Blue Prince (meta na seção 9.8).

---

## 3. Brief de design (Impeccable, shape)

**Para quem e quando.** O dono, no computador, montando um mapa de algo que não cabe em texto corrido:
um jogo de puzzle (Blue Prince), uma matéria de estudo, um projeto. Volta ao quadro para consultar no meio
de uma sessão de jogo ou de estudo, às vezes no celular. Modo do Impeccable: **Operate** (uma ferramenta),
com a parte de ver perto de **Experience** (o quadro é a obra).

**Resultado.** Abrir um quadro e achar a coisa em segundos (afastar, ver as molduras, aproximar); montar um
quadro de 80 imagens numa tarde sem a ferramenta atrapalhar. Prova: o Blue Prince remontado no Murall.

**Direção visual (dentro do mundo "Mural de papelaria", que continua valendo).** O quadro é a mesma parede
de eucatex grafite, agora sem fim:

- **O fundo** é o eucatex de `shared/_eucatex.scss`, desenhado na tela (não no mundo), andando e
  escalando com a câmera; os furos de 26 px são a grade de encaixe. Afastando muito, os furos somem (a
  parede fica lisa) para não virar moiré.
- **A moldura** (o "grupo" do pedido) é uma **folha de feltro** cortada com cantos macios (o feltro pode ter
  canto redondo; o papel continua cortado reto, como manda o DESIGN.md), num tom escuro da cor escolhida,
  com um **pesponto** na cor clara rente à borda, e o **título numa fita Dymo** da mesma cor no canto de
  cima. As cores são as das cartolinas, para combinar com os grupos e as fichas. Fica sempre atrás das
  outras peças.
- **O bilhete** (texto solto, como "Senha?") é papel de bloquinho rasgado, escrito à caneta (Kalam, a
  ferramenta "caneta" da regra das Três Ferramentas). Pode ser de uma das cartolinas.
- **A seta** é um **risco de giz** sobre o eucatex, curvo, com a ponta desenhada; giz branco ou colorido. O
  rótulo vai num pedaço de fita crepe atravessado na seta (Kalam).
- **Anotação, imagem e widgets** são as peças que já existem, iguais às coladas no texto: o widget Nota
  (Ficha, Capa e título, Só o título, Texto inteiro), a foto com moldura (foto, polaroid, recorte,
  adesivo), o vídeo, o áudio, o contador, a tabela.
- **Estado em amarelo** (a regra "Yellow Means State"): a peça selecionada ganha o anel amarelo, a caixa de
  seleção é tracejada em amarelo, as alças de tamanho são quadradinhos de papel com borda amarela.
- **Os controles** são os do site: a etiqueta de papel para Voltar e o nome, a cartolina rosa para Editar
  (a ação principal), a régua de alumínio com os botões das ferramentas embaixo, no modo de editar.

**O que faria parecer errado mesmo bonito:** vidro fosco, brilhos, sombra colorida, cantos de pílula no
papel, abas trapézio, uma paleta nova fora das cartolinas, texto direto sobre o eucatex sem papel (exceto
o giz da seta, que é da própria parede, como o "giz" do DESIGN.md).

**Fidelidade.** Produção, por rodadas. A rodada 2 entrega o motor com as peças de verdade e fotos para
você aprovar o jeito antes da rodada 4 (editar).

---

## 4. Como funciona (as telas)

### 4.1 A aba e os endereços

- **Topo:** "Quadro livre" depois de "Flashcards" (`SECOES_DAS_ANOTACOES`, slug `quadro-livre`). Muda o
  topo do cofre: refazer `cofre-hashes.json` e você publica o cofre.
- **Endereços:** `/anotacoes/quadro-livre` (Tudo), `/anotacoes/quadro-livre/:grupo` (os quadros do grupo),
  `/anotacoes/quadro-livre/:grupo/:quadro` (o quadro em tela cheia). O grupo no endereço é o mesmo id dos
  Flashcards (`studyGroupId`). Uma rota com um `matcher` só, como a visita, para a página não ser refeita
  ao abrir e fechar um quadro.
- **Título da aba do navegador:** "Quadro livre" na lista; o nome do quadro com ele aberto.

### 4.2 A lista de um grupo

- **Abas = os grupos**, a mesma peça dos Flashcards (`StudyGroupTabs`, que já recebe `label`, `path` e
  `hidden`; o nome do arquivo fica, só o rótulo muda). Tudo mostra os quadros de todos os grupos. Um grupo
  sem quadro, como nos Flashcards: a pasta vazia com "Monte o primeiro quadro de X".
- **Cada quadro é uma folha de papel kraft** presa por tachinha, com uma **miniatura desenhada a partir dos
  dados** (as molduras como manchas de feltro, as peças como retalhos de papel, as setas a giz; nada de foto
  guardada, nada a mais no banco) e o **nome em fita crepe**. Embaixo, a conta ("42 peças") e quando
  mudou. Grade como a das pastas: as que couberem, duas no celular.
- **"Novo quadro"** é a primeira folha, em branco, com o +. Toca → pede o nome numa linha (o mesmo campo
  de papel do nome de pasta) → abre o quadro já no modo de editar (está vazio: não há o que ver).
- **Ordem:** os mexidos por último primeiro (decisão D11).
- **Menu (botão direito e dedo segurando, `ContextMenu`):** Abrir, Renomear, Duplicar, Mover para o
  grupo..., Apagar (pergunta pelo `RemoveAsking`, com Desfazer no aviso).

### 4.3 O quadro em tela cheia: ver

- Cobre a janela inteira (o topo do site some). Por cima do quadro, só:
  - **em cima à esquerda:** etiqueta de papel com "←" (Voltar para a lista; Esc também) e o **nome** em
    marcador;
  - **em cima à direita:** **Editar** (cartolina rosa) e, ao lado, "Tela cheia de verdade" (a API de tela
    cheia do navegador, para esconder também as barras do navegador);
  - **embaixo à direita:** o zoom num pedaço de régua: −, a porcentagem (toque = 100%), +, "Ver tudo".
- **Abre** onde você parou neste aparelho (a câmera fica só no aparelho); na primeira vez, "Ver tudo".
- **Mouse:** segurar e arrastar com o botão esquerdo em qualquer lugar move a câmera (depois de 4 px; um
  clique sem arrastar chega ao widget: toca o áudio, abre a nota, amplia a imagem). Botão do meio também
  move. **Roda do mouse = zoom no ponteiro**; Shift+roda anda para os lados. **Trackpad:** dois dedos andam,
  pinça dá zoom (o navegador avisa a pinça com `ctrlKey` na roda).
- **Toque:** um dedo anda, dois dão zoom; toque abre/usa; dedo segurando abre o menu.
- **Teclado:** setas andam, + e − dão zoom, 0 = Ver tudo, 1 = 100%, E = Editar, Tab passa pelas peças na
  ordem de leitura (seção 4.9).
- **Menu no ver:** numa peça, Abrir (nota), Ampliar (imagem), Copiar, "Ir até aqui" (centraliza); no
  fundo, Ver tudo, Editar o quadro.

### 4.4 Editar

Editar troca a cartolina rosa por **Pronto** e sobe a **régua das ferramentas** embaixo, no meio:

| Ferramenta | Atalho | O que faz |
|---|---|---|
| Selecionar | V | Padrão. Arrastar no fundo desenha a caixa de seleção. |
| Moldura | M | Arrastar desenha a moldura; ela nasce com o título "Sem título" já em edição. |
| Texto | T | Clique = bilhete ali, já escrevendo. Duplo clique no fundo faz o mesmo em qualquer ferramenta. |
| Anotação | N | Abre o seletor de fichas (`CardPicker`, o do widget Nota) com o grupo do quadro na frente; o item "Nova anotação" abre o editor com o grupo preenchido e põe a nota ali ao salvar. |
| Imagem | I | Escolher do aparelho (várias de uma vez, em grade a partir do ponto). Colar e soltar funcionam sempre. |
| Widget | W | A mesma folha de widget das anotações (`WidgetSheet`): contador, vídeo, áudio, tabela. |
| Seta | — | Não é ferramenta: sai das bolinhas nos lados da peça (abaixo). |

**Mover a câmera no editar:** Ctrl+arrastar no fundo, botão do meio, ou espaço+arrastar (o hábito do
Figma). Roda e trackpad como no ver.

**Selecionar:** clique seleciona; Shift ou Ctrl+clique soma ou tira; a caixa pega o que ela toca
inteiro (com Alt, o que ela só encosta); Ctrl+A tudo; Esc tira a seleção (e, sem seleção, sai do editar).
A caixa é tracejada em amarelo, com o fundo bem leve.

**Mover:** arrastar a seleção; as peças encaixam nos furos (26 px), Alt solta o encaixe. Setas do teclado
andam um furo (Shift: 1 px). Arrastar uma moldura leva o que está **inteiro dentro dela** no começo do
arrasto (como no Obsidian); a moldura de dentro de outra vai junto com o que tem dentro.

**Tamanho:** alças nos cantos e no meio dos lados. Imagens mantêm a proporção (Shift solta). Anotação,
vídeo, áudio, contador e tabela mudam a **largura**, e a altura vem do próprio conteúdo (medida e guardada
para o motor saber onde a peça está; ver D9). Área e bilhete mudam livres.

**Setas:** passando o mouse numa peça no editar, aparecem quatro bolinhas de giz no meio dos lados.
Arrastar de uma bolinha até outra peça liga as duas (o lado de chegada é o mais perto do ponteiro;
soltar no meio da peça escolhe o lado sozinho e ele muda quando as peças andam). Soltar no vazio abre um
menu: "Texto aqui", "Anotação aqui", "Imagem aqui", "Widget aqui" (a seta liga na nova). Duplo clique na
seta escreve o rótulo. Menu da seta: Rótulo, Cor, Pontas (→, ←, ↔, sem ponta), Apagar.

**Áreas:** duplo clique no título renomeia; menu: Renomear, Cor, Selecionar o que está dentro, Ajustar ao
conteúdo, Apagar só a moldura, Apagar a moldura e o que está dentro. Molduras ficam sempre atrás das outras peças;
uma moldura menor dentro de uma maior fica na frente da maior.

**Agrupar (Q2: os "agrupamentos" são as molduras; o Ctrl+G vem junto):** Ctrl+G junta a seleção num
grupo invisível, sem retângulo, que se move e seleciona como uma peça só; clique duplo entra no grupo para
pegar uma; Ctrl+Shift+G desfaz. No menu: "Juntar" e "Separar". A moldura continua sendo o jeito visível
de agrupar; o Ctrl+G é para o que não precisa de título (uma imagem e o bilhete dela, por exemplo).

**A etiqueta da seleção:** com algo selecionado, uma fileira de botões de tinta aparece acima da seleção
(Cor, Jeito da peça, Rótulo, Trazer para frente, Mandar para trás, Duplicar, Apagar). É a
etiqueta de tinta do Finalizar/Fixar: botões separados, que crescem e ganham cor com o mouse (seção 11).

**Desfazer e refazer:** Ctrl+Z, Ctrl+Shift+Z e Ctrl+Y, 100 passos por quadro, só na memória (um arrasto é
um passo, uma digitação no bilhete é um passo ao sair dele). Apagar pelo menu também dá o aviso com
Desfazer, como no resto do site.

**Copiar, colar, duplicar:** Ctrl+C/X/V e Ctrl+D. O que vai para a área de transferência: as peças (para
colar em outro quadro, pelo evento de copiar, com um tipo próprio) e o texto legível (títulos, bilhetes)
para colar fora do Murall. Colar de fora:

| O que chega | Vira |
|---|---|
| Imagem (print, arquivo) | Peça de imagem (guarda pelo `ImageStore`: encolhe a 900 px, sem duplicar a mesma imagem) |
| Link do YouTube/Vimeo | Widget de vídeo |
| Link de ficha do Murall, `[[título]]` ou `{{nota: ...}}` | Widget Nota |
| Uma linha `{{widget: ...}}` | O widget |
| Outro texto | Bilhete |

Soltar arquivos de imagem no quadro faz o mesmo que colar, no ponto onde soltou, em grade.

**Atalhos (lista também no "?" da régua):** V M T N I W, Ctrl+A, Del/Backspace, Ctrl+C/X/V/D, Ctrl+Z/Y,
Ctrl+G, ] e [ (frente/trás), setas, + −, 0, 1, Esc, E.

### 4.5 Cada peça no quadro

| Peça | De onde vem | No ver | No editar |
|---|---|---|---|
| Anotação | widget Nota (`LinkedCard`), os quatro jeitos | toque abre a nota (leitura); o "Texto inteiro" marca tarefas como hoje | jeito na etiqueta; duplo clique abre o editor da nota |
| Imagem | widget Imagem (`GluedMedia`), quatro molduras, legenda | toque amplia (`image-viewer`) | moldura e legenda |
| Vídeo, áudio, contador, tabela | os widgets das anotações | funcionam como no texto | duplo clique abre a `WidgetSheet` |
| Bilhete | novo, texto com a mesma formatação das anotações (`RichText`: negrito, listas, links, `[[nota]]`) | links funcionam | duplo clique escreve no próprio bilhete (um campo que cresce); cor da cartolina |
| Área | nova (feltro + Dymo) | só mostra | título, cor, ajustar ao conteúdo |
| Seta | nova (giz + fita crepe) | só mostra | rótulo, cor, pontas, lados |

A nota apagada, a privada que você não pode ver (visita) e a imagem que ainda não chegou ficam como hoje
nos widgets: o papel rasgado com o título guardado, o cadeado no texto da tela, a foto esperando.

### 4.6 Os estados

- **Quadro vazio** (editar): no meio da tela, um bilhete a caneta: "Arraste imagens para cá, ou escolha
  uma ferramenta embaixo." Some na primeira peça.
- **Quadro vazio no ver** (só acontece se esvaziar): "Este quadro está vazio" + Editar.
- **Carregando** (vindo da nuvem pela primeira vez neste aparelho): a folha kraft da lista com a miniatura
  aparece só quando há dados; abrir antes mostra "Trazendo o quadro..." no lugar da câmera.
- **Cheio** (limites da seção 5.3): o bilhete do aviso diz o que passou ("Este quadro chegou a 2.000
  peças") e a peça não entra.
- **Sem nuvem / cota do dia:** continua tudo no aparelho, com o mesmo aviso discreto da sincronização.
- **Apagado em outro aparelho enquanto você mexia:** aviso "Este quadro foi apagado em outro aparelho" com
  "Guardar uma cópia" (vira um quadro novo com o que você tinha).

### 4.7 Celular

O ver é completo (um dedo anda, pinça dá zoom, toque usa, dedo segurando abre o menu). O editar funciona
com o dedo: tocar seleciona, arrastar a peça selecionada move, arrastar o fundo anda; a caixa de seleção
vem do botão "Selecionar vários" da régua (um toque liga: arrastar no fundo passa a selecionar). A régua
das ferramentas rola de lado se não couber. Alvos de 44 px.

### 4.8 Visita (regra do CLAUDE.md)

O quadro nasce **privado**; na rodada 6 (Q4) ele ganha **Público**, como as anotações e os baralhos. Desde a
rodada 2, a tela do quadro é uma **peça** (`ui/free-board/`) que lê por uma fonte (`FREE_BOARD_SOURCE`,
como a `STUDY_SOURCE`) e recebe o que é do dono por entradas (`editable`, `ownerMenu`). A visita monta a
mesma peça com a fonte do colega, sem nada que escreve, em `/comparar/mural/quadro-livre/:grupo/:quadro`
(o `visitMatcher` ganha a seção), com a lista dos quadros públicos pelas mesmas abas e folhas kraft.

- **Quem vê o quê:** o quadro público mostra as peças; uma anotação privada dentro dele aparece como o
  widget Nota já mostra uma privada para quem não pode vê-la (papel com cadeado, sem título:
  `hideCardTitles`), e as imagens do quadro público entram em `imagem_publica` (o mesmo caminho das notas
  públicas).
- **Nuvem:** coluna `publico` em `quadros`; `GET /v1/murais/:codigo/quadros` (a lista pública) e
  `GET /v1/murais/:codigo/quadros/:id` (o quadro, só se público), com `?rev=` → 204. A visita guarda o
  quadro só na memória da página, como o mural do colega.
- **Na lista do dono:** a folha do quadro público ganha a mesma marca discreta das anotações públicas;
  "Público"/"Privado" no menu do quadro e na engrenagem da tela cheia.
- **Testes:** as peças entram em `PECAS` e `VISITA` de `scripts/visita-mesmas-pecas.test.mjs`, e um teste
  faz na visita o que o dono faz (abrir o quadro, andar, ampliar uma imagem), como em
  `src/app/ui/visit-study.spec.ts`.

### 4.9 Acessibilidade

- O quadro é uma região com nome ("Quadro Blue Prince"), e cada peça montada é um item com nome falado
  ("Anotação Nursery", "Imagem", "Área Roxo (Quartos), 12 peças", "Bilhete: Senha?").
- **Tab** anda pelas peças na **ordem de leitura** (moldura por moldura, de cima para baixo e da esquerda para a
  direita dentro de cada uma) e a câmera segue a peça com foco (ela é montada antes de receber o foco).
- **"Ver em lista"** (no menu do fundo e no "?"): uma folha com o quadro como texto — as molduras como títulos,
  as peças dentro delas, e as setas como "Nursery → Red Prince (Precisa da lupa)". Serve ao leitor de tela
  e é também o jeito rápido de achar algo no celular (tocar um item leva a câmera até ele).
- Movimento reduzido: a câmera pula em vez de deslizar.
- O amarelo de foco na parede e a tinta na cartolina, como no resto do site.

---

## 5. Os dados

### 5.1 O quadro (`core/free-board.ts`)

```ts
interface FreeBoard {
  v: 1;
  id: string;          // 22 letras, como as imagens (único entre contas)
  nome: string;        // até 60 letras
  grupo: string;       // o nome do grupo; comparado por lookKey, como o baralho
  em: string;          // ISO: a última mudança (ordem da lista, junção)
  n: FbNode[];         // as peças, na ordem de empilhar (a primeira fica embaixo)
  e: FbEdge[];         // as setas
}

type FbNode = FbBase & (
  | { t: 'm'; nome?: string }                         // moldura ("grupo" do pedido)
  | { t: 'x'; txt: string }                           // bilhete (markdown)
  | { t: 'w'; src: string }                           // widget: a mesma linha das anotações
);
interface FbBase {
  i: string;           // id curto, só dentro do quadro (base36, 4–6 letras)
  x: number; y: number; w: number; h: number;         // inteiros, no mundo
  c?: Cor;             // cartolina (moldura, bilhete) ou cor do giz; omitida = padrão
  g?: string;          // o agrupamento (Q2), se houver
}
interface FbEdge {
  i: string; a: string; b: string;                    // de, para (ids de peças)
  as?: Lado; bs?: Lado;                               // 't' | 'r' | 'b' | 'l'; omitido = escolhe sozinho
  p?: '-' | '<' | '<>';                               // pontas; omitido = só no fim (→), como no JSON Canvas
  c?: Cor; txt?: string;                              // cor do giz, rótulo
}
```

- **Widget = a linha de sempre** (`{{imagem: murall://imagem/ID | foto}}`, `{{nota: #id | Título}}`,
  `{{contador: ...}}`). Assim o quadro usa o registro de widgets inteiro (`core/widgets.ts`), a folha de
  editar, o `retitleCardLine` quando a nota muda de nome, o `localImageIds` para achar as imagens e o
  `hideCardTitles` para a visita, sem nada copiado.
- **Nada calculado é guardado:** quem está dentro de qual moldura, a ordem de leitura, a miniatura da lista,
  a altura medida só serve de palpite (o `h` do widget é atualizado quando a medida muda, para o motor).
- **Câmera fica no aparelho**, fora do quadro (seção 6.1).

### 5.2 A regra vale na leitura (`sanitizeFreeBoard`)

Como em `liveDecks` e `liveFolderOf`: o que chega (nuvem, backup, outra aba, importação) passa por um
sanitize que **corta, nunca apaga dado bom**: números fora da faixa voltam para a faixa, seta para peça
que não existe sai da lista mostrada, peça de tipo desconhecido fica guardada mas não aparece (um site
novo pode ter tipos que este não conhece; o sanitize os mantém, para não jogá-los fora ao reenviar). Cada
mudança de formato entra em `core/migrations.ts`, idempotente.

### 5.3 Limites

| Limite | Valor | Por quê |
|---|---|---|
| Peças por quadro | 2.000 | Bem acima do Blue Prince (~100) e dentro da meta do motor (seção 9.8). |
| Setas por quadro | 3.000 | |
| Bilhete | 4.000 letras | É bilhete; texto longo é anotação. |
| Rótulo da seta / título da moldura | 120 / 80 letras | |
| Coordenadas | ±10.000.000 | "Beira o infinito" (uns 380 mil furos de eucatex para cada lado) sem perder precisão. |
| Quadro compactado | 256 KB | Uns 20 mil peças de texto curto; nunca chega perto com 2.000. |
| Quadros por conta | 200 | |
| Tudo dos quadros por conta (compactado) | 5 MB | |

### 5.4 Quanto pesa (estimativa com o Blue Prince)

Uma imagem no quadro: `{"i":"k3f9","t":"w","x":1222,"y":-338,"w":240,"h":180,"src":"{{imagem: murall://imagem/kkdxDJwYDycpsMExjuKjNQ | foto}}"}`
≈ 120 bytes. Bilhete ≈ 60 + o texto. Seta com rótulo ≈ 70. Área ≈ 80.

| Quadro | Peças | JSON | Compactado |
|---|---|---|---|
| "Lugares para interagir" (75 imagens, 15 bilhetes, 50 setas, 3 molduras) | ~93 | ~14 KB | ~4–5 KB (os ids das imagens não comprimem) |
| Um quadro grande de estudo (300 peças, 200 setas) | 300 | ~45 KB | ~10 KB |

O que pesa de verdade são **as imagens**: 75 prints de 900 px a uns 60 KB = ~4,5 MB, quase um quinto dos
25 MB da conta. Por isso os limites sobem para 100 por dia e 60 MB (Q3).

---

## 6. Guardar no aparelho

### 6.1 Onde (`core/free-board-store.ts`)

- **Um banco novo do IndexedDB, `meu-mural:quadros`**, com um registro por quadro: `{ quadro, base, rev,
  sujo }` (o quadro como está, a versão como a nuvem a viu por último — a base da junção —, a versão da
  nuvem e se há mudança por enviar) e um registro `camera:<id>` por quadro, só deste aparelho. Por que não
  o `LocalData` (`meu-mural:dados`): ele lê tudo no começo, antes do app subir, e guarda uma cópia no
  localStorage; os quadros só precisam ser lidos quando a seção abre ou a sincronização roda, e não cabem
  no localStorage.
- **A lista** (nome, grupo, `em`, contagem e uma versão reduzida para a miniatura) fica num registro
  `indice`, atualizado junto, para a lista abrir sem ler todos os quadros.
- **Duas abas abertas:** `BroadcastChannel('meu-mural:quadros')` avisa "o quadro X mudou"; a outra aba lê
  de novo e, se estiver editando o mesmo quadro, junta em três vias (a mesma junção da nuvem, seção 7.5).
  Gravar confere antes se ninguém gravou no meio (como o `writeIfUnchanged` do `LocalData`), dentro de
  `navigator.locks.request('meu-mural:quadros:<id>')`.
- **Gravação:** ao soltar um arrasto, ao sair de um bilhete, a cada passo de desfazer; nunca a cada
  quadro de animação.

### 6.2 Regra do logout (CLAUDE.md)

- `meu-mural:quadros` entra na lista de `wipeBrowser` (`core/browser-reset.ts`); quem grava confere
  `storageFrozen()`; nada é lido no nível do módulo.
- `localHasContent` (`core/cloud-sync.ts`) conta os quadros: ao entrar na conta, os quadros de "ninguém"
  perguntam antes de ir para a conta, como o resto.
- Teste em `core/browser-reset.spec.ts`: o banco sai na limpeza.
- As miniaturas das imagens (seção 9.4) ficam só na memória: não sobra nada.

### 6.3 Backup, cópia e apagar o save

- O **arquivo de backup** leva os quadros (`quadros: FreeBoard[]` no payload) e as imagens deles (o backup
  já leva as imagens em base64). Importar um backup junta por id (o mais novo `em` de cada quadro).
- **"Apagar o save"** (`core/erase-save.ts`) apaga o banco também.
- **Copiar para a área de transferência** um quadro inteiro fica para depois (não pedido).

---

## 7. A nuvem

### 7.1 A tabela (no banco `mural`, migração `0024_quadros.sql`)

```sql
-- O Quadro livre (PLANO-QUADRO-LIVRE.md): um quadro por linha, compactado em gzip, que o servidor não abre.
-- Fica fora do mural privado para que mexer num quadro envie só ele.
CREATE TABLE quadros (
  id TEXT PRIMARY KEY,           -- o id do quadro (22 letras)
  usuario_id TEXT NOT NULL,
  rev INTEGER NOT NULL,          -- sobe a cada gravação
  dados BLOB,                    -- null = apagado (a lápide, para os outros aparelhos saberem)
  bytes INTEGER NOT NULL,
  atualizado_em TEXT NOT NULL,
  apagado_em TEXT
);
CREATE INDEX quadros_por_usuario ON quadros (usuario_id);

-- As imagens que cada quadro usa (o site manda a lista no envio): a limpeza das soltas não as apaga.
CREATE TABLE quadro_imagens (
  quadro_id TEXT NOT NULL,
  imagem_id TEXT NOT NULL,
  PRIMARY KEY (quadro_id, imagem_id)
);
CREATE INDEX quadro_imagens_por_imagem ON quadro_imagens (imagem_id);

-- O contador que diz ao site, de graça, se algum quadro mudou (ver 7.3).
ALTER TABLE usuarios ADD COLUMN quadros_versao INTEGER NOT NULL DEFAULT 0;
```

Por que no banco `mural` e não num banco à parte como as imagens: os quadros são pequenos (5 MB por
conta, no máximo), e no mesmo banco a gravação, a lista de imagens e a cota entram num lote só, atômico.
Um teto geral (`QUADROS_MB_TOTAL`, 100 MB no `wrangler.toml`, conferido por `SUM(bytes)`) protege o banco.

### 7.2 As rotas (`api/src/routes/boards.ts`)

| Rota | O que faz | Custo |
|---|---|---|
| `GET /v1/eu/quadros` | A lista: `[{id, rev, bytes, atualizado_em, apagado}]`, **sem os dados**. | 1 leitura por quadro da conta (índice) |
| `GET /v1/eu/quadros/:id` | O quadro compactado, como veio (`application/gzip`). `?rev=` igual → 204. | 1 leitura |
| `PUT /v1/eu/quadros/:id` | Corpo gzip; cabeçalho `Quadro-Rev-Base` (0 = novo) e `Quadro-Imagens` (os ids, separados por vírgula). Grava só se `rev = base` (senão 409 com a `rev` de agora). Confere tamanho, quadros por conta, MB por conta, MB total, 2 s desde a última gravação deste quadro. | ~4 linhas + 2 por imagem que entrou ou saiu do quadro |
| `DELETE /v1/eu/quadros/:id` | Vira lápide (`dados` null, `apagado_em`), tira as imagens do índice. | ~3 linhas + as imagens |

Sem rota de "baixar vários": no primeiro login de um aparelho, os quadros vêm um por um (até 4 ao mesmo
tempo, como as imagens) e só os que mudaram. Com 20 quadros, são 20 pedidos uma vez na vida do aparelho.

### 7.3 Saber que mudou sem perguntar

O site já pergunta pelo mural (`GET /v1/eu/mural?rev=`) a cada 5 minutos com a aba à vista, ao voltar à
aba e ao voltar a internet. Essa resposta ganha o cabeçalho **`Quadros-Versao`** (o contador
`usuarios.quadros_versao`, que sobe a cada gravação ou apagamento de quadro). O site só chama
`GET /v1/eu/quadros` quando o número muda. **Nenhum pedido a mais quando nada mudou.**

### 7.4 O ritmo de envio

- Com o quadro **sujo**: envia 4 s depois da última mudança; ao tocar em Pronto; ao voltar para a lista;
  ao esconder a aba (`fetch` com `keepalive`, que aceita até 64 KB: um quadro grande cabe; se não couber,
  vai na próxima rodada).
- Uma vez por vez por quadro (`navigator.locks`), e a fila respeita 429 e 503 como a das imagens.
- Uma hora editando sem parar = no máximo ~900 envios de ~5 KB ≈ 3.600 linhas, 6% da cota do dia. Na
  prática, bem menos (só manda quando para de mexer por 4 s).

### 7.5 Dois aparelhos mexendo no mesmo quadro (`core/free-board-merge.ts`)

Junção em três vias, sem pergunta, como o Kanban (`mergeBoards` + `core/merge-parts.ts`):

- **Peças e setas por id:** o que só um lado mexeu entra; os dois mexeram a mesma peça → **campo a campo**
  (`mergeFields`: posição de um lado e cor do outro ficam as duas); o mesmo campo diferente → vale o lado
  mexido por último (`em`). Apagada de um lado e não mexida do outro, sai; apagada de um lado e mexida do
  outro, **fica** (perder trabalho é pior que sobrar uma peça).
- **A ordem de empilhar:** `mergeOrder` dos ids.
- **Nome e grupo do quadro:** `mergeFields`.
- **Seta cuja peça sumiu na junção:** sai.
- No PUT com 409: baixa a de agora, junta com a base guardada, envia de novo (até 3 vezes).

### 7.6 As imagens do quadro

- O PUT manda os ids das imagens do quadro; a API mantém `quadro_imagens`. A limpeza das soltas
  (`api/src/domain/image.ts` e `cleanup.ts`) passa a pular **também** as que estão em `quadro_imagens`,
  como já pula as de `nota_imagens`. Assim uma imagem que só existe num quadro nunca é apagada, mesmo que
  um site antigo mande `imagens.usadas` sem ela.
- O envio do mural continua mandando `imagens.usadas` com as do mural **e** as dos quadros (o site novo),
  para o `solta_desde` não piscar.
- Quem vê a imagem de um quadro: só o dono; a do quadro público entra em `imagem_publica` (4.8).
- **Limites novos (Q3):** `IMAGENS_POR_DIA = "100"` e `IMAGENS_MB_PESSOA = "60"` no `wrangler.toml`
  (o teto geral continua 400 MB), com o texto de Ajustes › Imagens dizendo os números novos. Entra na
  rodada 3, junto com a seção, para o primeiro quadro grande já caber.
- A fila de imagens (`ImageSync`) é a mesma: o que passar dos 100 do dia espera a fila e sobe no dia
  seguinte, mas aparece na hora neste aparelho.

### 7.7 Apagar a conta, limpeza e saúde

- `api/src/domain/erase.ts`: `DELETE FROM quadro_imagens WHERE quadro_id IN (SELECT id FROM quadros WHERE
  usuario_id = ?)` e `DELETE FROM quadros WHERE usuario_id = ?`, antes de apagar as imagens.
- Limpeza diária: lápides com mais de 30 dias saem (o aparelho que ficou 30 dias sem abrir e ainda tem o
  quadro o reenvia como novo — o mesmo comportamento das imagens).
- Saúde e Uso das APIs (admin): "Quadros guardados" (quantos e MB).
- A checagem diária mostra o tamanho do banco `mural` como hoje; nada novo a medir fora dele.

### 7.8 API das AIs e MCP

Entra na rodada 6 (Q4), pelo mesmo caminho do resto da API (PLANO-API.md): o espelho e os pedidos.

- **Ler:** `ver_quadros` (os quadros por grupo: nome, quantas peças, quando mudou) e `ler_quadro` (o quadro
  como texto, o mesmo do "Ver em lista": as molduras como títulos, as peças dentro, as setas como
  "A → B (rótulo)", e o id de cada peça). O site manda essa versão em texto para o espelho
  (`api_espelho`, um registro por quadro, só quando o quadro muda e só o que mudou), nunca o blob: a API
  lê texto pronto e a chave limitada a grupos só vê os quadros desses grupos.
- **Escrever, por pedido (o site aplica):** `criar_quadro`, `acrescentar_no_quadro` (bilhetes, anotações
  pelo id, setas entre peças pelo id, uma moldura em volta de peças), `ligar_no_quadro`. A peça nova entra
  num lugar livre perto das peças a que se liga (ou à direita de tudo). Mover e apagar peças ficam fora da
  API (fácil de estragar um quadro às cegas); apagar o quadro, também.
- **Imagens:** `ver_imagem` já serve para as do quadro (passa a conferir também `quadro_imagens`).
- Contrato em `contrato/api-v1/quadros.ts`, ferramentas no MCP com a mesma descrição curta das outras, guia
  (`guia_do_murall`) com um parágrafo sobre o Quadro livre.

### 7.9 Custos por mês (estimativa para a sua conta)

| Recurso | Uso típico | Limite grátis |
|---|---|---|
| Linhas gravadas (D1) | ~2.000 num dia de muito quadro | 100 mil/dia (a API para em 60 mil) |
| Linhas lidas (D1) | ~50 por lista de quadros | 5 milhões/dia |
| Armazenamento | ~1 MB de quadros + as imagens (no `mural-imagens`) | 5 GB (500 MB por banco) |
| Pedidos ao Worker | 1 por envio de quadro | 100 mil/dia |
| CPU por pedido | gravar um blob (o PUT do mural já mede 29–52 ms e passa) | — |

---

## 8. Os grupos

- O quadro é de **um grupo** (como o baralho, G4 dos Estudos): sem grupo não existe; a aba Tudo mostra
  todos.
- **Renomear o grupo** (`LabelEdits.renameCategory`) leva os quadros (`FreeBoardStore.moveCategory`), como
  já leva os baralhos e o quadro do Kanban.
- **Apagar o grupo** leva os quadros junto; a pergunta diz quantos ("e 3 quadros livres"), como os
  baralhos (G7). As anotações que estavam nos quadros não são apagadas por isso.
- **"Mover para o grupo..."** no menu do quadro muda o grupo dele.
- **Anotações de outro grupo no quadro:** podem (é uma referência); o seletor abre no grupo do quadro.

---

## 9. Desempenho: o motor (`ui/free-board/`)

### 9.1 A câmera fora do Angular

- Um elemento `.mundo` com `transform: translate(x, y) scale(z)`; a câmera é um objeto comum, mudado nos
  eventos e aplicado **uma vez por quadro de animação** (`requestAnimationFrame`). Nenhum signal muda por
  quadro, então o Angular (sem zone) não roda nada durante o gesto.
- O fundo de eucatex é do **visor** (`background-position` e `background-size` pela câmera), não do
  mundo: infinito de graça.
- Zoom de 5% a 400%, sempre no ponteiro (ou no meio da pinça).

### 9.2 Só o que está perto da tela

- **Índice espacial em grade** (células de 1.024 px do mundo, `Map<célula, ids>`): achar o que toca uma
  caixa é olhar as células dela. Mil peças → microssegundos. Atualizado só para as peças que andaram.
- O conjunto visível (a tela + meia tela de folga em volta) é recalculado quando a câmera andou mais de um
  quarto da tela ou mudou o zoom em mais de 15%, e no fim do gesto; vira um signal, e só então o Angular
  monta ou desmonta peças (com folga para não piscar na borda).
- Teto de peças montadas (300); acima, as mais longe do centro esperam.
- A mesma ideia do `appPerto` e do `WallCardPool`, mas pela câmera (o `IntersectionObserver` não serve
  num mundo escalado).

### 9.3 Três níveis de detalhe (pelo tamanho na tela)

| Nível | Quando | O que aparece |
|---|---|---|
| **Perto** | a peça ocupa mais que ~60 px na tela (zoom ≳ 45% numa peça comum) | a peça de verdade (widget, bilhete, feltro, sombra) |
| **Meio** | ~20 a 60 px | uma versão leve: a nota como a tira "Só o título", a imagem na miniatura (9.4), bilhete com a primeira linha, widget com o ícone e o nome; sem sombras nem papel com grão |
| **Longe** | menos de ~20 px | nada no DOM: um retângulo da cor da peça numa **camada de canvas 2D** que desenha todas de uma vez (as molduras com o nome em letras grandes por cima, para você achar a região) |

O nível é por peça (uma moldura enorme continua "perto" quando as peças dentro dela já estão "longe"). Os
textos que leem a peça (`aria-label`) existem em todos os níveis.

### 9.4 Imagens

- Ao afastar, cada imagem troca o arquivo de 900 px por uma **miniatura de 256 px** feita no próprio
  aparelho (`createImageBitmap` + `OffscreenCanvas`, a partir do blob do `ImageStore`), guardada **só na
  memória** (até ~40 MB, as menos usadas saem primeiro). Nada vai para a nuvem ou fica no navegador.
- `decoding="async"` e montagem só perto da tela.

### 9.5 Texto nítido e gestos leves

- `will-change: transform` no `.mundo` **só durante o gesto**; 150 ms depois de parar, sai, e o Chrome
  redesenha tudo nítido na escala nova.
- Durante o gesto, o mundo ganha `data-movendo`: sem hover, sem `pointer-events` nas peças (como o
  `data-quieta` do mural).

### 9.6 Setas

- Uma camada SVG no mundo, só com as setas cujo retângulo toca a tela.
- A curva: ponto de saída no meio do lado escolhido (ou, sem lado, o par de lados com a menor distância
  entre os meios, com regras para peças sobrepostas), Bézier cúbica com os pontos de controle saindo
  perpendiculares ao lado, a uma distância proporcional à distância entre as peças (o jeito do Obsidian).
  A ponta é desenhada no fim, alinhada à tangente.
- O traço de giz: `stroke` com uma textura leve (um filtro SVG compartilhado, criado uma vez) e a
  espessura constante na tela (`vector-effect: non-scaling-stroke`), com o rótulo na fita crepe no meio da
  curva.
- Ao arrastar peças, só as setas delas são recalculadas, no mesmo quadro de animação.

### 9.7 Arrastar

- As peças arrastadas andam por `transform` (sem mexer em `left/top` nem no estado) e o estado recebe a
  posição nova ao soltar: uma gravação, um passo de desfazer.

### 9.8 Meta e medição

- **Meta:** 2.000 peças (500 imagens) e 1.500 setas, num PC comum: andar e dar zoom sem quadros acima de
  33 ms depois do primeiro segundo; abrir o quadro em menos de 300 ms; "Ver tudo" com tudo no nível
  "longe" a 60 quadros por segundo. Num aparelho fraco (CPU 4× mais lenta, sem GPU), andar sem travar com o
  Blue Prince inteiro.
- **Medição:** roteiro puppeteer (`.angular/pptr/quadro-livre-perf.mjs`) na build de produção, com um
  quadro gerado (semente fixa), contando quadros longos com `requestAnimationFrame` e `longtask`, como na
  otimização do mural.
- **Se o DOM não bater a meta** (o risco principal), o plano B já está no desenho: baixar o limite do nível
  "perto" e mandar mais coisa para o canvas 2D. Decido na rodada 2, com os números.

---

## 10. O que se reaproveita e o que é novo

| Reaproveitado | Onde entra |
|---|---|
| `core/widgets.ts`, `ui/note-widget.ts`, `ui/linked-card.ts`, `ui/glued-media.ts`, `ui/widget-sheet.ts`, `ui/card-picker.ts`, `ui/image-viewer.ts`, `ui/zoom-knob.ts` | as peças do quadro e como editá-las |
| `ui/rich-text.ts` | o texto do bilhete |
| `core/image-store.ts`, `core/image-sync.ts`, `core/images.ts` | colar, soltar, guardar e enviar imagens |
| `ui/context-menu.ts` (`ContextMenu`, `ContextMenuTrigger`), `ui/remove-asking.ts`, `ui/toast.ts` | os menus, apagar com pergunta e com Desfazer |
| `ui/study-group-tabs.ts`, `core/note-tabs.ts`, `ui/tab-more.ts` | as abas de grupo da lista |
| `ui/_etiqueta-acoes.scss` | a etiqueta da seleção |
| `shared/_eucatex.scss`, `ui/_felt.scss`, `ui/_paper-kit.scss`, os botões de papel, a régua | o fundo, a moldura, o bilhete, os controles |
| `core/merge-parts.ts`, `core/merge3.ts` | a junção em três vias |
| `core/storage.ts` (`storageFrozen`), `core/browser-reset.ts`, `core/backup.ts`, `core/erase-save.ts` | as regras do navegador e o backup |
| `api/src/domain/quota.ts` (`write`), `routes/http.ts`, o gzip do mural | a rota nova |
| `LabelEdits.renameCategory`, a pergunta de apagar grupo | os quadros seguem o grupo |
| `ui/folder-card.ts` (a grade das pastas) | a grade das folhas kraft |

| Novo de verdade | Por quê |
|---|---|
| `core/free-board.ts` (modelo, sanitize, limites), `core/free-board-merge.ts`, `core/free-board-geometry.ts` (índice em grade, setas, caixas) | não existe nada parecido |
| `core/free-board-store.ts`, `core/free-board-sync.ts` | o documento próprio fora do mural |
| `ui/free-board/` (motor: câmera, mundo, níveis, setas, seleção, régua das ferramentas) | é o canvas |
| `pages/free-boards-page.ts` (lista + quadro aberto) | a seção |
| `api/src/routes/boards.ts`, migração `0024_quadros.sql` | a nuvem |

---

## 11. As regras do CLAUDE.md, uma por uma

1. **Botões de hover dos cards:** as peças do quadro não ganham botões de hover (no ver, o toque usa a
   peça; no editar, as ações estão na etiqueta da seleção e no menu). A etiqueta da seleção, mesmo
   aparecendo por seleção e não por hover, usa `grupo`, `botao`, `cor-na-mao` e `com-nome` de
   `ui/_etiqueta-acoes.scss`, e um teste chama `expectEtiquetaPadrao`. Se em algum momento uma peça ganhar
   botão de hover, entra em `scripts/etiqueta-acoes.test.mjs`.
2. **Visita com as peças do dono:** seção 4.8.
3. **Logout apaga tudo:** seção 6.2.

---

## 12. Decisões

### 12.1 As suas (respondidas em 09/nov)

- **Q1. O nome do retângulo com título: Moldura.** Na tela é sempre "moldura" ("Moldura Roxo (Quartos)",
  ferramenta Moldura, atalho M). Cuidado anotado: a folha do widget Imagem já chama "Moldura" a escolha
  entre foto, polaroid, recorte e adesivo. No quadro, a etiqueta da seleção de uma imagem diz "Jeito da
  foto" e a folha do widget continua como é (é a mesma peça das anotações).
- **Q2. "Agrupamentos" são as molduras, e o Ctrl+G entra também** (juntar peças sem retângulo, 4.4).
- **Q3. Imagens: 100 por dia e 60 MB por conta** (7.6), na rodada 3.
- **Q4. Na rodada 6: quadro público na visita (4.8) e API das AIs + MCP (7.8).** Importar `.canvas` do
  Obsidian e minimapa ficam de fora (podem voltar depois; o formato já é o do JSON Canvas).

### 12.2 Minhas (pode mudar qualquer uma)

- **D1.** Quadro fora do mural privado, uma linha por quadro, com lápide ao apagar (seções 7.1–7.3).
- **D2.** Formato do JSON Canvas enxuto; widget guardado como a linha de sempre (5.1).
- **D3.** Motor próprio em DOM + canvas 2D para o "longe"; nenhuma biblioteca (2.1, 9).
- **D4.** Roda do mouse = zoom no ponteiro; trackpad: dois dedos andam, pinça dá zoom; Shift+roda anda de
  lado (4.3).
- **D5.** No ver, arrastar em cima de uma peça também move a câmera (o clique sem arrastar usa a peça).
- **D6.** Encaixe nos furos do eucatex (26 px), Alt solta.
- **D7.** A câmera fica só no aparelho; a primeira abertura é "Ver tudo".
- **D8.** Notas criadas pelo quadro são anotações comuns (aparecem no mural). "Só no quadro", como o "Só no
  Kanban", fica para quando você pedir.
- **D9.** Widgets e notas têm a altura do próprio conteúdo; só a largura muda à mão. Área e bilhete mudam
  livres. Imagem mantém a proporção.
- **D10.** Junção sem pergunta, campo a campo; mexida vence apagada (7.5).
- **D11.** A lista ordena pelos mexidos por último.
- **D12.** Apagar o grupo leva os quadros, avisando na pergunta; renomear leva junto (8).
- **D13.** Quadro nasce privado; Público, visita, API e MCP na rodada 6 (Q4).
- **D14.** O endereço `/anotacoes/quadro-livre/:grupo/:quadro`; no código, `FreeBoard`.
- **D15.** Sem miniatura guardada da lista: desenhada dos dados.

---

## 13. Rodadas (uma de cada vez, cada uma com BUILD, Novidades, testes, build de produção, smoke e push)

Antes de cada rodada com tela: Impeccable (`craft-floor.md` antes de editar); no fim de cada uma, crítica
do Impeccable e fotos 2x de perto (computador e celular). No fim de tudo: crítica e auditoria do
Impeccable sobre a seção inteira e **`/code-review high`**, com todos os achados corrigidos e registrados
numa seção nova deste arquivo.

| Rodada | O que entra | Itens do pedido |
|---|---|---|
| **1. Dados no aparelho** | `core/free-board.ts` (modelo, sanitize, limites, ids), `core/free-board-merge.ts`, `core/free-board-geometry.ts`, `FreeBoardStore` (IndexedDB, abas, wipe, `localHasContent`, backup, apagar o save), grupos (renomear/apagar), `imagens.usadas` com as dos quadros. Só testes, sem tela. | 2, 8 |
| **2. O motor** | `ui/free-board/` só para ver: câmera, fundo, índice, os três níveis, miniaturas, setas, as peças de verdade, teclado e acessibilidade básica. Uma página escondida de teste com o Blue Prince remontado à mão (minhas imagens de exemplo) e o quadro gerado de 2.000 peças. **Medição (9.8) e fotos para você aprovar o jeito.** | 3, 5, 7 |
| **3. A seção** | a aba no topo (+ hashes do cofre; você publica o cofre), rotas, a lista por grupo (folhas kraft com miniatura, Novo quadro, menu), a tela cheia no ver, os limites novos das imagens (Q3). Novidades: funcionalidade (1.43.0). | 1, 2, 3 |
| **4. Editar** | régua das ferramentas, selecionar e caixa de seleção, mover e encaixar, tamanho, molduras, bilhetes, anotação, imagem, widget, setas e rótulos, Ctrl+G (Q2), etiqueta da seleção, menus, desfazer/refazer, copiar/colar/soltar, atalhos, celular. | 4, 6, 7 |
| **5. A nuvem** | migração 0024, `routes/boards.ts`, cota, `Quadros-Versao` no GET do mural, `FreeBoardSync` (fila, keepalive, 409 → junção), lápides, `quadro_imagens` na limpeza, apagar a conta, saúde. Testes da API (Node + D1) e e2e com dois aparelhos. | 8 |
| **6. Pontas** | "Ver em lista", estados (vazio, cheio, apagado em outro aparelho), movimento reduzido, quadro público na visita (4.8), API das AIs e MCP (7.8), crítica final, `/code-review high` e correções. | 9 |

A ordem dados → motor → seção → editar → nuvem deixa o quadro funcionando só no aparelho a partir da
rodada 3 (com a nuvem chegando na 5). Se preferir a nuvem antes da edição, a 5 pode vir depois da 3.

---

## 14. A conferir (riscos)

- **O DOM aguenta a meta?** A rodada 2 mede antes de construir o resto. Plano B na 9.8.
- **Widgets dentro de um mundo escalado:** o vídeo (iframe), o áudio (iframe invisível) e a ampliação
  (`pieceLift`, popover) foram feitos para o texto. O popover sai do mundo (vai para a camada de cima) e
  deve funcionar; o iframe escalado precisa do contra-zoom que a ampliação já faz. Conferir um a um na
  rodada 2.
- **Altura medida dos widgets** (D9): o widget Nota e a tabela calculam tamanho pelas linhas da pauta
  (`lines`). No quadro não há pauta: passar um tamanho pela largura. Conferir na rodada 2.
- **Texto borrado no Safari:** o Safari não redesenha a escala como o Chrome. O site é usado no Chrome;
  conferir pelo menos que fica legível.
- **Pinça do trackpad x roda do mouse:** a detecção por `ctrlKey` e pelo tamanho do passo pode errar em
  algum mouse; se errar, um ajuste em Ajustes (como "roda = andar").
- **Duas "molduras" na tela:** a moldura do quadro e a moldura da foto (Q1). Conferir na crítica do Impeccable se a etiqueta "Jeito da foto" basta.
- **O topo dividido com o cofre:** a rodada 3 depende de você publicar o cofre para o topo dele bater.
- **Arquivos grandes de estilo:** os orçamentos de estilo por componente (24 KB) já estouraram antes;
  o motor nasce em vários arquivos pequenos.
- **Testes instáveis conhecidos** (`rich-editor.grows.spec.ts` na suíte inteira): não são desta feature.

---

## 15. Andamento

### Rodada 1: dados no aparelho (09/nov, BUILD 828)

Feito, só testes, sem tela:

- `core/free-board.ts`: o modelo (`FreeBoard`, peças `m`/`x`/`w`, setas), `sanitizeFreeBoard` (corta, guarda
  os campos e as peças de um site mais novo sem mostrá-los), os limites, os ids, as funções puras que a
  rodada 4 vai usar (pôr, tirar, andar, ligar, empilhar, Ctrl+G) e os grupos (`boardsMovedGroup`).
- `core/free-board-geometry.ts`: furos de 26 px, caixas, o índice em grade (`GridIndex`), o dono de cada
  peça entre as molduras, a ordem de desenhar e a de leitura, a curva das setas e a câmera (zoom no ponteiro,
  "Ver tudo"). A rodada 2 desenha a partir daqui.
- `core/free-board-merge.ts`: a junção em três vias (seção 7.5), usada já entre abas e, na rodada 5, com a
  nuvem.
- `core/free-board-store.ts` (`FreeBoardStore`): banco `meu-mural:quadros` (quadros e câmeras), uma
  gravação por vez, aviso às outras abas, lápide para o que já subiu, criar, renomear, mover de grupo,
  duplicar, apagar com Desfazer, backup, imagens usadas.
- Ligado: `wipeBrowser` e "Apagar o save" levam o banco; `localHasContent` conta os quadros; o envio do
  mural manda as imagens dos quadros nas `usadas`; renomear ou apagar um grupo leva os quadros
  (`LabelEdits`) e a pergunta de apagar o grupo diz quais vão; o arquivo de backup leva os quadros
  (`quadros`) e Ajustes › Backup os traz de volta.

Decidido no caminho (pode mudar):

- **`save(quadro, de)`**: a gravação recebe a versão de onde a mudança partiu. Sem isso, se a outra aba
  avisasse antes de esta gravar, a gravação daqui passaria por cima da de lá. A tela da rodada 4 passa a
  versão que tinha e usa a devolvida.
- **Sem o registro `indice`** da seção 6.1: os quadros são pequenos e ler todos ao abrir a seção custa
  pouco. Volta se a lista ficar lenta com muitos quadros.
- **A loja lê o banco ao ser criada** (como as imagens), não só quando a seção abre: a sincronização
  precisa saber se há quadros (`localHasContent`) e quais imagens eles usam.
- As Novidades não mudam nesta rodada (desempate novo em NOVIDADES.md: a base sem tela entra com a
  rodada que a mostra).
