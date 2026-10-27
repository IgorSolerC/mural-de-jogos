import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ContextoNotasV1, NotaV1 } from '../../../contrato/api-v1/notas';
import { ApiMirror, contextoV1, hashOf, lots, notaV1 } from './api-mirror';
import { CloudAccount, CloudError } from './cloud-account';
import { KanbanStore } from './kanban-store';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { EMPTY_SPENDING } from './spending';
import { SpendingStore } from './spending-store';

/**
 * O espelho da API das AIs pelo lado do site (core/api-mirror.ts): a anotação e o vocabulário no
 * formato v1, as impressões, os lotes, e o serviço que manda só o que mudou, só para quem pode, sem
 * nunca atrapalhar a sincronização.
 */

const note = (id: string, title: string, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: title },
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z',
    ...extra,
  })!,
  id,
});

describe('o espelho da API: a nota e o contexto em v1', () => {
  it('a nota: os campos da v1, as tarefas contadas e o cartão do Kanban', () => {
    const r = note('rabcd1', 'Plano de estudos', {
      text: 'Começo.\n- [x] ler o capítulo\n- [ ] fazer a lista',
      category: ' Estudos ',
      subject: 'Cálculo',
      tags: ['prova', 'Sexta'],
      doneAt: '2026-10-05T10:00:00.000Z',
      noteRank: 'fixada',
      game: { name: 'Plano de estudos', coverUrl: 'https://exemplo.com/capa.jpg' },
    });
    const v = notaV1(r, { coluna: 'Fazendo', card: { importance: 'importante', status: 'esperando' }, onWall: true }, new Set());
    expect(v).toEqual({
      id: 'rabcd1',
      titulo: 'Plano de estudos',
      texto: 'Começo.\n- [x] ler o capítulo\n- [ ] fazer a lista',
      grupo: 'Estudos',
      assunto: 'Cálculo',
      tags: ['prova', 'Sexta'],
      data: '2026-10-01',
      finalizada_em: '2026-10-05T10:00:00.000Z',
      fixada: true,
      visibilidade: 'publica',
      capa: 'https://exemplo.com/capa.jpg',
      tarefas: { feitas: 1, total: 2 },
      kanban: { coluna: 'Fazendo', importancia: 'importante', status: 'esperando', no_mural: true },
      criada_em: '2026-10-01T10:00:00.000Z',
      versao: '2026-10-02T10:00:00.000Z',
    });
    // a ordem dos campos é a da v1 (a impressão depende dela)
    expect(Object.keys(v)).toEqual(['id', 'titulo', 'texto', 'grupo', 'assunto', 'tags', 'data', 'finalizada_em', 'fixada', 'visibilidade', 'capa', 'tarefas', 'kanban', 'criada_em', 'versao']);
  });

  it('o "quem vê" é o de verdade: privada, ou só no Kanban, é privada', () => {
    expect(notaV1(note('r0001', 'A', { private: true }), null, new Set()).visibilidade).toBe('privada');
    expect(notaV1(note('r0002', 'B'), null, new Set(['r0002'])).visibilidade).toBe('privada');
    const plain = notaV1(note('r0003', 'C'), null, new Set());
    expect(plain.visibilidade).toBe('publica');
    expect(plain.grupo).toBeNull();
    expect(plain.assunto).toBeNull();
    expect(plain.kanban).toBeNull();
    expect(plain.fixada).toBeFalse();
    expect(plain.finalizada_em).toBeNull();
  });

  it('o contexto: os grupos da mais usada para a menos, os assuntos guardados e os usados, as tags por grupo, as sem grupo e as fixas', () => {
    const notes = [
      note('r0001', 'A', { category: 'Trabalho', subject: 'Reuniões', tags: ['urgente', 'cliente'] }),
      note('r0002', 'B', { category: 'trabalho', tags: ['Urgente'] }),
      note('r0003', 'C', { category: 'Estudos', subject: 'calculo' }),
      note('r0004', 'D', { tags: ['casa'] }),
    ];
    const ctx = contextoV1(notes, { trabalho: ['Contratos'], estudos: ['Cálculo'] }, ['urgente']);
    expect(ctx).toEqual({
      grupos: [
        { nome: 'Trabalho', notas: 2, assuntos: ['Contratos', 'Reuniões'], tags: [{ nome: 'urgente', notas: 2 }, { nome: 'cliente', notas: 1 }] },
        { nome: 'Estudos', notas: 1, assuntos: ['Cálculo'], tags: [] },
      ],
      sem_grupo: { notas: 1, tags: [{ nome: 'casa', notas: 1 }] },
      tags_fixas: ['urgente'],
    } satisfies ContextoNotasV1);
  });

  it('a impressão muda com o conteúdo e não muda à toa', async () => {
    const a = notaV1(note('r0001', 'A'), null, new Set());
    expect(await hashOf(a)).toMatch(/^[0-9a-f]{32}$/);
    expect(await hashOf(a)).toBe(await hashOf({ ...a }));
    expect(await hashOf({ ...a, titulo: 'B' })).not.toBe(await hashOf(a));
  });

  it('os lotes: até 50 itens e até o teto de letras', () => {
    expect(lots(Array.from({ length: 120 }, (_, i) => i), () => 1).map((l) => l.length)).toEqual([50, 50, 20]);
    expect(lots([1, 2, 3, 4], () => 300, 50, 700).map((l) => l.length)).toEqual([2, 2]);
    // um item maior que o teto vai sozinho
    expect(lots([1, 2], () => 1000, 50, 700).map((l) => l.length)).toEqual([1, 1]);
    expect(lots([], () => 1)).toEqual([]);
  });
});

