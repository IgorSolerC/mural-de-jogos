import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BOTTONS, PARTES_DO_SITE, SECOES_DAS_UTILIDADES } from '../../../../../shared/topo-do-murall';
import { Topo } from './topo';

describe('o topo do cofre', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function montar(): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Topo);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const textos = (el: HTMLElement, seletor: string) => [...el.querySelectorAll<HTMLElement>(seletor)].map((a) => a.textContent!.trim());
  const enderecos = (el: HTMLElement, seletor: string) => [...el.querySelectorAll<HTMLAnchorElement>(seletor)].map((a) => a.getAttribute('href'));

  it('o varal: as partes do site, da mesma lista do topo do Murall, com as Utilidades marcadas', async () => {
    const el = await montar();
    expect(textos(el, '.etiqueta')).toEqual(PARTES_DO_SITE.map((p) => p.label));
    expect(enderecos(el, '.etiqueta')).toEqual([
      'https://murall.igorsc.com.br/#/anotacoes',
      'https://murall.igorsc.com.br/#/analises',
      'https://murall.igorsc.com.br/#/utilidades',
      'https://murall.igorsc.com.br/#/extras',
    ]);
    expect(textos(el, '.etiqueta.on')).toEqual(['Utilidades']);
  });

  it('os bottons: Perfil com uma pessoa no lugar da foto, Amigos sem número, Ajustes', async () => {
    const el = await montar();
    expect(textos(el, '.botton .legenda')).toEqual(BOTTONS.map((b) => b.label));
    expect(enderecos(el, '.botton')).toEqual(['https://murall.igorsc.com.br/#/perfil', 'https://murall.igorsc.com.br/#/amigos', 'https://murall.igorsc.com.br/#/ajustes']);
    const desenhos = [...el.querySelectorAll('.botton svg.desenho')];
    expect(desenhos.length).toBe(3);
    // a pessoa do Perfil: a cabeça e os ombros
    expect([...desenhos[0]!.children].map((c) => c.tagName)).toEqual(['circle', 'path']);
    expect(el.querySelector('.selo, .emoji, .foto')).toBeNull();
    expect(el.querySelector('.adicionar')).toBeNull();
  });

  it('a fileira das seções, da mesma lista da barra do Murall, com o Cofre marcado no fim, e o logo do Cofre', async () => {
    const el = await montar();
    expect(textos(el, '.secao')).toEqual([...SECOES_DAS_UTILIDADES.map((s) => s.label), 'Cofre']);
    expect(enderecos(el, '.secao')).toEqual(['https://murall.igorsc.com.br/#/utilidades/gastos', 'https://cofre.murall.igorsc.com.br/']);
    expect(textos(el, '[aria-current="page"]')).toEqual(['Cofre']);
    expect(el.querySelector('.logo-cofre')!.textContent!.trim()).toBe('Cofre');
  });

  it('o cartaz leva de volta ao Murall; os links para fora não levam o endereço daqui nem abrem outra aba', async () => {
    const el = await montar();
    const cartaz = el.querySelector<HTMLAnchorElement>('.logo-link')!;
    expect(cartaz.getAttribute('href')).toBe('https://murall.igorsc.com.br/');
    expect(cartaz.getAttribute('aria-label')).toBe('Murall');
    const fora = [...el.querySelectorAll<HTMLAnchorElement>('a')].filter((a) => !a.classList.contains('on') || a.classList.contains('etiqueta'));
    expect(fora.length).toBe(1 + 4 + 3 + 1);
    expect(fora.every((a) => a.getAttribute('rel') === 'noreferrer' && !a.hasAttribute('target'))).toBe(true);
  });
});
