# Plano: a Wishlist repensada

Pedido do usuário (13/nov/2026): "Atualmente há apenas 1 visualização na tela de wishlists e é bonita, mas muito
grande. Também faltam features para filtrar melhor, categorizar melhor [...] O botão de hover para selecionar o
'MUST WATCH' também não segue o padrão [...] Quero que seja possível editar uma wishlist (sem criar uma review).
Quero que seja possível criar tags, filtrar, ordenar. Coloque também a feature de pastas que tem nas anotações
[...] A atual (bonita, fácil de ver capas) e uma menor, menos estilizada, feita para caber muitas mais capas por
vez, em um grid mais simples." E: padronizado com o que já existe, sem reinventar a roda; Impeccable no começo e
no fim; cada feature com `/code-review mid` antes da próxima; `/code-review high` no fim.

Antes do plano, seis exemplos de mentira no laboratório (`/laboratorio/wishlist`, `pages/wishlist-lab-page.*`,
escondido, sem gravar nada). O usuário escolheu a **Mistura** (jeito 6), com as tags do jeito **B, Legenda com
cor**:

- do jeito 1 (Pastas na parede): as pastas manilha das Anotações, **com arrastar**, e a ordem;
- a grade pequena do jeito 1, **mas menos formal**: "alguns poucos rasgos, texturas e etc, mas com o tamanho
  padronizado";
- do jeito 2 (Seções da vontade): as tags discretas, como legenda impressa;
- tocar no recorte **começa a resenha**; o editar vai num botão, com um desenho de editar (não o lápis);
- a vontade num botão só, que abre um menu (como o do botão direito); nada de fogo e lua;
- o lembrete **nunca** aparece na parede: com o mouse em cima, ao lado, numa folha arrancada do caderno.

Só o plano: nada foi implementado além do laboratório, e o site de verdade não muda.

---

## 0. Resumo

- **Pastas por mural**, as mesmas das Anotações (a mesma peça, o mesmo modelo de dados): pasta manilha no
  começo da parede, o caminho na pasta da barra, pastas dentro de pastas, arrastar para guardar e recorte sobre
  recorte para criar. A pasta é um id e mora nas configurações da Wishlist; o desejo guarda só o id.
- **Tags** (texto livre, como nas anotações, com cor opcional) e **lembrete** (um texto curto) em cada desejo.
- **A barra é a pasta do mural:** busca, Filtrar (a folha de sempre, com Vontade e Tags), Ordenar (quando
  entrou, nome, lançamento; inverter; MUST PLAY na frente), a vista (Recortes ou Grade) e Sortear.
- **Duas vistas:** Recortes (a colagem de hoje, intocada) e Grade (todas do mesmo tamanho, com papel de
  revista, retícula e uns poucos rasgos sorteados pelo id).
- **O recorte segue o padrão do site:** tocar começa a resenha; com o mouse, a etiqueta de tinta com Editar e
  Vontade (`ui/_etiqueta-acoes.scss`); o botão direito com tudo; o adesivo da quina deixa de ser botão.
- **Editar sem resenhar:** a folha do "Pôr na wishlist" em modo editar, com tags, pasta e lembrete.
- **Sincroniza, faz backup e aparece na API**, só acrescentando campos (SYNC_SCHEMA 56).

---

## 1. Como é hoje

- `Wish` (`core/review.ts`): `id`, `kind`, `game`, `relevance?` (`must`/`later`; sem o campo, Comum),
  `createdAt`, `updatedAt`. Guardado por `ReviewStore` (`wishes`, chave `mural-de-jogos:desejos:v1`, a mesma
  do backup e da nuvem), com lápide em `deleted.wishes`. `Mural.wishes` filtra pelo mural aberto.
- A página (`pages/wishlist-page.ts`): a pasta solta com a busca, um `<select>` de ordem (Mais novos, Mais
  antigos, A–Z) e Sortear; a colagem em colunas (`collage`, `ui/wish-clip.ts`); o adesivo da quina é um botão
  que abre um menu próprio de três adesivos; tocar no recorte começa a resenha; o botão direito tem Começar,
  as vontades e Tirar da wishlist. A vontade ordena sempre primeiro.
