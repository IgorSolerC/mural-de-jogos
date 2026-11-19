# Plano: o forno das fichas (19/nov/2026)

Pedido do dono (cartão "Otimizações e shader-baking"): os murais com as cartolinas customizadas (Wishlist,
Anotações, Análises) pesam até nos computadores bons; na conta dele (G11T-G00D), rolar é lento. Proposta
dele: desenhar as sombras e as cartolinas uma vez e guardar como imagem (PNG com transparência, do mesmo
tamanho), já que nenhuma cartolina é animada. Depois de ver as medidas: **assar tudo, menos o recorte do
texto** ("melhor assar todos menos 1 do que nenhum").

## O que as medidas mostraram

Build de produção, Chrome, 1920×1080, as 98 fichas públicas do dono (76 jogos na parede), rolagem com a roda
(150 passos para baixo e 150 para cima), trace do Chrome. Script: `.angular/perf/medir.mjs` +
`analisar.mjs`. Cada linha desliga um efeito com CSS injetado, só para medir.

| variante | quadros perdidos | resposta da roda (mediana / p99) | GPU ocupada | Layerize |
|---|---|---|---|---|
| como está | 7% | 42 / 114 ms | 25 s | 6,2 s |
| sem a sombra das recortadas | 8% | 33 / 69 ms | **8 s** | 3,8 s |
| sem os filtros SVG do papel | 11% | 47 / 128 ms | 28 s | 6,6 s |
| sem as misturas | 10% | 51 / 184 ms | 34 s | 7,1 s |
| sem as máscaras | 9% | 42 / 133 ms | 28 s | **3,1 s** |
| sem o papel inteiro | 6% | 38 / 73 ms | 20 s | 5,1 s |
| sem a camada por ficha (`cardLayers`) | 17% | 57 / 306 ms | 42 s | 6,5 s |
| **tudo como uma imagem só (o teto do forno)** | **5%** | **24 / 50 ms** | **4,8 s** | **1,1 s** |

Com o mural **parado** (5 s, sem tocar em nada): 659 quadros desenhados e a GPU ocupada 7,7 s; sem a
animação dos brilhos das notas 8+, 83 quadros e 0,95 s.

O que isso quer dizer:

1. **A sombra viva é o maior custo.** O `filter: drop-shadow(...)` triplo no host das fichas recortadas
   (`--sombra-papel`, ui/review-card.ts) é refeito pela GPU a cada quadro em que a ficha se mexe ou muda.
   Os brilhos das notas 8+ (`.brilho`, styles.scss) piscam *dentro* da ficha com o filtro: a cada piscada,
   a sombra da ficha inteira é borrada de novo. Por isso pesa até parado e até em PC bom.
2. **A turbulência, o lápis e as misturas do papel não custam nada na rolagem.** O Chrome já rasteriza
   esses desenhos uma vez e reaproveita. Assar só a cartolina, sem a sombra, quase não muda a rolagem.
3. **As máscaras do recorte custam no Layerize** (o Chrome refaz a lista de camadas a cada quadro em que
   algo muda; com uma máscara por camada, por ficha, cada vez custa ~7 ms).
4. **Tudo como imagem só** é o melhor caso: a roda responde quase duas vezes mais rápido, e a GPU trabalha
   um quinto. É o que o forno busca.
5. A camada própria por ficha (`cardLayers`) ajuda: sem ela, fica pior. Ela fica.

Protótipo da sombra assada (`.angular/pptr/_proto-sombra.mjs`): a silhueta do papel desenhada num canvas
com **o mesmo filtro** que a ficha usa (`ctx.filter = getComputedStyle(ficha).filter`) dá uma sombra
**idêntica pixel a pixel** (diferença máxima 0–5 em 255) em 5 das 8 recortadas testadas. Nas outras 3, a
diferença fica só onde algo passa da beirada do papel (os aros do Caderno, as flores da decoração, a
tachinha): a silhueta precisa ser a do que está desenhado de verdade, e não só a máscara do recorte. Por
isso a sombra vem depois da cartolina assada.

## É o padrão de mercado?

