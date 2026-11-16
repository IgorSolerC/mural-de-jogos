# Plano: camadas e novas ferramentas no ateliê da pixel art

Pedido do dono (16/nov/2026, cartão "Layers e novas features para editor de pixel art"): camadas (criar,
renomear, mover), esticar e redimensionar a seleção, perguntar ao trazer uma imagem se ela vem nas cores da paleta
ou com as cores dela (o botão "com a própria paleta" sai), o mapa de cor sempre aberto como no Aseprite, e imagens
de verdade como referência, cada uma numa camada própria, com opacidade, que se move e muda de tamanho e nunca
entra no desenho. A pixel art de um widget (análises, anotações, comentários) continua sem camadas: só a da galeria
guarda as camadas e as referências. Estética, uso intuitivo, reaproveitar o que existe. Impeccable no começo e no
fim; uma feature por vez com `/code-review mid`; no fim, `/code-review high`.

Acrescentado pelo dono no meio da rodada 1 (16/nov): **um botão para tirar da paleta todas as cores que o desenho não
usa**, e **baixar a pixel art também no tamanho original** (um pixel por ponto).

Decidido com o dono (16/nov, três perguntas): no widget, **uma camada só** (camadas e referências moram na galeria);
a camada **escondida não entra** no desenho salvo (como no Aseprite); as referências **sincronizam** pelo armazém de
imagens que já existe. O resto é decisão minha; o que ele poderia querer de outro jeito está marcado como
**suposição**.

---

## 1. O brief (Impeccable, shape)

- **Quem e quando.** O dono, no computador (o uso principal do ateliê) e no celular, desenhando uma obra da galeria
  ou o widget de uma anotação. Modo **Operate**: o desenho é o que importa, e as ferramentas somem atrás dele.
- **O que precisa dar certo.** Desenhar em partes (o contorno numa camada, as cores noutra, um rascunho escondido),
  decalcar uma foto ou um print por baixo do desenho, e trazer uma imagem sem precisar saber antes qual dos dois
  "Trazer" do menu escolher. Prova: soltar uma foto na mesa, escolher "Como referência", baixar a opacidade,
  desenhar por cima numa camada nova, esconder a referência, Pronto, e a parede mostra só o desenho.
- **A direção (no mundo do ateliê, sem mundo novo).** A mesa de corte grafite, as tiras de cartolina, as teclas de
  tinta (`_regua-teclas.scss`), as formigas, o menu de feltro: nada muda de cara. Tudo o que entra é uma peça a
  mais nas tiras que já existem:
  - **Camadas:** uma seção nova na tira da direita, embaixo das cores, com as fileiras do índice do site (o jeito
    das listas de grupo e de pasta, `ui/_indice.scss`): de cima para baixo como a pilha, cada fileira com o olho, a
    miniatura no xadrez (`PixelThumb`), o nome e, na escolhida, o marca-texto. Embaixo, as teclas **Nova camada**,
    **Referência** e o "…" do menu (Duplicar, Juntar com a de baixo, Subir, Descer, Renomear, Apagar).
  - **Esticar a seleção:** as oito alças em volta das formigas, quadradinhos de cartolina com borda de tinta, com a
    conta das alças do Quadro livre (`resized`).
  - **Trazer uma imagem:** uma folha do ateliê (a do Tamanho da tela), com a imagem e as escolhas em cartões, cada
    um com a prévia de como vai ficar.
  - **Mapa de cor:** o quadrado de saturação e brilho e a fita do matiz, sempre embaixo das pastilhas, mexendo na
    cor da frente.
  - **Referência:** a foto deitada no papel do desenho, translúcida; escolhida, ganha a moldura tracejada e as
    alças, e a barra de contexto mostra a opacidade.
- **Fora do escopo, de propósito.** Opacidade e modos de mistura das camadas de pontos (o desenho guardado é de
  tinta cheia: 61 cores sem meio-tom); travar camada; grupos de camadas; animação (quadros); girar ou espelhar a
  referência; camadas no widget (decisão do dono); a galeria na API e na visita (já estavam fora).
- **Faixas.** Até **16 camadas de pontos** e **8 referências** por obra (**suposição**: o Aseprite não tem teto,
  mas o mural privado vai inteiro para a nuvem, até 1,9 MB compactado; 16 × 64 × 64 bem escritos são uns 80 kB no
  pior caso, e o comum é um décimo disso). A grade até 64 × 64, a paleta até 61 cores, como hoje.
