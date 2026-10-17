import { KanbanBoard, KanbanCard, sanitizeBoard, sanitizeKanban, sortAllColumns, updateColumn } from './kanban';
import { SortNote, SortRule, sameSort, sanitizeSort, sortCards, sortComparator, sortSentence, sortShort, tieRange } from './kanban-sort';

/** A ordem das colunas do Kanban: os critérios, os sentidos, o fim de quem não tem o valor, o desempate e a frase. */

const notes: Record<string, SortNote> = {
  a: { game: { name: 'Banana' }, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-10T10:00:00.000Z', tags: ['Feature'], text: '- [ ] um\n- [x] dois' },
  b: { game: { name: 'abacate' }, createdAt: '2026-10-03T10:00:00.000Z', updatedAt: '2026-10-05T10:00:00.000Z', tags: ['bugfix', 'Zebra'], text: '' },
  c: { game: { name: 'Caju 10' }, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z', text: '- [ ] um\n- [ ] dois\n- [ ] três' },
  d: { game: { name: 'Caju 9' }, createdAt: '2026-10-04T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', tags: ['Bugfix'], text: '- [x] feito' },
};
const card = (note: string, importance: KanbanCard['importance'] = null): KanbanCard => ({ note, column: 'c1', importance });
const cards = [card('a', 'medio'), card('b', 'critico'), card('c'), card('d', 'medio')];
const noteOf = (id: string) => notes[id];
const order = (rules: SortRule[], list = cards) => sortCards(list, rules, noteOf).map((c) => c.note);

describe('ordem das colunas do Kanban', () => {
  it('sem regra, a ordem em que vieram (a de arrastar)', () => {
    expect(order([])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('importância: crítico primeiro, e as sem importância no fim nos dois sentidos; o empate fica na ordem de antes', () => {
    expect(order([{ by: 'importancia' }])).toEqual(['b', 'a', 'd', 'c']);
    expect(order([{ by: 'importancia', reverse: true }])).toEqual(['a', 'd', 'b', 'c']);
  });

  it('criação e alteração: a mais nova primeiro, ou a mais antiga', () => {
    expect(order([{ by: 'criacao' }])).toEqual(['d', 'b', 'c', 'a']);
    expect(order([{ by: 'criacao', reverse: true }])).toEqual(['a', 'c', 'b', 'd']);
    expect(order([{ by: 'alteracao' }])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('título: de A a Z sem caixa nem acento, com os números na ordem dos números', () => {
    expect(order([{ by: 'titulo' }])).toEqual(['b', 'a', 'd', 'c']);
    expect(order([{ by: 'titulo', reverse: true }])).toEqual(['c', 'd', 'a', 'b']);
  });

  it('tag: pela primeira tag em ordem alfabética, sem caixa; as sem tag no fim nos dois sentidos', () => {
    // b (bugfix, zebra) e d (bugfix) empatam na primeira; d tem menos tags e vem antes
    expect(order([{ by: 'tag' }])).toEqual(['d', 'b', 'a', 'c']);
    expect(order([{ by: 'tag', reverse: true }])).toEqual(['a', 'b', 'd', 'c']);
  });

  it('tarefas: mais por fazer primeiro; as sem tarefa no fim; a com todas feitas conta zero', () => {
    expect(order([{ by: 'tarefas' }])).toEqual(['c', 'a', 'd', 'b']);
    expect(order([{ by: 'tarefas', reverse: true }])).toEqual(['d', 'a', 'c', 'b']);
  });

  it('a segunda regra desempata a primeira ("por importância e tag")', () => {
    expect(order([{ by: 'importancia' }, { by: 'tag' }])).toEqual(['b', 'd', 'a', 'c']);
    expect(order([{ by: 'importancia' }, { by: 'titulo', reverse: true }])).toEqual(['b', 'd', 'a', 'c']);
    expect(order([{ by: 'importancia' }, { by: 'criacao', reverse: true }])).toEqual(['b', 'a', 'd', 'c']);
  });

  it('uma anotação que sumiu vai para o fim', () => {
    expect(order([{ by: 'titulo' }], [card('x'), ...cards])).toEqual(['b', 'a', 'd', 'c', 'x']);
  });

  it('o lugar onde uma anotação pode cair numa coluna em ordem: só entre as empatadas com ela', () => {
    const sorted = sortCards([card('b', 'critico'), card('a', 'medio'), card('c')], [{ by: 'importancia' }], noteOf);
    expect(tieRange(sorted, card('d', 'medio'), [{ by: 'importancia' }], noteOf)).toEqual([1, 2]);
    expect(tieRange(sorted, card('d', 'baixo'), [{ by: 'importancia' }], noteOf)).toEqual([2, 2]);
    expect(tieRange(sorted, card('d'), [{ by: 'importancia' }], noteOf)).toEqual([2, 3]);
    expect(tieRange(sorted, card('d'), [], noteOf)).toEqual([0, 3]);
    expect(sortComparator([{ by: 'importancia' }], noteOf)(card('a', 'medio'), card('d', 'medio'))).toBe(0);
  });

  it('guarda só critérios conhecidos, sem repetir, no máximo dois', () => {
    expect(sanitizeSort(null)).toEqual([]);
    expect(sanitizeSort([{ by: 'titulo', reverse: true }, { by: 'nada' }, { by: 'titulo' }, { by: 'tag', reverse: 'sim' }, { by: 'criacao' }])).toEqual([
      { by: 'titulo', reverse: true },
      { by: 'tag' },
    ]);
  });

  it('a frase e o resumo do cabeçalho', () => {
    expect(sortShort([])).toBe('');
    expect(sortShort([{ by: 'importancia' }, { by: 'tag' }])).toBe('Por importância e tag');
    expect(sortSentence([])).toBe('Na ordem em que você arrastar as anotações.');
    expect(sortSentence([{ by: 'importancia' }, { by: 'tag', reverse: true }])).toBe(
      'Por importância, crítico primeiro (as sem importância no fim). No empate, por tag, de Z a A (as sem tag no fim). Se ainda empatar, vale a ordem em que você arrastou.',
    );
    expect(sortSentence([{ by: 'criacao', reverse: true }])).toBe('Por data de criação, mais antiga primeiro. Se ainda empatar, vale a ordem em que você arrastou.');
    expect(sameSort(undefined, [])).toBeTrue();
    expect(sameSort([{ by: 'tag' }], [{ by: 'tag', reverse: true }])).toBeFalse();
  });

  describe('no quadro', () => {
    const T0 = '2026-10-16T10:00:00.000Z';
    const T1 = '2026-10-17T10:00:00.000Z';
    const raw = {
      category: 'trabalho',
      at: T0,
      columns: [
        { id: 'c1', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false, sort: [{ by: 'importancia' }, { by: 'tag', reverse: true }] },
        { id: 'c2', name: 'Feito', icon: 'check', color: 'verde', finishes: true, sort: [] },
      ],
      cards: [],
    };

    it('a ordem vai junto com a coluna guardada e da nuvem; à mão, a coluna fica sem o campo', () => {
      const b = sanitizeBoard(raw)!;
      expect(b.columns[0].sort).toEqual([{ by: 'importancia' }, { by: 'tag', reverse: true }]);
      expect('sort' in b.columns[1]).toBeFalse();
      expect(sanitizeKanban({ boards: [raw] }).boards[0].columns[0].sort?.length).toBe(2);
      const manual = updateColumn(b, 'c1', { sort: [] }, T1);
      expect('sort' in manual.columns[0]).toBeFalse();
      expect(manual.at).toBe(T1);
    });

    it('"Usar esta ordem nas outras colunas" leva a ordem a todas, e muda a hora do quadro', () => {
      const b: KanbanBoard = sanitizeBoard(raw)!;
      const all = sortAllColumns(b, [{ by: 'titulo' }], T1);
      expect(all.columns.map((c) => c.sort)).toEqual([[{ by: 'titulo' }], [{ by: 'titulo' }]]);
      expect(all.at).toBe(T1);
      expect(sortAllColumns(b, [], T1).columns.every((c) => !('sort' in c))).toBeTrue();
    });
  });
});
