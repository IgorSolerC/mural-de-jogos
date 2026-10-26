import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Facet } from '../core/wall-filter';
import { FilterSheet } from './filter-sheet';

const facets: Facet[] = [
  {
    key: 'status',
    title: 'Status',
    options: [
      { value: 'finalizado', label: 'Finalizado', n: 3, on: true },
      { value: 'incompleto', label: 'Incompleto', n: 0, on: false },
    ],
  },
  { key: 'grade', title: 'Média', options: [{ value: '9', label: '9 ou mais', n: 1, on: false }] },
];

describe('Análises: a folha de filtros', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('as linhas dos filtros das Anotações: nome, o que faz, recortes com quantas mostram', () => {
    const f = TestBed.createComponent(FilterSheet);
    f.componentRef.setInput('facets', facets);
    f.componentRef.setInput('kind', 'jogos');
    f.componentRef.setInput('summary', 'Mostrando 3 de 5 jogos');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect([...el.querySelectorAll('.linha-titulo')].map((t) => t.textContent!.trim())).toEqual(['Status', 'Média']);
    expect(el.querySelectorAll('.linha-desc').length).toBe(2);
    const recortes = [...el.querySelectorAll<HTMLElement>('.recorte')];
    expect(recortes.map((r) => [r.classList.contains('zero'), r.querySelector('input')!.checked])).toEqual([
      [false, true],
      [true, false],
      [false, false],
    ]);
    // a faixa da Média mostra o número curto e diz o nome inteiro ao leitor de tela
    expect(recortes[2].querySelector('.nota')!.textContent!.trim()).toBe('9+');
    expect(recortes[2].textContent).toContain('9 ou mais');
    expect(el.querySelector('.acao-caneta')!.textContent!.trim()).toBe('Limpar tudo');

    const got: unknown[] = [];
    f.componentInstance.toggle.subscribe((t) => got.push(t));
    recortes[1].querySelector('input')!.click();
    expect(got).toEqual([{ key: 'status', value: 'incompleto' }]);
  });
});
