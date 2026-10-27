/**
 * As permissões das chaves de API (PLANO-API.md, seção 5.2): o que uma chave pode fazer, com o nome que
 * a tela mostra. Só dados e funções puras: a API (para conferir) e o site (para a tela) importam daqui,
 * e o que um sabe o outro sabe igual.
 */

/** Uma área do Murall que a API alcança. */
export type AreaDaApi = 'notas' | 'kanban' | 'calendario' | 'gastos' | 'desejos' | 'pra-depois' | 'fichas' | 'especial';

export interface Escopo {
  /** `area:acao`, o que vai na chave e na documentação. */
  id: string;
  area: AreaDaApi;
  /** O nome na tela ("Cadastrar notas"). */
  nome: string;
  /** O verbo curto do resumo de uma chave ("Anotações: ver, criar e mudar"). */
  verbo: string;
  /** O que inclui, numa frase. */
  inclui: string;
  /** Muda ou apaga o que existe (com a aprovação "mudancas", espera você). Ler e criar não. */
  muda?: true;
  /** Pede cuidado: desligado nos atalhos e com aviso na tela. */
  cuidado?: true;
}

/** Os nomes das áreas, na ordem da tela. */
export const AREAS_DA_API: readonly { id: AreaDaApi; nome: string }[] = [
  { id: 'notas', nome: 'Anotações' },
  { id: 'kanban', nome: 'Kanban' },
  { id: 'calendario', nome: 'Calendário' },
  { id: 'gastos', nome: 'Gastos' },
  { id: 'desejos', nome: 'Wishlist' },
  { id: 'pra-depois', nome: 'Pra depois' },
  { id: 'fichas', nome: 'Murais' },
  { id: 'especial', nome: 'Especial' },
];

/** Toda chave lê quem é a conta e o que ela mesma pode fazer; não é marcado na tela. */
export const ESCOPO_BASICO = 'conta:ler';

export const ESCOPOS: readonly Escopo[] = [
  { id: 'notas:ler', area: 'notas', nome: 'Ler anotações', verbo: 'ver', inclui: 'Listar, buscar e ler; ver os grupos, os assuntos e as tags.' },
  { id: 'notas:criar', area: 'notas', nome: 'Cadastrar notas', verbo: 'criar', inclui: 'Criar anotações. Elas nascem privadas; tornar pública pede "Mudar quem vê".' },
  {
    id: 'notas:editar', area: 'notas', nome: 'Alterar notas', verbo: 'mudar', muda: true,
    inclui: 'Título, texto, grupo, assunto, tags, data e capa; acrescentar texto, marcar tarefas, finalizar, reabrir e fixar.',
  },
  { id: 'notas:apagar', area: 'notas', nome: 'Apagar notas', verbo: 'apagar', muda: true, inclui: 'Apagar, sempre com volta (fica em Versões guardadas).' },
  { id: 'kanban:ler', area: 'kanban', nome: 'Ver o Kanban', verbo: 'ver', inclui: 'Os quadros, as colunas, os cartões, a importância e as dependências.' },
  {
    id: 'kanban:mover', area: 'kanban', nome: 'Mexer no Kanban', verbo: 'mover cartões', muda: true,
    inclui: 'Pôr no quadro, mudar de coluna, a importância, o status, as dependências e o "no mural também".',
  },
  { id: 'kanban:colunas', area: 'kanban', nome: 'Arrumar colunas', verbo: 'arrumar colunas', muda: true, inclui: 'Criar, renomear, reordenar, pular e apagar colunas.' },
  { id: 'calendario:ler', area: 'calendario', nome: 'Ver o calendário', verbo: 'ver', inclui: 'Os lembretes e o que acontece entre duas datas.' },
  {
    id: 'calendario:escrever', area: 'calendario', nome: 'Alterar calendário', verbo: 'mudar', muda: true,
    inclui: 'Criar e mudar lembretes (vão ao Google Agenda se ele estiver ligado).',
  },
  { id: 'calendario:apagar', area: 'calendario', nome: 'Apagar do calendário', verbo: 'apagar', muda: true, inclui: 'Apagar o lembrete, ou só um dia dele.' },
  { id: 'gastos:ler', area: 'gastos', nome: 'Ver os gastos', verbo: 'ver', inclui: 'Os lançamentos, o resumo do mês, os envelopes, as pessoas e os carnês.' },
  {
    id: 'gastos:lancar', area: 'gastos', nome: 'Inserir registros nos gastos', verbo: 'lançar',
    inclui: 'Lançar saídas e entradas, uma ou um lote, ou pela frase rápida ("mercado 230,50 ontem").',
  },
  { id: 'gastos:editar', area: 'gastos', nome: 'Alterar gastos', verbo: 'mudar', muda: true, inclui: 'Mudar e apagar lançamentos; criar e mudar envelopes e pessoas.' },
  { id: 'desejos:ler', area: 'desejos', nome: 'Ver a wishlist', verbo: 'ver', inclui: 'Os desejos de cada mural.' },
  { id: 'desejos:escrever', area: 'desejos', nome: 'Mexer na wishlist', verbo: 'mexer', muda: true, inclui: 'Pôr, mudar a relevância (MUST ou LATER) e tirar.' },
  { id: 'pra-depois:ler', area: 'pra-depois', nome: 'Ver o Pra depois', verbo: 'ver', inclui: 'O que espera uma ficha em cada mural.' },
  { id: 'pra-depois:escrever', area: 'pra-depois', nome: 'Mexer no Pra depois', verbo: 'mexer', muda: true, inclui: 'Pôr e tirar.' },
  { id: 'fichas:ler', area: 'fichas', nome: 'Ler as fichas', verbo: 'ver', inclui: 'As fichas de jogos, livros, filmes, séries, animes e músicas.' },
  { id: 'fichas:escrever', area: 'fichas', nome: 'Escrever fichas', verbo: 'escrever', muda: true, inclui: 'Criar e mudar fichas (a nota final é sempre calculada pelo Murall).' },
  {
    id: 'publicar', area: 'especial', nome: 'Mudar quem vê', verbo: 'mudar quem vê', muda: true, cuidado: true,
    inclui: 'Tornar público ou privado. Uma AI enganada por um texto poderia mostrar algo seu a todo mundo.',
  },
];

