import { calloutDef, calloutHead, calloutLook, calloutName } from './callouts';
import { LinhaDoc, docToText, posicaoNoDoc, posicaoNoTexto, textToDoc } from './rich-doc';
import { Block, checkCount, copyText, hasFormatting, hasSpoiler, hasTouchableWidget, parseRich, plainText, proseLines, tasksOf, toggleCheck } from './rich-text';

type Callout = Extract<Block, { kind: 'callout' }>;
const card = (text: string, i = 0) => parseRich(text)[i] as Callout;

describe('o card (o callout do Obsidian)', () => {
  it('a linha de cima dá o jeito, o fechar e o título; as do "> " embaixo são o que tem dentro', () => {
    const b = card('> [!aviso]- Antes de **ir**\n> uma linha\n> - item\n>\n> fim\ndepois');
    expect(b.kind).toBe('callout');
    expect(b.type).toBe('aviso');
    expect(b.fold).toBe('-');
    expect(b.title).toEqual([{ text: 'Antes de ' }, { text: 'ir', bold: true }]);
    expect(b.size).toBe(4);
    expect(b.body.map((x) => x.kind)).toEqual(['p', 'ul', 'p']);
    expect(parseRich('> [!aviso]- Antes de **ir**\n> uma linha\n> - item\n>\n> fim\ndepois')[1]).toEqual({ kind: 'p', lines: [[{ text: 'depois' }]] });
  });

  it('sem título, o "+", o ">" sem espaço e o recuo valem; "[!x]Título" colado e o "> [!" no meio da linha não', () => {
    expect(card('> [!dica]').title).toEqual([]);
    expect(card('> [!dica]+').fold).toBe('+');
    expect(card('>[!dica] T').type).toBe('dica');
    expect(card('  > [!Warning] T').type).toBe('Warning');
    expect(card('> [!dica]Colado').kind).toBe('quote');
    expect(card('texto > [!dica]').kind).toBe('p');
  });

  it('acaba na linha sem ">" e na linha de outro card (dois cards seguidos, sem linha em branco)', () => {
    const bs = parseRich('> [!nota] A\n> a\n> [!perigo] B\n> b\n\n> citação');
    expect(bs.map((b) => b.kind)).toEqual(['callout', 'callout', 'p', 'quote']);
    expect((bs[1] as Callout).type).toBe('perigo');
  });

  it('dentro, tudo o que o texto tem: outro card, a citação, a tabela, o código, o widget', () => {
    const b = card('> [!nota]\n> > [!dica] Dentro\n> > oi\n> | a | b |\n> | - | - |\n> | 1 | 2 |\n> ```\n> x\n> ```\n> {{contador: 1/1/2030}}');
    expect(b.body.map((x) => x.kind)).toEqual(['callout', 'table', 'code', 'widget']);
    expect((b.body[0] as Callout).body[0]).toEqual({ kind: 'p', lines: [[{ text: 'oi' }]] });
  });

  it('as tarefas de dentro contam, marcam no lugar certo e somem do código', () => {
    const t = '- [ ] fora\n> [!info] Lista\n> - [ ] dentro\n>   - [x] funda\n> ```\n> - [ ] no código\n> ```';
    expect([...tasksOf(t)]).toEqual([
      [0, false],
      [2, false],
      [3, true],
    ]);
    expect(checkCount(t)).toEqual({ done: 1, total: 3 });
    expect(toggleCheck(t, 2).split('\n')[2]).toBe('> - [x] dentro');
    expect(toggleCheck(t, 3).split('\n')[3]).toBe('>   - [ ] funda');
    // a linha de cima não é tarefa, e a de dentro do código também não
    expect(toggleCheck(t, 1)).toBe(t);
    expect(toggleCheck(t, 5)).toBe(t);
    expect(proseLines(t).map((p) => p.line)).toEqual(['- [ ] fora', '> [!info] Lista', '- [ ] dentro', '  - [x] funda']);
  });

  it('o texto sem marcas e a cópia: o título (ou o nome do jeito) e as linhas de dentro', () => {
    expect(plainText('> [!aviso] Cuidado\n> o **degrau**\n\n> [!warning]\n> x')).toBe('Cuidado\no degrau\n\nAviso\nx');
    expect(copyText('> [!dica] ||segredo||\n> a', { now: 0 })).toBe('||segredo||\na');
    expect(hasSpoiler('> [!dica] ||segredo||')).toBeTrue();
    expect(hasFormatting('> [!dica]')).toBeTrue();
  });

  it('só o card que fecha se toca na ficha do mural (e o widget de dentro, como os outros)', () => {
    expect(hasTouchableWidget('> [!dica]- Fechado\n> x')).toBeTrue();
    expect(hasTouchableWidget('> [!dica]+ Aberto')).toBeTrue();
    expect(hasTouchableWidget('> [!dica] Sempre aberto\n> x')).toBeFalse();
    expect(hasTouchableWidget('> [!dica]\n> {{contador: 1/1/2030}}')).toBeTrue();
    expect(hasTouchableWidget('```\n> [!dica]- no código\n```')).toBeFalse();
  });

  it('os nomes do Obsidian e os daqui, sem ligar para acento nem maiúscula; o desconhecido tem a cara da Nota', () => {
    expect(calloutLook('warning')).toBe('aviso');
    expect(calloutLook('ATENÇÃO')).toBe('aviso');
    expect(calloutLook('tldr')).toBe('dica');
    expect(calloutLook('bug')).toBe('perigo');
    expect(calloutLook('jogo')).toBe('nota');
    expect(calloutDef('jogo')).toBeNull();
    expect(calloutName('warning')).toBe('Aviso');
    expect(calloutName('meu-jogo')).toBe('Meu jogo');
    expect(calloutHead('aviso', '-', 'T')).toBe('> [!aviso]- T');
    expect(calloutHead('nota', '', '')).toBe('> [!nota]');
  });
});

