# Plano: baralhos de estudo públicos e "Copiar baralho"

Pedido do dono (05/nov/2026), num cartão do Dev Murall: "Quero que seja possível deixar baralhos de estudos
PÚBLICOS ou PRIVADOS. Se um GRUPO meu não tiver nenhum baralho público, ele não deverá aparecer para os
visitantes. A ideia é permitir que visitantes entrem no meu mural de estudos pelo meu perfil/anotações e
vejam meus cards de estudos dentro de baralhos públicos. Ao tornar um baralho público um aviso deverá
aparecer 'Gostaria de tornar todas as cartas deste baralho públicas? 24% das cartas desse baralho são
públicas atualmente' (troque o 24% pela porcentagem real). Ao visitar um baralho de um amigo, deverá ter uma
opção 'Copiar baralho'. Ao clicar nessa opção, um modal perguntando qual será o nome do baralho
(auto-preenchido com o nome do baralho do dono) e qual será o grupo do baralho (vazio por padrão)."

O Impeccable planeja (shape, no começo) e critica (no fim); `/code-review high` roda no fim, e o que ele
achar é corrigido. Este plano muda uma linha do PLANO-ESTUDOS.md: "Os Estudos nunca vão no mural público"
deixa de valer para os baralhos que o dono torna públicos.

---

## 0. Resumo

- **Todo baralho é Privado ou Público** (`Deck.public`). Nasce Privado. A escolha mora na folha do baralho
  (o lápis), com o mesmo "Público · Privado" do editor da anotação.
- **Uma carta é pública quando a anotação dela é pública.** O baralho público mostra a quem visita só as
  cartas de anotações públicas; as privadas ficam com o dono. Daí a pergunta da porcentagem.
- **Tornar público pergunta** (só quando há carta privada): "Gostaria de tornar todas as cartas deste
  baralho públicas? 24% das cartas desse baralho são públicas atualmente." Respostas: **Tornar todas
  públicas** (as anotações viram públicas sem ir ao Feed) · **Só o baralho** · Cancelar.
- **Quem visita entra pelas Anotações**: no mural de alguém (vindo do perfil, de Amigos ou do link), com as
  Anotações abertas, aparece **Mural · Estudos** logo abaixo da ficha da dona, só se ela tiver algum baralho
  público. Os Estudos dela mostram só os grupos com baralho público, as pilhas e as cartas; tocar numa
  carta abre a anotação (o verso), como no mural.
- **O progresso aparece** (nível, volta, acertos, como o dono vê), a não ser que o dono ligue
  **Ajustes › Amigos › "Esconder o progresso nos Estudos"**.
- **Copiar baralho**: no baralho de outra pessoa, um botão abre uma folha com o **nome** (vem o do dono) e o
  **grupo** (vazio; escolher um dos seus ou escrever um novo). Copiar cria um baralho seu, com uma anotação
  sua (privada) para cada carta pública, a frente igual e o progresso do zero.

---

## 1. Como é hoje (o que pesa)

- `core/study.ts`: `Deck` (nome, ícone, cor, novas/dia, `wall`, `look`, `group`, `order`, `at`) e
  `StudyCard` (`note`, `decks`, `front`, `wall`, `srs`, `stats`, `added`, `at`); `StudyConfig` (retenção,
  revisões/dia, ordem das novas). Tudo guardado em `meu-mural:estudos:v1` e na parte `estudos` do mural
  **privado** da nuvem (junção baralho a baralho e carta a carta, a mudança mais nova vence).
- `core/cloud-sync.ts` (`pushNow`): o mural **público** é montado a cada envio, do zero: `reviews`, `notas`
  (as públicas que estão no mural), `soKanban` (as públicas que estão **fora** do mural, só no Kanban ou só
  nos Estudos: `KanbanStore.boardOnly`), `musicas`, `categorias`, `perfil`. As imagens coladas que aparecem
  no texto do público viram públicas na nuvem (`localImageIds(publicText)`). Os Estudos não vão.
