import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mural } from '../core/mural';
import { sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { WallState, WallView } from '../core/wall-view';
import { Toasts } from './toast';
import { WallAccess, WallBoard } from '../pages/wall-board';

const ACCESS: WallAccess = { landingId: null, picking: false, picked: new Map(), masked: false, secret: new Set(), reactCode: null, checkable: true, looks: {} };

/** Revisão das marcadas (code-review): o que muda na parede sem mudar quem está nela não desmarca, e o bilhete sai junto. */
describe('marcar anotações: revisão (NoteSelection)', () => {
  let el: HTMLElement;
  let store: ReviewStore;

  afterEach(() => {
    document.querySelectorAll('app-wall-board').forEach((e) => e.remove());
    localStorage.clear();
  });

  const note = (id: string, name: string, day: string, text = '') =>
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
    })!;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    store.add(note('rrev0001', 'Mercado', '01', 'Pão'));
    store.add(note('rrev0002', 'Trabalho', '02', '- [ ] Relatório'));
    store.add(note('rrev0003', 'Farmácia', '03', 'Protetor'));
    TestBed.inject(Mural).kind.set('anotacoes');
    TestBed.inject(WallState).setDensity('lista');
    const fixture = TestBed.createComponent(WallBoard);
    fixture.componentRef.setInput('access', ACCESS);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  const row = (id: string) => el.querySelector<HTMLElement>(`.linha[data-ficha="${id}"]`)!;
  const ctrlClick = (target: HTMLElement) => {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
  };
  const marked = () => Array.from(el.querySelectorAll('[data-marcada]'), (e) => e.getAttribute('data-ficha')).sort();
  const settle = async () => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
    TestBed.tick();
  };

  it('outra anotação mudando (a nuvem, uma tarefa marcada, fixar) não desmarca as marcadas', async () => {
    ctrlClick(row('rrev0001').querySelector('.hit')!);
    ctrlClick(row('rrev0002').querySelector('.hit')!);
    await settle();
    expect(marked()).toEqual(['rrev0001', 'rrev0002']);
    // a de fora das marcadas muda, e a marcada também (a ordem da parede pode mudar junto)
    store.update({ ...store.get('rrev0003')!, text: 'Protetor e remédio', updatedAt: '2026-10-05T10:00:00.000Z' });
    store.update({ ...store.get('rrev0002')!, text: '- [x] Relatório', updatedAt: '2026-10-06T10:00:00.000Z' });
    await settle();
    expect(marked()).toEqual(['rrev0001', 'rrev0002']);
  });

  it('a busca que tira uma anotação da parede continua desmarcando', async () => {
    ctrlClick(row('rrev0001').querySelector('.hit')!);
    await settle();
    expect(marked()).toEqual(['rrev0001']);
    TestBed.inject(WallView).query.set('Mercado');
    await settle();
    expect(marked()).toEqual([]);
  });

  it('a anotação marcada que sai do mural (apagada) desmarca', async () => {
    ctrlClick(row('rrev0001').querySelector('.hit')!);
    ctrlClick(row('rrev0002').querySelector('.hit')!);
    await settle();
    store.remove('rrev0002');
    await settle();
    expect(marked()).toEqual([]);
  });

  it('desmarcar por outro toque tira o bilhete de "N marcadas" (que dizia o Ctrl+C sem nada marcado)', async () => {
    const toasts = TestBed.inject(Toasts);
    ctrlClick(row('rrev0001').querySelector('.hit')!);
    await settle();
    expect(toasts.current()?.text).toContain('1 anotação marcada');
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await settle();
    expect(marked()).toEqual([]);
    expect(toasts.current()).toBeNull();
  });

  it('desmarcar não some com o bilhete de outra coisa (o Desfazer de outro lugar)', async () => {
    const toasts = TestBed.inject(Toasts);
    ctrlClick(row('rrev0001').querySelector('.hit')!);
    await settle();
    toasts.show('Anotação apagada.', { label: 'Desfazer', run: () => {} });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(marked()).toEqual([]);
    expect(toasts.current()?.text).toBe('Anotação apagada.');
  });
});