É. Assar o que é caro e não muda é o que fazem as engines de jogo (luz assada, *impostors*), o Flash
(`cacheAsBitmap`), o PixiJS (`cacheAsTexture`), o Konva (`cache()`) e o Fabric (`objectCaching`). Na
página, o navegador já faz isso sozinho com o que ele consegue guardar (por isso a turbulência não pesa); o
trabalho é assar o que ele **não** consegue guardar, que é o filtro sobre algo que se mexe. O resto do que
o mercado recomenda (`content-visibility`, montar só o que está perto da tela, uma camada por ficha) o
mural já tem desde outubro (PLANO de otimização, pages/wall-cards.ts).

O que não vale a pena: assar a ficha inteira, com o texto e a capa (o texto vira imagem, borra no zoom,
some do leitor de tela e da busca, e trocar imagem por ficha viva no hover é frágil). E HTML-in-Canvas
(`drawElementImage`) ainda não existe nos navegadores sem bandeira.

## Como o forno assa

Uma peça só, `ui/forno.ts`, reaproveitada por todas as fichas com papel:

- **Desenha as mesmas camadas de hoje**, e não uma cópia: as camadas do `app-paper-art` (a fibra, a
  textura, a estampa, o rabisco, o estrago, as manchas, as decorações), com as regras de CSS delas, dentro
  de um SVG com `<foreignObject>`, num canvas, no tamanho da ficha × `devicePixelRatio`. O mesmo motor do
  Chrome desenha as duas, então o resultado é o mesmo; o teste de cada rodada compara pixel a pixel.
- **Por andar**, porque o texto fica no meio da pilha: o que fica **abaixo do texto** (miolo, papel,
  purpurina parada, fundo, lápis, clareia) vira uma imagem; o **relevo** (overlay por cima do texto) vira
  outra, que continua se misturando com o texto em `overlay`; a **frente** (o estrago, a fita) outra; o que
  fica **por cima de tudo** (a gosma, as decorações) outra. Na maioria das fichas, uma ou duas imagens.
- **Fica vivo**: o recorte do texto (`data-queima`, a única exceção pedida), as faíscas da purpurina que
  acendem com o mouse (`--luz`) e os brilhos piscando (com a sombra assada, piscar fica barato).
- **A sombra** sai da silhueta do que foi assado (as imagens + a tachinha e o que passa da beirada, como as
  rosetas), com o filtro da própria ficha. Duas imagens: a de sempre e a levantada (`--sombra-papel-alta`).
- **Quando assa**: na fila do papel que já existe (ui/paper-layer.ts, `pace.ts`, o véu), com o navegador à
  toa, nunca no meio de uma rolagem. Até a imagem ficar pronta, a ficha mostra as camadas vivas de hoje:
  o forno é um cache, e a ficha viva continua sendo a verdade.
- **Quando assa de novo**: a ficha mudou de tamanho (texto editado, janela mais larga), o
  `devicePixelRatio` mudou (zoom do navegador, outro monitor), o papel mudou (inclusive vindo de outra
  pessoa numa anotação compartilhada: a chave muda sozinha). A chave é um hash de tudo o que entra no
  desenho + tamanho + DPR + versão do desenho (`FORNO_VERSAO`, sobe quando um desenho do papel muda).
- **Onde não assa**: a prévia do editor (o papel muda a cada clique) e o modo Qualidade do Desempenho, se
  o dono quiser comparar (decidido na rodada 1, com as medidas na mão).

## As rodadas (uma por vez, cada uma com /code-review mid antes da próxima)

### Rodada 1: a cartolina assada

`ui/forno.ts` (assar camadas num bitmap, por andar) e `app-paper-art` usando ele no mural (Análises,
Anotações; o Kanban e os Estudos usam o mesmo papel e ganham junto). As máscaras das camadas assadas somem
(viram transparência na imagem); a do texto fica.
Pronto quando: as fotos 2x (computador e celular) das 98 fichas do dono saem iguais às de antes
(diferença máxima pequena, conferida por script) e o trace mostra o Layerize caindo.

**Feita (19/nov, BUILD 967).** `ui/forno.ts` + `app-paper-art`. Comparadas as 76 fichas do dono, vivas
e assadas, na build de produção: mediana de 0,25% dos pixels com diferença acima de 16/255 (DPR 1),
0,37% (DPR 2) e 0,22% (celular, 390 px, DPR 3), só o grão e o serrilhado das bordas meio pixel ao
lado, pela reamostragem da ficha inclinada; a olho nu, iguais. O que aprendi fazendo:

