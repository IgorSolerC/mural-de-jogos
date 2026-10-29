# Plano do Cofre de senhas do Murall

Escrito em 21/10/2026, revisto no mesmo dia para **custo zero**. É o plano completo, para quem for
implementar (eu ou outra IA) seguir sem precisar desta conversa. A Fase 1 começou em 21/10: o que
já existe e o que foi decidido ao implementar estão na seção 17.

## 1. O que o usuário pediu

- Guardar senhas no Murall, **nada salvo no aparelho**, tudo **cifrado**, sempre dependendo de uma
  **senha segura**.
- Só para quem está **logado** (login com Google, como o resto do Murall).
- **Proteção máxima** contra todo ataque imaginável: navegador comprometido, keylogger, código
  injetado no site, servidor vazado, etc.
- **Tudo gratuito.** Nenhuma compra, nenhuma assinatura, nenhum plano pago (seção 2).

## 2. Custo: zero

Cada peça do plano e por que não custa nada. Se uma implementação futura precisar de algo pago, ela
para e pergunta ao usuário.

| Peça | Custo | Limite do grátis (o cofre usa uma fração mínima) |
|------|-------|------------------------------------------------|
| Passkey no celular e no PC (no lugar da chave física) | Grátis: já vem no iPhone/Android e no Windows Hello | — |
| Código de recuperação | Grátis: papel impresso | — |
| Worker `cofre-api` (site + API) | Cloudflare Workers Free | 100 mil pedidos/dia, 10 ms de CPU por pedido |
| Banco D1 `cofre` | D1 Free | 10 bancos, 5 GB, 5 mi linhas lidas e 100 mil gravadas/dia |
| DNS de `igorsc.com.br` na Cloudflare, DNSSEC, domínio no Worker | Cloudflare Free | — |
| Alerta de certificado novo | Cloudflare CT Monitoring (grátis); se não aparecer, Cert Spotter (plano grátis) | — |
| Domínio `igorsc.com.br` | O que você **já paga** no registro.br; o cofre não acrescenta nada | — |
| GitHub Actions (deploy, vigia a cada hora) e environment com aprovação | Grátis em repositório público | — |
| Login com Google (cliente OAuth) | Grátis | — |
| Angular, `hash-wasm`, `hono`, `jose`, verificação WebAuthn | Código aberto (MIT e parecidas) | — |
| 2FA das contas (GitHub, Cloudflare, Google, Apple, registro.br) | Grátis: passkey ou app autenticador | — |
| BitLocker | Já vem no Windows 11 Pro | — |
| Testes de cabeçalho (securityheaders.com, Mozilla Observatory) | Grátis | — |
| Aviso de senha vazada (Have I Been Pwned, consulta por faixa) | Grátis, sem chave | — |
| Extensão verificadora (Fase 8, opcional) | Grátis: Firefox (AMO) ou "carregar sem compactação" no Chrome. **Não** publicar na Chrome Web Store (cobra US$ 5) | — |

Fica de fora por custar: chave física (YubiKey), Logpush e qualquer recurso pago da Cloudflare,
Chrome Web Store, auditoria externa paga.

## 3. A ideia em uma frase

O cofre vive **num endereço separado do Murall**. Ele abre só com **três coisas juntas**: o login
do Google, a senha mestra e a **passkey de um aparelho seu** (Face ID, digital ou PIN). Tudo é
cifrado **no navegador** antes de subir, e o servidor só guarda texto embaralhado que nem ele
consegue abrir.

```
 Murall (murall.igorsc.com.br)              Cofre (cofre.murall.igorsc.com.br)
 ┌───────────────────────────┐              ┌───────────────────────────────────┐
 │ mural, comentários, Feed, │   só um link │ código mínimo, sem conteúdo de    │
 │ widgets, conteúdo de      │ ───────────► │ terceiros, sem service worker,    │
 │ outras pessoas            │  (noopener)  │ cabeçalhos de segurança rígidos   │
 └─────────────┬─────────────┘              └────────────────┬──────────────────┘
               │ token no localStorage                       │ tudo só na memória
               ▼                                             ▼
        mural-api (Worker)  ◄──── RPC interno (sem ────►  cofre-api (Worker)
        D1 "mural"                endereço público)       D1 "cofre": só texto cifrado
```

## 4. Por que cada peça existe (modelo de ameaças)

Cada linha é um ataque, o que o bloqueia e o que sobra. "Fator" = coisa que o atacante precisa ter.

| # | Ataque | Proteção | O que sobra |
|---|--------|----------|-------------|
| 1 | Banco D1 vaza (ou o backup diário) | Conhecimento zero: só texto cifrado. Com passkey **com PRF** (seção 5), a chave depende de um segredo que só o aparelho gera | Com PRF: nada útil, por mais fraca que a senha seja. Sem PRF: precisa também dos secrets do Worker (ver a linha 2) |
| 2 | A conta da Cloudflare inteira cai (banco **e** secrets) | Com PRF: igual à linha 1. Sem PRF: ainda falta a senha mestra, protegida por Argon2id | Sem PRF: um atacante com tudo isso pode tentar adivinhar a senha fora do site. Uma frase de 6 palavras sorteadas leva séculos |
| 3 | Alguém rouba a conta do Google | O Google é só a porta. Faltam a senha mestra e a passkey | Nada |
| 4 | Alguém rouba o token do Murall (XSS no mural, infostealer lendo o localStorage) | O cofre está em outra origem, com sessão própria e só na memória. O token do Murall não abre nem baixa o cofre | Nada |
| 5 | **Infostealer** (o malware mais comum hoje: rouba cookies, localStorage e senhas salvas no navegador) | O cofre não salva nada no aparelho. Não há o que roubar em disco | Nada |
| 6 | **Keylogger** no PC | Ele captura a senha mestra, mas falta a passkey, que fica **no celular** (outro aparelho). O celular pede Face ID ou digital | Se a passkey usada for a do próprio PC infectado, ela é mais fraca: por isso a principal é a do celular |
| 7 | **Phishing** (site falso igual ao cofre) | A passkey só responde ao endereço exato do cofre (`rpId` = `cofre.murall.igorsc.com.br`) | O site falso pode pegar a senha digitada (um fator só, inútil sozinho) |
| 8 | **Código injetado no cofre** (XSS) | Cofre sem conteúdo de terceiros, sem `innerHTML`, sem markdown; CSP rígida; Trusted Types obrigatório | Um bug no próprio código do cofre. Por isso o código fica mínimo e revisado |
| 9 | **Malware no PC com o cofre aberto** (acesso remoto, leitura de tela ou de memória) | Decifra item a item só quando abre; tranca sozinho cedo; senhas mascaradas; "gaveta" que pede a passkey de novo a cada revelação | **Não tem defesa completa**: o que você abre num PC dominado pode ser visto. Diminuímos quanto e por quanto tempo |
| 10 | **Extensão maliciosa no navegador** (lê qualquer página) | Perfil do navegador só para o cofre, sem extensões; aviso quando algo de fora mexe na página; campos com `spellcheck=false`, `translate="no"` | Uma extensão com acesso total enxerga o que está na tela, como na linha 9 |
| 11 | **Navegador comprometido** (binário adulterado, falha 0-day) | Navegador oficial atualizado; isolamento de processo (COOP/COEP, `Origin-Agent-Cluster`); tempo aberto curto | Igual à linha 9 |
| 12 | **Deploy malicioso** (alguém entra no GitHub, na Cloudflare ou no domínio e publica um cofre adulterado) | 2FA com passkey em todas as contas; o cofre só publica com **aprovação manual** sua; Actions fixadas por hash; vigia a cada hora que confere os arquivos no ar contra os hashes do repositório | É o maior risco que sobra num site. O vigia avisa, mas depois. Ver a seção 13 |
| 13 | **Pacote do npm comprometido** (cadeia de suprimentos) | O cofre usa o mínimo de dependências (Angular + `hash-wasm`), versões fixas no lockfile, `npm ci`, revisão a cada atualização | Uma versão adulterada antes de alguém perceber |
| 14 | **Servidor malicioso ou adulterado** (devolve dados trocados, antigos ou faltando) | Cada item é cifrado com autenticação (AES-GCM) amarrada ao usuário, ao id e à versão; um "manifesto" cifrado lista todos os itens e versões; o navegador recusa parâmetros de cifra mais fracos que o mínimo | Voltar o cofre inteiro para uma versão antiga não é detectado (decisão 6: nada fica no aparelho). A tela de abrir mostra a data e o aparelho da última mudança, para você notar |
| 15 | **Força bruta online** (tentar senhas na tela de abrir) | Precisa da passkey em cada tentativa; freios por conta (espera dobrando, limite por dia); aviso no Murall a cada sequência de erros | Nada útil |
| 16 | **Clickjacking** (cofre dentro de um iframe invisível) | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | Nada |
| 17 | **Homem no meio da rede** | Só HTTPS, HSTS, DNSSEC, registros CAA, alerta de certificado novo (Certificate Transparency) | A Cloudflare vê o tráfego, mas só o que já está cifrado |
| 18 | **Alguém no seu PC destravado** | Tranca com 5 min parado, ao esconder a aba por 1 min, ao fechar; abrir de novo pede senha + passkey | Os minutos antes de trancar |
| 19 | **Olho por cima do ombro, compartilhar tela** | Tudo mascarado; revelar dura 15 s; impressão (Ctrl+P) não mostra segredos | Uma senha revelada na hora errada |
| 20 | **Área de transferência** (histórico do Windows Win+V, área sincronizada na nuvem) | Limpa depois de 30 s; opção "mostrar para digitar" sem copiar; instrução de desligar o histórico | Limpar é melhor esforço: o navegador não deixa limpar se o cofre perdeu o foco |
| 21 | **Windows Recall / prints automáticos / arquivo de paginação** | Instruções no Ajustes (desligar o Recall ou excluir o navegador; BitLocker no disco) | Depende do sistema, não do site |
| 22 | **Ortografia aprimorada e tradução do navegador** (mandam o texto para o Google) | `spellcheck=false`, `autocorrect=off`, `translate="no"` e `<meta name="google" content="notranslate">` | Nada |
| 23 | **Apagar o cofre para te prejudicar** (com o token roubado do Murall, apagando a conta) | Apagar a conta do Murall com cofre exige abrir o cofre, ou espera 7 dias com aviso e botão de cancelar; o cofre só se apaga aberto | O backup diário cobre o resto |
| 24 | **Ficar trancado do lado de fora** (perdeu o celular, esqueceu a senha) | Código de recuperação impresso + passkey num segundo aparelho (opcional, com aviso fixo até existir) | Com um aparelho só, perdê-lo deixa só o código. **Esquecer a senha mestra = perder o cofre.** É o preço do conhecimento zero |
| 25 | **Roubo da conta da Apple ou do Google** (onde a passkey do celular é sincronizada) | A passkey sozinha não abre: falta a senha mestra. A Apple e o Google cifram as passkeys de ponta a ponta | O atacante teria um fator; precisaria ainda da senha |
| 26 | **Golpe pelo console** ("cole isto no F12") | Aviso grande no console, como o do Facebook | Quem cola mesmo assim |
| 27 | **Automação do navegador** (robôs, `navigator.webdriver`) | O cofre recusa abrir com automação ligada (só os testes desligam isso) | Nada |
| 28 | **Service worker plantado** (persiste depois de uma invasão) | O cofre não tem service worker; ao carregar, desregistra qualquer um que exista e avisa; `Clear-Site-Data` ao trancar | Nada |
| 29 | **IA ou pessoa mexendo no código do cofre sem querer abrir um buraco** | Regras de código da seção 14; testes de ataque obrigatórios; mudança na cripto só com aprovação do usuário | Revisão humana continua necessária |

## 5. Os três fatores

1. **Login com Google** (quem você é). Abre a porta para pedir o cofre. Fluxo de código com PKCE,
   sem carregar o script do Google na página do cofre.
2. **Senha mestra** (o que você sabe). Frase de 6 palavras sorteadas, ou equivalente. Nunca sai do
   navegador.
3. **Passkey** (o que você tem), nos aparelhos que você já tem:
   - **Principal: o celular** (Face ID ou digital). Fica fora do PC, então um keylogger no PC não
     chega nela. No PC, o navegador mostra um QR code e o celular confirma.
   - **Reserva, opcional: o PC** (Windows Hello, com PIN ou rosto). Para quando o celular não
     estiver à mão. O cofre funciona com um aparelho só, mas mostra um aviso fixo nos Ajustes até
     haver o segundo (decisão 4).

### Com PRF e sem PRF

A extensão **PRF** do WebAuthn faz a passkey devolver um segredo de 32 bytes que só ela gera. Com
PRF, esse segredo entra na chave do cofre, e o vazamento do banco fica inofensivo mesmo com uma
senha fraca. Nem todo aparelho tem PRF:

- iPhone com iOS 18+ (passkeys do iCloud) e Android (passkeys do Gerenciador de Senhas do Google):
  têm PRF.
- Windows Hello e o celular usado pelo PC com QR code: **conferir** na Fase 1.

Um aparelho **sem PRF** ainda serve (decisão 5: aceito, com aviso), num modo mais fraco: a passkey vira só um portão no servidor, e
o servidor guarda a parte do aparelho cifrada com um secret do Worker. Fica seguro contra vazamento
do banco e do backup, mas não contra quem tomar a Cloudflare inteira (aí só a senha mestra protege).
A Fase 1 começa com **uma página de teste** que diz, em cada aparelho e navegador, se tem PRF.

## 6. A criptografia, em detalhe

Tudo com WebCrypto (nativo do navegador), menos o Argon2id, que vem de `hash-wasm` (WASM, sem
outras dependências). Todo `CryptoKey` é criado **não exportável** sempre que possível. Todo
`Uint8Array` com segredo é zerado (`fill(0)`) logo depois do uso.

### 6.1 Chaves

```
senha mestra ──Argon2id(sal, m=64 MiB, t=3, p=1)──► kSenha (32 bytes)

M  = 32 bytes aleatórios, a "chave do meio" (criada uma vez no navegador)
VK = 32 bytes aleatórios, a chave do cofre (criada uma vez; vira chave HKDF não exportável)

Envelope de um aparelho com PRF:
  kAparelho_i = WebAuthn PRF(eval = SHA-256("murall-cofre-v1-prf"))          (32 bytes)
  E_i         = AES-256-GCM(HKDF(kAparelho_i, "cofre-v1 env " + idEnvelope), M)

Envelope de um aparelho sem PRF (modo servidor):
  S_i  = 32 bytes aleatórios gerados no navegador ao registrar o aparelho
  E_i  = AES-256-GCM(HKDF(S_i, "cofre-v1 env " + idEnvelope), M)
  S_i vai para o servidor, que o guarda cifrado com o secret COFRE_ENVELOPES (fora do banco)
  e só o devolve depois de conferir a assinatura da passkey daquele aparelho.

Envelope do código:    E_rec = AES-256-GCM(HKDF(codigoRecuperacao, "cofre-v1 rec"), M)
Cofre:                 V     = AES-256-GCM(HKDF(kSenha ‖ M, "cofre-v1 cofre"), VK)
Prova para o servidor: kAuth = HKDF(kSenha ‖ M, "cofre-v1 auth")
Prova do código:       kRec  = HKDF(codigoRecuperacao, "cofre-v1 rec auth")  (o servidor só solta E_rec com ela)
```

Por que a "chave do meio" M:

- Abrir precisa de **M** (só sai de uma passkey ou do código de recuperação) **e** de **kSenha**
  (só sai da senha). Um sem o outro não abre nada.
- **Trocar a senha** reescreve só `V` e `kAuth`. Não precisa de todos os aparelhos na mão.
- **Pôr ou tirar um aparelho** cria ou apaga só o `E_i` dele.
- O **código de recuperação substitui a passkey, não a senha** (decidido em 21/10, seção 15).
  Papel roubado + conta do Google não abrem o cofre.
- Sem PRF, o servidor (com o secret) consegue chegar a M, mas M sozinho não abre nada: ainda falta
  a senha. Por isso o modo sem PRF exige a frase de 6 palavras.

### 6.2 Itens

```
chaveItem = HKDF(VK, sal = idItem, info = "cofre-v1 item")       (AES-256-GCM, não exportável)
dados     = AES-256-GCM(chaveItem, iv aleatório de 12 bytes,
                        JSON do item completado até múltiplo de 512 bytes,
                        AAD = "cofre-v1|item|" + idUsuario + "|" + idItem + "|" + versao)
```

- **Tudo** fica dentro do cifrado: título, usuário, senha, site, observações, datas, histórico das
  últimas 5 senhas. O servidor vê só: id aleatório (UUID), versão, tamanho arredondado e quando mudou.
- O AAD amarra o item ao dono, ao id e à versão: o servidor não consegue trocar itens de lugar,
  entre contas, nem devolver uma versão velha de um item só.

### 6.3 Manifesto

```
chaveManifesto = HKDF(VK, info = "cofre-v1 manifesto")
manifesto      = AES-256-GCM(chaveManifesto, { contador, itens: { idItem: versao }, mudadoEm, aparelho },
                             AAD = "cofre-v1|manifesto|" + idUsuario + "|" + contador)
```

- Ao abrir, o navegador confere que os itens que o servidor mandou são **exatamente** os do
  manifesto, com as mesmas versões. Faltou, sobrou ou mudou: alerta e não mostra nada.
- Toda gravação manda o item novo + o manifesto novo (contador + 1) com o contador anterior. O
  servidor grava os dois juntos (batch do D1) ou responde **409** se outro aparelho gravou antes. O
  navegador então recarrega e reaplica.

### 6.4 Regras que o navegador impõe

