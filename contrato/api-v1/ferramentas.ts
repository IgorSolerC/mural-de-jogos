/**
 * As ferramentas do MCP do Murall (PLANO-API.md, seção 10.2), uma fonte só: o servidor MCP lista e
 * chama daqui, o OpenAPI e o guia também saem daqui. Cada ferramenta é um pedido a uma rota de
 * `/ext/v1` que já existe (a regra mora na rota; aqui só a forma), então permissão, grupos da chave,
 * validação e pedidos continuam num lugar só. Só tipos e dados.
 */

/** O subconjunto de JSON Schema que o contrato usa (seção 13.1). */
export interface Esquema {
  type?: 'object' | 'string' | 'integer' | 'boolean' | 'array' | 'null' | ('string' | 'integer' | 'boolean' | 'null')[];
  description?: string;
  properties?: Record<string, Esquema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Esquema;
  enum?: readonly (string | number | null)[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
  maxItems?: number;
  pattern?: string;
}

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Ferramenta {
  /** O nome que a AI chama (em português, decisão D9). */
  nome: string;
  /** Um nome curto para gente (o cliente mostra). */
  titulo: string;
  descricao: string;
  /**
   * A permissão que a chave precisa (uma lista: qualquer uma delas); null: qualquer chave. A ferramenta
   * some do tools/list sem ela.
   */
  escopo: string | readonly string[] | null;
  somenteLeitura: boolean;
  /** Apaga ou some com algo: o cliente pede confirmação. */
  destrutiva: boolean;
  entrada: Esquema;
  /**
   * A rota de `/ext/v1` que faz o trabalho. Cada `:nome` sai do argumento de mesmo nome (`:id`, `:mes`,
   * `:grupo`); faltando um deles, vale `caminhoSemId`. No GET e no DELETE, o resto dos argumentos vai na
   * consulta.
   */
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

// ===== Os Gastos (rodada 6) =====

const idLanc: Esquema = { type: 'string', description: 'O id do lançamento.', pattern: '^[\\w-]{1,64}$' };
const versao: Esquema = { type: 'string', description: 'A versao do lançamento que você leu (o campo versao).' };
const mesArg: Esquema = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'O mês, AAAA-MM.' };

/** Os campos de um lançamento que se escrevem (a forma que `conferirOpGasto` confere de novo). */
const CAMPOS_DO_GASTO: Record<string, Esquema> = {
  titulo: { type: 'string', minLength: 1, maxLength: 80, description: 'O que foi ("Mercado", "Uber").' },
  centavos: { type: 'integer', minimum: 1, maximum: 1000000000, description: 'O valor em centavos, inteiro (R$ 230,50 = 23050). No parcelado, o de cada parcela.' },
  tipo: { type: 'string', enum: ['saida', 'entrada'], description: 'saida (o padrão) ou entrada.' },
  envelope: { type: 'string', maxLength: 64, description: 'O envelope (a categoria), pelo nome de ver_contexto. Sem ele, Outros.' },
  pagamento: { type: 'string', enum: ['avista', 'pix', 'parcelado'], description: 'Só na saída (o padrão é avista).' },
  parcelas: { type: 'integer', minimum: 2, maximum: 72, description: 'Parcelado em quantas vezes (vira pagamento parcelado).' },
  precisava: { type: ['string', 'null'], enum: ['luxo', 'conforto', 'indispensavel', null], description: 'Precisava? Só na saída.' },
  pessoas: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 64 }, description: 'Com quem foi, pelos nomes ("eu" é você). Sem nada, só você.' },
  dia: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'O dia, AAAA-MM-DD (sem ele, hoje no fuso da pessoa). No parcelado, o da primeira parcela.' },
  fatura: { type: 'integer', enum: [-1, 0, 1], description: 'A fatura do cartão: conta no mês do dia (0), no de antes (-1) ou no de depois (1).' },
  mensal: { type: 'boolean', description: 'Repete todo mês, a partir do mês do dia.' },
  ate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}$', description: 'Mensal: o último mês (AAAA-MM), ou null para sem fim.' },
  reembolso_de: { type: ['string', 'null'], description: 'Entrada que paga de volta um gasto: o id dele.' },
};
const criarEnvelope: Esquema = { type: 'boolean', description: 'Cria o envelope se não existir (pede a permissão gastos:editar). Prefira os que existem.' };
const criarPessoas: Esquema = { type: 'boolean', description: 'Cria as pessoas que não existirem (pede a permissão gastos:editar).' };

