# Plano: conta de admin e a tela "Uso das APIs"

Pedido do usuário (05/nov/2026, cartão do Dev Murall): "Conta de Admin para eu conseguir checar o uso das
APIs diretamente do site com a minha conta. Quero conseguir ver os usos, requisições faltantes, e qualquer
info que possa ser pertinente para que o admin trackeie os usos de cada API individual usada nesse sistema.
Ela pode aparecer numa nova categoria dos extras \"Outros\" apenas para a conta 'G11T-G00D', que é a minha.
Use o IMPECCABLE para planejar, revisar e criticar as alterações, tanto no início quanto no fim da
implementação. Quando terminar rode /code-review high para identificar problemas e corrigi-los."

Este arquivo é o plano inteiro, escrito para ser lido também por outras AIs (como o PLANO-API.md). As
decisões do usuário estão na seção 16. As rodadas estão na 17 e o andamento na 22.

---

## 0. Resumo em uma página

- **O que nasce.** Uma ficha "Uso das APIs" numa prateleira nova, "Outros", em Extras, e a página
  `/extras/uso-das-apis`. Só a conta do dono vê. A trava de verdade é no servidor: a tela só esconde.
- **O problema de fundo: hoje quase nada é contado.** Nenhuma tabela registra chamada a serviço externo. O
  catálogo só tem um contador por IP na memória, que ninguém lê. A única medição que existe é a checagem
  diária da Cloudflare (`api/scripts/saude.ts`), que roda no GitHub Actions e não separa rota nem serviço.
  Portanto, a maior parte do trabalho é **começar a contar**; a tela vem depois.
- **Três jeitos de medir, porque são três realidades** (seção 5):
  1. **Pelo Worker** (RAWG, TMDB, Google): conta cada chamada em D1, de 20 em 20 s, sem atrasar a resposta.
  2. **Pelo navegador** (Wikipedia, Open Library, Kitsu, AniList, iTunes, chaves próprias): o Worker não vê
     essas chamadas. O navegador de quem está logado soma e manda só totais, sem nome e sem o que foi buscado.
  3. **Pela Cloudflare** (pedidos, linhas, tamanho dos bancos): os números oficiais, lidos na hora pela API
     de análise com um token só de leitura.
- **"Requisições faltantes" só é verdade onde existe uma cota** (seção 4). RAWG (20 mil por mês), Cloudflare
  (por dia) e Google Agenda (por dia) têm um número e mostram "faltam N". TMDB não tem cota mensal. AniList,
  iTunes e Open Library limitam **por IP de cada pessoa**, então não existe um "faltam" global: a tela diz
  isso em palavras e mostra quantas vezes o limite foi batido. Não inventamos número.
- **A tela responde a uma pergunta primeiro: "alguma coisa está caindo ou perto do fim?".** Uma frase escrita
  à mão responde; embaixo, o que tem fim (réguas), o razão dos serviços e as últimas falhas. Papelaria do
  Murall, sem cara de painel de monitoramento (seção 11).
- **Sem custo novo.** Nenhum produto novo da Cloudflare; um secret a mais no Worker. Estimativa: bem menos de
  1% do gratuito por dia (seção 14). A contagem nunca derruba uma busca e para sozinha se a cota de gravações
  do dia estiver em 50%.
- **Nada novo guardado no navegador.** Os dados da tela e os contadores ficam só na memória; a regra do
  logout (CLAUDE.md) continua valendo sem exceção (seção 12).
- **Por partes**, em 8 rodadas pequenas, começando por medir o que ainda não sei (seção 17). O Impeccable
  entra no começo e no fim, e o `/code-review high` fecha.

---

## 1. O pedido e o que fica de fora

**Entra:**

- O papel de admin (só leitura, só uma conta) e a prateleira "Outros" em Extras.
- Para cada API: quanto foi usado (hoje, 7 e 30 dias, mês), quanto falta quando existe cota, taxa de erro e
  o tipo do erro, tempo de resposta, última resposta boa, última falha, de onde vem o limite e quando foi
  conferido, e o link para o painel oficial.
- O plano gratuito da Cloudflare e as cotas próprias do Murall (linhas por dia, imagens).

**Fica de fora, de propósito:**

- **Ver ou agir sobre outras contas.** O admin não abre o mural de ninguém, não vê uso por pessoa e não muda
  nada. Se um dia precisar de mais poderes, é outro plano.
- **Pedidos de teste automáticos** ("ping") aos serviços: gastariam a própria cota que a tela mede.
- **O que o cofre faz.** A checagem de senhas vazadas (Have I Been Pwned) e o login do cofre não são contados
  (seção 3.4). O cofre aparece só nos totais da Cloudflare.
- **Qualquer coisa paga** (regra de custo zero do projeto).

Fora **por agora** (rodada futura, se fizer falta): seção 20.

---

## 2. Como é hoje

Levantado no código em 05/nov/2026.

**O caminho de uma busca de catálogo** (`api/src/routes/catalog.ts`): CORS, interruptor `MODO`, origem
(`fromSite`, :109), freio de 60 por minuto por IP na memória (:113), lista de caminhos (:15-20), chamada
externa com prazo de 8 s (`forward`, :120), tradução do erro (:129-132) e resposta com `max-age=86400`. Uma
resposta do cache do navegador nem chega ao Worker, então **tudo o que chega vira uma chamada externa, e é
exatamente isso que gasta a cota**. Por isso contar em `forward` é a medida certa.

**O que já é contado, e por que não serve:**

| Onde | O quê | Por que não basta |
|---|---|---|
| `catalogBrake` em `catalog.ts` (:46-66) | Buscas por IP, 60 s, por instância | Na memória, ninguém lê, não separa TMDB de RAWG |
| `uso_diario` (D1) | Linhas gravadas por dia | É do banco, não de serviço externo |
| `freios` (D1) | Ações por conta, 24 h | Só `agenda` e `oauth-documento` tocam serviço externo, e contam tentativas |
| Workers Logs | Cada pedido, 3 dias | Sem agregação, sem leitura pelo site |
| `api/scripts/saude.ts` (Actions, 23:47 UTC) | Pedidos, erros, linhas e tamanho | Um por dia, só no resumo do Actions |

**O que dá para reaproveitar:**

- `saude.ts` já tem a consulta GraphQL (:156-173), a junção por dia (`usageFrom`, `sumUsage`) e os limites
  (`FREE`, `ALERT = 0.7`, :23-31). O token `CF_ANALYTICS_TOKEN` já existe nos secrets do Actions.
- `sessionOf` (`routes/http.ts:44`) autentica a sessão; `write` (`domain/quota.ts:61`) grava respeitando a cota.
- `/v1/eu` já avisa a tela do que a conta pode ver (`cofre`, `api`, em `routes/account.ts:118-120`), e
  `CloudAccountInfo` (`src/app/core/cloud-account.ts:14`) guarda isso.
- As respostas sem `Cache-Control` já saem `no-store` (`api/src/app.ts:85`), e o service worker não guarda
  `no-store` (`public/sw.js:155`).
- No navegador, quase toda chamada passa por um só lugar: `fetchJson` (`src/app/core/game-lookup.ts:1133`);
  as exceções são o AniList (:902) e o TMDB com chave própria (:1080).

**O que falta e pesa no desenho:**

- `worker.ts:90` chama `appOf(env).fetch(request)` **sem o `ctx`**: hoje não há `waitUntil` nas rotas.
- O catálogo foi feito para **não tocar no D1** (`catalog.ts:8`). Contar muda isso; a seção 6 protege a cota.
- Não existe guarda de rota por dono: `enterExtras` (`core/areas.ts:176`) só troca de mural e devolve `true`.
- `G11T-G00D` é o **código público** da conta, e um código pode ser trocado (seção 9).

---

## 3. Inventário das APIs

Cada linha virou uma entrada do catálogo de serviços (seção 10.3). Os limites são os publicados, conferidos
nas fontes da seção 21 em 05/nov/2026. "Não publica" quer dizer que não achei um número oficial.

### 3.1 Chamadas pelo Worker `mural-api` (medição exata)

| Serviço | Host | Chave | Limite publicado | Tipo de limite |
|---|---|---|---|---|
| **RAWG** | `api.rawg.io` | Secret `RAWG_KEY` | 20.000 pedidos/mês | Da chave, global |
| **TMDB** | `api.themoviedb.org` | Secret `TMDB_KEY` | Sem cota; uns 40 por segundo | Ritmo |
| **Google Agenda** | `www.googleapis.com/calendar/v3` | Permissão de cada pessoa | 1.000.000/dia e 10.000/min no projeto; 600/min por pessoa | Do projeto, global |
| **Google Token** | `oauth2.googleapis.com/token` e `/revoke` | `GOOGLE_CLIENT_SECRET` | Não publica | Nenhum conhecido |
| **Documento OAuth (CIMD)** | Qualquer um, vindo do `client_id` | Nenhuma | Nosso freio: 20/dia por IP | Próprio |

