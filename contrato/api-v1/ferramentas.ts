/**
 * As ferramentas do MCP do Murall (PLANO-API.md, seção 10.2), uma fonte só: o servidor MCP lista e
 * chama daqui, o OpenAPI e o guia também saem daqui. Cada ferramenta é um pedido a uma rota de
 * `/ext/v1` que já existe (a regra mora na rota; aqui só a forma), então permissão, grupos da chave,
 * validação e pedidos continuam num lugar só. Só tipos e dados.
 */

import { ESTADOS } from './operacoes';

/** O subconjunto de JSON Schema que o contrato usa (seção 13.1). */
export interface Esquema {
  type?: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'null' | ('object' | 'string' | 'integer' | 'number' | 'boolean' | 'null')[];
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
  /** A rota devolve os bytes de uma imagem, não JSON: o MCP manda como imagem para a AI ver. */
  devolveImagem?: true;
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
// ===== O Calendário (rodada 7) =====

const idLembrete: Esquema = { type: 'string', description: 'O id do lembrete.', pattern: '^[\\w-]{1,64}$' };
const versaoLembrete: Esquema = { type: 'string', description: 'A versao do lembrete que você leu (o campo versao).' };
const diaArg = (o: string): Esquema => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: o });
const horaArg = (o: string): Esquema => ({ type: ['string', 'null'], pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', description: o });

/** Os campos de um lembrete que se escrevem (a forma que `conferirOpLembrete` confere de novo). */
const CAMPOS_DO_LEMBRETE: Record<string, Esquema> = {
  titulo: { type: 'string', minLength: 1, maxLength: 120, description: 'O nome ("Dentista", "Pagar o aluguel").' },
  dia: diaArg('O dia, AAAA-MM-DD (o primeiro, quando se repete).'),
  hora: horaArg('A hora, HH:MM; null é o dia todo.'),
  fim: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Mais de um dia: o último dia de cada vez (depois do dia); null é um dia só.' },
  hora_fim: horaArg('Com hora: a hora em que acaba (no último dia, quando são vários); null tira.'),
  repete: {
    type: ['object', 'null'],
    description: 'Como se repete (troca a repetição inteira); null: não se repete.',
    properties: {
      cada: { type: 'string', enum: ['dia', 'semana', 'mes', 'ano'], description: 'De quanto em quanto.' },
      intervalo: { type: 'integer', minimum: 1, maximum: 99, description: 'A cada quantos (padrão 1: "a cada 2 semanas" é 2).' },
      dias_da_semana: { type: 'array', maxItems: 7, items: { type: 'integer', minimum: 0, maximum: 6 }, description: 'Só na semana: os dias (0 é domingo, 6 é sábado). Sem eles, o dia da semana do dia.' },
      vez_no_mes: { type: ['integer', 'null'], enum: [1, 2, 3, 4, 5, -1, null], description: 'Só no mês e no ano: a vez do dia da semana do dia no mês ("a terceira terça" é 3; -1 é a última).' },
      so_nos_meses_com_o_dia: { type: 'boolean', description: 'Só no mês e no ano, num dia 29, 30 ou 31: só nos meses que têm o dia (senão, cai no último dia dos mais curtos).' },
      ate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'O último dia em que pode aparecer (null: sem fim).' },
      vezes: { type: ['integer', 'null'], minimum: 1, maximum: 999, description: 'Ou quantas vezes acontece (no lugar de ate).' },
    },
    required: ['cada'],
    additionalProperties: false,
  },
  cor: { type: 'string', enum: ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'lilas', 'rosa', 'cinza', 'branco'], description: 'A cor (sem ela, o Murall sorteia, como na tela).' },
  silencioso: { type: 'boolean', description: 'Uma marcação, não um lembrete: fica no calendário, mas o Google Agenda não avisa.' },
  notas: { type: 'array', maxItems: 12, items: { type: 'string', pattern: '^[\\w-]{1,64}$' }, description: 'As anotações presas nele (os ids das notas, até 12).' },
};

