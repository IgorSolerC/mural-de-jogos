import { canonicalJson } from './canonical-json';
import { normalizeCode } from './cloud-murals';
import { isEmoji } from './emoji';
import { mergeText } from './merge3';
import { labelKey } from './text';
import { cleanCategory, cleanSubject, sanitizeTags } from './note-labels';
import { NOTE_RANKS, NoteRank, Review, STOCKS, Stock, isNote, sanitizeReview, storedNote } from './review';

/**
 * As anotações compartilhadas: uma anotação que o dono divide com outras pessoas (ver
 * `api/src/routes/notes.ts`). O dono é sempre o dono; cada pessoa a mais tem um papel:
 *
 * - **gestor:** faz tudo (o texto, quem vê, quem mais entra), menos mexer no dono ou apagar a anotação
 *   para todos;
 * - **editor:** escreve como se a anotação fosse dele, sem mudar a estrutura (as pessoas e quem vê);
 * - **leitor:** só lê, no próprio mural.
 *
 * O grupo, o assunto e as tags não são da anotação, são de cada um (como fixar no topo): cada pessoa
 * organiza o próprio mural do seu jeito, e mudar aqui não muda para os outros (ver `Personal`). Quem
 * recebe uma anotação a encontra no grupo Compartilhadas (`SHARED_GROUP`).
 *
 * Na nuvem a anotação mora à parte do mural de cada um, numa cópia só que todos editam. Aqui ela fica na
 * mesma lista das outras fichas (o mural, os links, a busca e a leitura nem percebem), mas é gravada à
 * parte (ver core/shared-store.ts) e nunca vai no mural privado da nuvem.
 *
 * Duas pessoas editando ao mesmo tempo se juntam como no git (`mergeNote`): o que só uma mexeu entra, o
 * que as duas acrescentaram fica, e o que as duas mudaram de jeitos diferentes vira um conflito, que
 * quem escreve resolve escolhendo uma das versões.
 */

export type SharedRole = 'dono' | 'gestor' | 'editor' | 'leitor';
export type MemberRole = Exclude<SharedRole, 'dono'>;
export const MEMBER_ROLES: readonly MemberRole[] = ['gestor', 'editor', 'leitor'];

export const ROLE_LABEL: Record<SharedRole, string> = { dono: 'Dono', gestor: 'Gestor', editor: 'Editor', leitor: 'Leitor' };
/** O que cada papel pode, numa frase (no menu de papéis). */
export const ROLE_HINT: Record<MemberRole, string> = {
  gestor: 'Edita tudo e chama mais gente',
  editor: 'Escreve, sem mudar quem vê',
  leitor: 'Só lê',
};

/** Escreve no texto (e escolhe num conflito): o dono, os gestores e os editores. */
export const canWrite = (r: SharedRole | null | undefined): boolean => r === 'dono' || r === 'gestor' || r === 'editor';
/** Mexe na estrutura (as pessoas e quem vê): o dono e os gestores. */
export const canManage = (r: SharedRole | null | undefined): boolean => r === 'dono' || r === 'gestor';
export const isMemberRole = (v: unknown): v is MemberRole => typeof v === 'string' && (MEMBER_ROLES as readonly string[]).includes(v);

export interface SharedPerson {
  /** `K7QF-M2XA`. */
  codigo: string;
  nome: string;
  foto: { emoji: string; cor: Stock } | null;
}

export interface SharedMember extends SharedPerson {
  papel: MemberRole;
  desde: string;
}

/** As duas versões que brigaram: `a` é a que já estava na nuvem, `b` a que chegou depois. */
export interface SharedConflict {
  a: Review;
  b: Review;
  autorA: SharedPerson | null;
  autorB: SharedPerson | null;
  em: string;
}

