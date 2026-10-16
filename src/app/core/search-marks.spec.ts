import { fold } from './review';
import { foundSpans } from './search-marks';

describe('foundSpans', () => {
  const pieces = (text: string, q: string) => foundSpans(text, fold(q)).map(([s, e]) => text.slice(s, e));

  it('acha sem acento nem caixa, e devolve o pedaço como está escrito', () => {
    expect(pieces('Coração de Leão', 'coracao')).toEqual(['Coração']);
    expect(pieces('ZELDA e zelda', 'Zelda')).toEqual(['ZELDA', 'zelda']);
  });

  it('acha todas as vezes, sem sobrepor', () => {
    expect(foundSpans('aaaa', 'aa')).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it('o acento solto (NFD) fica com a letra', () => {
    const nfd = 'café bom';
    expect(pieces(nfd, 'cafe')).toEqual(['café']);
  });

  it('não se perde depois de um emoji (dois pedaços de UTF-16)', () => {
    expect(pieces('🎮 Mario', 'mario')).toEqual(['Mario']);
  });

  it('sem busca ou sem texto, nada', () => {
    expect(foundSpans('Zelda', '')).toEqual([]);
    expect(foundSpans('', 'zelda')).toEqual([]);
  });
});
