import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DOCK_MEDIA, RichEditor } from './rich-editor';
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
