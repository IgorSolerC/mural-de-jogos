import { PDF_BLOCK_SAMPLES, PDF_SPAN_SAMPLES, PDF_WIDGET_SAMPLES, pdfSampleText } from '../ui/pdf-sheet.samples';
import { Doc, LinhaDoc, alinhar, chave, docToText, normalizarLinha, posicaoNoDoc, posicaoNoTexto, textToDoc, textoVisivel } from './rich-doc';
import { Block, Span, parseRich } from './rich-text';
import { WIDGETS } from './widgets';

/** As linhas do documento sem a fonte: como se cada uma tivesse sido escrita agora. */
const semFonte = (d: Doc): Doc => ({ ...d, linhas: d.linhas.map(({ fonte: _, ...l }) => l as LinhaDoc) });
const linha = (spans: Span[], recuo = 0): LinhaDoc => ({ kind: 'linha', recuo, spans });
const escrever = (...linhas: LinhaDoc[]) => docToText({ linhas, quebra: '\n' });

/**
 * A REGRA DO VISUAL: cada bloco do leitor tem aqui uma amostra que o Visual lê como linhas (não como
 * trecho cru) e escreve de volta igual. Os tipos obrigam: um bloco novo em core/rich-text.ts não compila
 * até ganhar a dele.
 */
const AMOSTRAS: Record<Block['kind'], string> = {
  p: 'Texto corrido\n  com recuo\n\ne linha em branco',
  ul: '- um\n* dois\n+ três\n• quatro\n  - de dentro',
  ol: '1. um\n2. dois\n   2.1. de dentro\n3) três\n1. 1. 1.',
  check: '- [ ] por fazer\n- [x] feita\n- [X] feita também\n  com a descrição\n\n  e mais uma linha',
  h: '# Um\n## Dois\n### Três\n#### Quatro ##',
  quote: '> citação\n>  com dois espaços',
  subtle: '-# sutil\n-#',
  hr: '---\n* * *\n___',
  code: '```js\nconst a = **1**;\n\n```\n~~~~\n```\ndentro\n~~~~',
  widget: '{{contador: 25/12/2026 | Natal}}\n{{Contador: 1/1/2027 | grande}}',
  table: '| a | b |\n| :-- | --: |\n| 1 | 2 | sobra |\n| só |',
};

/** Textos de todo jeito, para as promessas valerem em tudo (os casos do plano, seções 5 e 6). */
const CORPUS: string[] = [
  '',
  'a',
  'a\n',
  '\n\n',
  ...Object.values(AMOSTRAS),
  ...Object.values(PDF_BLOCK_SAMPLES).map((s) => s.text),
  ...Object.values(PDF_SPAN_SAMPLES).map((s) => s.text),
  ...Object.values(PDF_WIDGET_SAMPLES).flat(),
  pdfSampleText(),
  // os jeitos de escrever de cada um (F1, F14)
  'Isto é __negrito__ e _itálico_ e ***os dois*** e ___também___.',
  '>!spoiler à moda do Reddit!< e ||à do Discord||',
  'C:\\Users\\nome e a\\*b e -\\> e 1\\. e \\# e →',
  'Isso (muito) bom! E (((um aparte))).',
  'https://ex.com/a_(b) e www.ex.com e <https://ex.com/c> e [texto](https://ex.com/d "título") e mailto:',
  '[[Nota]] e [[Nota|outro texto]] e [[ Nota com espaço ]]',
  '`código` e `` com `crase` `` e ``` três ```',
  // listas: corpo, números, recuos (F15, F21)
  '- item\n  ```\n  dentro do item\n  ```\n- [ ] tarefa\n      corpo fundo\n  \n  e depois da linha em branco',
  '1. um\n   1.1. um ponto um\n   1.2. um ponto dois\n2. dois\n\n7. lista que começa no sete',
  '- a\n\tcom tab\n  \t misturado\n- b\n   três espaços\n     cinco',
  '- item\n  # título no corpo\n  > citação no corpo\n  ---\n  {{contador: 1/1/2030}}\n  | a | b |\n  | - | - |\n  | 1 | 2 |',
  // quebras (F16)
  'a\r\nb\r\n\r\nc',
  'a\rb\nc\r\nd',
  // sem fecho e com crases dentro (F19, F20)
  '```\nsem fecho',
  '````\n```\ndentro\n```\n````',
  // tabela com marca, alinhamento, sobra e "|" escapado (F13)
  '{{tabela: listrada}}\n| x \\| y | **b** |\n|---|:-:|\n| 1 | 2 | 3 | 4 |',
  // widget desconhecido de um site mais novo (F12), e o que parece widget
  '{{enquete: a | b}}\n{{ contador : 1/1/2030 }}',
  // caractere de uso privado (F18)
  'emoji antigo \uE000 e **negrito \uE001**',
  // espaços no fim, nbsp, tab no meio
  'fim com espaços   \n-#\u00a0sutil com nbsp\nmeio\tcom tab',
];

