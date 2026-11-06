import { Block, blockLine, bodyOf, checkCount, copyText, dedentCode, fencesPair, ownerItem, renumberAfter, hasSpoiler, doneLines, foldDone, foldedCount, hasFormatting, linkAt, marksAt, parseInline, parseRich, plainText, snapshotDone, toggleCheck, uncheckedKey, unwrapAt } from './rich-text';

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

  it('a tabela acaba no widget ou no card colado embaixo dela, mesmo com "|" neles; a fileira comum continua', () => {
    const T = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const kinds = (text: string) => parseRich(text).map((b) => b.kind);
    const rows = (text: string) => parseRich(text).flatMap((b) => (b.kind === 'table' ? [b.rows.length] : []));
    expect(kinds(`${T}\n{{contador: 19/11/2027 | Embarque}}\ndepois`)).toEqual(['table', 'widget', 'p']);
    expect(rows(`${T}\n{{contador: 19/11/2027 | Embarque}}`)).toEqual([1]);
    expect(kinds(`${T}\n{{imagem: https://a.io/b.jpg | polaroid | grande}}`)).toEqual(['table', 'widget']);
    expect(kinds(`${T}\n  {{contador: 19/11/2027 | Embarque}}`)).toEqual(['table', 'widget']);
    expect(kinds(`${T}\n> [!aviso|azul]- Título\n> dentro`)).toEqual(['table', 'callout']);
    // a marca de outra tabela, com "|" nos parâmetros, começa a outra
    expect(rows(`${T}\n{{tabela: recibo | nota}}\n${T}`)).toEqual([1, 1]);
    // o que só parece: um widget que não existe, e a marca no meio da fileira, continuam fileiras
    expect(rows(`${T}\n{{nada: 1 | 2}}\n| {{contador: 19/11/2027 | x}} | 2 |\n3 | 4`)).toEqual([4]);
    // a linha certa de cada bloco, para o Visual e os toques
    const [table, widget] = parseRich(`${T}\n{{contador: 19/11/2027 | Embarque}}`);
    expect(blockLine(table)).toBe(0);
    expect(blockLine(widget)).toBe(3);
  });

  it('spoiler: ||texto|| como no Discord, ou >!texto!< como no Reddit, com as outras marcas por dentro', () => {
    expect(parseInline('o final: ||ele morre|| no fim')).toEqual([{ text: 'o final: ' }, { text: 'ele morre', spoiler: true }, { text: ' no fim' }]);
    expect(parseInline('>!o vilão é **o pai**!<')).toEqual([
      { text: 'o vilão é ', spoiler: true },
      { text: 'o pai', spoiler: true, bold: true },
    ]);
    // ">!…!<" no começo da linha é spoiler, não citação; "> !" continua citação
    expect(parseRich('>!segredo!< e mais')[0]).toEqual({ kind: 'p', lines: [[{ text: 'segredo', spoiler: true }, { text: ' e mais' }]] });
    expect(parseRich('> !importante')[0].kind).toBe('quote');
    // separado do texto, ou escapado, fica como foi escrito
    expect(parseInline('a || b || c')).toEqual([{ text: 'a || b || c' }]);
    expect(parseInline('\\||nada\\||')).toEqual([{ text: '||nada||' }]);
    expect(hasFormatting('só ||isso||')).toBeTrue();
  });

  it('tem spoiler: em qualquer bloco (lista, título, tabela); "||" solto ou no código, não', () => {
    expect(hasSpoiler('- item ||x||')).toBeTrue();
    expect(hasSpoiler('# Fim: >!morre!<')).toBeTrue();
    expect(hasSpoiler('| a | b |\n| - | - |\n| >!x!< | y |')).toBeTrue();
    expect(hasSpoiler('a || b')).toBeFalse();
    expect(hasSpoiler('`||x||`')).toBeFalse();
    expect(hasSpoiler('nada aqui')).toBeFalse();
  });

  it('o texto sem marcas nunca conta o spoiler; a cópia leva o trecho entre ||', () => {
    expect(plainText('Gostei. ||O pai **volta**|| no fim.')).toBe('Gostei. [spoiler] no fim.');
    expect(copyText('Gostei. ||O pai **volta**|| no fim.', { now: 0 })).toBe('Gostei. ||O pai volta|| no fim.');
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

    it('listas separadas só por linhas em branco são uma sequência só, com uma conta', () => {
      const s = '- [x] a\n\n- [ ] b\n\n- [x] c\n\n\n- [ ] d\n- [x] e\n\nTexto\n- [x] f';
      const blocks = foldDone(parseRich(s), doneLines(s));
      const shape = blocks.map((b) => (b.kind === 'check' ? [b.items.map((it) => it.spans[0].text), b.folded] : b.kind === 'p' ? b.lines.length : b.kind));
      // a "a" e a "c" saem com a linha em branco de antes; a conta vai no fim da última lista
      expect(shape).toEqual([[['b'], undefined], 2, [['d'], 3], 2, [[], 1]]);
      // tudo feito: só a conta
      const all = '- [x] a\n\n- [x] b\n\n- [x] c';
      expect(foldDone(parseRich(all), doneLines(all))).toEqual([{ kind: 'check', items: [], folded: 3, seq: 0 }]);
      // nada a esconder: os blocos como eram
      const none = '- [ ] a\n\n- [ ] b';
      expect(foldDone(parseRich(none), new Set())).toEqual(parseRich(none));
    });

    it('a conta diz de que sequência é (a linha da primeira tarefa), e a sequência aberta fica como é', () => {
      const blocks = foldDone(parseRich(t), doneLines(t));
      expect(blocks.filter(isCheck).map((b) => b.seq)).toEqual([1, 6]);
      // aberta a primeira: ela volta inteira, sem conta; a segunda continua recolhida
      const open = foldDone(parseRich(t), doneLines(t), new Set([1]));
      const checks = open.filter(isCheck);
      expect(checks.map((b) => [b.items.map((it) => it.line), b.folded])).toEqual([
        [[1, 2, 3, 4], undefined],
        [[], 2],
      ]);
      expect(foldedCount(open)).toBe(2);
      // a sequência de listas separadas por linhas em branco abre junta, com as linhas em branco
      const s = '- [x] a\n\n- [ ] b\n\n- [x] c';
      expect(foldDone(parseRich(s), doneLines(s), new Set([0]))).toEqual(parseRich(s));
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

    it('a desmarcada sai do retrato: marcada de novo, continua à vista', () => {
      const then = snapshotDone(t);
      const off = snapshotDone(toggleCheck(t, 1), { value: then });
      expect([...off.lines]).toEqual([4, 6, 7]);
      const back = snapshotDone(t, { value: off });
      expect(back).toBe(off);
      expect(foldedCount(foldDone(parseRich(t), back.lines))).toBe(3);
    });

    it('a chave muda com o texto, não com as marcas', () => {
      expect(uncheckedKey(toggleCheck(t, 2))).toBe(uncheckedKey(t));
      expect(uncheckedKey('- [x] a\r\n- [ ] b')).toBe('- [ ] a\n- [ ] b');
      expect(uncheckedKey(t + '!')).not.toBe(uncheckedKey(t));
      // "[x]" fora de uma tarefa é texto
      expect(uncheckedKey('veja [x] aqui')).toBe('veja [x] aqui');
    });
  });
  it('a tarefa escrita dentro de um bloco de código não conta: lá ela é só código', () => {
    const t = '```\n- [ ] exemplo\n- [x] outro\n```\n- [x] de verdade\n- [ ] por fazer';
    expect(checkCount(t)).toEqual({ done: 1, total: 2 });
    expect([...doneLines(t)]).toEqual([4]);
    // as marcas de dentro do código ficam como estão na chave (lá não há o que marcar)
    expect(uncheckedKey(t)).toBe('```\n- [ ] exemplo\n- [x] outro\n```\n- [ ] de verdade\n- [ ] por fazer');
  });

  it('o link onde o cursor está: o de anotação, o de endereço e o endereço solto; no código, não', () => {
    const line = 'Veja [[Compras|a lista]] e [site](https://a.com/x) ou https://b.com. `[[Não]]`';
    expect(linkAt(line, 0)).toBeNull();
    expect(linkAt(line, 5)).toEqual({ kind: 'note', start: 5, end: 24, title: 'Compras', label: 'a lista' });
    expect(linkAt(line, 24)).toEqual({ kind: 'note', start: 5, end: 24, title: 'Compras', label: 'a lista' });
    expect(linkAt(line, 30)).toEqual({ kind: 'url', start: 27, end: 50, text: 'site', href: 'https://a.com/x' });
    expect(linkAt(line, 57)).toEqual({ kind: 'url', start: 54, end: 67, text: '', href: 'https://b.com' });
    expect(linkAt(line, 68)).toBeNull();
    expect(linkAt(line, line.length - 3)).toBeNull();
  });
});