/** A anotação compartilhada como a nuvem manda. */
export interface SharedDetail {
  id: string;
  dono: SharedPerson;
  papel: SharedRole;
  rev: number;
  versao: number;
  /** O conteúdo na nuvem (sem o que é de cada um: fixada, o grupo, o assunto e as tags). */
  dados: Review;
  /**
   * O grupo, o assunto e as tags que vieram dentro do conteúdo: só numa anotação gravada antes de eles
   * serem de cada um (build 463). Servem de partida para quem já estava nela (ver `legacyOrg`).
   */
  orgDados: Personal;
  membros: SharedMember[];
  atualizadoEm: string;
  atualizadoPor: SharedPerson | null;
  conflito: SharedConflict | null;
}

/**
 * O grupo em que a anotação compartilhada chegava para quem a recebe (com o desenho de duas pessoas).
 * Desde a build 677 ela chega sem grupo e aparece na aba Compartilhadas do mural (ver
 * `WallState.specialTabs`); as que estavam nele saem dele (ver `outOfSharedGroup`).
 */
export const SHARED_GROUP = 'Compartilhadas';

/**
 * O que é de cada um, não da anotação: o lugar dela no próprio mural (fixada) e onde ela mora nele (o
 * grupo, o assunto e as tags). Nada disso vai para a nuvem da anotação; vai para os outros aparelhos da
 * pessoa pelo mural privado (ver `Place` em core/shared-store.ts).
 */
export interface Personal {
  noteRank?: NoteRank;
  category?: string;
  subject?: string;
  tags?: string[];
  /**
   * O grupo, o assunto e as tags já são desta pessoa (sem eles, "Sem grupo" e nenhuma tag). Sem a marca,
   * o lugar foi guardado antes deles serem de cada um (build 463): só a fixada vale, e eles vêm da
   * anotação como ela estava (`legacyOrg`).
   */
  org?: true;
}

/** O que cada um organiza do seu jeito, e o lugar inteiro. */
const PERSONAL_KEYS = ['noteRank', 'category', 'subject', 'tags', 'org'] as const;

/** Sem o que é de cada um. */
function withoutPersonal(r: Review): Review {
  const { noteRank: _r, category: _c, subject: _s, tags: _t, ...rest } = r;
  return rest as Review;
}

/** O que da anotação vai para a nuvem: tudo, menos o que é de cada um (o lugar e o grupo, o assunto e as tags). */
export function sharedContent(r: Review): Record<string, unknown> {
  const { sharedBy: _b, ...rest } = storedNote(withoutPersonal(r));
  return rest as Record<string, unknown>;
}

/** O grupo, o assunto e as tags da anotação, como de quem está aqui. */
export function orgOf(r: Pick<Review, 'category' | 'subject' | 'tags'>): Personal {
  return {
    ...(r.category ? { category: r.category } : {}),
    ...(r.category && r.subject ? { subject: r.subject } : {}),
    ...(r.tags?.length ? { tags: [...r.tags] } : {}),
    org: true,
  };
}

export function personalOf(r: Pick<Review, 'noteRank' | 'category' | 'subject' | 'tags'>): Personal {
  return { ...(r.noteRank ? { noteRank: r.noteRank } : {}), ...orgOf(r) };
}

/** Onde a anotação chega no mural de quem a recebe: sem grupo (ela aparece na aba Compartilhadas). */
export function arrivalOrg(): Personal {
  return { org: true };
}

/**
 * Até quando um lugar no grupo Compartilhadas é o de antes da build 677 (onde a anotação chegava, ou
 * onde um site de antes a pôs): o lugar mudado depois disso foi a pessoa que escolheu, e fica.
 */
export const SHARED_GROUP_UNTIL = '2026-10-31T06:00:00.000Z';

/**
 * O lugar de uma anotação recebida que ainda está no grupo Compartilhadas onde ela chegava antes da
 * build 677 (`em`: quando o lugar mudou; a chegada é sempre o começo dos tempos): sem grupo e sem o
 * assunto dele. Null: ela não está nele, ou a pessoa a pôs nele depois (fica como está).
 */