### 3.2 Chamadas pelo navegador (medição aproximada, seção 7)

| Serviço | Host | Limite publicado | Tipo de limite |
|---|---|---|---|
| **Wikipedia** | `en.` e `pt.wikipedia.org` | 200/min para navegador sem login (regra nova de 2026, "sujeita a mudança"); responde 429 com `Retry-After` | Por pessoa |
| **Open Library** | `openlibrary.org` | 1 por segundo (3 se identificado; o navegador não consegue mudar o `User-Agent`) | Por IP |
| **Kitsu** | `kitsu.io` | Não publica; a documentação não abriu e a resposta não traz cabeçalho de limite | Desconhecido |
| **AniList** | `graphql.anilist.co` | 30/min (degradado; o normal é 90). A resposta traz o limite real e o CORS deixa ler | Não diz; tratado como por IP |
| **iTunes** | `itunes.apple.com` | Uns 20/min, número informal; segundo o fórum da Apple, bloqueia com **403**, não 429 (não testado: não forçamos o limite de ninguém) | Não diz; tratado como por IP |
| **RAWG / TMDB com chave própria** | Os mesmos | Da conta da pessoa | **Não gasta a cota do site** |

### 3.3 O plano da Cloudflare (números oficiais, seção 8)

| Recurso | Limite grátis | Janela |
|---|---|---|
| Pedidos aos Workers (`mural-api` + `cofre-api` + o de teste) | 100.000 | Dia UTC, conta inteira |
| Linhas lidas no D1 | 5.000.000 | Dia UTC, conta inteira |
| Linhas gravadas no D1 | 100.000 | Dia UTC, conta inteira |
| Tamanho de cada banco (`mural`, `mural-imagens`, `cofre`) | 500 MB por banco | Sempre |
| CPU por pedido | 10 ms | Por pedido. A tela mostra o P99 e os pedidos cortados (`cpuTimeP99` e o status `exceededResources` da GraphQL) |

E as **cotas próprias**, que travam antes do gratuito: 60 mil linhas por dia (`COTA_LINHAS_DIA`, `uso_diario`)
e 400 MB de imagens (`IMAGENS_MB_TOTAL`, `imagens_uso`).

### 3.4 Sem contagem (a tela lista, com o porquê)

| O quê | Por quê |
|---|---|
| Capas e pôsteres (`shared.steamstatic.com`, `image.tmdb.org`, `covers.openlibrary.org`, `media.rawg.io`…) | São `<img>`, sem `fetch`; o navegador não dá o resultado para contar |
| Prévias de áudio do iTunes, YouTube, Vimeo | São players e iframes |
| Botão de login do Google, tela de autorização | O script e a navegação são do Google |
| Chaves públicas do Google (JWKS) | Busca e cache são do `jose`, raras |
| **Have I Been Pwned** e o login do cofre | O cofre fica fechado; nem o ritmo de quem confere senhas sai dele (decisão D9) |
| GitHub Pages e Actions | Fora do Worker e do navegador; repositório público sem cota de minutos |

Conferir na implementação: `kitsu.app` está na CSP (`src/index.html:11`), mas o código só usa `kitsu.io`.

---

## 4. O que "requisições faltantes" pode significar

Esta é a parte em que o plano mais evita enganar. Cada serviço cai em um de cinco tipos, e o tipo manda no
que a tela mostra:

| Tipo | Serviços | O que a tela mostra | Quando zera |
|---|---|---|---|
| **`cota-global`** | RAWG, Cloudflare, cotas próprias, Google Agenda | Régua, usado de total, **"faltam N"**, % | Dia 1º (RAWG), 21h de Brasília (o resto) |
| **`ritmo`** | TMDB | "Sem cota. Uns 40 por segundo." e o nº de limites batidos | Não se aplica |
| **`por-ip`** | Wikipedia, AniList, iTunes, Open Library | "Por pessoa: 30 por minuto, em cada rede. Não há um total para acabar." e o nº de limites batidos | Não se aplica |
| **`proprio`** | Documento OAuth | O freio do Murall, em palavras | 24 h |
| **`desconhecido`** | Kitsu, Google Token | "Não publica um limite." e o nº de limites batidos | Não se aplica |

Três cuidados:

- **A conta da RAWG é uma estimativa nossa.** Começa no dia em que a contagem entrar no ar, e o mês é o de
  calendário em UTC (a RAWG não documenta quando o dela vira). A tela diz "contando desde 12/nov" no primeiro
  mês e leva ao painel da própria RAWG, que é quem manda de verdade.
- **Só a AniList diz quanto falta, e só para aquele aparelho.** Medido em 05/nov: a resposta traz
  `X-RateLimit-Limit: 30` e `X-RateLimit-Remaining` (o CORS deixa ler). Como isso vale por pessoa, não vira
  "faltam" na tela; TMDB, iTunes, Open Library, Kitsu e Wikipedia não mandam nada parecido. A RAWG segue fora do
  ar, então não deu para ver se ela manda: **a rodada 2 confere quando ela voltar**, e um número dela valeria
  mais que a nossa conta.
- **Limite tem data.** Cada número da tela diz "conferido em 05/nov/2026" e de onde veio. Limite de terceiro
  muda sem aviso, e a tela não pode parecer mais certa do que é.

---

## 5. O desenho: três fontes, nunca misturadas

```
                                   ┌─ medido_em = 'worker'    (exato)
 RAWG, TMDB, Google ──► Worker ────┤
                                   │
 Wikipedia, OpenLib,                ├─► D1: uso_apis ──┐
 Kitsu, AniList, iTunes ─► navegador│   (por dia)      │
   (conta logada, só totais) ───────┴─ medido_em =     ├─► GET /v1/admin/uso ──► a tela
                                       'navegador'     │                         (a conta só
                                       (aproximado)    │                          na memória)
 D1: uso_diario, imagens_uso ──────────────────────────┘
 Cloudflare GraphQL ──────────────────► GET /v1/admin/cloudflare ──────────────►
```

O `medido_em` nunca se soma com o outro lado: a chave própria não gasta a cota do site, e o proxy do site não
é contado no navegador. Um teste garante cada uma dessas duas coisas (seção 18).

**A regra de cálculo mora no site.** A API entrega as linhas, e `core/api-usage.ts` (puro, testado) calcula
totais, percentuais e estado. Assim o Worker gasta menos dos 10 ms de CPU, como as outras partes do Murall.

---

## 6. Contar no Worker

### 6.1 As tabelas (migração `0022_uso_apis.sql`)

```sql
-- Um contador por dia e combinação. Sem id de conta, sem IP, sem endereço, sem o que foi buscado.
CREATE TABLE uso_apis (
  dia       TEXT NOT NULL,            -- AAAA-MM-DD, dia UTC
  servico   TEXT NOT NULL,            -- lista fechada (contrato/uso-apis)
  operacao  TEXT NOT NULL,            -- lista fechada, nunca o caminho cru
  medido_em TEXT NOT NULL,            -- 'worker' | 'navegador'
  desfecho  TEXT NOT NULL,            -- ver 6.2
  pedidos   INTEGER NOT NULL DEFAULT 0,
  ms_total  INTEGER NOT NULL DEFAULT 0,
  ms_max    INTEGER NOT NULL DEFAULT 0,
  ultimo_em TEXT NOT NULL,            -- ISO do último deste desfecho
  PRIMARY KEY (dia, servico, operacao, medido_em, desfecho)
) WITHOUT ROWID;

-- As últimas falhas, para ver quando uma queda começou e parou.
CREATE TABLE uso_apis_falhas (
  id         INTEGER PRIMARY KEY,
  em         TEXT NOT NULL,
  servico    TEXT NOT NULL,
  operacao   TEXT NOT NULL,
  medido_em  TEXT NOT NULL,
  desfecho   TEXT NOT NULL,
  status     INTEGER,                 -- o HTTP de lá; null = rede ou prazo
  repeticoes INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX uso_apis_falhas_em ON uso_apis_falhas (em);
```

Limpeza em `domain/cleanup.ts` (o cron diário): `uso_apis` guarda 400 dias (dá para comparar meses);
`uso_apis_falhas` guarda 30 dias e no máximo as 500 mais novas. Tabelas novas também entram em
`api/test/harness.ts` (`TABLES`) e em `api/scripts/backup.sh` (`TABELAS`). Não entram em `erase.ts`: não têm
dado de ninguém.

### 6.2 Os desfechos

| Desfecho | Quando | A tela diz | Conta como falha? |
|---|---|---|---|
| `ok` | 2xx | Respondeu | Não |
| `nao-achou` | 404 | Não achou | Não (é resposta normal de catálogo) |
| `limite` | 429; 403 no iTunes (só pelo relato do fórum: no iTunes, 403 pode não ser só isso) | Limite | Sim |
| `recusada` | 401, 403 | Chave recusada | Sim |
| `fora` | 5xx, erro de rede | Fora do ar | Sim |
| `prazo` | Passou do prazo | Demorou demais | Sim |
| `outro` | Outros 4xx | Outro erro | Sim |
| `cancelada` | Só no navegador: a pessoa continuou digitando | (não aparece como falha) | Não |

