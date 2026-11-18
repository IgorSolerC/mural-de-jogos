---
version: 1
slug: "src-app-pages-extras-page-ts"
primary_target: "src/app/pages/extras-page.ts"
related_targets: ["src/app/pages/extras-page.scss","src/app/ui/plastic-letters.ts"]
---

# Extras

Mode: Operate. The owner opens Extras to play a quick game with their wall's cards, look at the wall in numbers, or reach the two tools that serve any wall (Pomodoro, Pixel arts). Success: find the thing in one glance and see, before clicking, how each one stands (today's Muraldle, the tournament half-way, the record, the timer running).

Constraints: read-only page (no new storage, nothing shared); previews from the owner's open wall; the wall switcher lives in the page, right above what depends on it; the admin-only Uso das APIs stays invisible to everyone else. Plan: PLANO-EXTRAS.md.

## Direction contract

THESIS: Extras is a corner of the wall with two felt letterboards and a wooden shelf, not a grid of identical cards. Each line says its live state in coloured plastic pieces; the tools that serve any wall sit on the shelf above, apart from what the wall switcher governs.

OWN-WORLD: graphite eucatex wall; black felt letterboards in dark wood frames with grooved felt, white plastic letters (Barlow Condensed 700, each letter slightly off), yellow headers, pink/yellow state letters, coloured plastic pieces (tiles, sticks, medals, round faces); a light pine shelf with metal brackets; the real tomato dial; an easel with linen canvases; Dymo tapes (black, embossed cream letters) on the shelf's front edge.

STORY: the visitor sees the shelf (Pomodoro, Pixel arts), then "com o mural de [Jogos]" and the two boards; reads every line's state without opening anything; clicks a line or an object to go there.

FIRST VIEWPORT: at 1440: tape label "Sempre à mão" + handwritten "servem para qualquer mural"; full-width shelf with the tomato centred under the left board column and the easel group under the right; below, the switcher line and the two boards side by side (Jogar | Números), three lines each. Phone: one shelf per object, boards stacked.

FORM: V12 refined (16 mocked versions; owner's pick), seed: none (no concept-seed round, owner chose from mocks).

SIGNATURE: the tomato lifts off the shelf on hover with its shadow shrinking; the easel canvas tilts; the Mata-mata's current duel piece pulses slowly (none with reduced motion).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
