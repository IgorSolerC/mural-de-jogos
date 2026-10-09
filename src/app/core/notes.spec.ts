import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KIND_PROFILES, SCORED_KINDS } from './kinds';
import { LocalData } from './local-data';
import { Review, isNote, sanitizeReview, storedNote } from './review';
import { ReviewStore } from './review-store';
import { fingerprint, publicNotes } from './cloud-sync';
import { NO_FILTER, facetsOf, matchesFilter } from './wall-filter';
import { groupWall, sortWall } from './wall-view';
import { parseBackupSnapshot } from './backup-file';

/**
 * O mural de anotações: a anotação não tem nota e mora à parte (para um site antigo nunca a ver nem
 * jogar fora), as categorias filtram e ordenam o mural.
 */

class MemoryData {
  readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {}
  takeForeign(): null {
    return null;
  }
}

const NOTES_KEY = 'mural-de-jogos:anotacoes:v1';
const REVIEWS_KEY = 'mural-de-jogos:resenhas:v1';

const note = (id: string, title: string, cats: string[] = [], extra: Record<string, unknown> = {}): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: title },
    text: `Texto de ${title}`,
    bonuses: cats.map((label) => ({ label, kind: 'favor' })),
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    private: true,
    ...extra,
  })!;
const game = (id: string, name: string): Review =>
  sanitizeReview({ id, game: { name }, scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 }, createdAt: '2026-01-01T00:00:00.000Z' })!;

