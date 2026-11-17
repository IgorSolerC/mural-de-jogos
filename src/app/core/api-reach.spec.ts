import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiMirror } from './api-mirror';
import { ApiReach } from './api-reach';
import { applyNoteRequest, closedGroup, type ApplyContext } from './api-requests';
import { CloudAccount } from './cloud-account';
import { Cloud } from './cloud-config';
import { categoryKey } from './kanban';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { SharedGroup } from './shared-groups';
import { GROUPS_AUTO, SharedGroupsStore } from './shared-groups-store';
import { SharedEntry, SharedStore } from './shared-store';
import { SharedRole } from './shared-notes';

/**
 * A API das AIs nos grupos compartilhados (pedido do dono em 17/nov/2026, core/api-reach.ts): só nos grupos em que
 * a conta é dono ou gestor ela vê e mexe nas anotações; os grupos em que ela só edita ou lê ficam fechados, e as
 * compartilhadas soltas continuam de fora.
 */

const EU = { codigo: 'EEEE-0000', nome: 'Igor', foto: null };
const BRUNA = { codigo: 'BBBB-1111', nome: 'Bruna Lima', foto: null };

const note = (id: string, title: string, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: title },
    completedAt: '2026-11-01',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
    ...extra,
  })!,
  id,
});

const group = (id: string, nome: string, papel: SharedRole): SharedGroup => ({
  id,
  dono: papel === 'dono' ? EU : BRUNA,
  papel,
  rev: 1,
  versao: 1,
  dados: { nome },
  publico: false,
  notas: 1,
  membros: [],
  atualizadoEm: '',
});

describe('a API nos grupos compartilhados: quem ela alcança', () => {
  const entries = signal<ReadonlyMap<string, SharedEntry>>(new Map());

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: GROUPS_AUTO, useValue: false },
        { provide: SharedStore, useValue: { entries, groupNames: signal(new Map()), get: (id: string) => entries().get(id) } },
        { provide: Cloud, useValue: { config: () => ({ api: 'x' }) } },
        { provide: CloudAccount, useValue: { signedIn: () => true, account: () => ({ id: 'u-eu', ...EU }), request: async () => ({}) } },
      ],
    });
    const store = TestBed.inject(ReviewStore);
    const groups = TestBed.inject(SharedGroupsStore);
    const reach = TestBed.inject(ApiReach);
    groups.entries.set(
      new Map([
        ['gJaponesDono1', group('gJaponesDono1', 'Japonês', 'dono')],
        ['gReceitasGes1', group('gReceitasGes1', 'Receitas', 'gestor')],
        ['gTrabalhoEdi1', group('gTrabalhoEdi1', 'Trabalho', 'editor')],
        ['gViagemLeit01', group('gViagemLeit01', 'Viagem', 'leitor')],
      ]),
    );
    const placed: [string, string | null][] = [
      ['n-japones1', 'gJaponesDono1'],
      ['n-receita1', 'gReceitasGes1'],
      ['n-trabalh1', 'gTrabalhoEdi1'],
      ['n-viagem01', 'gViagemLeit01'],
      ['n-solta001', null],
    ];
    entries.set(new Map(placed.map(([id, grupo]) => [id, { id, papel: 'editor', grupo } as unknown as SharedEntry])));
    store.setShared(placed.map(([id]) => note(id, id)));
    store.add(note('n-minha001', 'Só minha', { category: 'Casa' }));
    return { store, groups, reach };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('as do grupo em que a conta é dono ou gestor entram; as do editor, do leitor e a solta, não', () => {
    const { reach } = setup();
    expect([...reach.managed()].sort()).toEqual(['n-japones1', 'n-receita1']);
    expect([...reach.hidden()].sort()).toEqual(['n-solta001', 'n-trabalh1', 'n-viagem01']);
    // a anotação só sua nunca foi compartilhada: nem aparece entre as escondidas
    expect(reach.hidden().has('n-minha001')).toBeFalse();
  });

  it('os grupos em que a conta só edita ou lê ficam fechados, pelo nome que têm aqui (sem caixa nem acento)', () => {
    const { reach } = setup();
    expect([...reach.closed()].sort()).toEqual([categoryKey('Trabalho'), categoryKey('Viagem')].sort());
    expect(reach.closes('trabalho')).toBeTrue();
    expect(reach.closes('VIAGEM')).toBeTrue();
    expect(reach.closes('japones')).toBeFalse();
    expect(reach.closes('Receitas')).toBeFalse();
    expect(reach.closes('Casa')).toBeFalse();
    expect(reach.closes(null)).toBeFalse();
  });

  it('o papel muda e o alcance segue: o gestor rebaixado a editor sai; o editor promovido entra', () => {
    const { groups, reach } = setup();
    groups.entries.update((m) => new Map([...m, ['gReceitasGes1', group('gReceitasGes1', 'Receitas', 'editor')], ['gTrabalhoEdi1', group('gTrabalhoEdi1', 'Trabalho', 'gestor')]]));
    expect([...reach.managed()].sort()).toEqual(['n-japones1', 'n-trabalh1']);
    expect(reach.closes('Receitas')).toBeTrue();
    expect(reach.closes('Trabalho')).toBeFalse();
  });

  it('o grupo que saiu (a conta deixou o grupo) leva as anotações dele junto', () => {
    const { groups, reach } = setup();
    groups.entries.update((m) => new Map([...m].filter(([id]) => id !== 'gJaponesDono1')));
    expect([...reach.managed()]).toEqual(['n-receita1']);
    expect(reach.hidden().has('n-japones1')).toBeTrue();
  });

  it('sem o serviço dos grupos (nada apresentado), nenhuma compartilhada é alcançada', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(ReviewStore);
    store.setShared([note('n-comp0001', 'Compartilhada')]);
    const reach = TestBed.inject(ApiReach);
    expect([...reach.hidden()]).toEqual(['n-comp0001']);
    expect(reach.closed().size).toBe(0);
  });
});

