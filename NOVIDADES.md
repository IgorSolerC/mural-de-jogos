# Novidades: o que é Funcionalidade, Melhoria ou Correção

Este documento é a regra única das Novidades do site (`src/app/core/news-list.ts`). **Leia antes de
escrever qualquer entrada nova.** Se uma mudança parecer caber em dois tipos, quem decide é a ordem das
perguntas abaixo, nunca o tamanho da mudança, o esforço que ela deu ou o quanto ela parece importante.

---

## 1. Os três tipos

- **Funcionalidade**: a pessoa ganhou algo que não existia em lugar nenhum do site.
- **Melhoria**: algo que já existia ficou diferente ou melhor.
- **Correção**: algo que já existia não funcionava como devia, e agora funciona.

## 2. A decisão, pergunta por pergunta

Faça as perguntas **nesta ordem**. A primeira que responder "sim" decide, e as outras não são feitas.
Classifique **cada item** (cada frase da nota), não a entrega inteira: uma entrega pode ter itens de
tipos diferentes.

### Pergunta 1. É uma CORREÇÃO?

Sim se as duas coisas valem:

1. Antes da mudança, o site fazia algo que **ninguém teria escolhido**: dava erro, travava, perdia ou
   mostrava um dado errado, deixava algo cortado, fora do lugar, por cima de outra coisa, ilegível,
   piscando, sem responder ao toque ou ao teclado, ou contrariava o que o próprio site já prometia (numa
   novidade anterior, num texto da tela, num desenho aprovado).
2. A mudança só faz o site cumprir o que já devia, **sem decidir nada novo** de desenho ou de regra.

Não é correção (vai para a pergunta 2):

- Trocar uma regra que funcionava do jeito pensado, mesmo que a nova seja melhor. Exemplo: "a nota
  revelada passa a continuar revelada" (antes ela era revelada "só daquela vez", de propósito).
- Consertar e, junto, redesenhar. Separe: o conserto é um item de correção; o redesenho, um de melhoria.

### Pergunta 2. É uma MELHORIA?

Sim se a mudança é **uma ou mais destas**, sempre sobre algo que já existia:

| Código | O quê | Exemplos |
| --- | --- | --- |
| M1 | **Aparência**: desenho, cor, tamanho, letra, animação, texto, nome ou posição de algo que já existia | o topo em varal, links sublinhados de azul, o site renomeado para Murall |
| M2 | **Mais do mesmo**: mais um valor numa escolha que já existia, que faz a mesma coisa com outra cara | molduras, paredes, papéis, estampas, estragos, cores, ícones, bônus, ordens, tipos de ficha (Lista, Fichas inteiras), marcas de formatação (título, tabela, código), um nível de privacidade a mais (Visível), um widget de mesmo papel |
| M3 | **Preferência**: uma escolha sobre como algo que já existia aparece, soa, se organiza ou se comporta para você | abas, filtros, ordem, fixar no topo, seções que fecham, esconder/mostrar, vista, tamanho, volume, desempenho, modo sem spoilers, padrões de criação, configurações de um mural |
| M4 | **Atalho ou outro lugar**: um caminho novo para algo que já dava para fazer, ou algo de um lugar passando a valer em outro | tags à mão na pasta, finalizar as anotações ligadas ao marcar a tarefa, escrever o próprio código em vez de sortear outro, o texto das resenhas com os widgets das anotações |
| M5 | **Informação**: mostrar o que o site já sabia | contagem de tarefas, "Parte de 2 notas", Seguindo e Seguidores, os amigos no perfil, estatísticas, o marca-texto da busca, prévias |
| M6 | **Por dentro**: mais rápido, mais leve, mais acessível, funciona offline, outra fonte de busca ou de capas, guarda e sincroniza melhor | o mural que só monta as fichas perto da tela, a busca com as chaves do site, o áudio já carregado |
| M7 | **Regra**: mudou um padrão, um limite, uma pergunta de confirmação, uma conversão ou uma regra de algo que já existia | a anotação publicada passa a ir para o Feed, perguntar antes de salvar sem categoria, até três manchas na mesma ficha |

