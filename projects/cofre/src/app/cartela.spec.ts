import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CARTELA_DE_ICONES, GAVETAS_DE_ICONES } from '../../../../shared/cartela-de-icones';
import { Cartela } from './cartela';

describe('a cartela de ícones do cofre', () => {
  async function montar(icone = '') {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Cartela);
    f.componentRef.setInput('id', 'c1');
    f.componentRef.setInput('deSempre', 'A letra do nome');
    f.componentRef.setInput('letra', 'G');
    f.componentRef.setInput('icone', icone);
    const escolhidos: string[] = [];
    f.componentInstance.escolherIcone.subscribe((i) => escolhidos.push(i));
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const escrever = async (t: string) => {
      const input = el.querySelector<HTMLInputElement>('.busca')!;
      input.value = t;
      input.dispatchEvent(new Event('input'));
      await f.whenStable();
    };
    return { f, el, escolhidos, escrever };
  }

  it('mostra a cartela inteira, separada pelas gavetas do Murall, com a de sempre na frente', async () => {
    const { el } = await montar('cofrinho');
    expect(el.querySelectorAll('.op.icone:not(.de-sempre)').length).toBe(CARTELA_DE_ICONES.length);
    expect(Array.from(el.querySelectorAll('.gaveta')).map((g) => g.textContent!.trim())).toEqual(GAVETAS_DE_ICONES.map((g) => g.label));
    expect(el.querySelector('.op.icone')!.classList).toContain('de-sempre');
    expect(el.querySelector('.op.icone[aria-label="Cofrinho"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('a busca deixa só o que bate; sem nada, diz; Esc limpa', async () => {
    const { el, escolhidos, escrever } = await montar();
    await escrever('senha');
    const achados = Array.from(el.querySelectorAll('.op.icone:not(.de-sempre)')).map((b) => b.getAttribute('aria-label'));
    expect(achados).toEqual(['Chave', 'Cadeado']);
    el.querySelector<HTMLButtonElement>('.op.icone[aria-label="Cadeado"]')!.click();
    expect(escolhidos).toEqual(['cadeado']);
    await escrever('xyzw');
    expect(el.querySelector('.nada')!.textContent).toContain('xyzw');
    const input = el.querySelector<HTMLInputElement>('.busca')!;
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBeTrue();
    await new Promise((r) => setTimeout(r));
    expect(el.querySelectorAll('.op.icone:not(.de-sempre)').length).toBe(CARTELA_DE_ICONES.length);
  });
});
