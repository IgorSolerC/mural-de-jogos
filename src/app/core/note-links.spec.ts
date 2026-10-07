import { Review, sanitizeReview } from './review';
import { linkKey, linksIn, relinkAfterRename, renameLinks, resolveNote, sameTitle } from './note-links';
import { hasFormatting, parseInline, plainText } from './rich-text';

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
});
