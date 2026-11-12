# As etiquetas das seções (fio de giz + pilha)

Pedido do dono em 11/nov/2026 (cartão "Repensar etiquetas de ordenação/agrupamento nos murais"): a fita-crepe
das seções e o maço com elástico saem. Depois de duas rodadas de exemplos, ele escolheu a **1A, Fio + pilha
baixa** (https://claude.ai/artifact/9UU7g1HwkayAmjLwMDTYsv), com três coisas de que gostou e uma que muda:

- gostou da animação de abrir (as fichas saindo da pilha) e quer **uma de fechar também**: as primeiras 4 ou
  5 fichas se juntam na pilha;
- gostou da pilha fechada: as fichas uma em cima da outra, **só a cor das de trás aparecendo de leve**;
- gostou do **nome e da contagem** na cabeça de cada seção;
- muda: **seção de uma ficha só não fecha**. Não faz sentido fechar uma.

Nunca usar lombada (ele odiou). Como ler: a 1 é o que existe, a 2 é a peça nova, a 3 é vista por vista, a 4 é
o comportamento, a 5 as animações, a 6 por dentro, a 7 as rodadas.

---

## 1. O que existe hoje

| Onde | Cabeça da seção | Fecha? | Fechada vira |
|---|---|---|---|
| `pages/wall-board` (todos os murais: anotações, jogos, livros, filmes, séries, animes, músicas; o seu e a visita) | `h3.tape-label` (fita-crepe a pincel, 1,3rem, torta) + `.grupo-sum` ("3 jogos · média 9,1") | sim, com as etiquetas à mostra | o maço SVG com elástico, e a seção toma **uma fileira inteira** (`flex-basis: 100%`) |
| `pages/study-page` "Tudo" (Flashcards do dono) | `h2.tape-label` com link para o grupo + `.grupo-sum` ("3 baralhos · 4 flashcards") | não | — |
| `ui/visit-study` "Tudo" (Flashcards na visita) | `h3.tape-label` com link + `.grupo-sum` | não | — |

Os problemas, vistos na imagem do cartão: a cabeça tem `width: 0; min-width: 100%`, então numa seção de uma
ficha o nome a pincel quebra em duas linhas e empurra a ficha para baixo (alturas diferentes entre seções);
a fita chama mais atenção que as fichas; e a fechada ocupa a fileira toda.

Fica de fora (não é seção de agrupamento): os títulos de página `.tape-label.big`, as fitas das seções do
perfil (`_profile-board.scss`), "As fichas" do Comparar e do Lado a lado, a prateleira dos Extras.

## 2. A peça nova: `ui/section-head` (a cabeça) e a pilha

**Uma peça só** para as três telas (regra "Visita: as mesmas peças" do CLAUDE.md): `app-section-head`, em
`src/app/ui/section-head.ts` + `.scss`.

```
NOVEMBRO DE 2026  1 ──────────────────────     (seção de uma ficha: não fecha, sem seta)
OUTUBRO DE 2026  3  média 8,4 ─────────── ⌄    (aberta)
SETEMBRO DE 2026  4 - - - - - - - - - - - ›    (fechada: fio tracejado, seta virada)
```

- **Uma linha, sempre a mesma altura** (30px; 28 nas Capas): nome em letra de rótulo (Barlow Condensed
  800, caixa alta, 0,86rem, espaçado 0,12em, giz `--wall-ink`), o número em `--wall-ink-2`, o detalhe
  (só onde existe: "média 8,4", "1 rejogada", "2 álbuns · 1 música") menor, e o fio de giz até o fim da
  seção. É a letra do `.grupo-sum` de hoje: nada de peça de papelaria nova.
- **Nunca alarga a seção**: continua `width: 0; min-width: 100%`, mas nada quebra linha. Falta espaço,
  some primeiro o fio, depois o detalhe, e por último o nome ganha reticências (o nome inteiro fica no
  `title` e no nome acessível). Medido: "NOVEMBRO DE 2026 1" cabe em 150px, e a menor ficha (Capas) tem 116.
- **Entradas**: `label`, `count`, `detail`, `foldable`, `open`, `controls` (id das fichas), `level` (2 ou 3:
  o Flashcards usa h2), `link` (no Flashcards o nome é o link do grupo). Saídas: `toggle` (com o evento,
  para o Alt) e o botão direito sobe pelo `contextmenu` do host.
- Dobrável, o nome inteiro é um `<button aria-expanded aria-controls>` dentro do `h3`; com o mouse, o fio
  acende (giz mais forte) e a seta ganha a tinta cheia. Não dobrável, é texto, sem seta.
- A peça não importa nada que escreve (só desenha); a visita a monta igual.

**A pilha** (fechada): mora no próprio `wall-board` (só ele fecha seções). Primeiro saiu uma "pilha baixa"
de papel com os títulos escritos; o dono achou horrível ("quero que ela seja como a carta original") e pediu
as fichas de trás aparecendo, "as 4 ou 5 primeiras". Ficou assim:

- em cima, **a primeira ficha da seção, a mesma da parede** (montada pela própria parede, `appFichas`, com
  orelha, tachinha, inclinação e desnível), mas sem uso (`inert`): a pilha inteira é o atalho para abrir;
- atrás, **até quatro folhas** das fichas seguintes (da 2ª à 5ª), na cartolina de cada uma (`.cartolina` com
  `data-cor`), do tamanho da de cima, giradas como ela em volta da tachinha dela, e cada uma mais para a
  direita, mais para baixo, mais torta e um tico mais na sombra (`--k`): só a beirada da cor aparece;
- com o mouse, a de cima sobe 3px e as de trás abrem em leque;
- ela é só um atalho do mouse: o botão da cabeça é quem abre (a pilha tem `aria-hidden` e não entra no Tab;
  o foco fica na cabeça, que não sai do lugar);
- o marca-texto da busca pega o título da de cima (`realceEm` ganha `.guardadas`). A classe é `.guardadas`
  porque `.pilha` já é o maço que segue o ponteiro ao arrastar (`ui/_pilha-arrasto.scss`).

## 3. Vista por vista

A pilha tem a forma da ficha de cada vista, porque a de cima é a própria ficha: a seção fechada fica do
tamanho de uma seção de uma ficha só.

| Vista | Murais | Cabeça | Fechada |
|---|---|---|---|
| **Comum** (`completa`) | todos | a peça | pilha (a ficha comum em cima) |
| **Visão geral** (`simples`, anotações) | anotações | a peça | pilha (a fichinha em cima) |
| **Fichas simples** (`simples`, resenhas) | jogos, livros, filmes, séries, animes, músicas | a peça | pilha |
| **Só capa e nome** (`capas`) | resenhas e músicas | a peça, 0,76rem e mais apertada (cabe "Novembro de 2026 1" na capa de 116px); sem o detalhe abaixo de 240px | pilha (a capa em cima) |
| **Inteira** (colagem) | todos | nenhuma (já é assim: a parede é uma colagem só) | não fecha |
| **Lista** (`lista`, anotações) | anotações | a peça, de ponta a ponta | **só a cabeça** (fio tracejado): a lista já é o jeito compacto |
| **Sem etiquetas** (Ajustes) | todos | escondida (só leitor de tela) | não fecha (já é assim) |
| **Celular** (≤559px) | todos | a peça, de ponta a ponta | pilha da largura de uma ficha da grade (a tela; metade na Visão geral; um terço nas Capas) |

Detalhes que valem para todas:

- **Orelhas** (anotações e músicas): a primeira fileira de fichas desce 18px (14 na Visão geral, 24 no
  celular) para a orelha caber; a ficha de cima da pilha desce o mesmo (`--orelha`), e as folhas de trás
  começam onde o papel dela começa.
- **Seções lado a lado**: a fechada ocupa a largura de uma ficha (cabeça + pilha), como uma seção de uma ficha,
  e as outras seguem do lado. Some o `.grupo.fechada { flex-basis: 100% }`.
- **Pastas**: continuam na fileira de cima, fora da parede; nada muda.
- **Ordem por tag** (a anotação aparece em várias seções): a pilha usa as fichas da seção, cópias inclusive.
- **Fixadas**: é uma seção como as outras (fecha se tiver 2 ou mais).
- **Visita** (`colleague-wall-page`, `VisitView`): a mesma parede; fecha e abre igual, sem guardar (já é assim).
- **WallMotion**: a ficha de cima anda com a pilha (que leva as folhas junto); por isso `places()` conta a
  pilha e não a ficha dentro dela.
- **Busca e filtros**: o estado de fechada continua; se o filtro deixa a seção com uma ficha só, ela aparece
  aberta (a regra é pela contagem do momento), e volta a fechar quando o filtro sai.
- **Seção de uma ficha**: nunca fechada, mesmo se estava guardada como fechada (a chave guardada fica, para
  voltar a valer quando a seção tiver duas de novo).

## 4. O comportamento

- **Clique** na cabeça (ou na pilha) fecha e abre.
- **Alt + clique** na cabeça: fecha as outras e deixa esta aberta (aberta, se estava fechada).
- **Botão direito** na cabeça ou na pilha abre o menu de sempre (`ui/context-menu.ts`), com a seção no
  título: "Fechar esta seção" / "Abrir esta seção", "Fechar as outras" (Alt + clique), "Abrir todas",
  "Fechar todas". Só entram as que fazem sentido (sem "Fechar as outras" se não há outras que fecham; sem
  "Abrir todas" se nenhuma está fechada). No vão da parede continua o menu das pastas; a cabeça para o
  evento.
- **Teclado**: o botão da cabeça (Enter/Espaço); o foco não se mexe, porque a cabeça não sai do lugar.
- O que fecha fica guardado como hoje (`WallView.collapsed`, por aba nas anotações, por mural nos outros).

## 5. As animações (curva física do DESIGN.md: 380ms, `--ease-physical`)

- **Abrir**: a pilha some e as primeiras 5 fichas saem dela para o lugar delas, uma depois da outra (50ms
  entre elas), partindo do canto da pilha, um pouco menores e tortas; as outras aparecem esmaecendo. As
  seções seguintes deslizam para o lugar novo (o `WallMotion.run` de sempre).
- **Fechar**: as primeiras 5 fichas da tela andam juntas até o lugar da pilha (o lugar da primeira ficha),
  encolhendo e se empilhando com o deslocamento das folhas; as outras esmaecem. Ao chegar, a seção fecha, a
  pilha assenta (um leve aperto, como o `assenta` do exemplo) e as seções seguintes deslizam.
- Só o que está na tela anima (como no `WallMotion`); com "Movimento reduzido", troca direto.
- **Ajuste de 12/nov**: o dono não viu a animação (no tempo de 380ms ela passava num piscar). Cada ficha leva 560ms,
  com 60ms entre uma e outra: ao fechar, chegam à pilha em cascata (a seção fecha na metade do caminho da última);
  ao abrir, saem dela as 10 primeiras.
- Some o estalo do elástico (`snapping`, `.estalando`, os keyframes do elástico).

## 6. Por dentro

- `core/wall-view.ts`: `WallGroup` ganha `detail` (o resumo sem a contagem: "média 8,4"); o `summary`
  continua para o nome acessível. `WallView` ganha `setCollapsed(keys, closed)` para o menu (fechar as
  outras, abrir/fechar todas), respeitando `MAX_COLLAPSED`.
- `pages/wall-board`: a cabeça vira `<app-section-head>`; `shut = foldable() && g.reviews.length > 1 &&
  isCollapsed(g.key)`; a pilha no lugar do maço; o menu do botão direito; o `bundle()` vira `piles` (um
  `computed`, para a lista da ficha de cima ser a mesma entre as passadas).
  Saem o SVG do maço, o elástico, o `snapping` e o CSS deles.
- `core/wall-motion.ts`: `places()` acha as cabeças pela peça nova (a cabeça desliza quando a seção muda de
  lugar); ganha `fold(section, change)` e `unfold(section, change)` para as animações da 5.
- `pages/study-page.html` e `ui/visit-study.html`: a cabeça vira a peça (com `link` e `level`).
- `scripts/visita-mesmas-pecas.test.mjs`: a peça entra em `PECAS`.
- Testes: `ui/section-head.spec.ts` (uma linha, sem quebra; não dobrável sem seta; Alt), `wall-board.spec.ts`
  (seção de uma ficha não fecha; a fechada vira pilha com as cores e os títulos; o menu; Alt + clique),
  `wall-view.spec.ts` (`detail`, `setCollapsed`), os de Flashcards ajustados.
- Novidades, `BUILD` e `npx ng build` em cada rodada; DESIGN.md ("Wall in sections") no fim.

## 7. As rodadas (uma por vez; cada uma com `/code-review medium`, commit e push)

1. **A cabeça e a pilha**: a peça `section-head`, a pilha (a ficha de verdade em cima, quatro folhas atrás)
   no lugar do maço, as medidas por vista da tabela da 3 (orelhas, celular, Capas, Lista só com a cabeça), a
   busca na pilha. O visual inteiro muda de
   uma vez, para nunca ir ao ar a cabeça nova com o elástico velho.
2. **O comportamento**: seção de uma ficha não fecha; Alt + clique; o menu do botão direito; `setCollapsed`.
3. **As animações**: fechar juntando e abrir saindo da pilha (`WallMotion.fold`/`unfold`); sai o estalo do
   elástico.
4. **Flashcards "Tudo"**: a mesma cabeça no dono e na visita (link do grupo, sem dobrar), `PECAS`.
5. **Fechamento**: crítica do Impeccable no que ficou, DESIGN.md, `/code-review high` e as correções.
