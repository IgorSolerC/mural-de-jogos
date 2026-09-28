import {
  BONUS_MAX_SHIFT,
  Bonus,
  computeBase,
  computeFinal,
  customBonusId,
  formatShift,
  leadSentence,
  sanitizeBonuses,
  sanitizeDraft,
  sanitizeReview,
} from './review';

const favor = (id: string): Bonus => ({ id, label: id, kind: 'favor' });
const contra = (id: string): Bonus => ({ id, label: id, kind: 'contra' });

describe('computeFinal', () => {
  it('é a média ponderada, com Diversão valendo o dobro', () => {
    // (8 + 6*2 + 10 + 4) / 5 = 6,8
    expect(computeFinal({ historia: 8, diversao: 6, jogabilidade: 10, visual: 4 })).toBe(6.8);
  });

  it('arredonda para uma casa', () => {
    // (7 + 8*2 + 8) / 4 = 7,75 → 7,8
    expect(computeFinal({ historia: 7, diversao: 8, jogabilidade: 8, visual: null })).toBe(7.8);
  });

  it('Relevante dobra e Pouco importante corta pela metade o peso da categoria', () => {
    const s = { historia: 10, diversao: 5, jogabilidade: 5, visual: 5 };
    // História 10 com peso 2: (20 + 10 + 5 + 5) / 6
    expect(computeFinal(s, { historia: 'relevante' })).toBe(Math.round((40 / 6) * 10) / 10);
    // História 10 com peso 0,5: (5 + 10 + 5 + 5) / 4,5
    expect(computeFinal(s, { historia: 'pouco' })).toBe(Math.round((25 / 4.5) * 10) / 10);
  });

  it('Não tem tira a categoria da conta, mesmo com nota', () => {
    expect(computeFinal({ historia: 0, diversao: 8, jogabilidade: 8, visual: 8 }, { historia: 'nao-tem' })).toBe(8);
  });

  it('sem nota que conte, não há média', () => {
    expect(computeFinal({ historia: null, diversao: null, jogabilidade: null, visual: null })).toBeNull();
    expect(
      computeFinal(
        { historia: 5, diversao: 5, jogabilidade: 5, visual: 5 },
        { historia: 'nao-tem', diversao: 'nao-tem', jogabilidade: 'nao-tem', visual: 'nao-tem' },
      ),
    ).toBeNull();
  });

  it('bônus sozinho não faz média', () => {
    expect(computeFinal({ historia: null, diversao: null, jogabilidade: null, visual: null }, {}, [favor('a')])).toBeNull();
  });

  it('cada bônus mexe no máximo BONUS_MAX_SHIFT', () => {
    const s = { historia: 2, diversao: 2, jogabilidade: 2, visual: 2 };
    const one = (v: number) => Math.round(v * 10) / 10;
    expect(computeFinal(s, {}, [favor('a')])).toBe(one(2 + BONUS_MAX_SHIFT));
    expect(computeFinal({ historia: 9, diversao: 9, jogabilidade: 9, visual: 9 }, {}, [contra('a')])).toBe(one(9 - BONUS_MAX_SHIFT));
  });

  it('um bônus perto da média mexe menos que o limite', () => {
    // base 9, peso 5: (10 - 9) / 6 ≈ 0,17
    expect(computeFinal({ historia: 9, diversao: 9, jogabilidade: 9, visual: 9 }, {}, [favor('a')])).toBe(9.2);
  });

  it('os efeitos dos bônus se somam e a média fica entre 0 e 10', () => {
    const s = { historia: 10, diversao: 10, jogabilidade: 10, visual: 10 };
    expect(computeFinal(s, {}, [favor('a'), favor('b')])).toBe(10);
    const low = { historia: 0, diversao: 0, jogabilidade: 0, visual: 0 };
    expect(computeFinal(low, {}, [contra('a'), contra('b')])).toBe(0);
  });

  it('computeBase ignora os bônus', () => {
    const r = { scores: { final: 0, historia: 5, diversao: 5, jogabilidade: 5, visual: 5 }, weights: {} };
    expect(computeBase(r)).toBe(5);
  });
});

