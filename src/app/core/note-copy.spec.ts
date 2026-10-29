import { notesAsText } from './note-copy';

const note = (name: string, text: string) => ({ game: { name, coverUrl: null, source: 'manual' as const }, text });

describe('o texto das anotações marcadas (Ctrl+C no mural)', () => {
  it('numera na ordem dada, com TÍTULO e DESCRIÇÃO, e uma linha em branco entre elas', () => {
    expect(notesAsText([note('Exemplo Do Titulo Da Nota', 'Exemplo da descrição da nota'), note('Outra', 'Mais texto')])).toBe(
      '1.\nTÍTULO: Exemplo Do Titulo Da Nota\nDESCRIÇÃO: Exemplo da descrição da nota\n\n2.\nTÍTULO: Outra\nDESCRIÇÃO: Mais texto',
    );
  });

  it('uma só sai sem o número (ele só separa duas ou mais)', () => {
    expect(notesAsText([note('Sozinha', 'Texto')])).toBe('TÍTULO: Sozinha\nDESCRIÇÃO: Texto');
    expect(notesAsText([])).toBe('');
  });

  it('o texto sai sem as marcas de formatação, uma linha por item', () => {
    expect(notesAsText([note('Compras', '# Mercado\n- [x] **Pão**\n- [ ] Café')])).toBe('TÍTULO: Compras\nDESCRIÇÃO: Mercado\nPão\nCafé');
  });

  it('sem texto, a DESCRIÇÃO fica vazia', () => {
    expect(notesAsText([note('Só o título', '   ')])).toBe('TÍTULO: Só o título\nDESCRIÇÃO:');
  });
});

describe('os widgets na cópia das anotações', () => {
  // 17/10/2026 10:00, na hora local
  const now = new Date(2026, 9, 17, 10, 0).getTime();
  const copy = (text: string, cardTitle?: (id: string) => string | null) => notesAsText([note('N', text)], { now, cardTitle });

  it('imagem, vídeo e áudio viram o link (e a legenda ou o nome, se tiver)', () => {
    expect(copy('{{imagem: https://x.com/a.jpg}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {imagem: https://x.com/a.jpg}');
    expect(copy('{{video: https://youtu.be/abc | polaroid | Trailer | grande}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {video: https://youtu.be/abc | Trailer}');
    expect(copy('{{audio: https://x.com/a.mp3 | vinil}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {audio: https://x.com/a.mp3}');
  });

  it('a imagem colada do aparelho não leva o endereço murall:// (fora do Murall ele não abre)', () => {
    const id = 'AbCdEfGhIjKlMnOpQrStUv';
    expect(copy(`{{imagem: murall://imagem/${id}}}`)).toBe('TÍTULO: N\nDESCRIÇÃO: {imagem: imagem guardada no Murall}');
    expect(copy(`{{imagem: murall://imagem/${id} | polaroid | A praia}}`)).toBe('TÍTULO: N\nDESCRIÇÃO: {imagem: imagem guardada no Murall | A praia}');
  });

  it('o contador vira quanto falta, as duas maiores unidades, com o título', () => {
    expect(copy('{{contador: 20/11/2026 22:00 | Viagem}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {contador: 34 dias e 12h faltantes | Viagem}');
    expect(copy('{{contador: 17/10/2026 13:20}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {contador: 3h e 20min faltantes}');
    expect(copy('{{contador: 18/10/2026}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {contador: 14h faltantes}');
    expect(copy('{{contador: 18/10/2026 10:00}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {contador: 1 dia faltante}');
  });

  it('o contador que chegou diz quando; o de todo ano, no dia, "é hoje"', () => {
    expect(copy('{{contador: 01/10/2026 18:30 | Show}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {contador: chegou em 01/10/2026 18:30 | Show}');
    expect(copy('{{contador: 17/10 | Aniversário}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {contador: é hoje | Aniversário}');
  });

  it('a nota vira o título de agora da ficha, o escrito na marca, ou o aviso de privada', () => {
    expect(copy('{{nota: #r1 | Compras}}', (id) => (id === 'r1' ? 'Mercado' : null))).toBe('TÍTULO: N\nDESCRIÇÃO: {nota: Mercado}');
    expect(copy('{{nota: #r1 | Compras}}')).toBe('TÍTULO: N\nDESCRIÇÃO: {nota: Compras}');
    expect(copy('{{nota: #r1 | 🔒}}', () => null)).toBe('TÍTULO: N\nDESCRIÇÃO: {nota: nota privada}');
  });

  it('o widget fica no lugar dele, entre as outras linhas', () => {
    expect(copy('Antes\n\n{{imagem: https://x.com/a.jpg}}\n\nDepois')).toBe('TÍTULO: N\nDESCRIÇÃO: Antes\n\n{imagem: https://x.com/a.jpg}\n\nDepois');
  });
});
