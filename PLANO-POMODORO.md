# Plano: Pomodoro nos Extras

Pedido do dono em 08/nov/2026: um timer Pomodoro configurável nos Extras. Enquanto está ligado, um relógio
pequeno fica num canto da tela em todas as páginas, com o tempo que falta para a pausa (ou para a volta ao
estudo). O relógio tem um botão discreto para tirá-lo, e só volta quando o Pomodoro for ligado de novo
na página. Música durante o estudo (link do YouTube ou um MP3, com uma música padrão), que também dá para
desligar. Pelo menos 10 skins para o relógio. Estudo e pausa vão de 5 a 120 minutos.

Este documento decide tudo antes do código. Ninguém precisa escolher nada para a implementação começar:
o que não foi pedido está decidido aqui, com o motivo, e pode ser revertido depois.

---

## 1. O que a pessoa faz (os três caminhos)

1. **Primeira vez.** Extras › ficha "Pomodoro" (nova prateleira **Foco**) › a página abre com o relógio
   grande na vitrine, 25/5 já escolhidos e a música padrão ligada. Um botão: **Começar o foco**. Clicou,
   o relógio aparece no canto e a música começa. Dá para sair da página: o relógio vai junto.
2. **No dia a dia.** O relógio do canto mostra a fase (Estudo ou Pausa) e o tempo. Com o mouse em cima
   (ou um toque, no celular) aparecem quatro botões separados: pausar/continuar, pular a fase, música
   liga/desliga e **tirar** (X). Na troca de fase toca um sininho, o relógio balança e a música para na
   pausa e volta no estudo.
3. **Parar.** O X do canto (ou **Desligar** na página) desliga o Pomodoro: o relógio some, a música para.
   O recado diz "Pomodoro desligado" com **Desfazer** (5 s). Depois disso, só a página liga de novo.

O que torna isso fácil: um botão principal só na página; os ajustes já vêm prontos; nada de formulário
antes de começar; mudar um tempo vale na hora.

---

## 2. Onde mora

| Peça | Arquivo | Por quê |
|---|---|---|
| Regras e estado (puros, sem Angular) | `src/app/core/pomodoro.ts` | Testáveis sem DOM: fases, avanço, pausa, limites, leitura do guardado. |
| Serviço (sinais + gravação + abas) | `src/app/core/pomodoro-store.ts` | Pequeno, entra no bundle inicial só para o app saber se o relógio aparece. |
| Página | `src/app/pages/pomodoro-page.ts` (+ `.html`, `.scss`) | Rota preguiçosa `/extras/pomodoro`. |
| Relógio do canto | `src/app/ui/pomodoro-corner.ts` | Montado em `app.html` por `@defer (when pomodoro.on())`: fora do bundle inicial, e só baixa quando alguém liga. |
| Mostrador (as skins) | `src/app/ui/pomodoro-dial.ts` + `pomodoro-dial.scss` | Um componente só desenha as 12 skins; o canto, a vitrine e a cartela de escolha usam o mesmo. |
| Música | `src/app/ui/pomodoro-music.ts` | O player escondido mora dentro do relógio do canto, que nunca sai da tela enquanto liga: troca de página não corta a música. |
| Sininho | `src/app/core/chime.ts` | Web Audio sintetizado, sem arquivo para baixar. |
| Sete segmentos e plaquinhas | `src/app/ui/seven-segment.ts` + `ui/_relogio-digital.scss` | Os polígonos dos algarismos e o CSS das plaquinhas que viram moravam em `ui/countdown.ts`; saíram para cá e o Contador e o Pomodoro usam os mesmos (o CSS do contador sai igual). |
| Régua dos minutos | `src/app/ui/minutes-ruler.ts` | A peça nova da seção 4. |

Rota: `{ path: 'extras/pomodoro', title: 'Pomodoro', loadComponent: … }`, **sem** o `enterExtras`, como o
Uso das APIs: a página não depende de mural. O varal acende Extras pelo prefixo `/extras` (conferir em
`areaOf`).

Ficha em Extras (`pages/extras-page.ts`), prateleira nova **Foco** entre Números e Jogos:

