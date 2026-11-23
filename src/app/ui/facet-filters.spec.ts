import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FilterGroup } from '../core/spending-filter';
import { FacetFilters } from './facet-filters';

const groups: FilterGroup[] = [
  {
    key: 'flow',
    title: 'Saiu ou entrou',
    desc: 'Só o que saiu, só o que entrou, ou os dois.',
    options: [
      { value: 'saida', label: 'Saídas', n: 8, on: true },
      { value: 'entrada', label: 'Entradas', n: 0, on: false },
    ],
  },
  { key: 'category', title: 'Categoria', desc: 'Os envelopes do mês.', options: [{ value: 'comida', label: 'Comida', n: 2, on: false, color: 'laranja' }] },
];

describe('A folha de filtros em linhas (Gastos e Dicionário)', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('uma linha por filtro, com o nome, o que faz e os recortes com quantos mostram', () => {
    const f = TestBed.createComponent(FacetFilters<FilterGroup['key']>);
    f.componentRef.setInput('groups', groups);
    f.componentRef.setInput('shown', 8);
    f.componentRef.setInput('total', 12);
    f.componentRef.setInput('units', ['lançamento', 'lançamentos']);
    f.componentRef.setInput('label', 'Filtros da fita');
    f.componentRef.setInput('active', true);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    const linhas = [...el.querySelectorAll('.linha')];
    expect(linhas.map((l) => l.querySelector('.linha-titulo')!.textContent!.trim())).toEqual(['Saiu ou entrou', 'Categoria']);
    expect(linhas.every((l) => !!l.querySelector('.linha-desc')!.textContent!.trim())).toBeTrue();
    const recortes = [...el.querySelectorAll<HTMLElement>('.recorte')];
    expect(recortes.map((r) => [r.querySelector('.recorte-nome')!.textContent!.trim(), r.classList.contains('zero'), r.querySelector('input')!.checked])).toEqual([
      ['Saídas', false, true],
      ['Entradas', true, false],
      ['Comida', false, false],
    ]);
    expect(recortes[2].querySelector('.selo')).not.toBeNull();
    expect(el.querySelector('.conta')!.textContent!.trim()).toBe('Mostrando 8 de 12 lançamentos');
    expect(el.getAttribute('aria-label')).toBe('Filtros da fita');
    // cada linha é nomeada pelo título dela, com ids que não se repetem entre folhas
    const id = linhas[0].getAttribute('aria-labelledby')!;
    expect(el.querySelector('#' + id)!.textContent!.trim()).toBe('Saiu ou entrou');

    const got: unknown[] = [];
    f.componentInstance.toggle.subscribe((t) => got.push(t));
    recortes[2].querySelector('input')!.click();
    expect(got).toEqual([{ key: 'category', value: 'comida' }]);
  });
});
