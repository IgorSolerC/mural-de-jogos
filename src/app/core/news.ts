import { Injectable, computed, inject, signal } from '@angular/core';
import { Cloud, CloudNotice } from './cloud-config';
import { ReviewStore } from './review-store';

/**
 * As novidades do site: o que mudou em cada atualização, escrito aqui, no mesmo commit da mudança.
 * Chegam junto com a versão nova do site, então não gastam nenhuma chamada à API, funcionam offline e
 * sempre falam da versão que a pessoa está usando.
 *
 * Toda atualização publicada ganha uma entrada nova no topo de `NEWS`, com um `id` que nunca mais
 * muda, e é de um tipo só (nunca dois tipos na mesma entrada):
 * - `funcionalidade`, coisa nova de verdade (um mural, uma função, uma tela): sobe o número do meio
 *   (1.15.0 → 1.16.0);
 * - `melhoria`, o que já existia ficou melhor (um nome trocado, um desenho acertado, uma tela
 *   arrumada): sobe o último (1.15.0 → 1.15.1);
 * - `correcao`, um bug consertado: sobe o último também.
 * A primeira versão do site é a 1.0.0; o teste confere a conta.
 *
 * Com `notice`, a entrada aparece também na faixa do topo do site (com um X para fechar) até a
 * pessoa fechar, abrir a página de novidades ou passar a data de `until`. Sem `notice`, só na página.
 *
 * Um aviso urgente que não pode esperar uma versão nova (manutenção, a nuvem fora do ar) vai no
 * `public/cloud.json`, no campo `aviso` (ver `parseCloudNotice` em `cloud-config.ts`).
 */
export interface NewsEntry {
  /** Fixo para sempre: é o que fica guardado como visto neste navegador. */
  id: string;
  /** A versão do site, MAIOR.MENOR.CORREÇÃO (ver acima). */
  version: string;
  /** `funcionalidade`: coisa nova; `melhoria`: o que já existia, melhor; `correcao`: bug consertado. */
  kind: NewsKind;
  /** O dia da atualização, AAAA-MM-DD. */
  date: string;
  title: string;
  /** O que mudou, uma frase por item. */
  items: string[];
  /** A frase da faixa no topo do site. Sem ela, a novidade só aparece na página. */
  notice?: string;
  /** Até quando a faixa aparece (AAAA-MM-DD, inclusive). */
  until?: string;
  /**
   * O id da entrada de onde esta saiu, quando uma entrada antiga foi separada em duas:
   * quem já tinha visto aquela já viu esta.
   */
  was?: string;
}

export type NewsKind = 'funcionalidade' | 'melhoria' | 'correcao';

