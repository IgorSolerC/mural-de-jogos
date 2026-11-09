import {
  CADAS,
  CORES,
  ICONE_RE,
  INTERVALO_MAX,
  NOTAS_DO_LEMBRETE_MAX,
  PULADOS_MAX,
  TITULO_DO_LEMBRETE_MAX,
  VEZES_MAX,
  VEZES_NO_MES_MAX,
  agendaDoMes,
  ehDia,
  ehHora,
  type AgendaDoMesV1,
  type LembreteV1,
  type VezV1,
} from '../../../contrato/api-v1/calendario';
import { dobra } from '../../../contrato/api-v1/escopos';
import {
  BARALHOS_POR_CARTA,
  CONTEXTO_ESTUDOS,
  ESTADOS_DA_CARTA,
  ESTILOS,
  FILA_MAX,
  NIVEIS,
  NOME_DO_BARALHO_MAX,
  NOVAS_POR_DIA_MAX,
  SUBTITULO_MAX,
  TITULO_DA_FRENTE_MAX,
  ULTIMAS_MAX,
  type BaralhoV1,
  type CartaV1,
  type ContextoEstudosV1,
  type FilaDoDiaV1,
} from '../../../contrato/api-v1/estudos';
import {
  CONTEXTO_GASTOS,
  DIA_RE,
  MES_RE,
  visaoDoMes,
  type ContextoGastosV1,
  type LancamentoV1,
  type MesV1,
} from '../../../contrato/api-v1/gastos';
import {
  ARTISTA_MAX,
  CONTEXTO_FICHAS,
  DIFICULDADES,
  MURAIS,
  NOME_MAX,
  NOTAS,
  POR_MAX,
  QUANTIDADE_MAX,
  RELEVANCIAS,
  STATUS,
  TEXTO_DA_FICHA_MAX,
  VEREDITOS,
  ehMural,
  type ContextoFichasV1,
  type DesejoV1,
  type FichaV1,
  type PraDepoisV1,
} from '../../../contrato/api-v1/murais';
import { CARTOES_MAX, COLUNAS_MAX, DEPENDENCIAS_MAX, IMPORTANCIAS, NOME_DA_COLUNA_MAX, STATUS_MAX, type QuadroV1 } from '../../../contrato/api-v1/kanban';
import { CONTEXTO_NOTAS, ESPELHO_POR_ENVIO, PASTA_ID_RE, type ContextoNotasV1, type NotaNoEspelhoV1, type NotaV1, type TipoDoEspelho } from '../../../contrato/api-v1/notas';
import { HttpError } from '../errors';
import { Deps } from '../ports';

/**
 * O espelho (PLANO-API.md, seção 8): o que o site manda (um item v1 por linha) e o que a API conta e
 * confere. A API não abre o mural: o site é quem traduz; aqui só se confere a forma, para lixo não
 * entrar, e se tiram as colunas de filtro (grupo, data, busca) do próprio item.
 */

/** Linhas do espelho que uma conta grava por dia UTC (a primeira carga de uma conta grande leva uns dias). */
export const MIRROR_ROWS_PER_DAY = 3000;
/** O maior corpo de um envio, em caracteres (o site manda até 50 itens e uns 500 mil caracteres). */
export const MIRROR_MAX_CHARS = 640_000;
export const ITEM_ID_RE = /^[\w-]{1,64}$/;
const HASH_RE = /^[0-9a-f]{16,64}$/;

/** As áreas que alguma chave viva da conta alcança (ver `SCOPES_OF_AREA`). */
export async function mirrorAreas(deps: Deps, userId: string): Promise<string[]> {
  const rows = await deps.db.all<{ escopos: string }>('SELECT escopos FROM api_chaves WHERE usuario_id = ? AND expira_em > ?', [
    userId,
    deps.now().toISOString(),
  ]);
  const scopes = new Set<string>();
  for (const r of rows) {
    try {
      for (const s of JSON.parse(r.escopos) as unknown[]) if (typeof s === 'string') scopes.add(s);
    } catch {
      /* uma linha estragada só não conta */
    }
  }
  return Object.keys(SCOPES_OF_AREA).filter((area) => SCOPES_OF_AREA[area]!.some((s) => scopes.has(s)));
}

/**
 * As permissões que fazem cada área ir ao espelho (qualquer uma delas): ler as Anotações, ler os
 * Gastos, e qualquer uma do Kanban e do Calendário (quem só move cartões precisa das colunas, e quem só
 * muda ou apaga lembretes precisa do lembrete de agora, para a API conferir o pedido).
 */
export const SCOPES_OF_AREA: Record<string, readonly string[]> = {
  notas: ['notas:ler'],
  gastos: ['gastos:ler'],
  kanban: ['kanban:ler', 'kanban:mover', 'kanban:colunas'],
  calendario: ['calendario:ler', 'calendario:escrever', 'calendario:apagar'],
  desejos: ['desejos:ler', 'desejos:escrever'],
  'pra-depois': ['pra-depois:ler', 'pra-depois:escrever'],
  fichas: ['fichas:ler', 'fichas:escrever'],
  estudos: ['estudos:ler', 'estudos:estudar', 'estudos:escrever', 'estudos:apagar'],
};

/** Os tipos de linha de cada área. */
export const TYPES_OF: Record<string, readonly TipoDoEspelho[]> = {
  notas: ['nota', 'contexto'],
  gastos: ['lancamento', 'visao', 'contexto-gastos'],
  kanban: ['quadro'],
  calendario: ['lembrete', 'agenda'],
  desejos: ['desejo'],
  'pra-depois': ['pra-depois'],
  fichas: ['ficha', 'contexto-fichas'],
  estudos: ['carta', 'baralho', 'contexto-estudos'],
};

export interface MirrorRow {
  tipo: TipoDoEspelho;
  id: string;
  versao: string | null;
  hash: string;
  grupo: string | null;
  data: string | null;
  busca: string | null;
  dados: string;
}

