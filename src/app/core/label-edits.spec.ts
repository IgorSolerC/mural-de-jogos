import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KanbanBoard, KanbanState, boardIdFor, mergeKanban, moveBoardCategory } from './kanban';
import { KanbanStore } from './kanban-store';
import { LabelEdits, configMoved, looksMoved, notesWithCategory, notesWithTag, pinnedMoved } from './label-edits';
import { NOTES_CONFIG_DEFAULT } from './mural-config';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { SharedStore } from './shared-store';

const T0 = '2026-10-01T10:00:00.000Z';
const AT = '2026-10-17T10:00:00.000Z';

const note = (id: string, category: string | null, tags: string[] = []): Review =>
  ({
    ...sanitizeReview({
      kind: 'anotacoes',
      game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
      completedAt: '2026-10-01',
      createdAt: T0,
      updatedAt: T0,
      ...(category ? { category } : {}),
      ...(tags.length ? { tags } : {}),
    })!,
    id,
  });

const board = (category: string, cards: KanbanBoard['cards'], columns = ['A fazer', 'Feito']): KanbanBoard => ({
  id: boardIdFor(category),
  category,
  at: T0,
  columns: columns.map((name, i) => ({ id: `${category}-${i}`, name, icon: 'circulo', color: 'cinza', finishes: false })),
  cards,
});