describe('as cercas do bloco de código', () => {
  const code = (b: Block | undefined) => (b?.kind === 'code' ? b : null);
  const itens = (b: Block | undefined) => (b && (b.kind === 'ol' || b.kind === 'ul' || b.kind === 'check') ? b.items : []);

  it('as letras menos recuadas que as crases, num item: o bloco é um só, e o resto do texto continua texto', () => {
    // o texto do relato: o item 1.2, o código sem recuo, e a lista que continua embaixo
    const t = ['1. Inserir', '   1.1. Verificar', '   1.2. Inserir nova', '        ```', "INSERT INTO VersoesApp VALUES ('0.0.0')", '        ```', '', '2. Conectar', '   2.1. Abrir', '## Android', 'fim'].join('\n');
    const blocos = parseRich(t);
    // (a linha em branco entre as listas é um parágrafo vazio, como sempre)
    expect(blocos.map((b) => b.kind)).toEqual(['ol', 'p', 'ol', 'h', 'p']);
    const de1 = itens(blocos[0])[0].body!;
    expect(de1.length).toBe(1);
    const dentro = itens(de1[0]);
    expect(dentro.map((i) => plainText(i.spans.map((s) => s.text).join('')))).toEqual(['Verificar', 'Inserir nova']);
    expect(dentro[1].body).toEqual([{ kind: 'code', text: "INSERT INTO VersoesApp VALUES ('0.0.0')" }]);
    expect(itens(blocos[2])[0].body?.length).toBe(1);
    expect(plainText(t)).toContain('Android');
  });

  it('as letras recuadas de qualquer jeito ficam no bloco, com o recuo que têm além da cerca', () => {
    const body = (t: string) => code(itens(parseRich(t)[0])[0].body?.[0]);
    expect(body('- a\n  ```\n  b\n  ```')?.text).toBe('b');
    expect(body('- a\n  ```\nb\n  ```')?.text).toBe('b');
    expect(body('- a\n  ```\n b\n  ```')?.text).toBe('b');
    expect(body('- a\n  ```\n      b\n  ```')?.text).toBe('    b');
    expect(body('- a\n  ```\n\n\nb\n  ```')?.text).toBe('\n\nb');
    expect(body('- a\n  ~~~\nb\n  ~~~')?.text).toBe('b');
    expect(body('- a\n\t```\nb\n\t```')?.text).toBe('b');
    // o que tem cara de item, de título ou de tabela, dentro do bloco, é código
    expect(body('- a\n  ```\n- b\n# c\n| d |\n  ```')?.text).toBe('- b\n# c\n| d |');
  });

  it('a que fecha sem recuo também fecha, e o item continua depois dela', () => {
    const b = parseRich('- a\n  ```\nb\n```\n- c');
    expect(b.length).toBe(1);
    expect(itens(b[0]).length).toBe(2);
    expect(code(itens(b[0])[0].body?.[0])?.text).toBe('b');
  });

  it('o bloco sem a que fecha acaba no fim do item, e não engole o resto', () => {
    const b = parseRich('- a\n  ```\n  b\n- c\n\ntexto');
    expect(itens(b[0]).length).toBe(2);
    expect(code(itens(b[0])[0].body?.[0])?.text).toBe('b');
    expect(b.at(-1)?.kind).toBe('p');
    expect(plainText('- a\n  ```\n  b\n- c\n\ntexto')).toContain('texto');
  });

  it('o bloco de um item sem fechar não pega a cerca de outro bloco por cima dos itens', () => {
    const b = parseRich('1. a\n   ```\n   b\n2. c\n   ```\n   d\n   ```\n\ntexto');
    const [um, dois] = itens(b[0]);
    expect(code(um.body?.[0])?.text).toBe('b');
    expect(code(dois.body?.[0])?.text).toBe('d');
    expect(b.at(-1)?.kind).toBe('p');
  });

  it('o código com cara de lista, sem recuo, dentro de um bloco fechado, continua nele', () => {
    const b = parseRich('1. a\n   ```yaml\nitens:\n- x\n- y\n   ```\n2. b');
    expect(itens(b[0]).length).toBe(2);
    expect(code(itens(b[0])[0].body?.[0])?.text).toBe('itens:\n- x\n- y');
  });

  it('a cerca recuada fora de lista: as letras começam na coluna dela, e o bloco fica recuado', () => {
    expect(parseRich('    ```\n    a\n      b\n    ```')).toEqual([{ kind: 'code', text: 'a\n  b', indent: 4 }]);
    expect(parseRich('    ```\na\n    ```')).toEqual([{ kind: 'code', text: 'a', indent: 4 }]);
    expect(parseRich('\t```\n\ta\n\t\tb\n\t```')).toEqual([{ kind: 'code', text: 'a\n\tb', indent: 4 }]);
    expect(parseRich('```\n  a\n```')).toEqual([{ kind: 'code', text: '  a' }]);
  });

  it('o tab de dentro do código continua um tab', () => {
    expect(parseRich('```\n\ta\n```')).toEqual([{ kind: 'code', text: '\ta' }]);
    expect(code(itens(parseRich('- a\n  ```\n  \tb\n  ```')[0])[0].body?.[0])?.text).toBe('\tb');
  });

  it('"```js" dentro de um bloco não o fecha; só a cerca sozinha', () => {
    expect(parseRich('```\na\n```js\nb\n```\nc').map((b) => b.kind)).toEqual(['code', 'p']);
    expect(code(parseRich('```\na\n```js\nb\n```')[0])?.text).toBe('a\n```js\nb');
    expect(code(parseRich('````\n```\na\n```\n````')[0])?.text).toBe('```\na\n```');
    expect(code(parseRich('~~~\n```\n~~~')[0])?.text).toBe('```');
    expect(code(parseRich('```\na\n```   ')[0])?.text).toBe('a');
  });

  it('a linha com crases no meio é código na linha, e não um bloco que engole o resto', () => {
    const b = parseRich('```x``` e mais\noutra');
    expect(b.map((k) => k.kind)).toEqual(['p']);
    expect((b[0] as Extract<Block, { kind: 'p' }>).lines.length).toBe(2);
    expect(parseRich('```js title=`x`').map((k) => k.kind)).toEqual(['p']);
    // a de tis pode levar crase depois
    expect(parseRich('~~~ `x`\na\n~~~')).toEqual([{ kind: 'code', text: 'a', lang: '`x`' }]);
  });

  it('as tarefas e os links seguem as mesmas cercas', () => {
    const t = '- [ ] a\n  ```\n- [ ] não\n  ```\n- [ ] b';
    expect(checkCount(t)).toEqual({ done: 0, total: 2 });
    expect(toggleCheck(t, 2)).toBe(t);
    expect(toggleCheck(t, 4)).toBe('- [ ] a\n  ```\n- [ ] não\n  ```\n- [x] b');
  });

  it('ownerItem: as letras sem recuo dentro do bloco são do item dele, e "- x" nele não é item', () => {
    const lines = ['- a', '  ```', 'b', '- c', '  ```', '  depois', 'fora'];
    expect(ownerItem(lines, 2)).toBe(0);
    expect(ownerItem(lines, 3)).toBe(0);
    expect(ownerItem(lines, 4)).toBe(0);
    expect(ownerItem(lines, 5)).toBe(0);
    expect(ownerItem(lines, 6)).toBeNull();
    expect(bodyOf(lines, 0)).toEqual({ end: 5, indent: 2 });
  });

  it('ownerItem: a cerca recuada sem par acaba no fim do item, e o item seguinte é item', () => {
    const lines = ['- a', '  ```', '  b', '- c', '  - d'];
    expect(ownerItem(lines, 3)).toBe(3);
    expect(ownerItem(lines, 4)).toBe(4);
    expect(ownerItem(lines, 2)).toBe(0);
    // a de fora de lista, sem recuo, vai até o fim: o resto é código
    expect(ownerItem(['- a', '```', 'b', '- c'], 3)).toBeNull();
  });

  it('renumberAfter: o que está no bloco não corta a lista nem muda de número', () => {
    const lines = ['2. a', '   ```', 'INSERT', '3. x', '```', '3. b', '4. c'];
    expect(renumberAfter(lines, 0)).toEqual(lines);
    const novo = ['3. a', '   ```', 'INSERT', '3. x', '   ```', '3. b', '4. c'];
    expect(renumberAfter(novo, 0)).toEqual(['3. a', '   ```', 'INSERT', '3. x', '   ```', '4. b', '5. c']);
  });

  it('dedentCode tira as colunas, com o tab inteiro ou o que sobra dele', () => {
    expect(dedentCode('    a', 2)).toBe('  a');
    expect(dedentCode('a', 2)).toBe('a');
    expect(dedentCode('\ta', 4)).toBe('a');
    expect(dedentCode('\ta', 2)).toBe('  a');
    expect(dedentCode('  \ta', 2)).toBe('\ta');
    expect(dedentCode('\t\ta', 4)).toBe('\ta');
    expect(dedentCode('   ', 8)).toBe('');
  });

  it('fencesPair: as cercas dali para baixo se fecham todas', () => {
    expect(fencesPair([], 0)).toBeTrue();
    expect(fencesPair(['a'], 0)).toBeTrue();
    expect(fencesPair(['```', 'a', '```'], 0)).toBeTrue();
    expect(fencesPair(['```', 'a'], 0)).toBeFalse();
    expect(fencesPair(['x', '```'], 0)).toBeFalse();
    expect(fencesPair(['```', '```'], 1)).toBeFalse();
  });
});

