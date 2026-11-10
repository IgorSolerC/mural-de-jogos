import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoteBulk, patched } from './note-bulk';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { StudyStore } from './study-store';

const T0 = '2026-10-01T10:00:00.000Z';
const NOW = '2026-11-09T10:00:00.000Z';
const note = (id: string, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: id, coverUrl: null, source: 'manual' }, text: '', completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
  id,
});

/** Mudar várias de uma vez (PLANO-SELECAO.md, 3): só o que a folha mexeu, o resto de cada uma fica. */
describe('editar as marcadas (core/note-bulk.ts)', () => {
  it('mudar de grupo tira da pasta; a pasta pedida no mesmo grupo entra', () => {
    const r = note('nbulk0001', { category: 'Estudos', folder: 'phist000001' });
    expect(patched(r, { category: 'Trabalho' }, NOW).folder).toBeUndefined();
    expect(patched(r, { category: 'Trabalho' }, NOW).category).toBe('Trabalho');
    expect(patched(r, { category: null }, NOW).category).toBeUndefined();
    expect(patched(r, { folder: 'pprog000001' }, NOW).folder).toBe('pprog000001');
    expect(patched(r, { folder: null }, NOW).folder).toBeUndefined();
    // o mesmo grupo escrito de outro jeito não é outro grupo
    expect(patched(r, { category: 'estudos' }, NOW).folder).toBe('phist000001');
  });

  it('as tags não se sobrescrevem: as de todas entram, as tiradas saem, as outras de cada uma ficam', () => {
    const r = note('nbulk0002', { tags: ['Bug', 'Login', 'Urgente'] });
    const next = patched(r, { tags: { all: ['Feature', 'bug'], drop: ['Urgente'] } }, NOW);
    expect(next.tags).toEqual(['Login', 'Feature', 'bug']);
    expect(patched(note('nbulk0003', { tags: ['Urgente'] }), { tags: { all: [], drop: ['urgente'] } }, NOW).tags).toBeUndefined();
  });

  it('Público vale para o mural sem aviso no Feed; Privado tira a marca', () => {
    const priv = note('nbulk0004', { private: true });
    const pub = patched(priv, { audience: 'publica' }, NOW);
    expect(pub.private).toBeUndefined();
    expect(pub.quiet).toBeTrue();
    const back = patched(pub, { audience: 'privada' }, NOW);
    expect(back.private).toBeTrue();
    expect(back.quiet).toBeUndefined();
    // a que já era pública fica como está (não perde o Feed)
    const feed = note('nbulk0005');
    expect(patched(feed, { audience: 'publica' }, NOW)).toEqual(feed);
  });

  it('a cartolina e fixar; sem permissão (a compartilhada), quem vê e a cartolina ficam', () => {
    const r = note('nbulk0006', { stock: 'azul' });
    expect(patched(r, { stock: 'rosa', pinned: true }, NOW).stock).toBe('rosa');
    expect(patched(r, { pinned: true }, NOW).noteRank).toBe('fixada');
    const kept = patched(note('nbulk0007', { stock: 'azul', private: true }), { stock: 'rosa', audience: 'publica' }, NOW, { audience: false, stock: false });
    expect(kept.stock).toBe('azul');
    expect(kept.private).toBeTrue();
  });

  describe('gravando', () => {
    let store: ReviewStore;
    let bulk: NoteBulk;
    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      bulk = TestBed.inject(NoteBulk);
      store.reviews.set([note('nbulk0010', { category: 'Estudos', tags: ['A'] }), note('nbulk0011', { category: 'Trabalho' }), note('nbulk0012', { category: 'Trabalho', tags: ['B'] })]);
    });
    afterEach(() => localStorage.clear());

    it('muda todas, conta só as que mudaram, e o Desfazer volta cada uma como era', () => {
      const res = bulk.apply(['nbulk0010', 'nbulk0011', 'nbulk0012'], { category: 'Trabalho', tags: { all: ['Novo'], drop: [] } });
      expect(res.changed).toBe(3);
      expect(store.get('nbulk0010')!.category).toBe('Trabalho');
      expect(store.get('nbulk0010')!.tags).toEqual(['A', 'Novo']);
      expect(store.get('nbulk0012')!.tags).toEqual(['B', 'Novo']);
      res.undo();
      expect(store.get('nbulk0010')!.category).toBe('Estudos');
      expect(store.get('nbulk0010')!.tags).toEqual(['A']);
      expect(store.get('nbulk0011')!.tags).toBeUndefined();
    });

    it('o Desfazer volta só o que a folha mudou: o que mudou depois fica', () => {
      const res = bulk.apply(['nbulk0010'], { audience: 'privada' });
      expect(store.get('nbulk0010')!.private).toBeTrue();
      const now = store.get('nbulk0010')!;
      store.update({ ...now, text: 'Escrito depois', updatedAt: new Date().toISOString() }, now);
      res.undo();
      expect(store.get('nbulk0010')!.private).toBeUndefined();
      expect(store.get('nbulk0010')!.text).toBe('Escrito depois');
    });

    it('a que já estava assim não conta', () => {
      expect(bulk.apply(['nbulk0011', 'nbulk0012'], { category: 'Trabalho' }).changed).toBe(0);
    });

    it('o "Mostrar no mural" dos flashcards, como o interruptor do editor: igual ao do baralho não é guardado', () => {
      const study = TestBed.inject(StudyStore);
      const T = '2026-11-09T10:00:00.000Z';
      const srs = { state: 'nova', step: 0, s: 0, d: 0, due: T, last: null, reps: 0 } as const;
      const card = (note: string, deck: string, wall?: boolean) => ({ note, decks: [deck], front: {}, ...(wall === undefined ? {} : { wall }), srs, stats: { seen: 0, right: 0, wrong: 0, marks: '' }, added: T, at: T });
      study.state.set({
        ...study.state(),
        decks: [
          { id: 'dsolo00001', name: 'Só', icon: null, color: 'laranja', newPerDay: 5, order: 0, group: 'Estudos', at: T },
          { id: 'dmural0001', name: 'Mural', icon: null, color: 'azul', newPerDay: 5, order: 1, group: 'Estudos', wall: true, at: T },
        ],
        cards: [card('nbulk0010', 'dsolo00001'), card('nbulk0011', 'dmural0001', false), card('nbulk0012', 'dmural0001')],
      });
      store.reviews.set(store.reviews().map((r) => ({ ...r, category: 'Estudos' })));
      const res = bulk.apply(['nbulk0010', 'nbulk0011', 'nbulk0012'], { study: { wall: true } });
      expect(res.changed).toBe(2);
      // no baralho que não pede o mural, a escolha fica guardada; no que pede, volta a seguir o baralho
      expect(study.cardOf().get('nbulk0010')!.wall).toBeTrue();
      expect(study.cardOf().get('nbulk0011')!.wall).toBeUndefined();
      expect(study.cardOf().get('nbulk0012')!.wall).toBeUndefined();
      res.undo();
      expect(study.cardOf().get('nbulk0010')!.wall).toBeUndefined();
      expect(study.cardOf().get('nbulk0011')!.wall).toBeFalse();
    });

    it('apagar tira todas, e o Desfazer devolve', () => {
      const res = bulk.remove(['nbulk0010', 'nbulk0011']);
      expect(res.removed).toBe(2);
      expect(store.get('nbulk0010')).toBeUndefined();
      res.undo();
      expect(store.get('nbulk0010')).toBeDefined();
      expect(store.get('nbulk0011')).toBeDefined();
    });
  });
});