### Pergunta 3. É uma FUNCIONALIDADE?

Sim se a mudança cria **pelo menos uma destas**, que não existia em lugar nenhum do site:

| Código | O quê | Exemplos |
| --- | --- | --- |
| F1 | **Um mural novo** (um tipo de obra, com as notas dele) | cinco murais, anotações, músicas |
| F2 | **Uma página ou parte nova com conteúdo próprio**. Não conta: refazer, mover, renomear ou juntar páginas (M1); página que só mostra números (M5); painel de preferências (M3) | Wishlist, Extras, a página do perfil, as Novidades |
| F3 | **Um tipo novo de coisa que a pessoa cria e o site guarda**, ou o primeiro recurso de escrita de um tipo | conta, rejogada, reação, comentário, tag, bônus, perfil, a primeira formatação de texto com tarefas, links entre anotações, cada widget que faz algo que nenhum outro faz (contar o tempo, mostrar foto e vídeo, tocar som, colar uma ficha) |
| F4 | **Uma ação nova**, impossível antes por qualquer caminho, entre pessoas ou sobre o próprio conteúdo | seguir, comparar murais, tornar uma resenha privada (a primeira vez), finalizar, jogar os jogos dos Extras, apagar o save |

### Pergunta 4. Nada disso?

É **Melhoria**.

### Desempates que já foram decididos

- O primeiro de um tipo é funcionalidade; os seguintes do mesmo papel são melhoria (M2). A primeira
  formatação do texto (1.9.0) foi funcionalidade; títulos, tabelas e código depois disso, melhoria.
- Um widget novo é funcionalidade só se faz algo que nenhum outro faz. Outro jeito de mostrar o mesmo
  widget (fita, vinil, simples) é melhoria.
- Privacidade: a primeira vez que dá para esconder algo **dos outros** é funcionalidade (F4); cada
  nível novo depois é melhoria (M2). Esconder algo **de você mesmo** (spoilers, abas) é sempre M3.
- Ajustes, configurações, preferências e painéis de escolha são sempre melhoria (M3), por maiores que
  sejam: Desempenho, volume, configurações do mural de anotações.
- Mostrar num lugar novo o que já existia em outro é melhoria (M4/M5): os amigos no perfil, Seguindo e
  Seguidores.

---

## 3. Uma entrada = uma versão

Há dois tipos de entrada em `NEWS`:

- **`funcionalidade`**: uma entrega com funcionalidade. Sobe o número do meio (1.21.4 → 1.22.0). Os
  itens descrevem **só** a funcionalidade. Teste: "este item funcionaria sozinho, sem a
  funcionalidade?" Se sim, ele não é dela: vai para a entrada de ajustes. Duas funcionalidades que foram
  ao ar no mesmo commit ficam na mesma entrada.
- **`ajustes`**: as melhorias e as correções. Sobe o último número (1.22.0 → 1.22.1). Uma entrada de
  ajustes tem duas listas, `melhorias` e `correcoes`, e pelo menos uma delas não é vazia.

### A regra de juntar

**Todas as melhorias e correções do mesmo dia, depois da mesma funcionalidade, ficam numa entrada de
ajustes só.** Duas entradas de ajustes seguidas, no mesmo dia, sem funcionalidade entre elas, são
proibidas (o teste em `news.spec.ts` confere).

Na prática, a cada mudança nova:

1. É funcionalidade? Entrada nova no topo, `X.(Y+1).0`.
2. É melhoria ou correção, e a entrada do topo é de **ajustes** com a **data de hoje**? Acrescente o
   item na lista certa dessa entrada (não crie outra). Depois:
   - troque o `id` dela para o da mudança nova (`AAAA-MM-DD-slug-da-mudanca`), para quem já a tinha
     visto ver de novo que ela cresceu;
   - se ela tem `notice` sem `noticeId`, ponha `noticeId` com o id antigo, para a faixa do topo não
     voltar para quem já a fechou;
   - ajuste o `title` se a mudança nova for das maiores do dia.