describe('a linha do texto de cada bloco (a prévia do editor acompanha o cursor)', () => {
  it('cada bloco sabe a linha onde começa, sem mudar o que os blocos são', () => {
    const text = ['um', 'dois', '', '# Título', '> citação', '> mais', '---', '```', 'a = 1', '```', '{{contador: 2026-12-25 | Natal}}', '| a | b |', '| --- | --- |', '| 1 | 2 |', '-# sutil', 'fim'].join('\n');
    const blocks = parseRich(text);
    expect(blocks.map((b) => [b.kind, blockLine(b)])).toEqual([
      ['p', 0],
      ['h', 3],
      ['quote', 4],
      ['hr', 6],
      ['code', 7],
      ['widget', 10],
      ['table', 11],
      ['subtle', 14],
      ['p', 15],
    ]);
    // o texto corrido, as citações e o sutil seguem linha por linha a partir dela
    expect((blocks[0] as Extract<Block, { kind: 'p' }>).lines.length).toBe(3);
    expect(blocks[0]).toEqual({ kind: 'p', lines: [[{ text: 'um' }], [{ text: 'dois' }], []] });
  });

  it('o que vem embaixo de um item conta a partir da linha dele no texto todo', () => {
    const blocks = parseRich(['antes', '- item', '  descrição', '  - [ ] dentro', '- outro'].join('\n'));
    expect(blocks.map((b) => blockLine(b))).toEqual([0, 1]);
    const list = blocks[1] as Extract<Block, { kind: 'ul' }>;
    expect(list.items.map((it) => it.line)).toEqual([1, 4]);
    const body = list.items[0].body!;
    expect(body.map((b) => [b.kind, blockLine(b)])).toEqual([
      ['p', 2],
      ['check', 3],
    ]);
  });

  it('as tarefas recolhidas não perdem a linha dos outros blocos', () => {
    const blocks = parseRich(['texto', '- [x] feita', '', 'depois'].join('\n'));
    const folded = foldDone(blocks, new Set([1]));
    expect(folded.filter((b) => b.kind === 'p').map((b) => blockLine(b))).toEqual([0, 2]);
    expect(blockLine({ kind: 'hr' })).toBeNull();
  });

  it('linha longa cheia de marcas sem par não trava a leitura (cada uma lia a linha até o fim)', () => {
    // 60 mil letras: antes, cada caso levava segundos (o tempo crescia com o quadrado do tamanho)
    const n = 60_000;
    const cases = ['**a '.repeat(n / 4), '(('.repeat(n / 2), '_a '.repeat(n / 3), '||a '.repeat(n / 4), '>!a '.repeat(n / 4), '[[' + 'a'.repeat(n), 'https://' + '('.repeat(n)];
    for (const text of cases) {
      const t = performance.now();
      parseRich(text);
      hasFormatting(text);
      expect(performance.now() - t).withContext(text.slice(0, 12)).toBeLessThan(400);
    }
    // e o resultado continua o de sempre: a marca que fecha no fim vale, a sem par fica escrita
    expect(parseInline('**a '.repeat(3) + 'b**')).toEqual([{ text: 'a **a **a b', bold: true }]);
    expect(parseInline('((a ((b))')).toEqual([{ text: 'a ((b', subtle: true }]);
    expect(parseInline('((a ((b ((c')).toEqual([{ text: '((a ((b ((c' }]);
    // o "." das marcas não passa da quebra de linha U+2028
    expect(parseInline('**a \u2028b**')).toEqual([{ text: '**a \u2028b**' }]);
  });

  it('muitos pedaços inteiros numa linha (mais de 8 mil marcas escapadas) não viram outros sinais', () => {
    const many = '\\*'.repeat(9000);
    expect(parseInline(many)).toEqual([{ text: '*'.repeat(9000) }]);
    const mixed = '\\_'.repeat(8300) + ' a <= b **ok**';
    expect(parseInline(mixed)).toEqual([{ text: '_'.repeat(8300) + ' a ≤ b ' }, { text: 'ok', bold: true }]);
    // os caracteres de uso privado do próprio texto continuam como são
    let pua = '';
    for (let c = 0xe000; c <= 0xf8ff; c++) pua += String.fromCharCode(c);
    expect(parseInline(pua + ' `x` *i*')).toEqual([{ text: pua + ' ' }, { text: 'x', code: true }, { text: ' ' }, { text: 'i', italic: true }]);
  });

  it('marksAt: as marcas e a lista no cursor do Markdown (para a régua afundar os botões)', () => {
    const t = ['a **negrito _e itálico_** b', '- [ ] tarefa ~~riscada~~', '1. um'].join('\n');
    expect(marksAt(t, 5)).toEqual({ marks: ['bold'], list: null });
    expect(marksAt(t, 15)).toEqual({ marks: ['bold', 'italic'], list: null });
    // colado do lado de fora da marca não conta; do lado de dentro, sim
    expect(marksAt(t, 2).marks).toEqual([]);
    expect(marksAt(t, 23).marks).toEqual(['bold']);
    expect(marksAt(t, 25).marks).toEqual([]);
    const l2 = t.indexOf('- [ ]');
    expect(marksAt(t, l2 + 1)).toEqual({ marks: [], list: 'check' });
    expect(marksAt(t, t.indexOf('riscada') + 2)).toEqual({ marks: ['strike'], list: 'check' });
    expect(marksAt(t, t.length)).toEqual({ marks: [], list: 'ol' });
  });

  it('unwrapAt: o botão apertado tira o par da marca em volta do cursor, e só ele', () => {
    const tira = (t: string, at: number, mark: string, which: Parameters<typeof unwrapAt>[5], fim = at) => {
      const r = unwrapAt(t, at, fim, mark, mark, which);
      return r && [t.slice(0, r.from) + r.insert + t.slice(r.to), r.s];
    };
    expect(tira('a **negrito** b', 6, '**', 'bold')).toEqual(['a negrito b', 4]);
    // o negrito de fora sai, o itálico de dentro fica
    expect(tira('x **um _dois_ três** y', 9, '**', 'bold')).toEqual(['x um _dois_ três y', 7]);
    expect(tira('x **um _dois_ três** y', 9, '_', 'italic')).toEqual(['x **um dois três** y', 8]);
    // o "*" do itálico não é metade do "**"
    expect(tira('***ambos***', 5, '*', 'italic')).toEqual(['**ambos**', 4]);
    // a marca do item seguinte não conta, nem a outra linha
    expect(tira('**um** e **dois**', 13, '**', 'bold')).toEqual(['**um** e dois', 11]);
    expect(tira('- [ ] **feito**\nfora', 9, '**', 'bold')).toEqual(['- [ ] feito\nfora', 7]);
    // fora da marca, ou a seleção em duas linhas: nada
    expect(tira('a **b** c', 0, '**', 'bold')).toBeNull();
    expect(tira('**a\nb**', 2, '**', 'bold', 6)).toBeNull();
  });
});
