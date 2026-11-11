# Compartilhar grupos, Kanbans e quadros livres (e quem vê o quê, de um jeito só)

Pedido do dono em 11/nov/2026 (cartão "Possibilidade de compartilhar grupos (anotações) e kanbans"):

- compartilhar **grupos inteiros** (a aba de anotações), o **Kanban** dele e os **quadros livres**, com os
  mesmos conceitos da anotação compartilhada: ler, editar ou gerir;
- deixar um grupo (o Kanban e o mural dele) **100% público**, só leitura para quem visita, editável só por
  quem tem permissão;
- as opções na **engrenagem** do mural de anotações;
- anotação privada num Kanban público deixa de ser privada (sem ir para o Feed), com dois avisos:
  "Há X notas privadas neste Kanban, torná-lo público irá deixá-las públicas. Tem certeza que quer fazer
  isso?" e, ao pôr uma privada num Kanban público, "Esta nota privada está sendo incluída em um Kanban
  público, o que irá torná-la pública. Tem certeza?";
- **nunca** deixar a pessoa sem saber quem vê, quem edita e se está público; repensar a privacidade do
  site inteiro se precisar.

Como ler: as seções 1 e 2 dizem o que existe e o que confunde; a 3 é o modelo novo (a parte mais
importante); a 4 é a experiência na tela; a 5 é por dentro; a 6 são as rodadas; a 7, as decisões e as
perguntas ao dono.

---

## 1. O que existe hoje

| Coisa | Quem vê hoje | Onde se escolhe | Onde mora |
|---|---|---|---|
| Resenha | Pública (no Feed) ou Privada | Editor › Quem vê, botão Publicar com a setinha "sem Feed" | mural privado e público da nuvem |
| Anotação | Privada, Disponível (pública fora do Feed) ou Publicar | Editor › Quem vê; padrão por grupo na engrenagem | idem |
| Anotação compartilhada | Dono + pessoas (Gestor, Editor, Leitor); Privada = só elas, Pública = no mural de todas | Leitura › Compartilhar (`ui/share-sheet.ts`) | tabela `notas` + `nota_membros` (0011) |
| Grupo | não existe "quem vê" do grupo; cada anotação decide | — | nome nas anotações; ícone e cor em `Settings.categoryLooks` |
| Kanban | **só o dono** (nunca no público) | — | mural privado (`kanban`) |
| "Só no Kanban" | some do mural do dono e do público | linha "No mural" do cartão | `KanbanCard.wall` |
| Quadro livre | Só você ou Público (visita) | topo do quadro | tabela `quadros` (0024), `publico` |
| Baralho | Privado ou Público; carta pública = anotação pública | folha do baralho, com "tornar todas públicas" | mural privado (`estudos`) e público |
| Perfil | sempre público, só com fichas públicas | Perfil › Editar | público |
| Comentários | só em ficha pública; numa compartilhada, quem está nela | Ajustes › Amigos | `comentarios` |

O público de cada pessoa é montado **no aparelho dela** (`CloudSync.push`) e enviado como um gzip que a
nuvem não abre. Só os quadros livres públicos são servidos direto pela nuvem.

## 2. O que confunde hoje (e o que piora se só empilharmos o pedido)

1. **"Privada" quer dizer duas coisas.** Numa anotação comum é "só eu"; numa compartilhada é "só quem
   está nela". O dono já mora no segundo sentido sem que a tela diga.
2. **Cada coisa tem a sua tela de quem vê**, com palavras diferentes: Privada/Disponível/Publicar,
   Privada/Pública, Só você/Público, Privado/Público.
3. **Não há resposta numa frase** para "quem vê isto?". A leitura mostra um glifo antes da data; o resto
   é preciso deduzir.
4. Com grupos compartilhados, uma anotação pode ser vista **por dois caminhos** (ela mesma e o grupo).
   Sem uma regra única, a pessoa não tem como saber qual vale.

---

