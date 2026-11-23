# Nota nova a partir de um trecho (23/nov/2026)

Pedido do dono (cartão do Kanban, "Opção de criar sub-nota diretamente da visualização de outra nota"): hoje só se
mexe numa anotação pela tela de edição, e abrir o editor faz perder o lugar da leitura. Como o "Citar" que aparece
ao selecionar um trecho, um segundo botão cria uma anotação nova sobre o trecho: o trecho vira link para ela, e uma
folhinha pede só o que importa (o texto no editor visual, as Tags e a Pasta). O título da nova é o trecho.

## Brief (Impeccable, shape)

- **Quem e quando:** o dono, lendo uma anotação comprida (na leitura ou na tela cheia), quer pendurar uma ideia
  num trecho sem sair de onde está. Modo Operate: rápido, sem perder o lugar, sem cerimônia.
- **Sucesso:** selecionar, tocar "Nova nota", escrever duas linhas, Ctrl+Enter. A leitura continua no mesmo
  lugar, e o trecho já é um link que abre a nota nova.
- **Direção:** nada de mundo novo. O botão é um segundo remendo de feltro igual ao "Citar", ao lado dele (cada um
  o seu, com um vão). A folhinha é a ficha de fichário dos diálogos (a do "Template novo", `ui/template-sheet.ts`),
  pequena, pintada na cartolina que a anotação nova vai ter: quem escreve já vê a ficha que vai nascer. Dentro,
  as peças que já existem: o campo do título, a fileira de etiquetas do editor (`ui/_props-editor.scss`) só com
  Pasta e Tags (`app-folder-picker`, `app-tag-picker`) e o `app-rich-editor` (Visual, sem a doca e sem templates).
- **Fora de propósito:** Grupo, Data, Capa, Público/Privado, Kanban, Flashcard. A folha não cresce para virar o
  editor.

## Decisões

- **D1. Onde aparece:** na leitura e na tela cheia de uma anotação do seu mural em que você escreve (a sua, ou a
  compartilhada em que você é dono, gestor ou editor), também na segunda anotação aberta ao lado. Não aparece na
  visita, no link solto (`#/ficha/...`), em "só a cartolina", nas resenhas, com o texto escondido (Evitar
  spoilers), para quem só lê, nem para o Leitor de uma compartilhada. O "Citar" continua como era (só na leitura de
  sempre).
- **D2. Que trecho vale:** um trecho de uma linha só do texto, que a leitura mostra como texto comum: fora de link,
  código, widget, tabela e spoiler ainda coberto; o título de um card e o spoiler revelado valem (os dois desenham
  links). De 1 a 200 letras (o título de uma anotação), sem colchetes nem "|"
  (não caberia num link). E ele precisa estar escrito igual no texto (um trecho que pega o meio de um negrito, por
  exemplo, não está). Sem isso, o remendo não aparece; o "Citar", sim. Com o trecho repetido na linha, vale o que
  foi selecionado (a mesma ordem na linha desenhada e na escrita; na dúvida, não aparece).
- **D3. O botão:** "Nova nota" (o ícone da nota nova do Kanban), um remendo de feltro igual ao "Citar", logo
  depois dele, com um vão. Os dois brotam juntos no fim do trecho e nunca passam da borda da ficha.
- **D4. A folhinha:** a ficha de fichário pequena (até ~620px de largura), na cartolina sorteada para a nova
  (`ReviewStore.nextStock`), com "Nova anotação" e, embaixo, o trecho de onde ela sai. Campos: Título (o trecho,
  dá para trocar), a fileira Pasta e Tags (a Pasta começa na da anotação de onde veio, como o link do editor), e o
  texto. Pé: "Cancelar" e "Criar e ligar". Ctrl+Enter cria; Esc com algo escrito avisa antes; tocar fora só fecha
  sem nada escrito (como a do template). No celular, ela ocupa a tela.
- **D5. Criar:** a anotação nasce pelo mesmo caminho do link do editor (`linkedNote`, `core/note-links.ts`): no
  grupo da anotação de onde veio, como o mural manda (Disponível em vez de Publicar, para não ir ao Feed vazia), e
  privada e só sua quando a de origem é compartilhada (a regra dos links de hoje). Num grupo compartilhado, o grupo
  é o dela, e ela vai para o grupo como toda anotação posta nele. Com o texto, as tags e a pasta da folha.
- **D6. O link:** o trecho vira `[[Título]]`, ou `[[Título|trecho]]` se o título foi trocado (o que se lê não muda,
  como no renomear). Grava na versão de agora da anotação (a nuvem pode ter trazido outra com a folha aberta),
  achando a mesma linha pelo que ela diz (como a tarefa marcada na leitura), por `ReviewStore.update`: numa
  compartilhada, é uma edição de uma linha que a junção de três vias junta com a dos outros. Se o trecho não está
  mais lá, a nota nasce do mesmo jeito, sem o link, e a leitura avisa.
- **D7. Título que já existe:** o link abriria a outra (a mais antiga). A folha avisa e oferece "Só ligar a ela"
  (o trecho vira link para a que existe, nada se cria); criar fica para quando o título mudar.
- **D8. Depois:** a folha fecha, a leitura fica onde estava, com o trecho já como link. Sem bilhete (ficaria
  embaixo da leitura); o leitor de tela ouve "Anotação “X” criada e ligada ao trecho".
- **D9. Armazenamento:** nada novo no navegador (a nota e o texto vão pelo `ReviewStore`, como sempre). A folhinha
  chega num pedaço à parte (`@defer`), só quando abre.

## Partes (uma por vez, cada uma com /code-review mid)

1. **A folhinha e o que ela grava:** em `core/note-links.ts` o achar do trecho na linha, o link no texto de agora
   e a anotação nova com texto, tags e pasta; `ui/quick-note-sheet.ts` (a folha). Testes.
2. **Na leitura:** a seleção também na tela cheia, o remendo "Nova nota" ao lado do "Citar", abrir a folha,
   criar e ligar, "Só ligar". Testes.

No fim: Impeccable (crítica, detector e fotos 2x no computador e no celular), /code-review high, Novidades,
BUILD, build de produção.

## Andamento

- [x] Parte 1 (/code-review mid: as tags contam como mexer na folha)
- [x] Parte 2 (/code-review mid: as setas da folhinha não viram a página da leitura)
- [x] Fechamento: fotos 2x (computador e celular) da build de produção, /code-review high (a folhinha num pedaço à
  parte de verdade), Novidades 1.50.5, BUILD 993