- O "Pôr na wishlist" (`ui/wish-adder.*`): a página de catálogo com o recorte ao vivo, "Outro recorte" (troca o
  id), a vontade e a capa. Não há como editar um desejo: só tirar e pôr de novo.
- A API mostra o desejo como `DesejoV1` (`contrato/api-v1/murais.ts`): nome, ano, por, capa, relevância.
- A Wishlist **não** vai para o mural público nem para a visita (é privada): a regra da visita do CLAUDE.md não
  se aplica, e isto não muda.
- O desenho de cada recorte é congelado (`core/frozen-looks.ts`): nada aqui pode mudar o sorteio de
  `tearFor`, `stripFor`, `titleFor`, `stickerFor` ou `placeFor`.

---

## 2. As decisões

Decididas pelo usuário no laboratório (D1–D6) e por mim (P1–P16, para ele aprovar ou trocar):

| # | Decisão |
|---|---|
| D1 | A Mistura: pastas do jeito 1 com arrastar, a ordem do jeito 1, a grade do jeito 1 com textura, tags do jeito 2. |
| D2 | Tags como **legenda com cor**: caixa alta miúda na tinta da parede, cada uma com o quadradinho na cor dela. |
| D3 | Tocar no recorte começa a resenha. |
| D4 | Na etiqueta de hover, dois botões: **Editar** (o desenho dos ajustes, `SlidersHorizontal`, amarelo na mão) e **Vontade** (o adesivo, `Sticker`, vermelho na mão), que abre o menu do site com MUST PLAY, Comum e LATER, o tique na de agora. |
| D5 | O lembrete nunca aparece na parede; com o mouse em cima (ou o foco no recorte), uma folha arrancada do caderno ao lado, do lado que tem espaço. |
| D6 | A grade: o mesmo tamanho para todas, com papel de revista e retícula, e alguns poucos rasgos. |
| P1 | **Pastas por mural** (Jogos tem as suas, Livros as suas), com o modelo das Anotações: `NoteFolder` com `group = 'desejos:<mural>'`, nas mesmas configurações das pastas das notas (`NotesConfig.folders`, que já sincronizam, vão no backup e têm a lápide); o desejo guarda `folder` (o id). Renomear, mover e desfazer não regravam nenhum desejo; pasta desfeita vira lápide e os desejos sobem pela regra da leitura (`withLiveFolder`). |
| P2 | **Tags por mural**, com as mesmas regras de nome das anotações (`cleanLabel`, até 32 letras, juntadas sem caixa e sem acento), até 12 por desejo. A cor é opcional, da paleta das categorias, guardada por mural em `NotesConfig.wishTagColors`; sem cor, o quadradinho é kraft. |
| P3 | **Lembrete** até 280 letras, texto puro (sem marcas), na letra de caneta. A busca procura nele também. |
| P4 | **No toque** (sem mouse), o lembrete aparece no alto do menu do dedo segurado, logo abaixo do nome, em letra de caneta (o `ContextMenu` ganha uma linha de nota). Sem marca no recorte (regra "sem marca de estado raro"). |
| P5 | **Vista e ordem por aparelho** (como a vista do mural), em `meu-mural:wishlist:v1` (`writeJson`, sai na limpeza do logout). MUST PLAY na frente começa ligado (é como é hoje). |
| P6 | **Ordenar:** Quando entrou (padrão), Nome, Lançamento (o ano do catálogo; sem ano vai para o fim), com o inverter e o MUST PLAY na frente, como as fixadas no topo das Anotações. |
| P7 | **Filtrar** é a folha das Anotações (`ui/filter-card`): a fileira de um-por-vez vira **Vontade** (Todos, MUST PLAY, Comum, LATER, com quantos) e as **Tags** (um toque mostra só as com ela; o botão direito esconde). Os ligados viram os adesivos com X embaixo do picote, com "Mostrando X de Y". Dentro de uma pasta, a busca e os filtros pegam ela e as de dentro (como nas Anotações). |
| P8 | **A grade** é uma peça nova (`ui/wish-cover.ts`): célula de 112px no mínimo (92px no celular), a capa 2:3 numa margem de 4px de papel de revista com retícula; um terço delas com um acidente (beirada rasgada, quina arrancada, picote, quina dobrada), papel velho em um quinto e a inclinação de ±0,8°, tudo sorteado pelo id e congelado em `frozen-looks`. O adesivo da vontade em mini na quina, o nome em duas linhas, as tags embaixo. |
| P9 | **Arrastar** (só no seu mural, com mouse ou dedo segurado): recorte sobre pasta ou sobre um pedaço do caminho guarda ali; recorte sobre recorte cria uma pasta com os dois, já com o nome para escrever; pasta sobre pasta põe uma dentro da outra; parar sobre uma pasta um instante abre ela. O gesto é `DragHold`; o fantasma, a etiqueta amarela e o tracejado saem de `pages/wall-board.scss` para uma peça só (`ui/_arrasto.scss`), usada pelas Anotações e pela Wishlist. |
| P10 | **Menus:** o botão direito do recorte tem Começar a resenha, Editar, as três vontades, Mover para pasta… e Tirar da wishlist; o da pasta é o das Anotações (Abrir, Renomear, Mover para…, Desfazer a pasta). Nada de menu próprio. |
| P11 | **Editar recorte** é a folha do "Pôr na wishlist" (`ui/wish-adder`) aberta com um desejo: Trocar o item, Quanta vontade, Tags (`ui/tag-picker`), Pasta (`ui/folder-picker`), Lembrete e Qual capa; no pé, Tirar da wishlist, Começar a resenha e Salvar. Sem "Outro recorte" no editar (trocar o id faria o desejo sumir e voltar na sincronização). O "Pôr na wishlist" ganha os mesmos campos, com a pasta aberta já escolhida. |
| P12 | **O adesivo da quina deixa de ser botão:** fica só o desenho. O menu próprio de três adesivos e o lugar vazio tracejado do Comum saem (a exceção de `scripts/etiqueta-acoes.test.mjs` sai junto). |
| P13 | **Sincronização:** SYNC_SCHEMA 56 (os campos novos do desejo e `wishTagColors`; as pastas já viajam com `notesConfig`). O backup leva tudo. Sem nada novo no D1. |
| P14 | **API v1, só acrescentando:** `DesejoV1` ganha `tags`, `pasta` (`{ id, caminho }` ou null, como a nota) e `lembrete`; o contexto lista as pastas e as tags da Wishlist de cada mural; criar e mudar desejo aceitam os três. O MCP repassa sem mudar. |
| P15 | **Fica de fora, de propósito:** o Pra depois (não ganha pastas nem tags agora), marcar vários de uma vez, as tags passarem para a resenha, e a Wishlist no mural público. |
| P16 | O laboratório sai no fim (rota e arquivos); ficam as entradas novas de `FolderCard` (`units`) e `FilterCard` (`subjectTitle`, `subjectHint`, `units`), que a Wishlist usa. |

