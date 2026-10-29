import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiMirror } from './api-mirror';
import {
  APPLIED_KEY,
  ApiRequests,
  IDLE_MS,
  SiteRequest,
  appliedWords,
  applyNoteRequest,
  fieldChanges,
  fits,
  requestWords,
  textDiff,
  undoable,
  waitingWords,
  type ApplyContext,
} from './api-requests';
import type { NotaV1 } from '../../../contrato/api-v1/notas';
import { CloudAccount, CloudError } from './cloud-account';
import { LocalData } from './local-data';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { SpendingStore } from './spending-store';
import { boardIdFor } from './kanban';
import { KanbanStore } from './kanban-store';

/**
 * Os pedidos da API das AIs pelo lado do site (core/api-requests.ts): cada operação aplicada pelas
 * lojas, como a tela faria; e o serviço que pega, guarda o que aplicou e só conclui depois de
 * sincronizar, sem aplicar duas vezes.
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

const NOW = '2026-10-27T15:00:00.000Z';

describe('os pedidos da API: aplicar nas Anotações', () => {
  let store: ReviewStore;
  let ctx: ApplyContext;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    store.add(note('r0001', 'Reunião', { category: 'Trabalho', subject: 'Time', tags: ['Urgente'], text: 'Pauta\n- [ ] Ligar\n- [ ] Mandar ata' }));
    store.add(note('r0002', 'Compras', { text: 'Ver [[Reunião]]' }));
    ctx = { now: NOW, today: '2026-10-27', stamps: new Map(), v1: (r) => TestBed.inject(ApiMirror).notaOf(r) };
  });
  afterEach(() => localStorage.clear());

  const apply = (op: string, alvo: string, dados: unknown = {}) => applyNoteRequest(store, { op, alvo, dados }, ctx);

  it('criar: nasce privada, com o id da API, a data de hoje e os nomes como o mural já escreve', () => {
    const out = apply('nota.criar', 'rnovaid0000000000', { titulo: 'Ideia', texto: 'Algo', grupo: 'trabalho', assunto: 'time', tags: ['urgente', 'Nova'] });
    expect(out.estado).toBe('aplicado');
    const n = store.get('rnovaid0000000000')!;
    expect(n.kind).toBe('anotacoes');
    expect(n.private).toBeTrue();
    expect(n.completedAt).toBe('2026-10-27');
    expect(n.category).toBe('Trabalho');
    expect(n.subject).toBe('Time');
    expect(n.tags).toEqual(['Urgente', 'Nova']);
    expect(n.stock).withContext('a cartolina sorteada pela loja').toBeDefined();
    expect((out.resultado as { nota: { id: string } }).nota.id).toBe('rnovaid0000000000');
    expect(out.antes).toBeNull();
    expect(out.carimbo).toBe(NOW);
  });

  it('criar de novo (a aba fechou sem concluir) não faz outra nota', () => {
    apply('nota.criar', 'rnovaid0000000000', { titulo: 'Ideia' });
    const again = apply('nota.criar', 'rnovaid0000000000', { titulo: 'Ideia' });
    expect(again.estado).toBe('aplicado');
    expect(store.notes().filter((n) => n.id === 'rnovaid0000000000').length).toBe(1);
  });

  it('criar pública só com a visibilidade dita (a chave com publicar); data null fica sem data', () => {
    apply('nota.criar', 'rpub0000000000000', { titulo: 'Aberta', visibilidade: 'publica', data: null, fixada: true });
    const n = store.get('rpub0000000000000')!;
    expect(n.private).toBeUndefined();
    expect(n.completedAt).toBeNull();
    expect(n.noteRank).toBe('fixada');
  });

  it('editar: com a versão lida, muda; o título novo leva os [[links]] junto; a de antes vai no antes', () => {
    const out = apply('nota.editar', 'r0001', { versao: '2026-10-02T10:00:00.000Z', titulo: 'Reunião geral', grupo: null, tags: [] });
    expect(out.estado).toBe('aplicado');
    const n = store.get('r0001')!;
    expect(n.game.name).toBe('Reunião geral');
    expect(n.category).toBeUndefined();
    expect(n.tags).toBeUndefined();
    expect(n.updatedAt).toBe(NOW);
    expect(store.get('r0002')!.text).toBe('Ver [[Reunião geral]]');
    expect((out.antes as Review).game.name).toBe('Reunião');
    expect((out.antes as Record<string, unknown>)['scores']).withContext('guardada como no armazenamento').toBeUndefined();
  });

  it('editar com a versão velha (a pessoa mexeu depois) é conflito e não muda nada', () => {
    const out = apply('nota.editar', 'r0001', { versao: '2026-09-01T10:00:00.000Z', texto: 'outro' });
    expect(out.estado).toBe('conflito');
    expect(store.get('r0001')!.text).toContain('Pauta');
    expect((out.resultado as { nota: { texto: string } }).nota.texto).toContain('Pauta');
  });

  it('editar depois de um pedido aplicado aqui (com a versão de antes dele) não é conflito', () => {
    const first = apply('nota.acrescentar', 'r0001', { texto: 'Fim' });
    ctx = { ...ctx, now: '2026-10-27T15:00:01.000Z', stamps: new Map([[`r0001@${first.carimbo}`, first.desde ?? null]]) };
    const out = apply('nota.editar', 'r0001', { versao: '2026-10-02T10:00:00.000Z', assunto: 'Outro' });
    expect(out.estado).toBe('aplicado');
    expect(store.get('r0001')!.subject).toBe('Outro');
  });

  it('com uma mudança sua entre a leitura da AI e o pedido dela aplicado aqui, a versão velha é conflito', () => {
    // a AI leu a de 02/10; você mexeu depois; um pedido dela entrou por cima da sua
    store.update({ ...store.get('r0001')!, text: 'Pauta sua', updatedAt: '2026-10-20T10:00:00.000Z' });
    const first = apply('nota.acrescentar', 'r0001', { texto: 'Fim' });
    expect(first.desde).toBe('2026-10-20T10:00:00.000Z');
    ctx = { ...ctx, now: '2026-10-27T15:00:01.000Z', stamps: new Map([[`r0001@${first.carimbo}`, first.desde ?? null]]) };
    const stale = apply('nota.editar', 'r0001', { versao: '2026-10-02T10:00:00.000Z', texto: 'por cima' });
    expect(stale.estado).withContext('a sua mudança venceu').toBe('conflito');
    expect(store.get('r0001')!.text).toBe('Pauta sua\nFim');
    // com a versão que já tinha a sua mudança, a corrente é só de pedidos daqui: entra
    expect(apply('nota.editar', 'r0001', { versao: '2026-10-20T10:00:00.000Z', assunto: 'Outro' }).estado).toBe('aplicado');
  });

  it('o que vai à nuvem cabe no teto: sem o texto grande no resultado, e sem o antes grande (sem Desfazer)', () => {
    const big = 'x'.repeat(70_000);
    const item = {
      id: 'pd_a', op: 'coluna.apagar', alvo: 'c1', chave: 'Claude', chaveId: 'k1', estado: 'aplicado' as const,
      resultado: { coluna: null }, antes: { quadro: 'q', column: { id: 'c1' }, index: 0, cards: [{ note: big }] },
    };
    const out = fits(item);
    expect(out.antes).toBeNull();
    expect(undoable(out)).toBeFalse();
    const nota = { id: 'r1', texto: big } as unknown as NotaV1;
    const trimmed = fits({ ...item, op: 'nota.editar', resultado: { nota }, antes: { text: 'pequeno' } });
    expect((trimmed.resultado as { nota: NotaV1 }).nota.texto).toBe('');
    expect(trimmed.antes).toEqual({ text: 'pequeno' });
    expect(fits({ ...item, antes: { small: true } })).withContext('o que cabe vai como está').toEqual({ ...item, antes: { small: true } });
  });

  it('acrescentar no fim e no começo; passar de 20 mil letras falha', () => {
    apply('nota.acrescentar', 'r0002', { texto: 'Depois' });
    apply('nota.acrescentar', 'r0002', { texto: 'Antes', onde: 'inicio' });
    expect(store.get('r0002')!.text).toBe('Antes\nVer [[Reunião]]\nDepois');
    const big = apply('nota.acrescentar', 'r0002', { texto: 'x'.repeat(19_990) });
    expect(big.estado).toBe('falhou');
  });

  it('tarefas: marca pelo texto (sem acento nem caixa), acrescenta; a que não existe falha', () => {
    const out = apply('nota.tarefas', 'r0001', { marcar: ['ligar'], novas: ['Revisar'] });
    expect(out.estado).toBe('aplicado');
    expect(store.get('r0001')!.text).toBe('Pauta\n- [x] Ligar\n- [ ] Mandar ata\n- [ ] Revisar');
    const bad = apply('nota.tarefas', 'r0001', { marcar: ['Voar'] });
    expect(bad.estado).toBe('falhou');
    expect((bad.resultado as { erro: string }).erro).toContain('Voar');
  });

  it('finalizar, reabrir, fixar e desafixar; o que já está assim não muda nada', () => {
    expect(apply('nota.finalizar', 'r0001').estado).toBe('aplicado');
    expect(store.get('r0001')!.doneAt).toBe(NOW);
    const again = apply('nota.finalizar', 'r0001');
    expect(again.antes).withContext('nada mudou').toBeNull();
    apply('nota.reabrir', 'r0001');
    expect(store.get('r0001')!.doneAt).toBeUndefined();
    apply('nota.fixar', 'r0002');
    expect(store.get('r0002')!.noteRank).toBe('fixada');
    apply('nota.desafixar', 'r0002');
    expect(store.get('r0002')!.noteRank).toBeUndefined();
  });

  it('apagar: sai do mural e fica em Versões guardadas (motivo api)', () => {
    const out = apply('nota.apagar', 'r0002');
    expect(out.estado).toBe('aplicado');
    expect(store.get('r0002')).toBeUndefined();
    expect(store.versions().map((v) => [v.ficha.id, v.motivo])).toEqual([['r0002', 'api']]);
    expect((out.antes as Review).id).toBe('r0002');
  });

  it('a nota que não existe (ou é compartilhada) falha; dados fora da forma também', () => {
    expect(apply('nota.fixar', 'rnada').estado).toBe('falhou');
    expect(apply('nota.editar', 'r0001', { titulo: 'sem versão' }).estado).toBe('falhou');
  });
});

describe('os pedidos da API: o serviço (ApiRequests)', () => {
  let calls: { path: string; method: string; body: any }[];
  let open: SiteRequest[];
  let busy: Set<string>;
  let concluded: any[];
  let failConclude: boolean;
  let conta: string;

  const req = (id: string, op: string, alvo: string, dados: unknown = {}, estado = 'pendente'): SiteRequest =>
    ({ id, op, alvo, dados, estado, criado_em: NOW, expira_em: NOW, resolvido_em: null, chave: { id: 'k1', nome: 'Claude' } }) as SiteRequest;

  function setup(): { s: ApiRequests; store: ReviewStore } {
    localStorage.clear();
    calls = [];
    busy = new Set();
    concluded = [];
    failConclude = false;
    conta = 'conta-igor';
    open = [];
    const account = {
      account: () => ({ id: conta, codigo: 'G11T-G00D', nome: 'Igor', api: true }),
      request: async (path: string, init: { method?: string; body?: any } = {}) => {
        calls.push({ path, method: init.method ?? 'GET', body: init.body });
        if (path === '/v1/eu/pedidos') return { itens: structuredClone(open) };
        const pegar = /^\/v1\/eu\/pedidos\/(.+)\/pegar$/.exec(path);
        if (pegar) {
          if (busy.has(pegar[1]!)) throw new CloudError('Outro aparelho.', 'pedido-ocupado', 409);
          return { pedido: open.find((r) => r.id === pegar[1]) };
        }
        if (path === '/v1/eu/pedidos/concluir') {
          if (failConclude) throw new CloudError('Sem rede.', 'sem-rede', 0);
          concluded.push(...init.body.itens);
          open = open.filter((r) => !init.body.itens.some((i: { id: string }) => i.id === r.id));
          return { itens: init.body.itens.map((i: { id: string }) => ({ id: i.id, ok: true })) };
        }
        throw new Error(path);
      },
    };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: CloudAccount, useValue: account }] });
    const store = TestBed.inject(ReviewStore);
    store.add(note('r0001', 'Reunião', { text: 'Pauta' }));
    return { s: TestBed.inject(ApiRequests), store };
  }
  afterEach(() => localStorage.clear());

  const heads = (pendentes: number, aprovar = 0) => new Headers({ 'Mural-Pedidos': String(pendentes), 'Mural-Pedidos-Aprovar': String(aprovar) });

  it('sem o cabeçalho dizer que há pedidos, nem pergunta à nuvem', async () => {
    const { s } = setup();
    s.noteHeads(new Headers());
    expect(await s.applyOpen('aparelho1')).toBeFalse();
    expect(calls).toEqual([]);
  });

  it('pega, aplica na ordem, guarda e só conclui quando a sincronização manda', async () => {
    const { s, store } = setup();
    open = [req('pd_a', 'nota.acrescentar', 'r0001', { texto: 'Um' }), req('pd_b', 'nota.acrescentar', 'r0001', { texto: 'Dois' }), req('pd_c', 'nota.apagar', 'r0001', {}, 'aguardando-aprovacao')];
    s.noteHeads(heads(2, 1));
    expect(await s.applyOpen('aparelho1')).toBeTrue();
    expect(store.get('r0001')!.text).toBe('Pauta\nUm\nDois');
    expect(calls.filter((c) => c.path.endsWith('/pegar')).map((c) => [c.path, c.body.aparelho])).toEqual([
      ['/v1/eu/pedidos/pd_a/pegar', 'aparelho1'],
      ['/v1/eu/pedidos/pd_b/pegar', 'aparelho1'],
    ]);
    expect(s.open().map((r) => r.id)).withContext('o que espera aprovação fica para a folha').toContain('pd_c');
    expect(concluded).withContext('nada concluído antes de subir').toEqual([]);
    expect(JSON.parse(TestBed.inject(LocalData).getItem(APPLIED_KEY)!).itens.length).toBe(2);
    await s.conclude();
    expect(concluded.map((i) => [i.id, i.estado])).toEqual([
      ['pd_a', 'aplicado'],
      ['pd_b', 'aplicado'],
    ]);
    expect(concluded[0].antes.text).toBe('Pauta');
    expect(s.lastApplied()!.itens.length).toBe(2);
    expect(JSON.parse(TestBed.inject(LocalData).getItem(APPLIED_KEY)!).itens).toEqual([]);
  });

  it('aplicado e não concluído (sem rede, ou a aba fechou) não é aplicado de novo', async () => {
    const { s, store } = setup();
    open = [req('pd_a', 'nota.acrescentar', 'r0001', { texto: 'Um' })];
    s.noteHeads(heads(1));
    await s.applyOpen('aparelho1');
    failConclude = true;
    await s.conclude();
    // o pedido voltou a ficar livre (o prazo de 2 minutos passou): a próxima rodada não acrescenta outra vez
    s.noteHeads(heads(1));
    expect(await s.applyOpen('aparelho1')).toBeFalse();
    expect(store.get('r0001')!.text).toBe('Pauta\nUm');
    failConclude = false;
    await s.conclude();
    expect(concluded.map((i) => i.id)).toEqual(['pd_a']);
  });

  it('os pedidos dos Gastos também: o lançamento entra no livro e o resultado diz como ficou', async () => {
    const { s } = setup();
    open = [req('pd_g', 'gasto.lancar', 'rg0001', { titulo: 'Padaria', centavos: 1850, envelope: 'comida' })];
    s.noteHeads(heads(1));
    expect(await s.applyOpen('aparelho1')).toBeTrue();
    const book = TestBed.inject(SpendingStore);
    expect(book.get('rg0001')).toEqual(jasmine.objectContaining({ title: 'Padaria', amount: 1850, category: 'comida' }));
    await s.conclude();
    expect(concluded.map((i) => [i.id, i.estado, i.resultado.lancamento.titulo])).toEqual([['pd_g', 'aplicado', 'Padaria']]);
  });

  it('os pedidos do Kanban também: a coluna nova, o cartão que vai para ela e a nota que já nasce numa coluna', async () => {
    const { s, store } = setup();
    store.add(note('r0002', 'Relatório', { category: 'Trabalho' }));
    const quadro = boardIdFor('Trabalho');
    open = [
      req('pd_k1', 'coluna.criar', 'rcolrev', { quadro, nome: 'Revisão' }),
      req('pd_k2', 'cartao.mover', 'r0002', { quadro, coluna: 'rcolrev' }),
      req('pd_k3', 'nota.criar', 'r0003', { titulo: 'Reunião', grupo: 'Trabalho', kanban: { coluna: `${quadro}-fazendo`, importancia: 'critico' } }),
    ];
    s.noteHeads(heads(3));
    expect(await s.applyOpen('aparelho1')).toBeTrue();
    const b = TestBed.inject(KanbanStore).boardFor('Trabalho');
    expect(b.columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Feito', 'Revisão']);
    expect(b.cards.map((c) => [c.note, c.column, c.importance])).toEqual([
      ['r0002', 'rcolrev', null],
      ['r0003', `${quadro}-fazendo`, 'critico'],
    ]);
    await s.conclude();
    expect(concluded.map((i) => [i.id, i.estado])).toEqual([
      ['pd_k1', 'aplicado'],
      ['pd_k2', 'aplicado'],
      ['pd_k3', 'aplicado'],
    ]);
    expect(concluded[1].resultado.cartao).toEqual(jasmine.objectContaining({ nota: 'r0002', coluna: 'rcolrev', titulo: 'Relatório' }));
    expect(concluded[2].resultado.nota.kanban).toEqual(jasmine.objectContaining({ coluna: 'Fazendo', importancia: 'critico' }));
  });

  it('o guardado de outra conta não vale aqui', async () => {
    const { s } = setup();
    open = [req('pd_a', 'nota.fixar', 'r0001')];
    s.noteHeads(heads(1));
    await s.applyOpen('aparelho1');
    conta = 'conta-outra';
    await s.conclude();
    expect(concluded).toEqual([]);
  });

  it('o pedido que outro aparelho pegou fica com ele', async () => {
    const { s, store } = setup();
    open = [req('pd_a', 'nota.fixar', 'r0001')];
    busy.add('pd_a');
    s.noteHeads(heads(1));
    expect(await s.applyOpen('aparelho1')).toBeFalse();
    expect(store.get('r0001')!.noteRank).toBeUndefined();
  });

  it('o pedido que outro aparelho pegou segura os de depois (a ordem de chegada vale)', async () => {
    const { s, store } = setup();
    store.add(note('r0002', 'Lista', { text: 'Itens' }));
    open = [req('pd_a', 'nota.tarefas', 'r0002', { novas: ['Pão'] }), req('pd_b', 'nota.tarefas', 'r0002', { marcar: ['Pão'] })];
    busy.add('pd_a');
    s.noteHeads(heads(2));
    expect(await s.applyOpen('aparelho1')).toBeFalse();
    expect(calls.filter((c) => c.path.endsWith('/pegar')).map((c) => c.path)).toEqual(['/v1/eu/pedidos/pd_a/pegar']);
    expect(store.get('r0002')!.text).toBe('Itens');
    // o outro aparelho largou (ou o prazo passou): os dois entram, na ordem
    busy.clear();
    s.noteHeads(heads(2));
    expect(await s.applyOpen('aparelho1')).toBeTrue();
    expect(store.get('r0002')!.text).toBe('Itens\n- [x] Pão');
  });

  it('o relógio: confere com a aba à mostra; escondida, para depois de 2 horas sem nada novo', async () => {
    const { s } = setup();
    const t = Date.now();
    expect(s.watching(true, t)).toBeTrue();
    expect(s.watching(false, t + IDLE_MS - 1)).toBeTrue();
    expect(s.watching(false, t + IDLE_MS + 1)).toBeFalse();
    open = [req('pd_a', 'nota.fixar', 'r0001')];
    expect(await s.peek()).toBeTrue();
    expect(s.counts()).toEqual({ pendentes: 1, aprovar: 0 });
  });
});

describe('os pedidos da API: em palavras e o que muda', () => {
  it('a frase de cada pedido, esperando e no histórico', () => {
    expect(requestWords('nota.criar', { titulo: 'Ideia' }, 'Ideia')).toBe('Criar a nota “Ideia”');
    expect(requestWords('nota.editar', { versao: 'x', titulo: 'B', texto: 't' }, 'A')).toBe('Mudar o título e o texto de “A”');
    expect(requestWords('nota.editar', { versao: 'x', grupo: null }, 'A', true)).toBe('mudou o grupo de “A”');
    expect(requestWords('nota.tarefas', { marcar: ['a', 'b'], novas: ['c'] }, 'A')).toBe('Marcar 2 tarefas e acrescentar 1 tarefa em “A”');
    expect(requestWords('nota.acrescentar', { texto: 'x', onde: 'inicio' }, 'A', true)).toBe('acrescentou um trecho no começo de “A”');
    expect(requestWords('nota.apagar', {}, 'A')).toBe('Apagar “A”');
  });

  it('o que espera e o que entrou, numa frase', () => {
    const w = (op: string, nome = 'Claude') => ({ estado: 'aguardando-aprovacao' as const, op, chave: { id: nome, nome } });
    expect(waitingWords([w('nota.editar'), w('nota.apagar')])).toBe('Claude quer mudar 2 anotações');
    expect(waitingWords([w('nota.criar')])).toBe('Claude quer criar 1 anotação');
    expect(waitingWords([w('nota.editar'), w('nota.editar', 'Script')])).toBe('2 pedidos esperam você aprovar');
    expect(waitingWords([])).toBeNull();
    expect(waitingWords([], 3)).withContext('só a contagem do cabeçalho').toBe('3 pedidos esperam você aprovar');
    expect(appliedWords([{ estado: 'aplicado', chave: 'Claude' }, { estado: 'aplicado', chave: 'Claude' }, { estado: 'aplicado', chave: 'Claude' }])).toBe(
      '3 pedidos de Claude entraram',
    );
    expect(appliedWords([{ estado: 'aplicado', chave: 'Claude' }, { estado: 'falhou', chave: 'Claude' }])).toBe('1 pedido de Claude entrou; 1 não');
    expect(appliedWords([{ estado: 'conflito', chave: 'Claude' }])).toBe('1 pedido de Claude não entrou');
  });

  it('a diferença do texto: o que sai, o que entra, e o igual de longe vira um aviso', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n');
    const after = ['a', 'b', 'c', 'd', 'E', 'f', 'g'].join('\n');
    expect(textDiff(before, after)).toEqual([
      { kind: 'gap', text: '3 linhas iguais' },
      { kind: 'same', text: 'd' },
      { kind: 'del', text: 'e' },
      { kind: 'add', text: 'E' },
      { kind: 'same', text: 'f' },
      { kind: 'add', text: 'g' },
    ]);
    expect(textDiff('', 'x\ny')).toEqual([
      { kind: 'add', text: 'x' },
      { kind: 'add', text: 'y' },
    ]);
    const long = Array.from({ length: 60 }, (_, i) => `l${i}`).join('\n');
    const rows = textDiff('', long);
    expect(rows.length).toBe(41);
    expect(rows.at(-1)).toEqual({ kind: 'gap', text: 'e mais 20 linhas' });
  });

  it('os campos que mudam; na nota nova, os que vêm preenchidos', () => {
    const n: NotaV1 = {
      id: 'r1', titulo: 'A', texto: '', grupo: 'Trabalho', assunto: null, tags: [], data: '2026-10-27', finalizada_em: null, fixada: false,
      visibilidade: 'privada', capa: null, tarefas: { feitas: 0, total: 0 }, kanban: null, criada_em: NOW, versao: NOW,
    };
    expect(fieldChanges(n, { ...n, titulo: 'B', grupo: null, fixada: true })).toEqual([
      { label: 'Título', before: 'A', after: 'B' },
      { label: 'Grupo', before: 'Trabalho', after: 'sem' },
      { label: 'No topo', before: null, after: 'Fixada' },
    ]);
    expect(fieldChanges(null, { ...n, tags: ['x', 'y'] }).map((f) => f.label)).toEqual(['Grupo', 'Tags', 'Data']);
  });

  it('dá para desfazer só o que entrou e mudou algo', () => {
    expect(undoable({ estado: 'aplicado', op: 'nota.criar', antes: null })).toBeTrue();
    expect(undoable({ estado: 'aplicado', op: 'nota.fixar', antes: null })).toBeFalse();
    expect(undoable({ estado: 'aplicado', op: 'nota.fixar', antes: {} })).toBeTrue();
    expect(undoable({ estado: 'recusado', op: 'nota.criar' })).toBeFalse();
  });
});

describe('os pedidos da API: aprovar, recusar e desfazer', () => {
  let calls: string[];

  function setup(): { s: ApiRequests; store: ReviewStore } {
    localStorage.clear();
    calls = [];
    const account = {
      account: () => ({ id: 'conta-igor', codigo: 'G11T-G00D', nome: 'Igor', api: true }),
      request: async (path: string, init: { method?: string } = {}) => {
        calls.push(`${init.method ?? 'GET'} ${path}`);
        if (path.startsWith('/v1/eu/pedidos?')) return { itens: [] };
        return { ok: true };
      },
    };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: CloudAccount, useValue: account }] });
    const store = TestBed.inject(ReviewStore);
    store.add(note('r0001', 'Reunião', { text: 'Pauta' }));
    return { s: TestBed.inject(ApiRequests), store };
  }
  afterEach(() => localStorage.clear());

  const site = (id: string, op: string, alvo: string, extra: Partial<SiteRequest> = {}): SiteRequest =>
    ({ id, op, alvo, dados: {}, estado: 'aplicado', criado_em: NOW, expira_em: NOW, resolvido_em: NOW, chave: { id: 'k1', nome: 'Claude' }, ...extra }) as SiteRequest;

  it('aprovar conta à nuvem, vira pendente e pede uma rodada já', async () => {
    const { s } = setup();
    s.open.set([site('pd_a', 'nota.fixar', 'r0001', { estado: 'aguardando-aprovacao' })]);
    s.counts.set({ pendentes: 0, aprovar: 1 });
    const wake = s.wake();
    await s.approve('pd_a');
    expect(calls).toEqual(['POST /v1/eu/pedidos/pd_a/aprovar']);
    expect(s.open()[0]!.estado).toBe('pendente');
    expect(s.counts()).toEqual({ pendentes: 1, aprovar: 0 });
    expect(s.wake()).toBe(wake + 1);
  });

  it('recusar tira da lista', async () => {
    const { s } = setup();
    s.open.set([site('pd_a', 'nota.fixar', 'r0001', { estado: 'aguardando-aprovacao' })]);
    await s.refuse('pd_a');
    expect(calls).toEqual(['POST /v1/eu/pedidos/pd_a/recusar']);
    expect(s.open()).toEqual([]);
  });

  it('desfazer uma edição põe a nota de antes de volta (carimbada agora)', async () => {
    const { s, store } = setup();
    const before = store.get('r0001')!;
    const changed = { ...before, text: 'Pauta\nMais', updatedAt: '2026-10-27T15:00:00.000Z' };
    store.update(changed);
    const { scores: _s, ...antes } = before;
    await s.undo(site('pd_a', 'nota.acrescentar', 'r0001', { antes, resultado: { nota: { versao: changed.updatedAt } } }));
    expect(calls).toEqual(['POST /v1/eu/pedidos/pd_a/desfazer']);
    expect(store.get('r0001')!.text).toBe('Pauta');
    expect(store.get('r0001')!.updatedAt > changed.updatedAt).toBeTrue();
    expect(store.versions()).withContext('a de agora era a do pedido: nada a guardar').toEqual([]);
  });

  it('desfazer a troca de título volta os [[links]] das outras notas para o título de antes', async () => {
    const { s, store } = setup();
    const before = store.get('r0001')!;
    store.add(note('r0002', 'Compras', { text: 'Ver [[Reunião geral]]' }));
    const changed = { ...before, game: { ...before.game, name: 'Reunião geral' }, updatedAt: '2026-10-27T15:00:00.000Z' };
    store.update(changed);
    const { scores: _s, ...antes } = before;
    await s.undo(site('pd_a', 'nota.editar', 'r0001', { antes, resultado: { nota: { versao: changed.updatedAt } } }));
    expect(store.get('r0001')!.game.name).toBe('Reunião');
    expect(store.get('r0002')!.text).toBe('Ver [[Reunião]]');
  });

  it('desfazer um criar apaga a nota; mexida depois, a de agora fica guardada', async () => {
    const { s, store } = setup();
    store.update({ ...store.get('r0001')!, text: 'mexida por você', updatedAt: '2026-10-27T16:00:00.000Z' });
    await s.undo(site('pd_a', 'nota.criar', 'r0001', { resultado: { nota: { versao: '2026-10-27T15:00:00.000Z' } } }));
    expect(store.get('r0001')).toBeUndefined();
    expect(store.versions().map((v) => [v.ficha.text, v.motivo])).toEqual([['mexida por você', 'api']]);
  });

  it('desfazer um apagar devolve a nota', async () => {
    const { s, store } = setup();
    const before = store.get('r0001')!;
    store.remove('r0001');
    await s.undo(site('pd_a', 'nota.apagar', 'r0001', { antes: before, resultado: { nota: null } }));
    expect(store.get('r0001')?.game.name).toBe('Reunião');
  });

  it('sem rede, desfazer não mexe em nada aqui', async () => {
    const { s, store } = setup();
    const account = TestBed.inject(CloudAccount) as unknown as { request: () => Promise<never> };
    account.request = async () => {
      throw new CloudError('Sem rede.', 'sem-rede', 0);
    };
    await expectAsync(s.undo(site('pd_a', 'nota.criar', 'r0001'))).toBeRejected();
    expect(store.get('r0001')).toBeDefined();
  });

  it('o histórico de uma chave pede só os resolvidos dela', async () => {
    const { s } = setup();
    await s.history('ch_A B');
    expect(calls).toEqual(['GET /v1/eu/pedidos?estado=historico&chave=ch_A%20B']);
  });
});
