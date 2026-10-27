import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { QuadroV1 } from '../../../contrato/api-v1/kanban';
import { ApiMirror } from './api-mirror';
import { kanbanMirror, quadroV1 } from './api-mirror-kanban';
import { CloudAccount } from './cloud-account';
import { BoardCategory, KanbanBoard, freshBoard, placeCard, setDeps, setImportance, setStatus, setWall, updateColumn } from './kanban';
import { KanbanStore } from './kanban-store';
import { sortSentence } from './kanban-sort';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { EMPTY_SPENDING } from './spending';
import { SpendingStore } from './spending-store';

/**
 * O Kanban no espelho da API (core/api-mirror-kanban.ts, rodada 8): cada quadro em v1 como a tela
 * mostra (só as notas do grupo, a coluna que se arruma sozinha já arrumada, sem as compartilhadas), e o
 * serviço mandando a área `kanban` só quando a nuvem pede.
 */

const AT = '2026-10-20T10:00:00.000Z';
const note = (id: string, title: string, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: title },
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    category: 'Trabalho',
    ...extra,
  })!,
  id,
});

const byId = (list: Review[]) => new Map(list.map((n) => [n.id, n]));

/** O quadro do Trabalho: A fazer com duas, Fazendo com uma, Feito com uma finalizada. */
function board(): KanbanBoard {
  let b = freshBoard('Trabalho');
  const [afazer, fazendo, feito] = b.columns.map((c) => c.id);
  b = placeCard(b, 'r-pauta', afazer!, AT);
  b = placeCard(b, 'r-relat', afazer!, AT);
  b = placeCard(b, 'r-plan', fazendo!, AT);
  b = placeCard(b, 'r-feito', feito!, AT);
  b = placeCard(b, 'r-estudo', afazer!, AT);
  b = placeCard(b, 'r-sumiu', afazer!, AT);
  b = setImportance(b, 'r-relat', 'critico', AT);
  b = setStatus(b, 'r-plan', 'Com o Sérgio', AT);
  b = setDeps(b, 'r-relat', ['r-pauta', 'r-sumiu'], AT);
  b = setWall(b, 'r-plan', false, AT);
  return b;
}

const NOTES = [
  note('r-pauta', 'Pauta da reunião', { tags: ['urgente'] }),
  note('r-relat', 'Relatório'),
  note('r-plan', 'Planilha'),
  note('r-feito', 'Arquivo morto', { doneAt: '2026-10-03T10:00:00.000Z' }),
  // de outro grupo: não está no quadro de verdade
  note('r-estudo', 'Integrais', { category: 'Estudos' }),
];

describe('o espelho da API: o quadro em v1', () => {
  it('as colunas e os cartões como a tela mostra: só as notas do grupo, com o que a AI precisa ler', () => {
    const b = board();
    const q = quadroV1(b, 'Trabalho', false, byId(NOTES));
    const [afazer, fazendo, feito] = b.columns.map((c) => c.id);
    expect(q).toEqual({
      id: b.id,
      grupo: 'Trabalho',
      so_no_kanban: false,
      colunas: [
        { id: afazer!, nome: 'A fazer', finaliza: false, pula: false, ordem: null, cartoes: 2 },
        { id: fazendo!, nome: 'Fazendo', finaliza: false, pula: false, ordem: null, cartoes: 1 },
        { id: feito!, nome: 'Feito', finaliza: true, pula: false, ordem: null, cartoes: 1 },
      ],
      cartoes: [
        { nota: 'r-pauta', titulo: 'Pauta da reunião', coluna: afazer!, posicao: 0, finalizada: false, importancia: null, status: null, depende_de: [], no_mural: true, tags: ['urgente'] },
        // a dependência de uma nota que não existe mais fica de fora
        { nota: 'r-relat', titulo: 'Relatório', coluna: afazer!, posicao: 1, finalizada: false, importancia: 'critico', status: null, depende_de: ['r-pauta'], no_mural: true, tags: [] },
        { nota: 'r-plan', titulo: 'Planilha', coluna: fazendo!, posicao: 0, finalizada: false, importancia: null, status: 'Com o Sérgio', depende_de: [], no_mural: false, tags: [] },
        { nota: 'r-feito', titulo: 'Arquivo morto', coluna: feito!, posicao: 0, finalizada: true, importancia: null, status: null, depende_de: [], no_mural: true, tags: [] },
      ],
      versao: b.at,
    });
    // a ordem dos campos é a da v1 (a impressão depende dela)
    expect(Object.keys(q)).toEqual(['id', 'grupo', 'so_no_kanban', 'colunas', 'cartoes', 'versao']);
    expect(Object.keys(q.cartoes[0]!)).toEqual(['nota', 'titulo', 'coluna', 'posicao', 'finalizada', 'importancia', 'status', 'depende_de', 'no_mural', 'tags']);
  });

  it('a coluna que se arruma sozinha vai arrumada, com a regra em palavras; a que pula, marcada', () => {
    let b = board();
    const afazer = b.columns[0]!.id;
    b = updateColumn(b, afazer, { sort: [{ by: 'importancia' }], skip: true }, AT);
    const q = quadroV1(b, 'Trabalho', false, byId(NOTES));
    expect(q.colunas[0]).toEqual(jasmine.objectContaining({ pula: true, ordem: sortSentence([{ by: 'importancia' }]) }));
    expect(q.cartoes.filter((c) => c.coluna === afazer).map((c) => [c.nota, c.posicao])).toEqual([
      ['r-relat', 0],
      ['r-pauta', 1],
    ]);
  });

  it('só no Kanban: o grupo pede, e o cartão que escolheu o mural fica no mural', () => {
    let b = board();
    b = setWall(b, 'r-pauta', true, AT);
    const q = quadroV1(b, 'Trabalho', true, byId(NOTES));
    expect(q.so_no_kanban).toBeTrue();
    expect(q.cartoes.map((c) => [c.nota, c.no_mural])).toEqual([
      ['r-pauta', true],
      ['r-relat', false],
      ['r-plan', false],
      ['r-feito', false],
    ]);
  });

  it('a compartilhada (fora do mapa) não vai, nem como cartão nem como dependência', () => {
    const notes = byId(NOTES.filter((n) => n.id !== 'r-pauta'));
    const q = quadroV1(board(), 'Trabalho', false, notes);
    expect(q.cartoes.map((c) => c.nota)).toEqual(['r-relat', 'r-plan', 'r-feito']);
    expect(q.cartoes[0]!.depende_de).toEqual([]);
    expect(q.colunas[0]!.cartoes).toBe(1);
  });

  it('um quadro por grupo com nota, na ordem das abas; o grupo em que ninguém mexeu vai com as três colunas de sempre', () => {
    const stored = board();
    const categories: BoardCategory[] = [
      { key: 'trabalho', label: 'Trabalho', notes: 4 },
      { key: 'estudos', label: 'Estudos', notes: 1 },
    ];
    const qs = kanbanMirror({ categories, boardFor: (l) => (l === 'Trabalho' ? stored : freshBoard(l)), kanbanOnly: (l) => l === 'Estudos' }, byId(NOTES));
    expect(qs.map((q) => [q.grupo, q.so_no_kanban, q.colunas.map((c) => c.nome).join('/'), q.versao])).toEqual([
      ['Trabalho', false, 'A fazer/Fazendo/Feito', stored.at],
      ['Estudos', true, 'A fazer/Fazendo/Feito', '1970-01-01T00:00:00.000Z'],
    ]);
    expect(qs[1]!.id).toBe(freshBoard('Estudos').id);
  });
});

