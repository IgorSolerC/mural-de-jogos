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
  sai da pasta e fica solta na raiz do grupo novo, **por qualquer caminho** (editor, folha de organizar,
  API, juntar ou apagar grupo, junção entre aparelhos): toda gravação que muda o grupo limpa a pasta, e
  voltar ao grupo de antes não a devolve à pasta antiga (decidido pelo usuário em 09/nov: "Na raiz").
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
- **Mudou de grupo, a pasta sai (P2).** `sanitizeNote` não sabe das pastas, então a limpeza é de quem
  grava: `withCategory(note, grupo)` (`core/folders.ts`) troca o grupo e tira `folder` sempre que o grupo
  muda, e todo caminho que muda o grupo passa por ela (editor, folha de organizar, pedidos da API,
  `LabelEdits`, a escolha de um conflito). Na junção entre aparelhos, um `folder` que chegue junto de um
  grupo diferente do da pasta é tirado ao gravar a junção. A regra da leitura fica de rede de segurança:
  uma nota com `folder` de outro grupo aparece na raiz e, voltando ao grupo antigo, não volta à pasta,
  porque a próxima gravação dela já tira o campo.

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
- **Rodada 1 (09/nov, BUILD 815).** `core/folders.ts` (a árvore, as mudanças puras, a lápide, a conversão
  com id determinístico, o público podado e `foldersOfSnapshot` para os murais dos outros),
  `core/note-folders.ts` (`NoteFolders`: a árvore do seu Murall, as mudanças pelas configurações e a
  conversão sozinha ao abrir, sem data nova nas anotações, por `ReviewStore.replaceMany`), `Review.folder`,
  `NotesConfig.folders`, SYNC_SCHEMA 54, PUBLIC_RULES 6 (`pastas` no público), a pasta pessoal nas
  compartilhadas (site e `PERSONAL` da API). Mudou de grupo, sai da pasta por qualquer caminho (`withCategory`
  na folha de organizar e no editor; os pedidos da API tiram `folder`). A tela continua igual: o "assunto"
  é a pasta de cima (a escolha, o filtro, a orelha, a ordem, o Kanban, os seletores, a leitura, o PDF, o
  espelho e a parte Assuntos das configurações, que renomeia, junta e desfaz a pasta sem regravar
  anotação). A visita, o Feed e o perfil dos outros leem as pastas do mural público. Fica para a rodada 2:
  pastas dentro de pastas na tela.
- **Rodada 2 (09/nov, BUILD 816).** A parede com pastas: `ui/folder-card.ts` (a pasta manilha com as
  cartolinas de até três anotações de dentro, a frente que abre com o mouse; linha na Lista, pequena na
  Visão geral, duas por fileira no celular), `ui/folder-path.ts` (o caminho na pasta da barra, com a seta
  que sobe e o "…" no celular), a navegação no `WallState` (a pasta aberta por grupo na memória da vista,
  `?pasta=` no endereço com o Voltar subindo uma, o foco que vai para o caminho ao entrar e para a pasta
  de onde se saiu ao subir, o aviso para o leitor de tela), a busca e os filtros que procuram na pasta e
  nas de dentro ("Procurar em todo o grupo"; a cartela conta essas, também antes de ligar um filtro), a
  fileira Assunto fora do Filtrar numa aba de grupo, a ordem "Pasta", Nova dentro da pasta e a pasta
  vazia. Um mural com um grupo só não tem abas: lá o Tudo é esse grupo, e as pastas dele aparecem. A visita monta as mesmas peças (`PECAS` e `SO_LEEM` em
  `scripts/visita-mesmas-pecas.test.mjs`; `pages/wall-folders.spec.ts` navega na visita). Fica para a
  rodada 3: arrastar, criar e nomear pastas e os menus.
