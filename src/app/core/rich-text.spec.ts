import { Block, checkCount, doneLines, foldDone, foldedCount, hasFormatting, parseInline, parseRich, plainText, snapshotDone, toggleCheck, uncheckedKey } from './rich-text';

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

  describe('as tarefas feitas viram uma conta', () => {
    const isCheck = (b: Block): b is Extract<Block, { kind: 'check' }> => b.kind === 'check';
    const t = 'Exercícios 1\n- [x] um\n- [ ] dois\n- [ ] três\n- [X] quatro\nExercícios 2\n- [x] cinco\n- [x] seis\n- comum';

    it('cada sequência fica com as por fazer e a sua conta no fim; a toda feita, só com a conta', () => {
      const blocks = foldDone(parseRich(t), doneLines(t));
      const checks = blocks.filter(isCheck);
      expect(checks.map((b) => [b.items.map((it) => it.spans[0].text), b.folded])).toEqual([
        [['dois', 'três'], 2],
        [[], 2],
      ]);
      expect(blocks.map((b) => b.kind)).toEqual(['p', 'check', 'p', 'check', 'ul']);
    });

    it('só as feitas do retrato, e só se continuam feitas', () => {
      const then = doneLines(t);
      expect([...then]).toEqual([1, 4, 6, 7]);
      // a "dois" foi marcada agora e a "um" desmarcada: as duas ficam à vista
      const now = toggleCheck(toggleCheck(t, 2), 1);
      const [first] = foldDone(parseRich(now), then).filter(isCheck);
      expect([first.items.map((it) => it.line), first.folded]).toEqual([[1, 2, 3], 1]);
    });

    it('sem nada para esconder, o bloco fica como era', () => {
      const blocks = parseRich('- [ ] a\n- [x] b');
      expect(foldDone(blocks, new Set())).toEqual(blocks);
    });

    it('o retrato fica o mesmo quando só as marcas mudam', () => {
      const then = snapshotDone(t);
      expect(snapshotDone(toggleCheck(t, 2), { value: then })).toBe(then);
      expect(snapshotDone(t + '!', { value: then })).not.toBe(then);
      expect(foldedCount(foldDone(parseRich(t), then.lines))).toBe(4);
    });

    it('a chave muda com o texto, não com as marcas', () => {
      expect(uncheckedKey(toggleCheck(t, 2))).toBe(uncheckedKey(t));
      expect(uncheckedKey('- [x] a\r\n- [ ] b')).toBe('- [ ] a\n- [ ] b');
      expect(uncheckedKey(t + '!')).not.toBe(uncheckedKey(t));
      // "[x]" fora de uma tarefa é texto
      expect(uncheckedKey('veja [x] aqui')).toBe('veja [x] aqui');
    });
  });
});
