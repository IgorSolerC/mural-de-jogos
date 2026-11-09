# Plano: pastas no lugar dos assuntos nas anotações

Pedido do usuário (09/nov/2026): "Hoje as anotações se organizam em GRUPOS → ASSUNTOS → TAGS, e isso vai
ficando complicado conforme cresce [...] se eu tenho o grupo ESTUDOS, com os assuntos HISTÓRIA, GEOGRAFIA,
JAPONÊS e PROGRAMAÇÃO, pode ser que eu queira criar um sub-assunto 'Programação Funcional' ou 'Scripts de
programação'. [...] Quero matar o conceito de ASSUNTO e migrar para PASTAS dentro de cada grupo, podendo
criar pastas dentro de pastas infinitamente. Gosto da ideia de criar uma pasta ao segurar e arrastar uma
nota e soltá-la em cima de outra." E: "pense na API e banco de dados, não quero uma solução que use-as de
forma não pensada e gaste muitos recursos".

Dos cinco jeitos do protótipo (`prototipos/pastas-nas-anotacoes.html`), o usuário escolheu o **1, Pastas
na parede**: como no computador e no Google Drive, as pastas ficam no começo da parede, em pasta manilha;
clicar entra, o caminho no alto volta, e a parede mostra só o que está direto na pasta aberta.

Só o plano: nada foi implementado e o site não muda. Na implementação, o Impeccable entra no começo e no
fim de cada rodada com tela, e o `/code-review high` no fim, como o pedido diz.

---

## 0. Resumo

- **O assunto vira pasta, e a pasta pode ter pastas dentro, sem limite prático.** Cada grupo tem a sua
  árvore. A conversão é automática e não tira nada do lugar: cada assunto de hoje vira uma pasta de
  primeiro nível com o mesmo nome, com as mesmas anotações dentro.
- **A parede de um grupo vira o "Drive" do grupo:** primeiro as pastas (manilha, com as cartolinas das
  notas aparecendo por cima), depois as anotações soltas daquela pasta. Um caminho na pasta da barra
  ("← Estudos › Programação › Funcional") volta para cima.
- **Arrastar organiza:** nota sobre nota cria uma pasta com as duas; nota sobre uma pasta (ou sobre um
  pedaço do caminho) guarda nela; pasta sobre pasta põe uma dentro da outra; parar sobre uma pasta abre
  ela. O gesto é o do Kanban, que vira uma peça só para os dois.
- **A pasta é guardada por um id, não pelo nome.** Renomear, mover ou desfazer uma pasta muda uma linha
  das configurações do mural e não regrava nenhuma anotação. É isso que mantém o banco e a API baratos
  (seção 6).
- **Nada novo no D1:** nenhuma tabela, nenhuma migração SQL. O mural continua um arquivo compactado por
  conta, e o espelho da API passa a guardar só o id da pasta em cada nota. Os nomes vêm do contexto, que
  é uma linha só.

---

## 1. Como é hoje (o que pesa)

- **O assunto é um texto na anotação** (`Review.subject`, até 32 letras, `cleanSubject`), um só, de um
  grupo. Os "assuntos criados" sem anotação moram em `NotesConfig.subjects` (por chave do grupo). O assunto
  é reconhecido pelo nome sem caixa e sem acento (`lookKey`/`fold`), igual aos grupos.
- **Renomear um assunto regrava cada anotação dele** (`LabelEdits.renameSubject`): cada uma ganha
  `updatedAt` novo, vai na próxima sincronização, e, para quem tem chave de API, é uma linha regravada no
  espelho por anotação. Com nomes em árvore ("Programação/Funcional" escrito na nota), renomear
  "Programação" regravaria tudo o que está embaixo. Por isso a pasta será um id (decisão P1).
