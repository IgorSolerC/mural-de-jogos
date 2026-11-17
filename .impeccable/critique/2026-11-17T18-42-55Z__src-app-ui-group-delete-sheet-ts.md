---
target: folha Apagar o grupo
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\group-delete-sheet.ts"
target_fingerprint: "sha256:d7ad87c5aa5ecf365fe52a37e029894d844ad6d932c406feb5f76f5a11fe0104"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\group-delete-sheet.ts"
timestamp: 2026-11-17T18-42-55Z
slug: src-app-ui-group-delete-sheet-ts
---
Method: dual-agent (A: design review · B: detector + browser overlay)

## Design Health Score — 29/40 (Good)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | "O que acontece" ao vivo; no celular ficava abaixo das escolhas no Levar (consertado: subiu para logo abaixo dos destinos) |
| 2 | Match system / real world | 3 | "os padrões" é palavra da casa, pouco clara para quem chega |
| 3 | User control and freedom | 3 | Cancelar, X e Esc; sem Desfazer depois (D9) |
| 4 | Consistency and standards | 3 | Peças de sempre; o mesmo botão vermelho de lixeira nos destinos seguros (consertado) |
| 5 | Error prevention | 3 | Padrão seguro com foco; botão diz o destino |
| 6 | Recognition rather than recall | 3 | Contas e nomes à mostra |
| 7 | Flexibility and efficiency | 2 | Levar pede três decisões, com busca e criar pasta |
| 8 | Aesthetic and minimalist design | 3 | Levar longo no celular |
| 9 | Error recovery | 3 | Erro fica na folha, sem dizer o que passou |
| 10 | Help and documentation | 3 | A lista do que acontece é a ajuda certa na hora |

## Design specificity
Feita para o Murall: ficha vermelha com tachinha, segmentos de papel, marca-texto, pickers de sempre, voz do dono com números de verdade. Estrutura de seções de formulário igual às outras folhas.

Detector: CLI limpo (0). Overlay (com bypass de CSP no navegador automatizado): na folha, só os placeholders "Buscar grupo" e "Buscar ou criar pasta" a 4,0:1 (dos pickers compartilhados, não deste arquivo); o resto era a parede atrás do modal (falsos positivos ou fora do alvo).

## Priority issues
- [P1] Destinos seguros com o mesmo botão vermelho de lixeira de "Apagar tudo" → consertado: tinta escura com pasta/seta; vermelho só em Apagar tudo.
- [P1] No celular, o Levar escondia as consequências embaixo das escolhas → consertado: "O que acontece" logo abaixo dos destinos.
- [P2] Levar com duas buscas e criar pasta → mantido: escolher a pasta (e criar) foi pedido do dono.
- [P2] Legenda "O que está nele" não é a pergunta → consertado: "Para onde vai o que está nele"; subs "Numa pasta nova", "Um grupo seu", "Não volta".
- [P2] Sem Desfazer nem "abrir a pasta" no fim → mantido (D9); fica como ideia.

## Persona red flags
- Jordan: "padrões" e "quadro do Kanban" sem explicação; botão vermelho assustava no destino seguro (consertado).
- Casey (celular): consequências fora da tela no Levar (consertado).
- Sam (teclado/leitor): foco no destino escolhido, anel visível, fieldset/legend; aria-live relê a lista toda ao trocar o destino.

## Minor
- "Grupo deletado" destoa de "apagar" (nome escolhido pelo dono).
- Placeholders dos pickers a 4,0:1 (peça compartilhada, aparência aprovada).
