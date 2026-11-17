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
import { FreeBoardStore } from './free-board-store';
import { NoteFolders } from './note-folders';
import { SharedGroupsStore } from './shared-groups-store';
import { StudyStore } from './study-store';
import { SharedGroup } from './shared-groups';
import { deletedGroupFolderName, configWithoutGroup } from './group-delete';
import { tagLookKey } from './category-looks';

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

    it('o grupo renomeado leva os quadros livres dele (PLANO-QUADRO-LIVRE.md, D12)', async () => {
      const boards = TestBed.inject(FreeBoardStore);
      const b = await boards.create('Sprint', 'Trabalho');
      edits.renameCategory('Trabalho', 'Projeto');
      for (let i = 0; i < 20 && boards.get(b.id)?.grupo !== 'Projeto'; i++) await new Promise((r) => setTimeout(r, 10));
      expect(boards.get(b.id)?.grupo).toBe('Projeto');
      await boards.remove(b.id);
    });

    it('um nome vazio não muda nada', () => {
      expect(edits.renameCategory('Trabalho', '   ')).toEqual({ changed: 0 });
      expect(edits.renameTag('Bug', 'Trabalho', '#')).toEqual({ changed: 0 });
      expect(store.notes().map((r) => r.category)).toEqual(['Trabalho', 'Trabalho', 'Estudos']);
    });
  });
});

