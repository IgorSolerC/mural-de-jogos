import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BUILD } from './build';
import { freshBoard } from './kanban';
import { LocalData } from './local-data';
import { sanitizeReview } from './review';
import { SyncConflict, SyncConflicts, sanitizeConflicts, storedConflicts } from './sync-conflicts';

const EM = '2026-10-27T10:00:00.000Z';

describe('sanitizeConflicts (os conflitos lidos do armazenamento ou da nuvem)', () => {
  const ficha = sanitizeReview({
    id: 'rnota01',
    kind: 'anotacoes',
    game: { name: 'Nota', coverUrl: null, source: 'manual' },
    text: 'oi',
    createdAt: EM,
    updatedAt: EM,
  })!;

  it('a ficha pode ter um lado apagado (apagada num aparelho e mudada no outro)', () => {
    const list = sanitizeConflicts([{ alvo: 'ficha:rnota01', em: EM, a: null, b: ficha, partes: [] }], BUILD);
    expect(list.length).toBe(1);
    expect(list[0].a).toBeNull();
  });

  it('um quadro ou um ajuste sem uma das versões não serve: escolher o "apagado" zeraria o ajuste', () => {
    const board = freshBoard('Trabalho');
    const list = sanitizeConflicts(
      [
        { alvo: `kanban:${board.id}`, em: EM, a: board, b: null },
        { alvo: `kanban:${board.id}`, em: EM, a: board },
        { alvo: 'ajuste:tagsFixas', em: EM, a: ['casa'], b: null },
        { alvo: 'ajuste:chaves', em: EM, a: null, b: { rawg: 'x', tmdb: '' } },
      ],
      BUILD,
    );
    expect(list).toEqual([]);
  });

  it('com as duas versões, o quadro e o ajuste entram', () => {
    const board = freshBoard('Trabalho');
    const list = sanitizeConflicts(
      [
        { alvo: `kanban:${board.id}`, em: EM, a: board, b: { ...board, at: '2026-10-27T11:00:00.000Z' } },
        { alvo: 'ajuste:tagsFixas', em: EM, a: ['casa'], b: ['rua'] },
      ],
      BUILD,
    );
    expect(list.map((c) => c.alvo)).toEqual([`kanban:${board.id}`, 'ajuste:tagsFixas']);
  });
});

describe('os conflitos com outra aba aberta', () => {
  const KEY = 'meu-mural:conflitos:v1';
  const ficha = (id: string) => sanitizeReview({ id, kind: 'anotacoes', game: { name: id, coverUrl: null, source: 'manual' }, text: 'oi', createdAt: EM, updatedAt: EM })!;
  const conflict = (id: string): SyncConflict => sanitizeConflicts([{ alvo: `ficha:${id}`, em: EM, a: null, b: ficha(id), partes: [] }], BUILD)[0];
  const text = (...ids: string[]) => JSON.stringify({ build: BUILD, lista: storedConflicts(ids.map(conflict)) });
  const ids = (list: readonly SyncConflict[]) => list.map((c) => c.alvo).sort();

  function setup() {
    const map = new Map<string, string>();
    const listeners: ((key: string, before: string | null) => void)[] = [];
    const data = {
      where: 'local',
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      onExternalChange: (l: (key: string, before: string | null) => void) => void listeners.push(l),
      takeForeign: () => null,
    };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: LocalData, useValue: data }] });
    const conflicts = TestBed.inject(SyncConflicts);
    const otherTab = (value: string, before: string | null) => {
      map.set(KEY, value);
      for (const l of listeners) l(KEY, before);
    };
    return { conflicts, map, otherTab };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('sem nada daqui fora do que esta aba viu, vale o gravado (também o que a outra tirou)', () => {
    const { conflicts, map, otherTab } = setup();
    conflicts.add([conflict('rnota01'), conflict('rnota02')]);
    otherTab(text('rnota02'), map.get(KEY)!);
    expect(ids(conflicts.list())).toEqual(['ficha:rnota02']);
  });

  it('o conflito daqui que a outra aba não viu fica junto do dela', () => {
    const { conflicts, map, otherTab } = setup();
    conflicts.add([conflict('rnota01')]);
    const before = map.get(KEY)!;
    conflicts.add([conflict('rnota02')]);
    otherTab(text('rnota01', 'rnota03'), before);
    expect(ids(conflicts.list())).toEqual(['ficha:rnota01', 'ficha:rnota02', 'ficha:rnota03']);
    expect(ids(sanitizeConflicts((JSON.parse(map.get(KEY)!) as { lista: unknown }).lista, BUILD))).toEqual(['ficha:rnota01', 'ficha:rnota02', 'ficha:rnota03']);
  });
});

