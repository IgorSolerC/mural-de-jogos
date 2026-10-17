import { notesAsText } from './note-copy';

const note = (name: string, text: string) => ({ game: { name, coverUrl: null, source: 'manual' as const }, text });

describe('o texto das anotações marcadas (Ctrl+C no mural)', () => {
  it('numera na ordem dada, com TÍTULO e DESCRIÇÃO, e uma linha em branco entre elas', () => {
    expect(notesAsText([note('Exemplo Do Titulo Da Nota', 'Exemplo da descrição da nota'), note('Outra', 'Mais texto')])).toBe(
      '1.\nTÍTULO: Exemplo Do Titulo Da Nota\nDESCRIÇÃO: Exemplo da descrição da nota\n\n2.\nTÍTULO: Outra\nDESCRIÇÃO: Mais texto',
    );
  });

  it('o texto sai sem as marcas de formatação, uma linha por item', () => {
    expect(notesAsText([note('Compras', '# Mercado\n- [x] **Pão**\n- [ ] Café')])).toBe('1.\nTÍTULO: Compras\nDESCRIÇÃO: Mercado\nPão\nCafé');
  });

  it('sem texto, a DESCRIÇÃO fica vazia', () => {
    expect(notesAsText([note('Só o título', '   ')])).toBe('1.\nTÍTULO: Só o título\nDESCRIÇÃO:');
  });
});
