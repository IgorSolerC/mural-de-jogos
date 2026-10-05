---
name: Mural de Jogos
description: A private game-review wall made of stationery, with neon cartolina cards pinned crooked to painted eucatex.
colors:
  wall: "#1f1c1a"
  wall-hole: "#0b0908"
  wall-ink: "#f3efe6"
  wall-ink-2: "#bdb5a8"
  stock-rosa: "#ff79a8"
  stock-amarelo: "#ffda42"
  stock-verde: "#7be986"
  stock-laranja: "#ffa358"
  stock-azul: "#70cdff"
  stock-lilas: "#c4a5fb"
  stock-vermelho: "#f44f45"
  stock-cinza: "#c9c3bc"
  ink: "#151515"
  ink-2: "rgb(21 21 21 / 0.78)"
  red: "#e62e2d"
  red-deep: "#b81d1c"
  nota-vermelha: "#ff4436"
  roxo-impossivel: "#7a2fd0"
  paper: "#f7f4ec"
  hi: "#ffda42"
  plate-tab: "#dcd6c8"
  plate-tab-hover: "#ebe6da"
  rail: "#76726b"
  dymo-tape: "#121212"
  dymo-emboss: "#ebe5d8"
  ticket-ink: "#151515"
  ruling-blue: "rgb(64 110 190 / 0.32)"
  pin-red: "#e62e2d"
  pin-yellow: "#ffd23f"
  pin-blue: "#2f6bff"
  pin-green: "#1fb65a"
  pin-white: "#f4f4f0"
  pin-orange: "#ff7a1a"
  stripe-incompleto: "#ff8a1f"
  stripe-finalizado: "#10a64a"
  error-ink: "#6b0000"
  tape: "rgb(222 205 160 / 0.86)"
  verdict-masterpiece: "#7d5c00"
  foil-gold-ink: "#3b2a00"
  verdict-recomendo: "#0b7a3b"
  verdict-legalzinho: "#1f4fc4"
  verdict-meh: "#8a5200"
  verdict-chato: "#5b2d8e"
  verdict-masterpiece-lit: "#f3d27a"
  verdict-recomendo-lit: "#7be39a"
  verdict-legalzinho-lit: "#8ab8ff"
  verdict-meh-lit: "#e8b86a"
  verdict-chato-lit: "#c9a6ff"
  cartela: "#fdfcf8"
typography:
  display:
    fontFamily: "Permanent Marker, Comic Sans MS, cursive"
    fontSize: "clamp(2.5rem, 6vw, 4.4rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Permanent Marker, Comic Sans MS, cursive"
    fontSize: "1.9rem"
    fontWeight: 400
    lineHeight: 1.05
  title:
    fontFamily: "Permanent Marker, Comic Sans MS, cursive"
    fontSize: "1.62rem"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "0.005em"
  marker-action:
    fontFamily: "Permanent Marker, Comic Sans MS, cursive"
    fontSize: "1.15rem"
    fontWeight: 400
    lineHeight: 1
  grade-numeral:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "2.9rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  score-numeral:
    fontFamily: "Permanent Marker, Comic Sans MS, cursive"
    fontSize: "1.32rem"
    fontWeight: 400
    lineHeight: 1.1
    fontFeature: "tnum"
  burst-numeral:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "2.1rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  hand:
    fontFamily: "Kalam, Segoe Print, cursive"
    fontSize: "1.14rem"
    fontWeight: 400
    lineHeight: 1.75rem
  lead:
    fontFamily: "Kalam, Segoe Print, cursive"
    fontSize: "1.1rem"
    fontWeight: 400
    lineHeight: 1.36
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.98rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.04em"
  label-sm:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.08em"
  meta:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.86rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
  card-meta:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 800
    letterSpacing: "0.04em"
    fontFeature: "tnum"
  boletim-label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  verdict-band:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.1em"
rounded:
  paper: "2px"
  sleeve: "3px"
  soft: "4px"
  option: "6px"
  full: "50%"
spacing:
  gutter: "clamp(16px, 4vw, 48px)"
  plate-gap: "6px"
  section-gap: "24px"
  sheet-pad: "24px"
  sheet-pad-compact: "16px"
  wall-row-gap: "44px"
  wall-col-gap: "34px"
  wall-row-gap-compact: "34px"
  wall-col-gap-compact: "30px"
  wall-phone-gap: "34px"
components:
  button-cartolina:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.marker-action}"
    rounded: "{rounded.paper}"
    padding: "10px 20px 9px"
    height: "48px"
  button-cartolina-stack:
    backgroundColor: "{colors.stock-rosa}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "14px 26px 13px 20px"
    height: "60px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.hi}"
    typography: "{typography.marker-action}"
    rounded: "{rounded.sleeve}"
    padding: "10px 20px 9px"
    height: "50px"
  button-ink-danger:
    backgroundColor: "{colors.red-deep}"
    textColor: "#ffffff"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.wall-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.option}"
    padding: "8px 12px"
    height: "40px"
  plate:
    backgroundColor: "{colors.plate-tab}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "7px 16px 6px"
    height: "38px"
  plate-hover:
    backgroundColor: "{colors.plate-tab-hover}"
  plate-active:
    backgroundColor: "{colors.hi}"
    textColor: "{colors.ink}"
  search-strip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.paper}"
    padding: "0 12px 0 14px"
    height: "50px"
  field-strip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.paper}"
    padding: "0 14px"
    height: "52px"
  review-card:
    backgroundColor: "{colors.stock-verde}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.paper}"
    padding: "16px 16px 14px"
    width: "clamp(330px, calc((100vw - 2 * var(--gutter) - 84px) / 3), 424px)"
  review-card-compact:
    padding: "14px 14px 12px"
    width: "var(--simples-w)"
  review-card-phone:
    width: "100%"
  card-grade:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.grade-numeral}"
    rounded: "{rounded.sleeve}"
    padding: "4px 14px 3px 13px"
    height: "58px"
  card-grade-compact:
    padding: "3px 10px 2px 9px"
    height: "42px"
  card-band:
    backgroundColor: "{colors.ticket-ink}"
    textColor: "{colors.paper}"
    typography: "{typography.verdict-band}"
    rounded: "{rounded.sleeve}"
    padding: "0 18px 0 17px"
    height: "58px"
  card-band-compact:
    padding: "0 11px 0 10px"
    height: "42px"
  card-cover:
    width: "112px"
  card-cover-phone:
    width: "104px"
  card-cover-compact:
    width: "calc((var(--strip-h) - 4px) * 0.8 + 4px)"
  sheet:
    backgroundColor: "{colors.stock-amarelo}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "{spacing.sheet-pad}"
    width: "640px"
  sheet-editor-wide:
    width: "1080px"
  sheet-reader:
    width: "760px"
  status-label-incompleto:
    backgroundColor: "{colors.paper}"
    textColor: "#5a2a00"
    typography: "{typography.label-sm}"
    rounded: "{rounded.paper}"
    padding: "6px 9px 5px"
  status-label-finalizado:
    backgroundColor: "{colors.paper}"
    textColor: "#0d3b1f"
    typography: "{typography.label-sm}"
    rounded: "{rounded.paper}"
    padding: "6px 9px 5px"
  status-label-platinado:
    textColor: "#16162b"
    typography: "{typography.label-sm}"
    rounded: "{rounded.paper}"
    padding: "6px 9px 5px"
  status-band-incompleto:
    backgroundColor: "rgb(21 21 21 / 0.92)"
    textColor: "{colors.stripe-incompleto}"
    height: "21px"
    padding: "1px 2px 0"
  status-band-platinado:
    textColor: "#16162b"
    height: "21px"
    padding: "1px 2px 0"
  status-band-compact:
    height: "16px"
  score-burst:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.burst-numeral}"
    size: "76px"
  score-burst-big:
    size: "120px"
  score-option:
    textColor: "{colors.ink}"
    typography: "{typography.score-numeral}"
    rounded: "{rounded.soft}"
    height: "40px"
  score-option-selected:
    textColor: "{colors.red-deep}"
  choice-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.option}"
    padding: "6px 10px"
    height: "46px"
  pin:
    backgroundColor: "{colors.pin-red}"
    rounded: "{rounded.full}"
    size: "26px"
  toast-bilhete:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "12px 14px 16px 18px"
  bonus-sticker-favor:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "4px 9px 3px 7px"
    height: "26px"
  bonus-sticker-contra:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.paper}"
    padding: "4px 9px 3px 7px"
    height: "26px"
  bonus-cartela:
    backgroundColor: "{colors.cartela}"
    rounded: "{rounded.paper}"
    padding: "14px 14px 12px"
---

# Design System: Mural de Jogos

## Overview

**Creative North Star: "Mural de Papelaria"**

The whole app is one wall covered in stationery. The page background is graphite-painted perforated eucatex under fluorescent tubes, and everything pinned to it is something you could buy at a papelaria: neon cartolina, notebook paper, masking tape, Dymo label tape, sticker labels, contact plastic, tachinhas. Every review is a hand-lettered neon cartolina card, a "ficha do mural": the game's photo, covered in clear contact plastic like a school book, is glued to the card; the name and one sentence are written on it in marker; a two-part sticker label with a perforation carries the Média and the verdict; and the card is pinned slightly crooked with a plastic tachinha. Controls are stationery too. Filters and sorts are binder divider tabs standing on an aluminium ruler. Search is a paper strip taped to the wall with masking tape. Confirmations come as a note torn from a notepad (bilhete). Dialogs are index cards taken down from the wall.

The density is a real mural's: cards grouped in sections with generous gaps, and no chrome beyond the stationery itself. It is loud on purpose (neon stocks, marker lettering, stickers, rubber stamps), but it is loud with order. A card is born in a drawn stock and keeps the one the user chooses, tilts are deterministic, and every piece of text a user reads or acts on sits on flat, high-contrast paper in near-black ink. Beauty never gets in the way of reading, filtering or editing. All texture sits behind the ink, never over it.

This world replaces the category default of a uniform dark grid of cover posters with star ratings. There are no stars, no cover-only tiles and no dark glass cards anywhere.

**Key Characteristics:**
- Graphite eucatex wall (26px hole grid) with a fluorescent light falloff at the top of the page.
- Eight cartolina stocks (six neon, a red and a warm grey), always with near-black marker ink on top.
- Permanent Marker for lettering and sub-score numerals, Kalam for handwriting, Barlow Condensed for printed labels and the Média numeral, Barlow for UI body text.
- Physical stationery with real behavior: tachinhas, contact plastic, masking tape, Dymo tape, a two-part sticker label carrying the Média and the verdict, rubber verdict stamps in the reader, sticker labels, paper starbursts in the editor and reader, notepad paper.
- Deterministic imperfection: every card has a tilt, pin position, pin colour and drop offset derived from its id, so the mess stays the same between visits.
- One physical motion curve, plus one rebound: the tachinha punching in.

## Colors

Palette character: six fluorescent paper stocks and a hi-vis yellow against graphite, all tied together by one near-black marker ink and one teacher's red.

### Primary
- **Marker Red** (`red`): the red scribble under "jogos" on the cartaz, the pen circle around the chosen score, and the text caret in every field. Red always means "the score" or "the pen". It is never used as a surface tint.
- **Deep Marker Red** (`red-deep`): the chosen numeral in score pickers, destructive actions (the danger variants of the ink and quiet buttons), and the Média numeral when it is 9 or higher: on the paper half of the card's judgment label, on the starburst in the editor and reader, and in the Ranking (a teacher's red mark for a top grade).

