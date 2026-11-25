# Plano: Canvas no mural (o Quadro livre vira uma anotação)

Pedido do dono em 25/nov/2026. Este plano é para ser seguido por quem for implementar (outra sessão, outra AI):
tudo o que foi decidido está aqui, com o porquê, os arquivos e a ordem. Leia antes o `CLAUDE.md` da raiz (as três
regras: botões de hover, visita com as mesmas peças, sair da conta apaga tudo) e a memória do projeto.

## 0. Resumo

- **A aba Quadro livre morre.** O quadro livre passa a ser um **canvas**: um segundo tipo de anotação no mural de
  anotações, ao lado das cartolinas. O mural mostra dois tipos: a cartolina (o padrão) e o canvas.
- **Um canvas é uma anotação.** Tem o que a cartolina tem: grupo, pasta, tags, data, capa, público ou privado,
  fixar, finalizar, compartilhar com pessoas, comentários e reações, filtros, busca, ordem, marcar com Ctrl+clique,
  mover para a pasta, apagar com Desfazer. **Não entra no Kanban nem nos Flashcards.**
- **Só se cria pelo botão direito no nada** do mural de anotações: "Novo canvas aqui", logo abaixo de "Nova
  anotação aqui". (Nenhum outro botão por enquanto: nada no "+ Nova anotação" do topo.)
- **O card do canvas na parede** é o escolhido pelo dono depois de três rodadas de exemplos: um **pedaço de
  eucatex numa moldura de alumínio, pendurado num prego por um barbante**, com o quadro desenhado em miniatura e o
  nome numa fita Dymo. **Nunca passa dos limites de uma anotação comum** (regra do dono). Sem tags e sem data à
  vista (o dono achou poluído): elas ficam no leitor de tela, nos filtros e na busca.
- **Todas as vistas** do mural de anotações mostram o canvas: Comum, Inteira, Visão geral e Lista.
- **Por dentro:** a anotação guarda o lugar e o "básico" (o que a cartolina tem) e aponta para o documento do
  quadro que já existe (`quadros`, com sincronização, junção peça a peça, imagens e API próprios). Não se
  reescreve o motor do Quadro livre: ele continua sendo a tela do canvas aberto.

## 1. O que existe hoje (não reinventar)

| Peça | Onde | O que se reaproveita |
|---|---|---|
| O quadro (dados, limites, `sanitizeFreeBoard`) | `core/free-board.ts` | igual |
| Guardar no aparelho (IndexedDB `meu-mural:quadros`) | `core/free-board-store.ts` (`create`, `save`, `update`, `rename`, `setPublic`, `moveToGroup`, `duplicate`, `remove`, `restore`, `moveGroup`, `forBackup`) | igual; o canvas chama estes |
| Nuvem (rev por quadro, 409, junção, `Quadros-Versao`) | `core/free-board-sync.ts`, `core/free-board-merge.ts`, `api/src/routes/boards.ts` | igual, mais o acesso pela anotação (seção 6) |
| O motor de ver e editar | `ui/free-board/*` (`app-free-board`, `board-editor`, `board-top`, `tool-ruler`…) | igual: é a tela do canvas aberto |
| A miniatura desenhada dos dados | `ui/free-board/board-sketch.ts` (`app-board-sketch`) | é o desenho dentro do eucatex do card |
| O texto do quadro em lista | `core/free-board-text.ts` | busca do mural e copiar (Ctrl+C) |
| A página da aba | `pages/free-boards-page.*`, `ui/free-board/board-card.ts` | **sai** (rodada 5); a parte que abre o quadro em tela cheia vira a rota do canvas |
| O menu do nada | `pages/wall-board.ts` (`gapSections`, `folderSections`) | ganha "Novo canvas aqui" |
| As fichas na parede | `pages/wall-cards.ts` (`WallCardPool`, diretiva `appFichas`), `ui/review-card.ts` | o pool monta o card do canvas no lugar da `app-review-card` |
| A anotação | `core/review.ts` (`Review`, `sanitizeReview`, `isNote`) | ganha o campo do canvas |
| Anotações compartilhadas (nuvem `notas`, `nota_membros`) | `core/shared-notes.ts`, `core/shared-store.ts`, `api/src/routes/notes.ts` | o compartilhar do canvas é o da anotação |
| Grupos compartilhados (quadros já vão com o grupo, P2) | `PLANO-COMPARTILHAR.md`, `api/src/routes/groups.ts` | igual |
| Visita (quadros públicos servidos pela nuvem) | `core/visit-boards.ts`, `ui/visit-boards.ts` | o canvas público abre na visita por eles |
| Botões de hover | `ui/_etiqueta-acoes.scss`, `testing/etiqueta-acoes.spec.ts` | Finalizar e Fixar do canvas |
| Laboratório dos exemplos (fora do código) | `.angular/canvas-lab/` (`canvas-c.css`, versão `f`; fotos em `fotos/`) | a referência visual do card |

