import { TestBed } from '@angular/core/testing';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { Cloud } from './cloud-config';
import { CloudAccount } from './cloud-account';
import { FeedItem, Follow, dayLabel, localDayOf, parseFeed, parsePeople, unseenCount, visibleFeed } from './follow';

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


describe('quem eu sigo, sem esperar a nuvem', () => {
  const KEY = 'meu-mural:correio';
  const ana = { codigo: 'AAAA-1111', nome: 'Ana' };
  /** Os pedidos da lista de pessoas, na ordem em que saíram (cada um responde quando o teste mandar). */
  let peopleRequests: ((v: unknown) => void)[];
  let request: jasmine.Spy;

  function make(): Follow {
    TestBed.resetTestingModule();
    peopleRequests = [];
    request = jasmine.createSpy('request').and.callFake((path: string) => {
      if (path === '/v1/eu/pessoas') return new Promise((r) => peopleRequests.push(r));
      if (path === '/v1/seguindo') return Promise.resolve({ pessoa: ana, desde: '2026-10-06T10:00:00.000Z', silenciado: false });
      return Promise.resolve({});
    });
    const signedIn = signal(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        {
          provide: CloudAccount,
          useValue: {
            account: signal({ id: 'u-eu', codigo: 'EEEE-0000', nome: 'Eu' }),
            signedIn: computed(() => signedIn()),
            request,
            // o correio: nada novo
            requestRaw: () => Promise.resolve(new Response(null, { status: 204 })),
          },
        },
      ],
    });
    const follow = TestBed.inject(Follow);
    TestBed.tick();
    return follow;
  }

  afterEach(async () => {
    // o que ficou andando por trás (a conferência do correio) termina antes de limpar
    await new Promise((r) => setTimeout(r, 0));
    TestBed.resetTestingModule();
    localStorage.removeItem(KEY);
  });

  it('ao recarregar, a lista guardada já responde, antes da nuvem', () => {
    localStorage.setItem(KEY, JSON.stringify({ conta: 'u-eu', itens: [], vistasEm: null, agora: null, pessoas: { seguindo: [{ ...ana, desde: '2026-10-01T00:00:00.000Z' }], seguidores: [] } }));
    const follow = make();
    expect(follow.isFollowing('AAAA-1111')).toBeTrue();
    expect(follow.isFollowing('BBBB-2222')).toBeFalse();
  });

  it('sem nada guardado, não sabe (nunca diz que não segue antes da hora)', () => {
    const follow = make();
    expect(follow.isFollowing('AAAA-1111')).toBeNull();
  });

  it('seguir muda na hora; uma lista velha que chega depois não desfaz', async () => {
    const follow = make();
    await follow.follow('AAAA-1111');
    expect(follow.isFollowing('AAAA-1111')).toBeTrue();
    // a lista pedida ao abrir (antes de seguir) chega agora, sem a Ana: é descartada
    peopleRequests[0]({ seguindo: [], seguidores: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(follow.isFollowing('AAAA-1111')).toBeTrue();
    expect(JSON.parse(localStorage.getItem(KEY)!).pessoas.seguindo[0].codigo).toBe('AAAA-1111');
  });
});
