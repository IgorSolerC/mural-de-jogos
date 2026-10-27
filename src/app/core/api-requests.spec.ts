import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiMirror } from './api-mirror';
import { APPLIED_KEY, ApiRequests, IDLE_MS, SiteRequest, applyNoteRequest, type ApplyContext } from './api-requests';
import { CloudAccount, CloudError } from './cloud-account';
import { LocalData } from './local-data';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';

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
    ctx = { now: NOW, today: '2026-10-27', stamps: new Set(), v1: (r) => TestBed.inject(ApiMirror).notaOf(r) };
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
    ctx = { ...ctx, now: '2026-10-27T15:00:01.000Z', stamps: new Set([`r0001@${first.carimbo}`]) };
    const out = apply('nota.editar', 'r0001', { versao: '2026-10-02T10:00:00.000Z', assunto: 'Outro' });
    expect(out.estado).toBe('aplicado');
    expect(store.get('r0001')!.subject).toBe('Outro');
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