## 2. O card na parede (a versão escolhida, refinada)

Referência: `.angular/canvas-lab/canvas-c.css` (bloco `f` e "f refinado") e `fotos/f-refinado.png`. Isto é a
especificação; o código de verdade nasce em `ui/canvas-card.ts` (peça nova, `app-canvas-card`).

### 2.1 Anatomia (vista Comum)

De cima para baixo, numa caixa da largura da ficha (`--card-w`, a mesma das anotações):

1. **O prego**: 12px, metal (gradiente radial claro para o cinza), sombra curta, no centro, no alto da caixa.
2. **O barbante**: do prego até a beirada de cima da moldura, a 13% e 87% da largura, e **entra por trás da
   moldura** (sem olhal nem argola à vista: o dono pediu para tirar); cor de barbante (`#e3d5b4`), 1,8px, sombra
   de 1px. **Passa por trás da orelha do grupo** (a orelha o cobre), nunca por cima.
3. **A orelha do grupo** (ou do assunto, na aba de um grupo): a mesma das anotações (`.aba-cat`, manilha ou
   `.orelha-cor`), atrás da moldura, que sobe 6px com o mouse. Reaproveitar o markup e o estilo da `review-card`
   (extrair para um partial `ui/_orelha-ficha.scss` se precisar; não copiar).
4. **A moldura**: alumínio (o gradiente de 5 paradas do laboratório), 7px, cantos de 3px; **espessura** à
   direita e embaixo (`3px 4px 0 #6d7176, 4px 5px 0 #4b4e52`) e a sombra longe (`10px 22px 26px rgb(0 0 0/.55)`):
   está afastada da parede.
5. **O eucatex**: o grafite com os furos (o mesmo desenho da parede, em ponto pequeno), sombra para dentro, e por
   cima a **miniatura** (`app-board-sketch`, com `--sketch-respiro: 9px`). Proporção **16:9**.
   - **Com capa** (a anotação tem `game.coverUrl`): no lugar da miniatura, a foto da capa preenchendo o eucatex
     (`object-fit: cover`), com o plástico de contato por cima (o mesmo da capa das anotações).
   - **Vazio** (sem peças): "Canvas vazio" a giz (Kalam, `--wall-ink-2`), centrado.
6. **A fita Dymo** com o nome: preta `#121212`, letras `#ebe5d8` em Barlow Condensed 700, 0,95rem, maiúsculas,
   `letter-spacing: .16em`, relevo (`text-shadow`), presa na beirada de baixo à esquerda (18px, sai 14px para
   baixo), torta -1,5°. Uma linha só, `max-width: calc(100% - 44px)`, reticências.

**Sem** tags, data, contagem de peças, "público" ou cadeado à vista. Tudo isso vai no nome acessível (2.4).

### 2.2 Física e movimento

- O card **gira em volta do prego** (`transform-origin` no prego), `rotate: tilt × 1,3°`, com o `--tilt`
  determinístico do id (o mesmo `wall-physics` das fichas). Nada de tachinha.
- **Mouse em cima / foco:** endireita (0°) na curva física (`--t-physical`, `--ease-physical`), a sombra encurta
  um pouco, a orelha sobe 6px como nas anotações. Sem quique (o único quique do sistema é a tachinha).