- Recusa Argon2id com `m < 64 MiB` ou `t < 3` vindos do servidor (bloqueia o rebaixamento).
- Recusa `versao_cripto` desconhecida.
- Recusa resposta sem a assinatura WebAuthn válida para o `rpId` exato do cofre.
- Nunca cria chave a partir de dado do servidor; só usa o sal dele (um sal falso só dá chave
  errada, e a abertura falha).

### 6.5 No servidor

- Guarda `HMAC-SHA256(pimenta, kAuth)` e `HMAC-SHA256(pimenta, kRec)`. A **pimenta** é um secret
  do Worker (`COFRE_PIMENTA`), fora do banco. Compara com `crypto.subtle.timingSafeEqual` (existe
  nos Workers).
- Guarda os `S_i` dos aparelhos sem PRF cifrados com AES-GCM pelo secret `COFRE_ENVELOPES`.
- Confere a assinatura WebAuthn: desafio de uso único (2 min), origem, `rpId`, flag de verificação
  do usuário (biometria ou PIN) e o contador da passkey, quando ela tem (as sincronizadas mandam 0).
- Nunca decifra item nenhum. Não tem a chave para isso.

## 7. Onde o cofre mora

### 7.1 Endereço separado

`cofre.murall.igorsc.com.br`, uma origem só dele. Um XSS no Murall (comentários, Feed, anotações
compartilhadas, markdown, widgets) **não alcança** o cofre. O navegador isola origens diferentes, e
o `rpId` da passkey é o host exato do cofre, não `igorsc.com.br`. Se fosse o domínio de cima, uma
página do Murall comprometida poderia pedir a passkey.

### 7.2 Hospedagem com cabeçalhos (decidido: DNS na Cloudflare)

O GitHub Pages **não deixa configurar cabeçalhos HTTP**. E `frame-ancestors`, HSTS, COOP e COEP só
funcionam como cabeçalho, não como `<meta>`. Por isso o cofre fica fora do GitHub Pages.

**Decidido em 21/10:** o DNS de `igorsc.com.br` sai do registro.br (servidores `a.sec.dns.br` e
`c.sec.dns.br`) para a Cloudflare, no plano grátis. O cofre vira **um Worker `cofre-api`** que
serve os arquivos do site (static assets) **e** a API em `/api/...`, na **mesma origem**, com o
domínio próprio do Worker. Sem CORS, `connect-src 'self'`.

Passos do usuário (grátis):

1. Criar a zona `igorsc.com.br` na Cloudflare (plano Free). Ela copia os registros de hoje.
2. Conferir que os dois registros de hoje vieram juntos (o domínio não tem e-mail, então não há
   MX para levar):
   - o CNAME `murall` → `igorsolerc.github.io.`, **com a nuvem cinza** (só DNS, sem proxy), para
     o GitHub Pages continuar emitindo o certificado;
   - o TXT `google-site-verification=…`, que prova ao Google que o domínio é seu (o login e a
     Agenda dependem dele).
3. No registro.br, trocar os servidores de DNS pelos dois que a Cloudflare indicar.
4. Ligar o DNSSEC na Cloudflare e pôr o registro DS que ela mostrar no registro.br.
5. Conferir que o Murall continua abrindo.

### 7.3 Cabeçalhos (todas as respostas do cofre)

```
Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'nonce-{por pedido}'; img-src 'self' data:; font-src 'self';
  connect-src 'self' https://api.pwnedpasswords.com; manifest-src 'self'; form-action 'none'; frame-ancestors 'none';
  base-uri 'none'; object-src 'none'; require-trusted-types-for 'script';
  trusted-types angular angular#bundler; upgrade-insecure-requests
Strict-Transport-Security: max-age=63072000; includeSubDomains
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(),
  hid=(), bluetooth=(), display-capture=(), clipboard-read=(), clipboard-write=(self),
  publickey-credentials-get=(self), publickey-credentials-create=(self)
Cache-Control: no-store
```

- O `nonce` dos estilos: o Worker gera um por pedido, põe no `ngCspNonce` do `index.html` (com
  `HTMLRewriter`) e no cabeçalho. Angular injeta os estilos dos componentes com ele. Desligar o
  `inlineCritical` do build (ele usa `onload` inline, que a CSP barra).
- `'wasm-unsafe-eval'` é só para o Argon2id em WASM. Sem `unsafe-eval`, sem `unsafe-inline`.
- `api.pwnedpasswords.com` é o único endereço de fora, e só é chamado com o aviso de senha vazada
  ligado (decisão 8). A API responde com CORS, então funciona com o COEP `require-corp`.
- `Cache-Control: no-store` também tira o cofre do cache de voltar/avançar (bfcache).
- Ao trancar ou sair, a resposta leva `Clear-Site-Data: "cache", "storage"`.
- Tudo isso cabe nos 10 ms de CPU do plano grátis (o trabalho pesado, o Argon2id, roda no navegador).
- Depois de estável: HSTS preload de `igorsc.com.br` (grátis; exige HTTPS em todos os subdomínios).

### 7.4 Sem service worker, sem nada guardado

- Nenhum service worker. Ao carregar, `navigator.serviceWorker.getRegistrations()` desregistra
  qualquer um e mostra um aviso (não deveria existir).
- Nada em `localStorage`, `IndexedDB` ou cookies. A sessão do cofre fica numa variável.
- Exceções, no `sessionStorage` da aba (somem quando ela fecha), nenhuma com segredo do cofre:
  - o `state` e o `code_verifier` do login do Google, entre sair para o Google e voltar, apagados na volta;
  - a hora em que a área de transferência deve ser limpa depois de um Copiar (só a hora, nunca o texto),
    apagada quando a limpeza acontece. Trancar recarrega a página, e sem isso a limpeza pendente se
    perdia (22/10).

## 8. Os fluxos

### 8.1 Entrar e abrir

1. **Google** (código + PKCE, escopo só `openid`, `prompt=select_account`). Volta para
   `/entrar` com `code` e `state`; o navegador limpa a URL na hora (`history.replaceState`).
2. `POST /api/entrar {code, verifier}` → o `cofre-api` troca o código no Google, confere o
   `id_token` (com `jose`), acha a conta do Murall pelo `sub` (RPC para o `mural-api`) e devolve
   uma **sessão de entrada** (5 min, só na memória). Sem conta no Murall: não entra.
3. `POST /api/cofre/desafio` → `{desafio, sal, kdf, credenciais[]}`.
4. A pessoa digita a senha mestra e confirma a passkey (no celular pelo QR code, ou no Windows
   Hello). O navegador roda o Argon2id **enquanto** espera a confirmação.
5. `POST /api/cofre/chave {assertion}` → o servidor confere a assinatura e devolve o `E_i` daquele
   aparelho (e, se for sem PRF, o `S_i` dele). O navegador abre `E_i` → **M**.
6. Calcula `kAuth`. `POST /api/cofre/abrir {kAuth}` → freio, comparação, e devolve `V`, o
   manifesto e a **sessão do cofre** (só na memória; 10 min parada ou 8 h no máximo, no servidor).
7. Abre `V` → **VK**. Baixa os itens, confere com o manifesto. Decifra cada item **só quando abre**
   (a lista mostra títulos, decifrados na hora e descartados ao trancar).