## 3. O modelo novo: três perguntas, as mesmas em todo lugar

Tudo o que se mostra a alguém no Murall responde às mesmas três perguntas, com as mesmas palavras, numa
peça só (seção 4.1):

1. **Quem está?** As pessoas com acesso, cada uma com um papel.
2. **Quem mais vê?** O acesso geral: **Só quem está** ou **Público** (qualquer pessoa, só lendo).
3. **De onde vem?** O acesso que chega de cima: uma anotação de um grupo compartilhado recebe as pessoas
   e o público do grupo.

### 3.1 O que se compartilha

| Coisa | Pessoas com papel | Público | Leva junto |
|---|---|---|---|
| **Anotação** | sim (como hoje) | sim, com a escolha do Feed (Publicar ou não) | — |
| **Grupo** (novo) | sim | sim, nunca no Feed | o mural do grupo, o Kanban dele, os quadros livres dele (pergunta P2), as pastas, as tags e as cores das tags |
| **Quadro livre** | sim (novo) | sim (como hoje) | — (as anotações coladas nele seguem cada uma a sua regra; ver 4.7) |
| Resenha, Baralho | não (fora do pedido) | sim (como hoje) | — |

O **Kanban não é compartilhado sozinho**: no Murall o Kanban *é* o grupo (um quadro por grupo, ver
`core/kanban.ts`). Compartilhar o Kanban é compartilhar o grupo; a tela diz isso nas palavras do dono:
"Grupo Trabalho: o mural, o Kanban e os quadros livres". Assim não nasce um terceiro jeito de ver as
mesmas anotações (um Kanban público com o mural privado mostraria as anotações por um e as esconderia
pelo outro).

### 3.2 Os papéis (os mesmos da anotação, agora para tudo)

O pedido fala em ler, editar e gerir: são os três papéis que já existem. Ficam os nomes que o dono já
conhece, com o verbo ao lado em toda escolha ("Leitor · só lê").

| Pode… | Leitor | Editor | Gestor | Dono |
|---|---|---|---|---|
| ver tudo o que foi compartilhado, comentar e reagir | ✓ | ✓ | ✓ | ✓ |
| fixar, guardar a vista e a ordem (é de cada um) | ✓ | ✓ | ✓ | ✓ |
| escrever anotações, criar novas no grupo | | ✓ | ✓ | ✓ |
| mexer no Kanban (cartões, colunas, importância, status, dependências) e nos quadros livres | | ✓ | ✓ | ✓ |
| criar e renomear pastas e tags do grupo | | ✓ | ✓ | ✓ |
| apagar uma anotação do grupo | | as que ele criou (P3) | qualquer | qualquer |
| chamar e tirar pessoas, trocar papéis | | | ✓ | ✓ |
| mudar o acesso geral (Público / Só quem está) | | | ✓ | ✓ |
| renomear o grupo, ícone e cor | | | ✓ | ✓ |
| parar de compartilhar o grupo, apagar o quadro livre | | | | ✓ |

O servidor confere cada linha desta tabela (como já confere o `so-gestor` da anotação), não só a tela.

### 3.3 O acesso geral

- **Só quem está** (o padrão): ninguém mais vê; quem visita o seu mural não vê nem o nome do grupo.
- **Público**: qualquer pessoa vê, só lendo: quem visita o seu mural e quem abre o link. Num grupo, nunca
  vai para o Feed. Numa anotação, o Feed continua sendo a escolha de sempre (Publicar ou Disponível).

As palavras de hoje se encaixam sem mudar o que está guardado: **Privada = Só quem está** (na anotação
sem ninguém, "só quem está" é só você), **Disponível = Público fora do Feed**, **Publicar = Público e no
Feed**. A anotação continua com os três botões de sempre no editor; o que muda é a frase embaixo (4.1).

### 3.4 A herança: vale o mais aberto, e a tela diz de onde veio

