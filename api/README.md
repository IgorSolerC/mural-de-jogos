# API do Meu Mural

A nuvem do Meu Mural: login com Google, o mural sincronizado entre aparelhos, o código de usuário
e o seguir. Roda no Cloudflare Workers com banco D1, no plano gratuito, sem cartão. O plano
completo está no documento "Meu Mural na nuvem: plano de implementação".

- Endereço: `https://mural-api.igorsoler.workers.dev`
- Estado: **fases 1 a 6**. `GET /v1/status`, login com Google (`POST /v1/auth/google`), sair, `GET/PATCH/DELETE /v1/eu` (o `DELETE` pede no corpo o `credential` de um login do Google de até 10 minutos, da mesma conta, e só marca a conta para sair em 7 dias, 202 com `apagarEm`, desfeito por `POST /v1/eu/cancelar-apagar`; a limpeza diária apaga a conta, e o cofre de senhas antes, quando a hora passa: migração 0014) e o mural: `GET /v1/eu/mural` (`?rev=` igual responde 204) e `PUT /v1/eu/mural` (multipart `privado`, `publico`, `novas`, com `Mural-Rev-Base`; 409 se outro aparelho gravou antes). Fase 4: `GET /v1/murais/:codigo` (o mural público pelo código, sem login com `VER_MURAIS=todos`) e `POST /v1/eu/codigo` (trocar o código; com `PUT` e `{"codigo"}`, escolher um, se estiver livre: 409 `codigo-em-uso` se for de outra pessoa; até 10 trocas por dia). Fase 5: seguir e o correio, `POST /v1/seguindo` (`{"codigo"}`), `DELETE`/`PATCH /v1/seguindo/:codigo` (deixar de seguir; `{"silenciado"}`), `GET /v1/eu/pessoas` (quem eu sigo e quem me segue), `DELETE /v1/eu/seguidores/:codigo` (tirar um seguidor), `GET /v1/eu/notificacoes` (os últimos 30 dias; com `?depois=` responde 204 se não há nada novo) e `POST /v1/eu/notificacoes/vistas` (`{"ate"}`). Fase 6: a checagem diária (`scripts/saude.ts`, ver abaixo). Reações (migração 0005): `GET /v1/murais/:codigo/reacoes` (quem reagiu a cada resenha, com o nome; sem login com `VER_MURAIS=todos`), `PUT /v1/murais/:codigo/reacoes/:ref` (`{"reacao", "titulo", "mural"}`: uma das sete ou qualquer emoji sozinho; só quem segue o dono, uma por pessoa por resenha, até 300 por dia) e `DELETE` no mesmo endereço; o dono recebe o aviso no correio (`tipo: 'reagiu'`, com a `reacao`). Freios (migração 0006): os limites por dia de reações e de logins contam cada vez numa tabela à parte (`freios`), então trocar ou tirar a reação e sair da sessão não devolvem a vaga. Amigos no perfil (migração 0007): `GET /v1/murais/:codigo/amigos` (quem a pessoa segue e a segue de volta, com mural público, os mais novos primeiro; sem login com `VER_MURAIS=todos`), com a `foto` do perfil (`{"emoji", "cor"}`) que o site manda como a parte opcional `foto` do `PUT /v1/eu/mural`. Comentários (migração 0009): `GET /v1/murais/:codigo/comentarios` (quantos cada ficha tem, `quem` pode comentar e se quem pergunta `pode`), `GET /v1/murais/:codigo/comentarios/:ref` (os 200 mais novos da ficha, do mais antigo para o mais novo, com o autor e as reações de cada um), `POST` no mesmo endereço (`{"texto", "titulo", "mural"}`: até 500 caracteres, com as marcas de formatação do site; até 100 por dia), `DELETE /v1/comentarios/:id` (quem escreveu ou o dono da ficha) e `PUT`/`DELETE /v1/comentarios/:id/reacao` (`{"reacao"}`, uma por pessoa por comentário, no mesmo freio das reações). Comenta quem segue o dono (como nas reações), ou só quem o dono segue: `PATCH /v1/eu` com `{"comentarios": "seguidores" | "seguidos"}` (o `GET /v1/eu` devolve a escolha). O dono recebe o aviso no correio (`tipo: 'comentou'`), um por pessoa e ficha. Fichas à mostra (migração 0010): o `PUT /v1/eu/mural` leva a parte opcional `fichas` (JSON com os ids das fichas do mural público); as reações, os comentários e os avisos de uma ficha fora dela (que virou privada ou foi apagada) não aparecem para os outros, e reagir ou comentar nela responde `404 ficha-nao-encontrada` (o dono continua vendo e comentando nas dele). Sem a lista (quem ainda não enviou por um site novo), vale tudo, como antes; um envio sem a parte não apaga a de antes. O link de uma ficha (`#/ficha/CÓDIGO/ID` no site) lê o mesmo `GET /v1/murais/:codigo`: a API não muda; o site põe no público, à parte, as anotações só no Kanban (`soKanban`, que o mural de quem visita não lê) e os ids delas na `fichas`, para as reações e os comentários valerem pelo link. Anotações compartilhadas (migração 0011): `GET /v1/eu/notas` (as anotações em que a pessoa está, com a `versao` e o papel), `GET /v1/eu/notas/detalhes?ids=` (até 25, inteiras: o conteúdo, o dono, as pessoas e, para quem escreve, o conflito), `POST /v1/notas` (`{"id", "dados", "membros"}`: o dono compartilha), `PUT /v1/notas/:id` (`{"base", "dados", "conflito"?: {"b"}, "resolver"?}`: grava a partir da `rev`; 409 com a anotação de agora se outra pessoa gravou antes), `PUT`/`DELETE /v1/notas/:id/membros/:codigo` (o dono e os gestores põem, trocam o papel e tiram; `eu` para sair) e `DELETE /v1/notas/:id` (só o dono). Papéis: gestor, editor (não muda a categoria, as tags nem quem vê) e leitor; quem entra recebe o aviso `compartilhou` no correio (até 100 pessoas novas por dia, 30 por anotação, 500 anotações por conta). O mural público conferido (migração 0019): a compartilhada pública vai no mural público de cada pessoa que está nela, montado pelo site dela; quando alguém sai (ou é tirado), a anotação vira privada, é apagada ou a dona apaga a conta, a nuvem marca quem foi afetado (`usuarios.publico_conferir`) e tira a anotação das `fichas` dessas pessoas, e a próxima entrega de `GET /v1/murais/:codigo` de cada uma abre o mural, tira as compartilhadas que ela não pode mais mostrar, grava o conferido e desmarca (`domain/shared-public.ts`): a visita comum não abre nada. Um envio nos 7 dias seguintes marca de novo (o site que ainda não soube pode mandar a cópia velha). O `Mural-Rev` desse `GET` é a `versao` do mural público, que sobe a cada envio e a cada conferência que tira algo (começa na `rev` de antes da migração).