- **Estados.** Uma camada só (o painel mostra a fileira dela, e é só isso; nada de vazio especial); a camada
  escondida escolhida (pintar diz "A camada está escondida" e não pinta); a referência escolhida (as ferramentas de
  pintar viram o mover dela; escolher uma ferramenta volta para a camada de pontos); a referência que ainda não
  chegou a este aparelho (a fileira com o xadrez e "imagem noutro aparelho"); o teto das camadas (a tecla apagada,
  com o porquê no título); fechar com todas as camadas com desenho escondidas (pergunta antes: mostrar ou voltar).

## 2. Os dados (`core/pixel-layers.ts`, puro)

- A obra da galeria (`PixelPiece`) continua com o `art` de sempre: os parâmetros do widget, o desenho **achatado**
  (as camadas de pontos à mostra, a de cima por cima). Tudo o que lê uma obra (a parede, a grade, as miniaturas, a
  folha da galeria, a capa, o PNG, o "Copiar como widget", o widget escolhido da galeria) continua lendo só o `art`,
  sem mudar nada.
- Campo novo, opcional: `layers?: StoredLayer[]`, de baixo para cima. Cada uma `{ id, name, hidden?: true }` e
  ou `rows` (a grade escrita como no widget, `writeGrid`, na largura e altura do `art`) ou `ref`
  (`{ src: 'murall://imagem/ID', x, y, w, h, opacity }`, em pontos da grade, com fração; só imagem guardada pelo
  Murall, nunca link de fora). A paleta e as cores são as do `art`, uma para todas (o modo indexado do Aseprite).
- A obra de uma camada só, "Camada 1", à mostra, sem referência, **não grava** `layers`: a obra de antes e a de agora
  ficam iguais, e nada muda na nuvem para quem não usa camadas.
- **A regra que nunca deixa os dois discordarem** (`withPixelPatch`): quando a mudança traz `layers`, o desenho do
  `art` é refeito delas (as camadas mandam); quando traz só o `art` (o Jeito da ficha, a paleta), as camadas ficam
  se o desenho achatado delas ainda é o do `art`, e saem se não é (o `art` manda, e a obra volta a ter uma camada
  só). A conferida (`sanitizePixelPiece`) faz a mesma conta com o que veio guardado ou da nuvem.
- **Nuvem:** `SYNC_SCHEMA` 59. Um site da 58 limparia a obra sem `layers` e mandaria de volta sem elas; com a 59
  ele para de mandar (o aviso de versão nova que já existe). A junção continua obra a obra, a mudada por último.
  A galeria é só do dono (mural privado), então não há duas pessoas mexendo na mesma obra; dois aparelhos do dono
  ficam com a obra inteira mais nova, como hoje.
- **Referências:** a imagem vai para o `ImageStore` (o banco `meu-mural:imagens`, já na limpeza do Sair), encolhida
  a 900 px como as coladas nas anotações; o endereço mora no JSON da galeria, então `localImageIds` já a conta nas
  `usadas` e ela sobe e desce da nuvem sozinha, sem nada novo no armazenamento do navegador.
- **Os widgets não mudam.** O `{{pixel: …}}` das anotações, das análises e dos comentários (também nas anotações e
  nos Kanbans compartilhados) continua o mesmo texto achatado: nada muda no formato, na sincronização ou no que
  duas pessoas veem ao mesmo tempo.
- Duplicar a obra copia as camadas; "Guardar na galeria" e "Trazer das anotações" nascem com uma camada só.

## 3. As rodadas (uma por vez, cada uma com `/code-review mid`, commit e push)

### Rodada 1: as camadas na obra da galeria (dados)
`core/pixel-layers.ts`: os tipos, `sanitizeLayers`, `flattenLayers` (de baixo para cima, só as de pontos à mostra),
`layersOf(piece)` (a de uma camada só quando não há `layers`), `storedLayers` (o que grava, ou nada quando é a
camada única padrão) e as operações de pilha (nova, duplicar, juntar com a de baixo, mover, apagar, renomear) e o
nome livre ("Camada 3"). `pixel-gallery.ts`: `PixelPiece.layers`, `PixelPatch.layers`, a regra acima, o teto, o
Duplicar. `SYNC_SCHEMA` 59. Testes: pixel-layers.spec e pixel-gallery.spec (a regra nos dois sentidos, a camada
única que não grava, o lixo, a junção), cloud-sync.spec (a impressão).

### Rodada 2: o painel das camadas no ateliê
- O ateliê ganha a entrada `layered` (a galeria: a página, a ficha da obra pelo `PixelField`, e a capa desenhada) e
  as entradas/saídas das camadas; sem ela (o widget), uma camada só, e no lugar do painel uma linha: "As camadas
  ficam nas pixel arts da galeria."
