import { Friend, initialStock, orderFriends, parseFriends } from './friends';

const f = (codigo: string, nome = codigo): Friend => ({ codigo, nome, foto: null });

describe('parseFriends', () => {
  it('só passa o que tem a forma certa: código, nome e a foto que serve', () => {
    const list = parseFriends({
      amigos: [
        { codigo: 'k7qf m2xa', nome: ' Ana ', foto: { emoji: '🦊', cor: 'laranja-escuro' } },
        { codigo: 'ABCD-EFGH', nome: 'Bia', foto: { emoji: 'oi', cor: 'azul' } },
        { codigo: 'ABCD-EFGH', nome: 'Bia de novo' },
        { codigo: 'nada', nome: 'Caio' },
        { codigo: 'MNPQ-RSTV', nome: '' },
        null,
        'texto',
      ],
    });
    expect(list).toEqual([
      { codigo: 'K7QF-M2XA', nome: 'Ana', foto: { emoji: '🦊', cor: 'laranja-escuro' } },
      { codigo: 'ABCD-EFGH', nome: 'Bia', foto: null },
    ]);
  });

  it('o que não é lista vira lista vazia', () => {
    expect(parseFriends(null)).toEqual([]);
    expect(parseFriends({ amigos: 'x' })).toEqual([]);
  });
});

describe('orderFriends', () => {
  const list = [f('A'), f('B'), f('C'), f('D')];

  it('quem eu ainda não sigo primeiro, depois quem já sigo, e eu por último; a ordem da nuvem dentro de cada um', () => {
    expect(orderFriends(list, new Set(['A', 'C']), 'B').map((x) => x.codigo)).toEqual(['D', 'A', 'C', 'B']);
  });

  it('sem saber quem eu sigo, fica a ordem da nuvem', () => {
    expect(orderFriends(list, null, 'A').map((x) => x.codigo)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('initialStock', () => {
  it('a mesma cartolina clara para o mesmo código, nunca branca nem cinza', () => {
    expect(initialStock('K7QF-M2XA')).toBe(initialStock('K7QF-M2XA'));
    for (const code of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']) expect(['branco', 'cinza']).not.toContain(initialStock(code));
  });
});
