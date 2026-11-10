import { canonicalJson } from './canonical-json';
import { FbEdge, FbNode, FbUnknownNode, FreeBoard, sanitizeFreeBoard } from './free-board';
import { mergeFields, mergeOrder } from './merge-parts';

/**
 * Dois aparelhos (ou duas abas) mexeram no mesmo quadro: junta em três vias, sem pergunta, como o Kanban
 * (PLANO-QUADRO-LIVRE.md, seção 7.5). `o` é o quadro como os dois o tinham na última vez (a base); `a` e
 * `b`, cada lado.
 *
 * - Peças e setas por id: o que só um lado mexeu entra; os dois mexeram a mesma peça, ela junta campo a
 *   campo (a posição de um lado e a cor do outro ficam as duas); o mesmo campo diferente, vale o lado
 *   mexido por último (`em`; no empate, `a`).
 * - Apagada de um lado e não mexida do outro, sai. Apagada de um lado e mexida do outro, fica: perder
 *   trabalho é pior que sobrar uma peça.
 * - A ordem de empilhar junta como uma lista (`mergeOrder`).
 * - Seta cuja peça saiu na junção, sai também.
 *
 * Sem base (`o` null: o quadro nasceu nos dois lados, ou a base se perdeu), cada peça que só um lado tem
 * entra, e as dos dois juntam pelos campos.
 */
export function mergeFreeBoard(o: FreeBoard | null, a: FreeBoard, b: FreeBoard): FreeBoard {
  const same = (x: unknown, y: unknown) => canonicalJson(x ?? null) === canonicalJson(y ?? null);
  if (same(a, b)) return a;
  if (o && same(o, a)) return b;
  if (o && same(o, b)) return a;
  const preferA = a.em >= b.em;
  const n = mergeItems<FbNode | FbUnknownNode>(o?.n ?? [], a.n, b.n, preferA, same);
  const left = new Set(n.map((x) => x.i));
  const e = mergeItems<FbEdge>(o?.e ?? [], a.e, b.e, preferA, same).filter((x) => left.has(x.a) && left.has(x.b));
  const { n: _on, e: _oe, ...oMeta } = o ?? ({} as Partial<FreeBoard>);
  const { n: _an, e: _ae, ...aMeta } = a;
  const { n: _bn, e: _be, ...bMeta } = b;
  const meta = mergeFields(o ? oMeta : undefined, aMeta, bMeta, preferA);
  const merged = { ...meta, id: a.id, em: a.em >= b.em ? a.em : b.em, n, e };
  // a junção pode passar dos limites (as duas metades cabiam): o sanitize corta, e garante o formato
  return sanitizeFreeBoard(merged) ?? (preferA ? a : b);
}

function mergeItems<T extends { i: string }>(o: readonly T[], a: readonly T[], b: readonly T[], preferA: boolean, same: (x: unknown, y: unknown) => boolean): T[] {
  const byO = new Map(o.map((x) => [x.i, x]));
  const byA = new Map(a.map((x) => [x.i, x]));
  const byB = new Map(b.map((x) => [x.i, x]));
  const out = new Map<string, T>();
  for (const id of new Set([...byA.keys(), ...byB.keys()])) {
    const base = byO.get(id);
    const x = byA.get(id);
    const y = byB.get(id);
    if (x && y) {
      out.set(id, mergeFields(base, x, y, preferA));
    } else if (x) {
      // só em `a`: nova de `a`, ou apagada em `b` (fica se `a` mexeu nela)
      if (!base || !same(base, x)) out.set(id, x);
    } else if (y) {
      if (!base || !same(base, y)) out.set(id, y);
    }
  }
  const order = mergeOrder(
    o.map((x) => x.i),
    a.map((x) => x.i),
    b.map((x) => x.i),
    preferA,
    new Set(out.keys()),
  );
  return order.map((id) => out.get(id)!);
}