- **O assunto aparece em 76 arquivos.** Os que mudam de verdade:
  - dados: `core/review.ts` (campo e `sanitizeNote`), `core/note-labels.ts` (`cleanSubject`,
    `subjectLibrary`), `core/mural-config.ts` (`subjects`, `savedSubjects`, `withSavedSubjects`),
    `core/label-edits.ts` (renomear, juntar e apagar assunto; o grupo leva os assuntos),
    `core/shared-notes.ts` (o assunto é pessoal: `PERSONAL_KEYS`, `orgOf`, `personalOf`),
    `core/cloud-sync.ts` (SYNC_SCHEMA, público), `core/sync-conflicts.ts`, `core/ficha-merge.ts`,
    `core/note-links.ts`, `core/study-copy.ts`;
  - parede: `core/wall-view.ts` (ordem "Assunto", `chooseSubject`, `newNoteSubject`), `core/wall-filter.ts`
    (faceta `subject`), `pages/wall-board.ts` e `pages/wall-cards.ts` (`subjectEar`),
    `ui/review-card.ts` (orelha e linha da data), `ui/note-index.ts` (orelha na Lista),
    `ui/note-filters.ts`, `ui/filter-card.*` (fileira Assunto), `ui/wall-toolbar.html`;
  - outros lugares: `ui/subject-picker.ts` (editor e folha de organizar), `ui/review-editor.*`,
    `ui/organize-sheet.ts`, `ui/review-reader.ts`, `ui/linked-card.ts`, `ui/kanban-note.ts` (tira),
    `pages/kanban-page.*` (filtro), `ui/picker-filters.ts` (seletores), `ui/mural-config.*` (parte
    Assuntos), `ui/conflict-sheet.ts`, `app.ts` e `core/desk.ts` (`newNoteIn` com assunto),
    `scripts/pdf-amostra.mjs`;
  - API: `core/api-mirror.ts` (`notaV1.assunto`, `contextoV1.assuntos`), `core/api-requests.ts`
    (`assunto` ao criar e editar), `contrato/api-v1/` (notas, operações, ferramentas, guia, escopos),
    `api/src/domain/mirror.ts` (forma do espelho), `api/src/ext/routes.ts` (filtro `assunto`),
    `api/src/domain/shared-note.ts` (o que é pessoal).
- **Onde moram os dados na nuvem:** o mural privado é um gzip numa linha (`murais`), gravado inteiro a
  cada envio, que o servidor não abre. O público (`murais_publicos`) é outro gzip. As compartilhadas ficam
  abertas em `notas` (o assunto não vai lá: é pessoal, vai nos `lugares` do mural privado). O espelho
  (`api_espelho`) tem uma linha por item e só existe para quem tem chave de API.

---

## 2. As decisões

Recomendadas por mim; o usuário pode mudar qualquer uma antes da rodada 1.

- **P1. A pasta tem um id; a anotação guarda o id.** O nome mora só na pasta. Renomear, mover e desfazer
  pasta não mexem em anotação nenhuma (seção 6).
- **P2. A pasta é do grupo.** Cada grupo (e o "Sem grupo") tem a sua árvore. A anotação que muda de grupo
  sai da pasta e fica solta na raiz do grupo novo.
- **P3. A conversão não tira nada do lugar.** Cada assunto vira uma pasta de primeiro nível com o mesmo
  nome e as mesmas anotações. O assunto criado nas configurações, sem anotação, vira pasta vazia. A
  anotação sem assunto fica solta na raiz do grupo.
- **P4. Desfazer a pasta nunca apaga anotação.** O que está dentro (notas e pastas) sobe para a pasta de
  cima. Não existe "apagar a pasta com tudo".
- **P5. As pastas ficam em ordem alfabética** (pt-BR, sem caixa e acento), sempre antes das anotações.
  Ordem manual fica para depois.
- **P6. Dentro de uma pasta, a parede mostra só o que está direto nela.** Buscar, filtrar por tag ou
  pelo Filtrar procura na pasta aberta e em todas as de dentro, e a parede vira uma lista só, com a orelha
  da pasta em cada anotação (como o jeito 5 do protótipo). Limpar a busca volta às pastas.
- **P7. Tudo, Fixadas e Compartilhadas continuam sem pastas** (juntam grupos). A orelha continua a do
  grupo; a leitura mostra o caminho.
- **P8. No toque, segurar é arrastar.** Segurar e soltar sem mexer abre o menu, como no Kanban (hoje, no
  mural, o menu abre sozinho aos 500 ms). O mural e o Kanban passam a ter o mesmo gesto.
- **P9. O nome da pasta** tem até 32 letras (o mesmo do grupo e da tag, e o mesmo da API). Duas irmãs não
  têm o mesmo nome (sem caixa e acento): a nova é "Nova pasta", depois "Nova pasta 2"; renomear para um
  nome que já existe ali oferece **Juntar** (como no cofre e nas tags).
- **P10. Infinito na prática, com teto técnico:** até 2.000 pastas por conta e 24 níveis. Ninguém chega
  lá organizando à mão, e o teto protege o tamanho das configurações e do contexto da API.
- **P11. A pasta aberta vai no endereço** (`?pasta=<id>`), como o grupo e o baralho abertos dos Estudos,
  e é lembrada por grupo só enquanto a página está aberta (na memória da vista): ao abrir o Murall de
  novo, o grupo abre na raiz, como o Drive. O Voltar do navegador e o do celular sobem uma pasta. Nada
  novo fica guardado no navegador.
- **P12. Quem visita vê as pastas que têm alguma anotação pública dentro**, e navega igual (mesmas
  peças, regra do CLAUDE.md). O nome de uma pasta só com anotações privadas nunca sai do seu Murall. Sem
  arrastar e sem o menu do dono.
