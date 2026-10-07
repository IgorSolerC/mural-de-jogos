import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RichText } from './rich-text';
import { NoteLinks } from '../core/note-links';
import { Review, sanitizeReview } from '../core/review';

describe('o texto formatado na leitura', () => {
  async function render(text: string, links: NoteLinks | null = null): Promise<HTMLElement> {
    TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', text);
    fixture.componentRef.setInput('links', links);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement;
  }
  const marker = (li: Element) => getComputedStyle(li, '::before').content;

  afterEach(() => document.querySelectorAll('app-rich-text').forEach((e) => e.remove()));

  it('a lista numerada mostra o número, e a comum, o ponto (não o ponto nas duas)', async () => {
    const el = await render('- leite\n- ovos\n\n3. três\n4. quatro');
    const [bullet] = Array.from(el.querySelectorAll('ul.lista li'));
    const numbered = Array.from(el.querySelectorAll('ol li'));
    expect(marker(bullet)).toBe('"•"');
    expect(marker(numbered[0])).not.toBe('"•"');
    expect(el.querySelector('ol')!.getAttribute('start')).toBe('3');
  });

  it('texto sem marca nenhuma sai como sempre, um bloco só', async () => {
    const el = await render('Linha um\n\nLinha dois');
    expect(el.querySelector('.linha')).toBeNull();
    expect(el.textContent).toContain('Linha um\n\nLinha dois');
  });

  describe('os links para outras anotações', () => {
    const console: Review = { ...sanitizeReview({ kind: 'anotacoes', game: { name: 'Comprar um console' }, createdAt: '2026-01-01T00:00:00.000Z' })!, id: 'n1' };
    const resolve = (t: string) => (t.toLowerCase() === 'comprar um console' ? console : null);

    it('abre a anotação; o que não existe, cria; tocar no link não marca a tarefa', async () => {
      const opened: Review[] = [];
      const created: string[] = [];
      const el = await render('- [ ] [[comprar um console]]\n- [[Vender a TV]]', { resolve, open: (n) => opened.push(n), create: (t) => created.push(t) });
      const [ok, broken] = Array.from(el.querySelectorAll<HTMLElement>('.elo'));
      expect(ok.textContent).toBe('comprar um console');
      expect(ok.getAttribute('role')).toBe('link');
      ok.click();
      expect(opened.map((n) => n.id)).toEqual(['n1']);
      expect(el.querySelector('.caixa.marcada')).toBeNull();
      expect(broken.classList).toContain('quebrado');
      broken.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(created).toEqual(['Vender a TV']);
    });

    it('sem abrir nem criar (a prévia), o link só aparece; nas resenhas, os colchetes ficam', async () => {
      let el = await render('[[Comprar um console]] e [[Nada]]', { resolve });
      expect(el.querySelectorAll('.elo[tabindex]').length).toBe(0);
      expect(el.querySelectorAll('.elo.quebrado').length).toBe(1);
      document.querySelectorAll('app-rich-text').forEach((e) => e.remove());
      TestBed.resetTestingModule();
      el = await render('veja [[Hades]]');
      expect(el.querySelector('.elo')).toBeNull();
      expect(el.textContent).toContain('veja [[Hades]]');
    });
  });
});
