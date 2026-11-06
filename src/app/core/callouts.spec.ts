import { CALLOUTS, CALLOUT_CARTOLINA, CALLOUT_PAPERS, calloutColorName, calloutColorWord, calloutDef, calloutHead, calloutLook, calloutName, calloutPaper } from './callouts';
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

describe('a cor própria do card', () => {
  it('vem depois da barra, com o fechar e o título como sempre; sem ela, o card é o de antes', () => {
    const b = card('> [!aviso|azul]- Antes\n> x');
    expect([b.type, b.color, b.fold]).toEqual(['aviso', 'azul', '-']);
    expect(b.title).toEqual([{ text: 'Antes' }]);
    expect(card('> [!aviso] T').color).toBe('');
    expect(card('>[!aviso|Lilás]+').color).toBe('Lilás');
    expect(card('> [!aviso|]').kind).toBe('quote');
    expect(card('> [!aviso|azul claro]').kind).toBe('quote');
  });

  it('a cor muda só o papel: o nome e o jeito ficam, e a palavra desconhecida não muda nada (como no Obsidian)', () => {
    expect(calloutPaper('aviso', 'azul')).toBe('info');
    expect(calloutPaper('aviso', '')).toBe('aviso');
    expect(calloutPaper('warning', 'wide-1')).toBe('aviso');
    expect(calloutPaper('jogo', 'Lilás')).toBe('exemplo');
    expect(calloutPaper('aviso', 'cartolina')).toBe('cartolina');
    expect(calloutPaper('aviso', 'CARTOLINA')).toBe('cartolina');
    expect(calloutLook('aviso')).toBe('aviso');
    expect(plainText('> [!aviso|azul]\n> x')).toBe('Aviso\nx');
    expect(hasFormatting('> [!aviso|azul]')).toBeTrue();
  });

  it('a barra da cor não faz da linha de cima uma tabela', () => {
    const t = '> [!nota|azul] T\n|---|---|';
    expect(parseRich(t)[0].kind).toBe('callout');
    expect(hasTouchableWidget(t)).toBeFalse();
    // a tabela de verdade dentro do card continua sendo tabela
    expect((parseRich('> [!nota|azul] T\n> | a | b |\n> | - | - |\n> | 1 | 2 |')[0] as Callout).body[0].kind).toBe('table');
  });

  it('a palavra de cada cor volta igual; o nome de um jeito também escolhe o papel dele', () => {
    expect(calloutColorWord('Verde-Água')).toBe('verde-agua');
    expect(calloutColorWord('perigo')).toBe('vermelho');
    expect(calloutColorWord('warning')).toBe('laranja');
    expect(calloutColorWord('wide-1')).toBe('');
    expect(calloutColorWord('')).toBe('');
    for (const c of [...CALLOUT_PAPERS, CALLOUT_CARTOLINA]) expect(calloutColorWord(c.word)).toBe(c.word);
    // uma cor para cada jeito, na ordem deles, e o rosa, que é só uma cor
    expect(CALLOUT_PAPERS.map((c) => c.paper).filter((p) => p !== 'rosa')).toEqual(CALLOUTS.map((c) => c.look));
    expect(calloutPaper('aviso', 'rosa')).toBe('rosa');
    expect(calloutHead('aviso', '', 'T', 'rosa')).toBe('> [!aviso|rosa] T');
    expect(calloutColorName('rosa')).toBe('Rosa');
    expect(calloutColorName('cartolina')).toBe('Cartolina');
    expect(calloutColorName('')).toBe('Padrão');
  });

  it('a linha de cima leva a cor no lugar certo, e sem cor fica como antes', () => {
    expect(calloutHead('aviso', '-', 'T', 'azul')).toBe('> [!aviso|azul]- T');
    expect(calloutHead('aviso', '', '', 'cartolina')).toBe('> [!aviso|cartolina]');
    expect(calloutHead('aviso', '+', 'T', '')).toBe('> [!aviso]+ T');
  });

  it('no Visual, sai igual byte a byte, e trocar a cor, o jeito ou o fechar muda só o que mudou', () => {
    for (const t of ['> [!aviso|azul]- T\n> a', '> [!nota|Lilás]\n> a', '> [!warning|wide-1] T\n> a', '  > [!dica|cartolina]+ T\n  > a']) {
      expect(docToText(textToDoc(t)).texto).toBe(t);
    }
    const d = textToDoc('> [!aviso|azul] T\n> a');
    const topo = d.linhas[0] as Extract<LinhaDoc, { kind: 'cartao' }>;
    expect(topo.cor).toBe('azul');
    const com = (mudou: Partial<typeof topo>) => docToText({ ...d, linhas: [{ ...topo, ...mudou }, d.linhas[1]] });
    expect(com({ cor: 'cartolina' }).texto).toBe('> [!aviso|cartolina] T\n> a');
    expect(com({ cor: '' }).texto).toBe('> [!aviso] T\n> a');
    expect(com({ tipo: 'perigo' }).texto).toBe('> [!perigo|azul] T\n> a');
    expect(com({ dobra: '-' }).texto).toBe('> [!aviso|azul]- T\n> a');
    expect(com({ cor: 'cartolina' }).exato).toBeTrue();
  });

  it('o cursor anda pelas letras depois da cor', () => {
    const e = docToText(textToDoc('> [!aviso|azul] Título\n> abc'));
    expect(posicaoNoTexto(e, 0, 0)).toBe('> [!aviso|azul] '.length);
    expect(posicaoNoDoc(e, '> [!aviso|azul] Tí'.length)).toEqual({ linha: 0, col: 2 });
  });

  /** O matiz de uma cor "#rrggbb", em graus. */
  function hueOf(cor: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (!d) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  const longe = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

  /** O papel e a tinta do card na cor da cartolina, dentro de um elemento com os atributos dados. */
  function cores(attrs: Record<string, string>): { papel: string; tinta: string; fim: () => void } {
    const fora = document.createElement('div');
    for (const [k, v] of Object.entries(attrs)) fora.setAttribute(k, v);
    const dentro = document.createElement('div');
    dentro.dataset['jeito'] = 'cartolina';
    fora.append(dentro);
    document.body.append(fora);
    const s = getComputedStyle(dentro);
    return { papel: s.getPropertyValue('--c-papel').trim(), tinta: s.getPropertyValue('--c-tinta').trim(), fim: () => fora.remove() };
  }

  it('a cor da cartolina tem o matiz dela, clara ou escura, e a tinta se lê no papel', () => {
    for (const s of ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'lilas', 'rosa', 'vermelho-escuro', 'laranja-escuro', 'amarelo-escuro', 'verde-escuro', 'azul-escuro', 'lilas-escuro', 'rosa-escuro']) {
      const { papel, tinta, fim } = cores({ 'data-cor': s });
      const stock = getComputedStyle(document.documentElement).getPropertyValue(`--stock-${s}`).trim();
      expect(longe(hueOf(papel), hueOf(stock))).withContext(`papel de ${s}`).toBeLessThanOrEqual(15);
      expect(longe(hueOf(tinta), hueOf(stock))).withContext(`tinta de ${s}`).toBeLessThanOrEqual(15);
      fim();
    }
  });

  it('o exemplo do pedido: laranja é o papel do Aviso; preto, branco e os cinzas, o da Citação; sem cartolina, também', () => {
    const papel = (attrs: Record<string, string>) => {
      const c = cores(attrs);
      c.fim();
      return [c.papel, c.tinta];
    };
    expect(papel({ 'data-cor': 'laranja' })).toEqual(['#fbdfc2', '#934407']);
    for (const s of ['preto', 'branco', 'cinza', 'cinza-escuro']) expect(papel({ 'data-cor': s })).withContext(s).toEqual(['#e7e4de', '#4b463e']);
    expect(papel({})).toEqual(['#e7e4de', '#4b463e']);
    expect(papel({ 'data-cartolina': 'azul' })).toEqual(['#dce8f7', '#1e4f8e']);
  });

  it('a cartolina que vale é a mais perto: a ficha branca colada numa laranja fica cinza', () => {
    const fora = document.createElement('div');
    fora.dataset['cor'] = 'laranja';
    const colada = document.createElement('div');
    colada.dataset['cor'] = 'branco';
    const c = document.createElement('div');
    c.dataset['jeito'] = 'cartolina';
    colada.append(c);
    fora.append(colada);
    document.body.append(fora);
    expect(getComputedStyle(c).getPropertyValue('--c-papel').trim()).toBe('#e7e4de');
    fora.remove();
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
