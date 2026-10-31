import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mural } from './mural';
import { ALL_TAB, MAX_TABS, NO_CATEGORY_TAB, NoteTab, noteTabKey, noteTabsOf, splitTabs } from './note-tabs';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { WallView } from './wall-view';
import { KANBAN_LAST_KEY, boardIdFor } from './kanban';

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
  it('toda categoria tem aba, das com mais anotações para as com menos, Sem categoria também', () => {
    const tabs = noteTabsOf(sea());
    expect(tabs.tabs.map((t) => t.label)).toEqual(['Trabalho', 'Estudos', 'Viagem', 'Sem grupo', 'Receitas']);
    // com mais anotações que as categorias, Sem categoria vem antes delas
    const loose = noteTabsOf([...sea(), note('Avulsa', null), note('Outra', null), note('Mais uma', null)]);
    expect(loose.tabs.map((t) => t.label)).toEqual(['Sem grupo', 'Trabalho', 'Estudos', 'Viagem', 'Receitas']);
    expect(tabs.all).toBe(12);
  });

  it('cabendo, todas ficam em pé; o Mais só existe quando sobra aba', () => {
    const { tabs } = noteTabsOf(sea());
    const split = splitTabs(tabs, ALL_TAB);
    expect(split.shown.length).toBe(5);
    expect(split.more).toEqual([]);
  });

  it('mais de oito abas (contando Tudo): as com menos anotações vão para o Mais, e as em pé continuam na ordem', () => {
    const tabs: NoteTab[] = 'ABCDEFGHIJ'.split('').map((c, i) => ({ key: `c:${c}`, label: c, n: i + 1, total: i + 1 }));
    const split = splitTabs(tabs, ALL_TAB);
    expect(split.shown.length).toBe(MAX_TABS - 1);
    expect(split.shown.map((t) => t.label)).toEqual(['D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(split.more.map((t) => t.label)).toEqual(['A', 'B', 'C']);
  });

  it('a aba aberta fica sempre em pé, mesmo pequena', () => {
    const tabs: NoteTab[] = 'ABCDEFGHIJ'.split('').map((c, i) => ({ key: `c:${c}`, label: c, n: i + 1, total: i + 1 }));
    expect(splitTabs(tabs, 'c:A').shown.map((t) => t.label)).toContain('A');
  });

  it('sem largura para todas, as que não cabem vão para o Mais', () => {
    const { tabs } = noteTabsOf(sea());
    // cabem só duas além de Tudo (e do Mais)
    const split = splitTabs(tabs, ALL_TAB, (shown) => shown.length <= 2);
    expect(split.shown.map((t) => t.label)).toEqual(['Trabalho', 'Estudos']);
    expect(split.more.map((t) => t.label)).toEqual(['Viagem', 'Sem grupo', 'Receitas']);
  });

  it('a finalizada conta para a aba existir, mas não no número dela quando está escondida', () => {
    const list = sea();
    const tabs = noteTabsOf(list, (r) => !r.doneAt);
    const work = tabs.tabs.find((t) => t.label === 'Trabalho')!;
    expect(work.n).toBe(3);
    expect(tabs.all).toBe(11);
  });

  it('tudo numa categoria só: nada a separar, sem abas', () => {
    const tabs = noteTabsOf([note('A', 'Trabalho'), note('B', 'Trabalho'), note('C', 'Trabalho')]);
    expect(tabs.tabs).toEqual([]);
  });

  it('a categoria vale sem ligar para acento e caixa, com a grafia mais usada', () => {
    expect(noteTabKey({ category: 'Diário' })).toBe(noteTabKey({ category: 'diario' }));
    const tabs = noteTabsOf([note('A', 'Diário'), note('B', 'Diário'), note('C', 'diario'), note('D', null)]);
    expect(tabs.tabs.map((t) => t.label)).toEqual(['Diário', 'Sem grupo']);
  });

  it('a ordem é a do número à mostra; no empate, a com mais finalizadas escondidas, depois de A a Z', () => {
    const done = { doneAt: '2026-10-02T10:00:00.000Z' };
    const list = [note('A', 'Viagem'), note('B', 'Compras'), note('C', 'Viagem', done), note('D', 'Compras'), note('E', 'Viagem')];
    // Viagem tem 3 (uma finalizada), Compras 2: escondendo as finalizadas, ficam 2 a 2
    expect(noteTabsOf(list).tabs.map((t) => t.label)).toEqual(['Viagem', 'Compras']);
    expect(noteTabsOf(list, (r) => !r.doneAt).tabs.map((t) => t.label)).toEqual(['Viagem', 'Compras']);
    expect(noteTabsOf([...list, note('F', 'Compras')], (r) => !r.doneAt).tabs.map((t) => t.label)).toEqual(['Compras', 'Viagem']);
    expect(noteTabsOf([note('A', 'Viagem'), note('B', 'Compras')]).tabs.map((t) => t.label)).toEqual(['Compras', 'Viagem']);
  });

  it('na ordem montada à mão: as categorias nela, as novas depois (pela quantidade) e Sem categoria no fim', () => {
    const tabs = noteTabsOf(sea(), undefined, undefined, ['receitas', 'viagem']);
    expect(tabs.tabs.map((t) => t.label)).toEqual(['Receitas', 'Viagem', 'Trabalho', 'Estudos', 'Sem grupo']);
  });

  it('na ordem montada, o Mais leva as últimas da ordem, não as menores; a aberta fica em pé', () => {
    const tabs: NoteTab[] = 'ABCDEFGHIJ'.split('').map((c, i) => ({ key: `c:${c}`, label: c, n: 10 - i, total: 10 - i })).reverse();
    // J (a menor) é a primeira da ordem
    const split = splitTabs(tabs, ALL_TAB, undefined, true);
    expect(split.shown.map((t) => t.label)).toEqual(['J', 'I', 'H', 'G', 'F', 'E', 'D']);
    expect(split.more.map((t) => t.label)).toEqual(['C', 'B', 'A']);
    expect(splitTabs(tabs, 'c:A', undefined, true).shown.map((t) => t.label)).toEqual(['J', 'I', 'H', 'G', 'F', 'E', 'A']);
  });

  it('as escondidas vão sempre para o Mais, mesmo abertas e com lugar de sobra', () => {
    const tabs: NoteTab[] = 'ABC'.split('').map((c, i) => ({ key: `c:${c}`, label: c, n: 10 - i, total: 10 - i }));
    const hidden = new Set(['c:A']);
    expect(splitTabs(tabs, ALL_TAB, undefined, false, hidden)).toEqual({ shown: [tabs[1], tabs[2]], more: [tabs[0]] });
    expect(splitTabs(tabs, 'c:A', undefined, false, hidden).more.map((t) => t.label)).toEqual(['A']);
    // o "Mais" conta na largura: sem lugar para ele e as duas, fica uma em pé
    const room = (shown: readonly NoteTab[], more: boolean) => shown.length + (more ? 1 : 0) <= 2;
    expect(splitTabs(tabs, ALL_TAB, room, false, hidden)).toEqual({ shown: [tabs[1]], more: [tabs[0], tabs[2]] });
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
    // o mural de antes, com a aba Tudo (sem ela, abre no primeiro grupo: ver note-tabs.spec.ts)
    TestBed.inject(Settings).setNotesConfig({ showAll: true });
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

  it('as categorias escondidas na engrenagem viram abas do Mais (pela chave, sem acento nem caixa)', () => {
    const settings = TestBed.inject(Settings);
    expect(view.hiddenTabs().size).toBe(0);
    settings.setCategoryPrefs('ESTUDOS', { hidden: true });
    expect([...view.hiddenTabs()]).toEqual([key('Estudos')]);
    settings.setCategoryPrefs('Estudos', { hidden: false });
    expect(view.hiddenTabs().size).toBe(0);
    expect(settings.notesConfig().categories).toEqual({});
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

  it('cada aba lembra a sua ordem, direção e tipo de ficha; a nova começa como Tudo', () => {
    view.setSort('data');
    view.setNoteTab(key('Trabalho'));
    expect(view.shownSort()).toBe('data');
    view.setSort('alfabetica');
    view.setDensity('simples');
    view.setNoteTab(key('Estudos'));
    expect(view.shownSort()).toBe('data');
    expect(view.density()).toBe('completa');
    view.setNoteTab(key('Trabalho'));
    expect(view.shownSort()).toBe('alfabetica');
    expect(view.direction()).toBe('asc');
    expect(view.density()).toBe('simples');
    view.setNoteTab(ALL_TAB);
    expect(view.shownSort()).toBe('data');
  });

  it('o tipo de ficha das anotações não muda o dos murais de resenhas', () => {
    view.setDensity('capas');
    TestBed.inject(Mural).kind.set('jogos');
    expect(view.density()).toBe('completa');
  });

  it('a lista é só das anotações: nos murais de resenhas, o tipo de ficha não muda', () => {
    view.setDensity('lista');
    expect(view.density()).toBe('lista');
    TestBed.inject(Mural).kind.set('jogos');
    view.setDensity('lista');
    expect(view.density()).toBe('completa');
  });

  it('a vista de antes das abas (noteSort, noteDirection) vira a de Tudo', () => {
    localStorage.setItem('mural-de-jogos:vista:v1', JSON.stringify({ noteSort: 'categoria', noteDirection: 'asc', density: 'simples' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(Mural).kind.set('anotacoes');
    TestBed.inject(ReviewStore).reviews.set(sea());
    TestBed.inject(Settings).setNotesConfig({ showAll: true });
    const fresh = TestBed.inject(WallView);
    expect(fresh.shownSort()).toBe('categoria');
    expect(fresh.direction()).toBe('asc');
    expect(fresh.density()).toBe('simples');
  });

  it('numa aba de categoria, ordenar por categoria vira Prioridade', () => {
    view.setSort('categoria');
    expect(view.shownSort()).toBe('categoria');
    // a aba Estudos começa com a vista de Tudo (por categoria), que ali vira Prioridade
    view.setNoteTab(key('Estudos'));
    expect(view.shownSort()).toBe('prioridade');
  });

  it('com a ordem montada nas configurações do mural, as abas e as seções por categoria seguem ela', () => {
    const settings = TestBed.inject(Settings);
    settings.setNotesConfig({ orderBy: 'minha', order: ['viagem', 'receitas'] });
    expect(view.noteTabs()!.tabs.map((t) => t.label)).toEqual(['Viagem', 'Receitas', 'Trabalho', 'Estudos', 'Sem grupo']);
    view.setSort('categoria');
    // as da ordem nela; as de fora, depois, de A a Z
    expect(view.groups().map((g) => g.label)).toEqual(['Viagem', 'Receitas', 'Estudos', 'Trabalho', 'Sem grupo']);
    // pela quantidade de novo: a ordem montada fica guardada, mas não vale
    settings.setNotesConfig({ orderBy: 'quantidade' });
    expect(view.noteTabs()!.tabs[0].label).toBe('Trabalho');
    expect(settings.notesConfig().order).toEqual(['viagem', 'receitas']);
  });

  it('por tag: seções pela primeira tag, de A a Z, e Sem tag no fim', () => {
    store.reviews.update((list) => [...list, note('Exercícios', 'Estudos')]);
    view.setNoteTab(key('Estudos'));
    view.setSort('tag');
    expect(view.groups().map((g) => g.label)).toEqual(['#DDD', '#Rust', '#SQL', 'Sem tag']);
  });

  it('a seção fechada é da aba, fica guardada, e cada mural de resenhas fecha as suas', () => {
    view.toggleCollapsed('fixadas');
    expect(view.isCollapsed('fixadas')).toBeTrue();
    view.setNoteTab(key('Trabalho'));
    expect(view.isCollapsed('fixadas')).toBeFalse();
    view.setNoteTab(ALL_TAB);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('mural-de-jogos:vista:v1')!).collapsed).toEqual(['::fixadas']);
    const mural = TestBed.inject(Mural);
    mural.kind.set('jogos');
    expect(view.isCollapsed('2026-10')).toBeFalse();
    view.toggleCollapsed('2026-10');
    expect(view.isCollapsed('2026-10')).toBeTrue();
    mural.kind.set('livros');
    expect(view.isCollapsed('2026-10')).toBeFalse();
    mural.kind.set('anotacoes');
    expect(view.isCollapsed('fixadas')).toBeTrue();
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

describe('WallView sem a aba Tudo (o padrão)', () => {
  let view: WallView;
  let settings: Settings;
  const key = (label: string) => noteTabKey({ category: label });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set(sea());
    settings = TestBed.inject(Settings);
    view = TestBed.inject(WallView);
    TestBed.inject(Mural).kind.set('anotacoes');
  });

  afterEach(() => localStorage.clear());

  it('o mural abre no primeiro grupo, sem a aba Tudo; com ela ligada nas configurações, abre em Tudo', () => {
    expect(settings.notesConfig().showAll).toBeFalse();
    expect(view.activeTab()).toBe(key('Trabalho'));
    expect(view.allTabShown()).toBeFalse();
    expect(view.visible().map((r) => r.game.name)).toEqual(['Retro', 'Daily 01', 'Daily 02']);
    // a nova escrita agora vai para o grupo aberto
    expect(view.newNoteCategory()).toBe('Trabalho');
    settings.setNotesConfig({ showAll: true });
    expect(view.activeTab()).toBe(ALL_TAB);
    expect(view.allTabShown()).toBeTrue();
  });

  it('o primeiro grupo em pé: o escondido na engrenagem fica no "Mais" e não abre sozinho', () => {
    settings.setCategoryPrefs('Trabalho', { hidden: true });
    expect(view.activeTab()).toBe(key('Estudos'));
    // escolhido, abre (pelo "Mais")
    view.setNoteTab(key('Trabalho'));
    expect(view.activeTab()).toBe(key('Trabalho'));
  });

  it('a busca em todos os grupos abre o Tudo só até escolher um grupo (e não fica guardado)', () => {
    view.setNoteTab(ALL_TAB);
    expect(view.activeTab()).toBe(ALL_TAB);
    // aberto, mas sem o olho: ele continua no "Mais" (que mostra o nome dele)
    expect(view.allTabShown()).toBeFalse();
    expect(view.visible().length).toBe(11);
    view.setNoteTab(key('Viagem'));
    expect(view.allTabShown()).toBeFalse();
    // a aba guardada como Tudo (de antes, ou da busca) abre no primeiro grupo na próxima visita
    view.setNoteTab(ALL_TAB);
    TestBed.tick();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set(sea());
    TestBed.inject(Mural).kind.set('anotacoes');
    expect(TestBed.inject(WallView).activeTab()).toBe(key('Trabalho'));
  });

  it('o grupo aberto no mural é o do Kanban, e o quadro aberto no Kanban abre o grupo no mural', () => {
    view.setNoteTab(key('Estudos'));
    TestBed.tick();
    expect(localStorage.getItem(KANBAN_LAST_KEY)).toContain(boardIdFor('Estudos'));
    view.toggle('tag', 'Rust');
    view.openGroup('Viagem');
    expect(view.activeTab()).toBe(key('Viagem'));
    expect(view.filterCount()).withContext('os filtros eram da aba de antes').toBe(0);
    TestBed.tick();
    expect(localStorage.getItem(KANBAN_LAST_KEY)).toContain(boardIdFor('Viagem'));
  });

  it('sem o Tudo, cabe um grupo a mais em pé', () => {
    const many = Array.from({ length: MAX_TABS + 2 }, (_, i): NoteTab => ({ key: `c:g${i}`, label: `G${i}`, n: 20 - i, total: 20 - i }));
    expect(splitTabs(many, many[0].key).shown.length).toBe(MAX_TABS - 1);
    expect(splitTabs(many, many[0].key, undefined, false, new Set(), MAX_TABS).shown.length).toBe(MAX_TABS);
  });
});
