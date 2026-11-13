---
target: Wishlist lab, jeito 6 Mistura
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\pages\\wishlist-lab-page.html"
target_fingerprint: "sha256:821afe297a507b5bccc93176a24b9ee50b44014f21690c8af9cb84f9fe93e35a"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\pages\\wishlist-lab-page.html"
timestamp: 2026-11-13T14-30-19Z
slug: src-app-pages-wishlist-lab-page-html
---
Method: dual-agent (A: design review · B: detector + browser)

Target: Wishlist lab, jeito 6 "Mistura", tags B "Legenda com cor" (src/app/pages/wishlist-lab-page.html).

## Design Health Score: 23/40

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of status | 2 |
| 2 | Match real world | 3 |
| 3 | User control | 2 |
| 4 | Consistency | 3 |
| 5 | Error prevention | 2 |
| 6 | Recognition vs recall | 2 |
| 7 | Flexibility | 2 |
| 8 | Aesthetic | 3 |
| 9 | Error recovery | 2 |
| 10 | Help | 2 |

## Design specificity
Unmistakably this product (ransom-note clippings, manila folders with covers peeking, torn spiral notebook note, ink labels). Weakest: Grade is close to a generic library grid.

## Priority issues
1. [P1] Actions (move, remove, vontade, new folder) end in an inline aviso with no Desfazer; clippings teleport on reflow, focus lost. Fix: site toast with Desfazer, view transitions, focus follows, reorder after menu closes.
2. [P1] Touch: etiqueta stays visible (hover:none) over every cover; note unreachable. Fix: etiqueta below the cover on touch, note at the top of the long-press menu, shoot with hover:none emulated.
3. [P2] Sticker glyph means four things (Vontade button, MUST/LATER items, MUST-first toggle). Fix: mini real stickers in the menu, button tinted by current vontade, toggle as words.
4. [P2] Folders only by drag; merge target too eager. Fix: arm in the inner area after a dwell; Mover para pasta…; Nova pasta in the picker.
5. [P2] Etiqueta covers the headline; note flickers on mouse sweep. Fix: etiqueta above the paper; ~300ms hover intent, instant on focus.

## Detector (B)
CLI: 3x broken-image (false: Angular [src]), 1x design-system-color (false: no SCSS loaded). Overlay blocked by CSP; with CSP bypass in the test browser: low-contrast muted wall text 3.5:1 (real for the tag caption), MUST sticker yellow on red (approved frozen look), organic-clip-path (intentional tears), buried-raster (lazy covers fading in, false), line-length (lab explanation text), skipped-heading/nested-cards (low).

## Minor
Uncolored tags get a kraft square that reads as a color; ghost carries tags; folder peek ignores order; empty folder shows the filter message; search hits in the hidden note are unexplained.

## Persona red flags
Power user: no multi-select. Mobile: permanent labels, no note. Keyboard: no folder creation without drag (fixed by menu).
