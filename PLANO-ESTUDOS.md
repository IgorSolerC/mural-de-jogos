# Plano: Estudos, flashcards sobre as anotações

Pedido do usuário (02/nov/2026), na tarefa "Nova aba 'estudos' no mural de anotações" do quadro Dev
Murall: "Essa tarefa visa fazer todo o planejamento necessário para que em uma outra tarefa as seguintes
coisas sejam feitas. [...] Mover a aba 'CALENDÁRIO' para UTILIDADES [...] Gosto muito da ferramenta ANKI
para criar flashcards e estudar, quero fazer algo semelhante no MURALL. [...] Pense MUITO bem em como
implementar isso tudo de forma que não polua muito o que já existe e funciona bem e que seja intuitivo e
BONITO". As necessidades estão na seção 1; as três imagens que vieram com o pedido (duas referências da
internet e as tentativas dele, a terceira) moram na nota do quadro.

Este arquivo é o plano inteiro, escrito para ser lido também por outras AIs (como o PLANO-API.md e o
PLANO-IMAGENS.md). Nada foi implementado; o site não muda. As decisões do usuário estão na seção 9 (todas
tomadas em 02/nov); as rodadas, na seção 10.

---

## 0. Resumo em uma página

- **Duas mudanças de lugar.** O Calendário sai das Anotações e vai para as Utilidades (Gastos ·
  Calendário · Cofre). Os Estudos entram como a terceira seção das Anotações, no lugar dele (Mural ·
  Kanban · Estudos), porque são um terceiro jeito de ver as mesmas anotações, como o Kanban (D1, decidida
  pelo usuário em 02/nov: "Nas Anotações").
- **A carta é a anotação.** Uma anotação vira flashcard quando ganha uma **frente**: o título
  (vazio, vale o nome da anotação), um subtítulo e uma imagem. O **verso** (a resposta) é a própria anotação, inteira, como
  se lê no mural. Nada é copiado: mudou a anotação, mudou a resposta. A frente e o progresso moram fora
  da anotação, como o Kanban guarda o lugar dela no quadro (`core/study.ts`, à parte).
- **Baralhos, não tags.** As cartas se juntam em **baralhos** ("Kanjis simples", "Verbos", "Locais"), uma
  palavra nova que só existe nos Estudos. Uma carta pode estar em vários baralhos, com um progresso só.
  Tags e grupos continuam sendo do mural, sem mudar de sentido (seção 3).
- **Três lugares, como o Kanban.** Uma anotação pode estar só no mural, só nos Estudos, nos dois, ou no
  mural, no Kanban e nos Estudos ao mesmo tempo. A escolha mora na carta ("No mural"), com o padrão no
  baralho, igual ao "Só no Kanban" (seção 4.4).
- **O algoritmo é o do Anki de hoje: FSRS-6** (o algoritmo novo do Anki, na versão da 25.07), com os 21 parâmetros
  padrão, retenção desejada de 90%, passos de 1 e 10 minutos, e só dois botões: **Errei** (Again) e
  **Acertei** (Good). Embaixo de cada botão, quando a carta volta ("10 min", "3 dias") (seção 5).
- **Cada carta tem o seu boletim:** quantas vezes foi vista, acertos e erros, quando volta, a chance de
  lembrar agora e o nível: **Desconhecida, Nova, Aprendendo, Dominada** (seção 5.6).
- **Estudar é um botão.** Cada baralho tem o seu "Estudar", e o topo dos Estudos tem **Estudar tudo**: as
  revisões vencidas de todos os baralhos mais as novas do dia, na medida que cada baralho permite
  ("novas por dia", nas configurações dos Estudos, baralho a baralho).
- **A cara é a da papelaria.** A carta é uma cartolina clara com um fio colorido recuado, na cor da
  cartolina da anotação (a ideia da terceira imagem); o baralho é uma pilha dessas cartas com um
  elástico; a sessão é uma mesa com a carta no meio, que vira (seção 6).
- **Nada do que existe muda de jeito.** O editor ganha uma aba (Anotação · Cartolina · **Flashcard**), a
  leitura ganha uma linha no lugar que já mostra o Kanban e o Calendário, o Filtrar ganha "Só nos
  Estudos". O resto fica como está.
- **Regra do logout:** tudo mora em `meu-mural:estudos:v1` (a limpeza já leva o prefixo) e no mural
  privado da nuvem, parte `estudos`; nunca no público (seção 4.6).
- **Por partes,** em 7 rodadas, a primeira só a mudança do Calendário (seção 10).

---

## 1. O que o pedido quer (as necessidades, na ordem dele)

1. Usar anotações que já existem como o verso de flashcards. Uma aba de estudos na edição da anotação,
   normalmente vazia, que recebe a frente: título (obrigatório no pedido; depois, opcional: D8), subtítulo/descrição e imagem.
2. Agrupar as cartas em grupos de estudo, sem confundir com as tags que a pessoa já usa e sem que cada
   tag vire um grupo. "Quero que seja intuitivo e NÃO SEJA CONFUSO."
3. Ver as cartas de um grupo juntas, abrir, ver a resposta, editar, como no mural; a capa da carta,
   nos Estudos, é a frente dela.
4. Como no Kanban: só nos Estudos, só no mural, nos dois, ou nos três.
5. Dar "play" num grupo e estudar: revelar o verso e responder Acertei ou Errei.
6. Guardar por carta o quão bem ela está aprendida, com o algoritmo do Anki decidindo quando ela volta.
7. Ver o boletim da carta: vezes vista, acertos e erros, tempo até a próxima revisão, nível geral
   (Desconhecida, Nova, Aprendendo, Dominada).
8. Um botão de revisão geral de tudo o que vence, com as novas na medida certa, e um menu de
   configurações (como o do Mural e do Kanban) com quantas novas por dia em cada grupo.
9. Não poluir, ser bonito, manter o artesanal, não reinventar a roda, usar o Impeccable no começo e no
   fim e rodar o `/code-review high` ao terminar.

---

## 2. O que pesa no desenho (como o Murall é hoje)

- **O Kanban já resolveu metade disto.** Os quadros (`core/kanban.ts`, `core/kanban-store.ts`) guardam,
  fora da anotação, onde cada uma está (`KanbanCard.note` é o id), a escolha "No mural"
  (`KanbanCard.wall` + `CategoryPrefs.kanbanOnly`), a junção entre aparelhos cartão a cartão e o mural
  privado da nuvem (`kanban`). Os Estudos copiam esse jeito: `StudyCard.note` é o id da anotação, a frente
  e o progresso ficam em `meu-mural:estudos:v1` e na parte `estudos` do mural privado.
- **As seções das Anotações vêm de `shared/topo-do-murall.ts`** (`SECOES_DAS_ANOTACOES`,
  `SECOES_DAS_UTILIDADES`), que o topo do cofre também lê. Mexer ali muda o topo do cofre, que só vai
  para o ar quando o dono roda o "Publicar o cofre" (o classificador não deixa a AI disparar).
- **O Calendário depende das Anotações em poucos lugares:** a rota (`app.routes.ts`, com o guarda
  `enterNotes`), `CALENDAR_PATH` (`core/areas.ts`, usado em `core/reminder-links.ts`, `app.ts` e
  `ui/site-header.ts`), o caminho escrito à mão em `ui/review-reader.ts` (`'/anotacoes/calendario'`, na
  linha do Calendário da leitura), a barra (`ui/area-bar.ts`: o logo do carimbo de data e a contagem
  "N lembretes hoje", procurados em `NOTE_SECTIONS` com a parte `anotacoes`) e o editor aberto pelo
  "Escrever uma nota nova" do lembrete, que precisa abrir no mural de anotações (hoje o guarda põe
  `Mural.kind` em anotações). A API, o MCP e o Google Agenda não usam o caminho.
- **O editor já tem abas** (`ui/review-editor.html`, `.modos`: Anotação e Cartolina; `EditorMode` em
  `review-editor.ts`) e a fileira de propriedades (`.prop`). A aba Cartolina tem o palco com a ficha viva
  à direita: o mesmo arranjo serve para a frente da carta.