export const FERRAMENTAS_DO_CALENDARIO: readonly Ferramenta[] = [
  {
    nome: 'ver_agenda',
    titulo: 'Ver a agenda',
    descricao:
      'O que acontece entre dois dias, como o Calendário do app mostra: cada vez de cada lembrete, com as repetições já abertas (a semana com vários dias, "a terceira terça", os dias tirados). Sem de, de hoje a um mês. Vai de 3 meses antes do atual a 12 depois; para mais longe, use listar_lembretes. O que ainda não entrou vem em pedidos_abertos.',
    escopo: 'calendario:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      de: { type: 'string', description: 'A partir de: um dia (AAAA-MM-DD) ou um mês (AAAA-MM).' },
      ate: { type: 'string', description: 'Até: um dia (AAAA-MM-DD) ou um mês (AAAA-MM).' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/agenda',
  },
  {
    nome: 'listar_lembretes',
    titulo: 'Listar lembretes',
    descricao: 'Os lembretes como estão guardados (cada um com a repetição, em palavras também), do primeiro dia mais novo para o mais antigo. de/ate olham o primeiro dia; para o que acontece num dia, use ver_agenda. Pagine com depois.',
    escopo: 'calendario:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      de: { type: 'string', description: 'O primeiro dia a partir de: um dia (AAAA-MM-DD) ou um mês (AAAA-MM).' },
      ate: { type: 'string', description: 'O primeiro dia até: um dia (AAAA-MM-DD) ou um mês (AAAA-MM).' },
      q: { type: 'string', maxLength: 200, description: 'Busca no nome.' },
      limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Quantos (padrão 50).' },
      depois: { type: 'string', description: 'Para a próxima página: o depois que veio na anterior.' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/lembretes',
  },
  {
    nome: 'ler_lembrete',
    titulo: 'Ler um lembrete',
    descricao: 'Um lembrete inteiro, com a versao (para mudar ou apagar).',
    escopo: 'calendario:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({ id: idLembrete }, ['id']),
    metodo: 'GET',
    caminho: '/ext/v1/lembretes/:id',
  },
  {
    nome: 'criar_lembrete',
    titulo: 'Criar um lembrete',
    descricao:
      'Marca um lembrete no Calendário (vai ao Google Agenda, se a pessoa ligou). titulo e dia são obrigatórios; sem hora, é o dia todo. Para repetir, repete com o cada ("toda segunda e quarta": cada semana, dias_da_semana [1, 3]).',
    escopo: 'calendario:escrever',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({ ...CAMPOS_DO_LEMBRETE, chave_idempotencia: idem }, ['titulo', 'dia']),
    metodo: 'POST',
    caminho: '/ext/v1/lembretes',
  },
  {
    nome: 'editar_lembrete',
    titulo: 'Mudar um lembrete',
    descricao:
      'Muda os campos mandados de um lembrete (mudar o dia leva o fim junto; repete troca a repetição inteira). Mande a versao que você leu; se voltar conflito, leia de novo. O lembrete travado pelo Google (google.travado) só muda a cor e as notas.',
    escopo: 'calendario:escrever',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({ id: idLembrete, versao: versaoLembrete, ...CAMPOS_DO_LEMBRETE, chave_idempotencia: idem }, ['id', 'versao']),
    metodo: 'PATCH',
    caminho: '/ext/v1/lembretes/:id',
  },
  {
    nome: 'apagar_lembrete',
    titulo: 'Apagar um lembrete',
    descricao:
      'Apaga um lembrete (e o evento dele no Google Agenda); com dia, tira só aquela vez de um lembrete que se repete (o dia em que a vez começa, como em ver_agenda). A pessoa pode desfazer pelo histórico. Mande a versao que você leu. Pergunte ao usuário antes.',
    escopo: 'calendario:apagar',
    somenteLeitura: false,
    destrutiva: true,
    entrada: obj({ id: idLembrete, versao: versaoLembrete, dia: diaArg('Só esta vez (AAAA-MM-DD), num lembrete que se repete.'), chave_idempotencia: idem }, ['id', 'versao']),
    metodo: 'DELETE',
    caminho: '/ext/v1/lembretes/:id',
  },
];

// ===== Os murais de resenhas: a Wishlist, o Pra depois e as fichas (rodada 9) =====

const MURAIS_ENUM = ['jogos', 'livros', 'filmes', 'series', 'animes', 'musicas'];
const muralArg = (o: string): Esquema => ({ type: 'string', enum: MURAIS_ENUM, description: o });
const idItem = (o: string): Esquema => ({ type: 'string', description: o, pattern: '^[\\w-]{1,64}$' });
const versaoDe = (o: string): Esquema => ({ type: 'string', description: `A versao ${o} que você leu (o campo versao).` });
const relevancia: Esquema = { type: 'string', enum: ['must', 'comum', 'later'], description: 'Quanta vontade: must (MUST PLAY/READ/WATCH, na frente), comum ou later (no fim).' };

/** O item a pôr na wishlist ou no Pra depois (a forma que `conferirOpMural` confere de novo). */
const CAMPOS_DO_ITEM: Record<string, Esquema> = {
  mural: muralArg('O mural.'),
  nome: { type: 'string', minLength: 1, maxLength: 200, description: 'O nome, como no catálogo ("Hollow Knight: Silksong").' },
  ano: { type: 'string', pattern: '^\\d{4}$', description: 'O ano de lançamento, AAAA (ajuda a achar a capa certa).' },
  por: { type: 'string', maxLength: 120, description: 'Quem escreveu (livros) ou quem toca (músicas).' },
  capa: { type: 'string', maxLength: 2000, pattern: '^https://', description: 'A capa (https). Sem ela, o Murall procura no catálogo do mural.' },
  buscar_capa: { type: 'boolean', description: 'false: entra sem capa, sem procurar.' },
};

/** Os campos de uma ficha que se escrevem (a forma que `conferirOpMural` confere de novo). */
const CAMPOS_DA_FICHA: Record<string, Esquema> = {
  nome: { type: 'string', minLength: 1, maxLength: 200, description: 'O nome da obra.' },
  por: { type: ['string', 'null'], maxLength: 120, description: 'Quem escreveu (livros) ou quem toca (músicas).' },
  ano: { type: ['string', 'null'], pattern: '^\\d{4}$', description: 'O ano de lançamento, AAAA.' },
  capa: { type: ['string', 'null'], maxLength: 2000, pattern: '^https://', description: 'A capa (https). Sem ela, ao criar, o Murall procura no catálogo.' },
  notas: {
    type: 'object',
    description: 'As notas de 0 a 10 (inteiras), pelo id das notas do mural (ver_contexto, fichas): {"historia": 9, "diversao": 10}. null tira uma. A nota final o Murall calcula.',
  },
  status: { type: 'string', enum: ['incompleto', 'finalizado', 'platinado'], description: 'Não terminou, terminou ou foi além (os nomes de cada mural em ver_contexto).' },
  dificuldade: { type: 'string', enum: ['nenhuma', 'facil', 'media', 'dificil', 'impossivel', 'infernal'], description: 'Só nos murais com dificuldade (jogos, livros).' },
  veredito: { type: ['string', 'null'], enum: ['masterpiece', 'recomendo', 'legalzinho', 'meh', 'chato', null], description: 'O carimbo do veredito (null tira).' },
  quantidade: { type: ['number', 'null'], minimum: 0, maximum: 99999, description: 'Horas jogadas (com fração, em número) ou páginas lidas; só nos murais que anotam.' },
  texto: { type: 'string', maxLength: 20000, description: 'O texto da resenha, no markdown do Murall.' },
  concluida_em: { type: ['string', 'null'], pattern: '^\\d{4}(-\\d{2}-\\d{2})?$', description: 'O dia em que terminou (AAAA-MM-DD), só o ano, ou null (não lembra). Sem ele, ao criar, hoje.' },
  visibilidade: { type: 'string', enum: ['privada', 'publica'], description: 'Quem vê. Só com a permissão publicar; sem dizer, a ficha nasce privada.' },
  forma: { type: 'string', enum: ['album', 'faixa'], description: 'Só nas músicas: álbum ou música.' },
  artista: { type: ['string', 'null'], maxLength: 60, description: 'Só nas músicas: o artista.' },
};

export const FERRAMENTAS_DOS_MURAIS: readonly Ferramenta[] = [
  {
    nome: 'ver_wishlist',
    titulo: 'Ver a wishlist',
    descricao: 'Os desejos de cada mural, como a tela: MUST na frente, LATER no fim. Antes de sugerir, veja também listar_fichas (o que a pessoa já jogou, leu ou viu).',
    escopo: 'desejos:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      mural: muralArg('Só deste mural.'),
      relevancia,
      q: { type: 'string', maxLength: 200, description: 'Busca no nome e no autor.' },
      limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantos (padrão 50).' },
      depois: { type: 'string', description: 'Para a próxima página: o depois que veio na anterior.' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/desejos',
  },
  {
    nome: 'por_na_wishlist',
    titulo: 'Pôr na wishlist',
    descricao:
      'Põe um desejo na wishlist (mural e nome), ou vários em itens (até 50, um pedido por item). O Murall procura a capa no catálogo do mural. O mesmo nome no mesmo mural volta 409 com o que já está lá.',
    escopo: 'desejos:escrever',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({
      ...CAMPOS_DO_ITEM,
      relevancia,
      itens: { type: 'array', maxItems: 50, description: 'Ou vários desejos (até 50).', items: obj({ ...CAMPOS_DO_ITEM, relevancia }, ['mural', 'nome']) },
      chave_idempotencia: idem,
    }),
    metodo: 'POST',
    caminho: '/ext/v1/desejos',
  },
  {
    nome: 'mudar_desejo',
    titulo: 'Mudar um desejo',
    descricao: 'Muda a relevância (must, comum, later), o nome, o ano, o autor ou a capa de um desejo. Mande a versao que você leu.',
    escopo: 'desejos:escrever',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj(
      {
        id: idItem('O id do desejo.'),
        versao: versaoDe('do desejo'),
        relevancia,
        nome: CAMPOS_DO_ITEM['nome']!,
        ano: { type: ['string', 'null'], pattern: '^\\d{4}$', description: 'O ano (null tira).' },
        por: { type: ['string', 'null'], maxLength: 120, description: 'O autor (null tira).' },
        capa: { type: ['string', 'null'], maxLength: 2000, pattern: '^https://', description: 'A capa (null tira).' },
        chave_idempotencia: idem,
      },
      ['id', 'versao'],
    ),
    metodo: 'PATCH',
    caminho: '/ext/v1/desejos/:id',
  },
  {
    nome: 'tirar_da_wishlist',
    titulo: 'Tirar da wishlist',
    descricao: 'Tira um desejo da wishlist (a pessoa pode desfazer pelo histórico). Mande a versao que você leu. Pergunte ao usuário antes.',
    escopo: 'desejos:escrever',
    somenteLeitura: false,
    destrutiva: true,
    entrada: obj({ id: idItem('O id do desejo.'), versao: versaoDe('do desejo'), chave_idempotencia: idem }, ['id', 'versao']),
    metodo: 'DELETE',
    caminho: '/ext/v1/desejos/:id',
  },
  {
    nome: 'ver_pra_depois',
    titulo: 'Ver o Pra depois',
    descricao: 'O que a pessoa terminou e ainda vai resenhar (só o nome e a capa), do mais novo ao mais velho.',
    escopo: 'pra-depois:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      mural: muralArg('Só deste mural.'),
      q: { type: 'string', maxLength: 200, description: 'Busca no nome.' },
      limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantos (padrão 50).' },
      depois: { type: 'string', description: 'Para a próxima página.' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/pra-depois',
  },
  {
    nome: 'por_no_pra_depois',
    titulo: 'Pôr no Pra depois',
    descricao: 'Guarda algo para resenhar depois (mural e nome), ou vários em itens. Se estava na wishlist, sai de lá (como na tela).',
    escopo: 'pra-depois:escrever',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({ ...CAMPOS_DO_ITEM, itens: { type: 'array', maxItems: 50, description: 'Ou vários (até 50).', items: obj(CAMPOS_DO_ITEM, ['mural', 'nome']) }, chave_idempotencia: idem }),
    metodo: 'POST',
    caminho: '/ext/v1/pra-depois',
  },
  {
    nome: 'tirar_do_pra_depois',
    titulo: 'Tirar do Pra depois',
    descricao: 'Tira um item do Pra depois (a pessoa pode desfazer pelo histórico). Mande a versao que você leu. Pergunte ao usuário antes.',
    escopo: 'pra-depois:escrever',
    somenteLeitura: false,
    destrutiva: true,
    entrada: obj({ id: idItem('O id do item.'), versao: versaoDe('do item'), chave_idempotencia: idem }, ['id', 'versao']),
    metodo: 'DELETE',
    caminho: '/ext/v1/pra-depois/:id',
  },
  {
    nome: 'listar_fichas',
    titulo: 'Listar fichas',
    descricao: 'As fichas (resenhas) dos murais, com a nota final do Murall, as notas, o status, o veredito e um resumo do texto (com_texto: true traz inteiro). Pagine com depois.',
    escopo: 'fichas:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      mural: muralArg('Só deste mural.'),
      status: { type: 'string', enum: ['incompleto', 'finalizado', 'platinado'], description: 'Só neste status.' },
      veredito: { type: 'string', enum: ['masterpiece', 'recomendo', 'legalzinho', 'meh', 'chato'], description: 'Só com este veredito.' },
      nota_min: { type: 'integer', minimum: 0, maximum: 10, description: 'Só com a nota final a partir desta.' },
      q: { type: 'string', maxLength: 200, description: 'Busca no nome, no autor, no artista e no texto.' },
      ordem: { type: 'string', enum: ['concluida', 'nota', 'nome', 'mudou'], description: 'A ordem (padrão concluida: as mais recentes primeiro).' },
      com_texto: { type: 'boolean', description: 'true traz o texto inteiro.' },
      limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantas (padrão 30).' },
      depois: { type: 'string', description: 'Para a próxima página.' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/fichas',
  },
  {
    nome: 'ler_ficha',
    titulo: 'Ler uma ficha',
    descricao: 'Uma ficha inteira, com o texto e a versao (para mudar).',
    escopo: 'fichas:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({ id: idItem('O id da ficha.') }, ['id']),
    metodo: 'GET',
    caminho: '/ext/v1/fichas/:id',
  },
  {
    nome: 'criar_ficha',
    titulo: 'Criar uma ficha',
    descricao:
      'Cria uma ficha (resenha) num mural: mural, nome e pelo menos uma nota (as do mural, em ver_contexto). A nota final o Murall calcula. Nasce privada; com o nome de outra ficha do mural, vira a releitura (rejogada) dela. O Murall procura a capa.',
    escopo: 'fichas:escrever',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({ mural: muralArg('O mural.'), ...CAMPOS_DA_FICHA, buscar_capa: CAMPOS_DO_ITEM['buscar_capa']!, chave_idempotencia: idem }, ['mural', 'nome', 'notas']),
    metodo: 'POST',
    caminho: '/ext/v1/fichas',
  },
  {
    nome: 'editar_ficha',
    titulo: 'Mudar uma ficha',
    descricao: 'Muda os campos mandados de uma ficha (as notas mandadas vão por cima das outras). Mande a versao que você leu; se voltar conflito, leia de novo.',
    escopo: 'fichas:escrever',
    somenteLeitura: false,
    destrutiva: false,
    entrada: obj({ id: idItem('O id da ficha.'), versao: versaoDe('da ficha'), ...CAMPOS_DA_FICHA, chave_idempotencia: idem }, ['id', 'versao']),
    metodo: 'PATCH',
    caminho: '/ext/v1/fichas/:id',
  },
];

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
      'A conta, o dia de hoje no fuso dela, o que esta chave pode, o vocabulário das Anotações (grupos com assuntos e tags, tags fixas), o do Kanban (os quadros e as colunas), o dos Gastos (envelopes, pessoas, os meses com lançamento), o do Calendário (as cores e os meses que ver_agenda alcança) e o dos murais (quantos desejos e pra depois há, e as notas de cada mural para escrever fichas). Chame antes de criar ou mudar, e use os nomes que já existem.',
    escopo: [
      'notas:ler',
      'gastos:ler',
      'kanban:ler',
      'kanban:mover',
      'kanban:colunas',
      'calendario:ler',
      'calendario:escrever',
      'calendario:apagar',
      'desejos:ler',
      'desejos:escrever',
      'pra-depois:ler',
      'pra-depois:escrever',
      'fichas:ler',
      'fichas:escrever',
    ],
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({}),
    metodo: 'GET',
    caminho: '/ext/v1/contexto',
  },
  {
    nome: 'buscar',
    titulo: 'Buscar',
    descricao: 'Busca nas notas (título e texto), nos nomes dos lançamentos e dos lembretes, na wishlist, no Pra depois e nas fichas, sem ligar para acento e caixa. Sem areas, busca em tudo que esta chave lê.',
    escopo: ['notas:ler', 'gastos:ler', 'calendario:ler', 'desejos:ler', 'pra-depois:ler', 'fichas:ler'],
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj(
      {
        q: { type: 'string', minLength: 2, maxLength: 200, description: 'O que buscar.' },
        areas: { type: 'string', description: 'Onde, separado por vírgula: notas, gastos, calendario, desejos, pra-depois, fichas.' },
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
    nome: 'ver_imagem',
    titulo: 'Ver uma imagem',
    descricao:
      'Uma imagem colada numa nota, para você ver: o id são as 22 letras depois de murall://imagem/ no texto (o widget {{imagem: murall://imagem/ID}}; o endereço inteiro também serve). Mande também a nota onde você a viu: fica mais rápido. Só as das notas que esta chave lê.',
    escopo: 'notas:ler',
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj(
      {
        id: { type: 'string', pattern: '^(murall://imagem/)?[A-Za-z0-9_-]{22}$', description: 'O id da imagem (as 22 letras depois de murall://imagem/), ou o endereço inteiro.' },
        nota: { type: 'string', pattern: '^[\\w-]{1,64}$', description: 'Opcional: o id da nota onde está a imagem (de ler_nota).' },
      },
      ['id'],
    ),
    metodo: 'GET',
    caminho: '/ext/v1/imagens/:id',
    devolveImagem: true,
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
  ...FERRAMENTAS_DO_CALENDARIO,
  ...FERRAMENTAS_DOS_GASTOS,
  ...FERRAMENTAS_DOS_MURAIS,
  {
    nome: 'ver_pedidos',
    titulo: 'Ver os pedidos',
    descricao: 'Em que pé está o que esta chave pediu: pendente (espera o Murall abrir), aguardando-aprovacao, aplicado, conflito, recusado, falhou, expirado ou desfeito. Com id, um só.',
    escopo: null,
    somenteLeitura: true,
    destrutiva: false,
    entrada: obj({
      id: { type: 'string', pattern: '^pd_[A-Za-z0-9_-]{16}$', description: 'Opcional: o id de um pedido.' },
      estado: { type: 'string', enum: [...ESTADOS], description: 'Só os neste estado.' },
      limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantos (padrão 30).' },
    }),
    metodo: 'GET',
    caminho: '/ext/v1/pedidos/:id',
    caminhoSemId: '/ext/v1/pedidos',
  },
];

/** Os argumentos que não vão para a rota como campo (viram caminho ou cabeçalho). */
export const ARGUMENTOS_DE_FORA = ['id', 'chave_idempotencia'] as const;
