import { dobra } from '../../../contrato/api-v1/escopos';
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

/** As áreas que alguma chave viva da conta lê (por ora, só as Anotações). */
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
  return scopes.has('notas:ler') ? ['notas'] : [];
}

/** Os tipos de linha de cada área. */
export const TYPES_OF: Record<string, readonly TipoDoEspelho[]> = { notas: ['nota', 'contexto'] };

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
    (k === null || (!!k && isStr(k['coluna'], 40) && isStrOrNull(k['importancia'], 16) && isStrOrNull(k['status'], 28) && typeof k['no_mural'] === 'boolean')) &&
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