---

## 3. Os dados

### 3.1 O desejo

```ts
interface Wish {
  id: string; kind: Kind; game: PickedGame;
  relevance?: Relevance;
  /** As tags, já limpas e sem repetir (sem o campo: nenhuma). */
  tags?: string[];
  /** A pasta (o id), ou sem o campo: a raiz da Wishlist do mural. */
  folder?: string;
  /** O lembrete: até 280 letras, texto puro. */
  note?: string;
  createdAt: string; updatedAt: string;
}
```

- `sanitizeWish` aceita os três (só quando têm valor: os desejos de antes ficam iguais, sem chave vazia), com as
  regras das anotações (`cleanLabel`, `isFolderId`) e o corte do lembrete.
- `ReviewStore` ganha `updateWish(id, patch)` (carimba `updatedAt`), `moveWishes(ids, folder)` e
  `setWishTags`; `setRelevance` continua. Uma mudança, uma gravação.
- Quando o desejo vira resenha ou pendente, ele sai da Wishlist como hoje (as tags e o lembrete não passam).

### 3.2 As pastas e as cores das tags (nas configurações que já existem)

- As pastas da Wishlist moram em `NotesConfig.folders`, ao lado das das notas, com o grupo `desejos:<mural>`
  (nenhuma categoria das notas tem esse nome). Assim sincronizam, vão no backup e ganham a lápide sem nenhum
  caminho novo. As telas das Anotações só leem os grupos delas, então não veem as da Wishlist.