8. Mostra no topo, por alguns segundos, a **última mudança** do manifesto ("Mudado pela última vez
   em 21/10 às 14:32, no celular"). Se a data estiver velha demais, o servidor pode ter voltado o
   cofre para uma versão antiga.

### 8.2 Trancar

- Gatilhos: 5 min sem mexer, aba escondida por 1 min, `pagehide`, botão Trancar, 8 h.
- Trancar = avisa o servidor (`sendBeacon`) para matar a sessão, e `location.replace('/')`, que
  joga fora toda a memória da página (o jeito confiável de apagar segredo em JavaScript).

### 8.3 Criar o cofre

1. Entrar com o Google.
2. Registrar a passkey: o celular primeiro e, se quiser, o PC (`userVerification: 'required'`,
   `attestation: 'none'`, PRF pedido). O cofre mostra, para cada um, se ficou **com PRF** ou no
   **modo servidor**. Com um aparelho só, cria o cofre e deixa o aviso fixo nos Ajustes até haver
   o segundo.
3. Criar a senha mestra: o cofre sugere uma frase de 6 palavras sorteadas da lista em português sem
   acento (`getRandomValues` com rejeição, sem viés; ~77 bits), com hífens entre elas, e confere a
   força de uma escrita à mão (mínimo de ~70 bits estimados, lista das senhas mais comuns). Com
   algum aparelho no modo servidor, só aceita frase sorteada ou equivalente.
4. **Kit de emergência**: o código de recuperação (128 bits, em base32, 26 caracteres em grupos)
   aparece **uma vez**, numa página para imprimir. Nunca é salvo nem enviado em claro.
5. O navegador gera M, VK e os `S_i`, monta os `E_i`, `E_rec`, `V`, `kAuth` e o manifesto vazio, e
   envia.

### 8.4 Recuperar (perdeu os aparelhos)

Google + código de recuperação + senha mestra. Depois disso o cofre obriga a registrar uma passkey
nova e gerar um código novo; o antigo é apagado (uso único).

### 8.5 Gerenciar (com o cofre aberto)

- **Trocar a senha**: novo sal, novo `V`, novo `kAuth`.
- **Pôr ou tirar aparelho**: cria ou apaga um `E_i` (nunca deixa ficar sem nenhum).
- **Novo código de recuperação**: novo `E_rec`.
- **Trocar a chave do cofre** (depois de uma suspeita): VK nova, recifra todos os itens.
- **Aparelhos abertos**: lista as sessões e tem "Trancar todos".
- **Histórico**: aberturas, erros de senha, passkeys usadas, aparelho e país, dos últimos 90 dias.

### 8.6 Do lado do Murall

- **A aba "Cofre de senhas"** (decisão 10): nas Anotações, ao lado do Calendário, nas seções da
  barra (`ui/area-bar.ts`, junto de Mural, Kanban e Calendário), com um logo próprio no jeito dos
  outros (`ui/section-logos.ts`).
  - É **só um link** para `https://cofre.murall.igorsc.com.br/`, aberto **na mesma aba do
    navegador** (um `<a href>` comum com `rel="noreferrer"`, sem `target`). Nada de `iframe`: o
    cofre recusa ser emoldurado (`frame-ancestors 'none'`), e um cofre dentro da página do Murall
    deixaria uma falha no Murall desenhar um campo de senha falso por cima dele.
  - O Murall **nunca** carrega código nem dado do cofre: a aba não mostra contagem, nome de item
    nem se o cofre existe.
  - Só aparece para quem está logado.
- O **topo do cofre é igual ao do Murall**: o mesmo varal, os mesmos bottons e a mesma barra das
  Anotações, com "Cofre de senhas" marcada. Mural, Kanban e Calendário são links de volta
  (`https://murall.igorsc.com.br/anotacoes`, `/anotacoes/kanban`, `/anotacoes/calendario`), e os
  bottons (Perfil, Amigos, Ajustes) também. Ver a seção 10.
- **Sair do cofre o tranca**: clicar em qualquer link de volta, recarregar ou fechar joga a
  memória fora (o `pagehide` da seção 8.2). Voltar pelo botão do navegador abre o cofre trancado
  (o `Cache-Control: no-store` tira a página do cache de voltar).
- A mudança de endereço na barra do navegador é o que denuncia a troca; uma página falsa no lugar
  não consegue a passkey, que só responde a `cofre.murall.igorsc.com.br`.
- **Congelar o cofre** (nos Ajustes do Murall, só com o login): ninguém abre por 24 h. Para quando
  você suspeita de algo e está sem o celular na mão.
- Avisos no correio do Murall: abertura num aparelho novo, sequência de erros, passkey posta ou
  tirada, senha trocada.
- **Apagar a conta** do Murall com cofre: espera 7 dias com aviso e Cancelar, ou na hora depois de
  apagar o cofre lá dentro (o que pede o cofre aberto). Feito em 17.19.

## 9. A API (`cofre-api`)

Um Worker novo, pasta `cofre-api/`, com a mesma montagem do `api/` (Hono, `domain/`, `routes/`,
`adapters/d1.ts` e `sqlite-node.ts` para os testes, `migrations/`). Banco D1 **separado**
(`cofre`). Fala com o `mural-api` por **service binding com RPC** (`WorkerEntrypoint`), que não tem
endereço público: `contaPorGoogle(sub)`, `avisar(usuarioId, tipo)`, `temCofre(usuarioId)`.

### 9.1 Tabelas

```sql
cofre_contas      (usuario_id PK, versao_cripto, kdf_m, kdf_t, kdf_p, sal, v BLOB,
                   auth_hash BLOB, manifesto BLOB, contador INT, congelado_ate, criado_em)
cofre_envelopes   (id PK, usuario_id, tipo 'prf'|'servidor'|'recuperacao', credencial_id NULL,
                   envelope BLOB, s_cifrado BLOB NULL, rec_hash BLOB NULL, criado_em, usado_em)
cofre_credenciais (id PK, usuario_id, chave_publica BLOB, algoritmo, contador_assinatura INT,
                   apelido, criado_em, usado_em)
cofre_itens       (id PK, usuario_id, versao INT, dados BLOB, mudado_em)
cofre_sessoes     (hash PK, usuario_id, tipo 'entrada'|'cofre', criada_em, usada_em, expira_em, aparelho)
cofre_desafios    (id PK, usuario_id, desafio, expira_em)        -- uso único, 2 min
cofre_eventos     (id PK, usuario_id, tipo, em, aparelho, pais)   -- 90 dias
-- cofre_itens ganha `na_lixeira_desde NULL` (16.5); auth_hash e rec_hash levam a versão da pimenta (16.2)
freios            (como em api/src/domain/brake.ts)
```

### 9.2 Rotas

| Rota | O que faz |
|------|-----------|
| `POST /api/entrar` | Código do Google → sessão de entrada |
| `GET  /api/cofre` | Existe? Congelado? Quantos aparelhos? |
| `POST /api/cofre` | Criar (tudo da 8.3) |
| `POST /api/cofre/desafio` | Desafio WebAuthn + sal + parâmetros + credenciais |
| `POST /api/cofre/chave` | Assinatura WebAuthn → `E_i` (e `S_i`, se sem PRF) |
| `POST /api/cofre/recuperar` | Prova do código → `E_rec` |
| `POST /api/cofre/abrir` | `kAuth` → `V`, manifesto, sessão do cofre |
| `GET  /api/cofre/itens` | Todos os itens cifrados + manifesto |
| `PUT  /api/cofre/itens/:id` | Item + manifesto novo, com o contador anterior (409 se mudou) |
| `DELETE /api/cofre/itens/:id` | Idem |
| `PUT  /api/cofre/senha` | Novo sal, `V`, `kAuth` |
| `POST/DELETE /api/cofre/aparelhos/:id` | Pôr ou tirar passkey |
| `PUT  /api/cofre/recuperacao` | Novo `E_rec` |
| `GET  /api/cofre/sessoes` · `POST /api/cofre/trancar-todos` | Aparelhos abertos |
| `GET  /api/cofre/eventos` | Histórico |
| `POST /api/cofre/trancar` | Mata a sessão (com `Clear-Site-Data`) |
| `DELETE /api/cofre` | Apagar o cofre (só aberto, com confirmação) |
| `POST /api/cofre/confirmar` | Desafio para confirmar de novo com a passkey (17.21) |

### 9.3 Regras da API

- **Freios**: 5 erros de senha → espera 1 min, dobrando a cada nova sequência; no máximo 20 por
  dia; desafios no máximo 30 por hora. Cada sequência de erros vira aviso no Murall. O freio nunca
  tranca para sempre (senão o atacante te tranca fora).
- **Cota própria** de gravações por dia, como o `COTA_LINHAS_DIA` do `mural-api`, para nunca passar
  do plano grátis.
- **Limites de tamanho**: item até 16 kB, até 2.000 itens, corpo até 64 kB.
- **Validação** rígida de tudo (formatos base64url, tamanhos exatos de chaves e IVs).
- **Logs**: nunca o corpo do pedido nem os tokens. Sem `console.log` de dado.
  Cada resposta de erro deixa uma linha (o método, o molde da rota sem o id, o status e o código do
  erro, como `PUT /api/itens/:id 409 versao-do-item`), e o Workers Logs (o Observability, grátis) guarda
  só essas linhas, sem os logs de cada pedido (`invocation_logs = false`): nem o endereço nem os
  cabeçalhos ficam lá (24/10).
- **Respostas**: `Cache-Control: no-store`.
- **Secrets**: `COFRE_PIMENTA`, `COFRE_ENVELOPES` (32 bytes aleatórios cada) e o client secret do
  Google. Um cliente OAuth **próprio do cofre** ("Murall Cofre", só `openid`, redirect só para
  `/entrar` do cofre): o cofre nunca carrega a permissão da Agenda.
- Token da Cloudflare para o deploy do cofre com permissão **só** para este Worker e este D1.

## 10. O front do cofre

Um segundo projeto Angular no mesmo workspace (`projects/cofre`, alvo próprio no `angular.json`).
**Não importa nada de `src/app`**, só os tokens de cor e fonte em SCSS. Um teste confere isso
varrendo os imports.

### O topo igual ao do Murall

O cofre tem **uma cópia própria** do topo do Murall (o varal de kraft, os bottons e a barra das
Anotações com os logos), feita só de HTML e SCSS em `projects/cofre`. Não importa os componentes
de `src/app` (eles trazem lojas, sincronização e conteúdo de outras pessoas). As imagens e fontes
que o topo usa são copiadas para o cofre e servidas da origem dele (o COEP barra as de fora).

- Os links do topo levam ao Murall (seção 8.6) e trancam o cofre ao sair.
- O topo não mostra nada que dependa da conta do Murall (nem a foto do perfil nem os avisos): o
  cofre não tem o token do Murall e não deve ter.
- Quando o topo do Murall mudar, o do cofre muda junto, à mão. Um teste compara a lista de seções
  e os endereços dos dois, para avisar se um ficar para trás.

### Telas

1. **Entrar** (Google) → **Abrir** (senha + passkey).
2. **Lista**: busca local, títulos e sites. Nada decifrado além do necessário.
3. **Item**: os campos **Título, User, Senha (mascarada), URL e Descrição, todos opcionais**
   (decisão 11). Revelar (15 s), Copiar (limpa em 30 s),
   Mostrar para digitar (letras grandes, separadas em grupos), Abrir o site (abre a URL salva;
   ajuda a não cair em site falso).
4. **Gerador**: frase de palavras (a lista em português sem acento) ou caracteres aleatórios, sem
   viés.
5. **Ajustes**: senha, aparelhos (com PRF ou no modo servidor; o aviso fixo "Ponha a passkey num
   segundo aparelho" enquanto houver um só), código de recuperação, aparelhos abertos, histórico,
   **Avisar senha vazada** (desligado por padrão), apagar. Mais as instruções do aparelho (perfil
   sem extensões, histórico da área de transferência, Recall, BitLocker).

### Aviso de senha vazada (ligado nos Ajustes)

- Ao abrir o cofre, e ao salvar uma senha, o navegador calcula o SHA-1 de cada senha, manda só os
  5 primeiros caracteres para `api.pwnedpasswords.com/range/` com `Add-Padding: true` e confere o
  resto ali mesmo. A senha e o hash inteiro nunca saem.
- Senha encontrada: um selo "Vazada" no item e uma lista "Senhas vazadas" no topo. Nada é
  guardado: a conferência se repete a cada abertura.
- Sem rede ou com a API fora: não avisa nada e não atrapalha o cofre.

### Comportamentos de segurança

- Campos de segredo: `type=password`, `autocomplete="off"`, `spellcheck=false`,
  `autocorrect=off`, `autocapitalize=off`, `translate="no"`.
- `@media print`: segredos somem.
- Ao perder o foco da janela: borra o conteúdo (opcional, ligado por padrão).
- **Vigia do DOM**: um `MutationObserver` avisa quando aparece na página algo que o cofre não pôs
  (o sinal típico de uma extensão injetando coisas): "Algo de fora mexeu nesta página. Feche o
  cofre e use um perfil sem extensões."
- Aviso grande no console contra o golpe do "cole isto no F12".
- Recusa abrir com `navigator.webdriver` ligado.
- Não escuta `postMessage`. Links para fora: só os do topo (para o Murall, `rel="noreferrer"`) e
  o "Abrir o site" de um item (aba nova, `noopener noreferrer`).
- Nada de `innerHTML`, `bypassSecurityTrust*`, markdown ou HTML vindo de dado.
- Visual com o jeito do Murall, mas **clareza acima de enfeite**: numa tela de segurança, o
  que está aberto, trancado ou em risco tem de ser óbvio. Passa pelo Impeccable.

### Gaveta (opcional, Fase 7)

Itens marcados como "gaveta" são cifrados com uma segunda chave (`VK2`), embrulhada por cada
passkey com outro sal do PRF (`"murall-cofre-v1-gaveta"`), ou pelo servidor no modo sem PRF.
Revelar um item da gaveta pede **a passkey de novo** (Face ID no celular), e a `VK2` é descartada
logo depois. Um malware com o cofre aberto não consegue ler a gaveta sem essa confirmação. Para as
senhas mais críticas (e-mail principal, banco).

## 11. Contas e cadeia de entrega

O maior risco que sobra num site é alguém publicar um cofre adulterado. Por isso:

### O que o usuário faz (Fase 0, tudo grátis)

- [ ] **DNS na Cloudflare** (passos da seção 7.2).
- [ ] **GitHub**: 2FA com passkey (celular ou Windows Hello); tirar SMS; revisar quem tem acesso e
      os tokens antigos.
- [ ] **Cloudflare**: 2FA com passkey ou app autenticador.
- [ ] **Google** (login e o projeto do Google Cloud): passkey e 2FA ligados.
- [ ] **Apple** (se a passkey do celular for do iCloud): 2FA ligado (já vem) e código do iPhone forte.
- [ ] **registro.br**: 2FA com app autenticador.
- [ ] **E-mail que recupera tudo isso**: o mais protegido de todos.
- [ ] Registros **CAA** só para as autoridades usadas, e o alerta de certificado novo ligado.
- [ ] No PC: navegador oficial atualizado, **perfil só para o cofre sem extensões**, BitLocker,
      histórico da área de transferência e Recall desligados (ou o navegador excluído).

### No repositório

- Workflow novo `cofre.yml`: só `workflow_dispatch` (nunca no push), environment `cofre` com
  **aprovação obrigatória do usuário**, token da Cloudflare só do cofre.
- **Todas** as Actions (de todos os workflows) fixadas por **hash de commit**, não por tag.
- `npm ci` com lockfile; o cofre só com Angular + `hash-wasm` no navegador e `hono` + `jose` +
  (verificação WebAuthn) no Worker. Nenhuma dependência nova sem aprovação do usuário.
- Build reprodutível: Node fixo, e o deploy publica a lista de **SHA-256 de cada arquivo** no
  repositório (`cofre-hashes.json`).
- **Vigia** (`cofre-vigia.yml`, a cada hora): baixa os arquivos no ar e compara com o
  `cofre-hashes.json`; diferença = falha = e-mail do GitHub. Avisa se alguém publicou por fora.
- Proteção do branch `main` com os testes obrigatórios, e revisão das mudanças em `projects/cofre`
  e `cofre-api` antes de publicar.

> O repositório é público. Tudo bem: a segurança não depende de o plano ser secreto, só das chaves.
> Nenhum secret entra no git.

## 12. Fases

Uma de cada vez (o usuário prefere rodadas pequenas). Cada fase termina com testes, build e commit.

| Fase | O que entra | Pronto quando |
|------|-------------|---------------|
| 0 | Usuário: DNS na Cloudflare, 2FA, PC (seção 11) | Lista marcada |
| 1 | **Página de teste do PRF** (em cada aparelho e navegador; seção 16.9) + **lista de palavras** + **núcleo de cripto** (`projects/cofre/src/core/crypto.ts`), sem tela | Sabemos quais aparelhos têm PRF; testes com vetores oficiais (Argon2id da RFC 9106, HKDF da RFC 5869), ida e volta, adulteração de cada campo falha, rebaixamento recusado |
| 2 | **`cofre-api`**: tabelas, rotas, freios (por conta e por IP), cota, quem pode usar (`COFRE_CODIGOS`), limpeza diária, lixeira, RPC com o `mural-api` (seção 16) | Testes de API (Node + SQLite como em `api/test`), incluindo ataques: desafio reusado, contador da passkey voltando, `kAuth` errado, freio, 409 |
| 3 | **Hospedagem**: Worker com os arquivos, cabeçalhos, deploy com aprovação, vigia, secrets com cópia em papel, o D1 `cofre` no backup diário e na checagem de saúde (seção 16) | Uma página "olá" no ar; script que confere cada cabeçalho; nota A+ no securityheaders.com e no Mozilla Observatory |
| 4 | **Criar o cofre**: Google, um ou dois aparelhos (com o aviso), senha com o gerador em português, kit de emergência | Fluxo de ponta a ponta no navegador com autenticador virtual |
| 5 | **Abrir e usar**: abrir, trancar, lista, item, gerador, área de transferência | Idem + os gatilhos de trancar |
| 6 | **Gerenciar e ligar ao Murall**: senha, aparelhos, recuperação, sessões, histórico, congelar, avisos no correio, apagar a conta protegido, a aba "Cofre de senhas" nas Anotações e o topo igual ao do Murall no cofre, a página de privacidade (seção 16.10) | Novidades e BUILD; testes nos dois lados |
| 7 | **Endurecer**: gaveta, vigia do DOM, aviso de senha vazada, revisão de segurança final (`/security-review` + leitura linha a linha da cripto) | Lista de ataques da seção 4 toda testada |
| 8 (opcional) | **Extensão verificadora**, grátis (Firefox ou carregada à mão no Chrome): confere os hashes do cofre antes de deixar abrir | Única defesa *dentro* do navegador contra um deploy adulterado |

### Testes que não podem faltar

- Cada ataque da seção 4 que dá para simular vira um teste com o nome dele.
- Autenticador virtual do Chrome pelo DevTools Protocol (`WebAuthn.addVirtualAuthenticator`, com
  e sem `hasPrf`), via `puppeteer-core`, para os fluxos de ponta a ponta nos dois modos.
- Teste que falha se aparecer `innerHTML`, `bypassSecurityTrust`, `localStorage`, `indexedDB`,
  `document.cookie`, `eval` ou `console.log` em `projects/cofre`.
- Teste que falha se `projects/cofre` importar algo de `src/app`.
- Teste que falha se aparecer dependência nova no bundle do cofre.

## 13. O que não tem como proteger

Para ninguém achar que existe 100%:

- **PC ou navegador dominado com o cofre aberto**: o que aparece na tela, ou passa pela memória,
  pode ser visto. A gaveta e o trancar cedo diminuem o estrago.
- **Deploy adulterado**: se alguém publicar um cofre falso, na próxima vez que você abrir ele pega
  a senha e o que a passkey liberar. 2FA, aprovação manual e o vigia tornam isso difícil e
  barulhento, mas não impossível. Só a extensão verificadora (Fase 8) fecha esse buraco de dentro do
  navegador. Conferir hashes com SRI não ajuda: o HTML vem do mesmo servidor que seria adulterado.
- **Aparelho sem PRF + Cloudflare tomada inteira**: aí só a senha mestra segura. Por isso, nesse
  modo, a frase sorteada é obrigatória.
- **A passkey é mais fraca que uma chave física**: a do celular é sincronizada na nuvem da Apple ou
  do Google, e a do PC mora no mesmo PC onde um malware pode estar. É a troca por custo zero.
- **Esquecer a senha mestra**: perde o cofre. Ninguém consegue recuperar, nem o dono do site.
- **Perder os aparelhos e o código**: idem. Com um aparelho só (decisão 4), perder ele já deixa só
  o código.
- **O servidor voltar o cofre inteiro para uma versão antiga**: não é detectado, porque nada fica no
  aparelho (decisão 6). A data da última mudança na tela de abrir é o aviso.
- **Perder a nuvem**: não há exportação do cofre (decisão 9). Sobram o backup diário trancado
  do D1 `cofre` (30 dias, seção 16.3) e a volta de 7 dias do D1.
- **Perder os secrets do Worker** (`COFRE_PIMENTA`, `COFRE_ENVELOPES`): sem eles ninguém abre o
  cofre, nem com senha e código. Por isso eles têm cópia em papel (seção 16.2).
- **Ser forçado a abrir**: fora do escopo.
- **A senha do Google**: não guarde **só** no cofre, porque o cofre precisa do login do Google. Se
  perder o acesso ao Google, fica trancado do lado de fora. O mesmo vale para a senha da Apple, se a
  passkey do celular estiver no iCloud.
- **Códigos de 2FA (TOTP)**: fora da primeira versão. Guardar a senha e o código 2FA no mesmo lugar
  junta dois fatores num só.

## 14. Regras para quem implementar

Valem para este repositório inteiro (do usuário, Igor Soler):

- **Custo zero**: nada pago, nenhum plano pago, nenhuma compra. Se algo precisar, parar e perguntar.
- **Commits** no nome do usuário (autor do git `igorsoler.c`), **sem** linha `Co-Authored-By`. Um
  commit ao fim de cada fase. **Push só quando o usuário pedir** (push publica o site).
- Todo commit sobe `BUILD` em `src/app/core/build.ts` em 1 (`git rev-list --count HEAD` + 1).
- Toda mudança que vai para o ar entra nas Novidades (`src/app/core/news-list.ts`), seguindo
  `NOVIDADES.md` (ler antes). O cofre é uma funcionalidade nova (F2) quando o botão aparecer no
  Murall (Fase 6).
- Antes do commit: `npm run test:ci` na raiz; em `api/` e `cofre-api/`, `npm run typecheck` e
  `npm test`; `npx ng build` de produção dos dois projetos; abrir a build com dados guardados.
- Toda mudança de front passa pela skill **Impeccable**. Textos da tela em português simples.
- Atualizar `DESIGN.md` e `PRODUCT.md` quando a tela mudar.
- **Nunca rodar prettier** no repositório.
- **Específico do cofre:**
  - Mudança na cripto (seção 6) só com aprovação explícita do usuário, e sempre com teste novo.
  - Nenhuma dependência nova sem aprovação.
  - Nada de conteúdo de terceiros, `innerHTML`, armazenamento local, service worker ou log de dado.
  - Na dúvida entre conforto e segurança, escolher segurança e perguntar ao usuário.

## 15. Decisões

### Decididas

1. **Onde o cofre mora** (21/10): DNS de `igorsc.com.br` na Cloudflare (grátis), cofre num Worker
   só, com site e API na mesma origem (seção 7.2). O usuário não teve preferência; foi a
   recomendação.
2. **Custo zero** (21/10): passkey do celular e do PC no lugar da chave física (seções 2 e 5).
3. **Código de recuperação** (21/10): **só substitui a passkey**. Abrir com ele pede Google +
   código + senha mestra (seções 6.1 e 8.4). Papel roubado + Google não abrem nada; esquecer a
   senha mestra continua sendo perder o cofre, sem volta. Descartadas: o código abrir tudo sozinho
   (o papel viraria o alvo) e ter dois códigos (o segundo teria o mesmo risco).

4. **Quantos aparelhos** (21/10): o cofre **aceita ser criado com um aparelho só**, com um aviso
   fixo nos Ajustes ("Ponha a passkey num segundo aparelho") até haver dois. Com um só, perder o
   aparelho deixa só o código impresso (seções 8.3 e 13).
5. **Aparelho sem PRF** (21/10): **aceito, com aviso**. Fica marcado "modo servidor" nos Ajustes
   e, com algum aparelho assim, a senha mestra tem de ser a frase sorteada (seções 5 e 8.3).
6. **Lembrar o último contador no navegador** (21/10): **não**. Nada fica no aparelho, nem
   números. Voltar o cofre inteiro para uma versão antiga não é detectado; para ajudar, a tela de
   abrir mostra a última mudança do manifesto (data e aparelho), e você nota se ela estiver velha
   (seções 4 e 13).
7. **Lista de palavras do gerador** (21/10): **português, sem acento nem cedilha**, 7.776 palavras,
   licença livre. A Fase 1 escolhe a lista, confere a licença e a qualidade (sem palavras
   repetidas, parecidas ou ofensivas) e a guarda no repositório (seção 8.3).
8. **Avisar senha vazada** (21/10): **sim, desligado por padrão**; você liga nos Ajustes. Usa o
   Have I Been Pwned (grátis, sem chave) por k-anonimato: só os 5 primeiros caracteres do SHA-1
   saem do navegador, com o cabeçalho `Add-Padding: true` para a resposta não revelar nada pelo
   tamanho (seções 7.3 e 10).
9. **Exportar backup cifrado** (21/10): **não**. O cofre só existe na nuvem; a proteção contra
   perder o banco é o backup diário trancado (o `backup.yml`, **que passa a exportar também o D1
   `cofre`**, seção 16.3) e a volta de 7 dias da Cloudflare (seção 13).

10. **Onde o cofre aparece** (21/10): uma aba **"Cofre de senhas"** nas Anotações, ao lado do
    Calendário, que abre o cofre **na mesma aba do navegador**, no endereço dele, com o **topo
    igual ao do Murall** (seções 8.6 e 10). Descartados: abrir dentro da página do Murall (barrado
    pela segurança) e abrir numa aba nova do navegador.

11. **Os campos de cada senha** (21/10, pedido do usuário): **Título, User, Senha, URL e
    Descrição**, com esses nomes na tela, **todos opcionais** (um item pode ter só o título, só a
    senha…). Tudo vai dentro do item cifrado (6.2), junto com as datas e o histórico das últimas 5
    senhas; o servidor não vê nenhum deles. Não mexeu em nada já feito: os campos são decididos na
    página do cofre (Fase 5).

### Em aberto

Nenhuma. As próximas dúvidas aparecem na Fase 1 (quais aparelhos têm PRF, qual lista de palavras).

## 16. Operação e detalhes (revisão de 21/10)

O que faltava no plano. Sem estes pontos, o cofre funcionaria no primeiro dia, mas poderia se
perder ou falhar depois.

### 16.1 Quem pode usar

- Uma variável `COFRE_CODIGOS` no `wrangler.toml` do `cofre-api`, igual à `AGENDA_CODIGOS` do
  `mural-api`: os códigos das contas que veem o cofre; vazio, ninguém; `*`, todo mundo logado.
- **Começa só com o código do usuário.** Abrir para os amigos é trocar para `*` depois, quando o
  cofre estiver testado. A cota do plano grátis dá para muita gente (seção 2).
- O `GET /v1/eu` do `mural-api` passa a dizer `cofre: true|false` (perguntando ao `cofre-api` pelo
  RPC), e a aba "Cofre de senhas" só aparece para quem pode. O cofre recusa quem não está na lista,
  mesmo que alguém chegue direto pelo endereço.

### 16.2 Os secrets do Worker: cópia em papel e troca

- `COFRE_PIMENTA` e `COFRE_ENVELOPES` são 32 bytes aleatórios cada, gerados com
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- **A Cloudflare não mostra um secret depois de gravado.** Antes do `npx wrangler secret put`, o
  usuário imprime ou escreve os dois e guarda o papel num lugar só dele (pode ser junto do código de
  recuperação). Sem eles, ninguém abre o cofre: as provas de senha e de código são conferidas com a
  pimenta, e os aparelhos no modo servidor dependem do `COFRE_ENVELOPES`.
- Os dois levam número de versão (`COFRE_PIMENTA_1`, …), e o banco guarda com qual versão cada
  prova foi feita. Para trocar a pimenta: grava a versão nova, e cada conta passa para ela na
  próxima abertura certa (o servidor recalcula o HMAC da prova que acabou de conferir). Para trocar
  o `COFRE_ENVELOPES`: um script recifra os `S_i` (o servidor já os tem).
- O mesmo para o `GOOGLE_CLIENT_SECRET` do cliente OAuth do cofre: anotado antes de gravar.

### 16.3 Backup e volta do banco do cofre

- O `backup.yml` hoje exporta só o D1 `mural`. Passa a exportar **também o D1 `cofre`**, num
  arquivo próprio (`backup-cofre-<dia>.sql.gz.enc`), trancado com a mesma `BACKUP_SENHA`, por 30
  dias. O conteúdo já é cifrado; o tranca do backup é uma segunda camada.
- O token da Cloudflare do backup precisa poder ler o D1 `cofre` (permissão de D1 da conta).
- O README do `cofre-api` explica como voltar um backup e como usar a volta de 7 dias do D1
  (Time Travel, grátis).

### 16.4 Limpeza diária

Um cron do `cofre-api` (o plano grátis aceita alguns por conta; o `mural-api` usa um) apaga:
sessões vencidas, desafios vencidos, eventos com mais de 90 dias, itens na lixeira há mais de 30
dias e registros velhos dos freios.

### 16.5 Lixeira

Apagar um item não o apaga na hora: ele vai para a **lixeira** do cofre, ainda cifrado, por 30
dias, e dá para voltar. O manifesto diz quais itens estão na lixeira. Sem exportação (decisão 9), é
a proteção contra apagar sem querer.

### 16.6 Freio por IP antes do login

As rotas de antes do login (`/api/entrar`, `/api/cofre/desafio`) também têm freio **por IP**, além
do freio por conta: por exemplo, 30 entradas por hora. O IP vem do `CF-Connecting-IP` e só é
guardado como HMAC com um sal que troca todo dia (nunca o IP em claro).

### 16.7 Checagem de saúde

O `saude.yml` passa a conferir também o `cofre-api` (um `GET /api/status`, sem login) e o uso do
D1 `cofre` e do Worker contra o plano grátis, no mesmo relatório de hoje.

### 16.8 Passkeys: os detalhes do registro

- `rp.name` = "Murall Cofre"; `rp.id` = `cofre.murall.igorsc.com.br`.
- `user.id` = 16 bytes aleatórios por conta, nunca o e-mail nem o código (o `user.id` fica no
  aparelho). `user.name` e `user.displayName` = "Cofre do Murall (<código>)", para você reconhecer
  na lista de passkeys do celular.
- `residentKey: 'preferred'`, `userVerification: 'required'`, `attestation: 'none'` e
  `excludeCredentials` com as passkeys já registradas (não registra o mesmo aparelho duas vezes).

### 16.9 A página de teste do PRF (Fase 1)

- Uma página avulsa e temporária do Murall: `public/prf-teste.html` + `prf-teste.js`, no
  GitHub Pages (o service worker do Murall já deixa as páginas `.html` avulsas passarem direto). CSP
  própria e rígida como a do `google.html`, sem nada do app.
- Cria uma passkey **de teste** ("Teste do PRF", `rpId` = `murall.igorsc.com.br`), pede o PRF no
  registro e na abertura, e mostra o resultado na tela: "PRF: sim" ou "não", neste aparelho e pelo
  QR code com o celular. Não manda nada para servidor nenhum.
- Testar: iPhone (Safari), PC com Windows Hello (Chrome e Edge), PC com o celular pelo QR code.
- Depois: apagar as passkeys de teste (Ajustes do iPhone e do Windows) e tirar a página do site.
  O resultado entra neste plano.

### 16.10 Página de privacidade

A `public/privacidade.html` ganha uma parte sobre o cofre: o que é guardado (só texto cifrado;
ninguém, nem o dono do site, consegue ler), o histórico de aberturas (aparelho e país, 90 dias), a
lixeira (30 dias), o backup (30 dias, cifrado) e o aviso de senha vazada (só 5 caracteres do hash,
e só se ligado).

### 16.11 Acessibilidade

- Tudo pelo teclado, com o foco visível; Esc fecha o que estiver aberto.
- Leitor de tela: avisos como "Copiado" e "Cofre trancado" vão por `aria-live`, mas **nunca a
  senha**. A senha revelada só é lida se a pessoa levar o foco até ela.
- Contraste e alvos de toque no padrão do Murall (Impeccable); sem animação com
  `prefers-reduced-motion`.

### 16.12 Usar o cofre no próprio celular

- No celular, a passkey é do próprio aparelho (Face ID): sem QR code.
- Trocar de app conta como esconder a aba: tranca em 1 minuto (o iPhone costuma fechar a página
  antes).
- No iPhone o navegador não deixa limpar a área de transferência depois de sair da página: o
  "Mostrar para digitar" é a opção recomendada ali, e o cofre diz isso no Copiar.
- O layout funciona de 320 px para cima.

### 16.13 Ligação entre os dois Workers

- O `mural-api` e o `cofre-api` se chamam pelos dois lados por service binding (RPC): o Murall
  pergunta se a conta pode usar o cofre e se tem cofre, e congela; o cofre pergunta a conta pelo
  Google e manda os avisos.
- Ordem do primeiro deploy: o `cofre-api` primeiro (com o binding para o `mural-api`, que já
  existe), depois o `mural-api` com o binding para o `cofre-api`.
- O **Congelar** (seção 8.6) pode ser usado por quem roubar o token do Murall: o estrago é o cofre
  ficar fechado por 24 h, nada lido. Aceito, porque é o freio de emergência.

### 16.14 Google Cloud (passos do usuário, Fase 4)

- No projeto do Google Cloud de hoje, um cliente OAuth novo do tipo Web, "Murall Cofre": origem
  `https://cofre.murall.igorsc.com.br`, redirect `https://cofre.murall.igorsc.com.br/entrar`, só o
  escopo `openid`.
- Conferir que a tela de permissão está "Em produção" (com "Teste", só os usuários de teste
  entram). O domínio já está verificado pelo TXT `google-site-verification`.
- O client ID vai no `wrangler.toml`; o client secret, no `wrangler secret put` (anotado antes,
  16.2).

### 16.15 Desenvolvimento local

- `cofre-api` com `npx wrangler dev` e o site com `ng serve cofre`, os dois em `localhost` (o
  WebAuthn aceita `localhost` sem HTTPS). Uma entrada nova no `.claude/launch.json`.
- Testes de ponta a ponta só com o autenticador virtual do Chrome; **nunca** uma passkey de
  verdade em desenvolvimento.
- Os secrets locais em `cofre-api/.dev.vars`, que o `.gitignore` do `cofre-api` ignora desde o
  primeiro commit (como o do `api/`).

## 17. Andamento

### 17.1 Fase 1 (começada em 21/10)

| Peça | Onde | Estado |
|------|------|--------|
| Página de teste do PRF | `public/prf-teste.html` + `prf-teste.js` | Feita (1819a89). Conferida com o autenticador virtual do Chrome, com e sem PRF. **Falta o usuário testar** no iPhone, no Windows Hello (Chrome e Edge) e no PC com o celular pelo QR code, e trazer o "Copiar o resultado" |
| Núcleo de cripto | `projects/cofre/src/core/crypto.ts` (+ `bytes.ts`) | Feito (342eab0), com os testes da seção 12 |
| Regras do código do cofre | `projects/cofre/regras.test.mjs` (Node, no `test:ci`) | Feito (342eab0) |
| Sorteio da frase e código de recuperação | `core/sorteio.ts`, `core/codigo.ts` | Feitos (9cc69d0) |
| Lista de palavras | `core/palavras.ts`, `scripts/cofre-palavras.py` | Feita (17.3) |

O projeto `cofre` existe no `angular.json` só com o alvo de teste (`ng test cofre`); o de build entra
na Fase 3. O `npm run test:ci` roda os testes do Murall, os do cofre e as regras.

### 17.2 Detalhes decididos ao implementar

O plano não dizia, e a Fase 1 decidiu assim. São todos do lado mais seguro, mas mexem no formato:
**o usuário confere** (seção 14: mudança na cripto só com aprovação dele).

1. **Senha normalizada em NFC** antes do Argon2id: a mesma frase com acento digitada no iPhone e no
   PC dá a mesma chave (sem isso, "ç" pode chegar de dois jeitos e o cofre não abrir).
2. **AAD também nos envelopes e em V**, além dos itens e do manifesto: `cofre-v1|env|usuário|envelope`,
   `cofre-v1|rec|usuário`, `cofre-v1|cofre|usuário`. O servidor não consegue servir o envelope ou o V
   de uma conta em outra.
3. **Formato de todo selado**: `[versão 1 byte][IV 12 bytes sorteado][cifrado + etiqueta 16 bytes]`.
   Byte de versão desconhecido é recusado.
4. **HKDF sem sal** onde o plano não dá um (todos menos o dos itens, que usa o id).
5. **Teto dos parâmetros do Argon2id** (m ≤ 1 GiB, t ≤ 16, p ≤ 4) além do mínimo: um servidor
   adulterado também não consegue travar o navegador.
6. **Completar até 512 bytes com espaços** (o JSON os ignora). O manifesto também é completado.
7. **Ids sempre UUID em minúsculas** (o id do usuário do Murall já é um UUID); nada mais entra num AAD.
8. **Código de recuperação com 28 caracteres** (7 grupos de 4), não 26: os 128 bits + 12 bits de
   conferência (começo do SHA-256), em base32 de Crockford. Pega erro de digitação antes de gastar
   uma tentativa no servidor. A cripto usa só os 16 bytes.
9. **Base64url só canônico** no que vem do servidor (sem padding, sem bits sobrando).
10. **Vetores do Argon2id**: os da RFC 9106 usam "dado associado", que o `hash-wasm` não expõe; os
    testes usam os da implementação de referência (phc-winner-argon2, `test.c`), que bateram também
    com o que eu tinha anotado deles. O HKDF usa os três casos da RFC 5869, e os vetores próprios da
    versão 1 foram conferidos também com o `node:crypto`.
11. O `hash-wasm` guarda a senha e os 64 MiB de trabalho na memória do WASM até o coletor de lixo
    passar: não dá para zerar por fora. Entra na lista da seção 13 (PC dominado com o cofre aberto).

### 17.3 A lista de palavras (feita em 21/10)

A única lista pronta em português que achei (um gist de "Portuguese diceware") **não serve**: sem
autor nem licença, com entradas como "aa", "aaa", "f.o.b.", acentos tirados à força ("fumaca",
"acao") e palavrões. Com o "pode" do usuário, a lista foi **montada**: `core/palavras.ts`, gerada
por `scripts/cofre-palavras.py` (rodar de novo com as mesmas fontes dá a mesma lista; o script
confere o SHA-256 de cada fonte).

- **De onde vem**: as entradas do dicionário de Portugal do LibreOffice que são substantivo, verbo,
  adjetivo, advérbio ou número (ele marca a classe, e assim saem nomes próprios e conjugações),
  conferidas no VERO (o pt_BR, expandido pelas regras de sufixo) e ordenadas pelas contagens das
  legendas do Brasil (FrequencyWords, OpenSubtitles), somando plural e feminino. Fica de fora o que
  se usa mais de 5 vezes mais nas legendas de Portugal ("facto", "autocarro", "planear").
- **Formato**: só de a a z, palavras que já se escrevem assim (nunca com o acento arrancado; perde
  a que tem gêmea acentuada mais usada, como "esta" para "está"), **de 3 a 10 letras** (o plano
  dizia 3 a 9; com 10 entram "acompanhar" e "astronauta" no lugar de termos raros), média de 7,3.
  A menos comum aparece 105 vezes nas legendas.
- **Revisão à mão** (`scripts/cofre-palavras-fora.txt`, 717 itens): sexo e corpo, insultos e
  ofensas a grupos, violência, doenças, drogas, política e religião, grafias de Portugal,
  estrangeirismos, termos técnicos, formas estranhas, e palavras que juntas na frase formariam uma
  ofensa racial. Cada rodada que tirava palavras teve as que entraram no lugar revistas também.
- **Licença**: a lista deriva das contagens CC-BY-SA 4.0, então é CC-BY-SA 4.0 (dito no cabeçalho
  do arquivo). Os dicionários (GPL/LGPL/MPL) e a lista de palavrões (CC-BY 4.0) só filtram.
- **Testes**: a conferência da lista, a frase saindo dela, palavras comuns presentes, e um teste em
  Node (`regras.test.mjs`) que falha se uma palavra tirada à mão voltar.

### 17.4 Fase 2 (começada em 21/10)

Em partes, um commit cada:

| Parte | O que entra | Estado |
|-------|-------------|--------|
| 1 | Esqueleto do `cofre-api/` (a montagem do `api/`): o banco inteiro da 9.1 com o que a seção 16 pede, `GET /api/status`, a cota, o `MODO`, a recusa de pedido de outra origem, a configuração (`COFRE_CODIGOS`, `COFRE_ORIGEM`, `COFRE_RP_ID`, que desliga a API se o rpId não for exatamente o host do cofre), testes em Node + SQLite e no D1 simulado, e o workflow `cofre-api.yml`, que só testa | Feita |
| 2 | Login com o Google (código + PKCE), a sessão de entrada e quem pode usar, com a conta do Murall por RPC (`CofreRpc` no `api/`), e já o freio por IP do login (16.6) | Feita |
| 3 | Conferência das passkeys (registro e assinatura, código próprio, sem dependência nova) e criar o cofre | Feita |
| 4 | Abrir: desafio, chave, abrir e recuperar, com o freio da senha, a sessão do cofre e trancar | Feita |
| 5 | Itens e manifesto: gravar com o contador (409), lixeira, limites e cota | Feita |
| 6 | Gerenciar (senha, aparelhos, código, sessões, histórico, apagar) e limpeza diária | Feita |

Detalhes da parte 1: o banco ganhou, além da 9.1, o `usuario_passkey` (o `user.id` de 16 bytes das
passkeys, 16.8), as versões da pimenta e do `COFRE_ENVELOPES` ao lado de cada prova (16.2), o
`prf` de cada passkey, a tabela `cofre_freio_senha` (sequências de erros) e `freios` por chave (a
conta ou o HMAC do IP, 16.6). Restrições no próprio banco: um envelope de código por conta, um por
aparelho, e cada tipo de envelope com só as colunas dele. O `wrangler.toml` vai com um id
provisório do D1 até a Fase 3, e até lá a migração 0001 ainda pode mudar.

Detalhes da parte 3 (decididos ao implementar; a conferência das passkeys é código próprio, por
escolha do usuário em 21/10, em vez da `@simplewebauthn/server`, para não trazer dependências):

- `cofre-api/src/domain/webauthn.ts` segue os passos 7.1 e 7.2 da WebAuthn nível 3: tipo, desafio,
  origem exata, nada de iframe de outra origem (`crossOrigin`/`topOrigin`), hash do rpId, presença e
  verificação do usuário, flags de cópia coerentes, contador que tem de subir (com algum dos dois
  diferente de zero), só ES256 (P-256) e RS256 (2048 a 4096 bits), assinatura ECDSA em DER lida no
  formato estrito. O `attStmt` não é lido (atestado "none": o cofre não confia em fabricante), mas o
  `fmt` pode ser qualquer um, para um aparelho que mande outro não ser recusado à toa.
- `cbor.ts`: leitor de CBOR rígido (forma mais curta, sem tamanho indefinido, sem tag, sem número com
  vírgula, chave repetida recusada, profundidade 4, 64 itens).
- Testes com vetores reais do autenticador virtual do Chrome (ES256 e RS256, registro e duas
  assinaturas, conferidas também com o `node:crypto`), rodando no Node e no runtime dos Workers, e
  um teste por ataque. Estragar de propósito a conferência de origem, de verificação e de assinatura
  faz 11 testes falharem.
- **O `user.id` das passkeys** (16.8 dizia "16 bytes aleatórios por conta"): até o cofre existir, é
  derivado da pimenta e do id da conta (HMAC, 16 bytes), para os dois aparelhos da criação terem o
  mesmo `user.id` sem guardar estado; ao criar, ele fica em `cofre_contas.usuario_passkey` e não muda
  mais. Sem a pimenta, não dá para ligar o `user.id` à conta. **O usuário confere.**
- `POST /api/cofre/registro`: o desafio (uso único, 2 minutos, 30 por hora por conta), o rpId, o
  `user.id`, o nome "Cofre do Murall (K7QF-M2XA)" e `excludeCredentials` com as passkeys que já
  existem.
- `POST /api/cofre`: confere os tamanhos exatos de cada selado da versão 1, o mínimo do Argon2id
  (o mesmo do navegador), um ou dois aparelhos, cada passkey contra o seu desafio (que sai do banco
  antes, mesmo se der errado), PRF ou S_i (nunca os dois), e grava tudo num lote só: as provas como
  HMAC com a pimenta, o S_i cifrado com `COFRE_ENVELOPES_n` amarrado à conta e ao envelope, e o
  evento `cofre-criado`. Devolve `201`; a sessão do cofre aberto vem com a parte 4.

Detalhes da parte 4:

- `POST /api/cofre/desafio` (sessão de entrada): o desafio de assinatura, o sal, o Argon2id, as
  passkeys (com o apelido e se têm PRF) e `mudadoEm`. Cofre congelado: 423.
- `POST /api/cofre/chave`: confere a assinatura com a chave guardada e o contador (que tem de subir;
  a gravação dele é condicionada no banco, para duas assinaturas ao mesmo tempo não o fazerem voltar:
  a que chega depois de uma maior é recusada e não marca a passkey), devolve o envelope do aparelho e, no modo servidor, o S_i (só depois da assinatura), e marca na
  sessão de entrada que a passkey foi conferida, por 2 minutos.
- `POST /api/cofre/abrir` (`kAuth`): **só logo depois de uma passkey ou do código**, e a marca é
  gasta de forma atômica **antes** de conferir a senha: cada palpite custa um toque no aparelho
  (ameaça 15), e duas tentativas ao mesmo tempo não aproveitam o mesmo toque. Freio: 5 erros seguidos,
  espera de 1 minuto que dobra a cada sequência (no máximo 1 dia); 20 erros por dia. A tentativa conta
  como erro antes de a senha ser conferida, na mesma gravação que gasta a marca e com a condição do
  freio no banco (sem espera, menos de 20 erros nas 24 horas); acertar desfaz (28/10: conferir antes e
  anotar depois deixava várias tentativas ao mesmo tempo, uma por sessão de entrada com a sua passkey,
  lerem o mesmo "0 erros" e passarem da espera e do limite do dia). Os outros freios (entrar, desafios,
  código) também contam e anotam numa gravação só, com a conta lida antes para recusar sem gravar. Comparação em
  tempo constante. Com a pimenta trocada, a prova passa para a versão nova na abertura certa (16.2).
  Devolve a sessão do cofre (10 minutos parada, renovada de minuto em minuto pelo uso; 8 horas no
  máximo), V, o manifesto e o contador; a sessão de entrada some.
- `POST /api/cofre/recuperar` (`kRec`): o código no lugar da passkey (a senha continua sendo pedida),
  10 tentativas por dia; a sessão aberta assim vem marcada `recuperada` (a página obriga a pôr uma
  passkey e um código novos, parte 6).
- `POST /api/cofre/trancar`: o token pode vir no corpo (o `sendBeacon` não manda cabeçalho); responde
  sempre igual, com `Clear-Site-Data: "cache", "storage"`.
- **O modo só leitura** passou a deixar entrar, abrir e trancar (as rotas de sessão): nele dá para
  abrir e ver o cofre, só não para mudar o que tem dentro.
- O histórico ganha `passkey-usada`, `codigo-usado`, `aberto`, `aberto-com-codigo` e `erro-senha`.
  O aviso no Murall a cada sequência de erros (9.3) fica para a parte 6, com o RPC `avisar`.

Detalhes da parte 5 (com o cofre aberto):

- `GET /api/cofre/itens`: o contador, o manifesto e todos os itens (id, versão, dados cifrados, quando
  mudou, desde quando está na lixeira). A página confere tudo contra o manifesto (`conferirItens`).
- `PUT /api/cofre/itens/:id` (criar na versão 1, mudar na versão de agora + 1), `DELETE` no mesmo
  endereço (para a lixeira; a versão não muda), `POST .../restaurar` e `DELETE /api/cofre/lixeira/:id`
  (apagar de vez). Cada um manda o manifesto novo e o contador que o aparelho viu.
- **O 409 de verdade**: o item e o manifesto vão num lote atômico, e a parte do item só acontece se o
  manifesto gravado for exatamente o deste pedido. Comparar só o contador não bastava: dois aparelhos
  que partem do mesmo contador chegariam os dois a "contador + 1". Tirar essa condição de propósito
  faz 2 testes falharem.
- **A lixeira e o manifesto cifrado** (decidido ao implementar): o servidor não pode mudar o
  manifesto, então a limpeza dos 30 dias (parte 6) apaga os dados do item e deixa uma lápide (o id e a
  versão, sem conteúdo); o manifesto continua batendo, e a página tira a lápide no próximo salvamento
  com `DELETE /api/cofre/lixeira/:id`. Uma lápide não volta (410).
- Limites: item de 541 bytes a 16 kB, em blocos de 512 (a versão 1); até 2.000 itens contando a
  lixeira; **o corpo dessas rotas vai até 256 kB** (o plano dizia 64 kB, mas com 2.000 itens o
  manifesto sozinho passa disso); a cota do dia vale para tudo.

Detalhes da parte 6 (com o cofre aberto):

- Aparelhos: `GET /api/cofre/aparelhos`, `POST /api/cofre/aparelhos` (a passkey registrada contra o
  desafio de `POST /api/cofre/registro`, até 10 aparelhos) e `DELETE /api/cofre/aparelhos/:id` (a
  passkey e o envelope dela; **nunca o último**, com a condição em cada parte do lote, para dois
  "tirar" ao mesmo tempo não deixarem o cofre sem nenhum).
- `PUT /api/cofre/senha`: novo sal, Argon2id (com o mesmo mínimo), V e prova; o freio da senha zera.
- `PUT /api/cofre/recuperacao`: um código novo; o antigo para de valer na hora.
- **O código de recuperação é de uso único** (8.4): fica gasto quando abre o cofre (não quando só é
  conferido: errar a senha depois dele não o queima), e depois disso `POST /api/cofre/recuperar`
  responde 410 até haver um novo.
- `GET /api/cofre/sessoes` (quando e onde, a atual marcada, nenhum token) e
  `POST /api/cofre/trancar-todos` (todas, inclusive a atual, com `Clear-Site-Data`).
- `GET /api/cofre/eventos`: o histórico dos últimos 90 dias, do mais novo para o mais velho.
- `DELETE /api/cofre` com `{ "confirmacao": "APAGAR" }`: tudo da conta, de todas as tabelas.
- A limpeza diária (`cleanup.ts`, Cron Trigger às 06:23 UTC, antes do backup das 06:31): sessões e desafios vencidos, histórico
  de mais de 90 dias, freios e uso velhos, esperas do freio da senha que já passaram, e a lápide dos
  itens com mais de 30 dias na lixeira.

**Ficam para depois** (anotados aqui para não se perderem):

- Os avisos no correio do Murall (abertura em aparelho novo, sequência de erros de senha, aparelho
  posto ou tirado, senha trocada) e o "Congelar o cofre": precisam do lado do Murall (RPC `avisar` e
  `congelar` na `CofreRpc`, e a tela dos avisos), na Fase 6.
- "Trocar a chave do cofre" (8.5: VK nova e todos os itens recifrados): precisa ir em partes (até
  2.000 itens de 16 kB não cabem num pedido) e de uma rota de troca em lotes com o contador. Entra com a
  tela de Ajustes, na Fase 6.

Com isso, a API do cofre (Fase 2) está completa para as telas das Fases 4 e 5. Nada foi publicado:
o domínio, o D1 `cofre`, os secrets e o deploy com aprovação são a Fase 3.


### 17.5 Fase 3 (em preparo, 21/10)

Pronto no repositório (nada publicado):

- **A página do cofre** no Angular (`ng build cofre` → `dist/cofre/browser`): por enquanto um "em
  construção" que mostra se o endereço é seguro e se a página está isolada (COOP + COEP), sem nada
  inline no `index.html`. Testada no Chrome com o `wrangler dev`: nenhuma violação de CSP, estilos do
  Angular com o nonce, `crossOriginIsolated` ligado.
- **O Worker serve a página e a API** na mesma origem (`[assets]` com `run_worker_first`), com os
  cabeçalhos da 7.3 em toda resposta (`cofre-api/src/site.ts`) e o nonce por pedido no `ngCspNonce`.
  Diferença do plano: `base-uri 'self'` (o Angular usa `<base href="/">`). Em `http://localhost`, sem
  HSTS nem `upgrade-insecure-requests`. O domínio próprio está no `wrangler.toml`.
- **`cofre-api/scripts/cabecalhos.mjs <endereço>`** confere cada cabeçalho, exato, em `/`, `/entrar`,
  um arquivo e `/api/status` (um teste garante que ele e o Worker esperam o mesmo).
- **`scripts/cofre-hashes.mjs`** (e `npm run build:cofre`): o SHA-256 de cada arquivo do build em
  `cofre-hashes.json`; `--conferir` (o build bate?) e `--no-ar <endereço>` (o que está no ar bate?).
  Os arquivos do cofre ficam com LF (`.gitattributes`) para o build dar igual no Windows e no Linux.
- **`cofre.yml`**: publicar só à mão, no environment `cofre` (com aprovação), testando tudo, recusando
  build que não bata com os hashes, e conferindo cabeçalhos e hashes no ar depois.
- **`cofre-vigia.yml`**: de hora em hora, os hashes e os cabeçalhos no ar; desligado até a variável
  `COFRE_NO_AR = sim`.

- **`backup.yml`**, job `cofre`: o D1 `cofre` todo dia, em `backup-cofre-<dia>.sql.gz.enc`, com a
  mesma `BACKUP_SENHA` e o mesmo `api/scripts/backup.sh` (a lista de tabelas vem do workflow, e um
  teste do `cofre-api` a confere contra as migrações). A limpeza do cofre passou para as 06:23 UTC,
  antes do backup das 06:31. Como voltar um backup e usar o Time Travel: `cofre-api/README.md`.
- **`saude.yml`**: também o `/api/status` do cofre e o uso do Worker e do D1 dele. Os limites de pedidos e
  de linhas do plano grátis valem para a conta toda, então o relatório soma o Murall e o cofre antes
  de comparar com eles. O de tamanho é por banco. O id do D1 do cofre vem do `cofre-api/wrangler.toml`.
- O job do backup e a parte da saúde só ligam com a mesma variável do vigia, `COFRE_NO_AR = sim`.
- **`cofre-api/scripts/segredo.mjs`**: os secrets com a cópia em papel. Gera os 32 bytes e mostra em
  hexadecimal (16 grupos de 4 e um grupo de conferência, sem maiúsculas nem letras parecidas). Pede que
  você digite de volta o que escreveu no papel e só grava (`wrangler secret put`, pela entrada, nunca na
  linha de comando) se bater. `--do-papel` grava de novo a partir do papel; `--conferir-papel` só
  confere uma cópia.

#### Os passos do usuário (Fase 3), na ordem

Tudo grátis. Os comandos são no PowerShell, dentro da pasta `cofre-api`.

1. **A Fase 0, se ainda não foi feita** (seção 11):
   - o DNS de `igorsc.com.br` na Cloudflare, com os passos da 7.2: o CNAME `murall` com a nuvem
     cinza e o TXT do Google têm de vir juntos;
   - o DNSSEC, com o DS no registro.br;
   - 2FA no GitHub, na Cloudflare, no Google, na Apple e no registro.br.

   Na Cloudflare, em SSL/TLS › Edge Certificates, ligue o "Certificate Transparency Monitoring", que
   manda e-mail a cada certificado novo do domínio. Em DNS, um registro CAA em `igorsc.com.br`:
   `0 issue "letsencrypt.org"`, a autoridade do GitHub Pages do Murall. Com o SSL Universal ligado, a
   Cloudflare acrescenta sozinha as autoridades dela. Depois, confira que o Murall continua abrindo.
2. **Pedir o push** dos commits do cofre. Ele publica o site e a API do Murall, agora com a classe
   `CofreRpc` que o cofre usa, e põe os workflows do cofre na `main`: o "Publicar o cofre" só aparece
   em Actions depois disso.
3. **Criar o banco do cofre**:
   ```
   npx wrangler login
   npx wrangler d1 create cofre
   ```
   O id que aparecer vai no `database_id` do `cofre-api/wrangler.toml`. O id não é segredo, e o do
   Murall já está no repositório: é só mandar para eu commitar. Se o wrangler perguntar se pode pôr o
   id no arquivo, responda que não.
4. **O token do deploy do cofre**: Cloudflare › My Profile › API Tokens › Create Token, no modelo
   "Edit Cloudflare Workers".
   - Account Resources: a sua conta. Zone Resources: só `igorsc.com.br`.
   - Acrescente a permissão Account › D1 › Edit.
   - Nome: `cofre-deploy`.

   Ele só aparece uma vez: copie direto para o passo 5. Se o primeiro deploy falhar por permissão no
   domínio, acrescente Zone › DNS › Edit. Sobre até onde os tokens alcançam, veja a decisão logo abaixo.
5. **O environment `cofre` no GitHub** (Settings › Environments › New environment, nome `cofre`):
   - Required reviewers: você. Deixe "Prevent self-review" desligado, senão nem você aprova.
   - Deployment branches and tags: Selected branches, só `main`.
   - Environment secrets: `CLOUDFLARE_API_TOKEN` (o do passo 4) e `CLOUDFLARE_ACCOUNT_ID` (o mesmo do
     repositório).
6. **Publicar**: Actions › Publicar o cofre › Run workflow, e aprovar. O workflow:
   - testa tudo e confere os hashes;
   - cria as tabelas e publica;
   - confere os cabeçalhos e os arquivos no ar.

   Abra `https://cofre.murall.igorsc.com.br`: tem de aparecer a página "em construção", dizendo que o
   endereço é seguro e a página está isolada. Para a nota do plano, teste o endereço no
   securityheaders.com e no Mozilla Observatory (o plano espera A+).
7. **Os dois secrets, com a cópia em papel**, depois do passo 6, para o Worker já existir:
   ```
   node scripts/segredo.mjs COFRE_PIMENTA_1
   node scripts/segredo.mjs COFRE_ENVELOPES_1
   ```
   Cada um mostra o que escrever no papel, com o nome. Escreva, depois digite de volta olhando o papel
   (não a tela); só então ele grava na Cloudflare. Guarde os dois papéis num lugar só seu, por exemplo
   junto do código de recuperação. Sem eles, ninguém abre o cofre se a Cloudflare perder os secrets.
   Para conferir um papel depois: `node scripts/segredo.mjs --conferir-papel`.
8. **Ligar o vigia, o backup e a saúde do cofre**: Settings › Secrets and variables › Actions ›
   Variables › New repository variable: `COFRE_NO_AR` = `sim`. Rode uma vez à mão o "Vigia do cofre",
   o "Backup da nuvem" (o job `cofre`) e a "Saúde da nuvem": os três têm de passar.
9. **Fica para a Fase 4**: o seu código em `COFRE_CODIGOS`, o cliente OAuth "Murall Cofre" e o
   `GOOGLE_CLIENT_SECRET`. Até lá, ninguém entra no cofre: a lista de quem pode usar está vazia.

#### Decidido (21/10): até onde o token do Murall alcança

Até onde sei, um token da Cloudflare não fica preso a um Worker nem a um banco: as permissões de
Workers e de D1 valem para a conta inteira (a seção 9.3 pedia "só este Worker e este D1", e isso
não existe). Então o token que já está no repositório (`CLOUDFLARE_API_TOKEN`, o do deploy do Murall,
usado em todo push que mexe em `api/`) também consegue publicar o cofre e mexer no banco dele. A
aprovação do environment protege o caminho normal, não esse; o vigia avisa, mas em até uma hora.
O backup do cofre usa esse mesmo token, por isso não precisa de outro.

- **a) Uma conta da Cloudflare só para o cofre** (grátis). O token do Murall não alcança o cofre. Mas o
  RPC entre as APIs só funciona na mesma conta, então seria trocado por uma chamada HTTP assinada
  (código novo, nas duas APIs); o domínio `igorsc.com.br` iria para a conta do cofre; e o backup do
  cofre precisaria de um token da conta do cofre no repositório.
- **b) A mesma conta, com o token do Murall em menos lugares**: no `api.yml`, no `backup.yml` e no
  `cofre.yml`, só os passos do `wrangler` recebem o token. Hoje o `npm ci` também recebe, e um pacote
  malicioso o leria na instalação. É uma mudança pequena, sem mexer no desenho. Sobra o risco de um
  `wrangler` adulterado, que alcança o cofre nos dois casos (ele roda também no deploy do cofre).