- **A engrenagem é uma só.** O Kanban abre a mesma `app-mural-config` do mural com `[board]`, e as partes
  são uma lista (`SECTIONS` em `ui/mural-config.ts`). Coisa nova de configuração entra como parte dela.
- **As imagens coladas** (`murall://imagem/ID`, `core/image-store.ts`) só ficam na nuvem se o mural as
  usa: `cloud-sync.ts` manda `imagens.usadas = localImageIds(privado + público)`; o resto sai em 30 dias.
  Como a parte `estudos` vai dentro do mural privado, a imagem da frente conta como usada sem código
  novo. Ajustes › Imagens (`settings-page.ts`, que lista as imagens por anotação) precisa listar as das
  frentes também.
- **"Estudos" já é um nome.** É o segundo grupo padrão das anotações (`DEFAULT_CATEGORIES`) e uma
  categoria dos Gastos. A seção nova se chama Estudos mesmo (o pedido diz assim, e a seção vive na barra,
  longe das abas dos grupos), mas os grupos de cartas não podem se chamar "grupo" (seção 3).
- **Orçamento:** o pacote inicial tem teto de 3 MB; tudo dos Estudos chega em pedaços à parte (a página
  pela rota, a aba do editor e a sessão por `@defer`), e o algoritmo é puro e pequeno (~4 kB).

---

## 3. As palavras (para não confundir)

| Palavra | O que é | Onde aparece |
| --- | --- | --- |
| **Estudos** | A seção nova das Anotações (`/anotacoes/estudos`) | Na barra, ao lado de Mural e Kanban |
| **Carta** | Uma anotação com frente | Nos baralhos, na sessão, na aba Flashcard |
| **Frente** | O que se vê antes de virar: título, subtítulo, imagem | Só nos Estudos e na aba Flashcard |
| **Verso** | A anotação inteira, a resposta | Na sessão, depois de virar; no mural, como sempre |
| **Baralho** | Um monte de cartas estudadas juntas | Só nos Estudos e na aba Flashcard |

**Por que baralho, e não tags nem grupos.** As tags e os grupos já querem dizer outra coisa: o grupo
decide a aba do mural, o quadro do Kanban e quem vê; as tags são etiquetas livres, várias por anotação.
Fazer os baralhos de tags obrigaria a dizer quais tags são baralhos e quais não (o medo do pedido), e
toda tag nova viraria baralho sem a pessoa querer. "Baralho" é a palavra do Anki ("deck") em
português, diz sozinha que é um monte de cartas, e não existe em nenhum outro lugar do Murall. Uma carta
pode estar em **vários** baralhos (D3), e o progresso dela é **um só**: respondida num baralho, vale em
todos, e ela não volta no mesmo dia por estar também noutro. Pôr e tirar de baralhos é na aba Flashcard
ou na folha da carta.
Um baralho não depende do grupo da anotação: "Kanjis simples" pode juntar anotações do grupo Estudos e
do grupo Japonês. Sem sub-baralhos (seção 8).

Na tela, nunca "deck", "card", "flashcard" solto no meio de frase: Carta, Baralho, Frente. A única
exceção é o nome da aba do editor, **Flashcard**, porque "Carta" sozinha numa aba ao lado de "Cartolina"
leria como outra coisa (D2).

---

## 4. Os dados

### 4.1 O modelo (`core/study.ts`, puro, sem Angular)

```ts
interface StudyState {
  decks: Deck[];
  cards: StudyCard[];          // uma por anotação, pelo id dela
  removed: Record<string, string>; // 'deck:ID' e 'card:NOTA' → quando (a junção não traz de volta)
  today: StudyDay;             // o que já entrou hoje (para o limite de novas)
  config: StudyConfig;
}

interface Deck {
  id: string;                  // newId()
  name: string;                // até 40 letras, como o nome da coluna do Kanban
  icon: ColumnIcon | null;     // a cartela única (shared/cartela-de-icones.ts)
  color: LightStock;           // uma das nove cartolinas claras
  newPerDay: number;           // 0–999, padrão 5 (D6)
  wall?: true;                 // as cartas aparecem no mural também (sem o campo: só nos Estudos)
  order: number;               // a ordem das abas
  at: string;
}

interface StudyCard {
  note: string;                // o id da anotação
  decks: string[];             // 1 a 20 baralhos; o progresso é um só para todos (D3)
  front: { title?: string; subtitle?: string; image?: string }; // título até 80 (sem ele, o nome da anotação; D8), subtítulo até 160
  wall?: boolean;              // como KanbanCard.wall: false só nos Estudos, true no mural também, sem campo segue os baralhos
  srs: Srs;
  stats: { seen: number; right: number; wrong: number; marks: string }; // marks: as 20 últimas, '1' acertou, '0' errou
  added: string;               // quando virou carta (a ordem das novas)
  at: string;                  // a última mudança (na junção, a mais nova vence)
}

interface Srs {
  state: 'nova' | 'aprendendo' | 'revisao' | 'reaprendendo';
  step: number;                // o passo de aprendizado em que está
  s: number;                   // estabilidade (dias), 0 na nova
  d: number;                   // dificuldade (1–10), 0 na nova
  due: string;                 // ISO: quando volta (na nova, o `added`)
  last: string | null;         // a última resposta
  reps: number;                // quantas respostas (a semente do sorteio do intervalo)
}

interface StudyDay { day: string /* AAAA-MM-DD do dia de estudo */; news: Record<string, number>; reviews: number; at: string }
interface StudyConfig { retention: number /* 0.8–0.95, padrão 0.9 */; maxReviews: number /* padrão 200 */; newOrder: 'entrada' | 'sorteio'; at: string }
```

- Tetos: 100 baralhos, 5.000 cartas, a imagem só `murall://imagem/ID` ou `https://`. `sanitizeStudy`
  como `sanitizeKanban` (o que vem guardado ou da nuvem passa por ele; campo desconhecido sai).
- **A anotação apagada** some dos Estudos pelo mesmo caminho do Kanban (`liveCards`: a carta cuja
  anotação não existe não aparece nem entra na fila). Desfazer o apagar traz a carta de volta com o
  progresso.
- **Compartilhadas** podem virar carta (D12): a frente e o progresso são só seus, como o grupo e as
  tags de cada um nelas. Saindo da compartilhada, a carta some com a anotação.

### 4.2 O serviço (`core/study-store.ts`)

Como `KanbanStore`: o sinal `state`, `changedAt` para a sincronização, `writeJson` de `core/storage.ts`
(que respeita `freezeStorage`), `onOtherTab` para as outras abas, a leitura no construtor (nunca no nível
do módulo: a limpeza roda depois dos imports). Ações: `addCard(note, deck, front, wall?)`,
`updateFront`, `setDecks(note, decks)`, `setWall`, `removeCard` (com o que volta no Desfazer),
`resetCard`, `answer(note, ok, now)` (devolve o de antes, para o Desfazer da sessão), `addDeck`,
`updateDeck`, `moveDeck`, `removeDeck` (as cartas saem dele; a que não fica em nenhum outro sai dos
Estudos e volta ao mural; tudo com Desfazer), `setConfig`. Sinais
prontos para as telas: `cardsByNote`, `deckCounts` (novas / aprendendo / revisar de hoje, por baralho),
`studyOnly` (as anotações fora do mural por causa dos Estudos, seção 4.4).

Uma carta nova pedida de dentro de um baralho ("Nova carta") vai como o `KanbanSpot`: `pending` com o
baralho; ao salvar a anotação, `claim` põe a carta lá (o editor já abre na aba Flashcard).

### 4.3 A nuvem

- Parte `estudos` do mural privado (a sincronização por partes de 18/out), juntada como o Calendário:
  **carta a carta e baralho a baralho, a mudança mais nova vence**, apagados lembrados em `removed`;
  `today` junta pelo maior número de cada baralho no mesmo dia; `config` pelo `at`.
