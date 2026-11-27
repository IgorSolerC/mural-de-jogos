# Pastas customizadas

Pedido do dono em 27/nov/2026: no botão direito de uma pasta, **Customizar**, que abre uma folha para trocar o
nome, a cor e o enfeite da pasta, e escolher a vista padrão das anotações de dentro (sem escolher, a do grupo).
A pasta customizada aparece igual para quem visita o mural público e para quem divide um grupo compartilhado.

Os enfeites foram escolhidos no protótipo `prototipos/pastas-customizadas.html` (quatro levas, fotos em
`.angular/pptr/pastas-cust.mjs`). Impeccable no começo (este plano) e no fim (crítica); `/code-review medium` ao
fim de cada rodada, antes da seguinte; `/code-review high` no fim.

## 1. O que entra

### 1.1 As cores (11)

Papel de pasta de arquivo, sem neon. Cada cor tem a frente, o fundo (um tom mais escuro, como a manilha de hoje) e
o que os detalhes usam, tirado dela, sempre com contraste (aprovado na 3ª leva: "detalhe de cor fixa some"):

| id | frente | fundo | --fio (linha de outra cor) | estrela | cantoneira |
|---|---|---|---|---|---|
| `manilha` (a de hoje, sem cor) | #d6c391 | #bea873 | #8f3a1e | vermelha | bronze |
| `kraft` | #c09a72 | #a27d58 | #22385e | ouro | cobre |
| `vermelho` | #e5a092 | #c98273 | #6a1d18 | ouro | ouro rosé |
| `laranja` | #ebb487 | #cf9569 | #5c2d0d | azul | bronze |
| `amarelo` | #ecd27a | #d0b55c | #24476b | azul | ferro |
| `verde` | #a9cf9f | #8bb281 | #27502a | ouro | cobre |
| `azul` | #9fc7e3 | #80a8c5 | #874610 | ouro | prata |
| `lilas` | #c6b4e6 | #a895c8 | #452676 | prata | prata |
| `rosa` | #ebafc3 | #ce90a5 | #7c1c41 | prata | ouro rosé |
| `cinza` | #c5bfb6 | #a8a198 | #932f25 | vermelha | ferro |
| `grafite` | #4b4541 | #35302d | #dcae4c | ouro | dourado |

Derivados de cada cor, em CSS: `--tom` (o papel puxado para o marrom, o da costura do Pontilhado), `--forte` (o
próprio matiz bem mais fundo; na grafite, mais claro), `--sutil` (meio caminho do papel ao `--forte`: as linhas do
22, 25 e 26), `--faixa` (o papel mais fundo e mais vivo: o 2), `--pano` e `--fio-pano` (o 19). A grafite escreve
em branco. As estrelas usam o laminado das estrelinhas das cartolinas (`FOIL` de core/decor-art.ts).

### 1.2 Os enfeites (14 + adesivos), um por pasta

Com os números do protótipo, que ficam nos ids só como referência do plano:

| nº | id | o quê |
|---|---|---|
| 1 | `costura` | Pontilhado: costura em volta da frente e na aba |
| 2 | `faixas` | Duas faixas na boca, na `--faixa` |
| 3 | `canto` | Faixa no canto, dobrada, no `--fio` |
| 6 | `cantoneiras` | Cantos de metal com rebite, o metal da cor |
| 8 | `xadrez` | Vichy impresso, do `--tom` |
| 9 | `etiqueta` | O nome numa etiqueta branca, com o fio de cor |
| 13 | `estrelas` | Três estrelinhas laminadas da cor que combina |
| 16 | `bolinhas` | Poá impresso, do `--tom` |
| 19 | `lombada` | A beirada encapada de pano |
| 21 | `pesponto` | Costura dupla do `--fio`, na frente e na aba |
| 22 | `gravado` | Moldura dupla gravada, no `--sutil` |
| 25 | `meia-lua` | O recorte de puxar, com a costura no `--sutil` |
| 26 | `picotada` | A boca picotada, com a costura no `--sutil` |
| 27 | `orelha` | O canto de cima dobrado, o avesso do papel |
| — | `adesivos` | De 1 a 3 adesivos de vinil (os das cartolinas) |

