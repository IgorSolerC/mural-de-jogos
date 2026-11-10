import {
  FB_COORD_MAX,
  FB_MAX_NODES,
  FbEdge,
  FbNode,
  FreeBoard,
  addPieces,
  boardFits,
  boardSources,
  boardsMovedGroup,
  connect,
  freeBoardName,
  groupPieces,
  idsOf,
  moveNodes,
  newFreeBoard,
  newNodeId,
  patchEdge,
  pieceCount,
  removePieces,
  restack,
  sanitizeFreeBoard,
  shownEdges,
  shownNodes,
  sortBoards,
  ungroupPieces,
  withGroups,
} from './free-board';
import { localImageIds } from './images';

const ID = 'quadroBluePrince000001';
const AT = '2026-11-10T12:00:00.000Z';

function board(n: unknown[] = [], e: unknown[] = [], extra: Record<string, unknown> = {}): FreeBoard {
  return sanitizeFreeBoard({ v: 1, id: ID, nome: 'Blue Prince', grupo: 'Jogos', em: AT, n, e, ...extra })!;
}

const img = (i: string, x = 0, y = 0): FbNode => ({ i, t: 'w', x, y, w: 240, h: 180, src: `{{imagem: murall://imagem/${'a'.repeat(21)}${i.slice(-1)} | foto}}` });
const note = (i: string, txt = 'Senha?', x = 0, y = 0): FbNode => ({ i, t: 'x', x, y, w: 120, h: 52, txt });
const frame = (i: string, x: number, y: number, w: number, h: number, nome = 'Roxo (Quartos)'): FbNode => ({ i, t: 'm', x, y, w, h, nome });

