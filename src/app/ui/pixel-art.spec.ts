import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beadPaths, inkPaths, stitchFills, voxelBox } from '../core/pixel-art';
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

  it('os jeitos: a figurinha com o recorte, o ponto-cruz no pano, as contas, os cubinhos, os blocos e o lego', () => {
    const sticker = make(['2x2', '11/11', 'figurinha']);
    expect(sticker.querySelector('filter feMorphology')).not.toBeNull();
    expect(sticker.querySelector('svg.arte')!.getAttribute('viewBox')).toBe('-1 -1 4 4');
    expect(sticker.querySelector('figure')!.classList).not.toContain('objeto');
    TestBed.resetTestingModule();
    // o bordado: o pano, as pernas de baixo antes das de cima, na cor do ponto, e os fios por cima
    const stitch = make(['2x2', '12/11', 'ponto-cruz']);
    expect(stitch.querySelector('rect.pano')!.getAttribute('fill')).toMatch(/^url\(#pl-\d+-pano\)$/);
    expect([...stitch.querySelectorAll('.linha path')].map((p) => p.getAttribute('fill'))).toEqual(['#1d1b22', '#f7f3e8', '#1d1b22', '#f7f3e8']);
    expect(stitch.querySelector('path.luz')!.getAttribute('fill')).toMatch(/-fio\)$/);
    expect(stitch.querySelector('figure')!.hasAttribute('data-papel-proprio')).toBeTrue();
    expect(stitch.querySelector('figure')!.classList).toContain('objeto');
    TestBed.resetTestingModule();
    // entre os pontos iguais, a linha tapa o pano (o losango, mais fundo), antes das pernas
    const filled = [...stitch.querySelectorAll('svg.arte > g > :not(defs)')].map((e) => e.getAttribute('class'));
    expect(filled.slice(0, 3)).toEqual(['pano', 'linha-funda', 'funda']);
    expect([...stitch.querySelectorAll('.linha-funda path')].map((p) => p.getAttribute('fill'))).toEqual(['#1d1b22']);
    expect(stitch.querySelector('path.funda')!.getAttribute('d')).toBe(stitchFills(['12', '11'])[0].d);
    TestBed.resetTestingModule();
    // a miçanga: as contas furadas (pelo sentido do furo, nonzero) e derretidas nas iguais, e o brilho por cima de tudo, sem placa
    const beads = make(['2x2', '11/11', 'micanga']);
    expect(beads.querySelector('.contas')!.getAttribute('fill-rule')).toBeNull();
    const bead = beads.querySelector('.contas path')!.getAttribute('d')!;
    expect(bead).toBe(beadPaths(['11', '11'])[0].d);
    expect(beads.querySelector('path.luz')!.getAttribute('d')).toBe(bead);
    expect(beads.querySelector('path.luz')!.getAttribute('fill')).toMatch(/-conta\)$/);
    expect(beads.querySelector('svg.arte > g > rect')).toBeNull();
    TestBed.resetTestingModule();
    // o voxel: girado no espaço, os lados (o alto claro, o direito escuro) debaixo da frente, sem risco entre os cubinhos; reto na cartolina
    const voxel = make(['2x2', '11/1', 'voxel']);
    const order = [...voxel.querySelectorAll('svg.arte > g > :not(defs)')].map((p) => p.getAttribute('class'));
    expect(order).toEqual(['lados', 'topo', 'lado', 'frente', 'luz']);
    const box = voxelBox(2, 2);
    expect(voxel.querySelector('svg.arte')!.getAttribute('viewBox')).toBe(`${box.x} ${box.y} ${box.w} ${box.h}`);
    // a luz da frente é uma só, sem padrão de 1 × 1 que desenhe a grade
    expect(voxel.querySelector('pattern')).toBeNull();
    expect(voxel.querySelector('path.luz')!.getAttribute('fill')).toMatch(/-face\)$/);
    // a frente e os lados no traço da própria cor (tapa a fresta entre cores, nunca um risco escuro)
    for (const p of voxel.querySelectorAll('.lados path, .frente path')) expect(p.getAttribute('stroke')).toBe(p.getAttribute('fill'));
    expect(voxel.querySelector('figure')!.style.getPropertyValue('--giro')).toBe('0deg');
    TestBed.resetTestingModule();
    for (const [look, tile] of [
      ['blocos', '-bloco'],
      ['lego', '-peca'],
    ]) {
      const el = make(['2x1', '12', look]);
      expect([...el.querySelectorAll('svg.arte > g > path:not(.luz)')].map((p) => p.getAttribute('fill'))).toEqual(['#1d1b22', '#f7f3e8']);
      expect(el.querySelector('path.luz')!.getAttribute('d')).toBe('M0 0h2v1h-2z');
      expect(el.querySelector('path.luz')!.getAttribute('fill')).toContain(tile);
      TestBed.resetTestingModule();
    }
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
