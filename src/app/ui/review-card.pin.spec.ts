import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Review, isPinnedNote, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SharedStore } from '../core/shared-store';
import { ReviewCard } from './review-card';

function note(): Review {
  return sanitizeReview({
    id: 'rfix0001',
    kind: 'anotacoes',
    game: { name: 'Plano', coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    stock: 'amarelo',
    text: 'Texto',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  })!;
}

/**
 * O alfinete da ficha no mural: fixar é de cada um, então aparece também na compartilhada em que você
 * só lê (como no menu e na leitura); o check, não, porque finalizar muda a anotação de todos.
 */
describe('o alfinete da ficha no mural', () => {
  async function show(papel: string | null, checkable = true) {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(ReviewStore);
    store.reviews.set([note()]);
    const shared = TestBed.inject(SharedStore);
    if (papel) {
      spyOn(shared, 'get').and.returnValue({ papel, dono: { codigo: 'ANA123', nome: 'Ana' }, membros: [], view: {} } as never);
      spyOn(shared, 'role').and.returnValue(papel as never);
    }
    const fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', store.get('rfix0001')!);
    fixture.componentRef.setInput('checkable', checkable);
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
    return { fixture, el, store };
  }

  afterEach(() => {
    document.querySelectorAll('app-review-card').forEach((e) => e.remove());
    localStorage.clear();
  });

  it('na compartilhada em que você só lê: o alfinete, sem o check, e ele fixa e desafixa', async () => {
    const { fixture, el, store } = await show('leitor');
    expect(el.querySelector('button.feito')).toBeNull();
    const pin = el.querySelector<HTMLButtonElement>('.acoes button.fixar');
    expect(pin).not.toBeNull();
    pin!.click();
    await fixture.whenStable();
    expect(isPinnedNote(store.get('rfix0001')!)).toBeTrue();
    fixture.componentRef.setInput('review', store.get('rfix0001')!);
    await fixture.whenStable();
    expect(el.querySelector('button.fixar')!.getAttribute('aria-pressed')).toBe('true');
    el.querySelector<HTMLButtonElement>('button.fixar')!.click();
    await fixture.whenStable();
    expect(isPinnedNote(store.get('rfix0001')!)).toBeFalse();
    fixture.destroy();
  });

  it('na sua e na compartilhada em que você escreve: o alfinete e o check', async () => {
    for (const papel of [null, 'editor']) {
      TestBed.resetTestingModule();
      const { fixture, el } = await show(papel);
      expect(el.querySelector('.acoes button.fixar')).withContext(String(papel)).not.toBeNull();
      expect(el.querySelector('.acoes button.feito')).withContext(String(papel)).not.toBeNull();
      fixture.destroy();
      el.remove();
    }
  });

  it('no mural de outra pessoa: nem um nem outro', async () => {
    const { fixture, el } = await show(null, false);
    expect(el.querySelector('.acoes')).toBeNull();
    fixture.destroy();
  });
});
