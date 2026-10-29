import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FichaV1 } from '../../../contrato/api-v1/murais';
import { ApiMirror } from './api-mirror';
import { contextoFichasV1, desejoV1, fichaV1, muralsMirror, praDepoisV1 } from './api-mirror-murals';
import { CloudAccount } from './cloud-account';
import { KanbanStore } from './kanban-store';
import { Draft, Review, Wish, sanitizeDraft, sanitizeReview, sanitizeWish } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { EMPTY_SPENDING } from './spending';
import { SpendingStore } from './spending-store';

/**
 * Os murais de resenhas no espelho da API (core/api-mirror-murals.ts, rodada 9): o desejo, o pra
 * depois e a ficha em v1, o contexto de cada mural tirado de KIND_PROFILES, e o serviço mandando cada
 * área só quando a nuvem pede.
 */

const AT = '2026-10-01T10:00:00.000Z';
const WISH: Wish = sanitizeWish({ id: 'dj-silk', kind: 'jogos', game: { name: 'Silksong', coverUrl: 'https://c/silk.jpg', source: 'rawg', year: '2025' }, relevance: 'must', createdAt: AT, updatedAt: AT })!;
const BOOK_WISH: Wish = sanitizeWish({ id: 'dl-duna', kind: 'livros', game: { name: 'Duna', coverUrl: null, source: 'openlibrary', by: 'Frank Herbert' }, createdAt: AT, updatedAt: AT })!;
const DRAFT: Draft = sanitizeDraft({ id: 'pd-celeste', kind: 'jogos', game: { name: 'Celeste', coverUrl: null, source: 'manual' }, createdAt: AT, updatedAt: AT })!;
const review = (raw: Record<string, unknown>): Review =>
  sanitizeReview({ status: 'finalizado', difficulty: 'nenhuma', verdict: null, weights: {}, bonuses: [], hoursPlayed: null, text: '', completedAt: '2026-09-10', createdAt: AT, updatedAt: AT, ...raw })!;
const OUTER = review({ id: 'rf-outer', kind: 'jogos', game: { name: 'Outer Wilds', coverUrl: null, source: 'manual', year: '2019' }, scores: { historia: 10, diversao: 10, jogabilidade: 9, visual: 9 }, status: 'platinado', difficulty: 'media', verdict: 'masterpiece', hoursPlayed: 22.5, text: 'Exploração.', private: true });
const ALBUM = review({ id: 'rm-album', kind: 'musicas', game: { name: 'Clube da Esquina', coverUrl: null, source: 'itunes', by: 'Milton Nascimento' }, scores: { letra: 9, envolvimento: 10, vocal: 10, instrumental: 9 }, category: 'Milton Nascimento' });
const NOTE = sanitizeReview({ id: 'n-nota', kind: 'anotacoes', game: { name: 'Uma nota', coverUrl: null, source: 'manual' }, text: 'x', createdAt: AT, updatedAt: AT })!;

describe('o espelho da API: os murais em v1', () => {
  it('o desejo e o pra depois: o mural, o nome, o ano, o por, a capa e a relevância', () => {
    expect(desejoV1(WISH)).toEqual({ id: 'dj-silk', mural: 'jogos', nome: 'Silksong', ano: '2025', por: null, capa: 'https://c/silk.jpg', relevancia: 'must', criado_em: AT, versao: AT });
    expect(desejoV1(BOOK_WISH)).toEqual(jasmine.objectContaining({ mural: 'livros', por: 'Frank Herbert', relevancia: 'comum' }));
    expect(praDepoisV1(DRAFT)).toEqual({ id: 'pd-celeste', mural: 'jogos', nome: 'Celeste', ano: null, por: null, capa: null, criado_em: AT, versao: AT });
  });

  it('a ficha: as notas do mural, a final que a ficha guarda, a dificuldade só onde há, o quem vê', () => {
    const v = fichaV1(OUTER);
    expect(Object.keys(v)).toEqual([
      'id', 'mural', 'nome', 'por', 'ano', 'capa', 'forma', 'artista', 'nota_final', 'notas', 'nota_final_na_mao', 'status', 'dificuldade', 'veredito',
      'quantidade', 'texto', 'concluida_em', 'visibilidade', 'releitura_de', 'criada_em', 'versao',
    ]);
    expect(v).toEqual(jasmine.objectContaining({
      notas: { historia: 10, diversao: 10, jogabilidade: 9, visual: 9 },
      nota_final: OUTER.scores.final,
      status: 'platinado',
      dificuldade: 'media',
      veredito: 'masterpiece',
      quantidade: 22.5,
      visibilidade: 'privada',
      forma: null,
      artista: null,
    } satisfies Partial<FichaV1>));
    expect(fichaV1(ALBUM)).toEqual(jasmine.objectContaining({ forma: 'album', artista: 'Milton Nascimento', dificuldade: null, quantidade: null, visibilidade: 'publica', por: 'Milton Nascimento' }));
    expect(fichaV1(ALBUM, new Set(['rm-album'])).visibilidade).toBe('privada');
  });

  it('o contexto: os seis murais com as quatro notas e o peso, os status, a dificuldade, a quantidade e quantas fichas', () => {
    const ctx = contextoFichasV1([OUTER, ALBUM]);
    expect(ctx.murais.map((m) => m.mural)).toEqual(['jogos', 'livros', 'filmes', 'series', 'animes', 'musicas']);
    expect(ctx.murais[0]).toEqual({
      mural: 'jogos',
      nome: 'jogos',
      notas: [
        { id: 'historia', nome: 'História', peso: 1 },
        { id: 'diversao', nome: 'Diversão', peso: 2 },
        { id: 'jogabilidade', nome: 'Jogabilidade', peso: 1 },
        { id: 'visual', nome: 'Visual', peso: 1 },
      ],
      status: { incompleto: 'Incompleto', finalizado: 'Finalizado', platinado: 'Platinado' },
      dificuldade: 'Dificuldade',
      quantidade: { unidade: 'horas', fracao: true },
      releitura: 'rejogada',
      fichas: 1,
    });
    expect(ctx.murais[1]!.quantidade).toEqual({ unidade: 'páginas', fracao: false });
    expect(ctx.murais[5]!.fichas).toBe(1);
  });

  it('só as áreas pedidas, e nunca as anotações', () => {
    const src = { wishes: [WISH], drafts: [DRAFT], reviews: [OUTER, NOTE], boardOnly: new Set<string>() };
    expect(muralsMirror(src, ['desejos']).map((i) => `${i.tipo}:${i.id}`)).toEqual(['desejo:dj-silk']);
    expect(muralsMirror(src, ['fichas']).map((i) => `${i.tipo}:${i.id}`)).toEqual(['ficha:rf-outer', 'contexto-fichas:fichas']);
    expect(muralsMirror(src, ['notas'])).toEqual([]);
  });
});

