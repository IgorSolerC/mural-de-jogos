import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DesejoV1, FichaV1, PraDepoisV1 } from '../../../contrato/api-v1/murais';
import { requestWords, undoable } from './api-requests';
import { MuralApplyContext, applyMuralRequest, muralTitle, muralWords, undoMural } from './api-requests-murals';
import { Kind, PickedGame, Review, sanitizeReview, sanitizeWish } from './review';
import { ReviewStore } from './review-store';

/**
 * Os pedidos da Wishlist, do Pra depois e das fichas aplicados pelo site (core/api-requests-murals.ts,
 * rodada 9): pôr com a busca da capa, o nome repetido, mudar a relevância e tirar com a versão, criar a
 * ficha com a nota final do Murall (e a releitura pelo nome), mudar as notas, o Desfazer e as frases.
 */

const AT = '2026-10-05T10:00:00.000Z';
const NOW = '2026-10-29T12:00:00.000Z';
const OUTER: Review = sanitizeReview({
  id: 'rf-outer', kind: 'jogos', game: { name: 'Outer Wilds', coverUrl: null, source: 'manual' }, scores: { historia: 10, diversao: 10, jogabilidade: 9, visual: 9 },
  status: 'finalizado', difficulty: 'nenhuma', verdict: null, weights: {}, bonuses: [], hoursPlayed: null, text: 'x', completedAt: '2026-09-10', createdAt: AT, updatedAt: AT,
})!;