/** As linhas cruas do texto (como o leitor parte). */
const cruas = (t: string) => t.split(/\r\n|\r|\n/);

/** A primeira linha crua de cada linha do documento. */
function comecos(d: Doc): number[] {
  const out: number[] = [];
  let at = 0;
  for (const l of d.linhas) {
    out.push(at);
    at += cruas(l.fonte!.texto).length;
  }
  return out;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('o tradutor do modo Visual (core/rich-doc.ts)', () => {
  it('abrir e sair sem mexer não muda um byte (I1), em todo o corpus', () => {
    for (const t of CORPUS) {
      const e = docToText(textToDoc(t));
      expect(e.texto).withContext(JSON.stringify(t)).toBe(t);
      expect(e.exato).withContext(JSON.stringify(t)).toBeTrue();
    }
  });

  it('nenhuma linha do corpus vira trecho cru, e cada linha do texto está em uma linha do documento', () => {
    for (const t of CORPUS) {
      const d = textToDoc(t);
      expect(d.linhas.filter((l) => l.kind === 'cru').length).withContext(JSON.stringify(t)).toBe(0);
      expect(d.linhas.map((l) => l.fonte!.texto + l.fonte!.fim).join('')).toBe(t);
    }
  });

  it('o papel de cada linha vem do leitor: a mesma linha é título no corpo de um item e texto fora dele', () => {
    const d = textToDoc('- item\n  # no corpo\n  # x');
    expect(d.linhas.map((l) => l.kind)).toEqual(['item', 'titulo', 'titulo']);
    const fora = textToDoc('  # fora');
    expect(fora.linhas[0]).toEqual(jasmine.objectContaining({ kind: 'linha', recuo: 2, spans: [{ text: '# fora' }] }));
  });

  it('reescrito do zero, sem a fonte, o corpus volta igual na leitura (I3)', () => {
    for (const t of CORPUS) {
      const e = docToText(semFonte(textToDoc(t)));
      expect(e.exato).withContext(`${JSON.stringify(t)} ⇒ ${JSON.stringify(e.texto)}`).toBeTrue();
      expect(JSON.stringify(parseRich(e.texto))).withContext(JSON.stringify(t)).toBe(JSON.stringify(parseRich(t)));
    }
  });

  it('mexer numa linha muda só ela (I2), e as outras saem byte a byte', () => {
    for (const t of CORPUS) {
      const d = textToDoc(t);
      const inicio = comecos(d);
      d.linhas.forEach((l, i) => {
        if (!('spans' in l) || !l.spans.length) return;
        const linhas = [...d.linhas];
        linhas[i] = { ...l, spans: [...l.spans, { text: ' mais' }] } as LinhaDoc;
        const e = docToText({ ...d, linhas });
        expect(e.exato).withContext(`${JSON.stringify(t)} linha ${i}`).toBeTrue();
        const antes = cruas(t);
        const depois = cruas(e.texto);
        expect(depois.length).toBe(antes.length);
        antes.forEach((a, k) => {
          if (k !== inicio[i]) expect(depois[k]).withContext(`${JSON.stringify(t)} linha ${i}`).toBe(a);
        });
        expect(depois[inicio[i]].endsWith(' mais')).toBeTrue();
      });
    }
  });

  it('as quebras de cada linha ficam: o \\r\\n de quem escreveu não vira \\n (F16)', () => {
    const d = textToDoc('a\r\nb\r\n\r\nc');
    expect(d.quebra).toBe('\r\n');
    const linhas = [...d.linhas];
    linhas[0] = linha([{ text: 'ax' }]);
    linhas.splice(2, 0, linha([{ text: 'nova' }]));
    expect(docToText({ ...d, linhas }).texto).toBe('ax\r\nb\r\nnova\r\n\r\nc');
    // a linha nova no fim ganha a quebra que o texto mais usa
    expect(docToText({ ...d, linhas: [...d.linhas, linha([{ text: 'fim' }])] }).texto).toBe('a\r\nb\r\n\r\nc\r\nfim');
  });

  it('o que se digitou como letra não vira marca: as barras só onde o leitor leria uma (F3, F4, F9, F10, F11)', () => {
    const casos: [string, string][] = [
      ['*nome*', '*nome\\*'],
      ['Isso (muito) bom!', 'Isso (muito) bom!'],
      ['a -> b → c', 'a -\\> b → c'],
      ['C:\\Users\\x', 'C:\\Users\\x'],
      ['2 * 3 * 4', '2 * 3 * 4'],
      ['snake_case e a__b__c', 'snake_case e a__b__c'],
      ['# não é título', '\\# não é título'],
      ['- nem item', '\\- nem item'],
      ['1. nem número', '1\\. nem número'],
      ['> nem citação', '\\> nem citação'],
      ['-# nem sutil', '-\\# nem sutil'],
      ['```', '\\```'],
      ['{{contador: 1/1/2027}}', '{{contador: 1/1/2027}\\}'],
    ];
    for (const [letras, escrito] of casos) {
      const e = escrever(linha([{ text: letras }]));
      expect(e.texto).withContext(letras).toBe(escrito);
      expect(e.exato).withContext(letras).toBeTrue();
      expect(e.doc.linhas[0]).toEqual(jasmine.objectContaining({ kind: 'linha', spans: [{ text: letras }] }));
    }
    // a divisória escrita como letras
    expect(escrever(linha([{ text: '---' }])).doc.linhas[0].kind).toBe('linha');
  });

  it('o widget de um site mais novo não é escapado: para este leitor é texto, e o outro site quer ler (F12)', () => {
    expect(escrever(linha([{ text: '{{enquete: a | b}}' }])).texto).toBe('{{enquete: a | b}}');
  });

  it('a linha que viraria tabela com a de cima ganha a barra no começo (a trava lê o texto inteiro)', () => {
    const e = escrever(linha([{ text: 'a | b' }]), linha([{ text: '---|---' }]));
    expect(e.texto).toBe('a | b\n\\---|---');
    expect(e.exato).toBeTrue();
  });

  it('as marcas: cada uma no jeito que o leitor lê igual, o espaço da ponta saindo de dentro (F6)', () => {
    const casos: [Span[], string][] = [
      [[{ text: 'b', bold: true }, { text: 'i', italic: true }], '**b**_i_'],
      [[{ text: 'x ', bold: true }, { text: 'y' }], '**x** y'],
      [[{ text: 'spoiler', spoiler: true }, { text: ' e ' }, { text: 'sutil', subtle: true }, { text: ' e ' }, { text: 'mm', mark: true }, { text: ' ' }, { text: 'ss', strike: true }], '||spoiler|| e ((sutil)) e ==mm== ~~ss~~'],
      [[{ text: 'muito ', bold: true }, { text: 'bom', bold: true, italic: true }], '**muito *bom***'],
    ];
    for (const [spans, escrito] of casos) {
      const e = escrever(linha(spans));
      expect(e.texto).toBe(escrito);
      expect(e.exato).toBeTrue();
    }
    // a marca que só cobre espaços some
    expect(escrever(linha([{ text: 'a' }, { text: '  ', bold: true }, { text: 'b' }])).texto).toBe('a  b');
  });

  it('o código com crase dentro ganha crases a mais, e o espaço que o leitor tira (F20)', () => {
    expect(escrever(linha([{ text: 'a`b', code: true }, { text: ' e ' }, { text: '`x', code: true }])).texto).toBe('``a`b`` e `` `x ``');
    expect(escrever(linha([{ text: ' x ', code: true }])).doc.linhas[0]).toEqual(jasmine.objectContaining({ spans: [{ text: ' x ', code: true }] }));
  });

  it('os links pelo jeito mais curto que o leitor lê igual', () => {
    const e = escrever(
      linha([
        { text: 'https://x.com/a_(b)', href: 'https://x.com/a_(b)' },
        { text: ' ' },
        { text: 'www.y.com', href: 'https://www.y.com' },
        { text: ' ' },
        { text: 'texto', href: 'https://z.com' },
        { text: ' ' },
        { text: 'rótulo', link: true, ref: 'Nota' },
        { text: ' ' },
        { text: 'Outra', link: true },
      ]),
    );
    expect(e.texto).toBe('https://x.com/a_(b) www.y.com [texto](https://z.com) [[Nota|rótulo]] [[Outra]]');
    expect(e.exato).toBeTrue();
  });

  it('a tabela: o "|" da célula escapado, o spoiler no jeito que não divide a célula, o jeito em cima e a sobra de volta (F13)', () => {
    const tabela: LinhaDoc = {
      kind: 'tabela',
      recuo: 0,
      jeito: 'listrada',
      alinhar: [null, 'right'],
      cabeca: [[{ text: 'a|b' }], [{ text: 'seg', spoiler: true }]],
      fileiras: [[[{ text: 'x', bold: true }], []]],
      sobra: [['3']],
    };
    const e = escrever(tabela);
    expect(e.texto).toBe('{{tabela: listrada}}\n| a\\|b | >!seg!< |\n| --- | ---: |\n| **x** |  | 3 |');
    expect(e.exato).toBeTrue();
  });

  it('o título, o item, a citação e o sutil escritos de volta, com o que o leitor comeria escapado', () => {
    const e = escrever(
      { kind: 'titulo', recuo: 0, nivel: 2, spans: [{ text: 'C# e a #' }] },
      { kind: 'item', recuo: 0, tipo: 'ul', feita: false, numero: '', spans: [{ text: '[ ] não é tarefa' }] },
      { kind: 'item', recuo: 2, tipo: 'ol', feita: false, numero: '1.2', spans: [{ text: 'dentro' }] },
      { kind: 'item', recuo: 0, tipo: 'check', feita: true, numero: '', spans: [{ text: 'feita' }] },
      { kind: 'citacao', recuo: 0, spans: [{ text: 'dita' }] },
      { kind: 'sutil', recuo: 0, spans: [] },
    );
    expect(e.texto).toBe('## C# e a \\#\n- [ \\] não é tarefa\n  1.2. dentro\n- [x] feita\n> dita\n-#');
    expect(e.exato).toBeTrue();
  });

  it('o código sem fecho ganha o fecho só se for mexido (F19); a cerca é maior que as crases de dentro', () => {
    const d = textToDoc('```\nsem fecho');
    expect(docToText(d).texto).toBe('```\nsem fecho');
    const mexido = { ...d, linhas: [{ ...d.linhas[0], texto: 'mexido' } as LinhaDoc] };
    expect(docToText(mexido).texto).toBe('```\nmexido\n```');
    const crases = escrever({ kind: 'codigo', recuo: 0, cerca: '```', texto: '```\ndentro', margem: 0, aberto: false });
    expect(crases.texto).toBe('````\n```\ndentro\n````');
    expect(crases.exato).toBeTrue();
  });

  it('o código no corpo de um item fica no corpo (a margem dele em cada linha)', () => {
    const d = textToDoc('- item\n  ```\n  a\n\n  b\n  ```');
    const cod = d.linhas[1];
    expect(cod).toEqual(jasmine.objectContaining({ kind: 'codigo', margem: 2, texto: 'a\n\nb' }));
    const e = docToText({ ...d, linhas: [d.linhas[0], { ...cod, texto: 'a\n\nc' } as LinhaDoc] });
    expect(e.texto).toBe('- item\n  ```\n  a\n\n  c\n  ```');
    expect(e.exato).toBeTrue();
  });

  it('o espaço do começo da linha de texto vira recuo; o do item e do título, que o leitor come, sai', () => {
    expect(normalizarLinha(linha([{ text: '\t  x' }]))).toEqual(jasmine.objectContaining({ recuo: 6, spans: [{ text: 'x' }] }));
    expect(normalizarLinha({ kind: 'titulo', recuo: 0, nivel: 1, spans: [{ text: '  x  ' }] })).toEqual(jasmine.objectContaining({ spans: [{ text: 'x' }] }));
    expect(escrever(linha([{ text: '  x' }])).texto).toBe('  x');
  });

  it('a linha que nenhum jeito escreve fica como trecho cru, guardada como está (I4)', () => {
    const t = 'antes\n{{contador: 1/1/2030}}))->{{enquete: x}}\ndepois';
    const d = textToDoc(t);
    expect(d.linhas.map((l) => l.kind)).toEqual(['linha', 'cru', 'linha']);
    const linhas = [...d.linhas];
    linhas[0] = linha([{ text: 'mexida' }]);
    expect(docToText({ ...d, linhas }).texto).toBe('mexida\n{{contador: 1/1/2030}}))->{{enquete: x}}\ndepois');
  });

  it('os casos sabidos que o leitor não lê: a escrita diz que não é exata e devolve o que ele leu', () => {
    // o leitor troca "~=" por "≈" antes das marcas: o riscado colado no marca-texto não tem escrita
    const tilde = escrever(linha([{ text: 'a', strike: true }, { text: 'b', mark: true }]));
    expect(tilde.exato).toBeFalse();
    expect(JSON.stringify(tilde.doc)).toBe(JSON.stringify(textToDoc(tilde.texto)));
    // o itálico de uma letra colado num negrito no meio da palavra
    expect(escrever(linha([{ text: 'x' }, { text: 'a', italic: true }, { text: 'b', bold: true }, { text: 'y' }])).exato).toBeFalse();
    // o título vazio é texto para o leitor
    expect(escrever({ kind: 'titulo', recuo: 0, nivel: 1, spans: [] }).exato).toBeFalse();
    // o rótulo de um link para fora não pode ter colchete
    expect(escrever(linha([{ text: 'a [b]', href: 'https://x.com' }])).exato).toBeFalse();
  });

  it('o documento vazio é uma linha vazia', () => {
    expect(docToText({ linhas: [], quebra: '\n' }).texto).toBe('');
    expect(textToDoc('').linhas.map((l) => chave(l))).toEqual([chave(linha([]))]);
  });

  it('A REGRA DO VISUAL: todo bloco e todo widget têm amostra lida como linhas (não cru) e escrita de volta igual', () => {
    for (const [kind, t] of Object.entries(AMOSTRAS)) {
      expect(parseRich(t).some((b) => b.kind === kind)).withContext(`a amostra de "${kind}" não tem o bloco`).toBeTrue();
      const d = textToDoc(t);
      expect(d.linhas.some((l) => l.kind === 'cru')).withContext(kind).toBeFalse();
      expect(docToText(semFonte(d)).exato).withContext(kind).toBeTrue();
    }
    for (const w of WIDGETS) {
      const amostras = PDF_WIDGET_SAMPLES[w.name] ?? [];
      expect(amostras.length).withContext(`falta a amostra do widget ${w.name}`).toBeGreaterThan(0);
      for (const t of amostras) {
        const d = textToDoc(t);
        expect(d.linhas.some((l) => l.kind === 'widget' || l.kind === 'tabela')).withContext(t).toBeTrue();
        expect(d.linhas.some((l) => l.kind === 'cru')).withContext(t).toBeFalse();
        expect(docToText(semFonte(d)).exato).withContext(t).toBeTrue();
      }
    }
  });

  it('o cursor: cada letra da tela cai no lugar dela no texto e volta ao mesmo lugar', () => {
    const t = '# Título\nTexto com **negrito** e a -> b\n- [ ] tarefa `x`';
    const e = docToText(textToDoc(t));
    e.doc.linhas.forEach((l, i) => {
      const visivel = textoVisivel(l);
      for (let col = 0; col <= visivel.length; col++) expect(posicaoNoDoc(e, posicaoNoTexto(e, i, col))).withContext(`${i}:${col}`).toEqual({ linha: i, col });
    });
    // a letra "n" de "negrito" cai depois dos dois asteriscos; a seta cai nos sinais que a escrevem
    const segunda = e.inicios[1];
    expect(t.slice(posicaoNoTexto(e, 1, 10), posicaoNoTexto(e, 1, 10) + 1)).toBe('n');
    expect(t.slice(posicaoNoTexto(e, 1, textoVisivel(e.doc.linhas[1]).indexOf('→')), segunda + 30)).toMatch(/^->/);
    expect(alinhar('**a** \\* →', 'a * →')).toEqual([2, 5, 7, 8, 9, 10]);
  });

  it('fuzz: textos sorteados abrem e saem sem mudar um byte, e reescritos do zero voltam iguais', () => {
    const r = rng(20261029);
    const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)];
    const FRAG = ['**', '*', '_', '__', '~~', '==', '||', '((', '))', '`', '``', '[[', ']]', '[', ']', '(', ')', '|', 'https://x.y/a', 'www.a.b', '\\', '-', '# ', '> ', '-# ', '1. ', '1.1. ', '- ', '- [ ] ', '- [x] ', '| a | b |', '|---|---|', '---', '```', '~~~', '{{contador: 1/1/2030}}', '{{tabela: listrada}}', '{{enquete: x}}', '  ', '    ', '\t', 'é', '→', '->', '<=', 'a', 'b', ' ', 'palavra', '>!', '!<', '<https://q.r>', '[t](https://u.v)', '\u00a0'];
    let crus = 0;
    for (let n = 0; n < 500; n++) {
      const linhas: string[] = [];
      for (let i = 0, nl = 1 + Math.floor(r() * 6); i < nl; i++) {
        let l = '';
        for (let k = 0, nf = Math.floor(r() * 7); k < nf; k++) l += pick(FRAG);
        linhas.push(l);
      }
      const t = linhas.join(pick(['\n', '\n', '\r\n']));
      const d = textToDoc(t);
      crus += d.linhas.filter((l) => l.kind === 'cru').length;
      const e = docToText(d);
      expect(e.texto).withContext(JSON.stringify(t)).toBe(t);
      expect(docToText(semFonte(d)).exato).withContext(JSON.stringify(t)).toBeTrue();
    }
    // o trecho cru é a rede de segurança, não o comum
    expect(crus).toBeLessThan(10);
  });

  it('fuzz: linhas sorteadas, escritas e lidas de volta, dão a mesma linha (fora os casos sabidos)', () => {
    const r = rng(7);
    const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)];
    const LETRAS = 'abcé →*_~=|()[]`\\#-+>.!<:{}/'.split('').concat(['ab', 'de', ' x ', 'ç']);
    const FLAGS = ['bold', 'italic', 'strike', 'mark', 'spoiler', 'subtle'] as const;
    const spans = (): Span[] =>
      Array.from({ length: 1 + Math.floor(r() * 5) }, () => {
        let text = '';
        for (let j = 0, k = 1 + Math.floor(r() * 4); j < k; j++) text += pick(LETRAS);
        const s: Span = { text };
        for (const f of FLAGS) if (r() < 0.15) s[f] = true;
        const a = r();
        if (a < 0.05) s.code = true;
        else if (a < 0.08) Object.assign(s, { text: 'Nota ' + Math.floor(r() * 9), link: true });
        else if (a < 0.11) Object.assign(s, { text: s.text.replace(/[[\]]/g, 'q'), href: 'https://ex.com/' + Math.floor(r() * 9) });
        return s;
      });
    let inexatos = 0;
    let n = 0;
    for (; n < 800; n++) {
      const kind = pick(['linha', 'linha', 'titulo', 'item', 'citacao', 'sutil'] as const);
      const l: LinhaDoc =
        kind === 'item'
          ? { kind, recuo: 0, tipo: pick(['ul', 'ol', 'check'] as const), feita: r() < 0.5, numero: '1', spans: spans() }
          : kind === 'titulo'
            ? { kind, recuo: 0, nivel: 1, spans: spans() }
            : { kind, recuo: 0, spans: spans() };
      const e = escrever(l);
      expect(JSON.stringify(e.doc)).toBe(JSON.stringify(textToDoc(e.texto)));
      // o riscado colado no marca-texto ("~~==", o leitor lê "≈") e o título que ficou vazio são sabidos
      if (!e.exato && !e.texto.includes('~~==') && !(kind === 'titulo' && !e.texto.slice(2).trim())) inexatos++;
    }
    expect(inexatos / n).withContext(`${inexatos} de ${n}`).toBeLessThan(0.01);
  });
});