Uma regra só, a do Google Drive: **o acesso de cima se soma ao de baixo, nunca tira**.

| A anotação é | O grupo é | Quem vê a anotação |
|---|---|---|
| Privada, sem ninguém | Só você | só você |
| Privada, sem ninguém | Compartilhado com Ana (Editor) | você e Ana (que edita) — ver P1 |
| Privada, com Bia (Leitor) | Compartilhado com Ana (Editor) | você, Ana (edita), Bia (lê) |
| Qualquer | **Público** | todo mundo lê; ela **vira Disponível** (o pedido), com o aviso |
| Pública (Publicar) | Só você | todo mundo, e foi para o Feed (como hoje) |

Ninguém escolhe "menos que o grupo" numa anotação: quem quer uma anotação só sua não a põe num grupo
compartilhado. A tela da anotação mostra as pessoas que vêm do grupo numa faixa à parte, "Pelo grupo
Trabalho", sem o menu de papel, com **Gerir no grupo**.

### 3.5 O que muda no sentido de "Privada"

"Privada" passa a ser dita sempre como **"Só quem está"**, e a frase-resumo (4.1) diz quem está. É o que
ela já era nas compartilhadas; agora vale escrito para tudo. Nada guardado muda de valor (`private`,
`quiet`, `publishedAt` continuam os mesmos campos).

---

## 4. A experiência

### 4.1 Uma peça só: **Quem vê** (`ui/access-panel.ts`)

Nasce da folha Compartilhar de hoje (`ui/share-sheet.*`, a de estilo Google Docs que o dono aprovou):
o corpo dela vira a peça, e a folha, a engrenagem e o quadro livre a montam. De cima para baixo:

1. **A frase-resumo**, em tinta, no topo, sempre: a resposta a "quem vê isto?" em uma linha.
   - "Só você vê."
   - "Você e Ana veem. Ana também edita."
   - "Você, Ana e mais 3 veem. Qualquer pessoa pode ler pelo link ou pelo seu mural."
   - "Qualquer pessoa pode ler. Você e Ana editam." (público)
   - Num membro: "É de Ana. Você pode editar; Bruno e mais 2 também estão."
2. **O que vai junto** (só no grupo): "O mural do grupo (42 anotações), o Kanban e 2 quadros livres."
3. **Chamar alguém**: o campo de hoje (quem você segue ou o código) e o papel com que entra.
4. **Pessoas com acesso**: o dono primeiro, depois cada pessoa com o menu de papel (e "Tirar").
   Na anotação de um grupo compartilhado, a faixa **Pelo grupo Trabalho** com as pessoas dele e
   **Gerir no grupo**.
5. **Acesso geral**: dois recortes, **Só quem está** e **Público**, cada um com a frase do que acontece;
   no Público, **Copiar o link**. Na anotação continua a escolha do Feed (a setinha "sem Feed" de hoje).
   Na anotação de um grupo público: "Pública pelo grupo Trabalho" no lugar dos recortes.
6. **Sair** (quem não é o dono) ou **Parar de compartilhar** (o dono do grupo), no pé.

Sem conta: a peça diz o de hoje ("Para dividir, entre na sua conta") e o Público do grupo fica travado
com o mesmo motivo (sem conta não há mural público).

### 4.2 Onde mora

- **Engrenagem** (Configurações do mural, `ui/mural-config.*`), a mesma no Mural, no Kanban e no Quadro
  livre: uma parte nova, **Compartilhar**, a **primeira** da lista, com a dica "Quem vê e quem edita este
  grupo". Ela monta a peça para o grupo da aba aberta. Na aba Tudo (ou Fixadas), a parte mostra os
  grupos em linhas de índice (`ui/_indice.scss`), cada uma com a sua frase-resumo, e tocar abre a do grupo.
- **Anotação**: a folha Compartilhar de sempre (leitura › Compartilhar, o menu da ficha), agora com a
  peça.
