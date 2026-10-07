---
target: aba Amigos
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/sessions/rcw-01jigfuneybkieq7ehpj2brv/mnt/AvaliadorGamesSolo/src/app/pages/mail-page.html"
target_fingerprint: "sha256:3d561eb1ea3f8670123d0135ef1315753ab164cce66092aaabd9d3f57e0cfc9a"
target_path: /sessions/rcw-01jigfuneybkieq7ehpj2brv/mnt/AvaliadorGamesSolo/src/app/pages/mail-page.html
timestamp: 2026-10-06T23-29-26Z
slug: src-app-pages-mail-page-html
---
Method: dual-agent (A: a03fe97f3f742f58d · B: a4b2cc484b0e3215f)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | While a friend's wall downloads, posts claim "“X” saiu do mural de Y" (loading, failure and removal share one false sentence) |
| 2 | Match System / Real World | 3 | Strong corkboard metaphor; "Tirar" vague; mute tooltip still says "envelope" |
| 3 | User Control and Freedom | 3 | Undo on unfollow, confirm on remove follower |
| 4 | Consistency and Standards | 2 | Dates in two styles, Novo sticker moves left/right, red action text on neon breaks One Ink Rule |
| 5 | Error Prevention | 3 | Code field hint + maxlength, rows lock while busy |
| 6 | Recognition Rather Than Recall | 2 | Mute meaning only in title; codes repeated on every row |
| 7 | Flexibility and Efficiency | 2 | No grouping by friend; repeated tapes |
| 8 | Aesthetic and Minimalist Design | 2 | 760px strip on a 1440 wall; relationship note is a footnote |
| 9 | Error Recovery | 2 | Missing/failed post has no action |
| 10 | Help and Documentation | 3 | Copy explains where the code lives |
| **Total** | | **23/40** | Acceptable |

## Priority Issues
- [P0] False "saiu do mural" while loading/failed → loading|missing|error states, placeholder card, retry.
- [P1] Composition: one 760px column on a 1440 wall → two-column board on desktop (feed + people column).
- [P1] Relationship note is small and detached → attach/tape the note to the card, bigger; group consecutive posts by friend.
- [P2] Pessoas IA: form first, Marina listed twice, badge double counts → one list of people with relationship tags, form after/compact.
- [P3] Copy/consistency: "Tirar", "envelope", date styles, Novo placement, red text on neon, h2 without the title.

## Detector
0 blocking; 11 advisories (7 false positives: default h1 colour, text-shadows, masks; real: raw #fff/#6b0000 error colours, three off-ramp marker sizes, 5px radius).