describe('sanitizeReview', () => {
  const base = {
    id: 'rabc123',
    game: { name: 'Celeste', coverUrl: 'https://x/y.jpg', source: 'wikipedia' },
    scores: { historia: 7, diversao: 9, jogabilidade: 9, visual: 8 },
    status: 'finalizado',
    difficulty: 'dificil',
    verdict: 'recomendo',
    completedAt: '2024-05-01',
    createdAt: '2024-05-01T10:00:00.000Z',
    updatedAt: '2024-05-02T10:00:00.000Z',
  };

  it('aceita uma resenha válida e recalcula a média', () => {
    const r = sanitizeReview({ ...base, scores: { ...base.scores, final: 1 } })!;
    expect(r).not.toBeNull();
    expect(r.scores.final).toBe(8.4);
    expect(r.game.name).toBe('Celeste');
    expect(r.difficulty).toBe('dificil');
  });

  it('recusa quem não tem nome', () => {
    expect(sanitizeReview({ ...base, game: { name: '  ' } })).toBeNull();
    expect(sanitizeReview(null)).toBeNull();
    expect(sanitizeReview('x')).toBeNull();
  });

  it('lê o Visual das resenhas antigas, que se chamava grafico', () => {
    const r = sanitizeReview({ ...base, scores: { historia: 7, diversao: 9, jogabilidade: 9, grafico: 3 } })!;
    expect(r.scores.visual).toBe(3);
  });

  it('mantém a nota final das resenhas antigas que só tinham ela', () => {
    const r = sanitizeReview({ ...base, scores: { final: 7.45 } })!;
    expect(r.scores.final).toBe(7.5);
  });

  it('corrige notas fora da escala e campos estranhos', () => {
    const r = sanitizeReview({
      ...base,
      scores: { historia: 14, diversao: -3, jogabilidade: '7', visual: 'abc' },
      status: 'zerado',
      difficulty: 'hardcore',
      verdict: 'top',
      stock: 'dourado',
    })!;
    expect(r.scores.historia).toBe(10);
    expect(r.scores.diversao).toBe(0);
    expect(r.scores.jogabilidade).toBe(7);
    expect(r.scores.visual).toBeNull();
    expect(r.status).toBe('finalizado');
    expect(r.difficulty).toBe('nenhuma');
    expect(r.verdict).toBeNull();
    expect(r.stock).toBeUndefined();
  });

  it('zera a nota da categoria que o jogo não tem', () => {
    const r = sanitizeReview({ ...base, weights: { historia: 'nao-tem', visual: 'normal' } })!;
    expect(r.scores.historia).toBeNull();
    expect(r.weights).toEqual({ historia: 'nao-tem' });
  });

  it('só aceita capa em https', () => {
    expect(sanitizeReview({ ...base, game: { name: 'A', coverUrl: 'http://x/y.jpg' } })!.game.coverUrl).toBeNull();
    expect(sanitizeReview({ ...base, game: { name: 'A', coverUrl: 'javascript:alert(1)' } })!.game.coverUrl).toBeNull();
  });

  it('data nula é data não definida; data inválida vira o dia da criação', () => {
    expect(sanitizeReview({ ...base, completedAt: null })!.completedAt).toBeNull();
    expect(sanitizeReview({ ...base, completedAt: '2024-13-45x' })!.completedAt).toBe('2024-05-01');
  });

  it('horas: aceita números não negativos, com uma casa', () => {
    expect(sanitizeReview({ ...base, hoursPlayed: 12.345 })!.hoursPlayed).toBe(12.3);
    expect(sanitizeReview({ ...base, hoursPlayed: -1 })!.hoursPlayed).toBeNull();
    expect(sanitizeReview({ ...base, hoursPlayed: '' })!.hoursPlayed).toBeNull();
    expect(sanitizeReview({ ...base, hoursPlayed: 0 })!.hoursPlayed).toBe(0);
  });

  it('troca um id estranho por um novo', () => {
    expect(sanitizeReview({ ...base, id: 'x' })!.id).not.toBe('x');
    expect(sanitizeReview({ ...base, id: '<script>' })!.id).toMatch(/^[\w-]+$/);
  });
});

describe('sanitizeBonuses', () => {
  it('bônus da cartela usam o nome da cartela', () => {
    expect(sanitizeBonuses([{ id: 'bugs', label: 'qualquer', kind: 'favor' }])).toEqual([
      { id: 'bugs', label: 'Muitos bugs', kind: 'contra' },
    ]);
  });

  it('bônus escritos ganham id pelo nome e lado, sem repetir', () => {
    const out = sanitizeBonuses([
      { id: 'lixo', label: '  chefes   difíceis ', kind: 'contra' },
      { label: 'Chefes difíceis', kind: 'contra' },
      { label: 'Chefes difíceis', kind: 'favor' },
      { label: '', kind: 'favor' },
      { label: 'sem lado' },
      'x',
    ]);
    expect(out.map((b) => b.id)).toEqual([customBonusId('Chefes difíceis', 'contra'), customBonusId('Chefes difíceis', 'favor')]);
    expect(out[0].label).toBe('Chefes difíceis');
  });

  it('não é lista: nenhum bônus', () => {
    expect(sanitizeBonuses('x')).toEqual([]);
  });
});

describe('sanitizeDraft', () => {
  it('aceita só nome e capa', () => {
    const d = sanitizeDraft({ id: 'rdraft1', game: { name: 'Hades' } })!;
    expect(d.game.name).toBe('Hades');
    expect(d.id).toBe('rdraft1');
    expect(sanitizeDraft({ game: {} })).toBeNull();
  });
});

describe('leadSentence', () => {
  it('pega a primeira frase', () => {
    expect(leadSentence('Um jogo lindo, estranho e muito difícil de largar. Depois conto mais.')).toBe(
      'Um jogo lindo, estranho e muito difícil de largar.',
    );
  });

  it('frase curta leva a segunda junto', () => {
    expect(leadSentence('Amei. O final me pegou de surpresa.')).toBe('Amei. O final me pegou de surpresa.');
  });

  it('não parte a frase em "nota 8.5"', () => {
    expect(leadSentence('Dei nota 8.5 porque o fim cansa um pouco demais.')).toBe('Dei nota 8.5 porque o fim cansa um pouco demais.');
  });

  it('corta no último espaço antes do limite', () => {
    const out = leadSentence('palavra '.repeat(30), 40);
    expect(out.endsWith('…')).toBeTrue();
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out).not.toContain('palavr…');
  });

  it('texto vazio não tem frase', () => {
    expect(leadSentence('   ')).toBe('');
  });
});

describe('formatShift', () => {
  it('escreve o sinal e a vírgula', () => {
    expect(formatShift(0.44)).toBe('+0,4');
    expect(formatShift(-0.25)).toBe('−0,3');
    expect(formatShift(0.01)).toBe('±0');
  });
});