Os adesivos são os 12 de core/decor-art.ts: os fofos (`coracao`, `carinha`, `arcoiris`, `raio`, `nuvem`,
`gatinho`) e os gamer (`controle`, `cogumelo`, `fantasma`, `estrela`, `dado`, `cartucho`), com a borda branca do
corte, a sombra e o brilho. Cada um tem o seu lugar pela ordem (o 1º no canto de cima à direita, meio para fora da
boca; o 2º e o 3º descendo pela direita), torto pelo id da pasta (o mesmo em todo aparelho).

**Por que um enfeite só:** a pasta tem 128 a 160px; dois enfeites brigam (dito na 1ª leva, aprovado).

### 1.3 A vista das anotações de dentro

`completa` (Comuns), `inteira`, `simples` (Visão geral), `lista`. Sem escolha: a do grupo, como hoje. **Do mesmo
jeito que a vista do grupo:** com a pasta aberta, trocar a vista na régua vale só enquanto ela está aberta (o
`passingDensity` de core/wall-view.ts). A pasta de dentro sem vista usa a do grupo (o pedido), não a da pasta de
cima. Na Wishlist e na galeria de pixel arts, a mesma etiqueta com as vistas delas (Recortes ou Grade; Mostra ou
Grade), e sem escolha, a do mural.

## 2. Os dados

`NoteFolder.look?: FolderLook`, só com o que foi escolhido (a pasta de sempre não ganha nada):

```ts
interface FolderLook {
  color?: FolderColor;        // sem: manilha
  decor?: FolderDecor;        // sem: nenhum
  stickers?: FolderSticker[]; // só com decor 'adesivos'; 1 a 3, sem repetir
  view?: string;              // conferida contra as vistas do grupo dela (notas, Wishlist, pixel)
}
```

- **Catálogo e saneamento** em `core/folder-looks.ts` (puro, sem Angular): as listas, `sanitizeFolderLook`
  (o que não conhece sai; `look` vazio some), `withFolderLook`. `sanitizeFolders` passa a guardar `look`.
- **O nome** continua em `NoteFolder.name`; a folha renomeia por `NoteFolders.rename` (a regra de sempre).
- **Gravar:** `NoteFolders.customize(id, { name?, look })`, pelo `save` de sempre (as suas vão para as
  configurações; as de um grupo compartilhado, para o documento dele), devolvendo o Desfazer campo a campo (só volta
  o que ninguém mudou no meio). Quem pode: as pastas de `movable` (as suas e as dos grupos em que você escreve).

### 2.1 Sincronização (o pedido pede cuidado aqui)

- **Seu mural, entre aparelhos:** as configurações já se juntam por `mergeJson` (campo a campo dentro de cada pasta,
  pelo id): um aparelho troca a cor e outro o enfeite, ficam os dois. Teste em cloud-sync-merge.spec.
- **Grupo compartilhado:** hoje `mergeFolders` fica com a pasta inteira de um lado quando os dois mexeram nela (uma
  pessoa renomeia e outra troca a cor: uma das duas se perde). Passa a juntar por `mergeJson` (campo a campo; com
  briga no mesmo campo, vale o daqui, como hoje). Teste em shared-groups.spec com duas pessoas ao mesmo tempo.
- **Site velho:** o saneamento de uma build de antes jogaria o `look` fora ao regravar. No seu mural, a trava de
  build (core/newer-build.ts) já recarrega o site velho antes de gravar; não precisa de SYNC_SCHEMA novo. No
  documento de um grupo, o site velho de outra pessoa só regrava as pastas quando ela mexe numa pasta; o risco é a
  janela até a aba dela recarregar (registrado, sem conserto novo: o mesmo de todo campo novo do documento).
