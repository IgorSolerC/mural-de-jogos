import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { canvasNoteId } from '../core/canvas-id';
import { Cloud } from '../core/cloud-config';
import { sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { ReviewEditor } from './review-editor';

/** Os Detalhes de um canvas (PLANO-CANVAS.md, 3.3): o editor da anotação sem o texto, a cartolina, o Kanban e os Flashcards. */
describe('o editor de um canvas (os Detalhes)', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let el: HTMLElement;
  const ID = canvasNoteId('Mapa0viagem0Portugal01');

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(Cloud).config.set({ api: 'https://api.teste', googleClientId: 'x.apps.googleusercontent.com' });
    const settings = TestBed.inject(Settings);
    settings.askNoCategory.set(false);
    settings.askNoTag.set(false);
    TestBed.inject(ReviewStore).reviews.set([
      sanitizeReview({
        id: ID,
        kind: 'anotacoes',
        game: { name: 'Mapa da viagem', coverUrl: null, source: 'manual' },
        text: '',
        category: 'Viagem',
        tags: ['Roteiro'],
        stock: 'cinza',
        completedAt: '2026-11-20',
        createdAt: '2026-11-20T10:00:00.000Z',
        updatedAt: '2026-11-20T10:00:00.000Z',
      })!,
    ]);
    fixture = TestBed.createComponent(ReviewEditor);
    document.body.appendChild(fixture.nativeElement);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('só a aba do canvas: sem a Cartolina, o Kanban e o Flashcard; sem o texto; o palco desenha o canvas', async () => {
    fixture.componentInstance.open(TestBed.inject(ReviewStore).get(ID)!);
    await fixture.whenStable();
    const tabs = [...el.querySelectorAll<HTMLButtonElement>('.modos [role=tab]')].map((b) => b.textContent!.trim());
    expect(tabs).toEqual(['Canvas']);
    expect(el.querySelector('#editor-modo-cartolina')).toBeNull();
    expect(el.querySelector('#editor-modo-kanban')).toBeNull();
    expect(el.querySelector('#editor-modo-flashcard')).toBeNull();
    expect(el.querySelector('.bloco.texto app-rich-editor')).toBeNull();
    expect(el.querySelector('.ver-inteira')).toBeNull();
    // o título, o grupo e as tags continuam (o básico da anotação)
    expect(el.textContent).toContain('Roteiro');
    expect(el.querySelector('.previa app-review-card.canvas app-canvas-card')).not.toBeNull();
  });

  it('as setas na fileira de abas não levam às abas que o canvas não tem', async () => {
    fixture.componentInstance.open(TestBed.inject(ReviewStore).get(ID)!);
    await fixture.whenStable();
    const tab = el.querySelector<HTMLButtonElement>('#editor-modo-escrever')!;
    for (const key of ['ArrowRight', 'ArrowLeft', 'End']) {
      tab.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await fixture.whenStable();
      expect(tab.getAttribute('aria-selected')).withContext(key).toBe('true');
    }
  });

  it('salvar os Detalhes mantém o canvas (o campo vai junto com a anotação salva)', async () => {
    const store = TestBed.inject(ReviewStore);
    fixture.componentInstance.open(store.get(ID)!);
    await fixture.whenStable();
    const title = el.querySelector<HTMLInputElement>('#editor-titulo-nota')!;
    title.value = 'Mapa de Lisboa';
    title.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('.foot button[type=submit].btn-ink')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 50));
    // salvou de verdade (a anotação mexida agora), e continua canvas
    expect(store.get(ID)!.updatedAt).not.toBe('2026-11-20T10:00:00.000Z');
    expect(store.get(ID)!.canvas).toBe('Mapa0viagem0Portugal01');
    expect(store.get(ID)!.game.name).toBe('Mapa de Lisboa');
  });
});