const bad = (message: string) => new HttpError(400, 'espelho-invalido', message);
/**
 * O status de um cartão em unidades do JS: o site guarda até `STATUS_MAX` letras (cada emoji é uma letra
 * e duas unidades), então aqui cabem até o dobro. Com o teto em unidades, um status de emoji válido no
 * site barrava o espelho inteiro.
 */
const STATUS_UNITS = STATUS_MAX * 2;
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isStrOrNull = (v: unknown, max: number) => v === null || isStr(v, max);
const isIso = (v: unknown) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const strList = (v: unknown, n: number, max: number) => Array.isArray(v) && v.length <= n && v.every((x) => isStr(x, max));

/** O id de uma pasta do Murall: a mesma regra do site (um id que o site aceita e a API não travava o espelho inteiro). */
const isFolderId = (v: unknown): v is string => typeof v === 'string' && PASTA_ID_RE.test(v);

/**
 * A nota v1 tem a forma certa? (O conteúdo é da própria pessoa: confere só a forma e os tamanhos.) O site das
 * pastas manda a pasta só pelo id (`pasta_id`; a API monta o caminho pelo contexto, PLANO-PASTAS.md, 5.2); o
 * de antes delas, ainda aberto em algum aparelho, manda o `assunto`, que fica como veio.
 */
function checkNota(n: Record<string, unknown>): NotaNoEspelhoV1 | NotaV1 {
  const byId = 'pasta_id' in n;
  const k = n['kanban'] as Record<string, unknown> | null;
  const t = n['tarefas'] as Record<string, unknown> | null;
  const ok =
    isStr(n['id'], 64) &&
    isStr(n['titulo'], 200) &&
    isStr(n['texto'], 20_000) &&
    isStrOrNull(n['grupo'], 32) &&
    (byId ? n['pasta_id'] === null || isFolderId(n['pasta_id']) : isStrOrNull(n['assunto'], 32)) &&
    strList(n['tags'], 12, 32) &&
    (n['data'] === null || (typeof n['data'] === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(n['data']))) &&
    (n['finalizada_em'] === null || isIso(n['finalizada_em'])) &&
    typeof n['fixada'] === 'boolean' &&
    (n['visibilidade'] === 'privada' || n['visibilidade'] === 'publica') &&
    isStrOrNull(n['capa'], 2_000) &&
    !!t &&
    Number.isInteger(t['feitas']) &&
    Number.isInteger(t['total']) &&
    (k === null || (!!k && isStr(k['coluna'], 40) && isStrOrNull(k['importancia'], 16) && isStrOrNull(k['status'], STATUS_UNITS) && typeof k['no_mural'] === 'boolean')) &&
    isIso(n['criada_em']) &&
    isIso(n['versao']);
  if (!ok) throw bad(`A nota "${String(n['id']).slice(0, 64)}" não tem a forma da v1.`);
  // só os campos da v1, na ordem dela (um campo a mais não entra no espelho)
  const v = n as unknown as NotaV1 & NotaNoEspelhoV1;
  return {
    id: v.id,
    titulo: v.titulo,
    texto: v.texto,
    grupo: v.grupo,
    ...(byId ? { pasta_id: v.pasta_id } : { assunto: v.assunto }),
    tags: v.tags,
    data: v.data,
    finalizada_em: v.finalizada_em,
    fixada: v.fixada,
    visibilidade: v.visibilidade,
    capa: v.capa,
    tarefas: { feitas: v.tarefas.feitas, total: v.tarefas.total },
    kanban: v.kanban && { coluna: v.kanban.coluna, importancia: v.kanban.importancia, status: v.kanban.status, no_mural: v.kanban.no_mural },
    criada_em: v.criada_em,
    versao: v.versao,
  } as NotaNoEspelhoV1 | NotaV1;
}

function checkContexto(c: Record<string, unknown>): ContextoNotasV1 {
  const tagList = (v: unknown) => Array.isArray(v) && v.length <= 2_000 && v.every((t) => t && typeof t === 'object' && isStr((t as { nome: unknown }).nome, 32));
  // as pastas (o site de antes delas não manda): o id, o nome, a de cima e quantas notas; até 2.000, o teto do Murall
  const folderList = (v: unknown) =>
    v === undefined ||
    (Array.isArray(v) &&
      v.length <= 2_000 &&
      v.every((p: Record<string, unknown>) => p && isFolderId(p['id']) && isStr(p['nome'], 32) && (p['pai'] === null || isFolderId(p['pai'])) && Number.isInteger(p['notas'])));
  // as desfeitas que alguma nota ainda guarda, com a viva de cada uma (o site de antes delas não manda)
  const goneList = (v: unknown) =>
    v === undefined || (Array.isArray(v) && v.length <= 2_000 && v.every((d: Record<string, unknown>) => d && isFolderId(d['id']) && (d['viva'] === null || isFolderId(d['viva']))));
  const grupos = c['grupos'];
  const semGrupo = c['sem_grupo'] as Record<string, unknown> | null;
  const ok =
    Array.isArray(grupos) &&
    grupos.length <= 500 &&
    grupos.every((g: Record<string, unknown>) => g && isStr(g['nome'], 32) && strList(g['assuntos'], 500, 32) && folderList(g['pastas']) && tagList(g['tags'])) &&
    !!semGrupo &&
    tagList(semGrupo['tags']) &&
    folderList(semGrupo['pastas']) &&
    strList(c['tags_fixas'], 40, 32) &&
    goneList(c['desfeitas']);
  if (!ok) throw bad('O contexto das Anotações não tem a forma da v1.');
  return c as unknown as ContextoNotasV1;
}

const isCents = (v: unknown) => Number.isSafeInteger(v) && Math.abs(v as number) <= 1e12;
const isFlow = (v: unknown) => v === 'saida' || v === 'entrada';

