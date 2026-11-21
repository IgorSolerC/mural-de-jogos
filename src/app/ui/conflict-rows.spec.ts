import { KanbanBoard } from '../core/kanban';
import { NOTES_CONFIG_DEFAULT, NotesConfig } from '../core/mural-config';
import { sanitizeProfile } from '../core/profile';
import { Review, sanitizeReview } from '../core/review';
import { Cell, ConflictRow, RowNames, blockRows, boardRows, fichaRows, parseTagKey, words } from './conflict-rows';

/** As diferenças da folha do conflito em palavras e desenhos (PLANO-CONFLITOS.md, rodada 1). */

function note(extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'nota-mercado',
    kind: 'anotacoes',
    game: { name: 'Mercado', coverUrl: null, source: 'manual' },
    text: 'arroz',
    completedAt: '2026-11-16',
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
    stock: 'amarelo',
    private: true,
    category: 'Casa',
    tags: ['mercado'],
    ...extra,
  })!;
}

const NAMES: RowNames = {
  group: (k) => ({ casa: 'Casa', trabalho: 'Trabalho' })[k] ?? null,
  note: (id) => ({ n1: 'Comprar pão', n2: 'Pagar luz', n3: 'Lavar o carro' })[id] ?? null,
  folder: (id) => ({ pabc1234: 'Compras' })[id] ?? null,
  looks: { casa: { icon: 'casa' as never, color: 'verde' as never } },
};

/** Todas as palavras de uma célula (para conferir que nada sai como dado guardado). */
function cellWords(c: Cell): string[] {
  switch (c.kind) {
    case 'tags':
    case 'list':
      return c.items.map((i) => i.label);
    case 'group':
      return [c.label];
    case 'cover':
      return [];
    case 'card':
      return [];
    case 'rich':
      return [c.text];
    case 'secret':
      return [c.end];
    default:
      return [c.text];
  }
}

