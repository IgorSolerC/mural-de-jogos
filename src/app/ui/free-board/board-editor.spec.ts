import { FbNode, FreeBoard, sanitizeFreeBoard } from '../../core/free-board';
import { BoardEditor, EditorHost } from './board-editor';

const note = (i: string, x: number, y: number, w = 208, h = 104): FbNode => ({ i, t: 'x', x, y, w, h, txt: i });
const frame = (i: string, x: number, y: number, w: number, h: number): FbNode => ({ i, t: 'm', x, y, w, h, nome: i });

function board(n: FbNode[], e: { i: string; a: string; b: string; [k: string]: unknown }[] = []): FreeBoard {
  return sanitizeFreeBoard({ v: 1, id: 'abcdefghijklmnopqrstuv', nome: 'T', grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', n, e })!;
}

/** Um editor com o quadro guardado na memória, como a peça faz. */
function setup(start: FreeBoard) {
  let current = start;
  const commits: FreeBoard[] = [];
  const said: string[] = [];
  const dropped: unknown[] = [];
  const host: EditorHost = {
    board: () => current,
    zoom: () => 1,
    commit: (next) => {
      current = next;
      commits.push(next);
    },
    say: (t) => said.push(t),
    dropArrow: (...args) => dropped.push(args),
  };
  const ed = new BoardEditor(host);
  const at = (x: number, y: number) => ({ x, y });
  const drag = (from: [number, number], to: [number, number], mods = { shift: false, ctrl: false, alt: false }, target = {}) => {
    ed.down(at(...from), mods, target);
    ed.move(at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2), mods);
    ed.move(at(...to), mods);
    ed.up(at(...to), at(...to));
  };
  const click = (x: number, y: number, mods = { shift: false, ctrl: false }) => {
    ed.down(at(x, y), mods);
    ed.up(at(x, y), at(x, y));
  };
  return { ed, commits, said, dropped, drag, click, get board() {
    return current;
  } };
}

describe('Quadro livre: o editor', () => {
  it('clicar seleciona; Shift soma e tira; clicar no fundo tira a seleção', () => {
    const t = setup(board([note('a', 0, 0), note('b', 300, 0)]));
    t.click(10, 10);
    expect([...t.ed.selected()]).toEqual(['a']);
    t.click(310, 10, { shift: true, ctrl: false });
    expect([...t.ed.selected()].sort()).toEqual(['a', 'b']);
    t.click(10, 10, { shift: false, ctrl: true });
    expect([...t.ed.selected()]).toEqual(['b']);
    t.click(1000, 1000);
    expect(t.ed.selected().size).toBe(0);
  });

  it('a caixa no fundo pega as inteiras dentro, sem gravar nada', () => {
    const t = setup(board([note('a', 52, 52), note('b', 400, 52)]));
    t.drag([0, 0], [300, 300]);
    expect([...t.ed.selected()]).toEqual(['a']);
    expect(t.ed.box()).toBeNull();
    expect(t.commits.length).toBe(0);
  });

  it('arrastar move nos furos, numa gravação só e num passo do desfazer; a moldura leva o que tem dentro', () => {
    const t = setup(board([frame('m', 0, 0, 780, 520), note('a', 104, 104), note('fora', 2000, 0)]));
    t.drag([300, 10], [330, 60]);
    expect(t.commits.length).toBe(1);
    const moved = (id: string) => t.board.n.find((n) => n.i === id)!;
    expect(moved('m').x).toBe(26);
    expect(moved('m').y).toBe(52);
    expect(moved('a').x).toBe(130);
    expect(moved('fora').x).toBe(2000);
    expect(t.ed.preview()).toBeNull();
    t.ed.undo();
    expect(t.board.n.find((n) => n.i === 'm')!.x).toBe(0);
    t.ed.redo();
    expect(t.board.n.find((n) => n.i === 'm')!.x).toBe(26);
  });

  it('um clique sem arrasto não grava nada', () => {
    const t = setup(board([note('a', 0, 0)]));
    t.click(10, 10);
    expect(t.commits.length).toBe(0);
  });

  it('a alça muda o tamanho (o bilhete, livre)', () => {
    const t = setup(board([note('a', 0, 0)]));
    t.ed.select(['a']);
    t.drag([208, 104], [260, 130], undefined, { handle: { id: 'a', handle: 'se' } });
    const a = t.board.n[0];
    expect([a.w, a.h]).toEqual([260, 130]);
  });

  it('a Moldura desenha arrastando e já pede o título; pequena demais não nasce', () => {
    const t = setup(board([]));
    t.ed.tool.set('moldura');
    t.drag([0, 0], [400, 300]);
    expect(t.board.n.length).toBe(1);
    expect(t.board.n[0].t).toBe('m');
    expect(t.ed.writing()).toEqual({ kind: 'moldura', id: t.board.n[0].i });
    expect(t.ed.tool()).toBe('selecionar');
    t.ed.write(t.ed.writing()!, 'Roxo (Quartos)');
    expect((t.board.n[0] as FbNode & { nome?: string }).nome).toBe('Roxo (Quartos)');
    t.ed.tool.set('moldura');
    t.drag([0, 0], [10, 10]);
    expect(t.board.n.length).toBe(1);
  });

  it('o Texto: um clique no fundo é um bilhete, já escrevendo; vazio, ele não fica', () => {
    const t = setup(board([]));
    t.ed.tool.set('texto');
    t.click(100, 100);
    expect(t.board.n.length).toBe(1);
    const w = t.ed.writing()!;
    expect(w.kind).toBe('bilhete');
    t.ed.write(w, '');
    expect(t.board.n.length).toBe(0);
    // o bilhete que não chegou a existir não deixa passo no desfazer
    expect(t.ed.canUndo()).toBeFalse();
    const n = t.ed.newNote({ x: 0, y: 0 })!;
    t.ed.write({ kind: 'bilhete', id: n.i }, 'Senha?');
    expect((t.board.n[0] as FbNode & { txt: string }).txt).toBe('Senha?');
  });

  it('puxar a bolinha até outra peça liga as duas; soltar no vazio pergunta o que nasce ali', () => {
    const t = setup(board([note('a', 0, 0), note('b', 600, 0)]));
    t.drag([208, 52], [620, 10], undefined, { dot: { id: 'a', side: 'r' } });
    expect(t.board.e.length).toBe(1);
    expect(t.board.e[0]).toEqual(jasmine.objectContaining({ a: 'a', b: 'b', as: 'r', bs: 't' }));
    expect(t.ed.selectedEdge()).toBe(t.board.e[0].i);
    // soltou no meio da peça: os lados se escolhem sozinhos
    t.drag([208, 52], [700, 52], undefined, { dot: { id: 'a', side: 'r' } });
    expect(t.board.e[1].as).toBeUndefined();
    t.drag([208, 52], [400, 400], undefined, { dot: { id: 'a', side: 'r' } });
    expect(t.dropped.length).toBe(1);
  });

  it('puxar a ponta da seta muda o lado (perto da borda) ou leva a ponta para outra peça; no vazio, nada muda', () => {
    const t = setup(board([note('a', 0, 0), note('b', 600, 0), note('c', 600, 400)], [{ i: 'e', a: 'a', b: 'b' }]));
    // a ponta de chegada, no lado de cima de b
    t.drag([600, 52], [700, 4], undefined, { end: { id: 'e', end: 'b' } });
    expect(t.board.e[0]).toEqual(jasmine.objectContaining({ a: 'a', b: 'b', bs: 't' }));
    expect(t.ed.selectedEdge()).toBe('e');
    // para outra peça, no meio dela: a ponta vai e o lado se escolhe sozinho
    t.drag([700, 0], [700, 452], undefined, { end: { id: 'e', end: 'b' } });
    expect(t.board.e[0].b).toBe('c');
    expect(t.board.e[0].bs).toBeUndefined();
    // a ponta de saída, no lado de baixo de a
    t.drag([208, 52], [100, 100], undefined, { end: { id: 'e', end: 'a' } });
    expect(t.board.e[0]).toEqual(jasmine.objectContaining({ a: 'a', as: 'b' }));
    // no vazio, ou na peça da outra ponta: nada muda
    const before = t.board;
    t.drag([104, 104], [2000, 2000], undefined, { end: { id: 'e', end: 'a' } });
    t.drag([104, 104], [700, 452], undefined, { end: { id: 'e', end: 'a' } });
    expect(t.board).toBe(before);
    expect(t.ed.preview()).toBeNull();
    expect(t.ed.linking()).toBeNull();
  });

  it('o cadeado prende a seta nos lados de agora (mesmo andando as peças) e, solto, ela volta a se ajeitar', () => {
    const t = setup(board([note('a', 0, 0), note('b', 600, 0)], [{ i: 'e', a: 'a', b: 'b' }]));
    t.ed.selectedEdge.set('e');
    t.ed.lockEdge();
    // os lados que ela escolhia sozinha viram os dela
    expect(t.board.e[0]).toEqual(jasmine.objectContaining({ as: 'r', bs: 'l', fx: true }));
    t.ed.select(['b']);
    t.ed.nudge(0, 600);
    expect(t.board.e[0]).toEqual(jasmine.objectContaining({ as: 'r', bs: 'l', fx: true }));
    t.ed.lockEdge('e');
    expect(t.board.e[0].fx).toBeUndefined();
    expect(t.board.e[0].as).toBeUndefined();
    expect(t.board.e[0].bs).toBeUndefined();
    // solta, o lado puxado à mão vale até a peça andar
    t.ed.selectedEdge.set('e');
    t.drag([208, 52], [100, 100], undefined, { end: { id: 'e', end: 'a' } });
    expect(t.board.e[0].as).toBe('b');
    t.ed.select(['a']);
    t.ed.nudge(26, 0);
    expect(t.board.e[0].as).toBeUndefined();
    // presa, levar a ponta para o meio de uma peça guarda o lado que ela escolhe ali
    t.ed.lockEdge('e', true);
    t.drag([234, 52], [700, 652], undefined, { end: { id: 'e', end: 'b' } });
    expect(t.board.e[0].fx).toBeTrue();
    expect(t.board.e[0].bs).toBeDefined();
  });

  it('o rótulo da seta, as pontas, a cor e apagar a seta', () => {
    const t = setup(board([note('a', 0, 0), note('b', 600, 0)], [{ i: 'e', a: 'a', b: 'b' }]));
    t.ed.write({ kind: 'seta', id: 'e' }, '  Precisa   da lupa ');
    expect(t.board.e[0].txt).toBe('Precisa da lupa');
    t.ed.ends('<>', 'e');
    expect(t.board.e[0].p).toBe('<>');
    t.ed.ends(null, 'e');
    expect(t.board.e[0].p).toBeUndefined();
    t.ed.selectedEdge.set('e');
    t.ed.paint('amarelo');
    expect(t.board.e[0].c).toBe('amarelo');
    t.ed.removeSelected();
    expect(t.board.e.length).toBe(0);
    expect(t.board.n.length).toBe(2);
  });

  it('apagar leva as setas das peças; as setas do teclado andam um furo', () => {
    const t = setup(board([note('a', 0, 0), note('b', 600, 0)], [{ i: 'e', a: 'a', b: 'b' }]));
    t.ed.select(['a']);
    t.ed.nudge(26, 0);
    expect(t.board.n[0].x).toBe(26);
    t.ed.removeSelected();
    expect(t.board.n.map((n) => n.i)).toEqual(['b']);
    expect(t.board.e).toEqual([]);
    expect(t.ed.selected().size).toBe(0);
  });

  it('o quadro cheio avisa e não põe a peça', () => {
    const many = Array.from({ length: 2000 }, (_, k) => note(`n${k}`, k * 10, 0, 8, 8));
    const t = setup(board(many));
    expect(t.ed.newNote({ x: 0, y: 0 })).toBeNull();
    expect(t.said).toEqual(['Este quadro chegou a 2.000 peças.']);
  });

  it('o agrupamento (Ctrl+G) seleciona as peças juntas', () => {
    const t = setup(board([{ ...note('a', 0, 0), g: 'gg' }, { ...note('b', 300, 0), g: 'gg' }, note('c', 600, 0)]));
    t.click(10, 10);
    expect([...t.ed.selected()].sort()).toEqual(['a', 'b']);
  });

  it('clicar fora do texto guarda o que foi escrito (antes, o clique apagava); o Esc desiste', () => {
    const t = setup(board([note('a', 0, 0), note('b', 600, 0)]));
    t.ed.writing.set({ kind: 'bilhete', id: 'a' });
    t.ed.draft = { writing: { kind: 'bilhete', id: 'a' }, text: 'Senha da porta' };
    t.click(1000, 1000);
    expect(t.ed.writing()).toBeNull();
    expect(t.board.n.find((n) => n.i === 'a')?.['txt']).toBe('Senha da porta');
    // o Esc: o que estava no campo não fica
    t.ed.writing.set({ kind: 'bilhete', id: 'a' });
    t.ed.draft = { writing: { kind: 'bilhete', id: 'a' }, text: 'outra coisa' };
    t.ed.cancelWriting({ kind: 'bilhete', id: 'a' });
    expect(t.ed.writing()).toBeNull();
    expect(t.board.n.find((n) => n.i === 'a')?.['txt']).toBe('Senha da porta');
    // o título da moldura e o rótulo da seta também ficam com o clique fora
    t.ed.writing.set({ kind: 'bilhete', id: 'b' });
    t.ed.draft = { writing: { kind: 'bilhete', id: 'b' }, text: 'b2' };
    t.ed.down({ x: 700, y: 30 }, { shift: false, ctrl: false });
    expect(t.board.n.find((n) => n.i === 'b')?.['txt']).toBe('b2');
  });

  it('o texto novo que ficou vazio sai no Esc e no clique fora, sem passo a mais no desfazer', () => {
    const t = setup(board([]));
    const n = t.ed.newNote({ x: 100, y: 100 })!;
    t.ed.cancelWriting({ kind: 'bilhete', id: n.i });
    expect(t.board.n.length).toBe(0);
    expect(t.ed.canUndo()).toBeFalse();
    const m = t.ed.newNote({ x: 100, y: 100 })!;
    t.click(900, 900);
    expect(t.board.n.some((x) => x.i === m.i)).toBeFalse();
  });

  it('o card cresce até a altura que o texto pede, medida nele (em furos), e nunca encolhe sozinho', () => {
    const t = setup(board([note('a', 0, 0, 208, 104)]));
    t.ed.writing.set({ kind: 'bilhete', id: 'a' });
    t.ed.write({ kind: 'bilhete', id: 'a' }, 'um\ndois\ntrês\nquatro\ncinco', 220);
    expect(t.board.n[0].h).toBe(234);
    t.ed.writing.set({ kind: 'bilhete', id: 'a' });
    t.ed.write({ kind: 'bilhete', id: 'a' }, 'um', 40);
    expect(t.board.n[0].h).toBe(234);
  });

  it('a cor do card: a palavra no kc, e a cartolina de antes dos cards sai; a cor da moldura no texto junto vira a do card', () => {
    const t = setup(board([{ ...note('a', 0, 0), c: 'verde' }, frame('m', 0, 300, 400, 300)]));
    t.ed.select(['a']);
    t.ed.paintCard('azul');
    expect(t.board.n[0]).toEqual(jasmine.objectContaining({ kc: 'azul' }));
    expect(t.board.n[0].c).toBeUndefined();
    t.ed.select(['a', 'm']);
    t.ed.paint('lilas');
    expect(t.board.n.find((n) => n.i === 'a')).toEqual(jasmine.objectContaining({ kc: 'lilas' }));
    expect(t.board.n.find((n) => n.i === 'm')?.c).toBe('lilas');
    // o branco não é cor de card: o texto volta à do jeito
    t.ed.paint('branco');
    expect(t.board.n.find((n) => n.i === 'a')?.['kc']).toBeUndefined();
  });

  it('a seta liga soltando rente à peça, um pouco fora dela (antes, só em cima)', () => {
    const t = setup(board([note('a', 0, 0), note('b', 400, 0)]));
    t.drag([208 + 22, 52], [392, 52], undefined, { dot: { id: 'a', side: 'r' } });
    expect(t.board.e.length).toBe(1);
    expect(t.board.e[0]).toEqual(jasmine.objectContaining({ a: 'a', b: 'b' }));
    expect(t.dropped.length).toBe(0);
  });

  it('as bolinhas da peça não somem no caminho até elas (fora da borda); outra peça debaixo do ponteiro troca', () => {
    const t = setup(board([note('a', 0, 0), note('b', 400, 0)]));
    t.ed.move({ x: 100, y: 52 }, { alt: false, shift: false });
    expect(t.ed.hover()).toBe('a');
    t.ed.move({ x: 208 + 22, y: 52 }, { alt: false, shift: false });
    expect(t.ed.hover()).toBe('a');
    t.ed.move({ x: 450, y: 52 }, { alt: false, shift: false });
    expect(t.ed.hover()).toBe('b');
    t.ed.move({ x: 2000, y: 2000 }, { alt: false, shift: false });
    expect(t.ed.hover()).toBeNull();
  });
});