- **Apertar (`:active`):** volta para a parede em 80ms, como a ficha.
- **Chegada** (canvas novo): cai como a ficha nova (`Landing`), mas sem o soco da tachinha; o barbante estica.
- `prefers-reduced-motion`: sem giro nem transição.

### 2.3 Estados

| Estado | Como aparece | Igual a |
|---|---|---|
| Fixado | o mesmo sinal de fixada das anotações | `review-card` |
| Finalizado | o carimbo das anotações por cima do eucatex | `app-done-stamp` |
| Marcado (Ctrl+clique) | o anel tracejado 8px fora da moldura e o disco com o número | "Marked to copy" do DESIGN.md |
| Escolhendo (Marcar) | o adesivo redondo no canto de cima à direita | "Picking sticker" |
| Foco do teclado | anel `hi` de 3px a 5px da moldura | a ficha |
| Compartilhado / público | só no nome acessível e no Quem vê (como a cartolina hoje não mostra o cadeado no card) | — |
| Na visita | a mesma peça, sem os botões do dono | regra da visita |

**Botões de hover (regra do CLAUDE.md):** Finalizar e Fixar, cada um na sua etiqueta de tinta, pelos mixins de
`ui/_etiqueta-acoes.scss` (`grupo`, `botao`, `mostra`, `cor-na-mao`, `com-nome`), presos no alto da moldura à
direita, onde ficam nas anotações. O card só decide onde ficam e quando aparecem; o teste usa
`expectEtiquetaPadrao`. Nada de revelar botões com o mouse por conta própria (`scripts/etiqueta-acoes.test.mjs`).

### 2.4 Acessibilidade

- Um botão invisível cobrindo o card (como a `.hit` da ficha): "Abrir canvas: {nome}, {N} peças, grupo {grupo},
  {data}, {tags}, {privado/público/compartilhado}".
- O prego, o barbante, a moldura e a miniatura são `aria-hidden`.
- As setas do teclado andam pelos canvas como pelas fichas (`pages/wall-keys.ts`, `stepFocus`): o card entra na
  mesma lista de focáveis.

### 2.5 Os limites (regra do dono)

**O card do canvas nunca passa da largura nem da altura máxima de uma anotação comum na mesma vista.** Medido na
Comum em 25/nov: largura da ficha (395px num computador de 1366, 358 no celular de 390) e altura máxima ~361px
(355 no celular). Com 16:9 o canvas fica com ~294px (274 no celular). Escrever um teste que monta a parede com a
anotação mais alta possível e um canvas e confere `canvas.h ≤ maior anotação` e `canvas.w ≤ ficha` (computador e
celular). A cartolina Larga e Alta não existem para o canvas: o "Tamanho da ficha" não aparece para ele.

### 2.6 As outras vistas

| Vista | O canvas | Notas |
|---|---|---|
| **Comum** (`completa`) | 2.1 inteiro | — |
| **Inteira** | igual à Comum | a Inteira mostra o texto todo da cartolina; o canvas não tem texto, então fica igual (mesmos limites) |
| **Visão geral** (`simples` + `overview`) | sem prego nem barbante (as fichas da Visão geral não têm tachinha: deitadas na mesa, `tilt × 0,3`, sem sombra de queda), a moldura com a miniatura 16:10 e a Dymo menor (0,78rem) com o nome; a orelha igual | altura mínima de 98px como as outras; Finalizar/Fixar só com o desenho, só no hover |
| **Lista** (`ui/note-index.ts`) | a linha de sempre; no lugar da tirinha de cartolina (14×10), uma **moldurinha** (14×10, borda de alumínio de 2px, fundo grafite); no lugar das tarefas, "N peças" | a orelha, o título, as marcas e a data iguais |
| Calendário, widget Nota, Comparar, perfil | a Simples (`compact`) de fora do mural continua só para cartolinas: o canvas não entra nesses lugares na primeira versão (filtrar com `isCanvas`) | anotar no plano se o dono pedir depois |

## 3. Criar, abrir e mexer

