# O Ateliê da pixel art

Pedido do dono em 12/nov/2026: a pixel art (o widget `{{pixel}}`, PLANO-PIXEL.md) passa de 9 cores para até 61,
usando as letras (1–9, a–z, A–Z; o 0 continua o transparente); mais paletas prontas, mais ferramentas (linha,
retângulo, círculo, balde, seleção, girar…), cores que se acrescentam até 61, e o editor repensado inteiro com o
Aseprite como base forte: os atalhos dele, a prancheta grande, uma visualização bonita e um menu que não seja
desajeitado. As pixel arts antigas continuam valendo, sem nada quebrar.

O que hoje incomoda: a prancheta tem no máximo 416 px dentro da folha do widget; a paleta e a grade são campos
soltos da folha, longe do desenho; as ferramentas são quatro; as dez pastilhas não crescem.

## 1. A marca no texto: 61 cores

Continua uma linha só (o Visual, o Quadro livre, o PDF, a cópia e a busca seguem de graça):

```
{{pixel: 16x16 | 0*0511a/01aab1/… | sweetie | c#ff7a90 D#203040 | figurinha | Gato}}
```

- **Os pontos**: um caractere por ponto. `0` é o transparente; `1`–`9` as cores 1 a 9 (como sempre); `a`–`z` as
  cores 10 a 35; `A`–`Z` as cores 36 a 61. A abreviação vale para todos (`a*12` são doze `a`), e os `0` do fim
  das fileiras continuam sem se escrever.
- **Retrocompatível por construção**: uma linha antiga só tem algarismos, e algarismo quer dizer o mesmo de
  antes. Nenhuma conversão, nenhuma migração: a linha antiga é uma linha nova que não usa letras.
- **Onde estão os pontos**: com letras, um texto como `Gato` poderia ser pontos ou a legenda. Regra: os pontos
  são o parâmetro logo depois da grade (`16x16`) quando ele tem só `0-9 a-z A-Z / *` e pelo menos um algarismo,
  `/` ou `*`; senão, como antes, o primeiro parâmetro só de algarismos. A folha escreve sempre a grade e logo
  os pontos; um desenho de uma fileira só de letras sai com um `/` no fim (`abc/`), que não muda nada.
- **As cores trocadas** ganham as letras: `c#ff7a90 D#203040`. Uma cor depois do fim da paleta é uma cor
  acrescentada (a paleta de 16 com `h#…` tem 17).
- **Paleta própria** (`propria`): a que a pessoa montou do zero ou reordenou; todas as cores vão escritas.
  Uma cor sem cor nenhuma (escrita à mão além da paleta) pega a da paleta Completa, para nunca sumir.
- **A grade**: de 1 a 64 de cada lado (era 32). Decidido com o dono: a linha só cresce em quem usa.

Decidido com o dono (12/nov): a grade até 64; "templates" são paletas prontas; os números do teclado seguem o
Aseprite (1–6 zoom; `[` `]` e 9/0 andam pela paleta).

## 2. Paletas prontas

As seis de hoje ficam iguais (as palavras e as 9 cores, para os desenhos de agora não mudarem). Entram:

- **Completa** (61): as 9 da Clássica e mais 52 em rampas (13 tons × 4 luzes), feita para pixel art; é a reserva
  das cores sem cor.
- **Dos jogos**: Game Boy (4), PICO-8 (16), Commodore 64 (16).
- **Dos artistas** (paletas abertas, as mais usadas no Lospec): Sweetie 16, DawnBringer 16, Endesga 32.
- **Duas cores**: tinta e papel (1 bit).

## 3. O Ateliê (o editor)

A folha do widget continua a de sempre (o palco, a legenda, o jeito, o tamanho). O campo do desenho vira uma
linha compacta: a miniatura do desenho no xadrez, "16 × 16 · 12 cores · Sweetie" e o botão **Abrir o ateliê**.
O ateliê é uma folha de tela inteira por cima dela; o widget novo, ainda sem pontos, já abre no ateliê.
Pronto (ou Esc) volta para a folha. Num `@defer`, fora do pacote inicial.