- **Quadro livre**: um botão **Compartilhar** no topo do quadro (`ui/free-board/board-top.ts`), no lugar
  do interruptor Público de hoje, abrindo a mesma folha.

### 4.3 Sempre à vista (a resposta sem abrir nada)

- **Na pasta do grupo** (a barra de manilha do Mural, do Kanban e do Quadro livre, ao lado da
  engrenagem): uma etiqueta de papel com as fotos de quem está (até 3, sobrepostas) e a frase curta:
  "Com Ana e mais 2", "Público", "Público · com Ana", "De Ana · você edita", "De Ana · você só lê". Tocar
  abre a engrenagem na parte Compartilhar. **Só aparece quando o grupo não é só seu** (compartilhado,
  público ou de outra pessoa): o estado de sempre não ganha marca (regra do dono: estado raro não ganha
  ícone em lugar nobre). A aba do grupo não ganha ícone pelo mesmo motivo.
- **No editor e na leitura da anotação**, a etiqueta Quem vê diz o efetivo e de onde veio:
  "Pública · pelo grupo Trabalho", "Com Ana · pelo grupo".
- **Na Lista e no Mais** (as linhas de grupos), a mesma frase curta em lápis no fim da linha.
- **Quem só lê** vê, no lugar dos botões de editar, a etiqueta "Você só lê este grupo" (nunca botões
  que não funcionam).

### 4.4 Os avisos (as palavras do dono, e os que faltam no mesmo tom)

Todos pela `Confirm` de sempre (`ui/confirm.ts`), com o número de verdade:

1. **Tornar o grupo público, com privadas dentro** (o pedido):
   "Há 7 anotações privadas neste grupo (no mural e no Kanban). Torná-lo público vai deixá-las públicas,
   sem ir para o Feed. Tem certeza?" · **Tornar público** / Cancelar. Com Desfazer no aviso de baixo.
2. **Pôr uma privada num grupo público** (o pedido), em todo caminho que muda o grupo de uma anotação:
   o editor (Grupo), a coluna do Kanban (Buscar nota, Nova nota não precisa: ela nasce Disponível), mover
   em massa, mover de pasta entre grupos, o widget Nota que cria, a API das AIs (o pedido fica esperando
   o "sim" no aparelho). "Esta anotação privada vai para o grupo Trabalho, que é público: ela vai ficar
   pública (sem ir para o Feed). Tem certeza?" Em massa: "3 das 10 anotações são privadas…".
3. **Chamar a primeira pessoa num grupo com privadas** (P1, se a resposta for A): "Há 7 anotações
   privadas neste grupo. Ana vai poder vê-las (e editá-las, como Editor). Chamar mesmo assim?"
4. **Pôr uma anotação num grupo compartilhado**: "O grupo Trabalho está com Ana e Bruno: eles vão ver
   esta anotação." (só quando ela tem menos gente do que o grupo).
5. **Tornar o grupo só de quem está, de novo**: "As 42 anotações continuam públicas (Disponíveis). Quer
   torná-las privadas também?" · **Tornar privadas** / Deixar como estão. (Sem isso, voltar atrás
   deixaria a pessoa achando que fechou tudo.)
6. **Parar de compartilhar o grupo**: "Ana e Bruno deixam de ver o grupo Trabalho. As 12 anotações que
   eles escreveram ficam no grupo, só com você." (P4) · **Parar de compartilhar** / Cancelar.
7. **Sair do grupo** (quem não é o dono): "Você escreveu 5 anotações neste grupo. Elas ficam no grupo,
   com Ana, e saem do seu mural." · **Sair do grupo** / Cancelar.

### 4.5 Quem recebe

- Aviso em Amigos › Avisos, como o da anotação: "Ana compartilhou o grupo Trabalho com você", que abre o
  grupo.
- O grupo aparece **como uma aba do mural** dela (e no Kanban e no Quadro livre), na ordem dela, com o
  ícone e a cor que o dono deu. Se ela já tem um grupo com esse nome, a aba diz o dono: "Trabalho · Ana".
