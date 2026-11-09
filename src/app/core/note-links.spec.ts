import { Review, sanitizeReview } from './review';
import { linkKey, linkTitleOf, linkedAudience, linkedNote, linkedOnCheckedTask, linkableTitle, linksIn, relinkAfterRename, renameLinks, resolveNote } from './note-links';
import { hasFormatting, parseInline, plainText, toggleCheck } from './rich-text';

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