- **c) Deixar como está** e contar com o vigia.

O usuário escolheu a **b**: quase tudo o que a "a" protege também passa pelo `wrangler` e pelo
GitHub, que as duas opções têm em comum. Feito: nos três workflows, o token e a `BACKUP_SENHA` saíram
do nível do job e só vão para o `env` dos passos que os usam (o token, só para os do `wrangler`). O
`cofre-api/test/workflows.test.ts` confere isso em todos os workflows.

### 17.6 Fase 4 (começada em 21/10, enquanto o DNS troca)

A Fase 4 (criar o cofre) em partes, uma de cada vez:

| Parte | O quê | Estado |
|---|---|---|
| 1 | **A lógica de criar, sem tela**: a conversa com a API, a passkey com PRF e a montagem do pedido, com um teste da página e da API juntas | Feita |
| 2 | **Entrar com o Google** na página: o PKCE, a volta em `/entrar`, limpar a URL na hora. Precisa do cliente OAuth "Murall Cofre" do usuário (16.14) para testar no ar | Feita na página; falta o teste no ar com o cliente do usuário |
| 3 | **As telas de criar**: os aparelhos (com PRF ou no modo servidor, o aviso de um aparelho só), a senha mestra (a frase sorteada e a força de uma escrita à mão), o kit de emergência para imprimir. Com o Impeccable | Feita |
| 4 | **De ponta a ponta no Chrome** com o autenticador virtual e o `wrangler dev` | Feita (22/10) |