- nome **Pomodoro**, ícone `ICON.cronometro` (Timer), cartolina `var(--stock-vermelho)`, tachinha `#7be986`
  (o verde do cabinho do tomate), etiqueta **Abrir**.
- frase: "Estudo e pausa em turnos, com um relógio no canto da tela em qualquer página e música para
  concentrar."
- Ligado, a ficha ganha um adesivo pequeno "ligado" (o mesmo amarelo `--hi`), para quem esqueceu.

---

## 3. Regras do relógio (`core/pomodoro.ts`)

### Estado guardado

Uma chave só, por aparelho: **`meu-mural:pomodoro`** (localStorage, por `writeJson`). Não sincroniza
com a nuvem (é preferência do aparelho, como o volume) e por isso não entra em `localHasContent`.

```ts
interface PomodoroSave {
  v: 1;
  // ajustes
  study: number;        // minutos, 5..120, de 5 em 5
  rest: number;         // minutos, 5..120, de 5 em 5
  skin: PomodoroSkin;   // uma das 12
  corner: 'se' | 'sd' | 'ie' | 'id';   // superior/inferior, esquerda/direita
  music: boolean;       // tocar no estudo
  musicUrl: string;     // '' = a padrão
  // o turno
  on: boolean;
  phase: 'estudo' | 'pausa';
  startedAt: number;    // quando a fase começou (ms), descontadas as pausas
  pausedAt: number | null;  // pausado desde (ms); null = andando
  // o dia
  day: string;          // AAAA-MM-DD do aparelho
  done: number;         // estudos completos hoje (os tomatinhos)
}
```

`readPomodoro(raw)` confere cada campo e cai no padrão no que estiver estranho (25, 5, `tomate`, `id`,
música ligada, desligado). Nunca lê no nível do módulo (regra do CLAUDE.md): o serviço lê no construtor.

### Tempo

- O que falta vem sempre do relógio do aparelho: `fim = startedAt + duração`, `falta = fim − agora`
  (pausado: `fim − pausedAt`). Nada conta segundos num contador próprio, então várias abas e uma aba que
  dormiu mostram o mesmo tempo.
- **Avanço**: quando `falta ≤ 0`, a fase troca e `startedAt` da nova é o `fim` da velha (não "agora"):
  determinístico, duas abas que avançam juntas gravam o mesmo valor.
- **Murall fechado por muito tempo**: se ao abrir já passou mais de uma fase inteira depois do fim, o
  turno não fica girando sozinho: vai para o começo do próximo **estudo, pausado**, e o relógio diz
  "Pausado". (Abrir o computador de manhã e achar o Pomodoro na 14ª volta não serve para ninguém.)
- **Mudar um tempo com o turno andando** vale na hora para a fase atual, guardando o que já passou: de 25
  para 30 com 10 corridos, faltam 20. Se o novo tempo já passou, a fase termina agora.
- **Pular**: a fase acaba agora (começa a próxima com `startedAt = agora`). Pular o estudo não conta
  tomatinho.
- **Tomatinhos**: cada estudo que chega ao fim soma 1 em `done`. Virou o dia do aparelho, zera.
- Limites: `clampMinutes(n)` arredonda para o múltiplo de 5 mais perto, entre 5 e 120.

### Abas

- O serviço ouve o `storage` da chave (como `core/volume.ts`): outra aba liga, pausa ou troca a skin e
  esta acompanha na hora.
- **A música toca numa aba só.** Quem quer tocar pede a trava `meu-mural:pomodoro-musica` por
  `navigator.locks` e a segura enquanto existir. As outras esperam na fila; fechou a aba que tocava, a
  próxima pega a trava e a música continua nela. Sem `navigator.locks`, toca em todas (navegador antigo).
- **O sininho** também toca numa aba só: a que tem a trava da música, ou, sem música, a que está visível.

---

## 4. A página (`/extras/pomodoro`)

Modo **Operate**: a pessoa vem fazer uma coisa (ligar, ajustar). A marca está nos detalhes, não em
enfeite que atrapalha.

### Estrutura: a bancada de foco