## Chaves de API (para AIs e programas)

O começo da API das AIs (PLANO-API.md, na raiz; rodada 1). Cada conta cria chaves com permissões em
Ajustes › Acessos; a nuvem guarda só o SHA-256 do segredo (`murall_` + 43 letras + 6 de conferência,
`contrato/api-v1/segredo.ts`). Só para as contas em `API_CODIGOS` (wrangler.toml; vazio, ninguém; `*`,
todo mundo).

- Com a sessão do site: `GET /v1/eu/chaves` (`{disponivel, chaves}`), `POST /v1/eu/chaves`
  (`{nome, escopos, grupos?, aprovacao?, validade}`, validade 7/30/90/365; 201 com o `segredo`, que só
  aparece aqui), `PATCH /v1/eu/chaves/:id` (nome, escopos, grupos, aprovação; a validade não muda),
  `DELETE /v1/eu/chaves/:id` e `DELETE /v1/eu/chaves` (todas). Até 20 vivas, 20 criadas por dia.
  `POST /v1/auth/sair-de-todos` com `{"chaves": true}` corta as chaves junto.
- Com a chave (`Authorization: Bearer murall_…`): `GET /ext/v1/eu` (a conta e a própria chave). A
  sessão não vale em `/ext`, nem a chave em `/v1/eu`. `/ext` aceita qualquer origem (CORS `*`).