### 6.3 O medidor (`api/src/domain/external-usage.ts`)

- **Quem chama só anota:** `meter.note({ servico, operacao, desfecho, status, ms })`, síncrono, em memória. O
  `fetch` medido embrulha o `upstream` do catálogo, os `fetch` do Google em `routes/agenda.ts` e
  `domain/agenda.ts`, e o `oauthFetch`. A operação sai de uma tabela fechada (`games` → `busca`,
  `games/:id` → `jogo`, `games/:id/stores` → `lojas`; `search/*` → `busca`, `*/images` → `posteres`).
- **Só um middleware grava.** Em `createApp`, depois do `next()`: se há algo anotado e nenhuma gravação
  marcada, marca uma para daqui a **20 s** com `c.executionCtx.waitUntil`. Quem chegar nessa janela só soma
  na mesma conta. **Medido no plano grátis:** cinco anotações em 8 s viraram uma gravação só, aos 20 s; 28 s
  também gravou; 35 s foi cancelado pela Cloudflare no limite de 30 s, e a conta se perdeu. Os 20 s deixam
  10 s de folga para o banco, e a janela não pode passar disso. Pode haver mais de uma instância (a medição
  viu estados diferentes): cada uma tem sua conta, e o `ON CONFLICT` soma tudo certo.
- **Por que uma janela, e não uma gravação por chamada.** Um script com `Origin` falso já consegue gastar a
  cota da RAWG; sem janela, gastaria também a cota de gravações que a sincronização de todo mundo usa. Com
  ela, são no máximo 4.320 gravações por dia e por instância, por maior que seja o ataque. E o catálogo segue
  sem esperar o banco.
- **Só conta o que foi mesmo lá fora.** Recusas locais (origem, freio, caminho) não gravam nada: senão cada
  recusa viraria uma gravação de graça para quem quisesse encher a cota.
- **Nunca atrapalha.** Tudo em `try/catch`; uma falha só vai para `deps.log`. Passa por `write()` (a cota
  conta) e desiste se o dia já usou **50%** de `COTA_LINHAS_DIA`, ou se o `MODO` não é `ligado`. A conta fica
  na memória para a próxima janela, com um teto para não crescer sem fim.
- **Instância que morre perde até 20 s de contagem.** Aceitável: a tela diz "aproximado" e o painel oficial
  da RAWG existe para quando precisar do número exato.

### 6.4 Mudanças de encanamento

- `entry/worker.ts`: `appOf(env).fetch(request, env, ctx)` e o `ctx` passa a chegar nas rotas.
- `entry/node.ts` e testes não têm `executionCtx` (o Hono lança erro ao ler): um ajudante `later(c, promessa)`.
- `ports.ts`: `Deps.meter?` e `usageWindowMs` (zero nos testes, para gravar na hora e o teste ser determinístico).

---

## 7. Contar no navegador

**`src/app/core/lookup-meter.ts`**, serviço que `GameLookup` usa.

- **Onde conta:** `fetchJson`, AniList e TMDB com chave própria. Sem mexer no `window.fetch`.
- **O que identifica o serviço:** o host, numa tabela fechada. **Host da própria API não conta** (o Worker já
  contou), host desconhecido também não. Com chave própria, o serviço é `chave-propria`.
- **O que manda:** só `{ servico, operacao, desfecho, pedidos, msTotal, msMax }`. Sem o texto da busca, sem o
  endereço, sem id. Na tabela não existe coluna de conta.
- **Quando manda:** a cada 5 min, só se houver algo, e ao esconder a aba (`fetch` com `keepalive`; o
  `sendBeacon` não leva o cabeçalho `Authorization`). Duas abas mandam cada uma a sua parte, e a soma continua certa.
- **Quem manda:** só quem está logado (D3). Sem sessão, os contadores são jogados fora.
- **Troca de conta zera.** O que foi contado antes de entrar não vai junto. É dado anônimo, mas segue a regra
  2 do CLAUDE.md ("o de ninguém só vai para uma conta se a pessoa escolher") ao pé da letra, e é mais simples.
- **Nada no armazenamento.** Só memória: fechar a aba sem mandar perde a conta. Por isso a tela diz
  **"aproximado"** nessa parte da tabela e "visto por quem está logado".
- **Nunca atrapalha a busca:** nada é esperado no caminho da busca, e uma falha ao mandar só tenta de novo na
  próxima vez, com teto no tamanho da conta.

**`POST /v1/uso/navegador`** (seção 10.2) valida tudo contra as listas fechadas de `contrato/uso-apis`; linha
desconhecida é descartada, sem erro. Grava pelo mesmo caminho da seção 6.3 (janela, cota, 50%).

---

## 8. A Cloudflare, lida na hora

- **Módulo novo `api/src/domain/cloudflare-usage.ts`:** a consulta e a junção saem de `saude.ts`, que passa a
  importar daqui. Um lugar só, com os testes que já existem.
- **Conta inteira, não só o `mural-api`.** O `saude.ts` filtra por Worker e soma. Para a tela, consulta-se a
  conta sem filtro e agrupa-se por `scriptName` e `databaseId`: o limite é da conta, então o Worker de teste
  (`mural-api-teste`) também tem de aparecer.
- **Janela:** 30 dias por dia (os conjuntos adaptativos guardam pelo menos 31).
- **Secrets novos no Worker:** `CF_ANALYTICS_TOKEN` e `CF_ACCOUNT_ID` (passo do dono, seção 17). Permissão
  mínima: *Account Analytics: Read*. Sem eles, a parte diz "Falta ligar" e o resto funciona.
- **Guardado 5 min na memória da instância.** "Atualizar" passa por cima, no máximo uma vez por minuto.
- **Falha só nessa parte.** É uma rota separada: se a Cloudflare não responde, o resto da tela está de pé.
- **É estimativa.** A própria Cloudflare diz que esses dados não servem para cobrança, e eles chegam com alguns
  minutos de atraso. A tela diz "pode atrasar uns minutos".
- **Não dá para copiar a consulta do `saude.ts` para o Worker.** Ela agrupa por `datetime` com `limit: 10000`,
  o que é bom no Actions e ruim aqui. CPU medida para ler e juntar uma resposta nesse formato: 100 grupos, 0 a
  1 ms; 2.000 grupos (397 KiB), 1 a 7 ms; **10.000 grupos (2 MB), 9 a 21 ms, acima dos 10 ms**. Portanto: agrupar
  por dia (`date`) e pedir no máximo 3.000 grupos. O tutorial oficial só mostra `datetime`, e sem o token não deu
  para confirmar `date` por introspecção: **a rodada 4 confirma**. Se `date` não existir, `datetimeHour` (30 dias
  x 24 h x 3 Workers, 2.160 grupos no máximo) ainda cabe.
- **A CPU entra na tela.** A mesma consulta dá `cpuTimeP50`, `cpuTimeP99` e o status `exceededResources`: dá para
  ver o quanto o Murall anda perto dos 10 ms e se a Cloudflare cortou algum pedido. A checagem diária não olha isso.

---

## 9. Quem é admin

**O ponto delicado.** `API_CODIGOS` compara o **código** da conta. Isso serve para liberar um recurso, mas não
para dar poder: o código é público e **pode ser trocado** (`PUT /v1/eu/codigo`, `routes/account.ts:174`). Se o
dono trocar o dele, ele perde o acesso, e `G11T-G00D` fica livre para **outra conta escolher e virar admin**.
Apagar a conta tem o mesmo efeito. (Dedução pela leitura do código; a rodada 1 escreve o teste que prova.)

**Recomendação (D1): comparar o `usuarios.id`, que nunca muda.**

- `ADMIN_USUARIOS` no `wrangler.toml`, lista de ids, vazia por padrão (vazia = ninguém; **sem `*`**, ao
  contrário de `API_CODIGOS`). `config.ts` lê; `ports.ts` declara.
- O id não é segredo nem credencial, então pode ficar no repositório público. Para descobrir o seu, no console
  do site logado: `JSON.parse(localStorage['meu-mural:nuvem:conta']).id`.
- `G11T-G00D` continua sendo como a gente fala da conta. Uma linha em `wrangler.toml` registra de quem é o id.

**As camadas:**

| Camada | O que faz | É segurança? |
|---|---|---|
| `requireAdmin(deps, c)`, em toda rota `/v1/admin/*` | `sessionOf` (401) e depois o id na lista (403 `so-admin`) | **Sim, é a única** |
| `/v1/eu` devolve `admin: true` | Só a própria conta recebe | Não: só informa a tela |
| `CloudAccountInfo.admin` | Passa pela interface, por `readAccount` (:96-107) e por `refresh` (:207-227) | Não |
| `onlyAdmin` na rota (`core/admin.ts`) | Espera `cloud.ready`; quem não é volta para `/extras` | Não |
| A prateleira "Outros" em `extras-page.ts` | Só aparece com `account()?.admin` | Não |

