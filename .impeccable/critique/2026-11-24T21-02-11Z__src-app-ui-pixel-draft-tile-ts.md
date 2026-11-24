---
target: os rascunhos da pixel art
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\pixel-draft-tile.ts"
target_fingerprint: "sha256:d5bd127bbce4f20287bfd36fd6c6afe0813a5a16c58f95b866b53aa15f40aa70"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\pixel-draft-tile.ts"
timestamp: 2026-11-24T21-02-11Z
slug: src-app-ui-pixel-draft-tile-ts
---
Method: dual-agent (A: design review · B: detector + browser)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | "Rascunho guardado às" only on desktop; phone status bar hidden |
| 2 | Real world | 3 | "A obra saiu da galeria" vague |
| 3 | Control/freedom | 3 | widget toast Descartar without undo |
| 4 | Consistency | 3 | draft tile at Grade size even in Mostra |
| 5 | Error prevention | 3 | discarding a resumed draft also drops older work, unannounced |
| 6 | Recognition | 3 | search hides the section |
| 7 | Flexibility | 3 | one tap continues |
| 8 | Aesthetic | 3 | no boundary between drafts and obras |
| 9 | Recovery | 3 | gallery full closes the ateliê (draft kept) |
| 10 | Help | 4 | hint line and question copy explain the model |
| **Total** | | **31/40** | Good |

Specificity: dialogs are Murall (bilhete, tachinha); the Rascunhos section is generic. Detector: 0 findings in the new pieces; design-system-color rgb(0,0,0) on @if/@for (false positive), skipped-heading and nested-cards from other pages.

Priority issues:
1. [P1] No draft reassurance on phones (status bar display:none <=760px) — show the time in the phone ateliê top.
2. [P1] Discarding a resumed draft drops older work with ~5s undo — say so in the leave question; longer undo toasts.
3. [P2] Drafts blend with obras — close the section with the dashed picote.
4. [P2] Widget toast Descartar without undo — use discardDraft.
5. [P2] Gallery full closes the ateliê — draft stays in the section; kept as is.

Personas: Casey no save sign on phone; Sam busy tile disabled (unreachable), short toasts; Riley busy draft opens saved silently and a second draft piles up.
