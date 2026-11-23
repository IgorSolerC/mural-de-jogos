import { Review, sanitizeReview } from './review';
import { TextSpot, linkKey, linkSpot, linkTitleOf, linkedAudience, linkedNote, linkedOnCheckedTask, linkableTitle, linksIn, relinkAfterRename, renameLinks, resolveNote, spotLink, spotTitle, tableRowLine } from './note-links';
import { hasFormatting, parseInline, parseRich, plainText, splitLink, toggleCheck } from './rich-text';

/** Os links entre anotações: "[[Título]]" no texto abre a anotação com esse título. */

const note = (id: string, title: string, text = '', createdAt = '2026-10-01T10:00:00.000Z'): Review =>
  // o id fixo depois: o sanitize troca um id curto demais
  ({ ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, text, completedAt: '2026-10-01', createdAt, updatedAt: createdAt })!, id });

describe('links entre anotações', () => {
  it('o texto lê "[[título]]" como link, também dentro do negrito, e o título não ganha ênfase', () => {
    expect(parseInline('2. [[Comprar um console]] hoje')).toEqual([{ text: '2. ' }, { text: 'Comprar um console', link: true }, { text: ' hoje' }]);
    expect(parseInline('**veja [[Compras]]**')).toEqual([{ text: 'veja ', bold: true }, { text: 'Compras', bold: true, link: true }]);
    expect(parseInline('[[a *b* c]]')).toEqual([{ text: 'a *b* c', link: true }]);
    // não é link: vazio, só espaço, colchete solto, quebra de linha
    for (const t of ['[[]]', '[[   ]]', '[ [x] ]', '[[a', 'a]]']) expect(parseInline(t).some((s) => s.link)).withContext(t).toBeFalse();
    // a tarefa "- [ ]" continua tarefa
    expect(hasFormatting('- [ ] lavar')).toBeTrue();
    expect(hasFormatting('só [[Compras]]')).toBeTrue();
    expect(plainText('1. [[Comprar um console]]')).toBe('Comprar um console');
    expect(linksIn('[[ A ]] e [[B]]')).toEqual(['A', 'B']);
  });

  it('"[[Título|texto]]": o link abre a anotação do título e mostra o texto; renomear leva o título e deixa o texto', () => {
    expect(parseInline('veja [[Comprar um console|o console]]!')).toEqual([
      { text: 'veja ' },
      { text: 'o console', link: true, ref: 'Comprar um console' },
      { text: '!' },
    ]);
    // sem texto depois da barra, vale o título
    expect(parseInline('[[Compras|]]')).toEqual([{ text: 'Compras', link: true }]);
    expect(linksIn('[[Compras|a lista]] e [[Casa]]')).toEqual(['Compras', 'Casa']);
    expect(renameLinks('[[compras|a lista]] e [[Compras]] e [[Compras|]]', 'Compras', 'Mercado')).toBe('[[Mercado|a lista]] e [[Mercado|Compras]] e [[Mercado|Compras]]');
    expect(plainText('ver [[Compras|a lista]]')).toBe('ver a lista');
    expect(linkableTitle('Casa | praia')).toBeFalse();
  });

  it('renomear nunca muda o que se lê na anotação que cita: só o título por trás do link (pedido do dono)', () => {
    const now = '2026-11-08T00:00:00.000Z';
    const paris = note('n1', 'Paris', '', '2026-01-01T00:00:00.000Z');
    const diary = note('n2', 'Diário', 'Eu fui para [[PARIS]]. Depois, [[paris|a cidade]] e [[ Paris ]].');
    const title = 'Saiba tudo sobre a capital da França!';
    const [changed] = relinkAfterRename([paris, diary], paris, title, now);
    expect(changed.text).toBe(`Eu fui para [[${title}|PARIS]]. Depois, [[${title}|a cidade]] e [[${title}|Paris]].`);
    // o que se lê é o mesmo de antes, letra por letra; o link abre a mesma anotação, com o nome novo
    expect(plainText(changed.text)).toBe(plainText(diary.text));
    const renamed = { ...paris, game: { ...paris.game, name: title } };
    expect(linksIn(changed.text).map((t) => resolveNote([renamed, diary], t)?.id)).toEqual(['n1', 'n1', 'n1']);
    // mais um nome: o mesmo texto, sem ir empilhando
    const [again] = relinkAfterRename([renamed, changed], renamed, 'Paris, França', now);
    expect(again.text).toBe('Eu fui para [[Paris, França|PARIS]]. Depois, [[Paris, França|a cidade]] e [[Paris, França|Paris]].');
    expect(plainText(again.text)).toBe(plainText(diary.text));
    // e de volta a Paris: o texto como era, com os links simples
    const twice = { ...renamed, game: { ...renamed.game, name: 'Paris, França' } };
    const [back] = relinkAfterRename([twice, again], twice, 'Paris', now);
    expect(back.text).toBe('Eu fui para [[PARIS]]. Depois, [[Paris|a cidade]] e [[Paris]].');
  });

  it('o título vale sem maiúsculas, acentos e espaços a mais; com dois iguais, abre o mais antigo', () => {
    expect(linkKey('  Lista  de Mercado ')).toBe(linkKey('lista de mercado'));
    expect(linkKey('Ação')).toBe('acao');
    const old = note('n1', 'Comprar um console', '', '2026-01-01T00:00:00.000Z');
    const novo = note('n2', 'comprar um CONSOLE', '', '2026-05-01T00:00:00.000Z');
    expect(resolveNote([novo, old], 'Comprar um console')?.id).toBe('n1');
    expect(resolveNote([novo, old], 'Outra')).toBeNull();
    expect(resolveNote([novo, old], '   ')).toBeNull();
  });

  it('trocar o título leva junto os links que abriam a anotação, e só esses', () => {
    expect(renameLinks('1. [[console]]\n2. [[Outra]] [[CONSOLE]]', 'Console', 'PS5')).toBe('1. [[PS5|console]]\n2. [[Outra]] [[PS5|CONSOLE]]');
    const target = note('n1', 'Console', '', '2026-01-01T00:00:00.000Z');
    const list = note('n2', 'A fazeres', '1. Arrumar o carro\n2. [[Console]]');
    const other = note('n3', 'Ideias', 'nada aqui');
    const now = '2026-10-08T00:00:00.000Z';
    const changed = relinkAfterRename([target, list, other], target, 'Comprar um PS5', now);
    expect(changed.map((n) => [n.id, n.text, n.updatedAt])).toEqual([['n2', '1. Arrumar o carro\n2. [[Comprar um PS5|Console]]', now]]);
    // só mudou maiúscula: nada a fazer
    expect(relinkAfterRename([target, list], target, 'CONSOLE', now)).toEqual([]);
    // a gêmea mais nova muda de nome: os links continuam na mais antiga
    const twin = note('n4', 'Console', '', '2026-06-01T00:00:00.000Z');
    expect(relinkAfterRename([target, list, twin], twin, 'Console 2', now)).toEqual([]);
  });

  it('a anotação muda de título: o link numa resenha (de jogo, livro…) muda junto, e a resenha nunca é o alvo', () => {
    const now = '2026-10-08T00:00:00.000Z';
    const dicas = note('n1', 'Dicas do Hades', '', '2026-01-01T00:00:00.000Z');
    const review = { ...note('r1', 'Hades', 'Ver as [[Dicas do Hades]].\n- [ ] [[Dicas do Hades|o resto]]'), kind: 'jogos' } as Review;
    // uma resenha com o mesmo nome do título novo não rouba o link (só anotações são alvo)
    const homonym = { ...note('r2', 'Dicas', ''), kind: 'jogos' } as Review;
    const changed = relinkAfterRename([dicas], dicas, 'Dicas', now, [review, homonym]);
    expect(changed.map((n) => [n.id, n.text])).toEqual([['r1', 'Ver as [[Dicas|Dicas do Hades]].\n- [ ] [[Dicas|o resto]]']]);
  });

  it('o título novo de outra anotação, mais antiga, ou com colchetes: os links ficam como estavam', () => {
    const now = '2026-10-08T00:00:00.000Z';
    const compras = note('n1', 'Compras', '', '2026-01-01T00:00:00.000Z');
    const mercado = note('n2', 'Mercado', '', '2026-05-01T00:00:00.000Z');
    const list = note('n3', 'Lista', 'ver [[Mercado]]');
    // o link "[[Compras]]" abriria a Compras, mais antiga: o de Mercado não vira ele
    expect(relinkAfterRename([compras, mercado, list], mercado, 'Compras', now)).toEqual([]);
    // "[[Compras [casa]]]" não seria um link
    expect(relinkAfterRename([compras, mercado, list], mercado, 'Mercado [casa]', now)).toEqual([]);
    expect(linkableTitle('Mercado [casa]')).toBeFalse();
    expect(linkableTitle('Mercado')).toBeTrue();
  });

  it('um caractere de uso privado no texto não vira link; a tarefa marca com \\r\\n no texto', () => {
    expect(parseInline(' e [[Compras]]')).toEqual([{ text: ' e ' }, { text: 'Compras', link: true }]);
    expect(toggleCheck('- [ ] leite\r\n- [ ] ovos', 1)).toBe('- [ ] leite\n- [x] ovos');
  });

  it('a tarefa marcada com links oferece as anotações abertas que ela abre (sem repetir, sem a própria, sem as finalizadas)', () => {
    const bug = note('nbug00001', 'Corrigir bug');
    const testes = note('ntest0001', 'Testes');
    const feita = { ...note('nfeita001', 'Feita'), doneAt: '2026-10-05T10:00:00.000Z' };
    const daily = note('ndaily001', 'Daily');
    const notes = [bug, testes, feita, daily];
    const text = 'Hoje:\r\n- [x] [[Corrigir bug]] e [[corrigir bug|de novo]] e [[Testes]]\n- [ ] [[Testes]]\n- [x] [[Feita]] [[Daily]] [[Nenhuma]]\n[[Testes]]';
    expect(linkedOnCheckedTask(text, 1, notes, daily.id).map((n) => n.game.name)).toEqual(['Corrigir bug', 'Testes']);
    // desmarcada, finalizada, a própria, um link que não abre nada, fora de uma tarefa
    expect(linkedOnCheckedTask(text, 2, notes, daily.id)).toEqual([]);
    expect(linkedOnCheckedTask(text, 3, notes, daily.id)).toEqual([]);
    expect(linkedOnCheckedTask(text, 4, notes, daily.id)).toEqual([]);
    expect(linkedOnCheckedTask(text, 9, notes, daily.id)).toEqual([]);
  });

  it('a tarefa feita de dentro de um card também oferece finalizar a anotação dela', () => {
    const bug = note('nbug0001', 'Corrigir bug');
    const text = '> [!todo] Hoje\n> - [x] [[Corrigir bug]]\n> - [ ] [[Corrigir bug]]';
    expect(linkedOnCheckedTask(text, 1, [bug], 'noutra01').map((n) => n.game.name)).toEqual(['Corrigir bug']);
    expect(linkedOnCheckedTask(text, 2, [bug], 'noutra01')).toEqual([]);
  });

  it('o link dentro de um código ou escapado é só texto: não conta, não cita e não muda de nome', () => {
    const text = 'use `[[Foo]]` e \\[[Foo]] e [[Foo]]\n```\n[[Foo]]\n```';
    expect(linksIn(text)).toEqual(['Foo']);
    expect(renameLinks(text, 'Foo', 'Bar')).toBe('use `[[Foo]]` e \\[[Foo]] e [[Bar|Foo]]\n```\n[[Foo]]\n```');
    expect(linksIn('```\n- [x] [[Foo]]\n```')).toEqual([]);
    expect(renameLinks('nada aqui', 'Foo', 'Bar')).toBe('nada aqui');
  });
});

