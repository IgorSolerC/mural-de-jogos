import { signal } from '@angular/core';
import { KanbanBook, NoteBook, applyKanbanRequest, columnNames, kanbanTitle, kanbanWords, placeNewNote, undoKanban } from './api-requests-kanban';
import { BoardCategory, KanbanBoard, boardIdFor, cardsIn, freshBoard, placeCard, setDeps } from './kanban';
import { Review, sanitizeReview } from './review';

/**
 * Os pedidos do Kanban aplicados pelo site (core/api-requests-kanban.ts, rodada 8): mover, tirar,
 * as colunas, a nota nova que nasce numa coluna, o Desfazer e as frases da folha dos pedidos.
 */

const AT = '2026-10-20T10:00:00.000Z';
const NOW = '2026-10-27T12:00:00.000Z';
const TRAB = boardIdFor('Trabalho');
const [AFAZER, FAZENDO, FEITO] = ['afazer', 'fazendo', 'feito'].map((s) => `${TRAB}-${s}`) as [string, string, string];

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

/** Os quadros de mentira, com as mesmas operações do KanbanStore que o aplicador usa. */
class FakeKanban implements KanbanBook {
  readonly state = signal<KanbanBoard[]>([]);
  private n = 0;
  private readonly cats: BoardCategory[] = [
    { key: 'trabalho', label: 'Trabalho', notes: 4 },
    { key: 'estudos', label: 'Estudos', notes: 1 },
  ];
  constructor() {
    let b = freshBoard('Trabalho');
    b = placeCard(b, 'r-pauta', AFAZER, AT);
    b = placeCard(b, 'r-relat', AFAZER, AT);
    b = placeCard(b, 'r-plan', FAZENDO, AT);
    this.state.set([b]);
  }
  get = (id: string) => this.state().find((b) => b.id === id);
  boardFor = (label: string) => this.get(boardIdFor(label)) ?? freshBoard(label);
  boards = () => this.state();
  categories = () => this.cats;
  groupKanbanOnly = () => false;
  update(id: string, change: (b: KanbanBoard, at: string) => KanbanBoard): void {
    const before = this.get(id) ?? this.cats.map((c) => freshBoard(c.label)).find((b) => b.id === id);
    if (!before) return;
    const next = change(before, new Date(Date.parse(NOW) + ++this.n).toISOString());
    if (next === before) return;
    this.state.update((l) => (l.some((b) => b.id === id) ? l.map((b) => (b.id === id ? next : b)) : [...l, next]));
  }
  board = () => this.get(TRAB)!;
  where = () => this.board().columns.map((c) => `${c.name}: ${cardsIn(this.board(), c.id).map((x) => x.note).join(' ')}`);
}

class FakeNotes implements NoteBook {
  readonly list = signal<Review[]>([
    note('r-pauta', 'Pauta da reunião'),
    note('r-relat', 'Relatório'),
    note('r-plan', 'Planilha'),
    note('r-orc', 'Orçamento'),
    note('r-estudo', 'Integrais', { category: 'Estudos' }),
    note('r-comp', 'Compartilhada'),
  ]);
  shared = new Set(['r-comp']);
  get = (id: string) => this.list().find((n) => n.id === id);
  notes = () => this.list();
  sharedIds = () => this.shared;
  update(r: Review): void {
    this.list.update((l) => l.map((n) => (n.id === r.id ? r : n)));
  }
}

function setup() {
  return { k: new FakeKanban(), n: new FakeNotes() };
}

const mover = (alvo: string, d: Record<string, unknown>) => ({ op: 'cartao.mover', alvo, dados: { quadro: TRAB, ...d } });

