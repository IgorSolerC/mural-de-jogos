import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Colleague, ColleagueStore } from './colleague-store';
import { NoteFolder } from './folders';
import { Mural } from './mural';
import { Review, sanitizeReview } from './review';
import { VisitView } from './visit-view';

/**
 * A parede de um grupo com pastas (PLANO-PASTAS.md, rodada 2): a navegação mora no `WallState`, a base da
 * sua vista e da visita, então vale igual nas duas. Aqui pela visita, que só lê.
 */

const note = (id: string, title: string, category: string | null, folder?: string): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: title },
    text: `Texto de ${title}`,
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...(category ? { category } : {}),
    ...(folder ? { folder } : {}),
  })!;

const f = (id: string, name: string, parent: string | null = null, group = 'estudos', extra: Partial<NoteFolder> = {}): NoteFolder => ({ id, group, name, parent, ...extra });

// Estudos › Programação › Funcional e Scripts; Estudos › História; Estudos › Vazia; Trabalho › Reuniões
const FOLDERS: NoteFolder[] = [
  f('pprog000001', 'Programação'),
  f('pfunc000001', 'Funcional', 'pprog000001'),
  f('pscri000001', 'Scripts', 'pprog000001'),
  f('phist000001', 'História'),
  f('pvazi000001', 'Vazia'),
  f('preun000001', 'Reuniões', null, 'trabalho'),
];

const NOTES = [
  note('n1', 'Recursão', 'Estudos', 'pfunc000001'),
  note('n2', 'Bash', 'Estudos', 'pscri000001'),
  note('n3', 'Revolução Francesa', 'Estudos', 'phist000001'),
  note('n4', 'Solta', 'Estudos'),
  note('n5', 'Daily', 'Trabalho', 'preun000001'),
];

const person = (extra: Partial<Colleague> = {}): Colleague =>
  ({ id: 'Marina', name: 'Marina', fileName: '', loadedAt: '2026-10-01T00:00:00Z', reviews: NOTES, folders: FOLDERS, exportedAt: null, skipped: 0, ownerName: null, ...extra }) as Colleague;