describe('o card no modo Visual (core/rich-doc.ts)', () => {
  const TEXTO = '> [!aviso]- Antes **de ir**\n> uma linha\n>\n>   - item recuado\n> | a | b |\n> | - | - |\n> | 1 | 2 |\n\nfora';

  it('a de cima vira a linha do card, e as de dentro ficam marcadas com a coluna do ">"', () => {
    const d = textToDoc(TEXTO);
    expect(d.linhas.map((l) => [l.kind, l.cartao ?? null])).toEqual([
      ['cartao', null],
      ['linha', 0],
      ['linha', 0],
      ['item', 0],
      ['tabela', 0],
      ['linha', null],
      ['linha', null],
    ]);
    const topo = d.linhas[0] as Extract<LinhaDoc, { kind: 'cartao' }>;
    expect([topo.tipo, topo.dobra]).toEqual(['aviso', '-']);
    expect(d.linhas[3].recuo).toBe(2);
  });

  it('sai igual, byte a byte; mexer numa linha de dentro muda só ela, com o "> " na frente', () => {
    const d = textToDoc(TEXTO);
    expect(docToText(d).texto).toBe(TEXTO);
    const linhas = [...d.linhas];
    linhas[1] = { kind: 'linha', recuo: 0, spans: [{ text: 'outra ' }, { text: 'linha', italic: true }], cartao: 0, fonte: linhas[1].fonte };
    const e = docToText({ ...d, linhas });
    expect(e.exato).toBeTrue();
    expect(e.texto).toBe(TEXTO.replace('> uma linha', '> outra *linha*'));
  });

  it('a linha nova dentro do card ganha o "> "; a vazia, só o ">"; tirada do card, ela o perde', () => {
    const d = textToDoc('> [!nota] T\n> a\nb');
    const dentro = (l: LinhaDoc, cartao?: number): LinhaDoc => {
      const { cartao: _, fonte: __, ...resto } = l;
      return (cartao === undefined ? resto : { ...resto, cartao }) as LinhaDoc;
    };
    const e = docToText({ ...d, linhas: [d.linhas[0], d.linhas[1], { kind: 'linha', recuo: 0, spans: [], cartao: 0 }, dentro(d.linhas[2], 0)] });
    expect(e.texto).toBe('> [!nota] T\n> a\n>\n> b');
    expect(e.exato).toBeTrue();
    const f = docToText({ ...d, linhas: [d.linhas[0], dentro(d.linhas[1])] });
    expect(f.texto).toBe('> [!nota] T\na');
  });

  it('o título e o jeito mudam na linha de cima; o título com "[" no começo não quebra', () => {
    const d = textToDoc('> [!nota] T\n> a');
    const topo = d.linhas[0] as Extract<LinhaDoc, { kind: 'cartao' }>;
    const e = docToText({ ...d, linhas: [{ ...topo, tipo: 'perigo', dobra: '+', spans: [{ text: 'Novo ', bold: true }, { text: 'título' }] }, d.linhas[1]] });
    expect(e.texto).toBe('> [!perigo]+ **Novo** título\n> a');
    expect(e.exato).toBeTrue();
    const vazio = docToText({ ...d, linhas: [{ ...topo, spans: [] }, d.linhas[1]] });
    expect(vazio.texto).toBe('> [!nota]\n> a');
  });

  it('o card dentro do card fica cru (como está escrito), com o resto do card editável', () => {
    const t = '> [!nota] Fora\n> antes\n> > [!dica] Dentro\n> > oi\n> depois';
    const d = textToDoc(t);
    expect(d.linhas.map((l) => l.kind)).toEqual(['cartao', 'linha', 'cru', 'linha']);
    expect(d.linhas[2].cartao).toBe(0);
    expect(docToText(d).texto).toBe(t);
  });

  it('o cursor anda pelas letras depois do "> " (e do "> [!jeito] " na de cima)', () => {
    const e = docToText(textToDoc('> [!aviso] Título\n> abc'));
    expect(posicaoNoTexto(e, 0, 0)).toBe('> [!aviso] '.length);
    expect(posicaoNoTexto(e, 1, 1)).toBe('> [!aviso] Título\n> a'.length);
    expect(posicaoNoDoc(e, '> [!aviso] Título\n> ab'.length)).toEqual({ linha: 1, col: 2 });
    expect(posicaoNoDoc(e, 3)).toEqual({ linha: 0, col: 0 });
  });
});