describe('o espelho da API: o serviço manda os murais', () => {
  let calls: { method: string; body: any }[];
  let remote: { areas: string[]; rev: number | null; hashes: Record<string, Record<string, string>> };
  let wishes: ReturnType<typeof signal<Wish[]>>;

  function setup(areas: string[]): ApiMirror {
    calls = [];
    remote = { areas, rev: null, hashes: {} };
    wishes = signal([WISH, BOOK_WISH]);
    const account = {
      account: () => ({ codigo: 'G11T-G00D', nome: 'Igor', api: true }),
      request: async (_path: string, init: { method?: string; body?: any } = {}) => {
        calls.push({ method: init.method ?? 'GET', body: init.body });
        if (init.method === 'POST') {
          for (const i of init.body.poe) remote.hashes[i.tipo] = { ...remote.hashes[i.tipo], [i.id]: i.hash };
          for (const i of init.body.tira) delete remote.hashes[i.tipo]![i.id];
          remote.rev = init.body.rev;
          return { ok: true };
        }
        return structuredClone(remote);
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: CloudAccount, useValue: account },
        { provide: ReviewStore, useValue: { notes: signal([]), sharedIds: signal<ReadonlySet<string>>(new Set()), wishes, drafts: signal([DRAFT]), reviews: signal([OUTER, NOTE]) } },
        { provide: KanbanStore, useValue: { boardOnly: signal(new Set()), cardOf: () => null, isOnWall: () => false, categories: signal([]), boardFor: () => null, groupKanbanOnly: () => false } },
        { provide: Settings, useValue: { notesConfig: signal({ subjects: {} }), pinnedTags: signal([]) } },
        { provide: SpendingStore, useValue: { state: signal(EMPTY_SPENDING) } },
      ],
    });
    return TestBed.inject(ApiMirror);
  }

  const posts = () => calls.filter((c) => c.method === 'POST');
  const sent = (n: number) => posts()[n]!.body.poe.map((i: { tipo: string; id: string }) => `${i.tipo}:${i.id}`);

  it('as três áreas vão quando pedidas; o desejo tirado sai do espelho', async () => {
    const m = setup(['desejos', 'pra-depois', 'fichas']);
    await m.afterSync(3);
    expect(sent(0)).toEqual(['desejo:dj-silk', 'desejo:dl-duna', 'pra-depois:pd-celeste', 'ficha:rf-outer', 'contexto-fichas:fichas']);
    wishes.set([BOOK_WISH]);
    await m.afterSync(4);
    expect(posts()[1]!.body.tira).toEqual([{ tipo: 'desejo', id: 'dj-silk' }]);
  });

  it('sem as áreas dos murais, nada deles vai', async () => {
    const m = setup(['notas']);
    await m.afterSync(3);
    expect(posts()[0]!.body.poe.some((i: { tipo: string }) => ['desejo', 'pra-depois', 'ficha', 'contexto-fichas'].includes(i.tipo))).toBeFalse();
  });
});