describe('anotações', () => {
  it('não precisam de nota; os adesivos de antes viram a categoria (o primeiro) e as tags (os outros); nada de rejogada', () => {
    const n = sanitizeReview({
      id: 'nota0001',
      kind: 'anotacoes',
      game: { name: 'Mercado', source: 'rawg', sourceId: '12', coverUrl: 'https://x.test/capa.jpg' },
      text: '- [ ] leite',
      bonuses: [{ id: 'compras', label: 'x', kind: 'contra' }, { label: 'Casa', kind: 'contra' }],
      verdict: 'masterpiece',
      revisitOf: 'outra001',
      // o tamanho da ficha (larga, alta) saiu: a anotação antiga que o tinha volta ao de sempre
      noteSize: 'alta',
    })!;
    expect(n.kind).toBe('anotacoes');
    expect(n.verdict).toBeNull();
    expect(n.revisitOf).toBeUndefined();
    expect(n.bonuses).toEqual([]);
    expect(n.category).toBe('Lista de compras');
    expect(n.tags).toEqual(['Casa']);
    expect(n.game).toEqual({ name: 'Mercado', coverUrl: 'https://x.test/capa.jpg', source: 'manual', sourceId: undefined, year: undefined, by: undefined });
    expect('noteSize' in n).toBeFalse();
  });

  it('vão para o armazenamento sem notas: um site antigo que as visse as jogaria fora, sem virar um jogo nota 0', () => {
    const stored = JSON.parse(JSON.stringify(storedNote(note('nota0001', 'Mercado'))));
    expect('scores' in stored).toBeFalse();
    // como o site antigo lê: sem a nota, a ficha não serve
    expect(sanitizeReview({ ...stored, kind: 'jogos' })).toBeNull();
    expect(sanitizeReview(stored)!.game.name).toBe('Mercado');
  });

  it('o mural de anotações fica fora das comparações, rankings e jogos', () => {
    expect(SCORED_KINDS).not.toContain('anotacoes');
    expect(KIND_PROFILES.anotacoes.categories).toEqual([]);
  });

  describe('no armazenamento', () => {
    let data: MemoryData;
    let store: ReviewStore;

    beforeEach(() => {
      data = new MemoryData();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: LocalData, useValue: data }] });
      store = TestBed.inject(ReviewStore);
    });

    it('cada parte na sua chave: a lista de resenhas nunca leva anotação', () => {
      store.add(game('rjogo001', 'Hades'));
      store.add(note('nota0001', 'Mercado'));
      TestBed.tick();
      const reviews = JSON.parse(data.getItem(REVIEWS_KEY)!);
      const notes = JSON.parse(data.getItem(NOTES_KEY)!);
      expect(reviews.map((r: Review) => r.id)).toEqual(['rjogo001']);
      expect(notes.map((r: Review) => r.id)).toEqual(['nota0001']);
      expect('scores' in notes[0]).toBeFalse();
    });

    it('o backup leva as anotações à parte, e volta igual', () => {
      store.add(game('rjogo001', 'Hades'));
      store.add(note('nota0001', 'Mercado', ['Compras']));
      const snap = store.snapshot();
      expect(snap.reviews.map((r) => r.id)).toEqual(['rjogo001']);
      expect((snap.notas as Review[]).map((r) => r.id)).toEqual(['nota0001']);
      store.importJson(JSON.stringify({ reviews: [], notas: [], deleted: {} }), 'replace');
      expect(store.reviews().length).toBe(0);
      store.importJson(JSON.stringify(snap), 'merge');
      expect(store.reviews().filter(isNote).map((r) => r.category)).toEqual(['Compras']);
    });

    it('trocar pelo backup de antes das anotações (sem o campo) não apaga as anotações daqui', () => {
      store.add(note('nota0001', 'Mercado'));
      store.importJson(JSON.stringify({ reviews: [game('rjogo002', 'Celeste')], deleted: {} }), 'replace');
      expect(store.reviews().map((r) => r.id).sort()).toEqual(['nota0001', 'rjogo002']);
    });

    it('mudar só uma anotação muda a impressão do mural (senão a nuvem não saberia)', async () => {
      store.add(note('nota0001', 'Mercado'));
      const before = await fingerprint(store.snapshot());
      store.update({ ...store.get('nota0001')!, text: 'outro', updatedAt: '2026-10-02T00:00:00.000Z' });
      expect(await fingerprint(store.snapshot())).not.toBe(before);
      // sem anotações, a impressão é a de sempre
      expect(await fingerprint({ reviews: [], drafts: [], wishes: [], deleted: { reviews: {}, drafts: {}, wishes: {} } })).toBe(
        await fingerprint({ reviews: [], notas: [], drafts: [], wishes: [], deleted: { reviews: {}, drafts: {}, wishes: {} } }),
      );
    });
  });

  it('os outros veem só as anotações publicadas, e o mural de alguém traz elas', () => {
    const pub = storedNote(note('nota0001', 'Pública', [], { private: undefined }));
    const priv = storedNote(note('nota0002', 'Privada'));
    expect(publicNotes([pub, priv]).map((n) => (n as Review).id)).toEqual(['nota0001']);
    const snap = parseBackupSnapshot(JSON.stringify({ app: 'meu-mural', version: 2, reviews: [game('rjogo001', 'Hades')], notas: publicNotes([pub, priv]) }));
    expect(snap.reviews.map((r) => r.id).sort()).toEqual(['nota0001', 'rjogo001']);
  });

  it('os filtros de categoria (uma por anotação) e de tags (qualquer uma das escolhidas); "Sem" à parte', () => {
    const list = [
      note('n0000001', 'A', [], { category: 'Trabalho', tags: ['Bugfix', 'UI'] }),
      note('n0000002', 'B', [], { category: 'Trabalho', tags: ['Feature'] }),
      note('n0000003', 'C', [], { category: 'Casa' }),
      note('n0000004', 'D'),
    ];
    const profile = KIND_PROFILES.anotacoes;
    const facets = facetsOf(list, NO_FILTER, profile);
    // Visual e Ano com uma opção só (todas lisas, todas do mesmo ano) não separam nada: ficam de fora
    expect(facets.map((f) => f.key)).toEqual(['category', 'tag']);
    const twoYears = [...list, note('n0000005', 'E', [], { completedAt: '2025-03-01' })];
    expect(facetsOf(twoYears, NO_FILTER, profile).map((f) => f.key)).toEqual(['category', 'tag', 'year']);
    expect(facets[0].options.map((o) => [o.label, o.n])).toEqual([
      ['Casa', 1],
      ['Trabalho', 2],
      ['Sem categoria', 1],
    ]);
    expect(facets[1].options.map((o) => [o.label, o.n])).toEqual([
      ['Bugfix', 1],
      ['Feature', 1],
      ['UI', 1],
      ['Sem tag', 2],
    ]);
    const only = (f: Partial<typeof NO_FILTER>) => list.filter((r) => matchesFilter(r, { ...NO_FILTER, ...f })).map((r) => r.game.name);
    expect(only({ category: ['Trabalho'] })).toEqual(['A', 'B']);
    expect(only({ category: ['Casa', 'sem'] })).toEqual(['C', 'D']);
    expect(only({ category: ['Trabalho'], tag: ['Bugfix', 'Feature'] })).toEqual(['A', 'B']);
    expect(only({ category: ['Trabalho'], tag: ['UI'] })).toEqual(['A']);
    // sem nenhuma tag no mural, o grupo de tags não aparece
    expect(facetsOf([list[2], list[3]], NO_FILTER, profile).map((f) => f.key)).toEqual(['category']);
  });

  it('ordenar por categoria agrupa pela categoria de cada uma, sem categoria no fim', () => {
    const list = [note('n0000001', 'A', [], { category: 'Viagem' }), note('n0000002', 'B'), note('n0000003', 'C', [], { category: 'Compras', tags: ['Viagem'] })];
    const order = { sort: 'categoria' as const, key: 'final' as const, direction: 'asc' as const, profile: KIND_PROFILES.anotacoes };
    const groups = groupWall(sortWall(list, order), order);
    expect(groups.map((g) => [g.label, g.summary])).toEqual([
      ['Compras', '1 anotação'],
      ['Viagem', '1 anotação'],
      ['Sem categoria', '1 anotação'],
    ]);
    const desc = { ...order, direction: 'desc' as const };
    expect(groupWall(sortWall(list, desc), desc).map((g) => g.label)).toEqual(['Viagem', 'Compras', 'Sem categoria']);
  });
});
