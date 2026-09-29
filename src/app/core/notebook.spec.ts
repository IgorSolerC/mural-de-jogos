import { PAPER_KINDS, ageOf, daysWaiting, notebookDate, pageFor } from './notebook';

describe('pageFor', () => {
  const ids = Array.from({ length: 300 }, (_, i) => `p${i.toString(36)}q`);

  it('é a mesma folha para o mesmo id, e há de todos os papéis', () => {
    expect(pageFor('abc')).toEqual(pageFor('abc'));
    expect(new Set(ids.map((id) => pageFor(id).kind)).size).toBe(PAPER_KINDS.length);
  });

  it('o post-it gruda sozinho, tem cor e a capa vai no clipe', () => {
    const postits = ids.map(pageFor).filter((p) => p.kind === 'postit');
    expect(postits.length).toBeGreaterThan(0);
    expect(postits.every((p) => p.hold === 'nada' && p.photo === 'clipe' && !!p.color)).toBeTrue();
    expect(ids.map(pageFor).filter((p) => p.kind !== 'postit').every((p) => p.hold !== 'nada' && p.color === null)).toBeTrue();
  });
});

describe('a folha com o tempo', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');

  it('conta os dias na fila', () => {
    expect(daysWaiting('2026-09-29T08:00:00Z', now)).toBe(0);
    expect(daysWaiting('2026-09-19T12:00:00Z', now)).toBe(10);
    expect(daysWaiting('lixo', now)).toBe(0);
  });

  it('amarela depois de uma semana e fica velha depois de um mês', () => {
    expect(ageOf(6)).toBe('nova');
    expect(ageOf(7)).toBe('amarelando');
    expect(ageOf(30)).toBe('amarelando');
    expect(ageOf(31)).toBe('velha');
  });

  it('escreve a data como no caderno, com o ano só quando não é este', () => {
    const today = new Date(2026, 8, 29);
    expect(notebookDate(new Date(2026, 8, 3, 10).toISOString(), today)).toBe('03/09');
    expect(notebookDate(new Date(2025, 11, 24, 10).toISOString(), today)).toBe('24/12/25');
  });
});