```
┌──────────────────────────────── parede ────────────────────────────────┐
│  VITRINE (esquerda, ~44%)            │  FOLHA DE SÚMULA (direita)       │
│                                      │  ┌────────────────────────────┐  │
│     [ o relógio grande, na skin     ]│  │ Tempos                     │  │
│     [ escolhida, 2,4× o do canto    ]│  │  Estudo  ─┼───────── 25 min │  │
│                                      │  │  Pausa   ┼────────── 5 min  │  │
│     ESTUDO · 1º turno                │  │  [25/5] [50/10] [90/20]    │  │
│     🍅🍅🍅  3 hoje                    │  ├────────────────────────────┤  │
│                                      │  │ Música                      │  │
│  [ Começar o foco ]                  │  │  Tocar no estudo     (o—)   │  │
│  ou  [Pausar] [Pular] [Desligar]     │  │  [ link do YouTube ou MP3 ] │  │
│                                      │  │  "Sem link: lofi padrão."   │  │
│                                      │  └────────────────────────────┘  │
├──────────────────────────────────────┴───────────────────────────────────┤
│  CARTELA DE RELÓGIOS: as 12 skins, cada uma viva e pequena               │
│  [tomate][bilhete][placar][neon][lcd][lousa][ampulheta][cassete]...      │
│  Canto da tela: [↖][↗][↙][↘]  (ou arraste o relógio)                     │
└──────────────────────────────────────────────────────────────────────────┘
```

No celular a vitrine vem primeiro, depois a folha, depois a cartela (duas colunas de skins).

### Peças reaproveitadas

- A folha: `.regras/.folha` + `r-head`, `rotulo`, `escolhas`/`escolha` de `pages/_extras-kit.scss` (o
  bloquinho de súmula com o pé serrilhado, o mesmo dos jogos).
- Linhas título + frase à esquerda e controle à direita: `kit.linha`, `kit.linha-titulo`, `kit.linha-desc`.
- O interruptor da música: `kit.interruptor` (com `.bolinha`).
- O link: `kit.campo` + `kit.campo-erro`, validado por `parseAudio` (`core/widgets.ts`), com a mesma frase
  de erro do widget Áudio.
- Os botões: `btn-ink` (Começar o foco), `kit.botao-papel` (Pausar, Pular), `btn-quiet` (Desligar).
- O canto da tela: `kit.segmentos`/`kit.segmento` com 4 opções.
- Os atalhos de tempo: `kit.adesivo-escolha` (25/5 Clássico · 50/10 Longo · 90/20 Profundo).
- O título da cartela: `tape-label` (a fita das prateleiras de Extras).

### A régua dos tempos (peça nova)

Não há controle de minutos no site. Cada tempo é uma **régua escolar** (a de `pages/stats/regua.ts` é a
inspiração: risquinhos a tinta, números Barlow Condensed) com um cursor de fita-crepe que desliza. Por
baixo, um `<input type="range" min=5 max=120 step=5>` de verdade (teclado, leitor de tela, toque), só
vestido. Ao lado, o número grande a marcador ("25") e "min". Botões − e + de 5 em 5 para quem não quer
arrastar. As duas réguas são o mesmo componente (`app-minutes-ruler`), com a cor da fase: vermelho-tomate
no estudo, verde no descanso.

### Estados da página

| Estado | Vitrine | Botões |
|---|---|---|
| Desligado | relógio parado em 25:00, "Pronto para começar" | **Começar o foco** |
| Estudo andando | contando, "Estudo · 2º turno" | Pausar · Pular a fase · Desligar |
| Pausa andando | verde, "Pausa · respira" | Pausar · Pular a fase · Desligar |
| Pausado | piscando devagar (sem animação com movimento reduzido), "Pausado" | **Continuar** · Pular · Desligar |
| Link inválido | erro embaixo do campo, a música padrão segue valendo | — |

### Escrita

Português do Murall, curto e direto. "Começar o foco", "Pausar", "Continuar", "Pular a fase",
"Desligar". Nada de "Iniciar sessão Pomodoro". A frase da vitrine muda pela fase: "Estudo · 2º turno",
"Pausa · respira um pouco", "Pausado".