describe('os pedidos do Kanban: os cartões', () => {
  it('mover para a coluna que finaliza: o cartão anda, a nota é finalizada, e o antes guarda o lugar e o check', () => {
    const { k, n } = setup();
    const out = applyKanbanRequest(k, n, mover('r-relat', { coluna: FEITO }), NOW);
    expect(out.estado).toBe('aplicado');
    expect(k.where()).toEqual(['A fazer: r-pauta', 'Fazendo: r-plan', 'Feito: r-relat']);
    expect(n.get('r-relat')!.doneAt).toBeTruthy();
    expect(out.carimbo).toBe(n.get('r-relat')!.updatedAt);
    expect(out.antes).toEqual({ quadro: TRAB, card: jasmine.objectContaining({ note: 'r-relat', column: AFAZER }), index: 1, done: false });
    expect((out.resultado as { cartao: { coluna: string; finalizada: boolean } }).cartao).toEqual(jasmine.objectContaining({ coluna: FEITO, finalizada: true }));
    // e saindo dela, abre de novo
    applyKanbanRequest(k, n, mover('r-relat', { coluna: 'a fazer' }), NOW);
    expect(n.get('r-relat')!.doneAt).toBeFalsy();
  });

  it('o lugar na coluna (contado entre os que a API mostra), a importância, o status, o mural e as dependências (sem roda nem nota que não existe)', () => {
    const { k, n } = setup();
    applyKanbanRequest(k, n, mover('r-relat', { posicao: 0, importancia: 'critico', status: 'Em revisão', no_mural: false }), NOW);
    expect(k.where()[0]).toBe('A fazer: r-relat r-pauta');
    const card = k.board().cards.find((c) => c.note === 'r-relat')!;
    expect([card.importance, card.status, card.wall]).toEqual(['critico', 'Em revisão', false]);
    k.update(TRAB, (b, at) => setDeps(b, 'r-pauta', ['r-relat'], at));
    const out = applyKanbanRequest(k, n, mover('r-relat', { depende_de: ['r-pauta', 'r-plan', 'nao-existe'], no_mural: null, status: null }), NOW);
    const after = k.board().cards.find((c) => c.note === 'r-relat')!;
    expect(after.deps).toEqual(['r-plan']);
    expect('wall' in after).toBeFalse();
    expect(after.status).toBeUndefined();
    expect((out.resultado as { aviso?: string }).aviso).toContain('r-pauta, nao-existe');
  });

  it('pôr no quadro a nota do grupo que estava fora: na primeira coluna, sem dizer outra', () => {
    const { k, n } = setup();
    expect(applyKanbanRequest(k, n, mover('r-orc', { importancia: 'baixo' }), NOW).estado).toBe('aplicado');
    expect(k.where()[0]).toBe('A fazer: r-orc r-pauta r-relat');
    expect(k.board().cards.find((c) => c.note === 'r-orc')!.importance).toBe('baixo');
  });

  it('quem chega a uma coluna sem posicao vai para cima (também na que finaliza); posicao depois do último, embaixo; sem mudar de coluna, fica no lugar', () => {
    const { k, n } = setup();
    applyKanbanRequest(k, n, mover('r-plan', { coluna: FEITO }), NOW);
    applyKanbanRequest(k, n, mover('r-relat', { coluna: FEITO }), NOW);
    expect(k.where()[2]).toBe('Feito: r-relat r-plan');
    applyKanbanRequest(k, n, mover('r-pauta', { coluna: FEITO, posicao: 9 }), NOW);
    expect(k.where()[2]).toBe('Feito: r-relat r-plan r-pauta');
    applyKanbanRequest(k, n, mover('r-pauta', { importancia: 'critico' }), NOW);
    expect(k.where()[2]).toBe('Feito: r-relat r-plan r-pauta');
  });

  it('não entra: a nota de outro grupo, a compartilhada, a que sumiu, a coluna que sumiu, o quadro que sumiu', () => {
    const { k, n } = setup();
    const why = (r: { op: string; alvo: string; dados: unknown }) => {
      const out = applyKanbanRequest(k, n, r, NOW);
      expect(out.estado).toBe('falhou');
      return (out.resultado as { erro: string }).erro;
    };
    expect(why(mover('r-estudo', {}))).toContain('grupo Estudos');
    expect(why(mover('r-comp', {}))).toContain('não existe mais');
    expect(why(mover('r-sumiu', {}))).toContain('não existe mais');
    expect(why(mover('r-pauta', { coluna: 'Revisão' }))).toContain('A fazer, Fazendo, Feito');
    expect(why({ op: 'cartao.mover', alvo: 'r-pauta', dados: { quadro: 'kb0000000000000000' } })).toContain('quadro não existe');
    expect(k.where()).toEqual(['A fazer: r-pauta r-relat', 'Fazendo: r-plan', 'Feito: ']);
  });

  it('tirar do quadro; o que já estava fora entra sem nada a desfazer', () => {
    const { k, n } = setup();
    const out = applyKanbanRequest(k, n, { op: 'cartao.tirar', alvo: 'r-plan', dados: { quadro: TRAB } }, NOW);
    expect(k.where()[1]).toBe('Fazendo: ');
    expect(out.antes).toEqual(jasmine.objectContaining({ card: jasmine.objectContaining({ note: 'r-plan', column: FAZENDO }), index: 0 }));
    expect(applyKanbanRequest(k, n, { op: 'cartao.tirar', alvo: 'r-orc', dados: { quadro: TRAB } }, NOW)).toEqual({ estado: 'aplicado', resultado: { cartao: null }, antes: null });
  });

  it('o Desfazer devolve o cartão ao lugar, como era, e a nota ao check de antes; o que entrou de fora sai', () => {
    const { k, n } = setup();
    const moved = applyKanbanRequest(k, n, mover('r-pauta', { coluna: FEITO, importancia: 'medio' }), NOW);
    undoKanban(k, n, { op: 'cartao.mover', alvo: 'r-pauta', antes: moved.antes }, NOW);
    expect(k.where()).toEqual(['A fazer: r-pauta r-relat', 'Fazendo: r-plan', 'Feito: ']);
    expect(k.board().cards.find((c) => c.note === 'r-pauta')!.importance).toBeNull();
    expect(n.get('r-pauta')!.doneAt).toBeFalsy();
    const put = applyKanbanRequest(k, n, mover('r-orc', {}), NOW);
    undoKanban(k, n, { op: 'cartao.mover', alvo: 'r-orc', antes: put.antes }, NOW);
    expect(k.where()[0]).toBe('A fazer: r-pauta r-relat');
    const out = applyKanbanRequest(k, n, { op: 'cartao.tirar', alvo: 'r-plan', dados: { quadro: TRAB } }, NOW);
    undoKanban(k, n, { op: 'cartao.tirar', alvo: 'r-plan', antes: out.antes }, NOW);
    expect(k.where()[1]).toBe('Fazendo: r-plan');
  });
});

