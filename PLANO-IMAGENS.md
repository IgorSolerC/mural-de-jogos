# Plano: imagens coladas nas anotações, sem link

Pedido do usuário (28/out/2026): "Atualmente o sistema não armazena arquivos de forma nenhuma, apenas
texto. Para vincular em uma nota uma imagem (por meio de um widget) é necessário utilizar um URL [...]
Quero planejar a possibilidade de permitir que usuários anexem imagens apenas colando a imagem no
painel de descrição de notas. Quero que o sistema continue completamente gratuito de desenvolver e
hostear (talvez diminuindo a resolução das imagens?) [...] Faça isso de forma inteligente para não
estrapolar os usos do cloudflare e google api."

Este arquivo é o plano inteiro, escrito para ser lido também por outras AIs (como o PLANO-API.md). As
decisões que esperam o usuário estão na seção 8. O andamento fica na seção 10.

---

## 0. Resumo em uma página

- **Colar e pronto.** A pessoa cola (ou arrasta, ou escolhe do aparelho) uma imagem na descrição. O site
  encolhe a imagem **no próprio aparelho** (lado maior de 1600 px, WebP, uns 150–250 KB; tira o GPS e
  os outros dados da foto), guarda no IndexedDB e escreve no texto o widget de sempre com um endereço
  novo: `{{imagem: murall://imagem/ID}}`. Funciona sem internet e sem conta.
- **A nuvem guarda num banco D1 à parte.** Os bytes vão para um banco novo, `mural-imagens` (o D1
  grátis dá 500 MB por banco e 5 GB por conta); os dados de cada imagem (dono, tamanho, quem vê) ficam
  no banco de sempre. Nada de produto novo da Cloudflare: o R2 pede o checkout de uma assinatura e a
  conta fica sem forma de pagamento de propósito; o KV tem 1 GB e 1.000 gravações por dia para a conta
  inteira (seção 2).
- **O Google não entra.** O Google Drive foi pensado e descartado (quem visita o mural público e os
  colegas de uma compartilhada não leem o Drive de outra pessoa sem a imagem virar pública na
  internet). O login continua o mesmo; nenhuma chamada nova à API do Google.
- **Mostrar sem gastar.** Cada imagem tem um id que nunca muda de conteúdo, então cada aparelho baixa
  cada imagem **uma vez na vida** (fica no IndexedDB), e quem visita guarda pelo cache do navegador.
  Um envio custa 1 pedido ao Worker e umas 4 linhas gravadas; ver custa 1 pedido e 2 linhas lidas.
- **Privada por padrão.** A imagem de uma anotação privada só abre com a sessão do dono (ou de quem está
  na anotação compartilhada que a usa). Abre sem login só a que está numa ficha do mural público.
- **Travas.** Teto de 300 KB por imagem, cota por pessoa (25 MB, umas 100 a 170 imagens), 30 envios por dia,
  cota global a 80% do banco, freio por IP nas visitas, e a checagem diária avisa a 70%. Passou do
  limite, o envio espera; nada é cobrado (seção 6).
- **A regra do logout vale inteira.** As imagens guardadas no aparelho saem na limpeza; antes de sair,
  o site tenta mandar as que ainda não subiram e avisa se não der (seção 3.7).
- **Por partes**, em 7 rodadas pequenas, começando por medir (seção 9).

## 1. O que pesa no desenho (como o Murall é hoje)