- Erros: `401 chave-invalida` (sem, copiada errada, vencida, apagada, conta marcada para sair),
  `403 api-indisponivel` (fora de `API_CODIGOS`), `400 chave-invalida` (corpo que não serve).
- As permissões (os `escopos`) estão em `contrato/api-v1/escopos.ts`, que o site também usa.
- **Ler as Anotações** (rodada 2): a API não abre o mural; lê do espelho (`api_espelho`, migração 0016),
  que o site enche depois de sincronizar (`GET`/`POST /v1/eu/espelho`, com a sessão, só na rev do mural
  de agora, até 50 itens por envio e 3 mil linhas por conta e dia). Com a chave e `notas:ler`:
  `GET /ext/v1/notas` (filtros `grupo`, `assunto`, `tag`, `finalizadas`, `fixadas`, `q`,
  `mudou_depois_de`, `ordem`, `limite`, `depois`, `com_texto`), `GET /ext/v1/notas/:id`,
  `GET /ext/v1/contexto` e `GET /ext/v1/busca?q=`. Os formatos estão em `contrato/api-v1/notas.ts`.

## Busca com as chaves do site

A RAWG (jogos) e o TMDB (filmes e séries) pedem chave. Para ninguém precisar trazer a sua, a API
guarda as chaves do site como **secrets** do Worker e repassa a busca (`src/routes/catalog.ts`):
`GET /v1/catalogo` diz quais existem (`{"tmdb": true, "rawg": true}`, nunca a chave), e
`GET /v1/catalogo/tmdb/...` e `GET /v1/catalogo/rawg/...` repassam só os endereços e parâmetros que o
site usa (a busca, os pôsteres, um jogo e as lojas dele), só para quem vem das `ORIGENS`, com cache de
um dia no navegador. Não toca no banco nem conta na cota de gravações. Sem o secret, aquele catálogo
responde `503 sem-chave` e o site volta para a Wikipedia; a chave recusada ou no limite também vira
503, e o site para de usar a do site até recarregar. Quem cola a própria chave nos Ajustes continua
indo direto ao catálogo.

A origem só barra o navegador (um script escreve o `Origin` que quiser), então há também um freio por IP
(`CF-Connecting-IP`): 60 buscas por minuto, contadas só na memória (`catalogBrake`, sem banco nem cota),
por instância do Worker. Passou disso, `429 catalogo-devagar` com `Retry-After: 60`, e o site faz só
aquela busca na Wikipedia, sem largar a chave do site. Sem o cabeçalho (o Node atrás de outro proxy)
não há freio.

Para ligar (uma vez; os secrets ficam entre deploys e nunca vão para o git):

```bash
cd api
npx wrangler secret put TMDB_KEY   # a "Chave da API" ou o "Token de leitura" de themoviedb.org/settings/api
npx wrangler secret put RAWG_KEY   # a chave de rawg.io/apidocs
```

Para desligar na hora, apague o secret (`npx wrangler secret delete RAWG_KEY`) ou use o `MODO`.

A resposta sai sem a chave do site: a busca da RAWG devolve os endereços da página seguinte e da
anterior (`next`, `previous`) com a chave dentro, e o repasse tira todo `key=`/`api_key=` com ela
(`withoutKey`). **Pendente, do usuário:** até 24/10 a chave ia nesses endereços para o navegador, então
a RAWG_KEY de agora já vazou. Gere outra em rawg.io/apidocs (entrar, "Get API key"; se a página só
mostrar a mesma, peça uma nova pelo suporte deles) e grave por cima: `cd api && npx wrangler secret put
RAWG_KEY`. Não precisa de deploy.
Limites: a RAWG grátis dá 20 mil pedidos por mês para a chave inteira (cada resenha de jogo gasta uns
5 a 10: a busca enquanto digita, a capa da Steam e a escolha de capa); o TMDB não tem cota mensal, só um
limite por segundo. Os dois pedem crédito: está no pé de Ajustes › Busca.

## Google Agenda (Calendário)

O Calendário das anotações sincroniza com a agenda principal do Google, nos dois sentidos
(`src/routes/agenda.ts`, migração `0013_agenda.sql`). A API guarda só a permissão (o refresh token,
cifrado com AES-GCM) e conversa com o Google; quem converte lembrete em evento é o site.