### 3.1 Criar (o único jeito: botão direito no nada)

- `wall-board.ts`, `gapSections()`: numa aba de grupo, a primeira leva fica
  `Nova anotação aqui` · **`Novo canvas aqui`** (`ICON` novo `canvas`, um desenho do Lucide parecido com o
  `workflow`; seguir `ui/icons.ts`, sem repetir ícone) · `Nova pasta aqui`. No Tudo: `Nova anotação` · `Novo canvas`.
  No menu de uma pasta (`folderSections`): `Novo canvas aqui` depois de `Nova anotação aqui`.
- Nas abas que juntam grupos (Fixadas, Compartilhadas), não aparece (como a Nova anotação).
- Ao escolher: nasce o canvas **na hora**, sem formulário: a anotação "Canvas sem nome" no grupo e na pasta abertos
  (no Tudo, no grupo de sempre, como a anotação nova) e o quadro vazio ligado a ela; a página abre o canvas em
  tela cheia **já no Editar**, com o nome no topo selecionado para escrever. Se a pessoa sair sem mexer em nada
  (nome padrão e zero peças), o canvas é apagado sem perguntar (como o bilhete vazio do quadro).
- Na visita, não há menu (como hoje).

### 3.2 Abrir

- Clicar no card abre o canvas em tela cheia: o mesmo `app-free-board` (ver primeiro, **Editar** depois) que a
  aba abria. Endereço novo: **`/anotacoes/canvas/:id`** (o id da anotação). Os endereços antigos
  `/anotacoes/quadro-livre[/:grupo[/:quadro]]` levam ao canvas do quadro (ou ao mural, se não houver).
- O topo do canvas aberto (`ui/free-board/board-top.ts`) mostra o nome (renomear muda o título da anotação) e
  ganha **Detalhes**: abre o editor da anotação em modo canvas (3.3).
- Fechar volta para o mural, no lugar de onde saiu (a ficha com foco).

### 3.3 Editar o básico (o editor da anotação em modo canvas)

`ui/review-editor.*` no ramo das anotações, com o canvas: Título, a capa ("Pôr uma capa (opcional)"), Grupo,
Tags, a data, Público/Privado (e o Quem vê, se compartilhado). **Somem:** o texto (o corpo é o quadro), o Tamanho
da ficha, o papel/estampa/rabisco/estrago (o card não é cartolina), "Só no Kanban", "Virar flashcard" e tudo dos
Estudos. Mudar o grupo ou o público passa pelo elo (4.2), que leva para o quadro.

### 3.4 O menu do botão direito no card

O mesmo das anotações, menos o que não vale: Abrir · Detalhes · Fixar · Finalizar · Mover para… (pasta) ·
Compartilhar / Quem vê · Duplicar · Copiar (o texto do quadro, `free-board-text`) · Apagar (com Desfazer, que
volta a anotação **e** o quadro). Fora: tudo do Kanban, dos Flashcards e "Abrir em duas" (lado a lado de leitura).

## 4. Os dados

### 4.1 A anotação

- `Review` ganha `canvas?: string`: o id do quadro (22 letras, `FreeBoard.id`). `isCanvas(r)` em `core/review.ts`.
  `sanitizeReview` guarda o campo (validado pelo `ID_RE` do quadro). O `text` do canvas fica vazio.
- **Site velho aberto em outra aba ou aparelho:** `sanitizeReview` monta um objeto novo e jogaria fora o campo,
  e um site velho que gravasse a anotação a transformaria em cartolina vazia. Conferir na rodada 1 como o site
  trata dado de uma build mais nova (`BUILD` no mural da nuvem e no backup, `core/migrations.ts`, as folhas que não
  abriam em `stale-chunks`) e travar: o site velho que vê um mural de build mais nova recarrega antes de gravar.
  Se a trava não existir, criá-la nesta rodada (é o que protege todo campo novo daqui para a frente).