- **Mural público:** `publicFolders` leva o `look` (cor, enfeite, adesivos, vista) só das pastas que já vão; sobe
  `PUBLIC_RULES` para 8 (cada aparelho reenvia o público uma vez). A visita lê pelo `sanitizeFolders` de sempre.
- **Backup:** vai junto (`sanitizeFolders`).
- **API e MCP:** o contexto manda só id, nome e a de cima; o visual não entra (nada muda no contrato).
- **Navegador:** nada novo guardado (a vista trocada na régua é um sinal na memória). Logout não muda.

## 3. O desenho na pasta (rodada 2)

- `ui/folder-card.ts` lê `folder().look`: `data-cor`, `data-enfeite` no host e, para o que é desenho (as estrelas,
  a costura da meia-lua, os adesivos), um pedaço SVG montado em `core/folder-art.ts` com o que já existe em
  core/decor-art.ts (`FOIL`, `star`, `mix`, os adesivos `PUFFY` e `GAMER`, exportados sem mudar: aparência
  congelada das cartolinas, conferida pelos testes de frozen-looks).
- O CSS dos enfeites e das cores mora em `ui/_pasta-enfeites.scss` (vindo do protótipo), usado só pelo folder-card.
  A pasta de sempre (manilha sem enfeite) fica **idêntica**: teste que compara o CSS computado.
- O enfeite mora na frente (abre com ela). O nome ganha folga só onde o enfeite pede (`--nome-dir`), a conta não.
- A mesma peça na parede das Anotações, da Wishlist, da galeria e na visita (regra "Visita: as mesmas peças").

## 4. A folha Customizar (rodada 3)

- **Onde:** no menu da pasta (botão direito ou toque longo) dos três murais, logo depois de Renomear:
  **Customizar…** (ícone `Palette`/pincel). Só nas pastas de `movable`; nunca na visita nem em grupo só de ler.
- **Como é:** a folha do recorte da Wishlist e da pixel art (`wish-adder.scss`, o mesmo arquivo), com a faixa de
  cima em papel manilha com a orelha de pasta ("Customizar pasta"). Na mesa à esquerda, a pasta ao vivo, no tamanho
  da parede, com as anotações de dentro espiando ("Na parede"). Nos campos: **Nome** (com o aviso de irmã com o
  mesmo nome, e o Salvar parado enquanto houver) e a fileira de etiquetas do editor (`_props-editor.scss`):
  **Cor**, **Enfeite**, **Vista** (rodada 4). Cada etiqueta abre a parte dela embaixo, com Pronto.
  - Cor: as 11 em miniatura (a frente de pasta pequena), a escolhida levantada com o anel de tinta.
  - Enfeite: uma grade com cada enfeite desenhado na cor escolhida (como os jeitos da pixel art); "Nenhum" primeiro.
    Escolhendo Adesivos, a cartela dos 12 embaixo, marcando até 3 (a ordem é a da escolha).
- **Salvar** grava só o que mudou, com Desfazer no bilhete; fechar com algo mudado pergunta antes (como a pixel
  art). Ctrl+S salva (`SaveKey`). No celular, a mesa sobe para cima dos campos, como na Wishlist.
- Teclado: tudo por Tab; as grades com setas e Enter; foco volta à pasta ao fechar.

## 5. A vista padrão (rodada 4)

- `FolderLook.view` e a etiqueta **Vista** na folha ("Como o grupo · Comuns" primeiro, depois as quatro).
- Notas: `WallState.density` passa a olhar a pasta aberta antes do grupo; a trocada na régua com a pasta aberta vale
  enquanto ela está aberta (o mesmo `passingDensity`, com a chave da pasta). Sair da pasta volta à do grupo.
- Wishlist e galeria: o mesmo, com as vistas delas (a escolhida no aparelho continua a de fora das pastas).
- Visita: a vista da pasta vale (a mesma `WallState`).

## 6. Rodadas

