---
target: visita dos Flashcards
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\visit-study.html"
target_fingerprint: "sha256:cbdbac0ebfb1fbb18f22d9eb386d3b3e39d1118695932ef57d0c533e98091104"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\visit-study.html"
timestamp: 2026-11-09T13-45-15Z
slug: src-app-ui-visit-study-html
---
Method: dual-agent (A: design · B: detector)

Alvo: a visita dos Flashcards com as mesmas peças do dono (StudyGroupTabs, StudyPiles, StudyCardWall).

Nota: 29/40 (Visibilidade 3, Mundo real 3, Controle 3, Consistência 4, Prevenção 3, Reconhecer 2, Flexibilidade 3, Estética 4, Recuperar 2, Ajuda 2).

Especificidade: específica do produto (pilha com elástico, tira de papel, cartolina, etiqueta de tinta, menu de feltro); a visita ficou igual à página do dono.

Detector: CLI limpo (4 avisos de cor padrão do navegador, falsos positivos). No navegador, 14 por largura: texto de 8–9px no rodapé do flashcard (peça do dono, já existente), baixo contraste por fundo de papel (falso positivo), cartas aninhadas (metáfora de papel).

Prioridades (todas valem igual para a página do dono, peça já aprovada; não mudadas nesta rodada):
- [P1] Miniatura no toque sem etiqueta: o caminho para a anotação é só o dedo segurado.
- [P1] "Atrás está a anotação" mistura o verso com a anotação inteira.
- [P2] "Nenhum flashcard com esse filtro" sem botão de limpar.
- [P2] Nada diz que tocar vira (quem visitava aprendeu que tocar abria a leitura).
- [P3] Copiar baralho desabilitado sem explicação.
