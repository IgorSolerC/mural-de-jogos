---
target: galeria de pixel arts
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\pages\\pixel-arts-page.html"
target_fingerprint: "sha256:8606e68214cab48583896a21b2c45cf879fe27109f4e4fe5f1b220903f2e43ad"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\pages\\pixel-arts-page.html"
timestamp: 2026-11-16T06-53-38Z
slug: src-app-pages-pixel-arts-page-html
---
Method: dual-agent (A: revisão de design · B: detector e navegador)

## Design Health Score

| # | Heurística | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 2 | Nenhum título visível da página; na tira, os desabilitados iguais aos ativos. |
| 2 | Correspondência com o mundo real | 3 | A papelaria fala bem; "Jeito" sozinho é jargão e a etiqueta dizia só "PIXEL". |
| 3 | Controle e liberdade | 3 | Desfazer em tudo; no celular, abrir uma obra subia o teclado. |
| 4 | Consistência e padrões | 3 | Peças reaproveitadas fielmente; o lápis era Ateliê e também Renomear. |
| 5 | Prevenção de erros | 3 | Apagar da tira sem a tinta de perigo, ao lado do Limpar. |
| 6 | Reconhecer em vez de lembrar | 2 | Mostra e Grade só com ícones parecidos; a descrição só aparece com hover. |
| 7 | Flexibilidade e eficiência | 3 | N, Ctrl/Shift+clique, Shift+F10, Ctrl+C, arrastar; falta atalho de vista. |
| 8 | Estética e minimalismo | 3 | A Mostra é linda; o cromo empurrava a arte para baixo da dobra. |
| 9 | Recuperação de erros | 3 | O cartão vazio dizia "com esse filtro" também para a busca. |
| 10 | Ajuda e documentação | 2 | Arrastar e Ctrl+clique só se descobrem por acaso. |
| **Total** | | **27/40** | **Bom** |

## Veredito de especificidade

Feita para o Murall nas obras (a Mostra com cada desenho no material dele, a legenda de museu) e emprestada na moldura: a página não tinha nome nem soleira, só o bilhete de Extras. O detector (exit 0, 7 avisos) não achou nada primário: as cores e o fundo em grade são do papel milimetrado (de propósito); o 0.72rem da folha de trazer era um desvio real da escala.

## Problemas prioritários (e o que foi feito)

- [P1] A página sem nome: corrigido, o logo "Pixel arts" em letras de pontos num papel milimetrado (`PixelArtsLogo`).
- [P1] A arte abaixo da dobra: a barra mais perto da parede (28px) e numa linha só; o resto (a barra das Anotações no celular, a fileira de pastas) é das peças comuns e fica para um pedido próprio.
- [P1] Tocar numa obra abre um formulário: a mesa da ficha mais larga, com o desenho até 228px, e o foco no nome só com mouse. A vista só de olhar ficou de fora (pergunta para o dono).
- [P2] Mostra e Grade indistintas: a imagem para a Mostra, a grade para a Grade, e o nome à mostra a partir de 1240px.
- [P2] A etiqueta no toque entra no meio da legenda: mantida, é o padrão sem mouse aprovado na Wishlist (CLAUDE.md, botões de hover).

## Menores (feitos)

O cartão vazio diz "Nada com “dragão”" quando é só a busca; "Jeito: Pixel" na etiqueta da ficha; a paleta no lugar do lápis para o Ateliê; o Apagar da tira na tinta de perigo; 0.78rem na folha de trazer.
