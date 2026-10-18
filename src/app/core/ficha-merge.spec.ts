import { mergeFicha } from './ficha-merge';
import { Review, sanitizeReview } from './review';

function review(patch: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'r1',
    kind: 'jogos',
    game: { name: 'Hades', coverUrl: null, source: 'manual' },
    scores: { historia: 7, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2026-01-01',
    text: 'linha um\nlinha dois\nlinha três',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  })!;
}

describe('mergeFicha (a junção de três vias de uma ficha da conta)', () => {
  it('campos diferentes mudados em dois aparelhos se juntam sem perguntar', () => {
    const o = review();
    const a = review({ game: { name: 'Hades II', coverUrl: null, source: 'manual' }, updatedAt: '2026-01-02T00:00:00.000Z' });
    const b = review({ scores: { historia: 9, diversao: 8, jogabilidade: 8, visual: 8 }, stock: 'azul', updatedAt: '2026-01-03T00:00:00.000Z' });
    const m = mergeFicha(o, a, b);
    expect(m.other).toBeNull();
    expect(m.parts).toEqual([]);
    expect(m.merged.game.name).toBe('Hades II');
    expect(m.merged.scores.historia).toBe(9);
    expect(m.merged.stock).toBe('azul');
  });

  it('o mesmo texto mudado em linhas diferentes se junta', () => {
    const m = mergeFicha(review(), review({ text: 'linha UM\nlinha dois\nlinha três' }), review({ text: 'linha um\nlinha dois\nlinha TRÊS' }));
    expect(m.other).toBeNull();
    expect(m.merged.text).toBe('linha UM\nlinha dois\nlinha TRÊS');
  });

  it('a mesma linha mudada dos dois lados é conflito, com as duas versões', () => {
    const m = mergeFicha(review(), review({ text: 'linha um\nlinha dois de lá\nlinha três' }), review({ text: 'linha um\nlinha dois daqui\nlinha três', stock: 'verde' }));
    expect(m.parts).toEqual(['texto']);
    expect(m.merged.text).toBe('linha um\nlinha dois de lá\nlinha três');
    expect(m.other!.text).toBe('linha um\nlinha dois daqui\nlinha três');
    // o que não brigou está nas duas
    expect(m.merged.stock).toBe('verde');
    expect(m.other!.stock).toBe('verde');
  });

  it('as tags juntam como conjunto e a nota de cada critério por si', () => {
    const note = (patch: Record<string, unknown>) =>
      review({ kind: 'anotacoes', game: { name: 'Lista', coverUrl: null, source: 'manual' }, tags: ['casa', 'urgente'], ...patch });
    const m = mergeFicha(note({}), note({ tags: ['casa', 'urgente', 'mercado'] }), note({ tags: ['casa'] }));
    expect(m.other).toBeNull();
    expect(m.merged.tags).toEqual(['casa', 'mercado']);
  });

  it('o título mudado de jeitos diferentes é conflito do título', () => {
    const m = mergeFicha(
      review(),
      review({ game: { name: 'Hades II', coverUrl: null, source: 'manual' } }),
      review({ game: { name: 'Hades: Edição Final', coverUrl: null, source: 'manual' } }),
    );
    expect(m.parts).toEqual(['titulo']);
    expect(m.merged.game.name).toBe('Hades II');
    expect(m.other!.game.name).toBe('Hades: Edição Final');
  });
});
