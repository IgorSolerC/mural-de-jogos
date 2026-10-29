# Plano: imagens coladas nas anotações, sem link

Pedido do usuário (28/out/2026): "Atualmente o sistema não armazena arquivos de forma nenhuma, apenas
texto. Para vincular em uma nota uma imagem (por meio de um widget) é necessário utilizar um URL [...]
Quero planejar a possibilidade de permitir que usuários anexem imagens apenas colando a imagem no
painel de descrição de notas. Quero que o sistema continue completamente gratuito de desenvolver e
hostear (talvez diminuindo a resolução das imagens?) [...] Faça isso de forma inteligente para não
estrapolar os usos do cloudflare e google api."

Este arquivo é o plano inteiro, escrito para ser lido também por outras AIs (como o PLANO-API.md). As
decisões do usuário estão na seção 8 (todas tomadas em 28/out). O andamento fica na seção 10.

---

## 0. Resumo em uma página

- **Colar e pronto.** A pessoa cola (ou arrasta, ou escolhe do aparelho) uma imagem na descrição. O site
  encolhe a imagem **no próprio aparelho** (lado maior de **900 px**, WebP, uns 40–120 KB; tira o GPS e
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
- **Travas.** Teto de 200 KB e 900 px por imagem (conferidos pela nuvem nos próprios bytes), cota por pessoa (25 MB, umas 300 imagens), 30 envios por dia,
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
   aplicada → canvas com o lado maior em **900 px** (nunca aumenta) → `toBlob('image/webp', 0.8)`.
   Passou de 120 KB: qualidade 0,7, depois 0,6, depois 720 px. O Safari não gera WebP no canvas
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

- `PUT /v1/imagens/:id` (sessão; o corpo são os bytes): confere o id (22 letras), o teto (200 KB,
  `413 imagem-grande`), o tipo e o tamanho lendo o cabeçalho dos bytes (`RIFF….WEBP`, `FF D8 FF`,
  `89 PNG`; outro é `415 imagem-tipo`; mais de 900 px no lado maior, `413`), a cota da pessoa
  (`403 cota-imagens`), os envios do dia (`429`, na tabela `freios`) e a global (`507 imagens-cheio`).
  Grava os dados primeiro (com as cotas conferidas no mesmo lote) e os bytes depois; se o banco dos bytes recusar, os dados saem (feito: ver seção 10). Repetir o mesmo id do
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
| Espaço | 500 MB por banco; cota global a 80% = 400 MB; ~40–120 KB por imagem → **3.400 a 10.000 imagens** no primeiro banco | Cada banco novo soma outro tanto (o `banco` já existe na tabela); a conta dá 5 GB somando todos. |
| Por pessoa | 25 MB ≈ 210 a 640 imagens (umas 300) | Ajustável no `wrangler.toml` (`IMAGENS_MB_PESSOA`). |
| Pedidos ao Worker | Enviar: 1. Ver: 1 por imagem por aparelho, uma vez na vida (logado) ou a cada 7 dias (visita) | Um mural público com 30 imagens visto por 200 pessoas num dia gasta no máximo 6 mil dos 100 mil, e só as que rolarem até a tela (lazy). |
| Linhas gravadas | Por envio: os dados e os índices, os bytes, o freio, as duas contas, a marca de pronta: ~10, contadas na `COTA_LINHAS_DIA` | 30 envios por pessoa por dia = 300 linhas; nada perto de 60 mil. |
| Linhas lidas | Por imagem vista: os dados com a conferência de quem vê (1–3) + os bytes (1) | 5 milhões por dia. |
| CPU | Ler até 200 KB do corpo e gravar, ou ler e devolver: só cópia e o cabeçalho, sem decodificar | O mural (até 1,9 MB) já passa pelo mesmo caminho todo dia; medir com `wrangler tail` (campo `cpuTime`) quando o site mandar (rodada 3). |
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
| 200 KB e 900 px por imagem | API, lendo os bytes (o site já manda menor) | `413 imagem-grande`; o site encolhe mais e tenta de novo. |
| 25 MB por pessoa | API (`IMAGENS_MB_PESSOA`) | `403 cota-imagens`; a imagem fica no aparelho, com o aviso e o caminho para Ajustes › Imagens. |
| 30 envios por pessoa por dia | `freios` | `429`; a fila tenta no dia seguinte, a imagem aparece neste aparelho. |
| 400 MB no banco | API (`IMAGENS_MB_TOTAL`) | `507 imagens-cheio`; idem, e a checagem diária já tinha avisado a 70%. |
| Visitas por IP | na memória, como o `catalogBrake` (300 por minuto) | `429` para aquele IP; o resto segue. |
| `MODO` | `wrangler.toml` | `so-leitura`/`desligado` param os envios, como o mural. |
| Checagem diária | `scripts/saude.ts` | Mostra quanto as imagens guardam e quanto falta para a cota (pelo `/v1/status`) e o tamanho do `mural-imagens`; falha (e-mail) a 70% de um ou de outro. |

## 7. O que fica de fora (de propósito)

- Vídeo, PDF e outros arquivos: só imagem.
- Editar a imagem (recortar, girar) no site.
- Mandar imagem pela API das AIs e pelo MCP (a leitura entra na rodada 6).
- Imagem nas resenhas e nos comentários: só nas anotações e nos lugares que já aceitam widget,
  primeiro. Os outros podem vir depois sem mudar a nuvem.
- Galeria de todas as imagens.

## 8. Decisões

Tomadas em 28/out/2026: a D1 pelo usuário ("Diminua para 900px o maior lado"), as outras como recomendado.

| # | Pergunta | Decidido | Outras |
| --- | --- | --- | --- |
| D1 | Tamanho da imagem guardada | **900 px no lado maior, ~40–120 KB, teto de 200 KB** (pedido do usuário) | 1600 px (a recomendação de antes, ~150–250 KB); 2048 px |
| D2 | Cota por pessoa | **25 MB e 30 envios por dia** | 10 MB; 50 MB |
| D3 | Quem vê a imagem privada | **Só o dono e quem está na compartilhada que a usa**; colar o texto de outra pessoa copia a imagem como sua | Qualquer um com o endereço (mais simples, mas o endereço vazado continua abrindo) |
| D4 | GIF animado | **Vira a primeira imagem, parada** | Recusar; guardar como veio se couber em 200 KB (sem encolher) |
| D5 | Backup das imagens | **Uma vez por semana no Actions, com senha**, mais o Time Travel de 7 dias | Só o Time Travel |
| D6 | Imagem que nenhuma anotação usa | **Apagada 30 dias depois** | 7 dias; nunca (até a pessoa apagar em Ajustes) |
| D7 | Domínio próprio para as imagens (`img.murall.igorsc.com.br`) | **Não agora** (não muda a conta dos pedidos) | Sim, junto da rodada 4 |
| D8 | Sem conta | **As imagens ficam só no aparelho** (e no backup baixado), como o resto do mural de ninguém | — |

## 9. Rodadas

Um commit por passo, como no PLANO-API (cada um com a BUILD e, quando aparece para a pessoa, as
Novidades).

0. **Medir.** O uso de ontem e hoje pela checagem diária (pedidos ao Worker, tamanho do banco
   principal), para confirmar a folga da seção 4. Um Worker de teste com `PUT`/`GET` de 200 KB num D1 de
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

- 28/out/2026: plano escrito.
- 28/out/2026, rodada 0 (medir): a checagem diária de 27/out deu 5.610 pedidos ao Worker (5,6% dos 100
  mil), 1.485 linhas gravadas (1,5%), 57.590 lidas (1,2%), e o banco `mural` com 2,1 MB de 500. Folga
  de sobra para as contas da seção 4. O Worker de teste e o colar nos aparelhos ficaram para quando o
  site mandar de verdade (rodada 3), onde a medida vale mais.
- 28/out/2026, rodada 1 (a nuvem): banco `mural-imagens` criado (40d84093-…, região ENAM), migrações
  `0020_imagens.sql` e `migrations-imagens/0001_bytes.sql`, `api/src/domain/image.ts` (o tipo e o
  tamanho lidos do cabeçalho do WebP, do JPEG e do PNG; o teto e os 900 px conferidos pela nuvem),
  `api/src/routes/images.ts` (PUT, GET, DELETE e `/v1/eu/imagens`), as cotas dentro do lote, o freio do
  dia em `freios` (`imagem`), o freio por IP na memória, os dados que saem se o banco dos bytes recusar,
  a conta que sai leva as imagens, a limpeza diária termina os envios no meio e reconta `imagens_uso`,
  `/v1/status` com `imagens`, e a checagem diária com a linha das imagens e o tamanho do `mural-imagens`
  (só o banco: os pedidos do Worker não contam duas vezes). Mudou do desenho: os dados vão antes dos
  bytes (um id só existe no banco dos bytes depois de existir em `imagens`), há a coluna `pronta` e a
  tabela `imagens_uso` (a cota sem somar a tabela inteira); `nota_imagens` fica para a rodada 4.
  Próximo: rodada 2 (no aparelho, sem nuvem).
- 28/out/2026, rodada 2 (no aparelho): `src/app/core/images.ts` (o endereço `murall://imagem/ID`, o id
  sorteado, o encolher em 900 px: WebP 0,8 → 0,7 → 0,6 → 720 px → 560 px até 120 KB, nunca mais de 200
  KB; JPEG com fundo branco onde o canvas não gera WebP; o original acima de 40 MB nem abre) e
  `src/app/core/image-store.ts` (o IndexedDB `meu-mural:imagens`, a mesma imagem pelo SHA-256 reaproveita
  o id, o endereço `blob:` da aba, `unsent`, o backup). Colar (sem texto junto: as células de planilha
  trazem a foto delas) e soltar no texto viram a linha do widget; a folha da Imagem ganhou "Escolher do
  aparelho" e, com a guardada, a fotinho, o tamanho, Trocar e Usar um link; colar no campo do link também
  serve. A foto colada mostra a guardada, ou "A imagem ainda não chegou a este aparelho". A limpeza do
  Sair e o Apagar o save levam o banco; o backup baixado leva as imagens em base64 (só no arquivo, nunca
  no mural da nuvem) e Restaurar as traz de volta. Adiantado da rodada 3: o Sair pergunta antes quando há
  imagens só neste aparelho ("Ainda tem coisa só aqui"), porque até a rodada 3 nenhuma sobe. Ficou para a
  rodada 3: `localHasContent` (o de ninguém indo para a conta com imagens), a fila de envio e o baixar.
  Próximo: rodada 3 (sincronizar).
- 28/out/2026, rodada 3 (sincronizar): `src/app/core/image-sync.ts`. A fila manda as que só estão aqui
  (`PUT`, uma por vez, das mais velhas), logo depois de colar (800 ms) e no fim de cada rodada da
  sincronização, só com a conta dona do mural deste navegador (o de ninguém espera a escolha; o de outra
  conta nunca sobe). Um "não" que não passa logo para a fila: o limite do dia, a cota da conta e a cota de
  gravações por uma hora, a nuvem cheia por seis, as imagens fora do ar por quinze minutos (Sincronizar
  agora e o Sair tentam de novo na hora); o que a nuvem nunca aceita (o tipo, o tamanho, o id de outra
  conta) fica `recusada`, só aqui, sem tentar de novo. A que falta neste aparelho desce com a sessão
  (`GET`, até quatro ao mesmo tempo, o mesmo id uma vez), fica guardada como `na-nuvem`, e a que a nuvem
  não tem só é pedida de novo depois de um minuto (a cada rodada da sincronização). As imagens contam em
  `localHasContent`. O Sair manda antes e pergunta com o porquê curto quando sobra alguma ("sem
  conexão", "chegou ao limite de imagens do dia"). A folha da imagem diz onde ela está ("Guardada na
  nuvem", "Subindo para a nuvem…", "Só neste aparelho (fora da conta)", ou só neste aparelho e por quê).
  Ponta a ponta local (`.angular/pptr/imagens-e2e.mjs`, API no wrangler dev com os dois D1 locais e o
  `ng serve`): o aparelho A cola, a imagem sobe sozinha (PUT 201), o mural sobe com o texto; o B, vazio,
  recebe a anotação, baixa a foto uma vez (GET 200) e não pede de novo ao reabrir. Cada imagem custa, em
  pedidos ao Worker, 2 ao subir e 2 por aparelho ao descer (o `OPTIONS` da sessão no cabeçalho conta).
  Falta medir o `cpuTime` em produção com uma imagem de verdade (`npx wrangler tail mural-api --format
  json`). Próximo: rodada 4 (público e compartilhadas).
- 28/out/2026, rodada 4 (público e compartilhadas): migração 0021 (`imagem_publica`, `nota_imagens`). Quem
  vê é conferido na entrega (`imageAccess` em `api/src/domain/image.ts`), sem limpeza quando algo muda: a
  pública, se alguém a mostra e pode mostrar (o dono, ou quem está numa compartilhada que a usa); a
  privada, o dono e quem está numa compartilhada que a usa. O envio do mural leva a parte `imagens` (os
  ids que o site acha no próprio mural público); só o que mudou é gravado e contado na cota (a lista de
  antes é lida). As compartilhadas anotam as imagens do texto (e da versão em conflito) ao gravar; apagar
  a anotação, a imagem ou a conta tira as linhas. A entrega com sessão diz `Imagem-Sua`, e o site guarda
  a de outra pessoa como `alheia` (fora do backup e da contagem do mural de ninguém). Quem visita sem
  conta vê a pública por um `<img>` direto na nuvem (sem sessão, sem pré-consulta do CORS, sem guardar
  nada; o navegador guarda 7 dias), e a que não está à mostra diz "Esta imagem não está à mostra".
  Mudou do desenho: a coluna `imagens.publica` ficou sem uso, e o `Clear-Site-Data` saiu: com conta, as
  imagens passam pelo IndexedDB (que a limpeza do Sair leva) e a entrega com sessão é `no-store`; só a
  visita sem conta usa o cache do navegador, e o que está lá é público e de ninguém. Ponta a ponta local:
  a anotação pública abre a imagem sem sessão e o link da ficha, sem conta, mostra a foto (GET 200, sem
  OPTIONS) sem guardar nada. Próximo: rodada 5 (limpeza e Ajustes).
- 28/out/2026, rodada 5 (limpeza e Ajustes): a parte `imagens` do envio do mural ganhou `usadas` (os ids
  de todo o privado e do público: as fichas, as versões guardadas, os conflitos, o perfil). As imagens do
  dono fora dela e de toda compartilhada, subidas há mais de um dia, ficam soltas; de volta à lista, não.
  A limpeza diária apaga as soltas há mais de 30 dias que nenhuma compartilhada usa (os bytes antes). A
  resposta do envio diz `imagensFaltam`, e o site que ainda tem a imagem a manda de novo (o aparelho que
  ficou mais de 30 dias fora com uma nota usando ela). Ajustes › Imagens: o cartão com quanto ocupa e
  quanto falta (na conta, ou neste aparelho), a lista das mais novas para as mais velhas com a fotinho
  (só a que está no aparelho: nenhuma é baixada para a lista), onde cada uma é usada (pelo texto das
  fichas daqui), quando a solta sai, e Apagar (pergunta quais fichas ficam sem ela; tira da nuvem e do
  aparelho, e a fila tenta de novo as que esperavam pela cota). O backup semanal do `mural-imagens`
  entrou no `backup.yml` (job `imagens`, domingo, a mesma senha); a exportação do D1 leva os bytes em
  hexadecimal (conferido no banco local). Falta, de rodadas de antes: medir o `cpuTime` em produção.
  Próximo: rodada 6 (as pontas: PDF, cópia, API das AIs).

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
