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

THESIS: A mural of stationery on a painted eucatex wall: every review is a neon cartolina card, hand-lettered in pincel atômico, the game's photo under clear contact plastic glued to it, the Média and the verdict on a two-part sticker label, pinned crooked with a tachinha. Everything on the wall is something from a papelaria: paper, cartolina, masking tape, Dymo tape, notebook pages, stickers. Refuses the category default: a uniform dark grid of cover posters with star ratings.

OWN-WORLD: Warm graphite perforated eucatex wall (hole grid, faint fluorescent-tube light falloff). Card stocks, equal weight in OKLCH: rosa #ff79a8, laranja #ffa358, amarelo #ffda42, verde #7be986, azul #70cdff, lilás #c4a5fb, rotating in that order. Ink: marker black #151515, marker red #e62e2d; the verdict half of the label is always black ink, with the verdict hue only in its icon. Status as sticker labels, and as a strip of status tape across the foot of the photo on wall cards; Platinado is holographic foil (raster slot textures/holografico.png, CSS diffraction fallback). Difficulty (Nenhuma…Impossível) as 0–4 marker skulls. Type: Permanent Marker (lettering and score numerals), Kalam (handwritten review), Barlow Condensed 800 (labels, tabs, starburst numerals), Barlow (UI body). Filters are binder divider tabs standing on an aluminium ruler; section tabs are Dymo tape; search is a paper strip taped to the wall; dialogs are index cards; active = hi-vis yellow. Pins: red and white. Reader keeps hatched ink bars beside the numerals (user preference). Raster slots: parede-eucatex, cartolina, tachinhas, holografico, fita-crepe in public/textures/.

STORY: The user sees their whole history as a mural they pinned up themselves, finds any game in seconds, and pins a new card while the opinion is fresh.

FIRST VIEWPORT: one header row shared by all pages: a compact yellow cartaz "Meu mural de jogos" (link home), Dymo section tabs (Mural, Pra depois, Ranking, Ajustes; current one yellow and pinned), and the "Pregar resenha" stack of blank cards. On the Mural page, beneath it: the taped search strip, verdict divider tabs on the ruler, a single "Ordenar" select tab + direction toggle, density icons. Then the wall: cards in sections, each tilted deterministically, pin at a varied x, cards pivot around their pin on hover.

FORM: Mural de Papelaria (chosen by the user); seed key f447d5fe. Motion grammar: one physical curve, 380ms expo ease-out cubic-bezier(.16,1,.3,1) for card/pin, 160ms ease-out for UI; the only rebound is the keyframed tachinha punch. Signature interaction: pin-punch on save + sort reshuffle via View Transitions; cards swing around the pin.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