export function outOfSharedGroup(p: Personal, em: string): Personal | null {
  if (!p.category || labelKey(p.category) !== labelKey(SHARED_GROUP) || em >= SHARED_GROUP_UNTIL) return null;
  const { category: _c, subject: _s, ...rest } = p;
  return rest;
}

/**
 * O lugar com o grupo, o assunto e as tags: o guardado antes deles serem de cada um (sem `org`) fica
 * com os de `from` (a anotação como ela estava).
 */
export function legacyOrg(p: Personal, from: Personal): Personal {
  if (p.org) return p;
  return { ...(p.noteRank ? { noteRank: p.noteRank } : {}), ...orgOf(from) };
}

/** A anotação do mural: o conteúdo compartilhado com o lugar e o grupo dela no mural de quem vê. */
export function withPersonal(content: Review, personal: Personal): Review {
  const { org: _o, ...mine } = personal;
  return { ...withoutPersonal(content), ...mine };
}

/** Os dois lugares dizem a mesma coisa? */
export function samePersonal(a: Personal, b: Personal): boolean {
  return canonicalJson(pick(a as Obj, PERSONAL_KEYS)) === canonicalJson(pick(b as Obj, PERSONAL_KEYS));
}

/**
 * O conteúdo de uma anotação que veio da nuvem (só uma anotação com o id certo serve). Sem o
 * `sharedBy`: de quem ela é quem diz é a nuvem (o dono), nunca o conteúdo, que qualquer um que escreve
 * manda; vindo nele, a anotação iria para o mural público do dono como sendo de outra pessoa.
 */
export function noteFrom(raw: unknown, id: string): Review | null {
  const r = sanitizeReview(raw);
  if (!r || r.id !== id || !isNote(r)) return null;
  const { sharedBy: _b, ...content } = r;
  return withPersonal(content as Review, {});
}

/** As duas anotações dizem a mesma coisa (sem contar quando foram mexidas nem o lugar no mural)? */
export function sameShared(a: Review, b: Review): boolean {
  const { updatedAt: _a, ...x } = sharedContent(a);
  const { updatedAt: _b, ...y } = sharedContent(b);
  return canonicalJson(x) === canonicalJson(y);
}

const isStock = (v: unknown): v is Stock => (STOCKS as readonly unknown[]).includes(v);

export function parsePerson(raw: unknown): SharedPerson | null {
  const p = raw as Record<string, unknown> | null;
  const codigo = typeof p?.['codigo'] === 'string' ? normalizeCode(p['codigo']) : null;
  const nome = typeof p?.['nome'] === 'string' ? p['nome'].trim().slice(0, 40) : '';
  if (!codigo || !nome) return null;
  const f = p?.['foto'] as Record<string, unknown> | null | undefined;
  return { codigo, nome, foto: f && isEmoji(f['emoji']) && isStock(f['cor']) ? { emoji: f['emoji'], cor: f['cor'] } : null };
}

const ROLES: readonly SharedRole[] = ['dono', 'gestor', 'editor', 'leitor'];
const iso = (v: unknown): string | null => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);

