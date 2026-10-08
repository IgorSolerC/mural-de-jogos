import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mural } from './mural';
import { ALL_TAB, NO_CATEGORY_TAB, noteTabKey, noteTabsOf } from './note-tabs';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { WallView } from './wall-view';

let seq = 0;
const note = (title: string, category: string | null, extra: Record<string, unknown> = {}): Review =>
  sanitizeReview({
    id: `nota${++seq}`,
    kind: 'anotacoes',
    game: { name: title },
    text: `Texto de ${title}`,
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    private: true,
    ...(category ? { category } : {}),
    ...extra,
  })!;

/** Trabalho (4), Estudos (3), Receitas (1), Viagem (2) e duas sem categoria. */
function sea(): Review[] {
  return [
    note('Daily 01', 'Trabalho'),
    note('Daily 02', 'Trabalho'),
    note('Daily 03', 'Trabalho', { doneAt: '2026-10-02T10:00:00.000Z' }),
    note('Retro', 'Trabalho', { noteRank: 'fixada' }),
    note('Rust', 'Estudos', { tags: ['Rust'] }),
    note('DDD', 'Estudos', { tags: ['DDD'] }),
    note('SQL', 'Estudos', { tags: ['SQL'] }),
    note('Pão', 'Receitas'),
    note('Lisboa', 'Viagem'),
    note('Porto', 'Viagem'),
    note('Wifi', null, { noteRank: 'fixada' }),
    note('Solta', null),
  ];
}

describe('as abas do mural de anotações', () => {
  it('as categorias com 3 ou mais têm aba, de A a Z; Sem categoria no fim; as pequenas no Mais', () => {
    const tabs = noteTabsOf(sea());
    expect(tabs.main.map((t) => t.label)).toEqual(['Estudos', 'Trabalho', 'Sem categoria']);
    expect(tabs.more.map((t) => t.label)).toEqual(['Receitas', 'Viagem']);
    expect(tabs.all).toBe(12);
  });

  it('a finalizada conta para a aba existir, mas não no número dela quando está escondida', () => {
    const list = sea();
    const tabs = noteTabsOf(list, (r) => !r.doneAt);
    const work = tabs.main.find((t) => t.label === 'Trabalho')!;
    expect(work.n).toBe(3);
    expect(tabs.all).toBe(11);
  });

  it('tudo numa categoria só: nada a separar, sem abas', () => {
    const tabs = noteTabsOf([note('A', 'Trabalho'), note('B', 'Trabalho'), note('C', 'Trabalho')]);
    expect(tabs.main).toEqual([]);
    expect(tabs.more).toEqual([]);
  });

  it('a categoria vale sem ligar para acento e caixa, com a grafia mais usada', () => {
    expect(noteTabKey({ category: 'Diário' })).toBe(noteTabKey({ category: 'diario' }));
    const tabs = noteTabsOf([note('A', 'Diário'), note('B', 'Diário'), note('C', 'diario'), note('D', null)]);
    expect(tabs.main.map((t) => t.label)).toEqual(['Diário', 'Sem categoria']);
  });

  it('uma categoria chamada "Sem" não cai na aba das sem categoria', () => {
    expect(noteTabKey({ category: 'Sem' })).not.toBe(NO_CATEGORY_TAB);
  });
});

describe('WallView com abas', () => {
  let view: WallView;
  let store: ReviewStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    view = TestBed.inject(WallView);
    TestBed.inject(Mural).kind.set('anotacoes');
    store.reviews.set(sea());
  });

  afterEach(() => localStorage.clear());

  const key = (label: string) => noteTabKey({ category: label });

  it('a aba mostra só as anotações dela, com as fixadas dela no topo', () => {
    view.setNoteTab(key('Trabalho'));
    expect(view.visible().map((r) => r.game.name)).toEqual(['Retro', 'Daily 01', 'Daily 02']);
    expect(view.groups()[0].label).toBe('Fixadas');
    expect(view.doneCount()).toBe(1);
    expect(view.hiddenDone()).toBe(1);
  });

  it('a aba Sem categoria mostra as sem categoria', () => {
    view.setNoteTab(NO_CATEGORY_TAB);
    expect(view.visible().map((r) => r.game.name).sort()).toEqual(['Solta', 'Wifi']);
  });

  it('a aba fica guardada para a próxima visita', () => {
    view.setNoteTab(key('Estudos'));
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('mural-de-jogos:vista:v1')!).noteTab).toBe(key('Estudos'));
  });

  it('a aba que deixou de existir volta para Tudo', () => {
    view.setNoteTab(key('Estudos'));
    store.reviews.update((list) => list.filter((r) => r.category !== 'Estudos'));
    expect(view.activeTab()).toBe(ALL_TAB);
    expect(view.visible().length).toBe(8);
  });

  it('trocar de aba limpa os filtros e mantém a busca', () => {
    view.setNoteTab(key('Estudos'));
    view.toggle('tag', 'Rust');
    view.query.set('daily');
    view.setNoteTab(key('Trabalho'));
    expect(view.filterCount()).toBe(0);
    expect(view.query()).toBe('daily');
  });

  it('numa aba de categoria, a cartela não tem o grupo Categoria e só tem as tags da aba', () => {
    view.setNoteTab(key('Estudos'));
    const facets = view.facets();
    expect(facets.some((f) => f.key === 'category')).toBeFalse();
    expect(facets.find((f) => f.key === 'tag')!.options.map((o) => o.value)).toEqual(['DDD', 'Rust', 'SQL']);
  });

  it('a busca diz quantas outras abas falam disso', () => {
    view.setNoteTab(key('Estudos'));
    view.query.set('daily');
    expect(view.visible().length).toBe(0);
    expect(view.elsewhere()).toBe(2);
  });

  it('a anotação nova numa aba de categoria vem com ela; em Tudo e em Sem categoria, sem', () => {
    expect(view.newNoteCategory()).toBeNull();
    view.setNoteTab(key('Trabalho'));
    expect(view.newNoteCategory()).toBe('Trabalho');
    view.setNoteTab(NO_CATEGORY_TAB);
    expect(view.newNoteCategory()).toBeNull();
  });

  it('a anotação nova de outra categoria abre a aba dela', () => {
    view.setNoteTab(key('Trabalho'));
    const nova = note('Bolo', 'Receitas');
    store.reviews.update((list) => [...list, nova]);
    view.reveal(nova);
    expect(view.activeTab()).toBe(key('Receitas'));
    expect(view.visible().some((r) => r.id === nova.id)).toBeTrue();
  });
});