- `NotesConfig.wishTagColors: Record<string, CategoryColorId>`, a chave `'<mural>|<tag sem caixa e sem acento>'`.
- As funções de `core/folders.ts` servem como estão. Um serviço pequeno, `core/wish-folders.ts`
  (`WishFolders`), faz para a Wishlist o que `NoteFolders` faz para as notas, por cima das mesmas funções.

### 3.3 A vista (por aparelho)

`meu-mural:wishlist:v1`: `{ vista: 'recortes' | 'grade', ordem: 'recentes' | 'nome' | 'ano', direcao: 'desc' |
'asc', vontadePrimeiro: boolean }`, por `writeJson`, lido no construtor (nunca no módulo), e o teste em
`core/browser-reset.spec.ts` mostra que sai na limpeza.

### 3.4 Sincronização, backup e regra do logout

- SYNC_SCHEMA 56: um site da 55 jogaria fora as tags, a pasta e o lembrete ao enviar a Wishlist, e eles sumiriam
  em todo aparelho. A junção dos desejos continua por id (o mais novo vale).
- `localHasContent` já conta os desejos; nada novo.
- Nada novo no IndexedDB nem em outro armazenamento; a chave nova começa com `meu-mural:`.

---

## 4. As telas

Tudo pelo Impeccable (contexto e `craft-floor.md` antes de cada edição de tela, a crítica no fim de cada rodada
com tela). O desenho de cada peça é o do laboratório, com os achados da crítica (seção 7).

### 4.1 A barra

A pasta solta de hoje, com os grupos separados pelo picote, como a do mural:
`[busca] | Filtrar | Ordenar ▾ ⇅ ★ | ✂ ▦ | Sortear`. Dentro de uma pasta, o caminho (`ui/folder-path`) na
primeira linha. Embaixo do picote, os adesivos dos filtros ligados com X e "Mostrando X de Y · Limpar"
(com "em <pasta> e nas pastas de dentro").

### 4.2 Recortes

A colagem de hoje, sem mudar um ponto do recorte (`ui/wish-clip.ts` só perde o botão do adesivo). Embaixo do
recorte, as tags (D2). As pastas manilha antes da colagem (`ui/folder-card.ts`, `units: recortes`), oito por
fileira, como nas Anotações.

### 4.3 Grade

A peça nova `ui/wish-cover.ts` (P8), numa grade simples (`auto-fill`, 112px), as pastas por cima como nos
Recortes. O mesmo toque, a mesma etiqueta, o mesmo lembrete, o mesmo arrastar.

### 4.4 O recorte e a capa da grade

- `.hit` em cima de tudo: tocar começa a resenha (D3), com o lembrete no `aria-describedby`.
- A etiqueta (`et.grupo`, `et.botao`, `et.mostra`, `et.cor-na-mao`): Editar e Vontade (D4), com
  `expectEtiquetaPadrao` num teste.
- O lembrete (D5): a folha do caderno de espiral (o papel do Pra depois, `ui/draft-card`, vira um mixin
  `ui/_caderno.scss` para as duas não terem o desenho duas vezes), `aria-hidden` porque o leitor de tela já o
  ouve pelo `aria-describedby`.
- As tags (D2): uma peça pequena, `ui/wish-tags.ts`, usada pelo recorte e pela capa.

### 4.5 Editar recorte (P11)

