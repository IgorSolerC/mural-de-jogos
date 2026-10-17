import { cap, cleanLabel, fold, labelKey, nameCollator, nameKey, slugOf } from './text';
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

  it('labelKey é o fold sem as pontas', () => {
    expect(labelKey('  Estudos ')).toBe('estudos');
    expect(labelKey('Ação  Já')).toBe('acao  ja');
  });

  it('nameKey junta os espaços de dentro', () => {
    expect(nameKey('  A   Obra	Prima ')).toBe('a obra prima');
  });

  it('slugOf faz o pedaço de id que bônus e categorias já usavam', () => {
    expect(slugOf('Muitos inimigos!')).toBe('muitos-inimigos');
    expect(slugOf('  --Ação & Reação--  ')).toBe('acao-reacao');
    expect(slugOf('!!!')).toBe('');
    expect(slugOf('a'.repeat(60)).length).toBe(48);
  });

  it('cap e cleanLabel', () => {
    expect(cap('séries')).toBe('Séries');
    expect(cap('')).toBe('');
    expect(cleanLabel('  lista   de compras ', 32)).toBe('Lista de compras');
    expect(cleanLabel('abc def', 4)).toBe('Abc');
  });
});