describe('a anotação criada por um link (linkedNote)', () => {
  const now = '2026-11-01T12:00:00.000Z';

  it('nasce vazia, só com o título (os espaços a mais saem), no grupo e na pasta de onde veio', () => {
    const n = linkedNote('  Vender   a TV ', { category: 'Casa', folder: 'pmudanca001', audience: 'privada' }, 'nova-anotacao', now, '2026-11-01')!;
    expect(n.id).toBe('nova-anotacao');
    expect(n.kind).toBe('anotacoes');
    expect(n.game).toEqual(jasmine.objectContaining({ name: 'Vender a TV', coverUrl: null, source: 'manual' }));
    expect(n.text).toBe('');
    expect(n.category).toBe('Casa');
    expect(n.folder).toBe('pmudanca001');
    expect(n.private).toBeTrue();
    expect(n.completedAt).toBe('2026-11-01');
    expect(n.createdAt).toBe(now);
    expect(n.updatedAt).toBe(now);
    expect(n.doneAt).toBeUndefined();
    expect(n.noteRank).toBeUndefined();
    // o link para ela abre ela
    expect(resolveNote([note('n1', 'Outra'), n], 'vender a tv')?.id).toBe('nova-anotacao');
  });

  it('sem grupo (a resenha), nas Anotações sem grupo; a pasta das sem grupo vai junto', () => {
    const n = linkedNote('Ideias', { category: null, folder: null, audience: 'privada' }, 'nova-anotacao', now, '2026-11-01')!;
    expect(n.category).toBeUndefined();
    expect(n.folder).toBeUndefined();
    expect(linkedNote('Ideias', { category: '', folder: 'psoltas0001', audience: 'privada' }, 'nova-anotacao', now, '2026-11-01')!.folder).toBe('psoltas0001');
  });

  it('quem vê: a do grupo, mas sem ir para o Feed; dentro de uma compartilhada, privada', () => {
    expect(linkedAudience({ audience: 'privada' })).toBe('privada');
    expect(linkedAudience({ audience: 'visivel' })).toBe('visivel');
    expect(linkedAudience({ audience: 'publicar' })).toBe('visivel');
    expect(linkedAudience({ audience: 'publicar', shared: true })).toBe('privada');
    const pub = linkedNote('Pública', { audience: 'publicar' }, 'nova-anotacao', now, '2026-11-01')!;
    expect(pub.private).toBeUndefined();
    expect(pub.quiet).toBeTrue();
    expect(pub.publishedAt).toBeUndefined();
  });

  it('o título que um link escreve: sem os espaços a mais; null o que não cabe', () => {
    expect(linkTitleOf('  Vender   a TV ')).toBe('Vender a TV');
    for (const t of ['', '  ', 'a]b', 'a|b']) expect(linkTitleOf(t)).withContext(t).toBeNull();
  });

  it('o título que não cabe num link (vazio, com colchete ou "|") não vira anotação', () => {
    for (const t of ['', '   ', 'Compras [casa]', 'a|b']) expect(linkedNote(t, { audience: 'privada' }, 'nova-anotacao', now, '2026-11-01')).withContext(t).toBeNull();
  });
});

