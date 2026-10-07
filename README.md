# Meu Mural

Um mural pessoal de resenhas: jogos, livros, filmes, séries e animes, cada um na sua parede. Cada resenha é uma
cartolina pregada torta com tachinha, com capa, notas, veredito e a primeira frase do que você escreveu.

Tudo fica no navegador (localStorage). Não há servidor nem conta; o backup é um arquivo `.json.gz` baixado em Ajustes.

- **Murais:** toque na palavra do cartaz ("Meu mural de *jogos*") para trocar de mural. Cada mural tem as suas
  quatro notas, os seus três status, a sua cartela de bônus, a sua fila, o seu ranking e o seu lado a lado.
  Os perfis ficam em [src/app/core/kinds.ts](src/app/core/kinds.ts).
- **Busca:** livros na Open Library (edição em português); animes no Kitsu (AniList de reserva); filmes e séries no
  TMDB, com uma chave gratuita colada em Ajustes, ou na Wikipedia sem ela; jogos na Wikipedia ou na RAWG (com chave).
- **Offline:** em produção, um service worker ([public/sw.js](public/sw.js)) guarda o site e as capas já vistas.
  Dá para instalar na tela inicial.

O produto e o design estão descritos em [PRODUCT.md](PRODUCT.md) e [DESIGN.md](DESIGN.md).

## Rodar

```bash
npm install
npm start          # ng serve, em http://localhost:4200
```

## Testes

```bash
npm test           # Karma, modo watch
npm run test:ci    # uma rodada, Chrome headless
```

Os testes cobrem o núcleo: a média e os bônus, a leitura de fichas e backups antigos, a junção de backups (com as
fichas apagadas), a ordem e as seções do mural, e a separação entre os murais.

Testes com o nome começando em `BUG:` descrevem um bug conhecido: eles conferem o comportamento certo e passam
enquanto o bug existir (no site, `itBug` de [src/app/testing/known-bug.spec.ts](src/app/testing/known-bug.spec.ts);
na API, `it.fails` do vitest). Corrigido o bug, o teste passa a falhar avisando: aí é só trocar por `it`.

## Publicar

Um push na `main` publica no GitHub Pages ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).

### Novidades

Cada atualização ganha uma entrada no topo de `NEWS`, em [src/app/core/news.ts](src/app/core/news.ts), no mesmo commit da mudança: um `id` que nunca muda, a data, um título e uma frase por item. Ela aparece na página de novidades (`#/novidades`, aberta por Ajustes). Com `notice`, aparece também na faixa do topo do site, com um X, até a pessoa fechar ou abrir a página (ou até a data de `until`). Nada disso chama a API.

Um aviso urgente que não pode esperar uma versão nova vai no `public/cloud.json`, e vale mesmo com a nuvem desligada:

```json
"aviso": { "id": "manutencao-1", "texto": "A nuvem fica fora do ar hoje às 22h.", "ate": "2026-10-20" }
```

Fechado, ele não volta; um `id` novo aparece de novo para todo mundo.
