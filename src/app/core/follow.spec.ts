import { FeedItem, dayLabel, localDayOf, parseFeed, parsePeople, unseenCount, visibleFeed } from './follow';

const ana = { codigo: 'AAAA-1111', nome: 'Ana' };
const bia = { codigo: 'BBBB-2222', nome: 'Bia' };
const resenha = (ref: string, em: string, pessoa = ana, extra: Partial<Extract<FeedItem, { tipo: 'resenha' }>> = {}): FeedItem => ({
  tipo: 'resenha',
  em,
  pessoa,
  ref,
  titulo: `Jogo ${ref}`,
  mural: 'jogos',
  silenciado: false,
  ...extra,
});

describe('correio', () => {
  it('só aceita da nuvem o que tem a forma certa, do mais novo para o mais velho', () => {
    const items = parseFeed([
      { tipo: 'resenha', em: '2026-10-05T10:00:00.000Z', pessoa: { codigo: 'aaaa1111', nome: ' Ana ' }, ref: 'r001', titulo: 'Hades', mural: 'jogos' },
      { tipo: 'seguiu', em: '2026-10-06T10:00:00.000Z', pessoa: bia, euSigo: true },
      { tipo: 'resenha', em: '2026-10-05T11:00:00.000Z', pessoa: ana, ref: 'x', titulo: 'ref curta' },
      { tipo: 'resenha', em: 'ontem', pessoa: ana, ref: 'r002', titulo: 'data ruim' },
      { tipo: 'resenha', em: '2026-10-05T12:00:00.000Z', pessoa: { codigo: 'oi', nome: 'X' }, ref: 'r003', titulo: 'código ruim' },
      { tipo: 'resenha', em: '2026-10-05T12:00:00.000Z', pessoa: ana, ref: 'r004', titulo: 'Livro', mural: '<x>' },
      { tipo: 'outro', em: '2026-10-05T12:00:00.000Z', pessoa: ana },
      null,
    ]);
    expect(items.map((i) => (i.tipo === 'resenha' ? i.ref : i.tipo))).toEqual(['seguiu', 'r004', 'r001']);
    expect(items[2]).toEqual(resenha('r001', '2026-10-05T10:00:00.000Z', ana, { titulo: 'Hades' }));
    expect((items[1] as Extract<FeedItem, { tipo: 'resenha' }>).mural).toBe('jogos');
    expect(parseFeed('nada')).toEqual([]);
  });

  it('conta o que chegou depois do visto, menos o de quem foi silenciado', () => {
    const items = [
      resenha('r003', '2026-10-06T12:00:00.000Z', bia, { silenciado: true }),
      resenha('r002', '2026-10-06T11:00:00.000Z'),
      resenha('r001', '2026-10-05T10:00:00.000Z'),
    ];
    expect(unseenCount(items, null)).toBe(2);
    expect(unseenCount(items, '2026-10-06T00:00:00.000Z')).toBe(1);
    expect(unseenCount(items, '2026-10-06T11:00:00.000Z')).toBe(0);
  });

  it('hoje, ontem ou a data', () => {
    const now = new Date(2026, 9, 6, 12);
    expect(dayLabel(localDayOf(now.toISOString()), now)).toBe('hoje');
    expect(dayLabel('2026-10-05', now)).toBe('ontem');
    expect(dayLabel('2026-10-03', now)).toBe('3 de outubro');
    expect(dayLabel('2025-12-31', now)).toBe('31 de dezembro de 2025');
  });

  it('lê as listas de pessoas', () => {
    expect(
      parsePeople({
        seguindo: [{ codigo: 'aaaa-1111', nome: 'Ana', desde: '2026-10-06T10:00:00.000Z', silenciado: true, rev: 3, meSegue: true }, { codigo: '?', nome: 'X' }],
        seguidores: [{ codigo: 'BBBB-2222', nome: 'Bia', desde: '2026-10-06T10:00:00.000Z', euSigo: false }],
      }),
    ).toEqual({
      seguindo: [{ codigo: 'AAAA-1111', nome: 'Ana', desde: '2026-10-06T10:00:00.000Z', silenciado: true, rev: 3, meSegue: true }],
      seguidores: [{ codigo: 'BBBB-2222', nome: 'Bia', desde: '2026-10-06T10:00:00.000Z', euSigo: false }],
    });
    expect(parsePeople(null)).toEqual({ seguindo: [], seguidores: [] });
  });
});

describe('misturado ou separado', () => {
  const jogo = { tipo: 'resenha', em: '2026-10-06T10:00:00.000Z', pessoa: { codigo: 'AAAA-1111', nome: 'Ana' }, ref: 'r001', titulo: 'Hades', mural: 'jogos', silenciado: false } as const;
  const livro = { ...jogo, ref: 'r002', titulo: 'Duna', mural: 'livros' } as const;
  const seguiu = { tipo: 'seguiu', em: '2026-10-05T10:00:00.000Z', pessoa: { codigo: 'BBBB-2222', nome: 'Bia' }, euSigo: false } as const;

  it('misturado mostra tudo; separado, só o mural aberto e quem começou a seguir', () => {
    const items = [jogo, livro, seguiu];
    expect(visibleFeed(items, 'misturado', 'animes')).toEqual(items);
    expect(visibleFeed(items, 'separado', 'livros')).toEqual([livro, seguiu]);
    expect(visibleFeed(items, 'separado', 'animes')).toEqual([seguiu]);
  });
});
