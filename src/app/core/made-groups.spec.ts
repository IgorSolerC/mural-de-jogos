import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { contextoV1 } from './api-mirror';
import { folderTree } from './folders';
import { boardCategories, boardIdFor } from './kanban';
import { KanbanStore } from './kanban-store';
import { LabelEdits } from './label-edits';
import { madeGroups, sanitizeNotesConfig, withPrefs, NOTES_CONFIG_DEFAULT } from './mural-config';
import { categoryLibrary } from './note-labels';
import { noteTabsOf } from './note-tabs';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { SharedGroupsStore } from './shared-groups-store';
import { SharedGroup } from './shared-groups';
import { StudyStore } from './study-store';
import type { Deck } from './study';

const T0 = '2026-11-01T10:00:00.000Z';

const note = (id: string, category: string | null): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
    completedAt: '2026-11-01',
    createdAt: T0,
    updatedAt: T0,
    ...(category ? { category } : {}),
  })!,
  id,
});

/** O grupo criado à mão, sem anotação (o "Novo grupo" do "Mais", PLANO-NOVO-GRUPO.md, parte 1). */
describe('o grupo criado à mão (os dados)', () => {
  describe('as configurações', () => {
    it('guardam o nome como foi escrito; o de outra chave e o vazio saem, e o grupo só com o nome é guardado', () => {
      const cfg = sanitizeNotesConfig({ categories: { viagens: { name: '  Viagens  ' }, casa: { name: 'Trabalho', hidden: true }, nada: { name: '   ' } } });
      expect(cfg.categories).toEqual({ viagens: { name: 'Viagens' }, casa: { hidden: true } });
      expect(madeGroups(cfg)).toEqual([{ key: 'viagens', label: 'Viagens' }]);
      // tirar o nome (e nada mais) deixa de guardar o grupo
      expect(withPrefs(cfg, 'Viagens', { name: undefined }).categories['viagens']).toBeUndefined();
      expect(madeGroups(NOTES_CONFIG_DEFAULT)).toEqual([]);
    });
  });

  describe('as listas de grupos', () => {
    const notes = [note('n1', 'Trabalho'), note('n2', 'Trabalho'), note('n3', 'Estudos')];
    const made = [
      { key: 'viagens', label: 'Viagens' },
      { key: 'trabalho', label: 'trabalho' },
    ];

    it('as abas do mural: o criado vazio tem a aba (0), e o que tem anotação fica com a grafia delas', () => {
      const tabs = noteTabsOf(notes, undefined, undefined, null, made.map((g) => g.label));
      expect(tabs.tabs.map((t) => [t.key, t.label, t.n, t.total])).toEqual([
        ['c:trabalho', 'Trabalho', 2, 2],
        ['c:estudos', 'Estudos', 1, 1],
        ['c:viagens', 'Viagens', 0, 0],
      ]);
      // com tudo num grupo só, o criado já dá o que separar
      expect(noteTabsOf([note('n1', 'Trabalho')]).tabs).toEqual([]);
      expect(noteTabsOf([note('n1', 'Trabalho')], undefined, undefined, null, ['Viagens']).tabs.length).toBe(2);
      // na ordem montada à mão, ele vai no lugar dele
      expect(noteTabsOf(notes, undefined, undefined, ['viagens', 'estudos'], ['Viagens']).tabs.map((t) => t.key)).toEqual(['c:viagens', 'c:estudos', 'c:trabalho']);
    });

    it('os quadros do Kanban (e por eles os Flashcards e o Quadro livre): o criado com 0 anotações', () => {
      expect(boardCategories(notes, null, made)).toEqual([
        { key: 'trabalho', label: 'Trabalho', notes: 2 },
        { key: 'estudos', label: 'Estudos', notes: 1 },
        { key: 'viagens', label: 'Viagens', notes: 0 },
      ]);
    });

    it('os seletores de grupo oferecem o criado, sem repetir', () => {
      const labels = categoryLibrary(notes, made).map((b) => b.label);
      expect(labels).toContain('Viagens');
      expect(labels.filter((l) => l.toLowerCase() === 'trabalho').length).toBe(1);
    });

    it('o contexto da API tem o criado, com 0 notas e sem pastas', () => {
      const ctx = contextoV1(notes, folderTree([]), [], made);
      expect(ctx.grupos.map((g) => [g.nome, g.notas])).toEqual([
        ['Trabalho', 2],
        ['Estudos', 1],
        ['Viagens', 0],
      ]);
      expect(ctx.grupos[2].pastas).toEqual([]);
    });
  });

  describe('criar, renomear e apagar (LabelEdits)', () => {
    let store: ReviewStore;
    let settings: Settings;
    let edits: LabelEdits;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      settings = TestBed.inject(Settings);
      edits = TestBed.inject(LabelEdits);
      store.reviews.set([note('n1', 'Trabalho'), note('n2', 'Estudos')]);
    });
    afterEach(() => localStorage.clear());

    it('cria o grupo sem anotação, com uma cor sorteada; ele aparece no Kanban', () => {
      expect(edits.createCategory('  #Viagens ')).toEqual({ label: 'Viagens', created: true });
      expect(settings.madeGroups()).toEqual([{ key: 'viagens', label: 'Viagens' }]);
      expect(settings.categoryLook('Viagens').color).toBeTruthy();
      expect(TestBed.inject(KanbanStore).categories().map((c) => c.label)).toContain('Viagens');
      expect(store.notes().length).toBe(2);
    });

    it('a cor que o grupo já tinha fica', () => {
      settings.setCategoryLook('Viagens', { color: 'azul', icon: 'lapis' });
      edits.createCategory('Viagens');
      expect(settings.categoryLook('Viagens')).toEqual({ color: 'azul', icon: 'lapis' });
    });

    it('o nome de um grupo que já existe (das anotações, criado, compartilhado) não cria nada: devolve ele', () => {
      expect(edits.createCategory('TRABALHO')).toEqual({ label: 'Trabalho', created: false });
      expect(settings.madeGroups()).toEqual([]);
      edits.createCategory('Viagens');
      expect(edits.createCategory('viagens')).toEqual({ label: 'Viagens', created: false });
      spyOn(TestBed.inject(SharedGroupsStore), 'ofCategory').and.callFake((c) => (c === 'Clube' ? ({ id: 'g1' } as SharedGroup) : undefined));
      expect(edits.createCategory('Clube')).toEqual({ label: 'Clube', created: false });
      expect(settings.madeGroups().map((g) => g.label)).toEqual(['Viagens']);
      expect(edits.createCategory('  # ')).toBeNull();
    });

    it('o grupo que só existe por um baralho fica criado com a grafia dele; sem lugar nas configurações, nada', () => {
      spyOn(TestBed.inject(StudyStore), 'decks').and.returnValue([{ group: 'Japonês' } as Deck]);
      expect(edits.createCategory('japones')).toEqual({ label: 'Japonês', created: true });
      expect(settings.madeGroups()).toEqual([{ key: 'japones', label: 'Japonês' }]);
      const full: Record<string, { hidden: true }> = {};
      for (let i = 0; i < 200; i++) full[`g${i}`] = { hidden: true };
      settings.setNotesConfig({ categories: full });
      expect(edits.createCategory('Viagens')).toBeNull();
    });

    it('o criado conta como um grupo que existe (para juntar ao renomear)', () => {
      edits.createCategory('Viagens');
      expect(edits.existingCategory('VIAGENS', 'Trabalho')).toBe('Viagens');
    });

    it('renomeado, continua criado com o nome novo (também só a caixa); juntado num outro, o outro fica criado', () => {
      edits.createCategory('Viagens');
      edits.renameCategory('Viagens', 'Férias');
      expect(settings.madeGroups()).toEqual([{ key: 'ferias', label: 'Férias' }]);
      edits.renameCategory('Férias', 'FÉRIAS');
      expect(settings.madeGroups()).toEqual([{ key: 'ferias', label: 'FÉRIAS' }]);
      // um grupo de antes, com padrões guardados e sem anotação, não engole o criado
      settings.setCategoryPrefs('Casa', { hidden: true });
      edits.renameCategory('FÉRIAS', 'Casa');
      expect(settings.notesConfig().categories['casa']).toEqual({ hidden: true, name: 'Casa' });
      edits.renameCategory('Casa', 'Estudos');
      expect(settings.madeGroups()).toEqual([{ key: 'estudos', label: 'Estudos' }]);
    });

    it('renomear um grupo das anotações não o faz criado', () => {
      edits.renameCategory('Trabalho', 'Projeto');
      expect(settings.madeGroups()).toEqual([]);
    });

    it('apagado, sai das configurações, do Kanban e das listas', async () => {
      edits.createCategory('Viagens');
      const r = await edits.deleteCategory('Viagens', { kind: 'soltar' });
      expect(r.ok).toBeTrue();
      expect(settings.madeGroups()).toEqual([]);
      expect(TestBed.inject(KanbanStore).categories().map((c) => c.label)).not.toContain('Viagens');
      // nenhuma pasta "Grupo deletado" para um grupo vazio
      expect(settings.notesConfig().folders).toEqual([]);
      expect(TestBed.inject(KanbanStore).get(boardIdFor('viagens'))).toBeUndefined();
    });
  });
});