- Responder a mesma carta em dois aparelhos sem internet ao mesmo tempo perde uma das respostas (vale a
  mais nova). É raro e o custo é uma revisão a mais ou a menos; guardar cada resposta e refazer a conta
  custaria um registro que cresce sem fim (D10).
- `SYNC_SCHEMA` sobe (um site antigo jogaria a parte fora ao enviar). `localHasContent` conta as cartas e
  os baralhos (o de ninguém pergunta antes de ir para a conta).
- Nunca no mural público, na visita, no perfil ou no Feed: os Estudos são só seus, mesmo com a anotação
  pública. Fora do backup em arquivo, como o Kanban e o Calendário (D9).
- A API e o MCP não leem os Estudos nesta leva (seção 8); uma rodada futura do PLANO-API pode pôr uma
  área `estudos` de leitura.

### 4.4 Onde a anotação aparece (o voto de cada lugar)

Hoje a anotação sai do mural quando está no quadro do grupo e o cartão (ou o grupo) diz "só no Kanban"
(`onWall`). Com os Estudos, cada lugar que tem a anotação **vota**:

- O Kanban vota pelo `onWall` de hoje; os Estudos votam por `card.wall`, ou, sem ele, "no mural" se **algum** dos baralhos
  da carta pede o mural (senão, só nos Estudos).
- **A anotação aparece no mural se nenhum lugar a tem, ou se algum lugar diz "no mural também".** Só sai
  do mural quando todos os lugares que a têm dizem "só aqui".
- Saindo do último baralho (ou dos Estudos), ela volta ao mural sozinha, como ao sair do quadro: nunca fica sem
  lugar.

**O padrão** é por baralho, "Só nos Estudos" (como o "Só no Kanban" é o padrão de todo grupo), porque um
baralho de 300 kanjis encheria o mural. **Mas nada some sem a pessoa mandar** (D4): a anotação que já
estava no mural, quando ganha a frente, guarda `wall: true` (continua onde estava) e o bilhete diz
"Agora também nos Estudos". A carta nascida dentro dos Estudos ("Nova carta", "Trazer anotações" não
conta: essas já existiam) segue o baralho. A linha "No mural" da aba Flashcard e da folha da carta muda
isso a qualquer hora.

`KanbanStore.boardOnly` e o novo `StudyStore.studyOnly` se juntam num só "fora do mural" que o mural lê
(hoje ele lê só o do Kanban).

### 4.5 As imagens da frente

A imagem entra pelos caminhos que já existem na folha do widget de imagem: colar no campo, "Escolher do
aparelho" (encolhida a 900 px por `core/images.ts`, guardada no IndexedDB) ou um link `https://`. Ela vai
para a nuvem pela fila de sempre (`ImageSync`) e conta como usada porque mora no mural privado. Ajustes ›
Imagens lista "Frente da carta: 日" ao lado das anotações que usam cada imagem.

### 4.6 A regra do logout (CLAUDE.md)

- `meu-mural:estudos:v1` começa com o prefixo: `wipeBrowser` já leva. Teste novo em
  `core/browser-reset.spec.ts` mostrando que a chave sai na limpeza.
- Nada em IndexedDB, Cache Storage ou cookie novo (as imagens usam o banco que já está na lista).
- Os Estudos de uma conta nunca se juntam com os de outra; os de ninguém só vão para a conta se a pessoa
  escolher (o `localHasContent` acima).
- A última vista aberta (aba do baralho, ordem) vai em `meu-mural:estudos-vista:v1`, pelo `writeJson`.

---

## 5. O algoritmo (o do Anki: FSRS-6)

O Anki usou só uma variação do SM-2 até a 23.10, quando o FSRS chegou como a opção nova (que o manual
recomenda); a 25.07 trouxe o FSRS-6, a versão de hoje. O FSRS guarda em cada carta a **estabilidade** S (em quantos dias a chance de lembrar cai de
100% para 90%) e a **dificuldade** D (1 a 10), e calcula a **chance de lembrar** R no dia da revisão. O
Murall usa os parâmetros padrão (sem o otimizador do Anki, que treina com o histórico de cada pessoa:
seção 8). Fonte: o código do py-fsrs, a biblioteca de referência do FSRS (ver Fontes).

### 5.1 Os parâmetros padrão

`w = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]`

### 5.2 As contas (`core/fsrs.ts`, puro)

As notas do FSRS são 1 (Again), 2 (Hard), 3 (Good), 4 (Easy). Com dois botões: **Errei = 1, Acertei =
3** (o costume de quem usa o Anki só com dois botões; D11).

- `DECAY = -w20`; `FACTOR = 0.9^(1/DECAY) - 1`.
- Chance de lembrar depois de t dias: `R(t, S) = (1 + FACTOR · t / S)^DECAY`.
- Intervalo para a retenção desejada r: `I(S, r) = round((S / FACTOR) · (r^(1/DECAY) - 1))`, no mínimo 1
  dia e no máximo 36.500.
- Primeira resposta: `S0(G) = w[G-1]` (≥ 0,001); `D0(G) = w4 - e^(w5·(G-1)) + 1`, entre 1 e 10.
- Dificuldade depois de cada resposta: `ΔD = -w6 · (G - 3)`; `D' = D + (10 - D) · ΔD / 9`; volta para a
  média: `D'' = w7 · D0(4) + (1 - w7) · D'` (o D0(4) sem limitar), entre 1 e 10.
- Acertou (G ≥ 2), revisão de outro dia: `S' = S · (1 + e^w8 · (11 - D) · S^(-w9) · (e^((1-R)·w10) - 1)
  · hard · easy)`, com `hard = w15` se G = 2 e `easy = w16` se G = 4 (senão 1).
- Errou numa revisão de outro dia: `S'f = w11 · D^(-w12) · ((S+1)^w13 - 1) · e^((1-R)·w14)`;
  `S' = min(S'f, S / e^(w17·w18))`, ≥ 0,001.
- Resposta no mesmo dia (passos de aprendizado): `inc = e^(w17 · (G - 3 + w18)) · S^(-w19)`; se G ≥ 2,
  `inc = max(inc, 1)`; `S' = S · inc`.
- Sorteio do intervalo (o "fuzz" do Anki, para as cartas do mesmo dia não voltarem todas juntas): só a
  partir de 2,5 dias, ±15% até 7 dias, ±10% até 20, ±5% depois, nunca menos de 2 dias. A semente é o id
  da anotação com `reps` (o mesmo resultado em todo aparelho e nos testes).

Os testes conferem `core/fsrs.ts` contra uma tabela tirada do py-fsrs (uma sequência de respostas e os S,
D e intervalos esperados, com o sorteio desligado).

### 5.3 Os passos (como o Anki)

- **Nova** → a primeira resposta a põe em **aprendendo**, passos de **1 min e 10 min** (o padrão do
  Anki e do py-fsrs). Acertei anda um passo; depois do último, a carta **se forma** e volta em `I(S, r)`
  dias. Errei volta ao primeiro passo.
- **Revisão** → Acertei calcula o novo S e o próximo intervalo; Errei é um **lapso**: o novo S do
  esquecimento e um passo de **reaprendendo** de 10 min; acertando, volta a revisão em `I(S, r)`.
- O dia de estudo vira às **4h** da manhã (o padrão do Anki): estudar à meia-noite e meia ainda conta
  como o dia de antes. Cartas em revisão vencem por dia (venceu se o dia dela é hoje ou antes); as em
  aprendizado, pela hora exata.

### 5.4 A fila do dia (`core/study-queue.ts`, puro)

- Por baralho (a carta entra na fila de cada baralho em que está): as **aprendendo/reaprendendo** já vencidas; as **revisões** vencidas, da que venceu há
  mais tempo para a mais nova (desempate sorteado pela semente do dia); e as **novas**, na ordem em que
  entraram (ou sorteadas, pela escolha `newOrder` das configurações), até o que sobra de `newPerDay` hoje (`today.news`).