- **Rodada 3 (09/nov, BUILD 817).** O gesto de arrastar saiu do Kanban para uma peça só, `ui/drag-hold.ts`
  (`DragHold`: a folga do mouse, o dedo que segura, o Esc, a tela que não rola, o toque longo que vira
  menu, a rolagem pela beirada); o Kanban passou a usá-la com os testes dele intactos. Na parede,
  `pages/wall-drag.ts` (`WallDrag`): nota sobre nota cria a pasta com as duas (e com as marcadas), nota
  sobre pasta ou pedaço do caminho guarda, pasta sobre pasta entra nela, parar 750 ms abre a pasta, a
  etiqueta amarela diz o que acontece (acima do dedo no celular), a cópia encolhe em direção ao ponteiro.
  O nome se escreve na própria pasta (`FolderCard.naming`, Enter guarda, Esc deixa, o nome de uma irmã
  avisa e o Enter junta). Menus: a pasta (Abrir, Nova anotação aqui, Nova pasta dentro, Renomear,
  Desfazer a pasta com a pergunta do `Confirm` quando não está vazia), o vão (Nova anotação aqui, Nova
  pasta aqui) e "Tirar da pasta" na anotação (`NoteMenu.more`). Tudo com Desfazer: `NoteFolders.place`,
  `gather` e as mudanças devolvem como desfazer. A parede não importa o que escreve: as mudanças entram
  por `WallBoard.folderActions`, que só a página do dono passa. O toque longo do menu decide caixa a caixa
  (`ContextMenuTrigger.hold` aceita função): onde segurar arrasta, o menu abre ao soltar parado. Fica para
  a rodada 4: "Mover para pasta…" e "Mover para…" com o seletor da árvore (4.8).
- **Rodada 4 (09/nov, BUILD 818).** A pasta em todo lugar: `ui/folder-picker.ts` (a árvore do grupo, aberta
  no caminho da escolhida, a busca em qualquer nível com o caminho, "Criar 'X' em Y" dentro da escolhida,
  o que não se pode escolher apagado) no lugar de `ui/subject-picker.ts`, no editor (a etiqueta Pasta) e na
  folha de organizar; `ui/folder-move-sheet.ts` para o "Mover para pasta…" da anotação e o "Mover para…"
  da pasta, no mural e nas configurações. A leitura mostra o caminho e abre a parede nele (`?pasta=`); o PDF
  leva o caminho. O filtro por pasta (mural, Kanban e seletores) pega as de dentro (`subjectValuesOf`), com
  o caminho em cada opção; nos seletores, as de dentro aparecem quando a de cima é ligada. A parte Assuntos
  das configurações virou Pastas (a árvore, com criar, renomear com Juntar, mover e desfazer). "Assunto"
  saiu da tela (Pasta, Sem pasta, o ícone de pasta). A nota ligada já nascia na mesma pasta, e a cópia para
  os Estudos não leva a pasta. Fica para a rodada 5: a API e o MCP (seção 5).
- **Rodada 5 (09/nov, BUILD 819).** A API e o MCP (seção 5): `NotaV1.pasta` (`{id, caminho}`; o id é null na
  nota de um pedido ainda não aplicado) e `assunto` obsoleto (a pasta de cima); `GrupoV1.pastas` (a árvore
  inteira, com a de cima e as notas) e `sem_grupo.pastas`. O espelho guarda a nota com `pasta_id` só
  (`NotaNoEspelhoV1`, `notaParaOEspelho` no site), e a API monta a pasta pelo contexto ao responder
  (`notaDoEspelho`, `folderIndexOf`: uma leitura a mais); a nota do site de antes das pastas, com o
  `assunto`, continua passando. `?pasta=` (o caminho sem caixa nem acento, ou o id) e `?assunto=` (a de cima)
  pegam as de dentro, com `json_each(?)` num parâmetro só (sem o teto de 100 do D1). Criar e editar aceitam
  `pasta` (o caminho, as que faltam o site cria em `ApiRequests.folderFor`, ou o id; null tira), e mudar de
  grupo sem a pasta tira a nota dela também por cima. Guia, ferramentas, escopos e `docs/api` falam de
  pastas. Falta o `/code-review high` sobre as cinco rodadas.
- **Revisão (09/nov).** `/code-review high` sobre as cinco rodadas (`73d579be~1..37e3a77d`): os dez achados
  estão na seção 11, para corrigir numa rodada própria.
- **Correções da revisão (09/nov, BUILD 821).** Os dez achados da seção 11 corrigidos, cada um com o teste que
  falharia antes (marcados abaixo). As Novidades não mudaram: tudo entrou hoje (desempate novo em NOVIDADES.md).

---

## 11. Achados do `/code-review high` (corrigidos em 09/nov, BUILD 821)

Revisão de 09/nov sobre o intervalo `73d579be~1..37e3a77d` (as rodadas 1 a 5). Cada achado diz onde está, o
que acontece e um caminho de conserto; quem corrigir decide o jeito, desde que o comportamento descrito
deixe de acontecer e ganhe um teste que falharia antes. Do mais grave para o menos. Ao terminar, marcar cada
um aqui (corrigido, ou por que não precisou) e seguir o processo de sempre: testes (`npm run test:ci` na
raiz; em `api/`, `npm run typecheck` e `npm test`), `npx ng build`, Novidades pelas regras de `NOVIDADES.md`,
BUILD + 1, commit e push.

