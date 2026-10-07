import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RichText } from './rich-text';

describe('o texto formatado na leitura', () => {
  async function render(text: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', text);
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
});
