import { CODE_GRAMMARS, CODE_LANGS, CODE_THEMES, codeLangName, codeLangOf, codeLangsFor, codeLangWord, codeThemeOf, COMMON_CODE_LANGS, typedCodeLang, withCodeLang, withCodeTheme } from './code-langs';
import { codeHighlightLoaded, codeRanges, codeTokens, loadCodeHighlight } from './code-highlight';
import { colorir, hasGrammar, rangesOfHtml } from './code-highlight-lib';
import { docToText, textToDoc } from './rich-doc';
import { fenceInfo, parseRich, plainText } from './rich-text';

describe('as linguagens do bloco de código', () => {
  it('os jeitos de escrever (como no Obsidian e no GitHub) dão a linguagem, sem ligar para maiúsculas', () => {
    expect(codeLangOf('js')?.name).toBe('JavaScript');
    expect(codeLangOf('JavaScript')?.name).toBe('JavaScript');
    expect(codeLangOf('ts title="x"')?.name).toBe('TypeScript');
    expect(codeLangOf('c#')?.name).toBe('C#');
    expect(codeLangOf('html')?.id).toBe('xml');
    expect(codeLangOf('')).toBeNull();
    expect(codeLangOf('elixir')).toBeNull();
    // a etiqueta: o nome conhecido, ou a palavra escrita
    expect(codeLangName('py')).toBe('Python');
    expect(codeLangName('elixir rápido')).toBe('elixir');
    expect(codeLangName('')).toBe('');
  });

  it('nenhum jeito de escrever responde por duas; toda gramática da lista é uma que o colorir tem', () => {
    const words = CODE_LANGS.flatMap((l) => l.words);
    expect(new Set(words).size).toBe(words.length);
    for (const id of CODE_GRAMMARS) expect(hasGrammar(id)).withContext(id).toBeTrue();
    expect(hasGrammar('lua')).toBeFalse();
    expect(colorir('x', 'lua')).toEqual([]);
    expect(COMMON_CODE_LANGS.map((l) => l.name)).toContain('Python');
  });

  it('o campo do menu filtra pelo nome e pelos jeitos, os que começam com o que se escreveu primeiro', () => {
    expect(codeLangsFor('')).toBe(COMMON_CODE_LANGS);
    expect(codeLangsFor('py').map((l) => l.name)[0]).toBe('Python');
    expect(codeLangsFor('SCRIPT').map((l) => l.name)).toEqual(['JavaScript', 'TypeScript']);
    expect(codeLangsFor('nada-disso')).toEqual([]);
    // o que se escreveu vai depois das crases como uma palavra só, sem crase
    expect(typedCodeLang('  my lang ')).toBe('my');
    expect(typedCodeLang('a`b')).toBe('ab');
    // trocar a linguagem troca só a primeira palavra (o resto do que estava escrito fica); sem, nada
    expect(withCodeLang('python title=main.py', 'rust')).toBe('rust title=main.py');
    expect(withCodeLang('', 'js')).toBe('js');
    expect(withCodeLang('js x', '')).toBe('');
    // o tema fica, com a linguagem trocada ou tirada
    expect(withCodeLang('js tema=xcode', 'py')).toBe('py tema=xcode');
    expect(withCodeLang('tema=xcode', 'py')).toBe('py tema=xcode');
    expect(withCodeLang('js x tema=xcode', '')).toBe('tema=xcode');
  });

  it('o tema é escrito depois das crases, e não é a linguagem', () => {
    expect(CODE_THEMES).toEqual(['papel', 'vscode', 'dracula', 'xcode']);
    expect(codeThemeOf('')).toBeNull();
    expect(codeThemeOf('js')).toBeNull();
    expect(codeThemeOf('js tema=dracula')).toBe('dracula');
    expect(codeThemeOf('tema=xcode')).toBe('xcode');
    expect(codeThemeOf('js title=x tema=papel')).toBe('papel');
    // o que o site não conhece fica escrito e não muda nada
    expect(codeThemeOf('js tema=solarized')).toBeNull();
    expect(codeThemeOf('js sistema=dracula')).toBeNull();
    expect(codeLangWord('tema=dracula')).toBe('');
    expect(codeLangName('tema=dracula')).toBe('');
    expect(codeLangOf('tema=dracula')).toBeNull();
    expect(codeLangOf('swift tema=xcode')?.id).toBe('swift');
    expect(codeLangName('swift')).toBe('Swift');
    expect(codeLangName('dart')).toBe('Dart');
    expect(withCodeTheme('', 'dracula')).toBe('tema=dracula');
    expect(withCodeTheme('js', 'dracula')).toBe('js tema=dracula');
    expect(withCodeTheme('js tema=xcode', 'dracula')).toBe('js tema=dracula');
    expect(withCodeTheme('js tema=xcode title=x', '')).toBe('js title=x');
    expect(withCodeTheme('tema=xcode', '')).toBe('');
  });
});

