import { NO_FILTER, matchesFilter } from './wall-filter';
import { formatScore, sanitizeReview, scoreOf, shownFinal } from './review';
import { scoreDisplay } from './settings';

describe('o ajuste de como a nota aparece', () => {
  const review = (final: number) =>
    sanitizeReview({ game: { name: 'Teste' }, scores: { final }, finalOverride: final, status: 'finalizado' })!;

  afterEach(() => scoreDisplay.set('livre'));

  it('arredonda para a metade ou para o inteiro mais perto', () => {
    scoreDisplay.set('metade');
    expect([9.2, 8.4, 8.8, 7.75].map(formatScore)).toEqual(['9', '8,5', '9', '8']);
    scoreDisplay.set('inteiro');
    expect([8.4, 8.5, 7.9].map(formatScore)).toEqual(['8', '9', '8']);
    scoreDisplay.set('livre');
    expect([8.4, 7.9].map(formatScore)).toEqual(['8,4', '7,9']);
  });

  it('um 7,9 que aparece como 8 fica com os 8: no grupo, no filtro e na ordem', () => {
    const r = review(7.9);
    scoreDisplay.set('inteiro');
    expect(shownFinal(r)).toBe(8);
    expect(scoreOf(r.scores, 'final')).toBe(8);
    expect(matchesFilter(r, { ...NO_FILTER, grade: ['8'] })).toBeTrue();
    expect(matchesFilter(r, { ...NO_FILTER, grade: ['7'] })).toBeFalse();
    scoreDisplay.set('livre');
    expect(matchesFilter(r, { ...NO_FILTER, grade: ['7'] })).toBeTrue();
  });
});
