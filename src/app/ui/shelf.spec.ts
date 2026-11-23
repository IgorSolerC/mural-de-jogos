import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Shelf, shelfRows } from './shelf';

describe('a prateleira de Outros', () => {
  it('no computador, tudo numa tábua só', () => {
    expect(shelfRows(['a', 'b', 'c', 'd', 'e', 'f'], false)).toEqual([['a', 'b', 'c', 'd', 'e', 'f']]);
  });

  it('no celular, tábuas de até três, o mais iguais possível', () => {
    expect(shelfRows(['a', 'b'], true)).toEqual([['a', 'b']]);
    expect(shelfRows(['a', 'b', 'c'], true)).toEqual([['a', 'b', 'c']]);
    expect(shelfRows(['a', 'b', 'c', 'd'], true)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(shelfRows(['a', 'b', 'c', 'd', 'e'], true)).toEqual([['a', 'b', 'c'], ['d', 'e']]);
    expect(shelfRows(['a', 'b', 'c', 'd', 'e', 'f'], true)).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
  });

  it('sem nada, nenhuma tábua', () => {
    expect(shelfRows([], false)).toEqual([]);
    expect(shelfRows([], true)).toEqual([]);
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