describe('a API nos grupos compartilhados: os pedidos das Anotações', () => {
  const NOW = '2026-11-17T15:00:00.000Z';
  let store: ReviewStore;
  let saved: Review[];
  let ctx: ApplyContext;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    saved = [];
    store.attachShared({ save: (r) => saved.push(r), owned: () => new Set() });
    store.setShared([note('n-japones1', 'ください', { category: 'Japonês', text: 'Por favor' }), note('n-trabalh1', 'Pauta', { category: 'Trabalho' })]);
    store.add(note('n-minha001', 'Compras', { category: 'Casa' }));
    // a conta é gestora do Japonês e só edita o Trabalho
    ctx = {
      now: NOW,
      today: '2026-11-17',
      stamps: new Map(),
      v1: (r) => TestBed.inject(ApiMirror).notaOf(r),
      hidden: new Set(['n-trabalh1']),
      closes: (g) => categoryKey(g) === categoryKey('Trabalho'),
    };
  });
  afterEach(() => localStorage.clear());

  const apply = (op: string, alvo: string, dados: unknown = {}) => applyNoteRequest(store, { op, alvo, dados }, ctx);

  it('a do grupo em que a conta é gestora muda pelo mesmo caminho da tela (o SharedStore)', () => {
    const out = apply('nota.acrescentar', 'n-japones1', { texto: 'Me dê' });
    expect(out.estado).toBe('aplicado');
    expect(saved.map((r) => [r.id, r.text])).toEqual([['n-japones1', 'Por favor\nMe dê']]);
    expect((out.resultado as { nota: { titulo: string } }).nota.titulo).toBe('ください');
  });

  it('a do grupo em que a conta só edita não existe para a API', () => {
    const out = apply('nota.acrescentar', 'n-trabalh1', { texto: 'Item' });
    expect(out.estado).toBe('falhou');
    expect(saved).toEqual([]);
  });

  it('sem dizer o alcance, nenhuma compartilhada (como antes)', () => {
    const { hidden: _h, ...rest } = ctx;
    ctx = rest;
    expect(apply('nota.acrescentar', 'n-japones1', { texto: 'Me dê' }).estado).toBe('falhou');
    expect(saved).toEqual([]);
  });

  it('criar uma nota num grupo fechado falha antes de criar qualquer coisa (nem a pasta)', () => {
    const out = apply('nota.criar', 'rnovaid0000000001', { titulo: 'Ata', grupo: 'trabalho', pasta: 'Reuniões' });
    expect(out.estado).toBe('falhou');
    expect((out.resultado as { erro: string }).erro).toBe(closedGroup('Trabalho'));
    expect(store.get('rnovaid0000000001')).toBeUndefined();
  });

  it('criar no grupo em que a conta é gestora entra (o grupo com a grafia do mural)', () => {
    const out = apply('nota.criar', 'rnovaid0000000002', { titulo: 'お願い', grupo: 'japones' });
    expect(out.estado).toBe('aplicado');
    expect(store.get('rnovaid0000000002')!.category).toBe('Japonês');
  });

  it('levar uma nota sua para um grupo fechado falha; para o grupo em que é gestora, vai', () => {
    const v = store.get('n-minha001')!.updatedAt;
    const out = apply('nota.editar', 'n-minha001', { versao: v, grupo: 'Trabalho' });
    expect(out.estado).toBe('falhou');
    expect((out.resultado as { erro: string }).erro).toBe(closedGroup('Trabalho'));
    expect(store.get('n-minha001')!.category).toBe('Casa');
    expect(apply('nota.editar', 'n-minha001', { versao: v, grupo: 'japonês' }).estado).toBe('aplicado');
    expect(store.get('n-minha001')!.category).toBe('Japonês');
  });

  it('a nota de um grupo compartilhado não se apaga por um pedido', () => {
    const out = apply('nota.apagar', 'n-japones1');
    expect(out.estado).toBe('falhou');
    expect(store.get('n-japones1')).toBeDefined();
    expect(saved).toEqual([]);
  });
});