describe('a linguagem no texto ("```js")', () => {
  it('o leitor guarda o que vem depois das crases; o texto do bloco não muda', () => {
    expect(fenceInfo('```js')).toBe('js');
    expect(fenceInfo('  ~~~ python  ')).toBe('python');
    expect(fenceInfo('texto')).toBe('');
    expect(parseRich('```js\nlet a\n```')).toEqual([{ kind: 'code', text: 'let a', lang: 'js' }]);
    expect(parseRich('```\nlet a\n```')).toEqual([{ kind: 'code', text: 'let a' }]);
    // o texto limpo (a cópia para fora) leva só as letras, sem as crases nem a linguagem
    expect(plainText('```js\nlet a\n```')).toBe('let a');
  });

  it('o tradutor do Visual guarda a linguagem, sai byte a byte igual e escreve a trocada', () => {
    for (const t of ['```js\nx\n```', 'a\n``` python \ny\n```\nb', '- item\n  ```ts\n  z\n  ```', '> [!nota] T\n> ```sql\n> select 1\n> ```']) {
      const d = textToDoc(t);
      expect(docToText(d).texto).withContext(t).toBe(t);
    }
    const d = textToDoc('```js\nx\n```');
    const l = d.linhas[0];
    expect(l.kind === 'codigo' && l.lingua).toBe('js');
    const trocada = { ...l, lingua: 'rust', fonte: undefined } as typeof l;
    expect(docToText({ ...d, linhas: [trocada] }).texto).toBe('```rust\nx\n```');
    const sem = { ...l, lingua: undefined, fonte: undefined } as typeof l;
    const e = docToText({ ...d, linhas: [sem] });
    expect(e.texto).toBe('```\nx\n```');
    expect(e.exato).toBeTrue();
  });
});

describe('as cores do bloco', () => {
  it('o HTML do colorir vira pedaços do texto, cada um com a tinta do nome mais de dentro', () => {
    const html = '<span class="hljs-keyword">const</span> a = <span class="hljs-string">&quot;x <span class="hljs-subst">${b}</span>&lt;&quot;</span>';
    expect(rangesOfHtml(html)).toEqual([
      { de: 0, ate: 5, c: 'tk-pal' },
      { de: 10, ate: 13, c: 'tk-txt' },
      // o de dentro do ${} volta à tinta de sempre
      { de: 17, ate: 19, c: 'tk-txt' },
    ]);
    // o sub-nome conta: "title function_" é a função; "title class_" o tipo
    expect(rangesOfHtml('<span class="hljs-title function_">f</span><span class="hljs-title class_">C</span>')).toEqual([
      { de: 0, ate: 1, c: 'tk-fun' },
      { de: 1, ate: 2, c: 'tk-tip' },
    ]);
  });

  it('cada linguagem colore com as tintas do site; o pedaço cobre o texto inteiro, letra por letra', async () => {
    await loadCodeHighlight();
    expect(codeHighlightLoaded()).toBeTrue();
    const js = 'const n = 42; // fim\nfunction f(a) { return "x"; }';
    const tokens = codeTokens(js, codeRanges(js, 'js'));
    expect(tokens.map((t) => t.t).join('')).toBe(js);
    const tinta = (palavra: string) => tokens.find((t) => t.t === palavra)?.c;
    expect(tinta('const')).toBe('tk-pal');
    // as de controle também, com a classe a mais que só o tema do VS Code pinta à parte
    expect(tinta('return')).toBe('tk-pal tk-ctl');
    expect(tinta('42')).toBe('tk-num');
    expect(tinta('// fim')).toBe('tk-com');
    expect(tinta('f')).toBe('tk-fun');
    expect(tinta('"x"')).toBe('tk-txt');
    const json = codeTokens('{"a": true}', codeRanges('{"a": true}', 'json'));
    expect(json.find((t) => t.t === '"a"')?.c).toBe('tk-atr');
    expect(json.find((t) => t.t === 'true')?.c).toBe('tk-num');
    const py = codeRanges('def soma(a, b):\n    return a + b', 'python')!;
    expect(py.some((r) => r.c === 'tk-fun')).toBeTrue();
  });

  it('sem linguagem conhecida (ou "text"), nada a colorir: o bloco fica na tinta de sempre', () => {
    expect(codeRanges('x', '')).toBeNull();
    expect(codeRanges('x', 'elixir')).toBeNull();
    expect(codeRanges('x', 'text')).toBeNull();
    expect(codeTokens('abc', null)).toEqual([{ t: 'abc', c: '' }]);
  });
});
