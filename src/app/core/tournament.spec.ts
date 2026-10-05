import { agreement, drawEntrants, entrantsFor, makeBracket, playOut, podium, seedOrder } from './tournament';

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

  describe('cabeças de chave pela nota', () => {
    /** f000 tem a nota mais alta, f001 a seguinte… */
    const score = (id: string) => 100 - Number(id.slice(1));
    const best = (a: string, b: string) => (score(a) >= score(b) ? a : b);

    it('a ordem das cabeças de chave é a dos torneios', () => {
      expect(seedOrder(2)).toEqual([1, 2]);
      expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
      expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    });

    for (const n of [4, 6, 16, 31, 40]) {
      it(`${n} fichas: a de nota alta pega a de nota baixa, e as duas melhores só se cruzam na final`, () => {
        for (let seed = 1; seed <= 20; seed++) {
          const slots = makeBracket(ids(n), seeded(seed), score);
          let size = 2;
          while (size < n) size *= 2;
          // primeira rodada: cada duelo tem uma da metade de cima e uma da de baixo
          for (let i = 0; i < slots.length; i += 2) {
            const [a, b] = [slots[i], slots[i + 1]];
            if (a === null || b === null) {
              // as folgas ficam exatamente com as de nota mais alta
              expect(100 - score((a ?? b)!)).toBeLessThan(size - n);
              continue;
            }
            const rank = (id: string) => 100 - score(id); // 0 é a melhor
            expect(Math.min(rank(a), rank(b))).toBeLessThan(size / 2);
            expect(Math.max(rank(a), rank(b))).toBeGreaterThanOrEqual(size / 2);
          }
          // a melhor nota sempre passando: a final é entre as duas melhores, e as quatro melhores fazem as semis
          const out = playOut(slots, playAll(slots, best));
          const final = out.rounds.at(-1)!.matches[0];
          expect([final.a, final.b].sort()).toEqual(['f000', 'f001']);
          const semi = out.rounds.find((r) => r.size === 4)!.matches.flatMap((m) => [m.a, m.b]).sort();
          expect(semi).toEqual(['f000', 'f001', 'f002', 'f003']);
        }
      });
    }

    it('quem passa direto são as de nota mais alta, mesmo com a folga no meio de uma faixa', () => {
      // 6 fichas numa chave de 8: 2 folgas, para a 1ª e a 2ª; 11 fichas numa de 16: 5 folgas
      for (const [n, byes] of [[6, 2], [11, 5], [21, 11], [40, 24]]) {
        for (let seed = 1; seed <= 20; seed++) {
          const slots = makeBracket(ids(n), seeded(seed), score);
          const passed: string[] = [];
          for (let i = 0; i < slots.length; i += 2) if (slots[i] === null || slots[i + 1] === null) passed.push((slots[i] ?? slots[i + 1])!);
          expect(passed.sort()).toEqual(ids(byes));
        }
      }
    });

    it('a chave muda entre um sorteio e outro', () => {
      const a = makeBracket(ids(16), seeded(1), score).join();
      const b = makeBracket(ids(16), seeded(2), score).join();
      expect(a).not.toBe(b);
    });
  });
});
