import { hasFormatting, hasInteractive, parseInline, parseRich, plainText, tableCells } from './rich-text';

/** As marcas novas do texto: títulos, citação, divisória, tabela, código, riscado, marca-texto e links para fora. */
describe('o markdown do texto', () => {
  it('na linha: riscado, marca-texto, código, link para fora, endereço solto e a marca escapada', () => {
    expect(parseInline('~~caro~~ e ==importante==')).toEqual([{ text: 'caro', strike: true }, { text: ' e ' }, { text: 'importante', mark: true }]);
    expect(parseInline('rode `npm test` já')).toEqual([{ text: 'rode ' }, { text: 'npm test', code: true }, { text: ' já' }]);
    // o código fica como foi escrito, sem ênfase nem link dentro
    expect(parseInline('`**x** [[y]]`')).toEqual([{ text: '**x** [[y]]', code: true }]);
    expect(parseInline('veja [o site](https://ex.com/a?b=1) agora')).toEqual([
      { text: 'veja ' },
      { text: 'o site', href: 'https://ex.com/a?b=1' },
      { text: ' agora' },
    ]);
    // o ponto final não entra no endereço solto
    expect(parseInline('em https://ex.com/x.')).toEqual([{ text: 'em ' }, { text: 'https://ex.com/x', href: 'https://ex.com/x' }, { text: '.' }]);
    expect(parseInline('2 \\* 3 \\* 4')).toEqual([{ text: '2 * 3 * 4' }]);
    // ênfases juntas
    expect(parseInline('~~**caro**~~')).toEqual([{ text: 'caro', strike: true, bold: true }]);
    expect(parseInline('**veja [isto](https://a.b)**')).toEqual([{ text: 'veja ', bold: true }, { text: 'isto', bold: true, href: 'https://a.b' }]);
    // só https, http e mailto viram link
    expect(parseInline('[x](javascript:alert(1))').some((s) => s.href)).toBeFalse();
  });

  it('em blocos: títulos, citação, divisória e código', () => {
    const blocks = parseRich('# Grande\n## Médio\n### Pequeno\n> uma\n> citação\n---\n```\nconst a = **1**;\n```\ntexto');
    expect(blocks.map((b) => b.kind)).toEqual(['h', 'h', 'h', 'quote', 'hr', 'code', 'p']);
    expect(blocks.slice(0, 3).map((b) => (b.kind === 'h' ? b.level : 0))).toEqual([1, 2, 3]);
    expect(blocks[3]).toEqual({ kind: 'quote', lines: [[{ text: 'uma' }], [{ text: 'citação' }]] });
    expect(blocks[5]).toEqual({ kind: 'code', text: 'const a = **1**;' });
    // "#1" sem espaço não é título; "* * *" é divisória, não item
    expect(parseRich('#1 lugar')[0].kind).toBe('p');
    expect(parseRich('* * *')[0].kind).toBe('hr');
  });

  it('a tabela: cabeçalho, alinhamento, a barra escapada fica na célula, e a linha curta ganha células vazias', () => {
    const [t] = parseRich('| Nome | Nota | Obs |\n| :-- | :-: | --: |\n| Hades | 9 | a \\| b |\n| Celeste | 8 |');
    if (t.kind !== 'table') throw new Error('não é tabela');
    expect(t.align).toEqual(['left', 'center', 'right']);
    expect(t.head.map((c) => c[0].text)).toEqual(['Nome', 'Nota', 'Obs']);
    expect(t.rows.map((r) => r.map((c) => c.map((s) => s.text).join('')))).toEqual([
      ['Hades', '9', 'a | b'],
      ['Celeste', '8', ''],
    ]);
    expect(tableCells('a | b')).toEqual(['a', 'b']);
    // sem a linha de traços, não é tabela
    expect(parseRich('| a | b |\n| c | d |')[0].kind).toBe('p');
  });

  it('as tarefas continuam contando a linha certa, mesmo depois de uma tabela e de um bloco de código', () => {
    const blocks = parseRich('| a |\n| -- |\n| 1 |\n```\nx\n```\n- [ ] tarefa');
    const check = blocks.at(-1)!;
    expect(check.kind === 'check' && check.items[0].line).toBe(6);
  });

  it('o que conta como formatado, o que se toca, e o texto sem as marcas', () => {
    expect(hasFormatting('só texto\ncom duas linhas')).toBeFalse();
    expect(hasFormatting('um ==destaque==')).toBeTrue();
    expect(hasFormatting('---')).toBeTrue();
    expect(hasInteractive('veja https://ex.com')).toBeTrue();
    expect(hasInteractive('só texto')).toBeFalse();
    expect(plainText('# Título\n> citação **forte**\n| a | b |\n| - - | --- |\n---\n[site](https://x.y) e `cod`')).toBe('Título\ncitação forte\n| a | b |\n| - - | --- |\nsite e cod');
    expect(plainText('| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe('A · B\n1 · 2');
  });

  it('os sinais viram setas e símbolos, menos no código, nos links e com a barra', () => {
    const line = (t: string) => parseInline(t).map((s) => s.text).join('');
    expect(line('a -> b <- c <-> d => e <=> f')).toBe('a → b ← c ↔ d ⇒ e ⇔ f');
    expect(line('x --> y <-- z ==> w <== v')).toBe('x ⟶ y ⟵ z ⟹ w ⟸ v');
    expect(line('1 != 2, 3 >= 2, 1 <= 2, 3 ~= 3, 5 +- 1')).toBe('1 ≠ 2, 3 ≥ 2, 1 ≤ 2, 3 ≈ 3, 5 ± 1');
    // no código, no link e escapado, como foi escrito; dentro das ênfases, vira
    expect(parseInline('`a -> b`')).toEqual([{ text: 'a -> b', code: true }]);
    expect(parseInline('[[A -> B]]')).toEqual([{ text: 'A -> B', link: true }]);
    expect(line('-\\> e <\\- e !\\=')).toBe('-> e <- e !=');
    expect(parseInline('**a -> b**')).toEqual([{ text: 'a → b', bold: true }]);
    expect(parseInline('==a -> b== != c')).toEqual([{ text: 'a → b', mark: true }, { text: ' ≠ c' }]);
    // o texto com seta passa a ser formatado (sem isso, a leitura mostraria o texto cru)
    expect(hasFormatting('ir -> voltar')).toBeTrue();
    expect(hasFormatting('ir -\\> voltar')).toBeFalse();
    expect(plainText('- ir -> voltar')).toBe('ir → voltar');
  });
});