- Revisões: no máximo `maxReviews` por dia (200, o padrão do Anki), somando os baralhos.
- Ordem na sessão (a do Anki): primeiro a aprendendo que venceu; depois revisões e novas intercaladas
  (uma nova a cada `revisões ÷ novas`, para as novas não ficarem todas no fim).
- Errou, a carta volta à fila daqui a 1 ou 10 min. Sem mais nada para mostrar, a carta em aprendizado que
  vence nos próximos **20 min** aparece antes (o "aprender adiantado" do Anki); depois disso, a sessão
  termina dizendo quando ela volta.
- **Estudar tudo** junta as filas de todos os baralhos com o limite de cada um, na ordem das abas, e a
  carta que está em dois baralhos aparece **uma vez**. A nova conta no limite do primeiro baralho dela (na
  ordem das abas) que ainda tem vaga hoje; estudando um baralho só, conta no dele.
- Respondida num baralho, a carta sai da fila dos outros (o progresso é um só).
- Os números que a tela mostra (na pilha, na aba, no topo) são os mesmos da fila: o que entraria se a
  pessoa apertasse Estudar agora.

### 5.5 Tempo até a próxima revisão (`intervalLabel`, em `core/dates.ts`)

Curto, em palavras: "1 min", "10 min", "3 h", "1 dia", "12 dias", "3 sem" (de 21 a 59 dias, só se for
redondo; senão dias), "2 meses", "1,5 ano". Relativo, na leitura e no boletim: "agora", "daqui a 8 min",
"amanhã", "em 3 dias", "em 2 meses". Embaixo dos botões da sessão, o intervalo que cada resposta daria.

### 5.6 O nível da carta (D5)

As quatro palavras do pedido, na ordem dele, ligadas aos estados do Anki:

| Nível | Quando | Anki |
| --- | --- | --- |
| **Desconhecida** | Nunca respondida | New |
| **Nova** | Nos passos de hoje (1 e 10 min), antes de se formar | Learning |
| **Aprendendo** | Formada, com intervalo de menos de 21 dias, ou reaprendendo depois de errar | Young, Relearning |
| **Dominada** | Intervalo de 21 dias ou mais | Mature |

21 dias é o corte do Anki entre carta "jovem" e "madura". O boletim mostra também a **chance de lembrar
agora** (o R do FSRS, "87%"), que é o número que mais diz sobre o quanto a carta está aprendida.

---

## 6. As telas

Planejado com o Impeccable (`shape`), sem rodada de escolha: a estrutura é minha, dentro do mundo que o
DESIGN.md já fixa (a parede de eucatex, as cartolinas, a papelaria, a tinta preta, o amarelo de estado).
Modo de cada superfície: **Operate** (montar baralhos, editar a frente, configurar) e, na sessão,
**Experience** (a carta é a coisa; a interface some).

### 6.0 O resumo do Impeccable (o brief)

- **Quem chega e para quê.** O dono, de noite ou no intervalo, quer limpar as revisões do dia em
  poucos minutos, quase sempre no celular; de vez em quando, no computador, monta um baralho a partir de
  anotações que já tem. Sucesso: abrir, ver "18 para hoje", apertar Estudar e acabar sem pensar na
  ferramenta.
- **O que é só daqui.** A resposta é uma anotação de verdade, com widgets, tabelas, imagens e links;
  a carta é feita de papel, na cor da cartolina dela. Nenhum Anki tem isso.
- **A direção.** A carta é o objeto que se repete em tudo (o logo, a pilha, a parede, a sessão, a
  prévia da aba): uma ficha clara com o fio colorido recuado. Virar a carta é o momento principal.
- **Fora de propósito:** cara de app de estudo (barras de progresso, gamificação, sequência de dias,
  confete), cores de tema pronto, gráficos que ninguém pediu.
- **Ninguém inventa:** as palavras da seção 3, os níveis da 5.6, as teclas da 6.7, os números da 9.

### 6.1 A carta (o objeto)

- **Papel:** a cartolina clara (`--papel-ficha`, com o grão), cantos de 10px, a sombra curta das
  fichas deitadas. Proporção de carta de baralho, **5:7**, em pé.
- **O fio:** a ideia da terceira imagem, refinada: uma linha de **3px** a **9px** da beirada, cantos de
  6px, **na cor da cartolina da anotação** (a clara dela; a escura usa a própria tinta escura; a branca e
  a cinza, `ink` a 40%, para não sumir no creme). O fio é impresso, reto, sem tremido: a carta é limpa
  para ler; o artesanal mora no papel, na sombra e na inclinação da carta na parede.
- **A frente:** o título no centro (sem título próprio, o nome da anotação), com **o tamanho da letra
  calculado para encher o espaço que sobra** (pedido do usuário: "A ideia é sempre ocupar uma
  quantidade semelhante de espaço", e "O mesmo vale para se a nota tiver descrição ou imagem (ou
  ambos) [...] para que o flashcard nunca pareça vazio"). Não são degraus fixos: um caractere só (um
  kanji, um símbolo) fica enorme; uma palavra, grande; uma frase de duas linhas, menor; e o título
  sozinho cresce mais do que o título com subtítulo, que cresce mais do que o com imagem. Como
  (`ui/fit-title.ts`, puro de medir): a área do título é o que sobra dentro do fio depois do subtítulo e
  da imagem; a letra é a maior que cabe nessa área, achada por busca binária no tamanho (medindo a
  largura e a altura do texto com `text-wrap: balance`, até quatro linhas, sem quebrar palavra no meio),
  entre 1,1rem e 40% da altura da carta, refeita quando a carta muda de tamanho (`ResizeObserver`, uma
  medida por quadro) e quando a letra manuscrita termina de chegar (`document.fonts`). O mesmo cálculo
  em todo lugar onde a frente aparece (a parede, a pilha, a sessão, o palco do editor, o logo não), então
  a carta pequena e a grande ficam com a mesma cara, só em escala. **A carta serve para estudar qualquer
  coisa, não só idiomas** (pedido do usuário), então a letra é escrita à mão em tudo (D13): o alfabeto
  latino em **Permanent Marker**; japonês e chinês em **Klee One** (manuscrita, OFL, auto-hospedada pela
  Fontsource em fatias por `unicode-range`: o navegador só baixa os pedaços dos caracteres que
  aparecem, e só quando uma carta os mostra); as outras escritas (grego, cirílico, árabe…) na fonte do
  sistema, no mesmo tamanho. O subtítulo em **Kalam**, `ink-2`, embaixo, até duas linhas. A imagem
  entre os dois, colada reta com a borda branca e a sombra curta das imagens coladas (`glued-media`),
  até 45% da altura (o que ela não usa vai para o título). Título, imagem e subtítulo ficam juntos no
  meio da carta, nunca grudados nas pontas com um vão no meio.
- **A margem** (os 9px fora do fio) carrega, só na parede do baralho, uma linha impressa em caps de
  rótulo a 0,6rem no pé: o nível e quando volta ("APRENDENDO · EM 3 DIAS"). Na sessão, a margem fica
  vazia.
- **O verso** (só na sessão, depois de virar): o mesmo papel e o mesmo fio; dentro, o nome da anotação
  em Permanent Marker e o texto dela formatado (`app-rich-text`, com os widgets, como na leitura),
  rolando por dentro quando é comprido. No alto do verso, a frente pequena (o título a 1rem e a
  miniatura da imagem), para comparar o que se pensou com a resposta.

### 6.2 O lugar: a seção Estudos

- `/anotacoes/estudos` e `/anotacoes/estudos/:baralho`; a barra das Anotações fica **Mural · Kanban ·
  Estudos**. A contagem da barra: "18 cartas para hoje" (curta: "18 hoje"); sem nada vencendo,
  "Tudo em dia".
