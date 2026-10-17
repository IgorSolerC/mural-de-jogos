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
2. [x] **Chaves de texto**: `linkKey` (note-links) = `workKey` (review); `lookKey` (category-looks) repetido inline em
   note-tabs, kanban-sort, wall-view, comparison; o corpo do slug repetido em `customBonusId` e `categoryBonus`;
   `cleanCategory` = `cleanBonusLabel` (mesmo limite 32); `cap` repetido inline. Agora `labelKey`, `nameKey`,
   `slugOf`, `cap` e `cleanLabel` em `core/text.ts` (o `fold(by).trim()` do autor em comparison fica: não junta espaços).
3. [x] **Plural**: `plural(n, um, muitos)` privado no profile-edit; `spokenComments` e ~25 ternários `n === 1 ? …`
   iguais; "N anotações" montado à mão onde `countOf(NOTES)` já dá; ternário morto em profile-hero (`'com fichas'` nos dois lados). Feito nos `.ts` (`plural` em `core/text.ts`, e
   `countOf`/`revisitCountOf` usam ele); as frases com verbo concordando e os ternários dos templates ficam (cada um é uma frase).
4. [x] **Datas**: `news.today` e `muraldle.dayKey` são `localDay`; `stats-page.created` monta o dia à mão; `previousDay`
   e follow partem 'AAAA-MM-DD' à mão (= `parseDay`); `DAY` = 86 400 000 redeclarado 9 vezes; `MONTHS` curtos e longos
   em 3 arquivos cada; formatadores de data longos repetidos (done-stamp, wall-view); "hoje/ontem/há N dias" igual em
   draft-card e settings. Agora em `core/dates.ts` (`DAY_MS`, `MONTHS_SHORT`, `MONTHS_LONG`, `longDayFmt`, `longMonthFmt`,
   `localDay`, `todayISO`, `parseDay`, `daysAgoLabel`); `review.ts` reexporta os três de dia. As contagens de dias que
   arredondam diferente (piso de 24 h × dias de calendário) ficam como estão: dariam um dia de diferença.
5. [x] **Guardar no navegador**: um `core/storage.ts` (`readText`, `readJson`, `writeJson`, `writeText`, `removeKey`) no lugar de
   ~25 `try { localStorage.setItem(...) } catch {}` e dos 3 leitores idênticos (`safeGet`, `readChosen`, `readNext`).
   A camada do IndexedDB (local-data) fica como está: ela precisa saber quando a cota acaba. Os leitores de JSON
   que conferem a forma dentro do mesmo `try` ficam (a conferência também pode falhar e cair no padrão), e o
   `writeNext` do convite para entrar também (a data é montada dentro do `try`).
6. [x] **Movimento reduzido**: `reducedMotion()` (ui/veil) existe, mas 12 lugares leem `matchMedia` à mão. Mudou para
   `core/motion.ts` (o core não importa mais da ui para isso) e os 12 usam ele.
7. [x] **Pequenos iguais**: `tilt` de comments-panel = person-photo; `host` de audio-track = glued-media; cloud-sync importa
   `canonicalJson` duas vezes com dois nomes. Agora `photoTilt` (profile-people) e `hostOf` (widgets).
   A inicial da foto ficou: a dos comentários pega a primeira unidade, a da foto o primeiro caractere (emoji muda).
8. [x] **Ociosidade**: `requestIdleCallback` com reserva copiado em wall-cards, paper-layer e sound-warmup (tempos diferentes,
   ficam como parâmetro). Agora `whenIdle`/`cancelIdle` em `core/idle.ts`, cada um com o seu prazo e a sua reserva.
9. [x] **Ouvintes**: o arrastar do quadro do Kanban não tira os ouvintes da janela ao sair da página; os menus (feed-menu,
   kind-switcher, reações) ouvem todo clique da página mesmo fechados (o da wish-clip já só ouve aberto). Agora `closeOnOutsidePress` (ui/outside-press.ts) nos quatro, e o
   arrastar do quadro solta ao sair da página e também no `pointercancel`.
10. [-] **"Está escrevendo?"**: seis jeitos de decidir se a tecla é para um campo (app, kanban, leitura, seleção, jogos).
   Fora: cada um decide uma coisa diferente de propósito (os jogos ignoram as teclas com um diálogo aberto, a leitura
   mora num diálogo, o `/` do topo conta `select`, a marcação não); juntar mudaria quando as teclas valem.
11. [x] **Copiar com bilhete**: copiar para a área de transferência + bilhete repetido em 7 lugares. Agora `Toasts.copy`;
   em Amigos, a falha de copiar o link e o código diz "Não deu para copiar. …" como em Ajustes e no Perfil (M1, nas Novidades).

## Achados extras (depois do inventário)

24. [x] **Seguir com bilhete**: o mural de um amigo e o perfil tinham o mesmo seguir/deixar de seguir com os bilhetes
    escritos à mão, e Amigos e Pessoas variações; o "Não deu certo agora. Tente de novo." estava em cinco lugares. Agora
    `FollowToasts` (ui/follow-toasts.ts) e `failedText`/`TRY_AGAIN`; o Pessoas continua com o Desfazer depois de seguir.

