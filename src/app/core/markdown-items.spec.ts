import { Block, bodyIndent, checkCount, foldDone, hasFormatting, hasInteractive, hasSpoiler, itemEnd, linkAt, ownerItem, parseInline, parseRich, plainText, snapshotDone, toggleCheck } from './rich-text';

/** Os blocos em resumo: o tipo, e nas listas cada item com a linha, o texto, a marca e o que vem embaixo. */
type Shape = unknown[];
function shape(blocks: readonly Block[]): Shape {
  return blocks.map((b) => {
    switch (b.kind) {
      case 'ul':
      case 'ol':
      case 'check':
        return [b.kind, b.items.map((it) => [it.line, it.spans.map((s) => s.text).join(''), ...(it.done !== undefined ? [it.done] : []), ...(it.body ? [shape(it.body)] : [])])];
      case 'p':
        return ['p', b.lines.map((l) => l.map((s) => s.text).join(''))];
      case 'widget':
        return ['widget', b.name, b.size];
      case 'code':
        return ['code', b.text];
      case 'h':
        return ['h', b.level];
      default:
        return [b.kind];
    }
  });
}

/** O que vem embaixo de um item: as linhas recuadas são dele, como no markdown. */
describe('o item com corpo (as linhas recuadas embaixo dele)', () => {
  it('a lista de compras do exemplo: cada tarefa com a descrição, e a última com a foto', () => {
    const text = [
      '- [ ] **Cola de Quebra Cabeça**:',
      '      **Descrição**: Escolher entre Fosca e Brilhante',
      '- [ ] **Novas Panelas**',
      '      **Descrição**: provavelmente de fundo triplo',
      '- [x] **Mandolin**',
      '      **Descrição**: Adaptável',
      '      {{imagem: https://ex.com/m.jpg | recorte | pequeno}}',
      '',
      'depois',
    ].join('\n');
    expect(shape(parseRich(text))).toEqual([
      [
        'check',
        [
          [0, 'Cola de Quebra Cabeça:', false, [['p', ['Descrição: Escolher entre Fosca e Brilhante']]]],
          [2, 'Novas Panelas', false, [['p', ['Descrição: provavelmente de fundo triplo']]]],
          [4, 'Mandolin', true, [['p', ['Descrição: Adaptável']], ['widget', 'imagem', 'pequeno']]],
        ],
      ],
      ['p', ['', 'depois']],
    ]);
    // a descrição continua com as marcas dela
    const [list] = parseRich(text);
    if (list.kind !== 'check') throw new Error('não é checklist');
    const desc = list.items[0].body![0];
    expect(desc.kind === 'p' && desc.lines[0][0]).toEqual({ text: 'Descrição', bold: true });
  });

  it('dois espaços já bastam, o tab também; com um espaço só, ou sem recuo, a linha é texto solto', () => {
    expect(shape(parseRich('- a\n  um'))).toEqual([['ul', [[0, 'a', [['p', ['um']]]]]]]);
    expect(shape(parseRich('- a\n\tum'))).toEqual([['ul', [[0, 'a', [['p', ['um']]]]]]]);
    expect(shape(parseRich('- a\n um'))).toEqual([['ul', [[0, 'a']]], ['p', [' um']]]);
    expect(shape(parseRich('- a\num'))).toEqual([['ul', [[0, 'a']]], ['p', ['um']]]);
    // o recuo conta a partir do item: o item recuado precisa de mais
    expect(shape(parseRich('  - a\n  b'))).toEqual([['ul', [[0, 'a']]], ['p', ['  b']]]);
    // e o numerado também tem corpo, sem parar a contagem
    expect(shape(parseRich('1. a\n   desc\n2. b'))).toEqual([['ol', [[0, 'a', [['p', ['desc']]]], [2, 'b']]]]);
  });

  it('a linha em branco fica no corpo se a de baixo continua recuada; senão, termina o item', () => {
    expect(shape(parseRich('- [ ] a\n  um\n\n  dois\n- [ ] b'))).toEqual([['check', [[0, 'a', false, [['p', ['um', '', 'dois']]]], [4, 'b', false]]]]);
    expect(shape(parseRich('- [ ] a\n  um\n\ntexto'))).toEqual([['check', [[0, 'a', false, [['p', ['um']]]]]], ['p', ['', 'texto']]]);
  });

  it('a lista recuada vira a lista de dentro, com as linhas certas para marcar', () => {
    const text = '- [ ] mala\n  - [x] roupa\n  - [ ] escova\n- [ ] passagem';
    expect(shape(parseRich(text))).toEqual([['check', [[0, 'mala', false, [['check', [[1, 'roupa', true], [2, 'escova', false]]]]], [3, 'passagem', false]]]]);
    expect(checkCount(text)).toEqual({ done: 1, total: 4 });
    expect(toggleCheck(text, 2)).toBe('- [ ] mala\n  - [x] roupa\n  - [x] escova\n- [ ] passagem');
  });

  it('o código, a tabela e o título também podem ir embaixo do item', () => {
    expect(shape(parseRich('- a\n  ```\n  x = 1\n  ```\nfim'))).toEqual([['ul', [[0, 'a', [['code', 'x = 1']]]]], ['p', ['fim']]]);
    expect(shape(parseRich('- a\n  ## Sub\n  | x | y |\n  | - | - |\n  | 1 | 2 |'))).toEqual([['ul', [[0, 'a', [['h', 2], ['table']]]]]]);
  });

  it('o texto sem marcas põe o corpo logo depois do item; spoiler e formatação contam lá dentro', () => {
    expect(plainText('- [ ] a\n  desc ||segredo||\n- b')).toBe('a\ndesc [spoiler]\nb');
    expect(hasSpoiler('- a\n  ||x||')).toBeTrue();
    expect(hasFormatting('- a\n  b')).toBeTrue();
  });

  it('as feitas recolhidas levam o corpo junto', () => {
    const text = '- [x] feita\n  desc\n- [ ] por fazer\n  outra';
    const blocks = foldDone(parseRich(text), snapshotDone(text).lines);
    expect(shape(blocks)).toEqual([['check', [[2, 'por fazer', false, [['p', ['outra']]]]]]]);
    expect(blocks[0].kind === 'check' && blocks[0].folded).toBe(1);
  });

  it('de quem é a linha (para o editor): o item, a descrição dele, a linha só de espaços aberta embaixo', () => {
    const lines = ['- [ ] a', '      desc', '      ', 'solto', '1. b', '   x'];
    expect(ownerItem(lines, 0)).toBe(0);
    expect(ownerItem(lines, 1)).toBe(0);
    expect(ownerItem(lines, 2)).toBe(0);
    expect(ownerItem(lines, 3)).toBeNull();
    expect(ownerItem(lines, 5)).toBe(4);
    expect(ownerItem(['texto', '  recuado'], 1)).toBeNull();
    // a linha nova continua na coluna do texto do item, ou no recuo da descrição
    expect(bodyIndent(lines, 0)).toBe('      ');
    expect(bodyIndent(lines, 1)).toBe('      ');
    expect(bodyIndent(lines, 4)).toBe('   ');
    expect(bodyIndent(['  * x'], 0)).toBe('    ');
    expect(bodyIndent(lines, 3)).toBeNull();
    expect(itemEnd(lines, 0)).toBe(1);
    expect(itemEnd(lines, 4)).toBe(5);
    expect(itemEnd(['- a', '- b'], 0)).toBe(0);
  });
});

