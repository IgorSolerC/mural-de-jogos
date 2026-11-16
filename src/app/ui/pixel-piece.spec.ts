import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PixelPiece } from '../core/pixel-gallery';
import { PixelPieceCard } from './pixel-piece';

/**
 * Uma obra na Mostra: cada jeito no material dele, todas num quadrado do mesmo tamanho, sem papel milimetrado nem
 * margem (pedido do dono, 16/nov); só as contas da Miçanga pousam numa placa clara (a parede é escura).
 */
describe('a obra na Mostra da galeria de pixel arts', () => {
  const at = '2026-11-16T10:00:00.000Z';
  const piece = (look: string, art = ['3x3', '010/111/010', look]): PixelPiece => ({ id: 'obra-' + look, title: 'Sol', art, createdAt: at, at });
  let el: HTMLElement | null = null;

  function reset(): void {
    el?.remove();
    el = null;
    TestBed.resetTestingModule();
  }
  afterEach(reset);

  function make(p: PixelPiece): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PixelPieceCard);
    fixture.componentRef.setInput('piece', p);
    el = fixture.nativeElement as HTMLElement;
    el.style.width = '200px';
    document.body.appendChild(el);
    fixture.detectChanges();
    return el;
  }

  it('o Pixel vai direto na parede: sem papel milimetrado, sem tachinha, sem margem, reto', () => {
    const host = make(piece('pixel'));
    expect(host.querySelector('.milimetrado, app-pin')).toBeNull();
    const box = host.querySelector('.quadro')!.getBoundingClientRect();
    expect(Math.round(box.width)).toBe(200);
    expect(Math.round(box.height)).toBe(200);
    const art = host.querySelector('svg.arte')!.getBoundingClientRect();
    expect(Math.round(art.width)).toBe(200);
    expect(Math.round(art.height)).toBe(200);
    expect(getComputedStyle(host.querySelector('.quadro')!).backgroundImage).toBe('none');
  });

  it('o desenho largo ocupa a largura e o alto ocupa a altura, no meio do mesmo quadrado', () => {
    const wide = make(piece('pixel', ['4x2', '1111/1111']));
    const box = wide.querySelector('.quadro')!.getBoundingClientRect();
    const a = wide.querySelector('svg.arte')!.getBoundingClientRect();
    expect(Math.round(box.height)).toBe(200);
    expect(Math.round(a.width)).toBe(200);
    expect(Math.round(a.height)).toBe(100);
    expect(Math.round(a.top - box.top)).toBe(50);
    reset();
    const tall = make(piece('pixel', ['2x4', '11/11/11/11']));
    const box2 = tall.querySelector('.quadro')!.getBoundingClientRect();
    const b = tall.querySelector('svg.arte')!.getBoundingClientRect();
    expect(Math.round(box2.height)).toBe(200);
    expect(Math.round(b.height)).toBe(200);
    expect(Math.round(b.width)).toBe(100);
    expect(Math.round(b.left - box2.left)).toBe(50);
  });

  it('a Miçanga pousa na placa clara, reta; as contas ficam retas nela', () => {
    const host = make(piece('micanga'));
    const board = host.querySelector('.placa')!;
    expect(board.querySelector('app-pixel-art .contas')).not.toBeNull();
    expect(getComputedStyle(board).backgroundColor).toBe('rgb(227, 222, 211)');
    expect(getComputedStyle(board).rotate).toBe('none');
    expect(getComputedStyle(host.querySelector('.placa .desenho')!).rotate).toBe('none');
  });

  it('os objetos (Figurinha, Ponto-cruz, Voxel, Blocos e Lego) vão direto na parede, retos, sem papel nem placa', () => {
    for (const look of ['figurinha', 'ponto-cruz', 'voxel', 'blocos', 'lego']) {
      const host = make(piece(look));
      expect(host.querySelector('.placa')).toBeNull();
      expect(host.querySelector('.milimetrado')).toBeNull();
      expect(getComputedStyle(host.querySelector('.desenho')!).rotate).toBe('none');
      reset();
    }
  });
});