describe('a nota nova a partir de um trecho (PLANO-NOTA-DE-REFERENCIA.md)', () => {
  const spot = (line: number, text: string, nth = 0, count = 1): TextSpot => ({ line, text, nth, count });

  it('a anotação da folha já nasce com o texto, as tags e a cartolina sorteada', () => {
    const n = linkedNote('Paris', { category: 'Viagens', audience: 'privada' }, 'nova-anotacao', '2026-11-23T10:00:00.000Z', '2026-11-23', {
      text: 'A capital.',
      tags: ['França'],
      stock: 'verde',
    })!;
    expect(n.text).toBe('A capital.');
    expect(n.tags).toEqual(['França']);
    expect(n.stock).toBe('verde');
  });

  it('o link: o trecho, ou o título com o trecho depois da barra (o que se lê não muda)', () => {
    expect(spotLink('Paris', 'Paris')).toBe('[[Paris]]');
    expect(spotLink('paris', 'Paris')).toBe('[[Paris]]');
    expect(spotLink('A capital da França ', 'Paris')).toBe('[[A capital da França|Paris]]');
  });

  it('o trecho vira título só sem colchetes nem "|", e até 200 letras', () => {
    expect(spotTitle('Paris')).toBeTrue();
    for (const t of ['', 'a [b]', 'a|b', 'x'.repeat(201), ' Paris']) expect(spotTitle(t)).withContext(t).toBeFalse();
    expect(spotTitle('x'.repeat(200))).toBeTrue();
  });

  it('vira link no lugar selecionado, numa lista, num negrito e dentro de um card', () => {
    const text = 'Viagem\n- fui a Paris em maio\n**Paris é linda**\n> [!nota] Dica\n> veja Paris de noite';
    expect(linkSpot(text, text, spot(1, 'Paris'), 'Paris')).toBe('Viagem\n- fui a [[Paris]] em maio\n**Paris é linda**\n> [!nota] Dica\n> veja Paris de noite');
    expect(linkSpot(text, text, spot(2, 'Paris'), 'Paris')).toContain('**[[Paris]] é linda**');
    expect(linkSpot(text, text, spot(4, 'Paris'), 'Cidade')).toContain('> veja [[Cidade|Paris]] de noite');
  });

  it('no título de um card (o que abre e fecha também), com o sutil e o japonês', () => {
    const text = '> [!vazio|cartolina]- ((山田さん)): ケンくんはベッドにいますか？\n> \n> ### ***Romaji***';
    expect(linkSpot(text, text, spot(0, 'くんはベ'), 'くんはベ')).toBe('> [!vazio|cartolina]- ((山田さん)): ケン[[くんはベ]]ッドにいますか？\n> \n> ### ***Romaji***');
    // dentro do sutil também (a marca continua)
    expect(linkSpot(text, text, spot(0, '山田'), '山田')).toContain('(([[山田]]さん))');
  });

  it('dentro de um spoiler em itálico, num card: o link fica dentro dele', () => {
    const text = '> [!vazio|verde]- Romaji\n> *||Yuki-chan, ashita wa yasumi desu||*';
    expect(linkSpot(text, text, spot(1, 'ita wa ya'), 'ita wa ya')).toBe('> [!vazio|verde]- Romaji\n> *||Yuki-chan, ash[[ita wa ya]]sumi desu||*');
  });

  it('com o trecho repetido na linha, vale a vez selecionada', () => {
    const text = 'Paris, Paris e Paris';
    expect(linkSpot(text, text, spot(0, 'Paris', 1, 3), 'Paris')).toBe('Paris, [[Paris]] e Paris');
    expect(linkSpot(text, text, spot(0, 'Paris', 2, 3), 'Paris')).toBe('Paris, Paris e [[Paris]]');
  });

  it('a linha desenhada mostra outra conta: vale a única vez em que é texto comum; na dúvida, nada', () => {
    // o link que já existe mostra "Paris" também, mas não vira outro link
    const one = 'Paris e [[Paris]]';
    expect(linkSpot(one, one, spot(0, 'Paris', 0, 2), 'Paris')).toBe('[[Paris]] e [[Paris]]');
    expect(linkSpot(one, one, spot(0, 'Paris', 0, 3), 'Paris')).toBe('[[Paris]] e [[Paris]]');
    const two = 'Paris, Paris e `Paris`';
    expect(linkSpot(two, two, spot(0, 'Paris', 0, 2), 'Paris')).toBeNull();
  });

  it('não vira link o que não é texto comum: código, escapado, dentro de outro link, de um endereço, de um bloco de código', () => {
    const cases = ['use `Paris` aqui', 'veja \\Paris', '[[Paris de noite]]', 'https://paris.fr/Paris', '[site](https://x.com/Paris)'];
    for (const t of cases) expect(linkSpot(t, t, spot(0, 'Paris'), 'Paris')).withContext(t).toBeNull();
    const fenced = '```\nParis\n```';
    expect(linkSpot(fenced, fenced, spot(1, 'Paris'), 'Paris')).toBeNull();
  });

  it('acha a linha na versão de agora pelo que ela diz (a nuvem trouxe outra com a folha aberta)', () => {
    const shown = 'um\nfui a Paris\ntrês';
    const now = 'zero\num\nfui a Paris\ntrês';
    expect(linkSpot(shown, now, spot(1, 'Paris'), 'Paris')).toBe('zero\num\nfui a [[Paris]]\ntrês');
    // a linha mudou (ou sumiu): nada
    expect(linkSpot(shown, 'um\nfui a Roma\ntrês', spot(1, 'Paris'), 'Paris')).toBeNull();
    // duas linhas iguais: a mesma da vez
    const twice = 'Paris\nx\nParis';
    expect(linkSpot(twice, 'novo\n' + twice, spot(2, 'Paris'), 'Paris')).toBe('novo\nParis\nx\n[[Paris]]');
  });

  it('o trecho que não cabe num título não vira nada', () => {
    const text = 'a [b] c';
    expect(linkSpot(text, text, spot(0, 'a [b]'), 'a [b]')).toBeNull();
  });

  it('o símbolo que se lê ("→") e o sinal que está escrito ("->"): o link leva o símbolo, e o que se lê não muda', () => {
    const text = 'Rota: Paris -> Lyon, depois Lyon → Nice';
    expect(linkSpot(text, text, spot(0, 'Paris → Lyon'), 'Paris → Lyon')).toBe('Rota: [[Paris → Lyon]], depois Lyon → Nice');
    // escrito com o símbolo mesmo, também
    expect(linkSpot(text, text, spot(0, 'Lyon → Nice'), 'Trecho final')).toBe('Rota: Paris -> Lyon, depois [[Trecho final|Lyon → Nice]]');
    // as duas vezes de "→" na linha contam na ordem
    const both = 'a -> b e a → b';
    expect(linkSpot(both, both, spot(0, 'a → b', 1, 2), 'a → b')).toBe('a -> b e [[a → b]]');
    expect(linkSpot(both, both, spot(0, 'a → b', 0, 2), 'a → b')).toBe('[[a → b]] e a → b');
  });

  it('o trecho com espaços repetidos: o link lê igual, e o título é o de um espaço só', () => {
    expect(spotTitle('São  Paulo')).toBeTrue();
    const text = 'Voo para São  Paulo amanhã';
    expect(linkSpot(text, text, spot(0, 'São  Paulo'), 'São Paulo')).toBe('Voo para [[São  Paulo]] amanhã');
    expect(linkSpot(text, text, spot(0, 'São  Paulo'), 'SP')).toBe('Voo para [[SP|São  Paulo]] amanhã');
  });

  it('na célula de uma tabela: a fileira certa, e o link com outro título leva a barra escapada (não divide a célula)', () => {
    const text = 'Planos\n\n| Cidade | Quando |\n| --- | --- |\n| Paris | maio |\n| Lyon | junho |';
    expect(tableRowLine(text, 2, 0)).toBe(2);
    expect(tableRowLine(text, 2, 1)).toBe(4);
    expect(tableRowLine(text, 2, 2)).toBe(5);
    expect(tableRowLine(text, 2, 3)).toBeNull();
    expect(tableRowLine(text, 0, 1)).toBeNull();
    expect(linkSpot(text, text, spot(5, 'Lyon'), 'Lyon')).toContain('| [[Lyon]] | junho |');
    const aliased = linkSpot(text, text, spot(4, 'maio'), 'Maio de 2026')!;
    expect(aliased).toContain('| Paris | [[Maio de 2026\\|maio]] |');
    // a tabela continua com duas colunas, e o link abre a anotação certa
    expect(linksIn(aliased)).toEqual(['Maio de 2026']);
    const table = parseRich(aliased).find((b) => b.kind === 'table') as { rows: { text: string; ref?: string }[][][] };
    expect(table.rows[0].length).toBe(2);
    expect(table.rows[0][1][0]).toEqual(jasmine.objectContaining({ text: 'maio', link: true, ref: 'Maio de 2026' }));
  });

  it('a tabela com a marca do jeito em cima ({tabela: ...}) e a de dentro de um card', () => {
    const marked = '{tabela: caneta}\n| a | b |\n| --- | --- |\n| x | y |';
    expect(tableRowLine(marked, 0, 1)).toBe(3);
    const card = '> [!nota] Dados\n> | a | b |\n> | --- | --- |\n> | x | y |';
    expect(tableRowLine(card, 1, 1)).toBe(3);
    expect(linkSpot(card, card, spot(3, 'y'), 'Ypsilon')).toBe('> [!nota] Dados\n> | a | b |\n> | --- | --- |\n> | x | [[Ypsilon\\|y]] |');
  });
});

describe('o link com a barra escapada da célula de tabela', () => {
  it('o título não leva a barra de trás', () => {
    expect(splitLink('Maio de 2026\\|maio')).toEqual({ title: 'Maio de 2026', label: 'maio' });
    expect(linksIn('| [[Torre\\|Paris]] | x |\n| --- | --- |')).toEqual(['Torre']);
  });

  it('renomear a anotação mantém a barra escapada na tabela, e escapa a do link simples que ganha texto', () => {
    const text = '| a | b |\n| --- | --- |\n| [[Torre\\|Paris]] | [[Torre]] |\nfora: [[Torre]]';
    expect(renameLinks(text, 'Torre', 'Torre Eiffel')).toBe('| a | b |\n| --- | --- |\n| [[Torre Eiffel\\|Paris]] | [[Torre Eiffel\\|Torre]] |\nfora: [[Torre Eiffel|Torre]]');
  });
});