- **O logo da seção** (`ui/section-logos.ts`, 52px como todos): duas cartas em leque, a de trás
  inclinada, a da frente com o fio na cor amarela e "Estudos" em Permanent Marker no meio, e um
  canto da de trás aparecendo com um "?" a lápis. O próprio objeto da seção, como o quadro branco do
  Kanban e o carimbo do Calendário.
- **O botão do topo** vira **Nova carta** nos Estudos (escreve no baralho aberto; em Tudo, a aba
  Flashcard abre com o último baralho usado escolhido).
- **As divisórias de manilha** (as `.divisorias` globais, as mesmas abas dos quadros do Kanban e das
  vistas do Calendário): **Tudo** primeiro, depois um baralho por aba (ícone + nome em marcador + quantas
  vencem hoje, num disco de papel), e a orelha tracejada a giz "+ Novo baralho" no fim. Muitas abas usam o
  "Mais" de feltro que as abas dos grupos já têm (`ui/tab-more.ts`).
- **A pasta** (`.pasta` global) embaixo das abas leva: a busca com fita ("Procurar nas cartas…"), Filtrar
  (níveis), a ordem, a engrenagem; e, em destaque, a linha de estudo (6.3).

### 6.3 Tudo: os baralhos como pilhas

- No topo da pasta, a **linha de estudo de tudo**: "**18** para hoje" em Barlow Condensed 800 itálico (o
  número grande, como o saldo dos Gastos), embaixo os três montes em caps de rótulo com o selo de cada
  nível ("● 5 novas · ● 3 aprendendo · ● 10 revisões"), e o botão de tinta **Estudar tudo** (Play, 48px,
  o botão principal da página). Sem nada vencendo: "Tudo em dia. A próxima revisão é amanhã (12
  cartas)." em Kalam, e o botão vira contorno "Estudar adiantado" (só as que vencem amanhã; seção 8 diz
  o que fica de fora do adiantado do Anki).
- **Cada baralho é uma pilha** na parede: de 1 a 4 cartas uma sobre a outra (tanto mais grossa quanto
  mais cartas, deslocadas 2px e giradas de leve), a de cima com o fio na **cor do baralho**, o ícone e o
  nome do baralho em marcador, e **um elástico** em volta (uma faixa de 6px na cor da cartolina do
  baralho, um pouco mais escura, com o brilho de borracha e o vinco onde dobra na beirada). Preso no
  elástico, um papelzinho com os três números (o selo de cada nível e o número em tinta preta: a regra
  da tinta única), e o botão redondo de tinta **Estudar** (Play, 44px) no canto. A pilha sem nada
  vencendo fica com o papelzinho "em dia" e o botão em contorno.
- Tocar a pilha abre a aba do baralho; tocar Estudar começa a sessão dele.
- Grade de pilhas: 4 por fileira no largo, 2 no celular; a pilha se inclina como as fichas da Visão
  geral (0,3 da inclinação do mural) e se endireita no hover.

### 6.4 Um baralho: a parede das cartas

- Linha de estudo do baralho no topo da pasta (a mesma da 6.3, com **Estudar** e os três números), e à
  direita **Nova carta** (papel) e **Trazer anotações** (papel: o seletor de fichas que já existe,
  `ui/card-picker.ts`, só com anotações e sem as que já são carta; cada escolhida entra sem título
  próprio, com o nome da anotação na frente, que se muda depois).
- **As cartas deitadas na parede**, a frente à mostra: do tamanho das fichas da Visão geral
  (`clamp(150px, …, 216px)` de largura, 5:7), 6 por fileira na tela cheia, 2 no celular, inclinação
  pequena, a margem com o nível e quando volta. A carta finalizada no mural continua carta (finalizar é
  coisa do mural).
