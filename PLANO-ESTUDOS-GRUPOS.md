# Plano: os Estudos separados por grupo

Pedido do usuário (04/nov/2026), num cartão do Dev Murall: "Separar a aba de estudos por GRUPO, assim
como o mural e o Kanban. [...] Quero que a tela de estudos funcione como a aba de MURAL DE ANOTAÇÕES e
KANBAN, que possui como as orelhas selecionaveis os grupos. Quando isso for feito, será impossível que
um baralho de estudos possua cartas de outros Grupos. Quero que seja assim mesmo. No futuro podemos pensar
numa solução para que seja possível juntar 2 baralhos de grupos externos em um só baralho". E, na
conversa: "todo o mural de anotações funciona com base nos grupos, e ficaria confuso que a aba de estudos
passasse a ignorar isso. Também acho que separar lá por grupos iria ajudar a separar melhor as coisas,
como estudos de japones e estudos de computação."

Só o plano: nada foi implementado e o site não muda. Na implementação, o Impeccable entra no começo e no
fim de cada rodada com tela, e o `/code-review high` no fim, como o pedido diz. Este plano muda uma decisão
do PLANO-ESTUDOS.md (seção 3: "Um baralho não depende do grupo da anotação"); o resto daquele plano vale.

---

## 0. Resumo

- **As orelhas dos Estudos passam a ser os grupos**, as mesmas do mural e do Kanban (a ordem, o "Mais",
  os escondidos e "Esconder os grupos vazios" da engrenagem do mural), mais o **Tudo** na frente.
- **Dentro de um grupo, os baralhos são as pilhas com elástico** (o desenho que hoje é o do Tudo). Tocar
  numa pilha abre o baralho, com a parede das cartas, como hoje.
- **Todo baralho é de um grupo** (`Deck.group`). Uma carta só vale nos baralhos do grupo da anotação
  dela. Uma carta pode continuar em vários baralhos, desde que sejam do mesmo grupo, com um progresso só.
- **Estudar em três alturas:** Estudar tudo (no Tudo), Estudar o grupo (na aba do grupo) e Estudar (no
  baralho).
- **As quatro decisões do usuário** (seção 2): a anotação que muda de grupo dorme nos baralhos de antes,
  como no Kanban; as abas são as do mural; o baralho misto de hoje vira um por grupo; anotação sem grupo
  não tem baralho.
- **Os dados de hoje:** os dois baralhos do usuário (Kana, 92 cartas; Kanji Simples, 9) estão inteiros
  no grupo Estudo Japones (conferido pelo MCP em 04/nov). A conversão só grava o grupo neles.

---

## 1. Como é hoje (o que pesa)

- `core/study.ts`: `Deck` não tem grupo; `StudyCard.decks` são de 1 a 20 baralhos, sem regra de grupo.
  `removeDeck` tira as cartas que só estavam naquele baralho.
- `pages/study-page.html`: as orelhas são os baralhos (Tudo + um por baralho + "Novo baralho"); o Tudo
  mostra as pilhas; o baralho, a parede. Rotas: `anotacoes/estudos` e `anotacoes/estudos/:baralho`.
- A carta nova pedida de dentro de um baralho que fica só nos Estudos salva **sem grupo** sem perguntar
  (`FlashcardTab.studyOnly`, `ReviewEditor.okWithoutLabels`). Com este plano, isso muda (seção 4.3).
- O Kanban já resolveu quase tudo o que este plano precisa, e é o modelo:
  - um quadro por grupo, pela chave do grupo (`categoryKey`, `boardIdFor`); anotação sem grupo não tem
    quadro;
  - a anotação que muda de grupo fica guardada no quadro de antes, sem aparecer (`liveCards`), e volta
    se voltar ao grupo;
  - saindo do quadro, a anotação volta ao mural: nunca fica sem lugar;
  - renomear ou apagar o grupo passa por `LabelEdits.renameCategory`, que chama `KanbanStore.moveCategory`
    (`moveBoardCategory`, com `movedTo` para a junção); apagar avisa "o quadro do Kanban dele vai embora";
  - a carta nova pedida de uma coluna cai pelo `KanbanSpot`/`claim`, que acompanha a troca de grupo feita
    no editor.
- Nas compartilhadas, o grupo é de cada um (`Personal.category`, core/shared-notes.ts): a carta usa o
  grupo **seu**, como o Kanban.

---

## 2. As decisões

Tomadas pelo usuário em 04/nov ("Sim, as quatro", sobre as recomendações):

