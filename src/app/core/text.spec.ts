import { fold, nameCollator } from './text';
import { fold as foldFromReview } from './review';

describe('text', () => {
  it('fold tira o acento e a caixa, sem mexer nos espaços', () => {
    expect(fold('  Ação É Pão ')).toBe('  acao e pao ');
    expect(fold('Pokémon')).toBe('pokemon');
  });

  it('review.ts continua dando o mesmo fold', () => {
    expect(foldFromReview).toBe(fold);
  });

  it('nameCollator ignora caixa e acento e põe os números na ordem deles', () => {
    expect(nameCollator.compare('éden', 'Eden')).toBe(0);
    expect(['Jogo 10', 'jogo 2', 'Ábaco'].sort(nameCollator.compare)).toEqual(['Ábaco', 'jogo 2', 'Jogo 10']);
  });

  it('nameCollator ordena igual ao localeCompare com as mesmas opções (como as listas faziam)', () => {
    const names = ['Zelda', 'ação', 'Ação 2', 'Ação 10', 'Órbita', 'outro', 'Ünder', '1984', 'é'];
    const before = [...names].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true }));
    expect([...names].sort(nameCollator.compare)).toEqual(before);
  });
});