- A pasta mostra a etiqueta "De Ana · você edita" (4.3), e a engrenagem tem a parte Compartilhar (só
  olhando, para quem não gere) com **Sair do grupo**.
- O que é de cada um continua de cada um: fixar, a vista, a ordem, o "Mostrar também", o padrão de
  "só no Kanban" de cada aba.

### 4.6 Quem visita (o público) e o link

- No mural de quem visita, o grupo público é uma aba como as outras, com **Mural · Kanban · Quadro
  livre** (a fileira que a visita já tem para Mural · Flashcards · Quadro livre).
- O link: `/comparar/mural/<grupo>[/kanban]?mural=CODIGO` (o `?mural=` de sempre, que abre o mural de
  qualquer um, logado ou não), copiado por **Copiar o link** na peça.
- O Kanban da visita é **a mesma peça do Kanban do dono**, só lendo (regra "Visita: as mesmas peças do
  dono" do CLAUDE.md): para isso o quadro sai da página (`pages/kanban-page.ts`, 1.521 linhas) para uma
  peça (`ui/kanban-board.ts`) que lê por uma fonte (`KANBAN_SOURCE`, como o `STUDY_SOURCE`) e recebe o
  que é do dono por entradas (`editable`, `ownerMenu`). Arrastar, as setas e os menus de editar nem
  existem na visita.
- O público do grupo vem **da nuvem**, não do aparelho do dono (como o quadro livre público): uma
  edição de Ana aparece para quem visita sem esperar o site do dono abrir.

### 4.7 Os casos de borda (e a resposta de cada um)

- **Anotação colada (widget Nota) num grupo ou quadro compartilhado**, de uma anotação que a pessoa não
  vê: aparece sem o título, como já aparece no público ("Anotação que você não vê"). A peça Quem vê do
  quadro avisa: "4 anotações coladas neste quadro não estão com Ana", com **Compartilhar com as mesmas
  pessoas**.
- **Dependência do Kanban** numa anotação de fora do grupo que a pessoa não vê: conta no progresso, sem o
  título.
- **Mudar uma anotação de grupo** num grupo dos outros: só um Gestor ou o dono tira do grupo (o que se
  escreve num grupo é do grupo, P4); ela sai do grupo para todos e vai para o dono do grupo, sem grupo.
  O Editor que quer uma cópia só dele usa Copiar (o "Fazer uma cópia" de sempre).
- **Anotação já compartilhada sozinha** que entra num grupo compartilhado: as pessoas dela ficam (somam).
- **Duas pessoas mexendo no mesmo Kanban**: junta cartão a cartão (o mexido por último vence, como entre
  dois aparelhos hoje, `mergeBoards`); o texto das anotações junta como no git (como hoje).
- **Sem rede**: tudo espera e sobe depois, como a anotação compartilhada.
- **Conta apagada**: o dono apagado leva o grupo e tudo o que está nele (é dele, P4); um membro apagado
  sai, e o que ele escreveu fica no grupo.
- **Sair da conta**: o que veio dos grupos compartilhados mora no IndexedDB da conta e sai na limpeza
  (`wipeBrowser`), como as compartilhadas.

---

## 5. Por dentro

### 5.1 Na nuvem (API, migração 0025)

- `grupos`: `id`, `dono_id`, `rev`, `versao`, `dados` (JSON: o nome, o ícone e a cor, as pastas, as cores
  das tags, as colunas e os cartões do Kanban), `publico`, `criado_em`, `atualizado_em`, `atualizado_por`.
  O servidor guarda o JSON aberto (como `notas.dados`) para servir o público e contar o que precisa;
  juntar é com o site (`mergeBoards`, `mergeFields`).
- `grupo_membros`: igual a `nota_membros` (papel, quem chamou, desde).
- `notas.grupo_id` (nulo): a anotação de um grupo compartilhado mora em `notas`, como a compartilhada,
  e ganha todo o maquinário de hoje (rev, junção, conflito, imagens, comentários). O acesso a uma
  anotação passa a ser: dona, ou membro dela, **ou membro do grupo dela** (vale o papel mais aberto).
  O limite de 500 por pessoa conta só as compartilhadas soltas; as de grupo têm o limite do grupo (2.000).
  A anotação de grupo é do dono do grupo (`dono_id`), e `notas.criado_por` guarda quem a escreveu (P3, P4).
- Rotas (feitas na rodada 2, `routes/groups.ts`): `GET /v1/eu/grupos` (id, versão e papel),
  `GET /v1/eu/grupos/detalhes`, `POST /v1/grupos` (o documento e, se quiser, as pessoas e o público),
  `PUT /v1/grupos/:id` (o documento e o público, com `base` e 409 como a anotação),
  `PUT/DELETE /v1/grupos/:id/membros/:codigo`, `DELETE /v1/grupos/:id` (parar de compartilhar). As
  anotações entram com `POST /v1/notas` e o `grupo` (uma a uma, como a compartilhada; o site manda em
  sequência), e mudam de lugar com `PUT /v1/notas/:id/grupo`. Público: `GET /v1/murais/:codigo/grupos` e
  `/grupos/:id` (o documento e as anotações, em páginas de 200, com a versão `grupo.soma` e o 204).
- Sem contador novo no GET do mural: o site já confere `GET /v1/eu/notas` a cada minuto (as anotações dos
  grupos vêm nela) e confere `GET /v1/eu/grupos` junto (só id, versão e papel).
- Imagens: quem está no grupo vê as imagens das anotações dele (`inNoteSql`); as do grupo público vão para
  todos.
- Comentários: numa anotação de grupo, quem está no grupo comenta e recebe os avisos (como na
  compartilhada). No público, a anotação do grupo entra nas fichas à mostra do dono pelo envio do mural
  (rodada 5), como as outras.
- Quadros livres com pessoas (`quadro_membros`, `quadros.grupo_id`): migração própria na rodada 6.
- Avisos: atividade `compartilhou-grupo` (um por pessoa e grupo).

### 5.2 No site

- `core/shared-groups.ts` (puro: o documento do grupo, saneamento, junção, papéis) e
  `core/shared-groups-store.ts` (o serviço: IndexedDB por conta, sincroniza como o `SharedStore`).
  Banco/chave novos entram em `wipeBrowser` e em `browser-reset.spec.ts`.
- As anotações do grupo entram pelo `SharedStore` (já sabe baixar, juntar, subir e resolver conflito);
  o que muda é o `Personal`: numa anotação de grupo, o grupo, a pasta e as tags são **do grupo** (não de
  cada um, como na compartilhada solta); só fixar continua de cada um.
- O grupo compartilhado tem um id (`grupo_id`); na tela, o nome é o que o dono deu (com "· Ana" na
  colisão). O `KanbanStore` pega o quadro de um grupo compartilhado do documento do grupo, não do mural
  privado; as pastas e as cores das tags também.
- O público montado no aparelho (`CloudSync.push`) **deixa de fora** os grupos compartilhados (quem os
  serve é a nuvem), para não aparecerem duas vezes; o `fichas` à mostra os inclui. Sobe `PUBLIC_RULES`.
- A visita (`ColleagueStore`, `VisitView`) ganha os grupos públicos da nuvem; `MURAL_READER` sobe.
- Peças: `ui/access-panel.ts` (Quem vê), `ui/access-tag.ts` (a etiqueta da pasta), `ui/kanban-board.ts`
  (o quadro, montado pela página do dono e pela visita). Tudo o que é grande entra por `@defer`.
- `scripts/visita-mesmas-pecas.test.mjs`: o Kanban entra em `PECAS`/`VISITA`/`SO_LEEM`.

### 5.3 Contas e números

`SYNC_SCHEMA` sobe (o grupo compartilhado no lugar da anotação, o Kanban fora do privado para esses
grupos), `PUBLIC_RULES` sobe (o push deixa os grupos de fora), `MURAL_READER` sobe (a visita lê grupos).
Custo: só D1 e Workers do plano grátis; cada grupo pesa como suas anotações compartilhadas.

---

## 6. As rodadas (uma por vez, cada uma com /code-review mid antes da próxima)

Cada rodada: Impeccable (`craft-floor.md` antes de editar a tela), testes novos, a suíte inteira e os de
Node, `npx ng build`, a build de produção aberta com dados, fotos 2x no computador e no celular,
Novidades, BUILD + 1, commit e push.

1. **Quem vê (a frase)**. `core/access.ts` (a frase-resumo, pura) no topo da folha Compartilhar, na
   linha da leitura e na etiqueta Quem vê do editor; Só quem está / Público na folha. Sem dado novo. A
   peça `ui/access-panel.ts` sai da folha na rodada 3, quando o grupo for o segundo a usá-la (separar
   antes seria adivinhar o que o grupo precisa). *Pronto quando*: a folha da anotação diz em uma linha quem vê, em todos os
   estados, e os testes da folha de hoje passam.
2. **A nuvem dos grupos** (só API). Migração 0025, rotas, permissões da tabela 3.2 no servidor, acesso
   das anotações pelo grupo, imagens, comentários, avisos, público. *Pronto quando*: os testes de Node
   cobrem cada linha da tabela de papéis e o público só sai com `publico = 1`.
3. **Compartilhar um grupo com pessoas**. A parte Compartilhar da engrenagem, `SharedGroupsStore`, as
   anotações do grupo indo para a nuvem, quem recebe (aviso, aba, "· Ana"), a etiqueta da pasta, os
   avisos 3, 4 e 6, Sair do grupo. *Pronto quando*: duas contas (nuvem simulada) veem e editam o mesmo
   mural do grupo, cada papel só pode o que a tabela diz.
4. **O Kanban compartilhado**. O quadro da página vira a peça `ui/kanban-board.ts` com `KANBAN_SOURCE`;
   o quadro do grupo compartilhado mora no documento do grupo, com junção cartão a cartão; quem só lê não
   arrasta. *Pronto quando*: duas contas mexem no mesmo Kanban e as duas mexidas ficam.
5. **O grupo público**. O recorte Público, os avisos 1, 2 e 5 com a conversão das privadas em Disponível,
   o público servido pela nuvem, a visita com Mural · Kanban · Quadro livre do grupo, Copiar o link.
   *Pronto quando*: alguém sem conta abre o link e lê o mural e o Kanban do grupo, sem nada que edite, e
   uma edição de um membro aparece para ele sem o dono abrir o site.
6. **Quadros livres compartilhados**. Pessoas num quadro solto, o Compartilhar no topo do quadro, os
   quadros do grupo seguindo o grupo, o aviso das anotações coladas que as pessoas não veem.
7. **Fechamento**. Crítica do Impeccable de tudo (duas avaliações isoladas), o que ela achar, DESIGN.md e
   PRODUCT.md, e o /code-review high com os consertos.

## 7. Decisões

### 7.1 Decidi (com o porquê)

- **D1.** O Kanban se compartilha pelo grupo, nunca sozinho (3.1): o quadro já é o grupo, e um Kanban
  público com o mural privado mostraria as mesmas anotações por um caminho e esconderia pelo outro.
- **D2.** Os papéis continuam Leitor, Editor e Gestor (os que o dono já usa), com o verbo ao lado.
- **D3.** Herança: vale o mais aberto, e a tela diz de onde veio (3.4). Nenhuma anotação fica "mais
  fechada que o grupo".
- **D4.** Grupo público nunca vai ao Feed; as privadas viram Disponíveis (o pedido) e, ao fechar o grupo
  de novo, a pergunta 4.4.5 deixa escolher se voltam a ser privadas.
- **D5.** O público do grupo é servido pela nuvem, não pelo aparelho do dono (uma edição de um membro
  aparece na hora).
- **D6.** A etiqueta de acesso fica só na pasta, e só quando o grupo não é só seu; a aba não ganha ícone.
- **D7.** Num grupo compartilhado, o grupo, a pasta e as tags da anotação são do grupo; só fixar, a
  vista e a ordem são de cada um.
- **D8.** Colisão de nome: "Trabalho · Ana" (o primeiro nome do dono).
- **D9.** Fora do escopo: baralhos (os Flashcards do grupo continuam com o Público deles), resenhas com
  pessoas, a API das AIs e o MCP para grupos (ficam lendo os grupos como hoje leem as anotações do
  dono), transferir o dono.

### 7.2 Respostas do dono (11/nov)

- **P1. Privadas num grupo compartilhado com pessoas: quem está no grupo vê todas.** "Privada" = só
  quem está; ao chamar, o aviso 4.4.3 com o número de privadas.
- **P2. Os quadros livres vão junto com o grupo** (compartilhado ou público): o grupo fica igual para
  todos. Um quadro solto (de um grupo só seu) tem o próprio Compartilhar.
- **P3. O Editor apaga só as anotações que criou**; o Gestor e o dono apagam qualquer uma.
- **P4. O que a pessoa escreveu fica só no grupo.** Quem sai (ou é tirado) perde o acesso, inclusive às
  que escreveu: elas passam a ser do dono do grupo (`notas.dono_id` vira o dele, na mesma gravação que
  tira a pessoa). Quando o dono para de compartilhar, tudo o que está no grupo fica com ele, como um
  grupo só dele. O aviso de Sair diz isso com o número: "Você escreveu 5 anotações neste grupo. Elas
  ficam no grupo, com Ana, e saem do seu mural."

## 8. Andamento

- [x] Rodada 1 — Quem vê (BUILD 853)
- [x] Rodada 2 — A nuvem dos grupos (BUILD 854)
- [x] Rodada 3 — Compartilhar um grupo com pessoas (BUILD 855). Ficou para a rodada 4, com o documento do grupo: o nome, o desenho, a cor, as pastas e as tags do grupo (renomear um grupo compartilhado ainda não chega aos outros), e tirar uma anotação do grupo pela tela
- [x] Rodada 4 — O Kanban compartilhado (BUILD 856): o quadro no documento do grupo (junção cartão a cartão, a mexida que espera sobe depois de recarregar, parar de compartilhar devolve o quadro), as tags do grupo, renomear para todos. A peça `ui/kanban-board.ts` para a visita fica para a rodada 5, quando ela tiver o segundo uso. Ficaram de fora: as pastas do grupo (cada um tem as suas) e as cores das tags do grupo; renomear muda o id do quadro (o último aberto volta a outro)
- [x] Rodada 5 — O grupo público. 5a (BUILD 857): o Público na parte Compartilhar com os avisos 4.4.1, 4.4.2 e 4.4.5 e a conversão das privadas, o público servido pela nuvem e o mural do grupo na visita (core/visit-groups.ts), o link `?mural=…&grupo=…`, as fichas à mostra no envio do dono (PUBLIC_RULES 7). 5b (BUILD 858): o Kanban do grupo na visita (`ui/visit-kanban.ts`, seção Kanban), montando as peças do dono: as abas de grupo, a etiqueta da coluna (saiu da página para `ui/kanban-column-head.ts`, que o palco da aba Kanban do editor também usa agora) e o cartão. Arrastar e adicionar são do dono e ficam na página. Ficou de fora: as dependências e as cores das tags no cartão da visita vêm do mural de quem visita
- [ ] Rodada 6 — Quadros livres compartilhados
- [ ] Rodada 7 — Fechamento