- **G1. A anotação que muda de grupo dorme.** A carta fica guardada, com o progresso inteiro, mas some dos
  baralhos do grupo de antes (das pilhas, das contas, das filas). Voltando ao grupo, ela volta a eles. Posta
  num baralho do grupo novo, passa a valer lá, e os baralhos de outro grupo saem da lista dela. O editor
  avisa na hora em que o grupo muda.
- **G2. As abas são as do mural.** Os mesmos grupos, na mesma ordem, com o "Mais", os escondidos e
  "Esconder os grupos vazios" (aqui, vazio = sem baralho). O grupo sem baralho mostra "Monte o primeiro
  baralho de Trabalho".
- **G3. O baralho misto vira um por grupo.** Na conversão, o baralho com cartas de dois grupos vira dois,
  com o mesmo nome, a cor, o ícone, o desenho e os ajustes, um em cada grupo. Nada some, o progresso não
  muda.
- **G4. Anotação sem grupo não tem baralho**, como não tem quadro no Kanban.

Decididas por mim, seguindo o Kanban e o PLANO-ESTUDOS (o usuário pode mudar qualquer uma):

- **G5. O Tudo continua**, sempre em pé (é onde mora o Estudar tudo). Diferente do mural, sem a opção
  "Mostrar a aba Tudo".
- **G6. O baralho não muda de grupo à mão.** O grupo de verdade é o da anotação; levar um baralho para
  outro grupo mudaria o grupo de muitas anotações de uma vez. Ele só muda de grupo quando o grupo é
  renomeado ou juntado a outro (seção 3.4). Fica de fora (seção 7).