- `GET /v1/agenda`: disponível para a conta? ligado? desde quando?
- `POST /v1/agenda/conectar` `{ retorno }`: o endereço do Google (o `retorno` é o `google.html` do site).
- `POST /v1/agenda/retorno` `{ codigo, estado }`: troca o código pela permissão e guarda.
- `DELETE /v1/agenda`: devolve a permissão ao Google e apaga.
- `GET /v1/agenda/eventos?sync=&pagina=`: o que mudou na agenda (410 `agenda-refazer`: ler do zero).
- `POST /v1/agenda/enviar` `{ ops }`: até 25 mudanças (criar, mudar, apagar), cada uma com a sua resposta.

Para ligar (uma vez):

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET   # o client secret do cliente OAuth do site (o mesmo client ID do login)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put AGENDA_CHAVE
```

E, no `wrangler.toml`, `AGENDA_CODIGOS`: os códigos das contas que veem o Google Agenda (os usuários
de teste, enquanto o app não é verificado pelo Google); vazio, ninguém; `*`, todo mundo. No Google
Cloud: a Google Calendar API ativada, o escopo `calendar.events` na tela de permissão e o endereço
`https://murall.igorsc.com.br/google.html` em "URIs de redirecionamento autorizados" do cliente OAuth.

## Imagens coladas nas anotações

O plano está em `PLANO-IMAGENS.md`, na raiz (rodada 1: a nuvem). O site encolhe a imagem no aparelho
(900 px no lado maior, WebP ou JPEG) e manda os bytes; a nuvem não abre nem encolhe nada, só confere
pelos primeiros bytes o tipo e o tamanho de verdade (`src/domain/image.ts`) e guarda.

- **Dois bancos.** Os bytes ficam no D1 `mural-imagens` (binding `IMAGENS`, migrações em
  `migrations-imagens/`), à parte: se ele encher, só as imagens param, e o mural continua gravando. Os
  dados de cada imagem (`imagens`) e quanto cada conta guarda (`imagens_uso`, com a linha `*` da nuvem
  inteira) ficam no banco de sempre (migração 0020). Um id só existe no banco dos bytes depois de existir
  em `imagens`, e sai de lá antes: nunca sobra byte sem dono.
- `PUT /v1/imagens/:id` (sessão; o corpo são os bytes): o id são as 22 letras que o site sorteou. Só WebP,
  JPEG ou PNG (`415 imagem-tipo`), até 900 px no lado maior e até 200 KB (`413 imagem-grande`). Repetir o
  envio responde 200 sem contar de novo; o id de outra conta é `409 imagem-id-em-uso`.
- `GET /v1/imagens/:id`: os bytes, com o tipo guardado, `nosniff` e uma CSP fechada. Quem vê é conferido
  na entrega (migração 0021), sem limpeza nenhuma quando algo muda:
  - **pública**: alguém a mostra no mural público (`imagem_publica`, da parte `imagens` do envio do mural)
    e pode mostrar: o dono, ou quem está numa anotação compartilhada que a usa. Abre sem login, com 7 dias
    de cache (`public, max-age=604800`);
  - **privada**: o dono, ou quem está numa compartilhada que a usa (`nota_imagens`, que o servidor acha no
    texto da anotação ao gravá-la). Sair da anotação, ser tirado dela ou ela ser apagada tira o acesso na
    hora.
  Com sessão, `private, no-store` e `Imagem-Sua: 1|0` (o site guarda a de outra pessoa sem pô-la no
  backup). Quem não pode ver recebe 404, igual à que não existe (nunca 401). Freio por IP na memória: 300
  por minuto (`429 imagens-devagar`).
- `DELETE /v1/imagens/:id`: o dono apaga (os bytes e os dados; a conta desce).
- `GET /v1/eu/imagens`: `uso` (da conta: imagens, bytes, cota, livre), `nuvem` (o mesmo da nuvem
  inteira), `hoje` (enviadas e o limite) e a lista.
