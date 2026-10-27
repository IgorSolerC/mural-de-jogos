import {
  APROVACAO_PADRAO,
  ESCOPO_BASICO,
  NOME_DA_CHAVE_MAX,
  VALIDADES,
  type Aprovacao,
  ehAprovacao,
  ehEscopo,
  escoposEmOrdem,
  limparGrupos,
  textoLimpo,
} from '../../../contrato/api-v1/escopos';
import { montarSegredo, segredoConfere } from '../../../contrato/api-v1/segredo';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { plainCode } from './agenda';
import { base64url } from './bytes';
import { DAY_MS, write } from './quota';
import { hashToken } from './session';

/**
 * As chaves de API (PLANO-API.md, seção 5): uma linha em `api_chaves` por chave, com o hash do segredo,
 * as permissões, os grupos, a aprovação e a validade. O segredo só existe na resposta de criar.
 */

/** Uma hora: o "usada em" não é regravado antes disso (cada gravação conta na cota do dia). */
const USED_EVERY_MS = 60 * 60 * 1000;
/** Quantas chaves uma conta cria em 24 horas (apagar não devolve a vaga). */
export const MAX_KEYS_PER_DAY = 20;
export const KEY_ID_RE = /^ch_[A-Za-z0-9_-]{16}$/;

export type KeyOrigin = 'manual' | 'oauth' | 'cli';

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  origin: KeyOrigin;
  scopes: string[];
  /** Os grupos das Anotações que ela alcança; null = todos. */
  groups: string[] | null;
  approval: Aprovacao;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface KeyRow {
  id: string;
  usuario_id: string;
  nome: string;
  origem: string;
  escopos: string;
  grupos: string | null;
  aprovacao: string;
  criada_em: string;
  expira_em: string;
  usada_em: string | null;
}

export const KEY_COLUMNS = 'id, usuario_id, nome, origem, escopos, grupos, aprovacao, criada_em, expira_em, usada_em';

