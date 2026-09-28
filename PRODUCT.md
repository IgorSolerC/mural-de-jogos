# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Angular (user-pinned). Standalone components, signals, SCSS. No backend: runs entirely in the browser and deploys as static files.

## Users

One person: the owner, keeping a personal diary of the games they have played, the books they have read and the films, series and animes they have watched. Uses it on desktop and on the phone, often right after finishing (or giving up on) something, when the opinion is fresh. Interface language is Brazilian Portuguese (pt-BR).

## Product Purpose

A personal review wall ("Meu Mural"). The user finds a game, book, film, series or anime by name, writes a review with scores, and pins it to a wall that grows into a visual record of everything they have played, read and watched. Success: logging a review takes under a minute, and browsing the wall is a pleasure the user comes back to.

## Positioning

Not a social review site and not a backlog tracker. It is a private wall of pinned index cards, one per title, where the collection itself is the artifact. No accounts, no feeds, no public scores.

## Operating Context

- Reviews are written after a session or after finishing something.
- The wall is browsed to remember, compare, and rank past games, books, films, series and animes.
- Data lives only in this browser (localStorage). The user can export all reviews to a JSON file and import it back as a backup or to move browsers.

## Capabilities and Constraints

- **Murais:** five walls: Jogos, Livros, Filmes, Séries and Animes. The header reads "Meu mural de *jogos*"; the word is a button that opens a notepad slip listing the five walls (with counts), and choosing one swaps the whole site to that wall on the same page. The choice is remembered. Nothing crosses walls: each has its own cards, Pra depois queue, Ranking, Lado a lado selection, written bonuses and colour rotation. The backup is one file with every wall. Each wall is a profile in `core/kinds.ts`:

  | Mural | Weighs 2x | Other three | Status (3) | Amount | Difficulty |
  |---|---|---|---|---|---|
  | Jogos | Diversão | História, Jogabilidade, Visual | Incompleto / Finalizado / Platinado | hours | yes |
  | Livros | Envolvimento | História, Personagens, Escrita | Larguei / Lido / Relido | pages (whole) | yes, "Dificuldade de leitura" |
  | Filmes | Envolvimento | Roteiro, Atuação, Visual | Não terminei / Assistido / Revisto | — | no |
  | Séries | Envolvimento | Roteiro, Personagens, Visual | Parei / Terminei / Revi | — | no |
  | Animes | Envolvimento | Roteiro, Personagens, Animação | Parei / Terminei / Revi | — | no |

  Stored values never change meaning: a card's `kind` is `jogos`, `livros`, `filmes`, `series` or `animes` (cards from before the walls are `jogos`); the three statuses are stored as `incompleto`, `finalizado`, `platinado` in every wall, only the names change; the same score key means the same thing in every wall (História is História in a game and a book). The field that holds the amount is still `hoursPlayed`, and the reviewed item is still `game`, because renaming them would break older backups.