- O `GET /v1/status` leva `imagens` (o uso e a cota da nuvem inteira), que a checagem diária lê.
- O `PUT /v1/eu/mural` leva a parte opcional `imagens` (`{"publicas": [ids], "usadas": [ids]}`):
  `publicas` (até 1.000), as que aparecem no mural público; `usadas` (até 3.000), todas as que o mural usa.
  Só o que mudou é gravado (e contado na cota); a lista que não veio não muda nada; um id público que
  ainda não subiu espera por ele. As imagens do dono fora de `usadas` e de toda compartilhada, subidas há
  mais de um dia, ficam soltas (`solta_desde`); voltando à lista, perdem a marca. A resposta traz
  `imagensFaltam`: as usadas que a nuvem não tem (o site que ainda as tem manda de novo).
- `GET /v1/eu/imagens` diz, de cada solta, `soltaDesde` e `saiEm`; a limpeza diária apaga (bytes e dados)
  as soltas há mais de 30 dias que nenhuma compartilhada usa, até 500 por dia.
- `GET /ext/v1/imagens/:id` (a API das AIs, com a chave e `notas:ler`): os bytes de uma imagem que está
  numa nota que a chave lê no espelho (a chave limitada a grupos não vê a de outro grupo) e que a pessoa
  da chave pode ver; senão, 404. O id pode vir como o endereço inteiro (`murall://imagem/ID`, codificado);
  com `?nota=ID`, só aquela nota é lida (sem, a busca passa por todas as notas da conta). Sem cache, com o
  mesmo freio por IP, que o MCP repassa. No MCP, é a ferramenta `ver_imagem`, que devolve a imagem para a
  AI ver.

As travas, no `wrangler.toml` (zero ou um valor que não é número recusa todo envio):

| Variável | Valor | O que segura | Ao passar |
| --- | --- | --- | --- |
| `IMAGENS_MB_TOTAL` | 400 | a nuvem inteira, abaixo dos 500 MB do `mural-imagens` | `507 imagens-cheio` |
| `IMAGENS_MB_PESSOA` | 25 | cada conta (umas 300 imagens de 900 px) | `403 cota-imagens` |
| `IMAGENS_POR_DIA` | 30 | os envios de cada conta em 24 horas (apagar não devolve a vaga) | `429 imagens-hoje` |

Cada envio conta umas 10 linhas na `COTA_LINHAS_DIA` (os bytes do outro banco também: o limite de linhas
do D1 é da conta), e as cotas são conferidas dentro do lote que grava, então dois envios ao mesmo tempo
não passam juntos. Se o banco das imagens recusar os bytes, os dados saem e a conta desce. A limpeza
diária termina os envios que ficaram no meio há mais de um dia e reconta `imagens_uso` a partir de
`imagens`; a conta que sai leva as imagens dela.

## Logs

O Workers Logs (o Observability do Cloudflare, grátis no plano Free: 200 mil por dia, guardados 3 dias)
fica ligado no `wrangler.toml`. Cada pedido aparece com o endereço e o status, e toda resposta de erro
deixa uma linha com o método, o molde da rota, o status e o código (`GET /v1/agenda 401
sessao-invalida`); as recusas do Google Agenda deixam o porquê que o Google deu (`agenda: o Google
respondeu 400 ao mudar (invalid): Invalid start time.`), nunca o evento. Para ler: painel do
Cloudflare › Workers › mural-api › Logs (filtrar por `level = warn`), ou ao vivo com `npx wrangler tail
mural-api`. O cofre guarda só as linhas de erro (PLANO-COFRE.md 9.3).

## Como está montada

