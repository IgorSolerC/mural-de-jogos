# API do Meu Mural

A nuvem do Meu Mural: login com Google, o mural sincronizado entre aparelhos, o código de usuário
e o seguir. Roda no Cloudflare Workers com banco D1, no plano gratuito, sem cartão. O plano
completo está no documento "Meu Mural na nuvem: plano de implementação".

- Endereço: `https://mural-api.igorsoler.workers.dev`
- Estado: **fases 1 a 6**. `GET /v1/status`, login com Google (`POST /v1/auth/google`), sair, `GET/PATCH/DELETE /v1/eu` e o mural: `GET /v1/eu/mural` (`?rev=` igual responde 204) e `PUT /v1/eu/mural` (multipart `privado`, `publico`, `novas`, com `Mural-Rev-Base`; 409 se outro aparelho gravou antes). Fase 4: `GET /v1/murais/:codigo` (o mural público pelo código, sem login com `VER_MURAIS=todos`) e `POST /v1/eu/codigo` (trocar o código). Fase 5: seguir e o correio, `POST /v1/seguindo` (`{"codigo"}`), `DELETE`/`PATCH /v1/seguindo/:codigo` (deixar de seguir; `{"silenciado"}`), `GET /v1/eu/pessoas` (quem eu sigo e quem me segue), `DELETE /v1/eu/seguidores/:codigo` (tirar um seguidor), `GET /v1/eu/notificacoes` (os últimos 30 dias; com `?depois=` responde 204 se não há nada novo) e `POST /v1/eu/notificacoes/vistas` (`{"ate"}`). Fase 6: a checagem diária (`scripts/saude.ts`, ver abaixo). Reações (migração 0005): `GET /v1/murais/:codigo/reacoes` (quem reagiu a cada resenha, com o nome; sem login com `VER_MURAIS=todos`), `PUT /v1/murais/:codigo/reacoes/:ref` (`{"reacao", "titulo", "mural"}`: uma das sete ou qualquer emoji sozinho; só quem segue o dono, uma por pessoa por resenha, até 300 por dia) e `DELETE` no mesmo endereço; o dono recebe o aviso no correio (`tipo: 'reagiu'`, com a `reacao`).

## Como está montada

O núcleo (`src/app.ts`, `src/domain/`) é TypeScript comum com [Hono](https://hono.dev) e não sabe que
está na Cloudflare. Só dois arquivos sabem; outros dois fazem o mesmo papel num Node comum:

| Arquivo | Papel |
| --- | --- |
| `src/entry/worker.ts` | a entrada do Worker (`fetch` e o Cron da limpeza) |
| `src/adapters/d1.ts` | o banco em cima do D1 |
| `src/entry/node.ts` | a mesma API num Node comum |
| `src/adapters/sqlite-node.ts` | o banco em cima do SQLite embutido no Node |

As suítes de testes (`test/suite.ts` e `test/amigos.suite.ts`) rodam duas vezes: no simulador do D1 e no SQLite do Node.

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
  Para desligar na hora sem deploy: painel da Cloudflare → Workers & Pages → mural-api → Settings →
  Variables.
- `VER_MURAIS` (wrangler.toml): `todos` (qualquer um abre um mural pelo código) ou `logados` (só quem tem conta). Qualquer outro valor vale `logados`.
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

## Backup diário

`.github/workflows/backup.yml` roda todo dia às 03h31 de Brasília (06:31 UTC, depois da limpeza) e
quando quiser (Actions → Backup da nuvem → Run workflow): exporta o banco inteiro do D1, confere que
vieram todas as tabelas, compacta, **tranca com senha** (AES-256) e guarda o arquivo nos artefatos da
execução por 30 dias. A Cloudflare só volta o banco até 7 dias no plano gratuito (Time Travel); este
backup cobre o resto e fica fora da Cloudflare. Se falhar, o GitHub manda e-mail.

Custo: nenhum que importe. A exportação lê cada linha uma vez (o gratuito do D1 dá 5 milhões de
leituras por dia), o Actions não cobra minutos em repositório público, e o banco fica travado só
os segundos da exportação.

A senha é obrigatória porque o repositório é público: qualquer pessoa com conta no GitHub baixa os
artefatos dele. Sem ela, a execução falha antes de exportar.

1. Gere uma senha longa (pelo menos 16 caracteres; um gerenciador de senhas serve) e guarde-a
   **também fora do GitHub**: sem ela, nenhum backup abre.
2. GitHub → Settings → Secrets and variables → Actions → New repository secret: `BACKUP_SENHA`.
   O token é o mesmo do deploy (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).

Para abrir um backup (no Git Bash, no Windows), baixe o artefato da execução, descompacte o `.zip` e:

```bash
export BACKUP_SENHA='a senha'
bash scripts/backup.sh abrir backup-mural-2026-10-07.sql.gz.enc > backup-mural.sql
```

Daí, para restaurar: num banco novo, como em "Sair da Cloudflare" abaixo (`sqlite3 mural.sqlite <
backup-mural.sql`); ou de volta no D1, `npx wrangler d1 execute mural --remote --file=backup-mural.sql`
num banco vazio (o arquivo cria as tabelas). Para um estrago dos últimos 7 dias, o Time Travel da
Cloudflare é mais simples: `npx wrangler d1 time-travel restore mural --timestamp=...`.

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