- `core/cloud-murals.ts` + `core/backup-file.ts` (`parseBackupSnapshot`): quem visita lê `reviews`, `notas`
  e `musicas`; `soKanban` só é lido pelo link da ficha (`core/ficha-link.ts`). `MURAL_READER = 8`: subir faz
  o mural guardado de cada colega ser baixado de novo.
- A visita: `pages/colleague-wall-page` em `/comparar/mural`, com a ficha da dona (orelhas por mural) e a
  régua e a parede (`VisitView`). A leitura (`ui/review-reader`) abre uma ficha da pessoa.
- `ui/study-deck-sheet.ts`: Nome, Cor, Estilo das cartas, Lugar na fileira, Ícone, Apagar.
- `ui/confirm.ts`: `Confirm.choose` já faz a pergunta de duas respostas + Cancelar (ficha azul, neutra).
- `core/review.ts`: `audienceFields('visivel', …)` = pública fora do Feed (`quiet`), o mesmo da setinha
  "Pregar sem publicar no Feed".
- `core/image-store.ts` (`adopt`, `add`) e `core/image-sync.ts` (`publicUrl`, `fetch`): a imagem de outra
  pessoa vira sua com um id novo.

---

## 2. As decisões

Tomadas pelo dono em 05/nov (perguntas antes do plano):

- **D1. Tornar todas públicas não vai ao Feed.** As anotações viram públicas como "Pregar sem publicar no
  Feed" (`quiet`): um baralho de 92 cartas não enche o Feed de quem segue.
- **D2. Quem visita vê o progresso**, como o dono vê, com uma opção em Ajustes, "Esconder o progresso nos
  Estudos". Ligada, as cartas aparecem como nunca estudadas e o progresso nem vai para a nuvem pública.
- **D3. A entrada é pela visita, nas Anotações.** Sem pasta nova no perfil: o perfil já leva às Anotações
  da pessoa, e de lá o "Estudos".

Decididas por mim (o dono pode mudar qualquer uma):

- **D4. Carta pública = anotação pública.** Não há um "público" por carta: a carta é a anotação, e a
  anotação já é Pública ou Privada. Dois interruptores para a mesma coisa confundiriam.
- **D5. Só o baralho decide se aparece.** O baralho público sem nenhuma carta pública aparece (o dono o fez
  público), com a carta de giz "Nenhuma carta pública neste baralho". O grupo aparece se tiver um baralho
  público (o pedido).
- **D6. Nada de Estudar para quem visita.** Ver as cartas e virar (abrir a anotação) sim; o estudo com
  progresso é o do baralho copiado. Também sem os montes "para hoje" (são os do dono, não dizem nada a quem
  visita): o elástico fica, sem o papelzinho.
- **D7. A anotação copiada** leva o título, o texto, a cartolina (cor, papel, estampa) e a frente da carta;
  vai para o grupo escolhido, **privada**, só nos Estudos (como a "Nova carta"). Não leva as tags, o
  assunto, as reações, os comentários nem de quem era. As imagens viram suas (id novo, como colar a imagem
  de uma compartilhada).
- **D8. Copiar mostra o resultado.** Depois de copiar, o site abre o baralho novo (já é seu), com o toast
  "Baralho copiado: 24 cartas" e Desfazer (tira o baralho e as anotações criadas).
- **D9. A pergunta só aparece quando há o que perguntar.** Com todas as cartas já públicas (ou nenhuma
  carta), o baralho vira público direto. A compartilhada de outra pessoa em que você não pode mudar quem vê
  (só o dono e os gestores mudam) não muda; o toast diz quantas ficaram.
- **D10. Marca no lado do dono.** O baralho público ganha o ícone de pessoas (o mesmo do "Público" do
  editor) na tira do nome, nas pilhas e na pasta. (A carta privada de um baralho público tinha um cadeado na
  etiqueta; o dono pediu para tirar: "ocupa muito espaço e é muito pouco usado". Fica só no texto do leitor
  de tela.)

---

## 3. Os dados

### 3.1 O baralho público (`core/study.ts`)

```ts
export interface Deck {
  // ...o de hoje
  /** Quem visita o mural vê o baralho, com as cartas de anotações públicas (sem o campo: privado). */
  public?: true;
}
```

