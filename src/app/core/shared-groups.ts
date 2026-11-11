import { normalizeCode } from './cloud-murals';
import { labelKey } from './text';
import { MemberRole, SharedMember, SharedPerson, SharedRole, isMemberRole, parsePerson } from './shared-notes';

/**
 * Os grupos compartilhados (PLANO-COMPARTILHAR.md, api/src/routes/groups.ts): um grupo das anotações
 * dividido com outras pessoas. Tudo puro, sem Angular; o serviço que guarda e sincroniza é
 * `SharedGroupsStore` (core/shared-groups-store.ts).
 *
 * O grupo tem um id (`g` e um sorteio) e um documento: o nome que o dono deu, o desenho e a cor. As
 * anotações dele são anotações compartilhadas (core/shared-store.ts) com o `grupo`: no mural de cada um, o
 * grupo delas é o grupo compartilhado, com o nome que o dono deu (`groupNames`), e não o que cada um
 * escolheria. Os papéis são os da anotação (Leitor, Editor, Gestor; o dono é o dono).
 */

/** O documento do grupo como a nuvem guarda (o que este site não conhece fica, para um site mais novo). */
export interface GroupDoc {
  nome: string;
  aparencia?: { icone?: string; cor?: string };
  [extra: string]: unknown;
}

export interface SharedGroup {
  id: string;
  dono: SharedPerson;
  papel: SharedRole;
  rev: number;
  versao: number;
  dados: GroupDoc;
  publico: boolean;
  /** Quantas anotações o grupo tem na nuvem. */
  notas: number;
  membros: SharedMember[];
  atualizadoEm: string;
}

const ID_RE = /^g[A-Za-z0-9_-]{8,40}$/;
export const isGroupId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

/** Um id novo de grupo (como os da nuvem: `g` e 21 letras). */
export function newGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return 'g' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 21);
}

const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
const ROLES: readonly SharedRole[] = ['dono', 'gestor', 'editor', 'leitor'];

/** O documento conferido (o nome é obrigatório; o resto fica como veio). */
export function parseGroupDoc(raw: unknown): GroupDoc | null {
  const d = raw as Record<string, unknown> | null;
  const nome = typeof d?.['nome'] === 'string' ? d['nome'].trim().slice(0, 40) : '';
  if (!d || !nome) return null;
  const a = d['aparencia'] as Record<string, unknown> | undefined;
  const aparencia =
    a && typeof a === 'object'
      ? { ...(typeof a['icone'] === 'string' ? { icone: a['icone'] } : {}), ...(typeof a['cor'] === 'string' ? { cor: a['cor'] } : {}) }
      : undefined;
  return { ...d, nome, ...(aparencia ? { aparencia } : {}) } as GroupDoc;
}

/** Um grupo como a nuvem manda, conferido; null se não tem a forma certa. */
export function parseGroup(raw: unknown): SharedGroup | null {
  const g = raw as Record<string, unknown> | null;
  const id = isGroupId(g?.['id']) ? g['id'] : null;
  const dono = parsePerson(g?.['dono']);
  const papel = ROLES.find((r) => r === g?.['papel']) ?? null;
  const dados = parseGroupDoc(g?.['dados']);
  if (!g || !id || !dono || !papel || !dados || !Number.isSafeInteger(g['rev']) || !Number.isSafeInteger(g['versao'])) return null;
  const membros: SharedMember[] = [];
  const seen = new Set<string>([dono.codigo]);
  for (const item of Array.isArray(g?.['membros']) ? g['membros'].slice(0, 60) : []) {
    const p = parsePerson(item);
    const role = (item as Record<string, unknown> | null)?.['papel'];
    if (!p || !isMemberRole(role) || seen.has(p.codigo)) continue;
    seen.add(p.codigo);
    membros.push({ ...p, papel: role, desde: iso((item as Record<string, unknown>)['desde']) ?? '' });
  }
  return {
    id,
    dono,
    papel,
    rev: g['rev'] as number,
    versao: g['versao'] as number,
    dados,
    publico: g['publico'] === true,
    notas: Number.isSafeInteger(g['notas']) ? (g['notas'] as number) : 0,
    membros,
    atualizadoEm: iso(g['atualizadoEm']) ?? '',
  };
}

/** O primeiro nome, para dizer de quem é o grupo de mesmo nome que um seu ("Trabalho · Ana"). */
const firstName = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/**
 * O nome de cada grupo compartilhado no mural de quem está aqui (PLANO-COMPARTILHAR.md, D8): o que o dono
 * deu; quando já há um grupo seu (ou outro compartilhado) com esse nome, o de outra pessoa ganha o nome
 * dela ("Trabalho · Ana"), e, se ainda assim repetir, o código.
 *
 * `own`: os nomes dos grupos que são só seus (os das anotações que não são de grupo compartilhado).
 */
export function groupNames(groups: readonly SharedGroup[], own: Iterable<string>): Map<string, string> {
  const taken = new Set([...own].map(labelKey));
  const out = new Map<string, string>();
  // os seus primeiro: o nome de um grupo seu que você compartilhou é ele mesmo
  const sorted = [...groups].sort((a, b) => Number(b.papel === 'dono') - Number(a.papel === 'dono') || a.id.localeCompare(b.id));
  for (const g of sorted) {
    let name = g.dados.nome;
    if (g.papel !== 'dono' && taken.has(labelKey(name))) name = `${g.dados.nome} · ${firstName(g.dono.nome)}`;
    if (taken.has(labelKey(name)) && g.papel !== 'dono') name = `${g.dados.nome} · ${normalizeCode(g.dono.codigo) ?? g.dono.codigo}`;
    taken.add(labelKey(name));
    out.set(g.id, name.slice(0, 60));
  }
  return out;
}

/** As pessoas do grupo com o papel, para a peça Quem vê (o dono não entra). */
export function groupMembers(g: SharedGroup): { codigo: string; nome: string; papel: MemberRole }[] {
  return g.membros.map((m) => ({ codigo: m.codigo, nome: m.nome, papel: m.papel }));
}
