import { Wish } from './review';
import { coverFor } from './wish-cover-look';
import {
  NO_WISH_FILTER,
  WISHLIST_PREFS_DEFAULT,
  WishFilter,
  foundByNote,
  naturalDirection,
  sanitizeWishlistPrefs,
  sortWishes,
  wishDirectionLabel,
  wishFiltering,
  wishMatches,
  wishTagCounts,
  wishTagHex,
  wishVontadeOptions,
} from './wishlist-view';

/** A vista da Wishlist (PLANO-WISHLIST.md, 3.3, P5–P8): a ordem, a busca, os filtros e a capa da Grade. */

const at = (d: number) => new Date(Date.UTC(2026, 10, d)).toISOString();
function wish(id: string, name: string, extra: Partial<Wish> = {}): Wish {
  return { id, kind: 'jogos', game: { name, coverUrl: null, source: 'manual' }, createdAt: at(1), updatedAt: at(1), ...extra };
}
const ids = (l: readonly Wish[]) => l.map((w) => w.id);
const filter = (f: Partial<WishFilter>): WishFilter => ({ ...NO_WISH_FILTER, ...f });

describe('a vista da Wishlist', () => {
  describe('o que fica guardado no aparelho', () => {
    it('confere campo a campo; o que não serve volta ao padrão', () => {
      expect(sanitizeWishlistPrefs(null)).toEqual(WISHLIST_PREFS_DEFAULT);
      expect(sanitizeWishlistPrefs('grade')).toEqual(WISHLIST_PREFS_DEFAULT);
      expect(sanitizeWishlistPrefs({ vista: 'grade', ordem: 'ano', direcao: 'asc', vontadePrimeiro: false })).toEqual({ vista: 'grade', ordem: 'ano', direcao: 'asc', vontadePrimeiro: false });
      expect(sanitizeWishlistPrefs({ vista: 'lista', ordem: 'nota', direcao: 'cima', vontadePrimeiro: 'sim' })).toEqual(WISHLIST_PREFS_DEFAULT);
    });

    it('MUST PLAY na frente começa ligado, como era antes', () => {
      expect(WISHLIST_PREFS_DEFAULT.vontadePrimeiro).toBeTrue();
      expect(WISHLIST_PREFS_DEFAULT.vista).toBe('recortes');
    });
  });

  describe('a ordem', () => {
    const list = [
      wish('a', 'Celeste', { createdAt: at(3), game: { name: 'Celeste', coverUrl: null, source: 'manual', year: '2018' } }),
      wish('b', 'Hades', { createdAt: at(5), relevance: 'later', game: { name: 'Hades', coverUrl: null, source: 'manual', year: '2020' } }),
      wish('c', 'Outer Wilds', { createdAt: at(1), relevance: 'must', game: { name: 'Outer Wilds', coverUrl: null, source: 'manual' } }),
      wish('d', 'Ápice', { createdAt: at(4), game: { name: 'Ápice', coverUrl: null, source: 'manual', year: '2023' } }),
    ];

    it('Quando entrou: os mais novos primeiro; invertido, os mais antigos', () => {
      expect(ids(sortWishes(list, { ordem: 'recentes', direcao: 'desc', vontadePrimeiro: false }))).toEqual(['b', 'd', 'a', 'c']);
      expect(ids(sortWishes(list, { ordem: 'recentes', direcao: 'asc', vontadePrimeiro: false }))).toEqual(['c', 'a', 'd', 'b']);
    });

    it('Nome: de A a Z sem ligar para o acento; invertido, de Z a A', () => {
      expect(ids(sortWishes(list, { ordem: 'nome', direcao: 'asc', vontadePrimeiro: false }))).toEqual(['d', 'a', 'b', 'c']);
      expect(ids(sortWishes(list, { ordem: 'nome', direcao: 'desc', vontadePrimeiro: false }))).toEqual(['c', 'b', 'a', 'd']);
    });

    it('Lançamento: o ano do catálogo; sem ano vai para o fim nas duas direções', () => {
      expect(ids(sortWishes(list, { ordem: 'ano', direcao: 'desc', vontadePrimeiro: false }))).toEqual(['d', 'b', 'a', 'c']);
      expect(ids(sortWishes(list, { ordem: 'ano', direcao: 'asc', vontadePrimeiro: false }))).toEqual(['a', 'b', 'd', 'c']);
    });

    it('MUST 1º: MUST PLAY na frente e LATER no fim, a ordem dentro de cada vontade', () => {
      expect(ids(sortWishes(list, { ordem: 'nome', direcao: 'asc', vontadePrimeiro: true }))).toEqual(['c', 'd', 'a', 'b']);
    });

    it('cada ordem tem a direção dela ao ser escolhida, e o nome da direção', () => {
      expect(naturalDirection('recentes')).toBe('desc');
      expect(naturalDirection('nome')).toBe('asc');
      expect(naturalDirection('ano')).toBe('desc');
      expect(wishDirectionLabel('nome', 'asc')).toBe('De A a Z');
      expect(wishDirectionLabel('ano', 'desc')).toBe('Lançamentos mais novos primeiro');
    });
  });

  describe('a busca e os filtros', () => {
    const w1 = wish('w1', 'Celeste', { tags: ['Curto', 'história'], note: 'Indicação do Rafa' });
    const w2 = wish('w2', 'Hades', { tags: ['co-op'], relevance: 'must' });
    const w3 = wish('w3', 'Signalis');

    it('a busca acha no nome e no lembrete, sem acento nem caixa', () => {
      expect(wishMatches(w1, filter({ query: 'celes' }))).toBeTrue();
      expect(wishMatches(w1, filter({ query: 'INDICACAO' }))).toBeTrue();
      expect(wishMatches(w2, filter({ query: 'rafa' }))).toBeFalse();
      expect(foundByNote(w1, 'rafa')).toBeTrue();
      expect(foundByNote(w1, 'celeste')).toBeFalse();
    });

    it('a vontade escolhida', () => {
      expect([w1, w2, w3].filter((w) => wishMatches(w, filter({ vontade: 'must' })))).toEqual([w2]);
      expect([w1, w2, w3].filter((w) => wishMatches(w, filter({ vontade: 'comum' })))).toEqual([w1, w3]);
    });

    it('as tags ligadas: qualquer uma delas; a escondida tira, e vale mais que a ligada', () => {
      const all = [w1, w2, w3];
      expect(ids(all.filter((w) => wishMatches(w, filter({ on: new Set(['curto', 'co-op']) }))))).toEqual(['w1', 'w2']);
      expect(ids(all.filter((w) => wishMatches(w, filter({ out: new Set(['historia']) }))))).toEqual(['w2', 'w3']);
      expect(ids(all.filter((w) => wishMatches(w, filter({ on: new Set(['curto']), out: new Set(['historia']) }))))).toEqual([]);
    });

    it('filtrando: a busca com letra, a vontade ou alguma tag', () => {
      expect(wishFiltering(NO_WISH_FILTER)).toBeFalse();
      expect(wishFiltering(filter({ query: '  ' }))).toBeFalse();
      expect(wishFiltering(filter({ out: new Set(['x']) }))).toBeTrue();
    });

    it('as tags contadas: a grafia mais usada, as mais usadas primeiro', () => {
      const list = [wish('a', 'A', { tags: ['Co-op'] }), wish('b', 'B', { tags: ['co-op', 'curto'] }), wish('c', 'C', { tags: ['co-op'] })];
      expect(wishTagCounts(list)).toEqual([
        { key: 'co-op', label: 'co-op', n: 3 },
        { key: 'curto', label: 'curto', n: 1 },
      ]);
    });

    it('as vontades da folha, com quantos tem cada uma e o nome do mural', () => {
      const v = wishVontadeOptions([w1, w2, w3], 'livros', 'must');
      expect(v.map((x) => [x.label, x.n, x.on])).toEqual([
        ['MUST READ', 1, true],
        ['Comum', 2, false],
        ['LATER', 0, false],
      ]);
    });

    it('a cor da tag é a do mural dela, sem caixa nem acento; sem cor, null', () => {
      const colors = { 'jogos|historia': 'azul' as const };
      expect(wishTagHex(colors, 'jogos', 'História')).toMatch(/^#/);
      expect(wishTagHex(colors, 'livros', 'História')).toBeNull();
      expect(wishTagHex(colors, 'jogos', 'curto')).toBeNull();
    });
  });

  describe('a capa da Grade', () => {
    it('o mesmo jeito para o mesmo id, e uns poucos acidentes entre muitas', () => {
      expect(coverFor('wk7Hq2')).toEqual(coverFor('wk7Hq2'));
      const looks = Array.from({ length: 300 }, (_, i) => coverFor(`id-${i}`));
      const accidents = looks.filter((l) => l.kind).length / looks.length;
      expect(accidents).toBeGreaterThan(0.25);
      expect(accidents).toBeLessThan(0.55);
      expect(looks.every((l) => Math.abs(l.tilt) <= 0.8)).toBeTrue();
      expect(looks.every((l) => (l.clip !== null) === (l.kind === 'rasgo' || l.kind === 'canto'))).toBeTrue();
      const old = looks.filter((l) => l.old).length / looks.length;
      expect(old).toBeGreaterThan(0.1);
      expect(old).toBeLessThan(0.3);
    });
  });
});
