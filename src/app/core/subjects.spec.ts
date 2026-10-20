import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { profileOf } from './kinds';
import { LabelEdits, configMoved, notesWithSubject, subjectConfigMoved } from './label-edits';
import { NOTES_CONFIG_DEFAULT, MAX_SAVED_SUBJECTS, sanitizeNotesConfig, savedSubjects, withSavedSubjects } from './mural-config';
import { cleanSubject, subjectLibrary } from './note-labels';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { SharedStore } from './shared-store';
import { mergeNote } from './shared-notes';
import { NO_FILTER, facetsOf, matchesFilter, matchesQuery, toggleOption } from './wall-filter';
import { directionLabelOf, groupWall, sortFor, sortWall } from './wall-view';

const NOTES = profileOf('anotacoes');
const T0 = '2026-10-01T10:00:00.000Z';
const AT = '2026-10-20T10:00:00.000Z';

const note = (id: string, category: string | null, subject: string | null = null, extra: Record<string, unknown> = {}): Review =>
  ({
    ...sanitizeReview({
      kind: 'anotacoes',
      game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
      completedAt: '2026-10-01',
      createdAt: T0,
      updatedAt: T0,
      ...(category ? { category } : {}),
      ...(subject ? { subject } : {}),
      ...extra,
    })!,
    id,
  });

