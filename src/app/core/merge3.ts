/**
 * A junção de três vias, como a do git: a versão de onde as duas partiram (`o`, a base), a de uma pessoa
 * (`a`) e a de outra (`b`). O que só um lado mexeu entra; o que os dois mexeram igual entra uma vez; o
 * que os dois mexeram de jeitos diferentes vira conflito. Duas coisas acrescentadas no mesmo lugar
 * (linhas novas dos dois lados) ficam as duas, uma depois da outra: nada que alguém escreveu se perde.
 *
 * O texto é juntado por linhas; um trecho em conflito é tentado de novo por palavras, para duas
 * pessoas mexendo em palavras diferentes do mesmo parágrafo não brigarem.
 */

/** Um pedaço da junção: o que todos concordam, ou um conflito com as três versões do trecho. */
export type Chunk<T> = { ok: T[] } | { conflict: { o: T[]; a: T[]; b: T[] } };

/** Acima disso (muitas diferenças entre duas versões), o trecho do meio é tratado como trocado inteiro. */
const MAX_EDIT_DISTANCE = 4000;

/**
 * Os pares (i, j) de elementos iguais de `a` e `b` numa maior subsequência comum, em ordem (Myers,
 * O((N+M)·D), com o começo e o fim iguais tirados antes).
 */
export function commonPairs<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): [number, number][] {
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start], b[start])) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) {
    endA--;
    endB--;
  }
  const pairs: [number, number][] = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  const middle = myers(a.slice(start, endA), b.slice(start, endB), eq);
  for (const [i, j] of middle) pairs.push([i + start, j + start]);
  for (let i = endA, j = endB; i < a.length; i++, j++) pairs.push([i, j]);
  return pairs;
}

/** O miolo do Myers: os pares iguais, ou nenhum se as duas versões são diferentes demais. */
function myers<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return [];
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // a fronteira de cada passo (só a faixa -d..d dele), para refazer o caminho de trás para a frente
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && d <= MAX_EDIT_DISTANCE; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[x], b[y])) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) found = d;
    }
    trace.push(v.slice(offset - d, offset + d + 1));
    if (found >= 0) break;
  }
  if (found < 0) return [];
  const at = (d: number, k: number) => trace[d][k + d];
  const pairs: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const k = x - y;
    const prevK = k === -d || (k !== d && at(d - 1, k - 1) < at(d - 1, k + 1)) ? k + 1 : k - 1;
    const prevX = at(d - 1, prevK);
    const prevY = prevX - prevK;
    const startX = prevK === k + 1 ? prevX : prevX + 1;
    while (x > startX) {
      x--;
      y--;
      pairs.push([x, y]);
    }
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    pairs.push([x, y]);
  }
  return pairs.reverse();
}

const sameList = <T>(x: readonly T[], y: readonly T[], eq: (a: T, b: T) => boolean) => x.length === y.length && x.every((v, i) => eq(v, y[i]));

/**
 * A junção de três vias de duas listas (`a` e `b`) que partiram de `o`. `keepBoth`: duas inserções
 * diferentes no mesmo lugar ficam as duas (a de `a` primeiro); sem ele, viram conflito.
 */
export function merge3<T>(o: readonly T[], a: readonly T[], b: readonly T[], keepBoth: boolean, eq: (x: T, y: T) => boolean = (x, y) => x === y): Chunk<T>[] {
  const inA = new Map(commonPairs(o, a, eq));
  const inB = new Map(commonPairs(o, b, eq));
  const out: Chunk<T>[] = [];
  const ok = (items: readonly T[]) => {
    if (!items.length) return;
    const last = out.at(-1);
    if (last && 'ok' in last) last.ok.push(...items);
    else out.push({ ok: [...items] });
  };
  let io = 0;
  let ia = 0;
  let ib = 0;
  while (io < o.length || ia < a.length || ib < b.length) {
    // o trecho estável: igual nas três
    let j = 0;
    while (io + j < o.length && inA.get(io + j) === ia + j && inB.get(io + j) === ib + j) j++;
    if (j > 0) {
      ok(o.slice(io, io + j));
      io += j;
      ia += j;
      ib += j;
      continue;
    }
    // até o próximo ponto em que as três voltam a concordar
    let k = io;
    while (k < o.length && !(inA.has(k) && inB.has(k))) k++;
    const ea = k < o.length ? inA.get(k)! : a.length;
    const eb = k < o.length ? inB.get(k)! : b.length;
    const co = o.slice(io, k);
    const ca = a.slice(ia, ea);
    const cb = b.slice(ib, eb);
    if (sameList(ca, co, eq)) ok(cb);
    else if (sameList(cb, co, eq)) ok(ca);
    else if (sameList(ca, cb, eq)) ok(ca);
    else if (!co.length && keepBoth) ok([...ca, ...cb]);
    else {
      const apart = disjoint(co, ca, cb, keepBoth, eq);
      if (apart) ok(apart);
      else out.push({ conflict: { o: co, a: ca, b: cb } });
    }
    io = k;
    ia = ea;
    ib = eb;
  }
  return out;
}

/** Uma mudança de um lado sobre a base: os elementos [s, e) de `o` viram `rep` (s = e: inserção antes de s). */
interface Hunk<T> {
  s: number;
  e: number;
  rep: T[];
  side: 0 | 1;
}

function hunksOf<T>(o: readonly T[], x: readonly T[], side: 0 | 1, eq: (a: T, b: T) => boolean): Hunk<T>[] {
  const out: Hunk<T>[] = [];
  let io = 0;
  let ix = 0;
  for (const [i, j] of [...commonPairs(o, x, eq), [o.length, x.length] as [number, number]]) {
    if (i > io || j > ix) out.push({ s: io, e: i, rep: x.slice(ix, j), side });
    io = i + 1;
    ix = j + 1;
  }
  return out;
}

