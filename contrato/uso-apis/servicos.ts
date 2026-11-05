/**
 * As APIs que o Murall usa e o limite de cada uma (PLANO-ADMIN-APIS.md, seções 3 e 4), para a tela Uso das
 * APIs. Um limite de terceiro muda sem aviso: cada um diz de onde veio e quando foi conferido, e a tela mostra
 * isso. "Faltam N" só existe onde há um total para acabar: `cota-global`.
 */

/** Por onde a chamada passa, e por isso o quanto dá para confiar na conta. */
export type MedidoEm = 'worker' | 'navegador' | 'cloudflare';

export type TipoDeLimite =
  /** Um total da chave ou do projeto, para todo mundo: dá para dizer quanto falta. */
  | 'cota-global'
  /** Sem total, só um ritmo. */
  | 'ritmo'
  /** Cada pessoa tem o seu, em cada rede: não existe um total para acabar. */
  | 'por-pessoa'
  /** Um freio do próprio Murall. */
  | 'proprio'
  /** Da conta de quem colocou a chave: não gasta nada do site. */
  | 'da-pessoa'
  /** O serviço não publica um número. */
  | 'desconhecido';

export interface LimiteDoServico {
  tipo: TipoDeLimite;
  /** O limite em palavras, como a tela escreve. */
  texto: string;
  /** Só numa `cota-global`: o total e quando ele zera. */
  cota?: { valor: number; janela: 'mes' | 'dia' };
  /** De onde veio o número; sem fonte, não há um número publicado. */
  fonte?: string;
  /** AAAA-MM-DD. */
  conferidoEm?: string;
}

export interface ServicoExterno {
  id: string;
  nome: string;
  /** Como a frase da tela chama, com o artigo: "a RAWG", "o TMDB". */
  chamado: string;
  para: string;
  /** Quando ele cai, o que passa a ir para a Wikipedia. */
  reserva?: string;
  medidoEm: MedidoEm;
  /** De quem é a chave e onde ela fica. */
  chave: string;
  limite: LimiteDoServico;
  /** Onde o próprio serviço mostra o uso. */
  painel?: string;
}

const CONFERIDO = '2026-11-05';

