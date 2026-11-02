import {
  DEFAULT_FSRS,
  FsrsConfig,
  Grade,
  Srs,
  SrsState,
  addStudyDays,
  dayStart,
  daysBetween,
  freshSrs,
  fuzzedInterval,
  initDifficulty,
  nextInterval,
  recallNow,
  retrievability,
  review,
  roundHalfEven,
  seededRandom,
  studyDay,
} from './fsrs';

type Row = [Grade, string, SrsState, number, number, number, string];

/**
 * A tabela de referência, tirada do py-fsrs (a biblioteca de referência do FSRS, `pip install fsrs`) com
 * o sorteio desligado: cada linha é a nota, quando foi respondida e como a carta ficou (estado, passo,
 * estabilidade, dificuldade e quando volta). Respondida sempre na hora em que vence.
 */
const PY_FSRS: { name: string; retention: number; steps: Row[] }[] = [
  {
    name: 'acerta sempre',
    retention: 0.9,
    steps: [
      [3, '2026-11-02T21:33:04.462396Z', 'aprendendo', 1, 2.3065, 2.118103970459016, '2026-11-02T21:43:04.462396Z'],
      [3, '2026-11-02T21:43:04.462396Z', 'revisao', 0, 2.3065, 2.111214235785395, '2026-11-04T21:43:04.462396Z'],
      [3, '2026-11-04T21:43:04.462396Z', 'revisao', 0, 10.971048263078135, 2.1043313908464483, '2026-11-15T21:43:04.462396Z'],
      [3, '2026-11-15T21:43:04.462396Z', 'revisao', 0, 46.316858440073425, 2.0974554287524403, '2026-12-31T21:43:04.462396Z'],
      [3, '2026-12-31T21:43:04.462396Z', 'revisao', 0, 162.99981577472244, 2.0905863426205262, '2027-06-12T21:43:04.462396Z'],
      [3, '2027-06-12T21:43:04.462396Z', 'revisao', 0, 497.8765551245907, 2.083724125574744, '2028-10-22T21:43:04.462396Z'],
    ],
  },
  {
    name: 'erra no começo',
    retention: 0.9,
    steps: [
      [1, '2026-11-02T21:33:04.463902Z', 'aprendendo', 0, 0.212, 6.4133, '2026-11-02T21:34:04.463902Z'],
      [1, '2026-11-02T21:34:04.463902Z', 'aprendendo', 0, 0.08335671711031604, 8.806304468856837, '2026-11-02T21:35:04.463902Z'],
      [3, '2026-11-02T21:35:04.463902Z', 'aprendendo', 1, 0.10314065007785231, 8.792726533684817, '2026-11-02T21:45:04.463902Z'],
      [3, '2026-11-02T21:45:04.463902Z', 'revisao', 0, 0.12584423732556518, 8.77916217644797, '2026-11-03T21:45:04.463902Z'],
      [3, '2026-11-03T21:45:04.463902Z', 'revisao', 0, 0.7789614697751799, 8.76561138356836, '2026-11-04T21:45:04.463902Z'],
      [3, '2026-11-04T21:45:04.463902Z', 'revisao', 0, 1.941503313108059, 8.752074141481629, '2026-11-06T21:45:04.463902Z'],
    ],
  },
  {
    name: 'lapso e reaprende',
    retention: 0.9,
    steps: [
      [3, '2026-11-02T21:33:04.465546Z', 'aprendendo', 1, 2.3065, 2.118103970459016, '2026-11-02T21:43:04.465546Z'],
      [3, '2026-11-02T21:43:04.465546Z', 'revisao', 0, 2.3065, 2.111214235785395, '2026-11-04T21:43:04.465546Z'],
      [3, '2026-11-04T21:43:04.465546Z', 'revisao', 0, 10.971048263078135, 2.1043313908464483, '2026-11-15T21:43:04.465546Z'],
      [3, '2026-11-15T21:43:04.465546Z', 'revisao', 0, 46.316858440073425, 2.0974554287524403, '2026-12-31T21:43:04.465546Z'],
      [1, '2026-12-31T21:43:04.465546Z', 'reaprendendo', 0, 2.9338452901880046, 7.387715706030851, '2026-12-31T21:53:04.465546Z'],
      [3, '2026-12-31T21:53:04.465546Z', 'revisao', 0, 2.9338452901880046, 7.375556359621658, '2027-01-03T21:53:04.465546Z'],
      [3, '2027-01-03T21:53:04.465546Z', 'revisao', 0, 7.799102228394648, 7.363409172558875, '2027-01-11T21:53:04.465546Z'],
      [3, '2027-01-11T21:53:04.465546Z', 'revisao', 0, 18.84991601950064, 7.351274132683154, '2027-01-30T21:53:04.465546Z'],
    ],
  },
  {
    name: 'quatro notas',
    retention: 0.9,
    steps: [
      [2, '2026-11-02T21:33:04.467297Z', 'aprendendo', 0, 1.2931, 5.112170705601056, '2026-11-02T21:38:34.467297Z'],
      [3, '2026-11-02T21:38:34.467297Z', 'aprendendo', 1, 1.3358997622047517, 5.102286904192293, '2026-11-02T21:48:34.467297Z'],
      [4, '2026-11-02T21:48:34.467297Z', 'revisao', 0, 2.369135290197524, 3.4509277903004603, '2026-11-04T21:48:34.467297Z'],
      [2, '2026-11-04T21:48:34.467297Z', 'revisao', 0, 6.805695822116345, 5.637649049733312, '2026-11-11T21:48:34.467297Z'],
      [3, '2026-11-11T21:48:34.467297Z', 'revisao', 0, 21.379712614703745, 5.6272397699804175, '2026-12-02T21:48:34.467297Z'],
      [1, '2026-12-02T21:48:34.467297Z', 'reaprendendo', 0, 1.9846042582165588, 8.547931816458965, '2026-12-02T21:58:34.467297Z'],
      [3, '2026-12-02T21:58:34.467297Z', 'revisao', 0, 1.993306710312427, 8.534612253939343, '2026-12-04T21:58:34.467297Z'],
      [4, '2026-12-04T21:58:34.467297Z', 'revisao', 0, 6.424327645683757, 8.030176325571675, '2026-12-10T21:58:34.467297Z'],
    ],
  },
  {
    name: 'fácil logo',
    retention: 0.9,
    steps: [
      [4, '2026-11-02T21:33:04.468949Z', 'revisao', 0, 8.2956, 1.0, '2026-11-10T21:33:04.468949Z'],
      [3, '2026-11-10T21:33:04.468949Z', 'revisao', 0, 38.90514998232684, 1.0, '2026-12-19T21:33:04.468949Z'],
      [3, '2026-12-19T21:33:04.468949Z', 'revisao', 0, 153.00006571733257, 1.0, '2027-05-21T21:33:04.468949Z'],
    ],
  },
  {
    name: 'retenção de 80%',
    retention: 0.8,
    steps: [
      [3, '2026-11-02T21:33:04.470507Z', 'aprendendo', 1, 2.3065, 2.118103970459016, '2026-11-02T21:43:04.470507Z'],
      [3, '2026-11-02T21:43:04.470507Z', 'revisao', 0, 2.3065, 2.111214235785395, '2026-11-10T21:43:04.470507Z'],
      [3, '2026-11-10T21:43:04.470507Z', 'revisao', 0, 22.784052475942136, 2.1043313908464483, '2027-01-25T21:43:04.470507Z'],
      [3, '2027-01-25T21:43:04.470507Z', 'revisao', 0, 158.3022479501867, 2.0974554287524403, '2028-07-03T21:43:04.470507Z'],
      [3, '2028-07-03T21:43:04.470507Z', 'revisao', 0, 838.5331867580056, 2.0905863426205262, '2036-02-13T21:43:04.470507Z'],
    ],
  },
  {
    name: 'retenção de 95%',
    retention: 0.95,
    steps: [
      [3, '2026-11-02T21:33:04.472087Z', 'aprendendo', 1, 2.3065, 2.118103970459016, '2026-11-02T21:43:04.472087Z'],
      [3, '2026-11-02T21:43:04.472087Z', 'revisao', 0, 2.3065, 2.111214235785395, '2026-11-03T21:43:04.472087Z'],
      [3, '2026-11-03T21:43:04.472087Z', 'revisao', 0, 7.319186097840142, 2.1043313908464483, '2026-11-06T21:43:04.472087Z'],
      [3, '2026-11-06T21:43:04.472087Z', 'revisao', 0, 19.846984845265304, 2.0974554287524403, '2026-11-14T21:43:04.472087Z'],
      [1, '2026-11-14T21:43:04.472087Z', 'reaprendendo', 0, 1.8814680569981856, 7.387715706030851, '2026-11-14T21:53:04.472087Z'],
      [3, '2026-11-14T21:53:04.472087Z', 'revisao', 0, 1.8963657827838125, 7.375556359621658, '2026-11-15T21:53:04.472087Z'],
      [3, '2026-11-15T21:53:04.472087Z', 'revisao', 0, 3.936699515319267, 7.363409172558875, '2026-11-17T21:53:04.472087Z'],
    ],
  },
];