- O SVG vai ao canvas por `data:`: por `blob:`, o Chrome suja o canvas do `<foreignObject>`.
- A época só sobe quando muda o que o papel lê (as variáveis e as classes das regras do papel): o
  `<html>` muda de classe a cada arrasto e de estilo a cada mudança do teclado do celular.
- A ficha que dorme devolve as imagens; ao acordar, pega as mesmas do cache sem refazer a receita.
- Sozinha, esta rodada quase não mexe na rolagem (como as medidas do começo previam). Com o forno, sem
  a sombra viva, sem as máscaras do texto e sem os brilhos piscando durante a rolagem, a roda vai de
  42/114 ms para **27/61 ms** e a GPU de 25 s para 7,7 s, perto do teto (24/50 ms). Por isso as
  próximas rodadas:

### Rodada 2: a sombra assada

A sombra das recortadas a partir da cartolina assada; a ficha perde o `filter`. No hover, a sombra
levantada entra por opacidade (o compositor faz sozinho). A Wishlist (`ui/wish-cover.ts` e `wish-clip.ts`,
que usam o mesmo `drop-shadow` duplo e triplo) usa a mesma peça.
Pronto quando: as fotos batem, e com o mural parado a GPU fica à toa (os brilhos piscando não refazem a
sombra).

Junto, duas coisas que as medidas da rodada 1 apontaram (sem mudar o que se vê):

- **O recorte do texto só onde o rasgo passa.** Hoje todo texto de uma ficha com estrago leva a máscara
  (`data-queima`), mesmo longe do rasgo; com ela totalmente opaca sobre o texto, ela não muda nenhum
  pixel e custa uma camada no Layerize. Medido: sem as máscaras do texto, a roda vai de 39/90 para
  34/78 ms.
- **Os brilhos das notas 8+ param durante a rolagem** (voltam a piscar quando ela para, como o mouse já
  faz com as fichas, `data-quieta`): rolando, eles recalculam estilo a cada quadro. Medido: 34/78 →
  27/61 ms. É a única coisa que muda à vista (por um instante), e fica para o dono aprovar.

**Feita (19/nov, BUILD 968).** A sombra das recortadas sai da silhueta (o papel assado, a tachinha e a
orelha copiadas com o estilo calculado) passada pelo mesmo filtro num canvas; da imagem pronta sai a
silhueta (R = P + (1 − a)·S, com P preta). Parada, a ficha mostra a imagem e fica sem o filtro; levantada
pelo mouse, pelo foco ou pelo toque, volta ao filtro de sempre (com os botões que aparecem) e a imagem
some no mesmo tempo. O texto só leva o recorte onde o rasgo alcança; os brilhos param com `[data-quieta]`.
A ficha que dorme continua assada (soltar as imagens fazia a ficha acordar viva no meio da rolagem, com
milhares de traços entrando na página). Medido com as 76 fichas do dono, build de produção:

| | roda (mediana / pior 1%) | GPU rolando | GPU parado (5 s) |
|---|---|---|---|
| antes do forno | 42 / 114 ms | 25 s | 7,7 s |
| rodada 2 | **32 / 70 ms** | 13 s | **2,7 s** |

As fotos, vivas e assadas, ficam iguais a olho nu (a diferença que o script acha a mais é a capa: com o
filtro vivo, o Chrome desenha a ficha numa superfície à parte e reamostra a capa inclinada). O que ainda
pesa na rolagem é o Layerize de quem dorme e acorda (rodada 4). A Wishlist (o drop-shadow das capas)
fica para quando der para medir com os desejos do dono: sem nada animado dentro, aquele filtro é
rasterizado uma vez só.

Armadilha: `:host(.x:not(:hover, :has(:focus-visible), :active))` faz o `ng build` de produção rodar
sem fim; as regras usam o formato das que já existiam.

### Rodada 3: o forno guardado

As imagens assadas guardadas no IndexedDB (`meu-mural:forno`), pela chave, com teto de tamanho (as mais
velhas saem): abrir o site de novo não assa nada. Pela regra do CLAUDE.md: o banco entra em `wipeBrowser`
(browser-reset.ts), quem grava confere `storageFrozen()`, e browser-reset.spec.ts mostra que ele sai no
logout. Não é dado de conta (é desenho, refeito a partir das fichas), então não entra em `localHasContent`.