function expectNoRawData(rows: readonly ConflictRow[]): void {
  for (const r of rows) {
    for (const w of [r.label, ...cellWords(r.a), ...cellWords(r.b)]) {
      expect(w).not.toMatch(/[{}]|"\w+":|\bundefined\b|\bnull\b|\[object/);
    }
  }
}

describe('conflict-rows: as diferenças da folha do conflito', () => {
  it('a ficha: só o que difere, na ordem da leitura, com o texto de fora', () => {
    const rows = fichaRows(note({ text: 'arroz', tags: ['mercado', 'urgente'] }), note({ text: 'feijão', tags: ['Mercado'], doneAt: '2026-11-16T10:00:00.000Z' }), NAMES);
    expect(rows.map((r) => r.id)).toEqual(['finalizada', 'tags']);
    expect(rows[0].a).toEqual(jasmine.objectContaining({ kind: 'icon', text: 'Aberta: fica no mural' }));
    expect(rows[0].b).toEqual(jasmine.objectContaining({ kind: 'icon', text: 'Finalizada: sai do mural' }));
    // a tag que só uma tem leva a marca; a mesma tag em outra grafia, não
    expect(rows[1].a).toEqual({ kind: 'tags', items: [jasmine.objectContaining({ label: 'mercado', only: false }), jasmine.objectContaining({ label: 'urgente', only: true })] });
    expect(rows[1].b).toEqual({ kind: 'tags', items: [jasmine.objectContaining({ label: 'Mercado', only: false })] });
  });

  it('a ficha: grupo com desenho e cor, pasta pelo nome, quem vê, fixada e a cara como a ficha do mural', () => {
    const a = note({ category: 'Casa', folder: 'pabc1234', private: true, stock: 'amarelo' });
    const b = note({ category: '', folder: '', private: undefined, quiet: true, noteRank: 'fixada', stock: 'azul' });
    const rows = fichaRows(a, b, NAMES);
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by('grupo').a).toEqual({ kind: 'group', label: 'Casa', look: NAMES.looks['casa'], color: { hex: jasmine.any(String) as never, name: 'Verde' } });
    expect(by('grupo').b).toEqual({ kind: 'empty', text: 'Sem grupo' });
    expect(by('pasta').a).toEqual(jasmine.objectContaining({ kind: 'icon', text: 'Compras' }));
    expect(by('pasta').b).toEqual({ kind: 'empty', text: 'Fora das pastas' });
    expect((by('publico').a as { text: string }).text).toBe('Privada');
    expect((by('publico').b as { text: string }).text).toBe('Disponível');
    expect(by('lugar').b).toEqual({ kind: 'switch', on: true, text: 'Fixada no topo do mural' });
    expect(by('aparencia').label).toBe('Como a anotação fica no mural');
    expect(by('aparencia').a).toEqual({ kind: 'card', review: a });
    expectNoRawData(rows);
  });

  it('a ficha: os campos das resenhas em palavras, nunca o dado guardado', () => {
    const game = (extra: Record<string, unknown>) =>
      sanitizeReview({ id: 'jogo-1', kind: 'jogos', game: { name: 'Celeste', coverUrl: null, source: 'manual' }, text: '', completedAt: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', scores: { final: 8, diversao: 8 }, ...extra })!;
    const rows = fichaRows(game({ status: 'finalizado', hoursPlayed: 12 }), game({ status: 'platinado', hoursPlayed: 30, scores: { final: 9, diversao: 10 } }), NAMES);
    const by = (id: string) => rows.find((r) => r.id === id);
    expect(by('outro:status')?.label).toBe('Até onde foi');
    expect(by('outro:status')?.b).toEqual({ kind: 'text', text: 'Platinado' });
    expect((by('nota')?.b as { text: string }).text).toContain('Diversão 10');
    expect(by('outro:hoursPlayed')).toBeDefined();
    expectNoRawData(rows);
  });

  it('as configurações do mural: cada campo com o nome da folha Configurações', () => {
    const cfg = (extra: Partial<NotesConfig>): NotesConfig => ({ ...NOTES_CONFIG_DEFAULT, ...extra });
    const a = cfg({
      audience: 'visivel',
      showPinned: true,
      categories: { casa: { view: 'lista' } },
      folders: [{ id: 'pabc1234', group: 'casa', name: 'Compras do mês', parent: null }],
      hiddenTags: ['##casa#urgente'],
    });
    const b = cfg({
      audience: 'publicar',
      categories: { casa: { view: 'lista', hidden: true } },
      folders: [{ id: 'pabc1234', group: 'casa', name: 'Feira', parent: null }],
      hiddenTags: [],
    });
    const rows = blockRows('muralAnotacoes', a, b, NAMES);
    expect(rows.map((r) => r.label)).toEqual([
      'Privacidade da anotação nova',
      'Aba “Fixadas”',
      'Grupo “Casa” · Aba escondida no “Mais”',
      'Tags que começam escondidas no filtro',
      'Nome da pasta do grupo “Casa”',
    ]);
    expect(rows[0].a).toEqual(jasmine.objectContaining({ kind: 'icon', text: 'Disponível' }));
    expect(rows[1].a).toEqual({ kind: 'switch', on: true, text: 'Em pé, ao lado dos grupos' });
    expect(rows[2].b).toEqual({ kind: 'switch', on: true, text: 'Escondida no “Mais”' });
    expect(rows[3].a).toEqual({ kind: 'tags', items: [jasmine.objectContaining({ label: 'urgente (Casa)', only: true })] });
    expect(rows[3].b).toEqual({ kind: 'empty', text: 'Nenhuma' });
    expect(rows[4].b).toEqual({ kind: 'text', text: 'Feira', hand: true });
    expectNoRawData(rows);
  });

  it('as configurações iguais não dão linha nenhuma', () => {
    expect(blockRows('muralAnotacoes', NOTES_CONFIG_DEFAULT, { ...NOTES_CONFIG_DEFAULT }, NAMES)).toEqual([]);
  });

  it('a pasta criada num lado, desfeita no outro, e a pasta movida', () => {
    const a = { ...NOTES_CONFIG_DEFAULT, folders: [{ id: 'pnova001', group: 'casa', name: 'Nova', parent: null }, { id: 'pfilha01', group: 'casa', name: 'Filha', parent: 'pnova001' }] };
    const b = { ...NOTES_CONFIG_DEFAULT, folders: [{ id: 'pnova001', group: 'casa', name: 'Nova', parent: null, gone: '2026-11-16T10:00:00.000Z' }, { id: 'pfilha01', group: 'casa', name: 'Filha', parent: null }] };
    const rows = blockRows('muralAnotacoes', a, b, NAMES);
    expect(rows.map((r) => r.label)).toEqual(['Pasta “Nova”', 'Onde fica a pasta “Filha”']);
    expect(rows[0].b).toEqual({ kind: 'empty', text: 'Desfeita' });
    expect(rows[1].a).toEqual(jasmine.objectContaining({ text: 'Dentro de “Nova”' }));
    expect(rows[1].b).toEqual({ kind: 'text', text: 'Solta no grupo “Casa”' });
  });

  it('a mini-pasta dos templates: o nome da pasta e a pasta de cada template, em palavras', () => {
    const pasta = { id: 'preuniao1', group: 'templates:as-mini-pastas-dos-templates', name: 'Reuniões', parent: null };
    const t = { id: 'pauta1', title: 'Pauta', text: '## Pauta' };
    const a = { ...NOTES_CONFIG_DEFAULT, folders: [pasta], templates: [{ ...t, folder: 'preuniao1' }] };
    const b = { ...NOTES_CONFIG_DEFAULT, folders: [{ ...pasta, name: 'Encontros' }], templates: [t] };
    const rows = blockRows('muralAnotacoes', a, b, NAMES);
    expect(rows.map((r) => r.label)).toEqual(['Nome da pasta do grupo “Templates”', 'Pasta do template “Pauta”']);
    expect(rows[1].a).toEqual(jasmine.objectContaining({ text: 'Reuniões' }));
    expect(rows[1].b).toEqual({ kind: 'empty', text: 'Fora das pastas' });
    // a pasta desfeita de um lado: o template está solto nos dois, e não há o que escolher
    const gone = { ...a, folders: [{ ...pasta, gone: '2026-11-20T10:00:00.000Z' }] };
    expect(blockRows('muralAnotacoes', gone, { ...b, folders: [{ ...pasta, gone: '2026-11-20T10:00:00.000Z' }] }, NAMES)).toEqual([]);
  });

  it('o ícone e a cor dos grupos e das tags: a chave da tag vira o nome dela e o do grupo', () => {
    const rows = blockRows('categorias', { casa: { icon: 'casa', color: 'verde' }, '##casa#mercado': { color: 'azul' } }, { casa: { icon: 'carrinho', color: 'rosa' } }, NAMES);
    expect(rows.map((r) => r.label)).toEqual(['Cor da tag “mercado” no grupo “Casa”', 'Desenho e cor do grupo “Casa”']);
    expect(rows[0].a).toEqual({ kind: 'tags', items: [jasmine.objectContaining({ label: 'mercado', only: false })] });
    expect(rows[0].b).toEqual({ kind: 'tags', items: [{ label: 'mercado', color: null, only: false }] });
    expect(rows[1].b).toEqual({ kind: 'group', label: 'Casa', look: { icon: 'carrinho', color: 'rosa' } as never, color: { hex: jasmine.any(String) as never, name: 'Rosa' } });
  });

  it('a chave da tag com "#" no nome do grupo', () => {
    expect(parseTagKey('##c##sharp#bug')).toEqual({ tag: 'bug', group: 'c#sharp' });
    expect(parseTagKey('#bug')).toEqual({ tag: 'bug', group: null });
    expect(parseTagKey('casa')).toBeNull();
  });

  it('as tags sempre à mão e as chaves (só o fim)', () => {
    const tags = blockRows('tagsFixas', ['mercado', 'urgente'], ['mercado', 'trabalho'], NAMES);
    expect(tags.length).toBe(1);
    expect(tags[0].a).toEqual({ kind: 'tags', items: [jasmine.objectContaining({ label: 'mercado', only: false }), jasmine.objectContaining({ label: 'urgente', only: true })] });
    expect(blockRows('tagsFixas', ['a'], ['a'], NAMES)).toEqual([]);
    const keys = blockRows('chaves', { rawg: 'segredo-1234', tmdb: '' }, { rawg: 'segredo-9876', tmdb: '' }, NAMES);
    expect(keys).toEqual([jasmine.objectContaining({ label: 'Chave do RAWG (jogos)', a: { kind: 'secret', end: '1234' }, b: { kind: 'secret', end: '9876' } })]);
  });

  it('o perfil: o sobre formatado, a parede com a cor dela, as seções pelo título', () => {
    const p = sanitizeProfile({ emoji: '🙂', about: '**oi**', page: 'eucatex', sections: [{ id: 'sec1', title: 'Favoritos', items: ['n1'] }] })!;
    const q = sanitizeProfile({ emoji: '🙂', about: 'olá', page: 'lousa', sections: [{ id: 'sec1', title: 'Favoritos', items: ['n1', 'n2'] }] })!;
    const rows = blockRows('perfil', p, q, NAMES);
    expect(rows.map((r) => r.label)).toEqual(['Sobre você', 'Parede do site e do perfil', 'Seção “Favoritos” · Fichas']);
    expect(rows[0].a).toEqual({ kind: 'rich', text: '**oi**' });
    expect(rows[1].b).toEqual(jasmine.objectContaining({ kind: 'swatch', text: 'Lousa' }));
    expect(rows[2].b).toEqual({ kind: 'list', ordered: true, items: [jasmine.objectContaining({ label: 'Comprar pão', only: false }), jasmine.objectContaining({ label: 'Pagar luz', only: true })] });
    expectNoRawData(rows);
  });

  it('o quadro Kanban: a coluna, onde está cada anotação e a fila', () => {
    const col = (id: string, name: string, color = 'amarelo') => ({ id, name, icon: 'circulo', color, finishes: false });
    const board = (extra: Partial<KanbanBoard>): KanbanBoard => ({
      id: 'kb-casa',
      category: 'casa',
      at: '2026-11-16T10:00:00.000Z',
      columns: [col('c1', 'Fazer'), col('c2', 'Feito')] as never,
      cards: [
        { note: 'n1', column: 'c1', importance: null },
        { note: 'n2', column: 'c1', importance: null },
      ],
      ...extra,
    });
    const a = board({ columns: [col('c1', 'Fazer', 'azul'), col('c2', 'Feito')] as never, cards: [{ note: 'n1', column: 'c1', importance: 'critico', at: '2026-11-16T10:00:00.000Z' }, { note: 'n2', column: 'c1', importance: null }] });
    const b = board({ cards: [{ note: 'n2', column: 'c1', importance: null }, { note: 'n1', column: 'c2', importance: null, at: '2026-11-16T11:00:00.000Z' }, { note: 'n3', column: 'c1', importance: null }] });
    const rows = boardRows(a, b, NAMES);
    expect(rows.map((r) => r.label)).toEqual(['Coluna “Fazer” · Cor', '“Comprar pão” · Coluna', '“Comprar pão” · Importância', '“Lavar o carro”']);
    expect(rows[1].b).toEqual({ kind: 'text', text: 'Feito' });
    expect(rows[3].a).toEqual({ kind: 'empty', text: 'Fora do quadro' });
    expectNoRawData(rows);
  });

  it('as mesmas anotações em outra fila', () => {
    const b1: KanbanBoard = { id: 'kb', category: 'casa', at: '', columns: [{ id: 'c1', name: 'Fazer', icon: 'circulo', color: 'amarelo', finishes: false }] as never, cards: [{ note: 'n1', column: 'c1', importance: null }, { note: 'n2', column: 'c1', importance: null }] };
    const b2: KanbanBoard = { ...b1, cards: [...b1.cards].reverse() };
    const rows = boardRows(b1, b2, NAMES);
    expect(rows.map((r) => r.label)).toEqual(['Ordem das anotações em “Fazer”']);
    expect(rows[0].a).toEqual(jasmine.objectContaining({ kind: 'list', ordered: true }));
  });

  it('revisão: a coluna só renomeada não põe uma linha em cada anotação dela', () => {
    const col = (name: string) => ({ id: 'c1', name, icon: 'circulo', color: 'amarelo', finishes: false });
    const b1: KanbanBoard = { id: 'kb', category: 'casa', at: '', columns: [col('Fazer')] as never, cards: [{ note: 'n1', column: 'c1', importance: null }] };
    const b2: KanbanBoard = { ...b1, columns: [col('A fazer')] as never };
    expect(boardRows(b1, b2, NAMES).map((r) => r.label)).toEqual(['Nome da coluna']);
  });

  it('revisão: o card padrão diferente aparece como a anotação de exemplo vestida', () => {
    const col = (look: unknown) => ({ id: 'c1', name: 'Fazer', icon: 'circulo', color: 'amarelo', finishes: false, dresses: true, look });
    const b1: KanbanBoard = { id: 'kb', category: 'casa', at: '', columns: [col({ stock: 'azul' })] as never, cards: [] };
    const b2: KanbanBoard = { ...b1, columns: [col({ stock: 'rosa' })] as never };
    const [row] = boardRows(b1, b2, NAMES);
    expect(row.label).toBe('Coluna “Fazer” · Como é o card padrão');
    expect(row.a.kind).toBe('card');
    expect((row.b as { review: Review }).review.stock).toBe('rosa');
  });

  it('revisão: as tags de cada lado com a cor do grupo dele, e o "Sem cor" escolhido com o nome', () => {
    const looks = { '##casa#mercado': { color: 'azul' }, '##trabalho#mercado': { color: 'vermelho' } } as never;
    const rows = fichaRows(note({ category: 'Casa', tags: ['mercado'] }), note({ category: 'Trabalho', tags: ['mercado', 'x'] }), { ...NAMES, looks });
    const tags = rows.find((r) => r.id === 'tags')!;
    const color = (c: Cell) => (c as { items: { color: string | null }[] }).items[0].color;
    expect(color(tags.a)).not.toBe(color(tags.b));
    const none = blockRows('categorias', { '#bug': { none: true } }, {}, NAMES);
    expect(none[0].a).toEqual({ kind: 'empty', text: 'Sem cor' });
  });

  it('revisão: a data de publicação sozinha também dá uma linha (nunca uma folha sem diferença)', () => {
    const rows = fichaRows(note({ private: undefined, publishedAt: '2026-11-10T10:00:00.000Z' }), note({ private: undefined, publishedAt: '2026-11-12T10:00:00.000Z' }), NAMES);
    expect(rows.map((r) => r.label)).toEqual(['Publicada no Feed em']);
    expectNoRawData(rows);
  });

  it('qualquer valor em palavras', () => {
    expect(words({ year: 2018, platforms: ['PC', 'Switch'] })).toBe('2018 · PC, Switch');
    expect(words(true)).toBe('Sim');
    expect(words(null)).toBe('');
  });
});