/** Apagar o grupo com o destino do que está nele (PLANO-APAGAR-GRUPO.md, feature 1). */
describe('apagar o grupo com destino (LabelEdits.deleteCategory)', () => {
  let store: ReviewStore;
  let settings: Settings;
  let kanban: KanbanStore;
  let edits: LabelEdits;
  let folders: NoteFolders;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    settings = TestBed.inject(Settings);
    kanban = TestBed.inject(KanbanStore);
    edits = TestBed.inject(LabelEdits);
    folders = TestBed.inject(NoteFolders);
    store.reviews.set([note('n1', 'Trabalho', ['Bug']), note('n2', 'Trabalho'), note('n3', 'Estudos', ['bug'])]);
  });
  afterEach(() => localStorage.clear());

  const byId = (id: string) => store.get(id)!;
  /** Trabalho › Reuniões, com a n2 dentro. */
  const withMeetings = () => {
    const reun = folders.create('Trabalho', null, 'Reuniões')!;
    folders.place(['n2'], reun.id);
    return reun;
  };

  it('o nome da pasta: "Grupo deletado: nome", cortado com reticências quando passa de 32 letras', () => {
    expect(deletedGroupFolderName('Trabalho')).toBe('Grupo deletado: Trabalho');
    const long = deletedGroupFolderName('Estudo de Japonês com a Bruna');
    expect([...long].length).toBe(32);
    expect(long).toBe('Grupo deletado: Estudo de Japon…');
    // o emoji conta como no nome da pasta (duas unidades) e nunca se parte
    const emoji = deletedGroupFolderName('Jogos 🎮🎮🎮🎮🎮🎮🎮🎮');
    expect(emoji.length).toBeLessThanOrEqual(32);
    expect(emoji.endsWith('🎮…')).toBeTrue();
  });

  it('as configurações perdem só o que é do grupo; com tudo, também as tags escondidas e os assuntos', () => {
    const cfg = {
      ...settings.notesConfig(),
      order: ['estudos', 'trabalho'],
      categories: { trabalho: { hidden: true }, estudos: { hidden: true } },
      hiddenTags: ['##trabalho#bug', '##trabalho#a#b', '##trabalho##x#bug', '##estudos#bug'],
      subjects: { trabalho: ['X'] },
    };
    expect(configWithoutGroup(cfg, 'trabalho', false)).toEqual({ ...cfg, order: ['estudos'], categories: { estudos: { hidden: true } } });
    expect(configWithoutGroup(cfg, 'trabalho', true)).toEqual({ ...cfg, order: ['estudos'], categories: { estudos: { hidden: true } }, hiddenTags: ['##trabalho##x#bug', '##estudos#bug'], subjects: {} });
  });

  it('deixar sem grupo: tudo vai para a pasta "Grupo deletado: Trabalho", nas sem grupo; as pastas dele dentro dela', async () => {
    const reun = withMeetings();
    settings.setCategoryLook('Trabalho', { color: 'azul' });
    settings.setCategoryPrefs('Trabalho', { audience: 'publicar' });
    settings.setTagColor('Bug', 'rosa', 'Trabalho');
    kanban.state.set({ boards: [board('trabalho', [{ note: 'n1', column: 'trabalho-0', importance: null }])], removed: {}, legacy: [] });
    const r = await edits.deleteCategory('Trabalho', { kind: 'soltar' });
    expect(r).toEqual(jasmine.objectContaining({ ok: true, moved: 2, removed: 0, folder: 'Grupo deletado: Trabalho' }));
    const tree = folders.tree();
    const made = tree.kids('', null).find((x) => x.name === 'Grupo deletado: Trabalho')!;
    expect(made).toBeDefined();
    expect([byId('n1').category, tree.of(byId('n1'))]).toEqual([undefined, made.id]);
    expect([byId('n2').category, tree.of(byId('n2'))]).toEqual([undefined, reun.id]);
    expect(tree.path(reun.id).map((x) => x.name)).toEqual(['Grupo deletado: Trabalho', 'Reuniões']);
    expect(settings.categoryLooks()['trabalho']).toBeUndefined();
    expect(settings.notesConfig().categories['trabalho']).toBeUndefined();
    // as tags levam a cor para as sem grupo, como antes
    expect(settings.tagColor('bug', '')).toBe('rosa');
    expect(kanban.get(boardIdFor('trabalho'))).toBeUndefined();
    expect(byId('n3').category).toBe('Estudos');
  });

  it('a pasta das sem grupo não repete a de um grupo de mesmo nome apagado antes; grupo vazio não cria pasta', async () => {
    await edits.deleteCategory('Trabalho', { kind: 'soltar' });
    store.add({ ...note('n9', 'Trabalho'), id: 'n9' });
    await edits.deleteCategory('Trabalho', { kind: 'soltar' });
    expect(folders.tree().kids('', null).map((x) => x.name)).toEqual(['Grupo deletado: Trabalho', 'Grupo deletado: Trabalho 2']);
    settings.setCategoryLook('Vazio', { color: 'azul' });
    const r = await edits.deleteCategory('Vazio', { kind: 'soltar' });
    expect(r.folder).toBeUndefined();
    expect(folders.tree().kids('', null).length).toBe(2);
    expect(settings.categoryLooks()['vazio']).toBeUndefined();
  });

  it('levar para outro grupo: na pasta escolhida, a de mesmo nome que já está lá junta; o grupo novo fica com o jeito dele', async () => {
    const reun = withMeetings();
    const arquivo = folders.create('Estudos', null, 'Arquivo')!;
    const reunLa = folders.create('Estudos', arquivo.id, 'Reuniões')!;
    settings.setCategoryLook('Trabalho', { color: 'azul' });
    settings.setCategoryPrefs('Trabalho', { audience: 'publicar' });
    settings.setNotesConfig({ order: ['trabalho', 'casa'] });
    settings.setTagColor('Bug', 'rosa', 'Trabalho');
    kanban.state.set({
      boards: [board('trabalho', [{ note: 'n1', column: 'trabalho-1', importance: null }]), board('estudos', [{ note: 'n3', column: 'estudos-0', importance: null }])],
      removed: {},
      legacy: [],
    });
    const study = spyOn(TestBed.inject(StudyStore), 'moveGroup').and.callThrough();
    const r = await edits.deleteCategory('Trabalho', { kind: 'levar', to: 'estudos', folder: arquivo.id });
    expect(r).toEqual(jasmine.objectContaining({ ok: true, moved: 2 }));
    const tree = folders.tree();
    // a grafia do grupo que já existe
    expect(store.notes().map((x) => x.category)).toEqual(['Estudos', 'Estudos', 'Estudos']);
    expect(tree.of(byId('n1'))).toBe(arquivo.id);
    expect(tree.of(byId('n2'))).toBe(reunLa.id);
    expect(tree.live(reun.id)).toBeUndefined();
    expect(settings.categoryLooks()['estudos']).toBeUndefined();
    expect(settings.notesConfig().categories['estudos']).toBeUndefined();
    expect(settings.notesConfig().order).toEqual(['casa']);
    expect(settings.tagColor('bug', 'Estudos')).toBe('rosa');
    expect(kanban.boardFor('Estudos').cards.map((c) => [c.note, c.column])).toEqual([
      ['n3', 'estudos-0'],
      ['n1', 'estudos-1'],
    ]);
    expect(study).toHaveBeenCalledOnceWith('Trabalho', 'Estudos');
  });

  it('levar sem pasta escolhida deixa as soltas na raiz; uma pasta que não é do grupo novo vale como a raiz', async () => {
    const reun = withMeetings();
    await edits.deleteCategory('Trabalho', { kind: 'levar', to: 'Estudos', folder: reun.id });
    expect(folders.tree().of(byId('n1'))).toBeNull();
    expect(folders.tree().kids('estudos', null).map((x) => x.name)).toEqual(['Reuniões']);
  });

  it('levar para ele mesmo, para nada ou para um grupo compartilhado em que você só lê não muda nada', async () => {
    expect((await edits.deleteCategory('Trabalho', { kind: 'levar', to: 'TRABALHO', folder: null })).ok).toBeFalse();
    expect((await edits.deleteCategory('Trabalho', { kind: 'levar', to: '  ', folder: null })).ok).toBeFalse();
    const groups = TestBed.inject(SharedGroupsStore);
    spyOn(groups, 'ofCategory').and.callFake((c) => (c === 'Casa' ? ({ id: 'gCasa0000001', papel: 'leitor', dono: { nome: 'Ana' } } as unknown as SharedGroup) : undefined));
    const r = await edits.deleteCategory('Trabalho', { kind: 'levar', to: 'Casa', folder: null });
    expect(r).toEqual(jasmine.objectContaining({ ok: false, error: 'Em Casa você só lê: escolha outro grupo.' }));
    // num grupo compartilhado de outra pessoa (mesmo escrevendo nele), não: o nome dele viraria outro
    (groups.ofCategory as jasmine.Spy).and.callFake((c: string) => (c === 'Casa' ? ({ id: 'gCasa0000001', papel: 'editor', dono: { nome: 'Ana' } } as unknown as SharedGroup) : undefined));
    expect(await edits.deleteCategory('Trabalho', { kind: 'levar', to: 'Casa', folder: null })).toEqual(jasmine.objectContaining({ ok: false, error: 'Casa é de Ana: leve para um grupo seu.' }));
    expect(store.notes().map((x) => x.category)).toEqual(['Trabalho', 'Trabalho', 'Estudos']);
  });

  it('apagar tudo: as anotações, as pastas, o quadro, a cor das tags e as tags escondidas; as compartilhadas pelas regras do apagar em massa', async () => {
    withMeetings();
    store.add({ ...note('n4', 'Trabalho'), id: 'n4' });
    settings.setTagColor('Bug', 'rosa', 'Trabalho');
    settings.setNotesConfig({ hiddenTags: [tagLookKey('bug', 'trabalho')] });
    store.add({ ...note('n5', 'Trabalho', ['Sprint']), id: 'n5' });
    settings.togglePinnedTag('Bug');
    settings.togglePinnedTag('Sprint');
    kanban.state.set({ boards: [board('trabalho', [{ note: 'n1', column: 'trabalho-0', importance: null }])], removed: {}, legacy: [] });
    const shared = TestBed.inject(SharedStore);
    const entries: Record<string, unknown> = {
      n2: { id: 'n2', papel: 'dono', grupo: null, criadoPor: null },
      n4: { id: 'n4', papel: 'editor', grupo: null, criadoPor: null },
    };
    spyOn(shared, 'get').and.callFake(((id: string) => entries[id]) as never);
    // (a nuvem tira a compartilhada do mural)
    const gone = async (id: string) => store.reviews.update((l) => l.filter((x) => x.id !== id));
    const forAll = spyOn(shared, 'deleteForAll').and.callFake(gone);
    const leave = spyOn(shared, 'leave').and.callFake(gone);
    const r = await edits.deleteCategory('Trabalho', { kind: 'apagar' });
    expect(r).toEqual(jasmine.objectContaining({ ok: true, removed: 4, moved: 0, failed: null }));
    // a Bug ainda está em Estudos ("bug"): continua fixa; a Sprint, só em Trabalho, solta
    expect(settings.pinnedTags()).toEqual(['Bug']);
    expect(forAll).toHaveBeenCalledOnceWith('n2');
    expect(leave).toHaveBeenCalledOnceWith('n4');
    expect(store.get('n1')).toBeUndefined();
    expect(folders.tree().kids('trabalho', null)).toEqual([]);
    expect(settings.tagColor('bug', 'Trabalho')).toBeUndefined();
    expect(settings.tagColor('bug', '')).toBeUndefined();
    expect(settings.notesConfig().hiddenTags).toEqual([]);
    expect(kanban.get(boardIdFor('trabalho'))).toBeUndefined();
  });

  it('apagar tudo: quando a nuvem não tira uma compartilhada, o grupo fica como estava, com ela', async () => {
    withMeetings();
    kanban.state.set({ boards: [board('trabalho', [{ note: 'n2', column: 'trabalho-0', importance: null }])], removed: {}, legacy: [] });
    store.add({ ...note('n5', 'Trabalho', ['Sprint']), id: 'n5' });
    settings.togglePinnedTag('Bug');
    settings.togglePinnedTag('Sprint');
    const shared = TestBed.inject(SharedStore);
    spyOn(shared, 'get').and.callFake(((id: string) => (id === 'n2' ? { id: 'n2', papel: 'dono', grupo: null, criadoPor: null } : undefined)) as never);
    spyOn(shared, 'deleteForAll').and.rejectWith(new Error('fora do ar'));
    const r = await edits.deleteCategory('Trabalho', { kind: 'apagar' });
    expect(r).toEqual(jasmine.objectContaining({ ok: true, removed: 2, failed: 'Não deu para falar com a nuvem agora.', kept: true }));
    // o grupo fica como estava, com a que ficou: as pastas, o quadro, as tags fixas
    expect(settings.pinnedTags()).toEqual(['Bug', 'Sprint']);
    expect(folders.tree().kids('trabalho', null).map((x) => x.name)).toEqual(['Reuniões']);
    expect(folders.tree().of(byId('n2'))).not.toBeNull();
    expect(kanban.get(boardIdFor('trabalho'))).toBeDefined();
  });

  it('um grupo compartilhado: quem não é o dono não apaga; o dono para de compartilhar antes, e o quadro do grupo fica', async () => {
    const groups = TestBed.inject(SharedGroupsStore);
    let papel = 'editor';
    spyOn(groups, 'ofCategory').and.callFake((c) => (c === 'Trabalho' ? ({ id: 'gTrab0000001', papel, dono: { nome: 'Ana' } } as unknown as SharedGroup) : undefined));
    const groupBoard = board('trabalho', [{ note: 'n1', column: 'trabalho-0', importance: null }]);
    const stop = spyOn(groups, 'stop').and.resolveTo(groupBoard);
    const no = await edits.deleteCategory('Trabalho', { kind: 'soltar' });
    expect(no).toEqual(jasmine.objectContaining({ ok: false, error: 'Trabalho é de Ana: para tirá-lo do seu mural, saia do grupo.' }));
    expect(stop).not.toHaveBeenCalled();
    papel = 'dono';
    const keep = spyOn(kanban, 'keep').and.callThrough();
    const r = await edits.deleteCategory('Trabalho', { kind: 'levar', to: 'Estudos', folder: null });
    expect(stop).toHaveBeenCalledOnceWith('gTrab0000001');
    expect(keep).toHaveBeenCalledOnceWith(groupBoard);
    expect(r.ok).toBeTrue();
    expect(kanban.boardFor('Estudos').cards.map((c) => c.note)).toEqual(['n1']);
  });

  it('a nuvem falhou ao parar de compartilhar: nada muda aqui', async () => {
    const groups = TestBed.inject(SharedGroupsStore);
    spyOn(groups, 'ofCategory').and.callFake((c) => (c === 'Trabalho' ? ({ id: 'gTrab0000001', papel: 'dono', dono: { nome: 'Eu' } } as unknown as SharedGroup) : undefined));
    spyOn(groups, 'stop').and.rejectWith(new Error('fora do ar'));
    const r = await edits.deleteCategory('Trabalho', { kind: 'apagar' });
    expect(r).toEqual(jasmine.objectContaining({ ok: false, error: 'Não deu para parar de compartilhar agora. Tente de novo.' }));
    expect(store.notes().length).toBe(3);
  });
});
