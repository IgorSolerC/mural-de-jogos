---
target: Filtrar no Kanban (altura das colunas)
total_score: 26
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 1
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\pages\\kanban-page.ts"
target_fingerprint: "sha256:c6e945c8b55c6b2eb470f9fd6ad9c67d965a244758a9ea7cf7f2f46340247c97"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\pages\\kanban-page.ts"
timestamp: 2026-11-11T13-56-11Z
slug: src-app-pages-kanban-page-ts
---
Method: dual-agent (A: design review · B: detector + browser)

Escopo: abrir e fechar o Filtrar no Kanban (a altura das colunas). Conserto: a folha continua observada até sair de verdade (animate.leave), e a saída mede de novo.

| # | Heurística | Nota | Ponto |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | Filtrar aceso, aria-expanded, "Mostrando X de Y"; o salto do quadro não diz de onde veio |
| 2 | Mundo real | 3 | folha presa funciona; coluna que encolhe não tem par no papel |
| 3 | Controle e liberdade | 4 | fecha pelo Filtrar, Pronto e Esc; adesivos com X |
| 4 | Consistência | 3 | mesma FilterCard do mural; aqui rouba altura (com motivo) |
| 5 | Prevenção de erros | 3 | as colunas não ficam mais curtas para sempre |
| 6 | Reconhecer | 3 | adesivos e número no Filtrar depois de fechar |
| 7 | Flexibilidade | 2 | sem atalho para o Filtrar; o quadro anda 229px a cada vez |
| 8 | Estética | 2 | folha de ~207px para uma fileira de tags (custa 2 notas por coluna) |
| 9 | Recuperar de erros | n/a | sem estado de erro |
| 10 | Ajuda | 3 | a folha explica toque, botão direito e segurar |
| Total | | 26/36 | bom |

Detector: 0 achados reais (1 aviso design-system-color no h1 sr-only: falso positivo); filter-card.ts limpo. Overlay bloqueado pelo CSP (script-src 'self'). Sinal de reserva: colunas 696 → 467 → 696 px (antes, aberto, fechado).

Problemas:
- [P1] O quadro salta seco 229px e o fechar tem duas fases (a folha desbota, faixa vazia ~140ms, depois o salto); abrir reserva o espaço antes de a folha descer. Animar o espaço junto (grid-template-rows 0fr↔1fr ou view transition). /impeccable animate
- [P2] No celular a regra "cabe na tela" já não vale (piso 360px): a página cresce e, ao fechar, a rolagem é cortada (~130px de pulo extra). /impeccable adapt
- [P2] No computador a folha custa 229px para uma fileira de tags; sobra largura à direita das colunas. Mexe em aparência aprovada (FilterCard partilhada). /impeccable distill
- [P3] Aberto com a página no topo, as colunas descem a y≈705. /impeccable clarify
- [P3] A rolagem interna das colunas ao encolher não guarda a âncora. /impeccable harden

Personas: avançado no computador (tranco de 229px a cada abrir/fechar, sem atalho); celular (vê quase só a folha; no Pronto a página pula duas vezes).
Menores: pointer-events: none na .sobe; seta "›2" do celular cortada pela folha.
