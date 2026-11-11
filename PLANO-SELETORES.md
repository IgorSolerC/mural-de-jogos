# Seletores com muitas opções

Pedido do dono em 07/nov/2026 (cartão "Solucionar campos de seleção com muitos itens ocupando muito
espaço", feito em 11/nov): varrer o site atrás das escolhas em que há muitas opções soltas, poluídas e
chatas de usar, e corrigir todas; o que se repete (o ícone, em vários lugares) ganha uma correção só,
que serve para todos. Três prints vieram junto: as etiquetas do assunto (hoje a árvore das pastas), a
cartela de 110 ícones e a cartela de bônus aberta.

## A varredura

| Onde | Quantas | Como está | O que muda |
|---|---|---|---|
| Ícone do grupo (Configurações do mural, editor) | 110 | grade inteira, 11 fileiras | 1 |
| Ícone da coluna do Kanban | 110 | grade inteira | 1 |
| Ícone do baralho (Estudos) | 110 + Sem ícone | grade inteira | 1 |
| Ícone do lembrete (Calendário) | 110 + Sem ícone | fechada até "Escolher", depois a grade inteira | 1 |
| Ícone da senha e do grupo do cofre | 110 + o de sempre | grade inteira numa folha solta | 1 |
| Bônus da ficha (os cinco murais) | ~22 a favor, ~18 contra, mais os escritos | todos de uma vez, em dois lados | 2 |
| Grupo da anotação (editor, Organizar, Editar as marcadas, Copiar baralho) | todos os grupos | todas as orelhas, sem teto | 3 |
| Tags da anotação (editor) | todas as do grupo | 24 de uma vez, depois "Mais N" | 3 |
| Pasta da anotação | a árvore | já resolvida pelas pastas (09/nov): só o primeiro nível aberto | — |
| Tags no Filtrar | todas | 10 + "+N" (o padrão que fica) | — (vira a peça comum) |
| Linguagem do código, emojis | dezenas | já têm busca (e gavetas, nos emojis) | — (são o modelo) |
| Cores, papéis, jeitos, temas, paletas | até 12 | cabem numa fileira ou duas | — |
| Categoria dos Gastos | as do dono | `<select>` nativo | — |

## O que ficou (depois de duas rodadas com o dono)

A primeira ideia (gavetas por assunto mostrando uma de cada vez; nos bônus, grupos e tags, os mais usados
à mão e o resto num "+N") foi recusada: "quero poder ver tudo de uma vez se eu quiser… até prefiro que abra
em um modal" e "não quero soluções simplistas; repense a forma que a informação é entregue". Então:

1. **Ícone** (`ui/icon-chart.ts`, uma peça só para grupo, coluna, baralho e lembrete): na folha, uma linha
   com o escolhido, o nome e "Trocar"; o Trocar abre por cima a cartela inteira, os 110 desenhos em dez
   seções por assunto, com a busca pelo nome e pelo sentido (`shared/cartela-de-icones.ts`). O cofre ganhou as
   mesmas seções e a busca na folha dele.
2. **Bônus**: na ficha, só os colados e o botão; a escolha abre uma folha de prós e contras (A favor e
   Contra lado a lado, um por linha, com a caixinha e em quantas fichas cada um está, a média ao vivo e a
   busca que também cola um novo). No celular, as colunas viram abas.
3. **Grupo e Tags** no editor: em linhas e em colunas, como a Pasta ao lado (`ui/_indice.scss`), com as
   contagens; o grupo em ordem alfabética, as tags com a caixinha e a estrela.

Fora do escopo, porque já estavam bem: a Pasta (a árvore), as tags do Filtrar (dez e o "+N", com o riscar),
a linguagem do código e os emojis (busca), cores, papéis e jeitos (cabem numa fileira), a categoria dos
Gastos (lista nativa).
