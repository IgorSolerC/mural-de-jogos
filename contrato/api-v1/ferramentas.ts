/**
 * As ferramentas do MCP do Murall (PLANO-API.md, seção 10.2), uma fonte só: o servidor MCP lista e
 * chama daqui, o OpenAPI e o guia também saem daqui. Cada ferramenta é um pedido a uma rota de
 * `/ext/v1` que já existe (a regra mora na rota; aqui só a forma), então permissão, grupos da chave,
 * validação e pedidos continuam num lugar só. Só tipos e dados.
 */

/** O subconjunto de JSON Schema que o contrato usa (seção 13.1). */
export interface Esquema {
  type?: 'object' | 'string' | 'integer' | 'boolean' | 'array' | 'null' | ('string' | 'null')[];
  description?: string;
  properties?: Record<string, Esquema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Esquema;
  enum?: readonly (string | null)[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
  maxItems?: number;
  pattern?: string;
}

export type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface Ferramenta {
  /** O nome que a AI chama (em português, decisão D9). */
  nome: string;
  /** Um nome curto para gente (o cliente mostra). */
  titulo: string;
  descricao: string;
  /** A permissão que a chave precisa; null: qualquer chave. A ferramenta some do tools/list sem ela. */
  escopo: string | null;
  somenteLeitura: boolean;
  /** Apaga ou some com algo: o cliente pede confirmação. */
  destrutiva: boolean;
  entrada: Esquema;
  /** A rota de `/ext/v1` que faz o trabalho. `:id` sai do argumento `id`; sem `id`, vale `caminhoSemId`. */
  metodo: Metodo;
  caminho: string;
  caminhoSemId?: string;
}

const id = (o: string): Esquema => ({ type: 'string', description: `O id da nota (${o}).`, pattern: '^[\\w-]{1,64}$' });
const idem: Esquema = {
  type: 'string',
  description: 'Opcional. Um texto seu (até 100 letras, sem espaço) que identifica este pedido: repetir a chamada com o mesmo valor não cria outro pedido.',
  pattern: '^[\\x21-\\x7e]{1,100}$',
};
const rotulo = (o: string): Esquema => ({ type: ['string', 'null'], maxLength: 32, description: o });

/** Os campos de uma nota que se escrevem (a forma que `conferirOp` confere de novo). */
const CAMPOS: Record<string, Esquema> = {
  titulo: { type: 'string', minLength: 1, maxLength: 200, description: 'O título da nota.' },
  texto: { type: 'string', maxLength: 20000, description: 'O texto, no markdown do Murall (veja guia_do_murall).' },
  grupo: rotulo('O grupo (use um de ver_contexto; null tira o grupo).'),
  assunto: rotulo('O assunto, dentro do grupo (null tira).'),
  tags: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 32 }, description: 'As tags (até 12, de até 32 letras). Prefira as que já existem.' },
  data: { type: ['string', 'null'], pattern: '^\\d{4}(-\\d{2}(-\\d{2})?)?$', description: 'A data da nota: AAAA, AAAA-MM ou AAAA-MM-DD (null: sem data).' },
  capa: { type: ['string', 'null'], maxLength: 2000, pattern: '^https://', description: 'Uma imagem https para a capa (null tira).' },
  visibilidade: { type: 'string', enum: ['privada', 'publica'], description: 'Quem vê. Só com a permissão publicar; sem dizer, a nota nasce privada.' },
};

const obj = (properties: Record<string, Esquema>, required: string[] = []): Esquema => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

