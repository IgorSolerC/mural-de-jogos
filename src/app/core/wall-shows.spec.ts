import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KanbanBoard, boardIdFor } from './kanban';
import { KanbanStore } from './kanban-store';
import { Mural } from './mural';
import { NOTES_CONFIG_DEFAULT, groupShows, sanitizeNotesConfig, withPrefs } from './mural-config';
import { noteTabKey } from './note-tabs';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { StudyStore } from './study-store';
import { WallView } from './wall-view';
import { NoteFilters } from '../ui/note-filters';

/**
 * O "Mostrar também" do mural de anotações (as finalizadas, as só no Kanban, as só nos Flashcards): três
 * interruptores à parte, que cada aba abre no padrão dela (o do grupo, nas configurações do mural), ao trocar
 * de aba e ao voltar ao mural de outra página.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const DONE = '2026-10-21T10:00:00.000Z';
const key = (label: string) => noteTabKey({ category: label });

const note = (id: string, category: string, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: id }, category, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
  id,
});

function board(notes: string[]): KanbanBoard {
  return {
    id: boardIdFor('trabalho'),
    category: 'trabalho',
    at: T0,
    columns: [{ id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false }],
    cards: notes.map((n) => ({ note: n, column: 'afazer', importance: null })),
  };
}

describe('o que o grupo guarda do "Mostrar também"', () => {
  it('só os conhecidos, na ordem de sempre e sem repetir; nenhum, nada guardado', () => {
    const cfg = sanitizeNotesConfig({ categories: { trabalho: { shows: ['flashcards', 'x', 'finalizadas', 'flashcards'] }, casa: { shows: [] }, viagem: { shows: 'kanban' } } });
    expect(cfg.categories).toEqual({ trabalho: { shows: ['finalizadas', 'flashcards'] } });
    const on = withPrefs(NOTES_CONFIG_DEFAULT, 'Trabalho', { shows: ['kanban', 'finalizadas'] });
    expect(on.categories['trabalho']).toEqual({ shows: ['finalizadas', 'kanban'] });
    expect(groupShows(on).get('c:trabalho')).toEqual(new Set(['finalizadas', 'kanban']));
    expect(withPrefs(on, 'Trabalho', { shows: [] }).categories).toEqual({});
    expect(withPrefs(on, 'Trabalho', { shows: undefined }).categories).toEqual({});
  });
});

describe('o "Mostrar também" do mural de anotações', () => {
  let view: WallView;
  let settings: Settings;
  const shown = () =>
    view
      .visible()
      .map((r) => r.id)
      .sort();

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([
      note('nlivre', 'Trabalho'),
      note('nkb', 'Trabalho'),
      note('nest', 'Trabalho'),
      note('nambos', 'Trabalho'),
      note('nfeita', 'Trabalho', { doneAt: DONE }),
      note('ncasa', 'Casa'),
      note('nkanji', 'Japonês'),
    ]);
    // no quadro de Trabalho: nkb e nambos (só no Kanban, o padrão)
    TestBed.inject(KanbanStore).state.set({ boards: [board(['nkb', 'nambos'])], removed: {}, legacy: [] });
    // nos Flashcards: nest, nambos e o kanji (só nos Flashcards, o padrão do baralho)
    const study = TestBed.inject(StudyStore);
    const deck = study.addDeck('Rotinas', 'amarelo', null, undefined, 'Trabalho');
    for (const n of ['nest', 'nambos']) study.addCard(n, [deck]);
    study.addCard('nkanji', [study.addDeck('Kanjis', 'amarelo', null, undefined, 'Japonês')]);
    settings = TestBed.inject(Settings);
    view = TestBed.inject(WallView);
    TestBed.inject(Mural).kind.set('anotacoes');
    view.setNoteTab(key('Trabalho'));
  });

  afterEach(() => localStorage.clear());

  it('o Kanban e os Flashcards têm cada um o seu: a que está nos dois volta com qualquer um', () => {
    expect(shown()).toEqual(['nlivre']);
    expect([view.kanbanCount(), view.studyCount(), view.boardCount()]).toEqual([2, 2, 3]);
    view.showBoard.set(true);
    expect(shown()).toEqual(['nambos', 'nkb', 'nlivre']);
    expect(shown().filter((id) => view.shownOff().has(id))).toEqual(['nambos', 'nkb']);
    view.showBoard.set(false);
    view.showStudy.set(true);
    expect(shown()).toEqual(['nambos', 'nest', 'nlivre']);
    // as à mostra que levam a etiqueta (do Kanban, dos Flashcards)
    expect(shown().filter((id) => view.shownOff().has(id))).toEqual(['nambos', 'nest']);
    expect(view.hiddenBoard()).toBe(1);
  });

  it('o Filtrar mostra as três, cada uma com quantas', () => {
    const filters = TestBed.runInInjectionContext(() => new NoteFilters());
    expect(filters.shows().map((s) => [s.key, s.label, s.n, s.on])).toEqual([
      ['finalizadas', 'Finalizadas', 1, false],
      ['kanban', 'Só no Kanban', 2, false],
      ['flashcards', 'Só nos Flashcards', 2, false],
    ]);
    filters.toggleShow('flashcards');
    expect(view.showStudy()).toBeTrue();
    expect(view.showBoard()).toBeFalse();
    filters.clearChoices();
    expect([view.showDone(), view.showBoard(), view.showStudy()]).toEqual([false, false, false]);
  });

  it('"Mostrar aqui" liga só o lugar das escondidas', () => {
    view.showOff();
    expect([view.showBoard(), view.showStudy()]).toEqual([true, true]);
    view.setNoteTab(key('Japonês'));
    view.showOff();
    expect([view.showBoard(), view.showStudy()]).toEqual([false, true]);
  });

  it('trocar de aba abre no padrão dela; voltar à de antes também', () => {
    settings.setCategoryPrefs('Japonês', { shows: ['flashcards'] });
    view.showDone.set(true);
    view.showBoard.set(true);
    view.setNoteTab(key('Japonês'));
    expect([view.showDone(), view.showBoard(), view.showStudy()]).toEqual([false, false, true]);
    expect(shown()).toEqual(['nkanji']);
    view.showStudy.set(false);
    view.setNoteTab(key('Trabalho'));
    expect([view.showDone(), view.showBoard(), view.showStudy()]).toEqual([false, false, false]);
    view.setNoteTab(key('Japonês'));
    expect(view.showStudy()).toBeTrue();
    // tocar na aba já aberta não desfaz o que foi mudado nela
    view.showStudy.set(false);
    view.setNoteTab(key('Japonês'));
    expect(view.showStudy()).toBeFalse();
  });

  it('voltar ao mural de outra página: o padrão da aba, sem pasta nem tags, e a busca fica', () => {
    settings.setCategoryPrefs('Trabalho', { shows: ['finalizadas'] });
    TestBed.tick();
    view.showDone.set(false);
    view.showStudy.set(true);
    view.toggle('tag', 'urgente');
    view.query.set('n');
    view.enterWall();
    expect([view.showDone(), view.showBoard(), view.showStudy()]).toEqual([true, false, false]);
    expect(view.filter().tag).toEqual([]);
    expect(view.query()).toBe('n');
  });

  it('mudar o padrão do grupo aberto (nas configurações) já vale nele', () => {
    TestBed.tick();
    settings.setCategoryPrefs('Trabalho', { shows: ['kanban', 'flashcards'] });
    TestBed.tick();
    expect([view.showDone(), view.showBoard(), view.showStudy()]).toEqual([false, true, true]);
    // o de outro grupo não mexe na aberta
    view.showBoard.set(false);
    settings.setCategoryPrefs('Casa', { shows: ['finalizadas'] });
    TestBed.tick();
    expect(view.showBoard()).toBeFalse();
  });

  it('cada aba conta o que mostraria ao abrir: o grupo de flashcards que abre com eles não está vazio', () => {
    expect(view.noteTabs()!.tabs.find((t) => t.key === key('Japonês'))!.n).toBe(0);
    expect(view.emptyTabs().has(key('Japonês'))).toBeTrue();
    settings.setCategoryPrefs('Japonês', { shows: ['flashcards'] });
    expect(view.noteTabs()!.tabs.find((t) => t.key === key('Japonês'))!.n).toBe(1);
    expect(view.emptyTabs().has(key('Japonês'))).toBeFalse();
    // o aberto conta com o Filtrar de agora
    view.showDone.set(true);
    expect(view.noteTabs()!.tabs.find((t) => t.key === key('Trabalho'))!.n).toBe(2);
  });


  it('sem o Tudo em pé, o grupo em que o mural abre passa a ser o escolhido (e o padrão dele vale)', () => {
    settings.setCategoryPrefs('Trabalho', { shows: ['finalizadas'] });
    view.noteTab.set('');
    const active = view.activeTab();
    expect(active).not.toBe('');
    view.enterWall();
    expect(view.noteTab()).toBe(active);
    expect(view.showDone()).toBe(active === key('Trabalho'));
  });

  it('o Tudo conta o que ele mostraria ao abrir, e não o padrão de cada grupo', () => {
    settings.setCategoryPrefs('Japonês', { shows: ['flashcards'] });
    // nlivre, ncasa e a de Partículas não existe aqui: as do mural sem nada ligado
    expect(view.noteTabs()!.all).toBe(2);
  });
});
