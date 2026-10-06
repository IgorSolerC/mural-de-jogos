# API do Meu Mural

A nuvem do Meu Mural: login com Google, o mural sincronizado entre aparelhos, o código de usuário
e o seguir. Roda no Cloudflare Workers com banco D1, no plano gratuito, sem cartão. O plano
completo está no documento "Meu Mural na nuvem: plano de implementação".

- Endereço: `https://mural-api.igorsoler.workers.dev`
- Estado: **fase 6** (pronta para o lançamento). `GET /v1/status`, login com Google (`POST /v1/auth/google`), sair, `GET/PATCH/DELETE /v1/eu` e o mural: `GET /v1/eu/mural` (`?rev=` igual responde 204) e `PUT /v1/eu/mural` (multipart `privado`, `publico`, `novas`, com `Mural-Rev-Base`; 409 se outro aparelho gravou antes). Fase 4: `GET /v1/murais/:codigo` (o mural público pelo código, sem login com `VER_MURAIS=todos`) e `POST /v1/eu/codigo` (trocar o código). Fase 6: a checagem diária (`scripts/saude.ts`, ver abaixo). A fase 5 (seguir e notificações) vem depois do lançamento.

## Como está montada

O núcleo (`src/app.ts`, `src/domain/`) é TypeScript comum com [Hono](https://hono.dev) e não sabe que
está na Cloudflare. Só dois arquivos sabem:

| Arquivo | Papel |
| --- | --- |
| `src/entry/worker.ts` | a entrada do Worker (`fetch` e o Cron da limpeza) |
| `src/adapters/d1.ts` | o banco em cima do D1 |
| `src/entry/node.ts` | a mesma API num Node comum |
| `src/adapters/sqlite-node.ts` | o banco em cima do SQLite embutido no Node |

A suíte de testes (`test/suite.ts`) roda duas vezes: no simulador do D1 e no SQLite do Node.

## Comandos

```bash
npm ci
npm run typecheck
npm test               # Node + SQLite e simulador do D1
npm run dev            # wrangler dev, em http://localhost:8787 (D1 local)
npm run dev:node       # a mesma API no Node, com o arquivo mural.sqlite
npm run backup         # baixa o banco de produção para backup-mural.sql (fica fora do git)
```

O deploy é feito pelo GitHub Actions (`.github/workflows/api.yml`): testes, migrações e `wrangler deploy`,
com os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.

## Proteção contra cobrança

- A conta da Cloudflare fica **sem forma de pagamento** e no plano Free. Sem cartão, estourar um limite
  só faz o serviço parar.
- `COTA_LINHAS_DIA` (wrangler.toml) limita as gravações por dia UTC a 60% do gratuito; passou, as
  gravações respondem `503 cota-diaria` até a meia-noite UTC (21h em Brasília).
- `MODO` (wrangler.toml): `ligado`, `so-leitura` ou `desligado`. Qualquer outro valor desliga.
- `VER_MURAIS` (wrangler.toml): `todos` (qualquer um abre um mural pelo código) ou `logados` (só quem tem conta). Qualquer outro valor vale `logados`.
  Para desligar na hora sem deploy: painel da Cloudflare → Workers & Pages → mural-api → Settings →
  Variables.
- Nada de KV, R2, Durable Objects ou Queues: só Workers e D1.

## Checagem diária

`.github/workflows/saude.yml` roda todo dia às 20h47 de Brasília (e quando quiser, em Actions → Saúde da
nuvem → Run workflow) o `scripts/saude.ts`: confere se `GET /v1/status` responde e, com o token, quanto
do plano gratuito foi usado ontem e hoje (pedidos ao Worker, linhas lidas e gravadas no D1, tamanho do
banco). Se a API não responde ou algo passou de 70% do gratuito, a execução falha e o GitHub manda
e-mail; o resumo fica na página da execução. Para rodar aqui: `npx tsx scripts/saude.ts` (com
`API_URL=http://localhost:8787` para a API local).

O token é só de leitura: Cloudflare → My Profile → API Tokens → Create Token → Custom token, com a
permissão **Account → Account Analytics → Read** e a sua conta em Account Resources. Ele vai no
GitHub como o secret `CF_ANALYTICS_TOKEN`; o `CLOUDFLARE_ACCOUNT_ID` é o mesmo do deploy.

## Sair da Cloudflare

1. `npm run backup` (ou `wrangler d1 export mural --remote --output=mural.sql`).
2. `sqlite3 mural.sqlite < mural.sql`.
3. Rodar `npm run dev:node` (ou `tsx src/entry/node.ts`) no host novo, com as mesmas variáveis do
   wrangler.toml mais `BANCO=mural.sqlite` e `PORT`.
4. Trocar o endereço da API no `cloud.json` do site e na lista `connect-src` da política de conteúdo
   (o `<meta http-equiv="Content-Security-Policy">` em `src/index.html`), no mesmo commit.

## Observações

- `npm audit` acusa o `undici` dentro de `@cloudflare/vitest-pool-workers`. Ele só existe nos testes,
  não vai para o Worker publicado.
- `node:sqlite` ainda mostra um aviso de "experimental" no Node 22; funciona e não tem dependência nativa.