- O id da anotação de **todo** canvas (não só do convertido) é derivado do quadro: `cv-` + id do quadro
  (`core/canvas-id.ts`, decisão D7). O `canvas` sai do id no `sanitizeNote`: um site de antes da trava (a build
  1048 e as anteriores, ainda abertas em alguma aba ou aparelho) joga o campo fora, mas guarda o id, e a anotação
  volta a ser canvas no site novo. E dois aparelhos convertendo o mesmo quadro (rodada 5) geram a mesma anotação.
- **A trava** (feita na rodada 1, `core/newer-build.ts`): só havia a da nuvem pelo formato (`SYNC_SCHEMA`, que subiu para 66 com o canvas), que pede lembrar de subir a versão e não pegava as abas. Cada site marca a build dele em
  `meu-mural:build` na subida (`main.ts`); o que acha uma marca maior (outra aba abriu a nova, ou é uma versão
  guardada) para de gravar e recarrega, uma vez por aba e por build (`meu-mural:recarregou-build` no
  sessionStorage). Na nuvem, o mural de uma build maior faz a sincronização parar sem juntar nem enviar
  (`desatualizado`, como o `SYNC_SCHEMA` maior) e recarregar uma vez. Sem conseguir, um bilhete pede para
  recarregar. Cuidado: um `ng serve` logado na conta de verdade com a BUILD já somada (antes do deploy) trava os
  outros aparelhos até o deploy chegar.
- Kanban e Flashcards ignoram o canvas: `KanbanStore` (quadro, `boardOnly`, colunas), os seletores de anotação
  (`CardPicker`, "Escolher a nota"), o virar flashcard, o widget Nota (escolher uma nota) e o Calendário filtram
  `isCanvas`. Escrever um teste por lugar.

### 4.2 O elo anotação ↔ quadro (`core/canvas-link.ts`, serviço novo)

Um lugar só para manter os dois juntos. **A anotação manda**; o quadro segue:

| Na anotação | No quadro |
|---|---|
| criar (`newCanvas(grupo, pasta)`) | `FreeBoardStore.create(nome, grupo, id)` e a anotação com `canvas: id`, num passo só |
| título | `nome` (`rename`) |
| grupo (`category`) | `grupo` (`moveToGroup`) |
| público | `publico` (`setPublic`) |
| apagar | `remove` (lápide); Desfazer = `restore` + a anotação de volta |
| duplicar | `duplicate` + anotação nova apontando para a cópia |
| apagar o grupo com destino / mover o grupo | o `moveGroup` que já existe e as anotações do grupo andam juntas |

- Renomear pelo topo do canvas muda a **anotação**, e o elo leva ao quadro (nunca o contrário).
- Um **reconciliador** roda na subida e quando a lista de quadros ou de anotações muda (`CanvasLink.reconcile`,
  injetado no `App`). Decide pelas datas e **nunca apaga o que só ainda não chegou**:
  - canvas e quadro aqui (o quadro é seu): nome, grupo e público do quadro voltam ao da anotação;
  - canvas sem o quadro: só age quando sabe que o quadro foi apagado: a lápide daqui (a mais nova vale: a lápide
    leva a anotação, a anotação mais nova traz o quadro de volta vazio) ou o quadro esteve aqui nesta página e
    sumiu (a nuvem o tirou). O quadro que nunca esteve aqui (aparelho novo, a lista descendo) fica esperando;
  - quadro sem o canvas: a anotação apagada (por qualquer caminho: mural, várias, API, outro aparelho) depois da
    última mexida no quadro leva o quadro junto, com a cópia em memória, que volta se a anotação voltar (o
    Desfazer de qualquer caminho). O quadro que nunca teve anotação vira canvas só na rodada 5;
  - o quadro apagado em outro aparelho mas mexido aqui vira uma cópia (`keepCopy`): o canvas passa para ela
    (a anotação ganha o id `cv-` da cópia, `FreeBoardStore.copyOf`);
  - a compartilhada e o quadro de outra pessoa ficam de fora até a rodada 4.
- **Para a rodada 4:** a trava pela build só confere o mural privado; as anotações compartilhadas (`notas`) e o
  documento de um grupo compartilhado ainda passam pelo saneamento de um site velho. O canvas resiste pelo id,
  mas campo novo nesses documentos precisa da mesma conferência.
