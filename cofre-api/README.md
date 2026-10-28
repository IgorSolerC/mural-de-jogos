# API do cofre de senhas

A API do cofre de senhas do Murall (PLANO-COFRE.md, seções 9 e 16): um Worker à parte da API do
Murall (`api/`), com banco D1 próprio (`cofre`), na mesma origem da página do cofre
(`https://cofre.murall.igorsc.com.br/api/...`). Ela só guarda o que chega cifrado do navegador e
nunca decifra nada: não tem a chave para isso.

- Estado: **Fase 2 completa** (as seis partes da seção 17.4 do plano). O banco inteiro (`migrations/0001_cofre.sql`), o
  `GET /api/status` (sem login), a cota de gravações por dia, o interruptor `MODO`, a recusa de
  pedidos de outra origem e o login:
  - `POST /api/entrar` `{ codigo, verificador, aparelho? }`: o código que o Google mandou de volta a
    `/entrar` e o verificador do PKCE. A API troca o código no Google (só `openid`), confere o
    `id_token`, acha a conta do Murall pelo `sub` (RPC `CofreRpc.contaPorGoogle`, sem endereço
    público) e, se ela estiver em `COFRE_CODIGOS`, devolve `{ token, expiraEm, usuario, codigo }`: a
    sessão de entrada (5 minutos; 20 para quem ainda não tem cofre, o tempo de criar), o id da conta (que entra no AAD de tudo o que a página sela) e o
    código do Murall. Freios: 30 por hora por IP (o IP só como HMAC com uma chave do dia, derivada da
    pimenta) e 30 por hora por conta.
  - `GET /api/cofre` (com a sessão): `{ existe, congeladoAte, aparelhos }`.
  - `POST /api/cofre/registro`: o desafio para registrar uma passkey (`{ desafio, publicKey }`, as
    opções do `navigator.credentials.create`; a página acrescenta o PRF). Uso único, 2 minutos.
  - `POST /api/cofre`: criar o cofre (8.3) com um ou dois aparelhos, o código de recuperação, V, a
    prova da senha e o manifesto vazio. A conferência das passkeys é `src/domain/webauthn.ts`
    (código próprio, sem biblioteca: só atestado "none", ES256 e RS256).
  - Abrir (8.1): `POST /api/cofre/desafio` (o desafio, o sal, o Argon2id e as passkeys),
    `POST /api/cofre/chave` (a assinatura da passkey → o envelope do aparelho; no modo servidor,
    também o S_i) e `POST /api/cofre/abrir` (`{ kAuth }` → a sessão do cofre, V, o manifesto e o
    contador). A senha só é conferida logo depois de uma passkey, e cada tentativa gasta a passkey.
    Freio: 5 erros seguidos, espera de 1 minuto que dobra; 20 erros por dia.
  - `POST /api/cofre/recuperar` (`{ kRec }`): o código de recuperação no lugar da passkey.
  - `POST /api/cofre/trancar`: apaga a sessão (o token pode vir no corpo, como o `sendBeacon` manda).
  - `POST /api/cofre/congelar` (com a sessão de entrada ou a do cofre): ninguém abre por 24 h e todas as
    sessões saem (8.6). Não há descongelar; congelar de novo estende o prazo, nunca encurta.
  - Itens (com o cofre aberto): `GET /api/cofre/itens`, `PUT`/`DELETE /api/cofre/itens/:id`,
    `POST /api/cofre/itens/:id/restaurar` e `DELETE /api/cofre/lixeira/:id`. Cada gravação manda o
    manifesto novo e o `contadorAnterior`; se outro aparelho gravou antes, 409 com o contador de
    agora, e nada muda. Até 2.000 itens de até 16 kB.
  - Gerenciar (com o cofre aberto): `GET`/`POST /api/cofre/aparelhos`, `DELETE
    /api/cofre/aparelhos/:id` (nunca o último), `PUT /api/cofre/senha`, `PUT /api/cofre/recuperacao`,
    `GET /api/cofre/sessoes`, `POST /api/cofre/trancar-todos`, `GET /api/cofre/eventos` (90 dias) e
    `DELETE /api/cofre` (com `{ "confirmacao": "APAGAR" }`). Pôr e tirar aparelho, a senha, o código
    novo e apagar pedem também `confirmar` (PLANO-COFRE.md, 17.21): `{ desafio, assinatura }`, uma
    passkey do cofre sobre o desafio de `POST /api/cofre/confirmar` (uso único, 5 minutos), ou
    `{ kAuth }`, a prova da senha (5 erros por cofre aberto, fora do freio de abrir). Sem ela, 403.
  - A limpeza diária (`src/domain/cleanup.ts`, Cron Trigger às 06:23 UTC, antes do backup das 06:31).

  Ainda **não foi publicada**: o domínio, o banco D1 e os secrets entram na Fase 3, com a aprovação
  do usuário. Até lá, a migração 0001 ainda pode mudar.