Cada uma: Impeccable no que é de tela (craft-floor antes de editar), testes novos, suíte inteira, build de produção,
fotos 2x no computador e no celular, `/code-review medium` e os consertos, BUILD +1, Novidades (1.59.0, uma entrada
que cresce), commit em nome do dono, push.

1. **Os dados:** `core/folder-looks.ts`, `look` em `sanitizeFolders`, `NoteFolders.customize` com o Desfazer,
   `mergeFolders` campo a campo, `publicFolders` com o visual e `PUBLIC_RULES` 8. Só testes, nada na tela.
2. **O desenho:** `_pasta-enfeites.scss`, `core/folder-art.ts`, o folder-card lendo o `look`. Fotos de cada enfeite
   em cada cor; a pasta de sempre idêntica.
3. **A folha Customizar:** `ui/folder-sheet.*`, o Customizar nos três menus, Nome, Cor, Enfeite e Adesivos.
4. **A vista padrão:** a etiqueta Vista e a vista da pasta nos três murais e na visita.
5. **Fechamento:** crítica do Impeccable da entrega inteira, `/code-review high` e consertos, DESIGN.md
   ("Pastas customizadas"), Novidades, memória.

## 7. Fica de fora (de propósito)

- A cor no caminho (breadcrumb), no Escolher a pasta e no filtro "Onde": não foi pedido; fica como sugestão.
- As mini-pastas dos templates do texto (não são o card de pasta).
- Dois enfeites na mesma pasta (os adesivos, desde a seção 9, não contam: são uma camada à parte).

## 8. Andamento

- [x] Rodada 1 (b27e6ac0, BUILD 1107): os dados e a sincronização.
- [x] Rodada 2 (8f13f549, BUILD 1108): o desenho na pasta.
- [x] Rodada 3 (79f9083d, BUILD 1109): a folha Customizar.
- [x] Rodada 4 (0b3f236f, BUILD 1110): a vista padrão.
- [x] Rodada 5 (BUILD 1111): a crítica do Impeccable (32/40) e o /code-review high, consertados; DESIGN.md.
- [x] Rodada 6 (BUILD 1112): os adesivos junto de qualquer enfeite (seção 9).

## 9. Adesivos junto do enfeite (27/nov, depois da entrega)

Pedido do dono: "poder usar os adesivos E também as customizações da pasta; hoje é um ou outro". Os adesivos deixam
de ser um dos enfeites e viram uma camada à parte: a pasta tem uma cor, um enfeite (ou nenhum) e de 0 a 3 adesivos.

1. **Os dados:** `FOLDER_DECORS` fica com os 14; `FolderLook.stickers` vale sozinho (sem o enfeite `adesivos`).
   O guardado antes (`decor: 'adesivos'` com os adesivos) vira só os adesivos, no saneamento (sem migração: quem
   lê saneia). Na junção campo a campo, o enfeite e os adesivos são campos diferentes: uma pessoa troca o enfeite e
   a outra cola um adesivo, ficam os dois.
2. **O desenho:** os adesivos numa camada própria por cima da frente (`.adesivos`, irmã dela, que abre junto com o
   mouse), fora das máscaras da Meia-lua e do Canto dobrado; o enfeite continua igual. Ajustes do dono vendo as
   fotos: os adesivos **nunca saem da frente** (os lugares deles ficaram todos dentro, com folga para o torto); a fita
   da Faixa no canto e a ponta do Canto dobrado ficam **por cima** dos adesivos (`.por-cima`); nos outros enfeites,
   os adesivos por cima. Com Estrelinhas, as estrelas descem para o canto de baixo.
3. **A folha:** a etiqueta Adesivos ao lado de Cor e Enfeite (Cor · Enfeite · Adesivos · Vista), abrindo a cartela
   dos doze; o Enfeite perde a opção Adesivos. Nenhum adesivo é o normal (não trava mais o Salvar). Salvar grava o
   enfeite e os adesivos cada um por si, por cima do visual de agora.

Fechamento: crítica do Impeccable, `/code-review high`, DESIGN.md, Novidades (ajustes de hoje), BUILD +1.
