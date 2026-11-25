import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { pageFor } from '../core/notebook';
import { Draft } from '../core/review';
import { DraftCard } from './draft-card';

/**
 * As folhas do Pra depois sem a fita-crepe que só fingia segurá-las (pedido do dono, 25/nov/2026). O
 * sorteio de cada folha (`pageFor`, congelado) continua o mesmo: só a fita deixou de ser desenhada.
 */
describe('DraftCard: sem fita-crepe', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  const T0 = '2026-11-10T12:00:00.000Z';
  const draft = (id: string): Draft => ({ id, kind: 'jogos', game: { name: 'Tunic', coverUrl: null, source: 'manual' }, createdAt: T0, updatedAt: T0 });

  it('nenhum jeito de prender a folha (fita no meio, nos dois cantos, num canto, post-it) desenha fita', async () => {
    // ids até achar folhas de cada jeito que o sorteio dá
    const holds = new Set<string>();
    for (let i = 0; holds.size < 4 && i < 400; i++) {
      const id = `pend-fita-${i}`;
      const hold = pageFor(id).hold;
      if (holds.has(hold)) continue;
      holds.add(hold);
      const f = TestBed.createComponent(DraftCard);
      f.componentRef.setInput('draft', draft(id));
      f.componentRef.setInput('landing', true);
      f.detectChanges();
      await f.whenStable();
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('.sheet')).withContext(hold).not.toBeNull();
      expect(el.querySelector('.tape')).withContext(hold).toBeNull();
      f.destroy();
    }
    expect(holds.size).toBeGreaterThan(1);
  });
});
