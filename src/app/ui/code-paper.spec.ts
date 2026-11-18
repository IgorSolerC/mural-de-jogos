import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fitCodePaper } from './code-paper';
import { RichText } from './rich-text';

/** A barra fina do bloco de código (PLANO-CODIGO-COMPACTO.md, D5): desenhada por cima, no lugar da de verdade. */
describe('a barra fina do bloco de código', () => {
  const LONGA = 'const uma_linha_bem_comprida = "' + 'abcdefghij'.repeat(16) + '";';

  async function peca(texto: string, largura = 360): Promise<HTMLElement> {
    TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', texto);
    const el = fixture.nativeElement as HTMLElement;
    el.style.cssText = `display: block; width: ${largura}px; --line: 24px`;
    document.body.appendChild(el);
    fixture.detectChanges();
    await fixture.whenStable();
    // o papel passa a ser cuidado depois do desenho (afterNextRender)
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const p = el.querySelector<HTMLElement>('.codigo-peca')!;
    fitCodePaper(p);
    return p;
  }
  afterEach(() => document.querySelectorAll('app-rich-text').forEach((e) => e.remove()));

  const pre = (p: HTMLElement) => p.querySelector<HTMLElement>('pre.codigo')!;
  const polegar = (p: HTMLElement) => p.querySelector<HTMLElement>('.codigo-rolo-polegar')!;
  const rolo = (p: HTMLElement) => p.querySelector<HTMLElement>('.codigo-rolo')!;

  it('a barra de verdade sai e não ocupa nada: o bloco tem só as linhas dele', async () => {
    const p = await peca('```js\n' + LONGA + '\nb\n```');
    const s = getComputedStyle(pre(p));
    expect(s.scrollbarWidth).toBe('none');
    expect(pre(p).offsetHeight - pre(p).clientHeight).toBe(0);
    expect(p.getBoundingClientRect().height).toBeCloseTo(48, 0);
  });

  it('com o que rolar, a barra existe no pé da última linha, da tira até a beirada, escondida até o mouse', async () => {
    const p = await peca('```js\n' + LONGA + '\nb\n```');
    expect(p.hasAttribute('data-rola')).toBeTrue();
    const r = rolo(p);
    const s = getComputedStyle(r);
    expect(s.display).toBe('block');
    expect(s.opacity).toBe('0');
    const pr = p.getBoundingClientRect();
    const rr = r.getBoundingClientRect();
    expect(rr.bottom).toBeCloseTo(pr.bottom, 0);
    expect(rr.left).toBeGreaterThan(pr.left + 16);
    expect(getComputedStyle(polegar(p)).height).toBe('4px');
    expect(r.getAttribute('aria-hidden')).toBe('true');
  });

  it('sem nada para rolar, a barra não existe', async () => {
    const p = await peca('```js\na\nb\n```');
    expect(p.hasAttribute('data-rola')).toBeFalse();
    expect(getComputedStyle(rolo(p)).display).toBe('none');
  });

  it('o polegar tem o tamanho da parte à vista e acompanha a rolagem; rolando, a barra aparece', async () => {
    const p = await peca('```js\n' + LONGA + '\n```');
    const sc = pre(p);
    const trilho = rolo(p).clientWidth;
    const w = polegar(p).getBoundingClientRect().width;
    expect(w).toBeCloseTo((trilho * sc.clientWidth) / sc.scrollWidth, 0);
    expect(polegar(p).getBoundingClientRect().left).toBeCloseTo(rolo(p).getBoundingClientRect().left, 0);
    sc.scrollLeft = sc.scrollWidth;
    sc.dispatchEvent(new Event('scroll'));
    // o polegar anda no quadro seguinte (uma vez por quadro, por mais avisos de rolagem que cheguem)
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(polegar(p).getBoundingClientRect().right).toBeCloseTo(rolo(p).getBoundingClientRect().right, 0);
    expect(p.hasAttribute('data-rolando')).toBeTrue();
  });

  it('arrastar o polegar rola as letras na mesma proporção', async () => {
    const p = await peca('```js\n' + LONGA + '\n```');
    const sc = pre(p);
    const t = polegar(p);
    const b = t.getBoundingClientRect();
    const opts = { bubbles: true, pointerId: 7, button: 0, clientY: b.top + 2 };
    t.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: b.left + 4 }));
    expect(rolo(p).classList).toContain('arrastando');
    const room = rolo(p).clientWidth - t.offsetWidth;
    t.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: b.left + 4 + room / 2 }));
    const max = sc.scrollWidth - sc.clientWidth;
    expect(sc.scrollLeft).toBeCloseTo(max / 2, -1);
    t.dispatchEvent(new PointerEvent('pointerup', opts));
    expect(rolo(p).classList).not.toContain('arrastando');
  });

  it('só o polegar pega o mouse, e só à vista: o pé da última linha continua do texto', async () => {
    const p = await peca('```js\n' + LONGA + '\n```');
    expect(getComputedStyle(rolo(p)).pointerEvents).toBe('none');
    // escondida (sem o mouse, sem rolar), nem o polegar pega
    expect(getComputedStyle(polegar(p)).pointerEvents).toBe('none');
    p.setAttribute('data-rolando', '');
    expect(getComputedStyle(polegar(p)).pointerEvents).toBe('auto');
  });

  it('a ficha do mural, que não rola, não ganha barra', async () => {
    TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', '```js\n' + LONGA + '\n```');
    const el = fixture.nativeElement as HTMLElement;
    const corte = document.createElement('style');
    corte.textContent = '.corta .codigo-peca > .codigo { overflow: clip !important; }';
    document.head.append(corte);
    el.classList.add('corta');
    document.body.appendChild(el);
    try {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      expect(el.querySelector('.codigo-rolo')).toBeNull();
    } finally {
      corte.remove();
    }
  });
});