/** Da mais nova para a mais velha. */
export const NEWS: NewsEntry[] = [
  {
    id: '2026-10-08-atalhos-tags',
    version: '1.20.4',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Tags da aba à mão',
    items: [
      'Numa aba de categoria, as tags daquela categoria ficam embaixo da régua, as mais usadas primeiro: um toque filtra por elas, sem abrir o Filtrar. A ligada vira a etiqueta de papel kraft amarrada; outro toque desliga.',
      'Com tags demais, as dez mais usadas ficam à mão e as outras continuam no Filtrar.',
    ],
  },
  {
    id: '2026-10-08-lista-anotacoes',
    version: '1.20.3',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Anotações em lista',
    items: [
      'Novo tipo de ficha nas anotações, a Lista: cada seção vira uma folha de caderno pautada, e cada anotação, uma linha com a cor da cartolina, o título, as tags, as tarefas e a data. Bom para as dailys: dezenas cabem numa tela.',
      'Como a ordem, a Lista é escolhida por aba: o Trabalho em lista e o Diário em fichas completas, por exemplo.',
      'No celular, a busca das anotações fica numa linha só dela, e os tipos de ficha vão para o lado do Ordenar.',
    ],
  },
  {
    id: '2026-10-08-secoes-fecham',
    version: '1.20.2',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Seções das anotações que fecham',
    items: [
      'No mural de anotações, um toque na etiqueta de uma seção (Fixadas, um mês, uma categoria, uma tag) fecha a seção: ela vira uma linha só, com os títulos das anotações. Outro toque abre.',
      'A seção fechada continua fechada na próxima visita, e cada aba fecha as suas.',
    ],
  },
  {
    id: '2026-10-08-vista-por-aba',
    version: '1.20.1',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Cada aba com a sua vista',
    items: [
      'Cada aba das anotações lembra a sua ordem e o seu tipo de ficha: o Trabalho pode ficar em fichas simples por data, e o Diário em fichas completas. A aba que você ainda não arrumou começa como a Tudo.',
      'Nova ordem "Tag" nas anotações: as seções são a primeira tag de cada anotação, de A a Z, com as sem tag no fim.',
      'Numa aba de categoria, a ordem "Categoria" sai do Ordenar (ali ela não separaria nada).',
    ],
  },
  {
    id: '2026-10-08-abas-anotacoes',
    version: '1.20.0',
    kind: 'funcionalidade',
    date: '2026-10-08',
    title: 'Abas por categoria nas anotações',
    items: [
      'O mural de anotações ganhou abas, como divisórias de pasta: Tudo, uma aba para cada categoria (de A a Z) e Sem categoria. As categorias com menos de 3 anotações ficam no "Mais".',
      'O mural abre na última aba usada, sem precisar filtrar de novo.',
      'Cada aba mostra só as anotações dela, com as fixadas dela no topo. A busca procura na aba aberta e avisa quando outras abas falam do mesmo assunto.',
      'A anotação nova escrita dentro de uma aba já vem com a categoria dela.',
      'Na aba de uma categoria, o Filtrar mostra só as tags daquela categoria.',
    ],
  },
  {
    id: '2026-10-08-correcoes-link-tabela',
    version: '1.19.3',
    kind: 'correcao',
    date: '2026-10-08',
    title: 'Correções de bugs',
    items: [
      'No link para outra anotação pela régua, as letras escritas na busca não entravam no campo.',
      'A tabela no texto da ficha não ganha mais uma barra de rolar de pé no mural.',
      'Com todos os emojis abertos para reagir, passar o mouse num emoji da beirada não abre mais uma barra de rolar de lado.',
    ],
  },
  {
    id: '2026-10-08-link-anotacao-tags',
    version: '1.19.2',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Link para anotação, tags e selinhos',
    items: [
      'O link para outra anotação, pela régua, ficou como o link para um endereço: o texto, a anotação (procure pelo título e escolha na lista) e o botão "Pôr o link".',
      'As tags sugeridas no editor são as já usadas na mesma categoria: a "Bugfix" do Trabalho não aparece na Lista de compras. As tags fixas continuam em todas.',
      'Os selinhos da ficha (publicada, visível, privada) são sempre pretos e sem sombra, também nas cartolinas escuras.',
    ],
  },
  {
    id: '2026-10-08-visivel',
    version: '1.19.1',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Publicar, Visível ou Privado',
    items: [
      'Na hora de pregar, entre Publicar e Privado agora tem Visível: a ficha fica no seu mural, e quem abrir o seu mural vê, mas ela não aparece no Feed de quem segue você.',
      'Publicar continua sendo o de sempre nas resenhas, e Privado nas anotações. A ficha Visível que depois é publicada aparece no Feed a partir desse dia.',
      'No seu mural, a ficha Visível leva um selinho com um olho.',
    ],
  },
  {
    id: '2026-10-08-tarefas-somadas',
    version: '1.19.0',
    kind: 'funcionalidade',
    date: '2026-10-08',
    title: 'As tarefas do mural somadas',
    items: [
      'Embaixo da régua do mural, as tarefas (as caixinhas dos checklists) das fichas à mostra, somadas: quantas feitas, quantas para fazer e uma reguinha de quanto já foi.',
      'A conta segue a busca, os filtros e o "Mostrar finalizadas", e muda na hora a cada check.',
    ],
  },
  {
    id: '2026-10-08-setas',
    version: '1.18.11',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Setas e símbolos no texto',
    items: [
      'No texto das fichas, -> vira →, <- vira ←, <-> vira ↔ e => vira ⇒. Também --> e <-- (setas compridas), <=> (⇔), != (≠), >= (≥), <= (≤), ~= (≈) e +- (±).',
      'No código e nos links, o que foi escrito fica como está. Para escrever a seta crua, uma barra antes do último sinal: -\\>.',
      'O guia das marcas (o "?" da régua) mostra as setas e os símbolos.',
    ],
  },
  {
    id: '2026-10-08-anotacao-no-feed',
    version: '1.18.10',
    kind: 'correcao',
    date: '2026-10-08',
    title: 'Correções de bugs',
    items: [
      'A anotação publicada aparece no Feed de quem segue você, como a resenha: ao nascer pública ou na primeira vez que deixa de ser privada. No Feed ela vem como anotação, sem nota para comparar nem wishlist.',
    ],
  },
  {
    id: '2026-10-08-opacidade-da-estampa',
    version: '1.18.9',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Opacidade da estampa',
    items: [
      'A estampa ganhou a régua de Opacidade, como a do rabisco: de quase sumida a carregada, em qualquer ficha. Muda só a força da tinta; os desenhos ficam no mesmo lugar.',
      'As fichas que já existiam continuam iguaizinhas: a estampa delas fica na Opacidade Normal até alguém mexer.',
    ],
  },
  {
    id: '2026-10-08-mais-em-menu',
    version: '1.18.8',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'O "Mais" num menu, e outros acabamentos',
    items: [
      'O "Mais" da régua abre um menu colado no botão, por cima da folha, em vez de um painel lá embaixo: riscado, marca-texto e código; citação e divisória; e o guia. As setas andam pelo menu, Esc fecha, e tocar fora também.',
      'O botão de link para outra anotação ganhou um desenho só: a folhinha com o elo de corrente dentro.',
      'As etiquetas de Finalizar e de fixar são pretas em toda cartolina, clara ou escura.',
      'As tags de papel pardo ganharam uma sombra leve, de papel solto na cartolina, e não se misturam mais com o fundo.',
    ],
  },
  {
    id: '2026-10-08-marca-texto-inteiro',
    version: '1.18.7',
    kind: 'correcao',
    date: '2026-10-08',
    title: 'Correções de bugs',
    items: ['O marca-texto (==assim==) pinta a palavra inteira, de cima a baixo, em vez de ficar cortado no meio da letra.'],
  },
  {
    id: '2026-10-08-finalizar-e-fixar',
    version: '1.18.6',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Finalizar e fixar, à vista na hora certa',
    items: [
      'A caixinha apagada do canto da anotação virou a etiqueta "Finalizar", com o check verde do carimbo; ao lado, o alfinete de fixar. As duas ficam presas na beirada de cima da ficha, sem cobrir o título.',
      'Elas aparecem quando o mouse passa pela anotação (ou o teclado chega nelas); a fixada mantém o alfinete vermelho sempre à vista. No celular, ficam sempre, só com o desenho, do tamanho do dedo.',
      'Na anotação finalizada, a etiqueta vira "Reabrir".',
    ],
  },
  {
    id: '2026-10-08-versoes-recontadas',
    version: '1.18.5',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'As versões recontadas',
    items: [
      'Algumas atualizações antigas eram melhorias do que já existia, não coisa nova: os links à caneta e o carimbo novo, o mural de anotações repaginado, os links com o seu texto e a régua arrumada, os bônus novos para livros, filmes, séries e animes, e Amigos de cara nova. Agora estão em Melhorias.',
      'Como só as funcionalidades sobem o número do meio, a conta das versões foi refeita: a de agora é a 1.18.5 (era a 1.23.1). Nada mudou no site além do número.',
    ],
  },
  {
    id: '2026-10-08-novidades-em-tres',
    version: '1.18.4',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Novidades separadas em três',
    items: [
      'Cada versão das Novidades agora é Funcionalidade (coisa nova, presa com tachinha), Melhorias (o que já existia ficou melhor, com o carimbo verde) ou Correções (bug consertado, com o carimbo vermelho), em vez de Update e Bugfix.',
      'Só as funcionalidades sobem o número do meio da versão; melhorias e correções sobem o último.',
    ],
  },
  {
    id: '2026-10-08-links-com-texto',
    version: '1.18.3',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Links com o seu texto e a régua arrumada',
    items: [
      'O link para outra anotação pode mostrar o texto que você quiser: [[Lista do mercado|o mercado]] abre a "Lista do mercado" e aparece como "o mercado". Pela régua, o trecho selecionado já vira o texto, e você só escolhe a anotação.',
      'Trocou o título da anotação? Os links para ela mudam junto e continuam com o texto que você escolheu.',
      'A régua do texto ficou com o que se usa toda hora (negrito, itálico, título, tarefas, listas, links e tabela). Riscado, marca-texto, código, citação, divisória e o guia moram em "Mais", com o nome e o atalho de cada um.',
      'Todo painel da régua tem o X para fechar, e no celular os botões ficaram maiores e o "Mais" fica sempre à vista.',
    ],
  },
  {
    id: '2026-10-08-correcoes-links-e-paineis',
    version: '1.18.2',
    kind: 'correcao',
    date: '2026-10-08',
    title: 'Correções de bugs',
    items: [
      'O marca-texto do link (ao passar o mouse) cobre a palavra inteira, e o risco de caneta ficou logo embaixo da letra.',
      'Um painel da régua (o link para um endereço, a tabela…) não fica mais aberto ao fechar uma anotação e abrir outra.',
      'O botão de tirar a categoria agora é o "Tirar" de caneta, ao lado do "Trocar".',
      'Nas Novidades, cada item tem uma linha em branco antes do próximo.',
    ],
  },
  {
    id: '2026-10-08-anotacoes-repaginadas',
    version: '1.18.1',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'O mural de anotações repaginado',
    items: [
      'A ficha mostra quantas tarefas já foram feitas (3/7), e fica verde quando todas estão.',
      'A sub-nota diz de qual anotação faz parte ("Parte de Sprint 42"); na leitura, o nome abre a anotação.',
      'A anotação nasce privada, então o cadeado saiu de todas: agora só a publicada ganha um selinho.',
      'Na ficha "só capa e nome", a anotação sem capa vira só o título, grande, na cartolina (sem a moldura vazia).',
      'Na ficha simples, o carimbo de finalizada não cobre mais o título; a ficha larga ocupa uma vaga como as outras.',
      'No editor, Categoria e Tags ganharam o mesmo título a pincel dos outros blocos; a tag fixa agora é uma estrela (o alfinete é de fixar a anotação).',
      'No celular, o editor da anotação começa pelo título e pelo texto (a cartolina vem depois), e a ficha de prévia encolhe enquanto você escreve.',
      'Na régua, as tarefas vêm logo depois das ênfases. A citação ganhou um risco a lápis, e o link para fora, uma setinha desenhada.',
      'O filtro esconde os grupos que não separam nada, e "Tudo finalizado" ganhou o carimbo verde.',
    ],
  },
  {
    id: '2026-10-08-markdown',
    version: '1.18.0',
    kind: 'funcionalidade',
    date: '2026-10-08',
    title: 'Mais formatação no texto',
    items: [
      'Títulos (# , ## e ###), citações (>), a divisória (---), tabelas e blocos de código entram no texto das anotações e das resenhas.',
      'Na linha: ~~riscado~~, ==marca-texto== e `código`. E links para qualquer endereço: [texto](https://…), ou o endereço solto, que já vira link (abre em outra aba).',
      'A régua do editor ganhou os botões de tudo isso. O link pede o texto e o endereço (Ctrl+K); colar um endereço com um texto selecionado já faz o link.',
      'A tabela se escolhe numa grade, como no Docs. Dentro dela, Tab anda entre as células e Enter no fim de uma linha cria a próxima.',
      'O "?" da régua abre o guia com todas as marcas. Atalhos: Ctrl+E (código), Ctrl+Shift+X (riscado), Ctrl+Shift+H (marca-texto).',
      'No celular, a régua fica numa fileira só, que rola de lado.',
    ],
  },
  {
    id: '2026-10-08-categorias-e-tags',
    version: '1.17.0',
    kind: 'funcionalidade',
    date: '2026-10-08',
    title: 'Categorias e tags nas anotações',
    items: [
      'Cada anotação agora tem uma categoria, uma só: o assunto dela (Trabalho, Estudos, Lista de compras…). Da cartela pronta ou escrita à mão.',
      'E tags, quantas quiser (até 12): informam, como Bugfix, Feature, Urgente. Escreva e aperte Enter (ou vírgula); o editor sugere as que você já usa.',
      'O alfinete numa tag a deixa fixa: ela fica sempre à mão no editor, em toda anotação, mesmo sem nenhuma usando. As fixas vão junto para os outros aparelhos.',
      'Filtrar agora tem os dois grupos: Categoria e Tags. A busca também acha pela categoria e pelas tags; "#bugfix" procura só nas tags.',
      'As anotações de antes tinham várias categorias: a primeira virou a categoria, e as outras viraram tags.',
      'A anotação criada por um link já nasce com a categoria da anotação de onde veio.',
    ],
  },
  {
    id: '2026-10-08-caneta-e-carimbo',
    version: '1.16.2',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Links à caneta e o carimbo novo',
    items: [
      'Os links entre anotações saíram do azul: o texto fica na sua letra, sublinhado à mão com caneta vermelha (amarela nas cartolinas vermelhas, vermelho-claro nas escuras). Passando o mouse, o marca-texto.',
      'O link para uma anotação que ainda não existe fica sublinhado a lápis, tracejado.',
      'O carimbo da anotação finalizada é novo: um selo redondo de borracha em tinta verde, com FINALIZADA em volta, o check no meio e o dia numa faixa, batido no canto da ficha (e no canto da leitura).',
    ],
  },
  {
    id: '2026-10-07-anotacoes-correcoes',
    version: '1.16.1',
    kind: 'correcao',
    date: '2026-10-07',
    title: 'Correções nas anotações',
    items: [
      'O check e o alfinete das anotações passam pela nuvem sem se perder, mesmo com uma versão antiga do site aberta em outro aparelho (ela para de sincronizar até ser recarregada).',
      'Abrindo o backup de alguém em Comparar, as resenhas e anotações privadas dessa pessoa não aparecem mais.',
      'Renomear uma anotação com o título de outra mais antiga (ou com colchetes) não desvia mais os links das outras anotações; o editor avisa dos dois jeitos.',
      'A anotação criada por um link e renomeada antes de salvar leva o link junto. E, vindo da leitura, a leitura volta para a anotação de onde o link saiu.',
      'Desafixar uma sub-nota a devolve para as sub-notas. Abrir de novo uma finalizada tem Desfazer, que devolve o dia em que ela tinha sido finalizada.',
      'Finalizar na leitura, vindo por um link, volta para a anotação anterior; com "Mostrar finalizadas" ligado, o carimbo bate ali mesmo.',
      'Na ordem por Data, as fixadas mostram a data inteira. Ordenando por categoria com o filtro de uma categoria, cada anotação fica na escolhida.',
      'A busca avisa quando só anotações finalizadas falam do que foi procurado. O número do Mural não conta as finalizadas. "Tudo finalizado" ganhou o botão de nova anotação.',
      'Na ficha "só capa e nome", o alfinete e a caixinha saem (eram pequenos demais), e a finalizada ganha um selinho.',
      'O foco do teclado aparece em toda cartolina, não se perde ao finalizar ou fixar, e o texto da ficha não rola mais ao chegar numa tarefa lá embaixo.',
      'No mural de alguém: anotação não tem nota, então sem "média 0,0", "em segredo" nem "Mostrar notas". "Voltar à comparação" volta mesmo. Trocar de mural limpa a busca e os filtros.',
    ],
  },
  {
    id: '2026-10-07-anotacoes-fixadas',
    version: '1.16.0',
    kind: 'funcionalidade',
    date: '2026-10-07',
    title: 'Anotações fixadas e sub-notas',
    items: [
      'O alfinete no canto de cada anotação a fixa no topo do mural, numa seção Fixadas que fica em cima em qualquer ordem. Também dá para fixar na leitura e no editor.',
      'Nova ordem Prioridade, a de sempre no mural de anotações: as fixadas, depois as comuns e, no fim, as sub-notas, cada seção das mais recentes para as mais antigas.',
      'A anotação criada por um link de dentro de outra já nasce sub-nota: ela faz parte daquela. No editor, "Lugar no mural" troca entre Fixada, Comum e Sub-nota.',
      'O mural de anotações agora guarda a ordem dele, separada da ordem dos outros murais.',
    ],
  },
  {
    id: '2026-10-07-anotacoes-finalizadas',
    version: '1.15.0',
    kind: 'funcionalidade',
    date: '2026-10-07',
    title: 'Anotações finalizadas',
    items: [
      'Cada anotação ganhou uma caixinha de check no canto da ficha. Marcou, a anotação inteira está feita: leva um carimbo de FINALIZADO com o dia ao lado do título e, uns segundos depois, sai do mural.',
      'O dia em que ela foi finalizada fica guardado no carimbo.',
      '"Mostrar finalizadas", ao lado do Filtrar, traz de volta as que já foram (e o mural lembra da escolha). Desmarcar o check abre a anotação de novo.',
      'Na leitura da anotação, o mesmo check: "Finalizar" ou "Abrir de novo".',
      'No mural de outra pessoa, as anotações finalizadas também ficam guardadas, com o mesmo "Mostrar finalizadas".',
    ],
  },
  {
    id: '2026-10-07-links-entre-anotacoes',
    version: '1.14.0',
    kind: 'funcionalidade',
    date: '2026-10-07',
    title: 'Links entre anotações',
    items: [
      'No texto de uma anotação, escreva o título de outra entre colchetes duplos, como [[Comprar um console]], e ele vira um link de caneta azul. Tocando nele, a outra anotação abre, direto da ficha do mural ou da leitura.',
      'Escrevendo [[ na folha, aparece a lista das suas anotações para escolher (setas e Enter, ou toque). Também dá pelo botão de link na régua.',
      'Na anotação aberta por um link, "Voltar" leva de volta à anterior.',
      'Um link para uma anotação que ainda não existe fica tracejado: tocando nele, a anotação nova já abre com o título.',
      'Trocou o título de uma anotação? Os links para ela nas outras anotações mudam junto.',
    ],
  },
  {
    id: '2026-10-07-novidades-com-versao',
    version: '1.13.1',
    kind: 'melhoria',
    date: '2026-10-07',
    title: 'Correções e ajustes',
    items: [
      'As Novidades agora têm número de versão e a etiqueta Update (coisa nova) ou Bugfix (correções). Cada uma fica numa linha só; toque para ver o que mudou.',
      'As correções que vinham misturadas com as coisas novas ganharam a própria versão.',
    ],
  },
  {
    id: '2026-10-07-mural-de-anotacoes',
    version: '1.13.0',
    kind: 'funcionalidade',
    date: '2026-10-07',
    title: 'Mural de anotações',
    notice: 'Novo: o mural de anotações, para listas, tarefas e ideias. Troque no cartaz.',
    items: [
      'Um sexto mural, de anotações: troque no cartaz ("Meu mural de anotações"). Listas de compras, tarefas, receitas, ideias, cada uma numa cartolina.',
      'A anotação tem título, uma capa se quiser (um link de imagem), o texto com negrito, listas e tarefas, e categorias no lugar dos bônus.',
      'As tarefas se marcam direto na ficha do mural ou na leitura, sem abrir o editor. E a anotação pode ser só o título.',
      'No mural, as categorias filtram e ordenam as anotações. A primeira categoria é a principal (a seção dela, ordenando por categoria): no editor, toque em outra para trocar.',
      'Ela nasce privada; publicada, aparece no seu mural para quem abrir, mas não vira aviso para quem segue você.',
      'A ficha pode ser Larga (duas colunas) ou Alta (mostra mais do texto).',
    ],
  },
  {
    id: '2026-10-07-reacoes',
    version: '1.12.0',
    kind: 'funcionalidade',
    date: '2026-10-07',
    title: 'Reações',
    was: '2026-10-07-ajustes-pelo-mural',
    items: [
      'Reações, como as do WhatsApp: nas fichas de quem você segue, "Reagir" (no Feed e na leitura) abre ❤️ 🔥 😂 😮 😢 🤔 👎.',
      'No fim da fileira, o "+" abre todos os outros emojis, por gaveta ou pela busca ("gato", "pipoca").',
      'Quem vê o mural vê as reações num remendo de feltro costurado na ficha; tocando nele, quem reagiu com o quê.',
      'Quando alguém reage às suas fichas, chega um aviso no Feed.',
    ],
  },
  {
    id: '2026-10-07-texto-formatado',
    version: '1.11.0',
    kind: 'funcionalidade',
    date: '2026-10-07',
    title: 'Texto formatado nas resenhas',
    was: '2026-10-07-ajustes-pelo-mural',
    items: [
      'O texto da resenha ganhou formatação: negrito, itálico, listas, listas numeradas e tarefas, pelos botões em cima da folha (ou Ctrl+B e Ctrl+I).',
      '"Ver como fica" mostra o resultado, e as tarefas se marcam direto na leitura da ficha.',
      'Textos longos: "Maximizar" abre a folha na tela inteira, com a letra maior.',
    ],
  },
  {
    id: '2026-10-07-ajustes-pelo-mural',
    version: '1.10.6',
    kind: 'melhoria',
    date: '2026-10-07',
    title: 'Correções e ajustes',
    items: [
      'Na hora de pregar, "Quem vê?" agora pergunta "Publicar ou manter privado?", com as opções Publicar e Privado (eram Todo mundo e Só eu).',
      'Em Amigos, a aba Chegou agora se chama Feed.',
      'Os selinhos da foto (o cadeado da privada e o da rejogada) ficam um embaixo do outro no canto, em vez de um em cima do outro. Nas cartolinas escuras eles perderam a borda branca.',
      'Ordenando por data, a seção das fichas só com o ano agora se chama só "2026", em vez de "2026, mês não lembrado". Ela vem depois dos meses daquele ano, e quem tem mês sem dia fica no fim da seção do mês.',
      'A original é sempre a vez mais antiga: pregar uma rejogada (releitura, reassistida) com data de antes da original faz dela a original. "Não lembro" conta como a mais antiga. As cartolinas continuam iguaizinhas.',
    ],
  },
  {
    id: '2026-10-07-bonus-novos',
    version: '1.10.5',
    kind: 'melhoria',
    date: '2026-10-07',
    title: 'Mais bônus para livros, filmes, séries e animes',
    was: '2026-10-07-ajustes-pelo-mural',
    items: [
      'Livros, filmes, séries e animes ganharam os bônus que só os jogos tinham, quando cabem: Genial, Clássico, Me marcou, Melhor do gênero, Caça-níquel, Repetitivo e outros.',
      'E alguns só deles, como "Erros de revisão", "Frases pra sublinhar", "Dublagem ruim" e "Propaganda do mangá".',
      'Um bônus que você escreveu à mão com o mesmo nome de um desses novos passa a ser o da cartela, com o desenho dele.',
    ],
  },
  {
    id: '2026-10-06-consertos-amigos-nuvem',
    version: '1.10.4',
    kind: 'correcao',
    date: '2026-10-06',
    title: 'Correções de bugs',
    items: [
      'O nome trocado em um aparelho não volta mais ao antigo quando outro aparelho abre o site.',
      'Em Amigos, a rejogada (ou releitura, ou reassistida) de algo que você já avaliou mostra a sua nota, em vez de "Você ainda não avaliou".',
      'Em Amigos, uma resenha que chega com a página aberta busca o mural do amigo de novo, em vez de dizer que ele tirou a ficha do mural. Sem conexão, aparece "Tentar de novo".',
      'A resenha de alguém que aparece em Amigos com a página já aberta não fica mais em "Buscando a ficha…" para sempre.',
      'Avaliar várias coisas seguidas não para mais a sincronização com "envios demais". Se ela precisar dar uma pausa, volta sozinha, sem recarregar a página.',
      'O "Desfazer" depois de deixar de seguir alguém mantém a pessoa silenciada, se ela estava.',
      'E as resenhas dela que já estavam em Amigos continuam lá depois do "Desfazer".',
      'Com "Novidades dos amigos: separado", abrir Amigos num mural não dá mais como vistas as novidades dos outros murais.',
      'Trocar de conta neste navegador não mostra mais, por um instante, quem a conta anterior segue.',
      'Quando alguém que você segue troca o código, o mural da pessoa em Comparar passa para o código novo, em vez de aparecer duas vezes.',
    ],
  },
  {
    id: '2026-10-06-amigos-de-cara-nova-correcoes',
    version: '1.10.3',
    kind: 'correcao',
    date: '2026-10-06',
    title: 'Correções de bugs',
    was: '2026-10-06-amigos-de-cara-nova',
    items: [
      'Enquanto o mural de um amigo chega, a resenha mostra uma ficha em branco com o nome da obra, em vez de dizer que ela saiu do mural. Se não der para buscar, aparece "Tentar de novo".',
      'O cadeado das resenhas privadas fica sempre escuro, também nas cartolinas escuras.',
    ],
  },
  {
    id: '2026-10-06-amigos-de-cara-nova',
    version: '1.10.2',
    kind: 'melhoria',
    date: '2026-10-06',
    title: 'Amigos de cara nova',
    items: [
      'O bilhete com "+1,4 que você" agora fica preso na ficha com um pedaço de fita, e resenhas seguidas da mesma pessoa ficam sob uma fita só.',
      'Na tela grande, ao lado do que chegou: o seu crachá com o código (e o link para copiar), o bilhete para seguir alguém e quem você segue.',
      'Pessoas virou uma lista só: cada pessoa aparece uma vez, com "Vocês se seguem", "Você segue" ou "Segue você". Silenciar, deixar de seguir e remover seguidor ficam no "⋯" de cada um.',
    ],
  },
  {
    id: '2026-10-06-privadas-e-segredos-correcoes',
    version: '1.10.1',
    kind: 'correcao',
    date: '2026-10-06',
    title: 'Correções de bugs',
    was: '2026-10-06-privadas-e-segredos',
    items: ['No feed de Amigos, a ficha tem a mesma largura e altura que no mural.'],
  },
  {
    id: '2026-10-06-privadas-e-segredos',
    version: '1.10.0',
    kind: 'funcionalidade',
    date: '2026-10-06',
    title: 'Resenhas privadas e notas em segredo',
    items: [
      'Ao pregar uma resenha, escolha "Quem vê?": Todo mundo ou Só eu. A privada ganha um cadeado, fica fora do mural que os outros veem e não avisa ninguém. Quando você troca para Todo mundo, quem segue você é avisado.',
      'Evitar spoilers agora vale para as fichas de qualquer pessoa, amiga ou não: em Amigos, no mural de alguém e em Comparar, o que você ainda não avaliou fica em segredo.',
      'Abriu uma ficha em segredo? "Revelar a nota" mostra só aquela, só daquela vez.',
      'No mural de alguém e em Comparar, "Mostrar notas" revela tudo enquanto a tela estiver aberta. Na próxima vez, volta a seguir Ajustes.',
    ],
  },
  {
    id: '2026-10-06-amigos-e-chaves',
    version: '1.9.0',
    kind: 'funcionalidade',
    date: '2026-10-06',
    title: 'Amigos com as fichas de verdade',
    items: [
      'O Correio virou a aba Amigos, com as pessoas que acenam quando chega algo.',
      'Cada resenha nova de um amigo chega como a ficha dele, igual à do mural. Do lado, quanto ele deu a mais ou a menos que você, ou "Quero jogar" se você ainda não tem. Tocar no nome abre o mural da pessoa.',
      'Sem spoilers: o que você ainda não avaliou chega em segredo (dá para desligar em Ajustes › Mural).',
      'Misturado ou separado: as novidades de todos os murais juntas, ou só as do mural aberto no cartaz.',
      'Com a conta, as chaves da RAWG e do TMDB valem em todos os seus aparelhos. Elas nunca vão no arquivo de backup.',
      'Quem ainda tem o mural só no navegador vê, no máximo a cada 2 dias, um convite para entrar com o Google.',
      'Os botões que esperam a nuvem (seguir, sair, apagar, sincronizar, abrir um mural) mostram que estão trabalhando.',
    ],
  },
  {
    id: '2026-10-seguir',
    version: '1.8.0',
    kind: 'funcionalidade',
    date: '2026-10-06',
    title: 'Seguir pelo código e a aba Amigos',
    notice: 'Agora dá para seguir os amigos pelo código e ver, na aba Amigos, o que eles pregaram no mural.',
    items: [
      'Siga alguém pelo código, ou com o botão "Seguir" no mural da pessoa. Ela recebe um aviso de que você começou a seguir.',
      'A aba Amigos, ao lado da engrenagem, mostra as resenhas novas de quem você segue, um cartão por pessoa por dia. Um número amarelo aparece quando chega algo.',
      'Em cada resenha: a nota que você deu para a mesma obra, ou "Quero" para pôr na sua wishlist. E o quanto vocês combinam.',
      'Silencie quem você quiser (continua seguindo, sem contar no número), deixe de seguir ou tire alguém da lista de quem segue você.',
    ],
  },
  {
    id: '2026-10-beta',
    version: '1.7.0',
    kind: 'funcionalidade',
    date: '2026-10-06',
    title: 'O Meu Mural entrou em beta',
    notice: 'O Meu Mural entrou em beta: agora dá para entrar com o Google e ter o mesmo mural em todos os aparelhos.',
    items: [
      'Conta com o Google, se você quiser: o mural fica salvo na nuvem e igual no computador e no celular. Sem conta, tudo continua só neste navegador, como sempre.',
      'Cada conta tem um código. Mande o código ou o link para um amigo e ele abre o seu mural em Comparar, sem arquivo de backup.',
      'Ajustes agora vem em abas: Perfil, Backup, Mural e Busca e capas.',
      'O lembrete de backup some para quem está salvo na nuvem.',
      'Uma página de privacidade que explica o que a nuvem guarda.',
      'Esta página, com o que mudou em cada atualização.',
    ],
  },
  {
    id: '2026-10-06-rejogadas',
    version: '1.6.0',
    kind: 'funcionalidade',
    date: '2026-10-06',
    title: 'Rejogadas, releituras e reassistidas',
    items: [
      'Jogou de novo, releu ou reassistiu? Abra a resenha e escreva a rejogada: ela vira uma ficha própria, ligada à original.',
      'A ficha nova nasce com a mesma cartolina da original, e dá para trazer as notas dela com "Manter notas".',
      'Na resenha aberta, as setas passam pela original e por todas as outras vezes.',
    ],
  },
  {
    id: '2026-10-05-extras-correcoes',
    version: '1.5.1',
    kind: 'correcao',
    date: '2026-10-05',
    title: 'Correções de bugs',
    was: '2026-10-05-extras',
    items: ['O mural passou a caber muito mais resenhas.', 'E muitos outros bugs foram corrigidos.'],
  },
  {
    id: '2026-10-05-extras',
    version: '1.5.0',
    kind: 'funcionalidade',
    date: '2026-10-05',
    title: 'Extras e estatísticas',
    items: [
      'Uma aba nova, Extras, com o Ranking, o Comparar e três jogos: Mata-mata, Maior ou menor e Muraldle.',
      'Estatísticas: sete páginas de números sobre o seu mural.',
      'Escolha como a nota aparece: livre, arredondada ou só inteiros.',
      'O seu nome vai no backup, e quem compara com você vê o seu nome.',
      '"Apagar o save", em Ajustes, para começar do zero (ele pergunta antes).',
    ],
  },
  {
    id: '2026-10-04-spoilers',
    version: '1.4.0',
    kind: 'funcionalidade',
    date: '2026-10-04',
    title: 'Sem spoilers, filtros e um estojo maior',
    items: [
      'Modo sem spoilers: esconde notas, vereditos e textos, para mostrar o mural sem entregar o que você achou.',
      'Uma cartela de filtros no mural: veredito, status, nota, dificuldade, ano e mais.',
      'Vista só com capa e nome, para ver muita coisa de uma vez.',
      '18 estampas novas, separadas por assunto, e 39 estragos, manchas, rabiscos e decorações novos.',
    ],
  },
  {
    id: '2026-09-30-comparar',
    version: '1.3.0',
    kind: 'funcionalidade',
    date: '2026-09-30',
    title: 'Comparar murais',
    items: [
      'Abra o backup de um amigo e veja se vocês combinam, onde concordam e onde brigam.',
      'As dicas do amigo: o que só ele resenhou, com "Quero jogar" para pôr na sua wishlist.',
      'A data da resenha pode ser só o mês e o ano, ou só o ano.',
      'Nota final na mão, se você quiser, até 11.',
    ],
  },
  {
    id: '2026-09-29-papel',
    version: '1.2.0',
    kind: 'funcionalidade',
    date: '2026-09-29',
    title: 'Fichas do seu jeito, Wishlist e Pra depois',
    items: [
      'Personalize cada ficha: cartolinas claras e escuras, estampas, estragos e decorações.',
      'Wishlist em recortes de revista e Pra depois em folhas de caderno.',
      'Escolha a capa de cada resenha.',
    ],
  },
  {
    id: '2026-09-28-murais',
    version: '1.1.0',
    kind: 'funcionalidade',
    date: '2026-09-28',
    title: 'Cinco murais e o site offline',
    items: [
      'Cinco murais: jogos, livros, filmes, séries e animes. Para trocar, toque na palavra do cartaz.',
      'O site abre sem internet e pode ser instalado como um app.',
      'Bônus a favor e contra, a dificuldade em caveiras e a nota 10 em folha holográfica.',
      'Um lembrete para baixar o backup de vez em quando.',
    ],
  },
  {
    id: '2026-09-27-no-ar',
    version: '1.0.0',
    kind: 'funcionalidade',
    date: '2026-09-27',
    title: 'O mural foi para o ar',
    items: ['A primeira versão: o mural de jogos, o Pra depois, o Ranking, o Lado a lado e os Ajustes.'],
  },
];