/** O lançamento v1 tem a forma certa? Só os campos da v1 entram. */
function checkLancamento(l: Record<string, unknown>): LancamentoV1 {
  const env = l['envelope'] as Record<string, unknown> | null;
  const m = l['mensal'] as Record<string, unknown> | null;
  const ok =
    isStr(l['id'], 64) &&
    isStr(l['titulo'], 200) &&
    isCents(l['centavos']) &&
    isFlow(l['tipo']) &&
    (env === null || (!!env && isStr(env['id'], 64) && isStr(env['nome'], 40))) &&
    (l['pagamento'] === null || l['pagamento'] === 'avista' || l['pagamento'] === 'pix' || l['pagamento'] === 'parcelado') &&
    (l['parcelas'] === null || (Number.isInteger(l['parcelas']) && (l['parcelas'] as number) >= 2 && (l['parcelas'] as number) <= 120)) &&
    (l['precisava'] === null || l['precisava'] === 'luxo' || l['precisava'] === 'conforto' || l['precisava'] === 'indispensavel') &&
    strList(l['pessoas'], 40, 40) &&
    typeof l['dia'] === 'string' &&
    DIA_RE.test(l['dia']) &&
    typeof l['mes'] === 'string' &&
    MES_RE.test(l['mes']) &&
    (l['fatura'] === -1 || l['fatura'] === 0 || l['fatura'] === 1) &&
    (m === null ||
      (!!m &&
        (m['ate'] === null || (typeof m['ate'] === 'string' && MES_RE.test(m['ate']))) &&
        !!m['valores'] &&
        typeof m['valores'] === 'object' &&
        Object.entries(m['valores'] as object).length <= 240 &&
        Object.entries(m['valores'] as object).every(([k, v]) => MES_RE.test(k) && isCents(v)) &&
        Array.isArray(m['pulados']) &&
        (m['pulados'] as unknown[]).length <= 240 &&
        (m['pulados'] as unknown[]).every((x) => typeof x === 'string' && MES_RE.test(x)))) &&
    isStrOrNull(l['reembolso_de'], 64) &&
    isIso(l['criado_em']) &&
    isIso(l['versao']);
  if (!ok) throw bad(`O lançamento "${String(l['id']).slice(0, 64)}" não tem a forma da v1.`);
  const v = l as unknown as LancamentoV1;
  return {
    id: v.id,
    titulo: v.titulo,
    centavos: v.centavos,
    tipo: v.tipo,
    envelope: v.envelope && { id: v.envelope.id, nome: v.envelope.nome },
    pagamento: v.pagamento,
    parcelas: v.parcelas,
    precisava: v.precisava,
    pessoas: v.pessoas,
    dia: v.dia,
    mes: v.mes,
    fatura: v.fatura,
    mensal: v.mensal && { ate: v.mensal.ate, valores: v.mensal.valores, pulados: v.mensal.pulados },
    reembolso_de: v.reembolso_de,
    criado_em: v.criado_em,
    versao: v.versao,
  };
}

/** A visão de um mês: confere a forma por cima (os números são contas do site). */
function checkVisao(v: Record<string, unknown>, id: string): MesV1 {
  const list = (x: unknown, n: number) => Array.isArray(x) && x.length <= n && x.every((i) => i && typeof i === 'object' && !Array.isArray(i));
  const p = v['precisava'] as Record<string, unknown> | null;
  const a = v['parcelas_a_frente'] as Record<string, unknown> | null;
  const ok =
    typeof v['mes'] === 'string' &&
    MES_RE.test(v['mes']) &&
    visaoDoMes(v['mes']) === id &&
    ['entradas', 'saidas', 'saldo', 'comprometido'].every((k) => isCents(v[k])) &&
    list(v['por_envelope'], 200) &&
    list(v['entradas_por_envelope'], 200) &&
    !!p &&
    ['luxo', 'conforto', 'indispensavel', 'sem_resposta'].every((k) => isCents(p[k])) &&
    list(v['por_pessoa'], 200) &&
    list(v['carnes'], 2_000) &&
    !!a &&
    isCents(a['total']) &&
    isCents(a['proximo_mes']) &&
    list(v['linhas'], 5_000);
  if (!ok) throw bad(`A visão "${id}" não tem a forma da v1.`);
  return v as unknown as MesV1;
}

function checkContextoGastos(c: Record<string, unknown>): ContextoGastosV1 {
  const envs = c['envelopes'];
  const people = c['pessoas'];
  const ok =
    Array.isArray(envs) &&
    envs.length <= 200 &&
    envs.every((e: Record<string, unknown>) => e && isStr(e['id'], 64) && isStr(e['nome'], 40) && isFlow(e['tipo'])) &&
    Array.isArray(people) &&
    people.length <= 300 &&
    people.every((p: Record<string, unknown>) => p && isStr(p['id'], 64) && isStr(p['nome'], 40) && typeof p['eu'] === 'boolean') &&
    Array.isArray(c['meses']) &&
    (c['meses'] as unknown[]).length <= 2_400 &&
    (c['meses'] as unknown[]).every((m) => typeof m === 'string' && MES_RE.test(m));
  if (!ok) throw bad('O contexto dos Gastos não tem a forma da v1.');
  return { envelopes: envs as ContextoGastosV1['envelopes'], pessoas: people as ContextoGastosV1['pessoas'], meses: c['meses'] as string[] };
}

const ID_RE = /^[\w-]{1,64}$/;

