import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mural } from '../core/mural';
import { Kind, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { WallAccess, WallBoard } from './wall-board';

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };

const SCORES: Record<string, Record<string, number>> = {
  jogos: { diversao: 8, historia: 8, jogabilidade: 8, visual: 8 },
  musicas: { envolvimento: 9, letra: 9, vocal: 9, instrumental: 9 },
  anotacoes: { final: 0 },
};

/** As fichas com orelha (a categoria da anotação, o artista da música): a seção abre lugar para ela no alto. */
describe('a parede abre lugar para as orelhas', () => {
  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  async function wall(kind: Kind): Promise<HTMLElement> {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).add(
      sanitizeReview({
        id: 'rorel001',
        kind,
        game: { name: 'Uma ficha', coverUrl: null, source: 'manual' },
        category: 'Radiohead',
        scores: SCORES[kind],
        status: 'finalizado',
        stock: 'azul',
        completedAt: '2026-10-02',
        createdAt: '2026-10-02T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
      })!,
    );
    TestBed.inject(Mural).kind.set(kind);
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  for (const [kind, room] of [['musicas', 18], ['anotacoes', 18], ['jogos', 0]] as const) {
    it(`${kind}: ${room ? 'a primeira fileira desce para a orelha' : 'sem orelha, nada muda'}`, async () => {
      const el = await wall(kind);
      const board = el.querySelector('.wall')!;
      expect(board.classList.contains('com-orelhas')).toBe(room > 0);
      // a 1300px de tela (o Karma abre largo): a ficha completa
      if (innerWidth > 559) expect(parseFloat(getComputedStyle(board.querySelector('.fichas')!).paddingTop)).toBe(room);
    });
  }
});
