import { canonicalJson } from './canonical-json';
import {
  EMPTY_KANBAN,
  KanbanBoard,
  KanbanState,
  addColumn,
  boardIdFor,
  freshBoard,
  mergeBoards,
  mergeKanban,
  moveBoardCategory,
  moveColumn,
  placeCard,
  removeCard,
  removeColumn,
  sanitizeBoard,
  sanitizeKanban,
  setImportance,
  updateColumn,
  IMPORTANCES,
} from './kanban';
import { mergeFields, mergeOrder } from './merge-parts';

/**
 * A junção do Kanban por partes (`mergeBoards`, `mergeKanban` com a base) contra operações sorteadas
 * em vários aparelhos, que sincronizam em ordens sorteadas, alguns sem rede por um tempo. No fim, todos
 * os aparelhos têm de ficar iguais (a junção converge), sem quadro quebrado, e o que cada aparelho fez
 * sozinho numa anotação que só ele mexeu tem de estar lá.
 */

/** Sorteio com semente (o mesmo teste falha sempre do mesmo jeito). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const empty = (): KanbanState => ({ ...EMPTY_KANBAN, boards: [], removed: {}, legacy: [] });
/** O que importa de um estado para comparar dois aparelhos. */
const print = (st: KanbanState) =>
  canonicalJson({ boards: [...st.boards].sort((a, b) => (a.id < b.id ? -1 : 1)), removed: st.removed, movedTo: st.movedTo ?? {} });
const content = (b: KanbanBoard) => canonicalJson({ columns: b.columns, cards: b.cards });

interface Dev {
  local: KanbanState;
  base: KanbanState | null;
  rev: number;
  offline: boolean;
}

/** A nuvem e os aparelhos, sincronizando como core/cloud-sync.ts (baixa e junta com a base; envia se mudou). */
class World {
  cloud: KanbanState = empty();
  rev = 0;
  pushes = 0;
  constructor(readonly devs: Dev[]) {}

  sync(d: Dev): void {
    if (d.offline) return;
    if (d.rev !== this.rev) {
      d.local = mergeKanban(d.local, sanitizeKanban(JSON.parse(JSON.stringify(this.cloud))), d.base);
      d.base = this.cloud;
      d.rev = this.rev;
    }
    if (print(d.local) !== print(d.base ?? empty())) {
      this.cloud = JSON.parse(JSON.stringify(d.local));
      this.rev++;
      this.pushes++;
      d.base = this.cloud;
      d.rev = this.rev;
    }
  }

  settle(): number {
    for (const d of this.devs) d.offline = false;
    for (let round = 1; round <= 6; round++) {
      const before = this.pushes;
      for (const d of this.devs) this.sync(d);
      if (this.pushes === before) return round;
    }
    throw new Error('a junção não converge');
  }
}

let clock = Date.parse('2026-10-18T10:00:00.000Z');
const tick = () => new Date((clock += 1000)).toISOString();

function boardOf(st: KanbanState, category: string): KanbanBoard {
  return st.boards.find((b) => b.id === boardIdFor(category)) ?? freshBoard(category);
}

function withBoard(st: KanbanState, board: KanbanBoard): KanbanState {
  const i = st.boards.findIndex((b) => b.id === board.id);
  const boards = [...st.boards];
  if (i >= 0) boards[i] = board;
  else boards.push(board);
  return { ...st, boards };
}

