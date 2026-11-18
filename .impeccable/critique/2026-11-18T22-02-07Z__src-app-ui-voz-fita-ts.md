---
target: fita da voz e modo estudo
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\voz-fita.ts"
target_fingerprint: "sha256:7c2049407ac0d58be131e599d98c9871b93cf0f4ad13f660ad8efafbe84ce46c"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\voz-fita.ts"
timestamp: 2026-11-18T22-02-07Z
slug: src-app-ui-voz-fita-ts
---
Method: dual-agent (A: revisão de design · B: detector + navegador)

## Saúde do desenho (Nielsen): 27/40

| # | Heurística | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | sob os rabiscos, a faixa da frase lida é o único sinal de onde a voz está |
| 2 | Mundo real | 3 | o ícone do rabisco sozinho pode ler como "desenhar" |
| 3 | Controle e liberdade | 2 | não dá para esconder de novo uma palavra revelada |
| 4 | Consistência | 3 | ↑ ↓ e Espaço tomam a rolagem com a fita à mostra (pedido do dono) |
| 5 | Prevenção de erros | 3 | palavras de um laço eram alvos minúsculos no celular |
| 6 | Reconhecer | 2 | os atalhos só no title |
| 7 | Flexibilidade | 3 | sem atalho para o modo estudo nem para revelar |
| 8 | Estética | 3 | a 320px a segunda fileira da chapa ficava órfã |
| 9 | Recuperação | 3 | a ponta da velocidade só no leitor de tela (há o balanço) |
| 10 | Ajuda | 2 | nenhuma dica no app |

## Especificidade
Feito para o Murall: a fita cassete, o LACO das descrições secretas, a pauta intacta. Detector: 1 aviso no .ts e 17 no .scss,
todos cores e medidas da chapa desenhada (falsos positivos pelo DESIGN.md); no painel, nada na fita. Medidas: rabiscos com
desvio de 0px, nada se mexe ao revelar, contrastes 13:1 (etiqueta), 3,2:1 (ligada, ícone), 3,4:1 (rabisco aceso).

## Prioridades e o que foi feito
- [P1] Alvos minúsculos no celular: feito (24px, o desenho num filho).
- [P1] ↑ ↓ e Espaço tomam a rolagem: fica (pedido explícito do dono; PageUp/PageDown rolam).
- [P2] Atalhos e modo estudo não se ensinam: feito (dicas de primeira vez).
- [P2] Esconder de novo / revelar a frase: fica de fora (muda o pedido).
- [P3] O lugar da leitura sob o rabisco: fica (a faixa e o fio laranja continuam por baixo).
- 320px: duas fileiras equilibradas, feito. Leitor de tela: "o texto vira rabisco na tela", feito.