describe('o espelho da API: o serviço manda os quadros', () => {
  let calls: { path: string; method: string; body: any }[];
  let remote: { areas: string[]; rev: number | null; hashes: Record<string, Record<string, string>> };
  let notes: ReturnType<typeof signal<Review[]>>;
  let categories: ReturnType<typeof signal<BoardCategory[]>>;

  function setup(): ApiMirror {
    calls = [];
    remote = { areas: ['kanban'], rev: null, hashes: { quadro: {} } };
    notes = signal(NOTES);
    categories = signal<BoardCategory[]>([{ key: 'trabalho', label: 'Trabalho', notes: 4 }]);
    const stored = board();
    const account = {
      account: () => ({ codigo: 'G11T-G00D', nome: 'Igor', api: true }),
      request: async (path: string, init: { method?: string; body?: any } = {}) => {
        calls.push({ path, method: init.method ?? 'GET', body: init.body });
        if (init.method === 'POST') {
          for (const i of init.body.poe) remote.hashes[i.tipo] = { ...remote.hashes[i.tipo], [i.id]: i.hash };
          for (const i of init.body.tira) delete remote.hashes[i.tipo]![i.id];
          remote.rev = init.body.rev;
          return { ok: true };
        }
        return structuredClone(remote);
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: CloudAccount, useValue: account },
        { provide: ReviewStore, useValue: { notes, sharedIds: signal<ReadonlySet<string>>(new Set()) } },
        {
          provide: KanbanStore,
          useValue: {
            boardOnly: signal(new Set()),
            cardOf: () => null,
            isOnWall: () => false,
            categories,
            boardFor: (l: string) => (l === 'Trabalho' ? stored : freshBoard(l)),
            groupKanbanOnly: () => false,
          },
        },
        { provide: Settings, useValue: { notesConfig: signal({ subjects: {} }), pinnedTags: signal([]) } },
        { provide: SpendingStore, useValue: { state: signal(EMPTY_SPENDING) } },
      ],
    });
    return TestBed.inject(ApiMirror);
  }

  const posts = () => calls.filter((c) => c.method === 'POST');

  it('só com a área kanban pedida: o quadro de cada grupo vai, e o do grupo que ficou sem nota sai', async () => {
    const m = setup();
    await m.afterSync(3);
    const body = posts()[0]!.body;
    expect(body.poe.map((i: { tipo: string; id: string }) => `${i.tipo}:${i.id}`)).toEqual([`quadro:${board().id}`]);
    expect((body.poe[0].dados as QuadroV1).cartoes.length).toBe(4);
    categories.set([
      { key: 'trabalho', label: 'Trabalho', notes: 4 },
      { key: 'estudos', label: 'Estudos', notes: 1 },
    ]);
    await m.afterSync(4);
    expect(posts()[1]!.body.poe.map((i: { id: string }) => i.id)).toEqual([freshBoard('Estudos').id]);
    categories.set([{ key: 'estudos', label: 'Estudos', notes: 1 }]);
    await m.afterSync(5);
    expect(posts()[2]!.body.tira).toEqual([{ tipo: 'quadro', id: board().id }]);
  });

  it('sem a área kanban, nenhum quadro vai', async () => {
    const m = setup();
    remote.areas = ['notas'];
    await m.afterSync(3);
    expect(posts()[0]!.body.poe.some((i: { tipo: string }) => i.tipo === 'quadro')).toBeFalse();
  });
});