---

## 5. O relógio do canto (`ui/pomodoro-corner.ts`)

- **Sempre à vista enquanto ligado**, em toda página do Murall (inclusive a ficha aberta pelo link: o
  dono ligou e está usando). Fica fora da impressão (`@media print`).
- `position: fixed` num dos quatro cantos (padrão: embaixo à direita), a 16px da borda (`env(safe-area-*)`
  no celular). Por cima da página, por baixo dos `<dialog>` (que vão para a camada de cima sozinhos).
- **Arrastar**: segurar e soltar perto de outro canto leva o relógio para lá (encaixa, com a mola de
  `--ease-physical`) e grava `corner`. Clique sem arrasto não conta como arrasto (limiar de 6px).
- **Os botões** aparecem com o mouse em cima ou com o foco do teclado. No toque (sem mouse), o primeiro
  toque no relógio mostra os botões por 5 s e o segundo abre a página: à mostra o tempo todo, tampariam a
  página. Seguem a regra do CLAUDE.md dos botões de hover, pelos mixins de
  `ui/_etiqueta-acoes.scss` (`grupo`, `botao`, `mostra`, `cor-na-mao`), cada um uma etiqueta de tinta
  separada que cresce e ganha cor: pausar/continuar (amarelo), pular (azul), música (lilás) e tirar
  (vermelho). O teste usa `expectEtiquetaPadrao`.
- **Tirar (X)**: desliga o Pomodoro. Recado `Toasts.show('Pomodoro desligado', { label: 'Desfazer' })`.
- Na troca de fase: o sininho, um balanço de 600 ms (sem movimento com `prefers-reduced-motion`), e a
  palavra da fase troca.
- Clicar no mostrador (sem arrastar) abre a página do Pomodoro.
- Acessível: `role="timer"`, `aria-label` com fase e minutos ("Estudo: faltam 12 minutos"), atualizado
  por minuto (não a cada segundo, para não falar sem parar). Os botões têm `aria-label` e `title`.
- Liga o `Clock` do site (`core/clock.ts`, `use()`), o mesmo que anda os contadores: sem relógio na tela,
  nada roda.

---

## 6. As 12 skins (`ui/pomodoro-dial.ts`)

Todas mostram as mesmas quatro coisas, sempre legíveis a 2 metros: **o tempo** (mm:ss, até 120:00),
**a fase** (palavra ou cor, nunca só a cor), **o andamento** (quanto da fase já foi) e **pausado**. A
cor da fase é uma só no site todo: estudo no vermelho do tomate (`--red`), pausa no verde
(`--stock-verde`/`#10a64a`). Tudo mede em `em` de um `--u` (o lado do relógio), para o mesmo desenho servir
no canto (1×), na vitrine (2,4×) e na cartela (0,7×).