**O mundo**: a mesa de desenho. Ao fundo, a base de corte grafite (o cinza neutro que o Aseprite usa para julgar
as cores, com a grade fina da base de corte); no meio, a folha do desenho com o xadrez do transparente e a
sombra de papel pousado; as réguas de cima e do lado contando os pontos. Em volta, as tiras de cartolina creme
das folhas do Murall, com as teclas de papel da régua (`ui/_regua-teclas.scss`).

```
┌ barra de contexto: as opções da ferramenta de agora ─────── zoom · grade · desfazer · Pronto ┐
│ ferr. │ ┌ régua ───────────────────────────────┐ │ prévia (tamanho real)                │
│ M W V │ │                                      │ │ paleta: as 61 pastilhas em fileiras  │
│ B E G │ │        a folha do desenho            │ │ frente/fundo · X                      │
│ I L U │ │        (zoom, arrastar a vista)      │ │ Trocar paleta · + cor · editar cor    │
│ H     │ │                                      │ │                                       │
│ ■ □ X │ └──────────────────────────────────────┘ │                                       │
└ barra de estado: x 12 · y 5 · cor b #3a6fc4 · seleção 8 × 4 · 800% · dica da ferramenta ──┘
```

- **Ferramentas** (a coluna da esquerda, cada tecla com a letra do atalho numa etiquetinha, como o número das
  pastilhas): Seleção retangular (M), Varinha (W), Mover (V); Lápis (B), Borracha (E), Balde (G),
  Conta-gotas (I); Linha (L), Retângulo e Retângulo cheio (U, de novo alterna), Elipse e Elipse cheia (Shift+U);
  Mão (H). Embaixo, a cor da frente e a do fundo, com o trocar (X).
- **Barra de contexto** (como a do Aseprite): só as opções da ferramenta de agora. Lápis e Borracha: o tamanho
  do pincel (− e +), quadrado ou redondo, "pixel perfeito". Balde: contíguo ou a cor inteira. Formas: cheia ou
  só o contorno. Sempre: a simetria (nenhuma, de lado, de cima, as duas; o eixo tracejado de caneta vermelha).
  À direita: o zoom, a grade, desfazer e refazer, o menu Imagem, Pronto.
- **A folha**: a roda do mouse aproxima no ponto do mouse; Espaço segurado (ou a Mão, ou o botão do meio)
  arrasta a vista; dois dedos aproximam e arrastam no celular. A grade de pontos aparece a partir de um zoom
  em que ela não vira um borrão; a de 8 em 8 mais forte. A mira mostra o pincel com a cor; a forma sendo puxada
  aparece antes de soltar.
- **As cores**: a paleta em fileiras de 8 (até 61 e o transparente), cada pastilha com o caractere que vai no
  texto; a da frente com o anel de tinta, a do fundo com o anel tracejado. Clique esquerdo escolhe a da frente,
  direito a do fundo; o botão esquerdo pinta com a da frente e o direito com a do fundo (o fundo começa no
  transparente: o direito apaga, como hoje).
- **Barra de estado**: onde está o mouse, a cor debaixo dele, o tamanho da seleção ou da forma, o zoom e a dica
  dos modificadores da ferramenta.
- **Celular**: a folha ocupa a tela; as ferramentas numa fita embaixo, a paleta numa fita em cima dela; as
  opções e os menus sobem como folhas.

### Atalhos (os do Aseprite)