/** O quadro v1 tem a forma certa? Só os campos da v1 entram, e cada cartão numa coluna que existe. */
function checkQuadro(q: Record<string, unknown>, id: string): QuadroV1 {
  const cols = q['colunas'];
  const cards = q['cartoes'];
  const colOk = (c: Record<string, unknown>) =>
    !!c &&
    isStr(c['id'], 64) &&
    ID_RE.test(c['id']) &&
    isStr(c['nome'], NOME_DA_COLUNA_MAX) &&
    typeof c['finaliza'] === 'boolean' &&
    typeof c['pula'] === 'boolean' &&
    isStrOrNull(c['ordem'], 400) &&
    Number.isInteger(c['cartoes']);
  const ok =
    isStr(q['id'], 64) &&
    q['id'] === id &&
    isStr(q['grupo'], 32) &&
    !!q['grupo'].trim() &&
    typeof q['so_no_kanban'] === 'boolean' &&
    Array.isArray(cols) &&
    cols.length >= 1 &&
    cols.length <= COLUNAS_MAX &&
    cols.every(colOk) &&
    Array.isArray(cards) &&
    cards.length <= CARTOES_MAX &&
    isIso(q['versao']);
  if (!ok) throw bad(`O quadro "${String(q['id']).slice(0, 64)}" não tem a forma da v1.`);
  const colIds = new Set((cols as { id: string }[]).map((c) => c.id));
  const cardOk = (c: Record<string, unknown>) =>
    !!c &&
    isStr(c['nota'], 64) &&
    ID_RE.test(c['nota']) &&
    isStr(c['titulo'], 200) &&
    typeof c['coluna'] === 'string' &&
    colIds.has(c['coluna']) &&
    Number.isInteger(c['posicao']) &&
    typeof c['finalizada'] === 'boolean' &&
    (c['importancia'] === null || (IMPORTANCIAS as readonly unknown[]).includes(c['importancia'])) &&
    isStrOrNull(c['status'], STATUS_UNITS) &&
    strList(c['depende_de'], DEPENDENCIAS_MAX, 64) &&
    typeof c['no_mural'] === 'boolean' &&
    strList(c['tags'], 12, 32);
  if (colIds.size !== cols.length || !cards.every(cardOk)) throw bad(`O quadro "${id}" não tem a forma da v1.`);
  const v = q as unknown as QuadroV1;
  return {
    id: v.id,
    grupo: v.grupo,
    so_no_kanban: v.so_no_kanban,
    colunas: v.colunas.map((c) => ({ id: c.id, nome: c.nome, finaliza: c.finaliza, pula: c.pula, ordem: c.ordem, cartoes: c.cartoes })),
    cartoes: v.cartoes.map((c) => ({
      nota: c.nota,
      titulo: c.titulo,
      coluna: c.coluna,
      posicao: c.posicao,
      finalizada: c.finalizada,
      importancia: c.importancia,
      status: c.status,
      depende_de: c.depende_de,
      no_mural: c.no_mural,
      tags: c.tags,
    })),
    versao: v.versao,
  };
}

const isDayOrNull = (v: unknown) => v === null || ehDia(v);
const isTimeOrNull = (v: unknown) => v === null || ehHora(v);
const isColor = (v: unknown) => (CORES as readonly unknown[]).includes(v);
/** O ícone do lembrete: sem ele (o site de antes não manda) ou null, nenhum. */
const isIcon = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && ICONE_RE.test(v));
const idList = (v: unknown, n: number) => Array.isArray(v) && v.length <= n && v.every((x) => typeof x === 'string' && ID_RE.test(x));

/** O lembrete v1 tem a forma certa? Só os campos da v1 entram. */
function checkLembrete(l: Record<string, unknown>): LembreteV1 {
  const r = l['repete'] as Record<string, unknown> | null;
  const g = l['google'] as Record<string, unknown> | null;
  const repeatOk =
    r === null ||
    (!!r &&
      (CADAS as readonly unknown[]).includes(r['cada']) &&
      Number.isInteger(r['intervalo']) &&
      (r['intervalo'] as number) >= 1 &&
      (r['intervalo'] as number) <= INTERVALO_MAX &&
      Array.isArray(r['dias_da_semana']) &&
      (r['dias_da_semana'] as unknown[]).length <= 7 &&
      (r['dias_da_semana'] as unknown[]).every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) &&
      (r['vez_no_mes'] === null || [1, 2, 3, 4, 5, -1].includes(r['vez_no_mes'] as number)) &&
      typeof r['so_nos_meses_com_o_dia'] === 'boolean' &&
      isDayOrNull(r['ate']) &&
      (r['vezes'] === null || (Number.isInteger(r['vezes']) && (r['vezes'] as number) >= 1 && (r['vezes'] as number) <= VEZES_MAX)));
  const ok =
    isStr(l['id'], 64) &&
    ID_RE.test(l['id']) &&
    isStr(l['titulo'], TITULO_DO_LEMBRETE_MAX) &&
    ehDia(l['dia']) &&
    isTimeOrNull(l['hora']) &&
    isDayOrNull(l['fim']) &&
    isTimeOrNull(l['hora_fim']) &&
    repeatOk &&
    isStrOrNull(l['em_palavras'], 400) &&
    Array.isArray(l['pulados']) &&
    (l['pulados'] as unknown[]).length <= PULADOS_MAX &&
    (l['pulados'] as unknown[]).every(ehDia) &&
    isColor(l['cor']) &&
    isIcon(l['icone']) &&
    typeof l['silencioso'] === 'boolean' &&
    idList(l['notas'], NOTAS_DO_LEMBRETE_MAX) &&
    (g === null || (!!g && isStrOrNull(g['link'], 600) && (g['travado'] === null || g['travado'] === 'convite' || g['travado'] === 'google'))) &&
    isIso(l['criado_em']) &&
    isIso(l['versao']);
  if (!ok) throw bad(`O lembrete "${String(l['id']).slice(0, 64)}" não tem a forma da v1.`);
  const v = l as unknown as LembreteV1;
  return {
    id: v.id,
    titulo: v.titulo,
    dia: v.dia,
    hora: v.hora,
    fim: v.fim,
    hora_fim: v.hora_fim,
    repete: v.repete && {
      cada: v.repete.cada,
      intervalo: v.repete.intervalo,
      dias_da_semana: v.repete.dias_da_semana,
      vez_no_mes: v.repete.vez_no_mes,
      so_nos_meses_com_o_dia: v.repete.so_nos_meses_com_o_dia,
      ate: v.repete.ate,
      vezes: v.repete.vezes,
    },
    em_palavras: v.em_palavras,
    pulados: v.pulados,
    cor: v.cor,
    icone: v.icone ?? null,
    silencioso: v.silencioso,
    notas: v.notas,
    google: v.google && { link: v.google.link, travado: v.google.travado },
    criado_em: v.criado_em,
    versao: v.versao,
  };
}