Parte 1, o que entrou:

- `core/api.ts`: os pedidos à API na mesma origem, sem cookie, sem cache, sem seguir redirecionamento
  e sem referência; o token só na memória; um erro da API vira `ErroApi` com o código e a mensagem em
  português dela, e uma resposta que não é da API (a Cloudflare fora, sem rede) vira uma mensagem
  simples.
- `core/passkey.ts`: as opções da API passam pelas regras da página (o rpId tem de ser o do cofre,
  biometria obrigatória, atestado "none", só ES256 e RS256) e pedem o PRF com a entrada do cofre. Os
  aparelhos respondem de três jeitos, e cada um tem teste:
  - o segredo já vem no registro;
  - o aparelho diz que tem PRF, mas só dá o segredo numa assinatura: a página pede uma logo em seguida
    (um segundo toque), com um desafio sorteado na própria página, porque essa assinatura não vai para
    o servidor;
  - sem PRF: quem decide o modo servidor é a tela, nunca a função em silêncio.

  Se a pessoa cancelar o segundo toque, a passkey volta marcada "tem PRF, falta o segredo", e a tela
  pode pedir de novo. Os erros do navegador viram mensagens em português.
- `core/criar.ts`: monta o corpo do `POST /api/cofre`:
  - o sal, o Argon2id, M, V, kAuth e o manifesto vazio;
  - o código de recuperação, com E_rec e kRec;
  - o envelope de cada aparelho, com o S_i dos sem PRF.

  Os segredos são zerados. O segredo do PRF de cada passkey só é zerado quando tudo deu certo: se algo
  falhar no meio, montar de novo não rebaixa o aparelho para o modo servidor. O texto do código volta
  para a tela, para o kit.
