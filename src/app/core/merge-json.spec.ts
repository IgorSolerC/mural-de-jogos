import { mergeJson } from './merge-json';

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
});
