import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mural } from '../core/mural';
import { sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SideBySide } from '../core/side-by-side';
import { WallAccess, WallBoard } from '../pages/wall-board';

const ACCESS: WallAccess = {
  landingId: null,
  picking: false,
  picked: new Map(),
  masked: false,
  secret: new Set(),
  reactCode: null,
  checkable: true,
  looks: {},
};

/** Nas análises, marcar é o Lado a lado (PLANO-SELECAO.md, 1): Ctrl+clique e Shift+clique marcam nele. */
describe('marcar análises (NoteSelection com o Lado a lado)', () => {
  let el: HTMLElement;
  let side: SideBySide;
  let opened: string[];

  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  beforeEach(async () => {
    localStorage.clear();
    opened = [];
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const store = TestBed.inject(ReviewStore);
    for (const [id, name, day] of [
      ['rjog0001', 'Hades', '01'],
      ['rjog0002', 'Celeste', '02'],
      ['rjog0003', 'Tunic', '03'],
    ]) {
      store.add(
        sanitizeReview({
          id,
          kind: 'jogos',
          game: { name, coverUrl: null, source: 'manual' },
          text: '',
          scores: { final: 8 },
          status: 'finalizado',
          completedAt: `2026-10-${day}`,
          createdAt: `2026-10-${day}T10:00:00.000Z`,
          updatedAt: `2026-10-${day}T10:00:00.000Z`,
        })!,
      );
    }
    TestBed.inject(Mural).kind.set('jogos');
    side = TestBed.inject(SideBySide);
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  async function hit(id: string): Promise<HTMLElement> {
    for (let i = 0; i < 100; i++) {
      const h = el.querySelector<HTMLElement>(`.lugar[data-lugar="${id}"] .hit`);
      if (h) return h;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`a ficha ${id} não apareceu`);
  }
  const click = (target: HTMLElement, mods: { ctrl?: boolean; shift?: boolean } = {}) => {
    const init = {
      bubbles: true,
      cancelable: true,
      ctrlKey: !!mods.ctrl,
      shiftKey: !!mods.shift,
      button: 0,
    };
    target.dispatchEvent(new PointerEvent('pointerdown', init));
    target.dispatchEvent(new MouseEvent('click', init));
  };

  it('Ctrl+clique marca no Lado a lado e liga o modo; Pronto sai e as marcas ficam para comparar', async () => {
    click(await hit('rjog0002'), { ctrl: true });
    TestBed.tick();
    expect(side.picking()).toBeTrue();
    expect(side.reviews().map((r) => r.id)).toEqual(['rjog0002']);
    expect(opened).toEqual([]);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    TestBed.tick();
    expect(side.picking()).toBeFalse();
    expect(side.reviews().map((r) => r.id)).toEqual(['rjog0002']);
    // fora do modo, o toque abre, e as guardadas não ficam com o tracejado
    await new Promise((r) => setTimeout(r, 20));
    click(await hit('rjog0001'));
    expect(opened).toEqual(['rjog0001']);
    expect(el.querySelectorAll('[data-marcada]').length).toBe(0);
  });

  it('Shift+clique marca o intervalo, seguindo as que o Lado a lado já tinha', async () => {
    side.setIds(['rjog0001']);
    const ids = Array.from(el.querySelectorAll('.lugar[data-lugar]'), (e) => e.getAttribute('data-lugar')!);
    click(await hit(ids[0]), { ctrl: true });
    click(await hit(ids[2]), { shift: true });
    TestBed.tick();
    expect(new Set(side.reviews().map((r) => r.id))).toEqual(new Set(ids));
  });
});