- **Tocar a carta abre a leitura da anotação** (a resposta, a leitura de sempre, com o Editar e tudo),
  com a linha do flashcard (6.9). Ctrl/⌘+clique marca, como no mural (para "Pôr noutro baralho", "Tirar
  deste baralho" e "Tirar dos Estudos" de várias; seção 10, rodada 4).
- **A etiqueta de preço** redonda no canto (o mesmo botão de 44px das fichas do Kanban) abre a **folha da
  carta** (6.6).
- Ordem: Próxima revisão (padrão), Nível, Entrada, A–Z, com o sentido em palavras como nas outras
  ordens. Filtrar: os quatro níveis (adesivos com X, a folha de filtros que já existe).
- **Vazio:** a parede com três contornos tracejados a giz em forma de carta e, no primeiro, "Nenhuma
  carta ainda" em Kalam com Nova carta e Trazer anotações.

### 6.5 A aba Flashcard do editor

- Terceira aba: **Anotação · Cartolina · Flashcard** (só nas anotações, nunca nas resenhas). O pontinho
  de marca das abas do estojo quando a anotação já é carta.
- **Vazia** (o normal): à direita, a carta em contorno tracejado; à esquerda, uma linha em Kalam ("Dê uma
  frente a esta anotação para estudar com ela.") e o botão de papel **Criar a frente**, que abre os campos
  com o título vazio mostrando, a lápis, o nome da anotação: vazio, é ele que vai na frente; escrever
  troca (D8).
- **Com frente:** à esquerda as linhas do jeito do Kanban (`props-linha`: o nome à esquerda em caps de
  rótulo com o ícone, o valor à direita, o fio tracejado entre elas):
  - **Frente:** Título (o campo de papel em Permanent Marker; vazio, o nome da anotação), Subtítulo (Kalam), Imagem
    (Colar, Escolher do aparelho, Link; com imagem, a miniatura e Trocar / Tirar).
  - **Baralhos:** um adesivo por baralho em que a carta está (o ícone e o nome, na cor do baralho, com
    o X), como o seletor de tags, e "+ Baralho" abrindo a lista dos outros com "Novo baralho…" no fim
    (nome em linha, a cor sorteada entre as que ainda não têm baralho). Pelo menos um.
  - **No mural:** o interruptor de papel do Kanban, com "Aparece no mural também" (`ink-2`) ou "Só nos
    Estudos" (tinta cheia).
  - **Boletim:** só depois da primeira resposta (6.8), compacto; e no pé, "Recomeçar o progresso" e
    "Deixar de ser carta" (o botão vermelho de papel, com a pergunta e o Desfazer).
- À direita (embaixo, no celular), o **palco**: a carta viva, a frente mudando enquanto se escreve, e
  um "Virar" pequeno para ver o verso como vai aparecer na sessão.
- Tudo é guardado ao **Salvar** a anotação, como a parte Kanban; título vazio com o resto preenchido é o
  erro de campo de sempre ("A frente precisa de um título.") e a aba abre sozinha.
- A carta nova feita nos Estudos, que fica só nos Estudos, não pergunta grupo nem tag ao salvar (as
  perguntas servem ao mural, e ela não vai para lá).

### 6.6 A folha da carta (`ui/study-card-sheet.ts`)

A mesma ficha de diálogo da folha do Kanban (`kanban-card-sheet`, 620px, faixa na cartolina da
anotação, "Carta do baralho Kanjis simples"): as linhas Baralho, No mural e o Boletim; no pé, "Tirar dos
Estudos" (vermelho) e "Ler a anotação" e "Editar a frente" (abre o editor na aba Flashcard). Tudo vale na
hora, como na folha do Kanban.

### 6.7 A sessão de estudo (`ui/study-session.ts`, por `@defer`)

- **A mesa:** um `<dialog>` de tela cheia sobre o véu da parede (o `veil` que já existe). No alto, uma
  linha só: X (**Parar**, 44px), o nome do baralho (ou "Tudo") em marcador, e os três números do que
  falta, com os selos (o número de quem está na vez sublinhado a lápis, como o Anki sublinha). Nada de
  barra de progresso.
- **A carta no meio**, grande: 360×504 no computador (até 44vh de altura útil para o título), a largura
  da tela menos 16px de cada lado e até 62vh no celular, reta.
- **Antes de virar:** embaixo, um só botão de papel largo, **Mostrar a resposta** (Espaço ou Enter).
- **Virar:** a carta gira no eixo vertical (rotateY, 420ms, a curva física de `core/motion.ts`), a
  frente de um lado e o verso do outro (`backface-visibility`). Com movimento reduzido, a frente some e o
  verso aparece (opacidade, 120ms). O verso pode ser maior que a frente: a carta cresce até a altura da
  tela menos a linha de cima e a dos botões, e rola por dentro.
- **Depois de virar:** dois botões, metade cada, 56px de altura (na zona do polegar no celular, presos
  ao pé):
  - **Errei** — papel com o X e um risco vermelho (`red-deep`) no pé; embaixo, a lápis, quando a carta
    volta ("1 min").
  - **Acertei** — tinta, com o ✓; embaixo, a lápis, "3 dias".
  - Teclas: **1** Errei, **2** Acertei, e **Espaço** é Acertei depois de virar (o costume do Anki).
- **Desfazer** (Z, Ctrl/⌘+Z, e o bilhete que aparece por 4 s depois de cada resposta) volta a carta de
  antes, o progresso e os números, quantas vezes for preciso dentro da sessão.
- Cada resposta é guardada na hora (`StudyStore.answer`): parar no meio não perde nada.
- **O fim** ("Por hoje, é isso."): uma ficha com quantas foram vistas, quantas acertou (e a porcentagem),
  o tempo da sessão, e quando é a próxima ("Amanhã: 14 revisões"); com carta em aprendizado voltando
  depois dos 20 min, "3 cartas voltam em 25 min". Botões **Voltar aos baralhos** e, se outro baralho
  ainda tem o que estudar, **Estudar tudo**.
- Sem som, sem confete, sem sequência de dias.

### 6.8 O boletim da carta

Na aba Flashcard, na folha da carta e (resumido) na leitura. Linhas curtas:

- O **nível** como selo impresso da família das etiquetas de status (tinta de cada nível, o nome em
  caps: Desconhecida em contorno tracejado a lápis, Nova azul `#1f4fc4`, Aprendendo laranja `#b24a06`,
  Dominada verde `#0d6b3c`, as tintas que o Kanban e os Gastos já usam; as cores do Anki para novas,
  aprendendo e revisões, na papelaria). O mesmo selo pequeno nos três números das pilhas e da sessão.
- **Próxima revisão:** "em 3 dias" (e a data, em caps de rótulo, "05 NOV").
- **Vista 14 vezes · acertou 11 · errou 3.**
- **Chance de lembrar agora: 87%.**
- **As últimas respostas** como riscos de contagem a lápis: ✓ e ✗ pequenos numa fileira (as 20 últimas,
  da mais antiga à mais nova).

### 6.9 No mural e na leitura

- **Leitura:** a linha `.lugares` (onde já moram a coluna do Kanban e o lembrete mais perto) ganha a
  carta: o ícone do baralho, o nome, o selo do nível e "revisão em 3 dias"; tocar abre a folha da
  carta.
- **Mural:** na folha Filtrar, linha "Mostrar também", ao lado de "Só no Kanban": **Só nos Estudos N**;
  ligado, o adesivo "Com as dos Estudos" depois do picote, e as espiadas usam a etiqueta de tinta
  "Só nos Estudos" no canto (a mesma da "Só no Kanban"). O vazio "Tudo no Kanban" ganha o irmão "Tudo nos
  Estudos" com "Abrir os Estudos". Tudo como o "Só no Kanban" faz hoje, sem nenhum lugar novo.
- **Menu da anotação** (o bilhete do clique direito, 01/nov): "Estudar com ela…" (abre o editor na aba
  Flashcard) quando ainda não é carta; "Ver a carta" quando já é.

### 6.10 As configurações dos Estudos

A engrenagem da pasta dos Estudos abre a **mesma** `app-mural-config` (como o Kanban), com o título
"Configurações dos estudos" e só as partes dos Estudos (a lista `SECTIONS` ganha `estudo` e `baralhos`,
filtradas como a parte Quadro):

- **Estudo:** "Quanto lembrar" (a retenção desejada) como a tira de segmentos do Padrões: 80% · 85% ·
  **90%** · 95%, com o sentido escrito em cima ("Lembra 9 de cada 10. Mais alto, mais revisões por
  dia."); "Revisões por dia, no máximo" (campo de número, 200); "Ordem das novas": Na ordem em que
  entraram · Sorteadas.
- **Baralhos:** uma linha por baralho, como a parte Grupos (a alça para arrastar a ordem, o ícone e o
  nome, o resumo "10 novas por dia · No mural também" no marca-texto quando difere do padrão, a divisa
  para abrir). Aberto: **Novas por dia** (o campo de número com − e +; 0 para não entrar nenhuma nova),
  **Cartas no mural** (Só nos Estudos · No mural também), ícone e cor (o `app-category-style [bare]` que
  os grupos usam), Renomear, e "Apagar o baralho" (com a pergunta e o Desfazer; as cartas saem dele,
  e a que não está em nenhum outro sai dos Estudos e volta ao mural).

### 6.11 Primeira vez

Sem baralho nenhum, a página mostra o que o Kanban mostra no primeiro quadro: uma cartolina verde
"Monte o seu primeiro baralho" (Kalam, o campo do nome, tinta "Criar o baralho") ao lado de três cartas
em contorno tracejado a giz. Criado o baralho, a parede vazia da 6.4.

### 6.12 Celular, teclado e acessibilidade

- Toda a página em uma coluna abaixo de 600px; pilhas e cartas 2 por fileira; a linha de estudo no topo,
  com Estudar ocupando a largura.
- Alvos de 44px; a sessão inteira pelo teclado (6.7), o foco na carta ao abrir e nos botões depois de
  virar; `aria-live` educado anunciando "Resposta" ao virar e "Volta em 3 dias" depois de responder.
- A carta é um `article` com o título da frente como nome; o verso entra no fluxo de leitura só depois
  de virar (`inert` antes), para o leitor de tela não ler a resposta.
- Movimento reduzido: sem giro, sem inclinação animada.

---

## 7. A mudança do Calendário para as Utilidades

Pequena e à parte (rodada 0), para não misturar com os Estudos:

- `shared/topo-do-murall.ts`: `SECOES_DAS_ANOTACOES` = Mural, Kanban (os Estudos entram na rodada 3);
  `SECOES_DAS_UTILIDADES` = Gastos, Calendário. O cofre vem depois, como hoje: **Gastos · Calendário ·
  Cofre**.
- Rota `/utilidades/calendario`; `/anotacoes/calendario` redireciona para lá **com a query** (`vista`,
  `dia`, `lembrete`: links antigos e o que já está nos favoritos). `CALENDAR_PATH` muda; o caminho escrito
  à mão em `review-reader.ts` passa a usar `CALENDAR_PATH`.
- `ui/area-bar.ts`: o logo do carimbo de data e a contagem "N lembretes hoje" passam a ser procurados nas
  Utilidades; `ui/site-header.ts` continua mostrando "Novo lembrete" (o `onCalendar` lê o caminho novo).
- Sem o guarda `enterNotes`, o "Escrever uma nota nova" e o "Anexar nota" da folha do lembrete abrem o
  editor **no mural de anotações** de propósito (o editor recebe o tipo, sem depender do mural aberto).
- A última vista do Calendário (`meu-mural:calendario-vista…`) continua valendo.
- O topo do cofre muda junto (ele lê as mesmas listas): depois do push, o dono roda o "Publicar o cofre".
- Testes: `core/areas.spec.ts` (o caminho, a parte, o redirecionamento com a query), `area-bar.spec.ts`
  (o logo e a contagem nas Utilidades, a varredura de 288 a 1384px com três abas nas Utilidades),
  `site-header.spec.ts` (o botão), `reminder-links.spec.ts` e o teste da linha do Calendário na leitura.
- Novidades: M4 (o mesmo Calendário, noutro lugar).

---

## 8. O que fica de fora (de propósito)

- **Os outros botões do Anki** (Difícil e Fácil). O pedido quer dois; o FSRS funciona bem com dois.
- **O otimizador do FSRS** (treinar os 21 parâmetros com o histórico da pessoa): pede guardar cada
  resposta e uma conta pesada; com os parâmetros padrão o FSRS já é melhor que o SM-2. Pode vir depois,
  se o histórico for guardado.
- **Cartas invertidas, cloze (lacunas), tipos de nota do Anki, sub-baralhos.** Uma carta, uma frente, um
  verso.
- **Suspender e enterrar cartas, adiar o baralho, estudo personalizado** (o "Custom Study" do Anki).
  "Estudar adiantado" (6.3) cobre o caso mais comum.
- **Importar ou exportar do Anki (.apkg).** Formato grande (SQLite + mídia); seria uma rodada só dele.
- **Estatísticas e gráficos do baralho** (o calendário de revisões, a curva de retenção). O boletim por
  carta e os números do dia bastam agora.
- **Notificação fora do site** ("hora de revisar"), como o Calendário.
- **A API e o MCP** (ver e responder pelos conectores): uma rodada futura do PLANO-API.
- **Os Estudos de outra pessoa** (na visita, no perfil, compartilhar baralho).

---

## 9. Decisões

Todas decididas pelo usuário em 02/nov/2026 (a D1 numa pergunta, as outras numa rodada só de perguntas).

| # | Pergunta | Decidido | Outras |
| --- | --- | --- | --- |
| D1 | Onde moram os Estudos | **Nas Anotações, no lugar do Calendário** (Mural · Kanban · Estudos) | Nas Utilidades |
| D2 | O nome da aba do editor | **Flashcard** | Estudo; Frente |
| D3 | Uma carta em quantos baralhos | **Vários, com um progresso só para a carta** (respondida num, vale em todos e não volta no mesmo dia por estar noutro) | Um só (o recomendado); um progresso por baralho |
| D4 | O padrão de "No mural" | **Por baralho, "Só nos Estudos"**, mas a anotação que já estava no mural continua lá (nada some sem mandar) | "No mural também" por padrão; seguir o baralho sempre |
| D5 | Os quatro níveis | **Desconhecida = nunca respondida; Nova = nos passos de hoje; Aprendendo = menos de 21 dias; Dominada = 21 dias ou mais** (seção 5.6) | Desconhecida = errou a última vez |
| D6 | Novas por dia, padrão de cada baralho | **5** (resposta do usuário) | 20 (o padrão do Anki, o recomendado); 10 |
| D7 | Retenção desejada | **90%**, mudável nas configurações (80–95%) | Fixa em 90% |
| D8 | O título da frente | **Opcional: vazio, vale o nome da anotação; dá para escrever outro** (resposta do usuário: "Usa o nome da nota se o TÍTULO do flashcard estiver vazio, mas é possível sobrescrever") | Nascer com o nome selecionado; nascer vazio e obrigatório |
| D9 | Backup em arquivo | **Fora**, como o Kanban e o Calendário (a nuvem guarda) | Dentro do backup |
| D10 | Responder a mesma carta em dois aparelhos sem internet | **Vale a resposta mais nova** | Guardar cada resposta e refazer a conta |
| D11 | Os dois botões no FSRS | **Errei = Again (1), Acertei = Good (3)**; teclas 1, 2 e Espaço | Teclas ← e → |
| D12 | Anotação compartilhada vira carta | **Sim** (a frente e o progresso só seus) | Não |
| D13 | A letra da frente | **Manuscrita, para qualquer assunto**: Permanent Marker no alfabeto latino, Klee One (em fatias) no japonês e no chinês, a do sistema nas outras escritas. O usuário: "quero que o flashcard seja usado para aprender QUALQUER coisa, nao só japones, então não use apenas fonte de kanji" | A do sistema para os kanjis (o recomendado) |

--- | --- | --- | --- |
| D1 | Onde moram os Estudos | **Nas Anotações, no lugar do Calendário** (Mural · Kanban · Estudos). **Decidido pelo usuário: "Nas Anotações"** | Nas Utilidades, ao lado do Calendário (o que o texto diz ao pé da letra: Gastos · Calendário · Estudos · Cofre) |
| D2 | O nome da aba do editor | **Flashcard** | Estudo; Frente |
| D3 | Uma carta em quantos baralhos | **Um só**, como no Anki | Vários (a carta estudada uma vez por baralho) |
| D4 | O padrão de "No mural" | **Por baralho, "Só nos Estudos"**, mas a anotação que já estava no mural continua lá (nada some sem mandar) | "No mural também" por padrão; seguir o baralho sempre, inclusive nas que já existiam |
| D5 | Os quatro níveis | **Desconhecida = nunca respondida; Nova = nos passos de hoje; Aprendendo = menos de 21 dias; Dominada = 21 dias ou mais** (seção 5.6) | Desconhecida = errou a última vez; Nova = nunca vista |
| D6 | Novas por dia, padrão de cada baralho | **20** (o padrão do Anki) | 10 |
| D7 | Retenção desejada | **90%**, mudável nas configurações (80–95%) | Fixa em 90% |
| D8 | A frente nasce com | **O nome da anotação, selecionado** (escreve-se por cima) | Vazia |
| D9 | Backup em arquivo | **Fora**, como o Kanban e o Calendário (a nuvem guarda) | Dentro do backup |
| D10 | Responder a mesma carta em dois aparelhos sem internet | **Vale a resposta mais nova** | Guardar cada resposta e refazer a conta (registro que cresce) |
| D11 | Os dois botões no FSRS | **Errei = Again (1), Acertei = Good (3)**; teclas 1, 2 e Espaço | Teclas ← e → |
| D12 | Anotação compartilhada vira carta | **Sim** (a frente e o progresso só seus) | Não |
| D13 | Letra dos kanjis na frente | **A do sistema** (Yu Gothic, Hiragino, Noto Sans CJK), sem baixar nada | Klee One (manuscrita japonesa, OFL) auto-hospedada em fatias por `unicode-range` |

---

## 10. Rodadas

Uma coisa de cada vez. Cada rodada é um commit (com a BUILD; com as Novidades quando muda o que se vê),
com push, e em cada uma com tela: o Impeccable (`craft-floor.md` antes de editar, o revisor com as fotos a
2x na build de produção, no computador e no celular), `npm run test:ci`, `npx ng build` (o orçamento),
o roteiro do puppeteer na build de produção, e o `/code-review high` no fim, com os achados corrigidos.

0. **O Calendário nas Utilidades** (seção 7). Sozinha, pequena. Novidades M4. O dono publica o cofre.
1. **O núcleo, sem tela.** `core/fsrs.ts` (as contas, conferidas contra a tabela do py-fsrs),
   `core/study.ts` (modelo, `sanitizeStudy`, as mudanças, `mergeStudy`), `core/study-queue.ts` (a fila do
   dia, os limites, o dia que vira às 4h, o aprender adiantado), `intervalLabel`. Só testes.
2. **Guardar e sincronizar.** `core/study-store.ts`, a parte `estudos` do mural privado, `SYNC_SCHEMA`,
   `localHasContent`, o teste do logout em `browser-reset.spec.ts`. Sem tela nova. (O voto do mural e
   Ajustes › Imagens foram para a rodada 4: o voto mexe em tudo o que lê `boardOnly`, inclusive o mural
   público e a API, e só faz diferença quando dá para criar uma carta.)
3. **A seção Estudos.** Rota, a barra (Mural · Kanban · Estudos), o logo, as divisórias, a página Tudo
   com as pilhas, a aba do baralho com a parede de cartas, criar/renomear/apagar baralho, a primeira vez
   e os vazios, a carta (6.1) como componente (`ui/study-card.ts`, usado em tudo). Novidades: a entrada
   F2 (parte nova com conteúdo próprio) nasce aqui; as rodadas 4 a 6 somam itens nela se forem do mesmo
   dia, ou viram a entrada de ajustes do dia, pela regra do NOVIDADES.md.
4. **A frente.** A aba Flashcard no editor, a folha da carta, Nova carta e Trazer anotações, a linha da
   leitura, o voto do mural (4.4) com o Kanban (`StudyStore.votes` junto de `KanbanStore.boardOnly`, em
   todo lugar que lê o "fora do mural": a parede, o mural público, o perfil, a API; `kanban-wall.spec.ts`
   continua passando), o Filtrar e a etiqueta "Só nos Estudos" do mural, Ajustes › Imagens com as
   frentes, o menu da anotação, marcar várias e mover.
5. **Estudar.** A sessão (6.7) do baralho e Estudar tudo, o giro, as teclas, o Desfazer, o fim.
6. **Boletim e configurações.** O boletim (6.8) nos três lugares, a engrenagem com as partes Estudo e
   Baralhos (6.10), "Estudar adiantado". DESIGN.md (as seções novas, derivadas do que foi feito) e
   PRODUCT.md (a capacidade nova).

### Testes que cada rodada deixa

- `core/fsrs.spec.ts`: a tabela do py-fsrs; R e o intervalo para 80/90/95%; os limites (D de 1 a 10, S
  mínimo, 1 a 36.500 dias); o sorteio igual com a mesma semente e dentro da faixa.
- `core/study.spec.ts`: sanear (campo estranho, teto, imagem que não é murall:// nem https), as mudanças,
  a junção (a mais nova vence, apagado não volta, o dia junta pelo maior), o nível de cada estado.
- `core/study-queue.spec.ts`: a carta em dois baralhos uma vez só em Estudar tudo e fora da fila do outro
  depois de respondida, a nova contando no limite do baralho certo, a ordem, o limite de novas por baralho e o global de revisões, o dia às 4h,
  o aprender adiantado de 20 min, Estudar tudo, as contagens iguais à fila.
- `ui/fit-title.spec.ts`: o título enche o espaço (o texto ocupa uma parte parecida da área em todos os
  casos: um caractere, uma palavra, uma frase de duas linhas; só título, com subtítulo, com imagem, com os
  dois), um caractere maior que uma palavra e uma palavra maior que uma frase, nada saindo do fio nem
  palavra quebrada no meio, o mesmo resultado em escala na carta pequena e na grande, e de novo depois de
  a letra chegar.
- `core/study-wall.spec.ts`: o voto (nenhum lugar, só Kanban, só Estudos, os dois, cada combinação de
  "no mural"), a anotação que já existia guardando `wall: true`, sair do baralho voltando ao mural.
- `core/browser-reset.spec.ts`: `meu-mural:estudos:v1` e `meu-mural:estudos-vista:v1` saem na limpeza.
- `cloud-sync.spec.ts`: a ida e a volta da parte, `localHasContent`, a imagem da frente em `usadas`.
- Telas: a página (pilhas, parede, vazios, a varredura de 288 a 1384px sem nada saindo nem encostando), a
  aba Flashcard (criar a frente, título vazio usando o nome da anotação, pôr e tirar baralhos, baralho
  novo, salvar e descartar), a folha da carta,
  a sessão (virar pelo teclado, Errei volta em 1 min, Acertei forma depois do último passo, Desfazer, o
  fim, `inert` no verso antes de virar, movimento reduzido), as configurações.

---

## 11. A conferir (riscos)

- **O tamanho do mural privado** com milhares de cartas (umas 250 bytes por carta: 5.000 cartas são
  ~1,2 MB antes do gzip). Medir o envio com 3.000 cartas no e2e da rodada 2 e, se pesar, mandar a parte
  só quando ela muda (a sincronização por partes já faz isso).
- **O voto do mural** mexe no que decide o que aparece no mural de anotações: o "Só no Kanban" de hoje
  tem de ficar idêntico (os testes de `kanban-wall` são a guarda).
- **O giro da carta** com um verso alto e widgets pesados (tabela, código): medir no celular; se travar,
  virar com a frente sumindo e o verso aparecendo em vez do giro 3D.
- **Relógio do aparelho errado** muda o dia e os vencimentos; o Anki tem o mesmo problema. Nada a fazer
  além de usar o relógio do aparelho com cuidado (nunca futuro na junção: um `at` adiante de agora + 1 dia
  é tratado como agora, como o Calendário já faz).
- **"Estudos" duas vezes** (a seção e o grupo padrão): conferir nas fotos se alguém pode confundir a
  aba do grupo com a seção; se sim, o logo e a barra já separam, e o grupo pode ser renomeado pela pessoa.
- **O topo do cofre** só muda quando o dono publica: até lá, o cofre mostra Calendário nas Anotações.

---

## 12. Andamento

- 02/nov/2026: plano escrito (decisões D1–D13 esperando o usuário). Nada implementado.
- 02/nov/2026: D1 decidida pelo usuário: os Estudos moram nas Anotações (Mural · Kanban · Estudos).
- 02/nov/2026: D2–D13 decididas pelo usuário (seção 9). Mudaram o desenho: vários baralhos por carta com
  um progresso só (D3), 5 novas por dia (D6), o título da frente opcional (D8) e a letra manuscrita para
  qualquer assunto, com a Klee One no japonês e no chinês (D13). Pedido junto: o título da frente com
  o tamanho da letra calculado para encher o espaço que sobra, com ou sem subtítulo e imagem (6.1). Plano
  pronto para a rodada 0.
- 02/nov/2026, rodada 0 (cd041276, BUILD 705, com push): o Calendário nas Utilidades, `/anotacoes/calendario`
  redirecionando com a query (`toCalendar`: o `redirectTo` com o caminho escrito jogava a query fora). O
  topo do cofre muda junto: falta o dono rodar o "Publicar o cofre" (até lá a Vigia acusa a diferença).
- 02/nov/2026, rodada 1 (BUILD 706): o núcleo, sem tela. `core/fsrs.ts` (as contas, os passos e o
  sorteio, conferidos contra uma tabela tirada do py-fsrs em `fsrs.spec.ts`: sete sequências, estado,
  passo, S, D e vencimento iguais), `core/study.ts` (modelo, saneamento, mudanças, junção, níveis e as
  palavras de "quando volta": `intervalLabel` e `whenLabel` moram aqui, e não em `core/dates.ts`, porque
  dependem do dia de estudo do FSRS) e `core/study-queue.ts` (a fila do dia, os limites, as novas
  espalhadas, `nextUp` da sessão). Decidido no caminho: no mesmo dia, o número de novas de dois aparelhos
  junta pelo maior (somar contaria duas vezes a cada sincronização). Próximo: a rodada 2 (guardar e
  sincronizar).
- 02/nov/2026, rodada 2 (BUILD 707): `core/study-store.ts` (`meu-mural:estudos:v1`, as mudanças com o
  Desfazer, `votes` pronto para a rodada 4), a parte `estudos` no mural privado (`studyOf`,
  `studyPrintOf`, a impressão, o envio, a junção na volta), `SYNC_SCHEMA` 50, `localHasContent` e a
  pergunta de levar o mural para a conta contando as cartas. A imagem da frente conta como usada sem
  código novo (a parte vai dentro do mural privado; o teste confere). O pacote inicial passou de 2,11
  para 2,13 MB (o modelo e o FSRS entram com a sincronização). Próximo: a rodada 3 (a seção Estudos).

---

## Fontes

- py-fsrs, o código de referência do FSRS (os 21 parâmetros padrão, as fórmulas, os passos de 1 e 10 min,
  o sorteio): <https://github.com/open-spaced-repetition/py-fsrs/blob/main/fsrs/scheduler.py>
- O algoritmo, explicado pelo projeto: <https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm>
- Manual do Anki, opções do baralho (novas por dia, passos, retenção desejada):
  <https://docs.ankiweb.net/deck-options.html>
- Anki, qual algoritmo ele usa: <https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm.html>
- Notas da versão 25.07 do Anki (o FSRS-6): <https://github.com/ankitects/anki/releases/tag/25.07>
- Comparação dos algoritmos de repetição espaçada: <https://expertium.github.io/Benchmark.html>
