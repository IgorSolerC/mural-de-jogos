import { Review, sanitizeReview } from './review';
import { backlinkLine, backlinksOf, linkKey, linkedOnCheckedTask, linkableTitle, linksIn, relinkAfterRename, renameLinks, resolveNote, sameTitle } from './note-links';
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
    expect(renameLinks('[[compras|a lista]] e [[Compras]]', 'Compras', 'Mercado')).toBe('[[Mercado|a lista]] e [[Mercado]]');
    expect(plainText('ver [[Compras|a lista]]')).toBe('ver a lista');
    expect(linkableTitle('Casa | praia')).toBeFalse();
  });

  it('o título vale sem maiúsculas, acentos e espaços a mais; com dois iguais, abre o mais antigo', () => {
    expect(linkKey('  Lista  de Mercado ')).toBe(linkKey('lista de mercado'));
    expect(linkKey('Ação')).toBe('acao');
    const old = note('n1', 'Comprar um console', '', '2026-01-01T00:00:00.000Z');
    const novo = note('n2', 'comprar um CONSOLE', '', '2026-05-01T00:00:00.000Z');
    expect(resolveNote([novo, old], 'Comprar um console')?.id).toBe('n1');
    expect(resolveNote([novo, old], 'Outra')).toBeNull();
    expect(resolveNote([novo, old], '   ')).toBeNull();
    expect(sameTitle([novo, old], 'Comprar um console', 'n2')?.id).toBe('n1');
    expect(sameTitle([old], 'Comprar um console', 'n1')).toBeNull();
  });

  it('trocar o título leva junto os links que abriam a anotação, e só esses', () => {
    expect(renameLinks('1. [[console]]\n2. [[Outra]] [[CONSOLE]]', 'Console', 'PS5')).toBe('1. [[PS5]]\n2. [[Outra]] [[PS5]]');
    const target = note('n1', 'Console', '', '2026-01-01T00:00:00.000Z');
    const list = note('n2', 'A fazeres', '1. Arrumar o carro\n2. [[Console]]');
    const other = note('n3', 'Ideias', 'nada aqui');
    const now = '2026-10-08T00:00:00.000Z';
    const changed = relinkAfterRename([target, list, other], target, 'Comprar um PS5', now);
    expect(changed.map((n) => [n.id, n.text, n.updatedAt])).toEqual([['n2', '1. Arrumar o carro\n2. [[Comprar um PS5]]', now]]);
    // só mudou maiúscula: nada a fazer
    expect(relinkAfterRename([target, list], target, 'CONSOLE', now)).toEqual([]);
    // a gêmea mais nova muda de nome: os links continuam na mais antiga
    const twin = note('n4', 'Console', '', '2026-06-01T00:00:00.000Z');
    expect(relinkAfterRename([target, list, twin], twin, 'Console 2', now)).toEqual([]);
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

  it('as anotações que apontam para uma, das mais antigas para as mais novas, e a linha onde cada uma a cita', () => {
    const bug = note('nbug00001', 'Corrigir bug', '', '2026-10-03T10:00:00.000Z');
    const daily = note('ndaily001', 'Daily', 'Revisar.\n- [ ] [[corrigir  BUG|o bug do login]] hoje', '2026-10-02T10:00:00.000Z');
    const reuniao = note('nreun0001', 'Reunião', '1. Pauta: [[Corrigir bug]] e [[Outra]]', '2026-10-01T10:00:00.000Z');
    const solta = note('nsolta001', 'Solta', 'Nada aqui.');
    const notes = [bug, daily, reuniao, solta];
    expect(backlinksOf(bug, notes).map((n) => n.game.name)).toEqual(['Reunião', 'Daily']);
    expect(backlinksOf(solta, notes)).toEqual([]);
    expect(backlinkLine(daily, bug, notes)).toBe('o bug do login hoje');
    expect(backlinkLine(reuniao, bug, notes)).toBe('Pauta: Corrigir bug e Outra');
    expect(backlinkLine(solta, bug, notes)).toBeNull();
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
});
