import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Mural } from './mural';
import { WallView } from './wall-view';
import { Settings } from './settings';
import { SharedEntry, SharedStore } from './shared-store';

function r(id: string, name: string, completedAt: string | null, diversao: number, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    game: { name },
    scores: { historia: 5, diversao, jogabilidade: 5, visual: 5 },
    status: 'finalizado',
    completedAt,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

describe('WallView', () => {
  let store: ReviewStore;
  let view: WallView;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    view = TestBed.inject(WallView);
    store.reviews.set([
      r('raaaa1', 'Zelda', '2024-03-10', 9, { verdict: 'masterpiece' }),
      r('rbbbb1', 'Alan Wake', '2024-03-02', 4, { status: 'incompleto' }),
      r('rcccc1', 'Hades', '2024-01-20', 7, { text: 'roguelike viciante' }),
      r('rdddd1', 'Celeste', null, 8),
    ]);
  });

  afterEach(() => localStorage.clear());

  it('por data: mais recentes primeiro, sem data sempre no fim, em seções por mês', () => {
    view.setSort('data');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda', 'Alan Wake', 'Hades', 'Celeste']);
    expect(view.groups().map((g) => g.label)).toEqual(['Março de 2024', 'Janeiro de 2024', 'Data não definida']);
    view.toggleDirection();
    expect(view.visible().map((x) => x.game.name)).toEqual(['Hades', 'Alan Wake', 'Zelda', 'Celeste']);
  });

  it('por nome, de A a Z, em seções por letra', () => {
    view.setSort('alfabetica');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Alan Wake', 'Celeste', 'Hades', 'Zelda']);
    expect(view.groups().map((g) => g.label)).toEqual(['A', 'C', 'H', 'Z']);
  });

  it('ano sem dia fica em sua própria seção e ordena sem presumir janeiro', () => {
    store.reviews.update((list) => [...list, r('year11', 'Ano lembrado', '2024', 8)]);
    view.setSort('data');
    expect(view.groups().map((g) => g.label)).toEqual(['Março de 2024', 'Janeiro de 2024', '2024', 'Data não definida']);
    view.toggleDirection();
    expect(view.visible()[0].game.name).toBe('Ano lembrado');
    expect(view.visible().at(-1)!.completedAt).toBeNull();
  });

  it('mês sem dia fica na seção do mês, como mais antigo que os dias dele; o ano sozinho, depois dos meses', () => {
    store.reviews.update((list) => [
      ...list,
      r('rmes001', 'Só o mês', '2024-03', 8),
      r('rano001', 'Só o ano', '2024', 8),
      r('rant001', 'Ano antes', '2023-12-31', 8),
    ]);
    view.setSort('data');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda', 'Alan Wake', 'Só o mês', 'Hades', 'Só o ano', 'Ano antes', 'Celeste']);
    expect(view.groups().map((g) => g.label)).toEqual(['Março de 2024', 'Janeiro de 2024', '2024', 'Dezembro de 2023', 'Data não definida']);
    view.toggleDirection();
    expect(view.visible().map((x) => x.game.name)).toEqual(['Ano antes', 'Só o ano', 'Hades', 'Só o mês', 'Alan Wake', 'Zelda', 'Celeste']);
  });

  it('por nota: maiores primeiro, em faixas', () => {
    view.setSort('nota');
    view.scoreKey.set('diversao');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda', 'Celeste', 'Hades', 'Alan Wake']);
  });

  it('busca no nome e no texto, sem ligar para acento', () => {
    view.query.set('ROGUÉLIKE');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Hades']);
  });

  it('só mostra o mural aberto, e a nota de outro mural ordena pela Média', () => {
    store.reviews.update((list) => [
      ...list,
      sanitizeReview({ id: 'rlivro1', kind: 'livros', game: { name: 'Duna' }, scores: { historia: 9, envolvimento: 9, personagens: 9, escrita: 9 } })!,
    ]);
    expect(view.visible().length).toBe(4);
    const mural = TestBed.inject(Mural);
    mural.kind.set('livros');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Duna']);
    view.setSort('nota');
    view.scoreKey.set('diversao');
    expect(view.activeScore()).toBe('final');
    mural.kind.set('jogos');
    expect(view.activeScore()).toBe('diversao');
  });

  it('a tag escolhida nas anotações não filtra as análises, e volta a valer nas anotações', () => {
    store.reviews.update((list) => [
      ...list,
      sanitizeReview({ id: 'nbug001', kind: 'anotacoes', game: { name: 'Consertar' }, tags: ['Bug'], createdAt: '2024-01-01T00:00:00.000Z' })!,
      sanitizeReview({ id: 'nideia1', kind: 'anotacoes', game: { name: 'Pensar' }, tags: ['Ideia'], createdAt: '2024-01-01T00:00:00.000Z' })!,
    ]);
    const mural = TestBed.inject(Mural);
    mural.kind.set('anotacoes');
    view.toggle('tag', 'Bug');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Consertar']);
    mural.kind.set('jogos');
    expect(view.visible().length).toBe(4);
    expect(view.tags()).toEqual([]);
    expect(view.filterCount()).toBe(0);
    expect(view.isFiltered()).toBeFalse();
    mural.kind.set('anotacoes');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Consertar']);
  });

  it('filtra por veredito e conta cada um', () => {
    view.toggle('verdict', 'masterpiece');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda']);
    const verdicts = view.facets().find((f) => f.key === 'verdict')!;
    expect(verdicts.options.find((o) => o.value === 'sem')!.n).toBe(3);
    expect(view.isFiltered()).toBeTrue();
    expect(view.filterCount()).toBe(1);
  });

  it('no mesmo grupo vale qualquer um; entre grupos, todos juntos', () => {
    view.setSort('alfabetica');
    // Médias: Zelda 6,6 · Celeste 6,2 · Hades 5,8 · Alan Wake 4,6
    view.toggle('grade', '6');
    view.toggle('grade', '5');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Celeste', 'Hades', 'Zelda']);
    view.toggle('verdict', 'masterpiece');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda']);
    // a contagem de um grupo ignora o próprio grupo e respeita os outros
    const grades = view.facets().find((f) => f.key === 'grade')!;
    expect(grades.options.find((o) => o.value === '6')!.n).toBe(1);
    expect(grades.options.find((o) => o.value === '5')!.n).toBe(0);
    view.clearFacet('verdict');
    expect(view.visible().length).toBe(3);
  });

  it('filtra por status, ano e fichas sem texto', () => {
    view.toggle('status', 'incompleto');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Alan Wake']);
    view.clearFilters();
    view.toggle('text', 'sem');
    expect(view.visible().map((x) => x.game.name)).not.toContain('Hades');
    expect(view.visible().length).toBe(3);
    view.clearFilters();
    view.toggle('year', 'sem');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Celeste']);
    expect(view.tags().map((t) => t.label)).toEqual(['Sem data']);
  });

  it('filtra fichas decoradas e lisas', () => {
    store.reviews.update((list) => [...list, r('deco11', 'Decorada', '2024-05-01', 8, { pattern: 'gatinhos' }), r('deco22', 'Manchada', '2024-05-02', 8, { stain: 'cafe' })]);
    view.setSort('alfabetica');
    view.toggle('look', 'com');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Decorada', 'Manchada']);
    view.toggle('look', 'com');
    view.toggle('look', 'sem');
    expect(view.visible().length).toBe(4);
  });

  it('limpar tira a busca e todos os filtros', () => {
    view.query.set('hades');
    view.toggle('status', 'finalizado');
    view.clearFilters();
    expect(view.isFiltered()).toBeFalse();
    expect(view.visible().length).toBe(4);
  });

  describe('a visualização padrão do grupo (configurações do mural)', () => {
    const note = (id: string, name: string, category: string) => sanitizeReview({ id, kind: 'anotacoes', game: { name }, category, createdAt: '2024-01-01T00:00:00.000Z' })!;
    let settings: Settings;

    beforeEach(() => {
      settings = TestBed.inject(Settings);
      store.reviews.update((list) => [...list, note('ntrab01', 'Daily', 'Trabalho'), note('ncasa01', 'Receitas', 'Casa')]);
      TestBed.inject(Mural).kind.set('anotacoes');
    });

    it('sem padrão, o grupo abre na última visualização usada nele (guardada)', () => {
      view.setNoteTab('c:trabalho');
      view.setDensity('capas');
      view.setNoteTab('c:casa');
      expect(view.density()).toBe('completa');
      view.setNoteTab('c:trabalho');
      expect(view.density()).toBe('capas');
    });

    it('com padrão, o grupo sempre abre nele; trocar na régua vale só até sair do grupo', () => {
      view.setNoteTab('c:trabalho');
      view.setDensity('capas');
      settings.setCategoryPrefs('Trabalho', { view: 'lista' });
      expect(view.groupDensity()).toBe('lista');
      expect(view.density()).toBe('lista');
      view.setDensity('simples');
      expect(view.density()).toBe('simples');
      // a escolhida na régua não é guardada como a do grupo
      expect(view.noteViews()['c:trabalho'].density).toBe('capas');
      view.setNoteTab('c:casa');
      expect(view.density()).toBe('completa');
      view.setNoteTab('c:trabalho');
      expect(view.density()).toBe('lista');
      // abrir pelo Kanban também volta ao padrão
      view.setDensity('inteira');
      view.openGroup('Casa');
      view.openGroup('Trabalho');
      expect(view.density()).toBe('lista');
    });

    it('tirar o padrão volta à última usada no grupo; o padrão de um grupo não mexe nos outros', () => {
      settings.setCategoryPrefs('Trabalho', { view: 'lista' });
      view.setNoteTab('c:casa');
      expect(view.groupDensity()).toBeNull();
      view.setDensity('capas');
      expect(view.density()).toBe('capas');
      view.setNoteTab('c:trabalho');
      expect(view.density()).toBe('lista');
      settings.setCategoryPrefs('Trabalho', { view: undefined });
      expect(view.density()).toBe('completa');
    });

    it('nos murais de análises, o padrão dos grupos não vale', () => {
      settings.setCategoryPrefs('Trabalho', { view: 'lista' });
      view.setNoteTab('c:trabalho');
      TestBed.inject(Mural).kind.set('jogos');
      expect(view.groupDensity()).toBeNull();
      expect(view.density()).toBe('completa');
    });
  });

  describe('as ordens das anotações', () => {
    const note = (id: string, name: string, extra: Record<string, unknown> = {}) =>
      sanitizeReview({ id, kind: 'anotacoes', game: { name }, category: 'Estudos', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', ...extra })!;
    const names = () => view.visible().map((x) => x.game.name);
    const sections = () => view.groups().map((g) => `${g.label}: ${g.reviews.map((x) => x.game.name).join(', ')}`);

    beforeEach(() => {
      TestBed.inject(Mural).kind.set('anotacoes');
      view.showDone.set(true);
    });

    it('por tag, a anotação aparece na seção de cada tag dela; a segunda vez é uma cópia', () => {
      store.reviews.update((list) => [
        ...list,
        note('n1', 'Dois', { tags: ['Bug', 'Ideia'], createdAt: '2024-01-03T00:00:00.000Z' }),
        note('n2', 'Só bug', { tags: ['bug'], createdAt: '2024-01-02T00:00:00.000Z' }),
        note('n3', 'Sem nada'),
        note('n4', 'Só ideia', { tags: ['Ideia'], createdAt: '2024-01-04T00:00:00.000Z' }),
      ]);
      view.setSort('tag');
      const dois = () => store.reviews().find((x) => x.game.name === 'Dois')!.id;
      expect(sections()).toEqual(['#Bug: Dois, Só bug', '#Ideia: Só ideia, Dois', 'Sem tag: Sem nada']);
      expect(view.groups()[0].copies).toBeUndefined();
      expect([...view.groups()[1].copies!]).toEqual([dois()]);
      // a lista do mural (a ordem, as contas) não repete
      expect(names().length).toBe(4);
      view.toggleDirection();
      expect(sections()).toEqual(['#Ideia: Só ideia, Dois', '#Bug: Dois, Só bug', 'Sem tag: Sem nada']);
      expect([...view.groups()[1].copies!]).toEqual([dois()]);
    });

    it('por tag com as fixadas no topo: a fixada fica só na seção das fixadas', () => {
      store.reviews.update((list) => [...list, note('n1', 'Fixada', { tags: ['Bug', 'Ideia'], noteRank: 'fixada' }), note('n2', 'Comum', { tags: ['Bug'] })]);
      view.pinnedFirst.set(true);
      view.setSort('tag');
      expect(sections()).toEqual(['Fixadas: Fixada', '#Bug: Comum']);
    });

    it('criação, alteração e finalização: pelo instante, em seções por mês; sem finalizar no fim', () => {
      store.reviews.update((list) => [
        ...list,
        note('n1', 'Velha', { createdAt: '2024-01-05T12:00:00.000Z', updatedAt: '2024-05-05T12:00:00.000Z', doneAt: '2024-02-10T12:00:00.000Z' }),
        note('n2', 'Nova', { createdAt: '2024-03-05T12:00:00.000Z', updatedAt: '2024-03-06T12:00:00.000Z' }),
        note('n3', 'Meio', { createdAt: '2024-02-05T12:00:00.000Z', updatedAt: '2024-02-06T12:00:00.000Z', doneAt: '2024-04-10T12:00:00.000Z' }),
      ]);
      view.setSort('criacao');
      expect(names()).toEqual(['Nova', 'Meio', 'Velha']);
      expect(view.groups().map((g) => g.label)).toEqual(['Março de 2024', 'Fevereiro de 2024', 'Janeiro de 2024']);
      view.toggleDirection();
      expect(names()).toEqual(['Velha', 'Meio', 'Nova']);
      view.setSort('alteracao');
      expect(names()).toEqual(['Velha', 'Nova', 'Meio']);
      view.setSort('finalizacao');
      expect(sections()).toEqual(['Abril de 2024: Meio', 'Fevereiro de 2024: Velha', 'Não finalizadas: Nova']);
      // sem "Mostrar finalizadas", a ordem por finalização mostra as finalizadas mesmo assim (só ela)
      view.showDone.set(false);
      expect(sections()).toEqual(['Abril de 2024: Meio', 'Fevereiro de 2024: Velha', 'Não finalizadas: Nova']);
      expect(view.hiddenDone()).toBe(0);
      view.setSort('criacao');
      expect(names()).toEqual(['Nova']);
      view.setSort('finalizacao');
      view.showDone.set(true);
      view.toggleDirection();
      expect(sections()).toEqual(['Fevereiro de 2024: Velha', 'Abril de 2024: Meio', 'Não finalizadas: Nova']);
    });

    it('tarefas: as com mais por fazer primeiro; depois as feitas, e sem tarefa no fim', () => {
      store.reviews.update((list) => [
        ...list,
        note('n1', 'Uma', { text: '- [ ] a\n- [x] b' }),
        note('n2', 'Feitas', { text: '- [x] a' }),
        note('n3', 'Duas', { text: '- [ ] a\n- [ ] b' }),
        note('n4', 'Texto', { text: 'só texto' }),
      ]);
      view.setSort('tarefas');
      expect(sections()).toEqual(['Com tarefas por fazer: Duas, Uma', 'Todas feitas: Feitas', 'Sem tarefas: Texto']);
      view.toggleDirection();
      expect(sections()).toEqual(['Com tarefas por fazer: Uma, Duas', 'Todas feitas: Feitas', 'Sem tarefas: Texto']);
    });

    it('cor (na ordem das cartolinas) e quem vê (privadas, depois públicas)', () => {
      store.reviews.update((list) => [
        ...list,
        note('n1', 'Azul', { stock: 'azul', private: true }),
        note('n2', 'Vermelha', { stock: 'vermelho' }),
        note('n3', 'Preta', { stock: 'preto', quiet: true }),
      ]);
      view.setSort('cor');
      expect(sections()).toEqual(['Vermelho: Vermelha', 'Azul: Azul', 'Preto: Preta']);
      view.setSort('quem');
      expect(sections()).toEqual(['Privadas: Azul', 'Públicas: Vermelha, Preta']);
    });

    it('nos murais de análises, as ordens das anotações viram data', () => {
      view.setSort('tarefas');
      TestBed.inject(Mural).kind.set('jogos');
      view.setSort('criacao');
      expect(view.shownSort()).toBe('data');
    });
  });

  describe('as abas Fixadas e Compartilhadas', () => {
    const note = (id: string, name: string, extra: Record<string, unknown> = {}) =>
      sanitizeReview({ id, kind: 'anotacoes', game: { name }, createdAt: '2024-01-01T00:00:00.000Z', ...extra })!;
    let settings: Settings;
    /** As compartilhadas com você (o SharedStore de mentira: a entrada com o dono e a anotação). */
    function share(r: Review, dono: string): void {
      const shared = TestBed.inject(SharedStore);
      const entry = { id: r.id, papel: 'editor', dono: { codigo: 'AAAA-' + dono.slice(0, 4).toUpperCase(), nome: dono, foto: null }, view: r } as unknown as SharedEntry;
      shared.entries.update((m) => new Map(m).set(r.id, entry));
      TestBed.tick();
    }

    beforeEach(() => {
      settings = TestBed.inject(Settings);
      TestBed.inject(Mural).kind.set('anotacoes');
      store.reviews.update((list) => [
        ...list,
        note('ntrab01', 'Daily', { category: 'Trabalho', noteRank: 'fixada' }),
        note('ntrab02', 'Ata', { category: 'Trabalho' }),
        note('ncasa01', 'Receitas', { category: 'Casa', noteRank: 'fixada' }),
        note('ncasa02', 'Contas', { category: 'Casa' }),
      ]);
    });

    it('Fixadas: em pé quando há alguma fixada (ligada por padrão), com as fixadas de todos os grupos', () => {
      expect(view.specialTabs().map((t) => `${t.label} ${t.n}`)).toEqual(['Fixadas 2']);
      view.setNoteTab('fixadas');
      expect(view.activeTab()).toBe('fixadas');
      expect(view.activeTabLabel()).toBe('Fixadas');
      expect(view.visible().map((x) => x.game.name).sort()).toEqual(['Daily', 'Receitas']);
      // ela começa ordenada por grupo, que separa as fixadas pelos grupos delas
      expect(view.shownSort()).toBe('categoria');
      expect(view.groups().map((g) => g.label)).toEqual(['Casa', 'Trabalho']);
      // desligada nas configurações, a aba some e o mural volta a um grupo
      settings.setNotesConfig({ showPinned: false });
      expect(view.specialTabs()).toEqual([]);
      expect(view.activeTab()).not.toBe('fixadas');
    });

    it('Fixadas: sem nenhuma fixada, não aparece; com todas finalizadas e escondidas, fica (como um grupo)', () => {
      store.reviews.update((list) => list.map((r) => (r.noteRank ? { ...r, doneAt: '2024-02-01T00:00:00.000Z' } : r)));
      expect(view.specialTabs().map((t) => `${t.label} ${t.n}`)).toEqual(['Fixadas 0']);
      store.reviews.update((list) => list.map((r) => (r.noteRank ? { ...r, noteRank: undefined } : r)));
      expect(view.specialTabs()).toEqual([]);
    });

    it('com um grupo só (nada a separar), as abas especiais aparecem com o Tudo', () => {
      store.reviews.update((list) => list.filter((r) => r.kind !== 'anotacoes' || r.category === 'Trabalho'));
      expect(view.noteTabs()!.tabs).toEqual([]);
      expect(view.specialTabs().map((t) => t.label)).toEqual(['Fixadas']);
      expect(view.allTabShown()).toBeTrue();
      view.setNoteTab('fixadas');
      expect(view.activeTab()).toBe('fixadas');
      view.setNoteTab('');
      expect(view.activeTab()).toBe('');
    });

    it('Compartilhadas: as que outras pessoas compartilharam com você, sem grupo, ordenadas pelo dono', () => {
      const ana = note('nshar01', 'Viagem', {});
      const bia = note('nshar02', 'Livros', {});
      store.reviews.update((list) => [...list, ana, bia]);
      share(ana, 'Ana');
      share(bia, 'Bia');
      expect(view.specialTabs().map((t) => `${t.label} ${t.n}`)).toEqual(['Fixadas 2', 'Compartilhadas 2']);
      view.setNoteTab('compartilhadas');
      expect(view.activeTab()).toBe('compartilhadas');
      expect(view.shownSort()).toBe('dono');
      expect(view.groups().map((g) => `${g.label}: ${g.reviews.map((x) => x.game.name).join(', ')}`)).toEqual(['Ana: Viagem', 'Bia: Livros']);
      view.toggleDirection();
      expect(view.groups().map((g) => g.label)).toEqual(['Bia', 'Ana']);
      // na aba Tudo, por dono: as suas primeiro, depois as dos outros
      view.setNoteTab('');
      view.setSort('dono');
      expect(view.groups().map((g) => g.label)).toEqual(['Você', 'Ana', 'Bia']);
      settings.setNotesConfig({ showShared: false });
      expect(view.specialTabs().map((t) => t.label)).toEqual(['Fixadas']);
    });
  });

  describe('a ordenação padrão do grupo (configurações do mural)', () => {
    const note = (id: string, name: string, category: string, completedAt: string) =>
      sanitizeReview({ id, kind: 'anotacoes', game: { name }, category, completedAt, createdAt: '2024-01-01T00:00:00.000Z' })!;
    let settings: Settings;

    beforeEach(() => {
      settings = TestBed.inject(Settings);
      store.reviews.update((list) => [...list, note('ntrab01', 'Daily', 'Trabalho', '2024-02-01'), note('ntrab02', 'Ata', 'Trabalho', '2024-03-01'), note('ncasa01', 'Receitas', 'Casa', '2024-01-01')]);
      TestBed.inject(Mural).kind.set('anotacoes');
    });

    it('com padrão, o grupo sempre abre nele; trocar na régua (a ordem ou a direção) vale só até sair do grupo', () => {
      view.setNoteTab('c:trabalho');
      view.setSort('data');
      settings.setCategoryPrefs('Trabalho', { sort: 'alfabetica' });
      expect(view.groupSort()).toBe('alfabetica');
      expect(view.shownSort()).toBe('alfabetica');
      expect(view.direction()).toBe('asc');
      expect(view.visible().map((x) => x.game.name)).toEqual(['Ata', 'Daily']);
      view.toggleDirection();
      expect(view.visible().map((x) => x.game.name)).toEqual(['Daily', 'Ata']);
      view.setSort('criacao');
      expect(view.shownSort()).toBe('criacao');
      // o que a régua escolheu não vira a ordem guardada do grupo
      expect(view.noteViews()['c:trabalho'].sort).toBe('data');
      view.setNoteTab('c:casa');
      expect(view.shownSort()).toBe('prioridade');
      view.setNoteTab('c:trabalho');
      expect(view.shownSort()).toBe('alfabetica');
      expect(view.direction()).toBe('asc');
    });

    it('tirar o padrão volta à última usada no grupo; nos murais de análises, não vale', () => {
      view.setNoteTab('c:trabalho');
      view.setSort('data');
      settings.setCategoryPrefs('Trabalho', { sort: 'tag' });
      expect(view.shownSort()).toBe('tag');
      settings.setCategoryPrefs('Trabalho', { sort: undefined });
      expect(view.shownSort()).toBe('data');
      settings.setCategoryPrefs('Trabalho', { sort: 'tarefas' });
      TestBed.inject(Mural).kind.set('jogos');
      expect(view.groupSort()).toBeNull();
    });
  });
});