- Na API: `POST /api/entrar` devolve também o `usuario` (o id da conta, que entra no AAD de tudo o que
  a página sela) e o `codigo`.
- **A página e a API juntas** (`cofre-api/test/pagina.suite.ts`, só no Node, porque o runtime dos
  Workers não compila o WASM do Argon2id): o que a página monta vai para a API de verdade com as
  passkeys reais dos vetores, e abre pelo caminho da 8.1. Abre pelo celular com o segredo do PRF, pelo
  PC no modo servidor e pelo código do kit; com a senha errada, a API recusa a prova. Selar o envelope
  com um id e mandar outro faz 3 desses testes falharem.

Parte 3, primeiro pedaço (a senha mestra, sem tela): `core/forca.ts`. **Para o usuário conferir**: o plano
pedia "mínimo de ~70 bits estimados", e a estimativa é minha, sem dependência nova, feita para errar
para menos:

- Só a frase que a página sorteou, exatamente igual, vale como sorteada (77 bits). A mesma frase
  digitada sem ter sido a sorteada desta vez conta como palavras escolhidas.
- Uma palavra da lista do cofre: ~11 bits, o de uma palavra escolhida por alguém (sorteada valeria
  12,9).
- Letras fora da lista:
  - 3 ou mais letras seguidas (palavra de outra língua, nome): 2 bits por letra;
  - uma palavra de 1 ou 2 letras sozinha (eu, de): 5 bits;
  - letras soltas: 4,7 bits cada.
- Algarismos: 3,3 bits; símbolos: 5; cada maiúscula: +1, até o número de minúsculas (tudo em
  maiúsculas: 1); separador (espaço, hífen, ponto): 1; acentos não contam.
- Repetição, sequência e fileira do teclado: 1 bit por caractere (também dentro das letras fora da
  lista); o mesmo caractere muitas vezes seguidas: dois e mais o log do tamanho; um ano (19xx/20xx):
  7 bits.
- Letra trocada por número numa palavra da lista (p3dr4): +1 bit por troca.
- Uma palavra, um trecho de letras ou um número que já apareceu antes: 2 bits.
- Repetir a senha inteira (ou um pedaço do começo ao fim, como aba-aba-aba) quase não soma.
- As senhas mais comuns: no máximo 10 bits.

