import { Review, sanitizeReview } from './review';
import { franchisesOf, inYear, pearson, portraitLines, quantile, queueStats, wallStats, yearsIn } from './stats';
import { profileOf } from './kinds';

function review(id: string, name: string, final: number, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: `ficha-${id}`,
    game: { name },
    scores: { final },
    createdAt: '2024-01-01T12:00:00Z',
    updatedAt: '2024-01-01T12:00:00Z',
    ...extra,
  })!;
}

describe('estatísticas do mural', () => {
  it('faz as contas básicas: quantis e correlação', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
    expect(pearson([[1, 1], [2, 2], [3, 3], [4, 4]])).toBeCloseTo(1, 5);
    expect(pearson([[1, 4], [2, 3], [3, 2], [4, 1]])).toBeCloseTo(-1, 5);
    expect(pearson([[1, 1], [2, 2]])).toBeNull();
  });

  it('separa a Média por casa inteira, com o 11 só quando existe', () => {
    const s = wallStats([review('a', 'A', 7.9), review('b', 'B', 8), review('c', 'C', 8.4), review('d', 'D', 10)], 'jogos');
    expect(s.histogram.length).toBe(11);
    expect(s.histogram[7].n).toBe(1);
    expect(s.histogram[8].n).toBe(2);
    expect(s.histogram[10].n).toBe(1);
    expect(s.tens).toBe(1);
    expect(s.best?.review.id).toBe('ficha-d');
    expect(s.worst?.review.id).toBe('ficha-a');
    expect(wallStats([review('e', 'E', 10.5, { finalOverride: 10.5 })], 'jogos').histogram.length).toBe(12);
  });

  it('conta status, vereditos e o que não combina com o carimbo', () => {
    const s = wallStats(
      [
        review('a', 'A', 9.5, { verdict: 'masterpiece', status: 'platinado' }),
        review('b', 'B', 6, { verdict: 'masterpiece' }),
        review('c', 'C', 9, { verdict: 'chato', status: 'incompleto' }),
        review('d', 'D', 7, { verdict: null }),
      ],
      'jogos',
    );
    expect(s.finishRate).toBe(75);
    expect(s.noVerdict).toBe(1);
    expect(s.verdicts.find((v) => v.value === 'masterpiece')?.n).toBe(2);
    expect(s.incoherent.map((x) => [x.review.id, x.why])).toEqual([
      ['ficha-b', 'baixa'],
      ['ficha-c', 'alta'],
    ]);
  });

  it('monta a folhinha e o tempo pelas datas que existem, sem inventar mês', () => {
    const list = [
      review('a', 'A', 8, { completedAt: '2023-03-10' }),
      review('b', 'B', 7, { completedAt: '2023-03' }),
      review('c', 'C', 6, { completedAt: '2023' }),
      review('d', 'D', 9, { completedAt: '2025-01-02' }),
      review('e', 'E', 9, { completedAt: null }),
    ];
    const s = wallStats(list, 'jogos');
    expect(s.byYear.map((b) => [b.label, b.n])).toEqual([
      ['2023', 3],
      ['2024', 0],
      ['2025', 1],
    ]);
    const y2023 = s.calendar.find((r) => r.year === 2023)!;
    expect(y2023.months[2].n).toBe(2);
    expect(y2023.loose).toBe(1);
    expect(s.precision).toEqual({ dia: 2, mes: 1, ano: 1, sem: 1 });
    expect(s.longestGap?.days).toBe(664);
    expect(s.first?.id).toBe('ficha-c');
    expect(s.last?.id).toBe('ficha-d');
    expect(yearsIn(list)).toEqual([2025, 2023]);
    expect(inYear(list, 2023).length).toBe(3);
    expect(inYear(list, null).length).toBe(5);
  });

  it('acha franquias pelo nome-base e pelas duas primeiras palavras', () => {
    const f = franchisesOf([
      review('a', 'God of War', 8),
      review('b', 'God of War II', 9),
      review('c', 'God of War: Ragnarök', 10),
      review('d', 'Super Mario Odyssey', 9),
      review('e', 'Super Mario Galaxy', 9),
      review('f', 'Celeste', 9),
      review('g', 'The Last of Us', 9),
      review('h', 'The Last Guardian', 7),
    ]);
    expect(f.map((x) => [x.name, x.reviews.length])).toEqual([
      ['God of War', 3],
      ['Super Mario', 2],
    ]);
  });

  it('soma a quantidade e as palavras', () => {
    const s = wallStats(
      [
        review('a', 'A', 9, { hoursPlayed: 3, text: 'um dois três' }),
        review('b', 'B', 5, { hoursPlayed: 100, text: '' }),
      ],
      'jogos',
    );
    expect(s.amount?.total).toBe(103);
    expect(s.amount?.longest.review.id).toBe('ficha-b');
    expect(s.amount?.quickJoy?.review.id).toBe('ficha-a');
    expect(s.amount?.longSlog?.review.id).toBe('ficha-b');
    expect(s.text.words).toBe(3);
    expect(s.text.withText).toBe(1);
    expect(wallStats([review('c', 'C', 8)], 'filmes').amount).toBeNull();
  });

  it('só escreve o retrato com fichas suficientes', () => {
    const p = profileOf('jogos');
    expect(portraitLines(wallStats([review('a', 'A', 8)], 'jogos'), p, { you: true, name: 'Você' })).toEqual([]);
    const lines = portraitLines(
      wallStats([review('a', 'A', 9), review('b', 'B', 8.5), review('c', 'C', 8.8)], 'jogos'),
      p,
      { you: true, name: 'Você' },
    );
    expect(lines[0]).toContain('coração mole');
  });

  it('mede a fila e o ritmo do último ano', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    const reviews = Array.from({ length: 12 }, (_, i) => review(`r${i}`, `R${i}`, 7, { createdAt: `2026-0${(i % 9) + 1}-01T12:00:00Z` }));
    const q = queueStats(
      reviews,
      [{ id: 'd', kind: 'jogos', game: { name: 'X', source: 'manual', coverUrl: null }, createdAt: '2026-09-25T12:00:00Z', updatedAt: '2026-09-25T12:00:00Z' }],
      [
        { id: 'w1', kind: 'jogos', game: { name: 'Y', source: 'manual', coverUrl: null }, relevance: 'must', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
        { id: 'w2', kind: 'jogos', game: { name: 'Z', source: 'manual', coverUrl: null }, createdAt: '2025-02-01T00:00:00Z', updatedAt: '2025-02-01T00:00:00Z' },
      ],
      now,
    );
    expect(q.pace).toBe(1);
    expect(q.monthsToClear).toBe(2);
    expect(q.byRelevance).toEqual({ must: 1, comum: 1, later: 0 });
    expect(q.oldestDraft?.days).toBe(10);
  });
});
