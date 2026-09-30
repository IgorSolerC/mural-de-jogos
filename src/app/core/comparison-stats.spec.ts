import { commonReviews } from './comparison';
import { affinity, favouriteVerdict, finishRate, nameFromFile, portrait } from './comparison-stats';
import { Review, sanitizeReview } from './review';

function review(id: string, name: string, final: number, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    game: { name },
    scores: { final },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...extra,
  })!;
}

describe('caderno de perguntas', () => {
  it('conta cores, vereditos, status, bônus e quantidade de uma pessoa', () => {
    const list = [
      review('fichaa', 'Hades', 9, { stock: 'rosa', verdict: 'masterpiece', status: 'platinado', hoursPlayed: 40, bonuses: [{ id: 'trilha-sonora', label: 'Trilha sonora incrível', kind: 'favor' }] }),
      review('fichab', 'Celeste', 8, { stock: 'rosa', verdict: 'recomendo', status: 'finalizado', hoursPlayed: 12, bonuses: [{ id: 'trilha-sonora', label: 'Trilha sonora incrível', kind: 'favor' }] }),
      review('fichac', 'Balatro', 6, { stock: 'azul', verdict: 'recomendo', status: 'incompleto', hoursPlayed: null }),
      review('fichad', 'Inside', 7, { stock: 'verde', verdict: null }),
    ];
    const p = portrait(list);
    expect(p.count).toBe(4);
    expect(p.average).toBe(7.5);
    expect(p.top.map((r) => r.id)).toEqual(['fichaa', 'fichab', 'fichad']);
    expect(p.stocks[0]).toEqual({ value: 'rosa', n: 2 });
    expect(favouriteVerdict(p)).toEqual({ value: 'recomendo', n: 2 });
    expect(p.noVerdict).toBe(1);
    expect(finishRate(p)).toBe(75);
    expect(p.bonus.favor?.n).toBe(2);
    expect(p.bonus.contra).toBeNull();
    expect(p.amount).toBe(52);
    expect(p.longest?.id).toBe('fichaa');
  });

  it('conta a cor do rodízio nas fichas antigas sem cartolina', () => {
    expect(portrait([review('sem-cor', 'Doom', 7)]).stocks.length).toBe(1);
  });

  it('mede a sintonia pela distância média das notas em comum', () => {
    const pairs = commonReviews(
      [review('minha1', 'Hades', 10), review('minha2', 'Celeste', 8), review('minha3', 'Inside', 6)],
      [review('outra1', 'Hades', 6), review('outra2', 'Celeste', 8), review('outra3', 'Inside', 6.5)],
    );
    const a = affinity(pairs)!;
    expect(a.distance).toBeCloseTo(1.5, 5);
    expect(a.percent).toBe(70);
    expect(a.agree).toBe(2);
    expect(a.fight?.mine.game.name).toBe('Hades');
    expect(a.harmony?.mine.game.name).toBe('Celeste');
    expect(affinity([])).toBeNull();
  });

  it('tira o nome do colega do nome do arquivo quando dá', () => {
    expect(nameFromFile('backup-da-marina.json.gz')).toBe('Marina');
    expect(nameFromFile('joao_pedro.json')).toBe('Joao Pedro');
    expect(nameFromFile('meu-mural-backup-2026-09-29.json.gz')).toBe('');
    expect(nameFromFile('meu-mural (3).json')).toBe('');
  });
});