### 11.1 Desfazer ou juntar uma pasta regrava todas as notas dela no espelho da API (eficiência, grave)

- **Onde:** `src/app/core/api-mirror.ts`, `notaV1` (linha ~83: `pasta: path.length ? { id: path.at(-1)!.id, … }`),
  e `notaParaOEspelho` em `contrato/api-v1/notas.ts`.
- **O que acontece:** o site manda ao espelho o id da pasta *resolvido* (`tree.of(r)` sobe a lápide até a viva).
  Ao desfazer uma pasta (`withDissolvedFolder`) ou juntar duas (`withJoinedFolder`), a anotação continua com o
  `folder` guardado (a lápide), mas o id resolvido muda para a pasta de cima: a impressão (hash) de cada nota
  muda e todas são mandadas de novo. Desfazer uma pasta com 300 notas gasta 300 linhas da cota `linhas_dia`, e
  a seção 6 deste plano promete uma linha só (o contexto).
- **Conserto sugerido:** mandar no espelho o id *guardado* (`r.folder`, quando é um id de pasta do grupo) e
  levar as lápides no contexto (`PastaV1` com um campo de desfeita, ou uma lista à parte de lápides com o
  pai), para a API resolver a lápide até a viva ao montar o caminho (`caminhoDaPasta` / `notaDoEspelho` em
  `contrato/api-v1/notas.ts`). Conferir também a lápide de grupo errado (a nota que mudou de grupo e ainda
  aponta para a pasta antiga: a regra da leitura a põe na raiz). O teste: desfazer uma pasta com notas e
  conferir que só o contexto muda de impressão (`api-mirror.spec.ts`) e que a API mostra as notas na pasta de
  cima (`api/test/espelho.suite.ts`).
- **Corrigido.** O site manda o id *guardado* na nota (`storedFolderOf`, em `core/api-mirror.ts`: o da pasta,
  viva ou lápide, quando é do grupo da nota; senão null), e o contexto leva `desfeitas` (`PastaDesfeitaV1`: o id
  de cada lápide que alguma nota guarda e a viva para onde ela leva, null na raiz). A API resolve pelo índice
  (`IndiceDasPastas`, com `vivas` e `desfeitas`; `pastaViva`), no caminho, no `?pasta=` (as desfeitas que levam
  a uma das achadas entram) e no `?pasta=<id de uma desfeita>`; o `ver_contexto` não mostra as `desfeitas`.
  Testes: `api-mirror.spec.ts` ("desfazer ou juntar uma pasta muda só o contexto") e `espelho.suite.ts`
  ("desfazer uma pasta muda só o contexto").

### 11.2 No celular, um toque um pouco demorado não abre mais a ficha (correção)

- **Onde:** `src/app/ui/drag-hold.ts` (`down`, linha ~109: `if (touch) this.holdTimer = setTimeout(() => this.begin(), DRAG_HOLD)`;
  e `onUp`).
- **O que acontece:** numa aba de grupo do seu Murall, o dedo que fica entre 280 ms (`DRAG_HOLD`) e 500 ms
  (`HOLD_MS`) parado começa o arrasto (a ficha levanta e o celular vibra); ao soltar sem ter mexido, `onUp`
  chama `drop` (sem alvo, não faz nada) e `swallowNextClick` engole o clique: a leitura não abre, e o menu
  também não (ele pede 500 ms). Antes da rodada 3, esse toque abria a ficha. O Kanban já tinha o mesmo jeito.
- **Conserto sugerido:** em `onUp`, o dedo que soltou sem ter passado da folga (`!s.moved`) antes de
  `HOLD_MS` não é arrasto: cancelar (sem `drop` e sem engolir o clique), para o toque valer como toque. Testar
  em `src/app/ui/drag-hold.spec.ts` (dedo parado 350 ms e soltar: nada de `drop`, o clique passa) e conferir
  que os testes do Kanban (`src/app/pages/kanban-page.spec.ts`) continuam passando.
- **Corrigido** como sugerido, em `onUp`: o dedo que levantou a ficha e soltou dentro da folga antes de
  `HOLD_MS` cancela, sem `drop` e sem engolir o clique. Teste em `drag-hold.spec.ts`; os do Kanban e da parede
  passam sem mudança.

### 11.3 A prévia da API mostra o id da pasta como nome (correção)

- **Onde:** `contrato/api-v1/operacoes.ts`, `pastaPedida` (linha ~400:
  `return c.pasta ? { id: null, caminho: pedacosDoCaminho(c.pasta) } : null`).
