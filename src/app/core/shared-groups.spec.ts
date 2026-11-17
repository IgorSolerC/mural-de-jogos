import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloudAccount, CloudError } from './cloud-account';
import { KanbanStore } from './kanban-store';
import { placeCard, sanitizeBoard } from './kanban';
import { mergeNote, mergeTagSets, sharedContent } from './shared-notes';
import { Cloud } from './cloud-config';
import { DATA_KEYS } from './local-data';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { SharedGroup, groupNames, newGroupId, parseGroup } from './shared-groups';
import { GROUPS_AUTO, GROUPS_KEY, SharedGroupsStore } from './shared-groups-store';
import { SharedEntry, SharedStore } from './shared-store';
import { wipeBrowser } from './browser-reset';
import { NoteFolder, mergeFolders } from './folders';
import { NoteFolders } from './note-folders';
import { Settings } from './settings';

/** Os grupos compartilhados no site (PLANO-COMPARTILHAR.md, rodada 3): o que vem da nuvem, o nome no mural e o serviço. */

const ANA = { codigo: 'AAAA-1111', nome: 'Ana Souza' };
const EU = { codigo: 'EEEE-0000', nome: 'Igor' };

const raw = (extra: Record<string, unknown> = {}) => ({
  id: 'gTrabalho001',
  dono: ANA,
  papel: 'editor',
  rev: 2,
  versao: 5,
  dados: { nome: 'Trabalho', aparencia: { icone: 'pasta', cor: 'azul' }, futuro: 1 },
  publico: false,
  notas: 3,
  membros: [{ ...EU, papel: 'editor', desde: '2026-11-11T10:00:00.000Z' }],
  atualizadoEm: '2026-11-11T10:00:00.000Z',
  ...extra,
});

const note = (id: string, category: string, extra: Record<string, unknown> = {}): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: `Tarefa ${id}`, coverUrl: null, source: 'manual' },
    text: '',
    category,
    completedAt: '2026-11-11',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    private: true,
    ...extra,
  })!;

describe('grupos compartilhados: o que vem da nuvem (core/shared-groups.ts)', () => {
  it('confere o grupo, guarda o que não conhece do documento e o papel de cada um', () => {
    const g = parseGroup(raw())!;
    expect(g).toEqual(jasmine.objectContaining({ id: 'gTrabalho001', papel: 'editor', rev: 2, versao: 5, publico: false, notas: 3 }));
    expect(g.dados).toEqual({ nome: 'Trabalho', aparencia: { icone: 'pasta', cor: 'azul' }, futuro: 1 });
    expect(g.membros.map((m) => [m.nome, m.papel])).toEqual([['Igor', 'editor']]);
    expect(parseGroup(raw({ id: 'n-solta1' }))).toBeNull();
    expect(parseGroup(raw({ dados: { nome: '  ' } }))).toBeNull();
    expect(parseGroup(raw({ papel: 'dona' }))).toBeNull();
  });

  it('o id novo tem a forma que a nuvem aceita', () => {
    for (let i = 0; i < 20; i++) expect(newGroupId()).toMatch(/^g[A-Za-z0-9_-]{21}$/);
  });

  it('o nome no mural: o do dono; com um grupo seu de mesmo nome, ganha o primeiro nome dela (D8)', () => {
    const g = parseGroup(raw())!;
    expect(groupNames([g], ['Casa']).get(g.id)).toBe('Trabalho');
    expect(groupNames([g], ['trabalho']).get(g.id)).toBe('Trabalho · Ana');
    // o seu, compartilhado, é ele mesmo, mesmo com o de outra pessoa de mesmo nome
    const mine: SharedGroup = { ...g, id: 'gMeuTrabalho', papel: 'dono', dono: { ...EU, foto: null } };
    const names = groupNames([g, mine], []);
    expect(names.get('gMeuTrabalho')).toBe('Trabalho');
    expect(names.get(g.id)).toBe('Trabalho · Ana');
  });
});

