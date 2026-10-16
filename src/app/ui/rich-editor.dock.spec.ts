import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DOCK_MEDIA, RichEditor } from './rich-editor';

/**
 * No celular, a régua desce para cima do teclado enquanto se escreve: presa (`.presa`) com o foco na
 * folha, de volta ao alto quando ele sai (menos para um menu da própria régua).
 */
describe('a régua presa em cima do teclado', () => {
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

  it('o "Mais" aberto com a régua presa não a solta (o menu abre para cima)', async () => {
    await make(true);
    area().focus();
    await settle();
    (fixture.nativeElement.querySelector('.ferramenta.mais') as HTMLButtonElement).click();
    await settle();
    await new Promise((r) => setTimeout(r));
    await settle();
    expect(fixture.nativeElement.querySelector('.mais-menu')).not.toBeNull();
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

  it('"Ver como fica" esconde a folha e solta a régua', async () => {
    await make(true);
    area().focus();
    await settle();
    (fixture.nativeElement.querySelector('button.ver') as HTMLButtonElement).click();
    await settle();
    expect(ruler().classList).not.toContain('presa');
  });
});
