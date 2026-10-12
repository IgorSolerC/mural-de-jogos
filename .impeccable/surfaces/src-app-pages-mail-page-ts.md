---
version: 1
slug: "src-app-pages-mail-page-ts"
primary_target: "src/app/pages/mail-page.ts"
related_targets: ["src/app/pages/mail-page.html","src/app/pages/mail-page.scss","src/app/ui/feed-post.ts","src/app/ui/notice-list.ts","src/app/ui/person-photo.ts"]
---

# Amigos (`#/amigos`)

Scope: the Amigos page (Feed, Avisos, Pessoas). Mode: Operate.

Audience and job: the owner, signed in, checking what friends pinned and who interacted with their own cards; follows people by code. Opened a few times a week, on desktop and phone. The friend's real wall card is the content; the score difference against the owner's own card is what no other network has.

Constraints: no API change; the friend's card keeps the wall's width; spoilers stay masked; `?aba=` keeps `chegou` (Feed) as the default and `pessoas`; a person's name always opens their profile.

Decision record: the user declined the decision round ("Confio em você e em seu julgamento") and asked only that Impeccable refine and build the chosen structure. Chosen by the agent: feed plus notice board (dealt index 2 of seed c91a3d7c).

## Direction contract

THESIS: A social feed made of pinned cards: one post per friend's card, read top to bottom, with the notices about your own cards taken out of the stream and hung on a real notice board. Refuses the old arrangement where follow, reaction and comment notes pushed the cards down as large paper slips.

OWN-WORLD: The site's pegboard wall. Posts are the wall's cartolina cards under a chalk header (the person's profile photo as a small instant photo, name in marker, time in label caps) with chalk actions and one paper slip in the friend's blue pen. Notices and people live on cream index-card sheets inside the pine frame with screws over papelão (the Ajustes board). Tabs are cream paper labels; the open one is hi-vis yellow.

STORY: The owner sees who pinned what and how it compares with their own score, reacts right on the post and reaches the comments in one tap (the card opens on them), and notices at a glance that someone reacted, commented or followed.

FIRST VIEWPORT: Tape head "Amigos" with three paper labels (Feed, Avisos with the count of new notices, Pessoas) on one line. Left, under the cartaz, a column the width of the widest wall card (424px): post header, the card, action row (Reagir, the others' reactions, Comentar with its count; at the right end the score slip or "Quero jogar"). From 800px of page width, a pine board 340 to 404px wide against the page's right margin, under the bottons (sticky when the window is at least 900px tall): the "Avisos" sheet with the newest five and a taped note with who you follow and "Seguir alguém". Below that width the board is the Avisos tab.

FORM: Feed + quadro de avisos, position 2 of 7 on the grounded list; seed key c91a3d7c. Signature move: the notice board is a literal framed board, and a new notice carries the ink "Novo" sticker pressed on.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