/**
 * Um trecho que os dois mexeram, quando as mudanças de cada um caem em partes diferentes da base (uma
 * linha apagada aqui, a vizinha mudada lá): as duas entram. O git chamaria isso de conflito por
 * estarem coladas; aqui só briga o que mexeu no mesmo pedaço. null se alguma mudança entra na outra
 * (ou, sem `keepBoth`, se as duas mexem coladas: por palavras, "branco" trocado por um e "gato" logo
 * antes trocado pelo outro seria uma frase que ninguém escreveu).
 */
function disjoint<T>(o: readonly T[], a: readonly T[], b: readonly T[], keepBoth: boolean, eq: (x: T, y: T) => boolean): T[] | null {
  // sem `keepBoth` (por palavras), encostar também é brigar
  const gap = keepBoth ? 0 : 1;
  const ha = hunksOf(o, a, 0, eq);
  const hb = hunksOf(o, b, 1, eq);
  const same = (x: Hunk<T>, y: Hunk<T>) => x.s === y.s && x.e === y.e && sameList(x.rep, y.rep, eq);
  for (const x of ha) {
    for (const y of hb) {
      if (same(x, y)) continue;
      const xi = x.s === x.e;
      const yi = y.s === y.e;
      if (xi && yi) {
        if (x.s === y.s && !keepBoth) return null;
      } else if (x.s < y.e + gap && y.s < x.e + gap) {
        // uma inserção colada na ponta de uma troca entra (por linhas); dentro dela, não
        const inside = (p: number, h: Hunk<T>) => h.s < p && p < h.e;
        if (!keepBoth || (!xi && !yi) || (xi && inside(x.s, y)) || (yi && inside(y.s, x))) return null;
      }
    }
  }
  // na ordem da base: a inserção antes da troca que começa no mesmo lugar, e o lado `a` primeiro
  const all = [...ha, ...hb.filter((y) => !ha.some((x) => same(x, y)))].sort((x, y) => x.s - y.s || Number(x.e !== x.s) - Number(y.e !== y.s) || x.side - y.side);
  const out: T[] = [];
  let at = 0;
  for (const h of all) {
    out.push(...o.slice(at, h.s), ...h.rep);
    at = Math.max(at, h.e);
  }
  out.push(...o.slice(at));
  return out;
}

/** Um trecho do texto juntado: igual nas duas versões, ou o que cada uma diz (o conflito). */
export type TextSegment = { same: string } | { o: string; a: string; b: string };

export interface TextMerge {
  /** Sem conflito: `a` e `b` são o mesmo texto. */
  clean: boolean;
  /** O texto com os trechos em conflito do jeito de `a`. */
  a: string;
  /** O texto com os trechos em conflito do jeito de `b`. */
  b: string;
  /** O texto em pedaços, na ordem (para mostrar as duas versões com os trechos marcados). */
  segments: TextSegment[];
}

/** As palavras e os espaços entre elas (o espaço também é pedaço: juntar devolve o texto igual). */
const words = (s: string): string[] => s.match(/\s+|[^\s]+/g) ?? [];

/**
 * Junta dois textos que partiram de `o`: por linhas (as linhas novas dos dois lados ficam), e um
 * trecho em conflito de novo por palavras (aí, duas inserções no mesmo lugar continuam conflito: juntar
 * frases no meio de outra ficaria sem sentido).
 */
export function mergeText(o: string, a: string, b: string): TextMerge {
  const norm = (s: string) => s.replace(/\r\n?/g, '\n');
  o = norm(o);
  a = norm(a);
  b = norm(b);
  if (a === b || b === o) return cleanText(a);
  if (a === o) return cleanText(b);
  const lines = (s: string) => s.split('\n');
  const segments: TextSegment[] = [];
  const aLines: string[] = [];
  const bLines: string[] = [];
  const pieces: ({ same: string[] } | { o: string[]; a: string[]; b: string[] })[] = [];
  for (const chunk of merge3(lines(o), lines(a), lines(b), true)) {
    if ('ok' in chunk) {
      pieces.push({ same: chunk.ok });
      continue;
    }
    const { o: co, a: ca, b: cb } = chunk.conflict;
    // por palavras só quando os três lados têm o trecho (uma linha a mais ou a menos é conflito de linha)
    const fine = co.length && ca.length && cb.length ? merge3(words(co.join('\n')), words(ca.join('\n')), words(cb.join('\n')), false) : null;
    if (fine?.every((c) => 'ok' in c)) pieces.push({ same: fine.flatMap((c) => ('ok' in c ? c.ok : [])).join('').split('\n') });
    else pieces.push({ o: co, a: ca, b: cb });
  }
  // junta os pedaços iguais vizinhos (um trecho resolvido por palavras encosta nos de antes e depois)
  for (const p of pieces) {
    if ('same' in p) {
      aLines.push(...p.same);
      bLines.push(...p.same);
      const last = segments.at(-1);
      if (last && 'same' in last) segments[segments.length - 1] = { same: `${last.same}\n${p.same.join('\n')}` };
      else segments.push({ same: p.same.join('\n') });
    } else {
      aLines.push(...p.a);
      bLines.push(...p.b);
      segments.push({ o: p.o.join('\n'), a: p.a.join('\n'), b: p.b.join('\n') });
    }
  }
  const textA = aLines.join('\n');
  const textB = bLines.join('\n');
  return { clean: textA === textB, a: textA, b: textB, segments: textA === textB ? [{ same: textA }] : segments };
}

function cleanText(text: string): TextMerge {
  return { clean: true, a: text, b: text, segments: [{ same: text }] };
}
