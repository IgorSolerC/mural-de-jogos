import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { inkPaths } from '../core/pixel-art';
import { PixelArt } from './pixel-art';

/** O desenho da pixel art na leitura: um caminho por cor, os quatro jeitos e o lugar vazio. */
describe('pixel art (o desenho)', () => {
  function make(args: string[]): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(PixelArt);
    f.componentRef.setInput('args', args);
    f.detectChanges();
    return f.nativeElement;
  }
  afterEach(() => TestBed.resetTestingModule());

  it('um caminho por cor, juntando a sequência da fileira num retângulo só', () => {
    const paths = inkPaths(['1120', '0003'], 'pixel');
    expect(paths.map((p) => p.ink)).toEqual([1, 2, 3]);
    expect(paths[0].d).toBe('M0 0h2v1h-2z');
    expect(paths[2].d).toBe('M3 1h1v1h-1z');
  });

  it('pinta cada cor da paleta, com o transparente de fora, e diz o que é para quem não vê', () => {
    const el = make(['3x2', '120/003', 'Teste']);
    const svg = el.querySelector('svg.arte')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 3 2');
    expect(svg.getAttribute('aria-label')).toBe('Pixel art: Teste');
    const fills = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('fill'));
    expect(fills).toEqual(['#1d1b22', '#f7f3e8', '#8a8791']);
    expect(el.querySelector('.legenda')!.textContent!.trim()).toBe('Teste');
    expect(el.querySelector('app-zoom-knob')).not.toBeNull();
  });

  it('os jeitos: a figurinha com o recorte, o ponto-cruz no pano, a miçanga na placa', () => {
    const sticker = make(['2x2', '11/11', 'figurinha']);
    expect(sticker.querySelector('filter feMorphology')).not.toBeNull();
    expect(sticker.querySelector('svg.arte')!.getAttribute('viewBox')).toBe('-1 -1 4 4');
    TestBed.resetTestingModule();
    const stitch = make(['2x2', '11/11', 'ponto-cruz']);
    expect(stitch.querySelector('rect.pano')).not.toBeNull();
    expect(stitch.querySelector('.linha path')!.getAttribute('stroke')).toBe('#1d1b22');
    TestBed.resetTestingModule();
    const beads = make(['2x2', '11/11', 'micanga']);
    expect(beads.querySelector('rect.placa')).not.toBeNull();
    expect(beads.querySelector('.contas path')).not.toBeNull();
    expect(beads.querySelector('figure')!.hasAttribute('data-papel-proprio')).toBeTrue();
  });

  it('sem ponto nenhum: o lugar tracejado, dizendo como escrever', () => {
    const el = make(['4x4', '0000']);
    expect(el.querySelector('svg.arte')).toBeNull();
    expect(el.querySelector('.vazio')!.textContent).toContain('Pixel art sem pontos');
  });

  it('no Visual, a legenda vira o campo da peça', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(PixelArt);
    f.componentRef.setInput('args', ['1x1', '1']);
    f.componentRef.setInput('editavel', true);
    f.detectChanges();
    const input = f.nativeElement.querySelector('input.campo-peca[data-campo="caption"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.placeholder).toBe('Escreva uma legenda');
  });
});
