import { mergeJson } from './merge-json';
import { mergeFields } from './merge-parts';

describe('mergeJson (a junção de três vias de um valor qualquer)', () => {
  it('campos diferentes mudados dos dois lados entram os dois, sem conflito', () => {
    const m = mergeJson({ cor: 'azul', ordem: 'quantidade', fundo: 1 }, { cor: 'verde', ordem: 'quantidade', fundo: 1 }, { cor: 'azul', ordem: 'minha', fundo: 1 });
    expect(m.conflicts).toEqual([]);
    expect(m.a).toEqual({ cor: 'verde', ordem: 'minha', fundo: 1 });
    expect(m.b).toEqual(m.a);
  });

  it('o mesmo campo mudado de jeitos diferentes é conflito, com cada versão do seu jeito', () => {
    const m = mergeJson({ cor: 'azul', n: 1 }, { cor: 'verde', n: 1 }, { cor: 'rosa', n: 2 });
    expect(m.conflicts).toEqual([['cor']]);
    expect(m.a).toEqual({ cor: 'verde', n: 2 });
    expect(m.b).toEqual({ cor: 'rosa', n: 2 });
  });

  it('os dois mudando igual não briga', () => {
    expect(mergeJson({ x: 1 }, { x: 2 }, { x: 2 })).toEqual({ a: { x: 2 }, b: { x: 2 }, conflicts: [] });
  });

  it('um campo apagado num lado e não mexido no outro sai', () => {
    const m = mergeJson({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2, c: 3 });
    expect(m.a).toEqual({ a: 1, c: 3 });
    expect(m.conflicts).toEqual([]);
  });

  it('lista de coisas com id: item a item, e a ordem das duas', () => {
    const o = [
      { id: 'c1', nome: 'A fazer' },
      { id: 'c2', nome: 'Fazendo' },
      { id: 'c3', nome: 'Feito' },
    ];
    const a = [
      { id: 'c1', nome: 'Pra fazer' },
      { id: 'c2', nome: 'Fazendo' },
      { id: 'c3', nome: 'Feito' },
      { id: 'c4', nome: 'Arquivo' },
    ];
    const b = [
      { id: 'c1', nome: 'A fazer' },
      { id: 'c3', nome: 'Feito' },
    ];
    const m = mergeJson(o, a, b);
    expect(m.conflicts).toEqual([]);
    expect(m.a).toEqual([
      { id: 'c1', nome: 'Pra fazer' },
      { id: 'c3', nome: 'Feito' },
      { id: 'c4', nome: 'Arquivo' },
    ]);
  });

  it('um item apagado num lado e mudado no outro é conflito', () => {
    const m = mergeJson([{ note: 'n1', column: 'c1' }], [], [{ note: 'n1', column: 'c2' }]);
    expect(m.conflicts).toEqual([['n1']]);
    expect(m.a).toEqual([]);
    expect(m.b).toEqual([{ note: 'n1', column: 'c2' }]);
  });

  it('a mesma ficha movida para colunas diferentes é conflito na coluna dela', () => {
    const o = { cards: [{ note: 'n1', column: 'c1' }] };
    const m = mergeJson(o, { cards: [{ note: 'n1', column: 'c2' }] }, { cards: [{ note: 'n1', column: 'c3' }] });
    expect(m.conflicts).toEqual([['cards', 'n1', 'column']]);
  });

  it('textos sem repetição juntam como conjunto: o que um pôs fica, o que um tirou sai', () => {
    const m = mergeJson(['jogo', 'livro'], ['jogo', 'livro', 'filme'], ['livro', 'série']);
    expect(m.conflicts).toEqual([]);
    expect(m.a).toEqual(['livro', 'filme', 'série']);
  });

  it('uma lista com repetição vai inteira', () => {
    const m = mergeJson([1, 1], [1, 1, 2], [1, 1, 3]);
    expect(m.conflicts).toEqual([[]]);
    expect(m.a).toEqual([1, 1, 2]);
    expect(m.b).toEqual([1, 1, 3]);
  });

  it('a ordem das chaves não muda o resultado nem cria conflito', () => {
    const o = { a: { x: 1, y: [{ id: 'p', v: 1, w: 2 }] }, b: 2 };
    const one = { b: 2, a: { y: [{ w: 2, v: 5, id: 'p' }], x: 1 } };
    const two = { a: { x: 3, y: [{ id: 'p', w: 2, v: 1 }] }, b: 2 };
    const m = mergeJson(o, one, two);
    const n = mergeJson({ b: 2, a: { y: [{ w: 2, id: 'p', v: 1 }], x: 1 } }, two, one);
    expect(m.conflicts).toEqual([]);
    expect(n.conflicts).toEqual([]);
    expect(m.a).toEqual({ a: { x: 3, y: [{ id: 'p', v: 5, w: 2 }] }, b: 2 });
    expect(n.a).toEqual(m.a);
  });

  it('um lado sem o campo e o outro com null: fica o null, dos dois jeitos (os dois aparelhos chegam ao mesmo)', () => {
    expect(mergeJson({ n: 1 }, { n: 1, q: null }, { n: 2 }).a).toEqual({ n: 2, q: null });
    expect(mergeJson({ n: 1 }, { n: 2 }, { n: 1, q: null }).a).toEqual({ n: 2, q: null });
    expect(mergeFields<Record<string, unknown>>({ n: 1 }, { n: 2 }, { n: 1, q: null }, true)).toEqual({ n: 2, q: null });
    expect(mergeFields<Record<string, unknown>>({ n: 1 }, { n: 1, q: null }, { n: 2 }, true)).toEqual({ n: 2, q: null });
  });

  it('o que um lado apagou e o outro não mexeu não volta (campo e item de lista)', () => {
    const o = { tags: ['a', 'b'], cols: [{ id: 'x', n: 1 }, { id: 'y', n: 2 }], cor: 'azul' };
    const a = { tags: ['a'], cols: [{ id: 'y', n: 2 }] };
    const b = { tags: ['a', 'b', 'c'], cols: [{ id: 'x', n: 1 }, { id: 'y', n: 3 }], cor: 'azul' };
    const m = mergeJson(o, a, b);
    expect(m.conflicts).toEqual([]);
    expect(m.a).toEqual({ tags: ['a', 'c'], cols: [{ id: 'y', n: 3 }] });
    expect(mergeJson(o, b, a).a).toEqual(m.a);
  });
});
