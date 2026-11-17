# Plano: a folha de conflito, refeita (16/nov/2026)

Pedido do dono: a tela de resolver conflito (a mesma conta em dois aparelhos, ou uma anotação
compartilhada) "não é incrível". Os ajustes (tags, pastas, configurações) aparecem de um jeito que
ninguém entende, o texto aparece cru (markdown), e não é claro para onde ir para resolver um conflito
nas configurações. A pessoa não sabe o que é markdown: tudo visual, e a diferença entre as duas
versões tem que saltar aos olhos.

## O que estava errado (crítica das fotos de antes)

1. O texto cru: "- [ ] arroz", "> [!aviso] Lembrar". A anotação não parece a anotação.
2. A linha inteira marcada quando mudou uma palavra; "3 linhas iguais" no lugar do texto.
3. Nos ajustes, as linhas são o JSON achatado ("Grupo › casa › view: lista", `{"id":…}`), todas as
   linhas e não só as diferentes, sem dizer onde aquilo mora no site.
4. Os botões "Manter esta" ficam embaixo da dobra (no computador e no celular).
5. No celular a segunda versão fica a uma tela inteira da primeira: não dá para comparar.
6. O conflito de um ajuste: o bilhete leva a Ajustes › Conta, onde a lista fica no meio da conta,
   e some quando o bilhete some. Nada no site lembra que há algo esperando.
7. Vários conflitos: cada um fecha a folha, e a pessoa volta à lista para abrir o próximo.
8. Na compartilhada, se outra pessoa escolhe enquanto a folha está aberta, a folha fica vazia.
9. Palavras de programador: "Conflito de sincronização", "Estado", "versão `a`".

## A direção

A mesma ficha de fichário (a folha de sempre, com a tachinha), com outra estrutura: uma **comparação
lado a lado, linha a linha, só do que difere**. Cada linha é uma coisa que mudou ("Tags", "Finalizada",
"Cor do grupo Casa", "Texto"), com o valor de cada versão desenhado como ele aparece no site (a
etiqueta da tag, a amostra da cor, o desenho do ícone, o interruptor ligado/desligado, a anotação
formatada). O que só uma versão tem leva a marca-texto amarela de sempre; no texto, a linha que mudou
ganha a faixa na margem e as palavras que mudaram, a marca-texto.

- **Computador:** duas colunas (uma por versão), a linha do que mudou em cima das duas.
- **Celular:** as duas versões nas orelhas de pasta manilha ("Este aparelho" / "Outro aparelho"),
  uma por vez no mesmo lugar: trocar de orelha faz a diferença piscar no mesmo ponto da tela.
- **A escolha sempre à vista:** o pé da folha (fixo) tem "Ficar com esta" debaixo de cada coluna (no
  celular, o da orelha aberta) e "Decidir depois".
- **Frases de gente:** "Qual versão fica?", "Você mudou esta anotação no computador e no celular ao
  mesmo tempo. O resto já se juntou sozinho; só isto ficou diferente."

## Rodadas (uma por vez, cada uma com /code-review mid antes da próxima)

### Rodada 1: as diferenças em palavras e desenhos (`ui/conflict-rows.ts`)

Funções puras que, das duas versões, tiram só as linhas que diferem, já nas palavras e nos valores
da tela (`ConflictRow { id, label, icon, where?, a: Cell, b: Cell }`, `Cell` tipada: texto, tags,
cor, ícone, ligado/desligado, lista, segredo, nada, a anotação).

- **Fichas** (conta e compartilhadas): título, capa, finalizada, tags, grupo, pasta, quem vê, papel
  (a cartolina), data, nota, lugar no mural, texto.
- **Configurações do mural:** cada campo de `NotesConfig` com as palavras da folha Configurações
  (Padrões, Grupos, Pastas, Tags): como nasce a anotação, ordem dos grupos, abas em pé, esconder
  vazios, tema do código, por grupo (como nasce, perguntar tag, escondido, só no Kanban, vista,
  ordem, mostrar também), pastas por id (nome, lugar, desfeita), templates por id, tags escondidas,
  cores das abas e das tags da Wishlist. As tabelas de palavras saem de `ui/mural-config.ts` para um
  módulo pequeno que os dois usam (sem copiar).