export const SERVICOS: readonly ServicoExterno[] = [
  {
    id: 'rawg',
    nome: 'RAWG',
    chamado: 'a RAWG',
    reserva: 'as buscas de jogos',
    para: 'Busca e capas de jogos',
    medidoEm: 'worker',
    chave: 'Do site, no Worker',
    limite: {
      tipo: 'cota-global',
      texto: '20 mil pedidos por mês, para a chave inteira.',
      cota: { valor: 20_000, janela: 'mes' },
      fonte: 'https://rawg.io/apidocs',
      conferidoEm: CONFERIDO,
    },
    // a conferir quando a RAWG voltar: o site dela estava fora do ar em 05/nov/2026
    painel: 'https://rawg.io/apikey',
  },
  {
    id: 'tmdb',
    nome: 'TMDB',
    chamado: 'o TMDB',
    reserva: 'as buscas de filmes e séries',
    para: 'Busca e pôsteres de filmes e séries',
    medidoEm: 'worker',
    chave: 'Do site, no Worker',
    limite: {
      tipo: 'ritmo',
      texto: 'Sem cota. Uns 40 pedidos por segundo.',
      fonte: 'https://developer.themoviedb.org/docs/rate-limiting',
      conferidoEm: CONFERIDO,
    },
    painel: 'https://www.themoviedb.org/settings/api',
  },
  {
    id: 'google-agenda',
    nome: 'Google Agenda',
    chamado: 'o Google Agenda',
    para: 'Os dois sentidos do Calendário',
    medidoEm: 'worker',
    chave: 'A permissão de cada pessoa, no Worker',
    limite: {
      tipo: 'cota-global',
      texto: '1 milhão de pedidos por dia no projeto, e 600 por minuto por pessoa.',
      cota: { valor: 1_000_000, janela: 'dia' },
      fonte: 'https://developers.google.com/calendar/api/guides/quota',
      conferidoEm: CONFERIDO,
    },
    painel: 'https://console.cloud.google.com/apis/api/calendar-json.googleapis.com/quotas',
  },
  {
    id: 'google-token',
    nome: 'Google, permissões',
    chamado: 'o Google',
    para: 'Renovar e revogar a permissão da Agenda',
    medidoEm: 'worker',
    chave: 'Segredo do site, no Worker',
    limite: { tipo: 'desconhecido', texto: 'Não publica um limite.' },
  },
  {
    id: 'oauth-documento',
    nome: 'Documento de conector',
    chamado: 'o documento de conector',
    para: 'Ler quem pede acesso pelo OAuth',
    medidoEm: 'worker',
    chave: 'Nenhuma',
    limite: { tipo: 'proprio', texto: 'Freio do Murall: 20 por dia, por IP.' },
  },
  {
    id: 'wikipedia',
    nome: 'Wikipedia',
    chamado: 'a Wikipedia',
    para: 'Capas, e a reserva da busca quando a RAWG ou o TMDB falham',
    medidoEm: 'navegador',
    chave: 'Nenhuma',
    limite: {
      tipo: 'por-pessoa',
      texto: 'Por pessoa: 200 por minuto. Não há um total para acabar.',
      fonte: 'https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits',
      conferidoEm: CONFERIDO,
    },
  },
  {
    id: 'open-library',
    nome: 'Open Library',
    chamado: 'a Open Library',
    para: 'Busca e capas de livros',
    medidoEm: 'navegador',
    chave: 'Nenhuma',
    limite: {
      tipo: 'por-pessoa',
      texto: 'Por pessoa: 1 por segundo. Não há um total para acabar.',
      fonte: 'https://openlibrary.org/developers/api',
      conferidoEm: CONFERIDO,
    },
  },
  {
    id: 'kitsu',
    nome: 'Kitsu',
    chamado: 'o Kitsu',
    para: 'Busca e capas de animes',
    medidoEm: 'navegador',
    chave: 'Nenhuma',
    limite: { tipo: 'desconhecido', texto: 'Não publica um limite.' },
  },
  {
    id: 'anilist',
    nome: 'AniList',
    chamado: 'a AniList',
    para: 'A reserva dos animes, quando o Kitsu falha',
    medidoEm: 'navegador',
    chave: 'Nenhuma',
    limite: {
      tipo: 'por-pessoa',
      texto: 'Por pessoa: 30 por minuto (o normal é 90). Não há um total para acabar.',
      fonte: 'https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/rate-limiting',
      conferidoEm: CONFERIDO,
    },
  },
  {
    id: 'itunes',
    nome: 'iTunes',
    chamado: 'o iTunes',
    para: 'Busca, capas e prévias de músicas',
    medidoEm: 'navegador',
    chave: 'Nenhuma',
    limite: {
      tipo: 'por-pessoa',
      texto: 'Por pessoa: uns 20 por minuto, número informal. Não há um total para acabar.',
      fonte: 'https://developer.apple.com/forums/thread/66399',
      conferidoEm: CONFERIDO,
    },
  },
  {
    id: 'chave-propria',
    nome: 'RAWG e TMDB com chave própria',
    chamado: 'a chave própria',
    para: 'Quem colocou a própria chave em Ajustes',
    medidoEm: 'navegador',
    chave: 'Da própria pessoa, no navegador',
    limite: { tipo: 'da-pessoa', texto: 'Da conta de cada pessoa. Não gasta a cota do site.' },
  },
  {
    id: 'cloudflare',
    nome: 'Cloudflare',
    chamado: 'a Cloudflare',
    para: 'Onde a API e os bancos moram',
    medidoEm: 'cloudflare',
    chave: 'Plano grátis, conta inteira',
    limite: {
      tipo: 'cota-global',
      texto: 'Por dia: 100 mil pedidos, 5 milhões de linhas lidas e 100 mil gravadas. E 500 MB por banco.',
      fonte: 'https://developers.cloudflare.com/workers/platform/limits/',
      conferidoEm: CONFERIDO,
    },
    painel: 'https://dash.cloudflare.com/?to=/:account/workers-and-pages',
  },
];

/** O que o Murall usa e não dá para contar, com o porquê: o que não é medido aparece como não medido. */
export const SEM_CONTAGEM: readonly { nome: string; porque: string }[] = [
  { nome: 'Capas e pôsteres', porque: 'São imagens: o navegador carrega sozinho e não diz o resultado.' },
  { nome: 'Prévias do iTunes, YouTube e Vimeo', porque: 'São players, que falam direto com o serviço.' },
  { nome: 'Botão e tela de login do Google', porque: 'O script e a navegação são do próprio Google.' },
  { nome: 'Chaves públicas do Google', porque: 'A biblioteca do login busca e guarda sozinha, poucas vezes.' },
  { nome: 'Senhas vazadas e o login do cofre', porque: 'O cofre fica fechado: nem o ritmo de quem confere senhas sai dele.' },
  { nome: 'GitHub Pages e Actions', porque: 'Ficam fora do Worker e do navegador, e o repositório público não tem cota de minutos.' },
];
