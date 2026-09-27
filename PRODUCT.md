# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Angular (user-pinned). Standalone components, signals, SCSS. No backend: runs entirely in the browser and deploys as static files.

## Users

One person: the owner, a solo player keeping a personal diary of the games they have played. Uses it on desktop and on the phone, often right after finishing (or giving up on) a game, when the opinion is fresh. Interface language is Brazilian Portuguese (pt-BR).

## Product Purpose

A personal game-review wall. The user finds a game by name, writes a review with scores, and pins it to a wall that grows into a visual record of everything they have played. Success: logging a review takes under a minute, and browsing the wall is a pleasure the user comes back to.

## Positioning

Not a social review site and not a backlog tracker. It is a private wall of pinned index cards, one per game, where the collection itself is the artifact. No accounts, no feeds, no public scores.

## Operating Context

- Reviews are written after a play session or after finishing a game.
- The wall is browsed to remember, compare, and rank past games.
- Data lives only in this browser (localStorage). The user can export all reviews to a JSON file and import it back as a backup or to move browsers.

## Capabilities and Constraints

- **Game lookup:** typing a name shows an autocomplete dropdown of known games. The default source (Wikipedia or RAWG) is chosen in Ajustes; RAWG needs a key. Per game, the cover source can be switched discreetly in the editor, which looks the same game up in the other source. Choosing one shows the game's name and cover art. Default source: Wikipedia (no key, CORS via `origin=*`, `pageimages` with `pilicense=any` for cover thumbnails). Optional: if the user pastes a free RAWG API key in settings, RAWG becomes the source. RAWG only offers background art without the title, so when a RAWG game is on Steam (found via RAWG's `/games/{id}/stores`), the cover becomes Steam's official vertical library art (`library_600x900.jpg`); otherwise the RAWG art stays. The user may also type a name that is not in the list and review it without a cover.
- **Review fields:** four scores 0–10: História, Diversão, Jogabilidade, Visual. The final score (Média) is never typed: it is the weighted average, Diversão with a base weight of 2x, shown with one decimal. Each category has a per-review weight: Relevante (2x its base), Normal, Pouco importante (half), or Não tem (left out of the average and needs no score), so a game is not punished for lacking something it never tried to have (a clicker with no story). Every category that counts needs a score. Hours played (optional). Status (Incompleto, Finalizado, Platinado); Veredito, optional (Masterpiece, Recomendo, Legalzinho, Meh, Chato), each with its own icon; Dificuldade (Nenhuma, Fácil, Média, Difícil, Impossível); completion date ("Concluído em", or "Jogado até" when Incompleto), today by default and editable for retroactive entries, never in the future; free-text review.
- **Wall:** all reviews as cards, Completas (adds hours, the four scores in one row, and a two-line excerpt; release year and difficulty live in the reader) or Simples (cover, name, date, Média, status and verdict only), a remembered preference. The wall is split into labelled sections that follow the sort (month, grade band, letter or status). Text search. Sort by completion date, highest score (per category: Média, História, Diversão, Jogabilidade, Visual), alphabetical, and completion status.
- **Pra resenhar depois:** from the editor, a game can be saved with only its name and cover ("Salvar pra depois"), outside the wall. These pending games live on their own page ("Pra depois"), as torn notebook pages taped to the wall (not cartolina), and are not counted, filtered or sorted with reviews. Opening one continues the review; pinning it removes it from the queue. Included in the JSON backup.
- **Ranking:** a separate page ranks every review by Média or by one category, with totals (games, statuses, hours, most played, most given verdict, overall average).
- **Pages:** Mural, Pra depois, Ranking and Ajustes, as tabs in a shared header.
- Reviews can be edited and deleted.
- Must work offline for existing reviews; lookup needs a network connection and must fail gracefully without one.

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