- **P13. Na API, `assunto` continua, marcado como obsoleto:** passa a ser o nome da pasta de cima. A
  nota ganha `pasta` (id e caminho). Escrever com `assunto` põe na pasta de cima de mesmo nome (cria se
  não existir), então nada que uma AI já faz quebra.
- **P14. A parte Assuntos das configurações do mural vira Pastas:** a árvore de cada grupo, com
  Renomear, Mover para… e Desfazer.
- **P15. A pasta não tem botões de hover.** O menu é o do botão direito (e do dedo, e do Shift+F10). Se um
  dia ganhar, usa a etiqueta padrão (`ui/_etiqueta-acoes.scss`, regra do CLAUDE.md).
- **P16. Arrastar as marcadas (Ctrl+clique) leva todas**, como no Kanban.
- **P17. Fica para depois:** arrastar para a orelha de outro grupo, cor e ícone de pasta, ordem manual,
  e as ferramentas de pasta na API (seção 7).

---

## 3. Os dados

### 3.1 A pasta (`core/folders.ts`, nas configurações do mural)

```ts
interface NoteFolder {
  id: string;          // 'p' + 10 letras aleatórias; as da conversão: 'a' + hash (3.4)
  group: string;       // a chave do grupo (lookKey; '' = Sem grupo)
  name: string;        // até 32 letras (cleanLabel)
  parent: string | null;
  gone?: string;       // lápide: quando foi desfeita (ISO), ver 3.3
}
NotesConfig.folders: NoteFolder[]   // sai `subjects`
```

- Mora em `NotesConfig` porque já é o lugar das coisas do mural que sincronizam juntas (`muralAnotacoes`),
  com base de três vias. A junção (`core/merge-json.ts`) junta listas de objetos com `id` item a item:
  dois aparelhos criando pastas ficam com as duas; um renomeando e outro movendo a mesma pasta ficam com
  as duas mudanças; os dois renomeando a mesma pasta de jeitos diferentes viram a pergunta de conflito de
  sempre (`sync-conflicts.ts`, rótulo "Pastas").
- `sanitizeNotesConfig` limpa: id válido e único, nome limpo, `parent` que existe, é do mesmo grupo e não
  faz ciclo (se fizer, a pasta vai para a raiz), teto de P10 (o que passar fica de fora ao ler).
- Funções puras em `core/folders.ts`: `folderTree(cfg, group)`, `pathOf(id)`, `liveFolderOf(note, cfg)`,
  `foldersBelow(id)`, `countsByFolder(notes, cfg)` (uma passada só pelas notas, O(N + P)), `uniqueName`,
  `withFolder*` (criar, renomear, mover, desfazer, juntar). Nada de Angular, tudo testável.

### 3.2 A anotação guarda o id; a regra vale na leitura

- `Review.folder?: string` (só nas anotações). Sai `subject` (lido ainda na conversão, 3.4).
- **A pasta "de verdade" da anotação** (`liveFolderOf`) é a guardada se ela existe, está viva e é do
  grupo da anotação. Se for uma lápide, vale a viva mais próxima acima dela. Se não existe ou é de outro
  grupo, a anotação está solta na raiz do grupo. Nada disso regrava a nota: é leitura. A próxima vez que
  a anotação for salva por outro motivo, ela grava a pasta já resolvida.
- Isso resolve sem perguntar os casos de dois aparelhos: um desfaz a pasta enquanto o outro guarda uma
  nota nela (a nota sobe com as outras); um muda a nota de grupo enquanto o outro a guarda numa pasta (a
  nota fica na raiz do grupo novo).

### 3.3 Desfazer a pasta é uma lápide

- Desfazer marca `gone` e não mexe nas anotações: elas sobem pela regra da leitura (3.2). As pastas de
  dentro ganham `parent` = a de cima (só configurações).
- A lápide sai quando nenhuma anotação aponta para ela e já passaram 60 dias (o tempo para um aparelho
  parado voltar e juntar sem ressuscitar a pasta). A limpeza roda junto do `sanitizeNotesConfig` do envio.
- O Desfazer do bilhete (Toasts) só tira o `gone`, e tudo volta como era.

### 3.4 A conversão do assunto (`convertSubjects`)

- **Id determinístico:** a pasta de um assunto tem id `'a' + hash(chave do grupo + '|' + fold(assunto))`
  (os 10 primeiros caracteres de um hash estável, o mesmo em todo aparelho). Assim, dois aparelhos que
  convertem cada um sozinho chegam às mesmas pastas, e a junção não duplica "História".