| # | Skin | O que é | Andamento | Fase | Reuso |
|---|---|---|---|---|---|
| 1 | **Tomate** | O timer de cozinha que deu nome ao método: tomate vermelho brilhante com o cabinho verde e os números numa faixa creme. | o cabinho gira como o botão do timer | na pausa, o tomate fica verde (ainda não maduro) | — |
| 2 | **Bilhete** | Post-it amarelo com fita-crepe em cima, números a marcador, a fase escrita a caneta. | risquinhos de caneta embaixo, um por quinto | pausa: post-it verde | papel e fita do site (`--tape`, `--f-marker`, `--f-hand`) |
| 3 | **Placar** | Plaquinhas que viram, de estação. Cada algarismo que muda vira de cima para baixo. | uma lâmpada-régua embaixo | a plaquinha da fase ("ESTUDO"/"PAUSA") | o mesmo desenho do placar do Contador |
| 4 | **Neon** | Letreiro de relógio digital num tubo azul, algarismos de sete segmentos vermelhos (os apagados de leve). | um traço de neon embaixo que encurta | pausa: neon verde | `ui/seven-segment.ts` |
| 5 | **LCD** | Relógio de pulso digital: visor esverdeado, segmentos escuros, pulseira de borracha cortada nas pontas. | barrinhas de bateria | ícones "EST"/"PAU" acesos no visor | `ui/seven-segment.ts` |
| 6 | **Lousa** | Lousinha de moldura de madeira, números a giz com poeira. | tracinhos de contagem a giz | a fase escrita a giz | `kit.giz` |
| 7 | **Ampulheta** | Ampulheta de madeira desenhada em SVG; a areia de cima desce de verdade com o tempo. | a areia | pausa: areia verde-água | — |
| 8 | **Cassete** | Fita cassete; os carretéis giram enquanto anda e a fita passa de um para o outro. Etiqueta com o tempo à mão. | o rolo de fita em cada carretel | lado A (estudo) / lado B (pausa) | a ideia da fita do widget Áudio |
| 9 | **Vinil** | O disco preto girando; o braço da agulha anda da borda para o meio com o tempo; o rótulo central tem o tempo. | o braço | rótulo vermelho (estudo) / verde (pausa) | as cores e o brilho de `ui/_vinyl.scss` |
| 10 | **Disco** | Timer de setor: mostrador branco com risquinhos de minuto e a fatia colorida que encolhe (o mais legível de todos à distância). | a fatia | a cor da fatia + a palavra | — |
| 11 | **Dymo** | Fita Dymo preta com o tempo em relevo creme, torta, presa por duas tachinhas. | uma segunda fitinha com ▮▮▮▯▯ | a palavra na fita | a fita Dymo do perfil (cores `dymo-tape`, `dymo-emboss`) |
| 12 | **Broche** | Broche de lata redondo, como os bottons do topo, com o anel de andamento no aro. | o anel | a estampa muda de cor | `ui/_broche.scss` (`lata`, `aro-aceso`) |

Cada skin é um bloco do `@switch` no template e uma seção de `pomodoro-dial.scss` (styleUrl, nunca
`styles: CONST`, que não passa pelo Sass nos testes). Na página, os 12 ficam pendurados em pregos, como
numa relojoaria, cada um vivo (o tempo de verdade com o Pomodoro ligado; desligado, 18:42 de amostra). Movimento
contínuo (carretéis, disco, areia) para com `prefers-reduced-motion` e quando pausado.

---

## 7. A música (`ui/pomodoro-music.ts`)

- **Padrão**: `https://www.youtube.com/watch?v=XaWjY0pGhFs&list=RDXaWjY0pGhFs&start_radio=1`. O player abre
  o vídeo com a lista (`embed/XaWjY0pGhFs?list=RDXaWjY0pGhFs`), então a rádio continua depois da primeira
  música. Link próprio do YouTube com `list` também segue a lista; sem `list`, o vídeo repete
  (`loop=1&playlist=<id>`).
- **MP3** (ou qualquer arquivo que `parseAudio` aceite): `<audio loop>`. Vimeo também funciona, porque o
  `parseAudio` já aceita e a `EmbedBridge` já fala com ele.
- O link é validado por `parseAudio`; o que não toca mostra o erro e a padrão continua valendo.
- **Toca só no estudo.** Na pausa, abaixa em 1,5 s e pausa; na volta, continua de onde parou e sobe em
  1,5 s. Pausar o Pomodoro pausa a música.
- O volume é o do site (`core/volume.ts`, `soundVolume()`), o mesmo do alto-falante dos widgets.
- O player do YouTube é o mesmo jeito do widget Áudio: iframe escondido do `youtube-nocookie.com` com
  `enablejsapi=1`, conversando pela `EmbedBridge` (play, pause, volume). O CSP já deixa (`frame-src` e
  `media-src https:`).
- **Navegador segurou o som** (recarregou a página no meio do estudo, sem clique ainda): pediu para tocar
  e o tempo não andou em 3,5 s (ou o `play()` do `<audio>` recusou) → o relógio do canto mostra o bilhete
  **Tocar a música**, e o próximo clique em qualquer lugar da página já solta o som.
- Música desligada (interruptor na página ou o botão do canto): o player nem é montado.

---

## 8. O sininho (`core/chime.ts`)