**Feita (19/nov, BUILD 969).** `core/forno-store.ts`: o banco `meu-mural:forno` (tabela `imagens`, pela
chave, com a data de uso), teto de 80 MB (saem as usadas há mais tempo), na lista do `wipeBrowser`, e
quem grava confere `storageFrozen()`. Para a mesma ficha dar a mesma chave em qualquer visita, a receita
troca os ids do desenho pelos da ordem (`trocarIds`, que a cópia do fade também usa), tira as classes que
mudam de visita para visita (o número do recorte) e só leva da página as classes que as regras do papel
olham. A chave leva `FORNO_VERSAO` (subir quando a conta do forno mudar). A imagem guardada que não abre
sai e é desenhada de novo; um banco com o nome certo e sem a tabela é aberto na versão seguinte.
Medido (build de produção, as fichas do dono): a primeira visita desenha as 15 da tela no canvas; a
volta, nenhuma (as receitas são as mesmas, conferidas byte a byte). O tempo até a tela ficar assada
(~7 s) é o site carregando e a fila esperando o navegador ficar à toa: as fichas aparecem vivas e iguais
nesse meio-tempo.

### Rodada 4: ficar acordada por mais tempo (só se a medida pedir)

Com a ficha barata, dormir e acordar na rolagem (o `data-dorme`, que tira e põe milhares de traços de SVG
da página) pode custar mais do que manter acordada. Medir com as fichas do dono; mudar `WALL_TUNING` só se
ganhar.

### Fechamento

A mesma medição do começo, antes e depois, com a tabela nas Novidades; Impeccable (critique) e
/code-review high.

## Parte 2: a esteira (19/nov, depois das medidas no Chrome do dono)

### O que as medidas no Chrome do dono mostraram

- **A sombra viva** (`filter: drop-shadow`) estava ~100× mais lenta no Chrome dele do que num Chrome limpo
  no mesmo PC (página sintética de 30 linhas: 10 q/s × 120). Atualizar o Chrome resolveu (57 q/s), mas
  mostrou o risco: qualquer ficha viva na tela pesa o que o Chrome daquela pessoa cobra por ela.
- **O forno não assava em telas de 120 Hz** (folga de 8 ms pedida, quadro de 8,3 ms): 40 s e nenhuma ficha
  assada. Corrigido (`idleFits`, BUILD 972).
- **Piscadas**: a troca pelo assado antes de a imagem decodificar, e a capa da ficha que acorda. Corrigido
  (BUILD 973).
- As minhas medições de antes esperavam todas as fichas assarem antes de medir: nunca mediam o começo, que
  é justamente o que o dono sente ("lento ao abrir, melhora depois de 10 ou 20 s").

### O pedido do dono

1. Toda cartolina assada; cada uma preparada uma vez só, e trocada pela assada sem nenhuma piscada.
2. Poucas por vez, para não pesar em PC velho: **até 5 ao mesmo tempo**, e **uma por vez** com o ajuste de
   desempenho dos Ajustes ("Menos fichas prontas", que já é "uma de cada vez" na montagem).
3. O dormir, o montar perto da tela e o desmontar longe funcionando perfeitamente.
Nos murais de Anotações, Análises, Wishlist, Kanban e Pra depois.

### Como é hoje (três filas que correm uma atrás da outra)

`WallCardPool` monta as fichas (as da tela todas de uma vez, até 28 ms; as de perto aos poucos; as de mais
adiante com o navegador à toa) → a fila do papel desenha e **tira o véu com o papel vivo** → o forno assa
depois (esperando 900 ms sem rolar) e troca. Toda ficha nova aparece viva e fica viva até o forno alcançar.

### Como fica: uma esteira só

Cada ficha passa por montar → desenhar o papel → assar → aparecer, **com o véu o tempo todo** (a vaga
tracejada no lugar), e só aparece assada, com a sombra assada. Nunca há papel vivo à vista, então não há
troca à vista (nada a piscar) e nenhum Chrome paga o desenho vivo na rolagem.

- **Vagas na esteira**: até 5 fichas entre montar e aparecer (1 com "Menos fichas prontas"). A próxima só é
  montada quando uma das que estão na esteira aparece. As da tela primeiro, na ordem de leitura; depois as
  de perto, no sentido da rolagem; depois as de mais adiante.
- **Assar com o véu**: o véu é `visibility: hidden` no corpo; a receita copia o estilo calculado, então o
  clone tem de voltar a `visible`. A sombra assada sai da silhueta assada (já não depende de a ficha estar à vista).
