import { dobra } from '../../../contrato/api-v1/escopos';
import {
  CONTEXTO_GASTOS,
  DIA_RE,
  MES_RE,
  visaoDoMes,
  type ContextoGastosV1,
  type LancamentoV1,
  type MesV1,
} from '../../../contrato/api-v1/gastos';
import { CARTOES_MAX, COLUNAS_MAX, DEPENDENCIAS_MAX, IMPORTANCIAS, NOME_DA_COLUNA_MAX, STATUS_MAX, type QuadroV1 } from '../../../contrato/api-v1/kanban';
import { CONTEXTO_NOTAS, ESPELHO_POR_ENVIO, type ContextoNotasV1, type NotaV1, type TipoDoEspelho } from '../../../contrato/api-v1/notas';
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
 * Gastos, e qualquer uma do Kanban (quem só move cartões também precisa das colunas, para a API
 * conferir o pedido).
 */
export const SCOPES_OF_AREA: Record<string, readonly string[]> = {
  notas: ['notas:ler'],
  gastos: ['gastos:ler'],
  kanban: ['kanban:ler', 'kanban:mover', 'kanban:colunas'],
};

/** Os tipos de linha de cada área. */
export const TYPES_OF: Record<string, readonly TipoDoEspelho[]> = {
  notas: ['nota', 'contexto'],
  gastos: ['lancamento', 'visao', 'contexto-gastos'],
  kanban: ['quadro'],
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

/** A nota v1 tem a forma certa? (O conteúdo é da própria pessoa: confere só a forma e os tamanhos.) */
function checkNota(n: Record<string, unknown>): NotaV1 {
  const k = n['kanban'] as Record<string, unknown> | null;
  const t = n['tarefas'] as Record<string, unknown> | null;
  const ok =
    isStr(n['id'], 64) &&
    isStr(n['titulo'], 200) &&
    isStr(n['texto'], 20_000) &&
    isStrOrNull(n['grupo'], 32) &&
    isStrOrNull(n['assunto'], 32) &&
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
  const v = n as unknown as NotaV1;
  return {
    id: v.id,
    titulo: v.titulo,
    texto: v.texto,
    grupo: v.grupo,
    assunto: v.assunto,
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
  };
}

function checkContexto(c: Record<string, unknown>): ContextoNotasV1 {
  const tagList = (v: unknown) => Array.isArray(v) && v.length <= 2_000 && v.every((t) => t && typeof t === 'object' && isStr((t as { nome: unknown }).nome, 32));
  const grupos = c['grupos'];
  const semGrupo = c['sem_grupo'] as Record<string, unknown> | null;
  const ok =
    Array.isArray(grupos) &&
    grupos.length <= 500 &&
    grupos.every((g: Record<string, unknown>) => g && isStr(g['nome'], 32) && strList(g['assuntos'], 500, 32) && tagList(g['tags'])) &&
    !!semGrupo &&
    tagList(semGrupo['tags']) &&
    strList(c['tags_fixas'], 40, 32);
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