describe('os pedidos dos murais aplicados pelo site', () => {
  let store: ReviewStore;
  let looked: { kind: Kind; name: string; year?: string }[];
  let catalog: PickedGame | null;
  const ctx = (extra: Partial<MuralApplyContext> = {}): MuralApplyContext => ({
    now: NOW,
    today: '2026-10-29',
    stamps: new Map(),
    findCover: async (kind, name, year) => {
      looked.push({ kind, name, ...(year ? { year } : {}) });
      return catalog;
    },
    ...extra,
  });
  const apply = (op: string, alvo: string, dados: unknown, c = ctx()) => applyMuralRequest(store, { op, alvo, dados }, c);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    store.reviews.set([OUTER]);
    store.saveWish(sanitizeWish({ id: 'dj-hades', kind: 'jogos', game: { name: 'Hades II', coverUrl: null, source: 'manual' }, relevance: 'later', createdAt: AT, updatedAt: AT })!);
    looked = [];
    catalog = { name: 'Hollow Knight: Silksong', coverUrl: 'https://cat/silk.jpg', source: 'rawg', sourceId: '123', year: '2025' };
  });

  afterEach(() => localStorage.clear());

  it('pôr na wishlist: a capa vem do catálogo (o nome é o da AI), a relevância, e de novo não duplica', async () => {
    const out = await apply('desejo.por', 'dj-silk', { mural: 'jogos', nome: 'Silksong', relevancia: 'must' });
    expect(out.estado).toBe('aplicado');
    expect(looked).toEqual([{ kind: 'jogos', name: 'Silksong' }]);
    const w = store.getWish('dj-silk')!;
    expect(w.game).toEqual(jasmine.objectContaining({ name: 'Silksong', coverUrl: 'https://cat/silk.jpg', source: 'rawg', year: '2025' }));
    expect(w.relevance).toBe('must');
    expect((out.resultado as { desejo: DesejoV1 }).desejo.capa).toBe('https://cat/silk.jpg');
    expect((await apply('desejo.por', 'dj-silk', { mural: 'jogos', nome: 'Silksong' })).antes).toBeNull();
    expect(store.wishes().filter((x) => x.id === 'dj-silk').length).toBe(1);
  });

  it('com capa dada ou buscar_capa false, não procura; sem achar no catálogo, entra sem capa', async () => {
    await apply('desejo.por', 'dl-duna', { mural: 'livros', nome: 'Duna', capa: 'https://minha/duna.jpg' });
    await apply('desejo.por', 'dl-cosmos', { mural: 'livros', nome: 'Cosmos', buscar_capa: false });
    expect(looked).toEqual([]);
    expect(store.getWish('dl-duna')!.game.coverUrl).toBe('https://minha/duna.jpg');
    catalog = null;
    await apply('pra-depois.por', 'pd-tunic', { mural: 'jogos', nome: 'Tunic', ano: '2022' });
    expect(looked).toEqual([{ kind: 'jogos', name: 'Tunic', year: '2022' }]);
    expect(store.getDraft('pd-tunic')!.game).toEqual(jasmine.objectContaining({ name: 'Tunic', coverUrl: null, source: 'manual', year: '2022' }));
  });

  it('o mesmo nome no mesmo mural não entra; pôr no Pra depois tira o mesmo da wishlist, como na tela', async () => {
    expect((await apply('desejo.por', 'dj-x', { mural: 'jogos', nome: 'hades ii' })).estado).toBe('falhou');
    const out = await apply('pra-depois.por', 'pd-hades', { mural: 'jogos', nome: 'Hades II', buscar_capa: false });
    expect((out.resultado as { pra_depois: PraDepoisV1 }).pra_depois.nome).toBe('Hades II');
    expect(store.getWish('dj-hades')).toBeUndefined();
  });

  it('mudar a relevância e tirar, com a versão; a versão velha (você mexeu) é conflito', async () => {
    const changed = await apply('desejo.editar', 'dj-hades', { versao: AT, relevancia: 'must' });
    expect(changed.estado).toBe('aplicado');
    expect(store.getWish('dj-hades')!.relevance).toBe('must');
    expect((changed.antes as { relevance: string }).relevance).toBe('later');
    expect((await apply('desejo.editar', 'dj-hades', { versao: AT, relevancia: 'comum' })).estado).toBe('conflito');
    const stamps = new Map([[`dj-hades@${changed.carimbo}`, AT]]);
    expect((await apply('desejo.editar', 'dj-hades', { versao: AT, relevancia: 'comum' }, ctx({ stamps }))).estado).toBe('aplicado');
    expect(store.getWish('dj-hades')!.relevance).toBeUndefined();
    const v = store.getWish('dj-hades')!.updatedAt;
    const gone = await apply('desejo.tirar', 'dj-hades', { versao: v });
    expect(gone.resultado).toEqual({ desejo: null });
    expect(store.getWish('dj-hades')).toBeUndefined();
  });

  it('criar a ficha: a nota final do Murall, privada, no dia de hoje, com a capa do catálogo; com o mesmo nome, vira a releitura', async () => {
    catalog = { name: 'Tunic', coverUrl: 'https://cat/tunic.jpg', source: 'wikipedia' };
    const out = await apply('ficha.criar', 'rf-tunic', { mural: 'jogos', nome: 'Tunic', notas: { historia: 6, diversao: 10 }, status: 'platinado', quantidade: 30 });
    expect(out.estado).toBe('aplicado');
    const f = (out.resultado as { ficha: FichaV1 }).ficha;
    // (6 × 1 + 10 × 2) / 3 = 8,7
    expect(f).toEqual(jasmine.objectContaining({ nota_final: 8.7, visibilidade: 'privada', concluida_em: '2026-10-29', status: 'platinado', quantidade: 30, capa: 'https://cat/tunic.jpg' }));
    expect(store.get('rf-tunic')!.stock).toBeDefined();
    const again = await apply('ficha.criar', 'rf-outer2', { mural: 'jogos', nome: 'Outer Wilds', notas: { diversao: 9 }, buscar_capa: false });
    expect((again.resultado as { ficha: FichaV1 }).ficha.releitura_de).toBe('rf-outer');
    expect((await apply('ficha.criar', 'rf-x', { mural: 'musicas', nome: 'Clube', notas: { diversao: 9 } })).estado).toBe('falhou');
  });

  it('mudar a ficha: as notas mandadas por cima, a final de novo pelo Murall; o Desfazer volta como era', async () => {
    const out = await apply('ficha.editar', 'rf-outer', { versao: AT, notas: { historia: 5 }, veredito: 'recomendo', texto: 'Revi.' });
    expect(out.estado).toBe('aplicado');
    const f = (out.resultado as { ficha: FichaV1 }).ficha;
    expect(f.notas).toEqual({ historia: 5, diversao: 10, jogabilidade: 9, visual: 9 });
    expect(f.nota_final).toBe(8.6);
    expect(f.veredito).toBe('recomendo');
    expect((await apply('ficha.editar', 'rf-outer', { versao: AT, notas: { escrita: 5 } })).estado).toBe('conflito');
    undoMural(store, { op: 'ficha.editar', alvo: 'rf-outer', antes: JSON.parse(JSON.stringify(out.antes)), resultado: out.resultado });
    expect(store.get('rf-outer')!.scores.historia).toBe(10);
    expect(store.get('rf-outer')!.text).toBe('x');
  });

  it('o Desfazer de pôr, tirar e criar', async () => {
    await apply('desejo.por', 'dj-silk', { mural: 'jogos', nome: 'Silksong' });
    undoMural(store, { op: 'desejo.por', alvo: 'dj-silk' });
    expect(store.getWish('dj-silk')).toBeUndefined();
    const gone = await apply('desejo.tirar', 'dj-hades', { versao: AT });
    undoMural(store, { op: 'desejo.tirar', alvo: 'dj-hades', antes: JSON.parse(JSON.stringify(gone.antes)) });
    expect(store.getWish('dj-hades')!.relevance).toBe('later');
    const made = await apply('ficha.criar', 'rf-tunic', { mural: 'jogos', nome: 'Tunic', notas: { diversao: 9 }, buscar_capa: false });
    undoMural(store, { op: 'ficha.criar', alvo: 'rf-tunic', resultado: made.resultado });
    expect(store.get('rf-tunic')).toBeUndefined();
    expect(undoable({ estado: 'aplicado', op: 'desejo.por', antes: null })).toBeTrue();
    expect(undoable({ estado: 'aplicado', op: 'ficha.criar', antes: null })).toBeTrue();
  });

  it('as frases, esperando e no histórico, e o nome que a pessoa reconhece', () => {
    expect(muralWords('desejo.por', { mural: 'jogos', nome: 'Silksong', relevancia: 'must' }, 'Silksong')).toBe('Pôr “Silksong” na wishlist dos jogos (MUST PLAY)');
    expect(requestWords('desejo.editar', { versao: AT, relevancia: 'later' }, 'Hades II', true)).toBe('mudou a relevância de “Hades II” para LATER');
    expect(requestWords('pra-depois.tirar', { versao: AT }, 'Celeste')).toBe('Tirar “Celeste” do Pra depois');
    expect(requestWords('ficha.criar', { mural: 'livros', nome: 'Duna' }, 'Duna', true)).toBe('criou a ficha de “Duna” nos livros');
    expect(requestWords('ficha.editar', { versao: AT, notas: { historia: 5 }, texto: 'x' }, 'Outer Wilds')).toBe('Mudar as notas e o texto da ficha de “Outer Wilds”');
    expect(muralTitle(store, { op: 'desejo.por', alvo: 'x', dados: { nome: 'Silksong' } })).toBe('Silksong');
    expect(muralTitle(store, { op: 'desejo.editar', alvo: 'dj-hades', dados: {} })).toBe('Hades II');
    expect(muralTitle(store, { op: 'ficha.editar', alvo: 'rf-outer', dados: {} })).toBe('Outer Wilds');
  });
});
