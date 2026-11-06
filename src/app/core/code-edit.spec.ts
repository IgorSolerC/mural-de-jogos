import { CodeOptions, CodeState, codeBackspace, codeComment, codeDeleteLines, codeDiff, codeDuplicateLines, codeEnter, codeHome, codeMoveLines, codeTab, indentUnit } from './code-edit';

/** O texto com o cursor em "|" (ou a seleção entre dois "|"). */
function at(marked: string): CodeState {
  const from = marked.indexOf('|');
  const second = marked.indexOf('|', from + 1);
  const text = marked.replace(/\|/g, '');
  return { text, from, to: second < 0 ? from : second - 1 };
}

/** O estado escrito do mesmo jeito, para comparar. */
function show(s: CodeState | null): string | null {
  if (!s) return null;
  return s.from === s.to ? s.text.slice(0, s.from) + '|' + s.text.slice(s.from) : s.text.slice(0, s.from) + '|' + s.text.slice(s.from, s.to) + '|' + s.text.slice(s.to);
}

const tab = (m: string, o?: CodeOptions) => show(codeTab(at(m), 1, o));
const untab = (m: string, o?: CodeOptions) => show(codeTab(at(m), -1, o));
const enter = (m: string, o?: CodeOptions) => show(codeEnter(at(m), o));
const back = (m: string, o?: CodeOptions) => show(codeBackspace(at(m), o));