describe('o espelho da API: o serviço (ApiMirror)', () => {
  let calls: { path: string; method: string; body: any }[];
  let remote: { areas: string[]; rev: number | null; hashes: Record<string, Record<string, string>> };
  let failPost: CloudError | null;
  let api: boolean;
  let notes: ReturnType<typeof signal<Review[]>>;
  let shared: ReturnType<typeof signal<ReadonlySet<string>>>;

  function setup(): ApiMirror {
    calls = [];
    failPost = null;
    api = true;
    remote = { areas: ['notas'], rev: null, hashes: { nota: {}, contexto: {} } };
    notes = signal([note('r0001', 'A', { category: 'Trabalho' }), note('r0002', 'B')]);
    shared = signal<ReadonlySet<string>>(new Set());
    const account = {
      account: () => ({ codigo: 'G11T-G00D', nome: 'Igor', ...(api ? { api: true } : {}) }),
      request: async (path: string, init: { method?: string; body?: any } = {}) => {
        calls.push({ path, method: init.method ?? 'GET', body: init.body });
        if (init.method === 'POST') {
          if (failPost) throw failPost;
          // a nuvem guarda o que chegou
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
        { provide: ReviewStore, useValue: { notes, sharedIds: shared } },
        { provide: KanbanStore, useValue: { boardOnly: signal(new Set()), cardOf: () => null, isOnWall: () => false } },
        { provide: Settings, useValue: { notesConfig: signal({ subjects: {} }), pinnedTags: signal([]) } },
        { provide: SpendingStore, useValue: { state: signal(EMPTY_SPENDING) } },
      ],
    });
    return TestBed.inject(ApiMirror);
  }

  const posts = () => calls.filter((c) => c.method === 'POST');

  it('sem a API liberada na conta, não pergunta nada à nuvem', async () => {
    const m = setup();
    api = false;
    await m.afterSync(3);
    expect(calls).toEqual([]);
  });

  it('sem chave que lê, só pergunta; na mesma rev, nem isso', async () => {
    const m = setup();
    remote.areas = [];
    await m.afterSync(3);
    await m.afterSync(3);
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('a primeira vez manda tudo (as notas e o contexto) na rev de agora, com o fuso', async () => {
    const m = setup();
    await m.afterSync(3);
    expect(posts().length).toBe(1);
    const body = posts()[0]!.body;
    expect(body.rev).toBe(3);
    expect(body.fuso).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(body.poe.map((i: { tipo: string; id: string }) => `${i.tipo}:${i.id}`)).toEqual(['nota:r0001', 'nota:r0002', 'contexto:notas']);
    expect((body.poe[0].dados as NotaV1).grupo).toBe('Trabalho');
    expect(body.tira).toEqual([]);
  });

  it('depois, só o que mudou; a nota que sumiu (ou virou compartilhada) sai; sem mudança, nada vai', async () => {
    const m = setup();
    await m.afterSync(3);
    notes.update((l) => [{ ...l[0]!, game: { ...l[0]!.game, name: 'A mudada' }, updatedAt: '2026-10-09T10:00:00.000Z' }, l[1]!]);
    await m.afterSync(4);
    expect(posts()[1]!.body.poe.map((i: { id: string }) => i.id)).toEqual(['r0001']);
    shared.set(new Set(['r0002']));
    await m.afterSync(5);
    expect(posts()[2]!.body.tira).toEqual([{ tipo: 'nota', id: 'r0002' }]);
    // o contexto mudou junto (uma nota a menos sem grupo)
    expect(posts()[2]!.body.poe.map((i: { id: string }) => i.id)).toEqual(['notas']);
    const before = posts().length;
    await m.afterSync(5);
    expect(posts().length).withContext('a mesma rev').toBe(before);
    // rev nova sem nada novo: um envio vazio, só para o espelho dizer que está em dia
    await m.afterSync(6);
    expect(posts().at(-1)!.body).toEqual(jasmine.objectContaining({ rev: 6, poe: [], tira: [] }));
  });

  it('muitas notas vão em lotes de 50', async () => {
    const m = setup();
    notes.set(Array.from({ length: 120 }, (_, i) => note(`r${String(i).padStart(4, '0')}`, `N${i}`)));
    await m.afterSync(3);
    expect(posts().map((p) => p.body.poe.length)).toEqual([50, 50, 21]);
  });

  it('a rev que mudou no meio (409) fica para a próxima, sem erro', async () => {
    const m = setup();
    failPost = new CloudError('O mural mudou.', 'espelho-atrasado', 409);
    await expectAsync(m.afterSync(3)).toBeResolved();
    failPost = null;
    await m.afterSync(3);
    expect(posts().length).withContext('a mesma rev tenta de novo, porque não chegou').toBe(2);
  });

  it('uma chave nova faz conferir de novo na rev de agora', async () => {
    const m = setup();
    remote.areas = [];
    await m.afterSync(3);
    remote.areas = ['notas'];
    await m.kick();
    expect(posts().length).toBe(1);
    expect(posts()[0]!.body.rev).toBe(3);
  });
});