/** Uma anotação que veio da nuvem, conferida; null se não tem a forma certa. */
export function parseDetail(raw: unknown): SharedDetail | null {
  const n = raw as Record<string, unknown> | null;
  const id = typeof n?.['id'] === 'string' && /^[\w-]{4,64}$/.test(n['id']) ? n['id'] : null;
  if (!id) return null;
  const dono = parsePerson(n?.['dono']);
  const papel = ROLES.find((r) => r === n?.['papel']) ?? null;
  const rev = n?.['rev'];
  const versao = n?.['versao'];
  const dados = noteFrom(n?.['dados'], id);
  const inside = dados ? sanitizeReview(n?.['dados']) : null;
  if (!dono || !papel || !dados || !Number.isSafeInteger(rev) || !Number.isSafeInteger(versao)) return null;
  const membros: SharedMember[] = [];
  const seen = new Set<string>([dono.codigo]);
  for (const item of Array.isArray(n?.['membros']) ? n['membros'].slice(0, 60) : []) {
    const p = parsePerson(item);
    const role = (item as Record<string, unknown> | null)?.['papel'];
    if (!p || !isMemberRole(role) || seen.has(p.codigo)) continue;
    seen.add(p.codigo);
    membros.push({ ...p, papel: role, desde: iso((item as Record<string, unknown>)['desde']) ?? '' });
  }
  const c = n?.['conflito'] as Record<string, unknown> | null | undefined;
  const a = c ? noteFrom(c['a'], id) : null;
  const b = c ? noteFrom(c['b'], id) : null;
  return {
    id,
    dono,
    papel,
    rev: rev as number,
    versao: versao as number,
    dados,
    orgDados: inside ? orgOf(inside) : {},
    membros,
    atualizadoEm: iso(n?.['atualizadoEm']) ?? dados.updatedAt,
    atualizadoPor: parsePerson(n?.['atualizadoPor']),
    conflito: c && a && b ? { a, b, autorA: parsePerson(c['autorA']), autorB: parsePerson(c['autorB']), em: iso(c['em']) ?? '' } : null,
  };
}

/** O que mudou dos dois lados de jeitos diferentes, nas palavras da tela. */
export type ConflictPart = 'titulo' | 'capa' | 'texto' | 'categoria' | 'publico' | 'aparencia' | 'data' | 'outros';

export const CONFLICT_PART_LABEL: Record<ConflictPart, string> = {
  titulo: 'o título',
  capa: 'a capa',
  texto: 'o texto',
  categoria: 'o grupo e o assunto',
  publico: 'quem vê',
  aparencia: 'o papel da ficha',
  data: 'a data',
  outros: 'outros detalhes',
};

export interface NoteMerge {
  /** A junção, com os trechos em conflito do jeito de `a` (a que já estava na nuvem). */
  merged: Review;
  /** Com conflito: a mesma junção, com os trechos do jeito de `b`. Sem conflito, null. */
  other: Review | null;
  parts: ConflictPart[];
}

/** O que fica junto na aparência da ficha: mudar um pedaço do grupo é mudar o grupo. */
const LOOK_GROUPS: readonly (readonly string[])[] = [
  ['stock'],
  ['paper', 'paperSeed'],
  ['pattern', 'patternSpacing', 'patternSize', 'patternJitter', 'patternInk', 'patternSeed'],
  ['scribble', 'scribbleSeed', 'scribbleInk'],
  ['damage', 'damageSeed'],
  ['stains'],
  ['decors'],
];
const AUDIENCE = ['private', 'quiet', 'publishedAt'] as const;
/** Os campos que a junção trata um a um; o resto (um campo novo de um site mais novo) vai como um todo. */
const HANDLED = new Set<string>(['id', 'kind', 'game', 'text', 'tags', 'category', 'subject', 'doneAt', 'completedAt', 'createdAt', 'updatedAt', ...AUDIENCE, ...LOOK_GROUPS.flat()]);

type Obj = Record<string, unknown>;
const pick = (o: Obj, keys: readonly string[]): Obj => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const same = (x: unknown, y: unknown) => canonicalJson(x ?? null) === canonicalJson(y ?? null);

/**
 * Junta duas versões de uma anotação que partiram de `o` (ver o topo do arquivo). `a` é a que está na
 * nuvem, `b` a daqui: na ordem das linhas acrescentadas dos dois lados, a de `a` vem primeiro.
 */