/** A agenda de um mês: cada vez com a forma da v1, num mês que bate com o id. */
function checkAgenda(a: Record<string, unknown>, id: string): AgendaDoMesV1 {
  const vezOk = (x: Record<string, unknown>) =>
    !!x &&
    isStr(x['lembrete'], 64) &&
    ID_RE.test(x['lembrete']) &&
    isStr(x['titulo'], TITULO_DO_LEMBRETE_MAX) &&
    ehDia(x['dia']) &&
    isDayOrNull(x['fim']) &&
    (x['fim'] === null || (x['fim'] as string) > (x['dia'] as string)) &&
    isTimeOrNull(x['hora']) &&
    isTimeOrNull(x['hora_fim']) &&
    isColor(x['cor']) &&
    isIcon(x['icone']) &&
    typeof x['silencioso'] === 'boolean' &&
    typeof x['repete'] === 'boolean' &&
    idList(x['notas'], NOTAS_DO_LEMBRETE_MAX);
  const vezes = a['vezes'];
  const ok =
    typeof a['mes'] === 'string' && MES_RE.test(a['mes']) && agendaDoMes(a['mes']) === id && Array.isArray(vezes) && vezes.length <= VEZES_NO_MES_MAX && vezes.every(vezOk);
  if (!ok) throw bad(`A agenda "${id}" não tem a forma da v1.`);
  return {
    mes: a['mes'] as string,
    vezes: (vezes as VezV1[]).map((x) => ({
      lembrete: x.lembrete,
      titulo: x.titulo,
      dia: x.dia,
      fim: x.fim,
      hora: x.hora,
      hora_fim: x.hora_fim,
      cor: x.cor,
      icone: x.icone ?? null,
      silencioso: x.silencioso,
      repete: x.repete,
      notas: x.notas,
    })),
  };
}

const isYear = (v: unknown) => v === null || isStr(v, 10);
const isCover = (v: unknown) => v === null || (isStr(v, 2_000) && /^https:\/\//.test(v));

/** O desejo ou o pra depois v1 tem a forma certa? Só os campos da v1 entram. */
function checkItem(d: Record<string, unknown>, wish: boolean): DesejoV1 | PraDepoisV1 {
  const ok =
    isStr(d['id'], 64) &&
    ID_RE.test(d['id']) &&
    ehMural(d['mural']) &&
    isStr(d['nome'], NOME_MAX) &&
    !!d['nome'].trim() &&
    isYear(d['ano']) &&
    isStrOrNull(d['por'], POR_MAX) &&
    isCover(d['capa']) &&
    (!wish || (RELEVANCIAS as readonly unknown[]).includes(d['relevancia'])) &&
    isIso(d['criado_em']) &&
    isIso(d['versao']);
  if (!ok) throw bad(`${wish ? 'O desejo' : 'O pra depois'} "${String(d['id']).slice(0, 64)}" não tem a forma da v1.`);
  const v = d as unknown as DesejoV1;
  return {
    id: v.id,
    mural: v.mural,
    nome: v.nome,
    ano: v.ano,
    por: v.por,
    capa: v.capa,
    ...(wish ? { relevancia: v.relevancia } : {}),
    criado_em: v.criado_em,
    versao: v.versao,
  };
}

/** A ficha v1 tem a forma certa? Só os campos da v1 entram, e só as notas que existem. */
function checkFicha(f: Record<string, unknown>): FichaV1 {
  const notas = f['notas'] as Record<string, unknown> | null;
  const score = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10);
  const ok =
    isStr(f['id'], 64) &&
    ID_RE.test(f['id']) &&
    ehMural(f['mural']) &&
    isStr(f['nome'], NOME_MAX) &&
    !!f['nome'].trim() &&
    isStrOrNull(f['por'], POR_MAX) &&
    isYear(f['ano']) &&
    isCover(f['capa']) &&
    (f['forma'] === null || f['forma'] === 'album' || f['forma'] === 'faixa') &&
    isStrOrNull(f['artista'], ARTISTA_MAX) &&
    typeof f['nota_final'] === 'number' &&
    f['nota_final'] >= 0 &&
    f['nota_final'] <= 10 &&
    !!notas &&
    typeof notas === 'object' &&
    !Array.isArray(notas) &&
    Object.keys(notas).length <= 4 &&
    Object.entries(notas).every(([k, v]) => NOTAS.includes(k) && score(v)) &&
    typeof f['nota_final_na_mao'] === 'boolean' &&
    (STATUS as readonly unknown[]).includes(f['status']) &&
    (f['dificuldade'] === null || (DIFICULDADES as readonly unknown[]).includes(f['dificuldade'])) &&
    (f['veredito'] === null || (VEREDITOS as readonly unknown[]).includes(f['veredito'])) &&
    (f['quantidade'] === null || (typeof f['quantidade'] === 'number' && f['quantidade'] >= 0 && f['quantidade'] <= QUANTIDADE_MAX)) &&
    isStr(f['texto'], TEXTO_DA_FICHA_MAX) &&
    (f['concluida_em'] === null || (typeof f['concluida_em'] === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(f['concluida_em']))) &&
    (f['visibilidade'] === 'privada' || f['visibilidade'] === 'publica') &&
    isStrOrNull(f['releitura_de'], 64) &&
    isIso(f['criada_em']) &&
    isIso(f['versao']);
  if (!ok) throw bad(`A ficha "${String(f['id']).slice(0, 64)}" não tem a forma da v1.`);
  const v = f as unknown as FichaV1;
  return {
    id: v.id,
    mural: v.mural,
    nome: v.nome,
    por: v.por,
    ano: v.ano,
    capa: v.capa,
    forma: v.forma,
    artista: v.artista,
    nota_final: v.nota_final,
    notas: { ...v.notas },
    nota_final_na_mao: v.nota_final_na_mao,
    status: v.status,
    dificuldade: v.dificuldade,
    veredito: v.veredito,
    quantidade: v.quantidade,
    texto: v.texto,
    concluida_em: v.concluida_em,
    visibilidade: v.visibilidade,
    releitura_de: v.releitura_de,
    criada_em: v.criada_em,
    versao: v.versao,
  };
}