const IDS = new Set(ESCOPOS.map((e) => e.id));

/** É um escopo que se marca (não vale o básico, que toda chave tem). */
export function ehEscopo(id: unknown): id is string {
  return typeof id === 'string' && IDS.has(id);
}

/** Os escopos na ordem da lista acima, sem repetir e sem o que não existe. */
export function escoposEmOrdem(ids: readonly string[]): string[] {
  const set = new Set(ids);
  return ESCOPOS.filter((e) => set.has(e.id)).map((e) => e.id);
}

export interface Atalho {
  id: string;
  nome: string;
  escopos: readonly string[];
}

/** Os atalhos da tela de criar: preenchem as caixas, que dá para mudar depois. */
export const ATALHOS: readonly Atalho[] = [
  { id: 'ler', nome: 'Só ler', escopos: ESCOPOS.filter((e) => e.id.endsWith(':ler')).map((e) => e.id) },
  {
    id: 'anotacoes', nome: 'Assistente das anotações',
    escopos: ['notas:ler', 'notas:criar', 'notas:editar', 'kanban:ler', 'kanban:mover', 'calendario:ler', 'calendario:escrever'],
  },
  { id: 'gastos', nome: 'Lançar gastos', escopos: ['gastos:ler', 'gastos:lancar'] },
  { id: 'wishlist', nome: 'Montar wishlist', escopos: ['desejos:ler', 'desejos:escrever', 'fichas:ler'] },
];

/**
 * Quando um pedido espera você: nunca; só as mudanças (editar e apagar: criar entra direto, o padrão);
 * ou tudo.
 */
export type Aprovacao = 'nunca' | 'mudancas' | 'tudo';
export const APROVACOES: readonly { id: Aprovacao; nome: string; explica: string }[] = [
  { id: 'mudancas', nome: 'Antes de mudar ou apagar', explica: 'O que ela cria entra direto; o que muda ou apaga espera você aprovar.' },
  { id: 'tudo', nome: 'Antes de tudo', explica: 'Nada entra sem você aprovar.' },
  { id: 'nunca', nome: 'Nunca', explica: 'Tudo entra direto. Ainda dá para desfazer pelo histórico.' },
];
export const APROVACAO_PADRAO: Aprovacao = 'mudancas';

export function ehAprovacao(v: unknown): v is Aprovacao {
  return v === 'nunca' || v === 'mudancas' || v === 'tudo';
}

/** As validades que se escolhem, em dias (sem "nunca expira": decisão D4). */
export const VALIDADES = [7, 30, 90, 365] as const;
export const VALIDADE_PADRAO = 90;

/** Quantos grupos das Anotações uma chave pode limitar, e o tamanho de cada nome (o do grupo no app). */
export const MAX_GRUPOS = 20;
export const GRUPO_MAX = 32;
/** O nome da chave. */
export const NOME_DA_CHAVE_MAX = 40;

/** Sem acento e em minúsculas: como o app compara nomes de grupo. */
export function dobra(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Um texto curto da tela: sem invisíveis, espaços juntos, até `max` letras. */
export function textoLimpo(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return Array.from(raw.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim())
    .slice(0, max)
    .join('')
    .trim();
}

/**
 * Os grupos que limitam uma chave, como foram escritos (sem repetir, sem ligar para caixa e acento).
 * `null` é "todos os grupos"; uma lista que não serve (não é lista, grande demais) também é `undefined`,
 * para quem confere recusar.
 */
export function limparGrupos(raw: unknown): string[] | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw) || raw.length > MAX_GRUPOS) return undefined;
  const out = new Map<string, string>();
  for (const g of raw) {
    const nome = textoLimpo(g, GRUPO_MAX);
    if (!nome) return undefined;
    if (!out.has(dobra(nome))) out.set(dobra(nome), nome);
  }
  return out.size ? [...out.values()] : null;
}
/** Chaves de uma conta ao mesmo tempo. */
export const MAX_CHAVES = 20;