- Por dentro: `rows` continua sendo os pontos da **camada escolhida** (toda ferramenta de hoje pinta nela sem
  mudar); `layers` guarda a pilha, e o desenho achatado (`flat`) é o que a prévia, a barra de estado, o
  conta-gotas, a folha das paletas e o `changed` usam. O desfazer guarda a pilha inteira e a escolhida.
- O que vale para a pilha toda: o Tamanho da tela, girar e virar o desenho (sem seleção), recortar na seleção e
  tudo o que mexe na paleta (tirar, mover, ordenar, trocar com "manter as cores"), nas linhas de todas as camadas
  juntas. O que vale só para a escolhida: pintar, o balde, a seleção, a varinha, o mover, copiar e colar, o
  contorno, o empurrar (Alt+setas), Limpar (que vira "Limpar a camada" com mais de uma).
- A folha: cada camada um `<svg>` no papel, na ordem da pilha, e por cima o `<svg>` dos fios, da mira e das
  formigas (o que tem o foco e ouve o teclado, como hoje). Os caminhos de cada camada são guardados pela grade dela
  (só a que se pinta refaz a conta).
- O painel: as fileiras (o olho, a miniatura, o nome; dois cliques ou F2 renomeia ali mesmo, Enter grava, Esc
  volta), arrastar para mudar de lugar (como as pastilhas), o botão direito abre o menu da camada, e as teclas
  Nova camada (Shift+N) e o "…" (Juntar com a de baixo, Ctrl+E). No celular, a folha que sobe ganha duas orelhas de
  pasta, **Cores** e **Camadas**, e a fita das ferramentas um botão para cada.
- Fechar com tudo escondido pergunta ("Mostrar todas e sair" / "Voltar ao ateliê"), pelo `Confirm` do site.
- Testes: pixel-studio.spec (pintar na escolhida, a pilha achatada no `changed`, esconder não entra, mudar de
  lugar, juntar, apagar, renomear, a tela e a paleta em todas, o desfazer da pilha, o widget sem painel),
  pixel-sheet e a página (as camadas vão para a obra e voltam ao abrir).

### Rodada 3: esticar a seleção
- `core/pixel-selection.ts`: `scaleFloat(fonte, w, h)`, o vizinho mais perto (pixel art não borra), sempre a
  partir do pedaço como foi solto (esticar e voltar não estraga o desenho).
- As alças aparecem com a Seleção e o Mover e há seleção: puxar solta o pedaço e estica; Shift mantém a proporção
  (como o Aseprite). A conta das alças é a do Quadro livre: `Handle`, `ALL_HANDLES` e `resized` saem de
  `ui/free-board/edit-ops.ts` para `core/resize-box.ts` (com o tamanho mínimo e o arredondamento por quem usa) e
  o Quadro livre importa de lá.
- No menu Imagem, com seleção, **Tamanho da seleção…**: a folha do Tamanho da tela (os campos, os prontos e a
  âncora), dizendo da seleção. Para quem usa o teclado.
- Girar e virar o pedaço esticado partem do que ele é agora. O desfazer: soltar, esticar e assentar é um passo.
- Testes: pixel-selection.spec (esticar, encolher, a proporção, a máscara), pixel-studio.spec (as alças, o Shift,
  a folha, o desfazer).

### Rodada 4: o mapa de cor sempre aberto
- `ui/pixel-studio/color-map.ts`: o quadrado de saturação e brilho (o matiz por trás, o branco da esquerda e o
  preto de baixo) e a fita do matiz, com o anel de tinta no ponto; o matiz guardado nele (o preto não perde o
  matiz), arrastar com o mouse ou o dedo, as setas no teclado (Shift: de 10 em 10), cada um com o nome para quem não
  vê. Embaixo, o Hex, o "‹ Lugar b ›", "Voltar à da paleta" e "Tirar a cor", que hoje se escondiam atrás do Editar.
- Sai o Editar e o botão do seletor do aparelho; A e F4 levam o foco ao mapa; dois cliques na pastilha também.
- Com o transparente na frente, o mapa fica apagado com "O transparente não tem cor".
- Arrastar é um passo só no desfazer (o `colorsBefore` de hoje).
- **Tirar as cores sem uso** (pedido do dono): no "…" das Cores e no menu delas, "Tirar as N cores sem uso", que
  some quando todas são usadas. Conta os pontos de **todas** as camadas, as escondidas também (uma cor da camada
  escondida está em uso: tirá-la estragaria a camada ao mostrar). As que ficam descem para os números de baixo na
  mesma ordem (o `removeInk` de hoje, uma de cada vez, numa conta só), a paleta vira a Própria, e é um passo do
  desfazer. A frente e o fundo seguem a cor deles (a que saiu vira o transparente).
