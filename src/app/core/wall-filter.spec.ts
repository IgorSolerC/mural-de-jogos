import { profileOf } from './kinds';
import { Review, sanitizeReview } from './review';
import { NO_FILTER, facetsOf, matchesFilter, toggleOption } from './wall-filter';

const note = (id: string, extra: Record<string, unknown>): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: id }, createdAt: '2026-10-01T10:00:00.000Z', ...extra })!,
  id,
});

describe('os filtros de categoria e de tag', () => {
  const notes = [
    note('n1', { category: 'Diário', tags: ['Bug'] }),
    note('n2', { category: 'diario', tags: ['bug'] }),
    note('n3', { category: 'Diário', tags: ['Feature'] }),
    note('n4', {}),
  ];
  const profile = profileOf('anotacoes');
  const options = (key: 'category' | 'tag', f = NO_FILTER) => facetsOf(notes, f, profile).find((x) => x.key === key)!.options;

  it('acento e maiúscula não separam: uma opção só, com a grafia mais usada, contando as duas', () => {
    expect(options('category').map((o) => [o.value, o.n])).toEqual([
      ['Diário', 3],
      ['sem', 1],
    ]);
    expect(options('tag').map((o) => [o.value, o.n])).toEqual([
      ['Bug', 2],
      ['Feature', 1],
      ['sem', 1],
    ]);
  });

  it('ligar uma grafia mostra as duas; tocar na outra grafia desliga', () => {
    const f = toggleOption(NO_FILTER, 'tag', 'bug');
    expect(notes.filter((r) => matchesFilter(r, f)).map((r) => r.id)).toEqual(['n1', 'n2']);
    expect(options('tag', f).find((o) => o.value === 'Bug')!.on).toBeTrue();
    expect(toggleOption(f, 'tag', 'BUG').tag).toEqual([]);
    const c = toggleOption(NO_FILTER, 'category', 'diario');
    expect(notes.filter((r) => matchesFilter(r, c)).map((r) => r.id)).toEqual(['n1', 'n2', 'n3']);
  });
});