- **O que acontece:** quando a AI manda `pasta` como o id de uma pasta (o que `ver_contexto` mostra), a nota
  por cima (`overlay`, `notaDoPedido`) vem com `pasta: { id: null, caminho: ['pfunc000001'] }` e
  `assunto: 'pfunc000001'` até o Murall aplicar; o `GET /ext/v1/notas?pasta=Programação` também não a acha.
- **Conserto sugerido:** a API tem o índice das pastas (`folderIndexOf` em `api/src/ext/overlay.ts`): ao
  montar a prévia, se `pasta` é um id do índice (no grupo da nota), usar o id e o caminho de verdade. Passar
  o índice para `overlay` / `createdNote` (hoje `aplicarNaNotaV1` e `notaDoPedido` não o recebem). Teste em
  `api/test/pedidos.suite.ts`.
- **Corrigido.** `pastaDoPedido` (contrato/api-v1/operacoes.ts) resolve o id pelo índice: o da conta (a
  desfeita pela viva) vem com o id e o caminho de verdade; o de outro grupo, na raiz (como o site aplica, 11.6);
  o resto é caminho. `aplicarNaNotaV1` e `notaDoPedido` recebem o índice; na API, `overlay` e `createdNote` o
  exigem; no site, a prévia da folha dos pedidos usa `indiceDaArvore`. Testes em `pedidos.suite.ts` e
  `api-requests.spec.ts`.

### 11.4 O Desfazer de pasta restaura a lista inteira (correção)

- **Onde:** `src/app/core/note-folders.ts`, `checkpoint` (linha ~79), usado por `gather`, `rename`, `move`,
  `dissolve` e `join`.
- **O que acontece:** o Desfazer grava de volta a lista inteira de pastas de antes da ação. Qualquer outra
  mudança de pasta feita no meio (renomear outra pasta pelo menu, criar uma, a sincronização de outro
  aparelho) é desfeita junto, sem aviso.
- **Conserto sugerido:** desfazer com a operação inversa só da pasta mexida: o renomear volta o nome dela; o
  mover volta o `parent` dela; o desfazer tira o `gone` dela e devolve o `parent` das que subiram (guardar
  quais eram); o juntar idem; o `gather` desfaz a pasta criada (lápide) depois de devolver as notas. Teste em
  `src/app/core/note-folders.spec.ts`: ação, outra mudança, Desfazer → a outra mudança fica.
- **Corrigido** com a operação inversa sobre a lista de agora (`undoWith`, `undoGone`): renomear volta o nome
  se ninguém deu outro; mover volta o lugar (pela conferência de mover) se ainda está onde foi posta; desfazer e
  juntar tiram a lápide e devolvem só as que subiram e ainda estão onde subiram; o `gather` devolve as notas e
  desfaz a pasta criada (lápide). Teste "o Desfazer volta só a pasta mexida".

### 11.5 A API aceita ids de pasta mais curtos que o site (correção)

- **Onde:** `api/src/domain/mirror.ts`, `FOLDER_ID_RE` (linha ~151: `/^[a-z][a-z0-9]{4,23}$/`), contra
  `src/app/core/folders.ts`, `ID_RE` (linha ~43: `/^[ap][0-9a-z]{6,24}$/`).
- **O que acontece:** um id que o site aceita com 25 letras (`'p'` + 24) é recusado pela API, e
  `checkContexto` / `checkNota` recusam o envio inteiro (400): o espelho da conta para de atualizar. Os ids
  que o site cria hoje têm 13 letras, mas os vindos de outro aparelho ou de um backup passam por
  `sanitizeFolders`, que aceita até 25.
- **Conserto sugerido:** uma regra só, exportada do contrato (`contrato/api-v1/notas.ts`) e usada nos dois
  lados. Teste na API com um id de 25 letras.
- **Corrigido.** `PASTA_ID_RE` mora em `contrato/api-v1/notas.ts`; `isFolderId` (site) e o espelho (API, também
  nas `desfeitas`) usam ela. Teste em `espelho.suite.ts` (25 letras passa; 26, ou outra letra na frente, não).

### 11.6 Pedidos da API criam pastas erradas (correção)

- **Onde:** `src/app/core/api-requests.ts`, `ApiRequests.folderFor` (linha ~566) e o `nota.criar` de
  `applyNoteRequest`.