describe('grupos compartilhados: o serviço (core/shared-groups-store.ts)', () => {
  let calls: { path: string; body?: unknown }[];
  let entries: ReturnType<typeof signal<ReadonlyMap<string, SharedEntry>>>;
  let names: ReturnType<typeof signal<ReadonlyMap<string, string>>>;
  let store: ReviewStore;

  function setup() {
    calls = [];
    entries = signal(new Map());
    names = signal(new Map());
    const replies: Record<string, unknown> = {
      'POST /v1/grupos': { grupo: raw({ papel: 'dono', dono: EU, membros: [{ ...ANA, papel: 'editor', desde: '' }] }) },
      'GET /v1/eu/grupos': { grupos: [] },
      'PUT /v1/grupos/gTrabalho001': { grupo: raw({ papel: 'dono', dono: EU, publico: true, rev: 3 }) },
    };
    const shared = {
      entries,
      groupNames: names,
      get: (id: string) => entries().get(id),
      share: jasmine.createSpy('share').and.resolveTo(undefined),
      moveToGroup: jasmine.createSpy('moveToGroup').and.resolveTo(undefined),
      inGroupOf: (g: string) => [...entries().values()].filter((e) => e.grupo === g),
      placeInGroup: jasmine.createSpy('placeInGroup'),
      unshare: jasmine.createSpy('unshare').and.resolveTo(true),
      sync: jasmine.createSpy('sync').and.resolveTo(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: GROUPS_AUTO, useValue: false },
        { provide: SharedStore, useValue: shared },
        { provide: Cloud, useValue: { config: () => ({ api: 'x' }) } },
        {
          provide: CloudAccount,
          useValue: {
            signedIn: () => true,
            account: () => ({ id: 'u-eu', ...EU }),
            request: async (path: string, init?: { method?: string; body?: unknown }) => {
              calls.push({ path: `${init?.method ?? 'GET'} ${path}`, body: init?.body });
              return replies[`${init?.method ?? 'GET'} ${path}`] ?? { ok: true };
            },
          },
        },
      ],
    });
    store = TestBed.inject(ReviewStore);
    return { groups: TestBed.inject(SharedGroupsStore), shared };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('compartilhar o grupo: o documento com o nome, o desenho e a cor; as anotações dele vão em seguida, uma a uma', async () => {
    const { groups, shared } = setup();
    store.add(note('n-um0001', 'Trabalho'));
    store.add(note('n-dois01', 'Trabalho'));
    store.add(note('n-casa01', 'Casa'));
    const g = await groups.share('Trabalho', [{ codigo: ANA.codigo, papel: 'editor' }], { icone: 'pasta', cor: 'azul' });
    expect(calls[0]).toEqual({ path: 'POST /v1/grupos', body: jasmine.objectContaining({ dados: { nome: 'Trabalho', aparencia: { icone: 'pasta', cor: 'azul' }, pastas: [] }, membros: [{ codigo: ANA.codigo, papel: 'editor' }] }) });
    expect(g.papel).toBe('dono');
    TestBed.tick();
    await groups.adopt();
    expect(shared.share.calls.allArgs().map(([r, people, grupo]) => [(r as Review).id, people, grupo]).sort()).toEqual([
      ['n-dois01', [], g.id],
      ['n-um0001', [], g.id],
    ]);
    // o nome do grupo vai para o SharedStore, que põe nele as anotações do grupo
    expect(names().get(g.id)).toBe('Trabalho');
  });

  it('a compartilhada sua (solta) que vai para o grupo muda de lugar na nuvem; a de outra pessoa fica como está', async () => {
    const { groups, shared } = setup();
    await groups.share('Trabalho', []);
    const g = [...groups.entries().values()][0]!;
    store.add(note('n-solta1', 'Trabalho'));
    store.add(note('n-dela01', 'Trabalho'));
    entries.set(
      new Map([
        ['n-solta1', { id: 'n-solta1', papel: 'dono', grupo: null } as unknown as SharedEntry],
        ['n-dela01', { id: 'n-dela01', papel: 'editor', grupo: null } as unknown as SharedEntry],
      ]),
    );
    shared.share.calls.reset();
    await groups.adopt();
    expect(shared.moveToGroup).toHaveBeenCalledOnceWith('n-solta1', g.id);
    expect(shared.share).not.toHaveBeenCalled();
  });

  it('a privada que chega num grupo público por outro caminho (em massa, Kanban) sobe pública, fora do Feed', async () => {
    const { groups, shared } = setup();
    await groups.share('Trabalho', []);
    await groups.setPublic('gTrabalho001', true);
    store.add(note('n-priv01', 'Trabalho'));
    shared.share.calls.reset();
    await groups.adopt();
    const sent = shared.share.calls.mostRecent().args[0] as Review;
    expect([sent.id, !!sent.private, !!sent.quiet]).toEqual(['n-priv01', false, true]);
  });

  it('sair do grupo: ele sai daqui, e as anotações dele saem com a próxima conferida', async () => {
    const { groups, shared } = setup();
    await groups.share('Trabalho', []);
    const id = [...groups.entries().keys()][0]!;
    await groups.leave(id);
    expect(calls.at(-1)!.path).toBe(`DELETE /v1/grupos/${id}/membros/eu`);
    expect(groups.get(id)).toBeUndefined();
    expect(shared.sync).toHaveBeenCalled();
  });

  it('parar de compartilhar: as anotações ficam no grupo de mesmo nome, só suas', async () => {
    const { groups, shared } = setup();
    await groups.share('Trabalho', []);
    const id = [...groups.entries().keys()][0]!;
    entries.set(new Map([['n-um0001', { id: 'n-um0001', papel: 'dono', grupo: id } as unknown as SharedEntry]]));
    await groups.stop(id);
    expect(shared.placeInGroup).toHaveBeenCalledOnceWith(['n-um0001'], 'Trabalho');
    expect(calls.at(-1)!.path).toBe(`DELETE /v1/grupos/${id}`);
    // as que ficaram só suas voltam a ser anotações comuns (PLANO-CONSERTO-GRUPOS.md, rodada 3)
    expect(shared.unshare).toHaveBeenCalledOnceWith('n-um0001');
    expect(groups.get(id)).toBeUndefined();
  });

  describe('o nome do grupo de outra pessoa com uma anotação nova nele (o conserto de 17/nov)', () => {
    const japones = () => parseGroup(raw({ id: 'gJapones0001', dados: { nome: 'Japones' } }))!;
    const agora = () => ({ updatedAt: new Date().toISOString() });
    /** O serviço com os grupos guardados da conta já lidos (senão a leitura, no primeiro tick, passa por cima). */
    const start = () => {
      const out = setup();
      TestBed.tick();
      return out;
    };

    it('quem escreve no grupo de outra pessoa e cria uma anotação nele: ela sobe para o grupo, e o nome não muda', async () => {
      const { groups, shared } = start();
      const g = japones();
      groups.entries.set(new Map([[g.id, g]]));
      TestBed.tick();
      expect(groups.names().get(g.id)).toBe('Japones');
      // (o editor, o Kanban, o editar em massa e a API das AIs põem a anotação no grupo pelo nome)
      store.add(note('n-nova01', 'Japones', agora()));
      TestBed.tick();
      expect(groups.names().get(g.id)).toBe('Japones');
      expect(groups.ofCategory('Japones')?.id).toBe(g.id);
      await groups.adopt();
      expect(shared.share.calls.allArgs().map(([r, people, grupo]) => [(r as Review).id, people, grupo])).toEqual([['n-nova01', [], g.id]]);
    });

    it('a que ainda não subiu continua a caminho do grupo ao abrir o site de novo', async () => {
      let { groups, shared } = start();
      const g = japones();
      groups.entries.set(new Map([[g.id, g]]));
      TestBed.tick();
      store.add(note('n-nova01', 'Japones', agora()));
      TestBed.tick();
      TestBed.resetTestingModule();
      ({ groups, shared } = start());
      expect(groups.names().get(g.id)).toBe('Japones');
      await groups.adopt();
      expect(shared.share).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'n-nova01' }), [], g.id);
    });

    it('o grupo seu de mesmo nome, de antes do convite, continua seu e à parte: o dela fica "Japones · Ana"', async () => {
      const { groups, shared } = start();
      store.add(note('n-minha1', 'Japones'));
      TestBed.tick();
      const g = japones();
      groups.entries.set(new Map([[g.id, g]]));
      TestBed.tick();
      expect(groups.names().get(g.id)).toBe('Japones · Ana');
      // a nova no seu Japones fica sua; a nova no dela (pelo nome que ele tem aqui) sobe para ele
      store.add(note('n-minha2', 'Japones', agora()));
      store.add(note('n-dela01', 'Japones · Ana', agora()));
      TestBed.tick();
      expect(groups.names().get(g.id)).toBe('Japones · Ana');
      expect(groups.ofCategory('Japones')).toBeUndefined();
      await groups.adopt();
      expect(shared.share.calls.allArgs().map(([r, , grupo]) => [(r as Review).id, grupo])).toEqual([['n-dela01', g.id]]);
    });

    it('as suas de antes que chegam depois do grupo (outro aparelho, a sincronização) não entram nele: ele ganha o "· Ana"', async () => {
      const { groups, shared } = start();
      const g = japones();
      groups.entries.set(new Map([[g.id, g]]));
      TestBed.tick();
      expect(groups.names().get(g.id)).toBe('Japones');
      store.add(note('n-minha1', 'Japones', { updatedAt: '2026-11-01T10:00:00.000Z' }));
      TestBed.tick();
      expect(groups.names().get(g.id)).toBe('Japones · Ana');
      await groups.adopt();
      expect(shared.share).not.toHaveBeenCalled();
    });

    it('num grupo em que você só lê, a anotação nova de mesmo nome é um grupo seu (ela não tem como subir)', () => {
      const { groups } = start();
      const g = parseGroup(raw({ id: 'gJapones0001', papel: 'leitor', dados: { nome: 'Japones' } }))!;
      groups.entries.set(new Map([[g.id, g]]));
      TestBed.tick();
      store.add(note('n-nova01', 'Japones', agora()));
      TestBed.tick();
      expect(groups.names().get(g.id)).toBe('Japones · Ana');
    });
  });

  it('os grupos moram no banco do site (sai na limpeza de sair da conta), por conta', async () => {
    expect(DATA_KEYS as readonly string[]).toContain(GROUPS_KEY);
    const { groups } = setup();
    await groups.share('Trabalho', []);
    TestBed.tick();
    expect(localStorage.getItem(GROUPS_KEY)).toContain('u-eu');
    // (o nome de cada grupo aqui, e desde quando, mora junto: sai com ele)
    expect(JSON.parse(localStorage.getItem(GROUPS_KEY)!).nomes['u-eu']['gTrabalho001'].nome).toBe('Trabalho');
    await wipeBrowser();
    expect(localStorage.getItem(GROUPS_KEY)).toBeNull();
  });
});

