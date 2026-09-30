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
  sanitizeWish,
  relevanceLabel,
  isValidDay,
  isYearOnly,
  formatReviewDate,
  todayISO,
  initialOf,
  DARK_STOCKS,
  LIGHT_STOCKS,
  ROTATION_STOCKS,
  isDarkStock,
} from './review';

const favor = (id: string): Bonus => ({ id, label: id, kind: 'favor' });
const contra = (id: string): Bonus => ({ id, label: id, kind: 'contra' });

describe('computeFinal', () => {
  it('é a média ponderada, com Diversão valendo o dobro', () => {
    // (8 + 6*2 + 10 + 4) / 5 = 6,8
    expect(computeFinal('jogos', { historia: 8, diversao: 6, jogabilidade: 10, visual: 4 })).toBe(6.8);
  });

  it('arredonda para uma casa', () => {
    // (7 + 8*2 + 8) / 4 = 7,75 → 7,8
    expect(computeFinal('jogos', { historia: 7, diversao: 8, jogabilidade: 8, visual: null })).toBe(7.8);
  });

  it('Relevante dobra e Pouco importante corta pela metade o peso da categoria', () => {
    const s = { historia: 10, diversao: 5, jogabilidade: 5, visual: 5 };
    // História 10 com peso 2: (20 + 10 + 5 + 5) / 6
    expect(computeFinal('jogos', s, { historia: 'relevante' })).toBe(Math.round((40 / 6) * 10) / 10);
    // História 10 com peso 0,5: (5 + 10 + 5 + 5) / 4,5
    expect(computeFinal('jogos', s, { historia: 'pouco' })).toBe(Math.round((25 / 4.5) * 10) / 10);
  });

  it('Não tem tira a categoria da conta, mesmo com nota', () => {
    expect(computeFinal('jogos', { historia: 0, diversao: 8, jogabilidade: 8, visual: 8 }, { historia: 'nao-tem' })).toBe(8);
  });

  it('sem nota que conte, não há média', () => {
    expect(computeFinal('jogos', { historia: null, diversao: null, jogabilidade: null, visual: null })).toBeNull();
    expect(
      computeFinal(
        'jogos',
        { historia: 5, diversao: 5, jogabilidade: 5, visual: 5 },
        { historia: 'nao-tem', diversao: 'nao-tem', jogabilidade: 'nao-tem', visual: 'nao-tem' },
      ),
    ).toBeNull();
  });

  it('bônus sozinho não faz média', () => {
    expect(computeFinal('jogos', { historia: null, diversao: null, jogabilidade: null, visual: null }, {}, [favor('a')])).toBeNull();
  });

  it('cada bônus mexe no máximo BONUS_MAX_SHIFT', () => {
    const s = { historia: 2, diversao: 2, jogabilidade: 2, visual: 2 };
    const one = (v: number) => Math.round(v * 10) / 10;
    expect(computeFinal('jogos', s, {}, [favor('a')])).toBe(one(2 + BONUS_MAX_SHIFT));
    expect(computeFinal('jogos', { historia: 9, diversao: 9, jogabilidade: 9, visual: 9 }, {}, [contra('a')])).toBe(one(9 - BONUS_MAX_SHIFT));
  });

  it('um bônus perto da média mexe menos que o limite', () => {
    // base 9, peso 5: (10 - 9) / 6 ≈ 0,17
    expect(computeFinal('jogos', { historia: 9, diversao: 9, jogabilidade: 9, visual: 9 }, {}, [favor('a')])).toBe(9.2);
  });

  it('os efeitos dos bônus se somam e a média fica entre 0 e 10', () => {
    const s = { historia: 10, diversao: 10, jogabilidade: 10, visual: 10 };
    expect(computeFinal('jogos', s, {}, [favor('a'), favor('b')])).toBe(10);
    const low = { historia: 0, diversao: 0, jogabilidade: 0, visual: 0 };
    expect(computeFinal('jogos', low, {}, [contra('a'), contra('b')])).toBe(0);
  });

  it('computeBase ignora os bônus', () => {
    const r = { kind: 'jogos' as const, scores: { final: 0, historia: 5, diversao: 5, jogabilidade: 5, visual: 5 }, weights: {} };
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

  it('guarda as cartolinas escuras, e só elas pedem a tinta clara', () => {
    for (const stock of DARK_STOCKS) {
      expect(sanitizeReview({ ...base, stock })!.stock).toBe(stock);
      expect(isDarkStock(stock)).toBeTrue();
    }
    for (const stock of LIGHT_STOCKS) expect(isDarkStock(stock)).toBeFalse();
    // as fichas antigas sem cor continuam no rodízio de sempre
    expect(ROTATION_STOCKS.some((s) => isDarkStock(s) || s === 'branco')).toBeFalse();
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
    expect(sanitizeBonuses([{ id: 'bugs', label: 'qualquer', kind: 'favor' }], 'jogos')).toEqual([
      { id: 'bugs', label: 'Muitos bugs', kind: 'contra' },
    ]);
  });

  it('bônus escritos ganham id pelo nome e lado, sem repetir', () => {
    const out = sanitizeBonuses(
      [
        { id: 'lixo', label: '  chefes   difíceis ', kind: 'contra' },
        { label: 'Chefes difíceis', kind: 'contra' },
        { label: 'Chefes difíceis', kind: 'favor' },
        { label: '', kind: 'favor' },
        { label: 'sem lado' },
        'x',
      ],
      'jogos',
    );
    expect(out.map((b) => b.id)).toEqual([customBonusId('Chefes difíceis', 'contra'), customBonusId('Chefes difíceis', 'favor')]);
    expect(out[0].label).toBe('Chefes difíceis');
  });

  it('não é lista: nenhum bônus', () => {
    expect(sanitizeBonuses('x', 'jogos')).toEqual([]);
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

describe('vontade na wishlist', () => {
  it('guarda MUST e LATER; qualquer outra coisa (ou nada) é Comum, sem o campo', () => {
    expect(sanitizeWish({ id: 'rw1', game: { name: 'Hades' }, relevance: 'must' })!.relevance).toBe('must');
    expect(sanitizeWish({ id: 'rw1', game: { name: 'Hades' }, relevance: 'later' })!.relevance).toBe('later');
    expect('relevance' in sanitizeWish({ id: 'rw1', game: { name: 'Hades' }, relevance: 'urgente' })!).toBeFalse();
    expect('relevance' in sanitizeWish({ id: 'rw1', game: { name: 'Hades' } })!).toBeFalse();
  });

  it('o adesivo fala o verbo do mural', () => {
    expect(relevanceLabel('jogos', 'must')).toBe('MUST PLAY');
    expect(relevanceLabel('livros', 'must')).toBe('MUST READ');
    expect(relevanceLabel('series', 'must')).toBe('MUST WATCH');
    expect(relevanceLabel('filmes', 'later')).toBe('LATER');
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

describe('murais', () => {
  const livro = {
    id: 'rlivro1',
    kind: 'livros',
    game: { name: 'Dom Casmurro', by: 'Machado de Assis', source: 'openlibrary', coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
    scores: { historia: 8, envolvimento: 6, personagens: 10, escrita: 10, diversao: 3 },
    status: 'platinado',
    difficulty: 'dificil',
    hoursPlayed: 256.7,
    completedAt: '2024-05-01',
    createdAt: '2024-05-01T10:00:00.000Z',
  };

  it('ficha sem mural é de jogos (os backups de antes dos murais)', () => {
    const r = sanitizeReview({ game: { name: 'Hades' }, scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 } })!;
    expect(r.kind).toBe('jogos');
    expect(sanitizeReview({ ...livro, kind: 'revistas' })!.kind).toBe('jogos');
  });

  it('cada mural usa as suas quatro notas, e o centro dele pesa o dobro', () => {
    const r = sanitizeReview(livro)!;
    // (8 + 6*2 + 10 + 10) / 5 = 8; a Diversão, que não é nota de livro, fica de fora
    expect(r.scores.final).toBe(8);
    expect(r.scores.diversao).toBeUndefined();
    expect(r.scores.escrita).toBe(10);
    // filmes: Roteiro e Envolvimento pesam 2 — (10*2 + 4*2 + 10 + 10) / 6 = 8
    expect(computeFinal('filmes', { roteiro: 10, envolvimento: 4, atuacao: 10, visual: 10 })).toBe(8);
    expect(computeFinal('animes', { roteiro: 4, envolvimento: 10, personagens: 10, animacao: 10 })).toBe(8);
    expect(computeFinal('series', { roteiro: 10, envolvimento: 10, personagens: 4, visual: 4 })).toBe(8);
  });

  it('livro tem dificuldade de leitura e páginas inteiras; o terceiro status é Relido', () => {
    const r = sanitizeReview(livro)!;
    expect(r.difficulty).toBe('dificil');
    expect(r.hoursPlayed).toBe(257);
    expect(r.status).toBe('platinado');
    expect(r.game.by).toBe('Machado de Assis');
    expect(r.game.source).toBe('openlibrary');
  });

  it('filmes, séries e animes não têm dificuldade nem quantidade', () => {
    for (const kind of ['filmes', 'series', 'animes']) {
      const r = sanitizeReview({ ...livro, kind, scores: { roteiro: 7, envolvimento: 7, personagens: 7, atuacao: 7, visual: 7, animacao: 7 } })!;
      expect(r.difficulty).withContext(kind).toBe('nenhuma');
      expect(r.hoursPlayed).withContext(kind).toBeNull();
      expect(r.scores.final).withContext(kind).toBe(7);
    }
  });

  it('a cartela pronta é do mural: "Muitos bugs" num livro vira bônus escrito', () => {
    const [b] = sanitizeBonuses([{ id: 'bugs', label: 'Muitos bugs', kind: 'contra' }], 'livros');
    expect(b.id).toBe(customBonusId('Muitos bugs', 'contra'));
    const [c] = sanitizeBonuses([{ id: 'traducao-ruim', label: 'x', kind: 'favor' }], 'livros');
    expect(c).toEqual({ id: 'traducao-ruim', label: 'Tradução ruim', kind: 'contra' });
  });

  it('pendente guarda o mural', () => {
    expect(sanitizeDraft({ id: 'rdraft2', kind: 'animes', game: { name: 'Frieren' } })!.kind).toBe('animes');
    expect(sanitizeDraft({ id: 'rdraft3', game: { name: 'Hades' } })!.kind).toBe('jogos');
  });
});

describe('datas e iniciais (caça a bugs)', () => {
  it('guarda apenas o ano sem inventar um dia, incluindo a leitura abreviada do card', () => {
    expect(isYearOnly('2020')).toBeTrue();
    expect(isYearOnly('20')).toBeFalse();
    expect(isYearOnly('2020-01-01')).toBeFalse();
    const review = sanitizeReview({ game: { name: 'Hades' }, scores: { final: 8 }, completedAt: '2020' })!;
    expect(review.completedAt).toBe('2020');
    expect(formatReviewDate(review.completedAt)).toBe('2020');
    expect(formatReviewDate(review.completedAt, true)).toBe('2020');
    expect(sanitizeReview({ ...review, completedAt: '9999' })!.completedAt).toBe(todayISO().slice(0, 4));
    expect(formatReviewDate(null)).toBe('Sem data');
  });
  it('11 é exclusivo da nota manual; categorias e média automática continuam até 10', () => {
    const review = { game: { name: 'Hades' }, scores: { final: 11, historia: 11, diversao: 11, jogabilidade: 11, visual: 11 } };
    expect(sanitizeReview(review)!.scores.final).toBe(10);
    const manual = sanitizeReview({ ...review, finalOverride: 11 })!;
    expect(manual.scores.final).toBe(11);
    expect(manual.scores.diversao).toBe(10);
    expect(sanitizeReview({ game: { name: 'Antiga' }, scores: { final: 11 } })!.scores.final).toBe(10);
  });
  it('um dia que não existe não vale', () => {
    expect(isValidDay('2025-02-31')).toBeFalse();
    expect(isValidDay('2024-02-29')).toBeTrue();
  });

  it('a inicial de um nome com emoji é o emoji inteiro', () => {
    expect(initialOf('🎮 Party')).toBe('🎮');
    expect(initialOf('  zelda')).toBe('Z');
    expect(initialOf('   ')).toBe('?');
  });

  it('a nota final na mão vai no lugar da média; sem ela, vale a média', () => {
    const base = { game: { name: 'Hades', coverUrl: null, source: 'manual' }, scores: { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } };
    const avg = sanitizeReview(base)!.scores.final;
    expect('finalOverride' in sanitizeReview(base)!).toBeFalse();
    const hand = sanitizeReview({ ...base, finalOverride: 3.25 })!;
    expect([hand.finalOverride, hand.scores.final]).toEqual([3.3, 3.3]);
    expect(sanitizeReview({ ...base, finalOverride: 12 })!.scores.final).toBe(11);
    for (const bad of ['7', NaN, null, Infinity]) expect(sanitizeReview({ ...base, finalOverride: bad })!.scores.final).withContext(String(bad)).toBe(avg);
    // zero é nota: a mão pode reprovar
    expect(sanitizeReview({ ...base, finalOverride: 0 })!.scores.final).toBe(0);
  });
});