- Montagem igual à do `api/`: `src/domain/` (regras), `src/routes/` (endereços), `src/adapters/`
  (D1 e o SQLite do Node), `src/entry/worker.ts` (a Cloudflare).

## Configuração (`wrangler.toml`)

| Variável | O quê |
|---|---|
| `MODO` | `ligado`, `so-leitura` ou `desligado` (qualquer outro valor desliga) |
| `COTA_LINHAS_DIA` | linhas gravadas por dia UTC que a API se permite (o D1 grátis dá 100 mil na conta toda) |
| `COFRE_CODIGOS` | os códigos das contas do Murall que podem usar o cofre; vazio, ninguém; `*`, todo mundo |
| `COFRE_ORIGEM`, `COFRE_RP_ID` | o endereço do cofre e o rpId das passkeys; se o rpId não for exatamente o host, a API desliga |
| `GOOGLE_CLIENT_ID` | o cliente OAuth próprio do cofre ("Murall Cofre") |

Secrets (`npx wrangler secret put`, anotados em papel antes, seção 16.2 do plano): `COFRE_PIMENTA_1`
(32 bytes em base64url; uma versão nova é `COFRE_PIMENTA_2`, e a de número maior vale para as
provas novas), `COFRE_ENVELOPES_1` (32 bytes; cifra o segredo dos aparelhos sem PRF) e
`GOOGLE_CLIENT_SECRET`. Sem eles, o que depende deles responde 503. A pimenta e a chave dos
envelopes se gravam com `node scripts/segredo.mjs COFRE_PIMENTA_1` (e `COFRE_ENVELOPES_1`), que
mostra o valor para o papel e só grava depois de você digitá-lo de volta (passo 7 da seção 17.5). O binding
`MURAL` liga à classe `CofreRpc` da API do Murall.

## Testes

```bash
cd cofre-api
npm ci
npm run typecheck
npm test   # a mesma suíte no SQLite do Node e no simulador do D1
```

O workflow `.github/workflows/cofre-api.yml` roda os mesmos testes em todo push que mexe aqui. Ele
não publica nada.

## Backup e volta do banco (16.3)

O job `cofre` do `.github/workflows/backup.yml` exporta o D1 `cofre` todo dia às 06:31 UTC (depois
da limpeza das 06:23), confere que vieram todas as tabelas, compacta, tranca com a mesma
`BACKUP_SENHA` do Murall e guarda `backup-cofre-<dia>.sql.gz.enc` nos artefatos da execução por 30
dias. Ele só roda com a variável do repositório `COFRE_NO_AR = sim`. O que está no banco já é cifrado
no aparelho; o tranca é uma segunda camada (o repositório é público, e os artefatos também).

O backup não leva os secrets do Worker: para o cofre abrir de novo depois de uma volta, a pimenta e a
chave dos envelopes têm de ser as mesmas (a cópia em papel, seção 16.2 do plano).

Para um estrago dos últimos 7 dias, o mais simples é o Time Travel da Cloudflare (grátis):

```bash
npx wrangler d1 time-travel info cofre
npx wrangler d1 time-travel restore cofre --timestamp=2026-10-21T12:00:00Z
```

Para voltar um backup (no Git Bash, no Windows), baixe o artefato, descompacte o `.zip` e:

```bash
export BACKUP_SENHA='a senha'
bash ../api/scripts/backup.sh abrir backup-cofre-2026-10-21.sql.gz.enc > backup-cofre.sql
npx wrangler d1 execute cofre --remote --file=backup-cofre.sql
```

Isso só num banco **vazio** (o arquivo cria as tabelas). Antes, ponha `MODO = "desligado"` e publique,
para ninguém gravar no meio. O que mudou depois do dia do backup se perde. Os contadores das passkeys
voltam para trás, e isso não atrapalha, porque o aparelho só manda números maiores.
