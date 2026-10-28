import { copyText, parseRich, plainText, tableBlockAt } from './rich-text';
import { DEFAULT_TABLE_LOOK, TABLE_LOOKS, emptyTable, parseTableText, pastedGrid, readTable, tableIsEmpty, tableLookOf, tableLookWord, tableText, writeTable } from './tables';
import { widgetDef, widgetLines } from './widgets';

describe('a tabela como dados (core/tables.ts)', () => {
  it('lê o markdown: as células como foram escritas, o alinhamento, e cada linha com as colunas do cabeçalho', () => {
    const t = readTable(['| Dia | Lugar | Custo |', '| --- | :---: | ---: |', '| Seg | **Belém** | 18 € |', '| Ter | a \\| b |', '| Qua | x | y | sobra |']);
    expect(t.head).toEqual(['Dia', 'Lugar', 'Custo']);
    expect(t.align).toEqual([null, 'center', 'right']);
    expect(t.rows).toEqual([
      ['Seg', '**Belém**', '18 €'],
      ['Ter', 'a \\| b', ''],
      ['Qua', 'x', 'y'],
    ]);
    // o que não é tabela vira uma tabela vazia de uma coluna (a folha começa dali)
    expect(readTable(['só texto'])).toEqual({ head: [''], rows: [], align: [null] });
  });

  it('escreve de volta: uma linha por linha, o "|" escapado uma vez só, sem quebra de linha na célula', () => {
    const lines = writeTable({ head: ['Nome', 'Nota'], rows: [['a | b', 'x\\|y'], ['várias\nlinhas', '']], align: ['left', 'right'] });
    expect(lines).toEqual(['| Nome | Nota |', '| :--- | ---: |', '| a \\| b | x\\|y |', '| várias linhas |  |']);
    // ida e volta: o mesmo
    expect(readTable(lines)).toEqual({ head: ['Nome', 'Nota'], rows: [['a \\| b', 'x\\|y'], ['várias linhas', '']], align: ['left', 'right'] });
    expect(parseTableText(tableText(emptyTable(2, 1)))).toEqual(emptyTable(2, 1));
  });

  it('a tabela vazia, e a que tem alguma coisa escrita', () => {
    expect(emptyTable()).toEqual({ head: ['', '', ''], rows: [['', '', ''], ['', '', '']], align: [null, null, null] });
    expect(tableIsEmpty(emptyTable())).toBeTrue();
    expect(tableIsEmpty({ ...emptyTable(), head: ['', 'x', ''] })).toBeFalse();
    expect(tableIsEmpty({ head: [' '], rows: [['  ']], align: [null] })).toBeTrue();
  });

  it('os jeitos: cinco, a branca de sempre, e os nomes escritos à mão', () => {
    expect(TABLE_LOOKS.map((l) => l.value)).toEqual(['branca', 'listrada', 'quadriculada', 'caneta', 'recibo']);
    expect(DEFAULT_TABLE_LOOK).toBe('branca');
    expect(tableLookWord('Zebra')).toBe('listrada');
    expect(tableLookWord(' CADERNO ')).toBe('quadriculada');
    expect(tableLookWord('cupom')).toBe('recibo');
    expect(tableLookWord('constructor')).toBeNull();
    expect(tableLookOf(['nada', 'caneta'])).toBe('caneta');
    expect(tableLookOf([])).toBe('branca');
  });

  it('o colado de uma planilha: linhas por quebra, células por tab; sem tab, não é planilha', () => {
    expect(pastedGrid('a\tb\r\nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(pastedGrid('só uma célula')).toBeNull();
  });
});

describe('a tabela como widget no texto', () => {
  const T = '| A | B |\n| --- | --- |\n| 1 | 2 |';

  it('a marca do jeito em cima vira o jeito da tabela; sem ela, nenhum (a branca)', () => {
    const [marked] = parseRich('{{tabela: listrada}}\n' + T);
    expect(marked.kind === 'table' && marked.look).toBe('listrada');
    const [plain] = parseRich(T);
    expect(plain.kind === 'table' && plain.look).toBeUndefined();
    // a marca sem tabela embaixo fica como texto
    const [alone] = parseRich('{{tabela: listrada}}\nsó texto');
    expect(alone.kind).toBe('p');
    // a do jeito de sempre escrita também vale
    const [branca] = parseRich('{{tabela}}\n' + T);
    expect(branca.kind === 'table' && branca.look).toBe('branca');
  });

  it('a marca não aparece no texto sem marcas nem na cópia; a tabela, sim', () => {
    expect(plainText('{{tabela: recibo}}\n' + T)).toBe('A · B\n1 · 2');
    expect(copyText('{{tabela: recibo}}\n' + T, { now: 0 })).toBe('A · B\n1 · 2');
  });

  it('onde está a tabela de uma linha do texto: da marca à última linha, também embaixo de um item', () => {
    const text = 'antes\n{{tabela: caneta}}\n' + T + '\ndepois\n- item\n  ' + T.replace(/\n/g, '\n  ');
    expect(tableBlockAt(text, 0)).toBeNull();
    expect(tableBlockAt(text, 1)).toEqual({ from: 1, to: 4, look: 'caneta' });
    expect(tableBlockAt(text, 4)).toEqual({ from: 1, to: 4, look: 'caneta' });
    expect(tableBlockAt(text, 5)).toBeNull();
    expect(tableBlockAt(text, 8)).toEqual({ from: 7, to: 9, look: null });
  });

  it('a folha escreve a marca só quando o jeito não é o de sempre, e nada sai de uma tabela vazia', () => {
    const def = widgetDef('tabela')!;
    const table = tableText(readTable(T.split('\n')));
    expect(def.write({ table, look: 'branca' })).toEqual([]);
    expect(def.write({ table, look: 'recibo' })).toEqual(['recibo']);
    expect(def.write({ table: tableText(emptyTable()), look: 'recibo' })).toBeNull();
    expect(widgetLines('tabela', [], 'medio', def.body!({ table }))).toEqual(T.split('\n'));
    expect(widgetLines('tabela', ['recibo'], 'medio', def.body!({ table }))).toEqual(['{{tabela: recibo}}', ...T.split('\n')]);
    // os outros widgets continuam numa linha só
    expect(widgetLines('contador', ['25/12', 'Natal'], 'grande')).toEqual(['{{contador: 25/12 | Natal | grande}}']);
    expect(def.summary!({ table, look: 'quadriculada' })).toBe('2 colunas, 2 linhas · Quadriculada');
    expect(def.unsized).toBeTrue();
  });
});