describe('grupos compartilhados: o Kanban do grupo (rodada 4)', () => {
  /** A nuvem de mentira de um grupo só: a vez de gravar (`rev`) e o 409 com o de agora. */
  let server: { rev: number; dados: Record<string, unknown>; papel: string };
  let puts: number;

  function detail() {
    return { ...raw({ papel: server.papel, dono: server.papel === 'dono' ? EU : ANA, rev: server.rev, versao: server.rev, dados: server.dados }) };
  }

  function setup(papel = 'dono', keep = false) {
    if (!keep) server = { rev: 1, dados: { nome: 'Trabalho' }, papel };
    puts = 0;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: GROUPS_AUTO, useValue: false },
        {
          provide: SharedStore,
          useValue: { entries: signal(new Map()), groupNames: signal(new Map()), get: () => undefined, inGroupOf: () => [], placeInGroup: () => undefined, sync: async () => undefined, unshare: async () => false },
        },
        { provide: Cloud, useValue: { config: () => ({ api: 'x' }) } },
        {
          provide: CloudAccount,
          useValue: {
            signedIn: () => true,
            account: () => ({ id: 'u-eu', ...EU }),
            request: async (path: string, init?: { method?: string; body?: { base?: number; dados?: Record<string, unknown> } }) => {
              if (path === '/v1/eu/grupos') return { grupos: [{ id: 'gTrabalho001', versao: server.rev, papel: server.papel }] };
              if (path.startsWith('/v1/eu/grupos/detalhes')) return { grupos: [detail()] };
              if (init?.method === 'PUT') {
                puts++;
                if (init.body!.base !== server.rev) throw new CloudError('Outra pessoa gravou antes.', 'conflito', 409, { grupo: detail() });
                server = { ...server, rev: server.rev + 1, dados: init.body!.dados! };
                return { grupo: detail() };
              }
              return { ok: true };
            },
          },
        },
      ],
    });
    return { groups: TestBed.inject(SharedGroupsStore), kanban: TestBed.inject(KanbanStore) };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('o quadro do grupo vem do documento dele, e mexer nele sobe para o grupo (não fica no quadro guardado aqui)', async () => {
    const { groups, kanban } = setup();
    await groups.sync();
    const board = kanban.boardFor('Trabalho');
    expect(kanban.boards().some((b) => b.id === board.id)).toBeFalse();
    const col = board.columns[0]!.id;
    kanban.update(board.id, (b, at) => placeCard(b, 'n-um0001', col, at));
    expect(kanban.boardFor('Trabalho').cards.map((c) => c.note)).toEqual(['n-um0001']);
    expect(kanban.state().boards).toEqual([]);
    await groups.pushAll();
    expect(puts).toBe(1);
    expect((server.dados['kanban'] as { cards: { note: string }[] }).cards.map((c) => c.note)).toEqual(['n-um0001']);
  });

  it('duas pessoas mexendo ao mesmo tempo: as duas mexidas ficam (a junção cartão a cartão)', async () => {
    const { groups, kanban } = setup();
    await groups.sync();
    const board = kanban.boardFor('Trabalho');
    const col = board.columns[0]!.id;
    kanban.update(board.id, (b, at) => placeCard(b, 'n-um0001', col, at));
    await groups.pushAll();
    // a Ana pôs outra anotação enquanto isso (rev 3 na nuvem)
    const theirs = placeCard(sanitizeBoard({ ...(server.dados['kanban'] as object), category: 'Trabalho' })!, 'n-dela01', col, new Date(Date.now() + 1000).toISOString());
    server = { ...server, rev: server.rev + 1, dados: { ...server.dados, kanban: theirs } };
    kanban.update(board.id, (b, at) => placeCard(b, 'n-dois01', col, at));
    await groups.pushAll();
    expect(puts).toBe(3);
    expect((server.dados['kanban'] as { cards: { note: string }[] }).cards.map((c) => c.note).sort()).toEqual(['n-dela01', 'n-dois01', 'n-um0001']);
  });

  it('a mexida que não chegou a subir (a aba fechou) continua esperando, e sobe ao abrir de novo', async () => {
    let { groups, kanban } = setup();
    await groups.sync();
    const board = kanban.boardFor('Trabalho');
    kanban.update(board.id, (b, at) => placeCard(b, 'n-um0001', b.columns[0]!.id, at));
    TestBed.resetTestingModule();
    ({ groups, kanban } = setup('dono', true));
    TestBed.tick();
    await groups.pushAll();
    expect(puts).toBe(1);
    expect((server.dados['kanban'] as { cards: { note: string }[] }).cards.map((c) => c.note)).toEqual(['n-um0001']);
  });

  it('parar de compartilhar devolve o quadro como ficou no grupo (para ser o seu)', async () => {
    const { groups, kanban } = setup();
    await groups.sync();
    const board = kanban.boardFor('Trabalho');
    kanban.update(board.id, (b, at) => placeCard(b, 'n-um0001', b.columns[0]!.id, at));
    const kept = await groups.stop('gTrabalho001');
    expect(kept?.cards.map((c) => c.note)).toEqual(['n-um0001']);
    kanban.keep(kept!);
    expect(kanban.boardFor('Trabalho').cards.map((c) => c.note)).toEqual(['n-um0001']);
  });

  it('quem só lê não muda o quadro, e o Kanban sabe que ele é só de ler', async () => {
    const { groups, kanban } = setup('leitor');
    await groups.sync();
    const board = kanban.boardFor('Trabalho');
    expect(kanban.readOnly(board.id)).toBeTrue();
    kanban.update(board.id, (b, at) => placeCard(b, 'n-um0001', b.columns[0]!.id, at));
    expect(kanban.boardFor('Trabalho').cards).toEqual([]);
    await groups.pushAll();
    expect(puts).toBe(0);
  });

  it('renomear o grupo (o dono): o nome vai no documento, para todos', async () => {
    const { groups } = setup();
    await groups.sync();
    expect(groups.rename('gTrabalho001', 'Empresa')).toBeTrue();
    expect(groups.names().get('gTrabalho001')).toBe('Empresa');
    await groups.pushAll();
    expect(server.dados['nome']).toBe('Empresa');
  });

  it('as tags de grupo se juntam como conjunto: pôr uma tag não briga com a pasta mudada por outra pessoa (o conflito da Hiragana)', () => {
    const o = note('n-um0001', 'Trabalho', { tags: ['Kana'], folder: 'psimb0000001' });
    // a dona pôs uma tag; a outra pessoa tirou a pasta (ou mudou o texto)
    const dela = { ...o, tags: ['Kana', 'Estudo'] };
    const minha = { ...o, folder: 'ptermos00001', text: 'mudei' };
    const m = mergeNote(o, dela, minha, true);
    expect(m.other).toBeNull();
    expect([m.merged.tags, m.merged.folder, m.merged.text]).toEqual([['Kana', 'Estudo'], 'ptermos00001', 'mudei']);
  });

  it('cada uma põe uma tag diferente: as duas ficam; a que uma tirou sai, mesmo que a outra ponha outra', () => {
    const o = note('n-um0001', 'Trabalho', { tags: ['Kana', 'Velha'] });
    const m = mergeNote(o, { ...o, tags: ['Kana', 'Velha', 'Ana'] }, { ...o, tags: ['Kana', 'Bia'] }, true);
    expect(m.other).toBeNull();
    expect(m.merged.tags).toEqual(['Kana', 'Ana', 'Bia']);
    expect(mergeTagSets(['a'], ['a'], ['A'])).toEqual(['a']);
  });

  it('as tags de uma anotação de grupo são do grupo: vão no conteúdo e se juntam como um todo', () => {
    const base = note('n-um0001', 'Trabalho', { tags: ['urgente'] });
    expect(sharedContent(base, true)['tags']).toEqual(['urgente']);
    expect(sharedContent(base)['tags']).toBeUndefined();
    const mine = { ...base, tags: ['urgente', 'cliente'] };
    const m = mergeNote(base, base, mine, true);
    expect(m.merged.tags).toEqual(['urgente', 'cliente']);
    expect(m.other).toBeNull();
  });
});

