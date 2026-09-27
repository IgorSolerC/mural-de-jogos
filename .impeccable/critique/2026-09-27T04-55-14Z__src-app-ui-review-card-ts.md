---
target: cards do mural
total_score: 19
max_score: 36
na_heuristics: 5
p0_count: 0
p1_count: 3
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\review-card.ts"
target_fingerprint: "sha256:2442e70846460065caea69e067744dc6e7d6eb62a060263e56ef8170ca1cd2d2"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\review-card.ts"
timestamp: 2026-09-27T04-55-14Z
slug: src-app-ui-review-card-ts
---
Method: dual-agent (A: design review · B: detector + mechanical check)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | no touch press state |
| 2 | Real world | 3 | stamp is a sticker on the sleeve; HIS/DIV/JOG/VIS is spreadsheet talk |
| 3 | User control | 3 | single action |
| 4 | Consistency | 1 | "não tem" reflows boletim; integer Média larger than decimal; stamp and status share one grammar |
| 5 | Error prevention | n/a | read-only |
| 6 | Recognition | 2 | abbreviations, 10px weight arrows, meaningless stock colour |
| 7 | Flexibility | 2 | no way to see full sentence without opening |
| 8 | Aesthetic/minimal | 1 | 3 objects on the art; Finalizado on 9/14; 70 numerals on 14 cards |
| 9 | Error recovery | 3 | good no-cover fallback |
| 10 | Help | 1 | .hit overlay swallows every title tooltip |
| Total | | 19/36 | Acceptable (53%) |

## Design specificity
Wrapper authored (cartolina, pin swing, tilt, sleeve, starburst, foil); information architecture generic: cover poster (54% of height) + 3 corner badges + title + stats row + teaser. At squint = grid of cover posters in neon mats (the DESIGN.md anti-reference). Detector: 34 advisories (12 off-ramp font sizes, 21 off-palette colours mostly intentional materials, 1 radius); false positive: h1 rgb(0,0,0). Detector-only catch: .compact rules beat the 559px rules (Simples on phone doesn't shrink title/burst).

## Priority issues
- [P1] Cover buried under stamp (65% of cover width), status sticker (52%), burst; ~9/14 logos obscured. Fix: nothing on the art. /impeccable layout
- [P1] Score hierarchy lies: "9" 2.1rem > "9,4" 1.7rem; Média only 1.3x sub-scores; no merit hierarchy on the wall. /impeccable typeset, /impeccable bolder
- [P1] Invisible keyboard focus: ink ring 6px outside the card on the graphite wall (~1.1:1). Accessible name lacks score/verdict/status. /impeccable harden
- [P2] Boletim illegible (11.5px, 9.9px mobile, rosa+grain ~4:1) and misaligned when a category is "não tem". /impeccable distill
- [P2] Owner's excerpt truncated mid-word, hidden on phones. /impeccable clarify

## Persona red flags
Owner on phone: new card indistinguishable after landing; own sentence hidden; 10px boletim; no tap feedback. Owner comparing: misaligned columns, inverted Média sizing, covered logos, no masterpiece peak. Keyboard/SR: invisible focus, name lacks score, unreachable tooltips, alt repeats title.

## Minor
Burst collides with title (36px padding vs ~54px burst). Finalizado default is noise. Random pin colour. Title clamp ellipsis. Empty dark void on no-cover. Highlighter pale on rosa/lilás. DESIGN.md says 300px, code 232px. Side-by-side sections leave holes.

## Questions
Box is not the card? Same paper for 9,4 Masterpiece and 5 Chato? Number or sentence? 70 numerals or 14? What does the neon do?