- Testes: color-map.spec (as contas do HSV, arrastar, o teclado), pixel-tools.spec (as sem uso, a ordem que fica),
  pixel-studio.spec (o mapa muda a cor da frente, um passo no desfazer, o transparente, tirar as sem uso com uma
  camada escondida).

### Rodada 5: as camadas de referência
- **Referência** no painel (e no menu da camada) escolhe uma imagem e a deita no papel, cabendo inteira, na
  opacidade de 50%, numa camada própria logo acima da escolhida (**suposição**: por cima, que é onde se vê ao
  decalcar, e a opacidade deixa ver o desenho; arrastar para baixo é um gesto).
- Escolhida a referência: arrastar no papel a move, as alças mudam o tamanho (sempre na proporção da foto), as
  setas andam um ponto (Shift: oito); a barra de contexto mostra a **Opacidade** (a régua do site, de 10% a 100%),
  **Caber na tela** e **Trocar a imagem**. Fora do papel, o pedaço que sobra aparece apagado na mesa enquanto ela
  está escolhida (para achar as alças), e cortado na beirada do papel quando não está.
- Nunca entra no desenho: o achatado só lê as camadas de pontos, e o conta-gotas e a varinha também não a veem.
- As referências guardam com a obra (rodada 1); o Tamanho da tela e o recortar andam com elas.
- Testes: pixel-layers.spec (a referência não entra), pixel-studio.spec (deitar, mover, esticar na proporção, a
  opacidade, escolher uma ferramenta volta para os pontos, guardar e reabrir).

### Rodada 6: trazer uma imagem pergunta
- Uma ação só, **Trazer uma imagem…** (no menu Imagem; colar e soltar na mesa também), abre a folha **Trazer a
  imagem**: a imagem pequena e o nome, e as escolhas em cartões com a prévia de como vai ficar:
  - **Nas cores da sua paleta**: "Cada ponto vira a cor mais perto das N da Sweetie 16" (a prévia já convertida).
  - **Com as cores da imagem**: "A paleta vira as N cores dela" (a prévia com elas); com outras camadas
    desenhadas, "as outras camadas passam para a cor mais perto".
  - **Como referência** (só na galeria): "Fica por baixo do desenho para você copiar; não entra na pixel art".
- Na galeria, os pontos vêm numa **camada nova** com o nome do arquivo (nada do que já estava se perde); no widget,
  como hoje, no lugar do desenho. Saem o "Trazer, com as cores dela…" do menu Imagem e o do menu das Cores.
- Testes: pixel-studio.spec (a folha ao colar, soltar e pelo menu, cada escolha, a camada nova, o widget, cancelar).

### Rodada 7: baixar no tamanho original (pedido do dono)
- Hoje o Baixar da galeria salva um PNG com o lado maior de 512 px ou mais (cada ponto um quadrado inteiro). Entra
  ao lado o **tamanho original**: um pixel por ponto (16 × 16 dá um PNG de 16 × 16), o arquivo que se abre num
  editor de pixel art. Os dois saem do mesmo `core/pixel-png.ts` (a escala 1).
- Onde: o menu do botão direito da obra ganha "Baixar no tamanho original (16 × 16)" embaixo do "Baixar PNG"; a
  tira das marcadas, o mesmo par; o Baixar da etiqueta de hover continua o grande (o padrão de dois botões das
  etiquetas não muda, ver CLAUDE.md). O nome do arquivo diz o tamanho ("gato-16x16.png").
- Testes: pixel-png (a escala 1), a página (o item do menu, o nome do arquivo).

### Rodada 8: o fim
A crítica do Impeccable (as fotos no computador e no celular, o painel com muitas camadas, a referência), as
correções dela, `/code-review high` e as correções, DESIGN.md ("Camadas e referências no ateliê"), Novidades e a
memória do projeto.

## 4. Em todo commit

BUILD +1 (`core/build.ts`), Novidades pela regra do NOVIDADES.md, a suíte inteira, os testes de regra, `npx ng
build`, a dist aberta com dados salvos (os ciclos de import só quebram lá), fotos de perto no computador e no
celular, commit no nome do dono e push.

## 5. Andamento

- [x] Rodada 1: dados (BUILD 909; sem item nas Novidades: base sem tela, o item vem com a rodada 2)
- [x] Rodada 2: o painel das camadas (BUILD 910, Novidades 1.47.0)
- [x] Rodada 3: esticar a seleção (BUILD 911, Novidades 1.47.1)
- [ ] Rodada 4: o mapa de cor
- [ ] Rodada 5: as referências
- [ ] Rodada 6: trazer uma imagem pergunta
- [ ] Rodada 7: baixar no tamanho original
- [ ] Rodada 8: crítica, `/code-review high`, DESIGN.md
