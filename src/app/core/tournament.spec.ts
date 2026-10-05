import { MIN_GAP, agreement, drawEntrants, ensureDraws, entrantsFor, makeBracket, pairUp, playOut, podium } from './tournament';

/** Um sorteio previsível. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Joga até o fim escolhendo sempre a de menor id (ou a primeira). */
function playAll(slots: (string | null)[], prefer = (a: string, b: string) => (a < b ? a : b)): string[] {
  const picks: string[] = [];
  for (let out = playOut(slots, picks); out.current; out = playOut(slots, picks)) {
    picks.push(prefer(out.current.a, out.current.b));
  }
  return picks;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `f${String(i).padStart(3, '0')}`);

describe('mata-mata', () => {
  it('cada opção é o número de duelos: fichas = duelos + 1', () => {
    expect(entrantsFor(5, 40)).toBe(6);
    expect(entrantsFor(15, 40)).toBe(16);
    expect(entrantsFor(30, 40)).toBe(31);
    expect(entrantsFor('todos', 40)).toBe(40);
    expect(entrantsFor(30, 30)).toBe(0); // faltou uma ficha
    expect(entrantsFor('todos', 1)).toBe(0);
  });

  for (const n of [2, 3, 6, 7, 16, 31, 33, 100]) {
    it(`${n} fichas: ${n - 1} duelos e uma campeã`, () => {
      const slots = makeBracket(ids(n), seeded(n));
      const picks = playAll(slots);
      expect(picks.length).toBe(n - 1);
      const out = playOut(slots, picks);
      expect(out.total).toBe(n - 1);
      expect(out.played).toBe(n - 1);
      expect(out.current).toBeNull();
      expect(out.champion).toBe('f000'); // a de menor id ganha todos os duelos dela
    });
  }

  it('as folgas nunca caem juntas e cada ficha aparece uma vez', () => {
    const slots = makeBracket(ids(6), seeded(3));
    expect(slots.length).toBe(8);
    expect(slots.filter((s) => s === null).length).toBe(2);
    for (let i = 0; i < slots.length; i += 2) expect(slots[i] !== null || slots[i + 1] !== null).toBeTrue();
    expect(new Set(slots.filter((s) => s !== null)).size).toBe(6);
  });

  it('dá nome às rodadas e desfaz tirando a última escolha', () => {
    const slots = makeBracket(ids(16), seeded(9));
    let out = playOut(slots, []);
    expect(out.rounds[0].name).toBe('Oitavas de final');
    expect(out.current!.number).toBe(1);
    const picks = playAll(slots);
    out = playOut(slots, picks.slice(0, 8));
    expect(out.rounds[out.current!.round].name).toBe('Quartas de final');
    expect(out.current!.number).toBe(9);
    out = playOut(slots, picks.slice(0, 14));
    expect(out.rounds[out.current!.round].name).toBe('Final');
  });

  it('o pódio tem a campeã, a vice e as duas da semifinal', () => {
    const slots = makeBracket(ids(8), seeded(1));
    const out = playOut(slots, playAll(slots));
    const p = podium(out)!;
    expect(p.champion).toBe('f000');
    expect(p.runnerUp).not.toBeNull();
    expect(p.semifinal.length).toBe(2);
    expect(new Set([p.champion, p.runnerUp, ...p.semifinal]).size).toBe(4);
  });

  it('conta em quantos duelos a escolhida tinha a nota maior', () => {
    const slots = makeBracket(ids(4), seeded(2));
    const score = (id: string) => 10 - Number(id.slice(1)); // f000 tem a maior nota
    const out = playOut(slots, playAll(slots));
    expect(agreement(out, score)).toEqual({ same: 3, counted: 3 });
    const contra = playOut(slots, playAll(slots, (a, b) => (a > b ? a : b)));
    expect(agreement(contra, score)).toEqual({ same: 0, counted: 3 });
  });

  it('sorteia sem repetir', () => {
    const got = drawEntrants(ids(50), 16, seeded(5));
    expect(got.length).toBe(16);
    expect(new Set(got).size).toBe(16);
  });

  describe('duelos com distância de nota', () => {
    /** Notas bem espalhadas: f000 = 10, f001 = 9,7… (0,3 entre uma e a seguinte). */
    const spread = (id: string) => 10 - Number(id.slice(1)) * 0.3;
    const gapOf = (a: string, b: string, score: (id: string) => number) => Math.abs(score(a) - score(b));

    /** Joga até o fim com os sorteios de rodada, escolhendo pelo `prefer`; devolve cada rodada jogada. */
    function playDrawn(slots: (string | null)[], score: (id: string) => number, rng: () => number, prefer: (a: string, b: string) => string) {
      const picks: string[] = [];
      let draws = ensureDraws(slots, picks, [], score, rng);
      for (let out = playOut(slots, picks, draws); out.current; out = playOut(slots, picks, draws)) {
        picks.push(prefer(out.current.a, out.current.b));
        draws = ensureDraws(slots, picks, draws, score, rng);
      }
      return playOut(slots, picks, draws);
    }

    /** O melhor que dá para o duelo mais apertado: em ordem, a 1ª com a do meio. */
    const bestWorst = (ids: string[], score: (id: string) => number) => {
      const r = [...ids].sort((a, b) => score(b) - score(a));
      const h = r.length / 2;
      return Math.min(...r.slice(0, h).map((a, i) => gapOf(a, r[h + i], score)));
    };

    for (const n of [6, 16, 31, 40]) {
      it(`${n} fichas: todo duelo de toda rodada tem 2 pontos de distância quando dá, e o mais longe possível quando não`, () => {
        for (let seed = 1; seed <= 15; seed++) {
          const rng = seeded(seed);
          const slots = makeBracket(ids(n), rng, spread);
          // escolhas ao acaso: a chave tem de se virar com qualquer resultado
          const coin = seeded(seed * 7);
          const out = playDrawn(slots, spread, rng, (a, b) => (coin() < 0.5 ? a : b));
          expect(out.champion).not.toBeNull();
          expect(out.played).toBe(n - 1);
          for (const round of out.rounds) {
            const duels = round.matches.filter((m) => m.b !== null);
            const entrants = duels.flatMap((m) => [m.a, m.b!]);
            const target = Math.min(MIN_GAP, bestWorst(entrants, spread));
            for (const m of duels) expect(gapOf(m.a, m.b!, spread)).toBeGreaterThanOrEqual(target - 1e-9);
          }
        }
      });
    }

    it('quem passa direto são as de nota mais alta', () => {
      for (const [n, byes] of [[6, 2], [11, 5], [21, 11], [40, 24]]) {
        for (let seed = 1; seed <= 10; seed++) {
          const slots = makeBracket(ids(n), seeded(seed), spread);
          const passed: string[] = [];
          for (let i = 0; i < slots.length; i += 2) if (slots[i] === null || slots[i + 1] === null) passed.push((slots[i] ?? slots[i + 1])!);
          expect(passed.sort()).toEqual(ids(byes));
        }
      }
    });

    it('com as notas todas perto, fica o emparelhamento de maior distância possível', () => {
      // seis notas entre 7 e 8: nenhum duelo chega a 2 pontos
      const close: Record<string, number> = { f000: 8, f001: 7.9, f002: 7.6, f003: 7.5, f004: 7.1, f005: 7 };
      const score = (id: string) => close[id];
      const order = pairUp(ids(6), score, seeded(3));
      const pairs = [0, 2, 4].map((i) => gapOf(order[i], order[i + 1], score));
      expect(Math.min(...pairs)).toBeCloseTo(0.5, 5); // 8–7,5, 7,9–7,1 e 7,6–7
    });

    it('o sorteio muda de uma partida para outra', () => {
      const a = pairUp(ids(16), spread, seeded(1)).join();
      const b = pairUp(ids(16), spread, seeded(2)).join();
      expect(a).not.toBe(b);
    });

    it('um Desfazer que muda quem passou refaz o sorteio da rodada seguinte', () => {
      const rng = seeded(4);
      const slots = makeBracket(ids(4), rng, spread);
      const first = playOut(slots, []).current!;
      const second = playOut(slots, [first.a]).current!;
      const picks = [first.a, second.a];
      const draws = ensureDraws(slots, picks, [], spread, rng);
      expect(draws[1]!.slice().sort()).toEqual([first.a, second.a].sort());
      // desfaz e escolhe a outra: o sorteio antigo não serve mais e é refeito
      const redo = ensureDraws(slots, [first.a, second.b], draws, spread, rng);
      expect(redo[1]!.slice().sort()).toEqual([first.a, second.b].sort());
    });

    it('"Todos" num mural grande sorteia rápido', () => {
      const score = (id: string) => (Number(id.slice(1)) * 7919) % 101 / 10; // notas de 0 a 10, embaralhadas
      const t0 = performance.now();
      const slots = makeBracket(ids(400), seeded(9), score);
      ensureDraws(slots, [], [], score, seeded(9));
      const order = pairUp(ids(400).slice(0, 256), score, seeded(9));
      expect(order.length).toBe(256);
      expect(performance.now() - t0).toBeLessThan(1500);
    });

    it('a final é jogada de verdade, mesmo sem distância', () => {
      const score = () => 8;
      const slots = makeBracket(ids(2), seeded(1), score);
      const out = playDrawn(slots, score, seeded(1), (a) => a);
      expect(out.champion).not.toBeNull();
    });
  });
});