- **G7. Apagar o grupo leva os baralhos dele**, como leva o quadro do Kanban, e a pergunta diz isso ("e os
  baralhos Kana e Kanji Simples dos Estudos, com 101 cartas e o progresso delas"). As anotações continuam,
  sem grupo.
- **G8. A carta dormindo não vota para sair do mural.** Hoje a carta "só nos Estudos" tira a anotação do
  mural. Dormindo, ela não está em lugar nenhum dos Estudos, então a anotação volta ao mural (a regra do
  Kanban: nunca fica sem lugar).

---

## 3. Os dados (`core/study.ts`, `core/study-store.ts`)

### 3.1 O baralho ganha o grupo

```ts
export interface Deck {
  // ...o de hoje
  /** O grupo do baralho, como as anotações escrevem (cleanCategory); comparado pela chave (lookKey). */
  group: string;
  /** A posição entre os baralhos do mesmo grupo. */
  order: number;
}
```

Guardo o nome, e não só a chave, para a orelha ter o que escrever mesmo com o grupo sem nenhuma anotação
à mostra (o baralho de um grupo cujas anotações estão todas no Kanban, por exemplo). A comparação é
sempre pela chave, como no Kanban.

### 3.2 A regra vale na leitura, não na gravação

A regra "o baralho só tem cartas do grupo dele" é aplicada **por quem lê**, nunca apagando o guardado:

- `liveDecks(card, noteGroup, decks)`: os baralhos da carta cujo grupo tem a chave do grupo da anotação.
  Tudo o que conta e desenha (pilhas, contas por baralho, `dayQueue`, `allCounts`, `nextUp`, o boletim, o
  voto do mural) passa por ela. É o `liveCards` do Kanban, aplicado às cartas.
- A carta sem nenhum baralho vivo **dorme** (G1): fica no estado com o progresso, e não aparece.
- Pôr a carta num baralho (`addCard`, `setDecks`) tira da lista os baralhos de outro grupo, e recusa um
  baralho de um grupo que não é o da anotação (a tela nem oferece; a API responde com o motivo).

Por que na leitura: a anotação muda de grupo por muitos caminhos (o editor, a API, outro aparelho, a
compartilhada mudando o grupo de cada um, o renomear do grupo), e um aparelho com o site antigo pode pôr
uma carta num baralho de outro grupo. Com a regra na leitura, nenhum desses caminhos precisa lembrar de
mexer nos Estudos, e nada se perde: a anotação que volta ao grupo volta aos baralhos.

O `StudyStore` precisa do grupo de cada anotação: lê do `ReviewStore` (o grupo seu, nas compartilhadas),
como o `KanbanStore` já faz.

### 3.3 A conversão (`sanitizeStudy` + `core/migrations.ts` se precisar das notas)

Roda uma vez, quando o baralho chega sem `group` (do armazenamento, da nuvem, de um site antigo):

1. O grupo do baralho é o que mais aparece entre as anotações das cartas dele (no empate, o da carta mais
   antiga).
2. Para cada outro grupo com cartas no baralho, nasce uma cópia (G3): o mesmo nome, cor, ícone, desenho,
   novas por dia e voto do mural, logo depois na ordem. O id da cópia sai do id do baralho e da chave do
   grupo (`deckIdFor(id, grupo)`), para dois aparelhos que convertem ao mesmo tempo criarem **o mesmo**
   baralho, e a junção não duplicar. As cartas desse grupo trocam o baralho de antes pela cópia.
3. O baralho sem cartas vai para o grupo Estudos, se existir; senão, para o grupo com mais anotações.
4. A carta cuja anotação não tem grupo (a carta nova só dos Estudos, seção 1): a **anotação** ganha o
   grupo do baralho. Sem isso, pela G4, ela dormiria e o usuário perderia a carta de vista. É a única
   conversão que mexe na anotação; vai pelo `ReviewStore`, com o `updatedAt` andando, para sincronizar.
5. As novas de hoje (`today.news`) ficam no baralho de antes.

Idempotente (rodar de novo não muda nada) e com teste, como toda conversão (feedback do número da build).
Precisa das anotações, então mora no `StudyStore` (depois de o `ReviewStore` carregar), não no
`sanitizeStudy` puro, que só aceita o campo e deixa o baralho sem grupo para a conversão.

### 3.4 Renomear, juntar e apagar o grupo

`LabelEdits.renameCategory` chama também `StudyStore.moveCategory(from, to)`:

- Renomear: os baralhos do grupo trocam o `group`. O `at` anda; a junção resolve como sempre.
- Juntar a outro grupo ("entrou em X"): os baralhos vão para X; se X já tem um baralho com o mesmo nome
  (sem acento nem caixa), as cartas entram nele, como as colunas de mesmo nome no `moveBoardCategory`, e o
  de antes sai (fica em `removed`).
- Apagar (`to: null`): os baralhos saem, com as cartas que só estavam neles (G7), pelo `removeDeck` de
  hoje. A pergunta do `MuralConfig.deleteCategory` ganha a frase dos Estudos quando o grupo tem baralho.

Um aparelho que mexe num baralho sem saber que o grupo mudou de nome: o baralho tem id próprio (não sai
do nome do grupo, ao contrário do quadro do Kanban), então a mexida cai no mesmo baralho, e a junção pega
o `group` mais novo. Não precisa do `movedTo`.

### 3.5 Sincronização

- `SYNC_SCHEMA` 51 → 52: "o grupo de cada baralho dos Estudos (`group`). Um site da 51 jogaria o campo
  fora ao enviar os Estudos, e o baralho perderia o grupo (e, com cartas de dois grupos, viraria um só)".
- `mergeStudy`: o `group` vai junto com o resto do baralho (o mais novo vence), sem regra própria.
- `localHasContent` não muda (baralho já conta como conteúdo).

---

## 4. As telas

Com o Impeccable no começo (contexto, `craft-floor.md`) e no fim (revisão e fotos 2x de cada peça), sem
rodada de escolha. Nada aprovado muda de aparência: a carta, a pilha com elástico, a parede, a sessão e a
folha do baralho ficam como estão; o que é novo é onde cada um mora.

### 4.1 As orelhas e as rotas

- A fileira de orelhas é a dos grupos, o mesmo componente/régua do Kanban (`ui/tab-fit.ts`,
  `ui/tab-more.ts`, `CategoryLabel`), com o ícone e a cor de cada grupo. Na orelha, o número para hoje do
  grupo (como hoje no baralho).
- O "Novo baralho" sai da fileira: vai para dentro da pasta do grupo, ao lado das pilhas (a vaga de
  pilha tracejada, como a carta desenhada a giz do baralho vazio).
- Rotas: `anotacoes/estudos` (Tudo), `anotacoes/estudos/:grupo` e `anotacoes/estudos/:grupo/:baralho`. O
  `:grupo` é o id do grupo, como o `:quadro` do Kanban (sai da chave, sem acento no endereço). O endereço
  de antes, `anotacoes/estudos/:baralho`, redireciona para o novo (o link guardado, a aba do navegador).
- O título da página (`h1` só para leitor de tela) diz "Estudos: Estudo Japones" ou "Estudos: Estudo
  Japones, Kana".

### 4.2 O que tem em cada aba

- **Tudo:** as pilhas de todos os grupos, separadas pelo nome do grupo (a orelha do grupo em cima de cada
  fileira, como o grupo na Visão geral das anotações), e o Estudar tudo.
- **Um grupo:** as pilhas dele, o "Estudar o grupo" (as filas dos baralhos do grupo juntas, com o limite
  de cada um, a carta repetida uma vez só: a regra de hoje do Estudar tudo, só com o grupo) e o "Novo
  baralho". O grupo sem baralho: "Monte o primeiro baralho de Trabalho", a cartolina de hoje com o nome do
  grupo.
- **Um baralho:** como hoje (parede, busca, nível, ordem, Nova carta, Trazer anotações, lápis), com o
  caminho de volta ao grupo no topo da pasta.
- O primeiro baralho de todos (nenhum baralho em lugar nenhum): a cartolina de hoje ganha a escolha do
  grupo, já no grupo Estudos se existir.
- Os números da linha de cima (novas, aprendendo, revisões) seguem a aba: tudo, o grupo ou o baralho.

### 4.3 A carta nova e "Trazer anotações"

- **Nova carta** num baralho: a anotação nasce no grupo do baralho (como a da coluna do Kanban nasce no
  grupo do quadro). Se a pessoa trocar o grupo no editor, a carta cai num baralho do grupo novo com o
  mesmo nome, se houver; senão, a aba Flashcard pede um baralho do grupo novo (o `valid` de hoje, que já
  segura o salvar sem baralho). Acaba o caso da carta salva sem grupo (seção 1).
- **Trazer anotações**: o seletor (`CardPicker`, com os filtros de grupo, assunto e tags) abre preso no
  grupo do baralho, sem o filtro de grupo.

### 4.4 A aba Flashcard e a folha da carta

- A escolha de baralhos mostra só os do grupo da anotação, no grupo que está no editor agora (mudou o
  grupo no editor, a lista muda junto).
- A anotação que já é carta e muda de grupo no editor: uma linha na aba Flashcard e um aviso ao salvar,
  "Sai dos baralhos Kana e Kanji Simples (Estudo Japones). Volta a eles se voltar ao grupo.", e a escolha
  de baralhos do grupo novo à mão, vazia. Salvar sem escolher deixa a carta dormindo (G1), sem perguntar
  de novo.
- A anotação sem grupo: a aba Flashcard diz "Escolha um grupo para a anotação virar carta" no lugar do
  "Criar a frente".

### 4.5 O mural (o voto)

`StudyStore.votes`/`studyOnly` contam só a carta com baralho vivo (G8). O teste: a anotação "só nos
Estudos" que muda para um grupo sem baralho dela aparece no mural.

---

## 5. A API e o MCP (PLANO-API.md, rodada 12)

- `ver_estudos`: o `grupo` de cada baralho, e os números de hoje por grupo.
- `ver_contexto`: os baralhos com o grupo de cada um.
- `criar_baralho`: `grupo` obrigatório, entre os que existem (a regra 1 do MCP já manda usar os de
  `ver_contexto`).
- `editar_baralho`: não muda o grupo (G6); o campo é recusado com o motivo.
- `editar_carta`, `carta.por` (`api-requests-study.ts`, onde o app aplica): o baralho de outro grupo é
  recusado, com "o baralho Kana é do grupo Estudo Japones, e a anotação é de Computação". A recusa sai da
  fila (como as outras, varredura de 24/out).
- `listar_cartas`: o filtro `grupo` (a carta já devolve o grupo). `estudar_agora`: o escopo `grupo`.
- `guia_do_murall` e a descrição das ferramentas dizem a regra em uma frase.

---

## 6. A regra do logout (CLAUDE.md)

Nada novo no navegador: o grupo mora dentro de `meu-mural:estudos:v1`, que já tem o prefixo e já sai no
`wipeBrowser`, e o grupo aberto vai no endereço. O teste de `browser-reset.spec.ts` dos Estudos continua
valendo; a conversão roda dentro do `StudyStore`, depois da limpeza da subida, e grava pelo `writeJson`.

---

## 7. O que fica de fora (de propósito)

- **O baralho que junta baralhos de grupos diferentes** (o "no futuro" do pedido). Este plano deixa a porta
  aberta: o baralho misto seria um baralho que aponta para **outros baralhos** (não para cartas), e estuda
  a fila deles juntas. A regra das cartas continua: cada carta num grupo só.
- Levar um baralho inteiro para outro grupo (G6).
- Sub-baralhos (como no PLANO-ESTUDOS).
- Usar o assunto como segundo nível no lugar dos baralhos: o Kana e o Kanji Simples moram no mesmo grupo,
  e os baralhos já fazem isso.

---

## 8. Rodadas (uma de cada vez, cada uma com commit e push)

1. **Dados e conversão.** `Deck.group`, `liveDecks`, a carta dormindo, a conversão (com a anotação sem
   grupo), `moveCategory` no `LabelEdits` e a pergunta de apagar o grupo, SYNC_SCHEMA 52, o voto do mural
   (G8). A tela de hoje continua, só que cada baralho mostra apenas as cartas vivas. Testes: conversão
   idempotente e com dois aparelhos convertendo ao mesmo tempo (o mesmo id), a carta que muda de grupo e
   volta, a carta dormindo de volta ao mural, renomear/juntar/apagar o grupo, o site antigo pondo carta em
   baralho de outro grupo.
2. **A tela.** Orelhas dos grupos, as pilhas por grupo, o Tudo com as fileiras por grupo, o Estudar o
   grupo (`dayQueue` com o escopo de grupo), as rotas e o redirecionamento, o primeiro baralho com grupo.
   Impeccable no começo e no fim, fotos 2x.
3. **O editor.** A aba Flashcard com os baralhos do grupo, o aviso da troca de grupo, a Nova carta que
   nasce no grupo do baralho (e o fim do "salva sem grupo"), o Trazer anotações preso no grupo.
4. **A API e o MCP.** Seção 5, com o guia.

No fim: `/code-review high` sobre tudo, as correções, as Novidades (uma entrada, F/M/C pelas perguntas de
sempre) e a build de produção com o smoke.

---

## 9. A conferir (riscos)

- **A conversão mexe em anotações** (a carta sem grupo ganha o grupo do baralho). É pouca coisa (só as
  cartas novas feitas dentro de um baralho, só nos Estudos), mas sincroniza para a nuvem e para os outros
  aparelhos. Conferir com os dados do usuário antes do commit da rodada 1.
- **Dois aparelhos convertendo** ao mesmo tempo precisam chegar no mesmo resultado (o id da cópia
  determinístico, a escolha do grupo determinística).
- **A compartilhada** em que cada membro põe um grupo diferente: a carta é só de quem a fez, no grupo dela,
  e o outro membro não vê nada (como hoje). Conferir que a troca de grupo de um membro não mexe na carta do
  outro.
- **O número da orelha** soma os baralhos do grupo sem contar duas vezes a carta que está em dois deles.
- **O "Esconder os grupos vazios"** nos Estudos quer dizer "sem baralho", e no mural "sem anotação à
  mostra": a mesma chave da engrenagem com dois sentidos. Se confundir, os Estudos ganham a opção própria
  na parte Estudo da engrenagem.

---

## 10. Andamento

- **Rodada 1 (04/nov, BUILD 734).** `Deck.group`, `liveStudy` (o `StudyStore.view`, de onde saem as cartas,
  as filas e os números; `state` continua o guardado), `convertGroups` ao abrir (espera só enquanto não há
  anotação nenhuma carregada; o baralho cujas anotações foram todas apagadas vai para o grupo de sempre),
  `moveGroup` pelo `LabelEdits.renameCategory`, a pergunta de apagar o grupo com os baralhos, SYNC_SCHEMA 52,
  o voto do mural (G8). Para a tela de hoje não oferecer o que a regra recusa, entraram já os pedaços mínimos
  das rodadas 3 e 4: a Nova carta abre o editor no grupo do baralho (`desk.newNoteIn`), o Trazer anotações
  só mostra as do grupo, a escolha de baralhos (aba Flashcard e folha da carta) só os do grupo do editor (sem
  grupo, "Escolha um grupo…"), salvar com a carta dormindo não a tira, e a API recusa o baralho de outro grupo
  com o motivo (a nota nova sem grupo ganha o do baralho). O "Novo baralho" da tela de hoje nasce no grupo do
  baralho aberto (de Tudo, no grupo de sempre) até a rodada 2, e o `baralho.criar` da API, no grupo de sempre
  até a rodada 4. Pela crítica do Impeccable (18/40: a carta sumia sem aviso), entrou também o aviso da
  rodada 3: a linha "Fora de Kana enquanto a anotação não for de…" na aba Flashcard, o aviso de salvar com o
  Desfazer do grupo, a prévia e o "No mural" verdadeiros com a carta guardada, o boletim "Guardada, fora dos
  baralhos", a anotação sem grupo pedindo o grupo no lugar do "Criar a frente", a pergunta de apagar o grupo
  com a perda primeiro ("Apagar o grupo e os baralhos") e o grupo na folha do baralho. O `/code-review high`
  achou 8 (o Desfazer da API com a carta da vista, que a perderia; responder a carta guardada; o seletor com
  baralho escondido; a vista que refazia tudo a cada anotação salva; e outros), todos corrigidos. Fica para a
  3: a carta que procura o baralho de mesmo nome no grupo novo.
