import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SECOES_DAS_ANOTACOES } from '../../../../../shared/secoes-das-anotacoes';
import { Topo } from './topo';

describe('o topo do cofre', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function montar(): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Topo);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('a fileira sai da mesma lista da barra do Murall, com o Cofre marcado no fim', async () => {
    const el = await montar();
    const secoes = [...el.querySelectorAll<HTMLAnchorElement>('.secao')];
    expect(secoes.map((a) => a.textContent!.trim())).toEqual([...SECOES_DAS_ANOTACOES.map((s) => s.label), 'Cofre']);
    expect(secoes.map((a) => a.getAttribute('href'))).toEqual([
      'https://murall.igorsc.com.br/#/anotacoes',
      'https://murall.igorsc.com.br/#/anotacoes/kanban',
      'https://murall.igorsc.com.br/#/anotacoes/calendario',
      'https://cofre.murall.igorsc.com.br/',
    ]);
    expect(secoes.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent!.trim())).toEqual(['Cofre']);
  });

  it('o cartaz leva de volta ao Murall; os links para fora não levam o endereço daqui nem abrem outra aba', async () => {
    const el = await montar();
    const cartaz = el.querySelector<HTMLAnchorElement>('.logo-link')!;
    expect(cartaz.getAttribute('href')).toBe('https://murall.igorsc.com.br/');
    expect(cartaz.getAttribute('aria-label')).toBe('Murall');
    const fora = [cartaz, ...el.querySelectorAll<HTMLAnchorElement>('.secao:not(.on)')];
    expect(fora.every((a) => a.getAttribute('rel') === 'noreferrer' && !a.hasAttribute('target'))).toBe(true);
  });
});