- **Ícone e cor dos grupos/tags:** uma linha por grupo ou tag que difere, com o desenho e a cor.
- **Tags fixas:** as etiquetas, com as que só uma tem marcadas.
- **Chaves:** só o fim (••••abcd), como antes.
- **Perfil:** emoji, cartolina da foto, frase, sobre (formatado), assuntos, fundo, moldura, parede,
  pastas dos murais, seções (por id).
- **Quadro Kanban:** colunas por id (nome, cor, desenho, finaliza, ordem, card padrão, pula) e cada
  anotação (coluna, importância, status, só no Kanban, dependências).
- O que não tem palavra conhecida cai numa linha "Outros detalhes" com o texto legível (nunca JSON).

Testes: conflict-rows.spec (cada tipo, só o que difere, ordem estável, nada de `{` nas palavras).

### Rodada 2: a folha nova (`ui/conflict-sheet.*`)

- Cabeçalho: "Qual versão fica?" e o nome do que está em conflito; a frase de quem mudou, quando, e
  onde aquilo mora no site ("Fica em Anotações › Configurações › Pastas").
- A comparação por linhas da rodada 1, com as peças do site: `NoteTag` nas tags, a amostra de
  cartolina, `lucide-icon` nos desenhos, o carimbo de finalizada/apagada.
- O texto: `RichText` de verdade (a anotação formatada), com `anchors` para achar as linhas; a
  diretiva `MarkChanges` põe a faixa nas linhas que mudaram e marca as palavras com a Highlight API
  do CSS (sem mexer no DOM do Angular). Rola sozinho até a primeira diferença.
- Celular: as orelhas de pasta manilha (padrão do site) trocam a versão à mostra.
- Pé fixo com a escolha. A versão apagada continua com o carimbo.
- A escolha chama o mesmo `SyncConflicts.resolve` / `SharedStore.resolve` de hoje: a junção e a
  sincronização não mudam.

Testes: a folha com as linhas, o texto formatado sem marcas cruas, as marcas no lugar, as orelhas,
a escolha de cada lado (conta e compartilhada), a apagada.

### Rodada 3: achar e resolver de qualquer lugar

- **Uma fila só** (`ConflictQueue`, core): os conflitos da conta que esperam e os das
  compartilhadas em que você escreve, os mais novos primeiro.
- **A folha abre por cima de qualquer página** (um host em app.ts): o bilhete "Resolver" de um ajuste
  ou quadro abre a folha ali mesmo (não leva mais a Ajustes); o de uma ficha continua abrindo a ficha.
- **Depois de escolher**, se há mais: "Pronto. Falta 1" e a próxima abre na mesma folha ("2 de 3"),
  sem voltar à lista.
- **O selo no botton de Ajustes** (o mesmo selo do de Amigos), com quantos esperam: tocar abre a fila.
- **Ajustes › Conta:** a lista mostra o que mudou em cada um ("o texto e as tags") e inclui as
  compartilhadas.
- **Escolheram por você** (outra pessoa, outro aparelho) com a folha aberta: ela passa para a
  próxima ou fecha com o bilhete que já existe; nunca fica vazia.

Testes: a fila (conta + compartilhadas, só quem escreve), o selo, o bilhete que abre a folha, a
próxima depois de escolher, a folha que fecha quando escolheram em outro lugar.

## Fechamento

Crítica final do Impeccable (fotos 2x no computador e no celular, de ficha, ajuste, Kanban,
compartilhada e apagada), /code-review high, suíte inteira, testes de regra, `npx ng build`, smoke
da build de produção, DESIGN.md, Novidades (NOVIDADES.md), BUILD, commit e push por rodada.
