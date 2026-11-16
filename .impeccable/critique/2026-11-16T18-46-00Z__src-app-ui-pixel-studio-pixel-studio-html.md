---
target: ateliê da pixel art (camadas)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\pixel-studio\\pixel-studio.html"
target_fingerprint: "sha256:5451a122f66b74e5dbf8bb82645deb471fb160d26430ef1ec1539cda27355126"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\pixel-studio\\pixel-studio.html"
timestamp: 2026-11-16T18-46-00Z
slug: src-app-ui-pixel-studio-pixel-studio-html
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score: 26/40

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Painting on a hidden layer only told the screen reader (fixed: status bar notice + not-allowed cursor) |
| 2 | Match System / Real World | 4 | Reference as tracing paper under the drawing |
| 3 | User Control and Freedom | 3 | Undo everywhere; layer reorder had no touch/keyboard path besides the menu (Alt+↑/↓ added) |
| 4 | Consistency and Standards | 2 | Layer count excluded references (fixed); stale "…" title (fixed) |
| 5 | Error Prevention | 3 | Caps disabled with reasons |
| 6 | Recognition Rather Than Recall | 2 | Rename/merge only in tooltips and menus |
| 7 | Flexibility and Efficiency | 3 | Aseprite shortcuts; no Alt+click solo eye |
| 8 | Aesthetic and Minimalist Design | 2 | Context bar overflowed, Pronto off-screen at 1440px (fixed); dense right strip (map flatter on short screens) |
| 9 | Error Recovery | 3 | Clear cap messages |
| 10 | Help and Documentation | 2 | Hints pushed below the fold on desktop |

## Design Specificity Verdict
Authored: index rows, ink keys, felt menu, manila ears, cartolina handles, paper cards. Detector (CLI): 31 advisory/warning findings in pixel-studio, mostly false positives (hue strip and SV gradient colours, checker colour, bound img src); browser overlay blocked by the site's CSP (script-src 'self').

## Priority Issues
- [P1] Context bar pushed Pronto/Imagem off-screen — fixed (only .opcoes scrolls).
- [P1] Hidden-layer paint failed silently — fixed (status bar notice, cursor).
- [P2] Layer counts vs list — fixed (counts all rows; names count dots layers).
- [P2] Touch reorder only via menu — keyboard Alt+↑/↓ added; touch drag still menu-only.
- [P2] Right strip overloaded — colour map flatter under 960px height; hints still low.

## Persona Red Flags
Aseprite power user: no solo-eye Alt+click, no layer opacity. Phone first-timer: sheets cover the board; long-press menu not hinted. Screen reader: opacity slider now labelled; reference resize has no keyboard path (arrows move only).

## Questions
Should references live in a separate "mesa de luz" tray? Should the desktop strip also get the Cores | Camadas ears?
