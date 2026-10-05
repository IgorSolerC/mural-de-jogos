import { finishDay, loadStats } from './muraldle-save';
import { columnsFor, compare, dailySecret, previousDay, sentenceHint, shareText } from './muraldle';
import { Review, sanitizeReview } from './review';

function review(id: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name: `Jogo ${id}`, coverUrl: null, source: 'manual' },
    scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 },
    finalOverride: 8,
    status: 'finalizado',
    difficulty: 'media',
    verdict: 'recomendo',
    hoursPlayed: 20,
    completedAt: '2024-05-01',
    stock: 'azul',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    text: '',
    ...extra,
  })!;
}

const markOf = (cells: ReturnType<typeof compare>, key: string) => cells.find((c) => c.key === key)!;

describe('Muraldle', () => {
  it('as colunas seguem o mural', () => {
    expect(columnsFor('jogos').map((c) => c.key)).toEqual(['media', 'status', 'veredito', 'dificuldade', 'ano', 'quantidade', 'bonus', 'cartolina']);
    expect(columnsFor('filmes').map((c) => c.key)).toEqual(['media', 'status', 'veredito', 'ano', 'bonus', 'cartolina']);
    expect(columnsFor('livros').find((c) => c.key === 'quantidade')!.label).toBe('Páginas');
  });

  it('a própria secreta é toda verde', () => {
    const s = review('raaaa1');
    expect(compare(s, s).every((c) => c.mark === 'certo')).toBeTrue();
  });

  it('números: perto, longe e a seta para o lado da secreta', () => {
    const secret = review('raaaa1', { finalOverride: 8.4, completedAt: '2022', hoursPlayed: 100, difficulty: 'infernal' });
    const cells = compare(review('rbbbb1', { finalOverride: 8, completedAt: '2023-02', hoursPlayed: 90, difficulty: 'facil' }), secret);
    expect(markOf(cells, 'media')).toEqual(jasmine.objectContaining({ mark: 'perto', arrow: 'up' }));
    expect(markOf(cells, 'ano')).toEqual(jasmine.objectContaining({ mark: 'perto', arrow: 'down' }));
    expect(markOf(cells, 'quantidade')).toEqual(jasmine.objectContaining({ mark: 'perto', arrow: 'up' }));
    expect(markOf(cells, 'dificuldade')).toEqual(jasmine.objectContaining({ mark: 'errado', arrow: 'up' }));
    const far = compare(review('rcccc1', { finalOverride: 5, hoursPlayed: null, completedAt: null }), secret);
    expect(markOf(far, 'media')).toEqual(jasmine.objectContaining({ mark: 'errado', arrow: 'up' }));
    expect(markOf(far, 'quantidade').mark).toBe('desconhecido');
    expect(markOf(far, 'ano')).toEqual(jasmine.objectContaining({ mark: 'desconhecido', text: 'Sem data' }));
  });

  it('adesivos e cartolina: um em comum ou o mesmo tom é perto', () => {
    const trilha = { id: 'trilha-sonora', label: 'Trilha sonora incrível', kind: 'favor' };
    const bugs = { id: 'bugs', label: 'Muitos bugs', kind: 'contra' };
    const secret = review('raaaa1', { bonuses: [trilha, bugs], stock: 'azul' });
    const one = compare(review('rbbbb1', { bonuses: [trilha], stock: 'azul-escuro' }), secret);
    expect(markOf(one, 'bonus')).toEqual(jasmine.objectContaining({ mark: 'perto', text: '+1' }));
    expect(markOf(one, 'cartolina').mark).toBe('perto');
    const none = compare(review('rcccc1', { stock: 'rosa' }), secret);
    expect(markOf(none, 'bonus')).toEqual(jasmine.objectContaining({ mark: 'errado', text: 'Nenhum' }));
    expect(markOf(none, 'cartolina').mark).toBe('errado');
  });

  it('a ficha do dia é a mesma no mesmo dia, muda com o dia e evita as recentes', () => {
    const pool = ['raaaa1', 'rbbbb1', 'rcccc1', 'rdddd1', 'reeee1'].map((id) => review(id));
    const a = dailySecret(pool, '2026-10-05', 'jogos|eu')!;
    expect(dailySecret([...pool].reverse(), '2026-10-05', 'jogos|eu')!.id).toBe(a.id);
    const days = new Set(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => dailySecret(pool, d, 'jogos|eu')!.id));
    expect(days.size).toBeGreaterThan(1);
    const avoid = pool.filter((r) => r.id !== 'rcccc1').map((r) => r.id);
    expect(dailySecret(pool, '2026-10-05', 'jogos|eu', avoid)!.id).toBe('rcccc1');
  });

  it('a pista da frase tapa o nome da secreta', () => {
    const s = review('raaaa1', { game: { name: 'Hades', coverUrl: null, source: 'manual' }, text: 'Hades é o melhor roguelike. Depois explico.' });
    expect(sentenceHint(s)).toBe('▒▒▒▒ é o melhor roguelike. Depois explico.');
  });

  it('o texto de compartilhar só tem quadradinhos', () => {
    const s = review('raaaa1');
    const rows = [compare(s, s), compare(review('rbbbb1', { finalOverride: 2, stock: 'rosa' }), s)];
    const text = shareText('Muraldle', rows, true);
    expect(text).toContain('Acertei em 2 tentativas');
    expect(text).not.toContain('Jogo');
    expect(text.split('\n').at(-1)).toBe('🟩🟩🟩🟩🟩🟩🟩🟩');
  });

  it('a sequência de dias', () => {
    localStorage.removeItem('mural-de-jogos:muraldle:v1');
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    finishDay('jogos|eu', '2026-10-04', 'raaaa1', true);
    let st = finishDay('jogos|eu', '2026-10-05', 'rbbbb1', true);
    expect(st.streak).toBe(2);
    expect(loadStats('jogos|eu', '2026-10-06').streak).toBe(2);
    // pulou um dia: a sequência zera
    expect(loadStats('jogos|eu', '2026-10-08').streak).toBe(0);
    st = finishDay('jogos|eu', '2026-10-06', 'rcccc1', false);
    expect(st).toEqual(jasmine.objectContaining({ played: 3, won: 2, streak: 0, best: 2 }));
    localStorage.removeItem('mural-de-jogos:muraldle:v1');
  });
});