/** O contexto das fichas: os murais, cada um com as quatro notas, os status, a dificuldade e a quantidade. */
function checkContextoFichas(c: Record<string, unknown>): ContextoFichasV1 {
  const murais = c['murais'];
  const muralOk = (m: Record<string, unknown>) => {
    const notas = m['notas'];
    const st = m['status'] as Record<string, unknown> | null;
    const q = m['quantidade'] as Record<string, unknown> | null;
    return (
      !!m &&
      ehMural(m['mural']) &&
      isStr(m['nome'], 40) &&
      Array.isArray(notas) &&
      notas.length <= 4 &&
      notas.every((n: Record<string, unknown>) => n && NOTAS.includes(n['id'] as string) && isStr(n['nome'], 40) && typeof n['peso'] === 'number') &&
      !!st &&
      STATUS.every((k) => isStr(st[k], 40)) &&
      isStrOrNull(m['dificuldade'], 40) &&
      (q === null || (!!q && isStr(q['unidade'], 20) && typeof q['fracao'] === 'boolean')) &&
      isStr(m['releitura'], 40) &&
      Number.isInteger(m['fichas'])
    );
  };
  if (!Array.isArray(murais) || murais.length > MURAIS.length || !murais.every(muralOk)) throw bad('O contexto das fichas não tem a forma da v1.');
  return {
    murais: (murais as ContextoFichasV1['murais']).map((m) => ({
      mural: m.mural,
      nome: m.nome,
      notas: m.notas.map((n) => ({ id: n.id, nome: n.nome, peso: n.peso })),
      status: { incompleto: m.status.incompleto, finalizado: m.status.finalizado, platinado: m.status.platinado },
      dificuldade: m.dificuldade,
      quantidade: m.quantidade && { unidade: m.quantidade.unidade, fracao: m.quantidade.fracao },
      releitura: m.releitura,
      fichas: m.fichas,
    })),
  };
}

// ===== Os Estudos (rodada 12) =====

const isCount = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const FILA_TIPOS: readonly unknown[] = ['nova', 'aprender', 'revisao'];

/** As filas de hoje e de amanhã (até `FILA_MAX` cartas cada), na forma da v1. */
function checkFilas(v: unknown): FilaDoDiaV1[] | null {
  if (!Array.isArray(v) || v.length > 2) return null;
  const out: FilaDoDiaV1[] = [];
  for (const f of v as Record<string, unknown>[]) {
    if (!f || !ehDia(f['dia']) || typeof f['cortada'] !== 'boolean' || !Array.isArray(f['itens']) || f['itens'].length > FILA_MAX) return null;
    const itens = f['itens'] as Record<string, unknown>[];
    const ok = itens.every(
      (i) =>
        !!i &&
        typeof i['nota'] === 'string' &&
        ID_RE.test(i['nota']) &&
        typeof i['baralho'] === 'string' &&
        ID_RE.test(i['baralho']) &&
        FILA_TIPOS.includes(i['tipo']) &&
        (i['volta_em'] === null || isIso(i['volta_em'])),
    );
    if (!ok) return null;
    out.push({
      dia: f['dia'] as string,
      itens: itens.map((i) => ({ nota: i['nota'] as string, baralho: i['baralho'] as string, tipo: i['tipo'] as FilaDoDiaV1['itens'][number]['tipo'], volta_em: i['volta_em'] as string | null })),
      cortada: f['cortada'] as boolean,
    });
  }
  return out;
}

/** A carta v1 tem a forma certa? (A frente e o verso são da própria pessoa: confere só a forma e os tamanhos.) */
function checkCarta(c: Record<string, unknown>): CartaV1 {
  const ok =
    isStr(c['nota'], 64) &&
    ID_RE.test(c['nota']) &&
    isStr(c['titulo'], 200) &&
    isStrOrNull(c['titulo_da_frente'], TITULO_DA_FRENTE_MAX * 2) &&
    isStrOrNull(c['subtitulo'], SUBTITULO_MAX * 2) &&
    (c['imagem'] === null || (isStr(c['imagem'], 2_000) && /^(https:\/\/|murall:\/\/imagem\/)/.test(c['imagem']))) &&
    isStr(c['nota_titulo'], 200) &&
    isStr(c['verso'], 20_000) &&
    isStrOrNull(c['grupo'], 32) &&
    // vazia: a carta está guardada fora dos baralhos (a anotação mudou de grupo)
    idList(c['baralhos'], BARALHOS_POR_CARTA) &&
    (c['no_mural'] === null || typeof c['no_mural'] === 'boolean') &&
    typeof c['fica_no_mural'] === 'boolean' &&
    (NIVEIS as readonly unknown[]).includes(c['nivel']) &&
    (ESTADOS_DA_CARTA as readonly unknown[]).includes(c['estado']) &&
    (c['volta_em'] === null || isIso(c['volta_em'])) &&
    isCount(c['vistas']) &&
    isCount(c['acertos']) &&
    isCount(c['erros']) &&
    isStr(c['ultimas'], ULTIMAS_MAX) &&
    /^[01]*$/.test(c['ultimas'] as string) &&
    isIso(c['entrou_em']) &&
    isIso(c['versao']);
  if (!ok) throw bad(`A carta "${String(c['nota']).slice(0, 64)}" não tem a forma da v1.`);
  const v = c as unknown as CartaV1;
  return {
    nota: v.nota,
    titulo: v.titulo,
    titulo_da_frente: v.titulo_da_frente,
    subtitulo: v.subtitulo,
    imagem: v.imagem,
    nota_titulo: v.nota_titulo,
    verso: v.verso,
    grupo: v.grupo,
    baralhos: v.baralhos,
    no_mural: v.no_mural,
    fica_no_mural: v.fica_no_mural,
    nivel: v.nivel,
    estado: v.estado,
    volta_em: v.volta_em,
    vistas: v.vistas,
    acertos: v.acertos,
    erros: v.erros,
    ultimas: v.ultimas,
    entrou_em: v.entrou_em,
    versao: v.versao,
  };
}