export function mergeNote(o: Review, a: Review, b: Review): NoteMerge {
  const O = sharedContent(o);
  const A = sharedContent(a);
  const B = sharedContent(b);
  const parts = new Set<ConflictPart>();
  const left: Obj = {};
  const right: Obj = {};
  const set = (key: string, va: unknown, vb: unknown = va) => {
    if (va !== undefined) left[key] = va;
    if (vb !== undefined) right[key] = vb;
  };
  /** Um valor que não se divide: fica o que mudou; os dois mudaram diferente, conflito. */
  const atomic = (part: ConflictPart, x: unknown, y: unknown, z: unknown): [unknown, unknown] => {
    if (same(y, z) || same(z, x)) return [y, y];
    if (same(y, x)) return [z, z];
    parts.add(part);
    return [y, z];
  };
  const group = (part: ConflictPart, keys: readonly string[]) => {
    const [ga, gb] = atomic(part, pick(O, keys), pick(A, keys), pick(B, keys)) as [Obj, Obj];
    Object.assign(left, ga);
    Object.assign(right, gb);
  };

  set('id', A['id']);
  set('kind', A['kind']);
  set('createdAt', O['createdAt'] ?? A['createdAt']);

  // o item: o título e a capa, cada um por si
  const go = (O['game'] ?? {}) as Obj;
  const ga = (A['game'] ?? {}) as Obj;
  const gb = (B['game'] ?? {}) as Obj;
  const [nameA, nameB] = atomic('titulo', go['name'], ga['name'], gb['name']);
  const [coverA, coverB] = atomic('capa', go['coverUrl'] ?? null, ga['coverUrl'] ?? null, gb['coverUrl'] ?? null);
  set('game', { ...ga, name: nameA, coverUrl: coverA }, { ...ga, name: nameB, coverUrl: coverB });

  const text = mergeText(String(O['text'] ?? ''), String(A['text'] ?? ''), String(B['text'] ?? ''));
  if (!text.clean) parts.add('texto');
  set('text', text.a, text.b);

  // o grupo, o assunto e as tags são de cada um: não vêm no conteúdo (ver `sharedContent`)

  // finalizada: é sim ou não; os dois finalizaram, fica a data mais antiga (nunca briga)
  const done = (x: Obj) => typeof x['doneAt'] === 'string';
  if (done(A) && done(B)) set('doneAt', [A['doneAt'] as string, B['doneAt'] as string].sort()[0]);
  else if (done(A) !== done(B)) {
    const changed = done(A) !== done(O) ? A : B;
    if (done(changed)) set('doneAt', changed['doneAt']);
  }

  const [dateA, dateB] = atomic('data', O['completedAt'] ?? null, A['completedAt'] ?? null, B['completedAt'] ?? null);
  set('completedAt', dateA, dateB);

  group('publico', AUDIENCE);
  for (const keys of LOOK_GROUPS) group('aparencia', keys);

  // o que um site mais novo guardou e este não conhece: inteiro, campo a campo
  for (const key of new Set([...Object.keys(O), ...Object.keys(A), ...Object.keys(B)])) {
    if (HANDLED.has(key)) continue;
    const [x, y] = atomic('outros', O[key], A[key], B[key]);
    set(key, x, y);
  }

  const updatedAt = [String(A['updatedAt'] ?? ''), String(B['updatedAt'] ?? '')].sort().at(-1)!;
  set('updatedAt', updatedAt);

  const merged = noteFrom(left, a.id) ?? a;
  const other = parts.size ? (noteFrom(right, a.id) ?? b) : null;
  return { merged, other, parts: [...parts] };
}

/** O lugar no mural que veio guardado (só o que serve). */
export function sanitizePersonal(raw: unknown): Personal {
  const p = (raw ?? {}) as Record<string, unknown>;
  const rank = NOTE_RANKS.find((r) => r === p['noteRank']);
  // a sub-nota de antes não existe mais: o lugar dela vira comum
  const out: Personal = rank ? { noteRank: rank } : {};
  if (p['org'] !== true) return out;
  const category = typeof p['category'] === 'string' ? cleanCategory(p['category']) : '';
  const subject = typeof p['subject'] === 'string' ? cleanSubject(p['subject']) : '';
  return { ...out, ...orgOf({ category: category || undefined, subject: subject || undefined, tags: sanitizeTags(p['tags']) }) };
}