- **Sem esperar a rolagem parar** para as fichas com véu (são elas que a pessoa está esperando): cada passo
  pesado do forno numa tarefa curta, cedendo a vez entre um passo e outro. A rolagem do Chrome anda em
  outra linha de execução: tarefa curta na principal não trava a rolagem.
- **Volta**: a ficha que já foi assada (o atalho, ou acordando com as imagens) aparece sem passar pelo forno.
- **Falhou** (Safari, sem forno, erro depois das tentativas): aparece viva, como hoje. Nunca fica escondida.
- **Mudou o papel de uma ficha à vista** (edição, a outra pessoa da compartilhada): continua como hoje
  (volta viva e assa de novo) — é raro e a ficha não pode sumir da tela.
- **Saiu da folga antes de aparecer**: sai da esteira e libera a vaga.

### As rodadas

- **E1 (feita, BUILD 972–973)**: a folga nas telas rápidas e as duas piscadas.
- **E2: o forno com o véu**: assar a ficha escondida e só tirar o véu com ela assada e com a sombra.
  Medir: nenhuma ficha viva à vista no começo e na rolagem (contagem a cada quadro), 0 piscadas.
- **E3: a esteira**: o limite de 5 / 1, `WallCardPool` montando só com vaga na esteira, a ordem, o forno
  sem esperar a rolagem para as fichas com véu, em passos curtos. Medir as tarefas longas (LoAF) abrindo e
  rolando, no Chrome do dono e num limpo.
- **E3 (feita, BUILD 975)**: a esteira (5 / 1), o ajudante (Web Worker: a página não lê pixels; ler
  esperava a GPU, 50–350 ms), a fibra reduzida ao tamanho em que aparece (decodificar caía de 65–110 ms
  para 27–44), o passo urgente logo depois do quadro (montar → aparecer de 2,3 s para 1,2 s). Assar 2+
  juntas dobrava os quadros longos sem encurtar a espera: uma por vez.
- **A revelação (feita depois da E3, pedido do dono: "fica um bom tempo vazio")**: a ficha entra já com
  o conteúdo sobre a cor lisa da cartolina (`data-revelando`), sem filtro; o papel assado se revela por
  cima num fade. Montar → conteúdo à vista: ~50 ms. O retângulo cinza era o relevo amassado pintando com
  o véu: a opacidade no app-paper-art não fazia nada (ele é display: contents); as camadas escondidas
  agora são recortadas a nada (clip-path), o que mantém o tamanho que o forno mede. Armadilha: crase num
  comentário do CSS do componente fecha a string de estilos; `:host(:is(a, b))` quebra as regras seguintes.
- **E4: os outros murais**: Kanban (ui/near-screen.ts), Pra depois e Wishlist (as capas com drop-shadow).
  Medir cada um do mesmo jeito.
- **E5: a abertura**: as tarefas de 0,6–1,3 s dos primeiros segundos (montar o mural, os dados).
- **Fechamento**: tabela antes/depois, Impeccable (critique), /code-review high.

Ferramentas: `.angular/pptr/_inicio3.mjs` (a abertura, por ficha: A assada, S sombra), `_piscada.mjs` +
`_flash.py` (cada quadro da tela, acha o que muda e volta), `__bench.html` (a sombra sintética).

## Compartilhados e várias pessoas

O forno não sincroniza nada e não muda nenhum dado: assa a partir do que a ficha já mostra. Numa anotação
compartilhada, quando a outra pessoa muda o papel, a chave muda e a ficha volta às camadas vivas até assar
de novo. Dois Muralls abertos assam cada um o seu (o banco é só um cache).

## Riscos

- **A aparência não pode mudar** (aparência congelada): o teste de cada rodada compara pixel a pixel, com
  as fichas reais do dono, em DPR 1 e 2.
- **A transição da sombra no hover**: hoje o Chrome anima os números da sombra (ela se afasta); assada, uma
  imagem se funde na outra em 150 ms. Parada fica igual; no meio da transição, a diferença é pequena e é a
  única coisa que muda.
- **Memória**: cada ficha assada guarda 1–4 imagens do tamanho dela (~1 MB em DPR 1, ~4 MB em DPR 2), mais
  ou menos o que o Chrome já guarda hoje para a camada da ficha; longe da tela, o Chrome descarta.
- **O primeiro acesso depois de publicar** assa as fichas aos poucos (~50–140 ms cada, à toa); da rodada 3
  em diante, só uma vez por aparelho.
