# Grupos de cores no ateliê da pixel art

Pedido do dono (cartão "Possibilidade de agrupar cores", 24/nov/2026): hoje todas as cores ficam juntas. Marcar
cores com Ctrl (uma a uma) e Shift (um intervalo), arrastar as marcadas para um grupo ("Cinzas", "Quentes") e criar
grupos novos (vazios) pelo botão direito no painel das cores ou por um botão, para organizar artes com muitas cores.
Pensar, melhorar a ideia, planejar tudo e fazer uma rodada por vez, com o Impeccable no começo e no fim, /code-review
mid em cada rodada e /code-review high no fim.

## O que muda na ideia (decidido sem rodada de escolha)

- **O grupo organiza, não muda o desenho.** Pôr uma cor num grupo nunca troca o número dela (o caractere que vai nos
  pontos) nem a paleta: a PICO-8 agrupada continua PICO-8. Só o "mudar de lugar" de sempre (arrastar dentro do mesmo
  grupo, Lugar ‹ ›, Ordenar) renumera, como hoje, e aí a paleta vira a Própria. Regra que se lê na tela: **arrastar
  para outro grupo muda o grupo; dentro do mesmo grupo, muda o lugar.**
- **Uma ordem só.** Dentro de cada grupo as cores aparecem na ordem da paleta (pelo número). As soltas (sem grupo)
  vêm primeiro, sem nome, como a paleta de hoje; depois os grupos, na ordem em que foram feitos (Subir/Descer no menu
  do grupo). `[` e `]` andam na ordem da tela.
- **O grupo mora no desenho.** Vai na própria linha do `{{pixel}}`, num parâmetro novo e opcional, então vale no widget
  das anotações (também nas compartilhadas, que juntam o texto como sempre), na galeria (a obra guarda os parâmetros
  do widget; a junção por obra continua a de sempre), nos rascunhos e no desfazer. Nada de esquema novo de
  sincronização, nada guardado no navegador fora do desenho (a limpeza do logout não muda).
- **Melhorias em cima do pedido:**
  - "Novo grupo" com cores marcadas já nasce com elas (o vazio continua existindo, como no pedido).
  - O nome sugerido sai das cores: todas apagadas → "Cinzas"; vermelho/laranja/amarelo → "Quentes"; verde/azul/ciano
    → "Frios"; um tom só → o nome dele ("Azuis"). Sem cor nenhuma → "Grupo 2". O campo do nome abre escolhido, para
    escrever por cima.
  - **Agrupar pelo tom**: no "…" das cores, monta os grupos sozinho (Cinzas, Vermelhos, Laranjas, Amarelos, Verdes,
    Azuis, Roxos, Rosas, Marrons), com Desfazer. Para a Completa de 61 cores, um clique.
  - O grupo recolhe (a seta no nome): recolhido, mostra uma tirinha das cores dele (a da folha das paletas), para
    ainda ver o que tem.
  - O grupo vazio mostra o recorte tracejado "Arraste cores para cá" (o mesmo tracejado do "+"), que ensina o arrastar.
  - Várias de uma vez arrastam como o maço do Kanban (`ui/drag-pile.ts` + `ui/_pilha-arrasto.scss`), com o número.
  - Sem mouse (teclado, celular): o "…" das cores ganha a leva "Pôr no grupo" (cada grupo e Sem grupo, a de agora com o
    tique) para a cor da frente ou as marcadas.

## Formato

Um parâmetro a mais, depois das cores trocadas e antes do jeito/legenda:

    {{pixel: 16x16 | … | pico8 | grupos [Cinzas]1567 [Quentes]89a [Novo grupo] | Gato}}

- A palavra `grupos`, depois cada grupo: o nome entre colchetes e os caracteres das cores dele (na ordem da paleta). O
  grupo vazio é só o nome. Nome de até 24 letras, sem `[ ] { } |` nem quebra; até 16 grupos; uma cor fica em um grupo
  só (vale o primeiro). Cor que a paleta não tem sai.
- Sem grupo nenhum, o parâmetro não se escreve. Uma legenda com cara de grupos ("grupos [x]") faz ir um `grupos`
  vazio antes dela (o truque das cores trocadas).
- Um site antigo lê o parâmetro como legenda (só se a arte não tiver uma) até atualizar; nada se perde no desenho.

## Rodadas

1. **O formato e o modelo** (sem tela): `core/pixel-ink-groups.ts` (ler, escrever, limpar, renumerar pela prova, nome
   sugerido, agrupar pelo tom); `PixelArt.groups`; `readPixelArt`/`writePixelArt`; o campo `groups` do widget; o
   ateliê guarda os grupos no `Snap` (desfazer) e cada operação que renumera (tirar a cor, tirar as sem uso, mudar de
   lugar, ordenar, trocar a paleta, converter, trazer a imagem) leva os grupos junto. A prova: a operação aplicada a uma
   fileira `0123…` diz para onde foi cada número. Testes. Sem Novidades (nada aparece).
2. **Os grupos no painel**: as seções (soltas, depois os grupos), o cabeçalho do grupo (seta de recolher, nome, número,
   "…"), o recorte do grupo vazio, o "Novo grupo" (recorte tracejado no fim das cores; botão direito no painel;
   "…" das cores), renomear no lugar (F2, dois cliques), o menu do grupo (Renomear, Recolher, Subir, Descer, Marcar
   as cores, Desfazer o grupo), "Pôr no grupo" no "…" das cores, `[ ]` na ordem da tela; a folha do celular.
   Novidades (funcionalidade).
3. **Marcar e arrastar**: Ctrl/⌘+clique marca uma, Shift+clique um intervalo na ordem da tela, clique simples escolhe e
   desmarca, Esc desmarca; a marca é o disco de tinta com o tique (o da escolhida na grade do seletor); a linha "N cores
   marcadas" com Novo grupo com elas e Desmarcar; arrastar uma ou o maço para um grupo, para as soltas ou dentro do
   grupo (o lugar); o destaque do grupo que recebe; o nome sugerido; Agrupar pelo tom. Item na Novidades de hoje.
4. **Fim**: crítica do Impeccable, /code-review high, DESIGN.md, fotos 2x no computador e no celular.

## Fica de fora

- Grupos por conta (a mesma organização em todas as artes): o grupo é do desenho.
- Recolher guardado: o recolhido vale enquanto o ateliê está aberto.
- Arrastar no toque: no celular, pelo menu.
