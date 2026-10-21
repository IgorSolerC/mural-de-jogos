import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KanbanBoard, KanbanState, boardIdFor, mergeKanban, moveBoardCategory } from './kanban';
import { KanbanStore } from './kanban-store';
import { LabelEdits, configMoved, tagConfigMoved, looksMoved, notesWithCategory, notesWithTag, pinnedMoved, tagLookMoved, tagLooksMoved } from './label-edits';
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

    it('a tag: só na categoria, no mesmo lugar, sem repetir na anotação que já tinha a outra; sem nenhuma, o campo sai', () => {
      expect(notesWithTag(notes, 'trabalho', 'bug', 'Erro', AT).map((r) => [r.id, r.tags])).toEqual([
        ['n1', ['Erro', 'urgente']],
        ['n2', ['Erro']],
      ]);
      expect(notesWithTag(notes, 'trabalho', 'bug', 'Urgente', AT).map((r) => r.tags)).toEqual([['Urgente'], ['Urgente']]);
      expect(notesWithTag(notes, 'estudos', 'bug', null, AT).map((r) => r.tags)).toEqual([['Urgente']]);
      // "" é a anotação sem categoria
      const gone = notesWithTag([note('n5', null, ['bug']), note('n6', 'Casa', ['bug'])], '', 'bug', null, AT);
      expect(gone.map((r) => r.id)).toEqual(['n5']);
      expect('tags' in gone[0]).toBeFalse();
    });

    it('a cor da tag na categoria vai com o nome novo, mesmo a de sempre; juntando, fica a da outra', () => {
      const looks = { '#bug': { color: 'azul' as const }, '##trabalho#bug': { color: 'rosa' as const }, '##trabalho#erro': { color: 'verde' as const } };
      expect(tagLookMoved(looks, 'trabalho', 'Bug', 'Falha', false)).toEqual({ '#bug': { color: 'azul' }, '##trabalho#falha': { color: 'rosa' }, '##trabalho#erro': { color: 'verde' } });
      expect(tagLookMoved(looks, 'trabalho', 'Bug', 'Erro', true)).toEqual({ '#bug': { color: 'azul' }, '##trabalho#erro': { color: 'verde' } });
      // nos Estudos ela tinha a de sempre: o nome novo leva a cor, e a de sempre fica para as outras
      expect(tagLookMoved(looks, 'estudos', 'Bug', 'Falha', false)['##estudos#falha']).toEqual({ color: 'azul' });
      expect(tagLookMoved(looks, 'trabalho', 'Bug', null, false)).toEqual({ '#bug': { color: 'azul' }, '##trabalho#erro': { color: 'verde' } });
      // sem cor, continua sem, mesmo que o nome novo tenha uma cor de sempre
      expect(tagLookMoved({ '#falha': { color: 'roxo' } }, 'casa', 'Bug', 'Falha', false)['##casa#falha']).toEqual({ none: true });
    });

    it('a categoria renomeada leva as cores das tags dela; só as dela', () => {
      const looks = { '##trabalho#bug': { color: 'rosa' as const }, '##trabalho##x#bug': { color: 'azul' as const }, '##projeto#bug': { color: 'verde' as const }, '##trabalho#ideia': { color: 'roxo' as const } };
      expect(tagLooksMoved(looks, 'trabalho', 'projeto')).toEqual({ '##trabalho##x#bug': { color: 'azul' }, '##projeto#bug': { color: 'verde' }, '##projeto#ideia': { color: 'roxo' } });
      expect(tagLooksMoved(looks, 'trabalho', '')).toEqual({ '##trabalho##x#bug': { color: 'azul' }, '##projeto#bug': { color: 'verde' }, '###bug': { color: 'rosa' }, '###ideia': { color: 'roxo' } });
    });

    it('a cor e os padrões vão para o nome novo; juntando, valem os da que já existia', () => {
      expect(looksMoved({ trabalho: { color: 'azul' } }, 'trabalho', 'projeto')).toEqual({ projeto: { color: 'azul' } });
      expect(looksMoved({ trabalho: { color: 'azul' }, estudos: { color: 'verde' } }, 'trabalho', 'estudos')).toEqual({ estudos: { color: 'verde' } });
      expect(looksMoved({ trabalho: { color: 'azul' } }, 'trabalho', null)).toEqual({});
      const cfg = { ...NOTES_CONFIG_DEFAULT, order: ['estudos', 'trabalho', 'casa'], categories: { trabalho: { hidden: true as const } } };
      expect(configMoved(cfg, 'trabalho', 'projeto')).toEqual({ ...cfg, order: ['estudos', 'projeto', 'casa'], categories: { projeto: { hidden: true } } });
      expect(configMoved(cfg, 'trabalho', 'casa')).toEqual({ ...cfg, order: ['estudos', 'casa'], categories: { casa: { hidden: true } } });
      expect(configMoved(cfg, 'trabalho', null)).toEqual({ ...cfg, order: ['estudos', 'casa'], categories: {} });
      // as tags que nascem escondidas vão com a categoria (apagada: para as sem categoria)
      const hid = { ...NOTES_CONFIG_DEFAULT, hiddenTags: ['##trabalho#bug', '##trabalho#a#b', '##estudos#bug'] };
      expect(configMoved(hid, 'trabalho', 'projeto').hiddenTags).toEqual(['##projeto#bug', '##projeto#a#b', '##estudos#bug']);
      expect(configMoved(hid, 'trabalho', 'estudos').hiddenTags).toEqual(['##estudos#bug', '##estudos#a#b']);
      expect(configMoved(hid, 'trabalho', null).hiddenTags).toEqual(['###bug', '###a#b', '##estudos#bug']);
      expect(pinnedMoved(['Bug', 'Ideia'], 'bug', 'Ideia')).toEqual(['Ideia']);
      expect(pinnedMoved(['Bug', 'Ideia'], 'bug', null)).toEqual(['Ideia']);
    });

    it('o filtro padrão da tag vai com o nome novo; apagada ou juntada, sai (na junção vale o da outra)', () => {
      const cfg = { ...NOTES_CONFIG_DEFAULT, hiddenTags: ['##pessoal#desabafo'] };
      expect(tagConfigMoved(cfg, 'pessoal', 'Desabafo', 'Diário', false).hiddenTags).toEqual(['##pessoal#diario']);
      expect(tagConfigMoved(cfg, 'pessoal', 'Desabafo', 'Diário', true).hiddenTags).toEqual([]);
      expect(tagConfigMoved(cfg, 'pessoal', 'Desabafo', null, false).hiddenTags).toEqual([]);
      expect(tagConfigMoved(cfg, 'pessoal', 'Desabafo', 'DESABAFO', false)).toBe(cfg);
      expect(tagConfigMoved(cfg, 'trabalho', 'Desabafo', 'Diário', false)).toBe(cfg);
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
      expect(edits.renameCategory('Trabalho', '  projeto  ')).toEqual({ changed: 2 });
      expect(store.notes().map((r) => r.category)).toEqual(['Projeto', 'Projeto', 'Estudos']);
      expect(settings.categoryLook('Projeto')).toEqual({ color: 'azul' });
      expect(settings.notesConfig().categories['projeto']).toEqual({ audience: 'publicar' });
      expect(kanban.boardFor('Projeto').cards.map((c) => c.note)).toEqual(['n1']);
      expect(kanban.get(boardIdFor('trabalho'))).toBeUndefined();
    });

    it('a compartilhada muda também, em qualquer papel: o grupo e as tags dela são de cada um', () => {
      spyOn(TestBed.inject(SharedStore), 'role').and.callFake((id: string) => (id === 'n2' ? 'leitor' : id === 'n3' ? 'editor' : null));
      expect(edits.renameCategory('Trabalho', 'Projeto')).toEqual({ changed: 2 });
      expect(edits.renameTag('bug', 'Estudos', null)).toEqual({ changed: 1 });
    });

    it('apaga a tag só da categoria; a fixa sai quando ela não está em mais nenhuma anotação', () => {
      settings.setTagColor('Bug', 'vermelho', 'Trabalho');
      settings.setTagColor('Bug', 'azul', 'Estudos');
      settings.togglePinnedTag('BUG');
      expect(edits.tagUses('bug', 'Trabalho')).toBe(1);
      expect(edits.renameTag('Bug', 'Trabalho', null)).toEqual({ changed: 1 });
      expect(store.notes().map((r) => r.tags ?? [])).toEqual([[], [], ['bug']]);
      expect(settings.tagColor('bug', 'Trabalho')).toBeUndefined();
      expect(settings.tagColor('bug', 'Estudos')).toBe('azul');
      expect(settings.pinnedTags()).toEqual(['BUG']);
      edits.renameTag('bug', 'Estudos', null);
      expect(settings.pinnedTags()).toEqual([]);
    });

    it('renomeia a tag só na categoria, com a cor dela ali', () => {
      settings.setTagColor('Bug', 'rosa', 'Trabalho');
      expect(edits.existingTag('BUG', 'Ideia', 'Estudos')).toBe('bug');
      expect(edits.existingTag('Ideia', 'Bug', 'Estudos')).toBeNull();
      expect(edits.renameTag('Bug', 'Trabalho', 'Falha')).toEqual({ changed: 1 });
      expect(store.notes().map((r) => r.tags ?? [])).toEqual([['Falha'], [], ['bug']]);
      expect(settings.tagColor('Falha', 'Trabalho')).toBe('rosa');
      expect(settings.tagColor('bug', 'Trabalho')).toBeUndefined();
    });

    it('a categoria renomeada leva as cores das tags dela', () => {
      settings.setTagColor('Bug', 'rosa', 'Trabalho');
      edits.renameCategory('Trabalho', 'Projeto');
      expect(settings.tagColor('bug', 'Projeto')).toBe('rosa');
      expect(settings.categoryLooks()['##trabalho#bug']).toBeUndefined();
    });

    it('um nome vazio não muda nada', () => {
      expect(edits.renameCategory('Trabalho', '   ')).toEqual({ changed: 0 });
      expect(edits.renameTag('Bug', 'Trabalho', '#')).toEqual({ changed: 0 });
      expect(store.notes().map((r) => r.category)).toEqual(['Trabalho', 'Trabalho', 'Estudos']);
    });
  });
});
