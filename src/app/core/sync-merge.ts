import { canonicalJson } from './canonical-json';
import { FichaPart, mergeFicha } from './ficha-merge';
import { KanbanBoard, freshBoard, mergeBoards } from './kanban';
import { mergeJson } from './merge-json';
import { Review } from './review';
import { KnownVersion, isNewer } from './review-store';
import { sameContent, versionKey } from './kept-versions';

/**
 * O passo da junção de três vias que roda antes da junção de sempre (ver core/cloud-sync.ts): olha o
 * que veio da nuvem e o que está aqui e, onde os dois lados mudaram a mesma coisa desde a base (a
 * última vez que este aparelho e a nuvem se acertaram), junta as duas mudanças. O resultado volta como
 * fichas (e quadros) para pôr no lugar das de lá, mais novas que as duas versões: a junção de sempre
 * (a mais nova fica) então as escolhe sozinha, e todo o resto dela (as apagadas, a fila, a wishlist)
 * continua igual.
 *
 * O que só um lado mudou não passa por aqui, a junção de sempre já fica com ele; menos quando ele é mais
 * velho que a base (o relógio do aparelho que o mudou estava atrasado): aí volta mais novo, para a
 * mudança não perder para a versão que ninguém mexeu.
 */

/** Um conflito achado: `a` é a versão que estava na nuvem, `b` a deste aparelho (null: apagada). */
export interface FoundConflict<T> {
  id: string;
  a: T | null;
  b: T | null;
  parts: FichaPart[];
}

export interface FichaPlan {
  /** As fichas que vão no lugar das de lá (ou entram, quando lá ela foi apagada). */
  replace: Review[];
  conflicts: FoundConflict<Review>[];
  /**
   * As versões daqui que saíram do mural mas estão dentro da junção (ou do conflito): a junção de
   * sempre não precisa guardá-las em Ajustes › Backup.
   */
  known: Set<string>;
}

export interface FichaPlanInput {
  /** As fichas deste aparelho (sem as compartilhadas, que juntam pela nuvem delas). */
  local: readonly Review[];
  /** As apagadas daqui (id → quando). */
  localDeleted: Readonly<Record<string, string>>;
  /** As fichas que vieram da nuvem. */
  remote: readonly Review[];
  remoteDeleted: Readonly<Record<string, string>>;
  /** A versão é a da base? */
  known: KnownVersion;
  /** A ficha como era na base, quando este aparelho a guardou (ver core/sync-base.ts). */
  base: (id: string) => Review | undefined;
  /** Agora (ISO). */
  now: string;
}

/** Uma data depois de todas (e no mínimo agora): a da versão juntada, para ela ganhar a junção de sempre. */
export function stampAfter(now: string, ...isos: string[]): string {
  let t = Date.parse(now);
  for (const iso of isos) {
    const v = Date.parse(iso);
    if (Number.isFinite(v) && v + 1 > t) t = v + 1;
  }
  return new Date(t).toISOString();
}

export function planFichas(input: FichaPlanInput): FichaPlan {
  const { known, now } = input;
  const plan: FichaPlan = { replace: [], conflicts: [], known: new Set() };
  const remote = new Map(input.remote.map((r) => [r.id, r]));
  const local = new Map(input.local.map((r) => [r.id, r]));
  /**
   * A versão diz outra coisa que a da base? Só com o conteúdo da base dá para saber: sem ele, quem
   * decide entre apagar e mudar é a junção de sempre (a mais nova fica, a outra é guardada).
   */
  const changed = (id: string, x: Review) => {
    const o = input.base(id);
    return !known(id, x.updatedAt) && !!o && known(id, o.updatedAt) && !sameContent(o, x);
  };

  for (const [id, l] of local) {
    const r = remote.get(id);
    if (!r) {
      // apagada lá depois de mudar aqui: as duas valem até a pessoa escolher (a daqui fica no mural)
      // (a data não decide: se este aparelho tem a base dela, ela estava nos dois, e lá foi apagada depois)
      if (input.remoteDeleted[id] && changed(id, l)) {
        const kept = { ...l, updatedAt: stampAfter(now, l.updatedAt, input.remoteDeleted[id]) };
        plan.replace.push(kept);
        plan.known.add(versionKey({ ficha: l }));
        plan.conflicts.push({ id, a: null, b: kept, parts: [] });
      }
      continue;
    }
    if (sameContent(l, r)) continue;
    const lBase = known(id, l.updatedAt);
    const rBase = known(id, r.updatedAt);
    if (lBase || rBase) {
      // só um lado mudou desde a base: a junção de sempre fica com a mais nova, e a mudança feita num
      // aparelho de relógio atrasado (mais velha que a da base) perderia para a base, que ninguém mexeu
      const moved = lBase ? (rBase ? null : r) : l;
      const still = moved === l ? r : l;
      if (moved && !isNewer(moved, still)) plan.replace.push({ ...moved, updatedAt: stampAfter(now, l.updatedAt, r.updatedAt) });
      continue;
    }
    // os dois mudaram desde a base: junta a partir dela, se este aparelho a tem
    const o = input.base(id);
    if (!o || !known(id, o.updatedAt)) continue;
    const m = mergeFicha(o, r, l);
    plan.known.add(versionKey({ ficha: l }));
    if (!m.other) {
      if (sameContent(m.merged, l)) plan.replace.push(l);
      else if (!(sameContent(m.merged, r) && isNewer(r, l))) plan.replace.push({ ...m.merged, updatedAt: stampAfter(now, l.updatedAt, r.updatedAt) });
      continue;
    }
    const at = stampAfter(now, l.updatedAt, r.updatedAt);
    const a = { ...m.merged, updatedAt: at };
    plan.replace.push(a);
    // a daqui com a data dela: guardada depois da escolha, não se confunde com a do mural
    plan.conflicts.push({ id, a, b: { ...m.other, updatedAt: l.updatedAt }, parts: m.parts });
  }

  // apagada aqui depois de mudar lá: a de lá volta para o mural até a pessoa escolher
  for (const [id, r] of remote) {
    if (local.has(id) || !input.localDeleted[id] || !changed(id, r)) continue;
    const back = { ...r, updatedAt: stampAfter(now, r.updatedAt, input.localDeleted[id]) };
    plan.replace.push(back);
    plan.conflicts.push({ id, a: back, b: null, parts: [] });
  }
  return plan;
}