| Fato | De onde | Por que importa |
| --- | --- | --- |
| O mural vai inteiro a cada envio (gzip, teto de 1,9 MB por parte) | `api/src/routes/mural.ts` | Imagem dentro do mural mataria a sincronização: imagem não comprime. |
| A anotação compartilhada fica aberta (JSON) no D1 | migração 0011 | O servidor consegue achar os ids das imagens nela, sem abrir o mural. |
| Workers Free: 100 mil pedidos por dia, 10 ms de CPU por pedido, corpo até 100 MB | [limites dos Workers](https://developers.cloudflare.com/workers/platform/limits/) | Os pedidos por dia são o limite que mais aperta; o servidor não decodifica nem encolhe imagem (CPU). |
| D1 Free: 500 MB por banco, 5 GB por conta, 10 bancos, 2 MB por BLOB, 5 milhões de linhas lidas e 100 mil gravadas por dia (vira à meia-noite UTC) | [limites do D1](https://developers.cloudflare.com/d1/platform/limits/), [preços do D1](https://developers.cloudflare.com/d1/platform/pricing/) | Cabe guardar os bytes; o mural de 1,9 MB já vai como parâmetro BLOB hoje, então o caminho está provado. |
| A conta da Cloudflare fica sem forma de pagamento; estourar só faz parar | `api/README.md` › Proteção contra cobrança | Descarta o que pede cartão (R2, Images). |
| A cota própria de gravações (`COTA_LINHAS_DIA`, 60 mil) | `api/src/domain/quota.ts` | Cada envio de imagem passa por ela, como tudo. |
| O site está no GitHub Pages; o DNS de igorsc.com.br já é da Cloudflare | `nslookup` | Um domínio próprio para as imagens é possível de graça, mas não é preciso (decisão D7). |
| A CSP já aceita `img-src https: blob: data:` | `src/index.html` | Mostrar a imagem não pede mudar a CSP; o envio vai para a API que já está no `connect-src`. |
| Sair limpa tudo o que o site guardou | `CLAUDE.md`, `core/browser-reset.ts` | O banco novo do IndexedDB entra no `wipeBrowser`, com teste. |

## 2. Os caminhos possíveis

| Caminho | Grátis de verdade? | Problema | Veredito |
| --- | --- | --- | --- |
| **A. Dentro do texto (data URL)** | Sim | O mural vai inteiro a cada envio; 10 fotos já passam do teto de 1,9 MB; o localStorage e a busca sofrem. | Não. |
| **B. D1, num banco à parte** | Sim (500 MB por banco, até ~4 GB somando bancos) | O banco tem teto: precisa de cota por pessoa e global. | **Escolhido.** |
| C. Workers KV | Sim (1 GB) | 1.000 gravações por dia para a conta inteira; produto novo; menos espaço que o D1. | Não. |
| D. R2 | 10 GB grátis, mas | Pede o checkout de uma assinatura ([guia do R2](https://developers.cloudflare.com/r2/get-started/)); passar do grátis cobra. Contradiz "sem forma de pagamento". | Não. |
| E. Cloudflare Images | Não | Guardar é pago. | Não. |
| F. Google Drive de cada pessoa (`drive.file`, escopo não sensível) | Sim, 15 GB por pessoa | Quem visita e os colegas da compartilhada não leem o Drive de outra pessoa sem tornar o arquivo público; o Drive não serve `<img>` de forma estável; cada visualização vira chamada à API do Google pelo Worker; mais uma tela de permissão. | Não como base (talvez "copiar para o meu Drive" um dia). |
| G. Repositório do GitHub | Sim | Público: as imagens das anotações privadas ficariam abertas. | Não. |
| H. Imgur, ImgBB, Cloudinary | Sim, com limites deles | A imagem privada num serviço de terceiros, termos e cotas de outros, mais uma chave. | Não. |

**Por que B:** é o stack que já existe (Workers + D1, os dois adaptadores, os testes nos dois bancos, o
backup, a checagem diária), não pede cartão nem conta nova, e continua portátil: "Sair da Cloudflare"
leva as imagens junto (o banco é SQLite, o `sqlite-node.ts` serve). Banco à parte porque o principal
fica pequeno e rápido (a exportação do backup trava o banco enquanto lê), e porque dá para somar bancos
quando um encher, sem migrar nada.

## 3. O desenho

### 3.1 No aparelho: colar, encolher, guardar, escrever

1. **Entrada.** O `(paste)` do editor (`ui/rich-editor.ts`, `onPaste`) olha `clipboardData.files`
   antes do texto; também arrastar e soltar na área, e o botão **Do aparelho** na folha do widget de
   imagem (ao lado do Link), com `<input type="file" accept="image/*">` (no celular abre a câmera e a
   galeria; o iPhone já entrega HEIC como JPEG).
2. **Encolher** (`core/images.ts`, novo, sem dependência): `createImageBitmap` com a orientação do EXIF
   aplicada → canvas com o lado maior em **1600 px** (nunca aumenta) → `toBlob('image/webp', 0.8)`.
   Passou de 250 KB: qualidade 0,7, depois 0,6, depois 1280 px. O Safari não gera WebP no canvas
   (conferir na hora com um teste de 1×1): lá vai JPEG 0,8 com fundo branco no lugar da transparência.
   O GIF animado vira a primeira imagem (decisão D4). SVG não entra (vira PNG pelo canvas, ou é recusado
   se não decodificar). Redesenhar no canvas apaga o EXIF inteiro, inclusive o GPS da foto.
3. **Guardar** no IndexedDB `meu-mural-imagens` (`core/image-store.ts`, novo): `{ id, bytes, tipo,
   largura, altura, hash, estado: 'local' | 'enviando' | 'na-nuvem', criada }`. O id nasce aqui:
   22 letras base64url de `crypto.getRandomValues` (128 bits), então o texto nunca precisa ser
   reescrito depois do envio. A mesma imagem colada duas vezes (mesmo SHA-256) reaproveita o id.
4. **Escrever** no cursor, numa linha só, o widget de sempre: `{{imagem: murall://imagem/ID}}`, com a
   moldura e a legenda como já existem (`readMedia` em `core/widgets.ts`; o `LINKY` já aceita o
   endereço; `httpsUrl` passa a aceitar também `murall://imagem/<22 letras>`). Enquanto encolhe (100–400
   ms), um "Guardando a imagem…" no lugar.

### 3.2 O endereço na anotação

`murall://imagem/ID` e não o endereço da API, porque a API pode mudar de casa (seção "Sair da
Cloudflare" do `api/README.md`): o site traduz na hora de mostrar. A cópia (Ctrl+C), a busca, o espelho
da API das AIs e o PDF leem o mesmo texto. Um site antigo vê um link que não abre e mostra o aviso de
link inválido, sem quebrar.

### 3.3 A nuvem

**Bancos.** Os dados de cada imagem ficam no banco de sempre (migração 0020), porque é lá que estão as
contas, as compartilhadas e a limpeza; os bytes ficam no banco novo `mural-imagens` (binding `IMAGENS`,
com `migrations_dir` próprio), só uma tabela:

```sql
-- banco de sempre (0020_imagens.sql)
CREATE TABLE imagens (
  id TEXT PRIMARY KEY,          -- as 22 letras que o site sorteou
  dono_id TEXT NOT NULL,
  banco INTEGER NOT NULL,       -- em qual banco de bytes está (1 = mural-imagens; abre espaço para o 2, 3…)
  tipo TEXT NOT NULL,           -- image/webp | image/jpeg | image/png
  bytes INTEGER NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  publica INTEGER NOT NULL DEFAULT 0,
  solta_desde TEXT,             -- desde quando nenhuma anotação usa (seção 3.6)
  criada_em TEXT NOT NULL
);
CREATE INDEX imagens_por_dono ON imagens (dono_id);
-- quais imagens cada anotação compartilhada usa (o servidor acha no JSON dela ao gravar)
CREATE TABLE nota_imagens (nota_id TEXT NOT NULL, imagem_id TEXT NOT NULL, PRIMARY KEY (nota_id, imagem_id));
CREATE INDEX nota_imagens_por_imagem ON nota_imagens (imagem_id);

-- banco mural-imagens (0001_bytes.sql)
CREATE TABLE bytes (id TEXT PRIMARY KEY, dados BLOB NOT NULL) WITHOUT ROWID;
```

**Rotas** (`api/src/routes/images.ts`, novo; o núcleo continua sem saber que é Cloudflare: a porta
`Deps` ganha `imagesDb`, nos dois adaptadores):

- `PUT /v1/imagens/:id` (sessão; o corpo são os bytes, `Content-Type` da imagem, `Imagem-Tamanho:
  1600x1200`): confere o id (22 letras), o teto (300 KB, `413 imagem-grande`), o tipo pelos primeiros
  bytes (`RIFF….WEBP`, `FF D8 FF`, `89 PNG`; outro é `415 imagem-tipo`), a cota da pessoa
  (`403 cota-imagens`), os envios do dia (`429`, na tabela `freios`) e a global (`507 imagens-cheio`).
  Grava os bytes primeiro e os dados depois (a limpeza tira bytes sem dados). Repetir o mesmo id do
  mesmo dono responde 200 (o envio pode cair no meio e voltar); o id de outra pessoa, 409.
- `GET /v1/imagens/:id`: os bytes. Pública, sem sessão; privada, com a sessão do dono ou de quem está
  numa compartilhada que a usa (`nota_imagens` + `nota_membros`); senão **404** (nunca confirma que
  existe). Cabeçalhos: o tipo guardado, `X-Content-Type-Options: nosniff`, `Content-Security-Policy:
  default-src 'none'`, `Cross-Origin-Resource-Policy: cross-origin`; pública com `Cache-Control:
  public, max-age=604800` (7 dias, porque pode voltar a ser privada), privada com `private, no-store`
  (o site guarda no IndexedDB, que a limpeza alcança; o cache do navegador não).
- `DELETE /v1/imagens/:id` (só o dono): apaga já (para a lista em Ajustes).
- `GET /v1/eu/imagens`: quanto usa, a cota e a lista (id, bytes, tamanho, criada, solta).
- O `PUT /v1/eu/mural` ganha a parte opcional `imagens` (JSON `{ publicas, usadas }`), como a
  `fichas`: as imagens que aparecem no mural público, e todas as que o mural usa (seção 3.6). Vai só
  quando mudou (o site guarda o hash do que mandou). Sem a parte, nada muda.
- `POST`/`PUT /v1/notas/:id`: ao gravar a compartilhada, o servidor procura `murall://imagem/` no JSON
  (texto simples, um regex, sem abrir nada) e acerta `nota_imagens` só no que mudou.

O servidor nunca decodifica nem encolhe a imagem: 10 ms de CPU não deixam, e não precisa. O que ele
confere é o tamanho, o tipo pelos primeiros bytes e a cota; quem encolhe é o site.

### 3.4 Quem vê

- **Privada (o padrão):** o dono, em qualquer aparelho dele, e quem está numa anotação compartilhada
  que a usa (enquanto estiver).
- **Pública:** quando ela aparece no mural público de alguém que pode mostrá-la (o dono, ou alguém de
  uma compartilhada pública que a usa). A parte `imagens.publicas` do envio liga e desliga. Quando
  a nuvem tira uma compartilhada do mural público de alguém (`domain/shared-public.ts`, migração 0019),
  as imagens dela saem junto da lista.
- Quem visita um mural público baixa a pública por um `<img>` comum, sem login, com `loading="lazy"`.
- Imagem de outra pessoa copiada para uma anotação sua (colar o texto de uma compartilhada numa
  privada): continua sendo dela e para de abrir quando você sai da compartilhada. A rodada 6 resolve
  copiando os bytes como imagem sua ao colar (decisão D3).

### 3.5 Mostrar sem gastar

- **Logado, as suas e as das compartilhadas:** o widget pede ao `image-store`; se não tem, baixa com a
  sessão (`fetch` com `Authorization`), guarda no IndexedDB e mostra por `URL.createObjectURL`. Cada
  aparelho baixa cada imagem uma vez. O PDF, o Ampliar e o offline usam a mesma cópia.
- **Visita (mural público de outra pessoa):** `<img src>` direto na API, com o cache de 7 dias do
  navegador. Nada guardado pelo site.
- **Antes do envio terminar**, o outro aparelho mostra a moldura vazia com "A imagem ainda está no
  aparelho em que foi colada" (o 404 de uma imagem que não subiu é igual ao de uma que não existe; o
  site sabe a diferença porque o texto dele tem o id e a nuvem não).
- Domínio próprio (Cache API de borda, que não funciona em `workers.dev`) não muda a conta dos
  pedidos, só poupa linhas lidas, que sobram. Fica de fora (D7).

### 3.6 O que ninguém usa mais

O servidor não abre o mural, então quem sabe o que está em uso é o site:

- A cada envio em que mudou, a parte `imagens.usadas` leva todos os ids do mural (as anotações, as
  versões guardadas dos últimos 30 dias de `kept-versions.ts`, a lixeira, o Kanban). O servidor marca
  `solta_desde = agora` nas imagens do dono que não estão nem na lista nem em `nota_imagens`, e tira a
  marca das que voltaram.
- A limpeza diária (`domain/cleanup.ts`) apaga, dados e bytes, as soltas há mais de **30 dias**
  (decisão D6): dá tempo do Desfazer, de outro aparelho que ainda não sincronizou e de restaurar um
  backup do mural.
- Apagar a conta apaga as imagens dela na limpeza, como o resto (o banco de bytes depois do principal;
  bytes sem dados são apagados na limpeza seguinte).

### 3.7 A regra do logout (CLAUDE.md)

- `meu-mural-imagens` entra na lista de bancos do `wipeBrowser` (`core/browser-reset.ts`), com o teste
  em `browser-reset.spec.ts`; quem grava nele confere `storageFrozen()`; nada lê o armazenamento no
  nível do módulo.
- **Sair pelo botão** com imagens ainda não enviadas: o site tenta mandar antes ("Mandando 3 imagens
  para a nuvem…"). Sem internet, a pergunta diz que elas vão sair deste aparelho e não voltam; a pessoa
  escolhe Sair assim mesmo ou Ficar. Pelos outros caminhos (401, "Sair de todos", conta apagada) não há
  como perguntar: por isso o envio começa logo depois de colar, sem esperar o próximo envio do mural.
- **O de ninguém** (quem nunca entrou): as imagens ficam só no aparelho. Ao entrar, elas contam como
  conteúdo em `localHasContent` (`core/cloud-sync.ts`): a pergunta de levar o mural para a conta vale
  para elas, e só sobem se a pessoa escolher.
- O cache de 7 dias das públicas visitadas é do navegador, não do site; mesmo assim a rodada 4 confere
  se a resposta de `POST /v1/auth/sair` com `Clear-Site-Data: "cache"` limpa as imagens da origem da API
  (e, se limpar, pede numa rota pequena também nos caminhos sem botão).

### 3.8 Backup

- **O backup baixado** (`core/backup-file.ts`) leva as imagens em base64, para o mural sem conta não
  perder nada e para restaurar mandar de volta.
- **O banco de bytes**: um passo no `backup.yml` que exporta o `mural-imagens` uma vez por semana (com a
  mesma senha, AES-256, artefato de 30 dias); o diário continua só no banco principal. O Time Travel do
  D1 cobre os últimos 7 dias dos dois (decisão D5).

## 4. As contas (o quanto cabe)

| Coisa | Conta | Folga |
| --- | --- | --- |
| Espaço | 500 MB por banco; cota global a 80% = 400 MB; ~150–250 KB por imagem → **1.600 a 2.700 imagens** no primeiro banco | Cada banco novo soma outro tanto (o `banco` já existe na tabela); a conta dá 5 GB somando todos. |
| Por pessoa | 25 MB ≈ 100 a 170 imagens | Ajustável no `wrangler.toml` (`IMAGENS_MB_PESSOA`). |
| Pedidos ao Worker | Enviar: 1. Ver: 1 por imagem por aparelho, uma vez na vida (logado) ou a cada 7 dias (visita) | Um mural público com 30 imagens visto por 200 pessoas num dia gasta no máximo 6 mil dos 100 mil, e só as que rolarem até a tela (lazy). |
| Linhas gravadas | Por envio: os dados (1 + índice), os bytes (1), o freio (1) e o uso (1), ~5 | 30 envios por pessoa por dia = 150 linhas; nada perto de 60 mil. |
| Linhas lidas | Por imagem vista: os dados com a conferência de quem vê (1–3) + os bytes (1) | 5 milhões por dia. |
| CPU | Ler 300 KB do corpo e gravar, ou ler e devolver: só cópia, sem decodificar | Medir na rodada 0 (`wrangler tail`, campo `cpuTime`), como no PLANO-API. |
| Google | Nada novo | — |

## 5. Segurança

- Só a sessão do site envia (a chave da API das AIs não envia imagem, por enquanto).
- O tipo é conferido pelos bytes e devolvido com `nosniff` e uma CSP fechada: nenhuma imagem vira
  página. SVG nunca.
- O id tem 128 bits e não sai do conteúdo (não é o hash), então ter a imagem não diz o endereço dela.
- O 404 é igual para "não existe" e "não pode ver".
- O GPS e os outros dados da foto saem no aparelho, antes de qualquer envio.

## 6. Freios e o que acontece ao passar

| Freio | Onde | Ao passar |
| --- | --- | --- |
| 300 KB por imagem | API (o site já manda menor) | `413 imagem-grande`; o site encolhe mais e tenta de novo. |
| 25 MB por pessoa | API (`IMAGENS_MB_PESSOA`) | `403 cota-imagens`; a imagem fica no aparelho, com o aviso e o caminho para Ajustes › Imagens. |
| 30 envios por pessoa por dia | `freios` | `429`; a fila tenta no dia seguinte, a imagem aparece neste aparelho. |
| 400 MB no banco | API (`IMAGENS_MB_TOTAL`) | `507 imagens-cheio`; idem, e a checagem diária já tinha avisado a 70%. |
| Visitas por IP | na memória, como o `catalogBrake` (300 por minuto) | `429` para aquele IP; o resto segue. |
| `MODO` | `wrangler.toml` | `so-leitura`/`desligado` param os envios, como o mural. |
| Checagem diária | `scripts/saude.ts` | Soma o tamanho do `mural-imagens` e falha (e-mail) a 70%. |

## 7. O que fica de fora (de propósito)

- Vídeo, PDF e outros arquivos: só imagem.
- Editar a imagem (recortar, girar) no site.
- Mandar imagem pela API das AIs e pelo MCP (a leitura entra na rodada 6).
- Imagem nas resenhas e nos comentários: só nas anotações e nos lugares que já aceitam widget,
  primeiro. Os outros podem vir depois sem mudar a nuvem.
- Galeria de todas as imagens.

## 8. Decisões que esperam o usuário

| # | Pergunta | Recomendado | Outras |
| --- | --- | --- | --- |
| D1 | Tamanho da imagem guardada | **1600 px no lado maior, ~150–250 KB** (nítida no Ampliar e numa tela 2×) | 1280 px, ~100–150 KB (cabe ~60% a mais, mais mole no Ampliar); 2048 px, ~300–450 KB (teto de 500 KB, cabe metade) |
| D2 | Cota por pessoa | **25 MB e 30 envios por dia** | 10 MB; 50 MB |
| D3 | Quem vê a imagem privada | **Só o dono e quem está na compartilhada que a usa**; colar o texto de outra pessoa copia a imagem como sua | Qualquer um com o endereço (mais simples, mas o endereço vazado continua abrindo) |
| D4 | GIF animado | **Vira a primeira imagem, parada** | Recusar; guardar como veio se couber em 300 KB (sem encolher) |
| D5 | Backup das imagens | **Uma vez por semana no Actions, com senha**, mais o Time Travel de 7 dias | Só o Time Travel |
| D6 | Imagem que nenhuma anotação usa | **Apagada 30 dias depois** | 7 dias; nunca (até a pessoa apagar em Ajustes) |
| D7 | Domínio próprio para as imagens (`img.murall.igorsc.com.br`) | **Não agora** (não muda a conta dos pedidos) | Sim, junto da rodada 4 |
| D8 | Sem conta | **As imagens ficam só no aparelho** (e no backup baixado), como o resto do mural de ninguém | — |

## 9. Rodadas

Um commit por passo, como no PLANO-API (cada um com a BUILD e, quando aparece para a pessoa, as
Novidades).

0. **Medir.** O uso de ontem e hoje pela checagem diária (pedidos ao Worker, tamanho do banco
   principal), para confirmar a folga da seção 4. Um Worker de teste com `PUT`/`GET` de 300 KB num D1 de
   teste, o `cpuTime` no `wrangler tail`. Colar uma imagem no Chrome, no Safari do iPhone e no Chrome do
   Android (o evento `paste` traz o arquivo? o Safari gera WebP?).
1. **A nuvem.** Migração 0020, banco `mural-imagens` (criar com `wrangler d1 create`, binding no
   `wrangler.toml` e no `api.yml` para migrar os dois), as rotas, os freios, os testes nos dois bancos
   (Node e D1), a checagem diária e o `api/README.md`.
2. **No aparelho, sem nuvem.** `core/images.ts` e `core/image-store.ts`, colar/arrastar/Do aparelho, o
   widget com `murall://`, a limpeza com o teste, o backup baixado. Funciona sem conta. Impeccable na
   folha do widget e no "Guardando a imagem…".
3. **Sincronizar.** A fila de envio (logo depois de colar e a cada `syncOnce`), baixar no outro
   aparelho, a moldura vazia de "ainda no outro aparelho", o Sair com imagens pendentes,
   `localHasContent`, o de ninguém indo para a conta.
4. **Público e compartilhadas.** A parte `imagens.publicas`, `nota_imagens` ao gravar a compartilhada,
   a visita sem login, a ligação com a 0019, o `Clear-Site-Data`.
5. **Limpeza e Ajustes.** `imagens.usadas` e a `solta_desde`, a limpeza diária, Ajustes › Imagens ("12 MB
   de 25 MB", a lista com Apagar), o backup semanal do banco de bytes.
6. **As pontas.** O PDF (`pdf-sheet`, amostra conforme a regra do PDF), a cópia, o espelho e o MCP lendo
   a imagem (`GET /ext/v1/imagens/:id` com `notas:ler`), colar texto com a imagem de outra pessoa.

## 10. Andamento

- 28/out/2026: plano escrito; nada implementado. Esperando as decisões D1–D8.

## 11. A conferir (riscos)

- O R2: o guia oficial pede o checkout de uma assinatura; as fontes de fora divergem se o cartão é
  obrigatório. Não muda a escolha (passar do grátis do R2 cobra, e a regra é não ter como cobrar).
- O Safari não gerar WebP no canvas (MDN e caniuse dizem que não, até o iOS 26.4): o JPEG de reserva é
  ~30% maior; se pesar, um codificador WebP em WebAssembly carregado só no Safari (jSquash) entra na
  rodada 2.
- HEIC colado no Chrome do computador não decodifica: aviso "Esse formato não abre aqui; salve como JPG".
- Colar imagem no iPhone (o `paste` com arquivo) e no Android: conferir na rodada 0, num aparelho de
  verdade.
- O uso real de hoje do Worker: se já estiver perto dos 70%, a visita sem login pede o domínio próprio
  ou mais freio antes da rodada 4.

## Fontes

- Limites do D1: https://developers.cloudflare.com/d1/platform/limits/
- Preços e limites diários do D1: https://developers.cloudflare.com/d1/platform/pricing/
- Limites dos Workers: https://developers.cloudflare.com/workers/platform/limits/
- Limites do KV: https://developers.cloudflare.com/kv/platform/limits/
- Preços do R2: https://developers.cloudflare.com/r2/pricing/
- Começar no R2 (a assinatura): https://developers.cloudflare.com/r2/get-started/
- Cache API (domínio próprio): https://developers.cloudflare.com/workers/runtime-apis/cache/
- Escopos do Google Drive: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- WebP no canvas do Safari: https://caniuse.com/mdn-api_offscreencanvas_converttoblob_option_type_parameter_webp