/** O que o markdown de verdade faz e o daqui não fazia (achados testando, consertados). */
describe('o markdown como o de verdade', () => {
  const flat = (t: string) => parseInline(t).map((s) => [s.text, ...Object.keys(s).filter((k) => k !== 'text')]);

  it('__negrito__ e ___os dois___; o "_" dentro da palavra fica', () => {
    expect(parseInline('__negrito__ ok')).toEqual([{ text: 'negrito', bold: true }, { text: ' ok' }]);
    expect(parseInline('___os dois___')).toEqual([{ text: 'os dois', bold: true, italic: true }]);
    expect(parseInline('a__b__c e snake_case_name')).toEqual([{ text: 'a__b__c e snake_case_name' }]);
    expect(parseInline('_a_b_')).toEqual([{ text: 'a_b', italic: true }]);
  });

  it('o itálico com negrito dentro, e o negrito que termina num itálico', () => {
    expect(flat('*um **dois** três*')).toEqual([['um ', 'italic'], ['dois', 'italic', 'bold'], [' três', 'italic']]);
    expect(flat('**muito *bom***')).toEqual([['muito ', 'bold'], ['bom', 'bold', 'italic']]);
    expect(flat('*foo**bar*')).toEqual([['foo**bar', 'italic']]);
    expect(flat('*a* e **b**')).toEqual([['a', 'italic'], [' e '], ['b', 'bold']]);
  });

  it('endereços: com parênteses (Wikipédia), entre <>, com título e o www. solto', () => {
    expect(parseInline('[a](https://x.com/a_(b))')).toEqual([{ text: 'a', href: 'https://x.com/a_(b)' }]);
    expect(parseInline('https://pt.wikipedia.org/wiki/Hades_(jogo)')).toEqual([{ text: 'https://pt.wikipedia.org/wiki/Hades_(jogo)', href: 'https://pt.wikipedia.org/wiki/Hades_(jogo)' }]);
    // o parêntese de fora não entra
    expect(parseInline('(veja https://a.com)')).toEqual([{ text: '(veja ' }, { text: 'https://a.com', href: 'https://a.com' }, { text: ')' }]);
    expect(parseInline('<https://a.com>')).toEqual([{ text: 'https://a.com', href: 'https://a.com' }]);
    expect(parseInline('ver [aqui](https://a.b "o título")')).toEqual([{ text: 'ver ' }, { text: 'aqui', href: 'https://a.b' }]);
    expect(parseInline('em www.site.com.br/x.')).toEqual([{ text: 'em ' }, { text: 'www.site.com.br/x', href: 'https://www.site.com.br/x' }, { text: '.' }]);
    expect(parseInline('a@www.x.com')).toEqual([{ text: 'a@www.x.com' }]);
    expect(hasInteractive('em www.site.com')).toBeTrue();
    expect(hasInteractive('<https://a.com>')).toBeTrue();
    expect(linkAt('ver <https://a.com> ok', 6)).toEqual({ kind: 'url', start: 4, end: 19, text: '', href: 'https://a.com' });
  });

  it('o código entre duas crases pode ter uma dentro', () => {
    expect(parseInline('``a ` b``')).toEqual([{ text: 'a ` b', code: true }]);
    expect(parseInline('`` `x` ``')).toEqual([{ text: '`x`', code: true }]);
    expect(parseInline('``a`')).toEqual([{ text: '``a`' }]);
  });

  it('a barra antes de qualquer sinal o escreve como é', () => {
    expect(parseRich('1\\. não é lista')[0].kind).toBe('p');
    expect(parseInline('1\\. não é lista')).toEqual([{ text: '1. não é lista' }]);
    expect(parseInline('\\{{contador}} e \\+ e \\(x\\)')).toEqual([{ text: '{{contador}} e + e (x)' }]);
    // uma barra antes de letra fica (os caminhos do Windows)
    expect(parseInline('C:\\Users\\pasta')).toEqual([{ text: 'C:\\Users\\pasta' }]);
  });

  it('em blocos: "+ item", títulos do quarto ao sexto, "#" no fim do título e a cerca de tis', () => {
    expect(shape(parseRich('+ mais'))).toEqual([['ul', [[0, 'mais']]]]);
    expect(shape(parseRich('#### Quatro\n###### Seis\n## Dois ##'))).toEqual([['h', 3], ['h', 3], ['h', 2]]);
    expect(parseRich('## Dois ##')[0]).toEqual({ kind: 'h', level: 2, spans: [{ text: 'Dois' }] });
    expect(shape(parseRich('~~~\nx\n```\ny\n~~~\nfim'))).toEqual([['code', 'x\n```\ny'], ['p', ['fim']]]);
    expect(shape(parseRich('````\na\n```\n````'))).toEqual([['code', 'a\n```']]);
    // a tarefa depois da cerca de tis conta a linha certa
    expect(checkCount('~~~\n- [ ] não\n~~~\n- [x] sim')).toEqual({ done: 1, total: 1 });
  });
});
