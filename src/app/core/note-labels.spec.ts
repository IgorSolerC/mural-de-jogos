import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from './review';
import { MAX_TAGS, categoryBonus, categoryLibrary, cleanCategory, cleanTag, sanitizeTags, tagLibrary } from './note-labels';
import { Settings } from './settings';
import { fingerprint, pinnedTagsOf } from './cloud-sync';

/** A categoria (uma, o assunto) e as tags (várias, informam) das anotações. */

const note = (id: string, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: id }, completedAt: '2026-10-01', createdAt: '2026-10-01T10:00:00.000Z', ...extra })!,
  id,
});

describe('categoria e tags das anotações', () => {
  it('limpam o que foi escrito: a categoria com maiúscula, a tag como foi escrita, sem "#"', () => {
    expect(cleanCategory('  lista   de compras ')).toBe('Lista de compras');
    expect(cleanTag('  #BugFix  ')).toBe('BugFix');
    expect(sanitizeTags(['Bug', 'bug', ' UI ', '', 3, 'Ação', 'acao'])).toEqual(['Bug', 'UI', 'Ação']);
    expect(sanitizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length).toBe(MAX_TAGS);
  });

  it('a anotação no formato novo fica como está; a de antes vira categoria + tags', () => {
    const fresh = note('n1', { category: 'trabalho', tags: ['Bugfix', 'bugfix', 'Feature'] });
    expect([fresh.category, fresh.tags]).toEqual(['Trabalho', ['Bugfix', 'Feature']]);
    // formato novo sem categoria: os adesivos (se sobraram) não voltam
    expect(note('n2', { tags: [], bonuses: [{ label: 'Casa', kind: 'favor' }] }).category).toBeUndefined();
    const legacy = note('n3', { bonuses: [{ id: 'a-fazer', label: 'x', kind: 'favor' }, { label: 'Carro', kind: 'favor' }, { label: 'Urgente', kind: 'favor' }] });
    expect([legacy.category, legacy.tags, legacy.bonuses]).toEqual(['A fazer', ['Carro', 'Urgente'], []]);
    // sem nada: sem os campos
    const bare = note('n4');
    expect('category' in bare || 'tags' in bare).toBeFalse();
  });

  it('a categoria da cartela leva o desenho dela; a escrita à mão, a pasta', () => {
    expect(categoryBonus('trabalho').id).toBe('trabalho');
    expect(categoryBonus('Projeto X').id).toBe('cat-projeto-x');
    const lib = categoryLibrary([note('n1', { category: 'Projeto X' }), note('n2', { category: 'Trabalho' })]);
    expect(lib.at(-1)!.label).toBe('Projeto X');
    expect(lib.filter((b) => b.label === 'Trabalho').length).toBe(1);
  });

  it('as tags à mão: as fixas primeiro (mesmo sem uso), depois as mais usadas', () => {
    const notes = [note('n1', { tags: ['UI', 'Bugfix'] }), note('n2', { tags: ['bugfix'] }), note('n3', { tags: ['Docs'] })];
    expect(tagLibrary(notes, ['Feature', 'UI']).map((t) => [t.label, t.n, t.pinned])).toEqual([
      ['Feature', 0, true],
      ['UI', 1, true],
      ['Bugfix', 2, false],
      ['Docs', 1, false],
    ]);
  });

  it('as tags usadas são sugeridas só na mesma categoria; as fixas, em todas', () => {
    const notes = [
      note('n1', { category: 'Trabalho', tags: ['Bugfix'] }),
      note('n2', { category: 'trabalho', tags: ['Deploy'] }),
      note('n3', { category: 'Estudos', tags: ['Prova'] }),
      note('n4', { tags: ['Solta'] }),
    ];
    const labels = (c: string | null) => tagLibrary(notes, ['UI'], c).map((t) => t.label);
    expect(labels('Trabalho')).toEqual(['UI', 'Bugfix', 'Deploy']);
    expect(labels('Estudos')).toEqual(['UI', 'Prova']);
    expect(labels(null)).toEqual(['UI', 'Solta']);
    expect(labels('Lista de compras')).toEqual(['UI']);
  });

  describe('as tags fixas', () => {
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    });
    afterEach(() => localStorage.clear());

    it('fixar e soltar (sem ligar para caixa) marca a hora da mudança, e fica guardado', () => {
      const s = TestBed.inject(Settings);
      s.togglePinnedTag('Bugfix');
      s.togglePinnedTag('Feature');
      expect(s.pinnedTags()).toEqual(['Bugfix', 'Feature']);
      expect(s.isPinnedTag('BUGFIX')).toBeTrue();
      s.togglePinnedTag('bugfix');
      expect(s.pinnedTags()).toEqual(['Feature']);
      expect(s.pinnedTagsAt()).not.toBe('');
      TestBed.tick();
      expect(JSON.parse(localStorage.getItem('mural-de-jogos:config:v1')!).pinnedTags).toEqual(['Feature']);
    });

    it('vão para a nuvem como as chaves: entram na impressão do mural e voltam limpas', async () => {
      const doc = { reviews: [], drafts: [], wishes: [], deleted: { reviews: {}, drafts: {}, wishes: {} } };
      const tags = { lista: ['Bugfix'], em: '2026-10-08T00:00:00.000Z' };
      expect(await fingerprint(doc, null, tags)).not.toBe(await fingerprint(doc));
      expect(pinnedTagsOf({ tagsFixas: { lista: ['#Bug', 'bug', 'UI'], em: '2026-10-08T00:00:00.000Z' } })).toEqual({ lista: ['Bug', 'UI'], em: '2026-10-08T00:00:00.000Z' });
      expect(pinnedTagsOf({ tagsFixas: { lista: ['x'] } })).toBeNull();
    });
  });
});