describe('Quadro livre: o quadro', () => {
  it('um quadro precisa de id de 22 letras, nome e grupo', () => {
    expect(sanitizeFreeBoard({ v: 1, id: 'curto', nome: 'A', grupo: 'Jogos' })).toBeNull();
    expect(sanitizeFreeBoard({ v: 1, id: ID, nome: '   ', grupo: 'Jogos' })).toBeNull();
    expect(sanitizeFreeBoard({ v: 1, id: ID, nome: 'A', grupo: '' })).toBeNull();
    expect(sanitizeFreeBoard(null)).toBeNull();
    expect(sanitizeFreeBoard([])).toBeNull();
    const b = newFreeBoard('  blue   prince ', 'jogos', AT, ID)!;
    expect(b).toEqual({ v: 1, id: ID, nome: 'Blue prince', grupo: 'Jogos', em: AT, n: [], e: [] });
  });

  it('corta os números para a faixa e arredonda; o tamanho tem mínimo', () => {
    const b = board([{ i: 'a1', t: 'x', x: 1e12, y: -1e12, w: 2.6, h: 99.4, txt: 'oi' }]);
    expect(b.n[0]).toEqual({ i: 'a1', t: 'x', x: FB_COORD_MAX, y: -FB_COORD_MAX, w: 8, h: 99, txt: 'oi' });
  });

  it('id repetido fica só o primeiro; seta para peça que não existe, para ela mesma ou sem ponta sai', () => {
    const b = board(
      [note('a1', 'primeira'), note('a1', 'repetida'), note('b2')],
      [
        { i: 'e1', a: 'a1', b: 'b2', txt: '  Precisa   da lupa ' },
        { i: 'e2', a: 'a1', b: 'zz' },
        { i: 'e3', a: 'a1', b: 'a1' },
        { i: 'e4', a: 'a1' },
        { i: 'a1', a: 'a1', b: 'b2' },
      ],
    );
    expect(b.n.map((n) => n['txt'])).toEqual(['primeira', 'Senha?']);
    expect(b.e).toEqual([{ i: 'e1', a: 'a1', b: 'b2', txt: 'Precisa da lupa' }]);
  });

  it('campos sem valor que sirva ficam de fora (cor, lado, ponta); widget sem linha não é guardado', () => {
    const b = board(
      [
        { ...note('a1'), c: 'dourado', g: '###' },
        { i: 'w1', t: 'w', x: 0, y: 0, w: 10, h: 10, src: '   ' },
        { ...note('b2'), c: 'rosa' },
      ],
      [{ i: 'e1', a: 'a1', b: 'b2', as: 'cima', bs: 'l', p: '<>', c: 'azul' }],
    );
    expect(b.n.map((n) => n.i)).toEqual(['a1', 'b2']);
    expect(b.n[0]['c']).toBeUndefined();
    expect(b.n[0]['g']).toBeUndefined();
    expect(b.n[1]['c']).toBe('rosa');
    expect(b.e[0]).toEqual({ i: 'e1', a: 'a1', b: 'b2', bs: 'l', p: '<>', c: 'azul' });
  });

  it('o que um site mais novo mandou fica guardado: campos pequenos e peças de tipo desconhecido (sem aparecer)', () => {
    const b = board(
      [note('a1'), { i: 'k9', t: 'caneta', x: 5, y: 5, w: 30, h: 30, tinta: 'azul', grosso: 3 }, note('b2')],
      [
        { i: 'e1', a: 'a1', b: 'k9' },
        { i: 'e2', a: 'a1', b: 'b2', curva: 'reta' },
      ],
      { fundo: 'cortiça', enorme: 'x'.repeat(5000), lista: [1, 2] },
    );
    expect(b['fundo']).toBe('cortiça');
    expect(b['enorme']).toBeUndefined();
    expect(b['lista']).toBeUndefined();
    expect(b.n[1]).toEqual(jasmine.objectContaining({ i: 'k9', t: 'caneta', tinta: 'azul', grosso: 3 }));
    expect(b.e[1]['curva']).toBe('reta');
    // aparecem só as que este site conhece, e as setas entre elas
    expect(shownNodes(b).map((n) => n.i)).toEqual(['a1', 'b2']);
    expect(shownEdges(b).map((e) => e.i)).toEqual(['e2']);
    expect(pieceCount(b)).toBe(2);
    // e voltam iguais se o quadro passa de novo pela limpeza (este site reenvia sem perder)
    expect(sanitizeFreeBoard(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it('para no limite de peças', () => {
    const many = Array.from({ length: FB_MAX_NODES + 5 }, (_, k) => note(`n${k}x`));
    expect(board(many).n.length).toBe(FB_MAX_NODES);
    expect(boardFits(board(many))).toBeTrue();
  });

  it('ids novos de peça são curtos, começam com letra e não repetem', () => {
    const taken = new Set<string>();
    for (let k = 0; k < 500; k++) {
      const id = newNodeId(taken);
      expect(id).toMatch(/^[a-z][a-z0-9]{3,}$/);
      expect(taken.has(id)).toBeFalse();
      taken.add(id);
    }
  });
});

describe('Quadro livre: mexer nas peças', () => {
  it('pôr peças com ids já usados troca os ids, e as setas que vinham junto seguem os novos (colar, duplicar)', () => {
    const b = board([note('a1'), note('b2')], [{ i: 'e1', a: 'a1', b: 'b2' }]);
    const pasted: FbEdge[] = [{ i: 'e1', a: 'a1', b: 'b2', txt: 'copiada' }];
    const r = addPieces(b, [note('a1', 'cópia A'), note('b2', 'cópia B')], pasted, '2026-11-10T13:00:00.000Z');
    expect(r.board.n.length).toBe(4);
    expect(r.added.map((n) => n.i)).not.toContain('a1');
    const [na, nb] = r.added.map((n) => n.i);
    const copied = r.board.e.find((e) => e.txt === 'copiada')!;
    expect([copied.a, copied.b]).toEqual([na, nb]);
    expect(copied.i).not.toBe('e1');
    expect(r.board.em).toBe('2026-11-10T13:00:00.000Z');
    expect(r.left).toBe(0);
  });

  it('pôr peças num quadro cheio deixa o que não cabe de fora e diz quantas', () => {
    const full = board(Array.from({ length: FB_MAX_NODES - 1 }, (_, k) => note(`n${k}x`)));
    const r = addPieces(full, [note('z1'), note('z2'), note('z3')], [], AT);
    expect(r.board.n.length).toBe(FB_MAX_NODES);
    expect(r.left).toBe(2);
  });

  it('tirar uma peça leva as setas dela', () => {
    const b = board([note('a1'), note('b2'), note('c3')], [
      { i: 'e1', a: 'a1', b: 'b2' },
      { i: 'e2', a: 'b2', b: 'c3' },
    ]);
    const r = removePieces(b, new Set(['a1']), AT);
    expect(r.n.map((n) => n.i)).toEqual(['b2', 'c3']);
    expect(r.e.map((e) => e.i)).toEqual(['e2']);
    expect(removePieces(b, new Set(['nada']), AT)).toBe(b);
  });

  it('andar com as peças muda só as escolhidas e não mexe no quadro quando não andou', () => {
    const b = board([note('a1', 'a', 10, 10), note('b2', 'b', 50, 50)]);
    const r = moveNodes(b, new Set(['a1']), 26, -26, '2026-11-10T13:00:00.000Z');
    expect(r.n.map((n) => [n.x, n.y])).toEqual([
      [36, -16],
      [50, 50],
    ]);
    expect(moveNodes(b, new Set(['a1']), 0, 0, AT)).toBe(b);
  });

  it('ligar duas peças cria a seta; ligar a mesma ou uma que não existe, não', () => {
    const b = board([note('a1'), note('b2')]);
    const r = connect(b, 'a1', 'b2', AT, { as: 'b' })!;
    expect(r.edge).toEqual(jasmine.objectContaining({ a: 'a1', b: 'b2', as: 'b' }));
    expect(idsOf(r.board).has(r.edge.i)).toBeTrue();
    expect(connect(b, 'a1', 'a1', AT)).toBeNull();
    expect(connect(b, 'a1', 'zz', AT)).toBeNull();
    const labeled = patchEdge(r.board, r.edge.i, (e) => ({ ...e, txt: 'Senha?' }), AT);
    expect(labeled.e[0].txt).toBe('Senha?');
    // a seta não pode perder a ponta pela mudança
    expect(patchEdge(r.board, r.edge.i, (e) => ({ ...e, b: 'zz' }), AT)).toBe(r.board);
  });

  it('trazer para frente e mandar para trás mudam a ordem de empilhar, mantendo a ordem entre as que andaram', () => {
    const b = board([note('a1'), note('b2'), note('c3'), note('d4')]);
    expect(restack(b, new Set(['a1', 'c3']), true, AT).n.map((n) => n.i)).toEqual(['b2', 'd4', 'a1', 'c3']);
    expect(restack(b, new Set(['d4', 'b2']), false, AT).n.map((n) => n.i)).toEqual(['b2', 'd4', 'a1', 'c3']);
    expect(restack(b, new Set(['d4']), true, AT)).toBe(b);
  });

  it('Ctrl+G junta as peças num agrupamento; tocar numa pega o grupo inteiro; Ctrl+Shift+G separa', () => {
    const b = board([note('a1'), note('b2'), note('c3')]);
    expect(groupPieces(b, new Set(['a1']), AT).group).toBeNull();
    const { board: g, group } = groupPieces(b, new Set(['a1', 'b2']), AT);
    expect(group).toBeTruthy();
    expect(g.n.map((n) => n['g'] ?? null)).toEqual([group, group, null]);
    expect([...withGroups(g, new Set(['a1']))].sort()).toEqual(['a1', 'b2']);
    expect([...withGroups(g, new Set(['c3']))]).toEqual(['c3']);
    const u = ungroupPieces(g, new Set(['a1', 'b2']), AT);
    expect(u.n.every((n) => n['g'] === undefined)).toBeTrue();
  });

  it('as imagens do quadro saem do texto dos widgets (para a nuvem não apagá-las como soltas)', () => {
    const b = board([img('w1'), note('a1', 'veja murall://imagem/' + 'b'.repeat(22)), frame('m1', 0, 0, 500, 500)]);
    expect(localImageIds(boardSources(b)).sort()).toEqual(['a'.repeat(21) + '1', 'b'.repeat(22)]);
  });
});

describe('Quadro livre: a lista e os grupos', () => {
  const mk = (id: string, nome: string, grupo: string, em: string) => sanitizeFreeBoard({ v: 1, id: id.padEnd(22, 'x'), nome, grupo, em, n: [], e: [] })!;

  it('os mexidos por último primeiro; no empate, pelo nome', () => {
    const list = [mk('a', 'Zeta', 'Jogos', AT), mk('b', 'Alfa', 'Jogos', AT), mk('c', 'Novo', 'Jogos', '2026-11-11T00:00:00.000Z')];
    expect(sortBoards(list).map((b) => b.nome)).toEqual(['Novo', 'Alfa', 'Zeta']);
  });

  it('o nome repetido no grupo ganha um número; em outro grupo, não', () => {
    const list = [mk('a', 'Blue Prince', 'Jogos', AT), mk('b', 'Blue Prince (2)', 'Jogos', AT), mk('c', 'Mapa', 'Estudos', AT)];
    expect(freeBoardName(list, 'jogos', 'blue prince')).toBe('Blue prince (3)');
    expect(freeBoardName(list, 'Estudos', 'Blue Prince')).toBe('Blue Prince');
    expect(freeBoardName(list, 'Estudos', '   ')).toBe('Quadro');
    expect(freeBoardName(list, 'Estudos', 'mapa')).toBe('Mapa (2)');
  });

  it('o grupo renomeado leva os quadros; só a escrita mudando também; apagado, os quadros saem', () => {
    const list = [mk('a', 'Um', 'Jogos', AT), mk('b', 'Dois', 'Estudos', AT)];
    const renamed = boardsMovedGroup(list, 'jogos', 'Games', '2026-11-11T00:00:00.000Z');
    expect(renamed.boards.map((b) => b.grupo)).toEqual(['Games', 'Estudos']);
    expect(renamed.changed.map((b) => b.nome)).toEqual(['Um']);
    expect(renamed.changed[0].em).toBe('2026-11-11T00:00:00.000Z');
    const cased = boardsMovedGroup(list, 'Jogos', 'jógos', AT);
    expect(cased.boards[0].grupo).toBe('Jógos');
    const gone = boardsMovedGroup(list, 'Jogos', null, AT);
    expect(gone.boards.map((b) => b.nome)).toEqual(['Dois']);
    expect(gone.removed.map((b) => b.nome)).toEqual(['Um']);
  });
});