- `sanitizeDeck` aceita `public: true`; `DeckPatch` passa a ter `public?`. `updateDeck` já grava o `at`.
- `StudyConfig` ganha `hideProgress?: true` (D2), saneado e juntado como o resto da configuração (a mudada
  por último vence). Vai com os Estudos no privado; quem visita só sente pelo que vai no público.
- `SYNC_SCHEMA` 52 → 53: um site antigo que baixasse o baralho jogaria fora o `public` e devolveria sem ele.
- Função pura `publicShare(st, isPublicNote)`: quantas cartas vivas do baralho e quantas são de anotação
  pública, para a porcentagem (arredondada; 0 cartas = sem pergunta).

### 3.2 O que vai no público (`core/cloud-sync.ts`)

Uma parte nova no JSON público, `estudos`, só com os baralhos públicos:

```jsonc
"estudos": {
  // o formato dos Estudos guardados, com menos campos (a leitura passa pelo mesmo saneamento)
  "decks": [{ "id", "name", "icon", "color", "look"?, "group", "order", "at": "1970-…" }],
  "cards": [{ "note", "decks": ["id"], "front": {…}, "srs"?, "stats"?, "added", "at": "<added>" }],
  "progress": false   // só quando o dono escondeu (D2)
}
```

- Só os baralhos com `public`; só as cartas vivas (`StudyStore.view`) de anotações que já vão no público
  (`notas` ou `soKanban`), e de cada carta só os baralhos públicos. Os ids das anotações nunca levam a uma
  privada: a carta da privada nem entra.
- `srs` e `stats` só sem o `hideProgress`.
- Pura e testada: `publicStudy(state, shownIds, hideProgress)`; a imagem da frente entra no `publicText`, e
  então vira pública na nuvem pela regra de sempre.
- `publicCategoryLooks` passa a contar os grupos dos baralhos públicos (a orelha do grupo com o ícone e a cor).
- `PUBLIC_RULES` 4 → 5: cada aparelho reenvia o público uma vez com a regra nova.
- A nuvem não muda: o público é um blob, e a conferência das compartilhadas (`withoutGone`) só tira
  anotações; a carta sem anotação não aparece para quem visita (ver 3.3).

### 3.3 O que quem visita lê (`core/backup-file.ts`, `core/colleague-store.ts`)