### Secondary
- **Hi-Vis Yellow** (`hi`): the one active and focus colour. It fills the active divider tab, draws every `:focus-visible` ring (3px outline, 3px offset; the review card's ring sits at a 5px offset around the whole card), highlights the active autocomplete option, sets `::selection`, `accent-color` and the skip link, and colours the text on ink buttons. It has the same value as `stock-amarelo`, but the role is different: `hi` is state, `stock-amarelo` is paper.

### Tertiary: the cartolina stocks
- **Neon Pink** (`stock-rosa`): stock; also the primary action ("Nova resenha").
- **Neon Green** (`stock-verde`): stock; also the empty-state card.
- **Neon Yellow** (`stock-amarelo`): stock; also the cartaz (masthead) and the default dialog sheet.
- **Sky Blue** (`stock-azul`): stock; also the settings sheet and the back-left sheet of the blank-card stack.
- **Neon Orange** (`stock-laranja`): stock; also the "no results" card.
- **Lilac** (`stock-lilas`): stock.
- **Red** (`stock-vermelho` `#f44f45`, OKLCH 0.66 / 0.20 / 27): stock, added at the user's request. As light as a red can be while still reading red, so the marker ink keeps 5.3:1 (small labels need 4.5:1). Red is the pen, so on this stock the pen underline of the sort mark is drawn in `ink` (`--pen`), and the pin is always white.
- **Grey** (`stock-cinza` `#c9c3bc`, OKLCH 0.82 / 0.012 / 75): stock, added at the user's request. A warm grey on the same axis as the paper and the tape (10.4:1 with ink), not a cold UI grey.

Each review stores its stock. A new card is born in a stock drawn at random from the eight, never the same as the most recently pinned review (`ReviewStore.nextStock`), and the user can change it in the editor to any of them, as often as they like (the user asked for "random only at first"). `STOCKS` lists them around the colour wheel with grey last (`vermelho → laranja → amarelo → verde → azul → lilas → rosa → cinza`): the order of the swatches in the editor, and the rotation that fills in imported reviews without a stock. The editor and reader sheets take the colour of the review they show; in the editor the header band recolours as soon as a swatch is chosen.

### Neutral
- **Graphite Wall** (`wall`): the page background, `theme-color`, and the scrollbar track.
- **Eucatex Hole** (`wall-hole`): the perforation dots in the procedural wall pattern.
- **Wall Chalk** (`wall-ink`): text sitting directly on the wall (settings button, tools).
- **Faded Chalk** (`wall-ink-2`): secondary text on the wall: group labels ("Mostrar", "Ordenar"), "Mostrando N de M", the "sem capa" note.
- **Marker Black** (`ink`): all text on paper and cartolina, ink-button fills, field outlines, score bars.
- **Faded Marker** (`ink-2`): meta lines and hints in sheets. Wall cards no longer use it: their meta and boletim labels are full `ink`.
- **Notepad Paper** (`paper`): the search strip, field strips, autocomplete list, status labels, the toast note, the starburst, the index-card sheets, and the paper half of the card's judgment label (flat, with no grain).
- **Divider Tab / Tab Hover** (`plate-tab`, `plate-tab-hover`): ivory printed plastic (on the same warm axis as paper and tape) for the resting binder divider tab, with `ink` print. It was dark grey at first and sank into the graphite wall once the photographic eucatex landed; light plastic keeps every tab readable against the holes.
- **Aluminium Ruler** (`rail`): the ruler the divider tabs stand on.
- **Error Ink** (`error-ink`): field errors and import errors on paper.

### Materials on paper
- **Masking Tape** (`tape`): section headings, the Pra depois pages, the Nota a nota sheet and the marking strip. Photos on wall cards are glued, not taped. The search-strip tape still uses the older `rgb(222 205 160 / 0.82)`.
- **Pen underline** (`red`): the sorted attribute is marked by a single hand-drawn stroke of Marker Red under its name, never by a highlighter band (see "Sort mark and Lado a lado" below). The yellow and white highlighters were removed: the yellow read as a flat yellow block inside the white label, the white as a spreadsheet selection.

### Pins and status stripes
- **Tachinhas** (`pin-red`, `pin-yellow`, `pin-blue`, `pin-green`, `pin-white`, `pin-orange`): six plastic pin colours, in this order. The order matters, because it is also the index into the `tachinhas.png` sprite. Wall cards, the cartaz and the sheets only use red and white (`WALL_PINS`): red or white by id, and always white on vermelho, rosa and laranja, where red sinks. Six pin hues over six stocks read as confetti.
- **Label stripes** (`stripe-incompleto`, `stripe-finalizado`): the two thin stripes at the top and bottom of the Incompleto and Finalizado labels. Platinado has no stripes; it is holographic foil instead.

### Verdict inks
- **Verdict inks** (`verdict-masterpiece` `#7d5c00` dark gold, `verdict-recomendo` `#0b7a3b`, `verdict-legalzinho` `#1f4fc4`, `verdict-meh` `#8a5200`, `verdict-chato` `#5b2d8e`): one ink per verdict. In the reader and the verdict picker each is the ink of its rubber stamp on white. On wall cards the verdict half of the label is black ink since the colour pass (see "Harmonia de cor"); these inks stay on paper. Masterpiece is the exception: it is never red (red read as a warning for the top verdict). Its band and stamp are **gold foil** (`--foil-gold`: fine 100deg brushed lines over a 105deg gradient from `#c99a3c` through `#fff4c4`), lettered in `foil-gold-ink` `#3b2a00` (5.4:1 on the darkest stop) with a 1px white emboss, and `#7d5c00` is only its frame and picker ink (5.7:1 on paper).

### Named Rules
**The One Ink Rule.** Every piece of readable text on a paper surface is marker black (`ink` or `ink-2`). The six stocks change the paper, never the ink. The exceptions are all marks made by a different tool, and each sits on white paper or on its own printed ink: the Média numeral of 9 or more on the starburst and the Ranking (`red-deep`; on the card's label a Média of 9 or more is gold leaf on white paper instead), a score below 2 (`nota-vermelha`, always on its own black: the torn Média sticker or a piece of black tape, see "Notas nos extremos"), the chosen score numeral (`red-deep`), the verdict stamps in their own five inks (reader and verdict picker), paper lettering on the card's black verdict band (the band is its own printed ink surface, not a neon stock), and the status labels' printed inks. No coloured text ever sits directly on a neon stock.

**The Yellow Means State Rule.** Hi-vis yellow on the wall means active or focused: the active tab, the focus ring, the selected option. Focus is one token, `--focus`: yellow on the wall, marker `ink` on any cartolina (a yellow ring vanishes on yellow paper). The review card is the exception that proves it: its ring is drawn on the wall around the card, so it is yellow. Do not use it as decoration on the wall. As a paper stock it only appears as a full cartolina surface. On cartolina it appears only as the yellow numeral on the ink disc of a marked card's sticker, the same pairing as the ink button.

**The Stock Rule.** Card colour is saved with the review. It is drawn once, when the card is created (never the latest card's stock), and after that only the user changes it. Never choose a stock by score, and never re-draw it at render time.

## Typography

**Display Font:** Permanent Marker (with Comic Sans MS, cursive)
**Handwriting Font:** Kalam (with Segoe Print, cursive)
**Label Font:** Barlow Condensed 600 / 800 / 800 italic (with Arial Narrow, sans-serif)
**Body Font:** Barlow 400 / 500 / 600 (with system-ui, sans-serif)

All four are self-hosted through `@fontsource` (latin subsets) and loaded from `angular.json`.

**Character:** The cards are lettered with a pincel atômico (Permanent Marker), the review itself is in the reviewer's handwriting (Kalam), and anything printed (tabs, labels, notes, the number on the starburst) is in a condensed grotesque (Barlow Condensed). Barlow sets the few pieces of real UI text: inputs, hints, messages.

### Hierarchy
- **Display** (Permanent Marker 400, `clamp(2.5rem, 6vw, 4.4rem)`, 0.98): only the cartaz masthead, "Meu mural de jogos".
- **Headline** (Permanent Marker 400, 1.9rem, 1.05; 1.6rem at 560px and below): sheet titles ("Nova resenha", "Ajustes"), empty-state heading (2rem), no-results heading (1.6rem).
- **Title** (Permanent Marker 400, 1.62rem, 1.04; 1.46rem on phones; 1.24rem on Simples cards, 1.2rem on Simples phones): the game name on a card, balanced and clamped to 2 lines.
- **Grade numeral** (Barlow Condensed 800 italic, 2.9rem integer at -0.03em plus a 1.9rem ",decimal" aligned to the integer's foot, 1, tabular; 2.25rem + 1.5rem on Simples): the Média on the paper half of the card's judgment label, printed big like the number on a sticker.
- **Verdict band** (Barlow Condensed 800, 1.02rem, 1, 0.1em, uppercase, white; 0.86rem on Simples): the verdict name on the label's ink band.
- **Marker action** (Permanent Marker 400, 1.15rem, 1): the text on cartolina and ink buttons. It goes up to 1.35rem on the header stack.
- **Score numeral** (Permanent Marker 400, 1.32rem on the card boletim; 1.2rem, tabular, elsewhere): numbers in the score picker (1.55rem in the large final-score picker), the reader boletim (2.1rem; 1.7rem at 600px and below). The scores are written like a teacher grading the card.
- **Burst numeral** (Barlow Condensed 800 italic, 2.1rem, 1, -0.02em, tabular; 3.4rem on the big starburst): only the number on the paper starburst in the editor, with a smaller "/10" at 0.42em.
- **Hand** (Kalam 400, 1.14rem on a 1.75rem ruled line in the editor; 1.18rem on 1.85rem in the reader, max 68ch): the review text and the empty-state sentences.
- **Lead** (Kalam 400, 1.1rem, 1.36, `text-wrap: pretty`): the review's first sentence on a Completa card, whole and in curly quotes, on phones too.
- **Body** (Barlow 400–600, 1rem, 1.5): inputs, hints, messages, settings copy (max 60ch).
- **Label** (Barlow Condensed 800, 0.98rem, 0.04em, uppercase): divider tabs, quiet buttons, toast text (1.05rem).
- **Label small** (Barlow Condensed 800, 0.86rem, 0.08–0.09em, uppercase): status labels, picker legends (1rem).
- **Meta** (Barlow Condensed 600, 0.86rem, 0.04em, uppercase): year and date lines in sheets, the source line in the editor.
- **Card meta** (Barlow Condensed 800, 0.9rem, 0.04em, uppercase, tabular, full `ink`; 0.82rem on Simples): the date · hours line on a card.
- **Boletim label** (Barlow Condensed 800, 0.8rem, 0.01em, 1, sentence case, full `ink`): the four full category names over the boletim numerals.

### Named Rules
**The Three Tools Rule.** Each typeface stands for one tool on the desk: the marker (Permanent Marker), the pen (Kalam), and the label printer (Barlow Condensed). Choose the face by who "wrote" the text, never for variety. Barlow is only for text that is interface, not artifact. The one exception is the magazine's own press, only on the Wishlist: Abril Fatface (`--f-didone`) and DM Serif Display regular and italic (`--f-serif`), for text printed in the magazine a clipping came from (headlines, ransom-note pieces, the Wishlist masthead, the "sem capa" initial).

**The Label Numeral Rule.** The Média is the one score printed rather than written, and it is always the Barlow Condensed 800 italic numeral. On a wall card it is printed on the paper half of the two-part label (a 2.9rem integer with a smaller ",decimal" aligned to its foot; 3.7rem + 2.4rem on the reader's big label); in the editor it is the label on the live preview card (and, on narrow screens, a compact label beside "Que nota?"). Every other score is a smaller Permanent Marker numeral. The Média is always the largest number on its surface, and it keeps its paper except at the extremes the user asked for: holographic foil from 9, a torn black sticker below 4.

**The Tracked Caps Are Printed Rule.** Uppercase with letter-spacing is only for printed matter: tabs, labels, meta lines, and the labels naming control groups. It never sits above a heading as a decorative kicker.

## Layout

The app shell is centred with a maximum width of 1480px, a side gutter of `clamp(16px, 4vw, 48px)`, 28px of top padding and 120px of bottom padding. It is split into four pages (hash routes, so it deploys to any static host): **Mural** (`/`), **Pra depois** (`/fila`), **Ranking** (`/ranking`) and **Ajustes** (`/ajustes`). Every page shares one header row: the compact cartaz on the left (a link home), the section tabs, and the blank-card stack on the right. The editor and the reader stay as sheets owned by the shell, so any page can open them.

The Mural page holds only the toolbar and the wall. The toolbar has two rows. The top row holds only the taped search strip (max 440px), just above the ruler. The bottom row stands on the ruler: the "Filtrar" tab on the left and, pushed to the right end, a single "Ordenar" select tab with the direction toggle, Marcar and the density icon tabs, so every divider tab stands on the ruler and none floats. Filtrar opens the filter cartela under the ruler (see "Cartela de filtros"); it replaced the verdict tabs and the "Mostrar" select tab. The search strip is the shared `app-search-strip` component (paper, two tape pieces, red caret, clear button, `/` hint); the Pra depois page uses the same strip to filter the queue by name, with the same "Mostrando N de M · Limpar busca" line and a Kalam note when nothing matches. `/` focuses whichever strip the open page has (`input[data-busca]`).

The wall is split into sections that follow the sort (see "Wall in sections" below). Sections flow side by side in a wrapping row: 64px between rows, and between neighbouring sections the same column gap as between two cards inside a section (34px Completa, 30px Simples), so every card on the wall falls on one column grid and three one-game months fill a row like a three-game month. It was 76px at first, which made three single-card sections 84px too wide and pushed the third to the next row (the user asked for this fixed). The tape label over each section is what separates the groups, and a long label wraps instead of widening its section (the head takes the width of the cards). Inside a section, cards wrap at a fixed width, each only as tall as its own content (rows align at the top and are never stretched to the tallest card):
- **Completa:** `clamp(330px, calc((100vw - 2 × gutter - 84px) / 3), 424px)`, so three cards fill the wall width; 44px row and 34px column gaps.
- **Simples:** `--simples-w`, as many cards per row as fit at 320px or more (the Masterpiece label beside the photo needs it), stretched to fill the page: four up to 340px from a 1486px viewport (a Full HD monitor at 100% or 125%), three up to 440px from 1136px, two up to 460px from 750px, then one. The page width is `min(100vw - 20px, 1480px)` minus both gutters, the 20px left for the scrollbar; 34px row and 30px column gaps.

Each card also drops 0–14px from the top of its cell (from its id), so rows never line up perfectly.

Responsive behaviour:
- **1024px and up:** the editor sheet widens to 1180px: the live card stays visible on the left, as wide as a wall card plus 56px; only the options below the fixed tabs and the form on the right scroll (see "Ficha em branco").
- **1100px and below:** the section tabs drop to their own row under the cartaz and the stack.
- **720px and below:** the cartaz shrinks to a two-line 1.5rem logo; the four section tabs share one row; the toolbar becomes two rows: search plus density icons, then the "Filtrar" tab and the "Ordenar" select tab with the direction toggle. The `/` hint hides.
- **600px and below:** the reader keeps the wall card's phone layout: a 112px photo beside the name and date (title 1.62rem), and the judgment label with the skulls on the full-width row below.
- **559px and below:** sections stack 48px apart, and each section is one column of full-width horizontal cards, 34px apart. Cards keep their whole anatomy (lead sentence and boletim included), with half the tilt, 40% of the drop, a 104px cover, and (Completa) the judgment label moved to the full-width row under the head. Simples keeps its strip layout with a 1.2rem title.
- **440px and below:** the primary button reads "Nova" (the full name stays as its accessible label).
- **420px and below:** score-picker cells shrink to 36px (44px for big pickers). The difficulty options follow their own container width (see "Difficulty skulls").

Inside sheets the rhythm is 24px between sections (`section-gap`), with 24px side padding (16px compact). Dashed 2px ink rules (`rgb(21 21 21 / 0.22–0.25)`) separate footers, sub-scores and editor columns. They read as lines ruled in pen on the card.

## Elevation & Depth

Depth here is physical light: one fluorescent source above the wall. Everything that hangs on the wall casts a soft, stacked shadow straight down. Nothing glows, and no surface is translucent glass. The wall itself adds depth through its lit hole edges (each hole has a faint highlight on its lower rim) and a radial light falloff over the top 900px of the page.

### Shadow Vocabulary
- **Hanging card** (`--shadow-card`: `0 1px 1px rgb(0 0 0 / 0.35), 0 10px 18px -6px rgb(0 0 0 / 0.55), 0 22px 40px -18px rgb(0 0 0 / 0.6)`): every card, the cartaz, the search strip, cartolina buttons and the stacked blank sheets.
- **Lifted card** (`--shadow-lift`: `0 2px 2px rgb(0 0 0 / 0.3), 0 20px 28px -8px rgb(0 0 0 / 0.55), 0 40px 60px -24px rgb(0 0 0 / 0.65)`): a card on hover or focus, a hovered cartolina button, open sheets, and the first frame of a landing card.
- **Label drop** (`filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 5px 6px rgb(0 0 0 / 0.22))`): the card's two-part judgment label, stuck flat on the cartolina. It is a filter, not a box-shadow, so the shadow follows the notches.
- **Pin cast** (`2px 5px 3px -1px rgb(0 0 0 / 0.45), 5px 10px 10px -2px rgb(0 0 0 / 0.25)`): the tachinha's shadow on the paper. It is offset down and to the right, because the pin head stands off the paper.
- **Tape** (`filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3))`): masking-tape pieces on labels, notebook pages and sheets.
- **Starburst drop** (`filter: drop-shadow(1px 3px 2px rgb(0 0 0 / 0.35))`): the paper starburst in the editor and reader.
- **Note drop** (`filter: drop-shadow(0 8px 12px rgb(0 0 0 / 0.5))`): the toast note.
- **Rail** (`inset 0 1px 0 rgb(255 255 255 / 0.28), inset 0 -2px 0 rgb(0 0 0 / 0.3), 0 6px 10px -3px rgb(0 0 0 / 0.6)`): the aluminium ruler's bevel.
- **Sleeve** (`inset 0 0 0 1px rgb(255 255 255 / 0.55), 0 1px 2px rgb(0 0 0 / 0.25)`, over a white film at 22%, plus two 118deg glare bands): the clear contact plastic over a photo.

### Named Rules
**The Fluorescent Tube Rule.** All light comes from above. Shadows fall downward (the pin, the only object that stands up off the paper, casts down and to the right). Hover lifts a card toward the light, which means a deeper shadow and 3px of rise, never a glow. Pressing a card sets it back against the wall (no rise, the resting shadow, 80ms).

**The Paper Is Opaque Rule.** Cards, sheets and strips are solid paper. The only translucent materials are the contact plastic over photos and the masking tape, and the dialog backdrop dims the wall to `rgb(8 8 10 / 0.72)` with no blur.

## Shapes

Paper is cut almost square: cards, the cartaz, strips and sheets have a 2px radius (`paper`), plastic-covered photos, ink buttons and the card's judgment label 3px (`sleeve`; square where the two halves meet), and small on-paper hover targets, score cells and verdict stamps 4px (`soft`). Choice options drawn on the card (status, difficulty) and quiet buttons use 6px (`option`). Pins, icon buttons and the "limpar"/clear targets are circles.

The recurring silhouettes are specific objects, not generic shapes:
- **Binder divider tab:** a trapezoid with 7px chamfers on the top corners (`clip-path: polygon(7px 0, calc(100% - 7px) 0, 100% 100%, 0 100%)`), standing on the ruler.
- **Paper starburst (retired):** an 18-point star with uneven, hand-cut points, drawn as an SVG polygon (outer radius about 48, inner about 37, with fixed jitter). Filled with `paper` and a 2.2 ink stroke, rotated -9deg. It was red at first; the user found a red star behind every score too loud, so red moved to the numeral and only for top grades. It left the wall cards in the ficha do mural pass and the editor in the ficha em branco pass; only its outline survives, as the star still to be cut out on Pra depois pages.
- **Notepad tear-off:** a zigzag bottom edge made with a conic-gradient mask at a 12px period, where the sheet came off the pad.
- **Two-part label:** the card's judgment label, a sticker with a tear-off perforation: a paper half and an ink half joined at a 2px dotted white perforation (`rgb(255 255 255 / 0.55)`), with 5px semicircle notches (4px on Simples) cut top and bottom at the junction by radial-gradient masks on the facing edges. A grade without a verdict stands alone, uncut.
- **Masking tape:** on the search strip, 54×20px pieces of `rgb(222 205 160 / 0.82)` at ±24–28deg over its ends. Wall-card photos carry no tape: the photo is glued flat.
- **Pen marks:** a single-stroke red scribble underline (SVG path) and a hand-drawn red circle around the chosen score (SVG path, drawn in with stroke-dashoffset).

Tilt is part of the form language. Cards tilt ±0.8°–3.4° (never straight; half that on phones), the photo counter-tilts at -0.6 × the card's tilt, the judgment label at -0.5 × tilt - 1deg, the cartaz -2deg, the search strip -0.6deg, status labels -2.5deg, the starburst -9deg, the chosen cover in the editor -2deg, and the reader cover -1.5deg.

## Components

### Buttons
Tactile stationery, each with its own material.
- **Cartolina button (primary):** a blank white index card (`paper`) with paper grain, marker lettering, a 2px radius, the hanging-card shadow, and a 48px minimum height. On hover it tilts -1.2deg, rises 2px and takes the lifted shadow over 380ms on the physical curve. On press it sinks 1px. In the header (on Mural, Ranking and Ajustes; on Pra depois and Wishlist the page's own add button takes its place) it is the top card of the **blank-card stack**: a rosa sheet behind it at 5deg and an azul one at -4deg, only their edges showing, which fan out further on hover (9deg / -8deg). Label: "Nova resenha", with a plus icon.
- **Ink button (completes an action inside a sheet):** a marker-black block with yellow marker lettering, a 3px radius and a 50px minimum height. On hover it rises 2px and tilts -1deg. The danger variant is `red-deep` with white text. Examples: "Pregar no mural", "Salvar alterações", "Editar", "Mostrar o mural inteiro", "Descartar".
- **Quiet button:** transparent, Barlow Condensed 800 uppercase, 40px, with a neutral 16% tint on hover. It takes chalk colour on the wall and ink colour on sheets. Examples: "Ajustes e backup", "Cancelar", "Remover do mural".
- **Icon button (sheet close):** a 44px circle with a 12% ink tint on hover.
- **Link button:** ink text with a 2px underline at a 4px offset ("Tenho um backup").

### Divider tabs (filters and sorts)
- **Style:** a chamfered trapezoid tab in `plate-tab` with `ink` print, Barlow Condensed 800 uppercase, a 38px minimum height, and 6px gaps within a group. Counts are tabular at 62% opacity ("Todos 8"). Group labels ("Mostrar", "Ordenar") are Barlow Condensed 800 in `wall-ink` at 86% with a dark text-shadow so they read over the holes.
- **State:** hover lightens the tab to `plate-tab-hover` and raises it 2px. Pressed or checked turns it hi-vis yellow with ink text, raised 4px, so it stands up off the ruler. The direction toggle is a tab with an icon only and a spoken label.
- **Ruler:** an 8px aluminium `rail` bar under the tabs with the ruler bevel shadow. Each group has a faded-chalk tracked label above it ("Mostrar", "Ordenar", "Qual nota"), which also names the group for assistive tech. The "Qual nota" group slides in from the left (-8px) over 380ms.

### Cards / Containers
- **Review card, "ficha do mural" (signature):** a horizontal cartolina card in the review's stock, a 2px radius, padding `16px 16px 14px` (`14px 14px 12px` Simples), the hanging-card shadow. The only thing on the photo is the status tape across its foot. Anatomy:
  - **Head:** a grid of `cover | words` over `cover | judge` on desktop Completa and on every Simples card; on Completa phones, `cover | words` over a full-width `judge` row.
  - **Photo:** the game's photo under contact plastic at 112px (104px phone; on Simples, as wide as the strip height allows, about 100px), glued to the card and counter-tilted at -0.6 × the card's tilt, with no tape. Incompleto and Platinado get a strip of status tape across the foot of the photo (see Status tape); Finalizado is the normal case and carries none. The cover is decorative for assistive tech (empty alt), because the card already says the name.
  - **Words:** the marker title (2 lines max), then the card meta (date · hours, full ink; the date is the user-editable completedAt, day only inside month sections; "Sem data" when the user marked it Data não definida). Status lives on the photo, not here.
  - **Judgment label:** a two-part sticker label (see Shapes), 58px tall (42px Simples), 14px under the words (8px Simples), counter-tilted at -0.5 × tilt - 1deg, with the label drop. Both halves share the height, so the Média and the verdict weigh the same. Left, the **grade**: flat `paper`, at least 76px wide (56px Simples), padding `4px 14px 3px 13px` (`3px 10px 2px 9px` Simples), the Média in the grade numeral (`ink`, never red at the top: 9 or more turns the numeral into gold leaf, 8 or more adds twinkling sparkles, 4 to 4,9 stains it with coffee (see "Café e brilhos"), below 4 (3,9 and down) the grade becomes a black sticker with its outer corner ripped off and the numeral in `nota-vermelha`; see "Nota 10" and "Notas nos extremos"), exposed as the image "Média X de 10". Right, only when a verdict exists, the **band**: solid `ticket-ink` black, the verdict name in `paper` verdict-band lettering after its lucide icon (19px, 7px gap; 16px and 5px on Simples), padding `0 18px 0 17px` (`0 11px 0 10px` Simples, 0.84rem at 0.08em), exposed as the image "Veredito: X". The icon takes the verdict's lightened ink (`verdict-*-lit`). The Masterpiece band has gold-foil lettering and a gold hairline frame, and it takes the same white shine sweep as the Platinado foil when the card lifts (`--shine`, 900ms). **When the word does not fit** (the user asked for this on narrow windows), the band shows only its icon (padding `0 20px 0 19px`, `0 14px 0 13px` Simples, a little wider than the full band's so the lone icon does not look pinched), and the icon grows to 24px (20px Simples). On wall cards the label takes `fit`: it spans its grid column (`transform-origin: 90px 50%`, so it still turns around itself), measures its full width with the word showing, and compares it with the column on every resize and when fonts load. The hidden word stays in place, absolutely positioned and invisible, so the label can be remeasured and grow back. The accessible name is still "Veredito: X". The reader never uses `fit`.
  - **Lead (Completa only):** the review's first sentence in Kalam, whole, in curly quotes. It is chosen by `leadSentence`: split on terminal punctuation (`. ! ? …`) followed by a space, so "nota 8.5" stays whole; a first sentence under 36 characters takes the second along; over 120 characters it is cut at a word boundary with "…".
  - **Boletim (Completa only):** four fixed cells, always in the order História · Diversão · Jogabilidade · Visual, with full names in the boletim label and 1.32rem marker numerals. A 1.5px rule at 34% ink closes the top; cells are split by 1.5px rules at 20%. A "Não tem" category keeps its cell: the label is struck through at 84% opacity and the value is "—" (spoken "não tem"). Relevante / Pouco importante show a 13px lucide arrow up / down after the numeral, with the weight name as screen-reader text. The boletim follows the content, and the card ends where the writing ends: a row of cards has ragged bottoms, never blank cartolina padded to match the tallest neighbour.
  - **Hit target:** the whole card is one invisible button named "Abrir resenha: {name}, média {X}, {verdict}, {status}, {concluído em / jogado até} {date}".
- **Simples card:** a cartolina strip of fixed height (`--strip-h`: the pin clearance, a two-line title, the 20px date line and the 42px label, about 128px), so every Simples card on the wall is the same height. The photo keeps its 4:5 ratio and fills that whole height; title, date and the judgment label stack beside it, the label sitting at the foot of the photo when the title takes one line. A date line that wraps (a category sort plus bonus tally) is the one case that makes a strip taller. No lead, no boletim, no hours. When the wall is sorted by a category, that score appears beside the date ("Diversão 10") with the red pen underline.
- **Card hover / focus / press:** the card swings around its own pin (`transform-origin` is the pin point), its tilt drops to 35% of rest, it rises 3px and takes the lifted shadow. The holographic label's shine runs across. Keyboard focus draws a 3px `hi` ring at a 5px offset around the whole card (via `:has(.hit:focus-visible)`), on the wall where yellow reads. `:active` sets the card back against the wall over 80ms.
- **Pin:** a tachinha at the card's pin x, 42–58% (the wall-physics 40–60% remapped by 0.8), above the title.
- **Sort mark:** sorted by Média, the card carries no mark (the Média is already the largest number on it, and the section label names the band). Sorted by a category, a red pen stroke is drawn under that category's name in the boletim (Completa) or under the score beside the date (Simples). Every boletim cell reserves the stroke's space (6px label-to-numeral gap), so no cell changes height when the sort changes.
- **Picking sticker:** while the wall is in Marcar mode, each card carries a 42px round sticker overlapping its top-right corner at -8deg: empty, a 2.5px dashed ink ring over 90% paper; marked, a solid ink disc with the order number (1, 2, 3…) in hi-vis yellow marker (1.35rem), stuck on with a 280ms scale-in from 0.6 (no rebound). The card's hit button becomes a toggle (`aria-pressed`, "Marcar pra ver lado a lado: {name}").
- **Landing:** a new card falls in from -70px at 1.08 scale and triple tilt (620ms, physical curve). Its tachinha then punches in after a 260ms delay (520ms, from scale 2.2 to 0.9 to 1). This punch is the system's only rebound.
- **Cartaz (masthead):** a yellow cartolina at -2deg with two pins (red and white), the display title with the red scribble under "jogos".
- **Empty state:** a green card spanning two columns ("Seu mural está vazio", Kalam copy, an ink button "Pregar a primeira resenha", the link "Tenho um backup"), next to three dashed chalk outlines where the next cards will go, each with a single pin hole.
- **No results:** an orange card at 1deg, centred, max 460px ("Nada no mural com esse filtro").
- **Sheets (dialogs):** an index card of cream `paper` with the review's stock as its header band (azul for settings), a 2px radius, the lifted shadow, a pin centred at the top edge, a marker headline, a scrolling body and a footer behind a dashed rule. The sheet opens by rising 24px from -2deg and 0.97 scale (380ms) over a 72% graphite backdrop that fades in over 160ms.

### Inputs / Fields
- **Search strip (on the wall):** notepad paper, 50px, tilted -0.6deg, held by two pieces of masking tape. It has the hanging-card shadow, a red caret and a `/` keyboard hint. Focus adds a 3px hi-vis ring outside the strip.
- **Field strip (on a sheet):** notepad paper, 50–52px, with a 2px inset ink outline and a 1px drop. Focus thickens the outline to 3px and adds a 4px halo of ink at 16% (search, date, hours and the ruled text alike; the search used to add a stock-coloured ring). The autocomplete list below it drops into the document flow (never clipped), uses the same paper and outline, and marks the active option in hi-vis yellow. Options show a 44px plastic-covered thumbnail, the name and the year. A "use this name without a cover" option sits below a dashed rule.
- **Ruled textarea:** blue pencil lines (`ruling-blue` every 1.75rem, fixed to the text as it scrolls) over 50% white, Kalam text, a 2px ink inset outline that thickens to 3px on focus, and a red caret. Its height grows with the content up to 22rem.
- **Score picker:** the category name in the printed field label (`.rotulo`), then the digits 0–10 written in marker in an 11-column grid, at most 560px wide, each a hidden radio button. The chosen digit turns `red-deep`, scales to 1.12 and gets a red pen circle drawn around it in 280ms. Unselected digits are ink at 60%; hover tints the cell with 6% ink and darkens the digit; keyboard focus draws a 3px ink outline. Optional pickers show "opcional" or a "limpar" link.
- **Choice options (status, verdict):** a sticker sheet, like the bonus cartela. An unchosen option is the kiss-cut outline still on the sheet (`.recorte`: 1.5px dashed ink at 42%, ink at 74%, no fill, no shadow; hover darkens both and tints 6%). The chosen one is the real object, stuck on (`.colado`: tilted, scale 1.04, a small drop, and 380ms on the physical curve from straight). Status sticks the real status label (Platinado in foil); the verdict sticks the card's black band (paper word, lit icon; Masterpiece with gold-foil word and frame). Outline and sticker share their metrics, so nothing moves when one is chosen. Keyboard focus: a 3px ink outline around the option.
- **Weight:** a native select at the right of the category name. At Normal it is only a printed reminder, "Peso normal" in `ink-2` 0.78rem caps with a chevron and no box, so four of them no longer shout over the scores. Any other weight turns it into a stuck paper label (ink hairline, drop, -1.5deg).
- **Errors:** Barlow 600 in `error-ink` directly under the field ("Dê as quatro notas de 0 a 10 para fechar a média."). The footer repeats what is missing when the user tries to save.

### Status labels (sticker labels)
- **Style:** notepad paper with two thin stripes (1.5px, inset 3px from the top and bottom edges), Barlow Condensed 800 uppercase at 0.09em, an icon at 15px, a 2px radius, tilted -2.5deg.
- **Incompleto:** orange stripes and brown ink, with a dashed-circle icon.
- **Finalizado:** green stripes and dark green ink, with a check-circle icon. Shown in the editor; wall cards and the reader omit it.
- **Platinado:** holographic foil with a trophy icon. The CSS fallback that ships is fine diffraction lines at 62deg over a pastel spectrum gradient, with a white inner edge. On card hover a white shine band sweeps across over 900ms (the animated `--shine` property). When `holografico.png` loads, it replaces the gradient through `--holo-foil`. A 40% milky varnish (`--varnish`) keeps the word readable.

### Status tape (wall cards)
On wall cards the status is not a sticker: it is a strip of tape stuck straight across the foot of the photo, edge to edge. `app-status-label` with `band` (host class `printed`) is projected into the photo frame (`<ng-content>`), absolutely placed flush with the bottom and both sides of the photo, so it takes no space the photo does not already take. It sits under the contact plastic, so the glare bands pass over it. Straight, square-cornered, no drop shadow; only a 1px dark seam above it where it meets the art.
- **Size:** 21px tall, Barlow Condensed 800 uppercase at 0.78rem tracked 0.1em, a 12px lucide icon, 2px side padding (Completa, desktop and phone). Simples: 16px tall, 0.7rem tracked 0.03em (0.66rem on phones), no icon, so "INCOMPLETO" fits inside a 58px photo. The caller sets these through `--band-h`, `--band-fs`, `--band-track` and `--band-icon`.
- **Incompleto:** an ink band (`ink` at 92%) with the lettering and a 1.5px top rule in `stripe-incompleto`, the label orange. Deliberately sober: a warning, not a trophy.
- **Platinado:** the same holographic foil as the label with the varnish thinned to 22% so the spectrum shows across the wider band, a 1px white top edge, and the same `--shine` sweep when the card lifts.

### Paper starburst
A paper 18-point hand-cut star with an ink outline, 76px in the editor, rotated -9deg, with an ink italic Barlow Condensed numeral and a small "/10"; the numeral turns `red-deep` when the Média is 9 or more. It carries the Média, never a typed score: the weighted average of História, Diversão (2x), Jogabilidade and Visual, one decimal in pt-BR ("8,4"); decimal values step the numeral down (2.1rem to 1.7rem at 76px, 3.4rem to 2.8rem in the reader). It is exposed to assistive tech as the image "Média 8,4 de 10". In the editor it sits at the head of the scores and updates live as scores are circled, showing "–" until the first score. It is not used on wall cards.

### Verdict stamp

A rubber stamp, optional, used in the verdict picker and in Nota a nota. Barlow Condensed 800 uppercase tracked 0.1em, one lucide icon, a 4px radius. One ink per verdict (the `verdict-*` tokens): Masterpiece gold foil with `#7d5c00` frame and `#3b2a00` lettering (crown; also the chosen option in the picker), Recomendo `#0b7a3b` (thumbs-up), Legalzinho `#1f4fc4` (smile), Meh `#8a5200` (meh face), Chato `#5b2d8e` (annoyed face). Icons are lucide SVGs, never emoji. Exposed as the image "Veredito: X".
- *(Superseded by "Lado a lado, revisto".)* **Stamp (Nota a nota; formerly also the reader):** a stamped sticker: paper-white fill at 94%, a 2.5px ink border plus a 1px outline at 2px offset (double frame), 0.86rem (1.05rem big), icon 15px (20px big), rotated -9deg (-5deg in the reader block), with a small drop shadow.
- **Canhoto alone (Nota a nota, in Lado a lado and Comparar):** `app-verdict-stamp` now draws the card's black verdict band on its own: 32px tall (42px big), 3px radius, `ink` fill, the word in `paper` (Barlow Condensed 800, 0.84rem, 0.08em), the icon in the verdict's `-lit` ink; Masterpiece with the gold-leaf word and inner fio, Chato with the outer edge torn (`.tarja-rasgada.rasgo-direita`, 11px). -2deg, two-step drop shadow that follows the tear.
- **On wall cards** the verdict is not a stamp: it is the black ink band on the right half of the judgment label (see Review card).

In the editor the verdict is no longer a stamp: the chosen one is the black band it will be on the card (see Choice options).

### Tachinha (pin)
A 26px plastic pushpin seen from above: a wide base with an outer ring, a raised head with a specular dot, colour mixed with black at 38% for the shaded side, and the pin cast shadow. It is always `aria-hidden`. When `tachinhas.png` loads, it becomes a 32px frame from a 192×32 sprite of 6 pins, indexed in the order of the pin palette.

### Contact plastic (cover)
The game's photo covered in clear contact plastic, like a school book (5px of film around the photo, 2px on thumbnails), over a 4:5 frame. Covers are `object-fit: cover`, focused at 50% 20%. With no cover, the frame shows diagonal stripes on near-black, a large marker initial in the card's stock colour, and the note "sem capa". A `decorative` input drops the alt text and the "Sem capa para …" image role where the surrounding object already names the game (wall cards); elsewhere the cover is announced as "Capa de …". On wall cards the photo is glued flat to the card, with no tape, and nothing is placed over it except the status tape.

### Difficulty skulls
0–5 skull icons in ink, from Nenhuma to Infernal (Nenhuma, Fácil, Média, Complicado, Difícil, Infernal). The reader and side-by-side show the empty slots at 22% opacity, plus the level name. Wall cards do not show them. The top level, Infernal, is the one exception to ink: its five skulls are the horned skull (`HornedSkull`), Lucide's skull drawn hollow like the others but stroked in `roxo-impossivel` (`#7a2fd0`, about 6:1 on paper; the user asked for purple over the first red), with two short devil horns flaring outward. Skull and horns are one closed outline, with the top of the cranium arc opened where the horns rise, so no line separates them, and the whole drawing fits the same 24-unit box as a plain skull. Skulls only sit on paper (editor, reader, side-by-side), never on a stock.

In the editor, difficulty is a scale, not a sticker sheet: one row of five 24px skulls (36×44px targets) followed by the level name (Barlow Condensed 800, 0.95rem caps; "Nenhuma" in `ink-2`). Choosing a skull fills the row up to it; the rest stay at 22%, like the reader's empty slots. Hovering previews the fill at 75%, with plain skulls, until the fifth: then the whole row turns purple and horned. Nenhuma is a `Ban` sign (⊘, 22px) one step before the first skull, 6px apart: at 40% until chosen, then full ink; hovering it previews "Nenhuma". It replaced a "limpar" link, so the empty level is one click away like any other. Under the six targets are six radios, so arrow keys walk the whole scale, Nenhuma included. While the mouse is over the row, the name beside it previews the hovered level in `ink-2`. It replaced six stickers in a grid, which took two rows, repeated the skulls on every chip and read as a table rather than a scale.

### Toast (bilhete)
A note torn from a notepad, fixed at the bottom centre, with a serrated bottom edge and the note drop shadow. It slides down, revealed from the top over 380ms. The text is Barlow Condensed 800 uppercase ("“Hades” pregado no mural", "Resenha atualizada"). An optional ink action ("Desfazer") uses yellow text.

### Planned raster materials
The slots are wired; the app tries to load each file after the first render and adds a class to the body only when it loads, so the procedural CSS fallbacks render whenever a file is missing.

| File | Body class | What it replaces | Fallback |
|---|---|---|---|
| `parede-eucatex.png` | `has-wall-texture` | wall holes and fibre (560px tile) | two radial-gradient hole layers at a 26px pitch (dark hole plus a lit lower rim) and a 300px fractal-noise fibre SVG at 5% |
| `cartolina-fibra.png` (derived from `cartolina.png`) | `has-paper-texture` | grain on `.cartolina` and cartolina buttons (420px tile, soft-light) | `--paper-grain`, a 220px fractal-noise SVG multiplied over the stock colour |
| `tachinhas.png` | `has-pins` | the CSS pin (192×32 sprite, 6 × 32px in pin palette order) | the layered radial-gradient base, head and specular dot |
| `holografico.png` | `has-holo` | Platinado foil via `--holo-foil` (180px tile) | a 62deg diffraction-line pattern over a pastel spectrum gradient |
| `fita-crepe.png` | `has-tape` | the search-strip tape pieces | flat `rgb(222 205 160 / 0.82)` with a 1px drop shadow |

Every raster must look like a photograph of the material and keep the same scale as its fallback, so swapping it in never shifts the layout or reduces text contrast.

### Motion
One physical curve, `cubic-bezier(0.16, 1, 0.3, 1)` at 380ms, is used for anything that moves like an object: card swing, lift, the stack fanning, sheet entry, the sub-tab-group entry, the toast note sliding in, and View Transition reshuffles when sorting, filtering, deleting or restoring (each card has its own `view-transition-name`; the root cross-fade takes 120ms). UI feedback (colours, tints, tab rise) uses `cubic-bezier(0.2, 0.7, 0.2, 1)` at 160ms. The ambient loops are the Platinado foil drifting under the light (5.2s, sine ease, alternate) and the grade sparkles twinkling from 8 up (2.4s, staggered; see "Café e brilhos"). When a card lifts under a mouse (and over the open reader), the foils also catch the lamp: `Luz` writes the pointer position, and the glare and hue follow it (see "Nota 10"). Reduced motion clamps every animation and transition to 1ms and switches scroll-into-view to instant.

## Do's and Don'ts

### Do:
- **Do** put every review on one of the eight cartolina stocks, saved on the review (drawn at creation, then the user's choice), and set all text on it in marker black.
- **Do** derive tilt (±0.8°–3.4°, never 0), pin x (40–60%, remapped to 42–58% on wall cards), pin colour and drop offset (0–14px) from the review id with the wall-physics hash, so the wall looks the same on every visit.
- **Do** rotate cards around their own pin (`transform-origin` at the pin) on hover and focus, reducing the tilt to 35% and lifting 3px with `--shadow-lift`.
- **Do** give the Média and the verdict equal weight on a wall card, as the two halves of one sticker label at the same height: the Média as the Barlow Condensed italic numeral on the paper half, the verdict as paper lettering on a black band. Every other score is a smaller Permanent Marker numeral.
- **Do** glue the photo flat to the card and keep it clear; stamps and scores live on the cartolina or the judgment label. The one exception is the status tape, stuck flush across the foot of the photo.
- **Do** show the review's first sentence whole (`leadSentence`), and the boletim as four fixed cells in the same order on every card, so cards compare at a glance.
- **Do** use hi-vis yellow (`hi`) for active tabs, focus rings on the wall (3px, 3px offset; 5px around a whole card; ink on cartolina via `--focus`) and the selected option, and for nothing decorative on the wall.
- **Do** build new controls from stationery that already exists in this world: a divider tab on the ruler, a paper strip, a sticker label, a notepad note, Dymo tape, an ink or cartolina button.
- **Do** keep motion on the two curves (380ms physical, 160ms UI) and keep the tachinha punch as the only rebound.
- **Do** lay the wall out as one column of full-width horizontal cards at 559px and below, keeping the lead sentence and boletim.
- **Do** keep the procedural fallback for every raster slot, and add rasters only through their body class after the file has loaded.

### Don't:
- **Don't** turn the wall into a uniform dark grid of cover posters with star ratings; the photo always sits under contact plastic on a cartolina card.
- **Don't** put the paper starburst back on wall cards, in the reader or in the editor; the Média is always the two-part label now, live on the editor's preview card.
- **Don't** set readable text directly on a raster or on the wall pattern without a paper surface, except the few chalk labels (`wall-ink`, `wall-ink-2`) that belong to the wall itself.
- **Don't** use frosted glass, backdrop blur, glows or coloured shadows; the contact plastic and the masking tape are the only translucent materials, light comes from the fluorescent tubes above, and shadows are neutral black.
- **Don't** add anything outside the stationery world: every new object must be something you could find at a papelaria.
- **Don't** add a ninth stock, colour a card by its score, or re-draw a stock at render time.
- **Don't** put tracked uppercase kickers above headings; tracked caps are only for printed matter and control-group labels.
- **Don't** round paper past 2–3px or give cards pill or large-radius corners; paper is cut, not moulded.
- **Don't** straighten cards to 0deg or animate their tilt while the wall is idle; the tilt is fixed and changes only on hover, focus and landing.
- **Don't** put paper grain, a worn-ink mask or a rubber stamp on the judgment label; it is printed flat and crisp, paper on one half and solid black ink on the other. The one physical damage it takes is the torn corner of a Média below 4.


## Material calibration (polish pass)

- **Paper grain.** The shipping grain is `textures/cartolina-fibra.png`, derived from `cartolina.png` and re-centred on 50% grey, blended with `soft-light` at 420px. It adds fibre without shifting a stock's hue. Multiply with the raw light-grey photo muddied every stock (yellow read olive) and is not used.
- **Wall.** The photographic eucatex (`parede-eucatex.png`, 560px tile) sits under a flat coat of `rgb(24 24 27 / 0.46)` and the fluorescent falloff at 13%. The coat keeps the holes visible but stops them competing with cards and tabs.
- **Native controls on paper.** Every `.cartolina` sets `color-scheme: light`, so radios, the date picker and scrollbars render light on paper while the wall stays dark.
- **Foil.** Platinado carries a 40% milky varnish between the shine and the holographic photo, so the word stays readable on the glitter.
- **Shadows.** No zero-blur offset shadows remain: `btn-ink` and field strips use soft offsets (`0 1px 2-3px`).


## Added components (feature pass)

- **Card density.** A "Fichas" tab group on the rail switches Completas / Simples (persisted, animated with the same view transition as sorting). *(Superseded for card anatomy and widths by "Ficha do mural" below.)* At the time the simple card kept cover, verdict stamp, starburst, title (2 lines), completion date and status label, and dropped year, hours, sub-scores, excerpt and skulls.
- **Category weight.** Each score picker in the editor has a small printed select at the right of its label: Relevante, Normal, Pouco importante, Não tem. Normal is a quiet translucent chip; any other value becomes paper with an ink edge so a changed weight is visible at a glance. Não tem strikes the label through at 55% and removes the 0–10 row. In the reader, Relevante and Pouco importante show as a small lucide arrow up / down after the label (with the weight name as a tooltip) and Não tem rows are not rendered. (On wall cards Não tem now keeps its struck boletim cell; see "Ficha do mural".) No explanatory copy about weights is shown; the numbers explain themselves.
- **Cover choice.** Under the chosen item in the editor, a pen action "Escolher outra capa" (Images icon; "Escolher uma capa" when there is none). It opens, in place, a sheet of plain paper laid on the cartolina (white at 42%, a 1.5px ink hairline) with the "Qual capa?" label and the same cover grid as the Wishlist dialog (the shared `CoverPicker`): the item's cover and the others of the same title, "sem capa", and "Colar link de imagem"; "Pronto" (Check icon) closes it. The choice shows at once on the live card. Opened by keyboard, focus goes to the chosen cover. A cover that does not load is kept visible (hatched, "não abriu") while it is the chosen one, so a card never loses its cover without being asked. For games without a RAWG key, a small note says Steam covers come with one. A RAWG pick still switches to the Steam cover by itself when there is one. The default search source is a radio pair in Ajustes.
- **Hours played.** A paper strip beside the completion date: right-aligned tabular number, "horas" unit in condensed caps, accepts "12,5". Shown in the card meta line and the reader meta ("120 h jogadas").
- **Tachinha shadow.** The raster pins carry `drop-shadow(2px 3px 1.5px rgb(0 0 0 / .42)) drop-shadow(5px 7px 5px rgb(0 0 0 / .22))`, the shadow falling down and right onto the cartolina, consistent with the overhead-left fluorescent light.
- **Copy diet.** Removed: the "vale 2x" and "2x" tags, the hint under the Média, the visible search hint (kept for screen readers), the date hint and the "opcional" labels.

## Open sheets (reader refinement)

- **Pastel sheets.** *(Superseded by "Harmonia de cor": sheets are index cards now.)* Every dialog sheet (reader, editor, settings) renders its stock as a pastel: `color-mix(in oklab, var(--stock) 30%, var(--paper))`, with the full neon stock kept as a 12px band across the top edge (`inset 0 12px 0 var(--stock)`), where the pin sits. Neon at 760px wide fought the cover, stamp and text; on the wall the cards stay full neon.
- **Verdict block.** *(Superseded by "Leitura como ficha".)* In the reader the Média no longer sits in the bar list and carries no label. It leads a block: the big paper starburst (120px) on the left; to its right, stacked, the verdict stamp at reader size (1.3rem, -5deg, struck on the sheet, not on the cover), then the status label and difficulty skulls. A dashed rule separates the block from the category bars. The difficulty label reads "Dificuldade média" / "Sem dificuldade" so it can't be mistaken for the score.
- **Mobile reader.** *(Superseded by "Leitura como ficha".)* Cover shrinks to `min(170px, 52%)` so the verdict block and bars reach the first screen.

## Restructure (pages pass)

The single long page was split so the wall reaches the first screen: before, the masthead, the pending queue and three tab groups took ~560px on desktop and ~1000px on a phone before the first card; now ~215px and ~330px.

- **Compact cartaz.** "Meu mural de jogos" on one line at 2.05rem (two lines at 1.5rem on phones), same yellow stock, pins and red scribble. The tally line moved to the Ranking page's Balanço.
- **Section tabs.** *(Superseded by "Harmonia de cor": Dymo tape.)* Small cartolina strips in Barlow Condensed 800 caps, each with its own stock (Mural laranja, Pra depois verde, Ranking azul, Ajustes lilás). Inactive tabs are faded: `color-mix(in oklab, var(--stock) 34%, #4d4e55)`, 66% on hover. The current tab is full neon, raised 5px, with the hanging-card shadow and a tachinha on its top edge. Tabs tilt ±0.7–1.4deg. Counts (reviews, pending) are tabular at 66%.
- **Select tab.** A divider tab that wraps a native `<select>` made invisible over the whole tab, so the browser picker still opens; the tab shows a faded prefix ("Ordenar"), the current value and a chevron. Ordenar merges what used to be four sort tabs plus five "Qual nota" sub-tabs: Data, Nome, Status, then a "Nota" group (Média, História, Diversão, Jogabilidade, Visual). On phones a second select tab ("Mostrar") replaces the verdict tabs.
- **Density icons.** Completas / Simples are two icon-only tabs (Rows3 / LayoutGrid) with spoken labels and tooltips, no group label.
- **Pra depois page.** *(Superseded by "Pra depois (notebook pass)".)* The torn notebook pages lived under a masking-tape heading in a grid of `minmax(168px, 1fr)`. Saving a draft from another page shows a toast with "Ver fila"; finishing a draft goes to the Mural and plays the landing.
- **Ranking page.** A sheet torn from a notepad (paper with grain, zigzag tear-off edge via a two-layer mask, drop-shadow, -0.5deg) listing every review by the chosen category, chosen with divider tabs on a ruler above it. Rows: ordinal ("1º", ties share it), plastic-covered thumbnail, name in condensed 800 with year · status, score in marker (red-deep from 9). First place gets a larger row, the name in marker and the pen circle drawn around its score. Reviews with no score in the category are left out, with a line saying how many. Beside it (below on narrow screens) a second notepad sheet, **Balanço**: dotted-leader totals, "Mais jogado", "Veredito mais dado" and a double-ruled "Média geral".
- **Ajustes page.** The settings sheet became a page of pinned cartolinas side by side: Backup (azul), Catálogo de jogos (lilás) and Mural (verde). Mural holds "Etiquetas dos grupos: Mostrar / Esconder" (`Settings.groupLabels`, saved with the rest of the config). Hidden, the wall drops the tape labels and summaries (kept visually hidden for screen readers) and the groups dissolve (`display: contents`) into one run of cards at the in-group gap, so a screenshot shows only the cards.
- **Removed.** The masthead tally, the in-header pending queue, the visible group labels "Mostrar / Ordenar / Fichas / Qual nota" (kept as accessible names), the "Qual nota" sub-rail, the settings dialog and the "Ajustes e backup" header button.

## Card diet (grid pass)

*Superseded by "Ficha do mural" below: the cover-top anatomy, abbreviated boletim, absent Não tem cells, clamped excerpt and even-height rows described here no longer ship. Kept as history.*

The full card carried eleven competing elements, and four dotted sub-score rows per card turned a wall of 14 into 56 leader lines. The card then got one hero, one voice, one data line and one note:

- **Boletim.** The four sub-scores sat in one row of ruled cells (HIS · DIV · JOG · VIS, abbreviations from `SCORE_ABBR`, full names for screen readers). Each cell had a condensed-caps label over a marker numeral; cells were split by 1.5px pen rules at 20% ink, and the row was closed above and below by 1.5px rules at 32%. Não tem cells were simply absent (the row got 3 columns). Weight arrows shrank to 10px after the label. When the wall was sorted by a category, that cell got the highlighter band.
- **Cut from the grid** (still in the reader): the release year, the difficulty skulls. The excerpt was clamped to 2 lines (hidden on phones).
- **Kept:** tachinha, plastic-covered photo with the starburst, the verdict stamp struck on the cover, the marker title, date · hours, and the status sticker, which closed the written content.
- **Even rows.** The wall grid stretched its items, so every card in a row had the same height; a card with less written on it showed blank cartolina at the bottom. The per-card drop (0–14px) and tilt still broke the line at the top.

## Wall in sections (composition pass)

Squint test before this pass: fourteen neon rectangles of identical weight, with no primary, secondary or grouping. The wall now reads as a mural someone arranged by hand.

- **Sections follow the sort.** `WallView.groups` splits the already sorted list into runs sharing one key: month of completion for Data ("Setembro de 2026"), grade band for Média ("9 ou mais", "Na casa do 8", … "Abaixo de 5"), the integer score for one category ("Diversão 10", then "Sem nota de Diversão" at the end), the folded first letter for Nome ("#" for digits), and Platinados / Finalizados / Incompletos for Status. Direction reverses sections and their contents together.
- **Section label.** A `.tape-label` (global: masking tape at 94% with grain, torn ends via clip-path, marker 1.3rem, -1.5deg; alternating 1.2deg and -0.6deg by position) beside a chalk summary in condensed caps: "3 jogos · média 9,1" (no average when sorting by score, or for single-game sections). The label carries a view-transition name so it slides to its new place when the sort changes, while the cards fly to their new sections.
- **Topology.** Sections flow side by side in a wrapping flex row (64px row gap; the column gap is now the in-section card gap, see Layout); inside a section, cards wrap at a fixed width, rows stretched to equal height. Tight inside, generous between: proximity alone makes the groups, with no box around them. On phones sections stack (48px apart). *(Card widths, gaps and the phone column count here were superseded by "Ficha do mural": the pass shipped 232px / 184px cards with 40px/26px gaps and two columns on phones.)*
- **Objects on the photo, writing on the card.** *(Superseded by "Ficha do mural": nothing sits on the photo any more.)* This pass put every physical label on the photo: the verdict stamp (top-left), the status sticker (bottom-left, 9px out of the edge) and the starburst (bottom-right), with only handwriting on the cartolina. The footer row went away.
- **Date without redundancy.** In month sections the card shows only the day ("20 de set"); the full date stays in the accessible name and in the reader.
- **Known trade-off.** Side-by-side sections leave a hole at the end of a row when the next section does not fit; it reads as bare wall between pinned groups.

## Ficha do mural (card redesign pass)

A critique scored the wall card 19/36: the frame was authored, but at a squint the wall read as cover posters in neon mats, the anti-reference. The cover was buried under three objects (the stamp over 65% of its width, the status sticker, the starburst; about 9 of 14 logos obscured). The score hierarchy was inverted (an integer "9" at 2.1rem outweighed "9,4" at 1.7rem, and the Média was only 1.3x the sub-scores). Keyboard focus was invisible (an ink ring on the graphite wall, about 1.1:1) and the accessible name carried no score, verdict or status. The boletim was illegible (about 11.5px, 9.9px on phones) and reflowed when a category was Não tem. The excerpt was cut mid-word and hidden on phones. The user then set the direction: the verdict must weigh as much as the Média, the starburst on the card was ugly and goes, and names take at most two lines.

- **Horizontal card.** The photo moved to the left of the text, counter-tilted; nothing sits on it. (It was taped on with masking tape at first; the tape was removed later, see "Papelaria".) Cards widened (Completa 330–424px, three per section row; Simples 270–300px), and phones went to one column of full-width horizontal cards.
- **One judgment label.** *(Superseded within this pass by "Two-part ticket" below.)* The Média and the verdict share the card's only white paper: the Média as a marker numeral (3.5rem + 2.1rem decimal, red-deep from 9), the verdict as an ink-tone stamp worn by `--stamp-wear`. The starburst stays only in the editor and reader.
- **Two-part label.** The paper label with the marker numeral and the worn ink stamp read as muddy and mismatched: the grain multiplied the white to grey, the marker numeral and the stamp sat at different scales, and the lowered decimal read as an exponent. It was replaced by the two-part sticker label (the Média in Barlow Condensed italic on flat paper, the verdict in white on a band in its ink, one height, a notched perforation between them) for equal weight and a crisp finish. VerdictStamp's `tone` input, `--stamp-wear`, `--stamp-tilt` and the marker grade numeral were removed.
- **Quiet status.** Finalizado is silent; only Incompleto and Platinado get the sticker label, under the meta. *(Superseded by "Status tape" below: the label moved onto the photo.)*
- **Readable writing.** Title at 1.62rem clamped to 2 lines; meta and boletim labels in full ink; the lead sentence whole via `leadSentence`, on phones too; four fixed boletim cells with full names, Não tem struck in place.
- **Focus and names.** A 3px yellow ring at 5px offset around the whole card, a press state, an accessible name that carries name, Média, verdict, status and date, and a decorative cover.
- **Pin** remapped to 42–58% so it sits over the title, clear of the photo.

## Status tape (photo pass)

The user asked for the Incompleto / Platinado label to move from under the meta to the foot of the photo, flush, as if it were part of it, without taking more room than the photo already takes.

- **Tape across the foot.** The status became a full-width strip of tape across the bottom of the photo. It is projected into the photo frame, so the frame's overflow and radius clip it and the plastic glare runs over it. This walks back "nothing sits on the photo" for this one object: unlike the old corner sticker, the strip is square to the photo, edge to edge and flat, so it reads as part of it rather than something covering it.
- **Two finishes.** Platinado is foil (the loudest object on the card after the Masterpiece band); Incompleto is an ink strip with orange lettering and rule, carrying the label orange onto a quieter surface.
- **Space.** The words column lost the label row, so status cards are now as tall as Finalizado cards next to them. The strip covers the bottom 21px of the photo (16px Simples); logos that sit at the very bottom of a cover (Dead Cells) are partly covered, a known trade-off.
- **Fit.** Barlow Condensed 800 "INCOMPLETO" measures 4.56em; the sizes above were chosen so it fits without clipping in every photo width (102, 94, 64 and 58px).

## Sort mark and Lado a lado (comparison pass)

The user found the sorted-attribute highlighter ugly (the yellow band on the Média read as a yellow block inside the white label) and asked for a custom wall of only the games they tick, to compare e.g. every GTA side by side.

- **Red pen, not highlighter.** `app-pen-mark` is one shared stroke: an inline SVG path (viewBox 100×10, stretched with `preserveAspectRatio="none"` and `vector-effect: non-scaling-stroke` so it stays 2.6px on "Visual" and "Jogabilidade" alike), in `red`, 7px tall, 7% wider than the word on each side, sitting 5px under it. It draws in left to right by opening a `clip-path` inset over 280ms (80ms delay) on the physical curve. It marks the sorted category in the boletim, the sorted score beside the date on Simples cards, and the sorted row in the Nota a nota sheet. Red keeps its meaning: the score, the pen.
- **Marcar.** A divider tab on the ruler, "Marcar" with a lucide square-check icon and the tabular count of marked games, `aria-pressed` for the mode (icon and count only at 720px and below, beside the density icons; the search strip takes `min-width: 0` there so the three icon tabs share its row). The selection is one list of review ids in marking order, kept in `localStorage` (`mural-de-jogos:lado-a-lado:v1`), outside the JSON backup; deleted reviews drop out of it. The mode ends with Pronto, Esc, "Ver lado a lado" or leaving the Mural. The reader footer has a quiet toggle "Lado a lado" (square / square-check icon, red underline when pressed).
- **Tira de marcação (picking tray).** While picking, a notepad-paper strip is fixed at the bottom centre (max 820px, -0.4deg, lifted shadow, two masking-tape pieces at ±25deg, rising 30px over 380ms): the count ("2 marcadas", the number in red-deep marker 1.45rem), quiet buttons "Marcar as N visíveis" (only while a search or filter is on), "Limpar" (with a Desfazer note) and "Pronto", and the ink button "Ver lado a lado" (disabled at 0). At 560px and below it becomes two rows with the ink button full width. `body.has-tray` lifts the toast note above it and adds 90px to the wall's foot.
- **Lado a lado page** (`/lado-a-lado`). A view of the Mural, not a fifth header tab (five tabs do not fit the phone row), so the Mural tab stays lit there. Head: a big tape label "Lado a lado", the chalk summary ("3 jogos · média 7,5"), and chalk quiet buttons "Marcar mais" (back to the Mural in Marcar mode) and "Limpar". A ruler with an "Ordenar" select tab (Como marquei, Lançamento, Data, then the Nota group; fixed directions: chronological for dates, highest first for scores, missing values last) and the density icons. Then the marked cards in one flow with no sections, at the wall's widths.
- **Nota a nota.** A sheet of flat `paper` (no grain, so the sticky label column matches it), 2px radius, hanging-card shadow, -0.35deg, two tape pieces on its top edge, a marker headline (1.9rem). A table with one column per game (at least 150px; 112px at 720px and below) and a sticky row-label column that stays put while wide comparisons scroll sideways. Column heads: a 58px plastic-covered thumbnail and the name (Barlow Condensed 800, 1.05rem, 3 lines max), which opens the reader, and a 32px round X to take the game out (with a Desfazer note that restores the old order). Rows: Média (the italic label numeral, 2.2rem with a 0.66em decimal, red-deep from 9), Veredito (the card-size stamp at -4deg), História, Diversão, Jogabilidade, Visual (Permanent Marker 1.45rem with the weight arrows; "Não tem" or missing is a 45% "—"), then a solid 2px rule and the facts: Horas, Status (label), Dificuldade (skulls over the level name), Jogado em ("até" for Incompleto), Lançamento. Rows are split by 1.5px dashed ink rules; the head by a 2px ink rule. In each score row the highest value is circled with the same red pen circle as the Ranking's first place (drawn in over 420ms); ties circle every winner, and nobody is circled when all tie or fewer than two games have the score.
- **States.** Nothing marked: a blue cartolina note ("Nada lado a lado ainda", Kalam copy, the ink button "Escolher no mural"; with an empty wall it points to "Nova resenha" instead). One marked: the card, then a Kalam chalk line "Marque mais um jogo pra comparar nota a nota." with "Marcar mais".

## Lado a lado, revisto (comparison page pass)

The user found the verdict stamps in Nota a nota out of date (coloured rubber stamps next to cards that use the black canhoto), the empty state after "Limpar" a confusing dead end that only sent them back to the Mural, and the page in general weaker than it could be.

- **Comparison first.** The page is for comparing, so Nota a nota now sits right under the ruler and the cards come after it, under their own wall tape label "As fichas" ("A ficha" with one) with the density icons beside it (density only changes the cards). The ruler keeps only "Ordenar", which moves columns and cards together, and is hidden with a single card. On the phone the sheet's first two columns and every score are in the first screens instead of after ~3000px of cards.
- **Legend.** Beside the marker headline, a Kalam line in `ink-2`, "circulei a maior nota de cada linha", after a small red pen circle (the same path as the winner circle, 26×22, 3px stroke). It wraps under the headline on phones.
- **Verdict row.** The canhoto alone (see Verdict stamp), the same object as on the card above it. Comparar's Nota a nota uses the same component.
- **No empty page.** "Limpar" became "Recomeçar" (lucide rotate-ccw; tooltip "Desmarcar todas e escolher de novo no mural"): it clears the selection and goes straight to the Mural in Marcar mode, where the tray already says "Toque nas fichas que vão pro lado a lado". Its note "Lado a lado limpo" keeps Desfazer, which restores the old order and returns to `/lado-a-lado`. Any time the open wall has nothing marked (the last card unticked in the reader, another wall chosen, the address opened directly) the page replaces itself with the Mural, in Marcar mode when the wall has cards. The blue "Nada lado a lado ainda" note is gone.
- **Phone overflow.** The sheet's scroll box is `position: relative`: the absolutely positioned screen-reader texts inside the table used the sheet as their containing block, escaped the horizontal scroll and made the whole page scroll sideways at 390px (786px wide with five games).

## Harmonia de cor (colour pass)

The user felt that many colours looked wrong next to each other. A dual critique (design review plus detector and contrast measurements) found the causes, and this pass fixed them as a system, not colour by colour.

**What was wrong**
- **Verdict inks shared a hue with a stock.** Recomendo green (151°) matched verde (150°), Meh brown (66°) matched laranja (60°), Chato purple (302°) matched lilás (302°), and Legalzinho blue (264°) sat next to azul (234°). Every verdict band was therefore muddy tone-on-tone on one stock and vibrated against its complement on another (dark green on pink came in at 1.9:1).
- **The gold foil band had 1.04–1.05:1 luminance contrast** against laranja and lilás, so it read as khaki cardboard.
- **The stocks did not weigh the same.** Rosa was L 0.71 / C 0.20 (heavy); amarelo was L 0.93 (glaring). Half the wall read neon and half read chalky.
- **The rotation put complements side by side** (rosa/verde, azul/laranja).
- **The faded section tabs were muddy.** Mixing a stock into cool grey gave brown, sage, slate and mauve, at 3.7–4.2:1 for their text.
- **Pins came from six hues, chosen independently of the stock.**
- **The neutrals sat at three temperatures:** a cool wall and cool grey plastic against warm tape and warm notepad paper.

**What ships**
- **Stocks retuned in OKLCH** to L 0.78–0.90 with close chroma (values in the frontmatter). Every stock gives ink at least 8:1.
- **Rotation** `rosa → laranja → amarelo → verde → azul → lilas`. Adjacent stocks are always analogous. Stored stocks on existing reviews are untouched; new reviews continue the new order.
- **One ticket ink.** The verdict half of the wall card's label is always `ticket-ink` black with `paper` lettering. The verdict's hue survives only in its icon, lightened (`verdict-*-lit`) and surrounded by black, so no verdict ink ever touches a stock. **Masterpiece** is the same black band with the word hot-stamped in gold foil (a metallic gradient clipped to the letters, still carrying the `--shine` sweep on lift) and a 1.5px gold hairline frame inset 4px. The saturated `verdict-*` inks remain for stamps on paper: the reader, the verdict picker and Nota a nota.
- **Dymo section tabs.** Section tabs are embossed label tape: glossy black `dymo-tape` with a top-half reflection, raised `dymo-emboss` letters (Barlow Condensed 800, tracked 0.14em, lit top edge and shadowed foot), and a 3px radius. The current page is hi-vis yellow tape with ink letters and a tachinha, so yellow keeps meaning state. The tabs no longer carry a stock, which removes four hues from every header.
- **Index-card sheets.** Reader, editor and settings dialogs are cream `paper`. The review's stock fills only the header band (with its grain). A 2px `red` rule under the header was tried and removed at the user's request. Ruled text areas use `ruling-blue` pencil lines, the same as the Pra depois pages. Hover tints inside sheets are ink at 5–7%, not white, because white vanishes on cream.
- **Blank-card stack.** The primary action is a white index card on top of rosa and azul sheets, so it reads as "a fresh card" and no longer copies a card stock.
- **Pins.** Red and white only, and white on rosa and laranja.
- **Warm neutrals.** Wall `#1f1c1a` under a warm 56% coat over the eucatex photo; fluorescent falloff `rgb(255 246 230 / 0.11)`; paper `#f7f4ec`; ivory divider plastic; the ruler warmed to `#76726b`; scrollbar `#4d4843`; `theme-color` updated.
- **Editor digits.** Unselected score digits are ink at 60% (full ink on hover), so the circled choice leads instead of 44 equal numerals.
- **Nota a nota** column heads carry a 6px strip in each game's stock, linking the table to the cards above it.
- **Contrast.** The save-error banner moved to `red-deep` (white text now passes 4.5:1). The Dymo tabs and their counts pass.

**Named rule: Ink Is Judgement.** Cartolina is decoration; ink is judgement. Anything that judges a game (the Média, the verdict, the circled best) is printed in ink, paper or red on a neutral surface, never in a hue that competes with a stock. At most one saturated stock per card.

## Papelaria (stationery pass)

The user wants the world to be only a mural of stationery: paper, cartolina, masking tape, Dymo tape, notebooks, stickers, contact plastic, tachinhas. Nothing else.

- **Every object is named as stationery.** The North Star is "Mural de Papelaria".
  - The judgment is a two-part sticker label.
  - Filters sit on binder divider tabs over an aluminium ruler.
  - Toasts, the Ranking and the marking strip are notepad paper (`.bilhete`, `.tira`).
  - Status comes as sticker labels and status tape.
  - The Média is a paper starburst in the editor.
  - Photos are under contact plastic.
- **Copy.** The empty wall reads "Todo mural começou com uma parede vazia." The empty Ranking says "a lista sai com o seu top".
- **No tape on photos.** The two masking-tape pieces over the photo's top corners were removed. The photo is glued flat to the card, which clears the corners and leaves the tachinha as the only object on top of the card.
- **No red rule on sheets.** The index-card sheets keep the stock header band. The red rule under it is gone, so the header meets the cream paper directly.

## Bônus (feature pass)

The user wanted bonuses: as many as they like, "a favor" or "contra", things the four categories do not cover ("Trilha sonora incrível", "Muitos bugs"). Each one moves the Média as one more score would, 10 for a favor and 0 for contra, with weight 1 (a Normal História), capped at 0.25 per bonus either way. They are **adesivos**: small printed sticker labels peeled from a sticker sheet (cartela) and stuck on the card.

- **Two finishes, no colour.** A favor is `paper` with a 1.5px ink hairline printed at its edge (so it still reads on the cream sheets); contra is solid `ink` with `paper` lettering, the same ink as the verdict band. The two sides differ by fill, not by hue, so the One Ink Rule and Ink Is Judgement hold and the difference survives colour blindness. Each sticker is Barlow Condensed 800, 0.88rem, sentence case (names are long), a 14px lucide icon (12px on mini), 26px tall (22px mini), a 2px radius and the status label's small drop shadow. Stuck by hand, each one tilts from a fixed sequence by position (`-1.4, 0.9, -0.5, 1.3, -1, 0.6` deg).
- **Icons.** Every catalog bonus has its own lucide icon (Music, Bug, Snail, Pickaxe, Scale…). A bonus the user wrote gets a plus or a minus.
- **Catalog.** 9 a favor and 11 contra, chosen to cover what the categories do not (soundtrack, characters, ending, innovation, replay, multiplayer, humour, emotion, uniqueness; bugs, performance, loadings, grind, microtransactions, ending, pacing, length, camera, balance, price). Custom bonuses have no settings screen: `ReviewStore.customBonuses` derives them from the reviews (most used first), so one that no review uses disappears on its own. Labels are cleaned to 32 characters with a capital first letter, and ids derive from the side and the folded name (`u-f-…` / `u-c-…`), so writing the same name twice on the same side reuses it. A name typed on one side never picks up the same name from the other side (typing "Muitos bugs" under A favor must not stick the contra and drop the Média unannounced).
- **Editor.** A "Bônus" section under the four score pickers (the Média it moves sits right above). The heading row carries the label, the tally and a marker-link toggle ("Colar bônus", "Mexer nos bônus", "Fechar cartela"), the same link style as "Trocar jogo". Closed, it shows the stuck stickers, or a one-line hint that states the rule once ("Cada um mexe na média como uma nota a mais (10 a favor, 0 contra), no máximo um quarto de ponto."). Open, it is the **cartela**: a whiter sheet (`cartela`) laid on the index card with a faint ink edge, holding two groups, "A favor · até +0,25 cada" and "Contra · até −0,25 cada". A sticker still on the sheet is its kiss-cut outline (1.5px dashed ink at 42%, ink at 74%, straight). Choosing it sticks it: it becomes the solid sticker, tilts and grows to 1.04 on the physical curve. "Escrever outro" at the end of each group turns into a blank sticker input (paper for a favor, ink with a yellow caret for contra); Enter sticks it and leaves another blank one, Esc drops it and returns focus without closing the sheet. A chosen a-favor sticker takes a full 2px ink edge and a small lift shadow, so paper on the whiter sheet still reads as stuck; ghosts sit at 62% ink with a 34% dashed cut. On touch screens slots grow to 40px with 6px gaps. The cartela always opens closed, so a review logged in a hurry never scrolls past 24 stickers. While it is open, the heading row prints the live Média beside the tally ("Média 6,8 (−1,7)"), because the starburst scrolls out of view; it is `aria-hidden`, since the starburst block already announces the Média. The whole picker is a `role="group"` named by its "Bônus" title.
- **The maths in view.** When a review has bonuses, a printed breakdown sits beside the starburst: "Notas 8,5 / Bônus −1,7" (Barlow Condensed 800 caps, numerals in italic 1.2rem ink), sliding in over 380ms. A contra can take up to a quarter point off; the breakdown makes that visible while scoring.
- **Wall card.** Completa: a row of stickers between the lead sentence and the boletim, a favor first, at most four (the user keeps cards uncluttered). Past four, the stickers are picked alternating a favor and contra, so the cap never hides a whole side, and the rest becomes "mais" plus the tally of the hidden ones ("mais +1 −1"). The reader always shows them all. Simples: only a tally in the meta line, two micro-stickers "+2" (paper) and "−1" (ink). The accessible name adds "2 bônus a favor e 1 contra".
- **Reader.** *(Superseded by "Leitura como ficha": the stickers now sit in their own row above the boletim.)* A "Bônus" row closed the score bars behind a dashed rule, with a meta line "Sem eles, a média seria 7,6." ("…seria a mesma." when it does not change).
- **Nota a nota.** A "Bônus" row after Visual, only when some marked game has bonuses: mini stickers stacked in each column, "—" for none. No circle: bonuses are not a score to win.
- **Ranking.** The Média already includes bonuses. The Balanço adds "Bônus a favor mais dado" and "Bônus contra mais dado", each shown as its sticker with the count, only when one stands out (given at least twice, with no tie).
- **Search** also matches bonus names ("bugs").

## Leitura como ficha (reader pass)

The user found the opened card too far from the wall card: the same facts came as different objects (a starburst and a gold rubber stamp instead of the two-part label, a loose status sticker instead of the tape on the photo, hatched bars instead of the boletim, the name in the header instead of beside the photo, grey meta). The reader is now the wall card seen up close, still on the cream index-card sheet (the user kept the cream paper and the stock header band).

- **Shared parts.** The judgment label and the boletim are components (`app-judge-label`, `app-boletim`) used by the wall card and the reader, so the two cannot drift apart again. The label takes `size` `card | compact | big` and counter-tilts itself at `-0.5 × --tilt - 1deg` (just -1deg in the reader, which has no tilt); the boletim takes `card | big` and the sort `highlight`.
- **Header.** Only the stock band (46px, 40px on phones), with the tachinha centred and the close button at the right. The name moved down beside the photo.
- **Head.** A grid of `cover | words` over `cover | judgement`, like a desktop Completa card. Photo: 208px under contact plastic (`size="big"`), counter-tilted -1.2deg, with the status tape across its foot (27px, 0.92rem; 20px, 0.74rem on phones) and nothing for Finalizado. Words: the marker title (2.3rem, 1.04, balanced, never clamped), then the meta in full ink (Barlow Condensed 800 caps, 0.98rem: "Concluído em 23 de setembro de 2026 · 24 h jogadas"), then "Lançado em 2022" in `ink-2`. Judgement, 22px below: the big label (74px tall, 6px notches, grade at least 96px wide, band 1.3rem with a 23px icon, gold frame inset 5px) and the difficulty skulls (18px, with the level name) beside it, wrapping under it when narrow.
- **Bonus.** Every sticker (no cap of four, unlike the wall), in a row under the head, and "Sem eles, a média seria 8,8." under them.
- **Boletim.** The wall card's four fixed cells, larger: 2px rules, 1rem labels in sentence case (now caps; see "Selo dourado"), 2.1rem marker numerals (0.86rem / 1.7rem at 600px and below), 17px weight arrows with the weight name as a tooltip (now 15px, after the category name; see "Selo dourado"), and the struck "Não tem" cell. The hatched bars are gone (the user left it to the design).
- **Text.** Unchanged: Kalam on the blue ruled lines, max 68ch, under the boletim.
- **Removed from the reader:** the paper starburst, the verdict stamp, the status sticker, the bars.

## Nota 10 (foil pass)

*(Superseded by "Ouro e Chato rasgado": 9 and up, and every 10, are now gold on white paper, and the rainbow foil is gone from the grades. The Platinado status tape keeps its foil.)*

The user wanted every 10 to shine, on the wall card (Completa and Simples) and in the reader. A first try (a gold-foil star behind each boletim 10 with four-point sparkles blinking around it) was rejected as ugly: gold on rosa and laranja had no contrast, and three objects per score crowded the boletim. Of three directions offered (gold on ink, holographic, red pen only) the user chose **holographic**.

- **One material, one object.** A 10 is a **holographic nota-máxima sticker**: the Platinado foil (`--holo-foil`, `holografico.png` with the diffraction-line fallback) under a thinner milky varnish, with the white inner edge of the Platinado stamp. The shared class is `.foil-nota` in `styles.scss`: the foil lives on an oversized `::before` and the edge and the `--shine` sweep on `::after`, both behind the numeral.
- **Alive foil.** The foil layer drifts 100px sideways and back (5.2s, `cubic-bezier(0.45, 0, 0.55, 1)`, alternate), so the rainbow and glitter move like a sticker tilted under the tube. Boletim cells stagger it by -1.3s each so a row of 10s never pulses in unison. On lift the same `--shine` sweep as Platinado and Masterpiece crosses it. Reduced motion leaves it still.
- **Ink stays the judgement.** The numeral on the foil is always `ink` (not `red-deep`, which goes muddy on the spectrum) with a 1px white emboss. The Média grade has no edge of its own: the user removed the ink outline, so the label drop and the black band carry it. On the boletim and meta stickers, the user set the edge: no border, a 12px radius (a rounded pill) and the drop shadow `0.5px 1.5px 3px rgb(0 0 0 / 51%)` (`--sombra`).
- **Where.** The Média grade (varnish 16%; the label's size and notches are unchanged). Each boletim cell with a 10: a small sticker around the marker numeral (varnish 22%, padding `0.04em 0.26em 0`, at least 1.4em wide), stuck at -2.5deg, or 1.8deg on even cells. The sorted score beside the date on Simples cards ("Diversão 10"): the same sticker at 16px tall, -2deg.
- **Platinado and a 10 share the foil on purpose** (the user chose it): both mean "all of it". They are told apart by the object. Platinado is status tape across the photo, and a 10 is a numeral sticker on the card.
- **The foil catches the lamp** (extremes rework). At rest nothing is added, so the card is no busier. When a card lifts under a mouse, or the pointer is over the open reader, every holographic foil on it (the Média grade, the 10 stickers, the Platinado tape) behaves like a holo sticker tilted under the tube: a soft white hotspot sits where the pointer is (a radial gradient at `--luz-x/-y`, 62% white at the centre, gone by 46%), and the rainbow turns up to ±75deg of hue and gains saturation as the pointer moves across (`--luz-n`). A first try with a 70% glare washed the small stickers out to milky white; real foil gets more colourful under light, so the hotspot shrank and saturation went up instead. `Luz` (`ui/luz.ts`) writes only CSS variables, outside change detection, once per frame, and only for mouse pointers. `--luz` is a registered number that fades in and out over 600ms on the physical curve, set only under `@media (hover: hover)`, so a tap on a phone never leaves a glare stuck.

## Notas nos extremos (extremes pass)

The user asked for the same kind of effect on every Média of 9 or more, and for every score below 2 (categories and Média) to show "negativity coming out".

- *(Superseded by "Ouro e Chato rasgado".)* **Média 9 or more: holographic, like the 10.** A silver version (the foil desaturated, the rainbow kept for the 10, the numeral in `red-deep`) was built first. The user rejected both the reservation and the red: every Média of 9 or more is the same holographic `.foil-nota` grade, with the numeral in `ink`. High Médias are no longer red on the card's label. Category scores of 9 stay plain marker.
- **Below 2: nota vermelha, on torn black.** In a Brazilian school a failing grade is a *nota vermelha*, so a bad score is red, and it sits on black that someone ripped. The user asked for a black ground on the Média and for tears in its paper. The red is `nota-vermelha` `#ff4436` (5.3:1 on `ink`, so it passes at every size). It never sits on a stock directly. It is the opposite of the 10: good is a smooth die-cut holographic sticker, bad is black material torn by hand.
  - **Média:** the grade half of the label turns black (`.tarja-rasgada`), so a bad Média with a verdict reads as one black ticket split by the perforation. Its outer top corner is ripped off on a jagged diagonal, and the left edge below is ragged down to the foot. Along the tear the white core of the paper shows as a fibrous band, widest in the corner where the rip started (3.4 → 1.1 units). Both edges are SVG paths roughened by a turbulence displacement, stretched to the label height in a strip `--rasgo-w` wide (24px card, 18px Simples, 30px reader): the ink body is a mask on `::before`, and the fibre is a paper-coloured shape on `::after` behind it, so the ticket notches still cut both. The numeral moves in to `padding-left` 16px (12px, 21px) so it sits in the middle of what is left. The label drop follows the torn outline.
  - **Categories and the sorted score:** a short piece of black tape torn off the roll (`.fita-rasgada`), the numeral in `nota-vermelha` marker on top. Both ends are serrated with uneven teeth on a slight shared slant, as tape tears by hand (0.26em masks on each end over a solid middle that overlaps them by 0.08em, so no seam opens). The top half carries a faint vinyl sheen. Every piece is at least 1.6em wide and centres its numeral, so a thin "1" and a wide "0" sit exactly alike (the drips hung off the foot of the stroke, which changes from glyph to glyph). Tilted -3deg, 2.4deg on even cells, a little more crooked than the 10 stickers. On Simples, beside the date: 16px tall, -2.5deg.
  - No motion: nothing drips, pulses or loops.
- **Tried and dropped for below 2**, all rejected by the user or on screen:
  - A black sticker with an ember-red numeral, an ember rim and a pulsing brown scorch: the user disliked the black.
  - Thin marker smoke wisps (lost in the labels) and blurred smoke puffs (read as smudges).
  - A paper sticker with a trembling red numeral and cartoon shock lines: the user rejected the white background; the sticker shape only suits the 10.
  - Dripping ink with an ink outline on the numeral and the drips: the outline separated the drips from the stroke, so a "1" read as a "4" or a chilli.
  - Dripping ink with no outline, in `red-sangue` `#8c0f0f` on the cartolina, and a short drip leaking from under a paper Média. It shipped once, and the user found it ugly: a dark red on paper did not read as bad, and the drips sat in a different place on each glyph because numerals differ in width.
- **Thresholds** live in `JudgeLabel.grade` (`foil` for 9 or more, `ruim` for below 4 but not null) and in the `cells` of `Boletim` and `ReviewCard` (`ten`, `ruim` for below 2). The Média tears earlier than a category, at the user's request: it fails from 3,9 down, while a single category only gets the torn tape at 0 or 1.

## Café e brilhos (grade pass)

The user asked for more steps on the Média label, so it now reads as a ladder of treatments. All of them live on the grade half of the judgment label (`JudgeLabel`), in every size (card, Simples, reader, editor preview):

- **Below 4:** the torn black sticker with the red numeral (unchanged; see "Notas nos extremos").
- **4 to 4,9, coffee-stained (`.mancha-cafe`):** it nearly failed, and the label caught some coffee. Seven flat, nearly round blotches of different sizes (the largest in the top-left and bottom-right corners, small drops in between) in dried-coffee beige `#eddec2`, the colour the user picked from their own mock-up, with no rings or outlines, and only a slight turbulence wobble on the edges (the user asked for rounder blotches over a first, blotchier pass, which itself replaced a brown mug ring the user did not like). They sit behind the ink: the numeral still reads in black. The drawing is a CSS data-URI SVG in `--mancha-cafe`, applied by the component, because the component's own paper background would otherwise cover a global rule.
- **5 to 7,9:** plain paper.
- **8 to 8,9, sparkles only:** three four-pointed sparkles (`.brilho`) in the corners of the plain paper grade, away from the numeral: gold `#e9a800` with a white halo. Each twinkles in a 2.4s loop (fade and grow in, a 45° turn, fade out), staggered by 0.8s so at least one is always lit. Sizes are 15/12/10px on cards, 12/9/9px on Simples and 20/14/14px in the reader.
- **9 and up:** the same sparkles on white paper, with the numeral in gold (see "Ouro e Chato rasgado").

With reduced motion the sparkles stay lit and still, at 85% size.

## Ouro e Chato rasgado (metal pass)

The user loved the sparkles on the 8s and found the rainbow on the 9s and 10s ugly, so the top of the scale became gold on paper, and the Chato verdict got the same tear as a failing Média.

- **Média 9 and up:** white paper, the sparkles of the 8 (gold with a white halo), and the numeral in gold leaf (`.metal-nota`), like the Masterpiece word but a deeper gold that reads on white: a near-flat vertical fill `#d6a73c → #c3922c → #a97c20`, lighter at the top where it catches the light, with no shadow or outline. A first pass with five light and dark bands and a dark filter outline was rejected as artificial. The white shine sweeps across the gold when the card lifts (`--shine`, 900ms), as on the Masterpiece band. The gold only paints inside its own box, and the italic numeral leans past it, so `.metal-nota` pads its box by `0.06em 0.14em` and takes it back with a negative margin; without that the top of the 9 was cut off.
- *(Superseded by "Selo dourado".)* **Every 10 on a category** (boletim, reader, the sorted score on Simples): a white paper sticker (same shape, tilt and shadow as the old foil one) with the "10" in the same gold, and two sparkles poking out of its corners (top right, 0.52em; bottom left, 0.38em, 0.9s later). Those sit on the cartolina, not on paper, so they are plain white with no halo.
- **Chato:** the black verdict band has its outer edge (the right) ripped off, with the same jagged tear and white paper fibre as the failing Média (`.tarja-rasgada.rasgo-direita`, the same masks mirrored). The word moves in a little to sit in what is left (16px tear on cards, 12px on Simples, 20px in the reader). The chosen Chato in the editor's verdict picker is torn the same way (11px).

## Selo dourado (10 pass)

The user found the white sticker with a gold "10" ugly and asked for something creative that looks good on the card and in the reader. Every 10 on a category (boletim, reader, the sorted score on Simples) is now a **round gold seal**, the gold sticker a teacher puts on a perfect test.

- **The object** (`.selo-dez` in `styles.scss`): a circle 1.5em across (in the numeral's own size), with a white die-cut margin (`0 0 0 0.1em #fffdf5`) that separates the gold from any cartolina, yellow included, and a soft drop. The inside is polished gold: a `#ffe68e → #f5c93e → #e2a91d → #c28a0c` diagonal fill, a white hotspot at the top left, fine brushed-metal rays (a repeating conic gradient at 12% white / 7% brown), and an embossed rim (a dark 0.07em inset line inside a light one). The white `--shine` sweep crosses it when the card lifts, as on the Masterpiece.
- **The numeral is printed, not written:** Barlow Condensed 800 at 0.88em of the cell's numeral, -0.03em tracking, in `foil-gold-ink` with a light 0.05em emboss under it. It turns with the seal (-7deg, 6deg on even cells).
- **No layout cost.** The seal is taller than the line, and a -0.3em vertical margin gives the difference back, so the boletim and the card keep exactly their old heights (checked in the DOM: 296px card, 67px boletim, 79px reader boletim). On the boletim it sits 0.07em below the middle, where the marker numerals of the other cells sit. On Simples it rides the meta line at 1em and sits above the red pen underline (`z-index: 1`).
- **Weight arrows moved to the name.** With the arrow beside the number, a 10 read as "10 ↓". The arrow now follows the category name in the label (12px card, 15px reader, stroke 3.4, 86% opacity), with the weight name as its tooltip and in screen-reader text. The label is an inline flex row, so the arrow does not change its height; The arrow is 1em, so it follows the label size.
- **Labels in caps.** The user asked for HISTÓRIA, DIVERSÃO, JOGABILIDADE and VISUAL in caps (`text-transform`, so the text and screen-reader names stay in sentence case): 0.76rem at 0.05em on the card, 0.94rem at 0.06em in the reader (0.86rem at 600px and below). The user asked that the label never shrink to fit. Where the boletim is narrow (a container query, 380px and below: phone cards and the phone reader), JOGABILIDADE with its arrow overflows the cell, and even alone it touches the cell rules, so there it becomes "JOGAB." at the same size on every card. The full name stays for screen readers.
- **Tried and dropped:**
  - A gold star sticker with the marker "10" on it: the numeral overflowed the star and the top point hit the label.
  - A bigger, rounded star with the printed "10": good-looking, but the numeral had to stay small to fit the star's body, and making it bigger meant taller cells on every card. The user asked for a circle, which holds a large numeral in a line's height.
  - A small star beside a normal marker "10": the user preferred the numeral inside the sticker, printed.

## Ficha em branco (editor pass)

The user found the editor "meio aleatório, com diversos tipos de estética" and asked for more personalisation: a card colour drawn only at first and then chosen freely, plus a red and a grey. A critique of the old sheet found five selection styles for one idea (a heavy frame on status, a gold rubber stamp on the verdict, a frame plus a red underline on difficulty, boxed dropdowns on weights, a pen circle on scores), the Média on a paper starburst while the wall and the reader used the two-part label, headings in two unrelated voices (marker "Qual jogo?" and "O que achou?", printed caps for the rest), four boxed "NORMAL" selects louder than the scores, and no way to see the card being made.

- **A bancada.** The left of the sheet is a patch of the wall (`.parede`, the same eucatex as the page, with a shadow falling from the header band), holding the live card being made (the real `app-review-card` with `preview`, `inert`, at the tilt and pin it will have on the wall) above the swatches. Desktop shows the Completa card at exactly the wall card's width (the same `clamp`), so the verdict band collapses to its icon exactly when it would on the mural. The preview stays visible, scales down proportionally if it exceeds the available height, and otherwise gives the unused space to the options below. The tabs stay fixed while their contents scroll; the form has its own scroll. Below 700px the preview is the Simples card above the scrollable options and form. Before a game is chosen the card is a ghost: a "?" on the cover and "Nome do jogo" at 40% (`empty`).
- **Cor da cartolina.** Eight small cartolina swatches (36 × 28, with grain and the card shadow) in wheel order under "Cor da cartolina **Amarelo**". The chosen one is pinned with a tachinha (the card's own pin colour, at 60%), turned -7deg and lifted. Radios with the stock names; focus is the yellow ring, since this is the wall. Changing it recolours the preview and the header band at once and counts as an unsaved change.
- **One voice per level.** Each block opens with a marker question (`.pergunta`, 1.5rem): "Qual jogo?", "Como foi?", "Que nota?", "E o veredito?", "O que achou?", in the order a game is thought about. Fields take the printed label (`.rotulo`, Barlow Condensed 800 0.9rem caps). Every inline action is the same marker link (`.acao-caneta`): Trocar, Não lembro / Escolher, tirar (the verdict), the bonus toggle. Blocks are split by the dashed pen rule of the other open cards. The date is one strip (`.tira-data`, about 265px) holding the native date input and, inside it on the right like Trocar in the game strip, "Não lembro"; that swaps the input for the words "Data não definida" and an "Escolher" link, moving focus with it. A new review starts on today, so the old "Usar hoje" link beside the field was dropped: with two links outside the strip the date took about 420px and pushed "Não lembro a data" onto its own line on phones.
- **One selection language:** the sticker sheet (see Choice options). Scores are the one exception, on purpose: a grade is written and circled by the teacher's pen, not stuck on.
- **The game, chosen:** the search strip, filled: the same paper strip with the 40px plastic-covered thumbnail, the name in the field's own type, the year, and "Trocar" at its end; the cover-source switch sits under it.
- **Que nota?** On narrow screens a compact judgment label rides beside the question (the preview has scrolled away); on desktop it is hidden, since the preview shows it.
- **Footer on phones:** one row. The header's X already cancels, so Cancelar hides, and "Salvar pra depois" keeps only its bookmark icon (its name stays for screen readers) beside the full-width ink button. "Salvar pra depois" is drawn as the kiss-cut outline everywhere: the card that has not been stuck yet.
- **Removed:** the starburst, the large chosen-game block with the 116px cover, the boxed weight selects, the old tile pickers.

## Murais (walls pass)

The user asked to turn "Meu mural de JOGOS" into five walls (Jogos, Livros, Filmes, Séries, Animes) behind a click on the word, keeping the whole structure.

- **The word is the switch.** The cartaz reads "Meu mural de *jogos*": "Meu mural" is a link home; the word is a button (the same red brush underline, now global as `.scribble`) with a small 3.2-stroke chevron, `aria-haspopup="menu"`. It opens a notepad slip under the cartaz (paper, serrated bottom like the toast, tilted 1.2deg, drop shadow) with one row per wall: Lucide icon (Gamepad2, BookOpen, Film, Tv, Origami for animes, a paper crane that fits the stationery), the name in Permanent Marker 1.3rem, and the count in Barlow Condensed. The open wall has the red underline. Arrow keys, Home and End move; Esc closes and returns focus; Tab or a click outside closes. The cartaz sits at z-index 20 so the slip covers the filter shelf (5).
- **Swapping is a view transition:** the cards of one wall leave and the other's arrive; filters and the Marcar mode reset.
- **Same furniture, other words.** Each wall's profile (`core/kinds.ts`) supplies the four categories, the three status names (the third keeps the holographic sticker; its icon is the trophy for games and a turning arrow for the others), the date labels ("Lido em", "Visto até"), the amount field (hours or pages), whether the skulls exist (games and books), "Lançado/Publicado/Estreou em", the bonus catalog, and every sentence with grammatical gender ("Nenhuma série", "Qual livro?").
- **Short labels:** Envolvimento and Personagens abbreviate like Jogabilidade (Envolv., Person.) when the boletim cell is narrow.
- **Author:** books show the author under the title in the search list and in the reader ("de Machado de Assis", Kalam 1.15rem).
- **Brazilian book editions (2026-09-30).** Open Library's `lang=pt` does not distinguish Portugal from Brazil. Book lookup also searches `language:por isbn:(97885* OR 97865* OR 85* OR 65*)`, verifies the edition's Brazilian ISBN group, and merges by work ID so the Brazilian title and cover replace the generic Portuguese edition without duplicating the work. The last word is queried as both a whole word and a prefix (`(principe OR principe*)`): a prefix alone bypasses analysis and can miss the full Brazilian title with an accent. If a localized edition has no cover, it stays without one rather than receiving another translation's cover. The general search remains a fallback for missing editions or a failed regional request; either request can succeed independently, and cancellation still stops the lookup. The cover picker also orders Brazilian Portuguese editions before other Portuguese editions and foreign editions, while retaining the person's selected cover.
- **Tab title** follows the wall: "Meu mural de livros", "Ranking · Meu mural de séries"; Ajustes, shared by all walls, is "Ajustes · Meu Mural".

## Wishlist (magazine clippings pass)

- **Recorte de revista.** A wish is a cover cut out of a magazine and glued flat to the wall (short drop shadow that follows the cut, no pin, no tape), never cartolina or a notebook page. Everything is drawn per id (`core/tear.ts`, `core/clipping.ts`), so no two clippings match and each looks the same on every visit.
- **Cuts (8).** Hand tears: `bordas` (all edges), `topo` (a big slanted top tear), `lado`, `canto` (a corner ripped off), `dois` (two sides), each a random walk plus frays. Scissor cuts: `tesoura` (four almost-straight cuts, sometimes with the small step where the scissors stopped), `picote` (pinking shears, about 6px teeth, each tooth a little different) and `destacavel` (a magazine's perforated insert: rounded die-cut corners and the notches the perforation leaves). Torn cuts carry two SVG masks, the paper (`--rasgo`) and the photo (`--rasgo-foto`), so white fibre shows only where it tore; scissor cuts mask only the paper (the photo is cut with it, no fibre).
- **Folded corners.** About 40% of clippings (every scissor cut that used to fold, plus any other cut) have one corner folded, drawn by `foldFor` in `core/tear.ts` with its own random stream so the rest of the clipping does not change: any of the four corners (never the one already ripped off), at a slanted fold line (each leg 78–128% of the size), in three sizes (small 16–24px only for `orelha`, medium 30–42px, large 42–58px). Four styles: `orelha` (folded forward flat: the removed corner, with its real torn or pinked outline, is reflected across the fold line and drawn as the page's reverse, a little greyer than the front, with a short shadow), `curva` (the corner rolled up: the same reflection squashed to 64% toward the fold, with cylinder shading and a higher shadow), `atras` (folded behind: only the straight fold edge shows, catching light) and `vinco` (folded and unfolded: the corner stays, lighter and creased, with a light and a dark line). The reverse carries article text (lines turned with the fold), a colour block from an ad on the other side, or nothing. The fold line always runs from paper edge to paper edge (`chord`), never onto the wall. It is one SVG layer over the paper (`svg.dobra`, 100×100 stretched, non-scaling strokes); the title avoids a folded top corner and moves to the other end over a folded bottom-left corner.
- **Shapes and magazines.** The photo is 3:4, 2:3, 4:5 or square. Three presses: `brilho` (coated paper, 3px halftone and a sheen), `velha` (yellowed paper `#ede2c4`, sepia-faded photo, darker edges) and `reticula` (coarse 4.5px halftone, heavier colour, matte). About half keep a piece of the page: the foot of the article (headline bar, two columns), a side column with a red section bar, or the article's head (red section rule and two headline bars) above the photo.
- **The name, glued on afterwards (4 looks).** `tira`: the hand-torn cream (`#efe6d1`) or kraft (`#c9a472`, always over the light page foot) strip with the name in Kalam 700 brown ink, as the user approved. `manchete`: the name printed on white magazine paper cut with scissors, in Abril Fatface or DM Serif italic, sometimes with a short red section rule. `tarja`: white Barlow Condensed 800 italic caps on a flat black, `red-deep` or yellow (ink letters) band with a 4px halftone, often with a 3px white rim of the page where the scissors passed outside the colour. `resgate`: a ransom note, each word cut from a different magazine (nine paper/ink/face combinations in `CUTOUT_STYLES`, never the same twice in a row), each tilted and nudged; a one-word name of six letters or more is cut into two or three pieces of at least three letters that stay on one line; names over five words or 30 characters never become ransom notes. Manchete and tarja may sit at the top; everything else sits at the foot. Removed at the user's request and never to return: a red pen loop, every QUERO sticker, red/black Dymo tapes, a Permanent Marker kraft strip, washi tape holding the strip, and the year.
- **Collage.** Columns of at least 172px (two on phones), each clipping 82–100% of its column, shifted inside it, with 30–56px below it. `collage()` puts each piece in the currently shortest column in list order (heights estimated from the shape, never measured), so the first row reads left to right and a sort still reads in order.
- **Vontade (relevance) stickers.** Each wish is MUST PLAY (MUST READ on books, MUST WATCH on films, series and animes), Comum (the default, not stored) or LATER, and the list always sorts by it first (MUST, Comum, LATER), the order tabs sorting inside each group. Only the two extremes get a sticker, the kind that comes stuck on a magazine cover, with a white kiss-cut margin and a thin vinyl shadow (`ui/relevance-sticker.ts`): MUST is the red "NOVO!" starburst (20 points, `#f24a3b`→`#c81d16` with halftone and a gloss), "MUST" in small white Barlow caps over the verb in yellow Abril Fatface (`#ffe14a`), turned -9deg; LATER is a matte oval, sun-faded sky blue (`#dce8f0`→`#b9cfe0`, navy `#1f3a5c` italic caps) with a small crescent moon. `stickerFor` puts it on a free corner, half off the paper (never the folded corner, the ripped one or the name's; top corners when the name is at the foot, mostly top right), tilted per id (±15deg, the oval ±9deg, which sits further in). It is the last thing glued on when a clipping lands (a 300ms slap). On the wall the sticker is a button (the one approved extra action on a clipping): it opens a small magazine-white menu, "Quanta vontade?", with the three options as mini stickers (Comum is a plain paper label), the chosen lifted and the others dimmed; Esc or a click outside closes it. A Comum clipping shows an empty dashed sticker spot (the `Sticker` icon) on hover or focus, and always at 60% without a mouse. Changing it moves the clipping in the collage with a view transition, a toast says "“Hades” agora é MUST PLAY", and focus follows the sticker. In the add dialog, "Quanta vontade?" offers the same three stickers between the name and the cover.
- **Page chrome.** The masthead is the word "Wishlist" as a ransom note, eight letters from eight magazines (hand-picked, not drawn). The add button is a coupon: magazine-white paper, dashed cut line inset 5px, scissors on the line (they slide along it on hover), "Recorte aqui" in small red caps over "Adicionar jogo". It sits in the header, where "Nova resenha" is on the other tabs, and N opens it. Under the search strip, divider tabs on the ruler (the global `.prateleira`): Mais novos, Mais antigos, A–Z, and "Sortear" pushed right.
- **Sortear.** Picks a random clipping (never the same twice in a row), scrolls to it and lifts it (scale 1.07, deeper shadow) while the others drop to 32%. A notepad note, serrated on top, fixed at the bottom: "Que tal jogar **Hades**?" with "Começar a resenha" (ink), "Outro" and a close button. Focus moves to "Começar a resenha" and returns to Sortear on close; Esc closes it unless a dialog is open; a live region announces the pick; the page gains bottom room so the note never hides the last row.
- **Empty state.** A large coupon with the same cut line, the heading in Abril Fatface `red-deep`.
- **Add dialog.** A magazine page, not the cream index card: red halftone masthead ("Pôr na wishlist"), white body, a strip of wall on the left with the live clipping ("Vai ficar assim") and, under it, "Outro recorte": a chalk button with a dashed cut line that re-draws the clipping (a new id), which is glued down again. Cover choice (the shared `CoverPicker`, also in the editor) is a grid of printed thumbnails, each with a tiny caps credit under it saying where it came from (Wikipedia, Steam, RAWG, TMDB, Open Library, Kitsu, AniList, Link), like a photo credit in a magazine; the chosen one lifts and tilts with a 3px ink border, the others dim; keyboard focus is a dashed ink ring, so it never reads as the choice. "Colar link de imagem" opens a paper strip for an https link.
- **Tabs.** With five tabs, the Dymo row drops under the poster below 1380px, and tightens below 400px so all five fit at 360px.

## Pra depois (notebook pass)

- **Sheets (5 papers).** Each pending title is a sheet torn off in a hurry and stuck to the wall, drawn per id (`core/notebook.ts`): `espiral` (ruled notebook page with the spiral bites on the left, red margin), `fichario` (binder paper with three real punched holes the wall shows through, double red margin), `quadriculada` (blue graph paper torn from a top spiral), `bloco` (a pale yellow message-pad sheet, grey rules, a strip of red pad glue on top and a finely serrated top edge) and `postit` (yellow, pink, blue, green or orange; it sticks by itself, no tape, with its bottom-right corner lifting off).
- **How it hangs.** Masking tape in the middle (at 30–70% of the width), two pieces across the top corners, or one across the top-left corner; the post-it has none. The cover is glued (-1.5deg), held by a steel paper clip over its top edge (always on post-its), or set in four black photo-album corners. The cover stays desaturated until hover, as before.
- **Date header.** The day the title was saved, in pencil (Kalam 700, tabular) at the top right; on notebook and binder paper after a printed blue "Data" and on a pale printed line. The year shows only when it is not this year.
- **It yellows.** Under a week the sheet is fresh; from 7 to 30 days a warm multiply tint at 11%; after 30 days 22% plus darker edges. The chalk hint under the search explains it ("As mais amarelas estão esperando há mais tempo.") only once some sheet has yellowed. The hit button says how long it waited ("…, guardado há 12 dias").
- **Heading.** A school notebook label: white, 6px die-cut corners, a printed blue double frame (`#3a67b8`), the printed field "Matéria" and "Pra resenhar depois" in Permanent Marker on a dotted line.
- **Shelf.** The same global `.prateleira` as the Wishlist: search strip, chalk hint, and on the ruler Mais novos (by the day saved), Mais antigos, A–Z. The sheets use the same `collage()` columns (at least 168px, 32px apart; two on phones), each 88–100% of its column (post-its 82–90%).
- **Guardar button.** The sibling of the Wishlist coupon: a sheet torn from a spiral notebook (ruled, red margin, spiral bites on the left, shadow by filter), "Anote aqui" in small blue printed caps over "Guardar jogo" in Kalam 700, and a blue `NotebookPen` that "writes" (slides down the rules) on hover. It sits in the header, where "Nova resenha" is on the other tabs (smaller on phones, beside the poster), and N opens it.
- **Add dialog, Pra depois mode.** The Wishlist's dialog opened with `open('draft')`: the masthead is a blue notebook cover (`#3a67b8` with a fine cross-hatch) titled "Guardar pra depois" in Permanent Marker; the live preview is the notebook sheet (`app-draft-card` with `preview`, dated today, 150px); "Outra folha" re-draws it; the submit reads "Guardar na fila" (or "Ver na fila" for a repeat) with the `NotebookPen` icon.
- **Empty state.** A loose notebook sheet taped to the wall; its button now opens the Pra depois dialog.



## Papel da ficha (card customization pass)

The user asked for more ways to personalise a wall card: the paper's texture, marks on the paper and the colour that already existed. A first version (32 small pencil marks placed in measured free space, up to six per card) was rejected as too subtle and too fiddly. The user's direction for the second version, with reference photos of crumpled, torn and scribbled paper and of a cat-pattern stationery sheet:

- one of each, never several; everything present, not subtle;
- scribbles are a whole-card template, not a small drawing in a corner;
- drawings are a repeating themed pattern over the whole card, like printed stationery;
- everything sits behind the card's content, except tears, cuts and folds, which take the content with them; later refined: the damage also passes behind the photo and the stickers (they were glued on afterwards), and eats only the paper and the handwriting. Burn holes should be big.

What shipped (`core/paper.ts` for the catalogue and textures, `core/paper-art.ts` for the drawings, `ui/paper-layer.ts` for the layers, `ui/card-kit.ts` for the editor):

- **Estojo.** Under the live card in the editor's bancada, five divider tabs on an aluminium ruler: **Cor**, **Papel**, **Estampa**, **Rabisco**, **Estrago**. A tab with a choice shows a small dot. Each option is a scrap of the card itself (7:5, in the card's stock, with the option applied, drawn by the same code), lifted and tilted when chosen, its name underlined in hi-vis yellow, with a chalk hint under the grid. Stored as `review.paper`, `review.pattern`, `review.scribble`, `review.damage`; absent means the default (Cartolina, none).
- **Papel (7).** Cartolina, Lisa (no fibre), Canson (heavy watercolour tooth), Linho, Vergê (laid and chain lines), Reciclado (specks and coloured fibres), Glitter (sparkles that light up under the pointer). Much stronger than the first pass; relief textures are grey around 50% with `color-interpolation-filters: sRGB`, so they never shift or bleach a stock.
- **Estampa (12).** Gatinhos (with paws), Caveiras (with bones), Foguinhos, Corações, Estrelas e luas, Fantasminhas, Cogumelos, Flores, Raios, Planetas, Controles, Aranhas. A tile of 4×4 cells: the motif outlined and the motif filled (its eyes and details cut out as holes) alternating in offset rows, a small secondary motif between them, printed tone on tone (black at 13%, multiplied, so the stock darkens instead of greying; 19% read too strong behind the text). Three adjustments sit in a row above the scraps, always present and dimmed on Lisa, so the grid never jumps: **Espaço** (7 steps: Amontoados and Encavalados overlap the drawings by 55% and 30% of their size, then gaps of 4 to 62px, which grow with giant drawings), **Tamanho** (9 steps, 0.6× to 14×: the last, Maiores que a folha, draws each motif over 500px, wider than the full card; from 4× the tile has 2×2 cells instead of 4×4 so it stays a reasonable image) and **Alinhamento** (5 steps, from perfectly aligned to scattered: each drawing rotated, displaced and resized by a seeded amount; drawings that cross the tile edge are repeated on the opposite side so the seam never shows). The classic steps (Normal, Normais, De leve) are not stored; other steps go to `review.patternSpacing`, `patternSize`, `patternJitter`. The pattern layer is positioned from the card's centre with a large motif there, so a giant one shows its body, not a corner. Like the scribble and the damage, each click on a pattern, even the chosen one, draws a new `review.patternSeed`: it picks which large motif sits in the middle and shifts the grid (at most 150px, so a giant never slips off the card) and reseeds the irregularity. The tile's side travels as `--estampa-lado`, and the editor's scraps halve it with `--estampa-zoom`. It is a background layer of the paper (`--estampa`), so the reader's and editor's header band carry it too.
- **Rabisco (7), whole card, pencil, behind the content.** Novelo (overlapping loops of different sizes piled in the middle, with a few stray strokes, like the reference photo), Espirais (three big spirals), Teste de caneta (four coils across the card), Hachura (four back-and-forth shading patches), Riscado (two blocks of hard strike-through zigzag), Contorno (the border traced three times, overshooting the corners; no curls, the user preferred it clean), Tédio na aula (doodles all over: cat, noughts and crosses, stars, tally marks, skull…). Graphite `rgb(36 34 42)` multiplied, 0.8–0.95 opacity times `GRAFITE` 0.5 (the full-strength version was so dark the user found it useless behind the text), through the shared `#papel-lapis` filter. Like the damage, each click on a scribble, even the one already chosen, draws a new `review.scribbleSeed` and redraws it another way.
- **Estrago (10).** Rasgada (a torn corner or a strip removed from any of the four edges, chosen with each roll), Rasgão (a V-shaped tear in from the top or bottom edge, one lip casting a shadow), Remendada (torn top to bottom and taped back with three strips of translucent tape), Orelha (a large dog-ear showing the near-white back of neon cartolina), Dobrada em quatro (two creases and four panels tilted to the light), Amassada (crumpled and flattened: large facets and crease lines over everything, wavy edges), Furada (one large irregular burnt hole, sometimes with a smaller one), Queimada (a corner or the foot burnt away). Both burns use a shared treatment: uneven brown heat staining that fades into the paper, mottled soot granules concentrated near the cut and a broken carbonised edge, with no orange ember outline or triangular scraps. On a corner the staining tapers where the cut meets the card edges. Molhada has soft grey irregular patches with mottled pigment and small satellite droplets, without dark outlines. Café has a thick, translucent mug ring, a spill, splashes and a scatter of tiny drops. Each click on a damage, even on the one already chosen, draws a new `review.damageSeed`, so the person re-rolls until they like the tear; the seed is saved with the card (and so travels in the backup) and the same seed always tears the same way. Older Arrancada and Canto rasgado values migrate to Rasgada on load.
- **Estrago, second batch (12 more, 22 in all).** Costurada (torn across, standing or lying, or a short tear across one corner, never the top-left one hidden behind the photo, and sewn back: cross, zigzag, whip or straight stitches in red, black, white, navy or mustard thread, with the knot at the start and a loose tail; the thread sits over the text and the gap), Colada em pedaços (three or four edge-to-edge tears crossing each other, six to eleven pieces put back in place: gaps that open and close, each stretch of the border slightly out of line with its neighbour, each piece catching the light differently; no glue, by the user's request), Tesoura de picote (the whole border cut with pinking shears, zigzag or wave, restarting slightly out of step at each scissor stroke), Arrancada do caderno (the spiral-notebook fringe on the left or top edge: torn bridges, the inner half of each hole biting the paper, the odd hole intact), Arranhada (two or three sets of long, thin cat scratches that strip the colour to the white core, a claw or two going through), Garras (three or four wide wolf slashes across the card, entering and leaving as scrapes, with torn tongues of paper hanging into the gash), Mordida (a dog bite from an edge, one or two, tooth scallops, canine punctures, tooth dents, faint creases and a dried saliva stain), Traças (silverfish trails, one often entering from an edge and sometimes branching, made of hundreds of tiny bites that strip the colour to a grimy fibre, eaten through in the middle, with frass and loose pinholes), Mofada (a damp tide from one edge, even to its border with no darker rim, mould colonies in green, black, blue-green, olive or fuzzy white, with foxing), Pisada (a sneaker sole much bigger than the card in dry dirt: zigzag forefoot with flex grooves, faint arch, honeycomb heel, patchy where the foot pressed less), Pegadas de gato (a trail of muddy paw prints across the card, fading as the mud runs out, the odd double print) and Fita arrancada (masking tape at two to four corners pulled off, taking the colour with it, wholly or only the outer half torn lengthwise, with the adhesive residue; sometimes one tape is still there and runs onto the wall). Fita arrancada only strips colour, so it has a colour mask but no paper cut and no cut shadow. New shared filters: `papel-fio`, `papel-poeira`, `papel-lama`, `papel-mofo`.
- **Round 4 (2026-09-29).** Rabisco gained an **Opacidade** slider above the scraps (7 steps from Quase sumido to Carregado, multiplying the graphite opacity; Normal is not stored, others go to `review.scribbleInk`; dimmed without a scribble; the scraps follow it). The red stock became pastel (`#ef7d73`, was `#f44f45`) so black handwriting has more contrast.
- **Estampa, second batch (29 more, 41 in all).** Cachorros, Borboletas, Abelhas, Peixes e baleias, Dinossauros, Morcegos, Abóboras, Bruxaria, Olhos, Utensílios de cozinha, Frutas, Doces, Pizza, Café, Pixel, Dados, Naipes, Xadrez, Alienígenas, Chuva, Folhas, Cactos, Armas medievais, Piratas, Ninja, Tatuagens de gangue (nautical star, dagger, sailor swallow, crown), Ferramentas, Robôs, Música. The drawings live in `core/pattern-motifs.ts`. A themed pattern has several drawings (`more`) that take turns across the tile's cells (kitchen: pan, spatula, whisk, wooden spoon); single-drawing patterns keep the exact ids and markup they had. Pixel drawings are traced from bitmaps as one outline (no pixel only touching another at a corner). In the editor the Estampa tab no longer shows scraps of cartolina: each option is a single chalk drawing of the pattern's first motif (the selected one lights up in hi-vis yellow, Lisa is a dashed square), in a compact grid ordered by subject (animals, horror, food, games, sky, nature, adventure, things), so 42 options stay findable.
- **Round 6 (2026-09-29).** The kit lost every description line under the options (the per-option hints and "Clique de novo e ele sai de outro jeito"): the user found them noise. A sixth tab, **Mancha**, splits off what sits on top of the paper instead of changing it: Café, Molhada, Mofada, Traças, Pisada, Pegadas de gato (`review.stain`, `review.stainSeed`). A card can now have a damage and a stain together (torn and coffee-stained). Stains are drawn by the same code and the same seed key as when they were damages, so old cards (whose stain sat in `review.damage`) migrate on load to `stain` with the same seed and look exactly the same. Pegadas de gato may also cut across one corner (never the top-left, behind the photo), like Costurada. Rabiscos Espirais and Teste de caneta were removed (cards that had them lose the scribble). Tatuagens de gangue became old school: the "Cool S" as the lead drawing (line art only), the 8-ball, the three-point crown, the dagger and the nautical star, with three dots between them. New patterns: Mineração (pickaxe, dynamite bundle, gem, mine cart) and Carros (sedan, beetle, race car, chequered flag). The editor can override the final score: under the bonuses, "Dar a nota final na mão" opens a strip like the hours one, prefilled with the average, with "Usar a média" to go back; the typed score (0 to 10, one decimal) goes to `review.finalOverride` and to `scores.final`, the live label says "Nota final", and the reader notes "Nota dada na mão · a média daria X". Bonus contra "Decaiu de qualidade" (id `caiu`) is in every shelf.
- **Round 7 (2026-09-29).** The kit tabs no longer wrap: six equal columns in one row, each a small line icon over the name (drop, sheet, star, squiggle, torn sheet, coffee ring), in two groups on two aluminium rails, the cartolina itself (Cor, Papel, Estampa) and what goes on top of it (Rabisco, Estrago, Mancha). The "chosen" dot moved to the tab's top-right corner. Seven calm scribbles joined the chaotic ones, listed first: Moldura (double rule, corners crossed, carved or with diamonds), Renda (scalloped doily edge with eyelets and a tacking stitch), Recorte aqui (dashed coupon line with scissors, never on the photo's corner), Película (film sprocket bands top and bottom), Régua (ruler ticks and centimetres along the two edges of one corner), Trepadeira (a leafy vine growing from one corner with a small flower) and Bandeirinhas (festa junina bunting in two swags across the top). Order in the kit: frames, then ornaments, then Tédio na aula, Novelo, Hachura, Riscado.
- **Baleada (2026-09-29).** A damage of three to six bullet holes, in a burst (a slightly crooked line right of the photo or below it) or grouped as if aimed at one spot, never behind the photo and never on top of each other. Each hole goes clean through, its rim blown out in thin star cracks that also let the wall through; around it the colour chips off showing the fibre, a grey bullet-wipe ring, a raised bulge (relief) and, on close shots, stippled powder and a faint smoke halo.
- **Round 8 (2026-09-29).** Vergê lost its vertical chain lines (only the laid lines remain). Six new papers: Aquarela (coarse cold-press grain with side light), Feltro (fine directionless fuzz), Papel de arroz (long pale curved fibres over cloudy formation, tiled seamlessly by wrapping the fibres), Ondulado (corrugated-board ridges), Metalizado (brushed streaks with two broad sheen bands) and Perolado (a soft pink, cream, aqua and lilac iridescence with clouds). Kit order: from plain to relief, fibre, then the shiny ones. The Remendada tape became clear durex: almost transparent film with a faint amber tint, straight long edges, serrated dispenser-cut ends (slightly skewed), a diagonal gloss band, a bright rim light on one edge and a darker one on the other, a faint lift shadow and sometimes a small wrinkle; the tear itself is unchanged. A seventh kit tab, **Decoração** (`review.decor`, `review.decorSeed`), holds things from outside put on the finished card, drawn above everything including the photo and the bonus stickers (`core/decor-art.ts`, a layer at z 4 that may pass the card edge): Purpurina (a heap in a corner plus scattered bits, in gold, silver, pink or rainbow, with a few dark flakes and sparkles), Estrelinhas douradas (teacher's foil stars, sometimes a silver one), Adesivos fofos (two or three puffy vinyl stickers with a white die-cut border and gloss: heart, smiley, rainbow, bolt, cloud, cat), Selo (a perforated postage stamp with a tiny picture, a value and a postmark), Clipe (a metal or coloured paper clip on the top or right edge whose back loop shows only outside the paper), Argolas (two or three binder rings through holes near the top edge, sometimes with white reinforcement rings) and Ilhoses (metal eyelets in the four corners). Rings and eyelets punch real holes that join the paper mask. Stickers go in a band near the edges (top-right corner, right side, bottom), never over the photo. The tabs now sit in two groups of 3 and 4 on two real rails (grid items, not pseudo-elements); the Decoração column is 1.4 times wider so its name fits down to 360px.
- **Round 9 (2026-09-29).** Light stocks get a paper accent: on yellow and green (and lightly on blue) soft-light barely changes a channel already at its maximum, so the paper vanished. Those cards (marked `data-cor`) add a second layer in hard-light: a weaker copy of the texture (`accentStyle`, the texture drawn at 30% or 16% over mid grey, outside the frozen `paperStyle`) and a soft copy of the fibre photo (`textures/cartolina-fibra-realce.png`, 45% contrast, 512px). Perolado, glitter and reciclado are left as they were; Lisa gets no fibre. Adesivos fofos come as a single, slightly bigger sticker half the time. Purpurina became fine glitter with brighter sparkles (four-point glints with a halo, half of them twinkling via the `pisca` class, off under reduced motion), and 45% of the time it is spread evenly over the whole card instead of heaped in a corner. Thrown things (Purpurina, Confete) now sit under the photo, the judgment label and the bonus stickers: decorations have an optional `under` layer at z 2. The pin moved to z 5 so it always holds everything, snow included. Twenty new decorations, grouped in the kit: Confete, Néon (a tube frame with a gap and a small neon sign in a second colour), Adesivos gamer (controller, 1UP mushroom, maze ghost, invincibility star, d20, cartridge), Bottons, Corações de vida (a pixel HUD with full, half and empty hearts), Moedas (a reeded stack and loose coins, one spinning), Post-it (right corners only, with pen scribbles), Ingresso (sometimes with the stub torn off), Etiqueta de promoção (a hanging price tag with string over the top edge), Carimbo (ZERADO, GAME OVER, GG, 100%, APROVADO, CLÁSSICO, with eroded ink), Medalha de campeão (1º, ★, GOTY, MVP), Lacre de cera (with an emblem and sometimes a ribbon), Grampos, Alfinete (the lower wire goes in and out of the paper through real holes), Curativo (across a corner or two in an X), Fita de cuidado, Neve (a mound on the top edge, sometimes icicles, and flakes), Pétalas de cerejeira, Teia de aranha (sometimes with its spider) and Beijo de batom.
- **Round 10 (2026-09-29).** Moedas removed (cards that had it lose the decoration). Lacre de cera turns at most about 7° either way, so the emblem reads upright. Fita de cuidado (and the single Curativo) now cross the corner perpendicular to its diagonal, so each tape always runs from one edge to the adjacent one; before, they ran along the diagonal and ended in the middle of the card. Medalha de campeão was redrawn: two rings of satin pleats (colour outside, cream inside), each pleat with its own light and fold, the scalloped outer edge and a shaded rim; in the middle a button covered in the same satin (not gold, which the user disliked) with the prize in cream; two satin tails of different lengths with a sheen band and V-cut ends; a soft shadow. Beijo de batom varies much more: one to three kisses (sometimes a trail near the first), closed, pucker or smiling mouths, stretched differently, nine colours, firm or light presses, sometimes printed on one side only, sometimes a faint double press, always the size of a human mouth. Pétalas de cerejeira come in three ways: a few petals tucked in one corner, a band along one edge (lying at top or bottom, standing at the sides), or the diagonal drift with fewer petals; petals stay inside the card. Estrelinhas douradas became embossed foil stars: each point has two facets lit from the top left, rounded tips, a sheen and sometimes a glint, mostly gold, sometimes silver, red, blue or green.
- **Branco (2026-09-29).** A ninth stock, Branco (`--stock-branco: #f6f1e7`, a warm off-white, never screen white), last in the kit after Cinza; the colour swatches are a row of nine. It gets the strong paper accent like yellow and green. The rotation that colours old cards without a stock (and the pin fallback) stays on the original eight (`ROTATION_STOCKS`), so no existing card changes colour; new cards may draw it.
- **Dark stocks (2026-09-29).** Every stock has a very dark version (`vermelho-escuro` … `cinza-escuro`, and `preto` for white): same OKLCH hue, contained chroma. On 2026-09-30 the dark colours, including black, became 9% darker in perceptual lightness (the coloured versions now have L about 0.31); dark gray keeps its original #403c38. Black (#100f0e) is darker than the wall so the card never melts into it. In the kit they sit in a second row, each under its light one. New cards still draw only from the light stocks (`LIGHT_STOCKS`); the rotation for old cards is unchanged. On a dark stock (`isDarkStock`, CSS `[data-cor$='-escuro'], [data-cor='preto']`):
  - What is written on the paper is in light ink (`--ink-claro: rgb(243 236 224 / 0.8)`, 20% transparent): the wall card and the swatches entirely; on the open sheet (cream paper) only the header stripe. The wall card's main title and score values use solid light ink (`--ink-claro-solido: #f3ece0`), including the score in compact cards; category names, dates and review text keep the transparency. The transparency belongs to the ink color, so the paper and pasted objects keep their opacity. The ordering pen turns coral, or light ink on the red, pink and orange darks. What is pasted on keeps its black ink: judgment label, cover and status band, bonus stickers and tally, the 10 seal, the 0 tape, the pick badge.
  - The pattern prints in white with screen instead of black with multiply (`lightPattern`, `--estampa-clara`); the motif holes stay holes.
  - The scribble is light pencil in its own screen layer (`paper-layer` `dark`); stains and damage stay in the multiply layer, so they read little on dark paper, as on real dark card.
  - Paper textures: soft-light is far too strong on dark (the user found it polluted), so the soft-light texture is dropped (`--textura-escura: none`) and comes back weak in hard-light over mid grey (`--realce-escuro`, 20%), with no extra fibre. None of this touches `paperStyle` or any drawing: frozen prints unchanged.
- **Softer fibre (2026-09-29).** The user found the base cartolina fibre too strong on the light-accent stocks (yellow, green, blue; white shares the rule) and on every dark stock. The accent fibre (`cartolina-fibra-realce.png`) is now at 55% of its old contrast. Dark stocks swap the base fibre for `cartolina-fibra-escura.png` (the same photo at half contrast, 512px, still soft-light) through `--grao-escuro-img`; the procedural grain stays as the fallback until it loads.
- **Texture accent bug (2026-09-29).** The wrapped texture (`accentStyle`) put the texture's data URI inside a single-quoted `href` without escaping the texture's own single quotes, so the whole SVG was invalid and the layer drew nothing. That is why every dark paper looked like plain cartolina, and it means the Round 9 texture accent on the light stocks never showed: what was approved there was the fibre alone. The quotes are now escaped (`%27`); the dead light-stock texture accent (`--realce-forte`, `--realce-leve`) was removed so the light stocks look exactly as before, and only the dark stocks use the wrapped texture.
- **Sangue (2026-09-29).** A new Mancha option: a large irregular pool with tapered splashes emerging from its contour, elongated flying droplets and small satellite drops, based on Molhada's `waterBlobPath` and unchanged `papel-agua` filter. Pools and connected splashes form one opaque silhouette; opacity is applied once to the whole drawing, so overlaps never become redder. Its size follows both card dimensions, including compact cards and editor samples. Blood uses the normal colour layer behind the handwriting so it stays red on coloured and dark stocks. It stores `review.stain = 'sangue'` and its own `review.stainSeed`; clicking again draws another pool.
- **Blood compositions and rounded splashes (2026-09-30).** Each blood seed has a 50% chance of the approved large pool shape, 25% of two smaller pools and 25% of three. A separate seeded draw picks the composition without consuming the large pool's random sequence, preserving its bulk contour. Smaller pools reuse the same contours, splashes and droplets, spread across the card, with one shared opacity for the whole composition. Splash roots now follow the pool contour's tangent on both sides, forming rounded shoulders instead of abrupt triangular joins, as in the user's marked reference.
- **Igreja, grade e computador (2026-10-02).** Moldura gótica is now a triptych portal: four columns (the inner pair thinner) under a tall central pointed arch and a lower one each side. The arches are true two-centred ogives (one circular arc per half, springing vertical from the capital and meeting in a firm point); when a card is too low for that (Simples), the centre falls back to a four-centred arch (10° at the tip, 50° at the shoulder). The centre arch has two archivolts with voussoirs and crockets and a cross at the tip; the side arches carry a knob and a rose window above them, and pinnacles rise from all four columns. Colada em pedaços tears only standing and lying, in a grid (one or two of each, 4 to 9 pieces), with the same per-piece light and edge offsets. New, all frozen: Rabisco Moldura 8 bits (a border of pencil blocks, life hearts top right, two sprites below), Janela do computador (title bar with the three buttons, scrollbar, segmented loading bar, arrow or hourglass cursor), Placa de circuito (trace bundles bending at 45° into pads, one or two chips, vias), Blocos empilhados (falling-block pieces dropped for real into a well, full lines kept one cell short, one piece falling) and Código binário (0/1 columns on both margins, a byte row along the bottom, a `</>` tag). Estampas in a new Computador group: Computador antigo (CRT, floppy, mouse), Janelas e erros, Cursores, Circuitos, Binário and Blocos caindo. Estragos: Glitch (bands slipped sideways leaving notches, RGB tints and fringes, smeared pixels and scan lines printed on the paper, under the writing, the photo and the stickers, as a misprint; a thin slice), Arquivo corrompido (a stepped macroblock hole in a corner, wrong-colour blocks that sometimes streak, rows of bytes and an `ERRO 0x…` line) and Desintegrando em pixels (the right, bottom or corner edge dissolves into squares, the loose ones float off the card in `--stock`). Decorações: Antena de TV (rabbit ears on the top edge, chrome rods passing the card, sometimes steel wool on a tip, flat brown lead down the right side), Filtro de TV de tubo (scanlines, faint phosphor grille, vignette, dark rounded tube edge with the corners outside the round screen darkened too, glass glare and a green OSD channel label in the top-right corner: SEM SINAL, CANAL 4…), Barras de cor (a test-bars sticker), Disquete (3½ disk with metal shutter and a handwritten label) and Janela de erro (a retro error dialog with a playful two-line message, OK button and cursor). Chuvisco (TV static) existed briefly the same day and was removed as too close to the tube filter; its OSD label moved into the filter, and a card that had it loses the decoration. Gosma became nearly opaque (88%, the whole mass at once) and gained a blood variant (`#a3121b`, softer shine, no bubbles): it comes from the same colour draw, a seventh of each colour's slice, so no shape changes. Decorations never animate (the user's rule, 2026-10-02: they are paper): the tube's rolling band is gone and the glitter glints no longer blink.
- **Estampas por assunto e a terceira leva (2026-10-03).** Eighteen new patterns, all frozen: Bolos (two-tier cake with scalloped icing and lit candles, cupcake, slice with a cherry), Festa (balloon, striped party hat, gift), Natal (tree with a rounded star and baubles, striped candy cane, bauble, snowman with top hat and scarf), Casal (heart with an arrow that passes behind it, interlocked rings with a stone, love letter, love lock), Magias (wand with a star and sparkles, spellbook with moon and star, crystal ball on a stand), Poções (round flask, Erlenmeyer, heart-shaped bottle), Portais (oval swirl, hollow stone arch with joints, ringed gate), Armas (pistol, standing bullets, pineapple grenade; crosshair between them), Foguetes (rocket, astronaut helmet, comet), Arco-íris e sol (three arcs disappearing behind two flat-bottomed clouds; a sun with sunglasses and loose rays), Praia (palm tree, shell, starfish), Corujas, Lanchonete (burger, fanned fries, soda, hot dog), Comida japonesa (onigiri, sushi, ramen), Cemitério (R.I.P. stone, cross on a mound, zombie hand), Esportes (football, basketball, trophy), Material escolar (pencil, open notebook, paper plane, ruler) and Carinhas (four faces). Drawings avoid lines crossing inside a shape (pieces touch or keep a small gap), round star tips (`softStar`), and filled dots in `det` carry `class='f'` on each element, not on a group, so the filled motif's holes stay dots. The 66 patterns are now grouped in `PATTERN_GROUPS` (Bichos, Terror, Magia, Festas, Comida, Jogos, Computador, Céu, Natureza, Aventura, Coisas; Bruxaria moved from Terror to Magia, Corações to Festas); `PATTERNS` is their flattening. In the Estampa tab, a single row of chalk subject words sits under the adjustments, on a dark plate that sticks to the top of the panel while scrolling, scrolls sideways when it doesn't fit and fades at the right edge; the active word is underlined in hi-vis yellow and the subject of the card's pattern carries a yellow dot. **Todas** lists every subject with its name above it (Lisa first, alone); a single subject shows Lisa as the first cell of its grid. The tab opens on the subject of the card's pattern (Todas when there is none), and switching subject from deep in the list jumps back to just under the row.
- **A quarta leva (2026-10-03).** The user listed ideas for the kit, ranked them by how many games would use each, and asked for the middle tier (B): 39 items, all frozen. Every one keeps clear of the photo and of the judgment label, which sit above the paper and would hide them: stains go through `freeSpot` (on the full card the lower band, under the lead sentence, or the right margin; on the Simples card the right column or the band between the name and the label), and decorations check `H / W < 0.55` (Simples) to stay off the photo, which there runs the whole height of the left side.
  - **Estragos (10).** Partida ao meio (torn edge to edge, standing or lying under the photo; the second half is the same tear moved and turned around its narrow end, so the gap opens from 2–5 to 14–28 px; both edges show the core, each half catches the light differently), Quebra-cabeça (classic knob-and-socket seams over the whole card in about 70 px pieces, each piece seated at its own angle, one piece missing so the wall shows, never behind the photo or the label, and one lifted piece casting a shadow on its neighbours), Cantos cortados (corner punch: rounded, chamfered, three-scallop fan or concave ticket corners, all four or one or two), Grampos arrancados (pairs of staple holes, in a corner on the diagonal or along the top or right edge, restapled; each hole tears the colour to the core around it, the crown leaves a dent between the pair, sometimes a hole pulled wide, a rust line or a leftover bent leg), Esfarelando (old brittle paper: the whole edge flaking in small bites with bigger chunks near the corners, the core in every bite, an aged brown border coming in from the edge, fine cracks and crumbs in `--stock`, some falling below the card), Desbotada no sol (the colour faded, more on the side the sun came from, except where something covered it: another card over a corner, a frame along the foot or a note that was removed; crisp edge and a faint dust line), Cortada a laser (one to three almost parallel straight kerfs, edge to edge or stopping in a deeper pit, charred lips, an amber heat band and smoke on one side only), Raio (a Lichtenberg figure burnt into the paper: branches that split and thin from a small burnt entry hole, each with a scorched halo; the hole uses the burn mask like Furada and Queimada), Ácido (holes eaten in bubbly scallops, the colour bleached to the core around them with a yellow stain and a brown rim, dried bubbles, the drop that ran down and ate through again, and splash pinholes), Carregou pela metade (an image that stopped loading: grey from a row down, the last row stopped mid-way in 8 px blocks, the last pixels smeared in streaks of the paper colour, a faint block grid and a frozen spinner or progress bar; printed under the writing).
  - **Manchas (7).** Fuligem (dragged sooty fingers, prints, a smoke plume from the foot or the right edge, fine dust), Lata de refri (the thin, sticky can-bottom ring that breaks where the can did not touch, sometimes a second ring, a dried pool with a darker sugar rim and a sticky sheen; cola, guaraná, orange, grape or lemon), Gordura de pizza (the shape of the slice that lay there, tip, sides and crust arc, stronger where the pepperoni was, oil drops and a greasy finger; the paper multiplied by its own colour plus some orange, which reads as oil-soaked, almost see-through card), Cera de vela (drips from a candle on the right, each one wide at the top, thinning as it runs and stopping in a bead, hardened in relief with side light and a gloss highlight, plus round splashes; ivory, red, black, purple or white; drawn in the top layer, over everything, like Gosma), Graxa (black mechanic prints with an oil halo, a dragged thumb with skin ridges, sometimes the stamp of an open-end wrench), Lama respingada (mud thrown up from a puddle below: dense along the foot, thinning upward, drops stretched away from the splash, the big ones running back down), Marca de pneu (a car tyre track across the lower half or down the right side, shoulder blocks and chevrons, or a thin knobby bike track, in patchy rubber dust).
  - **Rabiscos (8).** Ossada (bones end to end around the card, now and then crossed, a skull in each corner), Chamas (one continuous row of hot-rod flames rising from the foot, hooked tips all leaning the same way, the inner flame row and loose sparks), Linhas de ação (manga focus lines: tapered pencil wedges from the edges to a clear centre; sometimes horizontal speed lines from one side), Corrente (face and edge-on links alternating along the four sides, a ring in each corner), Nó celta (a two-strand plait between two rules, over and under at every crossing, a triquetra in each corner), Apaixonado (a big heart with an arrow and the initials "A + B", small hearts in the margins, an "S2"), Partitura (two hand-ruled staves with a treble clef, 4/4, notes, beamed eighths, rests and bar lines, a final double bar, and loose notes floating by the right edge), Contagem na parede (tally groups of five along the top, the foot and down the right side, the last one unfinished).
  - **Decorações (14).** Cogumelos (amanitas, small brown mushrooms or bell caps growing from the foot with moss and grass, or bracket fungi stacked on the right edge), Cristais (a druse of six-sided crystals fanning out of a dark rock in a corner or at the foot, light, mid and shadow faces, faceted tips and a glint; amethyst, quartz, emerald, ruby, aquamarine or citrine), Silver tape (pieces taping the card to the wall across the right corners, and the bottom-left on the full card: cloth weave, torn ends with threads, wrinkles, the small step where the tape leaves the card), Rotuladora (one embossed label-maker strip with white raised letters, straight or chamfered ends, under the verdict on the right; standing along the right edge on the Simples card), Prendedor de papel (a binder clip biting the top or right edge, one handle up and one folded, or both up), Pregador de roupa (one or two clothespins on the top edge, natural, painted or plastic, with grain and spring), Parafusos (four or two corner screws, slotted, Phillips or hex, with creases where the paper sank), Lápis (a hexagonal pencil lying across the lower part, with ferrule, eraser, sharpened tip and a soft cast shadow, sometimes an eraser and crumbs; along the foot on the Simples card), Cantoneiras (worked metal corner guards with a pierced ornament, rivets and a bevel; smaller on the photo's corner), Etiqueta de locadora (the rental shop sticker: store band, cartridge number, a "devolver até" date in pen, a round badge, sometimes a barcode and a lifted corner; at the foot on the right of the full card, where at the top it would cover the name, and anywhere in the right column of the Simples card), Joias incrustadas (round, oval or emerald-cut stones in gold or silver bezels with prongs at three corners, sometimes a bigger one at the foot, sometimes filigree; on the Simples card only the two right corners), Laço de presente (a satin ribbon across a right corner, or the bottom-left on the full card, and a bow with two loops and V-cut tails), Pena (crow, dove, hawk, macaw or peacock feather, standing along the right edge or lying low on the card, with clipped barbs, split gaps, down and a cast shadow), Morcego pendurado (one or two bats sleeping upside down from the right end of the top edge, clear of the name).
  - **Kit icons.** Each item has its chalk icon in `kit-icons.ts`, in the same stroke language as the others; the lists in `paper.ts` keep the kit order by family.
  - **Stored values** (`review.damage`, `review.stain`, `review.scribble`, `review.decor`): `partido`, `quebracabeca`, `cantos`, `desgrampeado`, `esfarelado`, `desbotado`, `laser`, `raio`, `acido`, `carregando`; `fuligem`, `refri`, `pizza`, `cera`, `graxa`, `lama`, `pneu`; `ossada`, `chamas`, `acao`, `corrente`, `celta`, `apaixonado`, `partitura`, `contagem`; `cogumelos`, `cristais`, `silvertape`, `rotuladora`, `prendedor`, `pregador`, `parafusos`, `lapis`, `cantoneiras`, `locadora`, `joias`, `laco`, `pena`, `morcego`.
  - **Build budget.** The 39 drawings add about 95 kB to the initial bundle (24 kB gzipped), which crossed the 1 MB error budget and would have stopped the Pages deploy; `angular.json` now errors at 1.5 MB (the 600 kB warning was already exceeded before this pass).
  - **Removed (2026-10-05).** Cera de vela (Mancha), Cogumelos and Cristais (Decorações) left the kit at the user's request. A card that had one loses it (`sanitizeStain` / `sanitizeDecor` drop the stored `cera`, `cogumelos` or `cristais`), and their drawings, kit icons, frozen prints and the Cera de vela test are gone; the `smooth` helper in `decor-art.ts`, used only by the crystals' rock, went with them. Nothing else changed: every other frozen print is identical. The Cogumelos pattern (Estampa) and Lacre de cera are separate items and stay.
- **Frozen looks.** Once a pattern, scribble, damage, paper, wishlist clipping or Pra depois sheet has been seen and approved, it must never change as a side effect of other work (the user's rule, 2026-09-29). `core/frozen-looks.ts` fingerprints every drawn result for several seeds, ids and sizes; `frozen-looks.spec.ts` compares them with `frozen-looks.data.ts`, and `ui/paper-layer.spec.ts` does the same for each shared SVG filter. Changing one item on purpose means regenerating only its prefix with `node scripts/freeze-looks.mjs damage:<name>` (the script never rewrites existing prints otherwise, and stops if it cannot read the file). A new item is appended to the lists and frozen once built. Never change the random draws of an existing item: add new code paths, new filters with new ids.
- **Layers and legibility.** The card itself has no background: the paper is the bottom layer of `app-paper-art` (z −2), then stains and scribbles (multiply, z −1), then the content; relief (overlay, 85%) and the physical damage (fibre along tears, char, tape, the dog-ear flap) at z 2; the photo, the judgment label and the bonus stickers at z 3, always whole. A cut is a mask (an SVG with an inner `<mask>`, since CSS masks read alpha, not luminance) applied to the paper layer, every art layer and each text element marked `data-queima` (name, date line, lead sentence, boletim), each offset to where it sits on the card. So the wall shows through holes and tears, the handwriting there is gone, and the photo or a sticker over a hole stays, floating. When a damage removes paper, the card's box shadow becomes a `drop-shadow` that follows the cut.

## Capa carregando (loading pass)

The user asked that every tab with cover choice make it clearer when an image is still loading and has not appeared.

- **One treatment everywhere** (`.carregando-capa`, global): a cover with an address that has not arrived shows blank photo paper with a light sweep passing, a small spinning ring and the word CARREGANDO in label caps. Dark on the plastic sleeves (wall cards, reader, editor preview, Pra depois sheets, the thumbs in search and in the filled search strip) and on the magazine clippings; light (`.clara`) on the cover picker's paper. 40px thumbs keep only the sweep and the ring (`.miuda`). When the photo arrives it appears developing: from sepia and blur to sharp in 560ms (`img.revelada`). With reduced motion the sweep and ring stop and the word stays.
- **Cover picker.** Each photo still loading shows the treatment; the places of photos still being searched say PROCURANDO under a dashed outline. A visible line under the grid says what is still happening: "Procurando mais capas na Wikipedia e na RAWG…" (the catalogs that have not answered yet, reported by `GameLookup.coverChoices`), then "Carregando 3 fotos…", then nothing. It is a status region, so screen readers hear it too.
- **Per URL.** Sleeves, clippings and the picker remember which address loaded and which failed, so changing the cover restarts the loading state instead of showing a black box or the old failure.

## Caderno de perguntas (comparison redesign)

The user found the first comparison a paginated list of card pairs that compared nothing of taste, and asked for a page that is fun to use: import a friend's backup, compare top games, colours, verdicts, and see the same cards side by side.

- **Two pens.** On this page the owner writes in black and the colleague in blue ballpoint (`--caneta-azul` `#1f3fb0`, 8:1 on the notebook paper). It is a different tool, so it is allowed by the One Ink Rule, and it is the only way the page tells the two apart: name tags, answers, dots, tallies, the difference note and the Nota a nota columns. Red stays the teacher's correction (the affinity percentage, its circle on the ruler, the verdict each one stamps most).
- **Envelope.** First use is a kraft envelope (`#c9a472`, flap `#b98f5c`) pinned by its flap, a ruled letter in blue pen peeking out, a perforated stamp and a postmark. Dropping a file raises the letter and lifts the envelope; errors come as a paper note on it. Beside it, a ruled note says how to ask for a backup.
- **Name tags.** "OLÁ, EU SOU" vinyl stickers: printed band (ink for Você, blue for the colleague), name in marker, a sheen. The colleague's name is edited on the tag itself. Other colleagues are small tags; the colleague's own wall page wears a large tag ("O mural de").
- **Caderno.** A spiral notebook opened in two pages (one column below 1100px), taped to the wall. Each question in marker, each answer on its own blue rule (no page-wide ruling: the answers sit on their lines). Answers use real data forms drawn as school marks: a translucent school ruler with a red pen circle (drawn once, 900ms), a dot strip of every final score with dashed average ticks, cartolina strips sized by use, tally marks in groups of five (a number above 20), bonus stickers, cover thumbs in sleeves.
- **Pairs.** The owner's card left, the colleague's right, a torn notepad scrap in the middle with "+3 pra você" in the pen of whoever scored higher; sticky mini tags head the two columns. On phones the note sits above two compact cards.

## Data em três partes (date pass)

The user asked for the completion date as day, month and year boxes, each optional. One paper strip holds three cells like a printed form (tiny DIA / MÊS / ANO captions, marker slashes between them): day and year are numeric text, the month a native list of month names. "Hoje" and "Não lembro" are pen links on the label row. A Kalam line under the strip reads back what will be saved, turns to bold ink with the problem while it is incomplete, and to `error-ink` after a save attempt (the strip border too). `AAAA-MM` joins `AAAA` and `AAAA-MM-DD` as a stored date.

## Seis abas (header pass)

With Comparar the header had six tabs and was pushed to a second row at every width. Ajustes became an icon-only Dymo tape (gear); the tabs are back in one row between the cartaz and the add button from 1230px, with a tighter cartaz (1.62rem) and tapes (11px padding, 0.09em tracking) under 1480px. Phones keep all six on one row (no count on the Mural tape under 400px).

## Ajustes em fichas (settings pass)

The settings page was three equal cartolinas in an auto-fit grid: a hole opened under Backup, the restore mode sat below the restore button (the file was chosen before the mode), and each key was a paragraph of instructions with no sign of whether it was saved.

- **Head.** Like Lado a lado and Comparar: the `tape-label big` "Ajustes", with a printed line beside it, "Vale na hora e fica salvo neste navegador" (nothing on the page has a save button).
- **Layout.** From 960px, two columns: Backup (azul) over Mural (verde) on the left, and Busca e capas (lilás, formerly "Catálogos") spanning both rows on the right, so no card leaves a hole. Below 960px, one column in that order. Max width 1160px.
- **Choices.** Every radio on the page is the editor's cartela sticker (`.opcao` with `.recorte` / `.colado`): a fixed-width sticker (8.4em, 7.4em on phones) in Barlow Condensed caps, with what the option does written beside it in Barlow. The chosen one is a paper sticker stuck at -2deg (1.6deg for the second option) with the label drop; the other is the dashed perforation. The disabled RAWG option fades its sticker and says "Cole a chave acima para usar".
- **Backup.** A paper status note says when the last backup was and what the file carries ("O arquivo leva 12 resenhas, 3 pra depois e 5 na wishlist."). It takes CircleCheck normally, and TriangleAlert with a 2px ink outline and "Hora de baixar outro." when there is something to keep and no backup, or the last one is 30 days old or more. Then "Baixar backup" (disabled only when reviews, pra depois and wishlist are all empty), the storage warning as a quiet note with ShieldAlert, and the "Restaurar um backup" block: the question "O que fazer com o que já está aqui?" (Juntar / Substituir, each with its consequence) first, then the file button, whose label follows the choice ("Escolher arquivo e juntar" / "e substituir").
- **Mural.** The Etiquetas dos grupos choice, plus a strip of eucatex (`.parede`) with two tiny groups of cartolina chips under tape labels ("Março", "Fevereiro"). Hidden, the tapes go and the groups close up to the chips' own gap, as on the wall.
- **Busca e capas.** A printed table, "De onde vem a busca agora": each wall's icon and name, then its source in label caps with the qualifier at `ink-2` ("Wikipedia em inglês", "TMDB em português", "RAWG com capa da Steam"); it follows the keys and the games source live. Each key is its own block under a dashed rule: a marker title, a status seal on the right (a dashed "Sem chave", or a paper "Chave salva" sticker with a check), one bold line of what the key gives, numbered steps, and the field with a clear button (X, which puts focus back in the field) and the show/hide toggle (`aria-pressed`). The TMDB attribution line stays under its field.

## Só capa e nome (density pass)

The user asked for a third, even leaner density, to see as many cards as possible. The wall's density tabs gained a third icon tab (Grid3x3, "Só capa e nome") after Completa (Rows3) and Simples (LayoutGrid), stored as `density: 'capas'` with the other view preferences.

- **Card.** The same ficha (cartolina, stock, tilt, pin, paper art), turned upright: the photo under contact plastic fills the width, and the name is written under it in marker as a caption (1rem, 0.9rem on phones, centred, two lines at most and always two lines tall, so rows stay level). No date, no label, no bonuses, no boletim, and no status band on the photo. Padding `18px 9px 9px`, so the tachinha pierces the cartolina above the photo; the drop offset is 40%. The marking sticker shrinks to 34px.
- **Wall.** Card width `clamp(116px, (page - 7 × 22px) / 8, 156px)`: eight per row on a wide screen, with 22px columns and 26px rows. Sections keep their tape labels; with Etiquetas hidden it is one continuous grid. Below 560px, three per row (12px columns, 22px rows), one grid when the labels are hidden. The search strip on phones leaves room for three density tabs.
- **Elsewhere.** The colleague's wall offers the same three. Lado a lado and Comparar have only Completa and Simples; with Capas chosen they show full cards, and the Completa tab reads as pressed.
## Cartela de filtros (filter pass)

The user asked for more filters (a review without text, status, verdict, decoration), prettier filters, and fixed contrast in the dropdowns (grey list, black text).

- **Filtrar.** One divider tab on the ruler (lucide list-filter icon) replaces the verdict tabs and the "Mostrar" select. `aria-expanded`; open, it turns hi-vis yellow and raised like any pressed tab. With filters on, it carries their count on the ink disc with a yellow numeral (the marked-card pairing). Opened from the keyboard, focus goes to the first sticker; Esc inside the sheet or "Pronto" closes it and returns focus to the tab (the Esc does not also end Marcar).
- **The sheet.** A `cartela` sticker sheet held under the ruler by two pieces of masking tape, full page width, non-modal: the wall moves down. It drops from behind the ruler on the physical curve (clip and 14px) and leaves in 140ms (`animate.enter` / `animate.leave`). Groups, each a printed `.rotulo` with a Kalam "limpar" link while it has choices: Veredito (the five plus "Sem veredito" only when some review lacks one), Status (the wall's three names), Resenha (Com texto / Sem texto), Visual da ficha (Com decoração / Sem decoração: pattern, scribble, stain, damage or decor; colour and paper do not count), Média (the section bands 9+, 8, 7, 6, 5, <5, as italic condensed numerals), Dificuldade (only on walls that have it; Nenhuma, then the skull rows) and Ano (years present, newest first, then Sem data). Wide: three columns, Veredito and Status beside Resenha stacked over Visual, then Média, Dificuldade, Ano; two columns at 1180px and below; one at 640px and below.
- **Stickers.** The editor's selection language: an unchosen option is the kiss-cut outline (`.recorte`); a chosen one is stuck (`.colado`, alternating tilts). Chosen Veredito is the card's black band (lit icon; Masterpiece in gold foil), chosen Status is the real status label (Platinado holographic), every other chosen option is a solid ink sticker with paper lettering. Recorte and colado share metrics (34px), so nothing moves when one is chosen. The number beside each sticker is how many cards it would show with the other groups as they are; an option that would show none fades to 40% and is disabled (never hidden, so the sheet keeps its shape).
- **Logic.** Within a group any chosen option matches; across groups all must. Counts and results respect the search. Filters live for the visit, like the search, and clear when the wall changes. Model: `core/wall-filter.ts` (pure), state in `WallView.filter`.
- **Footer.** Sticky at the bottom of the sheet: "Mostrando 12 de 24 jogos" in Kalam (live region), "Limpar tudo" (marker link) and "Pronto" (ink button, yellow marker).
- **Tags on the wall.** Under the ruler, "Mostrando N de M", then each active filter as a small paper sticker stuck on the wall (alternating tilts) with its own X ("Masterpiece", "Média na casa do 8", "Dificuldade infernal", "Em 2024", "Sem texto"), then "Limpar filtro" / "Limpar tudo".
- **Colleague's wall.** Same tab, sheet and tags over the colleague's cards.
- **Native lists.** Every `<select>` list opens as paper with ink (`option, optgroup` in `paper` / `ink`), and the invisible select of a select tab is `color-scheme: light`: with the wall's dark scheme, Windows drew the list grey with the tab's black text.
