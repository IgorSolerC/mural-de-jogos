import { canonicalJson } from './canonical-json';
import { merge3 } from './merge3';

/**
 * A junção de três vias do que não é texto: os ajustes que vão no mural privado da nuvem (o jeito das
 * categorias, as configurações do mural, as tags fixas) e os quadros do Kanban. Como a do git: a
 * versão que os dois aparelhos tinham juntos na última sincronização (`o`, a base), a daqui (`a`) e a
 * que veio da nuvem (`b`). O que só um lado mexeu entra; o que os dois mexeram igual entra uma vez; o
 * que os dois mexeram de jeitos diferentes fica com o lado escolhido (`preferA`, normalmente o mexido
 * por último). Assim, pintar uma categoria num aparelho e outra no outro guarda as duas.
 */

const same = (x: unknown, y: unknown) => canonicalJson(x ?? null) === canonicalJson(y ?? null);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Junta dois valores JSON que partiram de `o`: objetos campo a campo (um campo que sumiu de um lado
 * e não mudou do outro sai); o resto (textos, números, listas) inteiro. `undefined`: o campo não existe.
 */
export function merge3Json(o: unknown, a: unknown, b: unknown, preferA: boolean): unknown {
  if (same(a, b)) return a;
  if (same(o, a)) return b;
  if (same(o, b)) return a;
  if (isObject(a) && isObject(b) && (o === undefined || isObject(o))) {
    const base = (o ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const v = merge3Json(base[key], a[key], b[key], preferA);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  return preferA ? a : b;
}

/**
 * Junta dois objetos que partiram de `o` campo a campo, cada campo inteiro (o visual de um card não se
 * mistura com o de outro: ou é um, ou é o outro). Um campo que sumiu de um lado e não mudou do outro sai.
 */
export function mergeFields<T extends object>(o: T | undefined, a: T, b: T, preferA: boolean): T {
  const base = (o ?? {}) as Record<string, unknown>;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const v = same(x[key], y[key]) ? x[key] : same(base[key], x[key]) ? y[key] : same(base[key], y[key]) ? x[key] : preferA ? x[key] : y[key];
    if (v !== undefined) out[key] = v;
  }
  return out as T;
}

/**
 * Junta duas listas sem repetição (as tags fixas, as tags escondidas): o que um lado pôs entra, o que
 * um lado tirou sai. A ordem é a de `a`, com as novas de `b` no fim. `key` diz quando dois itens são o
 * mesmo (sem caixa e acento, nas tags).
 */
export function mergeSet<T>(o: readonly T[], a: readonly T[], b: readonly T[], key: (v: T) => string = String): T[] {
  const inO = new Set(o.map(key));
  const inA = new Set(a.map(key));
  const inB = new Set(b.map(key));
  const kept = a.filter((v) => !(inO.has(key(v)) && !inB.has(key(v))));
  const added = b.filter((v) => !inO.has(key(v)) && !inA.has(key(v)));
  const seen = new Set<string>();
  return [...kept, ...added].filter((v) => !seen.has(key(v)) && !!seen.add(key(v)));
}

/**
 * Junta duas ordens de uma lista de ids (as colunas, as anotações de um quadro, as abas): o que cada
 * lado mudou de lugar fica; os dois mudando o mesmo trecho, vale o de `preferA`. Os ids que estão em
 * `keep` e não sobraram na junção vão no fim, na ordem do lado escolhido; os que não estão saem.
 */
export function mergeOrder(o: readonly string[], a: readonly string[], b: readonly string[], preferA: boolean, keep?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id) || (keep && !keep.has(id))) return;
    seen.add(id);
    out.push(id);
  };
  for (const chunk of merge3(o, a, b, true)) {
    if ('ok' in chunk) chunk.ok.forEach(push);
    else (preferA ? chunk.conflict.a : chunk.conflict.b).forEach(push);
  }
  if (keep) for (const id of [...(preferA ? a : b), ...(preferA ? b : a), ...keep]) push(id);
  return out;
}