function checkBaralho(b: Record<string, unknown>): BaralhoV1 {
  const nivel = b['por_nivel'] as Record<string, unknown> | null;
  const filas = checkFilas(b['filas']);
  const ok =
    isStr(b['id'], 64) &&
    ID_RE.test(b['id']) &&
    isStr(b['nome'], NOME_DO_BARALHO_MAX * 2) &&
    !!b['nome'].trim() &&
    // o grupo das anotações do baralho (o site de antes dos grupos não manda: vale null)
    (b['grupo'] === undefined || isStrOrNull(b['grupo'], 32)) &&
    isColor(b['cor']) &&
    (b['icone'] === null || (typeof b['icone'] === 'string' && ICONE_RE.test(b['icone']))) &&
    Number.isInteger(b['novas_por_dia']) &&
    (b['novas_por_dia'] as number) >= 0 &&
    (b['novas_por_dia'] as number) <= NOVAS_POR_DIA_MAX &&
    typeof b['no_mural'] === 'boolean' &&
    (ESTILOS as readonly unknown[]).includes(b['estilo']) &&
    isCount(b['posicao']) &&
    isCount(b['cartas']) &&
    !!nivel &&
    typeof nivel === 'object' &&
    NIVEIS.every((n) => isCount(nivel[n])) &&
    !!filas &&
    isIso(b['versao']);
  if (!ok) throw bad(`O baralho "${String(b['id']).slice(0, 64)}" não tem a forma da v1.`);
  const v = b as unknown as BaralhoV1;
  return {
    id: v.id,
    nome: v.nome,
    grupo: v.grupo ?? null,
    cor: v.cor,
    icone: v.icone,
    novas_por_dia: v.novas_por_dia,
    no_mural: v.no_mural,
    estilo: v.estilo,
    posicao: v.posicao,
    cartas: v.cartas,
    por_nivel: { desconhecida: v.por_nivel.desconhecida, nova: v.por_nivel.nova, aprendendo: v.por_nivel.aprendendo, dominada: v.por_nivel.dominada },
    filas: filas!,
    versao: v.versao,
  };
}

function checkContextoEstudos(c: Record<string, unknown>): ContextoEstudosV1 {
  const cfg = c['config'] as Record<string, unknown> | null;
  const filas = checkFilas(c['filas']);
  const ok =
    !!cfg &&
    typeof cfg === 'object' &&
    typeof cfg['retencao'] === 'number' &&
    cfg['retencao'] >= 0.5 &&
    cfg['retencao'] <= 1 &&
    isCount(cfg['revisoes_por_dia']) &&
    (cfg['ordem_das_novas'] === 'entrada' || cfg['ordem_das_novas'] === 'sorteio') &&
    isCount(c['cartas']) &&
    !!filas;
  if (!ok) throw bad('O contexto dos Estudos não tem a forma da v1.');
  return {
    config: { retencao: cfg!['retencao'] as number, revisoes_por_dia: cfg!['revisoes_por_dia'] as number, ordem_das_novas: cfg!['ordem_das_novas'] as 'entrada' | 'sorteio' },
    cartas: c['cartas'] as number,
    filas: filas!,
  };
}

/**
 * Lê um envio ao espelho: `{rev, fuso?, poe: [{tipo, id, hash, dados}], tira: [{tipo, id}]}`, com no
 * máximo `ESPELHO_POR_ENVIO` itens ao todo, só dos tipos das áreas pedidas.
 */