Mínimo de 70 bits; com algum aparelho no modo servidor, 78, o de uma frase sorteada. Na prática:
- não passam: as senhas comuns, as trocas por número, as frases do dia a dia ("eu amo meu cachorro
  rex desde 2015", 62) e uma senha aleatória de 14 caracteres (66);
- passam: 7 palavras escolhidas da lista (73) e uma senha aleatória de 16 caracteres variados (74).

Parte 3, as telas (`projects/cofre/src/app/criar/`), no jeito do Murall:
- os passos como orelhas de pasta manilha, iguais às do mural de anotações (a de agora emendada na
  faixa da ficha; a aba trapézio da primeira versão foi recusada pelo usuário);
- a ficha creme com a faixa amarela e a tachinha;
- os botões de tinta, as faixas de campo e as etiquetas de adesivo com listras;
- a régua escolar da força, com a caneta vermelha no mínimo.

**A ordem mudou** em relação à 8.3, e é para o usuário conferir: senha → aparelhos → kit.
- O desafio de cada passkey vale só 2 minutos, então o cofre é criado logo depois do último aparelho.
- O kit vem depois de criado, para o código que aparece já valer.
- Se um aparelho ficar no modo servidor e a senha escrita à mão não chegar a 78 bits, o passo dos
  aparelhos não deixa criar e oferece "Trocar a senha". O passo da senha já avisa disso antes.

O que cada passo faz:
- **Senha**: a frase sorteada, copiada no papel e digitada de volta com os hífens (só a sorteada,
  igual, vale como sorteada), ou uma senha da pessoa, com a régua e a confirmação. Os campos são de
  senha, com mostrar/esconder, sem completar, corrigir nem traduzir.
- **Aparelhos**: registrar até dois, cada um com o nome (Celular ou PC, que dá para mudar) e a
  etiqueta "Com PRF" ou "Modo servidor". Um aparelho que diz ter PRF mas não deu o segredo fica
  "Falta confirmar", com "Confirmar de novo" ou "Usar no modo servidor": a escolha é da pessoa,
  nunca em silêncio.
- **Kit**: o código em 7 grupos, a conta e a data, o que fazer com ele, "Imprimir o kit" (a única
  coisa do cofre que vai para a impressora; o resto continua sumindo na impressão) e "Guardei o
  código" antes de "Terminar", que recarrega a página e joga fora a memória.
- **Se a API recusar ao criar**: os aparelhos recomeçam do zero. Os desafios podem ter sido gastos, e
  o segredo do PRF já foi zerado na montagem, então tentar de novo com eles cairia no modo servidor
  sem ninguém ver.

No ar, a página continua "em construção": as telas só aparecem com uma sessão de entrada, que vem do
login (parte 2). Para ver sem servidor, `ng serve cofre` e abrir `/?demo` (ou `/?demo=sem-prf`): a
API e as passkeys são de mentira, e o arquivo da demonstração só entra no build de desenvolvimento
(fileReplacements), nunca no de produção.

Parte 2, o login na página, e o que a revisão de 21/10 achou:

- **A porta** (`app/porta/`): a ficha antes de criar ou abrir.
  - Mostra as proteções da página: endereço seguro, isolada das outras e sem service worker.
  - Só deixa entrar com as três valendo; sem elas, nem troca o código do Google.
  - Sem o `GOOGLE_CLIENT_ID` no `wrangler.toml` (ou com o `MODO` desligado), mostra "Em construção".
    É o que vai ao ar no passo 6 da 17.5, até o cliente OAuth do cofre existir.
  - Com cofre já criado, diz que abrir chega numa próxima parte (Fase 5).
- **O login** (`core/entrar.ts`):
  - o PKCE S256 (conferido com o vetor da RFC 7636), o `state`, só `openid` e a escolha da conta;
  - a volta em `/entrar` é tirada da URL antes de qualquer outra coisa;
  - o pendente sai do `sessionStorage` na volta, deu certo ou não, e vale 10 minutos;
  - state trocado, login que não começou nesta aba, cancelamento e volta sem código têm cada um a sua
    mensagem.

  O `sessionStorage` só aparece nesse arquivo, e uma regra nova dos testes confere isso (a única
  exceção da 7.4). Conferido com o Worker local (`wrangler dev`): CSP, Trusted Types e isolamento
  valendo, nenhuma violação, e uma volta forjada não troca o código.
- **Para o usuário conferir: a entrada de criar vale 20 minutos.** A de 5 minutos não dava para copiar
  a frase no papel e registrar os aparelhos, e a frase sorteada se perderia ao entrar de novo.
  - Para quem já tem cofre, a entrada continua de 5 minutos.
  - Só sem cofre ela vale 20, e o `POST /api/cofre` apaga a sessão de entrada usada: abrir pede uma
    entrada nova.
  - Se a entrada acabar no meio, a ficha pede "Entrar de novo".
- **Nenhum service worker** (7.4, que faltava): ao abrir, a página tira qualquer um. Se a página estava
  nas mãos de um, pede para recarregar antes de entrar.
- O aviso "Fazendo a chave do cofre…" agora aparece antes de o Argon2id ocupar o navegador.
- O `GET /api/status` devolve o `googleClientId`, que é público e vai na URL do Google.

### 17.7 Fase 5 (começada em 21/10)

A Fase 5 (abrir e usar) em partes:

| Parte | O quê | Estado |
|---|---|---|
| 1 | **A lógica de abrir e dos itens, sem tela** (`core/abrir.ts`, `core/itens.ts`), com o teste da página e da API juntas | Feita |
| 2 | **A tela de abrir**: a senha e a passkey ao mesmo tempo, o código de recuperação no lugar da passkey, a senha errada (cada tentativa gasta a passkey), a última mudança | Feita |
| 3 | **A lista e o item**: busca, os cinco campos, revelar (15 s), copiar (limpa em 30 s), mostrar para digitar, abrir o site, a lixeira | Feita |
| 4 | **O gerador e os gatilhos de trancar** (5 min parado, aba escondida, `pagehide`, 8 h), com o `sendBeacon` | Feita |

Parte 1, o que entrou:

- **`core/abrir.ts`**:
  - a passkey assina o desafio da API, com o rpId do cofre conferido e o PRF pedido;
  - `senhaDoDesafio` faz kSenha com as regras de 6.4 (versão, Argon2id mínimo e máximo), e a tela roda
    as duas coisas ao mesmo tempo;
  - `chaveDoMeio` abre o envelope do aparelho: com PRF, só com o segredo que a passkey deu (um envelope
    de PRF sem o segredo é erro, nunca o modo servidor); no modo servidor, com o S_i devolvido;
  - `chaveDoMeioPeloCodigo` abre o envelope do código;
  - `abrir` manda kAuth e abre V e o manifesto. Os segredos são zerados.
- **`core/itens.ts`**:
  - o item com Título, User, Senha, URL e Descrição (todos opcionais), as datas e as últimas 5 senhas;
  - `lerItens` confere cada item contra o manifesto e decifra;
  - salvar, lixeira, voltar e apagar de vez mandam o manifesto novo com o contador visto, e o 409 de
    outro aparelho vira `ErroConflito`, sem nada mudar;
  - `limparLapides` tira do manifesto os itens que a limpeza esvaziou depois de 30 dias.
- **Com a API de verdade** (`cofre-api/test/pagina.suite.ts`), o cofre criado pela página:
  - abre pelo celular com o PRF, pelo PC no modo servidor e pelo código do kit;
  - guarda, muda (com o histórico), vai para a lixeira, volta e é apagado de vez;
  - dois aparelhos: o segundo leva o conflito, relê e grava, e nada se perde;
  - a lápide sai do manifesto;
  - um servidor que troca os dados de um item ou some com um é pego, e nada aparece. Tirar a conferência
    do manifesto faz esse teste falhar.

Partes 2 a 4, as telas (22/10, de madrugada, com o usuário dormindo e a autorização dele para seguir):

- **Abrir** (`app/abrir/`):
  - o desafio é pedido na hora de abrir (ele vale 2 minutos);
  - a passkey e o Argon2id rodam ao mesmo tempo;
  - o código do kit pode ir no lugar da passkey, e só deixa abrir com os 28 caracteres;
  - a senha errada diz que cada tentativa pede a passkey de novo;
  - a entrada vencida pede para entrar de novo.

  A raiz troca a porta "o cofre já existe" por esta tela.
- **O cofre aberto** (`app/aberto/`):
  - o aviso da última mudança, por 12 segundos, com o dia, a hora e o aparelho do manifesto;
  - a lista em ordem, com a busca sem acento nem maiúscula por título, user e URL;
  - "Nova senha", o item e a lixeira com os dias que faltam. "Apagar de vez" pede confirmação.
  - Um conflito com outro aparelho relê tudo e avisa; o que vier do servidor e não conferir esconde
    tudo; a sessão vencida no servidor tranca. Quem abriu pelo código vê o aviso para gerar um novo.
  - A janela sem foco embaça a ficha (seção 10).
- **O item**:
  - os cinco campos;
  - revelar a senha por 15 segundos;
  - copiar, e a área de transferência é limpa em 30 segundos (sobrescrevendo, porque ler a área de
    transferência é proibido pelo `Permissions-Policy`; se a pessoa copiou outra coisa nesse meio-tempo,
    isso também some);
  - mostrar para digitar, com as letras grandes em grupos de 4, que some em 1 minuto;
  - abrir o site, só http ou https e numa aba nova, sem dizer de onde veio;
  - as senhas anteriores (até 5) e as datas no fuso do aparelho.
- **O gerador** (`core/gerador.ts`): caracteres sem os parecidos (l, I, O, 0, 1), com pelo menos um de
  cada tipo escolhido e de 8 a 64; ou uma frase de 4 a 10 palavras da lista. É sem viés (rejeição) e
  mostra os bits.
- **Trancar** (`app/aberto/trancador.ts`): 5 minutos sem mexer, a aba escondida por 1 minuto, a página
  fechando (`pagehide`), as 8 horas e o botão Trancar. Trancar avisa o servidor com o `sendBeacon` (o
  token no corpo) e recarrega a página.
- **A demonstração do desenvolvimento** ganhou `/?demo=abrir` e `/?demo=aberto`. A segunda é um cofre de
  mentira na memória, com três senhas de exemplo, servido por uma API que confere o contador como a de
  verdade.
- Testes no Karma: a tela de abrir (abrindo de verdade, com a cripto real e o PRF), o cofre aberto
  (lista, busca, copiar e limpar, abrir o site, nova senha, lixeira com confirmação, conflito, sessão
  vencida, Trancar), os gatilhos de trancar, o gerador (inclusive a distribuição) e o endereço seguro.

#### O certificado do cofre não saiu (22/10)

A primeira publicação deu certo: os testes, os hashes conferidos no Linux, as migrações e o Worker. Mas
o HTTPS de `cofre.murall.igorsc.com.br` recusa a conexão ("handshake failure") mesmo depois de 2 horas.

A causa é o **CAA**. O domínio próprio de um Worker ganha um certificado próprio, mesmo em subdomínio de
dois níveis, mas quem emite procura o CAA subindo pelos nomes:
- `cofre.murall.igorsc.com.br` não tem CAA próprio;
- o nome de cima, `murall.igorsc.com.br`, é um CNAME para `igorsolerc.github.io`, e o CAA do GitHub vale
  ali: só DigiCert, Let's Encrypt e Sectigo;
- a autoridade que a Cloudflare usa para esse certificado (a Google Trust Services, `pki.goog`) fica
  barrada.

O CAA da raiz (`igorsc.com.br`) não chega a ser lido.

**Correção (passo do usuário, um minuto)**: na Cloudflare, em DNS › Records, três registros CAA com
**Name** `cofre.murall`, Flags `0`, Tag "Only allow specific hostnames" e CA domain name `pki.goog`,
`letsencrypt.org` e `ssl.com` (um registro para cada). Com um CAA no nome exato, a busca para ali. A
Cloudflare tenta emitir de novo sozinha; depois, rodar o "Publicar o cofre" para conferir. O login do
wrangler desta máquina só lê a zona, por isso o Claude não fez a mudança.

**Resolvido em 22/10.** O usuário criou os três CAA, mas a Cloudflare não emitiu de novo sozinha em 15
minutos: a tentativa recusada antes dos CAA fica esperando a próxima rodada. O que destravou foi tirar o
domínio do Worker no painel (Workers & Pages › cofre-api › Domains › ⋯ › Remove) e rodar o "Publicar o
cofre", que cria o domínio de novo e pede um certificado novo. O certificado saiu dentro da espera do
workflow, e os cabeçalhos e os hashes no ar conferiram com os do repositório. `COFRE_NO_AR=sim` ligou a
vigia, que rodou e passou. No ar, a porta mostra as três proteções verdes e fica em "Em construção" até
existir o `GOOGLE_CLIENT_ID` (16.14).

#### De ponta a ponta no Chrome (Fase 4, parte 4; 22/10)

O cofre inteiro rodou no Chrome de verdade, com:
- a passkey no autenticador virtual, com PRF;
- a página e a API servidas pelo Worker de teste (`cofre-api/test/e2e/worker-e2e.ts`, com os cabeçalhos,
  a CSP, os Trusted Types e o isolamento de verdade, e só o Google e o Murall de mentira; nunca vai ao ar:
  sem rota e só em localhost);
- o banco D1 local.

Passou tudo, sem nenhum erro no console: a porta (seguro e isolado), entrar (a URL limpa), criar com a
frase sorteada (a passkey ficou "Com PRF"), abrir com a senha e a passkey, guardar uma senha, trancar e
abrir pelo código do kit (com a senha guardada lá e o aviso do código). O teste achou um defeito: o campo
URL era `type="url"` e o navegador barrava "banco.exemplo" sem esquema; virou texto com
`inputmode="url"`. O roteiro é `cofre-api/test/e2e/chrome.mjs` (o puppeteer-core fica fora do projeto).

### 17.8 Fase 6 (começada em 22/10)

Parte 1, a lógica de gerenciar, sem tela (`core/gerenciar.ts`):
- pôr um aparelho: a passkey e o envelope selado com M;
- trocar a senha: confere a atual abrindo V, sela a mesma chave do cofre com a nova, com sal novo e o
  Argon2id padrão, e manda a prova nova;
- um código de recuperação novo, devolvido para o kit.

A API da página ganhou os pedidos de aparelhos, sessões, trancar todos, histórico e apagar. A montagem do
envelope de um aparelho ficou numa função só (`corpoDoAparelho`), usada ao criar e ao pôr.

**Para o usuário conferir: M fica na memória enquanto o cofre está aberto.**
- Gerenciar precisa de M (o envelope de um aparelho ou de um código novo) e de V, do sal e do Argon2id
  (trocar a senha).
- Pela API, a passkey só é conferida na sessão de entrada, então não dá para pedi-la de novo com o cofre
  aberto.
- Esses segredos ficam na memória só com o cofre aberto e somem ao trancar (a página recarrega).
- Trocar a senha pede a senha atual.
- Quem já roda código na página aberta consegue usar a chave do cofre de qualquer jeito, e M sozinho não
  abre nada sem a senha.

Com a API de verdade (`pagina.suite.ts`):
- o código novo abre, e o antigo para de valer na hora;
- trocar a senha: a nova abre e a velha não; a senha atual errada não troca nada;
- tirar e pôr aparelhos, sem nunca tirar o último, e o aparelho posto de novo abre o cofre;
- as sessões sem token, o histórico, trancar todos (a sessão para de valer) e apagar o cofre (só com
  APAGAR).

Parte 2, a tela (`app/gerenciar/`, aberta por "Gerenciar o cofre" no pé da lista):
- **Aparelhos**: cada um com a etiqueta (com PRF ou modo servidor) e quando foi usado.
  - Tirar pede confirmação, e o último não tem o botão.
  - "Pôr um aparelho" registra a passkey com o nome escolhido.
  - **Para o usuário conferir**: um aparelho sem PRF só entra no modo servidor se a senha de hoje servir
    para isso. Como não dá para saber se ela foi a frase sorteada, ela serve com 78 bits estimados ou no
    formato da sorteada (6 ou mais palavras da lista com hífens, pelo menos 5 diferentes); a pessoa
    digita a senha, que é conferida abrindo V (uma senha forte que não é a do cofre não serve).
- **Senha mestra**: a atual (conferida abrindo V), a nova (escrita ou "Sortear frase", com a régua, e o
  mínimo do modo servidor se houver um aparelho assim) e a confirmação.
- **Código de recuperação**: "Gerar um código novo" pede confirmação (o de hoje para de valer) e mostra o
  kit, que pode ser impresso.
- **Aparelhos abertos agora**: quando e onde, o atual marcado, e "Trancar todos" com confirmação.
- **Histórico de 90 dias**: em palavras, com as senhas erradas em vermelho.
- **Apagar o cofre**: só escrevendo APAGAR.

Trancar zera M e V antes de recarregar. O teste de ponta a ponta no Chrome passou também com o código
novo, a troca de senha e a reabertura com a senha nova. A demonstração (`/?demo=aberto`) mostra a tela com
dados de mentira.

### 17.9 Endurecer, primeiro pedaço (Fase 7; 22/10)

- **As telas em pedaços** (`@defer`): criar, abrir e o cofre aberto chegam só quando aparecem, e o bundle
  inicial caiu de 382 kB para 197 kB (o orçamento avisa em 400). Funciona com a CSP e os Trusted Types:
  o teste de ponta a ponta passou.
- **A vigia do DOM** (`app/vigia-do-dom.ts`): avisa quando aparece algo que o cofre não pôs.
  - Conta qualquer coisa fora do `<cofre-root>`, menos os `<style>` do Angular com o nonce da página.
  - Dentro dele, conta script, iframe, object e embed.
  - Ela não impede nada: mostra o aviso para trancar e usar um perfil sem extensões.
  - O navegador esconde o atributo `nonce` depois de aplicá-lo, então ela lê a propriedade `.nonce`.
  - No Chrome de verdade, ela ficou quieta o caminho inteiro e avisou de um elemento injetado.
- **Navegador controlado por um programa** (`navigator.webdriver`): o cofre não deixa entrar. Só o
  localhost escapa, para o teste de ponta a ponta.
- **O aviso no console** contra o golpe do "cole isto aqui".
- **Mostrar para digitar**: a folha recebe o foco e o Esc fecha de qualquer lugar.

- **O aviso de senha vazada** (`core/vazadas.ts`), com uma mudança para o usuário conferir: em vez de
  "ligado nos Ajustes, a cada abertura", é um botão, "Conferir senhas vazadas", no pé da lista. O cofre
  não tem onde guardar o "ligado" sem guardar no aparelho, e mudar o manifesto para isso seria mexer na
  cripto.
  - Nada sai até a pessoa tocar.
  - O SHA-1 é feito no aparelho; só os 5 primeiros caracteres vão para `api.pwnedpasswords.com/range/`, com
    `Add-Padding`, e o resto é conferido aqui. Senhas com o mesmo começo fazem um pedido só.
  - As encontradas ganham o selo "Vazada" na lista e o aviso no item.
  - Sem rede ou com a base fora, diz que não deu para conferir.
  - Conferido de dentro do cofre isolado no Chrome de verdade, com a base de verdade. A página de
    privacidade conta isso.

- **A limpeza da área de transferência** (`app/area-de-transferencia.ts`): um serviço único da página.
  O navegador só deixa escrever com a página em foco; se a limpeza dos 30 segundos falhar, ela fica
  pendente e acontece assim que a página volta ao foco, mesmo com o item fechado.
  - Conferido no Chrome de verdade (22/10): com a página em foco, o timer limpa; com a pessoa colando em
    outro app, o Chrome recusa a escrita (ou ela nem termina) e a senha continua no Ctrl+V até o cofre
    voltar à frente. Nenhuma página consegue mais que isso. O bilhete do Copiar diz assim, e no Windows
    avisa que o Win+V guarda a sua própria cópia, que só programas instalados conseguem evitar.
  - Trancar recarrega a página e perdia a limpeza pendente: a hora dela fica no `sessionStorage` (7.4), e
    a raiz do cofre já cria o serviço na porta, para terminar o serviço quando a página voltar ao foco.

Falta da Fase 7: a revisão de segurança final e a gaveta (opcional).

### 17.10 Congelar o cofre (22/10)

Feito do lado do cofre, com uma mudança para o usuário conferir: o plano punha o "Congelar" nos Ajustes
do Murall, por uma RPC `congelar` na `CofreRpc` (16.13). O Murall ainda não tem a ligação com o cofre
(ela espera o cofre no ar), e o freio serve para quando a pessoa está sem os aparelhos. Por isso ele fica na
tela de abrir, logo depois do login do Google: "Suspeita de algo? Congelar o cofre". A RPC do Murall pode
vir depois, chamando a mesma coisa.

- `POST /api/cofre/congelar`, com a sessão de entrada (só o Google) ou a do cofre aberto.
  - Ninguém abre por 24 h, nem com a senha, a passkey ou o código (o 423 que já existia).
  - Todas as sessões da conta saem: os aparelhos com o cofre aberto são trancados, este também.
  - O histórico ganha "Cofre congelado por 24 horas".
  - Grava mesmo no modo só leitura, como trancar.
- **Não há descongelar.** Quem tem só o Google (o caso de 16.13) não pode tirar o freio. Congelar de novo
  estende para 24 h a partir de agora e nunca encurta. O estrago de quem roubar o Google continua sendo o
  cofre fechado, sem nada lido.
- **A tela**: a confirmação diz que nem a própria pessoa abre e que não dá para desfazer. Congelado, a ficha
  ganha a faixa azul e o carimbo "Congelado", diz até quando (dia e hora) e o que fazer se não foi a
  pessoa: trocar a senha do Google. A próxima entrada já chega assim, pelo `congeladoAte` do
  `GET /api/cofre`.
- **`Clear-Site-Data`**: o navegador o ignora na resposta de um `fetch` sem credenciais, que é como a página
  fala com a API. Por isso ele só vale no `trancar` (o `sendBeacon` vai com credenciais). Em
  `trancar-todos` e no apagar ele continua, sem efeito (o teste de ponta a ponta mostrou o aviso do
  Chrome); no congelar, nem entrou. Quem cobre o service worker plantado (28) é a página: ela tira
  qualquer um ao carregar, e o Sair recarrega.
- Testes da API (prazo, sessões, histórico, estender sem encurtar, sem cofre, depois do prazo), da tela e
  do cliente. No teste de ponta a ponta no Chrome, congelar e a entrada seguinte já congelada.

### 17.11 A aba do cofre no Murall (22/10)

- **Só para quem pode usar o cofre**, não para todo mundo logado (o 8.6 dizia "só aparece para quem está
  logado"; mudado para o usuário conferir). Com `COFRE_CODIGOS` só com o dono, uma aba para todos levaria
  os outros a uma porta que diz "não está aberto para a sua conta".
- **Como o Murall sabe**: o caminho de volta da 16.13, só o pedaço que a aba precisa.
  - O cofre tem uma segunda porta por service binding, a classe `MuralRpc` (`cofre-api/src/entry/worker.ts`),
    sem endereço público. Ela responde só `podeUsar(codigo)`: se o código está em `COFRE_CODIGOS`. Não diz
    se a conta já tem cofre nem nada de dentro dele.
  - A API do Murall liga nela pelo binding `COFRE` (`api/wrangler.toml`), e o `GET /v1/eu` responde também
    `cofre: true/false`. Se o cofre não responder, `false`: o `/v1/eu` nunca quebra por isso.
  - O site guarda o `cofre` junto com a conta e mostra a aba "Cofre" depois do Calendário.
- **A aba** é um `<a href>` comum para `https://cofre.murall.igorsc.com.br/`, na mesma aba do navegador, com
  `rel="noreferrer"`, como a 8.6 pede. Abaixo de ~342 px a fileira não cabe com a contagem do Calendário:
  a aba vira só o cadeado (com o nome "Cofre de senhas" para o leitor de tela) e as seções chegam mais
  perto. O teste das larguras (288 a 1384 px) cobre as Anotações com as quatro seções.
- Ordem do deploy: o cofre primeiro (para a `MuralRpc` existir), depois a API do Murall.
- Falta da 8.6: os avisos no correio e o `congelar` pelo Murall.

### 17.12 O topo do cofre (22/10)

Decidido com o usuário: **um topo próprio e enxuto, não uma cópia do topo do Murall** (o 8.6 e a parte
"O topo igual ao do Murall" da seção 10 ficam valendo só no espírito). O varal e os bottons do Murall
dependem da conta (a foto no Perfil, os avisos em Amigos, o botão de adicionar), que o cofre não tem e não
deve ter. Uma cópia nunca seria igual e ficaria para trás a cada mudança do Murall.

- **O topo** (`projects/cofre/src/app/topo`): o cartaz "Murall", com as tachinhas e o "ALL" de revista,
  que leva de volta ao Murall, e a fileira a giz **Mural · Kanban · Calendário · Cofre**, com o Cofre
  marcado. Aparece em todas as telas do cofre. Os links saem para o Murall na mesma aba, e sair tranca o
  cofre.
- **A lista vem de um lugar só**: `shared/topo-do-murall.ts`, só dados (as seções, os endereços e o
  nome da aba do cofre). O Murall monta a barra das Anotações com ela (`core/areas.ts`, `ui/area-bar.ts`)
  e o cofre, a fileira do topo: mudar ali muda nos dois. É a única coisa de fora que o cofre usa. A regra
  do cofre (`regras.test.mjs`) abre exceção só para esse arquivo e confere que ele não importa nada.
- Os desenhos (o cartaz e o giz com marca-texto) são refeitos no cofre com os tokens dele. A letra do "ALL"
  (Abril Fatface) entrou no cofre, servida da origem dele.
- Ainda vale: o cofre só muda quando é publicado à mão. Mudar a lista e não publicar deixa o topo do cofre
  com a lista velha até a próxima publicação (a vigia continua conferindo o publicado contra o repositório).

### 17.13 Aberto para todos (22/10)

A pedido do usuário, `COFRE_CODIGOS = "*"`: todo mundo com conta no Murall vê a aba Cofre e pode criar o
seu cofre. Entrou nas Novidades como a funcionalidade 1.30.0, com a faixa do topo. A página de teste do
PRF (`public/prf-teste.html`) ficou por enquanto, para conferir um aparelho antes de pô-lo no cofre.

### 17.14 O topo do cofre igual ao do Murall (22/10)

O usuário pediu, com um desenho, o topo do Murall inteiro no cofre: o cartaz, o varal com as Anotações
marcadas, os três bottons (o Perfil com uma pessoa genérica no lugar da foto), a fileira Mural · Kanban ·
Calendário · Cofre e, à direita dela, o logo do Cofre. Substitui o topo enxuto da 17.12. Para os dois
não se desencontrarem, o topo virou um só:

- **O desenho é o mesmo arquivo**: o SCSS do topo do Murall mudou para `shared/topo/_topo-do-murall.scss`,
  sem mudar uma regra (o Murall só faz `@use` dele, e o teste do topo do Murall passou igual). O botão de
  adicionar fica atrás de `$com-adicionar` (ligado no Murall, desligado no cofre), no mesmo lugar.
- **Os dados são os mesmos**: `shared/topo-do-murall.ts` tem as partes do varal, os bottons (nome, dica e
  caminho), os desenhos deles (copiados dos ícones Lucide, os mesmos que o topo do Murall passou a usar
  daqui) e as seções das Anotações.
- **Os tokens** que o desenho usa ficam em `shared/topo/_tokens-do-murall.scss`; o cofre os põe só no topo
  dele, e o teste do cofre confere que cada um é igual ao de `src/styles.scss`.
- **As fotos** das tachinhas e da fibra da cartolina são as do Murall, levadas para o build do cofre direto
  de `public/textures` (cerca de 1 MB, que fica no cache). A folga da página é a do Murall
  (`clamp(16px, 4vw, 48px)`, 28 px em cima, até 1480 px).
- **O que fica de fora**, porque depende da conta do Murall: a foto do Perfil (uma pessoa no lugar),
  o número de novidades em Amigos, o botão de adicionar e a parede escolhida no perfil (o cofre fica com
  a parede padrão).
- **O logo do Cofre**: a porta de um cofre de aço grafite, com filete branco, quatro rebites e o disco do
  segredo, e o nome em letra de estêncil, na faixa dos logos das seções.
- A regra do cofre aceita só a pasta `shared/`: o TypeScript de lá não importa nada, e o SCSS só usa
  arquivos da própria pasta, `data:` e as fotos do próprio site em `textures/`.

### 17.15 O cofre refeito para o dia a dia (22/10)

Pedido do usuário: copiar o user e a senha sem abrir cada item, arrumar o item aberto, os ajustes e os
dados, os ajustes do cofre como as Configurações do mural, e os botões e campos como os dos ajustes do
Murall. Feito sem mexer na cripto, na API nem no que fica na memória (nada novo no aparelho):

- **Lista e item lado a lado** (de 820 px de largura da ficha para cima; abaixo, um de cada vez). Cada
  linha copia o User e a Senha direto, pela mesma área de transferência de antes (limpa em 30 s). A senha
  só aparece na tela quando revelada no item, como antes; copiar da lista não a mostra.
- **Ajustes do cofre** no lugar de Gerenciar o cofre: índice de etiquetas (Aparelhos, Senha mestra,
  Recuperação, Abertos agora, Senhas vazadas, Histórico, Cuidado). "Conferir senhas vazadas" saiu do pé
  da lista e foi para a parte Senhas vazadas, que lista as que apareceram com um botão para abrir cada uma.
- **A senha revelada** em letra de máquina do sistema (sem arquivo de fonte novo), números em azul e
  símbolos em vermelho; o mesmo no gerador e no "Mostrar para digitar".
- **A última mudança** fica na faixa enquanto o cofre está aberto (antes sumia em 12 s).
- Peças novas, todas do próprio cofre: `app/icone.ts` (os desenhos do Lucide em dados),
  `aberto/monograma.ts` e `monograma-selo.ts`, `aberto/trechos.ts`, `aberto/lixeira.ts`; a papelaria do
  Murall copiada em `_papelaria.scss`, com os tokens do campo conferidos contra `src/styles.scss`.
- O teste de ponta a ponta no Chrome (`cofre-api/test/e2e/chrome.mjs`) passou a abrir as partes dos
  Ajustes pelo índice.

### 17.16 As pastas do cofre (22/10)

Pedido do usuário: com muitas senhas, achar a certa exigia digitar na busca; ele quis pôr cada senha num
grupo, como o grupo das anotações, e ver a lista arrumada por grupo. Feito sem mexer na cripto, na API nem
no que fica no aparelho:

- **O grupo mora dentro do item cifrado** (`grupo` em `core/itens.ts`, até 60 caracteres, sem espaços
  sobrando): o servidor não vê nem o nome dos grupos, e nada novo vai no manifesto. Os itens de antes
  continuam sem grupo. Um grupo existe enquanto alguma senha o usa (não há lista de grupos guardada à
  parte, nem cor ou ícone escolhidos: isso pediria um lugar cifrado novo).
- **Mesmo grupo, escrito de outro jeito**: "bancos" e "Bancos" são a mesma pasta (sem maiúscula nem
  acento); ao salvar, o nome escrito vira o do grupo que já existe. Vindo de outro aparelho, vale a grafia
  da senha mudada por último (`aberto/pastas.ts`).
- **A lista em pastas**: com algum grupo, cada um é uma pasta de manilha com a orelha (o nome e quantas
  tem), em ordem alfabética, e as sem grupo por último; sem nenhum, a lista de antes. A orelha abre e
  fecha a pasta; quais estão fechadas fica só na memória da aba (some ao trancar, como tudo). A busca acha
  também pelo nome do grupo e mostra todas as pastas abertas. Abrir uma senha (pelas vazadas, por
  exemplo) ou guardá-la num grupo fechado abre a pasta dela.
- **Editar**: o campo Grupo vem logo depois do Título, com os grupos que já existem em adesivos para
  escolher com um toque (tocar no escolhido tira). Na senha aberta, o grupo aparece ao lado do site.
- **Renomear e apagar um grupo de uma vez** (23/10, a pedido): a parte Grupos dos Ajustes do cofre lista os
  grupos com quantas senhas têm. Renomear grava cada senha do grupo com o nome novo (`mudarGrupo` em
  `core/itens.ts`, uma gravação por senha, sem mexer na senha nem no histórico); para o nome de outro
  grupo, junta os dois. Apagar só tira o grupo das senhas, depois de perguntar. As da lixeira não mudam
  (gravar uma delas a tiraria da lixeira): se voltarem, voltam com o grupo de antes. Um conflito no meio
  para tudo com as anteriores já gravadas; fazer de novo termina o resto.
- Ficou de fora: mover várias senhas juntas.

### 17.17 Ícones no cofre (23/10)

Pedido do usuário: escolher um ícone para cada senha, com os mesmos ícones dos grupos e das colunas do
Kanban, todos num lugar só do código; e ícone e cor para os grupos do cofre, como nas anotações. Feito
sem mexer na cripto, na API nem no que fica no aparelho:

- **Um lugar só para as escolhas de ícone e cor**: `shared/cartela-de-icones.ts`, só dados (como o topo):
  os 50 ícones da cartela (id, nome e o desenho do Lucide copiado como dados) e as 8 cores. O Murall lê
  dali os ícones dos grupos e das colunas e as cores (`core/icon-choices.ts`, `ui/icons.ts`,
  `core/category-looks.ts`; o teste `ui/icons.spec.ts` confere que cada desenho é o de sempre), e o cofre
  também (`app/cartela.ts`, `app/icone.ts`). Ícone novo numa escolha entra ali.
- **O ícone da senha** (`icone`, dentro do item cifrado) fica no lugar da letra do selo, na lista e na
  senha aberta. Na edição, o selo grande (ou "Escolher um ícone") abre a cartela numa folha solta; a
  primeira escolha volta para a letra.
- **O ícone e a cor do grupo** vão copiados em cada senha do grupo (`grupoIcone`, `grupoCor`), como o
  nome: não há outro lugar cifrado para o grupo, e criar um mexeria no manifesto. Vale o da senha mudada
  por último. Trocar (Ajustes do cofre › Grupos › Ícone e cor) grava as senhas do grupo, como renomear;
  a senha posta num grupo leva o jeito dele; juntar dois grupos fica com o jeito do que recebe; apagar o
  grupo tira o jeito junto. Na lista, a orelha da pasta mostra o ícone, e a cor corre por dentro dela
  como nas orelhas das anotações.
- **A cor do selo** (23/10, a pedido): a senha guarda também a cor do quadradinho (`cor`, uma das seis
  cartolinas de `core/selo.ts`); vazia, a cor continua saindo do nome. Escolhe-se na mesma folha do ícone,
  que agora só fecha no Pronto (ou no Esc). A orelha do grupo com cor fica no papel claro das orelhas das
  anotações (`--papel-orelha`, o mesmo do Murall).
- **Mais cores e ícones** (23/10, a pedido): a cartela única ganhou 60 ícones de cenários do dia a dia
  (e-mail, jogos, festa, cartão, Wi-Fi, casa, viagem, saúde…), no fim, e o cinza e o preto nas cores das
  orelhas (as das anotações e das tags também). O selo das senhas ganhou o vermelho, o cinza e o preto
  (as cartolinas do Murall). Nada já sorteado muda: o grupo novo, a tag nova, o artista e a senha sem cor
  escolhida continuam sorteando só entre as cores de antes (`CORES_SORTEAVEIS`, `CORES_DO_MONOGRAMA`).
- Cuidado conhecido: uma aba aberta desde antes desta versão não conhece os campos novos e, ao gravar uma
  senha, a guarda sem o ícone (e, sendo a mudada por último, tira o jeito do grupo). O cofre não tem
  service worker e recarrega ao trancar, então a janela é só a de uma aba que ficou aberta durante a
  publicação; o mesmo valia para o grupo (17.16).

### 17.18 Várias senhas num item, e as que pedem a passkey de novo (23/10)

Pedido do usuário: guardar mais de um user e senha no mesmo item (duas contas do Facebook, as senhas de
cartões diferentes do mesmo banco, a senha reserva ou as perguntas de segurança junto da senha) e marcar
uma caixinha para que a senha só apareça depois de confirmar de novo a passkey do aparelho. Feito sem
mexer na cripto, na API nem no que fica no aparelho:

- **As entradas.** O User e a Senha de sempre são a primeira entrada, com um nome opcional (`rotulo`) e a
  marca `protegida`; as outras ficam em `outras` (até 10 entradas ao todo, cada uma com nome, user, senha
  e a marca), tudo dentro do item cifrado. Os itens de antes são itens de uma entrada, e uma aba antiga
  continua lendo o User e a Senha onde sempre estiveram. As senhas de antes (o histórico) são só as da
  primeira entrada, como antes, e levam a marca da entrada de onde saíram: tirar a primeira entrada na
  edição manda a senha dela, protegida, para o histórico.
- **Na tela.** Com um nome ou mais de uma entrada, cada uma ganha o título dela a pincel, com o User e a
  Senha embaixo, nas linhas de sempre; sem, o item é o de antes. A lista mostra "+2" ao lado do user, e a
  busca acha pelo nome e pelo user das outras entradas. Na edição, cada entrada tem o interruptor "Pedir
  a passkey para ver", e "Outra senha neste item" põe mais uma (o nome, com o X para tirar, aparece com
  mais de uma). Conferir as senhas vazadas olha todas as entradas, e o aviso fica na entrada que vazou.
- **Pedir a passkey de novo** (`core/confirmar.ts`). A senha protegida aparece travada (os pontos apagados
  e o carimbo "Pede a passkey"), com Destravar no lugar do Copiar. Destravar pede a passkey com a
  verificação do usuário obrigatória, com as passkeys que o desafio de abrir listou (guardadas no cofre
  aberto, `passkeys`), e só vale se quem assinou é uma delas e o aparelho conferiu a pessoa (a flag UV).
  Sem passkey no aparelho (o cofre aberto pelo código de recuperação), vale a senha mestra, que abre V de
  novo com o Argon2id. Destravado, o item inteiro fica à mostra por 2 minutos (editando, não conta), até
  "Travar de novo" ou sair do item. Editar um item com senha protegida pede a passkey antes, porque a
  edição mostra as senhas no campo; a cópia pela lista de uma senha protegida abre o item.
- **O que isto protege, e o que não.** O cofre decifra os itens todos ao abrir, então a trava é da tela:
  protege a senha de quem senta na frente do cofre aberto, não de quem já roda código na página (que lê a
  memória). Por isso a assinatura não vai ao servidor (o desafio é sorteado na página). Uma camada de
  verdade, com a senha protegida cifrada por uma chave que só a passkey (o PRF) abre, mexeria na cripto e
  no que o servidor guarda: fica para quando o usuário aprovar.
- Cuidado conhecido: como em 17.16 e 17.17, uma aba aberta desde antes desta versão grava o item sem as
  outras entradas e sem as marcas. O cofre recarrega ao trancar e não tem service worker, então a janela
  é só a de uma aba aberta durante a publicação.
- Conserto junto: um item grande demais para o servidor (16 kB) dava "O que veio do servidor não confere"
  e esvaziava a lista; agora diz que passou do tamanho e o que fazer.

### 17.19 Apagar a conta do Murall com cofre (23/10)

Achado numa revisão de segurança pedida pelo usuário: o `DELETE /v1/eu` apagava a conta na hora, sem olhar
o cofre. O cofre mora no id da conta, então ele ficava para trás (a mesma pessoa, entrando de novo com o
Google, ganhava uma conta nova, com outro id, e o cofre antigo não abria mais), e ficava no banco para
sempre. Com o token do Murall roubado (90 dias no localStorage), qualquer um fazia isso: é a ameaça 23,
cuja proteção (8.6) não tinha sido feita.

- **A porta do cofre** (`MuralRpc`, em `cofre-api/src/entry/worker.ts`) ganhou `temCofre(usuarioId)` (só
  o sim ou o não) e `apagarCofre(usuarioId)` (tudo da conta, as tabelas de `VAULT_TABLES` em
  `domain/murall.ts`, as mesmas do `DELETE /api/cofre`, pela cota e só com o cofre ligado). Os dois só
  aceitam um UUID.
- **No Murall** (`api/src/domain/erase.ts`, migração 0014 `usuarios.apagar_em`): sem cofre, a conta sai
  na hora, como antes. Com cofre, o `DELETE /v1/eu` responde 202 com `apagarEm` (7 dias depois; pedir
  de novo não adia) e a conta continua funcionando. `POST /v1/eu/cancelar-apagar` desmarca; o
  `GET /v1/eu` devolve `apagarEm` enquanto está marcada. A limpeza diária apaga as contas cuja hora
  passou: o cofre antes, pela porta; se ele não responder, a conta fica para o dia seguinte. Sem resposta
  do cofre no pedido, 503: na dúvida, não apaga.
- **Na hora, só sem cofre.** O plano dizia "na hora se o cofre for aberto antes"; ficou "depois de apagar
  o cofre lá dentro". Aceitar "o cofre está aberto agora" deixaria quem tem só o token do Murall apagar
  tudo enquanto o dono usa o cofre no celular. Apagar o cofre pede o cofre aberto (senha e passkey) e a
  palavra APAGAR; depois disso, o Murall não acha cofre e apaga a conta na hora.
- **No site**: a pergunta de Apagar a conta avisa da espera e do cofre (para quem pode usar o cofre); com
  a conta marcada, um bilhete no topo de toda página ("vai ser apagada em 30 de outubro, com o cofre de
  senhas", com o Não apagar e o caminho para sair de todos os aparelhos), sem X, e a linha de Ajustes ›
  Conta mostra a data, o Não apagar e o Apagar já (que, com o cofre ainda lá, diz para apagar o cofre
  antes).
- Ordem do deploy: o cofre primeiro (a `MuralRpc` nova), depois a API do Murall. Com a API nova e o cofre
  antigo, a pergunta ao cofre falha e apagar a conta responde 503 até o cofre ser publicado.
- Fica de fora: o aviso dentro do próprio cofre (para quem abre o cofre sem passar pelo Murall nesses 7
  dias).
- **Sem cofre, o que sobrou lá sai depois** (28/10): a conta sem cofre sai na hora, e depois o Murall
  chama `apagarCofre` assim mesmo. Antes, a sessão de entrada de quem estava criando um cofre (20
  minutos) continuava valendo e criava um cofre preso a uma conta que não existe mais, para sempre no
  banco (e um cofre criado entre a pergunta e o apagar ficava igual). Com a conta já fora, ninguém
  entra de novo com ela; se o cofre não responder, a conta já saiu e fica só a linha no log.
- **Toda conta espera, e com o login do Google** (28/10, decisão do usuário numa revisão): só o token da
  sessão (roubado por um XSS, por exemplo) ainda apagava na hora uma conta sem cofre, sem volta. Agora o
  `DELETE /v1/eu` pede no corpo o `credential` de um login do Google feito há no máximo 10 minutos, da
  mesma conta (o mesmo `sub`; `confirmByGoogle` em `api/src/domain/erase.ts`: 400 `sem-credencial`, 403
  `confirmar-invalido`, `outra-conta-google` ou `confirmar-antigo`, nunca 401, que derrubaria a sessão), e
  toda conta, com ou sem cofre, fica marcada para sair em 7 dias, com o aviso e o "Não apagar". Não há
  mais "Apagar já" (nem depois de apagar o cofre lá dentro): quem apaga é só a limpeza diária. O pedido
  também não pergunta mais ao cofre (o 503 do pedido saiu; a limpeza continua perguntando).


### 17.20 As senhas em quadro, como o Kanban (23/10)

Pedido do usuário: com 40 senhas em 6 grupos, a lista em pastas empilhadas ocupava muita altura e a página
subia e descia; ele quis navegar com calma, a rolagem independente do tamanho da página, "algo semelhante
ao Kanban". Só a tela mudou (nada na cripto, na API ou no que fica no aparelho):

- **Um quadro de pastas** (`aberto/quadro.ts`): cada grupo é uma pasta em pé, lado a lado, com uma linha
  por senha; cada pasta rola sozinha, e o quadro rola de lado quando elas não cabem (como o do Kanban,
  com as beiradas apagadas e as setas de papel com mouse). As pastas não fecham mais (era para encurtar a
  lista comprida, que não existe mais).
- **A mesa cabe na tela**: a altura dela é a da janela menos o que vem em cima, medido pela página; a
  página não rola num computador. No celular e com zoom, a página rola até a mesa, e só então as pastas
  rolam por dentro.
- **A senha aberta** fica numa folha ao lado do quadro (tela larga) ou no lugar dele (estreita). Com uma
  edição mudada e não salva, trocar de senha, criar outra ou ir aos Ajustes pergunta antes (o Trancar não
  pergunta: é a saída de segurança).
- **Copiar sem abrir**: os botões de User e Senha aparecem com o mouse ou o foco na linha (pedido do
  usuário: só no hover, nem na aberta); no toque, sempre. Com o foco numa linha, U e S copiam.
- **No celular**, uma pasta por vez e uma fileira com as orelhas de todas, que leva até a pasta. Nada se apaga no celular
  (nem as beiradas do quadro, nem a pasta que rola por dentro): o apagado caía em cima das senhas e dos
  botões de copiar (pedido do usuário, 25/10).
- Ficou de fora: arrastar uma senha de uma pasta para outra (mudar o grupo arrastando, como no Kanban).

### 17.21 Confirmar de novo antes do que tranca o dono fora (28/10)

Achado de revisão (pendente desde a de 23/10, e de novo na de 28/10, 57e8e4a): trocar a senha, pôr e tirar
aparelhos, gerar um código de recuperação novo e apagar o cofre pediam só a sessão do cofre aberto. Quem
roubasse esse token trocava V (e o dono não abria mais), punha a passkey dele, tirava a do dono ou apagava
tudo. O usuário escolheu pedir a passkey de novo (ou a senha) no servidor, com um toque a mais.

- **No servidor** (`cofre-api/src/domain/reconfirm.ts`): essas rotas pedem no corpo `confirmar`, conferido
  depois do resto do pedido e antes de gravar. Ou `{ desafio, assinatura }`, uma assinatura nova de uma
  passkey do cofre, com a verificação do usuário, sobre o desafio de `POST /api/cofre/confirmar` (com a
  sessão do cofre; uso único, 5 minutos, porque pôr um aparelho confirma antes e registra depois; o
  contador da passkey sobe como ao abrir); ou `{ kAuth }`, a mesma prova da senha de abrir. Sem ela, 403
  `falta-confirmar`; a senha errada, 403 `senha-errada` com "Senha errada" no histórico; nunca 401, que
  tranca a página.
- **Nunca trancar o dono fora.** A senha vale sempre, porque é a saída de quem abriu pelo código de
  recuperação sem nenhum aparelho à mão: ele tira o perdido, põe um novo e gera o código novo só com ela.
  Os aparelhos sem PRF (modo servidor) confirmam pela assinatura, como os outros. Os erros da senha aqui
  contam num freio da sessão (5 por cofre aberto, na tabela `freios`, chave `sessao:<hash>`; acertar não
  conta), e **não** no freio de abrir: senão, quem tem só o token gastaria os 20 erros do dia e o dono não
  abriria o cofre. Os desafios de confirmar também têm freio próprio da sessão (10 por hora), separado
  dos 30 por hora de abrir.
- **Na página** (`core/confirmar.ts`, `app/gerenciar`): Pôr um aparelho, Tirar, Gerar (o código) e Apagar o
  cofre abrem a folha "Confirme que é você" embaixo do que pediu. A passkey já pede (com "Usar a senha
  mestra" ao lado); aberto pelo código, começa pela senha. A senha é conferida na página antes (abrindo V),
  então um erro de digitação não gasta as tentativas do servidor. Trocar a senha não ganhou toque: a senha
  atual que ela já pedia vai como a confirmação. No aparelho sem PRF, a senha do modo servidor confirma.
- Uma aba aberta de antes desta versão recebe "Confirme de novo…" ao gerenciar: recarregar resolve.
- Nada mudou na cripto nem no banco (sem migração): o desafio usa o tipo `assinatura` que já existia.

### 17.22 Revisão da tela do cofre (29/10)

Code-review alto do cofre aberto (quadro, pastas, item, lixeira, trancador, área de transferência, vigia,
service worker, topo, Ajustes). Corrigido, sem mudar a cripto nem o que está guardado:

- **Cache de voltar/avançar (bfcache).** O trancar do `pagehide` avisa o servidor, mas o navegador ignora
  o `location.replace` pedido na saída; com `Cache-Control: no-store` e sem cookies, o Chrome já põe a
  página no bfcache, e o Voltar trazia o cofre aberto, com as senhas decifradas e sem nenhum relógio. A
  raiz ouve `pageshow` com `persisted` e recarrega do zero, e trancar esvazia já os itens, a busca, o
  aberto e as vazadas (além de zerar M e V).
- **Aba escondida.** A volta à aba confere o minuto antes de esquecer quando ela escondeu: o celular e o
  notebook dormindo não rodam o relógio de 1 s, e a volta é a única chance.
- **Confirmar de novo.** A passkey ou a senha mestra que voltam depois de abrir outra senha (item) ou de
  ir para outra parte dos Ajustes não fazem nada: não destravam a outra, não tiram o aparelho.
- **Vigia do DOM.** Ao começar, olha o que já estava na página (o que uma extensão pôs antes de o cofre
  subir): só valem as metas, o título, a base, os links e scripts da origem e o `<cofre-root>`. Dentro
  do cofre, um script ou iframe embrulhado noutro elemento também conta.
- **Service worker.** Um registro cujo `unregister` falha ainda conta como tirado (a porta pede para
  recarregar); antes, a falha zerava a conta.
- Trocar as senhas de um item tira o aviso de vazada dele (mudar só o título, não); as pastas e a conta
  dos grupos numa passada só; `hexDaCor` em `shared/cartela-de-icones.ts`.

Conferido sem mudar: a senha revelada sai do DOM ao esconder (15 s) e ao trocar de item; a limpeza da
área de transferência sobrevive a trancar (`cofre:limpar-copia`, só a hora); nada além dela vai para o
`sessionStorage`.
