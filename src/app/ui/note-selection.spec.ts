import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mural } from '../core/mural';
import { sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { WallState } from '../core/wall-view';
import { Toasts } from './toast';
import { WallAccess, WallBoard } from '../pages/wall-board';

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };

/** Ctrl+clique marca anotações no mural; Ctrl+C copia o texto delas; Esc ou outro toque desmarca. */
describe('marcar anotações para copiar (NoteSelection, no mural)', () => {
  let el: HTMLElement;
  let copied: string[];

  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  beforeEach(async () => {
    localStorage.clear();
    copied = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => void copied.push(t));
    const store = TestBed.inject(ReviewStore);
    for (const [id, name, text, day] of [
      ['rsel0001', 'Mercado', 'Pão e café', '01'],
      ['rsel0002', 'Trabalho', '- [ ] Relatório', '02'],
    ]) {
      store.add(
        sanitizeReview({
          id,
          kind: 'anotacoes',
          game: { name, coverUrl: null, source: 'manual' },
          text,
          scores: { final: 0 },
          status: 'finalizado',
          completedAt: `2026-10-${day}`,
          createdAt: `2026-10-${day}T10:00:00.000Z`,
          updatedAt: `2026-10-${day}T10:00:00.000Z`,
        })!,
      );
    }
    TestBed.inject(Mural).kind.set('anotacoes');
    TestBed.inject(WallState).setDensity('lista');
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  const row = (id: string) => el.querySelector<HTMLElement>(`.linha[data-ficha="${id}"]`)!;
  const ctrlClick = (target: HTMLElement, ctrl = true) => {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: ctrl, button: 0 }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ctrl, button: 0 }));
  };
  const key = (k: string, ctrl = false) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: ctrl, bubbles: true, cancelable: true }));
  const marked = () => Array.from(el.querySelectorAll('[data-marcada]'), (e) => e.getAttribute('data-ficha'));

  it('Ctrl+clique marca, na ordem, sem abrir a leitura; de novo, desmarca', async () => {
    let opened = 0;
    el.querySelector('app-note-index')!.addEventListener('click', () => opened++);
    ctrlClick(row('rsel0002').querySelector('.hit')!);
    ctrlClick(row('rsel0001').querySelector('.hit')!);
    await Promise.resolve();
    TestBed.tick();
    expect(opened).toBe(0);
    expect(marked()).toEqual(['rsel0002', 'rsel0001']);
    expect(row('rsel0002').style.getPropertyValue('--marca-n')).toBe('1');
    expect(row('rsel0001').style.getPropertyValue('--marca-n')).toBe('2');
    ctrlClick(row('rsel0002').querySelector('.hit')!);
    TestBed.tick();
    expect(marked()).toEqual(['rsel0001']);
    expect(row('rsel0001').style.getPropertyValue('--marca-n')).toBe('1');
  });

  it('Ctrl+C copia as marcadas na ordem em que foram marcadas', async () => {
    ctrlClick(row('rsel0002').querySelector('.hit')!);
    ctrlClick(row('rsel0001').querySelector('.hit')!);
    key('c', true);
    await new Promise((r) => setTimeout(r));
    expect(copied).toEqual(['1.\nTÍTULO: Trabalho\nDESCRIÇÃO: Relatório\n\n2.\nTÍTULO: Mercado\nDESCRIÇÃO: Pão e café']);
    expect(TestBed.inject(Toasts).current()?.text).toBe('Copiei o texto das 2 anotações.');
  });

  it('sem nada marcado, Ctrl+C não mexe na área de transferência', async () => {
    key('c', true);
    await new Promise((r) => setTimeout(r));
    expect(copied).toEqual([]);
  });

  it('Esc desmarca tudo', () => {
    ctrlClick(row('rsel0001').querySelector('.hit')!);
    TestBed.tick();
    key('Escape');
    TestBed.tick();
    expect(marked()).toEqual([]);
  });

  it('qualquer outro toque desmarca tudo', () => {
    ctrlClick(row('rsel0001').querySelector('.hit')!);
    TestBed.tick();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    TestBed.tick();
    expect(marked()).toEqual([]);
  });
});
