import { canonicalJson } from './canonical-json';
import { mergeJson } from './merge-json';
import { readText, tookFromOtherTab } from './storage';

/**
 * Duas abas do Murall no mesmo navegador mexendo ao mesmo tempo. Cada loja guarda o estado inteiro numa
 * chave e o regrava a cada mudança (por um effect, que roda logo depois); quando outra aba grava, esta
 * acompanha. Trocar o daqui pelo gravado perdia o que esta aba tinha acabado de mudar e ainda não tinha
 * gravado (o effect a caminho). Agora, nesse caso, as duas mudanças se juntam em três vias, como na
 * sincronização: `before` é a chave como esta aba a viu por último (gravou ou recebeu), `mine` o que ela
 * gravaria agora e `theirs` o que a outra gravou. Sem mudança daqui ainda não gravada, vale o gravado.
 */

function parse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * A junção do que as duas abas fizeram (o valor cru, para quem chama sanitizar), ou undefined quando
 * basta ficar com o gravado: esta aba não tinha nada por gravar, não se sabe o que ela viu antes, ou a
 * chave foi tirada (a limpeza ao sair da conta). Onde as duas mudaram a mesma coisa, vale a da outra
 * (a gravação mais nova), como antes.
 */
export function joinWithOtherTab(before: string | null | undefined, mine: string, theirs: string | null): unknown | undefined {
  if (before === undefined || before === null || theirs === null) return undefined;
  if (mine === before || mine === theirs) return undefined;
  const o = parse(before);
  const a = parse(mine);
  const b = parse(theirs);
  if (!o.ok || !a.ok || !b.ok) return undefined;
  return mergeJson(o.value, a.value, b.value).b;
}

/**
 * O estado de uma loja do localStorage depois de outra aba gravar a chave (ver `onOtherTab`): o
 * gravado, ou a junção com o que esta aba mudou e ainda não gravou. `mine`: o que ela grava (o mesmo
 * valor do `writeJson`); `read` lê o gravado; `sanitize` confere a junção.
 */
export function fromOtherTab<T>(key: string, before: string | null, mine: unknown, read: () => T, sanitize: (raw: unknown) => T): T {
  const joined = joinWithOtherTab(before, JSON.stringify(mine), readText(key));
  if (joined !== undefined) return sanitize(joined);
  const stored = read();
  tookFromOtherTab(key, stored);
  return stored;
}

type Item = Record<string, unknown> & { id: string };

const isItem = (v: unknown): v is Item => !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Item).id === 'string';

/** Os itens de uma lista guardada, pelo id (o que não é item, ou repete o id, fica de fora). */
function byId(text: string | null): Map<string, Item> | null {
  if (text === null) return new Map();
  const p = parse(text);
  if (!p.ok || !Array.isArray(p.value)) return null;
  const out = new Map<string, Item>();
  for (const v of p.value) if (isItem(v) && !out.has(v.id)) out.set(v.id, v);
  return out;
}

/**
 * A ficha foi mexida depois da base: o `updatedAt` andou (toda mudança de verdade o anda; uma diferença
 * só de formato, de uma versão do site que gravou de outro jeito, não). Sem as datas, pelo conteúdo.
 */
function edited(x: Item, base: Item): boolean {
  const tx = Date.parse(String(x['updatedAt'] ?? ''));
  const tb = Date.parse(String(base['updatedAt'] ?? ''));
  if (Number.isFinite(tx) && Number.isFinite(tb)) return tx > tb;
  return canonicalJson(x) !== canonicalJson(base);
}

/** A mexida por último (o `updatedAt` maior; empatado, a da outra aba). */
function newer(mine: Item, theirs: Item): Item {
  const tm = Date.parse(String(mine['updatedAt'] ?? ''));
  const tt = Date.parse(String(theirs['updatedAt'] ?? ''));
  return Number.isFinite(tm) && (!Number.isFinite(tt) || tm > tt) ? mine : theirs;
}

/**
 * A mesma junção para uma lista de fichas (com `id` e `updatedAt`), ficha a ficha e inteira: a ficha
 * que só uma aba mexeu fica do jeito dela; mexida nas duas, fica a mexida por último (nunca um pedaço de
 * cada, que teria a hora de uma e o texto da outra). A que uma aba pôs fica; a que uma tirou sem a outra
 * ter mexido sai; a que uma tirou e a outra mexeu depois fica (nada some). As que só esta aba tem vão na frente
 * (como uma ficha nova), as outras na ordem da outra aba. `before` null: a chave estava vazia.
 * Devolve undefined quando basta ficar com o gravado (ver `joinWithOtherTab`).
 */
export function joinItemsWithOtherTab(before: string | null | undefined, mine: string, theirs: string | null): unknown[] | undefined {
  if (before === undefined || theirs === null) return undefined;
  if (mine === (before ?? '[]') || mine === theirs) return undefined;
  const o = byId(before);
  const a = byId(mine);
  const b = byId(theirs);
  if (!o || !a || !b) return undefined;
  const same = (x: Item | undefined, y: Item | undefined) => !!x && !!y && canonicalJson(x) === canonicalJson(y);
  const out: Item[] = [];
  for (const [id, m] of a) {
    if (b.has(id)) continue;
    const base = o.get(id);
    // pôs aqui, ou mexeu aqui no que a outra tirou: fica; tirada lá sem mexer aqui: sai
    if (!base || edited(m, base)) out.push(m);
  }
  for (const [id, t] of b) {
    const m = a.get(id);
    const base = o.get(id);
    if (m) out.push(same(m, t) || same(m, base) ? t : same(t, base) ? m : newer(m, t));
    // tirada aqui: sai, a não ser que a outra a tenha mexido depois
    else if (!base || edited(t, base)) out.push(t);
  }
  return out;
}