describe('grupos compartilhados: as pastas do grupo (PLANO-CONSERTO-GRUPOS.md, rodada 2)', () => {
  let server: { rev: number; dados: Record<string, unknown>; papel: string };
  let puts: { dados?: Record<string, unknown> }[];
  const pasta = (id: string, name: string, parent: string | null = null, group = 'trabalho'): NoteFolder => ({ id, group, name, parent });

  function setup(papel: string, dados: Record<string, unknown>) {
    server = { rev: 1, dados, papel };
    puts = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: GROUPS_AUTO, useValue: false },
        {
          provide: SharedStore,
          // (as anotações 'n-…' destes testes são do grupo compartilhado, como as que a nuvem manda)
          useValue: { entries: signal(new Map()), groupNames: signal(new Map()), get: (id: string) => (id.startsWith('n-') ? { grupo: 'gTrabalho001' } : undefined), inGroupOf: () => [], placeInGroup: () => undefined, sync: async () => undefined, unshare: async () => false },
        },
        { provide: Cloud, useValue: { config: () => ({ api: 'x' }) } },
        {
          provide: CloudAccount,
          useValue: {
            signedIn: () => true,
            account: () => ({ id: 'u-eu', ...EU }),
            request: async (path: string, init?: { method?: string; body?: { base?: number; dados?: Record<string, unknown> } }) => {
              const detail = () => raw({ papel: server.papel, dono: server.papel === 'dono' ? EU : ANA, rev: server.rev, versao: server.rev, dados: server.dados });
              if (path === '/v1/eu/grupos') return { grupos: [{ id: 'gTrabalho001', versao: server.rev, papel: server.papel }] };
              if (path.startsWith('/v1/eu/grupos/detalhes')) return { grupos: [detail()] };
              if (init?.method === 'PUT') {
                puts.push({ dados: init.body!.dados });
                if (init.body!.base !== server.rev) throw new CloudError('Outra pessoa gravou antes.', 'conflito', 409, { grupo: detail() });
                server = { ...server, rev: server.rev + 1, dados: init.body!.dados! };
                return { grupo: detail() };
              }
              if (init?.method === 'DELETE') return { ok: true };
              return { ok: true };
            },
          },
        },
      ],
    });
    return { groups: TestBed.inject(SharedGroupsStore), folders: TestBed.inject(NoteFolders), settings: TestBed.inject(Settings) };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  const names = (folders: NoteFolders, parent: string | null = null) => folders.tree().kids('trabalho', parent).map((f) => f.name);

  it('quem está no grupo vê as pastas do dono (antes, nenhuma: as pastas eram de cada um)', async () => {
    const { groups, folders } = setup('editor', { nome: 'Trabalho', pastas: [{ id: 'pkana0000001', name: 'Kana', parent: null }] });
    await groups.sync();
    expect(names(folders)).toEqual(['Kana']);
    expect(folders.of({ category: 'Trabalho', folder: 'pkana0000001' })).toBe('pkana0000001');
  });

  it('criar e renomear uma pasta num grupo compartilhado vai para o documento dele, para todos (e não para as suas configurações)', async () => {
    const { groups, folders, settings } = setup('editor', { nome: 'Trabalho', pastas: [{ id: 'pkana0000001', name: 'Kana', parent: null }] });
    await groups.sync();
    const made = folders.create('Trabalho', null, 'Termos')!;
    folders.rename('pkana0000001', 'Kana e Kanji');
    expect(names(folders)).toEqual(['Kana e Kanji', 'Termos']);
    expect(settings.notesConfig().folders).toEqual([]);
    await groups.pushAll();
    expect((server.dados['pastas'] as { id: string; name: string }[]).map((f) => [f.id, f.name])).toEqual([
      ['pkana0000001', 'Kana e Kanji'],
      [made.id, 'Termos'],
    ]);
  });

  it('duas pessoas criando pastas ao mesmo tempo: as duas ficam (a junção pasta a pasta)', async () => {
    const { groups, folders } = setup('dono', { nome: 'Trabalho', pastas: [] });
    await groups.sync();
    folders.create('Trabalho', null, 'Minha');
    // a Ana criou outra enquanto isso (rev 2 na nuvem)
    server = { ...server, rev: 2, dados: { ...server.dados, pastas: [{ id: 'pdela0000001', name: 'Dela', parent: null }] } };
    await groups.pushAll();
    expect((server.dados['pastas'] as { name: string }[]).map((f) => f.name).sort()).toEqual(['Dela', 'Minha']);
  });

  it('quem só lê não muda as pastas do grupo', async () => {
    const { groups, folders } = setup('leitor', { nome: 'Trabalho', pastas: [{ id: 'pkana0000001', name: 'Kana', parent: null }] });
    await groups.sync();
    folders.rename('pkana0000001', 'Outra');
    await groups.pushAll();
    expect(puts.length).toBe(0);
    expect(names(folders)).toEqual(['Kana']);
  });

  it('num grupo de antes (o documento sem pastas), o membro não cria o documento das pastas sem as do dono', async () => {
    const { groups, folders, settings } = setup('editor', { nome: 'Trabalho' });
    await groups.sync();
    folders.create('Trabalho', null, 'Só minha');
    await groups.pushAll();
    expect(puts.length).toBe(0);
    expect(settings.notesConfig().folders.map((f) => f.name)).toEqual(['Só minha']);
  });

  it('o dono leva para o documento as pastas guardadas do grupo (o de antes desta build), e as anotações continuam nelas', async () => {
    const { groups, folders, settings } = setup('dono', { nome: 'Trabalho' });
    settings.setNotesConfig({ folders: [pasta('psimb0000001', 'Símbolos'), pasta('pcasa0000001', 'Contas', null, 'casa')] });
    await groups.sync();
    // antes de levar, as dele continuam valendo (nenhuma anotação sai da pasta)
    expect(names(folders)).toEqual(['Símbolos']);
    groups.seedFolders();
    await groups.pushAll();
    expect((server.dados['pastas'] as { id: string }[]).map((f) => f.id)).toEqual(['psimb0000001']);
    expect(names(folders)).toEqual(['Símbolos']);
    // a cópia do dono fica nas configurações, e a pasta de outro grupo também
    expect(settings.notesConfig().folders.map((f) => f.id).sort()).toEqual(['pcasa0000001', 'psimb0000001']);
  });

  it('aparelho novo do dono: sem as configurações ainda, o documento não nasce vazio; elas chegam e vão para ele', async () => {
    const { groups, folders, settings } = setup('dono', { nome: 'Trabalho' });
    await groups.sync();
    groups.seedFolders();
    await groups.pushAll();
    expect(puts.length).toBe(0);
    settings.setNotesConfig({ folders: [pasta('psimb0000001', 'Símbolos')] });
    groups.seedFolders();
    await groups.pushAll();
    expect((server.dados['pastas'] as { id: string }[]).map((f) => f.id)).toEqual(['psimb0000001']);
    expect(names(folders)).toEqual(['Símbolos']);
  });

  it('a cópia velha do dono não traz de volta uma pasta que saiu do documento', async () => {
    const { groups, folders, settings } = setup('dono', { nome: 'Trabalho', pastas: [{ id: 'pkana0000001', name: 'Kana', parent: null }] });
    settings.setNotesConfig({ folders: [pasta('pkana0000001', 'Kana'), pasta('pvelh0000001', 'Desfeita há muito')] });
    await groups.sync();
    groups.seedFolders();
    await groups.pushAll();
    expect(puts.length).toBe(0);
    expect(names(folders)).toEqual(['Kana']);
  });

  it('a pasta que o membro criou num grupo de antes (só ele via) vai para o documento quando o dono leva as dele', async () => {
    const { groups, folders, settings } = setup('editor', { nome: 'Trabalho' });
    await groups.sync();
    const minha = folders.create('Trabalho', null, 'Minha')!;
    TestBed.inject(ReviewStore).add(note('n-minha01', 'Trabalho', { folder: minha.id }));
    // o dono levou as pastas dele (rev 2)
    server = { ...server, rev: 2, dados: { nome: 'Trabalho', pastas: [{ id: 'pkana0000001', name: 'Kana', parent: null }] } };
    await groups.sync();
    groups.seedFolders();
    await groups.pushAll();
    expect((server.dados['pastas'] as { name: string }[]).map((f) => f.name)).toEqual(['Kana', 'Minha']);
    expect(settings.notesConfig().folders).toEqual([]);
    expect(names(folders)).toEqual(['Kana', 'Minha']);
  });

  it('a pasta de um grupo só da pessoa, de mesmo nome e sem anotação do grupo nela, não vai para o grupo dos outros', async () => {
    const { groups, settings } = setup('editor', { nome: 'Trabalho', pastas: [{ id: 'pkana0000001', name: 'Kana', parent: null }] });
    settings.setNotesConfig({ folders: [pasta('pcontas00001', 'Contas'), pasta('pusada000001', 'Usada')] });
    TestBed.inject(ReviewStore).add(note('n-usada01', 'Trabalho', { folder: 'pusada000001' }));
    await groups.sync();
    groups.seedFolders();
    await groups.pushAll();
    expect((server.dados['pastas'] as { id: string }[]).map((f) => f.id)).toEqual(['pkana0000001', 'pusada000001']);
    expect(settings.notesConfig().folders.map((f) => f.id)).toEqual(['pcontas00001']);
  });

  it('renomear o grupo leva as pastas dele junto (as do documento e a cópia do dono)', async () => {
    const { groups, folders, settings } = setup('dono', { nome: 'Trabalho', pastas: [{ id: 'pkana0000001', name: 'Kana', parent: null }] });
    settings.setNotesConfig({ folders: [pasta('pkana0000001', 'Kana')] });
    await groups.sync();
    groups.rename('gTrabalho001', 'Empresa');
    expect(folders.tree().kids('empresa', null).map((f) => f.name)).toEqual(['Kana']);
    expect(settings.notesConfig().folders.map((f) => f.group)).toEqual(['empresa']);
    expect(folders.tree().kids('trabalho', null)).toEqual([]);
  });

  it('compartilhar leva as pastas do grupo; parar de compartilhar as devolve às suas configurações, como ficaram', async () => {
    const { groups, folders, settings } = setup('dono', { nome: 'Trabalho', pastas: [{ id: 'pkana0000001', name: 'Kana do grupo', parent: null }] });
    settings.setNotesConfig({ folders: [pasta('pkana0000001', 'Kana')] });
    await groups.sync();
    expect(names(folders)).toEqual(['Kana do grupo']);
    await groups.stop('gTrabalho001');
    expect(settings.notesConfig().folders.map((f) => [f.id, f.name, f.group])).toEqual([['pkana0000001', 'Kana do grupo', 'trabalho']]);
    expect(names(folders)).toEqual(['Kana do grupo']);
  });

  it('a junção pasta a pasta: o que cada lado mudou fica; os dois mudaram a mesma, vale a daqui', () => {
    const o = [pasta('pa000000001', 'A'), pasta('pb000000001', 'B'), pasta('pc000000001', 'C')];
    const theirs = [pasta('pa000000001', 'A2'), pasta('pb000000001', 'B'), pasta('pc000000001', 'C lá'), pasta('pd000000001', 'D')];
    const mine = [pasta('pa000000001', 'A'), { ...pasta('pb000000001', 'B'), gone: '2026-11-15T00:00:00.000Z' }, pasta('pc000000001', 'C aqui'), pasta('pe000000001', 'E')];
    const out = mergeFolders(o, theirs, mine);
    expect(out.map((f) => [f.id, f.name, !!f.gone])).toEqual([
      ['pa000000001', 'A2', false],
      ['pb000000001', 'B', true],
      ['pc000000001', 'C aqui', false],
      ['pd000000001', 'D', false],
      ['pe000000001', 'E', false],
    ]);
  });
});