describe('as pastas na parede (WallState)', () => {
  let selected: ReturnType<typeof signal<Colleague | null>>;
  let visit: VisitView;

  const names = (rs: readonly Review[]) => rs.map((r) => r.game.name).sort();
  const kids = () => visit.folderKids().map((x) => x.name);

  beforeEach(() => {
    localStorage.clear();
    selected = signal<Colleague | null>(person());
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), VisitView, { provide: ColleagueStore, useValue: { selected } }],
    });
    TestBed.inject(Mural).kind.set('anotacoes');
    visit = TestBed.inject(VisitView);
    TestBed.tick();
  });
  afterEach(() => localStorage.clear());

  it('em Tudo não há pastas: a aba inteira, como antes', () => {
    expect(visit.folderGroup()).toBeNull();
    expect(visit.folderKids()).toEqual([]);
    expect(visit.tabbed().length).toBe(5);
  });

  it('com um grupo só (sem abas), o Tudo é esse grupo: as pastas dele aparecem ali', () => {
    selected.set(person({ id: 'Solo', reviews: NOTES.filter((r) => r.category === 'Estudos') }));
    TestBed.tick();
    expect(visit.noteTabs()!.tabs).toEqual([]);
    expect(visit.folderGroup()).toBe('estudos');
    expect(visit.folderGroupLabel()).toBe('Estudos');
    expect(kids()).toEqual(['História', 'Programação', 'Vazia']);
    visit.openFolderFrom('pprog000001');
    expect(visit.openFolder()).toBe('pprog000001');
    expect(kids()).toEqual(['Funcional', 'Scripts']);
  });

  it('na raiz de um grupo: as pastas de cima (A–Z) e só as anotações soltas', () => {
    visit.setNoteTab('c:estudos');
    expect(visit.folderGroup()).toBe('estudos');
    expect(visit.openFolder()).toBeNull();
    expect(kids()).toEqual(['História', 'Programação', 'Vazia']);
    expect(names(visit.tabbed())).toEqual(['Solta']);
    // o número conta as de dentro; as cartolinas, até três
    const info = visit.folderInfo();
    expect(info.get('pprog000001')).toEqual(jasmine.objectContaining({ notes: 2, folders: 2 }));
    expect(info.get('pprog000001')!.stocks.length).toBe(2);
    expect(info.get('phist000001')).toEqual(jasmine.objectContaining({ notes: 1, folders: 0 }));
    expect(info.get('pvazi000001')).toEqual({ notes: 0, folders: 0, stocks: [] });
  });

  it('entrar numa pasta mostra só o que está direto nela; o caminho vai da raiz até ela', () => {
    visit.setNoteTab('c:estudos');
    visit.enterFolder('pprog000001');
    expect(visit.folderPath().map((x) => x.name)).toEqual(['Programação']);
    expect(kids()).toEqual(['Funcional', 'Scripts']);
    expect(visit.tabbed()).toEqual([]);
    visit.enterFolder('pfunc000001');
    expect(visit.folderPath().map((x) => x.name)).toEqual(['Programação', 'Funcional']);
    expect(kids()).toEqual([]);
    expect(names(visit.tabbed())).toEqual(['Recursão']);
  });

  it('procurando, a parede deixa as pastas e mostra a aberta e as de dentro numa lista só', () => {
    visit.setNoteTab('c:estudos');
    visit.enterFolder('pprog000001');
    visit.query.set('rec');
    expect(visit.seeking()).toBeTrue();
    expect(kids()).toEqual([]);
    expect(names(visit.tabbed())).toEqual(['Bash', 'Recursão']);
    expect(names(visit.visible())).toEqual(['Recursão']);
    // o que está fora da pasta aberta não aparece
    visit.query.set('revolu');
    expect(visit.visible()).toEqual([]);
    // na raiz, o grupo inteiro
    visit.enterFolder(null);
    expect(names(visit.visible())).toEqual(['Revolução Francesa']);
    // limpar a busca volta às pastas
    visit.query.set('');
    expect(kids()).toEqual(['História', 'Programação', 'Vazia']);
  });

  it('cada grupo lembra a pasta aberta enquanto a página está aberta', () => {
    visit.setNoteTab('c:estudos');
    visit.enterFolder('pprog000001');
    visit.setNoteTab('c:trabalho');
    expect(visit.openFolder()).toBeNull();
    expect(kids()).toEqual(['Reuniões']);
    visit.setNoteTab('c:estudos');
    expect(visit.openFolder()).toBe('pprog000001');
  });

  it('o endereço abre a pasta no grupo dela; a que não existe abre a raiz', () => {
    visit.openFolderFrom('preun000001');
    expect(visit.activeTab()).toBe('c:trabalho');
    expect(names(visit.tabbed())).toEqual(['Daily']);
    visit.openFolderFrom('pnada000001');
    expect(visit.activeTab()).toBe('c:trabalho');
    expect(visit.openFolder()).toBeNull();
  });

  it('a pasta aberta desfeita (lápide) abre a de cima, com as anotações que subiram', () => {
    visit.setNoteTab('c:estudos');
    visit.enterFolder('pfunc000001');
    selected.set(person({ id: 'Marina', folders: FOLDERS.map((x) => (x.id === 'pfunc000001' ? { ...x, gone: '2026-11-09T12:00:00.000Z' } : x)) }));
    expect(visit.openFolder()).toBe('pprog000001');
    expect(names(visit.tabbed())).toEqual(['Recursão']);
    expect(kids()).toEqual(['Scripts']);
  });

  it('o foco: entrando, vai para o caminho; subindo, para a pasta de onde se saiu', () => {
    visit.setNoteTab('c:estudos');
    visit.enterFolder('pprog000001');
    expect(visit.folderFocus()).toEqual({ to: null, n: 1 });
    visit.enterFolder('pfunc000001');
    visit.enterFolder(null);
    expect(visit.folderFocus()).toEqual({ to: 'pprog000001', n: 3 });
    // o Voltar do navegador (sem toque) não mexe no foco
    visit.enterFolder('pprog000001', false);
    expect(visit.folderFocus()!.n).toBe(3);
    expect(visit.folderPushed()).toBeFalse();
  });

  it('o Filtrar conta a pasta aberta e as de dentro, que é onde filtrar procura', () => {
    selected.set(person({ id: 'Tags', reviews: NOTES.map((r) => (r.game.name === 'Recursão' ? { ...r, tags: ['Prova'] } : r)) }));
    TestBed.tick();
    visit.setNoteTab('c:estudos');
    visit.enterFolder('pprog000001');
    expect(visit.tabbed()).toEqual([]);
    const prova = visit.facets().find((x) => x.key === 'tag')!.options.find((o) => o.value === 'Prova')!;
    // (a Recursão está em Programação › Funcional, e não direto na aberta)
    expect(prova.n).toBe(1);
    visit.toggle('tag', 'Prova');
    expect(names(visit.visible())).toEqual(['Recursão']);
  });

  it('num grupo, o Filtrar não tem o assunto: a pasta é o lugar', () => {
    visit.setNoteTab('c:estudos');
    expect(visit.facets().some((x) => x.key === 'subject')).toBeFalse();
  });

  it('outra pessoa abre do começo, sem pasta aberta', () => {
    visit.setNoteTab('c:estudos');
    visit.enterFolder('pprog000001');
    selected.set(person({ id: 'Joana', name: 'Joana' }));
    TestBed.tick();
    visit.setNoteTab('c:estudos');
    expect(visit.openFolder()).toBeNull();
  });
});
