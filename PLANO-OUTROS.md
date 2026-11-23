# Outros: as Utilidades e os Extras numa parte só (23/nov/2026)

Pedido do dono: o Calendário, os Gastos e o Cofre moravam nas Utilidades, e o Pomodoro, as Pixel arts e os jogos nos
Extras, uma divisão que parecia arbitrária. Agora tudo fica numa parte só, com um nome melhor que "Extras". Saem as
abas Gastos, Calendário e Cofre de dentro dessas páginas, também no cofre, e as três vão para a prateleira, como o
Pomodoro, as Pixel arts e o Uso das APIs.

Processo pedido: este plano antes; uma feature por vez, cada uma com `/code-review mid` antes da próxima; o
Impeccable no começo e no fim; `/code-review high` no final.

---

## 1. A escolha (laboratório, 10 versões e duas rodadas de ajustes)

O dono escolheu a **V1**: uma tábua comprida com tudo. E pediu:

- **Fitas só com o nome:** Calendário, Gastos, Cofre, Pomodoro, Pixel arts, Uso das APIs.
- **O mesmo vão** entre as coisas (e nas pontas).
- **A tábua com profundidade:** o tampo em trapézio (a beirada de trás mais curta), a frente grossa. O suporte de ferro
  mostra só a barra presa na parede e o reforço do lado de dentro; o braço de cima fica escondido sob a tábua.
- **Pixel arts num monitor:** o CRT bege de computador antigo (V6), com a tela da TV-monitor cinza (V11): o chiado bem
  fraco atrás da arte, o escuro nas beiradas, as linhas do tubo e o brilho do vidro. Sem o pote de lápis nem as telas
  encostadas.

## 2. Decisões (minhas, ditas aqui)

- **D1. O nome é "Outros"** (o bilhete da barra: "Outros · de tudo um pouco"). No código a parte continua `extras`:
  a `Area`, os endereços `/extras/...`, as classes. Foi assim com o Grupo, que no código ainda é `category`. Nenhum
  link guardado quebra.
- **D2. Os endereços novos:** `/extras/gastos` e `/extras/calendario`. Os de antes (`/utilidades`,
  `/utilidades/gastos`, `/utilidades/calendario` e o ainda mais antigo `/anotacoes/calendario`) levam para lá com a
  query (o mês, o dia, o lembrete). O link de um lembrete escrito numa anotação continua abrindo o dia certo.
- **D3. A barra dessas páginas** fica como a das outras páginas de dentro de Outros: a volta "← Outros" no lugar das
  abas, o logo da seção (o carimbo do Calendário, o livro-caixa dos Gastos) e a contagem de hoje. Sem o seletor de
  mural: elas não dependem de mural.
- **D4. O Cofre na prateleira só para quem pode usá-lo** (`account().cofre`, como a aba de antes). É um link comum
  para a origem dele, na mesma aba e sem levar o endereço daqui.
- **D5. A prateleira:** no computador, uma tábua só com tudo e o mesmo vão entre as coisas. No celular, tábuas de três
  (`mediaSignal`, até 720px). Quem não é admin e não tem o cofre vê quatro coisas: no celular, duas tábuas de duas.
- **D6. As fitas dizem só o nome; o estado vai no nome acessível do link** ("Calendário: 2 lembretes hoje"), como as
  linhas dos letreiros.
- **D7. As peças novas** são componentes em `ui/shelf-pieces.ts`, cada uma com o visual do logo da sua página:
  - **a folhinha do Calendário**: o mês na tinta violeta do carimbo, o dia de hoje e o dia da semana. Um adesivo
    amarelo diz quantos lembretes há hoje (sem lembrete, sem adesivo).
  - **o livro-caixa dos Gastos**: a percalina verde com a lombada vermelha e o "Gastos" dourado. Um canhoto sai de
    dentro com o saldo do mês ("sobra R$ 1.240" ou "faltam R$ 80"); mês sem lançamento, sem canhoto.
  - **o cofre de aço**: a porta do logo do cofre, com o disco do segredo e a maçaneta.
  - **o monitor CRT das Pixel arts**: a obra mais nova na tela. Sem obra, a tela diz "desenhe a primeira".
  O tomate do Pomodoro e a prancheta do Uso das APIs ficam como estão.
- **D8. A tábua vira peça própria**, `ui/shelf.ts` (`app-shelf`): a tábua funda com os suportes, as coisas por cima. A
  página só diz o que vai nela.
- **D9. O topo do cofre:** Outros aceso no varal e, no lugar das abas, a volta "← Outros" para a página no Murall. O
  logo do cofre fica. Mexer no cofre pede "Publicar o cofre" (o dono roda).
- **D10. Nada guardado de novo, nada compartilhado, nada na nuvem.** Só mudam lugar e links: a regra do logout fica como
  está, e a sincronização não é tocada. A API e o MCP não montam links para `/utilidades` (conferido com `git grep`).

## 3. Features (uma por vez, cada uma com `/code-review mid`)

1. **A prateleira nova** na página de hoje: `app-shelf` com a tábua funda, as fitas só com o nome, o mesmo vão e o
   monitor CRT no lugar do cavalete (o Pomodoro, as Pixel arts e o Uso das APIs).
2. **O Calendário, os Gastos e o Cofre na prateleira**: a folhinha, o livro-caixa e o cofre de aço, com o que cada um
   mostra e os vazios. Ainda levam aos endereços de hoje.
3. **Outros**, no Murall e no cofre: os endereços novos e os de antes; o varal sem Utilidades e com Outros (ele é um
   dado só para os dois sites, por isso o cofre entra junto); a barra dessas páginas e a do cofre com a volta no lugar
   das abas; o bilhete "Outros".
4. **Fechamento**: a crítica do Impeccable, DESIGN.md e PRODUCT.md, o `/code-review high` e os consertos.
