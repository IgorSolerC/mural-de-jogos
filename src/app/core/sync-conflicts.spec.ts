import { BUILD } from './build';
import { freshBoard } from './kanban';
import { sanitizeReview } from './review';
import { sanitizeConflicts } from './sync-conflicts';

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