25. [x] **Pra depois e Wishlist**: as mesmas três ordens, a mesma comparação e a mesma conta das colunas copiadas nas duas
    páginas. Agora `SHELF_ORDERS`, `shelfCompare` e `shelfColumns` em `core/clipping.ts`, ao lado da `collage`
    (cada uma com a sua largura: 168/32 e 172/34); fotos idênticas.

26. [x] **Os dois seletores de fichas** (Escolher a nota / Buscar nota e Escolher fichas do perfil): as abas de mural com a
    contagem e o filtro por mural e busca eram cópias. Agora `kindTabs` e `matchingCards` (ui/picker-kit.ts); a ordem de
    cada um fica (a escolhida e as mexidas por último num, as escolhidas e A–Z no outro).

## Correções achadas na varredura

12. [x] **Bilhete escondido atrás de uma folha aberta**: o bilhete fica embaixo de um `<dialog>` modal (camada de cima) e
    o Desfazer não pode ser clicado: ajustes da coluna do Kanban (vestir o card, ordenar), Pessoas (seguir), comentários. Um `popover` por cima do diálogo continua inerte no
    Chrome (testado), então o bilhete entra no diálogo modal de cima enquanto aparece e volta quando some ou ele fecha.
13. [x] **Dia em UTC**: o Card padrão do Kanban usa o dia UTC (`toISOString`), que depois das 21h no Brasil já é amanhã. Também o nome do arquivo "antes da nuvem"
    nos Ajustes (`copy.at.slice(0, 10)`). Os dois usam o dia local agora.
14. [x] **Fechar sem `aria-hidden`**: o X da leitura e do editor anunciam o ícone. Eram 33 dos 413 ícones sem
    `aria-hidden` (todos decorativos); os seletores de ficha (card-picker, profile-picker) usavam o X com traço 2.4, e o
    padrão das outras 12 folhas é 22px com 2.6: ficaram no padrão.

## Estilos (SCSS)

15. [x] **Tokens que faltam**: `--error-ink` é usado 14 vezes e nunca definido (vale sempre o reserva `#6b0000`, mais 3
    `#6b0000` soltos); reservas erradas de tokens que existem (`--hi`, `--red-deep`, `--caneta-azul`, `--ink-2`), que nunca
    valem; cores repetidas sem token: papel da ficha `#fbf9f2` (16), papel da orelha `#fffcf2` (14), manilha `#f3e5bb` (11);
    `--f-mono` (5 pilhas monoespaçadas). Agora `--papel-ficha`, `--papel-orelha`, `--manilha` (era redefinido igual
    em quatro lugares), `--error-ink` e `--f-mono` no `:root`; as reservas que nunca valiam saíram. A pilha mono fica a
    de quatro dos cinco (a leitura tinha Consolas depois de Courier New, que nunca chegava a valer no Windows).
16. [x] **Dourado repetido**: o mesmo gradiente dourado escrito 4 vezes (filter-sheet, judge-label, verdict ×2). Agora
    `--foil-gold-word` no `:root`, ao lado do `--foil-gold`.
17. [x] **Tachinha com a cor padrão escrita**: `color="#e62e2d"` em 27 tachinhas, que já é o padrão do `app-pin`. Saiu;
    só as brancas (e as outras cores) dizem a cor.
18. [x] **Folha creme**: `kit.folha` existe e é usado uma vez; settings copia igual. Agora Ajustes, editor do perfil,
    Novidades e o bilhete do Feed vazio incluem o kit; nas Novidades e no editor do perfil faltava o `--focus` de tinta
    (o anel saía amarelo no creme, contra a regra do DESIGN): correção nas Novidades.
19. [x] **Linha de ajuste** (`.linha`, `.linha-titulo`, `.linha-desc`): igual em settings, mural-config e Amigos, sem mixin.
    Agora `kit.linha`, `kit.linha-pilha`, `kit.linha-titulo`, `kit.linha-desc` (Amigos guarda a coluna de 300px do campo).
    A linha da folha da coluna do Kanban fica: é flex, com 16px e a descrição em 0.92rem; igualar mudaria o desenho de ontem.
20. [x] **Título das folhas** (`.titulos`, `.sub`): 7 cópias nas folhas que já usam `_sheet.scss`. Agora `sheet.titulos`,
    `sheet.sub` (impressa: margem 6px e 0.08em, como 3 de 5; as configurações do mural tinham 4px, 0.06em e tinta a 72%,
    o card do Kanban 4px) e `sheet.sub-mao` (Compartilhar e conflito, já iguais).
21. [x] **Escondido para os olhos** (`sr-only`) copiado em 8 media queries: mixin. Agora `a11y.escondido` (ui/_a11y.scss),
    o bloco de 6 linhas que 7 das 9 cópias já usavam; fotos iguais a 1366px e a 400px.
22. [x] **Feltro das reações**: 4 cópias inline do `felt.remendo`. Agora `felt.feltro` (o pano com a costura, sem sombra)
    e `felt.remendo` usa ele; as cinco peças das reações incluem o kit, cada uma com a sua sombra (CSS compilado igual).
23. [x] **Interruptor**: 10 cópias do botão com a bolinha; uma sem `aria-describedby`. O "Finalizar tarefas movidas
    para cá" ganhou a descrição como os outros. Um componente `app-interruptor` ficou de fora: o estilo vem do
    `kit.interruptor` incluído em cada folha (encapsulado), e o botão dentro de outro componente perderia os ajustes de cada uma.

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