describe('a junção do Kanban por partes', () => {
  describe('mergeBoards', () => {
    const o = (): KanbanBoard => {
      let b = freshBoard('trabalho');
      for (const n of ['nota1', 'nota2', 'nota3']) b = placeCard(b, n, b.columns[0].id, tick());
      return b;
    };

    it('sem mudança de um lado, fica o outro inteiro (com a hora dele)', () => {
      const base = o();
      const a = placeCard(base, 'nota1', base.columns[1].id, tick());
      expect(mergeBoards(base, a, base)).toBe(a);
      expect(mergeBoards(base, base, a)).toBe(a);
    });

    it('os dois iguais: fica o mais novo, e juntar de novo não muda nada', () => {
      const base = o();
      const a = placeCard(base, 'nota1', base.columns[1].id, tick());
      const b = { ...a, at: tick() };
      expect(mergeBoards(base, a, b)).toBe(b);
      const m = mergeBoards(base, placeCard(base, 'nota2', base.columns[2].id, tick()), a);
      expect(mergeBoards(base, m, m)).toBe(m);
      expect(mergeBoards(a, m, a)).toBe(m);
    });

    it('quem junta não importa: os dois aparelhos chegam no mesmo quadro', () => {
      const base = o();
      const a = setImportance(placeCard(base, 'nota1', base.columns[2].id, tick()), 'nota3', 'critico', tick());
      const b = updateColumn(placeCard(base, 'nota1', base.columns[1].id, tick()), base.columns[0].id, { name: 'Ideias' }, tick());
      expect(content(mergeBoards(base, a, b))).toBe(content(mergeBoards(base, b, a)));
    });

    it('a mesma coluna mudada nos dois: o nome de um e a cor do outro ficam', () => {
      const base = o();
      const col = base.columns[1].id;
      const a = updateColumn(base, col, { name: 'Em curso' }, tick());
      const b = updateColumn(base, col, { color: 'rosa', finishes: true }, tick());
      const m = mergeBoards(base, a, b);
      expect(m.columns[1]).toEqual(jasmine.objectContaining({ name: 'Em curso', color: 'rosa', finishes: true }));
    });

    it('as colunas arrastadas nos dois em lugares diferentes: as duas mudanças ficam', () => {
      let base = o();
      base = addColumn(base, 'Quarta', tick()).board;
      const ids = base.columns.map((c) => c.id);
      const a = moveColumn(base, ids[0], 1, tick()); // [1,0,2,3]
      const b = moveColumn(base, ids[3], 2, tick()); // [0,1,3,2]
      const m = mergeBoards(base, a, b);
      expect(m.columns.map((c) => c.id)).toEqual([ids[1], ids[0], ids[3], ids[2]]);
    });

    it('a mesma coluna arrastada para lugares diferentes: fica o lugar do mais novo, sem repetir nem perder coluna', () => {
      let base = o();
      base = addColumn(base, 'Quarta', tick()).board;
      const ids = base.columns.map((c) => c.id);
      const a = moveColumn(base, ids[0], 3, tick());
      const b = moveColumn(base, ids[0], 1, tick());
      const m = mergeBoards(base, a, b);
      expect([...m.columns.map((c) => c.id)].sort()).toEqual([...ids].sort());
      expect(m.columns.map((c) => c.id)).toEqual(b.columns.map((c) => c.id));
    });

    it('a anotação tirada num e mexida no outro depois: volta (a mudança mais nova vale); mexida antes: sai', () => {
      const base = o();
      const moved = setImportance(base, 'nota2', 'baixo', tick());
      const removed = removeCard(base, 'nota2', tick());
      expect(mergeBoards(base, removed, moved).cards.some((c) => c.note === 'nota2')).toBeFalse();
      const later = setImportance(base, 'nota2', 'baixo', tick());
      expect(mergeBoards(base, removed, later).cards.find((c) => c.note === 'nota2')?.importance).toBe('baixo');
    });

    it('a anotação posta numa coluna nova de um lado, e a coluna tirada... do mesmo lado não existe: a do outro lado tirada leva para a da base', () => {
      const base = o();
      const col = base.columns[1].id;
      const a = removeColumn(base, col, base.columns[0].id, tick());
      const b = placeCard(base, 'nota3', col, tick());
      const m = mergeBoards(base, a, b);
      expect(m.columns.some((c) => c.id === col)).toBeFalse();
      expect(m.cards.find((c) => c.note === 'nota3')!.column).toBe(base.columns[0].id);
      expect(sanitizeBoard(m)).toEqual(m);
    });

    it('as duas tiram colunas diferentes até não sobrar nenhuma: o quadro nunca fica sem coluna', () => {
      const base = o();
      const [c0, c1, c2] = base.columns.map((c) => c.id);
      const a = removeColumn(removeColumn(base, c0, c2, tick()), c1, c2, tick());
      const b = removeColumn(base, c2, c0, tick());
      const m = mergeBoards(base, a, b);
      expect(m.columns.length).toBeGreaterThan(0);
      expect(m.cards.length).toBe(3);
      expect(sanitizeBoard(m)).toEqual(m);
    });
  });

  describe('mergeKanban com a base', () => {
    it('sem a base (o site de antes dela), o quadro inteiro do mexido por último vale, como antes', () => {
      const base = boardOf(empty(), 'trabalho');
      const a = placeCard(base, 'nota1', base.columns[1].id, tick());
      const b = placeCard(base, 'nota2', base.columns[2].id, tick());
      const m = mergeKanban(withBoard(empty(), a), withBoard(empty(), b));
      expect(m.boards).toEqual([b]);
    });

    it('com a base vazia (o quadro nasceu nos dois depois da última sincronização): junta as duas montagens', () => {
      const base = boardOf(empty(), 'trabalho');
      const a = placeCard(base, 'nota1', base.columns[1].id, tick());
      const b = placeCard(base, 'nota2', base.columns[2].id, tick());
      const m = mergeKanban(withBoard(empty(), a), withBoard(empty(), b), empty());
      expect(m.boards[0].cards.map((c) => c.note).sort()).toEqual(['nota1', 'nota2']);
    });

    it('um quadro apagado num aparelho e mexido no outro antes: fica apagado; mexido depois: volta', () => {
      const b0 = placeCard(boardOf(empty(), 'trabalho'), 'nota1', boardOf(empty(), 'trabalho').columns[0].id, tick());
      const st = withBoard(empty(), b0);
      const changed = withBoard(st, placeCard(b0, 'nota2', b0.columns[0].id, tick()));
      const gone: KanbanState = { ...st, boards: [], removed: { [b0.id]: tick() } };
      expect(mergeKanban(changed, gone, st).boards).toEqual([]);
      const after = withBoard(st, placeCard(b0, 'nota3', b0.columns[0].id, tick()));
      expect(mergeKanban(gone, after, st).boards.length).toBe(1);
    });

    it('a categoria renomeada num e o quadro de antes mexido no outro (sem saber): a mudança vai para o quadro novo', () => {
      const b0 = placeCard(boardOf(empty(), 'trabalho'), 'nota1', boardOf(empty(), 'trabalho').columns[0].id, tick());
      const st = withBoard(empty(), b0);
      const renamed = moveBoardCategory(st, 'trabalho', 'emprego', tick());
      const edited = withBoard(st, placeCard(b0, 'nota2', b0.columns[1].id, tick()));
      for (const m of [mergeKanban(renamed, edited, st), mergeKanban(edited, renamed, st)]) {
        expect(m.boards.map((b) => b.category)).toEqual(['emprego']);
        expect(m.boards[0].cards.map((c) => [c.note, c.column])).toEqual([
          ['nota1', b0.columns[0].id],
          ['nota2', b0.columns[1].id],
        ]);
      }
    });

    it('juntada com uma categoria que já tinha quadro: o que o outro mexeu no de antes vai para a coluna de mesmo nome', () => {
      let tr = boardOf(empty(), 'trabalho');
      tr = placeCard(tr, 'nota1', tr.columns[0].id, tick());
      let em = boardOf(empty(), 'emprego');
      em = updateColumn(placeCard(em, 'nota9', em.columns[0].id, tick()), em.columns[1].id, { color: 'azul' }, tick());
      const st = withBoard(withBoard(empty(), tr), em);
      const merged = moveBoardCategory(st, 'trabalho', 'emprego', tick());
      const edited = withBoard(st, placeCard(tr, 'nota2', tr.columns[1].id, tick()));
      const m = mergeKanban(edited, merged, st);
      expect(m.boards.map((b) => b.category)).toEqual(['emprego']);
      const fazendo = m.boards[0].columns.find((c) => c.name === 'Fazendo')!.id;
      expect(m.boards[0].cards.find((c) => c.note === 'nota2')?.column).toBe(fazendo);
      expect(m.boards[0].cards.map((c) => c.note).sort()).toEqual(['nota1', 'nota2', 'nota9']);
    });

    it('renomeada e voltada ao nome de antes em outro aparelho: um quadro só, sem laço', () => {
      const b0 = placeCard(boardOf(empty(), 'trabalho'), 'nota1', boardOf(empty(), 'trabalho').columns[0].id, tick());
      const st = withBoard(empty(), b0);
      const there = moveBoardCategory(st, 'trabalho', 'emprego', tick());
      const back = moveBoardCategory(there, 'emprego', 'trabalho', tick());
      const edited = withBoard(st, placeCard(b0, 'nota2', b0.columns[2].id, tick()));
      for (const m of [mergeKanban(back, edited, st), mergeKanban(edited, back, st)]) {
        expect(m.boards.map((b) => b.category)).toEqual(['trabalho']);
        expect(m.boards[0].cards.map((c) => c.note).sort()).toEqual(['nota1', 'nota2']);
      }
    });

    it('guardado e lido de novo, o para onde foi cada quadro continua (e sem o apagado, não vale)', () => {
      const st: KanbanState = { ...empty(), removed: { kbaaaa: tick() }, movedTo: { kbaaaa: 'kbbbbb', kbcccc: 'kbdddd' } };
      expect(sanitizeKanban(JSON.parse(JSON.stringify(st))).movedTo).toEqual({ kbaaaa: 'kbbbbb' });
    });
  });

  describe('operações sorteadas em vários aparelhos', () => {
    const NOTES = ['n01', 'n02', 'n03', 'n04', 'n05', 'n06', 'n07', 'n08', 'n09', 'n10', 'n11', 'n12'].map((n) => `nota${n}`);

    /** Uma operação sorteada no quadro (de anotações quaisquer, ou só das de `mine`). */
    function randomOp(st: KanbanState, r: () => number, mine: readonly string[], structural: boolean): KanbanState {
      const board = boardOf(st, 'trabalho');
      const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
      const at = tick();
      const col = () => pick(board.columns).id;
      const kind = r();
      let next: KanbanBoard;
      if (structural && kind < 0.15) next = updateColumn(board, col(), { name: pick(['Hoje', 'Amanhã', 'Revisar', 'Bloqueado']), color: pick(['azul', 'rosa', 'verde'] as const) }, at);
      else if (structural && kind < 0.25 && board.columns.length < 7) next = addColumn(board, pick(['Extra', 'Teste', 'QA']), at).board;
      else if (structural && kind < 0.32) next = moveColumn(board, col(), Math.floor(r() * board.columns.length), at);
      else if (structural && kind < 0.37 && board.columns.length > 2) {
        // as anotações da coluna tirada vão para outra (nenhuma sai do quadro por isso)
        const gone = col();
        next = removeColumn(board, gone, pick(board.columns.filter((c) => c.id !== gone)).id, at);
      }
      else if (structural && kind < 0.42) next = updateColumn(board, col(), { sort: r() < 0.5 ? [] : [{ by: 'importancia' }] }, at);
      else if (kind < 0.75) {
        const inCol = board.cards.length;
        next = placeCard(board, pick(mine), col(), at, Math.floor(r() * (inCol + 1)));
      } else if (kind < 0.88) next = setImportance(board, pick(mine), pick([...IMPORTANCES, null]), at);
      else next = removeCard(board, pick(mine), at);
      return withBoard(st, next);
    }

    /** Onde está cada anotação de `notes` no quadro: o nome da coluna e a importância (ou null fora dele). */
    function where(st: KanbanState, notes: readonly string[]): Record<string, unknown> {
      const b = boardOf(st, 'trabalho');
      return Object.fromEntries(
        notes.map((n) => {
          const c = b.cards.find((x) => x.note === n);
          return [n, c ? { col: c.column, imp: c.importance } : null];
        }),
      );
    }

    for (let seed = 1; seed <= 60; seed++) {
      it(`converge e não perde nada (semente ${seed})`, () => {
        const r = rng(seed);
        const n = 2 + Math.floor(r() * 2);
        const world = new World(Array.from({ length: n }, () => ({ local: empty(), base: empty(), rev: 0, offline: false })));
        world.settle();
        for (let epoch = 0; epoch < 6; epoch++) {
          // cada aparelho mexe só nas anotações dele; um deles (sorteado) mexe também nas colunas
          const owner = Math.floor(r() * n);
          const mine = world.devs.map((_, i) => NOTES.filter((_, k) => k % n === i));
          for (let step = 0; step < 12; step++) {
            const i = Math.floor(r() * n);
            const d = world.devs[i];
            if (r() < 0.2) d.offline = !d.offline;
            d.local = randomOp(d.local, r, mine[i], i === owner);
            if (r() < 0.35) world.sync(d);
          }
          const expected = world.devs.map((d, i) => where(d.local, mine[i]));
          const ownerCols = boardOf(world.devs[owner].local, 'trabalho').columns;
          expect(world.settle()).toBeLessThanOrEqual(3);
          const first = print(world.devs[0].local);
          for (const d of world.devs) expect(print(d.local)).toBe(first);
          const final = boardOf(world.devs[0].local, 'trabalho');
          expect(sanitizeBoard(final)).toEqual(final);
          // as colunas são as de quem mexeu nelas
          expect(final.columns).toEqual(ownerCols);
          // o que cada aparelho fez nas anotações dele está lá (a coluna, se ela ainda existe)
          for (let i = 0; i < n; i++) {
            const got = where(world.devs[0].local, mine[i]);
            for (const note of mine[i]) {
              const want = expected[i][note] as { col: string; imp: unknown } | null;
              const have = got[note] as { col: string; imp: unknown } | null;
              if (!want) expect(have).withContext(`${note} saiu no aparelho ${i}`).toBeNull();
              else if (!have) fail(`E${epoch}: ${note} do aparelho ${i} sumiu do quadro`);
              else {
                expect(have!.imp).withContext(`importância de ${note}`).toBe(want.imp);
                if (final.columns.some((c) => c.id === want.col)) expect(have!.col).withContext(`E${epoch} coluna de ${note}`).toBe(want.col);
              }
            }
          }
        }
      });
    }

    it('a ordem à mão de cada aparelho (anotações só dele, na coluna só dele) fica como ele deixou', () => {
      const r = rng(99);
      const world = new World([0, 1].map(() => ({ local: empty(), base: empty(), rev: 0, offline: false })));
      let b = boardOf(empty(), 'trabalho');
      for (const note of NOTES.slice(0, 6)) b = placeCard(b, note, b.columns[note < 'notan04' ? 0 : 1].id, tick());
      world.devs[0].local = withBoard(empty(), b);
      world.settle();
      for (let k = 0; k < 20; k++) {
        const i = k % 2;
        const d = world.devs[i];
        const bd = boardOf(d.local, 'trabalho');
        const col = bd.columns[i].id;
        const inCol = bd.cards.filter((c) => c.column === col);
        d.local = withBoard(d.local, placeCard(bd, inCol[Math.floor(r() * inCol.length)].note, col, tick(), Math.floor(r() * inCol.length)));
        if (r() < 0.3) world.sync(d);
      }
      const want = [0, 1].map((i) => boardOf(world.devs[i].local, 'trabalho').cards.filter((c) => c.column === boardOf(world.devs[i].local, 'trabalho').columns[i].id).map((c) => c.note));
      world.settle();
      const final = boardOf(world.devs[0].local, 'trabalho');
      for (const i of [0, 1]) expect(final.cards.filter((c) => c.column === final.columns[i].id).map((c) => c.note)).toEqual(want[i]);
    });
  });
});

describe('merge-parts (as junções pequenas)', () => {
  it('mergeFields: cada campo inteiro (os objetos de dentro não se misturam)', () => {
    const o = { look: { stock: 'azul', pattern: 'xadrez' }, name: 'A' };
    const a = { look: { stock: 'rosa', pattern: 'xadrez' }, name: 'A' };
    const b = { look: { stock: 'azul', pattern: 'bolinhas' }, name: 'B' };
    expect(mergeFields(o, a, b, true)).toEqual({ look: a.look, name: 'B' });
  });

  it('mergeOrder: cada lado arrasta um e os dois ficam; o que só devia ficar (keep) vem no fim', () => {
    expect(mergeOrder(['a', 'b', 'c', 'd'], ['b', 'a', 'c', 'd'], ['a', 'b', 'd', 'c'], true)).toEqual(['b', 'a', 'd', 'c']);
    expect(mergeOrder(['a', 'b'], ['a', 'b', 'x'], ['a'], true, new Set(['a', 'x', 'y']))).toEqual(['a', 'x', 'y']);
  });
});
