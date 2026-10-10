---
target: Mural de anotações
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\review-card.ts"
target_fingerprint: "sha256:2eae098367206847d6e9a379672af48630691f58ec2d2d81ea65a2f9cc3efc3a"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\review-card.ts"
timestamp: 2026-10-07T20-45-08Z
slug: src-app-ui-review-card-ts
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score (notes wall, before fixes)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | "Larga" made the card narrower (invalid calc); lock on every card is wallpaper |
| 2 | Match system / real world | 3 | Date with "Não lembro" is a review idea, not a note idea; "todos os 5 anotações" |
| 3 | User control and freedom | 3 | First category decides the section, not controllable |
| 4 | Consistency and standards | 2 | Sort by category = first only, filter = all; "Resenha de X" on a note |
| 5 | Error prevention | 3 | Required body blocks title-only reminders |
| 6 | Recognition rather than recall | 3 | Section order depends on invisible sticker order |
| 7 | Flexibility and efficiency | 2 | Checklists can't be ticked on the wall card |
| 8 | Aesthetic and minimalist design | 3 | Editor stacks 7 sections + kit; Capas = "SEM CAPA" monograms |
| 9 | Error recovery | 3 | Body error below the fold |
| 10 | Help and documentation | 2 | Nothing explains Larga/Alta or Publicar for notes |
| Total | | 26/40 | Acceptable |

## Priority issues
- [P1] Larga narrower than Normal (calc with two-value --in-gap) — FIXED (ea85d3a)
- [P1] Notes filter layout lost to .sem-julgamento.sem-dificuldade — FIXED
- [P1] Phone: cover-less note keeps an empty cover column — FIXED
- [P2] Sort by Categoria uses only the first category; can't choose the main one
- [P2] Editor buries the note body (Título → capa → Categorias → Data → Anotação); date block heavy; body required
- [P2] Checklists can't be ticked on the wall card (phone at the supermarket)
- Minor fixed: gender in filter summary, "Anotação de X", private line for notes, decorative checkboxes on cards, placeholder contrast.

## Detector
CLI: 15 advisory findings, all false positives or deliberate (mask #000, foil gradient, var fallbacks, hairline radius). Browser (CSP bypass): low-contrast on cards is a false positive (paper drawn by app-paper-art); real: placeholder contrast (fixed for notes), skipped heading h2→h4 in editor preview.
