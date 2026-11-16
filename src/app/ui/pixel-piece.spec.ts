import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PixelPiece } from '../core/pixel-gallery';
import { pieceLayout } from '../core/pixel-gallery-view';
import { PixelPieceCard } from './pixel-piece';

/** Uma obra na Mostra: cada jeito no material dele, e as contas da Miçanga numa placa clara (a parede é escura). */
describe('a obra na Mostra da galeria de pixel arts', () => {
  const at = '2026-11-16T10:00:00.000Z';
  const piece = (look: string): PixelPiece => ({ id: 'obra-' + look, title: 'Sol', art: ['3x3', '010/111/010', look], createdAt: at, at });

  afterEach(() => TestBed.resetTestingModule());

  function make(look: string): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PixelPieceCard);
    fixture.componentRef.setInput('piece', piece(look));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('a Miçanga pousa na placa clara, torta pelo id como o papel; as contas ficam retas nela', () => {
    const el = make('micanga');
    const board = el.querySelector('.placa')!;
    expect(board.querySelector('app-pixel-art .contas')).not.toBeNull();
    expect(getComputedStyle(board).backgroundColor).toBe('rgb(227, 222, 211)');
    expect(getComputedStyle(el.querySelector('.placa .desenho')!).rotate).toBe('none');
    expect(pieceLayout(piece('micanga')).tilt).not.toBe(pieceLayout(piece('lego')).tilt);
    expect(pieceLayout(piece('micanga')).height).toBeGreaterThan(pieceLayout(piece('lego')).height);
  });

  it('o Voxel, os Blocos e o Lego vão direto na parede, sem papel nem placa', () => {
    for (const look of ['voxel', 'blocos', 'lego']) {
      const el = make(look);
      expect(el.querySelector('.placa')).toBeNull();
      expect(el.querySelector('.milimetrado')).toBeNull();
      expect(el.querySelector('app-pixel-art figure')!.classList).toContain('objeto');
      expect(pieceLayout(piece(look)).tilt).toBe(0);
      TestBed.resetTestingModule();
    }
  });
});
