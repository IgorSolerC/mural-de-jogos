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
**The One Ink Rule.** Every piece of readable text on a paper surface is marker black (`ink` or `ink-2`). The six stocks change the paper, never the ink. The exceptions are all marks made by a different tool, and each sits on white paper or on its own printed ink: the Média numeral of 9 or more on the starburst and the Ranking (`red-deep`; on the card's label a Média of 9 or more is ink on holographic foil instead), a score below 2 (`nota-vermelha`, always on its own black: the torn Média sticker or a piece of black tape, see "Notas nos extremos"), the chosen score numeral (`red-deep`), the verdict stamps in their own five inks (reader and verdict picker), paper lettering on the card's black verdict band (the band is its own printed ink surface, not a neon stock), and the status labels' printed inks. No coloured text ever sits directly on a neon stock.

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
**The Three Tools Rule.** Each typeface stands for one tool on the desk: the marker (Permanent Marker), the pen (Kalam), and the label printer (Barlow Condensed). Choose the face by who "wrote" the text, never for variety. Barlow is only for text that is interface, not artifact.

**The Label Numeral Rule.** The Média is the one score printed rather than written, and it is always the Barlow Condensed 800 italic numeral. On a wall card it is printed on the paper half of the two-part label (a 2.9rem integer with a smaller ",decimal" aligned to its foot; 3.7rem + 2.4rem on the reader's big label); in the editor it is the label on the live preview card (and, on narrow screens, a compact label beside "Que nota?"). Every other score is a smaller Permanent Marker numeral. The Média is always the largest number on its surface, and it keeps its paper except at the extremes the user asked for: holographic foil from 9, a torn black sticker below 4.

**The Tracked Caps Are Printed Rule.** Uppercase with letter-spacing is only for printed matter: tabs, labels, meta lines, and the labels naming control groups. It never sits above a heading as a decorative kicker.

## Layout

The app shell is centred with a maximum width of 1480px, a side gutter of `clamp(16px, 4vw, 48px)`, 28px of top padding and 120px of bottom padding. It is split into four pages (hash routes, so it deploys to any static host): **Mural** (`/`), **Pra depois** (`/fila`), **Ranking** (`/ranking`) and **Ajustes** (`/ajustes`). Every page shares one header row: the compact cartaz on the left (a link home), the section tabs, and the blank-card stack on the right. The editor and the reader stay as sheets owned by the shell, so any page can open them.

The Mural page holds only the toolbar and the wall. The toolbar has two rows. The top row holds only the taped search strip (max 440px), just above the ruler. The bottom row stands on the ruler: the verdict filter tabs on the left and, pushed to the right end, a single "Ordenar" select tab with the direction toggle and the two density icon tabs, so every divider tab stands on the ruler and none floats. The verdict tabs are: Todos, Masterpiece, Recomendo, Legalzinho, Meh, Chato, and "Sem veredito" only while some review has no verdict, each with its tabular count. The verdict filter replaced the old status filter (Incompleto / Finalizado / Platinado); status is still a sort. At 1240px and below, where the tabs and Ordenar no longer share the ruler row, the tabs fold into a "Mostrar" select tab. The search strip is the shared `app-search-strip` component (paper, two tape pieces, red caret, clear button, `/` hint); the Pra depois page uses the same strip to filter the queue by name, with the same "Mostrando N de M · Limpar busca" line and a Kalam note when nothing matches. `/` focuses whichever strip the open page has (`input[data-busca]`).

The wall is split into sections that follow the sort (see "Wall in sections" below). Sections flow side by side in a wrapping row: 64px between rows, and between neighbouring sections the same column gap as between two cards inside a section (34px Completa, 30px Simples), so every card on the wall falls on one column grid and three one-game months fill a row like a three-game month. It was 76px at first, which made three single-card sections 84px too wide and pushed the third to the next row (the user asked for this fixed). The tape label over each section is what separates the groups, and a long label wraps instead of widening its section (the head takes the width of the cards). Inside a section, cards wrap at a fixed width, each only as tall as its own content (rows align at the top and are never stretched to the tallest card):
- **Completa:** `clamp(330px, calc((100vw - 2 × gutter - 84px) / 3), 424px)`, so three cards fill the wall width; 44px row and 34px column gaps.
- **Simples:** `--simples-w`, as many cards per row as fit at 320px or more (the Masterpiece label beside the photo needs it), stretched to fill the page: four up to 340px from a 1486px viewport (a Full HD monitor at 100% or 125%), three up to 440px from 1136px, two up to 460px from 750px, then one. The page width is `min(100vw - 20px, 1480px)` minus both gutters, the 20px left for the scrollbar; 34px row and 30px column gaps.

Each card also drops 0–14px from the top of its cell (from its id), so rows never line up perfectly.

Responsive behaviour:
- **1024px and up:** the editor sheet widens to 1180px: the bancada (a wall patch with the live card, sticky) on the left, as wide as a wall card plus 56px, and the form on the right (see "Ficha em branco").
- **1100px and below:** the section tabs drop to their own row under the cartaz and the stack.
- **720px and below:** the cartaz shrinks to a two-line 1.5rem logo; the four section tabs share one row; the toolbar becomes two rows: search plus density icons, then a "Mostrar" select tab and the "Ordenar" select tab with the direction toggle. The `/` hint hides.
- **600px and below:** the reader keeps the wall card's phone layout: a 112px photo beside the name and date (title 1.62rem), and the judgment label with the skulls on the full-width row below.
- **559px and below:** sections stack 48px apart, and each section is one column of full-width horizontal cards, 34px apart. Cards keep their whole anatomy (lead sentence and boletim included), with half the tilt, 40% of the drop, a 104px cover, and (Completa) the judgment label moved to the full-width row under the head. Simples keeps its strip layout with a 1.2rem title.
- **440px and below:** the primary button reads "Nova" (the full name stays as its accessible label).
- **420px and below:** score-picker cells shrink to 36px (44px for big pickers); the difficulty options wrap to 3 columns.

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
- **Cartolina button (primary):** a blank white index card (`paper`) with paper grain, marker lettering, a 2px radius, the hanging-card shadow, and a 48px minimum height. On hover it tilts -1.2deg, rises 2px and takes the lifted shadow over 380ms on the physical curve. On press it sinks 1px. In the header it is the top card of the **blank-card stack**: a rosa sheet behind it at 5deg and an azul one at -4deg, only their edges showing, which fan out further on hover (9deg / -8deg). Label: "Nova resenha", with a plus icon.
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
  - **Judgment label:** a two-part sticker label (see Shapes), 58px tall (42px Simples), 14px under the words (8px Simples), counter-tilted at -0.5 × tilt - 1deg, with the label drop. Both halves share the height, so the Média and the verdict weigh the same. Left, the **grade**: flat `paper`, at least 76px wide (56px Simples), padding `4px 14px 3px 13px` (`3px 10px 2px 9px` Simples), the Média in the grade numeral (`ink`, never red at the top: 9 or more turns the grade into holographic foil, below 4 (3,9 and down) the grade becomes a black sticker with its outer corner ripped off and the numeral in `nota-vermelha`; see "Nota 10" and "Notas nos extremos"), exposed as the image "Média X de 10". Right, only when a verdict exists, the **band**: solid `ticket-ink` black, the verdict name in `paper` verdict-band lettering after its lucide icon (19px, 7px gap; 16px and 5px on Simples), padding `0 18px 0 17px` (`0 11px 0 10px` Simples, 0.84rem at 0.08em), exposed as the image "Veredito: X". The icon takes the verdict's lightened ink (`verdict-*-lit`). The Masterpiece band has gold-foil lettering and a gold hairline frame, and it takes the same white shine sweep as the Platinado foil when the card lifts (`--shine`, 900ms). **When the word does not fit** (the user asked for this on narrow windows), the band shows only its icon (padding `0 20px 0 19px`, `0 14px 0 13px` Simples, a little wider than the full band's so the lone icon does not look pinched), and the icon grows to 24px (20px Simples). On wall cards the label takes `fit`: it spans its grid column (`transform-origin: 90px 50%`, so it still turns around itself), measures its full width with the word showing, and compares it with the column on every resize and when fonts load. The hidden word stays in place, absolutely positioned and invisible, so the label can be remeasured and grow back. The accessible name is still "Veredito: X". The reader never uses `fit`.
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
- **Choice options (status, difficulty, verdict):** a sticker sheet, like the bonus cartela. An unchosen option is the kiss-cut outline still on the sheet (`.recorte`: 1.5px dashed ink at 42%, ink at 74%, no fill, no shadow; hover darkens both and tints 6%). The chosen one is the real object, stuck on (`.colado`: tilted, scale 1.04, a small drop, and 380ms on the physical curve from straight). Status sticks the real status label (Platinado in foil); difficulty sticks a paper label with a 1.5px ink hairline and the skulls; the verdict sticks the card's black band (paper word, lit icon; Masterpiece with gold-foil word and frame). Outline and sticker share their metrics, so nothing moves when one is chosen. Keyboard focus: a 3px ink outline around the option.
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
- **Stamp (Nota a nota; formerly also the reader):** a stamped sticker: paper-white fill at 94%, a 2.5px ink border plus a 1px outline at 2px offset (double frame), 0.86rem (1.05rem big), icon 15px (20px big), rotated -9deg (-5deg in the reader block), with a small drop shadow.
- **On wall cards** the verdict is not a stamp: it is the black ink band on the right half of the judgment label (see Review card).

In the editor the verdict is no longer a stamp: the chosen one is the black band it will be on the card (see Choice options).

### Tachinha (pin)
A 26px plastic pushpin seen from above: a wide base with an outer ring, a raised head with a specular dot, colour mixed with black at 38% for the shaded side, and the pin cast shadow. It is always `aria-hidden`. When `tachinhas.png` loads, it becomes a 32px frame from a 192×32 sprite of 6 pins, indexed in the order of the pin palette.

### Contact plastic (cover)
The game's photo covered in clear contact plastic, like a school book (5px of film around the photo, 2px on thumbnails), over a 4:5 frame. Covers are `object-fit: cover`, focused at 50% 20%. With no cover, the frame shows diagonal stripes on near-black, a large marker initial in the card's stock colour, and the note "sem capa". A `decorative` input drops the alt text and the "Sem capa para …" image role where the surrounding object already names the game (wall cards); elsewhere the cover is announced as "Capa de …". On wall cards the photo is glued flat to the card, with no tape, and nothing is placed over it except the status tape.

### Difficulty skulls
0–4 skull icons in ink, from Nenhuma to Impossível. The reader and picker show the empty slots at 22% opacity, plus the level name. Wall cards do not show them.

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
One physical curve, `cubic-bezier(0.16, 1, 0.3, 1)` at 380ms, is used for anything that moves like an object: card swing, lift, the stack fanning, sheet entry, the sub-tab-group entry, the toast note sliding in, and View Transition reshuffles when sorting, filtering, deleting or restoring (each card has its own `view-transition-name`; the root cross-fade takes 120ms). UI feedback (colours, tints, tab rise) uses `cubic-bezier(0.2, 0.7, 0.2, 1)` at 160ms. The ambient loops are the grade foils drifting under the light (5.2s, sine ease, alternate; see "Nota 10"). When a card lifts under a mouse (and over the open reader), the foils also catch the lamp: `Luz` writes the pointer position, and the glare and hue follow it (see "Nota 10"). Reduced motion clamps every animation and transition to 1ms and switches scroll-into-view to instant.

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
- **Cover source.** Under the chosen game in the editor, a text-only switch "Capa · Wikipedia · RAWG" in condensed caps: the current source is ink with a red underline; RAWG is disabled (45%) without a key, with a tooltip pointing to Ajustes; a 12px spinner shows while the other source is searched. The default source is a radio pair in Ajustes.
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
- **Pra depois page.** The torn notebook pages live on their own page under a masking-tape heading, in a grid of `minmax(168px, 1fr)` (pages up to 200px wide). Empty state: a loose notebook sheet taped to the wall explaining "Salvar pra depois". Saving a draft from another page shows a toast with "Ver fila"; finishing a draft goes to the Mural and plays the landing.
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
- **Boletim.** The wall card's four fixed cells, larger: 2px rules, 1rem labels in sentence case, 2.1rem marker numerals (0.86rem / 1.7rem at 600px and below), 17px weight arrows with the weight name as a tooltip, and the struck "Não tem" cell. The hatched bars are gone (the user left it to the design).
- **Text.** Unchanged: Kalam on the blue ruled lines, max 68ch, under the boletim.
- **Removed from the reader:** the paper starburst, the verdict stamp, the status sticker, the bars.

## Nota 10 (foil pass)

The user wanted every 10 to shine, on the wall card (Completa and Simples) and in the reader. A first try (a gold-foil star behind each boletim 10 with four-point sparkles blinking around it) was rejected as ugly: gold on rosa and laranja had no contrast, and three objects per score crowded the boletim. Of three directions offered (gold on ink, holographic, red pen only) the user chose **holographic**.

- **One material, one object.** A 10 is a **holographic nota-máxima sticker**: the Platinado foil (`--holo-foil`, `holografico.png` with the diffraction-line fallback) under a thinner milky varnish, with the white inner edge of the Platinado stamp. The shared class is `.foil-nota` in `styles.scss`: the foil lives on an oversized `::before` and the edge and the `--shine` sweep on `::after`, both behind the numeral.
- **Alive foil.** The foil layer drifts 100px sideways and back (5.2s, `cubic-bezier(0.45, 0, 0.55, 1)`, alternate), so the rainbow and glitter move like a sticker tilted under the tube. Boletim cells stagger it by -1.3s each so a row of 10s never pulses in unison. On lift the same `--shine` sweep as Platinado and Masterpiece crosses it. Reduced motion leaves it still.
- **Ink stays the judgement.** The numeral on the foil is always `ink` (not `red-deep`, which goes muddy on the spectrum) with a 1px white emboss. The Média grade has no edge of its own: the user removed the ink outline, so the label drop and the black band carry it. On the boletim and meta stickers, the user set the edge: no border, a 12px radius (a rounded pill) and the drop shadow `0.5px 1.5px 3px rgb(0 0 0 / 51%)` (`--sombra`).
- **Where.** The Média grade (varnish 16%; the label's size and notches are unchanged). Each boletim cell with a 10: a small sticker around the marker numeral (varnish 22%, padding `0.04em 0.26em 0`, at least 1.4em wide), stuck at -2.5deg, or 1.8deg on even cells. The sorted score beside the date on Simples cards ("Diversão 10"): the same sticker at 16px tall, -2deg.
- **Platinado and a 10 share the foil on purpose** (the user chose it): both mean "all of it". They are told apart by the object. Platinado is status tape across the photo, and a 10 is a numeral sticker on the card.
- **The foil catches the lamp** (extremes rework). At rest nothing is added, so the card is no busier. When a card lifts under a mouse, or the pointer is over the open reader, every holographic foil on it (the Média grade, the 10 stickers, the Platinado tape) behaves like a holo sticker tilted under the tube: a soft white hotspot sits where the pointer is (a radial gradient at `--luz-x/-y`, 62% white at the centre, gone by 46%), and the rainbow turns up to ±75deg of hue and gains saturation as the pointer moves across (`--luz-n`). A first try with a 70% glare washed the small stickers out to milky white; real foil gets more colourful under light, so the hotspot shrank and saturation went up instead. `Luz` (`ui/luz.ts`) writes only CSS variables, outside change detection, once per frame, and only for mouse pointers. `--luz` is a registered number that fades in and out over 600ms on the physical curve, set only under `@media (hover: hover)`, so a tap on a phone never leaves a glare stuck.

## Notas nos extremos (extremes pass)

The user asked for the same kind of effect on every Média of 9 or more, and for every score below 2 (categories and Média) to show "negativity coming out".

- **Média 9 or more: holographic, like the 10.** A silver version (the foil desaturated, the rainbow kept for the 10, the numeral in `red-deep`) was built first. The user rejected both the reservation and the red: every Média of 9 or more is the same holographic `.foil-nota` grade, with the numeral in `ink`. High Médias are no longer red on the card's label. Category scores of 9 stay plain marker.
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

## Ficha em branco (editor pass)

The user found the editor "meio aleatório, com diversos tipos de estética" and asked for more personalisation: a card colour drawn only at first and then chosen freely, plus a red and a grey. A critique of the old sheet found five selection styles for one idea (a heavy frame on status, a gold rubber stamp on the verdict, a frame plus a red underline on difficulty, boxed dropdowns on weights, a pen circle on scores), the Média on a paper starburst while the wall and the reader used the two-part label, headings in two unrelated voices (marker "Qual jogo?" and "O que achou?", printed caps for the rest), four boxed "NORMAL" selects louder than the scores, and no way to see the card being made.

- **A bancada.** The left of the sheet is a patch of the wall (`.parede`, the same eucatex as the page, with a shadow falling from the header band): "Vai ficar assim no mural" in chalk, then the card being made, live (the real `app-review-card` with `preview`, `inert`, at the tilt and pin it will have on the wall), then, when there are bonuses, "Notas 9,8 · Bônus −0,5" in chalk, then the swatches. Desktop shows the Completa card at exactly the wall card's width (the same `clamp`), so the verdict band collapses to its icon exactly when it would on the mural; the column is sticky while the form scrolls. Below 700px the preview is the Simples card, and the bancada sits above the form. Before a game is chosen the card is a ghost: a "?" on the cover and "Nome do jogo" at 40% (`empty`).
- **Cor da cartolina.** Eight small cartolina swatches (36 × 28, with grain and the card shadow) in wheel order under "Cor da cartolina **Amarelo**". The chosen one is pinned with a tachinha (the card's own pin colour, at 60%), turned -7deg and lifted. Radios with the stock names; focus is the yellow ring, since this is the wall. Changing it recolours the preview and the header band at once and counts as an unsaved change.
- **One voice per level.** Each block opens with a marker question (`.pergunta`, 1.5rem): "Qual jogo?", "Como foi?", "Que nota?", "E o veredito?", "O que achou?", in the order a game is thought about. Fields take the printed label (`.rotulo`, Barlow Condensed 800 0.9rem caps). Every inline action is the same marker link (`.acao-caneta`): Trocar, Usar hoje, Não lembro a data / Escolher data (which swap the date input for a paper strip reading "Data não definida" and back), tirar (the verdict), the bonus toggle. Blocks are split by the dashed pen rule of the other open cards.
- **One selection language:** the sticker sheet (see Choice options). Scores are the one exception, on purpose: a grade is written and circled by the teacher's pen, not stuck on.
- **The game, chosen:** the search strip, filled: the same paper strip with the 40px plastic-covered thumbnail, the name in the field's own type, the year, and "Trocar" at its end; the cover-source switch sits under it.
- **Que nota?** On narrow screens a compact judgment label rides beside the question (the preview has scrolled away); on desktop it is hidden, since the preview shows it.
- **Footer on phones:** one row. The header's X already cancels, so Cancelar hides, and "Salvar pra depois" keeps only its bookmark icon (its name stays for screen readers) beside the full-width ink button. "Salvar pra depois" is drawn as the kiss-cut outline everywhere: the card that has not been stuck yet.
- **Removed:** the starburst, the large chosen-game block with the 116px cover, the boxed weight selects, the old tile pickers.
