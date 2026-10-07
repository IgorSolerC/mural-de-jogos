import { checkCount, hasFormatting, parseInline, parseRich, plainText, toggleCheck } from './rich-text';

describe('texto com formatação', () => {
  it('negrito, itálico e os dois juntos', () => {
    expect(parseInline('um **ótimo** jogo, *quase* perfeito, ***uau*** e _também_')).toEqual([
      { text: 'um ' },
      { text: 'ótimo', bold: true },
      { text: ' jogo, ' },
      { text: 'quase', italic: true },
      { text: ' perfeito, ' },
      { text: 'uau', bold: true, italic: true },
      { text: ' e ' },
      { text: 'também', italic: true },
    ]);
    expect(parseInline('**muito *bom* mesmo**')).toEqual([
      { text: 'muito ', bold: true },
      { text: 'bom', bold: true, italic: true },
      { text: ' mesmo', bold: true },
    ]);
  });

  it('marca solta ou separada do texto fica como foi escrita', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }]);
    expect(parseInline('**sem fechar')).toEqual([{ text: '**sem fechar' }]);
    expect(parseInline('snake_case_aqui')).toEqual([{ text: 'snake_case_aqui' }]);
    expect(parseInline('')).toEqual([]);
  });

  it('parágrafos, listas, numeradas e checklists, cada linha no seu bloco', () => {
    const blocks = parseRich('Primeira linha\nsegunda linha\n\n- leite\n- **ovos**\n1. um\n2. dois\n\n- [ ] pão\n- [x] café\nfim');
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'ul', 'ol', 'p', 'check', 'p']);
    expect(blocks[0]).toEqual({ kind: 'p', lines: [[{ text: 'Primeira linha' }], [{ text: 'segunda linha' }], []] });
    expect(blocks[1]).toEqual({ kind: 'ul', items: [{ spans: [{ text: 'leite' }], line: 3 }, { spans: [{ text: 'ovos', bold: true }], line: 4 }] });
    expect(blocks[2]).toEqual(jasmine.objectContaining({ kind: 'ol', start: 1 }));
    expect(blocks[4]).toEqual({
      kind: 'check',
      items: [
        { spans: [{ text: 'pão' }], line: 8, done: false },
        { spans: [{ text: 'café' }], line: 9, done: true },
      ],
    });
  });

  it('texto de antes, sem marcas, fica linha a linha como foi escrito, as em branco também', () => {
    expect(hasFormatting('Um jogo lindo.\n\nDepois conto mais.')).toBeFalse();
    expect(parseRich('Um jogo lindo.\n\n\nDepois conto mais.')).toEqual([
      { kind: 'p', lines: [[{ text: 'Um jogo lindo.' }], [], [], [{ text: 'Depois conto mais.' }]] },
    ]);
    expect(hasFormatting('- item')).toBeTrue();
    expect(hasFormatting('um **negrito**')).toBeTrue();
  });

  it('sem as marcas, para contar palavras e escrever a frase da ficha', () => {
    expect(plainText('Um **ótimo** jogo.\n- [x] zerar\n- platinar\n1. *de novo*')).toBe('Um ótimo jogo.\nzerar\nplatinar\nde novo');
  });

  it('marca e desmarca só a tarefa da linha', () => {
    const t = 'compras:\n- [ ] leite\n- [x] ovos';
    expect(toggleCheck(t, 1)).toBe('compras:\n- [x] leite\n- [x] ovos');
    expect(toggleCheck(t, 2)).toBe('compras:\n- [ ] leite\n- [ ] ovos');
    expect(toggleCheck(t, 0)).toBe(t);
    expect(toggleCheck(t, 9)).toBe(t);
    expect(checkCount(t)).toEqual({ done: 1, total: 2 });
  });
});
