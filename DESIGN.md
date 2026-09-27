---
name: Mural de Jogos
description: A private game-review wall dressed as a 90s Brazilian rental-store wall, with neon cartolina cards pinned crooked to painted eucatex.
colors:
  wall: "#1b1c1f"
  wall-hole: "#0a0a0c"
  wall-ink: "#f1f1ec"
  wall-ink-2: "#b8b8ae"
  stock-rosa: "#ff5fa2"
  stock-amarelo: "#ffe94a"
  stock-verde: "#5cf08a"
  stock-laranja: "#ff9f45"
  stock-azul: "#5ec8ff"
  stock-lilas: "#c9a4ff"
  ink: "#151515"
  ink-2: "rgb(21 21 21 / 0.78)"
  red: "#e62e2d"
  red-deep: "#b81d1c"
  paper: "#f6f6f1"
  hi: "#ffe94a"
  plate-tab: "#d3d4cf"
  plate-tab-hover: "#e6e7e2"
  rail: "#6c6e76"
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
  highlighter-yellow: "rgb(255 233 74 / 0.85)"
  highlighter-white: "rgb(255 255 255 / 0.62)"
  verdict-masterpiece: "#7d5c00"
  foil-gold-ink: "#3b2a00"
  verdict-recomendo: "#0b7a3b"
  verdict-legalzinho: "#1f4fc4"
  verdict-meh: "#8a5200"
  verdict-chato: "#5b2d8e"
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
  price-numeral:
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
    backgroundColor: "{colors.stock-rosa}"
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
    width: "clamp(270px, 21vw, 300px)"
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
    padding: "3px 11px 2px 10px"
    height: "46px"
  card-band:
    backgroundColor: "{colors.verdict-recomendo}"
    textColor: "#ffffff"
    typography: "{typography.verdict-band}"
    rounded: "{rounded.sleeve}"
    padding: "0 18px 0 17px"
    height: "58px"
  card-band-compact:
    padding: "0 13px 0 12px"
    height: "46px"
  card-cover:
    width: "112px"
  card-cover-phone:
    width: "104px"
  card-cover-compact:
    width: "68px"
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
  score-burst:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.price-numeral}"
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
  toast-cupom:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "12px 14px 16px 18px"
---

# Design System: Mural de Jogos

## Overview

**Creative North Star: "Parede de Locadora"**

The whole app is one wall in a 90s Brazilian game-rental store. The page background is graphite-painted perforated eucatex under fluorescent tubes. Every review is a hand-lettered neon cartolina card, a "ficha de balcão": the game box (the cover in its plastic display sleeve) is taped to the card with masking tape, the owner writes the name and a sentence on it in marker, sticks on a two-part rental ticket with the Média and the verdict, and pins the card slightly crooked with a plastic tachinha. Controls are shop fixtures too. Filters and sorts are printed shelf-divider tabs on a painted aluminium gondola rail. Search is a paper strip taped to the wall with masking tape. Confirmations print out as a cash-register receipt (cupom). Dialogs are large cartolina sheets taken down from the wall.

The density is a real wall's: cards grouped in sections with generous gaps, where the only chrome is the store's own furniture. It is loud on purpose (six neon stocks, marker lettering, price labels, rubber stamps), but it is loud with order. Stocks rotate in a fixed sequence, tilts are deterministic, and every piece of text a user reads or acts on sits on flat, high-contrast paper in near-black ink. Beauty never gets in the way of reading, filtering or editing. All texture sits behind the ink, never over it.

This world replaces the category default of a uniform dark grid of cover posters with star ratings. There are no stars, no cover-only tiles and no dark glass cards anywhere.

**Key Characteristics:**
- Graphite eucatex wall (26px hole grid) with a fluorescent light falloff at the top of the page.
- Six neon cartolina stocks that rotate per review, always with near-black marker ink on top.
- Permanent Marker for lettering and sub-score numerals, Kalam for the owner's handwriting, Barlow Condensed for printed labels and the Média price, Barlow for UI body text.
- Physical objects with real behavior: tachinhas, plastic sleeves, masking tape, a two-part rental ticket carrying the Média and the verdict, rubber verdict stamps in the reader, price-gun labels, price starbursts in the editor and reader, receipt paper.
- Deterministic imperfection: every card has a tilt, pin position, pin colour and drop offset derived from its id, so the mess stays the same between visits.
- One physical motion curve, plus one rebound: the tachinha punching in.

## Colors

Palette character: six fluorescent paper stocks and a hi-vis yellow against graphite, all tied together by one near-black marker ink and one teacher's red.

### Primary
- **Marker Red** (`red`): the red scribble under "jogos" on the cartaz, the pen circle around the chosen score, and the text caret in every field. Red always means "the score" or "the pen". It is never used as a surface tint.
- **Deep Marker Red** (`red-deep`): the chosen numeral in score pickers, destructive actions (the danger variants of the ink and quiet buttons), and the Média numeral when it is 9 or higher: on the paper half of the card's judgment ticket, on the starburst in the editor and reader, and in the Ranking (a teacher's red mark for a top grade).

