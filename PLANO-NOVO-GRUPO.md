# Novo grupo pelo "Mais" (21/nov/2026)

Pedido do dono (cartão do Kanban): poder criar um grupo novo pelo "Mais" das abas, no mural de anotações, no
Kanban, nos Flashcards e no Quadro livre. Até aqui um grupo só existia enquanto alguma anotação estava nele.

## Decisões

- **D1. Onde mora o grupo criado:** nas configurações do mural, no que o grupo muda (`CategoryPrefs.name`, o nome
  como foi escrito). Assim ele já vai pela sincronização, pela junção de três vias, pelo renomear e pelo apagar do
  grupo, e sai na limpeza do logout com as configurações. SYNC_SCHEMA 63 (um site da 62 limparia o nome).
- **D2. Quanto tempo ele fica:** até ser apagado (Configurações › Grupos). Com ou sem anotação. O grupo que nasceu
  de uma anotação continua sumindo quando a última sai (nada muda para ele).
- **D3. Onde ele aparece:** em todo lugar que lista os grupos do seu mural: as abas das anotações, os quadros do
  Kanban (vazio), os Flashcards (sem baralho), o Quadro livre (sem quadro), os seletores de grupo (editor, Organizar,
  Editar as marcadas, Copiar baralho, Apagar o grupo), Configurações › Grupos e o contexto da API/MCP (com 0 notas).
  Vazio, segue o "Esconder os grupos vazios" como qualquer grupo: vai para o "Mais", menos quando está aberto.
- **D4. Visita e compartilhados:** a visita não vê o grupo vazio (ele não tem nada à mostra, e o nome é seu). Nada
  muda nos grupos compartilhados: o nome de um compartilhado não se cria de novo (o "Novo grupo" abre ele), e o
  grupo criado vazio não entra na conta dos nomes seus (`ownNames`): um convite para um grupo de mesmo nome que chega
  depois só enche o vazio, sem virar "Nome · Dona".
- **D5. A tela:** a última linha do remendo do "Mais" (ui/tab-more.ts), depois de uma costura: "＋ Novo grupo" a
  lápis. Vira o campo do nome no lugar (Enter ou o tique cria, Esc volta à linha). O nome que já existe avisa
  embaixo, e Enter abre esse grupo. Criado, o remendo fecha e a página abre o grupo novo, com a cor sorteada.
- **D6. O "Mais" sempre à mão:** para o dono, o "Mais" fica em pé mesmo sem aba sobrando (a régua das abas reserva o
  lugar). Sem a fileira de abas (o mural com um grupo só), não há "Mais": o grupo nasce por uma anotação, como antes.

## Partes (uma por vez, cada uma com /code-review mid)

1. **Os dados:** `CategoryPrefs.name`, `madeGroups`, `LabelEdits.createCategory`, as listas de grupos (abas, Kanban,
   seletores, Configurações, API), renomear e apagar, SYNC_SCHEMA. Testes.
2. **A tela:** a linha e o campo no `TabMore`, o "Mais" sempre à mão (`TabFit`), os quatro lugares abrindo o grupo
   novo. Testes.

No fim: Impeccable (crítica e fotos 2x), /code-review high, Novidades, BUILD, build de produção.
