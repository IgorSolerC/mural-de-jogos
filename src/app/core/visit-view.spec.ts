import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Colleague, ColleagueStore } from './colleague-store';
import { Mural } from './mural';
import { NO_FILTER } from './wall-filter';
import { Review, sanitizeReview } from './review';
import { VisitView } from './visit-view';
import { VisitBoards } from './visit-boards';
import { canvasNoteId } from './canvas-id';
import type { FreeBoard } from './free-board';
import { ReviewCard } from '../ui/review-card';
import { VISIT_KEY, WallState, WallView } from './wall-view';

const note = (id: string, title: string, category: string | null): Review =>
  sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: title },
    text: `Texto de ${title}`,
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...(category ? { category } : {}),
  })!;

const person = (id: string, reviews: Review[]): Colleague =>
  ({ id, name: id, fileName: '', loadedAt: '2026-10-01T00:00:00Z', reviews, exportedAt: null, skipped: 0, ownerName: null }) as Colleague;

describe('VisitView', () => {
  const marina = person('Marina', [note('m1', 'Daily', 'Trabalho'), note('m2', 'Pão', 'Receitas'), note('m3', 'Solta', null)]);
  const joao = person('João', [note('j1', 'Treino', 'Saúde')]);
  let selected: ReturnType<typeof signal<Colleague | null>>;

  beforeEach(() => {
    localStorage.clear();
    selected = signal<Colleague | null>(marina);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), VisitView, { provide: ColleagueStore, useValue: { selected } }],
    });
    TestBed.inject(Mural).kind.set('anotacoes');
  });
  afterEach(() => localStorage.clear());

  it('sem nada fornecido, a vista é a do seu mural', () => {
    expect(TestBed.inject(WallState)).toBe(TestBed.inject(WallView));
  });

  it('mostra as fichas da pessoa no mural aberto, com as abas dela', () => {
    const visit = TestBed.inject(VisitView);
    expect(visit.owner()).toBe('Marina');
    expect(visit.wall().map((r) => r.game.name)).toEqual(['Daily', 'Pão', 'Solta']);
    expect(visit.noteTabs()!.tabs.map((t) => t.label)).toEqual(['Receitas', 'Trabalho', 'Sem grupo']);
  });

  it('a ordem e o tipo de ficha de quem visita não mexem nos do seu mural', () => {
    const visit = TestBed.inject(VisitView);
    const mine = TestBed.inject(WallView);
    visit.setDensity('lista');
    visit.setSort('alfabetica');
    TestBed.tick();
    expect(visit.density()).toBe('lista');
    expect(mine.density()).toBe('completa');
    expect(mine.shownSort()).toBe('prioridade');
    expect(JSON.parse(localStorage.getItem(VISIT_KEY)!).noteViews['']).toEqual({ sort: 'alfabetica', direction: 'asc', density: 'lista' });
  });

  it('fecha e abre várias seções de uma vez (o menu da cabeça), sem guardar', () => {
    const visit = TestBed.inject(VisitView);
    visit.setCollapsed(['comuns', 'outra'], true);
    expect(visit.isCollapsed('comuns')).toBeTrue();
    expect(visit.isCollapsed('outra')).toBeTrue();
    visit.setCollapsed(['comuns'], false);
    expect(visit.isCollapsed('comuns')).toBeFalse();
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(VISIT_KEY) ?? '{}').collapsed).toBeUndefined();
    expect(TestBed.inject(WallView).isCollapsed('outra')).toBeFalse();
  });

  it('a aba, a busca e as seções fechadas não ficam guardadas', () => {
    const visit = TestBed.inject(VisitView);
    visit.setNoteTab(visit.noteTabs()!.tabs[1].key);
    visit.toggleCollapsed('comuns');
    TestBed.tick();
    const kept = JSON.parse(localStorage.getItem(VISIT_KEY)!);
    expect(kept.noteTab).toBeUndefined();
    expect(kept.collapsed).toBeUndefined();
  });

  it('outra pessoa abre do começo: sem busca, sem filtros, em Tudo e com as seções abertas', () => {
    const visit = TestBed.inject(VisitView);
    TestBed.tick();
    visit.setNoteTab(visit.noteTabs()!.tabs[1].key);
    visit.query.set('daily');
    visit.toggleCollapsed('comuns');
    visit.showDone.set(true);
    selected.set(joao);
    TestBed.tick();
    expect(visit.owner()).toBe('João');
    expect(visit.query()).toBe('');
    expect(visit.filter()).toEqual(NO_FILTER);
    expect(visit.activeTab()).toBe('');
    expect(visit.isCollapsed('comuns')).toBeFalse();
    expect(visit.showDone()).toBeFalse();
  });
});

/** O canvas na visita (PLANO-CANVAS.md, rodada 2): a mesma ficha do dono, desenhada com o quadro público dela. */
describe('VisitView: o canvas de quem você visita', () => {
  const BOARD = 'Mapa0viagem0Portugal01';
  const canvas = sanitizeReview({
    id: canvasNoteId(BOARD),
    kind: 'anotacoes',
    game: { name: 'Mapa da viagem' },
    text: '',
    category: 'Viagem',
    completedAt: '2026-11-20',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
  })!;
  const marina = { ...person('Marina', [canvas, note('m1', 'Daily', 'Trabalho')]), codigo: 'K7QFM2XA' } as Colleague;
  const board = { v: 1, id: BOARD, nome: 'Mapa', grupo: 'Viagem', em: '2026-11-20T10:00:00.000Z', n: [{ i: 'a1', t: 'x', x: 0, y: 0, w: 200, h: 120, txt: 'Lisboa' }], e: [] } as unknown as FreeBoard;
  let loads: (string | null | undefined)[];

  beforeEach(() => {
    localStorage.clear();
    loads = [];
    const boards = signal<readonly FreeBoard[]>([]);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        VisitView,
        { provide: ColleagueStore, useValue: { selected: signal<Colleague | null>(marina) } },
        { provide: VisitBoards, useValue: { boards, load: async (code: string | null | undefined) => (loads.push(code), boards.set([board])) } },
      ],
    });
    TestBed.inject(Mural).kind.set('anotacoes');
  });
  afterEach(() => localStorage.clear());

  it('com algum canvas no mural, traz os quadros públicos dela, e cada canvas acha o seu pelo id', async () => {
    const visit = TestBed.inject(VisitView);
    TestBed.tick();
    await Promise.resolve();
    expect(loads).toEqual(['K7QFM2XA']);
    expect(visit.canvasBoard()(BOARD)).toBe(board);
    expect(visit.canvasBoard()('outro0quadro0qualquer1')).toBeNull();
    // a busca da visita também acha o canvas pelo que está escrito no quadro
    visit.query.set('lisboa');
    expect(visit.canvasText()(canvas)).toContain('lisboa');
  });

  it('a ficha da visita é a mesma do dono: com o quadro dela, o canvas na moldura e a miniatura', async () => {
    const visit = TestBed.inject(VisitView);
    TestBed.tick();
    await Promise.resolve();
    const fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', canvas);
    fixture.componentRef.setInput('canvasBoard', visit.canvasBoard()(BOARD));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-canvas-card .eucatex app-board-sketch svg')).not.toBeNull();
    expect(el.querySelector('button.hit')!.getAttribute('aria-label')).toContain('Abrir canvas: Mapa da viagem, 1 peça');
    // o que é do dono (o Finalizar e o Fixar) fica de fora: a visita não marca nada
    expect(el.querySelector('.acoes')).toBeNull();
    fixture.destroy();
  });
});