`WishAdder.open({ edit: wish })`. A mesa da esquerda mostra o recorte de verdade (sem "Outro recorte"); os
campos na ordem: o item, Quanta vontade, Tags, Pasta, Lembrete, Qual capa. Salvar grava uma vez
(`updateWish`). Começar a resenha salva antes e abre o editor da resenha como o toque.

### 4.6 Pastas e arrastar (P1, P9, P10)

Como nas Anotações (PLANO-PASTAS.md, 4.2–4.7): entrar pela pasta (o endereço guarda `?pasta=`), voltar pelo
caminho, criar pelo "Nova pasta" do menu do vão e soltando um recorte sobre outro, o nome escrito na própria
pasta, Renomear, Mover para… (`ui/folder-move-sheet`), Desfazer a pasta com Desfazer (`ui/folder-asking`).

### 4.7 Celular

Duas colunas nos Recortes (como hoje) e a grade de 92px; a etiqueta à vista sem o mouse, um pouco maior (o
padrão); o dedo segurado abre o menu (com o lembrete no alto, P4); o arrastar pelo dedo segurado e movido,
como no Kanban.

### 4.8 Acessibilidade

O toque e a etiqueta pelo teclado (Tab), Shift+F10 abre o menu, o Vontade anuncia a de agora
("Quanta vontade de Hades: MUST PLAY. Mudar"), o arrastar tem o caminho pelo menu (Mover para pasta…), as tags
lidas como "Tags: co-op, curto", o foco segue o recorte que mudou de lugar.

---

## 5. A API, o espelho e o MCP

- `DesejoV1` ganha `tags: string[]`, `pasta: { id: string; caminho: string } | null` e `lembrete: string | null`
  (v1 só acrescenta; os clientes de antes ignoram).
- O espelho guarda o id da pasta (como as notas, `pasta_id`) e a API monta o caminho pelo contexto.
- O contexto (`ver_contexto`) passa a dizer as pastas e as tags da Wishlist de cada mural.
- Criar e mudar desejo aceitam `tags`, `pasta` (id ou caminho, criado se não existe, como nas notas) e
  `lembrete`. `?pasta=` e `?tag=` na lista de desejos.

---

## 6. Rodadas (uma de cada vez, cada uma com testes, `npx ng build`, `/code-review mid`, commit e push)

1. **Os dados:** os campos do desejo, `WishlistConfig`, `WishFolders`, a sincronização (56), o backup, a vista
   por aparelho (com o teste da limpeza). O site não muda de cara.
2. **A barra e as duas vistas:** Filtrar (Vontade e Tags), Ordenar, a vista, a Grade (`ui/wish-cover`, congelada),
   as tags no recorte e na capa.
3. **O recorte no padrão:** tocar começa a resenha, a etiqueta Editar e Vontade, o menu da vontade, o botão
   direito, o lembrete no caderno (e no menu do toque), o adesivo deixa de ser botão.
4. **Editar recorte:** o modo editar da folha, com tags, pasta e lembrete (e os mesmos campos no adicionar).
5. **As pastas:** na parede, o caminho, o endereço, o arrastar (com o `_arrasto.scss` comum), criar, renomear,
   mover, desfazer, Mover para pasta…
6. **A API e o MCP.**
7. **O fim:** o laboratório sai, DESIGN.md, Novidades, a crítica final do Impeccable e o `/code-review high`,
   com a rodada de correções.

---

## 7. A crítica do Impeccable no laboratório

Rodada em 13/nov sobre a Mistura com a Legenda com cor, em duas avaliações isoladas (a revisão de design e o
detector), arquivada em `.impeccable/critique/`. **23/40.** O que funciona: o arrastar (o alvo tracejado, a
origem apagada, a etiqueta em palavras), as tags B (quietas, sem competir com o recorte) e as peças do site
reaproveitadas certo. O detector achou pouco de verdade: as imagens "quebradas" são o `[src]` do Angular, os
recortes orgânicos são de propósito, e o adesivo MUST é o aprovado (congelado); o real é o cinza da parede em
letra miúda (3,5:1).