| Tecla | O que faz |
|---|---|
| M, W, V, B, E, G, I, L, U, Shift+U, H | as ferramentas (U e Shift+U de novo alternam cheia) |
| Alt segurado | conta-gotas enquanto segura |
| Espaço segurado | a mão enquanto segura |
| Shift no lápis | a reta desde o último ponto |
| Shift nas formas | quadrado e círculo; Ctrl, do meio para fora |
| X | troca a cor da frente com a do fundo |
| `[` `]` (e 9, 0) | a cor anterior e a próxima da paleta |
| `-` e `+` | o tamanho do pincel |
| 1 a 6 | zoom de 100% a 3200%; Ctrl+0 cabe na tela; Ctrl e `+`/`-` aproximam e afastam |
| Ctrl+' / Ctrl+Shift+' | a grade de 8 / a grade de pontos |
| Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z | desfazer, refazer |
| Ctrl+A, Ctrl+D, Ctrl+Shift+D, Ctrl+Shift+I | selecionar tudo, tirar, voltar, inverter a seleção |
| Ctrl+C, Ctrl+X, Ctrl+V, Delete | copiar, recortar, colar, apagar a seleção |
| setas (Shift: de 8) | movem o que está selecionado; sem seleção, andam o cursor do teclado (Enter pinta) |
| Shift+H, Shift+V | virar de lado, de cabeça para baixo (a seleção, ou o desenho todo) |
| Shift+O | contorno com a cor da frente em volta do desenho (ou da seleção) |
| C | o tamanho da tela (a grade), com a âncora |
| A ou F4 | editar a cor da frente |
| Enter, Esc | aplicar e cancelar o colado / a seleção flutuando; Esc sem nada volta para a folha |

Girar 90° para a direita, para a esquerda e 180° ficam no menu Imagem (o Aseprite também não tem tecla para eles).

## 4. A paleta

- **Trocar paleta**: uma folha grande com todas as paletas em seções (Do Murall, Dos jogos, Dos artistas,
  Duas cores), a busca e, em cada uma, **o desenho da pessoa já pintado nela**. Escolher mantém os números
  (como hoje); "Manter as cores do desenho" converte cada ponto para a cor mais perto da paleta nova.
- **Acrescentar** (+) até 61; **editar** a cor (o seletor do aparelho e o campo hex); **tirar** uma cor (os
  pontos dela ficam transparentes, um passo do desfazer); **arrastar** para reordenar (o desenho não muda: os
  pontos seguem a cor); **ordenar** por tom ou por luz. Reordenar ou tirar faz a paleta virar a própria.
- **Trazer de uma imagem**: como hoje, na paleta de agora; e "Criar a paleta da imagem" (até N cores, corte
  pela mediana) para uma foto sair parecida.

## 5. Features, uma por vez

Cada uma: `/code-review medium`, os testes (novos e a suíte), `npx ng build`, as fotos a 2x no computador e no
celular, BUILD + 1, as Novidades (ler NOVIDADES.md), commit e push.

1. **61 cores na marca** (`core/pixel-art.ts`): os caracteres, a abreviação, as cores trocadas com letras, a
   regra dos pontos depois da grade, a paleta própria, as paletas novas, a Completa como reserva; o desenho
   (`ui/pixel-art.ts`) com as letras; testes de ida e volta e de todas as linhas antigas lendo igual; o guia de
   marcas, o guia da API/MCP (`contrato/api-v1/guia.ts`, `docs/api/guia.md`) e a amostra do PDF.
2. **O Ateliê**: a folha de tela inteira, a mesa (zoom, arrastar, réguas, grades, mira, barra de estado), as
   ferramentas de pintar (lápis com tamanho, redondo e pixel perfeito, borracha, balde contíguo ou não,
   conta-gotas), frente e fundo, simetria, desfazer, a paleta com as 61 pastilhas, acrescentar e editar uma cor,
   o Tamanho da tela (C, com âncora), o campo compacto na folha e a prancheta antiga saindo
   (`ui/pixel-canvas.*`). Os atalhos de tudo isso.
3. **Formas**: linha, retângulo e elipse, cheios ou não, Shift e Ctrl, a prévia antes de soltar.
4. **Seleção e transformar**: seleção retangular, varinha, mover, copiar/recortar/colar flutuando, apagar,
   setas, virar e girar (a seleção ou tudo; girar tudo troca a largura com a altura), contorno.
5. **A paleta inteira**: a folha de Trocar paleta com o desenho em cada uma, tirar, reordenar, ordenar, a
   paleta própria, trazer de uma imagem com a paleta da imagem.
6. **Pelo resto do Murall**: DESIGN.md, a crítica do Impeccable no fim e o `/code-review high`.
