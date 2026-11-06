import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { swapLocalImages } from './images';
import { ImageStore } from './image-store';
import { ImageSync } from './image-sync';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Deck, MAX_CARDS, MAX_DECKS, StudyCard } from './study';
import { DeckCopy, copiedNote, copyLimit, freeDeckName } from './study-copy';
import { StudyStore } from './study-store';

/** Copiar o baralho de outra pessoa (PLANO-BARALHOS-PUBLICOS.md, 3.4). */

const T = '2026-10-20T12:00:00.000Z';
const IMG = 'abcdefghijklmnopqrstuv';
const MINE = 'ZYXWVUTSRQPONMLKJIHGFE';

function theirs(id: string, name: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    category: 'Japonês',
    subject: 'Kanji',
    tags: ['n5'],
    game: { name, coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    stock: 'azul',
    pattern: 'pautado',
    text: `A resposta. {{imagem: murall://imagem/${IMG}}}`,
    completedAt: '2026-10-01',
    createdAt: T,
    updatedAt: T,
    publishedAt: T,
    sharedBy: { codigo: 'K7QF-M2XA', nome: 'Marina' },
    doneAt: T,
    ...extra,
  })!;
}

describe('Copiar baralho (core/study-copy.ts)', () => {
  it('a anotação copiada é sua: no grupo escolhido, privada, sem tags, assunto, dono, finalizada ou datas de lá', () => {
    const now = '2026-11-05T15:00:00.000Z';
    const copy = copiedNote(theirs('nsol1', 'Sol'), 'nnova1', 'Idiomas', now, new Map([[IMG, `murall://imagem/${MINE}`]]))!;
    expect(copy.id).toBe('nnova1');
    expect(copy.game.name).toBe('Sol');
    expect(copy.category).toBe('Idiomas');
    expect(copy.private).toBeTrue();
    // a cartolina vem
    expect(copy.stock).toBe('azul');
    expect(copy.pattern).toBe('pautado');
    for (const k of ['subject', 'tags', 'sharedBy', 'doneAt', 'publishedAt', 'quiet', 'revisitOf'] as const) expect(copy[k]).withContext(k).toBeUndefined();
    expect(copy.createdAt).toBe(now);
    expect(copy.updatedAt).toBe(now);
    // a imagem colada aponta para a cópia sua
    expect(copy.text).toContain(`murall://imagem/${MINE}`);
    expect(copy.text).not.toContain(IMG);
  });

  it('trocar as imagens: só as do mapa; sem mapa, o texto fica', () => {
    const text = `a murall://imagem/${IMG} b murall://imagem/${MINE}`;
    expect(swapLocalImages(text, new Map())).toBe(text);
    expect(swapLocalImages(text, new Map([[IMG, 'X']]))).toBe(`a X b murall://imagem/${MINE}`);
  });

  it('o nome não repete outro baralho do mesmo grupo; de outro grupo, pode', () => {
    const decks = [
      { name: 'Kanji N5', group: 'Japonês' },
      { name: 'kanji n5 2', group: 'Japonês' },
      { name: 'Capitais', group: 'Geografia' },
    ];
    expect(freeDeckName('Kanji N5', 'Japonês', decks)).toBe('Kanji N5 3');
    expect(freeDeckName('Kanji N5', 'Outro', decks)).toBe('Kanji N5');
    expect(freeDeckName('Capitais', 'japones', decks)).toBe('Capitais');
  });

  it('sem lugar: o máximo de baralhos e de cartas', () => {
    expect(copyLimit(MAX_DECKS, 0, 1)).toContain(`${MAX_DECKS} baralhos`);
    expect(copyLimit(1, MAX_CARDS - 2, 3)).toContain(`${MAX_CARDS}`);
    expect(copyLimit(1, 0, 3)).toBeNull();
  });

  describe('DeckCopy', () => {
    let study: StudyStore;
    let store: ReviewStore;
    let copier: DeckCopy;
    let adopt: (id: string) => Promise<{ id: string } | null>;
    const deck: Deck = { id: 'dkanji', name: 'Kanji N5', icon: 'livro', color: 'vermelho', newPerDay: 5, look: 'ingresso', group: 'Japonês', order: 0, at: T, public: true };
    const card = (note: string, title: string, image?: string): StudyCard => ({
      note,
      decks: ['dkanji'],
      front: { title, ...(image ? { image } : {}) },
      srs: { state: 'revisao', step: 0, s: 10, d: 5, due: T, last: T, reps: 4 },
      stats: { seen: 4, right: 4, wrong: 0, marks: '1111' },
      added: T,
      at: T,
    });

    beforeEach(() => {
      localStorage.clear();
      adopt = async (id) => (id === IMG ? { id: MINE } : null);
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          // a imagem de lá já estava aqui (vista na visita): vira sua com outro id
          { provide: ImageStore, useValue: { adopt: (id: string) => adopt(id), add: async () => ({ id: 'nunca' }) } },
          { provide: ImageSync, useValue: { fetch: async () => null, publicUrl: () => null } },
        ],
      });
      study = TestBed.inject(StudyStore);
      store = TestBed.inject(ReviewStore);
      copier = TestBed.inject(DeckCopy);
    });
    afterEach(() => localStorage.clear());

    it('cria o baralho no grupo, uma anotação sua por carta, a frente igual e o progresso do zero; Desfazer tira tudo', async () => {
      const notes = [theirs('nsol1', 'Sol'), theirs('nlua1', 'Lua')];
      const out = await copier.copy({ deck, cards: [card('nsol1', '日', `murall://imagem/${IMG}`), card('nlua1', '月'), card('nsumiu', '火')], notes }, 'Meu Kanji', 'Idiomas');
      expect(out.cards).toBe(2);
      expect(out.lostImages).toBe(0);
      const mine = study.deck(out.id)!;
      expect([mine.name, mine.group, mine.color, mine.icon, mine.look]).toEqual(['Meu Kanji', 'Idiomas', 'vermelho', 'livro', 'ingresso']);
      // o seu nasce privado
      expect(mine.public).toBeUndefined();
      const cards = study.cards().filter((c) => c.decks.includes(out.id));
      expect(cards.length).toBe(2);
      expect(cards.every((c) => c.srs.state === 'nova' && c.stats.seen === 0)).toBeTrue();
      const sol = cards.find((c) => c.front.title === '日')!;
      expect(sol.front.image).toBe(`murall://imagem/${MINE}`);
      const note = store.get(sol.note)!;
      expect(note.id).not.toBe('nsol1');
      expect(note.category).toBe('Idiomas');
      expect(note.private).toBeTrue();
      // só nos Estudos: fora do mural
      expect(study.votes().get(note.id)).toBeFalse();
      out.undo();
      expect(study.deck(out.id)).toBeUndefined();
      expect(store.get(sol.note)).toBeUndefined();
    });

    it('a imagem que não desce fica contada; sem grupo, nada é criado', async () => {
      const notes = [theirs('nsol1', 'Sol', { text: 'sem imagem' })];
      const out = await copier.copy({ deck, cards: [card('nsol1', '日', 'murall://imagem/QQQQQQQQQQQQQQQQQQQQQQ')], notes }, 'Kanji', 'Japonês');
      expect(out.lostImages).toBe(1);
      await expectAsync(copier.copy({ deck, cards: [card('nsol1', '日')], notes }, 'Kanji', '   ')).toBeRejectedWithError('Escolha um grupo para o baralho.');
      expect(study.decks().length).toBe(1);
    });

    it('a imagem que nunca responde não prende a cópia: passa do tempo e conta como a que não veio', async () => {
      adopt = () => new Promise(() => undefined);
      copier.imageWaitMs = 10;
      const notes = [theirs('nsol1', 'Sol', { text: 'sem imagem' })];
      const out = await copier.copy({ deck, cards: [card('nsol1', '日', `murall://imagem/${IMG}`)], notes }, 'Kanji', 'Japonês');
      expect(out.lostImages).toBe(1);
      expect(out.cards).toBe(1);
    });

    it('as imagens descem até quatro ao mesmo tempo, e cada uma vira a sua', async () => {
      const ids = Array.from({ length: 9 }, (_, i) => String(i).repeat(22));
      let open = 0;
      let most = 0;
      adopt = async (id) => {
        open++;
        most = Math.max(most, open);
        await new Promise((resolve) => setTimeout(resolve, 5));
        open--;
        return { id: id.replace(/./g, (c) => String.fromCharCode(97 + Number(c))) };
      };
      const notes = ids.map((id, i) => theirs(`nnota${i}`, `Nota ${i}`, { text: `murall://imagem/${id}` }));
      const out = await copier.copy({ deck, cards: ids.map((_, i) => card(`nnota${i}`, `${i}`)), notes }, 'Kanji', 'Japonês');
      expect(out.lostImages).toBe(0);
      expect(most).toBe(4);
      const texts = study.cards().filter((c) => c.decks.includes(out.id)).map((c) => store.get(c.note)!.text);
      expect(texts).toContain(`murall://imagem/${'c'.repeat(22)}`);
      expect(texts.every((t) => !ids.some((id) => t.includes(id)))).toBeTrue();
    });
  });
});