- `Colleague.estudos?: PublicStudy` (saneado: baralhos, cartas e `progresso`) e
  `Colleague.soKanban?: Review[]` (as públicas fora do mural, que até hoje só o link lia: as cartas "só nos
  Estudos" moram nelas).
- `MURAL_READER` 8 → 9 (o guardado é baixado de novo uma vez).
- `core/visit-study.ts` (puro): os grupos (só os com baralho público, na ordem dos baralhos), as pilhas e as
  cartas que têm anotação (em `reviews` ou `soKanban`).

### 3.4 Copiar (`core/study-copy.ts`, puro + o serviço)

- `copiedNote(fonte, id, grupo, agora)`: a anotação nova (D7), saneada por `sanitizeReview`.
- `StudyStore.copyDeck({ nome, grupo, fonte, cartas })`: cria o baralho (a cor, o ícone e o estilo do
  original; nome único no grupo), as anotações e as cartas; devolve o id e o Desfazer. Respeita
  `MAX_DECKS` e `MAX_CARDS` (sem lugar: a folha diz e nada é criado).
- Imagens (no texto e na frente): a que já está aqui (`alheia`) é adotada; a outra desce pelo endereço
  público (`ImageSync.publicUrl`) e entra como colada (`ImageStore.add`). A que não desce fica com o
  endereço de antes (quebrada, como a imagem de uma compartilhada que saiu), e o toast diz quantas.

---

## 4. As telas

### 4.1 Público ou Privado no baralho (`ui/study-deck-sheet.ts`)

- Uma seção nova **Quem vê**, logo depois do Nome: as duas etiquetas do editor (`quem-tag`, Público com o
  ícone de pessoas, Privado com o cadeado), iguais às de lá. Embaixo, a dica:
  - Privado: "Só você vê este baralho."
  - Público, todas públicas: "Quem visita o seu mural vê o baralho e as 24 cartas."
  - Público, com privadas: "Quem visita vê 18 das 24 cartas. As de anotações privadas ficam só com você."
- Escolher Público com carta privada: `Confirm.choose` (D9), na ficha azul neutra:
  - título "Tornar o baralho público"; texto, palavra por palavra, o do pedido com a porcentagem real.
  - **Tornar todas públicas** (principal) · **Só o baralho** · Cancelar (fica Privado).
  - Toast: "Kana ficou público, com as 92 cartas" e Desfazer (o baralho volta a Privado e as anotações
    voltam a privadas).

### 4.2 As marcas do dono (`pages/study-page`)

- D10: o ícone de pessoas na tira do nome (pilha, trilha do baralho), com "Público" para o leitor de tela.
- Na parede de um baralho público, a carta de anotação privada não leva marca na tela (pedido do dono); o
  leitor de tela diz "só você vê esta carta".

### 4.3 Ajustes › Amigos (`pages/settings-page`)

- Linha nova com o interruptor de papel, logo depois de "Quem você segue e quem te segue" (só com conta):
  **Esconder o progresso nos Estudos** — "Quem visita os seus baralhos públicos vê as cartas sem o nível, a
  volta e os acertos." Com a prévia de linha como as outras.

### 4.4 A visita: Mural · Estudos (`pages/colleague-wall-page`)

- Rotas novas, todas com a mesma página: `comparar/mural/estudos`, `…/estudos/:grupo`,
  `…/estudos/:grupo/:baralho`. A ficha da dona fica igual em cima.
- Com as Anotações abertas e algum baralho público: logo abaixo da ficha, as seções **Mural · Estudos**, os
  mesmos links de tinta das seções da barra da página (`.secao`). Sem baralho público, nada muda.
- Em Estudos, embaixo, o componente novo `ui/visit-study.ts` (por `@defer`):
  - as abas de manilha: Tudo e os grupos com baralho público (com o ícone e a cor deles);
  - Tudo e o grupo: as pilhas, com o elástico na cor do baralho, sem o papelzinho (D6); a tira com o nome e
    "24 cartas";
  - o baralho: a pasta com "← Baralhos", a tira do nome, "24 cartas" e, na ponta, **Copiar baralho**
    (tinta, ícone de cópia); a régua com a busca, Ordenar (Próxima revisão e Nível só com o progresso) e o
    tamanho das cartas; a parede das cartas, com o progresso na frente quando aparece;
  - tocar numa carta abre a leitura da anotação, com o nome da dona (o que já existe na visita).
- O mesmo desenho do dono, das mesmas classes: os estilos das abas, da pasta, das pilhas e da parede saem
  de `study-page.scss` para um parcial (`pages/_study-shelf.scss`) que as duas páginas usam.

### 4.5 Copiar baralho (`ui/study-copy-sheet.ts`)

- A ficha das folhas do site (a do baralho), título "Copiar baralho", com a primeira carta do baralho ao
  lado, pequena e inclinada.
- **Nome**: o campo de papel, com o nome do dono já escrito.
- **Grupo**: as orelhas e a busca que cria do editor da anotação (`app-group-picker`, sem o "Sem grupo"),
  nenhuma escolhida, e a dica do que falta. O botão só acende com um grupo. (O plano dizia `<datalist>`: a
  crítica mostrou a lista escondida e o triângulo nativo destoando.)
- A frase do que vai acontecer: "24 cartas viram anotações suas, privadas, só nos Estudos. O progresso
  começa do zero."
- **Copiar** (tinta) · Cancelar. Copiando, o botão espera (`appBusy`); no fim, D8.
- Sem lugar (100 baralhos ou 5000 cartas): o aviso em vermelho embaixo (`role="alert"`) e o botão apaga.
- Copiando, nada fecha a folha (Cancelar, X, Esc): a cópia não para no meio.

---

## 5. A regra do logout (CLAUDE.md)

Nada novo fica no navegador: o `public` e o `hideProgress` moram em `meu-mural:estudos:v1`; os Estudos de
quem se visita, no banco dos colegas (`meu-mural:colegas`); as imagens copiadas, no `meu-mural:imagens`.
Tudo já está em `wipeBrowser`. O teste em `browser-reset.spec.ts` ganha o caso do colega com `estudos`.
O baralho público conta como conteúdo pelo baralho (`localHasContent` já conta baralhos).

---

## 6. O que fica de fora (de propósito)

- Estudar o baralho de outra pessoa sem copiar (D6).
- Uma pasta "Estudos" no perfil (D3).
- A API e o MCP: `ver_estudos` e `editar_baralho` não falam de público por enquanto (uma rodada depois, se
  o dono quiser). A API não mexe no `public` de quem já tem.
- Copiar só algumas cartas, ou copiar para um baralho que já existe.
- Avisar o dono de que alguém copiou.

---

## 7. Rodadas

As rodadas 1 a 3 vão num commit só (o interruptor do dono não faria nada à vista antes de quem visita poder
ver); a 4 em outro. Cada commit com push.

1. **Dados e público**: 3.1, 3.2, 3.3 (sem tela), testes de saneamento, junção, `publicStudy`, leitura.
2. **O dono**: 4.1, 4.2, 4.3. Fotos 2x da folha e das marcas.
3. **Quem visita**: 4.4. Fotos 2x no computador e no celular. Os estilos não foram para um parcial: o
   componente da visita usa o próprio `study-page.scss` na lista de estilos (o mesmo desenho, sem mexer na
   página do dono).
4. **Copiar**: 3.4, 4.5. Fotos 2x.
5. **Fim**: crítica do Impeccable (desenho e detector) e correções; `/code-review high` e correções;
   build de produção, abrir a build com dados guardados.

---

## 8. A conferir (riscos)

- O mural público tem 1,8 MB de teto: os baralhos públicos levam a frente e o progresso de cada carta
  (~300 bytes compactados por 100 cartas). Medir com os 101 do dono.
- A carta de anotação compartilhada que a nuvem tira na conferência: some para quem visita (a carta sem
  anotação não aparece). Conferir no teste da leitura.
- Os estilos movidos para o parcial não podem mudar nada na página do dono: comparar as fotos de antes e
  depois (Tudo, grupo, baralho).
- O `@defer` do componente da visita e da folha de copiar: conferir o orçamento com `npx ng build`.

---

## 9. Andamento

- Rodadas 1 a 3 (BUILD 768, Novidades 1.38.0): o `public` do baralho e o `hideProgress` (SYNC_SCHEMA 53),
  `estudos` no público (core/public-study.ts, PUBLIC_RULES 5), a leitura de quem visita (MURAL_READER 9,
  `Colleague.estudos` e `studyNotes`), Quem vê na folha do baralho, Ajustes › Amigos, Mural · Estudos e
  `ui/visit-study.ts` nas rotas `/comparar/mural/estudos/...` (`isVisitPath`). A imagem da frente, fora da
  conta, vem pelo endereço público.
- Rodada 4 e fim (BUILD 770, Novidades 1.39.0): `core/study-copy.ts` (`DeckCopy`, `copiedNote`, `freeDeckName`,
  `swapImages`), `ui/study-copy-sheet.ts`, crítica do Impeccable (detector limpo; 28/40 antes das correções, em
  `.impeccable/critique/`), `/code-review high`, build de produção e abrir a build com dados guardados. A visita
  virou uma rota só (`visitMatcher`, BUILD 769): o Router não refaz mais a página a cada aba.
- Depois do plano (BUILD 771, 1.39.1), pedido do dono: a pergunta da porcentagem só aparece ao tornar o baralho
  público, e as cartas novas nascem privadas sem ninguém notar. A anotação privada que entra num baralho público
  agora pergunta (`ui/public-deck-nudge.ts`): pelo editor, pelo Trazer anotações e pela folha da carta (ao fechar,
  porque o bilhete fica atrás da folha). Pelos pedidos da API, não.
- Sobre os riscos da seção 8: as cartas pesam pouco (uns 300 bytes de JSON cada, 30 KB nas 101 do dono, perto dos
  1,8 MB de teto); a carta sem anotação não aparece (teste em `visit-study.spec.ts`); os estilos não foram movidos,
  então a página do dono não mudou.