describe('os pedidos do Kanban: as colunas', () => {
  it('criar com o id do pedido, depois de outra, finalizando; de novo, a mesma; com nome repetido, não entra', () => {
    const { k, n } = setup();
    const out = applyKanbanRequest(k, n, { op: 'coluna.criar', alvo: 'rcolrev', dados: { quadro: TRAB, nome: 'Revisão', depois_de: FAZENDO, finaliza: true } }, NOW);
    expect(out.estado).toBe('aplicado');
    expect(k.board().columns.map((c) => [c.id, c.name, c.finishes])).toEqual([
      [AFAZER, 'A fazer', false],
      [FAZENDO, 'Fazendo', false],
      ['rcolrev', 'Revisão', true],
      [FEITO, 'Feito', true],
    ]);
    expect((out.resultado as { coluna: { nome: string } }).coluna.nome).toBe('Revisão');
    expect(applyKanbanRequest(k, n, { op: 'coluna.criar', alvo: 'rcolrev', dados: { quadro: TRAB, nome: 'Revisão' } }, NOW).estado).toBe('aplicado');
    expect(k.board().columns.length).toBe(4);
    expect(applyKanbanRequest(k, n, { op: 'coluna.criar', alvo: 'rcolx', dados: { quadro: TRAB, nome: 'FEITO' } }, NOW).estado).toBe('falhou');
    // o Desfazer tira a coluna (os cartões que foram para ela vão para a vizinha)
    applyKanbanRequest(k, n, mover('r-plan', { coluna: 'rcolrev' }), NOW);
    undoKanban(k, n, { op: 'coluna.criar', alvo: 'rcolrev' }, NOW);
    expect(k.where()).toEqual(['A fazer: r-pauta r-relat', 'Fazendo: r-plan', 'Feito: ']);
  });

  it('mudar o nome, o lugar e a seta; o Desfazer volta como era', () => {
    const { k, n } = setup();
    const out = applyKanbanRequest(k, n, { op: 'coluna.editar', alvo: FEITO, dados: { quadro: TRAB, nome: 'Pronto', posicao: 0, pula: true } }, NOW);
    expect(k.board().columns.map((c) => `${c.name}${c.skip ? '*' : ''}`)).toEqual(['Pronto*', 'A fazer', 'Fazendo']);
    undoKanban(k, n, { op: 'coluna.editar', alvo: FEITO, antes: out.antes }, NOW);
    expect(k.board().columns.map((c) => `${c.name}${c.skip ? '*' : ''}${c.finishes ? '✓' : ''}`)).toEqual(['A fazer', 'Fazendo', 'Feito✓']);
  });

  it('apagar: os cartões vão para a vizinha (ou saem, com para null); o Desfazer põe a coluna e os cartões de volta', () => {
    const { k, n } = setup();
    const out = applyKanbanRequest(k, n, { op: 'coluna.apagar', alvo: FAZENDO, dados: { quadro: TRAB } }, NOW);
    expect(k.where()).toEqual(['A fazer: r-pauta r-relat r-plan', 'Feito: ']);
    undoKanban(k, n, { op: 'coluna.apagar', alvo: FAZENDO, antes: out.antes }, NOW);
    expect(k.where()).toEqual(['A fazer: r-pauta r-relat', 'Fazendo: r-plan', 'Feito: ']);
    const gone = applyKanbanRequest(k, n, { op: 'coluna.apagar', alvo: AFAZER, dados: { quadro: TRAB, para: null } }, NOW);
    expect(k.where()).toEqual(['Fazendo: r-plan', 'Feito: ']);
    undoKanban(k, n, { op: 'coluna.apagar', alvo: AFAZER, antes: gone.antes }, NOW);
    expect(k.where()).toEqual(['A fazer: r-pauta r-relat', 'Fazendo: r-plan', 'Feito: ']);
  });
});

