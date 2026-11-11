import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloudAccount } from './cloud-account';
import { VisitGroups } from './visit-groups';

/** Os grupos públicos na visita (PLANO-COMPARTILHAR.md, 4.6): vêm da nuvem, com as anotações, no grupo delas. */

const nota = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'anotacoes',
  game: { name: `Tarefa ${id}`, coverUrl: null, source: 'manual' },
  text: '',
  completedAt: '2026-11-11',
  createdAt: '2026-11-11T10:00:00.000Z',
  updatedAt: '2026-11-11T10:00:00.000Z',
  folder: 'pDeAlguem1',
  ...extra,
});

describe('grupos públicos na visita (core/visit-groups.ts)', () => {
  let asked: string[];
  let pages: Record<string, { status?: number; body?: unknown }>;

  function setup() {
    asked = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: CloudAccount,
          useValue: {
            requestRaw: async (path: string) => {
              asked.push(path);
              const p = pages[path] ?? { status: 404, body: {} };
              return new Response(p.status === 204 ? null : JSON.stringify(p.body), { status: p.status ?? 200 });
            },
          },
        },
      ],
    });
    return TestBed.inject(VisitGroups);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('traz cada grupo público com todas as páginas de anotações, no grupo delas, e o desenho e o quadro dele', async () => {
    pages = {
      '/v1/murais/AAAA-1111/grupos': { body: { grupos: [{ id: 'gTrabalho001', versao: 2, nome: 'Trabalho' }] } },
      '/v1/murais/AAAA-1111/grupos/gTrabalho001': {
        body: {
          grupo: { id: 'gTrabalho001', versao: '2.1.1.0', dados: { nome: 'Trabalho', aparencia: { icone: 'pasta', cor: 'azul' }, kanban: { category: 'x', at: '2026-11-11T10:00:00.000Z', columns: [], cards: [] } } },
          notas: [nota('n-um0001')],
          depois: 'n-um0001',
        },
      },
      '/v1/murais/AAAA-1111/grupos/gTrabalho001?depois=n-um0001': { body: { grupo: { id: 'gTrabalho001', versao: '2.1.1.0', dados: { nome: 'Trabalho' } }, notas: [nota('n-dois01'), { lixo: true }] } },
    };
    const v = setup();
    await v.load('AAAA-1111');
    const [g] = v.groups();
    expect(g!.nome).toBe('Trabalho');
    expect(g!.look).toEqual({ icon: 'pasta', color: 'azul' } as never);
    expect(g!.board?.category).toBe('trabalho');
    expect(v.notes().map((n) => [n.id, n.category, n.folder])).toEqual([
      ['n-um0001', 'Trabalho', undefined],
      ['n-dois01', 'Trabalho', undefined],
    ]);
  });

  it('a volta pede só o que mudou (204 com a versão que já tem) e fica com o que já estava', async () => {
    pages = {
      '/v1/murais/AAAA-1111/grupos': { body: { grupos: [{ id: 'gTrabalho001' }] } },
      '/v1/murais/AAAA-1111/grupos/gTrabalho001': { body: { grupo: { versao: '1.1.1.0', dados: { nome: 'Trabalho' } }, notas: [nota('n-um0001')] } },
      '/v1/murais/AAAA-1111/grupos/gTrabalho001?versao=1.1.1.0': { status: 204 },
    };
    const v = setup();
    await v.load('AAAA-1111');
    await v.load('AAAA-1111', true);
    expect(asked.at(-1)).toBe('/v1/murais/AAAA-1111/grupos/gTrabalho001?versao=1.1.1.0');
    expect(v.notes().map((n) => n.id)).toEqual(['n-um0001']);
  });

  it('sem código (um backup, ninguém aberto): nada', async () => {
    pages = {};
    const v = setup();
    await v.load(null);
    expect(v.groups()).toEqual([]);
    expect(asked).toEqual([]);
  });
});
