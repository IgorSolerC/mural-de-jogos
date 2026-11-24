# Soltar imagens na galeria de pixel arts

Pedido do dono (cartão "Arrastar imagens de fora para dentro de uma pasta / mural de pixelarts", 24/nov/2026):
pegar imagens do computador, arrastar para a galeria (ou para uma pasta dela) e elas virarem pixel arts da
galeria, com uma paleta feita das cores da imagem e o nome do arquivo. Imagem maior que 64 × 64: o site pergunta
se é uma pixel art ampliada e a converte para o tamanho de verdade, com a proporção certa (o site adivinha quando
dá; quem decide é a pessoa). Acima de 256 × 256, o mesmo, com o teto de 256 × 256.

Impeccable no começo e no fim; uma rodada por vez, cada uma com /code-review mid antes da próxima; /code-review
high no fim. Um commit (com push) por rodada.

## O que já existe e é reaproveitado

- **A galeria** (`pages/pixel-arts-page.*`, `core/pixel-gallery*.ts`): `PixelGallery.create` faz a obra; as
  pastas são as das Anotações (`PixelFolders`, grupo `galeria:pixel-arts`); o Desfazer pelo aviso (`Toasts`);
  a obra que chega pisca (`land`).
- **O arrasto da parede** (`pages/wall-drag.ts`): o alvo aceso (`data-alvo` nas pastas, no caminho e no vão), a
  etiqueta amarela que diz o que vai acontecer (`.arrasto-dica`, `ui/_arrasto.scss`) e parar em cima de uma pasta
  abre ela (`SPRING_MS`). O soltar de arquivos usa as mesmas peças: quem arrasta uma imagem do computador vê o
  mesmo que quem arrasta uma obra.
- **Trazer a imagem do ateliê** (`ui/pixel-studio/pixel-studio.ts`, `askImport`): `shrink` (a imagem encolhida
  pelo canvas), `medianCut` (as cores dela), `quantize` (cada ponto na cor mais perto), a paleta `propria`, o
  nome do arquivo (`cleanLayerName`). Saem do ateliê para um lugar comum e os dois usam.
- **Os cartões de resposta com prévia** (`.trazer-cartao`, camadas.scss) viram um mixin usado pelo ateliê e pela
  folha nova; a folha nova é a ficha de fichário do "Trazer das anotações" (`ui/pixel-import-sheet.ts`).
- `imageFileOf` / `ImageProblem` / `MAX_SOURCE_BYTES` (`core/images.ts`).

## Decidido sem perguntar (o dono pode reverter)

- **D1. O teto das pixel arts sobe de 64 para 256 em todo lugar** (`PIXEL_MAX`): a obra trazida de 200 × 150
  precisa abrir no ateliê, ir para o widget e para a capa como qualquer outra. Os desenhos de antes não mudam.
  A abreviação `d*nn` continua com dois algarismos: uma sequência de 100 ou mais vira duas (`0*99` + `0*21`), e
  todo site antigo lê.
- **D2. Até 64 × 64 entra direto**, sem pergunta: o pedido só pergunta das maiores.
- **D3. A paleta é sempre a da imagem** (`propria`): com até 61 cores, as cores exatas dela, da mais usada para a
  menos; com mais, as 61 do corte na mediana, e cada ponto na mais perto. Quase transparente (alfa < 128) vira o
  transparente.
- **D4. O nome é o do arquivo**, sem a extensão, limpo (o teto do título); "image.png" (o nome do colado) fica
  "Sem título".
- **D5. A pasta é onde se solta**: em cima de uma pasta, nela; no caminho, naquele pedaço; em qualquer outro
  lugar da página, na pasta aberta. Parar em cima de uma pasta abre ela, como no arrasto das obras.
- **D6. Sem mouse também**: "Trazer do computador" (o seletor de arquivos, várias de uma vez) no cartaz da
  galeria vazia, na pasta vazia e no menu do vão; no celular é o único jeito.
- **D7. Uma soltada é um passo do Desfazer**: o aviso diz quantas vieram e para onde, e o Desfazer tira todas.
- **D8. A ampliada, adivinhada**: o site procura de quantos em quantos pontos a cor muda, em cada eixo (`kx`,
  `ky`, e onde a grade começa); acha a grade quando quase todas as mudanças de cor caem nela. Cada ponto da obra
  é a cor que mais aparece no quadradinho. Proporção certa = cada eixo dividido pelo dele.
- **D9. Acima de 256 depois da conversão** (ou a imagem comum maior que 256), a obra encolhe até caber em
  256 × 256, sem deformar.
- **D10. O peso**: a galeria inteira tem um teto de texto (`PIXEL_GALLERY_TEXT_MAX`), além das 500 obras, para
  não estourar o armazenamento do navegador nem o mural da nuvem; a soltada que passaria diz quantas couberam.

## Compartilhado e sincronização

A galeria é só da conta (o mural privado, `pixelArts`, juntada obra a obra; a apagada fica apagada). Nada aqui é
de grupo compartilhado. O que importa:
- Obras novas são obras como as outras: a junção entre aparelhos e entre abas não muda.
- Um aparelho com o site antigo (até atualizar) não lê uma obra maior que 64 e a deixa de fora, sem lápide: a
  junção do aparelho novo continua com ela. Teste na junção.
- As pastas novas não nascem aqui (a soltada usa as que existem).

## Rodadas

1. **Teto de 256** (D1, D10): `PIXEL_MAX`, a abreviação de 100+, os tetos de texto do desenho e da camada, o
   peso da galeria, o texto do guia da API ("de 1 a 256"); o ateliê, o widget e os jeitos conferidos com um
   256 × 256 (tempo de desenho). Testes de formato, de ida e volta e da junção com o site antigo.
2. **Da imagem à obra** (D3, D4, D8, D9): `core/pixel-import.ts`, puro: adivinhar a ampliação, desfazer a
   ampliação, encolher até o teto, a paleta da imagem e o nome. `shrink` sai do ateliê para cá (a parte do
   canvas num `ui/` pequeno). Testes com imagens feitas no teste (ampliadas 1×, 3×, 4×5, com borda cortada, com
   ruído, foto).
3. **Soltar na galeria** (D2, D5, D6, D7): o soltar de arquivos na página (pastas, caminho, vão, cartazes), a
   etiqueta e o alvo aceso do arrasto, "Trazer do computador"; as até 64 entram direto, com o aviso e o
   Desfazer. Novidades (funcionalidade).
4. **A folha das grandes** (D8, D9): as maiores que 64 numa folha só, cada uma com as duas respostas e a prévia
   de como fica ("Pixel art ampliada, cada ponto com N × N" com o N ajustável, e "Imagem do tamanho dela"), a
   adivinhada já escolhida. Trazer leva todas da soltada de uma vez.
5. **Fim**: crítica do Impeccable, /code-review high, fotos de perto no computador e no celular, memória.
