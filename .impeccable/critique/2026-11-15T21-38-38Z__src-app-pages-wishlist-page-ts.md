---
target: a Wishlist repensada (rodada 7)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\pages\\wishlist-page.ts"
target_fingerprint: "sha256:84adbde7b4841ddd19a9f3a73748fad7580ec474c123422ed25d017378e5fae2"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\pages\\wishlist-page.ts"
timestamp: 2026-11-15T21-38-38Z
slug: src-app-pages-wishlist-page-ts
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Desfazer em todo gesto, "Mostrando X de Y", o caminho; a busca dentro de uma pasta dizia "na wishlist" (corrigido) |
| 2 | Match System / Real World | 3 | A revista é coerente; as palavras de pôr variam (Adicionar jogo / Pôr na wishlist / Pôr na lista); "MUST 1º" é seco |
| 3 | User Control and Freedom | 3 | Desfazer em toda a parede; a folha descartava sem perguntar (corrigido) |
| 4 | Consistency and Standards | 3 | Peças das Anotações de verdade; LATER ficava vermelho na mão (corrigido); a mesma tag com três caras |
| 5 | Error Prevention | 2 | Esc/fundo/X/Cancelar jogavam fora até 4000 letras (corrigido: a pergunta das anotações) |
| 6 | Recognition Rather Than Recall | 2 | Tocar começa a resenha sem nada dizer; a descrição atrás do hover |
| 7 | Flexibility and Efficiency | 3 | N, /, Shift+F10, botão direito, arrastar e Mover para…; sem marcar vários (P15) |
| 8 | Aesthetic and Minimalist Design | 3 | Computador rico e contido; celular com a etiqueta em todo card |
| 9 | Error Recovery | 3 | Avisos bons ("troque o item para salvar") |
| 10 | Help and Documentation | 2 | Nada explica o toque nem o hover da descrição |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict

Autoral: a colagem de revista, o título em bilhete de resgate, o cupom, as capas recortadas à tesoura com retícula, a folha de espiral da descrição e as pastas manilha das Anotações. As fraquezas são de comportamento: a folha é o editor das anotações quase inteiro (régua de 12 botões para uma nota curta) e o toque no celular não foi composto.

Detector: 28 achados (1 aviso, 27 de deriva do design system). O aviso (broken-image no wish-adder.html) é o `[src]` do Angular. As cores e tamanhos "fora do sistema" são a arte da revista (sombras, retícula, manchetes). No navegador: o adesivo MUST com contraste 2,6–3,9:1 (aprovado e congelado; o sentido também está no texto), a dica da busca de itens a 4,1:1 (corrigida), recortes orgânicos (de propósito), cartão aninhado na busca colada (o padrão da pasta) e títulos pulados no editor fechado (fora da Wishlist).

## What's Working

1. Reuso de verdade: pastas, folha dos filtros, avisos com Desfazer, arrasto, cartão vazio e etiqueta de hover são as peças das Anotações, com o comportamento junto.
2. A Grade dá a densidade pedida (dez por fileira a 1440px) sem perder a revista.
3. Teclado e leitor de tela na parede: menus por Shift+F10, aria-live nas trocas, a vontade dita no botão.

## Priority Issues

1. [P1] A folha descartava o escrito sem perguntar. Corrigido: a pergunta das anotações em Esc, fundo, X e Cancelar.
2. [P1] No celular, a etiqueta à vista quebrava nomes e tags no meio da palavra. Corrigido: a etiqueta desce para a linha de baixo quando não cabe; tags sem quebra (reticências na longa).
3. [P2] No celular, o primeiro recorte fica a 1,5 tela de distância (barra em três linhas e as pastas grandes). Fica para depois: mexe na pasta da barra e na grade das pastas, que são das Anotações também.
4. [P2] A descrição longa era lida inteira a cada foco. Corrigido: o leitor ouve o começo (180 letras, "continua no Editar").
5. [P2] Hierarquia da folha: a régua do texto domina; as etiquetas cheias perdem o nome. Mantido de propósito (o dono pediu o editor Visual e o padrão das etiquetas do editor).

## Persona Red Flags

Casey (celular): o primeiro desejo escondido; nomes cortados (corrigido); duas etiquetas por card. Jordan (primeira vez): tocar abre a resenha sem aviso; "MUST 1º" sem explicação; Esc perdia o texto (corrigido). Sam (teclado): na Grade o Tab chegava na etiqueta antes do toque (corrigido); a descrição longa lida inteira (corrigido).

## Minor Observations

A busca dentro de uma pasta agora diz "Procurar em {pasta}" (corrigido). A prévia "Vai ficar assim" não mostra as tags nem a ponta. A Vontade da folha mostra a escolhida só pela inclinação. A etiqueta da Grade cobre o alto da capa no computador. Tags com cara diferente na parede e na folha dos filtros.

## Questions to Consider

- Tocar num recorte deveria começar a resenha, ou mostrar a descrição e as ações?
- A descrição de um desejo precisa de títulos, código e tela cheia?
- No celular, a etiqueta precisa estar em todo card, se o dedo segurado já abre o menu com a descrição?