Web Audio, sem arquivo: dois toques de sino (seno com harmônico e decaimento) subindo na volta ao estudo,
descendo no começo da pausa. Respeita o volume do site e o calado. O `AudioContext` nasce no primeiro
clique (Começar o foco) e fica guardado; sem ele (página recarregada sem clique), o sininho não toca e
nada quebra.

---

## 9. A regra do logout (CLAUDE.md)

- Chave `meu-mural:pomodoro`: o prefixo já faz `wipeBrowser` apagá-la. Gravada por `writeJson`, que
  respeita o `freezeStorage`.
- Nada em IndexedDB, cache, cookies.
- A trava `navigator.locks` não guarda nada.
- Teste em `core/browser-reset.spec.ts`: a chave do Pomodoro sai na limpeza.
- Não é conteúdo de conta (não sincroniza), então fica fora de `localHasContent`.
- Sair da conta com o Pomodoro ligado: a página recarrega limpa, o relógio some (o estado foi junto).

---

## 10. Orçamento e desempenho

- No bundle inicial: só `core/pomodoro.ts` e `core/pomodoro-store.ts` (poucos kB).
- O relógio do canto, as skins, a música e o sininho chegam num pedaço à parte, pelo `@defer` em
  `app.html`, só quando o Pomodoro liga. A página é rota preguiçosa e reusa o mesmo pedaço das skins.
- Um tique por segundo do `Clock` compartilhado; as animações contínuas são CSS (`transform`/`rotate`).
- `npx ng build` antes do commit (regra do orçamento).

---

## 11. Testes

- `core/pomodoro.spec.ts`: leitura do guardado (estranho cai no padrão), limites 5..120 de 5 em 5, começar,
  pausar/continuar (o tempo não anda pausado), pular, avanço determinístico (duas abas gravam igual),
  Murall fechado por muito tempo (cai no estudo pausado), mudar o tempo no meio, tomatinho só no estudo
  completo e zera no outro dia, formato mm:ss até 120:00.
- `core/browser-reset.spec.ts`: a chave sai na limpeza.
- `ui/pomodoro-dial.spec.ts`: as 12 skins desenham o tempo e a fase em texto (legível ao leitor de tela);
  pausado marca a classe.
- `ui/pomodoro-corner.spec.ts`: aparece ligado, o X desliga e o Desfazer religa, botões no padrão
  (`expectEtiquetaPadrao`), arrasto troca o canto.
- `pages/pomodoro-page.spec.ts`: Começar liga, os tempos mudam pelo range, o link inválido mostra erro,
  a skin escolhida grava.
- `pages/extras-page.spec.ts`: a prateleira Foco com a ficha.
- `ui/countdown.spec.ts` continua passando (a saída dos sete segmentos não mudou).

Antes do commit: `npm run test:ci`, `npx ng build`, smoke da build de produção com o Pomodoro guardado
ligado (puppeteer, `pageerror`), e fotos de perto 2× no computador e no celular de cada skin, da página e
do relógio do canto nos quatro cantos.

---

## 12. Fora deste pedido (de propósito)

- Pausa longa a cada quatro turnos: o pedido fala em dois tempos; dá para somar depois sem mudar o formato
  (campo novo com padrão).
- Notificação do sistema: pede permissão do navegador; o sininho resolve com a aba aberta.
- Histórico de turnos e estatísticas: só os tomatinhos do dia.
- O tempo no título da aba do navegador: brigaria com `core/title.ts`.

---

## 13. Ordem da implementação

1. `core/pomodoro.ts` + testes (as regras primeiro).
2. `core/pomodoro-store.ts` + browser-reset.
3. `ui/seven-segment.ts` (tirar do contador, sem mudar nada nele).
4. `ui/pomodoro-dial.ts` com as 12 skins.
5. `ui/pomodoro-corner.ts` + `core/chime.ts` + `ui/pomodoro-music.ts`, e o `@defer` em `app.html`.
6. Página, rota e ficha em Extras.
7. Testes de interface, build, fotos de perto, Impeccable no fim, `/code-review high`.
8. Novidades (funcionalidade, F2: página nova), BUILD, commit e push.
