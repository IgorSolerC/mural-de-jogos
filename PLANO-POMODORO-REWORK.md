# Pomodoro refeito (cartão "Rework tela pomodoro", 24/nov/2026)

O pedido: a página gastava a tela com o que não importa (os 12 relógios ocupavam metade dela; 2185px de altura num
notebook de 1366×768). Tudo tem de caber num monitor comum sem rolar; escolher o relógio é um botão sutil; música,
tempos e relógio ficam atrás de um botão, numa folha.

Dez versões no laboratório (`/extras/pomodoro-lab`, apagado no fim). O dono escolheu a **V1** (o relógio de pé numa
prateleira, os tomatinhos de hoje na tábua, três fitas Dymo na frente dela) com a **linha do dia da V5** (os estudos e
as pausas de hoje numa régua das horas). Odiou as orelhas de pasta na folha: a troca de parte é a cartela de adesivos
(`kit.adesivo-escolha`, a do "Quem vê?").

## A página (`/extras/pomodoro`)

De cima para baixo, numa tela só (a folga de 120px do pé das páginas sai, como no Kanban):

1. **A prateleira** (`app-shelf`, a de Outros), com o relógio grande de pé no meio e, à direita dele na tábua, um
   tomatinho por estudo completo hoje (até 6; o número certo está na régua do dia).
2. **As três fitas Dymo** na frente da tábua (`ui/_dymo.scss`): "25/5 min", a música da vez, o nome do relógio. Cada
   uma abre a folha na parte dela. São botões de verdade; crescem ao passar o mouse.
3. **O estado e os botões numa linha**: a frase à mão ("Estudando. A pausa começa às 14h35.") e Começar o foco /
   Pausar, Pular, desligar (X).
4. **A régua do dia**: a régua escolar das réguas de minutos (a mesma madeira, os riscos, os números), uma hora por
   risco grande. Cada estudo de hoje pintado com o marca-texto vermelho, cada pausa com o verde (as cores que a régua
   de minutos já usa para cada fase); o "agora" é o pedaço de fita-crepe com o traço, o cursor da régua de minutos.
   Em cima: "Hoje · 3 estudos · 1h15 de foco". O que está andando cresce ao vivo.

No celular: a mesma ordem, a tábua mais estreita, as fitas uma embaixo da outra, a régua da largura da tela.

## A folha (`ui/pomodoro-sheet.ts`)

A ficha de fichário dos diálogos, faixa vermelha. Embaixo do título, a cartela de três adesivos — Tempo, Música,
Relógio — cada um com o que está valendo embaixo do nome ("25/5 min", "3 músicas", "Tomate"). Altura fixa (trocar de
parte não faz a folha pular), o miolo rola.

- **Tempo**: as duas réguas de minutos, os atalhos Clássico/Longo/Profundo, o sininho (Ouvir).
- **Música**: o interruptor e a lista de sempre (`ui/pomodoro-tracks.ts`).
- **Relógio**: as 12 skins numa grade de 4 (recorte tracejado; a escolhida, contornada em tinta) e o canto da tela.

## O dado novo: as rodadas de hoje

`PomodoroSave` ganha `log` (os trechos andados hoje: início, fim, fase; até 96, só os do dia do aparelho) e `runAt`
(quando começou o trecho que está andando; null pausado ou desligado). Os trechos fecham em: pausar, pular, desligar
e no fim natural da fase (no `advance`, no fim exato, para duas abas gravarem o mesmo). Trecho de menos de 5 s não
entra. O Desfazer do desligar devolve o `log` e o `runAt` de antes. Fica em `meu-mural:pomodoro` (por aparelho, não
sincroniza; a limpeza do logout já o apaga pelo prefixo). Um site velho em cache que regrave o turno perde o `log`:
aceito (é só a régua do dia).

## Rodadas

1. O dado (`core/pomodoro.ts`, a store, testes). `/code-review mid`. BUILD 1039.
2. A folha nova (`ui/pomodoro-sheet.ts`), ainda sem ninguém abrir. `/code-review mid`. BUILD 1040.
3. A régua do dia (`ui/pomodoro-day.ts`), com a régua escolar saindo de `minutes-ruler.ts` para
   `ui/_regua-escolar.scss` sem mudar a aparência. `/code-review mid`.
4. A página nova: a prateleira, as fitas, a linha de ação, a régua do dia e a folha; os testes da página que eram dos
   ajustes vão para os da folha. `/code-review mid`.
5. A crítica do Impeccable, `/code-review high`, DESIGN.md, Novidades, fotos da build de produção.
