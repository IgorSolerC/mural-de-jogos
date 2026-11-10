import { indiceDasPastas, notaDoEspelho, notaParaOEspelho, pastasDoFiltro } from '../../../contrato/api-v1/notas';
import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { FreeBoard, sanitizeFreeBoard } from './free-board';
import { FreeBoardStore } from './free-board-store';
import { folderTree, withDissolvedFolder, withJoinedFolder } from './folders';
import { TestBed } from '@angular/core/testing';
import type { ContextoNotasV1, NotaV1 } from '../../../contrato/api-v1/notas';
import { ApiMirror, contextoV1, hashOf, lots, notaV1, storedFolderOf } from './api-mirror';
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
      folder: 'pfuncional01',
      tags: ['prova', 'Sexta'],
      doneAt: '2026-10-05T10:00:00.000Z',
      noteRank: 'fixada',
      game: { name: 'Plano de estudos', coverUrl: 'https://exemplo.com/capa.jpg' },
    });
    // a pasta e o caminho; o assunto de antes é a pasta de cima (PLANO-PASTAS.md, P13)
    const tree = folderTree([
      { id: 'pcalculo001', group: 'estudos', name: 'Cálculo', parent: null },
      { id: 'pfuncional01', group: 'estudos', name: 'Funcional', parent: 'pcalculo001' },
    ]);
    const v = notaV1(r, { coluna: 'Fazendo', card: { importance: 'importante', status: 'esperando' }, onWall: true }, new Set(), tree);
    expect(v).toEqual({
      id: 'rabcd1',
      titulo: 'Plano de estudos',
      texto: 'Começo.\n- [x] ler o capítulo\n- [ ] fazer a lista',
      grupo: 'Estudos',
      pasta: { id: 'pfuncional01', caminho: ['Cálculo', 'Funcional'] },
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
    expect(Object.keys(v)).toEqual(['id', 'titulo', 'texto', 'grupo', 'pasta', 'assunto', 'tags', 'data', 'finalizada_em', 'fixada', 'visibilidade', 'capa', 'tarefas', 'kanban', 'criada_em', 'versao']);
    // no espelho, a pasta vai só pelo id (o caminho mora no contexto), no lugar dela
    const stored = notaParaOEspelho(v);
    expect(Object.keys(stored)).toEqual(['id', 'titulo', 'texto', 'grupo', 'pasta_id', 'tags', 'data', 'finalizada_em', 'fixada', 'visibilidade', 'capa', 'tarefas', 'kanban', 'criada_em', 'versao']);
    expect(stored.pasta_id).toBe('pfuncional01');
    // e a API devolve o mesmo, montando o caminho pelo contexto
    expect(notaDoEspelho(stored, indiceDasPastas(contextoV1([r], tree, [])))).toEqual(v);
  });

  it('desfazer ou juntar uma pasta muda só o contexto: as notas dela vão ao espelho iguais, e a API as mostra na viva', async () => {
    const folders = [
      { id: 'pcalculo001', group: 'estudos', name: 'Cálculo', parent: null },
      { id: 'pfuncional01', group: 'estudos', name: 'Funcional', parent: 'pcalculo001' },
      { id: 'phistoria01', group: 'estudos', name: 'História', parent: null },
    ];
    const notes = [
      note('r0001', 'A', { category: 'Estudos', folder: 'pfuncional01' }),
      note('r0002', 'B', { category: 'Estudos', folder: 'pfuncional01' }),
      note('r0003', 'C', { category: 'Estudos', folder: 'phistoria01' }),
    ];
    const mirrored = (tree: ReturnType<typeof folderTree>) => notes.map((n) => notaParaOEspelho(notaV1(n, null, new Set(), tree), storedFolderOf(tree, n)));
    const hashes = async (tree: ReturnType<typeof folderTree>) => Promise.all(mirrored(tree).map((d) => hashOf(d)));
    const before = folderTree(folders);
    const was = await hashes(before);
    // desfeita: as notas sobem para Cálculo, e a impressão delas é a mesma
    const dissolved = folderTree(withDissolvedFolder(folders, 'pfuncional01', '2026-11-09T10:00:00.000Z'));
    expect(await hashes(dissolved)).toEqual(was);
    const ctx = contextoV1(notes, dissolved, []);
    expect(ctx.desfeitas).toEqual([{ id: 'pfuncional01', viva: 'pcalculo001' }]);
    expect(await hashOf(ctx)).not.toBe(await hashOf(contextoV1(notes, before, [])));
    const shown = notaDoEspelho(mirrored(dissolved)[0], indiceDasPastas(ctx));
    expect(shown.pasta).toEqual({ id: 'pcalculo001', caminho: ['Cálculo'] });
    expect(shown.assunto).toBe('Cálculo');
    // e o filtro pela de cima acha as que ainda guardam a desfeita
    expect([...pastasDoFiltro(indiceDasPastas(ctx), 'Cálculo')].sort()).toEqual(['pcalculo001', 'pfuncional01']);
    // juntada em História: o mesmo
    const joined = folderTree(withJoinedFolder(folders, 'pfuncional01', 'phistoria01', '2026-11-09T10:00:00.000Z'));
    expect(await hashes(joined)).toEqual(was);
    const jctx = contextoV1(notes, joined, []);
    expect(notaDoEspelho(mirrored(joined)[1], indiceDasPastas(jctx)).pasta).toEqual({ id: 'phistoria01', caminho: ['História'] });
    // uma de cima desfeita leva à raiz: a nota fica sem pasta, sem ser mandada de novo
    const top = folderTree(withDissolvedFolder(folders, 'phistoria01', '2026-11-09T10:00:00.000Z'));
    expect(await hashes(top)).toEqual(was);
    const tctx = contextoV1(notes, top, []);
    expect(tctx.desfeitas).toEqual([{ id: 'phistoria01', viva: null }]);
    expect(notaDoEspelho(mirrored(top)[2], indiceDasPastas(tctx))).toEqual(jasmine.objectContaining({ pasta: null, assunto: null }));
    // a pasta de outro grupo (a nota que mudou de grupo sem passar por withCategory) não vai: a nota está na raiz
    expect(storedFolderOf(before, { category: 'Trabalho', folder: 'pfuncional01' })).toBeNull();
    expect(storedFolderOf(before, { category: 'Estudos', folder: 'pdesconhec1' })).toBeNull();
  });

  it('o "quem vê" é o de verdade: privada, ou só no Kanban, é privada', () => {
    expect(notaV1(note('r0001', 'A', { private: true }), null, new Set()).visibilidade).toBe('privada');
    expect(notaV1(note('r0002', 'B'), null, new Set(['r0002'])).visibilidade).toBe('privada');
    const plain = notaV1(note('r0003', 'C'), null, new Set());
    expect(plain.visibilidade).toBe('publica');
    expect(plain.grupo).toBeNull();
    expect(plain.assunto).toBeNull();
    expect(plain.pasta).toBeNull();
    expect(plain.kanban).toBeNull();
    expect(plain.fixada).toBeFalse();
    expect(plain.finalizada_em).toBeNull();
  });

  it('o contexto: os grupos da mais usada para a menos, as pastas (todas, com a de cima e as notas), as tags por grupo, as sem grupo e as fixas', () => {
    const notes = [
      note('r0001', 'A', { category: 'Trabalho', folder: 'preunioes01', tags: ['urgente', 'cliente'] }),
      note('r0002', 'B', { category: 'trabalho', tags: ['Urgente'] }),
      note('r0003', 'C', { category: 'Estudos', folder: 'pcalculo001' }),
      note('r0004', 'D', { tags: ['casa'] }),
    ];
    const tree = folderTree([
      { id: 'preunioes01', group: 'trabalho', name: 'Reuniões', parent: null },
      { id: 'pcontratos1', group: 'trabalho', name: 'Contratos', parent: null },
      { id: 'pdentro0001', group: 'trabalho', name: 'Dentro', parent: 'pcontratos1' },
      { id: 'pcalculo001', group: 'estudos', name: 'Cálculo', parent: null },
    ]);
    const ctx = contextoV1(notes, tree, ['urgente']);
    expect(ctx).toEqual({
      grupos: [
        {
          nome: 'Trabalho',
          notas: 2,
          pastas: [
            { id: 'pcontratos1', nome: 'Contratos', pai: null, notas: 0 },
            { id: 'pdentro0001', nome: 'Dentro', pai: 'pcontratos1', notas: 0 },
            { id: 'preunioes01', nome: 'Reuniões', pai: null, notas: 1 },
          ],
          assuntos: ['Contratos', 'Reuniões'],
          tags: [{ nome: 'urgente', notas: 2 }, { nome: 'cliente', notas: 1 }],
        },
        { nome: 'Estudos', notas: 1, pastas: [{ id: 'pcalculo001', nome: 'Cálculo', pai: null, notas: 1 }], assuntos: ['Cálculo'], tags: [] },
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
  let boards: ReturnType<typeof signal<FreeBoard[]>>;

  function setup(): ApiMirror {
    calls = [];
    failPost = null;
    api = true;
    remote = { areas: ['notas'], rev: null, hashes: { nota: {}, contexto: {} } };
    notes = signal([note('r0001', 'A', { category: 'Trabalho' }), note('r0002', 'B')]);
    shared = signal<ReadonlySet<string>>(new Set());
    boards = signal<FreeBoard[]>([]);
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
        { provide: FreeBoardStore, useValue: { ready: Promise.resolve(), boards, version: computed(() => boards().length) } },
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

  it('um lote que a nuvem recusa (400) não prende os outros', async () => {
    const m = setup();
    notes.set(Array.from({ length: 120 }, (_, i) => note(`r${String(i).padStart(4, '0')}`, `N${i}`)));
    const account = TestBed.inject(CloudAccount) as unknown as { request: (p: string, i?: { method?: string; body?: any }) => Promise<unknown> };
    const real = account.request;
    let n = 0;
    account.request = async (path, init = {}) => {
      if (init.method === 'POST' && n++ === 0) {
        calls.push({ path, method: 'POST', body: init.body });
        throw new CloudError('A nota "r0007" não tem a forma da v1.', 'espelho-invalido', 400);
      }
      return real(path, init);
    };
    spyOn(console, 'warn');
    await m.afterSync(3);
    expect(posts().map((p) => p.body.poe.length)).withContext('o primeiro recusado, os outros dois vão').toEqual([50, 50, 21]);
    expect(Object.keys(remote.hashes['nota']!).length).toBe(70);
  });

  it('mudar um quadro confere só os quadros: as notas e o contexto não são refeitos nem mandados', async () => {
    const m = setup();
    await m.afterSync(3);
    calls = [];
    boards.set([sanitizeFreeBoard({ v: 1, id: 'abcdefghijklmnopqrstuv', nome: 'Mansão', grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', n: [], e: [] })!]);
    await m.boardsOnly();
    expect(posts().length).toBe(1);
    expect(posts()[0]!.body.poe.map((i: { tipo: string }) => i.tipo)).toEqual(['quadro-livre']);
    expect(posts()[0]!.body.tira).toEqual([]);
    // o quadro que não mudou não vai de novo
    calls = [];
    await m.boardsOnly();
    expect(posts()).toEqual([]);
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
