import { compareCollections, unseenOf } from './comparison';
import { Review, sanitizeReview } from './review';

function review(
  id: string,
  name: string,
  game: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Review {
  return sanitizeReview({
    id,
    game: { name, ...game },
    scores: { final: 8 },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...extra,
  })!;
}

describe('obras em comum', () => {
  it('compara o catálogo, não o id da ficha ou a tradução do título', () => {
    const mine = review(
      'minha1',
      'Harry Potter e o Enigma do Príncipe',
      { source: 'openlibrary', sourceId: 'OL82565W' },
      { kind: 'livros', finalOverride: 11 },
    );
    const theirs = review(
      'outra1',
      'Harry Potter and the Half-Blood Prince',
      { source: 'openlibrary', sourceId: 'OL82565W' },
      { kind: 'livros' },
    );
    const [pair] = compareCollections([mine], [theirs]).pairs;
    expect(pair.mine).toBe(mine);
    expect(pair.theirs).toBe(theirs);
    expect(pair.difference).toBe(3);
    expect(compareCollections([mine], [review('minha1', 'Outra obra')]).pairs).toEqual([]);
  });

  it('combina nomes sem acentos e pontuação, inclusive catálogo versus cadastro manual', () => {
    const mine = review('minha1', 'Pokémon: Emerald', {
      source: 'rawg',
      sourceId: '123',
    });
    const theirs = review('outra1', 'pokemon emerald');
    expect(compareCollections([mine], [theirs]).pairs.length).toBe(1);
  });

  it('não confunde remakes, adaptações nem IDs diferentes no mesmo catálogo', () => {
    const original = review('minha1', 'God of War', { year: '2005' });
    expect(
      compareCollections([original], [review('outra1', 'God of War (2018)')]).pairs,
    ).toEqual([]);
    expect(
      compareCollections(
        [review('minha1', 'Duna', {}, { kind: 'livros' })],
        [review('outra1', 'Duna', {}, { kind: 'filmes' })],
      ).pairs,
    ).toEqual([]);
    expect(
      compareCollections(
        [review('minha1', 'Hades', { source: 'rawg', sourceId: '1' })],
        [review('outra1', 'Hades', { source: 'rawg', sourceId: '2' })],
      ).pairs,
    ).toEqual([]);
  });

  it('aceita edições de livro de anos diferentes mas protege autores homônimos', () => {
    const mine = review(
      'minha1',
      'Duna',
      { by: 'Frank Herbert', year: '1965' },
      { kind: 'livros' },
    );
    expect(
      compareCollections(
        [mine],
        [
          review(
            'outra1',
            'Duna',
            { by: 'Frank Herbert', year: '2020' },
            { kind: 'livros' },
          ),
        ],
      ).pairs.length,
    ).toBe(1);
    expect(
      compareCollections(
        [mine],
        [review('outra2', 'Duna', { by: 'Outro autor' }, { kind: 'livros' })],
      ).pairs,
    ).toEqual([]);
  });

  it('não adivinha o remake quando um ano está ausente e há vários candidatos', () => {
    const two = [
      review('original1', 'God of War', { year: '2005' }),
      review('remake1', 'God of War', { year: '2018' }),
    ];
    expect(compareCollections(two, [review('outra1', 'God of War')]).pairs).toEqual([]);
    expect(compareCollections([review('minha1', 'God of War')], two).pairs).toEqual([]);
  });

  it('escolhe a resenha mais recente da mesma obra e prioriza o catálogo', () => {
    const game = { source: 'rawg', sourceId: '1' };
    const old = review('old111', 'Hades', game);
    const recent = review('new111', 'Hades', game, {
      updatedAt: '2025-01-01T00:00:00Z',
    });
    const theirs = review('other1', 'Hades', game);
    const pairs = compareCollections(
      [review('manual1', 'Hades'), old, recent],
      [theirs],
    ).pairs;
    expect(pairs.length).toBe(1);
    expect(pairs[0].mine.id).toBe(recent.id);
  });

  it('separa o que só um dos dois resenhou, sem afirmar nada sobre homônimos ambíguos', () => {
    const mine = [review('minha1', 'Hades'), review('minha2', 'Celeste'), review('minha3', 'God of War', { year: '2005' })];
    const theirs = [review('outra1', 'Hades'), review('outra2', 'Balatro'), review('outra3', 'God of War', { year: '2018' })];
    const { pairs, onlyMine, onlyTheirs } = compareCollections(mine, theirs);
    expect(pairs.map((p) => p.mine.id)).toEqual(['minha1']);
    expect(onlyMine.map((r) => r.id)).toEqual(['minha2']);
    expect(onlyTheirs.map((r) => r.id)).toEqual(['outra2']);
  });
});

describe('o que eu ainda não resenhei (sem spoilers)', () => {
  it('esconde só as obras que eu não tenho, e as rejogadas delas', () => {
    const mine = [review('id-m1', 'Hades', { source: 'rawg', sourceId: '1' }), review('id-m2', 'Celeste')];
    const theirs = [
      review('id-t1', 'Hades', { source: 'rawg', sourceId: '1' }),
      review('id-t2', 'celeste'),
      review('id-t3', 'Tunic'),
      review('id-t4', 'Tunic', {}, { revisitOf: 'id-t3' }),
    ];
    expect([...unseenOf(mine, theirs)].sort()).toEqual(['id-t3', 'id-t4']);
  });

  it('pelo catálogo, mesmo com o título traduzido; e ids diferentes do mesmo catálogo são outra obra', () => {
    const mine = [review('id-m1', 'O Senhor dos Anéis', { source: 'openlibrary', sourceId: 'OL1W' }, { kind: 'livros' })];
    const theirs = [
      review('id-t1', 'The Lord of the Rings', { source: 'openlibrary', sourceId: 'OL1W' }, { kind: 'livros' }),
      review('id-t2', 'O Senhor dos Anéis', { source: 'openlibrary', sourceId: 'OL2W' }, { kind: 'livros' }),
    ];
    expect([...unseenOf(mine, theirs)]).toEqual(['id-t2']);
  });

  it('anos diferentes no mesmo título são obras diferentes', () => {
    const mine = [review('id-m1', 'Duna', { year: '1984' }, { kind: 'filmes' })];
    const theirs = [review('id-t1', 'Duna', { year: '2021' }, { kind: 'filmes' }), review('id-t2', 'Duna', {}, { kind: 'filmes' })];
    expect([...unseenOf(mine, theirs)]).toEqual(['id-t1']);
  });
});
