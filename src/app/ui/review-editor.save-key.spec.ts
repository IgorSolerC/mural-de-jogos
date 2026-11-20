import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { EditorView } from 'prosemirror-view';
import { Mural } from '../core/mural';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { ReviewEditor } from './review-editor';
import { pressSave } from '../testing/save-key.spec';
import { comMarkdown } from '../testing/writing-mode.spec';

const T0 = '2026-11-01T10:00:00.000Z';
const note = (text: string): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: 'Lista do mercado', coverUrl: null, source: 'manual' }, completedAt: '2026-11-01', createdAt: T0, updatedAt: T0, text })!,
  id: 'n-mercado',
});

/** O Ctrl+S no editor de anotação e de análise: o mesmo que o Salvar alterações (e o Pregar), com o cursor no texto. */
describe('o editor: o Ctrl+S salva', () => {
  let fixture: ComponentFixture<ReviewEditor>;
  let el: HTMLElement;
  let store: ReviewStore;
  let saved: string[];
  const dialog = () => el.querySelector<HTMLDialogElement>('dialog.editor')!;

  async function setup(): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewEditor], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(Mural).kind.set('anotacoes');
    const settings = TestBed.inject(Settings);
    settings.askNoCategory.set(false);
    settings.askNoTag.set(false);
    store = TestBed.inject(ReviewStore);
    fixture = TestBed.createComponent(ReviewEditor);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    saved = [];
    fixture.componentInstance.saved.subscribe((e) => saved.push(e.id));
    await fixture.whenStable();
  }

  /** Espera o close do diálogo (ele chega numa tarefa depois do close()). */
  const closing = () => new Promise((r) => dialog().addEventListener('close', r, { once: true }));

  afterEach(() => {
    if (dialog()?.open) dialog().close();
    el.remove();
    localStorage.clear();
  });

  describe('no Markdown', () => {
    comMarkdown();
    beforeEach(setup);

    it('com o cursor na folha, salva a anotação mexida e fecha, como o Salvar alterações', async () => {
      store.add(note('Arroz'));
      fixture.componentInstance.open(store.get('n-mercado')!);
      await fixture.whenStable();
      const area = el.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!;
      area.focus();
      area.value = 'Arroz\nFeijão';
      area.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      const shut = closing();
      const e = pressSave(area);
      expect(e.defaultPrevented).toBeTrue();
      await shut;
      expect(saved).toEqual(['n-mercado']);
      expect(store.get('n-mercado')!.text).toBe('Arroz\nFeijão');
    });

    it('sem o título, não salva e leva ao que falta, como o botão', async () => {
      fixture.componentInstance.openNote('');
      await fixture.whenStable();
      const area = el.querySelector<HTMLTextAreaElement>('app-rich-editor textarea')!;
      area.focus();
      pressSave(area);
      await fixture.whenStable();
      expect(dialog().open).toBeTrue();
      expect(saved).toEqual([]);
      expect(el.querySelector('.nome-faixa')!.classList).toContain('errada');
    });

    it('na tela cheia, sem o título: a tela cheia fecha e o foco vai ao título que falta', async () => {
      fixture.componentInstance.openNote('');
      await fixture.whenStable();
      el.querySelector<HTMLButtonElement>('app-rich-editor .acao-folha.tamanho')!.click();
      await fixture.whenStable();
      const full = el.querySelector<HTMLDialogElement>('dialog.tela-cheia')!;
      expect(full.open).toBeTrue();
      let big: HTMLTextAreaElement | null = null;
      for (let i = 0; i < 50 && !(big = full.querySelector('textarea')); i++) await new Promise((r) => setTimeout(r, 10));
      big!.focus();
      expect(pressSave(big!).defaultPrevented).toBeTrue();
      for (let i = 0; i < 50 && document.activeElement?.id !== 'editor-titulo-nota'; i++) await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 50));
      expect(full.open).toBeFalse();
      expect(dialog().open).toBeTrue();
      expect(saved).toEqual([]);
      expect(document.activeElement?.id).toBe('editor-titulo-nota');
    });

    it('o botão diz o atalho na dica e para o leitor de tela', async () => {
      fixture.componentInstance.openNote('Uma anotação');
      await fixture.whenStable();
      const b = el.querySelector<HTMLButtonElement>('footer button[type="submit"]')!;
      expect(b.getAttribute('aria-keyshortcuts')).toBe('Control+S Meta+S');
      b.dispatchEvent(new PointerEvent('pointerenter'));
      expect(b.title).toMatch(/^Pregar (no mural|só pra mim) \((Ctrl\+S|⌘S)\)$/);
    });
  });

  describe('no Visual', () => {
    beforeEach(async () => {
      await setup();
      TestBed.inject(Settings).writingMode.set('visual');
    });

    it('com o cursor na folha do Visual, salva o que acabou de ser escrito', async () => {
      store.add(note('Arroz'));
      fixture.componentInstance.open(store.get('n-mercado')!);
      await fixture.whenStable();
      // o Visual chega num pedaço à parte
      for (let i = 0; i < 300 && !el.querySelector('app-rich-editor .ProseMirror'); i++) await new Promise((r) => setTimeout(r, 10));
      await fixture.whenStable();
      const v = (fixture.debugElement.query(By.css('app-visual-editor')).componentInstance as { view: EditorView }).view;
      v.focus();
      v.dispatch(v.state.tr.insertText(' e feijão', v.state.doc.content.size - 1));
      const shut = closing();
      pressSave(v.dom);
      await shut;
      expect(saved).toEqual(['n-mercado']);
      expect(store.get('n-mercado')!.text).toBe('Arroz e feijão');
    });
  });
});