- **Uma função pura** `convertSubjects(notes, cfg) → { notes, cfg }`, idempotente: cria a pasta de cada
  assunto usado ou criado (com a grafia mais usada, a de `subjectLibrary`), troca `subject` por `folder`
  e tira `subjects` das configurações. Precisa das notas e das configurações juntas, então não cabe em
  `core/migrations.ts` (que vê uma ficha de cada vez); roda:
  1. ao abrir, depois de ler o armazenamento e antes de a parede montar;
  2. depois de baixar e juntar o mural da nuvem (um aparelho que ainda não converteu manda assuntos);
  3. ao importar um backup antigo e ao restaurar uma versão guardada (`versoes`);
  4. nos `lugares` das compartilhadas (o assunto pessoal de cada membro vira a pasta pessoal);
  5. nos conflitos guardados que ainda têm assunto (`conflitos`), para a escolha não trazer o campo de
     volta.
- **Site antigo:** SYNC_SCHEMA sobe para 54. O site da 53 que baixar um mural da 54 para de enviar e
  pede para atualizar (`isNewerSchema`), como sempre. Nada da 53 sobrescreve as pastas.
- **Pedidos da API na fila** com `assunto` continuam valendo (P13).
- **Sem volta:** depois da 54 na nuvem, voltar o site para antes das pastas exige reverter a conversão
  (a função inversa existe só nos testes). Antes do commit da rodada 1, conferir com os dados reais do
  usuário (o backup da conta) que a conversão dá as mesmas notas nos mesmos lugares.

### 3.5 Renomear, juntar e apagar o grupo

- **Renomear** o grupo: as pastas vão junto (troca a chave `group`; os ids não mudam).
- **Juntar** dois grupos: as pastas do grupo que some vão para o outro. Duas de primeiro nível com o
  mesmo nome viram uma (a do grupo que fica permanece, a outra vira lápide apontando para ela). Só aqui
  as anotações são regravadas, e só as dessas pastas; juntar grupos é raro.
- **Apagar** o grupo: as anotações vão para "Sem grupo" como hoje, e as pastas vão junto para a árvore
  do Sem grupo (ninguém perde a organização). A pergunta de apagar diz "e as 6 pastas".

### 3.6 Sincronização e tamanho

- O mural privado continua um gzip por envio. A árvore inteira com 200 pastas tem uns 14 KB antes do gzip
  (menos de 3 KB depois); o id na anotação é ~12 bytes. O teto do envio (1,8 MB) não muda nada.
- A anotação muda (e sincroniza) só quando ela mesma muda de pasta.
- `ficha-merge.ts`: `folder` entra na família "categoria" (o mesmo que `category` e `subject` hoje);
  `conflict-sheet.ts` compara `folder` no lugar de `subject`.

### 3.7 Anotações compartilhadas

- A pasta é pessoal, como o grupo e as tags: `folder` entra em `PERSONAL_KEYS` (site) e em `PERSONAL`
  (`api/src/domain/shared-note.ts`), e vai nos `lugares` do mural privado de cada um. **A API precisa
  sair junto com o site** (o push na main publica os dois): sem isso, o servidor gravaria o id da pasta de
  uma pessoa na cópia compartilhada.
- O id da pasta de outra pessoa nunca vale aqui: a regra de 3.2 (a pasta precisa existir nas *suas*
  configurações) põe a compartilhada solta na raiz até você a guardar.

### 3.8 Mural público e visita

- O público leva `pastas`: só as que têm alguma anotação pública dentro (ou abaixo), com id, nome e pai,
  e as lápides resolvidas. Uma pasta só com anotações privadas nunca sai. `PUBLIC_RULES` sobe para 6,
  para cada aparelho reenviar o público uma vez.
- A visita monta as mesmas peças (`WallBoard`, `WallToolbar`, a pasta e o caminho) sobre a `VisitView`,
  que lê a árvore do público. A navegação mora no `WallState` (a base das duas vistas). Sem arrastar e sem
  o menu do dono: a peça recebe isso por entrada (`editable`/`ownerMenu`), e a visita não tem como chamar.

### 3.9 Regra do logout (CLAUDE.md)

- Nada novo no armazenamento do navegador: a pasta aberta vive no endereço e na memória da vista (P11),
  e um id de pasta sozinho não diz nada de ninguém (a pasta de outra conta não existe nas configurações
  desta, e a regra de 3.2 abre a raiz).
- As pastas em si vão nas configurações do mural (`meu-mural:` no localStorage), que a limpeza já apaga,
  já sincronizam e já contam em `localHasContent`. Um teste em `core/browser-reset.spec.ts` mostra as
  configurações com pastas saindo no logout.

---

## 4. As telas

