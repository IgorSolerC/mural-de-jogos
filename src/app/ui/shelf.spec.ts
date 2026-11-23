import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Shelf, shelfRows } from './shelf';

describe('a prateleira de Outros', () => {
  it('sem limite, tudo numa tábua só', () => {
    expect(shelfRows(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual([['a', 'b', 'c', 'd', 'e', 'f']]);
  });

  it('em tábuas de até três, o mais iguais possível', () => {
    expect(shelfRows(['a', 'b'], 3)).toEqual([['a', 'b']]);
    expect(shelfRows(['a', 'b', 'c'], 3)).toEqual([['a', 'b', 'c']]);
    expect(shelfRows(['a', 'b', 'c', 'd'], 3)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(shelfRows(['a', 'b', 'c', 'd', 'e'], 3)).toEqual([['a', 'b', 'c'], ['d', 'e']]);
    expect(shelfRows(['a', 'b', 'c', 'd', 'e', 'f'], 3)).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
    // sete: as que sobram uma em cada tábua de cima, nunca uma sozinha embaixo
    expect(shelfRows(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3)).toEqual([['a', 'b', 'c'], ['d', 'e'], ['f', 'g']]);
  });

  it('sem nada, nenhuma tábua', () => {
    expect(shelfRows([])).toEqual([]);
    expect(shelfRows([], 3)).toEqual([]);
  });

  @Component({
    imports: [Shelf],
    template: `<app-shelf><a class="x" href="#">um</a><a class="x" href="#">dois</a></app-shelf>`,
  })
  class Host {}

  it('as coisas ficam em cima da tábua, e a tábua com os dois suportes fica fora do leitor de tela', async () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('app-shelf .coisas > a.x').length).toBe(2);
    const tabua = host.querySelector('app-shelf .tabua')!;
    expect(tabua.getAttribute('aria-hidden')).toBe('true');
    expect(tabua.querySelectorAll('.suporte').length).toBe(2);
    // o reforço de cada suporte fica do lado de dentro: o da esquerda vira
    expect(getComputedStyle(tabua.querySelector('.suporte[data-lado="esq"]')!).scale).toBe('-1 1');
    expect(getComputedStyle(tabua.querySelector('.suporte[data-lado="dir"]')!).scale).toBe('none');
  });
});
