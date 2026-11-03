import { Review, sanitizeReview } from './review';
import { relinkAfterRename, renameLinks } from './note-links';
import { readCardRef, parseWidgetLine } from './widgets';

/** Revisão das notas ligadas (code-review): a nota colada escrita à mão, só com o título, segue a anotação renomeada. */

const note = (id: string, title: string, text = '', createdAt = '2026-10-01T10:00:00.000Z'): Review =>
  ({ ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, text, completedAt: '2026-10-01', createdAt, updatedAt: createdAt })!, id });

describe('notas ligadas: revisão (renameLinks e a nota colada à mão)', () => {
  it('"{{nota: título}}" escrita à mão muda junto com o título, com o jeito, o começo, o tamanho e o recuo', () => {
    expect(renameLinks('{{nota: console}}', 'Console', 'Comprar um PS5')).toBe('{{nota: Comprar um PS5}}');
    expect(renameLinks('- item\n  {{nota: Console | inteira | fechada | grande}}', 'Console', 'PS5')).toBe('- item\n  {{nota: PS5 | inteira | fechada | grande}}');
    expect(renameLinks('{{ficha: CONSOLE | tira}}', 'Console', 'PS5')).toBe('{{nota: PS5 | tira}}');
    // um título novo que é uma palavra de jeito: vai depois delas, para continuar sendo o título
    const capa = parseWidgetLine(renameLinks('{{nota: Console | capa}}', 'Console', 'Inteira'))!;
    expect(readCardRef(capa.args)).toEqual(jasmine.objectContaining({ id: '', title: 'Inteira', look: 'capa' }));
  });

  it('dentro de um card, o "> " fica; no bloco de código, nada muda', () => {
    expect(renameLinks('> [!nota] Lista\n> {{nota: Console}}', 'Console', 'PS5')).toBe('> [!nota] Lista\n> {{nota: PS5}}');
    const code = '```\n{{nota: Console}}\n```';
    expect(renameLinks(code, 'Console', 'PS5')).toBe(code);
  });

  it('a com o id e a de outro título ficam como estão (o id já segue a ficha)', () => {
    const text = '{{nota: #rabc123 | Console}}\n{{nota: Outra}}\n{{nota: #rabc123 | 🔒}}';
    expect(renameLinks(text, 'Console', 'PS5')).toBe(text);
  });

  it('relinkAfterRename leva a nota colada à mão das outras anotações, junto com os links', () => {
    const now = '2026-10-08T00:00:00.000Z';
    const target = note('n1', 'Console', '', '2026-01-01T00:00:00.000Z');
    const list = note('n2', 'A fazeres', '[[Console]]\n{{nota: Console | tira}}');
    const changed = relinkAfterRename([target, list], target, 'PS5', now);
    expect(changed.map((n) => n.text)).toEqual(['[[PS5]]\n{{nota: PS5 | tira}}']);
  });
});
