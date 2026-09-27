---
version: 1
slug: "src-app-app-ts"
primary_target: "src/app/app.ts"
related_targets: []
---

# Surface: Mural (app shell, wall, editor, reading view, settings)

Mode: Operate. The user logs a review in under a minute and browses/sorts the wall.
Job: find game (autocomplete + cover), score 4 categories 0–10, status, free text, pin. Browse with search, status filter, sort by date / score per category / alphabetical / status.
Constraints: pt-BR, localStorage only, JSON export/import, Wikipedia lookup with optional RAWG key, 360px+.
Memorable moment: pressing "Pregar no mural" and watching the card land and the tachinha punch in.

## Direction contract

THESIS: The wall of a 90s Brazilian locadora: every review is a neon cartolina card, hand-lettered in pincel atômico, cover in a plastic display sleeve, final score on a red price starburst, pinned crooked with a tachinha. Refuses the category default: a uniform dark grid of cover posters with star ratings.

OWN-WORLD: Graphite-painted perforated eucatex wall (hole grid, faint fluorescent-tube light falloff). Card stocks: neon pink #ff5fa2, yellow #ffe94a, green #5cf08a, orange #ff9f45, sky #5ec8ff, lilac #c9a4ff. Ink: marker black #151515, marker red #e62e2d. Status as price-gun labels (cited deviation from round dots: the words Incompleto/Finalizado/Platinado stay legible at card size only on a strip); Platinado is holographic foil (raster slot textures/holografico.png, CSS diffraction fallback). Difficulty (Nenhuma…Impossível, user-added) as 0–4 marker skulls. Type: Permanent Marker (lettering), Kalam (handwritten review), Barlow Condensed 800 (labels, plates, starburst numerals); score numerals on cards and pickers are Permanent Marker on purpose, written like a teacher grading the card, Barlow (UI body). Controls are flat printed shelf-divider tabs standing on a painted aluminium gondola rail; search is a paper strip taped to the wall; active = hi-vis yellow. Reader keeps hatched ink bars beside the numerals (user preference, overrides the review note). Raster slots: parede-eucatex, cartolina, tachinhas, holografico, fita-crepe in public/textures/.

STORY: The user sees their whole history as a store wall they curated, finds any game in seconds, and pins a new card while the opinion is fresh.

FIRST VIEWPORT: Top-left, a big yellow cartolina cartaz tilted -2deg: "MEU MURAL DE JOGOS" lettered in black marker with red scribble underline and live counts. Right of it, primary action: the stack of blank cartolinas labelled "Pregar resenha" (neon pink, plus icon). Beneath, a counter strip: search paper strip, status plates, sort plates (score opens category sub-plates), direction toggle. Then the wall: responsive grid of cards, each tilted -3..3deg deterministically, pin at a varied x, cards pivot around their pin on hover.

FORM: Parede de Locadora, position 1 on my ordered list (chosen by user as IMPECCABLE'S PICK); seed key f447d5fe. Motion grammar (raise from zoo map): one physical curve, 380ms expo ease-out cubic-bezier(.16,1,.3,1) for card/pin, 160ms ease-out for UI; the only rebound is the keyframed tachinha punch. Signature interaction: pin-punch on save + sort reshuffle via View Transitions; cards swing around the pin.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