- Apagar o grupo sem destino (as anotações vão para Sem grupo) não leva o quadro de um canvas
  (`boardsMovedGroup(..., keep)`), e a folha de apagar o grupo não conta esses quadros. O canvas sem grupo tem o
  quadro no grupo `Sem grupo` (o quadro precisa de um).
- A busca do mural casa o texto do canvas (`free-board-text`), guardado em memória por id do quadro e `em`.
- Backup: as anotações e os quadros já vão no backup; conferir que restaurar traz os dois e o elo.
- **Regra do logout:** nada novo no navegador. Se surgir chave nova, começa com `meu-mural:` e entra no teste de
  `core/browser-reset.spec.ts`.

### 4.3 Onde mora cada coisa na nuvem

| O canvas | A anotação | O quadro |
|---|---|---|
| privado ou público (só seu) | no mural privado (como a cartolina) | `quadros` do dono, `publico` espelhado da anotação |
| num grupo compartilhado | no documento do grupo (como a cartolina do grupo) | `quadros.grupo_id` (já existe, P2) |
| compartilhado com pessoas | `notas` + `nota_membros` (como a cartolina compartilhada) | `quadros.nota_id` → o acesso vem da nota (6) |

## 5. Ordem das rodadas

Uma por vez. Cada rodada: código, testes novos, `npx ng test` inteiro, `npx ng build` de produção (orçamento),
smoke na dist com dados salvos, fotos 2x de perto no computador e no celular quando muda a tela, **/code-review
mid** e os consertos dele **antes** de começar a próxima, BUILD +1 em `core/build.ts`, entrada nas Novidades
(`NOVIDADES.md`, ler antes; ajustes do dia numa entrada), commit só no nome do dono (sem Co-Authored-By), push.
Marcar o Andamento (seção 9).

1. **Os dados e o elo.** `Review.canvas`, `isCanvas`, `sanitizeReview`, a trava do site velho, `core/canvas-link.ts`
   (criar, renomear, grupo, público, apagar/Desfazer, duplicar, reconciliador sem a conversão), o filtro do Kanban,
   dos Flashcards, dos seletores, do widget Nota e do Calendário, a busca pelo texto do quadro. Só testes (nada na
   tela ainda).
2. **O card na parede.** `ui/canvas-card.ts` (2.1–2.5) e o pool (`wall-cards.ts`) montando-o para `isCanvas`;
   as quatro vistas (2.6); botões de hover; teclado; marcar; o teste dos limites. A visita monta a mesma peça
   (entra em `PECAS` de `scripts/visita-mesmas-pecas.test.mjs`). DESIGN.md: seção "Canvas na parede".
   Impeccable: `craft-floor.md` antes de editar; detector.
3. **Criar e abrir.** "Novo canvas aqui" no menu do nada e da pasta (3.1); a rota `/anotacoes/canvas/:id` com o
   `app-free-board` (tirar de `free-boards-page.ts` a parte que abre o quadro, sem copiar); o topo com o nome e
   Detalhes; o editor em modo canvas (3.3); o menu do card (3.4). Teste de que na visita o canvas abre como no
   dono (como `ui/visit-study.spec.ts`).
4. **Compartilhar e nuvem.** Migração `api/migrations/0028_quadros_nota.sql` (`quadros.nota_id`, índice);
   `boardAccess` em `api/src/routes/boards.ts` passa a aceitar o papel vindo de `nota_membros` (e do grupo da
   nota) quando `nota_id` aponta para uma nota compartilhada; o envio do dono manda `Quadro-Nota` (como o
   `Quadro-Grupo`); compartilhar a anotação do canvas pelo Quem vê dá acesso ao quadro, e parar de compartilhar
   tira. Quem recebe vê o canvas em Compartilhadas e abre o quadro do dono (o `SharedBoardInfo` com o papel). Dois
   editando ao mesmo tempo: a junção peça a peça que já existe; a anotação junta pelo `mergeNote`. Testes da API
   (com `API_CODIGOS: '*'`) e do site. Deploy da API com a migração.
