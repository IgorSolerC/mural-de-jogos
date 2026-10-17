# Padronização: inventário da varredura (17/out/2026)

Varredura de `src/app` (core, ui, pages, kits SCSS e `styles.scss`) atrás de coisas feitas de dois
jeitos. Regra: tudo continua funcionando e parecendo igual; quando duas cópias divergem, fica a mais
usada ou a mais recente aprovada (DESIGN.md), e o item diz qual. Nada da arte do papel (paper-art,
decor-art, pattern-motifs, tear, paper.ts, filtros do paper-layer) é tocado: está congelado.

Ordem: menor risco primeiro. Um commit por item. `[x]` feito, `[ ]` pendente, `[-]` fora (com o porquê).

## Por dentro (TypeScript, sem mudança visível)

1. [x] **Ordem dos nomes e `fold` num módulo só** (`core/text.ts`, sem imports). O `Intl.Collator('pt-BR', base, numeric)`
   estava declarado 9 vezes, mais 2 `localeCompare` com as mesmas opções (Pra depois, Wishlist). `fold` mudou para lá;
   `review.ts` reexporta.
2. [ ] **Chaves de texto**: `linkKey` (note-links) = `workKey` (review); `lookKey` (category-looks) repetido inline em
   note-tabs, kanban-sort, wall-view, comparison; o corpo do slug repetido em `customBonusId` e `categoryBonus`;
   `cleanCategory` = `cleanBonusLabel` (mesmo limite 32); `cap` repetido inline.
3. [ ] **Plural**: `plural(n, um, muitos)` privado no profile-edit; `spokenComments` e ~25 ternários `n === 1 ? …`
   iguais; "N anotações" montado à mão onde `countOf(NOTES)` já dá; ternário morto em profile-hero (`'com fichas'` nos dois lados).
4. [ ] **Datas**: `news.today` e `muraldle.dayKey` são `localDay`; `stats-page.created` monta o dia à mão; `previousDay`
   e follow partem 'AAAA-MM-DD' à mão (= `parseDay`); `DAY` = 86 400 000 redeclarado 9 vezes; `MONTHS` curtos e longos
   em 3 arquivos cada; formatadores de data longos repetidos (done-stamp, wall-view); "hoje/ontem/há N dias" igual em
   draft-card e settings.
5. [ ] **Guardar no navegador**: um `core/storage.ts` (`readText`, `readJson`, `writeJson`, `writeText`, `removeKey`) no lugar de
   ~25 `try { localStorage.setItem(...) } catch {}` e dos 3 leitores idênticos (`safeGet`, `readChosen`, `readNext`).
   A camada do IndexedDB (local-data) fica como está: ela precisa saber quando a cota acaba.
6. [ ] **Movimento reduzido**: `reducedMotion()` (ui/veil) existe, mas 12 lugares leem `matchMedia` à mão.
7. [ ] **Pequenos iguais**: `tilt` de comments-panel = person-photo; `host` de audio-track = glued-media; cloud-sync importa
   `canonicalJson` duas vezes com dois nomes.
8. [ ] **Ociosidade**: `requestIdleCallback` com reserva copiado em wall-cards, paper-layer e sound-warmup (tempos diferentes,
   ficam como parâmetro).
9. [ ] **Ouvintes**: o arrastar do quadro do Kanban não tira os ouvintes da janela ao sair da página; os menus (feed-menu,
   kind-switcher, reações) ouvem todo clique da página mesmo fechados (o da wish-clip já só ouve aberto).
10. [ ] **"Está escrevendo?"**: seis jeitos de decidir se a tecla é para um campo (app, kanban, leitura, seleção, jogos).
11. [ ] **Copiar com bilhete**: copiar para a área de transferência + bilhete repetido em 7 lugares.

## Correções achadas na varredura

12. [ ] **Bilhete escondido atrás de uma folha aberta**: o bilhete fica embaixo de um `<dialog>` modal (camada de cima) e
    o Desfazer não pode ser clicado: ajustes da coluna do Kanban (vestir o card, ordenar), Pessoas (seguir), comentários.
13. [ ] **Dia em UTC**: o Card padrão do Kanban usa o dia UTC (`toISOString`), que depois das 21h no Brasil já é amanhã.
14. [ ] **Fechar sem `aria-hidden`**: o X da leitura e do editor anunciam o ícone.

## Estilos (SCSS)

15. [ ] **Tokens que faltam**: `--error-ink` é usado 14 vezes e nunca definido (vale sempre o reserva `#6b0000`, mais 3
    `#6b0000` soltos); reservas erradas de tokens que existem (`--hi`, `--red-deep`, `--caneta-azul`, `--ink-2`), que nunca
    valem; cores repetidas sem token: papel da ficha `#fbf9f2` (16), papel da orelha `#fffcf2` (14), manilha `#f3e5bb` (11);
    `--f-mono` (5 pilhas monoespaçadas).
16. [ ] **Dourado repetido**: o mesmo gradiente dourado escrito 4 vezes (filter-sheet, judge-label, verdict ×2).
17. [ ] **Tachinha com a cor padrão escrita**: `color="#e62e2d"` em 24 tachinhas, que já é o padrão do `app-pin`.
18. [ ] **Folha creme**: `kit.folha` existe e é usado uma vez; settings copia igual.
19. [ ] **Linha de ajuste** (`.linha`, `.linha-titulo`, `.linha-desc`): igual em settings, mural-config e Amigos, sem mixin.
20. [ ] **Título das folhas** (`.titulos`, `.sub`): 7 cópias nas folhas que já usam `_sheet.scss`.
21. [ ] **Escondido para os olhos** (`sr-only`) copiado em 8 media queries: mixin.
22. [ ] **Feltro das reações**: 4 cópias inline do `felt.remendo`.
23. [ ] **Interruptor**: 10 cópias do botão com a bolinha; uma sem `aria-describedby`.

## Fora, por enquanto (mudaria a aparência aprovada ou o comportamento)

- [-] **Abas de manilha** (global `.divisorias`, abas das anotações, quadros do Kanban): as do Kanban são 4px mais altas, de
  propósito ou não; juntar mudaria a altura de uma delas. Precisa do usuário.
- [-] **Botões de tinta menores** (filtro, comentários, painéis do editor) e **9 bolinhas de contagem**: tamanhos diferentes
  em cada lugar; igualar mudaria o desenho aprovado de cada um.
- [-] **Contornos de foco** redundantes (73 `outline: 3px solid var(--ink)`): os deslocamentos variam (12 valores); tirar
  mudaria onde o anel aparece.
- [-] **Pedidos da varredura de UI que mudam o jeito** (`setTimeout` → `focusAfterRender` em 35 lugares, a confirmação do
  "Guardar só" no editor virando folha, radios sem setas): mudam foco ou fluxo.
- [-] **Hashes** (`hash64`, `bandColor`, `wobble`, tilts de reações): ids e cores guardados dependem deles.
