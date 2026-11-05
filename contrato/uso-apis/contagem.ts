/**
 * O que a contagem do uso das APIs pode guardar (PLANO-ADMIN-APIS.md, seção 6): tudo em listas fechadas.
 * Nada vindo de fora vira texto no banco: nem o caminho, nem o que foi buscado, nem o corpo de um erro.
 */

/** Como uma chamada terminou. */
export const DESFECHOS = ['ok', 'nao-achou', 'limite', 'recusada', 'fora', 'prazo', 'outro', 'cancelada'] as const;
export type Desfecho = (typeof DESFECHOS)[number];

/** Os desfechos que contam como falha (a pessoa continuar digitando, ou o catálogo não ter o item, não contam). */
export const FALHAS: readonly Desfecho[] = ['limite', 'recusada', 'fora', 'prazo', 'outro'];

/** As operações de cada serviço, e só elas. A chave própria tem um serviço só dela: nunca entra na cota do site. */
export const OPERACOES = {
  rawg: ['busca', 'jogo', 'lojas'],
  tmdb: ['busca', 'posteres'],
  'google-agenda': ['listar', 'criar', 'mudar', 'apagar'],
  'google-token': ['renovar', 'trocar', 'revogar'],
  'oauth-documento': ['ler'],
  wikipedia: ['geral'],
  'open-library': ['geral'],
  kitsu: ['geral'],
  anilist: ['geral'],
  itunes: ['geral'],
  'chave-propria': ['rawg', 'tmdb'],
} as const;

export type ServicoContado = keyof typeof OPERACOES;
export type OperacaoDe<S extends ServicoContado> = (typeof OPERACOES)[S][number];

/**
 * Como uma resposta terminou. O 404 e o 410 são respostas normais (o catálogo não tem, o evento já saiu), e
 * o 409 da Agenda também (outro aparelho já criou o evento, e vira uma mudança).
 */
export function desfechoDoStatus(status: number): Desfecho {
  if (status === 429) return 'limite';
  if (status === 401 || status === 403) return 'recusada';
  if (status === 404 || status === 410) return 'nao-achou';
  if (status === 409) return 'ok';
  if (status >= 500) return 'fora';
  return status >= 200 && status < 400 ? 'ok' : 'outro';
}
