import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DOCK_MEDIA, RichEditor } from './rich-editor';
import { caretBox } from './caret-follow';
import { comMarkdown } from '../testing/writing-mode.spec';

/**
 * No celular, a régua desce para cima do teclado enquanto se escreve: presa (`.presa`) com o foco na
 * folha, de volta ao alto quando ele sai (menos para um menu da própria régua).
 */
describe('a régua presa em cima do teclado', () => {
  // a <textarea> das marcas à vista (o editor abre no Visual para quem não escolheu)
  comMarkdown();
  let fixture: ComponentFixture<RichEditor>;
  let phone = true;

  async function make(dock: boolean): Promise<void> {
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('dock', dock);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  }

  beforeEach(() => {
    phone = true;
    const real = window.matchMedia.bind(window);
    spyOn(window, 'matchMedia').and.callFake((q: string) => (q === DOCK_MEDIA ? ({ matches: phone } as MediaQueryList) : real(q)));
  });

  afterEach(() => fixture.nativeElement.remove());

  const area = () => fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
  const ruler = () => fixture.nativeElement.querySelector('.regua') as HTMLElement;
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('no celular, escrever prende a régua; sair da folha a solta', async () => {
    await make(true);
    area().focus();
    await settle();
    expect(ruler().classList).toContain('presa');
    expect(fixture.nativeElement.classList).toContain('presa');
    area().blur();
    await settle();
    expect(ruler().classList).not.toContain('presa');
    expect(fixture.nativeElement.classList).not.toContain('presa');
  });

  it('o "Formatar" aberto com a régua presa não a solta (o menu abre para cima, numa coluna)', async () => {
    await make(true);
    area().focus();
    await settle();
    (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
    await settle();
    await new Promise((r) => setTimeout(r));
    await settle();
    expect(fixture.nativeElement.querySelector('.menu')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.menu').classList).not.toContain('duas');
    expect(ruler().classList).toContain('presa');
  });

  it('"Pronto" fecha o teclado: o foco sai da folha e a régua volta para o alto', async () => {
    await make(true);
    area().focus();
    await settle();
    (fixture.nativeElement.querySelector('button.pronto') as HTMLButtonElement).click();
    await settle();
    expect(document.activeElement).not.toBe(area());
    expect(ruler().classList).not.toContain('presa');
  });

  it('o foco num painel não solta a régua, o painel fica logo acima dela e a linha do cursor sai de baixo dele', async () => {
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('dock', true);
    fixture.componentRef.setInput('grows', true);
    const linhas = Array.from({ length: 120 }, (_, i) => `Linha ${i + 1}`);
    linhas[59] = '[o site](https://exemplo.invalid)';
    fixture.componentInstance.value.set(linhas.join('\n'));
    const caixa = document.createElement('div');
    caixa.style.cssText = 'height: 400px; width: 500px; overflow-y: auto';
    caixa.append(fixture.nativeElement);
    document.body.append(caixa);
    await settle();
    const a = area();
    a.focus();
    const at = a.value.indexOf('[o site]') + 3;
    a.setSelectionRange(at, at);
    const linha = () => {
      const box = caretBox(a, at);
      return { top: a.getBoundingClientRect().top + box.top, bottom: a.getBoundingClientRect().top + box.bottom };
    };
    // o cursor bem onde o painel vai abrir, e o toque no link
    caixa.scrollTop += linha().top - caixa.getBoundingClientRect().top - 300;
    await settle();
    expect(ruler().classList).toContain('presa');
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await new Promise((r) => setTimeout(r, 400));
    await settle();
    const painel = fixture.nativeElement.querySelector('.papel > .gaveta > .url-painel') as HTMLElement;
    expect(painel).not.toBeNull();
    expect(ruler().classList).toContain('presa');
    expect(getComputedStyle(painel.parentElement!).position).toBe('fixed');
    expect(painel.getBoundingClientRect().bottom).toBeLessThanOrEqual(ruler().getBoundingClientRect().top);
    expect(linha().bottom).toBeLessThanOrEqual(painel.getBoundingClientRect().top);
    // o foco no campo do painel não solta a régua; dele para fora da folha, solta
    (painel.querySelector('input') as HTMLInputElement).focus();
    await settle();
    expect(ruler().classList).toContain('presa');
    (document.activeElement as HTMLElement).blur();
    await settle();
    expect(ruler().classList).not.toContain('presa');
    caixa.remove();
  });

  it('com o link na última linha, o pé da folha ganha rolagem para o cursor sair de baixo do painel, e devolve ao fechar', async () => {
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('dock', true);
    fixture.componentRef.setInput('grows', true);
    const linhas = Array.from({ length: 60 }, (_, i) => `Linha ${i + 1}`);
    linhas.push('[o site](https://exemplo.invalid)');
    fixture.componentInstance.value.set(linhas.join('\n'));
    const caixa = document.createElement('div');
    caixa.style.cssText = 'height: 400px; width: 500px; overflow-y: auto';
    caixa.append(fixture.nativeElement);
    document.body.append(caixa);
    await settle();
    const a = area();
    a.focus();
    const at = a.value.indexOf('[o site]') + 3;
    a.setSelectionRange(at, at);
    caixa.scrollTop = caixa.scrollHeight;
    await settle();
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await new Promise((r) => setTimeout(r, 400));
    await settle();
    const painel = fixture.nativeElement.querySelector('.papel > .gaveta > .url-painel') as HTMLElement;
    const papel = fixture.nativeElement.querySelector('.papel') as HTMLElement;
    const fim = a.getBoundingClientRect().top + caretBox(a, at).bottom;
    expect(fim).toBeLessThanOrEqual(painel.getBoundingClientRect().top);
    expect(parseFloat(papel.style.paddingBottom)).toBeGreaterThan(0);
    (painel.querySelector('.painel-fechar') as HTMLButtonElement).click();
    await settle();
    await new Promise((r) => setTimeout(r, 30));
    await settle();
    expect(papel.style.paddingBottom).toBe('');
    caixa.remove();
  });

  it('fora do editor da ficha (sem "dock"), a régua da folha pequena fica no alto', async () => {
    await make(false);
    area().focus();
    await settle();
    expect(ruler().classList).not.toContain('presa');
  });

  it('no computador, nunca prende', async () => {
    phone = false;
    await make(true);
    area().focus();
    await settle();
    expect(ruler().classList).not.toContain('presa');
  });

  it('no Visual, a folha dele prende a régua, e o "Pronto" a solta', async () => {
    await make(true);
    (fixture.nativeElement.querySelector('[role=tab][id$="-aba-visual"]') as HTMLButtonElement).click();
    await settle();
    let folha: HTMLElement | null = null;
    for (let i = 0; i < 200 && !folha; i++) {
      await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
      folha = fixture.nativeElement.querySelector('.visual .ProseMirror');
    }
    folha!.focus();
    await settle();
    expect(ruler().classList).toContain('presa');
    (fixture.nativeElement.querySelector('button.pronto') as HTMLButtonElement).click();
    await settle();
    expect(document.activeElement).not.toBe(folha);
    expect(ruler().classList).not.toContain('presa');
  });
});
