import { Injectable, computed, inject, signal } from '@angular/core';
import { Cloud, CloudNotice } from './cloud-config';
import { ReviewStore } from './review-store';
import { localDay } from './review';

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
    id: '2026-10-10-tamanho-dos-widgets',
    version: '1.28.13',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'O tamanho dos widgets',
    items: [
      'No painel de cada widget (contador, imagem, vídeo e áudio) dá para escolher o tamanho: Pequeno, Médio ou Grande. Cada botão tem o desenho de quanto o widget ocupa da ficha, e o Médio é o de sempre.',
      'O tamanho vale em todo lugar onde a anotação aparece: na ficha do mural, nas fichas inteiras, na leitura, no Feed e no mural de alguém. Na ficha do mural, o Grande vai até o fim da ficha, sem a ficha crescer.',
      'A prévia do painel mostra o widget do tamanho escolhido de dois jeitos: na ficha do mural e aberta.',
      'Escrevendo à mão, é só pôr o tamanho no fim da marca: {{contador: 19/11/2026 | GTA VI | grande}}.',
    ],
  },
  {
    id: '2026-10-10-vinil-maior-na-ficha',
    version: '1.28.12',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'O vinil maior na ficha',
    items: ['Na ficha do mural, o tempo e a barra do vinil ficam ao lado do disco, e o vinil usa a altura toda: fica cerca de um quarto maior, sem a ficha crescer. Na leitura, continua como era.'],
  },
  {
    id: '2026-10-10-legenda-numa-etiqueta',
    version: '1.28.11',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A legenda da foto colada numa etiqueta',
    items: ['Na imagem e no vídeo colados com a moldura de foto ou de recorte, a legenda agora vem numa etiqueta de papel branco colada no pé da foto, em vez de escrita direto na cartolina. Na polaroide, ela continua na faixa branca de baixo.'],
  },
  {
    id: '2026-10-10-clicar-no-widget-ou-no-link',
    version: '1.28.10',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'Um clique no widget ou no link abre o painel dele',
    items: [
      'No editor da anotação, clicar na linha de um widget (contador, imagem, vídeo, áudio) abre o painel dele com o que está escrito, para trocar.',
      'Clicar num link, para outra anotação ou para um endereço, abre o painel do link, com o texto e para onde ele vai, e "Trocar o link".',
    ],
  },
  {
    id: '2026-10-10-revelar-spoilers-no-feed',
    version: '1.28.9',
    kind: 'melhoria',
    date: '2026-10-10',
    title: '"Revelar spoilers" no Feed',
    items: ['No Feed, a ficha em segredo (o que você ainda não avaliou) ganhou o botão "Revelar spoilers", no lugar do aviso de que a nota fica em segredo. Ele mostra só aquela ficha, enquanto a página estiver aberta.'],
  },
  {
    id: '2026-10-10-parte-de-varias-notas',
    version: '1.28.8',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A sub-nota citada em várias anotações',
    items: ['A sub-nota que mais de uma anotação cita diz quantas são ("Parte de 2 notas"), na ficha e na leitura. Na leitura, tocar no número abre a lista delas.'],
  },
  {
    id: '2026-10-10-anotacao-sem-data-em-branco',
    version: '1.28.7',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A anotação sem data fica em branco',
    items: ['Na ficha da anotação sem data, o lugar da data fica vazio, em vez de "Sem data".'],
  },
  {
    id: '2026-10-10-ficha-com-faixa-do-mesmo-tamanho',
    version: '1.28.6',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A anotação com fita ou vinil do mesmo tamanho das outras',
    items: ['A anotação com uma fita cassete ou um vinil volta a ter o mesmo tamanho máximo das outras fichas no mural. A faixa cabe nela, um pouco menor que na leitura.'],
  },
  {
    id: '2026-10-10-cor-das-categorias-no-mural-de-alguem',
    version: '1.28.5',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'O ícone e a cor das categorias também no mural de alguém',
    items: [
      'Quem abre o seu mural de anotações vê as categorias com o ícone e a cor que você escolheu, na orelha das fichas e nas abas.',
      'Só vão as categorias das anotações publicadas: o nome de uma categoria que você usa só nas privadas não aparece para ninguém.',
      'Os amigos veem as cores depois que este aparelho sincronizar uma vez com a versão nova (isso acontece sozinho).',
    ],
  },
  {
    id: '2026-10-10-orelha-de-papel-unico',
    version: '1.28.4',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A orelha colorida num papel só',
    items: ['Na categoria com cor, o papel por fora da borda colorida agora é o mesmo de dentro, e a borda ficou um pouco mais grossa.'],
  },
  {
    id: '2026-10-10-site-em-branco-com-cor-de-categoria',
    version: '1.28.3',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'O site em branco depois de dar cor a uma categoria',
    items: ['Quem tinha escolhido um ícone ou uma cor para uma categoria das anotações via o site abrir só com o fundo, sem nada. Ele volta a abrir, com as escolhas guardadas.'],
  },
  {
    id: '2026-10-10-letra-das-abas-de-categoria',
    version: '1.28.2',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'A letra das abas de categoria de volta ao tamanho',
    items: ['Desde a 1.28.0, o nome das categorias nas abas em cima da busca aparecia em letras maiores e mais grossas. Ele voltou à letra de antes, igual à da aba Tudo.'],
  },
  {
    id: '2026-10-10-borda-pela-orelha-inteira',
    version: '1.28.1',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A cor da categoria pela orelha inteira',
    items: ['A borda colorida da categoria agora corre por dentro da orelha inteira, rente à beirada, e o pé dela fica escondido atrás da ficha (ou da pasta, nas abas). Antes era uma etiqueta fechada no meio da orelha.'],
  },
  {
    id: '2026-10-10-icone-e-cor-das-categorias',
    version: '1.28.0',
    kind: 'funcionalidade',
    date: '2026-10-10',
    title: 'Ícone e cor para as categorias',
    items: [
      'No editor da anotação, "Ícone e cor" ao lado da categoria escolhe o desenho dela e a cor da etiqueta. Vale para todas as anotações daquela categoria.',
      'Com cor, o desenho e o nome ficam numa etiqueta de borda colorida fina dentro da orelha da ficha e da aba em cima da busca. Sem cor, tudo fica como era.',
      'As abas das categorias agora mostram o desenho de cada uma.',
      'Com conta, o ícone e a cor valem em todos os seus aparelhos. Quem abre o seu mural vê as categorias do jeito de sempre.',
    ],
  },
  {
    id: '2026-10-10-cartela-de-categorias-menor',
    version: '1.27.5',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A cartela de categorias mais curta',
    items: [
      'Nas anotações, a cartela de categorias vem só com Trabalho e Estudos. As outras você escreve à mão, e cada uma fica na cartela depois de usada.',
      'Quem já usa Receitas, Diário ou outra da cartela de antes continua com ela, com o mesmo desenho.',
    ],
  },
  {
    id: '2026-10-10-ficha-com-faixa-mais-alta',
    version: '1.27.4',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A fita e o vinil grandes na ficha de sempre',
    items: ['A anotação com uma fita cassete ou um vinil mostra mais linhas no mural: eles aparecem quase do tamanho da leitura, e o texto em volta continua à vista. Com o player simples, a ficha fica como era.'],
  },
  {
    id: '2026-10-10-faixa-maior-na-ficha',
    version: '1.27.3',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A faixa de áudio maior na ficha',
    items: [
      'Nas fichas inteiras, a fita cassete e o vinil aparecem do tamanho que têm na leitura.',
      'Na ficha de sempre, eles ficaram maiores e ainda cabem inteiros com uma linha de texto em cima.',
    ],
  },
  {
    id: '2026-10-10-player-nao-recarrega',
    version: '1.27.2',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'O som que parava e voltava enquanto você escrevia',
    items: ['Com uma faixa do YouTube ou do Vimeo tocando (ou um vídeo), mexer no nome ou na legenda recarregava o player a cada letra: o som parava e voltava. Agora ele só recarrega quando o link muda.'],
  },
  {
    id: '2026-10-10-campos-do-widget-sem-moldura',
    version: '1.27.1',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'Os campos do painel de widget sem a moldura',
    items: ['No painel de widget, o campo onde você está escrevendo não ganha mais a moldura preta em volta: só o risco de baixo fica mais grosso.'],
  },
  {
    id: '2026-10-10-widget-audio',
    version: '1.27.0',
    kind: 'funcionalidade',
    date: '2026-10-10',
    title: 'Áudio nas anotações',
    items: [
      'Widget novo no menu "Widgets" do editor da anotação: Áudio. Você cola o link de um arquivo de som (.mp3, .ogg, .wav…), de um vídeo do YouTube ou do Vimeo, ou de um .mp4, e ele toca ali mesmo (de um vídeo, só o som).',
      'Três jeitos. Fita cassete: o nome escrito na etiqueta, os carretéis girando e a fita passando de um lado para o outro pela janela; embaixo, as teclas do toca-fitas (voltar, tocar, avançar) e o contador. Dá para arrastar na janela para andar na fita.',
      'Simples: uma tira de papel com o botão de tocar, o nome, a barra de arrastar e o tempo.',
      'Vinil: a capa é a foto do vídeo (sem foto, um envelope pardo com o nome escrito a pincel) e o disco sai pela metade, com o botão de tocar no meio. Tocando, ele gira e sai mais um pouco da capa.',
      'Só uma faixa toca por vez: dar o play numa para a outra. Dá para tocar até na ficha do mural. Escrito à mão: {{audio: https://… | nome | vinil}}.',
    ],
  },
  {
    id: '2026-10-10-contador-de-caracteres',
    version: '1.26.10',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'O contador de caracteres do texto',
    items: [
      'Embaixo da folha do texto (na resenha e na anotação), um contador mostra quantos caracteres já foram escritos, de 20.000. Perto do fim ele fica em negrito.',
      'O campo não deixa passar de 20.000: o que for escrito ou colado além disso não entra. Antes, o texto maior aparecia inteiro, mas era cortado ao recarregar a página.',
    ],
  },
  {
    id: '2026-10-10-limites-e-fantasma',
    version: '1.26.9',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'Os limites do dia na nuvem e o mural vazio no celular',
    items: [
      'O limite de 300 reações por dia conta cada reação dada: trocar ou tirar a reação e reagir de novo não abre mais vaga (e não enche o correio de quem recebe).',
      'O limite de 10 entradas por dia numa conta conta cada entrada: sair e entrar de novo não abre mais vaga.',
      'No celular, o mural vazio mostra a primeira ficha tracejada (o lugar da primeira resenha); antes as três sumiam.',
    ],
  },
  {
    id: '2026-10-10-tags-sem-acento',
    version: '1.26.8',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'Tags e categorias sem diferença de acento nos filtros',
    items: [
      'No filtro das anotações, "Diário" e "diario" são a mesma categoria, e "Bug" e "bug" a mesma tag: uma opção só, escrita do jeito mais usado, que mostra as anotações das duas grafias.',
      'O site guardado para abrir sem internet joga fora os arquivos de versões antigas que ninguém pede há mais de 30 dias (os da versão atual ficam sempre).',
      'A página de privacidade conta das reações, das anotações e das resenhas privadas, e da cópia diária do banco.',
    ],
  },
  {
    id: '2026-10-10-foto-e-descartar',
    version: '1.26.7',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'A foto colada e o descartar do editor',
    items: [
      'O brilho da foto colada numa anotação cobre a foto inteira, como o plástico de uma foto revelada: antes era um quadradinho que piscava no canto de cima.',
      'Enquanto a foto colada carrega, fica só o papel em branco, sem o aro girando dos botões.',
      'Com a pergunta de descartar na tela, só o botão Descartar joga o texto fora: o X, o Cancelar e o clique fora não fecham mais o editor, e um segundo Esc volta a escrever.',
    ],
  },
  {
    id: '2026-10-10-paginas',
    version: '1.26.6',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'Consertos nas páginas e nos jogos',
    items: [
      '"Baixar backup" (no aviso de erro ao salvar) e "Tenho um backup" (no mural vazio) abrem Ajustes direto na aba do Backup, também com Ajustes já aberto.',
      'Nas seções por categoria, tag ou nota de uma categoria, as etiquetas deslizam junto com as fichas, como nas outras ordens.',
      'No Comparar, o círculo de "maior" na nota final segue a nota como aparece: com Inteiros, 8,4 e 8,2 são os dois 8, sem vencedor.',
      'No Comparar, "Mostrar mais" não volta para o começo quando o mural do colega se atualiza da nuvem.',
      'No Muraldle do dia, as dicas abertas não se fecham quando uma ficha é editada no meio do jogo.',
      'No Mata-mata, no Maior ou menor e no Muraldle, o foco vai para o placar e para o resultado (antes ele caía no vazio ao começar e ao terminar).',
      'Em Amigos, abrir e fechar o "Seguir pelo código" deixa o foco no lugar certo.',
      'Nas Estatísticas, um ano só com rejogadas mostra "–" na conta das que chegaram ao fim (era "–%"); no Ranking, a ficha mais longa nunca é uma de 0 horas.',
      'O aviso de Ajustes, o seu código e a busca do Muraldle são lidos direito pelo leitor de tela.',
      'Se o backup não puder ser montado, um bilhete avisa (antes nada acontecia).',
      'Passar o mouse na aba escolhida (em Ajustes, Amigos, Estatísticas, Ranking e nos jogos) não tira mais o amarelo dela.',
      'Um botão de tinta desligado (esperando outra coisa terminar) não sobe nem gira com o mouse em cima.',
    ],
  },
  {
    id: '2026-10-10-folhas-e-campos',
    version: '1.26.5',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'Consertos no editor, nas folhas e nos menus',
    items: [
      'A imagem colada numa anotação aparece quando o link é corrigido: antes, um pedaço do link que não abria deixava "A imagem não abriu" mesmo com o link certo.',
      'Citação numa linha vazia põe o "> " em vez de apagar a quebra de linha de antes.',
      'Selecionar um nome na folha de reações e soltar fora dela não fecha mais a folha.',
      'Esc no painel de todos os emojis volta para a fileira com o foco no "+".',
      'Uma pergunta nova no lugar de outra começa com o foco no Cancelar, como a primeira.',
      'Uma vírgula sozinha no campo de tags não fica mais escrita lá.',
      'A lista de sub-notas abre com o foco na primeira delas.',
      'Na wishlist, depois de trocar a vontade de um recorte, o foco volta para o adesivo dele.',
      'A cartela de filtros fecha ao trocar de mural (ela voltava aberta ao voltar para o mural de antes).',
      'No Safari e no iPhone, tocar num mural do seletor do cartaz troca de mural (o menu fechava antes).',
      'As abas das anotações medem o tamanho de novo quando a fonte delas chega, na primeira visita.',
    ],
  },
  {
    id: '2026-10-10-sincronizacao-e-backups',
    version: '1.26.4',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'Consertos na sincronização, nos backups e nas anotações',
    items: [
      'Ao entrar na nuvem com um mural de outra conta neste navegador, "Começar vazia" agora começa vazia mesmo: as anotações da outra conta não vêm mais junto.',
      'Com o mural aberto em duas abas, editar uma resenha logo depois de a outra aba mexer não desfaz mais uma anotação editada lá.',
      'Um aviso de outra aba que chegava no meio de uma gravação podia voltar o mural para trás na memória. Não volta mais.',
      '"Sincronizar agora" e "Sair e tirar daqui" esperam o envio que já estava em andamento, em vez de avisar que ainda tem coisa só aqui.',
      'Abrir Amigos logo ao entrar no site traz também o "visto" feito em outro aparelho.',
      'Restaurar um backup de outro aplicativo, ou de uma versão mais nova do Meu Mural, avisa antes de qualquer pergunta e não mexe em nada.',
      'Ao finalizar as anotações ligadas numa tarefa, o Desfazer reabre só as que foram finalizadas ali, não as que já estavam finalizadas.',
      'Uma tarefa escrita dentro de um bloco de código não entra mais na conta das tarefas da anotação.',
      'Um [[link]] dentro de um código (ou escapado com uma barra invertida antes) é só texto: não liga as anotações, não aparece como citação e não muda quando a outra anotação troca de nome.',
      'Na imagem e no vídeo, uma legenda que é o nome de uma moldura ("Recorte", "Foto") continua sendo a legenda, e a moldura escolhida não se perde.',
    ],
  },
  {
    id: '2026-10-10-abas-por-quantidade',
    version: '1.26.3',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'As abas das anotações pela quantidade',
    items: [
      'As abas de categoria em cima da busca vão da que tem mais anotações para a que tem menos, pelo número que aparece nelas. Antes, as finalizadas escondidas também contavam, e a ordem parecia não seguir os números.',
      '"Sem categoria" entra na mesma ordem: com mais anotações, vem antes das categorias; no empate, depois.',
    ],
  },
  {
    id: '2026-10-10-feitas-na-leitura',
    version: '1.26.2',
    kind: 'correcao',
    date: '2026-10-10',
    title: 'As tarefas feitas na anotação aberta',
    items: [
      'Com "Mostrar as tarefas feitas" ligado na anotação aberta, marcar ou desmarcar uma tarefa voltava a esconder as feitas. Agora a escolha fica como estava até você abrir outra anotação.',
      'As feitas só se recolhem quando a anotação abre: a tarefa que você marca agora continua à vista, e a que você desmarcou e marcou de novo também, até abrir a anotação de novo.',
    ],
  },
  {
    id: '2026-10-10-orelha-inteira',
    version: '1.26.1',
    kind: 'melhoria',
    date: '2026-10-10',
    title: 'A categoria inteira na orelha da ficha',
    items: [
      'O nome da categoria na orelha da anotação não é mais cortado com "…" por causa da tachinha: quando o nome é comprido, a tachinha fura a cartolina logo depois da orelha.',
    ],
  },
  {
    id: '2026-10-10-widgets-imagem-video',
    version: '1.26.0',
    kind: 'funcionalidade',
    date: '2026-10-10',
    title: 'Imagem e vídeo nas anotações',
    items: [
      'Dois widgets novos no menu "Widgets" do editor da anotação: Imagem e Vídeo. Você cola o link e eles aparecem como uma foto revelada colada na cartolina, meio torta, com o brilho do papel fotográfico.',
      'A moldura pode ser a borda branca da foto, uma polaroide (a legenda vai escrita na faixa de baixo) ou um recorte rente. A legenda é opcional.',
      'O vídeo toca ali mesmo: YouTube, Vimeo ou um arquivo .mp4. A foto mostra a capa com um adesivo redondo de tocar; o player só carrega quando você toca, e a foto se endireita para assistir. Dá para tocar até na ficha do mural.',
      'No painel, o widget aparece como vai ficar, e um link que não serve diz o porquê. Escrito à mão: {{imagem: https://… | legenda | polaroid}} e {{video: https://youtu.be/… | legenda}}.',
      'O estrago da ficha nunca come a foto colada, nem o bloquinho do contador.',
    ],
  },
  {
    id: '2026-10-09-menu-widgets',
    version: '1.25.1',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Os widgets num menu, sem quebrar a régua',
    items: [
      'No editor da anotação, o botão "Widgets" fica ao lado do "Mais" e abre um menu com todos os widgets (por enquanto, o Contador, com o que ele faz). A régua de formatação não quebra mais em duas linhas.',
      'Com pouco espaço, "Ver como fica" mostra só o olho, e as ferramentas rolam de lado em vez de pular para a linha de baixo.',
    ],
  },
  {
    id: '2026-10-09-widgets-contador',
    version: '1.25.0',
    kind: 'funcionalidade',
    date: '2026-10-09',
    title: 'Widgets nas anotações: o contador',
    items: [
      'As anotações ganham widgets, peças vivas que você põe em qualquer lugar do texto. O primeiro é o contador: conta o tempo que falta até um dia e uma hora.',
      'Ele é um bloquinho de calendário de destacar, colado na anotação com fita crepe: "Faltam 40 dias" na folha e, ao lado, para quê, o dia e as horas, os minutos e os segundos andando. Quando o número muda, a folha é arrancada e cai.',
      'Chegou o dia: a folha vira a daquele dia, com o carimbo "Chegou!" e há quanto tempo foi. Com "Todo ano" (aniversário, Natal), ele diz "É hoje!" e no dia seguinte volta a contar para o ano que vem.',
      'No editor da anotação, o botão "Widget" da régua abre os campos (para quê, dia, hora, todo ano) com o contador já andando embaixo. Com o cursor na linha de um contador, o mesmo botão abre para trocar.',
      'Ele fica escrito no texto, numa linha só dele: {{contador: 19/11/2026 18:00 | Lançamento}}. Dá para escrever à mão também; sem o ano, conta todo ano.',
    ],
  },
  {
    id: '2026-10-09-pasta-em-todo-lugar',
    version: '1.24.5',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'A busca e os filtros na pasta, em todo lugar',
    items: [
      'A busca, a ordem e os filtros dos murais de resenhas, do Pra depois, da Wishlist e das fichas do Comparar agora moram na mesma pasta de papel manilha das anotações: a busca numa etiqueta colada, os controles impressos em tinta, separados por um picote, e o ligado com o traço de marca-texto.',
      'Depois da linha picotada ficam os filtros ligados (cada um com o seu X), o "Mostrando 3 de 12" com o Limpar e as tarefas; no Pra depois e na Wishlist, o recado de como usar a página.',
      'Ordenar é sempre o mesmo campo, "Ordenar: Mais novos", inclusive no Pra depois e na Wishlist. Filtrar continua abrindo a cartela, logo embaixo da pasta.',
      'No Comparar, "Em comum", "Dicas de…" e "Suas dicas" viram as divisórias em cima da pasta, como as categorias das anotações.',
    ],
  },
  {
    id: '2026-10-09-voltar-a-amigos',
    version: '1.24.4',
    kind: 'correcao',
    date: '2026-10-09',
    title: 'A volta certa do mural de alguém',
    items: [
      'Quem abre o mural de alguém em Amigos agora tem "Voltar a Amigos" no alto, em vez de "Voltar à comparação", que levava para Comparar.',
    ],
  },
  {
    id: '2026-10-09-mural-de-alguem-igual-ao-seu',
    version: '1.24.3',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'O mural de alguém igual ao seu',
    items: [
      'O mural de outra pessoa agora tem a mesma régua e a mesma parede do seu: as fichas inteiras em colagem, a ordem por cada nota (História, Diversão…), as seções que fecham no maço com elástico e a conta das tarefas.',
      'No mural de anotações de alguém, a pasta é a mesma do seu: as abas por categoria, os atalhos das tags, a lista, as fixadas no topo e o "Mostrando N de M" com "+N em outras abas".',
      'A ordem e o tipo de ficha que você escolhe nos murais dos outros ficam guardados à parte: mudar lá não mexe mais no seu mural. A aba, a busca e as seções fechadas começam do zero a cada pessoa.',
      'Os cartões de quando nada aparece ("Tudo finalizado", "Nada no mural de Marina com esse filtro") são os mesmos do seu mural, falando da pessoa.',
      'No celular, a busca do mural de alguém ocupa a fileira inteira, e o "Mostrar notas" fica ao lado da ordem.',
    ],
  },
  {
    id: '2026-10-09-revelar-a-nota-fica',
    version: '1.24.2',
    kind: 'correcao',
    date: '2026-10-09',
    title: 'A nota revelada continua revelada',
    items: [
      'No mural de alguém e em Comparar, a ficha em segredo revelada com "Revelar a nota" agora continua à mostra no mural depois de fechar a leitura, enquanto a página estiver aberta. "Esconder a nota" (ou "Esconder notas") volta com ela para o segredo.',
    ],
  },
  {
    id: '2026-10-09-tarefas-feitas-com-espacos',
    version: '1.24.1',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Uma conta só nas listas com espaços',
    items: [
      'Tarefas separadas por linhas em branco agora são uma lista só para a conta das feitas: em vez de uma linha "1 tarefa feita" para cada uma, sai uma só no fim ("31 tarefas feitas"). Só um texto entre as listas separa as contas.',
    ],
  },
  {
    id: '2026-10-09-tarefas-feitas-recolhidas',
    version: '1.24.0',
    kind: 'funcionalidade',
    date: '2026-10-09',
    title: 'Tarefas feitas recolhidas',
    items: [
      'Nas anotações do mural, as tarefas já feitas saem da ficha e viram uma linha só no fim de cada lista, com o tique vermelho: "3 tarefas feitas". Uma anotação comprida não fica mais ocupando a parede com o que já foi resolvido.',
      'Cada lista de tarefas tem a sua conta: um texto entre duas listas separa as duas.',
      'A tarefa que você marca agora continua à vista, riscada, até a página recarregar (ou até você editar a anotação). Assim ela não some debaixo do dedo.',
      'Na anotação aberta, as feitas também ficam recolhidas, e o "Mostrar as tarefas feitas", em cima do texto, mostra a anotação como ela é.',
    ],
  },
  {
    id: '2026-10-09-colagem-sem-etiquetas',
    version: '1.23.11',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Colagem sem etiquetas',
    items: [
      'Nas fichas inteiras, as etiquetas das seções (Fixadas, Outubro de 2026 e as outras) não aparecem mais: a parede inteira é uma colagem só, na ordem escolhida.',
    ],
  },
  {
    id: '2026-10-09-colagem-sem-encostar',
    version: '1.23.10',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Colagem sem fichas encostando',
    items: [
      'Nas fichas inteiras, as fichas curtas continuam tortinhas como sempre, e quanto mais comprida a ficha, mais reta ela fica: as muito compridas ficam retas. Assim o pé de uma ficha comprida não invade mais a vizinha.',
      'Cada ficha agora gira só dentro do seu espaço na parede, então duas fichas nunca se encostam.',
    ],
  },
  {
    id: '2026-10-09-sem-tamanho-da-ficha',
    version: '1.23.9',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Um tamanho só para as anotações',
    items: [
      'Saiu o Tamanho da ficha (Normal, Larga, Alta) do editor das anotações: toda anotação fica do tamanho de sempre no mural, e as que eram largas ou altas voltam a ele.',
      'Para ler o texto todo direto na parede, use o tipo de ficha Fichas inteiras.',
    ],
  },
  {
    id: '2026-10-09-trocar-mural-leva-ao-mural',
    version: '1.23.8',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Trocar de mural leva ao mural',
    items: [
      'Trocar de mural nos Ajustes, nas Novidades ou em Amigos (com as novidades de todos os murais misturadas) agora leva você direto ao mural escolhido. Antes, a tela continuava a mesma e parecia que nada tinha acontecido.',
      'Nas páginas que mudam com o mural (Pra depois, Wishlist, Extras, Amigos separado por mural), a troca continua na mesma página.',
    ],
  },
  {
    id: '2026-10-09-correcao-enter-no-item',
    version: '1.23.7',
    kind: 'correcao',
    date: '2026-10-09',
    title: 'Correção de bug',
    items: [
      'Enter com o cursor no começo de uma tarefa, de um item de lista ou de um item numerado dobrava o marcador (ficava "- [ ] - [ ] tarefa"). Agora um item vazio entra em cima e o item desce inteiro, como num editor de texto.',
    ],
  },
  {
    id: '2026-10-09-correcao-ficha-levantada',
    version: '1.23.6',
    kind: 'correcao',
    date: '2026-10-09',
    title: 'Correção de bug',
    items: [
      'Depois de abrir uma ficha e fechar a leitura, a ficha continuava levantada da parede, como se o mouse estivesse em cima dela, até você clicar em outro lugar. Agora ela volta para o lugar (pelo teclado, continua levantada, junto com a marca do foco).',
    ],
  },
  {
    id: '2026-10-09-marca-texto-fino',
    version: '1.23.5',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Marca-texto mais fino',
    items: [
      'O marca-texto (==assim==) ficou mais baixo: pega a altura das letras e para por ali, sem cobrir a linha de cima nem a de baixo. Num trecho de várias linhas, cada linha tem a sua passada, com um respiro entre elas.',
    ],
  },
  {
    id: '2026-10-09-abas-por-quantidade',
    version: '1.23.4',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Abas das anotações por tamanho',
    items: [
      'As abas das categorias ficam na ordem de quantas anotações cada uma tem: a maior primeiro (no empate, de A a Z). Sem categoria continua no fim.',
      'As finalizadas contam também, então finalizar uma anotação não tira a aba do lugar.',
    ],
  },
  {
    id: '2026-10-09-bonus-acessibilidade',
    version: '1.23.3',
    kind: 'melhoria',
    date: '2026-10-09',
    title: 'Bônus de acessibilidade',
    items: [
      'A cartela de bônus dos jogos ganhou o adesivo Boa acessibilidade, para o jogo com legendas, modos para daltônicos, controles ajustáveis e outras opções que deixam mais gente jogar.',
    ],
  },
  {
    id: '2026-10-08-anotacoes-do-colega',
    version: '1.23.2',
    kind: 'correcao',
    date: '2026-10-08',
    title: 'Correção de bug',
    items: [
      'O mural de quem você segue, aberto antes das anotações existirem, continuava sem as anotações públicas da pessoa até ela mexer no mural. Agora ele é baixado de novo.',
    ],
  },
  {
    id: '2026-10-08-acabamento-colagem',
    version: '1.23.1',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Acabamento da colagem e das sub-notas',
    items: [
      'Nas fichas inteiras, a anotação larga fica da largura das outras: a colagem não deixa mais buraco, segue a ordem escolhida e não passa da tela em janelas estreitas.',
      'A marca da sub-nota sempre diz em quantas anotações ela é citada.',
      'Na lista de onde a sub-nota é citada, cada linha mostra o trecho em até duas linhas, com o link sublinhado à caneta como na ficha, e a cor da anotação num marcador de página, como na Lista.',
    ],
  },
  {
    id: '2026-10-08-fichas-inteiras',
    version: '1.23.0',
    kind: 'funcionalidade',
    date: '2026-10-08',
    title: 'Fichas inteiras, em colagem',
    items: [
      'Um tipo de ficha novo, em todos os murais: Fichas inteiras. Cada ficha mostra o texto todo (a resenha inteira, não só a primeira frase; a anotação sem cortar no fim).',
      'Como cada ficha fica de um tamanho, elas se encaixam em colunas, como as folhas do Pra depois: a seguinte cai embaixo da mais curta, sem buraco na parede, cada uma um pouco fora do prumo.',
      'No celular, as fichas inteiras ficam uma embaixo da outra.',
    ],
  },
  {
    id: '2026-10-08-tarefa-finaliza-ligada',
    version: '1.22.0',
    kind: 'funcionalidade',
    date: '2026-10-08',
    title: 'A tarefa que finaliza a anotação',
    items: [
      'Marcou uma tarefa com link para outra anotação (como "- [ ] [[Corrigir o login]]")? O mural pergunta se você quer finalizar a anotação do link também. Com vários links na mesma tarefa, finaliza todas de uma vez, e o bilhete tem Desfazer.',
    ],
  },
  {
    id: '2026-10-08-sub-nota-citada',
    version: '1.21.0',
    kind: 'funcionalidade',
    date: '2026-10-08',
    title: 'De onde vem a sub-nota',
    items: [
      'A sub-nota ganhou uma marca na beirada de cima da ficha, uma setinha de item de dentro, sempre à mostra (como o alfinete da fixada). Com mais de uma anotação apontando para ela, a marca diz quantas.',
      'Tocar na marca abre a lista das anotações que apontam para a sub-nota, com a linha onde cada uma a cita; tocar numa delas abre aquela anotação.',
    ],
  },
  {
    id: '2026-10-08-fixadas-na-ordem',
    version: '1.20.14',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'As fixadas seguem a ordem',
    items: [
      'Nas anotações, ordenando por Data, Título, Categoria ou Tag, as fixadas seguem a ordem, no meio das outras. Só a Prioridade as deixa sempre no topo.',
      'Quem preferir as fixadas no topo em qualquer ordem liga o alfinete ao lado da ordem, na pasta (ele aparece quando a aba tem alguma fixada, fora da Prioridade).',
    ],
  },
  {
    id: '2026-10-08-correcao-aba-marrom',
    version: '1.20.13',
    kind: 'correcao',
    date: '2026-10-08',
    title: 'Correção de bug',
    items: [
      'Ao escolher uma categoria nas anotações, a aba aparecia marrom por cima da borda da pasta por um instante antes de clarear.',
    ],
  },
  {
    id: '2026-10-08-sol-inteiro',
    version: '1.20.12',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Desbotada no sol, inteira',
    items: [
      'Metade das fichas com o estrago "Desbotada no sol" agora desbotam inteiras, sem a marca do que cobria um pedaço da cartolina. A outra metade continua igual.',
    ],
  },
  {
    id: '2026-10-08-orelha-sobe',
    version: '1.20.11',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'A orelha da categoria sobe',
    items: [
      'A orelha da categoria, nas fichas de anotação, fica um pouco mais alta, mais solta da cartolina.',
      'Com o mouse em cima da ficha, a orelha sobe mais um pouco, como a divisória puxada para achar a matéria.',
    ],
  },
  {
    id: '2026-10-08-elastico-estala',
    version: '1.20.10',
    kind: 'correcao',
    date: '2026-10-08',
    title: 'Correção de bug',
    items: [
      'O reflexo do elástico do maço piscava sem parar. Agora o elástico fica parado; ao fechar uma seção, ele estala uma vez na pilha, e com o mouse em cima estica um pouco.',
    ],
  },
  {
    id: '2026-10-08-pasta-refinada',
    version: '1.20.9',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Abas, tags e maço das anotações',
    items: [
      'Toda categoria ganha a sua aba em pé, enquanto couber na largura e até oito abas contando Tudo; só as que sobram, as com menos anotações, vão para o "Mais".',
      'As abas de trás ficam atrás da pasta, com o pé escondido pela borda; só a aberta vem para a frente.',
      'As categorias voltam a ser só papel manilha e tinta, sem cores.',
      'O Filtrar saiu das anotações: as abas já separam as categorias, e as tags ficam na pasta também em Tudo (as mais usadas primeiro; o "+N" mostra as outras). O "Mostrando" e o "Limpar" ficam na pasta, ao lado das tarefas.',
      'O maço da seção fechada ganhou um elástico amarelo de verdade, de duas voltas, apertando a pilha.',
    ],
  },
  {
    id: '2026-10-08-pasta-anotacoes',
    version: '1.20.8',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'A pasta das anotações e as seções em maço',
    items: [
      'A régua do mural de anotações virou uma pasta: as divisórias em cima e, emendado nelas, o papel manilha com a busca, o Filtrar, as Finalizadas, a ordem e o tipo de ficha. O que está ligado ganha um traço de marca-texto.',
      'As tags da aba e as tarefas ficam dentro da pasta, logo abaixo dos controles. No celular, as tags correm numa linha só, de lado.',
      'Cada categoria tem a sua cor, numa etiquetinha na janela da divisória (como nas pastas suspensas), e é sempre a mesma: na aba, na ficha e na Lista.',
      'Na ficha, a orelha da categoria fica atrás da cartolina, saindo pela beirada de cima, como a divisória de matéria do caderno.',
      'Fechar uma seção vale agora em todos os murais. Fechada, ela vira um maço de fichas preso com elástico, nas cores das cartolinas, no lugar da lista de títulos.',
    ],
  },
  {
    id: '2026-10-08-correcao-filtro-aba',
    version: '1.20.7',
    kind: 'correcao',
    date: '2026-10-08',
    title: 'Correção de bug',
    items: [
      'O Filtrar, aberto numa aba de categoria das anotações, ficava desarrumado: as tags iam para um canto e sobrava um buraco no meio da cartela.',
    ],
  },
  {
    id: '2026-10-08-acabamento-abas',
    version: '1.20.6',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'Acabamento das abas e da lista',
    items: [
      'Na Lista, em Tudo, cada linha diz a categoria da anotação, na mesma orelha de papel manilha da ficha.',
      'O nome comprido de uma categoria termina em reticências na aba (o nome inteiro aparece ao parar o mouse em cima).',
    ],
  },
  {
    id: '2026-10-08-orelha-categoria',
    version: '1.20.5',
    kind: 'melhoria',
    date: '2026-10-08',
    title: 'A categoria na orelha da ficha',
    items: [
      'Na ficha da anotação, a categoria virou uma orelha de divisória de papel manilha, colada atrás da cartolina e saindo pela beirada de cima, com o desenho e o nome a pincel: a mesma divisória das abas do mural. Dá para ver de longe de que aba cada anotação é.',
      'Com a categoria lá em cima, a fileira ao lado da foto fica só com as tags de papel kraft, e cabem mais: até 4 na ficha completa e 2 na simples.',
    ],
  },
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

export const NEWS_SEEN_KEY = 'meu-mural:novidades';
const KEY = NEWS_SEEN_KEY;
/** Um limite para os avisos da nuvem vistos não crescerem para sempre (eles não estão em NEWS). */
const MAX_SEEN = 200;

/** Hoje, AAAA-MM-DD, no fuso de quem usa. */
export function today(now = new Date()): string {
  return localDay(now);
}

/**
 * O que vai para a lista de vistas: as novidades vistas, todas (cortar uma faria ela voltar como
 * nova), e os avisos da nuvem só até `MAX_SEEN`, os mais recentes.
 */
export function seenToSave(seen: ReadonlySet<string>, news: readonly NewsEntry[]): string[] {
  const known = new Set(news.flatMap((n) => (n.was ? [n.id, n.was] : [n.id])));
  const list = [...seen];
  return [...list.filter((k) => known.has(k)), ...list.filter((k) => !known.has(k)).slice(-MAX_SEEN)];
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
      localStorage.setItem(KEY, JSON.stringify({ vistas: seenToSave(seen, this.entries) }));
    } catch {
      /* cota cheia ou sem localStorage: só esta aba lembra */
    }
  }
}