export const FERRAMENTAS_DOS_GASTOS: readonly Ferramenta[] = [
  {
    nome: 'ver_gastos_do_mes',
    titulo: 'Ver os gastos do mês',
    descricao:
      'O mês como o app mostra: entradas, saídas e saldo, quanto foi em cada envelope (com o limite), Precisava?, por pessoa, os carnês e as linhas do mês (cada parcela e cada mensal no mês em que conta). Valores em centavos.',
    escopo: 'gastos:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({ mes: mesArg }, ['mes']),
    metodo: 'GET',
    caminho: '/ext/v1/gastos/meses/:mes',
  },
  {
    nome: 'listar_lancamentos',
    titulo: 'Listar lançamentos',
    descricao: 'Os lançamentos, do dia mais recente para o mais antigo, com filtros. de/ate olham o dia do lançamento (no parcelado, o da primeira parcela); para o que conta num mês, use ver_gastos_do_mes. Pagine com depois.',
    escopo: 'gastos:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      de: { type: 'string', description: 'A partir de: um mês (AAAA-MM) ou um dia (AAAA-MM-DD).' },
      ate: { type: 'string', description: 'Até: um mês (AAAA-MM) ou um dia (AAAA-MM-DD).' },
      tipo: { type: 'string', enum: ['saida', 'entrada'], description: 'Só saídas ou só entradas.' },
      envelope: { type: 'string', description: 'Só deste envelope (nome ou id).' },
      pessoa: { type: 'string', description: 'Só com esta pessoa ("eu" é você).' },
      q: { type: 'string', maxLength: 200, description: 'Busca no título.' },
      limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Quantos (padrão 50).' },
      depois: { type: 'string', description: 'Para a próxima página: o depois que veio na anterior.' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/gastos/lancamentos',
  },
  {
    nome: 'ler_lancamento',
    titulo: 'Ler um lançamento',
    descricao: 'Um lançamento inteiro, com a versao (para mudar ou apagar).',
    escopo: 'gastos:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({ id: idLanc }, ['id']),
    metodo: 'GET',
    caminho: '/ext/v1/gastos/lancamentos/:id',
  },
  {
    nome: 'lancar_gastos',
    titulo: 'Lançar gastos',
    descricao:
      'Lança saídas e entradas: uma lista em itens (até 50, cada um com titulo e centavos) ou frases como na linha de anotar do app ("mercado 230,50 ontem", "violão 10x 139,90 @bruna #luxo", "salário +4559 fixo"). Um pedido por lançamento. Use os envelopes e as pessoas de ver_contexto.',
    escopo: 'gastos:lancar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({
      itens: {
        type: 'array',
        maxItems: 50,
        description: 'Os lançamentos (até 50).',
        items: { ...obj({ ...CAMPOS_DO_GASTO, criar_envelope: criarEnvelope, criar_pessoas: criarPessoas }, ['titulo', 'centavos']) },
      },
      frases: { type: 'array', maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 200 }, description: 'Ou frases, uma por lançamento (o Murall entende cada uma como na tela).' },
      criar_pessoas: criarPessoas,
      chave_idempotencia: idem,
    }),
    metodo: 'POST',
    caminho: '/ext/v1/gastos/lancamentos',
  },
  {
    nome: 'editar_lancamento',
    titulo: 'Mudar um lançamento',
    descricao: 'Muda os campos mandados de um lançamento. Mande a versao que você leu; se voltar conflito, leia de novo.',
    escopo: 'gastos:editar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({ id: idLanc, versao, ...CAMPOS_DO_GASTO, criar_envelope: criarEnvelope, criar_pessoas: criarPessoas, chave_idempotencia: idem }, ['id', 'versao']),
    metodo: 'PATCH',
    caminho: '/ext/v1/gastos/lancamentos/:id',
  },
  {
    nome: 'apagar_lancamento',
    titulo: 'Apagar um lançamento',
    descricao: 'Apaga um lançamento (a pessoa pode desfazer pelo histórico). Mande a versao que você leu. Pergunte ao usuário antes.',
    escopo: 'gastos:editar',
    somenteLeitura: false,
    destrutiva: true,
    entrada: obj({ id: idLanc, versao, chave_idempotencia: idem }, ['id', 'versao']),
    metodo: 'DELETE',
    caminho: '/ext/v1/gastos/lancamentos/:id',
  },
  {
    nome: 'criar_envelope',
    titulo: 'Criar um envelope',
    descricao: 'Cria um envelope (categoria) nos Gastos. Só se a pessoa pediu: prefira os que existem (ver_contexto).',
    escopo: 'gastos:editar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        nome: { type: 'string', minLength: 1, maxLength: 24, description: 'O nome.' },
        tipo: { type: 'string', enum: ['saida', 'entrada'], description: 'De saída (o padrão) ou de entrada.' },
        limite_centavos: { type: ['integer', 'null'], minimum: 0, description: 'O limite do mês, em centavos (só na saída).' },
        chave_idempotencia: idem,
      },
      ['nome'],
    ),
    metodo: 'POST',
    caminho: '/ext/v1/gastos/envelopes',
  },
  {
    nome: 'editar_envelope',
    titulo: 'Mudar um envelope',
    descricao: 'Muda o nome ou o limite do mês de um envelope (pelo nome ou pelo id).',
    escopo: 'gastos:editar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        id: { type: 'string', maxLength: 64, description: 'O envelope: o nome ou o id.' },
        nome: { type: 'string', minLength: 1, maxLength: 24, description: 'O nome novo.' },
        limite_centavos: { type: ['integer', 'null'], minimum: 0, description: 'O limite do mês, em centavos (null tira).' },
        chave_idempotencia: idem,
      },
      ['id'],
    ),
    metodo: 'PATCH',
    caminho: '/ext/v1/gastos/envelopes/:id',
  },
  {
    nome: 'criar_pessoa',
    titulo: 'Pôr uma pessoa nos gastos',
    descricao: 'Põe alguém com quem a pessoa gasta (para dividir os gastos).',
    escopo: 'gastos:editar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({ nome: { type: 'string', minLength: 1, maxLength: 24, description: 'O nome.' }, chave_idempotencia: idem }, ['nome']),
    metodo: 'POST',
    caminho: '/ext/v1/gastos/pessoas',
  },
  {
    nome: 'editar_pessoa',
    titulo: 'Mudar o nome de uma pessoa',
    descricao: 'Muda o nome de uma pessoa dos gastos ("eu" é você).',
    escopo: 'gastos:editar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      { id: { type: 'string', maxLength: 64, description: 'A pessoa: o nome, o id ou "eu".' }, nome: { type: 'string', minLength: 1, maxLength: 24, description: 'O nome novo.' }, chave_idempotencia: idem },
      ['id', 'nome'],
    ),
    metodo: 'PATCH',
    caminho: '/ext/v1/gastos/pessoas/:id',
  },
];