**Chaves de API e conectores (`murall_…`, OAuth) nunca passam:** `sessionOf` só aceita o token de sessão do
site. Um teste garante. Admin é só de quem está no site.

**Se a conta da lista for apagada,** ninguém mais é admin até a lista mudar e o Worker ser publicado. É o
comportamento certo: o erro falha fechado.

---

## 10. A API

### 10.1 Leitura (só admin, `routes/admin.ts`)

**`GET /v1/admin/uso`.** Sem parâmetros; devolve desde o menor entre "30 dias atrás" e "dia 1º do mês".

```jsonc
{
  "geradoEm": "2026-11-12T23:14:00.000Z",
  "contandoDesde": "2026-11-12",          // o primeiro dia em uso_apis
  // listas, não objetos: [dia, serviço, operação, medido em, desfecho, pedidos, ms total, ms máx, último em]
  // Medido: 1.243 linhas como objetos (221 KB) gastaram 3 a 7 ms de CPU, perto demais dos 10 ms no pior caso.
  "linhas": [ ["2026-11-12", "rawg", "busca", "worker", "ok", 41, 18700, 930, "…"] ],
  "falhas": [ { "em": "…", "servico": "rawg", "operacao": "busca", "medidoEm": "worker",
                "desfecho": "fora", "status": 522, "repeticoes": 3 } ],   // as 50 mais novas
  "proprias": { "dia": "2026-11-12", "linhasGravadas": 812, "cotaLinhas": 60000,
                "imagens": { "imagens": 14, "bytes": 912345, "cota": 419430400 } },
  "agenda": { "contasLigadas": 1 }
}
```

**`GET /v1/admin/cloudflare`.** `{ estado: 'ok' | 'sem-token' | 'fora', geradoEm, dias: [...], bancos: [...] }`.
Com `sem-token` ou `fora` responde **200**, porque é um estado da tela e não um erro.

Ambas herdam o `no-store` de `app.ts:85` e o CORS só das `ORIGENS`.

### 10.2 Escrita (qualquer sessão, `routes/usage-report.ts`)

**`POST /v1/uso/navegador`** com `{ linhas: [...] }`, até 40 linhas, cada `pedidos` até 1.000, `ms` limitados.
Exige sessão. Freio em memória por conta (12 por hora, usando `CatalogBrake`), porque gravar um freio em D1
para cada envio gastaria justamente o que queremos poupar. Responde `204` mesmo quando a cota mandou descartar:
o navegador não tem o que fazer com isso.

### 10.3 O catálogo de serviços (`contrato/uso-apis/`)

Um arquivo de dados, `contrato/uso-apis/servicos.ts`, que o site lê direto, e o Worker lerá para validar (por
isso a resposta da API não repete o catálogo). **Em `contrato/`, não em `shared/`** (a regra do cofre proíbe
`import` em `shared/`).

```ts
{ id: 'rawg', nome: 'RAWG', para: 'Busca e capas de jogos', medidoEm: 'worker', chave: 'Do site, no Worker',
  limite: { tipo: 'cota-global', texto: '20 mil pedidos por mês, para a chave inteira.',
            cota: { valor: 20_000, janela: 'mes' }, fonte: 'https://rawg.io/apidocs', conferidoEm: '2026-11-05' },
  painel: 'https://rawg.io/apikey' }  // a conferir quando a RAWG voltar: o site está fora do ar
```

A chave própria tem **um id só dela** (`chave-propria`, com a operação `rawg` ou `tmdb`), no lugar de `rawg` com
uma operação à parte: assim, a conta dela nem tem como entrar na cota do site.

---

## 11. A tela

### 11.1 O resumo do Impeccable (o brief)

Planejado com o Impeccable (`shape`), **sem rodada de escolha**, conforme o pedido antigo do usuário: a estrutura
é minha, dentro do mundo que o DESIGN.md já fixa (a parede, as cartolinas, a papelaria). Modo: **Operate**.

