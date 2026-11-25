---
target: canvas no mural (card, canvas aberto, visita)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\canvas-card.ts"
target_fingerprint: "sha256:a4847c6bf2efcb94febb2f1a9a40c010762eca2df46258bf0ba6a2e5d845eb7a"
target_path: "D:\\Projetos\\AvaliadorGamesSolo\\src\\app\\ui\\canvas-card.ts"
timestamp: 2026-11-25T17-55-00Z
slug: src-app-ui-canvas-card-ts
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Who sees a canvas (private/public/shared) is only in the accessible name (the owner asked for a clean card) |
| 2 | Match System / Real World | 4 | The framed eucatex on a nail is the wall's own language; "peças" is the only term to learn |
| 3 | User Control and Freedom | 3 | Undo restores note and board; the untouched new canvas leaves silently |
| 4 | Consistency and Standards | 2 | Created only from the blank-wall menu, not from "Nova anotação"; Dymo name on the wall, brush tape when open |
| 5 | Error Prevention | 3 | Delete with Undo; "Canvas sem nome" survives once it has pieces |
| 6 | Recognition Rather Than Recall | 2 | Creating is hidden in a context menu; group/date/tags not on the card |
| 7 | Flexibility and Efficiency | 3 | E, Esc, arrows, Ctrl+click marking; no shortcut for a new canvas |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained, every element earns its place |
| 9 | Error Recovery | 3 | Missing board says so and offers the way back |
| 10 | Help and Documentation | 2 | Only the news slip explains creation, and it said "botão direito" on phones too |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict

**LLM assessment:** Authored for Murall. The aluminium frame on a nail, the string under the group ear, the eucatex at the wall's own hole pitch and the Dymo name extend the physical-wall world; the canvas reads as a different object that belongs to the same wall. The open canvas is the weaker half: once opened, the frame and the Dymo disappear and it is the old free-board screen.

**Deterministic scan:** `impeccable detect` is clean on canvas-card.ts, canvas-page.ts, board-screen.ts, board-top.ts and visit-canvas.ts. review-card.ts carries 8 advisory design-system drifts (colours, one radius, three font sizes), all from 27/set–31/out, before the canvas. In the browser (seeded wall + opened canvas): 12 low-contrast hits on ordinary note titles (false positive: the detector falls through to the wall instead of the card paper), 1 nested-cards on the search strip, 1 skipped-heading inside the closed editor dialog (false positive). Nothing on the canvas card or the open canvas.

## Overall Impression

The wall object is the best thing in the round: a delight that tilts straight under the mouse and never breaks the grid. The weak spots are discoverability of creation and the hand-off from the framed object to the full-screen board.

## What's Working

- A distinct object type that keeps the system's shared parts: the ear, the ink action labels, the done stamp, the picking sticker.
- The size rule holds in every view; in Visão geral it matches the 98px cards.
- The accessible name carries everything the eye does not get.

## Priority Issues

- **[P1] Creating a canvas is hard to discover.** Only the blank-wall menu has it (owner decision 3.1: no other button for now), and the news slip told phone users to right-click. Fix: the news now says "no celular, toque e segure"; a second entry point stays the owner's call.
- **[P2] Touch copy in the empty board.** "Editar (E) põe a primeira peça" on phones. Fix: touch devices read "Toque em Editar para pôr a primeira peça" (`(pointer: coarse)`). Done.
- **[P2] The open canvas loses the object.** The brush tape name and no frame; on phones the name truncates to a few letters next to four icon labels. Fix candidates: a Dymo title in canvas mode, a second row on narrow screens. Touches the approved board top (frozen look): owner's call.
- **[P3] Grey-slab miniatures.** A board that is one big frame draws as a grey block; the frame label is not in the sketch.
- (Checked and dismissed: "converted board opens off-centre on the phone" came from the test sharing one browser profile; a phone with no saved camera opens with Ver tudo.)

## Persona Red Flags

- **Alex (power user):** no shortcut to create a canvas; group/date only via List or Detalhes.
- **Sam (screen reader):** long accessible name per canvas; the blank-wall menu is reachable with Shift+F10 but nothing says so.
- **Casey (phone):** top actions far from the thumb; truncated name; creation depends on an unannounced long press (now named in the news).

## Minor Observations

- The pin mark on the frame is small against the bright aluminium.
- In Visão geral, a cover is cropped into a very wide strip.
- Some r2/r3 photos still show the removed tab.

## Questions to Consider

- Would a single small rivet for "shared/public" on the frame be acceptable, given the owner's clean-card rule?
- Should opening feel like stepping into the frame (aluminium edge as the viewport, Dymo as the title)?
- Is the blank-wall menu enough for something this new, or does "Nova anotação" earn a second choice?
