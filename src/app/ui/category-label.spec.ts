import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CategoryLabel } from './category-label';

/** O desenho da categoria: na orelha com cor, pega a cor dela; sem cor, fica na tinta de quem usa. */

@Component({
  imports: [CategoryLabel],
  template: `
    <span class="orelha orelha-cor" style="--cat-cor: #2d8bd6; color: #151515"><app-cat-label label="Trabalho" /></span>
    <span class="orelha" style="color: #151515"><app-cat-label label="Casa" /></span>
  `,
})
class Orelhas {}

describe('CategoryLabel', () => {
  it('na orelha com cor, o desenho é da cor dela e cheio; o nome continua preto', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Orelhas);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const [comCor, semCor] = [...fixture.nativeElement.querySelectorAll('app-cat-label')] as HTMLElement[];
    const icon = getComputedStyle(comCor.querySelector('.icone')!);
    expect(icon.color).toBe('rgb(45, 139, 214)');
    expect(icon.opacity).toBe('1');
    expect(getComputedStyle(comCor.querySelector('.nome')!).color).toBe('rgb(21, 21, 21)');
    expect(getComputedStyle(semCor.querySelector('.icone')!).color).toBe('rgb(21, 21, 21)');
    fixture.nativeElement.remove();
  });
});
