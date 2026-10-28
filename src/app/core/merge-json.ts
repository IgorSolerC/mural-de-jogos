import { canonicalJson } from './canonical-json';
import { merge3 } from './merge3';

/**
 * A junção de três vias de um valor qualquer em JSON (um quadro Kanban, as configurações do mural, o
 * perfil), como a do git e a das anotações compartilhadas (ver core/merge3.ts): `o` é de onde os dois
 * partiram, `a` e `b` as duas versões.
 *
 * - **Objetos:** campo a campo (um campo que só um lado mexeu entra; os dois mexendo em campos
 *   diferentes, entram os dois).
 * - **Listas de coisas com nome** (objetos com `id` ou `note` diferentes, como as colunas e as fichas
 *   de um quadro; ou textos e números sem repetição, como as tags): item a item. O que um lado pôs fica,
 *   o que um lado tirou sai, e cada item que ficou nos dois é juntado por dentro. A ordem é a junção
 *   das ordens (com briga, a de `a`, e os que só `b` pôs no fim).
 * - **O resto** (um texto, um número, uma lista com repetição): inteiro. Os dois mudaram de jeitos
 *   diferentes, conflito.
 *
 * O conflito não escolhe nada: a junção volta duas vezes, uma com os trechos em briga do jeito de `a`
 * e outra do jeito de `b`, e o caminho de cada briga.
 */

export interface JsonMerge {
  /** A junção, com o que brigou do jeito de `a`. */
  a: unknown;
  /** A junção, com o que brigou do jeito de `b` (igual a `a` sem conflito). */
  b: unknown;
  /** Onde os dois mudaram de jeitos diferentes (cada caminho, os campos e os ids até lá). Vazia: sem conflito. */
  conflicts: string[][];
}

const same = (x: unknown, y: unknown): boolean => canonicalJson(x ?? null) === canonicalJson(y ?? null);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** O nome de um item de lista (`id` ou `note`), ou null se ele não tem. */
function itemKey(v: unknown): string | null {
  if (typeof v === 'string') return `s:${v}`;
  if (typeof v === 'number') return `n:${v}`;
  if (isObject(v)) {
    if (typeof v['id'] === 'string') return `i:${v['id']}`;
    if (typeof v['note'] === 'string') return `t:${v['note']}`;
  }
  return null;
}

/** Os nomes dos itens da lista, ou null se algum não tem nome ou se repete (aí a lista vai inteira). */
function keysOf(list: readonly unknown[]): string[] | null {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    const k = itemKey(v);
    if (k === null || seen.has(k)) return null;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export function mergeJson(o: unknown, a: unknown, b: unknown): JsonMerge {
  const conflicts: string[][] = [];
  const [ra, rb] = walk(o, a, b, [], conflicts);
  return { a: ra, b: rb, conflicts };
}

function walk(o: unknown, a: unknown, b: unknown, path: string[], conflicts: string[][]): [unknown, unknown] {
  if (same(a, b)) {
    // um lado sem o campo e o outro com null dizem o mesmo: fica o null, venha de que lado vier
    const v = a === undefined ? b : a;
    return [v, v];
  }
  if (same(b, o)) return [a, a];
  if (same(a, o)) return [b, b];
  if (isObject(a) && isObject(b) && (o === undefined || o === null || isObject(o))) {
    const base = (o ?? {}) as Record<string, unknown>;
    const left: Record<string, unknown> = {};
    const right: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(a), ...Object.keys(b)])) {
      const [x, y] = walk(base[key], a[key], b[key], [...path, key], conflicts);
      if (x !== undefined) left[key] = x;
      if (y !== undefined) right[key] = y;
    }
    return [left, right];
  }
  if (Array.isArray(a) && Array.isArray(b) && (o === undefined || o === null || Array.isArray(o))) {
    const merged = mergeList((o ?? []) as unknown[], a, b, path, conflicts);
    if (merged) return merged;
  }
  conflicts.push(path);
  return [a, b];
}

/** Item a item (ver o topo), ou null se a lista não tem nomes. */
function mergeList(o: readonly unknown[], a: readonly unknown[], b: readonly unknown[], path: string[], conflicts: string[][]): [unknown[], unknown[]] | null {
  const ko = keysOf(o);
  const ka = keysOf(a);
  const kb = keysOf(b);
  if (!ko || !ka || !kb) return null;
  const byKey = (list: readonly unknown[], keys: string[]) => new Map(keys.map((k, i) => [k, list[i]]));
  const mo = byKey(o, ko);
  const ma = byKey(a, ka);
  const mb = byKey(b, kb);
  // a ordem: a junção das três; com briga, a de `a`, e os que só `b` tem no fim
  const chunks = merge3(ko, ka, kb, true);
  const order = new Set(chunks.every((c) => 'ok' in c) ? chunks.flatMap((c) => ('ok' in c ? c.ok : [])) : [...ka, ...kb.filter((k) => !ma.has(k))]);
  // o que um lado tirou e o outro mudou também passa por aqui (a ordem das três já o deixou de fora)
  for (const k of [...ka, ...kb]) order.add(k);
  const left: unknown[] = [];
  const right: unknown[] = [];
  for (const k of order) {
    const inO = mo.has(k);
    const inA = ma.has(k);
    const inB = mb.has(k);
    const name = k.slice(2);
    if (inA && inB) {
      const [x, y] = walk(mo.get(k), ma.get(k), mb.get(k), [...path, name], conflicts);
      left.push(x);
      right.push(y);
    } else if (inA || inB) {
      const kept = inA ? ma.get(k) : mb.get(k);
      if (!inO) {
        // um lado pôs: fica
        left.push(kept);
        right.push(kept);
      } else if (!same(kept, mo.get(k))) {
        // um lado tirou e o outro mudou: conflito (cada versão com o seu jeito)
        conflicts.push([...path, name]);
        if (inA) left.push(kept);
        else right.push(kept);
      }
      // um lado tirou e o outro não mexeu: sai
    }
  }
  return [left, right];
}