function parseList(text: string | null): string[] | null {
  if (text === null) return null;
  try {
    const list: unknown = JSON.parse(text);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

export function keyOf(row: KeyRow): ApiKey {
  return {
    id: row.id,
    userId: row.usuario_id,
    name: row.nome,
    origin: row.origem === 'oauth' || row.origem === 'cli' ? row.origem : 'manual',
    // um escopo que deixou de existir só some (nunca vira outro)
    scopes: escoposEmOrdem(parseList(row.escopos) ?? []),
    groups: parseList(row.grupos),
    approval: ehAprovacao(row.aprovacao) ? row.aprovacao : APROVACAO_PADRAO,
    createdAt: row.criada_em,
    expiresAt: row.expira_em,
    usedAt: row.usada_em,
  };
}

/**
 * O domínio de um conector (OAuth), para a lista de Acessos: o do documento do cliente (CIMD) ou o do
 * primeiro endereço de volta registrado.
 */
export function connectorDomain(clientId: string, retornos: string | null): string {
  const first = (() => {
    try {
      const list: unknown = JSON.parse(retornos ?? '[]');
      return Array.isArray(list) && typeof list[0] === 'string' ? list[0] : '';
    } catch {
      return '';
    }
  })();
  for (const url of [clientId, first]) {
    try {
      if (/^https?:\/\//.test(url)) return new URL(url).host;
    } catch {
      // segue para o próximo
    }
  }
  return '';
}

/** A chave como o site e a própria chave veem (nunca o hash). `conector`: o domínio, numa chave de OAuth. */
export function keyOut(key: ApiKey, connector?: { dominio: string } | null) {
  return {
    ...(key.origin === 'oauth' ? { conector: connector ?? null } : {}),
    id: key.id,
    nome: key.name,
    origem: key.origin,
    escopos: key.scopes,
    grupos: key.groups,
    aprovacao: key.approval,
    criadaEm: key.createdAt,
    expiraEm: key.expiresAt,
    usadaEm: key.usedAt,
  };
}

export function newKeyId(): string {
  return `ch_${base64url(crypto.getRandomValues(new Uint8Array(12)))}`;
}

export function newSecret(): string {
  return montarSegredo(base64url(crypto.getRandomValues(new Uint8Array(32))));
}

/** O que a pessoa escolhe ao criar ou mudar uma chave, já conferido. */
export interface KeyInput {
  name?: string;
  scopes?: string[];
  groups?: string[] | null;
  approval?: Aprovacao;
  days?: number;
}

const invalid = (message: string) => new HttpError(400, 'chave-invalida', message);

/**
 * Confere o corpo de criar (`creating`: nome, escopos e validade obrigatórios) ou de mudar (só o que
 * veio). Recusa em vez de consertar: um escopo que não existe é erro de quem chamou.
 */
export function readKeyInput(body: Record<string, unknown>, creating: boolean): KeyInput {
  const out: KeyInput = {};
  if (creating || body['nome'] !== undefined) {
    const name = textoLimpo(body['nome'], NOME_DA_CHAVE_MAX);
    if (!name) throw invalid(`Dê um nome à chave, de 1 a ${NOME_DA_CHAVE_MAX} letras.`);
    out.name = name;
  }
  if (creating || body['escopos'] !== undefined) {
    const raw = body['escopos'];
    if (!Array.isArray(raw) || raw.length > 64) throw invalid('Marque pelo menos uma permissão.');
    const wrong = raw.find((s) => s !== ESCOPO_BASICO && !ehEscopo(s));
    if (wrong !== undefined) throw invalid(`A permissão "${String(wrong).slice(0, 40)}" não existe.`);
    const scopes = escoposEmOrdem(raw as string[]);
    if (!scopes.length) throw invalid('Marque pelo menos uma permissão.');
    out.scopes = scopes;
  }
  if (body['grupos'] !== undefined) {
    const groups = limparGrupos(body['grupos']);
    if (groups === undefined) throw invalid('A lista de grupos não serve: até 20 nomes, de 1 a 32 letras cada.');
    out.groups = groups;
  }
  if (creating || body['aprovacao'] !== undefined) {
    const approval = body['aprovacao'] ?? APROVACAO_PADRAO;
    if (!ehAprovacao(approval)) throw invalid('Escolha quando a chave espera a sua aprovação: nunca, mudancas ou tudo.');
    out.approval = approval;
  }
  if (creating) {
    const days = body['validade'];
    if (!VALIDADES.includes(days as (typeof VALIDADES)[number])) throw invalid(`A validade é de ${VALIDADES.join(', ')} dias.`);
    out.days = days as number;
  }
  return out;
}

export function expiresIn(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/** A conta pode usar a API (o código está em API_CODIGOS)? */
export function apiAllowed(deps: Deps, code: string): boolean {
  const codes = deps.config.apiCodes;
  return codes.includes('*') || codes.includes(plainCode(code));
}

export const apiUnavailable = () => new HttpError(403, 'api-indisponivel', 'A API do Murall ainda não está aberta para esta conta.');

export interface KeyCaller {
  key: ApiKey;
  code: string;
  name: string;
}

const badKey = (message = 'Essa chave de API não vale (apagada, vencida ou copiada errada). Crie outra em Ajustes › Acessos.') =>
  new HttpError(401, 'chave-invalida', message);

/**
 * Quem está chamando a API das AIs, pelo `Authorization: Bearer murall_…`. A sessão do site não vale
 * aqui (nem a chave lá: o `authenticate` das sessões só aceita o token de 43 letras).
 */
export async function authenticateKey(deps: Deps, header: string | undefined): Promise<KeyCaller> {
  const match = /^Bearer (\S+)$/.exec(header ?? '');
  if (!match) throw badKey('Faltou a chave de API no cabeçalho Authorization: Bearer murall_…');
  const secret = match[1]!;
  if (!segredoConfere(secret)) {
    throw badKey(
      /^[A-Za-z0-9_-]{43}$/.test(secret)
        ? 'Isso é a sessão do site, não uma chave de API. Crie uma chave em Ajustes › Acessos.'
        : 'Essa chave de API não vale: confira se ela foi copiada inteira (começa com murall_).',
    );
  }
  const row = await deps.db.first<KeyRow & { hash_expira_em: string | null; codigo: string; nome_conta: string; apagar_em: string | null }>(
    `SELECT k.${KEY_COLUMNS.split(', ').join(', k.')}, k.hash_expira_em, u.codigo, u.nome AS nome_conta, u.apagar_em ` +
      'FROM api_chaves k JOIN usuarios u ON u.id = k.usuario_id WHERE k.hash = ?',
    [await hashToken(secret)],
  );
  const now = deps.now();
  if (!row || Date.parse(row.expira_em) <= now.getTime()) throw badKey();
  // o token de acesso de um conector (OAuth) vale 1 hora; o cliente renova sozinho
  if (row.hash_expira_em && Date.parse(row.hash_expira_em) <= now.getTime()) throw badKey('O token do conector venceu; o aplicativo renova sozinho.');
  // a conta marcada para sair para de responder às chaves já (ameaça A5 do plano)
  if (row.apagar_em) throw badKey('Esta conta está marcada para sair; as chaves dela pararam.');
  if (!apiAllowed(deps, row.codigo)) throw apiUnavailable();
  const key = keyOf(row);
  if ((!row.usada_em || now.getTime() - Date.parse(row.usada_em) > USED_EVERY_MS) && deps.config.mode === 'ligado') {
    try {
      await write(deps, [{ sql: 'UPDATE api_chaves SET usada_em = ? WHERE id = ?', params: [now.toISOString(), row.id] }], 2);
      key.usedAt = now.toISOString();
    } catch (error) {
      // sem cota hoje: a chave continua valendo, só o "usada em" fica para depois
      if (!(error instanceof HttpError)) console.error('anotar o uso da chave falhou', error);
    }
  }
  return { key, code: row.codigo, name: row.nome_conta };
}

/** Pede um escopo (o básico, toda chave tem). */
export function requireScope(caller: KeyCaller, scope: string): void {
  if (scope === ESCOPO_BASICO || caller.key.scopes.includes(scope)) return;
  throw new HttpError(403, 'sem-permissao', `Esta chave não tem a permissão "${scope}". Mude a chave em Ajustes › Acessos.`);
}

/**
 * O aviso no Correio de que um acesso nasceu (decisão D11 do PLANO-API.md): uma chave criada no site
 * ou um conector autorizado. Vai no mesmo lote da gravação da chave; a conta é autora e alvo. Se não
 * foi a pessoa, ela vê no quadro de avisos e apaga em Acessos.
 */
export function accessNotice(
  userId: string,
  keyId: string,
  name: string,
  connector: string | null,
  at: string,
  /** Só grava se isto valer (um `EXISTS (…)`: o pedido do OAuth ainda aberto). */
  onlyIf?: { sql: string; params: string[] },
): Statement {
  return {
    sql: `INSERT INTO atividades (tipo, autor_id, alvo_id, ref, resumo, criado_em) SELECT 'acesso', ?, ?, ?, ?, ?${onlyIf ? ` WHERE ${onlyIf.sql}` : ''}`,
    params: [userId, userId, keyId, JSON.stringify({ nome: name, conector: connector }), at, ...(onlyIf?.params ?? [])],
  };
}