/** A versão do site, a da novidade mais nova. */
export const VERSION = NEWS[0].version;

/** O nome da etiqueta de cada tipo. */
export const NEWS_KIND_LABEL: Record<NewsKind, string> = { funcionalidade: 'Funcionalidade', melhoria: 'Melhorias', correcao: 'Correções' };

/** A versão que vem depois de `prev`, num update ou num bugfix (ver o comentário de `NewsEntry`). */
export function nextVersion(prev: string, kind: NewsKind): string {
  const [major, minor, patch] = prev.split('.').map(Number);
  return kind === 'funcionalidade' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

/** Já foi vista: ela mesma, ou a entrada antiga de onde ela saiu. */
export function isSeen(n: NewsEntry, seen: ReadonlySet<string>): boolean {
  return seen.has(n.id) || (n.was !== undefined && seen.has(n.was));
}

/** O que a faixa do topo mostra. */
export interface Notice {
  /** O que fica guardado como visto quando a pessoa fecha. */
  key: string;
  text: string;
  /** Tem link para a página de novidades (os avisos da nuvem não têm). */
  news: boolean;
}

const KEY = 'meu-mural:novidades';
/** Um limite para a lista de vistos não crescer para sempre (os ids da nuvem não estão em NEWS). */
const MAX_SEEN = 200;

/** Hoje, AAAA-MM-DD, no fuso de quem usa. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Quem nunca passou por aqui: quem chega agora não recebe notícia velha (tudo conta como visto);
 * quem já tinha um mural antes desta página existir vê só a mais nova.
 */
export function firstSeen(news: NewsEntry[], hadWall: boolean): string[] {
  return hadWall ? news.slice(1).map((n) => n.id) : news.map((n) => n.id);
}

/**
 * A faixa da vez: o aviso da nuvem, se houver um não visto e no prazo; senão, a novidade mais nova
 * que tem aviso (uma atualização pequena, sem aviso, não esconde a faixa da anterior). Só essa:
 * fechar a faixa nunca faz uma mais velha aparecer no lugar.
 */
export function noticeOf(news: NewsEntry[], cloud: CloudNotice | null, seen: ReadonlySet<string>, day: string): Notice | null {
  if (cloud && !seen.has(`nuvem:${cloud.id}`) && (!cloud.until || cloud.until >= day)) {
    return { key: `nuvem:${cloud.id}`, text: cloud.text, news: false };
  }
  const latest = news.find((n) => n.notice);
  if (!latest?.notice || isSeen(latest, seen) || (latest.until && latest.until < day)) return null;
  return { key: latest.id, text: latest.notice, news: true };
}

/** Lê o que ficou guardado; null se nunca foi gravado (ou não serve). */
export function readSeen(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const data = JSON.parse(raw) as { vistas?: unknown };
    const list = data?.vistas;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class News {
  private readonly cloud = inject(Cloud);
  private readonly store = inject(ReviewStore);

  readonly entries = NEWS;
  private readonly seen = signal<ReadonlySet<string>>(this.load());
  /** Hoje, uma vez por abertura: o prazo de um aviso não precisa de relógio. */
  private readonly day = today();

  /** A faixa do topo, ou null. */
  readonly notice = computed(() => noticeOf(this.entries, this.cloud.notice(), this.seen(), this.day));
  /** Quantas novidades esta pessoa ainda não viu. */
  readonly unseen = computed(() => this.entries.filter((n) => !isSeen(n, this.seen())).length);

  constructor() {
    // fechar a faixa numa aba fecha nas outras
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== KEY) return;
        const list = readSeen(e.newValue);
        if (list) this.seen.set(new Set(list));
      });
    }
  }

  /** As novidades que esta pessoa ainda não tinha visto. */
  unseenIds(): Set<string> {
    return new Set(this.entries.filter((n) => !isSeen(n, this.seen())).map((n) => n.id));
  }

  /** Fecha a faixa: ela não volta. */
  dismiss(key: string): void {
    this.mark([key]);
  }

  /** Abriu a página: tudo conta como visto, e a faixa de novidade vai embora. */
  seeAll(): void {
    this.mark(this.entries.map((n) => n.id));
  }

  private mark(keys: string[]): void {
    const next = new Set(this.seen());
    let changed = false;
    for (const k of keys) {
      if (!next.has(k)) {
        next.add(k);
        changed = true;
      }
    }
    if (!changed) return;
    this.seen.set(next);
    this.save(next);
  }

  private load(): ReadonlySet<string> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      /* sem localStorage: a faixa volta a cada abertura, o que é melhor que nunca avisar */
    }
    const list = readSeen(raw);
    if (list) return new Set(list);
    const first = new Set(firstSeen(this.entries, this.store.hasContent()));
    this.save(first);
    return first;
  }

  private save(seen: ReadonlySet<string>): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ vistas: [...seen].slice(-MAX_SEEN) }));
    } catch {
      /* cota cheia ou sem localStorage: só esta aba lembra */
    }
  }
}