- **O que acontece:** (a) um id de pasta viva de *outro* grupo cai no caminho e cria, no grupo da nota, uma
  pasta chamada pelo id ("Pfunc000001"); (b) no criar, `folderFor` roda antes de `sanitizeReview`: se o
  pedido falhar depois, as pastas do caminho ficam criadas e vazias.
- **Conserto sugerido:** (a) um id de pasta (`isFolderId`) que não é do grupo da nota não vira nome: a nota
  fica na raiz e o resultado do pedido traz um aviso; (b) resolver a pasta só depois de a nota passar pelas
  conferências (ou desfazer as pastas criadas quando o pedido falha).
- **Corrigido.** (a) `NoteFolders.forRequest`: um id que está nas suas pastas vale por ela (a desfeita pela
  viva); de outro grupo, a nota fica na raiz e o resultado traz o aviso; só o que não é id de pasta sua é
  caminho. No teto de pastas, o aviso também. (b) No criar, a pasta só se resolve depois de a nota passar por
  `sanitizeReview`. Testes em `api-requests.spec.ts`.

### 11.7 O teste da pasta pedida testa uma cópia (cobertura de teste)

- **Onde:** `src/app/core/api-requests.spec.ts`, a função `folderFor` no topo do arquivo (linha ~54).
- **O que acontece:** o teste "a pasta pedida" usa uma cópia de `ApiRequests.folderFor` escrita no próprio
  spec; a de verdade (privada) não é exercitada, então uma mudança nela não quebra o teste.
- **Conserto sugerido:** tirar a lógica para uma função pura em `core` (por exemplo
  `folderForPath(folders: NoteFolders, category, pasta)`, perto de `note-folders.ts`), chamada pelo
  `ApiRequests` e pelo spec. Junto com 11.6, que mexe na mesma função.
- **Corrigido.** A lógica é `NoteFolders.forRequest`, que o `ApiRequests` e o spec chamam; a cópia saiu do spec.

### 11.8 A pergunta de desfazer a pasta está escrita duas vezes (reaproveitar)

- **Onde:** `src/app/pages/wall-board.ts`, `dissolve` (linha ~302), e `src/app/ui/mural-config.ts`,
  `dissolveFolder` (linha ~690).
- **O que acontece:** os dois contam o que está dentro, montam a frase ("As 2 anotações e 1 pasta de dentro
  vão para Estudos. Nenhuma anotação é apagada.") e chamam o `Confirm`, com textos que já divergem um pouco.
- **Conserto sugerido:** uma pergunta só, em `src/app/ui/remove-asking.ts` (`RemoveAsking`, o lugar das
  perguntas de apagar com Desfazer), usada pelos dois. Cuidado com a regra da visita (CLAUDE.md): a parede
  (`WallBoard`) não importa o que escreve; ela recebe as mudanças por `folderActions`.
- **Corrigido** numa peça própria, `ui/folder-asking.ts` (`FolderAsking.dissolve`), e não no `RemoveAsking`:
  ele injeta as lojas que escrevem, e a parede é a mesma peça da visita. A peça só pergunta (com o `Confirm`);
  quem chama desfaz. Teste em `folder-asking.spec.ts`.

### 11.9 A parte Pastas das configurações percorre as notas uma vez por grupo (eficiência)

- **Onde:** `src/app/ui/mural-config.ts`, `folderGroups` (linha ~328: `this.folders.countsIn(category)` dentro
  de `rowsOf`, chamado para cada grupo).
- **O que acontece:** cada `countsIn` percorre todas as notas e monta o caminho de cada uma: O(grupos ×
  notas) a cada mudança de nota ou de pasta enquanto a folha está aberta.
- **Conserto sugerido:** uma passada só pelas notas somando por pasta, para todos os grupos (o
  `countsByFolder` da seção 3.1), e cada grupo lê dali.
- **Corrigido.** `NoteFolders.countsByFolder` (computed, uma passada para todos os grupos), lido pelas
  configurações. Teste em `note-folders.spec.ts` (dá o mesmo que `countsIn` grupo a grupo).

### 11.10 `subjectKeys` é só outro nome para `subjectValuesOf` (simplificar)

- **Onde:** `src/app/ui/picker-filters.ts`, `subjectKeys` (linha ~22).
- **O que acontece:** a função só repassa para `subjectValuesOf` (`src/app/core/wall-filter.ts`); o nome novo
  esconde que é a mesma regra do mural e do Kanban.
- **Conserto sugerido:** chamar `subjectValuesOf` direto e apagar `subjectKeys`.
- **Corrigido** como sugerido (sem teste novo: o comportamento é o mesmo, e os testes dos seletores passam).