O núcleo (`src/app.ts`, `src/domain/`) é TypeScript comum com [Hono](https://hono.dev) e não sabe que
está na Cloudflare. Só dois arquivos sabem; outros dois fazem o mesmo papel num Node comum:

| Arquivo | Papel |
| --- | --- |
| `src/entry/worker.ts` | a entrada do Worker (`fetch` e o Cron da limpeza) |
| `src/adapters/d1.ts` | os bancos em cima do D1 |
| `src/entry/node.ts` | a mesma API num Node comum |
| `src/adapters/sqlite-node.ts` | os bancos em cima do SQLite embutido no Node |

As suítes de testes (`test/*.suite.ts`) rodam duas vezes: no simulador do D1 e no SQLite do Node; a das imagens com um segundo banco, o dos bytes.

## Comandos

```bash
npm ci
npm run typecheck
npm test               # Node + SQLite e simulador do D1
npm run dev            # wrangler dev, em http://localhost:8787 (D1 local)
npm run dev:node       # a mesma API no Node, com os arquivos mural.sqlite e mural-imagens.sqlite
npm run backup         # baixa o banco de produção para backup-mural.sql (fica fora do git)
npm run backup:imagens # o banco das imagens, para backup-mural-imagens.sql (fica fora do git)
```

O deploy é feito pelo GitHub Actions (`.github/workflows/api.yml`): testes, migrações dos dois bancos e `wrangler deploy`,
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
- `IMAGENS_MB_TOTAL`, `IMAGENS_MB_PESSOA` e `IMAGENS_POR_DIA` (wrangler.toml) seguram as imagens (ver
  "Imagens coladas nas anotações"); o banco delas é à parte, então encher não para o mural.
- Nada de KV, R2, Durable Objects ou Queues: só Workers e D1 (dois bancos: `mural` e `mural-imagens`).
  O R2 pede uma assinatura e cobra o que passar do grátis.

## Checagem diária

`.github/workflows/saude.yml` roda todo dia às 20h47 de Brasília (e quando quiser, em Actions → Saúde da
nuvem → Run workflow) o `scripts/saude.ts`: confere se `GET /v1/status` responde, quanto as imagens
guardam e quanto falta para a cota delas e, com o token, quanto do plano gratuito foi usado ontem e hoje
(pedidos ao Worker, linhas lidas e gravadas no D1, tamanho de cada banco, o `mural-imagens` também; o
id dele vem do `wrangler.toml`). Se a API não responde, algo passou de 70% do gratuito ou as imagens
passaram de 70% da cota delas, a execução falha e o GitHub manda
e-mail; o resumo fica na página da execução. Para rodar aqui: `npx tsx scripts/saude.ts` (com
`API_URL=http://localhost:8787` para a API local).

O token é só de leitura: Cloudflare → My Profile → API Tokens → Create Token → Custom token, com a
permissão **Account → Account Analytics → Read** e a sua conta em Account Resources. Ele vai no
GitHub como o secret `CF_ANALYTICS_TOKEN`; o `CLOUDFLARE_ACCOUNT_ID` é o mesmo do deploy.

## Backup diário

O banco das imagens (`mural-imagens`) tem o job `imagens` no mesmo `backup.yml`: uma vez por semana
(domingo, 06:41 UTC) e quando quiser, trancado com a mesma senha, artefato de 30 dias. Os dados de cada
imagem (dono, tamanho, quem vê) estão no backup diário do mural. Para restaurar: `sqlite3
mural-imagens.sqlite < mural-imagens.sql`, ou `npx wrangler d1 execute mural-imagens --remote
--file=...` num banco vazio.

`.github/workflows/backup.yml` roda todo dia às 03h31 de Brasília (06:31 UTC, depois da limpeza) e
quando quiser (Actions → Backup da nuvem → Run workflow): exporta o banco inteiro do D1, confere que
vieram todas as tabelas (e alguma conta em `usuarios`: o banco vazio falha), compacta, **tranca com senha** (AES-256) e guarda o arquivo nos artefatos da
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

1. `npm run backup` e `npm run backup:imagens` (ou `wrangler d1 export mural --remote --output=mural.sql`,
   e o mesmo com `mural-imagens`).
2. `sqlite3 mural.sqlite < mural.sql` e `sqlite3 mural-imagens.sqlite < mural-imagens.sql`.
3. Rodar `npm run dev:node` (ou `tsx src/entry/node.ts`) no host novo, com as mesmas variáveis do
   wrangler.toml mais `BANCO=mural.sqlite`, `BANCO_IMAGENS=mural-imagens.sqlite` e `PORT`.
4. Trocar o endereço da API no `cloud.json` do site e na lista `connect-src` da política de conteúdo
   (o `<meta http-equiv="Content-Security-Policy">` em `src/index.html`), no mesmo commit.

## Observações

- `npm audit` acusa o `undici` dentro de `@cloudflare/vitest-pool-workers`. Ele só existe nos testes,
  não vai para o Worker publicado.
- `node:sqlite` ainda mostra um aviso de "experimental" no Node 22; funciona e não tem dependência nativa.
