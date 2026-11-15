# Conserto dos grupos compartilhados (15/nov/2026)

Pedido do dono (cartão "Ao compartilhar grupo com alguém, as notas começaram a sair das pastas
lentamente"): ao compartilhar o grupo de estudos de japonês com a Bruna (Gestora; o mesmo com Editora
em outro grupo), as anotações saíram das pastas uma a uma e não voltavam mais; não deu para apagar em
massa; uma tag posta pelo dono virou conflito para ela, e escolher uma versão fez a anotação sumir de
todos. Ele pede: consertar tudo, procurar a fundo o que mais perde ou corrompe anotações em grupo
compartilhado, poder apagar em massa, e restaurar o grupo antigo na conta dele (com os Flashcards)
como era em 14/nov às 14:00, sem tocar no grupo novo JAPONES e apagando as cópias sem grupo que
sobraram.

Processo pedido: este plano inteiro antes; uma rodada por vez, cada uma com `/code-review mid` antes da
próxima; testes de unidade que impeçam a volta de cada defeito; `/code-review high` no fim.

---

## 1. O que aconteceu (pela nuvem e pelo código)

Lido no D1 de produção (só leitura) e no mural privado da conta, em 15/nov:

- 14/nov, 23:36–23:40 UTC: as 178 anotações do grupo **Estudo Japones** subiram para a nuvem uma a
  uma (`SharedGroupsStore.adopt`, uma a cada 1,4 s). Na nuvem elas **continuam com a pasta** (175 das
  178). O que sumiu foi a pasta **na tela**:
  `SharedStore.shown` tira `folder` da anotação de grupo antes de pôr no mural
  (`const { subject, folder, ...rest } = e.view`, com o comentário "a pasta de cada um é a de um grupo
  dele: no compartilhado, ela não vale"). Por isso cada uma "saía da pasta" quando chegava à nuvem.
- Pôr de volta não funcionava: a pasta ia para a nuvem (`NoteFolders.place` → `SharedStore.save`), mas o
  mural voltava a tirá-la. E pior: **qualquer gravação feita a partir da tela** (uma tag, finalizar, o
  editor) mandava a anotação sem a pasta, e a nuvem a perdia de verdade (3 das 178, e as da Bruna).
- As pastas moram nas configurações do mural de cada um (`NotesConfig.folders`). A Bruna não tinha as
  pastas do dono: para ela, toda anotação do grupo estava fora de pasta, e qualquer gravação dela tirava
  a pasta para todos (a "Hiragana Básico", rev 6, gravada por ela sem a pasta).
- Parar de compartilhar (23:55) soltou as 178 do grupo na nuvem, mas elas **continuaram compartilhadas
  (só com o dono)** e sem grupo: `placeInGroup` pôs o grupo, mas a pasta e as tags, que no grupo ficam no
  conteúdo, sumiram (fora do grupo elas são de cada um e o conteúdo não as mostra).
- Apagar em massa: `NoteBulk.act('apagar')` e o botão do pé da folha (`removable`) deixam de fora toda
  compartilhada, até as que são só do dono. As 178 não tinham como sair a não ser uma a uma.
- A "Hiragana Tabela" é a **Hiragana Básico**: está no grupo JAPONES, **finalizada** (`doneAt`) e sem
  pasta, gravada pela Bruna às 23:58:41. A versão escolhida no conflito estava finalizada, e anotação
  finalizada sai do mural. A folha do conflito não diz que uma das versões está finalizada, nem mostra
  as tags (`differences` em `ui/conflict-sheet.ts` não olha `doneAt` nem `tags`).
- O conflito nasceu porque, num grupo, a pasta e as tags valem inteiras (`mergeNote`, `atomic`): o dono
  pôs uma tag e o aparelho da Bruna tinha tirado a pasta (pelo defeito acima); duas mudanças em
  "o grupo e a pasta" de jeitos diferentes viram conflito.
- Os Flashcards: o baralho do grupo saiu às 22:55 UTC, com as cartas; o backup diário de 14/nov
  (13:45 UTC, 10:45 em Brasília) tem o baralho, as cartas e o progresso.

## 2. As rodadas

Cada rodada: testes novos que falham sem o conserto, a suíte inteira e os de Node, `npx ng build`,
Novidades, BUILD + 1, commit e push, `/code-review mid` e os consertos dele antes da próxima.

### Rodada 1 — A pasta não sai mais

1. `SharedStore.shown` mantém a pasta da anotação de grupo (só o assunto de antes sai).
2. Tirar do grupo (parar de compartilhar, `moveToGroup(null)`): a pasta e as tags, que estavam no
   conteúdo, passam para o lugar de cada um (`pessoal`) antes de a nuvem as tirar, junto com o grupo.
3. Testes (`shared-store.spec.ts`): a de grupo aparece na pasta; salvar a vista não tira a pasta; mudar a
   tag mantém a pasta na nuvem; parar de compartilhar mantém grupo, pasta e tags.

*Pronto quando*: compartilhar um grupo com pastas não tira nenhuma anotação da pasta, nem na tela nem
na nuvem, e parar de compartilhar devolve tudo onde estava.

### Rodada 2 — As pastas do grupo são do grupo

O que o PLANO-COMPARTILHAR.md deixou para depois ("as pastas do grupo: cada um tem as suas"): sem isso,
a Bruna não vê pasta nenhuma e qualquer gravação dela tira a pasta para todos.

1. O documento do grupo ganha `pastas` (a mesma forma de `NoteFolder`, sem o `group`, que é o grupo).
2. `NoteFolders.tree` monta as suas pastas com as dos grupos compartilhados (no nome que o grupo tem no
   seu mural). Criar, renomear, mover, desfazer e juntar uma pasta de grupo compartilhado gravam no
   documento do grupo (`SharedGroupsStore.updateFolders`), com a junção pasta a pasta quando outra
   pessoa gravou antes; quem só lê não mexe.
3. Compartilhar leva as pastas do grupo para o documento; parar de compartilhar as devolve às suas
   configurações; as suas pastas guardadas daquele grupo valem até o documento ter as dele.
4. Testes: a árvore com as pastas do grupo (com nome "· Ana"); criar e renomear vão ao documento;
   a junção de duas mexidas; a membro vê as pastas do dono.

### Rodada 3 — Apagar em massa e o que sobra de um grupo parado

1. A folha das marcadas mostra **Apagar** também para as compartilhadas que a pessoa pode apagar (as suas
   e, num grupo, pelo papel: P3 do PLANO-COMPARTILHAR.md); as de outros donos "saem" (Sair da anotação),
   e a pergunta diz quantas de cada. Antes de apagar para todos, cada uma fica guardada em Ajustes ›
   Backup (versões guardadas), porque apagar na nuvem não tem Desfazer.
2. Parar de compartilhar devolve ao seu mural, como anotações comuns, as do grupo que ficaram só com
   você (sem ninguém nelas): elas não ficam mais "compartilhadas com ninguém" para sempre.
3. Testes: o botão aparece; apagar as suas compartilhadas chama a nuvem e guarda a versão; as de outros
   saem; parar de compartilhar traz de volta como comuns, com grupo, pasta e tags.

### Rodada 4 — Conflito sem surpresa

1. A junção de uma de grupo junta as tags como conjunto (o que um pôs e o outro não tirou entra; o que
   um tirou sai): pôr uma tag não briga mais com a mudança de pasta de outra pessoa.
2. A folha do conflito diz o que muda de verdade entre as duas, também finalizada/aberta, as tags e a
   pasta; a versão finalizada diz "finalizada" no topo dela.
3. Escolher uma versão nunca finaliza nem reabre a anotação por conta de uma terceira versão: vale o
   check da escolhida.
4. Testes de `mergeNote` (tags e pasta) e da folha.

### Rodada 5 — A restauração da conta do dono

Fora do código do site (um script só desta vez, em `api/scripts/`), com o dono no comando:

1. A partir do backup diário de 14/nov (13:45 UTC) e das versões de depois que ainda estão na nuvem
   (anotações mexidas entre 10:45 e 14:00 de Brasília), montar o grupo Estudo Japones como era: as
   anotações, as pastas, o baralho e as cartas com o progresso.
2. Não tocar no grupo JAPONES (o compartilhado com a Bruna, as anotações dele, as pastas dele). As
   anotações dele que vieram do grupo antigo ficam duplicadas: a cópia restaurada ganha um id novo (as
   cartas dos Flashcards apontam para ele).
3. Apagar as compartilhadas sem grupo que sobraram do grupo antigo (as 178) e as 92 que ficaram sem
   grupo no mural privado.
4. Antes de gravar: um relatório do que muda (quantas voltam, quais ficam duplicadas, o que sai) para o
   dono aprovar; ele sai da conta em todos os aparelhos (a limpeza do navegador apaga o guardado), e só
   então a nuvem é gravada, uma vez, com o `rev` seguinte. Ao entrar de novo, o aparelho baixa tudo da
   nuvem.

### Rodada 6 — Fechamento

A varredura (seção 3) conferida de novo, o `/code-review high` e os consertos dele.

## 3. A varredura (o que mais perde ou estraga em grupo compartilhado)

Achados enquanto lia o código; cada um entra na rodada que diz:

| O quê | Onde | Rodada |
|---|---|---|
| A vista do mural tira a pasta da anotação de grupo, e salvar a vista a apaga da nuvem | `SharedStore.shown` | 1 |
| Parar de compartilhar perde pasta e tags | `SharedGroupsStore.stop`, `placeInGroup` | 1 |
| As pastas são de cada um: o membro não vê nenhuma e tira a pasta de todos ao gravar | `NoteFolders`, documento do grupo | 2 |
| Apagar em massa ignora toda compartilhada | `NoteBulk.act`, `BulkEditSheet.removable` | 3 |
| O que sobra de um grupo parado vira "compartilhada com ninguém" para sempre | `SharedGroupsStore.stop` | 3 |
| Tags de grupo valem inteiras: qualquer tag de dois lados vira conflito | `mergeNote` | 4 |
| A folha do conflito esconde que uma versão está finalizada | `differences` | 4 |

## 4. Andamento

- [x] Rodada 1 — A pasta não sai mais (BUILD 890). O /code-review mid achou 5, consertados: entrar num grupo leva a pasta da solta (e a de outro grupo sai), o lugar só muda depois de a nuvem aceitar tirar do grupo, e o teste de parar de compartilhar como a nuvem faz de verdade
- [ ] Rodada 2 — As pastas do grupo são do grupo
- [ ] Rodada 3 — Apagar em massa e o que sobra de um grupo parado
- [ ] Rodada 4 — Conflito sem surpresa
- [ ] Rodada 5 — A restauração da conta do dono
- [ ] Rodada 6 — Fechamento
