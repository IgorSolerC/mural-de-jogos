import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloudAccount } from './cloud-account';
import { Cloud } from './cloud-config';
import { DATA_KEYS } from './local-data';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { SharedGroup, groupNames, newGroupId, parseGroup } from './shared-groups';
import { GROUPS_AUTO, GROUPS_KEY, SharedGroupsStore } from './shared-groups-store';
import { SharedEntry, SharedStore } from './shared-store';
import { wipeBrowser } from './browser-reset';

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
    };
    const shared = {
      entries,
      groupNames: names,
      get: (id: string) => entries().get(id),
      share: jasmine.createSpy('share').and.resolveTo(undefined),
      moveToGroup: jasmine.createSpy('moveToGroup').and.resolveTo(undefined),
      inGroupOf: (g: string) => [...entries().values()].filter((e) => e.grupo === g),
      placeInGroup: jasmine.createSpy('placeInGroup'),
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
    expect(calls[0]).toEqual({ path: 'POST /v1/grupos', body: jasmine.objectContaining({ dados: { nome: 'Trabalho', aparencia: { icone: 'pasta', cor: 'azul' } }, membros: [{ codigo: ANA.codigo, papel: 'editor' }] }) });
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
    expect(groups.get(id)).toBeUndefined();
  });

  it('os grupos moram no banco do site (sai na limpeza de sair da conta), por conta', async () => {
    expect(DATA_KEYS as readonly string[]).toContain(GROUPS_KEY);
    const { groups } = setup();
    await groups.share('Trabalho', []);
    expect(localStorage.getItem(GROUPS_KEY)).toContain('u-eu');
    await wipeBrowser();
    expect(localStorage.getItem(GROUPS_KEY)).toBeNull();
  });
});