5. **A conversão e o fim da aba.** O reconciliador converte os quadros sem anotação (ids `cv-` + quadro; título
   = nome, grupo, data = `em`, público, `createdAt` = `em`, cor cinza); os quadros que o dono já tinha
   compartilhado com pessoas (`quadro_membros`) viram a anotação compartilhada com as mesmas pessoas e papéis.
   Sai a aba (`ui/area-bar.ts`, specs dela), `pages/free-boards-page.*`, `ui/free-board/board-card.ts`, a fileira
   "Quadro livre" da visita; os endereços antigos redirecionam. API e MCP: `criar_quadro` passa a criar o canvas
   (o pedido aplicado pelo site, `core/api-requests-boards.ts`), `ver_quadros`/`ler_quadro` continuam, o guia do
   MCP fala "canvas". Novidades contando a mudança para quem usava a aba.
6. **Fechamento.** Crítica do Impeccable (pontuação, em `.impeccable/critique/`), **/code-review high** das cinco
   rodadas e os consertos; DESIGN.md e a memória atualizados.

## 6. Compartilhado: o que não pode quebrar

- **Uma regra de acesso só:** quem vê/edita a anotação do canvas vê/edita o quadro. Nunca dar ao quadro um
  "Compartilhar" próprio de novo (o do topo do quadro, `ui/board-share.ts`, passa a abrir o Quem vê da anotação).
- **Duas pessoas no mesmo canvas:** cada mexida sobe só o quadro (4s depois da última), com a `rev`; 409 junta em
  três vias (`free-board-merge`) e manda de novo. Nada disso muda. O nome mudando nos dois lados: vale a junção da
  anotação; o elo leva o resultado ao quadro.
- **Quem só lê** (leitor) abre o canvas sem o Editar (como hoje o quadro de outra pessoa).
- **Parar de compartilhar / sair da anotação:** o canvas some do mural de quem saiu, e o quadro deixa de ser
  servido para ele (teste na API).
- **Apagar um canvas compartilhado:** só o dono apaga para todos (a regra da anotação); os outros "Saem".
- **Grupo compartilhado:** o canvas do grupo vai com o grupo (já é assim com o quadro); a anotação mora no
  documento do grupo. Testar criar um canvas num grupo compartilhado e o outro membro ver e abrir.
- **Público:** a anotação pública aparece na visita (vem do mural publicado); o quadro público vem de
  `/v1/murais/:codigo/quadros` (já existe). O espelho do `publico` é do elo (4.2).

## 7. Riscos e conferências

- O campo novo apagado por um site velho (4.1): é o maior risco; rodada 1.
- Conversão dupla em dois aparelhos: resolvida pelo id derivado; testar dois `CanvasLink` convertendo o mesmo quadro.
- Quadro sem anotação ou anotação sem quadro depois de uma falha no meio: o reconciliador conserta nos dois sentidos.
- A miniatura de um quadro grande na parede: `board-sketch` já corta em 400 peças e 300 setas; conferir com o
  quadro de 2.000 peças do laboratório (`/laboratorio/quadro-livre?quadro=grande`) que a parede não engasga.
- Teto de quadros por conta (`FB_MAX_BOARDS = 200`): o "Novo canvas aqui" avisa quando passar (o mesmo aviso de hoje).
- A Lista e a Visão geral foram pensadas para cartolina: o teste das setas do teclado precisa incluir canvas.
- Testes instáveis conhecidos: ver a memória (trava da sincronização, janela coberta, ordem da suíte).

## 8. Decisões tomadas sem perguntar (pode mudar qualquer uma)

- **D1.** O nome na tela é **Canvas** (a palavra do dono); "quadro" só por dentro do código e na API antiga.
- **D2.** Sem tags, data ou contagem no card; tudo no nome acessível (o dono achou poluído).
- **D3.** A cor (stock) do canvas não aparece no card; fica guardada (cinza) para os filtros.
- **D4.** Clicar abre o canvas (não a leitura). Os detalhes ficam em "Detalhes" (topo e menu).
- **D5.** Canvas novo nasce sem formulário, direto no Editar, com o nome selecionado; vazio e sem nome some ao sair.
- **D6.** Calendário, widget Nota, Comparar e perfil ficam sem canvas na primeira versão.
- **D7.** O elo mora no id (`cv-` + quadro) para todo canvas, não só no campo `canvas` (4.1): protege dos sites
  sem a trava.