/** O assunto: um nível entre o grupo e as tags (Estudos › História › "Cai na prova"). */
describe('assunto das anotações', () => {
  describe('o campo', () => {
    it('é limpo como o grupo e só existe quando foi escrito', () => {
      expect(cleanSubject('  história   do  brasil ')).toBe('História do brasil');
      expect(note('n1', 'Estudos', '  história ').subject).toBe('História');
      expect('subject' in note('n2', 'Estudos', '   ')).toBeFalse();
      expect('subject' in note('n3', 'Estudos')).toBeFalse();
      // um assunto que não é texto não entra
      expect('subject' in note('n4', 'Estudos', null, { subject: 42 })).toBeFalse();
    });

    it('a biblioteca do grupo: os criados e os usados, de A a Z, com quantas anotações e se foi criado', () => {
      const notes = [
        note('n1', 'Estudos', 'História'),
        note('n2', 'estudos', 'historia'),
        note('n3', 'Estudos', 'Geografia'),
        note('n4', 'Estudos', 'Artes'),
        note('n5', 'Estudos', 'Geografia'),
        note('n6', 'Estudos', 'Geografia'),
        note('n7', 'Trabalho', 'Kanban'),
        note('n8', null, 'Solto'),
      ];
      const lib = subjectLibrary(notes, ['Matemática', 'HISTÓRIA'], 'Estudos');
      expect(lib.map((s) => [s.label, s.n, s.saved])).toEqual([
        ['Artes', 1, false],
        ['Geografia', 3, false],
        // a grafia mais usada nas anotações vale, mesmo para a criada
        ['História', 2, true],
        ['Matemática', 0, true],
      ]);
      // o assunto é do grupo: o do Trabalho não aparece nos Estudos
      expect(subjectLibrary(notes, [], 'Trabalho').map((s) => s.label)).toEqual(['Kanban']);
      expect(subjectLibrary(notes, [], null).map((s) => s.label)).toEqual(['Solto']);
    });
  });

  describe('os criados nas configurações', () => {
    it('ficam por grupo, limpos, sem repetir e com limite; o grupo vazio sai', () => {
      const cfg = sanitizeNotesConfig({
        subjects: { Estudos: [' história ', 'HISTÓRIA', 'Geografia', 3, ''], Vazio: [], Ruim: 'x', '': ['Solto'] },
      });
      expect(cfg.subjects).toEqual({ estudos: ['História', 'Geografia'], '': ['Solto'] });
      expect(savedSubjects(cfg, 'ESTUDOS')).toEqual(['História', 'Geografia']);
      expect(savedSubjects(cfg, null)).toEqual(['Solto']);
      expect(savedSubjects(cfg, 'Trabalho')).toEqual([]);
      const many = sanitizeNotesConfig({ subjects: { a: Array.from({ length: MAX_SAVED_SUBJECTS + 5 }, (_, i) => `s${i}`) } });
      expect(many.subjects['a'].length).toBe(MAX_SAVED_SUBJECTS);
      expect(withSavedSubjects(cfg, 'Estudos', []).subjects).toEqual({ '': ['Solto'] });
      expect(withSavedSubjects(NOTES_CONFIG_DEFAULT, 'Trabalho', ['Site']).subjects).toEqual({ trabalho: ['Site'] });
      // sem o campo (um site antigo), nenhum
      expect(sanitizeNotesConfig({}).subjects).toEqual({});
    });
  });

  describe('renomear e apagar', () => {
    it('o assunto muda só no grupo; null tira', () => {
      const notes = [note('n1', 'Estudos', 'História'), note('n2', 'estudos', 'historia'), note('n3', 'Trabalho', 'História'), note('n4', 'Estudos', 'Geografia')];
      expect(notesWithSubject(notes, 'estudos', 'historia', 'História Geral', AT).map((r) => [r.id, r.subject, r.updatedAt])).toEqual([
        ['n1', 'História Geral', AT],
        ['n2', 'História Geral', AT],
      ]);
      const out = notesWithSubject(notes, 'estudos', 'geografia', null, AT);
      expect(out.map((r) => r.id)).toEqual(['n4']);
      expect('subject' in out[0]).toBeFalse();
    });

    it('a lista dos criados acompanha; o grupo renomeado leva os assuntos dele (apagado, para as sem grupo)', () => {
      const cfg = withSavedSubjects(withSavedSubjects(NOTES_CONFIG_DEFAULT, 'Estudos', ['História', 'Geografia']), 'Escola', ['Artes', 'história']);
      expect(savedSubjects(subjectConfigMoved(cfg, 'Estudos', 'historia', 'História Geral'), 'Estudos')).toEqual(['História Geral', 'Geografia']);
      expect(savedSubjects(subjectConfigMoved(cfg, 'Estudos', 'geografia', null), 'Estudos')).toEqual(['História']);
      // juntando os grupos: os da outra primeiro, sem repetir
      expect(savedSubjects(configMoved(cfg, 'estudos', 'escola'), 'Escola')).toEqual(['Artes', 'História', 'Geografia']);
      expect(savedSubjects(configMoved(cfg, 'estudos', 'escola'), 'Estudos')).toEqual([]);
      expect(savedSubjects(configMoved(cfg, 'estudos', null), '')).toEqual(['História', 'Geografia']);
    });

    describe('o serviço', () => {
      let store: ReviewStore;
      let settings: Settings;
      let edits: LabelEdits;

      beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
        store = TestBed.inject(ReviewStore);
        settings = TestBed.inject(Settings);
        edits = TestBed.inject(LabelEdits);
        store.reviews.set([note('n1', 'Estudos', 'História'), note('n2', 'Estudos', 'Geografia'), note('n3', 'Trabalho', 'História')]);
        settings.setSavedSubjects('Estudos', ['Matemática', 'História']);
      });
      afterEach(() => localStorage.clear());

      it('conta, acha o outro para juntar (também entre os criados) e renomeia nas anotações e na lista', () => {
        expect(edits.subjectUses('historia', 'Estudos')).toBe(1);
        expect(edits.existingSubject('GEOGRAFIA', 'História', 'Estudos')).toBe('Geografia');
        expect(edits.existingSubject('matematica', 'História', 'Estudos')).toBe('Matemática');
        expect(edits.existingSubject('Artes', 'História', 'Estudos')).toBeNull();
        expect(edits.renameSubject('História', 'Estudos', ' história geral ')).toEqual({ changed: 1, skipped: 0 });
        expect(store.notes().map((r) => r.subject)).toEqual(['História geral', 'Geografia', 'História']);
        expect(savedSubjects(settings.notesConfig(), 'Estudos')).toEqual(['Matemática', 'História geral']);
      });

      it('apaga das anotações do grupo e da lista; o criado sem anotação só sai da lista', () => {
        expect(edits.renameSubject('Matemática', 'Estudos', null)).toEqual({ changed: 0, skipped: 0 });
        expect(savedSubjects(settings.notesConfig(), 'Estudos')).toEqual(['História']);
        edits.renameSubject('Geografia', 'Estudos', null);
        expect(store.get('n2')!.subject).toBeUndefined();
        expect(store.get('n3')!.subject).toBe('História');
      });

      it('a compartilhada em que a pessoa não gere fica como está', () => {
        spyOn(TestBed.inject(SharedStore), 'role').and.callFake((id: string) => (id === 'n1' ? 'editor' : null));
        expect(edits.renameSubject('História', 'Estudos', 'Outra')).toEqual({ changed: 0, skipped: 1 });
        expect(store.get('n1')!.subject).toBe('História');
      });

      it('o grupo renomeado leva os assuntos criados', () => {
        edits.renameCategory('Estudos', 'Escola');
        expect(savedSubjects(settings.notesConfig(), 'Escola')).toEqual(['Matemática', 'História']);
        expect(store.get('n1')!.subject).toBe('História');
      });
    });
  });

  describe('filtro, busca e ordem do mural', () => {
    const notes = [note('n1', 'Estudos', 'História'), note('n2', 'Estudos', 'historia'), note('n3', 'Estudos', 'Geografia'), note('n4', 'Estudos')];

    it('o grupo Assunto do filtro: as grafias juntas, de A a Z, "Sem assunto" no fim', () => {
      const facet = facetsOf(notes, NO_FILTER, NOTES).find((f) => f.key === 'subject')!;
      expect(facet.title).toBe('Assunto');
      expect(facet.options.map((o) => [o.label, o.n])).toEqual([
        ['Geografia', 1],
        ['História', 2],
        ['Sem assunto', 1],
      ]);
      // sem nenhum assunto no mural, o grupo não aparece
      expect(facetsOf([note('n9', 'Estudos')], NO_FILTER, NOTES).some((f) => f.key === 'subject')).toBeFalse();
    });

    it('filtra por qualquer um dos ligados, sem ligar para caixa e acento; "sem" pega as sem assunto', () => {
      const f = toggleOption(toggleOption(NO_FILTER, 'subject', 'HISTORIA'), 'subject', 'sem');
      expect(notes.filter((r) => matchesFilter(r, f)).map((r) => r.id)).toEqual(['n1', 'n2', 'n4']);
    });

    it('a busca acha pelo assunto', () => {
      expect(notes.filter((r) => matchesQuery(r, 'geograf')).map((r) => r.id)).toEqual(['n3']);
    });

    it('ordenar por assunto separa o mural em seções, "Sem assunto" por último', () => {
      expect(sortFor('assunto', NOTES)).toBe('assunto');
      const order = { sort: 'assunto' as const, key: 'final' as const, direction: 'asc' as const, profile: NOTES };
      const groups = groupWall(sortWall(notes, order), order);
      expect(groups.map((g) => [g.label, g.reviews.length])).toEqual([
        ['Geografia', 1],
        ['História', 2],
        ['Sem assunto', 1],
      ]);
      expect(directionLabelOf('assunto', 'asc', NOTES)).toBe('Assuntos de A a Z');
    });
  });

  describe('a anotação compartilhada', () => {
    it('o grupo e o assunto andam juntos na junção: um lado mexeu, vale; os dois, diferente, conflito', () => {
      const o = note('n1', 'Estudos', 'História');
      const a = { ...o, subject: 'Geografia' };
      const b = { ...o, text: 'outro texto' };
      const merged = mergeNote(o, a, b);
      expect(merged.parts).toEqual([]);
      expect(merged.merged.subject).toBe('Geografia');
      const clash = mergeNote(o, a, { ...o, subject: 'Artes' });
      expect(clash.parts).toEqual(['categoria']);
    });
  });
});
