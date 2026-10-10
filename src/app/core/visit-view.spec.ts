import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Colleague, ColleagueStore } from './colleague-store';
import { Mural } from './mural';
import { NO_FILTER } from './wall-filter';
import { Review, sanitizeReview } from './review';
import { VisitView } from './visit-view';
import { VISIT_KEY, WallState, WallView } from './wall-view';

const note = (id: string, title: string, category: string | null): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: title },
    text: `Texto de ${title}`,
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...(category ? { category } : {}),
  })!;

const person = (id: string, reviews: Review[]): Colleague =>
  ({ id, name: id, fileName: '', loadedAt: '2026-10-01T00:00:00Z', reviews, exportedAt: null, skipped: 0, ownerName: null }) as Colleague;

describe('VisitView', () => {
  const marina = person('Marina', [note('m1', 'Daily', 'Trabalho'), note('m2', 'Pão', 'Receitas'), note('m3', 'Solta', null)]);
  const joao = person('João', [note('j1', 'Treino', 'Saúde')]);
  let selected: ReturnType<typeof signal<Colleague | null>>;

  beforeEach(() => {
    localStorage.clear();
    selected = signal<Colleague | null>(marina);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), VisitView, { provide: ColleagueStore, useValue: { selected } }],
    });
    TestBed.inject(Mural).kind.set('anotacoes');
  });
  afterEach(() => localStorage.clear());

  it('sem nada fornecido, a vista é a do seu mural', () => {
    expect(TestBed.inject(WallState)).toBe(TestBed.inject(WallView));
  });

  it('mostra as fichas da pessoa no mural aberto, com as abas dela', () => {
    const visit = TestBed.inject(VisitView);
    expect(visit.owner()).toBe('Marina');
    expect(visit.wall().map((r) => r.game.name)).toEqual(['Daily', 'Pão', 'Solta']);
    expect(visit.noteTabs()!.tabs.map((t) => t.label)).toEqual(['Receitas', 'Trabalho', 'Sem categoria']);
  });

  it('a ordem e o tipo de ficha de quem visita não mexem nos do seu mural', () => {
    const visit = TestBed.inject(VisitView);
    const mine = TestBed.inject(WallView);
    visit.setDensity('lista');
    visit.setSort('alfabetica');
    TestBed.tick();
    expect(visit.density()).toBe('lista');
    expect(mine.density()).toBe('completa');
    expect(mine.shownSort()).toBe('prioridade');
    expect(JSON.parse(localStorage.getItem(VISIT_KEY)!).noteViews['']).toEqual({ sort: 'alfabetica', direction: 'asc', density: 'lista' });
  });

  it('a aba, a busca e as seções fechadas não ficam guardadas', () => {
    const visit = TestBed.inject(VisitView);
    visit.setNoteTab(visit.noteTabs()!.tabs[1].key);
    visit.toggleCollapsed('comuns');
    TestBed.tick();
    const kept = JSON.parse(localStorage.getItem(VISIT_KEY)!);
    expect(kept.noteTab).toBeUndefined();
    expect(kept.collapsed).toBeUndefined();
  });

  it('outra pessoa abre do começo: sem busca, sem filtros, em Tudo e com as seções abertas', () => {
    const visit = TestBed.inject(VisitView);
    TestBed.tick();
    visit.setNoteTab(visit.noteTabs()!.tabs[1].key);
    visit.query.set('daily');
    visit.toggleCollapsed('comuns');
    visit.showDone.set(true);
    selected.set(joao);
    TestBed.tick();
    expect(visit.owner()).toBe('João');
    expect(visit.query()).toBe('');
    expect(visit.filter()).toEqual(NO_FILTER);
    expect(visit.activeTab()).toBe('');
    expect(visit.isCollapsed('comuns')).toBeFalse();
    expect(visit.showDone()).toBeFalse();
  });
});
