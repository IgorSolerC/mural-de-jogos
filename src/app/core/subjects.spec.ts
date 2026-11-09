import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoteFolder, convertSubjects, folderTree, subjectFolderId } from './folders';
import { profileOf } from './kinds';
import { LabelEdits } from './label-edits';
import { cleanSubject } from './note-labels';
import { NoteFolders } from './note-folders';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { SharedStore } from './shared-store';
import { mergeNote } from './shared-notes';
import { NO_FILTER, facetsOf, matchesFilter, matchesQuery, toggleOption } from './wall-filter';
import { directionLabelOf, groupWall, sortFor, sortWall } from './wall-view';

const NOTES = profileOf('anotacoes');
const T0 = '2026-10-01T10:00:00.000Z';

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

/** O assunto de antes virou a pasta de cima do grupo (PLANO-PASTAS.md). */
describe('o assunto virou pasta', () => {
  describe('o campo de antes', () => {
    it('ainda é lido (limpo como o grupo), só para a conversão', () => {
      expect(cleanSubject('  história   do  brasil ')).toBe('História do brasil');
      expect(note('n1', 'Estudos', '  história ').subject).toBe('História');
      expect('subject' in note('n2', 'Estudos', '   ')).toBeFalse();
      expect('subject' in note('n4', 'Estudos', null, { subject: 42 })).toBeFalse();
    });
  });

  describe('a conversão', () => {
    const notes = [
      note('n1', 'Estudos', 'História'),
      note('n2', 'estudos', 'historia'),
      note('n3', 'Estudos', 'Geografia'),
      note('n4', 'Trabalho', 'História'),
      note('n5', null, 'Solto'),
      note('n6', 'Estudos'),
    ];

    it('cada assunto vira uma pasta de cima do seu grupo, com a grafia mais usada; a anotação troca o assunto pela pasta', () => {
      const { folders, notes: changed } = convertSubjects(notes, [], { estudos: ['Matemática', 'HISTÓRIA'] });
      const tree = folderTree(folders);
      const names = (group: string) => tree.kids(group, null).map((f) => f.name);
      expect(names('estudos')).toEqual(['Geografia', 'História', 'Matemática']);
      expect(names('trabalho')).toEqual(['História']);
      expect(names('')).toEqual(['Solto']);
      // a História dos Estudos não é a do Trabalho
      const byId = new Map(changed.map((n) => [n.id, n]));
      expect(byId.get('n1')!.folder).toBe(byId.get('n2')!.folder!);
      expect(byId.get('n1')!.folder).not.toBe(byId.get('n4')!.folder!);
      // só mudaram as que tinham assunto, sem data nova e sem o campo de antes
      expect(changed.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
      for (const n of changed) {
        expect('subject' in n).toBeFalse();
        expect(n.updatedAt).toBe(T0);
      }
    });

    it('dois aparelhos convertendo sozinhos chegam às mesmas pastas; de novo, nada muda', () => {
      const a = convertSubjects(notes, [], {});
      const b = convertSubjects([...notes].reverse(), [], {});
      expect(new Set(a.folders.map((f) => f.id))).toEqual(new Set(b.folders.map((f) => f.id)));
      expect(a.folders.find((f) => f.name === 'Geografia')!.id).toBe(subjectFolderId('Estudos', 'geografia'));
      const again = convertSubjects(a.notes, a.folders, {});
      expect(again.notes).toEqual([]);
      expect(again.folders).toEqual(a.folders);
    });

    it('a pasta de cima que já existe com o nome recebe o assunto; a renomeada não volta ao nome antigo', () => {
      const existing: NoteFolder[] = [
        { id: 'phistoria01', group: 'estudos', name: 'história', parent: null },
        { id: subjectFolderId('estudos', 'Geografia'), group: 'estudos', name: 'Terra', parent: null },
      ];
      const { folders, notes: changed } = convertSubjects(notes.slice(0, 3), existing, {});
      expect(changed.map((n) => n.folder)).toEqual(['phistoria01', 'phistoria01', subjectFolderId('estudos', 'Geografia')]);
      expect(folders.length).toBe(2);
      expect(folders[1].name).toBe('Terra');
    });
  });

  describe('o serviço', () => {
    let store: ReviewStore;
    let settings: Settings;
    let edits: LabelEdits;
    let folders: NoteFolders;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      settings = TestBed.inject(Settings);
      edits = TestBed.inject(LabelEdits);
      folders = TestBed.inject(NoteFolders);
      store.reviews.set([note('n1', 'Estudos', 'História'), note('n2', 'Estudos', 'Geografia'), note('n3', 'Trabalho', 'História')]);
      settings.setSavedSubjects('Estudos', ['Matemática', 'História']);
      TestBed.tick();
    });
    afterEach(() => localStorage.clear());

    const nameOf = (id: string) => folders.nameOf(folders.of(store.get(id)!));

    it('converte sozinho ao abrir: as anotações ganham a pasta, sem data nova, e os criados viram pastas', () => {
      expect(store.notes().every((n) => !('subject' in n))).toBeTrue();
      expect(store.notes().every((n) => n.updatedAt === T0)).toBeTrue();
      expect([nameOf('n1'), nameOf('n2'), nameOf('n3')]).toEqual(['História', 'Geografia', 'História']);
      expect(settings.notesConfig().subjects).toEqual({});
      expect(folders.tree().kids('estudos', null).map((f) => f.name)).toEqual(['Geografia', 'História', 'Matemática']);
    });

    it('conta, acha o outro para juntar e renomeia a pasta sem regravar nenhuma anotação', () => {
      const before = store.notes();
      expect(edits.subjectUses('historia', 'Estudos')).toBe(1);
      expect(edits.existingSubject('GEOGRAFIA', 'História', 'Estudos')).toBe('Geografia');
      expect(edits.existingSubject('matematica', 'História', 'Estudos')).toBe('Matemática');
      expect(edits.existingSubject('Artes', 'História', 'Estudos')).toBeNull();
      expect(edits.renameSubject('História', 'Estudos', ' história geral ')).toEqual({ changed: 1 });
      expect(store.notes()).toBe(before);
      expect(nameOf('n1')).toBe('História geral');
      expect(nameOf('n3')).toBe('História');
    });

    it('com o nome de outra, junta as duas; apagar desfaz a pasta e as anotações ficam soltas no grupo', () => {
      edits.renameSubject('Geografia', 'Estudos', 'história');
      expect(nameOf('n2')).toBe('História');
      expect(folders.tree().kids('estudos', null).map((f) => f.name)).toEqual(['História', 'Matemática']);
      edits.renameSubject('História', 'Estudos', null);
      expect(folders.of(store.get('n1')!)).toBeNull();
      expect(folders.of(store.get('n2')!)).toBeNull();
      expect(nameOf('n3')).toBe('História');
    });

    it('o grupo renomeado leva as pastas; apagado, elas vão para o Sem grupo com as anotações', () => {
      edits.renameCategory('Estudos', 'Escola');
      expect(store.get('n1')!.category).toBe('Escola');
      expect(nameOf('n1')).toBe('História');
      expect(folders.tree().kids('escola', null).map((f) => f.name)).toEqual(['Geografia', 'História', 'Matemática']);
      edits.renameCategory('Escola', null);
      expect(store.get('n1')!.category).toBeUndefined();
      expect(nameOf('n1')).toBe('História');
    });

    it('juntando dois grupos, as pastas de cima com o mesmo nome viram uma', () => {
      edits.renameCategory('Trabalho', 'Estudos');
      expect(folders.tree().kids('estudos', null).map((f) => f.name)).toEqual(['Geografia', 'História', 'Matemática']);
      expect(folders.of(store.get('n3')!)).toBe(folders.of(store.get('n1')!));
    });

    it('a compartilhada também: a pasta dela é de cada um', () => {
      spyOn(TestBed.inject(SharedStore), 'role').and.callFake((id: string) => (id === 'n1' ? 'editor' : null));
      expect(edits.renameSubject('História', 'Estudos', 'Outra')).toEqual({ changed: 1 });
      expect(nameOf('n1')).toBe('Outra');
    });
  });

  describe('filtro, busca e ordem do mural', () => {
    const converted = convertSubjects([note('n1', 'Estudos', 'História'), note('n2', 'Estudos', 'historia'), note('n3', 'Estudos', 'Geografia'), note('n4', 'Estudos')], [], {});
    const tree = folderTree(converted.folders);
    const notes = [...converted.notes, note('n4', 'Estudos')];
    const history = subjectFolderId('estudos', 'história');

    it('o grupo Assunto do filtro: as pastas de cima, de A a Z, "Sem assunto" no fim', () => {
      const facet = facetsOf(notes, NO_FILTER, NOTES, tree).find((f) => f.key === 'subject')!;
      expect(facet.title).toBe('Assunto');
      expect(facet.options.map((o) => [o.label, o.n])).toEqual([
        ['Geografia', 1],
        ['História', 2],
        ['Sem assunto', 1],
      ]);
      // sem nenhuma pasta no mural, o grupo não aparece
      expect(facetsOf([note('n9', 'Estudos')], NO_FILTER, NOTES, tree).some((f) => f.key === 'subject')).toBeFalse();
    });

    it('filtra por qualquer uma das ligadas; "sem" pega as soltas na raiz', () => {
      const f = toggleOption(toggleOption(NO_FILTER, 'subject', history), 'subject', 'sem');
      expect(notes.filter((r) => matchesFilter(r, f, undefined, tree)).map((r) => r.id)).toEqual(['n1', 'n2', 'n4']);
    });

    it('a busca acha pelo nome da pasta', () => {
      expect(notes.filter((r) => matchesQuery(r, 'geograf', tree)).map((r) => r.id)).toEqual(['n3']);
    });

    it('ordenar por assunto separa o mural em seções pela pasta, "Sem assunto" por último', () => {
      expect(sortFor('assunto', NOTES)).toBe('assunto');
      const order = { sort: 'assunto' as const, key: 'final' as const, direction: 'asc' as const, profile: NOTES, folderName: (r: Review) => tree.live(tree.of(r))?.name ?? null };
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
    it('o grupo e a pasta não entram na junção: são de cada pessoa', () => {
      const o = note('n1', 'Estudos', null, { folder: 'phistoria01' });
      const clash = mergeNote(o, { ...o, folder: 'pgeografia1' }, { ...o, folder: 'partes00001', category: 'Outro' });
      expect(clash.parts).toEqual([]);
    });
  });
});