describe('o FSRS-6 (core/fsrs.ts)', () => {
  describe('igual ao py-fsrs, passo a passo', () => {
    for (const c of PY_FSRS) {
      it(c.name, () => {
        const cfg: FsrsConfig = { ...DEFAULT_FSRS, retention: c.retention, fuzz: false };
        let card: Srs = freshSrs(c.steps[0][1]);
        for (const [i, [grade, at, state, step, s, d, due]] of c.steps.entries()) {
          card = review(card, grade, new Date(at), cfg, 'nota');
          const where = `${c.name}, resposta ${i + 1}`;
          expect(card.state).withContext(where).toBe(state);
          expect(card.step).withContext(where).toBe(step);
          expect(card.s).withContext(where).toBeCloseTo(s, 6);
          expect(card.d).withContext(where).toBeCloseTo(d, 6);
          expect(card.reps).withContext(where).toBe(i + 1);
          // nos passos, a hora exata; na revisão, o dia (aqui ela vence no começo do dia de estudo)
          if (state === 'revisao') expect(studyDay(new Date(card.due))).withContext(where).toBe(studyDay(new Date(due)));
          else expect(new Date(card.due).getTime()).withContext(where).toBe(new Date(due).getTime());
        }
      });
    }
  });

  it('a chance de lembrar: 100% na hora, 90% depois de S dias, e cai devagar', () => {
    expect(retrievability(0, 5)).toBe(1);
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 10);
    expect(retrievability(50, 5)).toBeLessThan(retrievability(10, 5));
    expect(retrievability(3, 0)).toBe(0);
  });

  it('o intervalo: com 90% é a própria estabilidade; mais retenção, mais perto; de 1 dia até o máximo', () => {
    expect(nextInterval(10, 0.9)).toBe(10);
    expect(nextInterval(10, 0.95)).toBeLessThan(10);
    expect(nextInterval(10, 0.8)).toBeGreaterThan(10);
    expect(nextInterval(0.01, 0.9)).toBe(1);
    expect(nextInterval(1e9, 0.9)).toBe(36500);
    expect(nextInterval(1e9, 0.9, 365)).toBe(365);
  });

  it('o arredondamento do Python: o meio vai para o par', () => {
    expect([0.5, 1.5, 2.5, 3.5, 2.4, 2.6].map(roundHalfEven)).toEqual([0, 2, 2, 4, 2, 3]);
  });

  it('a dificuldade fica entre 1 e 10, e a estabilidade nunca chega a zero', () => {
    expect(initDifficulty(4)).toBe(1);
    expect(initDifficulty(1)).toBeCloseTo(6.4133, 4);
    let card = freshSrs('2026-11-02T12:00:00.000Z');
    let t = new Date('2026-11-02T12:00:00.000Z').getTime();
    for (let i = 0; i < 30; i++) {
      card = review(card, 1, new Date(t), { ...DEFAULT_FSRS, fuzz: false });
      t += 86_400_000;
    }
    // a volta para a média segura um pouco antes do teto
    expect(card.d).toBeLessThanOrEqual(10);
    expect(card.d).toBeGreaterThan(9.9);
    expect(card.s).toBeGreaterThanOrEqual(0.001);
  });

  it('o dia de estudo vira às 4h: meia-noite e meia ainda é o dia de antes', () => {
    expect(studyDay(new Date(2026, 10, 3, 0, 30))).toBe('2026-11-02');
    expect(studyDay(new Date(2026, 10, 3, 3, 59))).toBe('2026-11-02');
    expect(studyDay(new Date(2026, 10, 3, 4, 0))).toBe('2026-11-03');
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(addStudyDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(dayStart('2026-11-03').getHours()).toBe(4);
  });

  it('a carta formada vence no começo do dia dela, e a resposta antes das 4h conta como do mesmo dia', () => {
    const cfg = { ...DEFAULT_FSRS, fuzz: false };
    let card = review(freshSrs('2026-11-02T15:00:00.000Z'), 3, new Date(2026, 10, 2, 22, 0), cfg);
    card = review(card, 3, new Date(2026, 10, 2, 22, 10), cfg);
    expect(card.state).toBe('revisao');
    expect(new Date(card.due).getTime()).toBe(dayStart('2026-11-04').getTime());
    // respondida à 1h da manhã do dia 3: ainda é o dia 2, então a conta é a do mesmo dia
    const early = review(card, 3, new Date(2026, 10, 3, 1, 0), cfg);
    expect(early.s).toBeCloseTo(card.s, 6);
  });

  it('o sorteio: só a partir de 2,5 dias, dentro da faixa, nunca menos de 2, o mesmo com a mesma semente', () => {
    expect(fuzzedInterval(2, 36500, 0.99)).toBe(2);
    for (const days of [3, 7, 15, 60, 400]) {
      const all = Array.from({ length: 200 }, (_, i) => fuzzedInterval(days, 36500, i / 200));
      let delta = 1;
      for (const [start, end, factor] of [[2.5, 7, 0.15], [7, 20, 0.1], [20, Infinity, 0.05]]) delta += factor * Math.max(Math.min(days, end) - start, 0);
      expect(Math.min(...all)).withContext(`${days}`).toBe(Math.max(2, roundHalfEven(days - delta)));
      expect(Math.max(...all)).withContext(`${days}`).toBe(roundHalfEven(days + delta));
    }
    expect(seededRandom('nota:3')).toBe(seededRandom('nota:3'));
    expect(seededRandom('nota:3')).not.toBe(seededRandom('nota:4'));
    // com o sorteio ligado, dois aparelhos chegam no mesmo dia
    const twice = () => review(review(freshSrs('2026-11-02T15:00:00.000Z'), 4, new Date('2026-11-02T15:00:00.000Z')), 3, new Date('2026-11-10T15:00:00.000Z'), DEFAULT_FSRS, 'nabc');
    expect(twice().due).toBe(twice().due);
  });

  it('a chance de lembrar agora: 0 na nova, 100% no mesmo dia, e cai com os dias', () => {
    const cfg = { ...DEFAULT_FSRS, fuzz: false };
    expect(recallNow(freshSrs('2026-11-02T15:00:00.000Z'), new Date())).toBe(0);
    const card = review(review(freshSrs('2026-11-02T15:00:00.000Z'), 3, new Date(2026, 10, 2, 15)), 3, new Date(2026, 10, 2, 15, 10), cfg);
    expect(recallNow(card, new Date(2026, 10, 2, 20))).toBe(1);
    expect(recallNow(card, new Date(2026, 10, 4, 20))).toBeCloseTo(0.9, 1);
    expect(recallNow(card, new Date(2026, 11, 4, 20))).toBeLessThan(0.7);
  });
});