describe('os pedidos do Kanban: a nota nova no quadro e as frases', () => {
  it('a nota nova nasce na coluna pedida (pelo nome ou pelo id); sem ela, na primeira, com o aviso; na que finaliza, finalizada', () => {
    const { k, n } = setup();
    n.list.update((l) => [...l, note('r-nova', 'Nova'), note('r-nova2', 'Nova 2'), note('r-nova3', 'Nova 3')]);
    expect(placeNewNote(k, n, n.get('r-nova')!, { coluna: 'fazendo', importancia: 'critico', status: 'Já' }, NOW)).toBeNull();
    expect(k.where()[1]).toBe('Fazendo: r-nova r-plan');
    expect(k.board().cards.find((c) => c.note === 'r-nova')).toEqual(jasmine.objectContaining({ importance: 'critico', status: 'Já' }));
    expect(placeNewNote(k, n, n.get('r-nova2')!, { coluna: 'Revisão' }, NOW)).toContain('entrou em A fazer');
    expect(placeNewNote(k, n, n.get('r-nova3')!, { coluna: FEITO }, NOW)).toBeNull();
    expect(n.get('r-nova3')!.doneAt).toBeTruthy();
  });

  it('as frases, esperando e no histórico, com os nomes das colunas', () => {
    const { k, n } = setup();
    const words = (op: string, alvo: string, dados: Record<string, unknown>, past = false) => {
      const t = { op, alvo, dados: { quadro: TRAB, ...dados } };
      return kanbanWords(op, t.dados, kanbanTitle(k, n, t), past, columnNames(k, t));
    };
    expect(words('cartao.mover', 'r-relat', { coluna: FEITO })).toBe('Levar “Relatório” para Feito');
    expect(words('cartao.mover', 'r-relat', { coluna: FEITO, importancia: 'critico' }, true)).toBe('levou “Relatório” para Feito e mudou a importância (Crítico)');
    expect(words('cartao.mover', 'r-relat', { posicao: 0 })).toBe('Mudar o lugar de “Relatório” na coluna');
    expect(words('cartao.mover', 'r-relat', { status: 'Em revisão', depende_de: [] })).toBe('Mudar o status (“Em revisão”) e as dependências de “Relatório” no quadro');
    expect(words('cartao.tirar', 'r-plan', {})).toBe('Tirar “Planilha” do quadro');
    expect(words('coluna.criar', 'rcol', { nome: 'Revisão' })).toBe('Criar a coluna “Revisão” no quadro Trabalho');
    expect(words('coluna.editar', FEITO, { nome: 'Pronto', posicao: 0 })).toBe('Mudar a coluna “Feito” do quadro Trabalho: o nome (para “Pronto”) e o lugar');
    expect(words('coluna.apagar', FAZENDO, { para: null }, true)).toBe('apagou a coluna “Fazendo” do quadro Trabalho (os cartões dela saem do quadro)');
    expect(words('coluna.apagar', FAZENDO, { para: AFAZER })).toBe('Apagar a coluna “Fazendo” do quadro Trabalho (os cartões dela vão para A fazer)');
    expect(kanbanWords('nota.criar', {}, 'x', false, { target: null, of: () => null })).toBeNull();
  });
});
