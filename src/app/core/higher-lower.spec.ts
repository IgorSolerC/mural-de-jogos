import { isRight, measuresFor, pickNext, playable } from './higher-lower';
import { Review, sanitizeReview } from './review';

function review(id: string, final: number, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name: id, coverUrl: null, source: 'manual' },
    scores: { historia: final, diversao: final, jogabilidade: final, visual: final },
    finalOverride: final,
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2024-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('maior ou menor', () => {
  it('cada mural compara a média, as quatro notas e a quantidade quando tem', () => {
    expect(measuresFor('jogos').map((m) => m.key)).toEqual(['final', 'historia', 'diversao', 'jogabilidade', 'visual', 'quantidade']);
    expect(measuresFor('livros').at(-1)!.phrase).toBe('o número de páginas');
    expect(measuresFor('filmes').some((m) => m.key === 'quantidade')).toBeFalse();
  });

  it('empate vale como acerto', () => {
    expect(isRight(7, 8, 'maior')).toBeTrue();
    expect(isRight(7, 8, 'menor')).toBeFalse();
    expect(isRight(7, 6.5, 'menor')).toBeTrue();
    expect(isRight(7, 7, 'menor')).toBeTrue();
    expect(isRight(7, 7, 'maior')).toBeTrue();
  });

  it('a próxima é uma ficha ainda não vista e de valor diferente quando dá', () => {
    const m = measuresFor('jogos')[0];
    const pool = [review('raaaa1', 8), review('rbbbb1', 8), review('rcccc1', 6), review('rdddd1', 9)];
    const used = new Set(['raaaa1']);
    for (let i = 0; i < 20; i++) {
      const next = pickNext(pool, used, 8, m, Math.random)!;
      expect(['rcccc1', 'rdddd1']).toContain(next.id);
    }
    // só sobrou empate: vem o empate
    expect(pickNext(pool, new Set(['raaaa1', 'rcccc1', 'rdddd1']), 8, m, seq(0))!.id).toBe('rbbbb1');
    // acabou o mural
    expect(pickNext(pool, new Set(pool.map((r) => r.id)), 8, m)).toBeNull();
  });

  it('fichas sem o valor ficam de fora: sem horas, ou com a categoria "Não tem"', () => {
    const [, historia, , , , horas] = measuresFor('jogos');
    const pool = [review('raaaa1', 8, { hoursPlayed: 12 }), review('rbbbb1', 7, { weights: { historia: 'nao-tem' } })];
    expect(playable(pool, horas).map((r) => r.id)).toEqual(['raaaa1']);
    expect(playable(pool, historia).map((r) => r.id)).toEqual(['raaaa1']);
  });
});
