# API do cofre de senhas

A API do cofre de senhas do Murall (PLANO-COFRE.md, seções 9 e 16): um Worker à parte da API do
Murall (`api/`), com banco D1 próprio (`cofre`), na mesma origem da página do cofre
(`https://cofre.murall.igorsc.com.br/api/...`). Ela só guarda o que chega cifrado do navegador e
nunca decifra nada: não tem a chave para isso.

- Estado: **Fase 2, em partes**. Por enquanto, o banco inteiro (`migrations/0001_cofre.sql`), o
  `GET /api/status` (sem login), a cota de gravações por dia, o interruptor `MODO`, a recusa de
  pedidos de outra origem e o login:
  - `POST /api/entrar` `{ codigo, verificador, aparelho? }`: o código que o Google mandou de volta a
    `/entrar` e o verificador do PKCE. A API troca o código no Google (só `openid`), confere o
    `id_token`, acha a conta do Murall pelo `sub` (RPC `CofreRpc.contaPorGoogle`, sem endereço
    público) e, se ela estiver em `COFRE_CODIGOS`, devolve `{ token, expiraEm }`: a sessão de entrada,
    de 5 minutos. Freios: 30 por hora por IP (o IP só como HMAC com uma chave do dia, derivada da
    pimenta) e 30 por hora por conta.
  - `GET /api/cofre` (com a sessão): `{ existe, congeladoAte, aparelhos }`.

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
provas novas) e `GOOGLE_CLIENT_SECRET`. Sem eles, o que depende deles responde 503. O binding
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
