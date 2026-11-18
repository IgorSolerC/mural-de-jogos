# Extras repensado (18/nov/2026)

Pedido do dono (cartão "Rework na tela de extras"): a página de Extras está simplista, feia e, principalmente,
confusa. Repensar do zero, com personalidade própria, como o Kanban, o mural e o perfil; fácil de achar o que
precisa. Antes de implementar, pelo menos cinco versões mockadas para aprovar.

Processo pedido: este plano antes; uma feature por vez, cada uma com `/code-review mid` antes da próxima;
Impeccable no começo e no fim; `/code-review high` no final.

---

## 1. Como era

- `pages/extras-page.ts`: oito fichas de cartolina iguais (ícone, nome, parágrafo, "Ver/Abrir/Jogar") em quatro
  prateleiras (Números, Foco, Criar, Jogos), três delas com uma ficha só: 2.000px de rolagem para oito coisas.
- O seletor de mural ficava na barra de cima, mas só valia para metade (os jogos e os números); o Pomodoro e as
  Pixel arts não dependem de mural.
- Nenhuma ficha dizia como estava: o Muraldle de hoje, o torneio pela metade, o recorde, o Pomodoro ligado.

## 2. O escolhido (rodadas de mock no laboratório, V1 a V16; o dono escolheu a V12 refinada)

De cima para baixo:

1. **A prateleira "Sempre à mão"** (o que serve para qualquer mural): uma tábua de madeira presa na parede por duas
   mãos-francesas. Numa ponta, o tomate do Pomodoro de pé (o mostrador de verdade, `PomodoroDial`, que corre quando
   está ligado); na outra, um cavalete com a pixel art mais recente numa tela de linho, duas telas encostadas na
   parede e um pote de lápis de cor. Cada coisa tem uma fita Dymo na frente da tábua com o nome e o estado.
2. **"com o mural de [Jogos ▾]"**: o seletor sai da barra de cima nesta página e fica aqui, logo acima do que depende
   dele.
3. **Dois letreiros de feltro** com letras de plástico (cada letra uma peça, um tiquinho torta): **Jogar**
   (Muraldle, Mata-mata, Maior ou menor) e **Números** (Estatísticas, Ranking, Comparar). Cada linha é o ícone numa
   peça branca, o nome em letras de plástico e, embaixo, a prévia ao vivo em peças coloridas:
   - Muraldle: o último chute de hoje em quadradinhos (verde, amarelo, vermelho), quantos chutes e a sequência.
   - Mata-mata: um tracinho por duelo (os feitos amarelos, o da vez rosa), a rodada e "5 de 15".
   - Maior ou menor: as setas verde e vermelha e o recorde numa peça amarela.
   - Estatísticas: varetinhas com quantas fichas há em cada nota (de 7 para cima em amarelo), o total e a média.
   - Ranking: as medalhas de ouro, prata e bronze e o primeiro lugar com a nota.
   - Comparar: os amigos abertos em Comparar, cada um numa bolinha com a inicial e quanto vocês combinam.

## 3. Decisões (minhas, ditas aqui)

- **D1. As prévias são do seu mural** (o aberto no seletor), mesmo com um colega escolhido nos jogos: a página é
  sua. Os jogos continuam perguntando "Mural de quem?" na folha de regras, como hoje.
- **D2. Só lê.** A página não grava nada: lê o que os jogos já guardam (`muraldle-save`, `knockout-save`,
  `game-records`), as lojas (`Mural`, `ColleagueStore`, `PomodoroStore`, `PixelGallery`). Nenhuma chave nova no
  navegador (a regra do logout fica como está), nada compartilhado, nada na nuvem.
- **D3. As contas das prévias moram num módulo puro**, `core/extras-previews.ts`, com testes: a página só desenha.
- **D4. Peças novas, reaproveitáveis:** as letras de plástico (`ui/plastic-letters.ts`), o letreiro de feltro
  (`ui/_letreiro.scss`) e a fita Dymo, que sai do perfil para um mixin (`ui/_dymo.scss`) usado pelos dois (o perfil
  fica idêntico).
- **D5. Cada linha é um link só**, com o nome acessível dizendo o estado inteiro ("Muraldle: hoje, 3 chutes, 6 dias
  seguidos"); as peças e as letras são `aria-hidden`.
- **D6. O Uso das APIs** (só a conta de admin) entra na prateleira como uma prancheta, com a fita "Uso das APIs · só
  você vê". Quem não é admin não vê diferença nenhuma.
- **D7. Os vazios:** mural sem fichas, jogo nunca jogado, galeria sem obra (o cavalete com a tela em branco e
  "Desenhar a primeira"), Comparar sem conta ou sem amigo aberto. Cada prévia diz o que falta, sem marca de estado
  raro no visual.

## 4. Features (uma por vez, cada uma com `/code-review mid`)

1. **A página nova**: as peças (letras de plástico, letreiro, Dymo), os dois letreiros com o nome e o estado de cada
   linha em letras, o seletor dentro da página (fora da barra em `/extras`) e a prateleira com o tomate e o cavalete.
2. **As prévias dos jogos** em peças: os quadradinhos do Muraldle, os duelos do Mata-mata, o recorde.
3. **As prévias dos números** em peças: as varetinhas, as medalhas, os amigos.
4. **A prateleira ao vivo**: o tomate correndo quando ligado, a obra mais recente, os vazios, a prancheta do admin.
   (Entrou inteira na feature 1; aqui só se conferiu na build de produção que o tomate corre.)
5. **Celular, teclado e leitor de tela**, a crítica do Impeccable e o DESIGN.md. No celular a prateleira ficou uma
   tábua só, com as duas coisas lado a lado e menores (empilhadas, ocupavam ~620px antes dos letreiros). Da crítica
   (dois avaliadores isolados; o detector sem nada que impeça, contrastes AAA) entraram: a prateleira mais baixa, as
   letras pequenas retas, o amarelo só para "a sua vez", "6 dias" na chama, "duelo 5 de 11", as notas sem ficha sem
   tracinho, "desenhe a primeira", a fita do celular numa linha, o título da segunda parte para o leitor de tela e
   "só com conta". Ficaram de fora, por mudarem o pedido: tocar no tomate para ligar o Pomodoro e encolher a
   prateleira até a altura da primeira linha dos letreiros (o dono quis a prateleira em cima).

Depois: `/code-review high` e os consertos.
