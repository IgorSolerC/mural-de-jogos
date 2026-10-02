import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Mural } from './mural';
import { WallView } from './wall-view';

function r(id: string, name: string, completedAt: string | null, diversao: number, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    game: { name },
    scores: { historia: 5, diversao, jogabilidade: 5, visual: 5 },
    status: 'finalizado',
    completedAt,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

describe('WallView', () => {
  let store: ReviewStore;
  let view: WallView;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    view = TestBed.inject(WallView);
    store.reviews.set([
      r('raaaa1', 'Zelda', '2024-03-10', 9, { verdict: 'masterpiece' }),
      r('rbbbb1', 'Alan Wake', '2024-03-02', 4, { status: 'incompleto' }),
      r('rcccc1', 'Hades', '2024-01-20', 7, { text: 'roguelike viciante' }),
      r('rdddd1', 'Celeste', null, 8),
    ]);
  });

  afterEach(() => localStorage.clear());

  it('por data: mais recentes primeiro, sem data sempre no fim, em seções por mês', () => {
    view.setSort('data');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda', 'Alan Wake', 'Hades', 'Celeste']);
    expect(view.groups().map((g) => g.label)).toEqual(['Março de 2024', 'Janeiro de 2024', 'Data não definida']);
    view.toggleDirection();
    expect(view.visible().map((x) => x.game.name)).toEqual(['Hades', 'Alan Wake', 'Zelda', 'Celeste']);
  });

  it('por nome, de A a Z, em seções por letra', () => {
    view.setSort('alfabetica');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Alan Wake', 'Celeste', 'Hades', 'Zelda']);
    expect(view.groups().map((g) => g.label)).toEqual(['A', 'C', 'H', 'Z']);
  });

  it('ano sem dia fica em sua própria seção e ordena sem presumir janeiro', () => {
    store.reviews.update((list) => [...list, r('year11', 'Ano lembrado', '2024', 8)]);
    view.setSort('data');
    expect(view.groups().map((g) => g.label)).toEqual(['Março de 2024', 'Janeiro de 2024', '2024, mês não lembrado', 'Data não definida']);
    view.toggleDirection();
    expect(view.visible()[0].game.name).toBe('Ano lembrado');
    expect(view.visible().at(-1)!.completedAt).toBeNull();
  });

  it('por nota: maiores primeiro, em faixas', () => {
    view.setSort('nota');
    view.scoreKey.set('diversao');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda', 'Celeste', 'Hades', 'Alan Wake']);
  });

  it('busca no nome e no texto, sem ligar para acento', () => {
    view.query.set('ROGUÉLIKE');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Hades']);
  });

  it('só mostra o mural aberto, e a nota de outro mural ordena pela Média', () => {
    store.reviews.update((list) => [
      ...list,
      sanitizeReview({ id: 'rlivro1', kind: 'livros', game: { name: 'Duna' }, scores: { historia: 9, envolvimento: 9, personagens: 9, escrita: 9 } })!,
    ]);
    expect(view.visible().length).toBe(4);
    const mural = TestBed.inject(Mural);
    mural.kind.set('livros');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Duna']);
    view.setSort('nota');
    view.scoreKey.set('diversao');
    expect(view.activeScore()).toBe('final');
    mural.kind.set('jogos');
    expect(view.activeScore()).toBe('diversao');
  });

  it('filtra por veredito e conta cada um', () => {
    view.toggle('verdict', 'masterpiece');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda']);
    const verdicts = view.facets().find((f) => f.key === 'verdict')!;
    expect(verdicts.options.find((o) => o.value === 'sem')!.n).toBe(3);
    expect(view.isFiltered()).toBeTrue();
    expect(view.filterCount()).toBe(1);
  });

  it('no mesmo grupo vale qualquer um; entre grupos, todos juntos', () => {
    view.setSort('alfabetica');
    // Médias: Zelda 6,6 · Celeste 6,2 · Hades 5,8 · Alan Wake 4,6
    view.toggle('grade', '6');
    view.toggle('grade', '5');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Celeste', 'Hades', 'Zelda']);
    view.toggle('verdict', 'masterpiece');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda']);
    // a contagem de um grupo ignora o próprio grupo e respeita os outros
    const grades = view.facets().find((f) => f.key === 'grade')!;
    expect(grades.options.find((o) => o.value === '6')!.n).toBe(1);
    expect(grades.options.find((o) => o.value === '5')!.n).toBe(0);
    view.clearFacet('verdict');
    expect(view.visible().length).toBe(3);
  });

  it('filtra por status, ano e fichas sem texto', () => {
    view.toggle('status', 'incompleto');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Alan Wake']);
    view.clearFilters();
    view.toggle('text', 'sem');
    expect(view.visible().map((x) => x.game.name)).not.toContain('Hades');
    expect(view.visible().length).toBe(3);
    view.clearFilters();
    view.toggle('year', 'sem');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Celeste']);
    expect(view.tags().map((t) => t.label)).toEqual(['Sem data']);
  });

  it('filtra fichas decoradas e lisas', () => {
    store.reviews.update((list) => [...list, r('deco11', 'Decorada', '2024-05-01', 8, { pattern: 'gatinhos' }), r('deco22', 'Manchada', '2024-05-02', 8, { stain: 'cafe' })]);
    view.setSort('alfabetica');
    view.toggle('look', 'com');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Decorada', 'Manchada']);
    view.toggle('look', 'com');
    view.toggle('look', 'sem');
    expect(view.visible().length).toBe(4);
  });

  it('limpar tira a busca e todos os filtros', () => {
    view.query.set('hades');
    view.toggle('status', 'finalizado');
    view.clearFilters();
    expect(view.isFiltered()).toBeFalse();
    expect(view.visible().length).toBe(4);
  });
});