/** Renomear e apagar categorias e tags: as anotações e tudo o que guarda o nome delas. */
describe('renomear e apagar categorias e tags', () => {
  describe('as funções', () => {
    const notes = [note('n1', 'Trabalho', ['Bug', 'urgente']), note('n2', 'trabalho', ['bug']), note('n3', 'Estudos', ['Urgente', 'Bug'])];

    it('a categoria: todas as grafias mudam; null tira; a que já tem o nome não muda', () => {
      const out = notesWithCategory(notes, 'trabalho', 'Projeto', AT);
      expect(out.map((r) => [r.id, r.category, r.updatedAt])).toEqual([
        ['n1', 'Projeto', AT],
        ['n2', 'Projeto', AT],
      ]);
      const gone = notesWithCategory(notes, 'estudos', null, AT);
      expect(gone.length).toBe(1);
      expect('category' in gone[0]).toBeFalse();
      expect(notesWithCategory([note('n4', 'Trabalho')], 'trabalho', 'Trabalho', AT)).toEqual([]);
    });

    it('a tag: no mesmo lugar, sem repetir na anotação que já tinha a outra; sem nenhuma, o campo sai', () => {
      expect(notesWithTag(notes, 'bug', 'Erro', AT).map((r) => r.tags)).toEqual([['Erro', 'urgente'], ['Erro'], ['Urgente', 'Erro']]);
      expect(notesWithTag(notes, 'bug', 'Urgente', AT).map((r) => r.tags)).toEqual([['Urgente'], ['Urgente'], ['Urgente']]);
      const gone = notesWithTag([note('n5', null, ['bug'])], 'bug', null, AT);
      expect('tags' in gone[0]).toBeFalse();
    });

    it('a cor e os padrões vão para o nome novo; juntando, valem os da que já existia', () => {
      expect(looksMoved({ trabalho: { color: 'azul' } }, 'trabalho', 'projeto')).toEqual({ projeto: { color: 'azul' } });
      expect(looksMoved({ trabalho: { color: 'azul' }, estudos: { color: 'verde' } }, 'trabalho', 'estudos')).toEqual({ estudos: { color: 'verde' } });
      expect(looksMoved({ trabalho: { color: 'azul' } }, 'trabalho', null)).toEqual({});
      const cfg = { ...NOTES_CONFIG_DEFAULT, order: ['estudos', 'trabalho', 'casa'], categories: { trabalho: { hidden: true as const } } };
      expect(configMoved(cfg, 'trabalho', 'projeto')).toEqual({ ...cfg, order: ['estudos', 'projeto', 'casa'], categories: { projeto: { hidden: true } } });
      expect(configMoved(cfg, 'trabalho', 'casa')).toEqual({ ...cfg, order: ['estudos', 'casa'], categories: { casa: { hidden: true } } });
      expect(configMoved(cfg, 'trabalho', null)).toEqual({ ...cfg, order: ['estudos', 'casa'], categories: {} });
      expect(pinnedMoved(['Bug', 'Ideia'], 'bug', 'Ideia')).toEqual(['Ideia']);
      expect(pinnedMoved(['Bug', 'Ideia'], 'bug', null)).toEqual(['Ideia']);
    });

    it('o quadro do Kanban passa para o nome novo, e o de antes não volta de outro aparelho', () => {
      const old = board('trabalho', [{ note: 'n1', column: 'trabalho-1', importance: 'critico' }]);
      const st: KanbanState = { boards: [old], removed: {}, legacy: [] };
      const moved = moveBoardCategory(st, 'trabalho', 'projeto', AT);
      expect(moved.boards.map((b) => [b.id, b.category, b.at])).toEqual([[boardIdFor('projeto'), 'projeto', AT]]);
      expect(moved.boards[0].cards).toEqual(old.cards);
      expect(moved.removed[old.id]).toBe(AT);
      // o outro aparelho ainda tem o quadro de antes: a junção não o traz de volta
      expect(mergeKanban(moved, st).boards.map((b) => b.id)).toEqual([boardIdFor('projeto')]);
      // apagar a categoria tira o quadro
      expect(moveBoardCategory(st, 'trabalho', null, AT).boards).toEqual([]);
      // sem quadro guardado (o de sempre), nada muda
      expect(moveBoardCategory(st, 'estudos', 'casa', AT)).toBe(st);
    });

    it('juntando, as anotações do quadro de antes entram no da outra: coluna de mesmo nome, senão a primeira', () => {
      const old = board('trabalho', [
        { note: 'n1', column: 'trabalho-1', importance: null },
        { note: 'n2', column: 'trabalho-2', importance: null },
        { note: 'n3', column: 'trabalho-0', importance: null },
      ], ['A fazer', 'Feito', 'Revisão']);
      const target = board('estudos', [{ note: 'n3', column: 'estudos-0', importance: null }], ['A fazer', 'Feito']);
      const moved = moveBoardCategory({ boards: [old, target], removed: {}, legacy: [] }, 'trabalho', 'estudos', AT);
      expect(moved.boards.length).toBe(1);
      expect(moved.boards[0].cards.map((c) => [c.note, c.column])).toEqual([
        ['n3', 'estudos-0'],
        ['n1', 'estudos-1'],
        ['n2', 'estudos-0'],
      ]);
    });
  });

  describe('o serviço', () => {
    let store: ReviewStore;
    let settings: Settings;
    let kanban: KanbanStore;
    let edits: LabelEdits;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      settings = TestBed.inject(Settings);
      kanban = TestBed.inject(KanbanStore);
      edits = TestBed.inject(LabelEdits);
      store.reviews.set([note('n1', 'Trabalho', ['Bug']), note('n2', 'Trabalho'), note('n3', 'Estudos', ['bug'])]);
    });
    afterEach(() => localStorage.clear());

    it('renomeia a categoria em tudo: anotações, cor, padrões e o quadro', () => {
      settings.setCategoryLook('Trabalho', { color: 'azul' });
      settings.setCategoryPrefs('Trabalho', { audience: 'publicar' });
      kanban.state.set({ boards: [board('trabalho', [{ note: 'n1', column: 'trabalho-0', importance: null }])], removed: {}, legacy: [] });
      expect(edits.categoryUses('trabalho')).toBe(2);
      expect(edits.existingCategory('estudos', 'Trabalho')).toBe('Estudos');
      expect(edits.existingCategory('TRABALHO', 'Trabalho')).toBeNull();
      expect(edits.renameCategory('Trabalho', '  projeto  ')).toEqual({ changed: 2, skipped: 0 });
      expect(store.notes().map((r) => r.category)).toEqual(['Projeto', 'Projeto', 'Estudos']);
      expect(settings.categoryLook('Projeto')).toEqual({ color: 'azul' });
      expect(settings.notesConfig().categories['projeto']).toEqual({ audience: 'publicar' });
      expect(kanban.boardFor('Projeto').cards.map((c) => c.note)).toEqual(['n1']);
      expect(kanban.get(boardIdFor('trabalho'))).toBeUndefined();
    });

    it('a compartilhada em que a pessoa não gere fica como está', () => {
      spyOn(TestBed.inject(SharedStore), 'role').and.callFake((id: string) => (id === 'n2' ? 'editor' : id === 'n3' ? 'gestor' : null));
      expect(edits.renameCategory('Trabalho', 'Projeto')).toEqual({ changed: 1, skipped: 1 });
      // o gestor muda, como o dono
      expect(edits.renameTag('bug', null)).toEqual({ changed: 2, skipped: 0 });
    });

    it('apaga a tag de todas as anotações, com a cor e a fixa', () => {
      settings.setTagColor('Bug', 'vermelho');
      settings.togglePinnedTag('BUG');
      expect(edits.tagUses('bug')).toBe(2);
      expect(edits.renameTag('Bug', null)).toEqual({ changed: 2, skipped: 0 });
      expect(store.notes().some((r) => r.tags?.length)).toBeFalse();
      expect(settings.tagColor('bug')).toBeUndefined();
      expect(settings.pinnedTags()).toEqual([]);
    });

    it('um nome vazio não muda nada', () => {
      expect(edits.renameCategory('Trabalho', '   ')).toEqual({ changed: 0, skipped: 0 });
      expect(edits.renameTag('Bug', '#')).toEqual({ changed: 0, skipped: 0 });
      expect(store.notes().map((r) => r.category)).toEqual(['Trabalho', 'Trabalho', 'Estudos']);
    });
  });
});
