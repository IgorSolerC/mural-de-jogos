import { KanbanBoard, STATUS_MAX, boardIdFor, cleanStatus, mergeBoards, restoredBoard, sanitizeBoard, setStatus } from './kanban';
import { boardLines } from './sync-conflicts';

/** O status das anotações no quadro: umas palavras livres ao lado da importância, o que se guarda, pôr e tirar, a junção e o Desfazer. */

const T0 = '2026-10-19T10:00:00.000Z';
const T1 = '2026-10-19T11:00:00.000Z';
const T2 = '2026-10-19T12:00:00.000Z';

function board(cards: KanbanBoard['cards'] = [], at = T0): KanbanBoard {
  return {
    id: boardIdFor('trabalho'),
    category: 'trabalho',
    at,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    cards,
  };
}

const card = (note: string, status?: string, column = 'afazer') => ({ note, column, importance: null, ...(status ? { status } : {}) });

describe('status no Kanban', () => {
  describe('o que se guarda', () => {
    it('numa linha só, sem espaço sobrando; vazio ou de outro tipo: sem o campo', () => {
      const b = sanitizeBoard({
        ...board(),
        cards: [
          { note: 'na', column: 'afazer', status: '  Aguardando \n  cliente ' },
          { note: 'nb', column: 'afazer', status: '   ' },
          { note: 'nc', column: 'afazer', status: 7 },
        ],
      })!;
      expect(b.cards[0].status).toBe('Aguardando cliente');
      expect('status' in b.cards[1]).toBeFalse();
      expect('status' in b.cards[2]).toBeFalse();
    });

    it(`até ${STATUS_MAX} letras, sem partir um emoji no meio`, () => {
      expect(cleanStatus('x'.repeat(STATUS_MAX + 10)).length).toBe(STATUS_MAX);
      const emoji = cleanStatus('🔥'.repeat(STATUS_MAX + 2));
      expect([...emoji].length).toBe(STATUS_MAX);
      expect(emoji).toBe('🔥'.repeat(STATUS_MAX));
      // a sobra cortada não deixa espaço no fim
      expect(cleanStatus('a'.repeat(STATUS_MAX - 1) + ' bc')).toBe('a'.repeat(STATUS_MAX - 1));
    });
  });

  describe('pôr e tirar', () => {
    it('setStatus guarda limpo, com a hora da anotação e do quadro; igual, nada muda', () => {
      const b = board([card('na'), card('nb')]);
      const next = setStatus(b, 'na', '  Em   revisão ', T1);
      expect(next.cards[0]).toEqual({ ...card('na', 'Em revisão'), at: T1 });
      expect(next.cards[1]).toBe(b.cards[1]);
      expect(next.at).toBe(T1);
      expect(setStatus(next, 'na', 'Em revisão ', T2)).toBe(next);
      // anotação que não está no quadro: nada muda
      expect(setStatus(b, 'nzz', 'Sérgio', T1)).toBe(b);
    });

    it('vazio tira o campo', () => {
      const b = board([card('na', 'Sérgio')]);
      const next = setStatus(b, 'na', '  ', T1);
      expect('status' in next.cards[0]).toBeFalse();
      expect(next.cards[0].at).toBe(T1);
    });
  });

  it('na junção, o status posto num aparelho fica com o que o outro mexeu em outra anotação', () => {
    const o = board([card('na'), card('nb')]);
    const a = setStatus(o, 'na', 'Aguardando cliente', T1);
    const b = { ...o, at: T2, cards: [card('na'), { ...card('nb', undefined, 'feito'), at: T2 }] };
    const m = mergeBoards(o, a, b);
    expect(m.cards.find((c) => c.note === 'na')!.status).toBe('Aguardando cliente');
    expect(m.cards.find((c) => c.note === 'nb')!.column).toBe('feito');
  });

  it('no Desfazer, a anotação que volta a outro status fica com a hora de agora', () => {
    const before = board([card('na'), card('nb')]);
    const now = setStatus(before, 'na', 'Em revisão', T1);
    const back = restoredBoard(before, now, T2);
    expect('status' in back.cards[0]).toBeFalse();
    expect(back.cards[0].at).toBe(T2);
    expect(back.cards[1].at).toBeUndefined();
  });

  it('o conflito do quadro mostra o status ao lado da importância', () => {
    const b = board([{ ...card('na', 'Com o Sérgio'), importance: 'critico' }, card('nb')]);
    const lines = boardLines(b, (id) => (id === 'na' ? 'Login' : 'Sync'));
    expect(lines).toContain('“Login” em A fazer · Crítico · Com o Sérgio');
    expect(lines).toContain('“Sync” em A fazer');
  });
});
