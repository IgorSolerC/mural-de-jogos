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

  it('as feitas de quando a ficha apareceu viram a conta; a marcada agora fica até o texto mudar de verdade', async () => {
    TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RichText);
    const set = async (text: string) => {
      fixture.componentRef.setInput('text', text);
      await fixture.whenStable();
    };
    const el: HTMLElement = fixture.nativeElement;
    const shown = () => Array.from(el.querySelectorAll('.tarefa')).map((t) => t.textContent);
    const counts = () => Array.from(el.querySelectorAll('.resumo-nome')).map((t) => t.textContent);
    fixture.componentRef.setInput('fold', true);
    document.body.appendChild(el);
    await set('Lista 1\n- [x] um\n- [ ] dois\n- [x] três\nLista 2\n- [x] quatro');
    expect(shown()).toEqual(['dois']);
    expect(counts()).toEqual(['2 tarefas feitas (escondidas)', '1 tarefa feita (escondida)']);

    // marcou a "dois" e desmarcou a "três": as duas à vista
    await set('Lista 1\n- [x] um\n- [x] dois\n- [ ] três\nLista 2\n- [x] quatro');
    expect(shown()).toEqual(['dois', 'três']);
    expect(counts()).toEqual(['1 tarefa feita (escondida)', '1 tarefa feita (escondida)']);

    // o texto mudou de verdade (uma edição): o retrato é refeito
    await set('Lista 1\n- [x] um\n- [x] dois\n- [ ] três!\nLista 2\n- [x] quatro');
    expect(shown()).toEqual(['três!']);

    // sem a dobra, a anotação como ela é
    fixture.componentRef.setInput('fold', false);
    await fixture.whenStable();
    expect(shown()).toEqual(['um', 'dois', 'três!', 'quatro']);
    expect(counts()).toEqual([]);
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