// ===== O Kanban (rodada 8) =====

const grupoArg: Esquema = { type: 'string', minLength: 1, maxLength: 64, description: 'O quadro: o nome do grupo das Anotações (cada grupo tem o seu) ou o id do quadro.' };
const colunaArg = (o: string): Esquema => ({ type: 'string', minLength: 1, maxLength: 64, description: `${o}: o nome (como em ver_contexto) ou o id.` });
const importancia: Esquema = {
  type: ['string', 'null'],
  enum: ['critico', 'importante', 'medio', 'baixo', 'baixissimo', null],
  description: 'A importância no quadro, da mais alta para a mais baixa (null tira).',
};
const status: Esquema = { type: ['string', 'null'], maxLength: 28, description: 'Umas palavras ao lado da importância ("Em revisão", "Com o Sérgio"); null tira.' };

/** Onde a nota nova nasce no quadro do grupo dela (o `kanban` de criar_nota). */
const NO_QUADRO: Esquema = {
  type: 'object',
  description: 'Opcional: a nota já nasce no quadro do grupo dela (pede a permissão kanban:mover e um grupo). Sem coluna, na primeira.',
  properties: { coluna: colunaArg('A coluna'), importancia, status },
  additionalProperties: false,
};

export const FERRAMENTAS_DO_KANBAN: readonly Ferramenta[] = [
  {
    nome: 'ver_kanban',
    titulo: 'Ver o Kanban',
    descricao:
      'Sem grupo: os quadros (um por grupo das Anotações) com as colunas. Com grupo: o quadro inteiro, com os cartões de cada coluna na ordem da tela (cada cartão é uma nota: o título, as tags, se está finalizada, a importância, o status, as dependências e se aparece também no mural).',
    escopo: 'kanban:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({ grupo: { ...grupoArg, description: 'Opcional: o quadro (o nome do grupo ou o id). Sem ele, a lista dos quadros.' } }),
    metodo: 'GET',
    caminho: '/ext/v1/kanban/:grupo',
    caminhoSemId: '/ext/v1/kanban',
  },
  {
    nome: 'mover_cartao',
    titulo: 'Pôr ou mover no Kanban',
    descricao:
      'Põe uma nota do grupo no quadro dele, ou muda o cartão: a coluna, o lugar, a importância, o status, as dependências e se aparece também no mural. Mande só o que muda. Chegar numa coluna que finaliza finaliza a nota (e sair dela abre de novo). Para criar uma nota já numa coluna, use criar_nota com kanban.',
    escopo: 'kanban:mover',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        grupo: grupoArg,
        nota: { type: 'string', pattern: '^[\\w-]{1,64}$', description: 'O id da nota (ela tem de ser do grupo do quadro).' },
        coluna: colunaArg('A coluna de destino'),
        posicao: { type: 'integer', minimum: 0, maximum: 1000, description: 'O lugar na coluna: 0 é o de cima (sem ele, em cima também). A coluna que se arruma sozinha ignora.' },
        importancia,
        status,
        depende_de: { type: 'array', maxItems: 30, items: { type: 'string', pattern: '^[\\w-]{1,64}$' }, description: 'A lista inteira das notas (ids) que precisam estar finalizadas antes desta; [] tira todas.' },
        no_mural: { type: ['boolean', 'null'], description: 'true: aparece também no mural; false: só no Kanban; null: segue o grupo.' },
        chave_idempotencia: idem,
      },
      ['grupo', 'nota'],
    ),
    metodo: 'PUT',
    caminho: '/ext/v1/kanban/:grupo/cartoes/:nota',
  },
  {
    nome: 'tirar_do_quadro',
    titulo: 'Tirar do quadro',
    descricao: 'Tira a nota do quadro (ela continua nas Anotações e volta para o mural).',
    escopo: 'kanban:mover',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({ grupo: grupoArg, nota: { type: 'string', pattern: '^[\\w-]{1,64}$', description: 'O id da nota.' }, chave_idempotencia: idem }, ['grupo', 'nota']),
    metodo: 'DELETE',
    caminho: '/ext/v1/kanban/:grupo/cartoes/:nota',
  },
  {
    nome: 'criar_coluna',
    titulo: 'Criar uma coluna',
    descricao: 'Cria uma coluna no quadro (no fim, ou depois de outra). Já dá para mover cartões para ela antes de o pedido entrar.',
    escopo: 'kanban:colunas',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        grupo: grupoArg,
        nome: { type: 'string', minLength: 1, maxLength: 40, description: 'O nome da coluna.' },
        depois_de: colunaArg('Depois de qual coluna (sem ela, no fim)'),
        finaliza: { type: 'boolean', description: 'A nota que chega nela é finalizada.' },
        pula: { type: 'boolean', description: 'A seta de avançar das colunas da esquerda pula esta (uma coluna de entrada).' },
        chave_idempotencia: idem,
      },
      ['grupo', 'nome'],
    ),
    metodo: 'POST',
    caminho: '/ext/v1/kanban/:grupo/colunas',
  },
  {
    nome: 'editar_coluna',
    titulo: 'Mudar uma coluna',
    descricao: 'Muda o nome, se a coluna finaliza, se a seta pula, ou o lugar dela. Mande só o que muda.',
    escopo: 'kanban:colunas',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        grupo: grupoArg,
        coluna: colunaArg('A coluna'),
        nome: { type: 'string', minLength: 1, maxLength: 40, description: 'O nome novo.' },
        finaliza: { type: 'boolean', description: 'A nota que chega nela é finalizada.' },
        pula: { type: 'boolean', description: 'A seta de avançar pula esta coluna.' },
        posicao: { type: 'integer', minimum: 0, maximum: 1000, description: 'O lugar da coluna: 0 é a primeira, à esquerda.' },
        chave_idempotencia: idem,
      },
      ['grupo', 'coluna'],
    ),
    metodo: 'PATCH',
    caminho: '/ext/v1/kanban/:grupo/colunas/:coluna',
  },
  {
    nome: 'apagar_coluna',
    titulo: 'Apagar uma coluna',
    descricao: 'Apaga a coluna; os cartões dela vão para a vizinha da esquerda (ou para a coluna em para; "-" tira do quadro). As notas nunca são apagadas. Pergunte ao usuário antes.',
    escopo: 'kanban:colunas',
    somenteLeitura: false,
    destrutiva: true,
    entrada: obj(
      {
        grupo: grupoArg,
        coluna: colunaArg('A coluna a apagar'),
        para: { type: 'string', minLength: 1, maxLength: 64, description: 'Para onde vão os cartões dela (nome ou id); "-" tira do quadro. Sem ele, a vizinha da esquerda.' },
        chave_idempotencia: idem,
      },
      ['grupo', 'coluna'],
    ),
    metodo: 'DELETE',
    caminho: '/ext/v1/kanban/:grupo/colunas/:coluna',
  },
];