Os achados e o que o plano faz com cada um (entram nas rodadas da seção 6):

| Achado | Como entra |
|---|---|
| **P1.** Mover, tirar, mudar a vontade e criar pasta acabam num aviso no alto da página, sem Desfazer, e o recorte pula de lugar sem rastro. | Todo gesto ganha o aviso do site (`Toasts`, fixo embaixo) **com Desfazer** (criar pasta desfaz a pasta). A colagem muda com a transição de vista (`ViewTransitions`, como hoje na vontade) e o foco vai junto para o recorte; se ele saiu da tela, a tela vai até ele. Com MUST PLAY na frente, o recorte só muda de lugar quando o menu fecha. |
| **P1.** No celular a etiqueta fica sempre à vista (é o padrão sem mouse) e cobriria o título de cada capa; o lembrete não tem como ser lido. | Sem mouse, a etiqueta desce para a linha de baixo (na grade, ao lado do nome; no recorte, embaixo dele, com as tags), o lugar que o padrão deixa cada card escolher. O lembrete vai no alto do menu do dedo segurado (P4). As fotos do celular passam a ser tiradas com `hover: none` e `pointer: coarse` emulados. |
| **P2.** O mesmo desenho (o adesivo) para o botão Vontade, as duas vontades do menu e o "MUST PLAY na frente". | O menu mostra os adesivos de verdade em mini (o `ContextMenu` ganha o item com o adesivo da vontade, ao lado do de amostra de cor), o botão Vontade fica na cor da vontade de agora (vermelho no MUST, azul no LATER) e o "na frente" da barra vira a palavra "MUST 1º". |
| **P2.** Pasta só se cria arrastando, e qualquer ponto de outro recorte arma o "criar pasta". | O "criar" só arma no miolo do recorte alvo e depois de um instante parado, como nas Anotações (`WallDrag`); "Mover para pasta…" no menu e "Nova pasta" no escolher da pasta (P10, P11). |
| **P2.** A etiqueta cobre a manchete do recorte; o lembrete pisca a cada passada do mouse. | A etiqueta fica inteira acima do papel (o recorte já vem para a frente com a mão); o lembrete espera um instante de mão parada (≈300 ms) e aparece na hora com o foco do teclado. |
| A busca acha pelo lembrete, mas não mostra por quê. | Com a busca achando só no lembrete, a folha do caderno fica aberta naquele recorte, com o trecho realçado (`appRealceBusca`). |
| "Nenhum recorte aqui com esses filtros" também numa pasta vazia. | Pasta vazia tem o aviso dela ("Pasta vazia: arraste um recorte até aqui"); o dos filtros só com filtro. |
| A tag sem cor ganha o quadradinho kraft, que parece uma cor. | Sem cor, o quadradinho é só o contorno. |
| A legenda das tags no cinza da parede fica em 3,5:1. | A legenda passa a 4,5:1 (a tinta da parede um pouco mais clara). |
| O fantasma do arrastar leva as tags; a pasta espia os três primeiros de qualquer jeito. | O fantasma leva só o recorte; a pasta espia na ordem da parede (MUST PLAY primeiro). |
| Arquivar dez recortes são dez arrastos; sem marcar vários. | Fica de fora desta vez (P15), de propósito; "Mover para pasta…" alivia. |

---

## 8. A conferir (riscos)

- O congelamento: a grade usa um sorteio novo (funções novas, ids de filtro novos); nada do recorte muda.
- O arrastar não pode roubar o toque que começa a resenha (o `DragHold` engole só o clique depois de arrastar).
- O lembrete à direita na última coluna e o menu perto da beirada (o lado com espaço).
- O orçamento de estilo por componente (24 kB): a grade e o lembrete em arquivos próprios.
- Os testes da ordem da suíte (memória dos testes instáveis): estado de pasta e de vista limpo entre os testes.

---

## 9. Andamento

- 13/nov: laboratório com os seis jeitos, a escolha (Mistura + Legenda com cor) e este plano.