export interface BoardPlan {
  replace: KanbanBoard[];
  conflicts: FoundConflict<KanbanBoard>[];
}

/** Sem a data: ela muda a cada mexida e não é conteúdo. */
const strip = (b: KanbanBoard): Omit<KanbanBoard, 'at'> => {
  const { at: _at, ...rest } = b;
  return rest;
};
const same = (x: unknown, y: unknown) => canonicalJson(x ?? null) === canonicalJson(y ?? null);

/**
 * Os quadros Kanban mudados dos dois lados desde a base, juntados coluna a coluna e ficha a ficha (ver
 * `mergeBoards` em core/kanban.ts). O quadro não pergunta: a anotação mexida nos dois aparelhos fica
 * onde foi posta por último (pela hora dela), a coluna mudada nos dois fica com o quadro mexido por
 * último, e a anotação de uma coluna que saiu do outro lado vai para outra coluna, nunca some.
 * `base`: a versão de cada quadro na base e o quadro como era. `fresh`: este aparelho tem a base, e um
 * quadro que não está nela nasceu depois (dos dois lados, a partir do quadro de sempre da categoria).
 */
export function planBoards(
  local: readonly KanbanBoard[],
  remote: readonly KanbanBoard[],
  base: { quadrosV: Readonly<Record<string, string>>; quadros: Readonly<Record<string, KanbanBoard>> },
  now: string,
  fresh = false,
): BoardPlan {
  const plan: BoardPlan = { replace: [], conflicts: [] };
  const here = new Map(local.map((b) => [b.id, b]));
  for (const r of remote) {
    const l = here.get(r.id);
    const v0 = base.quadrosV[r.id];
    if (!l || same(strip(l), strip(r))) continue;
    let o = base.quadros[r.id];
    if (v0 === undefined) {
      // montado nos dois aparelhos depois da última sincronização: os dois partiram do de sempre
      if (!fresh) continue;
      o = freshBoard(r.category);
    } else if (l.at === v0 || r.at === v0 || !o || o.at !== v0) continue;
    const m = mergeBoards(o, l, r);
    if (same(strip(m), strip(l))) {
      plan.replace.push(l);
      continue;
    }
    plan.replace.push({ ...m, at: stampAfter(now, l.at, r.at) });
  }
  return plan;
}

/** O que fazer com um ajuste (ver core/sync-base.ts). */
export type BlockPlan =
  /** Como sempre: o mudado por último vale. */
  | { kind: 'sempre' }
  /** Só lá mudou: vale o de lá. */
  | { kind: 'remoto' }
  /** Só aqui mudou: fica o daqui. */
  | { kind: 'local' }
  /** Os dois mudaram: a junção (com `outro` quando brigaram). */
  | { kind: 'junto'; dados: unknown; outro: unknown | null };

export function planBlock(o: unknown, local: unknown, remote: unknown): BlockPlan {
  if (remote === undefined || local === undefined || o === undefined || same(local, remote)) return { kind: 'sempre' };
  const lc = !same(local, o);
  const rc = !same(remote, o);
  if (!lc) return { kind: 'remoto' };
  if (!rc) return { kind: 'local' };
  const m = mergeJson(o, remote, local);
  return { kind: 'junto', dados: m.a, outro: m.conflicts.length ? m.b : null };
}