/** A permissão em palavras (para o guia e o OpenAPI). */
export function escopoEmPalavras(escopo: Ferramenta['escopo']): string | null {
  if (escopo === null) return null;
  return typeof escopo === 'string' ? escopo : escopo.join(' ou ');
}

/** A chave com estes escopos alcança a ferramenta? */
export function alcanca(f: Pick<Ferramenta, 'escopo'>, escopos: readonly string[]): boolean {
  if (f.escopo === null) return true;
  return typeof f.escopo === 'string' ? escopos.includes(f.escopo) : f.escopo.some((e) => escopos.includes(e));
}

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
    descricao:
      'A conta, o dia de hoje no fuso dela, o que esta chave pode, o vocabulário das Anotações (grupos com assuntos e tags, tags fixas), o do Kanban (os quadros e as colunas) e o dos Gastos (envelopes, pessoas, os meses com lançamento). Chame antes de criar ou mudar, e use os nomes que já existem.',
    escopo: ['notas:ler', 'gastos:ler', 'kanban:ler', 'kanban:mover', 'kanban:colunas'],
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({}),
    metodo: 'GET',
    caminho: '/ext/v1/contexto',
  },
  {
    nome: 'buscar',
    titulo: 'Buscar',
    descricao: 'Busca nas notas (título e texto) e nos títulos dos lançamentos, sem ligar para acento e caixa. Sem areas, busca em tudo que esta chave lê.',
    escopo: ['notas:ler', 'gastos:ler'],
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj(
      {
        q: { type: 'string', minLength: 2, maxLength: 200, description: 'O que buscar.' },
        areas: { type: 'string', description: 'Onde: notas, gastos, ou notas,gastos.' },
      },
      ['q'],
    ),
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
    descricao:
      'Cria uma nota (nasce privada). Vira um pedido: a resposta já traz o id e a nota como vai ficar; ela entra quando o Murall estiver aberto. Para um grupo que não existe, mande criar_grupo: true. Com kanban, ela já nasce numa coluna do quadro do grupo.',
    escopo: 'notas:criar',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        ...CAMPOS,
        fixada: { type: 'boolean', description: 'true: fixada no topo do mural.' },
        criar_grupo: { type: 'boolean', description: 'true: aceita um grupo que ainda não existe.' },
        kanban: NO_QUADRO,
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
  ...FERRAMENTAS_DO_KANBAN,
  ...FERRAMENTAS_DOS_GASTOS,
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