3. Senão (o topo é uma funcionalidade, ou é de outro dia): entrada de ajustes nova, `X.Y.(Z+1)`.

## 4. Como escrever

- **Título**: curto, os um a três assuntos maiores da entrada ("Murall, as configurações do mural e
  escrever no celular"). Nada de "Correções de bugs" ou "Correção de bug".
- **Itens**: uma frase por mudança, de preferência numa linha; duas, no máximo, quando precisa do
  antes e do depois. O que a pessoa vê e faz, na língua do site; nada de nome de código, arquivo ou
  biblioteca.
- **Correção**: diga o que estava errado e que agora não está ("…não corta mais os widgets do texto").
- **Junte** as mudanças do mesmo assunto num item só. Um detalhe pequeno entra num item maior ou sai.
  Uma mudança desfeita no mesmo dia não aparece: a entrada conta como o dia terminou.
- **Melhorias primeiro, as maiores em cima**; correções depois, na mesma ordem.
- A faixa do topo (`notice`) é rara: uma funcionalidade grande ou uma mudança que todo mundo precisa ver
  (o site mudou de nome, o topo mudou de lugar).

## 5. Antes do commit

- [ ] Cada item passou pelas perguntas 1 a 4 e está na lista do tipo certo.
- [ ] A regra de juntar foi seguida (o topo de hoje recebeu o item, ou a entrada nova é a certa).
- [ ] `version` segue a anterior; `VERSION` vem sozinha da primeira entrada.
- [ ] `npx ng test --include src/app/core/news.spec.ts` passa (versões, datas, junção, ids).
- [ ] Um caso que estas regras não decidiram vira um desempate novo aqui, no mesmo commit.

## 6. Ids, vistos e faixa

- O `id` é o que fica guardado como visto no navegador. Uma entrada de funcionalidade nunca troca de
  `id`. Uma de ajustes troca quando cresce (ver a regra de juntar).
- Ao juntar entradas antigas, a junta fica com o `id` da mais nova: quem viu a mais nova viu todas.
- `was`: a entrada que saiu de outra que já existia (um item tirado de uma funcionalidade) aponta para
  ela, e quem viu aquela já viu esta.
- `noticeId`: o id da faixa do topo, quando não é o da entrada. Fechar a faixa guarda esse id.

## 7. A recontagem de 15/out/2026

Em 15/out/2026 todas as 191 entradas foram reclassificadas por estas regras e juntadas pela regra de
juntar; a versão caiu de 1.41.14 para 1.22.1. Viraram melhoria, pelos códigos acima: o estojo da ficha,
as datas pela metade e a nota final na mão (M3/M7), o modo sem spoilers e os filtros (M3), as
estatísticas (M5), Amigos com as fichas de verdade (M1/M4), as notas em segredo (M3), mais formatação
(M2), as tarefas somadas (M5), abas por categoria (M3), as fixadas e sub-notas (M3), de onde vem a
sub-nota (M5), a tarefa que finaliza a anotação (M4), Fichas inteiras e Lista (M2), as tarefas feitas
recolhidas (M3), ícone e cor das categorias (M3), a busca sem chave (M6), os amigos no perfil e
Seguindo/Seguidores (M5), a parede do perfil (M2), a parte Desempenho (M3), escolher o código (M4), o
volume (M3) e as configurações do mural (M3). Continuaram funcionalidade: os murais, a Wishlist,
Comparar, os jogos dos Extras e o Apagar o save, rejogadas, a conta (beta), seguir, resenhas privadas,
o texto formatado, reações, links entre anotações, finalizar, categorias e tags, os widgets contador,
imagem e vídeo, áudio e Nota, o perfil e a página do perfil, e os comentários.