- **Lookup:** typing a name shows an autocomplete dropdown from the wall's catalogue. Books: Open Library (no key, CORS; the last word gets a `*` because it only matches whole words; covers from `covers.openlibrary.org/b/id/{id}-L.jpg?default=false`, so a missing cover errors into "sem capa"; the author is shown under the title and kept on the card). Films, series and animes: English Wikipedia, restricted to pages with `Infobox film`, `Infobox television` or `Infobox animanga/Header`. Games: Wikipedia (`Infobox video game`) or RAWG, chosen in Ajustes; RAWG needs a key. Per game, the cover source can be switched discreetly in the editor, which looks the same game up in the other source. Wikipedia needs no key (CORS via `origin=*`, `pageimages` with `pilicense=any` for cover thumbnails). RAWG only offers background art without the title, so when a RAWG game is on Steam (found via RAWG's `/games/{id}/stores`), the cover becomes Steam's official vertical library art (`library_600x900.jpg`); otherwise the RAWG art stays. The user may also type a name that is not in the list and review it without a cover.
- **Review fields:** the wall's four scores 0–10 (see Murais). The final score (Média) is never typed: it is the weighted average, the wall's centre category (Diversão, Envolvimento) with a base weight of 2x, shown with one decimal. Each category has a per-review weight: Relevante (2x its base), Normal, Pouco importante (half), or Não tem (left out of the average and needs no score), so a game is not punished for lacking something it never tried to have (a clicker with no story). Every category that counts needs a score. The wall's amount, optional (hours played, pages read; none for films, series and animes). Status (three, named per wall); Veredito, optional (Masterpiece, Recomendo, Legalzinho, Meh, Chato), each with its own icon; Dificuldade, only on the walls that have it (Nenhuma, Fácil, Média, Complicado, Difícil, Impossível; stored values never change meaning: `dificil` is labelled Complicado, `impossivel` Difícil, and the top level is `infernal`, labelled Impossível); completion date ("Concluído em", or "Jogado até" when Incompleto), today by default and editable for retroactive entries, never in the future, or "Data não definida" for games played so long ago the day is lost (those always sort last by date, in either direction, under their own section); free-text review.
- **Bônus:** optional, as many as the user likes, "a favor" or "contra" (things the four categories do not cover, such as "Trilha sonora incrível" or "Muitos bugs"; each wall has its own ready-made catalog). Each "a favor" bonus pulls the Média as one more score of 10 with weight 1 would (the weight of a Normal História); each "contra" as one more 0 with weight 1. Each bonus moves the Média by at most 0.25 either way (one flaw must not turn a 5.5 into a 4.5): each is measured alone against the categories' average, capped, and the shifts add up; the Média stays within 0–10. Bonuses alone never make a Média: at least one category score is needed. A ready-made catalog per wall (22 for games, about 20 for the others) plus any the user writes; written ones come back as options in later reviews of the same wall (derived from the reviews themselves, so an unused one disappears). Shown as stickers on Completa cards, as a "+N −N" tally on Simples cards, in the reader with the Média they would have without them, in Nota a nota, and in the Ranking's Balanço. The wall search matches bonus names. Included in the JSON backup.
- **Wall:** all reviews as cards, Completas (adds hours, the four scores in one row, and a two-line excerpt; release year lives in the reader) or Simples (cover, name, date, Média, status and verdict only). Both show the difficulty skulls (filled ones only, no label) beside the date on the same line; Nenhuma shows nothing, a remembered preference. The wall is split into labelled sections that follow the sort (month, grade band, letter or status). Text search. Filter by verdict (Masterpiece, Recomendo, Legalzinho, Meh, Chato, or no verdict). Sort by completion date, highest score (per category: Média, História, Diversão, Jogabilidade, Visual), alphabetical, and completion status.
- **Pra resenhar depois:** from the editor, a title can be saved with only its name and cover ("Salvar pra depois"), outside the wall. These pending games live on their own page ("Pra depois"), as torn notebook pages taped to the wall (not cartolina), and are not counted, filtered or sorted with reviews. A text search filters the queue by name. Opening one continues the review; pinning it removes it from the queue. Included in the JSON backup.
- **Lado a lado:** on the Mural, a "Marcar" mode lets the user tick any reviews (one selection at a time, kept in this browser, not in the backup) and open them on their own page: only those cards, in one flow, plus a "Nota a nota" sheet comparing every score and fact column by column, with the best of each score row circled. Built for comparing a series (every GTA) or any hand-picked set.
- **Ranking:** a separate page ranks the open wall's reviews by Média or by one of its categories, with totals (count, the three statuses, the amount and the longest, most given verdict, overall average).
- **Pages:** Mural, Pra depois, Ranking and Ajustes, as tabs in a shared header.
- Reviews can be edited and deleted. Deletions are remembered (and travel in the backup), so merging an older backup never brings a deleted review or pending item back.
- Must work offline for existing reviews: a service worker (`public/sw.js`, production only) keeps the site and every cover already seen; the site is installable (manifest). Lookup needs a network connection and must fail gracefully without one.
- Data safety: pinning a card asks the browser for persistent storage; a notepad reminder above the wall asks for a backup when the last one is over 30 days old and something changed since (or, with no backup ever, from 5 cards); "Depois" snoozes it for a week.

## Brand Commitments

- The wall is a literal corkboard/mural: reviews look like physical cards, each slightly tilted at a random angle and held to the wall by a pin. (User-pinned, binding.)
- "LINDO, mas sem sacrificar usabilidade": beauty is a requirement, but it never gets in the way of reading, filtering, or editing.

## Evidence on Hand

No existing reviews, logos, or assets. Cover art comes from the lookup source at runtime. Example reviews used during development are synthetic and must not ship as defaults.

## Product Principles

1. The wall is the product. Every review earns its place as a physical-feeling object.
2. Fast to log. Finding the game and scoring it should feel like jotting on a card, not filling in a form.
3. Private and portable. Nothing leaves the browser except lookup queries, and the user can always take their data with them.
4. Delight never blocks the task. Tilts, pins, and textures stay out of the way of reading, searching, and sorting.

## Accessibility & Inclusion

Keyboard-operable autocomplete (combobox pattern), readable contrast on the wall texture, respects `prefers-reduced-motion`, usable at 360px width.