describe('core/code-edit: as teclas do bloco de código', () => {
  describe('o recuo do bloco', () => {
    it('sem recuo nenhum, 2 espaços; segue o que o bloco já usa', () => {
      expect(indentUnit('')).toBe('  ');
      expect(indentUnit('a\nb')).toBe('  ');
      expect(indentUnit('a\n  b\n    c')).toBe('  ');
      expect(indentUnit('a\n    b\n        c')).toBe('    ');
      expect(indentUnit('a\n\tb')).toBe('\t');
      // um espaço só, ou 3, não são recuo de ninguém
      expect(indentUnit('a\n b')).toBe('  ');
      expect(indentUnit('a\n   b')).toBe('  ');
      // a linha só de espaços não conta
      expect(indentUnit('a\n    \n  b')).toBe('  ');
    });

    it('a margem não é do código', () => {
      expect(indentUnit('        a\n          b', '        ')).toBe('  ');
      expect(indentUnit('> a\n>     b', '> ')).toBe('    ');
    });
  });

  describe('Tab', () => {
    it('vai até a próxima parada, de qualquer coluna', () => {
      expect(tab('|')).toBe('  |');
      expect(tab(' |x')).toBe('  |x');
      expect(tab('  |x')).toBe('    |x');
      expect(tab('abc|')).toBe('abc |');
      expect(tab('ab|c')).toBe('ab  |c');
    });

    it('no bloco com tabs, um tab; no de 4, a parada de 4', () => {
      expect(tab('a\n\tb|')).toBe('a\n\tb\t|');
      expect(tab('a\n    b\n|')).toBe('a\n    b\n    |');
      expect(tab('a\n    b\n  |')).toBe('a\n    b\n    |');
    });

    it('com letras selecionadas, a linha inteira entra, sem trocar as letras', () => {
      expect(tab('fo|o b|ar')).toBe('  fo|o b|ar');
    });

    it('com várias linhas, todas entram (a em branco não), e a seleção continua nelas', () => {
      expect(tab('|a\n\nb|')).toBe('|  a\n\n  b|');
      expect(tab('x|a\nb|c')).toBe('  x|a\n  b|c');
    });

    it('a seleção que acaba no começo de uma linha não pega essa linha', () => {
      expect(tab('|a\n|b')).toBe('|  a\n|b');
    });

    it('com a margem, o recuo entra depois dela, e a parada conta a partir dela', () => {
      expect(tab('> |x', { margin: '> ' })).toBe('>   |x');
      expect(tab('|> x', { margin: '> ' })).toBe('>   |x');
      expect(tab('> a|b\n> c|d', { margin: '> ' })).toBe('>   a|b\n>   c|d');
    });

    it('a linha sem a margem (as letras menos recuadas que a cerca) recebe o recuo do mesmo jeito', () => {
      expect(tab('|a\n    b|', { margin: '    ' })).toBe('|  a\n      b|');
    });
  });

  describe('Shift+Tab', () => {
    it('volta até a parada de antes', () => {
      expect(untab('a\n  b\n    x|')).toBe('a\n  b\n  x|');
      expect(untab('a\n    x|')).toBe('a\nx|');
      expect(untab('   x|')).toBe('  x|');
      expect(untab(' x|')).toBe('x|');
    });

    it('tira o tab da frente', () => {
      expect(untab('\t\tx|')).toBe('\tx|');
      expect(untab('\tx|')).toBe('x|');
    });

    it('sem nada para tirar, o texto fica igual (e a tecla continua no bloco)', () => {
      expect(untab('x|')).toBe('x|');
      expect(untab('|')).toBe('|');
    });

    it('o cursor no meio do que sai fica onde o recuo acaba', () => {
      expect(untab('a\n  b\n |   x')).toBe('a\n  b\n|  x');
    });

    it('com várias linhas, cada uma volta a sua parte', () => {
      expect(untab('|  a\n    b\nc|')).toBe('|a\n  b\nc|');
    });

    it('o que Tab fez, Shift+Tab desfaz', () => {
      for (const m of ['|a\nb|', 'x|a\n  b|']) {
        const ida = codeTab(at(m), 1);
        expect(show(codeTab(ida, -1))).toBe(m);
      }
    });

    it('não entra na margem', () => {
      expect(untab('>   x|', { margin: '> ' })).toBe('> x|');
      expect(untab('> x|', { margin: '> ' })).toBe('> x|');
      expect(untab('        x|', { margin: '        ' })).toBe('        x|');
    });
  });

  describe('Enter', () => {
    it('a linha nova com o recuo da de cima', () => {
      expect(enter('x|')).toBe('x\n|');
      expect(enter('    x|')).toBe('    x\n    |');
      expect(enter('\tx|')).toBe('\tx\n\t|');
    });

    it('no meio da linha, o que vem depois desce', () => {
      expect(enter('  ab|cd')).toBe('  ab\n  |cd');
    });

    it('com seleção, ela sai', () => {
      expect(enter('  a|bc|d')).toBe('  a\n  |d');
    });

    it('a linha só de recuo não fica com ele', () => {
      expect(enter('a\n    |')).toBe('a\n\n    |');
    });

    it('no meio do recuo, a linha nova fica com o que vem antes do cursor', () => {
      expect(enter('  |  x')).toBe('  \n  |  x');
    });

    it('depois de "{", "[" e "(" entra um nível', () => {
      expect(enter('if (x) {|')).toBe('if (x) {\n  |');
      expect(enter('  a = [|')).toBe('  a = [\n    |');
      expect(enter('f(  |')).toBe('f(  \n  |');
    });

    it('entre o par, o fecho desce para a linha dele', () => {
      expect(enter('f() {|}')).toBe('f() {\n  |\n}');
      expect(enter('  a(|)')).toBe('  a(\n    |\n  )');
    });

    it('o ":" abre recuo só em Python e YAML', () => {
      expect(enter('def f():|', { lang: 'python' })).toBe('def f():\n  |');
      expect(enter('a:|', { lang: 'yaml' })).toBe('a:\n  |');
      expect(enter('case 1:|', { lang: 'js' })).toBe('case 1:\n|');
      expect(enter('a:|')).toBe('a:\n|');
    });

    it('com a margem, ela vai junto', () => {
      expect(enter('>   x|', { margin: '> ' })).toBe('>   x\n>   |');
      expect(enter('    x|', { margin: '    ' })).toBe('    x\n    |');
    });

    it('a linha sem a margem continua sem ela', () => {
      expect(enter('INSERT|', { margin: '        ' })).toBe('INSERT\n|');
    });

    it('"> " do código não é a margem de ninguém: sem margem, fica fora do recuo', () => {
      expect(enter('> x|')).toBe('> x\n|');
    });
  });

  describe('Backspace', () => {
    it('no recuo, volta uma parada', () => {
      expect(back('a\n  b\n    |x')).toBe('a\n  b\n  |x');
      expect(back('   |x')).toBe('  |x');
      expect(back('  |')).toBe('|');
      expect(back('\t|x')).toBe('|x');
    });

    it('fora do recuo, a tecla é a de sempre', () => {
      expect(back('a|')).toBeNull();
      expect(back('a  |')).toBeNull();
      expect(back('|a')).toBeNull();
      expect(back('|')).toBeNull();
      expect(back('|a|')).toBeNull();
    });

    it('não entra na margem', () => {
      expect(back('> |x', { margin: '> ' })).toBeNull();
      expect(back('>   |x', { margin: '> ' })).toBe('> |x');
    });

    it('no bloco de 4, a parada de 4', () => {
      expect(back('a\n    b\n    |')).toBe('a\n    b\n|');
    });
  });

  describe('as linhas inteiras', () => {
    it('Alt+seta move a linha, com o cursor nela', () => {
      expect(show(codeMoveLines(at('a\nb|b\nc'), -1))).toBe('b|b\na\nc');
      expect(show(codeMoveLines(at('a\nb|b\nc'), 1))).toBe('a\nc\nb|b');
    });

    it('move as linhas da seleção juntas', () => {
      expect(show(codeMoveLines(at('a\n|b\nc|\nd'), 1))).toBe('a\nd\n|b\nc|');
      expect(show(codeMoveLines(at('a\n|b\nc|\nd'), -1))).toBe('|b\nc|\na\nd');
    });

    it('na ponta, não move', () => {
      expect(codeMoveLines(at('a|\nb'), -1)).toBeNull();
      expect(codeMoveLines(at('a\nb|'), 1)).toBeNull();
    });

    it('subir e descer volta ao que era', () => {
      const m = 'x\ny|y\nz';
      expect(show(codeMoveLines(codeMoveLines(at(m), 1)!, -1))).toBe(m);
    });

    it('Shift+Alt+seta duplica; para baixo, o cursor vai para a cópia', () => {
      expect(show(codeDuplicateLines(at('a|b\nc'), 1))).toBe('ab\na|b\nc');
      expect(show(codeDuplicateLines(at('a|b\nc'), -1))).toBe('a|b\nab\nc');
      expect(show(codeDuplicateLines(at('|a\nb|'), 1))).toBe('a\nb\n|a\nb|');
    });

    it('Ctrl+Shift+K apaga a linha, e o cursor fica na mesma coluna da que sobe', () => {
      expect(show(codeDeleteLines(at('a\nbb|b\ncccc')))).toBe('a\ncc|cc');
      expect(show(codeDeleteLines(at('a\nbb|b')))).toBe('a|');
      expect(show(codeDeleteLines(at('a|')))).toBe('|');
      expect(show(codeDeleteLines(at('|a\nb|\nc')))).toBe('|c');
    });
  });

  describe('comentar', () => {
    const js = { lang: 'js' };

    it('põe e tira, na coluna do menor recuo', () => {
      expect(show(codeComment(at('  a|'), js))).toBe('  // a|');
      expect(show(codeComment(at('  // a|'), js))).toBe('  a|');
      expect(show(codeComment(at('|  a\n    b|'), js))).toBe('|  // a\n  //   b|');
    });

    it('a linha em branco fica como está', () => {
      expect(show(codeComment(at('|a\n\nb|'), js))).toBe('|// a\n\n// b|');
    });

    it('parte comentada: comenta todas', () => {
      expect(show(codeComment(at('|// a\nb|'), js))).toBe('|// // a\n// b|');
    });

    it('sem o espaço depois da marca também tira', () => {
      expect(show(codeComment(at('//a|'), js))).toBe('a|');
    });

    it('cada linguagem do jeito dela', () => {
      expect(show(codeComment(at('x|'), { lang: 'python' }))).toBe('# x|');
      expect(show(codeComment(at('x|'), { lang: 'sql' }))).toBe('-- x|');
      expect(show(codeComment(at('x|'), { lang: 'swift' }))).toBe('// x|');
      expect(show(codeComment(at('x|'), { lang: 'css' }))).toBe('/* x */|');
      expect(show(codeComment(at('/* x */|'), { lang: 'css' }))).toBe('x|');
      expect(show(codeComment(at('x|'), { lang: 'html' }))).toBe('<!-- x -->|');
      expect(show(codeComment(at('/* */|'), { lang: 'css' }))).toBe('|');
    });

    it('sem saber comentar, a tecla não é dele', () => {
      expect(codeComment(at('x|'))).toBeNull();
      expect(codeComment(at('x|'), { lang: 'json' })).toBeNull();
      expect(codeComment(at('x|'), { lang: 'elixir' })).toBeNull();
    });

    it('só linhas em branco: nada muda', () => {
      expect(show(codeComment(at('|'), js))).toBe('|');
    });
  });

  describe('Home', () => {
    it('vai ao começo das letras, e de novo ao começo da linha', () => {
      expect(codeHome('    abc', 6)).toBe(4);
      expect(codeHome('    abc', 4)).toBe(0);
      expect(codeHome('    abc', 0)).toBe(4);
      expect(codeHome('a\n  b', 5)).toBe(4);
    });

    it('a margem não conta', () => {
      expect(codeHome('>   x', 5, '> ')).toBe(4);
      expect(codeHome('>   x', 4, '> ')).toBe(2);
    });
  });

  describe('a troca mínima', () => {
    it('acha só o que mudou', () => {
      expect(codeDiff('abc', 'abc')).toEqual({ de: 3, ate: 3, ins: '' });
      expect(codeDiff('abc', 'axc')).toEqual({ de: 1, ate: 2, ins: 'x' });
      expect(codeDiff('abc', 'abxc')).toEqual({ de: 2, ate: 2, ins: 'x' });
      expect(codeDiff('abxc', 'abc')).toEqual({ de: 2, ate: 3, ins: '' });
      expect(codeDiff('', 'a')).toEqual({ de: 0, ate: 0, ins: 'a' });
      expect(codeDiff('aaa', 'aa')).toEqual({ de: 2, ate: 3, ins: '' });
    });
  });

  it('nenhuma tecla fica presa com textos aleatórios: a seleção cai sempre dentro do texto', () => {
    // a semente fixa: um gerador pequeno, para o erro poder ser repetido
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    const pieces = ['a', ' ', '  ', '\t', '\n', '{', '}', '(', ')', ':', '> ', '//'];
    for (let round = 0; round < 500; round++) {
      let text = '';
      for (let k = rnd(14); k >= 0; k--) text += pieces[rnd(pieces.length)];
      let from = rnd(text.length + 1);
      let to = rnd(3) ? from : from + rnd(text.length - from + 1);
      const o: CodeOptions = { margin: rnd(2) ? '> ' : '', lang: rnd(2) ? 'js' : '' };
      const steps: ((s: CodeState) => CodeState | null)[] = [
        (s) => codeTab(s, 1, o),
        (s) => codeTab(s, -1, o),
        (s) => codeEnter(s, o),
        (s) => codeBackspace(s, o),
        (s) => codeMoveLines(s, 1),
        (s) => codeMoveLines(s, -1),
        (s) => codeDuplicateLines(s, 1),
        (s) => codeDeleteLines(s),
        (s) => codeComment(s, o),
      ];
      let s: CodeState = { text, from, to };
      for (let k = 0; k < 6; k++) {
        const next = steps[rnd(steps.length)](s);
        if (!next) continue;
        expect(next.from).withContext(JSON.stringify([s, k])).toBeGreaterThanOrEqual(0);
        expect(next.to).withContext(JSON.stringify([s, k])).toBeGreaterThanOrEqual(next.from);
        expect(next.to).withContext(JSON.stringify([s, k])).toBeLessThanOrEqual(next.text.length);
        const d = codeDiff(s.text, next.text);
        expect(s.text.slice(0, d.de) + d.ins + s.text.slice(d.ate)).toBe(next.text);
        s = next;
      }
      from = s.from;
      to = s.to;
    }
  });
});
