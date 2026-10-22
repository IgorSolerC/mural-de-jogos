import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageWall } from './page-wall';

/** As camadas do fundo de um elemento, como o navegador as calculou. */
function fundo(el: Element) {
  const c = getComputedStyle(el);
  return { cor: c.backgroundColor, imagem: c.backgroundImage, tamanho: c.backgroundSize, lugar: c.backgroundPosition, repete: c.backgroundRepeat };
}

describe('a parede de eucatex (shared/_eucatex.scss)', () => {
  it('a do perfil, a do véu do Kanban e a de um amigo são a mesma do fundo da página, a do cofre', () => {
    TestBed.configureTestingModule({ imports: [PageWall], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PageWall);
    fixture.componentRef.setInput('wall', 'eucatex');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    try {
      const parede = (fixture.nativeElement as HTMLElement).querySelector('.parede')!;
      expect(fundo(parede)).toEqual(fundo(document.body));
      // os furos e a luz do tubo, desenhados: nenhuma foto e nenhuma fibra
      const { imagem, tamanho } = fundo(document.body);
      expect(imagem).not.toContain('url(');
      expect(imagem).toContain('radial-gradient(90% 900px at 50% -120px');
      expect(imagem).toContain('radial-gradient(circle at 13px 13px, rgb(11, 9, 8) 2.6px');
      expect(tamanho).toBe('100% 900px, 26px 26px, 26px 26px');
    } finally {
      fixture.destroy();
      (fixture.nativeElement as HTMLElement).remove();
    }
  });

  it('o pedaço de parede das prévias tem os mesmos furos, sem o tubo em cima', () => {
    const pedaco = document.createElement('div');
    pedaco.className = 'parede';
    document.body.appendChild(pedaco);
    try {
      const { imagem, tamanho } = fundo(pedaco);
      expect(imagem).toBe(fundo(document.body).imagem.slice(fundo(document.body).imagem.indexOf('radial-gradient(circle')));
      expect(tamanho).toBe('26px 26px, 26px 26px');
    } finally {
      pedaco.remove();
    }
  });
});
