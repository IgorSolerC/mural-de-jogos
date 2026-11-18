import { duelPieces, friendsPreview, knockoutPreview, muraldlePreview, podiumPreview, recordPreview, statsPreview } from './extras-previews';
import { DailyStats } from './muraldle-save';
import { Review } from './review';

/** As contas das prévias de Extras (PLANO-EXTRAS.md, D3). */

function review(id: string, name: string, final: number, extra: Partial<Review> = {}): Review {
  return {
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: final, diversao: final, jogabilidade: final, visual: final, final },
    status: 'finalizado',
    difficulty: 'media',
    verdict: null,
    weights: {},
    bonuses: [],
    hoursPlayed: 10,
    text: '',
    stock: 'amarelo',
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    completedAt: '2026-11-01',
    ...extra,
  } as unknown as Review;
}

const stats = (streak = 0): DailyStats => ({ played: 0, won: 0, streak, best: streak, lastWon: null, recent: [] });
const pool = [review('a', 'Hades', 9.4), review('b', 'Celeste', 8), review('c', 'Tunic', 7)];

describe('as prévias de Extras', () => {
  describe('o Muraldle', () => {
    it('sem fichas bastantes, diz que falta; sem o jogo de hoje, que a de hoje espera', () => {
      expect(muraldlePreview(pool.slice(0, 2), null, stats(), '2026-11-18').state).toBe('pouco');
      expect(muraldlePreview(pool, null, stats(3), '2026-11-18')).toEqual({ state: 'novo', guesses: 0, streak: 3, last: null });
      // o jogo guardado é de ontem: hoje ainda não começou
      const ontem = { day: '2026-11-17', secretId: 'a', guesses: ['b'], done: null };
      expect(muraldlePreview(pool, ontem, stats(), '2026-11-18').state).toBe('novo');
    });

    it('no meio do jogo, conta os chutes e dá as marcas do último (só as marcas)', () => {
      const p = muraldlePreview(pool, { day: '2026-11-18', secretId: 'a', guesses: ['b', 'c'], done: null }, stats(), '2026-11-18');
      expect(p.state).toBe('jogando');
      expect(p.guesses).toBe(2);
      expect(p.last!.length).toBeGreaterThan(5);
      expect(p.last!.every((m) => ['certo', 'perto', 'errado', 'desconhecido'].includes(m))).toBeTrue();
    });

    it('acertou e desistiu; um chute de ficha que saiu do mural não conta', () => {
      expect(muraldlePreview(pool, { day: 'd', secretId: 'a', guesses: ['b', 'a'], done: 'acertou' }, stats(), 'd').state).toBe('acertou');
      expect(muraldlePreview(pool, { day: 'd', secretId: 'a', guesses: ['b'], done: 'desistiu' }, stats(), 'd').state).toBe('desistiu');
      expect(muraldlePreview(pool, { day: 'd', secretId: 'a', guesses: ['sumiu', 'b'], done: null }, stats(), 'd').guesses).toBe(1);
    });
  });

  describe('o Mata-mata', () => {
    const names = (id: string) => ({ a: 'Hades', b: 'Celeste', c: 'Tunic', d: 'Inside' })[id];
    const four = [review('a', 'Hades', 9), review('b', 'Celeste', 8), review('c', 'Tunic', 7), review('d', 'Inside', 6)];

    it('sem torneio: comece um (ou falta ficha)', () => {
      expect(knockoutPreview(four, null, names).state).toBe('nenhum');
      expect(knockoutPreview([four[0]], null, names).state).toBe('pouco');
    });

    it('no meio: a rodada e o duelo da vez, de quantos', () => {
      const saved = { owner: 'eu', option: 'todos' as const, slots: ['a', 'b', 'c', 'd'], picks: ['a'], masked: true, startedAt: '' };
      const p = knockoutPreview(four, saved, names);
      expect(p.state).toBe('jogando');
      expect(p.round).toBe('Semifinal');
      expect(p.duel).toBe(2);
      expect(p.total).toBe(3);
      expect(p.played).toBe(1);
    });

    it('acabado: a campeã, pelo nome', () => {
      const saved = { owner: 'eu', option: 'todos' as const, slots: ['a', 'b'], picks: ['b'], masked: true, startedAt: '' };
      const p = knockoutPreview(four, saved, names);
      expect(p.state).toBe('acabou');
      expect(p.champion).toBe('Celeste');
    });
  });

  it('os tracinhos do torneio: um por duelo; num torneio grande, a proporção', () => {
    expect(duelPieces({ state: 'nenhum', played: 0, total: 0 })).toEqual([]);
    expect(duelPieces({ state: 'jogando', played: 2, total: 4 })).toEqual(['feito', 'feito', 'agora', 'falta']);
    expect(duelPieces({ state: 'acabou', played: 3, total: 3 })).toEqual(['feito', 'feito', 'feito']);
    const big = duelPieces({ state: 'jogando', played: 63, total: 127 }, 24);
    expect(big.length).toBe(24);
    expect(big.filter((d) => d === 'feito').length).toBe(11);
    expect(big[11]).toBe('agora');
  });

  it('o recorde do Maior ou menor é o maior entre as medidas, com o nome dela', () => {
    const recs: Record<string, number> = { final: 6, diversao: 11 };
    expect(recordPreview('jogos', pool, (m) => recs[m] ?? 0)).toEqual({ state: 'recorde', best: 11, measure: 'Diversão' });
    expect(recordPreview('jogos', pool, () => 0).state).toBe('nenhum');
    expect(recordPreview('jogos', [pool[0]], () => 9).state).toBe('pouco');
  });

  it('os números: o total, a média escrita e quantas fichas em cada nota inteira', () => {
    const s = statsPreview(pool);
    expect(s.count).toBe(3);
    expect(s.mean).toBe('8,1');
    expect(s.histogram.length).toBe(11);
    expect(s.histogram[9]).toBe(1);
    expect(s.histogram[8]).toBe(1);
    expect(s.histogram[7]).toBe(1);
    expect(statsPreview([]).mean).toBeNull();
  });

  it('o pódio: as três maiores médias, o empate pelo nome', () => {
    const list = [review('x', 'Zelda', 9), review('y', 'Abzu', 9), ...pool];
    expect(podiumPreview(list).map((r) => r.name)).toEqual(['Hades', 'Abzu', 'Zelda']);
    expect(podiumPreview(list)[0].score).toBe('9,4');
  });

  it('os amigos: o escolhido primeiro, com quanto combinam; sem obra em comum, sem número', () => {
    const bia = { id: 'bia', name: 'Bia', reviews: [review('b1', 'Hades', 9.4), review('b2', 'Celeste', 8)] };
    const leo = { id: 'leo', name: 'Léo', reviews: [review('l1', 'Outra coisa', 5)] };
    const out = friendsPreview(pool, [bia, leo], 'leo');
    expect(out.map((f) => f.id)).toEqual(['leo', 'bia']);
    expect(out[0].percent).toBeNull();
    expect(out[1].percent).toBe(100);
  });
});