### Secondary
- **Hi-Vis Yellow** (`hi`): the one active and focus colour. It fills the active shelf tab, draws every `:focus-visible` ring (3px outline, 3px offset; the review card's ring sits at a 5px offset around the whole card), highlights the active autocomplete option, sets `::selection`, `accent-color` and the skip link, and colours the text on ink buttons. It has the same value as `stock-amarelo`, but the role is different: `hi` is state, `stock-amarelo` is paper.

### Tertiary: the cartolina stocks
- **Neon Pink** (`stock-rosa`): the primary action ("Pregar resenha") and the first stock in the rotation.
- **Neon Green** (`stock-verde`): stock; also the empty-state card and the back sheet of the blank-card stack.
- **Neon Yellow** (`stock-amarelo`): stock; also the cartaz (masthead) and the default dialog sheet.
- **Sky Blue** (`stock-azul`): stock; also the settings sheet and the front sheet of the blank-card stack.
- **Neon Orange** (`stock-laranja`): stock; also the "no results" card.
- **Lilac** (`stock-lilas`): stock.

Each review stores its stock when it is created. The value comes from the rotation `rosa → verde → amarelo → azul → laranja → lilas`, continuing from the most recent review, so neighbouring cards never repeat a colour and all six appear. Imported reviews without a stock are filled in with the same rotation. The editor and reader sheets take the colour of the review they show.

### Neutral
- **Graphite Wall** (`wall`): the page background, `theme-color`, and the scrollbar track.
- **Eucatex Hole** (`wall-hole`): the perforation dots in the procedural wall pattern.
- **Wall Chalk** (`wall-ink`): text sitting directly on the wall (settings button, tools).
- **Faded Chalk** (`wall-ink-2`): secondary text on the wall: group labels ("Mostrar", "Ordenar"), "Mostrando N de M", the "sem capa" note.
- **Marker Black** (`ink`): all text on paper and cartolina, ink-button fills, field outlines, score bars.
- **Faded Marker** (`ink-2`): meta lines and hints in sheets. Wall cards no longer use it: their meta and boletim labels are full `ink`.
- **Receipt Paper** (`paper`): the search strip, field strips, autocomplete list, status labels, the toast receipt, the starburst, and the paper half of the card's judgment ticket (flat, with no grain).
- **Shelf Tab / Tab Hover** (`plate-tab`, `plate-tab-hover`): light grey printed plastic for the resting shelf-divider tab, with `ink` print. It was dark grey at first and sank into the graphite wall once the photographic eucatex landed; light plastic keeps every tab readable against the holes.
- **Gondola Rail** (`rail`): the aluminium rail under the tabs.
- **Error Ink** (`error-ink`): field errors and import errors on paper.

### Materials on paper
- **Masking Tape** (`tape`): the tape holding the cover on every card, the Pra depois pages and headings. The search-strip tape still uses the older `rgb(222 205 160 / 0.82)`.
- **Yellow Highlighter** (`highlighter-yellow`): a band from 22% to 84% of the height, inset 8px on each side, behind the Média on the ticket's paper half, only when the wall is sorted by Média.
- **White Highlighter** (`highlighter-white`): a band from 4% to 96% behind the sorted category's boletim cell (Completa), or behind the sorted score beside the date (Simples).

### Pins and status stripes
- **Tachinhas** (`pin-red`, `pin-yellow`, `pin-blue`, `pin-green`, `pin-white`, `pin-orange`): six plastic pin colours, in this order. The order matters, because it is also the index into the `tachinhas.png` sprite. Each card's pin colour comes from its id.
- **Price-gun stripes** (`stripe-incompleto`, `stripe-finalizado`): the two thin stripes at the top and bottom of the Incompleto and Finalizado labels. Platinado has no stripes; it is holographic foil instead.

### Verdict inks
- **Verdict inks** (`verdict-masterpiece` `#7d5c00` dark gold, `verdict-recomendo` `#0b7a3b`, `verdict-legalzinho` `#1f4fc4`, `verdict-meh` `#8a5200`, `verdict-chato` `#5b2d8e`): one ink per verdict. In the reader and the verdict picker each is the ink of its rubber stamp on white. On wall cards each is the solid fill of the ticket's verdict band under white lettering; every one holds 5:1 or more against white. Masterpiece is the exception: it is never red (red read as a warning for the top verdict). Its band and stamp are **gold foil** (`--foil-gold`: fine 100deg brushed lines over a 105deg gradient from `#c99a3c` through `#fff4c4`), lettered in `foil-gold-ink` `#3b2a00` (5.4:1 on the darkest stop) with a 1px white emboss, and `#7d5c00` is only its frame and picker ink (5.7:1 on paper).

### Named Rules
**The One Ink Rule.** Every piece of readable text on a paper surface is marker black (`ink` or `ink-2`). The six stocks change the paper, never the ink. The exceptions are all marks made by a different tool, and each sits on white paper or on its own printed ink: the Média numeral of 9 or more (`red-deep`, on the paper half of the card's ticket, the starburst and the Ranking), the chosen score numeral (`red-deep`), the verdict stamps in their own five inks (reader and verdict picker), white text on the card's verdict band (the band is its own printed ink surface, not a neon stock), and the status labels' printed inks. No coloured text ever sits directly on a neon stock.

**The Yellow Means State Rule.** Hi-vis yellow on the wall means active or focused: the active tab, the focus ring, the selected option. Focus is one token, `--focus`: yellow on the wall, marker `ink` on any cartolina (a yellow ring vanishes on yellow paper). The review card is the exception that proves it: its ring is drawn on the wall around the card, so it is yellow. Do not use it as decoration on the wall. As a paper stock it only appears as a full cartolina surface; as a highlighter it only marks the Média that is sorting the wall.

**The Rotation Rule.** Card colour is assigned once, by the fixed stock rotation, and saved with the review. Never pick a stock at random or by score, and never let two neighbours match.

## Typography

**Display Font:** Permanent Marker (with Comic Sans MS, cursive)
**Handwriting Font:** Kalam (with Segoe Print, cursive)
**Label Font:** Barlow Condensed 600 / 800 / 800 italic (with Arial Narrow, sans-serif)
**Body Font:** Barlow 400 / 500 / 600 (with system-ui, sans-serif)

All four are self-hosted through `@fontsource` (latin subsets) and loaded from `angular.json`.

**Character:** The store owner wrote the cards with a pincel atômico (Permanent Marker), the reviewer's own words are in their handwriting (Kalam), and anything the store printed (tabs, labels, receipts, the price on the starburst) is in a condensed grotesque (Barlow Condensed). Barlow sets the few pieces of real UI text: inputs, hints, messages.

### Hierarchy
- **Display** (Permanent Marker 400, `clamp(2.5rem, 6vw, 4.4rem)`, 0.98): only the cartaz masthead, "Meu mural de jogos".
- **Headline** (Permanent Marker 400, 1.9rem, 1.05; 1.6rem at 560px and below): sheet titles ("Nova resenha", the game name in the reader), empty-state heading (2rem), no-results heading (1.6rem).
- **Title** (Permanent Marker 400, 1.62rem, 1.04; 1.46rem on phones; 1.24rem on Simples cards, 1.2rem on Simples phones): the game name on a card, balanced and clamped to 2 lines.
- **Grade numeral** (Barlow Condensed 800 italic, 2.9rem integer at -0.03em plus a 1.9rem ",decimal" aligned to the integer's foot, 1, tabular; 2.25rem + 1.5rem on Simples): the Média on the paper half of the card's judgment ticket, printed like the price on a rental ticket.
- **Verdict band** (Barlow Condensed 800, 1.02rem, 1, 0.1em, uppercase, white; 0.86rem on Simples): the verdict name on the ticket's ink band.
- **Marker action** (Permanent Marker 400, 1.15rem, 1): the text on cartolina and ink buttons. It goes up to 1.35rem on the header stack.
- **Score numeral** (Permanent Marker 400, 1.32rem on the card boletim; 1.2rem, tabular, elsewhere): numbers in the score picker (1.55rem in the large final-score picker), numbers in the reader (1.35rem). The scores are written like a teacher grading the card.
- **Price numeral** (Barlow Condensed 800 italic, 2.1rem, 1, -0.02em, tabular; 3.4rem on the big starburst): only the number on the price starburst in the editor and reader, with a smaller "/10" at 0.42em.
- **Hand** (Kalam 400, 1.14rem on a 1.75rem ruled line in the editor; 1.18rem on 1.85rem in the reader, max 68ch): the owner's review text and the empty-state sentences.
- **Lead** (Kalam 400, 1.1rem, 1.36, `text-wrap: pretty`): the review's first sentence on a Completa card, whole and in curly quotes, on phones too.
- **Body** (Barlow 400–600, 1rem, 1.5): inputs, hints, messages, settings copy (max 60ch).
- **Label** (Barlow Condensed 800, 0.98rem, 0.04em, uppercase): shelf tabs, quiet buttons, receipt text (1.05rem).
- **Label small** (Barlow Condensed 800, 0.86rem, 0.08–0.09em, uppercase): status labels, picker legends (1rem).
- **Meta** (Barlow Condensed 600, 0.86rem, 0.04em, uppercase): year and date lines in sheets, the source line in the editor.
- **Card meta** (Barlow Condensed 800, 0.9rem, 0.04em, uppercase, tabular, full `ink`; 0.82rem on Simples): the date · hours line on a card.
- **Boletim label** (Barlow Condensed 800, 0.8rem, 0.01em, 1, sentence case, full `ink`): the four full category names over the boletim numerals.

### Named Rules
**The Three Hands Rule.** Each typeface stands for one hand in the store: the owner's marker (Permanent Marker), the reviewer's pen (Kalam), and the store's printer (Barlow Condensed). Choose the face by who "wrote" the text, never for variety. Barlow is only for text that is interface, not artifact.

**The Price Tag Numeral Rule.** The Média is the one score written as a price, and it is always the Barlow Condensed 800 italic price numeral. On a wall card it is printed on the paper half of the rental ticket (a 2.9rem integer with a smaller ",decimal" aligned to its foot); in the editor and reader it sits on the paper starburst. Every other score is a smaller Permanent Marker numeral. The Média is always the largest number on its surface, and it never loses its paper.

**The Tracked Caps Are Printed Rule.** Uppercase with letter-spacing is only for printed store matter: tabs, labels, meta lines, and the labels naming control groups. It never sits above a heading as a decorative kicker.

## Layout

The app shell is centred with a maximum width of 1480px, a side gutter of `clamp(16px, 4vw, 48px)`, 28px of top padding and 120px of bottom padding. It is split into four pages (hash routes, so it deploys to any static host): **Mural** (`/`), **Pra depois** (`/fila`), **Ranking** (`/ranking`) and **Ajustes** (`/ajustes`). Every page shares one header row: the compact cartaz on the left (a link home), the section tabs, and the blank-card stack on the right. The editor and the reader stay as sheets owned by the shell, so any page can open them.

The Mural page holds only the toolbar and the wall. The toolbar is one shelf in two rows. The top row holds only the taped search strip (max 440px), just above the rail. The bottom row stands on the rail: the verdict filter tabs on the left and, pushed to the right end, a single "Ordenar" select tab with the direction toggle and the two density icon tabs, so every shelf tab stands on the rail and none floats. The verdict tabs are: Todos, Masterpiece, Recomendo, Legalzinho, Meh, Chato, and "Sem veredito" only while some review has no verdict, each with its tabular count. The verdict filter replaced the old status filter (Incompleto / Finalizado / Platinado); status is still a sort. At 1240px and below, where the tabs and Ordenar no longer share the rail row, the tabs fold into a "Mostrar" select tab. The search strip is the shared `app-search-strip` component (paper, two tape pieces, red caret, clear button, `/` hint); the Pra depois page uses the same strip to filter the queue by name, with the same "Mostrando N de M · Limpar busca" line and a Kalam note when nothing matches. `/` focuses whichever strip the open page has (`input[data-busca]`).

The wall is split into sections that follow the sort (see "Wall in sections" below). Sections flow side by side in a wrapping row (64px row gap, 76px column gap). Inside a section, cards wrap at a fixed width, each only as tall as its own content (rows align at the top and are never stretched to the tallest card):
- **Completa:** `clamp(330px, calc((100vw - 2 × gutter - 84px) / 3), 424px)`, so three cards fill the wall width; 44px row and 34px column gaps.
- **Simples:** `clamp(270px, 21vw, 300px)`; 34px row and 30px column gaps.

Each card also drops 0–14px from the top of its cell (from its id), so rows never line up perfectly.

Responsive behaviour:
- **1024px and up:** the editor sheet widens to 1080px and splits into two columns (`1.05fr / 1fr`, 40px gap, with a dashed divider), so it fits without scrolling.
- **1100px and below:** the section tabs drop to their own row under the cartaz and the stack.
- **720px and below:** the cartaz shrinks to a two-line 1.5rem logo; the four section tabs share one row; the toolbar becomes two rows: search plus density icons, then a "Mostrar" select tab and the "Ordenar" select tab with the direction toggle. The `/` hint hides.
- **600px and below:** the reader stacks the cover (max 220px, centred) above the facts.
- **559px and below:** sections stack 48px apart, and each section is one column of full-width horizontal cards, 34px apart. Cards keep their whole anatomy (lead sentence and boletim included), with half the tilt, 40% of the drop, a 104px cover (62px Simples), and the judgment ticket moved to the full-width row under the head.
- **440px and below:** the primary button reads "Pregar" (the full name stays as its accessible label).
- **420px and below:** score-picker cells shrink to 36px (44px for big pickers); the difficulty options wrap to 3 columns.

Inside sheets the rhythm is 24px between sections (`section-gap`), with 24px side padding (16px compact). Dashed 2px ink rules (`rgb(21 21 21 / 0.22–0.25)`) separate footers, sub-scores and editor columns. They read as lines ruled in pen on the card.

## Elevation & Depth

Depth here is physical light: one fluorescent source above the wall. Everything that hangs on the wall casts a soft, stacked shadow straight down. Nothing glows, and no surface is translucent glass. The wall itself adds depth through its lit hole edges (each hole has a faint highlight on its lower rim) and a radial light falloff over the top 900px of the page.

### Shadow Vocabulary
- **Hanging card** (`--shadow-card`: `0 1px 1px rgb(0 0 0 / 0.35), 0 10px 18px -6px rgb(0 0 0 / 0.55), 0 22px 40px -18px rgb(0 0 0 / 0.6)`): every card, the cartaz, the search strip, cartolina buttons and the stacked blank sheets.
- **Lifted card** (`--shadow-lift`: `0 2px 2px rgb(0 0 0 / 0.3), 0 20px 28px -8px rgb(0 0 0 / 0.55), 0 40px 60px -24px rgb(0 0 0 / 0.65)`): a card on hover or focus, a hovered cartolina button, open sheets, and the first frame of a landing card.
- **Ticket drop** (`filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 5px 6px rgb(0 0 0 / 0.22))`): the card's two-part judgment ticket, stuck flat on the cartolina. It is a filter, not a box-shadow, so the shadow follows the notches.
- **Pin cast** (`2px 5px 3px -1px rgb(0 0 0 / 0.45), 5px 10px 10px -2px rgb(0 0 0 / 0.25)`): the tachinha's shadow on the paper. It is offset down and to the right, because the pin head stands off the paper.
- **Tape** (`filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3))`): the masking-tape pieces holding the cover.
- **Starburst drop** (`filter: drop-shadow(1px 3px 2px rgb(0 0 0 / 0.35))`): the price starburst in the editor and reader.
- **Receipt drop** (`filter: drop-shadow(0 8px 12px rgb(0 0 0 / 0.5))`): the toast receipt.
- **Rail** (`inset 0 1px 0 rgb(255 255 255 / 0.28), inset 0 -2px 0 rgb(0 0 0 / 0.3), 0 6px 10px -3px rgb(0 0 0 / 0.6)`): the gondola rail's metal bevel.
- **Sleeve** (`inset 0 0 0 1px rgb(255 255 255 / 0.55), 0 1px 2px rgb(0 0 0 / 0.25)`, over a white film at 22%, plus two 118deg glare bands): the plastic display sleeve around a cover.

### Named Rules
**The Fluorescent Tube Rule.** All light comes from above. Shadows fall downward (the pin, the only object that stands up off the paper, casts down and to the right). Hover lifts a card toward the light, which means a deeper shadow and 3px of rise, never a glow. Pressing a card sets it back against the wall (no rise, the resting shadow, 80ms).

**The Paper Is Opaque Rule.** Cards, sheets and strips are solid paper. The only translucent materials are the cover sleeve's plastic and the masking tape, and the dialog backdrop dims the wall to `rgb(8 8 10 / 0.72)` with no blur.

## Shapes

Paper is cut almost square: cards, the cartaz, strips and sheets have a 2px radius (`paper`), sleeves, ink buttons and the card's judgment ticket 3px (`sleeve`; square where the two halves meet), and small on-paper hover targets, score cells and verdict stamps 4px (`soft`). Choice options drawn on the card (status, difficulty) and quiet buttons use 6px (`option`). Pins, icon buttons and the "limpar"/clear targets are circles.

The recurring silhouettes are specific objects, not generic shapes:
- **Shelf-divider tab:** a trapezoid with 7px chamfers on the top corners (`clip-path: polygon(7px 0, calc(100% - 7px) 0, 100% 100%, 0 100%)`), standing on the rail.
- **Price starburst (editor and reader only):** an 18-point star with uneven, hand-cut points, drawn as an SVG polygon (outer radius about 48, inner about 37, with fixed jitter). Filled with receipt `paper` and a 2.2 ink stroke, rotated -9deg. It was red at first; the user found a red star behind every score too loud, so red moved to the numeral and only for top grades. It left the wall cards in the ficha de balcão pass.
- **Receipt:** a zigzag bottom edge made with a conic-gradient mask at a 12px period.
- **Rental ticket:** the card's judgment label: a paper half and an ink half joined at a 2px dotted white perforation (`rgb(255 255 255 / 0.55)`), with 5px semicircle notches (4px on Simples) cut top and bottom at the junction by radial-gradient masks on the facing edges. A grade without a verdict stands alone, uncut.
- **Masking tape:** on the search strip, 54×20px pieces of `rgb(222 205 160 / 0.82)` at ±24–28deg over its ends. On cards, 36×14px pieces (28×11px on Simples) of `tape` with paper grain multiplied in, torn ends via `clip-path: polygon(0 12%, 4px 50%, 0 88%, 100% 100%, calc(100% - 4px) 50%, 100% 0)`, at -38deg / 36deg over the cover's top corners.
- **Pen marks:** a single-stroke red scribble underline (SVG path) and a hand-drawn red circle around the chosen score (SVG path, drawn in with stroke-dashoffset).

Tilt is part of the form language. Cards tilt ±0.8°–3.4° (never straight; half that on phones), the cover box counter-tilts at -0.6 × the card's tilt, the judgment ticket at -0.5 × tilt - 1deg, the cartaz -2deg, the search strip -0.6deg, status labels -2.5deg, the starburst -9deg, the chosen cover in the editor -2deg, and the reader cover -1.5deg.

## Components

### Buttons
Tactile store objects, each with its own material.
- **Cartolina button (primary):** a neon cartolina card with paper grain multiplied in, marker lettering, a 2px radius, the hanging-card shadow, and a 48px minimum height. On hover it tilts -1.2deg, rises 2px and takes the lifted shadow over 380ms on the physical curve. On press it sinks 1px. In the header it sits on the **blank-card stack**: a green sheet behind it at 5deg and a blue one at -4deg, which fan out further on hover (9deg / -8deg). Label: "Pregar resenha", with a plus icon.
- **Ink button (completes an action inside a sheet):** a marker-black block with yellow marker lettering, a 3px radius and a 50px minimum height. On hover it rises 2px and tilts -1deg. The danger variant is `red-deep` with white text. Examples: "Pregar no mural", "Salvar alterações", "Editar", "Mostrar o mural inteiro", "Descartar".
- **Quiet button:** transparent, Barlow Condensed 800 uppercase, 40px, with a neutral 16% tint on hover. It takes chalk colour on the wall and ink colour on sheets. Examples: "Ajustes e backup", "Cancelar", "Remover do mural".
- **Icon button (sheet close):** a 44px circle with a 12% ink tint on hover.
- **Link button:** ink text with a 2px underline at a 4px offset ("Tenho um backup").

### Shelf tabs (filters and sorts)
- **Style:** a chamfered trapezoid tab in `plate-tab` with `ink` print, Barlow Condensed 800 uppercase, a 38px minimum height, and 6px gaps within a group. Counts are tabular at 62% opacity ("Todos 8"). Group labels ("Mostrar", "Ordenar") are Barlow Condensed 800 in `wall-ink` at 86% with a dark text-shadow so they read over the holes.
- **State:** hover lightens the tab to `plate-tab-hover` and raises it 2px. Pressed or checked turns it hi-vis yellow with ink text, raised 4px, so it stands up out of the rail. The direction toggle is a tab with an icon only and a spoken label.
- **Rail:** an 8px `rail` bar under the shelf with the rail bevel shadow. Each group has a faded-chalk tracked label above it ("Mostrar", "Ordenar", "Qual nota"), which also names the group for assistive tech. The "Qual nota" group slides in from the left (-8px) over 380ms.

### Cards / Containers
- **Review card, "ficha de balcão" (signature):** a horizontal cartolina card in the review's stock, a 2px radius, padding `16px 16px 14px` (`14px 14px 12px` Simples), the hanging-card shadow. Nothing sits on the cover art. Anatomy:
  - **Head:** a grid of `cover | words` over `cover | judge` on desktop Completa; on phones and on every Simples card, `cover | words` over a full-width `judge` row.
  - **Cover:** the sleeved cover at 112px (104px phone, 68px Simples, 62px Simples phone), counter-tilted at -0.6 × the card's tilt and held by two masking-tape pieces over its top corners. It is decorative for assistive tech (empty alt), because the card already says the name.
  - **Words:** the marker title (2 lines max), then the card meta (date · hours, full ink; the date is the user-editable completedAt, day only inside month sections), then a price-gun status label only for Incompleto and Platinado. Finalizado is the normal case and carries no label.
  - **Judgment ticket:** a two-part rental ticket (see Shapes), 58px tall (46px Simples), 14px under the words (10px Simples), counter-tilted at -0.5 × tilt - 1deg, with the ticket drop. Both halves share the height, so the Média and the verdict weigh the same. Left, the **grade**: flat `paper`, at least 76px wide (60px Simples), padding `4px 14px 3px 13px` (`3px 11px 2px 10px` Simples), the Média in the grade numeral (`red-deep` at 9 or more), exposed as the image "Média X de 10". Right, only when a verdict exists, the **band**: a solid fill in the verdict ink, the verdict name in white verdict-band lettering after its lucide icon (19px, 7px gap; 16px and 6px on Simples), padding `0 18px 0 17px` (`0 13px 0 12px` Simples), exposed as the image "Veredito: X". (An inner frame in the lettering colour, 2.5px inset 4px, was tried and is switched off in the code, pending a better design.) The Masterpiece band is gold foil with dark gold lettering, and it takes the same white shine sweep as the Platinado foil when the card lifts (`--shine`, 900ms).
  - **Lead (Completa only):** the review's first sentence in Kalam, whole, in curly quotes. It is chosen by `leadSentence`: split on terminal punctuation (`. ! ? …`) followed by a space, so "nota 8.5" stays whole; a first sentence under 36 characters takes the second along; over 120 characters it is cut at a word boundary with "…".
  - **Boletim (Completa only):** four fixed cells, always in the order História · Diversão · Jogabilidade · Visual, with full names in the boletim label and 1.32rem marker numerals. A 1.5px rule at 34% ink closes the top; cells are split by 1.5px rules at 20%. A "Não tem" category keeps its cell: the label is struck through at 84% opacity and the value is "—" (spoken "não tem"). Relevante / Pouco importante show a 13px lucide arrow up / down after the numeral, with the weight name as screen-reader text. The boletim follows the content, and the card ends where the writing ends: a row of cards has ragged bottoms, never blank cartolina padded to match the tallest neighbour.
  - **Hit target:** the whole card is one invisible button named "Abrir resenha: {name}, média {X}, {verdict}, {status}, {concluído em / jogado até} {date}".
- **Simples card:** a shelf strip: cover, title, date and status label, then the full-width judgment ticket. No lead, no boletim, no hours. When the wall is sorted by a category, that score appears beside the date ("Diversão 10") under the white highlighter.
- **Card hover / focus / press:** the card swings around its own pin (`transform-origin` is the pin point), its tilt drops to 35% of rest, it rises 3px and takes the lifted shadow. The holographic label's shine runs across. Keyboard focus draws a 3px `hi` ring at a 5px offset around the whole card (via `:has(.hit:focus-visible)`), on the wall where yellow reads. `:active` sets the card back against the wall over 80ms.
- **Pin:** a tachinha at the card's pin x, 42–58% (the wall-physics 40–60% remapped by 0.8), above the title.
- **Sorted highlight:** sorted by Média, the yellow highlighter sits behind the Média on the ticket's paper half. Sorted by a category, the white highlighter covers that boletim cell (Completa) or the score beside the date (Simples).
- **Landing:** a new card falls in from -70px at 1.08 scale and triple tilt (620ms, physical curve). Its tachinha then punches in after a 260ms delay (520ms, from scale 2.2 to 0.9 to 1). This punch is the system's only rebound.
- **Cartaz (masthead):** a yellow cartolina at -2deg with two pins (red and blue), the display title with the red scribble under "jogos".
- **Empty state:** a green card spanning two columns ("Seu mural está vazio", Kalam copy, an ink button "Pregar a primeira resenha", the link "Tenho um backup"), next to three dashed chalk outlines where the next cards will go, each with a single pin hole.
- **No results:** an orange card at 1deg, centred, max 460px ("Nada no mural com esse filtro").
- **Sheets (dialogs):** a cartolina sheet in the review's stock (azul for settings), a 2px radius, the lifted shadow, a pin centred at the top edge, a marker headline, a scrolling body and a footer behind a dashed rule. The sheet opens by rising 24px from -2deg and 0.97 scale (380ms) over a 72% graphite backdrop that fades in over 160ms.

### Inputs / Fields
- **Search strip (on the wall):** receipt paper, 50px, tilted -0.6deg, held by two pieces of masking tape. It has the hanging-card shadow, a red caret and a `/` keyboard hint. Focus adds a 3px hi-vis ring outside the strip.
- **Field strip (on a sheet):** receipt paper, 52px, with a 2px inset ink outline. Focus thickens the outline to 3px and adds a 4px hi-vis ring. The autocomplete list below it drops into the document flow (never clipped), uses the same paper and outline, and marks the active option in hi-vis yellow. Options show a 44px sleeve thumbnail, the name and the year. A "use this name without a cover" option sits below a dashed rule.
- **Ruled textarea:** pen lines drawn on the card itself (`rgb(21 21 21 / 0.22)` every 1.75rem, fixed to the text as it scrolls) over 28% white, Kalam text, a 2px ink inset outline that thickens to 3px on focus, and a red caret. Its height grows with the content up to 22rem.
- **Score picker:** the digits 0–10 written in marker in an 11-column grid, each a hidden radio button. The chosen digit turns `red-deep`, scales to 1.12 and gets a red pen circle drawn around it in 280ms. Hover tints the cell with 35% white; keyboard focus draws a 3px ink outline. Optional pickers show "opcional" or a "limpar" link.
- **Choice options (status, difficulty):** options drawn on the card with a 2px faint ink inset outline. When selected, the outline becomes 3px ink over 35% white. For status, the price label inside straightens from 0deg to -3deg and scales to 1.08. For difficulty, the name gets a red 3px underline.
- **Errors:** Barlow 600 in `error-ink` directly under the field ("Dê as quatro notas de 0 a 10 para fechar a média."). The footer repeats what is missing when the user tries to save.

### Status labels (price-gun stickers)
- **Style:** receipt paper with two thin stripes (1.5px, inset 3px from the top and bottom edges), Barlow Condensed 800 uppercase at 0.09em, an icon at 15px, a 2px radius, tilted -2.5deg.
- **Incompleto:** orange stripes and brown ink, with a dashed-circle icon.
- **Finalizado:** green stripes and dark green ink, with a check-circle icon. Shown in the editor and reader; wall cards omit it.
- **Platinado:** holographic foil with a trophy icon. The CSS fallback that ships is fine diffraction lines at 62deg over a pastel spectrum gradient, with a white inner edge. On card hover a white shine band sweeps across over 900ms (the animated `--shine` property). When `holografico.png` loads, it replaces the gradient through `--holo-foil`.

### Price starburst
A paper 18-point hand-cut star with an ink outline, 76px in the editor and 120px in the reader, rotated -9deg, with an ink italic Barlow Condensed numeral and a small "/10"; the numeral turns `red-deep` when the Média is 9 or more. It carries the Média, never a typed score: the weighted average of História, Diversão (2x), Jogabilidade and Visual, one decimal in pt-BR ("8,4"); decimal values step the numeral down (2.1rem to 1.7rem at 76px, 3.4rem to 2.8rem in the reader). It is exposed to assistive tech as the image "Média 8,4 de 10". In the editor it sits at the head of the scores and updates live as scores are circled, showing "–" until the first score. It is not used on wall cards.

### Verdict stamp

A rubber stamp, optional, used in the reader and the verdict picker. Barlow Condensed 800 uppercase tracked 0.1em, one lucide icon, a 4px radius. One ink per verdict (the `verdict-*` tokens): Masterpiece gold foil with `#7d5c00` frame and `#3b2a00` lettering (crown; also the chosen option in the picker), Recomendo `#0b7a3b` (thumbs-up), Legalzinho `#1f4fc4` (smile), Meh `#8a5200` (meh face), Chato `#5b2d8e` (annoyed face). Icons are lucide SVGs, never emoji. Exposed as the image "Veredito: X".
- **Stamp (reader):** a stamped sticker: paper-white fill at 94%, a 2.5px ink border plus a 1px outline at 2px offset (double frame), 0.86rem (1.05rem big), icon 15px (20px big), rotated -9deg (-5deg in the reader block), with a small drop shadow.
- **On wall cards** the verdict is not a stamp: it is the ink band on the right half of the judgment ticket (see Review card), white lettering on the verdict ink.

In the editor the five options are outlined tiles; the chosen one becomes the stamp itself (paper fill, double inset frame in its ink, rotated -3deg).

### Tachinha (pin)
A 26px plastic pushpin seen from above: a wide base with an outer ring, a raised head with a specular dot, colour mixed with black at 38% for the shaded side, and the pin cast shadow. It is always `aria-hidden`. When `tachinhas.png` loads, it becomes a 32px frame from a 192×32 sprite of 6 pins, indexed in the order of the pin palette.

### Cover sleeve
A clear plastic display sleeve (5px of film around the art, 2px on thumbnails) over a 4:5 frame. Covers are `object-fit: cover`, focused at 50% 20%. With no cover, the frame shows diagonal stripes on near-black, a large marker initial in the card's stock colour, and the note "sem capa". A `decorative` input drops the alt text and the "Sem capa para …" image role where the surrounding object already names the game (wall cards); elsewhere the cover is announced as "Capa de …". On wall cards the sleeve is taped to the card and nothing is placed over the art.

### Difficulty skulls
0–4 skull icons in ink, from Nenhuma to Impossível. The reader and picker show the empty slots at 22% opacity, plus the level name. Wall cards do not show them.

### Toast (cupom)
A receipt fixed at the bottom centre, with a serrated bottom edge and the receipt drop shadow. It prints downward, revealed from the top over 380ms. The text is Barlow Condensed 800 uppercase ("“Hades” pregado no mural", "Resenha atualizada"). An optional ink action ("Desfazer") uses yellow text.

### Planned raster materials
The slots are wired; the app tries to load each file after the first render and adds a class to the body only when it loads, so the procedural CSS fallbacks render whenever a file is missing.

| File | Body class | What it replaces | Fallback |
|---|---|---|---|
| `parede-eucatex.png` | `has-wall-texture` | wall holes and fibre (520px tile) | two radial-gradient hole layers at a 26px pitch (dark hole plus a lit lower rim) and a 300px fractal-noise fibre SVG at 5% |
| `cartolina.png` | `has-paper-texture` | grain on `.cartolina` and cartolina buttons (360px tile) | `--paper-grain`, a 220px fractal-noise SVG multiplied over the stock colour |
| `tachinhas.png` | `has-pins` | the CSS pin (192×32 sprite, 6 × 32px in pin palette order) | the layered radial-gradient base, head and specular dot |
| `holografico.png` | `has-holo` | Platinado foil via `--holo-foil` (180px tile) | a 62deg diffraction-line pattern over a pastel spectrum gradient |
| `fita-crepe.png` | `has-tape` | the search-strip tape pieces | flat `rgb(222 205 160 / 0.82)` with a 1px drop shadow |

Every raster must look like a photograph of the material and keep the same scale as its fallback, so swapping it in never shifts the layout or reduces text contrast.

### Motion
One physical curve, `cubic-bezier(0.16, 1, 0.3, 1)` at 380ms, is used for anything that moves like an object: card swing, lift, the stack fanning, sheet entry, the sub-tab-group entry, the receipt printing, and View Transition reshuffles when sorting, filtering, deleting or restoring (each card has its own `view-transition-name`; the root cross-fade takes 120ms). UI feedback (colours, tints, tab rise) uses `cubic-bezier(0.2, 0.7, 0.2, 1)` at 160ms. Reduced motion clamps every animation and transition to 1ms and switches scroll-into-view to instant.

## Do's and Don'ts

### Do:
- **Do** put every review on a cartolina stock from the fixed rotation (`rosa → verde → amarelo → azul → laranja → lilas`), saved on the review, and set all text on it in marker black.
- **Do** derive tilt (±0.8°–3.4°, never 0), pin x (40–60%, remapped to 42–58% on wall cards), pin colour and drop offset (0–14px) from the review id with the wall-physics hash, so the wall looks the same on every visit.
- **Do** rotate cards around their own pin (`transform-origin` at the pin) on hover and focus, reducing the tilt to 35% and lifting 3px with `--shadow-lift`.
- **Do** give the Média and the verdict equal weight on a wall card, as the two halves of one rental ticket at the same height: the Média as the Barlow Condensed italic price on the paper half, the verdict as white lettering on a band in its own ink. Every other score is a smaller Permanent Marker numeral.
- **Do** tape the cover to the card and keep the art clear; labels, stamps and scores live on the cartolina or the judgment ticket, never on the sleeve.
- **Do** show the review's first sentence whole (`leadSentence`), and the boletim as four fixed cells in the same order on every card, so cards compare at a glance.
- **Do** use hi-vis yellow (`hi`) for active tabs, focus rings on the wall (3px, 3px offset; 5px around a whole card; ink on cartolina via `--focus`) and the selected option, and for nothing decorative on the wall.
- **Do** build new controls as store fixtures that already exist in this world: a shelf tab on the rail, a paper strip, a price-gun label, a receipt, an ink or cartolina button.
- **Do** keep motion on the two curves (380ms physical, 160ms UI) and keep the tachinha punch as the only rebound.
- **Do** lay the wall out as one column of full-width horizontal cards at 559px and below, keeping the lead sentence and boletim.
- **Do** keep the procedural fallback for every raster slot, and add rasters only through their body class after the file has loaded.

### Don't:
- **Don't** turn the wall into a uniform dark grid of cover posters with star ratings; the cover always sits in a sleeve on a cartolina card.
- **Don't** put the price starburst back on wall cards; the user rejected it there. It stays in the editor and reader.
- **Don't** set readable text directly on a raster or on the wall pattern without a paper surface, except the few chalk labels (`wall-ink`, `wall-ink-2`) that belong to the wall itself.
- **Don't** use frosted glass, backdrop blur, glows or coloured shadows; the cover sleeve's clear plastic and the masking tape are the only translucent materials, light comes from the fluorescent tubes above, and shadows are neutral black.
- **Don't** add a seventh stock, colour a card by its score, or choose a stock at random at render time.
- **Don't** put tracked uppercase kickers above headings; tracked caps are only for printed store matter and control-group labels.
- **Don't** round paper past 2–3px or give cards pill or large-radius corners; paper is cut, not moulded.
- **Don't** straighten cards to 0deg or animate their tilt while the wall is idle; the tilt is fixed and changes only on hover, focus and landing.
- **Don't** put paper grain, a worn-ink mask or a rubber stamp on the judgment ticket; it is printed flat and crisp, paper on one half and solid verdict ink on the other.


## Material calibration (polish pass)

- **Paper grain.** The shipping grain is `textures/cartolina-fibra.png`, derived from `cartolina.png` and re-centred on 50% grey, blended with `soft-light` at 420px. It adds fibre without shifting a stock's hue. Multiply with the raw light-grey photo muddied every stock (yellow read olive) and is not used.
- **Wall.** The photographic eucatex (`parede-eucatex.png`, 560px tile) sits under a flat coat of `rgb(24 24 27 / 0.46)` and the fluorescent falloff at 13%. The coat keeps the holes visible but stops them competing with cards and tabs.
- **Native controls on paper.** Every `.cartolina` sets `color-scheme: light`, so radios, the date picker and scrollbars render light on paper while the wall stays dark.
- **Foil.** Platinado carries a 40% milky varnish between the shine and the holographic photo, so the word stays readable on the glitter.
- **Shadows.** No zero-blur offset shadows remain: `btn-ink` and field strips use soft offsets (`0 1px 2-3px`).


## Added components (feature pass)

- **Card density.** A "Fichas" tab group on the rail switches Completas / Simples (persisted, animated with the same view transition as sorting). *(Superseded for card anatomy and widths by "Ficha de balcão" below.)* At the time the simple card kept cover, verdict stamp, starburst, title (2 lines), completion date and status label, and dropped year, hours, sub-scores, excerpt and skulls.
- **Category weight.** Each score picker in the editor has a small printed select at the right of its label: Relevante, Normal, Pouco importante, Não tem. Normal is a quiet translucent chip; any other value becomes paper with an ink edge so a changed weight is visible at a glance. Não tem strikes the label through at 55% and removes the 0–10 row. In the reader, Relevante and Pouco importante show as a small lucide arrow up / down after the label (with the weight name as a tooltip) and Não tem rows are not rendered. (On wall cards Não tem now keeps its struck boletim cell; see "Ficha de balcão".) No explanatory copy about weights is shown; the numbers explain themselves.
- **Cover source.** Under the chosen game in the editor, a text-only switch "Capa · Wikipedia · RAWG" in condensed caps: the current source is ink with a red underline; RAWG is disabled (45%) without a key, with a tooltip pointing to Ajustes; a 12px spinner shows while the other source is searched. The default source is a radio pair in Ajustes.
- **Hours played.** A paper strip beside the completion date: right-aligned tabular number, "horas" unit in condensed caps, accepts "12,5". Shown in the card meta line and the reader meta ("120 h jogadas").
- **Tachinha shadow.** The raster pins carry `drop-shadow(2px 3px 1.5px rgb(0 0 0 / .42)) drop-shadow(5px 7px 5px rgb(0 0 0 / .22))`, the shadow falling down and right onto the cartolina, consistent with the overhead-left fluorescent light.
- **Copy diet.** Removed: the "vale 2x" and "2x" tags, the hint under the Média, the visible search hint (kept for screen readers), the date hint and the "opcional" labels.

## Open sheets (reader refinement)

- **Pastel sheets.** Every dialog sheet (reader, editor, settings) renders its stock as a pastel: `color-mix(in oklab, var(--stock) 30%, var(--paper))`, with the full neon stock kept as a 12px band across the top edge (`inset 0 12px 0 var(--stock)`), where the pin sits. Neon at 760px wide fought the cover, stamp and text; on the wall the cards stay full neon.
- **Verdict block.** In the reader the Média no longer sits in the bar list and carries no label. It leads a block: the big paper starburst (120px) on the left; to its right, stacked, the verdict stamp at reader size (1.3rem, -5deg, struck on the sheet, not on the cover), then the status label and difficulty skulls. A dashed rule separates the block from the category bars. The difficulty label reads "Dificuldade média" / "Sem dificuldade" so it can't be mistaken for the score.
- **Mobile reader.** Cover shrinks to `min(170px, 52%)` so the verdict block and bars reach the first screen.

## Restructure (pages pass)

The single long page was split so the wall reaches the first screen: before, the masthead, the pending queue and three tab groups took ~560px on desktop and ~1000px on a phone before the first card; now ~215px and ~330px.

- **Compact cartaz.** "Meu mural de jogos" on one line at 2.05rem (two lines at 1.5rem on phones), same yellow stock, pins and red scribble. The tally line moved to the Ranking page's Balanço.
- **Section tabs.** Small cartolina strips in Barlow Condensed 800 caps, each with its own stock (Mural laranja, Pra depois verde, Ranking azul, Ajustes lilás). Inactive tabs are faded: `color-mix(in oklab, var(--stock) 34%, #4d4e55)`, 66% on hover. The current tab is full neon, raised 5px, with the hanging-card shadow and a tachinha on its top edge. Tabs tilt ±0.7–1.4deg. Counts (reviews, pending) are tabular at 66%.
- **Select tab.** A shelf tab that wraps a native `<select>` made invisible over the whole tab, so the browser picker still opens; the tab shows a faded prefix ("Ordenar"), the current value and a chevron. Ordenar merges what used to be four sort tabs plus five "Qual nota" sub-tabs: Data, Nome, Status, then a "Nota" group (Média, História, Diversão, Jogabilidade, Visual). On phones a second select tab ("Mostrar") replaces the verdict tabs.
- **Density icons.** Completas / Simples are two icon-only tabs (Rows3 / LayoutGrid) with spoken labels and tooltips, no group label.
- **Pra depois page.** The torn notebook pages live on their own page under a masking-tape heading, in a grid of `minmax(168px, 1fr)` (pages up to 200px wide). Empty state: a loose notebook sheet taped to the wall explaining "Salvar pra depois". Saving a draft from another page shows a toast with "Ver fila"; finishing a draft goes to the Mural and plays the landing.
- **Ranking page.** A counter receipt (thermal paper with grain, zigzag bottom edge via a two-layer mask, drop-shadow, -0.5deg) listing every review by the chosen category, chosen with shelf tabs on a rail above it. Rows: ordinal ("1º", ties share it), thumb sleeve, name in condensed 800 with year · status, score in marker (red-deep from 9). First place gets a larger row, the name in marker and the pen circle drawn around its score. Reviews with no score in the category are left out, with a line saying how many. Beside it (below on narrow screens) a second receipt, **Balanço**: dotted-leader totals, "Mais jogado", "Veredito mais dado" and a double-ruled "Média geral".
- **Ajustes page.** The settings sheet became a page of two pinned cartolinas side by side: Backup (azul) and Catálogo de jogos (lilás).
- **Removed.** The masthead tally, the in-header pending queue, the visible group labels "Mostrar / Ordenar / Fichas / Qual nota" (kept as accessible names), the "Qual nota" sub-rail, the settings dialog and the "Ajustes e backup" header button.

## Card diet (grid pass)

*Superseded by "Ficha de balcão" below: the cover-top anatomy, abbreviated boletim, absent Não tem cells, clamped excerpt and even-height rows described here no longer ship. Kept as history.*

The full card carried eleven competing elements, and four dotted sub-score rows per card turned a wall of 14 into 56 leader lines. The card then got one hero, one voice, one data line and one note:

- **Boletim.** The four sub-scores sat in one row of ruled cells (HIS · DIV · JOG · VIS, abbreviations from `SCORE_ABBR`, full names for screen readers). Each cell had a condensed-caps label over a marker numeral; cells were split by 1.5px pen rules at 20% ink, and the row was closed above and below by 1.5px rules at 32%. Não tem cells were simply absent (the row got 3 columns). Weight arrows shrank to 10px after the label. When the wall was sorted by a category, that cell got the highlighter band.
- **Cut from the grid** (still in the reader): the release year, the difficulty skulls. The excerpt was clamped to 2 lines (hidden on phones).
- **Kept:** tachinha, sleeve cover with the starburst, the verdict stamp struck on the cover, the marker title, date · hours, and the status sticker, which closed the written content.
- **Even rows.** The wall grid stretched its items, so every card in a row had the same height; a card with less written on it showed blank cartolina at the bottom. The per-card drop (0–14px) and tilt still broke the line at the top.

## Wall in sections (composition pass)

Squint test before this pass: fourteen neon rectangles of identical weight, with no primary, secondary or grouping. The wall now reads as a display the shop owner arranged.

- **Sections follow the sort.** `WallView.groups` splits the already sorted list into runs sharing one key: month of completion for Data ("Setembro de 2026"), grade band for Média ("9 ou mais", "Na casa do 8", … "Abaixo de 5"), the integer score for one category ("Diversão 10", then "Sem nota de Diversão" at the end), the folded first letter for Nome ("#" for digits), and Platinados / Finalizados / Incompletos for Status. Direction reverses sections and their contents together.
- **Section label.** A `.tape-label` (global: masking tape at 94% with grain, torn ends via clip-path, marker 1.3rem, -1.5deg; alternating 1.2deg and -0.6deg by position) beside a chalk summary in condensed caps: "3 jogos · média 9,1" (no average when sorting by score, or for single-game sections). The label carries a view-transition name so it slides to its new place when the sort changes, while the cards fly to their new sections.
- **Topology.** Sections flow side by side in a wrapping flex row (64px row gap, 76px column gap); inside a section, cards wrap at a fixed width, rows stretched to equal height. Tight inside, generous between: proximity alone makes the groups, with no box around them. On phones sections stack (48px apart). *(Card widths, gaps and the phone column count here were superseded by "Ficha de balcão": the pass shipped 232px / 184px cards with 40px/26px gaps and two columns on phones.)*
- **Objects on the cover, writing on the card.** *(Superseded by "Ficha de balcão": nothing sits on the cover any more.)* This pass put every physical label on the sleeve: the verdict stamp (top-left), the status price-gun sticker (bottom-left, 9px out of the edge) and the starburst (bottom-right), with only handwriting on the cartolina. The footer row went away.
- **Date without redundancy.** In month sections the card shows only the day ("20 de set"); the full date stays in the accessible name and in the reader.
- **Known trade-off.** Side-by-side sections leave a hole at the end of a row when the next section does not fit; it reads as bare wall between pinned groups.

## Ficha de balcão (card redesign pass)

A critique scored the wall card 19/36: the frame was authored, but at a squint the wall read as cover posters in neon mats, the anti-reference. The cover was buried under three objects (the stamp over 65% of its width, the status sticker, the starburst; about 9 of 14 logos obscured). The score hierarchy was inverted (an integer "9" at 2.1rem outweighed "9,4" at 1.7rem, and the Média was only 1.3x the sub-scores). Keyboard focus was invisible (an ink ring on the graphite wall, about 1.1:1) and the accessible name carried no score, verdict or status. The boletim was illegible (about 11.5px, 9.9px on phones) and reflowed when a category was Não tem. The owner's excerpt was cut mid-word and hidden on phones. The user then set the direction: the verdict must weigh as much as the Média, the starburst on the card was ugly and goes, and names take at most two lines.

- **Horizontal card.** The cover moved to the left of the text, taped on with masking tape and counter-tilted; nothing sits on the art. Cards widened (Completa 330–424px, three per section row; Simples 270–300px), and phones went to one column of full-width horizontal cards.
- **One judgment label.** *(Superseded within this pass by "Two-part ticket" below.)* The Média and the verdict share the card's only white paper: the Média as a marker price (3.5rem + 2.1rem decimal, red-deep from 9), the verdict as an ink-tone stamp worn by `--stamp-wear`. The starburst stays only in the editor and reader.
- **Two-part ticket.** The paper label with the marker numeral and the worn ink stamp read as muddy and mismatched: the grain multiplied the white to grey, the marker numeral and the stamp sat at different scales, and the lowered decimal read as an exponent. It was replaced by the two-part rental ticket (the Média in Barlow Condensed italic on flat paper, the verdict in white on a band in its ink, one height, a notched perforation between them) for equal weight and a crisp finish. VerdictStamp's `tone` input, `--stamp-wear`, `--stamp-tilt` and the marker grade numeral were removed.
- **Quiet status.** Finalizado is silent; only Incompleto and Platinado get the price-gun label, under the meta.
- **Readable writing.** Title at 1.62rem clamped to 2 lines; meta and boletim labels in full ink; the lead sentence whole via `leadSentence`, on phones too; four fixed boletim cells with full names, Não tem struck in place.
- **Focus and names.** A 3px yellow ring at 5px offset around the whole card, a press state, an accessible name that carries name, Média, verdict, status and date, and a decorative cover.
- **Pin** remapped to 42–58% so it sits over the title, clear of the tape.