- **D8.** O widget Nota com um canvas colado (pelo id ou pelo título) mostra o papel rasgado da ficha que não
  existe; os seletores (`CardPicker`) nem oferecem o canvas.

## 9. Andamento

- [x] Exemplos e escolha (25/nov): três rodadas no laboratório; escolhida a versão "pendurado no prego" (`f`),
  refinada (o barbante atrás da orelha e da moldura, sem os olhais, o nome com reticências).
- [x] Rodada 1: os dados e o elo (25/nov, BUILD 1049): `Review.canvas` e `isCanvas` (o campo sai do id,
  D7), a trava do site velho (`core/newer-build.ts`), `core/canvas-link.ts` (criar, renomear, apagar com
  Desfazer, duplicar, o reconciliador), o quadro do canvas fica no apagar do grupo, os filtros (Kanban pelo
  `notesById`, Flashcards, `CardPicker`, widget Nota, Calendário) e a busca pelo texto do quadro
  (`canvasSearchText`, `WallState.canvasText`; a visita ainda não busca no quadro: rodada 2 ou 3).
- [x] Rodada 2: o card na parede (25/nov, BUILD 1050): `ui/canvas-card.ts` (o desenho), montado pela própria
  `ReviewCard` no modo canvas (e não um segundo componente no pool: assim o clique, o marcar, o teclado, os
  botões de hover, o véu de entrada e a visita vêm da ficha de sempre; os pedaços que ficam na moldura viram
  `ng-template`s projetados nela). As quatro vistas; na Visão geral a altura é a das outras fichas (98px): o
  16:10 do plano dava 134px e passava da regra 2.5. O quadro vem da vista (`WallState.canvasBoard`): o seu
  pelo `FreeBoardStore`, o da visita pelos quadros públicos (`VisitBoards`, trazidos quando há canvas no
  mural). DESIGN.md "Canvas na parede". Sem Novidades: ainda não há como criar um canvas (rodada 3).
- [x] Rodada 3: criar e abrir (25/nov, BUILD 1051): "Novo canvas aqui" / "Novo canvas" no menu do nada e no da
  pasta (`WallBoard.createCanvas`, a página cria pelo `CanvasLink`), a rota `/anotacoes/canvas/:id`
  (`pages/canvas-page.ts`) sobre a tela cheia que saiu de `free-boards-page.ts` para `pages/board-screen.ts` (a
  aba velha a usa até a rodada 5, e não lista mais os quadros dos canvas). Todo "abrir anotação" (o `openReview`
  da mesa) leva o canvas para a rota dele. O topo escreve o nome (`FreeBoardTop.renamable`) e tem os Detalhes; no
  celular, as etiquetas do topo ficam só com o desenho. O editor em modo canvas (só a aba Canvas: sem texto,
  cartolina, Kanban e Flashcard), que agora leva o campo `canvas` ao salvar (a anotação é salva a partir da
  prévia: sem isso, virava cartolina até recarregar). O menu do card: Detalhes, Copiar (o texto do quadro,
  `canvasAsText`), Duplicar; sem Kanban, Flashcards, link e Compartilhar (este volta na rodada 4). Apagar pelo
  caminho de sempre (o elo leva o quadro e o traz de volta no Desfazer). Na visita, o canvas abre o quadro público
  pela tela de quadros dela (`visitBoardPath`); a rota própria da visita fica para a rodada 5, quando a fileira
  "Quadro livre" sai. Os endereços antigos do Quadro livre também ficam para a rodada 5. Novidades 1.55.0.
- [ ] Rodada 4: compartilhar e nuvem
- [ ] Rodada 5: a conversão e o fim da aba
- [ ] Rodada 6: fechamento
