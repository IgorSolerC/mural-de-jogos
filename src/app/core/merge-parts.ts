import { canonicalJson } from './canonical-json';
import { merge3 } from './merge3';

/**
 * As junções pequenas de três vias do quadro Kanban (ver `mergeBoards` em core/kanban.ts): a versão
 * que os dois aparelhos tinham juntos na última sincronização (`o`, a base), uma (`a`) e a outra (`b`).
 * O que só um lado mexeu entra; o que os dois mexeram igual entra uma vez; o que os dois mexeram de
 * jeitos diferentes fica com o lado escolhido (`preferA`, o mexido por último). Diferente da junção da
 * conta (core/merge-json.ts), aqui nada vira pergunta.
 */

const same = (x: unknown, y: unknown) => canonicalJson(x ?? null) === canonicalJson(y ?? null);

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
 * Junta duas ordens de uma lista de ids (as colunas, as anotações de um quadro): o que cada lado mudou
 * de lugar fica; os dois mudando o mesmo trecho, vale o de `preferA`. Os ids que estão em `keep` e não
 * sobraram na junção vão no fim, na ordem do lado escolhido; os que não estão saem.
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