Referência visual: o jeito 1 do protótipo, que o usuário aprovou (a aparência fica como lá; ver a regra
"Aparência congelada"). Os materiais já existem no projeto: a pasta manilha do cofre (`--pasta: #d6c391`,
grão de papel), as orelhas de `ui/_divisorias.scss`, o remendo de feltro do menu (`ui/context-menu.ts`),
o bilhete com Desfazer (Toasts) e a fita das seções.

### 4.1 A parede de um grupo

- **Primeiro as pastas, depois as anotações soltas daquela pasta.** As pastas formam a primeira fileira
  (ou fileiras), sem título; se a parede tem seções (Data, Prioridade…), as pastas ficam acima da
  primeira fita. A ordem escolhida (Ordenar) vale para as anotações; as pastas são sempre A–Z.
- **O caminho** mora na pasta manilha da barra, como primeira linha, **só dentro de uma pasta** (na raiz
  a orelha aberta já diz o grupo): `← Estudos › Programação › Funcional`, em marcador, a última sem
  link. A seta e cada pedaço sobem; cada pedaço também recebe o que é arrastado. No celular, os pedaços do
  meio viram "…" (um menu com eles).
- **As vistas:** Comum e Inteira (a pasta do tamanho da ficha), Visão geral (pasta pequena: nome, número e
  duas tiras), Lista (uma linha por pasta no começo do índice, com o desenho de pasta, o nome, "4 notas ·
  2 pastas" e a seta).
- **Nova** dentro de uma pasta cria a anotação nela (como hoje com o assunto escolhido).
- **Pasta vazia:** "Pasta vazia. Arraste anotações para cá, ou escreva uma." com o Nova.
- **O número da orelha do grupo** continua contando todas as anotações do grupo.

### 4.2 A pasta na parede (`ui/folder-card.ts`, peça nova)

Nada parecido existe na parede, então é peça nova, com os materiais de sempre:

- Uma pasta manilha em pé: o fundo com a aba à esquerda (`--pasta-fundo`), as cartolinas de até três
  anotações de dentro aparecendo por cima (a cor de cada uma, levemente tortas), e a frente da pasta
  (`--pasta`, grão) com o nome em Permanent Marker e o número em Barlow Condensed caixa alta ("3 notas · 1
  pasta"; vazia: "Vazia").
- **Ao passar o mouse, a frente da pasta abre um pouco** (gira para trás pela base); com movimento
  reduzido, só clareia. Sobre ela, arrastando, abre mais e ganha o contorno amarelo tracejado (o mesmo
  das anotações marcadas).
- É um botão (`role` de link para a pasta, nome acessível "Pasta Programação, 4 notas e 2 pastas"),
  Enter abre, Shift+F10 abre o menu, foco com o anel de sempre.
- O número conta as anotações à mostra (sem as finalizadas escondidas), como as orelhas.

### 4.3 Entrar e voltar

- Clicar (ou Enter) entra. A entrada troca a parede com a transição de vista que o mural já usa nas abas
  (sem ela, com movimento reduzido). O foco vai para o último pedaço do caminho, e um aviso para leitor
  de tela diz "Pasta Funcional, 2 anotações".
- A pasta vai no endereço (`?pasta=<id>`, P11): entrar empurra uma entrada no histórico, então o Voltar
  do navegador e do celular sobe uma pasta. Trocar de grupo e voltar devolve a pasta em que ele estava,
  enquanto a página está aberta.
- Um endereço com a pasta abre o grupo nela (serve também para o "abrir a pasta" da leitura, 4.9). Uma
  pasta que não existe (apagada, ou de outra conta) abre a raiz do grupo.

### 4.4 Busca, filtros e ordem dentro de uma pasta

- Com busca, tag ou Filtrar ligados, a parede procura na pasta aberta e em todas as de dentro, e mostra
  uma lista só, sem as pastas, cada anotação com a orelha da pasta dela (o nome da pasta, com o desenho de
  pasta, no lugar onde hoje fica a orelha do assunto). Uma linha a giz diz "Em Programação e nas pastas de
  dentro · Procurar em todo o grupo".
- A faceta `subject` do Filtrar sai (a pasta é o lugar, não um filtro). A ordem "Assunto" vira "Pasta"
  (seções por pasta), útil só no Tudo e na lista da busca; a guardada "assunto" lê como "pasta".

### 4.5 Arrastar (`ui/drag-hold.ts`, peça única com o Kanban)

O Kanban já tem o gesto completo em `pages/kanban-page.ts` (folga de 6 px no mouse, segurar 280 ms no
dedo, a tela que não rola enquanto arrasta, Esc cancela, o menu do navegador bloqueado, o fantasma, o maço
das marcadas). Ele sai de lá para uma peça só, `ui/drag-hold.ts`, que o Kanban e a parede usam. O Kanban
não muda de comportamento (os testes dele passam sem mudança). O que é de cada um (onde cai, a vaga do
Kanban) fica com quem usa.

Na parede:

- **Mouse:** apertar e mover mais de 6 px. **Dedo:** segurar 280 ms (a ficha levanta), então mover;
  segurar e soltar sem mexer abre o menu da anotação (P8).
- **Onde cai:**
  - sobre outra anotação: "Nova pasta com as duas" (com marcadas: "com as 4");
  - sobre uma pasta: "Guardar em Programação";
  - sobre um pedaço do caminho: "Guardar em Estudos" / "Tirar das pastas";
  - no vão da parede: nada (a anotação já está ali).
  Uma etiqueta amarela segue o ponteiro com essas palavras (o amarelo do marca-texto, Barlow caixa alta).
- **Pasta arrastada:** sobre outra pasta ou um pedaço do caminho, vai para dentro; sobre uma anotação,
  nada. Nunca para dentro dela mesma ou de uma de dentro.
- **Parar 750 ms sobre uma pasta abre ela** (sobre um pedaço do caminho, sobe), e o arrasto continua lá
  dentro, para chegar a uma pasta funda num gesto só. Perto da borda de cima ou de baixo, a tela rola.
- **Depois de soltar:** a parede anima as fichas para o lugar novo (como a troca de ordem); o bilhete diz
  o que aconteceu, com **Desfazer** ("Revolução Francesa guardada em História.").
- Só no seu Murall, só nas abas de grupo. Na visita, no Tudo, nas Fixadas e nas Compartilhadas não há
  arrasto (a compartilhada arrasta, na aba do grupo dela, porque a pasta é sua).

### 4.6 Criar pasta e dar nome

- **Nota sobre nota:** nasce a pasta na pasta aberta com as duas (ou com as marcadas e a de baixo). O
  nome aparece já editável **na própria pasta**, escrito "Nova pasta" e selecionado: digitar troca, Enter
  guarda, Esc deixa "Nova pasta". Sem janela por cima (melhor que o protótipo, que usava uma).
- **Nova pasta** sem arrastar: no menu do botão direito da parede (o vão) e no da pasta ("Nova pasta
  dentro"); e no menu "Mover para pasta…" de uma anotação ("Nova pasta aqui com esta anotação").
- Nome repetido entre irmãs: a linha diz "Já existe Scripts aqui" e o botão vira Juntar (P9).

### 4.7 Os menus (botão direito, dedo, Shift+F10)

Pelo `ui/context-menu.ts`, com o remendo de feltro de sempre e só atalhos para o que o site já faz:

- **Anotação** (o menu de hoje ganha): "Mover para pasta…" (abre o seletor de 4.8), e, dentro de uma
  pasta, "Tirar da pasta" (sobe um nível).
- **Pasta:** Abrir · Nova anotação aqui · Nova pasta dentro · Renomear · Mover para… · Desfazer a pasta.
  "Desfazer a pasta" pergunta no próprio menu, como o "apagar com a pergunta do X" dos comentários:
  "As 4 notas e 2 pastas vão para Estudos." Desfazer · Não. Depois, o bilhete com Desfazer.
- **Vão da parede** (numa aba de grupo): Nova anotação aqui · Nova pasta aqui.

### 4.8 Escolher a pasta (`ui/folder-picker.ts`, no lugar de `ui/subject-picker.ts`)

- O mesmo lugar e o mesmo jeito da escolha de hoje (a etiqueta Assunto vira **Pasta**, com o desenho de
  pasta), mas a lista é a árvore do grupo: recuada por nível, as pastas abertas no caminho da escolhida,
  com a busca (que acha em qualquer nível e mostra o caminho), "Sem pasta" no topo e "Criar 'Scripts' em
  Programação" quando o texto não existe.
- Usado no editor (aba Anotação), na folha de organizar, no "Mover para pasta…" e na parte Pastas das
  configurações (Mover para…). Trocar o grupo no editor limpa a pasta (P2), com a frase "A pasta ficou
  em Estudos." e o Desfazer.

### 4.9 Os outros lugares

- **Ficha:** na aba de um grupo não há mais orelha de assunto (a pasta é o lugar). Na lista da busca
  (4.4) a orelha diz a pasta. No Tudo, nas Fixadas e nas Compartilhadas, a orelha continua o grupo, e a
  linha da data mostra a pasta onde hoje mostra o assunto.
- **Leitura:** o caminho inteiro na linha de cima ("Estudos › Programação › Funcional", o do meio
  encurtado se não couber), e tocar nele abre a parede naquela pasta.
- **Lista:** as pastas no começo do índice (4.1); a orelha das anotações segue a regra da ficha.
- **Kanban:** a fileira Assunto do filtro vira **Pasta**: a escolha pela árvore (4.8, compacta), que
  inclui as de dentro. A tira da ficha mostra o nome da pasta onde hoje mostra o assunto.
- **Seletores** (widget Nota, link de ficha, colar nota): a fileira Assunto vira Pasta, com as pastas de
  cima do grupo; escolhida uma, as de dentro aparecem numa fileira embaixo (incluídas).
- **Configurações do mural, parte Pastas:** a árvore de cada grupo em linhas de configuração (desenho,
  nome em marcador, número), com Renomear, Mover para… e Desfazer; o resumo do grupo diz "6 pastas".
- **Nota ligada** (`note-links.ts`) nasce na mesma pasta; a cópia para os Estudos (`study-copy.ts`) não
  leva a pasta; o PDF mostra o caminho onde mostrava o assunto.

### 4.10 Celular

- A pasta do tamanho da ficha (duas por fileira), o caminho com "…" no meio, o arrasto pelo dedo (P8), a
  borda que rola. O nome da pasta editável sobe com o teclado (o campo fica à vista).

### 4.11 Acessibilidade

- Tudo o que o arrasto faz tem caminho sem arrastar (menu e seletor). A pasta e o caminho são botões com
  nomes completos; a troca de pasta é anunciada; o foco não se perde ao entrar, sair, desfazer ou criar
  (vai para a pasta nova, ou para o vizinho, como `ui/focus.ts` faz ao tirar algo).

---

## 5. A API, o espelho e o MCP

### 5.1 O que a nota mostra (v1, só acrescenta)

```ts
interface NotaV1 {
  // ...como hoje
  pasta: { id: string; caminho: string[] } | null;   // novo
  assunto: string | null;                            // obsoleto: caminho[0]
}
GrupoV1.pastas: { id: string; nome: string; pai: string | null; notas: number }[]   // novo
GrupoV1.assuntos: string[]                                                        // obsoleto: as de cima
```

### 5.2 O espelho guarda só o id (o que poupa gravações)

- O site manda cada nota com `pasta_id` (e sem nomes de pasta). O contexto (`contexto`, uma linha) leva a
  árvore de cada grupo.
- A API monta `pasta` e `assunto` na hora de responder, lendo o contexto (uma linha a mais por pedido de
  leitura; ler é barato no D1, gravar é o que tem cota).
- **Resultado:** renomear ou mover uma pasta com 300 notas regrava **uma** linha do espelho (o contexto),
  em vez de 300. Mover notas regrava só as notas movidas (e o contexto, pelos números).
- `api/src/domain/mirror.ts` aceita `pasta_id` (e, por um tempo, `assunto` vindo de um site da 53, que a
  API trata como hoje).

### 5.3 Filtros e escrita

- `GET /ext/v1/notas?pasta=Programação/Funcional` (caminho, sem caixa e acento) ou `?pasta=<id>`: a API
  acha os ids no contexto (a pasta e as de dentro) e filtra com `json_extract(dados, '$.pasta_id') IN (...)`,
  em pedaços de 90 (o teto do D1). `?assunto=` continua: a pasta de cima com esse nome e as de dentro.
  Sem índice novo (cada índice custa gravação).
- `criar_nota` / `editar_nota` aceitam `pasta` (o caminho; as que faltam são criadas pelo site ao aplicar o
  pedido, ou o id) e `assunto` (P13). Quem aplica é o site, como sempre (`core/api-requests.ts`).
- O guia, as ferramentas, o OpenAPI e `docs/api` passam a falar de pastas (`cd api && npm run docs`).
  `ver_contexto` mostra as árvores.

---

## 6. Custos (por que ids)

| O que a pessoa faz | Mural privado (D1) | Espelho da API (só com chave) | Compartilhadas |
|---|---|---|---|
| Criar pasta | 1 envio (como qualquer mudança) | 1 linha (contexto) | 0 |
| Renomear pasta | 1 envio | 1 linha | 0 |
| Mover pasta (com tudo dentro) | 1 envio | 1 linha | 0 |
| Desfazer pasta (lápide) | 1 envio | 1 linha | 0 |
| Guardar N notas numa pasta | 1 envio | N linhas + contexto | 0 (a pasta é pessoal) |
| Conversão (uma vez) | 1 envio | as notas com assunto + contexto (o hash muda uma vez) | 0 |

Com o nome da pasta escrito nas notas, renomear ou mover regravaria cada nota de baixo, no envio e no
espelho. A conversão regrava o espelho uma vez; se passar da cota diária de linhas da conta
(`linhas_dia`), o resto vai no dia seguinte, como hoje.

---

## 7. O que fica de fora (de propósito)

- Arrastar para a orelha de outro grupo (mudar de grupo arrastando).
- Cor e ícone de pasta (a pasta é manilha; o grupo é que tem cor).
- Ordem manual das pastas.
- Ferramentas de pasta na API (criar, renomear, mover, desfazer). A AI já cria pasta ao escrever uma nota
  com `pasta`; o resto pode ser uma rodada própria depois.
- Pastas no Tudo, nas Fixadas e nas Compartilhadas.

---

## 8. Rodadas (uma de cada vez, cada uma com commit e push)

1. **Dados e conversão, sem mudar a tela.** `core/folders.ts`, `NotesConfig.folders`, `Review.folder`,
   `liveFolderOf`, lápides, `convertSubjects` nos cinco lugares de 3.4, grupo renomeado/juntado/apagado,
   SYNC_SCHEMA 54, compartilhadas (site e `PERSONAL` da API), público com a árvore podada (PUBLIC_RULES 6).
   A tela de hoje continua igual: o que mostra "assunto" passa a ler o nome da pasta de cima, e a escolha
   de assunto escolhe entre as pastas de cima. O espelho continua mandando `assunto` (a pasta de cima).
   Testes: conversão idempotente; dois aparelhos convertendo sozinhos dão as mesmas pastas; desfazer x
   guardar ao mesmo tempo; nota que muda de grupo; ciclo e pai de outro grupo no `sanitize`; backup
   antigo; versões e conflitos guardados; compartilhada com assunto pessoal; público sem nome de pasta
   privada; o site da 53 parando.
2. **A parede com pastas.** A pasta (4.2), entrar e voltar (4.3, com o histórico), o caminho na barra,
   as quatro vistas, a busca e os filtros dentro da pasta (4.4), Nova na pasta, a visita (com
   `PECAS`/`VISITA` em `scripts/visita-mesmas-pecas.test.mjs` e um teste que abre uma pasta na visita).
   Impeccable no começo e no fim, fotos 2x (computador e celular).
3. **Arrastar e os menus.** `ui/drag-hold.ts` tirado do Kanban (primeiro o Kanban passa a usar a peça,
   com os testes dele intactos), o arrasto na parede (4.5), criar e nomear na pasta (4.6), os menus
   (4.7), o Desfazer. Impeccable no começo e no fim.
4. **A pasta em todo lugar.** O seletor (4.8) no editor, na folha de organizar e no "Mover para pasta…",
   a leitura, a Lista, o Kanban, os seletores, a parte Pastas das configurações, a nota ligada, o PDF. O
   assunto some da tela.
5. **A API e o MCP.** Seção 5: `pasta_id` no espelho, `pasta` e `assunto` montados na leitura, filtros,
   escrita, contexto, guia, OpenAPI e docs.

No fim: `/code-review high` sobre tudo, as correções, as Novidades (cada rodada com a sua entrada, F/M/C
pelas perguntas de `NOVIDADES.md`), a build de produção com o smoke (dados guardados com assuntos, para
ver a conversão na build de verdade), BUILD subindo a cada commit.

---

## 9. A conferir (riscos)

- **A conversão mexe em todas as anotações com assunto** e sincroniza. Conferir com o backup real antes do
  commit da rodada 1; o id determinístico é o que evita pasta repetida entre aparelhos.
- **O gesto do toque muda no mural** (P8): hoje segurar abre o menu aos 500 ms; passa a abrir ao soltar.
  Conferir que a seleção de texto por toque longo (que hoje abre o menu mesmo com a palavra selecionada)
  continua certa nas fichas.
- **A peça do arrasto sai do Kanban:** o Kanban é o lugar mais usado; os testes dele (`kanban-page.spec.ts`)
  precisam passar sem mudar uma linha.
- **Arrasto e as fichas montadas aos poucos:** a parede monta as fichas longe da tela depois
  (`pages/wall-cards.ts`, `pump`); o alvo do arrasto e a rolagem pela borda precisam funcionar com as que
  ainda não montaram.
- **A lápide e o aparelho parado por mais de 60 dias:** a nota dele aponta para uma pasta que já sumiu; a
  regra de 3.2 a deixa na raiz do grupo (nada se perde, só a organização daquela nota).
- **O público podado:** testar que uma pasta só com notas privadas não aparece nem pelo nome no caminho de
  uma pública (o caminho mostra só as pastas que também foram).
- **A cota do espelho no dia da conversão** (seção 6).

---

## 10. Andamento

- **Plano (09/nov).** Protótipo dos cinco jeitos em `prototipos/pastas-nas-anotacoes.html` (teste de
  arrasto com mouse e dedo em `.angular/pptr/pastas-proto.mjs`); o usuário escolheu o jeito 1. Esperando a
  aprovação das decisões P1–P17 para começar a rodada 1.