export function readMirrorBody(body: Record<string, unknown>, areas: readonly string[]) {
  const rev = body['rev'];
  if (!Number.isSafeInteger(rev) || (rev as number) < 1) throw bad('Faltou a rev do mural que o espelho reflete.');
  const allowed = new Set(areas.flatMap((a) => TYPES_OF[a] ?? []));
  const put = Array.isArray(body['poe']) ? (body['poe'] as unknown[]) : [];
  const drop = Array.isArray(body['tira']) ? (body['tira'] as unknown[]) : [];
  if (put.length + drop.length > ESPELHO_POR_ENVIO) throw bad(`No máximo ${ESPELHO_POR_ENVIO} itens por envio.`);
  const typeOk = (t: unknown): t is TipoDoEspelho => typeof t === 'string' && allowed.has(t as TipoDoEspelho);
  const rows: MirrorRow[] = put.map((raw) => {
    const item = raw as Record<string, unknown>;
    if (!item || typeof item !== 'object' || !typeOk(item['tipo']) || !isStr(item['id'], 64) || !ITEM_ID_RE.test(item['id'])) {
      throw bad('Um item do espelho não serve (o tipo, o id).');
    }
    if (typeof item['hash'] !== 'string' || !HASH_RE.test(item['hash'])) throw bad('Um item do espelho veio sem a impressão.');
    const dados = item['dados'] as Record<string, unknown>;
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw bad('Um item do espelho veio sem os dados.');
    if (item['tipo'] === 'nota') {
      const n = checkNota(dados);
      if (n.id !== item['id']) throw bad('O id da nota não bate com o do item.');
      return {
        tipo: 'nota',
        id: n.id,
        versao: n.versao,
        hash: item['hash'],
        grupo: n.grupo ? dobra(n.grupo) : null,
        data: n.data,
        busca: dobra(`${n.titulo}\n${n.texto}`),
        dados: JSON.stringify(n),
      };
    }
    if (item['tipo'] === 'lancamento') {
      const l = checkLancamento(dados);
      if (l.id !== item['id']) throw bad('O id do lançamento não bate com o do item.');
      return { tipo: 'lancamento', id: l.id, versao: l.versao, hash: item['hash'], grupo: null, data: l.dia, busca: dobra(l.titulo), dados: JSON.stringify(l) };
    }
    if (item['tipo'] === 'visao') {
      const v = checkVisao(dados, item['id']);
      return { tipo: 'visao', id: item['id'], versao: null, hash: item['hash'], grupo: null, data: v.mes, busca: null, dados: JSON.stringify(v) };
    }
    if (item['tipo'] === 'quadro') {
      const q = checkQuadro(dados, item['id']);
      // o grupo sem acento, como o das notas: o limite de grupos da chave vale igual para o quadro
      return { tipo: 'quadro', id: q.id, versao: q.versao, hash: item['hash'], grupo: dobra(q.grupo), data: null, busca: dobra(q.grupo), dados: JSON.stringify(q) };
    }
    if (item['tipo'] === 'lembrete') {
      const l = checkLembrete(dados);
      if (l.id !== item['id']) throw bad('O id do lembrete não bate com o do item.');
      return { tipo: 'lembrete', id: l.id, versao: l.versao, hash: item['hash'], grupo: null, data: l.dia, busca: dobra(l.titulo), dados: JSON.stringify(l) };
    }
    if (item['tipo'] === 'agenda') {
      const a = checkAgenda(dados, item['id']);
      return { tipo: 'agenda', id: item['id'], versao: null, hash: item['hash'], grupo: null, data: a.mes, busca: null, dados: JSON.stringify(a) };
    }
    if (item['tipo'] === 'desejo' || item['tipo'] === 'pra-depois') {
      const d = checkItem(dados, item['tipo'] === 'desejo');
      if (d.id !== item['id']) throw bad('O id do item não bate com o do envio.');
      // o grupo é o mural (filtra a lista); a data, o dia em que entrou
      return { tipo: item['tipo'], id: d.id, versao: d.versao, hash: item['hash'], grupo: d.mural, data: d.criado_em.slice(0, 10), busca: dobra(`${d.nome}\n${d.por ?? ''}`), dados: JSON.stringify(d) };
    }
    if (item['tipo'] === 'ficha') {
      const f = checkFicha(dados);
      if (f.id !== item['id']) throw bad('O id da ficha não bate com o do item.');
      return {
        tipo: 'ficha',
        id: f.id,
        versao: f.versao,
        hash: item['hash'],
        grupo: f.mural,
        data: f.concluida_em,
        busca: dobra(`${f.nome}\n${f.por ?? ''}\n${f.artista ?? ''}\n${f.texto}`),
        dados: JSON.stringify(f),
      };
    }
    if (item['tipo'] === 'carta') {
      const k = checkCarta(dados);
      if (k.nota !== item['id']) throw bad('O id da carta não bate com o do item.');
      // o grupo da anotação (o limite de grupos da chave vale para as cartas); a data, o dia em que volta
      return {
        tipo: 'carta',
        id: k.nota,
        versao: k.versao,
        hash: item['hash'],
        grupo: k.grupo ? dobra(k.grupo) : null,
        data: k.volta_em ? k.volta_em.slice(0, 10) : null,
        busca: dobra(`${k.titulo}\n${k.subtitulo ?? ''}\n${k.nota_titulo}\n${k.verso}`),
        dados: JSON.stringify(k),
      };
    }
    if (item['tipo'] === 'baralho') {
      const b = checkBaralho(dados);
      if (b.id !== item['id']) throw bad('O id do baralho não bate com o do item.');
      // o grupo sem acento, como o das cartas: a chave limitada a grupos só vê os baralhos dos dela
      return { tipo: 'baralho', id: b.id, versao: b.versao, hash: item['hash'], grupo: b.grupo ? dobra(b.grupo) : null, data: null, busca: dobra(b.nome), dados: JSON.stringify(b) };
    }
    if (item['tipo'] === 'contexto-estudos') {
      if (item['id'] !== CONTEXTO_ESTUDOS) throw bad('O contexto dos Estudos tem o id "estudos".');
      return { tipo: 'contexto-estudos', id: CONTEXTO_ESTUDOS, versao: null, hash: item['hash'], grupo: null, data: null, busca: null, dados: JSON.stringify(checkContextoEstudos(dados)) };
    }
    if (item['tipo'] === 'contexto-fichas') {
      if (item['id'] !== CONTEXTO_FICHAS) throw bad('O contexto das fichas tem o id "fichas".');
      return { tipo: 'contexto-fichas', id: CONTEXTO_FICHAS, versao: null, hash: item['hash'], grupo: null, data: null, busca: null, dados: JSON.stringify(checkContextoFichas(dados)) };
    }
    if (item['tipo'] === 'contexto-gastos') {
      if (item['id'] !== CONTEXTO_GASTOS) throw bad('O contexto dos Gastos tem o id "gastos".');
      return { tipo: 'contexto-gastos', id: CONTEXTO_GASTOS, versao: null, hash: item['hash'], grupo: null, data: null, busca: null, dados: JSON.stringify(checkContextoGastos(dados)) };
    }
    if (item['id'] !== CONTEXTO_NOTAS) throw bad('O contexto das Anotações tem o id "notas".');
    return { tipo: 'contexto', id: CONTEXTO_NOTAS, versao: null, hash: item['hash'], grupo: null, data: null, busca: null, dados: JSON.stringify(checkContexto(dados)) };
  });
  const gone = drop.map((raw) => {
    const item = raw as Record<string, unknown>;
    if (!item || !typeOk(item['tipo']) || typeof item['id'] !== 'string' || !ITEM_ID_RE.test(item['id'])) throw bad('Um item a tirar do espelho não serve.');
    return { tipo: item['tipo'], id: item['id'] };
  });
  const fuso = typeof body['fuso'] === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(body['fuso']) && body['fuso'].length <= 40 ? body['fuso'] : null;
  return { rev: rev as number, fuso, rows, gone };
}

/** "Hoje" no fuso da conta (`AAAA-MM-DD`); sem fuso, o de Brasília. */
export function todayIn(fuso: string | null, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: fuso ?? 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}