- **Quem chega e para quê.** O dono, de vez em quando ou porque algo pareceu estranho ("a busca de jogos não
  funciona", como em 04/nov). No computador quase sempre; às vezes no celular. Sucesso: em **cinco segundos**
  saber se há algo errado e o quê, sem ler tabela.
- **O que é só daqui.** O limite de cada serviço dito em palavras honestas: "faltam 17.530 até dia 1º" ao lado de
  "por pessoa, em cada rede; não há um total para acabar". Nenhum painel genérico faz essa distinção.
- **A direção.** Uma **prancheta de conferência** pregada na parede: a frase escrita à mão em cima, as réguas do
  que tem fim, o livro-razão dos serviços e o bloco das falhas. Um tipo de papel para cada tipo de conteúdo, como
  nas Estatísticas (`DESIGN.md:1041`), e densa como os Gastos (`DESIGN.md:1768`).
- **Momento principal:** a frase. Ela é a resposta; o resto é a prova.
- **Fora de propósito:** cara de Grafana (fundo escuro, neon, velocímetros redondos), a fileira de números gigantes
  com rótulo pequeno (o `craft-floor` proíbe, e aqui nem ajudaria), abas trapézio, vermelho como única pista,
  animação de entrada, atualização sozinha, gráfico que ninguém pediu.
- **Ninguém inventa:** os desfechos da 6.2, os tipos de limite da 4, as frases da 11.5, os 70% e 90% da 11.4.

### 11.2 A entrada em Extras

Em `SHELVES` (`extras-page.ts`) não muda nada para quem não é admin: nem marcação, nem texto (ver "Aparência
congelada"). Uma constante à parte, somada por um `computed`:

```ts
const ADMIN_SHELF: Shelf = {
  id: 'outros', title: 'Outros',
  entries: [{ path: '/extras/uso-das-apis', name: 'Uso das APIs',
    blurb: 'Quanto cada serviço do Murall já gastou, quanto falta e o que falhou. Só você vê esta ficha.',
    icon: ICON.ritmo, stock: 'var(--stock-azul)', pin: '#ffd23f', go: 'Ver' }],
};
```

### 11.3 A rota e a barra

- `/extras/uso-das-apis` em `app.routes.ts`, com `loadComponent` (fora do bundle inicial) e `canActivate: [onlyAdmin]`.
  **Sem `enterExtras`:** a página não depende de mural, e o guarda trocaria o mural de quem veio das Anotações.
- `areaOf` acende Extras sozinho pelo prefixo. Na barra (`ui/area-bar.ts`), **dois cuidados**: `picker` (:489) não
  pode mostrar o seletor de murais aqui, e `shown` (:571) esconde a barra quando não há picker nem abas, o que
  levaria junto a volta para Extras. As duas condições precisam conhecer esta página.
- Título da aba sem o nome do mural, como Ajustes: "Uso das APIs · Murall" (conferir em `core/title.ts`).

### 11.4 A estrutura

```
Computador (1440 px). Os números são de exemplo.
 ← Extras                                                     [barra de sempre]

 ▌Uso das APIs▐  atualizado às 20:14 · Atualizar             (fita + giz, na parede)

 ┌─ folha pautada ───────────────────────────────────────────────────────────┐
 │ A RAWG está fora do ar desde 19:40: as buscas de jogos estão indo para a  │
 │ Wikipedia. O resto está respondendo. O mais perto do fim: nada passou de  │
 │ 12%.                                                                      │
 └───────────────────────────────────────────────────────────────────────────┘

 ┌─ cartolina: "O que tem fim" ──────────────────────────────────────────────┐
 │ Este mês · zera dia 1º           │ Hoje · zera às 21h                     │
 │ RAWG      ▓▓░░░░░░  2.470/20 mil │ Pedidos       ▓░░░░  1.204/100 mil      │
 │           faltam 17.530 · 12%    │ Linhas lidas  ▓░░░░  88 mil/5 mi        │
 │                                  │ Linhas gravadas ▓░░  812/100 mil        │
 │ Sempre                           │ Sua cota gravada ▓░  812/60 mil         │
 │ Banco mural     ▓░░  31/500 MB   │ Google Agenda ░░░░░  38/1 mi            │
 │ Banco imagens   ░░░  1/500 MB    │                                         │
 │ Imagens         ░░░  1/400 MB    │                                         │
 └───────────────────────────────────────────────────────────────────────────┘

 ┌─ bloco: "Serviços" (8 de 12 colunas) ────────┐ ┌─ bloco: "Últimas falhas" ─┐
 │        Hoje  7 dias 30 dias Falhas Tempo  Última│ │ 20:12 RAWG  fora · 522 ×3 │
 │ Pelo Worker, conta exata                     │ │ 19:58 RAWG  fora · 522    │
 │ ● RAWG   12   140   2.470  8%  420ms  há 3min▾│ │ 19:40 RAWG  demorou       │
 │ ● TMDB    9    88     910  0%  180ms  há 8min▾│ │ ontem iTunes limite · 403 │
 │ ● Agenda 38   266   1.102  0%  210ms  há 1min▾│ │ …                         │
 │ Pelo navegador, aproximado, de quem está logado│└───────────────────────────┘
 │ ● Wikipedia 31 …                             │
 │ ○ iTunes    —  … sem uso                     │
 └──────────────────────────────────────────────┘
 ┌─ etiqueta manilha, fechada: "O que não dá para contar (6)" ▸ ─────────────┐
```

- **A frase** (folha pautada, Kalam): uma função pura (`howItIs`) decide; o texto da 11.5. **Atualizar** é o
  botão de papel; nada atualiza sozinho.
- **"O que tem fim"** (cartolina com tachinha): a peça nova é a **régua de cota** (`app-cota`), feita com a mesma
  linguagem da `app-regua` (régua escolar + fita crepe preenchendo + etiqueta de tinta) e **sem mexer** na
  `app-regua` das Estatísticas. Marcas fixas em 70% (o `ALERT` do `saude.ts`) e 90%. Até 70% tinta; a partir daí
  fita amarela com a palavra "perto do fim"; a partir de 90%, tinta `red-deep` e "quase no fim". A palavra está
  sempre lá: a cor nunca é a única pista. Agrupada pelo **quando zera**, que é o que a pessoa decide olhando.
- **"Serviços"** (bloco com pé serrilhado, tabela de verdade): a tabela-razão dos Gastos (coluna do nome fixa,
  números tabulares). **Ordem por urgência**, não alfabética: falhando, no limite, perto do fim, ok, sem uso.
  Duas seções com `<tbody>`, porque a confiança do número é diferente. A linha abre o detalhe no próprio lugar.
- **O detalhe (11.6).** Sem modal.
- **"Últimas falhas"** (bloco): hora, serviço, desfecho em palavras, status, repetições. Um toque na linha abre o
  detalhe do serviço. Vazia: "Nenhuma falha nos últimos 30 dias."
- **"O que não dá para contar"** (manilha, fechada): a seção 3.4 em uma linha por item. Está aqui porque o pedido
  é "cada API individual": o que não é medido precisa aparecer como não medido, em vez de sumir.

**Estado de cada serviço**, função pura `statusOf`, sempre ícone + palavra:

| Estado | Regra | Marca |
|---|---|---|
| Fora do ar | Desde a última resposta boa, pelo menos 3 falhas `fora`/`prazo`, a última há menos de 1 h | Ink vermelha, cheia |
| No limite | Algum `limite` na última hora | Ink vermelha, cheia |
| Chave recusada | Último desfecho é `recusada` | Ink vermelha, cheia |
| Quase no fim / Perto do fim | Cota ≥ 90% / ≥ 70% | Amarela |
| Respondendo | Última resposta foi boa | Ink, vazada |
| Sem uso | Nada em 7 dias | Traço, em `ink-2` |

Com um limite claro do que isso é: o estado só sabe das chamadas que **aconteceram**. "Sem uso" não é "de pé".

### 11.5 As palavras

| Situação | Frase |
|---|---|
| Tudo bem | "Tudo respondendo. O mais perto do fim é a RAWG, com 12% do mês." |
| Uma falhando | "A RAWG está fora do ar desde 19:40: as buscas de jogos estão indo para a Wikipedia. O resto está respondendo." |
| Perto do fim | "Faltam 3.100 pedidos na RAWG até dia 1º. No ritmo deste mês, acabam dia 27." |
| Várias | "Duas coisas pedem atenção: a RAWG está fora do ar e as linhas gravadas passaram de 70% hoje." |
| Primeira vez | "A contagem começou hoje. Os números vão aparecendo conforme o site é usado." |

"No ritmo deste mês" só aparece com pelo menos 7 dias de contagem. "As buscas estão indo para a Wikipedia" vem do
catálogo: só onde é verdade (RAWG e TMDB). Hora sempre em Brasília, e "zera às 21h" é calculado a partir da
meia-noite UTC, nunca fixado no texto.

### 11.6 O detalhe de um serviço

Abre embaixo da linha, com `aria-expanded`:

- **Para que serve** e **quem paga** ("Busca e capas de jogos. Chave do site, no Worker.").
- **O limite** em palavras, com "conferido em 05/nov/2026", a fonte e **Abrir o painel** (link externo). No caso da
  RAWG, com a "contagem desde" e o lembrete de que o painel dela é o número oficial.
- **30 dias** em papel milimetrado (`papel-grafico` de `_spending-kit.scss`): tiras de kraft por dia, com a parte das
  falhas marcada em hachura. Eixo único, legenda sempre, rótulos só no maior e em hoje. Se for preciso, reaproveita
  a anatomia de `ui/spending-columns`.
- **Por operação:** uma tabela (busca, jogo, lojas…) com pedidos, falhas e tempo médio. É também a visão em tabela
  que o DESIGN.md exige para todo gráfico; a do dia a dia vem num "Ver os números".
- **Falhas deste serviço:** as últimas 5.

Antes de desenhar o gráfico, carregar a skill `dataviz`.

### 11.7 Celular

- Uma coluna, na mesma ordem: frase, cotas, serviços, falhas.
- A tabela não vira rolagem lateral: abaixo de 720 px da **própria peça** (`@container`), somem 7 dias, 30 dias,
  Tempo e Última, que continuam no detalhe. Sobram estado, nome, Hoje e Falhas.
- Toque de 44 px por linha. Foto em 320, 390, 768, 1024, 1440 e 1920 px.

### 11.8 Estados

| Estado | O que aparece |
|---|---|
| Carregando | Os papéis no lugar, com as linhas em esqueleto; a frase diz "Conferindo…" |
| Nuvem fora / sem rede | Folha com "Não deu para buscar os números agora." e **Tentar de novo**; o resto não aparece |
| Sessão vencida (401) | O caminho de sempre da conta (limpa o navegador e sai) |
| Não é mais admin (403) | Volta para `/extras` |
| Cloudflare `sem-token` | Na cartolina, no lugar do bloco "Hoje": "Falta ligar a leitura da Cloudflare." + o que fazer |
| Cloudflare `fora` | "A Cloudflare não respondeu. Os outros números estão certos." + Tentar de novo só ali |
| Primeira vez, nada contado | Tudo aparece, com "—", e a frase "Primeira vez". Nada de tela vazia: o catálogo já é informação |
| Serviço sem uso | "—", nunca "0%"; a falha só é calculada quando houve pedido |
| Primeiro mês da RAWG | "contando desde 12/nov" ao lado do número |
| Número enorme | `1,2 mi` na régua, número inteiro na tabela e na dica |
| Mês virou / passou das 21h com a tela aberta | Só no próximo Atualizar. O "atualizado às" diz de quando é |

### 11.9 Acessibilidade

`<table>` com `<caption>` e `<th scope>`, botão de verdade na linha, `aria-expanded`, estado escrito além de ícone e
cor, régua com `role="img"` e `aria-label` completo ("RAWG: 2.470 de 20 mil, faltam 17.530, 12%"), resultado do
Atualizar em `aria-live="polite"`, `prefers-reduced-motion` (a abertura do detalhe não anima), foco na marca de
sempre, contraste do `ink-2` conferido no papel.

### 11.10 A papelaria que já existe

Nada novo além da `app-cota`: `kit.botao-papel` e `kit.picote` (`_paper-kit.scss`), `papel-grafico`, `dica`,
`eixo-nome` (`_spending-kit.scss`), o `.tape-label` e o `.cartolina` (`styles.scss`), `app-pin`, os números tabulares
da tipografia do DESIGN.md e a coluna fixa do `spending-grid`. Sem orelha aqui: não há o que escolher, e menos estado
é melhor (são colunas fixas, sem seletor de período).

---

## 12. A regra do logout (CLAUDE.md)

- **Dados da tela:** só em sinais, no componente. Nada em storage. Vêm de novo a cada abertura.
- **Contadores do navegador:** só na memória; a limpeza recarrega a página, e eles vão junto.
- **A bandeira `admin`:** dentro de `meu-mural:nuvem:conta`, que já sai na limpeza. Escrito pelo mesmo `writeJson`.
- **Resposta atrasada depois de sair:** a página recarrega, e o componente some junto.
- **Nenhum IndexedDB, Cache Storage ou cookie novo;** `no-store` garante que o service worker não guarda (`sw.js:155`).
- **Teste em `browser-reset.spec.ts`:** o que entra é a bandeira, mesmo já coberta pelo prefixo, porque a regra pede.
  E um teste no `lookup-meter.spec.ts`: depois de contar e mandar, nenhuma chave nova em `localStorage`/`sessionStorage`.
- `localHasContent` não muda: isso não é dado de conta que sincroniza.

---

## 13. Segurança e privacidade

| Risco | O que protege |
|---|---|
| Alguém virar admin trocando de código | O id, não o código (D1), com teste |
| Chave de API ou conector ler a tela | `sessionOf` só aceita sessão, com teste |
| Vazar a chave do site na tela | A tabela não tem endereço, só listas fechadas; o catálogo só descreve |
| Guardar o que a pessoa buscou | `operacao` é lista fechada, nunca o caminho nem a query; com teste que procura o texto buscado no banco |
| Rastrear pessoas | Sem coluna de conta, sem IP. O dono vê totais. Um teste confere as colunas |
| Encher o banco por `POST` | Sessão, listas fechadas, tetos, freio por conta, janela de 20 s e parada em 50% da cota |
| Encher o banco com `Origin` falso | Recusa local não grava; o resto cai na janela de 20 s |
| Contagem atrapalhar a sincronização | Parada em 50% de `COTA_LINHAS_DIA`, antes da cota de verdade |
| Token da Cloudflare vazar | Secret; só leitura de análise; nunca devolvido nem em erro; o `log` só leva o HTTP |
| Corpo de erro de terceiro trazer algo | Guardamos só o status e o desfecho, nunca o corpo |
| Número velho parecer novo | "Atualizado às", `no-store`, "conferido em" em cada limite |

**Transparência (D8).** Mandar contadores do navegador é uma mudança para todas as contas, mesmo que anônima, então
entra nas Novidades com uma frase direta.

---

## 14. Custo (conferido contra o plano grátis)

**Onde estamos hoje** (a checagem diária de 01 a 04/nov, conta inteira, pelo log do Actions):

| Recurso | Por dia | Do gratuito |
|---|---|---|
| Pedidos aos Workers | 5.351 a 7.062 | 5,4% a 7,1% |
| Linhas lidas no D1 | 115.997 a 433.965 | 2,3% a 8,7% |
| Linhas gravadas no D1 | 604 a 3.154 | 0,6% a 3,2% |
| Banco `mural` | 3,4 MB | 0,7% |

Sobra muito em tudo. Medido: um upsert em `uso_apis` grava **1 linha** e lê 0 (`WITHOUT ROWID`, sem índice extra).
O que acrescentamos, com o uso normal ainda como estimativa (a contagem da rodada 2 dirá o real):

| Item | Por dia, uso normal (estimativa) | Pior caso | Limite |
|---|---|---|---|
| Gravações do medidor do Worker | Dezenas de janelas, ~100 linhas | 4.320 janelas por instância; parada em 30 mil linhas | 100 mil linhas/dia |
| `POST /v1/uso/navegador` | < 100 pedidos, < 300 linhas | 12/h por conta; parada em 30 mil linhas | 100 mil pedidos/dia |
| Abrir a tela | 2 pedidos + 1 subrequest | "Atualizar" a mais de 1/min é só memória | 300 GraphQL/5 min |
| Armazenamento | ~40 linhas/dia × 400 dias ≈ 16 mil linhas curtas, ~1 MB | Igual | 500 MB |
| Bundle | Só a página, em chunk à parte; o `lookup-meter` entra junto do `game-lookup` | | 3 MB (hoje 2,26) |

Sem produto novo: nada de Analytics Engine, KV ou R2.

---

## 15. O que muda em cada lugar

**Novos:**

| Arquivo | Papel |
|---|---|
| `api/migrations/0022_uso_apis.sql` | As duas tabelas |
| `api/src/domain/external-usage.ts` | O medidor |
| `api/src/domain/cloudflare-usage.ts` | Consulta e junção, tiradas de `saude.ts` |
| `api/src/domain/admin.ts` | `requireAdmin` |
| `api/src/routes/admin.ts` e `usage-report.ts` | As três rotas |
| `api/test/uso-apis.suite.ts`, `admin.suite.ts` | Entram em `node.test.ts` **e** `workers.test.ts` |
| `contrato/uso-apis/` | Serviços, operações, desfechos |
| `src/app/core/admin.ts` | `onlyAdmin` |
| `src/app/core/lookup-meter.ts` | Contadores do navegador |
| `src/app/core/api-usage.ts` | Regras puras: `totals`, `quotaOf`, `statusOf`, `howItIs` |
| `src/app/core/api-usage-client.ts` | Chama as duas rotas (como `core/api-keys.ts`) |
| `src/app/pages/api-usage-page.{ts,html,scss}` | A página |
| `src/app/pages/api-usage/cota.ts`, `service-detail.ts` | A régua e o detalhe |

**Alterados:**

| Arquivo | O quê |
|---|---|
| `api/src/routes/catalog.ts` | `upstream` medido |
| `api/src/routes/agenda.ts`, `domain/agenda.ts`, `ext/oauth.ts` | `fetch` medido |
| `api/src/routes/account.ts` | `admin` no `/v1/eu` |
| `api/src/app.ts` | Registrar rotas; middleware da janela |
| `api/src/ports.ts`, `config.ts`, `entry/worker.ts`, `entry/node.ts`, `wrangler.toml` | `meter`, `ctx`, `ADMIN_USUARIOS`, secrets |
| `api/src/domain/cleanup.ts`, `test/harness.ts`, `scripts/backup.sh` | Tabelas novas |
| `api/scripts/saude.ts` | Passa a importar de `cloudflare-usage.ts` |
| `src/app/core/cloud-account.ts` | `admin` nos três lugares |
| `src/app/core/game-lookup.ts` | Anotar no `fetchJson`, no AniList e no TMDB próprio |
| `src/app/pages/extras-page.ts` | Prateleira "Outros" |
| `src/app/app.routes.ts`, `ui/area-bar.ts`, `core/title.ts` | Rota, barra, título |
| `src/app/core/browser-reset.spec.ts` | O teste da 12 |
| `src/app/core/news-list.ts`, `core/build.ts`, `DESIGN.md`, `PRODUCT.md` | Novidades, BUILD, seção nova |

**Não muda:** o cofre (`projects/cofre`, `cofre-api`), então não precisa do "Publicar o cofre"; `shared/`; a CSP
(`src/index.html`), porque a Cloudflare é chamada pelo Worker; `public/sw.js`.

---

## 16. Decisões

Decididas em 05/nov/2026: o usuário aceitou todas as recomendações ("Aceito, comece").

| # | Pergunta | Decidido | Alternativas |
|---|---|---|---|
| D1 | Como reconhecer a conta admin? | **Pelo `usuarios.id`** (`ADMIN_USUARIOS`). O acesso não muda se o código mudar | Pelo código como `API_CODIGOS`, travando a troca do código do dono e reservando-o |
| D2 | Onde guardar a contagem do Worker? | **D1, janela de 20 s.** Sem produto novo, testa nos dois bancos, cota nossa | Analytics Engine (grátis, 100 mil pontos/dia, 3 meses, mas produto novo e sem teste no Node); gravar a cada chamada (mais exato, porém abre a cota a abuso) |
| D3 | De quem contar as chamadas feitas pelo navegador? | **De toda conta logada, só totais anônimos** | Só do admin (bem simples, mas mostra só o seu próprio uso); também de visitantes sem conta (mais completo, porém um `POST` sem sessão é fácil de abusar) |
| D4 | Como ler o uso da Cloudflare? | **Na hora, com token só de leitura no Worker** | Foto diária mandada pelo Actions (sem secret novo, mas um dia velha); deixar de fora (a tela perde as melhores cotas) |
| D5 | Por quanto tempo guardar? | **400 dias de contadores, 30 dias de falhas** | 90 dias de contadores (menos linhas, sem comparar meses) |
| D6 | Mostrar uso por pessoa? | **Não, nunca.** Admin vê serviços, não gente | Contagem por conta (ajuda a achar abuso, mas é outra coisa, e pede dado que hoje não guardamos) |
| D7 | Como é o mês da RAWG? | **Mês de calendário em UTC, "contando desde", link ao painel oficial** | Campo para o dono ajustar à mão a partir do painel (mais exato, mais um estado) |
| D8 | Entra nas Novidades? | **Sim.** Item M6, pela contagem que vale para todos, sem citar a tela de admin: "Quem está logado passa a contar, sem nome e sem o que buscou, quantas buscas vão a cada catálogo, para dar para ver quando um deles cai ou está acabando." A tela em si é M5 e só o dono a vê, então vira desempate novo em NOVIDADES.md | Entrada também para a tela (como foi com os Acessos); nada (quebra a regra de que toda mudança entra) |
| D9 | O cofre entra na contagem? | **Só nos totais da Cloudflare.** HIBP e o login do cofre não são contados | Contar também (exige publicar o cofre e tirar dele um sinal de uso das senhas) |
| D10 | Avisar sem abrir a tela? | **Só o e-mail que já existe** (`saude.yml`, 70%). A RAWG entra nesse relatório numa rodada futura | Bilhete no site para o admin |

---

## 17. Rodadas

Uma coisa de cada vez. Cada rodada é um commit (autor `igorsoler.c`, sem co-autoria, BUILD + 1, Novidades quando muda
o que se vê), com push, e em cada uma: `npm run test:ci` na raiz, `npm run typecheck` e `npm test` em `api/`, `npx ng
build` e o smoke na build de produção. Nas rodadas com tela, o Impeccable (`craft-floor.md` antes de editar, detector,
fotos a 2x com puppeteer). Marcar cada rodada na seção 22, para outra AI conseguir continuar.

**Passos do dono** (nenhum tem custo):

1. Pegar o id da conta e me passar: no console do site logado, `JSON.parse(localStorage['meu-mural:nuvem:conta']).id`.
2. Antes da rodada 4, criar um token (*Account → Account Analytics → Read*) e guardar no Worker:

```bash
cd api && npx wrangler secret put CF_ANALYTICS_TOKEN
```

```bash
cd api && npx wrangler secret put CF_ACCOUNT_ID
```

| # | Rodada | Pronta quando |
|---|---|---|
| 0 | **Medir** — feita em 05/nov (seção 22). Sem mudar o produto. Em aberto, por não dar para medir agora: a dimensão `date` (rodada 4, com o token) e os cabeçalhos e o painel da RAWG (quando ela voltar) | Resultados na seção 22; seções 3, 4, 6, 8, 10 e 14 corrigidas; nenhuma decisão mudou |
| 1 | **O papel de admin** — feita em 05/nov (seção 22). Impeccable no começo (brief 11.1, `context`, `craft-floor`). `ADMIN_USUARIOS`, `requireAdmin`, `admin` no `/v1/eu`, `CloudAccountInfo`, `onlyAdmin`, prateleira "Outros", ajustes na barra, página com a frase "A contagem ainda não começou" e o catálogo | O dono vê e abre; os testes provam que outra conta, sem sessão, com chave de API, e até com **o mesmo código numa conta nova** não entram; Extras sem nenhuma diferença para os outros |
| 2 | **Contar no Worker** — feita em 05/nov (seção 22). Migração, medidor, `ctx`, janela, catálogo + Google + CIMD, limpeza, `GET /v1/admin/uso`. Sem tela nova | Uma busca real aparece no D1 em produção; falha não atrapalha a resposta; parada em 50% testada |
| 3 | **A tela, com dados.** `core/api-usage.ts`, frase, tabela de serviços, régua da RAWG e Google Agenda, Atualizar, estados | O dono responde "está tudo bem?" em cinco segundos, no computador e no celular |
| 4 | **A Cloudflare.** `cloudflare-usage.ts`, `saude.ts` importando, `GET /v1/admin/cloudflare`, as réguas de hoje e dos bancos, `sem-token`/`fora`. Depende do passo 2 do dono | Os números batem com o painel da Cloudflare; `saude.ts` continua funcionando (`workflow_dispatch`) |
| 5 | **Contar no navegador.** `lookup-meter`, `POST /v1/uso/navegador`, seção "aproximado" da tabela, Novidades (D8) | Wikipedia, Open Library, Kitsu, AniList e iTunes aparecem; a chave própria não entra na cota; sem dobrar o proxy; sem chave nova no storage |
| 6 | **Detalhe e falhas.** O detalhe de um serviço (`dataviz` antes), gráfico + tabela, "Últimas falhas", "O que não dá para contar" | Cada API do inventário aparece em algum lugar, inclusive as não contadas |
| 7 | **Fechar.** Impeccable no fim: `critique` + detector + `impeccable-finish-reviewer` com fotos a 2x em 320 a 1920 px e correções; `DESIGN.md` e `PRODUCT.md`; `/code-review high` sobre o conjunto e correções; todos os testes; memória | Sem achado aberto; o smoke na build de produção passa com a API interceptada |

---

## 18. Testes

**API (`api/test/`, nos dois bancos):**

- Admin: sem sessão 401; outra conta 403; **chave `murall_…` recusada**; lista vazia = ninguém; `*` **não** libera;
  **conta nova com o código antigo do dono não entra**; dono que troca de código continua entrando.
- `/v1/eu`: `admin` só `true` para o dono; `false` para os outros.
- Medidor: cada status vira o desfecho certo; o que estoura o prazo vira `prazo`; janela soma sem gravar duas vezes;
  recusas locais (origem, freio, caminho) **não** contam nem gravam; falha do banco não muda a resposta do catálogo;
  parada em 50% e em `so-leitura`; **a query da busca não aparece em nenhuma coluna**; a chave nunca aparece.
- Operações: cada caminho de `RAWG_PATHS` e `TMDB_PATHS` tem operação; um caminho novo sem operação falha o teste.
- `POST /v1/uso/navegador`: sem sessão 401; serviço, operação e desfecho desconhecidos são descartados; tetos; freio.
- Cloudflare: `sem-token`, `fora`, resposta parcial; o token não vaza no erro nem no log. `saude.test` segue passando.
- Limpeza: 400 dias, 30 dias, 500 falhas.

**Site (Karma):**

- `api-usage.spec`: `quotaOf` (limite de cada tipo; "faltam" nunca negativo; mês virando), `statusOf` (cada linha da
  tabela da 11.4), `howItIs` (cada frase da 11.5), serviço sem uso dá "—".
- `lookup-meter.spec`: host da API não conta; host desconhecido não conta; chave própria vira `chave-propria`;
  cancelada não é falha; sem sessão descarta; troca de conta zera; 5 min e aba escondida; **nada no storage**.
- `extras-page.spec`: sem a prateleira para quem não é admin, para quem saiu e com a nuvem desligada; marcação das
  outras prateleiras igual.
- `onlyAdmin`: abrir direto o link espera `cloud.ready` (a armadilha dos Acessos); quem não é vai para `/extras`.
- `area-bar.spec`: sem seletor de murais, com a volta para Extras.
- Página: cada estado da 11.8; a tabela e a régua têm o nome acessível; abrir e fechar o detalhe pelo teclado.
- `browser-reset.spec`: a bandeira sai na limpeza.
- `game-lookup.spec`: a busca continua igual se a contagem lançar erro.

**Build de produção (puppeteer, API interceptada):** dono vê a ficha, abre, tudo sem erro no console; outra conta não
vê a ficha e o link direto volta para Extras; computador e celular.

---

## 19. Riscos e o que conferir

| Risco | O que fazer |
|---|---|
| CPU de 10 ms na rota da Cloudflare | Agrupar por dia e no máximo 3.000 grupos (medido na seção 8); se não couber, foto diária (D4 alternativa) |
| CPU de 10 ms no `GET /v1/admin/uso` | Linhas como listas (seção 10.1); a rodada 2 mede de novo na rota real, com a sessão |
| A contagem aumenta o uso de D1 mais do que o previsto | Parada em 50%; a própria tela mostra; a checagem diária avisa a 70% |
| Limites de terceiros mudam | "Conferido em" visível e reconferidos a cada mudança nesta tela |
| Conta do navegador subestima | Rótulo "aproximado, de quem está logado" |
| Um dos serviços limita por IP do Worker | RAWG e TMDB saem do IP da Cloudflare, junto com outros sites; se aparecerem 429 sem motivo, é o caso |
| Pendência antiga: `api/README.md:65-68` manda trocar a `RAWG_KEY`, que foi ao navegador até 24/10 | O repositório não mostra se foi feito (o secret não se lê): **o dono precisa responder**. Se não foi, a chave velha pode estar gastando a cota, e nossa conta não veria isso. Trocar antes de confiar no "faltam" |
| RAWG ainda fora do ar (522 em `rawg.io` e `api.rawg.io` em 05/nov, 15:20 UTC) | A contagem vai mostrar isso. Conferir os cabeçalhos e o painel quando ela voltar. Até lá, a régua dela fica sem dados de sucesso |
| Testes instáveis conhecidos | Ler as notas de testes instáveis antes de tratar uma falha como nova |

---

## 20. Fora por agora (rodadas futuras, se fizer falta)

- Contagem por hora (hoje só o dia, com as falhas datadas).
- Botão "Testar agora" por serviço, gastando uma chamada de verdade.
- RAWG no relatório do e-mail diário e bilhete no site (D10).
- Ajuste manual da conta da RAWG (D7).
- A cota própria do cofre (`/api/status`); hoje só os totais da Cloudflare.
- Uso da API das AIs (chaves, pedidos e espelho). Dá para ler de `api_pedidos`, mas é "uso do Murall", não "APIs que
  o Murall usa". Se o usuário quiser, é a primeira a entrar: cabe numa seção a mais da tabela.

---

## 21. Fontes (consultadas em 05/nov/2026)

- [Cloudflare Workers: limites](https://developers.cloudflare.com/workers/platform/limits/): 100 mil pedidos/dia, 10 ms de CPU, 50 subrequests.
- [Cloudflare D1: preços](https://developers.cloudflare.com/d1/platform/pricing/): 5 mi lidas, 100 mil gravadas, vira às 00:00 UTC.
- [Cloudflare D1: métricas](https://developers.cloudflare.com/d1/observability/metrics-analytics/): `d1AnalyticsAdaptiveGroups`, `d1StorageAdaptiveGroups`.
- [GraphQL Analytics](https://developers.cloudflare.com/analytics/graphql-api/): dados agregados, não servem para cobrança.
- [GraphQL: limites](https://developers.cloudflare.com/analytics/graphql-api/limits/): 300 consultas em 5 min, pelo menos 31 dias nos adaptativos.
- [GraphQL: token](https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/): *Account Analytics: Read*.
- [Analytics Engine: preços](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) e [limites](https://developers.cloudflare.com/analytics/analytics-engine/limits/): 100 mil pontos/dia, 10 mil consultas, 3 meses (alternativa D2).
- [Cloudflare KV: limites](https://developers.cloudflare.com/kv/platform/limits/): 1.000 gravações/dia, por isso descartado.
- [RAWG: documentação](https://rawg.io/apidocs) e [termos](https://rawg.io/tos_api): 20 mil pedidos/mês. Nenhum limite por segundo documentado.
- [TMDB: rate limiting](https://developer.themoviedb.org/docs/rate-limiting): uns 40 por segundo, sem cabeçalho documentado.
- [AniList: rate limiting](https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/rate-limiting): 90/min, degradado para 30/min, confirmado pelo cabeçalho da resposta em 05/nov.
- [Wikimedia: limites das APIs](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits): navegador sem login 200/min, cliente sem identificação 10/min, novos e sujeitos a mudança. A página não fala de CORS: que o site caia na faixa de navegador é dedução.
- [Workers: `waitUntil`](https://developers.cloudflare.com/workers/runtime-apis/context/): até 30 s depois da resposta.
- [Workers: métricas por GraphQL](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/): `cpuTimeP50`, `cpuTimeP99`, `status`.
- [Google Calendar: cotas](https://developers.google.com/calendar/api/guides/quota): 1 mi/dia, 10 mil/min, 600/min por pessoa; uso só no console do Google Cloud.
- [Open Library: API](https://openlibrary.org/developers/api): 1/s, 3/s identificado.
- [iTunes: fórum da Apple](https://developer.apple.com/forums/thread/66399): uns 20/min, bloqueia com 403. Número informal; não há documentação pública para conferir.
- Sem número publicado: Kitsu e Google Token.

---

## 22. Andamento

Lista datada, da mais antiga para a mais nova: commit, BUILD, medições, o que foi decidido no caminho.

- 05/nov/2026: plano escrito; o usuário aceitou as decisões D1 a D10.
- **05/nov/2026, rodada 0 (medir)**: sem mudar o produto. As medidas de Worker foram num Worker temporário,
  `mural-medir-admin`, com o D1 `mural-api-teste`, fora do repositório, apagado no fim junto com a tabela de teste
  (para não sobrescrever o MCP mínimo do `mural-api-teste`). CPU pelo `wrangler tail --format json` (`cpuTime`).

  | Medida | Resultado |
  | --- | --- |
  | Anotar e gravar 20 s depois, dentro do `waitUntil` | 5 anotações em 8 s, 1 gravação, com `pedidos = 5`. Funciona no plano grátis |
  | Gravar 28 s depois | Gravou |
  | Gravar 35 s depois | **Cancelado aos 30 s**, com o aviso da Cloudflare; a conta se perdeu |
  | CPU de anotar | 0 a 2 ms; 6 ms uma vez (o `tail` não separa a resposta da gravação do lote) |
  | Um upsert em `uso_apis` | 1 linha gravada, 0 lidas |
  | Ler e devolver 1.243 linhas como objetos (221 KB) | 3 a 7 ms, 1.243 linhas lidas |
  | Ler e juntar a resposta da GraphQL: 100 grupos (20 KiB) | 0 a 1 ms |
  | 2.000 grupos (397 KiB) | 1 a 7 ms |
  | 10.000 grupos (2 MB) | **9 a 21 ms** |

  Cada serviço, um pedido só, sem chave:

  | Serviço | Resposta | Cabeçalho de limite | Tempo |
  | --- | --- | --- | --- |
  | RAWG (`api.rawg.io`, `rawg.io`) | **522 nos dois** | Não dá para ver | 20 s |
  | TMDB | 401 (sem chave) | Nenhum | 0,38 s |
  | Wikipedia en, pt | 200 | Nenhum (expõe `Retry-After`) | 0,25 s |
  | Open Library | 200 | Nenhum | 0,63 s |
  | Kitsu | 200 | Nenhum | 0,65 s |
  | AniList | 200 | `limit: 30`, `remaining: 29`, expostos pelo CORS | 0,23 s |
  | iTunes | 200 | Nenhum | 0,25 s |
  | Google Agenda | 403 (sem token) | Nenhum | 0,21 s |

  O que mudou no plano: a Wikipedia passou a ter limite publicado (regra nova de 2026) e a AniList diz a verdade no
  cabeçalho; a consulta do `saude.ts` não pode ir igual para o Worker (10.000 grupos estouram os 10 ms); as linhas do
  `GET /v1/admin/uso` vão como listas; a CPU entra na tela. Nenhuma decisão mudou.

  **Não deu para medir:** a dimensão `date` da GraphQL (depende do token, rodada 4); os cabeçalhos e o painel da RAWG
  (fora do ar); os cabeçalhos do TMDB com chave (o secret não se lê; a rodada 2 confere pelo Worker); o 403 do iTunes
  (forçar o limite dos outros não vale a resposta). Depende do dono: o id da conta, e se a `RAWG_KEY` já foi trocada.
- **05/nov/2026, rodada 1 (o papel de admin), BUILD 752**: `ADMIN_USUARIOS` com o id do dono (conferido no D1:
  é o da conta `G11TG00D`), `isAdmin`, `requireAdmin`, `admin` no `/v1/eu`, `GET /v1/admin/uso` ainda sem contagem,
  `CloudAccountInfo.admin`, `onlyAdmin`, prateleira "Outros", barra e título sem mural, e a página com a frase, a
  tabela dos serviços (`contrato/uso-apis/servicos.ts`) e "O que não dá para contar". Decidido no caminho:
  - `requireAdmin` ficou em `routes/admin.ts`, porque `domain/` não importa de `routes/`.
  - Para quem está logado e sem a bandeira, `onlyAdmin` pergunta à nuvem antes de recusar: abrindo o link direto, a
    primeira conferida da conta pode ainda estar a caminho.
  - O catálogo continua na tela mesmo sem resposta da nuvem (a seção 11.8 dizia que nada aparecia): é informação
    fixa e serve justamente quando algo caiu.
  - "O que não dá para contar" entrou já aqui, adiantado da rodada 6.
  - No celular (abaixo de 560 px da peça), a tabela vira blocos, com `role` explícitos para o leitor de tela. **A
    rodada 3 revê isso** ao entrar com as colunas de números: o limite passa para o detalhe, e a tabela pode voltar a
    ser tabela (11.7).
  - Novidades: desempate novo em NOVIDADES.md; a tela só do admin não entra, e o item de D8 vai na rodada 5.

  Testes novos: `api/test/admin.suite.ts` (nos dois bancos, com o caso de quem troca de código e o da conta nova com o
  código antigo), `core/admin.spec.ts`, `pages/extras-page.spec.ts`, `pages/api-usage-page.spec.ts`, e casos em
  `cloud-account.spec`, `browser-reset.spec` e `area-bar.spec`. Fotos e smoke: `.angular/pptr/uso-apis-fotos.mjs`.
- **05/nov/2026, rodada 2 (contar no Worker), BUILD 753**: migração `0022_uso_apis.sql`, listas fechadas em
  `contrato/uso-apis/contagem.ts`, `domain/external-usage.ts` (`UsageMeter`, `measured`), o `ctx` chegando às rotas, o
  catálogo, o Google e o documento OAuth contados, a limpeza diária e `GET /v1/admin/uso` de verdade. Sem tela nova:
  a frase só passou a dizer desde quando conta. Decidido no caminho:
  - **A conta precisava sobreviver à desistência do site, o que o plano não previa.** Numa queda, o site desiste aos
    5 s e o Worker só aos 8 s, e a Cloudflare pode cancelar o pedido com quem desistiu: sem cuidado, justamente as
    quedas não seriam contadas. No catálogo, `measured` recebe o `waitUntil` e deixa a chamada e a anotação dentro
    dele. Na Agenda não: lá o site não desiste antes.
  - O 403 da Agenda lê uma cópia do corpo para separar "passou do limite" de "falta permissão", porque o Google usa o
    mesmo número; o corpo nunca é guardado. O 409 da Agenda conta como `ok` (outro aparelho já criou o evento), e o
    410 como `nao-achou`.
  - A resposta da API não repete o catálogo (10.1), e `chave-propria` é um serviço à parte (10.3).

  Testes novos: `api/test/uso-apis.suite.ts` (nos dois bancos) e casos em `agenda.test.ts` e `oauth.suite.ts`. **Não
  medido:** a CPU da rota real com a sessão, e o volume real de gravações por dia (ver na rodada 3, já com dados).
