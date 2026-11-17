# Apagar o grupo com destino (17/nov/2026)

Pedido do dono (cartão "Perguntar se deseja deletar as anotações, migrar de grupo ou deixar sem grupo ao
deletar um grupo"): hoje, apagar um grupo (Configurações do mural › Grupos › Apagar o grupo) deixa as
anotações sem grupo, soltas. Ele quer escolher entre três destinos:

1. **Apagar tudo** o que está no grupo: as anotações, as pastas e o resto.
2. **Levar para outro grupo**, escolhendo até a pasta desse grupo onde tudo fica.
3. **Deixar sem grupo**: as anotações vão para uma pasta nova nas sem grupo, "Grupo deletado: *nome*".

Tudo tem de funcionar com as anotações compartilhadas e os grupos compartilhados, com várias pessoas
mexendo ao mesmo tempo. Processo pedido: este plano antes; uma feature por vez, cada uma com
`/code-review mid` antes da próxima; Impeccable no começo e no fim; `/code-review high` no final.

---

## 1. Como é hoje

- O único lugar que apaga um grupo é `MuralConfig.deleteCategory` (`ui/mural-config.ts`): pergunta pelo
  `Confirm` e chama `LabelEdits.renameCategory(nome, null)` (`core/label-edits.ts`), que:
  - tira o grupo das anotações (`notesWithCategory`, cada uma regravada com data nova);
  - apaga o ícone e a cor, e leva a cor das tags para as sem grupo (`looksMoved`, `tagLooksMoved`);
  - tira o grupo da ordem e os padrões dele, leva as tags escondidas para as sem grupo (`configMoved`);
  - leva as pastas para o "Sem grupo", juntando as de cima de mesmo nome (`NoteFolders.moveGroup`);
  - apaga o quadro do Kanban (`KanbanStore.moveCategory(de, null)`);
  - apaga os baralhos dos Flashcards e as cartas que só estavam neles (`StudyStore.moveGroup`, G7);
  - apaga os quadros livres do grupo (`FreeBoardStore.moveGroup`, D12).
- **Defeito de hoje**: num grupo compartilhado, `renameCategory(…, null)` não faz nada (o comentário diz
  "apagar, nunca por aqui: o dono para de compartilhar antes"), mas o botão aparece, a pergunta abre e o
  bilhete diz "foi apagado em 0 anotações". Quem não é o dono nem tem como apagar o grupo.

## 2. Decisões (minhas, ditas aqui)

- **D1. Uma folha só, no lugar do `Confirm`**: `ui/group-delete-sheet.ts`, "Apagar o grupo Trabalho", na
  ficha de papel das folhas (a mesma `kanban-column-sheet.scss` da folha "Copiar baralho"). Os três destinos
  são os segmentos de papel de sempre (`kit.segmentos`, como "Só no Kanban / No mural também"), um embaixo
  do outro, cada um com o nome e uma linha do que acontece. Começa em **Deixar sem grupo**: é o que nunca
  perde nada e o que mais se parece com o de hoje.
- **D2. Levar para outro grupo** abre, embaixo do segmento, a escolha do grupo (`GroupPicker`, obrigatório,
  sem o próprio grupo e sem os compartilhados em que você só lê; sem "Criar": levar para um nome novo é
  renomear, e isso já existe no nome do grupo) e, escolhido o grupo, a escolha da pasta dele (`FolderPicker`,
  a mesma do editor e do "Mover para…", com "Direto em Trabalho" no topo e "Criar 'X' em …").
- **D3. O que vai para onde** (uma regra só, `core/group-delete.ts`, puro):

  | | Apagar tudo | Levar para outro grupo | Deixar sem grupo |
  |---|---|---|---|
  | Anotações | apagadas (as compartilhadas, pelo papel: ver D5) | no grupo novo | sem grupo |
  | As soltas na raiz do grupo | — | na pasta escolhida (ou na raiz) | na pasta "Grupo deletado: nome" |
  | Pastas | viram lápide (somem) | dentro da pasta escolhida, no grupo novo; a de mesmo nome que já está lá junta | dentro da pasta "Grupo deletado: nome" |
  | Ícone, cor, padrões, lugar na ordem | vão embora | vão embora (o grupo novo fica com os dele) | vão embora |
  | Cor das tags, tags escondidas | vão embora | vão para o grupo novo (o que ele já tinha vale) | vão para as sem grupo (como hoje) |
  | Quadro do Kanban | vai embora | os cartões entram no quadro do grupo novo, pela coluna de mesmo nome (`moveBoardCategory`, como juntar) | vai embora (sem grupo não tem quadro) |
  | Baralhos dos Flashcards | vão embora, com o progresso | vão para o grupo novo (o de mesmo nome junta: `moveGroup`) | vão embora (sem grupo não tem baralho, G7) |
  | Quadros livres | vão embora | vão para o grupo novo | vão embora (quadro sem grupo não existe, D12) |

  A folha diz isso na linha de cada destino, com os números de verdade ("os baralhos Kana e Kanji, com o
  progresso de 101 flashcards"), como a pergunta de hoje.
- **D4. A pasta "Grupo deletado: nome"**: o nome que o dono escreveu (o resto do site diz "apagar", mas o nome
  da pasta é o dele). Pasta nova na raiz das sem grupo, sem repetir uma irmã (`uniqueFolderName`: "… 2"). O
  nome de pasta tem no máximo 32 letras (`LABEL_MAX`): um grupo de nome longo fica "Grupo deletado: Estudo de
  Japo…". Grupo vazio (sem anotação nem pasta) não cria pasta nenhuma.
- **D5. Apagar tudo com compartilhadas soltas** (anotações compartilhadas uma a uma, num grupo seu): pelas
  mesmas regras do apagar em massa (`removalPlan`, PLANO-CONSERTO-GRUPOS.md, rodada 3): a sua só daqui sai;
  a sua compartilhada com outras pessoas sai **para todos**; da de outra pessoa você **sai** (ela continua
  com quem está nela). A folha diz quantas de cada, como a pergunta do apagar em massa (`removalAsk`).
  Levar e deixar sem grupo não mexem nelas na nuvem: o grupo e a pasta delas são de cada um.
- **D6. Grupo compartilhado, você é o dono**: os três destinos valem, e a folha avisa no alto: "Antes, o
  grupo deixa de ser compartilhado: Ana e Bia deixam de ver." Confirmar faz primeiro o **Parar de
  compartilhar** de sempre (`SharedGroupsStore.stop`: tudo o que está nele, até o que os outros escreveram,
  fica com você, no grupo de mesmo nome, com as pastas e o quadro), e só então o destino. Se a nuvem falhar
  no meio, nada local muda e a folha mostra o erro (como a parte Compartilhar).
- **D7. Grupo compartilhado, você não é o dono**: não há "Apagar o grupo" (o grupo é de outra pessoa; P4: o que
  você escreveu fica nele). No lugar, o botão **Sair do grupo…**, que leva à parte Compartilhar desse grupo,
  onde o Sair do grupo de sempre (`GroupShare.leave`) pergunta e sai. Nada duplicado.
- **D8. Levar para um grupo compartilhado**: só para um grupo **seu** compartilhado. As anotações entram nele, e o
  caminho de sempre as leva à nuvem uma a uma (`SharedGroupsStore.adopt`, com a pasta); as pastas que chegam
  vão para o documento do grupo (`NoteFolders.save`). Nada novo na nuvem. O grupo compartilhado de outra pessoa
  fica de fora (achado do `/code-review` da feature 1): enquanto as anotações não sobem, o nome dele no seu mural
  passa a ser de um grupo seu, e ele vira "Nome · Dona" (`groupNames`), deixando as anotações num grupo só seu.
- **D9. Sem Desfazer**: hoje apagar o grupo também não tem (um Desfazer só das anotações voltaria um grupo pela
  metade, sem pastas, quadro e baralhos). A folha é a confirmação: o botão vermelho diz o
  destino ("Apagar o grupo e as 12 anotações", "Apagar e levar para Estudos", "Apagar e deixar sem grupo"), e a
  linha de Apagar tudo diz que não volta. O bilhete depois diz o que aconteceu.
- **D10. Nada novo guardado no navegador**, nem na API ou no MCP (eles não apagam grupos). Todas as mudanças
  passam pelos caminhos que já sincronizam (anotações, configurações, pastas do documento, Kanban, Estudos,
  quadros livres).

## 3. Sincronização e várias pessoas

- Levar e deixar sem grupo regravam só as anotações do grupo (data nova em cada uma, como renomear hoje); as
  pastas mudam pelas configurações (ou pelo documento do grupo), nunca regravando anotação dentro de pasta.
  Outro aparelho que mexeu numa anotação ao mesmo tempo junta pela junção de sempre.
- Uma anotação que chega de outro aparelho ainda no grupo apagado (escrita offline) volta a criar o grupo,
  como hoje: o grupo existe pelas anotações. Na pasta: a pasta de antes virou lápide (apagar tudo) ou mudou
  de grupo (levar, sem grupo), e a regra da leitura a põe na raiz. Nada se perde.
- Grupo compartilhado: o Parar de compartilhar de sempre já trata quem está mexendo ao mesmo tempo (a nuvem
  responde pela versão; quem estava dentro perde o acesso na próxima conferida).

## 4. As features (uma por vez)

### Feature 1 — A regra (core, sem tela)

- `core/folders.ts`: `foldersOfGroupMoved` ganha `parent` (onde as de cima entram; a junção pelo nome olha as
  irmãs de lá) e respeita o teto de níveis (`MAX_FOLDER_DEPTH`: a que não cabe fica na raiz do grupo novo).
- `core/label-edits.ts`: `configMoved` ganha o jeito "apagar" (os padrões e o lugar na ordem não passam para o
  outro); `LabelEdits.deleteCategory(grupo, destino)` faz a tabela de D3 e devolve o que mudou; o caminho de
  renomear fica o mesmo.
- `core/note-bulk.ts`: o apagar em massa separa o "fazer" (`removeNow(plan)`) da pergunta, para o apagar tudo
  usar o mesmo caminho das compartilhadas (D5).
- Testes: `label-edits.spec.ts` (os três destinos, pasta escolhida, a de mesmo nome que junta, a pasta "Grupo
  deletado" que não repete e corta o nome, grupo vazio, Kanban, baralhos, quadros livres, tags) e
  `folders.spec.ts` (o `parent` e o teto); `note-bulk.spec.ts` (o caminho dividido).

### Feature 2 — A folha

- `ui/group-delete-sheet.ts` (D1, D2, D6) nas configurações do mural, no lugar do `Confirm`; o botão vira
  "Sair do grupo…" para quem não é o dono (D7). Bilhete do resultado.
- Testes: `group-delete-sheet.spec.ts` e `mural-config.spec.ts` (os testes da pergunta de hoje viram os da folha).

### Feature 3 — O grupo e a pasta de destino

- O `GroupPicker` ganha `exclude` e `canCreate`; a folha monta o `FolderPicker` do grupo escolhido, com o
  "Criar" de pasta (que cria a pasta no grupo, como o "Mover para…").
- Grupos compartilhados: o dono (D6, parar antes), o destino compartilhado (D8), os de leitura fora da lista.
- Testes de ponta a ponta na folha e com o `SharedGroupsStore` falso dos specs de compartilhar.

### Fechamento

Crítica do Impeccable (avaliadores isolados), `/code-review high` e os consertos; Novidades (NOVIDADES.md), DESIGN.md.

## 5. Andamento

- [x] Feature 1 (`/code-review mid`: 6 achados, todos consertados: o destino compartilhado de outra pessoa, o
  corte do nome com emoji, o Desfazer pela metade, as pastas das que ficaram, as tags fixas, a lista repetida)
- [ ] Feature 2
- [ ] Feature 3
- [ ] Fechamento