export const FERRAMENTAS: readonly Ferramenta[] = [
  {
    nome: 'guia_do_murall',
    titulo: 'Guia do Murall',
    descricao: 'O guia curto: como o Murall funciona, as regras para mexer nele, o markdown das notas e como os pedidos entram. Leia antes de escrever.',
    escopo: null,
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({}),
    metodo: 'GET',
    caminho: '/llms-full.txt',
  },
  {
    nome: 'ver_contexto',
    titulo: 'Ver o contexto',
    descricao: 'A conta, o dia de hoje no fuso dela, o que esta chave pode, e o vocabulário das Anotações (grupos com assuntos e tags, tags fixas). Chame antes de criar ou mudar notas, e use os nomes que já existem.',
    escopo: 'notas:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({}),
    metodo: 'GET',
    caminho: '/ext/v1/contexto',
  },
  {
    nome: 'buscar',
    titulo: 'Buscar',
    descricao: 'Busca nas notas pelo título e pelo texto (sem ligar para acento e caixa). Devolve id, título, grupo e o trecho.',
    escopo: 'notas:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({ q: { type: 'string', minLength: 2, maxLength: 200, description: 'O que buscar.' } }, ['q']),
    metodo: 'GET',
    caminho: '/ext/v1/busca',
  },
  {
    nome: 'listar_notas',
    titulo: 'Listar notas',
    descricao: 'As notas, com filtros. Cada uma vem com um resumo do texto (com_texto: true traz inteiro). Pagine com depois.',
    escopo: 'notas:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      grupo: { type: 'string', description: 'Só as deste grupo ("-" para as sem grupo).' },
      assunto: { type: 'string', description: 'Só as deste assunto.' },
      tag: { type: 'string', description: 'Só as com esta tag.' },
      finalizadas: { type: 'boolean', description: 'true: só as finalizadas; false: só as abertas.' },
      fixadas: { type: 'boolean', description: 'true: só as fixadas no topo.' },
      q: { type: 'string', description: 'Texto a buscar no título e no texto.' },
      mudou_depois_de: { type: 'string', description: 'Só as que mudaram depois desta hora (ISO).' },
      ordem: { type: 'string', enum: ['mudou', 'criada', 'titulo', 'data'], description: 'A ordem (padrão: mudou, a mais nova primeiro).' },
      limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantas por página (padrão 30).' },
      depois: { type: 'integer', minimum: 0, description: 'Quantas pular (a paginação).' },
      com_texto: { type: 'boolean', description: 'true: o texto inteiro de cada nota.' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/notas',
  },
  {
    nome: 'ler_nota',
    titulo: 'Ler uma nota',
    descricao: 'Uma nota inteira, com a versao (mande ela ao editar) e os pedidos abertos sobre ela.',
    escopo: 'notas:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({ id: id('de listar_notas ou buscar') }, ['id']),
    metodo: 'GET',
    caminho: '/ext/v1/notas/:id',
  },
  {
    nome: 'criar_nota',
    titulo: 'Criar uma nota',
    descricao: 'Cria uma nota (nasce privada). Vira um pedido: a resposta já traz o id e a nota como vai ficar; ela entra quando o Murall estiver aberto. Para um grupo que não existe, mande criar_grupo: true.',
    escopo: 'notas:criar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        ...CAMPOS,
        fixada: { type: 'boolean', description: 'true: fixada no topo do mural.' },
        criar_grupo: { type: 'boolean', description: 'true: aceita um grupo que ainda não existe.' },
        chave_idempotencia: idem,
      },
      ['titulo'],
    ),
    metodo: 'POST',
    caminho: '/ext/v1/notas',
  },
  {
    nome: 'editar_nota',
    titulo: 'Editar uma nota',
    descricao: 'Muda os campos mandados (os outros ficam). Exige a versao que você leu: se a nota mudou depois, volta conflito com a nota de agora; leia de novo e refaça. Para só acrescentar texto, use acrescentar_na_nota.',
    escopo: 'notas:editar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        id: id('a ser mudada'),
        versao: { type: 'string', description: 'A versao da nota que você leu (de ler_nota).' },
        ...CAMPOS,
        criar_grupo: { type: 'boolean', description: 'true: aceita um grupo que ainda não existe.' },
        chave_idempotencia: idem,
      },
      ['id', 'versao'],
    ),
    metodo: 'PATCH',
    caminho: '/ext/v1/notas/:id',
  },
  {
    nome: 'acrescentar_na_nota',
    titulo: 'Acrescentar na nota',
    descricao: 'Acrescenta um trecho no fim (ou no começo) do texto, sem precisar da versao.',
    escopo: 'notas:editar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        id: id('onde acrescentar'),
        texto: { type: 'string', minLength: 1, maxLength: 20000, description: 'O trecho, no markdown do Murall.' },
        onde: { type: 'string', enum: ['fim', 'inicio'], description: 'Onde (padrão: fim).' },
        chave_idempotencia: idem,
      },
      ['id', 'texto'],
    ),
    metodo: 'POST',
    caminho: '/ext/v1/notas/:id/acrescentar',
  },
  {
    nome: 'marcar_tarefas',
    titulo: 'Marcar tarefas',
    descricao: 'Marca, desmarca e acrescenta tarefas (- [ ]) de uma nota, achando cada uma pelo texto. Uma tarefa que não existe (ou que aparece duas vezes) volta como erro, com as que existem.',
    escopo: 'notas:editar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        id: id('das tarefas'),
        marcar: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 500 }, description: 'O texto das tarefas a marcar como feitas.' },
        desmarcar: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 500 }, description: 'O texto das tarefas a abrir de novo.' },
        novas: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 500 }, description: 'Tarefas novas (entram depois da última).' },
        chave_idempotencia: idem,
      },
      ['id'],
    ),
    metodo: 'POST',
    caminho: '/ext/v1/notas/:id/tarefas',
  },
  ...(
    [
      ['finalizar_nota', 'Finalizar uma nota', 'Finaliza a nota (ela sai do mural e vai para as finalizadas).', 'finalizar'],
      ['reabrir_nota', 'Abrir de novo', 'Abre de novo uma nota finalizada.', 'reabrir'],
      ['fixar_nota', 'Fixar no topo', 'Fixa a nota no topo do mural.', 'fixar'],
      ['desafixar_nota', 'Desafixar', 'Tira a nota do topo do mural.', 'desafixar'],
    ] as const
  ).map(
    ([nome, titulo, descricao, acao]): Ferramenta => ({
      nome,
      titulo,
      descricao,
      escopo: 'notas:editar',
      somenteLeitura: false,
      destrutiva: false,
      entrada: obj({ id: id('a nota'), chave_idempotencia: idem }, ['id']),
      metodo: 'POST',
      caminho: `/ext/v1/notas/:id/${acao}`,
    }),
  ),
  {
    nome: 'apagar_nota',
    titulo: 'Apagar uma nota',
    descricao: 'Apaga a nota (ela fica 30 dias em Ajustes › Backup do usuário). Pergunte ao usuário antes.',
    escopo: 'notas:apagar',
    somenteLeitura: false,
    destrutiva: true,
    entrada: obj({ id: id('a apagar'), chave_idempotencia: idem }, ['id']),
    metodo: 'DELETE',
    caminho: '/ext/v1/notas/:id',
  },
  {
    nome: 'ver_pedidos',
    titulo: 'Ver os pedidos',
    descricao: 'Em que pé está o que esta chave pediu: pendente (espera o Murall abrir), aguardando-aprovacao, aplicado, conflito, recusado, falhou, expirado ou desfeito. Com id, um só.',
    escopo: null,
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      id: { type: 'string', pattern: '^pd_[A-Za-z0-9_-]{16}$', description: 'Opcional: o id de um pedido.' },
      estado: { type: 'string', description: 'Só os neste estado.' },
      limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantos (padrão 30).' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/pedidos/:id',
    caminhoSemId: '/ext/v1/pedidos',
  },
];

/** Os argumentos que não vão para a rota como campo (viram caminho ou cabeçalho). */
export const ARGUMENTOS_DE_FORA = ['id', 'chave_idempotencia'] as const;
